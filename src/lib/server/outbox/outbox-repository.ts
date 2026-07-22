import { hashCanonical } from '$lib/server/import/canonical';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import type { AdminActor } from '$lib/server/security/authorization';
import type {
	AdminOutboxRow,
	EmailOutboxRow,
	OutboxChannel,
	OutboxClaimInput,
	OutboxFailureInput,
	OutboxStatus,
	OutboxStore,
	TelegramOutboxRow,
} from './contracts';

const ACTIVE_ADMIN = `EXISTS (
	SELECT 1 FROM users admin WHERE admin.id = ? AND admin.role = 'admin'
		AND admin.account_status = 'active' AND admin.is_blocked = 0
)`;

const validEmailRecipient = `u.account_status = 'active' AND u.is_blocked = 0
	AND CASE o.recipient_address_kind
		WHEN 'legacy' THEN legacy_email.email_raw IS NOT NULL
		WHEN 'pending' THEN u.pending_email IS NOT NULL
		ELSE u.email IS NOT NULL
	END
	AND (o.source_kind <> 'auth_token' OR (
		t.used_at IS NULL AND t.expires_at > ?
		AND ((o.recipient_address_kind = 'current'
			AND t.target_email_normalized = u.email_normalized
			AND t.email_version = u.email_version)
		OR (o.recipient_address_kind = 'pending'
			AND t.target_email_normalized = u.pending_email_normalized
			AND t.email_version = u.email_version)
		OR (o.recipient_address_kind = 'legacy'
			AND t.kind = 'legacy_email_claim' AND t.user_id = u.id
			AND t.family_version = u.family_version
			AND t.legacy_family_id = legacy_email.legacy_family_id
			AND t.target_email_normalized = legacy_email.email_normalized
			AND legacy_email.is_current = 1))))`;

export class OutboxRepositoryError extends Error {
	constructor(readonly code: string, options?: { cause?: unknown }) {
		super(code, options);
		this.name = 'OutboxRepositoryError';
	}
}

function assertInstant(value: string): void {
	if (Number.isNaN(Date.parse(value)) || !value.endsWith('Z')) {
		throw new OutboxRepositoryError('INVALID_UTC_INSTANT');
	}
}

export class OutboxRepository implements OutboxStore {
	constructor(private readonly db: DatabaseBoundary) {}

	async cancelInvalidEmailRows(now: string): Promise<number> {
		assertInstant(now);
		const result = await this.db.run({
			sql: `UPDATE email_outbox AS o SET status = 'cancelled', locked_at = NULL,
				lease_owner = NULL, lease_until = NULL, updated_at = ?
			WHERE o.status IN ('pending', 'retry') AND EXISTS (
				SELECT 1 FROM users u
				LEFT JOIN legacy_family_emails legacy_email
					ON legacy_email.id = o.recipient_legacy_email_id
				LEFT JOIN auth_tokens t
					ON o.source_kind = 'auth_token' AND t.id = o.source_id
				WHERE u.id = o.recipient_user_id
					AND COALESCE((${validEmailRecipient}), 0) = 0
			)`,
			params: [now, now],
		});
		return result.meta.changes ?? 0;
	}

	async claimEmail(input: OutboxClaimInput): Promise<EmailOutboxRow | null> {
		assertInstant(input.now);
		assertInstant(input.leaseUntil);
		const candidate = await this.db.first<{ id: string }>({
			sql: `SELECT o.id FROM email_outbox o
			JOIN users u ON u.id = o.recipient_user_id
			LEFT JOIN legacy_family_emails legacy_email
				ON legacy_email.id = o.recipient_legacy_email_id
			LEFT JOIN auth_tokens t
				ON o.source_kind = 'auth_token' AND t.id = o.source_id
			WHERE ((o.status IN ('pending', 'retry')
					AND o.not_before <= ?
					AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?))
				OR (o.status = 'processing' AND o.lease_until <= ?))
				AND ${validEmailRecipient}
			ORDER BY o.created_at, o.id LIMIT 1`,
			params: [input.now, input.now, input.now, input.now],
		});
		if (!candidate) return null;
		const claimed = await this.db.run({
			sql: `UPDATE email_outbox SET status = 'processing', locked_at = ?,
				lease_owner = ?, lease_until = ?, updated_at = ?
			WHERE id = ? AND ((status IN ('pending', 'retry')
					AND not_before <= ?
					AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
				OR (status = 'processing' AND lease_until <= ?))`,
			params: [input.now, input.leaseOwner, input.leaseUntil, input.now,
				candidate.id, input.now, input.now, input.now],
		});
		if (claimed.meta.changes !== 1) return null;
		return this.db.first<EmailOutboxRow>({
			sql: `SELECT o.id, o.source_kind, o.source_id, o.template_or_category,
				o.recipient_address_kind, o.locale, o.payload_json, o.dedupe_key,
				o.attempts, o.max_attempts, o.recipient_user_id AS user_id,
				o.lease_owner,
				CASE o.recipient_address_kind
					WHEN 'legacy' THEN legacy_email.email_raw
					WHEN 'pending' THEN u.pending_email ELSE u.email END AS email,
				t.id AS token_id, t.kind AS token_kind
			FROM email_outbox o JOIN users u ON u.id = o.recipient_user_id
			LEFT JOIN legacy_family_emails legacy_email
				ON legacy_email.id = o.recipient_legacy_email_id
			LEFT JOIN auth_tokens t
				ON o.source_kind = 'auth_token' AND t.id = o.source_id
			WHERE o.id = ? AND o.status = 'processing' AND o.lease_owner = ?`,
			params: [candidate.id, input.leaseOwner],
		});
	}

	async markEmailSent(input: {
		id: string;
		leaseOwner: string;
		providerRequestId: string;
		now: string;
	}): Promise<boolean> {
		const result = await this.db.run({
			sql: `UPDATE email_outbox SET status = 'sent', sent_at = ?,
				provider_request_id = ?, attempts = attempts + 1,
				last_error_code = NULL, next_attempt_at = NULL, locked_at = NULL,
				lease_owner = NULL, lease_until = NULL, updated_at = ?
			WHERE id = ? AND status = 'processing' AND lease_owner = ?`,
			params: [input.now, input.providerRequestId.slice(0, 200), input.now,
				input.id, input.leaseOwner],
		});
		return result.meta.changes === 1;
	}

	async markEmailFailed(input: OutboxFailureInput): Promise<'retry' | 'dead' | 'lost_lease'> {
		return this.markFailed('email_outbox', input);
	}

	async claimTelegram(input: OutboxClaimInput): Promise<TelegramOutboxRow | null> {
		assertInstant(input.now);
		assertInstant(input.leaseUntil);
		const candidate = await this.db.first<{ id: string }>({
			sql: `SELECT id FROM telegram_outbox
			WHERE ((status IN ('pending', 'retry') AND not_before <= ?
					AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
				OR (status = 'processing' AND lease_until <= ?))
			ORDER BY created_at, id LIMIT 1`,
			params: [input.now, input.now, input.now],
		});
		if (!candidate) return null;
		const claimed = await this.db.run({
			sql: `UPDATE telegram_outbox SET status = 'processing', locked_at = ?,
				lease_owner = ?, lease_until = ?, updated_at = ?
			WHERE id = ? AND ((status IN ('pending', 'retry') AND not_before <= ?
					AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
				OR (status = 'processing' AND lease_until <= ?))`,
			params: [input.now, input.leaseOwner, input.leaseUntil, input.now,
				candidate.id, input.now, input.now, input.now],
		});
		if (claimed.meta.changes !== 1) return null;
		return this.db.first<TelegramOutboxRow>({
			sql: `SELECT id, source_kind, source_id, template_or_category,
				destination_ref, locale, payload_json, dedupe_key, attempts,
				max_attempts, lease_owner
			FROM telegram_outbox
			WHERE id = ? AND status = 'processing' AND lease_owner = ?`,
			params: [candidate.id, input.leaseOwner],
		});
	}

	async deferTelegram(input: {
		id: string;
		leaseOwner: string;
		notBefore: string;
		now: string;
	}): Promise<boolean> {
		const result = await this.db.run({
			sql: `UPDATE telegram_outbox SET status = 'retry', not_before = ?,
				next_attempt_at = ?, locked_at = NULL, lease_owner = NULL,
				lease_until = NULL, updated_at = ?
			WHERE id = ? AND status = 'processing' AND lease_owner = ?`,
			params: [input.notBefore, input.notBefore, input.now, input.id, input.leaseOwner],
		});
		return result.meta.changes === 1;
	}

	async markTelegramSent(input: {
		id: string;
		leaseOwner: string;
		providerRequestId: string;
		now: string;
	}): Promise<boolean> {
		const result = await this.db.run({
			sql: `UPDATE telegram_outbox SET status = 'sent', sent_at = ?,
				provider_request_id = ?, attempts = attempts + 1,
				last_error_code = NULL, next_attempt_at = NULL, locked_at = NULL,
				lease_owner = NULL, lease_until = NULL, updated_at = ?
			WHERE id = ? AND status = 'processing' AND lease_owner = ?`,
			params: [input.now, input.providerRequestId.slice(0, 200), input.now,
				input.id, input.leaseOwner],
		});
		return result.meta.changes === 1;
	}

	async markTelegramFailed(input: OutboxFailureInput): Promise<'retry' | 'dead' | 'lost_lease'> {
		return this.markFailed('telegram_outbox', input);
	}

	private async markFailed(
		table: 'email_outbox' | 'telegram_outbox',
		input: OutboxFailureInput
	): Promise<'retry' | 'dead' | 'lost_lease'> {
		const targetStatus = input.permanent ? 'dead' : 'retry';
		const result = await this.db.run({
			sql: `UPDATE ${table} SET
				status = CASE WHEN ? = 1 OR attempts + 1 >= max_attempts THEN 'dead' ELSE 'retry' END,
				attempts = attempts + 1, last_error_code = ?, locked_at = NULL,
				lease_owner = NULL, lease_until = NULL,
				next_attempt_at = CASE WHEN ? = 1 OR attempts + 1 >= max_attempts
					THEN NULL ELSE ? END, updated_at = ?
			WHERE id = ? AND status = 'processing' AND lease_owner = ?`,
			params: [Number(input.permanent), input.errorCode,
				Number(input.permanent), input.nextAttemptAt, input.now,
				input.id, input.leaseOwner],
		});
		if (result.meta.changes !== 1) return 'lost_lease';
		if (targetStatus === 'dead') return 'dead';
		const row = await this.db.first<{ status: 'retry' | 'dead' }>({
			sql: `SELECT status FROM ${table} WHERE id = ?`,
			params: [input.id],
		});
		return row?.status ?? 'lost_lease';
	}

	async listAdmin(input: {
		channel?: '' | OutboxChannel;
		status?: '' | OutboxStatus;
		q?: string;
	}): Promise<AdminOutboxRow[]> {
		const channel = input.channel ?? '';
		const status = input.status ?? '';
		const q = (input.q ?? '').trim().toLowerCase();
		const rows = await this.db.all<{
			channel: OutboxChannel;
			id: string;
			source_kind: string;
			source_id: string;
			template_or_category: string;
			status: OutboxStatus;
			attempts: number;
			max_attempts: number;
			not_before: string;
			next_attempt_at: string | null;
			last_error_code: string | null;
			lease_until: string | null;
			sent_at: string | null;
			created_at: string;
			updated_at: string;
		}>({
			sql: `SELECT * FROM (
				SELECT 'email' AS channel, id, source_kind, source_id,
					template_or_category, status, attempts, max_attempts, not_before,
					next_attempt_at, last_error_code, lease_until, sent_at, created_at,
					COALESCE(updated_at, created_at) AS updated_at
				FROM email_outbox
				UNION ALL
				SELECT 'telegram' AS channel, id, source_kind, source_id,
					template_or_category, status, attempts, max_attempts, not_before,
					next_attempt_at, last_error_code, lease_until, sent_at, created_at,
					updated_at FROM telegram_outbox
			) queue
			WHERE (? = '' OR channel = ?) AND (? = '' OR status = ?)
				AND (? = '' OR lower(id) LIKE ? OR lower(source_id) LIKE ?
					OR lower(template_or_category) LIKE ? OR lower(last_error_code) LIKE ?)
			ORDER BY CASE status WHEN 'dead' THEN 1 WHEN 'retry' THEN 2
				WHEN 'pending' THEN 3 WHEN 'processing' THEN 4 ELSE 5 END,
				created_at DESC, id DESC LIMIT 200`,
			params: [channel, channel, status, status, q,
				`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`],
		});
		return rows.results.map((row) => ({
			channel: row.channel,
			id: row.id,
			sourceKind: row.source_kind,
			sourceId: row.source_id,
			templateOrCategory: row.template_or_category,
			status: row.status,
			attempts: row.attempts,
			maxAttempts: row.max_attempts,
			notBefore: row.not_before,
			nextAttemptAt: row.next_attempt_at,
			lastErrorCode: row.last_error_code,
			leaseUntil: row.lease_until,
			sentAt: row.sent_at,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));
	}

	private async actionReplay(
		actorId: string,
		idempotencyKey: string,
		requestHash: string
	): Promise<boolean> {
		const prior = await this.db.first<{ request_hash_sha256: string }>({
			sql: `SELECT request_hash_sha256 FROM outbox_admin_actions
			WHERE actor_user_id = ? AND idempotency_key = ?`,
			params: [actorId, idempotencyKey],
		});
		if (!prior) return false;
		if (prior.request_hash_sha256 !== requestHash) {
			throw new OutboxRepositoryError('IDEMPOTENCY_KEY_REUSED');
		}
		return true;
	}

	async adminAction(input: {
		admin: AdminActor;
		channel: OutboxChannel;
		outboxId: string;
		action: 'retry' | 'cancel';
		idempotencyKey: string;
		requestId: string;
		now: string;
		additionalAttempts: number;
	}): Promise<{ replayed: boolean }> {
		assertInstant(input.now);
		if (input.outboxId.length === 0 || input.outboxId.length > 300
			|| input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200
			|| !Number.isSafeInteger(input.additionalAttempts) || input.additionalAttempts < 1) {
			throw new OutboxRepositoryError('OUTBOX_ADMIN_ACTION_INVALID');
		}
		const requestHash = await hashCanonical({
			channel: input.channel,
			outboxId: input.outboxId,
			action: input.action,
		});
		if (await this.actionReplay(input.admin.id, input.idempotencyKey, requestHash)) {
			return { replayed: true };
		}
		const table = input.channel === 'email' ? 'email_outbox' : 'telegram_outbox';
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const resultingStatus = input.action === 'retry' ? 'retry' : 'cancelled';
		const mutation: StatementSpec = input.action === 'retry'
			? {
					sql: `UPDATE ${table} SET status = 'retry',
						max_attempts = attempts + ?, next_attempt_at = ?,
						locked_at = NULL, lease_owner = NULL, lease_until = NULL,
						manual_retry_count = manual_retry_count + 1, updated_at = ?
					WHERE id = ? AND status = 'dead' AND ${ACTIVE_ADMIN}`,
					params: [input.additionalAttempts, input.now, input.now,
						input.outboxId, input.admin.id],
				}
			: {
					sql: `UPDATE ${table} SET status = 'cancelled', next_attempt_at = NULL,
						locked_at = NULL, lease_owner = NULL, lease_until = NULL,
						updated_at = ?
					WHERE id = ? AND status IN ('pending', 'retry') AND ${ACTIVE_ADMIN}`,
					params: [input.now, input.outboxId, input.admin.id],
				};
		const statements: StatementSpec[] = [
			mutation,
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
				SELECT ?, ?, 'user', ?, 'outbox_event', ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND status = ?)
					AND ${ACTIVE_ADMIN}`,
				params: [auditId, input.admin.id, `outbox.${input.channel}.${input.action}`,
					input.outboxId, input.requestId,
					JSON.stringify({ channel: input.channel, status: resultingStatus }), input.now,
					input.outboxId, resultingStatus, input.admin.id],
			},
			{
				sql: `INSERT INTO outbox_admin_actions
					(id, channel, outbox_id, action, actor_user_id, idempotency_key,
					 request_hash_sha256, result_ref, audit_event_id, created_at)
				SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
				params: [actionId, input.channel, input.outboxId, input.action,
					input.admin.id, input.idempotencyKey, requestHash,
					`${input.channel}:${input.outboxId}:${resultingStatus}`, auditId,
					input.now, auditId],
			},
			{
				sql: `INSERT INTO outbox_action_assertions
					(id, action_id, assertion_passed, created_at)
				VALUES (?, ?, CASE WHEN
					EXISTS (SELECT 1 FROM outbox_admin_actions WHERE id = ?)
					AND EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND status = ?)
				THEN 1 ELSE 0 END, ?)`,
				params: [crypto.randomUUID(), actionId, actionId,
					input.outboxId, resultingStatus, input.now],
			},
		];
		try {
			await this.db.batch(statements);
			return { replayed: false };
		} catch (error) {
			if (await this.actionReplay(input.admin.id, input.idempotencyKey, requestHash)) {
				return { replayed: true };
			}
			throw new OutboxRepositoryError('OUTBOX_ADMIN_ACTION_REJECTED', { cause: error });
		}
	}
}

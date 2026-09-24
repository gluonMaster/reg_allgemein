import { hashCanonical } from '$lib/server/import/canonical';
import type { SqlDatabaseBoundary, StatementSpec } from '$lib/server/db/database';
import type { AdminActor } from '$lib/server/security/authorization';
import type {
	AdminOutboxRow,
	AdminOutboxStatus,
	EmailOutboxRow,
	OutboxChannel,
	OutboxClaimInput,
	OutboxFailureInput,
	OutboxStore,
	TelegramOutboxClaimInput,
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

// An unresolved ambiguous send blocks later sends to its destination until an admin decides.
// A trial-intake notification is self-contained, so it waits only for an ambiguity of its own
// request; every other source keeps the destination-wide block. The
// telegram_outbox_allowed_transition trigger (0031) enforces the same rule.
function unresolvedTelegramBlocker(row: string, select = '1'): string {
	return `SELECT ${select} FROM telegram_outbox unresolved
		JOIN telegram_delivery_attempts attempt ON attempt.outbox_id = unresolved.id
		WHERE unresolved.destination_ref = ${row}.destination_ref
			AND unresolved.status = 'delivery_unknown'
			AND attempt.state = 'delivery_unknown' AND attempt.resolved_at IS NULL
			AND NOT (${row}.source_kind = 'trial_intake'
				AND (unresolved.source_kind <> 'trial_intake'
					OR unresolved.source_id <> ${row}.source_id))`;
}

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

function assertBatchLimit(limit: number): void {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
		throw new TypeError('Outbox maintenance limit must be between 1 and 100.');
	}
}

export class OutboxRepository implements OutboxStore {
	constructor(private readonly db: SqlDatabaseBoundary) {}

	async cancelInvalidEmailRows(now: string, limit = 100): Promise<number> {
		assertInstant(now);
		assertBatchLimit(limit);
		const result = await this.db.run({
			sql: `UPDATE email_outbox AS target SET status = 'cancelled', locked_at = NULL,
				lease_owner = NULL, lease_until = NULL, updated_at = ?
			WHERE target.id IN (SELECT o.id FROM email_outbox o
			JOIN users u ON u.id = o.recipient_user_id
			LEFT JOIN legacy_family_emails legacy_email
				ON legacy_email.id = o.recipient_legacy_email_id
			LEFT JOIN auth_tokens t
				ON o.source_kind = 'auth_token' AND t.id = o.source_id
			WHERE o.status IN ('pending', 'retry')
				AND COALESCE((${validEmailRecipient}), 0) = 0
			ORDER BY o.created_at, o.id LIMIT ?)`,
			params: [now, now, limit],
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
			sql: `UPDATE email_outbox AS o SET status = 'processing', locked_at = ?,
				lease_owner = ?, lease_until = ?, updated_at = ?
			WHERE o.id = ? AND ((o.status IN ('pending', 'retry')
					AND o.not_before <= ?
					AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?))
				OR (o.status = 'processing' AND o.lease_until <= ?))
				AND EXISTS (
					SELECT 1 FROM users u
					LEFT JOIN legacy_family_emails legacy_email
						ON legacy_email.id = o.recipient_legacy_email_id
					LEFT JOIN auth_tokens t
						ON o.source_kind = 'auth_token' AND t.id = o.source_id
					WHERE u.id = o.recipient_user_id AND ${validEmailRecipient}
				)`,
			params: [input.now, input.leaseOwner, input.leaseUntil, input.now,
				candidate.id, input.now, input.now, input.now, input.now],
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

	async claimTelegram(input: TelegramOutboxClaimInput): Promise<TelegramOutboxRow | null> {
		assertInstant(input.now);
		assertInstant(input.leaseUntil);
		if (input.activationAt !== undefined || input.maxAttempts !== undefined) {
			await this.prepareTelegramDispatch(input);
		}
		const candidate = await this.db.first<{ id: string }>({
			sql: `SELECT id FROM telegram_outbox
			WHERE (? IS NULL OR source_kind = ?) AND NOT (
					source_kind = 'support_thread'
					AND template_or_category = 'bureau.support'
					AND length(dedupe_key) = 124
					AND substr(dedupe_key, 1, 23) = 'telegram-preview-smoke:'
					AND substr(dedupe_key, 24, 64) NOT GLOB '*[^0-9a-f]*'
					AND substr(dedupe_key, 88, 1) = ':'
					AND source_id = substr(dedupe_key, 89, 36)
				) AND NOT EXISTS (
					SELECT 1 FROM telegram_destination_activation_floors floor
					WHERE floor.destination_ref = telegram_outbox.destination_ref
						AND telegram_outbox.created_at < floor.activation_at
				) AND NOT EXISTS (${unresolvedTelegramBlocker('telegram_outbox')}
				) AND NOT EXISTS (
					SELECT 1 FROM operation_locks cooldown
					WHERE cooldown.scope = 'provider-cooldown'
						AND cooldown.resource_key = 'telegram:' || telegram_outbox.destination_ref
						AND cooldown.lease_until > ?
				) AND ((status IN ('pending', 'retry') AND not_before <= ?
					AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
				OR (status = 'processing' AND lease_until <= ? AND NOT EXISTS (
					SELECT 1 FROM telegram_delivery_attempts attempt
					WHERE attempt.outbox_id = telegram_outbox.id
						AND attempt.state = 'dispatch_started'
				)))
			ORDER BY created_at, id LIMIT 1`,
			params: [input.sourceKind ?? null, input.sourceKind ?? null,
				input.now, input.now, input.now, input.now],
		});
		if (!candidate) return null;
		const claimed = await this.db.run({
			sql: `UPDATE telegram_outbox SET status = 'processing', locked_at = ?,
				lease_owner = ?, lease_until = ?,
				max_attempts = CASE
					WHEN manual_retry_count > 0 THEN MAX(max_attempts,
						COALESCE((SELECT policy.configured_max_attempts
							FROM telegram_destination_policies policy
							WHERE policy.destination_ref = telegram_outbox.destination_ref),
							max_attempts))
					ELSE COALESCE((SELECT policy.configured_max_attempts
						FROM telegram_destination_policies policy
						WHERE policy.destination_ref = telegram_outbox.destination_ref),
						max_attempts)
				END,
				updated_at = ?
			WHERE id = ? AND NOT (
					source_kind = 'support_thread'
					AND template_or_category = 'bureau.support'
					AND length(dedupe_key) = 124
					AND substr(dedupe_key, 1, 23) = 'telegram-preview-smoke:'
					AND substr(dedupe_key, 24, 64) NOT GLOB '*[^0-9a-f]*'
					AND substr(dedupe_key, 88, 1) = ':'
					AND source_id = substr(dedupe_key, 89, 36)
				) AND NOT EXISTS (
					SELECT 1 FROM telegram_destination_activation_floors floor
					WHERE floor.destination_ref = telegram_outbox.destination_ref
						AND telegram_outbox.created_at < floor.activation_at
				) AND NOT EXISTS (${unresolvedTelegramBlocker('telegram_outbox')}
				) AND NOT EXISTS (
					SELECT 1 FROM operation_locks cooldown
					WHERE cooldown.scope = 'provider-cooldown'
						AND cooldown.resource_key = 'telegram:' || telegram_outbox.destination_ref
						AND cooldown.lease_until > ?
				) AND ((status IN ('pending', 'retry') AND not_before <= ?
					AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
				OR (status = 'processing' AND lease_until <= ? AND NOT EXISTS (
					SELECT 1 FROM telegram_delivery_attempts attempt
					WHERE attempt.outbox_id = telegram_outbox.id
						AND attempt.state = 'dispatch_started'
				)))`,
			params: [input.now, input.leaseOwner, input.leaseUntil,
				input.now, candidate.id, input.now, input.now, input.now, input.now],
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

	async prepareTelegramDispatch(input: {
		now: string;
		maxAttempts?: number;
		activationAt?: string;
		reconcileLimit?: number;
	}): Promise<number> {
		assertInstant(input.now);
		if (input.activationAt !== undefined) assertInstant(input.activationAt);
		if (input.maxAttempts !== undefined &&
			(!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1)) {
			throw new TypeError('Telegram max attempts must be a positive integer.');
		}
		const reconcileLimit = input.reconcileLimit ?? 100;
		assertBatchLimit(reconcileLimit);
		if (input.activationAt !== undefined) {
			await this.db.run({
				sql: `INSERT INTO telegram_destination_activation_floors
					(destination_ref, activation_at, created_at, updated_at)
				VALUES ('bureau', ?, ?, ?)
				ON CONFLICT(destination_ref) DO UPDATE SET
					activation_at = excluded.activation_at,
					updated_at = excluded.updated_at
				WHERE excluded.activation_at <>
					telegram_destination_activation_floors.activation_at`,
				params: [input.activationAt, input.now, input.now],
			});
		}
		if (input.maxAttempts !== undefined) {
			await this.db.run({
				sql: `INSERT INTO telegram_destination_policies
					(destination_ref, configured_max_attempts, created_at, updated_at)
				VALUES ('bureau', ?, ?, ?)
				ON CONFLICT(destination_ref) DO UPDATE SET
					configured_max_attempts = excluded.configured_max_attempts,
					updated_at = excluded.updated_at
				WHERE excluded.configured_max_attempts <>
					telegram_destination_policies.configured_max_attempts`,
				params: [input.maxAttempts, input.now, input.now],
			});
		}
		return this.reconcileStaleTelegramDispatches(input.now, reconcileLimit);
	}

	async reconcileStaleTelegramDispatches(now: string, limit = 100): Promise<number> {
		assertInstant(now);
		assertBatchLimit(limit);
		const results = await this.db.batch([
			{
				sql: `UPDATE telegram_delivery_attempts AS attempt
					SET state = 'delivery_unknown', safe_error_code = 'TELEGRAM_DELIVERY_UNKNOWN',
						finished_at = ?, updated_at = ?
					WHERE attempt.id IN (SELECT candidate.id
						FROM telegram_delivery_attempts candidate
						JOIN telegram_outbox outbox ON outbox.id = candidate.outbox_id
						WHERE candidate.state = 'dispatch_started'
							AND outbox.status = 'processing' AND outbox.lease_until <= ?
						ORDER BY outbox.lease_until, candidate.id LIMIT ?)`,
				params: [now, now, now, limit],
			},
			{
				sql: `UPDATE telegram_outbox AS outbox
					SET status = 'delivery_unknown', attempts = attempts + 1,
						last_error_code = 'TELEGRAM_DELIVERY_UNKNOWN', next_attempt_at = NULL,
						locked_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = ?
					WHERE outbox.id IN (SELECT candidate.id FROM telegram_outbox candidate
						JOIN telegram_delivery_attempts attempt ON attempt.outbox_id = candidate.id
						WHERE candidate.status = 'processing' AND candidate.lease_until <= ?
							AND attempt.state = 'delivery_unknown' AND attempt.finished_at = ?
						ORDER BY candidate.lease_until, candidate.id LIMIT ?)`,
				params: [now, now, now, limit],
			},
		]);
		return results[1]?.meta.changes ?? 0;
	}

	async countUnresolvedTelegramDeliveries(): Promise<number> {
		const row = await this.db.first<{ count: number }>({
			sql: `SELECT EXISTS(SELECT 1 FROM telegram_outbox outbox
				JOIN telegram_delivery_attempts attempt ON attempt.outbox_id = outbox.id
				WHERE outbox.status = 'delivery_unknown'
					AND attempt.state = 'delivery_unknown' AND attempt.resolved_at IS NULL) AS count`,
		});
		return row?.count ?? 0;
	}

	/** An ambiguity outside trial intake blocks every send to the destination, so Cron stops. */
	async countLaneBlockingTelegramDeliveries(): Promise<number> {
		const row = await this.db.first<{ count: number }>({
			sql: `SELECT EXISTS(SELECT 1 FROM telegram_outbox outbox
				JOIN telegram_delivery_attempts attempt ON attempt.outbox_id = outbox.id
				WHERE outbox.status = 'delivery_unknown' AND outbox.source_kind <> 'trial_intake'
					AND attempt.state = 'delivery_unknown' AND attempt.resolved_at IS NULL) AS count`,
		});
		return row?.count ?? 0;
	}

	async countTerminalTelegramFailures(): Promise<number> {
		const row = await this.db.first<{ count: number }>({
			sql: `SELECT EXISTS(SELECT 1 FROM telegram_outbox WHERE status = 'dead') AS count`,
		});
		return row?.count ?? 0;
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

	async startTelegramDispatch(input: {
		id: string;
		leaseOwner: string;
		deliveryReference: string;
		now: string;
	}): Promise<{ attemptId: string } | null> {
		assertInstant(input.now);
		if (!/^TG-[A-F0-9]{12}$/u.test(input.deliveryReference)) {
			throw new OutboxRepositoryError('TELEGRAM_DELIVERY_REFERENCE_INVALID');
		}
		const attemptId = crypto.randomUUID();
		const result = await this.db.run({
			sql: `INSERT INTO telegram_delivery_attempts
				(id, outbox_id, attempt_no, delivery_reference, lease_owner, state,
				 started_at, created_at, updated_at)
			SELECT ?, outbox.id, outbox.attempts + 1, ?, ?, 'dispatch_started', ?, ?, ?
			FROM telegram_outbox outbox
			WHERE outbox.id = ? AND outbox.status = 'processing' AND outbox.lease_owner = ?
				AND NOT EXISTS (
					SELECT 1 FROM telegram_delivery_attempts prior
					WHERE prior.outbox_id = outbox.id AND prior.state = 'dispatch_started'
				)`,
			params: [attemptId, input.deliveryReference, input.leaseOwner,
				input.now, input.now, input.now, input.id, input.leaseOwner],
		});
		return result.meta.changes === 1 ? { attemptId } : null;
	}

	async markTelegramSent(input: {
		id: string;
		leaseOwner: string;
		attemptId: string;
		providerRequestId: string;
		now: string;
	}): Promise<'sent' | 'delivery_unknown'> {
		assertInstant(input.now);
		try {
			await this.db.batch([
				{
					sql: `UPDATE telegram_delivery_attempts SET state = 'delivered',
						provider_request_id = ?, safe_error_code = NULL,
						finished_at = ?, updated_at = ?
					WHERE id = ? AND outbox_id = ? AND lease_owner = ?
						AND state = 'dispatch_started'`,
					params: [input.providerRequestId.slice(0, 200), input.now, input.now,
						input.attemptId, input.id, input.leaseOwner],
				},
				{
					sql: `UPDATE telegram_outbox SET status = 'sent', sent_at = ?,
						provider_request_id = ?, attempts = attempts + 1,
						last_error_code = NULL, next_attempt_at = NULL, locked_at = NULL,
						lease_owner = NULL, lease_until = NULL, updated_at = ?
					WHERE id = ? AND status = 'processing' AND lease_owner = ?
						AND EXISTS (SELECT 1 FROM telegram_delivery_attempts
							WHERE id = ? AND outbox_id = ? AND state = 'delivered')`,
					params: [input.now, input.providerRequestId.slice(0, 200), input.now,
						input.id, input.leaseOwner, input.attemptId, input.id],
				},
			]);
		} catch {
			// The provider already accepted the message. Reconcile the D1 result below;
			// never convert an uncertain commit into another provider send.
		}
		const completed = await this.db.first<{ status: string; state: string | null }>({
			sql: `SELECT outbox.status, attempt.state FROM telegram_outbox outbox
				LEFT JOIN telegram_delivery_attempts attempt ON attempt.id = ?
				WHERE outbox.id = ?`,
			params: [input.attemptId, input.id],
		}).catch(() => null);
		if (completed?.status === 'sent' && completed.state === 'delivered') return 'sent';
		await this.markTelegramUnknown({
			id: input.id,
			leaseOwner: input.leaseOwner,
			attemptId: input.attemptId,
			errorCode: 'TELEGRAM_DELIVERY_UNKNOWN',
			now: input.now,
		}).catch(() => undefined);
		return 'delivery_unknown';
	}

	async markTelegramNotDelivered(
		input: OutboxFailureInput & { attemptId: string; destinationCooldownUntil?: string }
	): Promise<'retry' | 'dead' | 'lost_lease'> {
		assertInstant(input.now);
		assertInstant(input.nextAttemptAt);
		if (input.destinationCooldownUntil !== undefined) {
			assertInstant(input.destinationCooldownUntil);
			if (input.destinationCooldownUntil <= input.now) {
				throw new TypeError('Telegram destination cooldown must end after now.');
			}
		}
		try {
			const statements: StatementSpec[] = [
				{
					sql: `UPDATE telegram_delivery_attempts SET state = 'not_delivered',
						safe_error_code = ?, finished_at = ?, updated_at = ?
					WHERE id = ? AND outbox_id = ? AND lease_owner = ?
						AND state = 'dispatch_started'`,
					params: [input.errorCode, input.now, input.now, input.attemptId,
						input.id, input.leaseOwner],
				},
				{
					sql: `UPDATE telegram_outbox SET
						status = CASE WHEN ? = 1 OR attempts + 1 >= max_attempts
							THEN 'dead' ELSE 'retry' END,
						attempts = attempts + 1, last_error_code = ?, locked_at = NULL,
						lease_owner = NULL, lease_until = NULL,
						next_attempt_at = CASE WHEN ? = 1 OR attempts + 1 >= max_attempts
							THEN NULL ELSE ? END, updated_at = ?
					WHERE id = ? AND status = 'processing' AND lease_owner = ?
						AND EXISTS (SELECT 1 FROM telegram_delivery_attempts
							WHERE id = ? AND outbox_id = ? AND state = 'not_delivered')`,
					params: [Number(input.permanent), input.errorCode, Number(input.permanent),
						input.nextAttemptAt, input.now, input.id, input.leaseOwner,
						input.attemptId, input.id],
				},
			];
			if (input.destinationCooldownUntil !== undefined) {
				statements.push(
					{
						sql: `UPDATE telegram_outbox
							SET not_before = CASE WHEN not_before < ? THEN ? ELSE not_before END,
								next_attempt_at = CASE
									WHEN next_attempt_at IS NULL OR next_attempt_at < ? THEN ?
									ELSE next_attempt_at END,
								updated_at = MAX(updated_at, ?)
							WHERE status IN ('pending', 'retry')
								AND destination_ref = (
									SELECT destination_ref FROM telegram_outbox WHERE id = ?
								)
								AND (not_before < ? OR next_attempt_at IS NULL
									OR next_attempt_at < ?)`,
						params: [input.destinationCooldownUntil, input.destinationCooldownUntil,
							input.destinationCooldownUntil, input.destinationCooldownUntil, input.now,
							input.id, input.destinationCooldownUntil, input.destinationCooldownUntil],
					},
					{
						sql: `INSERT INTO operation_locks
								(id, scope, resource_key, lease_owner, lease_until, fencing_token,
								 created_at, updated_at)
							SELECT ?, 'provider-cooldown', 'telegram:' || destination_ref,
								'telegram-provider-rate-limit', ?, 1, ?, ?
							FROM telegram_outbox WHERE id = ?
							ON CONFLICT(scope, resource_key) DO UPDATE SET
								lease_owner = excluded.lease_owner,
								lease_until = CASE
									WHEN operation_locks.lease_until < excluded.lease_until
									THEN excluded.lease_until ELSE operation_locks.lease_until END,
								fencing_token = operation_locks.fencing_token + 1,
								updated_at = excluded.updated_at`,
						params: [crypto.randomUUID(), input.destinationCooldownUntil,
							input.now, input.now, input.id],
					}
				);
			}
			await this.db.batch(statements);
		} catch {
			// A valid Bot API rejection proves there was no delivery. A read below
			// determines whether the atomic D1 finalization committed.
		}
		const row = await this.db.first<{ status: string; state: string | null }>({
			sql: `SELECT outbox.status, attempt.state FROM telegram_outbox outbox
				LEFT JOIN telegram_delivery_attempts attempt ON attempt.id = ?
				WHERE outbox.id = ?`,
			params: [input.attemptId, input.id],
		}).catch(() => null);
		return row?.state === 'not_delivered' && (row.status === 'retry' || row.status === 'dead')
			? row.status
			: 'lost_lease';
	}

	async markTelegramFailed(input: OutboxFailureInput): Promise<'retry' | 'dead' | 'lost_lease'> {
		return this.markFailed('telegram_outbox', input);
	}

	async markTelegramUnknown(input: {
		id: string;
		leaseOwner: string;
		attemptId: string;
		errorCode: string;
		now: string;
	}): Promise<'delivery_unknown' | 'lost_lease'> {
		assertInstant(input.now);
		await this.db.batch([
			{
				sql: `UPDATE telegram_delivery_attempts SET state = 'delivery_unknown',
					safe_error_code = 'TELEGRAM_DELIVERY_UNKNOWN', finished_at = ?, updated_at = ?
				WHERE id = ? AND outbox_id = ? AND lease_owner = ?
					AND state = 'dispatch_started'`,
				params: [input.now, input.now, input.attemptId,
					input.id, input.leaseOwner],
			},
			{
				sql: `UPDATE telegram_outbox SET status = 'delivery_unknown', attempts = attempts + 1,
					last_error_code = 'TELEGRAM_DELIVERY_UNKNOWN', next_attempt_at = NULL, locked_at = NULL,
					lease_owner = NULL, lease_until = NULL, updated_at = ?
				WHERE id = ? AND status = 'processing' AND lease_owner = ?
					AND EXISTS (SELECT 1 FROM telegram_delivery_attempts
						WHERE id = ? AND outbox_id = ? AND state = 'delivery_unknown')`,
				params: [input.now, input.id, input.leaseOwner,
					input.attemptId, input.id],
			},
		]);
		const row = await this.db.first<{ state: string; status: string }>({
			sql: `SELECT attempt.state, outbox.status
				FROM telegram_delivery_attempts attempt
				JOIN telegram_outbox outbox ON outbox.id = attempt.outbox_id
				WHERE attempt.id = ? AND outbox.id = ?`,
			params: [input.attemptId, input.id],
		});
		return row?.state === 'delivery_unknown' && row.status === 'delivery_unknown'
			? 'delivery_unknown'
			: 'lost_lease';
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
		status?: '' | AdminOutboxStatus;
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
			status: AdminOutboxStatus;
			attempts: number;
			max_attempts: number;
			not_before: string;
			next_attempt_at: string | null;
			last_error_code: string | null;
			lease_until: string | null;
			sent_at: string | null;
			created_at: string;
			updated_at: string;
			delivery_state: string | null;
			delivery_reference: string | null;
			delivery_attempt_id: string | null;
			delivery_attempt_no: number | null;
			delivery_started_at: string | null;
			blocked_by_reference: string | null;
		}>({
			sql: `SELECT * FROM (
				SELECT 'email' AS channel, id, source_kind, source_id,
					template_or_category, status, attempts, max_attempts, not_before,
					next_attempt_at, last_error_code, lease_until, sent_at, created_at,
					COALESCE(updated_at, created_at) AS updated_at,
					NULL AS delivery_state, NULL AS delivery_reference,
					NULL AS delivery_attempt_id, NULL AS delivery_attempt_no,
					NULL AS delivery_started_at, NULL AS blocked_by_reference
				FROM email_outbox
				UNION ALL
				SELECT 'telegram' AS channel, outbox.id, outbox.source_kind, outbox.source_id,
					outbox.template_or_category, outbox.status,
					outbox.attempts, outbox.max_attempts, outbox.not_before,
					outbox.next_attempt_at, outbox.last_error_code, outbox.lease_until,
					outbox.sent_at, outbox.created_at, outbox.updated_at,
					COALESCE(latest.state, 'not_started'), latest.delivery_reference,
					latest.id, latest.attempt_no, latest.started_at,
					CASE WHEN outbox.status IN ('pending', 'retry') THEN (
						${unresolvedTelegramBlocker('outbox', 'attempt.delivery_reference')}
						ORDER BY unresolved.created_at, unresolved.id LIMIT 1) END
				FROM telegram_outbox outbox
				LEFT JOIN telegram_delivery_attempts latest ON latest.id = (
					SELECT attempt.id FROM telegram_delivery_attempts attempt
					WHERE attempt.outbox_id = outbox.id
					ORDER BY attempt.attempt_no DESC, attempt.created_at DESC LIMIT 1
				)
			) queue
			WHERE (? = '' OR channel = ?) AND (? = '' OR status = ?)
				AND (? = '' OR lower(id) LIKE ? OR lower(source_id) LIKE ?
					OR lower(template_or_category) LIKE ? OR lower(last_error_code) LIKE ?)
			ORDER BY CASE status WHEN 'delivery_unknown' THEN 1 WHEN 'dead' THEN 2
				WHEN 'retry' THEN 3 WHEN 'pending' THEN 4 WHEN 'processing' THEN 5 ELSE 6 END,
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
			deliveryState: row.delivery_state as AdminOutboxRow['deliveryState'],
			deliveryReference: row.delivery_reference ?? undefined,
			deliveryAttemptId: row.delivery_attempt_id ?? undefined,
			deliveryAttemptNo: row.delivery_attempt_no ?? undefined,
			deliveryStartedAt: row.delivery_started_at ?? undefined,
			blockedByReference: row.blocked_by_reference ?? undefined,
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
		const authorizedAdditionalAttempts = input.action === 'retry' ? input.additionalAttempts : 0;
		const requestHash = await hashCanonical({
			channel: input.channel,
			outboxId: input.outboxId,
			action: input.action,
			additionalAttempts: authorizedAdditionalAttempts,
		});
		if (await this.actionReplay(input.admin.id, input.idempotencyKey, requestHash)) {
			return { replayed: true };
		}
		const table = input.channel === 'email' ? 'email_outbox' : 'telegram_outbox';
		const telegramUnknownGuard = input.channel === 'telegram'
			? `AND NOT EXISTS (
				SELECT 1 FROM telegram_delivery_attempts attempt
				WHERE attempt.outbox_id = ${table}.id
					AND attempt.state = 'delivery_unknown' AND attempt.resolved_at IS NULL
			)`
			: '';
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const resultingStatus = input.action === 'retry' ? 'retry' : 'cancelled';
		const mutation: StatementSpec = input.action === 'retry'
			? {
					sql: `UPDATE ${table} SET status = 'retry',
						max_attempts = attempts + ?, next_attempt_at = ?,
						locked_at = NULL, lease_owner = NULL, lease_until = NULL,
						manual_retry_count = manual_retry_count + 1, updated_at = ?
					WHERE id = ? AND status = 'dead' ${telegramUnknownGuard}
						AND ${ACTIVE_ADMIN}`,
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
		const initialStatusPredicate = input.action === 'retry'
			? "status = 'dead'"
			: "status IN ('pending', 'retry')";
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
				SELECT ?, ?, 'user', ?, 'outbox_event', ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND ${initialStatusPredicate})
					AND ${ACTIVE_ADMIN}`,
				params: [auditId, input.admin.id, `outbox.${input.channel}.${input.action}`,
					input.outboxId, input.requestId,
					JSON.stringify({ channel: input.channel, status: resultingStatus }), input.now,
					input.outboxId, input.admin.id],
			},
			{
				sql: `INSERT INTO outbox_admin_actions
					(id, channel, outbox_id, action, actor_user_id, idempotency_key,
					 request_hash_sha256, result_ref, audit_event_id, created_at,
					 status_before, attempts_before, max_attempts_before,
					 manual_retry_count_before, updated_at_before, additional_attempts)
				SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, outbox.status, outbox.attempts,
					outbox.max_attempts, outbox.manual_retry_count, outbox.updated_at, ?
				FROM ${table} outbox
				WHERE outbox.id = ? AND ${initialStatusPredicate}
					AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
					AND ${ACTIVE_ADMIN}`,
				params: [actionId, input.channel, input.outboxId, input.action,
					input.admin.id, input.idempotencyKey, requestHash,
					`${input.channel}:${input.outboxId}:${resultingStatus}`, auditId,
					input.now, authorizedAdditionalAttempts, input.outboxId, auditId,
					input.admin.id],
			},
			mutation,
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

	async resolveTelegramUnknown(input: {
		admin: AdminActor;
		outboxId: string;
		attemptId: string;
		action: 'confirm_sent' | 'retry_after_review' | 'cancel';
		reasonCode:
			| 'message_found_in_destination'
			| 'message_absence_verified'
			| 'delivery_abandoned';
		idempotencyKey: string;
		requestId: string;
		now: string;
		additionalAttempts: number;
	}): Promise<{ replayed: boolean }> {
		assertInstant(input.now);
		const requiredReason = {
			confirm_sent: 'message_found_in_destination',
			retry_after_review: 'message_absence_verified',
			cancel: 'delivery_abandoned',
		} as const;
		const authorizedAdditionalAttempts = input.action === 'retry_after_review'
			? input.additionalAttempts
			: 0;
		if (
			input.outboxId.length === 0 || input.outboxId.length > 300 ||
			input.attemptId.length === 0 || input.attemptId.length > 300 ||
			input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200 ||
			requiredReason[input.action] !== input.reasonCode ||
			!Number.isSafeInteger(input.additionalAttempts) || input.additionalAttempts < 1
		) {
			throw new OutboxRepositoryError('TELEGRAM_RESOLUTION_INVALID');
		}
		const requestHash = await hashCanonical({
			outboxId: input.outboxId,
			attemptId: input.attemptId,
			action: input.action,
			reasonCode: input.reasonCode,
			additionalAttempts: authorizedAdditionalAttempts,
		});
		const prior = await this.db.first<{ request_hash_sha256: string }>({
			sql: `SELECT request_hash_sha256 FROM telegram_delivery_resolutions
				WHERE actor_user_id = ? AND idempotency_key = ?`,
			params: [input.admin.id, input.idempotencyKey],
		});
		if (prior) {
			if (prior.request_hash_sha256 !== requestHash) {
				throw new OutboxRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			return { replayed: true };
		}
		const attempt = await this.db.first<{
			id: string;
			delivery_reference: string;
		}>({
			sql: `SELECT id, delivery_reference FROM telegram_delivery_attempts
				WHERE id = ? AND outbox_id = ?
					AND state = 'delivery_unknown' AND resolved_at IS NULL`,
			params: [input.attemptId, input.outboxId],
		});
		if (!attempt) throw new OutboxRepositoryError('TELEGRAM_DELIVERY_UNKNOWN_NOT_FOUND');
		const resultingStatus =
			input.action === 'confirm_sent'
				? 'sent'
				: input.action === 'retry_after_review'
					? 'retry'
					: 'cancelled';
		const mutation: StatementSpec =
			input.action === 'confirm_sent'
				? {
						sql: `UPDATE telegram_outbox SET status = 'sent', sent_at = ?,
							last_error_code = NULL, next_attempt_at = NULL,
							locked_at = NULL, lease_owner = NULL, lease_until = NULL,
							updated_at = ?
						WHERE id = ? AND status = 'delivery_unknown' AND ${ACTIVE_ADMIN}
							AND EXISTS (SELECT 1 FROM telegram_delivery_attempts
								WHERE id = ? AND outbox_id = telegram_outbox.id
									AND state = 'delivery_unknown' AND resolved_at = ?
									AND resolved_by = ? AND resolution = ?)`,
						params: [input.now, input.now, input.outboxId, input.admin.id, attempt.id,
							input.now, input.admin.id, input.action],
					}
				: input.action === 'retry_after_review'
					? {
							sql: `UPDATE telegram_outbox SET status = 'retry',
								max_attempts = MAX(max_attempts, attempts + ?), next_attempt_at = ?,
								last_error_code = NULL, locked_at = NULL,
								lease_owner = NULL, lease_until = NULL,
								manual_retry_count = manual_retry_count + 1,
								updated_at = ?
							WHERE id = ? AND status = 'delivery_unknown' AND ${ACTIVE_ADMIN}
								AND EXISTS (SELECT 1 FROM telegram_delivery_attempts
									WHERE id = ? AND outbox_id = telegram_outbox.id
										AND state = 'delivery_unknown' AND resolved_at = ?
										AND resolved_by = ? AND resolution = ?)`,
							params: [input.additionalAttempts, input.now, input.now,
								input.outboxId, input.admin.id, attempt.id, input.now,
								input.admin.id, input.action],
						}
					: {
							sql: `UPDATE telegram_outbox SET status = 'cancelled',
								next_attempt_at = NULL, last_error_code = NULL,
								locked_at = NULL, lease_owner = NULL, lease_until = NULL,
								updated_at = ?
							WHERE id = ? AND status = 'delivery_unknown' AND ${ACTIVE_ADMIN}
								AND EXISTS (SELECT 1 FROM telegram_delivery_attempts
									WHERE id = ? AND outbox_id = telegram_outbox.id
										AND state = 'delivery_unknown' AND resolved_at = ?
										AND resolved_by = ? AND resolution = ?)`,
							params: [input.now, input.outboxId, input.admin.id, attempt.id,
								input.now, input.admin.id, input.action],
						};
		const resolutionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
				SELECT ?, ?, 'user', ?, 'outbox_event', ?, ?, ?, ?
				WHERE EXISTS (
					SELECT 1 FROM telegram_delivery_attempts attempt
					JOIN telegram_outbox outbox ON outbox.id = attempt.outbox_id
					WHERE attempt.id = ? AND attempt.outbox_id = ?
						AND attempt.state = 'delivery_unknown'
						AND attempt.resolved_at IS NULL
						AND outbox.status = 'delivery_unknown'
				)
					AND ${ACTIVE_ADMIN}`,
				params: [auditId, input.admin.id, `outbox.telegram.${input.action}`,
					input.outboxId, input.requestId,
					JSON.stringify({
						channel: 'telegram',
						status: resultingStatus,
						reasonCode: input.reasonCode,
						deliveryReference: attempt.delivery_reference,
					}),
					input.now, attempt.id, input.outboxId, input.admin.id],
			},
			{
				sql: `INSERT INTO telegram_delivery_resolutions
					(id, outbox_id, attempt_id, action, reason_code, actor_user_id,
					 idempotency_key, request_hash_sha256, audit_event_id,
					 additional_attempts, created_at)
				SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
					AND EXISTS (SELECT 1 FROM telegram_delivery_attempts
						WHERE id = ? AND outbox_id = ? AND state = 'delivery_unknown'
							AND resolved_at IS NULL)
					AND ${ACTIVE_ADMIN}`,
				params: [resolutionId, input.outboxId, attempt.id, input.action,
					input.reasonCode, input.admin.id, input.idempotencyKey, requestHash,
					auditId, authorizedAdditionalAttempts, input.now, auditId, attempt.id,
					input.outboxId, input.admin.id],
			},
			{
				sql: `UPDATE telegram_delivery_attempts SET resolved_at = ?, resolved_by = ?,
					resolution = ?, updated_at = ?
				WHERE id = ? AND state = 'delivery_unknown' AND resolved_at IS NULL
					AND EXISTS (SELECT 1 FROM telegram_outbox
						WHERE id = ? AND status = 'delivery_unknown')
					AND EXISTS (SELECT 1 FROM telegram_delivery_resolutions
						WHERE id = ? AND attempt_id = telegram_delivery_attempts.id)
					AND ${ACTIVE_ADMIN}`,
				params: [input.now, input.admin.id, input.action, input.now, attempt.id,
					input.outboxId, resolutionId, input.admin.id],
			},
			mutation,
			{
				sql: `INSERT INTO telegram_delivery_resolution_assertions
					(id, resolution_id, assertion_passed, created_at)
				VALUES (?, ?, CASE WHEN
					EXISTS (SELECT 1 FROM telegram_delivery_resolutions WHERE id = ?)
					AND EXISTS (SELECT 1 FROM telegram_outbox WHERE id = ? AND status = ?)
				THEN 1 ELSE 0 END, ?)`,
				params: [crypto.randomUUID(), resolutionId, resolutionId,
					input.outboxId, resultingStatus, input.now],
			},
		];
		try {
			await this.db.batch(statements);
			return { replayed: false };
		} catch (cause) {
			const replay = await this.db.first<{ request_hash_sha256: string }>({
				sql: `SELECT request_hash_sha256 FROM telegram_delivery_resolutions
					WHERE actor_user_id = ? AND idempotency_key = ?`,
				params: [input.admin.id, input.idempotencyKey],
			});
			if (replay?.request_hash_sha256 === requestHash) return { replayed: true };
			throw new OutboxRepositoryError('TELEGRAM_RESOLUTION_REJECTED', { cause });
		}
	}
}

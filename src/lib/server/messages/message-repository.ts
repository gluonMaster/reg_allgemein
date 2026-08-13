import { hashCanonical } from '$lib/server/import/canonical';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import type { AdminActor } from '$lib/server/security/authorization';
import type {
	AbsenceEnrollmentOption,
	SupportCategory,
	SupportMessageView,
	SupportStatus,
	SupportThreadDetail,
	SupportThreadSummary,
} from './contracts';

const ACTIVE_ADMIN = `EXISTS (
	SELECT 1 FROM users admin WHERE admin.id = ? AND admin.role = 'admin'
		AND admin.account_status = 'active' AND admin.is_blocked = 0
)`;

interface ThreadRow {
	id: string;
	public_reference: string;
	user_id: string;
	category: SupportCategory;
	status: SupportStatus;
	subject: string;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	message_count: number;
	absence_date: string | null;
}

function mapThread(row: ThreadRow): SupportThreadSummary {
	return {
		id: row.id,
		publicReference: row.public_reference,
		category: row.category,
		status: row.status,
		subject: row.subject,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		closedAt: row.closed_at,
		messageCount: row.message_count,
		absenceDate: row.absence_date,
	};
}

export class MessageRepositoryError extends Error {
	constructor(readonly code: string, options?: { cause?: unknown }) {
		super(code, options);
		this.name = 'MessageRepositoryError';
	}
}

export class MessageRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	private threadSelect(): string {
		return `SELECT thread.id, thread.public_reference, thread.user_id,
			thread.category, thread.status, thread.subject, thread.created_at,
			thread.updated_at, thread.closed_at,
			(SELECT COUNT(*) FROM support_messages message
				WHERE message.thread_id = thread.id) AS message_count,
			(SELECT absence_date FROM absence_reports absence
				WHERE absence.thread_id = thread.id) AS absence_date
		FROM support_threads thread`;
	}

	async listOwnerThreads(userId: string): Promise<SupportThreadSummary[]> {
		const rows = await this.db.all<ThreadRow>({
			sql: `${this.threadSelect()}
			WHERE thread.user_id = ? AND EXISTS (
				SELECT 1 FROM users owner WHERE owner.id = thread.user_id
					AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
					AND owner.account_status = 'active' AND owner.is_blocked = 0)
			ORDER BY thread.updated_at DESC, thread.id DESC LIMIT 100`,
			params: [userId],
		});
		return rows.results.map(mapThread);
	}

	async listAdminThreads(input: {
		status?: string;
		category?: string;
		q?: string;
	}): Promise<SupportThreadSummary[]> {
		const q = (input.q ?? '').trim().toLowerCase();
		const rows = await this.db.all<ThreadRow>({
			sql: `${this.threadSelect()}
			WHERE EXISTS (SELECT 1 FROM users owner WHERE owner.id = thread.user_id
					AND owner.account_status = 'active')
				AND (? = '' OR thread.status = ?) AND (? = '' OR thread.category = ?)
				AND (? = '' OR lower(thread.public_reference) LIKE ?
					OR lower(thread.subject) LIKE ?)
			ORDER BY CASE thread.status WHEN 'waiting_for_admin' THEN 1
				WHEN 'waiting_for_parent' THEN 2 WHEN 'answered' THEN 3 ELSE 4 END,
				thread.updated_at, thread.id LIMIT 200`,
			params: [input.status ?? '', input.status ?? '', input.category ?? '',
				input.category ?? '', q, `%${q}%`, `%${q}%`],
		});
		return rows.results.map(mapThread);
	}

	private async messages(threadId: string): Promise<SupportMessageView[]> {
		const rows = await this.db.all<{
			id: string;
			sender_kind: 'parent' | 'admin' | 'system';
			body: string;
			created_at: string;
		}>({
			sql: `SELECT id, sender_kind, body, created_at FROM support_messages
			WHERE thread_id = ? ORDER BY created_at, id`,
			params: [threadId],
		});
		return rows.results.map((row) => ({
			id: row.id,
			senderKind: row.sender_kind,
			body: row.body,
			createdAt: row.created_at,
		}));
	}

	async getOwnerThread(publicReference: string, userId: string): Promise<SupportThreadDetail | null> {
		const row = await this.db.first<ThreadRow>({
			sql: `${this.threadSelect()} WHERE thread.public_reference = ? AND thread.user_id = ?
				AND EXISTS (SELECT 1 FROM users owner WHERE owner.id = thread.user_id
					AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
					AND owner.account_status = 'active' AND owner.is_blocked = 0)`,
			params: [publicReference, userId],
		});
		return row ? { ...mapThread(row), userId: row.user_id, messages: await this.messages(row.id) } : null;
	}

	async getAdminThread(publicReference: string): Promise<SupportThreadDetail | null> {
		const row = await this.db.first<ThreadRow>({
			sql: `${this.threadSelect()} WHERE thread.public_reference = ?
				AND EXISTS (SELECT 1 FROM users owner WHERE owner.id = thread.user_id
					AND owner.account_status = 'active')`,
			params: [publicReference],
		});
		return row ? { ...mapThread(row), userId: row.user_id, messages: await this.messages(row.id) } : null;
	}

	async listAbsenceEnrollments(userId: string): Promise<AbsenceEnrollmentOption[]> {
		const rows = await this.db.all<{
			enrollment_id: string;
			child_id: string;
			child_name: string;
			course_name: string;
			active_from: string;
			active_until: string | null;
		}>({
			sql: `SELECT enrollment.id AS enrollment_id, child.id AS child_id,
				child.full_name AS child_name, course.display_name AS course_name,
				enrollment.active_from, enrollment.active_until
			FROM enrollments enrollment
			JOIN users owner ON owner.id = enrollment.user_id
			JOIN children child ON child.id = enrollment.child_id
				AND child.owner_user_id = owner.id
				AND child.family_number_id = owner.family_number_id
				AND child.is_current = 1
			JOIN course_groups course ON course.id = enrollment.course_group_id
			WHERE owner.id = ? AND owner.role = 'parent'
				AND owner.email_verified_at IS NOT NULL
				AND owner.account_status = 'active' AND owner.is_blocked = 0
				AND enrollment.status = 'active'
			ORDER BY child.full_name_normalized, course.display_name, enrollment.id`,
			params: [userId],
		});
		return rows.results.map((row) => ({
			enrollmentId: row.enrollment_id,
			childId: row.child_id,
			childName: row.child_name,
			courseName: row.course_name,
			activeFrom: row.active_from,
			activeUntil: row.active_until,
		}));
	}

	private async replay(
		actorId: string,
		idempotencyKey: string,
		requestHash: string,
		actorKind: 'parent' | 'admin'
	) {
		const row = await this.db.first<{ request_hash_sha256: string; result_ref: string }>({
			sql: `SELECT action.request_hash_sha256, action.result_ref
			FROM support_actions AS action
			JOIN users AS actor ON actor.id = action.actor_user_id
			WHERE action.actor_user_id = ? AND action.idempotency_key = ?
				AND actor.role = ? AND actor.account_status = 'active'
				AND actor.is_blocked = 0 AND actor.email_verified_at IS NOT NULL`,
			params: [actorId, idempotencyKey, actorKind],
		});
		if (!row) return null;
		if (row.request_hash_sha256 !== requestHash) {
			throw new MessageRepositoryError('IDEMPOTENCY_KEY_REUSED');
		}
		return row.result_ref;
	}

	async createThread(input: {
		threadId: string;
		publicReference: string;
		messageId: string;
		userId: string;
		category: Exclude<SupportCategory, 'absence'>;
		subject: string;
		body: string;
		idempotencyKey: string;
		requestId: string;
		notBefore: string;
		telegramMaxAttempts: number;
		now: string;
	}): Promise<{ publicReference: string; replayed: boolean }> {
		const requestHash = await hashCanonical({
			category: input.category,
			subject: input.subject,
			body: input.body,
		});
		const prior = await this.replay(input.userId, input.idempotencyKey, requestHash, 'parent');
		if (prior) return { publicReference: prior, replayed: true };
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const outboxId = `telegram:support:create:${input.threadId}`;
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO support_threads
						(id, public_reference, user_id, category, status, subject,
						 previous_thread_id, created_at, updated_at, closed_at)
					SELECT ?, ?, owner.id, ?, 'open', ?, NULL, ?, ?, NULL
					FROM users owner WHERE owner.id = ? AND owner.role = 'parent'
						AND owner.email_verified_at IS NOT NULL
						AND owner.account_status = 'active' AND owner.is_blocked = 0`,
					params: [input.threadId, input.publicReference, input.category,
						input.subject, input.now, input.now, input.userId],
				},
				{
					sql: `INSERT INTO support_messages
						(id, thread_id, sender_kind, sender_user_id, body, created_at)
					SELECT ?, id, 'parent', user_id, ?, ? FROM support_threads
					WHERE id = ? AND user_id = ? AND status = 'open'`,
					params: [input.messageId, input.body, input.now, input.threadId, input.userId],
				},
				{
					sql: `UPDATE support_threads SET status = 'waiting_for_admin', updated_at = ?
					WHERE id = ? AND user_id = ? AND status = 'open'
						AND EXISTS (SELECT 1 FROM support_messages WHERE id = ?)`,
					params: [input.now, input.threadId, input.userId, input.messageId],
				},
				this.telegramStatement({ id: outboxId, sourceKind: 'support_thread',
					sourceId: input.threadId, category: input.category,
					reference: input.publicReference, notBefore: input.notBefore,
					maxAttempts: input.telegramMaxAttempts, now: input.now,
					guardSql: `EXISTS (SELECT 1 FROM support_threads WHERE id = ?
						AND status = 'waiting_for_admin')`, guardParams: [input.threadId] }),
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'support.thread.created', 'support_thread', id,
						?, ?, ? FROM support_threads WHERE id = ? AND user_id = ?`,
					params: [auditId, input.userId, input.requestId,
						JSON.stringify({ category: input.category, status: 'waiting_for_admin' }),
						input.now, input.threadId, input.userId],
				},
				this.actionStatement({ id: actionId, threadId: input.threadId,
					actorId: input.userId, action: 'create', idempotencyKey: input.idempotencyKey,
					requestHash, resultRef: input.publicReference, auditId, now: input.now }),
				this.assertionStatement(actionId, input.threadId, input.messageId, outboxId, input.now),
			]);
			return { publicReference: input.publicReference, replayed: false };
		} catch (error) {
			const replay = await this.replay(input.userId, input.idempotencyKey, requestHash, 'parent');
			if (replay) return { publicReference: replay, replayed: true };
			throw new MessageRepositoryError('SUPPORT_THREAD_CREATE_REJECTED', { cause: error });
		}
	}

	async createAbsence(input: {
		threadId: string;
		publicReference: string;
		messageId: string;
		absenceId: string;
		userId: string;
		childId: string;
		enrollmentId: string;
		absenceDate: string;
		reason: string;
		body: string;
		subject: string;
		idempotencyKey: string;
		requestId: string;
		notBefore: string;
		telegramMaxAttempts: number;
		now: string;
	}): Promise<{ publicReference: string; replayed: boolean }> {
		const requestHash = await hashCanonical({
			childId: input.childId,
			enrollmentId: input.enrollmentId,
			absenceDate: input.absenceDate,
			reason: input.reason,
			body: input.body,
		});
		const prior = await this.replay(input.userId, input.idempotencyKey, requestHash, 'parent');
		if (prior) return { publicReference: prior, replayed: true };
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const outboxId = `telegram:support:absence:${input.absenceId}`;
		const eligibleEnrollment = `EXISTS (
			SELECT 1 FROM enrollments enrollment
			JOIN children child ON child.id = enrollment.child_id
			JOIN users owner ON owner.id = enrollment.user_id
			WHERE enrollment.id = ? AND enrollment.user_id = ? AND enrollment.child_id = ?
				AND child.owner_user_id = owner.id
				AND child.family_number_id = owner.family_number_id
				AND child.is_current = 1
				AND owner.id = ? AND owner.role = 'parent'
				AND owner.email_verified_at IS NOT NULL
				AND owner.account_status = 'active' AND owner.is_blocked = 0
				AND enrollment.status = 'active' AND enrollment.active_from <= ?
				AND (enrollment.active_until IS NULL OR ? < enrollment.active_until)
		)`;
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO support_threads
						(id, public_reference, user_id, category, status, subject,
						 previous_thread_id, created_at, updated_at, closed_at)
					SELECT ?, ?, ?, 'absence', 'open', ?, NULL, ?, ?, NULL
					WHERE ${eligibleEnrollment}`,
					params: [input.threadId, input.publicReference, input.userId, input.subject,
						input.now, input.now, input.enrollmentId, input.userId, input.childId,
						input.userId, input.absenceDate, input.absenceDate],
				},
				{
					sql: `INSERT INTO support_messages
						(id, thread_id, sender_kind, sender_user_id, body, created_at)
					SELECT ?, id, 'parent', user_id, ?, ? FROM support_threads
					WHERE id = ? AND user_id = ? AND status = 'open'`,
					params: [input.messageId, input.body, input.now, input.threadId, input.userId],
				},
				{
					sql: `INSERT INTO absence_reports
						(id, thread_id, user_id, child_id, enrollment_id, absence_date,
						 reason_code, reason_text, message_id, created_at)
					SELECT ?, thread.id, thread.user_id, ?, ?, ?, 'parent_provided', ?, ?, ?
					FROM support_threads thread WHERE thread.id = ? AND thread.user_id = ?
						AND EXISTS (SELECT 1 FROM support_messages WHERE id = ?
							AND thread_id = thread.id)`,
					params: [input.absenceId, input.childId, input.enrollmentId,
						input.absenceDate, input.reason, input.messageId, input.now,
						input.threadId, input.userId, input.messageId],
				},
				{
					sql: `UPDATE support_threads SET status = 'waiting_for_admin', updated_at = ?
					WHERE id = ? AND user_id = ? AND status = 'open'
						AND EXISTS (SELECT 1 FROM absence_reports WHERE id = ?)`,
					params: [input.now, input.threadId, input.userId, input.absenceId],
				},
				this.telegramStatement({ id: outboxId, sourceKind: 'absence_report',
					sourceId: input.absenceId, category: 'absence', reference: input.publicReference,
					notBefore: input.notBefore, maxAttempts: input.telegramMaxAttempts,
					now: input.now, guardSql: `EXISTS (SELECT 1 FROM absence_reports WHERE id = ?)`,
					guardParams: [input.absenceId] }),
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'support.absence.created', 'absence_report', id,
						?, ?, ? FROM absence_reports WHERE id = ? AND user_id = ?`,
					params: [auditId, input.userId, input.requestId,
						JSON.stringify({ category: 'absence', absenceDate: input.absenceDate }),
						input.now, input.absenceId, input.userId],
				},
				this.actionStatement({ id: actionId, threadId: input.threadId,
					actorId: input.userId, action: 'absence_create',
					idempotencyKey: input.idempotencyKey, requestHash,
					resultRef: input.publicReference, auditId, now: input.now }),
				this.assertionStatement(actionId, input.threadId, input.messageId, outboxId,
					input.now, input.absenceId),
			]);
			return { publicReference: input.publicReference, replayed: false };
		} catch (error) {
			const replay = await this.replay(input.userId, input.idempotencyKey, requestHash, 'parent');
			if (replay) return { publicReference: replay, replayed: true };
			throw new MessageRepositoryError('ABSENCE_CREATE_REJECTED', { cause: error });
		}
	}

	async appendParentMessage(input: {
		publicReference: string;
		messageId: string;
		userId: string;
		body: string;
		idempotencyKey: string;
		requestId: string;
		notBefore: string;
		telegramMaxAttempts: number;
		now: string;
	}): Promise<{ replayed: boolean }> {
		const requestHash = await hashCanonical({ publicReference: input.publicReference, body: input.body });
		if (await this.replay(input.userId, input.idempotencyKey, requestHash, 'parent')) {
			return { replayed: true };
		}
		const thread = await this.getOwnerThread(input.publicReference, input.userId);
		if (!thread) throw new MessageRepositoryError('SUPPORT_THREAD_NOT_FOUND');
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const outboxId = `telegram:support:message:${input.messageId}`;
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO support_messages
						(id, thread_id, sender_kind, sender_user_id, body, created_at)
					SELECT ?, id, 'parent', user_id, ?, ? FROM support_threads
					WHERE id = ? AND public_reference = ? AND user_id = ?
						AND status IN ('waiting_for_parent', 'answered')
						AND EXISTS (SELECT 1 FROM users owner WHERE owner.id = ?
							AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
							AND owner.account_status = 'active' AND owner.is_blocked = 0)`,
					params: [input.messageId, input.body, input.now, thread.id,
						input.publicReference, input.userId, input.userId],
				},
				{
					sql: `UPDATE support_threads SET status = 'waiting_for_admin', updated_at = ?
					WHERE id = ? AND user_id = ? AND status IN ('waiting_for_parent', 'answered')
						AND EXISTS (SELECT 1 FROM support_messages WHERE id = ?)`,
					params: [input.now, thread.id, input.userId, input.messageId],
				},
				this.telegramStatement({ id: outboxId, sourceKind: 'support_message',
					sourceId: input.messageId, category: thread.category,
					reference: thread.publicReference, notBefore: input.notBefore,
					maxAttempts: input.telegramMaxAttempts, now: input.now,
					guardSql: `EXISTS (SELECT 1 FROM support_messages WHERE id = ?)`,
					guardParams: [input.messageId] }),
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'support.message.added', 'support_thread', id,
						?, '{"status":"waiting_for_admin"}', ? FROM support_threads
					WHERE id = ? AND user_id = ? AND status = 'waiting_for_admin'`,
					params: [auditId, input.userId, input.requestId, input.now,
						thread.id, input.userId],
				},
				this.actionStatement({ id: actionId, threadId: thread.id, actorId: input.userId,
					action: 'parent_message', idempotencyKey: input.idempotencyKey,
					requestHash, resultRef: thread.publicReference, auditId, now: input.now }),
				this.assertionStatement(actionId, thread.id, input.messageId, outboxId, input.now),
			]);
			return { replayed: false };
		} catch (error) {
			if (await this.replay(input.userId, input.idempotencyKey, requestHash, 'parent')) {
				return { replayed: true };
			}
			throw new MessageRepositoryError('SUPPORT_MESSAGE_REJECTED', { cause: error });
		}
	}

	async replyAsAdmin(input: {
		admin: AdminActor;
		publicReference: string;
		messageId: string;
		body: string;
		outcome: 'waiting_for_parent' | 'answered';
		idempotencyKey: string;
		requestId: string;
		emailMaxAttempts: number;
		now: string;
	}): Promise<{ replayed: boolean }> {
		const requestHash = await hashCanonical({
			publicReference: input.publicReference,
			body: input.body,
			outcome: input.outcome,
		});
		if (await this.replay(input.admin.id, input.idempotencyKey, requestHash, 'admin')) {
			return { replayed: true };
		}
		const thread = await this.getAdminThread(input.publicReference);
		if (!thread) throw new MessageRepositoryError('SUPPORT_THREAD_NOT_FOUND');
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const outboxId = `email:support:reply:${input.messageId}`;
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO support_messages
						(id, thread_id, sender_kind, sender_user_id, body, created_at)
					SELECT ?, thread.id, 'admin', ?, ?, ? FROM support_threads thread
					WHERE thread.id = ? AND thread.public_reference = ?
						AND thread.status = 'waiting_for_admin' AND ${ACTIVE_ADMIN}`,
					params: [input.messageId, input.admin.id, input.body, input.now,
						thread.id, input.publicReference, input.admin.id],
				},
				{
					sql: `UPDATE support_threads SET status = ?, updated_at = ?
					WHERE id = ? AND status = 'waiting_for_admin'
						AND EXISTS (SELECT 1 FROM support_messages WHERE id = ?)
						AND ${ACTIVE_ADMIN}`,
					params: [input.outcome, input.now, thread.id, input.messageId, input.admin.id],
				},
				{
					sql: `INSERT OR IGNORE INTO email_outbox
						(id, source_kind, source_id, template_or_category, recipient_user_id,
						 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
						 status, attempts, max_attempts, created_at, updated_at)
					SELECT ?, 'support_message', ?, 'support.admin_reply', thread.user_id,
						'current', 'de', ?, ?, ?, 'pending', 0, ?, ?, ?
					FROM support_threads thread WHERE thread.id = ? AND thread.status = ?
						AND EXISTS (SELECT 1 FROM support_messages WHERE id = ?)`,
					params: [outboxId, input.messageId,
						JSON.stringify({ threadReference: thread.publicReference,
							portalPath: `/messages/${thread.publicReference}` }),
						`support:admin-reply:${input.messageId}:email:v1`, input.now,
						input.emailMaxAttempts, input.now, input.now, thread.id,
						input.outcome, input.messageId],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'support.admin.replied', 'support_thread', id,
						?, ?, ? FROM support_threads WHERE id = ? AND status = ?
						AND ${ACTIVE_ADMIN}`,
					params: [auditId, input.admin.id, input.requestId,
						JSON.stringify({ status: input.outcome, emailQueued: true }), input.now,
						thread.id, input.outcome, input.admin.id],
				},
				this.actionStatement({ id: actionId, threadId: thread.id, actorId: input.admin.id,
					action: 'admin_reply', idempotencyKey: input.idempotencyKey,
					requestHash, resultRef: thread.publicReference, auditId, now: input.now }),
				this.assertionStatement(actionId, thread.id, input.messageId, outboxId, input.now,
					undefined, 'email_outbox'),
			]);
			return { replayed: false };
		} catch (error) {
			if (await this.replay(input.admin.id, input.idempotencyKey, requestHash, 'admin')) {
				return { replayed: true };
			}
			throw new MessageRepositoryError('ADMIN_REPLY_REJECTED', { cause: error });
		}
	}

	async closeThread(input: {
		actorId: string;
		actorKind: 'parent' | 'admin';
		publicReference: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}): Promise<{ replayed: boolean }> {
		const requestHash = await hashCanonical({ publicReference: input.publicReference, action: 'close' });
		if (await this.replay(input.actorId, input.idempotencyKey, requestHash, input.actorKind)) {
			return { replayed: true };
		}
		const thread = input.actorKind === 'parent'
			? await this.getOwnerThread(input.publicReference, input.actorId)
			: await this.getAdminThread(input.publicReference);
		if (!thread) throw new MessageRepositoryError('SUPPORT_THREAD_NOT_FOUND');
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const actorGuard = input.actorKind === 'admin'
			? ACTIVE_ADMIN
			: `EXISTS (SELECT 1 FROM users owner WHERE owner.id = ? AND owner.role = 'parent'
				AND owner.email_verified_at IS NOT NULL
				AND owner.account_status = 'active' AND owner.is_blocked = 0)`;
		try {
			await this.db.batch([
				{
					sql: `UPDATE support_threads SET status = 'closed', closed_at = ?, updated_at = ?
					WHERE id = ? AND public_reference = ? AND status <> 'closed'
						AND (? = 'admin' OR user_id = ?) AND ${actorGuard}`,
					params: [input.now, input.now, thread.id, input.publicReference,
						input.actorKind, input.actorId, input.actorId],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', ?, 'support_thread', id, ?,
						'{"status":"closed"}', ? FROM support_threads
					WHERE id = ? AND status = 'closed' AND closed_at = ?`,
					params: [auditId, input.actorId, `support.${input.actorKind}.closed`,
						input.requestId, input.now, thread.id, input.now],
				},
				this.actionStatement({ id: actionId, threadId: thread.id, actorId: input.actorId,
					action: input.actorKind === 'admin' ? 'admin_close' : 'parent_close',
					idempotencyKey: input.idempotencyKey, requestHash,
					resultRef: thread.publicReference, auditId, now: input.now }),
				{
					sql: `INSERT INTO support_action_assertions
						(id, action_id, thread_id, assertion_passed, created_at)
					VALUES (?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM support_actions WHERE id = ?)
						AND EXISTS (SELECT 1 FROM support_threads WHERE id = ? AND status = 'closed')
					THEN 1 ELSE 0 END, ?)`,
					params: [crypto.randomUUID(), actionId, thread.id, actionId, thread.id, input.now],
				},
			]);
			return { replayed: false };
		} catch (error) {
			if (await this.replay(input.actorId, input.idempotencyKey, requestHash, input.actorKind)) {
				return { replayed: true };
			}
			throw new MessageRepositoryError('SUPPORT_CLOSE_REJECTED', { cause: error });
		}
	}

	private telegramStatement(input: {
		id: string;
		sourceKind: string;
		sourceId: string;
		category: string;
		reference: string;
		notBefore: string;
		maxAttempts: number;
		now: string;
		guardSql: string;
		guardParams: readonly unknown[];
	}): StatementSpec {
		return {
			sql: `INSERT OR IGNORE INTO telegram_outbox
				(id, source_kind, source_id, template_or_category, destination_ref,
				 locale, payload_json, dedupe_key, not_before, status, attempts,
				 max_attempts, created_at, updated_at)
			SELECT ?, ?, ?, 'bureau.support', 'bureau', 'de', ?, ?, ?,
				'pending', 0, ?, ?, ? WHERE ${input.guardSql}`,
			params: [input.id, input.sourceKind, input.sourceId,
				JSON.stringify({ category: input.category, reference: input.reference,
					receivedAt: input.now, adminPath: `/admin/messages/${input.reference}` }),
				`telegram:${input.sourceKind}:${input.sourceId}:v1`, input.notBefore,
				input.maxAttempts, input.now, input.now, ...input.guardParams],
		};
	}

	private actionStatement(input: {
		id: string;
		threadId: string;
		actorId: string;
		action: string;
		idempotencyKey: string;
		requestHash: string;
		resultRef: string;
		auditId: string;
		now: string;
	}): StatementSpec {
		return {
			sql: `INSERT INTO support_actions
				(id, thread_id, actor_user_id, action, idempotency_key,
				 request_hash_sha256, result_ref, audit_event_id, created_at)
			SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
			WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
			params: [input.id, input.threadId, input.actorId, input.action,
				input.idempotencyKey, input.requestHash, input.resultRef,
				input.auditId, input.now, input.auditId],
		};
	}

	private assertionStatement(
		actionId: string,
		threadId: string,
		messageId: string,
		outboxId: string,
		now: string,
		absenceId?: string,
		outboxTable: 'email_outbox' | 'telegram_outbox' = 'telegram_outbox'
	): StatementSpec {
		return {
			sql: `INSERT INTO support_action_assertions
				(id, action_id, thread_id, assertion_passed, created_at)
			VALUES (?, ?, ?, CASE WHEN
				EXISTS (SELECT 1 FROM support_actions WHERE id = ?)
				AND EXISTS (SELECT 1 FROM support_threads WHERE id = ?)
				AND EXISTS (SELECT 1 FROM support_messages WHERE id = ? AND thread_id = ?)
				AND EXISTS (SELECT 1 FROM ${outboxTable} WHERE id = ?)
				AND (? IS NULL OR EXISTS (SELECT 1 FROM absence_reports WHERE id = ?
					AND thread_id = ? AND message_id = ?))
			THEN 1 ELSE 0 END, ?)`,
			params: [crypto.randomUUID(), actionId, threadId, actionId, threadId,
				messageId, threadId, outboxId, absenceId ?? null, absenceId ?? null,
				threadId, messageId, now],
		};
	}
}

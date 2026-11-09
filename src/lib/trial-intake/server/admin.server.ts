import { z } from 'zod';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import {
	requireAdmin,
	AuthorizationError,
	type AdminActor,
} from '$lib/server/security/authorization';
import { OutboxRepository } from '$lib/server/outbox/outbox-repository';
import { outboxWaitReason } from '$lib/outbox-wait';
import { IntakeService, afterSeconds, searchName } from './service.server';
import { IntakeError } from './validation.server';
import { closedKey } from './closed.server';
import type {
	AdminListRow,
	ClosedLessonRow,
	DeliveryAttention,
	DeliveryStatus,
	EmailJob,
	IntakeOutboxContext,
	Lesson,
} from '../contracts';

export const adminQuerySchema = z.object({
	status: z.enum(['verified', 'processed', 'all']).default('verified'),
	subject: z.string().max(160).default(''),
	teacher: z.string().max(160).default(''),
	weekday: z.coerce.number().int().min(0).max(7).default(0),
	building: z.enum(['', 'Kolibri', 'Villa']).default(''),
	q: z.string().max(160).default(''),
	parentLastName: z.string().max(160).default(''),
	childLastName: z.string().max(160).default(''),
	sort: z.enum(['received', 'subject', 'teacher', 'day', 'parent', 'child']).default('received'),
	direction: z.enum(['asc', 'desc']).default('desc'),
	page: z.coerce.number().int().min(1).max(100000).default(1),
});
/** SQL guard: the acting admin is still active when the statement runs. Bind the admin ID. */
export const ACTIVE = `EXISTS(SELECT 1 FROM users WHERE id = ? AND role = 'admin' AND account_status = 'active' AND is_blocked = 0)`;
/** Role from the session, then the account itself: a blocked or demoted admin is refused. */
export async function requireActiveAdmin(
	db: DatabaseBoundary,
	user: App.Locals['user']
): Promise<AdminActor> {
	const actor = requireAdmin(user);
	if (
		!(await db.first({
			sql: `SELECT id FROM users WHERE id = ? AND role = 'admin' AND account_status = 'active' AND is_blocked = 0`,
			params: [actor.id],
		}))
	)
		throw new AuthorizationError('FORBIDDEN');
	return actor;
}
const childSurname = `(SELECT MIN(c.last_name_search) FROM trial_intake_item_children link JOIN trial_intake_children c ON c.id = link.child_id WHERE link.item_id = i.id)`;
export class IntakeAdmin {
	constructor(
		private readonly service: IntakeService,
		private readonly db: DatabaseBoundary = service.db
	) {}
	private actor(user: App.Locals['user']): Promise<AdminActor> {
		return requireActiveAdmin(this.db, user);
	}
	private audit(
		actor: AdminActor,
		action: string,
		target: string,
		requestId: string,
		now: string
	): StatementSpec {
		return {
			sql: `INSERT INTO audit_events(id, actor_user_id, actor_kind, action, target_kind, target_id, request_id, safe_diff_json, created_at)
		 SELECT ?, ?, 'user', ?, 'trial_intake', ?, ?, '{}', ? WHERE ${ACTIVE}`,
			params: [crypto.randomUUID(), actor.id, action, target, requestId, now, actor.id],
		};
	}
	async list(user: App.Locals['user'], rawQuery: unknown, requestId: string, now: string) {
		const actor = await this.actor(user);
		const q = adminQuerySchema.parse(rawQuery);
		const where = [`r.state IN ('verified','processed')`, ACTIVE];
		const params: unknown[] = [actor.id];
		const filter = (sql: string, value: unknown) => {
			where.push(sql);
			params.push(value);
		};
		if (q.status !== 'all') filter('r.state = ?', q.status);
		for (const field of ['subject', 'teacher', 'building'] as const)
			if (q[field]) filter(`i.${field} = ?`, q[field]);
		if (q.weekday) filter('i.weekday = ?', q.weekday);
		if (q.parentLastName)
			filter('instr(r.parent_last_name_search, ?) > 0', searchName(q.parentLastName));
		const childMatch = `EXISTS(SELECT 1 FROM trial_intake_item_children link JOIN trial_intake_children c ON c.id = link.child_id WHERE link.item_id = i.id AND instr(c.last_name_search, ?) > 0)`;
		if (q.childLastName) filter(childMatch, searchName(q.childLastName));
		if (q.q) {
			where.push(`(instr(r.parent_last_name_search, ?) > 0 OR ${childMatch})`);
			params.push(searchName(q.q), searchName(q.q));
		}
		const direction = q.direction === 'asc' ? 'ASC' : 'DESC';
		const sort = {
			received: 'r.verified_at',
			subject: 'i.subject COLLATE NOCASE',
			teacher: 'i.teacher COLLATE NOCASE',
			day: `i.weekday ${direction}, i.start_time`,
			parent: 'r.parent_last_name_search',
			child: childSurname,
		}[q.sort];
		const from = `FROM trial_intake_items i JOIN trial_intake_requests r ON r.id = i.request_id WHERE ${where.join(' AND ')}`;
		const results = await this.db.batch<
			AdminListRow & { total: number; children_json: string }
		>([
			this.audit(actor, 'trial_intake.list_read', 'list', requestId, now),
			{ sql: `SELECT COUNT(*) AS total ${from}`, params },
			{
				sql: `SELECT i.*, r.state, r.verified_at, r.parent_first_name, r.parent_last_name,
			 (SELECT json_group_array(json_object('id', c.id, 'firstName', c.first_name, 'lastName', c.last_name, 'birthDate', c.birth_date))
			 FROM trial_intake_item_children link JOIN trial_intake_children c ON c.id = link.child_id WHERE link.item_id = i.id) AS children_json
			 ${from} ORDER BY ${sort} ${direction}, r.id ${direction}, i.id ${direction} LIMIT 50 OFFSET ?`,
				params: [...params, (q.page - 1) * 50],
			},
		]);
		return {
			query: q,
			total: results[1].results[0]?.total ?? 0,
			rows: results[2].results.map(({ children_json, ...row }) => ({
				...row,
				id: String(row.id),
				children: JSON.parse(String(children_json)),
			})),
		};
	}
	async detail(user: App.Locals['user'], id: string, requestId: string, now: string) {
		const actor = await this.actor(user);
		await this.db.run(this.audit(actor, 'trial_intake.detail_read', id, requestId, now));
		const detail = await this.service.detail(id);
		if (!detail || detail.request.state === 'pending_email')
			throw new IntakeError('INTAKE_NOT_FOUND', 404);
		const r = detail.request;
		// The shared admin listing owns the rule for which ambiguity holds a part back.
		const parts = (
			await new OutboxRepository(this.db).listAdmin({ channel: 'telegram', q: `ti:${id}:` })
		)
			.filter((row) => row.sourceKind === 'trial_intake' && row.sourceId === id)
			.map((row) => ({ row, part: Number(row.id.slice(row.id.lastIndexOf(':') + 1)) }))
			.sort((a, b) => a.part - b.part);
		const delivery: DeliveryStatus[] = parts.map(({ row, part }) => ({
			id: row.id,
			part,
			total: parts.length,
			status: row.status,
			attempts: row.attempts,
			lastErrorCode: row.lastErrorCode,
			deliveryReference: row.deliveryReference ?? null,
			sentAt: row.sentAt,
			wait: outboxWaitReason(row, now) ?? null,
		}));
		return {
			request: {
				id: r.id,
				parentFirstName: r.parent_first_name,
				parentLastName: r.parent_last_name,
				email: r.email,
				phone: r.phone,
				locale: r.locale,
				state: r.state,
				createdAt: r.created_at,
				verifiedAt: r.verified_at,
				processedAt: r.processed_at,
				deleteAfter: r.delete_after,
			},
			children: detail.children,
			items: detail.items,
			delivery,
		};
	}
	async setProcessed(
		user: App.Locals['user'],
		id: string,
		processed: boolean,
		requestId: string,
		now: string
	) {
		const actor = await this.actor(user);
		const desired = processed ? 'processed' : 'verified';
		const previous = processed ? 'verified' : 'processed';
		await this.db.batch([
			{
				sql: `INSERT INTO audit_events(id, actor_user_id, actor_kind, action, target_kind, target_id, request_id, safe_diff_json, created_at)
			 SELECT ?, ?, 'user', 'trial_intake.status_changed', 'trial_intake', id, ?, ?, ? FROM trial_intake_requests WHERE id = ? AND state = ? AND ${ACTIVE}`,
				params: [
					crypto.randomUUID(),
					actor.id,
					requestId,
					JSON.stringify({ state: desired }),
					now,
					id,
					previous,
					actor.id,
				],
			},
			{
				sql: `UPDATE trial_intake_requests SET state = ?, processed_at = ?, delete_after = ? WHERE id = ? AND state = ? AND ${ACTIVE}`,
				params: [
					desired,
					processed ? now : null,
					processed ? afterSeconds(now, 90 * 86400) : null,
					id,
					previous,
					actor.id,
				],
			},
		]);
		const result = await this.service.get(id);
		if (!result || result.state !== desired)
			throw new IntakeError('INTAKE_STATUS_CONFLICT', 409);
		return { state: desired, deleteAfter: result.delete_after };
	}
	async closedLessons(user: App.Locals['user']): Promise<ClosedLessonRow[]> {
		await this.actor(user);
		return (
			await this.db.all<ClosedLessonRow>({
				sql: `SELECT match_key, subject, group_name, weekday, closed_at FROM trial_intake_closed_lessons
			 ORDER BY subject, group_name, weekday`,
			})
		).results;
	}
	async setLessonClosed(
		user: App.Locals['user'],
		lesson: Lesson,
		closed: boolean,
		requestId: string,
		now: string
	) {
		const actor = await this.actor(user);
		const key = closedKey(lesson);
		// The catalog supplies subject/group/weekday, so no arbitrary row can be written.
		await this.db.batch([
			this.audit(
				actor,
				closed ? 'trial_intake.lesson_closed' : 'trial_intake.lesson_reopened',
				key.slice(0, 200),
				requestId,
				now
			),
			closed
				? {
						sql: `INSERT INTO trial_intake_closed_lessons(match_key, subject, group_name, weekday, closed_by, closed_at)
				 SELECT ?, ?, ?, ?, ?, ? WHERE ${ACTIVE} ON CONFLICT(match_key) DO NOTHING`,
						params: [
							key,
							lesson.subject,
							lesson.group,
							lesson.weekday,
							actor.id,
							now,
							actor.id,
						],
					}
				: {
						sql: `DELETE FROM trial_intake_closed_lessons WHERE match_key = ? AND ${ACTIVE}`,
						params: [key, actor.id],
					},
		]);
		return { closed };
	}
	async removeClosedLesson(
		user: App.Locals['user'],
		matchKey: string,
		requestId: string,
		now: string
	) {
		const actor = await this.actor(user);
		// A schedule edit can leave a record that matches no current lesson; the admin clears it.
		await this.db.batch([
			this.audit(
				actor,
				'trial_intake.lesson_reopened',
				matchKey.slice(0, 200),
				requestId,
				now
			),
			{
				sql: `DELETE FROM trial_intake_closed_lessons WHERE match_key = ? AND ${ACTIVE}`,
				params: [matchKey, actor.id],
			},
		]);
		return { closed: false };
	}
	/** Minimal request context for the delivery page: surname and subjects, not the full card. */
	async outboxContext(
		user: App.Locals['user'],
		requestIds: string[],
		requestId: string,
		now: string
	): Promise<Record<string, IntakeOutboxContext>> {
		const actor = await this.actor(user);
		const ids = [...new Set(requestIds)];
		if (ids.length === 0) return {};
		const [, found] = await this.db.batch<{
			id: string;
			parent_last_name: string;
			received_at: string;
			subjects_json: string;
		}>([
			this.audit(actor, 'trial_intake.outbox_context_read', 'outbox', requestId, now),
			{
				// One JSON parameter keeps the lookup below D1's bound-parameter limit.
				sql: `SELECT r.id, r.parent_last_name, COALESCE(r.verified_at, r.created_at) AS received_at,
			 (SELECT json_group_array(subject) FROM (SELECT DISTINCT i.subject FROM trial_intake_items i
			 WHERE i.request_id = r.id ORDER BY i.subject)) AS subjects_json
			 FROM trial_intake_requests r WHERE r.id IN (SELECT value FROM json_each(?))
			 AND r.state IN ('verified','processed') AND ${ACTIVE}`,
				params: [JSON.stringify(ids), actor.id],
			},
		]);
		const rows = new Map(found.results.map((row) => [row.id, row]));
		return Object.fromEntries(
			ids.map((id) => {
				const row = rows.get(id);
				return [
					id,
					row
						? {
								deleted: false,
								parentLastName: row.parent_last_name,
								subjects: JSON.parse(row.subjects_json) as string[],
								receivedAt: row.received_at,
							}
						: { deleted: true },
				];
			})
		);
	}
	/** Bureau notifications that wait for an admin decision; shown on the request list. */
	async deliveryAttention(user: App.Locals['user']): Promise<DeliveryAttention> {
		await this.actor(user);
		const row = await this.db.first<{ unknown: number; dead: number }>({
			sql: `SELECT EXISTS(SELECT 1 FROM telegram_outbox WHERE source_kind = 'trial_intake' AND status = 'delivery_unknown') AS unknown,
			 EXISTS(SELECT 1 FROM telegram_outbox WHERE source_kind = 'trial_intake' AND status = 'dead') AS dead`,
		});
		return { unknown: Boolean(row?.unknown), dead: Boolean(row?.dead) };
	}
	async emailQueue(user: App.Locals['user']) {
		await this.actor(user);
		return (
			await this.db.all<EmailJob>({
				sql: `SELECT id, status, attempts, max_attempts, last_error_code, created_at FROM trial_intake_email_outbox WHERE status IN ('pending','retry','dead','processing') ORDER BY created_at, id LIMIT 50`,
			})
		).results;
	}
	async retryEmail(user: App.Locals['user'], id: string, requestId: string, now: string) {
		const actor = await this.actor(user);
		// Only a current, unexpired token can be recovered. Expired tokens need the scoped resend.
		await this.db.batch([
			this.audit(actor, 'trial_intake.email_retry', id, requestId, now),
			{
				sql: `UPDATE trial_intake_email_outbox SET status = 'retry', next_attempt_at = ?, max_attempts = attempts + 5, updated_at = ?
			 WHERE id = ? AND status = 'dead' AND ${ACTIVE} AND EXISTS(SELECT 1 FROM trial_intake_requests r
			 WHERE r.id = trial_intake_email_outbox.request_id AND r.state = 'pending_email' AND r.pending_expires_at > ? AND r.verification_expires_at > ? AND r.verification_version = trial_intake_email_outbox.verification_version)`,
				params: [now, now, id, actor.id, now, now],
			},
		]);
		return { accepted: true };
	}
}

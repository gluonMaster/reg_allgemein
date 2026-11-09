import { z } from 'zod';
import type { DatabaseBoundary, StatementSpec } from '$lib/server/db/database';
import type {
	AdminWaitlistData,
	Lesson,
	RebindBlock,
	RebindComparison,
	RebindOptions,
	WaitlistCourse,
} from '../contracts';
import { lessonAgeRange } from '../age';
import {
	compareCourses,
	isPlannedLesson,
	keyAge,
	lessonFacts,
	mergeReasons,
	plannedCourseKey,
} from '../planned';
import { parseEuroCents } from '../prices';
import { ACTIVE, requireActiveAdmin } from './admin.server';
import { IntakeError } from './validation.server';
import type { WaitlistPrices } from './prices.server';
import type { WaitlistSignup } from './waitlist.server';
import { readEntry } from './waitlist-core.server';

// WL-15 (OQ-051): a queue whose course left the schedule moves to another planned card only by an
// admin's decision. The server reads the catalog again and repeats every comparison; the form only
// names the old course and the card. Migration 0032 holds the price contour for every path.

function targetBlock(course: WaitlistCourse, comparison: RebindComparison): RebindBlock | null {
	if (!comparison.allowed) return 'subject';
	if (course.activeEntries > 0) return 'queue';
	if (course.firstDate) return 'started';
	if (course.lessons.length > 1) return 'ambiguous';
	if (course.status === 'closed') return 'closed';
	return null;
}
/** The tool of a course that left the schedule: every planned card with its differences and decision. */
export function rebindOptions(
	from: WaitlistCourse,
	data: Pick<AdminWaitlistData, 'courses'>
): RebindOptions | undefined {
	if ((from.status !== 'gone' && from.status !== 'not_in_schedule') || !from.price)
		return undefined;
	const facts = { ...from.course, age: keyAge(from.key) };
	return {
		queue: from.activeEntries > 0,
		families: from.waitingFamilies,
		children: from.children,
		unconfirmed: from.activeEntries - from.waitingFamilies,
		targets: data.courses.map((course) => {
			const lesson = course.lessons[0];
			const comparison = compareCourses(facts, lessonFacts(lesson));
			return {
				key: course.key,
				lesson,
				comparison,
				block: targetBlock(course, comparison),
				price: course.price,
			};
		}),
	};
}
const amount = z.union([z.string().max(20), z.number()]).optional();
const rebindInput = z.object({
	fromKey: z.string().min(2).max(400),
	lessonId: z.string().regex(/^[a-f0-9]{64}$/u),
	monthly: amount,
	yearly: amount,
});
/** Both sums typed in the dialog, none, or a refusal for an invalid or a single one. */
function typedSums(input: z.infer<typeof rebindInput>) {
	if (input.monthly === undefined && input.yearly === undefined) return null;
	const monthlyCents = parseEuroCents(String(input.monthly ?? ''));
	const yearlyCents = parseEuroCents(String(input.yearly ?? ''));
	if (monthlyCents === null || yearlyCents === null)
		throw new IntakeError('WAITLIST_PRICE_INVALID');
	return { monthlyCents, yearlyCents };
}
const conflict = () => new IntakeError('WAITLIST_STATUS_CONFLICT', 409);
const audit = (sql: string, params: unknown[]): StatementSpec => ({
	sql: `INSERT INTO audit_events(id, actor_user_id, actor_kind, action, target_kind, target_id, request_id, safe_diff_json, created_at) ${sql}`,
	params,
});

/** Rebind, the orange and red marks and "Als neuen Kurs öffnen" (WL-15). */
export class WaitlistRebind {
	constructor(
		private readonly db: DatabaseBoundary,
		private readonly prices: WaitlistPrices,
		private readonly signup: WaitlistSignup
	) {}
	/**
	 * One D1 batch in the order of TRIAL_INTAKE_WAITLIST_TZ: price of the target, journal row,
	 * unconfirmed signups cancelled, waiting signups moved, old price deleted, audit. Each statement
	 * repeats the state the server checked; a repeat finds the old course gone and writes nothing.
	 * Without waiting signups only the price moves, with sums the admin may change and no journal.
	 */
	async rebind(
		user: App.Locals['user'],
		lessons: readonly Lesson[],
		raw: unknown,
		requestId: string,
		now: string
	): Promise<{ rebound: boolean; kind?: RebindComparison['kind'] }> {
		const actor = await requireActiveAdmin(this.db, user);
		const input = rebindInput.parse(raw);
		const lesson = lessons.find((l) => l.id === input.lessonId);
		if (!lesson) throw new IntakeError('INTAKE_LESSON_UNAVAILABLE', 409);
		if (!isPlannedLesson(lesson)) throw new IntakeError('WAITLIST_LESSON_NOT_PLANNED', 409);
		const data = await this.prices.overview(user, lessons);
		const from = data.unscheduled.find((course) => course.key === input.fromKey);
		if (!from) return { rebound: false };
		const toKey = plannedCourseKey(lesson);
		const target = rebindOptions(from, data)?.targets.find((t) => t.key === toKey);
		if (!target || !from.price) throw conflict();
		if (target.block === 'subject') throw new IntakeError('WAITLIST_REBIND_SUBJECT', 409);
		if (target.block) throw new IntakeError('WAITLIST_REBIND_TARGET_BUSY', 409);
		const { kind, differences, reasons } = target.comparison;
		const queue = from.activeEntries > 0;
		const before = {
			monthlyCents: from.price.monthlyCents,
			yearlyCents: from.price.yearlyCents,
		};
		const typed = typedSums(input);
		if (queue && kind === 'price' && !typed) throw new IntakeError('WAITLIST_PRICE_INVALID');
		// WL-06 item 6: without a duration change a family keeps the sum it agreed to.
		if (
			queue &&
			kind !== 'price' &&
			typed &&
			(typed.monthlyCents !== before.monthlyCents || typed.yearlyCents !== before.yearlyCents)
		)
			throw new IntakeError('WAITLIST_PRICE_LOCKED', 409);
		const after = queue && kind !== 'price' ? before : (typed ?? before);
		const attention = queue
			? mergeReasons(from.attention, kind === 'notify' ? reasons : [])
			: [];
		const age = lessonAgeRange(lesson);
		const targetBefore = target.price && [
			target.price.monthlyCents,
			target.price.yearlyCents,
			target.price.minParticipants,
		];
		// The state the server checked: the old price row unchanged, the target free, no open start.
		const free = `EXISTS(SELECT 1 FROM trial_intake_planned_prices f WHERE f.course_key = ? AND f.monthly_cents = ?
		 AND f.yearly_cents = ? AND f.min_participants = ? AND f.attention_reasons_json IS ?)
		 AND NOT EXISTS(SELECT 1 FROM trial_intake_waitlist_entries t WHERE t.course_key = ? AND t.status = 'waiting')
		 AND NOT EXISTS(SELECT 1 FROM trial_intake_waitlist_starts s WHERE s.course_key IN (?, ?) AND s.reopened_at IS NULL)
		 ${queue ? '' : `AND NOT EXISTS(SELECT 1 FROM trial_intake_waitlist_entries w WHERE w.course_key = ? AND w.status = 'waiting')`}
		 AND ${ACTIVE}`;
		const freeParams = [
			from.key,
			before.monthlyCents,
			before.yearlyCents,
			from.price.minParticipants,
			from.attention ? JSON.stringify(from.attention) : null,
			toKey,
			from.key,
			toKey,
			...(queue ? [] : [from.key]),
			actor.id,
		];
		// The target price row this batch wrote: its sums, author and time.
		const written = `EXISTS(SELECT 1 FROM trial_intake_planned_prices p WHERE p.course_key = ? AND p.monthly_cents = ?
		 AND p.yearly_cents = ? AND p.updated_by = ? AND p.updated_at = ?)`;
		const writtenParams = [toKey, after.monthlyCents, after.yearlyCents, actor.id, now];
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO trial_intake_planned_prices(course_key, subject, weekday, start_time, end_time, teacher, building,
			 room, age_min, age_max, monthly_cents, yearly_cents, min_participants, attention_reasons_json, updated_by, created_at, updated_at)
			 SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${free}
			 AND COALESCE((SELECT json_array(monthly_cents, yearly_cents, min_participants) FROM trial_intake_planned_prices
			 WHERE course_key = ?), 'null') = ?
			 ON CONFLICT(course_key) DO UPDATE SET subject = excluded.subject, weekday = excluded.weekday,
			 start_time = excluded.start_time, end_time = excluded.end_time, teacher = excluded.teacher,
			 building = excluded.building, room = excluded.room, age_min = excluded.age_min, age_max = excluded.age_max,
			 monthly_cents = excluded.monthly_cents, yearly_cents = excluded.yearly_cents,
			 min_participants = excluded.min_participants, attention_reasons_json = excluded.attention_reasons_json,
			 updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
				params: [
					toKey,
					lesson.subject,
					lesson.weekday,
					lesson.start,
					lesson.end,
					lesson.teacher,
					lesson.building,
					lesson.room,
					age?.min ?? null,
					age?.max ?? null,
					after.monthlyCents,
					after.yearlyCents,
					from.price.minParticipants,
					attention.length ? JSON.stringify(attention) : null,
					actor.id,
					now,
					now,
					...freeParams,
					toKey,
					JSON.stringify(targetBefore),
				],
			},
		];
		const safe = {
			from: from.key,
			to: toKey,
			kind,
			queue,
			fields: differences.map((d) => d.field),
			reasons,
			before,
			after,
			targetBefore: target.price && {
				monthlyCents: target.price.monthlyCents,
				yearlyCents: target.price.yearlyCents,
				minParticipants: target.price.minParticipants,
			},
		};
		const journalId = crypto.randomUUID();
		const journal = 'EXISTS(SELECT 1 FROM trial_intake_waitlist_rebinds WHERE id = ?)';
		if (queue)
			statements.push(
				{
					// Trigger 7 of 0032: the kind matches the durations and the sums of the old price.
					sql: `INSERT INTO trial_intake_waitlist_rebinds(id, from_key, to_key, from_lesson_json, to_lesson_json, kind,
				 differences_json, from_monthly_cents, from_yearly_cents, to_monthly_cents, to_yearly_cents, actor_user_id, created_at)
				 SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${free} AND ${written}`,
					params: [
						journalId,
						from.key,
						toKey,
						JSON.stringify(from.course),
						JSON.stringify(lesson),
						kind,
						JSON.stringify({ differences, reasons }),
						before.monthlyCents,
						before.yearlyCents,
						after.monthlyCents,
						after.yearlyCents,
						actor.id,
						now,
						...freeParams,
						...writtenParams,
					],
				},
				{
					// Their verification letter describes the old course; a late confirmation closes them.
					sql: `UPDATE trial_intake_waitlist_entries SET status = 'cancelled', status_changed_at = ?
				 WHERE course_key = ? AND status = 'waiting' AND EXISTS(SELECT 1 FROM trial_intake_requests r
				 WHERE r.id = trial_intake_waitlist_entries.request_id AND r.state = 'pending_email') AND ${journal}`,
					params: [now, from.key, journalId],
				},
				{
					// Trigger 6 of 0032: the journal row and the target price with its sums must exist.
					sql: `UPDATE trial_intake_waitlist_entries SET course_key = ? WHERE course_key = ? AND status = 'waiting' AND ${journal}`,
					params: [toKey, from.key, journalId],
				},
				{
					sql: `DELETE FROM trial_intake_planned_prices WHERE course_key = ? AND ${journal}`,
					params: [from.key, journalId],
				},
				audit(
					`SELECT ?, ?, 'user', 'trial_intake.waitlist_rebound', 'trial_intake', substr(j.to_key, 1, 200), ?,
				 json_patch(?, json_object(
				  'moved', (SELECT COUNT(*) FROM trial_intake_waitlist_entries e WHERE e.course_key = j.to_key AND e.status = 'waiting'),
				  'cancelled', (SELECT COUNT(*) FROM trial_intake_waitlist_entries e WHERE e.course_key = j.from_key
				   AND e.status = 'cancelled' AND e.status_changed_at = j.created_at))), ?
				 FROM trial_intake_waitlist_rebinds j WHERE j.id = ?`,
					[crypto.randomUUID(), actor.id, requestId, JSON.stringify(safe), now, journalId]
				)
			);
		else
			statements.push(
				{
					sql: `DELETE FROM trial_intake_planned_prices WHERE course_key = ? AND ${free} AND ${written}`,
					params: [from.key, ...freeParams, ...writtenParams],
				},
				audit(
					`SELECT ?, ?, 'user', 'trial_intake.waitlist_rebound', 'trial_intake', ?, ?, ?, ?
				 WHERE NOT EXISTS(SELECT 1 FROM trial_intake_planned_prices WHERE course_key = ?) AND ${written}`,
					[
						crypto.randomUUID(),
						actor.id,
						toKey.slice(0, 200),
						requestId,
						JSON.stringify(safe),
						now,
						from.key,
						...writtenParams,
					]
				)
			);
		try {
			await this.db.batch(statements);
		} catch (error) {
			// A trigger of 0032 refused a state that changed after the check; nothing is written.
			if (/waitlist /u.test(String(error))) throw conflict();
			throw error;
		}
		const [done, remaining] = await this.db.batch<{ n: number }>([
			queue
				? {
						sql: 'SELECT COUNT(*) AS n FROM trial_intake_waitlist_rebinds WHERE id = ?',
						params: [journalId],
					}
				: {
						sql: `SELECT COUNT(*) AS n FROM trial_intake_planned_prices p WHERE p.course_key = ? AND p.monthly_cents = ?
					 AND p.yearly_cents = ? AND p.updated_by = ? AND p.updated_at = ?`,
						params: writtenParams,
					},
			{
				sql: 'SELECT COUNT(*) AS n FROM trial_intake_planned_prices WHERE course_key = ?',
				params: [from.key],
			},
		]);
		if (Number(done.results[0]?.n) && !Number(remaining.results[0]?.n))
			return { rebound: true, kind };
		// A parallel rebind of the same course was first: this one changed nothing.
		if (!Number(remaining.results[0]?.n)) return { rebound: false };
		throw conflict();
	}
	/** "Familien informiert": the orange mark goes, with the reasons in the audit. */
	async informed(user: App.Locals['user'], raw: unknown, requestId: string, now: string) {
		const actor = await requireActiveAdmin(this.db, user);
		const { key } = z.object({ key: z.string().min(2).max(400) }).parse(raw);
		const row = await this.db.first<{ attention_reasons_json: string | null }>({
			sql: 'SELECT attention_reasons_json FROM trial_intake_planned_prices WHERE course_key = ?',
			params: [key],
		});
		const reasons = row?.attention_reasons_json;
		if (!reasons) return { changed: false };
		const [, cleared] = await this.db.batch([
			audit(
				`SELECT ?, ?, 'user', 'trial_intake.waitlist_attention_cleared', 'trial_intake', substr(course_key, 1, 200), ?,
			 json_object('key', course_key, 'reasons', json(attention_reasons_json)), ?
			 FROM trial_intake_planned_prices WHERE course_key = ? AND attention_reasons_json = ? AND ${ACTIVE}`,
				[crypto.randomUUID(), actor.id, requestId, now, key, reasons, actor.id]
			),
			{
				sql: `UPDATE trial_intake_planned_prices SET attention_reasons_json = NULL
			 WHERE course_key = ? AND attention_reasons_json = ? AND ${ACTIVE}`,
				params: [key, reasons, actor.id],
			},
		]);
		// A rebind added reasons meanwhile: the admin sees them before clearing.
		if (!cleared.meta.changes) throw conflict();
		return { changed: true };
	}
	/**
	 * The call after a duration change: "Neuen Preis bestätigt" records the new sum of the family's
	 * tariff, "Abgelehnt" withdraws the family as an admin withdrawal does. The snapshot stays.
	 */
	async decide(user: App.Locals['user'], raw: unknown, requestId: string, now: string) {
		const actor = await requireActiveAdmin(this.db, user);
		const input = z
			.object({ requestId: z.uuid(), decision: z.enum(['confirmed', 'declined']) })
			.parse(raw);
		const entry = await readEntry(this.db, input.requestId);
		if (!entry || entry.status !== 'waiting') throw conflict();
		const marks = (await this.prices.state()).priceMarks(entry.course_key);
		const rebind = marks.row;
		if (!rebind) throw conflict();
		if (!marks.open.includes(entry.request_id)) {
			const decided = await this.db.first({
				sql: 'SELECT 1 FROM trial_intake_waitlist_price_confirmations WHERE request_id = ? AND rebind_id = ?',
				params: [entry.request_id, rebind.id],
			});
			if (decided) return { changed: false };
			throw conflict();
		}
		const decisionAudit = (action: string) =>
			audit(
				`SELECT ?, ?, 'user', ?, 'trial_intake', c.request_id, ?,
			 json_object('key', ?, 'rebindId', c.rebind_id, 'decision', c.decision, 'priceCents', c.price_cents), ?
			 FROM trial_intake_waitlist_price_confirmations c
			 WHERE c.request_id = ? AND c.rebind_id = ? AND c.created_at = ? AND c.actor_user_id = ?`,
				[
					crypto.randomUUID(),
					actor.id,
					action,
					requestId,
					entry.course_key,
					now,
					entry.request_id,
					rebind.id,
					now,
					actor.id,
				]
			);
		if (input.decision === 'declined') {
			// The row depends on the withdrawal of the same batch: no refusal without leaving the list.
			await this.signup.withdrawByAdmin(user, entry.request_id, requestId, now, [
				{
					sql: `INSERT OR IGNORE INTO trial_intake_waitlist_price_confirmations(request_id, rebind_id, decision, price_cents,
				 actor_user_id, created_at) SELECT request_id, ?, 'declined', NULL, ?, ? FROM trial_intake_waitlist_entries
				 WHERE request_id = ? AND status = 'withdrawn' AND status_changed_at = ?`,
					params: [rebind.id, actor.id, now, entry.request_id, now],
				},
				decisionAudit('trial_intake.waitlist_price_declined'),
			]);
			return { changed: true };
		}
		const [inserted] = await this.db.batch([
			{
				sql: `INSERT OR IGNORE INTO trial_intake_waitlist_price_confirmations(request_id, rebind_id, decision, price_cents,
			 actor_user_id, created_at)
			 SELECT e.request_id, j.id, 'confirmed', CASE e.tariff WHEN 'monthly' THEN j.to_monthly_cents ELSE j.to_yearly_cents END, ?, ?
			 FROM trial_intake_waitlist_entries e JOIN trial_intake_requests r ON r.id = e.request_id
			 JOIN trial_intake_waitlist_rebinds j ON j.id = ?
			 WHERE e.request_id = ? AND e.course_key = ? AND e.status = 'waiting' AND r.state = 'verified'
			 AND e.created_at < j.created_at AND ${ACTIVE}`,
				params: [actor.id, now, rebind.id, entry.request_id, entry.course_key, actor.id],
			},
			decisionAudit('trial_intake.waitlist_price_confirmed'),
		]);
		if (!inserted.meta.changes) throw conflict();
		return { changed: true };
	}
	/**
	 * "Als neuen Kurs öffnen": the open start of the course is closed, so the course takes signups
	 * again and its price may change. The start and its signups stay as they are.
	 */
	async reopen(user: App.Locals['user'], raw: unknown, requestId: string, now: string) {
		const actor = await requireActiveAdmin(this.db, user);
		const { key } = z.object({ key: z.string().min(2).max(400) }).parse(raw);
		const [, reopened] = await this.db.batch([
			audit(
				`SELECT ?, ?, 'user', 'trial_intake.waitlist_reopened', 'trial_intake', s.id, ?,
			 json_object('key', s.course_key, 'firstDate', s.first_date, 'participants', s.participants), ?
			 FROM trial_intake_waitlist_starts s WHERE s.course_key = ? AND s.reopened_at IS NULL AND ${ACTIVE}`,
				[crypto.randomUUID(), actor.id, requestId, now, key, actor.id]
			),
			{
				sql: `UPDATE trial_intake_waitlist_starts SET reopened_at = ?, reopened_by = ?
			 WHERE course_key = ? AND reopened_at IS NULL AND ${ACTIVE}`,
				params: [now, actor.id, key, actor.id],
			},
		]);
		return { reopened: reopened.meta.changes > 0 };
	}
}

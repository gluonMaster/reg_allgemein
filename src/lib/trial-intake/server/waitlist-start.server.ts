import { z } from 'zod';
import type { DatabaseBoundary, StatementSpec } from '$lib/server/db/database';
import type {
	Lesson,
	WaitlistCourse,
	WaitlistStartBlock,
	WaitlistStartOptions,
} from '../contracts';
import { berlinDate, lessonDates } from '../dates';
import { isPlannedLesson, plannedCourseKey } from '../planned';
import { ACTIVE, requireActiveAdmin } from './admin.server';
import { IntakeError } from './validation.server';
import type { WaitlistPrices } from './prices.server';
import type { IntakeChild, IntakeRequest } from './model.server';
import { entryWithConfirmation, readEntry } from './waitlist-core.server';
import { waitlistStartEmail } from './waitlist-templates.server';

/** WL-10: the next eight allowed dates of the weekday from tomorrow; the default is a week ahead. */
export function startDates(weekday: number, now: string) {
	const dates = lessonDates(weekday, now, 8);
	const week = new Date(berlinDate(now));
	week.setUTCDate(week.getUTCDate() + 7);
	const earliest = week.toISOString().slice(0, 10);
	return { dates, defaultDate: dates.find((date) => date >= earliest) ?? dates.at(-1)! };
}
/**
 * WL-10: a course starts when its card is in the schedule and unambiguous, the price is set, the
 * threshold is reached, no red mark is open (WL-15), it has not started and a PDF renderer exists.
 * A probe needs the same except the threshold and the red mark, and one confirmed waiting signup.
 */
export function startBlocks(
	course: Pick<WaitlistCourse, 'status' | 'lessons' | 'price' | 'waitingFamilies' | 'priceOpen'>,
	renderer: boolean
): Pick<WaitlistStartOptions, 'start' | 'probe'> {
	const common: WaitlistStartBlock | null =
		course.status === 'started'
			? 'started'
			: !course.lessons.length
				? 'not_in_schedule'
				: course.status === 'ambiguous'
					? 'ambiguous'
					: course.status === 'closed'
						? 'closed'
						: !course.price
							? 'price_missing'
							: !renderer
								? 'renderer'
								: null;
	return {
		start:
			common ??
			(course.priceOpen.length
				? 'price_open'
				: course.status === 'ready'
					? null
					: 'threshold'),
		probe: common ?? (course.waitingFamilies > 0 ? null : 'no_entries'),
	};
}
/** `WAITLIST_START_THRESHOLD`, `WAITLIST_START_RENDERER`, …: the reason is the code. */
export const startBlocked = (block: WaitlistStartBlock) =>
	new IntakeError(`WAITLIST_START_${block.toUpperCase()}`, 409);
const courseInput = z.object({
	lessonId: z.string().regex(/^[a-f0-9]{64}$/u),
	firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
});
const familyInput = courseInput.extend({ requestId: z.uuid() });
/** SQL: children of confirmed waiting signups of the course, counted when the statement runs. */
const PARTICIPANTS = `(SELECT COALESCE(SUM((SELECT COUNT(*) FROM trial_intake_children c WHERE c.request_id = e.request_id)), 0)
 FROM trial_intake_waitlist_entries e JOIN trial_intake_requests q ON q.id = e.request_id
 WHERE e.course_key = ? AND e.status = 'waiting' AND q.state = 'verified')`;
const OPEN_START_OF_KEY = `EXISTS(SELECT 1 FROM trial_intake_waitlist_starts s
 WHERE s.course_key = ? AND s.reopened_at IS NULL)`;
/**
 * SQL: the red mark of price row `p` (WL-15). Bound to the latest duration change of the queue; a
 * confirmed waiting signup from before it without a decision blocks the start. Without such a
 * change (NULL) nothing is open. While the course has signups no rebind can come into it, so the
 * change cannot move between the check and this statement.
 */
const PRICE_OPEN = `EXISTS(SELECT 1 FROM trial_intake_waitlist_entries e JOIN trial_intake_requests q ON q.id = e.request_id
 JOIN trial_intake_waitlist_rebinds j ON j.id = ?
 WHERE e.course_key = p.course_key AND e.status = 'waiting' AND q.state = 'verified' AND e.created_at < j.created_at
 AND NOT EXISTS(SELECT 1 FROM trial_intake_waitlist_price_confirmations c WHERE c.request_id = e.request_id AND c.rebind_id = j.id))`;

/** Start dialog, probe letter and the confirmed course start (WL-10, TRIAL_INTAKE_WAITLIST). */
export class WaitlistStart {
	constructor(
		private readonly db: DatabaseBoundary,
		private readonly prices: WaitlistPrices,
		private readonly renderer: boolean,
		private readonly emailMaxAttempts = 5
	) {}
	/** What the start dialog of a course offers; nothing for a course without a planned card. */
	options(course: WaitlistCourse, now: string): WaitlistStartOptions | undefined {
		const lesson = course.lessons[0];
		if (!lesson) return undefined;
		return { ...startDates(lesson.weekday, now), ...startBlocks(course, this.renderer) };
	}
	private card(lessons: readonly Lesson[], lessonId: string) {
		const lesson = lessons.find((l) => l.id === lessonId);
		if (!lesson) throw new IntakeError('INTAKE_LESSON_UNAVAILABLE', 409);
		if (!isPlannedLesson(lesson)) throw new IntakeError('WAITLIST_LESSON_NOT_PLANNED', 409);
		return { lesson, key: plannedCourseKey(lesson) };
	}
	/** The server repeats every check of the dialog: course state, renderer and date. */
	private async check(
		lessons: readonly Lesson[],
		key: string,
		firstDate: string,
		mode: 'start' | 'probe',
		now: string
	) {
		const course = await this.prices.course(lessons, key);
		const options = course && this.options(course, now);
		if (!options) throw new IntakeError('WAITLIST_LESSON_NOT_PLANNED', 409);
		const block = options[mode];
		if (block) throw startBlocked(block);
		if (!options.dates.includes(firstDate))
			throw new IntakeError('WAITLIST_START_DATE_INVALID', 409);
		return course!;
	}
	/** A confirmed waiting signup of the course, as the letter needs it. */
	private async family(key: string, requestId: string) {
		const request = await this.db.first<IntakeRequest>({
			sql: `SELECT r.* FROM trial_intake_requests r JOIN trial_intake_waitlist_entries e ON e.request_id = r.id
			 WHERE r.id = ? AND e.course_key = ? AND e.status = 'waiting' AND r.state = 'verified'`,
			params: [requestId, key],
		});
		const entry = request && (await readEntry(this.db, requestId));
		if (!request || !entry) throw new IntakeError('WAITLIST_STATUS_CONFLICT', 409);
		const children = await this.db.all<IntakeChild>({
			sql: 'SELECT * FROM trial_intake_children WHERE request_id = ? ORDER BY position',
			params: [requestId],
		});
		return {
			request,
			children: children.results,
			entry: await entryWithConfirmation(this.db, entry),
		};
	}
	/** The start letter the chosen family would get on the chosen date; nothing is written. */
	async preview(user: App.Locals['user'], lessons: readonly Lesson[], raw: unknown, now: string) {
		await requireActiveAdmin(this.db, user);
		const value = familyInput.parse(raw);
		const { lesson, key } = this.card(lessons, value.lessonId);
		await this.check(lessons, key, value.firstDate, 'probe', now);
		const family = await this.family(key, value.requestId);
		const message = waitlistStartEmail(family, family.entry, {
			lesson,
			firstDate: value.firstDate,
		});
		return { subject: message.subject, text: message.text };
	}
	/**
	 * "Probe-E-Mail an mich": the start letter with PDF of one family and date to the signed-in
	 * admin. No signup changes; the probe row keeps the card the admin saw.
	 */
	async probe(
		user: App.Locals['user'],
		lessons: readonly Lesson[],
		raw: unknown,
		requestId: string,
		now: string
	) {
		const actor = await requireActiveAdmin(this.db, user);
		const value = familyInput.parse(raw);
		const { lesson, key } = this.card(lessons, value.lessonId);
		await this.check(lessons, key, value.firstDate, 'probe', now);
		const id = `intake-wl:probe:${crypto.randomUUID()}`;
		const [inserted] = await this.db.batch([
			{
				sql: `INSERT INTO trial_intake_waitlist_email_outbox(id, kind, request_id, probe_date, probe_recipient_user_id,
			 probe_lesson_json, dedupe_key, max_attempts, created_at, updated_at)
			 SELECT ?, 'probe', e.request_id, ?, ?, ?, ?, ?, ?, ? FROM trial_intake_waitlist_entries e
			 JOIN trial_intake_requests r ON r.id = e.request_id
			 WHERE e.request_id = ? AND e.course_key = ? AND e.status = 'waiting' AND r.state = 'verified'
			 AND NOT ${OPEN_START_OF_KEY} AND ${ACTIVE}`,
				params: [
					id,
					value.firstDate,
					actor.id,
					JSON.stringify(lesson),
					`trial-intake:waitlist-probe:${id.slice('intake-wl:probe:'.length)}`,
					this.emailMaxAttempts,
					now,
					now,
					value.requestId,
					key,
					key,
					actor.id,
				],
			},
			{
				// No family data in the audit: the signup is named by its opaque ID.
				sql: `INSERT INTO audit_events(id, actor_user_id, actor_kind, action, target_kind, target_id, request_id, safe_diff_json, created_at)
			 SELECT ?, ?, 'user', 'trial_intake.waitlist_probe_sent', 'trial_intake', o.request_id, ?, ?, ?
			 FROM trial_intake_waitlist_email_outbox o WHERE o.id = ?`,
				params: [
					crypto.randomUUID(),
					actor.id,
					requestId,
					JSON.stringify({ key, firstDate: value.firstDate }),
					now,
					id,
				],
			},
		]);
		if (!inserted.meta.changes) throw new IntakeError('WAITLIST_STATUS_CONFLICT', 409);
		return { queued: true };
	}
	private openStart(key: string) {
		return this.db.first<{ id: string; first_date: string; participants: number }>({
			sql: `SELECT id, first_date, participants FROM trial_intake_waitlist_starts
			 WHERE course_key = ? AND reopened_at IS NULL`,
			params: [key],
		});
	}
	/**
	 * The confirmed start, one D1 batch: the start with the catalog card, confirmed waiting signups
	 * started, unconfirmed ones cancelled, one start letter per family, audit. The threshold, the
	 * price and the absence of an open start are conditions inside SQL; a repeat or double click
	 * returns the start that exists and writes nothing.
	 */
	async start(
		user: App.Locals['user'],
		lessons: readonly Lesson[],
		raw: unknown,
		requestId: string,
		now: string
	) {
		const actor = await requireActiveAdmin(this.db, user);
		const value = courseInput.parse(raw);
		if (!raw || typeof raw !== 'object' || Reflect.get(raw, 'checked') !== true)
			throw new IntakeError('WAITLIST_START_UNCHECKED');
		const { lesson, key } = this.card(lessons, value.lessonId);
		const existing = await this.openStart(key);
		if (existing) return startResult(existing, false);
		const course = await this.check(lessons, key, value.firstDate, 'start', now);
		const id = crypto.randomUUID();
		const ours = 'EXISTS(SELECT 1 FROM trial_intake_waitlist_starts s WHERE s.id = ?)';
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO trial_intake_waitlist_starts(id, course_key, first_date, lesson_json, participants, started_by, started_at)
			 SELECT ?, p.course_key, ?, ?, n.children, ?, ? FROM trial_intake_planned_prices p, (SELECT ${PARTICIPANTS} AS children) n
			 WHERE p.course_key = ? AND n.children > 0 AND n.children >= p.min_participants
			 AND NOT ${OPEN_START_OF_KEY} AND NOT ${PRICE_OPEN} AND ${ACTIVE}`,
				params: [
					id,
					value.firstDate,
					JSON.stringify(lesson),
					actor.id,
					now,
					key,
					key,
					key,
					course.priceRebind?.id ?? null,
					actor.id,
				],
			},
			{
				sql: `UPDATE trial_intake_waitlist_entries SET status = 'started', start_id = ?, status_changed_at = ?
			 WHERE course_key = ? AND status = 'waiting' AND EXISTS(SELECT 1 FROM trial_intake_requests r
			 WHERE r.id = trial_intake_waitlist_entries.request_id AND r.state = 'verified') AND ${ours}`,
				params: [id, now, key, id],
			},
			{
				// Their verification letter described a course that has now begun (WL-10).
				sql: `UPDATE trial_intake_waitlist_entries SET status = 'cancelled', status_changed_at = ?
			 WHERE course_key = ? AND status = 'waiting' AND EXISTS(SELECT 1 FROM trial_intake_requests r
			 WHERE r.id = trial_intake_waitlist_entries.request_id AND r.state = 'pending_email') AND ${ours}`,
				params: [now, key, id],
			},
			{
				sql: `INSERT INTO trial_intake_waitlist_email_outbox(id, kind, request_id, start_id, dedupe_key, max_attempts, created_at, updated_at)
			 SELECT 'intake-wl:start:' || e.start_id || ':' || e.request_id, 'start', e.request_id, e.start_id,
			 'trial-intake:waitlist-start:' || e.start_id || ':' || e.request_id, ?, ?, ?
			 FROM trial_intake_waitlist_entries e WHERE e.start_id = ? AND e.status = 'started'`,
				params: [this.emailMaxAttempts, now, now, id],
			},
			{
				sql: `INSERT INTO audit_events(id, actor_user_id, actor_kind, action, target_kind, target_id, request_id, safe_diff_json, created_at)
			 SELECT ?, ?, 'user', 'trial_intake.waitlist_started', 'trial_intake', s.id, ?,
			 json_object('key', s.course_key, 'firstDate', s.first_date, 'participants', s.participants), ?
			 FROM trial_intake_waitlist_starts s WHERE s.id = ?`,
				params: [crypto.randomUUID(), actor.id, requestId, now, id],
			},
		];
		await this.db.batch(statements);
		const after = await this.openStart(key);
		// Not started: a withdrawal or an expiry took the course below its threshold meanwhile.
		if (!after)
			throw startBlocked(
				(await this.prices.course(lessons, key))?.priceOpen.length
					? 'price_open'
					: 'threshold'
			);
		return startResult(after, after.id === id);
	}
	/** A start letter given up after its retries, queued again by the admin with audit. */
	async retryLetter(
		user: App.Locals['user'],
		entryId: string,
		letterId: string,
		requestId: string,
		now: string
	) {
		const actor = await requireActiveAdmin(this.db, user);
		const [, changed] = await this.db.batch([
			{
				sql: `INSERT INTO audit_events(id, actor_user_id, actor_kind, action, target_kind, target_id, request_id, safe_diff_json, created_at)
			 SELECT ?, ?, 'user', 'trial_intake.waitlist_letter_retry', 'trial_intake', request_id, ?, '{}', ?
			 FROM trial_intake_waitlist_email_outbox WHERE id = ? AND request_id = ? AND kind = 'start' AND status = 'dead' AND ${ACTIVE}`,
				params: [
					crypto.randomUUID(),
					actor.id,
					requestId,
					now,
					letterId,
					entryId,
					actor.id,
				],
			},
			{
				sql: `UPDATE trial_intake_waitlist_email_outbox SET status = 'retry', next_attempt_at = ?, max_attempts = attempts + 5,
			 last_error_code = NULL, updated_at = ? WHERE id = ? AND request_id = ? AND kind = 'start' AND status = 'dead' AND ${ACTIVE}`,
				params: [now, now, letterId, entryId, actor.id],
			},
		]);
		if (!changed.meta.changes) throw new IntakeError('WAITLIST_STATUS_CONFLICT', 409);
		return { queued: true };
	}
}
function startResult(
	start: { id: string; first_date: string; participants: number },
	created: boolean
) {
	return {
		startId: start.id,
		firstDate: start.first_date,
		participants: start.participants,
		created,
	};
}

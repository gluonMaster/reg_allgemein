import { z } from 'zod';
import type { DatabaseBoundary, StatementSpec } from '$lib/server/db/database';
import type { AdminActor } from '$lib/server/security/authorization';
import { ACTIVE, requireActiveAdmin } from './admin.server';
import { closedKey, readClosedKeys } from './closed.server';
import { IntakeError } from './validation.server';
import { readPriceFile, type PriceExportRow, type PriceFileRow } from './price-files.server';
import { isPlannedLesson, plannedCourseKey, plannedText } from '../planned';
import { lessonAgeRange } from '../age';
import {
	MIN_PARTICIPANTS_DEFAULT,
	MIN_PARTICIPANTS_MAX,
	PRICE_MAX_CENTS,
	parseEuroCents,
	parseMinParticipants,
} from '../prices';
import { dayLabel, waitlistStatusText } from '../i18n';
import type {
	AdminWaitlistData,
	Lesson,
	WaitlistCourse,
	WaitlistImportPreview,
	WaitlistImportRow,
	WaitlistPriceChange,
} from '../contracts';

interface PriceRow {
	course_key: string;
	subject: string;
	weekday: number;
	start_time: string;
	end_time: string;
	teacher: string;
	building: Lesson['building'];
	room: string;
	monthly_cents: number;
	yearly_cents: number;
	min_participants: number;
	updated_at: string;
}
interface CountRow {
	course_key: string;
	children: number;
	unconfirmed_children: number;
	active_entries: number;
	waiting_families: number;
	lesson_json: string;
}
type Values = Omit<WaitlistPriceChange, 'key'>;
interface Planned {
	change: WaitlistPriceChange;
	lesson: Lesson;
}
const LOCKED = /waitlist price locked/u;
const cents = z.number().int().min(1).max(PRICE_MAX_CENTS);
const threshold = z.number().int().min(1).max(MIN_PARTICIPANTS_MAX);
export const priceChangesSchema = z
	.array(
		z
			.object({
				key: z.string().min(2).max(400),
				monthlyCents: cents,
				yearlyCents: cents,
				minParticipants: threshold,
			})
			.strict()
	)
	.max(500)
	.refine((changes) => new Set(changes.map((c) => c.key)).size === changes.length);
const sameValues = (a: Values, b: Values) =>
	a.monthlyCents === b.monthlyCents &&
	a.yearlyCents === b.yearlyCents &&
	a.minParticipants === b.minParticipants;
const lockedError = (activeEntries: number) =>
	new IntakeError('WAITLIST_PRICE_LOCKED', 409, { activeEntries });
const WEEKDAYS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
/** German name, Mo-So or 1-7. */
export function parseWeekday(value: string): number | null {
	const text = plannedText(value).replace(/\.$/u, '');
	if (/^[1-7]$/u.test(text)) return Number(text);
	const index = WEEKDAYS.findIndex((day) => day === text || day.slice(0, 2) === text);
	return index < 0 ? null : index + 1;
}
/** "16:00–17:00" with a dash or a hyphen. */
export function parseTimeRange(value: string): { start: string; end: string } | null {
	const match = /^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/u.exec(value.trim());
	if (!match) return null;
	const [start, end] = [
		[match[1], match[2]],
		[match[3], match[4]],
	].map(([h, m]) => `${h.padStart(2, '0')}:${m}`);
	const valid = (t: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(t);
	return valid(start) && valid(end) && end > start ? { start, end } : null;
}

/** Prices, threshold and queue status of the planned courses (WL-05, WL-06, WL-07). */
export class WaitlistPrices {
	constructor(readonly db: DatabaseBoundary) {}
	private async state() {
		const [prices, counts, starts] = await this.db.batch<Record<string, unknown>>([
			{ sql: 'SELECT * FROM trial_intake_planned_prices' },
			{
				// Confirmed waiting entries count against the threshold; every waiting entry locks the price.
				sql: `SELECT e.course_key,
			 COALESCE(SUM(CASE WHEN r.state = 'verified' THEN (SELECT COUNT(*) FROM trial_intake_children c WHERE c.request_id = e.request_id) END), 0) AS children,
			 COALESCE(SUM(CASE WHEN r.state = 'pending_email' THEN (SELECT COUNT(*) FROM trial_intake_children c WHERE c.request_id = e.request_id) END), 0) AS unconfirmed_children,
			 COUNT(*) AS active_entries, COALESCE(SUM(r.state = 'verified'), 0) AS waiting_families,
			 MIN(e.lesson_json) AS lesson_json
			 FROM trial_intake_waitlist_entries e JOIN trial_intake_requests r ON r.id = e.request_id
			 WHERE e.status = 'waiting' GROUP BY e.course_key`,
			},
			{
				sql: `SELECT course_key, first_date FROM trial_intake_waitlist_starts WHERE reopened_at IS NULL`,
			},
		]);
		return {
			prices: new Map(
				(prices.results as unknown as PriceRow[]).map((row) => [row.course_key, row])
			),
			counts: new Map(
				(counts.results as unknown as CountRow[]).map((row) => [row.course_key, row])
			),
			starts: new Map(
				(starts.results as { course_key: string; first_date: string }[]).map((row) => [
					row.course_key,
					row.first_date,
				])
			),
		};
	}
	/** Without a readable schedule (`lessons === null`) every stored course stays as it was. */
	private async compute(lessons: readonly Lesson[] | null): Promise<AdminWaitlistData> {
		const { prices, counts, starts } = await this.state();
		const closed = lessons ? await readClosedKeys(this.db) : new Set<string>();
		const cards = new Map<string, Lesson[]>();
		for (const lesson of lessons?.filter(isPlannedLesson) ?? []) {
			const key = plannedCourseKey(lesson);
			cards.set(key, [...(cards.get(key) ?? []), lesson]);
		}
		const build = (key: string, planned: Lesson[]): WaitlistCourse => {
			const row = prices.get(key);
			const count = counts.get(key);
			const firstDate = starts.get(key) ?? null;
			const card = planned[0];
			const stored = row && {
				subject: row.subject,
				weekday: row.weekday,
				start: row.start_time,
				end: row.end_time,
				teacher: row.teacher,
				room: row.room,
				building: row.building,
			};
			const snapshot = count && (JSON.parse(count.lesson_json) as Lesson);
			const source = card ?? stored ?? snapshot!;
			const price = row
				? {
						monthlyCents: row.monthly_cents,
						yearlyCents: row.yearly_cents,
						minParticipants: row.min_participants,
						updatedAt: row.updated_at,
					}
				: null;
			const course: WaitlistCourse = {
				key,
				lessons: planned,
				course: {
					subject: source.subject,
					weekday: source.weekday,
					start: source.start,
					end: source.end,
					teacher: source.teacher,
					room: source.room,
					building: source.building,
				},
				price,
				children: Number(count?.children ?? 0),
				unconfirmedChildren: Number(count?.unconfirmed_children ?? 0),
				activeEntries: Number(count?.active_entries ?? 0),
				waitingFamilies: Number(count?.waiting_families ?? 0),
				firstDate,
				status: null,
			};
			if (!lessons) course.status = firstDate ? 'started' : null;
			else if (!card)
				course.status =
					course.activeEntries > 0 ? 'gone' : firstDate ? 'started' : 'not_in_schedule';
			else if (planned.length > 1) course.status = 'ambiguous';
			else if (closed.has(closedKey(card))) course.status = 'closed';
			else if (firstDate) course.status = 'started';
			else if (!price) course.status = 'price_missing';
			else course.status = course.children >= price.minParticipants ? 'ready' : 'collecting';
			return course;
		};
		const order = (a: WaitlistCourse, b: WaitlistCourse) =>
			a.course.weekday - b.course.weekday ||
			a.course.start.localeCompare(b.course.start) ||
			a.course.subject.localeCompare(b.course.subject, 'de');
		const stored = new Set([...prices.keys(), ...counts.keys()]);
		return {
			courses: [...cards].map(([key, planned]) => build(key, planned)).sort(order),
			unscheduled: [...stored]
				.filter((key) => !cards.has(key))
				.map((key) => build(key, []))
				.sort(order),
			catalogError: lessons === null,
		};
	}
	async overview(user: App.Locals['user'], lessons: readonly Lesson[] | null) {
		await requireActiveAdmin(this.db, user);
		return this.compute(lessons);
	}
	private audit(
		actor: AdminActor,
		action: string,
		target: string,
		diff: unknown,
		requestId: string,
		now: string
	): StatementSpec {
		return {
			sql: `INSERT INTO audit_events(id, actor_user_id, actor_kind, action, target_kind, target_id, request_id, safe_diff_json, created_at)
		 SELECT ?, ?, 'user', ?, 'trial_intake', ?, ?, ?, ? WHERE ${ACTIVE}`,
			params: [
				crypto.randomUUID(),
				actor.id,
				action,
				target.slice(0, 200),
				requestId,
				JSON.stringify(diff),
				now,
				actor.id,
			],
		};
	}
	/** One statement for any number of rows: each row passes the lock triggers of 0032. */
	private upsert(actor: AdminActor, items: readonly Planned[], now: string): StatementSpec {
		const rows = items.map(({ change, lesson }) => {
			const age = lessonAgeRange(lesson);
			return {
				...change,
				subject: lesson.subject,
				weekday: lesson.weekday,
				start: lesson.start,
				end: lesson.end,
				teacher: lesson.teacher,
				building: lesson.building,
				room: lesson.room,
				ageMin: age?.min ?? null,
				ageMax: age?.max ?? null,
			};
		});
		return {
			sql: `INSERT INTO trial_intake_planned_prices(course_key, subject, weekday, start_time, end_time, teacher, building, room,
		 age_min, age_max, monthly_cents, yearly_cents, min_participants, updated_by, created_at, updated_at)
		 SELECT json_extract(value, '$.key'), json_extract(value, '$.subject'), json_extract(value, '$.weekday'),
		 json_extract(value, '$.start'), json_extract(value, '$.end'), json_extract(value, '$.teacher'),
		 json_extract(value, '$.building'), json_extract(value, '$.room'), json_extract(value, '$.ageMin'),
		 json_extract(value, '$.ageMax'), json_extract(value, '$.monthlyCents'), json_extract(value, '$.yearlyCents'),
		 json_extract(value, '$.minParticipants'), ?, ?, ?
		 FROM json_each(?) WHERE ${ACTIVE}
		 ON CONFLICT(course_key) DO UPDATE SET subject = excluded.subject, weekday = excluded.weekday,
		 start_time = excluded.start_time, end_time = excluded.end_time, teacher = excluded.teacher,
		 building = excluded.building, room = excluded.room, age_min = excluded.age_min, age_max = excluded.age_max,
		 monthly_cents = excluded.monthly_cents, yearly_cents = excluded.yearly_cents,
		 min_participants = excluded.min_participants, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
			params: [actor.id, now, now, JSON.stringify(rows), actor.id],
		};
	}
	/** Each change against the current state: unchanged, locked by an active entry, new or changed. */
	private async plan(items: readonly Planned[]) {
		const { prices, counts } = await this.state();
		return items.map((item) => {
			const row = prices.get(item.change.key);
			const before: Values | null = row
				? {
						monthlyCents: row.monthly_cents,
						yearlyCents: row.yearly_cents,
						minParticipants: row.min_participants,
					}
				: null;
			const activeEntries = Number(counts.get(item.change.key)?.active_entries ?? 0);
			const outcome: 'new' | 'change' | 'same' | 'locked' = !before
				? 'new'
				: sameValues(before, item.change)
					? 'same'
					: activeEntries > 0 &&
						  (before.monthlyCents !== item.change.monthlyCents ||
								before.yearlyCents !== item.change.yearlyCents)
						? 'locked'
						: 'change';
			return { ...item, before, outcome, activeEntries };
		});
	}
	/** `key` names the single course whose active entries explain a refusal. */
	private async write(statements: StatementSpec[], key?: string) {
		try {
			await this.db.batch(statements);
		} catch (error) {
			// A signup between the check and the write: the trigger refuses, nothing is written.
			if (!LOCKED.test(String(error))) throw error;
			if (key === undefined) throw new IntakeError('WAITLIST_PRICE_LOCKED', 409);
			throw lockedError(Number((await this.state()).counts.get(key)?.active_entries ?? 0));
		}
	}
	async setPrice(
		user: App.Locals['user'],
		lesson: Lesson,
		values: Values,
		requestId: string,
		now: string
	) {
		const actor = await requireActiveAdmin(this.db, user);
		if (!isPlannedLesson(lesson)) throw new IntakeError('WAITLIST_LESSON_NOT_PLANNED', 409);
		const change = { key: plannedCourseKey(lesson), ...values };
		const [planned] = await this.plan([{ change, lesson }]);
		if (planned.outcome === 'same') return { changed: false };
		if (planned.outcome === 'locked') throw lockedError(planned.activeEntries);
		await this.write(
			[
				this.audit(
					actor,
					'trial_intake.waitlist_price_set',
					change.key,
					{ key: change.key, before: planned.before, after: values },
					requestId,
					now
				),
				this.upsert(actor, [planned], now),
			],
			change.key
		);
		return { changed: true };
	}
	async deletePrice(user: App.Locals['user'], key: string, requestId: string, now: string) {
		const actor = await requireActiveAdmin(this.db, user);
		const { prices, counts } = await this.state();
		const row = prices.get(key);
		if (!row) return { deleted: false };
		const activeEntries = Number(counts.get(key)?.active_entries ?? 0);
		if (activeEntries > 0) throw lockedError(activeEntries);
		const before = {
			monthlyCents: row.monthly_cents,
			yearlyCents: row.yearly_cents,
			minParticipants: row.min_participants,
		};
		await this.write(
			[
				this.audit(
					actor,
					'trial_intake.waitlist_price_deleted',
					key,
					{ key, before, after: null },
					requestId,
					now
				),
				{
					sql: `DELETE FROM trial_intake_planned_prices WHERE course_key = ? AND ${ACTIVE}`,
					params: [key, actor.id],
				},
			],
			key
		);
		return { deleted: true };
	}
	/** Step one of the import: nothing is written, every row gets its outcome. */
	async previewImport(
		user: App.Locals['user'],
		bytes: Uint8Array,
		fileName: string,
		lessons: readonly Lesson[]
	): Promise<WaitlistImportPreview> {
		await requireActiveAdmin(this.db, user);
		const lines = readPriceFile(bytes, fileName);
		const planned = lessons.filter(isPlannedLesson);
		const { prices } = await this.state();
		const seen = new Set<string>();
		const rows: (WaitlistImportRow & { lesson?: Lesson })[] = lines.map(({ line, row }) => {
			const cells = {
				fach: row.fach,
				wochentag: row.wochentag,
				uhrzeit: row.uhrzeit,
				gebaeude: row.gebaeude,
				lehrkraft: row.lehrkraft,
			};
			const result = (
				outcome: WaitlistImportRow['outcome'],
				reason: string | null = null
			) => ({
				line,
				cells,
				outcome,
				reason,
				before: null,
				change: null,
			});
			const matched = matchLesson(row, planned);
			if (typeof matched === 'string')
				return matched === 'unknown' ? result('unknown') : result('error', matched);
			const key = plannedCourseKey(matched);
			if (seen.has(key)) return result('error', 'WAITLIST_IMPORT_DUPLICATE');
			seen.add(key);
			const current = prices.get(key);
			const before = current
				? {
						monthlyCents: current.monthly_cents,
						yearlyCents: current.yearly_cents,
						minParticipants: current.min_participants,
					}
				: null;
			if (!row.monthly && !row.yearly) return { ...result('same'), before };
			if (!row.monthly || !row.yearly) return result('error', 'WAITLIST_IMPORT_ONE_PRICE');
			const monthlyCents = parseEuroCents(row.monthly);
			const yearlyCents = parseEuroCents(row.yearly);
			if (monthlyCents === null || yearlyCents === null)
				return result('error', 'WAITLIST_IMPORT_PRICE_INVALID');
			const minParticipants = row.min
				? parseMinParticipants(row.min)
				: (before?.minParticipants ?? MIN_PARTICIPANTS_DEFAULT);
			if (minParticipants === null)
				return result('error', 'WAITLIST_IMPORT_THRESHOLD_INVALID');
			return {
				...result('same'),
				before,
				change: { key, monthlyCents, yearlyCents, minParticipants },
				lesson: matched,
			};
		});
		const plans = await this.plan(
			rows.flatMap((row) =>
				row.change && row.lesson ? [{ change: row.change, lesson: row.lesson }] : []
			)
		);
		const outcomes = new Map(plans.map((p) => [p.change.key, p.outcome]));
		const result = rows.map(({ lesson: _lesson, ...row }) => {
			const outcome = row.change ? outcomes.get(row.change.key)! : row.outcome;
			return {
				...row,
				outcome,
				change: outcome === 'new' || outcome === 'change' ? row.change : null,
			};
		});
		return {
			rows: result,
			changes: result.flatMap((row) => (row.change ? [row.change] : [])),
		};
	}
	/** Step two: the normalized changes are checked again against the schedule and the locks. */
	async applyImport(
		user: App.Locals['user'],
		rawChanges: unknown,
		lessons: readonly Lesson[],
		requestId: string,
		now: string
	) {
		const actor = await requireActiveAdmin(this.db, user);
		const changes = priceChangesSchema.parse(rawChanges);
		const cards = new Map<string, Lesson>();
		for (const lesson of lessons.filter(isPlannedLesson)) {
			const key = plannedCourseKey(lesson);
			if (!cards.has(key)) cards.set(key, lesson);
		}
		const plans = await this.plan(
			changes.flatMap((change) => {
				const lesson = cards.get(change.key);
				return lesson ? [{ change, lesson }] : [];
			})
		);
		const apply = plans.filter((p) => p.outcome === 'new' || p.outcome === 'change');
		if (apply.length)
			await this.write([
				this.audit(
					actor,
					'trial_intake.waitlist_prices_imported',
					'import',
					{
						applied: apply.length,
						rows: apply.map((p) => ({
							key: p.change.key,
							before: p.before,
							after: p.change,
						})),
					},
					requestId,
					now
				),
				this.upsert(actor, apply, now),
			]);
		return { applied: apply.length, skipped: changes.length - apply.length };
	}
	/** One row per planned card of the schedule and per stored price without a card. */
	async exportRows(
		user: App.Locals['user'],
		lessons: readonly Lesson[] | null
	): Promise<PriceExportRow[]> {
		const data = await this.overview(user, lessons);
		const row = (course: WaitlistCourse, lesson?: Lesson): PriceExportRow => {
			const source = lesson ?? course.course;
			return {
				fach: source.subject,
				wochentag: dayLabel(source.weekday, 'de'),
				uhrzeit: `${source.start}–${source.end}`,
				gebaeude: source.building,
				lehrkraft: source.teacher,
				raum: source.room,
				monthlyCents: course.price?.monthlyCents ?? null,
				yearlyCents: course.price?.yearlyCents ?? null,
				minParticipants: course.price?.minParticipants ?? null,
				status: waitlistStatusText(course, 'de'),
			};
		};
		return [
			...data.courses.flatMap((course) =>
				course.lessons.map((lesson) => row(course, lesson))
			),
			...data.unscheduled.map((course) => row(course)),
		];
	}
}
/** The planned card a file row names, or why there is none. */
function matchLesson(row: PriceFileRow, planned: readonly Lesson[]): Lesson | string {
	const weekday = parseWeekday(row.wochentag);
	const time = parseTimeRange(row.uhrzeit);
	if (!weekday || !time || !row.fach || !row.lehrkraft || !row.gebaeude)
		return 'WAITLIST_IMPORT_COURSE_INVALID';
	const matches = planned.filter(
		(lesson) =>
			lesson.weekday === weekday &&
			lesson.start === time.start &&
			lesson.end === time.end &&
			plannedText(lesson.subject) === plannedText(row.fach) &&
			plannedText(lesson.teacher) === plannedText(row.lehrkraft) &&
			plannedText(lesson.building) === plannedText(row.gebaeude)
	);
	if (!matches.length) return 'unknown';
	if (new Set(matches.map(plannedCourseKey)).size > 1) return 'WAITLIST_IMPORT_AMBIGUOUS';
	return matches[0];
}

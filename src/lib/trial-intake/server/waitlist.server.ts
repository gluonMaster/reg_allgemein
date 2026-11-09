import { z } from 'zod';
import { createRandomToken } from '$lib/server/auth/tokens';
import { sha256Hex } from '$lib/server/security/digest';
import type { DatabaseBoundary, StatementSpec } from '$lib/server/db/database';
import type { AdminActor } from '$lib/server/security/authorization';
import {
	WAITLIST_CONSENT_VERSION,
	WAITLIST_PRIVACY_VERSION,
	type Lesson,
	type WaitlistEntrySummary,
	type WaitlistOffer,
	type WithdrawalData,
} from '../contracts';
import { ageFit, lessonAgeRange } from '../age';
import { berlinDate, nextLessonDate } from '../dates';
import { isPlannedLesson, plannedCourseKey } from '../planned';
import { PRICE_MAX_CENTS } from '../prices';
import { closedKey, readClosedKeys } from './closed.server';
import { IntakeError, opaqueKey, textField, intakeInputSchema } from './validation.server';
import {
	IntakeService,
	afterSeconds,
	receiptToken,
	searchName,
	verificationToken,
} from './service.server';
import { ACTIVE, requireActiveAdmin } from './admin.server';
import type { IntakeRequest, WaitlistEntry } from './model.server';
import {
	OPEN_START,
	PROCESSED_RETENTION_SECONDS,
	readEntry,
	withdrawToken,
} from './waitlist-core.server';
import { entryLesson } from './waitlist-templates.server';

const base = intakeInputSchema.shape;
/** Contacts and children as a trial request; one planned course, its tariff and consent. */
export const waitlistInputSchema = z
	.object({
		idempotencyKey: opaqueKey,
		parentFirstName: textField,
		parentLastName: textField,
		email: base.email,
		phone: base.phone,
		locale: z.enum(['de', 'ru']),
		privacyVersion: z.literal(WAITLIST_PRIVACY_VERSION),
		children: base.children,
		lessonId: z.string().regex(/^[a-f0-9]{64}$/u),
		tariff: z.enum(['monthly', 'yearly']),
		expectedPriceCents: z.number().int().min(1).max(PRICE_MAX_CENTS),
		consent: z.literal(true),
		ageConfirmed: z.literal(true).optional(),
	})
	.strict()
	.refine((data) => new Set(data.children.map((c) => c.key)).size === data.children.length);
export type WaitlistData = z.infer<typeof waitlistInputSchema>;

/** Where a planned card stands for a new signup, in the order of the waitlist page (WL-04). */
export type CourseState =
	| { state: 'unavailable' }
	| { state: 'started'; firstDate: string }
	| { state: 'price_missing' }
	| { state: 'open'; key: string; offer: WaitlistOffer };
export async function courseState(
	db: DatabaseBoundary,
	lessons: readonly Lesson[],
	lesson: Lesson
): Promise<CourseState> {
	const key = plannedCourseKey(lesson);
	// Two cards of one course: the editor does not publish them, so neither takes signups (WL-15).
	const twins = lessons.filter((l) => isPlannedLesson(l) && plannedCourseKey(l) === key);
	if (twins.length > 1 || (await readClosedKeys(db)).has(closedKey(lesson)))
		return { state: 'unavailable' };
	const [start, price] = await db.batch<Record<string, unknown>>([
		{
			sql: 'SELECT first_date FROM trial_intake_waitlist_starts WHERE course_key = ? AND reopened_at IS NULL',
			params: [key],
		},
		{
			sql: 'SELECT monthly_cents, yearly_cents, min_participants FROM trial_intake_planned_prices WHERE course_key = ?',
			params: [key],
		},
	]);
	const started = start.results[0] as { first_date: string } | undefined;
	if (started) return { state: 'started', firstDate: started.first_date };
	const row = price.results[0] as
		{ monthly_cents: number; yearly_cents: number; min_participants: number } | undefined;
	if (!row) return { state: 'price_missing' };
	return {
		state: 'open',
		key,
		offer: {
			monthlyCents: row.monthly_cents,
			yearlyCents: row.yearly_cents,
			minParticipants: row.min_participants,
		},
	};
}
const STATE_ERRORS = {
	unavailable: () => new IntakeError('WAITLIST_COURSE_UNAVAILABLE', 409),
	started: () => new IntakeError('WAITLIST_COURSE_STARTED', 409),
	price_missing: () => new IntakeError('WAITLIST_PRICE_MISSING', 409),
};
const priceChanged = (offer: WaitlistOffer) =>
	new IntakeError('WAITLIST_PRICE_CHANGED', 409, { ...offer });

/** Signup, withdrawal and the admin view of the queues (TRIAL_INTAKE_WAITLIST). */
export class WaitlistSignup {
	constructor(
		private readonly service: IntakeService,
		private readonly secret: string,
		private readonly emailMaxAttempts = 5,
		private readonly db: DatabaseBoundary = service.db
	) {}
	/**
	 * WL-04: request `kind=waitlist`, children, the entry with its snapshot and the verification
	 * letter in one batch. A verified device never skips the letter: the confirmation by link
	 * fixes the consent time the start PDF refers to.
	 */
	async create(value: unknown, catalog: () => Promise<readonly Lesson[]>, now: string) {
		if (!value || typeof value !== 'object' || Reflect.get(value, 'consent') !== true)
			throw new IntakeError('WAITLIST_CONSENT_REQUIRED');
		const parsed = waitlistInputSchema.safeParse(value);
		if (!parsed.success) throw new IntakeError('INTAKE_INPUT_INVALID');
		const data = parsed.data;
		// Tariff, sum and consent are part of the hash: a replay with another sum is a conflict.
		const hash = await sha256Hex(JSON.stringify(data));
		const existing = await this.request(data.idempotencyKey);
		if (existing) return this.createdResult(existing, hash, now);
		const lessons = await catalog();
		const lesson = lessons.find((l) => l.id === data.lessonId);
		if (!lesson) throw new IntakeError('INTAKE_LESSON_UNAVAILABLE', 409);
		if (!isPlannedLesson(lesson)) throw new IntakeError('WAITLIST_LESSON_NOT_PLANNED', 409);
		const course = await courseState(this.db, lessons, lesson);
		if (course.state !== 'open') throw STATE_ERRORS[course.state]();
		const chosen =
			data.tariff === 'monthly' ? course.offer.monthlyCents : course.offer.yearlyCents;
		if (chosen !== data.expectedPriceCents) throw priceChanged(course.offer);
		const today = berlinDate(now);
		if (data.children.some((c) => c.birthDate > today))
			throw new IntakeError('INTAKE_BIRTH_DATE_INVALID');
		// The next allowed date of the weekday from tomorrow, holidays skipped as in TIN.
		const range = lessonAgeRange(lesson);
		const fits = data.children.map((c) =>
			ageFit(range, c.birthDate, nextLessonDate(lesson.weekday, now))
		);
		if (fits.includes('young')) throw new IntakeError('INTAKE_CHILD_TOO_YOUNG');
		if (fits.includes('old') && !data.ageConfirmed)
			throw new IntakeError('INTAKE_AGE_UNCONFIRMED');
		const id = crypto.randomUUID();
		const nonce = createRandomToken();
		const token = await verificationToken(this.secret, {
			id,
			email: data.email,
			verification_version: 1,
			verification_nonce: nonce,
		});
		const withdrawNonce = createRandomToken();
		const children = data.children.map((c, position) => ({
			...c,
			id: crypto.randomUUID(),
			position,
			search: searchName(c.lastName),
		}));
		const statements: StatementSpec[] = [
			{
				sql: `INSERT OR IGNORE INTO trial_intake_requests
			 (id, kind, idempotency_key, payload_hash, parent_first_name, parent_last_name, parent_last_name_search, email, phone,
			 locale, privacy_version, receipt_nonce, verification_version, verification_nonce, verification_hash,
			 verification_expires_at, last_email_at, created_at, pending_expires_at)
			 VALUES (?, 'waitlist', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
				params: [
					id,
					data.idempotencyKey,
					hash,
					data.parentFirstName,
					data.parentLastName,
					searchName(data.parentLastName),
					data.email,
					data.phone,
					data.locale,
					data.privacyVersion,
					createRandomToken(),
					nonce,
					await sha256Hex(token),
					afterSeconds(now, 86400),
					now,
					now,
					afterSeconds(now, 14 * 86400),
				],
			},
			{
				sql: `INSERT INTO trial_intake_children
			 (id, request_id, position, first_name, last_name, last_name_search, birth_date)
			 SELECT json_extract(j.value,'$.id'), r.id, json_extract(j.value,'$.position'), json_extract(j.value,'$.firstName'),
			 json_extract(j.value,'$.lastName'), json_extract(j.value,'$.search'), json_extract(j.value,'$.birthDate')
			 FROM trial_intake_requests r, json_each(?) j WHERE r.id = ?`,
				params: [JSON.stringify(children), id],
			},
			{
				// Trigger 2 of 0032 compares both sums with the price row: an edit racing this
				// batch aborts it instead of recording a sum the parent never saw.
				sql: `INSERT INTO trial_intake_waitlist_entries(request_id, course_key, lesson_json, tariff, monthly_cents,
			 yearly_cents, min_participants, consent_version, withdraw_nonce, withdraw_hash, created_at, status_changed_at)
			 SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM trial_intake_requests WHERE id = ?`,
				params: [
					course.key,
					JSON.stringify(lesson),
					data.tariff,
					course.offer.monthlyCents,
					course.offer.yearlyCents,
					course.offer.minParticipants,
					WAITLIST_CONSENT_VERSION,
					withdrawNonce,
					await sha256Hex(
						await withdrawToken(this.secret, {
							request_id: id,
							withdraw_nonce: withdrawNonce,
						})
					),
					now,
					now,
					id,
				],
			},
			{
				sql: `INSERT OR IGNORE INTO trial_intake_email_outbox
			 (id, request_id, verification_version, kind, dedupe_key, max_attempts, created_at, updated_at)
			 SELECT ?, id, verification_version, 'verification', ?, ?, ?, ? FROM trial_intake_requests
			 WHERE id = ? AND state = 'pending_email' AND verification_version = 1`,
				params: [
					`intake-email:${id}:1`,
					`trial-intake:verify:${id}:1`,
					this.emailMaxAttempts,
					now,
					now,
					id,
				],
			},
		];
		try {
			await this.db.batch(statements);
		} catch (error) {
			const message = String(error);
			if (/waitlist course already started/u.test(message))
				throw new IntakeError('WAITLIST_COURSE_STARTED', 409);
			if (!/waitlist entry price does not match/u.test(message)) throw error;
			const current = await courseState(this.db, lessons, lesson);
			throw current.state === 'open'
				? priceChanged(current.offer)
				: STATE_ERRORS[current.state]();
		}
		const result = await this.request(data.idempotencyKey);
		if (!result) throw new IntakeError('INTAKE_SAVE_FAILED', 503);
		return this.createdResult(result, hash, now);
	}
	private request(idempotencyKey: string) {
		return this.db.first<IntakeRequest>({
			sql: 'SELECT * FROM trial_intake_requests WHERE idempotency_key = ?',
			params: [idempotencyKey],
		});
	}
	private async createdResult(r: IntakeRequest, hash: string, now: string) {
		if (r.payload_hash !== hash) throw new IntakeError('INTAKE_IDEMPOTENCY_CONFLICT', 409);
		if (r.state === 'pending_email' && r.pending_expires_at <= now)
			throw new IntakeError('INTAKE_EXPIRED', 410);
		return {
			id: r.id,
			receipt: await receiptToken(this.secret, r),
			state: r.state,
			resendAfter: afterSeconds(r.last_email_at, 60),
		};
	}
	/** The entry a withdrawal link names, if the request still exists, with its current course. */
	private async byToken(token: string, now: string) {
		if (!/^[a-f0-9]{64}$/u.test(token)) return null;
		const row = await this.db.first<
			WaitlistEntry & {
				state: IntakeRequest['state'];
				open_start: number;
				current_json: string | null;
			}
		>({
			sql: `SELECT e.*, r.state, ${OPEN_START} AS open_start,
			 (SELECT json_object('subject', p.subject, 'weekday', p.weekday, 'start', p.start_time, 'end', p.end_time,
			 'room', p.room, 'building', p.building) FROM trial_intake_planned_prices p WHERE p.course_key = e.course_key) AS current_json
			 FROM trial_intake_waitlist_entries e JOIN trial_intake_requests r ON r.id = e.request_id
			 WHERE e.withdraw_hash = ? AND (r.delete_after IS NULL OR r.delete_after > ?)`,
			params: [await sha256Hex(token), now],
		});
		return row ?? null;
	}
	/**
	 * GET of the withdrawal link: the course and one button, nothing changes (WL-12). After a rebind
	 * the link names the course the queue belongs to now: the price row of its key holds that card.
	 */
	async inspectWithdrawal(
		token: string,
		now: string
	): Promise<Omit<WithdrawalData, 'scheduleUrl'>> {
		const row = await this.byToken(token, now);
		if (!row || row.state === 'pending_email' || row.status === 'expired')
			return { state: 'invalid', course: null };
		const lesson = row.current_json
			? (JSON.parse(row.current_json) as NonNullable<WithdrawalData['course']>)
			: entryLesson(row);
		const course = {
			subject: lesson.subject,
			weekday: lesson.weekday,
			start: lesson.start,
			end: lesson.end,
			room: lesson.room,
			building: lesson.building,
		};
		if (row.status === 'withdrawn') return { state: 'withdrawn', course };
		if (row.status !== 'waiting' || row.open_start) return { state: 'started', course };
		return { state: 'confirm', course };
	}
	/** One batch: entry withdrawn, request processed with deletion after 90 days, audit. */
	private withdrawStatements(
		requestId: string,
		now: string,
		audit: { actorId: string | null; requestId: string },
		guard = ''
	): StatementSpec[] {
		const auditId = crypto.randomUUID();
		const params = audit.actorId ? [audit.actorId] : [];
		return [
			{
				sql: `UPDATE trial_intake_waitlist_entries SET status = 'withdrawn', status_changed_at = ?
			 WHERE request_id = ? AND status = 'waiting'
			 AND NOT EXISTS(SELECT 1 FROM trial_intake_waitlist_starts s
			 WHERE s.course_key = trial_intake_waitlist_entries.course_key AND s.reopened_at IS NULL)
			 AND EXISTS(SELECT 1 FROM trial_intake_requests r WHERE r.id = trial_intake_waitlist_entries.request_id
			 AND r.state = 'verified') ${guard}`,
				params: [now, requestId, ...params],
			},
			{
				sql: `UPDATE trial_intake_requests SET state = 'processed', processed_at = ?, delete_after = ?
			 WHERE id = ? AND state = 'verified' AND EXISTS(SELECT 1 FROM trial_intake_waitlist_entries e
			 WHERE e.request_id = trial_intake_requests.id AND e.status = 'withdrawn' AND e.status_changed_at = ?)`,
				params: [now, afterSeconds(now, PROCESSED_RETENTION_SECONDS), requestId, now],
			},
			{
				// No family data in the audit: who withdrew, nothing else.
				sql: `INSERT INTO audit_events(id, actor_user_id, actor_kind, action, target_kind, target_id, request_id, safe_diff_json, created_at)
			 SELECT ?, ?, ?, 'trial_intake.waitlist_withdrawn', 'trial_intake', r.id, ?, ?, ? FROM trial_intake_requests r
			 WHERE r.id = ? AND r.state = 'processed' AND r.processed_at = ? AND EXISTS(SELECT 1 FROM trial_intake_waitlist_entries e
			 WHERE e.request_id = r.id AND e.status = 'withdrawn' AND e.status_changed_at = ?)`,
				params: [
					auditId,
					audit.actorId,
					audit.actorId ? 'user' : 'guest',
					audit.requestId,
					JSON.stringify({ by: audit.actorId ? 'admin' : 'guest' }),
					now,
					requestId,
					now,
					now,
				],
			},
		];
	}
	/** POST of the withdrawal link; a repeat reports the withdrawal that already happened. */
	async withdraw(token: string, requestId: string, now: string) {
		const row = await this.byToken(token, now);
		if (!row || row.state === 'pending_email' || row.status === 'expired')
			throw new IntakeError('WAITLIST_WITHDRAW_INVALID', 410);
		if (row.status === 'withdrawn') return { state: 'withdrawn' as const };
		if (row.status !== 'waiting' || row.open_start)
			throw new IntakeError('WAITLIST_COURSE_STARTED', 409);
		await this.db.batch(
			this.withdrawStatements(row.request_id, now, { actorId: null, requestId })
		);
		const after = await readEntry(this.db, row.request_id);
		if (after?.status === 'withdrawn') return { state: 'withdrawn' as const };
		throw new IntakeError(
			after?.status === 'waiting' ? 'INTAKE_STATUS_CONFLICT' : 'WAITLIST_COURSE_STARTED',
			409
		);
	}
	/**
	 * "Aus der Warteliste austragen" by phone: the same withdrawal with the admin as actor. `after`
	 * joins the batch, e.g. the refusal of a new price (WL-15); it should depend on the withdrawal.
	 */
	async withdrawByAdmin(
		user: App.Locals['user'],
		id: string,
		requestId: string,
		now: string,
		after: StatementSpec[] = []
	) {
		const actor: AdminActor = await requireActiveAdmin(this.db, user);
		const entry = await readEntry(this.db, id);
		const request = entry && (await this.service.get(id));
		// An unconfirmed entry expires by itself; 0027 keeps processed requests verified.
		if (!entry || request?.state !== 'verified' || entry.status !== 'waiting')
			throw new IntakeError('WAITLIST_STATUS_CONFLICT', 409);
		await this.db.batch([
			...this.withdrawStatements(id, now, { actorId: actor.id, requestId }, `AND ${ACTIVE}`),
			...after,
		]);
		if ((await readEntry(this.db, id))?.status !== 'withdrawn')
			throw new IntakeError('WAITLIST_STATUS_CONFLICT', 409);
		return { state: 'withdrawn' as const };
	}
	/** Confirmed signups per course for the admin waitlist page; reading them is audited. */
	async entries(actor: AdminActor, requestId: string, now: string) {
		const [, rows] = await this.db.batch<{
			request_id: string;
			course_key: string;
			parent_first_name: string;
			parent_last_name: string;
			phone: string;
			tariff: WaitlistEntrySummary['tariff'];
			verified_at: string;
			status: WaitlistEntrySummary['status'];
			children_json: string;
			decision_json: string | null;
		}>([
			{
				sql: `INSERT INTO audit_events(id, actor_user_id, actor_kind, action, target_kind, target_id, request_id, safe_diff_json, created_at)
			 SELECT ?, ?, 'user', 'trial_intake.waitlist_read', 'trial_intake', 'waitlist', ?, '{}', ? WHERE ${ACTIVE}`,
				params: [crypto.randomUUID(), actor.id, requestId, now, actor.id],
			},
			{
				sql: `SELECT e.request_id, e.course_key, e.tariff, e.status, r.verified_at, r.parent_first_name, r.parent_last_name, r.phone,
			 (SELECT json_group_array(json_object('firstName', c.first_name, 'lastName', c.last_name, 'birthDate', c.birth_date))
			 FROM (SELECT * FROM trial_intake_children WHERE request_id = e.request_id ORDER BY position) c) AS children_json,
			 (SELECT json_object('decision', d.decision, 'priceCents', d.price_cents, 'createdAt', d.created_at)
			 FROM trial_intake_waitlist_price_confirmations d WHERE d.request_id = e.request_id ORDER BY d.created_at DESC LIMIT 1) AS decision_json
			 FROM trial_intake_waitlist_entries e JOIN trial_intake_requests r ON r.id = e.request_id
			 WHERE r.state IN ('verified','processed') AND ${ACTIVE} ORDER BY r.verified_at, r.id`,
				params: [actor.id],
			},
		]);
		const byCourse = new Map<string, WaitlistEntrySummary[]>();
		for (const row of rows.results)
			byCourse.set(row.course_key, [
				...(byCourse.get(row.course_key) ?? []),
				{
					requestId: row.request_id,
					parentFirstName: row.parent_first_name,
					parentLastName: row.parent_last_name,
					phone: row.phone,
					children: JSON.parse(row.children_json),
					tariff: row.tariff,
					verifiedAt: row.verified_at,
					status: row.status,
					priceDecision: row.decision_json ? JSON.parse(row.decision_json) : null,
				},
			]);
		return byCourse;
	}
}

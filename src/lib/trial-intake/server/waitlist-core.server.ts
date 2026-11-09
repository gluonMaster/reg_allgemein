import { hmacSha256Hex } from '$lib/server/auth/tokens';
import type { DatabaseBoundary, StatementSpec } from '$lib/server/db/database';
import type {
	AttentionReason,
	CourseSummary,
	RebindDifference,
	RebindKind,
	WaitlistPriceDecision,
	WaitlistRebindRecord,
} from '../contracts';
import { IntakeError } from './validation.server';
import type { IntakeDetail, WaitlistEntry } from './model.server';
import { waitlistTelegramParts, type PriceConfirmation } from './waitlist-templates.server';

// Shared by the request service, the e-mail store and the waitlist module; it imports neither of
// them, so the request service can branch on the request kind without an import cycle.

/** After withdrawal or a confirmation that came too late: 90 days, like a processed request. */
export const PROCESSED_RETENTION_SECONDS = 90 * 86400;
export const plusSeconds = (now: string, seconds: number) =>
	new Date(Date.parse(now) + seconds * 1000).toISOString();
/** The withdrawal link of the confirmation letter; only its hash is stored (WL-12). */
export function withdrawToken(
	secret: string,
	entry: Pick<WaitlistEntry, 'request_id' | 'withdraw_nonce'>
): Promise<string> {
	return hmacSha256Hex(
		secret,
		'trial-intake:withdraw:v1',
		JSON.stringify([entry.request_id, entry.withdraw_nonce])
	);
}
export function readEntry(db: DatabaseBoundary, requestId: string) {
	return db.first<WaitlistEntry>({
		sql: 'SELECT * FROM trial_intake_waitlist_entries WHERE request_id = ?',
		params: [requestId],
	});
}
/** Row of trial_intake_waitlist_rebinds (migration 0032). */
export interface RebindRow {
	id: string;
	from_key: string;
	to_key: string;
	from_lesson_json: string;
	to_lesson_json: string;
	kind: RebindKind;
	differences_json: string;
	from_monthly_cents: number;
	from_yearly_cents: number;
	to_monthly_cents: number;
	to_yearly_cents: number;
	created_at: string;
}
/** The whole journal: a few rows a year, read at once. */
export const REBINDS_SQL = 'SELECT * FROM trial_intake_waitlist_rebinds ORDER BY created_at, id';
/**
 * The rebinds that brought the queue now at `key` there, newest first: the latest rebind into the
 * course, then the one into its previous course before that, and so on. A rebind into a course
 * after `until` did not move signups that already left it.
 */
export function rebindLineage(rows: readonly RebindRow[], key: string, until = '￿'): RebindRow[] {
	const chain: RebindRow[] = [];
	let current = key;
	let before = until;
	let inclusive = true;
	for (;;) {
		const row = rows
			.filter(
				(r) =>
					r.to_key === current &&
					(inclusive ? r.created_at <= before : r.created_at < before)
			)
			.at(-1);
		if (!row) return chain;
		chain.push(row);
		current = row.from_key;
		before = row.created_at;
		inclusive = false;
	}
}
/** Where the queue of `key` went after `from`: the course a cancelled signup could join now. */
export function reboundKey(rows: readonly RebindRow[], key: string, from: string): string {
	let current = key;
	let after = from;
	for (;;) {
		const row = rows.find((r) => r.from_key === current && r.created_at >= after);
		if (!row) return current;
		current = row.to_key;
		after = row.created_at;
	}
}
export function rebindRecord(row: RebindRow): WaitlistRebindRecord {
	const changes = JSON.parse(row.differences_json) as {
		differences: RebindDifference[];
		reasons: AttentionReason[];
	};
	const summary = (json: string): CourseSummary => {
		const { subject, weekday, start, end, teacher, room, building } = JSON.parse(
			json
		) as CourseSummary;
		return { subject, weekday, start, end, teacher, room, building };
	};
	return {
		id: row.id,
		kind: row.kind,
		createdAt: row.created_at,
		from: summary(row.from_lesson_json),
		to: summary(row.to_lesson_json),
		differences: changes.differences,
		reasons: changes.reasons,
		before: { monthlyCents: row.from_monthly_cents, yearlyCents: row.from_yearly_cents },
		after: { monthlyCents: row.to_monthly_cents, yearlyCents: row.to_yearly_cents },
	};
}
/** The latest price decision of a signup (WL-15); `confirmed` carries the duration it accepted. */
export async function readPriceDecision(
	db: DatabaseBoundary,
	requestId: string
): Promise<(WaitlistPriceDecision & { confirmation: PriceConfirmation | null }) | null> {
	const row = await db.first<{
		decision: 'confirmed' | 'declined';
		price_cents: number | null;
		created_at: string;
		minutes: number;
	}>({
		sql: `SELECT c.decision, c.price_cents, c.created_at, json_extract(j.to_key, '$[3]') AS minutes
		 FROM trial_intake_waitlist_price_confirmations c JOIN trial_intake_waitlist_rebinds j ON j.id = c.rebind_id
		 WHERE c.request_id = ? ORDER BY c.created_at DESC, j.created_at DESC LIMIT 1`,
		params: [requestId],
	});
	if (!row) return null;
	return {
		decision: row.decision,
		priceCents: row.price_cents,
		createdAt: row.created_at,
		confirmation:
			row.decision === 'confirmed' && row.price_cents !== null
				? {
						cents: row.price_cents,
						confirmedAt: row.created_at,
						minutes: Number(row.minutes),
					}
				: null,
	};
}
/** The signup with the sum it confirmed by phone, as the start letter and the PDF need it. */
export async function entryWithConfirmation(db: DatabaseBoundary, entry: WaitlistEntry) {
	return {
		...entry,
		confirmation: (await readPriceDecision(db, entry.request_id))?.confirmation ?? null,
	};
}
/** SQL: the course of entry `e` has a start that was not reopened. */
export const OPEN_START = `EXISTS(SELECT 1 FROM trial_intake_waitlist_starts s
 WHERE s.course_key = e.course_key AND s.reopened_at IS NULL)`;
/** Status of a signup for the confirmation page; the first date of the start that closed it. */
export function entryOutcome(db: DatabaseBoundary, requestId: string) {
	return db.first<{
		status: WaitlistEntry['status'];
		first_date: string | null;
		course_key: string;
		status_changed_at: string;
	}>({
		sql: `SELECT e.status, e.course_key, e.status_changed_at, COALESCE(
		 (SELECT s.first_date FROM trial_intake_waitlist_starts s WHERE s.id = e.start_id),
		 (SELECT s.first_date FROM trial_intake_waitlist_starts s WHERE s.course_key = e.course_key AND s.reopened_at IS NULL)
		) AS first_date
		 FROM trial_intake_waitlist_entries e WHERE e.request_id = ?`,
		params: [requestId],
	});
}
/**
 * The e-mail confirmation of a waitlist signup (WL-04, WL-10). One batch either confirms the
 * waiting entry, or — when its course started meanwhile or the start already cancelled the
 * entry — closes the request as processed and the entry as cancelled, without Telegram or
 * letters. Both conditions sit inside SQL, so a start racing this batch cannot slip through.
 * `confirm` replaces the request update of a trial request; `after` runs at the end of the batch.
 */
export async function waitlistAcceptance(
	db: DatabaseBoundary,
	detail: IntakeDetail,
	hash: string,
	ignoreTokenExpiry: boolean,
	now: string
): Promise<{ parts: string[]; confirm: StatementSpec[]; after: StatementSpec[] }> {
	const r = detail.request;
	const entry = await readEntry(db, r.id);
	if (!entry) throw new IntakeError('INTAKE_TOKEN_INVALID', 410);
	const [others, price] = await db.batch<{ children: number; min_participants: number }>([
		{
			sql: `SELECT COALESCE(SUM((SELECT COUNT(*) FROM trial_intake_children c WHERE c.request_id = e.request_id)), 0) AS children
		 FROM trial_intake_waitlist_entries e JOIN trial_intake_requests q ON q.id = e.request_id
		 WHERE e.course_key = ? AND e.status = 'waiting' AND q.state = 'verified' AND e.request_id <> ?`,
			params: [entry.course_key, r.id],
		},
		{
			sql: 'SELECT min_participants FROM trial_intake_planned_prices WHERE course_key = ?',
			params: [entry.course_key],
		},
	]);
	const before = Number(others.results[0]?.children ?? 0);
	const children = before + detail.children.length;
	const minParticipants = Number(price.results[0]?.min_participants ?? entry.min_participants);
	const parts = waitlistTelegramParts(detail, entry, {
		children,
		minParticipants,
		reached: before < minParticipants && children >= minParticipants,
	});
	const pending = `id = ? AND kind = 'waitlist' AND verification_hash = ? AND state = 'pending_email'
	 AND (? = 1 OR verification_expires_at > ?) AND pending_expires_at > ?`;
	const pendingParams = [r.id, hash, ignoreTokenExpiry ? 1 : 0, now, now];
	return {
		parts,
		confirm: [
			{
				sql: `UPDATE trial_intake_requests SET state = 'verified', verified_at = ? WHERE ${pending}
			 AND EXISTS(SELECT 1 FROM trial_intake_waitlist_entries e WHERE e.request_id = trial_intake_requests.id
			 AND e.status = 'waiting' AND NOT ${OPEN_START})`,
				params: [now, ...pendingParams],
			},
			{
				sql: `UPDATE trial_intake_requests SET state = 'processed', verified_at = ?, processed_at = ?, delete_after = ?
			 WHERE ${pending} AND EXISTS(SELECT 1 FROM trial_intake_waitlist_entries e WHERE e.request_id = trial_intake_requests.id
			 AND (e.status = 'cancelled' OR (e.status = 'waiting' AND ${OPEN_START})))`,
				params: [now, now, plusSeconds(now, PROCESSED_RETENTION_SECONDS), ...pendingParams],
			},
		],
		after: [
			{
				// A waiting entry of a processed request exists only right after the branch above.
				sql: `UPDATE trial_intake_waitlist_entries SET status = 'cancelled', status_changed_at = ?
			 WHERE request_id = ? AND status = 'waiting'
			 AND EXISTS(SELECT 1 FROM trial_intake_requests r WHERE r.id = ? AND r.state = 'processed')`,
				params: [now, r.id, r.id],
			},
		],
	};
}

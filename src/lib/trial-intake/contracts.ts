import type { OutboxWaitReason } from '$lib/outbox-wait';
import type { AgeRange } from './age';

export const INTAKE_PRIVACY_VERSION = 'trial-intake-retention-2026-09-16-v1';
/** Retention text of the waitlist form (WL-13): 14 days, 12 months, 90 days after processing. */
export const WAITLIST_PRIVACY_VERSION = 'trial-intake-waitlist-retention-2026-11-05-v1';
/** The consent tick with tariff and sum (OQ-050); the start PDF quotes this text verbatim. */
export const WAITLIST_CONSENT_VERSION = 'trial-intake-waitlist-consent-2026-11-05-v1';
export const INTAKE_BODY_LIMIT = 16 * 1024;
export type IntakeState = 'pending_email' | 'verified' | 'processed';
export interface Lesson {
	id: string;
	subject: string;
	group: string;
	weekday: number;
	start: string;
	end: string;
	teacher: string;
	room: string;
	building: 'Kolibri' | 'Villa';
}
export interface IntakeInput {
	idempotencyKey: string;
	parentFirstName: string;
	parentLastName: string;
	email: string;
	phone: string;
	locale: 'de' | 'ru';
	privacyVersion: typeof INTAKE_PRIVACY_VERSION;
	children: { key: string; firstName: string; lastName: string; birthDate: string }[];
	/** `ageConfirmed`: the parent acknowledged that an assigned child is older than the group. */
	items: { lessonId: string; desiredDate: string; childKeys: string[]; ageConfirmed?: true }[];
}
export type WaitlistTariff = 'monthly' | 'yearly';
/** One waitlist signup: one planned course, all children (WL-04). */
export interface WaitlistInput {
	idempotencyKey: string;
	parentFirstName: string;
	parentLastName: string;
	email: string;
	phone: string;
	locale: 'de' | 'ru';
	privacyVersion: typeof WAITLIST_PRIVACY_VERSION;
	children: IntakeInput['children'];
	lessonId: string;
	tariff: WaitlistTariff;
	/** The monthly sum of the chosen tariff the parent saw and agreed to. */
	expectedPriceCents: number;
	consent: true;
	/** The parent acknowledged that a child is older than the course. */
	ageConfirmed?: true;
}
export interface WaitlistOffer {
	monthlyCents: number;
	yearlyCents: number;
	minParticipants: number;
}
/** States of `/warteliste?lesson=<id>` in the order they are checked (WL-04). */
export type WaitlistPageState =
	| 'maintenance'
	| 'catalog_error'
	| 'not_found'
	| 'unavailable'
	| 'started'
	| 'price_missing'
	| 'form';
export interface WaitlistPageData {
	state: WaitlistPageState;
	lesson: Lesson | null;
	offer: WaitlistOffer | null;
	firstDate: string | null;
	scheduleUrl: string;
	turnstileSiteKey?: string;
	now: string;
}
export type WaitlistEntryStatus = 'waiting' | 'started' | 'withdrawn' | 'cancelled' | 'expired';
/** The admin's call after a duration change (WL-15): the family accepted the new sum or declined. */
export interface WaitlistPriceDecision {
	decision: 'confirmed' | 'declined';
	/** The new sum per child and month of the family's tariff; null after a refusal. */
	priceCents: number | null;
	createdAt: string;
}
/** A confirmed signup as the admin sees it in the queue of a course. */
export interface WaitlistEntrySummary {
	requestId: string;
	parentFirstName: string;
	parentLastName: string;
	/** The bureau calls the families of an orange or red course (WL-15). */
	phone: string;
	children: { firstName: string; lastName: string; birthDate: string }[];
	tariff: WaitlistTariff;
	verifiedAt: string;
	status: WaitlistEntryStatus;
	/** The latest price decision of this signup. */
	priceDecision: WaitlistPriceDecision | null;
}
/** WL-15: how a rebind changes the course of a queue. */
export type RebindKind = 'plain' | 'notify' | 'price';
export type RebindDifference =
	| { field: 'subject' | 'start' | 'teacher' | 'building'; from: string; to: string }
	| { field: 'weekday' | 'minutes'; from: number; to: number }
	| { field: 'age'; from: AgeRange | null; to: AgeRange | null };
/** Reasons of the orange mark: the families have to be told (WL-15). */
export type AttentionReason =
	| { code: 'time'; from: string; to: string }
	| { code: 'weekday' | 'teacher' | 'age' | 'subject_check' };
export interface RebindComparison {
	/** False for another subject: `WAITLIST_REBIND_SUBJECT`. */
	allowed: boolean;
	/** The strictest kind of all differences. */
	kind: RebindKind;
	differences: RebindDifference[];
	reasons: AttentionReason[];
}
/** Why a planned card cannot take a queue or a price. */
export type RebindBlock = 'subject' | 'queue' | 'started' | 'ambiguous' | 'closed';
/** The course of a journal row or a rebind candidate as the admin sees it. */
export type CourseSummary = Omit<Lesson, 'id' | 'group'>;
export interface RebindTarget {
	key: string;
	lesson: Lesson;
	comparison: RebindComparison;
	block: RebindBlock | null;
	/** The unlocked price of the card that a rebind replaces. */
	price: WaitlistPrice | null;
}
/** The rebind tool of a course that left the schedule (WL-15). */
export interface RebindOptions {
	/** Waiting signups exist: statuses and calls apply. Without them only the price moves. */
	queue: boolean;
	families: number;
	children: number;
	/** Unconfirmed signups the rebind cancels. */
	unconfirmed: number;
	targets: RebindTarget[];
}
/** A row of the rebind journal. */
export interface WaitlistRebindRecord {
	id: string;
	kind: RebindKind;
	createdAt: string;
	from: CourseSummary;
	to: CourseSummary;
	differences: RebindDifference[];
	reasons: AttentionReason[];
	before: { monthlyCents: number; yearlyCents: number };
	after: { monthlyCents: number; yearlyCents: number };
}
/** Course facts of the withdrawal page; no family data (WL-12). */
export interface WithdrawalData {
	state: 'invalid' | 'confirm' | 'withdrawn' | 'started';
	course: Omit<Lesson, 'id' | 'group' | 'teacher'> | null;
	scheduleUrl: string;
}
/** What `/admin/trial-intake` shows about the waitlist (WL-07). */
export interface WaitlistAttention {
	courses: number;
	children: number;
	/** Courses that need the admin: threshold reached, no price, vanished or ambiguous. */
	attention: Pick<
		WaitlistCourse,
		| 'key'
		| 'course'
		| 'status'
		| 'children'
		| 'price'
		| 'firstDate'
		| 'activeEntries'
		| 'attention'
		| 'priceOpen'
	>[];
	/** Start letters still on their way or given up (WL-10). */
	startLetters: { unsent: number; dead: number };
}
/** Why a course cannot be started, or a probe letter cannot be sent, right now (WL-10). */
export type WaitlistStartBlock =
	| 'started'
	| 'not_in_schedule'
	| 'ambiguous'
	| 'closed'
	| 'price_missing'
	| 'renderer'
	| 'price_open'
	| 'threshold'
	| 'no_entries';
/** The start dialog of a planned course on the admin waitlist page. */
export interface WaitlistStartOptions {
	/** The next eight allowed dates of the weekday from tomorrow. */
	dates: string[];
	/** The first of them at least seven days ahead. */
	defaultDate: string;
	start: WaitlistStartBlock | null;
	probe: WaitlistStartBlock | null;
}
/** A start or probe letter of a waitlist signup as its admin card shows it. */
export interface WaitlistLetterStatus {
	id: string;
	status: string;
	attempts: number;
	lastErrorCode: string | null;
	sentAt: string | null;
}
export interface CatalogData {
	lessons: Lesson[];
	/** Lessons of a full group: the portal refuses them instead of taking a request. */
	closedLessonIds: string[];
	privacyVersion: typeof INTAKE_PRIVACY_VERSION;
	accepting: boolean;
	turnstileSiteKey?: string;
	now: string;
}
export interface ClosedLessonRow {
	match_key: string;
	subject: string;
	group_name: string;
	weekday: number;
	closed_at: string;
}
export interface AdminGroupsData {
	lessons: Lesson[];
	closed: ClosedLessonRow[];
	catalogError: boolean;
}
/** A course of the waitlist (WL-07); one entity of WL-15 may have several planned cards. */
export type WaitlistStatus =
	| 'price_missing'
	| 'collecting'
	| 'ready'
	| 'started'
	| 'gone'
	| 'not_in_schedule'
	| 'ambiguous'
	| 'closed';
export interface WaitlistPrice {
	monthlyCents: number;
	yearlyCents: number;
	minParticipants: number;
	updatedAt: string;
}
export interface WaitlistCourse {
	key: string;
	/** Planned catalog cards of this course; empty when it is not in the schedule. */
	lessons: Lesson[];
	/** What the admin sees: the catalog card, or the stored fields of the price row. */
	course: Omit<Lesson, 'id' | 'group'>;
	price: WaitlistPrice | null;
	/** Children of confirmed waiting entries: the participants counted against the threshold. */
	children: number;
	unconfirmedChildren: number;
	/** Waiting entries, confirmed or not: each of them locks the price. */
	activeEntries: number;
	waitingFamilies: number;
	firstDate: string | null;
	/** Null while the schedule cannot be read: no course turns into a vanished one. */
	status: WaitlistStatus | null;
	/** The orange mark: reasons to tell the families; null without a mark (WL-15). */
	attention: AttentionReason[] | null;
	/** The latest duration change in the history of the queue, if any. */
	priceRebind: {
		id: string;
		createdAt: string;
		minutes: number;
		monthlyCents: number;
		yearlyCents: number;
	} | null;
	/** The red mark: confirmed signups from before that change still without a decision. */
	priceOpen: string[];
	/** Confirmed signups of the course; filled only on the admin waitlist page. */
	entries?: WaitlistEntrySummary[];
	/** Filled only on the admin waitlist page for a course with a planned card. */
	start?: WaitlistStartOptions;
	/** The rebinds that brought this queue to its course, newest first. */
	rebinds?: WaitlistRebindRecord[];
	/** Filled only on the admin waitlist page for a course that left the schedule. */
	rebind?: RebindOptions;
}
export interface AdminWaitlistData {
	courses: WaitlistCourse[];
	/** Stored prices or queues without a planned card in the current schedule. */
	unscheduled: WaitlistCourse[];
	catalogError: boolean;
}
export type WaitlistImportOutcome = 'new' | 'change' | 'same' | 'locked' | 'unknown' | 'error';
export interface WaitlistPriceChange {
	key: string;
	monthlyCents: number;
	yearlyCents: number;
	minParticipants: number;
}
export interface WaitlistImportRow {
	line: number;
	cells: {
		fach: string;
		wochentag: string;
		uhrzeit: string;
		gebaeude: string;
		lehrkraft: string;
	};
	outcome: WaitlistImportOutcome;
	reason: string | null;
	before: Omit<WaitlistPriceChange, 'key'> | null;
	change: WaitlistPriceChange | null;
}
export interface WaitlistImportPreview {
	rows: WaitlistImportRow[];
	changes: WaitlistPriceChange[];
}
export interface IntakeFormData extends CatalogData {
	selectedId: string;
	scheduleUrl: string;
	catalogError: boolean;
}
export interface IntakeReceipt {
	id: string;
	receipt: string;
	state: IntakeState;
	resendAfter: string;
}
/** `cancelled`: a waitlist signup confirmed after its course started (WL-10). */
export type VerificationState = 'invalid' | 'expired' | 'confirm' | 'accepted' | 'cancelled';
export interface VerificationResult {
	state: VerificationState;
	/** Present only for a waitlist signup; the page then shows the waitlist texts. */
	kind?: 'waitlist';
	firstDate?: string | null;
	/** A signup cancelled by a rebind: the planned card its queue moved to, for a new signup. */
	lessonId?: string;
}
export interface AdminQuery {
	status: 'verified' | 'processed' | 'all';
	subject: string;
	teacher: string;
	weekday: number;
	building: '' | Lesson['building'];
	q: string;
	parentLastName: string;
	childLastName: string;
	sort: 'received' | 'subject' | 'teacher' | 'day' | 'parent' | 'child';
	direction: 'asc' | 'desc';
	page: number;
}
export interface AdminItem {
	id: string;
	request_id: string;
	subject: string;
	group_name: string;
	weekday: number;
	start_time: string;
	end_time: string;
	teacher: string;
	room: string;
	building: Lesson['building'];
	desired_date: string;
}
export interface AdminListRow extends AdminItem {
	state: 'verified' | 'processed';
	verified_at: string;
	parent_first_name: string;
	parent_last_name: string;
	children: { id: string; firstName: string; lastName: string; birthDate: string }[];
}
export interface AdminListData {
	query: AdminQuery;
	total: number;
	rows: AdminListRow[];
}
export interface DeliveryStatus {
	id: string;
	part: number;
	total: number;
	status: string;
	attempts: number;
	lastErrorCode: string | null;
	deliveryReference: string | null;
	sentAt: string | null;
	wait: OutboxWaitReason | null;
}
/** A request removed by retention keeps only its opaque ID in the delivery ledger. */
export type IntakeOutboxContext =
	| {
			deleted: false;
			kind: 'trial' | 'waitlist';
			parentLastName: string;
			subjects: string[];
			receivedAt: string;
	  }
	| { deleted: true };
export interface DeliveryAttention {
	unknown: boolean;
	dead: boolean;
}
export interface EmailJob {
	id: string;
	status: string;
	attempts: number;
	max_attempts: number;
	last_error_code: string | null;
	created_at: string;
}
export interface AdminChild {
	id: string;
	first_name: string;
	last_name: string;
	birth_date: string;
}
/** The snapshot of a waitlist signup on its admin card (WL-07). */
export interface AdminWaitlistEntry {
	lesson: Lesson;
	tariff: WaitlistTariff;
	monthlyCents: number;
	yearlyCents: number;
	minParticipants: number;
	consentVersion: string;
	status: WaitlistEntryStatus;
	statusChangedAt: string;
	/** The lesson date the age was checked against at signup. */
	ageDate: string;
	/** The course start that took this signup, with the catalog card of that moment. */
	start: { firstDate: string; startedAt: string; participants: number; lesson: Lesson } | null;
	/** Start letters of this family; probes go to the admin and are not listed. */
	letters: WaitlistLetterStatus[];
	/** The stored PDF of the start letter, once it was rendered. */
	document: { sha256: string; byteSize: number; createdAt: string } | null;
	/** Rebinds that moved or cancelled this signup, newest first (WL-15). */
	rebinds: WaitlistRebindRecord[];
	/** The status `cancelled` came from a rebind, not from the course start. */
	cancelledByRebind: boolean;
	/** The latest price decision after a duration change. */
	priceDecision: WaitlistPriceDecision | null;
}
export interface AdminDetailData {
	waitlist: AdminWaitlistEntry | null;
	request: {
		id: string;
		kind: 'trial' | 'waitlist';
		parentFirstName: string;
		parentLastName: string;
		email: string;
		phone: string;
		locale: string;
		state: IntakeState;
		createdAt: string;
		verifiedAt: string | null;
		processedAt: string | null;
		deleteAfter: string | null;
	};
	children: AdminChild[];
	items: (AdminItem & { children: AdminChild[] })[];
	delivery: DeliveryStatus[];
}
export function itemLesson(item: AdminItem): Omit<Lesson, 'id'> {
	return {
		subject: item.subject,
		group: item.group_name,
		weekday: item.weekday,
		start: item.start_time,
		end: item.end_time,
		teacher: item.teacher,
		room: item.room,
		building: item.building,
	};
}

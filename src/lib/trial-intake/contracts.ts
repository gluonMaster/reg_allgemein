import type { OutboxWaitReason } from '$lib/outbox-wait';

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
/** A confirmed signup as the admin sees it in the queue of a course. */
export interface WaitlistEntrySummary {
	requestId: string;
	parentFirstName: string;
	parentLastName: string;
	children: { firstName: string; lastName: string; birthDate: string }[];
	tariff: WaitlistTariff;
	verifiedAt: string;
	status: WaitlistEntryStatus;
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
		'key' | 'course' | 'status' | 'children' | 'price' | 'firstDate' | 'activeEntries'
	>[];
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
	/** Confirmed signups of the course; filled only on the admin waitlist page. */
	entries?: WaitlistEntrySummary[];
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

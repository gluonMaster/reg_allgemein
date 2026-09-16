export const INTAKE_PRIVACY_VERSION = 'trial-intake-retention-2026-09-16-v1';
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
	items: { lessonId: string; desiredDate: string; childKeys: string[] }[];
}
export interface CatalogData {
	lessons: Lesson[];
	privacyVersion: typeof INTAKE_PRIVACY_VERSION;
	accepting: boolean;
	turnstileSiteKey?: string;
	now: string;
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
export type VerificationState = 'invalid' | 'expired' | 'confirm' | 'accepted';
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
	status: string;
	attempts: number;
	last_error_code: string | null;
	sent_at: string | null;
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
export interface AdminDetailData {
	request: {
		id: string;
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

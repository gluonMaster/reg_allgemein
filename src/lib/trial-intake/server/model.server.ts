import type { IntakeState, Lesson, WaitlistEntryStatus, WaitlistTariff } from '../contracts';
export interface IntakeRequest {
	id: string;
	kind: 'trial' | 'waitlist';
	idempotency_key: string;
	payload_hash: string;
	parent_first_name: string;
	parent_last_name: string;
	parent_last_name_search: string;
	email: string;
	phone: string;
	locale: 'de' | 'ru';
	privacy_version: string;
	state: IntakeState;
	receipt_nonce: string;
	verification_version: number;
	verification_nonce: string;
	verification_hash: string;
	verification_expires_at: string;
	last_email_at: string;
	created_at: string;
	pending_expires_at: string;
	verified_at: string | null;
	processed_at: string | null;
	delete_after: string | null;
}
export interface IntakeChild {
	id: string;
	request_id: string;
	position: number;
	first_name: string;
	last_name: string;
	birth_date: string;
}
export interface IntakeItem {
	id: string;
	request_id: string;
	position: number;
	lesson_id: string;
	desired_date: string;
	subject: string;
	group_name: string;
	weekday: number;
	start_time: string;
	end_time: string;
	teacher: string;
	room: string;
	building: Lesson['building'];
}
/** Row of trial_intake_waitlist_entries (migration 0032). */
export interface WaitlistEntry {
	request_id: string;
	course_key: string;
	lesson_json: string;
	tariff: WaitlistTariff;
	monthly_cents: number;
	yearly_cents: number;
	min_participants: number;
	consent_version: string;
	status: WaitlistEntryStatus;
	start_id: string | null;
	withdraw_nonce: string;
	withdraw_hash: string;
	created_at: string;
	status_changed_at: string;
}
export interface IntakeDetail {
	request: IntakeRequest;
	children: IntakeChild[];
	items: (IntakeItem & { children: IntakeChild[] })[];
}

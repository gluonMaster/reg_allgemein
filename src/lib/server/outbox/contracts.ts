export type OutboxChannel = 'email' | 'telegram';
export type OutboxStatus = 'pending' | 'processing' | 'retry' | 'sent' | 'dead' | 'cancelled';

export interface EmailOutboxRow {
	id: string;
	source_kind: string;
	source_id: string;
	template_or_category: string;
	recipient_address_kind: 'current' | 'pending' | 'legacy';
	locale: string;
	payload_json: string;
	dedupe_key: string;
	attempts: number;
	max_attempts: number;
	email: string;
	token_id: string | null;
	token_kind: 'email_verification' | 'password_reset' | 'legacy_email_claim' | null;
	user_id: string;
	lease_owner: string;
}

export interface TelegramOutboxRow {
	id: string;
	source_kind: string;
	source_id: string;
	template_or_category: string;
	destination_ref: 'bureau';
	locale: string;
	payload_json: string;
	dedupe_key: string;
	attempts: number;
	max_attempts: number;
	lease_owner: string;
}

export interface OutboxClaimInput {
	now: string;
	leaseOwner: string;
	leaseUntil: string;
}

export interface OutboxFailureInput {
	id: string;
	leaseOwner: string;
	errorCode: string;
	nextAttemptAt: string;
	permanent: boolean;
	now: string;
}

export interface OutboxStore {
	cancelInvalidEmailRows(now: string): Promise<number>;
	claimEmail(input: OutboxClaimInput): Promise<EmailOutboxRow | null>;
	markEmailSent(input: {
		id: string;
		leaseOwner: string;
		providerRequestId: string;
		now: string;
	}): Promise<boolean>;
	markEmailFailed(input: OutboxFailureInput): Promise<'retry' | 'dead' | 'lost_lease'>;
	claimTelegram(input: OutboxClaimInput): Promise<TelegramOutboxRow | null>;
	deferTelegram(input: {
		id: string;
		leaseOwner: string;
		notBefore: string;
		now: string;
	}): Promise<boolean>;
	markTelegramSent(input: {
		id: string;
		leaseOwner: string;
		providerRequestId: string;
		now: string;
	}): Promise<boolean>;
	markTelegramFailed(input: OutboxFailureInput): Promise<'retry' | 'dead' | 'lost_lease'>;
}

export interface AdminOutboxRow {
	channel: OutboxChannel;
	id: string;
	sourceKind: string;
	sourceId: string;
	templateOrCategory: string;
	status: OutboxStatus;
	attempts: number;
	maxAttempts: number;
	notBefore: string;
	nextAttemptAt: string | null;
	lastErrorCode: string | null;
	leaseUntil: string | null;
	sentAt: string | null;
	createdAt: string;
	updatedAt: string;
}


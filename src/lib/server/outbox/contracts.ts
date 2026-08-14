export type OutboxChannel = 'email' | 'telegram';
export type OutboxStatus =
	| 'pending'
	| 'processing'
	| 'retry'
	| 'sent'
	| 'dead'
	| 'cancelled'
	| 'delivery_unknown';
export type AdminOutboxStatus = OutboxStatus;
export type TelegramDeliveryState =
	| 'not_started'
	| 'dispatch_started'
	| 'not_delivered'
	| 'delivered'
	| 'delivery_unknown';

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

export interface TelegramOutboxClaimInput extends OutboxClaimInput {
	maxAttempts?: number;
	activationAt?: string;
}

export interface OutboxFailureInput {
	id: string;
	leaseOwner: string;
	errorCode: string;
	nextAttemptAt: string;
	permanent: boolean;
	now: string;
}

export interface EmailOutboxStore {
	cancelInvalidEmailRows(now: string): Promise<number>;
	claimEmail(input: OutboxClaimInput): Promise<EmailOutboxRow | null>;
	markEmailSent(input: {
		id: string;
		leaseOwner: string;
		providerRequestId: string;
		now: string;
	}): Promise<boolean>;
	markEmailFailed(input: OutboxFailureInput): Promise<'retry' | 'dead' | 'lost_lease'>;
}

export interface TelegramOutboxStore {
	claimTelegram(input: TelegramOutboxClaimInput): Promise<TelegramOutboxRow | null>;
	reconcileStaleTelegramDispatches(now: string): Promise<number>;
	countUnresolvedTelegramDeliveries(): Promise<number>;
	countTerminalTelegramFailures(): Promise<number>;
	deferTelegram(input: {
		id: string;
		leaseOwner: string;
		notBefore: string;
		now: string;
	}): Promise<boolean>;
	markTelegramSent(input: {
		id: string;
		leaseOwner: string;
		attemptId: string;
		providerRequestId: string;
		now: string;
	}): Promise<'sent' | 'delivery_unknown'>;
	startTelegramDispatch(input: {
		id: string;
		leaseOwner: string;
		deliveryReference: string;
		now: string;
	}): Promise<{ attemptId: string } | null>;
	markTelegramNotDelivered(input: OutboxFailureInput & {
		attemptId: string;
		destinationCooldownUntil?: string;
	}): Promise<'retry' | 'dead' | 'lost_lease'>;
	markTelegramFailed(input: OutboxFailureInput): Promise<'retry' | 'dead' | 'lost_lease'>;
	markTelegramUnknown(input: {
		id: string;
		leaseOwner: string;
		attemptId: string;
		errorCode: string;
		now: string;
	}): Promise<'delivery_unknown' | 'lost_lease'>;
}

export interface OutboxStore extends EmailOutboxStore, TelegramOutboxStore {}

export interface AdminOutboxRow {
	channel: OutboxChannel;
	id: string;
	sourceKind: string;
	sourceId: string;
	templateOrCategory: string;
	status: AdminOutboxStatus;
	attempts: number;
	maxAttempts: number;
	notBefore: string;
	nextAttemptAt: string | null;
	lastErrorCode: string | null;
	leaseUntil: string | null;
	sentAt: string | null;
	createdAt: string;
	updatedAt: string;
	deliveryState?: TelegramDeliveryState;
	deliveryReference?: string;
	deliveryAttemptId?: string;
	deliveryAttemptNo?: number;
	deliveryStartedAt?: string;
}

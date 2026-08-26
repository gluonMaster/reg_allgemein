export interface ProviderSendContext {
	idempotencyKey: string;
}

export interface EmailMessage {
	to: string;
	subject: string;
	text: string;
	attachments?: readonly EmailAttachment[];
}

export interface EmailAttachment {
	filename: string;
	content: Uint8Array;
	contentType: 'application/pdf';
}

export interface EmailProvider {
	send(
		message: EmailMessage,
		context?: ProviderSendContext
	): Promise<{ providerRequestId: string }>;
}

export interface TelegramMessage {
	chatId: string;
	text: string;
	deliveryReference: string;
}

export interface TelegramProvider {
	send(
		message: TelegramMessage,
		context?: ProviderSendContext
	): Promise<{ providerRequestId: string }>;
}

export class OutboxProviderError extends Error {
	constructor(
		readonly code: string,
		readonly retryable: boolean,
		readonly options: {
			delivery: 'not_delivered' | 'unknown';
			retryAfterSeconds?: number;
		} = { delivery: 'not_delivered' }
	) {
		super('External provider operation failed.');
		this.name = 'OutboxProviderError';
	}
}

export class EmailProviderError extends OutboxProviderError {
	constructor(code: string, retryable = true) {
		super(code, retryable);
		this.name = 'EmailProviderError';
	}
}

export class TelegramProviderError extends OutboxProviderError {
	constructor(
		code: string,
		retryable = true,
		options: {
			delivery?: 'not_delivered' | 'unknown';
			retryAfterSeconds?: number;
		} = {}
	) {
		super(code, retryable, {
			delivery: options.delivery ?? 'not_delivered',
			...(options.retryAfterSeconds === undefined
				? {}
				: { retryAfterSeconds: options.retryAfterSeconds }),
		});
		this.name = 'TelegramProviderError';
	}
}

export class DisabledEmailProvider implements EmailProvider {
	async send(): Promise<{ providerRequestId: string }> {
		throw new EmailProviderError('EMAIL_PROVIDER_DISABLED', false);
	}
}

export class DisabledTelegramProvider implements TelegramProvider {
	async send(): Promise<{ providerRequestId: string }> {
		throw new TelegramProviderError('TELEGRAM_PROVIDER_DISABLED', false);
	}
}

abstract class IdempotentFakeProvider {
	protected readonly results = new Map<string, string>();
	protected readonly failures: OutboxProviderError[] = [];

	failNext(error: OutboxProviderError): void {
		this.failures.push(error);
	}

	protected prior(context: ProviderSendContext | undefined): string | null {
		return context ? (this.results.get(context.idempotencyKey) ?? null) : null;
	}

	protected nextFailure(): OutboxProviderError | null {
		return this.failures.shift() ?? null;
	}

	protected remember(context: ProviderSendContext | undefined, requestId: string): void {
		if (context) this.results.set(context.idempotencyKey, requestId);
	}
}

export class FakeEmailProvider extends IdempotentFakeProvider implements EmailProvider {
	readonly messages: EmailMessage[] = [];

	async send(
		message: EmailMessage,
		context?: ProviderSendContext
	): Promise<{ providerRequestId: string }> {
		const prior = this.prior(context);
		if (prior) return { providerRequestId: prior };
		const failure = this.nextFailure();
		if (failure) throw failure;
		this.messages.push(structuredClone(message));
		const providerRequestId = `fake-email:${this.messages.length}`;
		this.remember(context, providerRequestId);
		return { providerRequestId };
	}
}

export class FakeTelegramProvider extends IdempotentFakeProvider implements TelegramProvider {
	readonly messages: TelegramMessage[] = [];

	async send(
		message: TelegramMessage,
		context?: ProviderSendContext
	): Promise<{ providerRequestId: string }> {
		const prior = this.prior(context);
		if (prior) return { providerRequestId: prior };
		const failure = this.nextFailure();
		if (failure) throw failure;
		this.messages.push(structuredClone(message));
		const providerRequestId = `fake-telegram:${this.messages.length}`;
		this.remember(context, providerRequestId);
		return { providerRequestId };
	}
}

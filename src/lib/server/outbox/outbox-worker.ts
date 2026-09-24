import type { RuntimeConfig } from '$lib/server/config/runtime';
import { nextBusinessWindow, type BusinessHoursSchedule } from './business-hours';
import type {
	EmailOutboxStore,
	TelegramOutboxClaimInput,
	TelegramOutboxStore,
} from './contracts';
import { OutboxProviderError, type EmailProvider, type TelegramProvider } from './providers';
import { OutboxTemplateError, renderEmailTemplate, renderTelegramTemplate } from './templates';
import type { EmailAttachmentResolver } from './email-attachments';

export type DispatchOutcome =
	'empty' | 'deferred' | 'sent' | 'retry' | 'dead' | 'delivery_unknown' | 'lost_lease';

export interface WorkerTimingConfig {
	leaseSeconds: number;
	retryBaseSeconds: number;
	retryMaxSeconds: number;
}

export interface TelegramWorkerConfig extends WorkerTimingConfig {
	maxAttempts?: number;
	activationAt?: string;
}

function assertInstant(value: string): void {
	if (Number.isNaN(Date.parse(value)) || !value.endsWith('Z')) {
		throw new TypeError('Worker time must be a UTC ISO instant.');
	}
}

function secondsAfter(value: string, seconds: number): string {
	return new Date(Date.parse(value) + seconds * 1000).toISOString();
}

export function deterministicRetryAt(
	now: string,
	attemptNumber: number,
	config: Pick<WorkerTimingConfig, 'retryBaseSeconds' | 'retryMaxSeconds'>
): string {
	if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
		throw new TypeError('Attempt number must be a positive integer.');
	}
	const multiplier = 2 ** Math.min(20, attemptNumber - 1);
	const seconds = Math.min(config.retryMaxSeconds, config.retryBaseSeconds * multiplier);
	return secondsAfter(now, seconds);
}

function safeError(error: unknown): { code: string; permanent: boolean } {
	if (error instanceof OutboxProviderError) {
		const code = /^[A-Z0-9_]{1,80}$/u.test(error.code) ? error.code : 'PROVIDER_FAILURE';
		return { code, permanent: !error.retryable };
	}
	if (error instanceof OutboxTemplateError) {
		return { code: error.code, permanent: true };
	}
	return { code: 'PROVIDER_FAILURE', permanent: false };
}

function safeTelegramError(error: unknown): {
	code: string;
	permanent: boolean;
	delivery: 'not_delivered' | 'unknown';
	retryAfterSeconds?: number;
} {
	if (error instanceof OutboxProviderError) {
		const code = /^[A-Z0-9_]{1,80}$/u.test(error.code) ? error.code : 'PROVIDER_FAILURE';
		return {
			code,
			permanent: !error.retryable,
			delivery: error.options.delivery,
			...(error.options.retryAfterSeconds === undefined
				? {}
				: { retryAfterSeconds: error.options.retryAfterSeconds }),
		};
	}
	return {
		code: 'TELEGRAM_DELIVERY_UNKNOWN',
		permanent: true,
		delivery: 'unknown',
	};
}

function retryAtWithProviderDelay(
	now: string,
	attemptNumber: number,
	timing: WorkerTimingConfig,
	retryAfterSeconds?: number
): string {
	const deterministic = deterministicRetryAt(now, attemptNumber, timing);
	if (retryAfterSeconds === undefined) return deterministic;
	const provider = secondsAfter(now, retryAfterSeconds);
	return provider > deterministic ? provider : deterministic;
}

export class EmailOutboxWorker {
	private prepared = false;

	constructor(
		private readonly repository: EmailOutboxStore,
		private readonly provider: EmailProvider,
		private readonly secret: string | undefined,
		private readonly config: Pick<RuntimeConfig, 'portalPublicOrigin'>,
		private readonly timing: WorkerTimingConfig,
		private readonly workerId: string = `email-worker:${crypto.randomUUID()}`,
		private readonly clock: () => string = () => new Date().toISOString(),
		private readonly attachmentResolver?: EmailAttachmentResolver,
		private readonly render: (input: Parameters<typeof renderEmailTemplate>[0] & { now: string }) => ReturnType<typeof renderEmailTemplate> = renderEmailTemplate
	) {}

	async prepareDrain(now = this.clock(), limit = 100): Promise<number> {
		assertInstant(now);
		if (this.prepared) return 0;
		const cancelled = await this.repository.cancelInvalidEmailRows(now, limit);
		this.prepared = true;
		return cancelled;
	}

	async dispatchNext(now = this.clock()): Promise<DispatchOutcome> {
		assertInstant(now);
		await this.prepareDrain(now);
		const row = await this.repository.claimEmail({
			now,
			leaseOwner: this.workerId,
			leaseUntil: secondsAfter(now, this.timing.leaseSeconds),
		});
		if (!row) return 'empty';
		try {
			const message = await this.render({
				now,
				row,
				config: this.config,
				secret: this.secret,
			});
			if (this.attachmentResolver) {
				const resolution = await this.attachmentResolver.resolve(row);
				if (resolution.attachments.length > 0) {
					message.attachments = resolution.attachments;
				}
				if (resolution.previewReview) {
					message.subject = `[TEST/ENTWURF] ${message.subject}`;
					message.text = `TEST/ENTWURF — nicht für reale Vertragsbeziehungen.\n\n${message.text}`;
				}
			}
			const result = await this.provider.send(message, { idempotencyKey: row.dedupe_key });
			return (await this.repository.markEmailSent({
				id: row.id,
				leaseOwner: this.workerId,
				providerRequestId: result.providerRequestId,
				now,
			}))
				? 'sent'
				: 'lost_lease';
		} catch (error) {
			const safe = safeError(error);
			return this.repository.markEmailFailed({
				id: row.id,
				leaseOwner: this.workerId,
				errorCode: safe.code,
				permanent: safe.permanent,
				nextAttemptAt: deterministicRetryAt(now, row.attempts + 1, this.timing),
				now,
			});
		}
	}
}

export class TelegramOutboxWorker {
	private prepared = false;

	constructor(
		private readonly repository: TelegramOutboxStore,
		private readonly provider: TelegramProvider,
		private readonly chatId: string | undefined,
		private readonly config: Pick<RuntimeConfig, 'portalPublicOrigin'>,
		private readonly schedule: BusinessHoursSchedule,
		private readonly timing: TelegramWorkerConfig,
		private readonly workerId: string = `telegram-worker:${crypto.randomUUID()}`,
		private readonly clock: () => string = () => new Date().toISOString(),
		private readonly render: (input: Parameters<typeof renderTelegramTemplate>[0] & { now: string }) => ReturnType<typeof renderTelegramTemplate> = renderTelegramTemplate
	) {}

	async prepareDrain(now = this.clock(), limit = 100): Promise<number> {
		assertInstant(now);
		if (this.prepared) return 0;
		const reconciled = await this.repository.prepareTelegramDispatch({
			now,
			reconcileLimit: limit,
			...(this.timing.maxAttempts === undefined
				? {}
				: { maxAttempts: this.timing.maxAttempts }),
			...(this.timing.activationAt === undefined
				? {}
				: { activationAt: this.timing.activationAt }),
		});
		this.prepared = true;
		return reconciled;
	}

	async dispatchNext(
		now = this.clock(),
		scope: Pick<TelegramOutboxClaimInput, 'sourceKind'> = {}
	): Promise<DispatchOutcome> {
		assertInstant(now);
		await this.prepareDrain(now);
		const row = await this.repository.claimTelegram({
			now,
			leaseOwner: this.workerId,
			leaseUntil: secondsAfter(now, this.timing.leaseSeconds),
			...scope,
		});
		if (!row) return 'empty';
		const allowedAt = nextBusinessWindow(now, this.schedule);
		if (allowedAt !== now) {
			return (await this.repository.deferTelegram({
				id: row.id,
				leaseOwner: this.workerId,
				notBefore: allowedAt,
				now,
			}))
				? 'deferred'
				: 'lost_lease';
		}
		let message: Awaited<ReturnType<typeof renderTelegramTemplate>>;
		try {
			message = await this.render({
				now,
				row,
				config: this.config,
				chatId: this.chatId,
			});
		} catch (error) {
			const safe = safeError(error);
			return this.repository.markTelegramFailed({
				id: row.id,
				leaseOwner: this.workerId,
				errorCode: safe.code,
				permanent: safe.permanent,
				nextAttemptAt: deterministicRetryAt(now, row.attempts + 1, this.timing),
				now,
			});
		}
		const attempt = await this.repository.startTelegramDispatch({
			id: row.id,
			leaseOwner: this.workerId,
			deliveryReference: message.deliveryReference,
			now,
		});
		if (!attempt) return 'lost_lease';
		try {
			const result = await this.provider.send(message, { idempotencyKey: row.dedupe_key });
			const completedAt = this.clock();
			assertInstant(completedAt);
			return await this.repository.markTelegramSent({
				id: row.id,
				leaseOwner: this.workerId,
				attemptId: attempt.attemptId,
				providerRequestId: result.providerRequestId,
				now: completedAt,
			});
		} catch (error) {
			const completedAt = this.clock();
			assertInstant(completedAt);
			const safe = safeTelegramError(error);
			if (safe.delivery === 'unknown') {
				return this.repository.markTelegramUnknown({
					id: row.id,
					leaseOwner: this.workerId,
					attemptId: attempt.attemptId,
					errorCode: safe.code,
					now: completedAt,
				});
			}
			const nextAttemptAt =
				safe.retryAfterSeconds === undefined
					? deterministicRetryAt(completedAt, row.attempts + 1, this.timing)
					: retryAtWithProviderDelay(
							completedAt,
							row.attempts + 1,
							this.timing,
							safe.retryAfterSeconds
						);
			const destinationCooldownUntil =
				safe.code === 'TELEGRAM_RATE_LIMITED' || safe.retryAfterSeconds !== undefined
					? nextAttemptAt
					: undefined;
			return this.repository.markTelegramNotDelivered({
				id: row.id,
				leaseOwner: this.workerId,
				attemptId: attempt.attemptId,
				errorCode: safe.code,
				permanent: safe.permanent,
				nextAttemptAt,
				...(destinationCooldownUntil === undefined ? {} : { destinationCooldownUntil }),
				now: completedAt,
			});
		}
	}
}

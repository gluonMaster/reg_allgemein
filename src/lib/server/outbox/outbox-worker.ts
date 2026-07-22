import type { RuntimeConfig } from '$lib/server/config/runtime';
import { nextBusinessWindow, type BusinessHoursSchedule } from './business-hours';
import type { OutboxStore } from './contracts';
import {
	OutboxProviderError,
	type EmailProvider,
	type TelegramProvider,
} from './providers';
import {
	OutboxTemplateError,
	renderEmailTemplate,
	renderTelegramTemplate,
} from './templates';

export type DispatchOutcome = 'empty' | 'deferred' | 'sent' | 'retry' | 'dead' | 'lost_lease';

export interface WorkerTimingConfig {
	leaseSeconds: number;
	retryBaseSeconds: number;
	retryMaxSeconds: number;
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

export class EmailOutboxWorker {
	constructor(
		private readonly repository: OutboxStore,
		private readonly provider: EmailProvider,
		private readonly secret: string | undefined,
		private readonly config: Pick<RuntimeConfig, 'portalPublicOrigin'>,
		private readonly timing: WorkerTimingConfig,
		private readonly workerId: string = `email-worker:${crypto.randomUUID()}`,
		private readonly clock: () => string = () => new Date().toISOString()
	) {}

	async dispatchNext(now = this.clock()): Promise<DispatchOutcome> {
		assertInstant(now);
		await this.repository.cancelInvalidEmailRows(now);
		const row = await this.repository.claimEmail({
			now,
			leaseOwner: this.workerId,
			leaseUntil: secondsAfter(now, this.timing.leaseSeconds),
		});
		if (!row) return 'empty';
		try {
			const message = await renderEmailTemplate({
				row,
				config: this.config,
				secret: this.secret,
			});
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
	constructor(
		private readonly repository: OutboxStore,
		private readonly provider: TelegramProvider,
		private readonly chatId: string | undefined,
		private readonly config: Pick<RuntimeConfig, 'portalPublicOrigin'>,
		private readonly schedule: BusinessHoursSchedule,
		private readonly timing: WorkerTimingConfig,
		private readonly workerId: string = `telegram-worker:${crypto.randomUUID()}`,
		private readonly clock: () => string = () => new Date().toISOString()
	) {}

	async dispatchNext(now = this.clock()): Promise<DispatchOutcome> {
		assertInstant(now);
		const row = await this.repository.claimTelegram({
			now,
			leaseOwner: this.workerId,
			leaseUntil: secondsAfter(now, this.timing.leaseSeconds),
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
		try {
			const message = renderTelegramTemplate({
				row,
				config: this.config,
				chatId: this.chatId,
			});
			const result = await this.provider.send(message, { idempotencyKey: row.dedupe_key });
			return (await this.repository.markTelegramSent({
				id: row.id,
				leaseOwner: this.workerId,
				providerRequestId: result.providerRequestId,
				now,
			}))
				? 'sent'
				: 'lost_lease';
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
	}
}


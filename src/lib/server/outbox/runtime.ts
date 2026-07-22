import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import {
	DisabledEmailProvider,
	DisabledTelegramProvider,
	FakeEmailProvider,
	FakeTelegramProvider,
	type EmailProvider,
	type TelegramProvider,
} from './providers';
import { OutboxRepository } from './outbox-repository';
import { EmailOutboxWorker, TelegramOutboxWorker } from './outbox-worker';

export function createOutboxRuntime(
	config: RuntimeConfig,
	overrides: { emailProvider?: EmailProvider; telegramProvider?: TelegramProvider } = {}
) {
	const repository = new OutboxRepository(new DatabaseBoundary(config.db));
	const emailProvider =
		overrides.emailProvider ??
		(config.messaging.emailProvider === 'fake'
			? new FakeEmailProvider()
			: new DisabledEmailProvider());
	const telegramProvider =
		overrides.telegramProvider ??
		(config.messaging.telegramProvider === 'fake'
			? new FakeTelegramProvider()
			: new DisabledTelegramProvider());
	const timing = {
		leaseSeconds: config.messaging.leaseSeconds,
		retryBaseSeconds: config.messaging.retryBaseSeconds,
		retryMaxSeconds: config.messaging.retryMaxSeconds,
	};
	return {
		repository,
		emailProvider,
		telegramProvider,
		emailWorker: new EmailOutboxWorker(
			repository,
			emailProvider,
			config.jwtSecret,
			config,
			timing
		),
		telegramWorker: new TelegramOutboxWorker(
			repository,
			telegramProvider,
			config.messaging.telegramChatId,
			config,
			config.messaging.telegramSchedule,
			timing
		),
	};
}

export function requestOutboxRuntime(event: RequestEvent) {
	return createOutboxRuntime(loadRuntimeConfig(event.platform?.env));
}


import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { ResendEmailProvider } from '$lib/server/email/resend';
import { contractArtifactStore } from '$lib/server/contracts/storage';
import { TelegramBotApiProvider } from '$lib/server/telegram/bot-api';
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
import { ContractEmailAttachmentResolver } from './email-attachments';

export function createOutboxRuntime(
	config: RuntimeConfig,
	overrides: { emailProvider?: EmailProvider; telegramProvider?: TelegramProvider } = {}
) {
	const database = new DatabaseBoundary(config.db);
	const repository = new OutboxRepository(database);
	const attachmentResolver = config.r2ArchiveBucket
		? new ContractEmailAttachmentResolver(
				database,
				contractArtifactStore(config.r2ArchiveBucket),
				config.contracts.maxPdfBytes
			)
		: undefined;
	const emailProvider =
		overrides.emailProvider ??
		(config.messaging.emailProvider === 'fake'
			? new FakeEmailProvider()
			: config.messaging.emailProvider === 'resend'
				? createResendEmailProvider(config)
				: new DisabledEmailProvider());
	const telegramProvider =
		overrides.telegramProvider ??
		(config.messaging.telegramProvider === 'fake'
			? new FakeTelegramProvider()
			: config.messaging.telegramProvider === 'bot_api'
				? createTelegramBotApiProvider(config)
				: new DisabledTelegramProvider());
	const timing = {
		leaseSeconds: config.messaging.leaseSeconds,
		retryBaseSeconds: config.messaging.retryBaseSeconds,
		retryMaxSeconds: config.messaging.retryMaxSeconds,
	};
	const telegramTiming = {
		...timing,
		maxAttempts: config.messaging.telegramMaxAttempts,
		...(typeof config.messaging.telegramActivationAt === 'string'
			? { activationAt: config.messaging.telegramActivationAt }
			: {}),
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
			timing,
			undefined,
			undefined,
			attachmentResolver
		),
		telegramWorker: new TelegramOutboxWorker(
			repository,
			telegramProvider,
			config.messaging.telegramChatId,
			config,
			config.messaging.telegramSchedule,
			telegramTiming
		),
	};
}

function createResendEmailProvider(config: RuntimeConfig): ResendEmailProvider {
	const { resendApiKey, emailFrom, emailReplyTo } = config.messaging;
	if (!resendApiKey || !emailFrom || !emailReplyTo) {
		throw new Error('Validated Resend configuration is incomplete.');
	}
	return new ResendEmailProvider({
		apiKey: resendApiKey,
		from: emailFrom,
		replyTo: emailReplyTo,
		allowedRecipientHashes: config.messaging.previewEmailRecipientHashes,
	});
}

function createTelegramBotApiProvider(config: RuntimeConfig): TelegramBotApiProvider {
	const { telegramBotToken, telegramChatId, telegramChatType, telegramBotApiTimeoutMs } =
		config.messaging;
	if (!telegramBotToken || !telegramChatId || !telegramChatType) {
		throw new Error('Validated Telegram Bot API configuration is incomplete.');
	}
	return new TelegramBotApiProvider({
		token: telegramBotToken,
		chatId: telegramChatId,
		chatType: telegramChatType,
		timeoutMs: telegramBotApiTimeoutMs,
	});
}

export function requestOutboxRuntime(event: RequestEvent) {
	return createOutboxRuntime(loadRuntimeConfig(event.platform?.env));
}

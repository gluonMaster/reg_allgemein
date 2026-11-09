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
import { IntakeEmailStore, renderIntakeEmail } from '$lib/trial-intake/server/email-store.server';
import { IntakeService } from '$lib/trial-intake/server/service.server';
import { renderIntakeTelegram } from '$lib/trial-intake/server/templates.server';
import { renderTelegramTemplate } from './templates';
import type { ContractPdfAdapter } from '$lib/server/contracts/pdf';
import {
	WaitlistAttachmentResolver,
	waitlistPdfAdapter,
} from '$lib/trial-intake/server/waitlist-pdf.server';

export function createOutboxRuntime(
	config: RuntimeConfig,
	overrides: {
		emailProvider?: EmailProvider;
		telegramProvider?: TelegramProvider;
		/** Trial-intake mode: replaces the PDF renderer of the waitlist start letters. */
		waitlistPdfAdapter?: ContractPdfAdapter | null;
	} = {}
) {
	const database = new DatabaseBoundary(config.db);
	const intake = config.portalMode === 'trial_intake';
	const repository = intake ? new IntakeEmailStore(database) : new OutboxRepository(database);
	const intakeService = intake
		? new IntakeService(database, config.jwtSecret!, config.messaging.telegramSchedule)
		: null;
	// Trial-intake mode attaches only the PDF of the waitlist start letters (ADR-032).
	const attachmentResolver = intake
		? new WaitlistAttachmentResolver(
				database,
				overrides.waitlistPdfAdapter === undefined
					? waitlistPdfAdapter(config)
					: overrides.waitlistPdfAdapter
			)
		: config.r2ArchiveBucket
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
			attachmentResolver,
			intakeService ? (input) => renderIntakeEmail(intakeService, input) : undefined
		),
		telegramWorker: new TelegramOutboxWorker(
			repository,
			telegramProvider,
			config.messaging.telegramChatId,
			config,
			config.messaging.telegramSchedule,
			telegramTiming,
			undefined,
			undefined,
			intake
				? (input) =>
						input.row.template_or_category === 'bureau.trial_intake'
							? renderIntakeTelegram(database, input)
							: renderTelegramTemplate(input)
				: undefined
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

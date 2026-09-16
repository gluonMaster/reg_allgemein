import {
	APPROVED_EMAIL_FROM,
	APPROVED_EMAIL_REPLY_TO,
	buildPortalUrl,
	loadRuntimeConfig,
	RuntimeConfigError,
} from '$lib/server/config/runtime';
import { createOperationsHealthResponse } from '$lib/server/operations/monitoring';
import { runScheduledEvent } from '$lib/server/operations/scheduler';
import { ResendEmailProvider } from '$lib/server/email/resend';

const fakeDb = { prepare() {} } as unknown as D1Database;
const fakeArchive = { get() {}, put() {}, delete() {} } as unknown as R2Bucket;
const fakeQuarantine = { get() {}, put() {}, delete() {} } as unknown as R2Bucket;
const fakeAssets = { fetch() {} } as unknown as Fetcher;
const fakeBrowser = { quickAction() {} } as unknown as BrowserRun;
const officialLinks = {
	OFFICIAL_PRIVACY_URL: 'https://www.kolibri-dresden.de/datenschutz',
	OFFICIAL_IMPRINT_URL: 'https://www.kolibri-dresden.de/impressum',
	OFFICIAL_CONTACT_URL: 'https://www.kolibri-dresden.de/kontakt',
	OFFICIAL_LINKS_VERSION: 'approved-test-links-v1',
} as const;
const previewTurnstile = {
	TURNSTILE_SITE_KEY: 'test-site-key',
	TURNSTILE_SECRET_KEY: 'test-secret-key',
	TURNSTILE_HOSTNAMES: 'portal-preview.example.org',
} as const;
const telegramBotToken = `123456:${'A'.repeat(30)}`;
const telegramChatId = '-1001234567890';
const telegramActivationAt = '2026-08-13T12:00:00.000Z';

function expectRuntimeIssue(env: Partial<App.Platform['env']>, expectedIssue: string): void {
	try {
		loadRuntimeConfig(env);
		throw new Error('Expected runtime configuration to fail.');
	} catch (error) {
		expect(error).toBeInstanceOf(RuntimeConfigError);
		expect((error as RuntimeConfigError).issues).toContain(expectedIssue);
	}
}

describe('runtime configuration', () => {
	it('keeps the supervised contract preview usable with Cron explicitly paused and batch one', async () => {
		const prepare = vi.fn(() => {
			throw new Error('Paused Cron must not access D1.');
		});
		const env: Partial<App.Platform['env']> = {
			APP_ENV: 'preview',
			PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.org',
			DB: { prepare } as unknown as D1Database,
			R2_ARCHIVE: fakeArchive,
			R2_QUARANTINE: fakeQuarantine,
			ASSETS: fakeAssets,
			BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32),
			...previewTurnstile,
			...officialLinks,
			SCHEDULED_JOBS_ENABLED: 'false',
			SCHEDULED_OUTBOX_BATCH_LIMIT: '1',
			EMAIL_PROVIDER: 'resend',
			RESEND_API_KEY: 're_' + 'x'.repeat(32),
			EMAIL_FROM: APPROVED_EMAIL_FROM,
			EMAIL_REPLY_TO: APPROVED_EMAIL_REPLY_TO,
			PREVIEW_EMAIL_RECIPIENT_HASHES: 'a'.repeat(64),
			CONTRACT_SEND_ENABLED: 'true',
			CONTRACT_PREVIEW_REVIEW_ENABLED: 'true',
			CONTRACT_RENDERER: 'browser_run',
		};
		const paused = loadRuntimeConfig(env);
		expect(paused.operations).toMatchObject({
			scheduledJobsEnabled: false,
			outboxBatchLimit: 1,
		});
		for (const cron of ['* * * * *', '*/15 * * * *']) {
			const results = await runScheduledEvent(paused, {
				cron,
				scheduledTime: Date.parse('2026-09-07T10:00:00.000Z'),
			});
			expect(results).toHaveLength(cron === '* * * * *' ? 2 : 7);
			expect(results.every((result) => result.status === 'feature_disabled')).toBe(true);
		}
		const health = await createOperationsHealthResponse({
			database: paused.db,
			now: '2026-09-07T10:00:00.000Z',
			production: false,
			scheduledJobsEnabled: paused.operations.scheduledJobsEnabled,
		});
		expect(health.status).toBe(503);
		expect(prepare).not.toHaveBeenCalled();
		for (const unsupported of [
			{ APP_ENV: 'production' },
			{ SCHEDULED_JOBS_ENABLED: undefined },
			{ SCHEDULED_OUTBOX_BATCH_LIMIT: '2' },
			{ SCHEDULED_OUTBOX_BATCH_LIMIT: undefined },
			{ CONTRACT_PREVIEW_REVIEW_ENABLED: 'false' },
			{ CONTRACT_SEND_ENABLED: 'false' },
			{ CONTRACT_RENDERER: 'disabled' },
		] satisfies Partial<App.Platform['env']>[]) {
			expectRuntimeIssue({ ...env, ...unsupported }, 'SCHEDULED_JOBS_ENABLED:required');
		}
		expectRuntimeIssue(
			{ ...env, EMAIL_PROVIDER: 'disabled' },
			'CONTRACT_PREVIEW_REVIEW_ENABLED:resend_required'
		);
		expectRuntimeIssue(
			{ ...env, PREVIEW_EMAIL_RECIPIENT_HASHES: undefined },
			'PREVIEW_EMAIL_RECIPIENT_HASHES:required_for_preview_resend'
		);
	});

	it('rejects one R2 binding object reused for archive and quarantine', () => {
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'development',
				PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
				DB: fakeDb,
				R2_ARCHIVE: fakeArchive,
				R2_QUARANTINE: fakeArchive,
			})
		).toThrow(RuntimeConfigError);
	});

	it('loads an explicit local portal origin and D1 binding', () => {
		const config = loadRuntimeConfig({
			APP_ENV: 'development',
			PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb,
		});

		expect(config.portalPublicOrigin).toBe('http://127.0.0.1:5173');
		expect(config.db).toBe(fakeDb);
		expect(config.auth).toMatchObject({
			publicEnabled: false,
			emailProvider: 'disabled',
			verificationTtlSeconds: 86_400,
			resetTtlSeconds: 3_600,
			sessionTtlSeconds: 604_800,
			resendCooldownSeconds: 60,
		});
		expect(config.messaging).toMatchObject({
			emailProvider: 'disabled',
			telegramProvider: 'disabled',
			emailMaxAttempts: 5,
			telegramMaxAttempts: 5,
			leaseSeconds: 60,
			retryBaseSeconds: 60,
			retryMaxSeconds: 3600,
		});
		expect(config.messaging.telegramSchedule.canonical).toBe('Mo-Fr 09:00-17:00');
	});

	it('validates Telegram destination, retry bounds, and the production provider gate', () => {
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'development',
				PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
				DB: fakeDb,
				TELEGRAM_PROVIDER: 'fake',
			})
		).toThrow(RuntimeConfigError);
		const configured = loadRuntimeConfig({
			APP_ENV: 'development',
			PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb,
			TELEGRAM_PROVIDER: 'fake',
			TELEGRAM_CHAT_ID: 'bureau-test',
			OUTBOX_RETRY_BASE_SECONDS: '30',
			OUTBOX_RETRY_MAX_SECONDS: '600',
		});
		expect(configured.messaging).toMatchObject({
			telegramProvider: 'fake',
			telegramChatId: 'bureau-test',
			retryBaseSeconds: 30,
			retryMaxSeconds: 600,
		});
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'development',
				PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
				DB: fakeDb,
				OUTBOX_RETRY_BASE_SECONDS: '601',
				OUTBOX_RETRY_MAX_SECONDS: '600',
			})
		).toThrow(RuntimeConfigError);
	});

	it('loads a production-shaped Telegram Bot API configuration with bounded dispatch', () => {
		const config = loadRuntimeConfig({
			APP_ENV: 'production',
			PORTAL_PUBLIC_ORIGIN: 'https://portal.example.org',
			DB: fakeDb,
			R2_ARCHIVE: fakeArchive,
			R2_QUARANTINE: fakeQuarantine,
			ASSETS: fakeAssets,
			BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32),
			TURNSTILE_SITE_KEY: 'test-site-key',
			TURNSTILE_SECRET_KEY: 'test-secret-key',
			TURNSTILE_HOSTNAMES: 'portal.example.org',
			SCHEDULED_JOBS_ENABLED: 'true',
			...officialLinks,
			TELEGRAM_PROVIDER: 'bot_api',
			TELEGRAM_BOT_TOKEN: telegramBotToken,
			TELEGRAM_CHAT_ID: telegramChatId,
			TELEGRAM_CHAT_TYPE: 'channel',
			TELEGRAM_BOT_API_TIMEOUT_MS: '10000',
			TELEGRAM_ACTIVATION_AT: telegramActivationAt,
			OUTBOX_LEASE_SECONDS: '60',
		});

		expect(config.messaging).toMatchObject({
			telegramProvider: 'bot_api',
			telegramBotToken,
			telegramChatId,
			telegramChatType: 'channel',
			telegramBotApiTimeoutMs: 10_000,
			telegramActivationAt,
			leaseSeconds: 60,
		});
	});

	it('requires a secret-shaped token, protected signed-decimal chat, and exact chat type', () => {
		const base = {
			APP_ENV: 'development',
			PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb,
			TELEGRAM_PROVIDER: 'bot_api',
			TELEGRAM_BOT_TOKEN: telegramBotToken,
			TELEGRAM_CHAT_ID: telegramChatId,
			TELEGRAM_CHAT_TYPE: 'channel',
			TELEGRAM_ACTIVATION_AT: telegramActivationAt,
		} as const;

		expectRuntimeIssue(
			{ ...base, TELEGRAM_BOT_TOKEN: undefined },
			'TELEGRAM_BOT_TOKEN:required_when_provider_enabled'
		);
		expectRuntimeIssue(
			{ ...base, TELEGRAM_BOT_TOKEN: 'replace-with-a-telegram-token' },
			'TELEGRAM_BOT_TOKEN:placeholder'
		);
		for (const invalidToken of [
			'not-a-token',
			`012345:${'A'.repeat(30)}`,
			`9007199254740992:${'A'.repeat(30)}`,
		]) {
			expectRuntimeIssue(
				{ ...base, TELEGRAM_BOT_TOKEN: invalidToken },
				'TELEGRAM_BOT_TOKEN:invalid_format'
			);
		}
		expectRuntimeIssue(
			{ ...base, TELEGRAM_CHAT_ID: undefined },
			'TELEGRAM_CHAT_ID:required_when_provider_enabled'
		);
		for (const invalidChatId of ['@bureau', '0012345', '0', '9007199254740992']) {
			expectRuntimeIssue(
				{ ...base, TELEGRAM_CHAT_ID: invalidChatId },
				'TELEGRAM_CHAT_ID:signed_decimal_required'
			);
		}
		expectRuntimeIssue(
			{ ...base, TELEGRAM_CHAT_TYPE: undefined },
			'TELEGRAM_CHAT_TYPE:required_when_provider_enabled'
		);
		expectRuntimeIssue(
			{ ...base, TELEGRAM_ACTIVATION_AT: undefined },
			'TELEGRAM_ACTIVATION_AT:required_when_provider_enabled'
		);
		expectRuntimeIssue(
			{ ...base, TELEGRAM_ACTIVATION_AT: '2026-08-13 12:00:00' },
			'TELEGRAM_ACTIVATION_AT:canonical_utc_required'
		);
	});

	it('keeps the Bot API timeout below its lease and within the hard risk range', () => {
		const base = {
			APP_ENV: 'development',
			PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb,
			TELEGRAM_PROVIDER: 'bot_api',
			TELEGRAM_BOT_TOKEN: telegramBotToken,
			TELEGRAM_CHAT_ID: telegramChatId,
			TELEGRAM_CHAT_TYPE: 'supergroup',
			TELEGRAM_ACTIVATION_AT: telegramActivationAt,
		} as const;

		expectRuntimeIssue(
			{ ...base, TELEGRAM_BOT_API_TIMEOUT_MS: '999' },
			'TELEGRAM_BOT_API_TIMEOUT_MS:out_of_range'
		);
		expectRuntimeIssue(
			{ ...base, TELEGRAM_BOT_API_TIMEOUT_MS: '30001' },
			'TELEGRAM_BOT_API_TIMEOUT_MS:risk_ceiling_exceeded'
		);
		expectRuntimeIssue(
			{
				...base,
				TELEGRAM_BOT_API_TIMEOUT_MS: '10000',
				OUTBOX_LEASE_SECONDS: '10',
			},
			'TELEGRAM_BOT_API_TIMEOUT_MS:must_be_less_than_outbox_lease'
		);
		const valid = loadRuntimeConfig({
			...base,
			TELEGRAM_BOT_API_TIMEOUT_MS: '29999',
			OUTBOX_LEASE_SECONDS: '30',
		});
		expect(valid.messaging.telegramBotApiTimeoutMs).toBe(29_999);
	});

	it('forbids fake Telegram in production while allowing disabled and bot_api modes', () => {
		const production = {
			APP_ENV: 'production',
			PORTAL_PUBLIC_ORIGIN: 'https://portal.example.org',
			DB: fakeDb,
			R2_ARCHIVE: fakeArchive,
			R2_QUARANTINE: fakeQuarantine,
			ASSETS: fakeAssets,
			BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32),
			TURNSTILE_SITE_KEY: 'test-site-key',
			TURNSTILE_SECRET_KEY: 'test-secret-key',
			TURNSTILE_HOSTNAMES: 'portal.example.org',
			SCHEDULED_JOBS_ENABLED: 'true',
			...officialLinks,
		} as const;

		expect(loadRuntimeConfig(production).messaging.telegramProvider).toBe('disabled');
		expectRuntimeIssue(
			{ ...production, TELEGRAM_PROVIDER: 'fake', TELEGRAM_CHAT_ID: 'bureau-test' },
			'TELEGRAM_PROVIDER:fake_forbidden_in_production'
		);
		expect(
			loadRuntimeConfig({
				...production,
				TELEGRAM_PROVIDER: 'bot_api',
				TELEGRAM_BOT_TOKEN: telegramBotToken,
				TELEGRAM_CHAT_ID: telegramChatId,
				TELEGRAM_CHAT_TYPE: 'channel',
				TELEGRAM_ACTIVATION_AT: telegramActivationAt,
			}).messaging.telegramProvider
		).toBe('bot_api');
	});

	it('fails closed when required base configuration is missing', () => {
		expect(() => loadRuntimeConfig(undefined)).toThrow(RuntimeConfigError);
	});

	it.each([
		'https://kolibri-dresden.de',
		'https://www.kolibri-dresden.de',
		'https://portal.kolibri-dresden.de',
	])('rejects the official-site infrastructure as portal origin: %s', (origin) => {
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'development',
				PORTAL_PUBLIC_ORIGIN: origin,
				DB: fakeDb,
			})
		).toThrowError(/Runtime configuration is invalid/);
	});

	it('requires production-shaped bindings and critical secrets in preview', () => {
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'preview',
				PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.org',
				DB: fakeDb,
			})
		).toThrow(RuntimeConfigError);

		const config = loadRuntimeConfig({
			APP_ENV: 'preview',
			PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.org',
			DB: fakeDb,
			R2_ARCHIVE: fakeArchive,
			R2_QUARANTINE: fakeQuarantine,
			ASSETS: fakeAssets,
			BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32),
			...previewTurnstile,
			SCHEDULED_JOBS_ENABLED: 'true',
			...officialLinks,
		});

		expect(config.appEnvironment).toBe('preview');
		expect(config.turnstileHostnames).toEqual(['portal-preview.example.org']);
	});

	it('requires exact deployment-specific Turnstile hostnames and forbids local production hosts', () => {
		const base = {
			DB: fakeDb,
			R2_ARCHIVE: fakeArchive,
			R2_QUARANTINE: fakeQuarantine,
			ASSETS: fakeAssets,
			BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32),
			TURNSTILE_SITE_KEY: 'test-site-key',
			TURNSTILE_SECRET_KEY: 'test-secret-key',
			SCHEDULED_JOBS_ENABLED: 'true',
			...officialLinks,
		} as const;

		try {
			loadRuntimeConfig({
				...base,
				APP_ENV: 'preview',
				PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.org',
				TURNSTILE_HOSTNAMES: 'another-preview.example.org',
			});
			throw new Error('Expected preview hostname validation to fail');
		} catch (error) {
			expect(error).toBeInstanceOf(RuntimeConfigError);
			expect((error as RuntimeConfigError).issues).toContain(
				'TURNSTILE_HOSTNAMES:portal_hostname_required'
			);
		}

		try {
			loadRuntimeConfig({
				...base,
				APP_ENV: 'production',
				PORTAL_PUBLIC_ORIGIN: 'https://portal.example.org',
				TURNSTILE_HOSTNAMES: 'portal.example.org,localhost',
			});
			throw new Error('Expected production hostname validation to fail');
		} catch (error) {
			expect(error).toBeInstanceOf(RuntimeConfigError);
			expect((error as RuntimeConfigError).issues).toContain(
				'TURNSTILE_HOSTNAMES:local_hostname_forbidden_in_production'
			);
		}
	});

	it('rejects non-public origins and placeholder credentials in preview', () => {
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'preview',
				PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.invalid',
				DB: fakeDb,
				R2_ARCHIVE: fakeArchive,
				R2_QUARANTINE: fakeQuarantine,
				ASSETS: fakeAssets,
				BROWSER: fakeBrowser,
				JWT_SECRET: 'x'.repeat(32),
				TURNSTILE_SITE_KEY: 'test-site-key',
				TURNSTILE_SECRET_KEY: 'test-secret-key',
			})
		).toThrow(RuntimeConfigError);

		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'preview',
				PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.org',
				DB: fakeDb,
				R2_ARCHIVE: fakeArchive,
				R2_QUARANTINE: fakeQuarantine,
				ASSETS: fakeAssets,
				BROWSER: fakeBrowser,
				JWT_SECRET: 'replace-with-a-long-random-preview-value',
				TURNSTILE_SITE_KEY: 'replace-me',
				TURNSTILE_SECRET_KEY: 'replace-me',
			})
		).toThrow(RuntimeConfigError);
	});

	it('allows a fake auth provider only outside production and keeps production auth disabled', () => {
		const preview = loadRuntimeConfig({
			APP_ENV: 'preview',
			PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.org',
			DB: fakeDb,
			R2_ARCHIVE: fakeArchive,
			R2_QUARANTINE: fakeQuarantine,
			ASSETS: fakeAssets,
			BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32),
			...previewTurnstile,
			SCHEDULED_JOBS_ENABLED: 'true',
			...officialLinks,
			AUTH_PUBLIC_ENABLED: 'true',
			EMAIL_PROVIDER: 'fake',
			PRIVACY_NOTICE_VERSION: 'synthetic-preview-notice-v1',
		});
		expect(preview.auth).toMatchObject({ publicEnabled: true, emailProvider: 'fake' });

		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'production',
				PORTAL_PUBLIC_ORIGIN: 'https://portal.example.org',
				DB: fakeDb,
				R2_ARCHIVE: fakeArchive,
				R2_QUARANTINE: fakeQuarantine,
				ASSETS: fakeAssets,
				BROWSER: fakeBrowser,
				JWT_SECRET: 'x'.repeat(32),
				TURNSTILE_SITE_KEY: 'test-site-key',
				TURNSTILE_SECRET_KEY: 'test-secret-key',
				AUTH_PUBLIC_ENABLED: 'true',
				EMAIL_PROVIDER: 'fake',
				PRIVACY_NOTICE_VERSION: 'production-notice-v1',
			})
		).toThrow(RuntimeConfigError);
	});

	it('requires the approved registration identity and a dedicated key for Resend', () => {
		const base = {
			APP_ENV: 'development',
			PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb,
			EMAIL_PROVIDER: 'resend',
			RESEND_API_KEY: 're_' + 'x'.repeat(32),
			EMAIL_FROM: APPROVED_EMAIL_FROM,
			EMAIL_REPLY_TO: APPROVED_EMAIL_REPLY_TO,
		} as const;

		const configured = loadRuntimeConfig(base);
		expect(configured.messaging).toMatchObject({
			emailProvider: 'resend',
			emailFrom: APPROVED_EMAIL_FROM,
			emailReplyTo: APPROVED_EMAIL_REPLY_TO,
			resendApiKey: base.RESEND_API_KEY,
		});

		for (const invalid of [
			{ ...base, RESEND_API_KEY: undefined },
			{
				...base,
				EMAIL_FROM: `Kolibri <${['info', 'kolibri-dresden.de'].join('@')}>`,
			},
			{ ...base, EMAIL_REPLY_TO: ['info', 'kolibri-dresden.de'].join('@') },
		]) {
			expect(() => loadRuntimeConfig(invalid)).toThrow(RuntimeConfigError);
		}
	});

	it('allows unrestricted preview email only through the explicit wildcard', async () => {
		const base = {
			APP_ENV: 'preview',
			PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.org',
			DB: fakeDb,
			R2_ARCHIVE: fakeArchive,
			R2_QUARANTINE: fakeQuarantine,
			ASSETS: fakeAssets,
			BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32),
			...previewTurnstile,
			...officialLinks,
			SCHEDULED_JOBS_ENABLED: 'true',
			EMAIL_PROVIDER: 'resend',
			RESEND_API_KEY: 're_' + 'x'.repeat(32),
			EMAIL_FROM: APPROVED_EMAIL_FROM,
			EMAIL_REPLY_TO: APPROVED_EMAIL_REPLY_TO,
			PREVIEW_EMAIL_RECIPIENT_HASHES: '*',
		} as const;
		const config = loadRuntimeConfig(base);
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(Response.json({ id: 'preview-send' }));
		const provider = new ResendEmailProvider({
			apiKey: config.messaging.resendApiKey!,
			from: config.messaging.emailFrom!,
			replyTo: config.messaging.emailReplyTo!,
			allowedRecipientHashes: config.messaging.previewEmailRecipientHashes,
			fetcher,
		});
		await expect(
			provider.send(
				{ to: 'new-preview-parent@example.org', subject: 'Verification', text: 'Test' },
				{ idempotencyKey: 'preview-unrestricted-verification' }
			)
		).resolves.toEqual({ providerRequestId: 'preview-send' });
		expect(fetcher).toHaveBeenCalledOnce();
		expectRuntimeIssue(
			{ ...base, PREVIEW_EMAIL_RECIPIENT_HASHES: undefined },
			'PREVIEW_EMAIL_RECIPIENT_HASHES:required_for_preview_resend'
		);
		for (const invalid of [
			' ',
			' * ',
			`*,${'a'.repeat(64)}`,
			'all',
			`${'a'.repeat(64)},${'a'.repeat(64)}`,
			Array.from({ length: 6 }, (_, i) => String(i).repeat(64)).join(','),
		]) {
			expectRuntimeIssue(
				{ ...base, PREVIEW_EMAIL_RECIPIENT_HASHES: invalid },
				'PREVIEW_EMAIL_RECIPIENT_HASHES:invalid_sha256_allowlist'
			);
		}
		expect(
			loadRuntimeConfig({ ...base, PREVIEW_EMAIL_RECIPIENT_HASHES: 'a'.repeat(64) }).messaging
				.previewEmailRecipientHashes
		).toEqual(['a'.repeat(64)]);
		expectRuntimeIssue(
			{ ...base, APP_ENV: 'production' },
			'PREVIEW_EMAIL_RECIPIENT_HASHES:preview_only'
		);
	});

	it('allows Resend-backed public auth in production-shaped configuration', () => {
		const config = loadRuntimeConfig({
			APP_ENV: 'production',
			PORTAL_PUBLIC_ORIGIN: 'https://portal.example.org',
			DB: fakeDb,
			R2_ARCHIVE: fakeArchive,
			R2_QUARANTINE: fakeQuarantine,
			ASSETS: fakeAssets,
			BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32),
			TURNSTILE_SITE_KEY: 'test-site-key',
			TURNSTILE_SECRET_KEY: 'test-secret-key',
			TURNSTILE_HOSTNAMES: 'portal.example.org',
			SCHEDULED_JOBS_ENABLED: 'true',
			...officialLinks,
			AUTH_PUBLIC_ENABLED: 'true',
			PRIVACY_NOTICE_VERSION: 'production-notice-v1',
			EMAIL_PROVIDER: 'resend',
			RESEND_API_KEY: 're_' + 'x'.repeat(32),
			EMAIL_FROM: APPROVED_EMAIL_FROM,
			EMAIL_REPLY_TO: APPROVED_EMAIL_REPLY_TO,
		});

		expect(config.auth).toMatchObject({ publicEnabled: true, emailProvider: 'resend' });
		expect(config.messaging.emailProvider).toBe('resend');
	});

	it('builds absolute links only below the configured portal origin', () => {
		const config = { portalPublicOrigin: 'https://portal.example.org' };

		expect(buildPortalUrl(config, '/verify?token=opaque').toString()).toBe(
			'https://portal.example.org/verify?token=opaque'
		);
		expect(() => buildPortalUrl(config, '//kolibri-dresden.de/')).toThrow(RuntimeConfigError);
	});

	it('loads pricing defaults and validates configured integer cents without float rounding', () => {
		const defaults = loadRuntimeConfig({
			APP_ENV: 'development',
			PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb,
		});
		expect(defaults.pricing).toEqual({
			individualPriceCentsPer45Min: 3000,
			groupDurationFallbackMinutes: 90,
			missingDurationYearlyCentsPer45Min: 2300,
			missingDurationMonthlyCentsPer45Min: 3000,
			quoteTtlSeconds: 86_400,
		});

		const configured = loadRuntimeConfig({
			APP_ENV: 'development',
			PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb,
			INDIVIDUAL_PRICE_CENTS_PER_45_MIN: '3150',
			GROUP_DURATION_FALLBACK_MINUTES: '135',
			MISSING_DURATION_YEARLY_CENTS_PER_45_MIN: '2400',
			MISSING_DURATION_MONTHLY_CENTS_PER_45_MIN: '3100',
			PRICE_QUOTE_TTL_SECONDS: '7200',
		});
		expect(configured.pricing).toMatchObject({
			individualPriceCentsPer45Min: 3150,
			groupDurationFallbackMinutes: 135,
			quoteTtlSeconds: 7200,
		});
	});

	it.each([
		{ GROUP_DURATION_FALLBACK_MINUTES: '60' },
		{ GROUP_DURATION_FALLBACK_MINUTES: '90.0' },
		{ MISSING_DURATION_YEARLY_CENTS_PER_45_MIN: '-1' },
		{ MISSING_DURATION_MONTHLY_CENTS_PER_45_MIN: '30.50' },
		{ PRICE_QUOTE_TTL_SECONDS: '0' },
	])('fails closed for invalid pricing config: %#', (pricingEnv) => {
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'development',
				PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
				DB: fakeDb,
				...pricingEnv,
			})
		).toThrow(RuntimeConfigError);
	});

	it('keeps document upload disabled by default and enforces hard risk ceilings', () => {
		const config = loadRuntimeConfig({
			APP_ENV: 'development',
			PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb,
		});
		expect(config.documents).toMatchObject({
			uploadEnabled: false,
			maxFileBytes: 10 * 1024 * 1024,
			maxFilesPerAuthorization: 5,
			maxAuthorizationBytes: 25 * 1024 * 1024,
			avAttestationTextVersion: 'manual-local-av-v1',
		});
		for (const documentEnv of [
			{ DOCUMENT_MAX_FILE_BYTES: String(10 * 1024 * 1024 + 1) },
			{ DOCUMENT_MAX_FILES_PER_AUTHORIZATION: '6' },
			{ DOCUMENT_MAX_AUTHORIZATION_BYTES: String(25 * 1024 * 1024 + 1) },
		]) {
			expect(() =>
				loadRuntimeConfig({
					APP_ENV: 'development',
					PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
					DB: fakeDb,
					...documentEnv,
				})
			).toThrow(RuntimeConfigError);
		}
	});

	it('requires private storage and a secret when enabled and never releases production upload', () => {
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'development',
				PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
				DB: fakeDb,
				DOCUMENT_UPLOAD_ENABLED: 'true',
			})
		).toThrow(RuntimeConfigError);
		const enabled = loadRuntimeConfig({
			APP_ENV: 'development',
			PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb,
			R2_ARCHIVE: fakeArchive,
			R2_QUARANTINE: fakeQuarantine,
			JWT_SECRET: 'x'.repeat(32),
			DOCUMENT_UPLOAD_ENABLED: 'true',
		});
		expect(enabled.documents.uploadEnabled).toBe(true);
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'production',
				PORTAL_PUBLIC_ORIGIN: 'https://portal.example.org',
				DB: fakeDb,
				R2_ARCHIVE: fakeArchive,
				R2_QUARANTINE: fakeQuarantine,
				ASSETS: fakeAssets,
				BROWSER: fakeBrowser,
				JWT_SECRET: 'x'.repeat(32),
				TURNSTILE_SITE_KEY: 'site',
				TURNSTILE_SECRET_KEY: 'secret',
				DOCUMENT_UPLOAD_ENABLED: 'true',
			})
		).toThrow(RuntimeConfigError);
	});

	it('keeps contract send, public functions, and online media grant fail-closed', () => {
		const defaults = loadRuntimeConfig({
			APP_ENV: 'development',
			PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb,
		});
		expect(defaults.contracts).toEqual({
			sendEnabled: false,
			previewReviewEnabled: false,
			renderer: 'disabled',
			maxHtmlBytes: 2 * 1024 * 1024,
			maxPdfBytes: 10 * 1024 * 1024,
			maxRenderAttempts: 3,
			browserDailyBudgetMs: 60_000,
			mediaOnlineGrantEnabled: false,
			publicFunctionsEnabled: false,
		});
		const previewReview = loadRuntimeConfig({
			APP_ENV: 'preview',
			PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.org',
			DB: fakeDb,
			R2_ARCHIVE: fakeArchive,
			R2_QUARANTINE: fakeQuarantine,
			ASSETS: fakeAssets,
			BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32),
			...previewTurnstile,
			...officialLinks,
			SCHEDULED_JOBS_ENABLED: 'true',
			EMAIL_PROVIDER: 'resend',
			RESEND_API_KEY: 're_' + 'x'.repeat(32),
			EMAIL_FROM: APPROVED_EMAIL_FROM,
			EMAIL_REPLY_TO: APPROVED_EMAIL_REPLY_TO,
			PREVIEW_EMAIL_RECIPIENT_HASHES: 'a'.repeat(64),
			CONTRACT_SEND_ENABLED: 'true',
			CONTRACT_PREVIEW_REVIEW_ENABLED: 'true',
			CONTRACT_RENDERER: 'browser_run',
		});
		expect(previewReview.contracts).toMatchObject({
			sendEnabled: true,
			previewReviewEnabled: true,
			renderer: 'browser_run',
		});
		expect(previewReview.messaging.previewEmailRecipientHashes).toEqual(['a'.repeat(64)]);
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'development',
				PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
				DB: fakeDb,
				CONTRACT_SEND_ENABLED: 'true',
				CONTRACT_RENDERER: 'disabled',
			})
		).toThrow(RuntimeConfigError);
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'production',
				PORTAL_PUBLIC_ORIGIN: 'https://portal.example.org',
				DB: fakeDb,
				R2_ARCHIVE: fakeArchive,
				R2_QUARANTINE: fakeQuarantine,
				ASSETS: fakeAssets,
				BROWSER: fakeBrowser,
				JWT_SECRET: 'x'.repeat(32),
				TURNSTILE_SITE_KEY: 'site',
				TURNSTILE_SECRET_KEY: 'secret',
				CONTRACT_SEND_ENABLED: 'true',
				CONTRACT_RENDERER: 'browser_run',
			})
		).toThrow(RuntimeConfigError);
		for (const forbidden of [
			{ MEDIA_ONLINE_GRANT_ENABLED: 'true' },
			{ PUBLIC_CONTRACT_FUNCTIONS_ENABLED: 'true' },
		]) {
			expect(() =>
				loadRuntimeConfig({
					APP_ENV: 'production',
					PORTAL_PUBLIC_ORIGIN: 'https://portal.example.org',
					DB: fakeDb,
					R2_ARCHIVE: fakeArchive,
					R2_QUARANTINE: fakeQuarantine,
					ASSETS: fakeAssets,
					BROWSER: fakeBrowser,
					JWT_SECRET: 'x'.repeat(32),
					TURNSTILE_SITE_KEY: 'site',
					TURNSTILE_SECRET_KEY: 'secret',
					...forbidden,
				})
			).toThrow(RuntimeConfigError);
		}
	});
});

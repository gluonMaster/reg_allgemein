import { buildPortalUrl, loadRuntimeConfig, RuntimeConfigError } from '$lib/server/config/runtime';

const fakeDb = { prepare() {} } as unknown as D1Database;
const fakeR2 = { get() {}, put() {}, delete() {} } as unknown as R2Bucket;
const fakeAssets = { fetch() {} } as unknown as Fetcher;
const fakeBrowser = { quickAction() {} } as unknown as BrowserRun;

describe('runtime configuration', () => {
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
			R2_BUCKET: fakeR2,
			ASSETS: fakeAssets,
			BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32),
			TURNSTILE_SITE_KEY: 'test-site-key',
			TURNSTILE_SECRET_KEY: 'test-secret-key',
		});

		expect(config.appEnvironment).toBe('preview');
	});

	it('rejects non-public origins and placeholder credentials in preview', () => {
		expect(() =>
			loadRuntimeConfig({
				APP_ENV: 'preview',
				PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.invalid',
				DB: fakeDb,
				R2_BUCKET: fakeR2,
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
				R2_BUCKET: fakeR2,
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
			R2_BUCKET: fakeR2,
			ASSETS: fakeAssets,
			BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32),
			TURNSTILE_SITE_KEY: 'test-site-key',
			TURNSTILE_SECRET_KEY: 'test-secret-key',
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
				R2_BUCKET: fakeR2,
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
			expect(() => loadRuntimeConfig({
				APP_ENV: 'development', PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
				DB: fakeDb, ...documentEnv,
			})).toThrow(RuntimeConfigError);
		}
	});

	it('requires private storage and a secret when enabled and never releases production upload', () => {
		expect(() => loadRuntimeConfig({
			APP_ENV: 'development', PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb, DOCUMENT_UPLOAD_ENABLED: 'true',
		})).toThrow(RuntimeConfigError);
		const enabled = loadRuntimeConfig({
			APP_ENV: 'development', PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb, R2_BUCKET: fakeR2, JWT_SECRET: 'x'.repeat(32),
			DOCUMENT_UPLOAD_ENABLED: 'true',
		});
		expect(enabled.documents.uploadEnabled).toBe(true);
		expect(() => loadRuntimeConfig({
			APP_ENV: 'production', PORTAL_PUBLIC_ORIGIN: 'https://portal.example.org',
			DB: fakeDb, R2_BUCKET: fakeR2, ASSETS: fakeAssets, BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32), TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret',
			DOCUMENT_UPLOAD_ENABLED: 'true',
		})).toThrow(RuntimeConfigError);
	});

	it('keeps contract send, public functions, and online media grant fail-closed', () => {
		const defaults = loadRuntimeConfig({
			APP_ENV: 'development', PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173', DB: fakeDb,
		});
		expect(defaults.contracts).toEqual({
			sendEnabled: false,
			renderer: 'disabled',
			maxHtmlBytes: 2 * 1024 * 1024,
			maxPdfBytes: 10 * 1024 * 1024,
			maxRenderAttempts: 3,
			browserDailyBudgetMs: 60_000,
			mediaOnlineGrantEnabled: false,
			publicFunctionsEnabled: false,
		});
		expect(() => loadRuntimeConfig({
			APP_ENV: 'development', PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173', DB: fakeDb,
			CONTRACT_SEND_ENABLED: 'true', CONTRACT_RENDERER: 'disabled',
		})).toThrow(RuntimeConfigError);
		expect(() => loadRuntimeConfig({
			APP_ENV: 'production', PORTAL_PUBLIC_ORIGIN: 'https://portal.example.org', DB: fakeDb,
			R2_BUCKET: fakeR2, ASSETS: fakeAssets, BROWSER: fakeBrowser,
			JWT_SECRET: 'x'.repeat(32), TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret',
			CONTRACT_SEND_ENABLED: 'true', CONTRACT_RENDERER: 'browser_run',
		})).toThrow(RuntimeConfigError);
		for (const forbidden of [
			{ MEDIA_ONLINE_GRANT_ENABLED: 'true' },
			{ PUBLIC_CONTRACT_FUNCTIONS_ENABLED: 'true' },
		]) {
			expect(() => loadRuntimeConfig({
				APP_ENV: 'production', PORTAL_PUBLIC_ORIGIN: 'https://portal.example.org', DB: fakeDb,
				R2_BUCKET: fakeR2, ASSETS: fakeAssets, BROWSER: fakeBrowser,
				JWT_SECRET: 'x'.repeat(32), TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret',
				...forbidden,
			})).toThrow(RuntimeConfigError);
		}
	});
});

import { buildPortalUrl, loadRuntimeConfig, RuntimeConfigError } from '$lib/server/config/runtime';

const fakeDb = { prepare() {} } as unknown as D1Database;
const fakeR2 = { get() {}, put() {} } as unknown as R2Bucket;
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
});

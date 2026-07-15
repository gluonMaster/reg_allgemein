import { z } from 'zod';

const rawConfigSchema = z.object({
	APP_ENV: z.enum(['development', 'test', 'preview', 'production']),
	PORTAL_PUBLIC_ORIGIN: z.string().min(1),
	JWT_SECRET: z.string().min(32).optional(),
	TURNSTILE_SITE_KEY: z.string().min(1).optional(),
	TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
	INDIVIDUAL_PRICE_CENTS_PER_45_MIN: z.string().optional(),
	GROUP_DURATION_FALLBACK_MINUTES: z.string().optional(),
	MISSING_DURATION_YEARLY_CENTS_PER_45_MIN: z.string().optional(),
	MISSING_DURATION_MONTHLY_CENTS_PER_45_MIN: z.string().optional(),
	PRICE_QUOTE_TTL_SECONDS: z.string().optional(),
});

export type PortalEnvironment = z.infer<typeof rawConfigSchema>['APP_ENV'];

export interface RuntimeConfig {
	appEnvironment: PortalEnvironment;
	portalPublicOrigin: string;
	db: D1Database;
	r2Bucket?: R2Bucket;
	assets?: Fetcher;
	browser?: BrowserRun;
	jwtSecret?: string;
	turnstileSiteKey?: string;
	turnstileSecretKey?: string;
	pricing: PricingRuntimeConfig;
}

export interface PricingRuntimeConfig {
	individualPriceCentsPer45Min: number;
	groupDurationFallbackMinutes: number;
	missingDurationYearlyCentsPer45Min: number;
	missingDurationMonthlyCentsPer45Min: number;
	quoteTtlSeconds: number;
}

export class RuntimeConfigError extends Error {
	readonly issues: readonly string[];

	constructor(issues: readonly string[]) {
		super('Runtime configuration is invalid.');
		this.name = 'RuntimeConfigError';
		this.issues = issues;
	}
}

function isD1Database(value: unknown): value is D1Database {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof Reflect.get(value, 'prepare') === 'function'
	);
}

function isR2Bucket(value: unknown): value is R2Bucket {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof Reflect.get(value, 'get') === 'function' &&
		typeof Reflect.get(value, 'put') === 'function'
	);
}

function isFetcher(value: unknown): value is Fetcher {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof Reflect.get(value, 'fetch') === 'function'
	);
}

function isBrowserRun(value: unknown): value is BrowserRun {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof Reflect.get(value, 'quickAction') === 'function'
	);
}

function isPlaceholder(value: string | undefined): boolean {
	return value !== undefined && /^(change-me|changeme|example|replace)/i.test(value.trim());
}

function parseIntegerConfig(input: {
	name: string;
	value: string | undefined;
	defaultValue: number;
	minimum: number;
	multipleOf?: number;
	issues: string[];
}): number {
	const raw = input.value ?? String(input.defaultValue);
	if (!/^\d+$/.test(raw)) {
		input.issues.push(`${input.name}:positive_integer_required`);
		return input.defaultValue;
	}
	const parsed = Number(raw);
	if (!Number.isSafeInteger(parsed) || parsed < input.minimum) {
		input.issues.push(`${input.name}:out_of_range`);
		return input.defaultValue;
	}
	if (input.multipleOf && parsed % input.multipleOf !== 0) {
		input.issues.push(`${input.name}:must_be_multiple_of_${input.multipleOf}`);
		return input.defaultValue;
	}
	return parsed;
}

function validatePortalOrigin(value: string, appEnvironment: PortalEnvironment): string {
	let url: URL;

	try {
		url = new URL(value);
	} catch {
		throw new RuntimeConfigError(['PORTAL_PUBLIC_ORIGIN:invalid_url']);
	}

	const hostname = url.hostname.toLowerCase();
	const productionLike = appEnvironment === 'preview' || appEnvironment === 'production';
	const isOfficialSite =
		hostname === 'kolibri-dresden.de' || hostname.endsWith('.kolibri-dresden.de');

	if (value !== url.origin || url.username || url.password) {
		throw new RuntimeConfigError(['PORTAL_PUBLIC_ORIGIN:origin_only']);
	}

	if (isOfficialSite) {
		throw new RuntimeConfigError(['PORTAL_PUBLIC_ORIGIN:official_site_forbidden']);
	}

	if (productionLike && url.protocol !== 'https:') {
		throw new RuntimeConfigError(['PORTAL_PUBLIC_ORIGIN:https_required']);
	}

	if (
		productionLike &&
		(hostname === 'localhost' ||
			hostname.endsWith('.localhost') ||
			hostname.endsWith('.invalid') ||
			/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
			hostname.includes(':'))
	) {
		throw new RuntimeConfigError(['PORTAL_PUBLIC_ORIGIN:non_public_host']);
	}

	return url.origin;
}

export function loadRuntimeConfig(env: Partial<App.Platform['env']> | undefined): RuntimeConfig {
	const parsed = rawConfigSchema.safeParse(env ?? {});

	if (!parsed.success) {
		throw new RuntimeConfigError(
			parsed.error.issues.map(
				(issue) => `${issue.path.join('.') || 'environment'}:${issue.code}`
			)
		);
	}

	const issues: string[] = [];
	const productionLike =
		parsed.data.APP_ENV === 'preview' || parsed.data.APP_ENV === 'production';

	if (!isD1Database(env?.DB)) issues.push('DB:missing_or_invalid_binding');
	if (productionLike && !isR2Bucket(env?.R2_BUCKET))
		issues.push('R2_BUCKET:missing_or_invalid_binding');
	if (productionLike && !isFetcher(env?.ASSETS)) issues.push('ASSETS:missing_or_invalid_binding');
	if (productionLike && !isBrowserRun(env?.BROWSER))
		issues.push('BROWSER:missing_or_invalid_binding');
	if (productionLike && !parsed.data.JWT_SECRET) issues.push('JWT_SECRET:required');
	if (productionLike && isPlaceholder(parsed.data.JWT_SECRET))
		issues.push('JWT_SECRET:placeholder');
	if (productionLike && !parsed.data.TURNSTILE_SITE_KEY)
		issues.push('TURNSTILE_SITE_KEY:required');
	if (productionLike && isPlaceholder(parsed.data.TURNSTILE_SITE_KEY)) {
		issues.push('TURNSTILE_SITE_KEY:placeholder');
	}
	if (productionLike && !parsed.data.TURNSTILE_SECRET_KEY) {
		issues.push('TURNSTILE_SECRET_KEY:required');
	}
	if (productionLike && isPlaceholder(parsed.data.TURNSTILE_SECRET_KEY)) {
		issues.push('TURNSTILE_SECRET_KEY:placeholder');
	}

	const pricing: PricingRuntimeConfig = {
		individualPriceCentsPer45Min: parseIntegerConfig({
			name: 'INDIVIDUAL_PRICE_CENTS_PER_45_MIN',
			value: parsed.data.INDIVIDUAL_PRICE_CENTS_PER_45_MIN,
			defaultValue: 3000,
			minimum: 0,
			issues,
		}),
		groupDurationFallbackMinutes: parseIntegerConfig({
			name: 'GROUP_DURATION_FALLBACK_MINUTES',
			value: parsed.data.GROUP_DURATION_FALLBACK_MINUTES,
			defaultValue: 90,
			minimum: 45,
			multipleOf: 45,
			issues,
		}),
		missingDurationYearlyCentsPer45Min: parseIntegerConfig({
			name: 'MISSING_DURATION_YEARLY_CENTS_PER_45_MIN',
			value: parsed.data.MISSING_DURATION_YEARLY_CENTS_PER_45_MIN,
			defaultValue: 2300,
			minimum: 0,
			issues,
		}),
		missingDurationMonthlyCentsPer45Min: parseIntegerConfig({
			name: 'MISSING_DURATION_MONTHLY_CENTS_PER_45_MIN',
			value: parsed.data.MISSING_DURATION_MONTHLY_CENTS_PER_45_MIN,
			defaultValue: 3000,
			minimum: 0,
			issues,
		}),
		quoteTtlSeconds: parseIntegerConfig({
			name: 'PRICE_QUOTE_TTL_SECONDS',
			value: parsed.data.PRICE_QUOTE_TTL_SECONDS,
			defaultValue: 86_400,
			minimum: 1,
			issues,
		}),
	};

	if (issues.length > 0) throw new RuntimeConfigError(issues);

	return {
		appEnvironment: parsed.data.APP_ENV,
		portalPublicOrigin: validatePortalOrigin(
			parsed.data.PORTAL_PUBLIC_ORIGIN,
			parsed.data.APP_ENV
		),
		db: env?.DB as D1Database,
		r2Bucket: isR2Bucket(env?.R2_BUCKET) ? env.R2_BUCKET : undefined,
		assets: isFetcher(env?.ASSETS) ? env.ASSETS : undefined,
		browser: isBrowserRun(env?.BROWSER) ? env.BROWSER : undefined,
		jwtSecret: parsed.data.JWT_SECRET,
		turnstileSiteKey: parsed.data.TURNSTILE_SITE_KEY,
		turnstileSecretKey: parsed.data.TURNSTILE_SECRET_KEY,
		pricing,
	};
}

export function buildPortalUrl(
	config: Pick<RuntimeConfig, 'portalPublicOrigin'>,
	path: string
): URL {
	if (!path.startsWith('/') || path.startsWith('//')) {
		throw new RuntimeConfigError(['portal_path:absolute_or_external_forbidden']);
	}

	const url = new URL(path, config.portalPublicOrigin);
	if (url.origin !== config.portalPublicOrigin) {
		throw new RuntimeConfigError(['portal_path:origin_mismatch']);
	}

	return url;
}

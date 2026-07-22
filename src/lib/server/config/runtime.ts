import { z } from 'zod';
import { parseBusinessHours, type BusinessHoursSchedule } from '$lib/server/outbox/business-hours';

const rawConfigSchema = z.object({
	APP_ENV: z.enum(['development', 'test', 'preview', 'production']),
	PORTAL_PUBLIC_ORIGIN: z.string().min(1),
	JWT_SECRET: z.string().min(32).optional(),
	TURNSTILE_SITE_KEY: z.string().min(1).optional(),
	TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
	AUTH_PUBLIC_ENABLED: z.enum(['true', 'false']).optional(),
	EMAIL_PROVIDER: z.enum(['disabled', 'fake']).optional(),
	EMAIL_FROM: z.string().min(1).optional(),
	EMAIL_REPLY_TO: z.string().min(1).optional(),
	PRIVACY_NOTICE_VERSION: z.string().min(1).optional(),
	AUTH_VERIFICATION_TTL_SECONDS: z.string().optional(),
	AUTH_RESET_TTL_SECONDS: z.string().optional(),
	AUTH_EMAIL_CHANGE_TTL_SECONDS: z.string().optional(),
	AUTH_SESSION_TTL_SECONDS: z.string().optional(),
	AUTH_RESEND_COOLDOWN_SECONDS: z.string().optional(),
	AUTH_RATE_LIMIT_WINDOW_SECONDS: z.string().optional(),
	AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.string().optional(),
	AUTH_PASSWORD_MIN_LENGTH: z.string().optional(),
	AUTH_PASSWORD_MAX_LENGTH: z.string().optional(),
	EMAIL_MAX_ATTEMPTS: z.string().optional(),
	OUTBOX_LEASE_SECONDS: z.string().optional(),
	OUTBOX_RETRY_BASE_SECONDS: z.string().optional(),
	OUTBOX_RETRY_MAX_SECONDS: z.string().optional(),
	TELEGRAM_PROVIDER: z.enum(['disabled', 'fake']).optional(),
	TELEGRAM_MAX_ATTEMPTS: z.string().optional(),
	TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
	TELEGRAM_CHAT_ID: z.string().min(1).optional(),
	TELEGRAM_BUSINESS_TIMEZONE: z.string().min(1).optional(),
	TELEGRAM_BUSINESS_HOURS: z.string().min(1).optional(),
	INDIVIDUAL_PRICE_CENTS_PER_45_MIN: z.string().optional(),
	GROUP_DURATION_FALLBACK_MINUTES: z.string().optional(),
	MISSING_DURATION_YEARLY_CENTS_PER_45_MIN: z.string().optional(),
	MISSING_DURATION_MONTHLY_CENTS_PER_45_MIN: z.string().optional(),
	PRICE_QUOTE_TTL_SECONDS: z.string().optional(),
	DOCUMENT_UPLOAD_ENABLED: z.enum(['true', 'false']).optional(),
	DOCUMENT_MAX_FILE_BYTES: z.string().optional(),
	DOCUMENT_MAX_FILES_PER_AUTHORIZATION: z.string().optional(),
	DOCUMENT_MAX_AUTHORIZATION_BYTES: z.string().optional(),
	DOCUMENT_UPLOAD_RATE_LIMIT_WINDOW_SECONDS: z.string().optional(),
	DOCUMENT_UPLOAD_RATE_LIMIT_MAX_ATTEMPTS: z.string().optional(),
	DOCUMENT_AV_ATTESTATION_TEXT_VERSION: z.string().min(1).optional(),
	CONTRACT_SEND_ENABLED: z.enum(['true', 'false']).optional(),
	CONTRACT_RENDERER: z.enum(['disabled', 'synthetic_test', 'browser_run']).optional(),
	CONTRACT_PDF_MAX_HTML_BYTES: z.string().optional(),
	CONTRACT_PDF_MAX_BYTES: z.string().optional(),
	CONTRACT_MAX_RENDER_ATTEMPTS: z.string().optional(),
	BROWSER_RUN_DAILY_BUDGET_MS: z.string().optional(),
	MEDIA_ONLINE_GRANT_ENABLED: z.enum(['true', 'false']).optional(),
	PUBLIC_CONTRACT_FUNCTIONS_ENABLED: z.enum(['true', 'false']).optional(),
	PRIVACY_EXPORT_TTL_SECONDS: z.string().optional(),
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
	auth: AuthRuntimeConfig;
	pricing: PricingRuntimeConfig;
	documents: DocumentRuntimeConfig;
	contracts: ContractRuntimeConfig;
	messaging: MessagingRuntimeConfig;
	privacy: PrivacyRuntimeConfig;
}

export interface AuthRuntimeConfig {
	publicEnabled: boolean;
	emailProvider: 'disabled' | 'fake';
	privacyNoticeVersion?: string;
	verificationTtlSeconds: number;
	resetTtlSeconds: number;
	emailChangeTtlSeconds: number;
	sessionTtlSeconds: number;
	resendCooldownSeconds: number;
	rateLimitWindowSeconds: number;
	rateLimitMaxAttempts: number;
	passwordMinLength: number;
	passwordMaxLength: number;
	emailMaxAttempts: number;
}

export interface PricingRuntimeConfig {
	individualPriceCentsPer45Min: number;
	groupDurationFallbackMinutes: number;
	missingDurationYearlyCentsPer45Min: number;
	missingDurationMonthlyCentsPer45Min: number;
	quoteTtlSeconds: number;
}

export interface DocumentRuntimeConfig {
	uploadEnabled: boolean;
	maxFileBytes: number;
	maxFilesPerAuthorization: number;
	maxAuthorizationBytes: number;
	uploadRateLimitWindowSeconds: number;
	uploadRateLimitMaxAttempts: number;
	avAttestationTextVersion: string;
}

export interface ContractRuntimeConfig {
	sendEnabled: boolean;
	renderer: 'disabled' | 'synthetic_test' | 'browser_run';
	maxHtmlBytes: number;
	maxPdfBytes: number;
	maxRenderAttempts: number;
	browserDailyBudgetMs: number;
	mediaOnlineGrantEnabled: boolean;
	publicFunctionsEnabled: boolean;
}

export interface MessagingRuntimeConfig {
	emailProvider: 'disabled' | 'fake';
	telegramProvider: 'disabled' | 'fake';
	telegramChatId?: string;
	emailMaxAttempts: number;
	telegramMaxAttempts: number;
	leaseSeconds: number;
	retryBaseSeconds: number;
	retryMaxSeconds: number;
	telegramSchedule: BusinessHoursSchedule;
}

export interface PrivacyRuntimeConfig {
	exportTtlSeconds: number;
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
		typeof Reflect.get(value, 'put') === 'function' &&
		typeof Reflect.get(value, 'delete') === 'function'
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

	const authPublicEnabled = parsed.data.AUTH_PUBLIC_ENABLED === 'true';
	const documentUploadEnabled = parsed.data.DOCUMENT_UPLOAD_ENABLED === 'true';
	const contractSendEnabled = parsed.data.CONTRACT_SEND_ENABLED === 'true';
	const contractRenderer = parsed.data.CONTRACT_RENDERER ?? 'disabled';
	const mediaOnlineGrantEnabled = parsed.data.MEDIA_ONLINE_GRANT_ENABLED === 'true';
	const publicContractFunctionsEnabled =
		parsed.data.PUBLIC_CONTRACT_FUNCTIONS_ENABLED === 'true';
	const emailProvider = parsed.data.EMAIL_PROVIDER ?? 'disabled';
	const telegramProvider = parsed.data.TELEGRAM_PROVIDER ?? 'disabled';
	if (authPublicEnabled && !parsed.data.PRIVACY_NOTICE_VERSION) {
		issues.push('PRIVACY_NOTICE_VERSION:required_when_auth_enabled');
	}
	if (authPublicEnabled && isPlaceholder(parsed.data.PRIVACY_NOTICE_VERSION)) {
		issues.push('PRIVACY_NOTICE_VERSION:placeholder');
	}
	if (authPublicEnabled && emailProvider === 'disabled') {
		issues.push('EMAIL_PROVIDER:required_when_auth_enabled');
	}
	if (authPublicEnabled && !parsed.data.JWT_SECRET) {
		issues.push('JWT_SECRET:required_when_auth_enabled');
	}
	if (authPublicEnabled && isPlaceholder(parsed.data.JWT_SECRET)) {
		issues.push('JWT_SECRET:placeholder');
	}
	if (authPublicEnabled && parsed.data.APP_ENV !== 'test' && !parsed.data.TURNSTILE_SITE_KEY) {
		issues.push('TURNSTILE_SITE_KEY:required_when_auth_enabled');
	}
	if (authPublicEnabled && parsed.data.APP_ENV !== 'test' && !parsed.data.TURNSTILE_SECRET_KEY) {
		issues.push('TURNSTILE_SECRET_KEY:required_when_auth_enabled');
	}
	if (parsed.data.APP_ENV === 'production' && emailProvider === 'fake') {
		issues.push('EMAIL_PROVIDER:fake_forbidden_in_production');
	}
	if (parsed.data.APP_ENV === 'production' && authPublicEnabled) {
		issues.push('AUTH_PUBLIC_ENABLED:production_email_provider_not_implemented');
	}
	if (parsed.data.APP_ENV === 'production' && emailProvider !== 'disabled') {
		issues.push('EMAIL_PROVIDER:production_provider_not_implemented');
	}
	if (parsed.data.APP_ENV === 'production' && telegramProvider !== 'disabled') {
		issues.push('TELEGRAM_PROVIDER:production_provider_not_implemented');
	}
	if (telegramProvider !== 'disabled' && !parsed.data.TELEGRAM_CHAT_ID) {
		issues.push('TELEGRAM_CHAT_ID:required_when_provider_enabled');
	}
	if (documentUploadEnabled && !isR2Bucket(env?.R2_BUCKET)) {
		issues.push('R2_BUCKET:required_when_document_upload_enabled');
	}
	if (documentUploadEnabled && !parsed.data.JWT_SECRET) {
		issues.push('JWT_SECRET:required_when_document_upload_enabled');
	}
	if (documentUploadEnabled && isPlaceholder(parsed.data.JWT_SECRET)) {
		issues.push('JWT_SECRET:placeholder');
	}
	if (
		documentUploadEnabled &&
		isPlaceholder(parsed.data.DOCUMENT_AV_ATTESTATION_TEXT_VERSION)
	) {
		issues.push('DOCUMENT_AV_ATTESTATION_TEXT_VERSION:placeholder');
	}
	if (parsed.data.APP_ENV === 'production' && documentUploadEnabled) {
		issues.push('DOCUMENT_UPLOAD_ENABLED:production_operational_gate_not_released');
	}
	if (contractSendEnabled && contractRenderer === 'disabled') {
		issues.push('CONTRACT_RENDERER:required_when_send_enabled');
	}
	if (contractRenderer === 'synthetic_test' && parsed.data.APP_ENV !== 'test') {
		issues.push('CONTRACT_RENDERER:synthetic_test_only');
	}
	if (contractSendEnabled && !isR2Bucket(env?.R2_BUCKET)) {
		issues.push('R2_BUCKET:required_when_contract_send_enabled');
	}
	if (contractSendEnabled && contractRenderer === 'browser_run' && !isBrowserRun(env?.BROWSER)) {
		issues.push('BROWSER:required_when_contract_send_enabled');
	}
	if (parsed.data.APP_ENV === 'production' && contractSendEnabled) {
		issues.push('CONTRACT_SEND_ENABLED:production_legal_gates_not_released');
	}
	if (parsed.data.APP_ENV === 'production' && mediaOnlineGrantEnabled) {
		issues.push('MEDIA_ONLINE_GRANT_ENABLED:compliance_gate_not_released');
	}
	if (parsed.data.APP_ENV === 'production' && publicContractFunctionsEnabled) {
		issues.push('PUBLIC_CONTRACT_FUNCTIONS_ENABLED:legal_profile_not_released');
	}

	const auth: AuthRuntimeConfig = {
		publicEnabled: authPublicEnabled,
		emailProvider,
		privacyNoticeVersion: parsed.data.PRIVACY_NOTICE_VERSION,
		verificationTtlSeconds: parseIntegerConfig({
			name: 'AUTH_VERIFICATION_TTL_SECONDS',
			value: parsed.data.AUTH_VERIFICATION_TTL_SECONDS,
			defaultValue: 86_400,
			minimum: 60,
			issues,
		}),
		resetTtlSeconds: parseIntegerConfig({
			name: 'AUTH_RESET_TTL_SECONDS',
			value: parsed.data.AUTH_RESET_TTL_SECONDS,
			defaultValue: 3_600,
			minimum: 60,
			issues,
		}),
		emailChangeTtlSeconds: parseIntegerConfig({
			name: 'AUTH_EMAIL_CHANGE_TTL_SECONDS',
			value: parsed.data.AUTH_EMAIL_CHANGE_TTL_SECONDS,
			defaultValue: 86_400,
			minimum: 60,
			issues,
		}),
		sessionTtlSeconds: parseIntegerConfig({
			name: 'AUTH_SESSION_TTL_SECONDS',
			value: parsed.data.AUTH_SESSION_TTL_SECONDS,
			defaultValue: 604_800,
			minimum: 300,
			issues,
		}),
		resendCooldownSeconds: parseIntegerConfig({
			name: 'AUTH_RESEND_COOLDOWN_SECONDS',
			value: parsed.data.AUTH_RESEND_COOLDOWN_SECONDS,
			defaultValue: 60,
			minimum: 1,
			issues,
		}),
		rateLimitWindowSeconds: parseIntegerConfig({
			name: 'AUTH_RATE_LIMIT_WINDOW_SECONDS',
			value: parsed.data.AUTH_RATE_LIMIT_WINDOW_SECONDS,
			defaultValue: 60,
			minimum: 1,
			issues,
		}),
		rateLimitMaxAttempts: parseIntegerConfig({
			name: 'AUTH_RATE_LIMIT_MAX_ATTEMPTS',
			value: parsed.data.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
			defaultValue: 5,
			minimum: 1,
			issues,
		}),
		passwordMinLength: parseIntegerConfig({
			name: 'AUTH_PASSWORD_MIN_LENGTH',
			value: parsed.data.AUTH_PASSWORD_MIN_LENGTH,
			defaultValue: 12,
			minimum: 8,
			issues,
		}),
		passwordMaxLength: parseIntegerConfig({
			name: 'AUTH_PASSWORD_MAX_LENGTH',
			value: parsed.data.AUTH_PASSWORD_MAX_LENGTH,
			defaultValue: 128,
			minimum: 32,
			issues,
		}),
		emailMaxAttempts: parseIntegerConfig({
			name: 'EMAIL_MAX_ATTEMPTS',
			value: parsed.data.EMAIL_MAX_ATTEMPTS,
			defaultValue: 5,
			minimum: 1,
			issues,
		}),
	};
	if (auth.passwordMinLength > auth.passwordMaxLength) {
		issues.push('AUTH_PASSWORD_LENGTH:min_exceeds_max');
	}

	let telegramSchedule: BusinessHoursSchedule;
	try {
		telegramSchedule = parseBusinessHours(
			parsed.data.TELEGRAM_BUSINESS_TIMEZONE ?? 'Europe/Berlin',
			parsed.data.TELEGRAM_BUSINESS_HOURS ?? 'Mo-Fr 09:00-17:00'
		);
	} catch {
		issues.push('TELEGRAM_BUSINESS_HOURS:invalid');
		telegramSchedule = parseBusinessHours('Europe/Berlin', 'Mo-Fr 09:00-17:00');
	}
	const messaging: MessagingRuntimeConfig = {
		emailProvider,
		telegramProvider,
		telegramChatId: parsed.data.TELEGRAM_CHAT_ID,
		emailMaxAttempts: auth.emailMaxAttempts,
		telegramMaxAttempts: parseIntegerConfig({
			name: 'TELEGRAM_MAX_ATTEMPTS',
			value: parsed.data.TELEGRAM_MAX_ATTEMPTS,
			defaultValue: 5,
			minimum: 1,
			issues,
		}),
		leaseSeconds: parseIntegerConfig({
			name: 'OUTBOX_LEASE_SECONDS',
			value: parsed.data.OUTBOX_LEASE_SECONDS,
			defaultValue: 60,
			minimum: 5,
			issues,
		}),
		retryBaseSeconds: parseIntegerConfig({
			name: 'OUTBOX_RETRY_BASE_SECONDS',
			value: parsed.data.OUTBOX_RETRY_BASE_SECONDS,
			defaultValue: 60,
			minimum: 1,
			issues,
		}),
		retryMaxSeconds: parseIntegerConfig({
			name: 'OUTBOX_RETRY_MAX_SECONDS',
			value: parsed.data.OUTBOX_RETRY_MAX_SECONDS,
			defaultValue: 3600,
			minimum: 1,
			issues,
		}),
		telegramSchedule,
	};
	if (messaging.retryBaseSeconds > messaging.retryMaxSeconds) {
		issues.push('OUTBOX_RETRY:base_exceeds_max');
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

	const documents: DocumentRuntimeConfig = {
		uploadEnabled: documentUploadEnabled,
		maxFileBytes: parseIntegerConfig({
			name: 'DOCUMENT_MAX_FILE_BYTES',
			value: parsed.data.DOCUMENT_MAX_FILE_BYTES,
			defaultValue: 10 * 1024 * 1024,
			minimum: 1,
			issues,
		}),
		maxFilesPerAuthorization: parseIntegerConfig({
			name: 'DOCUMENT_MAX_FILES_PER_AUTHORIZATION',
			value: parsed.data.DOCUMENT_MAX_FILES_PER_AUTHORIZATION,
			defaultValue: 5,
			minimum: 1,
			issues,
		}),
		maxAuthorizationBytes: parseIntegerConfig({
			name: 'DOCUMENT_MAX_AUTHORIZATION_BYTES',
			value: parsed.data.DOCUMENT_MAX_AUTHORIZATION_BYTES,
			defaultValue: 25 * 1024 * 1024,
			minimum: 1,
			issues,
		}),
		uploadRateLimitWindowSeconds: parseIntegerConfig({
			name: 'DOCUMENT_UPLOAD_RATE_LIMIT_WINDOW_SECONDS',
			value: parsed.data.DOCUMENT_UPLOAD_RATE_LIMIT_WINDOW_SECONDS,
			defaultValue: 60,
			minimum: 1,
			issues,
		}),
		uploadRateLimitMaxAttempts: parseIntegerConfig({
			name: 'DOCUMENT_UPLOAD_RATE_LIMIT_MAX_ATTEMPTS',
			value: parsed.data.DOCUMENT_UPLOAD_RATE_LIMIT_MAX_ATTEMPTS,
			defaultValue: 5,
			minimum: 1,
			issues,
		}),
		avAttestationTextVersion:
			parsed.data.DOCUMENT_AV_ATTESTATION_TEXT_VERSION ?? 'manual-local-av-v1',
	};
	if (documents.maxFileBytes > 10 * 1024 * 1024) {
		issues.push('DOCUMENT_MAX_FILE_BYTES:risk_ceiling_exceeded');
	}
	if (documents.maxFilesPerAuthorization > 5) {
		issues.push('DOCUMENT_MAX_FILES_PER_AUTHORIZATION:risk_ceiling_exceeded');
	}
	if (documents.maxAuthorizationBytes > 25 * 1024 * 1024) {
		issues.push('DOCUMENT_MAX_AUTHORIZATION_BYTES:risk_ceiling_exceeded');
	}

	const contracts: ContractRuntimeConfig = {
		sendEnabled: contractSendEnabled,
		renderer: contractRenderer,
		maxHtmlBytes: parseIntegerConfig({
			name: 'CONTRACT_PDF_MAX_HTML_BYTES',
			value: parsed.data.CONTRACT_PDF_MAX_HTML_BYTES,
			defaultValue: 2 * 1024 * 1024,
			minimum: 1,
			issues,
		}),
		maxPdfBytes: parseIntegerConfig({
			name: 'CONTRACT_PDF_MAX_BYTES',
			value: parsed.data.CONTRACT_PDF_MAX_BYTES,
			defaultValue: 10 * 1024 * 1024,
			minimum: 1,
			issues,
		}),
		maxRenderAttempts: parseIntegerConfig({
			name: 'CONTRACT_MAX_RENDER_ATTEMPTS',
			value: parsed.data.CONTRACT_MAX_RENDER_ATTEMPTS,
			defaultValue: 3,
			minimum: 1,
			issues,
		}),
		browserDailyBudgetMs: parseIntegerConfig({
			name: 'BROWSER_RUN_DAILY_BUDGET_MS',
			value: parsed.data.BROWSER_RUN_DAILY_BUDGET_MS,
			defaultValue: 60_000,
			minimum: 1,
			issues,
		}),
		mediaOnlineGrantEnabled,
		publicFunctionsEnabled: publicContractFunctionsEnabled,
	};
	if (contracts.maxHtmlBytes > 2 * 1024 * 1024) {
		issues.push('CONTRACT_PDF_MAX_HTML_BYTES:risk_ceiling_exceeded');
	}
	if (contracts.maxPdfBytes > 10 * 1024 * 1024) {
		issues.push('CONTRACT_PDF_MAX_BYTES:risk_ceiling_exceeded');
	}
	if (contracts.maxRenderAttempts > 3) {
		issues.push('CONTRACT_MAX_RENDER_ATTEMPTS:risk_ceiling_exceeded');
	}

	const privacy: PrivacyRuntimeConfig = {
		exportTtlSeconds: parseIntegerConfig({
			name: 'PRIVACY_EXPORT_TTL_SECONDS',
			value: parsed.data.PRIVACY_EXPORT_TTL_SECONDS,
			defaultValue: 3_600,
			minimum: 300,
			issues,
		}),
	};
	if (privacy.exportTtlSeconds > 86_400) {
		issues.push('PRIVACY_EXPORT_TTL_SECONDS:risk_ceiling_exceeded');
	}

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
		auth,
		pricing,
		documents,
		contracts,
		messaging,
		privacy,
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

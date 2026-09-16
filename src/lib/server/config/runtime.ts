import { z } from 'zod';
import { ORGANIZATION_NAME } from '$lib/organization';
import { parseBusinessHours, type BusinessHoursSchedule } from '$lib/server/outbox/business-hours';
import {
	isTelegramBotToken,
	isTelegramChatId,
	TELEGRAM_BOT_API_MAX_TIMEOUT_MS,
	TELEGRAM_BOT_API_MIN_TIMEOUT_MS,
	TELEGRAM_BOT_API_TIMEOUT_MS,
	type TelegramBureauChatType,
} from '$lib/server/telegram/bot-api';

const rawConfigSchema = z.object({
	APP_ENV: z.enum(['development', 'test', 'preview', 'production']),
	PORTAL_MODE: z.enum(['full', 'trial_intake']).optional(),
	TRIAL_INTAKE_ACCEPTING: z.enum(['true', 'false']).optional(),
	TRIAL_INTAKE_SCHEDULE_URL: z.string().optional(),
	PORTAL_PUBLIC_ORIGIN: z.string().min(1),
	OFFICIAL_PRIVACY_URL: z.string().min(1).optional(),
	OFFICIAL_IMPRINT_URL: z.string().min(1).optional(),
	OFFICIAL_CONTACT_URL: z.string().min(1).optional(),
	OFFICIAL_LINKS_VERSION: z.string().min(1).optional(),
	JWT_SECRET: z.string().min(32).optional(),
	TURNSTILE_SITE_KEY: z.string().min(1).optional(),
	TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
	TURNSTILE_HOSTNAMES: z.string().min(1).optional(),
	AUTH_PUBLIC_ENABLED: z.enum(['true', 'false']).optional(),
	EMAIL_PROVIDER: z.enum(['disabled', 'fake', 'resend']).optional(),
	EMAIL_FROM: z.string().min(1).optional(),
	EMAIL_REPLY_TO: z.string().min(1).optional(),
	RESEND_API_KEY: z.string().min(20).optional(),
	PREVIEW_EMAIL_RECIPIENT_HASHES: z.string().min(1).optional(),
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
	TELEGRAM_PROVIDER: z.enum(['disabled', 'fake', 'bot_api']).optional(),
	TELEGRAM_MAX_ATTEMPTS: z.string().optional(),
	TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
	TELEGRAM_CHAT_ID: z.string().min(1).optional(),
	TELEGRAM_CHAT_TYPE: z.enum(['group', 'supergroup', 'channel']).optional(),
	TELEGRAM_BOT_API_TIMEOUT_MS: z.string().optional(),
	TELEGRAM_ACTIVATION_AT: z.string().optional(),
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
	CONTRACT_PREVIEW_REVIEW_ENABLED: z.enum(['true', 'false']).optional(),
	CONTRACT_RENDERER: z.enum(['disabled', 'synthetic_test', 'browser_run']).optional(),
	CONTRACT_PDF_MAX_HTML_BYTES: z.string().optional(),
	CONTRACT_PDF_MAX_BYTES: z.string().optional(),
	CONTRACT_MAX_RENDER_ATTEMPTS: z.string().optional(),
	BROWSER_RUN_DAILY_BUDGET_MS: z.string().optional(),
	MEDIA_ONLINE_GRANT_ENABLED: z.enum(['true', 'false']).optional(),
	PUBLIC_CONTRACT_FUNCTIONS_ENABLED: z.enum(['true', 'false']).optional(),
	PRIVACY_EXPORT_TTL_SECONDS: z.string().optional(),
	SCHEDULED_JOBS_ENABLED: z.enum(['true', 'false']).optional(),
	SCHEDULED_OUTBOX_BATCH_LIMIT: z.string().optional(),
	SCHEDULED_MAINTENANCE_BATCH_LIMIT: z.string().optional(),
	SCHEDULED_LEASE_SECONDS: z.string().optional(),
});

export type PortalEnvironment = z.infer<typeof rawConfigSchema>['APP_ENV'];
export type EmailProviderKind = 'disabled' | 'fake' | 'resend';
export type TelegramProviderKind = 'disabled' | 'fake' | 'bot_api';

export const APPROVED_EMAIL_FROM =
	'Kinder- und Elternzentrum Kolibri e.V. <registration@kolibri-dresden.de>';
export const APPROVED_EMAIL_REPLY_TO = 'registration@kolibri-dresden.de';
export const INTAKE_EMAIL_FROM = `${ORGANIZATION_NAME} <${APPROVED_EMAIL_REPLY_TO}>`;

export interface RuntimeConfig {
	portalMode?: 'full' | 'trial_intake';
	trialIntake?: { accepting: boolean; scheduleUrl: string };
	appEnvironment: PortalEnvironment;
	portalPublicOrigin: string;
	db: D1Database;
	r2ArchiveBucket?: R2Bucket;
	r2QuarantineBucket?: R2Bucket;
	assets?: Fetcher;
	browser?: BrowserRun;
	jwtSecret?: string;
	turnstileSiteKey?: string;
	turnstileSecretKey?: string;
	turnstileHostnames: readonly string[];
	auth: AuthRuntimeConfig;
	pricing: PricingRuntimeConfig;
	documents: DocumentRuntimeConfig;
	contracts: ContractRuntimeConfig;
	messaging: MessagingRuntimeConfig;
	privacy: PrivacyRuntimeConfig;
	operations: OperationsRuntimeConfig;
	officialLinks?: OfficialLinksRuntimeConfig;
}

export interface AuthRuntimeConfig {
	publicEnabled: boolean;
	emailProvider: EmailProviderKind;
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
	previewReviewEnabled: boolean;
	renderer: 'disabled' | 'synthetic_test' | 'browser_run';
	maxHtmlBytes: number;
	maxPdfBytes: number;
	maxRenderAttempts: number;
	browserDailyBudgetMs: number;
	mediaOnlineGrantEnabled: boolean;
	publicFunctionsEnabled: boolean;
}

export interface MessagingRuntimeConfig {
	emailProvider: EmailProviderKind;
	emailFrom?: string;
	emailReplyTo?: string;
	resendApiKey?: string;
	previewEmailRecipientHashes: readonly string[];
	telegramProvider: TelegramProviderKind;
	telegramBotToken?: string;
	telegramChatId?: string;
	telegramChatType?: TelegramBureauChatType;
	telegramBotApiTimeoutMs: number;
	telegramActivationAt?: string;
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

export interface OperationsRuntimeConfig {
	scheduledJobsEnabled: boolean;
	outboxBatchLimit: number;
	maintenanceBatchLimit: number;
	leaseSeconds: number;
}

export interface OfficialLinksRuntimeConfig {
	privacyUrl: string;
	imprintUrl: string;
	contactUrl: string;
	version: string;
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

function parseTurnstileHostnames(value: string | undefined, issues: string[]): string[] {
	if (!value) return [];

	const hostnames = new Set<string>();
	for (const rawHostname of value.split(',')) {
		const hostname = rawHostname.trim().toLowerCase();
		if (!hostname) continue;

		try {
			const url = new URL(`https://${hostname}`);
			if (
				url.hostname !== hostname ||
				url.origin !== `https://${hostname}` ||
				url.pathname !== '/' ||
				url.username ||
				url.password ||
				url.port ||
				hostname.endsWith('.')
			) {
				throw new Error('invalid hostname');
			}
		} catch {
			issues.push('TURNSTILE_HOSTNAMES:invalid_hostname');
			continue;
		}

		hostnames.add(hostname);
	}

	return [...hostnames];
}

function parsePreviewRecipientHashes(value: string | undefined, issues: string[]): string[] {
	// An exact wildcard explicitly opts the protected preview into unrestricted recipients.
	if (!value || value === '*') return [];
	const hashes = value.split(',').map((entry) => entry.trim().toLowerCase());
	if (
		hashes.length > 5 ||
		hashes.some((hash) => !/^[0-9a-f]{64}$/u.test(hash)) ||
		new Set(hashes).size !== hashes.length
	) {
		issues.push('PREVIEW_EMAIL_RECIPIENT_HASHES:invalid_sha256_allowlist');
		return [];
	}
	return hashes;
}

function validateOfficialUrl(
	name: string,
	value: string | undefined,
	issues: string[]
): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		const hostname = url.hostname.toLowerCase();
		if (
			url.protocol !== 'https:' ||
			url.username ||
			url.password ||
			url.hash ||
			!(hostname === 'kolibri-dresden.de' || hostname.endsWith('.kolibri-dresden.de')) ||
			/(?:^|\/)(?:replace|example|change-me)/i.test(url.pathname)
		) {
			issues.push(`${name}:official_https_url_required`);
			return null;
		}
		return url.toString();
	} catch {
		issues.push(`${name}:invalid_url`);
		return null;
	}
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
	const intakeMode = parsed.data.PORTAL_MODE === 'trial_intake';
	const intakeAccepting = intakeMode && parsed.data.TRIAL_INTAKE_ACCEPTING === 'true';
	const scheduleUrl = parsed.data.TRIAL_INTAKE_SCHEDULE_URL ?? '';
	if (intakeMode) {
		try {
			const url = new URL(scheduleUrl);
			if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error();
		} catch { issues.push('TRIAL_INTAKE_SCHEDULE_URL:https_url_required'); }
		if (parsed.data.AUTH_PUBLIC_ENABLED !== 'true') issues.push('AUTH_PUBLIC_ENABLED:required_for_intake_admin');
		if (!parsed.data.JWT_SECRET) issues.push('JWT_SECRET:required_for_intake');
	}
	const productionLike =
		parsed.data.APP_ENV === 'preview' || parsed.data.APP_ENV === 'production';
	const portalPublicOrigin = validatePortalOrigin(
		parsed.data.PORTAL_PUBLIC_ORIGIN,
		parsed.data.APP_ENV
	);
	const portalHostname = new URL(portalPublicOrigin).hostname.toLowerCase();
	const turnstileHostnames = parseTurnstileHostnames(parsed.data.TURNSTILE_HOSTNAMES, issues);

	if (!isD1Database(env?.DB)) issues.push('DB:missing_or_invalid_binding');
	if (productionLike && !intakeMode && !isR2Bucket(env?.R2_ARCHIVE))
		issues.push('R2_ARCHIVE:missing_or_invalid_binding');
	if (productionLike && !intakeMode && !isR2Bucket(env?.R2_QUARANTINE))
		issues.push('R2_QUARANTINE:missing_or_invalid_binding');
	if (
		isR2Bucket(env?.R2_ARCHIVE) &&
		isR2Bucket(env?.R2_QUARANTINE) &&
		env.R2_ARCHIVE === env.R2_QUARANTINE
	) {
		issues.push('R2_BINDINGS:must_be_distinct');
	}
	if (productionLike && !isFetcher(env?.ASSETS)) issues.push('ASSETS:missing_or_invalid_binding');
	if (productionLike && !intakeMode && !isBrowserRun(env?.BROWSER))
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
	if (productionLike && turnstileHostnames.length === 0) {
		issues.push('TURNSTILE_HOSTNAMES:required');
	}
	if (productionLike && !turnstileHostnames.includes(portalHostname)) {
		issues.push('TURNSTILE_HOSTNAMES:portal_hostname_required');
	}
	if (
		parsed.data.APP_ENV === 'production' &&
		turnstileHostnames.some(
			(hostname) =>
				hostname === 'localhost' ||
				hostname.endsWith('.localhost') ||
				hostname === '127.0.0.1' ||
				hostname === '::1'
		)
	) {
		issues.push('TURNSTILE_HOSTNAMES:local_hostname_forbidden_in_production');
	}

	const authPublicEnabled = parsed.data.AUTH_PUBLIC_ENABLED === 'true';
	const documentUploadEnabled = parsed.data.DOCUMENT_UPLOAD_ENABLED === 'true';
	const contractSendEnabled = parsed.data.CONTRACT_SEND_ENABLED === 'true';
	const contractPreviewReviewEnabled = parsed.data.CONTRACT_PREVIEW_REVIEW_ENABLED === 'true';
	const contractRenderer = parsed.data.CONTRACT_RENDERER ?? 'disabled';
	const mediaOnlineGrantEnabled = parsed.data.MEDIA_ONLINE_GRANT_ENABLED === 'true';
	const publicContractFunctionsEnabled = parsed.data.PUBLIC_CONTRACT_FUNCTIONS_ENABLED === 'true';
	const emailProvider = parsed.data.EMAIL_PROVIDER ?? 'disabled';
	const previewEmailRecipientHashes = parsePreviewRecipientHashes(
		parsed.data.PREVIEW_EMAIL_RECIPIENT_HASHES,
		issues
	);
	const telegramProvider = parsed.data.TELEGRAM_PROVIDER ?? 'disabled';
	const officialPrivacyUrl = validateOfficialUrl(
		'OFFICIAL_PRIVACY_URL',
		parsed.data.OFFICIAL_PRIVACY_URL,
		issues
	);
	const officialImprintUrl = validateOfficialUrl(
		'OFFICIAL_IMPRINT_URL',
		parsed.data.OFFICIAL_IMPRINT_URL,
		issues
	);
	const officialContactUrl = validateOfficialUrl(
		'OFFICIAL_CONTACT_URL',
		parsed.data.OFFICIAL_CONTACT_URL,
		issues
	);
	const officialLinksComplete = Boolean(
		officialPrivacyUrl &&
		officialImprintUrl &&
		officialContactUrl &&
		parsed.data.OFFICIAL_LINKS_VERSION
	);
	const officialLinksPartiallyConfigured = Boolean(
		parsed.data.OFFICIAL_PRIVACY_URL ||
		parsed.data.OFFICIAL_IMPRINT_URL ||
		parsed.data.OFFICIAL_CONTACT_URL ||
		parsed.data.OFFICIAL_LINKS_VERSION
	);
	if ((productionLike || officialLinksPartiallyConfigured) && !officialLinksComplete) {
		issues.push('OFFICIAL_LINKS:complete_approved_snapshot_required');
	}
	if (officialLinksComplete && isPlaceholder(parsed.data.OFFICIAL_LINKS_VERSION)) {
		issues.push('OFFICIAL_LINKS_VERSION:placeholder');
	}
	if (authPublicEnabled && !parsed.data.PRIVACY_NOTICE_VERSION) {
		issues.push('PRIVACY_NOTICE_VERSION:required_when_auth_enabled');
	}
	if (authPublicEnabled && isPlaceholder(parsed.data.PRIVACY_NOTICE_VERSION)) {
		issues.push('PRIVACY_NOTICE_VERSION:placeholder');
	}
	if (authPublicEnabled && emailProvider === 'disabled') {
		issues.push('EMAIL_PROVIDER:required_when_auth_enabled');
	}
	if (emailProvider === 'resend' && !parsed.data.RESEND_API_KEY) {
		issues.push('RESEND_API_KEY:required_when_provider_enabled');
	}
	if (emailProvider === 'resend' && isPlaceholder(parsed.data.RESEND_API_KEY)) {
		issues.push('RESEND_API_KEY:placeholder');
	}
	if (emailProvider === 'resend' && parsed.data.EMAIL_FROM !== APPROVED_EMAIL_FROM
		&& !(intakeMode && parsed.data.EMAIL_FROM === INTAKE_EMAIL_FROM)) {
		issues.push('EMAIL_FROM:approved_registration_identity_required');
	}
	if (emailProvider === 'resend' && parsed.data.EMAIL_REPLY_TO !== APPROVED_EMAIL_REPLY_TO) {
		issues.push('EMAIL_REPLY_TO:approved_registration_mailbox_required');
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
	if (authPublicEnabled && parsed.data.APP_ENV !== 'test' && turnstileHostnames.length === 0) {
		issues.push('TURNSTILE_HOSTNAMES:required_when_auth_enabled');
	}
	if (parsed.data.APP_ENV === 'production' && emailProvider === 'fake') {
		issues.push('EMAIL_PROVIDER:fake_forbidden_in_production');
	}
	if (
		parsed.data.APP_ENV === 'preview' &&
		emailProvider === 'resend' &&
		previewEmailRecipientHashes.length === 0 &&
		parsed.data.PREVIEW_EMAIL_RECIPIENT_HASHES !== '*'
	) {
		issues.push('PREVIEW_EMAIL_RECIPIENT_HASHES:required_for_preview_resend');
	}
	if (
		parsed.data.APP_ENV !== 'preview' &&
		parsed.data.PREVIEW_EMAIL_RECIPIENT_HASHES !== undefined
	) {
		issues.push('PREVIEW_EMAIL_RECIPIENT_HASHES:preview_only');
	}
	if (parsed.data.APP_ENV === 'production' && telegramProvider === 'fake') {
		issues.push('TELEGRAM_PROVIDER:fake_forbidden_in_production');
	}
	if (telegramProvider !== 'disabled' && !parsed.data.TELEGRAM_CHAT_ID) {
		issues.push('TELEGRAM_CHAT_ID:required_when_provider_enabled');
	}
	if (telegramProvider === 'bot_api') {
		if (!parsed.data.TELEGRAM_BOT_TOKEN) {
			issues.push('TELEGRAM_BOT_TOKEN:required_when_provider_enabled');
		} else if (isPlaceholder(parsed.data.TELEGRAM_BOT_TOKEN)) {
			issues.push('TELEGRAM_BOT_TOKEN:placeholder');
		} else if (!isTelegramBotToken(parsed.data.TELEGRAM_BOT_TOKEN)) {
			issues.push('TELEGRAM_BOT_TOKEN:invalid_format');
		}
		if (parsed.data.TELEGRAM_CHAT_ID && !isTelegramChatId(parsed.data.TELEGRAM_CHAT_ID)) {
			issues.push('TELEGRAM_CHAT_ID:signed_decimal_required');
		}
		if (!parsed.data.TELEGRAM_CHAT_TYPE) {
			issues.push('TELEGRAM_CHAT_TYPE:required_when_provider_enabled');
		}
		if (!parsed.data.TELEGRAM_ACTIVATION_AT) {
			issues.push('TELEGRAM_ACTIVATION_AT:required_when_provider_enabled');
		} else if (
			!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
				parsed.data.TELEGRAM_ACTIVATION_AT
			) ||
			Number.isNaN(Date.parse(parsed.data.TELEGRAM_ACTIVATION_AT)) ||
			new Date(parsed.data.TELEGRAM_ACTIVATION_AT).toISOString() !==
				parsed.data.TELEGRAM_ACTIVATION_AT
		) {
			issues.push('TELEGRAM_ACTIVATION_AT:canonical_utc_required');
		}
	}
	if (documentUploadEnabled && !isR2Bucket(env?.R2_QUARANTINE)) {
		issues.push('R2_QUARANTINE:required_when_document_upload_enabled');
	}
	if (documentUploadEnabled && !isR2Bucket(env?.R2_ARCHIVE)) {
		issues.push('R2_ARCHIVE:required_when_document_upload_enabled');
	}
	if (documentUploadEnabled && !parsed.data.JWT_SECRET) {
		issues.push('JWT_SECRET:required_when_document_upload_enabled');
	}
	if (documentUploadEnabled && isPlaceholder(parsed.data.JWT_SECRET)) {
		issues.push('JWT_SECRET:placeholder');
	}
	if (documentUploadEnabled && isPlaceholder(parsed.data.DOCUMENT_AV_ATTESTATION_TEXT_VERSION)) {
		issues.push('DOCUMENT_AV_ATTESTATION_TEXT_VERSION:placeholder');
	}
	if (parsed.data.APP_ENV === 'production' && documentUploadEnabled) {
		issues.push('DOCUMENT_UPLOAD_ENABLED:production_operational_gate_not_released');
	}
	if (contractSendEnabled && contractRenderer === 'disabled') {
		issues.push('CONTRACT_RENDERER:required_when_send_enabled');
	}
	if (contractPreviewReviewEnabled && parsed.data.APP_ENV !== 'preview') {
		issues.push('CONTRACT_PREVIEW_REVIEW_ENABLED:preview_only');
	}
	if (
		contractPreviewReviewEnabled &&
		(!contractSendEnabled || contractRenderer !== 'browser_run')
	) {
		issues.push('CONTRACT_PREVIEW_REVIEW_ENABLED:browser_send_required');
	}
	if (contractPreviewReviewEnabled && emailProvider !== 'resend') {
		issues.push('CONTRACT_PREVIEW_REVIEW_ENABLED:resend_required');
	}
	if (parsed.data.APP_ENV === 'preview' && contractSendEnabled && !contractPreviewReviewEnabled) {
		issues.push('CONTRACT_SEND_ENABLED:preview_review_gate_required');
	}
	if (contractRenderer === 'synthetic_test' && parsed.data.APP_ENV !== 'test') {
		issues.push('CONTRACT_RENDERER:synthetic_test_only');
	}
	if (contractSendEnabled && !isR2Bucket(env?.R2_ARCHIVE)) {
		issues.push('R2_ARCHIVE:required_when_contract_send_enabled');
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
	const telegramBotApiTimeoutMs = parseIntegerConfig({
		name: 'TELEGRAM_BOT_API_TIMEOUT_MS',
		value: parsed.data.TELEGRAM_BOT_API_TIMEOUT_MS,
		defaultValue: TELEGRAM_BOT_API_TIMEOUT_MS,
		minimum: TELEGRAM_BOT_API_MIN_TIMEOUT_MS,
		issues,
	});
	if (telegramBotApiTimeoutMs > TELEGRAM_BOT_API_MAX_TIMEOUT_MS) {
		issues.push('TELEGRAM_BOT_API_TIMEOUT_MS:risk_ceiling_exceeded');
	}
	const messaging: MessagingRuntimeConfig = {
		emailProvider,
		emailFrom: intakeMode ? INTAKE_EMAIL_FROM : parsed.data.EMAIL_FROM,
		emailReplyTo: parsed.data.EMAIL_REPLY_TO,
		resendApiKey: parsed.data.RESEND_API_KEY,
		previewEmailRecipientHashes,
		telegramProvider,
		telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
		telegramChatId: parsed.data.TELEGRAM_CHAT_ID,
		telegramChatType: parsed.data.TELEGRAM_CHAT_TYPE,
		telegramBotApiTimeoutMs,
		telegramActivationAt: parsed.data.TELEGRAM_ACTIVATION_AT,
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
	if (
		telegramProvider === 'bot_api' &&
		messaging.telegramBotApiTimeoutMs >= messaging.leaseSeconds * 1_000
	) {
		issues.push('TELEGRAM_BOT_API_TIMEOUT_MS:must_be_less_than_outbox_lease');
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
		previewReviewEnabled: contractPreviewReviewEnabled,
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

	const operations: OperationsRuntimeConfig = {
		scheduledJobsEnabled: parsed.data.SCHEDULED_JOBS_ENABLED === 'true',
		outboxBatchLimit: parseIntegerConfig({
			name: 'SCHEDULED_OUTBOX_BATCH_LIMIT',
			value: parsed.data.SCHEDULED_OUTBOX_BATCH_LIMIT,
			defaultValue: 25,
			minimum: 1,
			issues,
		}),
		maintenanceBatchLimit: parseIntegerConfig({
			name: 'SCHEDULED_MAINTENANCE_BATCH_LIMIT',
			value: parsed.data.SCHEDULED_MAINTENANCE_BATCH_LIMIT,
			defaultValue: 50,
			minimum: 1,
			issues,
		}),
		leaseSeconds: parseIntegerConfig({
			name: 'SCHEDULED_LEASE_SECONDS',
			value: parsed.data.SCHEDULED_LEASE_SECONDS,
			defaultValue: 300,
			minimum: 30,
			issues,
		}),
	};
	if (operations.outboxBatchLimit > 100)
		issues.push('SCHEDULED_OUTBOX_BATCH_LIMIT:risk_ceiling_exceeded');
	if (operations.maintenanceBatchLimit > 100)
		issues.push('SCHEDULED_MAINTENANCE_BATCH_LIMIT:risk_ceiling_exceeded');
	if (operations.leaseSeconds > 3_600)
		issues.push('SCHEDULED_LEASE_SECONDS:risk_ceiling_exceeded');
	// Supervised preview dispatch pauses Cron while keeping the ordinary UI usable.
	// Existing contract/provider validation still applies; production cannot opt in.
	const supervisedContractPreviewPause =
		parsed.data.APP_ENV === 'preview' &&
		parsed.data.SCHEDULED_JOBS_ENABLED === 'false' &&
		contractPreviewReviewEnabled &&
		contractSendEnabled &&
		contractRenderer === 'browser_run' &&
		operations.outboxBatchLimit === 1;
	if (
		productionLike &&
		operations.scheduledJobsEnabled === false &&
		!intakeMode &&
		!supervisedContractPreviewPause
	) {
		issues.push('SCHEDULED_JOBS_ENABLED:required');
	}

	if (intakeAccepting && productionLike && (emailProvider !== 'resend' || telegramProvider !== 'bot_api')) {
		issues.push('TRIAL_INTAKE_ACCEPTING:real_providers_required');
	}
	if (issues.length > 0) throw new RuntimeConfigError(issues);

	return {
		appEnvironment: parsed.data.APP_ENV,
		portalMode: parsed.data.PORTAL_MODE ?? 'full',
		trialIntake: intakeMode ? { accepting: intakeAccepting, scheduleUrl } : undefined,
		portalPublicOrigin,
		db: env?.DB as D1Database,
		r2ArchiveBucket: isR2Bucket(env?.R2_ARCHIVE) ? env.R2_ARCHIVE : undefined,
		r2QuarantineBucket: isR2Bucket(env?.R2_QUARANTINE) ? env.R2_QUARANTINE : undefined,
		assets: isFetcher(env?.ASSETS) ? env.ASSETS : undefined,
		browser: isBrowserRun(env?.BROWSER) ? env.BROWSER : undefined,
		jwtSecret: parsed.data.JWT_SECRET,
		turnstileSiteKey: parsed.data.TURNSTILE_SITE_KEY,
		turnstileSecretKey: parsed.data.TURNSTILE_SECRET_KEY,
		turnstileHostnames,
		auth,
		pricing,
		documents,
		contracts,
		messaging,
		privacy,
		operations,
		officialLinks: officialLinksComplete
			? {
					privacyUrl: officialPrivacyUrl!,
					imprintUrl: officialImprintUrl!,
					contactUrl: officialContactUrl!,
					version: parsed.data.OFFICIAL_LINKS_VERSION!,
				}
			: undefined,
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

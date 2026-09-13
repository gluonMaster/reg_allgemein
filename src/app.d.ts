/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		interface Error {
			locale?: import('$lib/i18n/locale').UiLocale;
			code: string;
			message: string;
			requestId: string;
		}

		interface Platform {
			env: {
				DB?: D1Database;
				R2_ARCHIVE?: R2Bucket;
				R2_QUARANTINE?: R2Bucket;
				ASSETS?: Fetcher;
				BROWSER?: BrowserRun;
				APP_ENV?: string;
				PORTAL_PUBLIC_ORIGIN?: string;
				OFFICIAL_PRIVACY_URL?: string;
				OFFICIAL_IMPRINT_URL?: string;
				OFFICIAL_CONTACT_URL?: string;
				OFFICIAL_LINKS_VERSION?: string;
				EMAIL_PROVIDER?: string;
				EMAIL_FROM?: string;
				EMAIL_REPLY_TO?: string;
				RESEND_API_KEY?: string;
				PREVIEW_EMAIL_RECIPIENT_HASHES?: string;
				JWT_SECRET?: string;
				TURNSTILE_SITE_KEY?: string;
				TURNSTILE_SECRET_KEY?: string;
				TURNSTILE_HOSTNAMES?: string;
				AUTH_PUBLIC_ENABLED?: string;
				PRIVACY_NOTICE_VERSION?: string;
				AUTH_VERIFICATION_TTL_SECONDS?: string;
				AUTH_RESET_TTL_SECONDS?: string;
				AUTH_EMAIL_CHANGE_TTL_SECONDS?: string;
				AUTH_SESSION_TTL_SECONDS?: string;
				AUTH_RESEND_COOLDOWN_SECONDS?: string;
				AUTH_RATE_LIMIT_WINDOW_SECONDS?: string;
				AUTH_RATE_LIMIT_MAX_ATTEMPTS?: string;
				AUTH_PASSWORD_MIN_LENGTH?: string;
				AUTH_PASSWORD_MAX_LENGTH?: string;
				EMAIL_MAX_ATTEMPTS?: string;
				OUTBOX_LEASE_SECONDS?: string;
				OUTBOX_RETRY_BASE_SECONDS?: string;
				OUTBOX_RETRY_MAX_SECONDS?: string;
				TELEGRAM_PROVIDER?: string;
				TELEGRAM_MAX_ATTEMPTS?: string;
				DEFAULT_GROUP_CAPACITY?: string;
				DEFAULT_DANCE_CAPACITY?: string;
				INDIVIDUAL_PRICE_CENTS_PER_45_MIN?: string;
				GROUP_DURATION_FALLBACK_MINUTES?: string;
				MISSING_DURATION_YEARLY_CENTS_PER_45_MIN?: string;
				MISSING_DURATION_MONTHLY_CENTS_PER_45_MIN?: string;
				PRICE_QUOTE_TTL_SECONDS?: string;
				DOCUMENT_UPLOAD_ENABLED?: string;
				DOCUMENT_MAX_FILE_BYTES?: string;
				DOCUMENT_MAX_FILES_PER_AUTHORIZATION?: string;
				DOCUMENT_MAX_AUTHORIZATION_BYTES?: string;
				DOCUMENT_UPLOAD_RATE_LIMIT_WINDOW_SECONDS?: string;
				DOCUMENT_UPLOAD_RATE_LIMIT_MAX_ATTEMPTS?: string;
				DOCUMENT_AV_ATTESTATION_TEXT_VERSION?: string;
				CONTRACT_SEND_ENABLED?: string;
				CONTRACT_PREVIEW_REVIEW_ENABLED?: string;
				CONTRACT_RENDERER?: string;
				CONTRACT_PDF_MAX_HTML_BYTES?: string;
				CONTRACT_PDF_MAX_BYTES?: string;
				CONTRACT_MAX_RENDER_ATTEMPTS?: string;
				BROWSER_RUN_DAILY_BUDGET_MS?: string;
				MEDIA_ONLINE_GRANT_ENABLED?: string;
				PUBLIC_CONTRACT_FUNCTIONS_ENABLED?: string;
				PRIVACY_EXPORT_TTL_SECONDS?: string;
				SCHEDULED_JOBS_ENABLED?: string;
				SCHEDULED_OUTBOX_BATCH_LIMIT?: string;
				SCHEDULED_MAINTENANCE_BATCH_LIMIT?: string;
				SCHEDULED_LEASE_SECONDS?: string;
				TELEGRAM_BOT_TOKEN?: string;
				TELEGRAM_CHAT_ID?: string;
				TELEGRAM_CHAT_TYPE?: string;
				TELEGRAM_BOT_API_TIMEOUT_MS?: string;
				TELEGRAM_ACTIVATION_AT?: string;
				TELEGRAM_BUSINESS_TIMEZONE?: string;
				TELEGRAM_BUSINESS_HOURS?: string;
			};
			context: ExecutionContext;
			ctx: ExecutionContext;
			caches: CacheStorage;
		}
		interface Locals {
			locale?: import('$lib/i18n/locale').UiLocale;
			requestId: string;
			user?: {
				id: string;
				role: 'parent' | 'admin';
				emailVerified: boolean;
				sessionId: string;
				sessionVersion: number;
				csrfHash: string;
			};
		}
	}
}

export {};

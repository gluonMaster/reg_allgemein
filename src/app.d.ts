/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				R2_BUCKET: R2Bucket;
				ASSETS: Fetcher;
				BROWSER: BrowserRun;
				APP_ENV?: string;
				EMAIL_PROVIDER?: string;
				EMAIL_FROM?: string;
				EMAIL_REPLY_TO?: string;
				RESEND_API_KEY?: string;
				JWT_SECRET?: string;
				TURNSTILE_SITE_KEY?: string;
				TURNSTILE_SECRET_KEY?: string;
				DEFAULT_GROUP_CAPACITY?: string;
				DEFAULT_DANCE_CAPACITY?: string;
				INDIVIDUAL_PRICE_CENTS_PER_45_MIN?: string;
				GROUP_DURATION_FALLBACK_MINUTES?: string;
				MISSING_DURATION_YEARLY_CENTS_PER_45_MIN?: string;
				MISSING_DURATION_MONTHLY_CENTS_PER_45_MIN?: string;
				CONTRACT_PDF_MAX_HTML_BYTES?: string;
				CONTRACT_PDF_MAX_BYTES?: string;
				BROWSER_RUN_DAILY_BUDGET_MS?: string;
				TELEGRAM_BOT_TOKEN?: string;
				TELEGRAM_CHAT_ID?: string;
				TELEGRAM_BUSINESS_TIMEZONE?: string;
				TELEGRAM_BUSINESS_HOURS?: string;
				CRON_SECRET?: string;
			};
			context: ExecutionContext;
			caches: CacheStorage;
		}
		interface Locals {
			user?: {
				id: string;
				email: string;
				role: 'parent' | 'admin';
			};
		}
	}
}

export {};

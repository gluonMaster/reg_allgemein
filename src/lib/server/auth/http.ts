import type { RequestEvent } from '@sveltejs/kit';
import { translate, type MessageKey } from '$lib/i18n';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { createAuthRuntime } from './runtime';
import { AuthFlowError } from './auth-service';
import { RateLimitExceededError } from '$lib/server/security/rate-limit';
import { AuthorizationError } from '$lib/server/security/authorization';
import { PasswordPolicyError } from './password';

export function requestSubject(event: RequestEvent): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'client-address-unavailable';
	}
}

export function requestAuthRuntime(event: RequestEvent) {
	const config = loadRuntimeConfig(event.platform?.env);
	return {
		config,
		...createAuthRuntime(config),
	};
}

export function publicAuthError(error: unknown): { status: number; messageKey: MessageKey } {
	if (error instanceof RateLimitExceededError) {
		return { status: 429, messageKey: 'auth.rateLimited' };
	}
	if (error instanceof AuthorizationError && error.code === 'CSRF_REJECTED') {
		return { status: 403, messageKey: 'auth.csrfRejected' };
	}
	if (error instanceof PasswordPolicyError) {
		return { status: 400, messageKey: 'auth.invalidInput' };
	}
	if (error instanceof AuthFlowError) {
		if (error.code === 'INVALID_CREDENTIALS') {
			return { status: 400, messageKey: 'auth.invalidCredentials' };
		}
		if (error.code === 'TURNSTILE_REJECTED' || error.code === 'PRIVACY_VERSION_MISMATCH') {
			return { status: 400, messageKey: 'auth.invalidInput' };
		}
		return { status: 503, messageKey: 'auth.serviceUnavailable' };
	}
	return { status: 503, messageKey: 'auth.serviceUnavailable' };
}

export function translatedPublicAuthError(error: unknown, locale?: string): {
	status: number;
	message: string;
	messageKey: MessageKey;
} {
	const result = publicAuthError(error);
	return {
		status: result.status,
		message: translate(locale, result.messageKey),
		messageKey: result.messageKey,
	};
}

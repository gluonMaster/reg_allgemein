import { error, type Handle, type HandleServerError } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { getOrCreateRequestId } from '$lib/server/observability/request-id';
import { logServerError } from '$lib/server/observability/redaction';
import { createAuthRuntime } from '$lib/server/auth/runtime';
import { SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { routeAccessPolicy } from '$lib/server/security/route-policy';
import { withSecurityHeaders } from '$lib/server/security/response-headers';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = getOrCreateRequestId(event.request.headers.get('x-request-id'));
	const config = loadRuntimeConfig(event.platform?.env);
	if (config.jwtSecret) {
		event.locals.user =
			(await createAuthRuntime(config).sessions.authenticate(
				event.cookies.get(SESSION_COOKIE_NAME),
				new Date().toISOString()
			)) ?? undefined;
	}

	const access = routeAccessPolicy(event.route.id);
	if (access !== 'public' && !event.locals.user) {
		throw error(401, {
			code: 'AUTHENTICATION_REQUIRED',
			message: translate('de', 'auth.invalidCredentials'),
			requestId: event.locals.requestId,
		});
	}
	if (access === 'admin' && event.locals.user?.role !== 'admin') {
		throw error(403, {
			code: 'FORBIDDEN',
			message: translate('de', 'auth.invalidCredentials'),
			requestId: event.locals.requestId,
		});
	}
	if (access === 'parent' && event.locals.user?.role !== 'parent') {
		throw error(403, {
			code: 'FORBIDDEN',
			message: translate('de', 'auth.invalidCredentials'),
			requestId: event.locals.requestId,
		});
	}

	return withSecurityHeaders(await resolve(event), {
		requestId: event.locals.requestId,
		production: config.appEnvironment === 'production',
		noStore: event.route.id === '/auth/reset' || event.route.id === '/auth/verify',
	});
};

export const handleError: HandleServerError = ({ error, event, status }) => {
	const requestId = event.locals.requestId || getOrCreateRequestId(undefined);

	logServerError(error, {
		requestId,
		method: event.request.method,
		routeId: event.route.id,
		status,
	});

	return {
		code: 'UNEXPECTED_ERROR',
		message: translate('de', 'errors.unexpected'),
		requestId,
	};
};

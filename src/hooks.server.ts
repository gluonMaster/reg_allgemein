import { json, type Handle, type HandleServerError, type RequestEvent } from '@sveltejs/kit';
import { translate, type MessageKey } from '$lib/i18n';
import { localizedAccessError } from '$lib/server/i18n/error-response';
import { normalizeUiLocale, UI_LOCALE_COOKIE } from '$lib/i18n/locale';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { getOrCreateRequestId } from '$lib/server/observability/request-id';
import { logServerError } from '$lib/server/observability/redaction';
import { createAuthRuntime } from '$lib/server/auth/runtime';
import { SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { routeAccessPolicy } from '$lib/server/security/route-policy';
import { withSecurityHeaders } from '$lib/server/security/response-headers';
import { isPortalFormOriginAllowed } from '$lib/server/security/form-origin';
import { intakeRouteAllowed } from '$lib/trial-intake/server/mode.server';

function accessDenied(
	event: RequestEvent,
	status: number,
	code: string,
	messageKey: MessageKey,
	production: boolean
): Response {
	if (!event.isDataRequest && event.request.headers.get('accept')?.includes('text/html')) {
		return localizedAccessError({
			locale: event.locals.locale,
			status,
			messageKey,
			requestId: event.locals.requestId,
			returnPath: event.url.pathname,
			production,
			role: event.locals.user?.role ?? null,
		});
	}
	return withSecurityHeaders(
		json(
			{
				code,
				locale: event.locals.locale,
				message: translate(event.locals.locale, messageKey),
				requestId: event.locals.requestId,
				accessRole: event.locals.user?.role ?? null,
			},
			{ status, headers: { vary: 'Cookie' } }
		),
		{
			requestId: event.locals.requestId,
			production,
			noStore: true,
		}
	);
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.locale = normalizeUiLocale(event.cookies.get(UI_LOCALE_COOKIE));
	event.locals.requestId = getOrCreateRequestId(event.request.headers.get('x-request-id'));
	const config = loadRuntimeConfig(event.platform?.env);
	const isIntakeRoute = event.route.id?.startsWith('/probestunde') || event.route.id?.startsWith('/admin/trial-intake');
	const intakeLogout = event.route.id === '/account/security' && event.request.method === 'POST'
		&& event.url.search === '?/logout';
	if ((config.portalMode === 'trial_intake' && !intakeRouteAllowed(event.route.id) && !intakeLogout)
		|| (config.portalMode !== 'trial_intake' && isIntakeRoute)) {
		return withSecurityHeaders(new Response(null, { status: 404 }), {
			requestId: event.locals.requestId, production: config.appEnvironment === 'production', noStore: true,
		});
	}
	if (!isPortalFormOriginAllowed(event.request, config.portalPublicOrigin)) {
		return accessDenied(
			event,
			403,
			'FORM_ORIGIN_FORBIDDEN',
			'auth.invalidInput',
			config.appEnvironment === 'production'
		);
	}
	if (config.jwtSecret) {
		event.locals.user =
			(await createAuthRuntime(config).sessions.authenticate(
				event.cookies.get(SESSION_COOKIE_NAME),
				new Date().toISOString()
			)) ?? undefined;
	}

	const access = routeAccessPolicy(event.route.id);
	if (access !== 'public' && !event.locals.user) {
		return accessDenied(
			event,
			401,
			'AUTHENTICATION_REQUIRED',
			'ui.access.signIn',
			config.appEnvironment === 'production'
		);
	}
	if (access === 'admin' && event.locals.user?.role !== 'admin') {
		return accessDenied(
			event,
			403,
			'FORBIDDEN',
			'ui.access.forbidden',
			config.appEnvironment === 'production'
		);
	}
	if (access === 'parent' && event.locals.user?.role !== 'parent') {
		return accessDenied(
			event,
			403,
			'FORBIDDEN',
			'ui.access.parentRequired',
			config.appEnvironment === 'production'
		);
	}
	if (config.portalMode === 'trial_intake' && (event.route.id === '/' || event.route.id === '/admin')) {
		return withSecurityHeaders(new Response(null, { status: 303,
			headers: { location: event.route.id === '/' ? '/probestunde' : '/admin/trial-intake' } }),
			{ production: config.appEnvironment === 'production', noStore: true });
	}

	const response = withSecurityHeaders(
		await resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace('<html lang="de">', `<html lang="${event.locals.locale}">`),
		}),
		{
			requestId: event.locals.requestId,
			production: config.appEnvironment === 'production',
			// Every page now contains session-dependent navigation, including public pages.
			noStore: true,
		}
	);
	// Responses depend on the browser preference as well as its session.
	const vary = response.headers.get('vary');
	if (!vary?.split(',').some((name) => name.trim().toLowerCase() === 'cookie')) {
		response.headers.set('vary', vary ? `${vary}, Cookie` : 'Cookie');
	}
	return response;
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
		locale: event.locals.locale,
		message: translate(event.locals.locale, 'errors.unexpected'),
		requestId,
	};
};

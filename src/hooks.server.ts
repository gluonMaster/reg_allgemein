import type { Handle, HandleServerError } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { getOrCreateRequestId } from '$lib/server/observability/request-id';
import { logServerError } from '$lib/server/observability/redaction';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = getOrCreateRequestId(event.request.headers.get('x-request-id'));
	loadRuntimeConfig(event.platform?.env);

	const response = await resolve(event);
	response.headers.set('x-request-id', event.locals.requestId);
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
		message: translate('de', 'errors.unexpected'),
		requestId,
	};
};

const FORM_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
]);

function requestContentType(request: Request): string {
	return (request.headers.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function isLoopbackHostname(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * SvelteKit's static CSRF check compares Origin with Request.url. At an
 * Access-protected edge the adapter URL can differ from the browser-facing
 * canonical origin. Bind the same check to the validated runtime origin instead.
 */
export function isPortalFormOriginAllowed(request: Request, portalPublicOrigin: string): boolean {
	if (!FORM_METHODS.has(request.method.toUpperCase())) return true;
	if (!FORM_CONTENT_TYPES.has(requestContentType(request))) return true;

	const requestOrigin = request.headers.get('origin');
	if (requestOrigin === null || requestOrigin === 'null') {
		return (
			request.headers.get('sec-fetch-site') === 'same-origin' &&
			request.headers.get('sec-fetch-mode') === 'navigate' &&
			request.headers.get('sec-fetch-dest') === 'document'
		);
	}

	const configured = new URL(portalPublicOrigin);
	let actual: URL;
	try {
		actual = new URL(requestOrigin);
	} catch {
		return false;
	}
	return (
		actual.origin === configured.origin ||
		(isLoopbackHostname(actual.hostname) && isLoopbackHostname(configured.hostname))
	);
}

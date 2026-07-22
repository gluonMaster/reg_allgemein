export interface SecurityHeaderOptions {
	requestId?: string;
	production: boolean;
	noStore?: boolean;
}

function setUnlessPresent(headers: Headers, name: string, value: string): void {
	if (!headers.has(name)) headers.set(name, value);
}

/**
 * Clone before mutation so this can also harden immutable fetch responses at
 * the outer Worker boundary. Route-specific policies are preserved.
 */
export function withSecurityHeaders(
	response: Response,
	options: SecurityHeaderOptions
): Response {
	const hardened = new Response(response.body, response);
	if (options.requestId) hardened.headers.set('x-request-id', options.requestId);
	hardened.headers.set('x-content-type-options', 'nosniff');
	hardened.headers.set('referrer-policy', 'no-referrer');
	hardened.headers.set('x-frame-options', 'DENY');
	setUnlessPresent(
		hardened.headers,
		'content-security-policy',
		"base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
	);
	hardened.headers.set(
		'permissions-policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
	);
	hardened.headers.set('cross-origin-opener-policy', 'same-origin');
	if (options.production) {
		hardened.headers.set('strict-transport-security', 'max-age=31536000');
	}
	if (options.noStore) hardened.headers.set('cache-control', 'no-store');
	return hardened;
}

import { describe, expect, it } from 'vitest';
import { withSecurityHeaders } from '$lib/server/security/response-headers';

describe('production response headers', () => {
	it('adds the global policy and production-only transport protection', () => {
		const response = withSecurityHeaders(new Response('ok'), {
			requestId: 'request-safe-1',
			production: true,
			noStore: true,
		});

		expect(response.headers.get('x-request-id')).toBe('request-safe-1');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('x-frame-options')).toBe('DENY');
		expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000');
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('does not weaken the sandbox policy of an untrusted attachment route', () => {
		const response = withSecurityHeaders(new Response('untrusted', {
			headers: { 'content-security-policy': "default-src 'none'; sandbox" },
		}), { production: false });

		expect(response.headers.get('content-security-policy'))
			.toBe("default-src 'none'; sandbox");
		expect(response.headers.has('strict-transport-security')).toBe(false);
	});
});

import { registerInputSchema } from '$lib/server/auth/contracts';
import { BcryptPasswordHasher } from '$lib/server/auth/password';
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, setSessionCookies } from '$lib/server/auth/session';
import { createRandomToken, hashCsrfToken } from '$lib/server/auth/tokens';
import { requireCsrf } from '$lib/server/security/csrf';
import { requireAdmin, requireObjectOwner } from '$lib/server/security/authorization';
import { routeAccessPolicy } from '$lib/server/security/route-policy';
import { CloudflareTurnstileVerifier } from '$lib/server/security/turnstile';

describe('auth security boundaries', () => {
	it('rejects role injection and applies deny-by-default route policy', () => {
		expect(
			registerInputSchema.safeParse({
				email: 'synthetic@example.test',
				password: 'synthetic-password-123',
				firstName: 'Synthetic',
				lastName: 'Parent',
				privacyAccepted: true,
				privacyNoticeVersion: 'notice-v1',
				turnstileToken: 'pass',
				role: 'admin',
			}).success
		).toBe(false);
		expect(routeAccessPolicy('/')).toBe('public');
		expect(routeAccessPolicy('/catalog')).toBe('public');
		expect(routeAccessPolicy('/catalog/course-1/trial')).toBe('authenticated');
		expect(routeAccessPolicy('/auth/login')).toBe('public');
		expect(routeAccessPolicy('/account/security')).toBe('authenticated');
		expect(routeAccessPolicy('/future-domain-route')).toBe('authenticated');
		expect(routeAccessPolicy('/admin/users')).toBe('admin');
	});

	it('checks object ownership and obtains admin authority only from a server actor', () => {
		const parent = {
			id: 'user-parent',
			role: 'parent' as const,
			emailVerified: true,
			sessionId: 'session-parent',
			sessionVersion: 1,
			csrfHash: 'a'.repeat(64),
		};
		const admin = { ...parent, id: 'user-admin', role: 'admin' as const };
		expect(requireObjectOwner({ actor: parent, ownerUserId: parent.id })).toBe(parent);
		expect(() => requireObjectOwner({ actor: parent, ownerUserId: 'user-other' })).toThrowError(
			/denied/i
		);
		expect(
			requireObjectOwner({ actor: admin, ownerUserId: 'user-other', allowAdmin: true })
		).toBe(admin);
		expect(() => requireAdmin(parent)).toThrowError(/denied/i);
		expect(requireAdmin(admin).id).toBe('user-admin');
	});

	it('requires the submitted CSRF token, host cookie and session-bound hash', async () => {
		const token = createRandomToken();
		const actor = {
			id: 'user-parent',
			role: 'parent' as const,
			emailVerified: true,
			sessionId: 'session-parent',
			sessionVersion: 1,
			csrfHash: await hashCsrfToken(token),
		};
		const cookies = {
			get: vi.fn((name: string) => (name === CSRF_COOKIE_NAME ? token : undefined)),
		} as never;

		await expect(
			requireCsrf({ cookies, user: actor, submittedToken: token })
		).resolves.toBeUndefined();
		await expect(
			requireCsrf({ cookies, user: actor, submittedToken: undefined })
		).rejects.toMatchObject({ code: 'CSRF_REJECTED' });
		await expect(
			requireCsrf({ cookies, user: actor, submittedToken: `${token}wrong` })
		).rejects.toMatchObject({ code: 'CSRF_REJECTED' });
		await expect(
			requireCsrf({
				cookies,
				user: { ...actor, csrfHash: 'b'.repeat(64) },
				submittedToken: token,
			})
		).rejects.toMatchObject({ code: 'CSRF_REJECTED' });
	});

	it('sets production session cookies host-only with required flags', () => {
		const set = vi.fn();
		const cookies = { set } as never;
		setSessionCookies({
			cookies,
			session: {
				sessionId: 'session-id',
				sessionToken: 'signed-session-token',
				csrfToken: 'csrf-token',
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
			},
			environment: 'production',
		});

		expect(set).toHaveBeenCalledTimes(2);
		expect(set).toHaveBeenNthCalledWith(
			1,
			SESSION_COOKIE_NAME,
			'signed-session-token',
			expect.objectContaining({
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
			})
		);
		expect(set.mock.calls[0]?.[2]).not.toHaveProperty('domain');
		expect(set.mock.calls[1]?.[2]).toMatchObject({
			path: '/',
			httpOnly: false,
			secure: true,
			sameSite: 'lax',
		});
		expect(set.mock.calls[1]?.[2]).not.toHaveProperty('domain');
	});

	it('rejects bcrypt truncation inputs before hashing', async () => {
		const hasher = new BcryptPasswordHasher(12, 128, 4);
		await expect(hasher.hash('🔐'.repeat(40))).rejects.toMatchObject({
			code: 'PASSWORD_TOO_LONG',
		});
	});

	it('accepts Turnstile only for the exact registration action and deployment hostname', async () => {
		const fetcher = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(
					JSON.stringify({
						success: true,
						action: 'registration',
						hostname: 'portal-preview.example.org',
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
		);
		const verifier = new CloudflareTurnstileVerifier(
			'test-secret',
			'registration',
			['portal-preview.example.org'],
			fetcher as unknown as typeof fetch
		);

		await expect(
			verifier.verify({ token: 'synthetic-token', remoteIp: '192.0.2.10' })
		).resolves.toBe(true);
		const request = fetcher.mock.calls[0]?.[1];
		expect(request?.method).toBe('POST');
		expect(request?.headers).toEqual({
			'content-type': 'application/x-www-form-urlencoded',
		});
		expect(request?.body).toBeInstanceOf(URLSearchParams);
		expect((request?.body as URLSearchParams).get('response')).toBe('synthetic-token');
		expect((request?.body as URLSearchParams).get('remoteip')).toBe('192.0.2.10');
	});

	it.each([
		{ success: true, action: 'login', hostname: 'portal-preview.example.org' },
		{ success: true, action: 'registration', hostname: 'another-preview.example.org' },
		{ success: true, action: 'registration' },
		{ success: false, action: 'registration', hostname: 'portal-preview.example.org' },
	])('rejects invalid Turnstile assertions: %#', async (assertion) => {
		const fetcher = vi.fn(
			async () =>
				new Response(JSON.stringify(assertion), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				})
		);
		const verifier = new CloudflareTurnstileVerifier(
			'test-secret',
			'registration',
			['portal-preview.example.org'],
			fetcher as unknown as typeof fetch
		);

		await expect(verifier.verify({ token: 'synthetic-token' })).resolves.toBe(false);
	});

	it('rejects oversized Turnstile tokens before contacting Siteverify', async () => {
		const fetcher = vi.fn();
		const verifier = new CloudflareTurnstileVerifier(
			'test-secret',
			'registration',
			['portal-preview.example.org'],
			fetcher as unknown as typeof fetch
		);

		await expect(verifier.verify({ token: 'x'.repeat(2_049) })).resolves.toBe(false);
		expect(fetcher).not.toHaveBeenCalled();
	});
});

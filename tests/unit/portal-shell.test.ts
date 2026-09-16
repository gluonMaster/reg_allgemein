import { handle } from '../../src/hooks.server';
import { load } from '../../src/routes/+layout.server';
import { germanCatalog } from '$lib/i18n';
import { russianCatalog } from '$lib/i18n/ru';

const { authenticate } = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock('$lib/server/config/runtime', () => ({
	loadRuntimeConfig: () => ({
		jwtSecret: 'synthetic',
		appEnvironment: 'production',
		portalPublicOrigin: 'https://portal.example.test',
	}),
}));
vi.mock('$lib/server/auth/runtime', () => ({
	createAuthRuntime: () => ({ sessions: { authenticate } }),
}));

function event(path: string, role: 'parent' | 'admin' | null, locale = 'de', data = false) {
	const user = role
		? {
				id: 'private-user',
				role,
				sessionId: 'private-session',
				csrfHash: 'private-hash',
				sessionVersion: 3,
				emailVerified: true,
			}
		: undefined;
	authenticate.mockResolvedValue(user);
	return {
		locals: { user, locale, requestId: 'synthetic-request' },
		cookies: {
			get: (name: string) =>
				name === 'kolibri_ui_locale'
					? locale
					: name === 'kolibri_csrf'
						? 'form-csrf'
						: 'session-secret',
		},
		url: new URL(path, 'https://portal.example.test'),
		route: { id: path },
		isDataRequest: data,
		request: new Request(new URL(path, 'https://portal.example.test'), {
			headers: { accept: data ? 'application/json' : 'text/html' },
		}),
	};
}

describe('portal shell server state and hook denials', () => {
	it.each(['parent', 'admin', null] as const)(
		'serializes only navigation fields for %s',
		async (role) => {
			const result = await load(event('/catalog', role) as never);
			expect(result).toEqual({
				portalMode: 'full',
				officialLinks: null,
				locale: 'de',
				portalNavigation: { pathname: '/catalog', role, csrfToken: role ? 'form-csrf' : '' },
			});
		}
	);
	it.each([
		['/cabinet', null, 401, 'ui.access.signIn'],
		['/admin', 'parent', 403, 'ui.access.forbidden'],
		['/catalog/example/trial', 'admin', 403, 'ui.access.parentRequired'],
	] as const)(
		'keeps localized direct/data denials and security headers for %s',
		async (path, role, status, key) => {
			for (const locale of ['de', 'ru'])
				for (const data of [false, true]) {
					const input = event(path, role, locale, data);
					const resolve = vi.fn();
					const response = await handle({ event: input, resolve } as never);
					expect(resolve).not.toHaveBeenCalled();
					expect(response.status).toBe(status);
					expect(response.headers.get('cache-control')).toBe('no-store');
					expect(response.headers.get('x-request-id')).toBeTruthy();
					expect(response.headers.get('x-frame-options')).toBe('DENY');
					expect(response.headers.get('strict-transport-security')).toContain('max-age=');
					expect(response.headers.get('vary')).toBe('Cookie');
					const catalog = locale === 'ru' ? russianCatalog : germanCatalog;
					if (data)
						expect(await response.json()).toMatchObject({
							message: catalog[key],
							accessRole: role,
						});
					else expect(await response.text()).toContain(catalog[key]);
				}
		}
	);
	it.each(['parent', 'admin', null] as const)(
		'prevents shared caching of public navigation for %s',
		async (role) => {
			const response = await handle({
				event: event('/catalog', role),
				resolve: async () =>
					new Response('public page', {
						headers: { 'cache-control': 'public, max-age=3600' },
					}),
			} as never);
			expect(response.status).toBe(200);
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(response.headers.get('vary')).toContain('Cookie');
		}
	);
});

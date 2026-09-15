import { POST } from '../../src/routes/language/+server';
import { UI_LOCALE_COOKIE } from '$lib/i18n/locale';
import { routeAccessPolicy } from '$lib/server/security/route-policy';
import { localizedAccessError } from '$lib/server/i18n/error-response';
vi.mock('$lib/server/config/runtime', () => ({
	loadRuntimeConfig: () => ({ portalPublicOrigin: 'https://portal.example.test' }),
}));

function event(locale: string, origin = 'https://portal.example.test', json = true) {
	const cookies = { set: vi.fn() };
	return {
		cookies,
		url: new URL('https://portal.example.test/language'),
		request: new Request('https://portal.example.test/language', {
			method: 'POST',
			headers: { origin, accept: json ? 'application/json' : 'text/html' },
			body: new URLSearchParams({ locale, returnTo: '/catalog?kind=group' }),
		}),
		locals: { requestId: 'synthetic-language-request', locale: 'de' },
	};
}

describe('UI language preference', () => {
	it('is available before login and sets only a host-scoped UI cookie', async () => {
		expect(routeAccessPolicy('/language')).toBe('public');
		const input = event('ru');
		const response = await POST(input as never);
		expect(await response.json()).toEqual({ locale: 'ru' });
		expect(input.cookies.set).toHaveBeenCalledExactlyOnceWith(UI_LOCALE_COOKIE, 'ru', {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 31_536_000,
		});
	});
	it('rejects invalid languages and cross-origin changes before writing a cookie', async () => {
		for (const [locale, origin] of [
			['uk', 'https://portal.example.test'],
			['ru', 'https://other.example.test'],
			['ru', 'null'],
		]) {
			const input = event(locale, origin);
			await expect(POST(input as never)).rejects.toMatchObject({
				status: locale === 'uk' ? 400 : 403,
			});
			expect(input.cookies.set).not.toHaveBeenCalled();
		}
	});
	it('redirects normal forms back to the same page without replaying its action', async () => {
		await expect(POST(event('ru', undefined, false) as never)).rejects.toMatchObject({
			status: 303,
			location: '/catalog?kind=group',
		});
	});
	it('uses the configured browser origin when the Access adapter URL differs', async () => {
		const input = event('ru');
		input.url = new URL('https://adapter.example.test/language');
		expect((await POST(input as never)).status).toBe(200);
	});
	it('preserves the existing same-origin browser form fallback with a null Origin', async () => {
		const input = event('ru', 'null', false);
		input.request.headers.set('sec-fetch-site', 'same-origin');
		input.request.headers.set('sec-fetch-mode', 'navigate');
		input.request.headers.set('sec-fetch-dest', 'document');
		await expect(POST(input as never)).rejects.toMatchObject({ status: 303 });
		expect(input.cookies.set).toHaveBeenCalledOnce();
	});
	it('renders denied browser requests in the chosen language with an escaped return path', async () => {
		const response = localizedAccessError({
			locale: 'ru',
			status: 403,
			messageKey: 'ui.access.forbidden',
			role: 'parent',
			requestId: 'safe-request-reference',
			returnPath: '/admin/\"><script>alert(1)</script>',
			production: true,
		});
		expect(response.status).toBe(403);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('x-frame-options')).toBe('DENY');
		const html = await response.text();
		expect(html).toContain('<html lang="ru">');
		expect(html).toContain('Эта страница недоступна для текущей роли.');
		expect(html).toContain('href="/cabinet"');
		expect(html).not.toContain('<script>');
		expect(html).toContain('action="/language"');
	});
});

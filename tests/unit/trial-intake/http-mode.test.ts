import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, INTAKE_EMAIL_FROM } from '$lib/server/config/runtime';
import { intakeRouteAllowed } from '$lib/trial-intake/server/mode.server';
import { handle } from '../../../src/hooks.server';
import { intakeEndpoint, submit, adminStatus, verify } from '$lib/trial-intake/server/http.server';
import { INTAKE_PRIVACY_VERSION } from '$lib/trial-intake/contracts';

const db = {
	prepare: vi.fn(() => {
		throw new Error('Unexpected DB access');
	}),
} as unknown as D1Database;
const env: App.Platform['env'] = {
	APP_ENV: 'test',
	DB: db,
	PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
	PORTAL_MODE: 'trial_intake',
	TRIAL_INTAKE_SCHEDULE_URL: 'https://schedule.example.test/',
	AUTH_PUBLIC_ENABLED: 'true',
	TRIAL_INTAKE_ACCEPTING: 'true',
	JWT_SECRET: 'synthetic-only-secret-at-least-32-chars',
	PRIVACY_NOTICE_VERSION: INTAKE_PRIVACY_VERSION,
	EMAIL_PROVIDER: 'fake',
};
function event(path: string, method: string, body: string, origin = env.PORTAL_PUBLIC_ORIGIN!) {
	return {
		platform: { env },
		locals: { requestId: 'synthetic' },
		cookies: { get: () => undefined },
		url: new URL(`${origin}${path}`),
		route: { id: path },
		params: { id: 'synthetic' },
		getClientAddress: () => 'synthetic-ip',
		request: new Request(`${origin}${path}`, {
			method,
			headers: { 'content-type': 'application/json', origin },
			...(method === 'GET' ? {} : { body }),
		}),
	} as unknown as RequestEvent;
}
describe('trial intake mode and HTTP boundaries', () => {
	it('defaults full; intake production validates without R2/Browser and keeps login available while scheduler stopped', () => {
		expect(
			loadRuntimeConfig({
				APP_ENV: 'test',
				DB: db,
				PORTAL_PUBLIC_ORIGIN: env.PORTAL_PUBLIC_ORIGIN,
			}).portalMode
		).toBe('full');
		const prod: App.Platform['env'] = {
			...env,
			APP_ENV: 'production',
			ASSETS: { fetch() {} } as unknown as Fetcher,
			EMAIL_PROVIDER: 'resend',
			EMAIL_FROM: INTAKE_EMAIL_FROM,
			EMAIL_REPLY_TO: 'registration@kolibri-dresden.de',
			RESEND_API_KEY: 're_' + 's'.repeat(32),
			TRIAL_INTAKE_ACCEPTING: 'false',
			SCHEDULED_JOBS_ENABLED: 'false',
			TURNSTILE_SITE_KEY: 'synthetic-site',
			TURNSTILE_SECRET_KEY: 'synthetic-secret',
			TURNSTILE_HOSTNAMES: 'portal.example.test',
			OFFICIAL_PRIVACY_URL: 'https://www.kolibri-dresden.de/datenschutz',
			OFFICIAL_IMPRINT_URL: 'https://www.kolibri-dresden.de/impressum',
			OFFICIAL_CONTACT_URL: 'https://www.kolibri-dresden.de/kontakt',
			OFFICIAL_LINKS_VERSION: 'test-v1',
		};
		expect(loadRuntimeConfig(prod).auth.publicEnabled).toBe(true);
		expect(() => loadRuntimeConfig({ ...prod, PORTAL_MODE: 'full' })).toThrow();
		expect(() => loadRuntimeConfig({ ...prod, AUTH_PUBLIC_ENABLED: 'false' })).toThrow();
	});
	it('route allowlist keeps registration/business paths closed and admin/reset/outbox reachable', async () => {
		for (const route of [
			'/auth/login',
			'/auth/forgot',
			'/auth/reset',
			'/admin/outbox',
			'/admin/trial-intake/[id]',
			'/admin/trial-intake/groups',
			'/admin/trial-intake/warteliste',
			'/admin/trial-intake/warteliste/preise.csv',
			'/admin/trial-intake/warteliste/preise.xlsx',
			'/admin/trial-intake/warteliste/import',
			'/admin/operations',
			'/warteliste',
			'/warteliste/submit',
			'/warteliste/austragen',
		])
			expect(intakeRouteAllowed(route)).toBe(true);
		// Full mode keeps the waitlist closed like every other intake route.
		const full = { ...env, PORTAL_MODE: 'full' };
		for (const route of ['/warteliste', '/warteliste/submit', '/warteliste/austragen']) {
			const request = event(route, 'GET', '');
			(request.platform as { env: App.Platform['env'] }).env = full;
			expect((await handle({ event: request, resolve: vi.fn() })).status).toBe(404);
		}
		for (const route of [
			'/auth/register',
			'/auth/verify',
			'/auth/resend',
			'/cabinet',
			'/catalog',
			'/admin/users',
			'/admin/contracts',
			'/requests',
		]) {
			expect(intakeRouteAllowed(route)).toBe(false);
			const response = await handle({ event: event(route, 'GET', ''), resolve: vi.fn() });
			expect(response.status).toBe(404);
			expect(response.headers.get('cache-control')).toBe('no-store');
		}
	});
	it('rejects JSON cross-origin, oversize and missing admin CSRF before writes', async () => {
		const wrong = event('/probestunde/submit', 'POST', '{}', 'https://evil.example.test');
		expect((await intakeEndpoint(() => submit(wrong))).status).toBe(403);
		const huge = event('/probestunde/submit', 'POST', 'x'.repeat(16385));
		expect((await intakeEndpoint(() => submit(huge))).status).toBe(413);
		expect(
			(
				await intakeEndpoint(() =>
					adminStatus(event('/admin/trial-intake/[id]', 'POST', '{"processed":true}'))
				)
			).status
		).toBe(401);
		expect(
			(
				await intakeEndpoint(() =>
					verify(event('/probestunde/verify?token=invalid', 'GET', ''))
				)
			).status
		).toBe(200);
	});
});

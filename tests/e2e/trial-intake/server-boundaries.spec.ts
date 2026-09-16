import { expect, test } from '@playwright/test';
import { germanCatalog } from '../../../src/lib/i18n';
import { ORGANIZATION_NAME } from '../../../src/lib/organization';
import { newE2eContext, syntheticIdentities, syntheticPassword } from '../support/authenticated';

test.skip(
	process.env.KOLIBRI_E2E_TRIAL_INTAKE !== '1',
	'Dedicated isolated intake environment required.'
);
test('intake HTTP gate keeps admin login/reset/logout and rejects full portal routes', async ({
	browser,
}, testInfo) => {
	const context = await newE2eContext(browser, testInfo);
	try {
		const page = await context.newPage();
		await page.setViewportSize({ width: 390, height: 844 });
		for (const path of [
			'/auth/register',
			'/catalog',
			'/cabinet',
			'/admin/users',
			'/admin/contracts',
		]) {
			const response = await context.request.get(path);
			expect(response.status(), path).toBe(404);
			expect(response.headers()['cache-control']).toBe('no-store');
		}
		expect((await context.request.get('/admin/trial-intake')).status()).toBe(401);
		const inspect = await context.request.get('/probestunde/verify?token=invalid', {
			headers: { accept: 'application/json' },
		});
		expect(await inspect.json()).toEqual({ state: 'invalid' });
		expect(inspect.headers()['referrer-policy']).toBe('no-referrer');
		expect((await context.request.post('/probestunde/submit', { data: {} })).status()).toBe(
			400
		);
		expect((await page.goto('/auth/forgot'))?.status()).toBe(200);
		await expect(page.locator('.site-brand')).toContainText(ORGANIZATION_NAME);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		expect((await page.goto('/auth/reset?token=invalid'))?.status()).toBe(200);
		await expect(page.locator('.site-brand')).toContainText(ORGANIZATION_NAME);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		await page.goto('/auth/login');
		await page
			.getByLabel(germanCatalog['auth.emailLabel'])
			.fill(syntheticIdentities.admin.email);
		await page.getByLabel(germanCatalog['auth.passwordLabel']).fill(syntheticPassword);
		await Promise.all([
			page.waitForURL('**/admin/trial-intake'),
			page.getByRole('button', { name: germanCatalog['auth.login.submit'] }).click(),
		]);
		const list = await context.request.get('/admin/trial-intake', {
			headers: { accept: 'application/json' },
		});
		expect(list.status()).toBe(200);
		expect(Array.isArray((await list.json()).rows)).toBe(true);
		expect((await context.request.get('/admin/outbox')).status()).toBe(200);
		expect((await context.request.get('/admin/operations')).status()).toBe(200);
		expect(
			(
				await context.request.post('/admin/trial-intake/missing', {
					data: { processed: true },
				})
			).status()
		).toBe(403);
		const csrf = (await context.cookies()).find((c) => c.name === 'kolibri_csrf')!.value;
		await context.request.post('/account/security?/logout', { form: { _csrf: csrf } });
		expect((await context.request.get('/admin/trial-intake')).status()).toBe(401);
	} finally {
		await context.close();
	}
});

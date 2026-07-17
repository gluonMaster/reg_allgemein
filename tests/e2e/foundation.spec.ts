import { expect, test } from '@playwright/test';
import { germanCatalog } from '../../src/lib/i18n';

test('serves the German foundation page with a correlation ID', async ({ page }) => {
	const response = await page.goto('/');

	expect(response?.ok()).toBe(true);
	expect(response?.headers()['x-request-id']).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(germanCatalog['home.title']);
	await expect(page).toHaveTitle(germanCatalog['home.title']);
});

test('renders the mobile German registration form and protects account routes', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const response = await page.goto('/auth/register');

	expect(response?.ok()).toBe(true);
	await expect(page).toHaveTitle(germanCatalog['auth.register.title']);
	await expect(page.getByLabel(germanCatalog['auth.firstNameLabel'])).toBeVisible();
	await expect(page.getByLabel(germanCatalog['auth.lastNameLabel'])).toBeVisible();
	await expect(page.getByLabel(germanCatalog['auth.emailLabel'])).toBeVisible();
	await expect(page.getByLabel(germanCatalog['auth.passwordLabel'])).toBeVisible();
	await expect(
		page.getByRole('button', { name: germanCatalog['auth.register.submit'] })
	).toBeDisabled();

	const protectedResponse = await page.goto('/account/security');
	expect(protectedResponse?.status()).toBe(401);
});

test('rejects unauthenticated admin pages and direct mutation actions', async ({
	page,
	request,
}) => {
	const shellResponse = await page.goto('/admin');
	expect(shellResponse?.status()).toBe(401);

	const mutationResponse = await request.post('/admin/users/unknown-user?/block', {
		form: {
			reason: 'playwright-admin-denial',
			idempotencyKey: 'playwright-admin-denial-0001',
		},
	});
	expect(mutationResponse.status()).toBe(401);
});

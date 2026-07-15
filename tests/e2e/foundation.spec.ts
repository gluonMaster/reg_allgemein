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

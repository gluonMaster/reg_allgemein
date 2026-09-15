import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { germanCatalog as de } from '../../src/lib/i18n';
import { russianCatalog as ru } from '../../src/lib/i18n/ru';
import { login, newE2eContext, syntheticIdentities } from './support/authenticated';

// Complete the intermediate-width inspection; primary-width evidence lives in
// the existing surface specs. No business action is needed to populate screens.
async function inspectReflow(page: Page, name: string, settings = false) {
	const sizes = settings
		? [[1366, 768], [390, 844], [768, 1024], [1536, 864]]
		: [[768, 1024], [1536, 864]];
	for (const [width, height] of sizes) {
		await page.setViewportSize({ width, height });
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		expect(await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <= innerWidth)).toBe(true);
		await page.screenshot({
			path: `tmp/portal-ui-2026-09-15/05-${name}-${width}.png`,
			fullPage: settings,
			mask: [page.locator('input[type="email"], code, pre, .family-number'), page.getByText(/@e2e\.invalid/)],
		});
	}
}

test('completes portal reflow and DE/RU account settings keyboard inspection without business submits', async ({ browser }, testInfo) => {
	test.setTimeout(120_000);
	const parent = await newE2eContext(browser, testInfo);
	const admin = await newE2eContext(browser, testInfo);
	try {
		const page = await parent.newPage();
		await page.goto('/');
		await inspectReflow(page, 'home-de');
		await login(page, syntheticIdentities.parentB);
		const businessPosts: string[] = [];
		page.on('request', request => {
			if (request.method() === 'POST' && new URL(request.url()).pathname !== '/language')
				businessPosts.push(new URL(request.url()).pathname);
		});
		for (const [path, name] of [
			['/catalog', 'catalog-de'], ['/cabinet', 'cabinet-de'],
			['/catalog/e2e-trial-course/trial', 'trial-de'],
			['/requests/new?kind=individual', 'individual-de'],
			['/messages?course=e2e-trial-course', 'inquiry-de'],
		]) {
			expect((await page.goto(path))?.status()).toBe(200);
			await inspectReflow(page, name);
		}
		await page.goto('/messages/e2e-message-b');
		await expect(page.locator('.activity-item .item-kicker').first()).toContainText('12.08.2026, 10:07');
		await inspectReflow(page, 'message-de', true);
		await page.goto('/account/security');
		for (const locale of ['de', 'ru'] as const) {
			const text = locale === 'de' ? de : ru;
			if (locale === 'ru') await page.getByRole('button', { name: 'Русский', exact: true }).click();
			await expect(page.locator('html')).toHaveAttribute('lang', locale);
			const email = page.getByLabel(text['auth.security.newEmailLabel']);
			await expect(email).toBeVisible();
			await email.focus();
			await page.keyboard.press('Tab');
			const submit = page.getByRole('button', { name: text['auth.security.changeEmailSubmit'], exact: true });
			await expect(submit).toBeFocused();
			expect(await submit.evaluate(element => element.matches(':focus-visible'))).toBe(true);
			await inspectReflow(page, `settings-${locale}`, true);
			const accessibility = await new AxeBuilder({ page }).analyze();
			expect(accessibility.violations.map(item => item.id)).toEqual([]);
			expect(accessibility.incomplete.map(item => item.id)).toEqual([]);
		}
		for (const [path, name] of [
			['/requests/new?kind=nachhilfe', 'nachhilfe-ru'],
			['/messages?course=e2e-trial-course', 'inquiry-ru'],
			['/messages/e2e-message-b', 'message-ru'],
		]) {
			await page.goto(path);
			await inspectReflow(page, name);
		}
		expect(businessPosts).toEqual([]);
		const adminPage = await admin.newPage();
		await login(adminPage, syntheticIdentities.admin);
		await adminPage.getByRole('button', { name: 'Русский', exact: true }).click();
		await expect(adminPage.locator('html')).toHaveAttribute('lang', 'ru');
		for (const [path, name] of [
			['/admin', 'admin-ru'], ['/admin/catalog', 'admin-catalog-ru'],
			['/admin/contracts', 'admin-contracts-ru'], ['/admin/pricing', 'admin-pricing-ru'],
		]) {
			expect((await adminPage.goto(path))?.status()).toBe(200);
			await expect(adminPage.locator('html')).toHaveAttribute('lang', 'ru');
			await inspectReflow(adminPage, name);
		}
		await adminPage.goto('/admin');
		await adminPage.getByRole('link', { name: ru['admin.dashboard.allUsers'], exact: true }).click();
		await expect(adminPage).toHaveURL(/\/admin\/users$/);
		await inspectReflow(adminPage, 'admin-users-ru');
	} finally {
		await parent.close();
		await admin.close();
	}
});

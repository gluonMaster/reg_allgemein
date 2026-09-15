import { expect, test, type Page } from '@playwright/test';
import { formatMessage, germanCatalog as de } from '../../src/lib/i18n';
import { russianCatalog as ru } from '../../src/lib/i18n/ru';
import { login, newE2eContext, syntheticIdentities } from './support/authenticated';

const courseName = 'Synthetic E2E Art Studio';
const inquiryPath = '/messages?course=e2e-trial-course';
async function inspect(page: Page, name: string) {
	for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
		await page.setViewportSize(viewport);
		expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
		await page.screenshot({ path: `tmp/portal-ui-2026-09-15/03-${name}-${viewport.width}.png`, fullPage: true });
	}
}

test('opens catalog contract and trial entries with editable DE/RU forms and cabinet returns', async ({ browser }, testInfo) => {
	test.setTimeout(90_000);
	const context = await newE2eContext(browser, testInfo);
	try {
		const page = await context.newPage();
		await login(page, syntheticIdentities.parentB);
		for (const locale of ['de', 'ru'] as const) {
			const text = locale === 'de' ? de : ru;
			await page.goto('/catalog');
			if (locale === 'ru') {
				await page.getByRole('button', { name: 'Русский', exact: true }).click();
				await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
			}
			const card = page.locator('article.catalog-card').filter({ hasText: courseName });
			await expect(card).toContainText('Kunst');
			await expect(card).toContainText('16:00–17:30');
			await expect(card).toContainText(text['catalog.price.baseNotice']);
			await inspect(page, `catalog-${locale}`);
			await card.getByRole('link', { name: text['catalog.contract.cta'] }).click();
			await expect(page).toHaveURL(new RegExp('/messages\\?course=e2e-trial-course$'));
			const form = page.locator('form[action="?/create"]');
			await expect(form.locator('[name="category"]')).toHaveValue('contract');
			await expect(form.locator('[name="subject"]')).toHaveValue(formatMessage(locale, 'catalog.contract.subject', { course: courseName }));
			await expect(form.locator('[name="message"]')).toHaveValue(new RegExp(courseName));
			await expect(form.locator('[name="message"]')).toHaveValue(/16:00–17:30/);
			await expect(form).toContainText(text['catalog.contract.notice']);
			await inspect(page, `inquiry-${locale}`);
			await page.getByRole('link', { name: text['trial.backToCatalog'], exact: true }).click();
			await card.getByRole('link', { name: text['catalog.cta.trial'], exact: true }).click();
			await expect(page.getByRole('heading', { name: courseName, exact: true })).toBeVisible();
			await expect(page.locator('[name="childId"]')).toBeVisible();
			if (locale === 'de') await inspect(page, 'trial-de');
			await page.locator('main a[href="/cabinet"]').click();
			await expect(page).toHaveURL(/\/cabinet$/);
			const kind = locale === 'de' ? 'individual' : 'nachhilfe';
			expect((await page.goto(`/requests/new?kind=${kind}`))?.status()).toBe(200);
			await expect(page.locator('[name="requestKind"]')).toHaveValue(kind);
			await inspect(page, `${kind}-${locale}`);
			await page.locator('main a[href="/cabinet"]').click();
			await expect(page).toHaveURL(/\/cabinet$/);
		}
		expect((await page.goto('/contracts/e2e-contract-offer-b'))?.status()).toBe(200);
		await expect(page.getByText(ru['contract.preparation.notice'])).toBeVisible();
		await inspect(page, 'offer-ru');
		await page.locator('main a[href="/cabinet"]').click();
		await expect(page).toHaveURL(/\/cabinet$/);
		await page.goto('/messages?course=unavailable');
		await expect(page.locator('[name="category"]')).toHaveValue('technical');
		await expect(page.locator('[name="subject"]')).toHaveValue('');
	} finally { await context.close(); }
});

test('preserves inquiry edits on rejection and submits ordinary messages once', async ({ browser }, testInfo) => {
	const context = await newE2eContext(browser, testInfo);
	try {
		const page = await context.newPage();
		await login(page, syntheticIdentities.parentA);
		await page.goto(inquiryPath);
		const form = page.locator('form[action="?/create"]');
		const subject = 'Synthetic edited contract inquiry';
		const message = 'Synthetic request edited before explicit submission.';
		const key = await form.locator('[name="idempotencyKey"]').inputValue();
		await form.locator('[name="subject"]').fill(subject);
		await form.locator('[name="message"]').fill('   ');
		await form.getByRole('button').click();
		await expect(page.getByText(de['messages.failed'])).toBeVisible();
		await expect(form.locator('[name="category"]')).toHaveValue('contract');
		await expect(form.locator('[name="subject"]')).toHaveValue(subject);
		await expect(form.locator('[name="message"]')).toHaveValue('   ');
		await expect(form.locator('[name="idempotencyKey"]')).toHaveValue(key);
		await expect(page.locator('article.activity-item').filter({ hasText: subject })).toHaveCount(0);
		await form.locator('[name="message"]').fill(message);
		await form.getByRole('button').click();
		await expect(page.getByText(de['messages.created'])).toBeVisible();
		let card = page.locator('article.activity-item').filter({ hasText: subject });
		await expect(card).toHaveCount(1);
		await expect(card).toContainText(de['messages.category.contract']);
		const csrf = await form.locator('[name="_csrf"]').inputValue();
		const replay = await context.request.post('/messages?/create', { form: { _csrf: csrf, category: 'contract', subject, message, idempotencyKey: key } });
		expect(replay.status()).toBeLessThan(400);
		await page.goto('/messages');
		await expect(card).toHaveCount(1);
		await card.getByRole('link', { name: de['messages.open'] }).click();
		await expect(page.getByText(message, { exact: true })).toBeVisible();
		await page.goto('/messages');
		await form.locator('[name="subject"]').fill('Synthetic ordinary technical question');
		await form.locator('[name="message"]').fill('Synthetic ordinary body.');
		await form.getByRole('button').click();
		await expect(page.getByText(de['messages.created'])).toBeVisible();
		card = page.locator('article.activity-item').filter({ hasText: 'Synthetic ordinary technical question' });
		await expect(card).toHaveCount(1);
		await expect(card).toContainText(de['messages.category.technical']);
	} finally { await context.close(); }
});

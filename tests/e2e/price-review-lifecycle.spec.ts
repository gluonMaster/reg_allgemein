import { expect, test, type BrowserContext } from '@playwright/test';
import { germanCatalog } from '../../src/lib/i18n';
import { login, newE2eContext, syntheticIdentities } from './support/authenticated';

const courseName = 'Synthetic E2E Price Studio';
const publicReference = 'e2e-price-lifecycle-review';

async function closeContexts(contexts: readonly BrowserContext[]): Promise<void> {
	await Promise.all(contexts.map((context) => context.close()));
}

test('accepts an immutable price review and schedules it through dual-control UI', async ({
	browser,
}, testInfo) => {
	const parentContext = await newE2eContext(browser, testInfo);
	const adminContext = await newE2eContext(browser, testInfo);
	try {
		const parent = await parentContext.newPage();
		const admin = await adminContext.newPage();

		await login(parent, syntheticIdentities.priceParent);
		const cabinetResponse = await parent.goto('/cabinet?read=sent#price-reviews');
		expect(cabinetResponse?.status()).toBe(200);
		let parentItem = parent
			.locator('#price-reviews article.activity-item')
			.filter({ hasText: courseName });
		await expect(parentItem).toHaveCount(1);
		await expect(parentItem.locator('.item-kicker')).toHaveText('sent');
		await expect(parentItem).toContainText('46,00');
		await expect(parentItem).toContainText('50,00');

		await parentItem
			.getByRole('link', { name: germanCatalog['cabinet.priceReviews.open'] })
			.click();
		await expect(parent).toHaveURL(new RegExp(`/price-reviews/${publicReference}$`, 'u'));
		await expect(
			parent.getByText(germanCatalog['priceReviews.detail.acceptanceText'])
		).toBeVisible();
		await expect(parent.getByText('46,00\u00a0\u20ac', { exact: true })).toBeVisible();
		await expect(parent.getByText('50,00\u00a0\u20ac', { exact: true })).toBeVisible();
		await parent
			.getByRole('button', { name: germanCatalog['priceReviews.detail.accept'] })
			.click();
		await expect(
			parent.getByText(germanCatalog['priceReviews.detail.responded'])
		).toBeVisible();
		await expect(
			parent.getByText(germanCatalog['priceReviews.detail.notActionable'])
		).toBeVisible();
		await expect(
			parent.getByRole('button', { name: germanCatalog['priceReviews.detail.accept'] })
		).toHaveCount(0);

		const parentAcceptedRead = await parent.goto('/cabinet?read=accepted#price-reviews');
		expect(parentAcceptedRead?.status()).toBe(200);
		parentItem = parent
			.locator('#price-reviews article.activity-item')
			.filter({ hasText: courseName });
		await expect(parentItem.locator('.item-kicker')).toHaveText('accepted_by_parent');
		await expect(parentItem).toContainText('46,00');
		await expect(parentItem).toContainText('50,00');

		await login(admin, syntheticIdentities.admin);
		const adminQueueResponse = await admin.goto('/admin/price-reviews');
		expect(adminQueueResponse?.status()).toBe(200);
		let batch = admin.locator('article.admin-card').filter({ hasText: courseName });
		await expect(batch).toHaveCount(1);
		let adminItem = batch.locator('li').filter({ hasText: 'accepted_by_parent' });
		await expect(adminItem).toHaveCount(1);
		await expect(adminItem).toContainText('46,00');
		await expect(adminItem).toContainText('50,00');
		await adminItem
			.getByLabel(germanCatalog['admin.priceReviews.reason'])
			.fill('Synthetic parent acceptance and exact price snapshot reviewed');
		await adminItem.getByLabel(germanCatalog['admin.priceReviews.finalConfirmCheck']).check();
		await adminItem
			.getByRole('button', { name: germanCatalog['admin.priceReviews.finalConfirm'] })
			.click();
		await expect(admin.getByText(germanCatalog['admin.priceReviews.actionDone'])).toBeVisible();

		batch = admin.locator('article.admin-card').filter({ hasText: courseName });
		adminItem = batch.locator('li').filter({ hasText: 'scheduled' });
		await expect(adminItem).toHaveCount(1);
		await expect(adminItem).toContainText('46,00');
		await expect(adminItem).toContainText('50,00');
		await expect(
			adminItem.getByRole('button', {
				name: germanCatalog['admin.priceReviews.finalConfirm'],
			})
		).toHaveCount(0);

		const parentScheduledRead = await parent.goto('/cabinet?read=scheduled#price-reviews');
		expect(parentScheduledRead?.status()).toBe(200);
		parentItem = parent
			.locator('#price-reviews article.activity-item')
			.filter({ hasText: courseName });
		await expect(parentItem.locator('.item-kicker')).toHaveText('scheduled');
		await expect(parentItem).toContainText('46,00');
		await expect(parentItem).toContainText('50,00');

		const detailResponse = await parent.goto(
			`/price-reviews/${publicReference}?read=scheduled`
		);
		expect(detailResponse?.status()).toBe(200);
		await expect(
			parent.getByText(germanCatalog['priceReviews.detail.notActionable'])
		).toBeVisible();
		await expect(parent.getByText('46,00\u00a0\u20ac', { exact: true })).toBeVisible();
		await expect(parent.getByText('50,00\u00a0\u20ac', { exact: true })).toBeVisible();

		const activityRead = await parent.goto('/cabinet?read=current-price');
		expect(activityRead?.status()).toBe(200);
		const activity = parent
			.locator('article.activity-item')
			.filter({ hasText: courseName })
			.first();
		await expect(activity).toContainText('46,00');
		await expect(activity).not.toContainText('50,00');

		await admin.goto('/admin/price-reviews?read=terminal');
		batch = admin.locator('article.admin-card').filter({ hasText: courseName });
		await expect(batch.locator('li').filter({ hasText: 'scheduled' })).toHaveCount(1);
	} finally {
		await closeContexts([parentContext, adminContext]);
	}
});

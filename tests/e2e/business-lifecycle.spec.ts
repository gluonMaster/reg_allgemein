import { expect, test, type BrowserContext } from '@playwright/test';
import { germanCatalog } from '../../src/lib/i18n';
import {
	login,
	newE2eContext,
	syntheticIdentities,
} from './support/authenticated';

const lifecycleSubject = 'Synthetic browser lifecycle ceramics';

async function closeContexts(contexts: readonly BrowserContext[]): Promise<void> {
	await Promise.all(contexts.map((context) => context.close()));
}

test('completes an individual request from parent draft through admin approval', async ({
	browser,
}, testInfo) => {
	const parentContext = await newE2eContext(browser, testInfo);
	const adminContext = await newE2eContext(browser, testInfo);
	try {
		const parent = await parentContext.newPage();
		const admin = await adminContext.newPage();
		await login(parent, syntheticIdentities.parentA);

		const newRequestResponse = await parent.goto('/requests/new?kind=individual');
		expect(newRequestResponse?.status()).toBe(200);
		await parent.getByLabel(germanCatalog['request.child']).selectOption('e2e-child-a');
		await parent.getByLabel(germanCatalog['request.subjects']).fill(lifecycleSubject);
		await parent
			.getByLabel(germanCatalog['request.description'])
			.fill('Synthetic parent-to-admin lifecycle evidence.');
		await parent.getByLabel(germanCatalog['request.day.MO']).check();
		await parent.getByLabel(germanCatalog['request.preferredFormat']).selectOption('onsite');
		await parent
			.getByLabel(germanCatalog['request.preferredLocations'])
			.fill('Synthetic studio');

		await Promise.all([
			parent.waitForURL((url) => /^\/requests\/[^/]+$/u.test(url.pathname)),
			parent.getByRole('button', { name: germanCatalog['request.draftCreate'] }).click(),
		]);
		const requestPath = new URL(parent.url()).pathname;
		expect(requestPath).toMatch(/^\/requests\/[0-9a-f-]{36}$/u);
		await expect(
			parent.getByText(germanCatalog['request.status.draft'], { exact: true })
		).toBeVisible();

		await parent.getByRole('button', { name: germanCatalog['request.submit'] }).click();
		await expect(parent.getByText(germanCatalog['request.submitted'])).toBeVisible();
		await expect(
			parent.getByText(germanCatalog['request.status.pending_admin_review'], { exact: true })
		).toBeVisible();

		await login(admin, syntheticIdentities.admin);
		const adminQueueResponse = await admin.goto('/admin/requests');
		expect(adminQueueResponse?.status()).toBe(200);
		await admin.getByLabel(germanCatalog['admin.search']).fill(lifecycleSubject);
		await admin.getByRole('button', { name: germanCatalog['admin.filter'] }).click();

		const requestCard = admin.locator('article.admin-card').filter({
			hasText: lifecycleSubject,
		});
		await expect(requestCard).toHaveCount(1);
		await expect(
			requestCard.getByText(germanCatalog['request.status.pending_admin_review'], {
				exact: false,
			})
		).toBeVisible();
		await requestCard
			.getByLabel(germanCatalog['admin.requests.requestDecision'])
			.selectOption('approve');
		await requestCard
			.getByLabel(germanCatalog['admin.requests.reason'])
			.fill('Synthetic browser lifecycle approval');
		await requestCard.getByLabel(germanCatalog['admin.requests.confirm']).check();
		await requestCard
			.getByRole('button', { name: germanCatalog['admin.requests.requestApply'] })
			.click();
		await expect(admin.getByText(germanCatalog['admin.requests.requestUpdated'])).toBeVisible();
		await expect(
			requestCard.getByText(germanCatalog['request.status.approved'], { exact: false })
		).toBeVisible();

		const terminalStateResponse = await parent.goto(requestPath);
		expect(terminalStateResponse?.status()).toBe(200);
		await expect(
			parent.getByText(germanCatalog['request.status.approved'], { exact: true })
		).toBeVisible();
		await expect(
			parent.getByRole('button', { name: germanCatalog['request.submit'] })
		).toHaveCount(0);
	} finally {
		await closeContexts([parentContext, adminContext]);
	}
});

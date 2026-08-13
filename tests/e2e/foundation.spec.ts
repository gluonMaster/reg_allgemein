import { expect, test } from '@playwright/test';
import { germanCatalog } from '../../src/lib/i18n';

test('serves the German foundation page with a correlation ID', async ({ page }) => {
	const response = await page.goto('/');

	expect(response?.ok()).toBe(true);
	expect(response?.headers()['x-request-id']).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(germanCatalog['home.title']);
	await expect(
		page.getByRole('link', { name: germanCatalog['home.catalogLink'] }).first()
	).toHaveAttribute('href', '/catalog');
	await expect(page).toHaveTitle(germanCatalog['home.title']);
	await expect(page.locator('meta[name="description"]')).toHaveAttribute(
		'content',
		germanCatalog['meta.description']
	);
	await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
	const faviconResponse = await page.request.get('/favicon.svg');
	expect(faviconResponse.ok()).toBe(true);
	expect(faviconResponse.headers()['content-type']).toContain('image/svg+xml');
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
	).toBeEnabled();

	const protectedResponse = await page.goto('/account/security');
	expect(protectedResponse?.status()).toBe(401);
	const protectedTrialResponse = await page.goto('/catalog/course-1/trial');
	expect(protectedTrialResponse?.status()).toBe(401);
	const protectedRequestResponse = await page.goto('/requests/new?kind=nachhilfe');
	expect(protectedRequestResponse?.status()).toBe(401);
	const protectedContractResponse = await page.goto('/contracts/00000000-0000-4000-8000-000000000001');
	expect(protectedContractResponse?.status()).toBe(401);
	const protectedPriceReviewResponse = await page.goto(
		'/price-reviews/00000000-0000-4000-8000-000000000001'
	);
	expect(protectedPriceReviewResponse?.status()).toBe(401);
	const protectedMessagesResponse = await page.goto('/messages');
	expect(protectedMessagesResponse?.status()).toBe(401);
	const protectedMessageResponse = await page.goto(
		'/messages/00000000-0000-4000-8000-000000000001'
	);
	expect(protectedMessageResponse?.status()).toBe(401);
});

test('rejects unauthenticated admin pages and direct mutation actions', async ({
	page,
	request,
}) => {
	const shellResponse = await page.goto('/admin');
	expect(shellResponse?.status()).toBe(401);
	const requestReviewResponse = await page.goto('/admin/requests');
	expect(requestReviewResponse?.status()).toBe(401);
	const contractsResponse = await page.goto('/admin/contracts');
	expect(contractsResponse?.status()).toBe(401);
	const priceReviewsResponse = await page.goto('/admin/price-reviews');
	expect(priceReviewsResponse?.status()).toBe(401);
	const messagesResponse = await page.goto('/admin/messages');
	expect(messagesResponse?.status()).toBe(401);
	const outboxResponse = await page.goto('/admin/outbox');
	expect(outboxResponse?.status()).toBe(401);

	const mutationResponse = await request.post('/admin/users/unknown-user?/block', {
		form: {
			reason: 'playwright-admin-denial',
			idempotencyKey: 'playwright-admin-denial-0001',
		},
	});
	expect(mutationResponse.status()).toBe(401);
	const contractMutationResponse = await request.post(
		'/contracts/00000000-0000-4000-8000-000000000001?/accept',
		{ form: { expectedContractHash: 'a'.repeat(64), idempotencyKey: 'e2e-contract-denial' } }
	);
	expect(contractMutationResponse.status()).toBe(401);
	const priceReviewMutationResponse = await request.post('/admin/price-reviews?/maintenance', {
		form: {
			confirmation: 'confirmed',
			idempotencyKey: 'e2e-price-review-denial',
		},
	});
	expect(priceReviewMutationResponse.status()).toBe(401);
	const messageMutationResponse = await request.post('/messages?/create', {
		form: {
			category: 'technical', subject: 'Denied', message: 'Denied',
			idempotencyKey: 'e2e-message-denial',
		},
	});
	expect(messageMutationResponse.status()).toBe(401);
	const outboxMutationResponse = await request.post('/admin/outbox?/change', {
		form: {
			channel: 'telegram', outboxId: 'unknown', outboxAction: 'retry',
			confirmation: 'confirmed', idempotencyKey: 'e2e-outbox-denial',
		},
	});
	expect(outboxMutationResponse.status()).toBe(401);
});

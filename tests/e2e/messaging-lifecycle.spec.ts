import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { germanCatalog } from '../../src/lib/i18n';
import { login, newE2eContext, syntheticIdentities } from './support/authenticated';

const supportSubject = 'Synthetic browser support lifecycle';
const parentMessage = 'Synthetic support request without personal data.';
const adminReply = 'Synthetic final answer persisted before delivery.';

async function closeContexts(contexts: readonly BrowserContext[]): Promise<void> {
	await Promise.all(contexts.map((context) => context.close()));
}

async function outboxCardTexts(page: Page): Promise<string[]> {
	return page.locator('article.admin-card').allTextContents();
}

function addedCardTexts(before: readonly string[], after: readonly string[]): string[] {
	const remaining = [...before];
	return after.filter((text) => {
		const index = remaining.indexOf(text);
		if (index === -1) return true;
		remaining.splice(index, 1);
		return false;
	});
}

test('persists a parent support thread, admin answer and both durable outbox rows', async ({
	browser,
}, testInfo) => {
	const parentContext = await newE2eContext(browser, testInfo);
	const adminContext = await newE2eContext(browser, testInfo);
	try {
		const parent = await parentContext.newPage();
		const admin = await adminContext.newPage();

		await login(admin, syntheticIdentities.admin);
		expect(
			(
				await admin.goto('/admin/outbox?channel=email&status=pending&q=support.admin_reply')
			)?.status()
		).toBe(200);
		const emailOutboxBefore = await outboxCardTexts(admin);
		expect(
			(
				await admin.goto('/admin/outbox?channel=telegram&status=pending&q=bureau.support')
			)?.status()
		).toBe(200);
		const telegramOutboxBefore = await outboxCardTexts(admin);

		await login(parent, syntheticIdentities.parentA);
		const messagesResponse = await parent.goto('/messages');
		expect(messagesResponse?.status()).toBe(200);
		const createForm = parent.locator('form[action="?/create"]');
		await createForm.getByLabel(germanCatalog['messages.category']).selectOption('technical');
		await createForm.getByLabel(germanCatalog['messages.subject']).fill(supportSubject);
		await createForm.getByLabel(germanCatalog['messages.message']).fill(parentMessage);
		await createForm.getByRole('button', { name: germanCatalog['messages.submit'] }).click();
		await expect(parent.getByText(germanCatalog['messages.created'])).toBeVisible();

		const parentThreadCard = parent
			.locator('article.activity-item')
			.filter({ hasText: supportSubject });
		await expect(parentThreadCard).toHaveCount(1);
		await expect(
			parentThreadCard.getByText(germanCatalog['messages.status.waiting_for_admin'], {
				exact: false,
			})
		).toBeVisible();
		const parentThreadPath = await parentThreadCard
			.getByRole('link', { name: germanCatalog['messages.open'] })
			.getAttribute('href');
		expect(parentThreadPath).toMatch(/^\/messages\/[0-9a-f-]{36}$/u);

		const adminQueueResponse = await admin.goto(
			`/admin/messages?q=${encodeURIComponent(supportSubject)}`
		);
		expect(adminQueueResponse?.status()).toBe(200);
		const adminThreadCard = admin
			.locator('article.admin-card')
			.filter({ hasText: supportSubject });
		await expect(adminThreadCard).toHaveCount(1);
		await expect(adminThreadCard.getByText(parentMessage, { exact: false })).toHaveCount(0);
		await adminThreadCard.getByRole('link', { name: germanCatalog['messages.open'] }).click();
		await expect(admin.getByText(parentMessage, { exact: true })).toBeVisible();

		const replyForm = admin.locator('form[action="?/reply"]');
		await replyForm.getByLabel(germanCatalog['messages.message']).fill(adminReply);
		await replyForm.getByLabel(germanCatalog['admin.messages.finalReply']).check();
		await replyForm
			.getByRole('button', { name: germanCatalog['admin.messages.reply'] })
			.click();
		await expect(admin.getByText(germanCatalog['admin.messages.replySaved'])).toBeVisible();
		await expect(
			admin.getByText(germanCatalog['messages.status.answered'], { exact: false })
		).toBeVisible();
		await expect(admin.getByText(adminReply, { exact: true })).toBeVisible();

		const parentRereadResponse = await parent.goto(parentThreadPath!);
		expect(parentRereadResponse?.status()).toBe(200);
		await expect(
			parent.getByText(germanCatalog['messages.status.answered'], { exact: false })
		).toBeVisible();
		await expect(parent.getByText(parentMessage, { exact: true })).toBeVisible();
		await expect(parent.getByText(adminReply, { exact: true })).toBeVisible();

		const emailOutboxResponse = await admin.goto(
			'/admin/outbox?channel=email&status=pending&q=support.admin_reply'
		);
		expect(emailOutboxResponse?.status()).toBe(200);
		const emailOutboxAdded = addedCardTexts(emailOutboxBefore, await outboxCardTexts(admin));
		expect(emailOutboxAdded).toHaveLength(1);
		expect(emailOutboxAdded[0]).toContain('support.admin_reply');
		expect(emailOutboxAdded[0]).toContain('email');
		expect(emailOutboxAdded[0]).toContain('pending');
		expect(emailOutboxAdded[0]).toContain('support_message');
		expect(emailOutboxAdded[0]).toContain(`${germanCatalog['admin.outbox.attempts']}: 0/5`);

		const telegramOutboxResponse = await admin.goto(
			'/admin/outbox?channel=telegram&status=pending&q=bureau.support'
		);
		expect(telegramOutboxResponse?.status()).toBe(200);
		const telegramOutboxAdded = addedCardTexts(
			telegramOutboxBefore,
			await outboxCardTexts(admin)
		);
		expect(telegramOutboxAdded).toHaveLength(1);
		expect(telegramOutboxAdded[0]).toContain('bureau.support');
		expect(telegramOutboxAdded[0]).toContain('telegram');
		expect(telegramOutboxAdded[0]).toContain('pending');
		expect(telegramOutboxAdded[0]).toContain('support_thread');
		expect(telegramOutboxAdded[0]).toContain(`${germanCatalog['admin.outbox.attempts']}: 0/5`);
	} finally {
		await closeContexts([parentContext, adminContext]);
	}
});

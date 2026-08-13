import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { formatMessage, germanCatalog } from '../../src/lib/i18n';
import { login, newE2eContext, syntheticIdentities } from './support/authenticated';

const enrollmentLabel = 'Synthetic Price Child · Synthetic E2E Price Studio';
const absenceReason = 'Synthetischer PR-A12-Terminkonflikt';
const parentMessage = 'Synthetische Abwesenheitsmitteilung ohne personenbezogene Daten.';
const adminReply = 'Die synthetische Abwesenheit wurde abschließend erfasst.';

function berlinCalendarDate(daysFromToday: number): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Berlin',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(new Date());
	const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
	const shifted = new Date(
		Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + daysFromToday)
	);
	return shifted.toISOString().slice(0, 10);
}

async function closeContexts(contexts: readonly BrowserContext[]): Promise<void> {
	await Promise.all(contexts.map((context) => context.close()));
}

async function outboxCards(page: Page, path: string): Promise<string[]> {
	const response = await page.goto(path);
	expect(response?.status()).toBe(200);
	return page.locator('article.admin-card').allInnerTexts();
}

function addedCard(before: readonly string[], after: readonly string[]): string {
	const existing = new Set(before);
	const added = after.filter((card) => !existing.has(card));
	expect(added).toHaveLength(1);
	return added[0];
}

test('persists a structured absence, final admin answer and queued outbox evidence', async ({
	browser,
}, testInfo) => {
	const parentContext = await newE2eContext(browser, testInfo);
	const adminContext = await newE2eContext(browser, testInfo);
	try {
		const parent = await parentContext.newPage();
		const admin = await adminContext.newPage();
		const absenceDate = berlinCalendarDate(1);
		const subject = formatMessage('de', 'absence.subject', { date: absenceDate });
		const telegramPath = '/admin/outbox?channel=telegram&status=pending&q=bureau.support';
		const emailPath = '/admin/outbox?channel=email&status=pending&q=support.admin_reply';

		await login(parent, syntheticIdentities.priceParent);
		await login(admin, syntheticIdentities.admin);
		const telegramBefore = await outboxCards(admin, `${telegramPath}&read=before`);
		const emailBefore = await outboxCards(admin, `${emailPath}&read=before`);

		const messagesResponse = await parent.goto('/messages?flow=absence');
		expect(messagesResponse?.status()).toBe(200);
		const absenceForm = parent.locator('form[action="?/absence"]');
		await absenceForm
			.getByLabel(germanCatalog['absence.enrollment'])
			.selectOption({ label: enrollmentLabel });
		await absenceForm.getByLabel(germanCatalog['absence.date']).fill(absenceDate);
		await absenceForm.getByLabel(germanCatalog['absence.reason']).fill(absenceReason);
		await absenceForm.getByLabel(germanCatalog['absence.message']).fill(parentMessage);
		await absenceForm.getByRole('button', { name: germanCatalog['absence.submit'] }).click();
		await expect(parent.getByText(germanCatalog['absence.created'])).toBeVisible();

		const parentThreadCard = parent
			.locator('article.activity-item')
			.filter({ hasText: subject });
		await expect(parentThreadCard).toHaveCount(1);
		await expect(parentThreadCard.locator('.item-kicker')).toContainText(
			germanCatalog['messages.category.absence']
		);
		await expect(parentThreadCard.locator('.item-kicker')).toContainText(
			germanCatalog['messages.status.waiting_for_admin']
		);
		const parentThreadPath = await parentThreadCard
			.getByRole('link', { name: germanCatalog['messages.open'] })
			.getAttribute('href');
		expect(parentThreadPath).toMatch(/^\/messages\/[0-9a-f-]{36}$/u);

		const createdRead = await parent.goto(`${parentThreadPath}?read=created`);
		expect(createdRead?.status()).toBe(200);
		await expect(
			parent.getByText(germanCatalog['messages.status.waiting_for_admin'], { exact: false })
		).toBeVisible();
		await expect(parent.locator('.message-body')).toContainText(absenceReason);
		await expect(parent.locator('.message-body')).toContainText(parentMessage);

		const adminQueueResponse = await admin.goto(
			`/admin/messages?kind=absence&status=waiting_for_admin&q=${encodeURIComponent(subject)}`
		);
		expect(adminQueueResponse?.status()).toBe(200);
		const adminThreadCard = admin.locator('article.admin-card').filter({ hasText: subject });
		await expect(adminThreadCard).toHaveCount(1);
		await expect(adminThreadCard.locator('.item-kicker')).toContainText(
			germanCatalog['messages.category.absence']
		);
		await adminThreadCard.getByRole('link', { name: germanCatalog['messages.open'] }).click();
		await expect(admin.locator('.message-body')).toContainText(absenceReason);
		await expect(admin.locator('.message-body')).toContainText(parentMessage);

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

		const answeredRead = await parent.goto(`${parentThreadPath}?read=answered`);
		expect(answeredRead?.status()).toBe(200);
		await expect(
			parent.getByText(germanCatalog['messages.status.answered'], { exact: false })
		).toBeVisible();
		await expect(parent.locator('.message-body')).toHaveCount(2);
		await expect(parent.locator('.message-body').first()).toContainText(parentMessage);
		await expect(parent.getByText(adminReply, { exact: true })).toBeVisible();

		const telegramAfter = await outboxCards(admin, `${telegramPath}&read=after`);
		const telegramCard = addedCard(telegramBefore, telegramAfter);
		expect(telegramCard).toContain('telegram · pending');
		expect(telegramCard).toContain('bureau.support');
		expect(telegramCard).toContain('absence_report');
		expect(telegramCard).toContain(`${germanCatalog['admin.outbox.attempts']}: 0/5`);

		const emailAfter = await outboxCards(admin, `${emailPath}&read=after`);
		const emailCard = addedCard(emailBefore, emailAfter);
		expect(emailCard).toContain('email · pending');
		expect(emailCard).toContain('support.admin_reply');
		expect(emailCard).toContain('support_message');
		expect(emailCard).toContain(`${germanCatalog['admin.outbox.attempts']}: 0/5`);
	} finally {
		await closeContexts([parentContext, adminContext]);
	}
});

import { formatCalendarDate } from '../../src/lib/i18n/locale';
import { expect, test, type APIResponse, type BrowserContext } from '@playwright/test';
import { formatMessage, germanCatalog } from '../../src/lib/i18n';
import { login, newE2eContext, syntheticIdentities } from './support/authenticated';

const courseName = 'Synthetic E2E Art Studio';
const parentAChild = 'Synthetic Child A';
const parentBChild = 'Synthetic Child B';
const courseId = 'e2e-trial-course';
const sessionId = 'e2e-trial-session';

function calendarDateAfter(days: number): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Berlin',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(new Date(Date.now() + days * 86_400_000));
	const value = (type: 'year' | 'month' | 'day') =>
		parts.find((part) => part.type === type)?.value;
	const year = value('year');
	const month = value('month');
	const day = value('day');
	if (!year || !month || !day) throw new Error('Berlin calendar date formatting failed.');
	return `${year}-${month}-${day}`;
}

async function closeContexts(contexts: readonly BrowserContext[]): Promise<void> {
	await Promise.all(contexts.map((context) => context.close()));
}

async function csrfToken(context: BrowserContext): Promise<string> {
	const cookie = (await context.cookies()).find((candidate) => candidate.name === 'kolibri_csrf');
	expect(cookie).toBeDefined();
	return cookie!.value;
}

async function expectSemanticActionFailure(response: APIResponse, message: string): Promise<void> {
	// Exact ActionFailure.status is covered at the route boundary; normal form POSTs
	// may serialize that failure into a rendered 2xx browser response.
	expect(response.status()).toBeLessThan(500);
	expect(await response.text()).toContain(message);
}

test('completes catalog quote and trial confirmation with owner/admin D1 re-reads', async ({
	browser,
}, testInfo) => {
	const parentContext = await newE2eContext(browser, testInfo);
	const adminContext = await newE2eContext(browser, testInfo);
	try {
		const parent = await parentContext.newPage();
		const admin = await adminContext.newPage();
		const requestedDate = calendarDateAfter(21);
		const confirmedDate = calendarDateAfter(28);
		const quotedPrice = formatMessage('de', 'catalog.price.perMonth', {
			amount: new Intl.NumberFormat('de-DE', {
				style: 'currency',
				currency: 'EUR',
			}).format(46),
		});

		await login(parent, syntheticIdentities.parentA);
		const catalogResponse = await parent.goto('/catalog');
		expect(catalogResponse?.status()).toBe(200);
		const catalogCard = parent.locator('article.catalog-card').filter({ hasText: courseName });
		await expect(catalogCard).toHaveCount(1);
		await expect(
			catalogCard.getByText(germanCatalog['catalog.availability.available'], { exact: true })
		).toBeVisible();
		await expect(catalogCard.getByText(quotedPrice, { exact: true })).toBeVisible();
		await expect(catalogCard).toContainText('Mittwoch 16:00');
		await expect(catalogCard).toContainText('90 Min.');

		await catalogCard.getByRole('link', { name: germanCatalog['catalog.cta.trial'], exact: true }).click();
		await expect(parent).toHaveURL(new RegExp(`/catalog/${courseId}/trial$`, 'u'));
		await expect(parent.getByRole('heading', { level: 2, name: courseName })).toBeVisible();
		await expect(parent.locator('option[value="e2e-child-b"]')).toHaveCount(0);

		const validCsrf = await csrfToken(parentContext);
		const foreignCreate = await parentContext.request.post(
			`/catalog/${courseId}/trial?/submit`,
			{
				form: {
					_csrf: validCsrf,
					childId: 'e2e-child-b',
					sessionId,
					requestedDate,
					idempotencyKey: 'e2e-foreign-trial-create',
				},
			}
		);
		await expectSemanticActionFailure(foreignCreate, germanCatalog['trial.rejected']);

		const foreignCancel = await parentContext.request.post('/cabinet?/cancelTrial', {
			form: {
				_csrf: validCsrf,
				trialId: 'e2e-trial-b',
				idempotencyKey: 'e2e-foreign-trial-cancel',
			},
		});
		await expectSemanticActionFailure(
			foreignCancel,
			germanCatalog['cabinet.trials.cancelFailed']
		);

		await parent.getByLabel(germanCatalog['trial.child'], { exact: true }).selectOption('e2e-child-a');
		await parent.getByLabel(germanCatalog['trial.session']).selectOption(sessionId);
		await parent.getByLabel(germanCatalog['trial.proposedDate']).fill(requestedDate);
		await parent.getByRole('button', { name: germanCatalog['trial.submit'] }).click();
		await expect(parent.getByText(germanCatalog['trial.submitted'])).toBeVisible();

		const parentRequestedRead = await parent.goto('/cabinet#trials');
		expect(parentRequestedRead?.status()).toBe(200);
		let parentTrial = parent
			.locator('#trials article.activity-item')
			.filter({ hasText: courseName })
			.filter({ hasText: parentAChild });
		await expect(parentTrial).toHaveCount(1);
		await expect(
			parentTrial.getByText(germanCatalog['admin.code.requested'], { exact: true })
		).toBeVisible();
		await expect(parentTrial).toContainText(formatCalendarDate('de', requestedDate));

		await login(admin, syntheticIdentities.admin);
		const adminQueueResponse = await admin.goto(
			`/admin/trials?q=${encodeURIComponent(courseName)}`
		);
		expect(adminQueueResponse?.status()).toBe(200);
		let parentATrial = admin
			.locator('article.admin-card')
			.filter({ hasText: courseName })
			.filter({ hasText: parentAChild });
		const parentBTrial = admin
			.locator('article.admin-card')
			.filter({ hasText: courseName })
			.filter({ hasText: parentBChild });
		await expect(parentATrial).toHaveCount(1);
		await expect(parentBTrial).toHaveCount(1);
		await expect(parentBTrial.locator('.item-kicker')).toContainText(
			germanCatalog['admin.code.requested']
		);
		await expect(parentBTrial).toContainText('2026-09-16');

		await parentATrial.getByLabel(germanCatalog['admin.decision']).selectOption('confirm');
		await parentATrial.getByLabel(germanCatalog['trial.session']).selectOption(sessionId);
		await parentATrial
			.getByLabel(germanCatalog['admin.trials.confirmedDate'])
			.fill(confirmedDate);
		await parentATrial
			.getByLabel(germanCatalog['admin.reason'])
			.fill('Synthetic browser confirmation after capacity review');
		await parentATrial.getByLabel(germanCatalog['admin.confirmAction']).check();
		await parentATrial.getByRole('button', { name: germanCatalog['admin.apply'] }).click();
		await expect(admin.getByText(germanCatalog['admin.action.completed'])).toBeVisible();
		parentATrial = admin
			.locator('article.admin-card')
			.filter({ hasText: courseName })
			.filter({ hasText: parentAChild });
		await expect(parentATrial.locator('.item-kicker')).toContainText(
			germanCatalog['admin.code.confirmed']
		);
		await expect(parentATrial).toContainText(confirmedDate);

		const ownerConfirmedRead = await parent.goto('/cabinet?read=confirmed#trials');
		expect(ownerConfirmedRead?.status()).toBe(200);
		parentTrial = parent
			.locator('#trials article.activity-item')
			.filter({ hasText: courseName })
			.filter({ hasText: parentAChild });
		await expect(
			parentTrial.getByText(germanCatalog['admin.code.confirmed'], { exact: true })
		).toBeVisible();
		await expect(parentTrial).toContainText(formatCalendarDate('de', confirmedDate));
		await parentTrial
			.getByRole('button', { name: germanCatalog['cabinet.trials.cancel'] })
			.click();
		await expect(parent.getByText(germanCatalog['cabinet.trials.cancelled'])).toBeVisible();
		parentTrial = parent
			.locator('#trials article.activity-item')
			.filter({ hasText: courseName })
			.filter({ hasText: parentAChild });
		await expect(
			parentTrial.getByText(germanCatalog['admin.code.cancelled'], { exact: true })
		).toBeVisible();
		await expect(
			parentTrial.getByRole('button', { name: germanCatalog['cabinet.trials.cancel'] })
		).toHaveCount(0);

		const adminTerminalRead = await admin.goto(
			`/admin/trials?q=${encodeURIComponent(parentAChild)}`
		);
		expect(adminTerminalRead?.status()).toBe(200);
		parentATrial = admin
			.locator('article.admin-card')
			.filter({ hasText: courseName })
			.filter({ hasText: parentAChild });
		await expect(parentATrial).toHaveCount(1);
		await expect(parentATrial.locator('.item-kicker')).toContainText(
			germanCatalog['admin.code.cancelled']
		);
		await expect(
			parentATrial.getByRole('button', { name: germanCatalog['admin.apply'] })
		).toHaveCount(0);

		const catalogAfterTrial = await parent.goto('/catalog');
		expect(catalogAfterTrial?.status()).toBe(200);
		const unchangedCatalogCard = parent
			.locator('article.catalog-card')
			.filter({ hasText: courseName });
		await expect(unchangedCatalogCard.getByText(quotedPrice, { exact: true })).toBeVisible();
		await expect(
			unchangedCatalogCard.getByText(germanCatalog['catalog.availability.available'], {
				exact: true,
			})
		).toBeVisible();
	} finally {
		await closeContexts([parentContext, adminContext]);
	}
});

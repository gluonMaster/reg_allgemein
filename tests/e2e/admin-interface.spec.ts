import { expect, test, type Page } from '@playwright/test';
import { germanCatalog as de } from '../../src/lib/i18n';
import { russianCatalog as ru } from '../../src/lib/i18n/ru';
import { login, newE2eContext, syntheticIdentities } from './support/authenticated';

async function inspect(page: Page, name: string) {
	for (const viewport of [
		{ width: 1366, height: 768 },
		{ width: 390, height: 844 },
	]) {
		await page.setViewportSize(viewport);
		await expect
			.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
			.toBe(true);
		await page.screenshot({
			path: `tmp/portal-ui-2026-09-15/04-${name}-${viewport.width}.png`,
			fullPage: true,
		});
	}
}

test('keeps all admin destinations, honest metrics and existing user filters accessible', async ({
	browser,
}, testInfo) => {
	test.setTimeout(90_000);
	const context = await newE2eContext(browser, testInfo);
	try {
		const page = await context.newPage();
		await login(page, syntheticIdentities.admin);
		const navigation = page.getByRole('navigation', { name: de['admin.navigationLabel'] });
		const expected = [
			'',
			'/imports',
			'/import-reconciliation',
			'/reviews',
			'/legacy',
			'/users',
			'/catalog',
			'/pricing',
			'/trials',
			'/requests',
			'/contracts',
			'/price-reviews',
			'/messages',
			'/outbox',
			'/privacy',
			'/operations',
		]
			.map((suffix) => `/admin${suffix}`)
			.sort();
		expect(
			(
				await navigation
					.locator('a')
					.evaluateAll((links) => links.map((link) => link.getAttribute('href')))
			).sort()
		).toEqual(expected);
		await expect(navigation.locator('[aria-current="page"]')).toHaveAttribute('href', '/admin');
		for (const locale of ['de', 'ru'] as const) {
			const text = locale === 'de' ? de : ru;
			await page.goto('/admin');
			if (locale === 'ru') {
				await page.getByRole('button', { name: 'Русский', exact: true }).click();
				await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
			}
			const count = page.getByText(text['admin.dashboard.blockedUsers'], { exact: true });
			await expect(count).toBeVisible();
			expect(await count.evaluate((element) => element.closest('a'))).toBeNull();
			await expect(
				page.getByRole('link', { name: text['admin.dashboard.blockedUsers'] })
			).toHaveCount(0);
			const allUsers = page.getByRole('link', {
				name: text['admin.dashboard.allUsers'],
				exact: true,
			});
			await expect(allUsers).toHaveAttribute('href', '/admin/users');
			await inspect(page, `overview-${locale}`);
			await allUsers.click();
			await expect(page).toHaveURL(/\/admin\/users$/);
			await expect(page.locator('#user-status')).toHaveValue('');
			await expect(page.locator('#user-q')).toHaveValue('');
			await expect(page.locator('.admin-nav [aria-current="page"]')).toHaveAttribute(
				'href',
				'/admin/users'
			);
			await page.locator('#user-q').fill('Synthetic');
			await page.locator('#user-status').selectOption('active');
			await page.getByRole('button', { name: text['admin.filter'], exact: true }).click();
			await expect(page.locator('#user-q')).toHaveValue('Synthetic');
			await expect(page.locator('#user-status')).toHaveValue('active');
			await inspect(page, `users-${locale}`);
		}
		await page.goto('/admin/users/e2e-parent-a');
		await expect(page.locator('.admin-nav [aria-current="page"]')).toHaveAttribute(
			'href',
			'/admin/users'
		);
	} finally {
		await context.close();
	}
});

test('opens every loaded mapping independently and keeps contract editor and tables usable', async ({
	browser,
}, testInfo) => {
	test.setTimeout(120_000);
	const context = await newE2eContext(browser, testInfo);
	try {
		const page = await context.newPage();
		await login(page, syntheticIdentities.admin);
		let businessPosts = 0;
		page.on('request', (request) => {
			if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/admin'))
				businessPosts++;
		});
		await page.goto('/admin/catalog');
		const queue = page
			.locator('details')
			.filter({ has: page.locator('summary', { hasText: de['admin.catalog.mappingQueue'] }) })
			.first();
		await expect(queue).not.toHaveAttribute('open');
		await expect(queue.locator(':scope > summary')).toContainText('(50)');
		await expect(page.locator('form[action="?/updateCourse"]').first()).not.toBeVisible();
		await inspect(page, 'catalog-de');
		const toggle = queue.locator(':scope > summary');
		await toggle.focus();
		await page.keyboard.press('Enter');
		await expect(queue).toHaveAttribute('open');
		const entries = queue.locator('form[action="?/decideMapping"]');
		await expect(entries).toHaveCount(50);
		const ids = await entries
			.locator('[name="legacyEnrollmentId"]')
			.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
		expect(new Set(ids).size).toBe(50);
		expect(ids.sort()).toEqual(
			Array.from({ length: 50 }, (_, i) => `e2e-admin-mapping-${i + 1}`).sort()
		);
		for (const index of [0, 1, 49]) {
			const entry = entries.nth(index).locator('..');
			await entry.locator(':scope > summary').focus();
			await page.keyboard.press('Enter');
			const form = entries.nth(index);
			await expect(form.getByLabel(de['admin.catalog.destinationCourse'])).toBeVisible();
			await page.keyboard.press('Tab');
			await expect(form.getByLabel(de['admin.catalog.destinationCourse'])).toBeFocused();
			await form
				.getByLabel(de['admin.reason'], { exact: true })
				.fill('Synthetic mapping review text');
			await expect(form.getByLabel(de['admin.confirmAction'])).not.toBeChecked();
			if (index === 0) {
				await form.scrollIntoViewIfNeeded();
				await inspect(page, 'mapping-de');
			}
			await entry.locator(':scope > summary').click();
		}
		await page.goto('/admin/catalog?q=Synthetic&status=published');
		await expect(page.locator('#catalog-q')).toHaveValue('Synthetic');
		await expect(page.locator('#catalog-status')).toHaveValue('published');
		const course = page.locator('article').filter({ hasText: 'Synthetic E2E Art Studio' });
		await course.getByText(de['admin.catalog.edit'], { exact: true }).click();
		await expect(course.getByLabel(de['admin.catalog.capacityOptional'])).toBeVisible();
		await inspect(page, 'course-de');
		for (const locale of ['de', 'ru'] as const) {
			const text = locale === 'de' ? de : ru;
			await page.goto('/admin/contracts');
			if (locale === 'ru') {
				await page.getByRole('button', { name: 'Русский', exact: true }).click();
				await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
			}
			await expect(
				page.getByText(text['admin.contracts.status.sent'], { exact: true }).first()
			).toBeVisible();
			await expect(
				page
					.getByText(
						`${text['admin.contracts.pdfStatus']}: ${text['admin.contracts.pdf.ready']}`,
						{ exact: true }
					)
					.first()
			).toBeVisible();
			await inspect(page, `contracts-${locale}`);
			const editor = page.locator('form[action="?/createDraft"]');
			await expect(editor).not.toBeVisible();
			await editor.locator('..').locator(':scope > summary').click();
			const json = editor.getByLabel(text['ui.renderInput']);
			await json.fill('{\n  "synthetic": true\n}');
			await inspect(page, `editor-${locale}`);
			await page.setViewportSize({ width: 1366, height: 768 });
			const dimensions = await json.boundingBox();
			expect(dimensions!.width).toBeGreaterThan(600);
			expect(dimensions!.height).toBeGreaterThan(250);
			await page.goto('/admin/contracts?q=no-synthetic-match');
			await expect(page.getByText(text['admin.contracts.emptyOffers'])).toBeVisible();
			await inspect(page, `contracts-empty-${locale}`);
			await page.goto('/admin/pricing');
			await inspect(page, `pricing-${locale}`);
			const table = page.getByRole('region', {
				name: text['admin.pricing.rules'],
				exact: true,
			});
			await table.focus();
			await expect(table).toBeFocused();
			await page.keyboard.press('ArrowRight');
			await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
		}
		expect(businessPosts).toBe(0);
		// Invalid JSON is rejected before draft creation; edits stay available for correction.
		await page.goto('/admin/contracts');
		const rejectedEditor = page.locator('form[action="?/createDraft"]');
		await rejectedEditor.locator('..').locator(':scope > summary').click();
		for (const name of ['userId', 'childId', 'academicPeriodId', 'templateVersionId']) {
			await rejectedEditor.locator(`[name="${name}"]`).fill(`synthetic-invalid-${name}`);
		}
		await rejectedEditor.locator('[name="expiresAt"]').fill('2026-10-01T18:00:00+02:00');
		await rejectedEditor.locator('[name="renderInput"]').fill('{');
		const retryKey = await rejectedEditor.locator('[name="idempotencyKey"]').inputValue();
		await rejectedEditor
			.getByRole('button', { name: ru['admin.contracts.create'], exact: true })
			.click();
		await expect(page.getByRole('alert')).toContainText(ru['admin.contracts.failed']);
		await expect(rejectedEditor.locator('[name="renderInput"]')).toBeVisible();
		await expect(rejectedEditor.locator('[name="renderInput"]')).toHaveValue('{');
		await expect(rejectedEditor.locator('[name="idempotencyKey"]')).toHaveValue(retryKey);
		await expect(rejectedEditor).toHaveAttribute('aria-describedby', 'contract-feedback');
	} finally {
		await context.close();
	}
	const parent = await newE2eContext(browser, testInfo);
	try {
		const page = await parent.newPage();
		await login(page, syntheticIdentities.cabinetParent);
		await inspect(page, 'parent-regression-de');
	} finally {
		await parent.close();
	}
});

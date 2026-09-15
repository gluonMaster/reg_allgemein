import { expect, test, type Page } from '@playwright/test';
import { germanCatalog, type MessageKey } from '../../src/lib/i18n';
import { russianCatalog } from '../../src/lib/i18n/ru';
import { UI_LOCALE_COOKIE } from '../../src/lib/i18n/locale';
import { login, newE2eContext, syntheticIdentities } from './support/authenticated';
import { installSyntheticTurnstile } from './support/turnstile';

async function russian(page: Page) {
	await expect(page.locator('.language-switcher')).toHaveAttribute('data-enhanced', 'true');
	await page.getByRole('button', { name: 'Русский', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Русский', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
}

test('switches public UI, keeps preference through navigation and translates server errors', async ({
	page,
}) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(germanCatalog['home.title']);
	await russian(page);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(russianCatalog['home.title']);
	await expect(page).toHaveTitle(russianCatalog['home.title']);
	await page.getByRole('link', { name: russianCatalog['home.catalogLink'] }).first().click();
	await expect(page).toHaveTitle(russianCatalog['catalog.title']);
	await expect(page.locator('.catalog-grid')).toContainText('Среда 16:00');
	await page.getByRole('link', { name: russianCatalog['auth.link.login'], exact: true }).click();
	await page.getByLabel(russianCatalog['auth.emailLabel']).fill('language-test@e2e.invalid');
	await page.getByLabel(russianCatalog['auth.passwordLabel']).fill('invalid-synthetic-password');
	await page
		.getByRole('button', { name: russianCatalog['auth.login.submit'], exact: true })
		.click();
	await expect(page.getByRole('alert')).toHaveText(russianCatalog['auth.invalidCredentials']);
	await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveText(germanCatalog['auth.invalidCredentials']);
	await russian(page);
	await page.reload();
	await expect(page).toHaveTitle(russianCatalog['auth.login.title']);
	await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
	await expect(page).toHaveTitle(germanCatalog['auth.login.title']);
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});

test('renders Russian on the server without JavaScript and isolates another browser preference', async ({
	browser,
}, testInfo) => {
	const context = await browser.newContext({
		baseURL: testInfo.project.use.baseURL,
		javaScriptEnabled: false,
	});
	const other = await newE2eContext(browser, testInfo);
	try {
		const page = await context.newPage();
		await page.goto('/auth/login');
		await page.getByRole('button', { name: 'Русский', exact: true }).click();
		await expect(page).toHaveURL(/\/auth\/login$/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
		await expect(page.getByRole('heading')).toHaveText(russianCatalog['auth.login.title']);
		const [ru, de] = await Promise.all([
			context.request.get('/catalog'),
			other.request.get('/catalog'),
		]);
		expect(await ru.text()).toContain('<html lang="ru">');
		expect(await de.text()).toContain('<html lang="de">');
		expect(ru.headers().vary).toContain('Cookie');
		expect(
			(await context.cookies()).filter((cookie) => cookie.name === UI_LOCALE_COOKIE)
		).toHaveLength(1);
	} finally {
		await context.close();
		await other.close();
	}
});

test('keeps entered registration data, localizes mobile UI and retains German consent', async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await installSyntheticTurnstile(page);
	await page.goto('/auth/register');
	await page.getByLabel(germanCatalog['auth.firstNameLabel']).fill('Synthetic');
	await page.getByLabel(germanCatalog['auth.lastNameLabel']).fill('Language');
	await russian(page);
	await expect(page.getByLabel(russianCatalog['auth.firstNameLabel'])).toHaveValue('Synthetic');
	await expect(page.getByLabel(russianCatalog['auth.lastNameLabel'])).toHaveValue('Language');
	await expect(
		page.getByText(germanCatalog['auth.privacyAcceptance'], { exact: true })
	).toHaveAttribute('lang', 'de');
	await expect(
		page.getByText(russianCatalog['auth.privacyAcceptance'], { exact: true })
	).toHaveAttribute('lang', 'ru');
	await expect(page.locator('[data-turnstile-state="ready"]')).toHaveCount(1);
	await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveCount(1);
	await expect(
		page.getByRole('button', { name: russianCatalog['auth.register.submit'], exact: true })
	).toBeEnabled();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth + 1
	);
	expect(overflow).toBe(false);
	await page.screenshot({
		path: testInfo.outputPath('russian-registration-mobile.png'),
		fullPage: true,
	});
});

test('localizes parent pages, persisted read models and access errors without changing contracts', async ({
	browser,
}, testInfo) => {
	const context = await newE2eContext(browser, testInfo);
	try {
		const page = await context.newPage();
		await login(page, syntheticIdentities.parentB);
		await russian(page);
		await expect(page).toHaveTitle(russianCatalog['cabinet.title']);
		await expect(page.locator('#requests')).toContainText('Индивидуальные занятия');
		await expect(page.locator('#requests')).toContainText('45 мин.');
		for (const [route, key] of [
			['/requests/new?kind=individual', 'request.new.title'],
			['/requests/e2e-request-b', 'request.detail.title'],
			['/catalog/e2e-trial-course/trial', 'trial.title'],
			['/messages', 'messages.title'],
			['/messages/e2e-message-b', 'messages.detail'],
			['/account/security', 'auth.security.title'],
			['/account/privacy', 'privacy.title'],
			['/price-reviews/e2e-price-review-b', 'priceReviews.detail.title'],
			['/contracts/e2e-contract-offer-b', 'contract.detail.title'],
		] as const) {
			const response = await page.goto(route);
			expect(response?.status(), route).toBe(200);
			await expect(page).toHaveTitle(russianCatalog[key]);
			await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
		}
		await expect(
			page.getByRole('link', { name: russianCatalog['contract.artifact.offer_pdf'] })
		).toBeVisible();
		await expect(
			page.getByText(germanCatalog['contract.acceptance.payableText'], { exact: true })
		).toHaveAttribute('lang', 'de');
		await expect(
			page.getByText(russianCatalog['contract.acceptance.payableText'], { exact: true })
		).toHaveAttribute('lang', 'ru');
		const denied = await page.goto('/admin');
		expect(denied?.status()).toBe(403);
		await expect(page.getByRole('alert')).toContainText(russianCatalog['ui.access.forbidden']);
		await expect(page.getByRole('button', { name: 'Русский', exact: true })).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
		await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText(germanCatalog['ui.access.forbidden']);
	} finally {
		await context.close();
	}
});

test('localizes every admin section, operational labels and formerly inline controls', async ({
	browser,
}, testInfo) => {
	const context = await newE2eContext(browser, testInfo);
	try {
		const page = await context.newPage();
		await login(page, syntheticIdentities.admin);
		await russian(page);
		const sections = [
			['/admin', 'admin.title'],
			['/admin/imports', 'admin.imports.title'],
			['/admin/import-reconciliation', 'ui.reconciliation.title'],
			['/admin/reviews', 'admin.reviews.title'],
			['/admin/legacy', 'admin.legacy.title'],
			['/admin/users', 'admin.users.title'],
			['/admin/catalog', 'admin.catalog.title'],
			['/admin/trials', 'admin.trials.title'],
			['/admin/requests', 'admin.requests.title'],
			['/admin/contracts', 'admin.contracts.title'],
			['/admin/price-reviews', 'admin.priceReviews.title'],
			['/admin/messages', 'admin.messages.title'],
			['/admin/outbox', 'admin.outbox.title'],
			['/admin/privacy', 'admin.privacy.title'],
			['/admin/pricing', 'admin.pricing.title'],
			['/admin/operations', 'admin.operations.title'],
		] as const satisfies ReadonlyArray<readonly [string, MessageKey]>;
		for (const [route, key] of sections) {
			expect((await page.goto(route))?.status(), route).toBe(200);
			await expect(
				page.getByRole('heading', { name: russianCatalog[key], exact: true }).first()
			).toBeVisible();
			await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
		}
		await expect(page.locator('option[value="email_outbox"]')).toHaveText('Отправка писем');
		await page.goto('/admin/import-reconciliation');
		await expect(
			page.getByRole('button', {
				name: russianCatalog['ui.reconciliation.applyBatch'],
				exact: true,
			})
		).toBeVisible();
		await page.screenshot({
			path: testInfo.outputPath('russian-admin-reconciliation.png'),
			fullPage: true,
		});
		await page.goto('/admin/outbox');
		await expect(page.locator('select[name="status"] option[value="delivery_unknown"]')).toHaveText(
			'Результат доставки неизвестен'
		);
	} finally {
		await context.close();
	}
});

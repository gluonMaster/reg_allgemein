import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { germanCatalog } from '../../src/lib/i18n';
import { installSyntheticTurnstile } from './support/turnstile';
import { e2eOrigin, login, syntheticIdentities } from './support/authenticated';

const mobileViewport = { width: 390, height: 844 } as const;
const twoHundredPercentZoomEquivalentViewport = { width: 640, height: 720 } as const;

async function expectAccessibleStructure(page: Page): Promise<void> {
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(page.getByRole('main')).toHaveCount(1);
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
}

async function expectVisibleKeyboardFocus(target: Locator): Promise<void> {
	await expect(target).toBeFocused();
	const indicator = await target.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			boxShadow: style.boxShadow,
			outlineStyle: style.outlineStyle,
			outlineWidth: Number.parseFloat(style.outlineWidth),
		};
	});
	expect(
		(indicator.outlineStyle !== 'none' && indicator.outlineWidth > 0) ||
			indicator.boxShadow !== 'none'
	).toBe(true);
}

async function tabThroughLanguageSwitcher(page: Page): Promise<void> {
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('Tab');
	await expectVisibleKeyboardFocus(page.getByRole('link', { name: germanCatalog['home.title'], exact: true }));
	await page.keyboard.press('Tab');
	await expectVisibleKeyboardFocus(page.getByRole('button', { name: 'Deutsch', exact: true }));
	await page.keyboard.press('Tab');
	await expectVisibleKeyboardFocus(page.getByRole('button', { name: 'Русский', exact: true }));
	await page.keyboard.press('Tab');
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
	const dimensions = await page.evaluate(() => ({
		bodyScrollWidth: document.body.scrollWidth,
		documentClientWidth: document.documentElement.clientWidth,
		documentScrollWidth: document.documentElement.scrollWidth,
		viewportWidth: window.innerWidth,
	}));
	expect(dimensions.documentClientWidth).toBe(dimensions.viewportWidth);
	expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.documentClientWidth);
	expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.documentClientWidth);
}

async function expectGermanTextRendered(target: Locator): Promise<void> {
	await expect(target).toBeVisible();
	const rendering = await target.evaluate((element) => {
		const text = element.textContent?.trim() ?? '';
		const style = getComputedStyle(element);
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas text measurement is unavailable.');
		context.font = `${style.fontSize} ${style.fontFamily}`;
		return {
			fontFamily: style.fontFamily,
			rect: element.getBoundingClientRect().toJSON(),
			shapedWidth: context.measureText(text).width,
			text,
		};
	});
	expect(rendering.text).toMatch(/[ÄÖÜäöüß]/u);
	expect(rendering.text).not.toContain('\uFFFD');
	expect(rendering.fontFamily.length).toBeGreaterThan(0);
	expect(rendering.rect.width).toBeGreaterThan(0);
	expect(rendering.rect.height).toBeGreaterThan(0);
	expect(rendering.shapedWidth).toBeGreaterThan(0);
}

async function expectNoAutomatedAxeFindings(page: Page): Promise<void> {
	// No rules or page regions are disabled: axe runs every rule enabled by default.
	// The separate manual review remains mandatory even when both automated collections are empty.
	const results = await new AxeBuilder({ page }).analyze();
	const summarize = (findings: typeof results.violations) =>
		findings.map((finding) => ({
			help: finding.help,
			helpUrl: finding.helpUrl,
			id: finding.id,
			impact: finding.impact,
			targets: finding.nodes.map((node) => node.target),
		}));

	expect(summarize(results.violations), `axe violations for ${page.url()}`).toEqual([]);
	expect(summarize(results.incomplete), `axe incomplete findings for ${page.url()}`).toEqual([]);
}

test.describe('representative German accessibility paths', () => {
	test('checks public labels, keyboard order and 200%-zoom-equivalent reflow', async ({
		page,
	}) => {
		// A 1280 CSS-pixel desktop viewport reduced to 640 CSS pixels is the layout
		// viewport equivalent used here for a deterministic 200% browser-zoom reflow check.
		await page.setViewportSize(twoHundredPercentZoomEquivalentViewport);
		await installSyntheticTurnstile(page);
		const response = await page.goto('/auth/register');
		expect(response?.status()).toBe(200);
		await expectAccessibleStructure(page);
		await expectNoHorizontalOverflow(page);

		const firstName = page.getByLabel(germanCatalog['auth.firstNameLabel']);
		await expect(firstName).toBeVisible();
		await expect(page.getByLabel(germanCatalog['auth.lastNameLabel'])).toBeVisible();
		await expect(page.getByLabel(germanCatalog['auth.emailLabel'])).toBeVisible();
		await expect(page.getByLabel(germanCatalog['auth.passwordLabel'])).toBeVisible();
		const privacyAcceptance = page.getByLabel(germanCatalog['auth.privacyAcceptance']);
		await expect(privacyAcceptance).toBeVisible();
		await expectGermanTextRendered(page.getByText(germanCatalog['auth.privacyAcceptance']));

		await tabThroughLanguageSwitcher(page);
		await expectVisibleKeyboardFocus(
			page.getByRole('link', { name: germanCatalog['ui.nav.catalog'], exact: true })
		);
		await page.keyboard.press('Tab');
		await expectVisibleKeyboardFocus(page.getByRole('link', { name: germanCatalog['auth.link.login'], exact: true }));
		await page.keyboard.press('Tab');
		await expectVisibleKeyboardFocus(page.getByRole('link', { name: germanCatalog['auth.link.register'], exact: true }));
		await page.keyboard.press('Tab');
		await expectVisibleKeyboardFocus(firstName);

		await expectNoAutomatedAxeFindings(page);
	});

	test('associates, announces and focuses the inline login error', async ({ page }) => {
		await page.goto('/auth/login');
		const email = page.getByLabel(germanCatalog['auth.emailLabel']);
		const password = page.getByLabel(germanCatalog['auth.passwordLabel']);
		await email.fill('missing-user@e2e.invalid');
		await password.fill('Synthetic-Wrong-Password-2026!');
		const responsePromise = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				new URL(response.url()).pathname === '/auth/login'
		);
		await page.getByRole('button', { name: germanCatalog['auth.login.submit'] }).click();
		const response = await responsePromise;
		expect(response.status()).toBe(400);

		const error = page.getByRole('alert');
		await expect(error).toHaveText(germanCatalog['auth.invalidCredentials']);
		await expect(error).toHaveAttribute('aria-live', 'assertive');
		await expect(error).toHaveAttribute('aria-atomic', 'true');
		for (const field of [email, password]) {
			await expect(field).toHaveAttribute('aria-invalid', 'true');
			await expect(field).toHaveAttribute('aria-describedby', 'login-error');
			await expect(field).toHaveAttribute('aria-errormessage', 'login-error');
		}
		await expect(email).toBeFocused();
		await expectGermanTextRendered(error);
		await expectNoAutomatedAxeFindings(page);
	});

	test('checks the authenticated parent cabinet and child form', async ({
		browser,
	}, testInfo) => {
		const context = await browser.newContext({
			baseURL: e2eOrigin(testInfo),
			viewport: mobileViewport,
		});
		try {
			const page = await context.newPage();
			await login(page, syntheticIdentities.parentA);
			await expectAccessibleStructure(page);
			await expectNoHorizontalOverflow(page);
			await page.locator('#children .child-item summary').first().click();
			const fullName = page
				.getByRole('textbox', { name: germanCatalog['cabinet.child.fullName'] })
				.first();
			await expect(fullName).toBeVisible();
			await expect(
				page.getByLabel(germanCatalog['cabinet.child.birthDate']).first()
			).toBeVisible();
			await expect(
				page.getByLabel(germanCatalog['cabinet.child.confirmDuplicate']).first()
			).toHaveCount(0);
			await expectGermanTextRendered(
				page.getByText(germanCatalog['cabinet.child.fullName']).first()
			);

			const disclosure = page.locator('#children .child-item summary').first();
			await fullName.focus();
			await page.keyboard.press('Shift+Tab');
			await expectVisibleKeyboardFocus(disclosure);
			await page.keyboard.press('Enter');
			await expect(fullName).not.toBeVisible();
			await page.keyboard.press('Enter');
			await page.keyboard.press('Tab');
			await expectVisibleKeyboardFocus(fullName);

			await expectNoAutomatedAxeFindings(page);
		} finally {
			await context.close();
		}
	});

	test('checks the authenticated admin detail form and navigation', async ({
		browser,
	}, testInfo) => {
		const context = await browser.newContext({
			baseURL: e2eOrigin(testInfo),
			viewport: mobileViewport,
		});
		try {
			const page = await context.newPage();
			await login(page, syntheticIdentities.admin);
			const response = await page.goto('/admin/users/e2e-parent-a');
			expect(response?.status()).toBe(200);
			await expectAccessibleStructure(page);
			await expectNoHorizontalOverflow(page);
			await expect(page.getByLabel(germanCatalog['admin.reason']).first()).toBeVisible();
			await expect(page.getByLabel(germanCatalog['admin.confirmAction'])).toBeVisible();
			await expect(
				page.getByRole('group', { name: germanCatalog['admin.family.destination'] })
			).toBeVisible();
			await expectGermanTextRendered(page.getByText(germanCatalog['admin.reason']).first());

			await page.getByRole('link', { name: germanCatalog['admin.accountSecurity'] }).focus();
			await page.keyboard.press('Tab');
			await expectVisibleKeyboardFocus(page.locator('.admin-nav a[href="/admin"]'));
			await page.keyboard.press('Tab');
			const familyGroup = page.locator('.admin-nav summary').filter({
				hasText: germanCatalog['admin.group.families'],
			});
			await expectVisibleKeyboardFocus(familyGroup);
			await page.keyboard.press('Enter');
			await expect(page.locator('.admin-nav a[href="/admin/users"]')).not.toBeVisible();
			await page.keyboard.press('Enter');
			await page.keyboard.press('Tab');
			await expectVisibleKeyboardFocus(page.locator('.admin-nav a[href="/admin/reviews"]'));
			await expect(page.locator('.admin-nav [aria-current="page"]')).toHaveAttribute('href', '/admin/users');

			await expectNoAutomatedAxeFindings(page);
		} finally {
			await context.close();
		}
	});
});

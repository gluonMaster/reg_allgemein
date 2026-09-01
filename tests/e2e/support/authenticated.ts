import {
	expect,
	type Browser,
	type BrowserContext,
	type Page,
	type TestInfo,
} from '@playwright/test';
import { germanCatalog } from '../../../src/lib/i18n';

export const syntheticPassword = 'Synthetic-E2E-Password-2026!';

export const syntheticIdentities = {
	parentA: { email: 'parent-a@e2e.invalid', destination: '/cabinet' },
	parentB: { email: 'parent-b@e2e.invalid', destination: '/cabinet' },
	priceParent: { email: 'price-parent@e2e.invalid', destination: '/cabinet' },
	admin: { email: 'admin@e2e.invalid', destination: '/admin' },
} as const;

export function e2eOrigin(testInfo: TestInfo): string {
	const origin = testInfo.project.use.baseURL;
	if (typeof origin !== 'string')
		throw new Error('Playwright baseURL is required for E2E tests.');
	return origin;
}

export function newE2eContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
	const origin = e2eOrigin(testInfo);
	return browser.newContext({ baseURL: origin, extraHTTPHeaders: { origin } });
}

export async function login(
	page: Page,
	identity: (typeof syntheticIdentities)[keyof typeof syntheticIdentities]
): Promise<void> {
	const loginResponse = await page.goto('/auth/login');
	expect(loginResponse?.status()).toBe(200);
	await page.getByLabel(germanCatalog['auth.emailLabel']).fill(identity.email);
	await page.getByLabel(germanCatalog['auth.passwordLabel']).fill(syntheticPassword);
	await Promise.all([
		page.waitForURL((url) => url.pathname === identity.destination),
		page.getByRole('button', { name: germanCatalog['auth.login.submit'] }).click(),
	]);
}

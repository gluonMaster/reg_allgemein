import { expect, test } from '@playwright/test';
import { germanCatalog } from '../../src/lib/i18n';
import { installSyntheticTurnstile } from './support/turnstile';

const syntheticRegistration = {
	firstName: 'Synthetic',
	lastName: 'Browser',
	email: 'synthetic-browser-registration@example.test',
	password: 'synthetic-password-123',
};

async function fillRegistrationForm(page: Parameters<typeof installSyntheticTurnstile>[0]) {
	await page
		.getByLabel(germanCatalog['auth.firstNameLabel'])
		.fill(syntheticRegistration.firstName);
	await page.getByLabel(germanCatalog['auth.lastNameLabel']).fill(syntheticRegistration.lastName);
	await page.getByLabel(germanCatalog['auth.emailLabel']).fill(syntheticRegistration.email);
	await page.getByLabel(germanCatalog['auth.passwordLabel']).fill(syntheticRegistration.password);
	await page.getByLabel(germanCatalog['auth.privacyAcceptance']).check();
}

test('retains safe registration fields when Turnstile has no submission token', async ({
	page,
}) => {
	await installSyntheticTurnstile(page, 'pending');
	await page.goto('/auth/register');
	await fillRegistrationForm(page);

	const submit = page.getByRole('button', { name: germanCatalog['auth.register.submit'] });
	await expect(submit).toBeDisabled();
	await Promise.all([
		page.waitForNavigation(),
		page.locator('form').evaluate((form) => (form as HTMLFormElement).submit()),
	]);

	await expect(page.getByRole('alert').first()).toHaveText(
		germanCatalog['auth.turnstileRequired']
	);
	await expect(page.getByLabel(germanCatalog['auth.firstNameLabel'])).toHaveValue(
		syntheticRegistration.firstName
	);
	await expect(page.getByLabel(germanCatalog['auth.lastNameLabel'])).toHaveValue(
		syntheticRegistration.lastName
	);
	await expect(page.getByLabel(germanCatalog['auth.emailLabel'])).toHaveValue(
		syntheticRegistration.email
	);
	await expect(page.getByLabel(germanCatalog['auth.passwordLabel'])).toHaveValue('');
	await expect(page.getByLabel(germanCatalog['auth.privacyAcceptance'])).toBeChecked();
	await expect(page.locator('input[name="privacyNoticeVersion"]')).not.toHaveValue('');
	await expect(submit).toBeDisabled();
	expect(await page.content()).not.toContain(syntheticRegistration.password);
});

test('submits registration only after Turnstile reports a token', async ({ page }) => {
	await installSyntheticTurnstile(page);
	await page.goto('/auth/register');

	const submit = page.getByRole('button', { name: germanCatalog['auth.register.submit'] });
	await expect(page.locator('[data-turnstile-state="ready"]')).toHaveCount(1);
	await expect(submit).toBeEnabled();
	await fillRegistrationForm(page);
	await submit.click();

	await expect(page.getByRole('alert').first()).toHaveText(
		germanCatalog['auth.registrationAccepted']
	);
});

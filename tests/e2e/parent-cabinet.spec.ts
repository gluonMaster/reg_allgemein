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
		await page.evaluate(() => window.scrollTo(0, 0));
		expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
			false
		);
		await page.screenshot({
			path: `tmp/portal-ui-2026-09-15/02-${name}-${viewport.width}.png`,
		});
	}
}

test('keeps an empty cabinet compact and preserves create/edit errors and duplicate decisions', async ({
	browser,
}, testInfo) => {
	test.setTimeout(90_000);
	const context = await newE2eContext(browser, testInfo);
	try {
		const page = await context.newPage();
		await login(page, syntheticIdentities.cabinetParent);
		await expect(page.locator('#attention')).toHaveCount(0);
		await expect(page.locator('#children')).toContainText(de['cabinet.children.empty']);
		await expect(page.locator('#children input[name="fullName"]')).not.toBeVisible();
		await inspect(page, 'empty-de');
		await page.locator('a[href="#add-child"]').click();
		const create = page.locator('#add-child form');
		await expect(create).toBeVisible();
		await expect(page.locator('#children .child-item')).toHaveCount(0);
		await create.locator('[name="fullName"]').fill('   ');
		await create.locator('[name="birthDate"]').fill('2015-01-10');
		await create.getByRole('button').click();
		await expect(create.getByRole('alert')).toHaveText(de['cabinet.child.rejected']);
		await expect(create.locator('[name="fullName"]')).toHaveValue('   ');
		await expect(create.locator('[name="birthDate"]')).toHaveValue('2015-01-10');
		await create.locator('[name="fullName"]').fill('Synthetic Cabinet Child');
		await create.getByRole('button').click();
		await expect(page.locator('#children .child-item')).toHaveCount(1);
		await expect(create).not.toBeVisible();
		await page.locator('#add-child summary').click();
		await create.locator('[name="fullName"]').fill('Synthetic Cabinet Child');
		await create.locator('[name="birthDate"]').fill('2015-01-10');
		await expect(create.locator('[name="confirmDuplicate"]')).toHaveCount(0);
		await create.getByRole('button').click();
		await expect(create.getByRole('alert')).toHaveText(de['cabinet.child.duplicateWarning']);
		await expect(create.locator('[name="fullName"]')).toHaveValue('Synthetic Cabinet Child');
		await expect(create.locator('[name="confirmDuplicate"]')).not.toBeChecked();
		await create.scrollIntoViewIfNeeded();
		await page.screenshot({ path: 'tmp/portal-ui-2026-09-15/02-duplicate-de-390.png' });
		await create.locator('[name="confirmDuplicate"]').check();
		await create.getByRole('button').click();
		await expect(page.locator('#children .child-item')).toHaveCount(2);
		const child = page.locator('#children .child-item').first();
		await child.locator('summary').focus();
		await page.keyboard.press('Enter');
		const edit = child.locator('form');
		await edit.locator('[name="fullName"]').fill('   ');
		await edit.getByRole('button').click();
		await expect(edit.getByRole('alert')).toHaveText(de['cabinet.child.rejected']);
		await expect(edit.locator('[name="fullName"]')).toHaveValue('   ');
		await expect(create).not.toBeVisible();
		await edit.locator('[name="fullName"]').fill('Synthetic Cabinet Child');
		await edit.getByRole('button').click();
		await expect(edit.getByRole('alert')).toHaveText(de['cabinet.child.duplicateWarning']);
		await edit.locator('[name="fullName"]').fill('Synthetic Edited Child');
		await edit.getByRole('button').click();
		await expect(page.locator('#children')).toContainText('Synthetic Edited Child');
		await expect(page.locator('#children')).not.toContainText(
			de['cabinet.child.duplicateWarning']
		);
	} finally {
		await context.close();
	}
});

test('shows real pending actions before forms and preserves legacy correction in DE/RU', async ({
	browser,
}, testInfo) => {
	test.setTimeout(90_000);
	const context = await newE2eContext(browser, testInfo);
	try {
		const page = await context.newPage();
		await login(page, syntheticIdentities.parentB);
		await page.setViewportSize({ width: 1366, height: 768 });
		await expect(page.locator('#attention')).toBeInViewport();
		await expect(
			page.locator('#attention a[href="/contracts/e2e-contract-offer-b"]')
		).toBeVisible();
		await expect(page.locator('#attention a[href="/requests/e2e-request-b"]')).toHaveCount(0);
		await expect(page.locator('#children input[name="fullName"]').first()).not.toBeVisible();
		await expect(page.locator('#contract-history')).not.toHaveAttribute('open', '');
		await inspect(page, 'populated-de');
		await page.getByRole('button', { name: 'Русский', exact: true }).click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
		await expect(page.locator('#attention')).toContainText(ru['cabinet.attention.title']);
		await inspect(page, 'populated-ru');
		const legacy = page
			.locator('#children .child-item')
			.filter({
				has: page.getByRole('heading', { name: 'Synthetic Legacy Child', exact: true }),
			});
		await expect(legacy).toContainText(ru['cabinet.child.legacy']);
		await legacy.locator('summary').click();
		await expect(legacy.locator('form')).toHaveAttribute('action', '?/requestCorrection');
		await expect(legacy.locator('[name="confirmDuplicate"]')).toHaveCount(0);
		await legacy.locator('[name="fullName"]').fill('   ');
		await legacy.getByRole('button').click();
		await expect(legacy.getByRole('alert')).toHaveText(ru['cabinet.child.rejected']);
		await expect(legacy.locator('[name="fullName"]')).toHaveValue('   ');
		await legacy.locator('[name="fullName"]').fill('Synthetic Corrected Legacy');
		await legacy.locator('[name="birthDate"]').fill('2015-02-11');
		await legacy.getByRole('button').click();
		await expect(legacy).toContainText(ru['cabinet.child.correctionPending']);
		await expect(legacy.getByRole('heading')).toHaveText('Synthetic Legacy Child');
		await legacy.locator('summary').click();
		await expect(legacy.getByRole('button')).toBeDisabled();
		await legacy.scrollIntoViewIfNeeded();
		await page.screenshot({ path: 'tmp/portal-ui-2026-09-15/02-legacy-ru-390.png' });
		await page.locator('#contract-history summary').click();
		await expect(page.locator('#contract-history a').first()).toBeVisible();
		await page.locator('#profile summary').click();
		await expect(page.locator('#profile dl')).toBeVisible();
	} finally {
		await context.close();
	}
});

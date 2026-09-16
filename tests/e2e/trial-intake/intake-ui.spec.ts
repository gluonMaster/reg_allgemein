import { expect, test, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import fixture from '../../fixtures/trial-intake/catalog-v1.json' with { type: 'json' };
import { nextLessonDate } from '../../../src/lib/trial-intake/dates';
import { ORGANIZATION_NAME } from '../../../src/lib/organization';
import { newE2eContext, syntheticIdentities, syntheticPassword } from '../support/authenticated';
import { installSyntheticTurnstile } from '../support/turnstile';
import { createOutboxRuntime } from '../../../src/lib/server/outbox/runtime';
import { loadRuntimeConfig } from '../../../src/lib/server/config/runtime';
import {
	FakeTelegramProvider,
	TelegramProviderError,
} from '../../../src/lib/server/outbox/providers';

test.skip(process.env.KOLIBRI_E2E_TRIAL_INTAKE !== '1', 'Isolated intake harness required.');

async function noOverflow(page: Page) {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
	).toBe(true);
}

test('mobile DE/RU multi-child request, retry, resend, verification and admin recovery/status/filter flow', async ({
	browser,
}, testInfo) => {
	test.setTimeout(process.env.KOLIBRI_TRIAL_INTAKE_INSPECT === '1' ? 0 : 120_000);
	const root = process.env.KOLIBRI_E2E_RUNTIME_ROOT!;
	const proxy = await getPlatformProxy<{ DB: D1Database }>({
		configPath: 'wrangler.e2e.toml',
		envFiles: [join(root, 'runtime.env')],
		persist: { path: join(root, 'state', 'v3') },
		remoteBindings: false,
	});
	const db = proxy.env.DB;
	const context = await newE2eContext(browser, testInfo);
	context.setDefaultTimeout(15_000);
	const verificationToken = async (id: string) => {
		const row = await db
			.prepare(
				'SELECT id,email,verification_version,verification_nonce FROM trial_intake_requests WHERE id=?'
			)
			.bind(id)
			.first<{
				id: string;
				email: string;
				verification_version: number;
				verification_nonce: string;
			}>();
		const secret = /^JWT_SECRET=(.+)$/m.exec(
			readFileSync(join(root, 'runtime.env'), 'utf8')
		)![1];
		// Matches the scoped HMAC primitive; only synthetic local credentials are read.
		const scope = 'trial-intake:verify:v1';
		return createHmac('sha256', secret)
			.update(
				`${scope.length}:${scope}:${JSON.stringify([row!.id, row!.email, row!.verification_version, row!.verification_nonce])}`
			)
			.digest('hex');
	};
	try {
		const page = await context.newPage();
		await page.setViewportSize({ width: 390, height: 844 });
		await installSyntheticTurnstile(page);
		expect(
			(
				await context.request.get('/admin/trial-intake', {
					headers: { accept: 'text/html' },
				})
			).status()
		).toBe(401);
		expect(
			(
				await context.request.get('/admin/trial-intake/missing', {
					headers: { accept: 'application/json' },
				})
			).status()
		).toBe(401);
		await page.goto(`/probestunde?lesson=${fixture.lessons[0].id}`);
		await expect(page.locator('[data-turnstile-state="ready"]')).toHaveCount(1);
		await expect(page.locator('[data-enhanced="true"]')).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Probestunde anfragen', exact: true })
		).toBeVisible();
		await expect(page.locator('.site-brand')).toContainText(ORGANIZATION_NAME);
		await noOverflow(page);
		await page.locator('[name=parentFirstName]').fill('Synthetic');
		await page.locator('[name=parentLastName]').fill('ParentAlpha');
		await page.locator('[name=email]').fill('intake-ui@example.test');
		await page.locator('[name=phone]').fill('+49 000 123456');
		await page.locator('[name=first-child-1]').fill('ChildOne');
		await page.locator('[name=last-child-1]').fill('ZuluSynthetic');
		await page.locator('[name=birth-child-1]').fill('2018-01-02');
		await page.getByRole('button', { name: 'Kind hinzufügen' }).click();
		await page.locator('[name=first-child-2]').fill('ChildTwo');
		await page.locator('[name=last-child-2]').fill('AlphaSynthetic');
		await page.locator('[name=birth-child-2]').fill('2020-02-29');
		await page.getByRole('button', { name: 'Angebot hinzufügen' }).click();
		await page.getByLabel('Angebot suchen').fill('Kunst');
		await page.getByRole('button', { name: 'Auswählen · Kunst' }).click();
		const chosen = page.locator('.chosen-lesson');
		await chosen.nth(0).getByLabel('ChildTwo AlphaSynthetic').check();
		await chosen.nth(1).getByLabel('ChildOne ZuluSynthetic').uncheck();
		await chosen.nth(1).getByLabel('ChildTwo AlphaSynthetic').check();
		await page.getByRole('button', { name: 'Kind hinzufügen' }).click();
		await chosen.nth(1).getByLabel('ChildTwo AlphaSynthetic').uncheck();
		await chosen.nth(1).getByLabel('Kind 3', { exact: true }).check();
		await page.getByRole('button', { name: 'Entfernen · Kind 3', exact: true }).click();
		await expect(
			chosen.nth(1).getByText('Wählen Sie für jedes Angebot mindestens ein Kind aus.')
		).toBeVisible();
		await chosen.nth(1).getByLabel('ChildTwo AlphaSynthetic').check();
		const now = new Date().toISOString();
		const dates = fixture.lessons.map((l) => nextLessonDate(l.weekday, now));
		await expect(chosen.nth(0).getByLabel('Wunschdatum')).toHaveValue(dates[0]);
		await chosen.nth(1).getByLabel('Wunschdatum').fill(dates[1]);
		await page.getByRole('button', { name: 'Русский', exact: true }).click();
		await expect(
			page.getByRole('heading', { name: 'Запросить пробное занятие', exact: true })
		).toBeVisible();
		await expect(page.locator('[name=parentLastName]')).toHaveValue('ParentAlpha');
		await expect(chosen.nth(1).getByLabel('Желаемая дата')).toHaveValue(dates[1]);
		await expect(chosen.nth(1).getByLabel('ChildTwo AlphaSynthetic')).toBeChecked();
		await noOverflow(page);
		await expect(
			page.getByText('Без подтверждения email данные заявки удаляются', { exact: false })
		).toBeVisible();
		await page.screenshot({ path: 'tmp/trial-intake-ui-form-mobile.png', fullPage: true });
		if (process.env.KOLIBRI_TRIAL_INTAKE_INSPECT === '1') await page.pause();
		await expect(page.getByText('Telegram', { exact: false })).toHaveCount(0);
		const wrong = new Date(dates[0]);
		wrong.setUTCDate(wrong.getUTCDate() + 1);
		await chosen.nth(0).getByLabel('Желаемая дата').fill(wrong.toISOString().slice(0, 10));
		await page.getByRole('button', { name: 'Подать запрос', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText('нужного дня недели');
		await expect(page.getByRole('alert')).toBeFocused();
		await chosen.nth(0).getByLabel('Желаемая дата').fill(dates[0]);
		let submitted: { id: string; receipt: string };
		const payloads: Record<string, unknown>[] = [];
		await page.route('**/probestunde/submit', async (route) => {
			payloads.push(route.request().postDataJSON());
			const response = await route.fetch();
			expect(response.status()).toBe(200);
			submitted = await response.json();
			if (payloads.length === 1) await route.abort('failed');
			else await route.fulfill({ response });
		});
		await page.getByRole('button', { name: 'Подать запрос', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText('Введённые данные сохранены');
		await expect(chosen.nth(0).getByLabel('Желаемая дата')).toHaveValue(dates[0]);
		await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
		await page.getByRole('button', { name: 'Anfrage absenden', exact: true }).click();
		await expect(
			page.getByRole('heading', { name: 'Bitte prüfen Sie Ihr Postfach' })
		).toBeVisible();
		expect(payloads).toHaveLength(2);
		expect(payloads[1]).toEqual(payloads[0]);
		expect(
			(await db
				.prepare('SELECT COUNT(*) AS n FROM trial_intake_requests WHERE id=?')
				.bind(submitted!.id)
				.first<{ n: number }>())!.n
		).toBe(1);
		await expect(page.getByRole('button', { name: 'E-Mail erneut senden' })).toBeDisabled();
		const oldToken = await verificationToken(submitted!.id);
		await db
			.prepare('UPDATE trial_intake_requests SET last_email_at=? WHERE id=?')
			.bind(new Date(Date.now() - 65000).toISOString(), submitted!.id)
			.run();
		await page.clock.install();
		await page.clock.fastForward(65000);
		await page.getByRole('button', { name: 'E-Mail erneut senden' }).click();
		await expect(page.getByRole('status')).toContainText('erneute E-Mail');
		const token = await verificationToken(submitted!.id);
		expect(token).not.toBe(oldToken);
		expect(
			await (
				await context.request.get(`/probestunde/verify?token=${oldToken}`, {
					headers: { accept: 'application/json' },
				})
			).json()
		).toEqual({ state: 'invalid' });
		await page.screenshot({ path: 'tmp/trial-intake-ui-mail-mobile.png', fullPage: true });
		await page.goto(`/probestunde/verify?token=${token}`);
		await expect(page.locator('[data-enhanced="true"]')).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Anfrage bestätigen', exact: true })
		).toBeVisible();
		expect(
			(await db
				.prepare('SELECT state FROM trial_intake_requests WHERE id=?')
				.bind(submitted!.id)
				.first<{ state: string }>())!.state
		).toBe('pending_email');
		await page.getByRole('button', { name: 'Anfrage bestätigen', exact: true }).click();
		await expect(
			page.getByText('Ihre E-Mail-Adresse wurde bestätigt.', { exact: false })
		).toBeVisible();
		await noOverflow(page);
		await page.reload();
		await expect(page.getByText('Ihre Anfrage wurde bereits angenommen.')).toBeVisible();
		const telegram = new FakeTelegramProvider();
		telegram.failNext(
			new TelegramProviderError('SYNTHETIC_REJECTION', false, { delivery: 'not_delivered' })
		);
		const runtime = createOutboxRuntime(
			loadRuntimeConfig({
				...proxy.env,
				APP_ENV: 'test',
				PORTAL_MODE: 'trial_intake',
				PORTAL_PUBLIC_ORIGIN: new URL(page.url()).origin,
				JWT_SECRET: 'synthetic-test-secret-for-provider-failure',
				TRIAL_INTAKE_SCHEDULE_URL: 'https://schedule.example.test/',
				EMAIL_PROVIDER: 'fake',
				TELEGRAM_PROVIDER: 'fake',
				TELEGRAM_CHAT_ID: 'synthetic-bureau',
			}),
			{ telegramProvider: telegram }
		);
		const job = await db
			.prepare('SELECT not_before FROM telegram_outbox WHERE source_id=?')
			.bind(submitted!.id)
			.first<{ not_before: string }>();
		expect(await runtime.telegramWorker.dispatchNext(job!.not_before)).toBe('dead');
		const emailPending = await context.request.post('/probestunde/submit', {
			data: {
				...payloads[0],
				idempotencyKey: crypto.randomUUID(),
				email: 'intake-email-recovery@example.test',
			},
		});
		expect(emailPending.status()).toBe(200);
		const pendingId = (await emailPending.json()).id;
		await db
			.prepare(
				"UPDATE trial_intake_email_outbox SET status='dead',last_error_code='SYNTHETIC_EMAIL_REJECTION' WHERE request_id=?"
			)
			.bind(pendingId)
			.run();
		await page.goto('/auth/login');
		await expect(page.locator('[data-enhanced="true"]')).toBeVisible();
		await noOverflow(page);
		await expect(page.locator('a[href="/auth/register"]')).toHaveCount(0);
		await page
			.getByLabel('E-Mail-Adresse', { exact: true })
			.fill(syntheticIdentities.admin.email);
		await page.getByLabel('Passwort', { exact: true }).fill(syntheticPassword);
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await page.waitForURL('**/admin/trial-intake');
		await expect(page.locator('[data-enhanced="true"]')).toBeVisible();
		await expect(page.locator('article')).toHaveCount(2);
		await expect(page.getByText('SYNTHETIC_EMAIL_REJECTION', { exact: false })).toBeVisible();
		await page.getByRole('button', { name: 'Zustellung erneut einplanen' }).click();
		await expect(page.getByText('Die Zustellung wurde erneut eingeplant.')).toBeVisible();
		// The UI awaits both the mutation and loader refresh. Read the shared local
		// SQLite file only after these finish, not concurrently from another workerd.
		expect(
			(await db
				.prepare('SELECT status FROM trial_intake_email_outbox WHERE request_id=?')
				.bind(pendingId)
				.first<{ status: string }>())!.status
		).toBe('retry');
		await page.getByLabel('Fach', { exact: true }).fill('Kunst');
		await page.getByLabel('Lehrkraft', { exact: true }).fill('Lehrkraft B');
		await page.getByLabel('Wochentag', { exact: true }).selectOption('6');
		await page.getByLabel('Gebäude', { exact: true }).selectOption('Villa');
		await page.getByLabel('Nachname des Elternteils', { exact: true }).fill('ParentAlpha');
		await page.getByLabel('Nachname des Kindes', { exact: true }).fill('AlphaSynthetic');
		await page.getByLabel('Sortieren nach', { exact: true }).selectOption('child');
		await page.getByLabel('Reihenfolge', { exact: true }).selectOption('asc');
		await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
		await expect(page.locator('article')).toHaveCount(1);
		await expect(page.getByLabel('Wochentag', { exact: true })).toHaveValue('6');
		await expect(page.locator('article')).toContainText('ChildTwo');
		await noOverflow(page);
		await page.screenshot({ path: 'tmp/trial-intake-ui-admin-mobile.png', fullPage: true });
		await page.getByRole('link', { name: 'Gesamte Anfrage öffnen' }).click();
		await expect(page.locator('article')).toHaveCount(2);
		await expect(
			page.getByRole('link', { name: '+49 000 123456', exact: true })
		).toHaveAttribute('href', 'tel:+49000123456');
		await expect(page.getByText('SYNTHETIC_REJECTION', { exact: false })).toBeVisible();
		await page.getByRole('link', { name: 'Zustellung prüfen / wiederherstellen' }).click();
		await expect(page).toHaveURL(/\/admin\/outbox\?channel=telegram&q=ti/);
		await expect(page.getByText('SYNTHETIC_REJECTION', { exact: false })).toBeVisible();
		await page.goBack();
		await page
			.getByRole('button', { name: 'Gesamte Anfrage als bearbeitet markieren' })
			.click();
		await expect(
			page.getByRole('button', { name: 'Gesamte Anfrage wieder öffnen' })
		).toBeVisible();
		await page.getByRole('button', { name: 'Gesamte Anfrage wieder öffnen' }).click();
		await expect(
			page.getByRole('button', { name: 'Gesamte Anfrage als bearbeitet markieren' })
		).toBeVisible();
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.getByRole('button', { name: 'Русский', exact: true }).click();
		await expect(
			page.getByRole('button', { name: 'Отметить всю заявку как обработанную' })
		).toBeVisible();
		await page.screenshot({ path: 'tmp/trial-intake-ui-admin-desktop.png', fullPage: true });
		if (process.env.KOLIBRI_TRIAL_INTAKE_INSPECT === '1') await page.pause();
		await noOverflow(page);
	} finally {
		await context.close().catch(() => {});
		await proxy.dispose();
	}
});

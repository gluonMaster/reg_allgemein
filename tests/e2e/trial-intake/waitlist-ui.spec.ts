import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import plannedFixture from '../../fixtures/trial-intake/catalog-e2e-planned.json' with { type: 'json' };
import { plannedCourseKey } from '../../../src/lib/trial-intake/planned';
import { nextLessonDate } from '../../../src/lib/trial-intake/dates';
import { startDates } from '../../../src/lib/trial-intake/server/waitlist-start.server';
import type { Lesson } from '../../../src/lib/trial-intake/contracts';
import { newE2eContext, syntheticIdentities, syntheticPassword } from '../support/authenticated';
import { installSyntheticTurnstile } from '../support/turnstile';
import { createOutboxRuntime } from '../../../src/lib/server/outbox/runtime';
import { loadRuntimeConfig } from '../../../src/lib/server/config/runtime';
import { FakeEmailProvider } from '../../../src/lib/server/outbox/providers';

test.skip(process.env.KOLIBRI_E2E_TRIAL_INTAKE !== '1', 'Isolated intake harness required.');

async function noOverflow(page: Page) {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
	).toBe(true);
}
/** The local D1 of the E2E server and a fake mailbox that drains its letters as the scheduler would. */
async function harness(testInfo: TestInfo) {
	const root = process.env.KOLIBRI_E2E_RUNTIME_ROOT!;
	const proxy = await getPlatformProxy<{ DB: D1Database }>({
		configPath: 'wrangler.e2e.toml',
		envFiles: [join(root, 'runtime.env')],
		persist: { path: join(root, 'state', 'v3') },
		remoteBindings: false,
	});
	const mailbox = new FakeEmailProvider();
	/** Delivers queued letters until the `count`-th letter to `to` arrives. */
	const deliver = async (to: string, count: number) => {
		const runtime = createOutboxRuntime(
			loadRuntimeConfig({
				...proxy.env,
				APP_ENV: 'test',
				PORTAL_MODE: 'trial_intake',
				PORTAL_PUBLIC_ORIGIN: new URL(testInfo.project.use.baseURL!).origin,
				JWT_SECRET: /^JWT_SECRET=(.+)$/m.exec(
					readFileSync(join(root, 'runtime.env'), 'utf8')
				)![1],
				TRIAL_INTAKE_SCHEDULE_URL: 'https://schedule.example.test/',
				EMAIL_PROVIDER: 'fake',
				TELEGRAM_PROVIDER: 'fake',
				TELEGRAM_CHAT_ID: 'synthetic-bureau',
			}),
			{ emailProvider: mailbox }
		);
		for (let i = 0; i < 30; i++) {
			if (mailbox.messages.filter((m) => m.to === to).length >= count) break;
			if ((await runtime.emailWorker.dispatchNext(new Date().toISOString())) === 'empty')
				break;
		}
		return mailbox.messages.filter((m) => m.to === to).at(count - 1)!;
	};
	return { proxy, db: proxy.env.DB, deliver };
}

test('planned card link -> waitlist form -> changed price -> confirmation by synthetic mail -> admin queue and lock -> withdrawal', async ({
	browser,
}, testInfo) => {
	test.setTimeout(120_000);
	const [lesson] = plannedFixture.lessons;
	const { proxy, db, deliver } = await harness(testInfo);
	const key = plannedCourseKey(lesson as Lesson);
	const lock = () =>
		db
			.prepare('SELECT monthly_cents FROM trial_intake_planned_prices WHERE course_key = ?')
			.bind(key)
			.first<{ monthly_cents: number }>();
	const context = await newE2eContext(browser, testInfo);
	context.setDefaultTimeout(15_000);
	const linkPath = (text: string, path: string) => {
		const url = new URL(
			new RegExp(`https?://\\S+?${path}\\?token=[a-f0-9]{64}`, 'u').exec(text)![0]
		);
		return `${url.pathname}${url.search}`;
	};
	try {
		await db
			.prepare(
				`INSERT INTO trial_intake_planned_prices(course_key, subject, weekday, start_time, end_time, teacher, building,
				 room, monthly_cents, yearly_cents, min_participants, updated_by, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 6650, 5905, 3, 'e2e-admin', ?, ?)`
			)
			.bind(
				key,
				lesson.subject,
				lesson.weekday,
				lesson.start,
				lesson.end,
				lesson.teacher,
				lesson.building,
				lesson.room,
				new Date().toISOString(),
				new Date().toISOString()
			)
			.run();
		// The second planned card (the rebind target below) has a price too: no "Preis fehlt" banner.
		const other = plannedFixture.lessons[1] as Lesson;
		await db
			.prepare(
				`INSERT INTO trial_intake_planned_prices(course_key, subject, weekday, start_time, end_time, teacher, building,
				 room, monthly_cents, yearly_cents, min_participants, updated_by, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 6650, 5905, 3, 'e2e-admin', ?, ?) ON CONFLICT(course_key) DO NOTHING`
			)
			.bind(
				plannedCourseKey(other),
				other.subject,
				other.weekday,
				other.start,
				other.end,
				other.teacher,
				other.building,
				other.room,
				new Date().toISOString(),
				new Date().toISOString()
			)
			.run();
		const page = await context.newPage();
		await page.setViewportSize({ width: 390, height: 844 });
		await installSyntheticTurnstile(page);
		// The old trial CTA of a planned card leads to its waitlist (WL-03).
		await page.goto(`/probestunde?lesson=${lesson.id}&utm=ignored`);
		await expect(page).toHaveURL(new RegExp(`/warteliste\\?lesson=${lesson.id}$`, 'u'));
		await expect(page.locator('[data-turnstile-state="ready"]')).toHaveCount(1);
		await expect(page.locator('[data-enhanced="true"]')).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Warteliste: English', exact: true })
		).toBeVisible();
		await expect(page.getByText('Kurs in Planung', { exact: true })).toBeVisible();
		await expect(page.getByText('Dienstag · 16:00–17:00 (60 Min.)')).toBeVisible();
		await expect(
			page.getByText('sobald mindestens 3 Kinder angemeldet sind', { exact: false })
		).toBeVisible();
		const monthly = page.getByLabel('Monatsvertrag – 66,50 € pro Monat');
		await expect(monthly).not.toBeChecked();
		await expect(page.getByLabel('Jahresvertrag – 59,05 € pro Monat')).not.toBeChecked();
		await expect(page.locator('input[name=consent]')).toHaveCount(0);
		await noOverflow(page);
		await page.locator('[name=parentFirstName]').fill('Synthetic');
		await page.locator('[name=parentLastName]').fill('WaitlistParent');
		await page.locator('[name=email]').fill('waitlist-ui@example.test');
		await page.locator('[name=phone]').fill('+49 000 654321');
		await page.locator('[name=first-child-1]').fill('WaitChild');
		await page.locator('[name=last-child-1]').fill('Synthetic');
		// Eight years old on the next lesson date: English starts at six.
		const born = new Date(nextLessonDate(lesson.weekday, new Date().toISOString()));
		born.setUTCFullYear(born.getUTCFullYear() - 8);
		await page.locator('[name=birth-child-1]').fill(born.toISOString().slice(0, 10));
		await monthly.check();
		const consent = page.getByLabel(
			'den monatlichen Beitrag von 66,50 € je Kind (Monatsvertrag)',
			{
				exact: false,
			}
		);
		await consent.check();
		// The language switch keeps the input; the consent reads in Russian with the same sum.
		await page.getByRole('button', { name: 'Русский', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Лист ожидания: English' })).toBeVisible();
		await expect(page.getByLabel('ежемесячный взнос 66,50 €', { exact: false })).toBeChecked();
		await expect(page.locator('[name=parentLastName]')).toHaveValue('WaitlistParent');
		await noOverflow(page);
		await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
		await expect(consent).toBeChecked();
		await page.screenshot({
			path: 'tmp/trial-intake-waitlist-form-mobile.png',
			fullPage: true,
		});

		// The bureau changes the sum before the first signup locks it.
		await db
			.prepare(
				'UPDATE trial_intake_planned_prices SET monthly_cents = 7000 WHERE course_key = ?'
			)
			.bind(key)
			.run();
		const refused = page.waitForResponse((r) => r.url().endsWith('/warteliste/submit'));
		await page.getByRole('button', { name: 'Auf die Warteliste setzen', exact: true }).click();
		expect((await refused).status()).toBe(409);
		await expect(page.locator('div.error[role=alert]')).toContainText(
			'Der Beitrag für diesen Kurs wurde geändert'
		);
		await expect(page.getByLabel('Monatsvertrag – 70,00 € pro Monat')).toBeChecked();
		const newConsent = page.getByLabel(
			'den monatlichen Beitrag von 70,00 € je Kind (Monatsvertrag)',
			{
				exact: false,
			}
		);
		await expect(newConsent).not.toBeChecked();
		await newConsent.check();
		const accepted = page.waitForResponse((r) => r.url().endsWith('/warteliste/submit'));
		await page.getByRole('button', { name: 'Auf die Warteliste setzen', exact: true }).click();
		const receipt = await (await accepted).json();
		expect((await accepted).request().postDataJSON()).toMatchObject({
			lessonId: lesson.id,
			tariff: 'monthly',
			expectedPriceCents: 7000,
			consent: true,
		});
		await expect(
			page.getByRole('heading', { name: 'Bitte prüfen Sie Ihr Postfach' })
		).toBeVisible();
		expect(
			await page.evaluate(() => JSON.parse(localStorage.getItem('trial-intake:parent:v1')!))
		).toMatchObject({ email: 'waitlist-ui@example.test' });
		// The price is locked by the unconfirmed signup already (WL-06).
		await expect(
			db
				.prepare(
					'UPDATE trial_intake_planned_prices SET monthly_cents = 7100 WHERE course_key = ?'
				)
				.bind(key)
				.run()
		).rejects.toThrow();

		const verification = await deliver('waitlist-ui@example.test', 1);
		expect(verification.subject).toContain('Anmeldung zur Warteliste');
		expect(verification.text).toContain('Tarif: Monatsvertrag, 70,00 € pro Monat je Kind');
		expect(verification.text).not.toContain('WaitChild');
		await page.goto(linkPath(verification.text, '/probestunde/verify'));
		await expect(page.locator('[data-enhanced="true"]')).toBeVisible();
		await page.getByRole('button', { name: 'Anmeldung bestätigen', exact: true }).click();
		await expect(
			page.getByText('Sie stehen jetzt auf der Warteliste.', { exact: false })
		).toBeVisible();
		await noOverflow(page);
		const confirmation = await deliver('waitlist-ui@example.test', 2);
		expect(confirmation.subject).toContain('Sie stehen auf der Warteliste: English');
		expect(confirmation.text).toContain('WaitChild Synthetic: English (in Planung)');
		const withdrawPath = linkPath(confirmation.text, '/warteliste/austragen');

		await page.goto('/auth/login');
		await page
			.getByLabel('E-Mail-Adresse', { exact: true })
			.fill(syntheticIdentities.admin.email);
		await page.getByLabel('Passwort', { exact: true }).fill(syntheticPassword);
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await page.waitForURL('**/admin/trial-intake');
		await expect(page.locator('[data-enhanced="true"]')).toBeVisible();
		// The trial list does not show the signup; the waitlist line counts it.
		await expect(page.getByText('WaitlistParent')).toHaveCount(0);
		await page.getByRole('link', { name: /^Warteliste: \d+ Kurse, 1 Kinder$/u }).click();
		await expect(page).toHaveURL(/\/admin\/trial-intake\/warteliste$/u);
		const row = page.locator('tr', { hasText: 'Lehrkraft W' }).first();
		await expect(row).toContainText('sammelt: 1 von 3 Kindern');
		await expect(row).toContainText('gesperrt: 1 aktive Anmeldungen');
		await expect(row.getByLabel(/^Monatsvertrag €\/Monat: English/u)).toBeDisabled();
		await expect(row.getByLabel(/^Monatsvertrag €\/Monat: English/u)).toHaveValue('70,00');
		await expect(page.getByText('WaitChild Synthetic', { exact: false })).toBeVisible();
		// WL-07: one card per course on a phone and a tablet, a table row on a desktop; no column
		// is squeezed to a few letters per line.
		const layout = () =>
			row.evaluate((tr) => ({
				display: getComputedStyle(tr).display,
				narrowest: Math.min(
					...[...tr.querySelectorAll(':scope > td')].map(
						(td) => td.getBoundingClientRect().width
					)
				),
			}));
		expect(await layout()).toMatchObject({ display: 'grid' });
		expect((await layout()).narrowest).toBeGreaterThan(90);
		await noOverflow(page);
		await page.screenshot({ path: 'tmp/trial-intake-waitlist-admin.png', fullPage: true });
		await page.setViewportSize({ width: 820, height: 1180 });
		expect(await layout()).toMatchObject({ display: 'grid' });
		expect((await layout()).narrowest).toBeGreaterThan(150);
		await noOverflow(page);
		await page.screenshot({
			path: 'tmp/trial-intake-waitlist-admin-tablet.png',
			fullPage: true,
		});
		await page.setViewportSize({ width: 1280, height: 900 });
		expect(await layout()).toMatchObject({ display: 'table-row' });
		expect((await layout()).narrowest).toBeGreaterThan(70);
		await noOverflow(page);
		await page.screenshot({
			path: 'tmp/trial-intake-waitlist-admin-desktop.png',
			fullPage: true,
		});
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByRole('link', { name: 'Synthetic WaitlistParent', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/admin/trial-intake/${receipt.id}$`, 'u'));
		await expect(page.getByText('Monatsvertrag, 70,00 € pro Monat je Kind')).toBeVisible();
		await expect(
			page.getByText('„Bearbeitet“ ist erst nach Start, Austragen oder Storno möglich.')
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Gesamte Anfrage als bearbeitet markieren' })
		).toHaveCount(0);
		await expect(
			page.getByRole('button', { name: 'Aus der Warteliste austragen' })
		).toBeVisible();
		await noOverflow(page);

		// The family leaves by the link of the confirmation letter; GET alone changes nothing.
		await page.goto(withdrawPath);
		await expect(page.getByText('Von der Warteliste für English austragen?')).toBeVisible();
		expect((await lock())!.monthly_cents).toBe(7000);
		await page.getByRole('button', { name: 'Austragen', exact: true }).click();
		await expect(page.getByText('Sie wurden von der Warteliste ausgetragen.')).toBeVisible();
		await page.reload();
		await expect(page.getByText('Sie wurden von der Warteliste ausgetragen.')).toBeVisible();
		await page.goto('/admin/trial-intake/warteliste');
		await expect(row).toContainText('sammelt: 0 von 3 Kindern');
		await expect(row.getByLabel(/^Monatsvertrag €\/Monat: English/u)).toBeEnabled();
		await expect(page.getByText('ausgetragen', { exact: false })).toBeVisible();
	} finally {
		await context.close().catch(() => {});
		await proxy.dispose();
	}
});

test('planned course at its threshold -> start dialog -> probe to the admin -> confirmed start -> letter with PDF -> PDF on the card', async ({
	browser,
}, testInfo) => {
	test.setTimeout(120_000);
	const [lesson] = plannedFixture.lessons;
	const { proxy, db, deliver } = await harness(testInfo);
	const key = plannedCourseKey(lesson as Lesson);
	const context = await newE2eContext(browser, testInfo);
	context.setDefaultTimeout(15_000);
	const now = new Date().toISOString();
	const request = crypto.randomUUID();
	const entry = () =>
		db
			.prepare(
				'SELECT status, start_id FROM trial_intake_waitlist_entries WHERE request_id = ?'
			)
			.bind(request)
			.first<{ status: string; start_id: string | null }>();
	try {
		// One confirmed child reaches the threshold of 1; the signup itself is covered above.
		await db
			.prepare(
				`INSERT INTO trial_intake_planned_prices(course_key, subject, weekday, start_time, end_time, teacher, building,
				 room, monthly_cents, yearly_cents, min_participants, updated_by, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 6650, 5905, 1, 'e2e-admin', ?, ?)
				 ON CONFLICT(course_key) DO UPDATE SET monthly_cents = 6650, yearly_cents = 5905, min_participants = 1`
			)
			.bind(
				key,
				lesson.subject,
				lesson.weekday,
				lesson.start,
				lesson.end,
				lesson.teacher,
				lesson.building,
				lesson.room,
				now,
				now
			)
			.run();
		await db.batch([
			db
				.prepare(
					`INSERT INTO trial_intake_requests(id, kind, idempotency_key, payload_hash, parent_first_name, parent_last_name,
					 parent_last_name_search, email, phone, locale, privacy_version, state, receipt_nonce, verification_version,
					 verification_nonce, verification_hash, verification_expires_at, last_email_at, created_at, pending_expires_at, verified_at)
					 VALUES (?, 'waitlist', ?, 'h', 'Synthetic', 'StartParent', 'startparent', 'waitlist-start@example.test',
					 '+49 000 123456', 'de', 'trial-intake-waitlist-retention-2026-11-05-v1', 'verified', 'n', 1, 'n', ?, ?, ?, ?, ?, ?)`
				)
				.bind(request, request, `hash-${request}`, now, now, now, now, now),
			db
				.prepare(
					`INSERT INTO trial_intake_children(id, request_id, position, first_name, last_name, last_name_search, birth_date)
					 VALUES (?, ?, 0, 'Jürgen', 'Größe', 'größe', '2018-03-01')`
				)
				.bind(crypto.randomUUID(), request),
			db
				.prepare(
					`INSERT INTO trial_intake_waitlist_entries(request_id, course_key, lesson_json, tariff, monthly_cents, yearly_cents,
					 min_participants, consent_version, withdraw_nonce, withdraw_hash, created_at, status_changed_at)
					 VALUES (?, ?, ?, 'monthly', 6650, 5905, 1, 'trial-intake-waitlist-consent-2026-11-05-v1', ?, ?, ?, ?)`
				)
				.bind(
					request,
					key,
					JSON.stringify(lesson),
					crypto.randomUUID(),
					`${request}-withdraw`,
					now,
					now
				),
		]);
		const { dates, defaultDate } = startDates(lesson.weekday, now);
		const page = await context.newPage();
		await page.goto('/auth/login');
		await page
			.getByLabel('E-Mail-Adresse', { exact: true })
			.fill(syntheticIdentities.admin.email);
		await page.getByLabel('Passwort', { exact: true }).fill(syntheticPassword);
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await page.waitForURL('**/admin/trial-intake');
		await expect(page.getByText('Warteliste: bitte prüfen')).toBeVisible();
		await page.goto('/admin/trial-intake/warteliste');
		await expect(page.locator('[data-enhanced="true"]')).toBeVisible();
		const row = page.locator('tr', { hasText: 'Lehrkraft W' }).first();
		await expect(row).toContainText('Mindestzahl erreicht — Kurs kann gestartet werden');
		await row.getByRole('button', { name: 'Kurs starten', exact: true }).click();
		const dialog = page.locator('section.start-dialog');
		await expect(dialog.getByRole('heading', { name: 'Kurs starten: English' })).toBeFocused();
		const date = dialog.getByLabel('Erster Termin');
		await expect(date).toHaveValue(defaultDate);
		await expect(date.locator('option')).toHaveCount(dates.length);
		await expect(dialog).toContainText('Empfänger: 1 Familien, 1 Kinder');
		await expect(dialog.locator('.letter-text')).toContainText('Angemeldet: Jürgen Größe');
		await expect(dialog.locator('.letter-text')).toContainText(
			'Ihr Tarif: Monatsvertrag, 66,50 € pro Monat je Kind (bei Ihrer Anmeldung festgelegt)'
		);
		// The confirmation stays disabled until the admin ticks the check.
		const confirm = dialog.getByRole('button', { name: 'Start bestätigen', exact: true });
		await expect(confirm).toBeDisabled();
		await dialog.getByRole('button', { name: 'Probe-E-Mail an mich', exact: true }).click();
		await expect(dialog.getByRole('status')).toContainText(
			'Die Probe-E-Mail mit PDF ist an Ihre Adresse eingeplant.'
		);
		const probe = await deliver(syntheticIdentities.admin.email, 1);
		expect(probe.subject).toMatch(/^\[PROBE\] Ihr Kurs English beginnt am /u);
		expect(probe.attachments?.[0].filename).toMatch(
			/^Anmeldebestaetigung-English-\d{2}\.\d{2}\.\d{4}\.pdf$/u
		);
		expect(new TextDecoder().decode(probe.attachments![0].content.slice(0, 5))).toBe('%PDF-');
		expect(await entry()).toEqual({ status: 'waiting', start_id: null });
		await page.screenshot({
			path: 'tmp/trial-intake-waitlist-start-dialog.png',
			fullPage: true,
		});

		await dialog.getByLabel('Termin, Ort und Empfänger geprüft').check();
		await confirm.click();
		await expect(dialog.getByRole('status')).toContainText('Der Kurs ist gestartet.');
		const shown = new Intl.DateTimeFormat('de-DE', {
			timeZone: 'Europe/Berlin',
			dateStyle: 'medium',
		}).format(new Date(defaultDate));
		await expect(row).toContainText(`gestartet: erster Termin ${shown}`);
		await expect(row).toContainText('Bitte die Gruppe im Stundenplan umbenennen');
		await expect(row.getByRole('button', { name: 'Kurs starten', exact: true })).toHaveCount(0);
		expect((await entry())!.status).toBe('started');
		const letter = await deliver('waitlist-start@example.test', 1);
		expect(letter.subject).toContain('Ihr Kurs English beginnt am');
		expect(letter.attachments).toHaveLength(1);

		await page.goto(`/admin/trial-intake/${request}`);
		await expect(page.getByRole('heading', { name: 'Kursstart', exact: true })).toBeVisible();
		await expect(page.getByText('Versuche: 1', { exact: false })).toBeVisible();
		const href = await page.getByRole('link', { name: 'PDF ansehen' }).getAttribute('href');
		const response = await page.request.get(href!);
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toBe('application/pdf');
		expect(response.headers()['cache-control']).toBe('no-store');
		expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
		await noOverflow(page);
		// The public page of the started course says so.
		await page.goto(`/warteliste?lesson=${lesson.id}`);
		await expect(
			page.getByText('Dieser Kurs ist bereits gestartet', { exact: false })
		).toBeVisible();
	} finally {
		await context.close().catch(() => {});
		await proxy.dispose();
	}
});

test('queue whose card left the schedule -> banner -> orange rebind to the new card -> "Familien informiert"', async ({
	browser,
}, testInfo) => {
	test.setTimeout(120_000);
	// The second planned card of the fixture is the new card; the old one is not in the catalog.
	const target = plannedFixture.lessons.find((l) => l.subject === '1 E')! as Lesson;
	const old = { ...target, start: '15:00', end: '15:45' };
	const { proxy, db } = await harness(testInfo);
	const [oldKey, newKey] = [plannedCourseKey(old), plannedCourseKey(target)];
	const context = await newE2eContext(browser, testInfo);
	context.setDefaultTimeout(15_000);
	const now = new Date().toISOString();
	const request = crypto.randomUUID();
	try {
		await db.batch([
			db
				.prepare(
					`INSERT INTO trial_intake_planned_prices(course_key, subject, weekday, start_time, end_time, teacher, building,
					 room, age_min, age_max, monthly_cents, yearly_cents, min_participants, updated_by, created_at, updated_at)
					 VALUES (?, '1 E', 2, '15:00', '15:45', 'Lehrkraft Q', 'Kolibri', 'R5', 5, 6, 6650, 5905, 3, 'e2e-admin', ?, ?)`
				)
				.bind(oldKey, now, now),
			db
				.prepare(
					`INSERT INTO trial_intake_requests(id, kind, idempotency_key, payload_hash, parent_first_name, parent_last_name,
					 parent_last_name_search, email, phone, locale, privacy_version, state, receipt_nonce, verification_version,
					 verification_nonce, verification_hash, verification_expires_at, last_email_at, created_at, pending_expires_at, verified_at)
					 VALUES (?, 'waitlist', ?, 'h', 'Synthetic', 'RebindParent', 'rebindparent', 'waitlist-rebind@example.test',
					 '+49 000 777888', 'de', 'trial-intake-waitlist-retention-2026-11-05-v1', 'verified', 'n', 1, 'n', ?, ?, ?, ?, ?, ?)`
				)
				.bind(request, request, `hash-${request}`, now, now, now, now, now),
			db
				.prepare(
					`INSERT INTO trial_intake_children(id, request_id, position, first_name, last_name, last_name_search, birth_date)
					 VALUES (?, ?, 0, 'RebindChild', 'Synthetic', 'synthetic', '2020-05-01')`
				)
				.bind(crypto.randomUUID(), request),
			db
				.prepare(
					`INSERT INTO trial_intake_waitlist_entries(request_id, course_key, lesson_json, tariff, monthly_cents, yearly_cents,
					 min_participants, consent_version, withdraw_nonce, withdraw_hash, created_at, status_changed_at)
					 VALUES (?, ?, ?, 'monthly', 6650, 5905, 3, 'trial-intake-waitlist-consent-2026-11-05-v1', ?, ?, ?, ?)`
				)
				.bind(
					request,
					oldKey,
					JSON.stringify({ ...old, id: 'a'.repeat(64) }),
					crypto.randomUUID(),
					`${request}-withdraw`,
					now,
					now
				),
		]);
		const page = await context.newPage();
		await page.goto('/auth/login');
		await page
			.getByLabel('E-Mail-Adresse', { exact: true })
			.fill(syntheticIdentities.admin.email);
		await page.getByLabel('Passwort', { exact: true }).fill(syntheticPassword);
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await page.waitForURL('**/admin/trial-intake');
		await expect(
			page.getByText('Kurs nicht mehr im Stundenplan: 1 Familien warten').first()
		).toBeVisible();
		await page.goto('/admin/trial-intake/warteliste');
		await expect(page.locator('[data-enhanced="true"]')).toBeVisible();
		const gone = page.locator('tr', { hasText: 'Kurs nicht mehr im Stundenplan' });
		await expect(gone).toContainText('Lehrkraft Q');
		await expect(gone).toContainText('15:00–15:45');
		await gone.getByRole('button', { name: 'Neu zuordnen', exact: true }).click();
		const dialog = page.locator('section.rebind-dialog');
		await expect(
			dialog.getByRole('heading', { name: 'Warteliste neu zuordnen: 1 E' })
		).toBeFocused();
		await expect(dialog).toContainText('Wartend: 1 Familien, 1 Kinder');
		const confirm = dialog.getByRole('button', { name: 'Neu zuordnen bestätigen' });
		await expect(confirm).toBeDisabled();
		await dialog
			.getByRole('radio', {
				name: '1 E, Dienstag 16:00–16:45, Kolibri · Raum R5, Lehrkraft Q',
			})
			.check();
		const effect = dialog.getByRole('status');
		await expect(effect).toContainText('1 wartende Familien mit 1 Kindern gehen');
		await expect(effect).toContainText('Familien informieren: Zeit: 15:00 auf 16:00');
		await page.screenshot({ path: 'tmp/trial-intake-waitlist-rebind.png', fullPage: true });
		await confirm.click();
		await expect(page.getByText('Die Warteliste ist neu zugeordnet.')).toBeVisible();
		await expect(dialog).toHaveCount(0);
		expect(
			await db
				.prepare(
					'SELECT course_key, status FROM trial_intake_waitlist_entries WHERE request_id = ?'
				)
				.bind(request)
				.first()
		).toEqual({ course_key: newKey, status: 'waiting' });
		const row = page.locator('tr', { hasText: 'Lehrkraft Q' }).first();
		await expect(row).toContainText('sammelt: 1 von 3 Kindern');
		await expect(row).toContainText('Familien informieren: Zeit: 15:00 auf 16:00');
		const orange = page.locator('.mark-box.mark-orange');
		await expect(orange).toContainText(
			'Synthetic RebindParent · Telefonnummer: +49 000 777888'
		);
		await orange.getByRole('button', { name: 'Familien informiert', exact: true }).click();
		await expect(page.getByText('Gespeichert.')).toBeVisible();
		await expect(page.locator('.mark-box.mark-orange')).toHaveCount(0);
		await expect(row).not.toContainText('Familien informieren');
		expect(
			await db
				.prepare(
					`SELECT COUNT(*) AS n FROM audit_events WHERE action IN ('trial_intake.waitlist_rebound', 'trial_intake.waitlist_attention_cleared')`
				)
				.first<{ n: number }>()
		).toEqual({ n: 2 });
		await page.goto('/admin/trial-intake');
		await expect(page.getByText('Kurs nicht mehr im Stundenplan')).toHaveCount(0);
	} finally {
		await context.close().catch(() => {});
		await proxy.dispose();
	}
});

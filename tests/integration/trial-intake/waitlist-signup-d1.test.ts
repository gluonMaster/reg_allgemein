import type { RequestEvent } from '@sveltejs/kit';
import fixture from '../../fixtures/trial-intake/catalog-v1.json';
import { WaitlistSignup } from '$lib/trial-intake/server/waitlist.server';
import { withdrawToken } from '$lib/trial-intake/server/waitlist-core.server';
import { IntakeAdmin } from '$lib/trial-intake/server/admin.server';
import { WaitlistPrices } from '$lib/trial-intake/server/prices.server';
import { cleanupIntake } from '$lib/trial-intake/server/cleanup.server';
import { lessonIdentity } from '$lib/trial-intake/server/catalog.server';
import { closedKey } from '$lib/trial-intake/closed';
import { plannedCourseKey } from '$lib/trial-intake/planned';
import { afterSeconds, verificationToken } from '$lib/trial-intake/server/service.server';
import { verifiedDeviceValue } from '$lib/trial-intake/server/device.server';
import {
	adminDetail,
	adminWaitlistPrice,
	intakeEndpoint,
	waitlistSubmit,
} from '$lib/trial-intake/server/http.server';
import { createOutboxRuntime } from '$lib/server/outbox/runtime';
import { requireAdmin } from '$lib/server/security/authorization';
import { FakeEmailProvider, FakeTelegramProvider } from '$lib/server/outbox/providers';
import { ORGANIZATION_NAME } from '$lib/organization';
import {
	INTAKE_PRIVACY_VERSION,
	WAITLIST_CONSENT_VERSION,
	WAITLIST_PRIVACY_VERSION,
	type Lesson,
} from '$lib/trial-intake/contracts';
import {
	useIntakeD1,
	NOW,
	SECRET,
	actor,
	ctx,
	db,
	service,
	lessons,
	config,
	seedAdmin,
} from './intake-harness';

useIntakeD1();

const PLANNED = 'Der Kurs befindet sich in der Planung';
async function plannedLesson(fields: Partial<Lesson> = {}): Promise<Lesson> {
	const value = {
		subject: 'English',
		group: PLANNED,
		weekday: 2,
		start: '16:00',
		end: '17:00',
		teacher: 'Lehrkraft A',
		room: 'R1',
		building: 'Villa' as const,
		...fields,
	};
	return { id: await lessonIdentity(value), ...value };
}
function price(lesson: Lesson, monthly = 6650, yearly = 5905, min = 3) {
	return db.run({
		sql: `INSERT INTO trial_intake_planned_prices(course_key, subject, weekday, start_time, end_time, teacher, building, room,
		 monthly_cents, yearly_cents, min_participants, updated_by, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		params: [
			plannedCourseKey(lesson),
			lesson.subject,
			lesson.weekday,
			lesson.start,
			lesson.end,
			lesson.teacher,
			lesson.building,
			lesson.room,
			monthly,
			yearly,
			min,
			actor.id,
			NOW,
			NOW,
		],
	});
}
function input(lesson: Lesson, fields: Record<string, unknown> = {}) {
	return {
		idempotencyKey: crypto.randomUUID(),
		parentFirstName: 'Synthetic',
		parentLastName: 'Parent',
		email: 'guest@example.test',
		phone: '+49 000000000',
		locale: 'de' as const,
		privacyVersion: WAITLIST_PRIVACY_VERSION,
		// Eight on the next Tuesday after NOW: English is "ab 6 Jahren".
		children: [
			{ key: 'child-a', firstName: 'Kind', lastName: 'Zulu', birthDate: '2018-03-01' },
		],
		lessonId: lesson.id,
		tariff: 'monthly' as const,
		expectedPriceCents: 6650,
		consent: true as const,
		...fields,
	};
}
const count = async (sql: string, params: unknown[] = []) =>
	(await db.first<{ n: number }>({ sql: `SELECT COUNT(*) AS n FROM ${sql}`, params }))?.n;
const signup = () => new WaitlistSignup(service, SECRET);
async function token(id: string) {
	return verificationToken(SECRET, (await service.get(id))!);
}
async function entry(id: string) {
	return db.first<{ status: string; withdraw_nonce: string; request_id: string }>({
		sql: 'SELECT * FROM trial_intake_waitlist_entries WHERE request_id = ?',
		params: [id],
	});
}
async function startCourse(lesson: Lesson, firstDate = '2026-10-06') {
	await db.run({
		sql: `INSERT INTO trial_intake_waitlist_starts(id, course_key, first_date, lesson_json, participants, started_by, started_at)
		 VALUES (?, ?, ?, ?, 3, ?, ?)`,
		params: [
			crypto.randomUUID(),
			plannedCourseKey(lesson),
			firstDate,
			JSON.stringify(lesson),
			actor.id,
			NOW,
		],
	});
}

describe('waitlist signup, confirmation, letters and Telegram (WL-04, WL-08, WL-09)', () => {
	it('submit -> verification letter -> confirm -> one Telegram part and the confirmation letter with withdrawal link', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		await price(english, 6650, 5905, 2);
		const catalog = async () => [...lessons, english];
		const first = input(english);
		const created = await signup().create(first, catalog, NOW);
		expect(created.state).toBe('pending_email');
		const request = (await service.get(created.id))!;
		expect(request).toMatchObject({
			kind: 'waitlist',
			privacy_version: WAITLIST_PRIVACY_VERSION,
		});
		expect(
			await db.first({
				sql: `SELECT course_key, tariff, monthly_cents, yearly_cents, min_participants, consent_version, status
				 FROM trial_intake_waitlist_entries WHERE request_id = ?`,
				params: [created.id],
			})
		).toEqual({
			course_key: plannedCourseKey(english),
			tariff: 'monthly',
			monthly_cents: 6650,
			yearly_cents: 5905,
			min_participants: 2,
			consent_version: WAITLIST_CONSENT_VERSION,
			status: 'waiting',
		});
		expect(await count('trial_intake_items')).toBe(0);
		expect(await count('trial_intake_children WHERE request_id = ?', [created.id])).toBe(1);
		// The same key replays the receipt; another sum under the same key is a conflict.
		expect(await signup().create(first, catalog, NOW)).toEqual(created);
		await expect(
			signup().create({ ...first, tariff: 'yearly', expectedPriceCents: 5905 }, catalog, NOW)
		).rejects.toMatchObject({ code: 'INTAKE_IDEMPOTENCY_CONFLICT' });
		expect(await count('trial_intake_requests')).toBe(1);

		const email = new FakeEmailProvider();
		const runtime = createOutboxRuntime(config(), { emailProvider: email });
		expect(await runtime.emailWorker.dispatchNext(NOW)).toBe('sent');
		const verification = email.messages[0];
		expect(verification.subject).toBe(
			`Bitte bestätigen Sie Ihre Anmeldung zur Warteliste beim ${ORGANIZATION_NAME}`
		);
		expect(verification.text).toContain('English (in Planung) — Dienstag, 16:00–17:00, Villa');
		expect(verification.text).toContain('Tarif: Monatsvertrag, 66,50 € pro Monat je Kind');
		expect(verification.text).toContain('/probestunde/verify?token=');
		expect(verification.text).not.toContain('Zulu');
		expect(verification.text).not.toContain('2018-03-01');
		expect(verification.html).toContain('>Anmeldung bestätigen</a>');

		const t = await token(created.id);
		expect(await service.inspectToken(t, NOW)).toEqual({ state: 'confirm', kind: 'waitlist' });
		expect(await service.verify(t, NOW)).toMatchObject({ state: 'accepted', kind: 'waitlist' });
		// A repeated confirmation creates no second notification or letter.
		await service.verify(t, afterSeconds(NOW, 1));
		const payloads = (
			await db.all<{ body: string }>({
				sql: 'SELECT body FROM trial_intake_telegram_payloads WHERE request_id = ?',
				params: [created.id],
			})
		).results;
		expect(payloads).toHaveLength(1);
		const lines = payloads[0].body.split('\n');
		expect(lines[0]).toBe('📝 <b>Neue Anmeldung zur Warteliste</b>');
		expect(lines).toContain('📚 <b>English</b> (in Planung)');
		expect(lines).toContain('📅 <b>Di, 16:00–17:00</b>');
		expect(lines.some((line) => line.endsWith('📍 Raum R1, Villa'))).toBe(true);
		expect(lines).toContain('💶 Monatsvertrag, 66,50 € pro Monat je Kind');
		expect(lines).toContain('🧒 <b>Kind Zulu</b>, 8 J. (01.03.2018)');
		expect(lines.at(-1)).toBe('👥 <b>Warteliste: 1 von 2 Kindern</b>');
		expect(
			await db.all({
				sql: `SELECT source_kind, template_or_category FROM telegram_outbox WHERE source_id = ?`,
				params: [created.id],
			})
		).toMatchObject({
			results: [{ source_kind: 'trial_intake', template_or_category: 'bureau.trial_intake' }],
		});
		expect(
			(
				await db.all<{ kind: string; status: string }>({
					sql: 'SELECT kind, status FROM trial_intake_email_outbox WHERE request_id = ? ORDER BY kind',
					params: [created.id],
				})
			).results
		).toEqual([
			{ kind: 'confirmation', status: 'pending' },
			{ kind: 'verification', status: 'sent' },
		]);
		expect(await runtime.emailWorker.dispatchNext(afterSeconds(NOW, 2))).toBe('sent');
		const confirmation = email.messages[1];
		expect(confirmation.subject).toBe(
			`Sie stehen auf der Warteliste: English — ${ORGANIZATION_NAME}`
		);
		expect(confirmation.text).toContain('Kind Zulu: English (in Planung)');
		expect(confirmation.text).toContain('Villa, Kraftwerk Mitte 2 • 01067 Dresden, Raum R1');
		expect(confirmation.text).toContain(
			'Der Kurs beginnt, sobald mindestens 2 Kinder angemeldet sind.'
		);
		expect(confirmation.text).toContain('Tel. +49 179 9474938');
		const withdrawLink = await withdrawToken(SECRET, (await entry(created.id))!);
		expect(confirmation.text).toContain(
			`Austragen: https://portal.example.test/warteliste/austragen?token=${withdrawLink}`
		);
		expect(confirmation.html).toContain(
			`href="https://portal.example.test/warteliste/austragen?token=${withdrawLink}"`
		);
		expect(await runtime.emailWorker.dispatchNext(afterSeconds(NOW, 3))).toBe('empty');

		// The second family reaches the threshold: the first line after the name says so.
		const second = await signup().create(
			input(english, { email: 'second@example.test' }),
			catalog,
			NOW
		);
		await service.verify(await token(second.id), afterSeconds(NOW, 4));
		const reached = (await db.first<{ body: string }>({
			sql: 'SELECT body FROM trial_intake_telegram_payloads WHERE request_id = ?',
			params: [second.id],
		}))!.body.split('\n');
		expect(reached.slice(0, 2)).toEqual([
			'🎯 <b>Mindestteilnehmerzahl erreicht – Kurs kann gestartet werden</b>',
			'📝 <b>Neue Anmeldung zur Warteliste</b>',
		]);
		expect(reached.at(-1)).toBe('👥 <b>Warteliste: 2 von 2 Kindern</b>');
		// The intake Telegram renderer frames the waitlist part with its own link text.
		const telegram = new FakeTelegramProvider();
		const sender = createOutboxRuntime(config(), { telegramProvider: telegram });
		expect(await sender.telegramWorker.dispatchNext(afterSeconds(NOW, 5))).toBe('sent');
		expect(telegram.messages[0].parseMode).toBe('HTML');
		expect(telegram.messages[0].text).toContain('Neue Anmeldung zur Warteliste');
		expect(telegram.messages[0].text).toContain(
			`<a href="https://portal.example.test/admin/trial-intake/${created.id}">Anmeldung im Portal öffnen</a>`
		);

		// The waitlist page lists both signups; the trial list shows neither.
		const admin = new IntakeAdmin(service);
		expect((await admin.list(actor, { status: 'all' }, 'r', NOW)).total).toBe(0);
		const queue = (await signup().entries(requireAdmin(actor), 'r', NOW)).get(
			plannedCourseKey(english)
		)!;
		expect(queue.map((e) => [e.requestId, e.tariff, e.status])).toEqual([
			[created.id, 'monthly', 'waiting'],
			[second.id, 'monthly', 'waiting'],
		]);
		const detail = await admin.detail(actor, created.id, 'r', NOW);
		expect(detail.waitlist).toMatchObject({
			tariff: 'monthly',
			monthlyCents: 6650,
			yearlyCents: 5905,
			minParticipants: 2,
			consentVersion: WAITLIST_CONSENT_VERSION,
			status: 'waiting',
			ageDate: '2026-09-22',
		});
		expect(detail.items).toEqual([]);
		expect(await admin.outboxContext(actor, [created.id], 'r', NOW)).toEqual({
			[created.id]: {
				deleted: false,
				kind: 'waitlist',
				parentLastName: 'Parent',
				subjects: ['English'],
				receivedAt: NOW,
			},
		});
		// "Bearbeitet" would start the deletion of a waiting signup.
		await expect(admin.setProcessed(actor, created.id, true, 'r', NOW)).rejects.toMatchObject({
			code: 'WAITLIST_ENTRY_WAITING',
		});
		expect((await service.get(created.id))!.state).toBe('verified');
	});
	it('refuses consent, changed price, age, closed, ambiguous, unpriced and ordinary lessons', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		const first = await plannedLesson({ subject: '1 E', end: '16:45', room: 'R2' });
		await price(english);
		await price(first, 5000, 4500);
		const catalog = async () => [...lessons, english, first];
		const create = (lesson: Lesson, fields: Record<string, unknown> = {}) =>
			signup().create(input(lesson, fields), catalog, NOW);
		await expect(create(english, { consent: false })).rejects.toMatchObject({
			code: 'WAITLIST_CONSENT_REQUIRED',
		});
		await expect(create(english, { expectedPriceCents: 6600 })).rejects.toMatchObject({
			code: 'WAITLIST_PRICE_CHANGED',
			status: 409,
			details: { monthlyCents: 6650, yearlyCents: 5905, minParticipants: 3 },
		});
		await expect(
			create(english, { tariff: 'yearly', expectedPriceCents: 6650 })
		).rejects.toMatchObject({ code: 'WAITLIST_PRICE_CHANGED' });
		const young = [
			{ key: 'young', firstName: 'Kind', lastName: 'Jung', birthDate: '2021-01-01' },
		];
		await expect(create(english, { children: young })).rejects.toMatchObject({
			code: 'INTAKE_CHILD_TOO_YOUNG',
		});
		// 1 E is 5-6; an eight-year-old needs the acknowledgment.
		await expect(create(first, { expectedPriceCents: 5000 })).rejects.toMatchObject({
			code: 'INTAKE_AGE_UNCONFIRMED',
		});
		await expect(
			create(first, { expectedPriceCents: 5000, ageConfirmed: true })
		).resolves.toMatchObject({
			state: 'pending_email',
		});
		await expect(create(lessons[0], { expectedPriceCents: 6650 })).rejects.toMatchObject({
			code: 'WAITLIST_LESSON_NOT_PLANNED',
		});
		const unpriced = await plannedLesson({ subject: 'Baby', weekday: 4, end: '16:45' });
		await expect(
			signup().create(input(unpriced), async () => [...lessons, unpriced], NOW)
		).rejects.toMatchObject({ code: 'WAITLIST_PRICE_MISSING' });
		// Another room is the same course entity: two cards make it ambiguous.
		const twin = await plannedLesson({ room: 'R9' });
		await expect(
			signup().create(input(english), async () => [...lessons, english, twin], NOW)
		).rejects.toMatchObject({ code: 'WAITLIST_COURSE_UNAVAILABLE' });
		await db.run({
			sql: `INSERT INTO trial_intake_closed_lessons(match_key, subject, group_name, weekday, closed_by, closed_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			params: [
				closedKey(english),
				english.subject,
				english.group,
				english.weekday,
				actor.id,
				NOW,
			],
		});
		await expect(create(english)).rejects.toMatchObject({
			code: 'WAITLIST_COURSE_UNAVAILABLE',
		});
		expect(await count("trial_intake_requests WHERE kind = 'waitlist'")).toBe(1);
	});
	it('a price edit racing the signup is refused by the trigger and reported as a changed price', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		await price(english);
		// The admin saves a new sum after the server check, right before the signup batch.
		const batch = db.batch.bind(db);
		vi.spyOn(db, 'batch').mockImplementation((async (statements: { sql: string }[]) => {
			if (statements[0]?.sql.includes('INSERT OR IGNORE INTO trial_intake_requests'))
				await db.run({
					sql: 'UPDATE trial_intake_planned_prices SET monthly_cents = 7100 WHERE course_key = ?',
					params: [plannedCourseKey(english)],
				});
			return batch(statements as never);
		}) as never);
		await expect(
			signup().create(input(english), async () => [...lessons, english], NOW)
		).rejects.toMatchObject({
			code: 'WAITLIST_PRICE_CHANGED',
			details: { monthlyCents: 7100 },
		});
		expect(await count('trial_intake_requests')).toBe(0);
		expect(await count('trial_intake_email_outbox')).toBe(0);
	});
	it('a verified device cookie never skips the verification letter', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(NOW));
		await seedAdmin();
		const english = await plannedLesson();
		await price(english);
		const html = `<script id="trial-intake-catalog" type="application/json">${JSON.stringify({
			...fixture,
			lessons: [...fixture.lessons, english],
		})}</script>`;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string | URL | Request) =>
				String(url).includes('/siteverify')
					? Response.json({
							success: true,
							action: 'trial_intake',
							hostname: 'portal.example.test',
						})
					: new Response(html)
			)
		);
		const body = { ...input(english), turnstileToken: 'synthetic-token' };
		const cookie = await verifiedDeviceValue(SECRET, body.email);
		const event = {
			platform: {
				env: {
					APP_ENV: 'test',
					DB: ctx.db,
					PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
					PORTAL_MODE: 'trial_intake',
					TRIAL_INTAKE_SCHEDULE_URL: 'https://schedule.example.test/',
					TRIAL_INTAKE_ACCEPTING: 'true',
					JWT_SECRET: SECRET,
					AUTH_PUBLIC_ENABLED: 'true',
					PRIVACY_NOTICE_VERSION: INTAKE_PRIVACY_VERSION,
					EMAIL_PROVIDER: 'fake',
					TURNSTILE_SECRET_KEY: 'synthetic-secret',
					TURNSTILE_HOSTNAMES: 'portal.example.test',
				},
			},
			url: new URL('https://portal.example.test/warteliste/submit'),
			locals: { requestId: 'synthetic' },
			getClientAddress: () => '192.0.2.1',
			cookies: { get: () => cookie },
			request: new Request('https://portal.example.test/warteliste/submit', {
				method: 'POST',
				headers: {
					origin: 'https://portal.example.test',
					'content-type': 'application/json',
				},
				body: JSON.stringify(body),
			}),
		} as unknown as RequestEvent;
		const response = await intakeEndpoint(() => waitlistSubmit(event));
		expect(response.status).toBe(200);
		const result = (await response.json()) as { id: string; state: string };
		expect(result.state).toBe('pending_email');
		expect(
			(
				await db.all({
					sql: 'SELECT kind FROM trial_intake_email_outbox WHERE request_id = ?',
					params: [result.id],
				})
			).results
		).toEqual([{ kind: 'verification' }]);
		expect(await count('trial_intake_telegram_payloads')).toBe(0);
	});
	it('a confirmation after the course start closes the signup without Telegram or letters', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		await price(english);
		const catalog = async () => [...lessons, english];
		const late = await signup().create(input(english), catalog, NOW);
		await startCourse(english);
		await expect(
			signup().create(input(english, { email: 'other@example.test' }), catalog, NOW)
		).rejects.toMatchObject({ code: 'WAITLIST_COURSE_STARTED' });
		const t = await token(late.id);
		expect(await service.verify(t, NOW)).toMatchObject({
			state: 'cancelled',
			kind: 'waitlist',
			firstDate: '2026-10-06',
		});
		expect(await service.inspectToken(t, afterSeconds(NOW, 1))).toEqual({
			state: 'cancelled',
			kind: 'waitlist',
			firstDate: '2026-10-06',
		});
		expect(await service.get(late.id)).toMatchObject({
			state: 'processed',
			verified_at: NOW,
			processed_at: NOW,
			delete_after: afterSeconds(NOW, 90 * 86400),
		});
		expect((await entry(late.id))!.status).toBe('cancelled');
		expect(await count('trial_intake_telegram_payloads')).toBe(0);
		expect(await count('telegram_outbox')).toBe(0);
		expect(
			(
				await db.all({
					sql: 'SELECT kind, status FROM trial_intake_email_outbox WHERE request_id = ?',
					params: [late.id],
				})
			).results
		).toEqual([{ kind: 'verification', status: 'cancelled' }]);
		// An entry the start already cancelled is closed the same way, even without an open start.
		await db.run({
			sql: 'UPDATE trial_intake_waitlist_starts SET reopened_by = ?, reopened_at = ?',
			params: [actor.id, NOW],
		});
		const cancelled = await signup().create(
			input(english, { email: 'third@example.test' }),
			catalog,
			NOW
		);
		await db.run({
			sql: `UPDATE trial_intake_waitlist_entries SET status = 'cancelled' WHERE request_id = ?`,
			params: [cancelled.id],
		});
		expect(await service.verify(await token(cancelled.id), NOW)).toMatchObject({
			state: 'cancelled',
			firstDate: null,
		});
		expect(await count('trial_intake_telegram_payloads')).toBe(0);
	});
});
describe('waitlist withdrawal, retention and access (WL-12, WL-13, WL-AC-11, WL-AC-12)', () => {
	async function confirmed(lesson: Lesson, email = 'guest@example.test') {
		const created = await signup().create(
			input(lesson, { email }),
			async () => [...lessons, lesson],
			NOW
		);
		await service.verify(await token(created.id), NOW);
		return created.id;
	}
	it('withdraws by link and by the admin, idempotently, and refuses foreign and late tokens', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		await price(english);
		const id = await confirmed(english);
		const link = await withdrawToken(SECRET, (await entry(id))!);
		const later = afterSeconds(NOW, 60);
		expect(await signup().inspectWithdrawal(link, later)).toEqual({
			state: 'confirm',
			course: {
				subject: 'English',
				weekday: 2,
				start: '16:00',
				end: '17:00',
				room: 'R1',
				building: 'Villa',
			},
		});
		// GET changes nothing.
		expect((await entry(id))!.status).toBe('waiting');
		expect(await signup().withdraw(link, 'withdraw', later)).toEqual({ state: 'withdrawn' });
		expect(await signup().withdraw(link, 'withdraw-again', afterSeconds(later, 1))).toEqual({
			state: 'withdrawn',
		});
		expect((await signup().inspectWithdrawal(link, later)).state).toBe('withdrawn');
		expect(await service.get(id)).toMatchObject({
			state: 'processed',
			processed_at: later,
			delete_after: afterSeconds(later, 90 * 86400),
		});
		const audits = (
			await db.all<{ actor_kind: string; target_id: string; safe_diff_json: string }>({
				sql: `SELECT actor_kind, target_id, safe_diff_json FROM audit_events WHERE action = 'trial_intake.waitlist_withdrawn'`,
			})
		).results;
		expect(audits).toEqual([
			{ actor_kind: 'guest', target_id: id, safe_diff_json: '{"by":"guest"}' },
		]);
		// The price is no longer locked once nobody waits.
		const prices = new WaitlistPrices(db);
		await expect(
			prices.setPrice(
				actor,
				english,
				{ monthlyCents: 7000, yearlyCents: 6000, minParticipants: 3 },
				'r',
				later
			)
		).resolves.toEqual({ changed: true });
		await prices.setPrice(
			actor,
			english,
			{ monthlyCents: 6650, yearlyCents: 5905, minParticipants: 3 },
			'r',
			later
		);

		await expect(signup().withdraw('f'.repeat(64), 'r', later)).rejects.toMatchObject({
			code: 'WAITLIST_WITHDRAW_INVALID',
		});
		const other = await withdrawToken(
			'different-secret-of-32-characters!!',
			(await entry(id))!
		);
		await expect(signup().withdraw(other, 'r', later)).rejects.toMatchObject({
			code: 'WAITLIST_WITHDRAW_INVALID',
		});
		expect((await signup().inspectWithdrawal('not-a-token', later)).state).toBe('invalid');

		const baby = await plannedLesson({ subject: 'Baby', weekday: 4, end: '16:45' });
		await price(baby);
		const toddler = [
			{ key: 't', firstName: 'Kind', lastName: 'Klein', birthDate: '2024-01-01' },
		];
		const byPhone = await signup().create(
			input(baby, { children: toddler, email: 'phone@example.test' }),
			async () => [...lessons, baby],
			NOW
		);
		// An unconfirmed signup expires by itself; the admin cannot withdraw it.
		await expect(signup().withdrawByAdmin(actor, byPhone.id, 'r', later)).rejects.toMatchObject(
			{
				code: 'WAITLIST_STATUS_CONFLICT',
			}
		);
		await service.verify(await token(byPhone.id), NOW);
		expect(await signup().withdrawByAdmin(actor, byPhone.id, 'admin-withdraw', later)).toEqual({
			state: 'withdrawn',
		});
		await expect(signup().withdrawByAdmin(actor, byPhone.id, 'r', later)).rejects.toMatchObject(
			{
				code: 'WAITLIST_STATUS_CONFLICT',
			}
		);
		expect(
			await db.first({
				sql: `SELECT actor_user_id, actor_kind, safe_diff_json FROM audit_events
				 WHERE action = 'trial_intake.waitlist_withdrawn' AND target_id = ?`,
				params: [byPhone.id],
			})
		).toEqual({
			actor_user_id: actor.id,
			actor_kind: 'user',
			safe_diff_json: '{"by":"admin"}',
		});
		// "Bearbeitet" is possible again after the withdrawal.
		await expect(
			new IntakeAdmin(service).setProcessed(actor, byPhone.id, false, 'r', later)
		).resolves.toMatchObject({ state: 'verified' });

		// After the start the link sends the family to the bureau.
		const started = await confirmed(english, 'started@example.test');
		const startedLink = await withdrawToken(SECRET, (await entry(started))!);
		await startCourse(english);
		expect((await signup().inspectWithdrawal(startedLink, later)).state).toBe('started');
		await expect(signup().withdraw(startedLink, 'r', later)).rejects.toMatchObject({
			code: 'WAITLIST_COURSE_STARTED',
		});
		expect((await entry(started))!.status).toBe('waiting');
	});
	it('deletes unconfirmed after 14 days, waiting after 12 months and withdrawn 90 days later', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		await price(english);
		const unconfirmed = (
			await signup().create(
				input(english, { email: 'pending@example.test' }),
				async () => [...lessons, english],
				NOW
			)
		).id;
		const waiting = await confirmed(english, 'waiting@example.test');
		const withdrawn = await confirmed(english, 'withdrawn@example.test');
		await signup().withdraw(await withdrawToken(SECRET, (await entry(withdrawn))!), 'r', NOW);
		const exists = async (id: string) =>
			(await count('trial_intake_requests WHERE id = ?', [id])) === 1;
		await cleanupIntake(db, afterSeconds(NOW, 14 * 86400 - 1));
		expect(await exists(unconfirmed)).toBe(true);
		await cleanupIntake(db, afterSeconds(NOW, 14 * 86400 + 1));
		expect(await exists(unconfirmed)).toBe(false);
		expect(
			await count('trial_intake_waitlist_entries WHERE request_id = ?', [unconfirmed])
		).toBe(0);
		expect(await exists(waiting)).toBe(true);
		await cleanupIntake(db, afterSeconds(NOW, 90 * 86400 - 1));
		expect(await exists(withdrawn)).toBe(true);
		await cleanupIntake(db, afterSeconds(NOW, 90 * 86400 + 1));
		expect(await exists(withdrawn)).toBe(false);
		expect(await exists(waiting)).toBe(true);
		await cleanupIntake(db, '2027-09-15T12:00:00.000Z');
		expect(await exists(waiting)).toBe(true);
		await cleanupIntake(db, '2027-09-16T12:00:00.001Z');
		expect(await exists(waiting)).toBe(false);
		expect(await count('trial_intake_children')).toBe(0);
		expect(await count('trial_intake_waitlist_entries')).toBe(0);
		expect(await count('trial_intake_telegram_payloads')).toBe(0);
		expect(
			await count(
				`audit_events WHERE action = 'trial_intake.retention_deleted' AND safe_diff_json = '{}'`
			)
		).toBe(3);
	});
	it('anonymous and non-admin users read no prices, signups or signup cards', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		await price(english);
		const id = await confirmed(english);
		const event = (path: string, user?: App.Locals['user']) =>
			({
				platform: {
					env: {
						APP_ENV: 'test',
						DB: ctx.db,
						PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
						PORTAL_MODE: 'trial_intake',
						TRIAL_INTAKE_SCHEDULE_URL: 'https://schedule.example.test/',
						TRIAL_INTAKE_ACCEPTING: 'true',
						JWT_SECRET: SECRET,
						AUTH_PUBLIC_ENABLED: 'true',
						PRIVACY_NOTICE_VERSION: INTAKE_PRIVACY_VERSION,
						EMAIL_PROVIDER: 'fake',
					},
				},
				url: new URL(`https://portal.example.test${path}`),
				params: { id },
				locals: { requestId: 'synthetic', user },
				request: new Request(`https://portal.example.test${path}`),
			}) as unknown as RequestEvent;
		const parent = { ...actor, id: 'synthetic-parent', role: 'parent' as const };
		for (const [user, status] of [
			[undefined, 401],
			[parent, 403],
		] as const) {
			expect(
				(
					await intakeEndpoint(() =>
						adminWaitlistPrice(event('/admin/trial-intake/warteliste', user))
					)
				).status
			).toBe(status);
			expect(
				(await intakeEndpoint(() => adminDetail(event(`/admin/trial-intake/${id}`, user))))
					.status
			).toBe(status);
		}
		expect(await count(`audit_events WHERE action = 'trial_intake.waitlist_read'`)).toBe(0);
	});
});

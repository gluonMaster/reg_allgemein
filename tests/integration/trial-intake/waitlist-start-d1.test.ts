import type { RequestEvent } from '@sveltejs/kit';
import { WaitlistSignup, courseState } from '$lib/trial-intake/server/waitlist.server';
import { WaitlistStart, startDates } from '$lib/trial-intake/server/waitlist-start.server';
import { documentFileName } from '$lib/trial-intake/server/waitlist-pdf.server';
import { WaitlistPrices } from '$lib/trial-intake/server/prices.server';
import { IntakeAdmin } from '$lib/trial-intake/server/admin.server';
import { cleanupIntake } from '$lib/trial-intake/server/cleanup.server';
import { lessonIdentity } from '$lib/trial-intake/server/catalog.server';
import { plannedCourseKey } from '$lib/trial-intake/planned';
import { afterSeconds, verificationToken } from '$lib/trial-intake/server/service.server';
import {
	adminWaitlistPdf,
	adminWaitlistStart,
	intakeEndpoint,
	waitlistAttention,
} from '$lib/trial-intake/server/http.server';
import { createOutboxRuntime } from '$lib/server/outbox/runtime';
import { EmailProviderError, FakeEmailProvider } from '$lib/server/outbox/providers';
import { ContractPdfError, type ContractPdfAdapter } from '$lib/server/contracts/pdf';
import { hashCsrfToken } from '$lib/server/auth/tokens';
import { sha256Bytes } from '$lib/server/security/digest';
import { ORGANIZATION_NAME } from '$lib/organization';
import {
	INTAKE_PRIVACY_VERSION,
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
const FIRST = '2026-09-29';
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
function price(lesson: Lesson, min = 2, monthly = 6650, yearly = 5905) {
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
// Children with umlauts and Cyrillic; eight years old on the next Tuesday ("ab 6 Jahren").
const CHILDREN = [
	{ key: 'a', firstName: 'Jürgen', lastName: 'Größe', birthDate: '2018-03-01' },
	{ key: 'b', firstName: 'Мария', lastName: 'Иванова', birthDate: '2018-05-01' },
];
async function signup(lesson: Lesson, email: string, children = 1, confirm = true) {
	const created = await new WaitlistSignup(service, SECRET).create(
		{
			idempotencyKey: crypto.randomUUID(),
			parentFirstName: 'Synthetic',
			parentLastName: `Parent-${email.slice(0, 1)}`,
			email,
			phone: '+49 000000000',
			locale: 'de',
			privacyVersion: WAITLIST_PRIVACY_VERSION,
			children: CHILDREN.slice(0, children),
			lessonId: lesson.id,
			tariff: 'monthly',
			expectedPriceCents: 6650,
			consent: true,
		},
		async () => [...lessons, lesson],
		NOW
	);
	if (confirm)
		await service.verify(
			await verificationToken(SECRET, (await service.get(created.id))!),
			NOW
		);
	return created.id;
}
const count = async (sql: string, params: unknown[] = []) =>
	(await db.first<{ n: number }>({ sql: `SELECT COUNT(*) AS n FROM ${sql}`, params }))?.n;
const starter = (renderer = true) => new WaitlistStart(db, new WaitlistPrices(db), renderer);
const status = async (id: string) =>
	(await db.first<{ status: string; start_id: string | null }>({
		sql: 'SELECT status, start_id FROM trial_intake_waitlist_entries WHERE request_id = ?',
		params: [id],
	}))!;
/** Sends what is queued with the fake provider until the queue is empty. */
async function drain(runtime: ReturnType<typeof createOutboxRuntime>, at: string) {
	for (let i = 0; i < 20; i++)
		if ((await runtime.emailWorker.dispatchNext(at)) === 'empty') return;
}

describe('waitlist course start readiness and dates (WL-10)', () => {
	it('offers the next eight allowed dates of the weekday, a week ahead by default', () => {
		expect(startDates(2, NOW)).toEqual({
			dates: [
				'2026-09-22',
				'2026-09-29',
				'2026-10-06',
				'2026-10-13',
				'2026-10-20',
				'2026-10-27',
				'2026-11-03',
				'2026-11-10',
			],
			defaultDate: '2026-09-29',
		});
		// From Tuesday 1 December: today is no option and the Christmas holidays are skipped.
		const december = startDates(2, '2026-12-01T12:00:00.000Z');
		expect(december.dates.slice(0, 4)).toEqual([
			'2026-12-08',
			'2026-12-15',
			'2026-12-22',
			'2027-01-05',
		]);
		expect(december.defaultDate).toBe('2026-12-08');
	});
	it('needs a price, the threshold, one unambiguous card and a renderer; the server checks the date', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		const catalog = [...lessons, english];
		const key = plannedCourseKey(english);
		const options = async (list: readonly Lesson[] = catalog, renderer = true) =>
			starter(renderer).options((await new WaitlistPrices(db).course(list, key))!, NOW)!;
		expect(await options()).toMatchObject({ start: 'price_missing', probe: 'price_missing' });
		await price(english, 2);
		expect(await options()).toMatchObject({ start: 'threshold', probe: 'no_entries' });
		await signup(english, 'a@example.test');
		await signup(english, 'p@example.test', 1, false);
		// One child of a confirmed signup; the unconfirmed one does not count.
		expect(await options()).toMatchObject({ start: 'threshold', probe: null });
		const body = { lessonId: english.id, firstDate: FIRST, checked: true };
		await expect(starter().start(actor, catalog, body, 'r', NOW)).rejects.toMatchObject({
			code: 'WAITLIST_START_THRESHOLD',
		});
		await signup(english, 'b@example.test');
		expect(await options()).toMatchObject({ start: null, probe: null });
		expect(await options(catalog, false)).toMatchObject({
			start: 'renderer',
			probe: 'renderer',
		});
		await expect(starter(false).start(actor, catalog, body, 'r', NOW)).rejects.toMatchObject({
			code: 'WAITLIST_START_RENDERER',
		});
		// A second card of the same course (another editor suffix and room) blocks both actions.
		const twin = await plannedLesson({ group: `${PLANNED} 1`, room: 'R9' });
		expect(await options([...catalog, twin])).toMatchObject({
			start: 'ambiguous',
			probe: 'ambiguous',
		});
		const later = '2026-12-01T12:00:00.000Z';
		for (const firstDate of ['2026-12-01', '2026-12-09', '2026-12-29', '2026-09-29']) {
			await expect(
				starter().start(actor, catalog, { ...body, firstDate }, 'r', later)
			).rejects.toMatchObject({ code: 'WAITLIST_START_DATE_INVALID' });
		}
		await expect(
			starter().start(actor, catalog, { ...body, checked: undefined }, 'r', NOW)
		).rejects.toMatchObject({ code: 'WAITLIST_START_UNCHECKED' });
		expect(await count('trial_intake_waitlist_starts')).toBe(0);
		expect(await count('trial_intake_waitlist_email_outbox')).toBe(0);
	});
});

describe('waitlist course start, letters and PDF (WL-10, WL-11)', () => {
	it('starts in one batch: confirmed started, unconfirmed cancelled, one letter per family; a double click repeats nothing', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		const catalog = [...lessons, english];
		await price(english, 3);
		const a = await signup(english, 'a@example.test');
		const b = await signup(english, 'b@example.test', 2);
		const pending = await signup(english, 'p@example.test', 1, false);
		const body = { lessonId: english.id, firstDate: FIRST, checked: true };
		const first = await starter().start(actor, catalog, body, 'r1', NOW);
		expect(first).toMatchObject({ firstDate: FIRST, participants: 3, created: true });
		const again = await starter().start(
			actor,
			catalog,
			{ ...body, firstDate: '2026-10-06' },
			'r2',
			NOW
		);
		expect(again).toEqual({ ...first, created: false });
		expect(await status(a)).toEqual({ status: 'started', start_id: first.startId });
		expect(await status(b)).toEqual({ status: 'started', start_id: first.startId });
		expect(await status(pending)).toEqual({ status: 'cancelled', start_id: null });
		expect(await count('trial_intake_waitlist_starts')).toBe(1);
		const start = await db.first<{
			lesson_json: string;
			participants: number;
			started_by: string;
		}>({
			sql: 'SELECT lesson_json, participants, started_by FROM trial_intake_waitlist_starts',
		});
		expect(JSON.parse(start!.lesson_json)).toEqual(english);
		expect(start).toMatchObject({ participants: 3, started_by: actor.id });
		expect(
			(
				await db.all<{ kind: string; request_id: string; status: string }>({
					sql: 'SELECT kind, request_id, status FROM trial_intake_waitlist_email_outbox ORDER BY request_id',
				})
			).results
		).toEqual(
			[a, b].sort().map((request_id) => ({ kind: 'start', request_id, status: 'pending' }))
		);
		const audit = await db.all<{ safe_diff_json: string }>({
			sql: `SELECT safe_diff_json FROM audit_events WHERE action = 'trial_intake.waitlist_started'`,
		});
		expect(audit.results.map((row) => JSON.parse(row.safe_diff_json))).toEqual([
			{ key: plannedCourseKey(english), firstDate: FIRST, participants: 3 },
		]);
		expect(await courseState(db, catalog, english)).toEqual({
			state: 'started',
			firstDate: FIRST,
		});
		// The family that confirms only now is not added: no Telegram, no letter (WL-AC-09).
		const t = await verificationToken(SECRET, (await service.get(pending))!);
		expect(await service.verify(t, afterSeconds(NOW, 60))).toMatchObject({
			state: 'cancelled',
			firstDate: FIRST,
		});
		expect(await count('trial_intake_telegram_payloads WHERE request_id = ?', [pending])).toBe(
			0
		);
		expect(
			await count(
				`trial_intake_email_outbox WHERE request_id = ? AND kind = 'confirmation'`,
				[pending]
			)
		).toBe(0);
		expect(
			await count('trial_intake_waitlist_email_outbox WHERE request_id = ?', [pending])
		).toBe(0);
	});
	it('sends the probe with PDF to the signed-in admin, stores nothing and changes no signup', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		const catalog = [...lessons, english];
		await price(english, 3);
		const a = await signup(english, 'a@example.test', 2);
		const pending = await signup(english, 'p@example.test', 1, false);
		const probe = { lessonId: english.id, firstDate: FIRST, requestId: a };
		const preview = await starter().preview(actor, catalog, probe, NOW);
		expect(preview.subject).toBe(
			`Ihr Kurs English beginnt am 29.09.2026 — ${ORGANIZATION_NAME}`
		);
		expect(preview.text).toContain('Angemeldet: Jürgen Größe, Мария Иванова');
		await expect(
			starter().probe(actor, catalog, { ...probe, requestId: pending }, 'r', NOW)
		).rejects.toMatchObject({ code: 'WAITLIST_STATUS_CONFLICT' });
		expect(await starter().probe(actor, catalog, probe, 'r', NOW)).toEqual({ queued: true });
		expect(await status(a)).toEqual({ status: 'waiting', start_id: null });
		expect(await count('trial_intake_waitlist_starts')).toBe(0);
		const audit = await db.first<{ target_id: string; safe_diff_json: string }>({
			sql: `SELECT target_id, safe_diff_json FROM audit_events WHERE action = 'trial_intake.waitlist_probe_sent'`,
		});
		expect(audit).toEqual({
			target_id: a,
			safe_diff_json: JSON.stringify({ key: plannedCourseKey(english), firstDate: FIRST }),
		});
		const email = new FakeEmailProvider();
		const runtime = createOutboxRuntime(config(), { emailProvider: email });
		await drain(runtime, NOW);
		const sent = email.messages.filter((m) => m.to === 'admin@example.test');
		expect(sent).toHaveLength(1);
		expect(sent[0].subject).toBe(
			`[PROBE] Ihr Kurs English beginnt am 29.09.2026 — ${ORGANIZATION_NAME}`
		);
		expect(sent[0].text).toBe(preview.text);
		expect(sent[0].attachments).toHaveLength(1);
		expect(sent[0].attachments![0].filename).toBe('Anmeldebestaetigung-English-29.09.2026.pdf');
		expect(new TextDecoder().decode(sent[0].attachments![0].content.slice(0, 5))).toBe('%PDF-');
		expect(
			email.messages.some((m) => m.to === 'a@example.test' && m.subject.includes('beginnt'))
		).toBe(false);
		expect(await count('trial_intake_waitlist_documents')).toBe(0);
		expect(
			await count(
				`trial_intake_waitlist_render_usage WHERE kind = 'probe' AND status = 'succeeded'`
			)
		).toBe(1);
		expect(await status(a)).toEqual({ status: 'waiting', start_id: null });
	});
	it('stores the PDF once, resends the same file on retry and keeps the sum of the snapshot after a price change', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		const catalog = [...lessons, english];
		await price(english, 1);
		const a = await signup(english, 'a@example.test', 2);
		const email = new FakeEmailProvider();
		const runtime = createOutboxRuntime(config(), { emailProvider: email });
		await drain(runtime, NOW);
		await starter().start(
			actor,
			catalog,
			{ lessonId: english.id, firstDate: FIRST, checked: true },
			'r',
			NOW
		);
		// No waiting signup is left, so the bureau may change the price: the letter keeps 66,50 €.
		await new WaitlistPrices(db).setPrice(
			actor,
			english,
			{ monthlyCents: 7000, yearlyCents: 6000, minParticipants: 1 },
			'r',
			NOW
		);
		email.failNext(new EmailProviderError('RESEND_UNAVAILABLE', true));
		expect(await runtime.emailWorker.dispatchNext(afterSeconds(NOW, 1))).toBe('retry');
		const stored = await db.first<{ sha256: string; byte_size: number; renderer: string }>({
			sql: 'SELECT sha256, byte_size, renderer FROM trial_intake_waitlist_documents WHERE request_id = ?',
			params: [a],
		});
		expect(stored).toMatchObject({ renderer: 'synthetic-test-pdf-v1' });
		expect(stored!.byte_size).toBeLessThanOrEqual(1024 * 1024);
		expect(await runtime.emailWorker.dispatchNext(afterSeconds(NOW, 120))).toBe('sent');
		const [letter] = email.messages.filter(
			(m) => m.to === 'a@example.test' && m.subject.includes('beginnt')
		);
		expect(letter.subject).toBe(
			`Ihr Kurs English beginnt am 29.09.2026 — ${ORGANIZATION_NAME}`
		);
		const lines = letter.text.split('\n');
		expect(lines).toEqual(
			expect.arrayContaining([
				'Erster Termin: Dienstag, 29.09.2026, 16:00–17:00',
				'Ort: Villa, Kraftwerk Mitte 2 • 01067 Dresden, Raum R1',
				'Angemeldet: Jürgen Größe, Мария Иванова',
				'Ihr Tarif: Monatsvertrag, 66,50 € pro Monat je Kind (bei Ihrer Anmeldung festgelegt)',
				'Tel. +49 179 9474938',
			])
		);
		expect(letter.text).toContain(
			'Wichtig: Bitte kommen Sie bis zum ersten Termin am 29.09.2026 in unser Büro in der Villa der Kulturen (Kraftwerk Mitte 2 • 01067 Dresden) und schließen Sie den Vertrag ab. Bürozeiten: Mo–Fr 9–18 Uhr, Sa 9–14 Uhr.'
		);
		expect(letter.text).not.toContain('70,00');
		expect(await sha256Bytes(letter.attachments![0].content as Uint8Array<ArrayBuffer>)).toBe(
			stored!.sha256
		);
		expect(await count('trial_intake_waitlist_documents')).toBe(1);
		expect(await count('trial_intake_waitlist_render_usage')).toBe(1);
		expect(
			await db.first({
				sql: 'SELECT status, attempts, pdf_sha256 FROM trial_intake_waitlist_email_outbox WHERE request_id = ?',
				params: [a],
			})
		).toEqual({ status: 'sent', attempts: 2, pdf_sha256: stored!.sha256 });
		const card = await new IntakeAdmin(service).detail(actor, a, 'r', NOW);
		expect(card.waitlist).toMatchObject({
			status: 'started',
			start: { firstDate: FIRST, participants: 2, lesson: english },
			letters: [{ status: 'sent', attempts: 2, lastErrorCode: null }],
			document: { sha256: stored!.sha256, byteSize: stored!.byte_size },
		});
		// Processed and 90 days later the request goes with its PDF and letters (no separate cleanup).
		await new IntakeAdmin(service).setProcessed(actor, a, true, 'r', NOW);
		await cleanupIntake(db, afterSeconds(NOW, 91 * 86400));
		expect(await count('trial_intake_waitlist_documents')).toBe(0);
		expect(await count('trial_intake_waitlist_email_outbox')).toBe(0);
	});
	it('a passing Browser Run failure keeps the letter in retry, a permanent one makes it dead until the admin retries', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		await price(english, 1);
		const a = await signup(english, 'a@example.test');
		const email = new FakeEmailProvider();
		await drain(createOutboxRuntime(config(), { emailProvider: email }), NOW);
		await starter().start(
			actor,
			[...lessons, english],
			{ lessonId: english.id, firstDate: FIRST, checked: true },
			'r',
			NOW
		);
		const failing = (error: Error): ContractPdfAdapter => ({
			rendererId: 'cloudflare-browser-run-pdf-v1',
			rendererContractVersion: 'pdf-adapter-v1',
			render: async () => {
				throw error;
			},
		});
		const letter = () =>
			db.first<{ status: string; last_error_code: string | null }>({
				sql: 'SELECT status, last_error_code FROM trial_intake_waitlist_email_outbox WHERE request_id = ?',
				params: [a],
			});
		const busy = createOutboxRuntime(config(), {
			emailProvider: email,
			waitlistPdfAdapter: failing(new ContractPdfError('BROWSER_RUN_429', true)),
		});
		expect(await busy.emailWorker.dispatchNext(afterSeconds(NOW, 1))).toBe('retry');
		expect(await letter()).toEqual({ status: 'retry', last_error_code: 'BROWSER_RUN_429' });
		const budget = createOutboxRuntime(config(), {
			emailProvider: email,
			waitlistPdfAdapter: failing(new ContractPdfError('BROWSER_DAILY_BUDGET_EXCEEDED')),
		});
		expect(await budget.emailWorker.dispatchNext(afterSeconds(NOW, 600))).toBe('retry');
		const broken = createOutboxRuntime(config(), {
			emailProvider: email,
			waitlistPdfAdapter: failing(new ContractPdfError('BROWSER_RUN_400')),
		});
		expect(await broken.emailWorker.dispatchNext(afterSeconds(NOW, 1200))).toBe('dead');
		expect(await letter()).toEqual({ status: 'dead', last_error_code: 'BROWSER_RUN_400' });
		expect(await count('trial_intake_waitlist_documents')).toBe(0);
		expect(
			await count(
				`trial_intake_waitlist_render_usage WHERE status = 'failed' AND error_code IS NOT NULL`
			)
		).toBe(3);
		const [id] = (
			await new IntakeAdmin(service).detail(actor, a, 'r', NOW)
		).waitlist!.letters.map((l) => l.id);
		expect(await starter().retryLetter(actor, a, id, 'r', NOW)).toEqual({ queued: true });
		expect(await letter()).toEqual({ status: 'retry', last_error_code: null });
		expect(
			await count(`audit_events WHERE action = 'trial_intake.waitlist_letter_retry'`)
		).toBe(1);
		await drain(
			createOutboxRuntime(config(), { emailProvider: email }),
			afterSeconds(NOW, 1300)
		);
		expect(await letter()).toMatchObject({ status: 'sent' });
	});
});

describe('waitlist start and PDF HTTP boundary (WL-AC-12)', () => {
	const csrf = 'synthetic-csrf-token';
	const parent = { ...actor, id: 'synthetic-parent', role: 'parent' as const };
	function event(
		path: string,
		user: unknown,
		body?: unknown,
		params: Record<string, string> = {}
	) {
		return {
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
			params,
			locals: { requestId: 'synthetic', user },
			getClientAddress: () => '192.0.2.1',
			cookies: { get: (name: string) => (name === 'kolibri_csrf' ? csrf : undefined) },
			request: new Request(`https://portal.example.test${path}`, {
				method: body ? 'POST' : 'GET',
				headers: {
					origin: 'https://portal.example.test',
					'content-type': 'application/json',
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		} as unknown as RequestEvent;
	}
	it('refuses anonymous and non-admin users and an absent CSRF token; the PDF download is audited', async () => {
		await seedAdmin();
		const english = await plannedLesson();
		await price(english, 1);
		const a = await signup(english, 'a@example.test');
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						`<script id="trial-intake-catalog" type="application/json">${JSON.stringify({ version: 1, lessons: [english] })}</script>`
					)
			)
		);
		const admin = { ...actor, csrfHash: await hashCsrfToken(csrf) };
		const path = '/admin/trial-intake/warteliste/start';
		// The endpoints use the real clock, so the date comes from today's options.
		const first = startDates(english.weekday, new Date().toISOString()).defaultDate;
		const body = {
			action: 'start',
			lessonId: english.id,
			firstDate: first,
			checked: true,
			_csrf: csrf,
		};
		const post = async (user: unknown, value: unknown) =>
			(await intakeEndpoint(() => adminWaitlistStart(event(path, user, value)))).status;
		expect(await post(undefined, body)).toBe(401);
		expect(await post({ ...parent, csrfHash: admin.csrfHash }, body)).toBe(403);
		expect(await post(admin, { ...body, _csrf: undefined })).toBe(403);
		expect(await post(admin, { ...body, action: 'probe', requestId: a })).toBe(200);
		expect(await count('trial_intake_waitlist_starts')).toBe(0);
		expect(await post(admin, body)).toBe(200);
		expect(await count('trial_intake_waitlist_starts')).toBe(1);
		expect(await waitlistAttention(event('/admin/trial-intake', admin))).toMatchObject({
			startLetters: { unsent: 1, dead: 0 },
		});
		const pdfPath = `/admin/trial-intake/${a}/pdf`;
		// No document before the first dispatch of the letter.
		expect((await adminWaitlistPdf(event(pdfPath, admin, undefined, { id: a }))).status).toBe(
			404
		);
		await drain(createOutboxRuntime(config(), { emailProvider: new FakeEmailProvider() }), NOW);
		expect(
			(await adminWaitlistPdf(event(pdfPath, undefined, undefined, { id: a }))).status
		).toBe(401);
		expect((await adminWaitlistPdf(event(pdfPath, parent, undefined, { id: a }))).status).toBe(
			403
		);
		expect(await count(`audit_events WHERE action = 'trial_intake.waitlist_pdf_read'`)).toBe(0);
		const response = await adminWaitlistPdf(event(pdfPath, admin, undefined, { id: a }));
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/pdf');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('content-disposition')).toBe(
			`attachment; filename="${documentFileName('English', first)}"`
		);
		const bytes = new Uint8Array(await response.arrayBuffer());
		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
		const audit = await db.first<{
			target_id: string;
			actor_user_id: string;
			safe_diff_json: string;
		}>({
			sql: `SELECT target_id, actor_user_id, safe_diff_json FROM audit_events WHERE action = 'trial_intake.waitlist_pdf_read'`,
		});
		expect(audit).toEqual({
			target_id: a,
			actor_user_id: actor.id,
			safe_diff_json: JSON.stringify({ sha256: await sha256Bytes(bytes) }),
		});
		expect(await waitlistAttention(event('/admin/trial-intake', admin))).toMatchObject({
			startLetters: { unsent: 0, dead: 0 },
		});
	});
});

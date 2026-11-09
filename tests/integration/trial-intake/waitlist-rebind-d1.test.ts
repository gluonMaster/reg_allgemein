import type { RequestEvent } from '@sveltejs/kit';
import { WaitlistSignup, courseState } from '$lib/trial-intake/server/waitlist.server';
import { WaitlistStart, startDates } from '$lib/trial-intake/server/waitlist-start.server';
import { WaitlistPrices } from '$lib/trial-intake/server/prices.server';
import { WaitlistRebind, rebindOptions } from '$lib/trial-intake/server/waitlist-rebind.server';
import { readEntry, withdrawToken } from '$lib/trial-intake/server/waitlist-core.server';
import { IntakeAdmin } from '$lib/trial-intake/server/admin.server';
import { lessonIdentity } from '$lib/trial-intake/server/catalog.server';
import { plannedCourseKey } from '$lib/trial-intake/planned';
import { afterSeconds, verificationToken } from '$lib/trial-intake/server/service.server';
import {
	adminWaitlistMarks,
	adminWaitlistRebind,
	adminWaitlistReopen,
	intakeEndpoint,
	loadWaitlistPrices,
	verify,
	waitlistAttention,
} from '$lib/trial-intake/server/http.server';
import { createOutboxRuntime } from '$lib/server/outbox/runtime';
import { FakeEmailProvider } from '$lib/server/outbox/providers';
import { SyntheticContractPdfAdapter, type ContractPdfAdapter } from '$lib/server/contracts/pdf';
import { hashCsrfToken } from '$lib/server/auth/tokens';
import {
	INTAKE_PRIVACY_VERSION,
	WAITLIST_PRIVACY_VERSION,
	type Lesson,
	type WaitlistTariff,
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

// WL-15 (OQ-051): rebind of a queue whose planned card left the schedule. Synthetic data only.
const PLANNED = 'Der Kurs befindet sich in der Planung';
/** An hour after the signups of NOW: the rebind comes later than every signup it moves. */
const LATER = afterSeconds(NOW, 3600);
async function card(fields: Partial<Lesson> = {}): Promise<Lesson> {
	const value = {
		subject: 'Russisch',
		group: PLANNED,
		weekday: 2,
		start: '16:00',
		end: '16:45',
		teacher: 'Lehrkraft A',
		room: 'R2',
		building: 'Kolibri' as const,
		...fields,
	};
	return { id: await lessonIdentity(value), ...value };
}
const prices = () => new WaitlistPrices(db);
const signupService = () => new WaitlistSignup(service, SECRET);
const rebinder = () => new WaitlistRebind(db, prices(), signupService());
const starter = () => new WaitlistStart(db, prices(), true);
function setPrice(lesson: Lesson, min = 3, monthlyCents = 6650, yearlyCents = 5905) {
	return prices().setPrice(
		actor,
		lesson,
		{ monthlyCents, yearlyCents, minParticipants: min },
		'r',
		NOW
	);
}
async function signup(
	lesson: Lesson,
	email: string,
	options: {
		children?: number;
		confirm?: boolean;
		tariff?: WaitlistTariff;
		cents?: number;
		at?: string;
	} = {}
) {
	const { children = 1, confirm = true, tariff = 'monthly', at = NOW } = options;
	const created = await signupService().create(
		{
			idempotencyKey: crypto.randomUUID(),
			parentFirstName: 'Synthetic',
			parentLastName: `Parent-${email.slice(0, 1)}`,
			email,
			phone: '+49 000000000',
			locale: 'de',
			privacyVersion: WAITLIST_PRIVACY_VERSION,
			children: Array.from({ length: children }, (_, i) => ({
				key: `c${i}`,
				firstName: `Kind${i}`,
				lastName: 'Synthetic',
				birthDate: '2018-03-01',
			})),
			lessonId: lesson.id,
			tariff,
			expectedPriceCents: options.cents ?? (tariff === 'monthly' ? 6650 : 5905),
			consent: true,
		},
		async () => [...lessons, lesson],
		at
	);
	if (confirm)
		await service.verify(await verificationToken(SECRET, (await service.get(created.id))!), at);
	return created.id;
}
const count = async (sql: string, params: unknown[] = []) =>
	Number((await db.first<{ n: number }>({ sql: `SELECT COUNT(*) AS n FROM ${sql}`, params }))?.n);
const entry = async (id: string) => (await readEntry(db, id))!;
const priceRow = (key: string) =>
	db.first<{
		monthly_cents: number;
		yearly_cents: number;
		min_participants: number;
		attention_reasons_json: string | null;
	}>({
		sql: 'SELECT monthly_cents, yearly_cents, min_participants, attention_reasons_json FROM trial_intake_planned_prices WHERE course_key = ?',
		params: [key],
	});
const audits = async (action: string) =>
	(
		await db.all<{ target_id: string; safe_diff_json: string }>({
			sql: 'SELECT target_id, safe_diff_json FROM audit_events WHERE action = ? ORDER BY created_at',
			params: [action],
		})
	).results;
async function course(catalog: readonly Lesson[], key: string) {
	const data = await prices().overview(actor, catalog);
	return [...data.courses, ...data.unscheduled].find((c) => c.key === key)!;
}
async function drain(runtime: ReturnType<typeof createOutboxRuntime>, at: string) {
	for (let i = 0; i < 30; i++)
		if ((await runtime.emailWorker.dispatchNext(at)) === 'empty') return;
}

describe('rebind of a queue (WL-15)', () => {
	it('plain: spelling and building move the queue without a mark; the snapshot and the withdrawal link stay; a repeat changes nothing', async () => {
		await seedAdmin();
		const old = await card();
		const target = await card({ subject: 'Russisch1', building: 'Villa', room: 'V1' });
		await setPrice(old, 3);
		const a = await signup(old, 'a@example.test');
		const b = await signup(old, 'b@example.test', { children: 2 });
		const pending = await signup(old, 'p@example.test', { confirm: false });
		const snapshot = (await entry(a)).lesson_json;
		const catalog = [...lessons, target];
		const [oldKey, toKey] = [plannedCourseKey(old), plannedCourseKey(target)];
		const gone = await course(catalog, oldKey);
		expect(gone).toMatchObject({ status: 'gone', activeEntries: 3, waitingFamilies: 2 });
		const options = rebindOptions(gone, await prices().overview(actor, catalog))!;
		expect(options).toMatchObject({ queue: true, families: 2, children: 3, unconfirmed: 1 });
		expect(options.targets).toEqual([
			expect.objectContaining({
				key: toKey,
				block: null,
				comparison: {
					allowed: true,
					kind: 'plain',
					differences: [
						{ field: 'subject', from: 'Russisch', to: 'Russisch1' },
						{ field: 'building', from: 'Kolibri', to: 'Villa' },
					],
					reasons: [],
				},
			}),
		]);
		const body = { fromKey: oldKey, lessonId: target.id };
		expect(await rebinder().rebind(actor, catalog, body, 'r1', LATER)).toEqual({
			rebound: true,
			kind: 'plain',
		});
		expect(await entry(a)).toMatchObject({ course_key: toKey, status: 'waiting' });
		expect(await entry(b)).toMatchObject({ course_key: toKey, status: 'waiting' });
		expect(await entry(pending)).toMatchObject({ course_key: oldKey, status: 'cancelled' });
		// The snapshot proves what the family agreed to: it does not follow the card.
		expect((await entry(a)).lesson_json).toBe(snapshot);
		expect(await priceRow(oldKey)).toBeNull();
		expect(await priceRow(toKey)).toEqual({
			monthly_cents: 6650,
			yearly_cents: 5905,
			min_participants: 3,
			attention_reasons_json: null,
		});
		expect(await course(catalog, toKey)).toMatchObject({
			status: 'ready',
			children: 3,
			attention: null,
			priceOpen: [],
			priceRebind: null,
			rebinds: [expect.objectContaining({ kind: 'plain' })],
		});
		const [audit] = await audits('trial_intake.waitlist_rebound');
		expect(JSON.parse(audit.safe_diff_json)).toMatchObject({
			from: oldKey,
			to: toKey,
			kind: 'plain',
			queue: true,
			before: { monthlyCents: 6650, yearlyCents: 5905 },
			after: { monthlyCents: 6650, yearlyCents: 5905 },
			targetBefore: null,
			moved: 2,
			cancelled: 1,
		});
		expect(audit.safe_diff_json).not.toMatch(/example\.test|Synthetic|Parent/u);
		// A repeat or a double click finds the old course gone.
		expect(await rebinder().rebind(actor, catalog, body, 'r2', afterSeconds(LATER, 5))).toEqual(
			{
				rebound: false,
			}
		);
		expect(await count('trial_intake_waitlist_rebinds')).toBe(1);
		expect(await audits('trial_intake.waitlist_rebound')).toHaveLength(1);
		// The withdrawal link of the confirmation letter names the current course and still works.
		const token = await withdrawToken(SECRET, await entry(a));
		expect(await signupService().inspectWithdrawal(token, LATER)).toMatchObject({
			state: 'confirm',
			course: { subject: 'Russisch1', building: 'Villa', room: 'V1' },
		});
		expect(await signupService().withdraw(token, 'r3', LATER)).toEqual({ state: 'withdrawn' });
		// The cancelled signup confirms late: no Telegram, no letter, the page tells to sign up again.
		const late = await service.verify(
			await verificationToken(SECRET, (await service.get(pending))!),
			LATER
		);
		expect(late).toMatchObject({ state: 'cancelled', firstDate: null, courseKey: toKey });
		expect(await count('trial_intake_telegram_payloads WHERE request_id = ?', [pending])).toBe(
			0
		);
		expect(
			await count(
				`trial_intake_email_outbox WHERE request_id = ? AND kind = 'confirmation'`,
				[pending]
			)
		).toBe(0);
		expect(await entry(pending)).toMatchObject({ status: 'cancelled' });
		const cancelled = await new IntakeAdmin(service).detail(actor, pending, 'r', LATER);
		expect(cancelled.waitlist).toMatchObject({
			status: 'cancelled',
			cancelledByRebind: true,
			rebinds: [expect.objectContaining({ kind: 'plain' })],
		});
		expect(
			(await new IntakeAdmin(service).detail(actor, b, 'r', LATER)).waitlist
		).toMatchObject({
			cancelledByRebind: false,
			rebinds: [expect.objectContaining({ kind: 'plain' })],
		});
	}, 60_000);
	it('notify: time and teacher give the orange mark with reasons; a second rebind adds reasons; "Familien informiert" clears it with audit; the start stays possible', async () => {
		await seedAdmin();
		const old = await card();
		const later = await card({ start: '17:00', end: '17:45' });
		const other = await card({ start: '17:00', end: '17:45', teacher: 'Lehrkraft B' });
		await setPrice(old, 1);
		const a = await signup(old, 'a@example.test');
		const first = [...lessons, later];
		const [oldKey, laterKey, otherKey] = [old, later, other].map(plannedCourseKey);
		expect(
			await rebinder().rebind(
				actor,
				first,
				{ fromKey: oldKey, lessonId: later.id },
				'r',
				LATER
			)
		).toEqual({ rebound: true, kind: 'notify' });
		expect(JSON.parse((await priceRow(laterKey))!.attention_reasons_json!)).toEqual([
			{ code: 'time', from: '16:00', to: '17:00' },
		]);
		const marked = await course(first, laterKey);
		expect(marked).toMatchObject({ status: 'ready', priceOpen: [] });
		// The orange mark does not block the start.
		expect(starter().options(marked, LATER)).toMatchObject({ start: null });
		// The card changes again before the families were called: the reasons add up.
		const second = [...lessons, other];
		expect(
			await rebinder().rebind(
				actor,
				second,
				{ fromKey: laterKey, lessonId: other.id },
				'r',
				afterSeconds(LATER, 60)
			)
		).toEqual({ rebound: true, kind: 'notify' });
		expect((await course(second, otherKey)).attention).toEqual([
			{ code: 'time', from: '16:00', to: '17:00' },
			{ code: 'teacher' },
		]);
		expect(await entry(a)).toMatchObject({ course_key: otherKey, status: 'waiting' });
		expect((await course(second, otherKey)).rebinds!.map((r) => r.kind)).toEqual([
			'notify',
			'notify',
		]);
		const marks = rebinder();
		expect(
			await marks.informed(actor, { key: otherKey }, 'r', afterSeconds(LATER, 120))
		).toEqual({
			changed: true,
		});
		expect((await course(second, otherKey)).attention).toBeNull();
		expect(
			await marks.informed(actor, { key: otherKey }, 'r', afterSeconds(LATER, 180))
		).toEqual({
			changed: false,
		});
		const cleared = await audits('trial_intake.waitlist_attention_cleared');
		expect(cleared.map((row) => JSON.parse(row.safe_diff_json))).toEqual([
			{
				key: otherKey,
				reasons: [{ code: 'time', from: '16:00', to: '17:00' }, { code: 'teacher' }],
			},
		]);
	});
	it('price: a duration change needs new sums and gives the red mark; the start waits for every earlier family; "Abgelehnt" withdraws; letter and PDF carry the confirmed sum, other families keep the approved text', async () => {
		await seedAdmin();
		const old = await card();
		const longer = await card({ end: '17:00' });
		await setPrice(old, 2);
		const a = await signup(old, 'a@example.test');
		const b = await signup(old, 'b@example.test', { tariff: 'yearly' });
		const c = await signup(old, 'c@example.test');
		const catalog = [...lessons, longer];
		const [oldKey, toKey] = [plannedCourseKey(old), plannedCourseKey(longer)];
		const body = { fromKey: oldKey, lessonId: longer.id };
		await expect(rebinder().rebind(actor, catalog, body, 'r', LATER)).rejects.toMatchObject({
			code: 'WAITLIST_PRICE_INVALID',
		});
		expect(
			await rebinder().rebind(
				actor,
				catalog,
				{ ...body, monthly: '80,00', yearly: '70' },
				'r',
				LATER
			)
		).toEqual({ rebound: true, kind: 'price' });
		expect(await priceRow(toKey)).toMatchObject({ monthly_cents: 8000, yearly_cents: 7000 });
		expect(
			await db.first({
				sql: `SELECT kind, from_monthly_cents, from_yearly_cents, to_monthly_cents, to_yearly_cents FROM trial_intake_waitlist_rebinds`,
			})
		).toEqual({
			kind: 'price',
			from_monthly_cents: 6650,
			from_yearly_cents: 5905,
			to_monthly_cents: 8000,
			to_yearly_cents: 7000,
		});
		// A family signing up afterwards agrees to the new sum itself and needs no call.
		const at = afterSeconds(LATER, 60);
		await signup(longer, 'd@example.test', { cents: 8000, at });
		const red = await course(catalog, toKey);
		expect(red).toMatchObject({
			status: 'ready',
			priceOpen: [a, b, c].sort(),
			priceRebind: { minutes: 60, monthlyCents: 8000, yearlyCents: 7000 },
		});
		expect(starter().options(red, at)).toMatchObject({ start: 'price_open', probe: null });
		const firstDate = startDates(longer.weekday, at).defaultDate;
		const start = { lessonId: longer.id, firstDate, checked: true };
		await expect(starter().start(actor, catalog, start, 'r', at)).rejects.toMatchObject({
			code: 'WAITLIST_START_PRICE_OPEN',
		});
		const marks = rebinder();
		expect(await marks.decide(actor, { requestId: a, decision: 'confirmed' }, 'r', at)).toEqual(
			{
				changed: true,
			}
		);
		expect(
			await marks.decide(
				actor,
				{ requestId: a, decision: 'confirmed' },
				'r',
				afterSeconds(at, 1)
			)
		).toEqual({ changed: false });
		await marks.decide(
			actor,
			{ requestId: b, decision: 'confirmed' },
			'r',
			afterSeconds(at, 2)
		);
		await expect(
			starter().start(actor, catalog, start, 'r', afterSeconds(at, 3))
		).rejects.toMatchObject({ code: 'WAITLIST_START_PRICE_OPEN' });
		await marks.decide(actor, { requestId: c, decision: 'declined' }, 'r', afterSeconds(at, 4));
		expect(await entry(c)).toMatchObject({ status: 'withdrawn' });
		expect((await service.get(c))!.state).toBe('processed');
		// The new sum of each family's own tariff; the snapshot keeps the sum agreed to.
		expect(
			(
				await db.all({
					sql: 'SELECT request_id, decision, price_cents FROM trial_intake_waitlist_price_confirmations ORDER BY created_at',
				})
			).results
		).toEqual([
			{ request_id: a, decision: 'confirmed', price_cents: 8000 },
			{ request_id: b, decision: 'confirmed', price_cents: 7000 },
			{ request_id: c, decision: 'declined', price_cents: null },
		]);
		expect(await entry(a)).toMatchObject({ monthly_cents: 6650, yearly_cents: 5905 });
		expect(
			(await audits('trial_intake.waitlist_price_confirmed')).map(
				(row) => JSON.parse(row.safe_diff_json).priceCents
			)
		).toEqual([8000, 7000]);
		expect(await audits('trial_intake.waitlist_price_declined')).toHaveLength(1);
		expect(await audits('trial_intake.waitlist_withdrawn')).toHaveLength(1);
		const done = await course(catalog, toKey);
		expect(done.priceOpen).toEqual([]);
		expect(
			await starter().start(actor, catalog, start, 'r', afterSeconds(at, 5))
		).toMatchObject({ created: true, participants: 3 });
		const email = new FakeEmailProvider();
		const html: string[] = [];
		const synthetic = new SyntheticContractPdfAdapter(
			{ maxHtmlBytes: 2 * 1024 * 1024, maxPdfBytes: 1024 * 1024 },
			'test'
		);
		const capture: ContractPdfAdapter = {
			rendererId: synthetic.rendererId,
			rendererContractVersion: synthetic.rendererContractVersion,
			render: async (input) => {
				html.push(input.html);
				return synthetic.render(input);
			},
		};
		await drain(
			createOutboxRuntime(config(), { emailProvider: email, waitlistPdfAdapter: capture }),
			afterSeconds(at, 10)
		);
		const letter = (to: string) =>
			email.messages.find((m) => m.to === to && m.subject.includes('beginnt'))!.text;
		const tariff = (to: string) =>
			letter(to)
				.split('\n')
				.find((l) => l.startsWith('Ihr Tarif:'));
		const day = new Intl.DateTimeFormat('de-DE', {
			timeZone: 'Europe/Berlin',
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
		}).format(new Date(at));
		expect(tariff('a@example.test')).toBe(
			`Ihr Tarif: Monatsvertrag, 80,00 € pro Monat je Kind (von Ihnen am ${day} telefonisch bestätigt)`
		);
		expect(tariff('b@example.test')).toBe(
			`Ihr Tarif: Jahresvertrag, 70,00 € pro Monat je Kind (von Ihnen am ${day} telefonisch bestätigt)`
		);
		expect(tariff('d@example.test')).toBe(
			'Ihr Tarif: Monatsvertrag, 80,00 € pro Monat je Kind (bei Ihrer Anmeldung festgelegt)'
		);
		expect(
			email.messages.some((m) => m.to === 'c@example.test' && m.subject.includes('beginnt'))
		).toBe(false);
		const documentOf = (address: string) => html.find((page) => page.includes(address))!;
		expect(documentOf('a@example.test')).toContain(
			`Die Kursdauer hat sich auf 60 Minuten geändert. Den neuen Betrag haben Sie am ${day} telefonisch bestätigt.`
		);
		expect(documentOf('a@example.test')).toContain(
			'Der dort genannte Betrag wurde durch den oben genannten Beitrag ersetzt.'
		);
		expect(documentOf('d@example.test')).toContain(
			'Dieser Betrag wurde bei Ihrer Anmeldung am'
		);
		expect(documentOf('d@example.test')).not.toContain('Kursdauer');
		expect((await new IntakeAdmin(service).detail(actor, a, 'r', at)).waitlist).toMatchObject({
			priceDecision: { decision: 'confirmed', priceCents: 8000 },
			rebinds: [expect.objectContaining({ kind: 'price' })],
		});
	}, 60_000);
	it('refuses another subject, a card with its own queue, a started and an ambiguous card; nothing is written', async () => {
		await seedAdmin();
		const old = await card();
		await setPrice(old, 3);
		const a = await signup(old, 'a@example.test');
		const english = await card({ subject: 'English', start: '15:00', end: '16:00' });
		const busy = await card({ weekday: 3 });
		const started = await card({ weekday: 4 });
		const twin = await card({ weekday: 5 });
		const twin2 = await card({ weekday: 5, group: `${PLANNED} 1`, room: 'R9' });
		const plain = await card({ room: 'R5', building: 'Villa' });
		await setPrice(busy, 3);
		await signup(busy, 'b@example.test', { confirm: false });
		await setPrice(started, 1);
		const s = await signup(started, 's@example.test');
		await starter().start(
			actor,
			[...lessons, started],
			{ lessonId: started.id, firstDate: startDates(4, NOW).defaultDate, checked: true },
			'r',
			NOW
		);
		expect(await entry(s)).toMatchObject({ status: 'started' });
		const catalog = [...lessons, english, busy, started, twin, twin2, plain];
		const oldKey = plannedCourseKey(old);
		const options = rebindOptions(
			await course(catalog, oldKey),
			await prices().overview(actor, catalog)
		)!;
		const block = (lesson: Lesson) =>
			options.targets.find((t) => t.key === plannedCourseKey(lesson))!.block;
		expect([english, busy, started, twin, plain].map(block)).toEqual([
			'subject',
			'queue',
			'started',
			'ambiguous',
			null,
		]);
		const rebind = (lesson: Lesson, extra = {}) =>
			rebinder().rebind(
				actor,
				catalog,
				{ fromKey: oldKey, lessonId: lesson.id, ...extra },
				'r',
				LATER
			);
		await expect(rebind(english)).rejects.toMatchObject({ code: 'WAITLIST_REBIND_SUBJECT' });
		for (const lesson of [busy, started, twin, twin2])
			await expect(rebind(lesson)).rejects.toMatchObject({
				code: 'WAITLIST_REBIND_TARGET_BUSY',
			});
		// Without a duration change the sums cannot change for a family that agreed to them.
		await expect(rebind(plain, { monthly: '70,00', yearly: '59,05' })).rejects.toMatchObject({
			code: 'WAITLIST_PRICE_LOCKED',
		});
		expect(await count('trial_intake_waitlist_rebinds')).toBe(0);
		expect(await entry(a)).toMatchObject({ course_key: oldKey, status: 'waiting' });
		expect(await priceRow(oldKey)).toMatchObject({ monthly_cents: 6650 });
		// The same sums are no change: the rebind passes.
		expect(await rebind(plain, { monthly: '66,50', yearly: '59,05' })).toEqual({
			rebound: true,
			kind: 'plain',
		});
	}, 60_000);
	it('the database refuses other sums without a duration change and a key change without a journal row', async () => {
		await seedAdmin();
		const old = await card();
		const later = await card({ start: '17:00', end: '17:45' });
		const longer = await card({ end: '17:00' });
		await setPrice(old, 3);
		await setPrice(later, 3);
		const a = await signup(old, 'a@example.test');
		const journal = (to: Lesson, kind: string, toMonthly: number) =>
			db.run({
				sql: `INSERT INTO trial_intake_waitlist_rebinds(id, from_key, to_key, from_lesson_json, to_lesson_json, kind,
				 differences_json, from_monthly_cents, from_yearly_cents, to_monthly_cents, to_yearly_cents, actor_user_id, created_at)
				 VALUES (?, ?, ?, '{}', '{}', ?, '{}', 6650, 5905, ?, 5905, ?, ?)`,
				params: [
					crypto.randomUUID(),
					plannedCourseKey(old),
					plannedCourseKey(to),
					kind,
					toMonthly,
					actor.id,
					LATER,
				],
			});
		await expect(journal(later, 'notify', 7000)).rejects.toThrow(
			/rebind without a duration change keeps the sums/u
		);
		await expect(journal(later, 'price', 6650)).rejects.toThrow(
			/kind price requires a duration change/u
		);
		await expect(journal(longer, 'plain', 6650)).rejects.toThrow(
			/kind price requires a duration change/u
		);
		await expect(
			db.run({
				sql: 'UPDATE trial_intake_waitlist_entries SET course_key = ? WHERE request_id = ?',
				params: [plannedCourseKey(later), a],
			})
		).rejects.toThrow(/rebind requires a journal row/u);
		await expect(
			db.run({
				sql: 'UPDATE trial_intake_waitlist_entries SET monthly_cents = 7000 WHERE request_id = ?',
				params: [a],
			})
		).rejects.toThrow(/snapshot is immutable/u);
		expect(await entry(a)).toMatchObject({
			course_key: plannedCourseKey(old),
			monthly_cents: 6650,
		});
	});
	it('a card back in the schedule takes its queue again; an unreadable schedule shows no vanished course', async () => {
		await seedAdmin();
		const old = await card();
		await setPrice(old, 3);
		await signup(old, 'a@example.test');
		const key = plannedCourseKey(old);
		expect((await course(lessons, key)).status).toBe('gone');
		expect((await prices().overview(actor, null)).unscheduled).toEqual([
			expect.objectContaining({ key, status: null }),
		]);
		const back = [...lessons, old];
		expect(await course(back, key)).toMatchObject({ status: 'collecting', children: 1 });
		expect(await courseState(db, back, old)).toMatchObject({ state: 'open' });
		await signup(old, 'b@example.test', { at: LATER });
		expect((await course(back, key)).children).toBe(2);
		expect(await count('trial_intake_waitlist_rebinds')).toBe(0);
	});
	it('a price without a queue moves without statuses, its sums may change, the replaced price is audited', async () => {
		await seedAdmin();
		const old = await card();
		const target = await card({ start: '15:00', end: '16:00', teacher: 'Lehrkraft B' });
		await setPrice(old, 4);
		await setPrice(target, 2, 4000, 3500);
		const catalog = [...lessons, target];
		const [oldKey, toKey] = [plannedCourseKey(old), plannedCourseKey(target)];
		const gone = await course(catalog, oldKey);
		expect(gone.status).toBe('not_in_schedule');
		expect(rebindOptions(gone, await prices().overview(actor, catalog))).toMatchObject({
			queue: false,
			targets: [{ key: toKey, block: null, comparison: { kind: 'price' } }],
		});
		expect(
			await rebinder().rebind(
				actor,
				catalog,
				{ fromKey: oldKey, lessonId: target.id, monthly: '50', yearly: '45,00' },
				'r',
				LATER
			)
		).toEqual({ rebound: true, kind: 'price' });
		expect(await priceRow(oldKey)).toBeNull();
		expect(await priceRow(toKey)).toEqual({
			monthly_cents: 5000,
			yearly_cents: 4500,
			min_participants: 4,
			attention_reasons_json: null,
		});
		expect(await count('trial_intake_waitlist_rebinds')).toBe(0);
		expect(await course(catalog, toKey)).toMatchObject({
			attention: null,
			priceOpen: [],
			status: 'collecting',
		});
		const [audit] = await audits('trial_intake.waitlist_rebound');
		expect(JSON.parse(audit.safe_diff_json)).toMatchObject({
			queue: false,
			before: { monthlyCents: 6650, yearlyCents: 5905 },
			after: { monthlyCents: 5000, yearlyCents: 4500 },
			targetBefore: { monthlyCents: 4000, yearlyCents: 3500, minParticipants: 2 },
		});
		expect(
			await rebinder().rebind(
				actor,
				catalog,
				{ fromKey: oldKey, lessonId: target.id },
				'r',
				LATER
			)
		).toEqual({ rebound: false });
	});
	it('"Als neuen Kurs öffnen" opens a new group of the same course; the old start and its signups stay', async () => {
		await seedAdmin();
		const english = await card({ subject: 'English', start: '16:00', end: '17:00' });
		const catalog = [...lessons, english];
		const key = plannedCourseKey(english);
		await setPrice(english, 1);
		const a = await signup(english, 'a@example.test');
		const first = await starter().start(
			actor,
			catalog,
			{ lessonId: english.id, firstDate: startDates(2, NOW).defaultDate, checked: true },
			'r',
			NOW
		);
		expect(await courseState(db, catalog, english)).toMatchObject({ state: 'started' });
		await expect(signup(english, 'x@example.test', { at: LATER })).rejects.toMatchObject({
			code: 'WAITLIST_COURSE_STARTED',
		});
		expect(await rebinder().reopen(actor, { key }, 'r', LATER)).toEqual({ reopened: true });
		expect(await rebinder().reopen(actor, { key }, 'r', LATER)).toEqual({ reopened: false });
		expect(
			(await audits('trial_intake.waitlist_reopened')).map((row) => ({
				target: row.target_id,
				diff: JSON.parse(row.safe_diff_json),
			}))
		).toEqual([
			{ target: first.startId, diff: { key, firstDate: first.firstDate, participants: 1 } },
		]);
		expect(await courseState(db, catalog, english)).toMatchObject({ state: 'open' });
		// The price is free again: the old start holds no waiting signup.
		expect(
			await prices().setPrice(
				actor,
				english,
				{ monthlyCents: 7000, yearlyCents: 6000, minParticipants: 1 },
				'r',
				LATER
			)
		).toEqual({ changed: true });
		const b = await signup(english, 'b@example.test', { cents: 7000, at: LATER });
		expect(await entry(b)).toMatchObject({ status: 'waiting', start_id: null });
		expect(await entry(a)).toMatchObject({ status: 'started', start_id: first.startId });
		const second = await starter().start(
			actor,
			catalog,
			{ lessonId: english.id, firstDate: startDates(2, LATER).defaultDate, checked: true },
			'r',
			LATER
		);
		expect(second).toMatchObject({ created: true, participants: 1 });
		expect(second.startId).not.toBe(first.startId);
		expect(await count('trial_intake_waitlist_starts')).toBe(2);
	});
});

describe('rebind HTTP boundary (WL-AC-12, WL-AC-14)', () => {
	const csrf = 'synthetic-csrf-token';
	const parent = { ...actor, id: 'synthetic-parent', role: 'parent' as const };
	function event(path: string, user: unknown, body?: unknown) {
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
			params: {},
			locals: { requestId: 'synthetic', user },
			getClientAddress: () => '192.0.2.1',
			cookies: {
				get: (name: string) => (name === 'kolibri_csrf' ? csrf : undefined),
				set: () => {},
			},
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
	const schedule = (catalog: Lesson[] | null) =>
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				catalog
					? new Response(
							`<script id="trial-intake-catalog" type="application/json">${JSON.stringify({ version: 1, lessons: catalog })}</script>`
						)
					: new Response('unavailable', { status: 503 })
			)
		);
	it('refuses anonymous and non-admin users and an absent CSRF token; an unreadable schedule refuses the rebind; the banner and the page show the marks', async () => {
		await seedAdmin();
		const old = await card();
		const later = await card({ start: '17:00', end: '17:45' });
		await setPrice(old, 3);
		await signup(old, 'a@example.test');
		// The endpoints use the real clock: this verification link must still be valid then.
		const pending = await signup(old, 'p@example.test', {
			confirm: false,
			at: new Date().toISOString(),
		});
		const admin = { ...actor, csrfHash: await hashCsrfToken(csrf) };
		const oldKey = plannedCourseKey(old);
		const laterKey = plannedCourseKey(later);
		const status = async (
			handler: (event: RequestEvent) => Promise<unknown>,
			path: string,
			user: unknown,
			value: unknown
		) => (await intakeEndpoint(() => handler(event(path, user, value)))).status;
		const body = { fromKey: oldKey, lessonId: later.id, _csrf: csrf };
		schedule([later]);
		const page = await loadWaitlistPrices(event('/admin/trial-intake/warteliste', admin));
		expect(page.unscheduled[0]).toMatchObject({
			key: oldKey,
			status: 'gone',
			rebind: { queue: true, families: 1, unconfirmed: 1 },
		});
		expect(page.unscheduled[0].entries![0]).toMatchObject({ phone: '+49 000000000' });
		const rebindPath = '/admin/trial-intake/warteliste/rebind';
		expect(await status(adminWaitlistRebind, rebindPath, undefined, body)).toBe(401);
		expect(
			await status(
				adminWaitlistRebind,
				rebindPath,
				{ ...parent, csrfHash: admin.csrfHash },
				body
			)
		).toBe(403);
		expect(
			await status(adminWaitlistRebind, rebindPath, admin, { ...body, _csrf: undefined })
		).toBe(403);
		schedule(null);
		const refused = await intakeEndpoint(() =>
			adminWaitlistRebind(event(rebindPath, admin, body))
		);
		expect(refused.status).toBe(503);
		expect(await refused.json()).toMatchObject({ code: 'INTAKE_CATALOG_UNAVAILABLE' });
		// Without a schedule the page keeps the stored course and offers no tool.
		const blind = await loadWaitlistPrices(event('/admin/trial-intake/warteliste', admin));
		expect(blind.unscheduled[0]).toMatchObject({ key: oldKey, status: null });
		expect(blind.unscheduled[0].rebind).toBeUndefined();
		expect(await count('trial_intake_waitlist_rebinds')).toBe(0);
		schedule([later]);
		expect(await status(adminWaitlistRebind, rebindPath, admin, body)).toBe(200);
		expect(await count('trial_intake_waitlist_rebinds')).toBe(1);
		const banner = await waitlistAttention(event('/admin/trial-intake', admin));
		expect(banner.attention).toEqual([
			expect.objectContaining({
				key: laterKey,
				attention: [{ code: 'time', from: '16:00', to: '17:00' }],
				priceOpen: [],
			}),
		]);
		// The cancelled signup confirms late and is offered the form of the course its queue moved to.
		const token = await verificationToken(SECRET, (await service.get(pending))!);
		const confirmPath = '/probestunde/verify';
		// The internal course key never reaches the page: the result is exactly this.
		const late = await verify(event(confirmPath, undefined, { token }));
		expect(late).toEqual({
			state: 'cancelled',
			kind: 'waitlist',
			firstDate: null,
			lessonId: later.id,
		});
		const marksPath = '/admin/trial-intake/warteliste/attention';
		const informed = { action: 'informed', key: laterKey, _csrf: csrf };
		expect(await status(adminWaitlistMarks, marksPath, undefined, informed)).toBe(401);
		expect(
			await status(
				adminWaitlistMarks,
				marksPath,
				{ ...parent, csrfHash: admin.csrfHash },
				informed
			)
		).toBe(403);
		expect(
			await status(adminWaitlistMarks, marksPath, admin, { ...informed, _csrf: undefined })
		).toBe(403);
		expect(await status(adminWaitlistMarks, marksPath, admin, informed)).toBe(200);
		expect((await priceRow(laterKey))!.attention_reasons_json).toBeNull();
		const reopenPath = '/admin/trial-intake/warteliste/reopen';
		const reopen = { key: laterKey, _csrf: csrf };
		expect(await status(adminWaitlistReopen, reopenPath, undefined, reopen)).toBe(401);
		expect(
			await status(
				adminWaitlistReopen,
				reopenPath,
				{ ...parent, csrfHash: admin.csrfHash },
				reopen
			)
		).toBe(403);
		expect(
			await status(adminWaitlistReopen, reopenPath, admin, { ...reopen, _csrf: undefined })
		).toBe(403);
		expect(await status(adminWaitlistReopen, reopenPath, admin, reopen)).toBe(200);
		expect(await audits('trial_intake.waitlist_reopened')).toHaveLength(0);
	}, 60_000);
});

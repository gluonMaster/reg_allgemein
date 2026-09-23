import fixture from '../../fixtures/trial-intake/catalog-v1.json';
import {
	createMigratedTestD1,
	applyTestD1Migrations,
	createMeteredD1,
	type TestD1Context,
} from '../../helpers/d1';
import { DatabaseBoundary } from '$lib/server/db/database';
import {
	IntakeService,
	verificationToken,
	afterSeconds,
} from '$lib/trial-intake/server/service.server';
import { parseBusinessHours } from '$lib/server/outbox/business-hours';
import { INTAKE_PRIVACY_VERSION, type Lesson } from '$lib/trial-intake/contracts';
import { IntakeAdmin } from '$lib/trial-intake/server/admin.server';
import { closedLessonIds } from '$lib/trial-intake/server/closed.server';
import { cleanupIntake } from '$lib/trial-intake/server/cleanup.server';
import { buildIntakeBootstrap } from '$lib/trial-intake/server/bootstrap.server';
import { createAuthRuntime } from '$lib/server/auth/runtime';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { createOutboxRuntime } from '$lib/server/outbox/runtime';
import {
	FakeEmailProvider,
	FakeTelegramProvider,
	EmailProviderError,
	TelegramProviderError,
} from '$lib/server/outbox/providers';
import { runScheduledEvent, runScheduledJobs } from '$lib/server/operations/scheduler';
import { ORGANIZATION_NAME } from '$lib/organization';
import { renderTelegramTemplate } from '$lib/server/outbox/templates';
import { lessonIdentity } from '$lib/trial-intake/server/catalog.server';
import { intakeEndpoint, submit, verify } from '$lib/trial-intake/server/http.server';
import { verifiedDeviceValue } from '$lib/trial-intake/server/device.server';
import type { RequestEvent } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/security/authorization';

const NOW = '2026-09-16T12:00:00.000Z';
const SECRET = 'synthetic-intake-test-secret-32-characters';
const schedule = parseBusinessHours('Europe/Berlin', 'Mo-Fr 09:00-17:00');
const lessons = fixture.lessons as Lesson[];
let ctx: TestD1Context;
let db: DatabaseBoundary;
let service: IntakeService;
const actor = {
	id: 'synthetic-admin',
	role: 'admin' as const,
	emailVerified: true,
	sessionId: 's',
	sessionVersion: 1,
	csrfHash: 'a'.repeat(64),
};
function data() {
	return {
		idempotencyKey: crypto.randomUUID(),
		parentFirstName: 'Synthetic',
		parentLastName: 'Parent',
		email: 'guest@example.test',
		phone: '+49 000000000',
		locale: 'de' as const,
		privacyVersion: INTAKE_PRIVACY_VERSION,
		children: [
			{ key: 'child-a', firstName: 'Kind', lastName: 'Zulu', birthDate: '2020-02-29' },
			{ key: 'child-b', firstName: 'Kind', lastName: 'Alpha', birthDate: '2021-01-01' },
		],
		items: [
			{
				lessonId: lessons[0].id,
				desiredDate: '2026-09-17',
				childKeys: ['child-a', 'child-b'],
			},
			{ lessonId: lessons[1].id, desiredDate: '2026-09-19', childKeys: ['child-a'] },
		],
	};
}
/** Long names split the Telegram notification into several parts. */
function multiPartData() {
	const input = data();
	input.children = Array.from({ length: 10 }, (_, i) => ({
		key: `c${i}`,
		firstName: 'F'.repeat(160),
		lastName: `Child-${i}` + 'Z'.repeat(140),
		birthDate: '2020-01-01',
	}));
	input.items = input.items.map((i) => ({
		...i,
		childKeys: input.children.map((c) => c.key),
	}));
	return input;
}
function supportRow(id: string, createdAt: string) {
	const reference = crypto.randomUUID();
	return {
		sql: `INSERT INTO telegram_outbox
		 (id, source_kind, source_id, template_or_category, destination_ref, locale, payload_json,
		 dedupe_key, not_before, status, attempts, max_attempts, created_at, updated_at)
		 VALUES (?, 'support_thread', ?, 'bureau.support', 'bureau', 'de', ?, ?, ?, 'pending', 0, 5, ?, ?)`,
		params: [
			id,
			reference,
			JSON.stringify({
				category: 'technical',
				reference,
				receivedAt: createdAt,
				adminPath: `/admin/messages/${reference}`,
			}),
			`dedupe:${id}`,
			createdAt,
			createdAt,
			createdAt,
		],
	};
}
function config() {
	return loadRuntimeConfig({
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
		TELEGRAM_PROVIDER: 'fake',
		TELEGRAM_CHAT_ID: 'synthetic-bureau',
		SCHEDULED_JOBS_ENABLED: 'true',
	});
}
async function token(id: string) {
	return verificationToken(SECRET, (await service.get(id))!);
}
async function verified(input = data()) {
	const receipt = await service.create(input, async () => lessons, NOW);
	await service.verify(await token(receipt.id), NOW);
	return receipt;
}
async function seedAdmin() {
	await db.run({
		sql: `INSERT INTO users(id,email,email_normalized,password_hash,email_verified_at,role,first_name,last_name,first_name_normalized,last_name_normalized,privacy_notice_version,privacy_accepted_at,created_at,updated_at)
	 VALUES (?, 'admin@example.test','admin@example.test','synthetic-hash',?,'admin','Synthetic','Admin','synthetic','admin','test',?,?,?)`,
		params: [actor.id, NOW, NOW, NOW, NOW],
	});
}
beforeEach(async () => {
	ctx = await createMigratedTestD1();
	db = new DatabaseBoundary(ctx.db);
	service = new IntakeService(db, SECRET, schedule);
});
afterEach(async () => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	await ctx.dispose();
});

describe('intake D1 lifecycle', () => {
	it('creates all data and guest email atomically; concurrent create/replay is content-bound without users', async () => {
		const input = data();
		const results = await Promise.all([
			service.create(input, async () => lessons, NOW),
			service.create(input, async () => lessons, NOW),
		]);
		expect(results[0]).toEqual(results[1]);
		expect(
			await service.create(
				input,
				async () => {
					throw new Error('offline');
				},
				NOW
			)
		).toEqual(results[0]);
		await expect(
			service.create({ ...input, phone: '+49 111111111' }, async () => lessons, NOW)
		).rejects.toMatchObject({ status: 409 });
		expect((await db.first<{ n: number }>({ sql: 'SELECT COUNT(*) AS n FROM users' }))?.n).toBe(
			0
		);
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_email_outbox',
				})
			)?.n
		).toBe(1);
		expect((await service.detail(results[0].id))?.items.map((i) => i.children.length)).toEqual([
			2, 1,
		]);
		expect(
			(await db.first<{ n: number }>({ sql: 'SELECT COUNT(*) AS n FROM telegram_outbox' }))?.n
		).toBe(0);
	});
	it('rejects a desired date on another weekday, today or in the past', async () => {
		const input = data();
		// The form offers only the lesson's own weekday; the server stays the authority.
		for (const desiredDate of ['2026-09-18', '2026-09-16', '2026-09-10']) {
			await expect(
				service.create(
					{ ...input, items: [{ ...input.items[0], desiredDate }] },
					async () => lessons,
					NOW
				)
			).rejects.toMatchObject({ code: 'INTAKE_DATE_INVALID' });
		}
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_requests',
				})
			)?.n
		).toBe(0);
	});
	it('rolls back the whole create if a child insert fails and rejects cross-request assignments', async () => {
		await db.run({
			sql: `CREATE TRIGGER synthetic_reject_child BEFORE INSERT ON trial_intake_children BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`,
		});
		await expect(service.create(data(), async () => lessons, NOW)).rejects.toThrow();
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_requests',
				})
			)?.n
		).toBe(0);
		await db.run({ sql: 'DROP TRIGGER synthetic_reject_child' });
		const a = await verified();
		const b = await verified();
		const first = (await service.detail(a.id))!;
		const second = (await service.detail(b.id))!;
		await expect(
			db.run({
				sql: 'INSERT INTO trial_intake_item_children VALUES(?,?,?)',
				params: [a.id, first.items[0].id, second.children[0].id],
			})
		).rejects.toThrow();
	});
	it('accepts the maximum 10x10 assignments with bounded D1 queries', async () => {
		const input = data();
		input.children = Array.from({ length: 10 }, (_, i) => ({
			key: `c${i}`,
			firstName: 'Kind',
			lastName: `Synthetic${i}`,
			birthDate: '2020-01-01',
		}));
		const catalog = await Promise.all(
			Array.from({ length: 10 }, async (_, i) => {
				const l = { ...lessons[0], group: `Group ${i}` };
				return { ...l, id: await lessonIdentity(l) };
			})
		);
		input.items = catalog.map((l) => ({
			lessonId: l.id,
			desiredDate: '2026-09-17',
			childKeys: input.children.map((c) => c.key),
		}));
		const metered = createMeteredD1(ctx.db);
		const bounded = new IntakeService(new DatabaseBoundary(metered.database), SECRET, schedule);
		const r = await bounded.create(input, async () => catalog, NOW);
		expect(metered.snapshot().queries).toBeLessThan(10);
		expect((await service.detail(r.id))?.items.every((i) => i.children.length === 10)).toBe(
			true
		);
	});
	it('GET inspection has no effects; concurrent verification creates one notification and never re-fetches catalog', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		const t = await token(r.id);
		expect(await service.inspectToken(t, NOW)).toEqual({ state: 'confirm' });
		expect((await service.get(r.id))?.state).toBe('pending_email');
		await Promise.all([service.verify(t, NOW), service.verify(t, NOW), service.verify(t, NOW)]);
		expect(
			(await db.first<{ n: number }>({ sql: 'SELECT COUNT(*) AS n FROM telegram_outbox' }))?.n
		).toBe(1);
		expect(await service.verify(t, afterSeconds(NOW, 86401))).toMatchObject({
			state: 'accepted',
		});
	});
	it('verification and Telegram queue are one transaction', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		await db.run({
			sql: `CREATE TRIGGER synthetic_reject_telegram BEFORE INSERT ON telegram_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`,
		});
		await expect(service.verify(await token(r.id), NOW)).rejects.toThrow();
		expect((await service.get(r.id))?.state).toBe('pending_email');
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_telegram_payloads',
				})
			)?.n
		).toBe(0);
	});
	it('expires tokens; resend rotates/cancels with cooldown, receipt scope and fixed request TTL', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		const old = await token(r.id);
		await expect(
			service.resend(r.id, 'b'.repeat(64), afterSeconds(NOW, 61))
		).rejects.toMatchObject({ status: 403 });
		await expect(service.resend(r.id, r.receipt, afterSeconds(NOW, 59))).rejects.toMatchObject({
			status: 429,
		});
		expect(await service.inspectToken(old, afterSeconds(NOW, 86400))).toEqual({
			state: 'expired',
		});
		const resends = await Promise.allSettled([
			service.resend(r.id, r.receipt, afterSeconds(NOW, 86401)),
			service.resend(r.id, r.receipt, afterSeconds(NOW, 86401)),
		]);
		expect(resends.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		await expect(service.verify(old, afterSeconds(NOW, 86402))).rejects.toMatchObject({
			status: 410,
		});
		expect(
			(
				await db.first<{ n: number }>({
					sql: "SELECT COUNT(*) AS n FROM trial_intake_email_outbox WHERE status = 'pending'",
				})
			)?.n
		).toBe(1);
		await expect(
			service.resend(r.id, r.receipt, afterSeconds(NOW, 14 * 86400))
		).rejects.toMatchObject({ status: 410 });
	});
	it('HTTP submit uses real Turnstile action/hostname validation and rate limits before intake writes', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(NOW));
		let action = 'wrong-action';
		const fetcher = vi.fn(async (url: string | URL | Request) =>
			String(url).includes('/siteverify')
				? Response.json({ success: true, action, hostname: 'portal.example.test' })
				: new Response(
						`<script id="trial-intake-catalog" type="application/json">${JSON.stringify(fixture)}</script>`
					)
		);
		vi.stubGlobal('fetch', fetcher);
		const env = {
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
			AUTH_RATE_LIMIT_MAX_ATTEMPTS: '2',
		} as App.Platform['env'];
		const input = data();
		const cookie = await verifiedDeviceValue(SECRET, input.email);
		const invoke = () => {
			const event = {
				cookies: { get: () => cookie },
				platform: { env },
				url: new URL('https://portal.example.test/probestunde/submit'),
				locals: { requestId: 'synthetic' },
				getClientAddress: () => '192.0.2.1',
				request: new Request('https://portal.example.test/probestunde/submit', {
					method: 'POST',
					headers: {
						origin: 'https://portal.example.test',
						'content-type': 'application/json',
					},
					body: JSON.stringify({ ...input, turnstileToken: 'synthetic-token' }),
				}),
			} as unknown as RequestEvent;
			return intakeEndpoint(() => submit(event));
		};
		expect((await invoke()).status).toBe(400);
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_requests',
				})
			)?.n
		).toBe(0);
		action = 'trial_intake';
		expect((await invoke()).status).toBe(200);
		expect((await invoke()).status).toBe(429);
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_requests',
				})
			)?.n
		).toBe(1);
	});
	it('issues the device cookie only on successful POST and accepts only its signed matching address', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(NOW));
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string | URL | Request) =>
				String(url).includes('/siteverify')
					? Response.json({
							success: true,
							action: 'trial_intake',
							hostname: 'portal.example.test',
						})
					: new Response(
							`<script id="trial-intake-catalog" type="application/json">${JSON.stringify(fixture)}</script>`
						)
			)
		);
		const setCookie = vi.fn();
		const event = (path: string, body?: unknown, cookie?: string) =>
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
						TURNSTILE_SECRET_KEY: 'synthetic-secret',
						TURNSTILE_HOSTNAMES: 'portal.example.test',
						AUTH_RATE_LIMIT_MAX_ATTEMPTS: '30',
					},
				},
				url: new URL(`https://portal.example.test/probestunde/${path}`),
				locals: { requestId: 'synthetic' },
				getClientAddress: () => '192.0.2.1',
				cookies: { get: () => cookie, set: setCookie },
				request: new Request(`https://portal.example.test/probestunde/${path}`, {
					method: body ? 'POST' : 'GET',
					headers: {
						origin: 'https://portal.example.test',
						'content-type': 'application/json',
					},
					...(body ? { body: JSON.stringify(body) } : {}),
				}),
			}) as unknown as RequestEvent;
		const first = await service.create(data(), async () => lessons, NOW);
		const t = await token(first.id);
		expect(await verify(event(`verify?token=${t}`))).toEqual({ state: 'confirm' });
		expect(setCookie).not.toHaveBeenCalled();
		expect(
			(await intakeEndpoint(() => verify(event('verify', { token: 'invalid' })))).status
		).toBe(410);
		expect(setCookie).not.toHaveBeenCalled();
		expect(await verify(event('verify', { token: t }))).toEqual({ state: 'accepted' });
		const cookie = await verifiedDeviceValue(SECRET, data().email);
		expect(setCookie).toHaveBeenCalledWith('ti_verified', cookie, {
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			path: '/probestunde',
			maxAge: 180 * 86400,
		});
		const [email, signature] = JSON.parse(cookie);
		const cases = [
			{ cookie, state: 'verified' },
			{ cookie: undefined, state: 'pending_email' },
			{
				cookie: JSON.stringify([
					email,
					`${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`,
				]),
				state: 'pending_email',
			},
			{
				cookie: await verifiedDeviceValue(SECRET, 'other@example.test'),
				state: 'pending_email',
			},
			{
				cookie: await verifiedDeviceValue('different-secret', email),
				state: 'pending_email',
			},
			{ cookie: 'malformed', state: 'pending_email' },
		];
		for (const entry of cases) {
			const input = {
				...data(),
				email: 'GUEST@example.test',
				turnstileToken: 'synthetic-token',
			};
			const response = await submit(event('submit', input, entry.cookie));
			expect(response.state).toBe(entry.state);
			const stored = (await service.get(response.id))!;
			expect(stored.verified_at).toBe(entry.state === 'verified' ? NOW : null);
			const emails = (
				await db.all<{ kind: string }>({
					sql: 'SELECT kind FROM trial_intake_email_outbox WHERE request_id = ?',
					params: [response.id],
				})
			).results;
			expect(emails).toEqual([
				{ kind: entry.state === 'verified' ? 'confirmation' : 'verification' },
			]);
			const payloads = (
				await db.all({
					sql: 'SELECT id FROM trial_intake_telegram_payloads WHERE request_id = ?',
					params: [response.id],
				})
			).results;
			const jobs = (
				await db.all({
					sql: 'SELECT id FROM telegram_outbox WHERE source_id = ?',
					params: [response.id],
				})
			).results;
			expect(payloads).toHaveLength(entry.state === 'verified' ? 1 : 0);
			expect(jobs).toHaveLength(payloads.length);
		}
	});
	it('preverified acceptance is atomic, retryable after failure and concurrent replay does not duplicate deliveries', async () => {
		const input = data();
		await db.run({
			sql: `CREATE TRIGGER synthetic_reject_confirmation BEFORE INSERT ON trial_intake_email_outbox WHEN NEW.kind = 'confirmation' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`,
		});
		await expect(
			service.create(input, async () => lessons, NOW, undefined, true)
		).rejects.toThrow();
		expect(
			(await db.first<{ state: string }>({ sql: 'SELECT state FROM trial_intake_requests' }))
				?.state
		).toBe('pending_email');
		for (const table of [
			'trial_intake_email_outbox',
			'trial_intake_telegram_payloads',
			'telegram_outbox',
		])
			expect(
				(await db.first<{ n: number }>({ sql: `SELECT COUNT(*) AS n FROM ${table}` }))?.n
			).toBe(0);
		await db.run({ sql: 'DROP TRIGGER synthetic_reject_confirmation' });
		const results = await Promise.all([
			service.create(input, async () => lessons, NOW, undefined, true),
			service.create(input, async () => lessons, NOW, undefined, true),
		]);
		expect(results[0]).toEqual(results[1]);
		expect(results[0].state).toBe('verified');
		for (const table of [
			'trial_intake_requests',
			'trial_intake_email_outbox',
			'trial_intake_telegram_payloads',
			'telegram_outbox',
		])
			expect(
				(await db.first<{ n: number }>({ sql: `SELECT COUNT(*) AS n FROM ${table}` }))?.n
			).toBe(1);
		await expect(
			service.create(
				{ ...input, phone: '+49 111111111' },
				async () => lessons,
				NOW,
				undefined,
				true
			)
		).rejects.toMatchObject({ status: 409 });
		const email = new FakeEmailProvider();
		const runtime = createOutboxRuntime(config(), { emailProvider: email });
		expect(await runtime.emailWorker.dispatchNext(NOW)).toBe('sent');
		expect(email.messages[0].subject).toContain('Ihre Anmeldung');
		expect(email.messages[0].text).not.toContain('/probestunde/verify');
		expect(await runtime.emailWorker.dispatchNext(NOW)).toBe('empty');
	});
	it('uses the existing email engine, minimal German mail and current-token dispatch guard', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		const email = new FakeEmailProvider();
		const runtime = createOutboxRuntime(config(), { emailProvider: email });
		expect(await runtime.emailWorker.dispatchNext(NOW)).toBe('sent');
		expect(email.messages[0].text).toContain('Musik');
		expect(email.messages[0].text).toContain(ORGANIZATION_NAME);
		expect(email.messages[0].text).not.toContain('2020-02-29');
		expect(email.messages[0].text).not.toContain('Zulu');
		expect(email.messages[0].html).toContain('>Anfrage bestätigen</a>');
		await service.resend(r.id, r.receipt, afterSeconds(NOW, 61));
		await service.verify(await token(r.id), afterSeconds(NOW, 62));
		// The cancelled verification letter is replaced by the confirmation letter.
		expect(
			await createOutboxRuntime(config(), { emailProvider: email }).emailWorker.dispatchNext(
				afterSeconds(NOW, 63)
			)
		).toBe('sent');
		const confirmation = email.messages[email.messages.length - 1];
		expect(confirmation.subject).toContain('Ihre Anmeldung');
		expect(confirmation.text).toContain('Ritzenbergstraße 3 • 01067 Dresden');
		expect(confirmation.text).toContain('+49 179 9474938');
		expect(confirmation.text).toContain('Kind Zulu');
		expect(confirmation.text).not.toContain('/probestunde/verify');
		expect(
			await createOutboxRuntime(config(), { emailProvider: email }).emailWorker.dispatchNext(
				afterSeconds(NOW, 63)
			)
		).toBe('empty');
		await seedAdmin();
		await service.create(data(), async () => lessons, afterSeconds(NOW, 64));
		email.failNext(new EmailProviderError('SYNTHETIC_REJECTION', false));
		expect(await runtime.emailWorker.dispatchNext(afterSeconds(NOW, 65))).toBe('dead');
		const admin = new IntakeAdmin(service);
		const dead = (await admin.emailQueue(actor))[0];
		expect(dead.status).toBe('dead');
		await admin.retryEmail(
			actor,
			String(dead.id),
			'synthetic-email-recovery',
			afterSeconds(NOW, 66)
		);
		expect(await runtime.emailWorker.dispatchNext(afterSeconds(NOW, 67))).toBe('sent');
		expect(await admin.emailQueue(actor)).toEqual([]);
	});
	it('confirmation is queued once per verified request and survives the verification cancel', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		const rows = async () =>
			(
				await db.all<{ kind: string; status: string; verification_version: number }>({
					sql: 'SELECT kind, status, verification_version FROM trial_intake_email_outbox WHERE request_id = ? ORDER BY kind',
					params: [r.id],
				})
			).results;
		expect(await rows()).toEqual([
			{ kind: 'verification', status: 'pending', verification_version: 1 },
		]);
		const t = await token(r.id);
		await service.verify(t, NOW);
		await service.verify(t, afterSeconds(NOW, 1));
		expect(await rows()).toEqual([
			{ kind: 'confirmation', status: 'pending', verification_version: 0 },
			{ kind: 'verification', status: 'cancelled', verification_version: 1 },
		]);
	});
	it('uses business hours and durable unknown/recovery without hiding a verified request', async () => {
		const friday = '2026-09-18T18:00:00.000Z';
		const r = await service.create(data(), async () => lessons, NOW);
		await service.resend(r.id, r.receipt, friday);
		await service.verify(await token(r.id), friday);
		const telegram = new FakeTelegramProvider();
		telegram.failNext(
			new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, { delivery: 'unknown' })
		);
		const runtime = createOutboxRuntime(config(), { telegramProvider: telegram });
		expect(await runtime.telegramWorker.dispatchNext(friday)).toBe('empty');
		expect(await runtime.telegramWorker.dispatchNext('2026-09-21T08:00:00.000Z')).toBe(
			'delivery_unknown'
		);
		expect((await service.get(r.id))?.state).toBe('verified');
		expect(await runtime.repository.countUnresolvedTelegramDeliveries()).toBe(1);
		expect(await runtime.telegramWorker.dispatchNext('2026-09-21T08:01:00.000Z')).toBe('empty');
	});
	it('an unknown delivery holds back only the parts of its own request; the admin sees why', async () => {
		await seedAdmin();
		const a = await verified(multiPartData());
		const at = (seconds: number) => afterSeconds(NOW, seconds);
		const b = await service.create(data(), async () => lessons, at(60));
		await service.verify(await token(b.id), at(60));
		const provider = new FakeTelegramProvider();
		provider.failNext(
			new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, { delivery: 'unknown' })
		);
		const runtime = createOutboxRuntime(config(), { telegramProvider: provider });
		expect(await runtime.telegramWorker.dispatchNext(at(120))).toBe('delivery_unknown');
		expect(await runtime.telegramWorker.dispatchNext(at(180))).toBe('sent');
		expect(provider.messages.map((m) => m.text.split('\n')[0])).toEqual([
			`Anfrage ${b.id} — Teil 1/1`,
		]);
		expect(await runtime.telegramWorker.dispatchNext(at(240))).toBe('empty');
		const parts = (
			await db.all<{ id: string; status: string }>({
				sql: `SELECT id, status FROM telegram_outbox WHERE source_id = ? ORDER BY id`,
				params: [a.id],
			})
		).results;
		expect(parts.length).toBeGreaterThan(1);
		expect(parts.map((p) => p.status)).toEqual([
			'delivery_unknown',
			...parts.slice(1).map(() => 'pending'),
		]);

		// Other sources keep the destination-wide block, including behind an intake ambiguity.
		await db.run(supportRow('support-held', at(240)));
		expect(await runtime.telegramWorker.dispatchNext(at(300))).toBe('empty');

		// The production path is Cron: it keeps draining later requests and keeps the alert open.
		const d = await service.create(data(), async () => lessons, at(300));
		await service.verify(await token(d.id), at(300));
		expect(
			await runScheduledJobs(config(), {
				triggerKind: 'scheduled',
				dedupeKey: 'intake-request-scoped-ambiguity',
				jobNames: ['email_outbox', 'telegram_outbox'],
				now: at(360),
			})
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					jobName: 'telegram_outbox',
					errorCode: 'TELEGRAM_DELIVERY_UNKNOWN',
				}),
			])
		);
		const statusOf = async (id: string) =>
			(
				await db.first<{ status: string }>({
					sql: 'SELECT status FROM telegram_outbox WHERE id = ?',
					params: [id],
				})
			)?.status;
		expect(await statusOf(`ti:${d.id}:1`)).toBe('sent');
		expect(await statusOf(`ti:${a.id}:2`)).toBe('pending');
		expect(await statusOf('support-held')).toBe('pending');

		// The admin sees the request context, the code to look for and why the next part waits.
		const admin = new IntakeAdmin(service);
		expect(await admin.deliveryAttention(actor)).toEqual({ unknown: true, dead: false });
		const context = await admin.outboxContext(
			actor,
			[a.id, a.id, 'removed-by-retention'],
			'context-read',
			at(360)
		);
		expect(context).toEqual({
			[a.id]: {
				deleted: false,
				parentLastName: 'Parent',
				subjects: [...new Set([lessons[0].subject, lessons[1].subject])].sort(),
				receivedAt: NOW,
			},
			'removed-by-retention': { deleted: true },
		});
		expect(
			await db.first({
				sql: `SELECT target_id FROM audit_events WHERE action = 'trial_intake.outbox_context_read'`,
			})
		).toEqual({ target_id: 'outbox' });
		const delivery = (await admin.detail(actor, a.id, 'detail', at(360))).delivery;
		const reference = delivery[0].deliveryReference!;
		expect(reference).toMatch(/^TG-[0-9A-F]{12}$/);
		expect(delivery[0]).toMatchObject({ part: 1, total: parts.length, status: 'delivery_unknown' });
		expect(delivery[1]).toMatchObject({
			part: 2,
			status: 'pending',
			wait: { kind: 'unknown_decision', reference },
		});
		const ledger = await runtime.repository.listAdmin({ channel: 'telegram' });
		expect(ledger.find((row) => row.id === 'support-held')?.blockedByReference).toBe(reference);
		expect(ledger.find((row) => row.id === `ti:${d.id}:1`)?.blockedByReference).toBeUndefined();

		// The 0030 trigger enforces the same rule on any claim, not only on the repository SQL.
		const claimPart = (id: string, now: string) =>
			db.run({
				sql: `UPDATE telegram_outbox SET status = 'processing', locked_at = ?, lease_owner = 'direct-claim',
				 lease_until = ?, updated_at = ? WHERE id = ?`,
				params: [now, afterSeconds(now, 60), now, id],
			});
		await expect(claimPart(`ti:${a.id}:2`, at(420))).rejects.toThrow(
			'invalid telegram outbox transition'
		);
		await expect(claimPart('support-held', at(420))).rejects.toThrow(
			'invalid telegram outbox transition'
		);
		const unknownRow = ledger.find((row) => row.id === `ti:${a.id}:1`)!;
		await runtime.repository.resolveTelegramUnknown({
			admin: requireAdmin(actor),
			outboxId: unknownRow.id,
			attemptId: unknownRow.deliveryAttemptId!,
			action: 'confirm_sent',
			reasonCode: 'message_found_in_destination',
			idempotencyKey: 'confirm-found',
			requestId: 'confirm-found',
			now: at(480),
			additionalAttempts: 1,
		});
		await claimPart(`ti:${a.id}:2`, at(540));
		expect(await statusOf(`ti:${a.id}:2`)).toBe('processing');
	});
	it('an unknown delivery outside trial intake still stops the whole Telegram lane', async () => {
		await db.run(supportRow('support-unknown', NOW));
		const provider = new FakeTelegramProvider();
		provider.failNext(
			new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, { delivery: 'unknown' })
		);
		const runtime = createOutboxRuntime(config(), { telegramProvider: provider });
		expect(await runtime.telegramWorker.dispatchNext(afterSeconds(NOW, 10))).toBe(
			'delivery_unknown'
		);
		const a = await service.create(data(), async () => lessons, afterSeconds(NOW, 60));
		await service.verify(await token(a.id), afterSeconds(NOW, 60));
		expect(
			await runtime.repository.claimTelegram({
				now: afterSeconds(NOW, 120),
				leaseOwner: 'direct-claim',
				leaseUntil: afterSeconds(NOW, 180),
			})
		).toBeNull();
		expect(
			await runScheduledJobs(config(), {
				triggerKind: 'scheduled',
				dedupeKey: 'intake-lane-blocked',
				jobNames: ['email_outbox', 'telegram_outbox'],
				now: afterSeconds(NOW, 120),
			})
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					jobName: 'telegram_outbox',
					errorCode: 'TELEGRAM_DELIVERY_UNKNOWN',
				}),
			])
		);
		expect(
			await db.first({
				sql: 'SELECT status FROM telegram_outbox WHERE id = ?',
				params: [`ti:${a.id}:1`],
			})
		).toEqual({ status: 'pending' });
		expect(
			await db.first<{ safe_result_json: string }>({
				sql: `SELECT safe_result_json FROM scheduled_cadence_state WHERE cadence = 'fast'`,
			})
		).toMatchObject({ safe_result_json: expect.stringContaining('delivery_unknown_open') });
	});
	it('splits long Telegram data without truncation; every part uses same existing provider and opaque queue payload', async () => {
		const input = multiPartData();
		await verified(input);
		const provider = new FakeTelegramProvider();
		const runtime = createOutboxRuntime(config(), { telegramProvider: provider });
		while ((await runtime.telegramWorker.dispatchNext(NOW)) === 'sent') {
			/* bounded by stored parts */
		}
		expect(provider.messages.length).toBeGreaterThan(1);
		for (const message of provider.messages) {
			expect(message.text.length).toBeLessThanOrEqual(4096);
			expect(message.text).toContain('/admin/trial-intake/');
			expect(message.text).toContain('TG-');
		}
		for (const c of input.children)
			expect(provider.messages.map((m) => m.text).join('\n')).toContain(c.lastName);
		const rows = (
			await db.all<{ payload_json: string }>({
				sql: 'SELECT payload_json FROM telegram_outbox',
			})
		).results;
		for (const row of rows)
			expect(Object.keys(JSON.parse(row.payload_json))).toEqual(['payloadId']);
		await expect(
			renderTelegramTemplate({
				row: {
					id: 'x',
					source_kind: 'support_thread',
					source_id: 'x',
					template_or_category: 'bureau.support',
					destination_ref: 'bureau',
					locale: 'de',
					payload_json: JSON.stringify({ fullName: 'disallowed' }),
					dedupe_key: 'x',
					attempts: 0,
					max_attempts: 5,
					lease_owner: 'x',
				},
				config: config(),
				chatId: 'test',
			})
		).rejects.toThrow();
	});
	it('an admin closes a full lesson, the portal refuses it and reopening is audited', async () => {
		await seedAdmin();
		const admin = new IntakeAdmin(service);
		const closedIds = () => closedLessonIds(db, lessons);
		expect(await closedIds()).toEqual([]);
		await admin.setLessonClosed(actor, lessons[0], true, 'test', NOW);
		expect(await closedIds()).toEqual([lessons[0].id]);
		// Repeating the same closure stays a no-op instead of failing the admin action.
		await admin.setLessonClosed(actor, lessons[0], true, 'test', NOW);
		expect((await admin.closedLessons(actor)).length).toBe(1);
		await expect(
			service.create(data(), async () => lessons, NOW, closedIds)
		).rejects.toMatchObject({ code: 'INTAKE_LESSON_CLOSED', status: 409 });
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_requests',
				})
			)?.n
		).toBe(0);
		await expect(
			admin.setLessonClosed(undefined, lessons[0], false, 'test', NOW)
		).rejects.toThrow();
		await admin.setLessonClosed(actor, lessons[0], false, 'test', NOW);
		expect(await closedIds()).toEqual([]);
		// The other lesson stays available throughout, and both actions are audited.
		expect((await service.create(data(), async () => lessons, NOW, closedIds)).state).toBe(
			'pending_email'
		);
		const audited = (
			await db.all<{ action: string }>({
				sql: `SELECT action FROM audit_events WHERE action LIKE 'trial_intake.lesson_%' ORDER BY created_at, action`,
			})
		).results.map((row) => row.action);
		expect(audited).toEqual([
			'trial_intake.lesson_closed',
			'trial_intake.lesson_closed',
			'trial_intake.lesson_reopened',
		]);
	});
	it('admin filters any assigned child, pagination/sorts and idempotent reversible processing are audited', async () => {
		await seedAdmin();
		const r = await verified();
		const admin = new IntakeAdmin(service);
		await expect(admin.list(undefined, {}, 'test', NOW)).rejects.toMatchObject({
			code: 'AUTHENTICATION_REQUIRED',
		});
		await expect(
			admin.detail({ ...actor, role: 'parent' }, r.id, 'test', NOW)
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(
			(
				await admin.list(
					actor,
					{
						childLastName: 'alpha',
						subject: 'Musik',
						teacher: 'Lehrkraft A',
						building: 'Kolibri',
						weekday: 4,
					},
					'test',
					NOW
				)
			).rows
		).toHaveLength(1);
		expect(
			(await admin.list(actor, { childLastName: 'alpha', subject: 'Kunst' }, 'test', NOW))
				.rows
		).toHaveLength(0);
		for (const sort of ['received', 'subject', 'teacher', 'day', 'parent', 'child'])
			for (const direction of ['asc', 'desc'])
				expect(
					(await admin.list(actor, { sort, direction }, 'test', NOW)).rows
				).toHaveLength(2);
		await admin.setProcessed(actor, r.id, true, 'test', NOW);
		await admin.setProcessed(actor, r.id, true, 'test', afterSeconds(NOW, 60));
		expect((await service.get(r.id))?.delete_after).toBe(afterSeconds(NOW, 90 * 86400));
		await admin.setProcessed(actor, r.id, false, 'test', NOW);
		expect((await service.get(r.id))?.delete_after).toBeNull();
		const audits = (
			await db.all<{ safe_diff_json: string }>({
				sql: "SELECT safe_diff_json FROM audit_events WHERE action = 'trial_intake.status_changed'",
			})
		).results;
		expect(audits).toHaveLength(2);
		expect(JSON.stringify(audits)).not.toContain('guest@');
		for (let i = 0; i < 25; i++) await verified();
		const first = await admin.list(actor, { sort: 'child', page: 1 }, 'test', NOW);
		const second = await admin.list(actor, { sort: 'child', page: 2 }, 'test', NOW);
		expect(first.total).toBe(52);
		expect(first.rows).toHaveLength(50);
		expect(second.rows).toHaveLength(2);
		expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(52);
	}, 45_000);
	it('retention deletes PII/cascades and cancels unsent jobs; processed date controls 90-day TTL', async () => {
		await seedAdmin();
		const pending = await service.create(data(), async () => lessons, NOW);
		const active = await verified();
		const done = await verified();
		const admin = new IntakeAdmin(service);
		await admin.setProcessed(actor, done.id, true, 'test', NOW);
		expect(await cleanupIntake(db, afterSeconds(NOW, 14 * 86400 - 1))).toEqual({ deleted: 0 });
		expect(await cleanupIntake(db, afterSeconds(NOW, 14 * 86400))).toEqual({ deleted: 1 });
		expect(await service.get(pending.id)).toBeNull();
		expect(await cleanupIntake(db, afterSeconds(NOW, 90 * 86400))).toEqual({ deleted: 1 });
		expect(await service.get(done.id)).toBeNull();
		expect(await service.get(active.id)).not.toBeNull();
		expect(
			(
				await db.first<{ status: string }>({
					sql: 'SELECT status FROM telegram_outbox WHERE source_id = ?',
					params: [done.id],
				})
			)?.status
		).toBe('cancelled');
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_telegram_payloads WHERE request_id = ?',
					params: [done.id],
				})
			)?.n
		).toBe(0);
	});
	it('in-flight email fences deletion until lease reconciliation, and resend cannot invalidate dispatch', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		const runtime = createOutboxRuntime(config());
		await runtime.repository.claimEmail({
			now: NOW,
			leaseOwner: 'lease',
			leaseUntil: afterSeconds(NOW, 15 * 86400),
		});
		await expect(service.resend(r.id, r.receipt, afterSeconds(NOW, 61))).rejects.toMatchObject({
			status: 409,
		});
		expect(await cleanupIntake(db, afterSeconds(NOW, 14 * 86400))).toEqual({ deleted: 0 });
		expect(await cleanupIntake(db, afterSeconds(NOW, 15 * 86400))).toEqual({ deleted: 1 });
	});
	it('retention fences in-flight Telegram, reconciles ambiguity and permits cancellation but no retry after payload deletion', async () => {
		await seedAdmin();
		const r = await verified();
		await new IntakeAdmin(service).setProcessed(actor, r.id, true, 'test', NOW);
		const due = afterSeconds(NOW, 90 * 86400);
		const outbox = createOutboxRuntime(config()).repository;
		const row = (await outbox.claimTelegram({
			now: NOW,
			leaseOwner: 'synthetic-lease',
			leaseUntil: afterSeconds(due, 60),
		}))!;
		expect(
			await outbox.startTelegramDispatch({
				id: row.id,
				leaseOwner: row.lease_owner,
				deliveryReference: 'TG-ABCDEF123456',
				now: NOW,
			})
		).not.toBeNull();
		expect(await cleanupIntake(db, due)).toEqual({ deleted: 0 });
		const reconciled = afterSeconds(due, 61);
		expect(await cleanupIntake(db, reconciled)).toEqual({ deleted: 1 });
		const ledger = (await outbox.listAdmin({ channel: 'telegram', q: row.id }))[0];
		expect(ledger.status).toBe('delivery_unknown');
		const recovery = {
			admin: requireAdmin(actor),
			outboxId: row.id,
			attemptId: ledger.deliveryAttemptId!,
			reasonCode: 'delivery_abandoned' as const,
			idempotencyKey: 'synthetic-recovery',
			requestId: 'synthetic-recovery',
			now: reconciled,
			additionalAttempts: 1,
		};
		await expect(
			outbox.resolveTelegramUnknown({ ...recovery, action: 'retry_after_review' })
		).rejects.toThrow('INTAKE_PAYLOAD_UNAVAILABLE');
		expect(await outbox.resolveTelegramUnknown({ ...recovery, action: 'cancel' })).toEqual({
			replayed: false,
		});
	});
	it('minimal scheduler runs only delivery/security/retention without R2, and full mode never runs intake cleanup', async () => {
		const pending = await service.create(data(), async () => lessons, NOW);
		const now = afterSeconds(NOW, 14 * 86400);
		const results = await runScheduledEvent(
			config(),
			{ cron: '*/15 * * * *', scheduledTime: Date.parse(now) },
			{ clock: () => now }
		);
		expect(results.map((r) => r.jobName)).toEqual([
			'email_reservation_cleanup',
			'security_metadata_cleanup',
		]);
		expect(results.every((r) => r.status === 'succeeded')).toBe(true);
		expect(await service.get(pending.id)).toBeNull();
		const fullPending = await service.create(data(), async () => lessons, NOW);
		await runScheduledEvent(
			{ ...config(), portalMode: 'full' },
			{ cron: '*/15 * * * *', scheduledTime: Date.parse(afterSeconds(now, 901)) },
			{ clock: () => afterSeconds(now, 901) }
		);
		expect(await service.get(fullPending.id)).not.toBeNull();
	});
	it('fresh empty D1 admin bootstrap reuses password/session/reset primitives; repeat is rejected without a second identity', async () => {
		const userId = crypto.randomUUID();
		const identity = {
			firstName: 'Synthetic',
			lastName: 'Operator',
			email: 'operator@example.test',
			confirmEmail: 'operator@example.test',
			password: 'Synthetic-Password-2026!',
		};
		await db.batch(
			await buildIntakeBootstrap({ identity, userId, requestId: 'bootstrap', now: NOW })
		);
		const runtime = createAuthRuntime(config());
		const session = await runtime.service.login({
			data: { email: identity.email, password: identity.password },
			requestSubject: 'synthetic',
		});
		expect(session.role).toBe('admin');
		await runtime.service.requestPasswordReset({
			email: identity.email,
			requestSubject: 'synthetic',
		});
		expect(
			(
				await db.first<{ n: number }>({
					sql: "SELECT COUNT(*) AS n FROM email_outbox WHERE template_or_category = 'auth.password_reset'",
				})
			)?.n
		).toBe(1);
		await expect(
			db.batch(
				await buildIntakeBootstrap({
					identity,
					userId: crypto.randomUUID(),
					requestId: 'repeat',
					now: NOW,
				})
			)
		).rejects.toThrow();
		expect((await db.first<{ n: number }>({ sql: 'SELECT COUNT(*) AS n FROM users' }))?.n).toBe(
			1
		);
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM family_number_allocations',
				})
			)?.n
		).toBe(0);
	});
});

describe('intake additive migration upgrade', () => {
	it('upgrades an exact 0026 database without replacing existing tables or weakening Telegram guards', async () => {
		const old = await createMigratedTestD1({ through: '0026' });
		try {
			await applyTestD1Migrations(old.db, { after: '0026' });
			expect(
				await old.db
					.prepare("SELECT name FROM sqlite_master WHERE name = 'trial_intake_requests'")
					.first()
			).not.toBeNull();
			expect(
				await old.db
					.prepare(
						"SELECT name FROM sqlite_master WHERE name = 'telegram_outbox_allowed_transition'"
					)
					.first()
			).not.toBeNull();
		} finally {
			await old.dispose();
		}
	});
});

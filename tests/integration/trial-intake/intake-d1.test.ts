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
import { runScheduledEvent } from '$lib/server/operations/scheduler';
import { ORGANIZATION_NAME } from '$lib/organization';
import { renderTelegramTemplate } from '$lib/server/outbox/templates';
import { lessonIdentity } from '$lib/trial-intake/server/catalog.server';
import { intakeEndpoint, submit } from '$lib/trial-intake/server/http.server';
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
		expect(await service.verify(t, afterSeconds(NOW, 86401))).toEqual({ state: 'accepted' });
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
		const invoke = () => {
			const event = {
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
	it('splits long Telegram data without truncation; every part uses same existing provider and opaque queue payload', async () => {
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

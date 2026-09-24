import { createMigratedTestD1, applyTestD1Migrations } from '../../helpers/d1';
import { afterSeconds } from '$lib/trial-intake/server/service.server';
import { IntakeAdmin } from '$lib/trial-intake/server/admin.server';
import { createOutboxRuntime } from '$lib/server/outbox/runtime';
import { FakeTelegramProvider, TelegramProviderError } from '$lib/server/outbox/providers';
import { runScheduledEvent, runScheduledJobs } from '$lib/server/operations/scheduler';
import { renderTelegramTemplate } from '$lib/server/outbox/templates';
import { requireAdmin } from '$lib/server/security/authorization';
import {
	useIntakeD1,
	NOW,
	lessons,
	actor,
	db,
	service,
	data,
	multiPartData,
	supportRow,
	config,
	token,
	verified,
	seedAdmin,
} from './intake-harness';

useIntakeD1();

describe('intake Telegram delivery and scheduler', () => {
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

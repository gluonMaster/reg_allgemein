import { afterSeconds } from '$lib/trial-intake/server/service.server';
import { createOutboxRuntime } from '$lib/server/outbox/runtime';
import {
	FakeEmailProvider,
	FakeTelegramProvider,
	TelegramProviderError,
} from '$lib/server/outbox/providers';
import { runScheduledJobs } from '$lib/server/operations/scheduler';
import { requireAdmin } from '$lib/server/security/authorization';
import {
	useIntakeD1,
	NOW,
	lessons,
	actor,
	db,
	service,
	data,
	supportRow,
	config,
	token,
	verified,
	seedAdmin,
} from './intake-harness';

useIntakeD1();

const at = (seconds: number) => afterSeconds(NOW, seconds);
async function statusOf(id: string) {
	return (
		await db.first<{ status: string }>({
			sql: 'SELECT status FROM telegram_outbox WHERE id = ?',
			params: [id],
		})
	)?.status;
}
async function alerts() {
	return (
		await db.all<{ telegram_outbox_id: string; reason: string; status: string }>({
			sql: 'SELECT telegram_outbox_id, reason, status FROM trial_intake_telegram_alerts ORDER BY created_at, id',
		})
	).results;
}
async function verifiedAt(seconds: number) {
	const receipt = await service.create(data(), async () => lessons, at(seconds));
	await service.verify(await token(receipt.id), at(seconds));
	return receipt;
}
function cron(dedupeKey: string, seconds: number, portalMode?: 'full') {
	return runScheduledJobs(portalMode ? { ...config(), portalMode } : config(), {
		triggerKind: 'scheduled',
		dedupeKey,
		jobNames: ['email_outbox', 'telegram_outbox'],
		now: at(seconds),
	});
}
async function fastReason() {
	return (
		await db.first<{ safe_result_json: string }>({
			sql: `SELECT safe_result_json FROM scheduled_cadence_state WHERE cadence = 'fast'`,
		})
	)?.safe_result_json;
}

describe('intake Telegram independence and bureau alerts', () => {
	it('an ambiguity outside trial intake holds back its own source, not request notifications', async () => {
		await db.run(supportRow('support-unknown', NOW));
		const provider = new FakeTelegramProvider();
		provider.failNext(
			new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, { delivery: 'unknown' })
		);
		const runtime = createOutboxRuntime(config(), { telegramProvider: provider });
		expect(await runtime.telegramWorker.dispatchNext(at(10))).toBe('delivery_unknown');
		await db.run(supportRow('support-waiting', at(20)));
		const a = await verifiedAt(60);

		expect(await cron('intake-past-support-ambiguity', 120)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					jobName: 'telegram_outbox',
					errorCode: 'TELEGRAM_DELIVERY_UNKNOWN',
				}),
			])
		);
		expect(await statusOf(`ti:${a.id}:1`)).toBe('sent');
		expect(await statusOf('support-waiting')).toBe('pending');
		expect(await fastReason()).toContain('delivery_unknown_open');
		await expect(
			db.run({
				sql: `UPDATE telegram_outbox SET status = 'processing', locked_at = ?, lease_owner = 'direct-claim',
				 lease_until = ?, updated_at = ? WHERE id = 'support-waiting'`,
				params: [at(180), at(240), at(180)],
			})
		).rejects.toThrow('invalid telegram outbox transition');

		// The full portal keeps its whole-lane stop; only trial-intake mode drains past it.
		const b = await verifiedAt(240);
		await cron('full-mode-lane-stop', 300, 'full');
		expect(await statusOf(`ti:${b.id}:1`)).toBe('pending');
	});
	it('a refused request notification does not stop later requests and the bureau is e-mailed', async () => {
		const a = await verified();
		const provider = new FakeTelegramProvider();
		provider.failNext(
			new TelegramProviderError('TELEGRAM_REQUEST_REJECTED', false, { delivery: 'not_delivered' })
		);
		const runtime = createOutboxRuntime(config(), { telegramProvider: provider });
		expect(await runtime.telegramWorker.dispatchNext(at(60))).toBe('dead');
		const b = await verifiedAt(120);

		expect(await cron('intake-past-dead', 180)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ jobName: 'telegram_outbox', errorCode: 'TELEGRAM_OUTBOX_DEAD' }),
			])
		);
		expect(await statusOf(`ti:${a.id}:1`)).toBe('dead');
		expect(await statusOf(`ti:${b.id}:1`)).toBe('sent');
		expect(await fastReason()).toContain('terminal_dead_open');
		expect(
			(await alerts()).map(({ telegram_outbox_id, reason }) => ({ telegram_outbox_id, reason }))
		).toEqual([{ telegram_outbox_id: `ti:${a.id}:1`, reason: 'dead' }]);
		// Guest letters share the e-mail lane, so the alert may need another tick.
		for (let tick = 0; tick < 4 && (await alerts())[0].status !== 'sent'; tick += 1)
			await cron(`intake-mail-${tick}`, 240 + tick * 60);
		expect((await alerts()).map((alert) => alert.status)).toEqual(['sent']);
	});
	it('an unknown request notification e-mails the bureau once per incident without request data', async () => {
		await seedAdmin();
		const a = await verified();
		const provider = new FakeTelegramProvider();
		provider.failNext(
			new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, { delivery: 'unknown' })
		);
		const runtime = createOutboxRuntime(config(), { telegramProvider: provider });
		expect(await runtime.telegramWorker.dispatchNext(at(60))).toBe('delivery_unknown');
		expect(await alerts()).toEqual([
			{ telegram_outbox_id: `ti:${a.id}:1`, reason: 'delivery_unknown', status: 'pending' },
		]);

		const email = new FakeEmailProvider();
		const mail = createOutboxRuntime(config(), { emailProvider: email });
		while ((await mail.emailWorker.dispatchNext(at(120))) === 'sent') {
			/* guest confirmation first, then the alert */
		}
		const sent = email.messages.filter((m) => m.to === 'registration@kolibri-dresden.de');
		expect(sent).toHaveLength(1);
		const [alert] = sent;
		const attempt = await db.first<{ delivery_reference: string }>({
			sql: 'SELECT delivery_reference FROM telegram_delivery_attempts WHERE outbox_id = ?',
			params: [`ti:${a.id}:1`],
		});
		expect(alert.subject).toContain('nicht bestätigt');
		expect(alert.text).toContain(`Zustellcode: ${attempt!.delivery_reference} (Teil 1)`);
		expect(alert.text).toContain(`https://portal.example.test/admin/trial-intake/${a.id}`);
		expect(alert.text).toContain(
			'https://portal.example.test/admin/outbox?channel=telegram&status=delivery_unknown'
		);
		for (const personal of ['Synthetic', 'Parent', 'Zulu', 'Alpha', 'guest@example.test', '000000000'])
			expect(`${alert.subject}\n${alert.text}\n${alert.html}`).not.toContain(personal);
		expect(await mail.emailWorker.dispatchNext(at(180))).toBe('empty');

		// After the admin allows a retry, a second ambiguity is a new incident with its own alert.
		const unknown = (await runtime.repository.listAdmin({ channel: 'telegram' })).find(
			(row) => row.id === `ti:${a.id}:1`
		)!;
		await runtime.repository.resolveTelegramUnknown({
			admin: requireAdmin(actor),
			outboxId: unknown.id,
			attemptId: unknown.deliveryAttemptId!,
			action: 'retry_after_review',
			reasonCode: 'message_absence_verified',
			idempotencyKey: 'retry-not-found',
			requestId: 'retry-not-found',
			now: at(240),
			additionalAttempts: 1,
		});
		provider.failNext(
			new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, { delivery: 'unknown' })
		);
		expect(await runtime.telegramWorker.dispatchNext(at(300))).toBe('delivery_unknown');
		expect((await alerts()).map((row) => row.reason)).toEqual([
			'delivery_unknown',
			'delivery_unknown',
		]);
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseBoundary } from '$lib/server/db/database';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import {
	drainOutbox,
	runScheduledJobs,
	TELEGRAM_DRAIN_STOP_OUTCOMES,
} from '$lib/server/operations/scheduler';
import { parseBusinessHours } from '$lib/server/outbox/business-hours';
import { OutboxRepository } from '$lib/server/outbox/outbox-repository';
import { TelegramOutboxWorker } from '$lib/server/outbox/outbox-worker';
import {
	FakeTelegramProvider,
	TelegramProviderError,
} from '$lib/server/outbox/providers';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const NOW = '2026-07-22T10:00:00.000Z';
const BEFORE_COOLDOWN = '2026-07-22T10:01:59.000Z';
const COOLDOWN_UNTIL = '2026-07-22T10:02:00.000Z';
const FALLBACK_COOLDOWN_UNTIL = '2026-07-22T10:01:00.000Z';
const schedule = parseBusinessHours('Europe/Berlin', 'Mo-Fr 09:00-17:00');
const timing = { leaseSeconds: 30, retryBaseSeconds: 60, retryMaxSeconds: 300 };
const portal = { portalPublicOrigin: 'https://portal.example.test' };

function telegramRow(id: string, createdAt = NOW) {
	const reference = crypto.randomUUID();
	return {
		sql: `INSERT INTO telegram_outbox
			(id, source_kind, source_id, template_or_category, destination_ref, locale,
			 payload_json, dedupe_key, not_before, status, attempts, max_attempts,
			 created_at, updated_at)
		VALUES (?, 'support_thread', ?, 'bureau.support', 'bureau', 'de', ?, ?, ?,
			'pending', 0, 3, ?, ?)`,
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

describe('Telegram scheduler drain safety in D1', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;
	let repository: OutboxRepository;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		repository = new OutboxRepository(db);
	});

	afterEach(async () => context.dispose());

	it('stops after one provider call becomes delivery-unknown and leaves the next row untouched', async () => {
		await db.batch([
			telegramRow('telegram-ambiguous-a'),
			telegramRow('telegram-ambiguous-b'),
		]);
		const provider = new FakeTelegramProvider();
		provider.failNext(new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, {
			delivery: 'unknown',
		}));
		const send = vi.spyOn(provider, 'send');
		const worker = new TelegramOutboxWorker(
			repository,
			provider,
			'bureau-chat',
			portal,
			schedule,
			timing,
			'telegram-ambiguous-drain',
			() => NOW
		);

		const result = await drainOutbox(
			(value) => worker.dispatchNext(value),
			10,
			() => NOW,
			TELEGRAM_DRAIN_STOP_OUTCOMES
		);

		expect(result).toEqual({
			claimed: 1, sent: 0, retry: 0, dead: 0, deliveryUnknown: 1,
			deferred: 0, lostLease: 0,
		});
		expect(send).toHaveBeenCalledTimes(1);
		expect(await db.all<{ id: string; status: string; attempts: number }>({
			sql: `SELECT id, status, attempts FROM telegram_outbox ORDER BY id`,
		})).toMatchObject({
			results: [
				{ id: 'telegram-ambiguous-a', status: 'delivery_unknown', attempts: 1 },
				{ id: 'telegram-ambiguous-b', status: 'pending', attempts: 0 },
			],
		});
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM telegram_delivery_attempts`,
		})).toEqual({ count: 1 });

		const scheduled = await runScheduledJobs(loadRuntimeConfig({
			APP_ENV: 'test',
			PORTAL_PUBLIC_ORIGIN: portal.portalPublicOrigin,
			DB: context.db,
			SCHEDULED_JOBS_ENABLED: 'true',
			TELEGRAM_PROVIDER: 'fake',
			TELEGRAM_CHAT_ID: 'bureau-chat',
		}), {
			triggerKind: 'scheduled',
			dedupeKey: 'telegram-ambiguous-follow-up',
			jobNames: ['telegram_outbox'],
			now: '2026-07-22T10:01:00.000Z',
		});
		expect(scheduled).toEqual([
			expect.objectContaining({
				jobName: 'telegram_outbox',
				status: 'failed',
				errorCode: 'TELEGRAM_DELIVERY_UNKNOWN',
			}),
		]);
		expect(await db.first<{ status: string; attempts: number }>({
			sql: `SELECT status, attempts FROM telegram_outbox
				WHERE id = 'telegram-ambiguous-b'`,
		})).toEqual({ status: 'pending', attempts: 0 });
		expect(await db.first<{ safe_result_json: string }>({
			sql: `SELECT safe_result_json FROM scheduled_job_runs
				WHERE dedupe_key = 'scheduled:telegram-ambiguous-follow-up'`,
		})).toMatchObject({
			safe_result_json: expect.stringContaining('delivery_unknown_open'),
		});
	});

	it('persists a 429 destination cooldown across drains and blocks a newly queued row', async () => {
		await db.batch([
			telegramRow('telegram-rate-limit-a'),
			telegramRow('telegram-rate-limit-b'),
		]);
		const rateLimitedProvider = new FakeTelegramProvider();
		rateLimitedProvider.failNext(new TelegramProviderError('TELEGRAM_RATE_LIMITED', true, {
			retryAfterSeconds: 120,
		}));
		const firstSend = vi.spyOn(rateLimitedProvider, 'send');
		const firstWorker = new TelegramOutboxWorker(
			repository,
			rateLimitedProvider,
			'bureau-chat',
			portal,
			schedule,
			timing,
			'telegram-rate-limit-first',
			() => NOW
		);

		const firstRun = await drainOutbox(
			(value) => firstWorker.dispatchNext(value),
			10,
			() => NOW,
			TELEGRAM_DRAIN_STOP_OUTCOMES
		);
		expect(firstRun).toEqual({
			claimed: 1, sent: 0, retry: 1, dead: 0, deliveryUnknown: 0,
			deferred: 0, lostLease: 0,
		});
		expect(firstSend).toHaveBeenCalledTimes(1);
		expect(await db.all<{
			id: string; status: string; not_before: string; next_attempt_at: string;
		}>({
			sql: `SELECT id, status, not_before, next_attempt_at
				FROM telegram_outbox ORDER BY id`,
		})).toMatchObject({
			results: [
				{
					id: 'telegram-rate-limit-a', status: 'retry',
					not_before: COOLDOWN_UNTIL, next_attempt_at: COOLDOWN_UNTIL,
				},
				{
					id: 'telegram-rate-limit-b', status: 'pending',
					not_before: COOLDOWN_UNTIL, next_attempt_at: COOLDOWN_UNTIL,
				},
			],
		});
		expect(await db.first<{
			scope: string; resource_key: string; lease_until: string;
		}>({
			sql: `SELECT scope, resource_key, lease_until FROM operation_locks
				WHERE scope = 'provider-cooldown'`,
		})).toEqual({
			scope: 'provider-cooldown',
			resource_key: 'telegram:bureau',
			lease_until: COOLDOWN_UNTIL,
		});

		// This row did not exist when the 429 batch moved the queue timestamps. The
		// persisted destination lock must still prevent it from bypassing retry_after.
		await db.run(telegramRow('telegram-rate-limit-new', '2026-07-22T10:00:30.000Z'));
		const nextProvider = new FakeTelegramProvider();
		const nextSend = vi.spyOn(nextProvider, 'send');
		const nextWorker = new TelegramOutboxWorker(
			repository,
			nextProvider,
			'bureau-chat',
			portal,
			schedule,
			timing,
			'telegram-rate-limit-next',
			() => BEFORE_COOLDOWN
		);
		const nextRun = await drainOutbox(
			(value) => nextWorker.dispatchNext(value),
			10,
			() => BEFORE_COOLDOWN,
			TELEGRAM_DRAIN_STOP_OUTCOMES
		);

		expect(nextRun).toMatchObject({ claimed: 0, sent: 0 });
		expect(nextSend).not.toHaveBeenCalled();
		expect(await db.first<{ status: string; attempts: number }>({
			sql: `SELECT status, attempts FROM telegram_outbox
				WHERE id = 'telegram-rate-limit-new'`,
		})).toEqual({ status: 'pending', attempts: 0 });
	});

	it('uses deterministic backoff as a destination cooldown when 429 omits retry_after', async () => {
		await db.batch([
			telegramRow('telegram-rate-limit-fallback-a'),
			telegramRow('telegram-rate-limit-fallback-b'),
		]);
		const provider = new FakeTelegramProvider();
		provider.failNext(new TelegramProviderError('TELEGRAM_RATE_LIMITED', true));
		const send = vi.spyOn(provider, 'send');
		const worker = new TelegramOutboxWorker(
			repository,
			provider,
			'bureau-chat',
			portal,
			schedule,
			timing,
			'telegram-rate-limit-fallback',
			() => NOW
		);

		expect(await worker.dispatchNext()).toBe('retry');
		expect(send).toHaveBeenCalledTimes(1);
		expect(await db.all<{
			id: string; status: string; not_before: string; next_attempt_at: string;
		}>({
			sql: `SELECT id, status, not_before, next_attempt_at
				FROM telegram_outbox ORDER BY id`,
		})).toMatchObject({
			results: [
				{
					id: 'telegram-rate-limit-fallback-a', status: 'retry',
					not_before: FALLBACK_COOLDOWN_UNTIL,
					next_attempt_at: FALLBACK_COOLDOWN_UNTIL,
				},
				{
					id: 'telegram-rate-limit-fallback-b', status: 'pending',
					not_before: FALLBACK_COOLDOWN_UNTIL,
					next_attempt_at: FALLBACK_COOLDOWN_UNTIL,
				},
			],
		});
		expect(await db.first<{ lease_until: string }>({
			sql: `SELECT lease_until FROM operation_locks
				WHERE scope = 'provider-cooldown' AND resource_key = 'telegram:bureau'`,
		})).toEqual({ lease_until: FALLBACK_COOLDOWN_UNTIL });

		const secondProvider = new FakeTelegramProvider();
		const secondSend = vi.spyOn(secondProvider, 'send');
		const secondWorker = new TelegramOutboxWorker(
			repository,
			secondProvider,
			'bureau-chat',
			portal,
			schedule,
			timing,
			'telegram-rate-limit-fallback-next',
			() => '2026-07-22T10:00:59.000Z'
		);
		expect(await secondWorker.dispatchNext()).toBe('empty');
		expect(secondSend).not.toHaveBeenCalled();
	});

	it('keeps a later cron fail-closed while any bureau row remains dead', async () => {
		await db.batch([
			telegramRow('telegram-terminal-dead-a'),
			telegramRow('telegram-terminal-dead-b'),
		]);
		const firstProvider = new FakeTelegramProvider();
		firstProvider.failNext(new TelegramProviderError('TELEGRAM_REQUEST_REJECTED', false));
		const firstWorker = new TelegramOutboxWorker(
			repository,
			firstProvider,
			'bureau-chat',
			portal,
			schedule,
			timing,
			'telegram-terminal-dead-first',
			() => NOW
		);
		expect(await firstWorker.dispatchNext()).toBe('dead');

		const scheduled = await runScheduledJobs(loadRuntimeConfig({
			APP_ENV: 'test',
			PORTAL_PUBLIC_ORIGIN: portal.portalPublicOrigin,
			DB: context.db,
			SCHEDULED_JOBS_ENABLED: 'true',
			TELEGRAM_PROVIDER: 'fake',
			TELEGRAM_CHAT_ID: 'bureau-chat',
		}), {
			triggerKind: 'scheduled',
			dedupeKey: 'telegram-terminal-dead-follow-up',
			jobNames: ['telegram_outbox'],
			now: '2026-07-22T10:01:00.000Z',
		});

		expect(scheduled).toEqual([
			expect.objectContaining({
				jobName: 'telegram_outbox',
				status: 'failed',
				errorCode: 'TELEGRAM_OUTBOX_DEAD',
			}),
		]);
		expect(await db.first<{ status: string; attempts: number }>({
			sql: `SELECT status, attempts FROM telegram_outbox
				WHERE id = 'telegram-terminal-dead-b'`,
		})).toEqual({ status: 'pending', attempts: 0 });
		expect(await db.first<{ safe_result_json: string }>({
			sql: `SELECT safe_result_json FROM scheduled_job_runs
				WHERE dedupe_key = 'scheduled:telegram-terminal-dead-follow-up'`,
		})).toMatchObject({
			safe_result_json: expect.stringContaining('terminal_dead_open'),
		});
	});

	it('applies configured max attempts when claiming a producer row', async () => {
		await db.run(telegramRow('telegram-config-max-attempts'));
		const provider = new FakeTelegramProvider();
		provider.failNext(new TelegramProviderError('TELEGRAM_TEMPORARY_FAILURE', true));
		const worker = new TelegramOutboxWorker(
			repository,
			provider,
			'bureau-chat',
			portal,
			schedule,
			{ ...timing, maxAttempts: 1 },
			'telegram-config-max-worker',
			() => NOW
		);

		expect(await worker.dispatchNext()).toBe('dead');
		expect(await db.first<{
			status: string; attempts: number; max_attempts: number;
		}>({
			sql: `SELECT status, attempts, max_attempts FROM telegram_outbox
				WHERE id = 'telegram-config-max-attempts'`,
		})).toEqual({ status: 'dead', attempts: 1, max_attempts: 1 });
	});

	it('leaves pre-activation backlog pending and dispatches a newer row', async () => {
		await db.batch([
			telegramRow('telegram-before-activation', '2026-07-22T09:59:59.000Z'),
			telegramRow('telegram-after-activation', '2026-07-22T10:00:01.000Z'),
		]);
		const provider = new FakeTelegramProvider();
		const worker = new TelegramOutboxWorker(
			repository,
			provider,
			'bureau-chat',
			portal,
			schedule,
			{ ...timing, activationAt: NOW },
			'telegram-activation-worker',
			() => '2026-07-22T10:00:02.000Z'
		);

		expect(await worker.dispatchNext()).toBe('sent');
		expect(provider.messages).toHaveLength(1);
		expect(await db.all<{ id: string; status: string; attempts: number }>({
			sql: `SELECT id, status, attempts FROM telegram_outbox ORDER BY id`,
		})).toMatchObject({
			results: [
				{ id: 'telegram-after-activation', status: 'sent', attempts: 1 },
				{ id: 'telegram-before-activation', status: 'pending', attempts: 0 },
			],
		});
	});
});

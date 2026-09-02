import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { runScheduledEvent } from '$lib/server/operations/scheduler';
import { parseBusinessHours } from '$lib/server/outbox/business-hours';
import { OutboxRepository } from '$lib/server/outbox/outbox-repository';
import { TelegramOutboxWorker } from '$lib/server/outbox/outbox-worker';
import { FakeTelegramProvider, TelegramProviderError } from '$lib/server/outbox/providers';
import {
	createMeteredD1,
	createMigratedTestD1,
	type D1CostSnapshot,
	type TestD1Context,
} from '../helpers/d1';

const FAST_SCHEDULED_AT = Date.parse('2030-08-12T11:59:42.000Z');
const MAINTENANCE_SCHEDULED_AT = Date.parse('2030-08-12T11:45:42.000Z');
const WARM_NOW = '2030-08-12T12:00:00.000Z';
const FAST_NOW = '2030-08-12T12:01:00.000Z';
const MAINTENANCE_NOW = '2030-08-12T12:15:00.000Z';
const TELEGRAM_SCHEDULE = parseBusinessHours('Europe/Berlin', 'Mo-Fr 09:00-17:00');
const EMPTY_R2_ARCHIVE = {
	get: async () => null,
	put: async () => null,
	delete: async () => undefined,
} as unknown as R2Bucket;
const EMPTY_R2_QUARANTINE = {
	get: async () => null,
	put: async () => null,
	delete: async () => undefined,
} as unknown as R2Bucket;

function telegramRow(id: string, createdAt = WARM_NOW) {
	const sourceId = crypto.randomUUID();
	return {
		sql: `INSERT INTO telegram_outbox
			(id, source_kind, source_id, template_or_category, destination_ref, locale,
			 payload_json, dedupe_key, not_before, status, attempts, max_attempts,
			 created_at, updated_at)
		VALUES (?, 'support_thread', ?, 'bureau.support', 'bureau', 'de', ?, ?, ?,
			'pending', 0, 3, ?, ?)`,
		params: [
			id,
			sourceId,
			JSON.stringify({
				category: 'technical',
				reference: sourceId,
				receivedAt: createdAt,
				adminPath: `/admin/messages/${sourceId}`,
			}),
			`cost:${id}`,
			createdAt,
			createdAt,
			createdAt,
		],
	};
}

describe('background D1 cost regression', () => {
	let context: TestD1Context;

	beforeEach(async () => {
		context = await createMigratedTestD1();
	});

	afterEach(async () => context.dispose());

	function runtime(
		database: D1Database,
		scheduledJobsEnabled: boolean,
		providers: 'disabled' | 'fake' = 'disabled',
		storageBindings = false
	) {
		return loadRuntimeConfig({
			APP_ENV: 'test',
			PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
			DB: database,
			SCHEDULED_JOBS_ENABLED: scheduledJobsEnabled ? 'true' : 'false',
			EMAIL_PROVIDER: providers,
			TELEGRAM_PROVIDER: providers,
			...(providers === 'fake' ? { TELEGRAM_CHAT_ID: '-1001234567890' } : {}),
			...(storageBindings
				? { R2_ARCHIVE: EMPTY_R2_ARCHIVE, R2_QUARANTINE: EMPTY_R2_QUARANTINE }
				: {}),
		});
	}

	async function measureSteadyEmptyCadences(
		providers: 'disabled' | 'fake' = 'disabled',
		storageBindings = true
	): Promise<{
		fast: D1CostSnapshot;
		maintenance: D1CostSnapshot;
	}> {
		const meter = createMeteredD1(context.db);
		const config = runtime(meter.database, true, providers, storageBindings);
		// Seed the two fixed cadence rows, the nine fixed job locks and provider
		// policy exactly once; the asserted sample is the ongoing daily cost.
		await runScheduledEvent(
			config,
			{ scheduledTime: FAST_SCHEDULED_AT, cron: '* * * * *' },
			{ clock: () => WARM_NOW }
		);
		await runScheduledEvent(
			config,
			{ scheduledTime: MAINTENANCE_SCHEDULED_AT, cron: '*/15 * * * *' },
			{ clock: () => WARM_NOW }
		);

		meter.reset();
		await runScheduledEvent(
			config,
			{ scheduledTime: FAST_SCHEDULED_AT + 60_000, cron: '* * * * *' },
			{ clock: () => FAST_NOW }
		);
		const fast = meter.snapshot();
		meter.reset();
		await runScheduledEvent(
			config,
			{ scheduledTime: MAINTENANCE_SCHEDULED_AT + 15 * 60_000, cron: '*/15 * * * *' },
			{ clock: () => MAINTENANCE_NOW }
		);
		return { fast, maintenance: meter.snapshot() };
	}

	it('bounds steady empty-portal cadence cost and the 24-hour projection', async () => {
		const measured = await measureSteadyEmptyCadences('fake');
		console.info('Local steady empty background D1 cadence cost:', measured);
		expect(measured.fast.rowsWritten).toBeLessThanOrEqual(10);
		expect(measured.maintenance.rowsWritten).toBeLessThanOrEqual(20);
		expect(measured.fast.rowsRead).toBeLessThanOrEqual(40);
		expect(measured.maintenance.rowsRead).toBeLessThanOrEqual(80);
		const daily = {
			rowsRead: measured.fast.rowsRead * 1_440 + measured.maintenance.rowsRead * 96,
			rowsWritten: measured.fast.rowsWritten * 1_440 + measured.maintenance.rowsWritten * 96,
		};
		expect(daily.rowsRead).toBeLessThanOrEqual(100_000);
		expect(daily.rowsWritten).toBeLessThanOrEqual(15_000);
		const dailyWithFiveMinuteHealthAndThresholdErrors = {
			rowsRead: daily.rowsRead + 3 * 288 + 2 * 1_440,
			rowsWritten: daily.rowsWritten + 4 * 1_440,
		};
		expect(dailyWithFiveMinuteHealthAndThresholdErrors.rowsRead).toBeLessThanOrEqual(100_000);
		expect(dailyWithFiveMinuteHealthAndThresholdErrors.rowsWritten).toBeLessThanOrEqual(20_000);
		console.info('Local steady empty background D1 cost:', {
			...measured,
			daily,
			dailyWithFiveMinuteHealthAndThresholdErrors,
		});
	});

	it('bounds the empty-portal cadence cost while both delivery providers are disabled', async () => {
		const measured = await measureSteadyEmptyCadences('disabled');
		const daily = {
			rowsRead: measured.fast.rowsRead * 1_440 + measured.maintenance.rowsRead * 96,
			rowsWritten: measured.fast.rowsWritten * 1_440 + measured.maintenance.rowsWritten * 96,
		};
		expect(measured.fast.rowsRead).toBeLessThanOrEqual(40);
		expect(measured.fast.rowsWritten).toBeLessThanOrEqual(10);
		expect(measured.maintenance.rowsRead).toBeLessThanOrEqual(80);
		expect(measured.maintenance.rowsWritten).toBeLessThanOrEqual(20);
		expect(daily.rowsRead).toBeLessThanOrEqual(100_000);
		expect(daily.rowsWritten).toBeLessThanOrEqual(15_000);
		const lockRows = await new DatabaseBoundary(context.db).all<{ resource_key: string }>({
			sql: `SELECT resource_key FROM operation_locks
				WHERE scope = 'scheduled-job' ORDER BY resource_key`,
		});
		expect(lockRows.results.map((row) => row.resource_key)).toEqual([
			'document_quarantine',
			'email_reservation_cleanup',
			'funding_authorization_expiry',
			'price_review',
			'privacy_r2_cleanup',
			'security_metadata_cleanup',
			'storage_orphan_cleanup',
			'telegram_outbox',
		]);
		console.info('Local provider-disabled empty background D1 cost:', { ...measured, daily });
	});

	it('captures the disabled scheduled path', async () => {
		const meter = createMeteredD1(context.db);
		await runScheduledEvent(
			runtime(meter.database, false),
			{ scheduledTime: FAST_SCHEDULED_AT, cron: '* * * * *' },
			{ clock: () => WARM_NOW }
		);
		const measured = meter.snapshot();
		expect(measured).toEqual({ queries: 0, rowsRead: 0, rowsWritten: 0 });
		console.info('Local disabled background D1 cost:', measured);
	});

	it('avoids job leases for provider and storage paths with no possible work', async () => {
		const measured = await measureSteadyEmptyCadences('disabled', false);
		const daily = {
			rowsRead: measured.fast.rowsRead * 1_440 + measured.maintenance.rowsRead * 96,
			rowsWritten: measured.fast.rowsWritten * 1_440 + measured.maintenance.rowsWritten * 96,
		};
		expect(measured.fast.rowsWritten).toBeLessThanOrEqual(5);
		expect(measured.maintenance.rowsWritten).toBeLessThanOrEqual(15);
		expect(daily.rowsRead).toBeLessThanOrEqual(50_000);
		expect(daily.rowsWritten).toBeLessThanOrEqual(10_000);
		console.info('Local fully inert provider/storage D1 cost:', { ...measured, daily });
	});

	it('does not rewrite unchanged Telegram policy state on the next empty batch', async () => {
		const measured = await measureSteadyEmptyCadences('fake');
		expect(measured.fast.rowsWritten).toBeLessThanOrEqual(10);
	});

	it('keeps cadence cost independent of 20,000 retained scheduled runs', async () => {
		await new DatabaseBoundary(context.db).run({
			sql: `WITH RECURSIVE history(n) AS (
				SELECT 1 UNION ALL SELECT n + 1 FROM history WHERE n < 20000
			)
			INSERT INTO scheduled_job_runs
				(id, job_name, trigger_kind, dedupe_key, status, started_at,
				 finished_at, created_at, updated_at)
			SELECT 'cost-history-' || n, 'email_outbox', 'scheduled',
				'cost-history-' || n, 'succeeded', '2029-08-12T12:00:00.000Z',
				'2029-08-12T12:00:00.000Z', '2029-08-12T12:00:00.000Z',
				'2029-08-12T12:00:00.000Z' FROM history`,
		});
		const measured = await measureSteadyEmptyCadences('fake');
		expect(measured.fast).toMatchObject({ rowsWritten: 6 });
		expect(measured.fast.rowsRead).toBeLessThanOrEqual(40);
		expect(measured.maintenance.rowsWritten).toBeLessThanOrEqual(20);
		expect(measured.maintenance.rowsRead).toBeLessThanOrEqual(80);
		console.info('Local 20k-history background D1 cost:', measured);
	});

	it('bounds a non-empty Telegram drain and prepares its policy only once', async () => {
		const meter = createMeteredD1(context.db);
		const config = runtime(meter.database, true, 'fake');
		await runScheduledEvent(
			config,
			{ scheduledTime: FAST_SCHEDULED_AT, cron: '* * * * *' },
			{ clock: () => WARM_NOW }
		);
		const db = new DatabaseBoundary(context.db);
		await db.batch([
			telegramRow('cost-queue-1'),
			telegramRow('cost-queue-2'),
			telegramRow('cost-queue-3'),
		]);

		meter.reset();
		const results = await runScheduledEvent(
			config,
			{ scheduledTime: FAST_SCHEDULED_AT + 60_000, cron: '* * * * *' },
			{ clock: () => FAST_NOW }
		);
		const measured = meter.snapshot();
		console.info('Local non-empty Telegram D1 cost:', measured);
		expect(results.find((result) => result.jobName === 'telegram_outbox')).toMatchObject({
			status: 'succeeded',
		});
		expect(measured.rowsRead).toBeLessThanOrEqual(150);
		expect(measured.rowsWritten).toBeLessThanOrEqual(50);
		expect(
			await db.first<{ sent: number }>({
				sql: `SELECT COUNT(*) AS sent FROM telegram_outbox WHERE status = 'sent'`,
			})
		).toEqual({ sent: 3 });
		expect(
			await db.first<{ updated_at: string }>({
				sql: `SELECT updated_at FROM telegram_destination_policies
				WHERE destination_ref = 'bureau'`,
			})
		).toEqual({ updated_at: WARM_NOW });
	});

	it('bounds retry and unknown-delivery writes while preserving terminal state', async () => {
		const raw = new DatabaseBoundary(context.db);
		await new OutboxRepository(raw).prepareTelegramDispatch({
			now: WARM_NOW,
			maxAttempts: 3,
		});
		await raw.run(telegramRow('cost-retry'));

		const retryMeter = createMeteredD1(context.db);
		const retryProvider = new FakeTelegramProvider();
		retryProvider.failNext(new TelegramProviderError('TELEGRAM_TEMPORARY_FAILURE', true));
		const retryWorker = new TelegramOutboxWorker(
			new OutboxRepository(new DatabaseBoundary(retryMeter.database)),
			retryProvider,
			'-1001234567890',
			{ portalPublicOrigin: 'https://portal.example.test' },
			TELEGRAM_SCHEDULE,
			{ leaseSeconds: 30, retryBaseSeconds: 60, retryMaxSeconds: 300, maxAttempts: 3 },
			'cost-retry-worker',
			() => FAST_NOW
		);
		expect(await retryWorker.dispatchNext()).toBe('retry');
		const retry = retryMeter.snapshot();
		expect(retry.rowsRead).toBeLessThanOrEqual(50);
		expect(retry.rowsWritten).toBeLessThanOrEqual(40);

		await raw.run(telegramRow('cost-unknown', '2030-08-12T12:01:10.000Z'));
		const unknownNow = '2030-08-12T12:01:30.000Z';
		const unknownMeter = createMeteredD1(context.db);
		const unknownProvider = new FakeTelegramProvider();
		unknownProvider.failNext(
			new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, { delivery: 'unknown' })
		);
		const unknownWorker = new TelegramOutboxWorker(
			new OutboxRepository(new DatabaseBoundary(unknownMeter.database)),
			unknownProvider,
			'-1001234567890',
			{ portalPublicOrigin: 'https://portal.example.test' },
			TELEGRAM_SCHEDULE,
			{ leaseSeconds: 30, retryBaseSeconds: 60, retryMaxSeconds: 300, maxAttempts: 3 },
			'cost-unknown-worker',
			() => unknownNow
		);
		expect(await unknownWorker.dispatchNext()).toBe('delivery_unknown');
		const unknown = unknownMeter.snapshot();
		expect(unknown.rowsRead).toBeLessThanOrEqual(50);
		expect(unknown.rowsWritten).toBeLessThanOrEqual(40);
		expect(
			await raw.first<{ status: string }>({
				sql: `SELECT status FROM telegram_outbox WHERE id = 'cost-unknown'`,
			})
		).toEqual({ status: 'delivery_unknown' });
		console.info('Local Telegram failure-path D1 cost:', { retry, unknown });
	});

	it('serializes concurrent duplicate Cron deliveries without duplicate job writes', async () => {
		const meter = createMeteredD1(context.db);
		const config = runtime(meter.database, true);
		const input = { scheduledTime: FAST_SCHEDULED_AT, cron: '* * * * *' };
		const [first, second] = await Promise.all([
			runScheduledEvent(config, input, { clock: () => WARM_NOW }),
			runScheduledEvent(config, input, { clock: () => WARM_NOW }),
		]);
		const flattened = [...first, ...second];
		expect(flattened.filter((result) => result.status === 'deduplicated')).toHaveLength(2);
		expect(flattened.filter((result) => result.status === 'feature_disabled')).toHaveLength(2);
		expect(meter.snapshot().rowsWritten).toBeLessThanOrEqual(12);
		expect(
			await new DatabaseBoundary(context.db).first<{ count: number }>({
				sql: 'SELECT COUNT(*) AS count FROM scheduled_job_runs',
			})
		).toEqual({ count: 0 });
	});
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { DatabaseBoundary } from '$lib/server/db/database';
import {
	createOperationsHealthResponse,
	evaluateOperationsHealth,
	recordWorkerError,
} from '$lib/server/operations/monitoring';
import {
	OperationsRepository,
	type ScheduledCadence,
} from '$lib/server/operations/operations-repository';
import { createMeteredD1, createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const NOW = '2026-08-11T12:00:00.000Z';
const FAST_AT = '2026-08-11T11:58:30.000Z';
const MAINTENANCE_AT = '2026-08-11T11:45:00.000Z';

describe('preview operations monitoring', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
	});

	afterEach(async () => context.dispose());

	async function setCadence(input: {
		cadence: ScheduledCadence;
		startedAt: string;
		status?: 'running' | 'succeeded' | 'failed';
		failureTimestamps?: readonly string[];
	}) {
		const status = input.status ?? 'succeeded';
		await db.run({
			sql: `UPDATE scheduled_cadence_state
			SET status = ?, last_dedupe_key = ?, lease_owner = ?, lease_until = ?,
				fencing_token = fencing_token + 1, safe_result_json = '{}',
				recent_failure_timestamps_json = ?, started_at = ?, finished_at = ?,
				updated_at = ?
			WHERE cadence = ?`,
			params: [
				status,
				`fixture:${input.cadence}:${input.startedAt}`,
				status === 'running' ? 'fixture-owner' : null,
				status === 'running'
					? new Date(Date.parse(input.startedAt) + 300_000).toISOString()
					: null,
				JSON.stringify(input.failureTimestamps ?? []),
				input.startedAt,
				status === 'running' ? null : input.startedAt,
				input.startedAt,
				input.cadence,
			],
		});
	}

	async function seedFreshCadences() {
		await setCadence({ cadence: 'fast', startedAt: FAST_AT });
		await setCadence({ cadence: 'maintenance', startedAt: MAINTENANCE_AT });
	}

	it('accepts fresh terminal Cron cadence state including intentionally disabled jobs', async () => {
		await seedFreshCadences();
		await expect(evaluateOperationsHealth(context.db, NOW)).resolves.toEqual({
			healthy: true,
			issues: [],
			recentErrorCount: 0,
		});
	});

	it('keeps health and operator reads bounded with 20,000 retained historical runs', async () => {
		await seedFreshCadences();
		await db.run({
			sql: `WITH RECURSIVE history(n) AS (
				SELECT 1 UNION ALL SELECT n + 1 FROM history WHERE n < 20000
			)
			INSERT INTO scheduled_job_runs
				(id, job_name, trigger_kind, dedupe_key, status, started_at,
				 finished_at, created_at, updated_at)
			SELECT 'history-' || n, 'email_outbox', 'scheduled', 'history-' || n,
				'succeeded', '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z',
				'2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'
			FROM history`,
		});
		await db.run({
			sql: `INSERT INTO scheduled_job_runs
				(id, job_name, trigger_kind, dedupe_key, status, started_at,
				 finished_at, created_at, updated_at)
			VALUES ('manual-history', 'email_outbox', 'manual', 'manual-history',
				'succeeded', ?, ?, ?, ?)`,
			params: [FAST_AT, FAST_AT, FAST_AT, FAST_AT],
		});

		const meter = createMeteredD1(context.db);
		expect((await evaluateOperationsHealth(meter.database, NOW)).healthy).toBe(true);
		const health = meter.snapshot();
		expect(health.queries).toBe(2);
		expect(health.rowsRead).toBeLessThan(10);

		meter.reset();
		const recent = await new OperationsRepository(
			new DatabaseBoundary(meter.database)
		).listRecentRuns();
		const history = meter.snapshot();
		expect(recent).toHaveLength(1);
		expect(recent[0]?.trigger_kind).toBe('manual');
		expect(history.rowsRead).toBeLessThan(5);

		meter.reset();
		const snapshot = await new DatabaseBoundary(meter.database).all<{
			cadence_count: number;
			healthy_cadences: number;
			running_cadences: number;
			failed_cadences: number;
		}>({ sql: await readFile('scripts/sql/latest-job-status.sql', 'utf8') });
		const operator = meter.snapshot();
		expect(snapshot.results).toEqual([
			{
				cadence_count: 2,
				healthy_cadences: 2,
				running_cadences: 0,
				failed_cadences: 0,
			},
		]);
		expect(operator.rowsRead).toBeLessThan(10);
		console.info('Local accumulated-history D1 read cost:', { health, history, operator });
	});

	it('fails closed when either Cron cadence is missing or stale', async () => {
		await seedFreshCadences();
		await setCadence({ cadence: 'fast', startedAt: '2026-08-11T11:50:00.000Z' });
		expect((await evaluateOperationsHealth(context.db, NOW)).issues).toContain(
			'missed_fast_cron'
		);

		await db.run({
			sql: `UPDATE scheduled_cadence_state
			SET status = 'idle', last_dedupe_key = NULL, lease_owner = NULL,
				lease_until = NULL, safe_result_json = '{}',
				recent_failure_timestamps_json = '[]', started_at = NULL,
				finished_at = NULL, updated_at = ?
			WHERE cadence = 'maintenance'`,
			params: [NOW],
		});
		expect((await evaluateOperationsHealth(context.db, NOW)).issues).toContain(
			'missed_maintenance_cron'
		);
	});

	it('opens the signal after three recent application errors', async () => {
		await seedFreshCadences();
		await recordWorkerError(context.db, '2026-08-11T11:58:01.000Z');
		await recordWorkerError(context.db, '2026-08-11T11:58:20.000Z');
		expect((await evaluateOperationsHealth(context.db, NOW)).healthy).toBe(true);

		await recordWorkerError(context.db, '2026-08-11T11:59:01.000Z');
		const result = await evaluateOperationsHealth(context.db, NOW);
		expect(result).toMatchObject({ healthy: false, recentErrorCount: 3 });
		expect(result.issues).toContain('repeated_worker_errors');

		await recordWorkerError(context.db, '2026-08-11T11:40:00.000Z');
		expect((await evaluateOperationsHealth(context.db, NOW)).recentErrorCount).toBe(3);
	});

	it('saturates a minute error bucket without writes beyond the alert threshold', async () => {
		const minute = '2026-08-11T11:59:01.000Z';
		const meter = createMeteredD1(context.db);
		await recordWorkerError(meter.database, minute);
		await recordWorkerError(meter.database, minute);
		await recordWorkerError(meter.database, minute);
		const admitted = meter.snapshot();
		expect(admitted.rowsWritten).toBeLessThanOrEqual(4);
		meter.reset();
		await recordWorkerError(meter.database, minute);
		expect(meter.snapshot().rowsWritten).toBe(0);
		console.info('Local saturated Worker-error D1 cost:', {
			firstThreeErrors: admitted,
			additionalSameMinuteError: meter.snapshot(),
		});
		expect(
			await db.first<{ error_count: number }>({
				sql: `SELECT error_count FROM worker_error_buckets
				WHERE minute_bucket = '2026-08-11T11:59:00.000Z'`,
			})
		).toEqual({ error_count: 3 });
	});

	it('counts scheduled failures and stale cadence leases without exposing detail', async () => {
		await seedFreshCadences();
		await setCadence({
			cadence: 'fast',
			startedAt: '2026-08-11T11:59:00.000Z',
			status: 'failed',
			failureTimestamps: [
				'2026-08-11T11:57:00.000Z',
				'2026-08-11T11:58:00.000Z',
				'2026-08-11T11:59:00.000Z',
			],
		});
		await setCadence({
			cadence: 'maintenance',
			startedAt: '2026-08-11T11:40:00.000Z',
			status: 'running',
		});

		const result = await evaluateOperationsHealth(context.db, NOW);
		expect(result.issues).toEqual(
			expect.arrayContaining(['repeated_worker_errors', 'stale_job_run'])
		);
	});

	it('returns only 204/503 and performs no D1 read when the global stop is active', async () => {
		await seedFreshCadences();
		const healthy = await createOperationsHealthResponse({
			database: context.db,
			now: NOW,
			production: false,
			scheduledJobsEnabled: true,
		});
		expect(healthy.status).toBe(204);
		expect(await healthy.text()).toBe('');
		expect(healthy.headers.get('cache-control')).toBe('no-store');
		expect(healthy.headers.get('x-robots-tag')).toBe('noindex, nofollow');

		const meter = createMeteredD1(context.db);
		const disabled = await createOperationsHealthResponse({
			database: meter.database,
			now: NOW,
			production: false,
			scheduledJobsEnabled: false,
		});
		expect(disabled.status).toBe(503);
		expect(meter.snapshot()).toEqual({ queries: 0, rowsRead: 0, rowsWritten: 0 });

		const unavailable = await createOperationsHealthResponse({
			now: NOW,
			production: false,
		});
		expect(unavailable.status).toBe(503);
		expect(await unavailable.text()).toBe('');
	});

	it('removes only error buckets older than seven days during bounded cleanup', async () => {
		await recordWorkerError(context.db, '2026-08-03T11:59:00.000Z');
		await recordWorkerError(context.db, '2026-08-05T12:00:00.000Z');
		const result = await new OperationsRepository(db).cleanupSecurityMetadata(NOW, 10);
		expect(result.workerErrorBuckets).toBe(1);
		expect(
			await db.first<{ count: number }>({
				sql: 'SELECT COUNT(*) AS count FROM worker_error_buckets',
			})
		).toEqual({ count: 1 });
	});
});

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
	scheduledJobNames,
	type ScheduledJobName,
} from '$lib/server/operations/operations-repository';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const NOW = '2026-08-11T12:00:00.000Z';
const FAST_AT = '2026-08-11T11:58:30.000Z';
const MAINTENANCE_AT = '2026-08-11T11:45:00.000Z';
const FAST_JOBS = new Set<ScheduledJobName>(['email_outbox', 'telegram_outbox']);

describe('preview operations monitoring', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
	});

	afterEach(async () => context.dispose());

	async function insertRun(input: {
		jobName: ScheduledJobName;
		startedAt: string;
		status?: 'running' | 'succeeded' | 'failed' | 'feature_disabled' | 'skipped_locked';
		suffix?: string;
	}) {
		const status = input.status ?? 'succeeded';
		const suffix = input.suffix ?? 'current';
		await db.run({
			sql: `INSERT INTO scheduled_job_runs
				(id, job_name, trigger_kind, dedupe_key, status, lease_owner,
				 fencing_token, safe_result_json, error_code, started_at, finished_at,
				 created_at, updated_at)
			VALUES (?, ?, 'scheduled', ?, ?, NULL, NULL, '{}', ?, ?, ?, ?, ?)`,
			params: [
				`${input.jobName}-${suffix}`,
				input.jobName,
				`scheduled:${input.jobName}:${suffix}`,
				status,
				status === 'failed' ? 'SCHEDULED_JOB_FAILED' : null,
				input.startedAt,
				status === 'running' ? null : input.startedAt,
				input.startedAt,
				input.startedAt,
			],
		});
	}

	async function seedFreshRuns() {
		for (const jobName of scheduledJobNames) {
			await insertRun({
				jobName,
				startedAt: FAST_JOBS.has(jobName) ? FAST_AT : MAINTENANCE_AT,
				status: FAST_JOBS.has(jobName) ? 'feature_disabled' : 'succeeded',
			});
		}
	}

	it('accepts fresh terminal Cron runs including intentionally disabled providers', async () => {
		await seedFreshRuns();
		await expect(evaluateOperationsHealth(context.db, NOW)).resolves.toEqual({
			healthy: true,
			issues: [],
			recentErrorCount: 0,
		});
	});

	it('keeps health reads bounded when completed job history grows', async () => {
		await seedFreshRuns();
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
		let rowsRead = 0;
		let queries = 0;
		const measured = {
			prepare: context.db.prepare.bind(context.db),
			async batch<T>(statements: D1PreparedStatement[]) {
				const results = await context.db.batch<T>(statements);
				queries += results.length;
				rowsRead += results.reduce((sum, item) => sum + item.meta.rows_read, 0);
				return results;
			},
		} as D1Database;
		expect((await evaluateOperationsHealth(measured, NOW)).healthy).toBe(true);
		expect(queries).toBe(4);
		expect(rowsRead).toBeLessThan(100);
		const snapshot = await db.all({
			sql: await readFile('scripts/sql/latest-job-status.sql', 'utf8'),
		});
		expect(snapshot.results).toEqual([{ latest_jobs: 9, latest_jobs_healthy: 9 }]);
		expect(snapshot.meta.rows_read).toBeLessThan(100);
		console.info('Local D1 read cost:', {
			health: rowsRead,
			snapshot: snapshot.meta.rows_read,
		});
	});

	it('fails closed when either Cron cadence is missing or stale', async () => {
		await seedFreshRuns();
		await insertRun({
			jobName: 'email_outbox',
			startedAt: '2026-08-11T11:50:00.000Z',
			suffix: 'stale-latest-fixture',
		});
		await db.run({
			sql: `DELETE FROM scheduled_job_runs
				WHERE job_name = 'email_outbox' AND id <> 'email_outbox-stale-latest-fixture'`,
		});

		const result = await evaluateOperationsHealth(context.db, NOW);
		expect(result.healthy).toBe(false);
		expect(result.issues).toContain('missed_fast_cron');

		await db.run({ sql: `DELETE FROM scheduled_job_runs WHERE job_name = 'price_review'` });
		expect((await evaluateOperationsHealth(context.db, NOW)).issues).toContain(
			'missed_maintenance_cron'
		);
	});

	it('opens the signal after three recent application or scheduled errors', async () => {
		await seedFreshRuns();
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

	it('counts repeated scheduled failures and stale running leases without exposing detail', async () => {
		await seedFreshRuns();
		for (let index = 0; index < 3; index += 1) {
			await insertRun({
				jobName: 'email_outbox',
				startedAt: `2026-08-11T11:5${7 + index}:00.000Z`,
				status: 'failed',
				suffix: `failed-${index}`,
			});
		}
		await insertRun({
			jobName: 'price_review',
			startedAt: '2026-08-11T11:40:00.000Z',
			status: 'running',
			suffix: 'stale-running',
		});

		const result = await evaluateOperationsHealth(context.db, NOW);
		expect(result.issues).toEqual(
			expect.arrayContaining(['repeated_worker_errors', 'stale_job_run'])
		);
	});

	it('returns only 204/503 with no body and fails closed without D1', async () => {
		await seedFreshRuns();
		const healthy = await createOperationsHealthResponse({
			database: context.db,
			now: NOW,
			production: false,
		});
		expect(healthy.status).toBe(204);
		expect(await healthy.text()).toBe('');
		expect(healthy.headers.get('cache-control')).toBe('no-store');
		expect(healthy.headers.get('x-robots-tag')).toBe('noindex, nofollow');

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

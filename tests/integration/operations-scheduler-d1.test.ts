import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { runScheduledEvent, runScheduledJobs } from '$lib/server/operations/scheduler';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const FIXED_NOW = '2026-07-22T12:00:00.000Z';
const SCHEDULED_AT = Date.parse('2026-07-22T11:59:42.000Z');

describe('stage 13 operations scheduler in D1', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;
	let config: RuntimeConfig;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		await db.run({
			sql: `INSERT INTO users
				(id, email, email_normalized, password_hash, email_verified_at, role,
				 is_blocked, account_status, first_name, last_name,
				 first_name_normalized, last_name_normalized, family_assignment_status,
				 privacy_notice_version, privacy_accepted_at, session_version,
				 created_at, updated_at)
			VALUES ('scheduler-admin', 'scheduler-admin@example.test',
				'scheduler-admin@example.test', 'synthetic-not-used', ?, 'admin',
				0, 'active', 'Scheduler', 'Admin', 'scheduler', 'admin',
				'pending_verification', 'notice-v1', ?, 1, ?, ?)`,
			params: [FIXED_NOW, FIXED_NOW, FIXED_NOW, FIXED_NOW],
		});
		config = loadRuntimeConfig({
			APP_ENV: 'test',
			PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
			DB: context.db,
			SCHEDULED_JOBS_ENABLED: 'false',
		});
	});

	afterEach(async () => context.dispose());

	it('allowlists cron, records feature-disabled runs, and deduplicates one scheduled bucket', async () => {
		const options = { clock: () => FIXED_NOW };
		const first = await runScheduledEvent(
			config,
			{
				scheduledTime: SCHEDULED_AT,
				cron: '* * * * *',
			},
			options
		);
		expect(first.map(({ jobName, status }) => ({ jobName, status }))).toEqual([
			{ jobName: 'email_outbox', status: 'feature_disabled' },
			{ jobName: 'telegram_outbox', status: 'feature_disabled' },
		]);

		const repeated = await runScheduledEvent(
			config,
			{
				scheduledTime: SCHEDULED_AT,
				cron: '* * * * *',
			},
			options
		);
		expect(repeated).toEqual([
			{ jobName: 'email_outbox', status: 'deduplicated' },
			{ jobName: 'telegram_outbox', status: 'deduplicated' },
		]);

		await expect(
			runScheduledEvent(
				config,
				{
					scheduledTime: SCHEDULED_AT,
					cron: '0 * * * *',
				},
				options
			)
		).rejects.toThrow('UNKNOWN_CRON_SCHEDULE');

		const rows = await db.all<{
			job_name: string;
			status: string;
			dedupe_key: string;
			safe_result_json: string;
		}>({
			sql: `SELECT job_name, status, dedupe_key, safe_result_json
				FROM scheduled_job_runs ORDER BY job_name`,
		});
		expect(rows.results).toHaveLength(2);
		for (const row of rows.results) {
			expect(row.status).toBe('feature_disabled');
			expect(row.dedupe_key).toBe('scheduled:* * * * *:2026-07-22T11:59:00.000Z');
			expect(JSON.parse(row.safe_result_json)).toEqual({ reason: 'scheduled_jobs_disabled' });
		}
	});

	it('writes one audit before an idempotent manual run', async () => {
		const input = {
			triggerKind: 'manual' as const,
			dedupeKey: 'manual-command-operations-1',
			jobNames: ['email_outbox'] as const,
			now: FIXED_NOW,
			admin: { id: 'scheduler-admin', requestId: 'request-operations-1' },
		};

		const first = await runScheduledJobs(config, input);
		expect(first).toEqual([
			expect.objectContaining({
				jobName: 'email_outbox',
				status: 'feature_disabled',
			}),
		]);
		expect(await runScheduledJobs(config, input)).toEqual([
			{ jobName: 'email_outbox', status: 'deduplicated' },
		]);

		const run = await db.first<{
			trigger_kind: string;
			dedupe_key: string;
			status: string;
			safe_result_json: string;
		}>({
			sql: `SELECT trigger_kind, dedupe_key, status, safe_result_json
				FROM scheduled_job_runs WHERE job_name = 'email_outbox'`,
		});
		expect(run).toMatchObject({
			trigger_kind: 'manual',
			dedupe_key: 'manual:manual-command-operations-1',
			status: 'feature_disabled',
		});
		expect(JSON.parse(run!.safe_result_json)).toEqual({ reason: 'provider_disabled' });

		const audits = await db.all<{
			actor_user_id: string;
			request_id: string;
			safe_diff_json: string;
		}>({
			sql: `SELECT actor_user_id, request_id, safe_diff_json FROM audit_events
				WHERE action = 'operations.job_manual_run'`,
		});
		expect(audits.results).toHaveLength(1);
		expect(audits.results[0]).toMatchObject({
			actor_user_id: 'scheduler-admin',
			request_id: 'request-operations-1',
		});
		expect(JSON.parse(audits.results[0]!.safe_diff_json)).toEqual({ jobName: 'email_outbox' });
	});

	it('records every maintenance job as feature-disabled without executing it', async () => {
		const results = await runScheduledEvent(
			config,
			{ scheduledTime: SCHEDULED_AT, cron: '*/15 * * * *' },
			{ clock: () => FIXED_NOW }
		);
		expect(results).toHaveLength(7);
		expect(results.every((result) => result.status === 'feature_disabled')).toBe(true);
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM scheduled_job_runs
					WHERE status = 'feature_disabled'`,
			})
		).toEqual({ count: 7 });
	});

	it('isolates a failed manual audit and leaves no run stuck in running', async () => {
		const results = await runScheduledJobs(config, {
			triggerKind: 'manual',
			dedupeKey: 'manual-invalid-admin',
			jobNames: ['email_outbox', 'telegram_outbox'],
			now: FIXED_NOW,
			admin: { id: 'missing-admin', requestId: 'request-invalid-admin' },
		});
		expect(results).toEqual([
			expect.objectContaining({ jobName: 'email_outbox', status: 'failed',
				errorCode: 'SCHEDULED_JOB_FAILED' }),
			expect.objectContaining({ jobName: 'telegram_outbox', status: 'failed',
				errorCode: 'SCHEDULED_JOB_FAILED' }),
		]);
		expect(
			await db.first<{ running: number; failed: number }>({
				sql: `SELECT
					SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
					SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
				FROM scheduled_job_runs`,
			})
		).toEqual({ running: 0, failed: 2 });
	});

	it('skips one busy lease while continuing the other job', async () => {
		await db.run({
			sql: `INSERT INTO operation_locks
				(id, scope, resource_key, lease_owner, lease_until, fencing_token,
				 created_at, updated_at)
			VALUES ('scheduler-busy-email', 'scheduled-job', 'email_outbox',
				'existing-worker', '2026-07-22T12:10:00.000Z', 1, ?, ?)`,
			params: [FIXED_NOW, FIXED_NOW],
		});
		const results = await runScheduledJobs(config, {
			triggerKind: 'scheduled',
			dedupeKey: 'busy-lease-bucket',
			jobNames: ['email_outbox', 'telegram_outbox'],
			now: FIXED_NOW,
		});
		expect(results).toEqual([
			expect.objectContaining({ jobName: 'email_outbox', status: 'skipped_locked' }),
			expect.objectContaining({ jobName: 'telegram_outbox', status: 'feature_disabled' }),
		]);
	});
});

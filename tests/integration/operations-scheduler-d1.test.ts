import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { runScheduledEvent, runScheduledJobs } from '$lib/server/operations/scheduler';
import { OutboxRepository } from '$lib/server/outbox/outbox-repository';
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

	it('reconciles a stale Telegram dispatch and raises an alert while sends are disabled', async () => {
		const outbox = new OutboxRepository(db);
		const startedAt = '2026-07-22T11:58:00.000Z';
		await db.run({
			sql: `INSERT INTO telegram_outbox
				(id, source_kind, source_id, template_or_category, destination_ref,
				 locale, payload_json, dedupe_key, not_before, status, attempts,
				 max_attempts, created_at, updated_at)
			VALUES ('scheduler-telegram-unknown', 'fixture', 'scheduler-source',
				'bureau.support', 'bureau', 'de', '{}', 'scheduler-telegram-unknown',
				?, 'pending', 0, 3, ?, ?)`,
			params: [startedAt, startedAt, startedAt],
		});
		expect(await outbox.claimTelegram({
			now: startedAt, leaseOwner: 'crashed-worker',
			leaseUntil: '2026-07-22T11:59:00.000Z',
		})).toMatchObject({ id: 'scheduler-telegram-unknown' });
		expect(await outbox.startTelegramDispatch({
			id: 'scheduler-telegram-unknown', leaseOwner: 'crashed-worker',
			deliveryReference: 'TG-ABCDEF123456', now: startedAt,
		})).toEqual({ attemptId: expect.any(String) });

		const reconcileConfig = loadRuntimeConfig({
			APP_ENV: 'test',
			PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
			DB: context.db,
			SCHEDULED_JOBS_ENABLED: 'true',
		});
		const result = await runScheduledJobs(reconcileConfig, {
			triggerKind: 'scheduled',
			dedupeKey: 'disabled-provider-unknown-reconciliation',
			jobNames: ['telegram_outbox'],
			now: FIXED_NOW,
		});
		expect(result).toEqual([
			expect.objectContaining({
				jobName: 'telegram_outbox', status: 'failed',
				errorCode: 'TELEGRAM_DELIVERY_UNKNOWN',
			}),
		]);
		expect(await db.first<{ status: string; last_error_code: string }>({
			sql: `SELECT status, last_error_code FROM telegram_outbox
				WHERE id = 'scheduler-telegram-unknown'`,
		})).toEqual({
			status: 'delivery_unknown', last_error_code: 'TELEGRAM_DELIVERY_UNKNOWN',
		});
		const run = await db.first<{ safe_result_json: string }>({
			sql: `SELECT safe_result_json FROM scheduled_job_runs
				WHERE job_name = 'telegram_outbox'`,
		});
		expect(JSON.parse(run!.safe_result_json)).toMatchObject({
			reason: 'provider_disabled', deliveryUnknown: 1,
			reconciledDeliveryUnknown: 1, unresolvedDeliveryUnknown: 1, terminalDead: 0,
		});
		const repeated = await runScheduledJobs(reconcileConfig, {
			triggerKind: 'scheduled',
			dedupeKey: 'disabled-provider-unknown-still-open',
			jobNames: ['telegram_outbox'],
			now: '2026-07-22T12:01:00.000Z',
		});
		expect(repeated).toEqual([
			expect.objectContaining({
				jobName: 'telegram_outbox', status: 'failed',
				errorCode: 'TELEGRAM_DELIVERY_UNKNOWN',
			}),
		]);
		const latest = await db.first<{ safe_result_json: string }>({
			sql: `SELECT safe_result_json FROM scheduled_job_runs
				WHERE dedupe_key = 'scheduled:disabled-provider-unknown-still-open'`,
		});
		expect(JSON.parse(latest!.safe_result_json)).toMatchObject({
			deliveryUnknown: 1, reconciledDeliveryUnknown: 0,
			unresolvedDeliveryUnknown: 1, terminalDead: 0,
		});
	});

	it('keeps a terminal Telegram failure alerting while sends are disabled', async () => {
		const outbox = new OutboxRepository(db);
		const startedAt = '2026-07-22T11:59:00.000Z';
		await db.run({
			sql: `INSERT INTO telegram_outbox
				(id, source_kind, source_id, template_or_category, destination_ref,
				 locale, payload_json, dedupe_key, not_before, status, attempts,
				 max_attempts, created_at, updated_at)
			VALUES ('scheduler-telegram-dead', 'fixture', 'scheduler-dead-source',
				'bureau.support', 'bureau', 'de', '{}', 'scheduler-telegram-dead', ?,
				'pending', 0, 3, ?, ?)`,
			params: [startedAt, startedAt, startedAt],
		});
		expect(await outbox.claimTelegram({
			now: startedAt, leaseOwner: 'scheduler-dead-worker',
			leaseUntil: '2026-07-22T11:59:30.000Z',
		})).toMatchObject({ id: 'scheduler-telegram-dead' });
		expect(await outbox.markTelegramFailed({
			id: 'scheduler-telegram-dead', leaseOwner: 'scheduler-dead-worker',
			errorCode: 'TELEGRAM_REQUEST_REJECTED', permanent: true,
			nextAttemptAt: '2026-07-22T12:00:01.000Z',
			now: '2026-07-22T11:59:01.000Z',
		})).toBe('dead');
		const deadConfig = loadRuntimeConfig({
			APP_ENV: 'test', PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
			DB: context.db, SCHEDULED_JOBS_ENABLED: 'true',
		});
		const result = await runScheduledJobs(deadConfig, {
			triggerKind: 'scheduled', dedupeKey: 'disabled-provider-dead-backlog',
			jobNames: ['telegram_outbox'], now: FIXED_NOW,
		});
		expect(result).toEqual([
			expect.objectContaining({
				jobName: 'telegram_outbox', status: 'failed',
				errorCode: 'TELEGRAM_OUTBOX_DEAD',
			}),
		]);
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

import { DatabaseBoundary } from '$lib/server/db/database';

export const scheduledJobNames = [
	'email_outbox',
	'telegram_outbox',
	'price_review',
	'document_quarantine',
	'funding_authorization_expiry',
	'email_reservation_cleanup',
	'privacy_r2_cleanup',
	'security_metadata_cleanup',
	'storage_orphan_cleanup',
] as const;

export type ScheduledJobName = (typeof scheduledJobNames)[number];
export type JobTriggerKind = 'scheduled' | 'manual';
export type JobTerminalStatus = 'succeeded' | 'failed' | 'feature_disabled' | 'skipped_locked';

export interface ScheduledJobRunSummary {
	id: string;
	job_name: ScheduledJobName;
	trigger_kind: JobTriggerKind;
	status: 'running' | JobTerminalStatus;
	safe_result_json: string;
	error_code: string | null;
	started_at: string;
	finished_at: string | null;
}

function assertLimit(limit: number): void {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
		throw new TypeError('Operations batch limit must be between 1 and 100.');
	}
}

export class OperationsRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async startRun(input: {
		id: string;
		jobName: ScheduledJobName;
		triggerKind: JobTriggerKind;
		dedupeKey: string;
		leaseOwner: string | null;
		fencingToken: number | null;
		now: string;
	}): Promise<boolean> {
		const result = await this.db.run({
			sql: `INSERT OR IGNORE INTO scheduled_job_runs
				(id, job_name, trigger_kind, dedupe_key, status, lease_owner, fencing_token,
				 safe_result_json, error_code, started_at, finished_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, 'running', ?, ?, '{}', NULL, ?, NULL, ?, ?)`,
			params: [input.id, input.jobName, input.triggerKind, input.dedupeKey,
				input.leaseOwner, input.fencingToken, input.now, input.now, input.now],
		});
		return (result.meta.changes ?? 0) === 1;
	}

	async recordSkippedLock(input: {
		id: string;
		jobName: ScheduledJobName;
		triggerKind: JobTriggerKind;
		dedupeKey: string;
		now: string;
	}): Promise<boolean> {
		const result = await this.db.run({
			sql: `INSERT OR IGNORE INTO scheduled_job_runs
				(id, job_name, trigger_kind, dedupe_key, status, lease_owner, fencing_token,
				 safe_result_json, error_code, started_at, finished_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, 'skipped_locked', NULL, NULL,
				'{"reason":"lease_busy"}', NULL, ?, ?, ?, ?)`,
			params: [input.id, input.jobName, input.triggerKind, input.dedupeKey,
				input.now, input.now, input.now, input.now],
		});
		return (result.meta.changes ?? 0) === 1;
	}

	async finishRun(input: {
		id: string;
		status: Exclude<JobTerminalStatus, 'skipped_locked'>;
		safeResult: Readonly<Record<string, number | string | boolean | null>>;
		errorCode?: string;
		now: string;
	}): Promise<boolean> {
		const result = await this.db.run({
			sql: `UPDATE scheduled_job_runs
			SET status = ?, safe_result_json = ?, error_code = ?, finished_at = ?, updated_at = ?
			WHERE id = ? AND status = 'running'`,
			params: [input.status, JSON.stringify(input.safeResult), input.errorCode ?? null,
				input.now, input.now, input.id],
		});
		return (result.meta.changes ?? 0) === 1;
	}

	async recordManualAudit(input: {
		adminUserId: string;
		jobName: ScheduledJobName;
		runId: string;
		requestId: string;
		now: string;
	}): Promise<void> {
		const result = await this.db.run({
			sql: `INSERT INTO audit_events
				(id, actor_user_id, actor_kind, action, target_kind, target_id,
				 request_id, safe_diff_json, created_at)
			SELECT ?, ?, 'user', 'operations.job_manual_run', 'scheduled_job_run', ?, ?,
				json_object('jobName', ?), ?
			WHERE EXISTS (SELECT 1 FROM users admin WHERE admin.id = ?
				AND admin.role = 'admin' AND admin.account_status = 'active' AND admin.is_blocked = 0)
				AND EXISTS (SELECT 1 FROM scheduled_job_runs WHERE id = ?)`,
			params: [crypto.randomUUID(), input.adminUserId, input.runId, input.requestId,
				input.jobName, input.now, input.adminUserId, input.runId],
		});
		if ((result.meta.changes ?? 0) !== 1) {
			throw new Error('MANUAL_JOB_AUDIT_REJECTED');
		}
	}

	async listRecentRuns(limit = 50): Promise<ScheduledJobRunSummary[]> {
		assertLimit(limit);
		const rows = await this.db.all<ScheduledJobRunSummary>({
			sql: `SELECT id, job_name, trigger_kind, status, safe_result_json, error_code,
				started_at, finished_at
			FROM scheduled_job_runs ORDER BY started_at DESC, id DESC LIMIT ?`,
			params: [limit],
		});
		return rows.results;
	}

	async cleanupSecurityMetadata(now: string, limit: number): Promise<{
		contractActions: number;
		contractAcceptances: number;
		priceActions: number;
		priceAcceptances: number;
		rateLimitBuckets: number;
		workerErrorBuckets: number;
	}> {
		assertLimit(limit);
		const workerErrorRetentionCutoff = new Date(
			Date.parse(now) - 7 * 24 * 60 * 60 * 1_000
		).toISOString();
		const results = await this.db.batch([
			{
				sql: `UPDATE contract_parent_actions SET ip_retention_value = NULL
				WHERE id IN (SELECT id FROM contract_parent_actions
					WHERE ip_retention_value IS NOT NULL AND ip_expires_at <= ?
					ORDER BY ip_expires_at, id LIMIT ?)`,
				params: [now, limit],
			},
			{
				sql: `UPDATE contract_acceptances SET ip_retention_value = NULL
				WHERE id IN (SELECT id FROM contract_acceptances
					WHERE ip_retention_value IS NOT NULL AND ip_expires_at <= ?
					ORDER BY ip_expires_at, id LIMIT ?)`,
				params: [now, limit],
			},
			{
				sql: `UPDATE price_review_parent_actions SET ip_retention_value = NULL
				WHERE id IN (SELECT id FROM price_review_parent_actions
					WHERE ip_retention_value IS NOT NULL AND ip_expires_at <= ?
					ORDER BY ip_expires_at, id LIMIT ?)`,
				params: [now, limit],
			},
			{
				sql: `UPDATE price_change_acceptances SET ip_retention_value = NULL
				WHERE id IN (SELECT id FROM price_change_acceptances
					WHERE ip_retention_value IS NOT NULL AND ip_expires_at <= ?
					ORDER BY ip_expires_at, id LIMIT ?)`,
				params: [now, limit],
			},
			{
				sql: `DELETE FROM rate_limit_buckets WHERE id IN (
					SELECT id FROM rate_limit_buckets WHERE expires_at <= ?
					ORDER BY expires_at, id LIMIT ?)`,
				params: [now, limit],
			},
			{
				sql: `DELETE FROM worker_error_buckets WHERE minute_bucket IN (
					SELECT minute_bucket FROM worker_error_buckets
					WHERE updated_at < ? ORDER BY updated_at, minute_bucket LIMIT ?)`,
				params: [workerErrorRetentionCutoff, limit],
			},
		]);
		return {
			contractActions: results[0]?.meta.changes ?? 0,
			contractAcceptances: results[1]?.meta.changes ?? 0,
			priceActions: results[2]?.meta.changes ?? 0,
			priceAcceptances: results[3]?.meta.changes ?? 0,
			rateLimitBuckets: results[4]?.meta.changes ?? 0,
			workerErrorBuckets: results[5]?.meta.changes ?? 0,
		};
	}
}

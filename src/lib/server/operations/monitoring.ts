import { DatabaseBoundary } from '$lib/server/db/database';
import { scheduledJobNames, type ScheduledJobName } from './operations-repository';
import { withSecurityHeaders } from '$lib/server/security/response-headers';

const FAST_JOBS: ReadonlySet<ScheduledJobName> = new Set([
	'email_outbox',
	'telegram_outbox',
]);

export const operationsMonitoringThresholds = {
	fastJobMaxAgeSeconds: 180,
	maintenanceJobMaxAgeSeconds: 1_200,
	repeatedErrorWindowSeconds: 900,
	repeatedErrorCount: 3,
	staleRunningMaxAgeSeconds: 360,
} as const;

export type OperationsHealthIssue =
	| 'missed_fast_cron'
	| 'missed_maintenance_cron'
	| 'repeated_worker_errors'
	| 'stale_job_run';

export interface OperationsHealthResult {
	healthy: boolean;
	issues: readonly OperationsHealthIssue[];
	recentErrorCount: number;
}

interface MonitoringQueryRow {
	job_name?: string;
	latest_started_at?: string;
	count?: number;
}

function instant(value: string): number {
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) throw new TypeError('Monitoring time must be valid.');
	return parsed;
}

function before(value: string, seconds: number): string {
	return new Date(instant(value) - seconds * 1_000).toISOString();
}

function minuteBucket(value: string): string {
	const parsed = new Date(instant(value));
	parsed.setUTCSeconds(0, 0);
	return parsed.toISOString();
}

export async function recordWorkerError(database: D1Database, now: string): Promise<void> {
	const bucket = minuteBucket(now);
	await new DatabaseBoundary(database).run({
		sql: `INSERT INTO worker_error_buckets
			(minute_bucket, error_count, created_at, updated_at)
		VALUES (?, 1, ?, ?)
		ON CONFLICT(minute_bucket) DO UPDATE SET
			error_count = error_count + 1,
			updated_at = excluded.updated_at`,
		params: [bucket, now, now],
	});
}

export async function evaluateOperationsHealth(
	database: D1Database,
	now: string
): Promise<OperationsHealthResult> {
	const nowMs = instant(now);
	const thresholds = operationsMonitoringThresholds;
	const db = new DatabaseBoundary(database);
	const [freshness, scheduledErrors, workerErrors, staleRuns] =
		await db.batch<MonitoringQueryRow>([
			{
				sql: `SELECT job_name, MAX(started_at) AS latest_started_at
					FROM scheduled_job_runs
					WHERE trigger_kind = 'scheduled'
					GROUP BY job_name`,
			},
			{
				sql: `SELECT COUNT(*) AS count FROM scheduled_job_runs
					WHERE trigger_kind = 'scheduled'
						AND status IN ('failed', 'skipped_locked')
						AND started_at >= ?`,
				params: [before(now, thresholds.repeatedErrorWindowSeconds)],
			},
			{
				sql: `SELECT COALESCE(SUM(error_count), 0) AS count
					FROM worker_error_buckets WHERE minute_bucket >= ?`,
				params: [before(now, thresholds.repeatedErrorWindowSeconds)],
			},
			{
				sql: `SELECT COUNT(*) AS count FROM scheduled_job_runs
					WHERE status = 'running' AND started_at < ?`,
				params: [before(now, thresholds.staleRunningMaxAgeSeconds)],
			},
		]);

	const latestByJob = new Map<string, string>();
	for (const row of freshness?.results ?? []) {
		if (row.job_name && row.latest_started_at) {
			latestByJob.set(row.job_name, row.latest_started_at);
		}
	}

	let missedFastCron = false;
	let missedMaintenanceCron = false;
	for (const jobName of scheduledJobNames) {
		const latest = latestByJob.get(jobName);
		const latestMs = latest === undefined ? Number.NaN : Date.parse(latest);
		const maximumAgeSeconds = FAST_JOBS.has(jobName)
			? thresholds.fastJobMaxAgeSeconds
			: thresholds.maintenanceJobMaxAgeSeconds;
		const fresh =
			Number.isFinite(latestMs) &&
			latestMs <= nowMs + 60_000 &&
			latestMs >= nowMs - maximumAgeSeconds * 1_000;
		if (!fresh && FAST_JOBS.has(jobName)) missedFastCron = true;
		if (!fresh && !FAST_JOBS.has(jobName)) missedMaintenanceCron = true;
	}

	const recentErrorCount =
		Number(scheduledErrors?.results[0]?.count ?? 0) +
		Number(workerErrors?.results[0]?.count ?? 0);
	const issues: OperationsHealthIssue[] = [];
	if (missedFastCron) issues.push('missed_fast_cron');
	if (missedMaintenanceCron) issues.push('missed_maintenance_cron');
	if (recentErrorCount >= thresholds.repeatedErrorCount) {
		issues.push('repeated_worker_errors');
	}
	if (Number(staleRuns?.results[0]?.count ?? 0) > 0) issues.push('stale_job_run');

	return { healthy: issues.length === 0, issues, recentErrorCount };
}

export async function createOperationsHealthResponse(input: {
	database?: D1Database;
	now: string;
	production: boolean;
}): Promise<Response> {
	let healthy = false;
	try {
		healthy = input.database
			? (await evaluateOperationsHealth(input.database, input.now)).healthy
			: false;
	} catch {
		healthy = false;
	}

	const response = new Response(null, {
		status: healthy ? 204 : 503,
		headers: {
			'cache-control': 'no-store',
			'x-robots-tag': 'noindex, nofollow',
		},
	});
	return withSecurityHeaders(response, { production: input.production, noStore: true });
}

import { DatabaseBoundary } from '$lib/server/db/database';
import { withSecurityHeaders } from '$lib/server/security/response-headers';

export const operationsMonitoringThresholds = {
	fastJobMaxAgeSeconds: 180,
	maintenanceJobMaxAgeSeconds: 1_200,
	repeatedErrorWindowSeconds: 900,
	repeatedErrorCount: 3,
	staleRunningMaxAgeSeconds: 360,
} as const;

export type OperationsHealthIssue =
	'missed_fast_cron' | 'missed_maintenance_cron' | 'repeated_worker_errors' | 'stale_job_run';

export interface OperationsHealthResult {
	healthy: boolean;
	issues: readonly OperationsHealthIssue[];
	recentErrorCount: number;
}

interface MonitoringQueryRow {
	cadence?: 'fast' | 'maintenance';
	status?: 'idle' | 'running' | 'succeeded' | 'failed';
	started_at?: string | null;
	recent_failure_timestamps_json?: string;
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
			error_count = MIN(worker_error_buckets.error_count + 1, ?),
			updated_at = excluded.updated_at
		WHERE worker_error_buckets.error_count < ?`,
		params: [
			bucket,
			now,
			now,
			operationsMonitoringThresholds.repeatedErrorCount,
			operationsMonitoringThresholds.repeatedErrorCount,
		],
	});
}

export async function evaluateOperationsHealth(
	database: D1Database,
	now: string
): Promise<OperationsHealthResult> {
	const nowMs = instant(now);
	const thresholds = operationsMonitoringThresholds;
	const db = new DatabaseBoundary(database);
	const [cadences, workerErrors] = await db.batch<MonitoringQueryRow>([
		{
			sql: `SELECT cadence, status, started_at, recent_failure_timestamps_json
					FROM scheduled_cadence_state ORDER BY cadence`,
		},
		{
			sql: `SELECT COALESCE(SUM(error_count), 0) AS count
					FROM worker_error_buckets WHERE minute_bucket >= ?`,
			params: [before(now, thresholds.repeatedErrorWindowSeconds)],
		},
	]);

	const cadenceByName = new Map(
		(cadences?.results ?? [])
			.filter((row) => row.cadence !== undefined)
			.map((row) => [row.cadence!, row] as const)
	);
	const fresh = (cadence: 'fast' | 'maintenance', maximumAgeSeconds: number) => {
		const latest = cadenceByName.get(cadence)?.started_at;
		const latestMs = latest ? Date.parse(latest) : Number.NaN;
		return (
			Number.isFinite(latestMs) &&
			latestMs <= nowMs + 60_000 &&
			latestMs >= nowMs - maximumAgeSeconds * 1_000
		);
	};
	let scheduledErrorCount = 0;
	let staleRunning = false;
	const errorCutoff = nowMs - thresholds.repeatedErrorWindowSeconds * 1_000;
	const staleCutoff = nowMs - thresholds.staleRunningMaxAgeSeconds * 1_000;
	for (const row of cadenceByName.values()) {
		if (row.recent_failure_timestamps_json) {
			const parsed = JSON.parse(row.recent_failure_timestamps_json) as unknown;
			if (Array.isArray(parsed)) {
				scheduledErrorCount += parsed.filter((value) => {
					const timestamp = typeof value === 'string' ? Date.parse(value) : Number.NaN;
					return (
						Number.isFinite(timestamp) &&
						timestamp >= errorCutoff &&
						timestamp <= nowMs + 60_000
					);
				}).length;
			}
		}
		const startedAt = row.started_at ? Date.parse(row.started_at) : Number.NaN;
		if (row.status === 'running' && Number.isFinite(startedAt) && startedAt < staleCutoff) {
			staleRunning = true;
		}
	}

	const recentErrorCount = scheduledErrorCount + Number(workerErrors?.results[0]?.count ?? 0);
	const issues: OperationsHealthIssue[] = [];
	if (!fresh('fast', thresholds.fastJobMaxAgeSeconds)) issues.push('missed_fast_cron');
	if (!fresh('maintenance', thresholds.maintenanceJobMaxAgeSeconds)) {
		issues.push('missed_maintenance_cron');
	}
	if (recentErrorCount >= thresholds.repeatedErrorCount) {
		issues.push('repeated_worker_errors');
	}
	if (staleRunning) issues.push('stale_job_run');

	return { healthy: issues.length === 0, issues, recentErrorCount };
}

export async function createOperationsHealthResponse(input: {
	database?: D1Database;
	now: string;
	production: boolean;
	scheduledJobsEnabled?: boolean;
}): Promise<Response> {
	let healthy = false;
	try {
		healthy =
			input.scheduledJobsEnabled === false
				? false
				: input.database
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

import type { RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { FoundationRepository } from '$lib/server/db/foundation-repository';
import { AuthRepository } from '$lib/server/auth/auth-repository';
import { createOutboxRuntime } from '$lib/server/outbox/runtime';
import type { DispatchOutcome } from '$lib/server/outbox/outbox-worker';
import { createPriceReviewRuntime } from '$lib/server/price-reviews/runtime';
import { createRequestRuntime } from '$lib/server/requests/runtime';
import { createPrivacyRuntime } from '$lib/server/privacy/runtime';
import {
	OperationsRepository,
	type JobTriggerKind,
	type ScheduledCadence,
	type ScheduledJobName,
} from './operations-repository';
import { operationsMonitoringThresholds } from './monitoring';
import { StorageIntentRepository } from './storage-intents';

export interface ScheduledJobResult {
	jobName: ScheduledJobName;
	status: 'succeeded' | 'failed' | 'feature_disabled' | 'skipped_locked' | 'deduplicated';
	runId?: string;
	errorCode?: string;
}

export interface RunJobsInput {
	triggerKind: JobTriggerKind;
	dedupeKey: string;
	jobNames: readonly ScheduledJobName[];
	/** Fixed instant for deterministic tests. Production callers leave this unset. */
	now?: string;
	admin?: { id: string; requestId: string };
}

export interface SchedulerOptions {
	clock?: () => string;
}

const FAST_JOBS: readonly ScheduledJobName[] = ['email_outbox', 'telegram_outbox'];
const MAINTENANCE_JOBS: readonly ScheduledJobName[] = [
	'price_review',
	'document_quarantine',
	'funding_authorization_expiry',
	'email_reservation_cleanup',
	'privacy_r2_cleanup',
	'security_metadata_cleanup',
	'storage_orphan_cleanup',
];
const SCHEDULED_FAILURE_WINDOW_SECONDS = operationsMonitoringThresholds.repeatedErrorWindowSeconds;
// At the configured cadences at most 37 per-job failures fit in 15 minutes.
const MAX_RETAINED_FAILURE_TIMESTAMPS = 64;

function safeErrorCode(error: unknown): string {
	const candidate =
		typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
	return typeof candidate === 'string' && /^[A-Z0-9_]{1,80}$/u.test(candidate)
		? candidate
		: 'SCHEDULED_JOB_FAILED';
}

function minuteBucket(value: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.valueOf())) throw new TypeError('Scheduled time must be valid.');
	parsed.setUTCSeconds(0, 0);
	return parsed.toISOString();
}

const systemClock = () => new Date().toISOString();

type JobExecution = {
	disabled: boolean;
	result: Record<string, number | string | boolean | null>;
	errorCode?: string;
};

function inertJobResult(config: RuntimeConfig, jobName: ScheduledJobName): JobExecution | null {
	if (jobName === 'email_outbox' && config.messaging.emailProvider === 'disabled') {
		return { disabled: true, result: { reason: 'provider_disabled' } };
	}
	if (
		(jobName === 'document_quarantine' ||
			jobName === 'privacy_r2_cleanup' ||
			jobName === 'storage_orphan_cleanup') &&
		(!config.r2QuarantineBucket || !config.r2ArchiveBucket)
	) {
		return { disabled: true, result: { reason: 'storage_binding_unavailable' } };
	}
	return null;
}

function scheduledCadenceForJobs(jobNames: readonly ScheduledJobName[]): ScheduledCadence {
	const matches = (expected: readonly ScheduledJobName[]) =>
		jobNames.length === expected.length &&
		jobNames.every((jobName, index) => jobName === expected[index]);
	if (matches(FAST_JOBS)) return 'fast';
	if (matches(MAINTENANCE_JOBS)) return 'maintenance';
	throw new Error('SCHEDULED_CADENCE_JOB_SET_INVALID');
}

export const TELEGRAM_DRAIN_STOP_OUTCOMES: readonly DispatchOutcome[] = [
	'delivery_unknown',
	'retry',
	'dead',
];

export async function drainOutbox(
	dispatch: (now: string) => Promise<DispatchOutcome>,
	limit: number,
	clock: () => string = systemClock,
	stopAfter: readonly DispatchOutcome[] = []
): Promise<Record<string, number>> {
	const counts: Record<string, number> = {
		claimed: 0,
		sent: 0,
		retry: 0,
		dead: 0,
		deliveryUnknown: 0,
		deferred: 0,
		lostLease: 0,
	};
	for (let index = 0; index < limit; index += 1) {
		// Provider calls may take longer than a row lease. Read the clock immediately
		// before every claim so later rows never inherit the batch's stale timestamp.
		const outcome = await dispatch(clock());
		if (outcome === 'empty') break;
		counts.claimed += 1;
		if (outcome === 'lost_lease') counts.lostLease += 1;
		else if (outcome === 'delivery_unknown') counts.deliveryUnknown += 1;
		else counts[outcome] = (counts[outcome] ?? 0) + 1;
		if (stopAfter.includes(outcome)) break;
	}
	return counts;
}

async function executeJob(
	config: RuntimeConfig,
	jobName: ScheduledJobName,
	now: string,
	clock: () => string
): Promise<JobExecution> {
	const inert = inertJobResult(config, jobName);
	if (inert) return inert;
	const limit = config.operations.maintenanceBatchLimit;
	switch (jobName) {
		case 'email_outbox': {
			const worker = createOutboxRuntime(config).emailWorker;
			await worker.prepareDrain(now, config.operations.outboxBatchLimit);
			const result = await drainOutbox(
				(value) => worker.dispatchNext(value),
				config.operations.outboxBatchLimit,
				clock
			);
			return {
				disabled: false,
				result,
				...(result.dead > 0 ? { errorCode: 'EMAIL_OUTBOX_DEAD' } : {}),
			};
		}
		case 'telegram_outbox': {
			const runtime = createOutboxRuntime(config);
			// Reconciliation is a D1-only safety action. It must keep running while
			// provider dispatch is disabled, otherwise a crash after send can leave a
			// stale `processing` row invisible to both operators and alerts forever.
			const worker = runtime.telegramWorker;
			const reconciledDeliveryUnknown =
				config.messaging.telegramProvider === 'disabled'
					? await runtime.repository.reconcileStaleTelegramDispatches(
							now,
							config.operations.outboxBatchLimit
						)
					: await worker.prepareDrain(now, config.operations.outboxBatchLimit);
			const unresolvedDeliveryUnknown =
				await runtime.repository.countUnresolvedTelegramDeliveries();
			const terminalDead = await runtime.repository.countTerminalTelegramFailures();
			if (config.messaging.telegramProvider === 'disabled') {
				return unresolvedDeliveryUnknown > 0 || terminalDead > 0
					? {
							disabled: false,
							result: {
								reason: 'provider_disabled',
								deliveryUnknown: unresolvedDeliveryUnknown,
								reconciledDeliveryUnknown,
								unresolvedDeliveryUnknown,
								terminalDead,
							},
							errorCode:
								unresolvedDeliveryUnknown > 0
									? 'TELEGRAM_DELIVERY_UNKNOWN'
									: 'TELEGRAM_OUTBOX_DEAD',
						}
					: { disabled: true, result: { reason: 'provider_disabled' } };
			}
			if (unresolvedDeliveryUnknown > 0) {
				return {
					disabled: false,
					result: {
						reason: 'delivery_unknown_open',
						claimed: 0,
						sent: 0,
						retry: 0,
						dead: 0,
						deliveryUnknown: reconciledDeliveryUnknown,
						deferred: 0,
						lostLease: 0,
						reconciledDeliveryUnknown,
						unresolvedDeliveryUnknown,
						terminalDead,
					},
					errorCode: 'TELEGRAM_DELIVERY_UNKNOWN',
				};
			}
			// There is one Telegram destination (`bureau`). A terminal failure therefore
			// blocks the whole provider lane until an operator performs an audited retry
			// or cancellation. Continuing on the next cron would repeatedly call a
			// potentially invalid token/chat after permanent provider or contract drift.
			if (terminalDead > 0) {
				return {
					disabled: false,
					result: {
						reason: 'terminal_dead_open',
						claimed: 0,
						sent: 0,
						retry: 0,
						dead: 0,
						deliveryUnknown: reconciledDeliveryUnknown,
						deferred: 0,
						lostLease: 0,
						reconciledDeliveryUnknown,
						unresolvedDeliveryUnknown,
						terminalDead,
					},
					errorCode: 'TELEGRAM_OUTBOX_DEAD',
				};
			}
			const result = await drainOutbox(
				(value) => worker.dispatchNext(value),
				config.operations.outboxBatchLimit,
				clock,
				TELEGRAM_DRAIN_STOP_OUTCOMES
			);
			result.deliveryUnknown += reconciledDeliveryUnknown;
			result.reconciledDeliveryUnknown = reconciledDeliveryUnknown;
			result.unresolvedDeliveryUnknown =
				result.claimed > 0
					? await runtime.repository.countUnresolvedTelegramDeliveries()
					: unresolvedDeliveryUnknown;
			result.terminalDead =
				result.claimed > 0
					? await runtime.repository.countTerminalTelegramFailures()
					: terminalDead;
			return {
				disabled: false,
				result,
				...(result.deliveryUnknown > 0 || result.unresolvedDeliveryUnknown > 0
					? { errorCode: 'TELEGRAM_DELIVERY_UNKNOWN' }
					: result.dead > 0 || result.terminalDead > 0
						? { errorCode: 'TELEGRAM_OUTBOX_DEAD' }
						: {}),
			};
		}
		case 'price_review':
			return {
				disabled: false,
				result: await createPriceReviewRuntime(config).service.runScheduledMaintenance(
					now,
					limit
				),
			};
		case 'document_quarantine': {
			return {
				disabled: false,
				result: await createRequestRuntime(config).documentService.cleanupExpired(
					now,
					limit
				),
			};
		}
		case 'funding_authorization_expiry':
			return {
				disabled: false,
				result: await createRequestRuntime(
					config
				).adminService.processExpiredAuthorizations(now, limit),
			};
		case 'email_reservation_cleanup':
			return {
				disabled: false,
				result: {
					cleaned: await new AuthRepository(
						new DatabaseBoundary(config.db)
					).cleanupExpiredEmailReservations(now, limit),
				},
			};
		case 'privacy_r2_cleanup': {
			return {
				disabled: false,
				result: await createPrivacyRuntime(config).service.cleanupExpiredExports(limit),
			};
		}
		case 'security_metadata_cleanup':
			return {
				disabled: false,
				result: await new OperationsRepository(
					new DatabaseBoundary(config.db)
				).cleanupSecurityMetadata(now, limit),
			};
		case 'storage_orphan_cleanup': {
			const archiveBucket = config.r2ArchiveBucket;
			const quarantineBucket = config.r2QuarantineBucket;
			if (!archiveBucket || !quarantineBucket) {
				throw new Error('STORAGE_BINDING_INVARIANT');
			}
			const repository = new StorageIntentRepository(new DatabaseBoundary(config.db));
			const owner = `storage-cleanup:${crypto.randomUUID()}`;
			const reconciled = await repository.reconcileLinked(now, limit);
			const claimed = await repository.claimCleanup({
				now,
				stagedBefore: new Date(Date.parse(now) - 15 * 60_000).toISOString(),
				leaseOwner: owner,
				leaseUntil: new Date(
					Date.parse(now) + config.operations.leaseSeconds * 1000
				).toISOString(),
				limit,
			});
			let deleted = 0;
			let failed = 0;
			for (const intent of claimed) {
				try {
					const bucket =
						intent.storage_class === 'archive' ? archiveBucket : quarantineBucket;
					await bucket.delete(intent.object_key);
					if (await repository.completeDelete(intent.id, intent.generation, owner, now)) {
						deleted += 1;
					}
				} catch {
					await repository
						.failDelete(intent.id, intent.generation, owner, now)
						.catch(() => undefined);
					failed += 1;
				}
			}
			return {
				disabled: false,
				result: { reconciled, claimed: claimed.length, deleted, failed },
			};
		}
	}
}

export async function runScheduledJobs(
	config: RuntimeConfig,
	input: RunJobsInput,
	options: SchedulerOptions = {}
): Promise<ScheduledJobResult[]> {
	if (input.triggerKind === 'manual' && !input.admin) {
		throw new Error('MANUAL_JOB_ADMIN_REQUIRED');
	}
	const fixedNow = input.now;
	const clock = fixedNow === undefined ? (options.clock ?? systemClock) : () => fixedNow;
	if (input.triggerKind === 'scheduled') {
		return runScheduledCadenceJobs(config, input, clock);
	}
	return runManualJobs(config, input, clock);
}

async function runScheduledCadenceJobs(
	config: RuntimeConfig,
	input: RunJobsInput,
	clock: () => string
): Promise<ScheduledJobResult[]> {
	const cadence = scheduledCadenceForJobs(input.jobNames);
	// A global stop is intentionally before every D1 operation. Health reads the
	// same flag and fails closed without manufacturing a false heartbeat.
	if (!config.operations.scheduledJobsEnabled) {
		return input.jobNames.map((jobName) => ({ jobName, status: 'feature_disabled' }));
	}

	const db = new DatabaseBoundary(config.db);
	const foundation = new FoundationRepository(db);
	const operations = new OperationsRepository(db);
	const startedAt = clock();
	const owner = `scheduled-cadence:${cadence}:${crypto.randomUUID()}`;
	const dedupeKey = `scheduled:${input.dedupeKey}`;
	const cadenceLease = await operations.tryStartScheduledCadence({
		cadence,
		dedupeKey,
		leaseOwner: owner,
		now: startedAt,
		leaseUntil: new Date(
			Date.parse(startedAt) + config.operations.leaseSeconds * 1_000
		).toISOString(),
	});
	if (!cadenceLease.acquired) {
		const current = await operations.getScheduledCadence(cadence);
		const status = current.last_dedupe_key === dedupeKey ? 'deduplicated' : 'skipped_locked';
		return input.jobNames.map((jobName) => ({ jobName, status }));
	}

	const results: ScheduledJobResult[] = [];
	const safeJobs: Record<string, unknown> = {};

	for (const jobName of input.jobNames) {
		const inert = inertJobResult(config, jobName);
		if (inert) {
			results.push({ jobName, status: 'feature_disabled' });
			safeJobs[jobName] = { status: 'feature_disabled', result: inert.result };
			continue;
		}
		const jobNow = clock();
		const jobOwner = `scheduled-job:${jobName}:${crypto.randomUUID()}`;
		let lease: Awaited<ReturnType<FoundationRepository['tryAcquireLease']>>;
		try {
			lease = await foundation.tryAcquireLease({
				scope: 'scheduled-job',
				resourceKey: jobName,
				owner: jobOwner,
				now: jobNow,
				leaseUntil: new Date(
					Date.parse(jobNow) + config.operations.leaseSeconds * 1_000
				).toISOString(),
			});
		} catch (error) {
			const errorCode = safeErrorCode(error);
			results.push({ jobName, status: 'failed', errorCode });
			safeJobs[jobName] = { status: 'failed', errorCode };
			continue;
		}
		if (!lease.acquired) {
			results.push({ jobName, status: 'skipped_locked' });
			safeJobs[jobName] = { status: 'skipped_locked' };
			continue;
		}

		try {
			const execution = await executeJob(config, jobName, jobNow, clock);
			const status = execution.disabled
				? 'feature_disabled'
				: execution.errorCode
					? 'failed'
					: 'succeeded';
			results.push({
				jobName,
				status,
				...(execution.errorCode ? { errorCode: execution.errorCode } : {}),
			});
			safeJobs[jobName] = {
				status,
				result: execution.result,
				...(execution.errorCode ? { errorCode: execution.errorCode } : {}),
			};
		} catch (error) {
			const errorCode = safeErrorCode(error);
			results.push({ jobName, status: 'failed', errorCode });
			safeJobs[jobName] = { status: 'failed', errorCode };
		} finally {
			await foundation
				.releaseLease({
					scope: 'scheduled-job',
					resourceKey: jobName,
					owner: jobOwner,
					fencingToken: lease.fencingToken,
					now: clock(),
				})
				.catch(() => undefined);
		}
	}

	const completedAt = clock();
	const failureCount = results.filter(
		(result) => result.status === 'failed' || result.status === 'skipped_locked'
	).length;
	const failureCutoff = Date.parse(completedAt) - SCHEDULED_FAILURE_WINDOW_SECONDS * 1_000;
	const recentFailureTimestamps = cadenceLease.recentFailureTimestamps
		.filter((value) => {
			const timestamp = Date.parse(value);
			return Number.isFinite(timestamp) && timestamp >= failureCutoff;
		})
		.concat(Array.from({ length: failureCount }, () => completedAt))
		.slice(-MAX_RETAINED_FAILURE_TIMESTAMPS);
	const status = failureCount > 0 ? 'failed' : 'succeeded';
	const finished = await operations.finishScheduledCadence({
		cadence,
		dedupeKey,
		leaseOwner: owner,
		fencingToken: cadenceLease.fencingToken,
		status,
		safeResult: {
			jobCount: results.length,
			succeeded: results.filter((result) => result.status === 'succeeded').length,
			featureDisabled: results.filter((result) => result.status === 'feature_disabled')
				.length,
			failed: results.filter((result) => result.status === 'failed').length,
			skippedLocked: results.filter((result) => result.status === 'skipped_locked').length,
			jobs: safeJobs,
		},
		recentFailureTimestamps,
		now: completedAt,
	});
	if (!finished) throw new Error('SCHEDULED_CADENCE_FENCE_LOST');
	return results;
}

async function runManualJobs(
	config: RuntimeConfig,
	input: RunJobsInput,
	clock: () => string
): Promise<ScheduledJobResult[]> {
	const db = new DatabaseBoundary(config.db);
	const foundation = new FoundationRepository(db);
	const operations = new OperationsRepository(db);
	const results: ScheduledJobResult[] = [];

	for (const jobName of input.jobNames) {
		const jobNow = clock();
		const runId = crypto.randomUUID();
		const owner = `scheduled-job:${jobName}:${crypto.randomUUID()}`;
		const dedupeKey = `${input.triggerKind}:${input.dedupeKey}`;
		let lease: Awaited<ReturnType<FoundationRepository['tryAcquireLease']>>;
		try {
			lease = await foundation.tryAcquireLease({
				scope: 'scheduled-job',
				resourceKey: jobName,
				owner,
				now: jobNow,
				leaseUntil: new Date(
					Date.parse(jobNow) + config.operations.leaseSeconds * 1000
				).toISOString(),
			});
		} catch (error) {
			results.push({ jobName, status: 'failed', errorCode: safeErrorCode(error) });
			continue;
		}
		if (!lease.acquired) {
			try {
				await operations.recordSkippedLock({
					id: runId,
					jobName,
					triggerKind: input.triggerKind,
					dedupeKey,
					now: jobNow,
				});
				results.push({ jobName, status: 'skipped_locked', runId });
			} catch (error) {
				results.push({ jobName, status: 'failed', errorCode: safeErrorCode(error) });
			}
			continue;
		}
		let started = false;
		try {
			started = await operations.startRun({
				id: runId,
				jobName,
				triggerKind: input.triggerKind,
				dedupeKey,
				leaseOwner: owner,
				fencingToken: lease.fencingToken,
				now: jobNow,
			});
			if (!started) {
				results.push({ jobName, status: 'deduplicated' });
				continue;
			}
			if (input.triggerKind === 'manual' && input.admin) {
				await operations.recordManualAudit({
					adminUserId: input.admin.id,
					jobName,
					runId,
					requestId: input.admin.requestId,
					now: jobNow,
				});
			}
			const execution = await executeJob(config, jobName, jobNow, clock);
			const status = execution.disabled
				? 'feature_disabled'
				: execution.errorCode
					? 'failed'
					: 'succeeded';
			await operations.finishRun({
				id: runId,
				status,
				safeResult: execution.result,
				...(execution.errorCode ? { errorCode: execution.errorCode } : {}),
				now: clock(),
			});
			results.push({
				jobName,
				status,
				runId,
				...(execution.errorCode ? { errorCode: execution.errorCode } : {}),
			});
		} catch (error) {
			const errorCode = safeErrorCode(error);
			if (started) {
				await operations
					.finishRun({
						id: runId,
						status: 'failed',
						safeResult: {},
						errorCode,
						now: clock(),
					})
					.catch(() => undefined);
			}
			results.push({
				jobName,
				status: 'failed',
				runId: started ? runId : undefined,
				errorCode,
			});
		} finally {
			await foundation
				.releaseLease({
					scope: 'scheduled-job',
					resourceKey: jobName,
					owner,
					fencingToken: lease.fencingToken,
					now: clock(),
				})
				.catch(() => undefined);
		}
	}
	return results;
}

export async function runScheduledEvent(
	config: RuntimeConfig,
	input: { scheduledTime: number; cron: string },
	options: SchedulerOptions = {}
): Promise<ScheduledJobResult[]> {
	const scheduledAt = new Date(input.scheduledTime).toISOString();
	const jobNames = scheduledJobNamesForCron(input.cron);
	if (!jobNames) throw new Error('UNKNOWN_CRON_SCHEDULE');
	return runScheduledJobs(
		config,
		{
			triggerKind: 'scheduled',
			dedupeKey: `${input.cron}:${minuteBucket(scheduledAt)}`,
			jobNames,
		},
		options
	);
}

export function scheduledJobNamesForCron(cron: string): readonly ScheduledJobName[] | null {
	if (cron === '* * * * *') return FAST_JOBS;
	if (cron === '*/15 * * * *') return MAINTENANCE_JOBS;
	return null;
}

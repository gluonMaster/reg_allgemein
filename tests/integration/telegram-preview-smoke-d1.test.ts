import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	DatabaseBoundary,
	type SqlDatabaseBoundary,
	type StatementSpec,
} from '$lib/server/db/database';
import { OutboxRepository } from '$lib/server/outbox/outbox-repository';
import {
	FakeTelegramProvider,
	TelegramProviderError,
	type ProviderSendContext,
	type TelegramMessage,
	type TelegramProvider,
} from '$lib/server/outbox/providers';
import {
	expectedTelegramPreviewSmokeConfirmation,
	abortTelegramPreviewSmoke,
	parseTelegramPreviewSmokeArguments,
	prepareTelegramPreviewSmoke,
	reconcileTelegramPreviewSmoke,
	runTelegramPreviewSmoke,
	TELEGRAM_SMOKE_TARGET_CONFIRMATION,
	verifyTelegramPreviewSmoke,
} from '../../scripts/telegram-preview-smoke';
import {
	telegramBotIdHmacSha256,
	telegramChatIdHmacSha256,
	telegramPreviewDeploymentEvidenceSha256,
	verifyTelegramPreviewTarget,
} from '../../scripts/telegram-preview-target';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const now = '2026-08-13T10:00:00.000Z';
const runNow = '2026-08-13T10:05:00.000Z';
const chatId = '-1001234567890';
const token = `123456:${'A'.repeat(30)}`;
const bindingKey = 'preview-binding-key-'.padEnd(48, 'K');
const binding = {
	appEnvironment: 'preview' as const,
	workerName: 'kolibri-registration-preview',
	accountId: 'a'.repeat(32),
	databaseName: 'kolibri-registration-preview',
	databaseId: '11111111-1111-4111-8111-111111111111',
	portalPublicOrigin: 'https://preview.portal.example.test',
	authPublicEnabled: false as const,
	contractSendEnabled: false as const,
	scheduledJobsEnabled: false as const,
	emailProvider: 'disabled' as const,
	telegramProvider: 'bot_api' as const,
	telegramChatType: 'channel' as const,
	telegramBotApiTimeoutMs: 10_000,
	telegramMaxAttempts: 5,
	outboxLeaseSeconds: 60,
	outboxRetryBaseSeconds: 60,
	outboxRetryMaxSeconds: 3_600,
	telegramBusinessTimezone: 'Europe/Berlin',
	telegramBusinessHours: 'Mo-Fr 09:00-17:00',
	telegramActivationAt: '2026-08-13T09:00:00.000Z',
};
const deploymentEvidence = {
	schemaVersion: 1 as const,
	purpose: 'telegram-preview-deployment-observation' as const,
	accountId: binding.accountId,
	workerName: binding.workerName,
	workerVersionId: '2'.repeat(32),
	candidateGitCommitSha: '1'.repeat(40),
	observedAt: '2026-08-13T07:30:00.000Z',
	observedBy: 'independent-deploy-observer',
};
const target = verifyTelegramPreviewTarget({
	config: {
		name: binding.workerName,
		account_id: binding.accountId,
		vars: {
			APP_ENV: 'preview',
			PORTAL_PUBLIC_ORIGIN: binding.portalPublicOrigin,
			AUTH_PUBLIC_ENABLED: 'false',
			CONTRACT_SEND_ENABLED: 'false',
			SCHEDULED_JOBS_ENABLED: 'false',
			EMAIL_PROVIDER: 'disabled',
			TELEGRAM_PROVIDER: 'bot_api',
			TELEGRAM_CHAT_TYPE: binding.telegramChatType,
			TELEGRAM_BOT_API_TIMEOUT_MS: String(binding.telegramBotApiTimeoutMs),
			TELEGRAM_MAX_ATTEMPTS: String(binding.telegramMaxAttempts),
			OUTBOX_LEASE_SECONDS: String(binding.outboxLeaseSeconds),
			OUTBOX_RETRY_BASE_SECONDS: String(binding.outboxRetryBaseSeconds),
			OUTBOX_RETRY_MAX_SECONDS: String(binding.outboxRetryMaxSeconds),
			TELEGRAM_BUSINESS_TIMEZONE: binding.telegramBusinessTimezone,
			TELEGRAM_BUSINESS_HOURS: binding.telegramBusinessHours,
			TELEGRAM_ACTIVATION_AT: binding.telegramActivationAt,
		},
		d1_databases: [
			{
				binding: 'DB',
				database_name: binding.databaseName,
				database_id: binding.databaseId,
			},
		],
	},
	manifest: {
		schemaVersion: 1,
		purpose: 'telegram-preview-smoke',
		binding,
		chatIdHmacSha256: telegramChatIdHmacSha256(chatId, bindingKey),
		botIdHmacSha256: telegramBotIdHmacSha256(token, bindingKey),
		candidateGitCommitSha: '1'.repeat(40),
		deployedWorkerVersionId: '2'.repeat(32),
		deploymentEvidenceSha256: telegramPreviewDeploymentEvidenceSha256(deploymentEvidence),
		reviewedAt: '2026-08-13T08:00:00.000Z',
		reviewedBy: 'preview-operator',
	},
});

function confirmation(
	command: 'prepare' | 'run' | 'abort' | 'reconcile',
	cohortId: string
): string {
	return expectedTelegramPreviewSmokeConfirmation({
		command,
		targetFingerprint: target.fingerprintSha256,
		cohortId,
	});
}

function deterministicUuid(namespace: string): string {
	const bytes = Buffer.from(
		createHash('sha256').update(namespace, 'utf8').digest().subarray(0, 16)
	);
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const value = bytes.toString('hex');
	return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

const successfulPreflight = async () => ({
	botIdentityVerified: true as const,
	destinationVerified: true as const,
	postingPermissionVerified: true as const,
	webhookDisabled: true as const,
	chatType: 'channel' as const,
});

class AmbiguousTelegramProvider implements TelegramProvider {
	calls = 0;

	async send(
		_message: TelegramMessage,
		_context?: ProviderSendContext
	): Promise<{ providerRequestId: string }> {
		this.calls += 1;
		throw new TelegramProviderError('TELEGRAM_BOT_API_DELIVERY_UNKNOWN', false, {
			delivery: 'unknown',
		});
	}
}

class CrashAfterDispatchStartedBoundary implements SqlDatabaseBoundary {
	private crashed = false;

	constructor(private readonly inner: SqlDatabaseBoundary) {}

	async run<T = Record<string, unknown>>(statement: StatementSpec): Promise<D1Result<T>> {
		const result = await this.inner.run<T>(statement);
		if (!this.crashed && statement.sql.includes('INSERT INTO telegram_delivery_attempts')) {
			this.crashed = true;
			throw new Error('synthetic process crash after durable dispatch_started');
		}
		return result;
	}

	first<T = Record<string, unknown>>(statement: StatementSpec): Promise<T | null> {
		return this.inner.first<T>(statement);
	}

	all<T = Record<string, unknown>>(statement: StatementSpec): Promise<D1Result<T>> {
		return this.inner.all<T>(statement);
	}

	batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]> {
		return this.inner.batch<T>(statements);
	}
}

describe('target-bound preview Telegram normal-outbox smoke', () => {
	let context: TestD1Context;
	let database: DatabaseBoundary;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		database = new DatabaseBoundary(context.db);
	});

	afterEach(async () => {
		await context.dispose();
	});

	it('requires explicit target, remote phase, cohort and exact confirmations', () => {
		expect(
			parseTelegramPreviewSmokeArguments([
				'target',
				'--environment',
				'preview',
				'--config',
				'wrangler.preview.toml',
				'--target-manifest',
				'imports/telegram-preview-target.json',
				'--deployment-evidence',
				'imports/telegram-preview-deployment-evidence.json',
				'--confirmation',
				TELEGRAM_SMOKE_TARGET_CONFIRMATION,
			])
		).toMatchObject({ command: 'target', remote: false });
		expect(
			parseTelegramPreviewSmokeArguments([
				'reconcile',
				'--remote',
				'--environment',
				'preview',
				'--config',
				'wrangler.preview.toml',
				'--target-manifest',
				'imports/telegram-preview-target.json',
				'--deployment-evidence',
				'imports/telegram-preview-deployment-evidence.json',
				'--cohort',
				'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
				'--confirmation',
				confirmation('reconcile', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
			])
		).toMatchObject({ command: 'reconcile', remote: true });
		expect(() =>
			parseTelegramPreviewSmokeArguments([
				'run',
				'--environment',
				'preview',
				'--config',
				'wrangler.preview.toml',
				'--target-manifest',
				'imports/telegram-preview-target.json',
				'--deployment-evidence',
				'imports/telegram-preview-deployment-evidence.json',
				'--cohort',
				'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
				'--confirmation',
				'wrong',
			])
		).toThrowError(/Telegram preview smoke failed/u);
		expect(() =>
			parseTelegramPreviewSmokeArguments([
				'run',
				'--remote',
				'--environment',
				'production',
				'--config',
				'wrangler.preview.toml',
				'--target-manifest',
				'imports/telegram-preview-target.json',
				'--deployment-evidence',
				'imports/telegram-preview-deployment-evidence.json',
				'--cohort',
				'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
				'--confirmation',
				'wrong',
			])
		).toThrowError(/Telegram preview smoke failed/u);
	});

	it('prepares one PII-free max-one-attempt row and sends it once through the normal worker', async () => {
		const cohortId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
		const prepared = await prepareTelegramPreviewSmoke({
			database,
			target,
			cohortId,
			now,
			confirmation: confirmation('prepare', cohortId),
		});
		expect(prepared).toMatchObject({
			state: 'prepared',
			attemptCount: 0,
			duplicateCount: 0,
			providerRequestIdPresent: false,
		});
		const stored = await database.first<{
			payload_json: string;
			max_attempts: number;
			status: string;
		}>({
			sql: 'SELECT payload_json, max_attempts, status FROM telegram_outbox WHERE id = ?',
			params: [prepared.outboxId!],
		});
		expect(stored).toMatchObject({ max_attempts: 1, status: 'pending' });
		expect(JSON.parse(stored!.payload_json)).toEqual({
			category: 'technical',
			reference: cohortId,
			receivedAt: now,
			adminPath: `/admin/messages/${cohortId}`,
		});

		const provider = new FakeTelegramProvider();
		const genericClaim = await new OutboxRepository(database).claimTelegram({
			now,
			leaseOwner: 'ordinary-preview-cron',
			leaseUntil: '2026-08-13T10:01:00.000Z',
			activationAt: binding.telegramActivationAt,
		});
		expect(genericClaim).toBeNull();
		const attempts = await Promise.allSettled([
			runTelegramPreviewSmoke({
				database,
				provider,
				chatId,
				target,
				cohortId,
				confirmation: confirmation('run', cohortId),
				preflight: successfulPreflight,
				clock: () => runNow,
			}),
			runTelegramPreviewSmoke({
				database,
				provider,
				chatId,
				target,
				cohortId,
				confirmation: confirmation('run', cohortId),
				preflight: successfulPreflight,
				clock: () => runNow,
			}),
		]);
		const fulfilled = attempts.filter(
			(
				result
			): result is PromiseFulfilledResult<
				Awaited<ReturnType<typeof runTelegramPreviewSmoke>>
			> => result.status === 'fulfilled'
		);
		const rejected = attempts.filter(
			(result): result is PromiseRejectedResult => result.status === 'rejected'
		);
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		const sent = fulfilled[0].value;
		expect(sent).toMatchObject({
			state: 'sent',
			attemptCount: 1,
			duplicateCount: 0,
			providerRequestIdPresent: true,
			preflightVerified: true,
		});
		expect(sent.providerRequestIdSha256).toMatch(/^[0-9a-f]{64}$/u);
		expect(sent.deliveryReference).toMatch(/^TG-[0-9A-F]{12}$/u);
		expect(provider.messages).toHaveLength(1);
		expect(provider.messages[0].text).toContain(cohortId);
		expect(provider.messages[0].text).not.toContain(chatId);
		expect(
			await database.first<{
				authorizations: number;
				assertions: number;
				provider_send_disabled: number;
			}>({
				sql: `SELECT
				(SELECT COUNT(*) FROM telegram_preview_smoke_claim_authorizations
				 WHERE outbox_id = ?) AS authorizations,
				(SELECT COUNT(*) FROM telegram_preview_smoke_claim_assertions
				 WHERE outbox_id = ?) AS assertions,
				(SELECT provider_send_disabled
				 FROM telegram_preview_smoke_claim_authorizations
				 WHERE outbox_id = ?) AS provider_send_disabled`,
				params: [sent.outboxId!, sent.outboxId!, sent.outboxId!],
			})
		).toEqual({ authorizations: 1, assertions: 1, provider_send_disabled: 1 });
		await expect(
			runTelegramPreviewSmoke({
				database,
				provider,
				chatId,
				target,
				cohortId,
				confirmation: confirmation('run', cohortId),
				preflight: successfulPreflight,
				clock: () => runNow,
			})
		).rejects.toMatchObject({ code: 'TELEGRAM_SMOKE_NOT_PREPARED' });
		expect(provider.messages).toHaveLength(1);
	});

	it('quarantines an ambiguous provider result and never retries it', async () => {
		const cohortId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
		await prepareTelegramPreviewSmoke({
			database,
			target,
			cohortId,
			now,
			confirmation: confirmation('prepare', cohortId),
		});
		const provider = new AmbiguousTelegramProvider();
		const unknown = await runTelegramPreviewSmoke({
			database,
			provider,
			chatId,
			target,
			cohortId,
			confirmation: confirmation('run', cohortId),
			preflight: successfulPreflight,
			clock: () => runNow,
		});
		expect(unknown).toMatchObject({
			state: 'delivery_unknown',
			attemptCount: 1,
			duplicateCount: 0,
			providerRequestIdPresent: false,
			requiresManualResolution: true,
		});
		expect(provider.calls).toBe(1);
		expect(await verifyTelegramPreviewSmoke({ database, target, cohortId })).toMatchObject({
			state: 'delivery_unknown',
			attemptCount: 1,
			requiresManualResolution: true,
		});
		await expect(
			runTelegramPreviewSmoke({
				database,
				provider,
				chatId,
				target,
				cohortId,
				confirmation: confirmation('run', cohortId),
				preflight: successfulPreflight,
				clock: () => runNow,
			})
		).rejects.toMatchObject({ code: 'TELEGRAM_SMOKE_NOT_PREPARED' });
		await expect(
			abortTelegramPreviewSmoke({
				database,
				target,
				cohortId,
				now: '2026-08-13T10:06:00.000Z',
				confirmation: confirmation('abort', cohortId),
			})
		).rejects.toMatchObject({ code: 'TELEGRAM_SMOKE_ABORT_NOT_ALLOWED' });
		expect(provider.calls).toBe(1);
	});

	it('reconciles an expired crash after dispatch_started without a send or retry', async () => {
		const cohortId = '15151515-1515-4151-8151-151515151515';
		const prepared = await prepareTelegramPreviewSmoke({
			database,
			target,
			cohortId,
			now,
			confirmation: confirmation('prepare', cohortId),
		});
		const provider = new FakeTelegramProvider();
		await expect(
			runTelegramPreviewSmoke({
				database: new CrashAfterDispatchStartedBoundary(database),
				provider,
				chatId,
				target,
				cohortId,
				confirmation: confirmation('run', cohortId),
				preflight: successfulPreflight,
				clock: () => runNow,
			})
		).rejects.toThrow('synthetic process crash after durable dispatch_started');
		expect(provider.messages).toHaveLength(0);
		expect(
			await database.first<{ status: string; attempt_state: string; attempts: number }>({
				sql: `SELECT outbox.status, outbox.attempts, attempt.state AS attempt_state
				FROM telegram_outbox outbox
				JOIN telegram_delivery_attempts attempt ON attempt.outbox_id = outbox.id
				WHERE outbox.id = ?`,
				params: [prepared.outboxId!],
			})
		).toEqual({ status: 'processing', attempt_state: 'dispatch_started', attempts: 0 });
		await expect(
			reconcileTelegramPreviewSmoke({
				database,
				target,
				cohortId,
				now: '2026-08-13T10:05:59.999Z',
				confirmation: confirmation('reconcile', cohortId),
			})
		).rejects.toMatchObject({ code: 'TELEGRAM_SMOKE_RECONCILE_LEASE_ACTIVE' });

		const unknown = await reconcileTelegramPreviewSmoke({
			database,
			target,
			cohortId,
			now: '2026-08-13T10:06:00.000Z',
			confirmation: confirmation('reconcile', cohortId),
		});
		expect(unknown).toMatchObject({
			state: 'delivery_unknown',
			attemptCount: 1,
			providerRequestIdPresent: false,
			requiresManualResolution: true,
		});
		expect(provider.messages).toHaveLength(0);
		await expect(
			reconcileTelegramPreviewSmoke({
				database,
				target,
				cohortId,
				now: '2026-08-13T10:07:00.000Z',
				confirmation: confirmation('reconcile', cohortId),
			})
		).resolves.toMatchObject({ state: 'delivery_unknown', attemptCount: 1 });
		await expect(
			runTelegramPreviewSmoke({
				database,
				provider,
				chatId,
				target,
				cohortId,
				confirmation: confirmation('run', cohortId),
				preflight: successfulPreflight,
				clock: () => '2026-08-13T10:07:00.000Z',
			})
		).rejects.toMatchObject({ code: 'TELEGRAM_SMOKE_NOT_PREPARED' });
		expect(provider.messages).toHaveLength(0);
	});

	it('aborts a prepared row without a provider call and releases the next cohort', async () => {
		const cohortId = '12121212-1212-4121-8121-121212121212';
		const prepared = await prepareTelegramPreviewSmoke({
			database,
			target,
			cohortId,
			now,
			confirmation: confirmation('prepare', cohortId),
		});
		const aborted = await abortTelegramPreviewSmoke({
			database,
			target,
			cohortId,
			now: runNow,
			confirmation: confirmation('abort', cohortId),
		});
		expect(aborted).toMatchObject({
			state: 'cancelled',
			outboxId: prepared.outboxId,
			attemptCount: 0,
			providerRequestIdPresent: false,
		});
		expect(
			await database.first<{
				status: string;
				attempts: number;
				abort_authorizations: number;
				abort_assertions: number;
			}>({
				sql: `SELECT outbox.status, outbox.attempts,
				(SELECT COUNT(*) FROM telegram_preview_smoke_abort_authorizations
				 WHERE outbox_id = outbox.id) AS abort_authorizations,
				(SELECT COUNT(*) FROM telegram_preview_smoke_abort_assertions
				 WHERE outbox_id = outbox.id) AS abort_assertions
			FROM telegram_outbox outbox WHERE outbox.id = ?`,
				params: [prepared.outboxId!],
			})
		).toEqual({
			status: 'cancelled',
			attempts: 0,
			abort_authorizations: 1,
			abort_assertions: 1,
		});

		const nextCohortId = '13131313-1313-4131-8131-131313131313';
		await expect(
			prepareTelegramPreviewSmoke({
				database,
				target,
				cohortId: nextCohortId,
				now: '2026-08-13T10:06:00.000Z',
				confirmation: confirmation('prepare', nextCohortId),
			})
		).resolves.toMatchObject({ state: 'prepared' });
	});

	it('keeps a partial smoke claim out of stale cron and aborts it only before dispatch', async () => {
		const cohortId = '14141414-1414-4141-8141-141414141414';
		const prepared = await prepareTelegramPreviewSmoke({
			database,
			target,
			cohortId,
			now,
			confirmation: confirmation('prepare', cohortId),
		});
		const lockedAt = runNow;
		const leaseUntil = '2026-08-13T10:06:00.000Z';
		const leaseOwner = `telegram-preview-smoke:${cohortId}`;
		const dedupeKey = `telegram-preview-smoke:${target.fingerprintSha256}:${cohortId}`;
		const authorizationId = deterministicUuid(
			`telegram-preview-smoke-claim-auth-v1\0${prepared.outboxId!}\0${leaseOwner}`
		);
		const requestHash = createHash('sha256')
			.update(
				JSON.stringify({
					outboxId: prepared.outboxId!,
					sourceId: cohortId,
					dedupeKey,
					targetFingerprint: target.fingerprintSha256,
					activationAt: binding.telegramActivationAt,
					leaseOwner,
					lockedAt,
					leaseUntil,
				}),
				'utf8'
			)
			.digest('hex');
		await database.batch([
			{
				sql: `INSERT INTO telegram_preview_smoke_claim_authorizations (
					id, outbox_id, source_id, dedupe_key, target_fingerprint_sha256,
					activation_at, lease_owner, locked_at, lease_until, reviewed_by,
					reason_code, request_hash_sha256, provider_send_disabled, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
					'preview_synthetic_smoke', ?, 1, ?)`,
				params: [
					authorizationId,
					prepared.outboxId!,
					cohortId,
					dedupeKey,
					target.fingerprintSha256,
					binding.telegramActivationAt,
					leaseOwner,
					lockedAt,
					leaseUntil,
					target.manifest.reviewedBy,
					requestHash,
					lockedAt,
				],
			},
			{
				sql: `UPDATE telegram_outbox SET status = 'processing', not_before = ?,
					locked_at = ?, lease_owner = ?, lease_until = ?, updated_at = ?
				WHERE id = ? AND status = 'pending'`,
				params: [lockedAt, lockedAt, leaseOwner, leaseUntil, lockedAt, prepared.outboxId!],
			},
			{
				sql: `INSERT INTO telegram_preview_smoke_claim_assertions
					(id, authorization_id, outbox_id, assertion_passed, created_at)
				VALUES (?, ?, ?, 1, ?)`,
				params: [crypto.randomUUID(), authorizationId, prepared.outboxId!, lockedAt],
			},
		]);

		const ordinaryClaim = await new OutboxRepository(database).claimTelegram({
			now: '2026-08-13T10:07:00.000Z',
			leaseOwner: 'ordinary-stale-preview-cron',
			leaseUntil: '2026-08-13T10:08:00.000Z',
			activationAt: binding.telegramActivationAt,
			maxAttempts: binding.telegramMaxAttempts,
		});
		expect(ordinaryClaim).toBeNull();

		await expect(
			abortTelegramPreviewSmoke({
				database,
				target,
				cohortId,
				now: '2026-08-13T10:07:00.000Z',
				confirmation: confirmation('abort', cohortId),
			})
		).resolves.toMatchObject({
			state: 'cancelled',
			attemptCount: 0,
			providerRequestIdPresent: false,
		});
	});

	it('refuses preparation when any active backlog, dead row or unresolved delivery exists', async () => {
		const reference = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
		await database.run({
			sql: `INSERT INTO telegram_outbox (
				id, source_kind, source_id, template_or_category, destination_ref, locale,
				payload_json, dedupe_key, not_before, status, attempts, max_attempts,
				created_at, updated_at
			) VALUES (?, 'support_thread', ?, 'bureau.support', 'bureau', 'de', ?, ?, ?,
				'pending', 0, 1, ?, ?)`,
			params: [
				'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
				reference,
				JSON.stringify({
					category: 'technical',
					reference,
					receivedAt: now,
					adminPath: `/admin/messages/${reference}`,
				}),
				'preexisting-backlog',
				now,
				now,
				now,
			],
		});
		const cohortId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
		await expect(
			prepareTelegramPreviewSmoke({
				database,
				target,
				cohortId,
				now,
				confirmation: confirmation('prepare', cohortId),
			})
		).rejects.toMatchObject({ code: 'TELEGRAM_SMOKE_PREEXISTING_BACKLOG' });
		const count = await database.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM telegram_outbox
			WHERE dedupe_key LIKE 'telegram-preview-smoke:%'`,
		});
		expect(count).toEqual({ count: 0 });
	});
});

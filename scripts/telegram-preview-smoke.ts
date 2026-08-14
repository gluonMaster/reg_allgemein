import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SqlDatabaseBoundary } from '../src/lib/server/db/database';
import { nextBusinessWindow, parseBusinessHours } from '../src/lib/server/outbox/business-hours';
import type {
	OutboxStatus,
	TelegramOutboxRow,
	TelegramOutboxStore,
} from '../src/lib/server/outbox/contracts';
import { OutboxRepository } from '../src/lib/server/outbox/outbox-repository';
import { TelegramOutboxWorker } from '../src/lib/server/outbox/outbox-worker';
import {
	TelegramProviderError,
	type ProviderSendContext,
	type TelegramMessage,
	type TelegramProvider,
} from '../src/lib/server/outbox/providers';
import {
	renderTelegramTemplate,
	telegramDeliveryReference,
} from '../src/lib/server/outbox/templates';
import {
	TelegramBotApiProvider,
	type TelegramPreflightResult,
} from '../src/lib/server/telegram/bot-api';
import { RemoteD1Boundary, RemoteD1Error } from './remote-d1-target';
import {
	assertTelegramPreviewSecretBinding,
	loadTelegramPreviewTarget,
	TelegramPreviewTargetError,
	type TelegramPreviewSecretEnvironment,
	type VerifiedTelegramPreviewTarget,
} from './telegram-preview-target';

export const TELEGRAM_SMOKE_TARGET_CONFIRMATION = 'TARGET_MANIFEST_READ_ONLY';
export const TELEGRAM_SMOKE_VERIFY_CONFIRMATION = 'SMOKE_VERIFY_READ_ONLY';
export const TELEGRAM_SMOKE_DISARMED_NOT_BEFORE = '9999-12-31T23:59:59.999Z';

export type TelegramPreviewSmokeCommand =
	'target' | 'prepare' | 'run' | 'abort' | 'reconcile' | 'verify';

export interface TelegramPreviewSmokeArguments {
	command: TelegramPreviewSmokeCommand;
	environment: 'preview';
	configPath: string;
	targetManifestPath: string;
	deploymentEvidencePath: string;
	remote: boolean;
	cohortId?: string;
	confirmation: string;
}

export interface TelegramPreviewSmokeEnvironment extends TelegramPreviewSecretEnvironment {
	CLOUDFLARE_API_TOKEN?: string;
}

export interface TelegramPreviewSmokeEvidence {
	ok: true;
	state: 'target_verified' | 'prepared' | 'cancelled' | 'sent' | 'delivery_unknown';
	targetFingerprint: string;
	cohortId?: string;
	outboxId?: string;
	attemptCount?: number;
	deliveryReference?: string;
	providerRequestIdPresent?: boolean;
	providerRequestIdSha256?: string;
	duplicateCount?: number;
	preflightVerified?: true;
	requiresManualResolution?: true;
}

export class TelegramPreviewSmokeError extends Error {
	constructor(readonly code: string) {
		super('Telegram preview smoke failed.');
		this.name = 'TelegramPreviewSmokeError';
	}
}

function fail(code: string): never {
	throw new TelegramPreviewSmokeError(code);
}

function assertInstant(value: string, code = 'TELEGRAM_SMOKE_TIME_INVALID'): string {
	if (
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
		Number.isNaN(Date.parse(value)) ||
		new Date(value).toISOString() !== value
	) {
		fail(code);
	}
	return value;
}

function assertCohortId(value: string | undefined): string {
	const normalized = value?.toLowerCase() ?? '';
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalized)
	) {
		fail('TELEGRAM_SMOKE_COHORT_ID_INVALID');
	}
	return normalized;
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

function smokeIdentity(target: VerifiedTelegramPreviewTarget, cohortId: string) {
	const dedupeKey = `telegram-preview-smoke:${target.fingerprintSha256}:${cohortId}`;
	return {
		cohortId,
		outboxId: deterministicUuid(`telegram-preview-smoke-row-v1\0${dedupeKey}`),
		dedupeKey,
	};
}

function exactOption(options: Map<string, string | true>, key: string, expected: string): void {
	const value = options.get(key);
	if (value === undefined)
		fail(`TELEGRAM_SMOKE_${key.replaceAll('-', '_').toUpperCase()}_REQUIRED`);
	if (value !== expected)
		fail(`TELEGRAM_SMOKE_${key.replaceAll('-', '_').toUpperCase()}_INVALID`);
}

function required(options: ReadonlyMap<string, string | true>, key: string): string {
	const value = options.get(key);
	if (typeof value !== 'string' || !value) {
		fail(`TELEGRAM_SMOKE_${key.replaceAll('-', '_').toUpperCase()}_REQUIRED`);
	}
	return value;
}

export function parseTelegramPreviewSmokeArguments(
	argv: readonly string[]
): TelegramPreviewSmokeArguments {
	const command = argv[0];
	if (
		command !== 'target' &&
		command !== 'prepare' &&
		command !== 'run' &&
		command !== 'abort' &&
		command !== 'reconcile' &&
		command !== 'verify'
	) {
		fail('TELEGRAM_SMOKE_COMMAND_INVALID');
	}
	const allowed = new Set([
		'remote',
		'environment',
		'config',
		'target-manifest',
		'deployment-evidence',
		'cohort',
		'confirmation',
	]);
	const options = new Map<string, string | true>();
	for (let index = 1; index < argv.length; index += 1) {
		const token = argv[index];
		if (!/^--[a-z][a-z-]*$/u.test(token)) fail('TELEGRAM_SMOKE_ARGUMENT_UNKNOWN');
		const key = token.slice(2);
		if (!allowed.has(key)) fail('TELEGRAM_SMOKE_ARGUMENT_UNKNOWN');
		if (options.has(key)) fail('TELEGRAM_SMOKE_ARGUMENT_DUPLICATE');
		if (key === 'remote') {
			if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
				fail('TELEGRAM_SMOKE_REMOTE_VALUE_FORBIDDEN');
			}
			options.set(key, true);
			continue;
		}
		const value = argv[index + 1];
		if (!value || value.startsWith('--')) fail('TELEGRAM_SMOKE_ARGUMENT_VALUE_REQUIRED');
		options.set(key, value);
		index += 1;
	}
	exactOption(options, 'environment', 'preview');
	const configPath = required(options, 'config');
	const targetManifestPath = required(options, 'target-manifest');
	const deploymentEvidencePath = required(options, 'deployment-evidence');
	const confirmation = required(options, 'confirmation');
	if (command === 'target') {
		if (options.has('remote') || options.has('cohort'))
			fail('TELEGRAM_SMOKE_TARGET_SCOPE_INVALID');
		if (confirmation !== TELEGRAM_SMOKE_TARGET_CONFIRMATION) {
			fail('TELEGRAM_SMOKE_CONFIRMATION_INVALID');
		}
		return {
			command,
			environment: 'preview',
			configPath,
			targetManifestPath,
			deploymentEvidencePath,
			remote: false,
			confirmation,
		};
	}
	if (options.get('remote') !== true) fail('TELEGRAM_SMOKE_REMOTE_REQUIRED');
	return {
		command,
		environment: 'preview',
		configPath,
		targetManifestPath,
		deploymentEvidencePath,
		remote: true,
		cohortId: assertCohortId(required(options, 'cohort')),
		confirmation,
	};
}

export function expectedTelegramPreviewSmokeConfirmation(input: {
	command: 'prepare' | 'run' | 'abort' | 'reconcile';
	targetFingerprint: string;
	cohortId: string;
}): string {
	if (!/^[0-9a-f]{64}$/u.test(input.targetFingerprint)) {
		fail('TELEGRAM_SMOKE_TARGET_FINGERPRINT_INVALID');
	}
	const cohortId = assertCohortId(input.cohortId);
	return [
		'TELEGRAM_PREVIEW_SMOKE',
		input.command === 'prepare'
			? 'PREPARE_ONE'
			: input.command === 'run'
				? 'SEND_ONE'
				: input.command === 'abort'
					? 'ABORT_UNSENT_ONE'
					: 'RECONCILE_EXPIRED_NO_SEND',
		input.targetFingerprint,
		cohortId,
	].join('_');
}

interface QueueHazards {
	other_active: number;
	dead: number;
	unresolved: number;
}

async function queueHazards(
	database: SqlDatabaseBoundary,
	excludedOutboxId: string
): Promise<QueueHazards> {
	const row = await database.first<QueueHazards>({
		sql: `SELECT
			(SELECT COUNT(*) FROM telegram_outbox
			 WHERE id <> ? AND status IN ('pending', 'processing', 'retry')) AS other_active,
			(SELECT COUNT(*) FROM telegram_outbox
			 WHERE id <> ? AND status = 'dead') AS dead,
			(SELECT COUNT(*) FROM telegram_delivery_attempts
			 WHERE outbox_id <> ? AND state = 'delivery_unknown' AND resolved_at IS NULL) AS unresolved`,
		params: [excludedOutboxId, excludedOutboxId, excludedOutboxId],
	});
	if (!row) fail('TELEGRAM_SMOKE_QUEUE_STATE_UNAVAILABLE');
	return row;
}

function assertNoQueueHazards(hazards: QueueHazards): void {
	if (hazards.other_active !== 0) fail('TELEGRAM_SMOKE_PREEXISTING_BACKLOG');
	if (hazards.dead !== 0) fail('TELEGRAM_SMOKE_PREEXISTING_DEAD');
	if (hazards.unresolved !== 0) fail('TELEGRAM_SMOKE_PREEXISTING_DELIVERY_UNKNOWN');
}

function syntheticPayload(cohortId: string, createdAt: string): string {
	return JSON.stringify({
		category: 'technical',
		reference: cohortId,
		receivedAt: createdAt,
		adminPath: `/admin/messages/${cohortId}`,
	});
}

export async function prepareTelegramPreviewSmoke(input: {
	database: SqlDatabaseBoundary;
	target: VerifiedTelegramPreviewTarget;
	cohortId: string;
	now: string;
	confirmation: string;
}): Promise<TelegramPreviewSmokeEvidence> {
	const cohortId = assertCohortId(input.cohortId);
	const now = assertInstant(input.now);
	const identity = smokeIdentity(input.target, cohortId);
	const expected = expectedTelegramPreviewSmokeConfirmation({
		command: 'prepare',
		targetFingerprint: input.target.fingerprintSha256,
		cohortId,
	});
	if (input.confirmation !== expected) fail('TELEGRAM_SMOKE_CONFIRMATION_INVALID');
	assertNoQueueHazards(await queueHazards(input.database, identity.outboxId));
	const result = await input.database.run({
		sql: `INSERT INTO telegram_outbox (
			id, source_kind, source_id, template_or_category, destination_ref, locale,
			payload_json, dedupe_key, not_before, status, attempts, max_attempts,
			created_at, updated_at
		)
		SELECT ?, 'support_thread', ?, 'bureau.support', 'bureau', 'de', ?, ?, ?,
			'pending', 0, 1, ?, ?
		WHERE NOT EXISTS (
			SELECT 1 FROM telegram_outbox
			WHERE status IN ('pending', 'processing', 'retry', 'dead', 'delivery_unknown')
		)
		AND NOT EXISTS (
			SELECT 1 FROM telegram_delivery_attempts
			WHERE state = 'delivery_unknown' AND resolved_at IS NULL
		)`,
		params: [
			identity.outboxId,
			cohortId,
			syntheticPayload(cohortId, now),
			identity.dedupeKey,
			TELEGRAM_SMOKE_DISARMED_NOT_BEFORE,
			now,
			now,
		],
	});
	if (result.meta.changes !== 1) fail('TELEGRAM_SMOKE_PREPARE_GUARD_REJECTED');
	const evidence = await verifyTelegramPreviewSmoke({
		database: input.database,
		target: input.target,
		cohortId,
	});
	if (evidence.state !== 'prepared') fail('TELEGRAM_SMOKE_PREPARE_VERIFY_FAILED');
	return evidence;
}

interface SmokeAttemptRow {
	attempt_count: number;
	state: string | null;
	delivery_reference: string | null;
	provider_request_id: string | null;
	safe_error_code: string | null;
	resolved_at: string | null;
	lease_owner: string | null;
	started_at: string | null;
}

interface SmokeClaimProofRow {
	authorization_count: number;
	assertion_count: number;
	authorization_id: string | null;
	assertion_authorization_id: string | null;
	source_id: string | null;
	dedupe_key: string | null;
	target_fingerprint_sha256: string | null;
	activation_at: string | null;
	lease_owner: string | null;
	locked_at: string | null;
	lease_until: string | null;
	reviewed_by: string | null;
	reason_code: string | null;
	request_hash_sha256: string | null;
	provider_send_disabled: number | null;
	authorization_created_at: string | null;
	assertion_passed: number | null;
	assertion_created_at: string | null;
}

interface SmokeAbortProofRow {
	authorization_count: number;
	assertion_count: number;
	authorization_id: string | null;
	assertion_authorization_id: string | null;
	source_id: string | null;
	dedupe_key: string | null;
	target_fingerprint_sha256: string | null;
	status_before: 'pending' | 'processing' | null;
	not_before_before: string | null;
	locked_at_before: string | null;
	lease_owner_before: string | null;
	lease_until_before: string | null;
	updated_at_before: string | null;
	reviewed_by: string | null;
	reason_code: string | null;
	request_hash_sha256: string | null;
	authorization_created_at: string | null;
	assertion_passed: number | null;
	assertion_created_at: string | null;
}

type SmokeStoredRow = Omit<TelegramOutboxRow, 'lease_owner'> & {
	lease_owner: string | null;
	locked_at: string | null;
	lease_until: string | null;
	not_before: string;
	status: OutboxStatus;
	next_attempt_at: string | null;
	last_error_code: string | null;
	provider_request_id: string | null;
	manual_retry_count: number;
	sent_at: string | null;
	created_at: string;
	updated_at: string;
};

interface SmokeDuplicateCounts {
	id_count: number;
	dedupe_count: number;
	source_count: number;
}

interface SmokeReconcileStateRow {
	id: string;
	source_kind: string;
	source_id: string;
	template_or_category: string;
	destination_ref: string;
	locale: string;
	payload_json: string;
	dedupe_key: string;
	not_before: string;
	status: OutboxStatus;
	attempts: number;
	max_attempts: number;
	manual_retry_count: number;
	next_attempt_at: string | null;
	last_error_code: string | null;
	provider_request_id: string | null;
	sent_at: string | null;
	locked_at: string | null;
	lease_owner: string | null;
	lease_until: string | null;
	created_at: string;
	updated_at: string;
	attempt_count: number;
	attempt_id: string | null;
	attempt_no: number | null;
	attempt_delivery_reference: string | null;
	attempt_lease_owner: string | null;
	attempt_state: string | null;
	attempt_safe_error_code: string | null;
	attempt_provider_request_id: string | null;
	attempt_started_at: string | null;
	attempt_finished_at: string | null;
	attempt_resolved_at: string | null;
	attempt_created_at: string | null;
	attempt_updated_at: string | null;
	claim_authorization_count: number;
	claim_assertion_count: number;
	claim_authorization_id: string | null;
	claim_assertion_id: string | null;
	claim_assertion_authorization_id: string | null;
	claim_source_id: string | null;
	claim_dedupe_key: string | null;
	claim_target_fingerprint_sha256: string | null;
	claim_activation_at: string | null;
	claim_lease_owner: string | null;
	claim_locked_at: string | null;
	claim_lease_until: string | null;
	claim_reviewed_by: string | null;
	claim_reason_code: string | null;
	claim_request_hash_sha256: string | null;
	claim_provider_send_disabled: number | null;
	claim_created_at: string | null;
	claim_assertion_passed: number | null;
	claim_assertion_created_at: string | null;
	abort_authorization_count: number;
	abort_assertion_count: number;
	id_count: number;
	dedupe_count: number;
	source_count: number;
}

async function loadSmokeReconcileState(
	database: SqlDatabaseBoundary,
	outboxId: string,
	dedupeKey: string,
	cohortId: string
): Promise<SmokeReconcileStateRow | null> {
	return database.first<SmokeReconcileStateRow>({
		sql: `SELECT outbox.*,
			(SELECT COUNT(*) FROM telegram_delivery_attempts
			 WHERE outbox_id = outbox.id) AS attempt_count,
			attempt.id AS attempt_id,
			attempt.attempt_no AS attempt_no,
			attempt.delivery_reference AS attempt_delivery_reference,
			attempt.lease_owner AS attempt_lease_owner,
			attempt.state AS attempt_state,
			attempt.safe_error_code AS attempt_safe_error_code,
			attempt.provider_request_id AS attempt_provider_request_id,
			attempt.started_at AS attempt_started_at,
			attempt.finished_at AS attempt_finished_at,
			attempt.resolved_at AS attempt_resolved_at,
			attempt.created_at AS attempt_created_at,
			attempt.updated_at AS attempt_updated_at,
			(SELECT COUNT(*) FROM telegram_preview_smoke_claim_authorizations
			 WHERE outbox_id = outbox.id) AS claim_authorization_count,
			(SELECT COUNT(*) FROM telegram_preview_smoke_claim_assertions
			 WHERE outbox_id = outbox.id) AS claim_assertion_count,
			authorization.id AS claim_authorization_id,
			assertion.id AS claim_assertion_id,
			assertion.authorization_id AS claim_assertion_authorization_id,
			authorization.source_id AS claim_source_id,
			authorization.dedupe_key AS claim_dedupe_key,
			authorization.target_fingerprint_sha256 AS claim_target_fingerprint_sha256,
			authorization.activation_at AS claim_activation_at,
			authorization.lease_owner AS claim_lease_owner,
			authorization.locked_at AS claim_locked_at,
			authorization.lease_until AS claim_lease_until,
			authorization.reviewed_by AS claim_reviewed_by,
			authorization.reason_code AS claim_reason_code,
			authorization.request_hash_sha256 AS claim_request_hash_sha256,
			authorization.provider_send_disabled AS claim_provider_send_disabled,
			authorization.created_at AS claim_created_at,
			assertion.assertion_passed AS claim_assertion_passed,
			assertion.created_at AS claim_assertion_created_at,
			(SELECT COUNT(*) FROM telegram_preview_smoke_abort_authorizations
			 WHERE outbox_id = outbox.id) AS abort_authorization_count,
			(SELECT COUNT(*) FROM telegram_preview_smoke_abort_assertions
			 WHERE outbox_id = outbox.id) AS abort_assertion_count,
			(SELECT COUNT(*) FROM telegram_outbox WHERE id = ?) AS id_count,
			(SELECT COUNT(*) FROM telegram_outbox WHERE dedupe_key = ?) AS dedupe_count,
			(SELECT COUNT(*) FROM telegram_outbox
			 WHERE source_kind = 'support_thread' AND source_id = ?
			   AND template_or_category = 'bureau.support') AS source_count
		FROM telegram_outbox outbox
		LEFT JOIN telegram_delivery_attempts attempt ON attempt.outbox_id = outbox.id
		LEFT JOIN telegram_preview_smoke_claim_authorizations authorization
			ON authorization.outbox_id = outbox.id
		LEFT JOIN telegram_preview_smoke_claim_assertions assertion
			ON assertion.outbox_id = outbox.id
		WHERE outbox.id = ?`,
		params: [outboxId, dedupeKey, cohortId, outboxId],
	});
}

function providerRequestIdSha256(value: string): string {
	return createHash('sha256')
		.update(`telegram-provider-request-id-v1\0${value}`, 'utf8')
		.digest('hex');
}

function smokeClaimRequestHash(input: {
	outboxId: string;
	sourceId: string;
	dedupeKey: string;
	targetFingerprint: string;
	activationAt: string;
	leaseOwner: string;
	lockedAt: string;
	leaseUntil: string;
}): string {
	return createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
}

function smokeAbortRequestHash(input: {
	outboxId: string;
	sourceId: string;
	dedupeKey: string;
	targetFingerprint: string;
	statusBefore: 'pending' | 'processing';
	notBeforeBefore: string;
	lockedAtBefore: string | null;
	leaseOwnerBefore: string | null;
	leaseUntilBefore: string | null;
	updatedAtBefore: string;
	reviewedBy: string;
	createdAt: string;
}): string {
	return createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
}

export async function verifyTelegramPreviewSmoke(input: {
	database: SqlDatabaseBoundary;
	target: VerifiedTelegramPreviewTarget;
	cohortId: string;
}): Promise<TelegramPreviewSmokeEvidence> {
	const cohortId = assertCohortId(input.cohortId);
	const identity = smokeIdentity(input.target, cohortId);
	const row = await input.database.first<SmokeStoredRow>({
		sql: 'SELECT * FROM telegram_outbox WHERE id = ?',
		params: [identity.outboxId],
	});
	if (!row) fail('TELEGRAM_SMOKE_ROW_NOT_FOUND');
	const expectedPayload = syntheticPayload(cohortId, row.created_at);
	if (
		row.source_kind !== 'support_thread' ||
		row.source_id !== cohortId ||
		row.template_or_category !== 'bureau.support' ||
		row.destination_ref !== 'bureau' ||
		row.locale !== 'de' ||
		row.payload_json !== expectedPayload ||
		row.dedupe_key !== identity.dedupeKey ||
		row.max_attempts !== 1 ||
		row.manual_retry_count !== 0
	) {
		fail('TELEGRAM_SMOKE_ROW_CONTRACT_MISMATCH');
	}
	assertInstant(row.created_at, 'TELEGRAM_SMOKE_ROW_TIME_INVALID');
	const attempts = await input.database.first<SmokeAttemptRow>({
		sql: `SELECT COUNT(*) AS attempt_count,
			MAX(state) AS state,
			MAX(delivery_reference) AS delivery_reference,
			MAX(provider_request_id) AS provider_request_id,
			MAX(safe_error_code) AS safe_error_code,
			MAX(resolved_at) AS resolved_at,
			MAX(lease_owner) AS lease_owner,
			MAX(started_at) AS started_at
		FROM telegram_delivery_attempts WHERE outbox_id = ?`,
		params: [identity.outboxId],
	});
	const proof = await input.database.first<SmokeClaimProofRow>({
		sql: `SELECT
			COUNT(*) AS authorization_count,
			(SELECT COUNT(*) FROM telegram_preview_smoke_claim_assertions
			 WHERE outbox_id = ?) AS assertion_count,
			MAX(authorization.id) AS authorization_id,
			(SELECT MAX(assertion.authorization_id)
			 FROM telegram_preview_smoke_claim_assertions assertion
			 WHERE assertion.outbox_id = ?) AS assertion_authorization_id,
			MAX(authorization.source_id) AS source_id,
			MAX(authorization.dedupe_key) AS dedupe_key,
			MAX(authorization.target_fingerprint_sha256) AS target_fingerprint_sha256,
			MAX(authorization.activation_at) AS activation_at,
			MAX(authorization.lease_owner) AS lease_owner,
			MAX(authorization.locked_at) AS locked_at,
			MAX(authorization.lease_until) AS lease_until,
			MAX(authorization.reviewed_by) AS reviewed_by,
			MAX(authorization.reason_code) AS reason_code,
			MAX(authorization.request_hash_sha256) AS request_hash_sha256,
			MAX(authorization.provider_send_disabled) AS provider_send_disabled,
			MAX(authorization.created_at) AS authorization_created_at,
			(SELECT MAX(assertion.assertion_passed)
			 FROM telegram_preview_smoke_claim_assertions assertion
			 WHERE assertion.outbox_id = ?) AS assertion_passed,
			(SELECT MAX(assertion.created_at)
			 FROM telegram_preview_smoke_claim_assertions assertion
			 WHERE assertion.outbox_id = ?) AS assertion_created_at
		FROM telegram_preview_smoke_claim_authorizations authorization
		WHERE authorization.outbox_id = ?`,
		params: [
			identity.outboxId,
			identity.outboxId,
			identity.outboxId,
			identity.outboxId,
			identity.outboxId,
		],
	});
	const abortProof = await input.database.first<SmokeAbortProofRow>({
		sql: `SELECT
			COUNT(*) AS authorization_count,
			(SELECT COUNT(*) FROM telegram_preview_smoke_abort_assertions
			 WHERE outbox_id = ?) AS assertion_count,
			MAX(authorization.id) AS authorization_id,
			(SELECT MAX(assertion.authorization_id)
			 FROM telegram_preview_smoke_abort_assertions assertion
			 WHERE assertion.outbox_id = ?) AS assertion_authorization_id,
			MAX(authorization.source_id) AS source_id,
			MAX(authorization.dedupe_key) AS dedupe_key,
			MAX(authorization.target_fingerprint_sha256) AS target_fingerprint_sha256,
			MAX(authorization.status_before) AS status_before,
			MAX(authorization.not_before_before) AS not_before_before,
			MAX(authorization.locked_at_before) AS locked_at_before,
			MAX(authorization.lease_owner_before) AS lease_owner_before,
			MAX(authorization.lease_until_before) AS lease_until_before,
			MAX(authorization.updated_at_before) AS updated_at_before,
			MAX(authorization.reviewed_by) AS reviewed_by,
			MAX(authorization.reason_code) AS reason_code,
			MAX(authorization.request_hash_sha256) AS request_hash_sha256,
			MAX(authorization.created_at) AS authorization_created_at,
			(SELECT MAX(assertion.assertion_passed)
			 FROM telegram_preview_smoke_abort_assertions assertion
			 WHERE assertion.outbox_id = ?) AS assertion_passed,
			(SELECT MAX(assertion.created_at)
			 FROM telegram_preview_smoke_abort_assertions assertion
			 WHERE assertion.outbox_id = ?) AS assertion_created_at
		FROM telegram_preview_smoke_abort_authorizations authorization
		WHERE authorization.outbox_id = ?`,
		params: [
			identity.outboxId,
			identity.outboxId,
			identity.outboxId,
			identity.outboxId,
			identity.outboxId,
		],
	});
	const duplicates = await input.database.first<SmokeDuplicateCounts>({
		sql: `SELECT
			(SELECT COUNT(*) FROM telegram_outbox WHERE id = ?) AS id_count,
			(SELECT COUNT(*) FROM telegram_outbox WHERE dedupe_key = ?) AS dedupe_count,
			(SELECT COUNT(*) FROM telegram_outbox
			 WHERE source_kind = 'support_thread' AND source_id = ?
			   AND template_or_category = 'bureau.support') AS source_count`,
		params: [identity.outboxId, identity.dedupeKey, cohortId],
	});
	if (!attempts || !proof || !abortProof || !duplicates) {
		fail('TELEGRAM_SMOKE_VERIFY_STATE_UNAVAILABLE');
	}
	if (
		duplicates.id_count !== 1 ||
		duplicates.dedupe_count !== 1 ||
		duplicates.source_count !== 1
	) {
		fail('TELEGRAM_SMOKE_DUPLICATE_DETECTED');
	}
	const base = {
		ok: true as const,
		targetFingerprint: input.target.fingerprintSha256,
		cohortId,
		outboxId: identity.outboxId,
		attemptCount: attempts.attempt_count,
		duplicateCount: 0,
	};
	if (row.status === 'pending') {
		if (
			row.not_before !== TELEGRAM_SMOKE_DISARMED_NOT_BEFORE ||
			row.attempts !== 0 ||
			attempts.attempt_count !== 0 ||
			proof.authorization_count !== 0 ||
			proof.assertion_count !== 0 ||
			abortProof.authorization_count !== 0 ||
			abortProof.assertion_count !== 0 ||
			row.provider_request_id !== null ||
			row.sent_at !== null ||
			row.next_attempt_at !== null ||
			row.last_error_code !== null ||
			row.locked_at !== null ||
			row.lease_owner !== null ||
			row.lease_until !== null
		) {
			fail('TELEGRAM_SMOKE_PREPARED_STATE_INVALID');
		}
		return { ...base, state: 'prepared', providerRequestIdPresent: false };
	}
	if (row.status === 'cancelled') {
		const statusBefore = abortProof.status_before;
		if (statusBefore !== 'pending' && statusBefore !== 'processing') {
			fail('TELEGRAM_SMOKE_ABORT_PROOF_INVALID');
		}
		const expectedAuthorizationId = deterministicUuid(
			`telegram-preview-smoke-abort-auth-v1\0${identity.outboxId}`
		);
		if (!abortProof.authorization_created_at || !abortProof.updated_at_before) {
			fail('TELEGRAM_SMOKE_ABORT_PROOF_INVALID');
		}
		const expectedRequestHash = smokeAbortRequestHash({
			outboxId: identity.outboxId,
			sourceId: cohortId,
			dedupeKey: identity.dedupeKey,
			targetFingerprint: input.target.fingerprintSha256,
			statusBefore,
			notBeforeBefore: abortProof.not_before_before ?? '',
			lockedAtBefore: abortProof.locked_at_before,
			leaseOwnerBefore: abortProof.lease_owner_before,
			leaseUntilBefore: abortProof.lease_until_before,
			updatedAtBefore: abortProof.updated_at_before,
			reviewedBy: input.target.manifest.reviewedBy,
			createdAt: abortProof.authorization_created_at,
		});
		let claimProofValid =
			proof.authorization_count === 0 &&
			proof.assertion_count === 0 &&
			abortProof.not_before_before === TELEGRAM_SMOKE_DISARMED_NOT_BEFORE &&
			abortProof.locked_at_before === null &&
			abortProof.lease_owner_before === null &&
			abortProof.lease_until_before === null;
		if (
			statusBefore === 'processing' &&
			abortProof.locked_at_before &&
			abortProof.lease_owner_before &&
			abortProof.lease_until_before
		) {
			const expectedClaimAuthorizationId = deterministicUuid(
				`telegram-preview-smoke-claim-auth-v1\0${identity.outboxId}\0${abortProof.lease_owner_before}`
			);
			claimProofValid =
				proof.authorization_count === 1 &&
				proof.assertion_count === 1 &&
				proof.authorization_id === expectedClaimAuthorizationId &&
				proof.assertion_authorization_id === expectedClaimAuthorizationId &&
				proof.source_id === cohortId &&
				proof.dedupe_key === identity.dedupeKey &&
				proof.target_fingerprint_sha256 === input.target.fingerprintSha256 &&
				proof.activation_at === input.target.manifest.binding.telegramActivationAt &&
				proof.locked_at === abortProof.locked_at_before &&
				proof.lease_owner === abortProof.lease_owner_before &&
				proof.lease_until === abortProof.lease_until_before &&
				proof.reviewed_by === input.target.manifest.reviewedBy &&
				proof.reason_code === 'preview_synthetic_smoke' &&
				proof.request_hash_sha256 ===
					smokeClaimRequestHash({
						outboxId: identity.outboxId,
						sourceId: cohortId,
						dedupeKey: identity.dedupeKey,
						targetFingerprint: input.target.fingerprintSha256,
						activationAt: input.target.manifest.binding.telegramActivationAt,
						leaseOwner: abortProof.lease_owner_before,
						lockedAt: abortProof.locked_at_before,
						leaseUntil: abortProof.lease_until_before,
					}) &&
				proof.provider_send_disabled === 1 &&
				proof.authorization_created_at === abortProof.locked_at_before &&
				proof.assertion_passed === 1 &&
				proof.assertion_created_at === abortProof.locked_at_before;
		}
		if (
			abortProof.authorization_count !== 1 ||
			abortProof.assertion_count !== 1 ||
			abortProof.authorization_id !== expectedAuthorizationId ||
			abortProof.assertion_authorization_id !== expectedAuthorizationId ||
			abortProof.source_id !== cohortId ||
			abortProof.dedupe_key !== identity.dedupeKey ||
			abortProof.target_fingerprint_sha256 !== input.target.fingerprintSha256 ||
			abortProof.not_before_before !== row.not_before ||
			abortProof.reviewed_by !== input.target.manifest.reviewedBy ||
			abortProof.reason_code !== 'preview_synthetic_smoke_aborted_before_dispatch' ||
			abortProof.request_hash_sha256 !== expectedRequestHash ||
			abortProof.authorization_created_at !== row.updated_at ||
			abortProof.assertion_passed !== 1 ||
			abortProof.assertion_created_at !== row.updated_at ||
			!claimProofValid ||
			row.attempts !== 0 ||
			attempts.attempt_count !== 0 ||
			row.provider_request_id !== null ||
			row.sent_at !== null ||
			row.next_attempt_at !== null ||
			row.last_error_code !== null ||
			row.locked_at !== null ||
			row.lease_owner !== null ||
			row.lease_until !== null
		) {
			fail('TELEGRAM_SMOKE_ABORT_PROOF_INVALID');
		}
		return { ...base, state: 'cancelled', providerRequestIdPresent: false };
	}
	if (abortProof.authorization_count !== 0 || abortProof.assertion_count !== 0) {
		fail('TELEGRAM_SMOKE_ABORT_PROOF_INVALID');
	}
	const expectedReference = await telegramDeliveryReference(identity.dedupeKey);
	const expectedLeaseOwner = `telegram-preview-smoke:${cohortId}`;
	const expectedAuthorizationId = deterministicUuid(
		`telegram-preview-smoke-claim-auth-v1\0${identity.outboxId}\0${expectedLeaseOwner}`
	);
	if (!proof.locked_at || !proof.lease_until) fail('TELEGRAM_SMOKE_CLAIM_PROOF_INVALID');
	const expectedLeaseUntil = new Date(
		Date.parse(proof.locked_at) + input.target.manifest.binding.outboxLeaseSeconds * 1_000
	).toISOString();
	const expectedRequestHash = smokeClaimRequestHash({
		outboxId: identity.outboxId,
		sourceId: cohortId,
		dedupeKey: identity.dedupeKey,
		targetFingerprint: input.target.fingerprintSha256,
		activationAt: input.target.manifest.binding.telegramActivationAt,
		leaseOwner: expectedLeaseOwner,
		lockedAt: proof.locked_at,
		leaseUntil: proof.lease_until,
	});
	if (
		proof.authorization_count !== 1 ||
		proof.assertion_count !== 1 ||
		proof.authorization_id !== expectedAuthorizationId ||
		proof.assertion_authorization_id !== expectedAuthorizationId ||
		proof.source_id !== cohortId ||
		proof.dedupe_key !== identity.dedupeKey ||
		proof.target_fingerprint_sha256 !== input.target.fingerprintSha256 ||
		proof.activation_at !== input.target.manifest.binding.telegramActivationAt ||
		proof.lease_owner !== expectedLeaseOwner ||
		proof.lease_until !== expectedLeaseUntil ||
		proof.reviewed_by !== input.target.manifest.reviewedBy ||
		proof.reason_code !== 'preview_synthetic_smoke' ||
		proof.request_hash_sha256 !== expectedRequestHash ||
		proof.provider_send_disabled !== 1 ||
		proof.authorization_created_at !== proof.locked_at ||
		proof.assertion_passed !== 1 ||
		proof.assertion_created_at !== proof.locked_at ||
		row.not_before !== proof.locked_at ||
		attempts.lease_owner !== proof.lease_owner ||
		attempts.started_at !== proof.locked_at
	) {
		fail('TELEGRAM_SMOKE_CLAIM_PROOF_INVALID');
	}
	if (
		attempts.attempt_count !== 1 ||
		attempts.delivery_reference !== expectedReference ||
		row.attempts !== 1
	) {
		fail('TELEGRAM_SMOKE_ATTEMPT_CONTRACT_MISMATCH');
	}
	if (row.status === 'sent') {
		if (
			attempts.state !== 'delivered' ||
			!row.provider_request_id ||
			attempts.provider_request_id !== row.provider_request_id ||
			attempts.safe_error_code !== null ||
			attempts.resolved_at !== null ||
			!row.sent_at ||
			row.last_error_code !== null
		) {
			fail('TELEGRAM_SMOKE_SENT_STATE_INVALID');
		}
		return {
			...base,
			state: 'sent',
			deliveryReference: expectedReference,
			providerRequestIdPresent: true,
			providerRequestIdSha256: providerRequestIdSha256(row.provider_request_id),
		};
	}
	if (row.status === 'delivery_unknown') {
		if (
			attempts.state !== 'delivery_unknown' ||
			attempts.provider_request_id !== null ||
			attempts.safe_error_code !== 'TELEGRAM_DELIVERY_UNKNOWN' ||
			attempts.resolved_at !== null ||
			row.provider_request_id !== null ||
			row.sent_at !== null ||
			row.last_error_code !== 'TELEGRAM_DELIVERY_UNKNOWN' ||
			row.next_attempt_at !== null
		) {
			fail('TELEGRAM_SMOKE_UNKNOWN_STATE_INVALID');
		}
		return {
			...base,
			state: 'delivery_unknown',
			deliveryReference: expectedReference,
			providerRequestIdPresent: false,
			requiresManualResolution: true,
		};
	}
	fail('TELEGRAM_SMOKE_TERMINAL_STATE_INVALID');
}

export async function abortTelegramPreviewSmoke(input: {
	database: SqlDatabaseBoundary;
	target: VerifiedTelegramPreviewTarget;
	cohortId: string;
	now: string;
	confirmation: string;
}): Promise<TelegramPreviewSmokeEvidence> {
	const cohortId = assertCohortId(input.cohortId);
	const now = assertInstant(input.now);
	const identity = smokeIdentity(input.target, cohortId);
	const expected = expectedTelegramPreviewSmokeConfirmation({
		command: 'abort',
		targetFingerprint: input.target.fingerprintSha256,
		cohortId,
	});
	if (input.confirmation !== expected) fail('TELEGRAM_SMOKE_CONFIRMATION_INVALID');
	const row = await input.database.first<SmokeStoredRow>({
		sql: 'SELECT * FROM telegram_outbox WHERE id = ?',
		params: [identity.outboxId],
	});
	if (!row) fail('TELEGRAM_SMOKE_ROW_NOT_FOUND');
	if (row.status !== 'pending' && row.status !== 'processing') {
		fail('TELEGRAM_SMOKE_ABORT_NOT_ALLOWED');
	}
	if (
		row.source_kind !== 'support_thread' ||
		row.source_id !== cohortId ||
		row.template_or_category !== 'bureau.support' ||
		row.destination_ref !== 'bureau' ||
		row.locale !== 'de' ||
		row.payload_json !== syntheticPayload(cohortId, row.created_at) ||
		row.dedupe_key !== identity.dedupeKey ||
		row.attempts !== 0 ||
		row.max_attempts !== 1 ||
		row.manual_retry_count !== 0 ||
		row.next_attempt_at !== null ||
		row.last_error_code !== null ||
		row.provider_request_id !== null ||
		row.sent_at !== null ||
		(row.status === 'pending' &&
			(row.not_before !== TELEGRAM_SMOKE_DISARMED_NOT_BEFORE ||
				row.locked_at !== null ||
				row.lease_owner !== null ||
				row.lease_until !== null)) ||
		(row.status === 'processing' &&
			(!row.locked_at ||
				!row.lease_owner ||
				!row.lease_until ||
				row.not_before !== row.locked_at ||
				row.updated_at !== row.locked_at))
	) {
		fail('TELEGRAM_SMOKE_ABORT_STATE_INVALID');
	}
	const attemptCount = await input.database.first<{ count: number }>({
		sql: 'SELECT COUNT(*) AS count FROM telegram_delivery_attempts WHERE outbox_id = ?',
		params: [identity.outboxId],
	});
	if (!attemptCount || attemptCount.count !== 0) fail('TELEGRAM_SMOKE_ABORT_DISPATCH_EXISTS');
	const authorizationId = deterministicUuid(
		`telegram-preview-smoke-abort-auth-v1\0${identity.outboxId}`
	);
	const assertionId = deterministicUuid(
		`telegram-preview-smoke-abort-assertion-v1\0${authorizationId}`
	);
	const requestHash = smokeAbortRequestHash({
		outboxId: identity.outboxId,
		sourceId: cohortId,
		dedupeKey: identity.dedupeKey,
		targetFingerprint: input.target.fingerprintSha256,
		statusBefore: row.status,
		notBeforeBefore: row.not_before,
		lockedAtBefore: row.locked_at,
		leaseOwnerBefore: row.lease_owner,
		leaseUntilBefore: row.lease_until,
		updatedAtBefore: row.updated_at,
		reviewedBy: input.target.manifest.reviewedBy,
		createdAt: now,
	});
	try {
		await input.database.batch([
			{
				sql: `INSERT INTO telegram_preview_smoke_abort_authorizations (
					id, outbox_id, source_id, dedupe_key, target_fingerprint_sha256,
					status_before, not_before_before, locked_at_before, lease_owner_before,
					lease_until_before, updated_at_before, reviewed_by, reason_code,
					request_hash_sha256, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
					'preview_synthetic_smoke_aborted_before_dispatch', ?, ?)`,
				params: [
					authorizationId,
					identity.outboxId,
					cohortId,
					identity.dedupeKey,
					input.target.fingerprintSha256,
					row.status,
					row.not_before,
					row.locked_at,
					row.lease_owner,
					row.lease_until,
					row.updated_at,
					input.target.manifest.reviewedBy,
					requestHash,
					now,
				],
			},
			{
				sql: `UPDATE telegram_outbox SET status = 'cancelled',
					next_attempt_at = NULL, locked_at = NULL, lease_owner = NULL,
					lease_until = NULL, updated_at = ?
				WHERE id = ? AND source_kind = 'support_thread' AND source_id = ?
					AND template_or_category = 'bureau.support' AND destination_ref = 'bureau'
					AND dedupe_key = ? AND status = ? AND attempts = 0 AND max_attempts = 1
					AND manual_retry_count = 0 AND not_before = ?
					AND locked_at IS ? AND lease_owner IS ? AND lease_until IS ?
					AND updated_at = ? AND next_attempt_at IS NULL
					AND last_error_code IS NULL AND provider_request_id IS NULL
					AND sent_at IS NULL AND NOT EXISTS (
						SELECT 1 FROM telegram_delivery_attempts attempt
						WHERE attempt.outbox_id = telegram_outbox.id
					)`,
				params: [
					now,
					identity.outboxId,
					cohortId,
					identity.dedupeKey,
					row.status,
					row.not_before,
					row.locked_at,
					row.lease_owner,
					row.lease_until,
					row.updated_at,
				],
			},
			{
				sql: `INSERT INTO telegram_preview_smoke_abort_assertions (
					id, authorization_id, outbox_id, assertion_passed, created_at
				) SELECT ?, authorization.id, outbox.id, 1, ?
				FROM telegram_preview_smoke_abort_authorizations authorization
				JOIN telegram_outbox outbox ON outbox.id = authorization.outbox_id
				WHERE authorization.id = ? AND authorization.outbox_id = ?
					AND authorization.request_hash_sha256 = ?
					AND authorization.created_at = ?
					AND outbox.status = 'cancelled' AND outbox.updated_at = authorization.created_at`,
				params: [assertionId, now, authorizationId, identity.outboxId, requestHash, now],
			},
		]);
	} catch (error) {
		if (error instanceof RemoteD1Error) throw error;
		fail('TELEGRAM_SMOKE_ABORT_GUARD_REJECTED');
	}
	const evidence = await verifyTelegramPreviewSmoke({
		database: input.database,
		target: input.target,
		cohortId,
	});
	if (evidence.state !== 'cancelled') fail('TELEGRAM_SMOKE_ABORT_VERIFY_FAILED');
	return evidence;
}

async function verifiedUnknownSmokeOrNull(input: {
	database: SqlDatabaseBoundary;
	target: VerifiedTelegramPreviewTarget;
	cohortId: string;
}): Promise<TelegramPreviewSmokeEvidence | null> {
	try {
		const evidence = await verifyTelegramPreviewSmoke(input);
		return evidence.state === 'delivery_unknown' ? evidence : null;
	} catch {
		return null;
	}
}

async function assertExpiredSmokeDispatchContract(input: {
	state: SmokeReconcileStateRow;
	target: VerifiedTelegramPreviewTarget;
	cohortId: string;
	outboxId: string;
	dedupeKey: string;
	now: string;
}): Promise<{ attemptId: string; leaseOwner: string }> {
	const { state } = input;
	if (!state.locked_at || !state.lease_owner || !state.lease_until || !state.attempt_id) {
		fail('TELEGRAM_SMOKE_RECONCILE_PROOF_INVALID');
	}
	assertInstant(state.created_at, 'TELEGRAM_SMOKE_RECONCILE_PROOF_INVALID');
	assertInstant(state.locked_at, 'TELEGRAM_SMOKE_RECONCILE_PROOF_INVALID');
	assertInstant(state.lease_until, 'TELEGRAM_SMOKE_RECONCILE_PROOF_INVALID');
	const expectedLeaseOwner = `telegram-preview-smoke:${input.cohortId}`;
	const expectedLeaseUntil = new Date(
		Date.parse(state.locked_at) + input.target.manifest.binding.outboxLeaseSeconds * 1_000
	).toISOString();
	const expectedAuthorizationId = deterministicUuid(
		`telegram-preview-smoke-claim-auth-v1\0${input.outboxId}\0${expectedLeaseOwner}`
	);
	const expectedAssertionId = deterministicUuid(
		`telegram-preview-smoke-claim-assertion-v1\0${expectedAuthorizationId}`
	);
	const expectedRequestHash = smokeClaimRequestHash({
		outboxId: input.outboxId,
		sourceId: input.cohortId,
		dedupeKey: input.dedupeKey,
		targetFingerprint: input.target.fingerprintSha256,
		activationAt: input.target.manifest.binding.telegramActivationAt,
		leaseOwner: expectedLeaseOwner,
		lockedAt: state.locked_at,
		leaseUntil: state.lease_until,
	});
	const expectedDeliveryReference = await telegramDeliveryReference(input.dedupeKey);
	const attemptTerminalShapeValid =
		(state.attempt_state === 'dispatch_started' &&
			state.attempt_safe_error_code === null &&
			state.attempt_provider_request_id === null &&
			state.attempt_finished_at === null &&
			state.attempt_resolved_at === null &&
			state.attempt_updated_at === state.attempt_started_at) ||
		(state.attempt_state === 'delivery_unknown' &&
			state.attempt_safe_error_code === 'TELEGRAM_DELIVERY_UNKNOWN' &&
			state.attempt_provider_request_id === null &&
			state.attempt_finished_at !== null &&
			state.attempt_resolved_at === null &&
			state.attempt_updated_at === state.attempt_finished_at);
	if (
		state.id_count !== 1 ||
		state.dedupe_count !== 1 ||
		state.source_count !== 1 ||
		state.id !== input.outboxId ||
		state.source_kind !== 'support_thread' ||
		state.source_id !== input.cohortId ||
		state.template_or_category !== 'bureau.support' ||
		state.destination_ref !== 'bureau' ||
		state.locale !== 'de' ||
		state.payload_json !== syntheticPayload(input.cohortId, state.created_at) ||
		state.dedupe_key !== input.dedupeKey ||
		state.status !== 'processing' ||
		state.attempts !== 0 ||
		state.max_attempts !== 1 ||
		state.manual_retry_count !== 0 ||
		state.next_attempt_at !== null ||
		state.last_error_code !== null ||
		state.provider_request_id !== null ||
		state.sent_at !== null ||
		state.not_before !== state.locked_at ||
		state.updated_at !== state.locked_at ||
		state.lease_owner !== expectedLeaseOwner ||
		state.lease_until !== expectedLeaseUntil ||
		state.attempt_count !== 1 ||
		state.attempt_no !== 1 ||
		state.attempt_delivery_reference !== expectedDeliveryReference ||
		state.attempt_lease_owner !== expectedLeaseOwner ||
		state.attempt_started_at !== state.locked_at ||
		state.attempt_created_at !== state.locked_at ||
		!attemptTerminalShapeValid ||
		state.claim_authorization_count !== 1 ||
		state.claim_assertion_count !== 1 ||
		state.claim_authorization_id !== expectedAuthorizationId ||
		state.claim_assertion_id !== expectedAssertionId ||
		state.claim_assertion_authorization_id !== expectedAuthorizationId ||
		state.claim_source_id !== input.cohortId ||
		state.claim_dedupe_key !== input.dedupeKey ||
		state.claim_target_fingerprint_sha256 !== input.target.fingerprintSha256 ||
		state.claim_activation_at !== input.target.manifest.binding.telegramActivationAt ||
		state.claim_lease_owner !== expectedLeaseOwner ||
		state.claim_locked_at !== state.locked_at ||
		state.claim_lease_until !== state.lease_until ||
		state.claim_reviewed_by !== input.target.manifest.reviewedBy ||
		state.claim_reason_code !== 'preview_synthetic_smoke' ||
		state.claim_request_hash_sha256 !== expectedRequestHash ||
		state.claim_provider_send_disabled !== 1 ||
		state.claim_created_at !== state.locked_at ||
		state.claim_assertion_passed !== 1 ||
		state.claim_assertion_created_at !== state.locked_at ||
		state.abort_authorization_count !== 0 ||
		state.abort_assertion_count !== 0
	) {
		fail('TELEGRAM_SMOKE_RECONCILE_PROOF_INVALID');
	}
	if (state.lease_until > input.now) fail('TELEGRAM_SMOKE_RECONCILE_LEASE_ACTIVE');
	if (state.attempt_finished_at) {
		assertInstant(state.attempt_finished_at, 'TELEGRAM_SMOKE_RECONCILE_PROOF_INVALID');
		if (state.attempt_finished_at > input.now) {
			fail('TELEGRAM_SMOKE_RECONCILE_PROOF_INVALID');
		}
	}
	return { attemptId: state.attempt_id, leaseOwner: expectedLeaseOwner };
}

export async function reconcileTelegramPreviewSmoke(input: {
	database: SqlDatabaseBoundary;
	target: VerifiedTelegramPreviewTarget;
	cohortId: string;
	now: string;
	confirmation: string;
}): Promise<TelegramPreviewSmokeEvidence> {
	const cohortId = assertCohortId(input.cohortId);
	const now = assertInstant(input.now);
	const identity = smokeIdentity(input.target, cohortId);
	const expected = expectedTelegramPreviewSmokeConfirmation({
		command: 'reconcile',
		targetFingerprint: input.target.fingerprintSha256,
		cohortId,
	});
	if (input.confirmation !== expected) fail('TELEGRAM_SMOKE_CONFIRMATION_INVALID');
	let state = await loadSmokeReconcileState(
		input.database,
		identity.outboxId,
		identity.dedupeKey,
		cohortId
	);
	if (!state) fail('TELEGRAM_SMOKE_ROW_NOT_FOUND');
	if (state.status === 'delivery_unknown') {
		const evidence = await verifyTelegramPreviewSmoke({
			database: input.database,
			target: input.target,
			cohortId,
		});
		if (evidence.state !== 'delivery_unknown') {
			fail('TELEGRAM_SMOKE_RECONCILE_VERIFY_FAILED');
		}
		return evidence;
	}
	if (state.status !== 'processing') fail('TELEGRAM_SMOKE_RECONCILE_NOT_APPLICABLE');
	let contract = await assertExpiredSmokeDispatchContract({
		state,
		target: input.target,
		cohortId,
		outboxId: identity.outboxId,
		dedupeKey: identity.dedupeKey,
		now,
	});
	if (state.attempt_state === 'dispatch_started') {
		let result: Awaited<ReturnType<SqlDatabaseBoundary['run']>> | null = null;
		try {
			result = await input.database.run({
				sql: `UPDATE telegram_delivery_attempts
				SET state = 'delivery_unknown',
					safe_error_code = 'TELEGRAM_DELIVERY_UNKNOWN',
					finished_at = ?, updated_at = ?
				WHERE id = ? AND outbox_id = ? AND attempt_no = 1
					AND lease_owner = ? AND state = 'dispatch_started'
					AND started_at = ? AND created_at = started_at
					AND provider_request_id IS NULL AND finished_at IS NULL
					AND resolved_at IS NULL`,
				params: [
					now,
					now,
					contract.attemptId,
					identity.outboxId,
					contract.leaseOwner,
					state.locked_at,
				],
			});
		} catch (error) {
			const readback = await loadSmokeReconcileState(
				input.database,
				identity.outboxId,
				identity.dedupeKey,
				cohortId
			).catch(() => null);
			if (readback?.attempt_state !== 'delivery_unknown') throw error;
			state = readback;
		}
		if (result && result.meta.changes !== 1) {
			state = await loadSmokeReconcileState(
				input.database,
				identity.outboxId,
				identity.dedupeKey,
				cohortId
			);
			if (state?.attempt_state !== 'delivery_unknown') {
				fail('TELEGRAM_SMOKE_RECONCILE_ATTEMPT_GUARD_REJECTED');
			}
		}
	}
	state = await loadSmokeReconcileState(
		input.database,
		identity.outboxId,
		identity.dedupeKey,
		cohortId
	);
	if (!state) fail('TELEGRAM_SMOKE_RECONCILE_STATE_UNAVAILABLE');
	contract = await assertExpiredSmokeDispatchContract({
		state,
		target: input.target,
		cohortId,
		outboxId: identity.outboxId,
		dedupeKey: identity.dedupeKey,
		now,
	});
	if (
		state.attempt_state !== 'delivery_unknown' ||
		!state.attempt_finished_at ||
		state.attempt_safe_error_code !== 'TELEGRAM_DELIVERY_UNKNOWN'
	) {
		fail('TELEGRAM_SMOKE_RECONCILE_ATTEMPT_GUARD_REJECTED');
	}
	try {
		const result = await input.database.run({
			sql: `UPDATE telegram_outbox
			SET status = 'delivery_unknown', attempts = attempts + 1,
				last_error_code = 'TELEGRAM_DELIVERY_UNKNOWN', next_attempt_at = NULL,
				locked_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = ?
			WHERE id = ? AND source_kind = 'support_thread' AND source_id = ?
				AND template_or_category = 'bureau.support' AND destination_ref = 'bureau'
				AND dedupe_key = ? AND status = 'processing' AND attempts = 0
				AND max_attempts = 1 AND manual_retry_count = 0
				AND locked_at = ? AND lease_owner = ? AND lease_until = ? AND lease_until <= ?
				AND provider_request_id IS NULL AND sent_at IS NULL
				AND EXISTS (
					SELECT 1 FROM telegram_delivery_attempts attempt
					WHERE attempt.id = ? AND attempt.outbox_id = telegram_outbox.id
						AND attempt.attempt_no = 1 AND attempt.lease_owner = ?
						AND attempt.state = 'delivery_unknown'
						AND attempt.safe_error_code = 'TELEGRAM_DELIVERY_UNKNOWN'
						AND attempt.finished_at = ? AND attempt.resolved_at IS NULL
				)`,
			params: [
				state.attempt_finished_at,
				identity.outboxId,
				cohortId,
				identity.dedupeKey,
				state.locked_at,
				contract.leaseOwner,
				state.lease_until,
				now,
				contract.attemptId,
				contract.leaseOwner,
				state.attempt_finished_at,
			],
		});
		if (result.meta.changes !== 1) {
			const readback = await verifiedUnknownSmokeOrNull({
				database: input.database,
				target: input.target,
				cohortId,
			});
			if (readback) return readback;
			fail('TELEGRAM_SMOKE_RECONCILE_OUTBOX_GUARD_REJECTED');
		}
	} catch (error) {
		const readback = await verifiedUnknownSmokeOrNull({
			database: input.database,
			target: input.target,
			cohortId,
		});
		if (readback) return readback;
		throw error;
	}
	const evidence = await verifyTelegramPreviewSmoke({
		database: input.database,
		target: input.target,
		cohortId,
	});
	if (evidence.state !== 'delivery_unknown') {
		fail('TELEGRAM_SMOKE_RECONCILE_VERIFY_FAILED');
	}
	return evidence;
}

class CohortBoundTelegramProvider implements TelegramProvider {
	private calls = 0;

	constructor(
		private readonly provider: TelegramProvider,
		private readonly expectedMessage: TelegramMessage,
		private readonly expectedDedupeKey: string
	) {}

	async send(
		message: TelegramMessage,
		context?: ProviderSendContext
	): Promise<{ providerRequestId: string }> {
		if (
			this.calls !== 0 ||
			context?.idempotencyKey !== this.expectedDedupeKey ||
			message.chatId !== this.expectedMessage.chatId ||
			message.deliveryReference !== this.expectedMessage.deliveryReference ||
			message.text !== this.expectedMessage.text
		) {
			throw new TelegramProviderError('TELEGRAM_SMOKE_COHORT_MISMATCH', false);
		}
		this.calls += 1;
		return this.provider.send(message, context);
	}
}

class CohortBoundTelegramStore implements TelegramOutboxStore {
	constructor(
		private readonly repository: OutboxRepository,
		private readonly database: SqlDatabaseBoundary,
		private readonly outboxId: string,
		private readonly sourceId: string,
		private readonly dedupeKey: string,
		private readonly targetFingerprint: string,
		private readonly activationAt: string,
		private readonly reviewedBy: string
	) {}

	async claimTelegram(input: Parameters<TelegramOutboxStore['claimTelegram']>[0]) {
		const authorizationId = deterministicUuid(
			`telegram-preview-smoke-claim-auth-v1\0${this.outboxId}\0${input.leaseOwner}`
		);
		const assertionId = deterministicUuid(
			`telegram-preview-smoke-claim-assertion-v1\0${authorizationId}`
		);
		const requestHash = smokeClaimRequestHash({
			outboxId: this.outboxId,
			sourceId: this.sourceId,
			dedupeKey: this.dedupeKey,
			targetFingerprint: this.targetFingerprint,
			activationAt: this.activationAt,
			leaseOwner: input.leaseOwner,
			lockedAt: input.now,
			leaseUntil: input.leaseUntil,
		});
		try {
			await this.database.batch([
				{
					sql: `INSERT INTO telegram_preview_smoke_claim_authorizations (
						id, outbox_id, source_id, dedupe_key, target_fingerprint_sha256,
						activation_at, lease_owner, locked_at, lease_until, reviewed_by,
						reason_code, request_hash_sha256, provider_send_disabled, created_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
						'preview_synthetic_smoke', ?, 1, ?)`,
					params: [
						authorizationId,
						this.outboxId,
						this.sourceId,
						this.dedupeKey,
						this.targetFingerprint,
						this.activationAt,
						input.leaseOwner,
						input.now,
						input.leaseUntil,
						this.reviewedBy,
						requestHash,
						input.now,
					],
				},
				{
					sql: `UPDATE telegram_outbox SET status = 'processing', not_before = ?,
						locked_at = ?, lease_owner = ?, lease_until = ?, updated_at = ?
			WHERE id = ? AND status = 'pending' AND attempts = 0
				AND max_attempts = 1 AND not_before = ? AND lease_owner IS NULL
				AND source_kind = 'support_thread' AND source_id = ?
				AND template_or_category = 'bureau.support' AND dedupe_key = ?
				AND created_at >= ?
				AND NOT EXISTS (
					SELECT 1 FROM operation_locks cooldown
					WHERE cooldown.scope = 'provider-cooldown'
						AND cooldown.resource_key = 'telegram:' || telegram_outbox.destination_ref
						AND cooldown.lease_until > ?
				)
				AND NOT EXISTS (
					SELECT 1 FROM telegram_outbox
					WHERE id <> ? AND status IN ('pending', 'processing', 'retry', 'dead')
				)
				AND NOT EXISTS (
					SELECT 1 FROM telegram_delivery_attempts
					WHERE outbox_id <> ? AND state = 'delivery_unknown' AND resolved_at IS NULL
				)`,
					params: [
						input.now,
						input.now,
						input.leaseOwner,
						input.leaseUntil,
						input.now,
						this.outboxId,
						TELEGRAM_SMOKE_DISARMED_NOT_BEFORE,
						this.sourceId,
						this.dedupeKey,
						this.activationAt,
						input.now,
						this.outboxId,
						this.outboxId,
					],
				},
				{
					sql: `INSERT INTO telegram_preview_smoke_claim_assertions (
						id, authorization_id, outbox_id, assertion_passed, created_at
					) SELECT ?, authorization.id, outbox.id, 1, ?
					FROM telegram_preview_smoke_claim_authorizations authorization
					JOIN telegram_outbox outbox ON outbox.id = authorization.outbox_id
					WHERE authorization.id = ? AND authorization.outbox_id = ?
						AND authorization.source_id = ? AND authorization.dedupe_key = ?
						AND authorization.target_fingerprint_sha256 = ?
						AND authorization.activation_at = ?
						AND authorization.locked_at = ? AND authorization.lease_owner = ?
						AND authorization.lease_until = ? AND authorization.provider_send_disabled = 1
						AND outbox.status = 'processing' AND outbox.not_before = authorization.locked_at
						AND outbox.locked_at = authorization.locked_at
						AND outbox.lease_owner = authorization.lease_owner
						AND outbox.lease_until = authorization.lease_until`,
					params: [
						assertionId,
						input.now,
						authorizationId,
						this.outboxId,
						this.sourceId,
						this.dedupeKey,
						this.targetFingerprint,
						this.activationAt,
						input.now,
						input.leaseOwner,
						input.leaseUntil,
					],
				},
			]);
		} catch {
			return null;
		}
		return this.database.first<TelegramOutboxRow>({
			sql: `SELECT id, source_kind, source_id, template_or_category,
				destination_ref, locale, payload_json, dedupe_key, attempts,
				max_attempts, lease_owner
			FROM telegram_outbox
			WHERE id = ? AND status = 'processing' AND lease_owner = ?`,
			params: [this.outboxId, input.leaseOwner],
		});
	}

	reconcileStaleTelegramDispatches = (now: string) =>
		this.repository.reconcileStaleTelegramDispatches(now);
	countUnresolvedTelegramDeliveries = () => this.repository.countUnresolvedTelegramDeliveries();
	countTerminalTelegramFailures = () => this.repository.countTerminalTelegramFailures();
	deferTelegram = (input: Parameters<TelegramOutboxStore['deferTelegram']>[0]) =>
		this.repository.deferTelegram(input);
	markTelegramSent = (input: Parameters<TelegramOutboxStore['markTelegramSent']>[0]) =>
		this.repository.markTelegramSent(input);
	startTelegramDispatch = (input: Parameters<TelegramOutboxStore['startTelegramDispatch']>[0]) =>
		this.repository.startTelegramDispatch(input);
	markTelegramNotDelivered = (
		input: Parameters<TelegramOutboxStore['markTelegramNotDelivered']>[0]
	) => this.repository.markTelegramNotDelivered(input);
	markTelegramFailed = (input: Parameters<TelegramOutboxStore['markTelegramFailed']>[0]) =>
		this.repository.markTelegramFailed(input);
	markTelegramUnknown = (input: Parameters<TelegramOutboxStore['markTelegramUnknown']>[0]) =>
		this.repository.markTelegramUnknown(input);
}

export async function runTelegramPreviewSmoke(input: {
	database: SqlDatabaseBoundary;
	provider: TelegramProvider;
	chatId: string;
	target: VerifiedTelegramPreviewTarget;
	cohortId: string;
	confirmation: string;
	preflight: () => Promise<TelegramPreflightResult>;
	clock?: () => string;
}): Promise<TelegramPreviewSmokeEvidence> {
	const cohortId = assertCohortId(input.cohortId);
	const identity = smokeIdentity(input.target, cohortId);
	const expected = expectedTelegramPreviewSmokeConfirmation({
		command: 'run',
		targetFingerprint: input.target.fingerprintSha256,
		cohortId,
	});
	if (input.confirmation !== expected) fail('TELEGRAM_SMOKE_CONFIRMATION_INVALID');
	const prepared = await verifyTelegramPreviewSmoke({
		database: input.database,
		target: input.target,
		cohortId,
	});
	if (prepared.state !== 'prepared') fail('TELEGRAM_SMOKE_NOT_PREPARED');
	assertNoQueueHazards(await queueHazards(input.database, identity.outboxId));
	const clock = input.clock ?? (() => new Date().toISOString());
	const now = assertInstant(clock());
	const binding = input.target.manifest.binding;
	if (binding.telegramActivationAt && binding.telegramActivationAt > now) {
		fail('TELEGRAM_SMOKE_PROVIDER_NOT_ACTIVATED');
	}
	const schedule = parseBusinessHours(
		binding.telegramBusinessTimezone,
		binding.telegramBusinessHours
	);
	if (nextBusinessWindow(now, schedule) !== now) fail('TELEGRAM_SMOKE_OUTSIDE_BUSINESS_HOURS');
	const preflight = await input.preflight();
	if (
		preflight.botIdentityVerified !== true ||
		preflight.destinationVerified !== true ||
		preflight.postingPermissionVerified !== true ||
		preflight.webhookDisabled !== true ||
		preflight.chatType !== binding.telegramChatType
	) {
		fail('TELEGRAM_SMOKE_PREFLIGHT_INVALID');
	}
	const row = await input.database.first<SmokeStoredRow>({
		sql: 'SELECT * FROM telegram_outbox WHERE id = ?',
		params: [identity.outboxId],
	});
	if (!row) fail('TELEGRAM_SMOKE_ROW_NOT_FOUND');
	const expectedMessage = await renderTelegramTemplate({
		row: { ...row, lease_owner: row.lease_owner ?? '' },
		config: { portalPublicOrigin: binding.portalPublicOrigin },
		chatId: input.chatId,
	});
	const repository = new OutboxRepository(input.database);
	const cohortStore = new CohortBoundTelegramStore(
		repository,
		input.database,
		identity.outboxId,
		cohortId,
		identity.dedupeKey,
		input.target.fingerprintSha256,
		binding.telegramActivationAt,
		input.target.manifest.reviewedBy
	);
	const provider = new CohortBoundTelegramProvider(
		input.provider,
		expectedMessage,
		identity.dedupeKey
	);
	const worker = new TelegramOutboxWorker(
		cohortStore,
		provider,
		input.chatId,
		{ portalPublicOrigin: binding.portalPublicOrigin },
		schedule,
		{
			leaseSeconds: binding.outboxLeaseSeconds,
			retryBaseSeconds: binding.outboxRetryBaseSeconds,
			retryMaxSeconds: binding.outboxRetryMaxSeconds,
			maxAttempts: 1,
			activationAt: binding.telegramActivationAt,
		},
		`telegram-preview-smoke:${cohortId}`,
		clock
	);
	const outcome = await worker.dispatchNext(now);
	if (outcome !== 'sent' && outcome !== 'delivery_unknown') {
		fail(`TELEGRAM_SMOKE_DISPATCH_${outcome.toUpperCase()}`);
	}
	const evidence = await verifyTelegramPreviewSmoke({
		database: input.database,
		target: input.target,
		cohortId,
	});
	if (evidence.state !== outcome) fail('TELEGRAM_SMOKE_OUTCOME_MISMATCH');
	return { ...evidence, preflightVerified: true };
}

export function telegramPreviewSmokeFailure(error: unknown): { ok: false; errorCode: string } {
	const candidate =
		error instanceof TelegramPreviewSmokeError ||
		error instanceof TelegramPreviewTargetError ||
		error instanceof RemoteD1Error ||
		error instanceof TelegramProviderError
			? error.code
			: '';
	return {
		ok: false,
		errorCode: /^[A-Z0-9_]{1,120}$/u.test(candidate)
			? candidate
			: 'TELEGRAM_PREVIEW_SMOKE_FAILED',
	};
}

function printSafe(
	value: TelegramPreviewSmokeEvidence | ReturnType<typeof telegramPreviewSmokeFailure>
): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
	const arguments_ = parseTelegramPreviewSmokeArguments(process.argv.slice(2));
	const target = await loadTelegramPreviewTarget(
		arguments_.configPath,
		arguments_.targetManifestPath,
		arguments_.deploymentEvidencePath
	);
	if (arguments_.command === 'target') {
		printSafe({
			ok: true,
			state: 'target_verified',
			targetFingerprint: target.fingerprintSha256,
		});
		return;
	}
	const cohortId = assertCohortId(arguments_.cohortId);
	if (arguments_.command === 'verify') {
		if (arguments_.confirmation !== TELEGRAM_SMOKE_VERIFY_CONFIRMATION) {
			fail('TELEGRAM_SMOKE_CONFIRMATION_INVALID');
		}
	} else {
		const expected = expectedTelegramPreviewSmokeConfirmation({
			command: arguments_.command,
			targetFingerprint: target.fingerprintSha256,
			cohortId,
		});
		if (arguments_.confirmation !== expected) fail('TELEGRAM_SMOKE_CONFIRMATION_INVALID');
	}
	const apiToken = process.env.CLOUDFLARE_API_TOKEN;
	if (!apiToken) fail('TELEGRAM_SMOKE_CLOUDFLARE_API_TOKEN_REQUIRED');
	const database = new RemoteD1Boundary(
		{
			accountId: target.manifest.binding.accountId,
			databaseId: target.manifest.binding.databaseId,
		},
		apiToken
	);
	if (arguments_.command === 'prepare') {
		printSafe(
			await prepareTelegramPreviewSmoke({
				database,
				target,
				cohortId,
				now: new Date().toISOString(),
				confirmation: arguments_.confirmation,
			})
		);
		return;
	}
	if (arguments_.command === 'abort') {
		printSafe(
			await abortTelegramPreviewSmoke({
				database,
				target,
				cohortId,
				now: new Date().toISOString(),
				confirmation: arguments_.confirmation,
			})
		);
		return;
	}
	if (arguments_.command === 'reconcile') {
		printSafe(
			await reconcileTelegramPreviewSmoke({
				database,
				target,
				cohortId,
				now: new Date().toISOString(),
				confirmation: arguments_.confirmation,
			})
		);
		return;
	}
	if (arguments_.command === 'verify') {
		printSafe(await verifyTelegramPreviewSmoke({ database, target, cohortId }));
		return;
	}
	const secrets = assertTelegramPreviewSecretBinding(
		target,
		process.env as TelegramPreviewSmokeEnvironment
	);
	const provider = new TelegramBotApiProvider({
		token: secrets.token,
		chatId: secrets.chatId,
		chatType: secrets.chatType,
		timeoutMs: target.manifest.binding.telegramBotApiTimeoutMs,
	});
	printSafe(
		await runTelegramPreviewSmoke({
			database,
			provider,
			chatId: secrets.chatId,
			target,
			cohortId,
			confirmation: arguments_.confirmation,
			preflight: () => provider.preflight(),
		})
	);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
	main().catch((error: unknown) => {
		printSafe(telegramPreviewSmokeFailure(error));
		process.exitCode = 1;
	});
}

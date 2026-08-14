import { createHash, createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, lstat, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { unstable_readConfig } from 'wrangler';
import {
	isTelegramChatId,
	type TelegramBureauChatType,
	TELEGRAM_BOT_API_MAX_TIMEOUT_MS,
	TELEGRAM_BOT_API_MIN_TIMEOUT_MS,
} from '../src/lib/server/telegram/bot-api';

export const TELEGRAM_PREVIEW_TARGET_MANIFEST_PURPOSE = 'telegram-preview-smoke';
export const TELEGRAM_PREVIEW_DEPLOYMENT_EVIDENCE_PURPOSE =
	'telegram-preview-deployment-observation';
const executeFile = promisify(execFile);

interface TelegramPreviewWranglerConfig {
	name?: string;
	account_id?: string;
	vars?: Record<string, unknown>;
	d1_databases?: Array<{
		binding: string;
		database_name?: string;
		database_id?: string;
		preview_database_id?: string;
	}>;
}

export interface TelegramPreviewConfigBinding {
	appEnvironment: 'preview';
	workerName: string;
	accountId: string;
	databaseName: string;
	databaseId: string;
	portalPublicOrigin: string;
	authPublicEnabled: false;
	contractSendEnabled: false;
	scheduledJobsEnabled: false;
	emailProvider: 'disabled';
	telegramProvider: 'bot_api';
	telegramChatType: TelegramBureauChatType;
	telegramBotApiTimeoutMs: number;
	telegramMaxAttempts: number;
	outboxLeaseSeconds: number;
	outboxRetryBaseSeconds: number;
	outboxRetryMaxSeconds: number;
	telegramBusinessTimezone: string;
	telegramBusinessHours: string;
	telegramActivationAt: string;
}

export interface TelegramPreviewTargetManifest {
	schemaVersion: 1;
	purpose: typeof TELEGRAM_PREVIEW_TARGET_MANIFEST_PURPOSE;
	binding: TelegramPreviewConfigBinding;
	chatIdHmacSha256: string;
	botIdHmacSha256: string;
	candidateGitCommitSha: string;
	deployedWorkerVersionId: string;
	deploymentEvidenceSha256: string;
	reviewedAt: string;
	reviewedBy: string;
}

export interface VerifiedTelegramPreviewTarget {
	manifest: TelegramPreviewTargetManifest;
	fingerprintSha256: string;
}

export interface TelegramPreviewDeploymentEvidence {
	schemaVersion: 1;
	purpose: typeof TELEGRAM_PREVIEW_DEPLOYMENT_EVIDENCE_PURPOSE;
	accountId: string;
	workerName: string;
	workerVersionId: string;
	candidateGitCommitSha: string;
	observedAt: string;
	observedBy: string;
}

export interface TelegramPreviewDeploymentEvidenceInput {
	APP_ENV?: string;
	TELEGRAM_DEPLOYMENT_ACCOUNT_ID?: string;
	TELEGRAM_DEPLOYMENT_WORKER_NAME?: string;
	TELEGRAM_DEPLOYMENT_WORKER_VERSION_ID?: string;
	TELEGRAM_DEPLOYMENT_GIT_SHA?: string;
	TELEGRAM_DEPLOYMENT_OBSERVED_AT?: string;
	TELEGRAM_DEPLOYMENT_OBSERVED_BY?: string;
}

export interface TelegramPreviewSecretEnvironment {
	APP_ENV?: string;
	TELEGRAM_BOT_TOKEN?: string;
	TELEGRAM_CHAT_ID?: string;
	TELEGRAM_CHAT_TYPE?: string;
	TELEGRAM_TARGET_BINDING_KEY?: string;
}

export interface TelegramPreviewTargetDraftInput extends TelegramPreviewSecretEnvironment {
	config: TelegramPreviewWranglerConfig;
	deploymentEvidence: unknown;
	reviewedAt: string;
	reviewedBy: string;
}

export interface TelegramPreviewTargetDraftResult {
	targetFingerprint: string;
	manifestJson: string;
}

export class TelegramPreviewTargetError extends Error {
	constructor(readonly code: string) {
		super('Telegram preview target verification failed.');
		this.name = 'TelegramPreviewTargetError';
	}
}

function fail(code: string): never {
	throw new TelegramPreviewTargetError(code);
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, canonicalize(child)])
		);
	}
	return value;
}

function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function telegramChatIdHmacSha256(chatId: string, bindingKey: string): string {
	if (!isTelegramChatId(chatId)) fail('TELEGRAM_TARGET_CHAT_ID_INVALID');
	if (bindingKey.length < 32 || bindingKey.length > 1024) {
		fail('TELEGRAM_TARGET_BINDING_KEY_INVALID');
	}
	return createHmac('sha256', bindingKey)
		.update(`telegram-chat-id-binding-v1\0${chatId}`, 'utf8')
		.digest('hex');
}

export function telegramBotIdHmacSha256(token: string, bindingKey: string): string {
	const match = /^([1-9]\d{4,}):[A-Za-z0-9_-]{20,}$/u.exec(token);
	if (!match || !Number.isSafeInteger(Number(match[1]))) {
		fail('TELEGRAM_TARGET_BOT_TOKEN_INVALID');
	}
	if (bindingKey.length < 32 || bindingKey.length > 1024) {
		fail('TELEGRAM_TARGET_BINDING_KEY_INVALID');
	}
	return createHmac('sha256', bindingKey)
		.update(`telegram-bot-id-binding-v1\0${match[1]}`, 'utf8')
		.digest('hex');
}

function exactKeys(
	value: Record<string, unknown>,
	expected: readonly string[],
	code: string
): void {
	const actual = Object.keys(value).sort();
	const wanted = [...expected].sort();
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		fail(code);
	}
}

function record(value: unknown, code: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
	return value as Record<string, unknown>;
}

function exactString(value: unknown, pattern: RegExp, code: string): string {
	if (typeof value !== 'string' || !pattern.test(value)) fail(code);
	return value;
}

function exactUtcInstant(value: unknown, code: string): string {
	if (
		typeof value !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
		Number.isNaN(Date.parse(value)) ||
		new Date(value).toISOString() !== value
	) {
		fail(code);
	}
	return value;
}

function exactInteger(value: unknown, minimum: number, maximum: number, code: string): number {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && /^\d+$/u.test(value)
				? Number(value)
				: Number.NaN;
	if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) fail(code);
	return parsed;
}

function exactChatType(value: unknown): TelegramBureauChatType {
	if (value !== 'group' && value !== 'supergroup' && value !== 'channel') {
		fail('TELEGRAM_TARGET_CHAT_TYPE_INVALID');
	}
	return value;
}

function exactOrigin(value: unknown): string {
	if (typeof value !== 'string') fail('TELEGRAM_TARGET_ORIGIN_INVALID');
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		fail('TELEGRAM_TARGET_ORIGIN_INVALID');
	}
	if (
		parsed.protocol !== 'https:' ||
		parsed.username ||
		parsed.password ||
		parsed.pathname !== '/' ||
		parsed.search ||
		parsed.hash ||
		parsed.origin !== value
	) {
		fail('TELEGRAM_TARGET_ORIGIN_INVALID');
	}
	return parsed.origin;
}

function requiredVariable(vars: Record<string, unknown>, key: string): unknown {
	if (!(key in vars)) fail(`TELEGRAM_TARGET_${key}_REQUIRED`);
	return vars[key];
}

function requiredFalse(vars: Record<string, unknown>, key: string): false {
	if (requiredVariable(vars, key) !== 'false') {
		fail(`TELEGRAM_TARGET_${key}_MUST_BE_FALSE`);
	}
	return false;
}

export function deriveTelegramPreviewConfigBinding(
	config: TelegramPreviewWranglerConfig
): TelegramPreviewConfigBinding {
	const vars = config.vars ?? {};
	if (vars.APP_ENV !== 'preview') fail('TELEGRAM_TARGET_ENVIRONMENT_MISMATCH');
	if (vars.TELEGRAM_PROVIDER !== 'bot_api') fail('TELEGRAM_TARGET_PROVIDER_NOT_BOT_API');
	const workerName = exactString(
		config.name,
		/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u,
		'TELEGRAM_TARGET_WORKER_NAME_INVALID'
	);
	const accountId = exactString(
		config.account_id,
		/^[0-9a-f]{32}$/iu,
		'TELEGRAM_TARGET_ACCOUNT_ID_INVALID'
	).toLowerCase();
	const databases = config.d1_databases ?? [];
	if (databases.length !== 1 || databases[0].binding !== 'DB') {
		fail('TELEGRAM_TARGET_DATABASE_BINDING_INVALID');
	}
	const database = databases[0];
	if (database.preview_database_id) fail('TELEGRAM_TARGET_DATABASE_SELECTOR_AMBIGUOUS');
	const databaseId = exactString(
		database.database_id,
		/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu,
		'TELEGRAM_TARGET_DATABASE_ID_INVALID'
	).toLowerCase();
	const databaseName = exactString(
		database.database_name,
		/^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,126}[A-Za-z0-9])?$/u,
		'TELEGRAM_TARGET_DATABASE_NAME_INVALID'
	);
	if (databaseName.toLowerCase() === databaseId) {
		fail('TELEGRAM_TARGET_DATABASE_SELECTOR_AMBIGUOUS');
	}
	const timeoutMs = exactInteger(
		requiredVariable(vars, 'TELEGRAM_BOT_API_TIMEOUT_MS'),
		TELEGRAM_BOT_API_MIN_TIMEOUT_MS,
		TELEGRAM_BOT_API_MAX_TIMEOUT_MS,
		'TELEGRAM_TARGET_TIMEOUT_INVALID'
	);
	const leaseSeconds = exactInteger(
		requiredVariable(vars, 'OUTBOX_LEASE_SECONDS'),
		5,
		86_400,
		'TELEGRAM_TARGET_LEASE_INVALID'
	);
	if (timeoutMs >= leaseSeconds * 1_000) fail('TELEGRAM_TARGET_TIMEOUT_LEASE_INVALID');
	const retryBaseSeconds = exactInteger(
		requiredVariable(vars, 'OUTBOX_RETRY_BASE_SECONDS'),
		1,
		86_400,
		'TELEGRAM_TARGET_RETRY_BASE_INVALID'
	);
	const retryMaxSeconds = exactInteger(
		requiredVariable(vars, 'OUTBOX_RETRY_MAX_SECONDS'),
		1,
		604_800,
		'TELEGRAM_TARGET_RETRY_MAX_INVALID'
	);
	if (retryBaseSeconds > retryMaxSeconds) fail('TELEGRAM_TARGET_RETRY_RANGE_INVALID');
	const telegramActivationAt = exactUtcInstant(
		requiredVariable(vars, 'TELEGRAM_ACTIVATION_AT'),
		'TELEGRAM_TARGET_ACTIVATION_INVALID'
	);
	return {
		appEnvironment: 'preview',
		workerName,
		accountId,
		databaseName,
		databaseId,
		portalPublicOrigin: exactOrigin(requiredVariable(vars, 'PORTAL_PUBLIC_ORIGIN')),
		authPublicEnabled: requiredFalse(vars, 'AUTH_PUBLIC_ENABLED'),
		contractSendEnabled: requiredFalse(vars, 'CONTRACT_SEND_ENABLED'),
		scheduledJobsEnabled: requiredFalse(vars, 'SCHEDULED_JOBS_ENABLED'),
		emailProvider:
			vars.EMAIL_PROVIDER === 'disabled'
				? 'disabled'
				: fail('TELEGRAM_TARGET_EMAIL_PROVIDER_MUST_BE_DISABLED'),
		telegramProvider: 'bot_api',
		telegramChatType: exactChatType(requiredVariable(vars, 'TELEGRAM_CHAT_TYPE')),
		telegramBotApiTimeoutMs: timeoutMs,
		telegramMaxAttempts: exactInteger(
			requiredVariable(vars, 'TELEGRAM_MAX_ATTEMPTS'),
			1,
			100,
			'TELEGRAM_TARGET_MAX_ATTEMPTS_INVALID'
		),
		outboxLeaseSeconds: leaseSeconds,
		outboxRetryBaseSeconds: retryBaseSeconds,
		outboxRetryMaxSeconds: retryMaxSeconds,
		telegramBusinessTimezone: exactString(
			requiredVariable(vars, 'TELEGRAM_BUSINESS_TIMEZONE'),
			/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/u,
			'TELEGRAM_TARGET_BUSINESS_TIMEZONE_INVALID'
		),
		telegramBusinessHours: exactString(
			requiredVariable(vars, 'TELEGRAM_BUSINESS_HOURS'),
			/^(?:Su|Mo|Tu|We|Th|Fr|Sa)-(?:Su|Mo|Tu|We|Th|Fr|Sa) \d{2}:\d{2}-\d{2}:\d{2}$/u,
			'TELEGRAM_TARGET_BUSINESS_HOURS_INVALID'
		),
		telegramActivationAt,
	};
}

export function parseTelegramPreviewTargetManifest(value: unknown): TelegramPreviewTargetManifest {
	const root = record(value, 'TELEGRAM_TARGET_MANIFEST_INVALID');
	exactKeys(
		root,
		[
			'schemaVersion',
			'purpose',
			'binding',
			'chatIdHmacSha256',
			'botIdHmacSha256',
			'candidateGitCommitSha',
			'deployedWorkerVersionId',
			'deploymentEvidenceSha256',
			'reviewedAt',
			'reviewedBy',
		],
		'TELEGRAM_TARGET_MANIFEST_KEYS_INVALID'
	);
	if (root.schemaVersion !== 1) fail('TELEGRAM_TARGET_MANIFEST_VERSION_INVALID');
	if (root.purpose !== TELEGRAM_PREVIEW_TARGET_MANIFEST_PURPOSE) {
		fail('TELEGRAM_TARGET_MANIFEST_PURPOSE_INVALID');
	}
	const binding = record(root.binding, 'TELEGRAM_TARGET_MANIFEST_BINDING_INVALID');
	exactKeys(
		binding,
		[
			'appEnvironment',
			'workerName',
			'accountId',
			'databaseName',
			'databaseId',
			'portalPublicOrigin',
			'authPublicEnabled',
			'contractSendEnabled',
			'scheduledJobsEnabled',
			'emailProvider',
			'telegramProvider',
			'telegramChatType',
			'telegramBotApiTimeoutMs',
			'telegramMaxAttempts',
			'outboxLeaseSeconds',
			'outboxRetryBaseSeconds',
			'outboxRetryMaxSeconds',
			'telegramBusinessTimezone',
			'telegramBusinessHours',
			'telegramActivationAt',
		],
		'TELEGRAM_TARGET_MANIFEST_BINDING_KEYS_INVALID'
	);
	const manifestBinding: TelegramPreviewConfigBinding = {
		appEnvironment:
			binding.appEnvironment === 'preview'
				? 'preview'
				: fail('TELEGRAM_TARGET_MANIFEST_ENVIRONMENT_INVALID'),
		workerName: exactString(
			binding.workerName,
			/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u,
			'TELEGRAM_TARGET_MANIFEST_WORKER_INVALID'
		),
		accountId: exactString(
			binding.accountId,
			/^[0-9a-f]{32}$/u,
			'TELEGRAM_TARGET_MANIFEST_ACCOUNT_INVALID'
		),
		databaseName: exactString(
			binding.databaseName,
			/^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,126}[A-Za-z0-9])?$/u,
			'TELEGRAM_TARGET_MANIFEST_DATABASE_NAME_INVALID'
		),
		databaseId: exactString(
			binding.databaseId,
			/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u,
			'TELEGRAM_TARGET_MANIFEST_DATABASE_ID_INVALID'
		),
		portalPublicOrigin: exactOrigin(binding.portalPublicOrigin),
		authPublicEnabled:
			binding.authPublicEnabled === false
				? false
				: fail('TELEGRAM_TARGET_MANIFEST_AUTH_MUST_BE_DISABLED'),
		contractSendEnabled:
			binding.contractSendEnabled === false
				? false
				: fail('TELEGRAM_TARGET_MANIFEST_CONTRACT_MUST_BE_DISABLED'),
		scheduledJobsEnabled:
			binding.scheduledJobsEnabled === false
				? false
				: fail('TELEGRAM_TARGET_MANIFEST_SCHEDULER_MUST_BE_DISABLED'),
		emailProvider:
			binding.emailProvider === 'disabled'
				? 'disabled'
				: fail('TELEGRAM_TARGET_MANIFEST_EMAIL_PROVIDER_MUST_BE_DISABLED'),
		telegramProvider:
			binding.telegramProvider === 'bot_api'
				? 'bot_api'
				: fail('TELEGRAM_TARGET_MANIFEST_PROVIDER_INVALID'),
		telegramChatType: exactChatType(binding.telegramChatType),
		telegramBotApiTimeoutMs: exactInteger(
			binding.telegramBotApiTimeoutMs,
			TELEGRAM_BOT_API_MIN_TIMEOUT_MS,
			TELEGRAM_BOT_API_MAX_TIMEOUT_MS,
			'TELEGRAM_TARGET_MANIFEST_TIMEOUT_INVALID'
		),
		telegramMaxAttempts: exactInteger(
			binding.telegramMaxAttempts,
			1,
			100,
			'TELEGRAM_TARGET_MANIFEST_MAX_ATTEMPTS_INVALID'
		),
		outboxLeaseSeconds: exactInteger(
			binding.outboxLeaseSeconds,
			5,
			86_400,
			'TELEGRAM_TARGET_MANIFEST_LEASE_INVALID'
		),
		outboxRetryBaseSeconds: exactInteger(
			binding.outboxRetryBaseSeconds,
			1,
			86_400,
			'TELEGRAM_TARGET_MANIFEST_RETRY_BASE_INVALID'
		),
		outboxRetryMaxSeconds: exactInteger(
			binding.outboxRetryMaxSeconds,
			1,
			604_800,
			'TELEGRAM_TARGET_MANIFEST_RETRY_MAX_INVALID'
		),
		telegramBusinessTimezone: exactString(
			binding.telegramBusinessTimezone,
			/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/u,
			'TELEGRAM_TARGET_MANIFEST_BUSINESS_TIMEZONE_INVALID'
		),
		telegramBusinessHours: exactString(
			binding.telegramBusinessHours,
			/^(?:Su|Mo|Tu|We|Th|Fr|Sa)-(?:Su|Mo|Tu|We|Th|Fr|Sa) \d{2}:\d{2}-\d{2}:\d{2}$/u,
			'TELEGRAM_TARGET_MANIFEST_BUSINESS_HOURS_INVALID'
		),
		telegramActivationAt: exactUtcInstant(
			binding.telegramActivationAt,
			'TELEGRAM_TARGET_MANIFEST_ACTIVATION_INVALID'
		),
	};
	if (manifestBinding.telegramBotApiTimeoutMs >= manifestBinding.outboxLeaseSeconds * 1_000) {
		fail('TELEGRAM_TARGET_MANIFEST_TIMEOUT_LEASE_INVALID');
	}
	if (manifestBinding.outboxRetryBaseSeconds > manifestBinding.outboxRetryMaxSeconds) {
		fail('TELEGRAM_TARGET_MANIFEST_RETRY_RANGE_INVALID');
	}
	return {
		schemaVersion: 1,
		purpose: TELEGRAM_PREVIEW_TARGET_MANIFEST_PURPOSE,
		binding: manifestBinding,
		chatIdHmacSha256: exactString(
			root.chatIdHmacSha256,
			/^[0-9a-f]{64}$/u,
			'TELEGRAM_TARGET_MANIFEST_CHAT_HASH_INVALID'
		),
		botIdHmacSha256: exactString(
			root.botIdHmacSha256,
			/^[0-9a-f]{64}$/u,
			'TELEGRAM_TARGET_MANIFEST_BOT_HASH_INVALID'
		),
		candidateGitCommitSha: exactString(
			root.candidateGitCommitSha,
			/^[0-9a-f]{40}$/u,
			'TELEGRAM_TARGET_MANIFEST_GIT_SHA_INVALID'
		),
		deployedWorkerVersionId: exactString(
			root.deployedWorkerVersionId,
			/^(?:[0-9a-f]{32}|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/u,
			'TELEGRAM_TARGET_MANIFEST_WORKER_VERSION_INVALID'
		),
		deploymentEvidenceSha256: exactString(
			root.deploymentEvidenceSha256,
			/^[0-9a-f]{64}$/u,
			'TELEGRAM_TARGET_MANIFEST_DEPLOYMENT_EVIDENCE_INVALID'
		),
		reviewedAt: exactUtcInstant(
			root.reviewedAt,
			'TELEGRAM_TARGET_MANIFEST_REVIEW_TIME_INVALID'
		),
		reviewedBy: exactString(
			root.reviewedBy,
			/^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,99}$/u,
			'TELEGRAM_TARGET_MANIFEST_REVIEWER_INVALID'
		),
	};
}

export function verifyTelegramPreviewTarget(input: {
	config: TelegramPreviewWranglerConfig;
	manifest: unknown;
}): VerifiedTelegramPreviewTarget {
	const manifest = parseTelegramPreviewTargetManifest(input.manifest);
	const derived = deriveTelegramPreviewConfigBinding(input.config);
	if (canonicalJson(derived) !== canonicalJson(manifest.binding)) {
		fail('TELEGRAM_TARGET_CONFIG_MANIFEST_MISMATCH');
	}
	return {
		manifest,
		fingerprintSha256: sha256(canonicalJson(manifest)),
	};
}

export function parseTelegramPreviewDeploymentEvidence(
	value: unknown
): TelegramPreviewDeploymentEvidence {
	const evidence = record(value, 'TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_INVALID');
	exactKeys(
		evidence,
		[
			'schemaVersion',
			'purpose',
			'accountId',
			'workerName',
			'workerVersionId',
			'candidateGitCommitSha',
			'observedAt',
			'observedBy',
		],
		'TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_KEYS_INVALID'
	);
	if (evidence.schemaVersion !== 1) fail('TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_VERSION_INVALID');
	if (evidence.purpose !== TELEGRAM_PREVIEW_DEPLOYMENT_EVIDENCE_PURPOSE) {
		fail('TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_PURPOSE_INVALID');
	}
	return {
		schemaVersion: 1,
		purpose: TELEGRAM_PREVIEW_DEPLOYMENT_EVIDENCE_PURPOSE,
		accountId: exactString(
			evidence.accountId,
			/^[0-9a-f]{32}$/u,
			'TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_ACCOUNT_INVALID'
		),
		workerName: exactString(
			evidence.workerName,
			/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u,
			'TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_WORKER_INVALID'
		),
		workerVersionId: exactString(
			evidence.workerVersionId,
			/^(?:[0-9a-f]{32}|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/u,
			'TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_VERSION_ID_INVALID'
		),
		candidateGitCommitSha: exactString(
			evidence.candidateGitCommitSha,
			/^[0-9a-f]{40}$/u,
			'TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_GIT_SHA_INVALID'
		),
		observedAt: exactUtcInstant(
			evidence.observedAt,
			'TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_TIME_INVALID'
		),
		observedBy: exactString(
			evidence.observedBy,
			/^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,99}$/u,
			'TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_OBSERVER_INVALID'
		),
	};
}

export function buildTelegramPreviewDeploymentEvidence(
	input: TelegramPreviewDeploymentEvidenceInput
): TelegramPreviewDeploymentEvidence {
	if (input.APP_ENV !== 'preview') fail('TELEGRAM_TARGET_PROCESS_ENVIRONMENT_MISMATCH');
	return parseTelegramPreviewDeploymentEvidence({
		schemaVersion: 1,
		purpose: TELEGRAM_PREVIEW_DEPLOYMENT_EVIDENCE_PURPOSE,
		accountId: input.TELEGRAM_DEPLOYMENT_ACCOUNT_ID,
		workerName: input.TELEGRAM_DEPLOYMENT_WORKER_NAME,
		workerVersionId: input.TELEGRAM_DEPLOYMENT_WORKER_VERSION_ID,
		candidateGitCommitSha: input.TELEGRAM_DEPLOYMENT_GIT_SHA,
		observedAt: input.TELEGRAM_DEPLOYMENT_OBSERVED_AT,
		observedBy: input.TELEGRAM_DEPLOYMENT_OBSERVED_BY,
	});
}

export function telegramPreviewDeploymentEvidenceSha256(value: unknown): string {
	return sha256(canonicalJson(parseTelegramPreviewDeploymentEvidence(value)));
}

export function verifyTelegramPreviewDeploymentEvidence(input: {
	target: VerifiedTelegramPreviewTarget;
	evidence: unknown;
	now?: string;
}): TelegramPreviewDeploymentEvidence {
	const evidence = parseTelegramPreviewDeploymentEvidence(input.evidence);
	const { manifest } = input.target;
	if (
		evidence.accountId !== manifest.binding.accountId ||
		evidence.workerName !== manifest.binding.workerName ||
		evidence.workerVersionId !== manifest.deployedWorkerVersionId ||
		evidence.candidateGitCommitSha !== manifest.candidateGitCommitSha ||
		sha256(canonicalJson(evidence)) !== manifest.deploymentEvidenceSha256
	) {
		fail('TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_MISMATCH');
	}
	if (evidence.observedBy === manifest.reviewedBy) {
		fail('TELEGRAM_TARGET_DEPLOYMENT_REVIEW_SEPARATION_REQUIRED');
	}
	const observedAt = Date.parse(evidence.observedAt);
	const reviewedAt = Date.parse(manifest.reviewedAt);
	if (observedAt > reviewedAt || reviewedAt - observedAt > 24 * 60 * 60 * 1_000) {
		fail('TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_REVIEW_WINDOW_INVALID');
	}
	const now =
		input.now === undefined
			? Date.now()
			: Date.parse(
					exactUtcInstant(input.now, 'TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_NOW_INVALID')
				);
	if (reviewedAt > now) {
		fail('TELEGRAM_TARGET_DEPLOYMENT_REVIEW_IN_FUTURE');
	}
	if (now < observedAt || now - observedAt > 24 * 60 * 60 * 1_000) {
		fail('TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_STALE');
	}
	return evidence;
}

export function buildTelegramPreviewTargetManifest(
	input: TelegramPreviewTargetDraftInput
): TelegramPreviewTargetManifest {
	if (input.APP_ENV !== 'preview') fail('TELEGRAM_TARGET_PROCESS_ENVIRONMENT_MISMATCH');
	const token = input.TELEGRAM_BOT_TOKEN;
	const chatId = input.TELEGRAM_CHAT_ID;
	const bindingKey = input.TELEGRAM_TARGET_BINDING_KEY;
	if (!token) fail('TELEGRAM_TARGET_BOT_TOKEN_REQUIRED');
	if (!chatId || !isTelegramChatId(chatId)) fail('TELEGRAM_TARGET_CHAT_ID_INVALID');
	if (!bindingKey) fail('TELEGRAM_TARGET_BINDING_KEY_REQUIRED');
	const binding = deriveTelegramPreviewConfigBinding(input.config);
	const chatType = exactChatType(input.TELEGRAM_CHAT_TYPE);
	if (chatType !== binding.telegramChatType) fail('TELEGRAM_TARGET_CHAT_TYPE_MISMATCH');
	const deploymentEvidence = parseTelegramPreviewDeploymentEvidence(input.deploymentEvidence);
	if (
		deploymentEvidence.accountId !== binding.accountId ||
		deploymentEvidence.workerName !== binding.workerName
	) {
		fail('TELEGRAM_TARGET_DEPLOYMENT_EVIDENCE_MISMATCH');
	}
	return {
		schemaVersion: 1,
		purpose: TELEGRAM_PREVIEW_TARGET_MANIFEST_PURPOSE,
		binding,
		chatIdHmacSha256: telegramChatIdHmacSha256(chatId, bindingKey),
		botIdHmacSha256: telegramBotIdHmacSha256(token, bindingKey),
		candidateGitCommitSha: deploymentEvidence.candidateGitCommitSha,
		deployedWorkerVersionId: deploymentEvidence.workerVersionId,
		deploymentEvidenceSha256: telegramPreviewDeploymentEvidenceSha256(deploymentEvidence),
		reviewedAt: exactUtcInstant(
			input.reviewedAt,
			'TELEGRAM_TARGET_MANIFEST_REVIEW_TIME_INVALID'
		),
		reviewedBy: exactString(
			input.reviewedBy,
			/^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,99}$/u,
			'TELEGRAM_TARGET_MANIFEST_REVIEWER_INVALID'
		),
	};
}

export function buildTelegramPreviewTargetDraft(
	input: TelegramPreviewTargetDraftInput
): TelegramPreviewTargetDraftResult {
	const manifest = buildTelegramPreviewTargetManifest(input);
	return {
		targetFingerprint: sha256(canonicalJson(manifest)),
		manifestJson: `${JSON.stringify(manifest, null, 2)}\n`,
	};
}

export async function assertProtectedTelegramArtifactPath(
	artifactPath: string,
	exactName: string
): Promise<string> {
	const resolved = resolve(artifactPath);
	const importsDirectory = resolve(process.cwd(), 'imports');
	if (
		basename(resolved).toLowerCase() !== exactName ||
		dirname(resolved).toLowerCase() !== importsDirectory.toLowerCase()
	) {
		fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_PATH_INVALID');
	}
	let actual: string;
	try {
		if ((await lstat(resolved)).isSymbolicLink()) {
			fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_SYMLINK_FORBIDDEN');
		}
		actual = await realpath(resolved);
		if (dirname(actual).toLowerCase() !== (await realpath(importsDirectory)).toLowerCase()) {
			fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_PATH_INVALID');
		}
		const metadata = await stat(actual);
		if (!metadata.isFile()) fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_FILE_INVALID');
		if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
			fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_PERMISSIONS_INVALID');
		}
		if (process.platform === 'win32') {
			const script = [
				"$ErrorActionPreference = 'Stop'",
				'$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
				'$acl = Get-Acl -LiteralPath $env:KOLIBRI_TELEGRAM_ARTIFACT_PATH',
				'$ownerSid = $acl.Owner',
				'try { $ownerSid = ([System.Security.Principal.NTAccount]$acl.Owner).Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { try { $ownerSid = ([System.Security.Principal.SecurityIdentifier]$acl.Owner).Value } catch { $ownerSid = "" } }',
				'$rules = @($acl.Access)',
				'$invalid = 0',
				'$currentAllow = 0',
				'$currentFullControl = 0',
				'foreach ($rule in $rules) {',
				'  try { $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { $sid = "" }',
				'  if ($sid -ne $currentSid -or $rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { $invalid += 1; continue }',
				'  $currentAllow += 1',
				'  if (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) { $currentFullControl += 1 }',
				'}',
				'[pscustomobject]@{ rulesProtected = [bool]$acl.AreAccessRulesProtected; ownerMatches = ($ownerSid -eq $currentSid); ruleCount = $rules.Count; currentAllowCount = $currentAllow; currentFullControlCount = $currentFullControl; invalidCount = $invalid } | ConvertTo-Json -Compress',
			].join('; ');
			const acl = await executeFile(
				'powershell.exe',
				['-NoProfile', '-NonInteractive', '-Command', script],
				{
					encoding: 'utf8',
					env: { ...process.env, KOLIBRI_TELEGRAM_ARTIFACT_PATH: actual },
				}
			);
			let evidence: Record<string, unknown>;
			try {
				evidence = record(
					JSON.parse(acl.stdout.trim()) as unknown,
					'TELEGRAM_TARGET_PROTECTED_ARTIFACT_PERMISSIONS_INVALID'
				);
			} catch (error) {
				if (error instanceof TelegramPreviewTargetError) throw error;
				fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_PERMISSIONS_INVALID');
			}
			if (
				evidence.rulesProtected !== true ||
				evidence.ownerMatches !== true ||
				typeof evidence.ruleCount !== 'number' ||
				evidence.ruleCount < 1 ||
				evidence.currentAllowCount !== evidence.ruleCount ||
				typeof evidence.currentFullControlCount !== 'number' ||
				evidence.currentFullControlCount < 1 ||
				evidence.invalidCount !== 0
			) {
				fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_PERMISSIONS_INVALID');
			}
		}
	} catch (error) {
		if (error instanceof TelegramPreviewTargetError) throw error;
		fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_CHECK_FAILED');
	}
	return actual;
}

export async function hardenProtectedTelegramArtifactPath(
	artifactPath: string,
	exactName: string
): Promise<string> {
	const resolved = resolve(artifactPath);
	const importsDirectory = resolve(process.cwd(), 'imports');
	if (
		basename(resolved).toLowerCase() !== exactName ||
		dirname(resolved).toLowerCase() !== importsDirectory.toLowerCase()
	) {
		fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_PATH_INVALID');
	}
	try {
		if ((await lstat(resolved)).isSymbolicLink()) {
			fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_SYMLINK_FORBIDDEN');
		}
		if (process.platform === 'win32') {
			const script = [
				"$ErrorActionPreference = 'Stop'",
				'$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User',
				'$acl = Get-Acl -LiteralPath $env:KOLIBRI_TELEGRAM_ARTIFACT_PATH',
				'$acl.SetAccessRuleProtection($true, $false)',
				'foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }',
				'$acl.SetOwner($currentSid)',
				'$rule = [System.Security.AccessControl.FileSystemAccessRule]::new($currentSid, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)',
				'[void]$acl.AddAccessRule($rule)',
				'Set-Acl -LiteralPath $env:KOLIBRI_TELEGRAM_ARTIFACT_PATH -AclObject $acl',
			].join('; ');
			await executeFile(
				'powershell.exe',
				['-NoProfile', '-NonInteractive', '-Command', script],
				{
					encoding: 'utf8',
					env: { ...process.env, KOLIBRI_TELEGRAM_ARTIFACT_PATH: resolved },
				}
			);
		} else {
			await chmod(resolved, 0o600);
		}
	} catch (error) {
		if (error instanceof TelegramPreviewTargetError) throw error;
		fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_HARDEN_FAILED');
	}
	return assertProtectedTelegramArtifactPath(resolved, exactName);
}

export function assertTelegramPreviewSecretBinding(
	target: VerifiedTelegramPreviewTarget,
	environment: TelegramPreviewSecretEnvironment
): { token: string; chatId: string; chatType: TelegramBureauChatType } {
	if (environment.APP_ENV !== 'preview') fail('TELEGRAM_TARGET_PROCESS_ENVIRONMENT_MISMATCH');
	const token = environment.TELEGRAM_BOT_TOKEN;
	if (!token) fail('TELEGRAM_TARGET_BOT_TOKEN_REQUIRED');
	const chatId = environment.TELEGRAM_CHAT_ID;
	if (!chatId || !isTelegramChatId(chatId)) fail('TELEGRAM_TARGET_CHAT_ID_INVALID');
	const bindingKey = environment.TELEGRAM_TARGET_BINDING_KEY;
	if (!bindingKey) fail('TELEGRAM_TARGET_BINDING_KEY_REQUIRED');
	if (telegramChatIdHmacSha256(chatId, bindingKey) !== target.manifest.chatIdHmacSha256) {
		fail('TELEGRAM_TARGET_CHAT_ID_MISMATCH');
	}
	if (telegramBotIdHmacSha256(token, bindingKey) !== target.manifest.botIdHmacSha256) {
		fail('TELEGRAM_TARGET_BOT_ID_MISMATCH');
	}
	const chatType = exactChatType(environment.TELEGRAM_CHAT_TYPE);
	if (chatType !== target.manifest.binding.telegramChatType) {
		fail('TELEGRAM_TARGET_CHAT_TYPE_MISMATCH');
	}
	return { token, chatId, chatType };
}

export async function loadTelegramPreviewTarget(
	configPath: string,
	manifestPath: string,
	deploymentEvidencePath: string
): Promise<VerifiedTelegramPreviewTarget> {
	if (!configPath || basename(configPath).toLowerCase() !== 'wrangler.preview.toml') {
		fail('TELEGRAM_TARGET_CONFIG_PATH_INVALID');
	}
	if (!manifestPath || !deploymentEvidencePath)
		fail('TELEGRAM_TARGET_PROTECTED_ARTIFACT_REQUIRED');
	const exactManifestPath = await assertProtectedTelegramArtifactPath(
		manifestPath,
		'telegram-preview-target.json'
	);
	const exactDeploymentEvidencePath = await assertProtectedTelegramArtifactPath(
		deploymentEvidencePath,
		'telegram-preview-deployment-evidence.json'
	);
	let manifest: unknown;
	let deploymentEvidence: unknown;
	try {
		manifest = JSON.parse(await readFile(exactManifestPath, 'utf8')) as unknown;
		deploymentEvidence = JSON.parse(
			await readFile(exactDeploymentEvidencePath, 'utf8')
		) as unknown;
	} catch {
		fail('TELEGRAM_TARGET_MANIFEST_READ_FAILED');
	}
	let config: TelegramPreviewWranglerConfig;
	try {
		config = unstable_readConfig({ config: configPath }, { hideWarnings: true });
	} catch {
		fail('TELEGRAM_TARGET_CONFIG_READ_FAILED');
	}
	const target = verifyTelegramPreviewTarget({ config, manifest });
	verifyTelegramPreviewDeploymentEvidence({ target, evidence: deploymentEvidence });
	let gitCommitSha: string;
	let gitStatus: string;
	try {
		const [commit, status] = await Promise.all([
			executeFile('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }),
			executeFile('git', ['status', '--porcelain', '--untracked-files=all'], {
				cwd: process.cwd(),
				encoding: 'utf8',
			}),
		]);
		gitCommitSha = commit.stdout.trim().toLowerCase();
		gitStatus = status.stdout.trim();
	} catch {
		fail('TELEGRAM_TARGET_GIT_EVIDENCE_UNAVAILABLE');
	}
	if (gitCommitSha !== target.manifest.candidateGitCommitSha) {
		fail('TELEGRAM_TARGET_GIT_SHA_MISMATCH');
	}
	if (gitStatus !== '') fail('TELEGRAM_TARGET_GIT_WORKTREE_DIRTY');
	return target;
}

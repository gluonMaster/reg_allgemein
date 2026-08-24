import { createHash } from 'node:crypto';
import type { StatementSpec } from '../src/lib/server/db/database';
import { assertLegacyOperatorId } from '../src/lib/server/import/legacy-release';
import {
	assertRemoteD1ConfigTarget,
	type RemoteD1Environment,
	type RemoteD1Target,
	type RemoteD1WranglerConfig,
} from './remote-d1-target';

const VALUE_OPTIONS = new Set([
	'environment',
	'config',
	'database-id',
	'academic-period',
	'display-name',
	'starts-on',
	'ends-on',
	'operator-id',
	'created-at',
	'git-commit',
	'confirmation',
]);
const FLAG_OPTIONS = new Set(['remote', 'current']);

export type RemoteAcademicPeriodAction = 'confirmation' | 'apply' | 'reconcile';

export type RemoteAcademicPeriodReconciliationOutcome = 'applied' | 'not_applied' | 'conflict';

export interface ValueFreeRemoteAcademicPeriodConfigSummary {
	status: 'ready';
	environment: RemoteD1Environment;
	accountIdValid: true;
	databaseIdValid: true;
	databaseBindingCount: 1;
	databaseBinding: 'DB';
	selectorFree: true;
}

export interface ParsedRemoteAcademicPeriodArguments {
	action: RemoteAcademicPeriodAction;
	options: Map<string, string | true>;
}

export interface RemoteAcademicPeriodInput {
	target: Pick<RemoteD1Target, 'environment' | 'databaseId'>;
	academicPeriod: string;
	displayName: string;
	startsOn: string;
	endsOn: string;
	isCurrent: true;
	operatorId: string;
	createdAt: string;
	gitCommitSha: string;
}

export interface ValidatedRemoteAcademicPeriodInput extends RemoteAcademicPeriodInput {
	operationDigestSha256: string;
	periodId: string;
	auditEventId: string;
	requestId: string;
}

export function parseRemoteAcademicPeriodArguments(
	values: string[]
): ParsedRemoteAcademicPeriodArguments {
	const [actionValue, ...tokens] = values;
	if (actionValue !== 'confirmation' && actionValue !== 'apply' && actionValue !== 'reconcile') {
		throw new Error('CLI_ACTION_INVALID');
	}
	const action = actionValue;
	const options = new Map<string, string | true>();
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (!token.startsWith('--') || token.length === 2) throw new Error('CLI_ARGUMENT_INVALID');
		const key = token.slice(2);
		if (!VALUE_OPTIONS.has(key) && !FLAG_OPTIONS.has(key)) {
			throw new Error('CLI_ARGUMENT_UNKNOWN');
		}
		if (options.has(key)) throw new Error('CLI_ARGUMENT_DUPLICATE');
		const next = tokens[index + 1];
		if (FLAG_OPTIONS.has(key)) {
			if (next && !next.startsWith('--')) throw new Error('CLI_FLAG_VALUE_FORBIDDEN');
			options.set(key, true);
			continue;
		}
		if (!next || next.startsWith('--')) throw new Error('CLI_ARGUMENT_VALUE_REQUIRED');
		options.set(key, next);
		index += 1;
	}
	if (action === 'confirmation' && options.has('confirmation')) {
		throw new Error('CLI_CONFIRMATION_FORBIDDEN');
	}
	if (action === 'confirmation' && options.has('remote')) {
		throw new Error('CLI_REMOTE_FORBIDDEN');
	}
	if (action !== 'confirmation' && options.get('remote') !== true) {
		throw new Error('CLI_REMOTE_CONFIRMATION_REQUIRED');
	}
	return { action, options };
}

export function requiredRemoteAcademicPeriodOption(
	options: ReadonlyMap<string, string | true>,
	key: string
): string {
	const value = options.get(key);
	if (typeof value !== 'string' || !value) {
		throw new Error(`CLI_${key.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
	}
	return value;
}

export function parseRemoteAcademicPeriodEnvironment(value: string): RemoteD1Environment {
	if (value !== 'preview' && value !== 'production') throw new Error('CLI_ENVIRONMENT_INVALID');
	return value;
}

export function assertRemoteAcademicPeriodConfigPath(configPath: string): void {
	const normalizedName = configPath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
	if (normalizedName === 'wrangler.example.toml') throw new Error('CLI_EXAMPLE_CONFIG_FORBIDDEN');
}

export function valueFreeRemoteAcademicPeriodConfigSummary(
	config: RemoteD1WranglerConfig,
	environment: RemoteD1Environment,
	databaseId: string
): ValueFreeRemoteAcademicPeriodConfigSummary {
	assertRemoteD1ConfigTarget(config, environment, databaseId);
	return {
		status: 'ready',
		environment,
		accountIdValid: true,
		databaseIdValid: true,
		databaseBindingCount: 1,
		databaseBinding: 'DB',
		selectorFree: true,
	};
}

export function remoteAcademicPeriodInputFromOptions(
	options: ReadonlyMap<string, string | true>,
	environment: RemoteD1Environment,
	databaseId: string
): RemoteAcademicPeriodInput {
	if (options.get('current') !== true) throw new Error('ACADEMIC_PERIOD_CURRENT_REQUIRED');
	return {
		target: { environment, databaseId },
		academicPeriod: requiredRemoteAcademicPeriodOption(options, 'academic-period'),
		displayName: requiredRemoteAcademicPeriodOption(options, 'display-name'),
		startsOn: requiredRemoteAcademicPeriodOption(options, 'starts-on'),
		endsOn: requiredRemoteAcademicPeriodOption(options, 'ends-on'),
		isCurrent: true,
		operatorId: requiredRemoteAcademicPeriodOption(options, 'operator-id'),
		createdAt: requiredRemoteAcademicPeriodOption(options, 'created-at'),
		gitCommitSha: requiredRemoteAcademicPeriodOption(options, 'git-commit'),
	};
}

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function deterministicUuid(namespace: string): string {
	const hex = sha256(namespace).slice(0, 32).split('');
	hex[12] = '5';
	hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
	const value = hex.join('');
	return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function assertSafeText(value: string, field: string, maximumLength: number): string {
	if (
		!value ||
		value !== value.trim() ||
		value.length > maximumLength ||
		/[\u0000-\u001f\u007f]/u.test(value)
	) {
		throw new Error(`ACADEMIC_PERIOD_${field.toUpperCase()}_INVALID`);
	}
	return value;
}

function assertDate(value: string, field: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
		throw new Error(`ACADEMIC_PERIOD_${field.toUpperCase()}_INVALID`);
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
		throw new Error(`ACADEMIC_PERIOD_${field.toUpperCase()}_INVALID`);
	}
	return value;
}

function assertCanonicalInstant(value: string): string {
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
		throw new Error('ACADEMIC_PERIOD_CREATED_AT_INVALID');
	}
	return value;
}

function assertGitCommitSha(value: string): string {
	const normalized = value.toLowerCase();
	if (!/^[0-9a-f]{40,64}$/u.test(normalized)) {
		throw new Error('CLI_GIT_COMMIT_INVALID');
	}
	return normalized;
}

function assertEnvironment(value: RemoteD1Environment): RemoteD1Environment {
	if (value !== 'preview' && value !== 'production') {
		throw new Error('CLI_ENVIRONMENT_INVALID');
	}
	return value;
}

export function validateRemoteAcademicPeriodInput(
	input: RemoteAcademicPeriodInput
): ValidatedRemoteAcademicPeriodInput {
	const environment = assertEnvironment(input.target.environment);
	const databaseId = input.target.databaseId.toLowerCase();
	if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(databaseId)) {
		throw new Error('CLI_DATABASE_ID_INVALID');
	}
	const academicPeriod = assertSafeText(input.academicPeriod, 'code', 64);
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(academicPeriod)) {
		throw new Error('ACADEMIC_PERIOD_CODE_INVALID');
	}
	const displayName = assertSafeText(input.displayName, 'display_name', 160);
	const startsOn = assertDate(input.startsOn, 'starts_on');
	const endsOn = assertDate(input.endsOn, 'ends_on');
	if (startsOn > endsOn) throw new Error('ACADEMIC_PERIOD_DATE_RANGE_INVALID');
	if (input.isCurrent !== true) throw new Error('ACADEMIC_PERIOD_CURRENT_REQUIRED');
	const operatorId = assertLegacyOperatorId(input.operatorId);
	const createdAt = assertCanonicalInstant(input.createdAt);
	const gitCommitSha = assertGitCommitSha(input.gitCommitSha);
	const canonicalBinding = JSON.stringify({
		schemaVersion: 1,
		operation: 'academic-period.remote-provision',
		environment,
		databaseId,
		academicPeriod,
		displayName,
		startsOn,
		endsOn,
		isCurrent: true,
		operatorId,
		createdAt,
		gitCommitSha,
	});
	const operationDigestSha256 = sha256(canonicalBinding);
	return {
		target: { environment, databaseId },
		academicPeriod,
		displayName,
		startsOn,
		endsOn,
		isCurrent: true,
		operatorId,
		createdAt,
		gitCommitSha,
		operationDigestSha256,
		periodId: deterministicUuid(`academic-period-v1\0${academicPeriod}`),
		auditEventId: deterministicUuid(`academic-period-audit-v1\0${operationDigestSha256}`),
		requestId: `academic-period:${operationDigestSha256}`,
	};
}

export function expectedRemoteAcademicPeriodConfirmation(input: RemoteAcademicPeriodInput): string {
	const validated = validateRemoteAcademicPeriodInput(input);
	return [
		'PROVISION_ACADEMIC_PERIOD',
		validated.target.environment.toUpperCase(),
		validated.target.databaseId,
		validated.operationDigestSha256,
	].join('_');
}

function remoteAcademicPeriodSafeDiff(input: ValidatedRemoteAcademicPeriodInput): string {
	return JSON.stringify({
		academicPeriod: input.academicPeriod,
		displayNameSha256: sha256(input.displayName),
		startsOn: input.startsOn,
		endsOn: input.endsOn,
		isCurrent: true,
		operatorId: input.operatorId,
		gitCommitSha: input.gitCommitSha,
		operationDigestSha256: input.operationDigestSha256,
	});
}

function remoteAcademicPeriodStateStatement(
	validated: ValidatedRemoteAcademicPeriodInput,
	safeDiff: string
): StatementSpec {
	return {
		sql: `SELECT CASE
			WHEN period_id_count = 1 AND period_code_count = 1
				AND current_period_count = 1 AND exact_period_count = 1
				AND audit_id_count = 1 AND audit_request_count = 1
				AND exact_audit_count = 1 THEN 'applied'
			WHEN period_id_count = 0 AND period_code_count = 0
				AND current_period_count = 0 AND exact_period_count = 0
				AND audit_id_count = 0 AND audit_request_count = 0
				AND exact_audit_count = 0 THEN 'not_applied'
			ELSE 'conflict'
		END AS outcome,
		period_id_count, period_code_count, current_period_count,
		exact_period_count, audit_id_count, audit_request_count, exact_audit_count
		FROM (
			SELECT
				(SELECT COUNT(*) FROM academic_periods WHERE id = ?) AS period_id_count,
				(SELECT COUNT(*) FROM academic_periods WHERE code = ?) AS period_code_count,
				(SELECT COUNT(*) FROM academic_periods WHERE is_current = 1)
					AS current_period_count,
				(SELECT COUNT(*) FROM academic_periods
					WHERE id = ? AND code = ? AND display_name = ? AND starts_on = ?
						AND ends_on = ? AND is_current = 1 AND created_at = ?)
					AS exact_period_count,
				(SELECT COUNT(*) FROM audit_events WHERE id = ?) AS audit_id_count,
				(SELECT COUNT(*) FROM audit_events WHERE request_id = ?)
					AS audit_request_count,
				(SELECT COUNT(*) FROM audit_events
					WHERE id = ? AND actor_user_id IS NULL AND actor_kind = 'system'
						AND action = 'academic_period.remote_provisioned'
						AND target_kind = 'academic_period' AND target_id = ?
						AND request_id = ? AND safe_diff_json = ?
						AND ip_retention_value IS NULL AND created_at = ?)
					AS exact_audit_count
		) AS state`,
		params: [
			validated.periodId,
			validated.academicPeriod,
			validated.periodId,
			validated.academicPeriod,
			validated.displayName,
			validated.startsOn,
			validated.endsOn,
			validated.createdAt,
			validated.auditEventId,
			validated.requestId,
			validated.auditEventId,
			validated.periodId,
			validated.requestId,
			safeDiff,
			validated.createdAt,
		],
	};
}

export function buildRemoteAcademicPeriodStatements(
	input: RemoteAcademicPeriodInput
): StatementSpec[] {
	const validated = validateRemoteAcademicPeriodInput(input);
	const safeDiff = remoteAcademicPeriodSafeDiff(validated);
	return [
		{
			sql: `INSERT OR IGNORE INTO audit_events
				(id, actor_user_id, actor_kind, action, target_kind, target_id,
				 request_id, safe_diff_json, ip_retention_value, created_at)
			SELECT ?, NULL, 'system', 'academic_period.remote_provisioned',
				'academic_period', ?, ?, ?, NULL, ?
			WHERE (
				NOT EXISTS (SELECT 1 FROM academic_periods
					WHERE id = ? OR code = ? OR is_current = 1)
				AND NOT EXISTS (SELECT 1 FROM audit_events
					WHERE id = ? OR request_id = ?)
			) OR (
				EXISTS (SELECT 1 FROM academic_periods
					WHERE id = ? AND code = ? AND display_name = ? AND starts_on = ?
						AND ends_on = ? AND is_current = 1 AND created_at = ?)
				AND (SELECT COUNT(*) FROM academic_periods WHERE is_current = 1) = 1
				AND EXISTS (SELECT 1 FROM audit_events
					WHERE id = ? AND actor_user_id IS NULL AND actor_kind = 'system'
						AND action = 'academic_period.remote_provisioned'
						AND target_kind = 'academic_period' AND target_id = ?
						AND request_id = ? AND safe_diff_json = ?
						AND ip_retention_value IS NULL AND created_at = ?)
				AND NOT EXISTS (SELECT 1 FROM audit_events
					WHERE request_id = ? AND id <> ?)
			)`,
			params: [
				validated.auditEventId,
				validated.periodId,
				validated.requestId,
				safeDiff,
				validated.createdAt,
				validated.periodId,
				validated.academicPeriod,
				validated.auditEventId,
				validated.requestId,
				validated.periodId,
				validated.academicPeriod,
				validated.displayName,
				validated.startsOn,
				validated.endsOn,
				validated.createdAt,
				validated.auditEventId,
				validated.periodId,
				validated.requestId,
				safeDiff,
				validated.createdAt,
				validated.requestId,
				validated.auditEventId,
			],
		},
		{
			sql: `INSERT OR IGNORE INTO academic_periods
				(id, code, display_name, starts_on, ends_on, is_current, created_at)
			SELECT ?, ?, ?, ?, ?, 1, ?
			WHERE changes() = 1 OR (
				EXISTS (SELECT 1 FROM academic_periods
					WHERE id = ? AND code = ? AND display_name = ? AND starts_on = ?
						AND ends_on = ? AND is_current = 1 AND created_at = ?)
				AND (SELECT COUNT(*) FROM academic_periods WHERE is_current = 1) = 1
				AND EXISTS (SELECT 1 FROM audit_events
					WHERE id = ? AND actor_user_id IS NULL AND actor_kind = 'system'
						AND action = 'academic_period.remote_provisioned'
						AND target_kind = 'academic_period' AND target_id = ?
						AND request_id = ? AND safe_diff_json = ?
						AND ip_retention_value IS NULL AND created_at = ?)
				AND NOT EXISTS (SELECT 1 FROM audit_events
					WHERE request_id = ? AND id <> ?)
			)`,
			params: [
				validated.periodId,
				validated.academicPeriod,
				validated.displayName,
				validated.startsOn,
				validated.endsOn,
				validated.createdAt,
				validated.periodId,
				validated.academicPeriod,
				validated.displayName,
				validated.startsOn,
				validated.endsOn,
				validated.createdAt,
				validated.auditEventId,
				validated.periodId,
				validated.requestId,
				safeDiff,
				validated.createdAt,
				validated.requestId,
				validated.auditEventId,
			],
		},
		remoteAcademicPeriodStateStatement(validated, safeDiff),
	];
}

export function buildRemoteAcademicPeriodReconciliationStatements(
	input: RemoteAcademicPeriodInput
): StatementSpec[] {
	const validated = validateRemoteAcademicPeriodInput(input);
	return [remoteAcademicPeriodStateStatement(validated, remoteAcademicPeriodSafeDiff(validated))];
}

interface RemoteAcademicPeriodStateCounts {
	periodIdCount: number;
	periodCodeCount: number;
	currentPeriodCount: number;
	exactPeriodCount: number;
	auditIdCount: number;
	auditRequestCount: number;
	exactAuditCount: number;
}

function resultCount(row: object, key: string, invalidCode: string): number {
	const value = Reflect.get(row, key);
	if (!Number.isSafeInteger(value) || value < 0) throw new Error(invalidCode);
	return value as number;
}

function terminalState(
	value: unknown,
	expectedStatementCount: number,
	invalidCode: string
): { outcome: RemoteAcademicPeriodReconciliationOutcome; counts: RemoteAcademicPeriodStateCounts } {
	if (
		!Number.isSafeInteger(expectedStatementCount) ||
		expectedStatementCount < 1 ||
		!Array.isArray(value) ||
		value.length !== expectedStatementCount ||
		value.some(
			(entry) =>
				typeof entry !== 'object' ||
				entry === null ||
				Reflect.get(entry, 'success') !== true
		)
	) {
		throw new Error(invalidCode);
	}
	const terminal = value.at(-1);
	if (typeof terminal !== 'object' || terminal === null) throw new Error(invalidCode);
	const results = Reflect.get(terminal, 'results');
	const row = Array.isArray(results) && results.length === 1 ? results[0] : undefined;
	if (typeof row !== 'object' || row === null) throw new Error(invalidCode);
	const counts: RemoteAcademicPeriodStateCounts = {
		periodIdCount: resultCount(row, 'period_id_count', invalidCode),
		periodCodeCount: resultCount(row, 'period_code_count', invalidCode),
		currentPeriodCount: resultCount(row, 'current_period_count', invalidCode),
		exactPeriodCount: resultCount(row, 'exact_period_count', invalidCode),
		auditIdCount: resultCount(row, 'audit_id_count', invalidCode),
		auditRequestCount: resultCount(row, 'audit_request_count', invalidCode),
		exactAuditCount: resultCount(row, 'exact_audit_count', invalidCode),
	};
	const classified: RemoteAcademicPeriodReconciliationOutcome =
		counts.periodIdCount === 1 &&
		counts.periodCodeCount === 1 &&
		counts.currentPeriodCount === 1 &&
		counts.exactPeriodCount === 1 &&
		counts.auditIdCount === 1 &&
		counts.auditRequestCount === 1 &&
		counts.exactAuditCount === 1
			? 'applied'
			: counts.periodIdCount === 0 &&
				  counts.periodCodeCount === 0 &&
				  counts.currentPeriodCount === 0 &&
				  counts.exactPeriodCount === 0 &&
				  counts.auditIdCount === 0 &&
				  counts.auditRequestCount === 0 &&
				  counts.exactAuditCount === 0
				? 'not_applied'
				: 'conflict';
	const outcome = Reflect.get(row, 'outcome');
	if (outcome !== classified) throw new Error(invalidCode);
	return { outcome: classified, counts };
}

export function assertRemoteAcademicPeriodResult(
	value: unknown,
	expectedStatementCount: number
): void {
	if (
		terminalState(value, expectedStatementCount, 'ACADEMIC_PERIOD_REMOTE_RESULT_INVALID')
			.outcome !== 'applied'
	) {
		throw new Error('ACADEMIC_PERIOD_REMOTE_ASSERTION_FAILED');
	}
}

export function assertRemoteAcademicPeriodReconciliationResult(
	value: unknown,
	expectedStatementCount: number
): RemoteAcademicPeriodReconciliationOutcome {
	return terminalState(
		value,
		expectedStatementCount,
		'ACADEMIC_PERIOD_RECONCILIATION_RESULT_INVALID'
	).outcome;
}

export async function executeRemoteAcademicPeriodApply(
	expectedStatementCount: number,
	dispatch: () => Promise<string>
): Promise<void> {
	let stdout: string;
	try {
		stdout = await dispatch();
	} catch {
		throw new Error('ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS');
	}
	let value: unknown;
	try {
		value = JSON.parse(stdout) as unknown;
	} catch {
		throw new Error('ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS');
	}
	try {
		assertRemoteAcademicPeriodResult(value, expectedStatementCount);
	} catch (error) {
		if (error instanceof Error && error.message === 'ACADEMIC_PERIOD_REMOTE_ASSERTION_FAILED') {
			throw error;
		}
		throw new Error('ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS');
	}
}

export async function executeRemoteAcademicPeriodReconciliation(
	expectedStatementCount: number,
	dispatch: () => Promise<string>
): Promise<RemoteAcademicPeriodReconciliationOutcome> {
	let stdout: string;
	try {
		stdout = await dispatch();
	} catch {
		throw new Error('ACADEMIC_PERIOD_RECONCILIATION_EXECUTION_FAILED');
	}
	let value: unknown;
	try {
		value = JSON.parse(stdout) as unknown;
	} catch {
		throw new Error('ACADEMIC_PERIOD_RECONCILIATION_RESULT_INVALID');
	}
	return assertRemoteAcademicPeriodReconciliationResult(value, expectedStatementCount);
}

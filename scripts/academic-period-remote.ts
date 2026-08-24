import { createHash } from 'node:crypto';
import type { StatementSpec } from '../src/lib/server/db/database';
import { assertLegacyOperatorId } from '../src/lib/server/import/legacy-release';
import type { RemoteD1Environment, RemoteD1Target } from './remote-d1-target';

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

export type RemoteAcademicPeriodAction = 'confirmation' | 'apply';

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
	if (actionValue !== 'confirmation' && actionValue !== 'apply') {
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
	if (action === 'apply' && options.get('remote') !== true) {
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

export function buildRemoteAcademicPeriodStatements(
	input: RemoteAcademicPeriodInput
): StatementSpec[] {
	const validated = validateRemoteAcademicPeriodInput(input);
	const safeDiff = JSON.stringify({
		academicPeriod: validated.academicPeriod,
		displayNameSha256: sha256(validated.displayName),
		startsOn: validated.startsOn,
		endsOn: validated.endsOn,
		isCurrent: true,
		operatorId: validated.operatorId,
		gitCommitSha: validated.gitCommitSha,
		operationDigestSha256: validated.operationDigestSha256,
	});
	return [
		{
			sql: `INSERT OR IGNORE INTO academic_periods
				(id, code, display_name, starts_on, ends_on, is_current, created_at)
			VALUES (?, ?, ?, ?, ?, 1, ?)`,
			params: [
				validated.periodId,
				validated.academicPeriod,
				validated.displayName,
				validated.startsOn,
				validated.endsOn,
				validated.createdAt,
			],
		},
		{
			sql: `INSERT OR IGNORE INTO audit_events
				(id, actor_user_id, actor_kind, action, target_kind, target_id,
				 request_id, safe_diff_json, created_at)
			SELECT ?, NULL, 'system', 'academic_period.remote_provisioned',
				'academic_period', period.id, ?, ?, ?
			FROM academic_periods period
			WHERE period.code = ? AND period.display_name = ?
				AND period.starts_on = ? AND period.ends_on = ? AND period.is_current = 1`,
			params: [
				validated.auditEventId,
				validated.requestId,
				safeDiff,
				validated.createdAt,
				validated.academicPeriod,
				validated.displayName,
				validated.startsOn,
				validated.endsOn,
			],
		},
		{
			sql: `SELECT CASE WHEN
				(SELECT COUNT(*) FROM academic_periods WHERE code = ?) = 1
				AND (SELECT COUNT(*) FROM academic_periods
					WHERE code = ? AND display_name = ? AND starts_on = ?
						AND ends_on = ? AND is_current = 1) = 1
				AND (SELECT COUNT(*) FROM audit_events audit
					JOIN academic_periods period ON period.id = audit.target_id
					WHERE audit.id = ? AND audit.request_id = ?
						AND audit.actor_kind = 'system'
						AND audit.action = 'academic_period.remote_provisioned'
						AND audit.target_kind = 'academic_period'
						AND audit.safe_diff_json = ? AND period.code = ?) = 1
			THEN 'ready' ELSE 'conflict' END AS status,
			(SELECT COUNT(*) FROM academic_periods WHERE code = ?) AS period_count,
			(SELECT COUNT(*) FROM academic_periods
				WHERE code = ? AND display_name = ? AND starts_on = ?
					AND ends_on = ? AND is_current = 1) AS exact_period_count,
			(SELECT COUNT(*) FROM audit_events WHERE id = ? AND request_id = ?) AS audit_count`,
			params: [
				validated.academicPeriod,
				validated.academicPeriod,
				validated.displayName,
				validated.startsOn,
				validated.endsOn,
				validated.auditEventId,
				validated.requestId,
				safeDiff,
				validated.academicPeriod,
				validated.academicPeriod,
				validated.academicPeriod,
				validated.displayName,
				validated.startsOn,
				validated.endsOn,
				validated.auditEventId,
				validated.requestId,
			],
		},
	];
}

export function assertRemoteAcademicPeriodResult(
	value: unknown,
	expectedStatementCount: number
): void {
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
		throw new Error('ACADEMIC_PERIOD_REMOTE_RESULT_INVALID');
	}
	const terminal = value.at(-1);
	if (typeof terminal !== 'object' || terminal === null) {
		throw new Error('ACADEMIC_PERIOD_REMOTE_RESULT_INVALID');
	}
	const results = Reflect.get(terminal, 'results');
	const row = Array.isArray(results) && results.length === 1 ? results[0] : undefined;
	if (
		typeof row !== 'object' ||
		row === null ||
		Reflect.get(row, 'status') !== 'ready' ||
		Reflect.get(row, 'period_count') !== 1 ||
		Reflect.get(row, 'exact_period_count') !== 1 ||
		Reflect.get(row, 'audit_count') !== 1
	) {
		throw new Error('ACADEMIC_PERIOD_REMOTE_ASSERTION_FAILED');
	}
}

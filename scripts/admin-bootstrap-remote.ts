import type { StatementSpec } from '../src/lib/server/db/database';
import {
	assertBootstrapDatabaseId,
	type BootstrapEnvironmentName,
} from '../src/lib/server/auth/admin-bootstrap-command';

type RemoteEnvironment = Exclude<BootstrapEnvironmentName, 'local'>;

export interface BootstrapWranglerConfig {
	account_id?: string;
	compliance_region?: string;
	vars?: Record<string, unknown>;
	d1_databases?: Array<{
		binding: string;
		database_name?: string;
		database_id?: string;
		preview_database_id?: string;
	}>;
}

export function assertLocalBootstrapConfigTarget(config: BootstrapWranglerConfig): string {
	if (config.vars?.APP_ENV !== 'development') {
		throw new Error('CLI_ENVIRONMENT_TARGET_MISMATCH');
	}
	const bindings = config.d1_databases ?? [];
	if (bindings.length !== 1 || bindings[0].binding !== 'DB') {
		throw new Error('CLI_DATABASE_BINDING_INVALID');
	}
	const databaseId = bindings[0].database_id;
	if (!databaseId) throw new Error('CLI_DATABASE_TARGET_MISMATCH');
	return databaseId;
}

export function assertRemoteBootstrapConfigTarget(
	config: BootstrapWranglerConfig,
	environment: RemoteEnvironment,
	databaseId: string
): void {
	if (config.vars?.APP_ENV !== environment) {
		throw new Error('CLI_ENVIRONMENT_TARGET_MISMATCH');
	}
	const bindings = config.d1_databases ?? [];
	if (bindings.length !== 1 || bindings[0].binding !== 'DB') {
		throw new Error('CLI_DATABASE_BINDING_INVALID');
	}
	const binding = bindings[0];
	const exactDatabaseId = assertBootstrapDatabaseId(databaseId);
	const deployedId = binding.database_id
		? assertBootstrapDatabaseId(binding.database_id)
		: undefined;
	const developmentPreviewId = binding.preview_database_id
		? assertBootstrapDatabaseId(binding.preview_database_id)
		: undefined;
	if (deployedId && developmentPreviewId && deployedId === developmentPreviewId) {
		throw new Error('CLI_REMOTE_DATABASE_ISOLATION_REQUIRED');
	}
	if (developmentPreviewId) {
		throw new Error('CLI_DATABASE_SELECTOR_AMBIGUOUS');
	}
	if (!deployedId || deployedId !== exactDatabaseId) {
		throw new Error('CLI_DATABASE_TARGET_MISMATCH');
	}
	if (binding.database_name?.toLowerCase() === exactDatabaseId) {
		throw new Error('CLI_DATABASE_SELECTOR_AMBIGUOUS');
	}
}

export function buildPinnedWranglerConfig(
	config: BootstrapWranglerConfig,
	commandName = 'kolibri-admin-bootstrap-exact-target'
): string {
	const pinnedConfig: Record<string, unknown> = {
		name: commandName,
		send_metrics: false,
		d1_databases: [],
	};
	if (typeof config.account_id === 'string' && config.account_id) {
		pinnedConfig.account_id = config.account_id;
	}
	if (typeof config.compliance_region === 'string' && config.compliance_region) {
		pinnedConfig.compliance_region = config.compliance_region;
	}
	return `${JSON.stringify(pinnedConfig, null, 2)}\n`;
}

function sqlLiteral(value: unknown): string {
	if (value === null) return 'NULL';
	if (typeof value === 'string') {
		if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
			throw new Error('CLI_REMOTE_SQL_VALUE_INVALID');
		}
		return `'${value.replaceAll("'", "''")}'`;
	}
	if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
	if (typeof value === 'boolean') return value ? '1' : '0';
	throw new Error('CLI_REMOTE_SQL_VALUE_INVALID');
}

export function renderD1BatchSql(statements: readonly StatementSpec[]): string {
	return statements
		.map((statement) => {
			let parameterIndex = 0;
			const rendered = statement.sql.replaceAll('?', () => {
				const parameters = statement.params ?? [];
				if (parameterIndex >= parameters.length) {
					throw new Error('CLI_REMOTE_SQL_PARAMETER_MISMATCH');
				}
				return sqlLiteral(parameters[parameterIndex++]);
			});
			if (parameterIndex !== (statement.params?.length ?? 0)) {
				throw new Error('CLI_REMOTE_SQL_PARAMETER_MISMATCH');
			}
			return `${rendered};`;
		})
		.join('\n');
}

export function remoteBootstrapVerificationStatement(input: {
	targetUserId: string;
	requestId: string;
}): StatementSpec {
	return {
		sql: `SELECT control.status,
			(SELECT COUNT(*) FROM users WHERE role = 'admin'
				AND account_status = 'active' AND is_blocked = 0) AS active_admin_count,
			EXISTS (SELECT 1 FROM admin_bootstrap_actions action
				WHERE action.target_user_id = ? AND action.request_id = ?) AS action_recorded,
			EXISTS (SELECT 1 FROM admin_bootstrap_assertions assertion
				JOIN admin_bootstrap_actions action ON action.id = assertion.action_id
				WHERE action.target_user_id = ? AND action.request_id = ?
					AND assertion.assertion_passed = 1) AS assertion_recorded
		FROM admin_bootstrap_control control WHERE control.id = 'first-admin'`,
		params: [input.targetUserId, input.requestId, input.targetUserId, input.requestId],
	};
}

export function assertRemoteBootstrapResult(value: unknown, expectedStatementCount: number): void {
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
		throw new Error('ADMIN_BOOTSTRAP_REMOTE_RESULT_INVALID');
	}
	const terminal = value.at(-1);
	if (typeof terminal !== 'object' || terminal === null) {
		throw new Error('ADMIN_BOOTSTRAP_REMOTE_RESULT_INVALID');
	}
	const results = Reflect.get(terminal, 'results');
	const row = Array.isArray(results) && results.length === 1 ? results[0] : undefined;
	if (
		typeof row !== 'object' ||
		row === null ||
		Reflect.get(row, 'status') !== 'consumed' ||
		Reflect.get(row, 'active_admin_count') !== 1 ||
		Reflect.get(row, 'action_recorded') !== 1 ||
		Reflect.get(row, 'assertion_recorded') !== 1
	) {
		throw new Error('ADMIN_BOOTSTRAP_REMOTE_ASSERTION_FAILED');
	}
}

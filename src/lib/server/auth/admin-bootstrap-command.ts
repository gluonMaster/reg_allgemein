export type BootstrapEnvironmentName = 'local' | 'preview' | 'production';

const VALUE_OPTIONS = new Set([
	'environment',
	'user-id',
	'reason',
	'confirmation',
	'config',
	'database-id',
]);
const FLAG_OPTIONS = new Set(['remote']);

export function parseBootstrapOptions(values: string[]): Map<string, string | true> {
	const options = new Map<string, string | true>();
	for (let index = 0; index < values.length; index += 1) {
		const token = values[index];
		if (!token.startsWith('--') || token.length === 2) throw new Error('CLI_ARGUMENT_INVALID');
		const key = token.slice(2);
		if (!VALUE_OPTIONS.has(key) && !FLAG_OPTIONS.has(key)) {
			throw new Error('CLI_ARGUMENT_UNKNOWN');
		}
		if (options.has(key)) throw new Error('CLI_ARGUMENT_DUPLICATE');
		const next = values[index + 1];
		if (FLAG_OPTIONS.has(key)) {
			if (next && !next.startsWith('--')) throw new Error('CLI_FLAG_VALUE_FORBIDDEN');
			options.set(key, true);
			continue;
		}
		if (!next || next.startsWith('--')) throw new Error('CLI_ARGUMENT_VALUE_REQUIRED');
		options.set(key, next);
		index += 1;
	}
	return options;
}

export function requiredBootstrapOption(
	options: ReadonlyMap<string, string | true>,
	key: string
): string {
	const value = options.get(key);
	if (typeof value !== 'string' || !value) {
		throw new Error(`CLI_${key.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
	}
	return value;
}

export function parseBootstrapEnvironment(
	value: string | true | undefined
): BootstrapEnvironmentName {
	const environment = value ?? 'local';
	if (
		typeof environment !== 'string' ||
		!(['local', 'preview', 'production'] as const).includes(
			environment as BootstrapEnvironmentName
		)
	) {
		throw new Error('CLI_ENVIRONMENT_INVALID');
	}
	return environment as BootstrapEnvironmentName;
}

export function expectedBootstrapAppEnvironment(
	environment: BootstrapEnvironmentName
): 'development' | 'preview' | 'production' {
	return environment === 'local' ? 'development' : environment;
}

export function assertBootstrapDatabaseId(value: string): string {
	const normalized = value.toLowerCase();
	if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(normalized)) {
		throw new Error('CLI_DATABASE_ID_INVALID');
	}
	return normalized;
}

export function expectedBootstrapConfirmation(
	environment: BootstrapEnvironmentName,
	databaseId?: string
): string {
	if (environment === 'local') return 'BOOTSTRAP_FIRST_ADMIN_LOCAL';
	if (!databaseId) throw new Error('CLI_DATABASE_ID_REQUIRED');
	return `BOOTSTRAP_FIRST_ADMIN_${environment.toUpperCase()}_${assertBootstrapDatabaseId(databaseId)}`;
}

export function assertBootstrapCliTargetOptions(
	environment: BootstrapEnvironmentName,
	options: ReadonlyMap<string, string | true>
): void {
	if (environment === 'local') {
		if (options.has('remote') || options.has('config') || options.has('database-id')) {
			throw new Error('CLI_LOCAL_TARGET_OPTIONS_FORBIDDEN');
		}
		return;
	}
	if (options.get('remote') !== true) throw new Error('CLI_REMOTE_CONFIRMATION_REQUIRED');
	if (!options.has('config') || !options.has('database-id')) {
		throw new Error('CLI_REMOTE_TARGET_REQUIRED');
	}
}

export function assertBootstrapConfigPath(configPath: string): void {
	const normalizedName = configPath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
	if (normalizedName === 'wrangler.example.toml') {
		throw new Error('CLI_EXAMPLE_CONFIG_FORBIDDEN');
	}
}

export function assertBootstrapTargetEnvironment(
	environment: BootstrapEnvironmentName,
	boundAppEnvironment: unknown
): void {
	if (boundAppEnvironment !== expectedBootstrapAppEnvironment(environment)) {
		throw new Error('CLI_ENVIRONMENT_TARGET_MISMATCH');
	}
}

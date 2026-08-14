import type { SqlDatabaseBoundary, StatementSpec } from '../src/lib/server/db/database';

export type RemoteD1Environment = 'preview' | 'production';

export interface RemoteD1WranglerConfig {
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

export interface RemoteD1Target {
	environment: RemoteD1Environment;
	accountId: string;
	databaseId: string;
}

export class RemoteD1Error extends Error {
	readonly code: string;
	readonly delivery: 'definite_failure' | 'ambiguous';

	constructor(code: string, delivery: 'definite_failure' | 'ambiguous', cause?: unknown) {
		super('Remote D1 operation failed.', { cause });
		this.name = 'RemoteD1Error';
		this.code = code;
		this.delivery = delivery;
	}
}

function assertUuid(value: string): string {
	const normalized = value.toLowerCase();
	if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(normalized)) {
		throw new Error('CLI_DATABASE_ID_INVALID');
	}
	return normalized;
}

export function assertRemoteD1ConfigTarget(
	config: RemoteD1WranglerConfig,
	environment: RemoteD1Environment,
	databaseId: string
): RemoteD1Target {
	const exactDatabaseId = assertUuid(databaseId);
	if (config.vars?.APP_ENV !== environment) throw new Error('CLI_ENVIRONMENT_TARGET_MISMATCH');
	if (!config.account_id || !/^[0-9a-f]{32}$/iu.test(config.account_id)) {
		throw new Error('CLI_ACCOUNT_ID_INVALID');
	}
	const bindings = config.d1_databases ?? [];
	if (bindings.length !== 1 || bindings[0].binding !== 'DB') {
		throw new Error('CLI_DATABASE_BINDING_INVALID');
	}
	const binding = bindings[0];
	const productionId = binding.database_id?.toLowerCase();
	const previewId = binding.preview_database_id?.toLowerCase();
	if (productionId && previewId && productionId === previewId) {
		throw new Error('CLI_REMOTE_DATABASE_ISOLATION_REQUIRED');
	}
	const configuredId = environment === 'preview' ? previewId : productionId;
	if (!configuredId || configuredId !== exactDatabaseId) {
		throw new Error('CLI_DATABASE_TARGET_MISMATCH');
	}
	if (binding.database_name?.toLowerCase() === exactDatabaseId) {
		throw new Error('CLI_DATABASE_SELECTOR_AMBIGUOUS');
	}
	return {
		environment,
		accountId: config.account_id.toLowerCase(),
		databaseId: exactDatabaseId,
	};
}

export function expectedRemoteImportConfirmation(input: {
	action: 'stage' | 'review' | 'promote' | 'verify' | 'rollback' | 'roll-forward';
	target: Pick<RemoteD1Target, 'environment' | 'databaseId'>;
	bindingDigestSha256: string;
}): string {
	if (!/^[0-9a-f]{64}$/u.test(input.bindingDigestSha256)) {
		throw new Error('CLI_BINDING_DIGEST_INVALID');
	}
	return [
		'LEGACY_IMPORT',
		input.action.replace('-', '_').toUpperCase(),
		input.target.environment.toUpperCase(),
		input.target.databaseId,
		input.bindingDigestSha256,
	].join('_');
}

function isReadOnly(statements: readonly StatementSpec[]): boolean {
	return statements.every((statement) => /^\s*(?:SELECT|PRAGMA|EXPLAIN)\b/iu.test(statement.sql));
}

function assertParameters(statements: readonly StatementSpec[]): void {
	for (const statement of statements) {
		for (const value of statement.params ?? []) {
			if (
				value !== null &&
				typeof value !== 'string' &&
				typeof value !== 'number' &&
				typeof value !== 'boolean'
			) {
				throw new RemoteD1Error('REMOTE_D1_PARAMETER_INVALID', 'definite_failure');
			}
			if (typeof value === 'number' && !Number.isFinite(value)) {
				throw new RemoteD1Error('REMOTE_D1_PARAMETER_INVALID', 'definite_failure');
			}
		}
	}
}

interface RemoteQueryResult<T> {
	results?: T[];
	success?: boolean;
	meta?: Record<string, unknown>;
}

interface RemoteQueryEnvelope<T> {
	success?: boolean;
	result?: RemoteQueryResult<T> | Array<RemoteQueryResult<T>>;
}

export const REMOTE_D1_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

async function readBoundedJson<T>(response: Response): Promise<T> {
	const declaredLength = response.headers.get('content-length');
	if (declaredLength !== null) {
		const parsedLength = Number(declaredLength);
		if (
			!Number.isSafeInteger(parsedLength) ||
			parsedLength < 0 ||
			parsedLength > REMOTE_D1_MAX_RESPONSE_BYTES
		) {
			throw new Error('REMOTE_D1_RESPONSE_TOO_LARGE');
		}
	}
	if (!response.body) throw new Error('REMOTE_D1_RESPONSE_BODY_MISSING');

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			received += next.value.byteLength;
			if (received > REMOTE_D1_MAX_RESPONSE_BYTES) {
				await reader.cancel();
				throw new Error('REMOTE_D1_RESPONSE_TOO_LARGE');
			}
			chunks.push(next.value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
}

export class RemoteD1Boundary implements SqlDatabaseBoundary {
	private readonly endpoint: string;
	readonly #apiToken: string;
	readonly #fetchImplementation: typeof fetch;
	readonly #requestTimeoutMs: number;

	constructor(
		target: Pick<RemoteD1Target, 'accountId' | 'databaseId'>,
		apiToken: string,
		fetchImplementation: typeof fetch = fetch,
		requestTimeoutMs = 30_000
	) {
		if (!apiToken || /\s/u.test(apiToken)) throw new Error('REMOTE_D1_TOKEN_INVALID');
		if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs >= 60_000) {
			throw new Error('REMOTE_D1_TIMEOUT_INVALID');
		}
		this.#apiToken = apiToken;
		this.#fetchImplementation = fetchImplementation;
		this.#requestTimeoutMs = requestTimeoutMs;
		this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/d1/database/${target.databaseId}/query`;
	}

	private async execute<T>(statements: readonly StatementSpec[]): Promise<Array<D1Result<T>>> {
		if (!statements.length) return [];
		assertParameters(statements);
		const readOnly = isReadOnly(statements);
		const attempts = readOnly ? 3 : 1;
		for (let attempt = 1; attempt <= attempts; attempt += 1) {
			let response: Response;
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
			try {
				response = await this.#fetchImplementation(this.endpoint, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${this.#apiToken}`,
						'Content-Type': 'application/json',
					},
					signal: controller.signal,
					body: JSON.stringify({
						batch: statements.map((statement) => ({
							sql: statement.sql,
							params: statement.params ?? [],
						})),
					}),
				});
			} catch (cause) {
				if (readOnly && attempt < attempts) continue;
				throw new RemoteD1Error(
					readOnly ? 'REMOTE_D1_READ_FAILED' : 'REMOTE_D1_DELIVERY_AMBIGUOUS',
					readOnly ? 'definite_failure' : 'ambiguous',
					cause
				);
			} finally {
				clearTimeout(timeout);
			}
			if (!response.ok) {
				if (readOnly && (response.status === 429 || response.status >= 500) && attempt < attempts) {
					continue;
				}
				throw new RemoteD1Error(
					readOnly ? 'REMOTE_D1_READ_FAILED' : 'REMOTE_D1_DELIVERY_AMBIGUOUS',
					readOnly ? 'definite_failure' : 'ambiguous'
				);
			}
			let envelope: RemoteQueryEnvelope<T>;
			try {
				envelope = await readBoundedJson<RemoteQueryEnvelope<T>>(response);
			} catch (cause) {
				throw new RemoteD1Error(
					readOnly ? 'REMOTE_D1_RESULT_INVALID' : 'REMOTE_D1_DELIVERY_AMBIGUOUS',
					readOnly ? 'definite_failure' : 'ambiguous',
					cause
				);
			}
			const results = Array.isArray(envelope.result)
				? envelope.result
				: statements.length === 1 && envelope.result
					? [envelope.result]
					: null;
			if (
				envelope.success !== true ||
				!results ||
				results.length !== statements.length ||
				results.some(
					(result) => result.success !== true || !Array.isArray(result.results ?? [])
				)
			) {
				throw new RemoteD1Error(
					readOnly ? 'REMOTE_D1_RESULT_INVALID' : 'REMOTE_D1_DELIVERY_AMBIGUOUS',
					readOnly ? 'definite_failure' : 'ambiguous'
				);
			}
			return results.map(
				(result) =>
					({
						success: true,
						results: result.results ?? [],
						meta: {
							...result.meta,
							changes:
								typeof result.meta?.changes === 'number' &&
								Number.isFinite(result.meta.changes) &&
								result.meta.changes >= 0
									? result.meta.changes
									: 0,
						},
					}) as unknown as D1Result<T>
			);
		}
		throw new RemoteD1Error('REMOTE_D1_READ_FAILED', 'definite_failure');
	}

	async run<T = Record<string, unknown>>(statement: StatementSpec): Promise<D1Result<T>> {
		return (await this.execute<T>([statement]))[0];
	}

	async first<T = Record<string, unknown>>(statement: StatementSpec): Promise<T | null> {
		const result = (await this.execute<T>([statement]))[0];
		return result.results[0] ?? null;
	}

	async all<T = Record<string, unknown>>(statement: StatementSpec): Promise<D1Result<T>> {
		return (await this.execute<T>([statement]))[0];
	}

	batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]> {
		return this.execute<T>(statements);
	}
}

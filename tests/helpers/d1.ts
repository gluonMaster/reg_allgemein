import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';

export interface TestD1Context {
	db: D1Database;
	migrationIds: string[];
	dispose(): Promise<void>;
}

export interface TestD1MigrationRange {
	after?: string;
	through?: string;
}

export interface D1CostSnapshot {
	queries: number;
	rowsRead: number;
	rowsWritten: number;
}

export interface MeteredD1 {
	database: D1Database;
	snapshot(): D1CostSnapshot;
	reset(): void;
}

export interface CreateMigratedTestD1Options {
	through?: string;
}

const migrationsDirectory = resolve(process.cwd(), 'migrations');

/**
 * Test-only D1 wrapper that retains query metadata even for `first()`, whose
 * public return value normally hides `meta`. Bound values and result rows are
 * deliberately never retained by the meter.
 */
export function createMeteredD1(database: D1Database): MeteredD1 {
	let queries = 0;
	let rowsRead = 0;
	let rowsWritten = 0;
	const originals = new WeakMap<object, D1PreparedStatement>();

	function collect(result: D1Result<unknown>): void {
		queries += 1;
		rowsRead += result.meta.rows_read;
		rowsWritten += result.meta.rows_written;
	}

	function wrap(statement: D1PreparedStatement): D1PreparedStatement {
		const wrapped = {
			bind(...values: unknown[]) {
				return wrap(statement.bind(...values));
			},
			async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
				const result = await statement.all<Record<string, unknown>>();
				collect(result);
				const row = result.results[0];
				if (row === undefined) return null;
				return (columnName === undefined ? row : row[columnName]) as T;
			},
			async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
				const result = await statement.run<T>();
				collect(result);
				return result;
			},
			async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
				const result = await statement.all<T>();
				collect(result);
				return result;
			},
			raw: statement.raw.bind(statement),
		} as D1PreparedStatement;
		originals.set(wrapped, statement);
		return wrapped;
	}

	const metered = {
		prepare(query: string) {
			return wrap(database.prepare(query));
		},
		async batch<T = unknown>(statements: D1PreparedStatement[]) {
			const results = await database.batch<T>(
				statements.map((statement) => originals.get(statement) ?? statement)
			);
			for (const result of results) collect(result);
			return results;
		},
		exec: database.exec.bind(database),
		withSession: database.withSession.bind(database),
		dump: database.dump.bind(database),
	} as D1Database;

	return {
		database: metered,
		snapshot: () => ({ queries, rowsRead, rowsWritten }),
		reset() {
			queries = 0;
			rowsRead = 0;
			rowsWritten = 0;
		},
	};
}

export async function listTestD1MigrationIds(): Promise<string[]> {
	const migrationIds = (await readdir(migrationsDirectory))
		.filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
		.sort();
	if (migrationIds.length === 0) throw new Error('No D1 migrations found.');
	return migrationIds;
}

function migrationIndex(migrationIds: readonly string[], selector: string): number {
	const exactIndex = migrationIds.indexOf(selector);
	if (exactIndex !== -1) return exactIndex;

	if (/^\d{4}$/.test(selector)) {
		const versionMatches = migrationIds
			.map((migrationId, index) => ({ migrationId, index }))
			.filter(({ migrationId }) => migrationId.startsWith(`${selector}_`));
		if (versionMatches.length === 1) return versionMatches[0].index;
		if (versionMatches.length > 1) {
			throw new Error(`D1 migration selector ${selector} is ambiguous.`);
		}
	}

	throw new Error(`Unknown D1 migration selector: ${selector}.`);
}

function selectMigrationIds(
	migrationIds: readonly string[],
	options: TestD1MigrationRange
): string[] {
	const afterIndex =
		options.after === undefined ? -1 : migrationIndex(migrationIds, options.after);
	const throughIndex =
		options.through === undefined
			? migrationIds.length - 1
			: migrationIndex(migrationIds, options.through);

	if (throughIndex < afterIndex) {
		throw new Error('The requested D1 migration range ends before it starts.');
	}
	return migrationIds.slice(afterIndex + 1, throughIndex + 1);
}

async function applyMigrationIds(db: D1Database, migrationIds: readonly string[]): Promise<void> {
	for (const migrationId of migrationIds) {
		const sql = await readFile(resolve(migrationsDirectory, migrationId), 'utf8');
		const statements = unstable_splitSqlQuery(sql)
			.map((statement) => statement.trim())
			.filter(Boolean)
			.map((statement) => db.prepare(statement));
		if (statements.length > 0) await db.batch(statements);
	}
}

export async function applyTestD1Migrations(
	db: D1Database,
	options: TestD1MigrationRange & { after: string }
): Promise<string[]> {
	const availableMigrationIds = await listTestD1MigrationIds();
	const migrationIds = selectMigrationIds(availableMigrationIds, options);
	await applyMigrationIds(db, migrationIds);
	return migrationIds;
}

export async function createMigratedTestD1(
	options: CreateMigratedTestD1Options = {}
): Promise<TestD1Context> {
	const availableMigrationIds = await listTestD1MigrationIds();
	const migrationIds = selectMigrationIds(availableMigrationIds, { through: options.through });
	const miniflare = new Miniflare(
		convertV4MiniflareOptions({
			modules: true,
			script: 'export default { fetch() { return new Response("ok"); } };',
			compatibilityDate: '2026-03-24',
			d1Databases: { DB: `foundation-${crypto.randomUUID()}` },
			d1Persist: false,
		})
	);

	const db = (await miniflare.getD1Database('DB')) as D1Database;

	try {
		await applyMigrationIds(db, migrationIds);
	} catch (error) {
		await miniflare.dispose();
		throw error;
	}

	return {
		db,
		migrationIds,
		dispose: () => miniflare.dispose(),
	};
}

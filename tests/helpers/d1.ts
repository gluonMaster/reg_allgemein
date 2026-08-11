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

export interface CreateMigratedTestD1Options {
	through?: string;
}

const migrationsDirectory = resolve(process.cwd(), 'migrations');

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

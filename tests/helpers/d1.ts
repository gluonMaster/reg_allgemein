import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';

export interface TestD1Context {
	db: D1Database;
	migrationIds: string[];
	dispose(): Promise<void>;
}

export async function createMigratedTestD1(): Promise<TestD1Context> {
	const miniflare = new Miniflare({
		modules: true,
		script: 'export default { fetch() { return new Response("ok"); } };',
		compatibilityDate: '2026-03-24',
		d1Databases: { DB: `foundation-${crypto.randomUUID()}` },
		d1Persist: false,
	});

	const db = (await miniflare.getD1Database('DB')) as D1Database;
	const migrationsDirectory = resolve(process.cwd(), 'migrations');
	const migrationIds = (await readdir(migrationsDirectory))
		.filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
		.sort();

	if (migrationIds.length === 0) throw new Error('No D1 migrations found.');

	try {
		for (const migrationId of migrationIds) {
			const sql = await readFile(resolve(migrationsDirectory, migrationId), 'utf8');
			const statements = unstable_splitSqlQuery(sql)
				.map((statement) => statement.trim())
				.filter(Boolean)
				.map((statement) => db.prepare(statement));
			await db.batch(statements);
		}
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

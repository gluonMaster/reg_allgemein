import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { unstable_readConfig } from 'wrangler';
import {
	AdminBootstrapError,
	AdminBootstrapRepository,
	buildAdminBootstrapStatements,
} from '../src/lib/server/auth/admin-bootstrap';
import {
	assertBootstrapDatabaseId,
	assertBootstrapCliTargetOptions,
	assertBootstrapConfigPath,
	expectedBootstrapConfirmation,
	parseBootstrapEnvironment,
	parseBootstrapOptions,
	requiredBootstrapOption,
} from '../src/lib/server/auth/admin-bootstrap-command';
import { DatabaseBoundary } from '../src/lib/server/db/database';
import {
	assertLocalBootstrapConfigTarget,
	assertRemoteBootstrapConfigTarget,
	assertRemoteBootstrapResult,
	buildPinnedWranglerConfig,
	remoteBootstrapVerificationStatement,
	renderD1BatchSql,
} from './admin-bootstrap-remote';

async function executePinnedRemoteBatch(input: {
	config: Parameters<typeof buildPinnedWranglerConfig>[0];
	databaseId: string;
	sql: string;
}): Promise<unknown> {
	const wranglerCli = fileURLToPath(
		new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)
	);
	const isolatedConfigDirectory = await mkdtemp(join(tmpdir(), 'kolibri-admin-bootstrap-'));
	const isolatedConfigPath = join(isolatedConfigDirectory, 'wrangler.json');
	try {
		await writeFile(isolatedConfigPath, buildPinnedWranglerConfig(input.config), {
			encoding: 'utf8',
			mode: 0o600,
		});
		const stdout = await new Promise<string>((resolve, reject) => {
			execFile(
				process.execPath,
				[
					wranglerCli,
					'd1',
					'execute',
					input.databaseId,
					'--remote',
					'--config',
					isolatedConfigPath,
					'--command',
					input.sql,
					'--json',
					'--yes',
				],
				{ windowsHide: true, maxBuffer: 1_000_000 },
				(error, output) => {
					if (error) {
						reject(new Error('ADMIN_BOOTSTRAP_REMOTE_EXECUTION_FAILED'));
						return;
					}
					resolve(output);
				}
			);
		});
		try {
			return JSON.parse(stdout) as unknown;
		} catch {
			throw new Error('ADMIN_BOOTSTRAP_REMOTE_RESULT_INVALID');
		}
	} finally {
		await rm(isolatedConfigDirectory, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const options = parseBootstrapOptions(process.argv.slice(2));
	const environment = parseBootstrapEnvironment(options.get('environment'));
	const remote = environment !== 'local';
	assertBootstrapCliTargetOptions(environment, options);
	const databaseId = remote
		? assertBootstrapDatabaseId(requiredBootstrapOption(options, 'database-id'))
		: undefined;
	const expectedConfirmation = expectedBootstrapConfirmation(environment, databaseId);
	if (requiredBootstrapOption(options, 'confirmation') !== expectedConfirmation) {
		throw new Error('CLI_BOOTSTRAP_CONFIRMATION_INVALID');
	}
	const configPath = remote ? requiredBootstrapOption(options, 'config') : 'wrangler.local.toml';
	assertBootstrapConfigPath(configPath);
	const targetUserId = requiredBootstrapOption(options, 'user-id');
	const reason = requiredBootstrapOption(options, 'reason');
	const requestId = crypto.randomUUID();
	const now = new Date().toISOString();

	if (environment === 'local') {
		const config = unstable_readConfig({ config: configPath }, { hideWarnings: true });
		const localDatabaseId = assertLocalBootstrapConfigTarget(config);
		const miniflare = new Miniflare({
			modules: true,
			script: 'export default {};',
			d1Databases: { DB: localDatabaseId },
			defaultPersistRoot: fileURLToPath(new URL('../.wrangler/state/v3', import.meta.url)),
		});
		try {
			const repository = new AdminBootstrapRepository(
				new DatabaseBoundary((await miniflare.getD1Database('DB')) as D1Database)
			);
			const before = await repository.status();
			if (before.status !== 'available' || before.activeAdminCount !== 0) {
				throw new Error('ADMIN_BOOTSTRAP_NOT_AVAILABLE');
			}
			await repository.consume({
				targetUserId,
				reason,
				requestId,
				now,
			});
			const after = await repository.status();
			if (after.status !== 'consumed' || after.activeAdminCount !== 1) {
				throw new Error('ADMIN_BOOTSTRAP_ASSERTION_FAILED');
			}
		} finally {
			await miniflare.dispose();
		}
	} else {
		const config = unstable_readConfig({ config: configPath }, { hideWarnings: true });
		assertRemoteBootstrapConfigTarget(config, environment, databaseId!);
		const statements = buildAdminBootstrapStatements({ targetUserId, reason, requestId, now });
		statements.push(remoteBootstrapVerificationStatement({ targetUserId, requestId }));
		const result = await executePinnedRemoteBatch({
			config,
			databaseId: databaseId!,
			sql: renderD1BatchSql(statements),
		});
		assertRemoteBootstrapResult(result, statements.length);
	}
	process.stdout.write(
		`${JSON.stringify(
			{ status: 'consumed', environment, activeAdminCount: 1, requestId },
			null,
			2
		)}\n`
	);
}

main().catch((error: unknown) => {
	const errorCode =
		error instanceof AdminBootstrapError
			? error.code
			: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
				? error.message
				: 'ADMIN_BOOTSTRAP_COMMAND_FAILED';
	process.stdout.write(`${JSON.stringify({ status: 'failed', errorCode }, null, 2)}\n`);
	process.exitCode = 1;
});

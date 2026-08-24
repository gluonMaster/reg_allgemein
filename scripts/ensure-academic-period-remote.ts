import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unstable_readConfig } from 'wrangler';
import {
	assertRemoteAcademicPeriodResult,
	assertRemoteAcademicPeriodConfigPath,
	buildRemoteAcademicPeriodStatements,
	expectedRemoteAcademicPeriodConfirmation,
	parseRemoteAcademicPeriodArguments,
	parseRemoteAcademicPeriodEnvironment,
	remoteAcademicPeriodInputFromOptions,
	requiredRemoteAcademicPeriodOption,
	validateRemoteAcademicPeriodInput,
} from './academic-period-remote';
import { buildPinnedWranglerConfig, renderD1BatchSql } from './admin-bootstrap-remote';
import { assertRemoteD1ConfigTarget, type RemoteD1WranglerConfig } from './remote-d1-target';

function assertExecutableCandidate(gitCommitSha: string): void {
	let status: string;
	let head: string;
	try {
		status = execFileSync(
			'git',
			['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'],
			{ cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
		);
		head = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
			cwd: process.cwd(),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		throw new Error('CLI_GIT_STATE_UNAVAILABLE');
	}
	if (status.trim()) throw new Error('CLI_GIT_WORKTREE_DIRTY');
	if (head.toLowerCase() !== gitCommitSha.toLowerCase()) {
		throw new Error('CLI_GIT_COMMIT_HEAD_MISMATCH');
	}
}

async function executePinnedRemoteBatch(input: {
	config: RemoteD1WranglerConfig;
	databaseId: string;
	sql: string;
}): Promise<unknown> {
	const wranglerCli = fileURLToPath(
		new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)
	);
	const isolatedConfigDirectory = await mkdtemp(join(tmpdir(), 'kolibri-academic-period-'));
	const isolatedConfigPath = join(isolatedConfigDirectory, 'wrangler.json');
	try {
		await writeFile(
			isolatedConfigPath,
			buildPinnedWranglerConfig(input.config, 'kolibri-academic-period-exact-target'),
			{ encoding: 'utf8', mode: 0o600 }
		);
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
						reject(new Error('ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS'));
						return;
					}
					resolve(output);
				}
			);
		});
		try {
			return JSON.parse(stdout) as unknown;
		} catch {
			throw new Error('ACADEMIC_PERIOD_REMOTE_RESULT_INVALID');
		}
	} finally {
		await rm(isolatedConfigDirectory, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const { action, options } = parseRemoteAcademicPeriodArguments(process.argv.slice(2));
	const environment = parseRemoteAcademicPeriodEnvironment(
		requiredRemoteAcademicPeriodOption(options, 'environment')
	);
	const configPath = requiredRemoteAcademicPeriodOption(options, 'config');
	assertRemoteAcademicPeriodConfigPath(configPath);
	const config = unstable_readConfig({ config: configPath }, { hideWarnings: true });
	const target = assertRemoteD1ConfigTarget(
		config,
		environment,
		requiredRemoteAcademicPeriodOption(options, 'database-id')
	);
	const input = remoteAcademicPeriodInputFromOptions(options, environment, target.databaseId);
	const validated = validateRemoteAcademicPeriodInput(input);
	assertExecutableCandidate(validated.gitCommitSha);
	const expectedConfirmation = expectedRemoteAcademicPeriodConfirmation(input);
	if (action === 'confirmation') {
		process.stdout.write(
			`${JSON.stringify(
				{
					status: 'ready',
					environment,
					academicPeriod: validated.academicPeriod,
					operationDigestSha256: validated.operationDigestSha256,
					confirmation: expectedConfirmation,
				},
				null,
				2
			)}\n`
		);
		return;
	}
	if (requiredRemoteAcademicPeriodOption(options, 'confirmation') !== expectedConfirmation) {
		throw new Error('CLI_CONFIRMATION_INVALID');
	}
	const statements = buildRemoteAcademicPeriodStatements(input);
	const result = await executePinnedRemoteBatch({
		config,
		databaseId: target.databaseId,
		sql: renderD1BatchSql(statements),
	});
	assertRemoteAcademicPeriodResult(result, statements.length);
	process.stdout.write(
		`${JSON.stringify(
			{
				status: 'ready',
				environment,
				academicPeriod: validated.academicPeriod,
				isCurrent: true,
				auditRecorded: true,
				operationDigestSha256: validated.operationDigestSha256,
			},
			null,
			2
		)}\n`
	);
}

main().catch((error: unknown) => {
	const errorCode =
		error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
			? error.message
			: 'ACADEMIC_PERIOD_REMOTE_COMMAND_FAILED';
	process.stdout.write(`${JSON.stringify({ status: 'failed', errorCode }, null, 2)}\n`);
	process.exitCode = 1;
});

import { getPlatformProxy } from 'wrangler';
import { DatabaseBoundary } from '../src/lib/server/db/database';
import { ImportRepository, ImportStorageError } from '../src/lib/server/import/import-repository';

function parseOptions(values: string[]): Map<string, string | true> {
	const options = new Map<string, string | true>();
	for (let index = 0; index < values.length; index += 1) {
		const token = values[index];
		if (!token.startsWith('--')) throw new Error('CLI_ARGUMENT_INVALID');
		const key = token.slice(2);
		const next = values[index + 1];
		if (next && !next.startsWith('--')) {
			options.set(key, next);
			index += 1;
		} else options.set(key, true);
	}
	return options;
}

function required(options: Map<string, string | true>, key: string): string {
	const value = options.get(key);
	if (typeof value !== 'string' || !value)
		throw new Error(`CLI_${key.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
	return value;
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const proxy = await getPlatformProxy({
		configPath: 'wrangler.local.toml',
		persist: { path: '.wrangler/state/v3' },
		remoteBindings: false,
	});
	try {
		const repository = new ImportRepository(new DatabaseBoundary(proxy.env.DB as D1Database));
		const period = await repository.ensureAcademicPeriod({
			code: required(options, 'academic-period'),
			displayName: required(options, 'display-name'),
			startsOn: required(options, 'starts-on'),
			endsOn: required(options, 'ends-on'),
			isCurrent: options.get('current') === true,
			now: new Date().toISOString(),
		});
		process.stdout.write(
			`${JSON.stringify({ status: 'ready', academicPeriod: period.code, isCurrent: Boolean(period.is_current) }, null, 2)}\n`
		);
	} finally {
		await proxy.dispose();
	}
}

main().catch((error: unknown) => {
	const errorCode =
		error instanceof ImportStorageError
			? error.code
			: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
				? error.message
				: 'ACADEMIC_PERIOD_COMMAND_FAILED';
	process.stdout.write(`${JSON.stringify({ status: 'failed', errorCode }, null, 2)}\n`);
	process.exitCode = 1;
});

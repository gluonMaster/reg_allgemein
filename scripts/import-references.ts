import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getPlatformProxy } from 'wrangler';
import { buildDependencySet, buildRunFingerprint } from '../src/lib/server/import/canonical';
import { ImportContractError } from '../src/lib/server/import/errors';
import { ImportRepository, ImportStorageError } from '../src/lib/server/import/import-repository';
import { parsePriceWorkbook } from '../src/lib/server/import/local/price-workbook';
import { parseScheduleSnapshot } from '../src/lib/server/import/local/schedule-json';
import { DatabaseBoundary } from '../src/lib/server/db/database';
import type {
	ImportIssueSeverity,
	ImportRunResult,
	ImportSourceKind,
} from '../src/lib/server/import/types';

const DEFAULT_PRICE_SOURCE = 'references/pricing/Price.xlsx';
const DEFAULT_SCHEDULE_SOURCE = 'references/schedule/group_occupancy_snapshot.json';
const DEFAULT_SCHEDULE_HTML = 'references/schedule/enhanced_schedule_visualization.html';

function parseArguments(values: string[]): {
	command: string;
	options: Map<string, string | true>;
} {
	const [command = '', ...rest] = values;
	const options = new Map<string, string | true>();
	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index];
		if (!token.startsWith('--')) throw new Error('CLI_ARGUMENT_INVALID');
		const key = token.slice(2);
		const next = rest[index + 1];
		if (next && !next.startsWith('--')) {
			options.set(key, next);
			index += 1;
		} else {
			options.set(key, true);
		}
	}
	return { command, options };
}

function requiredOption(options: Map<string, string | true>, key: string): string {
	const value = options.get(key);
	if (typeof value !== 'string' || !value)
		throw new Error(`CLI_${key.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
	return value;
}

function stringOption(
	options: Map<string, string | true>,
	key: string,
	fallback?: string
): string | undefined {
	const value = options.get(key);
	if (value === undefined) return fallback;
	if (typeof value !== 'string' || !value)
		throw new Error(`CLI_${key.toUpperCase().replaceAll('-', '_')}_INVALID`);
	return value;
}

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function issueCountRecord(): Record<ImportIssueSeverity, number> {
	return { info: 0, warning: 0, error: 0, fatal: 1 };
}

function printSafe(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function runImport(input: {
	sourceKind: ImportSourceKind;
	options: Map<string, string | true>;
	repository: ImportRepository;
}): Promise<ImportRunResult> {
	const academicPeriod = requiredOption(input.options, 'academic-period');
	const action = stringOption(input.options, 'action', 'dry-run');
	if (action !== 'dry-run' && action !== 'promote') throw new Error('CLI_ACTION_INVALID');
	const period = await input.repository.getAcademicPeriod(academicPeriod);
	if (!period) throw new ImportStorageError('ACADEMIC_PERIOD_UNKNOWN');
	const now = new Date().toISOString();

	let sourceHashSha256: string;
	let structuralFingerprintSha256: string;
	let sourceContractId: string;
	let sourceContractVersion: number;
	let versionHashSha256: string | undefined;
	let dependencyInputs: Record<string, string>;
	let stage:
		| Awaited<ReturnType<ImportRepository['stagePrice']>>
		| Awaited<ReturnType<ImportRepository['stageSchedule']>>
		| undefined;
	let contractFailure: ImportContractError | undefined;
	let parsedPrice: Awaited<ReturnType<typeof parsePriceWorkbook>> | undefined;
	let parsedSchedule: Awaited<ReturnType<typeof parseScheduleSnapshot>> | undefined;

	if (input.sourceKind === 'price') {
		const bytes = await readFile(stringOption(input.options, 'source', DEFAULT_PRICE_SOURCE)!);
		sourceHashSha256 = sha256(bytes);
		sourceContractId = 'price-workbook';
		sourceContractVersion = 1;
		dependencyInputs = { source_contract: 'price-workbook:1' };
		try {
			parsedPrice = await parsePriceWorkbook(bytes);
			structuralFingerprintSha256 = parsedPrice.structuralFingerprintSha256;
			versionHashSha256 = parsedPrice.versionHashSha256;
		} catch (error) {
			if (!(error instanceof ImportContractError)) throw error;
			contractFailure = error;
			structuralFingerprintSha256 = error.structuralFingerprintSha256;
		}
	} else {
		const jsonBytes = await readFile(
			stringOption(input.options, 'source', DEFAULT_SCHEDULE_SOURCE)!
		);
		const htmlBytes = await readFile(
			stringOption(input.options, 'html', DEFAULT_SCHEDULE_HTML)!
		);
		sourceHashSha256 = sha256(jsonBytes);
		sourceContractId = 'schedule-json';
		sourceContractVersion = 1;
		dependencyInputs = {
			html_reference_sha256: sha256(htmlBytes),
			source_contract: 'schedule-json:1',
		};
		try {
			parsedSchedule = await parseScheduleSnapshot({
				jsonText: jsonBytes.toString('utf8'),
				htmlText: htmlBytes.toString('utf8'),
			});
			structuralFingerprintSha256 = parsedSchedule.structuralFingerprintSha256;
			versionHashSha256 = parsedSchedule.versionHashSha256;
		} catch (error) {
			if (!(error instanceof ImportContractError)) throw error;
			contractFailure = error;
			structuralFingerprintSha256 = error.structuralFingerprintSha256;
		}
	}

	const dependencies = await buildDependencySet(dependencyInputs);
	const runFingerprint = await buildRunFingerprint({
		sourceKind: input.sourceKind,
		academicPeriodId: period.id,
		sourceHashSha256,
		dependencySetHashSha256: dependencies.hashSha256,
	});
	const existing = await input.repository.findPromotedRun(runFingerprint);
	if (existing) {
		const promotion = await input.repository.promote(existing.id, now);
		return {
			runId: promotion.runId,
			status: 'noop',
			sourceKind: input.sourceKind,
			academicPeriod,
			sourceHashSha256,
			versionHashSha256,
		};
	}

	const { runId } = await input.repository.createRun({
		sourceKind: input.sourceKind,
		academicPeriodId: period.id,
		sourceLabel: input.sourceKind === 'price' ? 'price-workbook' : 'schedule-json',
		sourceHashSha256,
		sourceContractId,
		sourceContractVersion,
		structuralFingerprintSha256,
		dependencyHashes: dependencies.canonical,
		dependencySetHashSha256: dependencies.hashSha256,
		runFingerprint,
		now,
	});

	if (contractFailure) {
		await input.repository.failContractRun({ runId, issue: contractFailure.issue, now });
		return {
			runId,
			status: 'failed',
			sourceKind: input.sourceKind,
			academicPeriod,
			sourceHashSha256,
			issueCounts: issueCountRecord(),
			errorCode: contractFailure.issue.code,
		};
	}

	if (parsedPrice)
		stage = await input.repository.stagePrice({ runId, period, snapshot: parsedPrice, now });
	else if (parsedSchedule) {
		stage = await input.repository.stageSchedule({
			runId,
			period,
			snapshot: parsedSchedule,
			now,
		});
	} else throw new Error('IMPORT_PARSER_RESULT_MISSING');

	if (stage.status === 'failed' || action === 'dry-run') {
		return {
			runId,
			status: stage.status,
			sourceKind: input.sourceKind,
			academicPeriod,
			sourceHashSha256,
			versionHashSha256: stage.versionHashSha256,
			diff: stage.diff,
			issueCounts: stage.issueCounts,
			rows: {
				total:
					input.sourceKind === 'price'
						? parsedPrice!.rowsTotal
						: parsedSchedule!.rowsTotal,
				staged:
					input.sourceKind === 'price'
						? parsedPrice!.rowsStaged
						: parsedSchedule!.rowsStaged,
				promoted: 0,
				skipped:
					input.sourceKind === 'price'
						? parsedPrice!.rowsSkipped
						: parsedSchedule!.rowsSkipped,
			},
			errorCode: stage.status === 'failed' ? 'VALIDATION_FAILED' : undefined,
		};
	}

	const promotion = await input.repository.promote(runId, now);
	return {
		runId: promotion.runId,
		status: promotion.outcome === 'noop' ? 'noop' : 'promoted',
		sourceKind: input.sourceKind,
		academicPeriod,
		sourceHashSha256,
		versionHashSha256: stage.versionHashSha256,
		diff: stage.diff,
		issueCounts: stage.issueCounts,
		rows: {
			total:
				input.sourceKind === 'price' ? parsedPrice!.rowsTotal : parsedSchedule!.rowsTotal,
			staged:
				input.sourceKind === 'price' ? parsedPrice!.rowsStaged : parsedSchedule!.rowsStaged,
			promoted: stage.rowsPromotable,
			skipped:
				input.sourceKind === 'price'
					? parsedPrice!.rowsSkipped
					: parsedSchedule!.rowsSkipped,
		},
	};
}

async function main(): Promise<void> {
	const { command, options } = parseArguments(process.argv.slice(2));
	const proxy = await getPlatformProxy({
		configPath: 'wrangler.local.toml',
		persist: { path: '.wrangler/state/v3' },
		remoteBindings: false,
	});
	try {
		const repository = new ImportRepository(new DatabaseBoundary(proxy.env.DB as D1Database));
		if (command === 'price' || command === 'schedule') {
			const result = await runImport({ sourceKind: command, options, repository });
			printSafe(result);
			if (result.status === 'failed') process.exitCode = 1;
			return;
		}
		if (command === 'status') {
			const limitValue = stringOption(options, 'limit');
			const limit = limitValue ? Number(limitValue) : undefined;
			if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1))
				throw new Error('CLI_LIMIT_INVALID');
			printSafe(
				await repository.safeStatus({ runId: stringOption(options, 'run-id'), limit })
			);
			return;
		}
		if (command === 'rollback') {
			const sourceKind = requiredOption(options, 'source-kind');
			if (sourceKind !== 'price' && sourceKind !== 'schedule')
				throw new Error('CLI_SOURCE_KIND_INVALID');
			const academicPeriod = requiredOption(options, 'academic-period');
			const period = await repository.getAcademicPeriod(academicPeriod);
			if (!period) throw new ImportStorageError('ACADEMIC_PERIOD_UNKNOWN');
			const result = await repository.rollback({
				sourceKind,
				academicPeriodId: period.id,
				toVersionId: stringOption(options, 'to-version'),
				now: new Date().toISOString(),
			});
			printSafe({ status: 'rolled_back', sourceKind, academicPeriod, ...result });
			return;
		}
		throw new Error('CLI_COMMAND_INVALID');
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
				: 'IMPORT_COMMAND_FAILED';
	printSafe({ status: 'failed', errorCode });
	process.exitCode = 1;
});

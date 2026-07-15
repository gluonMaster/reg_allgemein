import { createHash } from 'node:crypto';
import { buildDependencySet, buildRunFingerprint } from '$lib/server/import/canonical';
import { ImportContractError } from '$lib/server/import/errors';
import { ImportRepository, type StagedImportResult } from '$lib/server/import/import-repository';
import { parsePriceWorkbook } from '$lib/server/import/local/price-workbook';
import { parseScheduleSnapshot } from '$lib/server/import/local/schedule-json';
import type { AcademicPeriodRow } from '$lib/server/import/types';
import { DatabaseBoundary } from '$lib/server/db/database';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';
import {
	createSyntheticPriceWorkbook,
	createSyntheticSchedule,
	type SyntheticScheduleBlock,
} from '../helpers/import-fixtures';

const instant = (seconds: number): string =>
	`2026-07-15T10:00:${String(seconds).padStart(2, '0')}.000Z`;
const bytesHash = (bytes: Uint8Array | string): string =>
	createHash('sha256').update(bytes).digest('hex');

async function stagePrice(input: {
	repository: ImportRepository;
	period: AcademicPeriodRow;
	workbook: Buffer;
	now: string;
}): Promise<StagedImportResult & { runFingerprint: string }> {
	const snapshot = await parsePriceWorkbook(input.workbook);
	const dependencies = await buildDependencySet({ source_contract: 'price-workbook:1' });
	const sourceHashSha256 = bytesHash(input.workbook);
	const runFingerprint = await buildRunFingerprint({
		sourceKind: 'price',
		academicPeriodId: input.period.id,
		sourceHashSha256,
		dependencySetHashSha256: dependencies.hashSha256,
	});
	const run = await input.repository.createRun({
		sourceKind: 'price',
		academicPeriodId: input.period.id,
		sourceLabel: 'synthetic-price',
		sourceHashSha256,
		sourceContractId: snapshot.sourceContractId,
		sourceContractVersion: snapshot.sourceContractVersion,
		structuralFingerprintSha256: snapshot.structuralFingerprintSha256,
		dependencyHashes: dependencies.canonical,
		dependencySetHashSha256: dependencies.hashSha256,
		runFingerprint,
		now: input.now,
	});
	return {
		...(await input.repository.stagePrice({
			runId: run.runId,
			period: input.period,
			snapshot,
			now: input.now,
		})),
		runFingerprint,
	};
}

async function stageSchedule(input: {
	repository: ImportRepository;
	period: AcademicPeriodRow;
	fixture: ReturnType<typeof createSyntheticSchedule>;
	now: string;
}): Promise<StagedImportResult> {
	const snapshot = await parseScheduleSnapshot(input.fixture);
	const dependencies = await buildDependencySet({
		html_reference_sha256: bytesHash(input.fixture.htmlText),
		source_contract: 'schedule-json:1',
	});
	const sourceHashSha256 = bytesHash(input.fixture.jsonText);
	const runFingerprint = await buildRunFingerprint({
		sourceKind: 'schedule',
		academicPeriodId: input.period.id,
		sourceHashSha256,
		dependencySetHashSha256: dependencies.hashSha256,
	});
	const run = await input.repository.createRun({
		sourceKind: 'schedule',
		academicPeriodId: input.period.id,
		sourceLabel: 'synthetic-schedule',
		sourceHashSha256,
		sourceContractId: snapshot.sourceContractId,
		sourceContractVersion: snapshot.sourceContractVersion,
		structuralFingerprintSha256: snapshot.structuralFingerprintSha256,
		dependencyHashes: dependencies.canonical,
		dependencySetHashSha256: dependencies.hashSha256,
		runFingerprint,
		now: input.now,
	});
	return input.repository.stageSchedule({
		runId: run.runId,
		period: input.period,
		snapshot,
		now: input.now,
	});
}

async function recordContractFailure(input: {
	repository: ImportRepository;
	period: AcademicPeriodRow;
	sourceKind: 'price' | 'schedule';
	sourceHashSha256: string;
	dependencyInputs: Record<string, string>;
	error: ImportContractError;
	now: string;
}): Promise<string> {
	const dependencies = await buildDependencySet(input.dependencyInputs);
	const runFingerprint = await buildRunFingerprint({
		sourceKind: input.sourceKind,
		academicPeriodId: input.period.id,
		sourceHashSha256: input.sourceHashSha256,
		dependencySetHashSha256: dependencies.hashSha256,
	});
	const run = await input.repository.createRun({
		sourceKind: input.sourceKind,
		academicPeriodId: input.period.id,
		sourceLabel: `synthetic-${input.sourceKind}`,
		sourceHashSha256: input.sourceHashSha256,
		sourceContractId: input.sourceKind === 'price' ? 'price-workbook' : 'schedule-json',
		sourceContractVersion: 1,
		structuralFingerprintSha256: input.error.structuralFingerprintSha256,
		dependencyHashes: dependencies.canonical,
		dependencySetHashSha256: dependencies.hashSha256,
		runFingerprint,
		now: input.now,
	});
	await input.repository.failContractRun({
		runId: run.runId,
		issue: input.error.issue,
		now: input.now,
	});
	return run.runId;
}

describe('versioned price and schedule imports in D1', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;
	let repository: ImportRepository;
	let period: AcademicPeriodRow;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		repository = new ImportRepository(db);
		period = await repository.ensureAcademicPeriod({
			code: '2026-2027',
			displayName: '2026/2027',
			startsOn: '2026-08-01',
			endsOn: '2027-07-31',
			isCurrent: false,
			now: instant(0),
		});
	});

	afterEach(async () => {
		if (context) await context.dispose();
	});

	it('promotes price atomically, preserves yearly/monthly columns and returns a promoted retry as no-op', async () => {
		const staged = await stagePrice({
			repository,
			period,
			workbook: createSyntheticPriceWorkbook(),
			now: instant(1),
		});

		expect(staged.status).toBe('validated');
		expect(staged.diff).toEqual({ added: 1, changed: 0, retired: 0, unchanged: 0 });
		const promoted = await repository.promote(staged.runId, instant(2));
		expect(promoted.outcome).toBe('promoted');
		expect(await repository.promote(staged.runId, instant(3))).toMatchObject({
			outcome: 'noop',
			runId: staged.runId,
		});

		const activeVersions = await context.db
			.prepare('SELECT COUNT(*) AS count FROM price_versions WHERE is_active = 1')
			.first<{ count: number }>();
		const rule = await context.db
			.prepare(
				`SELECT yearly_price_cents, monthly_price_cents, provenance_json
				FROM price_rules WHERE price_version_id = ? AND is_valid = 1`
			)
			.bind(staged.versionId)
			.first<{
				yearly_price_cents: number;
				monthly_price_cents: number;
				provenance_json: string;
			}>();
		expect(activeVersions?.count).toBe(1);
		expect(rule).toMatchObject({ yearly_price_cents: 4625, monthly_price_cents: 6050 });
		expect(JSON.parse(rule!.provenance_json)).toMatchObject({
			yearlySourceColumn: 'Preis',
			monthlySourceColumn: 'Sonderpreis',
		});
	});

	it('leaves the current price unchanged on fatal rates and links a retry of the failed fingerprint', async () => {
		const valid = await stagePrice({
			repository,
			period,
			workbook: createSyntheticPriceWorkbook(),
			now: instant(1),
		});
		await repository.promote(valid.runId, instant(2));
		const invalidWorkbook = createSyntheticPriceWorkbook({
			rows: [
				{
					key: 'Invalid synthetic rule',
					preis: '0',
					dauer: '90',
					faecher: null,
					sonderpreis: '60',
					kinder: '1',
				},
			],
		});
		const firstFailure = await stagePrice({
			repository,
			period,
			workbook: invalidWorkbook,
			now: instant(3),
		});
		const secondFailure = await stagePrice({
			repository,
			period,
			workbook: invalidWorkbook,
			now: instant(4),
		});

		expect(firstFailure.status).toBe('failed');
		expect(secondFailure.status).toBe('failed');
		await expect(repository.promote(firstFailure.runId, instant(5))).rejects.toMatchObject({
			code: 'IMPORT_RUN_FAILED',
		});
		const retry = await context.db
			.prepare('SELECT attempt_no, retry_of_run_id FROM import_runs WHERE id = ?')
			.bind(secondFailure.runId)
			.first<{ attempt_no: number; retry_of_run_id: string }>();
		const current = await context.db
			.prepare('SELECT id FROM price_versions WHERE is_active = 1')
			.first<{ id: string }>();
		expect(retry).toEqual({ attempt_no: 2, retry_of_run_id: firstFailure.runId });
		expect(current?.id).toBe(valid.versionId);
	});

	it('allows only one of two same-fingerprint concurrent attempts to become promoted', async () => {
		const workbook = createSyntheticPriceWorkbook();
		const first = await stagePrice({ repository, period, workbook, now: instant(1) });
		const second = await stagePrice({ repository, period, workbook, now: instant(2) });

		const outcomes = await Promise.allSettled([
			repository.promote(first.runId, instant(3)),
			repository.promote(second.runId, instant(3)),
		]);
		const promotedRuns = await context.db
			.prepare(
				`SELECT COUNT(*) AS count FROM import_runs
				WHERE run_fingerprint = ? AND status = 'promoted'`
			)
			.bind(first.runFingerprint)
			.first<{ count: number }>();
		const activeVersions = await context.db
			.prepare('SELECT COUNT(*) AS count FROM price_versions WHERE is_active = 1')
			.first<{ count: number }>();

		expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
		expect(promotedRuns?.count).toBe(1);
		expect(activeVersions?.count).toBe(1);
	});

	it('rejects activation without a valid promotion fence', async () => {
		const staged = await stagePrice({
			repository,
			period,
			workbook: createSyntheticPriceWorkbook(),
			now: instant(1),
		});

		await expect(
			context.db
				.prepare(
					`UPDATE price_versions SET is_active = 1, activated_at = ?,
					promotion_owner = 'forged', promotion_fencing_token = 999 WHERE id = ?`
				)
				.bind(instant(2), staged.versionId)
				.run()
		).rejects.toThrow(/invalid price promotion fence/);
	});

	it('records schema, header and schedule-ID fatal attempts without changing either current version', async () => {
		const price = await stagePrice({
			repository,
			period,
			workbook: createSyntheticPriceWorkbook(),
			now: instant(1),
		});
		await repository.promote(price.runId, instant(2));
		const schedule = await stageSchedule({
			repository,
			period,
			fixture: createSyntheticSchedule(),
			now: instant(3),
		});
		await repository.promote(schedule.runId, instant(4));

		const duplicateHeaderBytes = createSyntheticPriceWorkbook({ duplicateHeader: true });
		let headerError: ImportContractError | undefined;
		try {
			await parsePriceWorkbook(duplicateHeaderBytes);
		} catch (error) {
			if (error instanceof ImportContractError) headerError = error;
			else throw error;
		}
		expect(headerError?.issue.code).toBe('PRICE_HEADER_AMBIGUOUS');
		await recordContractFailure({
			repository,
			period,
			sourceKind: 'price',
			sourceHashSha256: bytesHash(duplicateHeaderBytes),
			dependencyInputs: { source_contract: 'price-workbook:1' },
			error: headerError!,
			now: instant(5),
		});

		const invalidScheduleFixtures = [
			createSyntheticSchedule({ schemaVersion: 2, generationId: 'invalid-schema' }),
			createSyntheticSchedule({
				generationId: 'duplicate-id',
				blocks: [
					{
						id: 'duplicate',
						day: 'Mo',
						building: 'B1',
						room: 'R1',
						startTime: '16:00',
						endTime: '17:00',
						lessonType: 'group',
						subject: 'Subject A',
						teacher: 'Lehrkraft A',
						displayName: 'Group A',
					},
					{
						id: 'duplicate',
						day: 'Di',
						building: 'B2',
						room: 'R2',
						startTime: '17:00',
						endTime: '18:00',
						lessonType: 'group',
						subject: 'Subject B',
						teacher: 'Lehrkraft B',
						displayName: 'Group B',
					},
				],
			}),
		];
		for (const [index, fixture] of invalidScheduleFixtures.entries()) {
			let contractError: ImportContractError | undefined;
			try {
				await parseScheduleSnapshot(fixture);
			} catch (error) {
				if (error instanceof ImportContractError) contractError = error;
				else throw error;
			}
			expect(contractError).toBeDefined();
			await recordContractFailure({
				repository,
				period,
				sourceKind: 'schedule',
				sourceHashSha256: bytesHash(fixture.jsonText),
				dependencyInputs: {
					html_reference_sha256: bytesHash(fixture.htmlText),
					source_contract: 'schedule-json:1',
				},
				error: contractError!,
				now: instant(6 + index),
			});
		}

		const currentPrice = await context.db
			.prepare('SELECT id FROM price_versions WHERE is_active = 1')
			.first<{ id: string }>();
		const currentSchedule = await context.db
			.prepare('SELECT id FROM schedule_versions WHERE is_published = 1')
			.first<{ id: string }>();
		const fatalCodes = await context.db
			.prepare(`SELECT code FROM import_issues WHERE severity = 'fatal' ORDER BY code`)
			.all<{ code: string }>();
		expect(currentPrice?.id).toBe(price.versionId);
		expect(currentSchedule?.id).toBe(schedule.versionId);
		expect(fatalCodes.results.map((row) => row.code)).toEqual([
			'PRICE_HEADER_AMBIGUOUS',
			'SCHEDULE_BLOCK_ID_AMBIGUOUS',
			'SCHEDULE_SCHEMA_UNSUPPORTED',
		]);
	});

	it('soft-retires missing schedule blocks and atomically rolls back to the previous version', async () => {
		const originalBlocks: SyntheticScheduleBlock[] = [
			{
				id: 'block-a',
				day: 'Mo',
				building: 'B1',
				room: 'R1',
				startTime: '16:00',
				endTime: '17:30',
				lessonType: 'group',
				subject: 'Subject A',
				teacher: 'Lehrkraft A',
				displayName: 'Same display name',
			},
			{
				id: 'block-b',
				day: 'Di',
				building: 'B2',
				room: 'R2',
				startTime: '17:00',
				endTime: '18:00',
				lessonType: 'group',
				subject: 'Subject B',
				teacher: 'Lehrkraft B',
				displayName: 'Same display name',
			},
		];
		const first = await stageSchedule({
			repository,
			period,
			fixture: createSyntheticSchedule({
				blocks: originalBlocks,
				generationId: 'generation-1',
			}),
			now: instant(1),
		});
		await repository.promote(first.runId, instant(2));
		expect(await repository.promote(first.runId, instant(2))).toMatchObject({
			outcome: 'noop',
		});
		const second = await stageSchedule({
			repository,
			period,
			fixture: createSyntheticSchedule({
				blocks: [{ ...originalBlocks[0], room: 'R9' }],
				generationId: 'generation-2',
			}),
			now: instant(3),
		});
		expect(second.diff).toEqual({ added: 0, changed: 1, retired: 1, unchanged: 0 });
		await repository.promote(second.runId, instant(4));

		const retired = await context.db
			.prepare(
				`SELECT catalog_status, retired_at FROM course_groups
				WHERE source_offering_key = 'schedule:primary:block-b'`
			)
			.first<{ catalog_status: string; retired_at: string | null }>();
		expect(retired?.catalog_status).toBe('retired');
		expect(retired?.retired_at).toBe(instant(4));

		const rollback = await repository.rollback({
			sourceKind: 'schedule',
			academicPeriodId: period.id,
			now: instant(5),
		});
		expect(rollback).toEqual({
			versionId: first.versionId,
			previousVersionId: second.versionId,
		});
		const published = await context.db
			.prepare('SELECT id FROM schedule_versions WHERE is_published = 1')
			.all<{ id: string }>();
		const currentSessions = await context.db
			.prepare('SELECT COUNT(*) AS count FROM course_sessions WHERE is_current = 1')
			.first<{ count: number }>();
		const restored = await context.db
			.prepare(
				`SELECT catalog_status, retired_at FROM course_groups
				WHERE source_offering_key = 'schedule:primary:block-b'`
			)
			.first<{ catalog_status: string; retired_at: string | null }>();
		expect(published.results).toEqual([{ id: first.versionId }]);
		expect(currentSessions?.count).toBe(2);
		expect(restored).toEqual({ catalog_status: 'published', retired_at: null });
	});

	it('keeps PII-like schedule values out of safe run summaries and issues', async () => {
		const staged = await stageSchedule({
			repository,
			period,
			fixture: createSyntheticSchedule({
				blocks: [
					{
						id: 'block-safe-report',
						day: 'Mo',
						building: 'Synthetic Street 7',
						room: '555-0100',
						startTime: '16:00',
						endTime: '17:30',
						lessonType: 'unknown',
						subject: 'Synthetic subject',
						teacher: 'person@example.invalid',
						displayName: 'Synthetic display',
					},
				],
			}),
			now: instant(1),
		});
		const status = JSON.stringify(await repository.safeStatus({ runId: staged.runId }));

		expect(status).not.toContain('person@example.invalid');
		expect(status).not.toContain('555-0100');
		expect(status).not.toContain('Synthetic Street 7');
		expect(status).toContain('SCHEDULE_LESSON_KIND_NEEDS_REVIEW');
	});
});

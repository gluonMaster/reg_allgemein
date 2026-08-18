import { createHash } from 'node:crypto';
import { buildDependencySet, buildRunFingerprint } from '$lib/server/import/canonical';
import {
	createSyntheticAccessExtract,
	parseAccessExtract,
	type AccessSourceRow,
} from '$lib/server/import/local/access-database';
import { buildLegacyPreviewSyntheticPlusBText } from '$lib/server/import/local/legacy-preview-fixture';
import { parsePlusBTextWorkbook } from '$lib/server/import/local/plusbtext-workbook';
import {
	ImportRepository,
	type LegacyReleaseVerificationContract,
	type StagedImportResult,
} from '$lib/server/import/import-repository';
import type { AcademicPeriodRow, PlusBTextImportSnapshot } from '$lib/server/import/types';
import {
	DatabaseBoundary,
	type SqlDatabaseBoundary,
	type StatementSpec,
} from '$lib/server/db/database';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';
import {
	createSyntheticAccessRow,
	createSyntheticPlusBTextWorkbook,
	type SyntheticPlusBTextRow,
} from '../helpers/import-fixtures';

const instant = (seconds: number): string =>
	`2026-07-15T11:00:${String(seconds).padStart(2, '0')}.000Z`;
const bytesHash = (value: Uint8Array | string): string =>
	createHash('sha256').update(value).digest('hex');

class SyntheticAmbiguousDelivery extends Error {
	readonly delivery = 'ambiguous' as const;
}

class OneShotAmbiguousBoundary implements SqlDatabaseBoundary {
	private triggered = false;

	constructor(
		private readonly inner: SqlDatabaseBoundary,
		private readonly timing: 'before_commit' | 'after_commit',
		private readonly sqlMarker: string
	) {}

	private matches(statements: readonly StatementSpec[]): boolean {
		return (
			!this.triggered &&
			statements.some((statement) => statement.sql.includes(this.sqlMarker))
		);
	}

	private before(statements: readonly StatementSpec[]): void {
		if (this.timing === 'before_commit' && this.matches(statements)) {
			this.triggered = true;
			throw new SyntheticAmbiguousDelivery();
		}
	}

	private after(statements: readonly StatementSpec[]): void {
		if (this.timing === 'after_commit' && this.matches(statements)) {
			this.triggered = true;
			throw new SyntheticAmbiguousDelivery();
		}
	}

	async run<T = Record<string, unknown>>(statement: StatementSpec): Promise<D1Result<T>> {
		this.before([statement]);
		const result = await this.inner.run<T>(statement);
		this.after([statement]);
		return result;
	}

	first<T = Record<string, unknown>>(statement: StatementSpec): Promise<T | null> {
		return this.inner.first<T>(statement);
	}

	all<T = Record<string, unknown>>(statement: StatementSpec): Promise<D1Result<T>> {
		return this.inner.all<T>(statement);
	}

	async batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]> {
		this.before(statements);
		const result = await this.inner.batch<T>(statements);
		this.after(statements);
		return result;
	}
}

async function stagePlus(input: {
	repository: ImportRepository;
	period: AcademicPeriodRow;
	rows?: SyntheticPlusBTextRow[];
	bytes?: Uint8Array;
	now: string;
	runId?: string;
	versionId?: string;
}): Promise<StagedImportResult & { snapshot: PlusBTextImportSnapshot }> {
	const bytes = input.bytes ?? createSyntheticPlusBTextWorkbook({ rows: input.rows });
	const snapshot = await parsePlusBTextWorkbook(bytes);
	const dependencies = await buildDependencySet({
		source_contract: 'admin-xlsm-plusbtext:1',
	});
	const sourceHashSha256 = bytesHash(bytes);
	const runFingerprint = await buildRunFingerprint({
		sourceKind: 'plusbtext',
		academicPeriodId: input.period.id,
		sourceHashSha256,
		dependencySetHashSha256: dependencies.hashSha256,
	});
	const run = await input.repository.createRun({
		runId: input.runId,
		sourceKind: 'plusbtext',
		academicPeriodId: input.period.id,
		sourceLabel: 'synthetic-plusbtext',
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
		...(await input.repository.stagePlusBText({
			runId: run.runId,
			versionId: input.versionId,
			period: input.period,
			snapshot,
			now: input.now,
		})),
		snapshot,
	};
}

async function stageSyntheticPreviewPlus(input: {
	repository: ImportRepository;
	period: AcademicPeriodRow;
	variant: 'baseline' | 'candidate';
	runId: string;
	versionId: string;
	now: string;
}): Promise<StagedImportResult & { snapshot: PlusBTextImportSnapshot }> {
	const snapshot = await buildLegacyPreviewSyntheticPlusBText(input.variant);
	const dependencies = await buildDependencySet({
		source_contract: 'admin-xlsm-plusbtext:1',
	});
	const sourceHashSha256 = bytesHash(`legacy-preview-synthetic-${input.variant}-v1`);
	const runFingerprint = await buildRunFingerprint({
		sourceKind: 'plusbtext',
		academicPeriodId: input.period.id,
		sourceHashSha256,
		dependencySetHashSha256: dependencies.hashSha256,
	});
	await input.repository.createRun({
		runId: input.runId,
		sourceKind: 'plusbtext',
		academicPeriodId: input.period.id,
		sourceLabel: `legacy-preview-synthetic-${input.variant}`,
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
		...(await input.repository.stagePlusBText({
			runId: input.runId,
			versionId: input.versionId,
			period: input.period,
			snapshot,
			now: input.now,
		})),
		snapshot,
	};
}

async function stageAccess(input: {
	repository: ImportRepository;
	period: AcademicPeriodRow;
	rows: AccessSourceRow[];
	now: string;
	plusBTextVersionId?: string;
	allowValidatedStagedPlusBText?: boolean;
	runId?: string;
	versionId?: string;
}): Promise<StagedImportResult & { snapshot: Awaited<ReturnType<typeof parseAccessExtract>> }> {
	const plus = await input.repository.loadPlusBTextVersion({
		academicPeriodId: input.period.id,
		versionId: input.plusBTextVersionId,
		allowValidatedStaged: input.allowValidatedStagedPlusBText,
	});
	if (!plus) throw new Error('PlusBText test prerequisite missing.');
	const snapshot = await parseAccessExtract({
		extract: await createSyntheticAccessExtract(input.rows),
		academicPeriodCode: input.period.code,
		plusBTextVersionId: plus.versionId,
		plusBText: plus,
	});
	const dependencies = await buildDependencySet({
		plusbtext_version_sha256: plus.versionHashSha256,
		source_contract: 'access-tblkartei:1',
	});
	const sourceHashSha256 = bytesHash(JSON.stringify(input.rows));
	const runFingerprint = await buildRunFingerprint({
		sourceKind: 'access',
		academicPeriodId: input.period.id,
		sourceHashSha256,
		dependencySetHashSha256: dependencies.hashSha256,
	});
	const run = await input.repository.createRun({
		runId: input.runId,
		sourceKind: 'access',
		academicPeriodId: input.period.id,
		sourceLabel: 'synthetic-access',
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
		...(await input.repository.stageAccess({
			runId: run.runId,
			versionId: input.versionId,
			period: input.period,
			snapshot,
			now: input.now,
		})),
		snapshot,
	};
}

function verificationContract(
	plus: StagedImportResult & { snapshot: PlusBTextImportSnapshot },
	access: StagedImportResult & { snapshot: Awaited<ReturnType<typeof parseAccessExtract>> }
): LegacyReleaseVerificationContract {
	if (plus.verificationRows?.kind !== 'plusbtext' || access.verificationRows?.kind !== 'access') {
		throw new Error('Synthetic verification rows missing.');
	}
	return {
		plusBText: {
			rowsTotal: plus.snapshot.rowsTotal,
			rowsStaged: plus.snapshot.rowsStaged,
			rowsSkipped: plus.snapshot.rowsSkipped,
			oldGroups: plus.verificationRows.oldGroups,
			targets: plus.verificationRows.targets,
		},
		access: {
			rowsTotal: access.snapshot.rowsTotal,
			rowsStaged: access.snapshot.rowsStaged,
			rowsSkipped: access.snapshot.rowsSkipped,
			sourceRows: access.verificationRows.sourceRows,
			families: access.verificationRows.families,
			emails: access.verificationRows.emails,
			children: access.verificationRows.children,
			enrollments: access.verificationRows.enrollments,
			projectedFamilies: access.verificationRows.projectedFamilies,
			projectedEmails: access.verificationRows.projectedEmails,
			projectedChildren: access.verificationRows.projectedChildren,
			projectedEnrollments: access.verificationRows.projectedEnrollments,
		},
		issues: {
			info: plus.issueCounts.info + access.issueCounts.info,
			warning: plus.issueCounts.warning + access.issueCounts.warning,
			error: plus.issueCounts.error + access.issueCounts.error,
			fatal: plus.issueCounts.fatal + access.issueCounts.fatal,
		},
	};
}

async function stageReviewedLegacyReplacement(input: {
	repository: ImportRepository;
	period: AcademicPeriodRow;
}): Promise<{
	oldPlusVersionId: string;
	oldAccessVersionId: string;
	newPlusVersionId: string;
	newAccessVersionId: string;
	planId: string;
	reviewDigestSha256: string;
}> {
	const oldPlus = await stagePlus({
		repository: input.repository,
		period: input.period,
		now: instant(1),
	});
	const oldPlusPromotion = await input.repository.promote(oldPlus.runId, instant(2));
	const oldAccess = await stageAccess({
		repository: input.repository,
		period: input.period,
		rows: [createSyntheticAccessRow()],
		now: instant(3),
	});
	const oldAccessPromotion = await input.repository.promote(oldAccess.runId, instant(4));
	const newPlus = await stagePlus({
		repository: input.repository,
		period: input.period,
		rows: [
			{ e: '10', f: 'Old Group' },
			{ k: '10', l: 'Target Group', m: 'Teacher B', n: 'Mo', t: '90' },
		],
		now: instant(5),
	});
	const newAccess = await stageAccess({
		repository: input.repository,
		period: input.period,
		rows: [createSyntheticAccessRow()],
		now: instant(6),
		plusBTextVersionId: newPlus.versionId,
		allowValidatedStagedPlusBText: true,
	});
	const plan = await input.repository.createLegacyReleasePlan({
		planDigestSha256: 'a'.repeat(64),
		stagedDigestSha256: 'b'.repeat(64),
		environment: 'preview',
		targetDatabaseId: '11111111-1111-4111-8111-111111111111',
		gitCommitSha: 'c'.repeat(40),
		plannedBy: 'synthetic-planner',
		stagedBy: 'synthetic-stager',
		academicPeriodId: input.period.id,
		plusBTextRunId: newPlus.runId,
		accessRunId: newAccess.runId,
		plusBTextVersionId: newPlus.versionId,
		accessVersionId: newAccess.versionId,
		expectedCurrentPlusBTextVersionId: oldPlusPromotion.versionId,
		expectedCurrentAccessVersionId: oldAccessPromotion.versionId,
		verificationContract: verificationContract(newPlus, newAccess),
		safeSummary: {
			plusBText: { issueCounts: newPlus.issueCounts, diff: newPlus.diff },
			access: { issueCounts: newAccess.issueCounts, diff: newAccess.diff },
		},
		now: instant(7),
	});
	const reviewed = await input.repository.reviewLegacyReleasePlan({
		planId: plan.id,
		stagedDigestSha256: plan.staged_digest_sha256,
		reviewDigestSha256: 'd'.repeat(64),
		reviewedBy: 'synthetic-operator',
		reasonCode: 'SYNTHETIC_PREVIEW_REVIEW',
		now: instant(8),
	});
	return {
		oldPlusVersionId: oldPlusPromotion.versionId,
		oldAccessVersionId: oldAccessPromotion.versionId,
		newPlusVersionId: newPlus.versionId,
		newAccessVersionId: newAccess.versionId,
		planId: plan.id,
		reviewDigestSha256: reviewed.review_digest_sha256!,
	};
}

describe('versioned Access and PlusBText imports in D1', () => {
	let context: TestD1Context;
	let repository: ImportRepository;
	let period: AcademicPeriodRow;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		repository = new ImportRepository(new DatabaseBoundary(context.db));
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

	it('reconciles an explicitly retried deterministic stage without duplicate snapshots', async () => {
		const plusBytes = createSyntheticPlusBTextWorkbook();
		const plusInput = {
			repository,
			period,
			now: instant(1),
			runId: '11111111-1111-4111-8111-111111111111',
			versionId: '22222222-2222-4222-8222-222222222222',
			bytes: plusBytes,
		};
		const plus = await stagePlus(plusInput);
		await expect(stagePlus(plusInput)).resolves.toMatchObject({
			runId: plus.runId,
			versionId: plus.versionId,
			status: 'validated',
		});

		const accessInput = {
			repository,
			period,
			rows: [createSyntheticAccessRow()],
			now: instant(2),
			plusBTextVersionId: plus.versionId,
			allowValidatedStagedPlusBText: true,
			runId: '33333333-3333-4333-8333-333333333333',
			versionId: '44444444-4444-4444-8444-444444444444',
		};
		const access = await stageAccess(accessInput);
		await expect(stageAccess(accessInput)).resolves.toMatchObject({
			runId: access.runId,
			versionId: access.versionId,
			status: 'validated',
		});

		const counts = await context.db
			.prepare(
				`SELECT
				(SELECT COUNT(*) FROM plusbtext_versions) AS plus_versions,
				(SELECT COUNT(*) FROM legacy_versions) AS access_versions,
				(SELECT COUNT(*) FROM legacy_snapshot_source_rows) AS source_rows`
			)
			.first<{ plus_versions: number; access_versions: number; source_rows: number }>();
		expect(counts).toEqual({ plus_versions: 1, access_versions: 1, source_rows: 1 });
	});

	it('discards failed staging idempotently only for the exact cleanup actor', async () => {
		const plus = await stagePlus({
			repository,
			period,
			now: instant(1),
			runId: '11111111-1111-4111-8111-111111111111',
			versionId: '22222222-2222-4222-8222-222222222222',
		});
		await context.db
			.prepare(
				`UPDATE import_runs SET status = 'failed', error_code = 'SYNTHETIC_STAGE_FAILURE',
					finished_at = ?, updated_at = ? WHERE id = ?`
			)
			.bind(instant(2), instant(2), plus.runId)
			.run();

		const cleanup = {
			runId: plus.runId,
			sourceKind: 'plusbtext' as const,
			operatorId: 'operator.stager',
			now: instant(3),
		};
		await expect(repository.discardFailedLegacyStaging(cleanup)).resolves.toBeUndefined();
		await expect(repository.discardFailedLegacyStaging(cleanup)).resolves.toBeUndefined();
		await expect(
			repository.discardFailedLegacyStaging({
				...cleanup,
				operatorId: 'operator.other',
			})
		).rejects.toMatchObject({
			code: 'LEGACY_RELEASE_FAILED_STAGING_CLEANUP_CONFLICT',
		});

		const counts = await context.db
			.prepare(
				`SELECT
					(SELECT COUNT(*) FROM plusbtext_versions WHERE import_run_id = ?) AS versions,
					(SELECT COUNT(*) FROM legacy_import_stage_cleanup_events
						WHERE import_run_id = ?) AS cleanup_events,
					(SELECT safe_summary_json FROM import_runs WHERE id = ?) AS safe_summary_json`
			)
			.bind(plus.runId, plus.runId, plus.runId)
			.first<{ versions: number; cleanup_events: number; safe_summary_json: string }>();
		expect(counts).toEqual({
			versions: 0,
			cleanup_events: 1,
			safe_summary_json: JSON.stringify({ stagingDiscarded: true }),
		});
	});

	it('stages the allowlisted candidate over a published baseline without contract drift', async () => {
		const baseline = await stageSyntheticPreviewPlus({
			repository,
			period,
			variant: 'baseline',
			runId: '11111111-1111-4111-8111-111111111111',
			versionId: '22222222-2222-4222-8222-222222222222',
			now: instant(1),
		});
		await repository.promote(baseline.runId, instant(2));

		const candidate = await stageSyntheticPreviewPlus({
			repository,
			period,
			variant: 'candidate',
			runId: '33333333-3333-4333-8333-333333333333',
			versionId: '44444444-4444-4444-8444-444444444444',
			now: instant(3),
		});

		expect(candidate.status).toBe('validated');
		expect(candidate.snapshot.structuralFingerprintSha256).toBe(
			baseline.snapshot.structuralFingerprintSha256
		);
		expect(candidate.snapshot.logicalShapeFingerprintSha256).toBe(
			baseline.snapshot.logicalShapeFingerprintSha256
		);
		expect(candidate.snapshot.styleFingerprintSha256).toBe(
			baseline.snapshot.styleFingerprintSha256
		);
		expect(candidate.versionHashSha256).not.toBe(baseline.versionHashSha256);
		expect(candidate.diff).toEqual({ added: 0, changed: 1, retired: 0, unchanged: 1 });
	});

	it('resumes stage after ambiguous before/after-commit outcomes and rejects mixed state', async () => {
		const base = new DatabaseBoundary(context.db);
		const afterBytes = createSyntheticPlusBTextWorkbook({
			rows: [
				{ e: '10', f: 'Old A' },
				{ k: '10', l: 'Target A', t: '60' },
			],
		});
		const afterInput = {
			period,
			now: instant(1),
			runId: '51111111-1111-4111-8111-111111111111',
			versionId: '52222222-2222-4222-8222-222222222222',
			bytes: afterBytes,
		};
		await expect(
			stagePlus({
				...afterInput,
				repository: new ImportRepository(
					new OneShotAmbiguousBoundary(
						base,
						'after_commit',
						'UPDATE import_runs SET status = ?'
					)
				),
			})
		).rejects.toMatchObject({ delivery: 'ambiguous' });
		await expect(stagePlus({ ...afterInput, repository })).resolves.toMatchObject({
			status: 'validated',
			versionId: afterInput.versionId,
		});

		const beforeBytes = createSyntheticPlusBTextWorkbook({
			rows: [
				{ e: '20', f: 'Old B' },
				{ k: '20', l: 'Target B', t: '60' },
			],
		});
		const beforeInput = {
			period,
			now: instant(2),
			runId: '53333333-3333-4333-8333-333333333333',
			versionId: '54444444-4444-4444-8444-444444444444',
			bytes: beforeBytes,
		};
		await expect(
			stagePlus({
				...beforeInput,
				repository: new ImportRepository(
					new OneShotAmbiguousBoundary(
						base,
						'before_commit',
						'INSERT INTO plusbtext_targets'
					)
				),
			})
		).rejects.toMatchObject({ delivery: 'ambiguous' });
		await expect(stagePlus({ ...beforeInput, repository })).resolves.toMatchObject({
			status: 'validated',
			versionId: beforeInput.versionId,
		});

		const mixedBytes = createSyntheticPlusBTextWorkbook({
			rows: [
				{ e: '30', f: 'Old C' },
				{ k: '30', l: 'Target C', t: '60' },
			],
		});
		const mixedInput = {
			period,
			now: instant(3),
			runId: '55555555-5555-4555-8555-555555555555',
			versionId: '56666666-6666-4666-8666-666666666666',
			bytes: mixedBytes,
		};
		await expect(
			stagePlus({
				...mixedInput,
				repository: new ImportRepository(
					new OneShotAmbiguousBoundary(
						base,
						'before_commit',
						'INSERT INTO plusbtext_versions'
					)
				),
			})
		).rejects.toMatchObject({ delivery: 'ambiguous' });
		await context.db
			.prepare(`UPDATE import_runs SET status = 'validated', validated_at = ? WHERE id = ?`)
			.bind(instant(3), mixedInput.runId)
			.run();
		await expect(stagePlus({ ...mixedInput, repository })).rejects.toMatchObject({
			code: 'PLUSB_STAGE_FAILED',
		});
	});

	it('promotes allowlisted legacy state and keeps PII out of status/issues', async () => {
		const plus = await stagePlus({
			repository,
			period,
			rows: [
				{ e: '10', f: 'Old Group' },
				{ k: '10', l: 'Target Group', m: 'Teacher A', n: 'Mo', t: '90' },
				{ l: 'Second Group', m: 'Teacher B', n: 'Di', t: '60' },
			],
			now: instant(1),
		});
		await repository.promote(plus.runId, instant(2));
		expect(await repository.promote(plus.runId, instant(2))).toMatchObject({ outcome: 'noop' });
		const access = await stageAccess({
			repository,
			period,
			rows: [
				createSyntheticAccessRow({ Value19: 'O/V', Value20: '' }),
				createSyntheticAccessRow({
					ID: 102,
					Value15: 'Second Group',
					Value42: null,
					Value48: '102',
				}),
			],
			now: instant(3),
		});
		expect(access.status).toBe('validated');
		await repository.promote(access.runId, instant(4));
		expect(await repository.promote(access.runId, instant(4))).toMatchObject({
			outcome: 'noop',
		});

		const family = await context.db
			.prepare(
				`SELECT source_family_id, claimed_by_user_id, continuity_status
				FROM legacy_families`
			)
			.first<{
				source_family_id: string;
				claimed_by_user_id: string | null;
				continuity_status: string;
			}>();
		const counts = await context.db
			.prepare(
				`SELECT
					(SELECT COUNT(*) FROM legacy_source_rows WHERE is_current = 1) AS source_rows,
					(SELECT COUNT(*) FROM children WHERE is_current = 1) AS children,
					(SELECT COUNT(*) FROM legacy_enrollments WHERE is_current = 1) AS enrollments`
			)
			.first<{ source_rows: number; children: number; enrollments: number }>();
		const marker = await context.db
			.prepare(
				`SELECT contract_kind, price_source, price_mode, duration_minutes, duration_status,
					is_active_for_occupancy FROM legacy_enrollments
				WHERE notes_raw = 'O/V' LIMIT 1`
			)
			.first<{
				contract_kind: string;
				price_source: string;
				price_mode: string;
				duration_minutes: number;
				duration_status: string;
				is_active_for_occupancy: number;
			}>();
		const status = JSON.stringify(await repository.safeStatus({ runId: access.runId }));

		expect(family).toEqual({
			source_family_id: '1. 3477',
			claimed_by_user_id: null,
			continuity_status: 'stable',
		});
		expect(counts).toEqual({ source_rows: 2, children: 1, enrollments: 3 });
		expect(marker).toEqual({
			contract_kind: 'monthly',
			price_source: 'monthly',
			price_mode: 'rule_derived',
			duration_minutes: 90,
			duration_status: 'verified',
			is_active_for_occupancy: 0,
		});
		for (const pii of [
			'parent@example.invalid',
			'555-0100',
			'Synthetic Street 7',
			'Kind Eins',
			'Muster, Maria',
		]) {
			expect(status).not.toContain(pii);
		}
	});

	it('updates a stable package slot, soft-retires missing rows and preserves claim/manual state', async () => {
		const plus = await stagePlus({
			repository,
			period,
			rows: [
				{ e: '10', f: 'Old Group' },
				{ k: '10', l: 'Target Group', m: 'Teacher A', n: 'Mo', t: '90' },
				{ l: 'Renamed Package', m: 'Teacher B', n: 'Di', t: '60' },
			],
			now: instant(1),
		});
		await repository.promote(plus.runId, instant(2));
		const first = await stageAccess({
			repository,
			period,
			rows: [
				createSyntheticAccessRow(),
				createSyntheticAccessRow({
					ID: 102,
					Value1: '1. 5000',
					Value4: 'Other Child',
					Value5: '2015-01-02',
					Value9: 'other-family@example.test',
					Value48: '102',
				}),
			],
			now: instant(3),
		});
		await repository.promote(first.runId, instant(4));
		const state = await context.db
			.prepare(
				`SELECT family.id AS family_id, allocation.id AS allocation_id,
					child.id AS child_id, enrollment.id AS enrollment_id
				FROM legacy_families AS family
				JOIN family_number_allocations AS allocation ON allocation.id = family.family_number_id
				JOIN children AS child ON child.legacy_family_id = family.id
				JOIN legacy_enrollments AS enrollment ON enrollment.child_id = child.id
				WHERE family.source_family_id = '1. 3477' AND enrollment.source_slot = 'package_1'`
			)
			.first<{
				family_id: string;
				allocation_id: string;
				child_id: string;
				enrollment_id: string;
			}>();
		await context.db
			.prepare(
				`UPDATE legacy_families SET claimed_by_user_id = 'user-existing', claimed_at = ?
				WHERE id = ?`
			)
			.bind(instant(5), state!.family_id)
			.run();
		await context.db
			.prepare(
				`UPDATE family_number_allocations SET owner_user_id = 'user-existing' WHERE id = ?`
			)
			.bind(state!.allocation_id)
			.run();
		await context.db
			.prepare(
				`INSERT INTO users
				(id, email, email_normalized, password_hash, email_verified_at, role,
				 first_name, last_name, first_name_normalized, last_name_normalized,
				 family_number_id, family_assignment_status, family_version,
				 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
			 VALUES ('user-existing', 'existing@example.test', 'existing@example.test',
				 'not-used', ?, 'parent', 'Existing', 'Owner', 'existing', 'owner',
				 ?, 'assigned', 1, 'synthetic-notice-v1', ?, ?, ?)`
			)
			.bind(instant(5), state!.allocation_id, instant(5), instant(5), instant(5))
			.run();
		await context.db
			.prepare(
				`UPDATE children SET full_name_override = 'Approved Child',
					full_name = 'Approved Child', full_name_normalized = 'approved child' WHERE id = ?`
			)
			.bind(state!.child_id)
			.run();
		await context.db
			.prepare(`UPDATE legacy_enrollments SET price_mode = 'manual_override' WHERE id = ?`)
			.bind(state!.enrollment_id)
			.run();

		const second = await stageAccess({
			repository,
			period,
			rows: [createSyntheticAccessRow({ Value42: 'Renamed Package' })],
			now: instant(6),
		});
		expect(second.diff).toEqual({ added: 0, changed: 1, retired: 1, unchanged: 0 });
		await repository.promote(second.runId, instant(7));

		const preserved = await context.db
			.prepare(
				`SELECT family.claimed_by_user_id, allocation.owner_user_id,
					child.full_name_override, child.full_name,
					enrollment.id AS enrollment_id, enrollment.group_name_raw,
					enrollment.duration_minutes, enrollment.price_mode
				FROM legacy_families AS family
				JOIN family_number_allocations AS allocation ON allocation.id = family.family_number_id
				JOIN children AS child ON child.legacy_family_id = family.id
				JOIN legacy_enrollments AS enrollment ON enrollment.child_id = child.id
				WHERE family.source_family_id = '1. 3477' AND enrollment.source_slot = 'package_1'`
			)
			.first<Record<string, unknown>>();
		const retired = await context.db
			.prepare(
				`SELECT is_current, retired_at FROM legacy_source_rows
				WHERE source_access_id = 102`
			)
			.first<{ is_current: number; retired_at: string | null }>();

		expect(preserved).toMatchObject({
			claimed_by_user_id: 'user-existing',
			owner_user_id: 'user-existing',
			full_name_override: 'Approved Child',
			full_name: 'Approved Child',
			enrollment_id: state!.enrollment_id,
			group_name_raw: 'Renamed Package',
			duration_minutes: 60,
			price_mode: 'manual_override',
		});
		expect(retired).toEqual({ is_current: 0, retired_at: instant(7) });

		await repository.rollback({
			sourceKind: 'access',
			academicPeriodId: period.id,
			now: instant(8),
		});
		const restored = await context.db
			.prepare(
				`SELECT group_name_raw, price_mode, is_current FROM legacy_enrollments WHERE id = ?`
			)
			.bind(state!.enrollment_id)
			.first<{ group_name_raw: string; price_mode: string; is_current: number }>();
		expect(restored).toEqual({
			group_name_raw: 'Target Group',
			price_mode: 'manual_override',
			is_current: 1,
		});
	});

	it('blocks collision release without creating a canonical orphan', async () => {
		const plus = await stagePlus({ repository, period, now: instant(1) });
		await repository.promote(plus.runId, instant(2));
		await context.db
			.prepare(
				`INSERT INTO family_number_allocations
				(id, namespace, sequence_number, display_family_id, legacy_family_id,
				 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
				 created_at, updated_at)
				VALUES ('collision-allocation', 'legacy_1', 3477, '1. collision', NULL,
				 NULL, 'portal', 'assigned', ?, NULL, ?, ?)`
			)
			.bind(instant(2), instant(2), instant(2))
			.run();
		const access = await stageAccess({
			repository,
			period,
			rows: [createSyntheticAccessRow()],
			now: instant(3),
		});
		await expect(repository.promote(access.runId, instant(4))).rejects.toMatchObject({
			code: 'PROMOTION_FAILED',
		});

		const counts = await context.db
			.prepare(
				`SELECT
					(SELECT COUNT(*) FROM legacy_families) AS families,
					(SELECT COUNT(*) FROM children) AS children,
					(SELECT COUNT(*) FROM legacy_enrollments) AS enrollments,
					(SELECT COUNT(*) FROM legacy_source_rows) AS canonical_source_rows,
					(SELECT COUNT(*) FROM legacy_snapshot_source_rows
						WHERE legacy_version_id = ?) AS snapshot_source_rows,
					(SELECT COUNT(*) FROM legacy_reconciliation_cases
						WHERE issue_code = 'ACCESS_FAMILY_NUMBER_COLLISION'
							AND state = 'open' AND blocks_release = 1) AS blocking_cases`
			)
			.bind(access.versionId)
			.first<{
				families: number;
				children: number;
				enrollments: number;
				canonical_source_rows: number;
				snapshot_source_rows: number;
				blocking_cases: number;
			}>();
		const issue = await context.db
			.prepare(
				`SELECT code, safe_context_json FROM import_issues
				WHERE import_run_id = ? AND code = 'ACCESS_FAMILY_NUMBER_COLLISION'`
			)
			.bind(access.runId)
			.first<{ code: string; safe_context_json: string }>();

		expect(counts).toEqual({
			families: 0,
			children: 0,
			enrollments: 0,
			canonical_source_rows: 0,
			snapshot_source_rows: 1,
			blocking_cases: 1,
		});
		expect(issue).toEqual({
			code: 'ACCESS_FAMILY_NUMBER_COLLISION',
			safe_context_json: '{}',
		});
	});

	it('inherits an unconflicted claim and blocks a child continuity conflict before publication', async () => {
		const plusFirst = await stagePlus({ repository, period, now: instant(1) });
		await repository.promote(plusFirst.runId, instant(2));
		const accessFirst = await stageAccess({
			repository,
			period,
			rows: [createSyntheticAccessRow()],
			now: instant(3),
		});
		await repository.promote(accessFirst.runId, instant(4));
		const identity = await context.db
			.prepare(
				`SELECT family.id AS family_id, family.family_number_id, child.id AS child_id
				FROM legacy_families AS family JOIN children AS child ON child.legacy_family_id = family.id`
			)
			.first<{ family_id: string; family_number_id: string; child_id: string }>();
		await context.db
			.prepare(
				`UPDATE legacy_families SET claimed_by_user_id = 'stable-owner', claimed_at = ? WHERE id = ?`
			)
			.bind(instant(5), identity!.family_id)
			.run();
		await context.db
			.prepare(
				`UPDATE family_number_allocations SET owner_user_id = 'stable-owner' WHERE id = ?`
			)
			.bind(identity!.family_number_id)
			.run();
		await context.db
			.prepare(
				`INSERT INTO users
				(id, email, email_normalized, password_hash, email_verified_at, role,
				 first_name, last_name, first_name_normalized, last_name_normalized,
				 family_number_id, family_assignment_status, family_version,
				 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
			 VALUES ('stable-owner', 'stable@example.test', 'stable@example.test',
				 'not-used', ?, 'parent', 'Stable', 'Owner', 'stable', 'owner',
				 ?, 'assigned', 1, 'synthetic-notice-v1', ?, ?, ?)`
			)
			.bind(instant(5), identity!.family_number_id, instant(5), instant(5), instant(5))
			.run();
		await context.db
			.prepare(`UPDATE children SET owner_user_id = 'stable-owner' WHERE id = ?`)
			.bind(identity!.child_id)
			.run();

		const nextPeriod = await repository.ensureAcademicPeriod({
			code: '2027-2028',
			displayName: '2027/2028',
			startsOn: '2027-08-01',
			endsOn: '2028-07-31',
			isCurrent: false,
			now: instant(6),
		});
		const plusNext = await stagePlus({ repository, period: nextPeriod, now: instant(7) });
		await repository.promote(plusNext.runId, instant(8));
		const stableNext = await stageAccess({
			repository,
			period: nextPeriod,
			rows: [createSyntheticAccessRow({ ID: 201, Value48: '201' })],
			now: instant(9),
		});
		await repository.promote(stableNext.runId, instant(10));

		const stableCounts = await context.db
			.prepare(
				`SELECT
					(SELECT COUNT(*) FROM legacy_families) AS families,
					(SELECT COUNT(*) FROM children) AS children,
					(SELECT COUNT(*) FROM children WHERE owner_user_id = 'stable-owner') AS owned_children`
			)
			.first<{ families: number; children: number; owned_children: number }>();
		expect(stableCounts).toEqual({ families: 1, children: 1, owned_children: 1 });

		const conflict = await stageAccess({
			repository,
			period: nextPeriod,
			rows: [
				createSyntheticAccessRow({
					ID: 202,
					Value5: '2017-04-03',
					Value48: '202',
				}),
			],
			now: instant(11),
		});
		await expect(repository.promote(conflict.runId, instant(12))).rejects.toMatchObject({
			code: 'PROMOTION_FAILED',
		});
		const state = await context.db
			.prepare(
				`SELECT family.claimed_by_user_id, family.continuity_status,
					(SELECT COUNT(*) FROM children WHERE legacy_family_id = family.id) AS child_count,
					(SELECT COUNT(*) FROM children WHERE legacy_family_id = family.id
						AND owner_user_id = 'stable-owner') AS owned_child_count,
					(SELECT COUNT(*) FROM children WHERE legacy_family_id = family.id
						AND owner_user_id IS NULL) AS quarantined_child_count,
					(SELECT COUNT(*) FROM legacy_reconciliation_cases
						WHERE issue_code = 'ACCESS_CONTINUITY_CHILD_IDENTITY_CONFLICT'
							AND state = 'open' AND blocks_release = 1) AS blocking_cases
				FROM legacy_families AS family`
			)
			.first<Record<string, unknown>>();
		const review = await context.db
			.prepare(
				`SELECT code FROM import_issues WHERE import_run_id = ?
					AND code = 'ACCESS_CONTINUITY_CHILD_IDENTITY_CONFLICT'`
			)
			.bind(conflict.runId)
			.first<{ code: string }>();

		expect(state).toMatchObject({
			claimed_by_user_id: 'stable-owner',
			continuity_status: 'stable',
			child_count: 1,
			owned_child_count: 1,
			quarantined_child_count: 0,
			blocking_cases: 1,
		});
		expect(review?.code).toBe('ACCESS_CONTINUITY_CHILD_IDENTITY_CONFLICT');
	}, 45_000);

	it('promotes, rolls back and rolls forward a reviewed PlusBText/Access pair atomically', async () => {
		const staged = await stageReviewedLegacyReplacement({ repository, period });

		await expect(
			repository.transitionLegacyBundle({
				planId: staged.planId,
				reviewDigestSha256: staged.reviewDigestSha256,
				operatorId: 'synthetic-promoter',
				recoveryEvidenceDigestSha256: 'e'.repeat(64),
				action: 'promote',
				now: instant(9),
			})
		).resolves.toMatchObject({
			plusBTextVersionId: staged.newPlusVersionId,
			accessVersionId: staged.newAccessVersionId,
		});
		let current = await context.db
			.prepare(
				`SELECT plus.id AS plus_id, access.id AS access_id,
					access.plusbtext_version_id AS dependency_id
				FROM plusbtext_versions AS plus, legacy_versions AS access
				WHERE plus.academic_period_id = ? AND plus.is_published = 1
					AND access.academic_period_id = ? AND access.is_published = 1`
			)
			.bind(period.id, period.id)
			.first<{ plus_id: string; access_id: string; dependency_id: string }>();
		expect(current).toEqual({
			plus_id: staged.newPlusVersionId,
			access_id: staged.newAccessVersionId,
			dependency_id: staged.newPlusVersionId,
		});

		await repository.transitionLegacyBundle({
			planId: staged.planId,
			reviewDigestSha256: staged.reviewDigestSha256,
			operatorId: 'synthetic-promoter',
			action: 'rollback',
			now: instant(10),
		});
		current = await context.db
			.prepare(
				`SELECT plus.id AS plus_id, access.id AS access_id,
					access.plusbtext_version_id AS dependency_id
				FROM plusbtext_versions AS plus, legacy_versions AS access
				WHERE plus.academic_period_id = ? AND plus.is_published = 1
					AND access.academic_period_id = ? AND access.is_published = 1`
			)
			.bind(period.id, period.id)
			.first<{ plus_id: string; access_id: string; dependency_id: string }>();
		expect(current).toEqual({
			plus_id: staged.oldPlusVersionId,
			access_id: staged.oldAccessVersionId,
			dependency_id: staged.oldPlusVersionId,
		});

		await repository.transitionLegacyBundle({
			planId: staged.planId,
			reviewDigestSha256: staged.reviewDigestSha256,
			operatorId: 'synthetic-promoter',
			action: 'roll_forward',
			now: instant(11),
		});
		await expect(
			repository.transitionLegacyBundle({
				planId: staged.planId,
				reviewDigestSha256: staged.reviewDigestSha256,
				operatorId: 'synthetic-promoter',
				action: 'roll_forward',
				now: instant(11),
			})
		).resolves.toMatchObject({
			action: 'roll_forward',
			plusBTextVersionId: staged.newPlusVersionId,
			accessVersionId: staged.newAccessVersionId,
		});
		await expect(repository.verifyLegacyReleasePlan(staged.planId)).resolves.toMatchObject({
			status: 'promoted',
			currentPair: 'target',
			dependencyCompatible: true,
			runStatus: { plusBText: 'promoted', access: 'promoted' },
			events: { promote: 1, rollback: 1, rollForward: 1 },
		});
		const final = await context.db
			.prepare(
				`SELECT plan.status,
					(SELECT COUNT(*) FROM legacy_import_bundle_events WHERE plan_id = plan.id) AS event_count,
					(SELECT id FROM plusbtext_versions WHERE academic_period_id = ? AND is_published = 1) AS plus_id,
					(SELECT id FROM legacy_versions WHERE academic_period_id = ? AND is_published = 1) AS access_id
				FROM legacy_import_release_plans AS plan WHERE plan.id = ?`
			)
			.bind(period.id, period.id, staged.planId)
			.first<Record<string, unknown>>();
		expect(final).toEqual({
			status: 'promoted',
			event_count: 3,
			plus_id: staged.newPlusVersionId,
			access_id: staged.newAccessVersionId,
		});
	}, 30_000);

	it('enforces the release lifecycle and keeps milestone timestamps immutable in D1', async () => {
		const staged = await stageReviewedLegacyReplacement({ repository, period });

		await expect(
			context.db
				.prepare(
					`UPDATE legacy_import_release_plans
					 SET status = 'staged', updated_at = ? WHERE id = ?`
				)
				.bind(instant(9), staged.planId)
				.run()
		).rejects.toThrow();
		await expect(
			context.db
				.prepare(
					`UPDATE legacy_import_release_plans
					 SET status = 'rolled_back', promoted_at = ?, rolled_back_at = ?, updated_at = ?
					 WHERE id = ?`
				)
				.bind(instant(9), instant(9), instant(9), staged.planId)
				.run()
		).rejects.toThrow();
		await expect(
			context.db
				.prepare(`UPDATE legacy_import_release_plans SET reviewed_at = ? WHERE id = ?`)
				.bind(instant(9), staged.planId)
				.run()
		).rejects.toThrow();
		await expect(
			context.db
				.prepare(`UPDATE legacy_import_release_plans SET created_at = ? WHERE id = ?`)
				.bind(instant(9), staged.planId)
				.run()
		).rejects.toThrow();

		await repository.transitionLegacyBundle({
			planId: staged.planId,
			reviewDigestSha256: staged.reviewDigestSha256,
			operatorId: 'synthetic-promoter',
			recoveryEvidenceDigestSha256: 'e'.repeat(64),
			action: 'promote',
			now: instant(9),
		});
		const promoted = await context.db
			.prepare(
				`SELECT reviewed_at, promoted_at, rolled_back_at
				 FROM legacy_import_release_plans WHERE id = ?`
			)
			.bind(staged.planId)
			.first<{ reviewed_at: string; promoted_at: string; rolled_back_at: string | null }>();
		expect(promoted).toEqual({
			reviewed_at: instant(8),
			promoted_at: instant(9),
			rolled_back_at: null,
		});
		await expect(
			context.db
				.prepare(
					`UPDATE legacy_import_release_plans
					 SET status = 'reviewed', promoted_at = NULL, updated_at = ? WHERE id = ?`
				)
				.bind(instant(10), staged.planId)
				.run()
		).rejects.toThrow();
		await expect(
			context.db
				.prepare(`UPDATE legacy_import_release_plans SET promoted_at = ? WHERE id = ?`)
				.bind(instant(10), staged.planId)
				.run()
		).rejects.toThrow();

		await repository.transitionLegacyBundle({
			planId: staged.planId,
			reviewDigestSha256: staged.reviewDigestSha256,
			operatorId: 'synthetic-promoter',
			action: 'rollback',
			now: instant(10),
		});
		const rolledBack = await context.db
			.prepare(
				`SELECT reviewed_at, promoted_at, rolled_back_at
				 FROM legacy_import_release_plans WHERE id = ?`
			)
			.bind(staged.planId)
			.first<{ reviewed_at: string; promoted_at: string; rolled_back_at: string }>();
		expect(rolledBack).toEqual({
			reviewed_at: instant(8),
			promoted_at: instant(9),
			rolled_back_at: instant(10),
		});
		await expect(
			context.db
				.prepare(`UPDATE legacy_import_release_plans SET rolled_back_at = ? WHERE id = ?`)
				.bind(instant(11), staged.planId)
				.run()
		).rejects.toThrow();

		await repository.transitionLegacyBundle({
			planId: staged.planId,
			reviewDigestSha256: staged.reviewDigestSha256,
			operatorId: 'synthetic-promoter',
			action: 'roll_forward',
			now: instant(11),
		});
		await expect(
			context.db
				.prepare(
					`SELECT reviewed_at, promoted_at, rolled_back_at
					 FROM legacy_import_release_plans WHERE id = ?`
				)
				.bind(staged.planId)
				.first()
		).resolves.toEqual(rolledBack);
	}, 30_000);

	it('rolls back the entire bundle batch when Access publication fails after PlusBText work starts', async () => {
		const staged = await stageReviewedLegacyReplacement({ repository, period });
		await context.db
			.prepare(
				`CREATE TRIGGER synthetic_legacy_bundle_failure
				BEFORE UPDATE OF is_published ON legacy_versions
				WHEN NEW.is_published = 1 AND OLD.is_published = 0
				BEGIN SELECT RAISE(ABORT, 'synthetic legacy bundle failure'); END`
			)
			.run();

		await expect(
			repository.transitionLegacyBundle({
				planId: staged.planId,
				reviewDigestSha256: staged.reviewDigestSha256,
				operatorId: 'synthetic-promoter',
				recoveryEvidenceDigestSha256: 'e'.repeat(64),
				action: 'promote',
				now: instant(9),
			})
		).rejects.toMatchObject({ code: 'LEGACY_RELEASE_TRANSITION_FAILED' });
		const state = await context.db
			.prepare(
				`SELECT plan.status,
					(SELECT COUNT(*) FROM legacy_import_bundle_events WHERE plan_id = plan.id) AS event_count,
					(SELECT id FROM plusbtext_versions WHERE academic_period_id = ? AND is_published = 1) AS plus_id,
					(SELECT id FROM legacy_versions WHERE academic_period_id = ? AND is_published = 1) AS access_id
				FROM legacy_import_release_plans AS plan WHERE plan.id = ?`
			)
			.bind(period.id, period.id, staged.planId)
			.first<Record<string, unknown>>();
		expect(state).toEqual({
			status: 'reviewed',
			event_count: 0,
			plus_id: staged.oldPlusVersionId,
			access_id: staged.oldAccessVersionId,
		});
	});

	it('reconciles ambiguous bundle delivery before and after commit and rejects mixed current state', async () => {
		const staged = await stageReviewedLegacyReplacement({ repository, period });
		const base = new DatabaseBoundary(context.db);
		const transition = {
			planId: staged.planId,
			reviewDigestSha256: staged.reviewDigestSha256,
			operatorId: 'synthetic-promoter',
			recoveryEvidenceDigestSha256: 'e'.repeat(64),
			action: 'promote' as const,
			now: instant(9),
		};
		await expect(
			new ImportRepository(
				new OneShotAmbiguousBoundary(
					base,
					'before_commit',
					'INSERT INTO legacy_import_bundle_events'
				)
			).transitionLegacyBundle(transition)
		).rejects.toMatchObject({ delivery: 'ambiguous' });
		await expect(
			new ImportRepository(
				new OneShotAmbiguousBoundary(
					base,
					'after_commit',
					'INSERT INTO legacy_import_bundle_events'
				)
			).transitionLegacyBundle(transition)
		).rejects.toMatchObject({ delivery: 'ambiguous' });
		await expect(repository.transitionLegacyBundle(transition)).resolves.toMatchObject({
			action: 'promote',
			plusBTextVersionId: staged.newPlusVersionId,
			accessVersionId: staged.newAccessVersionId,
		});

		await context.db
			.prepare(`UPDATE plusbtext_versions SET is_published = 0, retired_at = ? WHERE id = ?`)
			.bind(instant(10), staged.newPlusVersionId)
			.run();
		await expect(repository.transitionLegacyBundle(transition)).rejects.toMatchObject({
			code: 'LEGACY_RELEASE_VERIFY_FAILED',
		});
	}, 30_000);

	it('requires external restore protection for a first import with no logical rollback pair', async () => {
		const plus = await stagePlus({ repository, period, now: instant(1) });
		const access = await stageAccess({
			repository,
			period,
			rows: [createSyntheticAccessRow()],
			now: instant(2),
			plusBTextVersionId: plus.versionId,
			allowValidatedStagedPlusBText: true,
		});
		const plan = await repository.createLegacyReleasePlan({
			planDigestSha256: '1'.repeat(64),
			stagedDigestSha256: '2'.repeat(64),
			environment: 'preview',
			targetDatabaseId: '11111111-1111-4111-8111-111111111111',
			gitCommitSha: '3'.repeat(40),
			plannedBy: 'synthetic-planner',
			stagedBy: 'synthetic-stager',
			academicPeriodId: period.id,
			plusBTextRunId: plus.runId,
			accessRunId: access.runId,
			plusBTextVersionId: plus.versionId,
			accessVersionId: access.versionId,
			expectedCurrentPlusBTextVersionId: null,
			expectedCurrentAccessVersionId: null,
			verificationContract: verificationContract(plus, access),
			safeSummary: {},
			now: instant(3),
		});
		const reviewed = await repository.reviewLegacyReleasePlan({
			planId: plan.id,
			stagedDigestSha256: plan.staged_digest_sha256,
			reviewDigestSha256: '4'.repeat(64),
			reviewedBy: 'synthetic-operator',
			reasonCode: 'SYNTHETIC_FIRST_IMPORT_REVIEW',
			now: instant(4),
		});
		await expect(
			repository.transitionLegacyBundle({
				planId: plan.id,
				reviewDigestSha256: reviewed.review_digest_sha256!,
				operatorId: 'synthetic-promoter',
				action: 'promote',
				now: instant(5),
			})
		).rejects.toMatchObject({ code: 'LEGACY_RELEASE_RECOVERY_EVIDENCE_INVALID' });
		await repository.transitionLegacyBundle({
			planId: plan.id,
			reviewDigestSha256: reviewed.review_digest_sha256!,
			operatorId: 'synthetic-promoter',
			recoveryEvidenceDigestSha256: '5'.repeat(64),
			action: 'promote',
			now: instant(5),
		});
		const recoveryEvidence = await context.db
			.prepare(
				`SELECT recovery_evidence_digest_sha256 FROM legacy_import_bundle_events
				WHERE plan_id = ? AND action = 'promote'`
			)
			.bind(plan.id)
			.first<{ recovery_evidence_digest_sha256: string }>();
		expect(recoveryEvidence?.recovery_evidence_digest_sha256).toBe('5'.repeat(64));

		await expect(
			repository.transitionLegacyBundle({
				planId: plan.id,
				reviewDigestSha256: reviewed.review_digest_sha256!,
				operatorId: 'synthetic-promoter',
				action: 'rollback',
				now: instant(6),
			})
		).rejects.toMatchObject({ code: 'LEGACY_RELEASE_ROLLBACK_TARGET_MISSING' });
	});
});

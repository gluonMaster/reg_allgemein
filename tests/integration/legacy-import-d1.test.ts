import { createHash } from 'node:crypto';
import { buildDependencySet, buildRunFingerprint } from '$lib/server/import/canonical';
import {
	createSyntheticAccessExtract,
	parseAccessExtract,
	type AccessSourceRow,
} from '$lib/server/import/local/access-database';
import { parsePlusBTextWorkbook } from '$lib/server/import/local/plusbtext-workbook';
import { ImportRepository, type StagedImportResult } from '$lib/server/import/import-repository';
import type { AcademicPeriodRow, PlusBTextImportSnapshot } from '$lib/server/import/types';
import { DatabaseBoundary } from '$lib/server/db/database';
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

async function stagePlus(input: {
	repository: ImportRepository;
	period: AcademicPeriodRow;
	rows?: SyntheticPlusBTextRow[];
	now: string;
}): Promise<StagedImportResult & { snapshot: PlusBTextImportSnapshot }> {
	const bytes = createSyntheticPlusBTextWorkbook({ rows: input.rows });
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
}): Promise<StagedImportResult> {
	const plus = await input.repository.loadPlusBTextVersion({
		academicPeriodId: input.period.id,
		versionId: input.plusBTextVersionId,
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
	return input.repository.stageAccess({
		runId: run.runId,
		period: input.period,
		snapshot,
		now: input.now,
	});
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

	it('promotes allowlisted legacy state and keeps PII out of status/issues', async () => {
		const plus = await stagePlus({ repository, period, now: instant(1) });
		await repository.promote(plus.runId, instant(2));
		expect(await repository.promote(plus.runId, instant(2))).toMatchObject({ outcome: 'noop' });
		const access = await stageAccess({
			repository,
			period,
			rows: [
				createSyntheticAccessRow({ Value20: 'O/V' }),
				createSyntheticAccessRow({
					ID: 102,
					Value15: 'Target Group',
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
				WHERE status_code_raw = 'O/V' LIMIT 1`
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

	it('promotes collision evidence without creating a canonical orphan', async () => {
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
		await repository.promote(access.runId, instant(4));

		const counts = await context.db
			.prepare(
				`SELECT
					(SELECT COUNT(*) FROM legacy_families) AS families,
					(SELECT COUNT(*) FROM children) AS children,
					(SELECT COUNT(*) FROM legacy_enrollments) AS enrollments,
					(SELECT COUNT(*) FROM legacy_source_rows
						WHERE is_current = 1 AND legacy_family_id IS NULL AND child_id IS NULL) AS evidence`
			)
			.first<{ families: number; children: number; enrollments: number; evidence: number }>();
		const issue = await context.db
			.prepare(
				`SELECT code, safe_context_json FROM import_issues
				WHERE import_run_id = ? AND code = 'ACCESS_FAMILY_NUMBER_COLLISION'`
			)
			.bind(access.runId)
			.first<{ code: string; safe_context_json: string }>();

		expect(counts).toEqual({ families: 0, children: 0, enrollments: 0, evidence: 1 });
		expect(issue).toEqual({
			code: 'ACCESS_FAMILY_NUMBER_COLLISION',
			safe_context_json: '{}',
		});
	});

	it('inherits an unconflicted claim across periods and quarantines child continuity conflicts', async () => {
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
		await repository.promote(conflict.runId, instant(12));
		const state = await context.db
			.prepare(
				`SELECT family.claimed_by_user_id, family.continuity_status,
					(SELECT COUNT(*) FROM children WHERE legacy_family_id = family.id) AS child_count,
					(SELECT COUNT(*) FROM children WHERE legacy_family_id = family.id
						AND owner_user_id = 'stable-owner') AS owned_child_count,
					(SELECT COUNT(*) FROM children WHERE legacy_family_id = family.id
						AND owner_user_id IS NULL) AS quarantined_child_count
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
			continuity_status: 'needs_review',
			child_count: 2,
			owned_child_count: 1,
			quarantined_child_count: 1,
		});
		expect(review?.code).toBe('ACCESS_CONTINUITY_CHILD_IDENTITY_CONFLICT');
	});
});

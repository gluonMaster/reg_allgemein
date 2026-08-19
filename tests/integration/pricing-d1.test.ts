import { createHash } from 'node:crypto';
import { DatabaseBoundary } from '$lib/server/db/database';
import { buildDependencySet, buildRunFingerprint } from '$lib/server/import/canonical';
import { ImportRepository } from '$lib/server/import/import-repository';
import { parsePlusBTextWorkbook } from '$lib/server/import/local/plusbtext-workbook';
import { parsePriceWorkbook } from '$lib/server/import/local/price-workbook';
import { parseScheduleSnapshot } from '$lib/server/import/local/schedule-json';
import type { AcademicPeriodRow } from '$lib/server/import/types';
import {
	CoursePricingAdminRepository,
	type AuthenticatedAdminActor,
} from '$lib/server/pricing/admin-repository';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import { PricingRepository } from '$lib/server/pricing/pricing-repository';
import { PricingService } from '$lib/server/pricing/pricing-service';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';
import {
	createSyntheticPlusBTextWorkbook,
	createSyntheticPriceWorkbook,
	createSyntheticSchedule,
} from '../helpers/import-fixtures';

const hash = (value: Uint8Array | string): string =>
	createHash('sha256').update(value).digest('hex');
const instant = (second: number): string =>
	`2026-07-15T12:00:${String(second).padStart(2, '0')}.000Z`;
const admin: AuthenticatedAdminActor = { id: 'admin-stage-04', role: 'admin' };
const pricingConfig = {
	individualPriceCentsPer45Min: 3000,
	groupDurationFallbackMinutes: 90,
	missingDurationYearlyCentsPer45Min: 2300,
	missingDurationMonthlyCentsPer45Min: 3000,
	quoteTtlSeconds: 86_400,
};

async function createRun(input: {
	repository: ImportRepository;
	period: AcademicPeriodRow;
	sourceKind: 'price' | 'schedule' | 'plusbtext';
	sourceHashSha256: string;
	sourceContractId: string;
	structuralFingerprintSha256: string;
	dependencies: Record<string, string>;
	now: string;
}): Promise<string> {
	const dependencySet = await buildDependencySet(input.dependencies);
	const runFingerprint = await buildRunFingerprint({
		sourceKind: input.sourceKind,
		academicPeriodId: input.period.id,
		sourceHashSha256: input.sourceHashSha256,
		dependencySetHashSha256: dependencySet.hashSha256,
	});
	return (
		await input.repository.createRun({
			sourceKind: input.sourceKind,
			academicPeriodId: input.period.id,
			sourceLabel: `synthetic-${input.sourceKind}-pricing`,
			sourceHashSha256: input.sourceHashSha256,
			sourceContractId: input.sourceContractId,
			sourceContractVersion: 1,
			structuralFingerprintSha256: input.structuralFingerprintSha256,
			dependencyHashes: dependencySet.canonical,
			dependencySetHashSha256: dependencySet.hashSha256,
			runFingerprint,
			now: input.now,
		})
	).runId;
}

async function importPricingSources(input: {
	repository: ImportRepository;
	period: AcademicPeriodRow;
}): Promise<{ priceRunId: string }> {
	const workbook = createSyntheticPriceWorkbook({
		rows: Array.from({ length: 6 }, (_, index) => ({
			key: 'Kunst',
			preis: String(40 + index + 1),
			dauer: '90',
			faecher: null,
			sonderpreis: String(55 + index + 1),
			kinder: String(index + 1),
		})),
	});
	const price = await parsePriceWorkbook(workbook);
	const priceRunId = await createRun({
		repository: input.repository,
		period: input.period,
		sourceKind: 'price',
		sourceHashSha256: hash(workbook),
		sourceContractId: price.sourceContractId,
		structuralFingerprintSha256: price.structuralFingerprintSha256,
		dependencies: { source_contract: 'price-workbook:1' },
		now: instant(1),
	});
	await input.repository.stagePrice({
		runId: priceRunId,
		period: input.period,
		snapshot: price,
		now: instant(1),
	});
	await input.repository.promote(priceRunId, instant(2));

	const scheduleFixture = createSyntheticSchedule({
		blocks: [
			{
				id: 'kunst-sa',
				day: 'Sa',
				building: 'B1',
				room: 'R1',
				startTime: '10:00',
				endTime: '11:30',
				lessonType: 'group',
				subject: 'Kunst',
				teacher: 'Teacher A',
				displayName: 'Kunst Sa',
			},
			{
				id: 'musik-mo',
				day: 'Mo',
				building: 'B1',
				room: 'R2',
				startTime: '12:00',
				endTime: '13:30',
				lessonType: 'group',
				subject: 'Musik',
				teacher: 'Teacher B',
				displayName: 'Musik Mo',
			},
		],
	});
	const schedule = await parseScheduleSnapshot(scheduleFixture);
	const scheduleRunId = await createRun({
		repository: input.repository,
		period: input.period,
		sourceKind: 'schedule',
		sourceHashSha256: hash(scheduleFixture.jsonText),
		sourceContractId: schedule.sourceContractId,
		structuralFingerprintSha256: schedule.structuralFingerprintSha256,
		dependencies: {
			html_reference_sha256: hash(scheduleFixture.htmlText),
			source_contract: 'schedule-json:1',
		},
		now: instant(3),
	});
	await input.repository.stageSchedule({
		runId: scheduleRunId,
		period: input.period,
		snapshot: schedule,
		now: instant(3),
	});
	await input.repository.promote(scheduleRunId, instant(4));

	const plusBytes = createSyntheticPlusBTextWorkbook({
		rows: [
			{ l: 'Kunst Sa', m: 'Teacher A', n: 'Sa', t: '90' },
			{ l: 'Musik Mo', m: 'Teacher B', n: 'Mo', t: '90' },
		],
	});
	const plus = await parsePlusBTextWorkbook(plusBytes);
	const plusRunId = await createRun({
		repository: input.repository,
		period: input.period,
		sourceKind: 'plusbtext',
		sourceHashSha256: hash(plusBytes),
		sourceContractId: plus.sourceContractId,
		structuralFingerprintSha256: plus.structuralFingerprintSha256,
		dependencies: { source_contract: 'admin-xlsm-plusbtext:1' },
		now: instant(5),
	});
	await input.repository.stagePlusBText({
		runId: plusRunId,
		period: input.period,
		snapshot: plus,
		now: instant(5),
	});
	await input.repository.promote(plusRunId, instant(6));
	return { priceRunId };
}

async function seedOccupancy(input: {
	db: DatabaseBoundary;
	period: AcademicPeriodRow;
	importRunId: string;
	courseGroupId: string;
}): Promise<void> {
	const familyNumberId = 'family-number-stage-04';
	const legacyFamilyId = 'legacy-family-stage-04';
	const ownerUserId = 'occupancy-owner-stage-04';
	await input.db.batch([
		{
			sql: `INSERT INTO family_number_allocations
				(id, namespace, sequence_number, display_family_id, legacy_family_id,
				 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
				 created_at, updated_at)
				VALUES (?, 'legacy_1', 9001, '1. 9001', ?, ?, 'legacy', 'assigned', ?, NULL, ?, ?)`,
			params: [familyNumberId, legacyFamilyId, ownerUserId, instant(7), instant(7), instant(7)],
		},
		{
			sql: `INSERT INTO legacy_families
				(id, source_namespace, source_family_id, family_number_id, numbering_status,
				 claimed_by_user_id, claimed_at, continuity_status, created_at, updated_at)
				VALUES (?, 'legacy_1', '1. 9001', ?, 'valid', ?, ?, 'stable', ?, ?)`,
			params: [legacyFamilyId, familyNumberId, ownerUserId, instant(7), instant(7), instant(7)],
		},
		{
			sql: `INSERT INTO users
				(id, email, email_normalized, password_hash, email_verified_at, role,
				 first_name, last_name, first_name_normalized, last_name_normalized,
				 family_number_id, family_assignment_status, family_version,
				 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
			 VALUES (?, 'occupancy@example.test', 'occupancy@example.test', 'not-used', ?, 'parent',
				 'Occupancy', 'Owner', 'occupancy', 'owner', ?, 'assigned', 1,
				 'synthetic-notice-v1', ?, ?, ?)`,
			params: [ownerUserId, instant(7), familyNumberId, instant(7), instant(7), instant(7)],
		},
	]);
	for (const suffix of ['a', 'b', 'c']) {
		await input.db.run({
			sql: `INSERT INTO children
				(id, owner_user_id, legacy_family_id, family_number_id, origin, source_child_key,
				 source_full_name, source_full_name_normalized, source_birth_date,
				 full_name_override, birth_date_override, full_name, full_name_normalized,
				 birth_date, last_seen_run_id, is_current, created_at, updated_at)
				VALUES (?, ?, NULL, ?, 'portal', ?, ?, ?, '2015-01-01', NULL, NULL,
				 ?, ?, '2015-01-01', ?, 1, ?, ?)`,
			params: [
				`child-${suffix}`,
				ownerUserId,
				familyNumberId,
				`child-key-${suffix}`,
				`Child ${suffix}`,
				`child ${suffix}`,
				`Child ${suffix}`,
				`child ${suffix}`,
				input.importRunId,
				instant(7),
				instant(7),
			],
		});
	}
	await input.db.batch([
		{
			sql: `INSERT INTO enrollments
				(id, user_id, child_id, course_group_id, legacy_enrollment_id, lesson_kind,
				 status, contract_kind, active_from, active_until, current_price_cents,
				 price_source, price_mode, price_effective_from, source, created_at, updated_at)
				VALUES ('portal-a', 'user-a', 'child-a', ?, NULL, 'group', 'active',
				 'group_yearly', '2026-08-01', NULL, 4200, 'excel_yearly', 'rule_derived',
				 '2026-08-01', 'portal', ?, ?)`,
			params: [input.courseGroupId, instant(7), instant(7)],
		},
		{
			sql: `INSERT INTO enrollments
				(id, user_id, child_id, course_group_id, legacy_enrollment_id, lesson_kind,
				 status, contract_kind, active_from, active_until, current_price_cents,
				 price_source, price_mode, price_effective_from, source, created_at, updated_at)
				VALUES ('portal-c-future', 'user-c', 'child-c', ?, NULL, 'group', 'active',
				 'group_yearly', '2026-10-01', NULL, 4200, 'excel_yearly', 'rule_derived',
				 '2026-10-01', 'portal', ?, ?)`,
			params: [input.courseGroupId, instant(7), instant(7)],
		},
	]);
	for (const [index, childId] of ['child-a', 'child-b'].entries()) {
		await input.db.run({
			sql: `INSERT INTO legacy_source_rows
				(id, source_namespace, academic_period_id, source_access_id, value48_mirror,
				 legacy_family_id, child_id, import_run_id, source_hash, source_values_json,
				 last_seen_run_id, is_current, retired_at, created_at, updated_at)
				VALUES (?, 'legacy_1', ?, ?, NULL, ?, ?, ?, ?, '{}', ?, 1, NULL, ?, ?)`,
			params: [
				`legacy-row-${index}`,
				input.period.id,
				900 + index,
				legacyFamilyId,
				childId,
				input.importRunId,
				'a'.repeat(64),
				input.importRunId,
				instant(7),
				instant(7),
			],
		});
	}
	for (const [id, rowId, childId, slot, represented] of [
		['legacy-a', 'legacy-row-0', 'child-a', 'main_next', 'portal-a'],
		['legacy-b-main', 'legacy-row-1', 'child-b', 'main_next', null],
		['legacy-b-package', 'legacy-row-1', 'child-b', 'package_1', null],
	] as const) {
		await input.db.run({
			sql: `INSERT INTO legacy_enrollments
				(id, legacy_source_row_id, legacy_family_id, child_id, academic_period_id,
				 source_slot, source_record_key, group_name_raw, group_name_normalized,
				 course_group_id, duration_minutes, duration_status, status_code_raw, lesson_kind,
				 contract_kind, price_source, price_mode, planned_price_cents, needs_admin_review,
				 is_active_for_occupancy, represented_by_enrollment_id, last_seen_run_id,
				 is_current, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, 'Kunst Sa', 'kunst sa', NULL, 90, 'verified',
				 'J', 'group', 'yearly', 'yearly', 'rule_derived', 4200, 0, 0, ?, ?, 1, ?, ?)`,
			params: [
				id,
				rowId,
				legacyFamilyId,
				childId,
				input.period.id,
				slot,
				`source-${id}`,
				represented,
				input.importRunId,
				instant(7),
				instant(7),
			],
		});
	}
}

describe('stage 04 pricing and occupancy in D1', () => {
	let context: TestD1Context;

	afterEach(async () => {
		if (context) await context.dispose();
	});

	it('maps explicitly, dedupes occupancy, persists/revalidates quotes and audits confirmations', async () => {
		context = await createMigratedTestD1();
		const db = new DatabaseBoundary(context.db);
		const imports = new ImportRepository(db);
		const period = await imports.ensureAcademicPeriod({
			code: '2026-2027',
			displayName: '2026/2027',
			startsOn: '2026-08-01',
			endsOn: '2027-07-31',
			isCurrent: true,
			now: instant(0),
		});
		const sources = await importPricingSources({ repository: imports, period });
		// Pricing still has to support historical published rows with an absent
		// duration. Current imports cannot create that state because IMPORT-08 now
		// blocks PLUSB_DURATION_MISSING before promotion.
		await context.db
			.prepare(
				`UPDATE plusbtext_targets SET duration_minutes = NULL, duration_status = 'missing'
				 WHERE group_name_normalized = 'musik mo'`
			)
			.run();
		const courses = await db.all<{ id: string; display_name: string }>({
			sql: `SELECT id, display_name FROM course_groups WHERE academic_period_id = ?`,
			params: [period.id],
		});
		const kunst = courses.results.find((course) => course.display_name === 'Kunst Sa')!;
		const musik = courses.results.find((course) => course.display_name === 'Musik Mo')!;
		await seedOccupancy({
			db,
			period,
			importRunId: sources.priceRunId,
			courseGroupId: kunst.id,
		});

		const adminRepository = new CoursePricingAdminRepository(db);
		expect(
			await adminRepository.ensureMappingReviewTasks(period.id, instant(8))
		).toBeGreaterThan(0);
		await adminRepository.confirmCourseMapping({
			actor: admin,
			requestId: 'request-map-access',
			courseGroupId: kunst.id,
			sourceKind: 'access',
			sourceValue: 'Kunst Sa',
			reason: 'Verified against the published schedule',
			responsibilityConfirmed: true,
			now: instant(9),
		});
		await adminRepository.confirmCourseMapping({
			actor: admin,
			requestId: 'request-map-plus-kunst',
			courseGroupId: kunst.id,
			sourceKind: 'plusbtext',
			sourceValue: 'Kunst Sa',
			reason: 'Verified PlusBText target',
			responsibilityConfirmed: true,
			now: instant(10),
		});
		await adminRepository.configureCoursePricing({
			actor: admin,
			requestId: 'request-profile-kunst',
			courseGroupId: kunst.id,
			contractKind: 'group_yearly',
			priceKey: 'Kunst',
			subjects: [],
			durationSource: 'plusbtext',
			reason: 'Confirmed public yearly tariff context',
			responsibilityConfirmed: true,
			now: instant(11),
		});

		const occupancy = new OccupancyRepository(db);
		expect(await occupancy.activeChildrenCount(kunst.id, '2026-09-01')).toBe(2);
		expect(await occupancy.activeChildrenCount(kunst.id, '2026-10-01')).toBe(3);
		const [countDuringTransition] = await Promise.all([
			occupancy.activeChildrenCount(kunst.id, '2026-09-01'),
			db.batch([
				{
					sql: `INSERT INTO enrollments
						(id, user_id, child_id, course_group_id, legacy_enrollment_id, lesson_kind,
						 status, contract_kind, active_from, active_until, current_price_cents,
						 price_source, price_mode, price_effective_from, source, created_at, updated_at)
						VALUES ('portal-b', 'user-b', 'child-b', ?, 'legacy-b-main', 'group', 'active',
							 'group_monthly', '2026-08-01', NULL, 5700, 'excel_monthly', 'rule_derived',
						 '2026-08-01', 'portal', ?, ?)`,
					params: [kunst.id, instant(11), instant(11)],
				},
				{
					sql: `UPDATE legacy_enrollments SET represented_by_enrollment_id = 'portal-b',
						updated_at = ? WHERE id IN ('legacy-b-main', 'legacy-b-package')`,
					params: [instant(11)],
				},
			]),
		]);
		expect(countDuringTransition).toBe(2);
		expect(await occupancy.activeChildrenCount(kunst.id, '2026-09-01')).toBe(2);
		const pricing = new PricingRepository(db);
		const service = new PricingService(pricing, occupancy, pricingConfig);
		const exactQuote = await service.createPublicQuote(
			{ courseGroupId: kunst.id, plannedStartOn: '2026-09-01' },
			instant(12)
		);
		expect(exactQuote).toMatchObject({
			activeChildrenCountAsOf: 2,
			lookupChildrenCount: 3,
			status: 'quoted',
			decision: {
				decisionCode: 'EXACT_RULE',
				priceSource: 'excel_yearly',
				finalPriceCents: 4300,
			},
		});
		expect(await service.revalidateQuote(exactQuote.id, instant(13))).toEqual({
			fresh: true,
			reason: 'CURRENT',
		});

		const overrideId = await adminRepository.applyManualOverride({
			actor: admin,
			requestId: 'request-override',
			idempotencyKey: 'override-idempotency-1',
			enrollmentId: 'portal-a',
			basePriceCents: 4300,
			overridePriceCents: 4200,
			priceVersionId: exactQuote.decision.priceVersionId!,
			priceRuleId: exactQuote.decision.priceRuleId,
			priceSource: 'excel_yearly',
			contractKind: 'group_yearly',
			reason: 'Documented individual exception',
			responsibilityConfirmed: true,
			now: instant(14),
		});
		expect(
			await adminRepository.applyManualOverride({
				actor: admin,
				requestId: 'request-override-repeat',
				idempotencyKey: 'override-idempotency-1',
				enrollmentId: 'portal-a',
				basePriceCents: 4300,
				overridePriceCents: 4200,
				priceVersionId: exactQuote.decision.priceVersionId!,
				priceRuleId: exactQuote.decision.priceRuleId,
				priceSource: 'excel_yearly',
				contractKind: 'group_yearly',
				reason: 'Documented individual exception',
				responsibilityConfirmed: true,
				now: instant(15),
			})
		).toBe(overrideId);
		const overrideCounts = await db.first<{ evidence: number; audit: number }>({
			sql: `SELECT
				(SELECT COUNT(*) FROM price_manual_overrides WHERE enrollment_id = 'portal-a') AS evidence,
				(SELECT COUNT(*) FROM audit_events WHERE action = 'enrollment.price.manual_override') AS audit`,
		});
		expect(overrideCounts).toEqual({ evidence: 1, audit: 1 });
		await expect(
			adminRepository.applyManualOverride({
				actor: admin,
				requestId: 'request-override-tampered',
				idempotencyKey: 'override-idempotency-tampered',
				enrollmentId: 'portal-a',
				basePriceCents: 1,
				overridePriceCents: 4200,
				priceVersionId: exactQuote.decision.priceVersionId!,
				priceRuleId: exactQuote.decision.priceRuleId,
				priceSource: 'excel_yearly',
				contractKind: 'group_yearly',
				reason: 'Tampered base must be rejected',
				responsibilityConfirmed: true,
				now: instant(15),
			})
		).rejects.toThrowError(/MANUAL_OVERRIDE_BASE_MISMATCH/);
		const repricing = await service.calculateRepricing({
			courseGroupId: kunst.id,
			effectiveOn: '2026-09-01',
			oldActiveChildrenCount: 1,
			reason: 'occupancy_changed',
		});
		expect(repricing).toMatchObject({
			decisionCode: 'EXACT_RULE',
			activeChildrenCount: 2,
			lookupChildrenCount: 2,
		});
		expect(repricing.proposals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ targetId: 'portal-a', itemRequired: false }),
				expect.objectContaining({ targetId: 'portal-b', itemRequired: false }),
			])
		);

		await adminRepository.confirmCourseMapping({
			actor: admin,
			requestId: 'request-map-plus-musik',
			courseGroupId: musik.id,
			sourceKind: 'plusbtext',
			sourceValue: 'Musik Mo',
			reason: 'Verified blank-duration PlusBText target',
			responsibilityConfirmed: true,
			now: instant(16),
		});
		await adminRepository.configureCoursePricing({
			actor: admin,
			requestId: 'request-profile-musik',
			courseGroupId: musik.id,
			contractKind: 'group_yearly',
			priceKey: 'Musik',
			subjects: [],
			durationSource: 'plusbtext',
			reason: 'Confirmed fallback-eligible source context',
			responsibilityConfirmed: true,
			now: instant(17),
		});
		const fallbackQuote = await service.createPublicQuote(
			{ courseGroupId: musik.id, plannedStartOn: '2026-09-01' },
			instant(18)
		);
		expect(fallbackQuote).toMatchObject({
			status: 'needs_admin_confirmation',
			decision: {
				decisionCode: 'ESTIMATED_MISSING_DURATION',
				finalPriceCents: 4600,
				billingPeriodCode: 'calendar_month',
			},
		});
		const sourceAndQuote = await db.first<{
			source_duration: number | null;
			quote_duration: number;
		}>({
			sql: `SELECT
				(SELECT duration_minutes FROM plusbtext_targets WHERE group_name_normalized = 'musik mo') AS source_duration,
				(SELECT duration_minutes_used FROM price_quotes WHERE id = ?) AS quote_duration`,
			params: [fallbackQuote.id],
		});
		expect(sourceAndQuote).toEqual({ source_duration: null, quote_duration: 90 });
		await adminRepository.confirmEstimatedQuote({
			actor: admin,
			requestId: 'request-confirm-fallback',
			idempotencyKey: 'confirm-fallback-1',
			quoteId: fallbackQuote.id,
			confirmedDurationMinutes: 90,
			confirmedPriceCents: 4600,
			reason: 'Duration and monthly base price checked',
			responsibilityConfirmed: true,
			now: instant(19),
		});
		const confirmation = await db.first<{ status: string; audit: number }>({
			sql: `SELECT quote.status,
				(SELECT COUNT(*) FROM audit_events
				 WHERE action = 'price_quote.missing_duration.confirmed') AS audit
				FROM price_quotes AS quote WHERE quote.id = ?`,
			params: [fallbackQuote.id],
		});
		expect(confirmation).toEqual({ status: 'confirmed', audit: 1 });

		await adminRepository.configureCoursePricing({
			actor: admin,
			requestId: 'request-profile-musik-v2',
			courseGroupId: musik.id,
			contractKind: 'group_yearly',
			priceKey: 'Musik',
			subjects: [],
			durationSource: 'plusbtext',
			reason: 'Explicit profile revision',
			responsibilityConfirmed: true,
			now: instant(20),
		});
		expect(await service.revalidateQuote(fallbackQuote.id, instant(21))).toEqual({
			fresh: false,
			reason: 'QUOTE_DEPENDENCY_CHANGED',
		});
	}, 30_000);
});

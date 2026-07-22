import { createHash } from 'node:crypto';
import { DatabaseBoundary } from '$lib/server/db/database';
import { buildDependencySet, buildRunFingerprint } from '$lib/server/import/canonical';
import { ImportRepository } from '$lib/server/import/import-repository';
import { parsePriceWorkbook } from '$lib/server/import/local/price-workbook';
import type { AcademicPeriodRow } from '$lib/server/import/types';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import { PricingRepository } from '$lib/server/pricing/pricing-repository';
import { PricingService } from '$lib/server/pricing/pricing-service';
import { PriceReviewRepository } from '$lib/server/price-reviews/price-review-repository';
import { PriceReviewService } from '$lib/server/price-reviews/price-review-service';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import { requireAdmin } from '$lib/server/security/authorization';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';
import { createSyntheticPriceWorkbook } from '../helpers/import-fixtures';

const hash = (value: Uint8Array | string): string =>
	createHash('sha256').update(value).digest('hex');
const now = (day: number, hour = 12): string =>
	`2026-08-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;
const pricingConfig = {
	individualPriceCentsPer45Min: 3000,
	groupDurationFallbackMinutes: 90,
	missingDurationYearlyCentsPer45Min: 2300,
	missingDurationMonthlyCentsPer45Min: 3000,
	quoteTtlSeconds: 86_400,
};
const admin = requireAdmin({
	id: 'price-admin',
	role: 'admin',
	emailVerified: true,
	sessionId: 'price-admin-session',
	sessionVersion: 1,
	csrfHash: 'csrf',
});

async function importPrices(repository: ImportRepository, period: AcademicPeriodRow): Promise<string> {
	const workbook = createSyntheticPriceWorkbook({
		rows: Array.from({ length: 6 }, (_, index) => ({
			key: 'Kunst',
			preis: String(41 + index),
			dauer: '90',
			faecher: null,
			sonderpreis: String(56 + index),
			kinder: String(index + 1),
		})),
	});
	const snapshot = await parsePriceWorkbook(workbook);
	const dependencies = await buildDependencySet({ source_contract: 'price-workbook:1' });
	const sourceHash = hash(workbook);
	const runFingerprint = await buildRunFingerprint({
		sourceKind: 'price',
		academicPeriodId: period.id,
		sourceHashSha256: sourceHash,
		dependencySetHashSha256: dependencies.hashSha256,
	});
	const { runId } = await repository.createRun({
		sourceKind: 'price',
		academicPeriodId: period.id,
		sourceLabel: 'synthetic-stage-10-price',
		sourceHashSha256: sourceHash,
		sourceContractId: snapshot.sourceContractId,
		sourceContractVersion: 1,
		structuralFingerprintSha256: snapshot.structuralFingerprintSha256,
		dependencyHashes: dependencies.canonical,
		dependencySetHashSha256: dependencies.hashSha256,
		runFingerprint,
		now: '2026-07-31T08:00:00.000Z',
	});
	await repository.stagePrice({
		runId,
		period,
		snapshot,
		now: '2026-07-31T08:01:00.000Z',
	});
	await repository.promote(runId, '2026-07-31T08:02:00.000Z');
	return runId;
}

async function seedScenario(db: DatabaseBoundary) {
	const imports = new ImportRepository(db);
	const period = await imports.ensureAcademicPeriod({
		code: '2026-2027-review',
		displayName: '2026/2027 review',
		startsOn: '2026-08-01',
		endsOn: '2027-07-31',
		isCurrent: true,
		now: '2026-07-31T07:59:00.000Z',
	});
	const importRunId = await importPrices(imports, period);
	const version = await db.first<{ id: string }>({
		sql: `SELECT id FROM price_versions WHERE academic_period_id = ? AND is_active = 1`,
		params: [period.id],
	});
	if (!version) throw new Error('active test price version missing');
	const rules = await db.all<{ id: string; children_count: number; yearly_price_cents: number }>({
		sql: `SELECT id, children_count, yearly_price_cents FROM price_rules
			WHERE price_version_id = ? ORDER BY children_count`,
		params: [version.id],
	});
	const rule = (count: number) => rules.results.find((candidate) => candidate.children_count === count)!;
	await db.batch([
		{
			sql: `INSERT INTO course_groups
				(id, academic_period_id, source_offering_key, display_name, normalized_price_key,
				 lesson_kind, subject, capacity_default, capacity_override, requires_admin_approval,
				 catalog_status, last_seen_schedule_version_id, retired_at, created_at, updated_at)
			VALUES ('course-price-review', ?, 'course-price-review', 'Kunst Review', 'kunst',
				'group', 'Kunst', 12, NULL, 0, 'published', NULL, NULL, ?, ?)`,
			params: [period.id, now(1), now(1)],
		},
		{
			sql: `INSERT INTO course_pricing_profiles
				(id, course_group_id, contract_kind, price_key, normalized_price_key,
				 subjects_json, duration_source, admin_duration_minutes, status, version,
				 reason, confirmed_by, created_at, updated_at)
			VALUES ('profile-price-review', 'course-price-review', 'group_yearly', 'Kunst',
				'kunst', '[]', 'admin_confirmed', 90, 'confirmed', 1,
				'test fixture', 'price-admin', ?, ?)`,
			params: [now(1), now(1)],
		},
	]);
	await db.run({
		sql: `INSERT INTO users
			(id, email, email_normalized, password_hash, email_verified_at, role,
			 first_name, last_name, first_name_normalized, last_name_normalized,
			 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
		VALUES ('price-admin', 'price-admin@example.test', 'price-admin@example.test', 'unused', ?,
			'admin', 'Price', 'Admin', 'price', 'admin', 'test-v1', ?, ?, ?)`,
		params: [now(1), now(1), now(1), now(1)],
	});
	for (let index = 1; index <= 6; index += 1) {
		const userId = `price-parent-${index}`;
		const familyId = `price-family-${index}`;
		const childId = `price-child-${index}`;
		await db.batch([
			{
				sql: `INSERT INTO family_number_allocations
					(id, namespace, sequence_number, display_family_id, legacy_family_id,
					 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
					 created_at, updated_at)
				VALUES (?, 'portal_2', ?, ?, NULL, ?, 'portal', 'assigned', ?, NULL, ?, ?)`,
				params: [familyId, 10_000 + index, `2. ${10_000 + index}`, userId,
					now(1), now(1), now(1)],
			},
			{
				sql: `INSERT INTO users
					(id, email, email_normalized, password_hash, email_verified_at, role,
					 first_name, last_name, first_name_normalized, last_name_normalized,
					 family_number_id, family_assignment_status, family_version,
					 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
				VALUES (?, ?, ?, 'unused', ?, 'parent', 'Parent', ?, 'parent', ?, ?,
					'assigned', 1, 'test-v1', ?, ?, ?)`,
				params: [userId, `${userId}@example.test`, `${userId}@example.test`, now(1),
					String(index), String(index), familyId, now(1), now(1), now(1)],
			},
			{
				sql: `INSERT INTO children
					(id, owner_user_id, legacy_family_id, family_number_id, origin, source_child_key,
					 source_full_name, source_full_name_normalized, source_birth_date,
					 full_name_override, birth_date_override, full_name, full_name_normalized,
					 birth_date, last_seen_run_id, is_current, created_at, updated_at)
				VALUES (?, ?, NULL, ?, 'portal', ?, ?, ?, '2015-01-01', NULL, NULL, ?, ?,
					'2015-01-01', ?, 1, ?, ?)`,
				params: [childId, userId, familyId, childId, `Child ${index}`, `child ${index}`,
					`Child ${index}`, `child ${index}`, importRunId, now(1), now(1)],
			},
		]);
		const currentRule = index === 6 ? rule(6) : rule(5);
		await db.run({
			sql: `INSERT INTO enrollments
				(id, user_id, child_id, course_group_id, legacy_enrollment_id, lesson_kind,
				 status, contract_kind, active_from, active_until, current_price_cents,
				 price_source, price_mode, price_effective_from, source, created_at, updated_at,
				 current_base_price_cents, current_price_version_id, current_price_rule_id,
				 price_assignment_version)
			VALUES (?, ?, ?, 'course-price-review', NULL, 'group', 'active', 'group_yearly',
				'2026-08-01', NULL, ?, 'excel_yearly', 'rule_derived', '2026-08-01',
				'portal', ?, ?, ?, ?, ?, 1)`,
			params: [
				`price-enrollment-${index}`, userId, childId, currentRule.yearly_price_cents,
				now(1), now(1), currentRule.yearly_price_cents, version.id, currentRule.id,
			],
		});
	}
	return {
		periodId: period.id,
		importRunId,
		versionId: version.id,
		rule1: rule(1),
		rule4: rule(4),
		rule5: rule(5),
		rule6: rule(6),
	};
}

async function seedLegacyTargets(
	db: DatabaseBoundary,
	fixture: Awaited<ReturnType<typeof seedScenario>>
): Promise<void> {
	await db.batch([
		{
			sql: `INSERT INTO course_groups
				(id, academic_period_id, source_offering_key, display_name, normalized_price_key,
				 lesson_kind, subject, capacity_default, capacity_override, requires_admin_approval,
				 catalog_status, last_seen_schedule_version_id, retired_at, created_at, updated_at)
			VALUES ('course-legacy-review', ?, 'course-legacy-review', 'Legacy Kunst', 'kunst',
				'group', 'Kunst', 12, NULL, 0, 'published', NULL, NULL, ?, ?)`,
			params: [fixture.periodId, now(1), now(1)],
		},
		{
			sql: `INSERT INTO course_pricing_profiles
				(id, course_group_id, contract_kind, price_key, normalized_price_key,
				 subjects_json, duration_source, admin_duration_minutes, status, version,
				 reason, confirmed_by, created_at, updated_at)
			VALUES ('profile-legacy-review', 'course-legacy-review', 'group_yearly', 'Kunst',
				'kunst', '[]', 'admin_confirmed', 90, 'confirmed', 1,
				'test fixture', 'price-admin', ?, ?)`,
			params: [now(1), now(1)],
		},
	]);
	await db.run({
		sql: `INSERT INTO enrollments
			(id, user_id, child_id, course_group_id, legacy_enrollment_id, lesson_kind,
			 status, contract_kind, active_from, active_until, current_price_cents,
			 price_source, price_mode, price_effective_from, source, created_at, updated_at,
			 current_base_price_cents, current_price_version_id, current_price_rule_id,
			 price_assignment_version)
		VALUES ('legacy-representation-portal', 'price-parent-3', 'price-child-3',
			'course-legacy-review', NULL, 'group', 'active', 'group_yearly', '2026-08-01',
			NULL, ?, 'excel_yearly', 'rule_derived', '2026-08-01', 'portal', ?, ?, ?, ?, ?, 1)`,
		params: [fixture.rule5.yearly_price_cents, now(1), now(1),
			fixture.rule5.yearly_price_cents, fixture.versionId, fixture.rule5.id],
	});
	const targets = [
		{ suffix: 'known', user: 1, planned: 5000, needsReview: 0, represented: null },
		{ suffix: 'unknown', user: 2, planned: null, needsReview: 0, represented: null },
		{ suffix: 'conflict', user: 5, planned: 5000, needsReview: 1, represented: null },
		{ suffix: 'represented', user: 3, planned: 5000, needsReview: 0,
			represented: 'legacy-representation-portal' },
	] as const;
	for (const [index, target] of targets.entries()) {
		const legacyFamilyId = `legacy-review-family-${target.suffix}`;
		const familyNumberId = `price-family-${target.user}`;
		const childId = `price-child-${target.user}`;
		const sourceRowId = `legacy-review-row-${target.suffix}`;
		await db.batch([
			{
				sql: `INSERT INTO legacy_families
					(id, source_namespace, source_family_id, family_number_id, numbering_status,
					 claimed_by_user_id, claimed_at, continuity_status, created_at, updated_at)
				VALUES (?, 'legacy_1', ?, ?, 'valid', ?, ?, 'stable', ?, ?)`,
				params: [legacyFamilyId, `legacy-review-${target.suffix}`, familyNumberId,
					`price-parent-${target.user}`, now(1), now(1), now(1)],
			},
			{
				sql: `INSERT INTO legacy_source_rows
					(id, source_namespace, academic_period_id, source_access_id, value48_mirror,
					 legacy_family_id, child_id, import_run_id, source_hash, source_values_json,
					 last_seen_run_id, is_current, retired_at, created_at, updated_at)
				VALUES (?, 'legacy_1', ?, ?, NULL, ?, ?, ?, ?, '{}', ?, 1, NULL, ?, ?)`,
				params: [sourceRowId, fixture.periodId, 20_000 + index, legacyFamilyId,
					childId, fixture.importRunId, String(index + 1).repeat(64).slice(0, 64),
					fixture.importRunId, now(1), now(1)],
			},
		]);
		await db.run({
			sql: `INSERT INTO legacy_enrollments
				(id, legacy_source_row_id, legacy_family_id, child_id, academic_period_id,
				 source_slot, source_record_key, group_name_raw, group_name_normalized,
				 course_group_id, duration_minutes, duration_status, status_code_raw, lesson_kind,
				 contract_kind, price_source, price_mode, planned_price_cents, needs_admin_review,
				 is_active_for_occupancy, represented_by_enrollment_id, last_seen_run_id,
				 is_current, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, 'main_next', ?, 'Legacy Kunst', 'legacy kunst',
				'course-legacy-review', 90, 'verified', 'J', 'group', 'yearly', 'yearly',
				'rule_derived', ?, ?, 1, ?, ?, 1, ?, ?)`,
			params: [`legacy-review-${target.suffix}`, sourceRowId, legacyFamilyId, childId,
				fixture.periodId, `legacy-review-record-${target.suffix}`, target.planned,
				target.needsReview, target.represented, fixture.importRunId, now(1), now(1)],
		});
	}

	await db.batch([
		{
			sql: `INSERT INTO family_number_allocations
				(id, namespace, sequence_number, display_family_id, legacy_family_id,
				 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
				 created_at, updated_at)
			VALUES ('legacy-review-unclaimed-number', 'legacy_1', 29999, '1. 29999',
				'legacy-review-family-unclaimed', NULL, 'legacy', 'assigned', ?, NULL, ?, ?)`,
			params: [now(1), now(1), now(1)],
		},
		{
			sql: `INSERT INTO legacy_families
				(id, source_namespace, source_family_id, family_number_id, numbering_status,
				 claimed_by_user_id, claimed_at, continuity_status, created_at, updated_at)
			VALUES ('legacy-review-family-unclaimed', 'legacy_1', 'legacy-review-unclaimed',
				'legacy-review-unclaimed-number', 'valid', NULL, NULL, 'stable', ?, ?)`,
			params: [now(1), now(1)],
		},
		{
			sql: `INSERT INTO children
				(id, owner_user_id, legacy_family_id, family_number_id, origin, source_child_key,
				 source_full_name, source_full_name_normalized, source_birth_date,
				 full_name_override, birth_date_override, full_name, full_name_normalized,
				 birth_date, last_seen_run_id, is_current, created_at, updated_at)
			VALUES ('legacy-review-child-unclaimed', NULL, 'legacy-review-family-unclaimed',
				'legacy-review-unclaimed-number', 'legacy', 'legacy-review-child-unclaimed',
				'Legacy Child', 'legacy child', '2015-01-01', NULL, NULL, 'Legacy Child',
				'legacy child', '2015-01-01', ?, 1, ?, ?)`,
			params: [fixture.importRunId, now(1), now(1)],
		},
		{
			sql: `INSERT INTO legacy_source_rows
				(id, source_namespace, academic_period_id, source_access_id, value48_mirror,
				 legacy_family_id, child_id, import_run_id, source_hash, source_values_json,
				 last_seen_run_id, is_current, retired_at, created_at, updated_at)
			VALUES ('legacy-review-row-unclaimed', 'legacy_1', ?, 20010, NULL,
				'legacy-review-family-unclaimed', 'legacy-review-child-unclaimed', ?, ?, '{}',
				?, 1, NULL, ?, ?)`,
			params: [fixture.periodId, fixture.importRunId, 'f'.repeat(64), fixture.importRunId,
				now(1), now(1)],
		},
		{
			sql: `INSERT INTO legacy_enrollments
				(id, legacy_source_row_id, legacy_family_id, child_id, academic_period_id,
				 source_slot, source_record_key, group_name_raw, group_name_normalized,
				 course_group_id, duration_minutes, duration_status, status_code_raw, lesson_kind,
				 contract_kind, price_source, price_mode, planned_price_cents, needs_admin_review,
				 is_active_for_occupancy, represented_by_enrollment_id, last_seen_run_id,
				 is_current, created_at, updated_at)
			VALUES ('legacy-review-unclaimed', 'legacy-review-row-unclaimed',
				'legacy-review-family-unclaimed', 'legacy-review-child-unclaimed', ?, 'main_next',
				'legacy-review-record-unclaimed', 'Legacy Kunst', 'legacy kunst',
				'course-legacy-review', 90, 'verified', 'J', 'group', 'yearly', 'yearly',
				'rule_derived', 5000, 0, 1, NULL, ?, 1, ?, ?)`,
			params: [fixture.periodId, fixture.importRunId, now(1), now(1)],
		},
	]);
}

function parentActor(index: number): AuthenticatedUser {
	return {
		id: `price-parent-${index}`,
		role: 'parent',
		emailVerified: true,
		sessionId: `session-${index}`,
		sessionVersion: 1,
		csrfHash: 'csrf',
	};
}

describe('stage 10 controlled price reviews in D1', () => {
	let context: TestD1Context;

	afterEach(async () => {
		if (context) await context.dispose();
	});

	it('deduplicates 5-to-6 review, separates approvals, revalidates and applies exactly once', async () => {
		context = await createMigratedTestD1();
		const db = new DatabaseBoundary(context.db);
		const fixture = await seedScenario(db);
		const occupancy = new OccupancyRepository(db);
		const repository = new PriceReviewRepository(db);
		await repository.advanceReconcilerWatermark(now(2));
		const pricing = new PricingService(new PricingRepository(db), occupancy, pricingConfig);
		const service = new PriceReviewService(repository, pricing, occupancy, {
			portalPublicOrigin: 'https://portal.example.test',
		});

		const firstTrigger = await service.createOccupancyTrigger({
			courseGroupId: 'course-price-review',
			sourceKind: 'contract_activation',
			sourceRef: 'price-enrollment-6',
			reasonCode: 'activation',
			effectiveOn: '2026-08-01',
			oldActiveCount: 5,
			newActiveCount: 6,
			dedupeKey: 'enrollment:price-enrollment-6:active_from:2026-08-01:v1',
			now: now(1),
		});
		const replayedTrigger = await service.createOccupancyTrigger({
			courseGroupId: 'course-price-review',
			sourceKind: 'contract_activation',
			sourceRef: 'price-enrollment-6',
			reasonCode: 'activation',
			effectiveOn: '2026-08-01',
			oldActiveCount: 5,
			newActiveCount: 6,
			dedupeKey: 'enrollment:price-enrollment-6:active_from:2026-08-01:v1',
			now: now(1),
		});
		expect(replayedTrigger.id).toBe(firstTrigger.id);

		const batchId = await service.processTrigger(firstTrigger.id, now(1));
		expect(await service.processTrigger(firstTrigger.id, now(1))).toBe(batchId);
		const items = await repository.listBatchItems(batchId);
		expect(items).toHaveLength(5);
		expect(items.every((item) => item.status === 'draft')).toBe(true);
		expect(items.every((item) => item.oldPriceCents === fixture.rule5.yearly_price_cents)).toBe(true);
		expect(items.every((item) => item.newFinalPriceCents === fixture.rule6.yearly_price_cents)).toBe(true);
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM price_review_outbox_events`,
		})).toEqual({ count: 0 });
		await expect(service.dispatchBatch({
			admin,
			payload: { batchId, confirmation: 'confirmed',
				idempotencyKey: 'dispatch-before-approval-1' },
			requestId: 'request-early-dispatch',
			now: now(1),
		})).rejects.toThrowError(/PRICE_REVIEW_DISPATCH_REJECTED/);

		await service.approveBatch({
			admin,
			payload: { batchId, reason: 'Calculated items reviewed', confirmation: 'confirmed',
				idempotencyKey: 'approve-review-batch-1' },
			requestId: 'request-approve-review',
			now: now(2),
		});
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM price_review_outbox_events`,
		})).toEqual({ count: 0 });

		const dispatch = await service.dispatchBatch({
			admin,
			payload: { batchId, confirmation: 'confirmed', idempotencyKey: 'dispatch-review-batch-1' },
			requestId: 'request-dispatch-review',
			now: now(3),
		});
		expect(dispatch).toEqual({ replayed: false, sent: 5 });
		expect(await service.dispatchBatch({
			admin,
			payload: { batchId, confirmation: 'confirmed', idempotencyKey: 'dispatch-review-batch-1' },
			requestId: 'request-dispatch-review-replay',
			now: now(3),
		})).toEqual({ replayed: true, sent: 5 });
		const delivery = await db.first<{ cabinet_url: string }>({
			sql: `SELECT cabinet_url FROM price_review_deliveries ORDER BY created_at LIMIT 1`,
		});
		expect(delivery?.cabinet_url).toMatch(/^https:\/\/portal\.example\.test\/price-reviews\/[0-9a-f-]+$/u);
		expect(delivery?.cabinet_url).not.toContain(items[0].id);
		expect(delivery?.cabinet_url).not.toContain('price-parent');
		expect((await repository.getItemById(items[0].id))?.responseDeadline).toBe('2026-08-17');
		await expect(db.run({
			sql: `UPDATE price_review_items SET old_price_cents = 1 WHERE id = ?`,
			params: [items[0].id],
		})).rejects.toThrowError(/sent price review snapshot is immutable/);

		const item = (await repository.listParentItems('price-parent-1'))[0];
		await expect(service.respond({
			actor: parentActor(2),
			payload: { publicReference: item.publicReference, itemHash: item.itemHash,
				decision: 'accept', idempotencyKey: 'foreign-parent-response-1' },
			requestId: 'request-foreign-parent',
			requestSubject: '198.51.100.20',
			userAgent: 'test',
			now: now(4),
		})).rejects.toThrowError(/PRICE_REVIEW_ITEM_NOT_FOUND/);
		const accepted = await service.respond({
			actor: parentActor(1),
			payload: { publicReference: item.publicReference, itemHash: item.itemHash,
				decision: 'accept', idempotencyKey: 'parent-price-acceptance-1' },
			requestId: 'request-parent-accept',
			requestSubject: '198.51.100.10',
			userAgent: 'stage-10-test',
			now: now(4),
		});
		expect(accepted).toEqual({ status: 'accepted_by_parent', replayed: false });
		expect(await service.respond({
			actor: parentActor(1),
			payload: { publicReference: item.publicReference, itemHash: item.itemHash,
				decision: 'accept', idempotencyKey: 'parent-price-acceptance-1' },
			requestId: 'request-parent-accept-replay',
			requestSubject: '198.51.100.10',
			userAgent: 'stage-10-test',
			now: now(4),
		})).toEqual({ status: 'accepted_by_parent', replayed: true });
		const declinedItem = (await repository.listParentItems('price-parent-2'))[0];
		expect(await service.respond({
			actor: parentActor(2),
			payload: { publicReference: declinedItem.publicReference, itemHash: declinedItem.itemHash,
				decision: 'decline', idempotencyKey: 'parent-price-decline-2' },
			requestId: 'request-parent-decline',
			requestSubject: '198.51.100.12',
			userAgent: 'stage-10-test',
			now: now(4),
		})).toEqual({ status: 'declined_by_parent', replayed: false });
		await expect(service.finalConfirm({
			admin,
			payload: { itemId: declinedItem.id, reason: 'Must remain declined',
				confirmation: 'confirmed', idempotencyKey: 'declined-final-confirmation' },
			requestId: 'request-declined-final',
			now: now(5),
		})).rejects.toThrowError(/PRICE_REVIEW_ITEM_NOT_ACCEPTED/);

		const closedOwnerItem = (await repository.listParentItems('price-parent-4'))[0];
		await db.run({
			sql: `UPDATE users SET account_status = 'closed', closed_at = ?, updated_at = ?
				WHERE id = 'price-parent-4'`,
			params: [now(5), now(5)],
		});
		await expect(service.respond({
			actor: parentActor(4),
			payload: { publicReference: closedOwnerItem.publicReference,
				itemHash: closedOwnerItem.itemHash, decision: 'accept',
				idempotencyKey: 'closed-parent-response-4' },
			requestId: 'request-closed-parent',
			requestSubject: '198.51.100.14',
			userAgent: 'stage-10-test',
			now: now(5),
		})).rejects.toThrowError(/PRICE_REVIEW_PARENT_RESPONSE_REJECTED/);
		expect((await repository.getItemById(closedOwnerItem.id))?.status).toBe('superseded');

		await service.finalConfirm({
			admin,
			payload: { itemId: item.id, reason: 'Parent acceptance checked',
				confirmation: 'confirmed', idempotencyKey: 'final-price-confirmation-1' },
			requestId: 'request-final-confirm',
			now: now(20),
		});
		expect(await service.finalConfirm({
			admin,
			payload: { itemId: item.id, reason: 'Parent acceptance checked',
				confirmation: 'confirmed', idempotencyKey: 'final-price-confirmation-1' },
			requestId: 'request-final-confirm-replay',
			now: now(21),
		})).toEqual({ replayed: true });
		expect((await repository.getItemById(item.id))?.scheduledFor).toBe('2026-09-01');
		expect(await service.runScheduledMaintenance(now(31))).toMatchObject({ applied: 0, overdue: 2 });
		const overdueItem = (await repository.listParentItems('price-parent-3'))[0];
		expect(await service.respond({
			actor: parentActor(3),
			payload: { publicReference: overdueItem.publicReference, itemHash: overdueItem.itemHash,
				decision: 'accept', idempotencyKey: 'late-parent-response-3' },
			requestId: 'request-late-parent',
			requestSubject: '198.51.100.13',
			userAgent: 'stage-10-test',
			now: now(31),
		})).toEqual({ status: 'response_overdue', replayed: false });
		expect(await service.revalidateItem((await repository.getItemById(item.id))!, '2026-09-01'))
			.toEqual({ current: true, reason: 'CURRENT' });
		const applied = await service.runScheduledMaintenance('2026-09-01T00:30:00.000Z');
		expect(applied.applied).toBe(1);
		expect((await service.runScheduledMaintenance('2026-09-01T02:00:00.000Z')).applied).toBe(0);
		expect(await db.first<{
			current_price_cents: number;
			current_price_rule_id: string;
			price_assignment_version: number;
			apply_count: number;
		}>({
			sql: `SELECT enrollment.current_price_cents, enrollment.current_price_rule_id,
				enrollment.price_assignment_version,
				(SELECT COUNT(*) FROM price_change_apply_events
				 WHERE price_review_item_id = ?) AS apply_count
			FROM enrollments AS enrollment WHERE enrollment.id = 'price-enrollment-1'`,
			params: [item.id],
		})).toEqual({
			current_price_cents: fixture.rule6.yearly_price_cents,
			current_price_rule_id: fixture.rule6.id,
			price_assignment_version: 2,
			apply_count: 1,
		});
	}, 45_000);

	it('keeps legacy source immutable and sends only the uniquely claimed known service', async () => {
		context = await createMigratedTestD1();
		const db = new DatabaseBoundary(context.db);
		const fixture = await seedScenario(db);
		await seedLegacyTargets(db, fixture);
		const occupancy = new OccupancyRepository(db);
		const repository = new PriceReviewRepository(db);
		await repository.advanceReconcilerWatermark(now(2));
		const pricing = new PricingService(new PricingRepository(db), occupancy, pricingConfig);
		const service = new PriceReviewService(repository, pricing, occupancy, {
			portalPublicOrigin: 'https://portal.example.test',
		});

		expect(await occupancy.activeChildrenCount('course-legacy-review', '2026-08-01')).toBe(5);
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM price_review_triggers`,
		})).toEqual({ count: 0 });
		const comparison = await service.createAdminComparison({
			admin,
			payload: {
				courseGroupId: 'course-legacy-review',
				effectiveOn: '2026-08-01',
				reason: 'Explicit active-price comparison',
				confirmation: 'confirmed',
				idempotencyKey: 'legacy-price-comparison-1',
			},
			requestId: 'request-legacy-comparison',
			now: now(2),
		});
		const items = await repository.listBatchItems(comparison.batchId);
		expect(items).toHaveLength(4);
		expect(items.find((item) => item.targetId === 'legacy-review-known')).toMatchObject({
			status: 'draft',
			userId: 'price-parent-1',
			oldPriceCents: 5000,
			newFinalPriceCents: fixture.rule5.yearly_price_cents,
		});
		expect(items.filter((item) => item.status === 'manual_contact_required')).toHaveLength(3);
		expect(items.map((item) => item.targetId)).not.toContain('legacy-review-represented');

		await service.approveBatch({
			admin,
			payload: { batchId: comparison.batchId, reason: 'Legacy projections reviewed',
				confirmation: 'confirmed', idempotencyKey: 'legacy-batch-approval-1' },
			requestId: 'request-legacy-approval',
			now: now(3),
		});
		expect(await service.dispatchBatch({
			admin,
			payload: { batchId: comparison.batchId, confirmation: 'confirmed',
				idempotencyKey: 'legacy-batch-dispatch-1' },
			requestId: 'request-legacy-dispatch',
			now: now(4),
		})).toEqual({ replayed: false, sent: 1 });
		const known = (await repository.listParentItems('price-parent-1'))
			.find((item) => item.targetId === 'legacy-review-known')!;
		await service.respond({
			actor: parentActor(1),
			payload: { publicReference: known.publicReference, itemHash: known.itemHash,
				decision: 'accept', idempotencyKey: 'legacy-parent-acceptance-1' },
			requestId: 'request-legacy-accept',
			requestSubject: '203.0.113.10',
			userAgent: 'stage-10-test',
			now: now(5),
		});
		await service.finalConfirm({
			admin,
			payload: { itemId: known.id, reason: 'Claim and price evidence checked',
				confirmation: 'confirmed', idempotencyKey: 'legacy-final-confirmation-1' },
			requestId: 'request-legacy-final',
			now: now(20),
		});
		expect((await service.runScheduledMaintenance('2026-09-01T01:00:00.000Z')).applied).toBe(1);
		expect(await db.first<{
			planned_price_cents: number;
			source_hash: string;
			assignment_count: number;
			contract_count: number;
			artifact_count: number;
		}>({
			sql: `SELECT legacy.planned_price_cents, source.source_hash,
				(SELECT COUNT(*) FROM legacy_service_price_assignments
				 WHERE legacy_enrollment_id = legacy.id) AS assignment_count,
				(SELECT COUNT(*) FROM contracts) AS contract_count,
				(SELECT COUNT(*) FROM contract_artifacts) AS artifact_count
			FROM legacy_enrollments legacy
			JOIN legacy_source_rows source ON source.id = legacy.legacy_source_row_id
			WHERE legacy.id = 'legacy-review-known'`,
		})).toEqual({
			planned_price_cents: 5000,
			source_hash: '1'.repeat(64),
			assignment_count: 1,
			contract_count: 0,
			artifact_count: 0,
		});
	}, 40_000);

	it('keeps empty/capped comparisons silent and reconciles a future expiry with stale evidence', async () => {
		context = await createMigratedTestD1();
		const db = new DatabaseBoundary(context.db);
		const fixture = await seedScenario(db);
		const occupancy = new OccupancyRepository(db);
		const repository = new PriceReviewRepository(db);
		const pricing = new PricingService(new PricingRepository(db), occupancy, pricingConfig);
		const service = new PriceReviewService(repository, pricing, occupancy, {
			portalPublicOrigin: 'https://portal.example.test',
		});
		await db.run({
			sql: `UPDATE enrollments SET current_base_price_cents = ?, current_price_cents = ?,
				current_price_version_id = ?, current_price_rule_id = ?, updated_at = ?
			WHERE course_group_id = 'course-price-review'`,
			params: [fixture.rule6.yearly_price_cents, fixture.rule6.yearly_price_cents,
				fixture.versionId, fixture.rule6.id, now(2)],
		});

		const empty = await service.createAdminComparison({
			admin,
			payload: { courseGroupId: 'course-price-review', effectiveOn: '2026-08-01',
				reason: 'Explicit unchanged comparison', confirmation: 'confirmed',
				idempotencyKey: 'unchanged-price-comparison-1' },
			requestId: 'request-unchanged-comparison',
			now: now(2),
		});
		expect(await repository.listBatchItems(empty.batchId)).toEqual([]);
		expect(await db.first<{ status: string }>({
			sql: `SELECT status FROM price_review_batches WHERE id = ?`,
			params: [empty.batchId],
		})).toEqual({ status: 'completed' });

		const capped = await service.createOccupancyTrigger({
			courseGroupId: 'course-price-review',
			sourceKind: 'occupancy_correction',
			sourceRef: 'cap-correction',
			reasonCode: 'occupancy_correction',
			effectiveOn: '2026-08-01',
			oldActiveCount: 7,
			newActiveCount: 6,
			dedupeKey: 'occupancy-correction:course-price-review:7-to-6:v1',
			now: now(3),
		});
		const cappedBatchId = await service.processTrigger(capped.id, now(3));
		expect(await repository.listBatchItems(cappedBatchId)).toEqual([]);
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM price_review_outbox_events`,
		})).toEqual({ count: 0 });
		const activationMarker = await service.createOccupancyTrigger({
			courseGroupId: 'course-price-review',
			sourceKind: 'contract_activation',
			sourceRef: 'price-enrollment-6',
			reasonCode: 'activation',
			effectiveOn: '2026-08-01',
			oldActiveCount: 5,
			newActiveCount: 6,
			dedupeKey: 'enrollment:price-enrollment-6:active_from:2026-08-01:v1',
			now: now(4),
		});
		await service.processTrigger(activationMarker.id, now(4));
		await repository.advanceReconcilerWatermark(now(29));

		await db.run({
			sql: `UPDATE enrollments SET active_until = '2026-09-10', updated_at = ?
			WHERE id = 'price-enrollment-6'`,
			params: [now(30)],
		});
		const maintenance = await service.runManualMaintenance({
			admin,
			payload: { confirmation: 'confirmed', idempotencyKey: 'manual-maintenance-run-1' },
			requestId: 'request-manual-maintenance',
			now: now(31),
		});
		expect(maintenance).toMatchObject({ replayed: false,
			result: { reconciled: 1, processedTriggers: 1 } });
		expect(await service.runManualMaintenance({
			admin,
			payload: { confirmation: 'confirmed', idempotencyKey: 'manual-maintenance-run-1' },
			requestId: 'request-manual-maintenance-replay',
			now: now(31),
		})).toEqual({ replayed: true });
		const futureTrigger = await repository.getTriggerByDedupe(
			'enrollment:price-enrollment-6:active_until:2026-09-10:v1'
		);
		const futureBatchId = await repository.batchIdForTrigger(futureTrigger!.id);
		const futureItems = await repository.listBatchItems(futureBatchId!);
		expect(futureItems).toHaveLength(5);
		await service.approveBatch({
			admin,
			payload: { batchId: futureBatchId, reason: 'Future expiry reviewed',
				confirmation: 'confirmed', idempotencyKey: 'future-expiry-approval-1' },
			requestId: 'request-future-approval',
			now: now(31),
		});
		await service.dispatchBatch({
			admin,
			payload: { batchId: futureBatchId, confirmation: 'confirmed',
				idempotencyKey: 'future-expiry-dispatch-1' },
			requestId: 'request-future-dispatch',
			now: now(31),
		});
		const stale = (await repository.listParentItems('price-parent-1'))[0];
		await db.run({
			sql: `UPDATE enrollments SET current_price_cents = 4501, updated_at = ?
				WHERE id = 'price-enrollment-1'`,
			params: ['2026-09-01T08:00:00.000Z'],
		});
		expect(await service.respond({
			actor: parentActor(1),
			payload: { publicReference: stale.publicReference, itemHash: stale.itemHash,
				decision: 'accept', idempotencyKey: 'stale-parent-response-1' },
			requestId: 'request-stale-parent',
			requestSubject: '203.0.113.11',
			userAgent: 'stage-10-test',
			now: '2026-09-01T08:01:00.000Z',
		})).toEqual({ status: 'superseded', replayed: false });
		expect(await db.first<{ evidence_status: string; acceptances: number; scheduler_actions: number }>({
			sql: `SELECT action.evidence_status,
				(SELECT COUNT(*) FROM price_change_acceptances
				 WHERE price_review_item_id = action.price_review_item_id) AS acceptances,
				(SELECT COUNT(*) FROM price_review_admin_actions
				 WHERE action = 'manual_scheduler_run') AS scheduler_actions
			FROM price_review_parent_actions action
			WHERE action.idempotency_key = 'stale-parent-response-1'`,
		})).toEqual({ evidence_status: 'stale', acceptances: 0, scheduler_actions: 1 });
	}, 40_000);
});

import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import { AdminMutationRepository } from '$lib/server/admin/mutation-repository';
import { LegacyReconciliationAdminRepository } from '$lib/server/admin/reconciliation-repository';
import { LegacyImportReconciliationRepository } from '$lib/server/import/reconciliation';
import { requireAdmin } from '$lib/server/security/authorization';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const NOW = '2026-08-17T12:00:00.000Z';
const PERIOD_ID = 'period-reconciliation-synthetic';
const PLUS_RUN_ID = 'run-plus-reconciliation-synthetic';
const PLUS_VERSION_ID = 'version-plus-reconciliation-synthetic';

class BeforeBatchDatabaseBoundary extends DatabaseBoundary {
	private beforeBatch: (() => Promise<void>) | null;

	constructor(database: D1Database, beforeBatch: () => Promise<void>) {
		super(database);
		this.beforeBatch = beforeBatch;
	}

	override async batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]> {
		const beforeBatch = this.beforeBatch;
		this.beforeBatch = null;
		await beforeBatch?.();
		return super.batch<T>(statements);
	}
}

class OneShotAfterCommitBoundary extends DatabaseBoundary {
	private thrown = false;

	override async batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]> {
		const result = await super.batch<T>(statements);
		if (
			!this.thrown &&
			statements.some((statement) =>
				statement.sql.includes("resolution_kind = 'source_identity_changed'")
			)
		) {
			this.thrown = true;
			throw new Error('synthetic ambiguous result after atomic supersede commit');
		}
		return result;
	}
}

function instant(minute: number): string {
	return `2026-08-17T12:${String(minute).padStart(2, '0')}:00.000Z`;
}

function adminActor(id = 'reconciliation-admin-a') {
	return requireAdmin({
		id,
		role: 'admin',
		emailVerified: true,
		sessionId: `session-${id}`,
		sessionVersion: 1,
		csrfHash: 'a'.repeat(64),
	});
}

async function insertAdmin(db: D1Database, id: string): Promise<void> {
	await db
		.prepare(
			`INSERT INTO users
				(id, email, email_normalized, password_hash, email_verified_at, role,
				 is_blocked, account_status, first_name, last_name,
				 first_name_normalized, last_name_normalized, family_assignment_status,
				 family_version, privacy_notice_version, privacy_accepted_at,
				 session_version, created_at, updated_at)
			 VALUES (?, ?, ?, 'synthetic-not-used', ?, 'admin', 0, 'active',
				 'Synthetic', 'Administrator', 'synthetic', 'administrator',
				 'pending_verification', 0, 'notice-v1', ?, 1, ?, ?)`
		)
		.bind(id, `${id}@example.invalid`, `${id}@example.invalid`, NOW, NOW, NOW, NOW)
		.run();
}

async function insertRun(
	db: D1Database,
	input: { runId: string; versionId: string; marker: string }
) {
	const digest = input.marker.repeat(64);
	await db.batch([
		db
			.prepare(
				`INSERT INTO import_runs
					(id, source_kind, academic_period_id, source_label, source_hash_sha256,
					 source_contract_id, source_contract_version, structural_fingerprint_sha256,
					 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
					 attempt_no, status, started_at, validated_at, rows_total, rows_staged,
					 safe_summary_json, created_at, updated_at)
				 VALUES (?, 'access', ?, 'synthetic-redacted', ?, 'access-synthetic', 1, ?,
					 '{}', ?, ?, 1, 'validated', ?, ?, 1, 1, '{}', ?, ?)`
			)
			.bind(input.runId, PERIOD_ID, digest, digest, digest, digest, NOW, NOW, NOW, NOW),
		db
			.prepare(
				`INSERT INTO legacy_versions
					(id, academic_period_id, import_run_id, plusbtext_version_id,
					 version_hash_sha256, created_at)
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(input.versionId, PERIOD_ID, input.runId, PLUS_VERSION_ID, digest, NOW),
	]);
}

async function insertIssue(
	db: D1Database,
	input: {
		issueId: string;
		runId: string;
		sourceKey: string;
		code?: string;
		safeContext?: Record<string, unknown>;
	}
) {
	await db
		.prepare(
			`INSERT INTO import_issues
				(id, import_run_id, severity, code, source_record_key,
				 safe_context_json, status, created_at)
			 VALUES (?, ?, 'warning', ?, ?, ?, 'open', ?)`
		)
		.bind(
			input.issueId,
			input.runId,
			input.code ?? 'ACCESS_EMAIL_INVALID',
			input.sourceKey,
			JSON.stringify(
				input.safeContext ?? { email: 'pii-canary@example.invalid', phone: '+49 000 000' }
			),
			NOW
		)
		.run();
}

describe('legacy import reconciliation in D1', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;

	beforeAll(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		await context.db.batch([
			context.db
				.prepare(
					`INSERT INTO academic_periods
						(id, code, display_name, starts_on, ends_on, is_current, created_at)
					 VALUES (?, '2026-2027-reconciliation', 'Synthetic reconciliation',
						'2026-08-01', '2027-07-31', 1, ?)`
				)
				.bind(PERIOD_ID, NOW),
			context.db
				.prepare(
					`INSERT INTO import_runs
						(id, source_kind, academic_period_id, source_label, source_hash_sha256,
						 source_contract_id, source_contract_version, structural_fingerprint_sha256,
						 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
						 attempt_no, status, started_at, validated_at, rows_total, rows_staged,
						 safe_summary_json, created_at, updated_at)
					 VALUES (?, 'plusbtext', ?, 'synthetic-redacted', ?, 'plus-synthetic', 1, ?,
						 '{}', ?, ?, 1, 'validated', ?, ?, 1, 1, '{}', ?, ?)`
				)
				.bind(
					PLUS_RUN_ID,
					PERIOD_ID,
					'a'.repeat(64),
					'a'.repeat(64),
					'a'.repeat(64),
					'a'.repeat(64),
					NOW,
					NOW,
					NOW,
					NOW
				),
			context.db
				.prepare(
					`INSERT INTO plusbtext_versions
						(id, academic_period_id, import_run_id, version_hash_sha256,
						 fingerprint_algorithm_version, logical_shape_fingerprint_sha256,
						 style_fingerprint_sha256, created_at)
					 VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
				)
				.bind(
					PLUS_VERSION_ID,
					PERIOD_ID,
					PLUS_RUN_ID,
					'a'.repeat(64),
					'b'.repeat(64),
					'c'.repeat(64),
					NOW
				),
		]);
		await insertAdmin(context.db, 'reconciliation-admin-a');
		await insertAdmin(context.db, 'reconciliation-admin-b');
	});

	afterAll(async () => {
		await context.dispose();
	});

	it('keeps stable evidence across reimports and rejects generic, stale and unsafe closure', async () => {
		const repository = new LegacyImportReconciliationRepository(db);
		const adminRepository = new LegacyReconciliationAdminRepository(db);
		const genericMutations = new AdminMutationRepository(db);
		const actor = requireAdmin({
			id: 'reconciliation-admin-a',
			role: 'admin',
			emailVerified: true,
			sessionId: 'session-reconciliation-admin-a',
			sessionVersion: 1,
			csrfHash: 'a'.repeat(64),
		});
		const sourceKey = 'access:synthetic:pii-canary@example.invalid';

		await insertRun(context.db, {
			runId: 'run-reconciliation-1',
			versionId: 'version-reconciliation-1',
			marker: '1',
		});
		await insertIssue(context.db, {
			issueId: 'issue-reconciliation-1',
			runId: 'run-reconciliation-1',
			sourceKey,
		});
		await repository.reconcileValidatedImport({
			academicPeriodId: PERIOD_ID,
			sourceKind: 'access',
			importRunId: 'run-reconciliation-1',
			versionId: 'version-reconciliation-1',
			now: instant(1),
		});

		const first = await adminRepository.list({ page: 1 });
		expect(first.items).toHaveLength(1);
		expect(first.items[0]).toMatchObject({
			issueClass: 'invalid_email',
			state: 'open',
			version: 1,
			blocksRelease: true,
		});
		expect(await repository.releaseGate(PERIOD_ID)).toMatchObject({
			blocking: 1,
			passed: false,
		});

		await expect(
			genericMutations.decideImportIssue({
				actor,
				issueId: 'issue-reconciliation-1',
				decision: 'dismiss',
				reason: 'synthetic generic dismissal must fail',
				idempotencyKey: 'reconciliation-generic-dismissal',
				requestId: 'request-reconciliation-generic-dismissal',
				now: instant(2),
			})
		).rejects.toMatchObject({ code: 'ACTIONABLE_IMPORT_ISSUE_REQUIRES_RECONCILIATION' });
		await expect(
			context.db
				.prepare(
					"UPDATE import_issues SET status = 'dismissed' WHERE id = 'issue-reconciliation-1'"
				)
				.run()
		).rejects.toThrow(/typed reconciliation/);

		const caseId = first.items[0].id;
		const awaitingInput = {
			actor,
			caseId,
			expectedVersion: 1,
			action: 'await_upstream' as const,
			reasonCode: 'upstream_correction_requested',
			idempotencyKey: 'reconciliation-awaiting-upstream',
			requestId: 'request-reconciliation-awaiting-upstream',
			now: instant(3),
		};
		expect(await adminRepository.mutate(awaitingInput)).toMatchObject({ replayed: false });
		expect(await adminRepository.mutate(awaitingInput)).toMatchObject({ replayed: true });
		await adminRepository.mutate({
			actor,
			caseId,
			expectedVersion: 2,
			action: 'mark_ready_to_verify',
			reasonCode: 'upstream_correction_reported',
			idempotencyKey: 'reconciliation-ready-first',
			requestId: 'request-reconciliation-ready-first',
			now: instant(4),
		});

		await insertRun(context.db, {
			runId: 'run-reconciliation-2',
			versionId: 'version-reconciliation-2',
			marker: '2',
		});
		await insertIssue(context.db, {
			issueId: 'issue-reconciliation-2',
			runId: 'run-reconciliation-2',
			sourceKey,
		});
		await repository.reconcileValidatedImport({
			academicPeriodId: PERIOD_ID,
			sourceKind: 'access',
			importRunId: 'run-reconciliation-2',
			versionId: 'version-reconciliation-2',
			now: instant(5),
		});
		const persisted = await adminRepository.detail(caseId);
		expect(persisted.item).toMatchObject({
			state: 'open',
			version: 4,
			lastSeenImportRunId: 'run-reconciliation-2',
		});
		expect(persisted.timeline.map((entry) => entry.action)).toContain(
			'verification_failed_reimport'
		);

		await expect(
			adminRepository.mutate({
				...awaitingInput,
				idempotencyKey: 'reconciliation-stale-race',
			})
		).rejects.toMatchObject({ code: 'RECONCILIATION_STALE_VERSION' });
		await adminRepository.mutate({
			...awaitingInput,
			expectedVersion: 4,
			idempotencyKey: 'reconciliation-awaiting-second',
			now: instant(6),
		});
		await adminRepository.mutate({
			actor,
			caseId,
			expectedVersion: 5,
			action: 'mark_ready_to_verify',
			reasonCode: 'upstream_correction_reported',
			idempotencyKey: 'reconciliation-ready-second',
			requestId: 'request-reconciliation-ready-second',
			now: instant(7),
		});

		await insertRun(context.db, {
			runId: 'run-reconciliation-3',
			versionId: 'version-reconciliation-3',
			marker: '3',
		});
		await repository.reconcileValidatedImport({
			academicPeriodId: PERIOD_ID,
			sourceKind: 'access',
			importRunId: 'run-reconciliation-3',
			versionId: 'version-reconciliation-3',
			now: instant(8),
		});
		const resolved = await adminRepository.detail(caseId);
		expect(resolved.item).toMatchObject({
			state: 'resolved',
			resolutionKind: 'resolved_by_reimport',
			version: 7,
		});
		expect(await repository.releaseGate(PERIOD_ID)).toMatchObject({
			blocking: 0,
			passed: true,
		});

		const evidenceDump = await context.db
			.prepare(
				`SELECT group_concat(value, '|') AS value FROM (
					SELECT id AS value FROM legacy_reconciliation_cases
					UNION ALL SELECT safe_metadata_json FROM legacy_reconciliation_decisions
					UNION ALL SELECT safe_diff_json FROM audit_events
						WHERE target_kind = 'legacy_reconciliation_case'
				)`
			)
			.first<{ value: string }>();
		expect(evidenceDump?.value).not.toContain('pii-canary@example.invalid');
		expect(evidenceDump?.value).not.toContain('+49');

		const decisionId = resolved.timeline[0].id;
		await expect(
			context.db
				.prepare('UPDATE legacy_reconciliation_decisions SET reason_code = ? WHERE id = ?')
				.bind('forged', decisionId)
				.run()
		).rejects.toThrow(/append-only/);

		await insertRun(context.db, {
			runId: 'run-reconciliation-4',
			versionId: 'version-reconciliation-4',
			marker: '4',
		});
		await insertIssue(context.db, {
			issueId: 'issue-reconciliation-race',
			runId: 'run-reconciliation-4',
			sourceKey: 'access:synthetic:race',
		});
		await insertIssue(context.db, {
			issueId: 'issue-reconciliation-price',
			runId: 'run-reconciliation-4',
			sourceKey: 'access:synthetic:price',
			code: 'ACCESS_PLANNED_PRICE_INVALID',
		});
		await insertIssue(context.db, {
			issueId: 'issue-reconciliation-duplicate',
			runId: 'run-reconciliation-4',
			sourceKey: 'access:synthetic:duplicate',
			code: 'ACCESS_CHILD_GROUP_DUPLICATE_SLOTS',
		});
		await insertIssue(context.db, {
			issueId: 'issue-reconciliation-mapping',
			runId: 'run-reconciliation-4',
			sourceKey: 'access:synthetic:mapping',
			code: 'PLUSB_ENRICHMENT_UNRESOLVED',
		});
		await repository.reconcileValidatedImport({
			academicPeriodId: PERIOD_ID,
			sourceKind: 'access',
			importRunId: 'run-reconciliation-4',
			versionId: 'version-reconciliation-4',
			now: instant(9),
		});
		const active = (await adminRepository.list({ page: 1 })).items.filter(
			(item) => item.state !== 'resolved' && item.state !== 'superseded'
		);
		const raceCase = active.find((item) => item.issueCode === 'ACCESS_EMAIL_INVALID')!;
		const priceCase = active.find((item) => item.issueCode === 'ACCESS_PLANNED_PRICE_INVALID')!;
		const duplicateCase = active.find(
			(item) => item.issueCode === 'ACCESS_CHILD_GROUP_DUPLICATE_SLOTS'
		)!;
		const mappingCase = active.find(
			(item) => item.issueCode === 'PLUSB_ENRICHMENT_UNRESOLVED'
		)!;

		await context.db
			.prepare(
				"UPDATE users SET is_blocked = 1, updated_at = ? WHERE id = 'reconciliation-admin-b'"
			)
			.bind(instant(10))
			.run();
		const blockedActor = requireAdmin({
			id: 'reconciliation-admin-b',
			role: 'admin',
			emailVerified: true,
			sessionId: 'session-reconciliation-admin-b',
			sessionVersion: 1,
			csrfHash: 'b'.repeat(64),
		});
		await expect(
			adminRepository.mutate({
				actor: blockedActor,
				caseId: raceCase.id,
				expectedVersion: raceCase.version,
				action: 'assign',
				reasonCode: 'operator_assignment',
				idempotencyKey: 'reconciliation-inactive-admin',
				requestId: 'request-reconciliation-inactive-admin',
				now: instant(10),
			})
		).rejects.toMatchObject({ code: 'RECONCILIATION_ASSIGNEE_INVALID' });
		await context.db
			.prepare(
				"UPDATE users SET is_blocked = 0, updated_at = ? WHERE id = 'reconciliation-admin-b'"
			)
			.bind(instant(11))
			.run();

		const race = await Promise.allSettled([
			adminRepository.mutate({
				actor,
				caseId: raceCase.id,
				expectedVersion: raceCase.version,
				action: 'assign',
				reasonCode: 'operator_assignment',
				idempotencyKey: 'reconciliation-race-admin-a',
				requestId: 'request-reconciliation-race-admin-a',
				now: instant(11),
			}),
			adminRepository.mutate({
				actor: blockedActor,
				caseId: raceCase.id,
				expectedVersion: raceCase.version,
				action: 'assign',
				reasonCode: 'operator_assignment',
				idempotencyKey: 'reconciliation-race-admin-b',
				requestId: 'request-reconciliation-race-admin-b',
				now: instant(11),
			}),
		]);
		expect(race.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(race.filter((result) => result.status === 'rejected')).toHaveLength(1);

		const assignedRace = await adminRepository.detail(raceCase.id);
		await adminRepository.mutate({
			actor,
			caseId: raceCase.id,
			expectedVersion: assignedRace.item.version,
			action: 'unassign',
			reasonCode: 'operator_unassignment',
			idempotencyKey: 'reconciliation-race-cleanup',
			requestId: 'request-reconciliation-race-cleanup',
			now: instant(12),
		});
		await expect(
			adminRepository.batchMutate({
				actor,
				cases: [
					{ caseId: raceCase.id, expectedVersion: assignedRace.item.version + 1 },
					{ caseId: priceCase.id, expectedVersion: priceCase.version },
				],
				action: 'assign',
				reasonCode: 'operator_assignment',
				idempotencyKey: 'reconciliation-mixed-batch',
				requestId: 'request-reconciliation-mixed-batch',
				now: instant(13),
			})
		).rejects.toMatchObject({ code: 'RECONCILIATION_BATCH_COHORT_MISMATCH' });

		await adminRepository.mutate({
			actor,
			caseId: duplicateCase.id,
			expectedVersion: duplicateCase.version,
			action: 'same_service_duplicate',
			reasonCode: 'same_service_confirmed',
			idempotencyKey: 'reconciliation-duplicate-same-service',
			requestId: 'request-reconciliation-duplicate-same-service',
			now: instant(14),
		});
		expect((await adminRepository.detail(duplicateCase.id)).item).toMatchObject({
			state: 'resolved',
			resolutionKind: 'same_service_duplicate',
		});
		await expect(
			adminRepository.mutate({
				actor,
				caseId: mappingCase.id,
				expectedVersion: mappingCase.version,
				action: 'exact_catalog_mapping',
				reasonCode: 'exact_mapping_confirmed',
				targetType: 'course_group',
				targetId: 'fuzzy-or-unbound-course',
				idempotencyKey: 'reconciliation-fuzzy-mapping-rejected',
				requestId: 'request-reconciliation-fuzzy-mapping-rejected',
				now: instant(15),
			})
		).rejects.toMatchObject({ code: 'RECONCILIATION_TYPED_EVIDENCE_MISMATCH' });
	});

	it('materializes separate row-level PlusBText cases and scopes the summary filters', async () => {
		await insertIssue(context.db, {
			issueId: 'issue-plus-duration-row-2',
			runId: PLUS_RUN_ID,
			sourceKey: 'plusbtext:PlusBText:row:2:field:T',
			code: 'PLUSB_DURATION_MISSING',
		});
		await insertIssue(context.db, {
			issueId: 'issue-plus-duration-row-3',
			runId: PLUS_RUN_ID,
			sourceKey: 'plusbtext:PlusBText:row:3:field:T',
			code: 'PLUSB_DURATION_MISSING',
		});
		await new LegacyImportReconciliationRepository(db).reconcileValidatedImport({
			academicPeriodId: PERIOD_ID,
			sourceKind: 'plusbtext',
			importRunId: PLUS_RUN_ID,
			versionId: PLUS_VERSION_ID,
			now: instant(16),
		});

		const queue = await new LegacyReconciliationAdminRepository(db).list({
			sourceKind: 'plusbtext',
			page: 1,
		});
		expect(queue.items.filter((item) => item.issueCode === 'PLUSB_DURATION_MISSING')).toHaveLength(
			2
		);
		expect(queue.total).toBe(2);
		expect(queue.summary).toEqual([
			expect.objectContaining({ issueClass: 'duration', state: 'open', count: 2, blocking: 2 }),
		]);
	});

	it('enforces the reconciliation release fence inside the promotion transaction', async () => {
		await expect(
			context.db
				.prepare(
					`INSERT INTO legacy_version_promotion_events
						(id, source_kind, academic_period_id, version_id, previous_version_id,
						 import_run_id, action, fencing_token, created_at)
					 VALUES ('blocked-reconciliation-promotion', 'access', ?,
						 'version-reconciliation-4', NULL, 'run-reconciliation-4', 'promote', 1, ?)`
				)
				.bind(PERIOD_ID, instant(17))
				.run()
		).rejects.toThrow(/reconciliation release gate blocked/);
		expect(
			await context.db
				.prepare(
					"SELECT COUNT(*) AS count FROM legacy_version_promotion_events WHERE id = 'blocked-reconciliation-promotion'"
				)
				.first()
		).toEqual({ count: 0 });
	});

	it('binds exact catalog evidence to the case version and denies status-only mapping', async () => {
		await insertRun(context.db, {
			runId: 'run-reconciliation-mapping-version',
			versionId: 'version-reconciliation-mapping-version',
			marker: '5',
		});
		await context.db.batch([
			context.db
				.prepare(
					`INSERT INTO legacy_snapshot_enrollments
						(id, legacy_version_id, legacy_enrollment_id, source_access_id,
						 stable_family_key, source_child_key, source_slot, source_record_key,
						 group_name_raw, group_name_normalized, needs_admin_review,
						 record_hash_sha256, created_at)
					 VALUES ('snapshot-mapping-current', ?, 'legacy-mapping-current', 501,
						 'family-map', 'child-map', 'main_next', 'access:mapping:current',
						 'Current Exact Group', 'current exact group', 1, ?, ?),
						('snapshot-mapping-status', ?, 'legacy-mapping-status', 502,
						 'family-map', 'child-map', 'package_1', 'access:mapping:status',
						 'Current Exact Group', 'current exact group', 1, ?, ?)`
				)
				.bind(
					'version-reconciliation-mapping-version',
					'5'.repeat(64),
					instant(18),
					'version-reconciliation-mapping-version',
					'6'.repeat(64),
					instant(18)
				),
			context.db
				.prepare(
					`INSERT INTO course_groups
						(id, academic_period_id, source_offering_key, display_name, lesson_kind,
						 subject, requires_admin_approval, catalog_status, created_at, updated_at)
					 VALUES ('course-mapping-version-bound', ?, 'offering-map-bound',
						 'Bound course', 'group', 'Synthetic', 0, 'published', ?, ?)`
				)
				.bind(PERIOD_ID, instant(18), instant(18)),
			context.db
				.prepare(
					`INSERT INTO course_source_mappings
						(id, academic_period_id, source_kind, source_value_normalized,
						 course_group_id, status, reason, created_by, created_at, updated_at)
					 VALUES ('mapping-version-bound', ?, 'access', 'current exact group',
						 'course-mapping-version-bound', 'confirmed', 'synthetic exact evidence',
						 'reconciliation-admin-a', ?, ?)`
				)
				.bind(PERIOD_ID, instant(18), instant(18)),
		]);
		await insertIssue(context.db, {
			issueId: 'issue-mapping-version-bound',
			runId: 'run-reconciliation-mapping-version',
			sourceKey: 'access:mapping:current',
			code: 'PLUSB_ENRICHMENT_UNRESOLVED',
		});
		await insertIssue(context.db, {
			issueId: 'issue-mapping-status-only',
			runId: 'run-reconciliation-mapping-version',
			sourceKey: 'access:mapping:status',
			code: 'ACCESS_STATUS_NEEDS_REVIEW',
		});
		const importer = new LegacyImportReconciliationRepository(db);
		const adminRepository = new LegacyReconciliationAdminRepository(db);
		await importer.reconcileValidatedImport({
			academicPeriodId: PERIOD_ID,
			sourceKind: 'access',
			importRunId: 'run-reconciliation-mapping-version',
			versionId: 'version-reconciliation-mapping-version',
			now: instant(18),
		});
		const cases = (
			await adminRepository.list({ lastSeenRunId: 'run-reconciliation-mapping-version', page: 1 })
		).items;
		const mappingCase = cases.find((item) => item.issueCode === 'PLUSB_ENRICHMENT_UNRESOLVED')!;
		const statusCase = cases.find((item) => item.issueCode === 'ACCESS_STATUS_NEEDS_REVIEW')!;

		await expect(
			adminRepository.mutate({
				actor: adminActor(),
				caseId: statusCase.id,
				expectedVersion: statusCase.version,
				action: 'exact_catalog_mapping',
				reasonCode: 'exact_mapping_confirmed',
				targetType: 'course_group',
				targetId: 'course-mapping-version-bound',
				idempotencyKey: 'mapping-status-action-denied',
				requestId: 'request-mapping-status-action-denied',
				now: instant(19),
			})
		).rejects.toMatchObject({ code: 'RECONCILIATION_ACTION_NOT_ALLOWED' });
		await adminRepository.mutate({
			actor: adminActor(),
			caseId: mappingCase.id,
			expectedVersion: mappingCase.version,
			action: 'exact_catalog_mapping',
			reasonCode: 'exact_mapping_confirmed',
			targetType: 'course_group',
			targetId: 'course-mapping-version-bound',
			idempotencyKey: 'mapping-version-action-accepted',
			requestId: 'request-mapping-version-action-accepted',
			now: instant(19),
		});
		expect((await adminRepository.detail(mappingCase.id)).item).toMatchObject({
			state: 'resolved',
			resolutionKind: 'exact_catalog_mapping',
		});
	});

	it('binds child correction evidence to the exact source row family and version', async () => {
		await insertRun(context.db, {
			runId: 'run-reconciliation-child-link',
			versionId: 'version-reconciliation-child-link',
			marker: '6',
		});
		await context.db.batch([
			...['a', 'b'].flatMap((suffix, index) => [
				context.db
					.prepare(
						`INSERT INTO family_number_allocations
							(id, namespace, sequence_number, display_family_id, legacy_family_id,
							 origin, status, assigned_at, created_at, updated_at)
						 VALUES (?, 'legacy_1', ?, ?, ?, 'legacy', 'assigned', ?, ?, ?)`
					)
					.bind(
						`family-number-child-${suffix}`,
						6100 + index,
						`1-${6100 + index}`,
						`legacy-family-child-${suffix}`,
						instant(20),
						instant(20),
						instant(20)
					),
				context.db
					.prepare(
						`INSERT INTO legacy_families
							(id, source_namespace, source_family_id, family_number_id,
							 numbering_status, continuity_status, created_at, updated_at)
						 VALUES (?, 'legacy_1', ?, ?, 'valid', 'stable', ?, ?)`
					)
					.bind(
						`legacy-family-child-${suffix}`,
						`source-family-child-${suffix}`,
						`family-number-child-${suffix}`,
						instant(20),
						instant(20)
					),
				context.db
					.prepare(
						`INSERT INTO children
							(id, legacy_family_id, family_number_id, origin, source_child_key,
							 source_full_name, source_full_name_normalized, source_birth_date,
							 full_name, full_name_normalized, birth_date, last_seen_run_id,
							 is_current, created_at, updated_at)
						 VALUES (?, ?, ?, 'legacy', ?, 'Synthetic Child', 'synthetic child',
							 '2015-01-01', 'Synthetic Child', 'synthetic child', '2015-01-01',
							 'run-reconciliation-child-link', 1, ?, ?)`
					)
					.bind(
						`legacy-child-link-${suffix}`,
						`legacy-family-child-${suffix}`,
						`family-number-child-${suffix}`,
						`source-child-link-${suffix}`,
						instant(20),
						instant(20)
					),
			]),
			context.db
				.prepare(
					`INSERT INTO legacy_snapshot_families
						(id, legacy_version_id, stable_family_key, legacy_family_id,
						 source_family_id, numbering_status, parent_name_match_status,
						 parent_name_normalizer_version, record_hash_sha256, created_at)
					 VALUES ('snapshot-family-child-a', ?, 'stable-family-child-a',
						 'legacy-family-child-a', 'source-family-child-a', 'valid',
						 'eligible', 2, ?, ?)`
				)
				.bind('version-reconciliation-child-link', '7'.repeat(64), instant(20)),
			context.db
				.prepare(
					`INSERT INTO legacy_snapshot_source_rows
						(id, legacy_version_id, legacy_source_row_id, source_namespace,
						 source_access_id, source_record_key, stable_family_key, source_child_key,
						 source_hash_sha256, source_values_json, created_at)
					 VALUES ('snapshot-source-child-a', ?, 'snapshot-source-child-a', 'legacy_1',
						 601, 'access:child-link:a', 'stable-family-child-a', NULL, ?, '{}', ?)`
				)
				.bind('version-reconciliation-child-link', '8'.repeat(64), instant(20)),
			...['a', 'b'].flatMap((suffix) => [
				context.db
					.prepare(
						`INSERT INTO child_correction_requests
							(id, child_id, requested_by, requested_full_name,
							 requested_full_name_normalized, requested_birth_date, status,
							 reviewed_by, reviewed_at, decision_reason, created_at, updated_at)
						 VALUES (?, ?, 'reconciliation-admin-a', 'Synthetic Child',
							 'synthetic child', '2015-01-01', 'approved',
							 'reconciliation-admin-a', ?, 'synthetic approval', ?, ?)`
					)
					.bind(
						`child-correction-link-${suffix}`,
						`legacy-child-link-${suffix}`,
						instant(20),
						instant(20),
						instant(20)
					),
				context.db
					.prepare(
						`INSERT INTO audit_events
							(id, actor_user_id, actor_kind, action, target_kind, target_id,
							 request_id, safe_diff_json, created_at)
						 VALUES (?, 'reconciliation-admin-a', 'user',
							 'child.legacy_correction_approved', 'child_correction', ?, ?, '{}', ?)`
					)
					.bind(
						`audit-child-correction-link-${suffix}`,
						`child-correction-link-${suffix}`,
						`request-child-correction-link-${suffix}`,
						instant(20)
					),
			]),
		]);
		await insertIssue(context.db, {
			issueId: 'issue-child-link-a',
			runId: 'run-reconciliation-child-link',
			sourceKey: 'access:child-link:a',
			code: 'ACCESS_CHILD_BIRTH_DATE_INVALID',
		});
		const importer = new LegacyImportReconciliationRepository(db);
		const adminRepository = new LegacyReconciliationAdminRepository(db);
		await importer.reconcileValidatedImport({
			academicPeriodId: PERIOD_ID,
			sourceKind: 'access',
			importRunId: 'run-reconciliation-child-link',
			versionId: 'version-reconciliation-child-link',
			now: instant(20),
		});
		const childCase = (
			await adminRepository.list({ lastSeenRunId: 'run-reconciliation-child-link', page: 1 })
		).items[0];
		const baseInput = {
			actor: adminActor(),
			caseId: childCase.id,
			expectedVersion: childCase.version,
			action: 'typed_child_correction' as const,
			reasonCode: 'child_correction_verified',
			targetType: 'legacy_child' as const,
			requestId: 'request-child-link',
			now: instant(21),
		};
		await expect(
			adminRepository.mutate({
				...baseInput,
				targetId: 'legacy-child-link-b',
				idempotencyKey: 'child-link-unrelated-denied',
			})
		).rejects.toMatchObject({ code: 'RECONCILIATION_TYPED_EVIDENCE_MISMATCH' });
		await adminRepository.mutate({
			...baseInput,
			targetId: 'legacy-child-link-a',
			idempotencyKey: 'child-link-related-accepted',
		});
		expect((await adminRepository.detail(childCase.id)).item).toMatchObject({
			state: 'resolved',
			resolutionKind: 'typed_child_correction',
		});
	});

	it('requires the exact duplicate enrollment pair with two distinct course assignments', async () => {
		await insertRun(context.db, {
			runId: 'run-reconciliation-distinct-service',
			versionId: 'version-reconciliation-distinct-service',
			marker: '7',
		});
		await context.db.batch([
			context.db
				.prepare(
					`INSERT INTO family_number_allocations
						(id, namespace, sequence_number, display_family_id, legacy_family_id,
						 origin, status, assigned_at, created_at, updated_at)
					 VALUES ('family-number-distinct', 'legacy_1', 6200, '1-6200',
						 'legacy-family-distinct', 'legacy', 'assigned', ?, ?, ?)`
				)
				.bind(instant(22), instant(22), instant(22)),
			context.db
				.prepare(
					`INSERT INTO legacy_families
						(id, source_namespace, source_family_id, family_number_id,
						 numbering_status, continuity_status, created_at, updated_at)
					 VALUES ('legacy-family-distinct', 'legacy_1', 'source-family-distinct',
						 'family-number-distinct', 'valid', 'stable', ?, ?)`
				)
				.bind(instant(22), instant(22)),
			context.db
				.prepare(
					`INSERT INTO children
						(id, legacy_family_id, family_number_id, origin, source_child_key,
						 source_full_name, source_full_name_normalized, source_birth_date,
						 full_name, full_name_normalized, birth_date, last_seen_run_id,
						 is_current, created_at, updated_at)
					 VALUES ('legacy-child-distinct', 'legacy-family-distinct',
						 'family-number-distinct', 'legacy', 'source-child-distinct',
						 'Synthetic Child', 'synthetic child', '2014-01-01',
						 'Synthetic Child', 'synthetic child', '2014-01-01',
						 'run-reconciliation-distinct-service', 1, ?, ?)`
				)
				.bind(instant(22), instant(22)),
			...['a', 'b'].map((suffix, index) =>
				context.db
					.prepare(
						`INSERT INTO legacy_source_rows
							(id, source_namespace, academic_period_id, source_access_id,
							 legacy_family_id, child_id, import_run_id, source_hash,
							 source_values_json, last_seen_run_id, is_current,
							 created_at, updated_at)
						 VALUES (?, 'legacy_1', ?, ?, 'legacy-family-distinct',
							 'legacy-child-distinct', 'run-reconciliation-distinct-service',
							 ?, '{}', 'run-reconciliation-distinct-service', 1, ?, ?)`
					)
					.bind(
						`legacy-source-distinct-${suffix}`,
						PERIOD_ID,
						701 + index,
						(index ? 'b' : 'a').repeat(64),
						instant(22),
						instant(22)
					)
			),
			...['a', 'b'].map((suffix, index) =>
				context.db
					.prepare(
						`INSERT INTO course_groups
							(id, academic_period_id, source_offering_key, display_name,
							 lesson_kind, subject, requires_admin_approval, catalog_status,
							 created_at, updated_at)
						 VALUES (?, ?, ?, ?, 'group', 'Synthetic', 0, 'published', ?, ?)`
					)
					.bind(
						`course-distinct-${suffix}`,
						PERIOD_ID,
						`offering-distinct-${suffix}`,
						`Distinct course ${index + 1}`,
						instant(22),
						instant(22)
					)
			),
			...['a', 'b'].map((suffix, index) =>
				context.db
					.prepare(
						`INSERT INTO legacy_snapshot_enrollments
							(id, legacy_version_id, legacy_enrollment_id, source_access_id,
							 stable_family_key, source_child_key, source_slot, source_record_key,
							 group_name_raw, group_name_normalized, needs_admin_review,
							 record_hash_sha256, created_at)
						 VALUES (?, ?, ?, ?, 'stable-family-distinct', 'source-child-distinct',
							 ?, ?, 'Shared Label', 'shared label', 1, ?, ?)`
					)
					.bind(
						`snapshot-enrollment-distinct-${suffix}`,
						'version-reconciliation-distinct-service',
						`legacy-enrollment-distinct-${suffix}`,
						701 + index,
						index === 0 ? 'main_next' : 'package_1',
						`access:distinct:${suffix}`,
						(index ? 'd' : 'c').repeat(64),
						instant(22)
					)
			),
			...['a', 'b'].map((suffix, index) =>
				context.db
					.prepare(
						`INSERT INTO legacy_enrollments
							(id, legacy_source_row_id, legacy_family_id, child_id,
							 academic_period_id, source_slot, source_record_key,
							 group_name_raw, group_name_normalized, course_group_id,
							 needs_admin_review, is_active_for_occupancy, last_seen_run_id,
							 is_current, created_at, updated_at)
						 VALUES (?, ?, 'legacy-family-distinct', 'legacy-child-distinct', ?, ?, ?,
							 'Shared Label', 'shared label', ?, 1, 0,
							 'run-reconciliation-distinct-service', 1, ?, ?)`
					)
					.bind(
						`legacy-enrollment-distinct-${suffix}`,
						`legacy-source-distinct-${suffix}`,
						PERIOD_ID,
						index === 0 ? 'main_next' : 'package_1',
						`access:distinct:${suffix}`,
						`course-distinct-${suffix}`,
						instant(22),
						instant(22)
					)
			),
		]);
		await insertIssue(context.db, {
			issueId: 'issue-distinct-service-pair',
			runId: 'run-reconciliation-distinct-service',
			sourceKey: 'access:distinct:a',
			code: 'ACCESS_CHILD_GROUP_DUPLICATE_SLOTS',
			safeContext: {
				distinctSourceRows: 2,
				slotPattern: 'main+package',
				relatedEnrollmentIds: [
					'legacy-enrollment-distinct-a',
					'legacy-enrollment-distinct-b',
				],
			},
		});
		const importer = new LegacyImportReconciliationRepository(db);
		const adminRepository = new LegacyReconciliationAdminRepository(db);
		await importer.reconcileValidatedImport({
			academicPeriodId: PERIOD_ID,
			sourceKind: 'access',
			importRunId: 'run-reconciliation-distinct-service',
			versionId: 'version-reconciliation-distinct-service',
			now: instant(22),
		});
		const duplicateCase = (
			await adminRepository.list({
				lastSeenRunId: 'run-reconciliation-distinct-service',
				page: 1,
			})
		).items[0];
		await adminRepository.mutate({
			actor: adminActor(),
			caseId: duplicateCase.id,
			expectedVersion: duplicateCase.version,
			action: 'distinct_service_proven',
			reasonCode: 'distinct_service_evidence_confirmed',
			targetType: 'legacy_enrollment',
			targetId: 'legacy-enrollment-distinct-b',
			idempotencyKey: 'distinct-service-pair-accepted',
			requestId: 'request-distinct-service-pair-accepted',
			now: instant(23),
		});
		expect((await adminRepository.detail(duplicateCase.id)).item).toMatchObject({
			state: 'resolved',
			resolutionKind: 'distinct_service_proven',
		});
	});

	it('rolls a homogeneous batch back on a concurrent case change and supports atomic replay', async () => {
		await insertRun(context.db, {
			runId: 'run-reconciliation-atomic-batch',
			versionId: 'version-reconciliation-atomic-batch',
			marker: '8',
		});
		for (const suffix of ['a', 'b']) {
			await insertIssue(context.db, {
				issueId: `issue-atomic-batch-${suffix}`,
				runId: 'run-reconciliation-atomic-batch',
				sourceKey: `access:atomic-batch:${suffix}`,
			});
		}
		await new LegacyImportReconciliationRepository(db).reconcileValidatedImport({
			academicPeriodId: PERIOD_ID,
			sourceKind: 'access',
			importRunId: 'run-reconciliation-atomic-batch',
			versionId: 'version-reconciliation-atomic-batch',
			now: instant(24),
		});
		const baseRepository = new LegacyReconciliationAdminRepository(db);
		const batchCases = (
			await baseRepository.list({ lastSeenRunId: 'run-reconciliation-atomic-batch', page: 1 })
		).items;
		const raceBoundary = new BeforeBatchDatabaseBoundary(context.db, async () => {
			await baseRepository.mutate({
				actor: adminActor(),
				caseId: batchCases[1].id,
				expectedVersion: batchCases[1].version,
				action: 'assign',
				reasonCode: 'operator_assignment',
				idempotencyKey: 'atomic-batch-concurrent-winner',
				requestId: 'request-atomic-batch-concurrent-winner',
				now: instant(25),
			});
		});
		const raceRepository = new LegacyReconciliationAdminRepository(raceBoundary);
		await expect(
			raceRepository.batchMutate({
				actor: adminActor(),
				cases: batchCases.map((item) => ({ caseId: item.id, expectedVersion: item.version })),
				action: 'assign',
				reasonCode: 'operator_assignment',
				idempotencyKey: 'atomic-batch-race',
				requestId: 'request-atomic-batch-race',
				now: instant(25),
			})
		).rejects.toBeDefined();
		expect((await baseRepository.detail(batchCases[0].id)).item).toMatchObject({
			state: 'open',
			version: 1,
		});
		const concurrentWinner = await baseRepository.detail(batchCases[1].id);
		expect(concurrentWinner.item).toMatchObject({ state: 'assigned', version: 2 });
		await baseRepository.mutate({
			actor: adminActor(),
			caseId: batchCases[1].id,
			expectedVersion: concurrentWinner.item.version,
			action: 'unassign',
			reasonCode: 'operator_unassignment',
			idempotencyKey: 'atomic-batch-reset',
			requestId: 'request-atomic-batch-reset',
			now: instant(26),
		});
		const resetSecond = await baseRepository.detail(batchCases[1].id);
		const successfulInput = {
			actor: adminActor(),
			cases: [
				{ caseId: batchCases[0].id, expectedVersion: 1 },
				{ caseId: batchCases[1].id, expectedVersion: resetSecond.item.version },
			],
			action: 'assign' as const,
			reasonCode: 'operator_assignment',
			idempotencyKey: 'atomic-batch-success',
			requestId: 'request-atomic-batch-success',
			now: instant(27),
		};
		await baseRepository.batchMutate(successfulInput);
		await baseRepository.batchMutate(successfulInput);
		expect((await baseRepository.detail(batchCases[0].id)).item.state).toBe('assigned');
		expect((await baseRepository.detail(batchCases[1].id)).item.state).toBe('assigned');
		await expect(
			baseRepository.batchMutate({
				...successfulInput,
				cases: [successfulInput.cases[0], successfulInput.cases[0]],
				idempotencyKey: 'atomic-batch-duplicate-input',
			})
		).rejects.toMatchObject({ code: 'RECONCILIATION_BATCH_COHORT_MISMATCH' });
	});

	it('creates the successor and supersedes its predecessor in one recoverable batch', async () => {
		await insertRun(context.db, {
			runId: 'run-reconciliation-supersede-old',
			versionId: 'version-reconciliation-supersede-old',
			marker: '9',
		});
		await insertIssue(context.db, {
			issueId: 'issue-reconciliation-supersede-old',
			runId: 'run-reconciliation-supersede-old',
			sourceKey: 'access:supersede:old',
			safeContext: { entityType: 'legacy_family', entityId: 'family-supersede-stable' },
		});
		const stableRepository = new LegacyImportReconciliationRepository(db);
		await stableRepository.reconcileValidatedImport({
			academicPeriodId: PERIOD_ID,
			sourceKind: 'access',
			importRunId: 'run-reconciliation-supersede-old',
			versionId: 'version-reconciliation-supersede-old',
			now: instant(28),
		});
		await insertRun(context.db, {
			runId: 'run-reconciliation-supersede-new',
			versionId: 'version-reconciliation-supersede-new',
			marker: 'b',
		});
		await insertIssue(context.db, {
			issueId: 'issue-reconciliation-supersede-new',
			runId: 'run-reconciliation-supersede-new',
			sourceKey: 'access:supersede:new',
			safeContext: { entityType: 'legacy_family', entityId: 'family-supersede-stable' },
		});
		const ambiguousRepository = new LegacyImportReconciliationRepository(
			new OneShotAfterCommitBoundary(context.db)
		);
		await expect(
			ambiguousRepository.reconcileValidatedImport({
				academicPeriodId: PERIOD_ID,
				sourceKind: 'access',
				importRunId: 'run-reconciliation-supersede-new',
				versionId: 'version-reconciliation-supersede-new',
				now: instant(29),
			})
		).rejects.toThrow(/ambiguous result/);
		await ambiguousRepository.reconcileValidatedImport({
			academicPeriodId: PERIOD_ID,
			sourceKind: 'access',
			importRunId: 'run-reconciliation-supersede-new',
			versionId: 'version-reconciliation-supersede-new',
			now: instant(29),
		});
		const supersedeCases = (
			await new LegacyReconciliationAdminRepository(db).list({
				firstSeenRunId: 'run-reconciliation-supersede-old',
				page: 1,
			})
		).items;
		expect(supersedeCases).toHaveLength(1);
		expect(supersedeCases[0]).toMatchObject({
			state: 'superseded',
			resolutionKind: 'source_identity_changed',
		});
		const successor = (
			await new LegacyReconciliationAdminRepository(db).list({
				firstSeenRunId: 'run-reconciliation-supersede-new',
				page: 1,
			})
		).items;
		expect(successor).toHaveLength(1);
		expect(successor[0].state).toBe('open');
	});
});

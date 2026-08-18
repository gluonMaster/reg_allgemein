import { DatabaseBoundary } from '$lib/server/db/database';
import { AdminMutationRepository } from '$lib/server/admin/mutation-repository';
import { LegacyReconciliationAdminRepository } from '$lib/server/admin/reconciliation-repository';
import { LegacyImportReconciliationRepository } from '$lib/server/import/reconciliation';
import { requireAdmin } from '$lib/server/security/authorization';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const NOW = '2026-08-17T12:00:00.000Z';
const PERIOD_ID = 'period-reconciliation-synthetic';
const PLUS_RUN_ID = 'run-plus-reconciliation-synthetic';
const PLUS_VERSION_ID = 'version-plus-reconciliation-synthetic';

function instant(minute: number): string {
	return `2026-08-17T12:${String(minute).padStart(2, '0')}:00.000Z`;
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
			JSON.stringify({ email: 'pii-canary@example.invalid', phone: '+49 000 000' }),
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
});

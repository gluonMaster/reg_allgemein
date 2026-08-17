import { AdminConsoleRepository } from '$lib/server/admin/admin-repository';
import { FamilyCorrectionRepository } from '$lib/server/admin/family-correction-repository';
import { AdminMutationRepository } from '$lib/server/admin/mutation-repository';
import { DatabaseBoundary } from '$lib/server/db/database';
import { requireAdmin, type AdminActor } from '$lib/server/security/authorization';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';
import { seedCurrentLegacySnapshot } from '../helpers/legacy-claim-fixtures';

const NOW = '2026-07-17T12:00:00.000Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_D = 'd'.repeat(64);

async function insertUser(input: {
	db: D1Database;
	id: string;
	role?: 'parent' | 'admin';
	familyNumberId?: string;
	familyImportRunId?: string;
	email?: string;
	blocked?: boolean;
}) {
	const role = input.role ?? 'parent';
	const email = input.email ?? `${input.id}@example.test`;
	await input.db
		.prepare(
			`INSERT INTO users
				(id, email, email_normalized, password_hash, email_verified_at, role,
				 is_blocked, account_status, first_name, last_name,
				 first_name_normalized, last_name_normalized, family_number_id,
				 family_assignment_status, family_version, family_assignment_import_run_id,
				 privacy_notice_version,
				 privacy_accepted_at, session_version, created_at, updated_at)
			 VALUES (?, ?, ?, 'synthetic-not-used', ?, ?, ?, 'active', 'Synthetic', ?,
				 'synthetic', ?, ?, ?, ?, ?, 'notice-v1', ?, 1, ?, ?)`
		)
		.bind(
			input.id,
			email,
			email.toLowerCase(),
			NOW,
			role,
			Number(input.blocked ?? false),
			input.id,
			input.id.toLowerCase(),
			input.familyNumberId ?? null,
			input.familyNumberId ? 'assigned' : 'pending_verification',
			input.familyNumberId ? 1 : 0,
			input.familyImportRunId ?? null,
			NOW,
			NOW,
			NOW
		)
		.run();
}

async function insertPortalParent(input: {
	db: D1Database;
	userId: string;
	allocationId: string;
	sequence: number;
	childId: string;
	runId: string;
}) {
	const displayFamilyId = `2. ${String(input.sequence).padStart(4, '0')}`;
	await input.db
		.prepare(
			`INSERT INTO family_number_allocations
				(id, namespace, sequence_number, display_family_id, legacy_family_id,
				 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
				 created_at, updated_at)
			 VALUES (?, 'portal_2', ?, ?, NULL, ?, 'portal', 'assigned', ?, NULL, ?, ?)`
		)
		.bind(input.allocationId, input.sequence, displayFamilyId, input.userId, NOW, NOW, NOW)
		.run();
	await insertUser({
		db: input.db,
		id: input.userId,
		familyNumberId: input.allocationId,
		familyImportRunId: input.runId,
	});
	await input.db
		.prepare(
			`INSERT INTO children
				(id, owner_user_id, legacy_family_id, family_number_id, origin,
				 source_child_key, source_full_name, source_full_name_normalized,
				 source_birth_date, full_name_override, birth_date_override,
				 full_name, full_name_normalized, birth_date, last_seen_run_id,
				 is_current, created_at, updated_at)
			 VALUES (?, ?, NULL, ?, 'portal', ?, 'Portal Child', 'portal child',
				 '2017-03-02', NULL, NULL, 'Portal Child', 'portal child', '2017-03-02',
				 ?, 1, ?, ?)`
		)
		.bind(
			input.childId,
			input.userId,
			input.allocationId,
			`portal:${input.childId}`,
			input.runId,
			NOW,
			NOW
		)
		.run();
	return displayFamilyId;
}

function adminActor(id = 'admin-console'): AdminActor {
	return requireAdmin({
		id,
		role: 'admin',
		emailVerified: true,
		sessionId: `session-${id}`,
		sessionVersion: 1,
		csrfHash: HASH_A,
	});
}

describe('stage 06A administrative console in D1', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		await insertUser({ db: context.db, id: 'admin-console', role: 'admin' });
	});

	afterEach(async () => {
		await context.dispose();
	});

	it('redacts diagnostic context and refuses a forged parent admin actor without partial state', async () => {
		const seeded = await seedCurrentLegacySnapshot({
			db: context.db,
			families: [{ sequence: 6101, emails: ['legacy.private@example.test'] }],
			now: NOW,
		});
		await context.db
			.prepare(
				`INSERT INTO import_issues
					(id, import_run_id, severity, code, source_record_key,
					 safe_context_json, status, created_at)
				 VALUES ('unsafe-context-issue', ?, 'warning', 'SYNTHETIC_SAFE_SCAN',
					 'access:synthetic:1', ?, 'open', ?)`
			)
			.bind(
				seeded.accessRunId,
				JSON.stringify({
					localPath: 'C:\\clients\\private.accdb',
					email: 'client@example.test',
					rowNumber: 7,
					entityType: 'legacy_family',
					entityId: `legacy_family_${'a'.repeat(32)}`,
				}),
				NOW
			)
			.run();

		const repository = new AdminConsoleRepository(db);
		const detail = await repository.importRunDetail(seeded.accessRunId);
		expect(JSON.stringify(detail)).not.toContain('private.accdb');
		expect(JSON.stringify(detail)).not.toContain('client@example.test');
		expect(JSON.stringify(detail)).toContain('[REDACTED]');
		expect(detail?.issues[0].legacyFamilyId).toBe(`legacy_family_${'a'.repeat(32)}`);
		expect(
			JSON.stringify(
				await repository.listLegacyFamilies({ q: '', status: '', kind: '', page: 1 })
			)
		).not.toContain('legacy.private@example.test');

		await insertUser({ db: context.db, id: 'forged-parent' });
		await insertUser({ db: context.db, id: 'block-target' });
		const mutations = new AdminMutationRepository(db);
		await expect(
			mutations.setBlocked({
				actor: {
					...adminActor(),
					id: 'forged-parent',
				} as AdminActor,
				userId: 'block-target',
				blocked: true,
				reason: 'Synthetic forged parent attempt',
				idempotencyKey: 'forged-parent-block-attempt',
				requestId: 'forged-parent-request',
				now: NOW,
			})
		).rejects.toBeTruthy();
		const target = await context.db
			.prepare(`SELECT is_blocked FROM users WHERE id = 'block-target'`)
			.first<{ is_blocked: number }>();
		expect(target?.is_blocked).toBe(0);
		expect(
			await context.db
				.prepare(
					`SELECT COUNT(*) AS count FROM idempotency_records
					WHERE scope = 'admin:user-block'`
				)
				.first<{ count: number }>()
		).toEqual({ count: 0 });
	});

	it('blocks idempotently, revokes sessions and audits typed import decisions', async () => {
		await insertUser({
			db: context.db,
			id: 'session-target',
			email: 'session.target@example.test',
		});
		await context.db
			.prepare(
				`INSERT INTO auth_sessions
					(id, user_id, jti_hash, csrf_hash, session_version, expires_at,
					 revoked_at, revocation_reason, created_at, last_seen_at)
				 VALUES ('target-session', 'session-target', ?, ?, 1,
					 '2026-07-20T00:00:00.000Z', NULL, NULL, ?, ?)`
			)
			.bind(HASH_A, HASH_B, NOW, NOW)
			.run();
		const mutations = new AdminMutationRepository(db);
		const command = {
			actor: adminActor(),
			userId: 'session-target',
			blocked: true,
			reason: 'Synthetic security block',
			idempotencyKey: 'block-session-target-0001',
			requestId: 'block-session-target-request',
			now: NOW,
		};
		expect(await mutations.setBlocked(command)).toMatchObject({ replayed: false });
		expect(await mutations.setBlocked(command)).toMatchObject({ replayed: true });
		const state = await context.db
			.prepare(
				`SELECT user.is_blocked, user.session_version, session.revoked_at
				 FROM users user JOIN auth_sessions session ON session.user_id = user.id
				 WHERE user.id = 'session-target'`
			)
			.first<{ is_blocked: number; session_version: number; revoked_at: string | null }>();
		expect(state).toEqual({ is_blocked: 1, session_version: 2, revoked_at: NOW });
		expect(
			await context.db
				.prepare(
					`SELECT COUNT(*) AS count FROM audit_events
					WHERE action = 'auth.user_blocked' AND target_id = 'session-target'`
				)
				.first<{ count: number }>()
		).toEqual({ count: 1 });

		const seeded = await seedCurrentLegacySnapshot({
			db: context.db,
			families: [
				{
					sequence: 6110,
					emails: ['correction.family@example.test'],
					childName: 'Original Child',
					childBirthDate: '2016-04-03',
				},
			],
			now: NOW,
		});
		await context.db
			.prepare(
				`INSERT INTO import_issues
					(id, import_run_id, severity, code, safe_context_json, status, created_at)
				 VALUES ('typed-import-issue', ?, 'warning', 'SYNTHETIC_AMBIGUITY',
					 '{}', 'open', ?)`
			)
			.bind(seeded.accessRunId, NOW)
			.run();
		await mutations.decideImportIssue({
			actor: adminActor(),
			issueId: 'typed-import-issue',
			decision: 'dismiss',
			reason: 'Synthetic issue inspected locally',
			idempotencyKey: 'dismiss-import-issue-0001',
			requestId: 'dismiss-import-request',
			now: NOW,
		});
		expect(
			await context.db
				.prepare(
					`SELECT status, resolved_by FROM import_issues WHERE id = 'typed-import-issue'`
				)
				.first()
		).toEqual({ status: 'dismissed', resolved_by: 'admin-console' });

		await insertUser({ db: context.db, id: 'correction-requester' });
		const legacyChild = await context.db
			.prepare(`SELECT id FROM children WHERE source_full_name = 'Original Child'`)
			.first<{ id: string }>();
		await context.db.batch([
			context.db
				.prepare(
					`INSERT INTO child_correction_requests
						(id, child_id, requested_by, requested_full_name,
						 requested_full_name_normalized, requested_birth_date,
						 status, created_at, updated_at)
					 VALUES ('typed-child-correction', ?, 'correction-requester',
						 'Corrected Child', 'corrected child', '2016-04-04',
						 'pending', ?, ?)`
				)
				.bind(legacyChild!.id, NOW, NOW),
			context.db
				.prepare(
					`INSERT INTO admin_review_tasks
						(id, kind, source_kind, source_id, reason_code, safe_summary,
						 status, created_at, updated_at)
					 VALUES ('typed-child-task', 'family_correction', 'child_correction',
						 'typed-child-correction', 'CHILD_CORRECTION_REQUESTED',
						 'Synthetic child correction', 'open', ?, ?)`
				)
				.bind(NOW, NOW),
		]);
		await mutations.decideChildCorrection({
			actor: adminActor(),
			taskId: 'typed-child-task',
			correctionId: 'typed-child-correction',
			decision: 'approve',
			reason: 'Synthetic correction evidence inspected',
			idempotencyKey: 'approve-child-correction-0001',
			requestId: 'approve-child-correction-request',
			now: NOW,
		});
		expect(
			await context.db
				.prepare(`SELECT full_name, birth_date FROM children WHERE id = ?`)
				.bind(legacyChild!.id)
				.first()
		).toEqual({ full_name: 'Corrected Child', birth_date: '2016-04-04' });
		expect(
			await context.db
				.prepare(
					`SELECT status FROM child_correction_requests
					WHERE id = 'typed-child-correction'`
				)
				.first()
		).toEqual({ status: 'approved' });
		expect(
			await context.db
				.prepare(`SELECT status FROM admin_review_tasks WHERE id = 'typed-child-task'`)
				.first()
		).toEqual({ status: 'resolved' });

		await context.db
			.prepare(
				`INSERT INTO admin_review_tasks
					(id, kind, source_kind, source_id, reason_code, safe_summary,
					 status, created_at, updated_at)
				 VALUES ('typed-claim-conflict', 'family_claim_conflict', 'legacy_family',
					 'synthetic-conflict-family', 'FAMILY_ALREADY_OWNED',
					 'Synthetic claim conflict', 'open', ?, ?)`
			)
			.bind(NOW, NOW)
			.run();
		await mutations.dismissReview({
			actor: adminActor(),
			taskId: 'typed-claim-conflict',
			decision: 'dismiss_claim_conflict',
			reason: 'Synthetic conflict evidence inspected',
			idempotencyKey: 'dismiss-claim-conflict-0001',
			requestId: 'dismiss-claim-conflict-request',
			now: NOW,
		});
		expect(
			await context.db
				.prepare(`SELECT status FROM admin_review_tasks WHERE id = 'typed-claim-conflict'`)
				.first()
		).toEqual({ status: 'dismissed' });
		expect(
			await context.db
				.prepare(
					`SELECT COUNT(*) AS count FROM audit_events
					WHERE action = 'review.family_claim_conflict.dismissed'`
				)
				.first<{ count: number }>()
		).toEqual({ count: 1 });
	});

	it('confirms mappings and catalog changes through typed audited handlers without notifications', async () => {
		const seeded = await seedCurrentLegacySnapshot({
			db: context.db,
			families: [
				{
					sequence: 6201,
					emails: ['mapping@example.test'],
					childName: 'Mapping Child',
					groupName: 'Mapping Source Group',
				},
			],
			now: NOW,
		});
		const legacy = await context.db
			.prepare(
				`SELECT id, group_name_normalized FROM legacy_enrollments
					WHERE group_name_raw = 'Mapping Source Group'`
			)
			.first<{ id: string; group_name_normalized: string }>();
		await context.db.batch([
			context.db
				.prepare(
					`INSERT INTO import_runs
					(id, source_kind, academic_period_id, source_label, source_hash_sha256,
					 source_contract_id, source_contract_version, structural_fingerprint_sha256,
					 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
					 attempt_no, status, started_at, validated_at, promoted_at, finished_at,
					 rows_total, rows_staged, rows_promoted, rows_skipped, safe_summary_json,
					 created_at, updated_at)
				 VALUES ('admin-schedule-run', 'schedule', ?, 'synthetic', ?, 'schedule-v1', 1,
					 ?, '{}', ?, ?, 1, 'promoted', ?, ?, ?, ?, 1, 1, 1, 0, '{}', ?, ?)`
				)
				.bind(
					seeded.periodId,
					HASH_A,
					HASH_A,
					HASH_A,
					HASH_D,
					NOW,
					NOW,
					NOW,
					NOW,
					NOW,
					NOW
				),
			context.db
				.prepare(
					`INSERT INTO schedule_versions
					(id, academic_period_id, import_run_id, schema_version, generation_id,
					 generated_at, version_hash_sha256, is_published, created_at)
				 VALUES ('admin-schedule-version', ?, 'admin-schedule-run', 1,
					 'admin-generation', ?, ?, 0, ?)`
				)
				.bind(seeded.periodId, NOW, HASH_A, NOW),
			context.db
				.prepare(
					`INSERT INTO course_groups
					(id, academic_period_id, source_offering_key, display_name,
					 normalized_price_key, lesson_kind, subject, capacity_default,
					 capacity_override, requires_admin_approval, catalog_status,
					 last_seen_schedule_version_id, retired_at, created_at, updated_at)
				 VALUES ('admin-course', ?, 'admin-course', 'Mapped Course', 'mapped course',
					 'group', 'music', 12, NULL, 1, 'hidden',
					 'admin-schedule-version', NULL, ?, ?)`
				)
				.bind(seeded.periodId, NOW, NOW),
			context.db
				.prepare(
					`INSERT INTO course_sessions
					(id, course_group_id, schedule_version_id, source_namespace,
					 source_block_id, source_block_hash_sha256, display_name_snapshot,
					 lesson_kind_snapshot, subject_snapshot, day_code, start_time, end_time,
					 duration_minutes, timezone, teacher_name, building, room,
					 location_display, is_current, created_at)
				 VALUES ('admin-session', 'admin-course', 'admin-schedule-version', 'schedule',
					 'admin-block', ?, 'Mapped Course', 'group', 'music', 'MO', '15:00',
					 '16:30', 90, 'Europe/Berlin', 'Synthetic Teacher', 'A', '1',
					 'A 1', 1, ?)`
				)
				.bind(HASH_A, NOW),
			context.db
				.prepare(
					`INSERT INTO course_source_mappings
					(id, academic_period_id, source_kind, source_value_normalized,
					 course_group_id, status, reason, created_by, created_at, updated_at)
				 VALUES ('preexisting-mapping', ?, 'access', ?, 'admin-course',
					 'suggested', 'Synthetic suggested mapping', 'admin-console', ?, ?)`
				)
				.bind(seeded.periodId, legacy!.group_name_normalized, NOW, NOW),
			context.db
				.prepare(
					`INSERT INTO admin_review_tasks
					(id, kind, source_kind, source_id, reason_code, safe_summary,
					 status, created_at, updated_at)
				 VALUES ('mapping-task', 'course_mapping', 'legacy_enrollment', ?,
					 'COURSE_MAPPING_REQUIRED', 'Synthetic mapping task', 'open', ?, ?)`
				)
				.bind(legacy!.id, NOW, NOW),
		]);

		const mutations = new AdminMutationRepository(db);
		await mutations.decideCourseMapping({
			actor: adminActor(),
			taskId: 'mapping-task',
			legacyEnrollmentId: legacy!.id,
			courseGroupId: 'admin-course',
			decision: 'confirm',
			reason: 'Synthetic exact operator mapping',
			idempotencyKey: 'mapping-confirmation-0001',
			requestId: 'mapping-confirmation-request',
			now: NOW,
		});
		await mutations.updateCatalogCourse({
			actor: adminActor(),
			courseGroupId: 'admin-course',
			action: 'set_capacity',
			capacity: 14,
			reason: 'Synthetic room capacity evidence',
			idempotencyKey: 'catalog-capacity-0001',
			requestId: 'catalog-capacity-request',
			now: NOW,
		});
		await mutations.updateCatalogCourse({
			actor: adminActor(),
			courseGroupId: 'admin-course',
			action: 'publish',
			reason: 'Synthetic publication confirmation',
			idempotencyKey: 'catalog-publish-0001',
			requestId: 'catalog-publish-request',
			now: NOW,
		});

		expect(
			await context.db
				.prepare(`SELECT course_group_id FROM legacy_enrollments WHERE id = ?`)
				.bind(legacy!.id)
				.first()
		).toEqual({ course_group_id: 'admin-course' });
		expect(
			await context.db
				.prepare(
					`SELECT id, status FROM course_source_mappings
					WHERE course_group_id = 'admin-course'`
				)
				.first()
		).toEqual({ id: 'preexisting-mapping', status: 'confirmed' });
		expect(
			await context.db
				.prepare(
					`SELECT capacity_override, catalog_status FROM course_groups
					WHERE id = 'admin-course'`
				)
				.first()
		).toEqual({ capacity_override: 14, catalog_status: 'published' });
		expect(
			await context.db
				.prepare(
					`SELECT COUNT(*) AS count FROM audit_events
					WHERE action IN ('course.mapping.confirmed', 'catalog.course.set_capacity',
						'catalog.course.publish')`
				)
				.first<{ count: number }>()
		).toEqual({ count: 3 });
		expect(
			await context.db
				.prepare(`SELECT COUNT(*) AS count FROM email_outbox`)
				.first<{ count: number }>()
		).toEqual({ count: 0 });
	});

	it('previews and atomically applies FamilyID correction, rejects owned destinations and rolls stale previews back', async () => {
		const seeded = await seedCurrentLegacySnapshot({
			db: context.db,
			families: [
				{
					sequence: 6301,
					emails: ['destination@example.test'],
					childName: 'Destination Child',
				},
				{ sequence: 6302, emails: ['stale@example.test'], childName: 'Stale Destination' },
				{ sequence: 6303, emails: ['owned@example.test'], ownedBy: 'other-owner' },
				{ sequence: 6304, emails: ['ambiguous@example.test'] },
			],
			now: NOW,
		});
		const destination = await context.db
			.prepare(
				`SELECT id, family_number_id FROM legacy_families WHERE source_family_id = '1. 6301'`
			)
			.first<{ id: string; family_number_id: string }>();
		const staleDestination = await context.db
			.prepare(
				`SELECT family_number_id FROM legacy_families WHERE source_family_id = '1. 6302'`
			)
			.first<{ family_number_id: string }>();
		const ownedDestination = await context.db
			.prepare(
				`SELECT family_number_id FROM legacy_families WHERE source_family_id = '1. 6303'`
			)
			.first<{ family_number_id: string }>();
		const ambiguousDestination = await context.db
			.prepare(
				`SELECT id, family_number_id FROM legacy_families WHERE source_family_id = '1. 6304'`
			)
			.first<{ id: string; family_number_id: string }>();
		await insertUser({
			db: context.db,
			id: 'other-owner',
			familyNumberId: ownedDestination!.family_number_id,
		});
		await insertPortalParent({
			db: context.db,
			userId: 'correction-parent',
			allocationId: 'portal-source-allocation',
			sequence: 1,
			childId: 'portal-source-child',
			runId: seeded.accessRunId,
		});
		await insertPortalParent({
			db: context.db,
			userId: 'stale-parent',
			allocationId: 'stale-source-allocation',
			sequence: 2,
			childId: 'stale-source-child',
			runId: seeded.accessRunId,
		});
		await context.db
			.prepare(
				`INSERT INTO admin_review_tasks
					(id, kind, source_kind, source_id, reason_code, safe_summary,
					 status, created_at, updated_at)
				 VALUES ('family-name-review', 'family_name_match', 'legacy_family', ?,
					 'parent_name_match', 'Synthetic safe summary', 'open', ?, ?)`
			)
			.bind(destination!.id, NOW, NOW)
			.run();

		const familyCorrection = new FamilyCorrectionRepository(db);
		await expect(
			familyCorrection.createPreview({
				actor: adminActor(),
				userId: 'correction-parent',
				destinationKind: 'legacy_existing',
				destinationAllocationId: ownedDestination!.family_number_id,
				requestId: 'owned-destination-preview',
				now: NOW,
			})
		).rejects.toMatchObject({ code: 'FAMILY_DESTINATION_CONFLICT' });
		await context.db
			.prepare(
				`INSERT INTO children
					(id, owner_user_id, legacy_family_id, family_number_id, origin,
					 source_child_key, source_full_name, source_full_name_normalized,
					 source_birth_date, full_name, full_name_normalized, birth_date,
					 last_seen_run_id, is_current, created_at, updated_at)
				 VALUES ('ambiguous-untracked-child', NULL, ?, ?, 'legacy',
					 'ambiguous:untracked', 'Untracked Child', 'untracked child',
					 '2015-02-01', 'Untracked Child', 'untracked child', '2015-02-01',
					 ?, 1, ?, ?)`
			)
			.bind(
				ambiguousDestination!.id,
				ambiguousDestination!.family_number_id,
				seeded.accessRunId,
				NOW,
				NOW
			)
			.run();
		await expect(
			familyCorrection.createPreview({
				actor: adminActor(),
				userId: 'correction-parent',
				destinationKind: 'legacy_existing',
				destinationAllocationId: ambiguousDestination!.family_number_id,
				requestId: 'ambiguous-destination-preview',
				now: NOW,
			})
		).rejects.toMatchObject({ code: 'FAMILY_DESTINATION_CHILD_AMBIGUITY' });

		const preview = await familyCorrection.createPreview({
			actor: adminActor(),
			userId: 'correction-parent',
			destinationKind: 'legacy_existing',
			destinationAllocationId: destination!.family_number_id,
			requestId: 'family-preview-request',
			now: NOW,
		});
		expect(preview.children).toHaveLength(2);
		expect(preview.consequences).toMatchObject({
			nonterminalOfferCount: 0,
			immutableContractCount: 0,
			safeDetails: { contractTablesAvailable: false },
		});
		const applyCommand = {
			actor: adminActor(),
			previewId: preview.id,
			reason: 'Synthetic verified FamilyID correction',
			idempotencyKey: 'family-correction-apply-0001',
			requestId: 'family-correction-apply-request',
			now: NOW,
		};
		expect(await familyCorrection.apply(applyCommand)).toMatchObject({ replayed: false });
		expect(await familyCorrection.apply(applyCommand)).toMatchObject({ replayed: true });
		expect(
			await context.db
				.prepare(
					`SELECT family_number_id, family_version FROM users
					WHERE id = 'correction-parent'`
				)
				.first()
		).toEqual({ family_number_id: destination!.family_number_id, family_version: 2 });
		expect(
			await context.db
				.prepare(
					`SELECT COUNT(*) AS count FROM children WHERE owner_user_id = 'correction-parent'
					AND family_number_id = ?`
				)
				.bind(destination!.family_number_id)
				.first<{ count: number }>()
		).toEqual({ count: 2 });
		expect(
			await context.db
				.prepare(`SELECT status FROM admin_review_tasks WHERE id = 'family-name-review'`)
				.first()
		).toEqual({ status: 'resolved' });

		const stalePreview = await familyCorrection.createPreview({
			actor: adminActor(),
			userId: 'stale-parent',
			destinationKind: 'legacy_existing',
			destinationAllocationId: staleDestination!.family_number_id,
			requestId: 'stale-family-preview',
			now: NOW,
		});
		await context.db
			.prepare(
				`INSERT INTO children
					(id, owner_user_id, legacy_family_id, family_number_id, origin,
					 source_child_key, source_full_name, source_full_name_normalized,
					 source_birth_date, full_name, full_name_normalized, birth_date,
					 last_seen_run_id, is_current, created_at, updated_at)
				 VALUES ('late-child', 'stale-parent', NULL, 'stale-source-allocation', 'portal',
					 'portal:late-child', 'Late Child', 'late child', '2018-01-01',
					 'Late Child', 'late child', '2018-01-01', ?, 1, ?, ?)`
			)
			.bind(seeded.accessRunId, NOW, NOW)
			.run();
		await expect(
			familyCorrection.apply({
				actor: adminActor(),
				previewId: stalePreview.id,
				reason: 'Synthetic stale correction',
				idempotencyKey: 'stale-family-correction-0001',
				requestId: 'stale-family-apply',
				now: NOW,
			})
		).rejects.toBeTruthy();
		expect(
			await context.db
				.prepare(
					`SELECT family_number_id, family_version FROM users WHERE id = 'stale-parent'`
				)
				.first()
		).toEqual({ family_number_id: 'stale-source-allocation', family_version: 1 });
		expect(
			await context.db
				.prepare(`SELECT owner_user_id FROM family_number_allocations WHERE id = ?`)
				.bind(staleDestination!.family_number_id)
				.first()
		).toEqual({ owner_user_id: null });
		expect(
			await context.db
				.prepare(
					`SELECT COUNT(*) AS count FROM family_reassignments
					WHERE user_id = 'stale-parent'`
				)
				.first<{ count: number }>()
		).toEqual({ count: 0 });
	});
});

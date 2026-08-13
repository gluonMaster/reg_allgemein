import { DatabaseBoundary } from '$lib/server/db/database';
import { CatalogRepository } from '$lib/server/catalog/catalog-repository';
import { CatalogService } from '$lib/server/catalog/catalog-service';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import { PricingRepository } from '$lib/server/pricing/pricing-repository';
import { PricingService } from '$lib/server/pricing/pricing-service';
import { TrialRepository } from '$lib/server/trials/trial-repository';
import { TrialService } from '$lib/server/trials/trial-service';
import { AdminMutationRepository } from '$lib/server/admin/mutation-repository';
import { requireAdmin } from '$lib/server/security/authorization';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const now = '2026-07-17T10:00:00.000Z';
const hash = (character: string) => character.repeat(64);
const pricingConfig = {
	individualPriceCentsPer45Min: 3000,
	groupDurationFallbackMinutes: 90,
	missingDurationYearlyCentsPer45Min: 2300,
	missingDurationMonthlyCentsPer45Min: 3000,
	quoteTtlSeconds: 86_400,
};

const parentActor: AuthenticatedUser = {
	id: 'parent-trials',
	role: 'parent',
	emailVerified: true,
	sessionId: 'parent-session',
	sessionVersion: 1,
	csrfHash: 'parent-csrf',
};

const adminActor = requireAdmin({
	id: 'admin-trials',
	role: 'admin',
	emailVerified: true,
	sessionId: 'admin-session',
	sessionVersion: 1,
	csrfHash: 'admin-csrf',
});

async function seedSchedule(db: DatabaseBoundary, periodId: string, suffix: string, current: boolean) {
	const runId = `schedule-run-${suffix}`;
	const scheduleId = `schedule-${suffix}`;
	await db.batch([
		{
			sql: `INSERT INTO import_runs
				(id, source_kind, academic_period_id, source_label, source_hash_sha256,
				 source_contract_id, source_contract_version, structural_fingerprint_sha256,
				 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
				 attempt_no, retry_of_run_id, status, started_at, validated_at,
				 promoted_at, finished_at, rows_total, rows_staged, rows_promoted,
				 rows_skipped, safe_summary_json, error_code, created_at, updated_at)
			VALUES (?, 'schedule', ?, ?, ?, 'schedule-json', 1, ?, '{}', ?, ?, 1,
				NULL, 'validated', ?, ?, NULL, NULL, 1, 1, 0, 0, '{}', NULL, ?, ?)`,
			params: [
				runId, periodId, `synthetic-${suffix}`, hash('a'), hash('b'), hash('c'),
				hash(suffix === 'current' ? 'd' : 'e'), now, now, now, now,
			],
		},
		{
			sql: `INSERT INTO operation_locks
				(id, scope, resource_key, lease_owner, lease_until, fencing_token,
				 created_at, updated_at)
			VALUES (?, 'import-promotion', ?, ?, '2026-07-18T10:00:00.000Z', 1, ?, ?)`,
			params: [`lock-${suffix}`, `schedule:${periodId}`, `owner-${suffix}`, now, now],
		},
		{
			sql: `INSERT INTO schedule_versions
				(id, academic_period_id, import_run_id, schema_version, generation_id,
				 generated_at, version_hash_sha256, is_published, published_at, retired_at,
				 promotion_owner, promotion_fencing_token, created_at)
			VALUES (?, ?, ?, 1, ?, ?, ?, 0, NULL, NULL, NULL, NULL, ?)`,
			params: [scheduleId, periodId, runId, `generation-${suffix}`, now, hash('f'), now],
		},
		{
			sql: `UPDATE schedule_versions SET is_published = 1, published_at = ?,
				promotion_owner = ?, promotion_fencing_token = 1 WHERE id = ?`,
			params: [now, `owner-${suffix}`, scheduleId],
		},
	]);
	return { runId, scheduleId, current };
}

async function seedCourse(input: {
	db: DatabaseBoundary;
	periodId: string;
	scheduleId: string;
	id: string;
	displayName: string;
	lessonKind:
		| 'group'
		| 'dance_group'
		| 'nachhilfe'
		| 'individual'
		| 'needs_review';
	capacity: number | null;
	requiresReview?: boolean;
	status?: 'published' | 'retired' | 'hidden';
}) {
	await input.db.batch([
		{
			sql: `INSERT INTO course_groups
				(id, academic_period_id, source_offering_key, display_name,
				 normalized_price_key, lesson_kind, subject, capacity_default,
				 capacity_override, requires_admin_approval, catalog_status,
				 last_seen_schedule_version_id, retired_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, 'Kunst', ?, NULL, ?, ?, ?, NULL, ?, ?)`,
			params: [
				input.id, input.periodId, `offering-${input.id}`, input.displayName, 'kunst',
				input.lessonKind, input.capacity, Number(input.requiresReview ?? false),
				input.status ?? 'published', input.scheduleId, now, now,
			],
		},
		{
			sql: `INSERT INTO course_sessions
				(id, course_group_id, schedule_version_id, source_namespace,
				 source_block_id, source_block_hash_sha256, display_name_snapshot,
				 lesson_kind_snapshot, subject_snapshot, day_code, start_time, end_time,
				 duration_minutes, timezone, teacher_name, building, room,
				 location_display, is_current, retired_at, created_at)
			VALUES (?, ?, ?, 'synthetic', ?, ?, ?, ?, 'Kunst', 'MO', '15:00',
				'16:30', 90, 'Europe/Berlin', 'Synthetic Teacher', 'A', '1',
				'Gebäude A, Raum 1', 1, NULL, ?)`,
			params: [
				`session-${input.id}`, input.id, input.scheduleId, `block-${input.id}`,
				hash('9'), input.displayName, input.lessonKind, now,
			],
		},
	]);
}

async function seedIdentity(db: DatabaseBoundary, importRunId: string) {
	await db.batch([
		{
			sql: `INSERT INTO family_number_allocations
				(id, namespace, sequence_number, display_family_id, legacy_family_id,
				 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
				 created_at, updated_at)
			VALUES ('family-parent', 'portal_2', 7001, '2. 7001', NULL,
				'parent-trials', 'portal', 'assigned', ?, NULL, ?, ?)`,
			params: [now, now, now],
		},
		{
			sql: `INSERT INTO family_number_allocations
				(id, namespace, sequence_number, display_family_id, legacy_family_id,
				 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
				 created_at, updated_at)
			VALUES ('family-foreign', 'portal_2', 7002, '2. 7002', NULL,
				'foreign-parent', 'portal', 'assigned', ?, NULL, ?, ?)`,
			params: [now, now, now],
		},
	]);
	for (const user of [
		['parent-trials', 'parent@example.test', 'parent', 'family-parent', importRunId],
		['foreign-parent', 'foreign@example.test', 'parent', 'family-foreign', importRunId],
		['admin-trials', 'admin@example.test', 'admin', null, null],
	] as const) {
		await db.run({
			sql: `INSERT INTO users
				(id, email, email_normalized, password_hash, email_verified_at, role,
				 first_name, last_name, first_name_normalized, last_name_normalized,
				 family_number_id, family_assignment_status, family_version,
				 family_assignment_import_run_id, privacy_notice_version,
				 privacy_accepted_at, created_at, updated_at)
			VALUES (?, ?, ?, 'not-used', ?, ?, 'Test', 'User', 'test', 'user', ?, ?,
				?, ?, 'synthetic-v1', ?, ?, ?)`,
			params: [
				user[0], user[1], user[1], now, user[2], user[3],
				user[2] === 'parent' ? 'assigned' : 'pending_verification',
				user[2] === 'parent' ? 1 : 0, user[4], now, now, now,
			],
		});
	}
	for (const child of [
		['child-trial', 'parent-trials', 'family-parent', 'Trial Child'],
		['child-active', 'parent-trials', 'family-parent', 'Active Child'],
		['child-foreign', 'foreign-parent', 'family-foreign', 'Foreign Child'],
	] as const) {
		await db.run({
			sql: `INSERT INTO children
				(id, owner_user_id, legacy_family_id, family_number_id, origin,
				 source_child_key, source_full_name, source_full_name_normalized,
				 source_birth_date, full_name_override, birth_date_override, full_name,
				 full_name_normalized, birth_date, last_seen_run_id, is_current,
				 created_at, updated_at)
			VALUES (?, ?, NULL, ?, 'portal', ?, ?, lower(?), '2017-02-03', NULL,
				NULL, ?, lower(?), '2017-02-03', ?, 1, ?, ?)`,
			params: [
				child[0], child[1], child[2], `source-${child[0]}`, child[3], child[3],
				child[3], child[3], importRunId, now, now,
			],
		});
	}
}

describe('stage 07 catalog and trial workflow in D1', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;
	let catalogService: CatalogService;
	let trialService: TrialService;
	let trials: TrialRepository;
	let adminMutations: AdminMutationRepository;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		await db.batch([
			{
				sql: `INSERT INTO academic_periods
					(id, code, display_name, starts_on, ends_on, is_current, created_at)
				VALUES ('period-current', '2026-2027', '2026/2027', '2026-01-01',
					'2027-12-31', 1, ?)`,
				params: [now],
			},
			{
				sql: `INSERT INTO academic_periods
					(id, code, display_name, starts_on, ends_on, is_current, created_at)
				VALUES ('period-staging', '2027-2028', '2027/2028', '2027-01-01',
					'2028-12-31', 0, ?)`,
				params: [now],
			},
		]);
		const current = await seedSchedule(db, 'period-current', 'current', true);
		const staging = await seedSchedule(db, 'period-staging', 'staging', false);
		await seedIdentity(db, current.runId);
		await seedCourse({ db, periodId: 'period-current', scheduleId: current.scheduleId, id: 'course-available', displayName: 'Gleicher Name', lessonKind: 'group', capacity: 12 });
		await seedCourse({ db, periodId: 'period-current', scheduleId: current.scheduleId, id: 'course-review', displayName: 'Gleicher Name', lessonKind: 'dance_group', capacity: 15, requiresReview: true });
		await seedCourse({ db, periodId: 'period-current', scheduleId: current.scheduleId, id: 'course-full', displayName: 'Volle Gruppe', lessonKind: 'group', capacity: 1 });
		await seedCourse({ db, periodId: 'period-current', scheduleId: current.scheduleId, id: 'course-unknown', displayName: 'Unklare Gruppe', lessonKind: 'group', capacity: null });
		await seedCourse({ db, periodId: 'period-current', scheduleId: current.scheduleId, id: 'course-nachhilfe', displayName: 'Nachhilfe', lessonKind: 'nachhilfe', capacity: 1 });
		await seedCourse({ db, periodId: 'period-current', scheduleId: current.scheduleId, id: 'course-individual', displayName: 'Einzelunterricht', lessonKind: 'individual', capacity: 1 });
		await seedCourse({ db, periodId: 'period-current', scheduleId: current.scheduleId, id: 'course-needs-review', displayName: 'Ungeklärtes Angebot', lessonKind: 'needs_review', capacity: null });
		await seedCourse({ db, periodId: 'period-current', scheduleId: current.scheduleId, id: 'course-retired', displayName: 'Alt', lessonKind: 'group', capacity: 12, status: 'retired' });
		await seedCourse({ db, periodId: 'period-staging', scheduleId: staging.scheduleId, id: 'course-staging', displayName: 'Zukunft', lessonKind: 'group', capacity: 12 });
		await db.run({
			sql: `INSERT INTO enrollments
				(id, user_id, child_id, course_group_id, legacy_enrollment_id, lesson_kind,
				 status, contract_kind, active_from, active_until, current_price_cents,
				 price_source, price_mode, price_effective_from, source, created_at, updated_at)
			VALUES ('active-full', 'parent-trials', 'child-active', 'course-full', NULL,
				'group', 'active', 'group_yearly', '2026-01-01', NULL, 4000,
				'excel_yearly', 'rule_derived', '2026-01-01', 'portal', ?, ?)`,
			params: [now, now],
		});
		const occupancy = new OccupancyRepository(db);
		const catalog = new CatalogRepository(db);
		const pricing = new PricingService(new PricingRepository(db), occupancy, pricingConfig);
		catalogService = new CatalogService(catalog, occupancy, pricing, () => now);
		trials = new TrialRepository(db);
		trialService = new TrialService(trials, catalog, occupancy, () => now);
		adminMutations = new AdminMutationRepository(db);
	});

	afterEach(async () => context.dispose());

	it('publishes only the current catalog, preserves identity, CTA, availability and quote semantics', async () => {
		const catalog = await catalogService.loadPublishedCatalog();
		expect(catalog.map((course) => course.id)).not.toContain('course-staging');
		expect(catalog.map((course) => course.id)).not.toContain('course-retired');
		expect(catalog.map((course) => course.id)).not.toContain('course-group-nachhilfe');
		expect(catalog.map((course) => course.id)).not.toContain('course-needs-review');
		expect(catalog.filter((course) => course.displayName === 'Gleicher Name')).toHaveLength(2);
		expect(catalog.find((course) => course.id === 'course-available')).toMatchObject({
			availability: { status: 'available', requiresManualReview: false },
			cta: { kind: 'trial' },
			quote: { status: 'needs_admin_review', amountCents: null },
		});
		expect(catalog.find((course) => course.id === 'course-full')?.availability.status).toBe('full');
		expect(catalog.find((course) => course.id === 'course-unknown')?.availability.status).toBe('unknown');
		expect(catalog.find((course) => course.id === 'course-review')?.availability.status).toBe('requires_admin_review');
		expect(catalog.find((course) => course.id === 'course-nachhilfe')).toMatchObject({
			cta: { kind: 'nachhilfe_request' },
			quote: { status: 'quoted', amountCents: 3000, parentPayable: false },
		});
		expect(catalog.find((course) => course.id === 'course-individual')).toMatchObject({
			cta: { kind: 'individual_request' },
			quote: { status: 'quoted', amountCents: 3000, parentPayable: true },
		});
	});

	it('accepts manual-review requests but denies past, foreign, non-trial, duplicate and tampered submissions', async () => {
		await expect(trialService.submit({ actor: parentActor, payload: { courseGroupId: 'course-available', childId: 'child-trial', sessionId: 'session-course-available', requestedDate: '2026-07-17', idempotencyKey: 'past-date-key' }, requestId: 'past' })).rejects.toMatchObject({ code: 'TRIAL_DATE_NOT_FUTURE' });
		await expect(trialService.submit({ actor: parentActor, payload: { courseGroupId: 'course-available', childId: 'child-foreign', sessionId: 'session-course-available', requestedDate: '2026-07-20', idempotencyKey: 'foreign-child-key' }, requestId: 'foreign' })).rejects.toMatchObject({ code: 'TRIAL_CHILD_NOT_OWNED' });
		await expect(trialService.submit({ actor: parentActor, payload: { courseGroupId: 'course-available', childId: 'child-trial', sessionId: 'session-course-review', requestedDate: '2026-07-20', idempotencyKey: 'foreign-session-key' }, requestId: 'foreign-session' })).rejects.toMatchObject({ code: 'TRIAL_SESSION_NOT_CURRENT' });
		for (const courseGroupId of [
			'course-nachhilfe',
			'course-individual',
			'course-group-nachhilfe',
			'course-needs-review',
		]) {
			await expect(trialService.submit({ actor: parentActor, payload: { courseGroupId, childId: 'child-trial', sessionId: `session-${courseGroupId}`, requestedDate: '2026-07-20', idempotencyKey: `denied-${courseGroupId}` }, requestId: `denied-${courseGroupId}` })).rejects.toMatchObject({ code: 'TRIAL_NOT_ALLOWED_FOR_LESSON_KIND' });
		}

		const before = await new OccupancyRepository(db).activeChildrenCount('course-full', '2026-07-20');
		const full = await trialService.submit({ actor: parentActor, payload: { courseGroupId: 'course-full', childId: 'child-trial', sessionId: 'session-course-full', requestedDate: '2026-07-20', idempotencyKey: 'full-request-key' }, requestId: 'full' });
		expect((await trials.listOwnerTrials(parentActor.id)).find((trial) => trial.id === full.id)?.status).toBe('requested');
		expect(await context.db.prepare(`SELECT COUNT(*) AS count FROM email_outbox
			WHERE source_id = ? AND template_or_category = 'trial.received'`)
			.bind(full.id).first()).toEqual({ count: 1 });
		expect(await new OccupancyRepository(db).activeChildrenCount('course-full', '2026-07-20')).toBe(before);
		await expect(adminMutations.transitionTrial({ actor: adminActor, trialId: full.id, action: 'confirm', sessionId: 'session-course-full', confirmedDate: '2026-07-22', reason: 'Capacity checked', idempotencyKey: 'confirm-full-key', requestId: 'confirm-full', currentDate: '2026-07-17', now })).rejects.toThrow();
		await expect(trialService.submit({ actor: parentActor, payload: { courseGroupId: 'course-full', childId: 'child-trial', sessionId: 'session-course-full', requestedDate: '2026-07-21', idempotencyKey: 'full-duplicate-key' }, requestId: 'duplicate' })).rejects.toMatchObject({ code: 'DUPLICATE_OPEN_TRIAL' });
		await expect(trialService.cancel({ actor: { ...parentActor, id: 'foreign-parent' }, payload: { trialId: full.id, idempotencyKey: 'foreign-cancel-key' }, requestId: 'foreign-cancel' })).rejects.toMatchObject({ code: 'TRIAL_NOT_FOUND' });
		await trialService.cancel({ actor: parentActor, payload: { trialId: full.id, idempotencyKey: 'cancel-full-key' }, requestId: 'cancel-full' });
		await expect(adminMutations.transitionTrial({ actor: adminActor, trialId: full.id, action: 'confirm', sessionId: 'session-course-full', confirmedDate: '2026-07-22', reason: 'Cancelled trial stays terminal', idempotencyKey: 'confirm-cancelled-key', requestId: 'confirm-cancelled', currentDate: '2026-07-17', now })).rejects.toThrow();
		const unknown = await trialService.submit({ actor: parentActor, payload: { courseGroupId: 'course-unknown', childId: 'child-trial', sessionId: 'session-course-unknown', requestedDate: '2026-07-23', idempotencyKey: 'unknown-request-key' }, requestId: 'unknown' });
		expect(await context.db.prepare(`SELECT availability_at_request FROM trial_bookings WHERE id = ?`).bind(unknown.id).first()).toEqual({ availability_at_request: 'unknown' });
		await adminMutations.transitionTrial({ actor: adminActor, trialId: unknown.id, action: 'reject', reason: 'No reliable capacity is available', idempotencyKey: 'reject-unknown-key', requestId: 'reject-unknown', currentDate: '2026-07-17', now });
		expect(await context.db.prepare(`SELECT status, decision_reason FROM trial_bookings WHERE id = ?`).bind(unknown.id).first()).toEqual({ status: 'rejected', decision_reason: 'No reliable capacity is available' });
		expect(await context.db.prepare(`SELECT COUNT(*) AS count FROM email_outbox
			WHERE source_id = ? AND template_or_category = 'trial.rejected'`)
			.bind(unknown.id).first()).toEqual({ count: 1 });
	});

	it('rejects stale parent repository access after the authoritative role becomes admin', async () => {
		const payload = {
			courseGroupId: 'course-available',
			childId: 'child-trial',
			sessionId: 'session-course-available',
			requestedDate: '2026-07-25',
			idempotencyKey: 'stale-role-trial',
		};
		const created = await trialService.submit({
			actor: parentActor,
			payload,
			requestId: 'stale-role-trial-parent',
		});
		await db.run({
			sql: `UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?`,
			params: [now, parentActor.id],
		});
		try {
			expect(await trials.listOwnerTrials(parentActor.id)).toEqual([]);
			await expect(trials.createRequested({
				id: crypto.randomUUID(),
				userId: parentActor.id,
				childId: payload.childId,
				courseGroupId: payload.courseGroupId,
				sessionId: payload.sessionId,
				requestedDate: payload.requestedDate,
				availability: 'available',
				idempotencyKey: payload.idempotencyKey,
				requestId: 'stale-role-trial-admin',
				now,
			})).rejects.toBeDefined();
			expect(await db.first<{ total: number }>({
				sql: `SELECT COUNT(*) AS total FROM trial_bookings
					WHERE user_id = ? AND idempotency_key = ?`,
				params: [parentActor.id, payload.idempotencyKey],
			})).toEqual({ total: 1 });
			expect(created.replayed).toBe(false);
		} finally {
			await db.run({
				sql: `UPDATE users SET role = 'parent', updated_at = ? WHERE id = ?`,
				params: [now, parentActor.id],
			});
		}
	});

	it('serializes submit/confirm, enforces terminal transitions and leaves enrollment/occupancy untouched', async () => {
		const submissions = await Promise.allSettled([
			trialService.submit({ actor: parentActor, payload: { courseGroupId: 'course-review', childId: 'child-trial', sessionId: 'session-course-review', requestedDate: '2026-07-20', idempotencyKey: 'concurrent-submit-a' }, requestId: 'submit-a' }),
			trialService.submit({ actor: parentActor, payload: { courseGroupId: 'course-review', childId: 'child-trial', sessionId: 'session-course-review', requestedDate: '2026-07-20', idempotencyKey: 'concurrent-submit-b' }, requestId: 'submit-b' }),
		]);
		expect(submissions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(submissions.filter((result) => result.status === 'rejected')).toHaveLength(1);
		const trial = (await trials.listOwnerTrials(parentActor.id)).find((item) => item.course_name === 'Gleicher Name')!;
		const confirmations = await Promise.allSettled([
			adminMutations.transitionTrial({ actor: adminActor, trialId: trial.id, action: 'confirm', sessionId: 'session-course-review', confirmedDate: '2026-07-20', reason: 'Date and capacity verified', idempotencyKey: 'confirm-race-a', requestId: 'confirm-race-a', currentDate: '2026-07-17', now }),
			adminMutations.transitionTrial({ actor: adminActor, trialId: trial.id, action: 'confirm', sessionId: 'session-course-review', confirmedDate: '2026-07-20', reason: 'Date and capacity verified', idempotencyKey: 'confirm-race-b', requestId: 'confirm-race-b', currentDate: '2026-07-17', now }),
		]);
		expect(confirmations.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(confirmations.filter((result) => result.status === 'rejected')).toHaveLength(1);
		const confirmationFence = await context.db.prepare(`SELECT
			(SELECT COUNT(*) FROM trial_transition_commits WHERE trial_booking_id = ? AND from_status = 'requested') AS commits,
			(SELECT COUNT(*) FROM admin_action_assertions WHERE target_kind = 'trial_booking' AND target_id = ? AND scope = 'admin:trial-transition') AS assertions`).bind(trial.id, trial.id).first<Record<string, unknown>>();
		expect(confirmationFence).toEqual({ commits: 1, assertions: 1 });

		await adminMutations.transitionTrial({ actor: adminActor, trialId: trial.id, action: 'attended', reason: 'Attendance recorded', idempotencyKey: 'attended-key', requestId: 'attended', currentDate: '2026-07-21', now: '2026-07-21T10:00:00.000Z' });
		await adminMutations.transitionTrial({ actor: adminActor, trialId: trial.id, action: 'convert', reason: 'Ready for stage 09 contract workflow', idempotencyKey: 'converted-key', requestId: 'converted', currentDate: '2026-07-21', now: '2026-07-21T10:01:00.000Z' });
		await expect(adminMutations.transitionTrial({ actor: adminActor, trialId: trial.id, action: 'cancel', reason: 'Terminal transition must fail', idempotencyKey: 'terminal-cancel-key', requestId: 'terminal-cancel', currentDate: '2026-07-21', now: '2026-07-21T10:02:00.000Z' })).rejects.toThrow();
		const state = await context.db.prepare(`SELECT status, confirmed_date FROM trial_bookings WHERE id = ?`).bind(trial.id).first<Record<string, unknown>>();
		expect(state).toEqual({ status: 'converted', confirmed_date: '2026-07-20' });
		await expect(
			context.db
				.prepare(`UPDATE trial_bookings SET confirmed_date = '2026-07-22' WHERE id = ?`)
				.bind(trial.id)
				.run()
		).rejects.toThrow();
		const consequences = await context.db.prepare(`SELECT
			(SELECT COUNT(*) FROM enrollments WHERE child_id = 'child-trial' AND course_group_id = 'course-review') AS enrollments,
			(SELECT COUNT(*) FROM audit_events WHERE target_kind = 'trial_booking' AND target_id = ?) AS audits,
			(SELECT COUNT(*) FROM admin_action_assertions WHERE target_kind = 'trial_booking' AND target_id = ?) AS assertions`).bind(trial.id, trial.id).first<Record<string, unknown>>();
		expect(consequences).toMatchObject({ enrollments: 0, audits: 4, assertions: 3 });
		expect(await new OccupancyRepository(db).activeChildrenCount('course-review', '2026-07-21')).toBe(0);

		const noShow = await trialService.submit({ actor: parentActor, payload: { courseGroupId: 'course-available', childId: 'child-trial', sessionId: 'session-course-available', requestedDate: '2026-07-24', idempotencyKey: 'no-show-request-key' }, requestId: 'no-show-request' });
		await adminMutations.transitionTrial({ actor: adminActor, trialId: noShow.id, action: 'confirm', sessionId: 'session-course-available', confirmedDate: '2026-07-24', reason: 'Date and capacity verified', idempotencyKey: 'no-show-confirm-key', requestId: 'no-show-confirm', currentDate: '2026-07-21', now: '2026-07-21T10:03:00.000Z' });
		await adminMutations.transitionTrial({ actor: adminActor, trialId: noShow.id, action: 'no_show', reason: 'Child did not attend', idempotencyKey: 'no-show-key', requestId: 'no-show', currentDate: '2026-07-24', now: '2026-07-24T18:00:00.000Z' });
		await expect(adminMutations.transitionTrial({ actor: adminActor, trialId: noShow.id, action: 'convert', reason: 'No-show is terminal', idempotencyKey: 'no-show-convert-key', requestId: 'no-show-convert', currentDate: '2026-07-24', now: '2026-07-24T18:01:00.000Z' })).rejects.toThrow();
	});
});

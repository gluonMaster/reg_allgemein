import { hashCanonical } from '$lib/server/import/canonical';
import { DatabaseBoundary } from '$lib/server/db/database';
import type { CatalogAvailability } from '$lib/server/catalog/catalog-service';

export type TrialStatus =
	| 'requested'
	| 'confirmed'
	| 'rejected'
	| 'cancelled'
	| 'attended'
	| 'no_show'
	| 'converted';

export class TrialError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'TrialError';
	}
}

export class TrialRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async listOwnedChildren(userId: string) {
		const rows = await this.db.all<{ id: string; full_name: string; birth_date: string }>({
			sql: `SELECT child.id, child.full_name, child.birth_date
			FROM children AS child JOIN users AS owner ON owner.id = child.owner_user_id
			WHERE owner.id = ? AND child.is_current = 1
				AND child.family_number_id = owner.family_number_id
				AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
				AND owner.account_status = 'active' AND owner.is_blocked = 0
			ORDER BY child.full_name_normalized, child.birth_date, child.id`,
			params: [userId],
		});
		return rows.results;
	}

	async ownsCurrentChild(userId: string, childId: string): Promise<boolean> {
		const row = await this.db.first<{ allowed: number }>({
			sql: `SELECT EXISTS (
				SELECT 1 FROM users AS owner JOIN children AS child
					ON child.owner_user_id = owner.id
					AND child.family_number_id = owner.family_number_id
				WHERE owner.id = ? AND child.id = ? AND child.is_current = 1
					AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
					AND owner.account_status = 'active' AND owner.is_blocked = 0
			) AS allowed`,
			params: [userId, childId],
		});
		return row?.allowed === 1;
	}

	async createRequested(input: {
		id: string;
		userId: string;
		childId: string;
		courseGroupId: string;
		sessionId: string;
		requestedDate: string;
		availability: CatalogAvailability;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}): Promise<{ id: string; replayed: boolean }> {
		const requestHash = await hashCanonical({
			childId: input.childId,
			courseGroupId: input.courseGroupId,
			sessionId: input.sessionId,
			requestedDate: input.requestedDate,
		});
		const prior = await this.db.first<{ id: string; request_hash_sha256: string }>({
			sql: `SELECT id, request_hash_sha256 FROM trial_bookings
				WHERE user_id = ? AND idempotency_key = ?`,
			params: [input.userId, input.idempotencyKey],
		});
		if (prior) {
			if (prior.request_hash_sha256 !== requestHash) throw new TrialError('IDEMPOTENCY_KEY_REUSED');
			return { id: prior.id, replayed: true };
		}

		const auditId = crypto.randomUUID();
		const assertionId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO trial_bookings
						(id, user_id, child_id, course_group_id, session_id, status,
						 requested_date, confirmed_date, availability_at_request,
						 requires_admin_review_at_request, request_hash_sha256,
						 idempotency_key, reviewed_by, reviewed_at, decision_reason,
						 converted_at, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, 'requested', ?, NULL, ?, ?, ?, ?,
						NULL, NULL, NULL, NULL, ?, ?)`,
					params: [
						input.id,
						input.userId,
						input.childId,
						input.courseGroupId,
						input.sessionId,
						input.requestedDate,
						input.availability,
						Number(input.availability !== 'available'),
						requestHash,
						input.idempotencyKey,
						input.now,
						input.now,
					],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'trial.requested', 'trial_booking', id, ?, ?, ?
					FROM trial_bookings WHERE id = ? AND user_id = ? AND status = 'requested'`,
					params: [
						auditId,
						input.userId,
						input.requestId,
						JSON.stringify({
							status: 'requested',
							availability: input.availability,
							requiresAdminReview: input.availability !== 'available',
						}),
						input.now,
						input.id,
						input.userId,
					],
				},
				{
					sql: `INSERT INTO trial_action_assertions
						(id, trial_booking_id, action, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, ?, 'requested', ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM trial_bookings
							WHERE id = ? AND user_id = ? AND status = 'requested')
						AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						assertionId,
						input.id,
						input.userId,
						auditId,
						input.id,
						input.userId,
						auditId,
						input.now,
					],
				},
			]);
			return { id: input.id, replayed: false };
		} catch (error) {
			const replay = await this.db.first<{ id: string; request_hash_sha256: string }>({
				sql: `SELECT id, request_hash_sha256 FROM trial_bookings
					WHERE user_id = ? AND idempotency_key = ?`,
				params: [input.userId, input.idempotencyKey],
			});
			if (replay?.request_hash_sha256 === requestHash) return { id: replay.id, replayed: true };
			const duplicate = await this.db.first<{ id: string }>({
				sql: `SELECT id FROM trial_bookings WHERE child_id = ? AND course_group_id = ?
					AND status IN ('requested', 'confirmed', 'attended')`,
				params: [input.childId, input.courseGroupId],
			});
			if (duplicate) throw new TrialError('DUPLICATE_OPEN_TRIAL');
			throw error;
		}
	}

	async cancelByParent(input: {
		trialId: string;
		userId: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}): Promise<{ id: string; replayed: boolean }> {
		const requestHash = await hashCanonical({ trialId: input.trialId, action: 'cancel' });
		const prior = await this.db.first<{ id: string; request_hash_sha256: string }>({
			sql: `SELECT id, request_hash_sha256 FROM trial_parent_actions
				WHERE user_id = ? AND idempotency_key = ?`,
			params: [input.userId, input.idempotencyKey],
		});
		if (prior) {
			if (prior.request_hash_sha256 !== requestHash) throw new TrialError('IDEMPOTENCY_KEY_REUSED');
			return { id: input.trialId, replayed: true };
		}
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const assertionId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO trial_parent_actions
						(id, trial_booking_id, user_id, action, idempotency_key,
						 request_hash_sha256, created_at)
					SELECT ?, trial.id, ?, 'cancel', ?, ?, ?
					FROM trial_bookings AS trial JOIN users AS owner ON owner.id = trial.user_id
					WHERE trial.id = ? AND trial.user_id = ?
						AND trial.status IN ('requested', 'confirmed')
						AND owner.account_status = 'active' AND owner.is_blocked = 0`,
					params: [
						actionId,
						input.userId,
						input.idempotencyKey,
						requestHash,
						input.now,
						input.trialId,
						input.userId,
					],
				},
				{
					sql: `UPDATE trial_bookings SET status = 'cancelled',
						decision_reason = 'parent_cancelled', updated_at = ?
					WHERE id = ? AND user_id = ? AND status IN ('requested', 'confirmed')
						AND EXISTS (SELECT 1 FROM trial_parent_actions WHERE id = ?)`,
					params: [input.now, input.trialId, input.userId, actionId],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'trial.cancelled_by_parent', 'trial_booking', id,
						?, '{"status":"cancelled"}', ? FROM trial_bookings
					WHERE id = ? AND user_id = ? AND status = 'cancelled'
						AND EXISTS (SELECT 1 FROM trial_parent_actions WHERE id = ?)`,
					params: [
						auditId,
						input.userId,
						input.requestId,
						input.now,
						input.trialId,
						input.userId,
						actionId,
					],
				},
				{
					sql: `INSERT INTO trial_action_assertions
						(id, trial_booking_id, action, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, ?, 'cancelled_by_parent', ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM trial_parent_actions WHERE id = ?)
						AND EXISTS (SELECT 1 FROM trial_bookings
							WHERE id = ? AND user_id = ? AND status = 'cancelled')
						AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						assertionId,
						input.trialId,
						input.userId,
						auditId,
						actionId,
						input.trialId,
						input.userId,
						auditId,
						input.now,
					],
				},
			]);
			return { id: input.trialId, replayed: false };
		} catch (error) {
			const replay = await this.db.first<{ request_hash_sha256: string }>({
				sql: `SELECT request_hash_sha256 FROM trial_parent_actions
					WHERE user_id = ? AND idempotency_key = ?`,
				params: [input.userId, input.idempotencyKey],
			});
			if (replay?.request_hash_sha256 === requestHash) return { id: input.trialId, replayed: true };
			throw new TrialError('TRIAL_CANCELLATION_REJECTED');
		}
	}

	async listOwnerTrials(userId: string) {
		const rows = await this.db.all<{
			id: string;
			status: TrialStatus;
			requested_date: string;
			confirmed_date: string | null;
			course_name: string;
			child_name: string;
		}>({
			sql: `SELECT trial.id, trial.status, trial.requested_date, trial.confirmed_date,
				course.display_name AS course_name, child.full_name AS child_name
			FROM trial_bookings AS trial
			JOIN children AS child ON child.id = trial.child_id AND child.owner_user_id = trial.user_id
			JOIN course_groups AS course ON course.id = trial.course_group_id
			WHERE trial.user_id = ?
			ORDER BY trial.created_at DESC, trial.id DESC LIMIT 100`,
			params: [userId],
		});
		return rows.results;
	}

	async listAdminTrials(input: { q: string; status: string }) {
		const q = input.q.toLocaleLowerCase('de-DE');
		const rows = await this.db.all<{
			id: string;
			status: TrialStatus;
			requested_date: string;
			confirmed_date: string | null;
			availability_at_request: CatalogAvailability;
			requires_admin_review_at_request: 0 | 1;
			course_group_id: string;
			session_id: string;
			course_name: string;
			child_name: string;
			day_code: string;
			start_time: string;
			location_display: string;
		}>({
			sql: `SELECT trial.id, trial.status, trial.requested_date, trial.confirmed_date,
				trial.availability_at_request, trial.requires_admin_review_at_request,
				trial.course_group_id, trial.session_id, course.display_name AS course_name,
				child.full_name AS child_name, session.day_code, session.start_time,
				session.location_display
			FROM trial_bookings AS trial
			JOIN children AS child ON child.id = trial.child_id
			JOIN course_groups AS course ON course.id = trial.course_group_id
			JOIN course_sessions AS session ON session.id = trial.session_id
			WHERE (? = '' OR trial.status = ?)
				AND (? = '' OR lower(course.display_name) LIKE ?
					OR lower(child.full_name) LIKE ? OR trial.id = ?)
			ORDER BY CASE trial.status WHEN 'requested' THEN 1 WHEN 'confirmed' THEN 2
				WHEN 'attended' THEN 3 ELSE 4 END, trial.created_at, trial.id
			LIMIT 100`,
			params: [input.status, input.status, q, `%${q}%`, `%${q}%`, input.q],
		});
		return rows.results;
	}

	async listAdminSessionOptions() {
		const rows = await this.db.all<{
			id: string;
			course_group_id: string;
			day_code: string;
			start_time: string;
			end_time: string;
			location_display: string;
		}>({
			sql: `SELECT session.id, session.course_group_id, session.day_code,
				session.start_time, session.end_time, session.location_display
			FROM course_sessions AS session
			JOIN schedule_versions AS schedule ON schedule.id = session.schedule_version_id
			JOIN academic_periods AS period ON period.id = schedule.academic_period_id
			WHERE session.is_current = 1 AND schedule.is_published = 1 AND period.is_current = 1
			ORDER BY session.course_group_id, session.day_code, session.start_time, session.id`,
		});
		return rows.results;
	}
}

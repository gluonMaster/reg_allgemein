import type { AdminActor } from '$lib/server/security/authorization';
import { DatabaseBoundary } from '$lib/server/db/database';

export class ChildCorrectionAdminRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async approve(input: {
		actor: AdminActor;
		correctionId: string;
		reason: string;
		requestId: string;
		now: string;
	}): Promise<boolean> {
		if (!input.reason.trim()) return false;
		const auditId = crypto.randomUUID();
		await this.db.batch([
			{
				sql: `UPDATE children SET
						full_name_override = (SELECT requested_full_name
							FROM child_correction_requests WHERE id = ? AND status = 'pending'),
						birth_date_override = (SELECT requested_birth_date
							FROM child_correction_requests WHERE id = ? AND status = 'pending'),
						full_name = (SELECT requested_full_name
							FROM child_correction_requests WHERE id = ? AND status = 'pending'),
						full_name_normalized = (SELECT requested_full_name_normalized
							FROM child_correction_requests WHERE id = ? AND status = 'pending'),
						birth_date = (SELECT requested_birth_date
							FROM child_correction_requests WHERE id = ? AND status = 'pending'),
						updated_at = ?
					WHERE id = (SELECT child_id FROM child_correction_requests
						WHERE id = ? AND status = 'pending')
						AND origin = 'legacy'
						AND EXISTS (SELECT 1 FROM users AS admin
							WHERE admin.id = ? AND admin.role = 'admin' AND admin.is_blocked = 0
								AND admin.account_status = 'active')`,
				params: [
					input.correctionId,
					input.correctionId,
					input.correctionId,
					input.correctionId,
					input.correctionId,
					input.now,
					input.correctionId,
					input.actor.id,
				],
			},
			{
				sql: `UPDATE child_correction_requests SET status = 'approved', reviewed_by = ?,
						reviewed_at = ?, decision_reason = ?, updated_at = ?
					WHERE id = ? AND status = 'pending'
						AND EXISTS (SELECT 1 FROM children WHERE id = child_correction_requests.child_id
							AND full_name_override = child_correction_requests.requested_full_name
							AND birth_date_override = child_correction_requests.requested_birth_date)`,
				params: [
					input.actor.id,
					input.now,
					input.reason.trim(),
					input.now,
					input.correctionId,
				],
			},
			{
				sql: `UPDATE admin_review_tasks SET status = 'resolved', assigned_to = ?,
						resolution = 'approved', updated_at = ?, resolved_at = ?
					WHERE source_kind = 'child_correction' AND source_id = ?
						AND status IN ('open', 'in_progress')
						AND EXISTS (SELECT 1 FROM child_correction_requests
							WHERE id = ? AND status = 'approved')`,
				params: [
					input.actor.id,
					input.now,
					input.now,
					input.correctionId,
					input.correctionId,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'child.legacy_correction_approved',
						'child_correction', id, ?, '{"status":"approved","override":true}', ?
					FROM child_correction_requests WHERE id = ? AND status = 'approved'`,
				params: [auditId, input.actor.id, input.requestId, input.now, input.correctionId],
			},
			{
				sql: `INSERT INTO family_transaction_assertions
					(id, operation_kind, operation_id, user_id, assertion_passed, created_at)
				 VALUES (?, 'admin_correction', ?, ?,
					CASE WHEN EXISTS (
						SELECT 1 FROM child_correction_requests AS correction
						JOIN children AS child ON child.id = correction.child_id
						WHERE correction.id = ? AND correction.status = 'approved'
							AND correction.reviewed_by = ?
							AND child.full_name_override = correction.requested_full_name
							AND child.birth_date_override = correction.requested_birth_date
					) THEN 1 ELSE 0 END, ?)`,
				params: [
					crypto.randomUUID(),
					input.correctionId,
					input.actor.id,
					input.correctionId,
					input.actor.id,
					input.now,
				],
			},
		]);
		return true;
	}
}

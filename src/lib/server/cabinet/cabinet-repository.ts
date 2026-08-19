import { DatabaseBoundary } from '$lib/server/db/database';
import { normalizePersonName } from '$lib/server/auth/normalization';
import type { CabinetPaymentArrangement } from '$lib/server/pricing/cabinet-pricing';

export interface CabinetProfileRow {
	id: string;
	email: string;
	first_name: string;
	last_name: string;
	family_number_id: string;
	family_display_id: string;
	family_assignment_status: 'assigned' | 'review_required';
	family_version: number;
	family_assignment_import_run_id: string;
}

export interface CabinetChildRow {
	id: string;
	full_name: string;
	birth_date: string;
	origin: 'portal' | 'legacy';
	pending_correction: 0 | 1;
}

export interface CabinetActivityRow {
	id: string;
	child_name: string;
	group_name: string;
	teacher_name: string | null;
	day_display: string | null;
	duration_minutes: number | null;
	lesson_kind: 'group' | 'dance_group' | 'nachhilfe' | 'individual' | 'needs_review';
	is_active: 0 | 1;
	base_price_cents: number | null;
	price_confirmed: 0 | 1;
	payment_arrangement: CabinetPaymentArrangement;
	origin: 'legacy' | 'portal';
}

export interface CabinetClaimOfferRow {
	masked_email_snapshot: string;
	status: 'candidate' | 'proof_sent';
}

export class CabinetRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	loadProfile(userId: string): Promise<CabinetProfileRow | null> {
		return this.db.first<CabinetProfileRow>({
			sql: `SELECT user.id, user.email, user.first_name, user.last_name,
				user.family_number_id, family.display_family_id AS family_display_id,
				user.family_assignment_status, user.family_version,
				user.family_assignment_import_run_id
				FROM users AS user
				JOIN family_number_allocations AS family ON family.id = user.family_number_id
				WHERE user.id = ? AND user.role = 'parent' AND user.email_verified_at IS NOT NULL
					AND user.account_status = 'active' AND user.is_blocked = 0
					AND family.owner_user_id = user.id AND family.status = 'assigned'`,
			params: [userId],
		});
	}

	async listChildren(userId: string): Promise<CabinetChildRow[]> {
		const rows = await this.db.all<CabinetChildRow>({
			sql: `SELECT child.id, child.full_name, child.birth_date, child.origin,
				EXISTS (SELECT 1 FROM child_correction_requests AS correction
					WHERE correction.child_id = child.id AND correction.status = 'pending')
					AS pending_correction
				FROM children AS child
				WHERE child.owner_user_id = ? AND child.is_current = 1
				ORDER BY child.full_name_normalized, child.birth_date, child.id`,
			params: [userId],
		});
		return rows.results;
	}

	loadClaimOffer(userId: string): Promise<CabinetClaimOfferRow | null> {
		return this.db.first<CabinetClaimOfferRow>({
			sql: `SELECT attempt.masked_email_snapshot, attempt.status
				FROM family_link_attempts AS attempt
				JOIN users AS user ON user.id = attempt.user_id
				WHERE attempt.user_id = ? AND attempt.status IN ('candidate', 'proof_sent')
					AND user.family_number_id = attempt.from_family_number_id
					AND user.family_version = attempt.family_version`,
			params: [userId],
		});
	}

	async listActivities(userId: string, asOf: string): Promise<CabinetActivityRow[]> {
		const legacy = await this.db.all<CabinetActivityRow>({
			sql: `SELECT legacy.id, child.full_name AS child_name,
				legacy.group_name_raw AS group_name, legacy.teacher_name,
				legacy.day_raw AS day_display, legacy.duration_minutes,
				COALESCE(legacy.lesson_kind, 'needs_review') AS lesson_kind,
				legacy.is_active_for_occupancy AS is_active,
				legacy.planned_price_cents AS base_price_cents,
				CASE WHEN legacy.planned_price_cents IS NOT NULL
					AND legacy.needs_admin_review = 0 THEN 1 ELSE 0 END AS price_confirmed,
				CASE WHEN legacy.lesson_kind = 'nachhilfe' THEN 'not_applicable'
					ELSE legacy.payment_arrangement END AS payment_arrangement,
				'legacy' AS origin
				FROM legacy_enrollments AS legacy
				JOIN children AS child ON child.id = legacy.child_id
				WHERE child.owner_user_id = ? AND child.is_current = 1
					AND legacy.is_current = 1 AND legacy.is_active_for_occupancy = 1
					AND NOT EXISTS (
						SELECT 1
						FROM legacy_reconciliation_strict_typed_resolutions AS duplicate_resolution
						WHERE duplicate_resolution.action = 'same_service_duplicate'
							AND duplicate_resolution.peer_enrollment_id = legacy.id
					)
					AND NOT EXISTS (
						SELECT 1 FROM enrollments AS represented
						WHERE represented.id = legacy.represented_by_enrollment_id
							AND represented.status = 'active'
							AND represented.active_from <= ?
							AND (represented.active_until IS NULL OR ? < represented.active_until)
					)
				ORDER BY child.full_name_normalized, legacy.group_name_normalized, legacy.id`,
			params: [userId, asOf, asOf],
		});
		const portal = await this.db.all<CabinetActivityRow>({
			sql: `SELECT enrollment.id, child.full_name AS child_name,
				course.display_name AS group_name, NULL AS teacher_name,
				NULL AS day_display, NULL AS duration_minutes, enrollment.lesson_kind,
				CASE WHEN enrollment.status = 'active' AND enrollment.active_from <= ?
					AND (enrollment.active_until IS NULL OR ? < enrollment.active_until)
					THEN 1 ELSE 0 END AS is_active,
				enrollment.current_price_cents AS base_price_cents,
				CASE WHEN enrollment.current_price_cents IS NOT NULL
					AND enrollment.price_source IS NOT NULL AND enrollment.price_mode IS NOT NULL
					THEN 1 ELSE 0 END AS price_confirmed,
				enrollment.payment_arrangement, 'portal' AS origin
				FROM enrollments AS enrollment
				JOIN children AS child ON child.id = enrollment.child_id
				JOIN course_groups AS course ON course.id = enrollment.course_group_id
				WHERE enrollment.user_id = ? AND child.owner_user_id = ?
					AND enrollment.status IN ('active', 'contract_offered')
				ORDER BY child.full_name_normalized, course.display_name, enrollment.id`,
			params: [asOf, asOf, userId, userId],
		});
		return [...legacy.results, ...portal.results];
	}

	async hasOwnedDuplicate(input: {
		userId: string;
		fullNameNormalized: string;
		birthDate: string;
		excludeChildId?: string;
	}): Promise<boolean> {
		const row = await this.db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM children AS child
				JOIN users AS owner ON owner.id = child.owner_user_id
				WHERE owner.id = ? AND owner.role = 'parent'
					AND owner.email_verified_at IS NOT NULL
					AND owner.account_status = 'active' AND owner.is_blocked = 0
					AND child.is_current = 1 AND child.full_name_normalized = ?
					AND child.birth_date = ? AND (? IS NULL OR child.id <> ?)`,
			params: [
				input.userId,
				input.fullNameNormalized,
				input.birthDate,
				input.excludeChildId ?? null,
				input.excludeChildId ?? null,
			],
		});
		return (row?.count ?? 0) > 0;
	}

	async createPortalChild(input: {
		id: string;
		userId: string;
		fullName: string;
		birthDate: string;
		requestId: string;
		auditId: string;
		now: string;
	}): Promise<boolean> {
		const fullNameNormalized = normalizePersonName(input.fullName);
		const result = await this.db.batch([
			{
				sql: `INSERT INTO children
					(id, owner_user_id, legacy_family_id, family_number_id, origin,
					 source_child_key, source_full_name, source_full_name_normalized,
					 source_birth_date, full_name_override, birth_date_override,
					 full_name, full_name_normalized, birth_date, last_seen_run_id,
					 is_current, created_at, updated_at)
					SELECT ?, user.id, NULL, user.family_number_id, 'portal', ?, ?, ?, ?,
						NULL, NULL, ?, ?, ?, user.family_assignment_import_run_id, 1, ?, ?
					FROM users AS user
					JOIN family_number_allocations AS family ON family.id = user.family_number_id
					WHERE user.id = ? AND user.role = 'parent' AND user.email_verified_at IS NOT NULL
						AND user.account_status = 'active' AND user.is_blocked = 0
						AND user.family_assignment_status IN ('assigned', 'review_required')
						AND user.family_assignment_import_run_id IS NOT NULL
						AND family.owner_user_id = user.id AND family.status = 'assigned'`,
				params: [
					input.id,
					`portal:${input.id}`,
					input.fullName,
					fullNameNormalized,
					input.birthDate,
					input.fullName,
					fullNameNormalized,
					input.birthDate,
					input.now,
					input.now,
					input.userId,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'child.portal_created', 'child', id, ?,
						'{"origin":"portal"}', ? FROM children WHERE id = ?`,
				params: [input.auditId, input.userId, input.requestId, input.now, input.id],
			},
		]);
		return result[0]?.meta.changes === 1;
	}

	async updatePortalChild(input: {
		childId: string;
		userId: string;
		fullName: string;
		birthDate: string;
		requestId: string;
		auditId: string;
		now: string;
	}): Promise<boolean> {
		const fullNameNormalized = normalizePersonName(input.fullName);
		const result = await this.db.batch([
			{
					sql: `UPDATE children SET source_full_name = ?, source_full_name_normalized = ?,
						source_birth_date = ?, full_name = ?, full_name_normalized = ?,
						birth_date = ?, updated_at = ?
					WHERE id = ? AND owner_user_id = ? AND origin = 'portal' AND is_current = 1
						AND family_number_id = (SELECT family_number_id FROM users
							WHERE id = ? AND role = 'parent' AND email_verified_at IS NOT NULL
								AND account_status = 'active' AND is_blocked = 0)`,
				params: [
					input.fullName,
					fullNameNormalized,
					input.birthDate,
					input.fullName,
					fullNameNormalized,
					input.birthDate,
					input.now,
					input.childId,
					input.userId,
					input.userId,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'child.portal_updated', 'child', id, ?,
						'{"profile_fields_changed":true}', ? FROM children
					WHERE id = ? AND owner_user_id = ? AND origin = 'portal'`,
				params: [
					input.auditId,
					input.userId,
					input.requestId,
					input.now,
					input.childId,
					input.userId,
				],
			},
		]);
		return result[0]?.meta.changes === 1;
	}

	async requestLegacyChildCorrection(input: {
		id: string;
		childId: string;
		userId: string;
		fullName: string;
		birthDate: string;
		requestId: string;
		auditId: string;
		reviewId: string;
		now: string;
	}): Promise<boolean> {
		const normalized = normalizePersonName(input.fullName);
		const result = await this.db.batch([
			{
				sql: `INSERT INTO child_correction_requests
					(id, child_id, requested_by, requested_full_name,
					 requested_full_name_normalized, requested_birth_date, status,
					 reviewed_by, reviewed_at, decision_reason, created_at, updated_at)
					SELECT ?, child.id, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?
					FROM children AS child WHERE child.id = ? AND child.owner_user_id = ?
						AND child.origin = 'legacy' AND child.is_current = 1
						AND child.family_number_id = (SELECT family_number_id FROM users
							WHERE id = ? AND role = 'parent' AND email_verified_at IS NOT NULL
								AND account_status = 'active' AND is_blocked = 0)`,
				params: [
					input.id,
					input.userId,
					input.fullName,
					normalized,
					input.birthDate,
					input.now,
					input.now,
					input.childId,
					input.userId,
					input.userId,
				],
			},
			{
				sql: `INSERT INTO admin_review_tasks
					(id, kind, source_kind, source_id, reason_code, safe_summary,
					 status, assigned_to, resolution, created_at, updated_at, resolved_at)
					SELECT ?, 'family_correction', 'child_correction', id,
						'legacy_child_correction_requested', 'Legacy child correction requires review.',
						'open', NULL, NULL, ?, ?, NULL
					FROM child_correction_requests WHERE id = ?`,
				params: [input.reviewId, input.now, input.now, input.id],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'child.legacy_correction_requested',
						'child_correction', id, ?, '{"status":"pending"}', ?
					FROM child_correction_requests WHERE id = ?`,
				params: [input.auditId, input.userId, input.requestId, input.now, input.id],
			},
		]);
		return result[0]?.meta.changes === 1;
	}
}

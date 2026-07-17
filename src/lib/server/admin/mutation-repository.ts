import { hashCanonical, normalizeLookupText } from '$lib/server/import/canonical';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import type { AdminActor } from '$lib/server/security/authorization';
import { AdminConsoleError } from './errors';

interface MutationContext {
	recordId: string;
	keyHash: string;
	requestHash: string;
	resultRef: string;
	replayed: boolean;
}

interface ExecuteMutationInput {
	actor: AdminActor;
	scope: string;
	idempotencyKey: string;
	payload: Record<string, unknown>;
	resultRef: string;
	requestId: string;
	targetKind: string;
	targetId: string;
	action: string;
	safeDiff: Record<string, unknown>;
	now: string;
	statements: (context: MutationContext) => readonly StatementSpec[];
	assertionSql: string;
	assertionParams: readonly unknown[];
}

const ACTIVE_ADMIN_SQL = `EXISTS (
	SELECT 1 FROM users admin
	WHERE admin.id = ? AND admin.role = 'admin'
		AND admin.account_status = 'active' AND admin.is_blocked = 0
)`;

function futureExpiry(now: string): string {
	return new Date(new Date(now).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

export class AdminMutationRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	private async mutationContext(input: ExecuteMutationInput): Promise<MutationContext> {
		const keyHash = await hashCanonical({ key: input.idempotencyKey.trim() });
		const requestHash = await hashCanonical(input.payload);
		const prior = await this.db.first<{
			id: string;
			request_hash: string;
			result_ref: string | null;
			status: string;
		}>({
			sql: `SELECT id, request_hash, result_ref, status FROM idempotency_records
				WHERE scope = ? AND key_hash = ?`,
			params: [input.scope, keyHash],
		});
		if (prior) {
			if (prior.request_hash !== requestHash) {
				throw new AdminConsoleError('IDEMPOTENCY_KEY_REUSED');
			}
			if (prior.status !== 'completed' || prior.result_ref !== input.resultRef) {
				throw new AdminConsoleError('IDEMPOTENCY_IN_PROGRESS');
			}
			return {
				recordId: prior.id,
				keyHash,
				requestHash,
				resultRef: prior.result_ref,
				replayed: true,
			};
		}
		return {
			recordId: crypto.randomUUID(),
			keyHash,
			requestHash,
			resultRef: input.resultRef,
			replayed: false,
		};
	}

	private async execute(
		input: ExecuteMutationInput
	): Promise<{ resultRef: string; replayed: boolean }> {
		const context = await this.mutationContext(input);
		if (context.replayed) return { resultRef: context.resultRef, replayed: true };

		const auditId = crypto.randomUUID();
		const assertionId = crypto.randomUUID();
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO idempotency_records
					(id, scope, key_hash, request_hash, result_ref, status,
					 expires_at, created_at, updated_at)
					VALUES (?, ?, ?, ?, NULL, 'in_progress', ?, ?, ?)`,
				params: [
					context.recordId,
					input.scope,
					context.keyHash,
					context.requestHash,
					futureExpiry(input.now),
					input.now,
					input.now,
				],
			},
			...input.statements(context),
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', ?, ?, ?, ?, ?, ?
					WHERE ${ACTIVE_ADMIN_SQL} AND (${input.assertionSql})`,
				params: [
					auditId,
					input.actor.id,
					input.action,
					input.targetKind,
					input.targetId,
					input.requestId,
					JSON.stringify(input.safeDiff),
					input.now,
					input.actor.id,
					...input.assertionParams,
				],
			},
			{
				sql: `INSERT INTO admin_action_assertions
					(id, scope, idempotency_record_id, actor_user_id, target_kind,
					 target_id, assertion_passed, created_at)
					VALUES (?, ?, ?, ?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
						AND ${ACTIVE_ADMIN_SQL}
						AND (${input.assertionSql})
					THEN 1 ELSE 0 END, ?)`,
				params: [
					assertionId,
					input.scope,
					context.recordId,
					input.actor.id,
					input.targetKind,
					input.targetId,
					auditId,
					input.actor.id,
					...input.assertionParams,
					input.now,
				],
			},
			{
				sql: `UPDATE idempotency_records SET status = 'completed', result_ref = ?,
						updated_at = ? WHERE id = ? AND status = 'in_progress'
						AND EXISTS (SELECT 1 FROM admin_action_assertions
							WHERE idempotency_record_id = ?)`,
				params: [context.resultRef, input.now, context.recordId, context.recordId],
			},
		];

		try {
			await this.db.batch(statements);
		} catch (error) {
			const replay = await this.mutationContext(input).catch(() => null);
			if (replay?.replayed) return { resultRef: replay.resultRef, replayed: true };
			throw error;
		}
		return { resultRef: context.resultRef, replayed: false };
	}

	async setBlocked(input: {
		actor: AdminActor;
		userId: string;
		blocked: boolean;
		reason: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		if (input.actor.id === input.userId && input.blocked) {
			throw new AdminConsoleError('ADMIN_SELF_BLOCK_REJECTED');
		}
		const blocked = Number(input.blocked);
		return this.execute({
			actor: input.actor,
			scope: 'admin:user-block',
			idempotencyKey: input.idempotencyKey,
			payload: { userId: input.userId, blocked, reason: input.reason.trim() },
			resultRef: `user:${input.userId}:blocked:${blocked}`,
			requestId: input.requestId,
			targetKind: 'user',
			targetId: input.userId,
			action: input.blocked ? 'auth.user_blocked' : 'auth.user_unblocked',
			safeDiff: { blocked: input.blocked, sessionsRevoked: input.blocked },
			now: input.now,
			statements: () => [
				{
					sql: `UPDATE users SET is_blocked = ?,
						session_version = session_version + CASE WHEN is_blocked <> ? THEN 1 ELSE 0 END,
						updated_at = CASE WHEN is_blocked <> ? THEN ? ELSE updated_at END
					WHERE id = ? AND account_status = 'active' AND ${ACTIVE_ADMIN_SQL}`,
					params: [blocked, blocked, blocked, input.now, input.userId, input.actor.id],
				},
				{
					sql: `UPDATE auth_sessions SET revoked_at = ?, revocation_reason = 'user_blocked'
					WHERE user_id = ? AND revoked_at IS NULL AND ? = 1
						AND EXISTS (SELECT 1 FROM users WHERE id = ? AND is_blocked = 1)
						AND ${ACTIVE_ADMIN_SQL}`,
					params: [input.now, input.userId, blocked, input.userId, input.actor.id],
				},
			],
			assertionSql: `EXISTS (SELECT 1 FROM users
				WHERE id = ? AND is_blocked = ? AND account_status = 'active')
				AND (? = 0 OR NOT EXISTS (SELECT 1 FROM auth_sessions
					WHERE user_id = ? AND revoked_at IS NULL))`,
			assertionParams: [input.userId, blocked, blocked, input.userId],
		});
	}

	async decideImportIssue(input: {
		actor: AdminActor;
		issueId: string;
		decision: 'resolve' | 'dismiss';
		reason: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		const status = input.decision === 'resolve' ? 'resolved' : 'dismissed';
		return this.execute({
			actor: input.actor,
			scope: 'admin:import-issue-decision',
			idempotencyKey: input.idempotencyKey,
			payload: {
				issueId: input.issueId,
				decision: input.decision,
				reason: input.reason.trim(),
			},
			resultRef: `import_issue:${input.issueId}:${status}`,
			requestId: input.requestId,
			targetKind: 'import_issue',
			targetId: input.issueId,
			action: `import.issue.${status}`,
			safeDiff: { status },
			now: input.now,
			statements: () => [
				{
					sql: `UPDATE import_issues SET status = ?, resolved_at = ?, resolved_by = ?
					WHERE id = ? AND status = 'open' AND ${ACTIVE_ADMIN_SQL}`,
					params: [status, input.now, input.actor.id, input.issueId, input.actor.id],
				},
			],
			assertionSql: `EXISTS (SELECT 1 FROM import_issues
				WHERE id = ? AND status = ? AND resolved_by = ?)`,
			assertionParams: [input.issueId, status, input.actor.id],
		});
	}

	async decideChildCorrection(input: {
		actor: AdminActor;
		taskId: string;
		correctionId: string;
		decision: 'approve' | 'reject';
		reason: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		const approved = input.decision === 'approve';
		const status = approved ? 'approved' : 'rejected';
		return this.execute({
			actor: input.actor,
			scope: 'admin:child-correction-decision',
			idempotencyKey: input.idempotencyKey,
			payload: {
				taskId: input.taskId,
				correctionId: input.correctionId,
				decision: input.decision,
				reason: input.reason.trim(),
			},
			resultRef: `child_correction:${input.correctionId}:${status}`,
			requestId: input.requestId,
			targetKind: 'child_correction',
			targetId: input.correctionId,
			action: `child.legacy_correction_${status}`,
			safeDiff: { status, override: approved },
			now: input.now,
			statements: () => [
				...(approved
					? [
							{
								sql: `UPDATE children SET
								full_name_override = correction.requested_full_name,
								birth_date_override = correction.requested_birth_date,
								full_name = correction.requested_full_name,
								full_name_normalized = correction.requested_full_name_normalized,
								birth_date = correction.requested_birth_date, updated_at = ?
							FROM child_correction_requests correction
							WHERE children.id = correction.child_id AND correction.id = ?
								AND correction.status = 'pending' AND children.origin = 'legacy'
								AND ${ACTIVE_ADMIN_SQL}`,
								params: [input.now, input.correctionId, input.actor.id],
							} satisfies StatementSpec,
						]
					: []),
				{
					sql: `UPDATE child_correction_requests SET status = ?, reviewed_by = ?,
						reviewed_at = ?, decision_reason = ?, updated_at = ?
					WHERE id = ? AND status = 'pending' AND ${ACTIVE_ADMIN_SQL}
						AND (? = 0 OR EXISTS (SELECT 1 FROM children child
							WHERE child.id = child_correction_requests.child_id
								AND child.full_name_override = child_correction_requests.requested_full_name
								AND child.birth_date_override = child_correction_requests.requested_birth_date))`,
					params: [
						status,
						input.actor.id,
						input.now,
						input.reason.trim(),
						input.now,
						input.correctionId,
						input.actor.id,
						Number(approved),
					],
				},
				{
					sql: `UPDATE admin_review_tasks SET status = 'resolved', assigned_to = ?,
						resolution = ?, updated_at = ?, resolved_at = ?
					WHERE id = ? AND kind = 'family_correction'
						AND source_kind = 'child_correction' AND source_id = ?
						AND status IN ('open', 'in_progress')
						AND EXISTS (SELECT 1 FROM child_correction_requests
							WHERE id = ? AND status = ?)`,
					params: [
						input.actor.id,
						JSON.stringify({ decision: input.decision, reason: input.reason.trim() }),
						input.now,
						input.now,
						input.taskId,
						input.correctionId,
						input.correctionId,
						status,
					],
				},
			],
			assertionSql: `EXISTS (SELECT 1 FROM child_correction_requests correction
				JOIN admin_review_tasks task ON task.id = ?
				WHERE correction.id = ? AND correction.status = ?
					AND correction.reviewed_by = ? AND task.status = 'resolved'
					AND task.source_kind = 'child_correction' AND task.source_id = correction.id)`,
			assertionParams: [input.taskId, input.correctionId, status, input.actor.id],
		});
	}

	async dismissReview(input: {
		actor: AdminActor;
		taskId: string;
		decision: 'dismiss_name_match' | 'dismiss_claim_conflict';
		reason: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		const requiredKind =
			input.decision === 'dismiss_name_match' ? 'family_name_match' : 'family_claim_conflict';
		return this.execute({
			actor: input.actor,
			scope: 'admin:review-dismissal',
			idempotencyKey: input.idempotencyKey,
			payload: {
				taskId: input.taskId,
				decision: input.decision,
				reason: input.reason.trim(),
			},
			resultRef: `review:${input.taskId}:dismissed`,
			requestId: input.requestId,
			targetKind: 'admin_review_task',
			targetId: input.taskId,
			action: `review.${requiredKind}.dismissed`,
			safeDiff: { status: 'dismissed', decision: input.decision },
			now: input.now,
			statements: () => [
				{
					sql: `UPDATE admin_review_tasks SET status = 'dismissed', assigned_to = ?,
						resolution = ?, updated_at = ?, resolved_at = ?
					WHERE id = ? AND kind = ? AND status IN ('open', 'in_progress')
						AND ${ACTIVE_ADMIN_SQL}`,
					params: [
						input.actor.id,
						JSON.stringify({ decision: input.decision, reason: input.reason.trim() }),
						input.now,
						input.now,
						input.taskId,
						requiredKind,
						input.actor.id,
					],
				},
			],
			assertionSql: `EXISTS (SELECT 1 FROM admin_review_tasks
				WHERE id = ? AND kind = ? AND status = 'dismissed' AND assigned_to = ?)`,
			assertionParams: [input.taskId, requiredKind, input.actor.id],
		});
	}

	async decideCourseMapping(input: {
		actor: AdminActor;
		taskId?: string;
		legacyEnrollmentId: string;
		courseGroupId: string;
		decision: 'confirm' | 'reject';
		reason: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		const legacy = await this.db.first<{
			academic_period_id: string;
			group_name_normalized: string;
		}>({
			sql: `SELECT academic_period_id, group_name_normalized FROM legacy_enrollments
				WHERE id = ? AND is_current = 1`,
			params: [input.legacyEnrollmentId],
		});
		if (!legacy) throw new AdminConsoleError('LEGACY_ENROLLMENT_NOT_FOUND');
		const course = await this.db.first<{ academic_period_id: string; lesson_kind: string }>({
			sql: `SELECT academic_period_id, lesson_kind FROM course_groups WHERE id = ?`,
			params: [input.courseGroupId],
		});
		if (!course || course.academic_period_id !== legacy.academic_period_id) {
			throw new AdminConsoleError('COURSE_MAPPING_PERIOD_MISMATCH');
		}
		if (course.lesson_kind === 'needs_review') {
			throw new AdminConsoleError('COURSE_CLASSIFICATION_REVIEW_REQUIRED');
		}
		const sourceValue = normalizeLookupText(legacy.group_name_normalized);
		const existing = await this.db.first<{ id: string }>({
			sql: `SELECT id FROM course_source_mappings
				WHERE academic_period_id = ? AND source_kind = 'access'
					AND source_value_normalized = ? AND course_group_id = ?`,
			params: [legacy.academic_period_id, sourceValue, input.courseGroupId],
		});
		if (input.decision === 'confirm') {
			const conflict = await this.db.first<{ id: string }>({
				sql: `SELECT id FROM course_source_mappings
					WHERE academic_period_id = ? AND source_kind = 'access'
						AND source_value_normalized = ? AND status = 'confirmed'
						AND course_group_id <> ?`,
				params: [legacy.academic_period_id, sourceValue, input.courseGroupId],
			});
			if (conflict) throw new AdminConsoleError('COURSE_MAPPING_CONFLICT');
		}
		const mappingId =
			existing?.id ??
			(await hashCanonical({
				period: legacy.academic_period_id,
				source: sourceValue,
				course: input.courseGroupId,
			}));
		const status = input.decision === 'confirm' ? 'confirmed' : 'rejected';
		return this.execute({
			actor: input.actor,
			scope: 'admin:course-mapping-decision',
			idempotencyKey: input.idempotencyKey,
			payload: {
				legacyEnrollmentId: input.legacyEnrollmentId,
				courseGroupId: input.courseGroupId,
				decision: input.decision,
				reason: input.reason.trim(),
			},
			resultRef: `course_mapping:${mappingId}:${status}`,
			requestId: input.requestId,
			targetKind: 'course_source_mapping',
			targetId: mappingId,
			action: `course.mapping.${status}`,
			safeDiff: { status, courseGroupId: input.courseGroupId, sourceKind: 'access' },
			now: input.now,
			statements: () => [
				{
					sql: `INSERT INTO course_source_mappings
						(id, academic_period_id, source_kind, source_value_normalized,
						 course_group_id, status, reason, created_by, created_at, updated_at)
					VALUES (?, ?, 'access', ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT (academic_period_id, source_kind, source_value_normalized, course_group_id)
					DO UPDATE SET status = excluded.status, reason = excluded.reason,
						created_by = excluded.created_by, updated_at = excluded.updated_at`,
					params: [
						mappingId,
						legacy.academic_period_id,
						sourceValue,
						input.courseGroupId,
						status,
						input.reason.trim(),
						input.actor.id,
						input.now,
						input.now,
					],
				},
				...(input.decision === 'confirm'
					? [
							{
								sql: `UPDATE legacy_enrollments SET course_group_id = ?,
								is_active_for_occupancy = CASE
									WHEN lesson_kind IN ('group', 'dance_group')
										AND upper(coalesce(status_code_raw, '')) IN ('J', 'M', 'O/V', 'V/O')
									THEN 1 ELSE 0 END, updated_at = ?
							WHERE academic_period_id = ? AND group_name_normalized = ?
								AND is_current = 1 AND ${ACTIVE_ADMIN_SQL}`,
								params: [
									input.courseGroupId,
									input.now,
									legacy.academic_period_id,
									legacy.group_name_normalized,
									input.actor.id,
								],
							},
							...(input.taskId
								? [
										{
											sql: `UPDATE admin_review_tasks SET status = 'resolved', assigned_to = ?,
										resolution = 'mapping_confirmed', updated_at = ?, resolved_at = ?
									WHERE id = ? AND kind = 'course_mapping'
										AND source_kind = 'legacy_enrollment'
										AND source_id = ? AND status IN ('open', 'in_progress')`,
											params: [
												input.actor.id,
												input.now,
												input.now,
												input.taskId,
												input.legacyEnrollmentId,
											],
										} satisfies StatementSpec,
									]
								: []),
						]
					: input.taskId
						? [
								{
									sql: `UPDATE admin_review_tasks SET status = 'in_progress', assigned_to = ?,
									resolution = 'mapping_candidate_rejected', updated_at = ?
								WHERE id = ? AND kind = 'course_mapping'
									AND source_kind = 'legacy_enrollment' AND source_id = ?
									AND status IN ('open', 'in_progress')`,
									params: [
										input.actor.id,
										input.now,
										input.taskId,
										input.legacyEnrollmentId,
									],
								} satisfies StatementSpec,
							]
						: []),
			],
			assertionSql:
				input.decision === 'confirm'
					? `EXISTS (SELECT 1 FROM course_source_mappings
						WHERE id = ? AND status = 'confirmed' AND course_group_id = ?)
						AND NOT EXISTS (SELECT 1 FROM legacy_enrollments
							WHERE academic_period_id = ? AND group_name_normalized = ?
								AND is_current = 1 AND course_group_id IS NOT ?)`
					: `EXISTS (SELECT 1 FROM course_source_mappings
						WHERE id = ? AND status = 'rejected' AND course_group_id = ?)`,
			assertionParams:
				input.decision === 'confirm'
					? [
							mappingId,
							input.courseGroupId,
							legacy.academic_period_id,
							legacy.group_name_normalized,
							input.courseGroupId,
						]
					: [mappingId, input.courseGroupId],
		});
	}

	async updateCatalogCourse(input: {
		actor: AdminActor;
		courseGroupId: string;
		action: 'publish' | 'hide' | 'needs_review' | 'set_capacity';
		capacity?: number | '';
		reason: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		const status =
			input.action === 'publish'
				? 'published'
				: input.action === 'hide'
					? 'hidden'
					: input.action === 'needs_review'
						? 'needs_review'
						: null;
		const capacity = input.action === 'set_capacity' ? input.capacity : undefined;
		if (
			input.action === 'set_capacity' &&
			(!Number.isSafeInteger(capacity) || Number(capacity) <= 0)
		) {
			throw new AdminConsoleError('CAPACITY_INVALID');
		}
		return this.execute({
			actor: input.actor,
			scope: 'admin:catalog-course-update',
			idempotencyKey: input.idempotencyKey,
			payload: {
				courseGroupId: input.courseGroupId,
				action: input.action,
				capacity: capacity ?? null,
				reason: input.reason.trim(),
			},
			resultRef: `course:${input.courseGroupId}:${input.action}:${capacity ?? status ?? ''}`,
			requestId: input.requestId,
			targetKind: 'course_group',
			targetId: input.courseGroupId,
			action: `catalog.course.${input.action}`,
			safeDiff: status ? { catalogStatus: status } : { capacityOverride: capacity },
			now: input.now,
			statements: () => [
				status
					? {
							sql: `UPDATE course_groups SET catalog_status = ?,
								requires_admin_approval = CASE WHEN ? = 'needs_review' THEN 1
									ELSE requires_admin_approval END, updated_at = ?
							WHERE id = ? AND catalog_status <> 'retired' AND ${ACTIVE_ADMIN_SQL}
								AND (? <> 'published' OR (
									lesson_kind <> 'needs_review'
									AND EXISTS (SELECT 1 FROM academic_periods period
										WHERE period.id = course_groups.academic_period_id
											AND period.is_current = 1)
									AND EXISTS (SELECT 1 FROM course_sessions session
										WHERE session.course_group_id = course_groups.id
											AND session.is_current = 1)))`,
							params: [
								status,
								status,
								input.now,
								input.courseGroupId,
								input.actor.id,
								status,
							],
						}
					: {
							sql: `UPDATE course_groups SET capacity_override = ?, updated_at = ?
							WHERE id = ? AND catalog_status <> 'retired' AND ${ACTIVE_ADMIN_SQL}`,
							params: [capacity, input.now, input.courseGroupId, input.actor.id],
						},
			],
			assertionSql: status
				? `EXISTS (SELECT 1 FROM course_groups WHERE id = ? AND catalog_status = ?)`
				: `EXISTS (SELECT 1 FROM course_groups WHERE id = ? AND capacity_override = ?)`,
			assertionParams: status
				? [input.courseGroupId, status]
				: [input.courseGroupId, capacity],
		});
	}
}

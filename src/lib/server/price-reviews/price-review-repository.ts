import type { AuthenticatedUser } from '$lib/server/auth/session';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import { hashCanonical } from '$lib/server/import/canonical';
import type { AdminActor } from '$lib/server/security/authorization';
import type {
	CalculatedPriceReviewItem,
	PriceReviewTargetKind,
	StoredPriceReviewItem,
	StoredPriceReviewTrigger,
} from './contracts';

const ACTIVE_ADMIN = `EXISTS (SELECT 1 FROM users actor
	WHERE actor.id = ? AND actor.role = 'admin' AND actor.account_status = 'active'
		AND actor.is_blocked = 0)`;
const OPEN_ITEM_STATUSES =
	"'draft','notification_approved','sent','accepted_by_parent','approved_by_admin','scheduled'";

export class PriceReviewRepositoryError extends Error {
	constructor(readonly code: string, options?: { cause?: unknown }) {
		super(code, options);
		this.name = 'PriceReviewRepositoryError';
	}
}

function triggerFromRow(row: {
	id: string;
	course_group_id: string;
	source_kind: string;
	source_ref: string;
	reason_code: string;
	effective_on: string;
	old_active_count: number;
	new_active_count: number;
	old_lookup_children_count: number | null;
	new_lookup_children_count: number | null;
	requested_price_version_id: string | null;
	dedupe_key: string;
	status: string;
	created_at: string;
}): StoredPriceReviewTrigger {
	return {
		id: row.id,
		courseGroupId: row.course_group_id,
		sourceKind: row.source_kind,
		sourceRef: row.source_ref,
		reasonCode: row.reason_code,
		effectiveOn: row.effective_on,
		oldActiveCount: row.old_active_count,
		newActiveCount: row.new_active_count,
		oldLookupChildrenCount: row.old_lookup_children_count,
		newLookupChildrenCount: row.new_lookup_children_count,
		requestedPriceVersionId: row.requested_price_version_id,
		dedupeKey: row.dedupe_key,
		status: row.status,
		createdAt: row.created_at,
	};
}

interface ItemRow {
	id: string;
	batch_id: string;
	batch_course_group_id: string;
	batch_created_at: string;
	version: number;
	public_reference: string;
	enrollment_id: string | null;
	legacy_enrollment_id: string | null;
	user_id: string | null;
	old_base_price_cents: number | null;
	old_price_cents: number | null;
	new_base_price_cents: number | null;
	new_final_price_cents: number | null;
	old_price_source: StoredPriceReviewItem['oldPriceSource'];
	new_price_source: StoredPriceReviewItem['newPriceSource'];
	old_price_mode: StoredPriceReviewItem['oldPriceMode'];
	new_price_mode: StoredPriceReviewItem['newPriceMode'];
	old_price_version_id: string | null;
	new_price_version_id: string | null;
	old_price_rule_id: string | null;
	new_price_rule_id: string | null;
	target_state_hash: string;
	expected_active_count: number;
	expected_lookup_children_count: number | null;
	effective_on: string;
	decision_code: StoredPriceReviewItem['decisionCode'];
	terms_snapshot_json: string;
	item_hash: string;
	acceptance_text_version: string;
	status: string;
	sent_at: string | null;
	response_deadline: string | null;
	responded_at: string | null;
	scheduled_for: string | null;
	applied_at: string | null;
}

const ITEM_SELECT = `SELECT item.*, batch.course_group_id AS batch_course_group_id,
	batch.created_at AS batch_created_at FROM price_review_items AS item
	JOIN price_review_batches AS batch ON batch.id = item.batch_id`;

function itemFromRow(row: ItemRow): StoredPriceReviewItem {
	const targetKind: PriceReviewTargetKind = row.enrollment_id
		? 'enrollment'
		: 'legacy_enrollment';
	return {
		id: row.id,
		batchId: row.batch_id,
		batchCourseGroupId: row.batch_course_group_id,
		batchCreatedAt: row.batch_created_at,
		version: row.version,
		publicReference: row.public_reference,
		targetKind,
		targetId: row.enrollment_id ?? row.legacy_enrollment_id!,
		userId: row.user_id,
		oldBasePriceCents: row.old_base_price_cents,
		oldPriceCents: row.old_price_cents,
		newBasePriceCents: row.new_base_price_cents,
		newFinalPriceCents: row.new_final_price_cents,
		oldPriceSource: row.old_price_source,
		newPriceSource: row.new_price_source,
		oldPriceMode: row.old_price_mode,
		newPriceMode: row.new_price_mode,
		oldPriceVersionId: row.old_price_version_id,
		newPriceVersionId: row.new_price_version_id,
		oldPriceRuleId: row.old_price_rule_id,
		newPriceRuleId: row.new_price_rule_id,
		targetStateHash: row.target_state_hash,
		expectedActiveCount: row.expected_active_count,
		expectedLookupChildrenCount: row.expected_lookup_children_count,
		effectiveOn: row.effective_on,
		decisionCode: row.decision_code,
		termsSnapshotJson: row.terms_snapshot_json,
		itemHash: row.item_hash,
		acceptanceTextVersion: row.acceptance_text_version,
		status: row.status,
		sentAt: row.sent_at,
		responseDeadline: row.response_deadline,
		respondedAt: row.responded_at,
		scheduledFor: row.scheduled_for,
		appliedAt: row.applied_at,
	};
}

function auditStatement(input: {
	id: string;
	actorUserId: string | null;
	action: string;
	targetKind: string;
	targetId: string;
	requestId: string;
	safeDiff: Record<string, unknown>;
	now: string;
}): StatementSpec {
	return {
		sql: `INSERT INTO audit_events
			(id, actor_user_id, actor_kind, action, target_kind, target_id,
			 request_id, safe_diff_json, ip_retention_value, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
		params: [input.id, input.actorUserId, input.actorUserId ? 'user' : 'system',
			input.action, input.targetKind, input.targetId, input.requestId,
			JSON.stringify(input.safeDiff), input.now],
	};
}

function targetAssertion(
	item: StoredPriceReviewItem,
	asOf: string
): { sql: string; params: readonly unknown[] } {
	if (item.targetKind === 'enrollment') {
		return {
			sql: `EXISTS (SELECT 1 FROM enrollments enrollment
				JOIN users owner ON owner.id = enrollment.user_id
				WHERE enrollment.id = ? AND enrollment.user_id = ?
					AND enrollment.status = 'active' AND enrollment.active_from <= ?
					AND (enrollment.active_until IS NULL OR ? < enrollment.active_until)
					AND owner.account_status = 'active' AND owner.is_blocked = 0
					AND enrollment.current_base_price_cents IS ?
					AND enrollment.current_price_cents IS ?
					AND enrollment.price_source IS ? AND enrollment.price_mode IS ?
					AND enrollment.current_price_version_id IS ?
					AND enrollment.current_price_rule_id IS ?)`,
			params: [item.targetId, item.userId, asOf, asOf, item.oldBasePriceCents,
				item.oldPriceCents, item.oldPriceSource, item.oldPriceMode,
				item.oldPriceVersionId, item.oldPriceRuleId],
		};
	}
	return {
		sql: `EXISTS (SELECT 1 FROM legacy_enrollments legacy
			JOIN children child ON child.id = legacy.child_id
			JOIN users owner ON owner.id = child.owner_user_id
			WHERE legacy.id = ? AND owner.id = ? AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND legacy.is_current = 1
				AND legacy.is_active_for_occupancy = 1
				AND legacy.represented_by_enrollment_id IS NULL
				AND legacy.needs_admin_review = 0
				AND COALESCE((SELECT assignment.base_price_cents
					FROM legacy_service_price_assignments assignment
					WHERE assignment.legacy_enrollment_id = legacy.id
						AND assignment.status = 'active' AND assignment.effective_from <= ?
						AND (assignment.effective_until IS NULL OR ? < assignment.effective_until)
					ORDER BY assignment.effective_from DESC LIMIT 1), legacy.planned_price_cents) IS ?
				AND COALESCE((SELECT assignment.final_price_cents
					FROM legacy_service_price_assignments assignment
					WHERE assignment.legacy_enrollment_id = legacy.id
						AND assignment.status = 'active' AND assignment.effective_from <= ?
						AND (assignment.effective_until IS NULL OR ? < assignment.effective_until)
					ORDER BY assignment.effective_from DESC LIMIT 1), legacy.planned_price_cents) IS ?
				AND COALESCE((SELECT assignment.price_source
					FROM legacy_service_price_assignments assignment
					WHERE assignment.legacy_enrollment_id = legacy.id
						AND assignment.status = 'active' AND assignment.effective_from <= ?
						AND (assignment.effective_until IS NULL OR ? < assignment.effective_until)
					ORDER BY assignment.effective_from DESC LIMIT 1),
					CASE legacy.price_source WHEN 'yearly' THEN 'excel_yearly'
						WHEN 'monthly' THEN 'excel_monthly' END) IS ?
				AND COALESCE((SELECT assignment.price_mode
					FROM legacy_service_price_assignments assignment
					WHERE assignment.legacy_enrollment_id = legacy.id
						AND assignment.status = 'active' AND assignment.effective_from <= ?
						AND (assignment.effective_until IS NULL OR ? < assignment.effective_until)
					ORDER BY assignment.effective_from DESC LIMIT 1), legacy.price_mode) IS ?)`,
		params: [item.targetId, item.userId,
			asOf, asOf, item.oldBasePriceCents,
			asOf, asOf, item.oldPriceCents,
			asOf, asOf, item.oldPriceSource,
			asOf, asOf, item.oldPriceMode],
	};
}

export class PriceReviewRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async createTrigger(input: {
		courseGroupId: string;
		sourceKind: StoredPriceReviewTrigger['sourceKind'];
		sourceRef: string;
		reasonCode: string;
		effectiveOn: string;
		oldActiveCount: number;
		newActiveCount: number;
		oldLookupChildrenCount: number | null;
		newLookupChildrenCount: number | null;
		requestedPriceVersionId: string | null;
		dedupeKey: string;
		createdByUserId?: string | null;
		now: string;
	}): Promise<StoredPriceReviewTrigger> {
		const prior = await this.getTriggerByDedupe(input.dedupeKey);
		if (prior) return prior;
		const id = crypto.randomUUID();
		await this.db.run({
			sql: `INSERT OR IGNORE INTO price_review_triggers
				(id, course_group_id, source_kind, source_ref, reason_code,
				 effective_on, old_active_count, new_active_count,
				 old_lookup_children_count, new_lookup_children_count,
				 requested_price_version_id, dedupe_key, status, error_code,
				 created_by_user_id, created_at, processed_at, updated_at)
			SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, NULL, ?
			WHERE EXISTS (SELECT 1 FROM course_groups WHERE id = ?)`,
			params: [id, input.courseGroupId, input.sourceKind, input.sourceRef,
				input.reasonCode, input.effectiveOn, input.oldActiveCount,
				input.newActiveCount, input.oldLookupChildrenCount,
				input.newLookupChildrenCount, input.requestedPriceVersionId,
				input.dedupeKey, input.createdByUserId ?? null, input.now, input.now,
				input.courseGroupId],
		});
		const result = await this.getTriggerByDedupe(input.dedupeKey);
		if (!result) throw new PriceReviewRepositoryError('PRICE_REVIEW_TRIGGER_REJECTED');
		return result;
	}

	async getTriggerByDedupe(dedupeKey: string): Promise<StoredPriceReviewTrigger | null> {
		const row = await this.db.first<Parameters<typeof triggerFromRow>[0]>({
			sql: `SELECT id, course_group_id, source_kind, source_ref, reason_code,
				effective_on, old_active_count, new_active_count,
				old_lookup_children_count, new_lookup_children_count,
				requested_price_version_id, dedupe_key, status, created_at
			FROM price_review_triggers WHERE dedupe_key = ?`,
			params: [dedupeKey],
		});
		return row ? triggerFromRow(row) : null;
	}

	async getTrigger(id: string): Promise<StoredPriceReviewTrigger | null> {
		const row = await this.db.first<Parameters<typeof triggerFromRow>[0]>({
			sql: `SELECT id, course_group_id, source_kind, source_ref, reason_code,
				effective_on, old_active_count, new_active_count,
				old_lookup_children_count, new_lookup_children_count,
				requested_price_version_id, dedupe_key, status, created_at
			FROM price_review_triggers WHERE id = ?`,
			params: [id],
		});
		return row ? triggerFromRow(row) : null;
	}

	async listPendingTriggers(limit = 100): Promise<StoredPriceReviewTrigger[]> {
		const rows = await this.db.all<Parameters<typeof triggerFromRow>[0]>({
			sql: `SELECT id, course_group_id, source_kind, source_ref, reason_code,
				effective_on, old_active_count, new_active_count,
				old_lookup_children_count, new_lookup_children_count,
				requested_price_version_id, dedupe_key, status, created_at
			FROM price_review_triggers WHERE status = 'pending'
			ORDER BY effective_on, created_at LIMIT ?`,
			params: [limit],
		});
		return rows.results.map(triggerFromRow);
	}

	async batchIdForTrigger(triggerId: string): Promise<string | null> {
		const row = await this.db.first<{ batch_id: string }>({
			sql: `SELECT batch_id FROM price_review_trigger_batches WHERE trigger_id = ?`,
			params: [triggerId],
		});
		return row?.batch_id ?? null;
	}

	async persistCalculation(input: {
		trigger: StoredPriceReviewTrigger;
		batchId: string;
		batchDedupeKey: string;
		priceVersionId: string | null;
		activeCount: number;
		lookupChildrenCount: number | null;
		calculationSnapshotJson: string;
		calculationSnapshotHash: string;
		supersedeOpenItems: boolean;
		items: readonly CalculatedPriceReviewItem[];
		now: string;
	}): Promise<string> {
		const prior = await this.batchIdForTrigger(input.trigger.id);
		if (prior) return prior;
		const sendableCount = input.items.filter((item) => !item.manualContactRequired).length;
		const initialStatus = sendableCount > 0 ? 'pending_notification_approval' : 'completed';
		const auditId = crypto.randomUUID();
		const statements: StatementSpec[] = [
			{
				sql: `UPDATE price_review_items SET status = 'superseded', updated_at = ?
				WHERE ? = 1 AND status IN (${OPEN_ITEM_STATUSES}) AND batch_id <> ?
					AND batch_id IN (
					SELECT id FROM price_review_batches WHERE course_group_id = ?
				)`,
				params: [input.now, Number(input.supersedeOpenItems), input.batchId,
					input.trigger.courseGroupId],
			},
			{
				sql: `INSERT OR IGNORE INTO price_review_batches
					(id, course_group_id, reason_code, old_active_count, new_active_count,
					 old_lookup_children_count, new_lookup_children_count, price_version_id,
					 effective_on, earliest_effective_from, calculation_snapshot_json,
					 calculation_snapshot_hash, dedupe_key, status,
					 notification_approved_at, notification_approved_by,
					 created_at, updated_at, completed_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
				params: [input.batchId, input.trigger.courseGroupId, input.trigger.reasonCode,
					input.trigger.oldActiveCount, input.activeCount,
					input.trigger.oldLookupChildrenCount, input.lookupChildrenCount,
					input.priceVersionId, input.trigger.effectiveOn, input.trigger.effectiveOn,
					input.calculationSnapshotJson, input.calculationSnapshotHash,
					input.batchDedupeKey, initialStatus, input.now, input.now,
					initialStatus === 'completed' ? input.now : null],
			},
			{
				sql: `INSERT OR IGNORE INTO price_review_trigger_batches
					(trigger_id, batch_id, created_at) VALUES (?, ?, ?)`,
				params: [input.trigger.id, input.batchId, input.now],
			},
		];
		for (const item of input.items) {
			const manualTaskId = item.manualContactRequired ? `price-review-manual:${item.id}` : null;
			if (manualTaskId) {
				statements.push({
					sql: `INSERT OR IGNORE INTO admin_review_tasks
						(id, kind, source_kind, source_id, reason_code, safe_summary,
						 status, assigned_to, resolution, created_at, updated_at, resolved_at)
					VALUES (?, 'price_review_manual_contact', 'price_review_item', ?, ?, ?,
						'open', NULL, NULL, ?, ?, NULL)`,
					params: [manualTaskId, item.id, item.decisionCode,
						JSON.stringify({ decisionCode: item.decisionCode }), input.now, input.now],
				});
			}
			statements.push({
				sql: `INSERT OR IGNORE INTO price_review_items
					(id, batch_id, version, public_reference, enrollment_id,
					 legacy_enrollment_id, user_id, old_base_price_cents, old_price_cents,
					 new_base_price_cents, new_final_price_cents, old_price_source,
					 new_price_source, old_price_mode, new_price_mode,
					 old_price_version_id, new_price_version_id, old_price_rule_id,
					 new_price_rule_id, target_state_hash, expected_active_count,
					 expected_lookup_children_count, effective_on, decision_code,
					 decision_json, terms_snapshot_json, item_hash, acceptance_text_version,
					 dedupe_key, status, sent_at, response_deadline, responded_at,
					 final_admin_confirmed_at, final_admin_confirmed_by,
					 final_admin_confirmation_reason, manual_contact_task_id,
					 scheduled_for, applied_at, superseded_by_item_id, created_at, updated_at)
				VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
					?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL,
					NULL, NULL, ?, ?)`,
				params: [item.id, input.batchId, item.publicReference,
					item.targetKind === 'enrollment' ? item.targetId : null,
					item.targetKind === 'legacy_enrollment' ? item.targetId : null,
					item.userId, item.oldBasePriceCents, item.oldPriceCents,
					item.newBasePriceCents, item.newFinalPriceCents, item.oldPriceSource,
					item.newPriceSource, item.oldPriceMode, item.newPriceMode,
					item.oldPriceVersionId, item.newPriceVersionId, item.oldPriceRuleId,
					item.newPriceRuleId, item.targetStateHash, item.expectedActiveCount,
					item.expectedLookupChildrenCount, item.effectiveOn, item.decisionCode,
					item.decisionJson, item.termsSnapshotJson, item.itemHash,
					'price-review-acceptance-de-v1', item.dedupeKey,
					item.manualContactRequired ? 'manual_contact_required' : 'draft',
					manualTaskId, input.now, input.now],
			});
		}
		statements.push(
			{
				sql: `UPDATE price_review_items AS previous
				SET superseded_by_item_id = (
					SELECT replacement.id FROM price_review_items AS replacement
					WHERE replacement.batch_id = ? AND (
						(replacement.enrollment_id IS NOT NULL
							AND replacement.enrollment_id = previous.enrollment_id)
						OR (replacement.legacy_enrollment_id IS NOT NULL
							AND replacement.legacy_enrollment_id = previous.legacy_enrollment_id)
					) LIMIT 1
				)
				WHERE previous.status = 'superseded' AND previous.batch_id <> ?
					AND previous.batch_id IN (
						SELECT id FROM price_review_batches WHERE course_group_id = ?
					)`,
				params: [input.batchId, input.batchId, input.trigger.courseGroupId],
			},
			auditStatement({
				id: auditId,
				actorUserId: null,
				action: 'price_review.batch.calculated',
				targetKind: 'price_review_batch',
				targetId: input.batchId,
				requestId: input.trigger.id,
				safeDiff: { courseGroupId: input.trigger.courseGroupId,
					itemCount: input.items.length, sendableCount, activeCount: input.activeCount },
				now: input.now,
			}),
			{
				sql: `UPDATE price_review_triggers SET status = ?, processed_at = ?, updated_at = ?
				WHERE id = ? AND status IN ('pending', 'processing')
					AND EXISTS (SELECT 1 FROM price_review_trigger_batches
						WHERE trigger_id = ? AND batch_id = ?)`,
				params: [input.items.length > 0 ? 'processed' : 'no_change', input.now,
					input.now, input.trigger.id, input.trigger.id, input.batchId],
			},
			{
				sql: `INSERT INTO price_review_action_assertions
					(id, scope, target_id, action_id, assertion_passed, created_at)
				VALUES (?, 'calculate_trigger', ?, NULL, CASE WHEN
					EXISTS (SELECT 1 FROM price_review_batches WHERE id = ?)
					AND EXISTS (SELECT 1 FROM price_review_trigger_batches
						WHERE trigger_id = ? AND batch_id = ?)
					AND (SELECT COUNT(*) FROM price_review_items WHERE batch_id = ?) = ?
				THEN 1 ELSE 0 END, ?)`,
				params: [crypto.randomUUID(), input.trigger.id, input.batchId,
					input.trigger.id, input.batchId, input.batchId, input.items.length, input.now],
			}
		);
		try {
			await this.db.batch(statements);
			return input.batchId;
		} catch (error) {
			const replay = await this.batchIdForTrigger(input.trigger.id);
			if (replay) return replay;
			throw new PriceReviewRepositoryError('PRICE_REVIEW_CALCULATION_REJECTED', { cause: error });
		}
	}

	async getItemById(itemId: string): Promise<StoredPriceReviewItem | null> {
		const row = await this.db.first<ItemRow>({
			sql: `${ITEM_SELECT} WHERE item.id = ?`,
			params: [itemId],
		});
		return row ? itemFromRow(row) : null;
	}

	async getParentItem(publicReference: string, userId: string): Promise<StoredPriceReviewItem | null> {
		const row = await this.db.first<ItemRow>({
			sql: `${ITEM_SELECT} WHERE item.public_reference = ? AND item.user_id = ?`,
			params: [publicReference, userId],
		});
		return row ? itemFromRow(row) : null;
	}

	async listBatchItems(batchId: string): Promise<StoredPriceReviewItem[]> {
		const rows = await this.db.all<ItemRow>({
			sql: `${ITEM_SELECT}
			LEFT JOIN users AS owner ON owner.id = item.user_id
			WHERE item.batch_id = ?
				AND (item.user_id IS NULL OR owner.account_status <> 'closed')
				AND NOT EXISTS (SELECT 1 FROM legal_archive_records AS archive
					WHERE archive.target_kind = 'price_review_item'
						AND archive.target_id = item.id)
			ORDER BY item.created_at, item.id`,
			params: [batchId],
		});
		return rows.results.map(itemFromRow);
	}

	async listParentItems(userId: string): Promise<Array<StoredPriceReviewItem & { courseName: string }>> {
		const rows = await this.db.all<ItemRow & { course_name: string }>({
			sql: `${ITEM_SELECT}
			JOIN course_groups AS course ON course.id = batch.course_group_id
			WHERE item.user_id = ? AND item.status NOT IN ('draft', 'notification_approved')
			ORDER BY item.created_at DESC`,
			params: [userId],
		});
		return rows.results.map((row) => ({ ...itemFromRow(row), courseName: row.course_name }));
	}

	async listAdminBatches(): Promise<Array<{
		id: string;
		courseGroupId: string;
		courseName: string;
		reasonCode: string;
		oldActiveCount: number;
		newActiveCount: number;
		priceVersionId: string | null;
		effectiveOn: string;
		status: string;
		itemCount: number;
		manualCount: number;
		createdAt: string;
	}>> {
		const rows = await this.db.all<{
			id: string; course_group_id: string; course_name: string; reason_code: string;
			old_active_count: number; new_active_count: number; price_version_id: string | null;
			effective_on: string; status: string; item_count: number; manual_count: number;
			created_at: string;
		}>({
			sql: `SELECT batch.id, batch.course_group_id, course.display_name AS course_name,
				batch.reason_code, batch.old_active_count, batch.new_active_count,
				batch.price_version_id, batch.effective_on, batch.status, batch.created_at,
				COUNT(item.id) AS item_count,
				SUM(CASE WHEN item.status = 'manual_contact_required' THEN 1 ELSE 0 END)
					AS manual_count
			FROM price_review_batches AS batch
			JOIN course_groups AS course ON course.id = batch.course_group_id
			JOIN price_review_items AS item ON item.batch_id = batch.id
			LEFT JOIN users AS owner ON owner.id = item.user_id
			WHERE (item.user_id IS NULL OR owner.account_status <> 'closed')
				AND NOT EXISTS (SELECT 1 FROM legal_archive_records AS archive
					WHERE archive.target_kind = 'price_review_item'
						AND archive.target_id = item.id)
				AND NOT EXISTS (SELECT 1 FROM legal_archive_records AS archive
					WHERE archive.target_kind = 'price_review_batch'
						AND archive.target_id = batch.id)
			GROUP BY batch.id ORDER BY batch.created_at DESC LIMIT 200`,
		});
		return rows.results.map((row) => ({ id: row.id, courseGroupId: row.course_group_id,
			courseName: row.course_name, reasonCode: row.reason_code,
			oldActiveCount: row.old_active_count, newActiveCount: row.new_active_count,
			priceVersionId: row.price_version_id, effectiveOn: row.effective_on,
			status: row.status, itemCount: row.item_count, manualCount: row.manual_count ?? 0,
			createdAt: row.created_at }));
	}

	async listComparableCourses(): Promise<Array<{ id: string; name: string }>> {
		const rows = await this.db.all<{ id: string; display_name: string }>({
			sql: `SELECT course.id, course.display_name FROM course_groups AS course
			WHERE course.lesson_kind IN ('group', 'dance_group')
				AND course.catalog_status <> 'retired'
			ORDER BY course.display_name, course.id`,
		});
		return rows.results.map((row) => ({ id: row.id, name: row.display_name }));
	}

	async approveBatch(input: {
		admin: AdminActor;
		batchId: string;
		reason: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}): Promise<{ replayed: boolean }> {
		const requestHash = await hashCanonical({ batchId: input.batchId, reason: input.reason });
		const replay = await this.adminActionReplay(input.admin.id, input.idempotencyKey, requestHash);
		if (replay) return { replayed: true };
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `UPDATE price_review_batches SET status = 'notifications_approved',
						notification_approved_at = ?, notification_approved_by = ?, updated_at = ?
					WHERE id = ? AND status = 'pending_notification_approval'
						AND ${ACTIVE_ADMIN}
						AND EXISTS (SELECT 1 FROM price_review_items
							WHERE batch_id = ? AND status = 'draft')`,
					params: [input.now, input.admin.id, input.now, input.batchId,
						input.admin.id, input.batchId],
				},
				{
					sql: `UPDATE price_review_items SET status = 'notification_approved', updated_at = ?
					WHERE batch_id = ? AND status = 'draft'
						AND EXISTS (SELECT 1 FROM price_review_batches
							WHERE id = ? AND status = 'notifications_approved')`,
					params: [input.now, input.batchId, input.batchId],
				},
				auditStatement({ id: auditId, actorUserId: input.admin.id,
					action: 'price_review.notifications.approved', targetKind: 'price_review_batch',
					targetId: input.batchId, requestId: input.requestId,
					safeDiff: { status: 'notifications_approved', hasReason: true }, now: input.now }),
				{
					sql: `INSERT INTO price_review_admin_actions
						(id, action, target_kind, target_id, actor_user_id, idempotency_key,
						 request_hash_sha256, result_ref, audit_event_id, created_at)
					SELECT ?, 'notification_approval', 'batch', ?, ?, ?, ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM price_review_batches
						WHERE id = ? AND status = 'notifications_approved')`,
					params: [actionId, input.batchId, input.admin.id, input.idempotencyKey,
						requestHash, input.batchId, auditId, input.now, input.batchId],
				},
				{
					sql: `INSERT INTO price_review_action_assertions
						(id, scope, target_id, action_id, assertion_passed, created_at)
					VALUES (?, 'approve_batch', ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM price_review_admin_actions WHERE id = ?)
						AND EXISTS (SELECT 1 FROM price_review_items
							WHERE batch_id = ? AND status = 'notification_approved')
					THEN 1 ELSE 0 END, ?)`,
					params: [crypto.randomUUID(), input.batchId, actionId, actionId,
						input.batchId, input.now],
				},
			]);
			return { replayed: false };
		} catch (error) {
			const after = await this.adminActionReplay(input.admin.id, input.idempotencyKey, requestHash);
			if (after) return { replayed: true };
			throw new PriceReviewRepositoryError('PRICE_REVIEW_BATCH_APPROVAL_REJECTED', { cause: error });
		}
	}

	async recordAdminComparison(input: {
		admin: AdminActor;
		triggerId: string;
		reason: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}): Promise<{ replayed: boolean }> {
		const requestHash = await hashCanonical({ triggerId: input.triggerId, reason: input.reason });
		const replay = await this.adminActionReplay(input.admin.id, input.idempotencyKey, requestHash);
		if (replay) return { replayed: true };
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		try {
			await this.db.batch([
				auditStatement({ id: auditId, actorUserId: input.admin.id,
					action: 'price_review.admin_comparison.requested',
					targetKind: 'price_review_trigger', targetId: input.triggerId,
					requestId: input.requestId,
					safeDiff: { status: 'requested', reasonCode: 'admin_price_comparison', hasReason: true },
					now: input.now }),
				{
					sql: `INSERT INTO price_review_admin_actions
						(id, action, target_kind, target_id, actor_user_id, idempotency_key,
						 request_hash_sha256, result_ref, audit_event_id, created_at)
					SELECT ?, 'admin_price_comparison', 'trigger', ?, ?, ?, ?, ?, ?, ?
					WHERE ${ACTIVE_ADMIN}
						AND EXISTS (SELECT 1 FROM price_review_triggers WHERE id = ?)`,
					params: [actionId, input.triggerId, input.admin.id, input.idempotencyKey,
						requestHash, input.triggerId, auditId, input.now, input.admin.id,
						input.triggerId],
				},
				{
					sql: `INSERT INTO price_review_action_assertions
						(id, scope, target_id, action_id, assertion_passed, created_at)
					VALUES (?, 'admin_comparison', ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM price_review_admin_actions WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [crypto.randomUUID(), input.triggerId, actionId, actionId, input.now],
				},
			]);
			return { replayed: false };
		} catch (error) {
			const after = await this.adminActionReplay(input.admin.id, input.idempotencyKey, requestHash);
			if (after) return { replayed: true };
			throw new PriceReviewRepositoryError('PRICE_REVIEW_COMPARISON_REJECTED', { cause: error });
		}
	}

	async dispatchBatch(input: {
		admin: AdminActor;
		batchId: string;
		items: ReadonlyArray<{ item: StoredPriceReviewItem; cabinetUrl: string; responseDeadline: string }>;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}): Promise<{ replayed: boolean; sent: number }> {
		const requestHash = await hashCanonical({ batchId: input.batchId });
		const replay = await this.adminActionReplay(input.admin.id, input.idempotencyKey, requestHash);
		if (replay) return { replayed: true, sent: await this.deliveryCountForBatch(input.batchId) };
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const statements: StatementSpec[] = [];
		for (const { item, cabinetUrl, responseDeadline } of input.items) {
			const outboxId = `price-review-outbox:${item.id}`;
			const deliveryId = `price-review-delivery:${item.id}`;
			statements.push(
				{
					sql: `INSERT OR IGNORE INTO price_review_outbox_events
						(id, event_type, source_kind, source_id, recipient_role,
						 recipient_user_id, payload_json, dedupe_key, status, created_at)
					SELECT ?, 'item_available', 'price_review_item', id, 'parent', user_id,
						?, ?, 'pending', ? FROM price_review_items
					WHERE id = ? AND batch_id = ? AND status = 'notification_approved'
						AND user_id IS NOT NULL`,
					params: [outboxId, JSON.stringify({ templateKey: 'price_review.item_available',
						cabinetUrl, responseDeadline }), `price-review-item:${item.id}:v1`,
						input.now, item.id, input.batchId],
				},
				{
					sql: `INSERT OR IGNORE INTO price_review_deliveries
						(id, price_review_item_id, outbox_event_id, channel,
						 recipient_user_id, cabinet_url, delivery_status, dedupe_key,
						 delivered_at, created_at)
					SELECT ?, item.id, ?, 'fake_email', item.user_id, ?, 'queued', ?, ?, ?
					FROM price_review_items item WHERE item.id = ?
						AND EXISTS (SELECT 1 FROM price_review_outbox_events WHERE id = ?)`,
					params: [deliveryId, outboxId, cabinetUrl, `fake-email:${item.id}:v1`,
						input.now, input.now, item.id, outboxId],
				},
				{
					sql: `UPDATE price_review_items SET status = 'sent', sent_at = ?,
						response_deadline = ?, updated_at = ?
					WHERE id = ? AND batch_id = ? AND status = 'notification_approved'
						AND EXISTS (SELECT 1 FROM price_review_deliveries WHERE id = ?)`,
					params: [input.now, responseDeadline, input.now, item.id, input.batchId,
						deliveryId],
				}
			);
		}
		statements.push(
			{
				sql: `UPDATE price_review_batches SET status = ?, updated_at = ?, completed_at = ?
				WHERE id = ? AND status = 'notifications_approved' AND ${ACTIVE_ADMIN}`,
				params: [input.items.length > 0 ? 'awaiting_responses' : 'completed',
					input.now, input.items.length > 0 ? null : input.now, input.batchId,
					input.admin.id],
			},
			auditStatement({ id: auditId, actorUserId: input.admin.id,
				action: 'price_review.notifications.dispatched', targetKind: 'price_review_batch',
				targetId: input.batchId, requestId: input.requestId,
				safeDiff: { queuedCount: input.items.length }, now: input.now }),
			{
				sql: `INSERT INTO price_review_admin_actions
					(id, action, target_kind, target_id, actor_user_id, idempotency_key,
					 request_hash_sha256, result_ref, audit_event_id, created_at)
				SELECT ?, 'notification_dispatch', 'batch', ?, ?, ?, ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM price_review_batches
					WHERE id = ? AND status IN ('awaiting_responses', 'completed'))`,
				params: [actionId, input.batchId, input.admin.id, input.idempotencyKey,
					requestHash, input.batchId, auditId, input.now, input.batchId],
			},
			{
				sql: `INSERT INTO price_review_action_assertions
					(id, scope, target_id, action_id, assertion_passed, created_at)
				VALUES (?, 'dispatch_batch', ?, ?, CASE WHEN
					EXISTS (SELECT 1 FROM price_review_admin_actions WHERE id = ?)
					AND (SELECT COUNT(*) FROM price_review_items
						WHERE batch_id = ? AND status = 'sent') >= ?
				THEN 1 ELSE 0 END, ?)`,
				params: [crypto.randomUUID(), input.batchId, actionId, actionId,
					input.batchId, input.items.length, input.now],
			}
		);
		try {
			await this.db.batch(statements);
			return { replayed: false, sent: input.items.length };
		} catch (error) {
			const after = await this.adminActionReplay(input.admin.id, input.idempotencyKey, requestHash);
			if (after) return { replayed: true, sent: await this.deliveryCountForBatch(input.batchId) };
			throw new PriceReviewRepositoryError('PRICE_REVIEW_DISPATCH_REJECTED', { cause: error });
		}
	}

	async recordParentResponse(input: {
		actor: AuthenticatedUser;
		item: StoredPriceReviewItem;
		decision: 'accept' | 'decline';
		providedItemHash: string;
		acceptanceText: string;
		idempotencyKey: string;
		requestHash: string;
		evidenceStatus: 'applied' | 'stale' | 'late';
		userAgent: string;
		ipRetentionValue: string | null;
		ipExpiresAt: string | null;
		requestId: string;
		now: string;
	}): Promise<{ status: string; replayed: boolean }> {
		const prior = await this.parentResponseReplay(
			input.actor.id,
			input.idempotencyKey,
			input.requestHash
		);
		if (prior) return prior;
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const target = targetAssertion(input.item, input.item.effectiveOn);
		const resultingStatus = input.evidenceStatus === 'applied'
			? input.decision === 'accept' ? 'accepted_by_parent' : 'declined_by_parent'
			: input.item.status;
		const taskKind = input.decision === 'accept'
			? 'price_review_parent_accepted'
			: 'price_review_declined';
		const taskId = `price-review-task:${taskKind}:${input.item.id}`;
		const statements: StatementSpec[] = [];
		if (input.evidenceStatus === 'applied') {
			statements.push({
				sql: `UPDATE price_review_items SET status = ?, responded_at = ?, updated_at = ?
				WHERE id = ? AND user_id = ? AND status = 'sent' AND item_hash = ?
					AND EXISTS (SELECT 1 FROM users owner WHERE owner.id = ?
						AND owner.account_status = 'active' AND owner.is_blocked = 0)
					AND ${target.sql}
					AND NOT EXISTS (SELECT 1 FROM price_review_items newer
						WHERE newer.id <> price_review_items.id
							AND ((newer.enrollment_id IS NOT NULL
								AND newer.enrollment_id = price_review_items.enrollment_id)
							OR (newer.legacy_enrollment_id IS NOT NULL
								AND newer.legacy_enrollment_id = price_review_items.legacy_enrollment_id))
							AND (newer.created_at > price_review_items.created_at
								OR (newer.created_at = price_review_items.created_at
									AND newer.version > price_review_items.version)))`,
				params: [resultingStatus, input.now, input.now, input.item.id, input.actor.id,
					input.item.itemHash, input.actor.id, ...target.params],
			});
		}
		statements.push({
			sql: `INSERT INTO price_review_parent_actions
				(id, price_review_item_id, user_id, action, provided_item_hash,
				 request_hash_sha256, idempotency_key, evidence_status, resulting_status,
				 user_agent, ip_retention_value, ip_expires_at, created_at)
			SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
			WHERE EXISTS (SELECT 1 FROM users owner WHERE owner.id = ?
				AND owner.account_status = 'active' AND owner.is_blocked = 0)
				AND EXISTS (SELECT 1 FROM price_review_items item WHERE item.id = ?
					AND item.user_id = ? AND (? <> 'applied' OR item.status = ?))`,
			params: [actionId, input.item.id, input.actor.id, input.decision,
				input.providedItemHash, input.requestHash, input.idempotencyKey,
				input.evidenceStatus, resultingStatus, input.userAgent,
				input.ipRetentionValue, input.ipExpiresAt, input.now, input.actor.id,
				input.item.id, input.actor.id, input.evidenceStatus, resultingStatus],
		});
		if (input.evidenceStatus === 'applied' && input.decision === 'accept') {
			statements.push({
				sql: `INSERT INTO price_change_acceptances
					(id, price_review_item_id, user_id, accepted_at, ip_retention_value,
					 ip_expires_at, user_agent, acceptance_text, acceptance_text_version,
					 item_hash, idempotency_key, parent_action_id)
				SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM price_review_parent_actions WHERE id = ?)`,
				params: [crypto.randomUUID(), input.item.id, input.actor.id, input.now,
					input.ipRetentionValue, input.ipExpiresAt, input.userAgent,
					input.acceptanceText, input.item.acceptanceTextVersion,
					input.item.itemHash, input.idempotencyKey, actionId, actionId],
			});
		}
		if (input.evidenceStatus === 'applied') {
			statements.push(
				{
					sql: `INSERT OR IGNORE INTO admin_review_tasks
						(id, kind, source_kind, source_id, reason_code, safe_summary,
						 status, assigned_to, resolution, created_at, updated_at, resolved_at)
					SELECT ?, ?, 'price_review_item', ?, ?, ?, 'open', NULL, NULL, ?, ?, NULL
					WHERE EXISTS (SELECT 1 FROM price_review_parent_actions WHERE id = ?)`,
					params: [taskId, taskKind, input.item.id,
						input.decision === 'accept' ? 'PARENT_ACCEPTED' : 'PARENT_DECLINED',
						JSON.stringify({ decision: input.decision }), input.now, input.now, actionId],
				},
				{
					sql: `INSERT OR IGNORE INTO price_review_outbox_events
						(id, event_type, source_kind, source_id, recipient_role,
						 recipient_user_id, payload_json, dedupe_key, status, created_at)
					SELECT ?, ?, 'price_review_item', ?, 'admin', NULL, ?, ?, 'pending', ?
					WHERE EXISTS (SELECT 1 FROM price_review_parent_actions WHERE id = ?)`,
					params: [`price-review-admin-outbox:${input.decision}:${input.item.id}`,
						input.decision === 'accept' ? 'parent_accepted' : 'parent_declined',
						input.item.id, JSON.stringify({ itemId: input.item.id,
							decision: input.decision }),
						`price-review-admin:${input.decision}:${input.item.id}`,
						input.now, actionId],
				}
			);
		}
		statements.push(
			auditStatement({ id: auditId, actorUserId: input.actor.id,
				action: `price_review.parent.${input.decision}.${input.evidenceStatus}`,
				targetKind: 'price_review_item', targetId: input.item.id,
				requestId: input.requestId, safeDiff: { evidenceStatus: input.evidenceStatus },
				now: input.now }),
			{
				sql: `INSERT INTO price_review_action_assertions
					(id, scope, target_id, action_id, assertion_passed, created_at)
				VALUES (?, 'parent_response', ?, ?, CASE WHEN
					EXISTS (SELECT 1 FROM price_review_parent_actions WHERE id = ?)
					AND (? <> 'applied' OR EXISTS (SELECT 1 FROM price_review_items
						WHERE id = ? AND status = ?))
					AND (? <> 'accept' OR ? <> 'applied' OR EXISTS (
						SELECT 1 FROM price_change_acceptances WHERE parent_action_id = ?))
				THEN 1 ELSE 0 END, ?)`,
				params: [crypto.randomUUID(), `${input.item.id}:${input.actor.id}:${input.idempotencyKey}`,
					actionId, actionId, input.evidenceStatus, input.item.id, resultingStatus,
					input.decision, input.evidenceStatus, actionId, input.now],
			}
		);
		if (input.evidenceStatus === 'applied' && input.decision === 'decline') {
			statements.push(this.completeBatchIfTerminalStatement(input.item.batchId, input.now));
		}
		try {
			await this.db.batch(statements);
			return { status: resultingStatus, replayed: false };
		} catch (error) {
			const after = await this.db.first<{ request_hash_sha256: string; resulting_status: string }>({
				sql: `SELECT request_hash_sha256, resulting_status FROM price_review_parent_actions
				WHERE user_id = ? AND idempotency_key = ?`,
				params: [input.actor.id, input.idempotencyKey],
			});
			if (after?.request_hash_sha256 === input.requestHash) {
				return { status: after.resulting_status, replayed: true };
			}
			throw new PriceReviewRepositoryError('PRICE_REVIEW_PARENT_RESPONSE_REJECTED', { cause: error });
		}
	}

	async parentResponseReplay(
		userId: string,
		idempotencyKey: string,
		requestHash: string
	): Promise<{ status: string; replayed: true } | null> {
		const prior = await this.db.first<{ request_hash_sha256: string; resulting_status: string }>({
			sql: `SELECT request_hash_sha256, resulting_status FROM price_review_parent_actions
			WHERE user_id = ? AND idempotency_key = ?`,
			params: [userId, idempotencyKey],
		});
		if (!prior) return null;
		if (prior.request_hash_sha256 !== requestHash) {
			throw new PriceReviewRepositoryError('IDEMPOTENCY_KEY_REUSED');
		}
		return { status: prior.resulting_status, replayed: true };
	}

	async scheduleAcceptedItem(input: {
		admin: AdminActor;
		item: StoredPriceReviewItem;
		scheduledFor: string;
		reason: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}): Promise<{ replayed: boolean }> {
		const requestHash = await hashCanonical({ itemId: input.item.id, reason: input.reason });
		const replay = await this.adminActionReplay(input.admin.id, input.idempotencyKey, requestHash);
		if (replay) return { replayed: true };
		const target = targetAssertion(input.item, input.scheduledFor);
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `UPDATE price_review_items SET status = 'scheduled',
						final_admin_confirmed_at = ?, final_admin_confirmed_by = ?,
						final_admin_confirmation_reason = ?, scheduled_for = ?, updated_at = ?
					WHERE id = ? AND status = 'accepted_by_parent' AND ${ACTIVE_ADMIN}
						AND ${target.sql}
						AND EXISTS (SELECT 1 FROM price_change_acceptances acceptance
							WHERE acceptance.price_review_item_id = price_review_items.id
								AND acceptance.item_hash = price_review_items.item_hash)
						AND EXISTS (SELECT 1 FROM price_versions version
							WHERE version.id = price_review_items.new_price_version_id
								AND version.is_active = 1)
						AND EXISTS (SELECT 1 FROM price_rules rule
							WHERE rule.id = price_review_items.new_price_rule_id
								AND rule.price_version_id = price_review_items.new_price_version_id
								AND rule.is_valid = 1)
						AND NOT EXISTS (SELECT 1 FROM price_review_items newer
							WHERE newer.id <> price_review_items.id
								AND ((newer.enrollment_id IS NOT NULL
									AND newer.enrollment_id = price_review_items.enrollment_id)
								OR (newer.legacy_enrollment_id IS NOT NULL
									AND newer.legacy_enrollment_id = price_review_items.legacy_enrollment_id))
								AND (newer.created_at > price_review_items.created_at
									OR (newer.created_at = price_review_items.created_at
										AND newer.version > price_review_items.version)))`,
					params: [input.now, input.admin.id, input.reason, input.scheduledFor,
						input.now, input.item.id, input.admin.id, ...target.params],
				},
				auditStatement({ id: auditId, actorUserId: input.admin.id,
					action: 'price_review.item.finally_confirmed', targetKind: 'price_review_item',
					targetId: input.item.id, requestId: input.requestId,
					safeDiff: { status: 'scheduled', scheduledFor: input.scheduledFor, hasReason: true },
					now: input.now }),
				{
					sql: `INSERT INTO price_review_admin_actions
						(id, action, target_kind, target_id, actor_user_id, idempotency_key,
						 request_hash_sha256, result_ref, audit_event_id, created_at)
					SELECT ?, 'final_confirmation', 'item', ?, ?, ?, ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM price_review_items
						WHERE id = ? AND status = 'scheduled' AND scheduled_for = ?)`,
					params: [actionId, input.item.id, input.admin.id, input.idempotencyKey,
						requestHash, input.item.id, auditId, input.now, input.item.id,
						input.scheduledFor],
				},
				{
					sql: `UPDATE admin_review_tasks SET status = 'resolved', resolution = ?,
						resolved_at = ?, updated_at = ?
					WHERE kind = 'price_review_parent_accepted'
						AND source_kind = 'price_review_item' AND source_id = ?
						AND status IN ('open', 'in_progress')
						AND EXISTS (SELECT 1 FROM price_review_admin_actions WHERE id = ?)`,
					params: ['FINAL_ADMIN_CONFIRMATION_RECORDED', input.now, input.now,
						input.item.id, actionId],
				},
				{
					sql: `INSERT INTO price_review_action_assertions
						(id, scope, target_id, action_id, assertion_passed, created_at)
					VALUES (?, 'final_confirmation', ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM price_review_admin_actions WHERE id = ?)
						AND EXISTS (SELECT 1 FROM price_review_items item
							WHERE item.id = ? AND item.status = 'scheduled'
								AND item.final_admin_confirmed_by = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [crypto.randomUUID(), input.item.id, actionId, actionId,
						input.item.id, input.admin.id, input.now],
				},
			]);
			return { replayed: false };
		} catch (error) {
			const after = await this.adminActionReplay(input.admin.id, input.idempotencyKey, requestHash);
			if (after) return { replayed: true };
			throw new PriceReviewRepositoryError('PRICE_REVIEW_FINAL_CONFIRMATION_REJECTED', {
				cause: error,
			});
		}
	}

	async supersedeItem(item: StoredPriceReviewItem, reasonCode: string, now: string): Promise<boolean> {
		const taskId = `price-review-task:price_review_stale:${item.id}:${reasonCode}`;
		const auditId = crypto.randomUUID();
		try {
			const results = await this.db.batch([
				{
					sql: `UPDATE price_review_items SET status = 'superseded', updated_at = ?
					WHERE id = ? AND status IN (${OPEN_ITEM_STATUSES})`,
					params: [now, item.id],
				},
				{
					sql: `INSERT OR IGNORE INTO admin_review_tasks
						(id, kind, source_kind, source_id, reason_code, safe_summary,
						 status, assigned_to, resolution, created_at, updated_at, resolved_at)
					SELECT ?, 'price_review_stale', 'price_review_item', ?, ?, ?,
						'open', NULL, NULL, ?, ?, NULL
					WHERE EXISTS (SELECT 1 FROM price_review_items
						WHERE id = ? AND status = 'superseded')`,
					params: [taskId, item.id, reasonCode, JSON.stringify({ reasonCode }),
						now, now, item.id],
				},
				auditStatement({ id: auditId, actorUserId: null,
					action: 'price_review.item.superseded', targetKind: 'price_review_item',
					targetId: item.id, requestId: `price-review-stale:${item.id}`,
					safeDiff: { reasonCode }, now }),
				this.completeBatchIfTerminalStatement(item.batchId, now),
			]);
			return (results[0].meta.changes ?? 0) === 1;
		} catch (error) {
			throw new PriceReviewRepositoryError('PRICE_REVIEW_SUPERSEDE_REJECTED', { cause: error });
		}
	}

	async listDueResponses(today: string, limit = 100): Promise<StoredPriceReviewItem[]> {
		const rows = await this.db.all<ItemRow>({
			sql: `${ITEM_SELECT} WHERE item.status = 'sent'
				AND item.response_deadline < ? ORDER BY item.response_deadline, item.id LIMIT ?`,
			params: [today, limit],
		});
		return rows.results.map(itemFromRow);
	}

	async markResponseOverdue(item: StoredPriceReviewItem, today: string, now: string): Promise<boolean> {
		const taskId = `price-review-task:price_review_overdue:${item.id}`;
		const auditId = crypto.randomUUID();
		try {
			const results = await this.db.batch([
				{
					sql: `UPDATE price_review_items SET status = 'response_overdue', updated_at = ?
					WHERE id = ? AND status = 'sent' AND response_deadline < ?`,
					params: [now, item.id, today],
				},
				{
					sql: `INSERT OR IGNORE INTO admin_review_tasks
						(id, kind, source_kind, source_id, reason_code, safe_summary,
						 status, assigned_to, resolution, created_at, updated_at, resolved_at)
					SELECT ?, 'price_review_overdue', 'price_review_item', ?,
						'RESPONSE_DEADLINE_PASSED', ?, 'open', NULL, NULL, ?, ?, NULL
					WHERE EXISTS (SELECT 1 FROM price_review_items
						WHERE id = ? AND status = 'response_overdue')`,
					params: [taskId, item.id,
						JSON.stringify({ responseDeadline: item.responseDeadline }), now, now, item.id],
				},
				{
					sql: `INSERT OR IGNORE INTO price_review_outbox_events
						(id, event_type, source_kind, source_id, recipient_role,
						 recipient_user_id, payload_json, dedupe_key, status, created_at)
					SELECT ?, 'response_overdue', 'price_review_item', ?, 'admin', NULL,
						?, ?, 'pending', ? WHERE EXISTS (SELECT 1 FROM price_review_items
							WHERE id = ? AND status = 'response_overdue')`,
					params: [`price-review-admin-outbox:overdue:${item.id}`, item.id,
						JSON.stringify({ itemId: item.id }), `price-review-admin:overdue:${item.id}`,
						now, item.id],
				},
				auditStatement({ id: auditId, actorUserId: null,
					action: 'price_review.item.response_overdue', targetKind: 'price_review_item',
					targetId: item.id, requestId: `price-review-timeout:${item.id}`,
					safeDiff: { responseDeadline: item.responseDeadline }, now }),
				{
					sql: `INSERT INTO price_review_action_assertions
						(id, scope, target_id, action_id, assertion_passed, created_at)
					VALUES (?, 'response_overdue', ?, NULL, CASE WHEN
						EXISTS (SELECT 1 FROM price_review_items
							WHERE id = ? AND status = 'response_overdue')
						AND EXISTS (SELECT 1 FROM admin_review_tasks WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [crypto.randomUUID(), item.id, item.id, taskId, now],
				},
				this.completeBatchIfTerminalStatement(item.batchId, now),
			]);
			return (results[0].meta.changes ?? 0) === 1;
		} catch (error) {
			if ((await this.getItemById(item.id))?.status === 'response_overdue') return false;
			throw new PriceReviewRepositoryError('PRICE_REVIEW_TIMEOUT_REJECTED', { cause: error });
		}
	}

	async listDueScheduled(today: string, limit = 100): Promise<StoredPriceReviewItem[]> {
		const rows = await this.db.all<ItemRow>({
			sql: `${ITEM_SELECT} WHERE item.status = 'scheduled'
				AND item.scheduled_for <= ? ORDER BY item.scheduled_for, item.id LIMIT ?`,
			params: [today, limit],
		});
		return rows.results.map(itemFromRow);
	}

	async applyScheduledItem(input: {
		item: StoredPriceReviewItem;
		evidenceHash: string;
		now: string;
	}): Promise<{ applied: boolean; replayed: boolean }> {
		if (input.item.status === 'applied') return { applied: true, replayed: true };
		if (!input.item.scheduledFor) {
			throw new PriceReviewRepositoryError('PRICE_REVIEW_ITEM_NOT_SCHEDULED');
		}
		const target = targetAssertion(input.item, input.item.scheduledFor);
		const auditId = crypto.randomUUID();
		const applyEventId = crypto.randomUUID();
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO price_review_action_assertions
					(id, scope, target_id, action_id, assertion_passed, created_at)
				VALUES (?, 'apply_guard', ?, NULL, CASE WHEN
					EXISTS (SELECT 1 FROM price_review_items item
						WHERE item.id = ? AND item.status = 'scheduled'
							AND item.scheduled_for = ?
							AND EXISTS (SELECT 1 FROM price_change_acceptances acceptance
								WHERE acceptance.price_review_item_id = item.id
									AND acceptance.item_hash = item.item_hash)
							AND EXISTS (SELECT 1 FROM price_review_admin_actions action
								WHERE action.action = 'final_confirmation'
									AND action.target_kind = 'item' AND action.target_id = item.id)
							AND EXISTS (SELECT 1 FROM price_versions version
								WHERE version.id = item.new_price_version_id AND version.is_active = 1)
							AND EXISTS (SELECT 1 FROM price_rules rule
								WHERE rule.id = item.new_price_rule_id
									AND rule.price_version_id = item.new_price_version_id
									AND rule.is_valid = 1)
							AND NOT EXISTS (SELECT 1 FROM price_review_items newer
								WHERE newer.id <> item.id
									AND ((newer.enrollment_id IS NOT NULL
										AND newer.enrollment_id = item.enrollment_id)
									OR (newer.legacy_enrollment_id IS NOT NULL
										AND newer.legacy_enrollment_id = item.legacy_enrollment_id))
									AND (newer.created_at > item.created_at
										OR (newer.created_at = item.created_at
											AND newer.version > item.version))))
					AND ${target.sql}
				THEN 1 ELSE 0 END, ?)`,
				params: [crypto.randomUUID(), input.item.id, input.item.id,
					input.item.scheduledFor, ...target.params, input.now],
			},
			auditStatement({ id: auditId, actorUserId: null,
				action: 'price_review.item.applied', targetKind: 'price_review_item',
				targetId: input.item.id, requestId: `price-review-apply:${input.item.id}`,
				safeDiff: { effectiveFrom: input.item.scheduledFor }, now: input.now }),
		];
		if (input.item.targetKind === 'enrollment') {
			statements.push({
				sql: `UPDATE enrollments SET current_base_price_cents = ?,
					current_price_cents = ?, price_source = ?, price_mode = ?,
					current_price_version_id = ?, current_price_rule_id = ?,
					price_effective_from = ?, price_assignment_version = price_assignment_version + 1,
					manual_override_reason = CASE WHEN ? = 'manual_override'
						THEN manual_override_reason ELSE NULL END,
					manual_override_by = CASE WHEN ? = 'manual_override'
						THEN manual_override_by ELSE NULL END,
					manual_override_at = CASE WHEN ? = 'manual_override'
						THEN manual_override_at ELSE NULL END,
					updated_at = ?
				WHERE id = ? AND EXISTS (SELECT 1 FROM price_review_action_assertions
					WHERE scope = 'apply_guard' AND target_id = ?)`,
				params: [input.item.newBasePriceCents, input.item.newFinalPriceCents,
					input.item.newPriceSource, input.item.newPriceMode,
					input.item.newPriceVersionId, input.item.newPriceRuleId,
					input.item.scheduledFor, input.item.newPriceMode, input.item.newPriceMode,
					input.item.newPriceMode, input.now, input.item.targetId, input.item.id],
			});
		} else {
			statements.push({
				sql: `UPDATE legacy_service_price_assignments SET status = 'ended',
					effective_until = ?, updated_at = ?
				WHERE legacy_enrollment_id = ? AND status = 'active'
					AND EXISTS (SELECT 1 FROM price_review_action_assertions
						WHERE scope = 'apply_guard' AND target_id = ?)`,
				params: [input.item.scheduledFor, input.now, input.item.targetId, input.item.id],
			});
		}
		statements.push({
			sql: `INSERT INTO price_change_apply_events
				(id, price_review_item_id, target_kind, target_id, old_base_price_cents,
				 old_final_price_cents, new_base_price_cents, new_final_price_cents,
				 new_price_source, new_price_mode, new_price_version_id, new_price_rule_id,
				 effective_from, evidence_hash, applied_at, audit_event_id, created_at)
			SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
			FROM price_review_items WHERE id = ? AND status = 'scheduled'
				AND EXISTS (SELECT 1 FROM price_review_action_assertions
					WHERE scope = 'apply_guard' AND target_id = ?)`,
			params: [applyEventId, input.item.targetKind, input.item.targetId,
				input.item.oldBasePriceCents, input.item.oldPriceCents,
				input.item.newBasePriceCents, input.item.newFinalPriceCents,
				input.item.newPriceSource, input.item.newPriceMode,
				input.item.newPriceVersionId, input.item.newPriceRuleId,
				input.item.scheduledFor, input.evidenceHash, input.now, auditId,
				input.now, input.item.id, input.item.id],
		});
		if (input.item.targetKind === 'legacy_enrollment') {
			statements.push({
				sql: `INSERT INTO legacy_service_price_assignments
					(id, legacy_enrollment_id, price_review_item_id, base_price_cents,
					 final_price_cents, price_source, price_mode, price_version_id,
					 price_rule_id, effective_from, effective_until, status,
					 applied_by_event_id, created_at, updated_at)
				SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM price_change_apply_events WHERE id = ?)`,
				params: [crypto.randomUUID(), input.item.targetId, input.item.id,
					input.item.newBasePriceCents, input.item.newFinalPriceCents,
					input.item.newPriceSource, input.item.newPriceMode,
					input.item.newPriceVersionId, input.item.newPriceRuleId,
					input.item.scheduledFor, applyEventId, input.now, input.now, applyEventId],
			});
		}
		statements.push(
			{
				sql: `UPDATE price_review_items SET status = 'applied', applied_at = ?, updated_at = ?
				WHERE id = ? AND status = 'scheduled'
					AND EXISTS (SELECT 1 FROM price_change_apply_events
						WHERE id = ? AND price_review_item_id = ?)`,
				params: [input.now, input.now, input.item.id, applyEventId, input.item.id],
			},
			{
				sql: `INSERT OR IGNORE INTO price_review_outbox_events
					(id, event_type, source_kind, source_id, recipient_role,
					 recipient_user_id, payload_json, dedupe_key, status, created_at)
				SELECT ?, 'item_applied', 'price_review_item', id, 'parent', user_id,
					?, ?, 'pending', ? FROM price_review_items
				WHERE id = ? AND status = 'applied' AND user_id IS NOT NULL`,
				params: [`price-review-parent-outbox:applied:${input.item.id}`,
					JSON.stringify({ publicReference: input.item.publicReference,
						effectiveFrom: input.item.scheduledFor }),
					`price-review-parent:applied:${input.item.id}`, input.now, input.item.id],
			},
			{
				sql: `INSERT INTO price_review_action_assertions
					(id, scope, target_id, action_id, assertion_passed, created_at)
				VALUES (?, 'apply_complete', ?, NULL, CASE WHEN
					EXISTS (SELECT 1 FROM price_review_items WHERE id = ? AND status = 'applied')
					AND EXISTS (SELECT 1 FROM price_change_apply_events
						WHERE id = ? AND price_review_item_id = ?)
					AND (? <> 'legacy_enrollment' OR EXISTS (
						SELECT 1 FROM legacy_service_price_assignments
						WHERE price_review_item_id = ? AND status = 'active'))
				THEN 1 ELSE 0 END, ?)`,
				params: [crypto.randomUUID(), input.item.id, input.item.id, applyEventId,
					input.item.id, input.item.targetKind, input.item.id, input.now],
			},
			this.completeBatchIfTerminalStatement(input.item.batchId, input.now)
		);
		try {
			await this.db.batch(statements);
			return { applied: true, replayed: false };
		} catch (error) {
			if ((await this.getItemById(input.item.id))?.status === 'applied') {
				return { applied: true, replayed: true };
			}
			throw new PriceReviewRepositoryError('PRICE_REVIEW_APPLY_REJECTED', { cause: error });
		}
	}

	async recordManualSchedulerRun(input: {
		admin: AdminActor;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}): Promise<{ replayed: boolean }> {
		const requestHash = await hashCanonical({ scope: 'price-review-maintenance' });
		const replay = await this.adminActionReplay(
			input.admin.id,
			input.idempotencyKey,
			requestHash
		);
		if (replay) return { replayed: true };
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const targetId = `price-review-maintenance:${input.idempotencyKey}`;
		try {
			await this.db.batch([
				auditStatement({
					id: auditId,
					actorUserId: input.admin.id,
					action: 'price_review.maintenance.requested',
					targetKind: 'scheduler',
					targetId,
					requestId: input.requestId,
					safeDiff: { scope: 'price_review' },
					now: input.now,
				}),
				{
					sql: `INSERT INTO price_review_admin_actions
						(id, action, target_kind, target_id, actor_user_id, idempotency_key,
						 request_hash_sha256, result_ref, audit_event_id, created_at)
					SELECT ?, 'manual_scheduler_run', 'scheduler', ?, ?, ?, ?, ?, ?, ?
					WHERE ${ACTIVE_ADMIN}`,
					params: [actionId, targetId, input.admin.id, input.idempotencyKey,
						requestHash, targetId, auditId, input.now, input.admin.id],
				},
				{
					sql: `INSERT INTO price_review_action_assertions
						(id, scope, target_id, action_id, assertion_passed, created_at)
					VALUES (?, 'manual_scheduler_run', ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM price_review_admin_actions WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [crypto.randomUUID(), targetId, actionId, actionId, input.now],
				},
			]);
			return { replayed: false };
		} catch (error) {
			if (await this.adminActionReplay(input.admin.id, input.idempotencyKey, requestHash)) {
				return { replayed: true };
			}
			throw new PriceReviewRepositoryError('PRICE_REVIEW_MAINTENANCE_REJECTED', {
				cause: error,
			});
		}
	}

	async reconcilerLastScannedAt(): Promise<string> {
		const row = await this.db.first<{ last_scanned_at: string }>({
			sql: `SELECT last_scanned_at FROM price_review_reconciler_state
			WHERE scope = 'enrollment_boundaries'`,
		});
		if (!row) throw new PriceReviewRepositoryError('PRICE_REVIEW_RECONCILER_STATE_MISSING');
		return row.last_scanned_at;
	}

	async advanceReconcilerWatermark(scannedAt: string): Promise<void> {
		await this.db.run({
			sql: `UPDATE price_review_reconciler_state
			SET last_scanned_at = ?, updated_at = ?
			WHERE scope = 'enrollment_boundaries' AND last_scanned_at <= ?`,
			params: [scannedAt, scannedAt, scannedAt],
		});
	}

	async listUnreconciledBoundaries(
		lastScannedAt: string,
		today: string,
		limit = 100
	): Promise<Array<{
		enrollmentId: string;
		courseGroupId: string;
		boundaryKind: 'activation' | 'expiry';
		effectiveOn: string;
	}>> {
		const rows = await this.db.all<{
			enrollment_id: string;
			course_group_id: string;
			boundary_kind: 'activation' | 'expiry';
			effective_on: string;
		}>({
			sql: `SELECT * FROM (SELECT enrollment.id AS enrollment_id,
				enrollment.course_group_id, 'activation' AS boundary_kind,
				enrollment.active_from AS effective_on
			FROM enrollments enrollment
			WHERE enrollment.status = 'active'
				AND (enrollment.updated_at >= ? OR enrollment.active_from >= ?)
				AND NOT EXISTS (SELECT 1 FROM price_review_triggers trigger
					WHERE trigger.dedupe_key = 'enrollment:' || enrollment.id
						|| ':active_from:' || enrollment.active_from || ':v1')
			UNION ALL
			SELECT enrollment.id, enrollment.course_group_id, 'expiry', enrollment.active_until
			FROM enrollments enrollment
			WHERE enrollment.status = 'active' AND enrollment.active_until IS NOT NULL
				AND (enrollment.updated_at >= ? OR enrollment.active_until >= ?)
				AND NOT EXISTS (SELECT 1 FROM price_review_triggers trigger
					WHERE trigger.dedupe_key = 'enrollment:' || enrollment.id
						|| ':active_until:' || enrollment.active_until || ':v1'))
			ORDER BY effective_on, enrollment_id LIMIT ?`,
			params: [lastScannedAt, today, lastScannedAt, today, limit],
		});
		return rows.results.map((row) => ({ enrollmentId: row.enrollment_id,
			courseGroupId: row.course_group_id, boundaryKind: row.boundary_kind,
			effectiveOn: row.effective_on }));
	}

	async activePriceVersionForCourse(courseGroupId: string, effectiveOn: string): Promise<string | null> {
		const row = await this.db.first<{ id: string }>({
			sql: `SELECT version.id FROM course_groups course
			JOIN price_versions version ON version.academic_period_id = course.academic_period_id
				AND version.is_active = 1 AND version.valid_from <= ?
			WHERE course.id = ? AND course.lesson_kind IN ('group', 'dance_group')`,
			params: [effectiveOn, courseGroupId],
		});
		return row?.id ?? null;
	}

	private completeBatchIfTerminalStatement(batchId: string, now: string): StatementSpec {
		return {
			sql: `UPDATE price_review_batches SET status = 'completed',
				completed_at = ?, updated_at = ?
			WHERE id = ? AND status = 'awaiting_responses'
				AND NOT EXISTS (SELECT 1 FROM price_review_items
					WHERE batch_id = ? AND status IN
						('draft', 'notification_approved', 'sent', 'accepted_by_parent',
						 'approved_by_admin', 'scheduled'))`,
			params: [now, now, batchId, batchId],
		};
	}

	private async deliveryCountForBatch(batchId: string): Promise<number> {
		const row = await this.db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM price_review_deliveries delivery
			JOIN price_review_items item ON item.id = delivery.price_review_item_id
			WHERE item.batch_id = ?`,
			params: [batchId],
		});
		return row?.count ?? 0;
	}

	async adminActionReplay(actorId: string, key: string, requestHash: string) {
		const row = await this.db.first<{ request_hash_sha256: string; result_ref: string }>({
			sql: `SELECT request_hash_sha256, result_ref FROM price_review_admin_actions
			WHERE actor_user_id = ? AND idempotency_key = ?`,
			params: [actorId, key],
		});
		if (!row) return null;
		if (row.request_hash_sha256 !== requestHash) {
			throw new PriceReviewRepositoryError('IDEMPOTENCY_KEY_REUSED');
		}
		return row.result_ref;
	}
}

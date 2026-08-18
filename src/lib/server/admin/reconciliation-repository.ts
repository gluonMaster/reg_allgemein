import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import { hashCanonical } from '$lib/server/import/canonical';
import type {
	LegacyReconciliationIssueClass,
	LegacyReconciliationState,
} from '$lib/server/import/reconciliation';
import type { AdminActor } from '$lib/server/security/authorization';
import { AdminConsoleError } from './errors';

export type ReconciliationAdminAction =
	| 'assign'
	| 'unassign'
	| 'await_upstream'
	| 'mark_ready_to_verify'
	| 'same_service_duplicate'
	| 'distinct_service_proven'
	| 'exact_catalog_mapping'
	| 'verified_portal_family_link'
	| 'typed_child_correction'
	| 'typed_family_correction';

type ReconciliationEvidenceTargetType =
	| 'course_group'
	| 'legacy_family'
	| 'legacy_child'
	| 'legacy_enrollment'
	| 'user'
	| 'family_reassignment';

export interface ReconciliationListFilters {
	periodId?: string;
	sourceKind?: 'access' | 'plusbtext';
	issueClass?: LegacyReconciliationIssueClass;
	state?: LegacyReconciliationState;
	assigneeId?: string;
	firstSeenRunId?: string;
	lastSeenRunId?: string;
	page: number;
}

export interface ReconciliationCaseListItem {
	id: string;
	periodId: string;
	periodCode: string;
	sourceKind: 'access' | 'plusbtext';
	issueCode: string;
	issueClass: LegacyReconciliationIssueClass;
	entityType: string;
	entityId: string | null;
	firstImportRunId: string;
	lastSeenImportRunId: string;
	lastSeenVersionId: string;
	state: LegacyReconciliationState;
	blocksRelease: boolean;
	resolutionKind: string | null;
	assignedTo: string | null;
	updatedAt: string;
	version: number;
}

interface CaseRow {
	id: string;
	academic_period_id: string;
	period_code: string;
	source_kind: 'access' | 'plusbtext';
	source_identity_digest: string;
	issue_code: string;
	issue_class: LegacyReconciliationIssueClass;
	entity_type: string;
	entity_id: string | null;
	first_import_run_id: string;
	last_seen_import_run_id: string;
	last_seen_version_id: string;
	state: LegacyReconciliationState;
	blocks_release: number;
	resolution_kind: string | null;
	assigned_to: string | null;
	updated_at: string;
	version: number;
}

interface MutationContext {
	recordId: string;
	keyHash: string;
	requestHash: string;
	replayed: boolean;
}

interface ReconciliationMutationInput {
	actor: AdminActor;
	caseId: string;
	expectedVersion: number;
	action: ReconciliationAdminAction;
	reasonCode: string;
	assigneeId?: string;
	targetType?: ReconciliationEvidenceTargetType;
	targetId?: string;
	idempotencyKey: string;
	requestId: string;
	now: string;
}

interface ReconciliationTransition {
	state: LegacyReconciliationState;
	assignedTo: string | null;
	resolutionKind: string | null;
	typedEvidence?: TypedEvidenceContext;
}

interface TypedEvidenceContext {
	evidenceRefKind:
		| 'course_source_mapping'
		| 'family_claim'
		| 'child_correction'
		| 'family_reassignment'
		| 'duplicate_pair';
	evidenceRefId: string;
	sourceRowId?: string;
	anchorEnrollmentId?: string;
	peerEnrollmentId?: string;
}

const PAGE_SIZE = 50;
const ACTIVE_STATES: LegacyReconciliationState[] = [
	'open',
	'assigned',
	'awaiting_upstream',
	'ready_to_verify',
];

const ALLOWED_ACTIONS: Record<LegacyReconciliationIssueClass, ReconciliationAdminAction[]> = {
	course_mapping: [
		'assign',
		'unassign',
		'await_upstream',
		'mark_ready_to_verify',
		'exact_catalog_mapping',
	],
	family_identity: [
		'assign',
		'unassign',
		'await_upstream',
		'mark_ready_to_verify',
		'typed_family_correction',
	],
	invalid_email: [
		'assign',
		'unassign',
		'await_upstream',
		'mark_ready_to_verify',
		'verified_portal_family_link',
	],
	invalid_birth_date: [
		'assign',
		'unassign',
		'await_upstream',
		'mark_ready_to_verify',
		'typed_child_correction',
	],
	price: ['assign', 'unassign', 'await_upstream', 'mark_ready_to_verify'],
	duration: ['assign', 'unassign', 'await_upstream', 'mark_ready_to_verify'],
	duplicate_service: ['assign', 'unassign', 'same_service_duplicate', 'distinct_service_proven'],
	source_consistency: ['assign', 'unassign', 'await_upstream', 'mark_ready_to_verify'],
};

const EXACT_CATALOG_MAPPING_CODES = new Set([
	'PLUSB_ENRICHMENT_DANGLING_OLD_ID',
	'PLUSB_ENRICHMENT_EXACT_AMBIGUOUS',
	'PLUSB_ENRICHMENT_JOIN_AMBIGUOUS',
	'PLUSB_ENRICHMENT_OLD_NAME_AMBIGUOUS',
	'PLUSB_ENRICHMENT_UNRESOLVED',
]);

function allowedActions(row: CaseRow): ReconciliationAdminAction[] {
	return ALLOWED_ACTIONS[row.issue_class].filter(
		(action) =>
			action !== 'exact_catalog_mapping' || EXACT_CATALOG_MAPPING_CODES.has(row.issue_code)
	);
}

const ACTION_REASON: Record<ReconciliationAdminAction, string> = {
	assign: 'operator_assignment',
	unassign: 'operator_unassignment',
	await_upstream: 'upstream_correction_requested',
	mark_ready_to_verify: 'upstream_correction_reported',
	same_service_duplicate: 'same_service_confirmed',
	distinct_service_proven: 'distinct_service_evidence_confirmed',
	exact_catalog_mapping: 'exact_mapping_confirmed',
	verified_portal_family_link: 'portal_family_link_verified',
	typed_child_correction: 'child_correction_verified',
	typed_family_correction: 'family_correction_verified',
};

function mapCase(row: CaseRow): ReconciliationCaseListItem {
	return {
		id: row.id,
		periodId: row.academic_period_id,
		periodCode: row.period_code,
		sourceKind: row.source_kind,
		issueCode: row.issue_code,
		issueClass: row.issue_class,
		entityType: row.entity_type,
		entityId: row.entity_id,
		firstImportRunId: row.first_import_run_id,
		lastSeenImportRunId: row.last_seen_import_run_id,
		lastSeenVersionId: row.last_seen_version_id,
		state: row.state,
		blocksRelease: Boolean(row.blocks_release),
		resolutionKind: row.resolution_kind,
		assignedTo: row.assigned_to,
		updatedAt: row.updated_at,
		version: row.version,
	};
}

function expiry(now: string): string {
	return new Date(Date.parse(now) + 30 * 24 * 60 * 60 * 1000).toISOString();
}

function listPredicate(filters: Omit<ReconciliationListFilters, 'page'>): {
	predicate: string;
	params: unknown[];
} {
	const where: string[] = ['1 = 1'];
	const params: unknown[] = [];
	for (const [value, sql] of [
		[filters.periodId, 'reconciliation_case.academic_period_id = ?'],
		[filters.sourceKind, 'reconciliation_case.source_kind = ?'],
		[filters.issueClass, 'reconciliation_case.issue_class = ?'],
		[filters.state, 'reconciliation_case.state = ?'],
		[filters.assigneeId, 'reconciliation_case.assigned_to = ?'],
		[filters.firstSeenRunId, 'reconciliation_case.first_import_run_id = ?'],
		[filters.lastSeenRunId, 'reconciliation_case.last_seen_import_run_id = ?'],
	] as const) {
		if (value) {
			where.push(sql);
			params.push(value);
		}
	}
	return { predicate: where.join(' AND '), params };
}

export class LegacyReconciliationAdminRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async list(filters: ReconciliationListFilters): Promise<{
		items: ReconciliationCaseListItem[];
		total: number;
		page: number;
		pageSize: number;
		summary: Array<{ issueClass: string; state: string; count: number; blocking: number }>;
	}> {
		const { predicate, params } = listPredicate(filters);
		const [rows, count, summary] = await Promise.all([
			this.db.all<CaseRow>({
				sql: `SELECT reconciliation_case.id, reconciliation_case.academic_period_id,
					period.code AS period_code, reconciliation_case.source_kind,
					reconciliation_case.source_identity_digest,
					reconciliation_case.issue_code, reconciliation_case.issue_class,
					reconciliation_case.entity_type, reconciliation_case.entity_id,
					reconciliation_case.first_import_run_id,
					reconciliation_case.last_seen_import_run_id,
					reconciliation_case.last_seen_version_id, reconciliation_case.state,
					reconciliation_case.blocks_release, reconciliation_case.resolution_kind,
					reconciliation_case.assigned_to, reconciliation_case.updated_at,
					reconciliation_case.version
					FROM legacy_reconciliation_cases AS reconciliation_case
					JOIN academic_periods AS period ON period.id = reconciliation_case.academic_period_id
					WHERE ${predicate}
					ORDER BY reconciliation_case.blocks_release DESC,
						CASE reconciliation_case.state WHEN 'open' THEN 0 WHEN 'assigned' THEN 1
							WHEN 'awaiting_upstream' THEN 2 WHEN 'ready_to_verify' THEN 3 ELSE 4 END,
						reconciliation_case.updated_at DESC, reconciliation_case.id
					LIMIT ? OFFSET ?`,
				params: [...params, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE],
			}),
			this.db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM legacy_reconciliation_cases AS reconciliation_case
					WHERE ${predicate}`,
				params,
			}),
			this.db.all<{ issue_class: string; state: string; count: number; blocking: number }>({
				sql: `SELECT issue_class, state, COUNT(*) AS count,
					SUM(CASE WHEN blocks_release = 1 AND state NOT IN ('resolved', 'superseded')
						THEN 1 ELSE 0 END) AS blocking
					FROM legacy_reconciliation_cases AS reconciliation_case
					WHERE ${predicate} GROUP BY issue_class, state
					ORDER BY issue_class, state`,
				params,
			}),
		]);
		return {
			items: rows.results.map(mapCase),
			total: count?.count ?? 0,
			page: filters.page,
			pageSize: PAGE_SIZE,
			summary: summary.results.map((row) => ({
				issueClass: row.issue_class,
				state: row.state,
				count: row.count,
				blocking: row.blocking,
			})),
		};
	}

	async exportList(
		filters: Omit<ReconciliationListFilters, 'page'>
	): Promise<ReconciliationCaseListItem[]> {
		const { predicate, params } = listPredicate(filters);
		const rows = await this.db.all<CaseRow>({
			sql: `SELECT reconciliation_case.id, reconciliation_case.academic_period_id,
				period.code AS period_code, reconciliation_case.source_kind,
				reconciliation_case.source_identity_digest,
				reconciliation_case.issue_code, reconciliation_case.issue_class,
				reconciliation_case.entity_type, reconciliation_case.entity_id,
				reconciliation_case.first_import_run_id,
				reconciliation_case.last_seen_import_run_id,
				reconciliation_case.last_seen_version_id, reconciliation_case.state,
				reconciliation_case.blocks_release, reconciliation_case.resolution_kind,
				reconciliation_case.assigned_to, reconciliation_case.updated_at,
				reconciliation_case.version
				FROM legacy_reconciliation_cases AS reconciliation_case
				JOIN academic_periods AS period ON period.id = reconciliation_case.academic_period_id
				WHERE ${predicate}
				ORDER BY reconciliation_case.blocks_release DESC,
					CASE reconciliation_case.state WHEN 'open' THEN 0 WHEN 'assigned' THEN 1
						WHEN 'awaiting_upstream' THEN 2 WHEN 'ready_to_verify' THEN 3 ELSE 4 END,
					reconciliation_case.updated_at DESC, reconciliation_case.id`,
			params,
		});
		return rows.results.map(mapCase);
	}

	async detail(caseId: string): Promise<{
		item: ReconciliationCaseListItem;
		allowedActions: ReconciliationAdminAction[];
		timeline: Array<{
			id: string;
			action: string;
			reasonCode: string;
			actorKind: string;
			actorUserId: string | null;
			targetType: string | null;
			targetId: string | null;
			priorImportRunId: string | null;
			currentImportRunId: string | null;
			createdAt: string;
		}>;
	}> {
		const row = await this.caseById(caseId);
		if (!row) throw new AdminConsoleError('RECONCILIATION_CASE_NOT_FOUND');
		const timeline = await this.db.all<{
			id: string;
			action: string;
			reason_code: string;
			actor_kind: string;
			actor_user_id: string | null;
			target_type: string | null;
			target_id: string | null;
			prior_import_run_id: string | null;
			current_import_run_id: string | null;
			created_at: string;
		}>({
			sql: `SELECT id, action, reason_code, actor_kind, actor_user_id,
				target_type, target_id, prior_import_run_id, current_import_run_id, created_at
				FROM legacy_reconciliation_decisions WHERE case_id = ? ORDER BY created_at, id`,
			params: [caseId],
		});
		return {
			item: mapCase(row),
			allowedActions: ACTIVE_STATES.includes(row.state) ? allowedActions(row) : [],
			timeline: timeline.results.map((entry) => ({
				id: entry.id,
				action: entry.action,
				reasonCode: entry.reason_code,
				actorKind: entry.actor_kind,
				actorUserId: entry.actor_user_id,
				targetType: entry.target_type,
				targetId: entry.target_id,
				priorImportRunId: entry.prior_import_run_id,
				currentImportRunId: entry.current_import_run_id,
				createdAt: entry.created_at,
			})),
		};
	}

	async mutate(
		input: ReconciliationMutationInput
	): Promise<{ resultRef: string; replayed: boolean }> {
		const context = await this.mutationContext(input);
		if (context.replayed) {
			return { resultRef: `legacy_reconciliation_case:${input.caseId}`, replayed: true };
		}
		const row = await this.caseById(input.caseId);
		if (!row) throw new AdminConsoleError('RECONCILIATION_CASE_NOT_FOUND');
		if (!allowedActions(row).includes(input.action)) {
			throw new AdminConsoleError('RECONCILIATION_ACTION_NOT_ALLOWED');
		}
		if (ACTION_REASON[input.action] !== input.reasonCode) {
			throw new AdminConsoleError('RECONCILIATION_REASON_CODE_MISMATCH');
		}
		if (row.version !== input.expectedVersion || !ACTIVE_STATES.includes(row.state)) {
			throw new AdminConsoleError('RECONCILIATION_STALE_VERSION');
		}
		const transition = await this.transitionFor(row, input);
		const statements = await this.mutationStatements(row, input, context, transition);
		try {
			await this.db.batch(statements);
		} catch (cause) {
			const replay = await this.mutationContext(input).catch(() => null);
			if (replay?.replayed) {
				return { resultRef: `legacy_reconciliation_case:${row.id}`, replayed: true };
			}
			throw cause;
		}
		return { resultRef: `legacy_reconciliation_case:${row.id}`, replayed: false };
	}

	async batchMutate(input: {
		actor: AdminActor;
		cases: Array<{ caseId: string; expectedVersion: number }>;
		action: Extract<
			ReconciliationAdminAction,
			'assign' | 'unassign' | 'await_upstream' | 'mark_ready_to_verify'
		>;
		reasonCode: string;
		assigneeId?: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}): Promise<void> {
		if (input.cases.length < 1 || input.cases.length > 50) {
			throw new AdminConsoleError('RECONCILIATION_BATCH_SIZE_INVALID');
		}
		if (new Set(input.cases.map((entry) => entry.caseId)).size !== input.cases.length) {
			throw new AdminConsoleError('RECONCILIATION_BATCH_COHORT_MISMATCH');
		}
		if (ACTION_REASON[input.action] !== input.reasonCode) {
			throw new AdminConsoleError('RECONCILIATION_REASON_CODE_MISMATCH');
		}
		const mutationInputs: ReconciliationMutationInput[] = input.cases.map(
			(entry) => ({
				actor: input.actor,
				...entry,
				action: input.action,
				reasonCode: input.reasonCode,
				assigneeId: input.assigneeId,
				idempotencyKey: `${input.idempotencyKey}:${entry.caseId}`,
				requestId: input.requestId,
				now: input.now,
			})
		);
		const contexts = await Promise.all(
			mutationInputs.map((mutationInput) => this.mutationContext(mutationInput))
		);
		if (contexts.every((context) => context.replayed)) return;
		if (contexts.some((context) => context.replayed)) {
			throw new AdminConsoleError('IDEMPOTENCY_IN_PROGRESS');
		}
		const rows = await Promise.all(input.cases.map((entry) => this.caseById(entry.caseId)));
		if (rows.some((row) => row === null))
			throw new AdminConsoleError('RECONCILIATION_CASE_NOT_FOUND');
		const typedRows = rows as CaseRow[];
		if (
			new Set(typedRows.map((row) => row.issue_code)).size !== 1 ||
			new Set(typedRows.map((row) => row.state)).size !== 1 ||
			typedRows.some(
				(row, index) =>
					row.version !== input.cases[index].expectedVersion ||
					!ACTIVE_STATES.includes(row.state) ||
					!allowedActions(row).includes(input.action)
			)
		) {
			throw new AdminConsoleError('RECONCILIATION_BATCH_COHORT_MISMATCH');
		}
		const transitions = await Promise.all(
			typedRows.map((row, index) => this.transitionFor(row, mutationInputs[index]))
		);
		const statementGroups = await Promise.all(
			typedRows.map((row, index) =>
				this.mutationStatements(row, mutationInputs[index], contexts[index], transitions[index])
			)
		);
		try {
			await this.db.batch(statementGroups.flat());
		} catch (cause) {
			const replay = await Promise.all(
				mutationInputs.map((mutationInput) =>
					this.mutationContext(mutationInput).catch(() => null)
				)
			);
			if (replay.every((context) => context?.replayed)) return;
			throw cause;
		}
	}

	private async mutationStatements(
		row: CaseRow,
		input: ReconciliationMutationInput,
		context: MutationContext,
		transition: ReconciliationTransition
	): Promise<StatementSpec[]> {
		const decisionId = crypto.randomUUID();
		const assertionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const safeMetadata = JSON.stringify({
			fromState: row.state,
			toState: transition.state,
			issueClass: row.issue_class,
			reasonCode: input.reasonCode,
		});
		const evidenceDigest = await hashCanonical({
			caseId: row.id,
			caseVersion: row.version,
			action: input.action,
			reasonCode: input.reasonCode,
			targetType: input.targetType ?? null,
			targetId: input.targetId ?? null,
		});
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO idempotency_records
					(id, scope, key_hash, request_hash, result_ref, status,
					 expires_at, created_at, updated_at)
					VALUES (?, 'admin:legacy-reconciliation', ?, ?, NULL, 'in_progress', ?, ?, ?)`,
				params: [
					context.recordId,
					context.keyHash,
					context.requestHash,
					expiry(input.now),
					input.now,
					input.now,
				],
			},
			{
				sql: `INSERT INTO legacy_reconciliation_decisions
					(id, case_id, case_version_before, case_version_after, action, reason_code,
					 actor_kind, actor_user_id, idempotency_record_id, request_hash_sha256,
					 target_type, target_id, prior_import_run_id, prior_version_id,
					 current_import_run_id, current_version_id, evidence_digest_sha256,
					 safe_metadata_json, created_at)
					VALUES (?, ?, ?, ?, ?, ?, 'admin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					decisionId,
					row.id,
					row.version,
					row.version + 1,
					input.action,
					input.reasonCode,
					input.actor.id,
					context.recordId,
					context.requestHash,
					input.targetType ?? null,
					input.targetId ?? null,
					row.last_seen_import_run_id,
					row.last_seen_version_id,
					row.last_seen_import_run_id,
					row.last_seen_version_id,
					evidenceDigest,
					safeMetadata,
					input.now,
				],
			},
			...(transition.typedEvidence
				? [
						{
							sql: `INSERT INTO legacy_reconciliation_evidence_bindings
								(decision_id, case_id, case_version, action, evidence_ref_kind,
								 evidence_ref_id, target_type, target_id, source_import_run_id,
								 source_version_id, source_row_id, anchor_enrollment_id,
								 peer_enrollment_id, created_at)
							VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
							params: [
								decisionId,
								row.id,
								row.version + 1,
								input.action,
								transition.typedEvidence.evidenceRefKind,
								transition.typedEvidence.evidenceRefId,
								input.targetType!,
								input.targetId!,
								row.last_seen_import_run_id,
								row.last_seen_version_id,
								transition.typedEvidence.sourceRowId ?? null,
								transition.typedEvidence.anchorEnrollmentId ?? null,
								transition.typedEvidence.peerEnrollmentId ?? null,
								input.now,
							],
						} satisfies StatementSpec,
					]
				: []),
			{
				sql: `UPDATE legacy_reconciliation_cases SET state = ?, assigned_to = ?,
					resolution_kind = ?, resolved_import_run_id = NULL, resolved_at = ?,
					updated_at = ?, version = version + 1
					WHERE id = ? AND version = ? AND state = ?`,
				params: [
					transition.state,
					transition.assignedTo,
					transition.resolutionKind,
					transition.state === 'resolved' ? input.now : null,
					input.now,
					row.id,
					row.version,
					row.state,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, ip_retention_value, created_at)
					SELECT ?, ?, 'user', ?, 'legacy_reconciliation_case', ?, ?, ?, NULL, ?
					WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'admin'
						AND account_status = 'active' AND is_blocked = 0)
						AND EXISTS (SELECT 1 FROM legacy_reconciliation_cases
							WHERE id = ? AND version = ? AND state = ?)`,
				params: [
					auditId,
					input.actor.id,
					`import.reconciliation.${input.action}`,
					row.id,
					input.requestId,
					safeMetadata,
					input.now,
					input.actor.id,
					row.id,
					row.version + 1,
					transition.state,
				],
			},
			{
				sql: `INSERT INTO legacy_reconciliation_assertions
					(id, decision_id, case_id, case_version, assertion_kind, assertion_passed, created_at)
					VALUES (?, ?, ?, ?, ?, CASE WHEN EXISTS
						(SELECT 1 FROM audit_events WHERE id = ?) THEN 1 ELSE 0 END, ?)`,
				params: [
					assertionId,
					decisionId,
					row.id,
					row.version + 1,
					transition.state === 'resolved'
						? 'typed_evidence_verified'
						: 'state_transition',
					auditId,
					input.now,
				],
			},
			{
				sql: `UPDATE idempotency_records SET status = 'completed', result_ref = ?, updated_at = ?
					WHERE id = ? AND status = 'in_progress'
						AND EXISTS (SELECT 1 FROM legacy_reconciliation_assertions
							WHERE id = ? AND assertion_passed = 1)`,
				params: [
					`legacy_reconciliation_case:${row.id}`,
					input.now,
					context.recordId,
					assertionId,
				],
			},
		];
		return statements;
	}

	private async transitionFor(
		row: CaseRow,
		input: {
			action: ReconciliationAdminAction;
			actor: AdminActor;
			assigneeId?: string;
			targetType?: ReconciliationEvidenceTargetType;
			targetId?: string;
		}
	): Promise<ReconciliationTransition> {
		if (input.action === 'assign') {
			const assigneeId = input.assigneeId ?? input.actor.id;
			const assignee = await this.db.first<{ id: string }>({
				sql: `SELECT id FROM users WHERE id = ? AND role = 'admin'
					AND account_status = 'active' AND is_blocked = 0`,
				params: [assigneeId],
			});
			if (!assignee) throw new AdminConsoleError('RECONCILIATION_ASSIGNEE_INVALID');
			return { state: 'assigned', assignedTo: assigneeId, resolutionKind: null };
		}
		if (input.action === 'unassign') {
			if (row.state !== 'assigned')
				throw new AdminConsoleError('RECONCILIATION_ACTION_NOT_ALLOWED');
			return { state: 'open', assignedTo: null, resolutionKind: null };
		}
		if (input.action === 'await_upstream') {
			if (row.state !== 'open' && row.state !== 'assigned') {
				throw new AdminConsoleError('RECONCILIATION_ACTION_NOT_ALLOWED');
			}
			return { state: 'awaiting_upstream', assignedTo: null, resolutionKind: null };
		}
		if (input.action === 'mark_ready_to_verify') {
			if (row.state !== 'awaiting_upstream') {
				throw new AdminConsoleError('RECONCILIATION_ACTION_NOT_ALLOWED');
			}
			return { state: 'ready_to_verify', assignedTo: null, resolutionKind: null };
		}
		if (row.state === 'awaiting_upstream') {
			throw new AdminConsoleError('RECONCILIATION_ACTION_NOT_ALLOWED');
		}

		const typedEvidence = await this.assertTypedEvidence(row, input);
		return {
			state: 'resolved',
			assignedTo: null,
			resolutionKind: input.action,
			typedEvidence,
		};
	}

	private async assertTypedEvidence(
		row: CaseRow,
		input: {
			action: ReconciliationAdminAction;
			targetType?: ReconciliationEvidenceTargetType;
			targetId?: string;
		}
	): Promise<TypedEvidenceContext> {
		if (!input.targetType || !input.targetId) {
			throw new AdminConsoleError('RECONCILIATION_TYPED_EVIDENCE_REQUIRED');
		}
		let evidence: TypedEvidenceContext | null = null;
		if (input.action === 'exact_catalog_mapping') {
			if (
				!EXACT_CATALOG_MAPPING_CODES.has(row.issue_code) ||
				input.targetType !== 'course_group' ||
				row.entity_type !== 'legacy_enrollment' ||
				!row.entity_id
			) {
				throw new AdminConsoleError('RECONCILIATION_TYPED_EVIDENCE_MISMATCH');
			}
			const rowEvidence = await this.db.first<{ id: string }>({
				sql: `SELECT mapping.id FROM legacy_snapshot_enrollments AS snapshot
					JOIN course_source_mappings AS mapping
						ON mapping.academic_period_id = ?
						AND mapping.course_group_id = ?
						AND mapping.source_kind = 'access' AND mapping.status = 'confirmed'
						AND mapping.source_value_normalized = snapshot.group_name_normalized
					WHERE snapshot.legacy_version_id = ?
						AND snapshot.legacy_enrollment_id = ?`,
				params: [
					row.academic_period_id,
					input.targetId,
					row.last_seen_version_id,
					row.entity_id,
				],
			});
			if (rowEvidence) {
				evidence = { evidenceRefKind: 'course_source_mapping', evidenceRefId: rowEvidence.id };
			}
		} else if (input.action === 'verified_portal_family_link') {
			if (
				input.targetType !== 'user' ||
				row.entity_type !== 'legacy_family' ||
				!row.entity_id
			) {
				throw new AdminConsoleError('RECONCILIATION_TYPED_EVIDENCE_MISMATCH');
			}
			const rowEvidence = await this.db.first<{ id: string }>({
				sql: `SELECT claim.id FROM legacy_families AS family
					JOIN family_claims AS claim ON claim.legacy_family_id = family.id
						AND claim.user_id = ? AND claim.status = 'claimed'
					WHERE family.id = ? AND family.claimed_by_user_id = ?`,
				params: [input.targetId, row.entity_id, input.targetId],
			});
			if (rowEvidence) {
				evidence = { evidenceRefKind: 'family_claim', evidenceRefId: rowEvidence.id };
			}
		} else if (input.action === 'typed_child_correction') {
			if (
				input.targetType !== 'legacy_child' ||
				row.issue_code !== 'ACCESS_CHILD_BIRTH_DATE_INVALID' ||
				row.entity_type !== 'legacy_family' ||
				!row.entity_id
			) {
				throw new AdminConsoleError('RECONCILIATION_TYPED_EVIDENCE_MISMATCH');
			}
			const candidates = await this.db.all<{
				id: string;
				source_row_id: string;
				source_record_key: string;
			}>({
				sql: `SELECT correction.id, source.id AS source_row_id, source.source_record_key
					FROM child_correction_requests AS correction
					JOIN audit_events AS audit ON audit.target_kind = 'child_correction'
						AND audit.target_id = correction.id
						AND audit.action = 'child.legacy_correction_approved'
					JOIN children AS child ON child.id = correction.child_id
						AND child.origin = 'legacy' AND child.legacy_family_id = ?
					JOIN legacy_snapshot_families AS family
						ON family.legacy_version_id = ? AND family.legacy_family_id = ?
					JOIN legacy_snapshot_source_rows AS source
						ON source.legacy_version_id = family.legacy_version_id
						AND source.stable_family_key = family.stable_family_key
					WHERE correction.child_id = ? AND correction.status = 'approved'
						AND trim(CAST(json_extract(source.source_values_json, '$.Value4') AS TEXT))
							IN (trim(child.source_full_name), trim(correction.requested_full_name))`,
				params: [
					row.entity_id,
					row.last_seen_version_id,
					row.entity_id,
					input.targetId,
				],
			});
			for (const candidate of candidates.results) {
				const digest = await hashCanonical({
					academicPeriodId: row.academic_period_id,
					sourceKind: row.source_kind,
					sourceRecordKey: candidate.source_record_key,
				});
				if (digest === row.source_identity_digest) {
					evidence = {
						evidenceRefKind: 'child_correction',
						evidenceRefId: candidate.id,
						sourceRowId: candidate.source_row_id,
					};
					break;
				}
			}
		} else if (input.action === 'typed_family_correction') {
			if (input.targetType !== 'family_reassignment' || !row.entity_id) {
				throw new AdminConsoleError('RECONCILIATION_TYPED_EVIDENCE_MISMATCH');
			}
			const rowEvidence = await this.db.first<{ id: string }>({
				sql: `SELECT reassignment.id FROM family_reassignments AS reassignment
					JOIN legacy_families AS family ON family.id = ?
					JOIN audit_events AS audit ON audit.target_kind = 'family_reassignment'
						AND audit.target_id = reassignment.id
						AND audit.action = 'family.admin_correction_applied'
					WHERE reassignment.id = ? AND reassignment.status = 'applied'
						AND family.family_number_id IN
							(reassignment.from_family_number_id, reassignment.to_family_number_id)`,
				params: [row.entity_id, input.targetId],
			});
			if (rowEvidence) {
				evidence = {
					evidenceRefKind: 'family_reassignment',
					evidenceRefId: rowEvidence.id,
				};
			}
		} else if (
			input.action === 'same_service_duplicate' ||
			input.action === 'distinct_service_proven'
		) {
			if (
				input.targetType !== 'legacy_enrollment' ||
				row.issue_code !== 'ACCESS_CHILD_GROUP_DUPLICATE_SLOTS' ||
				row.entity_type !== 'legacy_enrollment' ||
				!row.entity_id ||
				input.targetId === row.entity_id
			) {
				throw new AdminConsoleError('RECONCILIATION_TYPED_EVIDENCE_MISMATCH');
			}
			const occurrence = await this.db.first<{ safe_context_json: string }>({
				sql: `SELECT issue.safe_context_json
					FROM legacy_reconciliation_occurrences AS occurrence
					JOIN import_issues AS issue ON issue.id = occurrence.import_issue_id
					WHERE occurrence.case_id = ? AND occurrence.import_run_id = ?
						AND occurrence.version_id = ? LIMIT 1`,
				params: [row.id, row.last_seen_import_run_id, row.last_seen_version_id],
			});
			let relatedEnrollmentIds: string[] = [];
			try {
				const parsed = JSON.parse(occurrence?.safe_context_json ?? '{}') as Record<
					string,
					unknown
				>;
				if (Array.isArray(parsed.relatedEnrollmentIds)) {
					relatedEnrollmentIds = parsed.relatedEnrollmentIds.filter(
						(value): value is string => typeof value === 'string'
					);
				}
			} catch {
				// Stored safe context is treated as untrusted evidence and fails closed below.
			}
			if (
				new Set(relatedEnrollmentIds).size !== 2 ||
				!relatedEnrollmentIds.includes(row.entity_id) ||
				!relatedEnrollmentIds.includes(input.targetId)
			) {
				throw new AdminConsoleError('RECONCILIATION_TYPED_EVIDENCE_MISMATCH');
			}
			const distinctCoursePredicate =
				input.action === 'distinct_service_proven'
					? `JOIN legacy_enrollments AS anchor_current
						ON anchor_current.id = anchor.legacy_enrollment_id
						AND anchor_current.is_current = 1
					JOIN legacy_enrollments AS duplicate_current
						ON duplicate_current.id = duplicate.legacy_enrollment_id
						AND duplicate_current.is_current = 1
					JOIN course_groups AS anchor_course
						ON anchor_course.id = anchor_current.course_group_id
						AND anchor_course.academic_period_id = ?
						AND anchor_course.catalog_status IN ('published', 'needs_review')
					JOIN course_groups AS duplicate_course
						ON duplicate_course.id = duplicate_current.course_group_id
						AND duplicate_course.academic_period_id = ?
						AND duplicate_course.catalog_status IN ('published', 'needs_review')`
					: '';
			const rowEvidence = await this.db.first<{ id: string }>({
				sql: `SELECT duplicate.legacy_enrollment_id AS id
					FROM legacy_snapshot_enrollments AS anchor
					JOIN legacy_snapshot_enrollments AS duplicate
						ON duplicate.legacy_version_id = anchor.legacy_version_id
						AND duplicate.source_child_key = anchor.source_child_key
						AND duplicate.group_name_normalized = anchor.group_name_normalized
						AND duplicate.legacy_enrollment_id <> anchor.legacy_enrollment_id
					${distinctCoursePredicate}
					WHERE anchor.legacy_version_id = ? AND anchor.legacy_enrollment_id = ?
						AND duplicate.legacy_enrollment_id = ?
						${input.action === 'distinct_service_proven' ? 'AND anchor_course.id <> duplicate_course.id' : ''}`,
				params:
					input.action === 'distinct_service_proven'
						? [
								row.academic_period_id,
								row.academic_period_id,
								row.last_seen_version_id,
								row.entity_id,
								input.targetId,
							]
						: [row.last_seen_version_id, row.entity_id, input.targetId],
			});
			if (rowEvidence) {
				evidence = {
					evidenceRefKind: 'duplicate_pair',
					evidenceRefId: rowEvidence.id,
					anchorEnrollmentId: row.entity_id,
					peerEnrollmentId: input.targetId,
				};
			}
		}
		if (!evidence) throw new AdminConsoleError('RECONCILIATION_TYPED_EVIDENCE_MISMATCH');
		return evidence;
	}

	private async mutationContext(input: {
		caseId: string;
		expectedVersion: number;
		action: string;
		reasonCode: string;
		assigneeId?: string;
		targetType?: string;
		targetId?: string;
		idempotencyKey: string;
	}): Promise<MutationContext> {
		const keyHash = await hashCanonical({ key: input.idempotencyKey.trim() });
		const requestHash = await hashCanonical({
			caseId: input.caseId,
			expectedVersion: input.expectedVersion,
			action: input.action,
			reasonCode: input.reasonCode,
			assigneeId: input.assigneeId ?? null,
			targetType: input.targetType ?? null,
			targetId: input.targetId ?? null,
		});
		const prior = await this.db.first<{
			id: string;
			request_hash: string;
			result_ref: string | null;
			status: string;
		}>({
			sql: `SELECT id, request_hash, result_ref, status FROM idempotency_records
				WHERE scope = 'admin:legacy-reconciliation' AND key_hash = ?`,
			params: [keyHash],
		});
		if (prior) {
			if (prior.request_hash !== requestHash)
				throw new AdminConsoleError('IDEMPOTENCY_KEY_REUSED');
			if (
				prior.status !== 'completed' ||
				prior.result_ref !== `legacy_reconciliation_case:${input.caseId}`
			) {
				throw new AdminConsoleError('IDEMPOTENCY_IN_PROGRESS');
			}
			return { recordId: prior.id, keyHash, requestHash, replayed: true };
		}
		return { recordId: crypto.randomUUID(), keyHash, requestHash, replayed: false };
	}

	private caseById(caseId: string): Promise<CaseRow | null> {
		return this.db.first<CaseRow>({
			sql: `SELECT reconciliation_case.id, reconciliation_case.academic_period_id,
				period.code AS period_code, reconciliation_case.source_kind,
				reconciliation_case.source_identity_digest,
				reconciliation_case.issue_code, reconciliation_case.issue_class,
				reconciliation_case.entity_type, reconciliation_case.entity_id,
				reconciliation_case.first_import_run_id,
				reconciliation_case.last_seen_import_run_id,
				reconciliation_case.last_seen_version_id, reconciliation_case.state,
				reconciliation_case.blocks_release, reconciliation_case.resolution_kind,
				reconciliation_case.assigned_to, reconciliation_case.updated_at,
				reconciliation_case.version
				FROM legacy_reconciliation_cases AS reconciliation_case
				JOIN academic_periods AS period ON period.id = reconciliation_case.academic_period_id
				WHERE reconciliation_case.id = ?`,
			params: [caseId],
		});
	}
}

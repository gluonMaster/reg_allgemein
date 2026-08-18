import type { SqlDatabaseBoundary, StatementSpec } from '$lib/server/db/database';
import { hashCanonical } from './canonical';

export type LegacyReconciliationIssueClass =
	| 'course_mapping'
	| 'family_identity'
	| 'invalid_email'
	| 'invalid_birth_date'
	| 'price'
	| 'duration'
	| 'duplicate_service'
	| 'source_consistency';

export type LegacyReconciliationState =
	'open' | 'assigned' | 'awaiting_upstream' | 'ready_to_verify' | 'resolved' | 'superseded';

export interface ActionableImportIssue {
	id: string;
	code: string;
	source_record_key: string | null;
	safe_context_json: string;
}

interface ReconciliationCaseRow {
	id: string;
	source_identity_digest: string;
	issue_code: string;
	issue_class: LegacyReconciliationIssueClass;
	entity_type: string;
	entity_id: string | null;
	last_seen_import_run_id: string;
	last_seen_version_id: string;
	state: LegacyReconciliationState;
	resolution_kind: string | null;
	version: number;
}

export interface ReconciliationGateSummary {
	evidenceId: string | null;
	blocking: number;
	open: number;
	assigned: number;
	awaitingUpstream: number;
	readyToVerify: number;
	byClass: Record<LegacyReconciliationIssueClass, number>;
	passed: boolean;
}

const ISSUE_CLASS_RULES: ReadonlyArray<{
	issueClass: LegacyReconciliationIssueClass;
	matches(code: string): boolean;
}> = [
	{
		issueClass: 'course_mapping',
		matches: (code) =>
			code.startsWith('PLUSB_ENRICHMENT_') ||
			code === 'ACCESS_STATUS_NEEDS_REVIEW' ||
			code === 'PLUSB_WEEKDAY_INVALID' ||
			code === 'PLUSB_WEEKDAY_MISSING' ||
			code === 'PLUSB_TEACHER_MISSING',
	},
	{
		issueClass: 'family_identity',
		matches: (code) =>
			/^ACCESS_(?:FAMILY_ID_|FAMILY_NUMBER_|PARENT_NAME_|FAMILY_CONTACT_CONFLICT|FAMILY_EMAIL_CONFLICT|CONTINUITY_)/u.test(
				code
			) || code === 'ACCESS_CHILD_SAME_NAME_MULTIPLE_BIRTH_DATES',
	},
	{ issueClass: 'invalid_email', matches: (code) => code === 'ACCESS_EMAIL_INVALID' },
	{
		issueClass: 'invalid_birth_date',
		matches: (code) => code === 'ACCESS_CHILD_BIRTH_DATE_INVALID',
	},
	{
		issueClass: 'price',
		matches: (code) =>
			code === 'ACCESS_PLANNED_PRICE_INVALID' || code === 'ACCESS_PLANNED_PRICE_MISSING',
	},
	{
		issueClass: 'duration',
		matches: (code) =>
			code === 'ACCESS_DURATION_MISSING' ||
			code === 'PLUSB_DURATION_INVALID' ||
			code === 'PLUSB_DURATION_MISSING',
	},
	{
		issueClass: 'duplicate_service',
		matches: (code) => code === 'ACCESS_CHILD_GROUP_DUPLICATE_SLOTS',
	},
	{
		issueClass: 'source_consistency',
		matches: (code) =>
			code === 'ACCESS_VALUE48_MISMATCH' || code === 'ACCESS_VALUE48_DUPLICATE',
	},
];

const EMPTY_CLASS_COUNTS: Record<LegacyReconciliationIssueClass, number> = {
	course_mapping: 0,
	family_identity: 0,
	invalid_email: 0,
	invalid_birth_date: 0,
	price: 0,
	duration: 0,
	duplicate_service: 0,
	source_consistency: 0,
};

export function reconciliationIssueClass(code: string): LegacyReconciliationIssueClass | null {
	return ISSUE_CLASS_RULES.find((rule) => rule.matches(code))?.issueClass ?? null;
}

function safeEntity(safeContextJson: string): {
	entityType: 'source_record' | 'legacy_family' | 'legacy_child' | 'legacy_enrollment';
	entityId: string | null;
} {
	try {
		const value = JSON.parse(safeContextJson) as Record<string, unknown>;
		const entityType = value.entityType;
		const entityId = value.entityId;
		if (
			(entityType === 'legacy_family' ||
				entityType === 'legacy_child' ||
				entityType === 'legacy_enrollment') &&
			typeof entityId === 'string' &&
			/^[a-z0-9][a-z0-9:_-]{0,199}$/iu.test(entityId)
		) {
			return { entityType, entityId };
		}
	} catch {
		// Import safe context has already passed its storage boundary. Fail closed to an opaque source row.
	}
	return { entityType: 'source_record', entityId: null };
}

function systemIdempotencyExpiry(now: string): string {
	return new Date(Date.parse(now) + 365 * 24 * 60 * 60 * 1000).toISOString();
}

async function systemEvidence(input: Record<string, unknown>): Promise<{
	idempotencyId: string;
	keyHash: string;
	requestHash: string;
	evidenceDigest: string;
}> {
	const evidenceDigest = await hashCanonical(input);
	return {
		idempotencyId: `reconciliation-system:${evidenceDigest.slice(0, 40)}`,
		keyHash: await hashCanonical({ scope: 'legacy-reconciliation-system', evidenceDigest }),
		requestHash: await hashCanonical({ request: input }),
		evidenceDigest,
	};
}

function evidenceStatements(input: {
	caseId: string;
	caseVersionBefore: number;
	caseVersionAfter: number;
	action:
		| 'materialized'
		| 'seen_again'
		| 'verification_failed_reimport'
		| 'resolved_by_reimport'
		| 'supersede_source_identity';
	reasonCode: string;
	idempotencyId: string;
	keyHash: string;
	requestHash: string;
	evidenceDigest: string;
	priorRunId: string | null;
	priorVersionId: string | null;
	currentRunId: string;
	currentVersionId: string;
	now: string;
	assertionKind: 'materialized' | 'state_transition' | 'reimport_verified';
}): StatementSpec[] {
	const decisionId = `reconciliation-decision:${input.evidenceDigest.slice(0, 40)}`;
	return [
		{
			sql: `INSERT OR IGNORE INTO idempotency_records
				(id, scope, key_hash, request_hash, result_ref, status, expires_at, created_at, updated_at)
				VALUES (?, 'legacy-reconciliation-system', ?, ?, ?, 'completed', ?, ?, ?)`,
			params: [
				input.idempotencyId,
				input.keyHash,
				input.requestHash,
				input.caseId,
				systemIdempotencyExpiry(input.now),
				input.now,
				input.now,
			],
		},
		{
			sql: `INSERT OR IGNORE INTO legacy_reconciliation_decisions
				(id, case_id, case_version_before, case_version_after, action, reason_code,
				 actor_kind, actor_user_id, idempotency_record_id, request_hash_sha256,
				 target_type, target_id, prior_import_run_id, prior_version_id,
				 current_import_run_id, current_version_id, evidence_digest_sha256,
				 safe_metadata_json, created_at)
				VALUES (?, ?, ?, ?, ?, ?, 'system', NULL, ?, ?, 'import_run', ?, ?, ?, ?, ?, ?, '{}', ?)`,
			params: [
				decisionId,
				input.caseId,
				input.caseVersionBefore,
				input.caseVersionAfter,
				input.action,
				input.reasonCode,
				input.idempotencyId,
				input.requestHash,
				input.currentRunId,
				input.priorRunId,
				input.priorVersionId,
				input.currentRunId,
				input.currentVersionId,
				input.evidenceDigest,
				input.now,
			],
		},
		{
			sql: `INSERT OR IGNORE INTO audit_events
				(id, actor_user_id, actor_kind, action, target_kind, target_id,
				 request_id, safe_diff_json, ip_retention_value, created_at)
				VALUES (?, NULL, 'system', ?, 'legacy_reconciliation_case', ?, ?, ?, NULL, ?)`,
			params: [
				`reconciliation-audit:${input.evidenceDigest.slice(0, 40)}`,
				`import.reconciliation.${input.action}`,
				input.caseId,
				input.idempotencyId,
				JSON.stringify({ reasonCode: input.reasonCode }),
				input.now,
			],
		},
		{
			sql: `INSERT OR IGNORE INTO legacy_reconciliation_assertions
				(id, decision_id, case_id, case_version, assertion_kind, assertion_passed, created_at)
				VALUES (?, ?, ?, ?, ?, 1, ?)`,
			params: [
				`reconciliation-assertion:${input.evidenceDigest.slice(0, 40)}`,
				decisionId,
				input.caseId,
				input.caseVersionAfter,
				input.assertionKind,
				input.now,
			],
		},
	];
}

/**
 * Materializes the PII-free reconciliation manifest of an immutable validated import.
 * It deliberately works only from issue ids/codes, opaque entity ids and a digest of the
 * source record key; raw source values never enter the reconciliation tables or audit.
 */
export class LegacyImportReconciliationRepository {
	constructor(private readonly db: SqlDatabaseBoundary) {}

	async reconcileValidatedImport(input: {
		academicPeriodId: string;
		sourceKind: 'access' | 'plusbtext';
		importRunId: string;
		versionId: string;
		now: string;
	}): Promise<void> {
		const issueRows = await this.db.all<ActionableImportIssue>({
			sql: `SELECT id, code, source_record_key, safe_context_json
				FROM import_issues WHERE import_run_id = ? ORDER BY code, id`,
			params: [input.importRunId],
		});
		const currentIdentities = new Set<string>();

		for (const issue of issueRows.results) {
			const issueClass = reconciliationIssueClass(issue.code);
			if (!issueClass) continue;
			const sourceIdentityDigest = await hashCanonical({
				academicPeriodId: input.academicPeriodId,
				sourceKind: input.sourceKind,
				sourceRecordKey: issue.source_record_key ?? `aggregate:${issue.code}`,
			});
			const identityKey = `${sourceIdentityDigest}:${issue.code}`;
			currentIdentities.add(identityKey);
			const occurrence = await this.db.first<{ case_id: string }>({
				sql: `SELECT case_id FROM legacy_reconciliation_occurrences WHERE import_issue_id = ?`,
				params: [issue.id],
			});
			if (occurrence) continue;

			const existing = await this.db.first<ReconciliationCaseRow>({
				sql: `SELECT id, source_identity_digest, issue_code, issue_class, entity_type,
					entity_id, last_seen_import_run_id, last_seen_version_id, state,
					resolution_kind, version
					FROM legacy_reconciliation_cases
					WHERE academic_period_id = ? AND source_kind = ?
						AND source_identity_digest = ? AND issue_code = ?
					ORDER BY CASE WHEN state NOT IN ('resolved', 'superseded') THEN 0 ELSE 1 END,
						version DESC, created_at DESC LIMIT 1`,
				params: [
					input.academicPeriodId,
					input.sourceKind,
					sourceIdentityDigest,
					issue.code,
				],
			});
			if (
				existing?.state === 'resolved' &&
				existing.resolution_kind !== 'resolved_by_reimport'
			) {
				await this.insertOccurrence({
					caseId: existing.id,
					issueId: issue.id,
					importRunId: input.importRunId,
					versionId: input.versionId,
					now: input.now,
				});
				continue;
			}

			if (existing && existing.state !== 'resolved' && existing.state !== 'superseded') {
				await this.touchExistingCase({
					caseRow: existing,
					issueId: issue.id,
					importRunId: input.importRunId,
					versionId: input.versionId,
					now: input.now,
				});
				continue;
			}

			let entity = safeEntity(issue.safe_context_json);
			if (
				entity.entityId === null &&
				input.sourceKind === 'access' &&
				issue.source_record_key
			) {
				const enrollment = await this.db.first<{ entity_id: string }>({
					sql: `SELECT legacy_enrollment_id AS entity_id
						FROM legacy_snapshot_enrollments
						WHERE legacy_version_id = ? AND source_record_key = ? LIMIT 1`,
					params: [input.versionId, issue.source_record_key],
				});
				if (enrollment) {
					entity = { entityType: 'legacy_enrollment', entityId: enrollment.entity_id };
				} else {
					const family = await this.db.first<{ entity_id: string }>({
						sql: `SELECT family.legacy_family_id AS entity_id
							FROM legacy_snapshot_source_rows AS source
							JOIN legacy_snapshot_families AS family
								ON family.legacy_version_id = source.legacy_version_id
								AND family.stable_family_key = source.stable_family_key
							WHERE source.legacy_version_id = ? AND source.source_record_key = ? LIMIT 1`,
						params: [input.versionId, issue.source_record_key],
					});
					if (family) {
						entity = { entityType: 'legacy_family', entityId: family.entity_id };
					}
				}
			}
			const caseId = `legacy-reconciliation:${(
				await hashCanonical({
					sourceIdentityDigest,
					issueCode: issue.code,
					run: input.importRunId,
				})
			).slice(0, 40)}`;
			const supersededCandidate = entity.entityId
				? await this.db.first<ReconciliationCaseRow>({
						sql: `SELECT id, source_identity_digest, issue_code, issue_class, entity_type,
							entity_id, last_seen_import_run_id, last_seen_version_id, state,
							resolution_kind, version
							FROM legacy_reconciliation_cases
							WHERE academic_period_id = ? AND source_kind = ? AND issue_code = ?
								AND entity_type = ? AND entity_id = ?
								AND source_identity_digest <> ?
								AND state NOT IN ('resolved', 'superseded')
							ORDER BY updated_at DESC LIMIT 1`,
						params: [
							input.academicPeriodId,
							input.sourceKind,
							issue.code,
							entity.entityType,
							entity.entityId,
							sourceIdentityDigest,
						],
					})
				: null;
			await this.createCase({
				caseId,
				issueId: issue.id,
				issueCode: issue.code,
				issueClass,
				entityType: entity.entityType,
				entityId: entity.entityId,
				sourceIdentityDigest,
				supersededCandidate,
				...input,
			});
		}

		const active = await this.db.all<ReconciliationCaseRow>({
			sql: `SELECT id, source_identity_digest, issue_code, issue_class, entity_type,
				entity_id, last_seen_import_run_id, last_seen_version_id, state,
				resolution_kind, version
				FROM legacy_reconciliation_cases
				WHERE academic_period_id = ? AND source_kind = ?
					AND state = 'ready_to_verify' AND last_seen_import_run_id <> ?`,
			params: [input.academicPeriodId, input.sourceKind, input.importRunId],
		});
		for (const candidate of active.results) {
			if (
				currentIdentities.has(`${candidate.source_identity_digest}:${candidate.issue_code}`)
			) {
				continue;
			}
			await this.resolveByReimport({ caseRow: candidate, ...input });
		}
	}

	async releaseGate(academicPeriodId: string): Promise<ReconciliationGateSummary> {
		const [rows, evidence] = await Promise.all([
			this.db.all<{
				issue_class: LegacyReconciliationIssueClass;
				state: LegacyReconciliationState;
				count: number;
				blocking_count: number;
			}>({
				sql: `SELECT issue_class, state, COUNT(*) AS count,
				SUM(CASE WHEN blocks_release = 1 THEN 1 ELSE 0 END) AS blocking_count
				FROM legacy_reconciliation_cases
				WHERE academic_period_id = ? AND state NOT IN ('resolved', 'superseded')
				GROUP BY issue_class, state`,
				params: [academicPeriodId],
			}),
			this.db.first<{ id: string }>({
				sql: `SELECT decision.id FROM legacy_reconciliation_decisions AS decision
				JOIN legacy_reconciliation_cases AS reconciliation_case
					ON reconciliation_case.id = decision.case_id
				WHERE reconciliation_case.academic_period_id = ?
				ORDER BY decision.created_at DESC, decision.id DESC LIMIT 1`,
				params: [academicPeriodId],
			}),
		]);
		const summary: ReconciliationGateSummary = {
			evidenceId: evidence?.id ?? null,
			blocking: 0,
			open: 0,
			assigned: 0,
			awaitingUpstream: 0,
			readyToVerify: 0,
			byClass: { ...EMPTY_CLASS_COUNTS },
			passed: true,
		};
		for (const row of rows.results) {
			summary.blocking += row.blocking_count;
			summary.byClass[row.issue_class] += row.count;
			if (row.state === 'open') summary.open += row.count;
			if (row.state === 'assigned') summary.assigned += row.count;
			if (row.state === 'awaiting_upstream') summary.awaitingUpstream += row.count;
			if (row.state === 'ready_to_verify') summary.readyToVerify += row.count;
		}
		summary.passed = summary.blocking === 0;
		return summary;
	}

	private async createCase(input: {
		caseId: string;
		issueId: string;
		issueCode: string;
		issueClass: LegacyReconciliationIssueClass;
		entityType: string;
		entityId: string | null;
		sourceIdentityDigest: string;
		supersededCandidate: ReconciliationCaseRow | null;
		academicPeriodId: string;
		sourceKind: 'access' | 'plusbtext';
		importRunId: string;
		versionId: string;
		now: string;
	}): Promise<void> {
		const evidence = await systemEvidence({
			action: 'materialized',
			caseId: input.caseId,
			importRunId: input.importRunId,
			versionId: input.versionId,
		});
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO legacy_reconciliation_cases
					(id, academic_period_id, source_kind, source_identity_digest, issue_code,
					 issue_class, entity_type, entity_id, first_import_run_id,
					 last_seen_import_run_id, last_seen_version_id, state, blocks_release,
					 created_at, updated_at, version)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, ?, ?, 1)`,
				params: [
					input.caseId,
					input.academicPeriodId,
					input.sourceKind,
					input.sourceIdentityDigest,
					input.issueCode,
					input.issueClass,
					input.entityType,
					input.entityId,
					input.importRunId,
					input.importRunId,
					input.versionId,
					input.now,
					input.now,
				],
			},
			...evidenceStatements({
				caseId: input.caseId,
				caseVersionBefore: 0,
				caseVersionAfter: 1,
				action: 'materialized',
				reasonCode: 'actionable_issue_materialized',
				...evidence,
				priorRunId: null,
				priorVersionId: null,
				currentRunId: input.importRunId,
				currentVersionId: input.versionId,
				now: input.now,
				assertionKind: 'materialized',
			}),
			this.occurrenceStatement({
				caseId: input.caseId,
				issueId: input.issueId,
				importRunId: input.importRunId,
				versionId: input.versionId,
				evidenceDigest: await hashCanonical({
					caseId: input.caseId,
					issueId: input.issueId,
					versionId: input.versionId,
				}),
				now: input.now,
			}),
		];
		if (input.supersededCandidate) {
			statements.push(
				...(await this.supersedeStatements({
					caseRow: input.supersededCandidate,
					successorCaseId: input.caseId,
					importRunId: input.importRunId,
					versionId: input.versionId,
					now: input.now,
				}))
			);
		}
		await this.db.batch(statements);
	}

	private async touchExistingCase(input: {
		caseRow: ReconciliationCaseRow;
		issueId: string;
		importRunId: string;
		versionId: string;
		now: string;
	}): Promise<void> {
		const failedVerification = input.caseRow.state === 'ready_to_verify';
		const action = failedVerification ? 'verification_failed_reimport' : 'seen_again';
		const nextState = failedVerification ? 'open' : input.caseRow.state;
		const evidence = await systemEvidence({
			action,
			caseId: input.caseRow.id,
			priorRunId: input.caseRow.last_seen_import_run_id,
			currentRunId: input.importRunId,
			currentVersionId: input.versionId,
		});
		const evidenceRows = evidenceStatements({
			caseId: input.caseRow.id,
			caseVersionBefore: input.caseRow.version,
			caseVersionAfter: input.caseRow.version + 1,
			action,
			reasonCode: failedVerification ? 'issue_persisted_after_reimport' : 'issue_seen_again',
			...evidence,
			priorRunId: input.caseRow.last_seen_import_run_id,
			priorVersionId: input.caseRow.last_seen_version_id,
			currentRunId: input.importRunId,
			currentVersionId: input.versionId,
			now: input.now,
			assertionKind: 'state_transition',
		});
		await this.db.batch([
			...evidenceRows.slice(0, -1),
			{
				sql: `UPDATE legacy_reconciliation_cases
					SET state = ?, assigned_to = CASE WHEN ? = 'open' THEN NULL ELSE assigned_to END,
					last_seen_import_run_id = ?, last_seen_version_id = ?, updated_at = ?,
					version = version + 1
					WHERE id = ? AND version = ? AND state = ?`,
				params: [
					nextState,
					nextState,
					input.importRunId,
					input.versionId,
					input.now,
					input.caseRow.id,
					input.caseRow.version,
					input.caseRow.state,
				],
			},
			evidenceRows[evidenceRows.length - 1],
			this.occurrenceStatement({
				caseId: input.caseRow.id,
				issueId: input.issueId,
				importRunId: input.importRunId,
				versionId: input.versionId,
				evidenceDigest: await hashCanonical({
					caseId: input.caseRow.id,
					issueId: input.issueId,
					versionId: input.versionId,
				}),
				now: input.now,
			}),
		]);
	}

	private async resolveByReimport(input: {
		caseRow: ReconciliationCaseRow;
		academicPeriodId: string;
		sourceKind: 'access' | 'plusbtext';
		importRunId: string;
		versionId: string;
		now: string;
	}): Promise<void> {
		const evidence = await systemEvidence({
			action: 'resolved_by_reimport',
			caseId: input.caseRow.id,
			priorRunId: input.caseRow.last_seen_import_run_id,
			priorVersionId: input.caseRow.last_seen_version_id,
			currentRunId: input.importRunId,
			currentVersionId: input.versionId,
		});
		const evidenceRows = evidenceStatements({
			caseId: input.caseRow.id,
			caseVersionBefore: input.caseRow.version,
			caseVersionAfter: input.caseRow.version + 1,
			action: 'resolved_by_reimport',
			reasonCode: 'issue_absent_in_next_immutable_import',
			...evidence,
			priorRunId: input.caseRow.last_seen_import_run_id,
			priorVersionId: input.caseRow.last_seen_version_id,
			currentRunId: input.importRunId,
			currentVersionId: input.versionId,
			now: input.now,
			assertionKind: 'reimport_verified',
		});
		await this.db.batch([
			...evidenceRows.slice(0, -1),
			{
				sql: `UPDATE legacy_reconciliation_cases SET state = 'resolved',
					resolution_kind = 'resolved_by_reimport', resolved_import_run_id = ?,
					resolved_at = ?, updated_at = ?, version = version + 1
					WHERE id = ? AND version = ? AND state = 'ready_to_verify'
						AND last_seen_import_run_id <> ?`,
				params: [
					input.importRunId,
					input.now,
					input.now,
					input.caseRow.id,
					input.caseRow.version,
					input.importRunId,
				],
			},
			evidenceRows[evidenceRows.length - 1],
		]);
	}

	private async supersedeStatements(input: {
		caseRow: ReconciliationCaseRow;
		successorCaseId: string;
		importRunId: string;
		versionId: string;
		now: string;
	}): Promise<StatementSpec[]> {
		const evidence = await systemEvidence({
			action: 'supersede_source_identity',
			caseId: input.caseRow.id,
			successorCaseId: input.successorCaseId,
			priorRunId: input.caseRow.last_seen_import_run_id,
			currentRunId: input.importRunId,
		});
		const evidenceRows = evidenceStatements({
			caseId: input.caseRow.id,
			caseVersionBefore: input.caseRow.version,
			caseVersionAfter: input.caseRow.version + 1,
			action: 'supersede_source_identity',
			reasonCode: 'source_identity_changed',
			...evidence,
			priorRunId: input.caseRow.last_seen_import_run_id,
			priorVersionId: input.caseRow.last_seen_version_id,
			currentRunId: input.importRunId,
			currentVersionId: input.versionId,
			now: input.now,
			assertionKind: 'state_transition',
		});
		return [
			...evidenceRows.slice(0, -1),
			{
				sql: `UPDATE legacy_reconciliation_cases SET state = 'superseded',
					resolution_kind = 'source_identity_changed', superseded_by_case_id = ?,
					assigned_to = NULL, updated_at = ?, version = version + 1
					WHERE id = ? AND version = ? AND state NOT IN ('resolved', 'superseded')`,
				params: [input.successorCaseId, input.now, input.caseRow.id, input.caseRow.version],
			},
			evidenceRows[evidenceRows.length - 1],
		];
	}

	private async insertOccurrence(input: {
		caseId: string;
		issueId: string;
		importRunId: string;
		versionId: string;
		now: string;
	}): Promise<void> {
		await this.db.run(
			this.occurrenceStatement({
				...input,
				evidenceDigest: await hashCanonical({
					caseId: input.caseId,
					issueId: input.issueId,
					versionId: input.versionId,
				}),
			})
		);
	}

	private occurrenceStatement(input: {
		caseId: string;
		issueId: string;
		importRunId: string;
		versionId: string;
		evidenceDigest: string;
		now: string;
	}): StatementSpec {
		return {
			sql: `INSERT INTO legacy_reconciliation_occurrences
				(id, case_id, import_issue_id, import_run_id, version_id,
				 evidence_digest_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			params: [
				`reconciliation-occurrence:${input.evidenceDigest.slice(0, 40)}`,
				input.caseId,
				input.issueId,
				input.importRunId,
				input.versionId,
				input.evidenceDigest,
				input.now,
			],
		};
	}
}

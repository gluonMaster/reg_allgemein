import { hashCanonical } from '$lib/server/import/canonical';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import type { AdminActor } from '$lib/server/security/authorization';
import type { DocumentRuntimeConfig } from '$lib/server/config/runtime';
import {
	Stage08FundingDiscontinuityContributor,
	fundingEligibilityAssertion,
	type FundingDiscontinuityContributor,
} from './funding-boundary';

const ACTIVE_ADMIN_SQL = `EXISTS (
	SELECT 1 FROM users AS admin WHERE admin.id = ? AND admin.role = 'admin'
		AND admin.account_status = 'active' AND admin.is_blocked = 0
)`;

const ACTIVE_DOCUMENT_REVIEW_CONTEXT_SQL = `EXISTS (
	SELECT 1
	FROM funding_authorizations AS authorization
	JOIN individual_requests AS request
		ON request.id = authorization.request_id
		AND request.user_id = authorization.user_id
		AND request.child_id = authorization.child_id
	JOIN users AS owner ON owner.id = authorization.user_id AND owner.role = 'parent'
	JOIN children AS child
		ON child.id = authorization.child_id AND child.owner_user_id = owner.id
	WHERE authorization.id = authorization_documents.authorization_id
		AND authorization.user_id = authorization_documents.user_id
		AND authorization.child_id = authorization_documents.child_id
		AND authorization.status IN ('pending_review', 'approved')
		AND request.status NOT IN ('rejected', 'cancelled')
		AND owner.account_status = 'active'
		AND authorization_documents.deleted_at IS NULL
		AND authorization_documents.replaced_by_document_id IS NULL
		AND NOT EXISTS (
			SELECT 1 FROM privacy_requests AS closure
			WHERE closure.subject_user_id = owner.id AND closure.kind = 'delete'
				AND closure.status IN ('processing', 'completed',
					'completed_with_retained_evidence')
		)
		AND NOT EXISTS (
			SELECT 1 FROM legal_archive_records AS archive
			WHERE (archive.target_kind = 'authorization_document'
					AND archive.target_id = authorization_documents.id)
				OR (archive.target_kind = 'funding_authorization'
					AND archive.target_id = authorization.id)
		)
)`;

const PENDING_DOCUMENT_AUTHORIZATION_SQL = `EXISTS (
	SELECT 1 FROM funding_authorizations AS authorization
	WHERE authorization.id = authorization_documents.authorization_id
		AND authorization.status = 'pending_review'
)`;

const ACTIVE_AUTHORIZATION_REVIEW_CONTEXT_SQL = `EXISTS (
	SELECT 1
	FROM individual_requests AS request
	JOIN users AS owner ON owner.id = request.user_id AND owner.role = 'parent'
	JOIN children AS child
		ON child.id = request.child_id AND child.owner_user_id = owner.id
	WHERE request.id = funding_authorizations.request_id
		AND request.user_id = funding_authorizations.user_id
		AND request.child_id = funding_authorizations.child_id
		AND request.status NOT IN ('rejected', 'cancelled')
		AND owner.account_status = 'active'
		AND NOT EXISTS (
			SELECT 1 FROM privacy_requests AS closure
			WHERE closure.subject_user_id = owner.id AND closure.kind = 'delete'
				AND closure.status IN ('processing', 'completed',
					'completed_with_retained_evidence')
		)
		AND NOT EXISTS (
			SELECT 1 FROM legal_archive_records AS archive
			WHERE (archive.target_kind = 'funding_authorization'
					AND archive.target_id = funding_authorizations.id)
				OR (archive.target_kind = 'authorization_document'
					AND archive.target_id IN (
						SELECT document.id FROM authorization_documents AS document
						WHERE document.authorization_id = funding_authorizations.id
					))
		)
)`;

export class RequestAdminError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'RequestAdminError';
	}
}

interface AdminCommandContext {
	idempotencyRecordId: string;
	auditId: string;
	requestHash: string;
	replayed: boolean;
}

interface AdminCommand {
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
	statements: (context: AdminCommandContext) => readonly StatementSpec[];
	evidenceStatements?: (context: AdminCommandContext) => readonly StatementSpec[];
	assertionSql: string;
	assertionParams: readonly unknown[];
}

function idempotencyExpiry(now: string) {
	return new Date(Date.parse(now) + 30 * 24 * 60 * 60 * 1000).toISOString();
}

export class RequestAdminRepository {
	constructor(
		private readonly db: DatabaseBoundary,
		private readonly documentConfig: Pick<DocumentRuntimeConfig, 'avAttestationTextVersion'>,
		private readonly fundingContributor: FundingDiscontinuityContributor =
			new Stage08FundingDiscontinuityContributor()
	) {}

	private async commandContext(input: AdminCommand): Promise<AdminCommandContext> {
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
			if (prior.request_hash !== requestHash) throw new RequestAdminError('IDEMPOTENCY_KEY_REUSED');
			if (prior.status !== 'completed' || prior.result_ref !== input.resultRef) {
				throw new RequestAdminError('IDEMPOTENCY_IN_PROGRESS');
			}
			return {
				idempotencyRecordId: prior.id,
				auditId: '',
				requestHash,
				replayed: true,
			};
		}
		return {
			idempotencyRecordId: crypto.randomUUID(),
			auditId: crypto.randomUUID(),
			requestHash,
			replayed: false,
		};
	}

	private async execute(input: AdminCommand) {
		const context = await this.commandContext(input);
		if (context.replayed) return { resultRef: input.resultRef, replayed: true };
		const keyHash = await hashCanonical({ key: input.idempotencyKey.trim() });
		const assertionId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO idempotency_records
						(id, scope, key_hash, request_hash, result_ref, status,
						 expires_at, created_at, updated_at)
					VALUES (?, ?, ?, ?, NULL, 'in_progress', ?, ?, ?)`,
					params: [
						context.idempotencyRecordId,
						input.scope,
						keyHash,
						context.requestHash,
						idempotencyExpiry(input.now),
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
						context.auditId,
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
				...(input.evidenceStatements?.(context) ?? []),
				{
					sql: `INSERT INTO admin_action_assertions
						(id, scope, idempotency_record_id, actor_user_id, target_kind,
						 target_id, assertion_passed, created_at)
					VALUES (?, ?, ?, ?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
						AND ${ACTIVE_ADMIN_SQL} AND (${input.assertionSql})
					THEN 1 ELSE 0 END, ?)`,
					params: [
						assertionId,
						input.scope,
						context.idempotencyRecordId,
						input.actor.id,
						input.targetKind,
						input.targetId,
						context.auditId,
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
					params: [
						input.resultRef,
						input.now,
						context.idempotencyRecordId,
						context.idempotencyRecordId,
					],
				},
			]);
			return { resultRef: input.resultRef, replayed: false };
		} catch (error) {
			const replay = await this.commandContext(input).catch(() => null);
			if (replay?.replayed) return { resultRef: input.resultRef, replayed: true };
			throw error;
		}
	}

	async transitionRequest(input: {
		actor: AdminActor;
		requestId: string;
		action: 'needs_documents' | 'needs_info' | 'approve' | 'reject' | 'cancel';
		reason: string;
		idempotencyKey: string;
		requestIdHeader: string;
		now: string;
	}) {
		const current = await this.db.first<{ status: string }>({
			sql: `SELECT status FROM individual_requests WHERE id = ?`,
			params: [input.requestId],
		});
		if (!current) throw new RequestAdminError('REQUEST_NOT_FOUND');
		const targetStatus =
			input.action === 'approve'
				? 'approved'
				: input.action === 'reject'
					? 'rejected'
					: input.action === 'cancel'
						? 'cancelled'
						: input.action;
		const allowedFrom =
			input.action === 'cancel'
				? ['draft', 'submitted', 'needs_documents', 'needs_info', 'pending_admin_review', 'approved']
				: ['pending_admin_review'];
		if (current.status !== targetStatus && !allowedFrom.includes(current.status)) {
			throw new RequestAdminError('REQUEST_TRANSITION_REJECTED');
		}
		return this.execute({
			actor: input.actor,
			scope: 'admin:individual-request-transition',
			idempotencyKey: input.idempotencyKey,
			payload: {
				requestId: input.requestId,
				action: input.action,
				reason: input.reason.trim(),
			},
			resultRef: `individual-request:${input.requestId}:${targetStatus}`,
			requestId: input.requestIdHeader,
			targetKind: 'individual_request',
			targetId: input.requestId,
			action: `individual_request.${targetStatus}`,
			safeDiff: { status: targetStatus },
			now: input.now,
			statements: () => [
				{
					sql: `UPDATE individual_requests SET status = ?, admin_decision = ?,
						admin_notes = ?, reviewed_by = ?, reviewed_at = ?,
						version = version + 1, updated_at = ?
					WHERE id = ? AND status = ? AND ${ACTIVE_ADMIN_SQL}`,
					params: [
						targetStatus,
						targetStatus,
						input.reason.trim(),
						input.actor.id,
						input.now,
						input.now,
						input.requestId,
						current.status,
						input.actor.id,
					],
				},
			],
			assertionSql: `EXISTS (SELECT 1 FROM individual_requests
				WHERE id = ? AND status = ? AND reviewed_by = ?)`,
			assertionParams: [input.requestId, targetStatus, input.actor.id],
		});
	}

	async attestDocument(input: {
		actor: AdminActor;
		documentId: string;
		documentSha256: string;
		outcome: 'clean' | 'infected';
		scannerLabel: string;
		scannerVersion: string;
		attestationTextVersion: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		if (input.attestationTextVersion !== this.documentConfig.avAttestationTextVersion) {
			throw new RequestAdminError('DOCUMENT_ATTESTATION_VERSION_MISMATCH');
		}
		const targetStatus = input.outcome;
		return this.execute({
			actor: input.actor,
			scope: 'admin:document-scan-attestation',
			idempotencyKey: input.idempotencyKey,
			payload: {
				documentId: input.documentId,
				documentSha256: input.documentSha256,
				outcome: input.outcome,
				scannerLabel: input.scannerLabel.trim(),
				scannerVersion: input.scannerVersion.trim(),
				attestationTextVersion: input.attestationTextVersion,
			},
			resultRef: `authorization-document:${input.documentId}:${targetStatus}`,
			requestId: input.requestId,
			targetKind: 'authorization_document',
			targetId: input.documentId,
			action: `authorization_document.scan_${targetStatus}`,
			safeDiff: {
				status: targetStatus,
				scanMethod: 'manual_local_av',
				attestationTextVersion: input.attestationTextVersion,
			},
			now: input.now,
			statements: () => [
				{
					sql: `UPDATE authorization_documents SET review_status = ?,
						scan_method = 'manual_local_av', scanner_label = ?, scanner_version = ?,
						scan_attested_by_admin_user_id = ?, scan_attestation_text_version = ?,
						scanned_at = ?, scan_attempts = scan_attempts + 1,
						quarantine_reason = CASE WHEN ? = 'infected' THEN 'local_av_alert'
							ELSE NULL END, updated_at = ?
					WHERE id = ? AND review_status = 'quarantined'
						AND sha256 = ? AND quarantine_downloaded_sha256 = sha256
						AND quarantine_downloaded_by_admin_user_id = ?
						AND download_audit_event_id IS NOT NULL
						AND quarantine_delete_state = 'present'
						AND ${ACTIVE_DOCUMENT_REVIEW_CONTEXT_SQL}
						AND ${PENDING_DOCUMENT_AUTHORIZATION_SQL}
						AND ${ACTIVE_ADMIN_SQL}`,
					params: [
						targetStatus,
						input.scannerLabel.trim(),
						input.scannerVersion.trim(),
						input.actor.id,
						input.attestationTextVersion,
						input.now,
						targetStatus,
						input.now,
						input.documentId,
						input.documentSha256,
						input.actor.id,
						input.actor.id,
					],
				},
			],
			evidenceStatements: (context) => [
				{
					sql: `INSERT INTO document_scan_attestations
						(id, document_id, document_sha256, admin_user_id, outcome,
						 scanner_label, scanner_version, attestation_text_version,
						 idempotency_record_id, audit_event_id, created_at)
					SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
					params: [
						crypto.randomUUID(),
						input.documentId,
						input.documentSha256,
						input.actor.id,
						input.outcome,
						input.scannerLabel.trim(),
						input.scannerVersion.trim(),
						input.attestationTextVersion,
						context.idempotencyRecordId,
						context.auditId,
						input.now,
						context.auditId,
					],
				},
			],
			assertionSql: `EXISTS (SELECT 1 FROM authorization_documents
				WHERE id = ? AND sha256 = ? AND review_status = ?
					AND scan_attested_by_admin_user_id = ?
					AND ${ACTIVE_DOCUMENT_REVIEW_CONTEXT_SQL}
					AND ${PENDING_DOCUMENT_AUTHORIZATION_SQL})`,
			assertionParams: [
				input.documentId,
				input.documentSha256,
				targetStatus,
				input.actor.id,
			],
		});
	}

	async reviewDocument(input: {
		actor: AdminActor;
		documentId: string;
		decision: 'approve' | 'reject';
		reason: string;
		archiveKey?: string;
		storageIntentId?: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		if (input.decision === 'approve' && !input.archiveKey) {
			throw new RequestAdminError('DOCUMENT_ARCHIVE_KEY_REQUIRED');
		}
		const targetStatus = input.decision === 'approve' ? 'approved' : 'rejected';
		return this.execute({
			actor: input.actor,
			scope: 'admin:document-business-review',
			idempotencyKey: input.idempotencyKey,
			payload: {
				documentId: input.documentId,
				decision: input.decision,
				reason: input.reason.trim(),
			},
			resultRef: `authorization-document:${input.documentId}:${targetStatus}`,
			requestId: input.requestId,
			targetKind: 'authorization_document',
			targetId: input.documentId,
			action: `authorization_document.${targetStatus}`,
			safeDiff: { status: targetStatus },
			now: input.now,
			statements: () => [
				{
					sql: `UPDATE authorization_documents SET review_status = ?,
						archive_r2_key = CASE WHEN ? = 'approved' THEN ? ELSE archive_r2_key END,
						quarantine_delete_state = CASE WHEN ? = 'approved'
							THEN 'delete_pending' ELSE quarantine_delete_state END,
						business_review_reason = ?, released_by = ?, released_at = ?, updated_at = ?
					WHERE id = ? AND review_status = 'clean'
						AND ${ACTIVE_DOCUMENT_REVIEW_CONTEXT_SQL}
						AND ${PENDING_DOCUMENT_AUTHORIZATION_SQL}
						AND ${ACTIVE_ADMIN_SQL}
						AND (? IS NULL OR EXISTS (SELECT 1 FROM storage_object_intents intent
							WHERE intent.id = ? AND intent.status = 'staged'
								AND intent.storage_class = 'archive'
								AND intent.object_key = ?))`,
					params: [
						targetStatus,
						targetStatus,
						input.archiveKey ?? null,
						targetStatus,
						input.reason.trim(),
						input.actor.id,
						input.now,
						input.now,
						input.documentId,
						input.actor.id,
						input.storageIntentId ?? null,
						input.storageIntentId ?? null,
						input.archiveKey ?? null,
					],
				},
				...(input.decision === 'approve' && input.storageIntentId ? [
					{
						sql: `UPDATE storage_object_intents SET status = 'linked', linked_at = ?,
							updated_at = ?, lease_owner = NULL, lease_until = NULL, last_error_code = NULL
						WHERE id = ? AND status = 'staged' AND object_key = ?
							AND EXISTS (SELECT 1 FROM authorization_documents
								WHERE id = ? AND archive_r2_key = ? AND review_status = 'approved')`,
						params: [input.now, input.now, input.storageIntentId, input.archiveKey!,
							input.documentId, input.archiveKey!],
					},
					{
						sql: `INSERT INTO storage_intent_link_assertions
							(id, intent_id, target_kind, target_id, assertion_passed, created_at)
						VALUES (?, ?, 'authorization_document_archive', ?, CASE WHEN
							EXISTS (SELECT 1 FROM storage_object_intents
								WHERE id = ? AND status = 'linked' AND object_key = ?)
							AND EXISTS (SELECT 1 FROM authorization_documents
								WHERE id = ? AND archive_r2_key = ? AND review_status = 'approved')
						THEN 1 ELSE 0 END, ?)`,
						params: [crypto.randomUUID(), input.storageIntentId, input.documentId,
							input.storageIntentId, input.archiveKey!, input.documentId,
							input.archiveKey!, input.now],
					},
				] : []),
				...(input.decision === 'reject'
					? [
							{
								sql: `UPDATE individual_requests SET status = 'needs_documents',
									admin_decision = 'needs_documents', admin_notes = ?,
									reviewed_by = ?, reviewed_at = ?, version = version + 1,
									updated_at = ?
								WHERE id = (SELECT authorization.request_id
									FROM authorization_documents AS document
									JOIN funding_authorizations AS authorization
										ON authorization.id = document.authorization_id
									WHERE document.id = ?)
									AND status = 'pending_admin_review' AND ${ACTIVE_ADMIN_SQL}`,
								params: [
									input.reason.trim(),
									input.actor.id,
									input.now,
									input.now,
									input.documentId,
									input.actor.id,
								],
							},
						]
					: []),
			],
			assertionSql: `EXISTS (SELECT 1 FROM authorization_documents
				WHERE id = ? AND review_status = ? AND released_by = ?
					AND ${ACTIVE_DOCUMENT_REVIEW_CONTEXT_SQL}
					AND ${PENDING_DOCUMENT_AUTHORIZATION_SQL})
				AND (? IS NULL OR EXISTS (SELECT 1 FROM storage_object_intents
					WHERE id = ? AND status = 'linked' AND object_key = ?))`,
			assertionParams: [input.documentId, targetStatus, input.actor.id,
				input.storageIntentId ?? null, input.storageIntentId ?? null, input.archiveKey ?? null],
		});
	}

	async loadCleanDocumentForArchive(documentId: string) {
		const document = await this.db.first<{
			id: string;
			quarantine_r2_key: string;
			archive_r2_key: string | null;
			sha256: string;
			size_bytes: number;
			review_status: string;
		}>({
			sql: `SELECT id, quarantine_r2_key, archive_r2_key, sha256, size_bytes, review_status
				FROM authorization_documents WHERE id = ?
					AND ${ACTIVE_DOCUMENT_REVIEW_CONTEXT_SQL}
					AND ((review_status = 'approved' AND archive_r2_key IS NOT NULL)
						OR (review_status = 'clean' AND quarantine_delete_state = 'present'
							AND ${PENDING_DOCUMENT_AUTHORIZATION_SQL}))`,
			params: [documentId],
		});
		if (!document) throw new RequestAdminError('DOCUMENT_NOT_CLEAN');
		return document;
	}

	loadDocumentArchiveState(documentId: string) {
		return this.db.first<{
			id: string;
			archive_r2_key: string | null;
			review_status: string;
		}>({
			sql: `SELECT id, archive_r2_key, review_status
				FROM authorization_documents WHERE id = ?`,
			params: [documentId],
		});
	}

	async reviewAuthorization(input: {
		actor: AdminActor;
		authorizationId: string;
		action: 'approve' | 'reject' | 'revoke';
		kind?: 'jobcenter' | 'socialamt';
		validFrom?: string;
		validUntil?: string;
		reason: string;
		idempotencyKey: string;
		requestIdHeader: string;
		now: string;
		currentDate: string;
	}) {
		const authorization = await this.db.first<{
			id: string;
			request_id: string;
			status: string;
			supersedes_authorization_id: string | null;
			review_context_allowed: number;
		}>({
			sql: `SELECT id, request_id, status, supersedes_authorization_id,
				CASE WHEN ${ACTIVE_AUTHORIZATION_REVIEW_CONTEXT_SQL}
					THEN 1 ELSE 0 END AS review_context_allowed
				FROM funding_authorizations WHERE id = ?`,
			params: [input.authorizationId],
		});
		if (!authorization) throw new RequestAdminError('AUTHORIZATION_NOT_FOUND');
		if (authorization.review_context_allowed !== 1) {
			throw new RequestAdminError('AUTHORIZATION_TRANSITION_REJECTED');
		}
		const targetStatus = input.action === 'approve' ? 'approved' : input.action === 'reject' ? 'rejected' : 'revoked';
		const expectedStatus = input.action === 'revoke' ? 'approved' : 'pending_review';
		if (authorization.status !== targetStatus && authorization.status !== expectedStatus) {
			throw new RequestAdminError('AUTHORIZATION_TRANSITION_REJECTED');
		}

		const supersededId =
			input.action === 'approve' ? authorization.supersedes_authorization_id : null;
		const eventKind = input.action === 'revoke' ? 'revoked' : supersededId ? 'superseded' : null;
		const consequence = eventKind
			? await this.fundingContributor.contribute({
					authorizationId: supersededId ?? input.authorizationId,
					requestId: authorization.request_id,
					eventKind,
					effectiveOn: input.currentDate,
					reason: input.reason.trim(),
					actorUserId: input.actor.id,
					now: input.now,
				})
			: null;
		return this.execute({
			actor: input.actor,
			scope: 'admin:funding-authorization-transition',
			idempotencyKey: input.idempotencyKey,
			payload: {
				authorizationId: input.authorizationId,
				action: input.action,
				kind: input.kind ?? null,
				validFrom: input.validFrom ?? null,
				validUntil: input.validUntil ?? null,
				reason: input.reason.trim(),
			},
			resultRef: `funding-authorization:${input.authorizationId}:${targetStatus}`,
			requestId: input.requestIdHeader,
			targetKind: 'funding_authorization',
			targetId: input.authorizationId,
			action: `funding_authorization.${targetStatus}`,
			safeDiff: {
				status: targetStatus,
				...(input.action === 'approve'
					? { kind: input.kind, validFrom: input.validFrom, validUntil: input.validUntil }
					: {}),
				...(consequence?.safeSummary ?? {}),
			},
			now: input.now,
			statements: () => [
				...(supersededId
					? [
							{
								sql: `UPDATE funding_authorizations SET status = 'superseded',
									decision_notes = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
								WHERE id = ? AND status = 'approved' AND ${ACTIVE_ADMIN_SQL}`,
								params: [
									input.reason.trim(),
									input.actor.id,
									input.now,
									input.now,
									supersededId,
									input.actor.id,
								],
							},
						]
					: []),
				{
					sql: `UPDATE funding_authorizations SET status = ?,
						kind = CASE WHEN ? = 'approved' THEN ? ELSE kind END,
						valid_from = CASE WHEN ? = 'approved' THEN ? ELSE valid_from END,
						valid_until = CASE WHEN ? = 'approved' THEN ? ELSE valid_until END,
						decision_notes = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
					WHERE id = ? AND status = ?
						AND ${ACTIVE_AUTHORIZATION_REVIEW_CONTEXT_SQL}
						AND ${ACTIVE_ADMIN_SQL}`,
					params: [
						targetStatus,
						targetStatus,
						input.kind ?? null,
						targetStatus,
						input.validFrom ?? null,
						targetStatus,
						input.validUntil ?? null,
						input.reason.trim(),
						input.actor.id,
						input.now,
						input.now,
						input.authorizationId,
						expectedStatus,
						input.actor.id,
					],
				},
				...(consequence?.statements ?? []),
			],
			evidenceStatements: eventKind
				? (context) => [
						{
							sql: `INSERT INTO funding_lifecycle_events
								(id, authorization_id, request_id, event_kind, effective_on,
								 reason, actor_user_id, audit_event_id, created_at)
							SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
							WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
							params: [
								crypto.randomUUID(),
								supersededId ?? input.authorizationId,
								authorization.request_id,
								eventKind,
								input.currentDate,
								input.reason.trim(),
								input.actor.id,
								context.auditId,
								input.now,
								context.auditId,
							],
						},
					]
				: undefined,
			assertionSql: `EXISTS (SELECT 1 FROM funding_authorizations
				WHERE id = ? AND status = ? AND reviewed_by = ?
					AND ${ACTIVE_AUTHORIZATION_REVIEW_CONTEXT_SQL})
				AND (${consequence?.assertionSql ?? '1 = 1'})`,
			assertionParams: [
				input.authorizationId,
				targetStatus,
				input.actor.id,
				...(consequence?.assertionParams ?? []),
			],
		});
	}

	async assertEligibleForOffer(input: {
		requestId: string;
		plannedFrom: string;
		plannedUntilInclusive: string;
	}) {
		const assertion = fundingEligibilityAssertion(input);
		const row = await this.db.first<{ eligible: number }>({
			sql: `SELECT (${assertion.sql}) AS eligible`,
			params: assertion.params,
		});
		if (row?.eligible !== 1) throw new RequestAdminError('FUNDING_NOT_ELIGIBLE');
	}

	async processExpiredAuthorizations(input: { currentDate: string; now: string; limit?: number }) {
		const candidates = await this.db.all<{
			id: string;
			request_id: string;
			valid_until: string;
		}>({
			sql: `SELECT authorization.id, authorization.request_id, authorization.valid_until
				FROM funding_authorizations AS authorization
				WHERE authorization.status = 'approved' AND authorization.valid_until < ?
					AND NOT EXISTS (SELECT 1 FROM funding_lifecycle_events AS event
						WHERE event.authorization_id = authorization.id
							AND event.event_kind = 'expired')
				ORDER BY authorization.valid_until, authorization.id LIMIT ?`,
			params: [input.currentDate, Math.min(Math.max(input.limit ?? 100, 1), 100)],
		});
		let processed = 0;
		for (const authorization of candidates.results) {
			const effectiveOn = new Date(
				Date.parse(`${authorization.valid_until}T00:00:00.000Z`) + 86_400_000
			).toISOString().slice(0, 10);
			const consequence = await this.fundingContributor.contribute({
				authorizationId: authorization.id,
				requestId: authorization.request_id,
				eventKind: 'expired',
				effectiveOn,
				reason: 'authorization_validity_ended',
				actorUserId: null,
				now: input.now,
			});
			const auditId = crypto.randomUUID();
			const eventId = crypto.randomUUID();
			try {
				await this.db.batch([
					{
						sql: `INSERT INTO audit_events
							(id, actor_user_id, actor_kind, action, target_kind, target_id,
							 request_id, safe_diff_json, created_at)
						SELECT ?, NULL, 'system', 'funding_authorization.expired',
							'funding_authorization', authorization.id, ?, ?, ?
						FROM funding_authorizations AS authorization
						WHERE authorization.id = ? AND authorization.status = 'approved'
							AND authorization.valid_until < ?
							AND NOT EXISTS (SELECT 1 FROM funding_lifecycle_events AS event
								WHERE event.authorization_id = authorization.id
									AND event.event_kind = 'expired')`,
						params: [auditId, `funding-expiry:${authorization.id}`,
							JSON.stringify({ effectiveOn, ...consequence.safeSummary }), input.now,
							authorization.id, input.currentDate],
					},
					...consequence.statements,
					{
						sql: `INSERT INTO funding_lifecycle_events
							(id, authorization_id, request_id, event_kind, effective_on,
							 reason, actor_user_id, audit_event_id, created_at)
						SELECT ?, ?, ?, 'expired', ?, 'authorization_validity_ended',
							NULL, ?, ? WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
							AND (${consequence.assertionSql})`,
						params: [eventId, authorization.id, authorization.request_id, effectiveOn,
							auditId, input.now, auditId, ...consequence.assertionParams],
					},
					{
						sql: `INSERT INTO funding_action_assertions
							(id, authorization_id, action, actor_user_id, audit_event_id,
							 assertion_passed, created_at)
						VALUES (?, ?, 'expired', NULL, ?, CASE WHEN
							EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
							AND EXISTS (SELECT 1 FROM funding_lifecycle_events WHERE id = ?)
							AND (${consequence.assertionSql}) THEN 1 ELSE 0 END, ?)`,
						params: [crypto.randomUUID(), authorization.id, auditId, auditId, eventId,
							...consequence.assertionParams, input.now],
					},
				]);
				processed += 1;
			} catch {
				// A concurrent delivery may have completed the same immutable event.
			}
		}
		return { candidates: candidates.results.length, processed };
	}

	async listAdminRequests(input: { q: string; status: string; kind: string }) {
		const q = input.q.toLocaleLowerCase('de-DE');
		const rows = await this.db.all<{
			id: string;
			request_kind: string;
			funding_kind: string;
			status: string;
			subjects_raw: string;
			preferred_format: string;
			unit_rate_cents: number;
			parent_payable: number;
			child_name: string;
			authorization_id: string | null;
			authorization_status: string | null;
			authorization_kind: string | null;
			valid_from: string | null;
			valid_until: string | null;
		}>({
			sql: `SELECT request.id, request.request_kind, request.funding_kind,
				request.status, request.subjects_raw, request.preferred_format,
				request.unit_rate_cents, request.parent_payable,
				child.full_name AS child_name,
				authorization.id AS authorization_id,
				authorization.status AS authorization_status,
				authorization.kind AS authorization_kind,
				authorization.valid_from, authorization.valid_until
			FROM individual_requests AS request
			JOIN children AS child ON child.id = request.child_id
			JOIN users AS owner ON owner.id = request.user_id
			LEFT JOIN funding_authorizations AS authorization
				ON authorization.request_id = request.id
				AND authorization.status IN ('pending_review', 'approved')
			WHERE owner.account_status = 'active'
				AND NOT EXISTS (SELECT 1 FROM legal_archive_records archive
					WHERE (archive.target_kind = 'funding_authorization'
						AND EXISTS (SELECT 1 FROM funding_authorizations archived_authorization
							WHERE archived_authorization.request_id = request.id
								AND archived_authorization.id = archive.target_id))
						OR (archive.target_kind = 'authorization_document'
							AND EXISTS (SELECT 1 FROM authorization_documents archived_document
								JOIN funding_authorizations archived_authorization
									ON archived_authorization.id = archived_document.authorization_id
								WHERE archived_authorization.request_id = request.id
									AND archived_document.id = archive.target_id)))
				AND (? = '' OR request.status = ?)
				AND (? = '' OR request.request_kind = ?)
				AND (? = '' OR lower(child.full_name) LIKE ?
					OR lower(request.subjects_raw) LIKE ? OR request.id = ?)
			ORDER BY CASE request.status WHEN 'pending_admin_review' THEN 1
				WHEN 'needs_documents' THEN 2 ELSE 3 END,
				request.updated_at, request.id LIMIT 100`,
			params: [
				input.status,
				input.status,
				input.kind,
				input.kind,
				q,
				`%${q}%`,
				`%${q}%`,
				input.q,
			],
		});
		return rows.results;
	}
}

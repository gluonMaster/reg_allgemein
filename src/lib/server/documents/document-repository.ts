import { hashCanonical } from '$lib/server/import/canonical';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import type { ValidatedUpload } from './validation';

export class DocumentRepositoryError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'DocumentRepositoryError';
	}
}

export interface DocumentMutationGuard {
	assertion(input: { documentId: string; operation: 'replace' | 'delete' }): {
		sql: string;
		params: readonly unknown[];
	};
}

export const stage08DocumentMutationGuard: DocumentMutationGuard = {
	assertion: () => ({ sql: '1 = 1', params: [] }),
};

export interface UploadTarget {
	requestId: string;
	requestStatus: string;
	userId: string;
	childId: string;
	sourceAuthorizationId: string;
	targetAuthorizationId: string;
	authorizationKind: 'jobcenter' | 'socialamt';
	createAuthorizationVersion: number | null;
	replaceDocument: {
		id: string;
		status: string;
		quarantineKey: string;
		authorizationId: string;
		sizeBytes: number;
	} | null;
	currentCount: number;
	currentBytes: number;
}

interface InternalDocumentRow {
	id: string;
	authorization_id: string;
	request_id: string;
	user_id: string;
	child_id: string;
	quarantine_r2_key: string;
	archive_r2_key: string | null;
	sha256: string;
	size_bytes: number;
	review_status: string;
	quarantine_delete_state: 'present' | 'delete_pending' | 'deleted';
}

export class AuthorizationDocumentRepository {
	constructor(
		private readonly db: DatabaseBoundary,
		private readonly mutationGuard: DocumentMutationGuard = stage08DocumentMutationGuard
	) {}

	async findUploadReplay(userId: string, idempotencyKey: string) {
		return this.db.first<{
			id: string;
			upload_request_hash_sha256: string;
			quarantine_r2_key: string;
		}>({
			sql: `SELECT id, upload_request_hash_sha256, quarantine_r2_key
				FROM authorization_documents WHERE user_id = ? AND upload_idempotency_key = ?`,
			params: [userId, idempotencyKey],
		});
	}

	async loadUploadTarget(input: {
		userId: string;
		requestId: string;
		authorizationId: string;
		replaceDocumentId?: string;
	}): Promise<UploadTarget> {
		const authorization = await this.db.first<{
			id: string;
			request_id: string;
			user_id: string;
			child_id: string;
			version: number;
			kind: 'jobcenter' | 'socialamt';
			status: 'pending_review' | 'approved';
			request_status: string;
		}>({
			sql: `SELECT authorization.id, authorization.request_id, authorization.user_id,
				authorization.child_id, authorization.version, authorization.kind,
				authorization.status, request.status AS request_status
			FROM funding_authorizations AS authorization
			JOIN individual_requests AS request ON request.id = authorization.request_id
			JOIN users AS owner ON owner.id = authorization.user_id
			JOIN children AS child ON child.id = authorization.child_id
				AND child.owner_user_id = owner.id
				AND child.family_number_id = owner.family_number_id
			WHERE authorization.id = ? AND authorization.request_id = ?
				AND authorization.user_id = ? AND authorization.status IN ('pending_review', 'approved')
				AND request.status IN ('draft', 'needs_documents', 'needs_info',
					'pending_admin_review', 'approved')
				AND owner.role = 'parent' AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL`,
			params: [input.authorizationId, input.requestId, input.userId],
		});
		if (!authorization) throw new DocumentRepositoryError('DOCUMENT_UPLOAD_SCOPE_REJECTED');

		let replaceDocument: UploadTarget['replaceDocument'] = null;
		if (input.replaceDocumentId) {
			const document = await this.db.first<{
				id: string;
				review_status: string;
				quarantine_r2_key: string;
				authorization_id: string;
				size_bytes: number;
			}>({
				sql: `SELECT document.id, document.review_status, document.quarantine_r2_key,
					document.authorization_id, document.size_bytes
				FROM authorization_documents AS document
				JOIN funding_authorizations AS existing
					ON existing.id = document.authorization_id
				WHERE document.id = ? AND document.user_id = ?
					AND existing.request_id = ? AND document.deleted_at IS NULL
					AND document.replaced_by_document_id IS NULL`,
				params: [input.replaceDocumentId, input.userId, input.requestId],
			});
			if (!document || document.authorization_id !== authorization.id) {
				throw new DocumentRepositoryError('DOCUMENT_REPLACEMENT_REJECTED');
			}
			replaceDocument = {
				id: document.id,
				status: document.review_status,
				quarantineKey: document.quarantine_r2_key,
				authorizationId: document.authorization_id,
				sizeBytes: document.size_bytes,
			};
		}

		let targetAuthorizationId = authorization.id;
		let createAuthorizationVersion: number | null = null;
		if (authorization.status === 'approved') {
			if (!replaceDocument || replaceDocument.status !== 'approved') {
				throw new DocumentRepositoryError('APPROVED_AUTHORIZATION_IMMUTABLE');
			}
			const pending = await this.db.first<{ id: string; version: number }>({
				sql: `SELECT id, version FROM funding_authorizations
					WHERE request_id = ? AND status = 'pending_review'
						AND supersedes_authorization_id = ? LIMIT 1`,
				params: [authorization.request_id, authorization.id],
			});
			if (pending) {
				targetAuthorizationId = pending.id;
			} else {
				targetAuthorizationId = crypto.randomUUID();
				createAuthorizationVersion = authorization.version + 1;
			}
		} else if (replaceDocument?.status === 'approved') {
			throw new DocumentRepositoryError('DOCUMENT_REPLACEMENT_REJECTED');
		}

		const totals = await this.db.first<{ count: number; bytes: number }>({
			sql: `SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
				FROM authorization_documents WHERE authorization_id = ?
					AND deleted_at IS NULL AND replaced_by_document_id IS NULL`,
			params: [targetAuthorizationId],
		});
		return {
			requestId: authorization.request_id,
			requestStatus: authorization.request_status,
			userId: authorization.user_id,
			childId: authorization.child_id,
			sourceAuthorizationId: authorization.id,
			targetAuthorizationId,
			authorizationKind: authorization.kind,
			createAuthorizationVersion,
			replaceDocument,
			currentCount: totals?.count ?? 0,
			currentBytes: totals?.bytes ?? 0,
		};
	}

	async persistUpload(input: {
		target: UploadTarget;
		documentId: string;
		quarantineKey: string;
		validated: ValidatedUpload;
		maxFilesPerAuthorization: number;
		maxAuthorizationBytes: number;
		idempotencyKey: string;
		requestHash: string;
		requestIdHeader: string;
		now: string;
		quarantineExpiresAt: string;
		storageIntentId?: string;
	}) {
		const auditId = crypto.randomUUID();
		const assertionId = crypto.randomUUID();
		const replacementGuard = input.target.replaceDocument
			? this.mutationGuard.assertion({
					documentId: input.target.replaceDocument.id,
					operation: 'replace',
				})
			: { sql: '1 = 1', params: [] as readonly unknown[] };
		const statements: StatementSpec[] = [];
		if (input.target.createAuthorizationVersion !== null) {
			statements.push({
				sql: `INSERT INTO funding_authorizations
					(id, request_id, user_id, child_id, version, kind, status,
					 valid_from, valid_until, supersedes_authorization_id,
					 decision_notes, reviewed_by, reviewed_at, created_at, updated_at)
				SELECT ?, request_id, user_id, child_id, ?, kind, 'pending_review',
					NULL, NULL, id, NULL, NULL, NULL, ?, ?
				FROM funding_authorizations WHERE id = ? AND status = 'approved'
					AND (${replacementGuard.sql})`,
				params: [
					input.target.targetAuthorizationId,
					input.target.createAuthorizationVersion,
					input.now,
					input.now,
					input.target.sourceAuthorizationId,
					...replacementGuard.params,
				],
			});
		}
		statements.push({
			sql: `INSERT INTO authorization_documents
				(id, authorization_id, user_id, child_id, quarantine_r2_key,
				 archive_r2_key, original_extension, mime_type, detected_type,
				 size_bytes, sha256, review_status, upload_idempotency_key,
				 upload_request_hash_sha256, uploaded_at, quarantine_expires_at,
				 quarantine_delete_state, created_at, updated_at)
			SELECT ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'quarantined', ?, ?, ?, ?,
				'present', ?, ? WHERE (${replacementGuard.sql})
					AND (? IS NULL OR EXISTS (SELECT 1 FROM storage_object_intents intent
						WHERE intent.id = ? AND intent.status = 'staged'
							AND intent.storage_class = 'quarantine'
							AND intent.object_key = ?))
					AND (SELECT COUNT(*) FROM authorization_documents AS current
						WHERE current.authorization_id = ? AND current.deleted_at IS NULL
							AND current.replaced_by_document_id IS NULL
							AND (? IS NULL OR current.id <> ?)) < ?
					AND COALESCE((SELECT SUM(current.size_bytes)
						FROM authorization_documents AS current
						WHERE current.authorization_id = ? AND current.deleted_at IS NULL
							AND current.replaced_by_document_id IS NULL
							AND (? IS NULL OR current.id <> ?)), 0) + ? <= ?`,
			params: [
				input.documentId,
				input.target.targetAuthorizationId,
				input.target.userId,
				input.target.childId,
				input.quarantineKey,
				input.validated.extension,
				input.validated.mimeType,
				input.validated.detectedType,
				input.validated.sizeBytes,
				input.validated.sha256,
				input.idempotencyKey,
				input.requestHash,
				input.now,
				input.quarantineExpiresAt,
				input.now,
				input.now,
				...replacementGuard.params,
				input.storageIntentId ?? null,
				input.storageIntentId ?? null,
				input.quarantineKey,
				input.target.targetAuthorizationId,
				input.target.replaceDocument?.id ?? null,
				input.target.replaceDocument?.id ?? null,
				input.maxFilesPerAuthorization,
				input.target.targetAuthorizationId,
				input.target.replaceDocument?.id ?? null,
				input.target.replaceDocument?.id ?? null,
				input.validated.sizeBytes,
				input.maxAuthorizationBytes,
			],
		});
		if (input.storageIntentId) {
			statements.push(
				{
					sql: `UPDATE storage_object_intents SET status = 'linked', linked_at = ?,
						updated_at = ?, lease_owner = NULL, lease_until = NULL, last_error_code = NULL
					WHERE id = ? AND status = 'staged' AND object_key = ?
						AND EXISTS (SELECT 1 FROM authorization_documents
							WHERE id = ? AND quarantine_r2_key = ?)`,
					params: [
						input.now,
						input.now,
						input.storageIntentId,
						input.quarantineKey,
						input.documentId,
						input.quarantineKey,
					],
				},
				{
					sql: `INSERT INTO storage_intent_link_assertions
						(id, intent_id, target_kind, target_id, assertion_passed, created_at)
					VALUES (?, ?, 'authorization_document', ?, CASE WHEN
						EXISTS (SELECT 1 FROM storage_object_intents
							WHERE id = ? AND status = 'linked' AND object_key = ?)
						AND EXISTS (SELECT 1 FROM authorization_documents
							WHERE id = ? AND quarantine_r2_key = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						crypto.randomUUID(),
						input.storageIntentId,
						input.documentId,
						input.storageIntentId,
						input.quarantineKey,
						input.documentId,
						input.quarantineKey,
						input.now,
					],
				}
			);
		}
		if (input.target.replaceDocument && input.target.replaceDocument.status !== 'approved') {
			statements.push({
				sql: `UPDATE authorization_documents
					SET replaced_by_document_id = ?, review_status = 'deleted',
						deleted_at = ?, updated_at = ?
				WHERE id = ? AND user_id = ? AND review_status IN
					('quarantined', 'clean', 'infected', 'rejected')
					AND replaced_by_document_id IS NULL AND deleted_at IS NULL
					AND (${replacementGuard.sql})`,
				params: [
					input.documentId,
					input.now,
					input.now,
					input.target.replaceDocument.id,
					input.target.userId,
					...replacementGuard.params,
				],
			});
		}
		statements.push(
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
				SELECT ?, ?, 'user', 'authorization_document.uploaded',
					'authorization_document', id, ?, ?, ?
				FROM authorization_documents WHERE id = ? AND user_id = ?
					AND review_status = 'quarantined'`,
				params: [
					auditId,
					input.target.userId,
					input.requestIdHeader,
					JSON.stringify({
						status: 'quarantined',
						detectedType: input.validated.detectedType,
						sizeBytes: input.validated.sizeBytes,
						sha256Prefix: input.validated.sha256.slice(0, 12),
					}),
					input.now,
					input.documentId,
					input.target.userId,
				],
			},
			{
				sql: `INSERT INTO document_action_assertions
					(id, document_id, action, actor_user_id, audit_event_id,
					 assertion_passed, created_at)
				VALUES (?, ?, 'uploaded', ?, ?, CASE WHEN
					EXISTS (SELECT 1 FROM authorization_documents
						WHERE id = ? AND user_id = ? AND review_status = 'quarantined')
					AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
				THEN 1 ELSE 0 END, ?)`,
				params: [
					assertionId,
					input.documentId,
					input.target.userId,
					auditId,
					input.documentId,
					input.target.userId,
					auditId,
					input.now,
				],
			}
		);
		try {
			// D1 batches are transactions. When the conditional insert loses a
			// concurrent limit race, the assertion rows below fail closed and roll
			// back every attempted document, intent-link, replacement, and audit row.
			await this.db.batch(statements);
		} catch (error) {
			const limitExceeded = await this.configuredLimitExceeded(input).catch(() => false);
			if (limitExceeded) {
				throw new DocumentRepositoryError('DOCUMENT_AUTHORIZATION_LIMIT_REJECTED');
			}
			throw error;
		}
	}

	private async configuredLimitExceeded(input: {
		target: UploadTarget;
		validated: ValidatedUpload;
		maxFilesPerAuthorization: number;
		maxAuthorizationBytes: number;
	}): Promise<boolean> {
		const totals = await this.db.first<{ count: number; bytes: number }>({
			sql: `SELECT COUNT(*) AS count, COALESCE(SUM(current.size_bytes), 0) AS bytes
				FROM authorization_documents AS current
				WHERE current.authorization_id = ? AND current.deleted_at IS NULL
					AND current.replaced_by_document_id IS NULL
					AND (? IS NULL OR current.id <> ?)`,
			params: [
				input.target.targetAuthorizationId,
				input.target.replaceDocument?.id ?? null,
				input.target.replaceDocument?.id ?? null,
			],
		});
		return (
			(totals?.count ?? 0) + 1 > input.maxFilesPerAuthorization ||
			(totals?.bytes ?? 0) + input.validated.sizeBytes > input.maxAuthorizationBytes
		);
	}

	private internalDocument(documentId: string): Promise<InternalDocumentRow | null> {
		return this.db.first<InternalDocumentRow>({
			sql: `SELECT document.id, document.authorization_id, authorization.request_id,
				document.user_id, document.child_id, document.quarantine_r2_key,
				document.archive_r2_key, document.sha256, document.size_bytes,
				document.review_status, document.quarantine_delete_state
			FROM authorization_documents AS document
			JOIN users AS owner ON owner.id = document.user_id
				AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
				AND owner.account_status = 'active' AND owner.is_blocked = 0
			JOIN funding_authorizations AS authorization ON authorization.id = document.authorization_id
			WHERE document.id = ?`,
			params: [documentId],
		});
	}

	async loadAdminQuarantineDownload(input: { documentId: string; adminUserId: string }) {
		const document = await this.db.first<InternalDocumentRow>({
			sql: `SELECT document.id, document.authorization_id, authorization.request_id,
				document.user_id, document.child_id, document.quarantine_r2_key,
				document.archive_r2_key, document.sha256, document.size_bytes,
				document.review_status, document.quarantine_delete_state
			FROM authorization_documents AS document
			JOIN funding_authorizations AS authorization
				ON authorization.id = document.authorization_id
				AND authorization.user_id = document.user_id
			JOIN individual_requests AS request
				ON request.id = authorization.request_id AND request.user_id = document.user_id
			JOIN users AS owner ON owner.id = document.user_id
			JOIN users AS admin ON admin.id = ?
			WHERE document.id = ? AND document.review_status = 'quarantined'
				AND document.quarantine_delete_state = 'present'
				AND document.deleted_at IS NULL AND document.replaced_by_document_id IS NULL
				AND owner.role = 'parent' AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND admin.role = 'admin'
				AND admin.account_status = 'active' AND admin.is_blocked = 0
				AND NOT EXISTS (SELECT 1 FROM legal_archive_records AS archive
					WHERE archive.target_kind = 'authorization_document'
						AND archive.target_id = document.id)`,
			params: [input.adminUserId, input.documentId],
		});
		if (!document) throw new DocumentRepositoryError('DOCUMENT_DOWNLOAD_REJECTED');
		return document;
	}

	async auditAdminQuarantineDownload(input: {
		documentId: string;
		adminUserId: string;
		purposeCode: 'local_av_scan';
		expectedSha256: string;
		expectedStorageKey: string;
		requestId: string;
		now: string;
	}) {
		const auditId = crypto.randomUUID();
		const assertionId = crypto.randomUUID();
		try {
			const results = await this.db.batch([
				{
					sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'authorization_document.quarantine_downloaded',
						'authorization_document', document.id, ?, ?, ?
					FROM authorization_documents AS document
					JOIN funding_authorizations AS authorization
						ON authorization.id = document.authorization_id
						AND authorization.user_id = document.user_id
					JOIN individual_requests AS request
						ON request.id = authorization.request_id AND request.user_id = document.user_id
					JOIN users AS owner ON owner.id = document.user_id
					JOIN users AS admin ON admin.id = ?
					WHERE document.id = ? AND document.review_status = 'quarantined'
						AND document.quarantine_delete_state = 'present'
						AND document.deleted_at IS NULL AND document.replaced_by_document_id IS NULL
						AND document.sha256 = ? AND document.quarantine_r2_key = ?
						AND owner.role = 'parent' AND owner.account_status = 'active'
						AND owner.is_blocked = 0 AND admin.role = 'admin'
						AND admin.account_status = 'active' AND admin.is_blocked = 0
						AND NOT EXISTS (SELECT 1 FROM legal_archive_records AS archive
							WHERE archive.target_kind = 'authorization_document'
								AND archive.target_id = document.id)`,
					params: [
						auditId,
						input.adminUserId,
						input.requestId,
						JSON.stringify({
							forcedAttachment: true,
							purposeCode: input.purposeCode,
							sha256Prefix: input.expectedSha256.slice(0, 12),
						}),
						input.now,
						input.adminUserId,
						input.documentId,
						input.expectedSha256,
						input.expectedStorageKey,
					],
				},
				{
					sql: `UPDATE authorization_documents
					SET quarantine_downloaded_by_admin_user_id = ?,
						quarantine_downloaded_sha256 = sha256,
						quarantine_downloaded_at = ?, download_audit_event_id = ?, updated_at = ?
					WHERE id = ? AND review_status = 'quarantined'
						AND quarantine_delete_state = 'present'
						AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
					params: [
						input.adminUserId,
						input.now,
						auditId,
						input.now,
						input.documentId,
						auditId,
					],
				},
				{
					sql: `INSERT INTO document_action_assertions
					(id, document_id, action, actor_user_id, audit_event_id,
					 assertion_passed, created_at)
				VALUES (?, ?, 'quarantine_downloaded', ?, ?, CASE WHEN
					EXISTS (SELECT 1 FROM authorization_documents
						WHERE id = ? AND download_audit_event_id = ?
							AND quarantine_downloaded_sha256 = sha256)
					AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
				THEN 1 ELSE 0 END, ?)`,
					params: [
						assertionId,
						input.documentId,
						input.adminUserId,
						auditId,
						input.documentId,
						auditId,
						auditId,
						input.now,
					],
				},
			]);
			if ((results[0]?.meta.changes ?? 0) !== 1) {
				throw new DocumentRepositoryError('DOCUMENT_DOWNLOAD_REJECTED');
			}
		} catch (error) {
			if (error instanceof DocumentRepositoryError) throw error;
			throw new DocumentRepositoryError('DOCUMENT_DOWNLOAD_REJECTED');
		}
	}

	async loadParentApprovedDownload(userId: string, documentId: string) {
		const document = await this.db.first<InternalDocumentRow>({
			sql: `SELECT document.id, document.authorization_id, authorization.request_id,
				document.user_id, document.child_id, document.quarantine_r2_key,
				document.archive_r2_key, document.sha256, document.size_bytes,
				document.review_status, document.quarantine_delete_state
			FROM authorization_documents AS document
			JOIN funding_authorizations AS authorization ON authorization.id = document.authorization_id
			JOIN individual_requests AS request ON request.id = authorization.request_id
			JOIN users AS owner ON owner.id = request.user_id
			WHERE document.id = ? AND document.user_id = ? AND request.user_id = ?
				AND document.review_status = 'approved' AND document.archive_r2_key IS NOT NULL
				AND document.deleted_at IS NULL AND owner.role = 'parent'
				AND owner.email_verified_at IS NOT NULL AND owner.account_status = 'active'
				AND owner.is_blocked = 0
				AND NOT EXISTS (SELECT 1 FROM legal_archive_records AS archive
					WHERE archive.target_kind = 'authorization_document'
						AND archive.target_id = document.id)`,
			params: [documentId, userId, userId],
		});
		if (!document) throw new DocumentRepositoryError('DOCUMENT_DOWNLOAD_REJECTED');
		return document;
	}

	async auditParentApprovedDownload(input: {
		documentId: string;
		userId: string;
		expectedSha256: string;
		expectedStorageKey: string;
		requestId: string;
		now: string;
	}) {
		const auditId = crypto.randomUUID();
		const assertionId = crypto.randomUUID();
		try {
			const results = await this.db.batch([
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'authorization_document.owner_downloaded',
						'authorization_document', document.id, ?, '{"forcedAttachment":true}', ?
					FROM authorization_documents AS document
					JOIN funding_authorizations AS authorization
						ON authorization.id = document.authorization_id
						AND authorization.user_id = document.user_id
					JOIN individual_requests AS request
						ON request.id = authorization.request_id AND request.user_id = document.user_id
					JOIN users AS owner ON owner.id = document.user_id
					WHERE document.id = ? AND document.user_id = ?
						AND document.review_status = 'approved'
						AND document.archive_r2_key = ? AND document.sha256 = ?
						AND document.deleted_at IS NULL AND owner.role = 'parent'
						AND owner.email_verified_at IS NOT NULL AND owner.account_status = 'active'
						AND owner.is_blocked = 0
						AND NOT EXISTS (SELECT 1 FROM legal_archive_records AS archive
							WHERE archive.target_kind = 'authorization_document'
								AND archive.target_id = document.id)`,
					params: [
						auditId,
						input.userId,
						input.requestId,
						input.now,
						input.documentId,
						input.userId,
						input.expectedStorageKey,
						input.expectedSha256,
					],
				},
				{
					sql: `INSERT INTO document_action_assertions
						(id, document_id, action, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, ?, 'owner_downloaded', ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						assertionId,
						input.documentId,
						input.userId,
						auditId,
						auditId,
						input.now,
					],
				},
			]);
			if ((results[0]?.meta.changes ?? 0) !== 1) {
				throw new DocumentRepositoryError('DOCUMENT_DOWNLOAD_REJECTED');
			}
		} catch (error) {
			if (error instanceof DocumentRepositoryError) throw error;
			throw new DocumentRepositoryError('DOCUMENT_DOWNLOAD_REJECTED');
		}
	}

	async deleteByParent(input: {
		routeRequestId: string;
		documentId: string;
		userId: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		const requestHash = await hashCanonical({
			routeRequestId: input.routeRequestId,
			documentId: input.documentId,
			action: 'delete',
		});
		const prior = await this.db.first<{ request_hash_sha256: string }>({
			sql: `SELECT action.request_hash_sha256 FROM request_parent_actions AS action
				JOIN users AS owner ON owner.id = action.user_id
				WHERE action.user_id = ? AND action.idempotency_key = ?
					AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
					AND owner.account_status = 'active' AND owner.is_blocked = 0`,
			params: [input.userId, input.idempotencyKey],
		});
		const document = await this.internalDocument(input.documentId);
		if (
			!document ||
			document.user_id !== input.userId ||
			document.request_id !== input.routeRequestId
		) {
			throw new DocumentRepositoryError('DOCUMENT_NOT_FOUND');
		}
		if (prior) {
			if (prior.request_hash_sha256 !== requestHash) {
				throw new DocumentRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			return { replayed: true, document };
		}
		if (document.review_status === 'approved') {
			throw new DocumentRepositoryError('DOCUMENT_DELETE_REJECTED');
		}
		const guard = this.mutationGuard.assertion({
			documentId: input.documentId,
			operation: 'delete',
		});
		const auditId = crypto.randomUUID();
		const actionId = crypto.randomUUID();
		const assertionId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `UPDATE authorization_documents
						SET review_status = 'deleted', deleted_at = ?, updated_at = ?
					WHERE id = ? AND user_id = ? AND review_status IN
						('quarantined', 'clean', 'infected', 'rejected')
						AND deleted_at IS NULL AND (${guard.sql})
						AND EXISTS (SELECT 1 FROM funding_authorizations AS authorization
							WHERE authorization.id = authorization_documents.authorization_id
								AND authorization.request_id = ?)
						AND EXISTS (SELECT 1 FROM users AS owner WHERE owner.id = ?
							AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
							AND owner.account_status = 'active' AND owner.is_blocked = 0)`,
					params: [input.now, input.now, input.documentId, input.userId,
						...guard.params, input.routeRequestId, input.userId],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'authorization_document.deleted_by_parent',
						'authorization_document', document.id, ?, '{"status":"deleted"}', ?
					FROM authorization_documents AS document
					WHERE document.id = ? AND document.user_id = ?
						AND document.review_status = 'deleted' AND (${guard.sql})
						AND EXISTS (SELECT 1 FROM funding_authorizations AS authorization
							WHERE authorization.id = document.authorization_id
								AND authorization.request_id = ?)`,
					params: [
						auditId,
						input.userId,
						input.requestId,
						input.now,
						input.documentId,
						input.userId,
						...guard.params,
						input.routeRequestId,
					],
				},
				{
					sql: `INSERT INTO request_parent_actions
						(id, request_id, user_id, action, from_status, to_status,
						 idempotency_key, request_hash_sha256, audit_event_id, created_at)
					SELECT ?, ?, ?, 'delete_document', request.status, request.status,
						?, ?, ?, ? FROM individual_requests AS request
					WHERE request.id = ? AND request.user_id = ?
						AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
					params: [
						actionId,
						input.routeRequestId,
						input.userId,
						input.idempotencyKey,
						requestHash,
						auditId,
						input.now,
						input.routeRequestId,
						input.userId,
						auditId,
					],
				},
				{
					sql: `INSERT INTO document_action_assertions
						(id, document_id, action, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, ?, 'deleted_by_parent', ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM authorization_documents AS document
							WHERE document.id = ? AND document.user_id = ?
								AND document.review_status = 'deleted'
								AND EXISTS (SELECT 1 FROM funding_authorizations AS authorization
									WHERE authorization.id = document.authorization_id
										AND authorization.request_id = ?))
						AND EXISTS (SELECT 1 FROM request_parent_actions WHERE id = ?)
						AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						assertionId,
						input.documentId,
						input.userId,
						auditId,
						input.documentId,
						input.userId,
						input.routeRequestId,
						actionId,
						auditId,
						input.now,
					],
				},
			]);
			return { replayed: false, document };
		} catch {
			const replay = await this.db.first<{ request_hash_sha256: string }>({
				sql: `SELECT action.request_hash_sha256 FROM request_parent_actions AS action
					JOIN users AS owner ON owner.id = action.user_id
					WHERE action.user_id = ? AND action.idempotency_key = ?
						AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
						AND owner.account_status = 'active' AND owner.is_blocked = 0`,
				params: [input.userId, input.idempotencyKey],
			});
			if (replay?.request_hash_sha256 === requestHash) return { replayed: true, document };
			throw new DocumentRepositoryError('DOCUMENT_DELETE_REJECTED');
		}
	}

	completeQuarantineDelete(documentId: string, now: string) {
		return this.db.run({
			sql: `UPDATE authorization_documents SET quarantine_delete_state = 'deleted',
				quarantine_purged_at = COALESCE(quarantine_purged_at, ?), updated_at = ?
			WHERE id = ? AND quarantine_delete_state = 'delete_pending'`,
			params: [now, now, documentId],
		});
	}

	async claimCleanup(now: string, limit = 100) {
		const candidates = await this.db.all<{
			id: string;
			quarantine_r2_key: string;
			review_status: string;
			quarantine_delete_state: string;
		}>({
			sql: `SELECT id, quarantine_r2_key, review_status, quarantine_delete_state
			FROM authorization_documents
			WHERE quarantine_delete_state = 'delete_pending'
				OR (quarantine_delete_state = 'present' AND (
					(review_status <> 'approved' AND quarantine_expires_at <= ?)
					OR (review_status = 'approved' AND archive_r2_key IS NOT NULL)
				))
			ORDER BY quarantine_expires_at, id LIMIT ?`,
			params: [now, Math.min(Math.max(limit, 1), 100)],
		});
		const claimed: Array<{ id: string; quarantineKey: string }> = [];
		for (const candidate of candidates.results) {
			if (candidate.quarantine_delete_state === 'delete_pending') {
				claimed.push({ id: candidate.id, quarantineKey: candidate.quarantine_r2_key });
				continue;
			}
			const auditId = crypto.randomUUID();
			const assertionId = crypto.randomUUID();
			try {
				await this.db.batch([
					{
						sql: `INSERT INTO audit_events
							(id, actor_user_id, actor_kind, action, target_kind, target_id,
							 request_id, safe_diff_json, created_at)
						SELECT ?, NULL, 'system', 'authorization_document.quarantine_cleanup',
							'authorization_document', id, ?, '{"bodyDelete":"claimed"}', ?
						FROM authorization_documents WHERE id = ?
							AND quarantine_delete_state = 'present'
							AND ((review_status <> 'approved' AND quarantine_expires_at <= ?)
								OR (review_status = 'approved' AND archive_r2_key IS NOT NULL))`,
						params: [
							auditId,
							`document-cleanup:${candidate.id}`,
							now,
							candidate.id,
							now,
						],
					},
					{
						sql: `UPDATE authorization_documents
							SET quarantine_delete_state = 'delete_pending',
								quarantine_cleanup_audit_event_id = ?, updated_at = ?
							WHERE id = ? AND quarantine_delete_state = 'present'
								AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
						params: [auditId, now, candidate.id, auditId],
					},
					{
						sql: `INSERT INTO document_action_assertions
							(id, document_id, action, actor_user_id, audit_event_id,
							 assertion_passed, created_at)
						VALUES (?, ?, 'quarantine_cleanup_claimed', NULL, ?, CASE WHEN
							EXISTS (SELECT 1 FROM authorization_documents
								WHERE id = ? AND quarantine_delete_state = 'delete_pending'
									AND quarantine_cleanup_audit_event_id = ?)
							AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
						THEN 1 ELSE 0 END, ?)`,
						params: [
							assertionId,
							candidate.id,
							auditId,
							candidate.id,
							auditId,
							auditId,
							now,
						],
					},
				]);
				claimed.push({ id: candidate.id, quarantineKey: candidate.quarantine_r2_key });
			} catch {
				// Another cleanup worker won the conditional claim.
			}
		}
		return claimed;
	}

	async listAdminDocuments(input: { q: string; status: string }) {
		const q = input.q.toLocaleLowerCase('de-DE');
		const rows = await this.db.all<{
			id: string;
			request_id: string;
			authorization_id: string;
			review_status: string;
			detected_type: string;
			size_bytes: number;
			sha256: string;
			uploaded_at: string;
			quarantine_expires_at: string;
			child_name: string;
			request_kind: string;
		}>({
			sql: `SELECT document.id, authorization.request_id, document.authorization_id,
				document.review_status, document.detected_type, document.size_bytes,
				document.sha256, document.uploaded_at, document.quarantine_expires_at,
				child.full_name AS child_name, request.request_kind
			FROM authorization_documents AS document
			JOIN users AS owner ON owner.id = document.user_id
				AND owner.account_status <> 'closed'
			JOIN funding_authorizations AS authorization ON authorization.id = document.authorization_id
			JOIN individual_requests AS request ON request.id = authorization.request_id
			JOIN children AS child ON child.id = document.child_id
			WHERE NOT EXISTS (SELECT 1 FROM legal_archive_records archive
					WHERE archive.target_kind = 'authorization_document'
						AND archive.target_id = document.id)
				AND (? = '' OR document.review_status = ?)
				AND (? = '' OR lower(child.full_name) LIKE ? OR document.id = ?
					OR authorization.request_id = ?)
			ORDER BY CASE document.review_status
				WHEN 'quarantined' THEN 1 WHEN 'clean' THEN 2 ELSE 3 END,
				document.uploaded_at, document.id LIMIT 100`,
			params: [input.status, input.status, q, `%${q}%`, input.q, input.q],
		});
		return rows.results;
	}
}

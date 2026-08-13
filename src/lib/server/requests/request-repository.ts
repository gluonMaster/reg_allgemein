import { hashCanonical } from '$lib/server/import/canonical';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import type { RequestCreateInput, RequestSaveInput } from './contracts';

export type IndividualRequestStatus =
	| 'draft'
	| 'submitted'
	| 'needs_documents'
	| 'needs_info'
	| 'pending_admin_review'
	| 'approved'
	| 'rejected'
	| 'cancelled';

export class IndividualRequestError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'IndividualRequestError';
	}
}

export interface RequestMutationGuard {
	assertion(input: { requestId: string; operation: 'cancel' }): {
		sql: string;
		params: readonly unknown[];
	};
}

export const stage08RequestMutationGuard: RequestMutationGuard = {
	assertion: () => ({ sql: '1 = 1', params: [] }),
};

interface RequestRow {
	id: string;
	user_id: string;
	child_id: string;
	request_kind: 'nachhilfe' | 'individual';
	funding_kind: 'self_pay' | 'jobcenter' | 'socialamt' | 'unknown';
	subjects_raw: string;
	description: string;
	preferred_days_json: string;
	preferred_time_windows_json: string;
	preferred_format: 'online' | 'onsite' | 'mixed';
	preferred_locations_json: string;
	unit_rate_cents: number;
	parent_payable: 0 | 1;
	status: IndividualRequestStatus;
	version: number;
	child_name: string;
}

interface PriorRequestAction {
	request_id: string;
	action: 'save' | 'submit' | 'cancel' | 'delete_document';
	request_hash_sha256: string;
	to_status: string;
}

function requestPayload(input: RequestCreateInput | RequestSaveInput) {
	return {
		childId: input.childId,
		requestKind: input.requestKind,
		fundingKind: input.fundingKind,
		subjects: input.subjects,
		description: input.description,
		preferredDays: [...new Set(input.preferredDays)].sort(),
		preferredTimeWindows: input.preferredTimeWindows,
		preferredFormat: input.preferredFormat,
		preferredLocations: input.preferredLocations,
	};
}

export class IndividualRequestRepository {
	constructor(
		private readonly db: DatabaseBoundary,
		private readonly mutationGuard: RequestMutationGuard = stage08RequestMutationGuard
	) {}

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

	private async priorCreate(userId: string, key: string) {
		return this.db.first<{ id: string; create_request_hash_sha256: string }>({
			sql: `SELECT request.id, request.create_request_hash_sha256
				FROM individual_requests AS request
				JOIN users AS owner ON owner.id = request.user_id
				WHERE request.user_id = ? AND request.create_idempotency_key = ?
					AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
					AND owner.account_status = 'active' AND owner.is_blocked = 0`,
			params: [userId, key],
		});
	}

	async createDraft(input: {
		userId: string;
		payload: RequestCreateInput;
		unitRateCents: number;
		requestId: string;
		now: string;
	}) {
		const payload = requestPayload(input.payload);
		const requestHash = await hashCanonical(payload);
		const prior = await this.priorCreate(input.userId, input.payload.idempotencyKey);
		if (prior) {
			if (prior.create_request_hash_sha256 !== requestHash) {
				throw new IndividualRequestError('IDEMPOTENCY_KEY_REUSED');
			}
			return { requestId: prior.id, replayed: true };
		}

		const id = crypto.randomUUID();
		const authorizationId =
			input.payload.requestKind === 'nachhilfe' ? crypto.randomUUID() : null;
		const auditId = crypto.randomUUID();
		const assertionId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO individual_requests
						(id, user_id, child_id, request_kind, funding_kind, subjects_raw,
						 description, preferred_days_json, preferred_time_windows_json,
						 preferred_format, preferred_locations_json, unit_rate_cents,
						 parent_payable, status, version, create_idempotency_key,
						 create_request_hash_sha256, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?)`,
					params: [
						id,
						input.userId,
						payload.childId,
						payload.requestKind,
						payload.fundingKind,
						payload.subjects,
						payload.description,
						JSON.stringify(payload.preferredDays),
						JSON.stringify(payload.preferredTimeWindows),
						payload.preferredFormat,
						JSON.stringify(payload.preferredLocations),
						input.unitRateCents,
						Number(payload.requestKind === 'individual'),
						input.payload.idempotencyKey,
						requestHash,
						input.now,
						input.now,
					],
				},
				...(authorizationId
					? [
							{
								sql: `INSERT INTO funding_authorizations
									(id, request_id, user_id, child_id, version, kind, status,
									 valid_from, valid_until, supersedes_authorization_id,
									 decision_notes, reviewed_by, reviewed_at, created_at, updated_at)
								VALUES (?, ?, ?, ?, 1, ?, 'pending_review', NULL, NULL, NULL,
									NULL, NULL, NULL, ?, ?)`,
								params: [
									authorizationId,
									id,
									input.userId,
									payload.childId,
									payload.fundingKind,
									input.now,
									input.now,
								],
							},
						]
					: []),
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'individual_request.created', 'individual_request',
						id, ?, ?, ? FROM individual_requests
					WHERE id = ? AND user_id = ? AND status = 'draft'`,
					params: [
						auditId,
						input.userId,
						input.requestId,
						JSON.stringify({
							status: 'draft',
							requestKind: payload.requestKind,
							fundingKind: payload.fundingKind,
							unitRateCents: input.unitRateCents,
							parentPayable: payload.requestKind === 'individual',
						}),
						input.now,
						id,
						input.userId,
					],
				},
				{
					sql: `INSERT INTO request_action_assertions
						(id, request_id, action, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, ?, 'created', ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM individual_requests
							WHERE id = ? AND user_id = ? AND status = 'draft')
						AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						assertionId,
						id,
						input.userId,
						auditId,
						id,
						input.userId,
						auditId,
						input.now,
					],
				},
			]);
			return { requestId: id, replayed: false };
		} catch (error) {
			const replay = await this.priorCreate(input.userId, input.payload.idempotencyKey);
			if (replay?.create_request_hash_sha256 === requestHash) {
				return { requestId: replay.id, replayed: true };
			}
			throw error;
		}
	}

	private async ownedRequest(userId: string, requestId: string): Promise<RequestRow | null> {
		return this.db.first<RequestRow>({
			sql: `SELECT request.*, child.full_name AS child_name
			FROM individual_requests AS request
			JOIN users AS owner ON owner.id = request.user_id
			JOIN children AS child ON child.id = request.child_id
				AND child.owner_user_id = owner.id
				AND child.family_number_id = owner.family_number_id
			WHERE request.id = ? AND request.user_id = ?
				AND owner.role = 'parent' AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL`,
			params: [requestId, userId],
		});
	}

	async loadOwnerRequest(userId: string, requestId: string) {
		const request = await this.ownedRequest(userId, requestId);
		if (!request) return null;
		const [authorizations, documents] = await Promise.all([
			this.db.all<{
				id: string;
				version: number;
				kind: 'jobcenter' | 'socialamt';
				status: string;
				valid_from: string | null;
				valid_until: string | null;
			}>({
				sql: `SELECT id, version, kind, status, valid_from, valid_until
					FROM funding_authorizations WHERE request_id = ? AND user_id = ?
					ORDER BY version DESC`,
				params: [requestId, userId],
			}),
			this.db.all<{
				id: string;
				authorization_id: string;
				original_extension: string;
				mime_type: string;
				size_bytes: number;
				sha256: string;
				review_status: string;
				uploaded_at: string;
				quarantine_expires_at: string;
			}>({
				sql: `SELECT document.id, document.authorization_id,
					document.original_extension, document.mime_type, document.size_bytes,
					document.sha256, document.review_status, document.uploaded_at,
					document.quarantine_expires_at
				FROM authorization_documents AS document
				JOIN funding_authorizations AS authorization
					ON authorization.id = document.authorization_id
				WHERE authorization.request_id = ? AND document.user_id = ?
				ORDER BY document.uploaded_at, document.id`,
				params: [requestId, userId],
			}),
		]);
		return {
			id: request.id,
			childId: request.child_id,
			childName: request.child_name,
			requestKind: request.request_kind,
			fundingKind: request.funding_kind,
			subjects: request.subjects_raw,
			description: request.description,
			preferredDays: JSON.parse(request.preferred_days_json) as string[],
			preferredTimeWindows: JSON.parse(request.preferred_time_windows_json) as Array<{
				dayCode: string;
				startTime: string;
				endTime: string;
			}>,
			preferredFormat: request.preferred_format,
			preferredLocations: JSON.parse(request.preferred_locations_json) as string[],
			unitRateCents: request.unit_rate_cents,
			parentPayable: request.parent_payable === 1,
			status: request.status,
			version: request.version,
			authorizations: authorizations.results.map((authorization) => ({
				id: authorization.id,
				version: authorization.version,
				kind: authorization.kind,
				status: authorization.status,
				validFrom: authorization.valid_from,
				validUntil: authorization.valid_until,
			})),
			documents: documents.results.map((document) => ({
				id: document.id,
				authorizationId: document.authorization_id,
				extension: document.original_extension,
				mimeType: document.mime_type,
				sizeBytes: document.size_bytes,
				shortSha256: document.sha256.slice(0, 12),
				reviewStatus: document.review_status,
				uploadedAt: document.uploaded_at,
				quarantineExpiresAt: document.quarantine_expires_at,
			})),
		};
	}

	async listOwnerRequests(userId: string) {
		const rows = await this.db.all<{
			id: string;
			request_kind: 'nachhilfe' | 'individual';
			funding_kind: string;
			status: IndividualRequestStatus;
			unit_rate_cents: number;
			parent_payable: 0 | 1;
			child_name: string;
			valid_from: string | null;
			valid_until: string | null;
		}>({
			sql: `SELECT request.id, request.request_kind, request.funding_kind,
				request.status, request.unit_rate_cents, request.parent_payable,
				child.full_name AS child_name,
				(SELECT valid_from FROM funding_authorizations AS authorization
					WHERE authorization.request_id = request.id AND authorization.status = 'approved'
					LIMIT 1) AS valid_from,
				(SELECT valid_until FROM funding_authorizations AS authorization
					WHERE authorization.request_id = request.id AND authorization.status = 'approved'
					LIMIT 1) AS valid_until
			FROM individual_requests AS request
			JOIN users AS owner ON owner.id = request.user_id
			JOIN children AS child ON child.id = request.child_id
				AND child.owner_user_id = request.user_id
			WHERE request.user_id = ? AND owner.role = 'parent'
				AND owner.email_verified_at IS NOT NULL
				AND owner.account_status = 'active' AND owner.is_blocked = 0
			ORDER BY request.created_at DESC, request.id DESC LIMIT 100`,
			params: [userId],
		});
		return rows.results;
	}

	private async priorAction(userId: string, key: string) {
		return this.db.first<PriorRequestAction>({
			sql: `SELECT action.request_id, action.action, action.request_hash_sha256,
				action.to_status
				FROM request_parent_actions AS action
				JOIN users AS owner ON owner.id = action.user_id
				WHERE action.user_id = ? AND action.idempotency_key = ?
					AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
					AND owner.account_status = 'active' AND owner.is_blocked = 0`,
			params: [userId, key],
		});
	}

	private async replayOwnerAction(input: {
		userId: string;
		requestId: string;
		idempotencyKey: string;
		requestHash: string;
		action: 'save' | 'submit' | 'cancel';
	}) {
		const prior = await this.priorAction(input.userId, input.idempotencyKey);
		if (!prior) return null;
		if (
			prior.request_id !== input.requestId ||
			prior.action !== input.action ||
			prior.request_hash_sha256 !== input.requestHash
		) {
			throw new IndividualRequestError('IDEMPOTENCY_KEY_REUSED');
		}
		return { status: prior.to_status as IndividualRequestStatus, replayed: true as const };
	}

	private async mutateOwnerRequest(input: {
		userId: string;
		requestId: string;
		expectedVersion: number;
		idempotencyKey: string;
		requestHash: string;
		action: 'save' | 'submit' | 'cancel';
		fromStatus: IndividualRequestStatus;
		toStatus: IndividualRequestStatus;
		requestIdHeader: string;
		now: string;
		updateStatements: readonly StatementSpec[];
		guardSql?: string;
		guardParams?: readonly unknown[];
	}) {
		const prior = await this.replayOwnerAction(input);
		if (prior) return prior;
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const assertionId = crypto.randomUUID();
		const guardSql = input.guardSql ?? '1 = 1';
		const guardParams = input.guardParams ?? [];
		try {
			await this.db.batch([
				...input.updateStatements,
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', ?, 'individual_request', id, ?, ?, ?
					FROM individual_requests WHERE id = ? AND user_id = ?
						AND version = ? AND status = ? AND (${guardSql})
						AND EXISTS (SELECT 1 FROM users AS owner WHERE owner.id = ?
							AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
							AND owner.account_status = 'active' AND owner.is_blocked = 0)`,
					params: [
						auditId,
						input.userId,
						`individual_request.${input.action}`,
						input.requestIdHeader,
						JSON.stringify({
							status: input.toStatus,
							version: input.expectedVersion + 1,
						}),
						input.now,
						input.requestId,
						input.userId,
						input.expectedVersion + 1,
						input.toStatus,
						...guardParams,
						input.userId,
					],
				},
				{
					sql: `INSERT INTO request_parent_actions
						(id, request_id, user_id, action, from_status, to_status,
						 idempotency_key, request_hash_sha256, audit_event_id, created_at)
					SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
					params: [
						actionId,
						input.requestId,
						input.userId,
						input.action,
						input.fromStatus,
						input.toStatus,
						input.idempotencyKey,
						input.requestHash,
						auditId,
						input.now,
						auditId,
					],
				},
				{
					sql: `INSERT INTO request_action_assertions
						(id, request_id, action, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, ?, ?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM individual_requests
							WHERE id = ? AND user_id = ? AND version = ? AND status = ?)
						AND EXISTS (SELECT 1 FROM request_parent_actions WHERE id = ?)
						AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
						AND (${guardSql})
					THEN 1 ELSE 0 END, ?)`,
					params: [
						assertionId,
						input.requestId,
						input.action,
						input.userId,
						auditId,
						input.requestId,
						input.userId,
						input.expectedVersion + 1,
						input.toStatus,
						actionId,
						auditId,
						...guardParams,
						input.now,
					],
				},
			]);
			return { status: input.toStatus, replayed: false };
		} catch {
			const replay = await this.replayOwnerAction(input);
			if (replay) return replay;
			throw new IndividualRequestError('REQUEST_MUTATION_REJECTED');
		}
	}

	async save(input: {
		userId: string;
		payload: RequestSaveInput;
		requestId: string;
		now: string;
	}) {
		const current = await this.ownedRequest(input.userId, input.payload.requestId);
		if (!current) throw new IndividualRequestError('REQUEST_NOT_FOUND');
		const payload = requestPayload(input.payload);
		const requestHash = await hashCanonical({
			...payload,
			version: input.payload.expectedVersion,
		});
		const prior = await this.replayOwnerAction({
			userId: input.userId,
			requestId: input.payload.requestId,
			idempotencyKey: input.payload.idempotencyKey,
			requestHash,
			action: 'save',
		});
		if (prior) return prior;
		if (!['draft', 'needs_documents', 'needs_info'].includes(current.status)) {
			throw new IndividualRequestError('REQUEST_NOT_EDITABLE');
		}
		if (
			payload.childId !== current.child_id ||
			payload.requestKind !== current.request_kind ||
			payload.fundingKind !== current.funding_kind
		) {
			throw new IndividualRequestError('REQUEST_IDENTITY_IMMUTABLE');
		}
		return this.mutateOwnerRequest({
			userId: input.userId,
			requestId: input.payload.requestId,
			expectedVersion: input.payload.expectedVersion,
			idempotencyKey: input.payload.idempotencyKey,
			requestHash,
			action: 'save',
			fromStatus: current.status,
			toStatus: current.status,
			requestIdHeader: input.requestId,
			now: input.now,
			updateStatements: [
				{
					sql: `UPDATE individual_requests SET subjects_raw = ?, description = ?,
						preferred_days_json = ?, preferred_time_windows_json = ?, preferred_format = ?,
						preferred_locations_json = ?, version = version + 1, updated_at = ?
					WHERE id = ? AND user_id = ? AND version = ? AND status = ?`,
					params: [
						payload.subjects,
						payload.description,
						JSON.stringify(payload.preferredDays),
						JSON.stringify(payload.preferredTimeWindows),
						payload.preferredFormat,
						JSON.stringify(payload.preferredLocations),
						input.now,
						input.payload.requestId,
						input.userId,
						input.payload.expectedVersion,
						current.status,
					],
				},
			],
		});
	}

	async submit(input: {
		userId: string;
		requestId: string;
		expectedVersion: number;
		idempotencyKey: string;
		requestIdHeader: string;
		now: string;
	}) {
		const current = await this.ownedRequest(input.userId, input.requestId);
		if (!current) throw new IndividualRequestError('REQUEST_NOT_FOUND');
		const requestHash = await hashCanonical({
			requestId: input.requestId,
			expectedVersion: input.expectedVersion,
			action: 'submit',
		});
		const prior = await this.replayOwnerAction({
			userId: input.userId,
			requestId: input.requestId,
			idempotencyKey: input.idempotencyKey,
			requestHash,
			action: 'submit',
		});
		if (prior) return prior;
		if (!['draft', 'needs_documents', 'needs_info'].includes(current.status)) {
			throw new IndividualRequestError('REQUEST_SUBMISSION_REJECTED');
		}
		const document = await this.db.first<{ present: number }>({
			sql: `SELECT EXISTS (
				SELECT 1 FROM funding_authorizations AS authorization
				JOIN authorization_documents AS document
					ON document.authorization_id = authorization.id
				WHERE authorization.request_id = ? AND authorization.status = 'pending_review'
					AND document.deleted_at IS NULL AND document.replaced_by_document_id IS NULL
					AND document.review_status <> 'deleted'
			) AS present`,
			params: [input.requestId],
		});
		const toStatus: IndividualRequestStatus =
			current.request_kind === 'nachhilfe' && document?.present !== 1
				? 'needs_documents'
				: 'pending_admin_review';
		return this.mutateOwnerRequest({
			userId: input.userId,
			requestId: input.requestId,
			expectedVersion: input.expectedVersion,
			idempotencyKey: input.idempotencyKey,
			requestHash,
			action: 'submit',
			fromStatus: current.status,
			toStatus,
			requestIdHeader: input.requestIdHeader,
			now: input.now,
			updateStatements: [
				{
					sql: `UPDATE individual_requests SET status = 'submitted', updated_at = ?
					WHERE id = ? AND user_id = ? AND version = ? AND status = ?`,
					params: [
						input.now,
						input.requestId,
						input.userId,
						input.expectedVersion,
						current.status,
					],
				},
				{
					sql: `UPDATE individual_requests SET status = ?, version = version + 1,
						updated_at = ? WHERE id = ? AND user_id = ? AND version = ?
						AND status = 'submitted'`,
					params: [
						toStatus,
						input.now,
						input.requestId,
						input.userId,
						input.expectedVersion,
					],
				},
			],
		});
	}

	async cancel(input: {
		userId: string;
		requestId: string;
		expectedVersion: number;
		idempotencyKey: string;
		requestIdHeader: string;
		now: string;
	}) {
		const current = await this.ownedRequest(input.userId, input.requestId);
		if (!current) throw new IndividualRequestError('REQUEST_NOT_FOUND');
		const requestHash = await hashCanonical({
			requestId: input.requestId,
			expectedVersion: input.expectedVersion,
			action: 'cancel',
		});
		const prior = await this.replayOwnerAction({
			userId: input.userId,
			requestId: input.requestId,
			idempotencyKey: input.idempotencyKey,
			requestHash,
			action: 'cancel',
		});
		if (prior) return prior;
		if (['cancelled', 'rejected'].includes(current.status)) {
			throw new IndividualRequestError('REQUEST_CANCELLATION_REJECTED');
		}
		const guard = this.mutationGuard.assertion({
			requestId: input.requestId,
			operation: 'cancel',
		});
		return this.mutateOwnerRequest({
			userId: input.userId,
			requestId: input.requestId,
			expectedVersion: input.expectedVersion,
			idempotencyKey: input.idempotencyKey,
			requestHash,
			action: 'cancel',
			fromStatus: current.status,
			toStatus: 'cancelled',
			requestIdHeader: input.requestIdHeader,
			now: input.now,
			guardSql: guard.sql,
			guardParams: guard.params,
			updateStatements: [
				{
					sql: `UPDATE individual_requests SET status = 'cancelled', version = version + 1,
						updated_at = ? WHERE id = ? AND user_id = ? AND version = ?
						AND status = ? AND (${guard.sql})`,
					params: [
						input.now,
						input.requestId,
						input.userId,
						input.expectedVersion,
						current.status,
						...guard.params,
					],
				},
			],
		});
	}
}

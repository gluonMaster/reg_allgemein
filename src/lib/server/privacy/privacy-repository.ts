import type { AuthenticatedUser } from '$lib/server/auth/session';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import { hashCanonical } from '$lib/server/import/canonical';
import type { AdminActor } from '$lib/server/security/authorization';
import type {
	PrivacyClosureStatus,
	PrivacyDeletionInventory,
	PrivacyInventoryCategory,
} from './contracts';

const RETENTION_POLICY_VERSION = 'mvp-no-auto-purge-v1';

const ACTIVE_CONTRACTS_SQL = `
	SELECT category, COUNT(*) AS count FROM (
		SELECT 'digital_contract' AS category, contract.id AS id
		FROM contracts contract
		WHERE contract.user_id = ? AND contract.operational_status = 'active'
		UNION ALL
		SELECT 'active_enrollment', enrollment.id FROM enrollments enrollment
		WHERE enrollment.user_id = ? AND enrollment.status = 'active'
			AND NOT EXISTS (SELECT 1 FROM contracts contract
				WHERE contract.enrollment_id = enrollment.id AND contract.operational_status = 'active')
		UNION ALL
		SELECT 'active_service', engagement.id FROM service_engagements engagement
		WHERE engagement.user_id = ? AND engagement.status IN ('active', 'funding_review')
			AND NOT EXISTS (SELECT 1 FROM contracts contract
				WHERE contract.service_engagement_id = engagement.id
					AND contract.operational_status = 'active')
		UNION ALL
		SELECT 'legacy_active_service', legacy.id FROM legacy_enrollments legacy
		JOIN children child ON child.id = legacy.child_id
		WHERE child.owner_user_id = ? AND legacy.is_current = 1
			AND upper(trim(coalesce(legacy.status_code_raw, ''))) <> 'KN'
			AND legacy.represented_by_enrollment_id IS NULL
	) blockers GROUP BY category ORDER BY category`;

const retainedCte = (selects: readonly string[]) => `WITH retained(
	target_kind, target_id, retention_class, legal_basis, retention_started_on, private_r2_key
) AS (${selects.join('\nUNION ALL\n')})`;

const RETAINED_SELECTS = [
	`SELECT 'privacy_acknowledgement', acknowledgement.id, 'privacy_accountability',
		'privacy_accountability', acknowledgement.acknowledged_at, NULL
	FROM privacy_acknowledgements acknowledgement WHERE acknowledgement.user_id = ?`,
	`SELECT 'media_consent', consent.id, 'media_consent_evidence',
		'privacy_accountability', consent.decided_at, NULL
	FROM media_consents consent WHERE consent.user_id = ?`,
	`SELECT 'contract_offer', offer.id, 'contract_source_bundle',
		'contractual_legal_evidence', offer.created_at, NULL
	FROM contract_offers offer WHERE offer.user_id = ? AND (
		EXISTS (SELECT 1 FROM contract_artifacts artifact WHERE artifact.contract_offer_id = offer.id)
		OR EXISTS (SELECT 1 FROM contract_parent_actions action WHERE action.contract_offer_id = offer.id)
		OR EXISTS (SELECT 1 FROM contracts contract WHERE contract.contract_offer_id = offer.id))`,
	`SELECT 'contract_artifact', artifact.id, 'contract_pdf_source_bundle',
		'contractual_legal_evidence', artifact.created_at, artifact.private_r2_key
	FROM contract_artifacts artifact JOIN contract_offers offer
		ON offer.id = artifact.contract_offer_id OR offer.id = (
			SELECT certificate.contract_offer_id FROM contract_formation_certificates certificate
			WHERE certificate.id = artifact.formation_certificate_id)
	WHERE offer.user_id = ?`,
	`SELECT 'contract_parent_action', action.id, 'contract_acceptance_evidence',
		'contractual_legal_evidence', action.created_at, NULL
	FROM contract_parent_actions action JOIN contract_offers offer
		ON offer.id = action.contract_offer_id WHERE offer.user_id = ?`,
	`SELECT 'contract_acceptance', acceptance.id, 'contract_acceptance_evidence',
		'contractual_legal_evidence', acceptance.accepted_at, NULL
	FROM contract_acceptances acceptance WHERE acceptance.user_id = ?`,
	`SELECT 'contract', contract.id, 'contract_formation_evidence',
		'contractual_legal_evidence', contract.formed_at, NULL
	FROM contracts contract WHERE contract.user_id = ?`,
	`SELECT 'contract_formation_certificate', certificate.id, 'contract_formation_evidence',
		'contractual_legal_evidence', certificate.formed_at, certificate.certificate_pdf_r2_key
	FROM contract_formation_certificates certificate JOIN contracts contract
		ON contract.id = certificate.contract_id WHERE contract.user_id = ?`,
	`SELECT 'contract_delivery', delivery.id, 'contract_delivery_evidence',
		'contractual_legal_evidence', delivery.created_at, NULL
	FROM contract_deliveries delivery JOIN contract_offers offer
		ON offer.id = delivery.contract_offer_id WHERE offer.user_id = ?`,
	`SELECT 'contract_event', event.id, 'contract_lifecycle_evidence',
		'contractual_legal_evidence', event.created_at, NULL
	FROM contract_events event JOIN contracts contract ON contract.id = event.contract_id
	WHERE contract.user_id = ?`,
	`SELECT 'contract_end_request', request.id, 'termination_withdrawal_evidence',
		'contractual_legal_evidence', request.received_at, NULL
	FROM contract_end_requests request JOIN contracts contract ON contract.id = request.contract_id
	WHERE contract.user_id = ?`,
	`SELECT 'service_attendance_notice', notice.id, 'termination_withdrawal_evidence',
		'contractual_legal_evidence', notice.received_at, NULL
	FROM service_attendance_notices notice JOIN contracts contract ON contract.id = notice.contract_id
	WHERE contract.user_id = ?`,
	`SELECT 'authorization_document', document.id, 'funding_document_evidence',
		'funding_legal_evidence', document.released_at, document.archive_r2_key
	FROM authorization_documents document WHERE document.user_id = ?
		AND document.review_status = 'approved' AND document.archive_r2_key IS NOT NULL`,
	`SELECT 'funding_authorization', authorization.id, 'funding_authorization_evidence',
		'funding_legal_evidence', COALESCE(authorization.reviewed_at, authorization.created_at), NULL
	FROM funding_authorizations authorization WHERE authorization.user_id = ?
		AND EXISTS (SELECT 1 FROM authorization_documents document
			WHERE document.authorization_id = authorization.id
				AND document.review_status = 'approved' AND document.archive_r2_key IS NOT NULL)`,
	`SELECT 'price_change_acceptance', acceptance.id, 'price_acceptance_evidence',
		'contractual_legal_evidence', acceptance.accepted_at, NULL
	FROM price_change_acceptances acceptance WHERE acceptance.user_id = ?`,
] as const;

const retainedSets = (userId: string) => [0, 4, 8, 12].map((start) => {
	const selects = RETAINED_SELECTS.slice(start, start + 4);
	return { cte: retainedCte(selects), params: Array(selects.length).fill(userId) };
});

export class PrivacyRepositoryError extends Error {
	constructor(readonly code: string, options?: { cause?: unknown }) {
		super(code, options);
		this.name = 'PrivacyRepositoryError';
	}
}

function sumCategories(rows: readonly PrivacyInventoryCategory[]): number {
	return rows.reduce((total, row) => total + row.count, 0);
}

function accessSql(): string {
	return `EXISTS (SELECT 1 FROM users actor WHERE actor.id = ?
		AND actor.account_status = 'active' AND actor.is_blocked = 0
		AND (actor.id = ? OR actor.role = 'admin'))`;
}

export class PrivacyRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async assertSubjectAccess(actor: AuthenticatedUser, subjectUserId: string): Promise<void> {
		const row = await this.db.first<{ allowed: number }>({
			sql: `SELECT CASE WHEN ${accessSql()} AND EXISTS (
				SELECT 1 FROM users subject WHERE subject.id = ? AND subject.role = 'parent'
			) THEN 1 ELSE 0 END AS allowed`,
			params: [actor.id, subjectUserId, subjectUserId],
		});
		if (row?.allowed !== 1) throw new PrivacyRepositoryError('PRIVACY_SUBJECT_NOT_FOUND');
	}

	async deletionInventory(subjectUserId: string): Promise<PrivacyDeletionInventory> {
		const active = await this.db.all<PrivacyInventoryCategory>({
				sql: ACTIVE_CONTRACTS_SQL,
				params: [subjectUserId, subjectUserId, subjectUserId, subjectUserId],
			});
		const retainedByCategory = new Map<string, number>();
		for (const set of retainedSets(subjectUserId)) {
			const part = await this.db.all<PrivacyInventoryCategory>({
				sql: `${set.cte} SELECT retention_class AS category, COUNT(*) AS count
					FROM retained GROUP BY retention_class ORDER BY retention_class`,
				params: set.params,
			});
			for (const row of part.results) {
				retainedByCategory.set(row.category, (retainedByCategory.get(row.category) ?? 0) + row.count);
			}
		}
		const retained = { results: [...retainedByCategory]
			.map(([category, count]) => ({ category, count }))
			.sort((left, right) => left.category.localeCompare(right.category)) };
		const holdsByCategory = new Map<string, number>();
		for (const set of retainedSets(subjectUserId)) {
			const part = await this.db.all<PrivacyInventoryCategory>({
				sql: `${set.cte} SELECT control.retention_class AS category, COUNT(*) AS count
					FROM retained JOIN retention_controls control
						ON control.target_kind = retained.target_kind
						AND control.target_id = retained.target_id
					WHERE control.legal_hold = 1
					GROUP BY control.retention_class ORDER BY control.retention_class`,
				params: set.params,
			});
			for (const row of part.results) {
				holdsByCategory.set(row.category,
					(holdsByCategory.get(row.category) ?? 0) + row.count);
			}
		}
		const holds = { results: [...holdsByCategory]
			.map(([category, count]) => ({ category, count }))
			.sort((left, right) => left.category.localeCompare(right.category)) };
		const d1CleanupFirst = await this.db.all<PrivacyInventoryCategory>({
				sql: `SELECT category, count FROM (
					SELECT 'sessions_tokens' AS category,
						(SELECT COUNT(*) FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL)
						+ (SELECT COUNT(*) FROM auth_tokens WHERE user_id = ? AND used_at IS NULL) AS count
					UNION ALL SELECT 'children_profile', COUNT(*) FROM children WHERE owner_user_id = ?
					UNION ALL SELECT 'nonterminal_offers', COUNT(*) FROM contract_offers
						WHERE user_id = ? AND status IN ('draft','sent','accepted_by_parent')
					UNION ALL SELECT 'nonterminal_price_items', COUNT(*) FROM price_review_items
						WHERE user_id = ? AND status IN ('draft','manual_contact_required',
							'notification_approved','sent',
							'accepted_by_parent','approved_by_admin','scheduled')
				) WHERE count > 0 ORDER BY category`,
				params: Array(5).fill(subjectUserId),
			});
		const d1CleanupSecond = await this.db.all<PrivacyInventoryCategory>({
				sql: `SELECT category, count FROM (
					SELECT 'nonterminal_requests' AS category, COUNT(*) AS count FROM individual_requests
						WHERE user_id = ? AND status NOT IN ('rejected','cancelled')
					UNION ALL SELECT 'nonterminal_trials', COUNT(*) FROM trial_bookings
						WHERE user_id = ? AND status IN ('requested','confirmed')
					UNION ALL SELECT 'support_threads', COUNT(*) FROM support_threads
						WHERE user_id = ? AND status <> 'closed'
					UNION ALL SELECT 'nonterminal_services',
						(SELECT COUNT(*) FROM enrollments WHERE user_id = ?
							AND status IN ('draft','contract_offered'))
						+ (SELECT COUNT(*) FROM service_engagements WHERE user_id = ?
							AND status IN ('draft','contract_offered'))
				) WHERE count > 0 ORDER BY category`,
				params: Array(5).fill(subjectUserId),
			});
		const d1Cleanup = { results: [...d1CleanupFirst.results, ...d1CleanupSecond.results]
			.sort((left, right) => left.category.localeCompare(right.category)) };
		const r2Cleanup = await this.db.all<PrivacyInventoryCategory>({
				sql: `SELECT category, count FROM (
					SELECT 'short_lived_export' AS category, COUNT(*) AS count
					FROM privacy_export_artifacts WHERE subject_user_id = ? AND status = 'ready'
					UNION ALL
					SELECT 'document_quarantine', COUNT(*) FROM authorization_documents
					WHERE user_id = ? AND quarantine_delete_state = 'present'
				) WHERE count > 0 ORDER BY category`,
				params: [subjectUserId, subjectUserId],
			});
		return {
			subjectUserId,
			activeContracts: active.results,
			retainedCategories: retained.results,
			holds: holds.results,
			d1Cleanup: d1Cleanup.results,
			r2Cleanup: r2Cleanup.results,
			activeContractCount: sumCategories(active.results),
			retainedRecordCount: sumCategories(retained.results),
			holdCount: sumCategories(holds.results),
		};
	}

	async exportData(subjectUserId: string, generatedAt: string): Promise<Record<string, unknown>> {
		const profile = await this.db.first<Record<string, unknown>>({
			sql: `SELECT user.id, user.email, user.first_name, user.last_name, user.phone,
				user.preferred_language, user.account_status, user.privacy_notice_version,
				user.privacy_accepted_at, family.display_family_id
			FROM users user LEFT JOIN family_number_allocations family
				ON family.id = user.family_number_id
			WHERE user.id = ? AND user.role = 'parent'`,
			params: [subjectUserId],
		});
		if (!profile) throw new PrivacyRepositoryError('PRIVACY_SUBJECT_NOT_FOUND');
		const all = <T extends Record<string, unknown>>(sql: string, params: unknown[] = [subjectUserId]) =>
			this.db.all<T>({ sql, params });
		const [acknowledgements, children, enrollments, legacyServices, trials, requests,
			documents, offers, acceptances, contracts, mediaConsents, threads, messages,
			priceReviews] = await Promise.all([
			all(`SELECT privacy_notice_version, acknowledged_at, evidence_hash, source_context
				FROM privacy_acknowledgements WHERE user_id = ? ORDER BY acknowledged_at`),
			all(`SELECT id, origin, full_name, birth_date, is_current, created_at, updated_at
				FROM children WHERE owner_user_id = ? ORDER BY created_at, id`),
			all(`SELECT enrollment.id, enrollment.child_id, course.display_name AS course_name,
				enrollment.lesson_kind, enrollment.status, enrollment.contract_kind,
				enrollment.active_from, enrollment.active_until, enrollment.current_price_cents,
				enrollment.payment_arrangement
			FROM enrollments enrollment JOIN course_groups course ON course.id = enrollment.course_group_id
			WHERE enrollment.user_id = ? ORDER BY enrollment.created_at, enrollment.id`),
			all(`SELECT legacy.id, legacy.child_id, legacy.group_name_raw, legacy.lesson_kind,
				legacy.contract_kind, legacy.planned_price_cents, legacy.is_current
			FROM legacy_enrollments legacy JOIN children child ON child.id = legacy.child_id
			WHERE child.owner_user_id = ? ORDER BY legacy.created_at, legacy.id`),
			all(`SELECT id, child_id, course_group_id, status, requested_date, confirmed_date,
				created_at, updated_at FROM trial_bookings WHERE user_id = ? ORDER BY created_at, id`),
			all(`SELECT id, child_id, request_kind, funding_kind, subjects_raw, description,
				preferred_days_json, preferred_time_windows_json, preferred_format,
				preferred_locations_json, unit_rate_cents, parent_payable, status,
				created_at, updated_at FROM individual_requests WHERE user_id = ? ORDER BY created_at, id`),
			all(`SELECT id, authorization_id, detected_type, size_bytes, review_status,
				uploaded_at, released_at, deleted_at FROM authorization_documents
				WHERE user_id = ? ORDER BY uploaded_at, id`),
			all(`SELECT id, offer_number, contract_number, child_id, contract_kind,
				effective_from, effective_to, billing_model, price_cents, amount_semantics,
				payment_arrangement, privacy_notice_version, status, sent_at, expires_at,
				accepted_at, declined_at, admin_approved_at, cancelled_at, created_at
			FROM contract_offers WHERE user_id = ? ORDER BY created_at, id`),
			all(`SELECT id, contract_offer_id, accepted_at, acceptance_text_version,
				acceptance_text, contract_hash, created_at FROM contract_acceptances
				WHERE user_id = ? ORDER BY accepted_at, id`),
			all(`SELECT id, contract_offer_id, contract_number, child_id, operational_status,
				formed_at, activated_at, effective_from, effective_to, auto_renewal_blocked_at,
				created_at FROM contracts WHERE user_id = ? ORDER BY formed_at, id`),
			all(`SELECT id, child_id, capture_scopes_json, publication_channels_json,
				text_version, decision, decision_source, decided_at, received_at,
				effective_from, recorded_at, supersedes_consent_id, created_at
			FROM media_consents WHERE user_id = ? ORDER BY created_at, id`),
			all(`SELECT id, public_reference, category, status, subject, created_at,
				updated_at, closed_at FROM support_threads WHERE user_id = ? ORDER BY created_at, id`),
			all(`SELECT message.id, message.thread_id, message.sender_kind, message.body,
				message.created_at FROM support_messages message JOIN support_threads thread
				ON thread.id = message.thread_id WHERE thread.user_id = ?
				ORDER BY message.created_at, message.id`),
			all(`SELECT public_reference, old_price_cents, new_final_price_cents,
				effective_on, status, sent_at, response_deadline, responded_at,
				scheduled_for, applied_at, created_at FROM price_review_items
				WHERE user_id = ? ORDER BY created_at, id`),
		]);
		return {
			schemaVersion: 'kolibri-subject-export-v1',
			generatedAt,
			subject: profile,
			privacyAcknowledgements: acknowledgements.results,
			children: children.results,
			services: { enrollments: enrollments.results, legacy: legacyServices.results },
			trials: trials.results,
			requests: requests.results,
			documents: documents.results,
			contractOffers: offers.results,
			contractAcceptances: acceptances.results,
			contracts: contracts.results,
			mediaConsents: mediaConsents.results,
			support: { threads: threads.results, messages: messages.results },
			priceReviews: priceReviews.results,
		};
	}

	async createExportRequest(input: {
		actor: AuthenticatedUser;
		subjectUserId: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		const requestHash = await hashCanonical({ kind: 'export', subjectUserId: input.subjectUserId });
		const prior = await this.db.first<{
			id: string; status: string; request_hash_sha256: string;
			artifact_id: string | null;
		}>({
			sql: `SELECT request.id, request.status, request.request_hash_sha256,
				artifact.id AS artifact_id FROM privacy_requests request
			LEFT JOIN privacy_export_artifacts artifact ON artifact.privacy_request_id = request.id
			WHERE request.requested_by_user_id = ? AND request.request_idempotency_key = ?`,
			params: [input.actor.id, input.idempotencyKey],
		});
		if (prior) {
			if (prior.request_hash_sha256 !== requestHash) {
				throw new PrivacyRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			if (prior.status === 'completed' && prior.artifact_id) {
				return { requestId: prior.id, artifactId: prior.artifact_id, replayed: true, ready: true };
			}
			if (prior.status === 'processing') {
				return { requestId: prior.id, artifactId: null, replayed: true, ready: false };
			}
			if (prior.status === 'failed') {
				await this.db.run({
					sql: `UPDATE privacy_requests SET status = 'processing', decision_reason = NULL,
						updated_at = ? WHERE id = ? AND status = 'failed'`,
					params: [input.now, prior.id],
				});
				return { requestId: prior.id, artifactId: null, replayed: true, ready: false };
			}
			throw new PrivacyRepositoryError('PRIVACY_EXPORT_STATE_REJECTED');
		}
		const privacyRequestId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO privacy_requests
						(id, public_reference, subject_user_id, requested_by_user_id, kind, status,
						 request_idempotency_key, request_hash_sha256, retention_holds_json,
						 safe_summary_json, decision_reason, artifact_r2_key, artifact_expires_at,
						 reviewed_by, reviewed_at, completed_at, created_at, updated_at)
					SELECT ?, ?, ?, ?, 'export', 'requested', ?, ?, '[]',
						'{"scope":"subject_only"}', NULL, NULL, NULL, NULL, NULL, NULL, ?, ?
					WHERE ${accessSql()} AND EXISTS (SELECT 1 FROM users subject
						WHERE subject.id = ? AND subject.role = 'parent')`,
					params: [privacyRequestId, `PRIV-${privacyRequestId}`, input.subjectUserId,
						input.actor.id, input.idempotencyKey, requestHash, input.now, input.now,
						input.actor.id, input.subjectUserId, input.subjectUserId],
				},
				{
					sql: `UPDATE privacy_requests SET status = 'processing', updated_at = ?
						WHERE id = ? AND status = 'requested'`,
					params: [input.now, privacyRequestId],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'privacy.export.requested', 'privacy_request', id,
						?, '{"scope":"subject_only"}', ? FROM privacy_requests
					WHERE id = ? AND status = 'processing'`,
					params: [auditId, input.actor.id, input.requestId, input.now, privacyRequestId],
				},
			]);
			return { requestId: privacyRequestId, artifactId: null, replayed: false, ready: false };
		} catch (error) {
			throw new PrivacyRepositoryError('PRIVACY_EXPORT_REQUEST_REJECTED', { cause: error });
		}
	}

	async completeExport(input: {
		privacyRequestId: string;
		subjectUserId: string;
		privateR2Key: string;
		sha256: string;
		sizeBytes: number;
		expiresAt: string;
		now: string;
		storageIntentId?: string;
	}) {
		const prior = await this.db.first<{ id: string; private_r2_key: string }>({
			sql: `SELECT id, private_r2_key FROM privacy_export_artifacts WHERE privacy_request_id = ?`,
			params: [input.privacyRequestId],
		});
		if (prior) return { artifactId: prior.id, storedR2Key: prior.private_r2_key, replayed: true };
		const artifactId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO privacy_export_artifacts
						(id, privacy_request_id, subject_user_id, private_r2_key, content_type,
						 size_bytes, sha256, status, generation_attempts, generated_at,
						 expires_at, deleted_at, created_at, updated_at)
					SELECT ?, request.id, request.subject_user_id, ?, 'application/json; charset=utf-8',
						?, ?, 'ready', 1, ?, ?, NULL, ?, ? FROM privacy_requests request
					WHERE request.id = ? AND request.kind = 'export' AND request.status = 'processing'
						AND request.subject_user_id = ?
						AND (? IS NULL OR EXISTS (SELECT 1 FROM storage_object_intents intent
							WHERE intent.id = ? AND intent.status = 'staged'
								AND intent.storage_class = 'archive'
								AND intent.object_key = ?))`,
					params: [artifactId, input.privateR2Key, input.sizeBytes, input.sha256,
						input.now, input.expiresAt, input.now, input.now,
						input.privacyRequestId, input.subjectUserId,
						input.storageIntentId ?? null, input.storageIntentId ?? null, input.privateR2Key],
				},
				...(input.storageIntentId ? [
					{
						sql: `UPDATE storage_object_intents SET status = 'linked', linked_at = ?,
							updated_at = ?, lease_owner = NULL, lease_until = NULL, last_error_code = NULL
						WHERE id = ? AND status = 'staged' AND object_key = ?
							AND EXISTS (SELECT 1 FROM privacy_export_artifacts
								WHERE id = ? AND private_r2_key = ?)`,
						params: [input.now, input.now, input.storageIntentId, input.privateR2Key,
							artifactId, input.privateR2Key],
					},
					{
						sql: `INSERT INTO storage_intent_link_assertions
							(id, intent_id, target_kind, target_id, assertion_passed, created_at)
						VALUES (?, ?, 'privacy_export', ?, CASE WHEN
							EXISTS (SELECT 1 FROM storage_object_intents
								WHERE id = ? AND status = 'linked' AND object_key = ?)
							AND EXISTS (SELECT 1 FROM privacy_export_artifacts
								WHERE id = ? AND private_r2_key = ?)
						THEN 1 ELSE 0 END, ?)`,
						params: [crypto.randomUUID(), input.storageIntentId, artifactId,
							input.storageIntentId, input.privateR2Key, artifactId,
							input.privateR2Key, input.now],
					},
				] : []),
				{
					sql: `UPDATE privacy_requests SET status = 'completed', artifact_r2_key = ?,
						artifact_expires_at = ?, safe_summary_json = ?, completed_at = ?, updated_at = ?
					WHERE id = ? AND status = 'processing' AND EXISTS (
						SELECT 1 FROM privacy_export_artifacts artifact
						WHERE artifact.id = ? AND artifact.privacy_request_id = privacy_requests.id)`,
					params: [input.privateR2Key, input.expiresAt,
						JSON.stringify({ scope: 'subject_only', artifactTtlExpiresAt: input.expiresAt }),
						input.now, input.now, input.privacyRequestId, artifactId],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, request.requested_by_user_id, 'user', 'privacy.export.completed',
						'privacy_request', request.id, 'privacy-export:' || request.id,
						?, ? FROM privacy_requests request WHERE request.id = ?
						AND request.status = 'completed'`,
					params: [auditId, JSON.stringify({ expiresAt: input.expiresAt,
						sizeBytes: input.sizeBytes }), input.now, input.privacyRequestId],
				},
				{
					sql: `INSERT INTO privacy_transaction_assertions
						(id, privacy_request_id, scope, action_id, assertion_passed, created_at)
					VALUES (?, ?, 'export_complete', NULL, CASE WHEN
						EXISTS (SELECT 1 FROM privacy_requests WHERE id = ? AND status = 'completed')
						AND EXISTS (SELECT 1 FROM privacy_export_artifacts
							WHERE id = ? AND status = 'ready')
						AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [crypto.randomUUID(), input.privacyRequestId, input.privacyRequestId,
						artifactId, auditId, input.now],
				},
			]);
			return { artifactId, storedR2Key: input.privateR2Key, replayed: false };
		} catch (error) {
			const replay = await this.db.first<{ id: string; private_r2_key: string }>({
				sql: `SELECT id, private_r2_key FROM privacy_export_artifacts
					WHERE privacy_request_id = ?`,
				params: [input.privacyRequestId],
			});
			if (replay) {
				return { artifactId: replay.id, storedR2Key: replay.private_r2_key, replayed: true };
			}
			throw new PrivacyRepositoryError('PRIVACY_EXPORT_COMPLETE_REJECTED', { cause: error });
		}
	}

	async markExportFailed(privacyRequestId: string, now: string): Promise<void> {
		await this.db.run({
			sql: `UPDATE privacy_requests SET status = 'failed',
				decision_reason = 'ARTIFACT_GENERATION_FAILED', updated_at = ?
			WHERE id = ? AND kind = 'export' AND status = 'processing'`,
			params: [now, privacyRequestId],
		});
	}

	async loadExportArtifact(input: {
		actor: AuthenticatedUser;
		artifactId: string;
		now: string;
	}) {
		return this.db.first<{
			id: string;
			privacy_request_id: string;
			subject_user_id: string;
			private_r2_key: string;
			sha256: string;
			size_bytes: number;
			expires_at: string;
		}>({
			sql: `SELECT artifact.id, artifact.privacy_request_id, artifact.subject_user_id,
				artifact.private_r2_key, artifact.sha256, artifact.size_bytes, artifact.expires_at
			FROM privacy_export_artifacts artifact
			JOIN users actor ON actor.id = ?
			WHERE artifact.id = ? AND artifact.status = 'ready' AND artifact.expires_at > ?
				AND actor.account_status = 'active' AND actor.is_blocked = 0
				AND (actor.id = artifact.subject_user_id OR actor.role = 'admin')`,
			params: [input.actor.id, input.artifactId, input.now],
		});
	}

	async auditExportDownload(input: {
		actor: AuthenticatedUser;
		artifactId: string;
		requestId: string;
		now: string;
	}): Promise<void> {
		const auditId = `privacy-export-download:${await hashCanonical({
			artifactId: input.artifactId,
			requestId: input.requestId,
			actorId: input.actor.id,
		})}`;
		const result = await this.db.run({
			sql: `INSERT OR IGNORE INTO audit_events
				(id, actor_user_id, actor_kind, action, target_kind, target_id,
				 request_id, safe_diff_json, created_at)
			SELECT ?, ?, 'user', 'privacy.export.downloaded', 'privacy_export_artifact',
				artifact.id, ?, '{"privateAuthenticatedResponse":true}', ?
			FROM privacy_export_artifacts artifact JOIN users actor ON actor.id = ?
			WHERE artifact.id = ? AND artifact.status = 'ready' AND artifact.expires_at > ?
				AND actor.account_status = 'active' AND actor.is_blocked = 0
				AND (actor.id = artifact.subject_user_id OR actor.role = 'admin')`,
			params: [auditId, input.actor.id, input.requestId, input.now,
				input.actor.id, input.artifactId, input.now],
		});
		if ((result.meta.changes ?? 0) !== 1 && !await this.db.first({
			sql: `SELECT audit.id FROM audit_events audit
			JOIN privacy_export_artifacts artifact ON artifact.id = audit.target_id
			JOIN users actor ON actor.id = ?
			WHERE audit.id = ? AND audit.actor_user_id = actor.id
				AND audit.action = 'privacy.export.downloaded'
				AND audit.target_kind = 'privacy_export_artifact' AND artifact.id = ?
				AND artifact.status = 'ready' AND artifact.expires_at > ?
				AND actor.account_status = 'active' AND actor.is_blocked = 0
				AND (actor.id = artifact.subject_user_id OR actor.role = 'admin')`,
			params: [input.actor.id, auditId, input.artifactId, input.now],
		})) {
			throw new PrivacyRepositoryError('PRIVACY_EXPORT_NOT_FOUND');
		}
	}

	async listOwnerRequests(userId: string) {
		const rows = await this.db.all<{
			id: string; public_reference: string; kind: string; status: string;
			safe_summary_json: string; artifact_id: string | null;
			artifact_expires_at: string | null; created_at: string; completed_at: string | null;
		}>({
			sql: `SELECT request.id, request.public_reference, request.kind, request.status,
				request.safe_summary_json, artifact.id AS artifact_id,
				request.artifact_expires_at, request.created_at, request.completed_at
			FROM privacy_requests request LEFT JOIN privacy_export_artifacts artifact
				ON artifact.privacy_request_id = request.id AND artifact.status = 'ready'
			WHERE request.subject_user_id = ? AND request.requested_by_user_id = ?
			ORDER BY request.created_at DESC, request.id DESC LIMIT 50`,
			params: [userId, userId],
		});
		return rows.results.map((row) => ({ ...row, safeSummary: JSON.parse(row.safe_summary_json) }));
	}

	async listAdminRequests() {
		const rows = await this.db.all<{
			id: string; public_reference: string; subject_user_id: string; kind: string;
			status: string; safe_summary_json: string; artifact_id: string | null;
			artifact_expires_at: string | null; created_at: string; completed_at: string | null;
		}>({
			sql: `SELECT request.id, request.public_reference, request.subject_user_id,
				request.kind, request.status, request.safe_summary_json,
				artifact.id AS artifact_id, request.artifact_expires_at,
				request.created_at, request.completed_at
			FROM privacy_requests request LEFT JOIN privacy_export_artifacts artifact
				ON artifact.privacy_request_id = request.id AND artifact.status = 'ready'
			ORDER BY CASE request.status WHEN 'requested' THEN 1 WHEN 'reviewing' THEN 2
				ELSE 3 END, request.created_at DESC, request.id DESC LIMIT 100`,
		});
		return rows.results.map((row) => ({ ...row, safeSummary: JSON.parse(row.safe_summary_json) }));
	}

	async createDeleteRequest(input: {
		actor: AuthenticatedUser;
		inventory: PrivacyDeletionInventory;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		const requestHash = await hashCanonical({ kind: 'delete', subjectUserId: input.actor.id });
		const prior = await this.db.first<{
			id: string; status: PrivacyClosureStatus | string; request_hash_sha256: string;
		}>({
			sql: `SELECT id, status, request_hash_sha256 FROM privacy_requests
			WHERE requested_by_user_id = ? AND request_idempotency_key = ?`,
			params: [input.actor.id, input.idempotencyKey],
		});
		if (prior) {
			if (prior.request_hash_sha256 !== requestHash) {
				throw new PrivacyRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			return { requestId: prior.id, status: prior.status, replayed: true };
		}
		const privacyRequestId = crypto.randomUUID();
		const blocked = input.inventory.activeContractCount > 0;
		const status = blocked ? 'blocked_by_active_contract' : 'requested';
		const auditId = crypto.randomUUID();
		const safeSummary = {
			activeContracts: input.inventory.activeContracts,
			retainedCategories: input.inventory.retainedCategories,
			holds: input.inventory.holds,
			d1Cleanup: input.inventory.d1Cleanup,
			r2Cleanup: input.inventory.r2Cleanup,
		};
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO privacy_requests
					(id, public_reference, subject_user_id, requested_by_user_id, kind, status,
					 request_idempotency_key, request_hash_sha256, retention_holds_json,
					 safe_summary_json, decision_reason, artifact_r2_key, artifact_expires_at,
					 reviewed_by, reviewed_at, completed_at, created_at, updated_at)
				SELECT ?, ?, ?, ?, 'delete', ?, ?, ?, ?, ?, ?, NULL, NULL,
					NULL, NULL, ?, ?, ? FROM users owner
				WHERE owner.id = ? AND owner.role = 'parent' AND owner.account_status = 'active'
					AND owner.is_blocked = 0`,
				params: [privacyRequestId, `PRIV-${privacyRequestId}`, input.actor.id, input.actor.id,
					status, input.idempotencyKey, requestHash,
					JSON.stringify(input.inventory.holds), JSON.stringify(safeSummary),
					blocked ? 'ACTIVE_CONTRACT_PRESENT' : null,
					blocked ? input.now : null, input.now, input.now, input.actor.id],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
				SELECT ?, ?, 'user', ?, 'privacy_request', id, ?, ?, ?
				FROM privacy_requests WHERE id = ? AND status = ?`,
				params: [auditId, input.actor.id,
					blocked ? 'privacy.delete.blocked' : 'privacy.delete.requested',
					input.requestId, JSON.stringify({ activeContractCount: input.inventory.activeContractCount,
						retainedRecordCount: input.inventory.retainedRecordCount,
						holdCount: input.inventory.holdCount }), input.now, privacyRequestId, status],
			},
		];
		if (blocked) {
			statements.push(
				{
					sql: `INSERT INTO privacy_closure_results
						(privacy_request_id, subject_user_id, result_status, account_closed_at,
						 active_contract_count, media_revocation_count, retained_record_count,
						 cleanup_job_count, safe_result_json, created_at)
					SELECT id, subject_user_id, 'blocked_by_active_contract', NULL,
						?, 0, ?, 0, ?, ? FROM privacy_requests
					WHERE id = ? AND status = 'blocked_by_active_contract'`,
					params: [input.inventory.activeContractCount, input.inventory.retainedRecordCount,
						JSON.stringify(safeSummary), input.now, privacyRequestId],
				},
				{
					sql: `INSERT INTO privacy_transaction_assertions
						(id, privacy_request_id, scope, action_id, assertion_passed, created_at)
					VALUES (?, ?, 'delete_blocked', NULL, CASE WHEN
						EXISTS (SELECT 1 FROM privacy_closure_results WHERE privacy_request_id = ?
							AND result_status = 'blocked_by_active_contract')
						AND EXISTS (SELECT 1 FROM users WHERE id = ? AND account_status = 'active')
						AND NOT EXISTS (SELECT 1 FROM media_consents
							WHERE source_privacy_request_id = ? AND decision_source = 'account_deletion')
					THEN 1 ELSE 0 END, ?)`,
					params: [crypto.randomUUID(), privacyRequestId, privacyRequestId,
						input.actor.id, privacyRequestId, input.now],
				}
			);
		}
		try {
			await this.db.batch(statements);
			return { requestId: privacyRequestId, status, replayed: false };
		} catch (error) {
			throw new PrivacyRepositoryError('PRIVACY_DELETE_REQUEST_REJECTED', { cause: error });
		}
	}

	private async adminActionReplay(adminId: string, key: string, requestHash: string) {
		const row = await this.db.first<{
			request_hash_sha256: string; result_status: PrivacyClosureStatus;
		}>({
			sql: `SELECT request_hash_sha256, result_status FROM privacy_admin_actions
			WHERE actor_user_id = ? AND idempotency_key = ?`,
			params: [adminId, key],
		});
		if (!row) return null;
		if (row.request_hash_sha256 !== requestHash) {
			throw new PrivacyRepositoryError('IDEMPOTENCY_KEY_REUSED');
		}
		return { status: row.result_status, replayed: true };
	}

	async processDelete(input: {
		admin: AdminActor;
		privacyRequestId: string;
		reason: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		const requestHash = await hashCanonical({
			privacyRequestId: input.privacyRequestId,
			action: 'process_delete',
			reason: input.reason,
		});
		const replay = await this.adminActionReplay(input.admin.id, input.idempotencyKey, requestHash);
		if (replay) return replay;
		const request = await this.db.first<{
			id: string; subject_user_id: string; status: string; kind: string;
		}>({
			sql: `SELECT id, subject_user_id, status, kind FROM privacy_requests WHERE id = ?`,
			params: [input.privacyRequestId],
		});
		if (!request || request.kind !== 'delete' ||
			!['requested', 'reviewing', 'approved'].includes(request.status)) {
			throw new PrivacyRepositoryError('PRIVACY_DELETE_STATE_REJECTED');
		}
		const inventory = await this.deletionInventory(request.subject_user_id);
		if (inventory.activeContractCount > 0) {
			return this.blockDelete({ ...input, subjectUserId: request.subject_user_id,
				requestHash, inventory });
		}
		try {
			return await this.completeClosure({ ...input, subjectUserId: request.subject_user_id,
				requestHash, inventory });
		} catch (error) {
			if (!(error instanceof PrivacyRepositoryError) ||
				error.code !== 'PRIVACY_CLOSURE_REJECTED') throw error;

			// A contract-formation batch may win after the inventory read but before the
			// closure batch. Reclassify that serialised outcome as the documented blocker
			// instead of exposing an implementation-level D1 constraint failure.
			const refreshed = await this.deletionInventory(request.subject_user_id);
			if (refreshed.activeContractCount > 0) {
				return this.blockDelete({ ...input, subjectUserId: request.subject_user_id,
					requestHash, inventory: refreshed });
			}
			throw error;
		}
	}

	private async blockDelete(input: {
		admin: AdminActor;
		privacyRequestId: string;
		subjectUserId: string;
		reason: string;
		idempotencyKey: string;
		requestId: string;
		requestHash: string;
		inventory: PrivacyDeletionInventory;
		now: string;
	}) {
		const auditId = crypto.randomUUID();
		const actionId = crypto.randomUUID();
		const safeResult = {
			activeContracts: input.inventory.activeContracts,
			retainedCategories: input.inventory.retainedCategories,
			holds: input.inventory.holds,
		};
		try {
			await this.db.batch([
				{
					sql: `UPDATE privacy_requests SET status = 'blocked_by_active_contract',
						decision_reason = 'ACTIVE_CONTRACT_PRESENT', reviewed_by = ?, reviewed_at = ?,
						safe_summary_json = ?, completed_at = ?, updated_at = ?
					WHERE id = ? AND kind = 'delete' AND status IN ('requested','reviewing','approved')
						AND EXISTS (${ACTIVE_CONTRACTS_SQL})`,
					params: [input.admin.id, input.now, JSON.stringify(safeResult), input.now, input.now,
						input.privacyRequestId, input.subjectUserId, input.subjectUserId,
						input.subjectUserId, input.subjectUserId],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'privacy.delete.blocked', 'privacy_request', id,
						?, ?, ? FROM privacy_requests
					WHERE id = ? AND status = 'blocked_by_active_contract'`,
					params: [auditId, input.admin.id, input.requestId,
						JSON.stringify({ activeContractCount: input.inventory.activeContractCount }),
						input.now, input.privacyRequestId],
				},
				{
					sql: `INSERT INTO privacy_admin_actions
						(id, privacy_request_id, action, actor_user_id, idempotency_key,
						 request_hash_sha256, result_status, audit_event_id, created_at)
					SELECT ?, ?, 'process_delete', ?, ?, ?, 'blocked_by_active_contract', ?, ?
					WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
					params: [actionId, input.privacyRequestId, input.admin.id, input.idempotencyKey,
						input.requestHash, auditId, input.now, auditId],
				},
				{
					sql: `INSERT INTO privacy_closure_results
						(privacy_request_id, subject_user_id, result_status, account_closed_at,
						 active_contract_count, media_revocation_count, retained_record_count,
						 cleanup_job_count, safe_result_json, created_at)
					SELECT id, subject_user_id, 'blocked_by_active_contract', NULL, ?, 0, ?, 0, ?, ?
					FROM privacy_requests WHERE id = ? AND status = 'blocked_by_active_contract'`,
					params: [input.inventory.activeContractCount, input.inventory.retainedRecordCount,
						JSON.stringify(safeResult), input.now, input.privacyRequestId],
				},
				{
					sql: `INSERT INTO privacy_transaction_assertions
						(id, privacy_request_id, scope, action_id, assertion_passed, created_at)
					VALUES (?, ?, 'delete_blocked', ?, CASE WHEN
						EXISTS (SELECT 1 FROM privacy_admin_actions WHERE id = ?)
						AND EXISTS (SELECT 1 FROM privacy_closure_results WHERE privacy_request_id = ?
							AND result_status = 'blocked_by_active_contract')
						AND EXISTS (SELECT 1 FROM users WHERE id = ? AND account_status = 'active')
						AND NOT EXISTS (SELECT 1 FROM media_consents
							WHERE source_privacy_request_id = ? AND decision_source = 'account_deletion')
					THEN 1 ELSE 0 END, ?)`,
					params: [crypto.randomUUID(), input.privacyRequestId, actionId, actionId,
						input.privacyRequestId, input.subjectUserId, input.privacyRequestId, input.now],
				},
			]);
			return { status: 'blocked_by_active_contract' as const, replayed: false };
		} catch (error) {
			const replay = await this.adminActionReplay(input.admin.id, input.idempotencyKey,
				input.requestHash);
			if (replay) return replay;
			throw new PrivacyRepositoryError('PRIVACY_DELETE_BLOCK_REJECTED', { cause: error });
		}
	}

	private async completeClosure(input: {
		admin: AdminActor;
		privacyRequestId: string;
		subjectUserId: string;
		reason: string;
		idempotencyKey: string;
		requestId: string;
		requestHash: string;
		inventory: PrivacyDeletionInventory;
		now: string;
	}) {
		const auditId = crypto.randomUUID();
		const actionId = crypto.randomUUID();
		const tombstone = `closed-${crypto.randomUUID()}@tombstone.invalid`;
		const minimizedObjectHash = await hashCanonical({});
		const closureEvidenceHash = await hashCanonical({
			privacyRequestId: input.privacyRequestId,
			subjectUserId: input.subjectUserId,
			closedAt: input.now,
			source: 'account_deletion',
		});
		const lock = `EXISTS (SELECT 1 FROM privacy_requests request
			JOIN users owner ON owner.id = request.subject_user_id
			WHERE request.id = ? AND request.status = 'processing'
				AND owner.account_status = 'deletion_requested')`;
		const statements: StatementSpec[] = [
			{
				sql: `UPDATE privacy_requests SET status = 'processing', reviewed_by = ?,
					reviewed_at = ?, decision_reason = ?, safe_summary_json = ?, updated_at = ?
				WHERE id = ? AND kind = 'delete' AND status IN ('requested','reviewing','approved')
					AND NOT EXISTS (${ACTIVE_CONTRACTS_SQL})`,
				params: [input.admin.id, input.now, input.reason,
					JSON.stringify({ retainedCategories: input.inventory.retainedCategories,
						holds: input.inventory.holds, d1Cleanup: input.inventory.d1Cleanup,
						r2Cleanup: input.inventory.r2Cleanup }), input.now, input.privacyRequestId,
					input.subjectUserId, input.subjectUserId, input.subjectUserId, input.subjectUserId],
			},
			{
				sql: `UPDATE users SET account_status = 'deletion_requested', updated_at = ?
				WHERE id = ? AND account_status = 'active' AND EXISTS (
					SELECT 1 FROM privacy_requests request WHERE request.id = ?
						AND request.subject_user_id = users.id AND request.status = 'processing')
					AND NOT EXISTS (SELECT 1 FROM email_outbox outbox
						WHERE outbox.recipient_user_id = users.id AND outbox.status = 'processing')`,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `INSERT INTO media_consents
					(id, user_id, child_id, capture_scopes_json, publication_channels_json,
					 text_version, withdrawal_contact_version_id, withdrawal_contact_snapshot_hash,
					 decision, decision_source, decided_at, received_at, effective_from,
					 recorded_by_user_id, recorded_at, evidence_hash, request_dedupe_key,
					 source_contract_offer_id, source_privacy_request_id,
					 supersedes_consent_id, created_at)
				SELECT 'privacy-revoke:' || ? || ':' || grant.id, grant.user_id, grant.child_id,
					grant.capture_scopes_json, grant.publication_channels_json, grant.text_version,
					grant.withdrawal_contact_version_id, grant.withdrawal_contact_snapshot_hash,
					'revoked', 'account_deletion', ?, ?, ?, ?, ?, ?,
					'account-deletion:' || ? || ':' || grant.id, NULL, ?, grant.id, ?
				FROM media_consents grant WHERE grant.user_id = ? AND grant.decision = 'granted'
					AND NOT EXISTS (SELECT 1 FROM media_consents revoke
						WHERE revoke.supersedes_consent_id = grant.id AND revoke.decision = 'revoked')
					AND ${lock}`,
				params: [input.privacyRequestId, input.now, input.now, input.now,
					input.admin.id, input.now, closureEvidenceHash, input.privacyRequestId,
					input.privacyRequestId, input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE contract_offers SET status = 'cancelled', cancelled_at = ?,
					status_reason = 'account_deletion', provider_snapshot_json = '{}',
					party_snapshot_json = '{}', service_snapshot_json = '{}',
					schedule_snapshot_json = '[]', billing_snapshot_json = '{}',
					line_items_json = '[]', term_snapshot_json = '{}',
					termination_snapshot_json = '{}', withdrawal_snapshot_json = '{}',
					distance_legal_profile_snapshot_json = '{}', distance_legal_basis_hash = NULL,
					early_performance_request_version = NULL, early_performance_requested_at = NULL,
					wertersatz_notice_version = NULL, clauses_manifest_json = '{}',
					attachments_manifest_json = '[]', media_decision_snapshot_json = NULL,
					render_input_json = '{}', render_input_hash = ?, source_manifest_json = '{}',
					source_manifest_hash = ?, updated_at = ?
				WHERE user_id = ? AND status = 'draft' AND ${lock}`,
				params: [input.now, minimizedObjectHash, minimizedObjectHash, input.now,
					input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE contract_offers SET status = 'cancelled', cancelled_at = ?,
					status_reason = 'account_deletion', updated_at = ?
				WHERE user_id = ? AND status IN ('sent','accepted_by_parent') AND ${lock}`,
				params: [input.now, input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE price_review_items SET status = 'cancelled', updated_at = ?
				WHERE user_id = ? AND status IN ('draft','manual_contact_required',
					'notification_approved','sent','accepted_by_parent','approved_by_admin','scheduled')
					AND ${lock}`,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE trial_bookings SET status = 'cancelled', decision_reason = 'account_deletion',
					updated_at = ? WHERE user_id = ? AND status IN ('requested','confirmed') AND ${lock}`,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE trial_bookings SET decision_reason = 'account_deletion', updated_at = ?
				WHERE user_id = ? AND coalesce(decision_reason, '') <> 'account_deletion' AND ${lock}`,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE individual_requests SET status = 'cancelled',
					admin_decision = 'cancelled', reviewed_by = ?, reviewed_at = ?, updated_at = ?
				WHERE user_id = ? AND status NOT IN ('rejected','cancelled') AND ${lock}`,
				params: [input.admin.id, input.now, input.now, input.subjectUserId,
					input.privacyRequestId],
			},
			{
				sql: `UPDATE individual_requests SET subjects_raw = '[account-closed]',
					description = '', preferred_days_json = '[]',
					preferred_time_windows_json = '[]', preferred_format = 'onsite',
					preferred_locations_json = '[]', admin_notes = NULL, updated_at = ?
				WHERE user_id = ? AND ${lock}`,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE enrollments SET status = 'cancelled', updated_at = ?
				WHERE user_id = ? AND status IN ('draft','contract_offered') AND ${lock}`,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE service_engagements SET status = 'cancelled', updated_at = ?
				WHERE user_id = ? AND status IN ('draft','contract_offered') AND ${lock}`,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE support_threads SET status = 'closed',
					subject = '[account-closed]', closed_at = coalesce(closed_at, ?), updated_at = ?
				WHERE user_id = ? AND ${lock}`,
				params: [input.now, input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE support_messages SET body = '[account-closed]'
				WHERE body <> '[account-closed]' AND EXISTS (
					SELECT 1 FROM support_threads thread WHERE thread.id = support_messages.thread_id
						AND thread.user_id = ? AND ${lock})`,
				params: [input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE absence_reports SET reason_text = '[account-closed]'
				WHERE user_id = ? AND reason_text <> '[account-closed]' AND ${lock}`,
				params: [input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE privacy_requests SET status = 'cancelled',
					decision_reason = 'ACCOUNT_CLOSED', completed_at = ?, updated_at = ?
				WHERE subject_user_id = ? AND id <> ?
					AND status IN ('requested','reviewing','approved','processing','failed') AND ${lock}`,
				params: [input.now, input.now, input.subjectUserId, input.privacyRequestId,
					input.privacyRequestId],
			},
			{
				sql: `UPDATE email_outbox SET status = 'cancelled', updated_at = ?
				WHERE recipient_user_id = ? AND status IN ('pending','retry') AND ${lock}`,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `INSERT OR IGNORE INTO privacy_r2_cleanup_jobs
					(id, privacy_request_id, subject_user_id, object_kind, private_r2_key,
					 source_record_id, status, attempts, last_error_code, completed_at,
					 created_at, updated_at)
				SELECT 'privacy-cleanup:export:' || artifact.id, ?, ?, 'privacy_export',
					artifact.private_r2_key, artifact.id, 'pending', 0, NULL, NULL, ?, ?
				FROM privacy_export_artifacts artifact WHERE artifact.subject_user_id = ?
					AND artifact.status = 'ready' AND ${lock}`,
				params: [input.privacyRequestId, input.subjectUserId, input.now, input.now,
					input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `INSERT OR IGNORE INTO privacy_r2_cleanup_jobs
					(id, privacy_request_id, subject_user_id, object_kind, private_r2_key,
					 source_record_id, status, attempts, last_error_code, completed_at,
					 created_at, updated_at)
				SELECT 'privacy-cleanup:quarantine:' || document.id, ?, ?, 'document_quarantine',
					document.quarantine_r2_key, document.id, 'pending', 0, NULL, NULL, ?, ?
				FROM authorization_documents document WHERE document.user_id = ?
					AND document.quarantine_delete_state = 'present' AND ${lock}`,
				params: [input.privacyRequestId, input.subjectUserId, input.now, input.now,
					input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE privacy_export_artifacts SET status = 'delete_pending', updated_at = ?
				WHERE subject_user_id = ? AND status = 'ready' AND EXISTS (
					SELECT 1 FROM privacy_r2_cleanup_jobs job WHERE job.source_record_id = privacy_export_artifacts.id
						AND job.object_kind = 'privacy_export' AND job.privacy_request_id = ?)` ,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			...retainedSets(input.subjectUserId).flatMap((set): StatementSpec[] => [
				{
					sql: `${set.cte} INSERT OR IGNORE INTO retention_controls
						(id, target_kind, target_id, retention_class, legal_basis,
						 retention_started_on, retain_until, legal_hold, hold_reason,
						 hold_set_by, hold_set_at, hold_review_on, purge_status, policy_version,
						 purged_or_anonymized_at, created_at, updated_at)
					SELECT 'retention:' || target_kind || ':' || target_id, target_kind, target_id,
						retention_class, legal_basis, retention_started_on, NULL, 0, NULL,
						NULL, NULL, NULL, 'disabled_by_policy', ?, NULL, ?, ? FROM retained
					WHERE ${lock}`,
					params: [...set.params, RETENTION_POLICY_VERSION,
						input.now, input.now, input.privacyRequestId],
				},
				{
					sql: `${set.cte} INSERT OR IGNORE INTO legal_archive_records
						(id, privacy_request_id, owner_tombstone_user_id, target_kind, target_id,
						 retention_control_id, retention_class, private_r2_key, archived_at, created_at)
					SELECT 'legal-archive:' || retained.target_kind || ':' || retained.target_id,
						?, ?, retained.target_kind, retained.target_id, control.id,
						retained.retention_class, retained.private_r2_key, ?, ?
					FROM retained JOIN retention_controls control
						ON control.target_kind = retained.target_kind AND control.target_id = retained.target_id
					WHERE ${lock}`,
					params: [...set.params, input.privacyRequestId,
						input.subjectUserId, input.now, input.now, input.privacyRequestId],
				},
			]),
			{
				sql: `UPDATE legacy_families SET claimed_by_user_id = NULL, claimed_at = NULL,
					updated_at = ? WHERE claimed_by_user_id = ? AND ${lock}`,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE children SET owner_user_id = NULL,
					source_full_name = CASE WHEN origin = 'portal' THEN 'Geschlossenes Profil'
						ELSE source_full_name END,
					source_full_name_normalized = CASE WHEN origin = 'portal' THEN 'geschlossenes profil'
						ELSE source_full_name_normalized END,
					source_birth_date = CASE WHEN origin = 'portal' THEN '1970-01-01'
						ELSE source_birth_date END,
					full_name_override = NULL, birth_date_override = NULL,
					full_name = CASE WHEN origin = 'portal' THEN 'Geschlossenes Profil' ELSE full_name END,
					full_name_normalized = CASE WHEN origin = 'portal' THEN 'geschlossenes profil'
						ELSE full_name_normalized END,
					birth_date = CASE WHEN origin = 'portal' THEN '1970-01-01' ELSE birth_date END,
					is_current = 0, minimized_at = ?, updated_at = ?
				WHERE owner_user_id = ? AND ${lock}`,
				params: [input.now, input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE family_number_allocations SET owner_user_id = NULL,
					status = CASE WHEN namespace = 'portal_2' THEN 'retired' ELSE status END,
					updated_at = ? WHERE owner_user_id = ? AND status = 'assigned' AND ${lock}`,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE auth_sessions SET revoked_at = ?, revocation_reason = 'account_deletion'
				WHERE user_id = ? AND revoked_at IS NULL AND ${lock}`,
				params: [input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE auth_tokens SET used_at = ?, used_by_request_id = ?
				WHERE user_id = ? AND used_at IS NULL AND ${lock}`,
				params: [input.now, `privacy:${input.privacyRequestId}`, input.subjectUserId,
					input.privacyRequestId],
			},
			{
				sql: `UPDATE users SET email = ?, email_normalized = ?, password_hash = ?,
					pending_email = NULL, pending_email_normalized = NULL,
					pending_email_expires_at = NULL, email_version = email_version + 1,
					email_verified_at = NULL, account_status = 'closed', closed_at = ?,
					first_name = 'Geschlossenes', last_name = 'Konto',
					first_name_normalized = 'geschlossenes', last_name_normalized = 'konto',
					phone = NULL, preferred_language = 'de', family_number_id = NULL,
					family_assignment_status = 'pending_verification',
					family_assignment_import_run_id = NULL, session_version = session_version + 1,
					updated_at = ? WHERE id = ? AND account_status = 'deletion_requested'
					AND EXISTS (SELECT 1 FROM privacy_requests request WHERE request.id = ?
						AND request.status = 'processing')`,
				params: [tombstone, tombstone, `closed:${crypto.randomUUID()}`, input.now,
					input.now, input.subjectUserId, input.privacyRequestId],
			},
			{
				sql: `UPDATE privacy_requests SET status = 'completed_with_retained_evidence',
					completed_at = ?, updated_at = ? WHERE id = ? AND status = 'processing'
					AND EXISTS (SELECT 1 FROM users WHERE id = subject_user_id
						AND account_status = 'closed' AND closed_at = ?)`,
				params: [input.now, input.now, input.privacyRequestId, input.now],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
				SELECT ?, ?, 'user', 'privacy.account.closed', 'privacy_request', id,
					?, ?, ? FROM privacy_requests WHERE id = ?
					AND status = 'completed_with_retained_evidence'`,
				params: [auditId, input.admin.id, input.requestId,
					JSON.stringify({ status: 'completed_with_retained_evidence',
						retainedCategories: input.inventory.retainedCategories.map((item) => item.category),
						holdCount: input.inventory.holdCount }), input.now, input.privacyRequestId],
			},
			{
				sql: `INSERT INTO privacy_admin_actions
					(id, privacy_request_id, action, actor_user_id, idempotency_key,
					 request_hash_sha256, result_status, audit_event_id, created_at)
				SELECT ?, ?, 'process_delete', ?, ?, ?, 'completed_with_retained_evidence', ?, ?
				WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
				params: [actionId, input.privacyRequestId, input.admin.id, input.idempotencyKey,
					input.requestHash, auditId, input.now, auditId],
			},
			{
				sql: `INSERT INTO privacy_closure_results
					(privacy_request_id, subject_user_id, result_status, account_closed_at,
					 active_contract_count, media_revocation_count, retained_record_count,
					 cleanup_job_count, safe_result_json, created_at)
				SELECT request.id, request.subject_user_id, 'completed_with_retained_evidence', ?, 0,
					(SELECT COUNT(*) FROM media_consents consent
						WHERE consent.source_privacy_request_id = request.id
							AND consent.decision_source = 'account_deletion'),
					(SELECT COUNT(*) FROM legal_archive_records archive
						WHERE archive.privacy_request_id = request.id),
					(SELECT COUNT(*) FROM privacy_r2_cleanup_jobs job
						WHERE job.privacy_request_id = request.id), ?, ?
				FROM privacy_requests request WHERE request.id = ?
					AND request.status = 'completed_with_retained_evidence'`,
				params: [input.now, JSON.stringify({ retainedCategories: input.inventory.retainedCategories,
					holds: input.inventory.holds, automaticArchivePurge: 'disabled_by_policy' }),
					input.now, input.privacyRequestId],
			},
			{
				sql: `INSERT INTO privacy_transaction_assertions
					(id, privacy_request_id, scope, action_id, assertion_passed, created_at)
				VALUES (?, ?, 'closure_complete', ?, CASE WHEN
					EXISTS (SELECT 1 FROM privacy_admin_actions WHERE id = ?)
					AND EXISTS (SELECT 1 FROM users WHERE id = ? AND account_status = 'closed'
						AND closed_at = ? AND family_number_id IS NULL)
					AND EXISTS (SELECT 1 FROM privacy_closure_results WHERE privacy_request_id = ?
						AND result_status = 'completed_with_retained_evidence')
					AND NOT EXISTS (SELECT 1 FROM email_outbox outbox
						WHERE outbox.recipient_user_id = ? AND outbox.status = 'processing')
					AND NOT EXISTS (SELECT 1 FROM individual_requests request
						WHERE request.user_id = ? AND (request.subjects_raw <> '[account-closed]'
							OR request.description <> '' OR request.preferred_days_json <> '[]'
							OR request.preferred_time_windows_json <> '[]'
							OR request.preferred_locations_json <> '[]' OR request.admin_notes IS NOT NULL))
					AND NOT EXISTS (SELECT 1 FROM support_threads thread
						WHERE thread.user_id = ? AND (thread.subject <> '[account-closed]'
							OR EXISTS (SELECT 1 FROM support_messages message
								WHERE message.thread_id = thread.id AND message.body <> '[account-closed]')))
					AND NOT EXISTS (SELECT 1 FROM trial_bookings trial
						WHERE trial.user_id = ?
							AND coalesce(trial.decision_reason, '') <> 'account_deletion')
					AND NOT EXISTS (SELECT 1 FROM contract_offers offer
						WHERE offer.user_id = ?
							AND NOT EXISTS (SELECT 1 FROM contract_artifacts artifact
								WHERE artifact.contract_offer_id = offer.id)
							AND NOT EXISTS (SELECT 1 FROM contract_parent_actions action
								WHERE action.contract_offer_id = offer.id)
							AND NOT EXISTS (SELECT 1 FROM contracts contract
								WHERE contract.contract_offer_id = offer.id)
							AND (offer.party_snapshot_json <> '{}'
								OR offer.render_input_json <> '{}' OR offer.source_manifest_json <> '{}'))
					AND NOT EXISTS (${ACTIVE_CONTRACTS_SQL})
					AND NOT EXISTS (SELECT 1 FROM media_consents grant
						WHERE grant.user_id = ? AND grant.decision = 'granted'
							AND NOT EXISTS (SELECT 1 FROM media_consents revoke
								WHERE revoke.supersedes_consent_id = grant.id
									AND revoke.decision = 'revoked'
									AND revoke.source_privacy_request_id = ?))
					AND NOT EXISTS (SELECT 1 FROM legal_archive_records archive
						JOIN retention_controls control ON control.id = archive.retention_control_id
						WHERE archive.privacy_request_id = ?
							AND control.purge_status <> 'disabled_by_policy')
				THEN 1 ELSE 0 END, ?)`,
				params: [crypto.randomUUID(), input.privacyRequestId, actionId, actionId,
					input.subjectUserId, input.now, input.privacyRequestId, input.subjectUserId,
					input.subjectUserId, input.subjectUserId, input.subjectUserId, input.subjectUserId,
					input.subjectUserId, input.subjectUserId, input.subjectUserId, input.subjectUserId,
					input.subjectUserId, input.privacyRequestId, input.privacyRequestId, input.now],
			},
		];
		try {
			await this.db.batch(statements);
			return { status: 'completed_with_retained_evidence' as const, replayed: false };
		} catch (error) {
			const replay = await this.adminActionReplay(input.admin.id, input.idempotencyKey,
				input.requestHash);
			if (replay) return replay;
			throw new PrivacyRepositoryError('PRIVACY_CLOSURE_REJECTED', { cause: error });
		}
	}

	async queueExpiredExports(now: string, limit: number) {
		const candidates = await this.db.all<{
			id: string; privacy_request_id: string; subject_user_id: string; private_r2_key: string;
		}>({
			sql: `SELECT id, privacy_request_id, subject_user_id, private_r2_key
			FROM privacy_export_artifacts WHERE status = 'ready' AND expires_at <= ?
			ORDER BY expires_at, id LIMIT ?`,
			params: [now, limit],
		});
		for (const artifact of candidates.results) {
			await this.db.batch([
				{
					sql: `INSERT OR IGNORE INTO privacy_r2_cleanup_jobs
						(id, privacy_request_id, subject_user_id, object_kind, private_r2_key,
						 source_record_id, status, attempts, last_error_code, completed_at,
						 created_at, updated_at)
					VALUES (?, ?, ?, 'privacy_export', ?, ?, 'pending', 0, NULL, NULL, ?, ?)`,
					params: [`privacy-cleanup:export:${artifact.id}`, artifact.privacy_request_id,
						artifact.subject_user_id, artifact.private_r2_key, artifact.id, now, now],
				},
				{
					sql: `UPDATE privacy_export_artifacts SET status = 'delete_pending', updated_at = ?
					WHERE id = ? AND status = 'ready' AND expires_at <= ?
						AND EXISTS (SELECT 1 FROM privacy_r2_cleanup_jobs
							WHERE source_record_id = privacy_export_artifacts.id
								AND object_kind = 'privacy_export')`,
					params: [now, artifact.id, now],
				},
			]);
		}
		return candidates.results.length;
	}

	async claimCleanupJobs(
		privacyRequestId: string | null,
		now: string,
		limit: number,
		leaseOwner: string,
		leaseSeconds: number
	) {
		const leaseUntil = new Date(Date.parse(now) + leaseSeconds * 1000).toISOString();
		const candidates = await this.db.all<{
			id: string; object_kind: 'privacy_export' | 'document_quarantine';
			private_r2_key: string; source_record_id: string;
		}>({
			sql: `SELECT job.id, job.object_kind, job.private_r2_key, job.source_record_id
			FROM privacy_r2_cleanup_jobs job
			WHERE (job.status IN ('pending','failed')
				OR (job.status = 'processing' AND job.lease_until <= ?))
				AND (? IS NULL OR job.privacy_request_id = ?)
				AND (job.object_kind = 'privacy_export' OR EXISTS (
					SELECT 1 FROM authorization_documents document
					WHERE document.id = job.source_record_id
						AND document.quarantine_delete_state = 'present'
						AND document.quarantine_expires_at <= ?))
			ORDER BY job.created_at, job.id LIMIT ?`,
			params: [now, privacyRequestId, privacyRequestId, now, limit],
		});
		const claimed: typeof candidates.results = [];
		for (const candidate of candidates.results) {
			const result = await this.db.run({
				sql: `UPDATE privacy_r2_cleanup_jobs SET status = 'processing', attempts = attempts + 1,
					last_error_code = NULL, lease_owner = ?, lease_until = ?, updated_at = ?
				WHERE id = ? AND (status IN ('pending','failed')
					OR (status = 'processing' AND lease_until <= ?))`,
				params: [leaseOwner, leaseUntil, now, candidate.id, now],
			});
			if ((result.meta.changes ?? 0) === 1) claimed.push(candidate);
		}
		return claimed;
	}

	async completeCleanupJob(input: {
		jobId: string;
		leaseOwner: string;
		objectKind: 'privacy_export' | 'document_quarantine';
		sourceRecordId: string;
		now: string;
	}) {
		const auditId = `privacy-cleanup-audit:${input.jobId}`;
		const recordUpdate: StatementSpec = input.objectKind === 'privacy_export'
			? {
					sql: `UPDATE privacy_export_artifacts SET status = 'deleted', deleted_at = ?, updated_at = ?
					WHERE id = ? AND status = 'delete_pending' AND EXISTS (
						SELECT 1 FROM privacy_r2_cleanup_jobs WHERE id = ? AND status = 'processing'
							AND lease_owner = ?)`,
					params: [input.now, input.now, input.sourceRecordId, input.jobId, input.leaseOwner],
				}
			: {
					sql: `UPDATE authorization_documents SET
						review_status = CASE WHEN review_status IN
							('quarantined','clean','infected','rejected') THEN 'deleted' ELSE review_status END,
						quarantine_delete_state = 'deleted', quarantine_purged_at = ?, updated_at = ?
					WHERE id = ? AND quarantine_delete_state = 'present' AND EXISTS (
						SELECT 1 FROM privacy_r2_cleanup_jobs WHERE id = ? AND status = 'processing'
							AND lease_owner = ?)`,
					params: [input.now, input.now, input.sourceRecordId, input.jobId, input.leaseOwner],
				};
		const results = await this.db.batch([
			recordUpdate,
			{
				sql: `UPDATE privacy_r2_cleanup_jobs SET status = 'completed', completed_at = ?,
					updated_at = ?, last_error_code = NULL, lease_owner = NULL, lease_until = NULL
					WHERE id = ? AND status = 'processing' AND lease_owner = ? AND (
						(? = 'privacy_export' AND EXISTS (
							SELECT 1 FROM privacy_export_artifacts artifact
							WHERE artifact.id = ? AND artifact.status = 'deleted'))
						OR (? = 'document_quarantine' AND EXISTS (
							SELECT 1 FROM authorization_documents document
							WHERE document.id = ?
								AND document.quarantine_delete_state = 'deleted'))
					)`,
				params: [input.now, input.now, input.jobId, input.leaseOwner,
					input.objectKind, input.sourceRecordId, input.objectKind, input.sourceRecordId],
			},
			{
				sql: `INSERT OR IGNORE INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
				SELECT ?, NULL, 'system', 'privacy.r2_cleanup.completed',
					'privacy_r2_cleanup_job', id, 'privacy-cleanup:' || id,
					?, ? FROM privacy_r2_cleanup_jobs WHERE id = ? AND status = 'completed'`,
				params: [auditId, JSON.stringify({ objectKind: input.objectKind }),
					input.now, input.jobId],
			},
		]);
		return (results[1]?.meta.changes ?? 0) === 1;
	}

	async failCleanupJob(
		jobId: string,
		leaseOwner: string,
		now: string,
		errorCode: 'R2_DELETE_FAILED' | 'D1_FINALIZE_FAILED' = 'R2_DELETE_FAILED'
	): Promise<void> {
		await this.db.run({
			sql: `UPDATE privacy_r2_cleanup_jobs SET status = 'failed',
				last_error_code = ?, updated_at = ?,
				lease_owner = NULL, lease_until = NULL
			WHERE id = ? AND status = 'processing' AND lease_owner = ?`,
			params: [errorCode, now, jobId, leaseOwner],
		});
	}

	async cleanupState(privacyRequestId: string) {
		const rows = await this.db.all<{ status: string; count: number }>({
			sql: `SELECT status, COUNT(*) AS count FROM privacy_r2_cleanup_jobs
			WHERE privacy_request_id = ? GROUP BY status ORDER BY status`,
			params: [privacyRequestId],
		});
		return rows.results;
	}
}

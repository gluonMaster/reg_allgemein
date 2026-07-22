import type {
	FamilyCorrectionConsequenceSnapshot,
	FamilyCorrectionContributor,
} from '$lib/server/admin/family-correction-repository';
import type { StatementSpec } from '$lib/server/db/database';
import { DatabaseBoundary } from '$lib/server/db/database';
import type { DocumentMutationGuard } from '$lib/server/documents/document-repository';
import type { FundingDiscontinuityContributor } from '$lib/server/requests/funding-boundary';
import type { RequestMutationGuard } from '$lib/server/requests/request-repository';

const OPEN_OFFER_STATUSES = "'draft','sent','accepted_by_parent'";

export class ContractRequestMutationGuard implements RequestMutationGuard {
	assertion(input: { requestId: string; operation: 'cancel' }) {
		return {
			sql: `NOT EXISTS (SELECT 1 FROM contract_offers
				WHERE individual_request_id = ? AND status IN
				('sent', 'accepted_by_parent', 'approved_by_admin'))`,
			params: [input.requestId] as const,
		};
	}
}

export class ContractDocumentMutationGuard implements DocumentMutationGuard {
	assertion(input: { documentId: string; operation: 'replace' | 'delete' }) {
		return {
			sql: `NOT EXISTS (
				SELECT 1 FROM authorization_documents document
				JOIN contract_offers offer
					ON offer.funding_authorization_id = document.authorization_id
				WHERE document.id = ? AND offer.status IN
					('sent', 'accepted_by_parent', 'approved_by_admin'))`,
			params: [input.documentId] as const,
		};
	}
}

export class ContractFundingDiscontinuityContributor
	implements FundingDiscontinuityContributor
{
	constructor(private readonly db: DatabaseBoundary) {}

	async contribute(input: {
		authorizationId: string;
		requestId: string;
		eventKind: 'revoked' | 'superseded' | 'expired';
		effectiveOn: string;
		reason: string;
		actorUserId: string | null;
		now: string;
	}) {
		const [offers, engagements] = await Promise.all([
			this.db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM contract_offers
				WHERE funding_authorization_id = ? AND status IN (${OPEN_OFFER_STATUSES})`,
				params: [input.authorizationId],
			}),
			this.db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM service_engagements
				WHERE current_funding_authorization_id = ? AND status = 'active'`,
				params: [input.authorizationId],
			}),
		]);
		const affected = (offers?.count ?? 0) + (engagements?.count ?? 0);
		const taskId = `funding-review:${input.authorizationId}:${input.eventKind}`;
		const statements: StatementSpec[] = [
			{
				sql: `UPDATE contract_offers SET status = 'superseded', status_reason = ?,
					updated_at = ? WHERE funding_authorization_id = ?
					AND status IN (${OPEN_OFFER_STATUSES})`,
				params: [`funding_${input.eventKind}`, input.now, input.authorizationId],
			},
			{
				sql: `UPDATE service_engagements SET status = 'funding_review', updated_at = ?
				WHERE current_funding_authorization_id = ? AND status = 'active'`,
				params: [input.now, input.authorizationId],
			},
			...(affected > 0
				? [
						{
							sql: `INSERT INTO admin_review_tasks
								(id, kind, source_kind, source_id, reason_code, safe_summary,
								 status, assigned_to, resolution, created_at, updated_at, resolved_at)
							SELECT ?, 'funding_discontinuity', 'funding_authorization', ?, ?, ?,
								'open', NULL, NULL, ?, ?, NULL WHERE NOT EXISTS (
								SELECT 1 FROM admin_review_tasks WHERE source_kind = 'funding_authorization'
									AND source_id = ? AND reason_code = ?
									AND status IN ('open', 'in_progress'))`,
							params: [taskId, input.authorizationId, `funding_${input.eventKind}`,
								JSON.stringify({ requestId: input.requestId, effectiveOn: input.effectiveOn }),
								input.now, input.now, input.authorizationId, `funding_${input.eventKind}`],
						},
					]
				: []),
		];
		return {
			statements,
			assertionSql: `NOT EXISTS (SELECT 1 FROM contract_offers
				WHERE funding_authorization_id = ? AND status IN (${OPEN_OFFER_STATUSES}))
				AND NOT EXISTS (SELECT 1 FROM service_engagements
					WHERE current_funding_authorization_id = ? AND status = 'active')
				AND (? = 0 OR EXISTS (SELECT 1 FROM admin_review_tasks WHERE id = ?))`,
			assertionParams: [input.authorizationId, input.authorizationId, affected, taskId],
			safeSummary: {
				contractTablesAvailable: true,
				openOffersSuperseded: offers?.count ?? 0,
				activeEngagementsMovedToFundingReview: engagements?.count ?? 0,
				adminTasksCreated: affected > 0 ? 1 : 0,
			},
		};
	}
}

export class ContractFamilyCorrectionContributor implements FamilyCorrectionContributor {
	constructor(private readonly db: DatabaseBoundary) {}

	async preview(input: {
		userId: string;
		fromFamilyNumberId: string;
		toFamilyNumberId: string;
	}): Promise<FamilyCorrectionConsequenceSnapshot> {
		const [offers, contracts] = await Promise.all([
			this.db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM contract_offers
				WHERE user_id = ? AND family_number_id_at_issue = ?
					AND status IN (${OPEN_OFFER_STATUSES})`,
				params: [input.userId, input.fromFamilyNumberId],
			}),
			this.db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM contracts
				WHERE user_id = ? AND contract_offer_id IN (
					SELECT id FROM contract_offers WHERE family_number_id_at_issue = ?)`,
				params: [input.userId, input.fromFamilyNumberId],
			}),
		]);
		return {
			contributorVersion: 'stage-09-contract-family-effects-v1',
			nonterminalOfferCount: offers?.count ?? 0,
			immutableContractCount: contracts?.count ?? 0,
			safeDetails: {
				contractTablesAvailable: true,
				futureSequenceFamilyNumberId: input.toFamilyNumberId,
				issuedNumbersRemainImmutable: true,
			},
		};
	}

	async applyStatements(input: {
		previewId: string;
		reassignmentId: string;
		userId: string;
		fromFamilyNumberId: string;
		toFamilyNumberId: string;
		now: string;
	}): Promise<readonly StatementSpec[]> {
		return [
			{
				sql: `INSERT INTO contract_family_reassignment_effects
					(id, reassignment_id, contract_offer_id, from_family_number_id,
					 to_family_number_id, old_status, new_status, created_at)
				SELECT lower(hex(randomblob(16))), ?, id, ?, ?, status, 'superseded', ?
				FROM contract_offers WHERE user_id = ? AND family_number_id_at_issue = ?
					AND status IN (${OPEN_OFFER_STATUSES})`,
				params: [input.reassignmentId, input.fromFamilyNumberId,
					input.toFamilyNumberId, input.now, input.userId, input.fromFamilyNumberId],
			},
			{
				sql: `UPDATE contract_offers SET status = 'superseded',
					status_reason = 'family_reassigned', updated_at = ?
				WHERE user_id = ? AND family_number_id_at_issue = ?
					AND status IN (${OPEN_OFFER_STATUSES})`,
				params: [input.now, input.userId, input.fromFamilyNumberId],
			},
			{
				sql: `UPDATE enrollments SET status = 'cancelled', updated_at = ?
				WHERE user_id = ? AND status IN ('draft', 'contract_offered')
					AND id IN (SELECT enrollment_id FROM contract_family_reassignment_effects effect
						JOIN contract_offers offer ON offer.id = effect.contract_offer_id
						WHERE effect.reassignment_id = ? AND offer.enrollment_id IS NOT NULL)`,
				params: [input.now, input.userId, input.reassignmentId],
			},
			{
				sql: `UPDATE service_engagements SET status = 'cancelled', updated_at = ?
				WHERE user_id = ? AND status IN ('draft', 'contract_offered')
					AND id IN (SELECT service_engagement_id FROM contract_family_reassignment_effects effect
						JOIN contract_offers offer ON offer.id = effect.contract_offer_id
						WHERE effect.reassignment_id = ? AND offer.service_engagement_id IS NOT NULL)`,
				params: [input.now, input.userId, input.reassignmentId],
			},
		];
	}

	assertion(input: { previewId: string; reassignmentId: string }) {
		return {
			sql: `NOT EXISTS (SELECT 1 FROM contract_offers offer
				JOIN family_reassignments reassignment ON reassignment.id = ?
				WHERE offer.user_id = reassignment.user_id
					AND offer.family_number_id_at_issue = reassignment.from_family_number_id
					AND offer.status IN (${OPEN_OFFER_STATUSES}))
				AND (SELECT COUNT(*) FROM contract_family_reassignment_effects
					WHERE reassignment_id = ?) = (
					SELECT nonterminal_offer_count FROM (
						SELECT json_extract(consequence_snapshot_json, '$.nonterminalOfferCount')
							AS nonterminal_offer_count
						FROM admin_family_correction_previews WHERE id = ?))`,
			params: [input.reassignmentId, input.reassignmentId, input.previewId],
		};
	}
}

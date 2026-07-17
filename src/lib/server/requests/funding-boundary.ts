import type { StatementSpec } from '$lib/server/db/database';

export interface FundingDiscontinuityContributor {
	contribute(input: {
		authorizationId: string;
		requestId: string;
		eventKind: 'revoked' | 'superseded' | 'expired';
		effectiveOn: string;
		reason: string;
		actorUserId: string | null;
		now: string;
	}): Promise<{
		statements: readonly StatementSpec[];
		assertionSql: string;
		assertionParams: readonly unknown[];
		safeSummary: Record<string, unknown>;
	}>;
}

export class Stage08FundingDiscontinuityContributor
	implements FundingDiscontinuityContributor
{
	async contribute() {
		return {
			statements: [],
			assertionSql: '1 = 1',
			assertionParams: [],
			safeSummary: {
				contractTablesAvailable: false,
				openOffersSuperseded: 0,
				activeEngagementsMovedToFundingReview: 0,
				adminTasksCreated: 0,
			},
		};
	}
}

export function fundingEligibilityAssertion(input: {
	requestId: string;
	plannedFrom: string;
	plannedUntilInclusive: string;
}) {
	return {
		sql: `EXISTS (
			SELECT 1 FROM individual_requests AS request
			JOIN users AS owner ON owner.id = request.user_id
			JOIN children AS child ON child.id = request.child_id
				AND child.owner_user_id = owner.id
				AND child.family_number_id = owner.family_number_id
			JOIN funding_authorizations AS authorization
				ON authorization.request_id = request.id AND authorization.status = 'approved'
			WHERE request.id = ? AND request.request_kind = 'nachhilfe'
				AND request.status = 'approved'
				AND owner.account_status = 'active' AND owner.is_blocked = 0
				AND authorization.kind = request.funding_kind
				AND authorization.valid_from <= ? AND authorization.valid_until >= ?
				AND EXISTS (
					SELECT 1 FROM authorization_documents AS document
					WHERE document.authorization_id = authorization.id
						AND document.review_status = 'approved'
						AND document.archive_r2_key IS NOT NULL
						AND document.deleted_at IS NULL
						AND document.replaced_by_document_id IS NULL
				)
				AND NOT EXISTS (
					SELECT 1 FROM authorization_documents AS document
					WHERE document.authorization_id = authorization.id
						AND document.deleted_at IS NULL
						AND document.replaced_by_document_id IS NULL
						AND (document.review_status <> 'approved'
							OR document.archive_r2_key IS NULL)
				)
		)`,
		params: [input.requestId, input.plannedFrom, input.plannedUntilInclusive] as const,
	};
}

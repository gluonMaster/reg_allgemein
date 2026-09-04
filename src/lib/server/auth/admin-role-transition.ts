/**
 * Correlated SQL guard for `UPDATE users ... WHERE ...` role transitions.
 *
 * An empty assigned FamilyID and its portal_allocated verification receipt are
 * registration evidence, not parent business state. Exact-email finalization
 * retains legacy-claim evidence; all other guards still reject later workflows.
 */
export const NO_RETAINED_PARENT_STATE_SQL = `NOT EXISTS (
			SELECT 1 FROM children AS retained_child
			WHERE retained_child.owner_user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM legacy_families AS retained_legacy_family
			WHERE retained_legacy_family.claimed_by_user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM family_claims AS retained_family_claim
			WHERE retained_family_claim.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM family_link_attempts AS retained_family_link
			WHERE retained_family_link.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM family_reassignments AS retained_family_reassignment
			WHERE retained_family_reassignment.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM family_finalization_commits AS retained_family_finalization
			WHERE retained_family_finalization.user_id = users.id
				AND retained_family_finalization.result_kind <> 'portal_allocated'
		) AND NOT EXISTS (
			SELECT 1 FROM family_transaction_assertions AS retained_family_assertion
			WHERE retained_family_assertion.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM child_correction_requests AS retained_child_correction
			WHERE retained_child_correction.requested_by = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM enrollments AS retained_enrollment
			WHERE retained_enrollment.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM trial_bookings AS retained_trial
			WHERE retained_trial.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM trial_parent_actions AS retained_trial_action
			WHERE retained_trial_action.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM individual_requests AS retained_request
			WHERE retained_request.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM funding_authorizations AS retained_authorization
			WHERE retained_authorization.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM authorization_documents AS retained_document
			WHERE retained_document.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM request_parent_actions AS retained_request_action
			WHERE retained_request_action.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM service_engagements AS retained_engagement
			WHERE retained_engagement.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM contract_offers AS retained_offer
			WHERE retained_offer.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM contract_parent_actions AS retained_contract_action
			WHERE retained_contract_action.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM contract_acceptances AS retained_contract_acceptance
			WHERE retained_contract_acceptance.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM contracts AS retained_contract
			WHERE retained_contract.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM contract_end_requests AS retained_contract_end
			WHERE retained_contract_end.requested_by_user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM service_attendance_notices AS retained_attendance_notice
			WHERE retained_attendance_notice.requested_by_user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM media_consents AS retained_media_consent
			WHERE retained_media_consent.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM price_review_items AS retained_price_item
			WHERE retained_price_item.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM price_review_parent_actions AS retained_price_action
			WHERE retained_price_action.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM price_change_acceptances AS retained_price_acceptance
			WHERE retained_price_acceptance.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM support_threads AS retained_thread
			WHERE retained_thread.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM support_messages AS retained_message
			WHERE retained_message.sender_user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM absence_reports AS retained_absence
			WHERE retained_absence.user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM privacy_requests AS retained_privacy_subject
			WHERE retained_privacy_subject.subject_user_id = users.id
		) AND NOT EXISTS (
			SELECT 1 FROM privacy_requests AS retained_privacy_requester
			WHERE retained_privacy_requester.requested_by_user_id = users.id
		)`;

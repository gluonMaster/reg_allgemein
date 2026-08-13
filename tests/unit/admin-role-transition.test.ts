import { describe, expect, it } from 'vitest';

import { NO_RETAINED_PARENT_STATE_SQL } from '$lib/server/auth/admin-role-transition';

const canonicalRetainedReferences = [
	['children', 'owner_user_id'],
	['legacy_families', 'claimed_by_user_id'],
	['family_claims', 'user_id'],
	['family_link_attempts', 'user_id'],
	['family_reassignments', 'user_id'],
	['family_finalization_commits', 'user_id'],
	['family_transaction_assertions', 'user_id'],
	['child_correction_requests', 'requested_by'],
	['enrollments', 'user_id'],
	['trial_bookings', 'user_id'],
	['trial_parent_actions', 'user_id'],
	['individual_requests', 'user_id'],
	['funding_authorizations', 'user_id'],
	['authorization_documents', 'user_id'],
	['request_parent_actions', 'user_id'],
	['service_engagements', 'user_id'],
	['contract_offers', 'user_id'],
	['contract_parent_actions', 'user_id'],
	['contract_acceptances', 'user_id'],
	['contracts', 'user_id'],
	['contract_end_requests', 'requested_by_user_id'],
	['service_attendance_notices', 'requested_by_user_id'],
	['media_consents', 'user_id'],
	['price_review_items', 'user_id'],
	['price_review_parent_actions', 'user_id'],
	['price_change_acceptances', 'user_id'],
	['support_threads', 'user_id'],
	['support_messages', 'sender_user_id'],
	['absence_reports', 'user_id'],
	['privacy_requests', 'subject_user_id'],
	['privacy_requests', 'requested_by_user_id'],
] as const;

describe('admin role-transition retained-state guard', () => {
	it('covers every canonical retained-parent reference without treating an empty FamilyID as state', () => {
		expect(canonicalRetainedReferences).toHaveLength(31);
		expect(
			new Set(canonicalRetainedReferences.map(([table, column]) => `${table}.${column}`)).size
		).toBe(31);
		expect(NO_RETAINED_PARENT_STATE_SQL.match(/NOT EXISTS/gu)).toHaveLength(31);

		for (const [table, column] of canonicalRetainedReferences) {
			expect(NO_RETAINED_PARENT_STATE_SQL).toMatch(
				new RegExp(`FROM ${table} AS ([a-z_]+)\\s+WHERE \\1\\.${column} = users\\.id`, 'u')
			);
		}

		expect(NO_RETAINED_PARENT_STATE_SQL).not.toContain('family_number_allocations');
	});
});

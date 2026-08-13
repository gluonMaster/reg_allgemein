import { AdminBootstrapRepository } from '$lib/server/auth/admin-bootstrap';
import { AdminIdentityRepository } from '$lib/server/auth/admin-identity-repository';
import { DatabaseBoundary } from '$lib/server/db/database';
import { requireAdmin } from '$lib/server/security/authorization';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const NOW = '2026-08-12T10:00:00.000Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

const RETAINED_CANDIDATES = {
	child: 'retained-child-parent',
	claim: 'retained-claim-parent',
	thread: 'retained-thread-parent',
	contract: 'retained-contract-parent',
	price: 'retained-price-parent',
} as const;

const retainedCandidateIds = Object.values(RETAINED_CANDIDATES);

async function insertUser(
	context: TestD1Context,
	userId: string,
	role: 'parent' | 'admin' = 'parent'
): Promise<void> {
	await context.db
		.prepare(
			`INSERT INTO users (
				id, email, email_normalized, password_hash, email_verified_at, role,
				is_blocked, account_status, first_name, last_name,
				first_name_normalized, last_name_normalized, preferred_language,
				privacy_notice_version, privacy_accepted_at, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, 0, 'active', 'Synthetic', 'Parent',
				'synthetic', 'parent', 'de', 'synthetic-notice-v1', ?, ?, ?)`
		)
		.bind(
			userId,
			`${userId}@example.test`,
			`${userId}@example.test`,
			`synthetic-password-hash-${userId}`,
			NOW,
			role,
			NOW,
			NOW,
			NOW
		)
		.run();
}

async function assignEmptyFamily(
	context: TestD1Context,
	userId: string,
	sequence: number
): Promise<void> {
	const familyId = `family-${userId}`;
	await context.db.batch([
		context.db
			.prepare(
				`INSERT INTO family_number_allocations (
					id, namespace, sequence_number, display_family_id, legacy_family_id,
					owner_user_id, origin, status, assigned_at,
					merged_into_family_number_id, created_at, updated_at
				) VALUES (?, 'portal_2', ?, ?, NULL, ?, 'portal', 'assigned', ?, NULL, ?, ?)`
			)
			.bind(
				familyId,
				sequence,
				`2. ${String(sequence).padStart(4, '0')}`,
				userId,
				NOW,
				NOW,
				NOW
			),
		context.db
			.prepare(
				`UPDATE users SET family_number_id = ?, family_assignment_status = 'assigned',
					family_version = 1, updated_at = ? WHERE id = ?`
			)
			.bind(familyId, NOW, userId),
	]);
}

async function insertSession(context: TestD1Context, userId: string): Promise<void> {
	const jtiHash = crypto.randomUUID().replaceAll('-', '').repeat(2);
	const csrfHash = crypto.randomUUID().replaceAll('-', '').repeat(2);
	await context.db
		.prepare(
			`INSERT INTO auth_sessions (
				id, user_id, jti_hash, csrf_hash, session_version, expires_at,
				revoked_at, revocation_reason, created_at, last_seen_at
			) VALUES (?, ?, ?, ?, 1, '2026-08-19T10:00:00.000Z', NULL, NULL, ?, ?)`
		)
		.bind(`session-${userId}`, userId, jtiHash, csrfHash, NOW, NOW)
		.run();
}

async function seedSharedBusinessFixtures(context: TestD1Context): Promise<void> {
	await context.db.batch([
		context.db
			.prepare(
				`INSERT INTO academic_periods
				(id, code, display_name, starts_on, ends_on, is_current, created_at)
			VALUES ('retained-period', 'retained-2026', 'Retained state period',
				'2026-01-01', '2026-12-31', 0, ?)`
			)
			.bind(NOW),
		context.db
			.prepare(
				`INSERT INTO import_runs (
				id, source_kind, academic_period_id, source_label, source_hash_sha256,
				source_contract_id, source_contract_version, structural_fingerprint_sha256,
				dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
				attempt_no, retry_of_run_id, status, started_at, validated_at,
				promoted_at, finished_at, rows_total, rows_staged, rows_promoted,
				rows_skipped, safe_summary_json, error_code, created_at, updated_at
			) VALUES ('retained-run', 'access', 'retained-period', 'retained-fixture', ?,
				'retained-contract', 1, ?, '{}', ?, ?, 1, NULL, 'promoted', ?, ?, ?, ?,
				1, 1, 1, 0, '{}', NULL, ?, ?)`
			)
			.bind(HASH_A, HASH_B, HASH_C, HASH_A, NOW, NOW, NOW, NOW, NOW, NOW),
		context.db
			.prepare(
				`INSERT INTO course_groups (
				id, academic_period_id, source_offering_key, display_name,
				normalized_price_key, lesson_kind, subject, capacity_default,
				capacity_override, requires_admin_approval, catalog_status,
				last_seen_schedule_version_id, retired_at, created_at, updated_at
			) VALUES ('retained-course', 'retained-period', 'retained-course-key',
				'Retained course', 'retained-course', 'group', 'Synthetic', 12,
				NULL, 0, 'draft', NULL, NULL, ?, ?)`
			)
			.bind(NOW, NOW),
	]);
}

async function insertPortalChild(
	context: TestD1Context,
	input: { childId: string; ownerUserId: string; name: string }
): Promise<void> {
	await context.db
		.prepare(
			`INSERT INTO children (
				id, owner_user_id, legacy_family_id, family_number_id, origin,
				source_child_key, source_full_name, source_full_name_normalized,
				source_birth_date, full_name_override, birth_date_override,
				full_name, full_name_normalized, birth_date, last_seen_run_id,
				is_current, created_at, updated_at
			) VALUES (?, ?, NULL, ?, 'portal', ?, ?, ?, '2016-04-03', NULL, NULL,
				?, ?, '2016-04-03', 'retained-run', 1, ?, ?)`
		)
		.bind(
			input.childId,
			input.ownerUserId,
			`family-${input.ownerUserId}`,
			`source-${input.childId}`,
			input.name,
			input.name.toLowerCase(),
			input.name,
			input.name.toLowerCase(),
			NOW,
			NOW
		)
		.run();
}

async function seedRetainedCandidates(context: TestD1Context): Promise<void> {
	for (const [index, userId] of retainedCandidateIds.entries()) {
		await insertUser(context, userId);
		await assignEmptyFamily(context, userId, index + 1);
		await insertSession(context, userId);
	}
	await insertUser(context, 'retained-fixture-owner');
	await assignEmptyFamily(context, 'retained-fixture-owner', 90);
	await seedSharedBusinessFixtures(context);

	await insertPortalChild(context, {
		childId: 'retained-owned-child',
		ownerUserId: RETAINED_CANDIDATES.child,
		name: 'Retained Child',
	});
	await insertPortalChild(context, {
		childId: 'retained-fixture-child',
		ownerUserId: 'retained-fixture-owner',
		name: 'Fixture Child',
	});

	await context.db.batch([
		context.db
			.prepare(
				`INSERT INTO enrollments (
				id, user_id, child_id, course_group_id, legacy_enrollment_id,
				lesson_kind, status, contract_kind, active_from, active_until,
				current_price_cents, price_source, price_mode, price_effective_from,
				manual_override_reason, manual_override_by, manual_override_at,
				source, created_at, updated_at
			) VALUES ('retained-fixture-enrollment', 'retained-fixture-owner',
				'retained-fixture-child', 'retained-course', NULL, 'group', 'draft',
				'group_yearly', '2026-09-01', NULL, NULL, NULL, NULL, NULL,
				NULL, NULL, NULL, 'portal', ?, ?)`
			)
			.bind(NOW, NOW),
		context.db
			.prepare(
				`INSERT INTO family_number_allocations (
				id, namespace, sequence_number, display_family_id, legacy_family_id,
				owner_user_id, origin, status, assigned_at,
				merged_into_family_number_id, created_at, updated_at
			) VALUES ('retained-legacy-allocation', 'legacy_1', 9001, '1. 9001',
				'retained-legacy-family', NULL, 'legacy', 'assigned', ?, NULL, ?, ?)`
			)
			.bind(NOW, NOW, NOW),
		context.db
			.prepare(
				`INSERT INTO legacy_families (
				id, source_namespace, source_family_id, family_number_id,
				numbering_status, claimed_by_user_id, claimed_at, continuity_status,
				created_at, updated_at
			) VALUES ('retained-legacy-family', 'legacy_1', '1. 9001',
				'retained-legacy-allocation', 'valid', NULL, NULL, 'stable', ?, ?)`
			)
			.bind(NOW, NOW),
		context.db
			.prepare(
				`INSERT INTO family_claims (
				id, legacy_family_id, user_id, status, proof_kind, proof_at,
				consented_at, claimed_at, review_task_id, created_at, updated_at
			) VALUES ('retained-family-claim', 'retained-legacy-family', ?,
				'candidate', 'verified_login_email', ?, NULL, NULL, NULL, ?, ?)`
			)
			.bind(RETAINED_CANDIDATES.claim, NOW, NOW, NOW),
		context.db
			.prepare(
				`INSERT INTO support_threads (
				id, public_reference, user_id, category, status, subject,
				previous_thread_id, created_at, updated_at, closed_at
			) VALUES ('retained-thread', 'retained-thread-reference', ?, 'technical',
				'open', 'Retained support thread', NULL, ?, ?, NULL)`
			)
			.bind(RETAINED_CANDIDATES.thread, NOW, NOW),
		context.db
			.prepare(
				`INSERT INTO media_withdrawal_contact_versions (
				id, version, contact_snapshot_json, snapshot_hash, german_text_version,
				approval_status, compliance_assessment_status, approved_by,
				approved_at, created_at
			) VALUES ('retained-media-contact', 'retained-media-contact-v1', '{}', ?,
				'retained-text-v1', 'draft', 'not_assessed', NULL, NULL, ?)`
			)
			.bind(HASH_B, NOW),
		context.db
			.prepare(
				`INSERT INTO media_consents (
				id, user_id, child_id, capture_scopes_json,
				publication_channels_json, text_version, withdrawal_contact_version_id,
				withdrawal_contact_snapshot_hash, decision, decision_source, decided_at,
				received_at, effective_from, recorded_by_user_id, recorded_at,
				evidence_hash, request_dedupe_key, source_contract_offer_id,
				source_privacy_request_id, supersedes_consent_id, created_at
			) VALUES ('retained-media-consent', ?, 'retained-fixture-child', '["photo"]',
				'["website"]', 'retained-consent-v1', 'retained-media-contact', ?,
				'declined', 'portal', ?, ?, ?, ?, ?, ?, 'retained-media-dedupe',
				NULL, NULL, NULL, ?)`
			)
			.bind(
				RETAINED_CANDIDATES.contract,
				HASH_B,
				NOW,
				NOW,
				NOW,
				RETAINED_CANDIDATES.contract,
				NOW,
				HASH_C,
				NOW
			),
		context.db
			.prepare(
				`INSERT INTO price_review_batches (
				id, course_group_id, reason_code, old_active_count, new_active_count,
				old_lookup_children_count, new_lookup_children_count, price_version_id,
				effective_on, earliest_effective_from, calculation_snapshot_json,
				calculation_snapshot_hash, dedupe_key, status, notification_approved_at,
				notification_approved_by, created_at, updated_at, completed_at
			) VALUES ('retained-price-batch', 'retained-course', 'retained-state',
				1, 2, 1, 2, NULL, '2026-09-01', '2026-09-01', '{}', ?,
				'retained-price-batch-dedupe', 'draft', NULL, NULL, ?, ?, NULL)`
			)
			.bind(HASH_A, NOW, NOW),
		context.db
			.prepare(
				`INSERT INTO price_review_items (
				id, batch_id, version, public_reference, enrollment_id, user_id,
				target_state_hash, expected_active_count, expected_lookup_children_count,
				effective_on, decision_code, decision_json, terms_snapshot_json,
				item_hash, acceptance_text_version, dedupe_key, status, created_at, updated_at
			) VALUES ('retained-price-item', 'retained-price-batch', 1,
				'retained-price-reference', 'retained-fixture-enrollment', ?, ?, 2, 2,
				'2026-09-01', 'RETAINED_STATE', '{}', '{}', ?, 'retained-price-text-v1',
				'retained-price-item-dedupe', 'draft', ?, ?)`
			)
			.bind(RETAINED_CANDIDATES.price, HASH_B, HASH_C, NOW, NOW),
	]);
}

function candidatePlaceholders(): string {
	return retainedCandidateIds.map(() => '?').join(', ');
}

async function expectCandidatesUnchanged(context: TestD1Context): Promise<void> {
	const users = await context.db
		.prepare(
			`SELECT id, role, session_version FROM users
			WHERE id IN (${candidatePlaceholders()}) ORDER BY id`
		)
		.bind(...retainedCandidateIds)
		.all<{ id: string; role: string; session_version: number }>();
	expect(users.results).toHaveLength(retainedCandidateIds.length);
	expect(
		users.results.every((user) => user.role === 'parent' && user.session_version === 1)
	).toBe(true);

	const sessions = await context.db
		.prepare(
			`SELECT COUNT(*) AS total,
				SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS active
			FROM auth_sessions WHERE user_id IN (${candidatePlaceholders()})`
		)
		.bind(...retainedCandidateIds)
		.first<{ total: number; active: number }>();
	expect(sessions).toEqual({
		total: retainedCandidateIds.length,
		active: retainedCandidateIds.length,
	});
}

describe('parent-to-admin retained-state transition guard', () => {
	it('rejects bootstrap for representative child, claim, thread, contract and price state atomically', async () => {
		const context = await createMigratedTestD1();
		try {
			await seedRetainedCandidates(context);
			const repository = new AdminBootstrapRepository(new DatabaseBoundary(context.db));

			for (const [state, targetUserId] of Object.entries(RETAINED_CANDIDATES)) {
				await expect(
					repository.consume({
						targetUserId,
						reason: `reject retained ${state} state`,
						requestId: `request-bootstrap-retained-${state}`,
						now: NOW,
					})
				).rejects.toMatchObject({ code: 'ADMIN_BOOTSTRAP_REJECTED' });
			}

			await expectCandidatesUnchanged(context);
			expect(await repository.status()).toEqual({ status: 'available', activeAdminCount: 0 });
			expect(
				await context.db
					.prepare(
						`SELECT
							(SELECT COUNT(*) FROM admin_bootstrap_actions) AS actions,
							(SELECT COUNT(*) FROM admin_bootstrap_assertions) AS assertions,
							(SELECT COUNT(*) FROM audit_events
								WHERE action = 'auth.first_admin_bootstrapped') AS audits`
					)
					.first()
			).toEqual({ actions: 0, assertions: 0, audits: 0 });
		} finally {
			await context.dispose();
		}
	}, 60_000);

	it('rejects normal assignment for the same retained states without role, session or audit mutation', async () => {
		const context = await createMigratedTestD1();
		try {
			await seedRetainedCandidates(context);
			await insertUser(context, 'existing-admin', 'admin');
			await insertUser(context, 'unverified-parent');
			await context.db
				.prepare(`UPDATE users SET email_verified_at = NULL WHERE id = 'unverified-parent'`)
				.run();
			await insertSession(context, 'unverified-parent');
			const repository = new AdminIdentityRepository(new DatabaseBoundary(context.db));
			const actor = requireAdmin({
				id: 'existing-admin',
				role: 'admin',
				emailVerified: true,
				sessionId: 'existing-admin-session',
				sessionVersion: 1,
				csrfHash: HASH_A,
			});

			for (const [state, targetUserId] of Object.entries(RETAINED_CANDIDATES)) {
				expect(
					await repository.assignAdmin({
						actor,
						targetUserId,
						reason: `reject retained ${state} state`,
						requestId: `request-assign-retained-${state}`,
						now: NOW,
					})
				).toBe(false);
			}
			expect(
				await repository.assignAdmin({
					actor,
					targetUserId: 'unverified-parent',
					reason: 'reject unverified target',
					requestId: 'request-assign-unverified',
					now: NOW,
				})
			).toBe(false);

			await expectCandidatesUnchanged(context);
			expect(
				await context.db
					.prepare(
						`SELECT users.role, users.session_version, sessions.revoked_at,
							sessions.revocation_reason
						FROM users JOIN auth_sessions AS sessions ON sessions.user_id = users.id
						WHERE users.id = 'unverified-parent'`
					)
					.first()
			).toEqual({
				role: 'parent',
				session_version: 1,
				revoked_at: null,
				revocation_reason: null,
			});
			expect(
				await context.db
					.prepare(
						`SELECT COUNT(*) AS count FROM audit_events
						WHERE action = 'auth.role_assigned'
							AND target_id IN (${candidatePlaceholders()})`
					)
					.bind(...retainedCandidateIds)
					.first()
			).toEqual({ count: 0 });
			expect(
				await context.db
					.prepare(
						`SELECT COUNT(*) AS count FROM audit_events
						WHERE action = 'auth.role_assigned' AND target_id = 'unverified-parent'`
					)
					.first()
			).toEqual({ count: 0 });
		} finally {
			await context.dispose();
		}
	}, 60_000);
});

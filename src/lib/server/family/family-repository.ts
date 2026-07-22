import { DatabaseBoundary } from '$lib/server/db/database';

export interface LegacyClaimCandidate {
	attempt_id: string;
	user_id: string;
	legacy_family_id: string;
	legacy_family_email_id: string;
	email_normalized: string;
	family_version: number;
	from_family_number_id: string;
	to_family_number_id: string;
	legacy_version_id: string;
	legacy_import_run_id: string;
}

export interface LegacyClaimTokenContext extends LegacyClaimCandidate {
	token_id: string;
	expires_at: string;
	used_at: string | null;
	used_by_request_id: string | null;
}

export class FamilyRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	findClaimCandidate(userId: string): Promise<LegacyClaimCandidate | null> {
		return this.db.first<LegacyClaimCandidate>({
			sql: `SELECT attempt.id AS attempt_id, attempt.user_id,
				attempt.legacy_family_id, attempt.legacy_family_email_id,
				email.email_normalized, attempt.family_version,
				attempt.from_family_number_id,
				family.family_number_id AS to_family_number_id,
				attempt.legacy_version_id, attempt.legacy_import_run_id
				FROM family_link_attempts AS attempt
				JOIN users AS user ON user.id = attempt.user_id
				JOIN family_number_allocations AS current_family
					ON current_family.id = attempt.from_family_number_id
				JOIN legacy_families AS family ON family.id = attempt.legacy_family_id
				JOIN family_number_allocations AS destination
					ON destination.id = family.family_number_id
				JOIN legacy_family_emails AS email
					ON email.id = attempt.legacy_family_email_id
				JOIN legacy_versions AS version ON version.id = attempt.legacy_version_id
				JOIN academic_periods AS period ON period.id = version.academic_period_id
				JOIN import_runs AS run ON run.id = attempt.legacy_import_run_id
				WHERE attempt.user_id = ? AND attempt.status IN ('candidate', 'proof_sent')
					AND user.email_verified_at IS NOT NULL AND user.account_status = 'active'
					AND user.is_blocked = 0 AND user.family_number_id = attempt.from_family_number_id
					AND user.family_version = attempt.family_version
					AND current_family.namespace = 'portal_2' AND current_family.status = 'assigned'
					AND current_family.owner_user_id = user.id
					AND family.claimed_by_user_id IS NULL
					AND destination.namespace = 'legacy_1' AND destination.status = 'assigned'
					AND destination.owner_user_id IS NULL
					AND email.legacy_family_id = family.id AND email.is_current = 1
					AND email.email_normalized IS NOT NULL
					AND email.email_normalized <> user.email_normalized
					AND version.is_published = 1 AND period.is_current = 1
					AND run.id = version.import_run_id AND run.status = 'promoted'
					AND 1 = (
						SELECT COUNT(DISTINCT candidate_email.email_normalized)
						FROM legacy_family_emails AS candidate_email
						WHERE candidate_email.legacy_family_id = family.id
							AND candidate_email.is_current = 1
							AND candidate_email.email_normalized IS NOT NULL
							AND candidate_email.email_normalized <> user.email_normalized
					)`,
			params: [userId],
		});
	}

	async enqueueClaimProof(input: {
		candidate: LegacyClaimCandidate;
		tokenId: string;
		tokenHash: string;
		outboxId: string;
		expiresAt: string;
		cooldownAfter: string;
		requestedSubjectHash: string;
		now: string;
		emailMaxAttempts: number;
	}): Promise<boolean> {
		const result = await this.db.batch([
			{
				sql: `INSERT INTO auth_tokens
					(id, user_id, kind, token_hash, target_email_normalized, email_version,
					 legacy_family_id, family_version, expires_at, requested_subject_hash,
					 created_at)
					SELECT ?, candidate.user_id, 'legacy_email_claim', ?, email.email_normalized,
						NULL, candidate.legacy_family_id, candidate.family_version, ?, ?, ?
					FROM family_link_attempts AS candidate
					JOIN users AS user ON user.id = candidate.user_id
					JOIN legacy_family_emails AS email
						ON email.id = candidate.legacy_family_email_id
					JOIN legacy_versions AS version ON version.id = candidate.legacy_version_id
					JOIN academic_periods AS period ON period.id = version.academic_period_id
					WHERE candidate.id = ? AND candidate.user_id = ?
						AND candidate.status IN ('candidate', 'proof_sent')
						AND candidate.family_version = ?
						AND user.family_number_id = candidate.from_family_number_id
						AND user.family_version = candidate.family_version
						AND user.account_status = 'active' AND user.is_blocked = 0
						AND email.id = ? AND email.is_current = 1
						AND email.email_normalized = ?
						AND version.id = ? AND version.import_run_id = ?
						AND version.is_published = 1 AND period.is_current = 1
						AND NOT EXISTS (
							SELECT 1 FROM auth_tokens AS previous
							WHERE previous.user_id = candidate.user_id
								AND previous.kind = 'legacy_email_claim'
								AND previous.legacy_family_id = candidate.legacy_family_id
								AND previous.created_at > ?
						)`,
				params: [
					input.tokenId,
					input.tokenHash,
					input.expiresAt,
					input.requestedSubjectHash,
					input.now,
					input.candidate.attempt_id,
					input.candidate.user_id,
					input.candidate.family_version,
					input.candidate.legacy_family_email_id,
					input.candidate.email_normalized,
					input.candidate.legacy_version_id,
					input.candidate.legacy_import_run_id,
					input.cooldownAfter,
				],
			},
			{
				sql: `UPDATE auth_tokens SET used_at = ?, used_by_request_id = ?
					WHERE id <> ? AND user_id = ? AND kind = 'legacy_email_claim'
						AND legacy_family_id = ? AND used_at IS NULL
						AND EXISTS (SELECT 1 FROM auth_tokens WHERE id = ?)`,
				params: [
					input.now,
					`superseded:${input.tokenId}`,
					input.tokenId,
					input.candidate.user_id,
					input.candidate.legacy_family_id,
					input.tokenId,
				],
			},
			{
				sql: `UPDATE email_outbox SET status = 'cancelled'
					WHERE recipient_user_id = ? AND template_or_category = 'claim.legacy_email_proof'
						AND source_id <> ? AND status IN ('pending', 'retry')
						AND EXISTS (SELECT 1 FROM auth_tokens WHERE id = ?)`,
				params: [input.candidate.user_id, input.tokenId, input.tokenId],
			},
			{
				sql: `INSERT INTO email_outbox
					(id, source_kind, source_id, template_or_category, recipient_user_id,
					 recipient_address_kind, recipient_legacy_email_id, locale, payload_json,
					 dedupe_key, not_before, max_attempts, created_at)
					SELECT ?, 'auth_token', token.id, 'claim.legacy_email_proof', token.user_id,
						'legacy', ?, 'de', '{}', ?, ?, ?, ?
					FROM auth_tokens AS token WHERE token.id = ?`,
				params: [
					input.outboxId,
					input.candidate.legacy_family_email_id,
					`legacy-claim:${input.tokenId}`,
					input.now,
					input.emailMaxAttempts,
					input.now,
					input.tokenId,
				],
			},
			{
				sql: `UPDATE family_link_attempts SET status = 'proof_sent',
						proof_requested_at = ?, updated_at = ?
					WHERE id = ? AND status IN ('candidate', 'proof_sent')
						AND EXISTS (SELECT 1 FROM auth_tokens WHERE id = ?)`,
				params: [input.now, input.now, input.candidate.attempt_id, input.tokenId],
			},
		]);
		return result[0]?.meta.changes === 1;
	}

	findClaimToken(tokenHash: string): Promise<LegacyClaimTokenContext | null> {
		return this.db.first<LegacyClaimTokenContext>({
			sql: `SELECT token.id AS token_id, token.user_id, token.legacy_family_id,
				token.family_version, token.expires_at, token.used_at, token.used_by_request_id,
				attempt.id AS attempt_id, attempt.legacy_family_email_id,
				email.email_normalized, attempt.from_family_number_id,
				family.family_number_id AS to_family_number_id,
				attempt.legacy_version_id, attempt.legacy_import_run_id
				FROM auth_tokens AS token
				JOIN family_link_attempts AS attempt
					ON attempt.user_id = token.user_id
					AND attempt.legacy_family_id = token.legacy_family_id
					AND attempt.family_version = token.family_version
				JOIN legacy_family_emails AS email
					ON email.id = attempt.legacy_family_email_id
				JOIN legacy_families AS family ON family.id = attempt.legacy_family_id
				WHERE token.token_hash = ? AND token.kind = 'legacy_email_claim'
					AND token.target_email_normalized = email.email_normalized`,
			params: [tokenHash],
		});
	}

	async claimAlreadyApplied(tokenId: string, userId: string): Promise<boolean> {
		const row = await this.db.first<{ applied: number }>({
			sql: `SELECT COUNT(*) AS applied FROM family_reassignments
				WHERE source = 'legacy_email_token' AND idempotency_key = ?
					AND user_id = ? AND status = 'applied'`,
			params: [`token:${tokenId}`, userId],
		});
		return row?.applied === 1;
	}

	async confirmClaim(input: {
		context: LegacyClaimTokenContext;
		userId: string;
		requestId: string;
		reassignmentId: string;
		claimId: string;
		auditId: string;
		assertionId: string;
		emailMaxAttempts: number;
		now: string;
	}): Promise<boolean> {
		const tokenIdempotencyKey = `token:${input.context.token_id}`;
		const result = await this.db.batch([
			{
				sql: `UPDATE auth_tokens SET used_at = ?, used_by_request_id = ?
					WHERE id = ? AND kind = 'legacy_email_claim' AND user_id = ?
						AND legacy_family_id = ? AND family_version = ?
						AND used_at IS NULL AND expires_at > ?
						AND EXISTS (
							SELECT 1 FROM users WHERE id = ? AND account_status = 'active'
								AND is_blocked = 0 AND email_verified_at IS NOT NULL
								AND family_number_id = ? AND family_version = ?
						)
						AND EXISTS (
							SELECT 1 FROM legacy_versions AS version
							JOIN academic_periods AS period ON period.id = version.academic_period_id
							WHERE version.id = ? AND version.import_run_id = ?
								AND version.is_published = 1 AND period.is_current = 1
						)
						AND EXISTS (
							SELECT 1 FROM family_link_attempts AS attempt
							JOIN legacy_family_emails AS email
								ON email.id = attempt.legacy_family_email_id
							JOIN legacy_families AS family ON family.id = attempt.legacy_family_id
							JOIN family_number_allocations AS source
								ON source.id = attempt.from_family_number_id
							JOIN family_number_allocations AS destination
								ON destination.id = family.family_number_id
							WHERE attempt.id = ? AND attempt.user_id = ?
								AND attempt.legacy_family_id = ? AND attempt.family_version = ?
								AND attempt.status IN ('candidate', 'proof_sent')
								AND email.id = ? AND email.is_current = 1
								AND email.email_normalized = auth_tokens.target_email_normalized
								AND family.claimed_by_user_id IS NULL
								AND source.id = ? AND source.namespace = 'portal_2'
								AND source.status = 'assigned' AND source.owner_user_id = ?
								AND destination.id = ? AND destination.namespace = 'legacy_1'
								AND destination.status = 'assigned' AND destination.owner_user_id IS NULL
						)`,
				params: [
					input.now,
					input.requestId,
					input.context.token_id,
					input.userId,
					input.context.legacy_family_id,
					input.context.family_version,
					input.now,
					input.userId,
					input.context.from_family_number_id,
					input.context.family_version,
					input.context.legacy_version_id,
					input.context.legacy_import_run_id,
					input.context.attempt_id,
					input.userId,
					input.context.legacy_family_id,
					input.context.family_version,
					input.context.legacy_family_email_id,
					input.context.from_family_number_id,
					input.userId,
					input.context.to_family_number_id,
				],
			},
			{
				sql: `INSERT INTO family_reassignments
					(id, user_id, from_family_number_id, to_family_number_id, source,
					 reason_code, reason_note, requested_by, confirmed_by, idempotency_key,
					 family_version_before, status, safe_effects_json, created_at, applied_at, updated_at)
					SELECT ?, ?, ?, ?, 'legacy_email_token', 'alternate_email_confirmed',
						NULL, ?, NULL, ?, ?, 'planned',
						'{"account":true,"children":true}', ?, NULL, ?
					WHERE EXISTS (SELECT 1 FROM auth_tokens WHERE id = ? AND used_by_request_id = ?)`,
				params: [
					input.reassignmentId,
					input.userId,
					input.context.from_family_number_id,
					input.context.to_family_number_id,
					input.userId,
					tokenIdempotencyKey,
					input.context.family_version,
					input.now,
					input.now,
					input.context.token_id,
					input.requestId,
				],
			},
			{
				sql: `UPDATE family_number_allocations SET status = 'merged_alias',
						merged_into_family_number_id = ?, updated_at = ?
					WHERE id = ? AND namespace = 'portal_2' AND status = 'assigned'
						AND owner_user_id = ?
						AND EXISTS (SELECT 1 FROM family_reassignments
							WHERE id = ? AND status = 'planned')`,
				params: [
					input.context.to_family_number_id,
					input.now,
					input.context.from_family_number_id,
					input.userId,
					input.reassignmentId,
				],
			},
			{
				sql: `UPDATE family_number_allocations SET owner_user_id = ?,
						assigned_at = COALESCE(assigned_at, ?), updated_at = ?
					WHERE id = ? AND namespace = 'legacy_1' AND status = 'assigned'
						AND owner_user_id IS NULL
						AND EXISTS (SELECT 1 FROM family_reassignments
							WHERE id = ? AND status = 'planned')`,
				params: [
					input.userId,
					input.now,
					input.now,
					input.context.to_family_number_id,
					input.reassignmentId,
				],
			},
			{
				sql: `UPDATE legacy_families SET claimed_by_user_id = ?, claimed_at = ?, updated_at = ?
					WHERE id = ? AND family_number_id = ? AND claimed_by_user_id IS NULL
						AND EXISTS (SELECT 1 FROM family_number_allocations
							WHERE id = ? AND owner_user_id = ? AND status = 'assigned')`,
				params: [
					input.userId,
					input.now,
					input.now,
					input.context.legacy_family_id,
					input.context.to_family_number_id,
					input.context.to_family_number_id,
					input.userId,
				],
			},
			{
				sql: `INSERT INTO family_claims
					(id, legacy_family_id, user_id, status, proof_kind, proof_at,
					 consented_at, claimed_at, review_task_id, created_at, updated_at)
					SELECT ?, ?, ?, 'claimed', 'legacy_email_token', ?, ?, ?, NULL, ?, ?
					WHERE EXISTS (SELECT 1 FROM legacy_families
						WHERE id = ? AND claimed_by_user_id = ?)`,
				params: [
					input.claimId,
					input.context.legacy_family_id,
					input.userId,
					input.now,
					input.now,
					input.now,
					input.now,
					input.now,
					input.context.legacy_family_id,
					input.userId,
				],
			},
			{
				sql: `UPDATE users SET family_number_id = ?, family_version = family_version + 1,
						family_assignment_status = 'assigned', updated_at = ?
					WHERE id = ? AND family_number_id = ? AND family_version = ?
						AND EXISTS (SELECT 1 FROM family_number_allocations
							WHERE id = ? AND owner_user_id = ? AND status = 'assigned')`,
				params: [
					input.context.to_family_number_id,
					input.now,
					input.userId,
					input.context.from_family_number_id,
					input.context.family_version,
					input.context.to_family_number_id,
					input.userId,
				],
			},
			{
				sql: `UPDATE children SET family_number_id = ?, updated_at = ?
					WHERE owner_user_id = ? AND family_number_id = ?`,
				params: [
					input.context.to_family_number_id,
					input.now,
					input.userId,
					input.context.from_family_number_id,
				],
			},
			{
				sql: `UPDATE children SET owner_user_id = ?, family_number_id = ?, updated_at = ?
					WHERE legacy_family_id = ? AND origin = 'legacy' AND is_current = 1
						AND owner_user_id IS NULL
						AND EXISTS (
							SELECT 1 FROM legacy_snapshot_children AS snapshot_child
							WHERE snapshot_child.legacy_version_id = ?
								AND snapshot_child.legacy_child_id = children.id
								AND snapshot_child.continuity_needs_review = 0
						)`,
				params: [
					input.userId,
					input.context.to_family_number_id,
					input.now,
					input.context.legacy_family_id,
					input.context.legacy_version_id,
				],
			},
			{
				sql: `UPDATE family_link_attempts SET status = 'confirmed', confirmed_at = ?, updated_at = ?
					WHERE id = ? AND status IN ('candidate', 'proof_sent')`,
				params: [input.now, input.now, input.context.attempt_id],
			},
			{
				sql: `UPDATE family_reassignments SET status = 'applied', confirmed_by = ?,
						applied_at = ?, updated_at = ?
					WHERE id = ? AND status = 'planned'
						AND EXISTS (SELECT 1 FROM users WHERE id = ? AND family_number_id = ?
							AND family_version = ?)`,
				params: [
					input.userId,
					input.now,
					input.now,
					input.reassignmentId,
					input.userId,
					input.context.to_family_number_id,
					input.context.family_version + 1,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'family.legacy_claim_confirmed', 'family_reassignment',
						id, ?, '{"family_changed":true,"children_updated":true}', ?
					FROM family_reassignments WHERE id = ? AND status = 'applied'`,
				params: [
					input.auditId,
					input.userId,
					input.requestId,
					input.now,
					input.reassignmentId,
				],
			},
			{
				sql: `INSERT OR IGNORE INTO email_outbox
					(id, source_kind, source_id, template_or_category, recipient_user_id,
					 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
					 status, attempts, max_attempts, created_at, updated_at)
				SELECT ?, 'family_claim', claim.id, 'claim.result', claim.user_id,
					'current', 'de', '{"portalPath":"/cabinet"}', ?, ?,
					'pending', 0, ?, ?, ? FROM family_claims claim
				WHERE claim.id = ? AND claim.status = 'claimed'
					AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
				params: [`email:claim-result:${input.claimId}`,
					`claim-result:${input.claimId}:email:v1`, input.now,
					input.emailMaxAttempts, input.now, input.now, input.claimId, input.auditId],
			},
			{
				sql: `INSERT INTO family_transaction_assertions
					(id, operation_kind, operation_id, user_id, assertion_passed, created_at)
					VALUES (?, 'legacy_email_claim', ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM auth_tokens WHERE id = ? AND used_by_request_id = ?)
						AND EXISTS (SELECT 1 FROM family_reassignments WHERE id = ? AND status = 'applied')
						AND EXISTS (SELECT 1 FROM users WHERE id = ? AND family_number_id = ?
							AND family_version = ?)
						AND EXISTS (SELECT 1 FROM family_number_allocations
							WHERE id = ? AND status = 'merged_alias'
								AND owner_user_id = ? AND merged_into_family_number_id = ?)
						AND EXISTS (SELECT 1 FROM family_number_allocations
							WHERE id = ? AND status = 'assigned' AND owner_user_id = ?)
						AND EXISTS (SELECT 1 FROM legacy_families
							WHERE id = ? AND family_number_id = ? AND claimed_by_user_id = ?)
						AND EXISTS (SELECT 1 FROM family_claims
							WHERE legacy_family_id = ? AND user_id = ? AND status = 'claimed'
								AND proof_kind = 'legacy_email_token')
						AND EXISTS (SELECT 1 FROM family_link_attempts
							WHERE id = ? AND status = 'confirmed')
						AND EXISTS (SELECT 1 FROM email_outbox
							WHERE id = ? AND template_or_category = 'claim.result')
						AND NOT EXISTS (SELECT 1 FROM children WHERE owner_user_id = ?
							AND family_number_id <> ?)
						AND NOT EXISTS (
							SELECT 1 FROM legacy_snapshot_children AS snapshot_child
							JOIN legacy_snapshot_families AS snapshot_family
								ON snapshot_family.legacy_version_id = snapshot_child.legacy_version_id
								AND snapshot_family.stable_family_key = snapshot_child.stable_family_key
							LEFT JOIN children AS child
								ON child.id = snapshot_child.legacy_child_id AND child.is_current = 1
							WHERE snapshot_child.legacy_version_id = ?
								AND snapshot_family.legacy_family_id = ?
								AND snapshot_child.continuity_needs_review = 0
								AND (child.id IS NULL OR child.owner_user_id IS NOT ?
									OR child.family_number_id IS NOT ?)
						)
						AND EXISTS (SELECT 1 FROM legacy_versions AS version
							JOIN academic_periods AS period ON period.id = version.academic_period_id
							WHERE version.id = ? AND version.import_run_id = ?
								AND version.is_published = 1 AND period.is_current = 1)
						THEN 1 ELSE 0 END, ?)`,
				params: [
					input.assertionId,
					input.reassignmentId,
					input.userId,
					input.context.token_id,
					input.requestId,
					input.reassignmentId,
					input.userId,
					input.context.to_family_number_id,
					input.context.family_version + 1,
					input.context.from_family_number_id,
					input.userId,
					input.context.to_family_number_id,
					input.context.to_family_number_id,
					input.userId,
					input.context.legacy_family_id,
					input.context.to_family_number_id,
					input.userId,
					input.context.legacy_family_id,
					input.userId,
					input.context.attempt_id,
					`email:claim-result:${input.claimId}`,
					input.userId,
					input.context.to_family_number_id,
					input.context.legacy_version_id,
					input.context.legacy_family_id,
					input.userId,
					input.context.to_family_number_id,
					input.context.legacy_version_id,
					input.context.legacy_import_run_id,
					input.now,
				],
			},
		]);
		return result[0]?.meta.changes === 1;
	}

	async recordClaimConflict(input: {
		context: LegacyClaimTokenContext;
		now: string;
	}): Promise<void> {
		await this.db.batch([
			{
				sql: `INSERT OR IGNORE INTO admin_review_tasks
					(id, kind, source_kind, source_id, reason_code, safe_summary,
					 status, assigned_to, resolution, created_at, updated_at, resolved_at)
					VALUES (?, 'family_claim_conflict', 'legacy_family', ?,
						'legacy_email_claim_race', 'Legacy email claim requires review.',
						'open', NULL, NULL, ?, ?, NULL)`,
				params: [crypto.randomUUID(), input.context.legacy_family_id, input.now, input.now],
			},
			{
				sql: `UPDATE family_link_attempts SET status = 'conflict', updated_at = ?
					WHERE id = ? AND status IN ('candidate', 'proof_sent')`,
				params: [input.now, input.context.attempt_id],
			},
		]);
	}
}

import type {
	PostVerificationExtension,
	VerificationExtensionContext,
} from '$lib/server/auth/auth-repository';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';

interface CurrentLegacySnapshot {
	id: string;
	import_run_id: string;
}

interface VerificationUser {
	first_name_normalized: string;
	last_name_normalized: string;
}

interface FamilyMatchRow {
	legacy_family_id: string;
	family_number_id: string | null;
	numbering_status: 'valid' | 'collision' | 'missing' | 'unapproved';
	continuity_needs_review: 0 | 1;
	claimed_by_user_id: string | null;
	allocation_owner_user_id: string | null;
	allocation_status: 'pending' | 'assigned' | 'collision' | 'merged_alias' | 'retired' | null;
}

interface AlternateEmailRow {
	legacy_family_id: string;
	legacy_family_email_id: string;
	email_normalized: string;
}

export class LegacySnapshotUnavailableError extends Error {
	constructor() {
		super('Current legacy snapshot is unavailable.');
		this.name = 'LegacySnapshotUnavailableError';
	}
}

function uniqueByFamily(rows: readonly FamilyMatchRow[]): FamilyMatchRow[] {
	return [...new Map(rows.map((row) => [row.legacy_family_id, row])).values()];
}

function isEligibleUnowned(row: FamilyMatchRow | undefined): row is FamilyMatchRow & {
	family_number_id: string;
} {
	return Boolean(
		row &&
		row.numbering_status === 'valid' &&
		row.continuity_needs_review === 0 &&
		row.family_number_id &&
		row.claimed_by_user_id === null &&
		row.allocation_owner_user_id === null &&
		row.allocation_status === 'assigned'
	);
}

export function maskLegacyEmail(email: string): string {
	const separator = email.lastIndexOf('@');
	if (separator <= 0 || separator === email.length - 1) return '*****';
	const local = email.slice(0, separator);
	const domain = email.slice(separator + 1);
	const characters = Array.from(local);
	if (characters.length >= 4) {
		return `${characters.slice(0, 2).join('')}*****${characters.at(-1)}@${domain}`;
	}
	if (characters.length >= 2) return `${characters[0]}*****@${domain}`;
	return `*****@${domain}`;
}

export class LegacyFamilyVerificationExtension implements PostVerificationExtension {
	constructor(private readonly db: DatabaseBoundary) {}

	private async currentSnapshot(): Promise<CurrentLegacySnapshot> {
		const snapshots = await this.db.all<CurrentLegacySnapshot>({
			sql: `SELECT version.id, version.import_run_id
				FROM legacy_versions AS version
				JOIN academic_periods AS period ON period.id = version.academic_period_id
				JOIN import_runs AS run ON run.id = version.import_run_id
				WHERE period.is_current = 1 AND version.is_published = 1
					AND run.status = 'promoted'`,
		});
		if (snapshots.results.length !== 1) throw new LegacySnapshotUnavailableError();
		return snapshots.results[0];
	}

	private async verificationUser(userId: string): Promise<VerificationUser> {
		const user = await this.db.first<VerificationUser>({
			sql: `SELECT first_name_normalized, last_name_normalized FROM users
				WHERE id = ? AND role = 'parent' AND family_assignment_status = 'pending_verification'
					AND family_number_id IS NULL AND family_version = 0`,
			params: [userId],
		});
		if (!user) throw new LegacySnapshotUnavailableError();
		return user;
	}

	private async exactMatches(
		legacyVersionId: string,
		emailNormalized: string
	): Promise<FamilyMatchRow[]> {
		const rows = await this.db.all<FamilyMatchRow>({
			sql: `SELECT snapshot.legacy_family_id, snapshot.family_number_id,
				snapshot.numbering_status, snapshot.continuity_needs_review,
				family.claimed_by_user_id,
				allocation.owner_user_id AS allocation_owner_user_id,
				allocation.status AS allocation_status
				FROM legacy_snapshot_families AS snapshot
				JOIN legacy_snapshot_emails AS email
					ON email.legacy_version_id = snapshot.legacy_version_id
					AND email.stable_family_key = snapshot.stable_family_key
				LEFT JOIN legacy_families AS family ON family.id = snapshot.legacy_family_id
				LEFT JOIN family_number_allocations AS allocation
					ON allocation.id = snapshot.family_number_id
				WHERE snapshot.legacy_version_id = ? AND email.email_normalized = ?`,
			params: [legacyVersionId, emailNormalized],
		});
		return uniqueByFamily(rows.results);
	}

	private async nameMatches(
		legacyVersionId: string,
		user: VerificationUser
	): Promise<FamilyMatchRow[]> {
		const rows = await this.db.all<FamilyMatchRow>({
			sql: `SELECT snapshot.legacy_family_id, snapshot.family_number_id,
				snapshot.numbering_status, snapshot.continuity_needs_review,
				family.claimed_by_user_id,
				allocation.owner_user_id AS allocation_owner_user_id,
				allocation.status AS allocation_status
				FROM legacy_snapshot_families AS snapshot
				LEFT JOIN legacy_families AS family ON family.id = snapshot.legacy_family_id
				LEFT JOIN family_number_allocations AS allocation
					ON allocation.id = snapshot.family_number_id
				WHERE snapshot.legacy_version_id = ?
					AND snapshot.parent_name_match_status = 'eligible'
					AND snapshot.parent_first_name_normalized = ?
					AND snapshot.parent_last_name_normalized = ?`,
			params: [legacyVersionId, user.first_name_normalized, user.last_name_normalized],
		});
		return uniqueByFamily(rows.results);
	}

	private async alternateEmails(input: {
		legacyVersionId: string;
		legacyFamilyId: string;
		loginEmailNormalized: string;
	}): Promise<AlternateEmailRow[]> {
		const rows = await this.db.all<AlternateEmailRow>({
			sql: `SELECT snapshot.legacy_family_id,
				MIN(email.legacy_email_id) AS legacy_family_email_id,
				email.email_normalized
				FROM legacy_snapshot_families AS snapshot
				JOIN legacy_snapshot_emails AS email
					ON email.legacy_version_id = snapshot.legacy_version_id
					AND email.stable_family_key = snapshot.stable_family_key
				WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_family_id = ?
					AND email.email_normalized IS NOT NULL
					AND email.email_normalized <> ?
				GROUP BY snapshot.legacy_family_id, email.email_normalized`,
			params: [input.legacyVersionId, input.legacyFamilyId, input.loginEmailNormalized],
		});
		return rows.results;
	}

	async prepare(context: VerificationExtensionContext): Promise<readonly StatementSpec[]> {
		const snapshot = await this.currentSnapshot();
		const user = await this.verificationUser(context.userId);
		const exactMatches = await this.exactMatches(snapshot.id, context.targetEmailNormalized);
		const nameMatches = await this.nameMatches(snapshot.id, user);
		const exactCandidate = exactMatches.length === 1 ? exactMatches[0] : undefined;
		const exactEligible = isEligibleUnowned(exactCandidate) ? exactCandidate : undefined;
		const conflictReason =
			exactMatches.length > 1
				? 'multiple_exact_email_families'
				: exactCandidate && !exactEligible
					? exactCandidate.claimed_by_user_id || exactCandidate.allocation_owner_user_id
						? 'exact_email_already_owned'
						: 'exact_email_ineligible'
					: null;

		const eligibleNameCandidate =
			!exactEligible && nameMatches.length === 1 && isEligibleUnowned(nameMatches[0])
				? nameMatches[0]
				: undefined;
		const alternateEmails = eligibleNameCandidate
			? await this.alternateEmails({
					legacyVersionId: snapshot.id,
					legacyFamilyId: eligibleNameCandidate.legacy_family_id,
					loginEmailNormalized: context.targetEmailNormalized,
				})
			: [];
		const linkCandidate = alternateEmails.length === 1 ? alternateEmails[0] : undefined;
		const portalAllocationId = crypto.randomUUID();
		const guardSql = `EXISTS (
			SELECT 1 FROM auth_verification_commits AS verification
			WHERE verification.request_id = ? AND verification.token_id = ?
				AND verification.user_id = ? AND verification.target_email_normalized = ?
		) AND EXISTS (
			SELECT 1 FROM legacy_versions AS current_version
			JOIN academic_periods AS current_period
				ON current_period.id = current_version.academic_period_id
			JOIN import_runs AS current_run ON current_run.id = current_version.import_run_id
			JOIN plusbtext_versions AS current_plusbtext
				ON current_plusbtext.id = current_version.plusbtext_version_id
			WHERE current_version.id = ? AND current_version.import_run_id = ?
				AND current_version.is_published = 1 AND current_period.is_current = 1
				AND current_run.status = 'promoted'
				AND NOT EXISTS (
					SELECT 1 FROM legacy_reconciliation_cases AS reconciliation_case
					WHERE reconciliation_case.academic_period_id = current_period.id
						AND reconciliation_case.blocks_release = 1
						AND reconciliation_case.state NOT IN ('resolved', 'superseded')
				)
				AND NOT EXISTS (
					SELECT 1
					FROM legacy_reconciliation_occurrences AS occurrence
					JOIN legacy_reconciliation_cases AS reconciliation_case
						ON reconciliation_case.id = occurrence.case_id
					WHERE reconciliation_case.academic_period_id = current_period.id
						AND reconciliation_case.blocks_release = 1
						AND (
							(reconciliation_case.source_kind = 'access'
								AND occurrence.import_run_id = current_version.import_run_id
								AND occurrence.version_id = current_version.id)
							OR
							(reconciliation_case.source_kind = 'plusbtext'
								AND occurrence.import_run_id = current_plusbtext.import_run_id
								AND occurrence.version_id = current_plusbtext.id)
						)
						AND NOT EXISTS (
							SELECT 1
							FROM legacy_reconciliation_valid_typed_resolutions AS valid
							WHERE valid.case_id = occurrence.case_id
								AND valid.source_import_run_id = occurrence.import_run_id
								AND valid.source_version_id = occurrence.version_id
						)
				)
		)`;
		const guardParams = [
			context.verificationRequestId,
			context.verificationTokenId,
			context.userId,
			context.targetEmailNormalized,
			snapshot.id,
			snapshot.import_run_id,
		] as const;
		const statements: StatementSpec[] = [];

		for (const match of nameMatches) {
			statements.push({
				sql: `INSERT OR IGNORE INTO admin_review_tasks
					(id, kind, source_kind, source_id, reason_code, safe_summary,
					 status, assigned_to, resolution, created_at, updated_at, resolved_at)
					SELECT ?, 'family_name_match', 'legacy_family', ?, 'parent_name_match',
						'Verified parent name matched a legacy family.', 'open', NULL, NULL, ?, ?, NULL
					WHERE ${guardSql}`,
				params: [
					crypto.randomUUID(),
					match.legacy_family_id,
					context.now,
					context.now,
					...guardParams,
				],
			});
		}

		if (conflictReason) {
			for (const match of exactMatches) {
				statements.push({
					sql: `INSERT OR IGNORE INTO admin_review_tasks
						(id, kind, source_kind, source_id, reason_code, safe_summary,
						 status, assigned_to, resolution, created_at, updated_at, resolved_at)
						SELECT ?, 'family_claim_conflict', 'legacy_family', ?, ?,
							'Exact email family assignment requires review.', 'open', NULL, NULL, ?, ?, NULL
						WHERE ${guardSql}`,
					params: [
						crypto.randomUUID(),
						match.legacy_family_id,
						conflictReason,
						context.now,
						context.now,
						...guardParams,
					],
				});
			}
		}

		if (exactEligible) {
			statements.push(
				{
					sql: `UPDATE family_number_allocations SET owner_user_id = ?,
						assigned_at = COALESCE(assigned_at, ?), updated_at = ?
						WHERE id = ? AND owner_user_id IS NULL AND status = 'assigned'
							AND ${guardSql}`,
					params: [
						context.userId,
						context.now,
						context.now,
						exactEligible.family_number_id,
						...guardParams,
					],
				},
				{
					sql: `UPDATE legacy_families SET claimed_by_user_id = ?, claimed_at = ?, updated_at = ?
						WHERE id = ? AND claimed_by_user_id IS NULL
							AND family_number_id = ?
							AND EXISTS (SELECT 1 FROM family_number_allocations
								WHERE id = ? AND owner_user_id = ? AND status = 'assigned')
							AND ${guardSql}`,
					params: [
						context.userId,
						context.now,
						context.now,
						exactEligible.legacy_family_id,
						exactEligible.family_number_id,
						exactEligible.family_number_id,
						context.userId,
						...guardParams,
					],
				},
				{
					sql: `INSERT INTO family_claims
						(id, legacy_family_id, user_id, status, proof_kind, proof_at,
						 consented_at, claimed_at, review_task_id, created_at, updated_at)
						SELECT ?, ?, ?, 'claimed', 'verified_login_email', ?, NULL, ?, NULL, ?, ?
						WHERE EXISTS (SELECT 1 FROM legacy_families
							WHERE id = ? AND claimed_by_user_id = ?) AND ${guardSql}`,
					params: [
						crypto.randomUUID(),
						exactEligible.legacy_family_id,
						context.userId,
						context.now,
						context.now,
						context.now,
						context.now,
						exactEligible.legacy_family_id,
						context.userId,
						...guardParams,
					],
				},
				{
					sql: `UPDATE users SET family_number_id = ?, family_assignment_status = 'assigned',
						family_version = family_version + 1, family_assignment_import_run_id = ?,
						updated_at = ?
						WHERE id = ? AND role = 'parent' AND family_number_id IS NULL
							AND family_assignment_status = 'pending_verification' AND family_version = 0
							AND ${guardSql}`,
					params: [
						exactEligible.family_number_id,
						snapshot.import_run_id,
						context.now,
						context.userId,
						...guardParams,
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
							) AND ${guardSql}`,
					params: [
						context.userId,
						exactEligible.family_number_id,
						context.now,
						exactEligible.legacy_family_id,
						snapshot.id,
						...guardParams,
					],
				},
				{
					sql: `UPDATE family_link_attempts SET status = 'conflict', updated_at = ?
						WHERE legacy_family_id = ? AND user_id <> ?
							AND status IN ('candidate', 'proof_sent')
							AND EXISTS (SELECT 1 FROM legacy_families
								WHERE id = ? AND claimed_by_user_id = ?)
							AND ${guardSql}`,
					params: [
						context.now,
						exactEligible.legacy_family_id,
						context.userId,
						exactEligible.legacy_family_id,
						context.userId,
						...guardParams,
					],
				}
			);
		} else {
			const requiresReview = Boolean(conflictReason || nameMatches.length > 0);
			statements.push(
				{
					sql: `INSERT INTO family_number_allocations
						(id, namespace, sequence_number, display_family_id, legacy_family_id,
						 owner_user_id, origin, status, assigned_at,
						 merged_into_family_number_id, created_at, updated_at)
						SELECT ?, 'portal_2', next_sequence, printf('2. %04d', next_sequence),
							NULL, ?, 'portal', 'assigned', ?, NULL, ?, ?
						FROM (SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence
							FROM family_number_allocations WHERE namespace = 'portal_2')
						WHERE ${guardSql}
							AND EXISTS (SELECT 1 FROM users WHERE id = ? AND family_number_id IS NULL
								AND family_assignment_status = 'pending_verification' AND family_version = 0)`,
					params: [
						portalAllocationId,
						context.userId,
						context.now,
						context.now,
						context.now,
						...guardParams,
						context.userId,
					],
				},
				{
					sql: `UPDATE users SET family_number_id = ?, family_assignment_status = ?,
						family_version = family_version + 1, family_assignment_import_run_id = ?,
						updated_at = ?
						WHERE id = ? AND role = 'parent' AND family_number_id IS NULL
							AND family_assignment_status = 'pending_verification' AND family_version = 0
							AND EXISTS (SELECT 1 FROM family_number_allocations
								WHERE id = ? AND owner_user_id = ? AND status = 'assigned')
							AND ${guardSql}`,
					params: [
						portalAllocationId,
						requiresReview ? 'review_required' : 'assigned',
						snapshot.import_run_id,
						context.now,
						context.userId,
						portalAllocationId,
						context.userId,
						...guardParams,
					],
				}
			);

			if (eligibleNameCandidate && linkCandidate) {
				statements.push({
					sql: `INSERT OR IGNORE INTO family_link_attempts
						(id, user_id, legacy_family_id, legacy_family_email_id,
						 from_family_number_id, legacy_version_id, legacy_import_run_id,
						 match_kind, masked_email_snapshot, status, family_version,
						 review_task_id, proof_requested_at, confirmed_at, created_at, updated_at)
						SELECT ?, ?, ?, ?, ?, ?, ?, 'parent_name', ?, 'candidate',
							users.family_version, NULL, NULL, NULL, ?, ?
						FROM users WHERE users.id = ? AND users.family_number_id = ?
							AND users.family_version = 1 AND ${guardSql}`,
					params: [
						crypto.randomUUID(),
						context.userId,
						eligibleNameCandidate.legacy_family_id,
						linkCandidate.legacy_family_email_id,
						portalAllocationId,
						snapshot.id,
						snapshot.import_run_id,
						maskLegacyEmail(linkCandidate.email_normalized),
						context.now,
						context.now,
						context.userId,
						portalAllocationId,
						...guardParams,
					],
				});
			}
		}

		const assignedFamilyNumberId = exactEligible?.family_number_id ?? portalAllocationId;
		const resultAssertionSql = exactEligible
			? `AND EXISTS (SELECT 1 FROM legacy_families
					WHERE id = ? AND family_number_id = ? AND claimed_by_user_id = ?)
				AND EXISTS (SELECT 1 FROM family_claims
					WHERE legacy_family_id = ? AND user_id = ? AND status = 'claimed'
						AND proof_kind = 'verified_login_email')
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
				)`
			: '';
		const resultAssertionParams = exactEligible
			? [
					exactEligible.legacy_family_id,
					exactEligible.family_number_id,
					context.userId,
					exactEligible.legacy_family_id,
					context.userId,
					snapshot.id,
					exactEligible.legacy_family_id,
					context.userId,
					exactEligible.family_number_id,
				]
			: [];
		statements.push({
			sql: `INSERT INTO family_finalization_commits
				(request_id, verification_token_id, user_id, legacy_version_id,
				 legacy_import_run_id, family_number_id, result_kind,
				 assertion_passed, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN
					${guardSql}
					${resultAssertionSql}
					AND EXISTS (
						SELECT 1 FROM users AS final_user
						JOIN family_number_allocations AS final_family
							ON final_family.id = final_user.family_number_id
						WHERE final_user.id = ? AND final_user.email_verified_at IS NOT NULL
							AND final_user.family_number_id = ? AND final_user.family_version = 1
							AND final_user.family_assignment_status IN ('assigned', 'review_required')
							AND final_user.family_assignment_import_run_id = ?
							AND final_family.owner_user_id = final_user.id
							AND final_family.status = 'assigned'
					) THEN 1 ELSE 0 END, ?)`,
			params: [
				context.verificationRequestId,
				context.verificationTokenId,
				context.userId,
				snapshot.id,
				snapshot.import_run_id,
				assignedFamilyNumberId,
				exactEligible ? 'exact_email' : 'portal_allocated',
				...guardParams,
				...resultAssertionParams,
				context.userId,
				assignedFamilyNumberId,
				snapshot.import_run_id,
				context.now,
			],
		});
		return statements;
	}
}

import { hashCanonical } from '$lib/server/import/canonical';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import type { AdminActor } from '$lib/server/security/authorization';
import { AdminConsoleError } from './errors';

export interface FamilyCorrectionConsequenceSnapshot {
	contributorVersion: string;
	nonterminalOfferCount: number;
	immutableContractCount: number;
	safeDetails: Record<string, unknown>;
}

export interface FamilyCorrectionContributor {
	preview(input: {
		userId: string;
		fromFamilyNumberId: string;
		toFamilyNumberId: string;
	}): Promise<FamilyCorrectionConsequenceSnapshot>;
	applyStatements(input: {
		previewId: string;
		reassignmentId: string;
		userId: string;
		fromFamilyNumberId: string;
		toFamilyNumberId: string;
		now: string;
	}): Promise<readonly StatementSpec[]>;
	assertion(input: { previewId: string; reassignmentId: string }): {
		sql: string;
		params: readonly unknown[];
	};
}

export class Stage06aFamilyCorrectionContributor implements FamilyCorrectionContributor {
	async preview(): Promise<FamilyCorrectionConsequenceSnapshot> {
		return {
			contributorVersion: 'stage-06a-no-contract-tables-v1',
			nonterminalOfferCount: 0,
			immutableContractCount: 0,
			safeDetails: { contractTablesAvailable: false },
		};
	}

	async applyStatements(): Promise<readonly StatementSpec[]> {
		return [];
	}

	assertion(): { sql: string; params: readonly unknown[] } {
		return { sql: '1 = 1', params: [] };
	}
}

interface PreviewRow {
	id: string;
	actor_user_id: string;
	user_id: string;
	from_family_number_id: string;
	to_family_number_id: string;
	destination_kind: 'legacy_existing' | 'portal_allocated';
	legacy_version_id: string | null;
	legacy_import_run_id: string | null;
	family_version_before: number;
	owned_child_count: number;
	destination_child_count: number;
	children_snapshot_hash: string;
	consequence_snapshot_json: string;
	consequence_snapshot_hash: string;
	status: string;
	expires_at: string;
}

interface ChildPreviewRow {
	id: string;
	full_name: string;
	birth_date: string;
	origin: string;
	family_number_id: string;
	effect_kind: 'owned_switch' | 'destination_claim';
}

const ACTIVE_ADMIN = `EXISTS (SELECT 1 FROM users admin
	WHERE admin.id = ? AND admin.role = 'admin'
		AND admin.account_status = 'active' AND admin.is_blocked = 0)`;

function previewExpiry(now: string): string {
	return new Date(new Date(now).getTime() + 15 * 60 * 1000).toISOString();
}

export class FamilyCorrectionRepository {
	constructor(
		private readonly db: DatabaseBoundary,
		private readonly contributor: FamilyCorrectionContributor = new Stage06aFamilyCorrectionContributor()
	) {}

	private currentLegacySnapshot() {
		return this.db.first<{ id: string; import_run_id: string }>({
			sql: `SELECT version.id, version.import_run_id FROM legacy_versions version
				JOIN academic_periods period ON period.id = version.academic_period_id
				JOIN import_runs run ON run.id = version.import_run_id
				WHERE version.is_published = 1 AND period.is_current = 1
					AND run.status = 'promoted'`,
		});
	}

	private async userContext(userId: string) {
		return this.db.first<{
			id: string;
			family_number_id: string;
			family_version: number;
			family_display_id: string;
		}>({
			sql: `SELECT user.id, user.family_number_id, user.family_version,
				allocation.display_family_id AS family_display_id
			FROM users user
			JOIN family_number_allocations allocation ON allocation.id = user.family_number_id
			WHERE user.id = ? AND user.role = 'parent' AND user.email_verified_at IS NOT NULL
				AND user.account_status = 'active' AND user.is_blocked = 0
				AND user.family_assignment_status IN ('assigned', 'review_required')
				AND user.family_version > 0 AND allocation.status = 'assigned'
				AND allocation.owner_user_id = user.id`,
			params: [userId],
		});
	}

	private async ownedChildren(userId: string): Promise<ChildPreviewRow[]> {
		const rows = await this.db.all<Omit<ChildPreviewRow, 'effect_kind'>>({
			sql: `SELECT id, full_name, birth_date, origin, family_number_id
				FROM children WHERE owner_user_id = ? ORDER BY id`,
			params: [userId],
		});
		return rows.results.map((row) => ({ ...row, effect_kind: 'owned_switch' as const }));
	}

	private async destinationChildren(input: {
		legacyVersionId: string;
		legacyFamilyId: string;
		familyNumberId: string;
	}): Promise<ChildPreviewRow[]> {
		const rows = await this.db.all<Omit<ChildPreviewRow, 'effect_kind'>>({
			sql: `SELECT child.id, child.full_name, child.birth_date, child.origin,
				child.family_number_id
			FROM legacy_snapshot_children snapshot_child
			JOIN legacy_snapshot_families snapshot_family
				ON snapshot_family.legacy_version_id = snapshot_child.legacy_version_id
				AND snapshot_family.stable_family_key = snapshot_child.stable_family_key
			JOIN children child ON child.id = snapshot_child.legacy_child_id
			WHERE snapshot_child.legacy_version_id = ?
				AND snapshot_family.legacy_family_id = ?
				AND snapshot_child.continuity_needs_review = 0
				AND child.legacy_family_id = ? AND child.family_number_id = ?
				AND child.origin = 'legacy' AND child.is_current = 1
				AND child.owner_user_id IS NULL
			ORDER BY child.id`,
			params: [
				input.legacyVersionId,
				input.legacyFamilyId,
				input.legacyFamilyId,
				input.familyNumberId,
			],
		});
		return rows.results.map((row) => ({ ...row, effect_kind: 'destination_claim' as const }));
	}

	async createPreview(input: {
		actor: AdminActor;
		userId: string;
		destinationKind: 'legacy_existing' | 'portal_allocated';
		destinationAllocationId?: string;
		requestId: string;
		now: string;
	}) {
		const user = await this.userContext(input.userId);
		if (!user) throw new AdminConsoleError('FAMILY_CORRECTION_USER_NOT_ELIGIBLE');
		const admin = await this.db.first<{ id: string }>({
			sql: `SELECT id FROM users WHERE id = ? AND role = 'admin'
				AND account_status = 'active' AND is_blocked = 0`,
			params: [input.actor.id],
		});
		if (!admin) throw new AdminConsoleError('ADMIN_REQUIRED');

		let destinationAllocationId = input.destinationAllocationId ?? crypto.randomUUID();
		let destinationDisplayId: string;
		let destinationLegacyFamilyId: string | null = null;
		let snapshot: { id: string; import_run_id: string } | null = null;
		const allocationStatements: StatementSpec[] = [];

		if (input.destinationKind === 'legacy_existing') {
			if (!input.destinationAllocationId) {
				throw new AdminConsoleError('FAMILY_DESTINATION_REQUIRED');
			}
			snapshot = await this.currentLegacySnapshot();
			if (!snapshot) throw new AdminConsoleError('CURRENT_LEGACY_SNAPSHOT_REQUIRED');
			const destination = await this.db.first<{
				allocation_id: string;
				display_family_id: string;
				legacy_family_id: string;
			}>({
				sql: `SELECT allocation.id AS allocation_id, allocation.display_family_id,
					family.id AS legacy_family_id
				FROM family_number_allocations allocation
				JOIN legacy_families family ON family.id = allocation.legacy_family_id
				JOIN legacy_snapshot_families snapshot_family
					ON snapshot_family.legacy_family_id = family.id
					AND snapshot_family.legacy_version_id = ?
				WHERE allocation.id = ? AND allocation.namespace = 'legacy_1'
					AND allocation.status = 'assigned' AND allocation.owner_user_id IS NULL
					AND allocation.merged_into_family_number_id IS NULL
					AND family.family_number_id = allocation.id
					AND family.numbering_status = 'valid'
					AND family.continuity_status <> 'needs_review'
					AND family.claimed_by_user_id IS NULL
					AND snapshot_family.numbering_status = 'valid'
					AND snapshot_family.continuity_needs_review = 0`,
				params: [snapshot.id, input.destinationAllocationId],
			});
			if (!destination) throw new AdminConsoleError('FAMILY_DESTINATION_CONFLICT');
			destinationAllocationId = destination.allocation_id;
			destinationDisplayId = destination.display_family_id;
			destinationLegacyFamilyId = destination.legacy_family_id;
		} else {
			const next = await this.db.first<{
				sequence_number: number;
				display_family_id: string;
			}>({
				sql: `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS sequence_number,
					printf('2. %04d', COALESCE(MAX(sequence_number), 0) + 1) AS display_family_id
				FROM family_number_allocations WHERE namespace = 'portal_2'`,
			});
			if (!next) throw new AdminConsoleError('PORTAL_FAMILY_ALLOCATION_FAILED');
			destinationDisplayId = next.display_family_id;
			allocationStatements.push({
				sql: `INSERT INTO family_number_allocations
					(id, namespace, sequence_number, display_family_id, legacy_family_id,
					 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
					 created_at, updated_at)
					SELECT ?, 'portal_2', ?, ?, NULL, NULL, 'portal', 'pending', NULL, NULL, ?, ?
					WHERE ${ACTIVE_ADMIN}
						AND EXISTS (SELECT 1 FROM users WHERE id = ? AND family_number_id = ?
							AND family_version = ? AND account_status = 'active')`,
				params: [
					destinationAllocationId,
					next.sequence_number,
					destinationDisplayId,
					input.now,
					input.now,
					input.actor.id,
					input.userId,
					user.family_number_id,
					user.family_version,
				],
			});
		}

		if (destinationAllocationId === user.family_number_id) {
			throw new AdminConsoleError('FAMILY_DESTINATION_IS_CURRENT');
		}
		const ownedChildren = await this.ownedChildren(input.userId);
		if (ownedChildren.some((child) => child.family_number_id !== user.family_number_id)) {
			throw new AdminConsoleError('FAMILY_CHILD_INVARIANT_FAILED');
		}
		const destinationChildren =
			destinationLegacyFamilyId && snapshot
				? await this.destinationChildren({
						legacyVersionId: snapshot.id,
						legacyFamilyId: destinationLegacyFamilyId,
						familyNumberId: destinationAllocationId,
					})
				: [];
		if (destinationLegacyFamilyId) {
			const currentDestinationChildren = await this.db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM children
					WHERE legacy_family_id = ? AND family_number_id = ? AND is_current = 1`,
				params: [destinationLegacyFamilyId, destinationAllocationId],
			});
			if ((currentDestinationChildren?.count ?? 0) !== destinationChildren.length) {
				throw new AdminConsoleError('FAMILY_DESTINATION_CHILD_AMBIGUITY');
			}
		}
		const allChildren = [...ownedChildren, ...destinationChildren];
		const childrenSnapshotHash = await hashCanonical(
			allChildren.map((child) => ({
				id: child.id,
				effectKind: child.effect_kind,
				familyNumberId: child.family_number_id,
			}))
		);
		const consequences = await this.contributor.preview({
			userId: input.userId,
			fromFamilyNumberId: user.family_number_id,
			toFamilyNumberId: destinationAllocationId,
		});
		const consequenceSnapshotHash = await hashCanonical(consequences);
		const previewId = crypto.randomUUID();
		const expiresAt = previewExpiry(input.now);
		const statements: StatementSpec[] = [
			...allocationStatements,
			{
				sql: `INSERT INTO admin_family_correction_previews
					(id, actor_user_id, user_id, from_family_number_id, to_family_number_id,
					 destination_kind, legacy_version_id, legacy_import_run_id,
					 family_version_before, owned_child_count, destination_child_count,
					 children_snapshot_hash, consequence_snapshot_json,
					 consequence_snapshot_hash, status, applied_reassignment_id,
					 expires_at, created_at, updated_at)
					SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', NULL, ?, ?, ?
					WHERE ${ACTIVE_ADMIN}
						AND EXISTS (SELECT 1 FROM users WHERE id = ? AND family_number_id = ?
							AND family_version = ? AND account_status = 'active' AND is_blocked = 0)
						AND EXISTS (SELECT 1 FROM family_number_allocations
							WHERE id = ? AND ((? = 'legacy_existing' AND namespace = 'legacy_1'
								AND status = 'assigned' AND owner_user_id IS NULL)
								OR (? = 'portal_allocated' AND namespace = 'portal_2'
									AND status = 'pending' AND owner_user_id IS NULL)))`,
				params: [
					previewId,
					input.actor.id,
					input.userId,
					user.family_number_id,
					destinationAllocationId,
					input.destinationKind,
					snapshot?.id ?? null,
					snapshot?.import_run_id ?? null,
					user.family_version,
					ownedChildren.length,
					destinationChildren.length,
					childrenSnapshotHash,
					JSON.stringify(consequences),
					consequenceSnapshotHash,
					expiresAt,
					input.now,
					input.now,
					input.actor.id,
					input.userId,
					user.family_number_id,
					user.family_version,
					destinationAllocationId,
					input.destinationKind,
					input.destinationKind,
				],
			},
			...allChildren.map<StatementSpec>((child) => ({
				sql: `INSERT INTO admin_family_correction_preview_children
					(preview_id, child_id, effect_kind, expected_owner_user_id,
					 expected_family_number_id, created_at)
					SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (
						SELECT 1 FROM admin_family_correction_previews WHERE id = ? AND status = 'ready')`,
				params: [
					previewId,
					child.id,
					child.effect_kind,
					child.effect_kind === 'owned_switch' ? input.userId : null,
					child.family_number_id,
					input.now,
					previewId,
				],
			})),
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'family.correction_preview_created',
						'family_correction_preview', ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM admin_family_correction_previews
						WHERE id = ? AND status = 'ready')`,
				params: [
					crypto.randomUUID(),
					input.actor.id,
					previewId,
					input.requestId,
					JSON.stringify({
						userId: input.userId,
						fromFamily: user.family_display_id,
						toFamily: destinationDisplayId,
						ownedChildren: ownedChildren.length,
						destinationChildren: destinationChildren.length,
					}),
					input.now,
					previewId,
				],
			},
		];
		const results = await this.db.batch(statements);
		if ((results[allocationStatements.length]?.meta.changes ?? 0) !== 1) {
			throw new AdminConsoleError('FAMILY_CORRECTION_PREVIEW_RACE');
		}
		return {
			id: previewId,
			userId: input.userId,
			fromFamilyDisplayId: user.family_display_id,
			toFamilyDisplayId: destinationDisplayId,
			destinationKind: input.destinationKind,
			children: allChildren.map((child) => ({
				id: child.id,
				fullName: child.full_name,
				birthDate: child.birth_date,
				origin: child.origin,
				effectKind: child.effect_kind,
			})),
			consequences,
			expiresAt,
		};
	}

	async loadPreview(previewId: string, actor: AdminActor) {
		const preview = await this.db.first<PreviewRow>({
			sql: `SELECT id, actor_user_id, user_id, from_family_number_id,
				to_family_number_id, destination_kind, legacy_version_id,
				legacy_import_run_id, family_version_before, owned_child_count,
				destination_child_count, children_snapshot_hash,
				consequence_snapshot_json, consequence_snapshot_hash, status, expires_at
			FROM admin_family_correction_previews WHERE id = ? AND actor_user_id = ?`,
			params: [previewId, actor.id],
		});
		if (!preview) return null;
		const [families, children] = await Promise.all([
			this.db.all<{ id: string; display_family_id: string }>({
				sql: `SELECT id, display_family_id FROM family_number_allocations
					WHERE id IN (?, ?) ORDER BY id`,
				params: [preview.from_family_number_id, preview.to_family_number_id],
			}),
			this.db.all<{
				id: string;
				full_name: string;
				birth_date: string;
				origin: string;
				effect_kind: string;
			}>({
				sql: `SELECT child.id, child.full_name, child.birth_date, child.origin,
					preview_child.effect_kind
				FROM admin_family_correction_preview_children preview_child
				JOIN children child ON child.id = preview_child.child_id
				WHERE preview_child.preview_id = ? ORDER BY preview_child.effect_kind, child.id`,
				params: [previewId],
			}),
		]);
		const displayById = new Map(
			families.results.map((family) => [family.id, family.display_family_id])
		);
		return {
			id: preview.id,
			userId: preview.user_id,
			fromFamilyDisplayId: displayById.get(preview.from_family_number_id) ?? '',
			toFamilyDisplayId: displayById.get(preview.to_family_number_id) ?? '',
			destinationKind: preview.destination_kind,
			children: children.results,
			consequences: JSON.parse(
				preview.consequence_snapshot_json
			) as FamilyCorrectionConsequenceSnapshot,
			status: preview.status,
			expiresAt: preview.expires_at,
		};
	}

	private async previewRow(previewId: string, actorId: string): Promise<PreviewRow | null> {
		return this.db.first<PreviewRow>({
			sql: `SELECT id, actor_user_id, user_id, from_family_number_id,
				to_family_number_id, destination_kind, legacy_version_id,
				legacy_import_run_id, family_version_before, owned_child_count,
				destination_child_count, children_snapshot_hash,
				consequence_snapshot_json, consequence_snapshot_hash, status, expires_at
			FROM admin_family_correction_previews WHERE id = ? AND actor_user_id = ?`,
			params: [previewId, actorId],
		});
	}

	async apply(input: {
		actor: AdminActor;
		previewId: string;
		reason: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}): Promise<{ reassignmentId: string; replayed: boolean }> {
		const preview = await this.previewRow(input.previewId, input.actor.id);
		if (!preview) throw new AdminConsoleError('FAMILY_CORRECTION_PREVIEW_NOT_FOUND');
		const keyHash = await hashCanonical({ key: input.idempotencyKey.trim() });
		const storedKey = `admin:${keyHash}`;
		const requestHash = await hashCanonical({
			previewId: input.previewId,
			reason: input.reason.trim(),
		});
		const previous = await this.db.first<{
			id: string;
			status: string;
			safe_effects_json: string;
		}>({
			sql: `SELECT id, status, safe_effects_json FROM family_reassignments
				WHERE source = 'admin_correction' AND idempotency_key = ?`,
			params: [storedKey],
		});
		if (previous) {
			const effects = JSON.parse(previous.safe_effects_json) as { requestHash?: string };
			if (effects.requestHash !== requestHash) {
				throw new AdminConsoleError('IDEMPOTENCY_KEY_REUSED');
			}
			if (previous.status !== 'applied')
				throw new AdminConsoleError('FAMILY_CORRECTION_IN_PROGRESS');
			return { reassignmentId: previous.id, replayed: true };
		}
		if (preview.status !== 'ready' || preview.expires_at <= input.now) {
			throw new AdminConsoleError('FAMILY_CORRECTION_PREVIEW_STALE');
		}
		const currentConsequences = await this.contributor.preview({
			userId: preview.user_id,
			fromFamilyNumberId: preview.from_family_number_id,
			toFamilyNumberId: preview.to_family_number_id,
		});
		if ((await hashCanonical(currentConsequences)) !== preview.consequence_snapshot_hash) {
			throw new AdminConsoleError('FAMILY_CORRECTION_CONSEQUENCES_CHANGED');
		}

		const reassignmentId = crypto.randomUUID();
		const destinationLegacyFamily =
			preview.destination_kind === 'legacy_existing'
				? await this.db.first<{ id: string }>({
						sql: `SELECT id FROM legacy_families WHERE family_number_id = ?`,
						params: [preview.to_family_number_id],
					})
				: null;
		if (preview.destination_kind === 'legacy_existing' && !destinationLegacyFamily) {
			throw new AdminConsoleError('FAMILY_DESTINATION_CONFLICT');
		}
		const newClaimId = crypto.randomUUID();
		const contributorStatements = await this.contributor.applyStatements({
			previewId: preview.id,
			reassignmentId,
			userId: preview.user_id,
			fromFamilyNumberId: preview.from_family_number_id,
			toFamilyNumberId: preview.to_family_number_id,
			now: input.now,
		});
		const contributorAssertion = this.contributor.assertion({
			previewId: preview.id,
			reassignmentId,
		});
		const safeEffects = {
			requestHash,
			previewId: preview.id,
			account: true,
			ownedChildren: preview.owned_child_count,
			destinationChildren: preview.destination_child_count,
			consequences: currentConsequences,
		};
		const guard = `EXISTS (SELECT 1 FROM admin_family_correction_previews p
			WHERE p.id = ? AND p.actor_user_id = ? AND p.user_id = ?
				AND p.from_family_number_id = ? AND p.to_family_number_id = ?
				AND p.family_version_before = ? AND p.status = 'ready' AND p.expires_at > ?)
			AND ${ACTIVE_ADMIN}
			AND EXISTS (SELECT 1 FROM users user
				WHERE user.id = ? AND user.family_number_id = ? AND user.family_version = ?
					AND user.account_status = 'active' AND user.is_blocked = 0)
			AND NOT EXISTS (
				SELECT 1 FROM admin_family_correction_preview_children pc
				LEFT JOIN children child ON child.id = pc.child_id
				WHERE pc.preview_id = ? AND (
					child.id IS NULL OR child.family_number_id <> pc.expected_family_number_id
					OR child.owner_user_id IS NOT pc.expected_owner_user_id
					OR (pc.effect_kind = 'destination_claim' AND child.is_current <> 1)))
			AND NOT EXISTS (SELECT 1 FROM children child
				WHERE child.owner_user_id = ? AND NOT EXISTS (
					SELECT 1 FROM admin_family_correction_preview_children pc
					WHERE pc.preview_id = ? AND pc.child_id = child.id
						AND pc.effect_kind = 'owned_switch'))`;
		const guardParams = [
			preview.id,
			input.actor.id,
			preview.user_id,
			preview.from_family_number_id,
			preview.to_family_number_id,
			preview.family_version_before,
			input.now,
			input.actor.id,
			preview.user_id,
			preview.from_family_number_id,
			preview.family_version_before,
			preview.id,
			preview.user_id,
			preview.id,
		] as const;

		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO family_reassignments
					(id, user_id, from_family_number_id, to_family_number_id, source,
					 reason_code, reason_note, requested_by, confirmed_by, idempotency_key,
					 family_version_before, status, safe_effects_json, created_at, applied_at, updated_at)
					SELECT ?, ?, ?, ?, 'admin_correction', 'admin_family_id_correction', ?,
						?, NULL, ?, ?, 'planned', ?, ?, NULL, ? WHERE ${guard}`,
				params: [
					reassignmentId,
					preview.user_id,
					preview.from_family_number_id,
					preview.to_family_number_id,
					input.reason.trim(),
					input.actor.id,
					storedKey,
					preview.family_version_before,
					JSON.stringify(safeEffects),
					input.now,
					input.now,
					...guardParams,
				],
			},
			{
				sql: `UPDATE legacy_families SET claimed_by_user_id = NULL, claimed_at = NULL,
					continuity_status = 'corrected', updated_at = ?
					WHERE family_number_id = ? AND claimed_by_user_id = ?
						AND EXISTS (SELECT 1 FROM family_reassignments WHERE id = ? AND status = 'planned')`,
				params: [input.now, preview.from_family_number_id, preview.user_id, reassignmentId],
			},
			{
				sql: `UPDATE family_claims SET status = 'superseded', updated_at = ?
					WHERE user_id = ? AND status = 'claimed'
						AND EXISTS (SELECT 1 FROM family_reassignments WHERE id = ? AND status = 'planned')`,
				params: [input.now, preview.user_id, reassignmentId],
			},
			{
				sql: `UPDATE family_number_allocations SET status = 'merged_alias',
					merged_into_family_number_id = ?, updated_at = ?
					WHERE id = ? AND status = 'assigned' AND owner_user_id = ?
						AND EXISTS (SELECT 1 FROM family_reassignments WHERE id = ? AND status = 'planned')`,
				params: [
					preview.to_family_number_id,
					input.now,
					preview.from_family_number_id,
					preview.user_id,
					reassignmentId,
				],
			},
			{
				sql: `UPDATE family_number_allocations SET status = 'assigned', owner_user_id = ?,
					assigned_at = COALESCE(assigned_at, ?), updated_at = ?
					WHERE id = ? AND owner_user_id IS NULL
						AND ((? = 'legacy_existing' AND namespace = 'legacy_1' AND status = 'assigned')
							OR (? = 'portal_allocated' AND namespace = 'portal_2' AND status = 'pending'))
						AND EXISTS (SELECT 1 FROM family_reassignments WHERE id = ? AND status = 'planned')`,
				params: [
					preview.user_id,
					input.now,
					input.now,
					preview.to_family_number_id,
					preview.destination_kind,
					preview.destination_kind,
					reassignmentId,
				],
			},
			...(destinationLegacyFamily
				? [
						{
							sql: `UPDATE legacy_families SET claimed_by_user_id = ?, claimed_at = ?,
							continuity_status = 'corrected', updated_at = ?
							WHERE id = ? AND family_number_id = ? AND claimed_by_user_id IS NULL
								AND EXISTS (SELECT 1 FROM family_number_allocations
									WHERE id = ? AND owner_user_id = ? AND status = 'assigned')`,
							params: [
								preview.user_id,
								input.now,
								input.now,
								destinationLegacyFamily.id,
								preview.to_family_number_id,
								preview.to_family_number_id,
								preview.user_id,
							],
						},
						{
							sql: `INSERT INTO family_claims
							(id, legacy_family_id, user_id, status, proof_kind, proof_at,
							 consented_at, claimed_at, review_task_id, created_at, updated_at)
							SELECT ?, ?, ?, 'claimed', 'admin_reassignment', ?, NULL, ?, NULL, ?, ?
							WHERE EXISTS (SELECT 1 FROM legacy_families
								WHERE id = ? AND claimed_by_user_id = ?)`,
							params: [
								newClaimId,
								destinationLegacyFamily.id,
								preview.user_id,
								input.now,
								input.now,
								input.now,
								input.now,
								destinationLegacyFamily.id,
								preview.user_id,
							],
						},
					]
				: []),
			{
				sql: `UPDATE users SET family_number_id = ?, family_version = family_version + 1,
					family_assignment_status = 'assigned', updated_at = ?
					WHERE id = ? AND family_number_id = ? AND family_version = ?
						AND EXISTS (SELECT 1 FROM family_number_allocations
							WHERE id = ? AND owner_user_id = ? AND status = 'assigned')`,
				params: [
					preview.to_family_number_id,
					input.now,
					preview.user_id,
					preview.from_family_number_id,
					preview.family_version_before,
					preview.to_family_number_id,
					preview.user_id,
				],
			},
			{
				sql: `UPDATE children SET family_number_id = ?, updated_at = ?
					WHERE id IN (SELECT child_id FROM admin_family_correction_preview_children
						WHERE preview_id = ? AND effect_kind = 'owned_switch')
						AND owner_user_id = ? AND family_number_id = ?`,
				params: [
					preview.to_family_number_id,
					input.now,
					preview.id,
					preview.user_id,
					preview.from_family_number_id,
				],
			},
			{
				sql: `UPDATE children SET owner_user_id = ?, family_number_id = ?, updated_at = ?
					WHERE id IN (SELECT child_id FROM admin_family_correction_preview_children
						WHERE preview_id = ? AND effect_kind = 'destination_claim')
						AND owner_user_id IS NULL AND family_number_id = ? AND is_current = 1`,
				params: [
					preview.user_id,
					preview.to_family_number_id,
					input.now,
					preview.id,
					preview.to_family_number_id,
				],
			},
			...contributorStatements,
			{
				sql: `UPDATE family_reassignments SET status = 'applied', confirmed_by = ?,
					applied_at = ?, updated_at = ? WHERE id = ? AND status = 'planned'
					AND EXISTS (SELECT 1 FROM users WHERE id = ? AND family_number_id = ?
						AND family_version = ?)
					AND NOT EXISTS (SELECT 1 FROM children
						WHERE owner_user_id = ? AND family_number_id <> ?)`,
				params: [
					input.actor.id,
					input.now,
					input.now,
					reassignmentId,
					preview.user_id,
					preview.to_family_number_id,
					preview.family_version_before + 1,
					preview.user_id,
					preview.to_family_number_id,
				],
			},
			{
				sql: `UPDATE admin_review_tasks SET status = 'resolved', assigned_to = ?,
					resolution = 'admin_family_correction_applied', updated_at = ?, resolved_at = ?
					WHERE status IN ('open', 'in_progress')
						AND kind IN ('family_name_match', 'family_claim_conflict', 'family_correction')
						AND (? IS NOT NULL AND source_id = ?)
						AND EXISTS (SELECT 1 FROM family_reassignments
							WHERE id = ? AND status = 'applied')`,
				params: [
					input.actor.id,
					input.now,
					input.now,
					destinationLegacyFamily?.id ?? null,
					destinationLegacyFamily?.id ?? null,
					reassignmentId,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'family.admin_correction_applied',
						'family_reassignment', id, ?, ?, ?
					FROM family_reassignments WHERE id = ? AND status = 'applied'`,
				params: [
					crypto.randomUUID(),
					input.actor.id,
					input.requestId,
					JSON.stringify({
						familyChanged: true,
						ownedChildren: preview.owned_child_count,
						destinationChildren: preview.destination_child_count,
						nonterminalOffers: currentConsequences.nonterminalOfferCount,
						immutableContracts: currentConsequences.immutableContractCount,
					}),
					input.now,
					reassignmentId,
				],
			},
			{
				sql: `UPDATE admin_family_correction_previews SET status = 'applied',
					applied_reassignment_id = ?, updated_at = ?
					WHERE id = ? AND status = 'ready'
						AND EXISTS (SELECT 1 FROM family_reassignments
							WHERE id = ? AND status = 'applied')`,
				params: [reassignmentId, input.now, preview.id, reassignmentId],
			},
			{
				sql: `INSERT INTO family_transaction_assertions
					(id, operation_kind, operation_id, user_id, assertion_passed, created_at)
					VALUES (?, 'admin_correction', ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM admin_family_correction_previews
							WHERE id = ? AND status = 'applied'
								AND applied_reassignment_id = ?)
						AND EXISTS (SELECT 1 FROM family_reassignments
							WHERE id = ? AND status = 'applied' AND confirmed_by = ?)
						AND EXISTS (SELECT 1 FROM users WHERE id = ? AND family_number_id = ?
							AND family_version = ?)
						AND (SELECT COUNT(*) FROM children WHERE owner_user_id = ?) = ?
						AND NOT EXISTS (SELECT 1 FROM children
							WHERE owner_user_id = ? AND family_number_id <> ?)
						AND ${contributorAssertion.sql}
						AND (? IS NULL OR EXISTS (SELECT 1 FROM legacy_versions version
							JOIN academic_periods period ON period.id = version.academic_period_id
							JOIN import_runs run ON run.id = version.import_run_id
							WHERE version.id = ? AND version.import_run_id = ?
								AND version.is_published = 1 AND period.is_current = 1
								AND run.status = 'promoted'))
					THEN 1 ELSE 0 END, ?)`,
				params: [
					crypto.randomUUID(),
					reassignmentId,
					preview.user_id,
					preview.id,
					reassignmentId,
					reassignmentId,
					input.actor.id,
					preview.user_id,
					preview.to_family_number_id,
					preview.family_version_before + 1,
					preview.user_id,
					preview.owned_child_count + preview.destination_child_count,
					preview.user_id,
					preview.to_family_number_id,
					...contributorAssertion.params,
					preview.legacy_version_id,
					preview.legacy_version_id,
					preview.legacy_import_run_id,
					input.now,
				],
			},
		];

		try {
			await this.db.batch(statements);
		} catch (error) {
			const raced = await this.db.first<{
				id: string;
				status: string;
				safe_effects_json: string;
			}>({
				sql: `SELECT id, status, safe_effects_json FROM family_reassignments
					WHERE source = 'admin_correction' AND idempotency_key = ?`,
				params: [storedKey],
			});
			if (raced?.status === 'applied') {
				const effects = JSON.parse(raced.safe_effects_json) as { requestHash?: string };
				if (effects.requestHash === requestHash) {
					return { reassignmentId: raced.id, replayed: true };
				}
			}
			throw error;
		}
		return { reassignmentId, replayed: false };
	}
}

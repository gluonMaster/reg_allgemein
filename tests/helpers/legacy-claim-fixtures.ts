export interface SyntheticLegacyFamily {
	sequence: number;
	emails: string[];
	parentFirstName?: string;
	parentLastName?: string;
	parentNameMatchStatus?: 'eligible' | 'ambiguous' | 'unavailable';
	ownedBy?: string;
	childName?: string;
	childBirthDate?: string;
	groupName?: string;
	plannedPriceCents?: number | null;
	paymentArrangement?: 'existing_external_sepa' | 'manual_payment' | 'not_applicable';
	lessonKind?: 'group' | 'dance_group' | 'nachhilfe' | 'individual' | 'needs_review';
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

export async function seedCurrentLegacySnapshot(input: {
	db: D1Database;
	families: SyntheticLegacyFamily[];
	now?: string;
}): Promise<{ legacyVersionId: string; accessRunId: string; periodId: string }> {
	const now = input.now ?? '2026-07-17T09:00:00.000Z';
	const suffix = crypto.randomUUID();
	const periodId = `period-${suffix}`;
	const plusRunId = `plus-run-${suffix}`;
	const accessRunId = `access-run-${suffix}`;
	const plusVersionId = `plus-version-${suffix}`;
	const legacyVersionId = `legacy-version-${suffix}`;
	const statements: D1PreparedStatement[] = [];
	const push = (sql: string, ...params: unknown[]) =>
		statements.push(input.db.prepare(sql).bind(...params));

	push(
		`INSERT INTO academic_periods
			(id, code, display_name, starts_on, ends_on, is_current, created_at)
		 VALUES (?, ?, 'Synthetic current period', '2026-01-01', '2026-12-31', 1, ?)`,
		periodId,
		`synthetic-${suffix}`,
		now
	);
	for (const run of [
		{ id: plusRunId, kind: 'plusbtext', fingerprint: HASH_B },
		{ id: accessRunId, kind: 'access', fingerprint: HASH_C },
	] as const) {
		push(
			`INSERT INTO import_runs
				(id, source_kind, academic_period_id, source_label, source_hash_sha256,
				 source_contract_id, source_contract_version, structural_fingerprint_sha256,
				 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
				 attempt_no, retry_of_run_id, status, started_at, validated_at,
				 promoted_at, finished_at, rows_total, rows_staged, rows_promoted,
				 rows_skipped, safe_summary_json, error_code, created_at, updated_at)
			 VALUES (?, ?, ?, 'synthetic-claim-fixture', ?, 'synthetic-contract', 1, ?,
				 '{}', ?, ?, 1, NULL, 'validated', ?, ?, ?, ?, 1, 1, 1, 0, '{}', NULL, ?, ?)`,
			run.id,
			run.kind,
			periodId,
			HASH_A,
			HASH_A,
			HASH_A,
			run.fingerprint,
			now,
			now,
			now,
			now,
			now,
			now
		);
	}
	push(
		`INSERT INTO plusbtext_versions
			(id, academic_period_id, import_run_id, version_hash_sha256,
			 fingerprint_algorithm_version, logical_shape_fingerprint_sha256,
			 style_fingerprint_sha256, is_published, published_at, retired_at,
			 promotion_owner, promotion_fencing_token, created_at)
		 VALUES (?, ?, ?, ?, 1, ?, ?, 1, ?, NULL, 'synthetic-owner', 1, ?)`,
		plusVersionId,
		periodId,
		plusRunId,
		HASH_A,
		HASH_B,
		HASH_C,
		now,
		now
	);
	push(
		`INSERT INTO legacy_versions
			(id, academic_period_id, import_run_id, plusbtext_version_id,
			 version_hash_sha256, is_published, published_at, retired_at,
			 promotion_owner, promotion_fencing_token, created_at)
		 VALUES (?, ?, ?, ?, ?, 1, ?, NULL, 'synthetic-owner', 1, ?)`,
		legacyVersionId,
		periodId,
		accessRunId,
		plusVersionId,
		HASH_B,
		now,
		now
	);

	for (const [index, family] of input.families.entries()) {
		const stableKey = `stable-family-${suffix}-${index}`;
		const familyId = `legacy-family-${suffix}-${index}`;
		const allocationId = `legacy-allocation-${suffix}-${index}`;
		const familyPeriodId = `legacy-period-${suffix}-${index}`;
		const sourceFamilyId = `1. ${family.sequence}`;
		const firstName = (family.parentFirstName ?? 'Maria').toLowerCase();
		const lastName = (family.parentLastName ?? 'Parent').toLowerCase();
		push(
			`INSERT INTO family_number_allocations
				(id, namespace, sequence_number, display_family_id, legacy_family_id,
				 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
				 created_at, updated_at)
			 VALUES (?, 'legacy_1', ?, ?, ?, ?, 'legacy', 'assigned', ?, NULL, ?, ?)`,
			allocationId,
			family.sequence,
			sourceFamilyId,
			familyId,
			family.ownedBy ?? null,
			now,
			now,
			now
		);
		push(
			`INSERT INTO legacy_families
				(id, source_namespace, source_family_id, family_number_id,
				 numbering_status, claimed_by_user_id, claimed_at, continuity_status,
				 created_at, updated_at)
			 VALUES (?, 'legacy_1', ?, ?, 'valid', ?, ?, 'stable', ?, ?)`,
			familyId,
			sourceFamilyId,
			allocationId,
			family.ownedBy ?? null,
			family.ownedBy ? now : null,
			now,
			now
		);
		push(
			`INSERT INTO legacy_snapshot_families
				(id, legacy_version_id, stable_family_key, legacy_family_id,
				 source_family_id, family_number_id, legacy_sequence_number,
				 numbering_status, parent_name_raw, parent_first_name_normalized,
				 parent_last_name_normalized, parent_name_match_status,
				 parent_name_normalizer_version, continuity_needs_review,
				 address_raw, phone_raw, mobile_raw, record_hash_sha256, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'valid', ?, ?, ?, ?, 1, 0,
				 NULL, NULL, NULL, ?, ?)`,
			`snapshot-family-${suffix}-${index}`,
			legacyVersionId,
			stableKey,
			familyId,
			sourceFamilyId,
			allocationId,
			family.sequence,
			`${family.parentLastName ?? 'Parent'}, ${family.parentFirstName ?? 'Maria'}`,
			firstName,
			lastName,
			family.parentNameMatchStatus ?? 'eligible',
			HASH_A,
			now
		);
		push(
			`INSERT INTO legacy_family_periods
				(id, legacy_family_id, academic_period_id, import_run_id, parent_name_raw,
				 parent_first_name_normalized, parent_last_name_normalized,
				 parent_name_match_status, parent_name_normalizer_version,
				 address_raw, phone_raw, mobile_raw, last_seen_run_id, is_current,
				 retired_at, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, ?, 1,
				 NULL, ?, ?)`,
			familyPeriodId,
			familyId,
			periodId,
			accessRunId,
			`${family.parentLastName ?? 'Parent'}, ${family.parentFirstName ?? 'Maria'}`,
			firstName,
			lastName,
			family.parentNameMatchStatus ?? 'eligible',
			accessRunId,
			now,
			now
		);

		for (const [emailIndex, email] of family.emails.entries()) {
			const emailId = `legacy-email-${suffix}-${index}-${emailIndex}`;
			push(
				`INSERT INTO legacy_snapshot_emails
					(id, legacy_version_id, legacy_email_id, stable_family_key,
					 email_raw, email_normalized, source_access_id, record_hash_sha256, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				`snapshot-email-${suffix}-${index}-${emailIndex}`,
				legacyVersionId,
				emailId,
				stableKey,
				email,
				email.toLowerCase(),
				index * 10 + emailIndex + 1,
				HASH_A,
				now
			);
			push(
				`INSERT INTO legacy_family_emails
					(id, legacy_family_id, legacy_family_period_id, email_raw,
					 email_normalized, source_access_id, last_seen_run_id,
					 is_current, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
				emailId,
				familyId,
				familyPeriodId,
				email,
				email.toLowerCase(),
				index * 10 + emailIndex + 1,
				accessRunId,
				now,
				now
			);
		}

		if (family.childName) {
			const childId = `legacy-child-${suffix}-${index}`;
			const childKey = `child-key-${suffix}-${index}`;
			const sourceRowId = `legacy-row-${suffix}-${index}`;
			const birthDate = family.childBirthDate ?? '2016-04-03';
			push(
				`INSERT INTO legacy_snapshot_children
					(id, legacy_version_id, stable_family_key, legacy_child_id,
					 source_child_key, source_full_name, source_full_name_normalized,
					 source_birth_date, continuity_needs_review, record_hash_sha256, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
				`snapshot-child-${suffix}-${index}`,
				legacyVersionId,
				stableKey,
				childId,
				childKey,
				family.childName,
				family.childName.toLowerCase(),
				birthDate,
				HASH_A,
				now
			);
			push(
				`INSERT INTO children
					(id, owner_user_id, legacy_family_id, family_number_id, origin,
					 source_child_key, source_full_name, source_full_name_normalized,
					 source_birth_date, full_name_override, birth_date_override,
					 full_name, full_name_normalized, birth_date, last_seen_run_id,
					 is_current, created_at, updated_at)
				 VALUES (?, NULL, ?, ?, 'legacy', ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, 1, ?, ?)`,
				childId,
				familyId,
				allocationId,
				childKey,
				family.childName,
				family.childName.toLowerCase(),
				birthDate,
				family.childName,
				family.childName.toLowerCase(),
				birthDate,
				accessRunId,
				now,
				now
			);
			push(
				`INSERT INTO legacy_source_rows
					(id, source_namespace, academic_period_id, source_access_id,
					 value48_mirror, legacy_family_id, child_id, import_run_id,
					 source_hash, source_values_json, last_seen_run_id, is_current,
					 retired_at, created_at, updated_at)
				 VALUES (?, 'legacy_1', ?, ?, NULL, ?, ?, ?, ?, '{}', ?, 1, NULL, ?, ?)`,
				sourceRowId,
				periodId,
				index + 1,
				familyId,
				childId,
				accessRunId,
				HASH_A,
				accessRunId,
				now,
				now
			);
			push(
				`INSERT INTO legacy_enrollments
					(id, legacy_source_row_id, legacy_family_id, child_id,
					 academic_period_id, source_slot, source_record_key, group_name_raw,
					 group_name_normalized, course_group_id, teacher_name, day_raw,
					 duration_minutes, status_code_raw, lesson_kind, contract_kind,
					 price_source, price_mode, planned_price_cents, notes_raw,
					 needs_admin_review, is_active_for_occupancy,
					 represented_by_enrollment_id, last_seen_run_id, is_current,
					 retired_at, created_at, updated_at, duration_status,
					 payment_arrangement)
				 VALUES (?, ?, ?, ?, ?, 'main_next', ?, ?, ?, NULL, 'Synthetic teacher',
					 'Mo', 90, 'J', ?, 'yearly', 'yearly', 'rule_derived', ?,
					 'internal synthetic note', ?, 1, NULL, ?, 1, NULL, ?, ?, 'verified', ?)`,
				`legacy-enrollment-${suffix}-${index}`,
				sourceRowId,
				familyId,
				childId,
				periodId,
				`record-${suffix}-${index}`,
				family.groupName ?? `Synthetic group ${index + 1}`,
				(family.groupName ?? `Synthetic group ${index + 1}`).toLowerCase(),
				family.lessonKind ?? 'group',
				family.plannedPriceCents ?? null,
				family.plannedPriceCents == null ? 1 : 0,
				accessRunId,
				now,
				now,
				family.paymentArrangement ??
					(family.lessonKind === 'nachhilfe' ? 'not_applicable' : 'manual_payment')
			);
		}
	}

	// Build the immutable snapshot while its run is validated, then expose it as
	// promoted only after every snapshot/projection row has been staged.
	push(
		`UPDATE import_runs
		 SET status = 'promoted', updated_at = ?
		 WHERE id IN (?, ?)`,
		now,
		plusRunId,
		accessRunId
	);

	await input.db.batch(statements);
	return { legacyVersionId, accessRunId, periodId };
}

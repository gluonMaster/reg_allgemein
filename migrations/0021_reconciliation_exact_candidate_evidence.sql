PRAGMA foreign_keys = ON;

-- A terminal reconciliation decision is useful to a release only when its
-- typed evidence was checked for the exact immutable import occurrence.  The
-- binding is append-only; the validity view below deliberately re-checks the
-- referenced operational evidence so that a later revocation fails closed.
CREATE TABLE legacy_reconciliation_evidence_bindings (
	decision_id TEXT PRIMARY KEY NOT NULL REFERENCES legacy_reconciliation_decisions(id),
	case_id TEXT NOT NULL REFERENCES legacy_reconciliation_cases(id),
	case_version INTEGER NOT NULL CHECK (case_version > 0),
	action TEXT NOT NULL CHECK (action IN (
		'same_service_duplicate', 'distinct_service_proven', 'exact_catalog_mapping',
		'verified_portal_family_link', 'typed_child_correction', 'typed_family_correction'
	)),
	evidence_ref_kind TEXT NOT NULL CHECK (evidence_ref_kind IN (
		'course_source_mapping', 'family_claim', 'child_correction',
		'family_reassignment', 'duplicate_pair'
	)),
	evidence_ref_id TEXT NOT NULL,
	target_type TEXT NOT NULL CHECK (target_type IN (
		'course_group', 'legacy_child', 'legacy_enrollment', 'user', 'family_reassignment'
	)),
	target_id TEXT NOT NULL,
	source_import_run_id TEXT NOT NULL REFERENCES import_runs(id),
	source_version_id TEXT NOT NULL,
	source_row_id TEXT,
	anchor_enrollment_id TEXT,
	peer_enrollment_id TEXT,
	created_at TEXT NOT NULL,
	UNIQUE (case_id, case_version),
	CHECK (
		(action IN ('same_service_duplicate', 'distinct_service_proven')
			AND anchor_enrollment_id IS NOT NULL AND peer_enrollment_id IS NOT NULL
			AND anchor_enrollment_id <> peer_enrollment_id)
		OR
		(action NOT IN ('same_service_duplicate', 'distinct_service_proven')
			AND anchor_enrollment_id IS NULL AND peer_enrollment_id IS NULL)
	),
	CHECK (action <> 'typed_child_correction' OR source_row_id IS NOT NULL)
);

CREATE INDEX legacy_reconciliation_evidence_bindings_candidate
	ON legacy_reconciliation_evidence_bindings
		(case_id, source_import_run_id, source_version_id, action);

-- Evidence queries must observe an immutable materialized snapshot.  Failed
-- runs remain cleanable because the guards apply only after reconciliation has
-- created an occurrence or after the parent run has been promoted.
CREATE TRIGGER legacy_snapshot_families_validated_reject_insert
BEFORE INSERT ON legacy_snapshot_families
WHEN EXISTS (
	SELECT 1 FROM legacy_versions AS version
	JOIN import_runs AS run ON run.id = version.import_run_id
	WHERE version.id = NEW.legacy_version_id AND (run.status = 'promoted' OR EXISTS (
		SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
		WHERE occurrence.version_id = version.id
	))
)
BEGIN
	SELECT RAISE(ABORT, 'validated legacy snapshot is immutable');
END;

CREATE TRIGGER legacy_snapshot_families_validated_reject_update
BEFORE UPDATE ON legacy_snapshot_families
WHEN EXISTS (
	SELECT 1 FROM legacy_versions AS version
	JOIN import_runs AS run ON run.id = version.import_run_id
	WHERE version.id = OLD.legacy_version_id AND (run.status = 'promoted' OR EXISTS (
		SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
		WHERE occurrence.version_id = version.id
	))
)
BEGIN
	SELECT RAISE(ABORT, 'validated legacy snapshot is immutable');
END;

CREATE TRIGGER legacy_snapshot_families_validated_reject_delete
BEFORE DELETE ON legacy_snapshot_families
WHEN EXISTS (
	SELECT 1 FROM legacy_versions AS version
	JOIN import_runs AS run ON run.id = version.import_run_id
	WHERE version.id = OLD.legacy_version_id AND (run.status = 'promoted' OR EXISTS (
		SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
		WHERE occurrence.version_id = version.id
	))
)
BEGIN
	SELECT RAISE(ABORT, 'validated legacy snapshot is immutable');
END;

CREATE TRIGGER legacy_snapshot_source_rows_validated_reject_insert
BEFORE INSERT ON legacy_snapshot_source_rows
WHEN EXISTS (
	SELECT 1 FROM legacy_versions AS version
	JOIN import_runs AS run ON run.id = version.import_run_id
	WHERE version.id = NEW.legacy_version_id AND (run.status = 'promoted' OR EXISTS (
		SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
		WHERE occurrence.version_id = version.id
	))
)
BEGIN
	SELECT RAISE(ABORT, 'validated legacy snapshot is immutable');
END;

CREATE TRIGGER legacy_snapshot_source_rows_validated_reject_update
BEFORE UPDATE ON legacy_snapshot_source_rows
WHEN EXISTS (
	SELECT 1 FROM legacy_versions AS version
	JOIN import_runs AS run ON run.id = version.import_run_id
	WHERE version.id = OLD.legacy_version_id AND (run.status = 'promoted' OR EXISTS (
		SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
		WHERE occurrence.version_id = version.id
	))
)
BEGIN
	SELECT RAISE(ABORT, 'validated legacy snapshot is immutable');
END;

CREATE TRIGGER legacy_snapshot_source_rows_validated_reject_delete
BEFORE DELETE ON legacy_snapshot_source_rows
WHEN EXISTS (
	SELECT 1 FROM legacy_versions AS version
	JOIN import_runs AS run ON run.id = version.import_run_id
	WHERE version.id = OLD.legacy_version_id AND (run.status = 'promoted' OR EXISTS (
		SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
		WHERE occurrence.version_id = version.id
	))
)
BEGIN
	SELECT RAISE(ABORT, 'validated legacy snapshot is immutable');
END;

CREATE TRIGGER legacy_snapshot_enrollments_validated_reject_insert
BEFORE INSERT ON legacy_snapshot_enrollments
WHEN EXISTS (
	SELECT 1 FROM legacy_versions AS version
	JOIN import_runs AS run ON run.id = version.import_run_id
	WHERE version.id = NEW.legacy_version_id AND (run.status = 'promoted' OR EXISTS (
		SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
		WHERE occurrence.version_id = version.id
	))
)
BEGIN
	SELECT RAISE(ABORT, 'validated legacy snapshot is immutable');
END;

CREATE TRIGGER legacy_snapshot_enrollments_validated_reject_update
BEFORE UPDATE ON legacy_snapshot_enrollments
WHEN EXISTS (
	SELECT 1 FROM legacy_versions AS version
	JOIN import_runs AS run ON run.id = version.import_run_id
	WHERE version.id = OLD.legacy_version_id AND (run.status = 'promoted' OR EXISTS (
		SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
		WHERE occurrence.version_id = version.id
	))
)
BEGIN
	SELECT RAISE(ABORT, 'validated legacy snapshot is immutable');
END;

CREATE TRIGGER legacy_snapshot_enrollments_validated_reject_delete
BEFORE DELETE ON legacy_snapshot_enrollments
WHEN EXISTS (
	SELECT 1 FROM legacy_versions AS version
	JOIN import_runs AS run ON run.id = version.import_run_id
	WHERE version.id = OLD.legacy_version_id AND (run.status = 'promoted' OR EXISTS (
		SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
		WHERE occurrence.version_id = version.id
	))
)
BEGIN
	SELECT RAISE(ABORT, 'validated legacy snapshot is immutable');
END;

CREATE TRIGGER import_issues_reconciliation_identity_immutable
BEFORE UPDATE OF import_run_id, severity, code, source_record_key, safe_context_json ON import_issues
WHEN EXISTS (
	SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
	WHERE occurrence.import_issue_id = OLD.id
)
BEGIN
	SELECT RAISE(ABORT, 'reconciled import issue identity is immutable');
END;

CREATE TRIGGER legacy_reconciliation_evidence_bindings_reject_update
BEFORE UPDATE ON legacy_reconciliation_evidence_bindings
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation evidence bindings are append-only');
END;

CREATE TRIGGER legacy_reconciliation_evidence_bindings_reject_delete
BEFORE DELETE ON legacy_reconciliation_evidence_bindings
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation evidence bindings are append-only');
END;

CREATE TRIGGER legacy_reconciliation_evidence_bindings_decision_guard
BEFORE INSERT ON legacy_reconciliation_evidence_bindings
WHEN NOT EXISTS (
	SELECT 1
	FROM legacy_reconciliation_decisions AS decision
	JOIN legacy_reconciliation_cases AS reconciliation_case
		ON reconciliation_case.id = decision.case_id
	WHERE decision.id = NEW.decision_id
		AND decision.case_id = NEW.case_id
		AND decision.case_version_after = NEW.case_version
		AND decision.action = NEW.action
		AND decision.actor_kind = 'admin'
		AND decision.target_type = NEW.target_type
		AND decision.target_id = NEW.target_id
		AND decision.current_import_run_id = NEW.source_import_run_id
		AND decision.current_version_id = NEW.source_version_id
		AND reconciliation_case.version = decision.case_version_before
		AND reconciliation_case.last_seen_import_run_id = NEW.source_import_run_id
		AND reconciliation_case.last_seen_version_id = NEW.source_version_id
)
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation evidence binding decision mismatch');
END;

-- Structurally bound evidence plus its current operational validity.  Every
-- branch is intentionally tied to the case's last-seen immutable version.
CREATE VIEW legacy_reconciliation_live_typed_evidence AS
WITH bound AS (
	SELECT binding.*, decision.current_import_run_id, decision.current_version_id,
		reconciliation_case.academic_period_id, reconciliation_case.source_kind,
		reconciliation_case.source_identity_digest, reconciliation_case.issue_code,
		reconciliation_case.entity_type, reconciliation_case.entity_id,
		reconciliation_case.state, reconciliation_case.resolution_kind,
		reconciliation_case.version
	FROM legacy_reconciliation_evidence_bindings AS binding
	JOIN legacy_reconciliation_decisions AS decision ON decision.id = binding.decision_id
	JOIN legacy_reconciliation_cases AS reconciliation_case
		ON reconciliation_case.id = binding.case_id
	WHERE reconciliation_case.state = 'resolved'
		AND reconciliation_case.resolution_kind = binding.action
		AND reconciliation_case.version = binding.case_version
		AND decision.current_import_run_id = binding.source_import_run_id
		AND decision.current_version_id = binding.source_version_id
		AND EXISTS (
			SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
			WHERE occurrence.case_id = binding.case_id
				AND occurrence.import_run_id = binding.source_import_run_id
				AND occurrence.version_id = binding.source_version_id
		)
)
SELECT bound.* FROM bound
WHERE bound.action = 'exact_catalog_mapping'
	AND bound.evidence_ref_kind = 'course_source_mapping'
	AND bound.target_type = 'course_group'
	AND bound.entity_type = 'legacy_enrollment'
	AND EXISTS (
		SELECT 1
		FROM legacy_snapshot_enrollments AS snapshot
		JOIN course_source_mappings AS mapping
			ON mapping.id = bound.evidence_ref_id
			AND mapping.academic_period_id = bound.academic_period_id
			AND mapping.source_kind = 'access'
			AND mapping.status = 'confirmed'
			AND mapping.course_group_id = bound.target_id
			AND mapping.source_value_normalized = snapshot.group_name_normalized
		WHERE snapshot.legacy_version_id = bound.source_version_id
			AND snapshot.legacy_enrollment_id = bound.entity_id
	)
UNION ALL
SELECT bound.* FROM bound
WHERE bound.action = 'verified_portal_family_link'
	AND bound.evidence_ref_kind = 'family_claim'
	AND bound.target_type = 'user'
	AND bound.entity_type = 'legacy_family'
	AND EXISTS (
		SELECT 1
		FROM family_claims AS claim
		JOIN legacy_families AS family ON family.id = claim.legacy_family_id
		JOIN legacy_snapshot_families AS snapshot
			ON snapshot.legacy_version_id = bound.source_version_id
			AND snapshot.legacy_family_id = claim.legacy_family_id
		WHERE claim.id = bound.evidence_ref_id
			AND claim.legacy_family_id = bound.entity_id
			AND claim.user_id = bound.target_id
			AND claim.status = 'claimed'
			AND family.claimed_by_user_id = bound.target_id
	)
UNION ALL
SELECT bound.* FROM bound
WHERE bound.action = 'typed_child_correction'
	AND bound.evidence_ref_kind = 'child_correction'
	AND bound.target_type = 'legacy_child'
	AND bound.entity_type = 'legacy_family'
	AND bound.issue_code = 'ACCESS_CHILD_BIRTH_DATE_INVALID'
	AND EXISTS (
		SELECT 1
		FROM child_correction_requests AS correction
		JOIN children AS child ON child.id = correction.child_id
			AND child.origin = 'legacy'
			AND child.legacy_family_id = bound.entity_id
			AND child.full_name_override = correction.requested_full_name
			AND child.birth_date_override = correction.requested_birth_date
		JOIN legacy_snapshot_source_rows AS source
			ON source.id = bound.source_row_id
			AND source.legacy_version_id = bound.source_version_id
		JOIN legacy_snapshot_families AS family
			ON family.legacy_version_id = source.legacy_version_id
			AND family.stable_family_key = source.stable_family_key
			AND family.legacy_family_id = bound.entity_id
		WHERE correction.id = bound.evidence_ref_id
			AND correction.child_id = bound.target_id
			AND correction.status = 'approved'
			AND trim(CAST(json_extract(source.source_values_json, '$.Value4') AS TEXT))
				IN (trim(child.source_full_name), trim(correction.requested_full_name))
			AND EXISTS (
				SELECT 1 FROM audit_events AS audit
				WHERE audit.target_kind = 'child_correction'
					AND audit.target_id = correction.id
					AND audit.action = 'child.legacy_correction_approved'
			)
	)
UNION ALL
SELECT bound.* FROM bound
WHERE bound.action = 'typed_family_correction'
	AND bound.evidence_ref_kind = 'family_reassignment'
	AND bound.target_type = 'family_reassignment'
	AND bound.entity_type = 'legacy_family'
	AND EXISTS (
		SELECT 1
		FROM family_reassignments AS reassignment
		JOIN legacy_families AS family ON family.id = bound.entity_id
		JOIN legacy_snapshot_families AS snapshot
			ON snapshot.legacy_version_id = bound.source_version_id
			AND snapshot.legacy_family_id = bound.entity_id
		WHERE reassignment.id = bound.evidence_ref_id
			AND reassignment.id = bound.target_id
			AND reassignment.status = 'applied'
			AND family.family_number_id IN
				(reassignment.from_family_number_id, reassignment.to_family_number_id)
			AND EXISTS (
				SELECT 1 FROM audit_events AS audit
				WHERE audit.target_kind = 'family_reassignment'
					AND audit.target_id = reassignment.id
					AND audit.action = 'family.admin_correction_applied'
			)
	)
UNION ALL
SELECT bound.* FROM bound
WHERE bound.action IN ('same_service_duplicate', 'distinct_service_proven')
	AND bound.evidence_ref_kind = 'duplicate_pair'
	AND bound.target_type = 'legacy_enrollment'
	AND bound.entity_type = 'legacy_enrollment'
	AND bound.issue_code = 'ACCESS_CHILD_GROUP_DUPLICATE_SLOTS'
	AND bound.entity_id = bound.anchor_enrollment_id
	AND bound.target_id = bound.peer_enrollment_id
	AND EXISTS (
		SELECT 1
		FROM legacy_reconciliation_occurrences AS occurrence
		JOIN import_issues AS issue ON issue.id = occurrence.import_issue_id
		WHERE occurrence.case_id = bound.case_id
			AND occurrence.import_run_id = bound.source_import_run_id
			AND occurrence.version_id = bound.source_version_id
			AND json_array_length(issue.safe_context_json, '$.relatedEnrollmentIds') = 2
			AND (SELECT COUNT(DISTINCT value)
				FROM json_each(issue.safe_context_json, '$.relatedEnrollmentIds')) = 2
			AND EXISTS (SELECT 1 FROM json_each(
				issue.safe_context_json, '$.relatedEnrollmentIds') WHERE value = bound.anchor_enrollment_id)
			AND EXISTS (SELECT 1 FROM json_each(
				issue.safe_context_json, '$.relatedEnrollmentIds') WHERE value = bound.peer_enrollment_id)
	)
	AND EXISTS (
		SELECT 1
		FROM legacy_snapshot_enrollments AS anchor
		JOIN legacy_snapshot_enrollments AS peer
			ON peer.legacy_version_id = anchor.legacy_version_id
			AND peer.source_child_key = anchor.source_child_key
			AND peer.group_name_normalized = anchor.group_name_normalized
		WHERE anchor.legacy_version_id = bound.source_version_id
			AND anchor.legacy_enrollment_id = bound.anchor_enrollment_id
			AND peer.legacy_enrollment_id = bound.peer_enrollment_id
	)
	AND (
		bound.action = 'same_service_duplicate'
		OR EXISTS (
			SELECT 1
			FROM legacy_enrollments AS anchor_current
			JOIN legacy_enrollments AS peer_current ON peer_current.id = bound.peer_enrollment_id
			JOIN course_groups AS anchor_course
				ON anchor_course.id = anchor_current.course_group_id
				AND anchor_course.academic_period_id = bound.academic_period_id
				AND anchor_course.catalog_status IN ('published', 'needs_review')
			JOIN course_groups AS peer_course
				ON peer_course.id = peer_current.course_group_id
				AND peer_course.academic_period_id = bound.academic_period_id
				AND peer_course.catalog_status IN ('published', 'needs_review')
			WHERE anchor_current.id = bound.anchor_enrollment_id
				AND anchor_current.is_current = 1
				AND peer_current.is_current = 1
				AND anchor_course.id <> peer_course.id
		)
	);

CREATE VIEW legacy_reconciliation_valid_typed_resolutions AS
SELECT live.*
FROM legacy_reconciliation_live_typed_evidence AS live
JOIN legacy_reconciliation_assertions AS assertion
	ON assertion.decision_id = live.decision_id
	AND assertion.case_id = live.case_id
	AND assertion.case_version = live.case_version
	AND assertion.assertion_kind = 'typed_evidence_verified'
	AND assertion.assertion_passed = 1;

-- The assertion is the last statement in the admin mutation batch.  If the
-- evidence row was not inserted or is already invalid, CHECK(=1) aborts and D1
-- rolls the whole batch back.
CREATE TRIGGER legacy_reconciliation_assertions_typed_evidence_guard
BEFORE INSERT ON legacy_reconciliation_assertions
WHEN NEW.assertion_kind = 'typed_evidence_verified'
	AND NOT EXISTS (
		SELECT 1 FROM legacy_reconciliation_live_typed_evidence AS valid
		WHERE valid.decision_id = NEW.decision_id
			AND valid.case_id = NEW.case_id
			AND valid.case_version = NEW.case_version
	)
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation typed evidence invalid');
END;

-- Replace the period-only fence with an exact-candidate fence.  A typed
-- resolution is accepted only for the same run/version occurrence; a later
-- clean import cannot authorize replaying an older bad candidate.
DROP TRIGGER legacy_version_promotion_events_reconciliation_gate;

CREATE TRIGGER legacy_version_promotion_events_reconciliation_gate
BEFORE INSERT ON legacy_version_promotion_events
WHEN NEW.action = 'promote' AND (
	EXISTS (
		SELECT 1 FROM legacy_reconciliation_cases AS reconciliation_case
		WHERE reconciliation_case.academic_period_id = NEW.academic_period_id
			AND reconciliation_case.blocks_release = 1
			AND reconciliation_case.state NOT IN ('resolved', 'superseded')
	)
	OR EXISTS (
		SELECT 1
		FROM legacy_reconciliation_occurrences AS occurrence
		JOIN legacy_reconciliation_cases AS reconciliation_case
			ON reconciliation_case.id = occurrence.case_id
		WHERE reconciliation_case.academic_period_id = NEW.academic_period_id
			AND reconciliation_case.source_kind = NEW.source_kind
			AND reconciliation_case.blocks_release = 1
			AND occurrence.import_run_id = NEW.import_run_id
			AND occurrence.version_id = NEW.version_id
			AND NOT EXISTS (
				SELECT 1 FROM legacy_reconciliation_valid_typed_resolutions AS valid
				WHERE valid.case_id = occurrence.case_id
					AND valid.source_import_run_id = occurrence.import_run_id
					AND valid.source_version_id = occurrence.version_id
			)
	)
)
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation release gate blocked');
END;

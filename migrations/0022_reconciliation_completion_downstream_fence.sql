PRAGMA foreign_keys = ON;

-- A validated legacy import is not release-eligible until every actionable
-- ACCESS_/PLUSB_ issue has been materialized into an exact run/version
-- occurrence.  The marker is append-only and is written only as the final
-- step of reconciliation, so a Worker termination between validation and
-- reconciliation fails closed.
CREATE TABLE legacy_reconciliation_materializations (
	source_kind TEXT NOT NULL CHECK (source_kind IN ('access', 'plusbtext')),
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	import_run_id TEXT NOT NULL REFERENCES import_runs(id),
	version_id TEXT NOT NULL,
	actionable_issue_count INTEGER NOT NULL CHECK (actionable_issue_count >= 0),
	occurrence_count INTEGER NOT NULL CHECK (occurrence_count >= 0),
	completed_at TEXT NOT NULL,
	PRIMARY KEY (source_kind, import_run_id, version_id),
	CHECK (actionable_issue_count = occurrence_count)
);

CREATE TRIGGER legacy_reconciliation_materializations_exact_guard
BEFORE INSERT ON legacy_reconciliation_materializations
WHEN NOT (
	EXISTS (
		SELECT 1 FROM import_runs AS run
		WHERE run.id = NEW.import_run_id
			AND run.source_kind = NEW.source_kind
			AND run.academic_period_id = NEW.academic_period_id
			AND run.status IN ('validated', 'promoted')
	)
	AND (
		(NEW.source_kind = 'access' AND EXISTS (
			SELECT 1 FROM legacy_versions AS version
			WHERE version.id = NEW.version_id
				AND version.import_run_id = NEW.import_run_id
				AND version.academic_period_id = NEW.academic_period_id
		))
		OR
		(NEW.source_kind = 'plusbtext' AND EXISTS (
			SELECT 1 FROM plusbtext_versions AS version
			WHERE version.id = NEW.version_id
				AND version.import_run_id = NEW.import_run_id
				AND version.academic_period_id = NEW.academic_period_id
		))
	)
	AND NEW.actionable_issue_count = (
		SELECT COUNT(*) FROM import_issues AS issue
		WHERE issue.import_run_id = NEW.import_run_id
			AND (issue.code GLOB 'ACCESS_*' OR issue.code GLOB 'PLUSB_*')
	)
	AND NEW.occurrence_count = (
		SELECT COUNT(*)
		FROM legacy_reconciliation_occurrences AS occurrence
		JOIN import_issues AS issue ON issue.id = occurrence.import_issue_id
		WHERE occurrence.import_run_id = NEW.import_run_id
			AND occurrence.version_id = NEW.version_id
			AND issue.import_run_id = NEW.import_run_id
			AND (issue.code GLOB 'ACCESS_*' OR issue.code GLOB 'PLUSB_*')
	)
)
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation materialization incomplete');
END;

CREATE TRIGGER legacy_reconciliation_materializations_no_update
BEFORE UPDATE ON legacy_reconciliation_materializations
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation materialization is append-only');
END;

CREATE TRIGGER legacy_reconciliation_materializations_no_delete
BEFORE DELETE ON legacy_reconciliation_materializations
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation materialization is append-only');
END;

CREATE TRIGGER import_issues_after_reconciliation_materialization_no_insert
BEFORE INSERT ON import_issues
WHEN EXISTS (
	SELECT 1 FROM legacy_reconciliation_materializations AS materialization
	WHERE materialization.import_run_id = NEW.import_run_id
)
BEGIN
	SELECT RAISE(ABORT, 'materialized import issues are immutable');
END;

CREATE TRIGGER import_issues_after_reconciliation_materialization_no_update
BEFORE UPDATE OF id, import_run_id, severity, code, source_record_key,
	safe_context_json, created_at ON import_issues
WHEN EXISTS (
	SELECT 1 FROM legacy_reconciliation_materializations AS materialization
	WHERE materialization.import_run_id = OLD.import_run_id
)
BEGIN
	SELECT RAISE(ABORT, 'materialized import issues are immutable');
END;

CREATE TRIGGER import_issues_after_reconciliation_materialization_no_delete
BEFORE DELETE ON import_issues
WHEN EXISTS (
	SELECT 1 FROM legacy_reconciliation_materializations AS materialization
	WHERE materialization.import_run_id = OLD.import_run_id
)
BEGIN
	SELECT RAISE(ABORT, 'materialized import issues are immutable');
END;

-- Migration 0021 bound a child correction to the exact source row, but its
-- live predicate still allowed another same-name child in the family.  Keep
-- the original evidence view immutable and layer the exact child identity on
-- top so already stored weak evidence becomes invalid immediately.
CREATE VIEW legacy_reconciliation_strict_live_typed_evidence AS
SELECT live.*
FROM legacy_reconciliation_live_typed_evidence AS live
WHERE live.action <> 'typed_child_correction'
	OR EXISTS (
		SELECT 1
		FROM children AS child
		JOIN legacy_snapshot_source_rows AS source
			ON source.id = live.source_row_id
			AND source.legacy_version_id = live.source_version_id
		WHERE child.id = live.target_id
			AND child.origin = 'legacy'
			AND child.source_child_key IS NOT NULL
			AND child.source_child_key = source.source_child_key
	);

CREATE VIEW legacy_reconciliation_strict_typed_resolutions AS
SELECT live.*
FROM legacy_reconciliation_strict_live_typed_evidence AS live
JOIN legacy_reconciliation_assertions AS assertion
	ON assertion.decision_id = live.decision_id
	AND assertion.case_id = live.case_id
	AND assertion.case_version = live.case_version
	AND assertion.assertion_kind = 'typed_evidence_verified'
	AND assertion.assertion_passed = 1;

DROP TRIGGER legacy_reconciliation_assertions_typed_evidence_guard;

CREATE TRIGGER legacy_reconciliation_assertions_typed_evidence_guard
BEFORE INSERT ON legacy_reconciliation_assertions
WHEN NEW.assertion_kind = 'typed_evidence_verified'
	AND NOT EXISTS (
		SELECT 1 FROM legacy_reconciliation_strict_live_typed_evidence AS valid
		WHERE valid.decision_id = NEW.decision_id
			AND valid.case_id = NEW.case_id
			AND valid.case_version = NEW.case_version
	)
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation typed evidence invalid');
END;

-- A duplicate cannot be consolidated after a financial change for the peer
-- was already applied.  The operator must first reconcile that applied
-- assignment explicitly instead of hiding it behind the duplicate decision.
CREATE TRIGGER legacy_reconciliation_duplicate_applied_price_guard
BEFORE INSERT ON legacy_reconciliation_assertions
WHEN NEW.assertion_kind = 'typed_evidence_verified'
	AND EXISTS (
		SELECT 1
		FROM legacy_reconciliation_strict_live_typed_evidence AS valid
		JOIN price_review_items AS item
			ON item.legacy_enrollment_id = valid.peer_enrollment_id
			AND item.status = 'applied'
		WHERE valid.decision_id = NEW.decision_id
			AND valid.case_id = NEW.case_id
			AND valid.case_version = NEW.case_version
			AND valid.action = 'same_service_duplicate'
	)
BEGIN
	SELECT RAISE(ABORT, 'duplicate peer has applied price review');
END;

-- Once exact duplicate evidence becomes valid, every mutable review for the
-- peer is superseded in the same D1 transaction and the administrative side
-- effect is recorded without copying any client data into the audit log.
CREATE TRIGGER legacy_reconciliation_duplicate_price_review_supersede
AFTER INSERT ON legacy_reconciliation_assertions
WHEN NEW.assertion_kind = 'typed_evidence_verified'
BEGIN
	INSERT OR IGNORE INTO audit_events
		(id, actor_user_id, actor_kind, action, target_kind, target_id,
		 request_id, safe_diff_json, ip_retention_value, created_at)
	SELECT 'reconciliation-price-review:' || NEW.decision_id || ':' || item.id,
		decision.actor_user_id, decision.actor_kind,
		'price_review.item.superseded_by_legacy_duplicate',
		'price_review_item', item.id, decision.id,
		'{"reason":"same_service_duplicate","status":"superseded"}', NULL,
		NEW.created_at
	FROM legacy_reconciliation_strict_typed_resolutions AS valid
	JOIN legacy_reconciliation_decisions AS decision ON decision.id = valid.decision_id
	JOIN price_review_items AS item ON item.legacy_enrollment_id = valid.peer_enrollment_id
	WHERE valid.decision_id = NEW.decision_id
		AND valid.case_id = NEW.case_id
		AND valid.case_version = NEW.case_version
		AND valid.action = 'same_service_duplicate'
		AND item.status IN ('draft', 'manual_contact_required', 'notification_approved',
			'sent', 'accepted_by_parent', 'response_overdue', 'approved_by_admin', 'scheduled');

	UPDATE price_review_items
	SET status = 'superseded', superseded_by_item_id = NULL, updated_at = NEW.created_at
	WHERE id IN (
		SELECT item.id
		FROM legacy_reconciliation_strict_typed_resolutions AS valid
		JOIN price_review_items AS item ON item.legacy_enrollment_id = valid.peer_enrollment_id
		WHERE valid.decision_id = NEW.decision_id
			AND valid.case_id = NEW.case_id
			AND valid.case_version = NEW.case_version
			AND valid.action = 'same_service_duplicate'
			AND item.status IN ('draft', 'manual_contact_required', 'notification_approved',
				'sent', 'accepted_by_parent', 'response_overdue', 'approved_by_admin', 'scheduled')
	);
END;

-- Replace the 0021 gate with a completion-aware exact-candidate fence.
DROP TRIGGER legacy_version_promotion_events_reconciliation_gate;

CREATE TRIGGER legacy_version_promotion_events_reconciliation_gate
BEFORE INSERT ON legacy_version_promotion_events
WHEN NEW.action = 'promote'
	AND NEW.source_kind IN ('access', 'plusbtext')
	AND (
	NOT EXISTS (
		SELECT 1 FROM legacy_reconciliation_materializations AS materialization
		WHERE materialization.source_kind = NEW.source_kind
			AND materialization.academic_period_id = NEW.academic_period_id
			AND materialization.import_run_id = NEW.import_run_id
			AND materialization.version_id = NEW.version_id
	)
	OR EXISTS (
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
				SELECT 1 FROM legacy_reconciliation_strict_typed_resolutions AS valid
				WHERE valid.case_id = occurrence.case_id
					AND valid.source_import_run_id = occurrence.import_run_id
					AND valid.source_version_id = occurrence.version_id
			)
	)
)
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation release gate blocked');
END;

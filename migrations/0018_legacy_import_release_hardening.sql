PRAGMA foreign_keys = ON;

ALTER TABLE legacy_import_release_plans ADD COLUMN planned_by TEXT;
ALTER TABLE legacy_import_release_plans ADD COLUMN staged_by TEXT;
ALTER TABLE legacy_import_release_plans ADD COLUMN verification_contract_json TEXT NOT NULL DEFAULT '{}'
	CHECK (json_valid(verification_contract_json) AND json_type(verification_contract_json) = 'object');

ALTER TABLE legacy_import_bundle_events ADD COLUMN actor_operator_id TEXT;

CREATE TABLE legacy_import_stage_cleanup_events (
	id TEXT PRIMARY KEY NOT NULL,
	import_run_id TEXT NOT NULL REFERENCES import_runs(id),
	source_kind TEXT NOT NULL CHECK (source_kind IN ('plusbtext', 'access')),
	operator_id TEXT NOT NULL,
	action TEXT NOT NULL CHECK (action = 'discard_failed_staging'),
	created_at TEXT NOT NULL,
	UNIQUE (import_run_id, action)
);

CREATE TRIGGER legacy_import_stage_cleanup_events_reject_update
BEFORE UPDATE ON legacy_import_stage_cleanup_events
BEGIN
	SELECT RAISE(ABORT, 'legacy import stage cleanup events are append-only');
END;

CREATE TRIGGER legacy_import_stage_cleanup_events_validate
BEFORE INSERT ON legacy_import_stage_cleanup_events
BEGIN
	SELECT RAISE(ABORT, 'legacy import stage cleanup event is invalid')
	WHERE length(NEW.operator_id) NOT BETWEEN 3 AND 64
		OR NOT EXISTS (
			SELECT 1 FROM import_runs AS run
			WHERE run.id = NEW.import_run_id
				AND run.source_kind = NEW.source_kind
				AND run.status = 'failed'
		);
END;

CREATE TRIGGER legacy_import_stage_cleanup_events_reject_delete
BEFORE DELETE ON legacy_import_stage_cleanup_events
BEGIN
	SELECT RAISE(ABORT, 'legacy import stage cleanup events are append-only');
END;

CREATE TRIGGER legacy_import_release_plans_hardened_insert
BEFORE INSERT ON legacy_import_release_plans
BEGIN
	SELECT RAISE(ABORT, 'legacy import release operator separation is invalid')
	WHERE NEW.planned_by IS NULL OR NEW.staged_by IS NULL
		OR length(NEW.planned_by) NOT BETWEEN 3 AND 64
		OR length(NEW.staged_by) NOT BETWEEN 3 AND 64
		OR NEW.planned_by = NEW.staged_by;

	SELECT RAISE(ABORT, 'legacy import release verification contract is invalid')
	WHERE json_type(NEW.verification_contract_json, '$.plusBText.rowsTotal') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.plusBText.rowsStaged') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.plusBText.rowsSkipped') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.plusBText.oldGroups') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.plusBText.targets') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.rowsTotal') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.rowsStaged') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.rowsSkipped') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.sourceRows') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.families') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.emails') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.children') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.enrollments') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.projectedFamilies') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.projectedEmails') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.projectedChildren') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.projectedEnrollments') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.issues.info') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.issues.warning') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.issues.error') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.issues.fatal') IS NOT 'integer'
		OR json_extract(NEW.verification_contract_json, '$.plusBText.rowsTotal') <= 0
		OR json_extract(NEW.verification_contract_json, '$.plusBText.rowsStaged') <= 0
		OR json_extract(NEW.verification_contract_json, '$.plusBText.rowsSkipped') < 0
		OR json_extract(NEW.verification_contract_json, '$.plusBText.oldGroups') < 0
		OR json_extract(NEW.verification_contract_json, '$.plusBText.targets') < 0
		OR json_extract(NEW.verification_contract_json, '$.access.rowsTotal') <= 0
		OR json_extract(NEW.verification_contract_json, '$.access.rowsStaged') <= 0
		OR json_extract(NEW.verification_contract_json, '$.access.rowsSkipped') < 0
		OR json_extract(NEW.verification_contract_json, '$.access.sourceRows') <= 0
		OR json_extract(NEW.verification_contract_json, '$.access.families') < 0
		OR json_extract(NEW.verification_contract_json, '$.access.emails') < 0
		OR json_extract(NEW.verification_contract_json, '$.access.children') < 0
		OR json_extract(NEW.verification_contract_json, '$.access.enrollments') < 0
		OR json_extract(NEW.verification_contract_json, '$.access.projectedFamilies') < 0
		OR json_extract(NEW.verification_contract_json, '$.access.projectedEmails') < 0
		OR json_extract(NEW.verification_contract_json, '$.access.projectedChildren') < 0
		OR json_extract(NEW.verification_contract_json, '$.access.projectedEnrollments') < 0
		OR json_extract(NEW.verification_contract_json, '$.issues.info') < 0
		OR json_extract(NEW.verification_contract_json, '$.issues.warning') < 0
		OR json_extract(NEW.verification_contract_json, '$.issues.error') < 0
		OR json_extract(NEW.verification_contract_json, '$.issues.fatal') < 0
		OR json_extract(NEW.verification_contract_json, '$.plusBText.oldGroups')
			+ json_extract(NEW.verification_contract_json, '$.plusBText.targets')
			<> json_extract(NEW.verification_contract_json, '$.plusBText.rowsStaged')
		OR json_extract(NEW.verification_contract_json, '$.access.sourceRows')
			<> json_extract(NEW.verification_contract_json, '$.access.rowsStaged');
END;

CREATE TRIGGER legacy_import_release_plans_hardened_identity
BEFORE UPDATE OF planned_by, staged_by, verification_contract_json
ON legacy_import_release_plans
BEGIN
	SELECT RAISE(ABORT, 'legacy import release hardened identity is immutable');
END;

CREATE TRIGGER legacy_import_release_plans_reject_delete
BEFORE DELETE ON legacy_import_release_plans
BEGIN
	SELECT RAISE(ABORT, 'legacy import release plans are append-only');
END;

-- Plans written while 0016 was current have no trustworthy operator separation
-- or verification contract. Keep them immutable for evidence, but never allow a
-- grandfathered plan to cross another lifecycle boundary; the operator must
-- create and review a new hardened plan.
CREATE TRIGGER legacy_import_release_plans_reject_grandfathered_transition
BEFORE UPDATE OF status ON legacy_import_release_plans
WHEN NEW.status IS NOT OLD.status
BEGIN
	SELECT RAISE(ABORT, 'legacy import release plan predates hardening')
	WHERE OLD.planned_by IS NULL OR OLD.staged_by IS NULL
		OR OLD.verification_contract_json = '{}';
END;

CREATE TRIGGER legacy_import_release_plans_independent_review
BEFORE UPDATE OF status, reviewed_by ON legacy_import_release_plans
WHEN OLD.status = 'staged' AND NEW.status = 'reviewed'
BEGIN
	SELECT RAISE(ABORT, 'legacy import release reviewer must be independent')
	WHERE OLD.planned_by IS NULL OR OLD.staged_by IS NULL
		OR NEW.reviewed_by IS NULL
		OR NEW.reviewed_by = OLD.planned_by
		OR NEW.reviewed_by = OLD.staged_by;
END;

CREATE TRIGGER legacy_import_release_plans_verify_contract
BEFORE UPDATE OF status ON legacy_import_release_plans
WHEN NEW.status IN ('reviewed', 'promoted')
BEGIN
	SELECT RAISE(ABORT, 'legacy import release run counts do not match the protected plan')
	WHERE NEW.planned_by IS NULL OR NEW.staged_by IS NULL
		OR json_type(NEW.verification_contract_json, '$.plusBText.rowsTotal') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.plusBText.rowsStaged') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.plusBText.rowsSkipped') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.plusBText.oldGroups') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.plusBText.targets') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.rowsTotal') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.rowsStaged') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.rowsSkipped') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.sourceRows') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.families') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.emails') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.children') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.enrollments') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.projectedFamilies') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.projectedEmails') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.projectedChildren') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.access.projectedEnrollments') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.issues.info') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.issues.warning') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.issues.error') IS NOT 'integer'
		OR json_type(NEW.verification_contract_json, '$.issues.fatal') IS NOT 'integer'
		OR (SELECT rows_total FROM import_runs WHERE id = NEW.plusbtext_run_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.plusBText.rowsTotal')
		OR (SELECT rows_staged FROM import_runs WHERE id = NEW.plusbtext_run_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.plusBText.rowsStaged')
		OR (SELECT rows_skipped FROM import_runs WHERE id = NEW.plusbtext_run_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.plusBText.rowsSkipped')
		OR (SELECT rows_total FROM import_runs WHERE id = NEW.access_run_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.rowsTotal')
		OR (SELECT rows_staged FROM import_runs WHERE id = NEW.access_run_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.rowsStaged')
		OR (SELECT rows_skipped FROM import_runs WHERE id = NEW.access_run_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.rowsSkipped')
		OR (SELECT COUNT(*) FROM plusbtext_old_groups WHERE plusbtext_version_id = NEW.plusbtext_version_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.plusBText.oldGroups')
		OR (SELECT COUNT(*) FROM plusbtext_targets WHERE plusbtext_version_id = NEW.plusbtext_version_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.plusBText.targets')
		OR (SELECT COUNT(*) FROM legacy_snapshot_source_rows WHERE legacy_version_id = NEW.access_version_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.sourceRows')
		OR (SELECT COUNT(*) FROM legacy_snapshot_families WHERE legacy_version_id = NEW.access_version_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.families')
		OR (SELECT COUNT(*) FROM legacy_snapshot_emails WHERE legacy_version_id = NEW.access_version_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.emails')
		OR (SELECT COUNT(*) FROM legacy_snapshot_children WHERE legacy_version_id = NEW.access_version_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.children')
		OR (SELECT COUNT(*) FROM legacy_snapshot_enrollments WHERE legacy_version_id = NEW.access_version_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.enrollments')
		OR (SELECT COUNT(*) FROM import_issues WHERE import_run_id IN
				(NEW.plusbtext_run_id, NEW.access_run_id) AND severity = 'info')
			IS NOT json_extract(NEW.verification_contract_json, '$.issues.info')
		OR (SELECT COUNT(*) FROM import_issues WHERE import_run_id IN
				(NEW.plusbtext_run_id, NEW.access_run_id) AND severity = 'warning')
			IS NOT json_extract(NEW.verification_contract_json, '$.issues.warning')
		OR (SELECT COUNT(*) FROM import_issues WHERE import_run_id IN
				(NEW.plusbtext_run_id, NEW.access_run_id) AND severity = 'error')
			IS NOT json_extract(NEW.verification_contract_json, '$.issues.error')
		OR (SELECT COUNT(*) FROM import_issues WHERE import_run_id IN
				(NEW.plusbtext_run_id, NEW.access_run_id) AND severity = 'fatal')
			IS NOT json_extract(NEW.verification_contract_json, '$.issues.fatal')
		OR json_extract(NEW.verification_contract_json, '$.issues.error') IS NOT 0
		OR json_extract(NEW.verification_contract_json, '$.issues.fatal') IS NOT 0;

	SELECT RAISE(ABORT, 'legacy import release promoted row counts are invalid')
	WHERE NEW.status = 'promoted' AND (
		(SELECT rows_promoted FROM import_runs WHERE id = NEW.plusbtext_run_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.plusBText.rowsStaged')
				- json_extract(NEW.verification_contract_json, '$.plusBText.rowsSkipped')
		OR (SELECT rows_promoted FROM import_runs WHERE id = NEW.access_run_id)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.rowsStaged')
				- json_extract(NEW.verification_contract_json, '$.access.rowsSkipped')
		OR (SELECT COUNT(*) FROM legacy_source_rows
			WHERE last_seen_run_id = NEW.access_run_id AND is_current = 1)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.sourceRows')
		OR (SELECT COUNT(*) FROM legacy_family_periods
			WHERE last_seen_run_id = NEW.access_run_id AND is_current = 1)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.projectedFamilies')
		OR (SELECT COUNT(*) FROM legacy_family_emails
			WHERE last_seen_run_id = NEW.access_run_id AND is_current = 1)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.projectedEmails')
		OR (SELECT COUNT(*) FROM children
			WHERE last_seen_run_id = NEW.access_run_id AND is_current = 1)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.projectedChildren')
		OR (SELECT COUNT(*) FROM legacy_enrollments
			WHERE last_seen_run_id = NEW.access_run_id AND is_current = 1)
			IS NOT json_extract(NEW.verification_contract_json, '$.access.projectedEnrollments')
	);
END;

CREATE TRIGGER legacy_import_bundle_events_operator_separation
BEFORE INSERT ON legacy_import_bundle_events
BEGIN
	SELECT RAISE(ABORT, 'legacy import transition operator is invalid')
	WHERE NEW.actor_operator_id IS NULL OR length(NEW.actor_operator_id) NOT BETWEEN 3 AND 64;

	SELECT RAISE(ABORT, 'legacy import promoter must differ from reviewer')
	WHERE EXISTS (
		SELECT 1 FROM legacy_import_release_plans AS plan
		WHERE plan.id = NEW.plan_id AND plan.reviewed_by = NEW.actor_operator_id
	);
END;

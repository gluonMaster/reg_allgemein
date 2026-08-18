PRAGMA foreign_keys = ON;

CREATE TABLE legacy_reconciliation_cases (
	id TEXT PRIMARY KEY NOT NULL,
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	source_kind TEXT NOT NULL CHECK (source_kind IN ('access', 'plusbtext')),
	source_identity_digest TEXT NOT NULL
		CHECK (length(source_identity_digest) = 64 AND source_identity_digest NOT GLOB '*[^0-9a-f]*'),
	issue_code TEXT NOT NULL,
	issue_class TEXT NOT NULL CHECK (issue_class IN (
		'course_mapping', 'family_identity', 'invalid_email', 'invalid_birth_date',
		'price', 'duration', 'duplicate_service', 'source_consistency'
	)),
	entity_type TEXT NOT NULL CHECK (entity_type IN (
		'source_record', 'legacy_family', 'legacy_child', 'legacy_enrollment'
	)),
	entity_id TEXT,
	first_import_run_id TEXT NOT NULL REFERENCES import_runs(id),
	last_seen_import_run_id TEXT NOT NULL REFERENCES import_runs(id),
	last_seen_version_id TEXT NOT NULL,
	state TEXT NOT NULL CHECK (state IN (
		'open', 'assigned', 'awaiting_upstream', 'ready_to_verify', 'resolved', 'superseded'
	)),
	blocks_release INTEGER NOT NULL DEFAULT 1 CHECK (blocks_release IN (0, 1)),
	resolution_kind TEXT CHECK (resolution_kind IN (
		'resolved_by_reimport', 'same_service_duplicate', 'distinct_service_proven',
		'exact_catalog_mapping', 'verified_portal_family_link', 'typed_child_correction',
		'typed_family_correction', 'source_identity_changed'
	)),
	resolved_import_run_id TEXT REFERENCES import_runs(id),
	superseded_by_case_id TEXT REFERENCES legacy_reconciliation_cases(id),
	assigned_to TEXT REFERENCES users(id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	resolved_at TEXT,
	version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
	CHECK (
		(state = 'resolved' AND resolution_kind IS NOT NULL AND resolved_at IS NOT NULL)
		OR
		(state = 'superseded' AND resolution_kind = 'source_identity_changed'
			AND resolved_at IS NULL AND resolved_import_run_id IS NULL)
		OR
		(state NOT IN ('resolved', 'superseded') AND resolution_kind IS NULL AND resolved_at IS NULL
			AND resolved_import_run_id IS NULL)
	),
	CHECK (state = 'assigned' OR assigned_to IS NULL),
	CHECK (state <> 'superseded' OR resolution_kind = 'source_identity_changed')
);

CREATE UNIQUE INDEX legacy_reconciliation_cases_active_identity
	ON legacy_reconciliation_cases
		(academic_period_id, source_kind, source_identity_digest, issue_code)
	WHERE state NOT IN ('resolved', 'superseded');

CREATE INDEX legacy_reconciliation_cases_queue
	ON legacy_reconciliation_cases
		(academic_period_id, source_kind, issue_class, state, blocks_release, updated_at);

CREATE INDEX legacy_reconciliation_cases_assignee
	ON legacy_reconciliation_cases (assigned_to, state, updated_at);

CREATE TABLE legacy_reconciliation_occurrences (
	id TEXT PRIMARY KEY NOT NULL,
	case_id TEXT NOT NULL REFERENCES legacy_reconciliation_cases(id),
	import_issue_id TEXT NOT NULL UNIQUE REFERENCES import_issues(id),
	import_run_id TEXT NOT NULL REFERENCES import_runs(id),
	version_id TEXT NOT NULL,
	evidence_digest_sha256 TEXT NOT NULL
		CHECK (length(evidence_digest_sha256) = 64
			AND evidence_digest_sha256 NOT GLOB '*[^0-9a-f]*'),
	created_at TEXT NOT NULL,
	UNIQUE (case_id, import_run_id)
);

CREATE INDEX legacy_reconciliation_occurrences_case
	ON legacy_reconciliation_occurrences (case_id, created_at);

CREATE TABLE legacy_reconciliation_decisions (
	id TEXT PRIMARY KEY NOT NULL,
	case_id TEXT NOT NULL REFERENCES legacy_reconciliation_cases(id),
	case_version_before INTEGER NOT NULL CHECK (case_version_before >= 0),
	case_version_after INTEGER NOT NULL CHECK (case_version_after = case_version_before + 1),
	action TEXT NOT NULL CHECK (action IN (
		'materialized', 'seen_again', 'assign', 'unassign', 'await_upstream',
		'mark_ready_to_verify', 'verification_failed_reimport', 'resolved_by_reimport',
		'same_service_duplicate', 'distinct_service_proven', 'exact_catalog_mapping',
		'verified_portal_family_link', 'typed_child_correction',
		'typed_family_correction', 'supersede_source_identity'
	)),
	reason_code TEXT NOT NULL,
	actor_kind TEXT NOT NULL CHECK (actor_kind IN ('admin', 'system')),
	actor_user_id TEXT REFERENCES users(id),
	idempotency_record_id TEXT NOT NULL UNIQUE REFERENCES idempotency_records(id),
	request_hash_sha256 TEXT NOT NULL
		CHECK (length(request_hash_sha256) = 64 AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	target_type TEXT CHECK (target_type IN (
		'course_group', 'legacy_family', 'legacy_child', 'legacy_enrollment',
		'import_run', 'user', 'family_reassignment'
	)),
	target_id TEXT,
	prior_import_run_id TEXT REFERENCES import_runs(id),
	prior_version_id TEXT,
	current_import_run_id TEXT REFERENCES import_runs(id),
	current_version_id TEXT,
	evidence_digest_sha256 TEXT NOT NULL
		CHECK (length(evidence_digest_sha256) = 64
			AND evidence_digest_sha256 NOT GLOB '*[^0-9a-f]*'),
	safe_metadata_json TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(safe_metadata_json) AND json_type(safe_metadata_json) = 'object'),
	created_at TEXT NOT NULL,
	CHECK ((actor_kind = 'admin' AND actor_user_id IS NOT NULL)
		OR (actor_kind = 'system' AND actor_user_id IS NULL)),
	CHECK ((target_type IS NULL AND target_id IS NULL)
		OR (target_type IS NOT NULL AND target_id IS NOT NULL))
);

CREATE INDEX legacy_reconciliation_decisions_case
	ON legacy_reconciliation_decisions (case_id, created_at);

CREATE UNIQUE INDEX legacy_reconciliation_decisions_one_transition_per_version
	ON legacy_reconciliation_decisions (case_id, case_version_before);

CREATE TABLE legacy_reconciliation_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	decision_id TEXT NOT NULL UNIQUE REFERENCES legacy_reconciliation_decisions(id),
	case_id TEXT NOT NULL REFERENCES legacy_reconciliation_cases(id),
	case_version INTEGER NOT NULL CHECK (case_version > 0),
	assertion_kind TEXT NOT NULL CHECK (assertion_kind IN (
		'materialized', 'state_transition', 'reimport_verified', 'typed_evidence_verified'
	)),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TRIGGER legacy_reconciliation_cases_reject_delete
BEFORE DELETE ON legacy_reconciliation_cases
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation cases are retained');
END;

CREATE TRIGGER legacy_reconciliation_cases_identity_immutable
BEFORE UPDATE ON legacy_reconciliation_cases
WHEN NEW.id <> OLD.id
	OR NEW.academic_period_id <> OLD.academic_period_id
	OR NEW.source_kind <> OLD.source_kind
	OR NEW.source_identity_digest <> OLD.source_identity_digest
	OR NEW.issue_code <> OLD.issue_code
	OR NEW.issue_class <> OLD.issue_class
	OR NEW.entity_type <> OLD.entity_type
	OR COALESCE(NEW.entity_id, '') <> COALESCE(OLD.entity_id, '')
	OR NEW.first_import_run_id <> OLD.first_import_run_id
	OR NEW.created_at <> OLD.created_at
	OR NEW.blocks_release <> OLD.blocks_release
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation case identity is immutable');
END;

CREATE TRIGGER legacy_reconciliation_cases_terminal_immutable
BEFORE UPDATE ON legacy_reconciliation_cases
WHEN OLD.state IN ('resolved', 'superseded')
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation terminal case is immutable');
END;

CREATE TRIGGER legacy_reconciliation_cases_version_guard
BEFORE UPDATE ON legacy_reconciliation_cases
WHEN NEW.version <> OLD.version + 1
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation stale version');
END;

CREATE TRIGGER legacy_reconciliation_cases_state_transition_guard
BEFORE UPDATE OF state ON legacy_reconciliation_cases
WHEN NOT (
	(NEW.state = OLD.state)
	OR (OLD.state = 'open' AND NEW.state IN ('assigned', 'awaiting_upstream', 'ready_to_verify', 'resolved', 'superseded'))
	OR (OLD.state = 'assigned' AND NEW.state IN ('open', 'awaiting_upstream', 'ready_to_verify', 'resolved', 'superseded'))
	OR (OLD.state = 'awaiting_upstream' AND NEW.state IN ('open', 'assigned', 'ready_to_verify', 'superseded'))
	OR (OLD.state = 'ready_to_verify' AND NEW.state IN ('open', 'resolved', 'superseded'))
)
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation invalid state transition');
END;

CREATE TRIGGER legacy_reconciliation_cases_admin_actor_guard
BEFORE UPDATE ON legacy_reconciliation_cases
WHEN NOT EXISTS (
	SELECT 1
	FROM legacy_reconciliation_decisions AS decision
	JOIN users AS actor ON actor.id = decision.actor_user_id
	WHERE decision.case_id = OLD.id
		AND decision.case_version_before = OLD.version
		AND decision.case_version_after = NEW.version
		AND decision.actor_kind = 'admin'
		AND actor.role = 'admin' AND actor.is_blocked = 0 AND actor.account_status = 'active'
)
AND NOT EXISTS (
	SELECT 1 FROM legacy_reconciliation_decisions AS decision
	WHERE decision.case_id = OLD.id
		AND decision.case_version_before = OLD.version
		AND decision.case_version_after = NEW.version
		AND decision.actor_kind = 'system'
)
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation actor decision missing');
END;

CREATE TRIGGER legacy_reconciliation_decisions_reject_update
BEFORE UPDATE ON legacy_reconciliation_decisions
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation decisions are append-only');
END;

CREATE TRIGGER legacy_reconciliation_decisions_reject_delete
BEFORE DELETE ON legacy_reconciliation_decisions
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation decisions are append-only');
END;

CREATE TRIGGER legacy_reconciliation_decisions_admin_actor_guard
BEFORE INSERT ON legacy_reconciliation_decisions
WHEN NEW.actor_kind = 'admin' AND NOT EXISTS (
	SELECT 1 FROM users
	WHERE id = NEW.actor_user_id AND role = 'admin'
		AND is_blocked = 0 AND account_status = 'active'
)
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation active admin required');
END;

CREATE TRIGGER legacy_reconciliation_assertions_reject_update
BEFORE UPDATE ON legacy_reconciliation_assertions
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation assertions are append-only');
END;

CREATE TRIGGER legacy_reconciliation_assertions_case_version_guard
BEFORE INSERT ON legacy_reconciliation_assertions
WHEN NOT EXISTS (
	SELECT 1
	FROM legacy_reconciliation_cases AS reconciliation_case
	JOIN legacy_reconciliation_decisions AS decision
		ON decision.id = NEW.decision_id AND decision.case_id = NEW.case_id
	WHERE reconciliation_case.id = NEW.case_id
		AND reconciliation_case.version = NEW.case_version
		AND decision.case_version_after = NEW.case_version
)
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation terminal assertion failed');
END;

CREATE TRIGGER legacy_reconciliation_assertions_reject_delete
BEFORE DELETE ON legacy_reconciliation_assertions
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation assertions are append-only');
END;

CREATE TRIGGER legacy_reconciliation_occurrences_reject_update
BEFORE UPDATE ON legacy_reconciliation_occurrences
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation occurrences are append-only');
END;

CREATE TRIGGER legacy_reconciliation_occurrences_reject_delete
BEFORE DELETE ON legacy_reconciliation_occurrences
BEGIN
	SELECT RAISE(ABORT, 'legacy reconciliation occurrences are append-only');
END;

CREATE TRIGGER import_issues_reject_actionable_generic_closure
BEFORE UPDATE OF status ON import_issues
WHEN OLD.status = 'open' AND NEW.status IN ('resolved', 'dismissed')
	AND EXISTS (
		SELECT 1 FROM legacy_reconciliation_occurrences AS occurrence
		WHERE occurrence.import_issue_id = OLD.id
	)
BEGIN
	SELECT RAISE(ABORT, 'actionable import issue requires typed reconciliation');
END;

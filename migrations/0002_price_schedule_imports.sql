PRAGMA foreign_keys = ON;

CREATE TABLE import_runs (
	id TEXT PRIMARY KEY NOT NULL,
	source_kind TEXT NOT NULL CHECK (source_kind IN ('access', 'plusbtext', 'price', 'schedule')),
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	source_label TEXT NOT NULL,
	source_hash_sha256 TEXT NOT NULL
		CHECK (length(source_hash_sha256) = 64 AND source_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	source_contract_id TEXT NOT NULL,
	source_contract_version INTEGER NOT NULL CHECK (source_contract_version > 0),
	structural_fingerprint_sha256 TEXT NOT NULL
		CHECK (
			length(structural_fingerprint_sha256) = 64
			AND structural_fingerprint_sha256 NOT GLOB '*[^0-9a-f]*'
		),
	dependency_hashes_json TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(dependency_hashes_json) AND json_type(dependency_hashes_json) = 'object'),
	dependency_set_hash_sha256 TEXT NOT NULL
		CHECK (
			length(dependency_set_hash_sha256) = 64
			AND dependency_set_hash_sha256 NOT GLOB '*[^0-9a-f]*'
		),
	run_fingerprint TEXT NOT NULL
		CHECK (length(run_fingerprint) = 64 AND run_fingerprint NOT GLOB '*[^0-9a-f]*'),
	attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
	retry_of_run_id TEXT REFERENCES import_runs(id),
	status TEXT NOT NULL CHECK (status IN ('staged', 'validated', 'promoted', 'failed')),
	started_at TEXT NOT NULL,
	validated_at TEXT,
	promoted_at TEXT,
	finished_at TEXT,
	rows_total INTEGER NOT NULL DEFAULT 0 CHECK (rows_total >= 0),
	rows_staged INTEGER NOT NULL DEFAULT 0 CHECK (rows_staged >= 0),
	rows_promoted INTEGER NOT NULL DEFAULT 0 CHECK (rows_promoted >= 0),
	rows_skipped INTEGER NOT NULL DEFAULT 0 CHECK (rows_skipped >= 0),
	safe_summary_json TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(safe_summary_json) AND json_type(safe_summary_json) = 'object'),
	error_code TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (run_fingerprint, attempt_no)
);

CREATE INDEX import_runs_period_kind_started
	ON import_runs (academic_period_id, source_kind, started_at DESC);

CREATE UNIQUE INDEX import_runs_one_promoted_fingerprint
	ON import_runs (run_fingerprint)
	WHERE status = 'promoted';

CREATE TRIGGER import_runs_immutable_fingerprint
BEFORE UPDATE OF source_kind, academic_period_id, source_label, source_hash_sha256,
	source_contract_id, source_contract_version, structural_fingerprint_sha256,
	dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint, attempt_no,
	retry_of_run_id ON import_runs
BEGIN
	SELECT RAISE(ABORT, 'import run fingerprint is immutable');
END;

CREATE TABLE import_issues (
	id TEXT PRIMARY KEY NOT NULL,
	import_run_id TEXT NOT NULL REFERENCES import_runs(id),
	severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'fatal')),
	code TEXT NOT NULL,
	source_record_key TEXT,
	safe_context_json TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(safe_context_json) AND json_type(safe_context_json) = 'object'),
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
	created_at TEXT NOT NULL,
	resolved_at TEXT,
	resolved_by TEXT
);

CREATE INDEX import_issues_run_severity
	ON import_issues (import_run_id, severity, code);

CREATE TABLE schedule_versions (
	id TEXT PRIMARY KEY NOT NULL,
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	import_run_id TEXT NOT NULL UNIQUE REFERENCES import_runs(id),
	schema_version INTEGER NOT NULL CHECK (schema_version > 0),
	generation_id TEXT NOT NULL,
	generated_at TEXT NOT NULL,
	version_hash_sha256 TEXT NOT NULL
		CHECK (length(version_hash_sha256) = 64 AND version_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
	published_at TEXT,
	retired_at TEXT,
	promotion_owner TEXT,
	promotion_fencing_token INTEGER CHECK (promotion_fencing_token IS NULL OR promotion_fencing_token > 0),
	created_at TEXT NOT NULL,
	CHECK (
		(is_published = 0)
		OR (published_at IS NOT NULL AND promotion_owner IS NOT NULL AND promotion_fencing_token IS NOT NULL)
	)
);

CREATE UNIQUE INDEX schedule_versions_one_published_period
	ON schedule_versions (academic_period_id)
	WHERE is_published = 1;

CREATE TRIGGER schedule_versions_reject_direct_published_insert
BEFORE INSERT ON schedule_versions
WHEN NEW.is_published = 1
BEGIN
	SELECT RAISE(ABORT, 'schedule version must be promoted after validation');
END;

CREATE TRIGGER schedule_versions_immutable_snapshot
BEFORE UPDATE OF academic_period_id, import_run_id, schema_version, generation_id,
	generated_at, version_hash_sha256 ON schedule_versions
BEGIN
	SELECT RAISE(ABORT, 'schedule version snapshot is immutable');
END;

CREATE TRIGGER schedule_versions_require_promotion_fence
BEFORE UPDATE OF is_published ON schedule_versions
WHEN NEW.is_published = 1 AND OLD.is_published = 0
BEGIN
	SELECT RAISE(ABORT, 'invalid schedule promotion fence')
	WHERE NOT EXISTS (
		SELECT 1
		FROM operation_locks AS lock
		JOIN import_runs AS run ON run.id = NEW.import_run_id
		WHERE lock.scope = 'import-promotion'
			AND lock.resource_key = 'schedule:' || NEW.academic_period_id
			AND lock.lease_owner = NEW.promotion_owner
			AND lock.fencing_token = NEW.promotion_fencing_token
			AND lock.lease_until > NEW.published_at
			AND run.status IN ('validated', 'promoted')
			AND run.source_kind = 'schedule'
			AND run.academic_period_id = NEW.academic_period_id
	);
END;

CREATE TABLE course_groups (
	id TEXT PRIMARY KEY NOT NULL,
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	source_offering_key TEXT NOT NULL,
	display_name TEXT NOT NULL,
	normalized_price_key TEXT,
	lesson_kind TEXT NOT NULL
		CHECK (lesson_kind IN ('group', 'dance_group', 'nachhilfe', 'individual', 'needs_review')),
	subject TEXT NOT NULL,
	capacity_default INTEGER CHECK (capacity_default IS NULL OR capacity_default > 0),
	capacity_override INTEGER CHECK (capacity_override IS NULL OR capacity_override > 0),
	requires_admin_approval INTEGER NOT NULL DEFAULT 0
		CHECK (requires_admin_approval IN (0, 1)),
	catalog_status TEXT NOT NULL
		CHECK (catalog_status IN ('draft', 'published', 'hidden', 'needs_review', 'retired')),
	last_seen_schedule_version_id TEXT REFERENCES schedule_versions(id),
	retired_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (academic_period_id, source_offering_key)
);

CREATE INDEX course_groups_catalog
	ON course_groups (academic_period_id, catalog_status);

CREATE TABLE course_sessions (
	id TEXT PRIMARY KEY NOT NULL,
	course_group_id TEXT NOT NULL REFERENCES course_groups(id),
	schedule_version_id TEXT NOT NULL REFERENCES schedule_versions(id),
	source_namespace TEXT NOT NULL,
	source_block_id TEXT NOT NULL,
	source_block_hash_sha256 TEXT NOT NULL
		CHECK (
			length(source_block_hash_sha256) = 64
			AND source_block_hash_sha256 NOT GLOB '*[^0-9a-f]*'
		),
	display_name_snapshot TEXT NOT NULL,
	lesson_kind_snapshot TEXT NOT NULL
		CHECK (
			lesson_kind_snapshot IN ('group', 'dance_group', 'nachhilfe', 'individual', 'needs_review')
		),
	subject_snapshot TEXT NOT NULL,
	day_code TEXT NOT NULL CHECK (day_code IN ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')),
	start_time TEXT NOT NULL,
	end_time TEXT NOT NULL,
	duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
	timezone TEXT NOT NULL CHECK (timezone = 'Europe/Berlin'),
	teacher_name TEXT NOT NULL,
	building TEXT NOT NULL,
	room TEXT NOT NULL,
	location_display TEXT NOT NULL,
	is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
	retired_at TEXT,
	created_at TEXT NOT NULL,
	UNIQUE (schedule_version_id, source_block_id)
);

CREATE INDEX course_sessions_current_group
	ON course_sessions (course_group_id, is_current);

CREATE TRIGGER course_sessions_immutable_snapshot
BEFORE UPDATE OF course_group_id, schedule_version_id, source_namespace,
	source_block_id, source_block_hash_sha256, display_name_snapshot,
	lesson_kind_snapshot, subject_snapshot, day_code, start_time, end_time,
	duration_minutes, timezone, teacher_name, building, room, location_display
	ON course_sessions
BEGIN
	SELECT RAISE(ABORT, 'course session snapshot is immutable');
END;

CREATE TABLE price_versions (
	id TEXT PRIMARY KEY NOT NULL,
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	import_run_id TEXT NOT NULL UNIQUE REFERENCES import_runs(id),
	label TEXT NOT NULL,
	valid_from TEXT NOT NULL,
	version_hash_sha256 TEXT NOT NULL
		CHECK (length(version_hash_sha256) = 64 AND version_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	source_headers_json TEXT NOT NULL
		CHECK (json_valid(source_headers_json) AND json_type(source_headers_json) = 'object'),
	is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
	activated_at TEXT,
	retired_at TEXT,
	promotion_owner TEXT,
	promotion_fencing_token INTEGER CHECK (promotion_fencing_token IS NULL OR promotion_fencing_token > 0),
	created_at TEXT NOT NULL,
	CHECK (
		(is_active = 0)
		OR (activated_at IS NOT NULL AND promotion_owner IS NOT NULL AND promotion_fencing_token IS NOT NULL)
	)
);

CREATE UNIQUE INDEX price_versions_one_active_period
	ON price_versions (academic_period_id)
	WHERE is_active = 1;

CREATE TRIGGER price_versions_reject_direct_active_insert
BEFORE INSERT ON price_versions
WHEN NEW.is_active = 1
BEGIN
	SELECT RAISE(ABORT, 'price version must be promoted after validation');
END;

CREATE TRIGGER price_versions_immutable_snapshot
BEFORE UPDATE OF academic_period_id, import_run_id, label, valid_from,
	version_hash_sha256, source_headers_json ON price_versions
BEGIN
	SELECT RAISE(ABORT, 'price version snapshot is immutable');
END;

CREATE TRIGGER price_versions_require_promotion_fence
BEFORE UPDATE OF is_active ON price_versions
WHEN NEW.is_active = 1 AND OLD.is_active = 0
BEGIN
	SELECT RAISE(ABORT, 'invalid price promotion fence')
	WHERE NOT EXISTS (
		SELECT 1
		FROM operation_locks AS lock
		JOIN import_runs AS run ON run.id = NEW.import_run_id
		WHERE lock.scope = 'import-promotion'
			AND lock.resource_key = 'price:' || NEW.academic_period_id
			AND lock.lease_owner = NEW.promotion_owner
			AND lock.fencing_token = NEW.promotion_fencing_token
			AND lock.lease_until > NEW.activated_at
			AND run.status IN ('validated', 'promoted')
			AND run.source_kind = 'price'
			AND run.academic_period_id = NEW.academic_period_id
	);
END;

CREATE TABLE price_rules (
	id TEXT PRIMARY KEY NOT NULL,
	price_version_id TEXT NOT NULL REFERENCES price_versions(id),
	source_record_key TEXT NOT NULL,
	source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
	key TEXT,
	normalized_key TEXT,
	duration_raw TEXT,
	subjects_raw TEXT,
	subject_duration_vector_json TEXT
		CHECK (
			subject_duration_vector_json IS NULL
			OR (json_valid(subject_duration_vector_json) AND json_type(subject_duration_vector_json) = 'array')
		),
	duration_total_minutes INTEGER CHECK (duration_total_minutes IS NULL OR duration_total_minutes > 0),
	children_count INTEGER CHECK (children_count IS NULL OR children_count > 0),
	yearly_price_cents INTEGER CHECK (yearly_price_cents IS NULL OR yearly_price_cents > 0),
	monthly_price_cents INTEGER CHECK (monthly_price_cents IS NULL OR monthly_price_cents > 0),
	normalized_lookup_key TEXT,
	rule_hash_sha256 TEXT NOT NULL
		CHECK (length(rule_hash_sha256) = 64 AND rule_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	provenance_json TEXT NOT NULL
		CHECK (json_valid(provenance_json) AND json_type(provenance_json) = 'object'),
	is_valid INTEGER NOT NULL CHECK (is_valid IN (0, 1)),
	validation_code TEXT,
	created_at TEXT NOT NULL,
	UNIQUE (price_version_id, source_row_number),
	CHECK (
		is_valid = 0
		OR (
			key IS NOT NULL AND normalized_key IS NOT NULL
			AND subject_duration_vector_json IS NOT NULL
			AND duration_total_minutes IS NOT NULL
			AND children_count IS NOT NULL
			AND yearly_price_cents IS NOT NULL
			AND monthly_price_cents IS NOT NULL
			AND normalized_lookup_key IS NOT NULL
		)
	)
);

CREATE UNIQUE INDEX price_rules_unique_valid_lookup
	ON price_rules (price_version_id, normalized_lookup_key)
	WHERE is_valid = 1;

CREATE TRIGGER price_rules_reject_update
BEFORE UPDATE ON price_rules
BEGIN
	SELECT RAISE(ABORT, 'price rules are immutable');
END;

CREATE TRIGGER price_rules_reject_delete
BEFORE DELETE ON price_rules
BEGIN
	SELECT RAISE(ABORT, 'price rules are immutable');
END;

CREATE TABLE version_promotion_events (
	id TEXT PRIMARY KEY NOT NULL,
	source_kind TEXT NOT NULL CHECK (source_kind IN ('price', 'schedule')),
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	version_id TEXT NOT NULL,
	previous_version_id TEXT,
	import_run_id TEXT REFERENCES import_runs(id),
	action TEXT NOT NULL CHECK (action IN ('promote', 'rollback')),
	fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
	created_at TEXT NOT NULL
);

CREATE INDEX version_promotion_events_period_kind
	ON version_promotion_events (academic_period_id, source_kind, created_at DESC);

CREATE TRIGGER version_promotion_events_reject_update
BEFORE UPDATE ON version_promotion_events
BEGIN
	SELECT RAISE(ABORT, 'version promotion events are append-only');
END;

CREATE TRIGGER version_promotion_events_reject_delete
BEFORE DELETE ON version_promotion_events
BEGIN
	SELECT RAISE(ABORT, 'version promotion events are append-only');
END;

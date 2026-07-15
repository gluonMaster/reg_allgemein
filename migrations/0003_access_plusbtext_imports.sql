PRAGMA foreign_keys = ON;

CREATE TABLE plusbtext_versions (
	id TEXT PRIMARY KEY NOT NULL,
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	import_run_id TEXT NOT NULL UNIQUE REFERENCES import_runs(id),
	version_hash_sha256 TEXT NOT NULL
		CHECK (length(version_hash_sha256) = 64 AND version_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	fingerprint_algorithm_version INTEGER NOT NULL CHECK (fingerprint_algorithm_version > 0),
	logical_shape_fingerprint_sha256 TEXT NOT NULL
		CHECK (
			length(logical_shape_fingerprint_sha256) = 64
			AND logical_shape_fingerprint_sha256 NOT GLOB '*[^0-9a-f]*'
		),
	style_fingerprint_sha256 TEXT NOT NULL
		CHECK (
			length(style_fingerprint_sha256) = 64
			AND style_fingerprint_sha256 NOT GLOB '*[^0-9a-f]*'
		),
	is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
	published_at TEXT,
	retired_at TEXT,
	promotion_owner TEXT,
	promotion_fencing_token INTEGER CHECK (promotion_fencing_token IS NULL OR promotion_fencing_token > 0),
	created_at TEXT NOT NULL,
	CHECK (
		is_published = 0
		OR (published_at IS NOT NULL AND promotion_owner IS NOT NULL AND promotion_fencing_token IS NOT NULL)
	)
);

CREATE UNIQUE INDEX plusbtext_versions_one_published_period
	ON plusbtext_versions (academic_period_id)
	WHERE is_published = 1;

CREATE TRIGGER plusbtext_versions_immutable_snapshot
BEFORE UPDATE OF academic_period_id, import_run_id, version_hash_sha256,
	fingerprint_algorithm_version, logical_shape_fingerprint_sha256,
	style_fingerprint_sha256 ON plusbtext_versions
BEGIN
	SELECT RAISE(ABORT, 'PlusBText version snapshot is immutable');
END;

CREATE TRIGGER plusbtext_versions_require_promotion_fence
BEFORE UPDATE OF is_published ON plusbtext_versions
WHEN NEW.is_published = 1 AND OLD.is_published = 0
BEGIN
	SELECT RAISE(ABORT, 'invalid PlusBText promotion fence')
	WHERE NOT EXISTS (
		SELECT 1
		FROM operation_locks AS lock
		JOIN import_runs AS run ON run.id = NEW.import_run_id
		WHERE lock.scope = 'import-promotion'
			AND lock.resource_key = 'plusbtext:' || NEW.academic_period_id
			AND lock.lease_owner = NEW.promotion_owner
			AND lock.fencing_token = NEW.promotion_fencing_token
			AND lock.lease_until > NEW.published_at
			AND run.status IN ('validated', 'promoted')
			AND run.source_kind = 'plusbtext'
			AND run.academic_period_id = NEW.academic_period_id
	);
END;

CREATE TABLE plusbtext_old_groups (
	id TEXT PRIMARY KEY NOT NULL,
	plusbtext_version_id TEXT NOT NULL REFERENCES plusbtext_versions(id),
	storage_key TEXT NOT NULL,
	source_row_number INTEGER NOT NULL CHECK (source_row_number > 1),
	old_group_id INTEGER,
	group_name_raw TEXT,
	group_name_normalized TEXT,
	record_hash_sha256 TEXT NOT NULL
		CHECK (length(record_hash_sha256) = 64 AND record_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	is_valid INTEGER NOT NULL CHECK (is_valid IN (0, 1)),
	created_at TEXT NOT NULL,
	UNIQUE (plusbtext_version_id, storage_key)
);

CREATE INDEX plusbtext_old_groups_lookup
	ON plusbtext_old_groups (plusbtext_version_id, group_name_normalized, is_valid);

CREATE TABLE plusbtext_targets (
	id TEXT PRIMARY KEY NOT NULL,
	plusbtext_version_id TEXT NOT NULL REFERENCES plusbtext_versions(id),
	storage_key TEXT NOT NULL,
	source_row_number INTEGER NOT NULL CHECK (source_row_number > 1),
	old_group_ids_json TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(old_group_ids_json) AND json_type(old_group_ids_json) = 'array'),
	group_name_raw TEXT NOT NULL,
	group_name_normalized TEXT NOT NULL,
	teacher_name TEXT,
	day_raw TEXT,
	duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
	duration_status TEXT NOT NULL CHECK (duration_status IN ('verified', 'missing', 'invalid')),
	record_hash_sha256 TEXT NOT NULL
		CHECK (length(record_hash_sha256) = 64 AND record_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	is_valid INTEGER NOT NULL CHECK (is_valid IN (0, 1)),
	created_at TEXT NOT NULL,
	UNIQUE (plusbtext_version_id, storage_key)
);

CREATE INDEX plusbtext_targets_name_lookup
	ON plusbtext_targets (plusbtext_version_id, group_name_normalized, is_valid);

CREATE TABLE legacy_versions (
	id TEXT PRIMARY KEY NOT NULL,
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	import_run_id TEXT NOT NULL UNIQUE REFERENCES import_runs(id),
	plusbtext_version_id TEXT NOT NULL REFERENCES plusbtext_versions(id),
	version_hash_sha256 TEXT NOT NULL
		CHECK (length(version_hash_sha256) = 64 AND version_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
	published_at TEXT,
	retired_at TEXT,
	promotion_owner TEXT,
	promotion_fencing_token INTEGER CHECK (promotion_fencing_token IS NULL OR promotion_fencing_token > 0),
	created_at TEXT NOT NULL,
	CHECK (
		is_published = 0
		OR (published_at IS NOT NULL AND promotion_owner IS NOT NULL AND promotion_fencing_token IS NOT NULL)
	)
);

CREATE UNIQUE INDEX legacy_versions_one_published_period
	ON legacy_versions (academic_period_id)
	WHERE is_published = 1;

CREATE TRIGGER legacy_versions_immutable_snapshot
BEFORE UPDATE OF academic_period_id, import_run_id, plusbtext_version_id,
	version_hash_sha256 ON legacy_versions
BEGIN
	SELECT RAISE(ABORT, 'legacy version snapshot is immutable');
END;

CREATE TRIGGER legacy_versions_require_promotion_fence
BEFORE UPDATE OF is_published ON legacy_versions
WHEN NEW.is_published = 1 AND OLD.is_published = 0
BEGIN
	SELECT RAISE(ABORT, 'invalid legacy promotion fence')
	WHERE NOT EXISTS (
		SELECT 1
		FROM operation_locks AS lock
		JOIN import_runs AS run ON run.id = NEW.import_run_id
		WHERE lock.scope = 'import-promotion'
			AND lock.resource_key = 'access:' || NEW.academic_period_id
			AND lock.lease_owner = NEW.promotion_owner
			AND lock.fencing_token = NEW.promotion_fencing_token
			AND lock.lease_until > NEW.published_at
			AND run.status IN ('validated', 'promoted')
			AND run.source_kind = 'access'
			AND run.academic_period_id = NEW.academic_period_id
	);
END;

CREATE TABLE legacy_snapshot_families (
	id TEXT PRIMARY KEY NOT NULL,
	legacy_version_id TEXT NOT NULL REFERENCES legacy_versions(id),
	stable_family_key TEXT NOT NULL,
	legacy_family_id TEXT NOT NULL,
	source_family_id TEXT NOT NULL,
	family_number_id TEXT,
	legacy_sequence_number INTEGER CHECK (legacy_sequence_number IS NULL OR legacy_sequence_number > 0),
	numbering_status TEXT NOT NULL CHECK (numbering_status IN ('valid', 'collision', 'missing', 'unapproved')),
	parent_name_raw TEXT,
	parent_first_name_normalized TEXT,
	parent_last_name_normalized TEXT,
	parent_name_match_status TEXT NOT NULL CHECK (parent_name_match_status IN ('eligible', 'ambiguous', 'unavailable')),
	parent_name_normalizer_version INTEGER NOT NULL CHECK (parent_name_normalizer_version > 0),
	continuity_needs_review INTEGER NOT NULL DEFAULT 0 CHECK (continuity_needs_review IN (0, 1)),
	address_raw TEXT,
	phone_raw TEXT,
	mobile_raw TEXT,
	record_hash_sha256 TEXT NOT NULL
		CHECK (length(record_hash_sha256) = 64 AND record_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	created_at TEXT NOT NULL,
	UNIQUE (legacy_version_id, stable_family_key)
);

CREATE TABLE legacy_snapshot_emails (
	id TEXT PRIMARY KEY NOT NULL,
	legacy_version_id TEXT NOT NULL REFERENCES legacy_versions(id),
	legacy_email_id TEXT NOT NULL,
	stable_family_key TEXT NOT NULL,
	email_raw TEXT NOT NULL,
	email_normalized TEXT,
	source_access_id INTEGER NOT NULL CHECK (source_access_id > 0),
	record_hash_sha256 TEXT NOT NULL
		CHECK (length(record_hash_sha256) = 64 AND record_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	created_at TEXT NOT NULL,
	UNIQUE (legacy_version_id, legacy_email_id)
);

CREATE TABLE legacy_snapshot_children (
	id TEXT PRIMARY KEY NOT NULL,
	legacy_version_id TEXT NOT NULL REFERENCES legacy_versions(id),
	stable_family_key TEXT NOT NULL,
	legacy_child_id TEXT NOT NULL,
	source_child_key TEXT NOT NULL,
	source_full_name TEXT NOT NULL,
	source_full_name_normalized TEXT NOT NULL,
	source_birth_date TEXT NOT NULL,
	continuity_needs_review INTEGER NOT NULL DEFAULT 0 CHECK (continuity_needs_review IN (0, 1)),
	record_hash_sha256 TEXT NOT NULL
		CHECK (length(record_hash_sha256) = 64 AND record_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	created_at TEXT NOT NULL,
	UNIQUE (legacy_version_id, source_child_key)
);

CREATE TABLE legacy_snapshot_source_rows (
	id TEXT PRIMARY KEY NOT NULL,
	legacy_version_id TEXT NOT NULL REFERENCES legacy_versions(id),
	legacy_source_row_id TEXT NOT NULL,
	source_namespace TEXT NOT NULL,
	source_access_id INTEGER NOT NULL CHECK (source_access_id > 0),
	source_record_key TEXT NOT NULL,
	stable_family_key TEXT,
	source_child_key TEXT,
	value48_mirror TEXT,
	source_hash_sha256 TEXT NOT NULL
		CHECK (length(source_hash_sha256) = 64 AND source_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	source_values_json TEXT NOT NULL
		CHECK (json_valid(source_values_json) AND json_type(source_values_json) = 'object'),
	created_at TEXT NOT NULL,
	UNIQUE (legacy_version_id, source_access_id)
);

CREATE TABLE legacy_snapshot_enrollments (
	id TEXT PRIMARY KEY NOT NULL,
	legacy_version_id TEXT NOT NULL REFERENCES legacy_versions(id),
	legacy_enrollment_id TEXT NOT NULL,
	source_access_id INTEGER NOT NULL CHECK (source_access_id > 0),
	stable_family_key TEXT NOT NULL,
	source_child_key TEXT NOT NULL,
	source_slot TEXT NOT NULL CHECK (source_slot IN ('main_next', 'package_1', 'package_2', 'package_3', 'package_4', 'package_5')),
	source_record_key TEXT NOT NULL,
	group_name_raw TEXT NOT NULL,
	group_name_normalized TEXT NOT NULL,
	teacher_name TEXT,
	day_raw TEXT,
	duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
	status_code_raw TEXT,
	lesson_kind TEXT CHECK (lesson_kind IN ('group', 'dance_group', 'nachhilfe', 'individual', 'needs_review')),
	contract_kind TEXT CHECK (contract_kind IN ('yearly', 'monthly', 'nachhilfe', 'individual')),
	price_source TEXT CHECK (price_source IN ('yearly', 'monthly')),
	price_mode TEXT CHECK (price_mode IN ('rule_derived', 'manual_override')),
	planned_price_cents INTEGER CHECK (planned_price_cents IS NULL OR planned_price_cents > 0),
	notes_raw TEXT,
	needs_admin_review INTEGER NOT NULL CHECK (needs_admin_review IN (0, 1)),
	record_hash_sha256 TEXT NOT NULL
		CHECK (length(record_hash_sha256) = 64 AND record_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	created_at TEXT NOT NULL,
	UNIQUE (legacy_version_id, source_record_key)
);

CREATE TABLE family_number_allocations (
	id TEXT PRIMARY KEY NOT NULL,
	namespace TEXT NOT NULL CHECK (namespace IN ('legacy_1', 'portal_2')),
	sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
	display_family_id TEXT NOT NULL,
	legacy_family_id TEXT,
	owner_user_id TEXT,
	origin TEXT NOT NULL CHECK (origin IN ('legacy', 'portal')),
	status TEXT NOT NULL CHECK (status IN ('pending', 'assigned', 'collision', 'merged_alias', 'retired')),
	assigned_at TEXT,
	merged_into_family_number_id TEXT REFERENCES family_number_allocations(id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (namespace, sequence_number),
	UNIQUE (display_family_id)
);

CREATE UNIQUE INDEX family_number_allocations_current_owner
	ON family_number_allocations (owner_user_id)
	WHERE owner_user_id IS NOT NULL AND status = 'assigned';

CREATE TABLE legacy_families (
	id TEXT PRIMARY KEY NOT NULL,
	source_namespace TEXT NOT NULL,
	source_family_id TEXT NOT NULL,
	family_number_id TEXT,
	numbering_status TEXT NOT NULL CHECK (numbering_status IN ('valid', 'collision', 'missing', 'unapproved')),
	claimed_by_user_id TEXT,
	claimed_at TEXT,
	continuity_status TEXT NOT NULL DEFAULT 'stable' CHECK (continuity_status IN ('stable', 'needs_review', 'corrected')),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (source_namespace, source_family_id)
);

CREATE UNIQUE INDEX legacy_families_current_claim_owner
	ON legacy_families (claimed_by_user_id)
	WHERE claimed_by_user_id IS NOT NULL;

CREATE TABLE legacy_family_periods (
	id TEXT PRIMARY KEY NOT NULL,
	legacy_family_id TEXT NOT NULL REFERENCES legacy_families(id),
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	import_run_id TEXT NOT NULL REFERENCES import_runs(id),
	parent_name_raw TEXT,
	parent_first_name_normalized TEXT,
	parent_last_name_normalized TEXT,
	parent_name_match_status TEXT NOT NULL CHECK (parent_name_match_status IN ('eligible', 'ambiguous', 'unavailable')),
	parent_name_normalizer_version INTEGER NOT NULL CHECK (parent_name_normalizer_version > 0),
	address_raw TEXT,
	phone_raw TEXT,
	mobile_raw TEXT,
	last_seen_run_id TEXT NOT NULL REFERENCES import_runs(id),
	is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
	retired_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (legacy_family_id, academic_period_id)
);

CREATE TABLE legacy_family_emails (
	id TEXT PRIMARY KEY NOT NULL,
	legacy_family_id TEXT NOT NULL REFERENCES legacy_families(id),
	legacy_family_period_id TEXT NOT NULL REFERENCES legacy_family_periods(id),
	email_raw TEXT NOT NULL,
	email_normalized TEXT,
	source_access_id INTEGER NOT NULL CHECK (source_access_id > 0),
	last_seen_run_id TEXT NOT NULL REFERENCES import_runs(id),
	is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (legacy_family_period_id, email_raw)
);

CREATE INDEX legacy_family_emails_claim_lookup
	ON legacy_family_emails (email_normalized, is_current);

CREATE TABLE children (
	id TEXT PRIMARY KEY NOT NULL,
	owner_user_id TEXT,
	legacy_family_id TEXT REFERENCES legacy_families(id),
	family_number_id TEXT NOT NULL REFERENCES family_number_allocations(id),
	origin TEXT NOT NULL CHECK (origin IN ('portal', 'legacy')),
	source_child_key TEXT NOT NULL,
	source_full_name TEXT NOT NULL,
	source_full_name_normalized TEXT NOT NULL,
	source_birth_date TEXT NOT NULL,
	full_name_override TEXT,
	birth_date_override TEXT,
	full_name TEXT NOT NULL,
	full_name_normalized TEXT NOT NULL,
	birth_date TEXT NOT NULL,
	last_seen_run_id TEXT NOT NULL REFERENCES import_runs(id),
	is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (legacy_family_id, source_child_key)
);

CREATE INDEX children_owner_current ON children (owner_user_id, is_current);

CREATE TABLE legacy_source_rows (
	id TEXT PRIMARY KEY NOT NULL,
	source_namespace TEXT NOT NULL,
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	source_access_id INTEGER NOT NULL CHECK (source_access_id > 0),
	value48_mirror TEXT,
	legacy_family_id TEXT REFERENCES legacy_families(id),
	child_id TEXT REFERENCES children(id),
	import_run_id TEXT NOT NULL REFERENCES import_runs(id),
	source_hash TEXT NOT NULL
		CHECK (length(source_hash) = 64 AND source_hash NOT GLOB '*[^0-9a-f]*'),
	source_values_json TEXT NOT NULL
		CHECK (json_valid(source_values_json) AND json_type(source_values_json) = 'object'),
	last_seen_run_id TEXT NOT NULL REFERENCES import_runs(id),
	is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
	retired_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (source_namespace, academic_period_id, source_access_id)
);

CREATE INDEX legacy_source_rows_current_period
	ON legacy_source_rows (academic_period_id, is_current);

CREATE TABLE legacy_enrollments (
	id TEXT PRIMARY KEY NOT NULL,
	legacy_source_row_id TEXT NOT NULL REFERENCES legacy_source_rows(id),
	legacy_family_id TEXT NOT NULL REFERENCES legacy_families(id),
	child_id TEXT NOT NULL REFERENCES children(id),
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	source_slot TEXT NOT NULL CHECK (source_slot IN ('main_next', 'package_1', 'package_2', 'package_3', 'package_4', 'package_5')),
	source_record_key TEXT NOT NULL UNIQUE,
	group_name_raw TEXT NOT NULL,
	group_name_normalized TEXT NOT NULL,
	course_group_id TEXT REFERENCES course_groups(id),
	teacher_name TEXT,
	day_raw TEXT,
	duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
	status_code_raw TEXT,
	lesson_kind TEXT CHECK (lesson_kind IN ('group', 'dance_group', 'nachhilfe', 'individual', 'needs_review')),
	contract_kind TEXT CHECK (contract_kind IN ('yearly', 'monthly', 'nachhilfe', 'individual')),
	price_source TEXT CHECK (price_source IN ('yearly', 'monthly')),
	price_mode TEXT CHECK (price_mode IN ('rule_derived', 'manual_override')),
	planned_price_cents INTEGER CHECK (planned_price_cents IS NULL OR planned_price_cents > 0),
	notes_raw TEXT,
	needs_admin_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_admin_review IN (0, 1)),
	is_active_for_occupancy INTEGER NOT NULL DEFAULT 0 CHECK (is_active_for_occupancy IN (0, 1)),
	represented_by_enrollment_id TEXT,
	last_seen_run_id TEXT NOT NULL REFERENCES import_runs(id),
	is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
	retired_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX legacy_enrollments_current_period
	ON legacy_enrollments (academic_period_id, is_current);

CREATE TABLE legacy_version_promotion_events (
	id TEXT PRIMARY KEY NOT NULL,
	source_kind TEXT NOT NULL CHECK (source_kind IN ('access', 'plusbtext')),
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	version_id TEXT NOT NULL,
	previous_version_id TEXT,
	import_run_id TEXT REFERENCES import_runs(id),
	action TEXT NOT NULL CHECK (action IN ('promote', 'rollback')),
	fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
	created_at TEXT NOT NULL
);

CREATE INDEX legacy_version_promotion_events_period_kind
	ON legacy_version_promotion_events (academic_period_id, source_kind, created_at DESC);

CREATE TRIGGER legacy_version_promotion_events_reject_update
BEFORE UPDATE ON legacy_version_promotion_events
BEGIN
	SELECT RAISE(ABORT, 'legacy version promotion events are append-only');
END;

CREATE TRIGGER legacy_version_promotion_events_reject_delete
BEFORE DELETE ON legacy_version_promotion_events
BEGIN
	SELECT RAISE(ABORT, 'legacy version promotion events are append-only');
END;

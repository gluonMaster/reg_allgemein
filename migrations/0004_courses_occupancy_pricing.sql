PRAGMA foreign_keys = ON;

-- Stage 03 deliberately kept the imported duration nullable. Stage 04 needs the
-- source status as well so that a blank PlusBText!T can never be confused with
-- a present but invalid value.
ALTER TABLE legacy_snapshot_enrollments
	ADD COLUMN duration_status TEXT NOT NULL DEFAULT 'unknown'
		CHECK (duration_status IN ('verified', 'missing', 'invalid', 'ambiguous', 'unresolved', 'unknown'));

ALTER TABLE legacy_enrollments
	ADD COLUMN duration_status TEXT NOT NULL DEFAULT 'unknown'
		CHECK (duration_status IN ('verified', 'missing', 'invalid', 'ambiguous', 'unresolved', 'unknown'));

CREATE TABLE course_source_mappings (
	id TEXT PRIMARY KEY NOT NULL,
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	source_kind TEXT NOT NULL CHECK (source_kind IN ('access', 'plusbtext', 'schedule')),
	source_value_normalized TEXT NOT NULL,
	course_group_id TEXT NOT NULL REFERENCES course_groups(id),
	status TEXT NOT NULL CHECK (status IN ('confirmed', 'suggested', 'rejected')),
	reason TEXT NOT NULL,
	created_by TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (academic_period_id, source_kind, source_value_normalized, course_group_id)
);

CREATE UNIQUE INDEX course_source_mappings_one_confirmed_destination
	ON course_source_mappings (academic_period_id, source_kind, source_value_normalized)
	WHERE status = 'confirmed';

CREATE INDEX course_source_mappings_course
	ON course_source_mappings (course_group_id, source_kind, status);

CREATE TABLE course_pricing_profiles (
	id TEXT PRIMARY KEY NOT NULL,
	course_group_id TEXT NOT NULL UNIQUE REFERENCES course_groups(id),
	contract_kind TEXT NOT NULL CHECK (contract_kind IN ('group_yearly', 'group_monthly')),
	price_key TEXT NOT NULL,
	normalized_price_key TEXT NOT NULL,
	subjects_json TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(subjects_json) AND json_type(subjects_json) = 'array'),
	duration_source TEXT NOT NULL
		CHECK (duration_source IN ('plusbtext', 'schedule', 'admin_confirmed')),
	admin_duration_minutes INTEGER
		CHECK (admin_duration_minutes IS NULL OR admin_duration_minutes > 0),
	status TEXT NOT NULL CHECK (status IN ('confirmed', 'needs_review')),
	version INTEGER NOT NULL CHECK (version > 0),
	reason TEXT NOT NULL,
	confirmed_by TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (
		(duration_source = 'admin_confirmed' AND admin_duration_minutes IS NOT NULL)
		OR (duration_source != 'admin_confirmed' AND admin_duration_minutes IS NULL)
	)
);

CREATE TABLE enrollments (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL,
	child_id TEXT NOT NULL REFERENCES children(id),
	course_group_id TEXT NOT NULL REFERENCES course_groups(id),
	legacy_enrollment_id TEXT REFERENCES legacy_enrollments(id),
	lesson_kind TEXT NOT NULL CHECK (lesson_kind IN ('group', 'dance_group')),
	status TEXT NOT NULL
		CHECK (status IN ('draft', 'contract_offered', 'active', 'cancelled', 'ended')),
	contract_kind TEXT NOT NULL CHECK (contract_kind IN ('group_yearly', 'group_monthly')),
	active_from TEXT NOT NULL,
	active_until TEXT,
	current_price_cents INTEGER CHECK (current_price_cents IS NULL OR current_price_cents >= 0),
	price_source TEXT CHECK (price_source IN ('excel_yearly', 'excel_monthly', 'fallback_90')),
	price_mode TEXT CHECK (price_mode IN ('rule_derived', 'manual_override')),
	price_effective_from TEXT,
	manual_override_reason TEXT,
	manual_override_by TEXT,
	manual_override_at TEXT,
	source TEXT NOT NULL CHECK (source IN ('legacy', 'portal', 'admin')),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (active_until IS NULL OR active_from < active_until),
	CHECK (
		price_mode != 'manual_override'
		OR (
			current_price_cents IS NOT NULL
			AND manual_override_reason IS NOT NULL
			AND manual_override_by IS NOT NULL
			AND manual_override_at IS NOT NULL
		)
	)
);

CREATE INDEX enrollments_occupancy
	ON enrollments (course_group_id, status, active_from, active_until, child_id);

CREATE INDEX enrollments_legacy_representation
	ON enrollments (legacy_enrollment_id, status);

CREATE TABLE price_manual_overrides (
	id TEXT PRIMARY KEY NOT NULL,
	enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
	base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
	override_price_cents INTEGER NOT NULL CHECK (override_price_cents >= 0),
	price_version_id TEXT NOT NULL REFERENCES price_versions(id),
	price_rule_id TEXT REFERENCES price_rules(id),
	price_source TEXT NOT NULL CHECK (price_source IN ('excel_yearly', 'excel_monthly')),
	contract_kind TEXT NOT NULL CHECK (contract_kind IN ('group_yearly', 'group_monthly')),
	reason TEXT NOT NULL,
	actor_user_id TEXT NOT NULL,
	responsibility_confirmed INTEGER NOT NULL CHECK (responsibility_confirmed = 1),
	request_hash_sha256 TEXT NOT NULL
		CHECK (length(request_hash_sha256) = 64 AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	idempotency_key TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL
);

CREATE INDEX price_manual_overrides_enrollment_created
	ON price_manual_overrides (enrollment_id, created_at DESC);

CREATE TRIGGER price_manual_overrides_reject_update
BEFORE UPDATE ON price_manual_overrides
BEGIN
	SELECT RAISE(ABORT, 'manual price override evidence is append-only');
END;

CREATE TRIGGER price_manual_overrides_reject_delete
BEFORE DELETE ON price_manual_overrides
BEGIN
	SELECT RAISE(ABORT, 'manual price override evidence is append-only');
END;

CREATE TABLE price_quotes (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT,
	child_id TEXT REFERENCES children(id),
	course_group_id TEXT NOT NULL REFERENCES course_groups(id),
	planned_start_on TEXT NOT NULL,
	lesson_kind TEXT NOT NULL
		CHECK (lesson_kind IN ('group', 'dance_group', 'nachhilfe', 'individual', 'group_nachhilfe', 'needs_review')),
	active_children_count_as_of INTEGER NOT NULL CHECK (active_children_count_as_of >= 0),
	lookup_children_count INTEGER CHECK (lookup_children_count IS NULL OR lookup_children_count BETWEEN 1 AND 6),
	price_version_id TEXT REFERENCES price_versions(id),
	price_rule_id TEXT REFERENCES price_rules(id),
	schedule_version_id TEXT REFERENCES schedule_versions(id),
	plusbtext_version_id TEXT REFERENCES plusbtext_versions(id),
	pricing_profile_version INTEGER CHECK (pricing_profile_version IS NULL OR pricing_profile_version > 0),
	price_source TEXT
		CHECK (price_source IN ('excel_yearly', 'excel_monthly', 'fallback_90', 'configured_individual_hourly', 'fixed_nachhilfe_hourly')),
	price_mode TEXT CHECK (price_mode IN ('rule_derived', 'manual_override')),
	contract_kind TEXT CHECK (contract_kind IN ('group_yearly', 'group_monthly')),
	duration_source TEXT
		CHECK (duration_source IN ('plusbtext', 'schedule', 'admin_confirmed', 'price_rule', 'fallback_90', 'not_applicable')),
	duration_status TEXT NOT NULL
		CHECK (duration_status IN ('verified', 'missing', 'invalid', 'ambiguous', 'unresolved', 'not_applicable')),
	duration_minutes_used INTEGER CHECK (duration_minutes_used IS NULL OR duration_minutes_used > 0),
	billing_period_code TEXT CHECK (billing_period_code IN ('calendar_month', 'per_45_minutes')),
	estimated_missing_duration INTEGER NOT NULL DEFAULT 0
		CHECK (estimated_missing_duration IN (0, 1)),
	requires_admin_confirmation INTEGER NOT NULL DEFAULT 0
		CHECK (requires_admin_confirmation IN (0, 1)),
	parent_payable INTEGER NOT NULL DEFAULT 1 CHECK (parent_payable IN (0, 1)),
	base_price_cents INTEGER CHECK (base_price_cents IS NULL OR base_price_cents >= 0),
	manual_override_cents INTEGER CHECK (manual_override_cents IS NULL OR manual_override_cents >= 0),
	manual_override_reason TEXT,
	final_price_cents INTEGER CHECK (final_price_cents IS NULL OR final_price_cents >= 0),
	decision_code TEXT NOT NULL,
	decision_json TEXT NOT NULL
		CHECK (json_valid(decision_json) AND json_type(decision_json) = 'object'),
	confirmed_duration_minutes INTEGER
		CHECK (confirmed_duration_minutes IS NULL OR confirmed_duration_minutes > 0),
	confirmed_price_cents INTEGER CHECK (confirmed_price_cents IS NULL OR confirmed_price_cents >= 0),
	confirmed_by_admin_user_id TEXT,
	confirmed_at TEXT,
	confirmation_reason TEXT,
	confirmation_json TEXT
		CHECK (confirmation_json IS NULL OR (json_valid(confirmation_json) AND json_type(confirmation_json) = 'object')),
	confirmation_idempotency_key TEXT UNIQUE,
	status TEXT NOT NULL
		CHECK (status IN ('quoted', 'needs_admin_review', 'needs_admin_confirmation', 'confirmed', 'stale', 'superseded')),
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	CHECK (
		estimated_missing_duration = 0
		OR (
			decision_code = 'ESTIMATED_MISSING_DURATION'
			AND duration_source = 'fallback_90'
			AND duration_status = 'missing'
			AND requires_admin_confirmation = 1
			AND billing_period_code = 'calendar_month'
		)
	),
	CHECK (
		status != 'confirmed'
		OR (
			confirmed_duration_minutes IS NOT NULL
			AND confirmed_price_cents IS NOT NULL
			AND confirmed_by_admin_user_id IS NOT NULL
			AND confirmed_at IS NOT NULL
			AND confirmation_reason IS NOT NULL
			AND confirmation_json IS NOT NULL
		)
	)
);

CREATE INDEX price_quotes_course_created
	ON price_quotes (course_group_id, created_at DESC);

CREATE INDEX price_quotes_expiry_status
	ON price_quotes (expires_at, status);

CREATE TRIGGER price_quotes_immutable_decision
BEFORE UPDATE OF user_id, child_id, course_group_id, planned_start_on, lesson_kind,
	active_children_count_as_of, lookup_children_count, price_version_id,
	price_rule_id, schedule_version_id, plusbtext_version_id,
	pricing_profile_version, price_source, price_mode, contract_kind,
	duration_source, duration_status, duration_minutes_used, billing_period_code,
	estimated_missing_duration, requires_admin_confirmation, parent_payable,
	base_price_cents, manual_override_cents, manual_override_reason,
	final_price_cents, decision_code, decision_json, created_at, expires_at
	ON price_quotes
BEGIN
	SELECT RAISE(ABORT, 'price quote decision snapshot is immutable');
END;

CREATE UNIQUE INDEX admin_review_tasks_pricing_open
	ON admin_review_tasks (kind, source_kind, source_id, reason_code)
	WHERE status IN ('open', 'in_progress')
		AND kind IN ('course_mapping', 'course_classification', 'pricing_context');

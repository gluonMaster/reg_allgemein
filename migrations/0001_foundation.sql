PRAGMA foreign_keys = ON;

CREATE TABLE academic_periods (
	id TEXT PRIMARY KEY NOT NULL,
	code TEXT NOT NULL UNIQUE,
	display_name TEXT NOT NULL,
	starts_on TEXT NOT NULL,
	ends_on TEXT NOT NULL,
	is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
	created_at TEXT NOT NULL,
	CHECK (starts_on <= ends_on)
);

CREATE UNIQUE INDEX academic_periods_one_current
	ON academic_periods (is_current)
	WHERE is_current = 1;

CREATE TABLE audit_events (
	id TEXT PRIMARY KEY NOT NULL,
	actor_user_id TEXT,
	actor_kind TEXT NOT NULL,
	action TEXT NOT NULL,
	target_kind TEXT NOT NULL,
	target_id TEXT NOT NULL,
	request_id TEXT NOT NULL,
	safe_diff_json TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(safe_diff_json)),
	ip_retention_value TEXT,
	created_at TEXT NOT NULL
);

CREATE INDEX audit_events_target_created
	ON audit_events (target_kind, target_id, created_at);

CREATE INDEX audit_events_request
	ON audit_events (request_id);

CREATE TRIGGER audit_events_reject_update
BEFORE UPDATE ON audit_events
BEGIN
	SELECT RAISE(ABORT, 'audit_events are append-only');
END;

CREATE TRIGGER audit_events_reject_delete
BEFORE DELETE ON audit_events
BEGIN
	SELECT RAISE(ABORT, 'audit_events are append-only');
END;

CREATE TABLE admin_review_tasks (
	id TEXT PRIMARY KEY NOT NULL,
	kind TEXT NOT NULL,
	source_kind TEXT NOT NULL,
	source_id TEXT NOT NULL,
	reason_code TEXT NOT NULL,
	safe_summary TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'open'
		CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
	assigned_to TEXT,
	resolution TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	resolved_at TEXT
);

CREATE INDEX admin_review_tasks_queue
	ON admin_review_tasks (status, kind, created_at);

CREATE INDEX admin_review_tasks_source
	ON admin_review_tasks (source_kind, source_id);

CREATE TABLE idempotency_records (
	id TEXT PRIMARY KEY NOT NULL,
	scope TEXT NOT NULL,
	key_hash TEXT NOT NULL,
	request_hash TEXT NOT NULL,
	result_ref TEXT,
	status TEXT NOT NULL
		CHECK (status IN ('in_progress', 'completed', 'failed')),
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (scope, key_hash)
);

CREATE INDEX idempotency_records_expiry
	ON idempotency_records (expires_at);

CREATE TABLE rate_limit_buckets (
	id TEXT PRIMARY KEY NOT NULL,
	scope TEXT NOT NULL,
	subject_hash TEXT NOT NULL,
	window_start TEXT NOT NULL,
	count INTEGER NOT NULL CHECK (count >= 0),
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (scope, subject_hash, window_start)
);

CREATE INDEX rate_limit_buckets_expiry
	ON rate_limit_buckets (expires_at);

CREATE TABLE operation_locks (
	id TEXT PRIMARY KEY NOT NULL,
	scope TEXT NOT NULL,
	resource_key TEXT NOT NULL,
	lease_owner TEXT NOT NULL,
	lease_until TEXT NOT NULL,
	fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (scope, resource_key)
);

CREATE INDEX operation_locks_expiry
	ON operation_locks (lease_until);

PRAGMA foreign_keys = ON;

-- Stage 12 keeps closure state and retained evidence separate from the login
-- profile. Applied migrations are intentionally not rewritten.
ALTER TABLE children ADD COLUMN minimized_at TEXT;

CREATE TABLE privacy_requests (
	id TEXT PRIMARY KEY NOT NULL,
	public_reference TEXT NOT NULL UNIQUE,
	subject_user_id TEXT NOT NULL REFERENCES users(id),
	requested_by_user_id TEXT NOT NULL REFERENCES users(id),
	kind TEXT NOT NULL CHECK (kind IN ('export', 'delete', 'media_content_request')),
	status TEXT NOT NULL CHECK (status IN (
		'requested', 'reviewing', 'blocked_by_active_contract', 'approved',
		'processing', 'completed', 'completed_with_retained_evidence',
		'failed', 'cancelled'
	)),
	request_idempotency_key TEXT NOT NULL,
	request_hash_sha256 TEXT NOT NULL CHECK (
		length(request_hash_sha256) = 64
		AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'
	),
	retention_holds_json TEXT NOT NULL DEFAULT '[]' CHECK (
		json_valid(retention_holds_json) AND json_type(retention_holds_json) = 'array'
	),
	safe_summary_json TEXT NOT NULL DEFAULT '{}' CHECK (
		json_valid(safe_summary_json) AND json_type(safe_summary_json) = 'object'
	),
	decision_reason TEXT,
	artifact_r2_key TEXT UNIQUE,
	artifact_expires_at TEXT,
	reviewed_by TEXT REFERENCES users(id),
	reviewed_at TEXT,
	completed_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (requested_by_user_id, request_idempotency_key),
	CHECK ((artifact_r2_key IS NULL) = (artifact_expires_at IS NULL)),
	CHECK (kind = 'export' OR artifact_r2_key IS NULL)
);

CREATE INDEX privacy_requests_subject_created
	ON privacy_requests (subject_user_id, created_at DESC);

CREATE INDEX privacy_requests_admin_queue
	ON privacy_requests (kind, status, created_at);

CREATE TABLE privacy_export_artifacts (
	id TEXT PRIMARY KEY NOT NULL,
	privacy_request_id TEXT NOT NULL UNIQUE REFERENCES privacy_requests(id),
	subject_user_id TEXT NOT NULL REFERENCES users(id),
	private_r2_key TEXT NOT NULL UNIQUE,
	content_type TEXT NOT NULL CHECK (content_type = 'application/json; charset=utf-8'),
	size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
	sha256 TEXT NOT NULL CHECK (
		length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'
	),
	status TEXT NOT NULL CHECK (status IN ('ready', 'delete_pending', 'deleted')),
	generation_attempts INTEGER NOT NULL DEFAULT 1 CHECK (generation_attempts > 0),
	generated_at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	deleted_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK ((status = 'deleted' AND deleted_at IS NOT NULL)
		OR (status <> 'deleted' AND deleted_at IS NULL))
);

CREATE INDEX privacy_export_artifacts_expiry
	ON privacy_export_artifacts (status, expires_at);

CREATE TABLE retention_controls (
	id TEXT PRIMARY KEY NOT NULL,
	target_kind TEXT NOT NULL,
	target_id TEXT NOT NULL,
	retention_class TEXT NOT NULL,
	legal_basis TEXT NOT NULL,
	retention_started_on TEXT NOT NULL,
	retain_until TEXT,
	legal_hold INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0, 1)),
	hold_reason TEXT,
	hold_set_by TEXT REFERENCES users(id),
	hold_set_at TEXT,
	hold_review_on TEXT,
	purge_status TEXT NOT NULL CHECK (purge_status IN (
		'disabled_by_policy', 'held', 'scheduled', 'processing', 'completed', 'failed'
	)),
	policy_version TEXT NOT NULL,
	purged_or_anonymized_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (target_kind, target_id),
	CHECK ((legal_hold = 0 AND hold_reason IS NULL AND hold_set_by IS NULL
		AND hold_set_at IS NULL)
		OR (legal_hold = 1 AND hold_reason IS NOT NULL AND hold_set_by IS NOT NULL
			AND hold_set_at IS NOT NULL))
);

CREATE INDEX retention_controls_class_status
	ON retention_controls (retention_class, purge_status, legal_hold);

CREATE TABLE legal_archive_records (
	id TEXT PRIMARY KEY NOT NULL,
	privacy_request_id TEXT NOT NULL REFERENCES privacy_requests(id),
	owner_tombstone_user_id TEXT NOT NULL REFERENCES users(id),
	target_kind TEXT NOT NULL,
	target_id TEXT NOT NULL,
	retention_control_id TEXT NOT NULL UNIQUE REFERENCES retention_controls(id),
	retention_class TEXT NOT NULL,
	private_r2_key TEXT,
	archived_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	UNIQUE (target_kind, target_id)
);

CREATE INDEX legal_archive_owner_class
	ON legal_archive_records (owner_tombstone_user_id, retention_class, archived_at);

CREATE TABLE privacy_r2_cleanup_jobs (
	id TEXT PRIMARY KEY NOT NULL,
	privacy_request_id TEXT NOT NULL REFERENCES privacy_requests(id),
	subject_user_id TEXT NOT NULL REFERENCES users(id),
	object_kind TEXT NOT NULL CHECK (object_kind IN ('privacy_export', 'document_quarantine')),
	private_r2_key TEXT NOT NULL,
	source_record_id TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
	attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
	last_error_code TEXT,
	completed_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (object_kind, private_r2_key)
);

CREATE INDEX privacy_r2_cleanup_due
	ON privacy_r2_cleanup_jobs (status, updated_at);

CREATE TABLE privacy_admin_actions (
	id TEXT PRIMARY KEY NOT NULL,
	privacy_request_id TEXT NOT NULL REFERENCES privacy_requests(id),
	action TEXT NOT NULL CHECK (action IN ('process_delete', 'retry_export', 'archive_read')),
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	idempotency_key TEXT NOT NULL,
	request_hash_sha256 TEXT NOT NULL CHECK (
		length(request_hash_sha256) = 64
		AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'
	),
	result_status TEXT NOT NULL,
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	created_at TEXT NOT NULL,
	UNIQUE (actor_user_id, idempotency_key)
);

CREATE TABLE privacy_closure_results (
	privacy_request_id TEXT PRIMARY KEY NOT NULL REFERENCES privacy_requests(id),
	subject_user_id TEXT NOT NULL REFERENCES users(id),
	result_status TEXT NOT NULL CHECK (result_status IN (
		'blocked_by_active_contract', 'completed_with_retained_evidence'
	)),
	account_closed_at TEXT,
	active_contract_count INTEGER NOT NULL CHECK (active_contract_count >= 0),
	media_revocation_count INTEGER NOT NULL CHECK (media_revocation_count >= 0),
	retained_record_count INTEGER NOT NULL CHECK (retained_record_count >= 0),
	cleanup_job_count INTEGER NOT NULL CHECK (cleanup_job_count >= 0),
	safe_result_json TEXT NOT NULL CHECK (
		json_valid(safe_result_json) AND json_type(safe_result_json) = 'object'
	),
	created_at TEXT NOT NULL,
	CHECK ((result_status = 'blocked_by_active_contract' AND account_closed_at IS NULL
			AND active_contract_count > 0 AND media_revocation_count = 0)
		OR (result_status = 'completed_with_retained_evidence'
			AND account_closed_at IS NOT NULL AND active_contract_count = 0))
);

CREATE TABLE privacy_transaction_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	privacy_request_id TEXT NOT NULL REFERENCES privacy_requests(id),
	scope TEXT NOT NULL CHECK (scope IN ('export_complete', 'delete_blocked', 'closure_complete')),
	action_id TEXT,
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL,
	UNIQUE (privacy_request_id, scope)
);

CREATE TRIGGER privacy_requests_allowed_transition
BEFORE UPDATE OF status ON privacy_requests
WHEN NEW.status <> OLD.status AND NOT (
	(OLD.status = 'requested' AND NEW.status IN (
		'reviewing', 'approved', 'processing', 'blocked_by_active_contract', 'cancelled'))
	OR (OLD.status = 'reviewing' AND NEW.status IN (
		'approved', 'processing', 'blocked_by_active_contract', 'failed', 'cancelled'))
	OR (OLD.status = 'approved' AND NEW.status IN (
		'processing', 'blocked_by_active_contract', 'cancelled'))
	OR (OLD.status = 'processing' AND NEW.status IN (
		'completed', 'completed_with_retained_evidence',
		'blocked_by_active_contract', 'failed', 'cancelled'))
	OR (OLD.status = 'failed' AND NEW.status IN ('processing', 'cancelled'))
)
BEGIN
	SELECT RAISE(ABORT, 'invalid privacy request transition');
END;

CREATE TRIGGER privacy_requests_identity_immutable
BEFORE UPDATE OF subject_user_id, requested_by_user_id, kind,
	request_idempotency_key, request_hash_sha256, created_at ON privacy_requests
BEGIN SELECT RAISE(ABORT, 'privacy request identity is immutable'); END;

CREATE TRIGGER privacy_export_artifacts_allowed_transition
BEFORE UPDATE OF status ON privacy_export_artifacts
WHEN NEW.status <> OLD.status AND NOT (
	(OLD.status = 'ready' AND NEW.status = 'delete_pending')
	OR (OLD.status = 'delete_pending' AND NEW.status = 'deleted')
)
BEGIN
	SELECT RAISE(ABORT, 'invalid privacy export artifact transition');
END;

CREATE TRIGGER privacy_export_artifacts_reject_identity_update
BEFORE UPDATE OF privacy_request_id, subject_user_id, private_r2_key,
	content_type, size_bytes, sha256, generated_at, expires_at, created_at
	ON privacy_export_artifacts
BEGIN SELECT RAISE(ABORT, 'privacy export artifact identity is immutable'); END;

CREATE TRIGGER legal_archive_records_reject_update
BEFORE UPDATE ON legal_archive_records
BEGIN SELECT RAISE(ABORT, 'legal archive index is append-only'); END;

CREATE TRIGGER legal_archive_records_reject_delete
BEFORE DELETE ON legal_archive_records
BEGIN SELECT RAISE(ABORT, 'legal archive is retained evidence'); END;

CREATE TRIGGER privacy_admin_actions_reject_update
BEFORE UPDATE ON privacy_admin_actions
BEGIN SELECT RAISE(ABORT, 'privacy admin actions are append-only'); END;

CREATE TRIGGER privacy_admin_actions_reject_delete
BEFORE DELETE ON privacy_admin_actions
BEGIN SELECT RAISE(ABORT, 'privacy admin actions are append-only'); END;

CREATE TRIGGER privacy_closure_results_reject_update
BEFORE UPDATE ON privacy_closure_results
BEGIN SELECT RAISE(ABORT, 'privacy closure result is immutable'); END;

CREATE TRIGGER privacy_closure_results_reject_delete
BEFORE DELETE ON privacy_closure_results
BEGIN SELECT RAISE(ABORT, 'privacy closure result is immutable'); END;

CREATE TRIGGER privacy_transaction_assertions_reject_update
BEFORE UPDATE ON privacy_transaction_assertions
BEGIN SELECT RAISE(ABORT, 'privacy transaction assertion is append-only'); END;

CREATE TRIGGER privacy_transaction_assertions_reject_delete
BEFORE DELETE ON privacy_transaction_assertions
BEGIN SELECT RAISE(ABORT, 'privacy transaction assertion is append-only'); END;

CREATE TRIGGER users_closed_identity_guard
BEFORE UPDATE OF account_status ON users
WHEN NEW.account_status = 'closed' AND OLD.account_status <> 'closed'
BEGIN
	SELECT RAISE(ABORT, 'closed account profile is not minimized') WHERE
		NEW.closed_at IS NULL
		OR NEW.email NOT LIKE 'closed-%@tombstone.invalid'
		OR NEW.email_normalized <> NEW.email
		OR NEW.email_verified_at IS NOT NULL
		OR NEW.pending_email IS NOT NULL
		OR NEW.pending_email_normalized IS NOT NULL
		OR NEW.pending_email_expires_at IS NOT NULL
		OR NEW.phone IS NOT NULL
		OR NEW.family_number_id IS NOT NULL;
END;

-- Database-level closure guards backstop UI/API and queued workers.
CREATE TRIGGER contract_offers_require_active_owner_transition
BEFORE UPDATE OF status ON contract_offers
WHEN NEW.status <> OLD.status
	AND NEW.status IN ('accepted_by_parent', 'declined_by_parent', 'approved_by_admin')
BEGIN
	SELECT RAISE(ABORT, 'contract action requires active owner') WHERE NOT EXISTS (
		SELECT 1 FROM users owner WHERE owner.id = NEW.user_id
			AND owner.account_status = 'active' AND owner.is_blocked = 0
	);
END;

CREATE TRIGGER contracts_insert_requires_active_owner
BEFORE INSERT ON contracts
BEGIN
	SELECT RAISE(ABORT, 'contract formation requires active owner') WHERE NOT EXISTS (
		SELECT 1 FROM users owner WHERE owner.id = NEW.user_id
			AND owner.account_status = 'active' AND owner.is_blocked = 0
	);
END;

CREATE TRIGGER enrollments_activation_requires_active_owner
BEFORE UPDATE OF status ON enrollments
WHEN NEW.status = 'active' AND OLD.status <> 'active'
BEGIN
	SELECT RAISE(ABORT, 'enrollment activation requires active owner') WHERE NOT EXISTS (
		SELECT 1 FROM users owner WHERE owner.id = NEW.user_id
			AND owner.account_status = 'active' AND owner.is_blocked = 0
	);
END;

CREATE TRIGGER service_engagements_activation_requires_active_owner
BEFORE UPDATE OF status ON service_engagements
WHEN NEW.status = 'active' AND OLD.status <> 'active'
BEGIN
	SELECT RAISE(ABORT, 'service activation requires active owner') WHERE NOT EXISTS (
		SELECT 1 FROM users owner WHERE owner.id = NEW.user_id
			AND owner.account_status = 'active' AND owner.is_blocked = 0
	);
END;

CREATE TRIGGER price_review_owner_transition_requires_active_account
BEFORE UPDATE OF status ON price_review_items
WHEN NEW.status <> OLD.status AND NEW.user_id IS NOT NULL
	AND NEW.status IN ('accepted_by_parent', 'declined_by_parent',
		'approved_by_admin', 'scheduled', 'applied')
BEGIN
	SELECT RAISE(ABORT, 'price review action requires active owner') WHERE NOT EXISTS (
		SELECT 1 FROM users owner WHERE owner.id = NEW.user_id
			AND owner.account_status = 'active' AND owner.is_blocked = 0
	);
END;

CREATE TRIGGER price_change_apply_requires_active_account
BEFORE INSERT ON price_change_apply_events
BEGIN
	SELECT RAISE(ABORT, 'price apply requires active owner') WHERE NOT EXISTS (
		SELECT 1 FROM price_review_items item
		JOIN users owner ON owner.id = item.user_id
		WHERE item.id = NEW.price_review_item_id
			AND owner.account_status = 'active' AND owner.is_blocked = 0
	);
END;

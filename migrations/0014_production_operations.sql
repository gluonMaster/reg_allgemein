PRAGMA foreign_keys = ON;

-- Every scheduled/manual maintenance execution has a PII-free, queryable result.
-- The dedupe key is a UTC time bucket or an explicit manual command id.
CREATE TABLE scheduled_job_runs (
	id TEXT PRIMARY KEY NOT NULL,
	job_name TEXT NOT NULL CHECK (job_name IN (
		'email_outbox', 'telegram_outbox', 'price_review', 'document_quarantine',
		'funding_authorization_expiry', 'email_reservation_cleanup',
		'privacy_r2_cleanup', 'security_metadata_cleanup', 'storage_orphan_cleanup'
	)),
	trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('scheduled', 'manual')),
	dedupe_key TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN (
		'running', 'succeeded', 'failed', 'feature_disabled', 'skipped_locked'
	)),
	lease_owner TEXT,
	fencing_token INTEGER CHECK (fencing_token IS NULL OR fencing_token > 0),
	safe_result_json TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(safe_result_json) AND json_type(safe_result_json) = 'object'),
	error_code TEXT,
	started_at TEXT NOT NULL,
	finished_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (job_name, dedupe_key),
	CHECK ((status = 'running' AND finished_at IS NULL)
		OR (status <> 'running' AND finished_at IS NOT NULL))
);

CREATE INDEX scheduled_job_runs_freshness
	ON scheduled_job_runs (job_name, started_at DESC, id DESC);

CREATE INDEX scheduled_job_runs_failures
	ON scheduled_job_runs (status, started_at DESC);

-- Write-ahead intent: an R2 put is never attempted before this row exists.
-- A staged/delete_pending row can therefore be reconciled after a dual D1/R2 failure.
CREATE TABLE storage_object_intents (
	id TEXT PRIMARY KEY NOT NULL,
	storage_class TEXT NOT NULL CHECK (storage_class IN ('archive', 'quarantine')),
	object_key TEXT NOT NULL,
	object_kind TEXT NOT NULL,
	source_ref TEXT,
	sha256 TEXT NOT NULL CHECK (
		length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'
	),
	size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
	status TEXT NOT NULL CHECK (status IN (
		'staged', 'linked', 'delete_pending', 'processing', 'deleted'
	)),
	attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
	lease_owner TEXT,
	lease_until TEXT,
	last_error_code TEXT,
	linked_at TEXT,
	deleted_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (storage_class, object_key)
);

CREATE INDEX storage_object_intents_cleanup
	ON storage_object_intents (status, lease_until, created_at, id);

CREATE TABLE storage_intent_link_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	intent_id TEXT NOT NULL UNIQUE REFERENCES storage_object_intents(id),
	target_kind TEXT NOT NULL,
	target_id TEXT NOT NULL,
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TRIGGER storage_intent_link_assertions_reject_update
BEFORE UPDATE ON storage_intent_link_assertions
BEGIN SELECT RAISE(ABORT, 'storage intent assertions are append-only'); END;

CREATE TRIGGER storage_intent_link_assertions_reject_delete
BEFORE DELETE ON storage_intent_link_assertions
BEGIN SELECT RAISE(ABORT, 'storage intent assertions are append-only'); END;

-- One-shot out-of-band bootstrap. There is no HTTP route and no reset transition.
CREATE TABLE admin_bootstrap_control (
	id TEXT PRIMARY KEY NOT NULL CHECK (id = 'first-admin'),
	status TEXT NOT NULL CHECK (status IN ('available', 'consumed')),
	consumed_by_user_id TEXT REFERENCES users(id),
	consumed_at TEXT,
	audit_event_id TEXT UNIQUE REFERENCES audit_events(id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK ((status = 'available' AND consumed_by_user_id IS NULL
			AND consumed_at IS NULL AND audit_event_id IS NULL)
		OR (status = 'consumed' AND consumed_by_user_id IS NOT NULL
			AND consumed_at IS NOT NULL AND audit_event_id IS NOT NULL))
);

INSERT INTO admin_bootstrap_control
	(id, status, consumed_by_user_id, consumed_at, audit_event_id, created_at, updated_at)
VALUES ('first-admin', 'available', NULL, NULL, NULL,
	strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE TABLE admin_bootstrap_actions (
	id TEXT PRIMARY KEY NOT NULL,
	target_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
	request_id TEXT NOT NULL UNIQUE,
	reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 200),
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	created_at TEXT NOT NULL
);

CREATE TABLE admin_bootstrap_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	action_id TEXT NOT NULL UNIQUE REFERENCES admin_bootstrap_actions(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TRIGGER admin_bootstrap_control_transition
BEFORE UPDATE ON admin_bootstrap_control
WHEN NOT (
	OLD.status = 'available' AND NEW.status = 'consumed'
	AND NEW.id = OLD.id AND NEW.created_at = OLD.created_at
	AND NEW.consumed_by_user_id IS NOT NULL AND NEW.consumed_at IS NOT NULL
	AND NEW.audit_event_id IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'admin bootstrap is one-shot'); END;

CREATE TRIGGER admin_bootstrap_control_reject_delete
BEFORE DELETE ON admin_bootstrap_control
BEGIN SELECT RAISE(ABORT, 'admin bootstrap control is retained'); END;

CREATE TRIGGER admin_bootstrap_actions_reject_update
BEFORE UPDATE ON admin_bootstrap_actions
BEGIN SELECT RAISE(ABORT, 'admin bootstrap actions are append-only'); END;

CREATE TRIGGER admin_bootstrap_actions_reject_delete
BEFORE DELETE ON admin_bootstrap_actions
BEGIN SELECT RAISE(ABORT, 'admin bootstrap actions are append-only'); END;

CREATE TRIGGER admin_bootstrap_assertions_reject_update
BEFORE UPDATE ON admin_bootstrap_assertions
BEGIN SELECT RAISE(ABORT, 'admin bootstrap assertions are append-only'); END;

CREATE TRIGGER admin_bootstrap_assertions_reject_delete
BEFORE DELETE ON admin_bootstrap_assertions
BEGIN SELECT RAISE(ABORT, 'admin bootstrap assertions are append-only'); END;

-- An upgraded database may already have an administrator. In that case there
-- must not be a dormant first-admin capability that becomes usable after a
-- later zero-admin incident. Seal it during the same forward migration and
-- leave immutable, PII-free evidence. A clean database has no matching row and
-- remains available for the explicit one-shot CLI bootstrap.
INSERT INTO audit_events
	(id, actor_user_id, actor_kind, action, target_kind, target_id,
	 request_id, safe_diff_json, created_at)
SELECT 'migration:0014:admin-bootstrap-sealed', NULL, 'system',
	'auth.first_admin_bootstrap_sealed_on_upgrade', 'user', admin.id,
	'migration:0014:admin-bootstrap-sealed',
	'{"existingAdmin":true,"oneShot":true,"sealed":true}',
	strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM users admin
WHERE admin.role = 'admin' AND admin.account_status = 'active' AND admin.is_blocked = 0
ORDER BY admin.created_at, admin.id LIMIT 1;

UPDATE admin_bootstrap_control
SET status = 'consumed',
	consumed_by_user_id = (
		SELECT target_id FROM audit_events
		WHERE id = 'migration:0014:admin-bootstrap-sealed'
	),
	consumed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
	audit_event_id = 'migration:0014:admin-bootstrap-sealed',
	updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 'first-admin' AND status = 'available'
	AND EXISTS (SELECT 1 FROM audit_events
		WHERE id = 'migration:0014:admin-bootstrap-sealed');

INSERT INTO admin_bootstrap_actions
	(id, target_user_id, request_id, reason, audit_event_id, created_at)
SELECT 'migration:0014:admin-bootstrap-action', control.consumed_by_user_id,
	'migration:0014:admin-bootstrap-sealed', 'sealed_on_upgrade_existing_admin',
	control.audit_event_id, control.consumed_at
FROM admin_bootstrap_control control
WHERE control.id = 'first-admin' AND control.status = 'consumed'
	AND control.audit_event_id = 'migration:0014:admin-bootstrap-sealed';

INSERT INTO admin_bootstrap_assertions
	(id, action_id, assertion_passed, created_at)
SELECT 'migration:0014:admin-bootstrap-assertion', action.id, 1, action.created_at
FROM admin_bootstrap_actions action
WHERE action.id = 'migration:0014:admin-bootstrap-action'
	AND EXISTS (SELECT 1 FROM admin_bootstrap_control control
		WHERE control.id = 'first-admin' AND control.status = 'consumed'
			AND control.consumed_by_user_id = action.target_user_id
			AND control.audit_event_id = action.audit_event_id);

-- Privacy cleanup leases make an interrupted Worker delivery reclaimable.
ALTER TABLE privacy_r2_cleanup_jobs ADD COLUMN lease_owner TEXT;
ALTER TABLE privacy_r2_cleanup_jobs ADD COLUMN lease_until TEXT;

-- A pre-0014 worker could crash after setting `processing`, when the table had
-- no reclaimable lease. Convert only those legacy rows to the existing retryable
-- `failed` state; otherwise `NULL <= now` would leave R2 privacy cleanup stuck.
UPDATE privacy_r2_cleanup_jobs
SET status = 'failed', last_error_code = 'MIGRATION_LEASE_RECOVERY_REQUIRED',
	lease_owner = NULL, lease_until = NULL,
	updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE status = 'processing' AND lease_owner IS NULL AND lease_until IS NULL;

CREATE INDEX privacy_r2_cleanup_lease_due
	ON privacy_r2_cleanup_jobs (status, lease_until, updated_at, id);

-- Support/absence content is operational, not retained legal evidence. Account
-- closure may replace it once, while every other edit remains forbidden.
DROP TRIGGER support_messages_immutable_update;
CREATE TRIGGER support_messages_privacy_minimize_only
BEFORE UPDATE ON support_messages
WHEN NOT (
	NEW.id = OLD.id AND NEW.thread_id = OLD.thread_id
	AND NEW.sender_kind = OLD.sender_kind
	AND NEW.sender_user_id IS OLD.sender_user_id
	AND NEW.created_at = OLD.created_at
	AND OLD.body <> '[account-closed]' AND NEW.body = '[account-closed]'
	AND EXISTS (
		SELECT 1 FROM support_threads thread
		JOIN users owner ON owner.id = thread.user_id
		WHERE thread.id = OLD.thread_id
			AND owner.account_status = 'deletion_requested'
	)
)
BEGIN SELECT RAISE(ABORT, 'support message is immutable'); END;

DROP TRIGGER absence_reports_immutable_update;
CREATE TRIGGER absence_reports_privacy_minimize_only
BEFORE UPDATE ON absence_reports
WHEN NOT (
	NEW.id = OLD.id AND NEW.thread_id = OLD.thread_id AND NEW.user_id = OLD.user_id
	AND NEW.child_id = OLD.child_id AND NEW.enrollment_id = OLD.enrollment_id
	AND NEW.absence_date = OLD.absence_date AND NEW.reason_code = OLD.reason_code
	AND NEW.message_id = OLD.message_id AND NEW.created_at = OLD.created_at
	AND OLD.reason_text <> '[account-closed]' AND NEW.reason_text = '[account-closed]'
	AND EXISTS (
		SELECT 1 FROM users owner WHERE owner.id = OLD.user_id
			AND owner.account_status = 'deletion_requested'
	)
)
BEGIN SELECT RAISE(ABORT, 'absence report is immutable'); END;

-- Acceptance evidence stays immutable except for the mandated one-way removal
-- of an expired pseudonymous IP value. Expiry metadata itself remains evidence.
DROP TRIGGER contract_parent_actions_reject_update;
CREATE TRIGGER contract_parent_actions_immutable_fields
BEFORE UPDATE OF id, contract_offer_id, user_id, action, from_status, to_status,
	offer_hash, text_version, user_agent, ip_expires_at, idempotency_key,
	request_hash_sha256, audit_event_id, created_at ON contract_parent_actions
BEGIN SELECT RAISE(ABORT, 'contract parent actions are append-only'); END;
CREATE TRIGGER contract_parent_actions_ip_minimize_only
BEFORE UPDATE OF ip_retention_value ON contract_parent_actions
WHEN NOT (OLD.ip_retention_value IS NOT NULL AND NEW.ip_retention_value IS NULL
	AND OLD.ip_expires_at IS NOT NULL
	AND OLD.ip_expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'contract parent action IP is not expired'); END;

DROP TRIGGER contract_acceptances_reject_update;
CREATE TRIGGER contract_acceptances_immutable_fields
BEFORE UPDATE OF id, contract_offer_id, parent_action_id, user_id, accepted_at,
	ip_expires_at, user_agent, acceptance_text_version, acceptance_text,
	contract_hash, idempotency_key, created_at ON contract_acceptances
BEGIN SELECT RAISE(ABORT, 'contract acceptances are immutable'); END;
CREATE TRIGGER contract_acceptances_ip_minimize_only
BEFORE UPDATE OF ip_retention_value ON contract_acceptances
WHEN NOT (OLD.ip_retention_value IS NOT NULL AND NEW.ip_retention_value IS NULL
	AND OLD.ip_expires_at IS NOT NULL
	AND OLD.ip_expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'contract acceptance IP is not expired'); END;

DROP TRIGGER price_review_parent_actions_reject_update;
CREATE TRIGGER price_review_parent_actions_immutable_fields
BEFORE UPDATE OF id, price_review_item_id, user_id, action, provided_item_hash,
	request_hash_sha256, idempotency_key, evidence_status, resulting_status,
	user_agent, ip_expires_at, created_at ON price_review_parent_actions
BEGIN SELECT RAISE(ABORT, 'price review parent actions are append-only'); END;
CREATE TRIGGER price_review_parent_actions_ip_minimize_only
BEFORE UPDATE OF ip_retention_value ON price_review_parent_actions
WHEN NOT (OLD.ip_retention_value IS NOT NULL AND NEW.ip_retention_value IS NULL
	AND OLD.ip_expires_at IS NOT NULL
	AND OLD.ip_expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'price review parent action IP is not expired'); END;

DROP TRIGGER price_change_acceptances_reject_update;
CREATE TRIGGER price_change_acceptances_immutable_fields
BEFORE UPDATE OF id, price_review_item_id, user_id, accepted_at, ip_expires_at,
	user_agent, acceptance_text, acceptance_text_version, item_hash,
	idempotency_key, parent_action_id ON price_change_acceptances
BEGIN SELECT RAISE(ABORT, 'price change acceptances are append-only'); END;
CREATE TRIGGER price_change_acceptances_ip_minimize_only
BEFORE UPDATE OF ip_retention_value ON price_change_acceptances
WHEN NOT (OLD.ip_retention_value IS NOT NULL AND NEW.ip_retention_value IS NULL
	AND OLD.ip_expires_at IS NOT NULL
	AND OLD.ip_expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
BEGIN SELECT RAISE(ABORT, 'price change acceptance IP is not expired'); END;

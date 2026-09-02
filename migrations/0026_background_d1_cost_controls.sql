PRAGMA foreign_keys = ON;

-- Cron health and dedupe are fixed-cardinality state. Scheduled executions no
-- longer append two rows per job/minute to scheduled_job_runs; that retained
-- ledger remains the audit trail for explicit manual operator actions.
CREATE TABLE scheduled_cadence_state (
	cadence TEXT PRIMARY KEY NOT NULL CHECK (cadence IN ('fast', 'maintenance')),
	status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'succeeded', 'failed')),
	last_dedupe_key TEXT,
	lease_owner TEXT,
	lease_until TEXT,
	fencing_token INTEGER NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
	safe_result_json TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(safe_result_json) AND json_type(safe_result_json) = 'object'),
	recent_failure_timestamps_json TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(recent_failure_timestamps_json)
			AND json_type(recent_failure_timestamps_json) = 'array'),
	started_at TEXT,
	finished_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK ((lease_owner IS NULL) = (lease_until IS NULL)),
	CHECK (status <> 'running' OR (last_dedupe_key IS NOT NULL AND started_at IS NOT NULL)),
	CHECK (status NOT IN ('succeeded', 'failed') OR finished_at IS NOT NULL)
);

INSERT INTO scheduled_cadence_state
	(cadence, status, last_dedupe_key, lease_owner, lease_until, fencing_token,
	 safe_result_json, recent_failure_timestamps_json, started_at, finished_at,
	 created_at, updated_at)
VALUES
	('fast', 'idle', NULL, NULL, NULL, 0, '{}', '[]', NULL, NULL,
		strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
	('maintenance', 'idle', NULL, NULL, NULL, 0, '{}', '[]', NULL, NULL,
		strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- No query searches operation locks by expiry alone. Removing this index
-- avoids rewriting an unused index on every necessary lease acquire/release.
DROP INDEX IF EXISTS operation_locks_expiry;

-- Health only distinguishes counts below/at the alert threshold. Retention can
-- seek the UTC minute primary key, so rewriting an updated_at index per 5xx is
-- unnecessary.
DROP INDEX IF EXISTS worker_error_buckets_retention;

-- Routine operator history contains only explicit manual actions. The partial
-- index avoids indexing retained scheduled history and does not amplify writes
-- if the previous Worker is used briefly for rollback.
CREATE INDEX scheduled_job_runs_manual_recent
	ON scheduled_job_runs (started_at DESC, id DESC)
	WHERE trigger_kind = 'manual';

-- Frequent bounded maintenance must seek expired work instead of scanning the
-- retained evidence/user history when queues are empty.
CREATE INDEX users_pending_email_expiry
	ON users (pending_email_expires_at, id)
	WHERE pending_email_expires_at IS NOT NULL;

CREATE INDEX contract_parent_actions_ip_expiry
	ON contract_parent_actions (ip_expires_at, id)
	WHERE ip_retention_value IS NOT NULL;

CREATE INDEX contract_acceptances_ip_expiry
	ON contract_acceptances (ip_expires_at, id)
	WHERE ip_retention_value IS NOT NULL;

CREATE INDEX price_review_parent_actions_ip_expiry
	ON price_review_parent_actions (ip_expires_at, id)
	WHERE ip_retention_value IS NOT NULL;

CREATE INDEX price_change_acceptances_ip_expiry
	ON price_change_acceptances (ip_expires_at, id)
	WHERE ip_retention_value IS NOT NULL;

-- The price reconciler uses separate indexed candidate streams. Keeping these
-- partial indexes on active enrollments bounds each 15-minute empty scan.
CREATE INDEX enrollments_reconciler_updated
	ON enrollments (updated_at, id)
	WHERE status = 'active';

CREATE INDEX enrollments_reconciler_active_from
	ON enrollments (active_from, id)
	WHERE status = 'active';

CREATE INDEX enrollments_reconciler_active_until
	ON enrollments (active_until, id)
	WHERE status = 'active' AND active_until IS NOT NULL;

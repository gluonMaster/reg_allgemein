PRAGMA foreign_keys = ON;

-- SQLite validates dependent trigger bodies while the table is absent during
-- a rebuild. Drop the two domain-event bridges first and recreate their exact
-- behavior after the canonical table name has been restored below.
DROP TRIGGER contract_outbox_to_common_transport;
DROP TRIGGER price_review_outbox_to_common_transport;

-- `delivery_unknown` is a durable queue state, not a presentation alias for
-- `dead`. SQLite cannot widen a CHECK constraint in place, so rebuild the
-- table before adding attempt foreign keys. Triggers on source tables keep
-- referring to the canonical `telegram_outbox` name after the final rename.
CREATE TABLE telegram_outbox_delivery_certainty (
	id TEXT PRIMARY KEY NOT NULL,
	source_kind TEXT NOT NULL,
	source_id TEXT NOT NULL,
	template_or_category TEXT NOT NULL,
	destination_ref TEXT NOT NULL DEFAULT 'bureau' CHECK (destination_ref = 'bureau'),
	locale TEXT NOT NULL DEFAULT 'de',
	payload_json TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
	dedupe_key TEXT NOT NULL UNIQUE,
	not_before TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN (
			'pending', 'processing', 'retry', 'sent', 'dead', 'cancelled',
			'delivery_unknown'
		)),
	attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
	max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
	next_attempt_at TEXT,
	last_error_code TEXT,
	locked_at TEXT,
	lease_owner TEXT,
	lease_until TEXT,
	provider_request_id TEXT,
	manual_retry_count INTEGER NOT NULL DEFAULT 0 CHECK (manual_retry_count >= 0),
	sent_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

INSERT INTO telegram_outbox_delivery_certainty (
	id, source_kind, source_id, template_or_category, destination_ref, locale,
	payload_json, dedupe_key, not_before, status, attempts, max_attempts,
	next_attempt_at, last_error_code, locked_at, lease_owner, lease_until,
	provider_request_id, manual_retry_count, sent_at, created_at, updated_at
)
SELECT id, source_kind, source_id, template_or_category, destination_ref, locale,
	payload_json, dedupe_key, not_before, status, attempts, max_attempts,
	next_attempt_at, last_error_code, locked_at, lease_owner, lease_until,
	provider_request_id, manual_retry_count, sent_at, created_at, updated_at
FROM telegram_outbox;

DROP TABLE telegram_outbox;
ALTER TABLE telegram_outbox_delivery_certainty RENAME TO telegram_outbox;

CREATE INDEX telegram_outbox_lease_queue
	ON telegram_outbox (status, not_before, next_attempt_at, lease_until, created_at);

CREATE INDEX telegram_outbox_source
	ON telegram_outbox (source_kind, source_id);

-- Stage-11 generic outbox actions predate database-enforced Telegram
-- authorizations. Preserve existing rows, but give every new action enough
-- immutable pre-state to authorize one exact transition before its assertion
-- consumes the proof.
ALTER TABLE outbox_admin_actions ADD COLUMN status_before TEXT;
ALTER TABLE outbox_admin_actions ADD COLUMN attempts_before INTEGER;
ALTER TABLE outbox_admin_actions ADD COLUMN max_attempts_before INTEGER;
ALTER TABLE outbox_admin_actions ADD COLUMN manual_retry_count_before INTEGER;
ALTER TABLE outbox_admin_actions ADD COLUMN updated_at_before TEXT;
ALTER TABLE outbox_admin_actions ADD COLUMN additional_attempts INTEGER;

CREATE TRIGGER outbox_admin_actions_reject_update
BEFORE UPDATE ON outbox_admin_actions
BEGIN
	SELECT RAISE(ABORT, 'outbox admin action is append-only');
END;

CREATE TRIGGER outbox_admin_actions_reject_delete
BEFORE DELETE ON outbox_admin_actions
BEGIN
	SELECT RAISE(ABORT, 'outbox admin action is append-only');
END;

CREATE TRIGGER outbox_action_assertions_reject_update
BEFORE UPDATE ON outbox_action_assertions
BEGIN
	SELECT RAISE(ABORT, 'outbox action assertion is append-only');
END;

CREATE TRIGGER outbox_action_assertions_reject_delete
BEFORE DELETE ON outbox_action_assertions
BEGIN
	SELECT RAISE(ABORT, 'outbox action assertion is append-only');
END;

CREATE TABLE telegram_delivery_attempts (
	id TEXT PRIMARY KEY NOT NULL,
	outbox_id TEXT NOT NULL REFERENCES telegram_outbox(id),
	attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
	delivery_reference TEXT NOT NULL CHECK (
		length(delivery_reference) = 15
		AND substr(delivery_reference, 1, 3) = 'TG-'
		AND substr(delivery_reference, 4) NOT GLOB '*[^0-9A-F]*'
	),
	lease_owner TEXT NOT NULL,
	state TEXT NOT NULL CHECK (state IN (
		'dispatch_started', 'not_delivered', 'delivered', 'delivery_unknown'
	)),
	safe_error_code TEXT,
	provider_request_id TEXT,
	started_at TEXT NOT NULL,
	finished_at TEXT,
	resolved_at TEXT,
	resolved_by TEXT REFERENCES users(id),
	resolution TEXT CHECK (resolution IN ('confirm_sent', 'retry_after_review', 'cancel')),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (outbox_id, attempt_no),
	CHECK (
		(state = 'dispatch_started' AND finished_at IS NULL)
		OR (state <> 'dispatch_started' AND finished_at IS NOT NULL)
	),
	CHECK (
		(resolved_at IS NULL AND resolved_by IS NULL AND resolution IS NULL)
		OR (
			state = 'delivery_unknown'
			AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution IS NOT NULL
		)
	),
	CHECK (
		(state = 'dispatch_started' AND safe_error_code IS NULL
			AND provider_request_id IS NULL AND finished_at IS NULL)
		OR (state = 'delivered' AND safe_error_code IS NULL
			AND provider_request_id IS NOT NULL
			AND length(provider_request_id) BETWEEN 1 AND 200 AND finished_at IS NOT NULL)
		OR (state = 'not_delivered' AND safe_error_code IS NOT NULL
			AND length(safe_error_code) BETWEEN 1 AND 80
			AND safe_error_code NOT GLOB '*[^A-Z0-9_]*'
			AND provider_request_id IS NULL AND finished_at IS NOT NULL)
		OR (state = 'delivery_unknown'
			AND safe_error_code = 'TELEGRAM_DELIVERY_UNKNOWN'
			AND provider_request_id IS NULL AND finished_at IS NOT NULL)
	)
);

CREATE INDEX telegram_delivery_attempts_attention
	ON telegram_delivery_attempts (state, resolved_at, finished_at, outbox_id);

CREATE TRIGGER telegram_delivery_attempt_initial_state_guard
BEFORE INSERT ON telegram_delivery_attempts
BEGIN
	SELECT RAISE(ABORT, 'invalid telegram delivery attempt initial state') WHERE NOT (
		NEW.state = 'dispatch_started'
		AND NEW.safe_error_code IS NULL
		AND NEW.provider_request_id IS NULL
		AND NEW.finished_at IS NULL
		AND NEW.resolved_at IS NULL
		AND NEW.resolved_by IS NULL
		AND NEW.resolution IS NULL
		AND NEW.started_at = NEW.created_at
		AND NEW.updated_at = NEW.created_at
		AND EXISTS (
			SELECT 1 FROM telegram_outbox outbox
			WHERE outbox.id = NEW.outbox_id
				AND outbox.status = 'processing'
				AND outbox.lease_owner = NEW.lease_owner
				AND outbox.locked_at IS NOT NULL
				AND outbox.locked_at <= NEW.started_at
				AND outbox.lease_until IS NOT NULL
				AND outbox.lease_until > NEW.started_at
				AND NEW.attempt_no = outbox.attempts + 1
		)
	);
END;

CREATE TRIGGER telegram_delivery_attempt_identity_immutable
BEFORE UPDATE OF id, outbox_id, attempt_no, delivery_reference, lease_owner, started_at, created_at
ON telegram_delivery_attempts
BEGIN
	SELECT RAISE(ABORT, 'telegram delivery attempt identity is immutable');
END;

CREATE TRIGGER telegram_delivery_attempt_allowed_transition
BEFORE UPDATE OF state ON telegram_delivery_attempts WHEN NEW.state <> OLD.state
BEGIN
	SELECT RAISE(ABORT, 'invalid telegram delivery attempt transition') WHERE NOT (
		OLD.state = 'dispatch_started'
		AND NEW.state IN ('not_delivered', 'delivered', 'delivery_unknown')
	);
END;

CREATE TRIGGER telegram_delivery_attempt_terminal_evidence_immutable
BEFORE UPDATE OF safe_error_code, provider_request_id, finished_at
ON telegram_delivery_attempts
WHEN NOT (
	OLD.state = 'dispatch_started'
	AND NEW.state IN ('not_delivered', 'delivered', 'delivery_unknown')
	AND NEW.finished_at IS NOT NULL
	AND NEW.updated_at = NEW.finished_at
)
BEGIN
	SELECT RAISE(ABORT, 'telegram delivery terminal evidence is immutable');
END;

CREATE TRIGGER telegram_delivery_attempt_updated_at_guard
BEFORE UPDATE OF updated_at ON telegram_delivery_attempts
WHEN NOT (
	(
		OLD.state = 'dispatch_started'
		AND NEW.state IN ('not_delivered', 'delivered', 'delivery_unknown')
		AND NEW.finished_at IS NOT NULL
		AND NEW.updated_at = NEW.finished_at
	)
	OR (
		OLD.state = 'delivery_unknown'
		AND NEW.state = OLD.state
		AND OLD.resolved_at IS NULL
		AND NEW.resolved_at IS NOT NULL
		AND NEW.updated_at = NEW.resolved_at
	)
)
BEGIN
	SELECT RAISE(ABORT, 'telegram delivery attempt update time is immutable');
END;

CREATE TRIGGER telegram_delivery_attempts_reject_delete
BEFORE DELETE ON telegram_delivery_attempts
BEGIN
	SELECT RAISE(ABORT, 'telegram delivery attempt is append-only');
END;

CREATE TABLE telegram_delivery_resolutions (
	id TEXT PRIMARY KEY NOT NULL,
	outbox_id TEXT NOT NULL REFERENCES telegram_outbox(id),
	attempt_id TEXT NOT NULL UNIQUE REFERENCES telegram_delivery_attempts(id),
	action TEXT NOT NULL CHECK (action IN ('confirm_sent', 'retry_after_review', 'cancel')),
	reason_code TEXT NOT NULL CHECK (
		(action = 'confirm_sent' AND reason_code = 'message_found_in_destination')
		OR (action = 'retry_after_review' AND reason_code = 'message_absence_verified')
		OR (action = 'cancel' AND reason_code = 'delivery_abandoned')
	),
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	idempotency_key TEXT NOT NULL,
	request_hash_sha256 TEXT NOT NULL CHECK (
		length(request_hash_sha256) = 64
		AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'
	),
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	additional_attempts INTEGER NOT NULL CHECK (
		(action = 'retry_after_review' AND additional_attempts > 0)
		OR (action <> 'retry_after_review' AND additional_attempts = 0)
	),
	created_at TEXT NOT NULL,
	UNIQUE (actor_user_id, idempotency_key)
);

CREATE TABLE telegram_delivery_resolution_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	resolution_id TEXT NOT NULL UNIQUE REFERENCES telegram_delivery_resolutions(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TRIGGER telegram_delivery_resolutions_reject_update
BEFORE UPDATE ON telegram_delivery_resolutions
BEGIN
	SELECT RAISE(ABORT, 'telegram delivery resolution is append-only');
END;

CREATE TRIGGER telegram_delivery_resolutions_reject_delete
BEFORE DELETE ON telegram_delivery_resolutions
BEGIN
	SELECT RAISE(ABORT, 'telegram delivery resolution is append-only');
END;

CREATE TRIGGER telegram_delivery_resolution_assertions_reject_update
BEFORE UPDATE ON telegram_delivery_resolution_assertions
BEGIN
	SELECT RAISE(ABORT, 'telegram delivery resolution assertion is append-only');
END;

CREATE TRIGGER telegram_delivery_resolution_assertions_reject_delete
BEFORE DELETE ON telegram_delivery_resolution_assertions
BEGIN
	SELECT RAISE(ABORT, 'telegram delivery resolution assertion is append-only');
END;

CREATE TRIGGER telegram_delivery_attempt_resolution_requires_audit
BEFORE UPDATE OF resolved_at, resolved_by, resolution ON telegram_delivery_attempts
BEGIN
	SELECT RAISE(ABORT, 'telegram delivery resolution is immutable') WHERE NOT (
		OLD.state = 'delivery_unknown'
		AND NEW.state = OLD.state
		AND OLD.resolved_at IS NULL
		AND OLD.resolved_by IS NULL
		AND OLD.resolution IS NULL
		AND NEW.resolved_at IS NOT NULL
		AND NEW.resolved_by IS NOT NULL
		AND NEW.resolution IS NOT NULL
		AND NEW.updated_at = NEW.resolved_at
		AND EXISTS (
			SELECT 1
			FROM telegram_delivery_resolutions resolution
			JOIN audit_events audit ON audit.id = resolution.audit_event_id
			JOIN users actor ON actor.id = resolution.actor_user_id
			WHERE resolution.attempt_id = OLD.id
				AND resolution.outbox_id = OLD.outbox_id
				AND resolution.action = NEW.resolution
				AND resolution.actor_user_id = NEW.resolved_by
				AND resolution.created_at = NEW.resolved_at
				AND audit.actor_user_id = NEW.resolved_by
				AND audit.actor_kind = 'user'
				AND audit.action = 'outbox.telegram.' || NEW.resolution
				AND audit.target_kind = 'outbox_event'
				AND audit.target_id = OLD.outbox_id
				AND audit.created_at = NEW.resolved_at
				AND actor.role = 'admin' AND actor.account_status = 'active'
				AND actor.is_blocked = 0 AND actor.email_verified_at IS NOT NULL
		)
	);
END;

-- A preview smoke row is deliberately created with a far-future schedule so
-- ordinary cron can never claim it. The authorized smoke runner may arm and
-- claim only that exact synthetic row, in one transaction, using a reviewed
-- target-bound proof which is consumed by the assertion after the UPDATE.
CREATE TABLE telegram_preview_smoke_claim_authorizations (
	id TEXT PRIMARY KEY NOT NULL,
	outbox_id TEXT NOT NULL UNIQUE REFERENCES telegram_outbox(id),
	source_id TEXT NOT NULL CHECK (
		length(source_id) = 36
		AND substr(source_id, 9, 1) = '-'
		AND substr(source_id, 14, 1) = '-'
		AND substr(source_id, 19, 1) = '-'
		AND substr(source_id, 24, 1) = '-'
		AND replace(source_id, '-', '') NOT GLOB '*[^0-9a-f]*'
	),
	dedupe_key TEXT NOT NULL UNIQUE,
	target_fingerprint_sha256 TEXT NOT NULL CHECK (
		length(target_fingerprint_sha256) = 64
		AND target_fingerprint_sha256 NOT GLOB '*[^0-9a-f]*'
	),
	activation_at TEXT NOT NULL,
	lease_owner TEXT NOT NULL CHECK (length(lease_owner) BETWEEN 1 AND 200),
	locked_at TEXT NOT NULL,
	lease_until TEXT NOT NULL CHECK (lease_until > locked_at),
	reviewed_by TEXT NOT NULL CHECK (length(reviewed_by) BETWEEN 1 AND 200),
	reason_code TEXT NOT NULL CHECK (reason_code = 'preview_synthetic_smoke'),
	request_hash_sha256 TEXT NOT NULL CHECK (
		length(request_hash_sha256) = 64
		AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'
	),
	provider_send_disabled INTEGER NOT NULL CHECK (provider_send_disabled = 1),
	created_at TEXT NOT NULL CHECK (created_at = locked_at),
	CHECK (dedupe_key = 'telegram-preview-smoke:'
		|| target_fingerprint_sha256 || ':' || source_id)
);

CREATE TABLE telegram_preview_smoke_claim_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	authorization_id TEXT NOT NULL UNIQUE
		REFERENCES telegram_preview_smoke_claim_authorizations(id),
	outbox_id TEXT NOT NULL UNIQUE REFERENCES telegram_outbox(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TRIGGER telegram_preview_smoke_claim_authorizations_reject_update
BEFORE UPDATE ON telegram_preview_smoke_claim_authorizations
BEGIN
	SELECT RAISE(ABORT, 'telegram preview smoke claim authorization is append-only');
END;

CREATE TRIGGER telegram_preview_smoke_claim_authorizations_reject_delete
BEFORE DELETE ON telegram_preview_smoke_claim_authorizations
BEGIN
	SELECT RAISE(ABORT, 'telegram preview smoke claim authorization is append-only');
END;

CREATE TRIGGER telegram_preview_smoke_claim_assertions_reject_update
BEFORE UPDATE ON telegram_preview_smoke_claim_assertions
BEGIN
	SELECT RAISE(ABORT, 'telegram preview smoke claim assertion is append-only');
END;

CREATE TRIGGER telegram_preview_smoke_claim_assertions_reject_delete
BEFORE DELETE ON telegram_preview_smoke_claim_assertions
BEGIN
	SELECT RAISE(ABORT, 'telegram preview smoke claim assertion is append-only');
END;

-- A prepared smoke row, or a claim that stopped before a durable dispatch
-- marker, can be cancelled without provider contact. This is a separate,
-- target-bound proof: once an attempt exists, delivery certainty takes over and
-- the abort path is permanently unavailable.
CREATE TABLE telegram_preview_smoke_abort_authorizations (
	id TEXT PRIMARY KEY NOT NULL,
	outbox_id TEXT NOT NULL UNIQUE REFERENCES telegram_outbox(id),
	source_id TEXT NOT NULL CHECK (
		length(source_id) = 36
		AND substr(source_id, 9, 1) = '-'
		AND substr(source_id, 14, 1) = '-'
		AND substr(source_id, 19, 1) = '-'
		AND substr(source_id, 24, 1) = '-'
		AND replace(source_id, '-', '') NOT GLOB '*[^0-9a-f]*'
	),
	dedupe_key TEXT NOT NULL UNIQUE,
	target_fingerprint_sha256 TEXT NOT NULL CHECK (
		length(target_fingerprint_sha256) = 64
		AND target_fingerprint_sha256 NOT GLOB '*[^0-9a-f]*'
	),
	status_before TEXT NOT NULL CHECK (status_before IN ('pending', 'processing')),
	not_before_before TEXT NOT NULL,
	locked_at_before TEXT,
	lease_owner_before TEXT,
	lease_until_before TEXT,
	updated_at_before TEXT NOT NULL,
	reviewed_by TEXT NOT NULL CHECK (length(reviewed_by) BETWEEN 1 AND 200),
	reason_code TEXT NOT NULL CHECK (
		reason_code = 'preview_synthetic_smoke_aborted_before_dispatch'
	),
	request_hash_sha256 TEXT NOT NULL CHECK (
		length(request_hash_sha256) = 64
		AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'
	),
	created_at TEXT NOT NULL CHECK (created_at >= updated_at_before),
	CHECK (dedupe_key = 'telegram-preview-smoke:'
		|| target_fingerprint_sha256 || ':' || source_id),
	CHECK (
		(status_before = 'pending' AND locked_at_before IS NULL
			AND lease_owner_before IS NULL AND lease_until_before IS NULL)
		OR (status_before = 'processing' AND locked_at_before IS NOT NULL
			AND lease_owner_before IS NOT NULL AND length(lease_owner_before) BETWEEN 1 AND 200
			AND lease_until_before IS NOT NULL AND lease_until_before > locked_at_before)
	)
);

CREATE TABLE telegram_preview_smoke_abort_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	authorization_id TEXT NOT NULL UNIQUE
		REFERENCES telegram_preview_smoke_abort_authorizations(id),
	outbox_id TEXT NOT NULL UNIQUE REFERENCES telegram_outbox(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TRIGGER telegram_preview_smoke_abort_authorization_initial_guard
BEFORE INSERT ON telegram_preview_smoke_abort_authorizations
BEGIN
	SELECT RAISE(ABORT, 'invalid telegram preview smoke abort authorization') WHERE NOT EXISTS (
		SELECT 1 FROM telegram_outbox outbox
		WHERE outbox.id = NEW.outbox_id
			AND outbox.source_kind = 'support_thread'
			AND outbox.source_id = NEW.source_id
			AND outbox.template_or_category = 'bureau.support'
			AND outbox.destination_ref = 'bureau'
			AND outbox.dedupe_key = NEW.dedupe_key
			AND outbox.status = NEW.status_before
			AND outbox.not_before = NEW.not_before_before
			AND outbox.locked_at IS NEW.locked_at_before
			AND outbox.lease_owner IS NEW.lease_owner_before
			AND outbox.lease_until IS NEW.lease_until_before
			AND outbox.updated_at = NEW.updated_at_before
			AND outbox.attempts = 0 AND outbox.max_attempts = 1
			AND outbox.manual_retry_count = 0
			AND outbox.next_attempt_at IS NULL
			AND outbox.last_error_code IS NULL
			AND outbox.provider_request_id IS NULL AND outbox.sent_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM telegram_delivery_attempts attempt
				WHERE attempt.outbox_id = outbox.id)
	);
END;

CREATE TRIGGER telegram_preview_smoke_abort_authorizations_reject_update
BEFORE UPDATE ON telegram_preview_smoke_abort_authorizations
BEGIN
	SELECT RAISE(ABORT, 'telegram preview smoke abort authorization is append-only');
END;

CREATE TRIGGER telegram_preview_smoke_abort_authorizations_reject_delete
BEFORE DELETE ON telegram_preview_smoke_abort_authorizations
BEGIN
	SELECT RAISE(ABORT, 'telegram preview smoke abort authorization is append-only');
END;

CREATE TRIGGER telegram_preview_smoke_abort_assertions_reject_update
BEFORE UPDATE ON telegram_preview_smoke_abort_assertions
BEGIN
	SELECT RAISE(ABORT, 'telegram preview smoke abort assertion is append-only');
END;

CREATE TRIGGER telegram_preview_smoke_abort_assertions_reject_delete
BEFORE DELETE ON telegram_preview_smoke_abort_assertions
BEGIN
	SELECT RAISE(ABORT, 'telegram preview smoke abort assertion is append-only');
END;

CREATE TABLE telegram_destination_activation_floors (
	destination_ref TEXT PRIMARY KEY NOT NULL CHECK (destination_ref = 'bureau'),
	activation_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL CHECK (updated_at >= created_at)
);

CREATE TRIGGER telegram_destination_activation_floor_monotonic
BEFORE UPDATE OF destination_ref, activation_at, created_at
ON telegram_destination_activation_floors
WHEN NEW.destination_ref <> OLD.destination_ref
	OR NEW.created_at <> OLD.created_at
	OR NEW.activation_at < OLD.activation_at
BEGIN
	SELECT RAISE(ABORT, 'telegram activation floor cannot move backwards');
END;

CREATE TRIGGER telegram_destination_activation_floors_reject_delete
BEFORE DELETE ON telegram_destination_activation_floors
BEGIN
	SELECT RAISE(ABORT, 'telegram activation floor is durable');
END;

-- Runtime retry policy is persisted before a claim so D1 can bind an exact
-- configured budget to every ordinary claim. Audited manual allowances remain
-- on the row and may exceed the current configured budget.
CREATE TABLE telegram_destination_policies (
	destination_ref TEXT PRIMARY KEY NOT NULL CHECK (destination_ref = 'bureau'),
	configured_max_attempts INTEGER NOT NULL CHECK (configured_max_attempts > 0),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL CHECK (updated_at >= created_at)
);

CREATE TRIGGER telegram_destination_policy_update_guard
BEFORE UPDATE OF destination_ref, configured_max_attempts, created_at, updated_at
ON telegram_destination_policies
WHEN NEW.destination_ref <> OLD.destination_ref
	OR NEW.created_at <> OLD.created_at
	OR NEW.updated_at < OLD.updated_at
BEGIN
	SELECT RAISE(ABORT, 'invalid telegram destination policy update');
END;

CREATE TRIGGER telegram_destination_policies_reject_delete
BEFORE DELETE ON telegram_destination_policies
BEGIN
	SELECT RAISE(ABORT, 'telegram destination policy is durable');
END;

CREATE TRIGGER telegram_outbox_identity_immutable
BEFORE UPDATE OF id, source_kind, source_id, template_or_category, destination_ref,
	locale, payload_json, dedupe_key, created_at
ON telegram_outbox
BEGIN
	SELECT RAISE(ABORT, 'telegram outbox identity is immutable');
END;

CREATE TRIGGER telegram_outbox_initial_state_guard
BEFORE INSERT ON telegram_outbox
BEGIN
	SELECT RAISE(ABORT, 'invalid telegram outbox initial state') WHERE NOT (
		NEW.status = 'pending'
		AND NEW.attempts = 0
		AND NEW.manual_retry_count = 0
		AND NEW.next_attempt_at IS NULL
		AND NEW.last_error_code IS NULL
		AND NEW.locked_at IS NULL
		AND NEW.lease_owner IS NULL
		AND NEW.lease_until IS NULL
		AND NEW.provider_request_id IS NULL
		AND NEW.sent_at IS NULL
		AND NEW.updated_at = NEW.created_at
		AND NEW.not_before >= NEW.created_at
		AND length(NEW.id) BETWEEN 1 AND 200
		AND length(NEW.source_kind) BETWEEN 1 AND 80
		AND length(NEW.source_id) BETWEEN 1 AND 200
		AND length(NEW.template_or_category) BETWEEN 1 AND 120
		AND length(NEW.dedupe_key) BETWEEN 1 AND 300
	);
END;

CREATE TRIGGER telegram_outbox_terminal_state_immutable
BEFORE UPDATE ON telegram_outbox
WHEN OLD.status = NEW.status
	AND OLD.status IN ('sent', 'dead', 'cancelled', 'delivery_unknown')
BEGIN
	SELECT RAISE(ABORT, 'telegram outbox terminal evidence is immutable');
END;

CREATE TRIGGER telegram_outbox_reject_delete
BEFORE DELETE ON telegram_outbox
BEGIN
	SELECT RAISE(ABORT, 'telegram outbox is append-only');
END;

CREATE TRIGGER telegram_outbox_allowed_transition
BEFORE UPDATE OF status ON telegram_outbox WHEN NEW.status <> OLD.status
BEGIN
	SELECT RAISE(ABORT, 'invalid telegram outbox transition') WHERE NOT (
		(
			OLD.status IN ('pending', 'retry') AND NEW.status = 'processing'
			AND NEW.locked_at IS NOT NULL AND NEW.updated_at = NEW.locked_at
			AND NEW.lease_owner IS NOT NULL
			AND length(NEW.lease_owner) BETWEEN 1 AND 200
			AND NEW.lease_until IS NOT NULL AND NEW.lease_until > NEW.locked_at
			AND NEW.attempts = OLD.attempts
			AND NEW.manual_retry_count = OLD.manual_retry_count
			AND NEW.last_error_code IS OLD.last_error_code
			AND NEW.provider_request_id IS OLD.provider_request_id
			AND NEW.sent_at IS OLD.sent_at
			AND NEW.max_attempts > 0
			AND NOT EXISTS (
				SELECT 1 FROM telegram_outbox unresolved
				JOIN telegram_delivery_attempts attempt ON attempt.outbox_id = unresolved.id
				WHERE unresolved.destination_ref = OLD.destination_ref
					AND unresolved.status = 'delivery_unknown'
					AND attempt.state = 'delivery_unknown' AND attempt.resolved_at IS NULL
			)
			AND (
				(
					OLD.not_before <= NEW.locked_at
					AND (OLD.next_attempt_at IS NULL
						OR OLD.next_attempt_at <= NEW.locked_at)
					AND NEW.not_before = OLD.not_before
					AND NEW.next_attempt_at IS OLD.next_attempt_at
					AND NOT (
						OLD.source_kind = 'support_thread'
						AND OLD.template_or_category = 'bureau.support'
						AND length(OLD.dedupe_key) = 124
						AND substr(OLD.dedupe_key, 1, 23) = 'telegram-preview-smoke:'
						AND substr(OLD.dedupe_key, 24, 64) NOT GLOB '*[^0-9a-f]*'
						AND substr(OLD.dedupe_key, 88, 1) = ':'
						AND OLD.source_id = substr(OLD.dedupe_key, 89, 36)
					)
					AND NEW.max_attempts = CASE
						WHEN OLD.manual_retry_count > 0 THEN MAX(
							OLD.max_attempts,
							COALESCE((SELECT policy.configured_max_attempts
								FROM telegram_destination_policies policy
								WHERE policy.destination_ref = OLD.destination_ref),
								OLD.max_attempts)
						)
						ELSE COALESCE((SELECT policy.configured_max_attempts
							FROM telegram_destination_policies policy
							WHERE policy.destination_ref = OLD.destination_ref),
							OLD.max_attempts)
					END
					AND NOT EXISTS (
						SELECT 1 FROM telegram_destination_activation_floors floor
						WHERE floor.destination_ref = OLD.destination_ref
							AND OLD.created_at < floor.activation_at
					)
				)
				OR (
					OLD.status = 'pending'
					AND OLD.attempts = 0 AND OLD.max_attempts = 1
					AND OLD.next_attempt_at IS NULL
					AND OLD.not_before = '9999-12-31T23:59:59.999Z'
					AND OLD.source_kind = 'support_thread'
					AND OLD.template_or_category = 'bureau.support'
					AND NEW.not_before = NEW.locked_at
					AND NEW.next_attempt_at IS NULL
					AND NEW.max_attempts = OLD.max_attempts
					AND EXISTS (
						SELECT 1
						FROM telegram_preview_smoke_claim_authorizations authorization
						WHERE authorization.outbox_id = OLD.id
							AND authorization.source_id = OLD.source_id
							AND authorization.dedupe_key = OLD.dedupe_key
							AND authorization.activation_at <= OLD.created_at
							AND authorization.lease_owner = NEW.lease_owner
							AND authorization.locked_at = NEW.locked_at
							AND authorization.lease_until = NEW.lease_until
							AND authorization.created_at = NEW.updated_at
							AND authorization.provider_send_disabled = 1
							AND NOT EXISTS (
								SELECT 1 FROM telegram_preview_smoke_claim_assertions assertion
								WHERE assertion.authorization_id = authorization.id
							)
					)
				)
			)
		)
		OR (
			OLD.status IN ('pending', 'retry') AND NEW.status = 'cancelled'
			AND NEW.attempts = OLD.attempts
			AND NEW.max_attempts = OLD.max_attempts
			AND NEW.manual_retry_count = OLD.manual_retry_count
			AND NEW.not_before = OLD.not_before
			AND NEW.next_attempt_at IS NULL
			AND NEW.last_error_code IS OLD.last_error_code
			AND NEW.provider_request_id IS OLD.provider_request_id
			AND NEW.sent_at IS OLD.sent_at
			AND NEW.locked_at IS NULL AND NEW.lease_owner IS NULL
			AND NEW.lease_until IS NULL
			AND EXISTS (
				SELECT 1 FROM outbox_admin_actions action
				JOIN audit_events audit ON audit.id = action.audit_event_id
				JOIN users actor ON actor.id = action.actor_user_id
				WHERE action.channel = 'telegram' AND action.outbox_id = OLD.id
					AND action.action = 'cancel'
					AND action.status_before = OLD.status
					AND action.attempts_before = OLD.attempts
					AND action.max_attempts_before = OLD.max_attempts
					AND action.manual_retry_count_before = OLD.manual_retry_count
					AND action.updated_at_before = OLD.updated_at
					AND action.additional_attempts = 0
					AND action.created_at = NEW.updated_at
					AND audit.actor_user_id = action.actor_user_id
					AND audit.action = 'outbox.telegram.cancel'
					AND audit.target_kind = 'outbox_event' AND audit.target_id = OLD.id
					AND audit.created_at = NEW.updated_at
					AND actor.role = 'admin' AND actor.account_status = 'active'
					AND actor.is_blocked = 0 AND actor.email_verified_at IS NOT NULL
					AND NOT EXISTS (SELECT 1 FROM outbox_action_assertions assertion
						WHERE assertion.action_id = action.id)
			)
		)
		OR (
			OLD.status IN ('pending', 'processing') AND NEW.status = 'cancelled'
			AND OLD.source_kind = 'support_thread'
			AND OLD.template_or_category = 'bureau.support'
			AND length(OLD.dedupe_key) = 124
			AND substr(OLD.dedupe_key, 1, 23) = 'telegram-preview-smoke:'
			AND substr(OLD.dedupe_key, 24, 64) NOT GLOB '*[^0-9a-f]*'
			AND substr(OLD.dedupe_key, 88, 1) = ':'
			AND OLD.source_id = substr(OLD.dedupe_key, 89, 36)
			AND NEW.attempts = OLD.attempts AND NEW.attempts = 0
			AND NEW.max_attempts = OLD.max_attempts AND NEW.max_attempts = 1
			AND NEW.manual_retry_count = OLD.manual_retry_count
			AND NEW.not_before = OLD.not_before
			AND NEW.next_attempt_at IS NULL
			AND NEW.last_error_code IS NULL
			AND NEW.provider_request_id IS NULL AND NEW.sent_at IS NULL
			AND NEW.locked_at IS NULL AND NEW.lease_owner IS NULL
			AND NEW.lease_until IS NULL
			AND NOT EXISTS (SELECT 1 FROM telegram_delivery_attempts attempt
				WHERE attempt.outbox_id = OLD.id)
			AND EXISTS (
				SELECT 1
				FROM telegram_preview_smoke_abort_authorizations authorization
				WHERE authorization.outbox_id = OLD.id
					AND authorization.source_id = OLD.source_id
					AND authorization.dedupe_key = OLD.dedupe_key
					AND authorization.target_fingerprint_sha256 = substr(OLD.dedupe_key, 24, 64)
					AND authorization.status_before = OLD.status
					AND authorization.not_before_before = OLD.not_before
					AND authorization.locked_at_before IS OLD.locked_at
					AND authorization.lease_owner_before IS OLD.lease_owner
					AND authorization.lease_until_before IS OLD.lease_until
					AND authorization.updated_at_before = OLD.updated_at
					AND authorization.created_at = NEW.updated_at
					AND NOT EXISTS (
						SELECT 1 FROM telegram_preview_smoke_abort_assertions assertion
						WHERE assertion.authorization_id = authorization.id
					)
			)
		)
		OR (
			OLD.status = 'processing' AND NEW.status IN ('retry', 'dead')
			AND NEW.max_attempts = OLD.max_attempts
			AND NEW.manual_retry_count = OLD.manual_retry_count
			AND (
				(
					NOT EXISTS (
						SELECT 1 FROM telegram_delivery_attempts attempt
						WHERE attempt.outbox_id = OLD.id
							AND attempt.attempt_no = OLD.attempts + 1
					)
					AND NEW.status = 'retry'
					AND NEW.attempts = OLD.attempts
					AND NEW.last_error_code IS OLD.last_error_code
					AND NEW.provider_request_id IS OLD.provider_request_id
					AND NEW.sent_at IS OLD.sent_at
					AND NEW.not_before = NEW.next_attempt_at
					AND NEW.not_before > NEW.updated_at
					AND NEW.not_before >= OLD.not_before
					AND NEW.locked_at IS NULL AND NEW.lease_owner IS NULL
					AND NEW.lease_until IS NULL
				)
				OR (
					NEW.attempts = OLD.attempts + 1
					AND NEW.last_error_code IS NOT NULL
					AND length(NEW.last_error_code) BETWEEN 1 AND 80
					AND NEW.last_error_code NOT GLOB '*[^A-Z0-9_]*'
					AND NEW.provider_request_id IS NULL AND NEW.sent_at IS NULL
					AND NEW.not_before = OLD.not_before
					AND NEW.locked_at IS NULL AND NEW.lease_owner IS NULL
					AND NEW.lease_until IS NULL
					AND ((NEW.status = 'retry' AND NEW.next_attempt_at IS NOT NULL
							AND NEW.next_attempt_at > NEW.updated_at)
						OR (NEW.status = 'dead' AND NEW.next_attempt_at IS NULL))
					AND (
						NOT EXISTS (
							SELECT 1 FROM telegram_delivery_attempts attempt
							WHERE attempt.outbox_id = OLD.id
								AND attempt.attempt_no = OLD.attempts + 1
						)
						OR EXISTS (
							SELECT 1 FROM telegram_delivery_attempts attempt
							WHERE attempt.outbox_id = OLD.id
								AND attempt.attempt_no = OLD.attempts + 1
								AND attempt.lease_owner = OLD.lease_owner
								AND attempt.state = 'not_delivered'
								AND attempt.safe_error_code = NEW.last_error_code
								AND attempt.finished_at = NEW.updated_at
						)
					)
				)
			)
		)
		OR (
			OLD.status = 'processing' AND NEW.status = 'sent'
			AND NEW.attempts = OLD.attempts + 1
			AND NEW.max_attempts = OLD.max_attempts
			AND NEW.manual_retry_count = OLD.manual_retry_count
			AND NEW.not_before = OLD.not_before
			AND NEW.last_error_code IS NULL
			AND NEW.next_attempt_at IS NULL
			AND NEW.locked_at IS NULL AND NEW.lease_owner IS NULL AND NEW.lease_until IS NULL
			AND EXISTS (
				SELECT 1 FROM telegram_delivery_attempts attempt
				WHERE attempt.outbox_id = OLD.id
					AND attempt.attempt_no = OLD.attempts + 1
					AND attempt.lease_owner = OLD.lease_owner
					AND attempt.state = 'delivered'
					AND attempt.provider_request_id = NEW.provider_request_id
					AND attempt.finished_at = NEW.sent_at
					AND NEW.updated_at = NEW.sent_at
			)
		)
		OR (
			OLD.status = 'processing' AND NEW.status = 'delivery_unknown'
			AND NEW.attempts = OLD.attempts + 1
			AND NEW.max_attempts = OLD.max_attempts
			AND NEW.manual_retry_count = OLD.manual_retry_count
			AND NEW.not_before = OLD.not_before
			AND NEW.last_error_code = 'TELEGRAM_DELIVERY_UNKNOWN'
			AND NEW.provider_request_id IS NULL AND NEW.sent_at IS NULL
			AND NEW.next_attempt_at IS NULL
			AND NEW.locked_at IS NULL AND NEW.lease_owner IS NULL AND NEW.lease_until IS NULL
			AND EXISTS (
				SELECT 1 FROM telegram_delivery_attempts attempt
				WHERE attempt.outbox_id = OLD.id
					AND attempt.attempt_no = OLD.attempts + 1
					AND attempt.lease_owner = OLD.lease_owner
					AND attempt.state = 'delivery_unknown'
					AND attempt.safe_error_code = 'TELEGRAM_DELIVERY_UNKNOWN'
					AND attempt.finished_at = NEW.updated_at
					AND attempt.resolved_at IS NULL
			)
		)
		OR (
			OLD.status = 'dead' AND NEW.status = 'retry'
			AND NEW.attempts = OLD.attempts
			AND NEW.max_attempts > OLD.attempts
			AND NEW.manual_retry_count = OLD.manual_retry_count + 1
			AND NEW.not_before = OLD.not_before
			AND NEW.next_attempt_at = NEW.updated_at
			AND NEW.last_error_code IS OLD.last_error_code
			AND NEW.provider_request_id IS OLD.provider_request_id
			AND NEW.sent_at IS OLD.sent_at
			AND NEW.locked_at IS NULL AND NEW.lease_owner IS NULL
			AND NEW.lease_until IS NULL
			AND EXISTS (
				SELECT 1 FROM outbox_admin_actions action
				JOIN audit_events audit ON audit.id = action.audit_event_id
				JOIN users actor ON actor.id = action.actor_user_id
				WHERE action.channel = 'telegram' AND action.outbox_id = OLD.id
					AND action.action = 'retry'
					AND action.status_before = 'dead'
					AND action.attempts_before = OLD.attempts
					AND action.max_attempts_before = OLD.max_attempts
					AND action.manual_retry_count_before = OLD.manual_retry_count
					AND action.updated_at_before = OLD.updated_at
					AND action.additional_attempts > 0
					AND NEW.max_attempts = OLD.attempts + action.additional_attempts
					AND action.created_at = NEW.updated_at
					AND audit.actor_user_id = action.actor_user_id
					AND audit.action = 'outbox.telegram.retry'
					AND audit.target_kind = 'outbox_event' AND audit.target_id = OLD.id
					AND audit.created_at = NEW.updated_at
					AND actor.role = 'admin' AND actor.account_status = 'active'
					AND actor.is_blocked = 0 AND actor.email_verified_at IS NOT NULL
					AND NOT EXISTS (SELECT 1 FROM outbox_action_assertions assertion
						WHERE assertion.action_id = action.id)
			)
		)
		OR (
			OLD.status = 'delivery_unknown'
			AND NEW.status IN ('sent', 'retry', 'cancelled')
			AND NEW.attempts = OLD.attempts
			AND NEW.not_before = OLD.not_before
			AND NEW.locked_at IS NULL AND NEW.lease_owner IS NULL
			AND NEW.lease_until IS NULL
			AND NEW.provider_request_id IS OLD.provider_request_id
			AND EXISTS (
				SELECT 1
				FROM telegram_delivery_attempts attempt
				JOIN telegram_delivery_resolutions resolution
					ON resolution.attempt_id = attempt.id
				JOIN audit_events audit ON audit.id = resolution.audit_event_id
				JOIN users actor ON actor.id = resolution.actor_user_id
				WHERE attempt.outbox_id = OLD.id
					AND attempt.attempt_no = OLD.attempts
					AND attempt.state = 'delivery_unknown'
					AND attempt.resolved_at IS NOT NULL
					AND attempt.resolution = CASE NEW.status
						WHEN 'sent' THEN 'confirm_sent'
						WHEN 'retry' THEN 'retry_after_review'
						ELSE 'cancel' END
					AND resolution.action = attempt.resolution
					AND audit.action = 'outbox.telegram.' || attempt.resolution
					AND resolution.created_at = NEW.updated_at
					AND audit.actor_user_id = resolution.actor_user_id
					AND audit.target_kind = 'outbox_event' AND audit.target_id = OLD.id
					AND audit.created_at = NEW.updated_at
					AND actor.role = 'admin' AND actor.account_status = 'active'
					AND actor.is_blocked = 0 AND actor.email_verified_at IS NOT NULL
					AND NOT EXISTS (
						SELECT 1 FROM telegram_delivery_resolution_assertions assertion
						WHERE assertion.resolution_id = resolution.id
					)
					AND (
						(NEW.status = 'sent'
							AND NEW.max_attempts = OLD.max_attempts
							AND NEW.manual_retry_count = OLD.manual_retry_count
							AND NEW.sent_at = NEW.updated_at
							AND NEW.last_error_code IS NULL
							AND NEW.next_attempt_at IS NULL
							AND resolution.additional_attempts = 0)
						OR (NEW.status = 'retry'
							AND NEW.max_attempts = MAX(OLD.max_attempts,
								OLD.attempts + resolution.additional_attempts)
							AND NEW.manual_retry_count = OLD.manual_retry_count + 1
							AND NEW.sent_at IS OLD.sent_at
							AND NEW.last_error_code IS NULL
							AND NEW.next_attempt_at = NEW.updated_at
							AND resolution.additional_attempts > 0)
						OR (NEW.status = 'cancelled'
							AND NEW.max_attempts = OLD.max_attempts
							AND NEW.manual_retry_count = OLD.manual_retry_count
							AND NEW.sent_at IS OLD.sent_at
							AND NEW.last_error_code IS NULL
							AND NEW.next_attempt_at IS NULL
							AND resolution.additional_attempts = 0)
					)
			)
		)
	);
END;

CREATE TRIGGER telegram_outbox_pending_retry_same_status_guard
BEFORE UPDATE ON telegram_outbox
WHEN OLD.status = NEW.status AND OLD.status IN ('pending', 'retry')
BEGIN
	SELECT RAISE(ABORT, 'invalid telegram outbox pending/retry update') WHERE NOT (
		NEW.attempts = OLD.attempts
		AND NEW.max_attempts = OLD.max_attempts
		AND NEW.manual_retry_count = OLD.manual_retry_count
		AND NEW.last_error_code IS OLD.last_error_code
		AND NEW.provider_request_id IS OLD.provider_request_id
		AND NEW.sent_at IS OLD.sent_at
		AND NEW.locked_at IS OLD.locked_at
		AND NEW.lease_owner IS OLD.lease_owner
		AND NEW.lease_until IS OLD.lease_until
		AND NEW.not_before >= OLD.not_before
		AND NEW.next_attempt_at IS NOT NULL
		AND (OLD.next_attempt_at IS NULL
			OR NEW.next_attempt_at >= OLD.next_attempt_at)
		AND NEW.updated_at >= OLD.updated_at
		AND (NEW.not_before > OLD.not_before
			OR OLD.next_attempt_at IS NULL
			OR NEW.next_attempt_at > OLD.next_attempt_at)
	);
END;

CREATE TRIGGER telegram_outbox_processing_reclaim_guard
BEFORE UPDATE ON telegram_outbox
WHEN OLD.status = 'processing' AND NEW.status = 'processing'
BEGIN
	SELECT RAISE(ABORT, 'invalid telegram outbox processing reclaim') WHERE NOT (
		OLD.lease_until IS NOT NULL AND OLD.lease_until <= NEW.locked_at
		AND NEW.locked_at IS NOT NULL AND NEW.updated_at = NEW.locked_at
		AND NEW.lease_owner IS NOT NULL AND length(NEW.lease_owner) BETWEEN 1 AND 200
		AND NEW.lease_until IS NOT NULL AND NEW.lease_until > NEW.locked_at
		AND NEW.attempts = OLD.attempts
		AND NEW.manual_retry_count = OLD.manual_retry_count
		AND NEW.not_before = OLD.not_before
		AND NEW.next_attempt_at IS OLD.next_attempt_at
		AND NEW.last_error_code IS OLD.last_error_code
		AND NEW.provider_request_id IS OLD.provider_request_id
		AND NEW.sent_at IS OLD.sent_at
		AND NOT (
			OLD.source_kind = 'support_thread'
			AND OLD.template_or_category = 'bureau.support'
			AND length(OLD.dedupe_key) = 124
			AND substr(OLD.dedupe_key, 1, 23) = 'telegram-preview-smoke:'
			AND substr(OLD.dedupe_key, 24, 64) NOT GLOB '*[^0-9a-f]*'
			AND substr(OLD.dedupe_key, 88, 1) = ':'
			AND OLD.source_id = substr(OLD.dedupe_key, 89, 36)
		)
		AND NEW.max_attempts = CASE
			WHEN OLD.manual_retry_count > 0 THEN MAX(
				OLD.max_attempts,
				COALESCE((SELECT policy.configured_max_attempts
					FROM telegram_destination_policies policy
					WHERE policy.destination_ref = OLD.destination_ref),
					OLD.max_attempts)
			)
			ELSE COALESCE((SELECT policy.configured_max_attempts
				FROM telegram_destination_policies policy
				WHERE policy.destination_ref = OLD.destination_ref),
				OLD.max_attempts)
		END
		AND NOT EXISTS (SELECT 1 FROM telegram_delivery_attempts attempt
			WHERE attempt.outbox_id = OLD.id AND attempt.state = 'dispatch_started')
		AND NOT EXISTS (
			SELECT 1 FROM telegram_destination_activation_floors floor
			WHERE floor.destination_ref = OLD.destination_ref
				AND OLD.created_at < floor.activation_at
		)
	);
END;

-- Restore the domain-event bridges dropped for the table rebuild. Keep these
-- definitions behaviorally identical to migration 0012; only the rebuilt
-- Telegram status constraint changes in this migration.
CREATE TRIGGER contract_outbox_to_common_transport
AFTER INSERT ON contract_outbox_events WHEN NEW.status = 'pending'
BEGIN
	INSERT OR IGNORE INTO email_outbox
		(id, source_kind, source_id, template_or_category, recipient_user_id,
		 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
		 status, attempts, max_attempts, created_at, updated_at)
	SELECT 'email:contract:' || NEW.id, NEW.source_kind, NEW.source_id,
		'contract.sent', offer.user_id, 'current', 'de',
		json_object('portalPath', '/contracts/' || offer.id,
			'contractNumber', COALESCE(offer.contract_number, offer.offer_number)),
		'email:' || NEW.dedupe_key, NEW.created_at, 'pending', 0, 5,
		NEW.created_at, NEW.created_at
	FROM contract_offers offer
	WHERE NEW.event_type = 'offer_available'
		AND json_extract(NEW.payload_json, '$.action') IS NULL
		AND offer.id = NEW.source_id;

	INSERT OR IGNORE INTO email_outbox
		(id, source_kind, source_id, template_or_category, recipient_user_id,
		 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
		 status, attempts, max_attempts, created_at, updated_at)
	SELECT 'email:contract:' || NEW.id, NEW.source_kind, NEW.source_id,
		'contract.accepted', offer.user_id, 'current', 'de',
		json_object('portalPath', '/contracts/' || offer.id),
		'email:' || NEW.dedupe_key, NEW.created_at, 'pending', 0, 5,
		NEW.created_at, NEW.created_at
	FROM contract_offers offer
	WHERE NEW.event_type = 'offer_available'
		AND json_extract(NEW.payload_json, '$.action') = 'accept'
		AND offer.id = NEW.source_id;

	INSERT OR IGNORE INTO email_outbox
		(id, source_kind, source_id, template_or_category, recipient_user_id,
		 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
		 status, attempts, max_attempts, created_at, updated_at)
	SELECT 'email:contract:' || NEW.id, NEW.source_kind, NEW.source_id,
		'contract.formed', contract.user_id, 'current', 'de',
		json_object('portalPath', '/contracts/' || contract.contract_offer_id,
			'contractNumber', contract.contract_number),
		'email:' || NEW.dedupe_key, NEW.created_at, 'pending', 0, 5,
		NEW.created_at, NEW.created_at
	FROM contracts contract
	WHERE NEW.event_type = 'contract_formed' AND contract.id = NEW.source_id;

	INSERT OR IGNORE INTO email_outbox
		(id, source_kind, source_id, template_or_category, recipient_user_id,
		 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
		 status, attempts, max_attempts, created_at, updated_at)
	SELECT 'email:contract:' || NEW.id, NEW.source_kind, NEW.source_id,
		'contract.termination.received', contract.user_id, 'current', 'de',
		json_object('portalPath', '/contracts/' || contract.contract_offer_id,
			'reference', request.id, 'kind', request.kind,
			'receivedAt', request.received_at),
		'email:' || NEW.dedupe_key, NEW.created_at, 'pending', 0, 5,
		NEW.created_at, NEW.created_at
	FROM contract_end_requests request
	JOIN contracts contract ON contract.id = request.contract_id
	WHERE NEW.event_type = 'termination_received' AND request.id = NEW.source_id;

	INSERT OR IGNORE INTO email_outbox
		(id, source_kind, source_id, template_or_category, recipient_user_id,
		 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
		 status, attempts, max_attempts, created_at, updated_at)
	SELECT 'email:contract:' || NEW.id, NEW.source_kind, NEW.source_id,
		'contract.attendance.received', contract.user_id, 'current', 'de',
		json_object('portalPath', '/contracts/' || contract.contract_offer_id,
			'reference', notice.id, 'receivedAt', notice.received_at),
		'email:' || NEW.dedupe_key, NEW.created_at, 'pending', 0, 5,
		NEW.created_at, NEW.created_at
	FROM service_attendance_notices notice
	JOIN contracts contract ON contract.id = notice.contract_id
	WHERE NEW.event_type = 'attendance_ceased' AND notice.id = NEW.source_id;

	INSERT OR IGNORE INTO email_outbox
		(id, source_kind, source_id, template_or_category, recipient_user_id,
		 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
		 status, attempts, max_attempts, created_at, updated_at)
	SELECT 'email:contract:' || NEW.id, NEW.source_kind, NEW.source_id,
		'media.withdrawal.confirmation', consent.user_id, 'current', 'de',
		json_object('childName', child.full_name,
			'captureScopes', json(consent.capture_scopes_json),
			'publicationChannels', json(consent.publication_channels_json),
			'sourceChannel', consent.decision_source,
			'receivedAt', consent.received_at),
		'email:' || NEW.dedupe_key, NEW.created_at, 'pending', 0, 5,
		NEW.created_at, NEW.created_at
	FROM media_consents consent JOIN children child ON child.id = consent.child_id
	WHERE NEW.event_type = 'media_withdrawn' AND consent.id = NEW.source_id;

	INSERT OR IGNORE INTO telegram_outbox
		(id, source_kind, source_id, template_or_category, destination_ref,
		 locale, payload_json, dedupe_key, not_before, status, attempts,
		 max_attempts, created_at, updated_at)
	SELECT 'telegram:contract:' || NEW.id, NEW.source_kind, NEW.source_id,
		'bureau.contract_signal', 'bureau', 'de',
		json_object('category', 'contract', 'reference', NEW.source_id,
			'receivedAt', NEW.created_at, 'adminPath', '/admin/contracts'),
		'telegram:' || NEW.dedupe_key, NEW.created_at, 'pending', 0, 5,
		NEW.created_at, NEW.created_at
	WHERE NEW.event_type = 'offer_declined'
		OR (NEW.event_type = 'offer_available'
			AND json_extract(NEW.payload_json, '$.action') = 'accept');

	UPDATE contract_outbox_events SET status = 'consumed' WHERE id = NEW.id
		AND (EXISTS (SELECT 1 FROM email_outbox WHERE id = 'email:contract:' || NEW.id)
			OR EXISTS (SELECT 1 FROM telegram_outbox
				WHERE id = 'telegram:contract:' || NEW.id));
END;

CREATE TRIGGER price_review_outbox_to_common_transport
AFTER INSERT ON price_review_outbox_events WHEN NEW.status = 'pending'
BEGIN
	INSERT OR IGNORE INTO email_outbox
		(id, source_kind, source_id, template_or_category, recipient_user_id,
		 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
		 status, attempts, max_attempts, created_at, updated_at)
	SELECT 'email:price-review:' || NEW.id, NEW.source_kind, NEW.source_id,
		'price_review.item_available', item.user_id, 'current', 'de',
		json_object('portalPath', '/price-reviews/' || item.public_reference,
			'oldPriceCents', item.old_price_cents,
			'newPriceCents', item.new_final_price_cents,
			'responseDeadline', json_extract(NEW.payload_json, '$.responseDeadline')),
		'email:' || NEW.dedupe_key, NEW.created_at, 'pending', 0, 5,
		NEW.created_at, NEW.created_at
	FROM price_review_items item
	WHERE NEW.event_type = 'item_available' AND item.id = NEW.source_id
		AND item.status IN ('notification_approved', 'sent')
		AND item.user_id = NEW.recipient_user_id;

	INSERT OR IGNORE INTO email_outbox
		(id, source_kind, source_id, template_or_category, recipient_user_id,
		 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
		 status, attempts, max_attempts, created_at, updated_at)
	SELECT 'email:price-review:' || NEW.id, NEW.source_kind, NEW.source_id,
		'price_review.applied', item.user_id, 'current', 'de',
		json_object('portalPath', '/price-reviews/' || item.public_reference,
			'newPriceCents', item.new_final_price_cents,
			'effectiveFrom', item.scheduled_for),
		'email:' || NEW.dedupe_key, NEW.created_at, 'pending', 0, 5,
		NEW.created_at, NEW.created_at
	FROM price_review_items item
	WHERE NEW.event_type = 'item_applied' AND item.id = NEW.source_id
		AND item.status = 'applied' AND item.user_id = NEW.recipient_user_id;

	INSERT OR IGNORE INTO telegram_outbox
		(id, source_kind, source_id, template_or_category, destination_ref,
		 locale, payload_json, dedupe_key, not_before, status, attempts,
		 max_attempts, created_at, updated_at)
	SELECT 'telegram:price-review:' || NEW.id, NEW.source_kind, NEW.source_id,
		'bureau.price_review_signal', 'bureau', 'de',
		json_object('category', 'price_review', 'reference', NEW.source_id,
			'receivedAt', NEW.created_at, 'adminPath', '/admin/price-reviews'),
		'telegram:' || NEW.dedupe_key, NEW.created_at, 'pending', 0, 5,
		NEW.created_at, NEW.created_at
	WHERE NEW.event_type IN ('parent_accepted', 'parent_declined', 'response_overdue');

	UPDATE price_review_outbox_events SET status = 'consumed' WHERE id = NEW.id
		AND (EXISTS (SELECT 1 FROM email_outbox
			WHERE id = 'email:price-review:' || NEW.id)
			OR EXISTS (SELECT 1 FROM telegram_outbox
				WHERE id = 'telegram:price-review:' || NEW.id));
END;

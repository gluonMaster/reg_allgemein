PRAGMA foreign_keys = ON;

CREATE TABLE trial_intake_requests (
 id TEXT PRIMARY KEY NOT NULL,
 idempotency_key TEXT NOT NULL UNIQUE,
 payload_hash TEXT NOT NULL,
 parent_first_name TEXT NOT NULL,
 parent_last_name TEXT NOT NULL,
 parent_last_name_search TEXT NOT NULL,
 email TEXT NOT NULL,
 phone TEXT NOT NULL,
 locale TEXT NOT NULL CHECK(locale IN ('de','ru')),
 privacy_version TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending_email' CHECK(state IN ('pending_email','verified','processed')),
 receipt_nonce TEXT NOT NULL,
 verification_version INTEGER NOT NULL CHECK(verification_version > 0),
 verification_nonce TEXT NOT NULL,
 verification_hash TEXT NOT NULL UNIQUE,
 verification_expires_at TEXT NOT NULL,
 last_email_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 pending_expires_at TEXT NOT NULL,
 verified_at TEXT,
 processed_at TEXT,
 delete_after TEXT,
 CHECK((state = 'pending_email' AND verified_at IS NULL AND processed_at IS NULL AND delete_after IS NULL)
 OR (state = 'verified' AND verified_at IS NOT NULL AND processed_at IS NULL AND delete_after IS NULL)
 OR (state = 'processed' AND verified_at IS NOT NULL AND processed_at IS NOT NULL AND delete_after IS NOT NULL))
);
CREATE INDEX trial_intake_pending_retention ON trial_intake_requests(state, pending_expires_at);
CREATE INDEX trial_intake_processed_retention ON trial_intake_requests(state, delete_after);
CREATE INDEX trial_intake_received ON trial_intake_requests(state, verified_at, id);
CREATE TABLE trial_intake_children (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL REFERENCES trial_intake_requests(id) ON DELETE CASCADE,
 position INTEGER NOT NULL,
 first_name TEXT NOT NULL, last_name TEXT NOT NULL, last_name_search TEXT NOT NULL,
 birth_date TEXT NOT NULL,
 UNIQUE(request_id, id), UNIQUE(request_id, position)
);
CREATE TABLE trial_intake_items (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL REFERENCES trial_intake_requests(id) ON DELETE CASCADE,
 position INTEGER NOT NULL,
 lesson_id TEXT NOT NULL, desired_date TEXT NOT NULL,
 subject TEXT NOT NULL, group_name TEXT NOT NULL,
 weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),
 start_time TEXT NOT NULL, end_time TEXT NOT NULL,
 teacher TEXT NOT NULL, room TEXT NOT NULL,
 building TEXT NOT NULL CHECK(building IN ('Kolibri','Villa')),
 UNIQUE(request_id, id), UNIQUE(request_id, lesson_id), UNIQUE(request_id, position)
);
CREATE INDEX trial_intake_item_filters ON trial_intake_items(subject, teacher, weekday, building);
CREATE TABLE trial_intake_item_children (
 request_id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 child_id TEXT NOT NULL,
 PRIMARY KEY(item_id, child_id),
 FOREIGN KEY(request_id, item_id) REFERENCES trial_intake_items(request_id, id) ON DELETE CASCADE,
 FOREIGN KEY(request_id, child_id) REFERENCES trial_intake_children(request_id, id) ON DELETE CASCADE
);
CREATE TABLE trial_intake_email_outbox (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL REFERENCES trial_intake_requests(id) ON DELETE CASCADE,
 verification_version INTEGER NOT NULL,
 dedupe_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','retry','sent','dead','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,
 max_attempts INTEGER NOT NULL DEFAULT 5,
 next_attempt_at TEXT,
 lease_owner TEXT, lease_until TEXT,
 provider_request_id TEXT, last_error_code TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sent_at TEXT,
 UNIQUE(request_id, verification_version)
);
CREATE INDEX trial_intake_email_queue ON trial_intake_email_outbox(status, next_attempt_at, created_at);
-- PII is deletable; the shared append-only delivery ledger retains only this opaque ID.
CREATE TABLE trial_intake_telegram_payloads (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL REFERENCES trial_intake_requests(id) ON DELETE CASCADE,
 part INTEGER NOT NULL, total INTEGER NOT NULL,
 body TEXT NOT NULL,
 UNIQUE(request_id, part)
);
-- A deleted request may never be dispatched again, including manual retries.
CREATE TRIGGER trial_intake_telegram_dispatch_live
BEFORE INSERT ON telegram_delivery_attempts
WHEN EXISTS(SELECT 1 FROM telegram_outbox o WHERE o.id = NEW.outbox_id AND o.source_kind = 'trial_intake')
BEGIN
 SELECT RAISE(ABORT, 'intake payload unavailable') WHERE NOT EXISTS (
  SELECT 1 FROM telegram_outbox o JOIN trial_intake_telegram_payloads p ON p.id = json_extract(o.payload_json, '$.payloadId')
  JOIN trial_intake_requests r ON r.id = p.request_id
  WHERE o.id = NEW.outbox_id AND r.state IN ('verified','processed')
   AND (r.delete_after IS NULL OR r.delete_after > NEW.started_at)
 );
END;

-- Preserve every existing transition guard verbatim and add only audited intake TTL cancellation.
DROP TRIGGER telegram_outbox_allowed_transition;
CREATE TRIGGER telegram_outbox_allowed_transition
BEFORE UPDATE OF status ON telegram_outbox WHEN NEW.status <> OLD.status
BEGIN
	SELECT RAISE(ABORT, 'invalid telegram outbox transition') WHERE NOT (
        (
            OLD.source_kind = 'trial_intake' AND OLD.template_or_category = 'bureau.trial_intake'
            AND OLD.status IN ('pending', 'retry') AND NEW.status = 'cancelled'
            AND NEW.attempts = OLD.attempts AND NEW.max_attempts = OLD.max_attempts
            AND NEW.manual_retry_count = OLD.manual_retry_count AND NEW.not_before = OLD.not_before
            AND NEW.next_attempt_at IS NULL AND NEW.last_error_code IS OLD.last_error_code
            AND NEW.provider_request_id IS OLD.provider_request_id AND NEW.sent_at IS OLD.sent_at
            AND NEW.locked_at IS NULL AND NEW.lease_owner IS NULL AND NEW.lease_until IS NULL
            AND EXISTS(SELECT 1 FROM trial_intake_requests r WHERE r.id = OLD.source_id
                AND ((r.state = 'pending_email' AND r.pending_expires_at <= NEW.updated_at)
                 OR (r.state = 'processed' AND r.delete_after <= NEW.updated_at)))
            AND EXISTS(SELECT 1 FROM audit_events a WHERE a.actor_kind = 'system'
                AND a.action = 'trial_intake.retention_deleted' AND a.target_kind = 'trial_intake'
                AND a.target_id = OLD.source_id AND a.created_at = NEW.updated_at)
        ) OR
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

CREATE TRIGGER trial_intake_delete_inflight_guard
BEFORE DELETE ON trial_intake_requests
BEGIN
 SELECT RAISE(ABORT, 'intake delivery in flight') WHERE
 EXISTS(SELECT 1 FROM trial_intake_email_outbox WHERE request_id = OLD.id AND status IN ('pending','retry','processing'))
 OR EXISTS(SELECT 1 FROM telegram_outbox WHERE source_kind = 'trial_intake' AND source_id = OLD.id AND status IN ('pending','retry','processing'));
END;

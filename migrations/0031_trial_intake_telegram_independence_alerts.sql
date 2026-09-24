PRAGMA foreign_keys = ON;

-- Owner decision 2026-09-24: a trial-intake notification waits only for an unresolved
-- ambiguity of its own request. An ambiguity of any other message, including another source,
-- no longer holds it back; every other source keeps the destination-wide block. Every other
-- transition guard is copied verbatim from 0030; only that NOT EXISTS changes.
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
					AND NOT (OLD.source_kind = 'trial_intake'
						AND (unresolved.source_kind <> 'trial_intake'
							OR unresolved.source_id <> OLD.source_id))
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

-- The bureau learns about new requests from Telegram. When a request notification is not
-- confirmed (delivery_unknown) or refused (dead), one e-mail to the bureau mailbox says so.
-- It carries only the delivery reference, the error code and admin links, never request data.
-- The row keeps no personal data either, so retention does not touch it.
CREATE TABLE trial_intake_telegram_alerts (
 id TEXT PRIMARY KEY NOT NULL,
 telegram_outbox_id TEXT NOT NULL REFERENCES telegram_outbox(id),
 reason TEXT NOT NULL CHECK(reason IN ('delivery_unknown','dead')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','retry','sent','dead','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,
 max_attempts INTEGER NOT NULL DEFAULT 5,
 next_attempt_at TEXT,
 lease_owner TEXT, lease_until TEXT,
 provider_request_id TEXT, last_error_code TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sent_at TEXT
);
CREATE INDEX trial_intake_telegram_alert_queue ON trial_intake_telegram_alerts(status, next_attempt_at, created_at);
-- Every path into these states queues the alert in the same statement: the worker, stale
-- dispatch reconciliation and retries that exhaust their attempts. A later failure of the same
-- notification after an admin retry has more attempts and therefore gets its own alert.
CREATE TRIGGER trial_intake_telegram_alert_enqueue
AFTER UPDATE OF status ON telegram_outbox
WHEN NEW.source_kind = 'trial_intake' AND NEW.status IN ('delivery_unknown','dead')
 AND OLD.status <> NEW.status
BEGIN
 INSERT OR IGNORE INTO trial_intake_telegram_alerts(id, telegram_outbox_id, reason, created_at, updated_at)
 VALUES ('intake-alert:' || NEW.id || ':' || NEW.attempts || ':' || NEW.status, NEW.id, NEW.status,
  NEW.updated_at, NEW.updated_at);
END;

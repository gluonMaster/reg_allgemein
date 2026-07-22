PRAGMA foreign_keys = ON;

-- The stage-05/06 email outbox is the common email transport boundary. Stage 11
-- extends it with explicit leases and auditable manual recovery without changing
-- any existing dedupe identity or copying recipient addresses into payloads.
ALTER TABLE email_outbox ADD COLUMN lease_owner TEXT;
ALTER TABLE email_outbox ADD COLUMN lease_until TEXT;
ALTER TABLE email_outbox ADD COLUMN manual_retry_count INTEGER NOT NULL DEFAULT 0
	CHECK (manual_retry_count >= 0);
ALTER TABLE email_outbox ADD COLUMN updated_at TEXT;

UPDATE email_outbox SET updated_at = created_at WHERE updated_at IS NULL;

-- A lease owner cannot be reconstructed for rows that were locked by the old
-- worker. Return them to a recoverable terminal/queue state before enabling the
-- leased state machine.
UPDATE email_outbox SET
	status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'retry' END,
	locked_at = NULL,
	next_attempt_at = CASE WHEN attempts >= max_attempts THEN NULL ELSE created_at END,
	lease_owner = NULL,
	lease_until = NULL,
	updated_at = created_at
WHERE status = 'processing';

CREATE INDEX email_outbox_lease_queue
	ON email_outbox (status, not_before, next_attempt_at, lease_until, created_at);

CREATE TRIGGER email_outbox_fill_updated_at
AFTER INSERT ON email_outbox WHEN NEW.updated_at IS NULL
BEGIN
	UPDATE email_outbox SET updated_at = NEW.created_at WHERE id = NEW.id;
END;

CREATE TRIGGER email_outbox_allowed_transition
BEFORE UPDATE OF status ON email_outbox WHEN NEW.status <> OLD.status
BEGIN
	SELECT RAISE(ABORT, 'invalid email outbox transition') WHERE NOT (
		(OLD.status IN ('pending', 'retry') AND NEW.status IN ('processing', 'cancelled'))
		OR (OLD.status = 'processing' AND NEW.status IN ('sent', 'retry', 'dead'))
		OR (OLD.status = 'dead' AND NEW.status = 'retry')
	);
END;

CREATE TABLE telegram_outbox (
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
		CHECK (status IN ('pending', 'processing', 'retry', 'sent', 'dead', 'cancelled')),
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

CREATE INDEX telegram_outbox_lease_queue
	ON telegram_outbox (status, not_before, next_attempt_at, lease_until, created_at);

CREATE INDEX telegram_outbox_source
	ON telegram_outbox (source_kind, source_id);

CREATE TRIGGER telegram_outbox_allowed_transition
BEFORE UPDATE OF status ON telegram_outbox WHEN NEW.status <> OLD.status
BEGIN
	SELECT RAISE(ABORT, 'invalid telegram outbox transition') WHERE NOT (
		(OLD.status IN ('pending', 'retry') AND NEW.status IN ('processing', 'cancelled'))
		OR (OLD.status = 'processing' AND NEW.status IN ('sent', 'retry', 'dead'))
		OR (OLD.status = 'dead' AND NEW.status = 'retry')
	);
END;

CREATE TABLE support_threads (
	id TEXT PRIMARY KEY NOT NULL,
	public_reference TEXT NOT NULL UNIQUE,
	user_id TEXT NOT NULL REFERENCES users(id),
	category TEXT NOT NULL CHECK (category IN (
		'absence', 'technical', 'contract', 'payment', 'schedule', 'nachhilfe', 'other'
	)),
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
		'open', 'waiting_for_admin', 'waiting_for_parent', 'answered', 'closed'
	)),
	subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 160),
	previous_thread_id TEXT REFERENCES support_threads(id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	closed_at TEXT,
	CHECK ((status = 'closed' AND closed_at IS NOT NULL)
		OR (status <> 'closed' AND closed_at IS NULL))
);

CREATE INDEX support_threads_owner
	ON support_threads (user_id, status, updated_at DESC);

CREATE INDEX support_threads_admin_queue
	ON support_threads (status, category, updated_at);

CREATE TABLE support_messages (
	id TEXT PRIMARY KEY NOT NULL,
	thread_id TEXT NOT NULL REFERENCES support_threads(id),
	sender_kind TEXT NOT NULL CHECK (sender_kind IN ('parent', 'admin', 'system')),
	sender_user_id TEXT REFERENCES users(id),
	body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
	created_at TEXT NOT NULL,
	CHECK ((sender_kind = 'system' AND sender_user_id IS NULL)
		OR (sender_kind <> 'system' AND sender_user_id IS NOT NULL))
);

CREATE INDEX support_messages_thread
	ON support_messages (thread_id, created_at, id);

CREATE TABLE absence_reports (
	id TEXT PRIMARY KEY NOT NULL,
	thread_id TEXT NOT NULL UNIQUE REFERENCES support_threads(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	child_id TEXT NOT NULL REFERENCES children(id),
	enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
	absence_date TEXT NOT NULL CHECK (
		length(absence_date) = 10
		AND absence_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
	),
	reason_code TEXT NOT NULL DEFAULT 'parent_provided'
		CHECK (reason_code = 'parent_provided'),
	reason_text TEXT NOT NULL CHECK (length(reason_text) BETWEEN 1 AND 500),
	message_id TEXT NOT NULL UNIQUE REFERENCES support_messages(id),
	created_at TEXT NOT NULL,
	UNIQUE (user_id, enrollment_id, absence_date, message_id)
);

CREATE INDEX absence_reports_owner_date
	ON absence_reports (user_id, absence_date, created_at);

CREATE TABLE support_actions (
	id TEXT PRIMARY KEY NOT NULL,
	thread_id TEXT NOT NULL REFERENCES support_threads(id),
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	action TEXT NOT NULL CHECK (action IN (
		'create', 'absence_create', 'parent_message', 'admin_reply',
		'parent_close', 'admin_close'
	)),
	idempotency_key TEXT NOT NULL,
	request_hash_sha256 TEXT NOT NULL CHECK (
		length(request_hash_sha256) = 64
		AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'
	),
	result_ref TEXT NOT NULL,
	audit_event_id TEXT REFERENCES audit_events(id),
	created_at TEXT NOT NULL,
	UNIQUE (actor_user_id, idempotency_key)
);

CREATE TABLE support_action_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	action_id TEXT NOT NULL UNIQUE REFERENCES support_actions(id),
	thread_id TEXT NOT NULL REFERENCES support_threads(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TABLE outbox_admin_actions (
	id TEXT PRIMARY KEY NOT NULL,
	channel TEXT NOT NULL CHECK (channel IN ('email', 'telegram')),
	outbox_id TEXT NOT NULL,
	action TEXT NOT NULL CHECK (action IN ('retry', 'cancel')),
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	idempotency_key TEXT NOT NULL,
	request_hash_sha256 TEXT NOT NULL CHECK (
		length(request_hash_sha256) = 64
		AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'
	),
	result_ref TEXT NOT NULL,
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	created_at TEXT NOT NULL,
	UNIQUE (actor_user_id, idempotency_key)
);

CREATE TABLE outbox_action_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	action_id TEXT NOT NULL UNIQUE REFERENCES outbox_admin_actions(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TRIGGER support_threads_allowed_transition
BEFORE UPDATE OF status ON support_threads WHEN NEW.status <> OLD.status
BEGIN
	SELECT RAISE(ABORT, 'invalid support thread transition') WHERE NOT (
		(OLD.status = 'open' AND NEW.status IN ('waiting_for_admin', 'closed'))
		OR (OLD.status = 'waiting_for_admin'
			AND NEW.status IN ('waiting_for_parent', 'answered', 'closed'))
		OR (OLD.status IN ('waiting_for_parent', 'answered')
			AND NEW.status IN ('waiting_for_admin', 'closed'))
	);
END;

CREATE TRIGGER support_messages_immutable_update
BEFORE UPDATE ON support_messages
BEGIN SELECT RAISE(ABORT, 'support message is immutable'); END;

CREATE TRIGGER support_messages_immutable_delete
BEFORE DELETE ON support_messages
BEGIN SELECT RAISE(ABORT, 'support message is immutable'); END;

CREATE TRIGGER absence_reports_immutable_update
BEFORE UPDATE ON absence_reports
BEGIN SELECT RAISE(ABORT, 'absence report is immutable'); END;

CREATE TRIGGER absence_reports_immutable_delete
BEFORE DELETE ON absence_reports
BEGIN SELECT RAISE(ABORT, 'absence report is immutable'); END;

CREATE TRIGGER support_actions_immutable_update
BEFORE UPDATE ON support_actions
BEGIN SELECT RAISE(ABORT, 'support action is immutable'); END;

CREATE TRIGGER support_actions_immutable_delete
BEFORE DELETE ON support_actions
BEGIN SELECT RAISE(ABORT, 'support action is immutable'); END;

-- Existing typed contract events remain domain evidence.  A trigger consumes
-- each new event into exactly one transport channel under a channel-scoped key.
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

-- Parent-facing lifecycle notifications use the same common email queue.  The
-- transition and the outbox insert are one SQLite/D1 transaction even when the
-- application performs the transition inside a larger D1 batch.
CREATE TRIGGER trial_requested_email_outbox
AFTER INSERT ON trial_bookings WHEN NEW.status = 'requested'
BEGIN
	INSERT OR IGNORE INTO email_outbox
		(id, source_kind, source_id, template_or_category, recipient_user_id,
		 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
		 status, attempts, max_attempts, created_at, updated_at)
	VALUES ('email:trial:received:' || NEW.id, 'trial_booking', NEW.id,
		'trial.received', NEW.user_id, 'current', 'de',
		json_object('portalPath', '/cabinet#trials', 'requestedDate', NEW.requested_date),
		'trial:received:' || NEW.id, NEW.created_at, 'pending', 0, 5,
		NEW.created_at, NEW.created_at);
END;

CREATE TRIGGER trial_decision_email_outbox
AFTER UPDATE OF status ON trial_bookings
WHEN NEW.status <> OLD.status AND NEW.status IN ('confirmed', 'rejected')
BEGIN
	INSERT OR IGNORE INTO email_outbox
		(id, source_kind, source_id, template_or_category, recipient_user_id,
		 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
		 status, attempts, max_attempts, created_at, updated_at)
	VALUES ('email:trial:' || NEW.status || ':' || NEW.id, 'trial_booking', NEW.id,
		CASE NEW.status WHEN 'confirmed' THEN 'trial.confirmed' ELSE 'trial.rejected' END,
		NEW.user_id, 'current', 'de',
		json_object('portalPath', '/cabinet#trials',
			'confirmedDate', NEW.confirmed_date),
		'trial:' || NEW.status || ':' || NEW.id, NEW.updated_at, 'pending', 0, 5,
		NEW.updated_at, NEW.updated_at);
END;

CREATE TRIGGER request_status_email_outbox
AFTER UPDATE OF status ON individual_requests
WHEN NEW.status <> OLD.status AND NEW.status IN (
	'submitted', 'needs_documents', 'needs_info', 'approved', 'rejected'
)
BEGIN
	INSERT OR IGNORE INTO email_outbox
		(id, source_kind, source_id, template_or_category, recipient_user_id,
		 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
		 status, attempts, max_attempts, created_at, updated_at)
	VALUES ('email:request:' || NEW.status || ':' || NEW.id,
		'individual_request', NEW.id,
		CASE
			WHEN NEW.status = 'submitted' THEN 'request.received'
			WHEN NEW.status IN ('needs_documents', 'needs_info') THEN 'request.needs_info'
			ELSE 'request.decision'
		END,
		NEW.user_id, 'current', 'de',
		json_object('portalPath', '/requests/' || NEW.id, 'status', NEW.status),
		'request:' || NEW.status || ':' || NEW.id, NEW.updated_at, 'pending', 0, 5,
		NEW.updated_at, NEW.updated_at);
END;

-- Backfill pre-stage-11 pending typed events. A pending -> pending trigger
-- replay is intentionally not used; explicit inserts keep migration behavior
-- deterministic and preserve the original event/dedupe identities.
INSERT OR IGNORE INTO email_outbox
	(id, source_kind, source_id, template_or_category, recipient_user_id,
	 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
	 status, attempts, max_attempts, created_at, updated_at)
SELECT 'email:contract:' || event.id, event.source_kind, event.source_id,
	'contract.sent', offer.user_id, 'current', 'de',
	json_object('portalPath', '/contracts/' || offer.id,
		'contractNumber', COALESCE(offer.contract_number, offer.offer_number)),
	'email:' || event.dedupe_key, event.created_at, 'pending', 0, 5,
	event.created_at, event.created_at
FROM contract_outbox_events event JOIN contract_offers offer ON offer.id = event.source_id
WHERE event.status = 'pending' AND event.event_type = 'offer_available'
	AND json_extract(event.payload_json, '$.action') IS NULL;

INSERT OR IGNORE INTO email_outbox
	(id, source_kind, source_id, template_or_category, recipient_user_id,
	 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
	 status, attempts, max_attempts, created_at, updated_at)
SELECT 'email:contract:' || event.id, event.source_kind, event.source_id,
	'contract.accepted', offer.user_id, 'current', 'de',
	json_object('portalPath', '/contracts/' || offer.id),
	'email:' || event.dedupe_key, event.created_at, 'pending', 0, 5,
	event.created_at, event.created_at
FROM contract_outbox_events event JOIN contract_offers offer ON offer.id = event.source_id
WHERE event.status = 'pending' AND event.event_type = 'offer_available'
	AND json_extract(event.payload_json, '$.action') = 'accept';

INSERT OR IGNORE INTO email_outbox
	(id, source_kind, source_id, template_or_category, recipient_user_id,
	 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
	 status, attempts, max_attempts, created_at, updated_at)
SELECT 'email:contract:' || event.id, event.source_kind, event.source_id,
	'contract.formed', contract.user_id, 'current', 'de',
	json_object('portalPath', '/contracts/' || contract.contract_offer_id,
		'contractNumber', contract.contract_number),
	'email:' || event.dedupe_key, event.created_at, 'pending', 0, 5,
	event.created_at, event.created_at
FROM contract_outbox_events event JOIN contracts contract ON contract.id = event.source_id
WHERE event.status = 'pending' AND event.event_type = 'contract_formed';

INSERT OR IGNORE INTO email_outbox
	(id, source_kind, source_id, template_or_category, recipient_user_id,
	 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
	 status, attempts, max_attempts, created_at, updated_at)
SELECT 'email:contract:' || event.id, event.source_kind, event.source_id,
	'contract.termination.received', contract.user_id, 'current', 'de',
	json_object('portalPath', '/contracts/' || contract.contract_offer_id,
		'reference', request.id, 'kind', request.kind, 'receivedAt', request.received_at),
	'email:' || event.dedupe_key, event.created_at, 'pending', 0, 5,
	event.created_at, event.created_at
FROM contract_outbox_events event
JOIN contract_end_requests request ON request.id = event.source_id
JOIN contracts contract ON contract.id = request.contract_id
WHERE event.status = 'pending' AND event.event_type = 'termination_received';

INSERT OR IGNORE INTO email_outbox
	(id, source_kind, source_id, template_or_category, recipient_user_id,
	 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
	 status, attempts, max_attempts, created_at, updated_at)
SELECT 'email:contract:' || event.id, event.source_kind, event.source_id,
	'contract.attendance.received', contract.user_id, 'current', 'de',
	json_object('portalPath', '/contracts/' || contract.contract_offer_id,
		'reference', notice.id, 'receivedAt', notice.received_at),
	'email:' || event.dedupe_key, event.created_at, 'pending', 0, 5,
	event.created_at, event.created_at
FROM contract_outbox_events event
JOIN service_attendance_notices notice ON notice.id = event.source_id
JOIN contracts contract ON contract.id = notice.contract_id
WHERE event.status = 'pending' AND event.event_type = 'attendance_ceased';

INSERT OR IGNORE INTO email_outbox
	(id, source_kind, source_id, template_or_category, recipient_user_id,
	 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
	 status, attempts, max_attempts, created_at, updated_at)
SELECT 'email:contract:' || event.id, event.source_kind, event.source_id,
	'media.withdrawal.confirmation', consent.user_id, 'current', 'de',
	json_object('childName', child.full_name,
		'captureScopes', json(consent.capture_scopes_json),
		'publicationChannels', json(consent.publication_channels_json),
		'sourceChannel', consent.decision_source, 'receivedAt', consent.received_at),
	'email:' || event.dedupe_key, event.created_at, 'pending', 0, 5,
	event.created_at, event.created_at
FROM contract_outbox_events event
JOIN media_consents consent ON consent.id = event.source_id
JOIN children child ON child.id = consent.child_id
WHERE event.status = 'pending' AND event.event_type = 'media_withdrawn';

INSERT OR IGNORE INTO telegram_outbox
	(id, source_kind, source_id, template_or_category, destination_ref,
	 locale, payload_json, dedupe_key, not_before, status, attempts,
	 max_attempts, created_at, updated_at)
SELECT 'telegram:contract:' || event.id, event.source_kind, event.source_id,
	'bureau.contract_signal', 'bureau', 'de',
	json_object('category', 'contract', 'reference', event.source_id,
		'receivedAt', event.created_at, 'adminPath', '/admin/contracts'),
	'telegram:' || event.dedupe_key, event.created_at, 'pending', 0, 5,
	event.created_at, event.created_at
FROM contract_outbox_events event
WHERE event.status = 'pending' AND (event.event_type = 'offer_declined'
	OR (event.event_type = 'offer_available'
		AND json_extract(event.payload_json, '$.action') = 'accept'));

UPDATE contract_outbox_events SET status = 'consumed' WHERE status = 'pending'
	AND (EXISTS (SELECT 1 FROM email_outbox
		WHERE id = 'email:contract:' || contract_outbox_events.id)
		OR EXISTS (SELECT 1 FROM telegram_outbox
			WHERE id = 'telegram:contract:' || contract_outbox_events.id));

INSERT OR IGNORE INTO email_outbox
	(id, source_kind, source_id, template_or_category, recipient_user_id,
	 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
	 status, attempts, max_attempts, created_at, updated_at)
SELECT 'email:price-review:' || event.id, event.source_kind, event.source_id,
	'price_review.item_available', item.user_id, 'current', 'de',
	json_object('portalPath', '/price-reviews/' || item.public_reference,
		'oldPriceCents', item.old_price_cents, 'newPriceCents', item.new_final_price_cents,
		'responseDeadline', item.response_deadline),
	'email:' || event.dedupe_key, event.created_at, 'pending', 0, 5,
	event.created_at, event.created_at
FROM price_review_outbox_events event
JOIN price_review_items item ON item.id = event.source_id
WHERE event.status = 'pending' AND event.event_type = 'item_available'
	AND item.status IN ('notification_approved', 'sent');

INSERT OR IGNORE INTO email_outbox
	(id, source_kind, source_id, template_or_category, recipient_user_id,
	 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
	 status, attempts, max_attempts, created_at, updated_at)
SELECT 'email:price-review:' || event.id, event.source_kind, event.source_id,
	'price_review.applied', item.user_id, 'current', 'de',
	json_object('portalPath', '/price-reviews/' || item.public_reference,
		'newPriceCents', item.new_final_price_cents, 'effectiveFrom', item.scheduled_for),
	'email:' || event.dedupe_key, event.created_at, 'pending', 0, 5,
	event.created_at, event.created_at
FROM price_review_outbox_events event
JOIN price_review_items item ON item.id = event.source_id
WHERE event.status = 'pending' AND event.event_type = 'item_applied'
	AND item.status = 'applied';

INSERT OR IGNORE INTO telegram_outbox
	(id, source_kind, source_id, template_or_category, destination_ref,
	 locale, payload_json, dedupe_key, not_before, status, attempts,
	 max_attempts, created_at, updated_at)
SELECT 'telegram:price-review:' || event.id, event.source_kind, event.source_id,
	'bureau.price_review_signal', 'bureau', 'de',
	json_object('category', 'price_review', 'reference', event.source_id,
		'receivedAt', event.created_at, 'adminPath', '/admin/price-reviews'),
	'telegram:' || event.dedupe_key, event.created_at, 'pending', 0, 5,
	event.created_at, event.created_at
FROM price_review_outbox_events event
WHERE event.status = 'pending'
	AND event.event_type IN ('parent_accepted', 'parent_declined', 'response_overdue');

UPDATE price_review_outbox_events SET status = 'consumed' WHERE status = 'pending'
	AND (EXISTS (SELECT 1 FROM email_outbox
		WHERE id = 'email:price-review:' || price_review_outbox_events.id)
		OR EXISTS (SELECT 1 FROM telegram_outbox
			WHERE id = 'telegram:price-review:' || price_review_outbox_events.id));

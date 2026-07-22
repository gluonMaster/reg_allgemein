PRAGMA foreign_keys = ON;

-- Stage 10 keeps the current assignment provenance beside the mutable current
-- amount. Historical offers and price-review evidence remain immutable.
ALTER TABLE enrollments
	ADD COLUMN current_base_price_cents INTEGER
		CHECK (current_base_price_cents IS NULL OR current_base_price_cents >= 0);

ALTER TABLE enrollments
	ADD COLUMN current_price_version_id TEXT REFERENCES price_versions(id);

ALTER TABLE enrollments
	ADD COLUMN current_price_rule_id TEXT REFERENCES price_rules(id);

ALTER TABLE enrollments
	ADD COLUMN price_assignment_version INTEGER NOT NULL DEFAULT 1
		CHECK (price_assignment_version > 0);

UPDATE enrollments
SET current_base_price_cents = current_price_cents
WHERE current_price_cents IS NOT NULL;

UPDATE enrollments
SET current_base_price_cents = COALESCE((
		SELECT offer.base_price_cents
		FROM contract_offers AS offer
		WHERE offer.enrollment_id = enrollments.id
			AND offer.status = 'approved_by_admin'
		ORDER BY offer.admin_approved_at DESC, offer.version DESC
		LIMIT 1
	), current_base_price_cents),
	current_price_version_id = (
		SELECT offer.price_version_id
		FROM contract_offers AS offer
		WHERE offer.enrollment_id = enrollments.id
			AND offer.status = 'approved_by_admin'
		ORDER BY offer.admin_approved_at DESC, offer.version DESC
		LIMIT 1
	),
	current_price_rule_id = (
		SELECT offer.price_rule_id
		FROM contract_offers AS offer
		WHERE offer.enrollment_id = enrollments.id
			AND offer.status = 'approved_by_admin'
		ORDER BY offer.admin_approved_at DESC, offer.version DESC
		LIMIT 1
	)
WHERE EXISTS (
	SELECT 1 FROM contract_offers AS offer
	WHERE offer.enrollment_id = enrollments.id
		AND offer.status = 'approved_by_admin'
);

CREATE TABLE price_review_triggers (
	id TEXT PRIMARY KEY NOT NULL,
	course_group_id TEXT NOT NULL REFERENCES course_groups(id),
	source_kind TEXT NOT NULL CHECK (source_kind IN (
		'contract_activation', 'enrollment_boundary', 'occupancy_correction',
		'legacy_mapping_change', 'admin_price_comparison', 'reconciler'
	)),
	source_ref TEXT NOT NULL,
	reason_code TEXT NOT NULL CHECK (reason_code IN (
		'activation', 'expiry', 'cancellation', 'boundary_change',
		'occupancy_correction', 'legacy_mapping_change', 'admin_price_comparison'
	)),
	effective_on TEXT NOT NULL,
	old_active_count INTEGER NOT NULL CHECK (old_active_count >= 0),
	new_active_count INTEGER NOT NULL CHECK (new_active_count >= 0),
	old_lookup_children_count INTEGER
		CHECK (old_lookup_children_count IS NULL OR old_lookup_children_count BETWEEN 1 AND 6),
	new_lookup_children_count INTEGER
		CHECK (new_lookup_children_count IS NULL OR new_lookup_children_count BETWEEN 1 AND 6),
	requested_price_version_id TEXT REFERENCES price_versions(id),
	dedupe_key TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'processing', 'processed', 'no_change', 'failed')),
	error_code TEXT,
	created_by_user_id TEXT REFERENCES users(id),
	created_at TEXT NOT NULL,
	processed_at TEXT,
	updated_at TEXT NOT NULL,
	CHECK (effective_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);

CREATE INDEX price_review_triggers_pending
	ON price_review_triggers (status, effective_on, created_at);

CREATE INDEX price_review_triggers_course_effective
	ON price_review_triggers (course_group_id, effective_on, created_at);

CREATE TABLE price_review_reconciler_state (
	scope TEXT PRIMARY KEY NOT NULL CHECK (scope = 'enrollment_boundaries'),
	last_scanned_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

INSERT INTO price_review_reconciler_state (scope, last_scanned_at, updated_at)
VALUES (
	'enrollment_boundaries',
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TABLE price_review_batches (
	id TEXT PRIMARY KEY NOT NULL,
	course_group_id TEXT NOT NULL REFERENCES course_groups(id),
	reason_code TEXT NOT NULL,
	old_active_count INTEGER NOT NULL CHECK (old_active_count >= 0),
	new_active_count INTEGER NOT NULL CHECK (new_active_count >= 0),
	old_lookup_children_count INTEGER
		CHECK (old_lookup_children_count IS NULL OR old_lookup_children_count BETWEEN 1 AND 6),
	new_lookup_children_count INTEGER
		CHECK (new_lookup_children_count IS NULL OR new_lookup_children_count BETWEEN 1 AND 6),
	price_version_id TEXT REFERENCES price_versions(id),
	effective_on TEXT NOT NULL,
	earliest_effective_from TEXT NOT NULL,
	calculation_snapshot_json TEXT NOT NULL
		CHECK (json_valid(calculation_snapshot_json) AND json_type(calculation_snapshot_json) = 'object'),
	calculation_snapshot_hash TEXT NOT NULL
		CHECK (length(calculation_snapshot_hash) = 64
			AND calculation_snapshot_hash NOT GLOB '*[^0-9a-f]*'),
	dedupe_key TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL CHECK (status IN (
		'draft', 'pending_notification_approval', 'notifications_approved',
		'sending', 'awaiting_responses', 'completed', 'cancelled'
	)),
	notification_approved_at TEXT,
	notification_approved_by TEXT REFERENCES users(id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	completed_at TEXT,
	CHECK (effective_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CHECK (earliest_effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CHECK (
		status NOT IN ('notifications_approved', 'sending', 'awaiting_responses')
		OR (notification_approved_at IS NOT NULL AND notification_approved_by IS NOT NULL)
	)
);

CREATE INDEX price_review_batches_queue
	ON price_review_batches (status, effective_on, created_at);

CREATE INDEX price_review_batches_course_created
	ON price_review_batches (course_group_id, created_at DESC);

CREATE TABLE price_review_trigger_batches (
	trigger_id TEXT PRIMARY KEY NOT NULL REFERENCES price_review_triggers(id),
	batch_id TEXT NOT NULL REFERENCES price_review_batches(id),
	created_at TEXT NOT NULL
);

CREATE TABLE price_review_items (
	id TEXT PRIMARY KEY NOT NULL,
	batch_id TEXT NOT NULL REFERENCES price_review_batches(id),
	version INTEGER NOT NULL CHECK (version > 0),
	public_reference TEXT NOT NULL UNIQUE,
	enrollment_id TEXT REFERENCES enrollments(id),
	legacy_enrollment_id TEXT REFERENCES legacy_enrollments(id),
	user_id TEXT REFERENCES users(id),
	old_base_price_cents INTEGER CHECK (old_base_price_cents IS NULL OR old_base_price_cents >= 0),
	old_price_cents INTEGER CHECK (old_price_cents IS NULL OR old_price_cents >= 0),
	new_base_price_cents INTEGER CHECK (new_base_price_cents IS NULL OR new_base_price_cents >= 0),
	new_final_price_cents INTEGER CHECK (new_final_price_cents IS NULL OR new_final_price_cents >= 0),
	old_price_source TEXT,
	new_price_source TEXT,
	old_price_mode TEXT CHECK (old_price_mode IS NULL OR old_price_mode IN ('rule_derived', 'manual_override')),
	new_price_mode TEXT CHECK (new_price_mode IS NULL OR new_price_mode IN ('rule_derived', 'manual_override')),
	old_price_version_id TEXT REFERENCES price_versions(id),
	new_price_version_id TEXT REFERENCES price_versions(id),
	old_price_rule_id TEXT REFERENCES price_rules(id),
	new_price_rule_id TEXT REFERENCES price_rules(id),
	target_state_hash TEXT NOT NULL
		CHECK (length(target_state_hash) = 64 AND target_state_hash NOT GLOB '*[^0-9a-f]*'),
	expected_active_count INTEGER NOT NULL CHECK (expected_active_count >= 0),
	expected_lookup_children_count INTEGER
		CHECK (expected_lookup_children_count IS NULL OR expected_lookup_children_count BETWEEN 1 AND 6),
	effective_on TEXT NOT NULL,
	decision_code TEXT NOT NULL,
	decision_json TEXT NOT NULL
		CHECK (json_valid(decision_json) AND json_type(decision_json) = 'object'),
	terms_snapshot_json TEXT NOT NULL
		CHECK (json_valid(terms_snapshot_json) AND json_type(terms_snapshot_json) = 'object'),
	item_hash TEXT NOT NULL
		CHECK (length(item_hash) = 64 AND item_hash NOT GLOB '*[^0-9a-f]*'),
	acceptance_text_version TEXT NOT NULL,
	dedupe_key TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL CHECK (status IN (
		'draft', 'manual_contact_required', 'notification_approved', 'sent',
		'accepted_by_parent', 'declined_by_parent', 'response_overdue',
		'approved_by_admin', 'scheduled', 'applied', 'cancelled', 'superseded'
	)),
	sent_at TEXT,
	response_deadline TEXT,
	responded_at TEXT,
	final_admin_confirmed_at TEXT,
	final_admin_confirmed_by TEXT REFERENCES users(id),
	final_admin_confirmation_reason TEXT,
	manual_contact_task_id TEXT REFERENCES admin_review_tasks(id),
	scheduled_for TEXT,
	applied_at TEXT,
	superseded_by_item_id TEXT REFERENCES price_review_items(id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK ((enrollment_id IS NOT NULL) <> (legacy_enrollment_id IS NOT NULL)),
	CHECK (effective_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CHECK (response_deadline IS NULL OR response_deadline GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CHECK (scheduled_for IS NULL OR scheduled_for GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CHECK (
		status IN ('draft', 'manual_contact_required', 'cancelled', 'superseded')
		OR (
			user_id IS NOT NULL
			AND old_price_cents IS NOT NULL
			AND new_base_price_cents IS NOT NULL
			AND new_final_price_cents IS NOT NULL
			AND old_price_source IS NOT NULL
			AND new_price_source IS NOT NULL
			AND old_price_mode IS NOT NULL
			AND new_price_mode IS NOT NULL
		)
	),
	CHECK (status NOT IN ('sent', 'accepted_by_parent', 'declined_by_parent',
		'response_overdue', 'approved_by_admin', 'scheduled', 'applied')
		OR (sent_at IS NOT NULL AND response_deadline IS NOT NULL)),
	CHECK (status NOT IN ('approved_by_admin', 'scheduled', 'applied')
		OR (final_admin_confirmed_at IS NOT NULL
			AND final_admin_confirmed_by IS NOT NULL
			AND final_admin_confirmation_reason IS NOT NULL
			AND scheduled_for IS NOT NULL)),
	CHECK (status <> 'applied' OR applied_at IS NOT NULL)
);

CREATE UNIQUE INDEX price_review_items_batch_enrollment_version
	ON price_review_items (batch_id, enrollment_id, version)
	WHERE enrollment_id IS NOT NULL;

CREATE UNIQUE INDEX price_review_items_batch_legacy_version
	ON price_review_items (batch_id, legacy_enrollment_id, version)
	WHERE legacy_enrollment_id IS NOT NULL;

CREATE UNIQUE INDEX price_review_items_one_open_enrollment_effective
	ON price_review_items (enrollment_id, effective_on)
	WHERE enrollment_id IS NOT NULL AND status IN (
		'draft', 'notification_approved', 'sent', 'accepted_by_parent',
		'approved_by_admin', 'scheduled'
	);

CREATE UNIQUE INDEX price_review_items_one_open_legacy_effective
	ON price_review_items (legacy_enrollment_id, effective_on)
	WHERE legacy_enrollment_id IS NOT NULL AND status IN (
		'draft', 'notification_approved', 'sent', 'accepted_by_parent',
		'approved_by_admin', 'scheduled'
	);

CREATE INDEX price_review_items_parent_queue
	ON price_review_items (user_id, status, created_at DESC);

CREATE INDEX price_review_items_scheduler
	ON price_review_items (status, response_deadline, scheduled_for);

CREATE TABLE price_review_parent_actions (
	id TEXT PRIMARY KEY NOT NULL,
	price_review_item_id TEXT NOT NULL REFERENCES price_review_items(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	action TEXT NOT NULL CHECK (action IN ('accept', 'decline')),
	provided_item_hash TEXT NOT NULL,
	request_hash_sha256 TEXT NOT NULL
		CHECK (length(request_hash_sha256) = 64 AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	idempotency_key TEXT NOT NULL,
	evidence_status TEXT NOT NULL CHECK (evidence_status IN ('applied', 'stale', 'late')),
	resulting_status TEXT NOT NULL,
	user_agent TEXT NOT NULL,
	ip_retention_value TEXT,
	ip_expires_at TEXT,
	created_at TEXT NOT NULL,
	UNIQUE (user_id, idempotency_key)
);

CREATE TABLE price_change_acceptances (
	id TEXT PRIMARY KEY NOT NULL,
	price_review_item_id TEXT NOT NULL UNIQUE REFERENCES price_review_items(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	accepted_at TEXT NOT NULL,
	ip_retention_value TEXT,
	ip_expires_at TEXT,
	user_agent TEXT NOT NULL,
	acceptance_text TEXT NOT NULL,
	acceptance_text_version TEXT NOT NULL,
	item_hash TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	parent_action_id TEXT NOT NULL UNIQUE REFERENCES price_review_parent_actions(id)
);

CREATE TABLE price_review_admin_actions (
	id TEXT PRIMARY KEY NOT NULL,
	action TEXT NOT NULL CHECK (action IN (
		'admin_price_comparison', 'notification_approval',
		'notification_dispatch', 'final_confirmation', 'manual_scheduler_run'
	)),
	target_kind TEXT NOT NULL CHECK (target_kind IN ('trigger', 'batch', 'item', 'scheduler')),
	target_id TEXT NOT NULL,
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	idempotency_key TEXT NOT NULL,
	request_hash_sha256 TEXT NOT NULL
		CHECK (length(request_hash_sha256) = 64 AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	result_ref TEXT NOT NULL,
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	created_at TEXT NOT NULL,
	UNIQUE (actor_user_id, idempotency_key),
	UNIQUE (action, target_kind, target_id)
);

CREATE TABLE price_review_outbox_events (
	id TEXT PRIMARY KEY NOT NULL,
	event_type TEXT NOT NULL CHECK (event_type IN (
		'item_available', 'parent_accepted', 'parent_declined',
		'response_overdue', 'item_applied'
	)),
	source_kind TEXT NOT NULL CHECK (source_kind IN ('price_review_item', 'price_review_batch')),
	source_id TEXT NOT NULL,
	recipient_role TEXT NOT NULL CHECK (recipient_role IN ('parent', 'admin')),
	recipient_user_id TEXT REFERENCES users(id),
	payload_json TEXT NOT NULL
		CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
	dedupe_key TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'consumed')),
	created_at TEXT NOT NULL
);

CREATE INDEX price_review_outbox_queue
	ON price_review_outbox_events (status, created_at);

CREATE TABLE price_review_deliveries (
	id TEXT PRIMARY KEY NOT NULL,
	price_review_item_id TEXT NOT NULL REFERENCES price_review_items(id),
	outbox_event_id TEXT NOT NULL UNIQUE REFERENCES price_review_outbox_events(id),
	channel TEXT NOT NULL CHECK (channel = 'fake_email'),
	recipient_user_id TEXT NOT NULL REFERENCES users(id),
	cabinet_url TEXT NOT NULL,
	delivery_status TEXT NOT NULL CHECK (delivery_status IN ('queued', 'cancelled')),
	dedupe_key TEXT NOT NULL UNIQUE,
	delivered_at TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE price_change_apply_events (
	id TEXT PRIMARY KEY NOT NULL,
	price_review_item_id TEXT NOT NULL UNIQUE REFERENCES price_review_items(id),
	target_kind TEXT NOT NULL CHECK (target_kind IN ('enrollment', 'legacy_enrollment')),
	target_id TEXT NOT NULL,
	old_base_price_cents INTEGER,
	old_final_price_cents INTEGER NOT NULL CHECK (old_final_price_cents >= 0),
	new_base_price_cents INTEGER NOT NULL CHECK (new_base_price_cents >= 0),
	new_final_price_cents INTEGER NOT NULL CHECK (new_final_price_cents >= 0),
	new_price_source TEXT NOT NULL,
	new_price_mode TEXT NOT NULL CHECK (new_price_mode IN ('rule_derived', 'manual_override')),
	new_price_version_id TEXT REFERENCES price_versions(id),
	new_price_rule_id TEXT REFERENCES price_rules(id),
	effective_from TEXT NOT NULL,
	evidence_hash TEXT NOT NULL
		CHECK (length(evidence_hash) = 64 AND evidence_hash NOT GLOB '*[^0-9a-f]*'),
	applied_at TEXT NOT NULL,
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	created_at TEXT NOT NULL
);

CREATE TABLE legacy_service_price_assignments (
	id TEXT PRIMARY KEY NOT NULL,
	legacy_enrollment_id TEXT NOT NULL REFERENCES legacy_enrollments(id),
	price_review_item_id TEXT UNIQUE REFERENCES price_review_items(id),
	base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
	final_price_cents INTEGER NOT NULL CHECK (final_price_cents >= 0),
	price_source TEXT NOT NULL,
	price_mode TEXT NOT NULL CHECK (price_mode IN ('rule_derived', 'manual_override')),
	price_version_id TEXT REFERENCES price_versions(id),
	price_rule_id TEXT REFERENCES price_rules(id),
	effective_from TEXT NOT NULL,
	effective_until TEXT,
	status TEXT NOT NULL CHECK (status IN ('scheduled', 'active', 'ended')),
	applied_by_event_id TEXT REFERENCES price_change_apply_events(id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (effective_until IS NULL OR effective_from < effective_until)
);

CREATE UNIQUE INDEX legacy_service_price_assignments_one_active
	ON legacy_service_price_assignments (legacy_enrollment_id)
	WHERE status = 'active';

CREATE INDEX legacy_service_price_assignments_effective
	ON legacy_service_price_assignments
		(legacy_enrollment_id, effective_from, effective_until, status);

CREATE TABLE price_review_action_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	scope TEXT NOT NULL,
	target_id TEXT NOT NULL,
	action_id TEXT,
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL,
	UNIQUE (scope, target_id)
);

CREATE UNIQUE INDEX admin_review_tasks_price_review_open
	ON admin_review_tasks (kind, source_kind, source_id, reason_code)
	WHERE status IN ('open', 'in_progress')
		AND kind IN (
			'price_review_manual_contact', 'price_review_parent_accepted',
			'price_review_declined', 'price_review_overdue', 'price_review_stale'
		);

CREATE TRIGGER price_review_triggers_allowed_transition
BEFORE UPDATE OF status ON price_review_triggers
WHEN NEW.status <> OLD.status AND NOT (
	(OLD.status = 'pending' AND NEW.status IN ('processing', 'processed', 'no_change', 'failed'))
	OR (OLD.status = 'processing' AND NEW.status IN ('processed', 'no_change', 'failed'))
)
BEGIN
	SELECT RAISE(ABORT, 'invalid price review trigger transition');
END;

CREATE TRIGGER price_review_batches_allowed_transition
BEFORE UPDATE OF status ON price_review_batches
WHEN NEW.status <> OLD.status AND NOT (
	(OLD.status = 'draft' AND NEW.status IN ('pending_notification_approval', 'completed', 'cancelled'))
	OR (OLD.status = 'pending_notification_approval' AND NEW.status IN ('notifications_approved', 'cancelled'))
	OR (OLD.status = 'notifications_approved' AND NEW.status IN ('sending', 'awaiting_responses', 'completed', 'cancelled'))
	OR (OLD.status = 'sending' AND NEW.status IN ('awaiting_responses', 'completed', 'cancelled'))
	OR (OLD.status = 'awaiting_responses' AND NEW.status IN ('completed', 'cancelled'))
)
BEGIN
	SELECT RAISE(ABORT, 'invalid price review batch transition');
END;

CREATE TRIGGER price_review_items_allowed_transition
BEFORE UPDATE OF status ON price_review_items
WHEN NEW.status <> OLD.status AND NOT (
	(OLD.status = 'draft' AND NEW.status IN ('notification_approved', 'manual_contact_required', 'cancelled', 'superseded'))
	OR (OLD.status = 'manual_contact_required' AND NEW.status IN ('cancelled', 'superseded'))
	OR (OLD.status = 'notification_approved' AND NEW.status IN ('sent', 'cancelled', 'superseded'))
	OR (OLD.status = 'sent' AND NEW.status IN ('accepted_by_parent', 'declined_by_parent', 'response_overdue', 'cancelled', 'superseded'))
	OR (OLD.status = 'accepted_by_parent' AND NEW.status IN ('approved_by_admin', 'scheduled', 'cancelled', 'superseded'))
	OR (OLD.status = 'approved_by_admin' AND NEW.status IN ('scheduled', 'cancelled', 'superseded'))
	OR (OLD.status = 'scheduled' AND NEW.status IN ('applied', 'cancelled', 'superseded'))
)
BEGIN
	SELECT RAISE(ABORT, 'invalid price review item transition');
END;

CREATE TRIGGER price_review_items_sent_snapshot_immutable
BEFORE UPDATE OF batch_id, version, public_reference, enrollment_id,
	legacy_enrollment_id, user_id, old_base_price_cents, old_price_cents,
	new_base_price_cents, new_final_price_cents, old_price_source,
	new_price_source, old_price_mode, new_price_mode, old_price_version_id,
	new_price_version_id, old_price_rule_id, new_price_rule_id,
	target_state_hash, expected_active_count, expected_lookup_children_count,
	effective_on, decision_code, decision_json, terms_snapshot_json, item_hash,
	acceptance_text_version, dedupe_key, created_at
	ON price_review_items
WHEN OLD.sent_at IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'sent price review snapshot is immutable');
END;

CREATE TRIGGER price_review_parent_actions_reject_update
BEFORE UPDATE ON price_review_parent_actions
BEGIN SELECT RAISE(ABORT, 'price review parent actions are append-only'); END;

CREATE TRIGGER price_review_parent_actions_reject_delete
BEFORE DELETE ON price_review_parent_actions
BEGIN SELECT RAISE(ABORT, 'price review parent actions are append-only'); END;

CREATE TRIGGER price_change_acceptances_reject_update
BEFORE UPDATE ON price_change_acceptances
BEGIN SELECT RAISE(ABORT, 'price change acceptances are append-only'); END;

CREATE TRIGGER price_change_acceptances_reject_delete
BEFORE DELETE ON price_change_acceptances
BEGIN SELECT RAISE(ABORT, 'price change acceptances are append-only'); END;

CREATE TRIGGER price_review_admin_actions_reject_update
BEFORE UPDATE ON price_review_admin_actions
BEGIN SELECT RAISE(ABORT, 'price review admin actions are append-only'); END;

CREATE TRIGGER price_review_admin_actions_reject_delete
BEFORE DELETE ON price_review_admin_actions
BEGIN SELECT RAISE(ABORT, 'price review admin actions are append-only'); END;

CREATE TRIGGER price_review_deliveries_reject_update
BEFORE UPDATE ON price_review_deliveries
BEGIN SELECT RAISE(ABORT, 'price review deliveries are append-only'); END;

CREATE TRIGGER price_review_deliveries_reject_delete
BEFORE DELETE ON price_review_deliveries
BEGIN SELECT RAISE(ABORT, 'price review deliveries are append-only'); END;

CREATE TRIGGER price_change_apply_events_reject_update
BEFORE UPDATE ON price_change_apply_events
BEGIN SELECT RAISE(ABORT, 'price change apply events are append-only'); END;

CREATE TRIGGER price_change_apply_events_reject_delete
BEFORE DELETE ON price_change_apply_events
BEGIN SELECT RAISE(ABORT, 'price change apply events are append-only'); END;

CREATE TRIGGER price_review_action_assertions_reject_update
BEFORE UPDATE ON price_review_action_assertions
BEGIN SELECT RAISE(ABORT, 'price review assertions are append-only'); END;

CREATE TRIGGER price_review_action_assertions_reject_delete
BEFORE DELETE ON price_review_action_assertions
BEGIN SELECT RAISE(ABORT, 'price review assertions are append-only'); END;

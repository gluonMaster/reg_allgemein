PRAGMA foreign_keys = ON;

-- Stage 05 only addressed current/pending account mailboxes. A legacy claim
-- message deliberately targets one current imported address without copying it
-- into a URL, audit event, or client-facing record.
ALTER TABLE email_outbox RENAME TO email_outbox_stage05;

CREATE TABLE email_outbox (
	id TEXT PRIMARY KEY NOT NULL,
	source_kind TEXT NOT NULL,
	source_id TEXT NOT NULL,
	template_or_category TEXT NOT NULL,
	recipient_user_id TEXT NOT NULL REFERENCES users(id),
	recipient_address_kind TEXT NOT NULL
		CHECK (recipient_address_kind IN ('current', 'pending', 'legacy')),
	recipient_legacy_email_id TEXT REFERENCES legacy_family_emails(id),
	locale TEXT NOT NULL DEFAULT 'de',
	payload_json TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(payload_json)),
	dedupe_key TEXT NOT NULL UNIQUE,
	not_before TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'processing', 'retry', 'sent', 'dead', 'cancelled')),
	attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
	max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
	next_attempt_at TEXT,
	last_error_code TEXT,
	locked_at TEXT,
	provider_request_id TEXT,
	sent_at TEXT,
	created_at TEXT NOT NULL,
	CHECK (
		(recipient_address_kind = 'legacy' AND recipient_legacy_email_id IS NOT NULL)
		OR
		(recipient_address_kind <> 'legacy' AND recipient_legacy_email_id IS NULL)
	)
);

INSERT INTO email_outbox
	(id, source_kind, source_id, template_or_category, recipient_user_id,
	 recipient_address_kind, recipient_legacy_email_id, locale, payload_json,
	 dedupe_key, not_before, status, attempts, max_attempts, next_attempt_at,
	 last_error_code, locked_at, provider_request_id, sent_at, created_at)
SELECT id, source_kind, source_id, template_or_category, recipient_user_id,
	recipient_address_kind, NULL, locale, payload_json, dedupe_key, not_before,
	status, attempts, max_attempts, next_attempt_at, last_error_code, locked_at,
	provider_request_id, sent_at, created_at
FROM email_outbox_stage05;

DROP TABLE email_outbox_stage05;

CREATE INDEX email_outbox_due
	ON email_outbox (status, not_before, next_attempt_at);

CREATE INDEX email_outbox_source
	ON email_outbox (source_kind, source_id);

CREATE TABLE family_claims (
	id TEXT PRIMARY KEY NOT NULL,
	legacy_family_id TEXT NOT NULL REFERENCES legacy_families(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	status TEXT NOT NULL
		CHECK (status IN ('candidate', 'claimed', 'conflict', 'released', 'superseded')),
	proof_kind TEXT NOT NULL
		CHECK (proof_kind IN ('verified_login_email', 'legacy_email_token', 'admin_reassignment')),
	proof_at TEXT NOT NULL,
	consented_at TEXT,
	claimed_at TEXT,
	review_task_id TEXT REFERENCES admin_review_tasks(id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (status <> 'claimed' OR claimed_at IS NOT NULL),
	CHECK (proof_kind <> 'legacy_email_token' OR consented_at IS NOT NULL)
);

CREATE UNIQUE INDEX family_claims_one_current_family_owner
	ON family_claims (legacy_family_id)
	WHERE status = 'claimed';

CREATE UNIQUE INDEX family_claims_one_current_user_family
	ON family_claims (user_id)
	WHERE status = 'claimed';

CREATE TABLE family_link_attempts (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id),
	legacy_family_id TEXT NOT NULL REFERENCES legacy_families(id),
	legacy_family_email_id TEXT NOT NULL REFERENCES legacy_family_emails(id),
	from_family_number_id TEXT NOT NULL REFERENCES family_number_allocations(id),
	legacy_version_id TEXT NOT NULL REFERENCES legacy_versions(id),
	legacy_import_run_id TEXT NOT NULL REFERENCES import_runs(id),
	match_kind TEXT NOT NULL CHECK (match_kind IN ('exact_email', 'parent_name')),
	masked_email_snapshot TEXT NOT NULL,
	status TEXT NOT NULL
		CHECK (status IN ('candidate', 'proof_sent', 'confirmed', 'expired', 'conflict', 'cancelled')),
	family_version INTEGER NOT NULL CHECK (family_version > 0),
	review_task_id TEXT REFERENCES admin_review_tasks(id),
	proof_requested_at TEXT,
	confirmed_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX family_link_attempts_one_active_user
	ON family_link_attempts (user_id)
	WHERE status IN ('candidate', 'proof_sent');

CREATE UNIQUE INDEX family_link_attempts_one_active_family
	ON family_link_attempts (legacy_family_id)
	WHERE status IN ('candidate', 'proof_sent');

CREATE TABLE family_reassignments (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id),
	from_family_number_id TEXT NOT NULL REFERENCES family_number_allocations(id),
	to_family_number_id TEXT NOT NULL REFERENCES family_number_allocations(id),
	source TEXT NOT NULL CHECK (source IN ('legacy_email_token', 'admin_correction')),
	reason_code TEXT NOT NULL,
	reason_note TEXT,
	requested_by TEXT NOT NULL REFERENCES users(id),
	confirmed_by TEXT REFERENCES users(id),
	idempotency_key TEXT NOT NULL,
	family_version_before INTEGER NOT NULL CHECK (family_version_before > 0),
	status TEXT NOT NULL CHECK (status IN ('planned', 'applied', 'conflict', 'cancelled')),
	safe_effects_json TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(safe_effects_json) AND json_type(safe_effects_json) = 'object'),
	created_at TEXT NOT NULL,
	applied_at TEXT,
	updated_at TEXT NOT NULL,
	UNIQUE (source, idempotency_key),
	CHECK (from_family_number_id <> to_family_number_id),
	CHECK (status <> 'applied' OR (confirmed_by IS NOT NULL AND applied_at IS NOT NULL))
);

CREATE TABLE family_finalization_commits (
	request_id TEXT PRIMARY KEY NOT NULL REFERENCES auth_verification_commits(request_id),
	verification_token_id TEXT NOT NULL UNIQUE REFERENCES auth_tokens(id),
	user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
	legacy_version_id TEXT NOT NULL REFERENCES legacy_versions(id),
	legacy_import_run_id TEXT NOT NULL REFERENCES import_runs(id),
	family_number_id TEXT NOT NULL REFERENCES family_number_allocations(id),
	result_kind TEXT NOT NULL CHECK (result_kind IN ('exact_email', 'portal_allocated')),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TABLE family_transaction_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	operation_kind TEXT NOT NULL CHECK (operation_kind IN ('legacy_email_claim', 'admin_correction')),
	operation_id TEXT NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL,
	UNIQUE (operation_kind, operation_id)
);

CREATE TABLE child_correction_requests (
	id TEXT PRIMARY KEY NOT NULL,
	child_id TEXT NOT NULL REFERENCES children(id),
	requested_by TEXT NOT NULL REFERENCES users(id),
	requested_full_name TEXT NOT NULL,
	requested_full_name_normalized TEXT NOT NULL,
	requested_birth_date TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
	reviewed_by TEXT REFERENCES users(id),
	reviewed_at TEXT,
	decision_reason TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX child_correction_requests_one_pending_child
	ON child_correction_requests (child_id)
	WHERE status = 'pending';

CREATE UNIQUE INDEX admin_review_tasks_family_open
	ON admin_review_tasks (kind, source_kind, source_id, reason_code)
	WHERE status IN ('open', 'in_progress')
		AND kind IN ('family_name_match', 'family_claim_conflict', 'family_correction');

-- Parent-pay rows default to the manual information branch. An explicitly
-- recorded external debit remains informational and creates no mandate/ledger.
ALTER TABLE enrollments
	ADD COLUMN payment_arrangement TEXT NOT NULL DEFAULT 'manual_payment'
		CHECK (payment_arrangement IN ('existing_external_sepa', 'manual_payment'));

ALTER TABLE legacy_enrollments
	ADD COLUMN payment_arrangement TEXT NOT NULL DEFAULT 'manual_payment'
		CHECK (payment_arrangement IN ('existing_external_sepa', 'manual_payment', 'not_applicable'));

CREATE TRIGGER users_family_assignment_requires_owned_allocation
BEFORE UPDATE OF family_number_id, family_assignment_status ON users
WHEN NEW.role = 'parent' AND NEW.family_number_id IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'parent family allocation ownership mismatch')
	WHERE NOT EXISTS (
		SELECT 1 FROM family_number_allocations AS allocation
		WHERE allocation.id = NEW.family_number_id
			AND allocation.owner_user_id = NEW.id
			AND allocation.status = 'assigned'
	);
END;

CREATE TRIGGER users_family_assignment_requires_owned_allocation_insert
BEFORE INSERT ON users
WHEN NEW.role = 'parent' AND NEW.family_number_id IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'parent family allocation ownership mismatch')
	WHERE NOT EXISTS (
		SELECT 1 FROM family_number_allocations AS allocation
		WHERE allocation.id = NEW.family_number_id
			AND allocation.owner_user_id = NEW.id
			AND allocation.status = 'assigned'
	);
END;

CREATE TRIGGER children_owner_family_invariant_insert
BEFORE INSERT ON children
WHEN NEW.owner_user_id IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'child family ownership mismatch')
	WHERE NOT EXISTS (
		SELECT 1 FROM users
		WHERE users.id = NEW.owner_user_id
			AND users.family_number_id = NEW.family_number_id
			AND users.email_verified_at IS NOT NULL
			AND users.account_status = 'active'
	);
END;

CREATE TRIGGER children_owner_family_invariant_update
BEFORE UPDATE OF owner_user_id, family_number_id ON children
WHEN NEW.owner_user_id IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'child family ownership mismatch')
	WHERE NOT EXISTS (
		SELECT 1 FROM users
		WHERE users.id = NEW.owner_user_id
			AND users.family_number_id = NEW.family_number_id
			AND users.email_verified_at IS NOT NULL
			AND users.account_status = 'active'
	);
END;

CREATE TRIGGER portal_children_require_owner_and_no_legacy_identity_insert
BEFORE INSERT ON children
WHEN NEW.origin = 'portal'
BEGIN
	SELECT RAISE(ABORT, 'portal child ownership invalid')
	WHERE NEW.owner_user_id IS NULL OR NEW.legacy_family_id IS NOT NULL;
END;

CREATE TRIGGER family_allocations_reject_alias_cycle
BEFORE UPDATE OF merged_into_family_number_id ON family_number_allocations
WHEN NEW.merged_into_family_number_id IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'family allocation alias cycle')
	WHERE NEW.merged_into_family_number_id = NEW.id
		OR EXISTS (
			SELECT 1 FROM family_number_allocations AS destination
			WHERE destination.id = NEW.merged_into_family_number_id
				AND destination.merged_into_family_number_id IS NOT NULL
		);
END;

PRAGMA foreign_keys = ON;

CREATE TABLE individual_requests (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id),
	child_id TEXT NOT NULL REFERENCES children(id),
	request_kind TEXT NOT NULL CHECK (request_kind IN ('nachhilfe', 'individual')),
	funding_kind TEXT NOT NULL CHECK (funding_kind IN ('self_pay', 'jobcenter', 'socialamt', 'unknown')),
	subjects_raw TEXT NOT NULL CHECK (length(subjects_raw) BETWEEN 1 AND 500),
	description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
	preferred_days_json TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(preferred_days_json) AND json_type(preferred_days_json) = 'array'),
	preferred_time_windows_json TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(preferred_time_windows_json) AND json_type(preferred_time_windows_json) = 'array'),
	preferred_format TEXT NOT NULL CHECK (preferred_format IN ('online', 'onsite', 'mixed')),
	preferred_locations_json TEXT NOT NULL DEFAULT '[]'
		CHECK (json_valid(preferred_locations_json) AND json_type(preferred_locations_json) = 'array'),
	unit_rate_cents INTEGER NOT NULL CHECK (unit_rate_cents >= 0),
	parent_payable INTEGER NOT NULL CHECK (parent_payable IN (0, 1)),
	status TEXT NOT NULL DEFAULT 'draft'
		CHECK (status IN ('draft', 'submitted', 'needs_documents', 'needs_info',
			'pending_admin_review', 'approved', 'rejected', 'cancelled')),
	version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
	create_idempotency_key TEXT NOT NULL,
	create_request_hash_sha256 TEXT NOT NULL
		CHECK (length(create_request_hash_sha256) = 64
			AND create_request_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	admin_decision TEXT CHECK (admin_decision IN (
		'approved', 'rejected', 'needs_documents', 'needs_info', 'cancelled'
	)),
	admin_notes TEXT CHECK (admin_notes IS NULL OR length(admin_notes) <= 1000),
	reviewed_by TEXT REFERENCES users(id),
	reviewed_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (user_id, create_idempotency_key),
	CHECK (
		(request_kind = 'individual' AND funding_kind = 'self_pay' AND parent_payable = 1)
		OR (request_kind = 'nachhilfe' AND funding_kind IN ('jobcenter', 'socialamt', 'unknown')
			AND parent_payable = 0)
	)
);

CREATE INDEX individual_requests_owner_created
	ON individual_requests (user_id, created_at DESC);

CREATE INDEX individual_requests_admin_queue
	ON individual_requests (status, request_kind, updated_at, id);

CREATE TRIGGER individual_requests_insert_requires_owned_child
BEFORE INSERT ON individual_requests
BEGIN
	SELECT RAISE(ABORT, 'request child ownership mismatch')
	WHERE NOT EXISTS (
		SELECT 1 FROM users AS owner
		JOIN children AS child ON child.owner_user_id = owner.id
			AND child.family_number_id = owner.family_number_id
		WHERE owner.id = NEW.user_id AND child.id = NEW.child_id
			AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
			AND owner.account_status = 'active' AND owner.is_blocked = 0
			AND owner.family_number_id IS NOT NULL AND child.is_current = 1
	);
END;

CREATE TRIGGER individual_requests_immutable_identity
BEFORE UPDATE OF user_id, child_id, request_kind, unit_rate_cents,
	parent_payable, create_idempotency_key, create_request_hash_sha256, created_at
	ON individual_requests
BEGIN
	SELECT RAISE(ABORT, 'request identity and tariff snapshot are immutable');
END;

CREATE TRIGGER individual_requests_allowed_transition
BEFORE UPDATE OF status ON individual_requests
WHEN NEW.status <> OLD.status
BEGIN
	SELECT RAISE(ABORT, 'invalid individual request transition')
	WHERE NOT (
		(OLD.status = 'draft' AND NEW.status IN ('submitted', 'cancelled'))
		OR (OLD.status = 'submitted' AND NEW.status IN (
			'needs_documents', 'pending_admin_review', 'cancelled'))
		OR (OLD.status IN ('needs_documents', 'needs_info')
			AND NEW.status IN ('submitted', 'cancelled'))
		OR (OLD.status = 'pending_admin_review'
			AND NEW.status IN ('needs_documents', 'needs_info', 'approved', 'rejected', 'cancelled'))
		OR (OLD.status = 'approved' AND NEW.status = 'cancelled')
	);
END;

CREATE TRIGGER individual_requests_submitted_funding_guard
BEFORE UPDATE OF status, funding_kind ON individual_requests
WHEN NEW.status IN ('submitted', 'needs_documents', 'needs_info',
	'pending_admin_review', 'approved')
BEGIN
	SELECT RAISE(ABORT, 'invalid funding kind for request')
	WHERE (NEW.request_kind = 'individual' AND NEW.funding_kind <> 'self_pay')
		OR (NEW.request_kind = 'nachhilfe'
			AND NEW.funding_kind NOT IN ('jobcenter', 'socialamt'));
END;

CREATE TRIGGER individual_requests_admin_evidence
BEFORE UPDATE OF status, reviewed_by, reviewed_at ON individual_requests
WHEN NEW.status IN ('needs_documents', 'needs_info', 'approved', 'rejected')
	AND OLD.status = 'pending_admin_review'
BEGIN
	SELECT RAISE(ABORT, 'request admin decision requires evidence')
	WHERE NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.admin_decision IS NULL;
END;

CREATE TABLE funding_authorizations (
	id TEXT PRIMARY KEY NOT NULL,
	request_id TEXT NOT NULL REFERENCES individual_requests(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	child_id TEXT NOT NULL REFERENCES children(id),
	version INTEGER NOT NULL CHECK (version > 0),
	kind TEXT NOT NULL CHECK (kind IN ('jobcenter', 'socialamt')),
	status TEXT NOT NULL DEFAULT 'pending_review'
		CHECK (status IN ('pending_review', 'approved', 'rejected', 'revoked', 'superseded')),
	valid_from TEXT,
	valid_until TEXT,
	supersedes_authorization_id TEXT REFERENCES funding_authorizations(id),
	decision_notes TEXT CHECK (decision_notes IS NULL OR length(decision_notes) <= 1000),
	reviewed_by TEXT REFERENCES users(id),
	reviewed_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (request_id, version),
	CHECK (valid_from IS NULL OR valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CHECK (valid_until IS NULL OR valid_until GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until),
	CHECK (
		(status = 'pending_review' AND reviewed_by IS NULL AND reviewed_at IS NULL)
		OR status IN ('rejected', 'revoked', 'superseded')
		OR (status = 'approved' AND valid_from IS NOT NULL AND valid_until IS NOT NULL
			AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
	)
);

CREATE UNIQUE INDEX funding_authorizations_one_pending_version
	ON funding_authorizations (request_id) WHERE status = 'pending_review';

CREATE UNIQUE INDEX funding_authorizations_one_approved_version
	ON funding_authorizations (request_id) WHERE status = 'approved';

CREATE INDEX funding_authorizations_expiry
	ON funding_authorizations (status, valid_until, id);

CREATE TRIGGER funding_authorizations_insert_scope_guard
BEFORE INSERT ON funding_authorizations
BEGIN
	SELECT RAISE(ABORT, 'funding authorization request scope mismatch')
	WHERE NOT EXISTS (
		SELECT 1 FROM individual_requests AS request
		WHERE request.id = NEW.request_id AND request.user_id = NEW.user_id
			AND request.child_id = NEW.child_id AND request.request_kind = 'nachhilfe'
			AND request.funding_kind IN ('jobcenter', 'socialamt')
	);
END;

CREATE TRIGGER funding_authorizations_immutable_identity
BEFORE UPDATE OF request_id, user_id, child_id, version,
	supersedes_authorization_id, created_at ON funding_authorizations
BEGIN
	SELECT RAISE(ABORT, 'funding authorization identity is immutable');
END;

CREATE TRIGGER funding_authorizations_allowed_transition
BEFORE UPDATE OF status ON funding_authorizations
WHEN NEW.status <> OLD.status
BEGIN
	SELECT RAISE(ABORT, 'invalid funding authorization transition')
	WHERE NOT (
		(OLD.status = 'pending_review' AND NEW.status IN ('approved', 'rejected'))
		OR (OLD.status = 'approved' AND NEW.status IN ('revoked', 'superseded'))
	);
END;

CREATE TABLE authorization_documents (
	id TEXT PRIMARY KEY NOT NULL,
	authorization_id TEXT NOT NULL REFERENCES funding_authorizations(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	child_id TEXT NOT NULL REFERENCES children(id),
	quarantine_r2_key TEXT NOT NULL UNIQUE,
	archive_r2_key TEXT UNIQUE,
	original_extension TEXT NOT NULL CHECK (original_extension IN ('pdf', 'jpg', 'jpeg', 'png')),
	mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
	detected_type TEXT NOT NULL CHECK (detected_type IN ('pdf', 'jpeg', 'png')),
	size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
	sha256 TEXT NOT NULL
		CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
	review_status TEXT NOT NULL DEFAULT 'quarantined'
		CHECK (review_status IN ('quarantined', 'scan_pending', 'clean', 'infected',
			'suspicious', 'scan_failed', 'approved', 'rejected', 'deleted')),
	quarantine_reason TEXT CHECK (quarantine_reason IS NULL OR length(quarantine_reason) <= 500),
	scan_method TEXT CHECK (scan_method IN ('manual_local_av', 'automated_adapter')),
	scanner_label TEXT CHECK (scanner_label IS NULL OR length(scanner_label) <= 120),
	scanner_version TEXT CHECK (scanner_version IS NULL OR length(scanner_version) <= 120),
	signature_version TEXT CHECK (signature_version IS NULL OR length(signature_version) <= 120),
	quarantine_downloaded_by_admin_user_id TEXT REFERENCES users(id),
	quarantine_downloaded_sha256 TEXT,
	quarantine_downloaded_at TEXT,
	download_audit_event_id TEXT REFERENCES audit_events(id),
	scan_attested_by_admin_user_id TEXT REFERENCES users(id),
	scan_attestation_text_version TEXT,
	scanned_at TEXT,
	scan_attempts INTEGER NOT NULL DEFAULT 0 CHECK (scan_attempts >= 0),
	business_review_reason TEXT CHECK (business_review_reason IS NULL OR length(business_review_reason) <= 500),
	released_by TEXT REFERENCES users(id),
	released_at TEXT,
	upload_idempotency_key TEXT NOT NULL,
	upload_request_hash_sha256 TEXT NOT NULL
		CHECK (length(upload_request_hash_sha256) = 64
			AND upload_request_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	uploaded_at TEXT NOT NULL,
	quarantine_expires_at TEXT NOT NULL,
	quarantine_delete_state TEXT NOT NULL DEFAULT 'present'
		CHECK (quarantine_delete_state IN ('present', 'delete_pending', 'deleted')),
	quarantine_purged_at TEXT,
	quarantine_cleanup_audit_event_id TEXT UNIQUE REFERENCES audit_events(id),
	deleted_at TEXT,
	replaced_by_document_id TEXT REFERENCES authorization_documents(id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (user_id, upload_idempotency_key),
	CHECK (quarantine_downloaded_sha256 IS NULL
		OR (length(quarantine_downloaded_sha256) = 64
			AND quarantine_downloaded_sha256 NOT GLOB '*[^0-9a-f]*')),
	CHECK (review_status <> 'approved' OR (archive_r2_key IS NOT NULL
		AND released_by IS NOT NULL AND released_at IS NOT NULL)),
	CHECK (quarantine_delete_state <> 'deleted' OR quarantine_purged_at IS NOT NULL)
);

CREATE INDEX authorization_documents_authorization
	ON authorization_documents (authorization_id, review_status, uploaded_at, id);

CREATE INDEX authorization_documents_quarantine_cleanup
	ON authorization_documents (quarantine_delete_state, quarantine_expires_at, review_status);

CREATE TRIGGER authorization_documents_insert_scope_and_limits
BEFORE INSERT ON authorization_documents
BEGIN
	SELECT RAISE(ABORT, 'authorization document scope mismatch')
	WHERE NOT EXISTS (
		SELECT 1 FROM funding_authorizations AS authorization
		JOIN individual_requests AS request ON request.id = authorization.request_id
		JOIN children AS child ON child.id = authorization.child_id
		JOIN users AS owner ON owner.id = authorization.user_id
		WHERE authorization.id = NEW.authorization_id
			AND authorization.user_id = NEW.user_id AND authorization.child_id = NEW.child_id
			AND authorization.status = 'pending_review'
			AND request.status IN ('draft', 'needs_documents', 'needs_info', 'pending_admin_review', 'approved')
			AND child.owner_user_id = owner.id
			AND child.family_number_id = owner.family_number_id AND child.is_current = 1
			AND owner.role = 'parent' AND owner.account_status = 'active'
			AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL
	);

	SELECT RAISE(ABORT, 'authorization document count limit exceeded')
	WHERE (SELECT COUNT(*) FROM authorization_documents AS current
		WHERE current.authorization_id = NEW.authorization_id
			AND current.deleted_at IS NULL AND current.replaced_by_document_id IS NULL) >= 5;

	SELECT RAISE(ABORT, 'authorization document total size limit exceeded')
	WHERE COALESCE((SELECT SUM(current.size_bytes) FROM authorization_documents AS current
		WHERE current.authorization_id = NEW.authorization_id
			AND current.deleted_at IS NULL AND current.replaced_by_document_id IS NULL), 0)
		+ NEW.size_bytes > 26214400;
END;

CREATE TRIGGER authorization_documents_immutable_upload
BEFORE UPDATE OF authorization_id, user_id, child_id, quarantine_r2_key,
	original_extension, mime_type, detected_type, size_bytes, sha256,
	upload_idempotency_key, upload_request_hash_sha256, uploaded_at,
	quarantine_expires_at, created_at ON authorization_documents
BEGIN
	SELECT RAISE(ABORT, 'authorization document upload identity is immutable');
END;

CREATE TRIGGER authorization_documents_allowed_transition
BEFORE UPDATE OF review_status ON authorization_documents
WHEN NEW.review_status <> OLD.review_status
BEGIN
	SELECT RAISE(ABORT, 'invalid authorization document transition')
	WHERE NOT (
		(OLD.review_status = 'quarantined'
			AND NEW.review_status IN ('clean', 'infected', 'rejected', 'deleted'))
		OR (OLD.review_status = 'clean'
			AND NEW.review_status IN ('approved', 'rejected', 'deleted'))
		OR (OLD.review_status IN ('infected', 'rejected') AND NEW.review_status = 'deleted')
	);
END;

CREATE TRIGGER authorization_documents_clean_evidence
BEFORE UPDATE OF review_status, scan_method, scanner_label, scanner_version,
	scan_attestation_text_version, scanned_at ON authorization_documents
WHEN NEW.review_status = 'clean' AND OLD.review_status <> 'clean'
BEGIN
	SELECT RAISE(ABORT, 'manual clean requires hash-bound download and attestation')
	WHERE NEW.scan_method <> 'manual_local_av'
		OR NEW.scanner_label IS NULL OR NEW.scanner_version IS NULL
		OR NEW.scan_attestation_text_version IS NULL OR NEW.scanned_at IS NULL
		OR NEW.scan_attested_by_admin_user_id IS NULL
		OR NEW.quarantine_downloaded_by_admin_user_id <> NEW.scan_attested_by_admin_user_id
		OR NEW.quarantine_downloaded_sha256 <> NEW.sha256
		OR NEW.download_audit_event_id IS NULL;
END;

CREATE TRIGGER authorization_documents_approval_evidence
BEFORE UPDATE OF review_status, archive_r2_key, released_by, released_at
	ON authorization_documents
WHEN NEW.review_status = 'approved' AND OLD.review_status <> 'approved'
BEGIN
	SELECT RAISE(ABORT, 'document approval requires clean business evidence')
	WHERE OLD.review_status <> 'clean' OR NEW.archive_r2_key IS NULL
		OR NEW.released_by IS NULL OR NEW.released_at IS NULL;
END;

CREATE TRIGGER funding_authorizations_approval_guard
BEFORE UPDATE OF status, valid_from, valid_until ON funding_authorizations
WHEN NEW.status = 'approved' AND OLD.status <> 'approved'
BEGIN
	SELECT RAISE(ABORT, 'funding approval requires inclusive dates and approved documents')
	WHERE NEW.valid_from IS NULL OR NEW.valid_until IS NULL OR NEW.valid_from > NEW.valid_until
		OR NOT EXISTS (
			SELECT 1 FROM authorization_documents AS document
			WHERE document.authorization_id = NEW.id
				AND document.deleted_at IS NULL AND document.replaced_by_document_id IS NULL
		)
		OR EXISTS (
			SELECT 1 FROM authorization_documents AS document
			WHERE document.authorization_id = NEW.id
				AND document.deleted_at IS NULL AND document.replaced_by_document_id IS NULL
				AND (document.review_status <> 'approved' OR document.archive_r2_key IS NULL)
		);
END;

CREATE TRIGGER individual_requests_nachhilfe_approval_guard
BEFORE UPDATE OF status ON individual_requests
WHEN NEW.status = 'approved' AND OLD.status <> 'approved' AND NEW.request_kind = 'nachhilfe'
BEGIN
	SELECT RAISE(ABORT, 'Nachhilfe request approval requires current approved funding')
	WHERE NOT EXISTS (
		SELECT 1 FROM funding_authorizations AS authorization
		WHERE authorization.request_id = NEW.id AND authorization.status = 'approved'
			AND authorization.kind = NEW.funding_kind
			AND EXISTS (SELECT 1 FROM authorization_documents AS document
				WHERE document.authorization_id = authorization.id
					AND document.review_status = 'approved'
					AND document.deleted_at IS NULL
					AND document.replaced_by_document_id IS NULL)
	);
END;

CREATE TABLE request_parent_actions (
	id TEXT PRIMARY KEY NOT NULL,
	request_id TEXT NOT NULL REFERENCES individual_requests(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	action TEXT NOT NULL CHECK (action IN ('save', 'submit', 'cancel', 'delete_document')),
	from_status TEXT NOT NULL,
	to_status TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	request_hash_sha256 TEXT NOT NULL
		CHECK (length(request_hash_sha256) = 64
			AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	created_at TEXT NOT NULL,
	UNIQUE (user_id, idempotency_key)
);

CREATE TABLE request_action_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	request_id TEXT NOT NULL REFERENCES individual_requests(id),
	action TEXT NOT NULL,
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TABLE document_scan_attestations (
	id TEXT PRIMARY KEY NOT NULL,
	document_id TEXT NOT NULL REFERENCES authorization_documents(id),
	document_sha256 TEXT NOT NULL,
	admin_user_id TEXT NOT NULL REFERENCES users(id),
	outcome TEXT NOT NULL CHECK (outcome IN ('clean', 'infected')),
	scanner_label TEXT NOT NULL,
	scanner_version TEXT NOT NULL,
	attestation_text_version TEXT NOT NULL,
	idempotency_record_id TEXT NOT NULL UNIQUE REFERENCES idempotency_records(id),
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	created_at TEXT NOT NULL
);

CREATE TABLE document_action_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	document_id TEXT NOT NULL REFERENCES authorization_documents(id),
	action TEXT NOT NULL,
	actor_user_id TEXT REFERENCES users(id),
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TABLE funding_lifecycle_events (
	id TEXT PRIMARY KEY NOT NULL,
	authorization_id TEXT NOT NULL REFERENCES funding_authorizations(id),
	request_id TEXT NOT NULL REFERENCES individual_requests(id),
	event_kind TEXT NOT NULL CHECK (event_kind IN ('revoked', 'superseded', 'expired')),
	effective_on TEXT NOT NULL,
	reason TEXT NOT NULL,
	actor_user_id TEXT REFERENCES users(id),
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	created_at TEXT NOT NULL,
	UNIQUE (authorization_id, event_kind, effective_on)
);

CREATE TABLE funding_action_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	authorization_id TEXT NOT NULL REFERENCES funding_authorizations(id),
	action TEXT NOT NULL,
	actor_user_id TEXT REFERENCES users(id),
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE TRIGGER request_parent_actions_reject_update
BEFORE UPDATE ON request_parent_actions
BEGIN SELECT RAISE(ABORT, 'request parent actions are append-only'); END;

CREATE TRIGGER request_parent_actions_reject_delete
BEFORE DELETE ON request_parent_actions
BEGIN SELECT RAISE(ABORT, 'request parent actions are retained evidence'); END;

CREATE TRIGGER request_action_assertions_reject_update
BEFORE UPDATE ON request_action_assertions
BEGIN SELECT RAISE(ABORT, 'request action assertions are append-only'); END;

CREATE TRIGGER request_action_assertions_reject_delete
BEFORE DELETE ON request_action_assertions
BEGIN SELECT RAISE(ABORT, 'request action assertions are retained evidence'); END;

CREATE TRIGGER document_scan_attestations_reject_update
BEFORE UPDATE ON document_scan_attestations
BEGIN SELECT RAISE(ABORT, 'document scan attestations are append-only'); END;

CREATE TRIGGER document_scan_attestations_reject_delete
BEFORE DELETE ON document_scan_attestations
BEGIN SELECT RAISE(ABORT, 'document scan attestations are retained evidence'); END;

CREATE TRIGGER document_action_assertions_reject_update
BEFORE UPDATE ON document_action_assertions
BEGIN SELECT RAISE(ABORT, 'document action assertions are append-only'); END;

CREATE TRIGGER document_action_assertions_reject_delete
BEFORE DELETE ON document_action_assertions
BEGIN SELECT RAISE(ABORT, 'document action assertions are retained evidence'); END;

CREATE TRIGGER funding_lifecycle_events_reject_update
BEFORE UPDATE ON funding_lifecycle_events
BEGIN SELECT RAISE(ABORT, 'funding lifecycle events are append-only'); END;

CREATE TRIGGER funding_lifecycle_events_reject_delete
BEFORE DELETE ON funding_lifecycle_events
BEGIN SELECT RAISE(ABORT, 'funding lifecycle events are retained evidence'); END;

CREATE TRIGGER funding_action_assertions_reject_update
BEFORE UPDATE ON funding_action_assertions
BEGIN SELECT RAISE(ABORT, 'funding action assertions are append-only'); END;

CREATE TRIGGER funding_action_assertions_reject_delete
BEFORE DELETE ON funding_action_assertions
BEGIN SELECT RAISE(ABORT, 'funding action assertions are retained evidence'); END;

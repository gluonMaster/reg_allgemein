PRAGMA foreign_keys = ON;

CREATE TABLE users (
	id TEXT PRIMARY KEY NOT NULL,
	email TEXT NOT NULL,
	email_normalized TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	pending_email TEXT,
	pending_email_normalized TEXT,
	pending_email_expires_at TEXT,
	email_version INTEGER NOT NULL DEFAULT 1 CHECK (email_version > 0),
	email_verified_at TEXT,
	role TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'admin')),
	is_blocked INTEGER NOT NULL DEFAULT 0 CHECK (is_blocked IN (0, 1)),
	account_status TEXT NOT NULL DEFAULT 'active'
		CHECK (account_status IN ('active', 'deletion_requested', 'closed')),
	closed_at TEXT,
	first_name TEXT NOT NULL,
	last_name TEXT NOT NULL,
	first_name_normalized TEXT NOT NULL,
	last_name_normalized TEXT NOT NULL,
	phone TEXT,
	preferred_language TEXT NOT NULL DEFAULT 'de',
	family_number_id TEXT REFERENCES family_number_allocations(id),
	family_assignment_status TEXT NOT NULL DEFAULT 'pending_verification'
		CHECK (family_assignment_status IN ('pending_verification', 'assigned', 'review_required')),
	family_version INTEGER NOT NULL DEFAULT 0 CHECK (family_version >= 0),
	family_assignment_import_run_id TEXT REFERENCES import_runs(id),
	privacy_notice_version TEXT NOT NULL,
	privacy_accepted_at TEXT NOT NULL,
	session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version > 0),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (
		(pending_email IS NULL AND pending_email_normalized IS NULL AND pending_email_expires_at IS NULL)
		OR
		(pending_email IS NOT NULL AND pending_email_normalized IS NOT NULL AND pending_email_expires_at IS NOT NULL)
	),
	CHECK (
		(account_status = 'closed' AND closed_at IS NOT NULL)
		OR
		(account_status <> 'closed' AND closed_at IS NULL)
	)
);

CREATE UNIQUE INDEX users_pending_email_unique
	ON users (pending_email_normalized)
	WHERE pending_email_normalized IS NOT NULL;

CREATE INDEX users_role_status ON users (role, account_status, is_blocked);

CREATE TRIGGER users_current_email_rejects_pending_insert
BEFORE INSERT ON users
WHEN EXISTS (
	SELECT 1 FROM users
	WHERE pending_email_normalized = NEW.email_normalized
)
BEGIN
	SELECT RAISE(IGNORE);
END;

CREATE TRIGGER users_current_email_rejects_pending_update
BEFORE UPDATE OF email_normalized ON users
WHEN EXISTS (
	SELECT 1 FROM users
	WHERE pending_email_normalized = NEW.email_normalized
		AND id <> NEW.id
)
BEGIN
	SELECT RAISE(IGNORE);
END;

CREATE TRIGGER users_pending_email_rejects_current_insert
BEFORE INSERT ON users
WHEN NEW.pending_email_normalized IS NOT NULL AND EXISTS (
	SELECT 1 FROM users
	WHERE email_normalized = NEW.pending_email_normalized
)
BEGIN
	SELECT RAISE(IGNORE);
END;

CREATE TRIGGER users_pending_email_rejects_current_update
BEFORE UPDATE OF pending_email_normalized ON users
WHEN NEW.pending_email_normalized IS NOT NULL AND EXISTS (
	SELECT 1 FROM users
	WHERE email_normalized = NEW.pending_email_normalized
		AND id <> NEW.id
)
BEGIN
	SELECT RAISE(IGNORE);
END;

CREATE TABLE privacy_acknowledgements (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id),
	privacy_notice_version TEXT NOT NULL,
	acknowledged_at TEXT NOT NULL,
	evidence_hash TEXT NOT NULL
		CHECK (length(evidence_hash) = 64 AND evidence_hash NOT GLOB '*[^0-9a-f]*'),
	source_context TEXT NOT NULL,
	created_at TEXT NOT NULL,
	UNIQUE (user_id, privacy_notice_version)
);

CREATE TRIGGER privacy_acknowledgements_reject_update
BEFORE UPDATE ON privacy_acknowledgements
BEGIN
	SELECT RAISE(ABORT, 'privacy acknowledgements are append-only');
END;

CREATE TRIGGER privacy_acknowledgements_reject_delete
BEFORE DELETE ON privacy_acknowledgements
BEGIN
	SELECT RAISE(ABORT, 'privacy acknowledgements are append-only');
END;

CREATE TABLE auth_tokens (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id),
	kind TEXT NOT NULL
		CHECK (kind IN ('email_verification', 'password_reset', 'legacy_email_claim')),
	token_hash TEXT NOT NULL UNIQUE
		CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
	target_email_normalized TEXT,
	email_version INTEGER,
	legacy_family_id TEXT REFERENCES legacy_families(id),
	family_version INTEGER,
	expires_at TEXT NOT NULL,
	used_at TEXT,
	used_by_request_id TEXT,
	requested_subject_hash TEXT
		CHECK (requested_subject_hash IS NULL OR (
			length(requested_subject_hash) = 64
			AND requested_subject_hash NOT GLOB '*[^0-9a-f]*'
		)),
	created_at TEXT NOT NULL,
	CHECK (
		(kind NOT IN ('email_verification', 'password_reset'))
		OR (target_email_normalized IS NOT NULL AND email_version IS NOT NULL)
	),
	CHECK (
		(used_at IS NULL AND used_by_request_id IS NULL)
		OR (used_at IS NOT NULL AND used_by_request_id IS NOT NULL)
	)
);

CREATE INDEX auth_tokens_user_kind_created
	ON auth_tokens (user_id, kind, created_at DESC);

CREATE INDEX auth_tokens_expiry
	ON auth_tokens (expires_at, used_at);

CREATE TABLE auth_verification_commits (
	request_id TEXT PRIMARY KEY NOT NULL,
	token_id TEXT NOT NULL UNIQUE REFERENCES auth_tokens(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	target_email_normalized TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE INDEX auth_verification_commits_user
	ON auth_verification_commits (user_id, created_at);

CREATE TABLE auth_sessions (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id),
	jti_hash TEXT NOT NULL UNIQUE
		CHECK (length(jti_hash) = 64 AND jti_hash NOT GLOB '*[^0-9a-f]*'),
	csrf_hash TEXT NOT NULL
		CHECK (length(csrf_hash) = 64 AND csrf_hash NOT GLOB '*[^0-9a-f]*'),
	session_version INTEGER NOT NULL CHECK (session_version > 0),
	expires_at TEXT NOT NULL,
	revoked_at TEXT,
	revocation_reason TEXT,
	created_at TEXT NOT NULL,
	last_seen_at TEXT NOT NULL,
	CHECK (
		(revoked_at IS NULL AND revocation_reason IS NULL)
		OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
	)
);

CREATE INDEX auth_sessions_user_active
	ON auth_sessions (user_id, revoked_at, expires_at);

CREATE TABLE email_outbox (
	id TEXT PRIMARY KEY NOT NULL,
	source_kind TEXT NOT NULL,
	source_id TEXT NOT NULL,
	template_or_category TEXT NOT NULL,
	recipient_user_id TEXT NOT NULL REFERENCES users(id),
	recipient_address_kind TEXT NOT NULL
		CHECK (recipient_address_kind IN ('current', 'pending')),
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
	created_at TEXT NOT NULL
);

CREATE INDEX email_outbox_due
	ON email_outbox (status, not_before, next_attempt_at);

CREATE INDEX email_outbox_source
	ON email_outbox (source_kind, source_id);

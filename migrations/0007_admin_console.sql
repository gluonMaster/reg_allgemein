PRAGMA foreign_keys = ON;

-- A FamilyID correction is intentionally split into a persisted preview and a
-- later confirmed apply. The preview binds the selected destination, current
-- family version, affected-child cardinality and feature-contributor effects so
-- that the apply transaction can fail closed when any of them changes.
CREATE TABLE admin_family_correction_previews (
	id TEXT PRIMARY KEY NOT NULL,
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	from_family_number_id TEXT NOT NULL REFERENCES family_number_allocations(id),
	to_family_number_id TEXT NOT NULL REFERENCES family_number_allocations(id),
	destination_kind TEXT NOT NULL
		CHECK (destination_kind IN ('legacy_existing', 'portal_allocated')),
	legacy_version_id TEXT REFERENCES legacy_versions(id),
	legacy_import_run_id TEXT REFERENCES import_runs(id),
	family_version_before INTEGER NOT NULL CHECK (family_version_before > 0),
	owned_child_count INTEGER NOT NULL CHECK (owned_child_count >= 0),
	destination_child_count INTEGER NOT NULL CHECK (destination_child_count >= 0),
	children_snapshot_hash TEXT NOT NULL
		CHECK (length(children_snapshot_hash) = 64 AND children_snapshot_hash NOT GLOB '*[^0-9a-f]*'),
	consequence_snapshot_json TEXT NOT NULL DEFAULT '{}'
		CHECK (
			json_valid(consequence_snapshot_json)
			AND json_type(consequence_snapshot_json) = 'object'
		),
	consequence_snapshot_hash TEXT NOT NULL
		CHECK (
			length(consequence_snapshot_hash) = 64
			AND consequence_snapshot_hash NOT GLOB '*[^0-9a-f]*'
		),
	status TEXT NOT NULL DEFAULT 'ready'
		CHECK (status IN ('ready', 'applied', 'stale', 'cancelled')),
	applied_reassignment_id TEXT REFERENCES family_reassignments(id),
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (from_family_number_id <> to_family_number_id),
	CHECK (
		(destination_kind = 'legacy_existing' AND legacy_version_id IS NOT NULL
			AND legacy_import_run_id IS NOT NULL)
		OR
		(destination_kind = 'portal_allocated' AND legacy_version_id IS NULL
			AND legacy_import_run_id IS NULL)
	),
	CHECK (
		(status = 'applied' AND applied_reassignment_id IS NOT NULL)
		OR (status <> 'applied' AND applied_reassignment_id IS NULL)
	)
);

CREATE INDEX admin_family_correction_previews_user_status
	ON admin_family_correction_previews (user_id, status, created_at DESC);

CREATE INDEX admin_family_correction_previews_expiry
	ON admin_family_correction_previews (status, expires_at);

CREATE TABLE admin_family_correction_preview_children (
	preview_id TEXT NOT NULL REFERENCES admin_family_correction_previews(id),
	child_id TEXT NOT NULL REFERENCES children(id),
	effect_kind TEXT NOT NULL CHECK (effect_kind IN ('owned_switch', 'destination_claim')),
	expected_owner_user_id TEXT REFERENCES users(id),
	expected_family_number_id TEXT NOT NULL REFERENCES family_number_allocations(id),
	created_at TEXT NOT NULL,
	PRIMARY KEY (preview_id, child_id),
	CHECK (
		(effect_kind = 'owned_switch' AND expected_owner_user_id IS NOT NULL)
		OR (effect_kind = 'destination_claim' AND expected_owner_user_id IS NULL)
	)
);

CREATE INDEX admin_family_correction_preview_children_child
	ON admin_family_correction_preview_children (child_id, preview_id);

CREATE TRIGGER admin_family_correction_preview_children_reject_update
BEFORE UPDATE ON admin_family_correction_preview_children
BEGIN
	SELECT RAISE(ABORT, 'family correction preview children are immutable');
END;

CREATE TRIGGER admin_family_correction_preview_children_reject_delete
BEFORE DELETE ON admin_family_correction_preview_children
BEGIN
	SELECT RAISE(ABORT, 'family correction preview children are retained evidence');
END;

CREATE TRIGGER admin_family_correction_preview_immutable_context
BEFORE UPDATE OF actor_user_id, user_id, from_family_number_id,
	to_family_number_id, destination_kind, legacy_version_id,
	legacy_import_run_id, family_version_before, owned_child_count,
	destination_child_count, children_snapshot_hash, consequence_snapshot_json,
	consequence_snapshot_hash, expires_at, created_at
	ON admin_family_correction_previews
BEGIN
	SELECT RAISE(ABORT, 'family correction preview context is immutable');
END;

CREATE TRIGGER admin_family_correction_preview_reject_delete
BEFORE DELETE ON admin_family_correction_previews
BEGIN
	SELECT RAISE(ABORT, 'family correction previews are retained evidence');
END;

CREATE TRIGGER family_reassignments_admin_requires_confirmed_reason
BEFORE INSERT ON family_reassignments
WHEN NEW.source = 'admin_correction'
BEGIN
	SELECT RAISE(ABORT, 'admin family correction requires a reason')
	WHERE length(trim(coalesce(NEW.reason_note, ''))) = 0;
END;

CREATE TABLE admin_action_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	scope TEXT NOT NULL,
	idempotency_record_id TEXT NOT NULL UNIQUE REFERENCES idempotency_records(id),
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	target_kind TEXT NOT NULL,
	target_id TEXT NOT NULL,
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE INDEX admin_action_assertions_target
	ON admin_action_assertions (target_kind, target_id, created_at);

CREATE TRIGGER admin_action_assertions_reject_update
BEFORE UPDATE ON admin_action_assertions
BEGIN
	SELECT RAISE(ABORT, 'admin action assertions are append-only');
END;

CREATE TRIGGER admin_action_assertions_reject_delete
BEFORE DELETE ON admin_action_assertions
BEGIN
	SELECT RAISE(ABORT, 'admin action assertions are append-only');
END;

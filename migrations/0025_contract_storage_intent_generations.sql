PRAGMA foreign_keys = ON;

-- A deterministic contract-template intent can be retried after orphan cleanup.
-- Each retry receives a new immutable row and R2 key, so a stale cleanup lease
-- can only delete the object belonging to the generation it actually claimed.
ALTER TABLE storage_object_intents ADD COLUMN intent_family_id TEXT;
ALTER TABLE storage_object_intents ADD COLUMN generation INTEGER NOT NULL DEFAULT 1
	CHECK (generation >= 1);
ALTER TABLE storage_object_intents ADD COLUMN installer_owner TEXT;
ALTER TABLE storage_object_intents ADD COLUMN installer_lease_until TEXT;

UPDATE storage_object_intents SET intent_family_id = id WHERE intent_family_id IS NULL;

CREATE UNIQUE INDEX storage_object_intents_family_generation
	ON storage_object_intents (intent_family_id, generation);
CREATE INDEX storage_object_intents_family_latest
	ON storage_object_intents (intent_family_id, generation DESC, id);

CREATE TABLE storage_intent_generations (
	intent_id TEXT PRIMARY KEY NOT NULL REFERENCES storage_object_intents(id),
	intent_family_id TEXT NOT NULL,
	generation INTEGER NOT NULL CHECK (generation >= 1),
	storage_class TEXT NOT NULL CHECK (storage_class IN ('archive', 'quarantine')),
	object_key TEXT NOT NULL UNIQUE,
	object_kind TEXT NOT NULL,
	source_ref TEXT,
	sha256 TEXT NOT NULL CHECK (
		length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'
	),
	size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
	installer_owner TEXT,
	created_at TEXT NOT NULL,
	UNIQUE (intent_family_id, generation)
);

INSERT INTO storage_intent_generations
	(intent_id, intent_family_id, generation, storage_class, object_key, object_kind,
	 source_ref, sha256, size_bytes, installer_owner, created_at)
SELECT id, intent_family_id, generation, storage_class, object_key, object_kind,
	source_ref, sha256, size_bytes, installer_owner, created_at
FROM storage_object_intents;

CREATE TRIGGER storage_object_intents_lineage_required
BEFORE INSERT ON storage_object_intents
WHEN NEW.intent_family_id IS NULL OR NEW.generation < 1
BEGIN SELECT RAISE(ABORT, 'storage intent lineage is required'); END;

CREATE TRIGGER storage_object_intents_lineage_immutable
BEFORE UPDATE ON storage_object_intents
WHEN OLD.intent_family_id IS NOT NEW.intent_family_id
	OR OLD.generation IS NOT NEW.generation
	OR OLD.object_key IS NOT NEW.object_key
BEGIN SELECT RAISE(ABORT, 'storage intent generation is immutable'); END;

CREATE TRIGGER storage_object_intents_generation_audit
AFTER INSERT ON storage_object_intents
BEGIN
	INSERT INTO storage_intent_generations
		(intent_id, intent_family_id, generation, storage_class, object_key, object_kind,
		 source_ref, sha256, size_bytes, installer_owner, created_at)
	VALUES (NEW.id, NEW.intent_family_id, NEW.generation, NEW.storage_class,
		NEW.object_key, NEW.object_kind, NEW.source_ref, NEW.sha256, NEW.size_bytes,
		NEW.installer_owner, NEW.created_at);
END;

CREATE TRIGGER storage_intent_generations_reject_update
BEFORE UPDATE ON storage_intent_generations
BEGIN SELECT RAISE(ABORT, 'storage intent generations are append-only'); END;

CREATE TRIGGER storage_intent_generations_reject_delete
BEFORE DELETE ON storage_intent_generations
BEGIN SELECT RAISE(ABORT, 'storage intent generations are append-only'); END;

PRAGMA foreign_key_check;

PRAGMA foreign_keys = ON;

-- The guest now receives two letters with different jobs: the short verification request and,
-- after confirmation, the letter that states the registration with the building address.
-- The table keeps UNIQUE(request_id, verification_version) and is referenced by
-- trial_intake_delete_inflight_guard, so it is extended instead of rebuilt: a confirmation row
-- takes verification_version = 0, a value verification never uses because versions start at 1.
ALTER TABLE trial_intake_email_outbox
 ADD COLUMN kind TEXT NOT NULL DEFAULT 'verification'
 CHECK(kind IN ('verification','confirmation'));

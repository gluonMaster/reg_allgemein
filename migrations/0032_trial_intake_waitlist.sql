PRAGMA foreign_keys = ON;

-- Waitlist for planned courses (TRIAL_INTAKE_WAITLIST, WL-01-15). One migration carries the
-- whole feature so the deploy applies a single schema step. It is additive: the new column has
-- a default and the new triggers hang only on the new tables, so the previous Worker keeps
-- working against this schema.
--
-- course_key is the course entity of WL-15 (OQ-051), computed by plannedCourseKey() in
-- src/lib/trial-intake/planned.ts: JSON [weekday, subject, start, minutes, teacher, building,
-- age]. Price, queue and start belong to it, not to the group name. The duration sits at $[3];
-- the rebind guards read it from the key itself, so no separate column can contradict it.

-- A waitlist signup reuses the request row: contacts, children, verification, receipt,
-- idempotency and retention. A waitlist request has no trial_intake_items, so the trial list
-- never shows it.
ALTER TABLE trial_intake_requests
 ADD COLUMN kind TEXT NOT NULL DEFAULT 'trial' CHECK(kind IN ('trial','waitlist'));

-- Prices entered by an admin, per child and month. Prices are not personal data. The course
-- fields and the last seen room are kept for display after the card left the schedule.
-- attention_reasons_json: reasons of the orange mark (WL-15); NULL means no mark.
CREATE TABLE trial_intake_planned_prices (
 course_key TEXT PRIMARY KEY NOT NULL CHECK(json_valid(course_key)),
 subject TEXT NOT NULL,
 weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),
 start_time TEXT NOT NULL,
 end_time TEXT NOT NULL,
 teacher TEXT NOT NULL,
 building TEXT NOT NULL CHECK(building IN ('Kolibri','Villa')),
 room TEXT NOT NULL,
 age_min INTEGER, age_max INTEGER,
 monthly_cents INTEGER NOT NULL CHECK(monthly_cents BETWEEN 1 AND 100000),
 yearly_cents INTEGER NOT NULL CHECK(yearly_cents BETWEEN 1 AND 100000),
 min_participants INTEGER NOT NULL DEFAULT 3 CHECK(min_participants BETWEEN 1 AND 30),
 attention_reasons_json TEXT CHECK(attention_reasons_json IS NULL OR json_valid(attention_reasons_json)),
 updated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

-- A course start by an admin (WL-10) with the catalog lesson at that moment: the start letter
-- and PDF take time and place from here. "Als neuen Kurs öffnen" sets reopened_at; only one
-- open start may exist per course.
CREATE TABLE trial_intake_waitlist_starts (
 id TEXT PRIMARY KEY NOT NULL,
 course_key TEXT NOT NULL CHECK(json_valid(course_key)),
 first_date TEXT NOT NULL,
 lesson_json TEXT NOT NULL CHECK(json_valid(lesson_json)),
 participants INTEGER NOT NULL CHECK(participants > 0),
 started_by TEXT NOT NULL REFERENCES users(id),
 started_at TEXT NOT NULL,
 reopened_by TEXT REFERENCES users(id),
 reopened_at TEXT,
 CHECK((reopened_at IS NULL) = (reopened_by IS NULL))
);
CREATE UNIQUE INDEX trial_intake_waitlist_open_start
 ON trial_intake_waitlist_starts(course_key) WHERE reopened_at IS NULL;

-- Append-only journal of queue rebinds (WL-15): from and to course with card snapshots, the
-- kind plain|notify|price, differences and reasons, the sums before and after.
CREATE TABLE trial_intake_waitlist_rebinds (
 id TEXT PRIMARY KEY NOT NULL,
 from_key TEXT NOT NULL CHECK(json_valid(from_key)),
 to_key TEXT NOT NULL CHECK(json_valid(to_key) AND to_key <> from_key),
 from_lesson_json TEXT NOT NULL CHECK(json_valid(from_lesson_json)),
 to_lesson_json TEXT NOT NULL CHECK(json_valid(to_lesson_json)),
 kind TEXT NOT NULL CHECK(kind IN ('plain','notify','price')),
 differences_json TEXT NOT NULL CHECK(json_valid(differences_json)),
 from_monthly_cents INTEGER NOT NULL, from_yearly_cents INTEGER NOT NULL,
 to_monthly_cents INTEGER NOT NULL CHECK(to_monthly_cents BETWEEN 1 AND 100000),
 to_yearly_cents INTEGER NOT NULL CHECK(to_yearly_cents BETWEEN 1 AND 100000),
 actor_user_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL
);
CREATE INDEX trial_intake_waitlist_rebinds_from ON trial_intake_waitlist_rebinds(from_key, created_at);

-- A waitlist signup, 1:1 with its request; deleting the request deletes it. The snapshot is
-- what the family agreed to: lesson, tariff, both sums shown, threshold, consent text version.
-- status 'waiting' covers the unconfirmed and the confirmed entry before the start: both lock
-- the price (WL-06). The withdrawal link token is stored as its hash only.
CREATE TABLE trial_intake_waitlist_entries (
 request_id TEXT PRIMARY KEY NOT NULL REFERENCES trial_intake_requests(id) ON DELETE CASCADE,
 course_key TEXT NOT NULL CHECK(json_valid(course_key)),
 lesson_json TEXT NOT NULL CHECK(json_valid(lesson_json)),
 tariff TEXT NOT NULL CHECK(tariff IN ('monthly','yearly')),
 monthly_cents INTEGER NOT NULL CHECK(monthly_cents BETWEEN 1 AND 100000),
 yearly_cents INTEGER NOT NULL CHECK(yearly_cents BETWEEN 1 AND 100000),
 min_participants INTEGER NOT NULL CHECK(min_participants BETWEEN 1 AND 30),
 consent_version TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'waiting'
  CHECK(status IN ('waiting','started','withdrawn','cancelled','expired')),
 start_id TEXT REFERENCES trial_intake_waitlist_starts(id),
 withdraw_nonce TEXT NOT NULL,
 withdraw_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 status_changed_at TEXT NOT NULL,
 CHECK(status <> 'started' OR start_id IS NOT NULL)
);
CREATE INDEX trial_intake_waitlist_entries_course ON trial_intake_waitlist_entries(course_key, status);

-- The admin's call after a duration change: the family accepts the new sum of its own tariff
-- or declines. The red mark is computed from these rows, see WL-15.
CREATE TABLE trial_intake_waitlist_price_confirmations (
 request_id TEXT NOT NULL REFERENCES trial_intake_waitlist_entries(request_id) ON DELETE CASCADE,
 rebind_id TEXT NOT NULL REFERENCES trial_intake_waitlist_rebinds(id),
 decision TEXT NOT NULL CHECK(decision IN ('confirmed','declined')),
 price_cents INTEGER CHECK(price_cents IS NULL OR price_cents BETWEEN 1 AND 100000),
 actor_user_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(request_id, rebind_id),
 CHECK((decision = 'confirmed') = (price_cents IS NOT NULL))
);

-- Start letters and admin probes. Verification and confirmation letters stay in
-- trial_intake_email_outbox; this table is separate like the alerts of 0031, so cancelling a
-- stale verification never touches a start letter. A probe goes to the signed-in admin.
CREATE TABLE trial_intake_waitlist_email_outbox (
 id TEXT PRIMARY KEY NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('start','probe')),
 request_id TEXT NOT NULL REFERENCES trial_intake_requests(id) ON DELETE CASCADE,
 start_id TEXT REFERENCES trial_intake_waitlist_starts(id),
 probe_date TEXT,
 probe_recipient_user_id TEXT REFERENCES users(id),
 dedupe_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','retry','sent','dead','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,
 max_attempts INTEGER NOT NULL DEFAULT 5,
 next_attempt_at TEXT,
 lease_owner TEXT, lease_until TEXT,
 provider_request_id TEXT, last_error_code TEXT,
 pdf_sha256 TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sent_at TEXT,
 CHECK((kind = 'start' AND start_id IS NOT NULL AND probe_date IS NULL AND probe_recipient_user_id IS NULL)
  OR (kind = 'probe' AND start_id IS NULL AND probe_date IS NOT NULL AND probe_recipient_user_id IS NOT NULL))
);
CREATE INDEX trial_intake_waitlist_email_queue
 ON trial_intake_waitlist_email_outbox(status, next_attempt_at, created_at);

-- The PDF of a start letter, created once and resent unchanged; probe PDFs are not stored.
CREATE TABLE trial_intake_waitlist_documents (
 request_id TEXT NOT NULL REFERENCES trial_intake_requests(id) ON DELETE CASCADE,
 start_id TEXT NOT NULL REFERENCES trial_intake_waitlist_starts(id),
 pdf BLOB NOT NULL CHECK(length(pdf) BETWEEN 1 AND 1048576),
 sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
 byte_size INTEGER NOT NULL CHECK(byte_size = length(pdf)),
 renderer TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(request_id, start_id)
);

-- Browser Run time for BROWSER_RUN_DAILY_BUDGET_MS. One row per render, without any family data.
CREATE TABLE trial_intake_waitlist_render_usage (
 id TEXT PRIMARY KEY NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('start','probe')),
 renderer TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('succeeded','failed')),
 error_code TEXT,
 browser_ms_used INTEGER CHECK(browser_ms_used IS NULL OR browser_ms_used >= 0),
 created_at TEXT NOT NULL
);
CREATE INDEX trial_intake_waitlist_render_usage_day ON trial_intake_waitlist_render_usage(created_at);

-- Price contour WL-06: a family that agreed to a sum gets exactly that sum. The server checks
-- the same and explains the refusal; these triggers hold for every application path and race.

-- 1. The snapshot of an entry never changes after insert.
CREATE TRIGGER trial_intake_waitlist_snapshot_immutable
BEFORE UPDATE ON trial_intake_waitlist_entries
WHEN NEW.request_id IS NOT OLD.request_id OR NEW.lesson_json IS NOT OLD.lesson_json
 OR NEW.tariff IS NOT OLD.tariff OR NEW.monthly_cents IS NOT OLD.monthly_cents
 OR NEW.yearly_cents IS NOT OLD.yearly_cents OR NEW.min_participants IS NOT OLD.min_participants
 OR NEW.consent_version IS NOT OLD.consent_version OR NEW.withdraw_nonce IS NOT OLD.withdraw_nonce
 OR NEW.withdraw_hash IS NOT OLD.withdraw_hash OR NEW.created_at IS NOT OLD.created_at
BEGIN
 SELECT RAISE(ABORT, 'waitlist snapshot is immutable');
END;

-- 2. A new entry carries exactly the current price of its course.
CREATE TRIGGER trial_intake_waitlist_entry_price_match
BEFORE INSERT ON trial_intake_waitlist_entries
BEGIN
 SELECT RAISE(ABORT, 'waitlist entry price does not match the course price') WHERE NOT EXISTS(
  SELECT 1 FROM trial_intake_planned_prices p WHERE p.course_key = NEW.course_key
   AND p.monthly_cents = NEW.monthly_cents AND p.yearly_cents = NEW.yearly_cents);
END;

-- 3. A started course takes no new entries until an admin opens it as a new course.
CREATE TRIGGER trial_intake_waitlist_entry_after_start
BEFORE INSERT ON trial_intake_waitlist_entries
BEGIN
 SELECT RAISE(ABORT, 'waitlist entry must start waiting') WHERE NEW.status <> 'waiting';
 SELECT RAISE(ABORT, 'waitlist course already started') WHERE EXISTS(
  SELECT 1 FROM trial_intake_waitlist_starts s
  WHERE s.course_key = NEW.course_key AND s.reopened_at IS NULL);
END;

-- 4. While a course has a waiting entry, its sums and its key cannot change; the threshold can.
CREATE TRIGGER trial_intake_waitlist_price_locked_update
BEFORE UPDATE OF course_key, monthly_cents, yearly_cents ON trial_intake_planned_prices
WHEN (NEW.course_key IS NOT OLD.course_key OR NEW.monthly_cents IS NOT OLD.monthly_cents
  OR NEW.yearly_cents IS NOT OLD.yearly_cents)
 AND EXISTS(SELECT 1 FROM trial_intake_waitlist_entries e
  WHERE e.course_key = OLD.course_key AND e.status = 'waiting')
BEGIN
 SELECT RAISE(ABORT, 'waitlist price locked by active entries');
END;

-- 5. Under the same condition the price cannot be deleted.
CREATE TRIGGER trial_intake_waitlist_price_locked_delete
BEFORE DELETE ON trial_intake_planned_prices
WHEN EXISTS(SELECT 1 FROM trial_intake_waitlist_entries e
 WHERE e.course_key = OLD.course_key AND e.status = 'waiting')
BEGIN
 SELECT RAISE(ABORT, 'waitlist price locked by active entries');
END;

-- 6. Only a rebind moves a waiting entry: a journal row from its course to the new one must
-- exist, and the price of the new course must equal the journal's sums.
CREATE TRIGGER trial_intake_waitlist_entry_rebind_journal
BEFORE UPDATE OF course_key ON trial_intake_waitlist_entries
WHEN NEW.course_key IS NOT OLD.course_key
BEGIN
 SELECT RAISE(ABORT, 'waitlist only a waiting entry can be rebound') WHERE OLD.status <> 'waiting';
 SELECT RAISE(ABORT, 'waitlist rebind requires a journal row') WHERE NOT EXISTS(
  SELECT 1 FROM trial_intake_waitlist_rebinds j
  JOIN trial_intake_planned_prices p ON p.course_key = j.to_key
   AND p.monthly_cents = j.to_monthly_cents AND p.yearly_cents = j.to_yearly_cents
  WHERE j.from_key = OLD.course_key AND j.to_key = NEW.course_key);
END;

-- 7. A journal row records the real price of the old course. Without a duration change the
-- sums stay the same; the kind 'price' is exactly the duration change.
CREATE TRIGGER trial_intake_waitlist_rebind_sums
BEFORE INSERT ON trial_intake_waitlist_rebinds
BEGIN
 SELECT RAISE(ABORT, 'waitlist rebind kind price requires a duration change')
  WHERE (NEW.kind = 'price') <> (json_extract(NEW.from_key, '$[3]') <> json_extract(NEW.to_key, '$[3]'));
 SELECT RAISE(ABORT, 'waitlist rebind without a duration change keeps the sums')
  WHERE NEW.kind <> 'price' AND (NEW.from_monthly_cents <> NEW.to_monthly_cents
   OR NEW.from_yearly_cents <> NEW.to_yearly_cents);
 SELECT RAISE(ABORT, 'waitlist rebind must record the current price') WHERE NOT EXISTS(
  SELECT 1 FROM trial_intake_planned_prices p WHERE p.course_key = NEW.from_key
   AND p.monthly_cents = NEW.from_monthly_cents AND p.yearly_cents = NEW.from_yearly_cents);
END;

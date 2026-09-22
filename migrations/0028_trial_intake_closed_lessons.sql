PRAGMA foreign_keys = ON;

-- A full group stops accepting trial requests. The schedule is a separate project and
-- knows nothing about capacity, so the closure lives here and is edited by an admin.
-- match_key is JSON ["subject","group",weekday] after trim/NFC/lower-case, so the record
-- survives an ordinary schedule edit: time, room, teacher and building may all change.
-- subject/group_name keep their original spelling for display only.
CREATE TABLE trial_intake_closed_lessons (
 match_key TEXT PRIMARY KEY NOT NULL,
 subject TEXT NOT NULL,
 group_name TEXT NOT NULL,
 weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),
 closed_by TEXT NOT NULL REFERENCES users(id),
 closed_at TEXT NOT NULL
);

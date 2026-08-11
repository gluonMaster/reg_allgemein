PRAGMA foreign_keys = ON;

-- Bounded, PII-free counters for application-level Worker failures. One row per
-- UTC minute prevents an error storm from creating an unbounded event stream.
CREATE TABLE worker_error_buckets (
	minute_bucket TEXT PRIMARY KEY NOT NULL,
	error_count INTEGER NOT NULL CHECK (error_count > 0),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX worker_error_buckets_retention
	ON worker_error_buckets (updated_at, minute_bucket);

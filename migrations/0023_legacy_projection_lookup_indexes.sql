PRAGMA foreign_keys = ON;

-- The atomic legacy projection refreshes existing rows by their immutable
-- snapshot identifiers.  Without these version-scoped lookup indexes, each
-- correlated projection subquery scans the full 1703-row snapshot and can
-- exceed D1's per-query execution limit.
CREATE INDEX legacy_snapshot_families_version_family_lookup
	ON legacy_snapshot_families (legacy_version_id, legacy_family_id);

CREATE INDEX legacy_snapshot_children_version_child_lookup
	ON legacy_snapshot_children (legacy_version_id, legacy_child_id);

CREATE INDEX legacy_snapshot_source_rows_version_row_lookup
	ON legacy_snapshot_source_rows (legacy_version_id, legacy_source_row_id);

CREATE INDEX legacy_snapshot_enrollments_version_enrollment_lookup
	ON legacy_snapshot_enrollments (legacy_version_id, legacy_enrollment_id);

CREATE INDEX legacy_source_rows_current_child_lookup
	ON legacy_source_rows (child_id)
	WHERE is_current = 1;

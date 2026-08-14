PRAGMA foreign_keys = ON;

CREATE TABLE legacy_import_release_plans (
	id TEXT PRIMARY KEY NOT NULL,
	plan_digest_sha256 TEXT NOT NULL UNIQUE
		CHECK (length(plan_digest_sha256) = 64 AND plan_digest_sha256 NOT GLOB '*[^0-9a-f]*'),
	staged_digest_sha256 TEXT NOT NULL UNIQUE
		CHECK (length(staged_digest_sha256) = 64 AND staged_digest_sha256 NOT GLOB '*[^0-9a-f]*'),
	environment TEXT NOT NULL CHECK (environment IN ('preview', 'production')),
	target_database_id TEXT NOT NULL
		CHECK (length(target_database_id) = 36 AND target_database_id GLOB '[0-9a-f-]*'),
	git_commit_sha TEXT NOT NULL
		CHECK (
			length(git_commit_sha) BETWEEN 40 AND 64
			AND git_commit_sha NOT GLOB '*[^0-9a-f]*'
		),
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	plusbtext_run_id TEXT NOT NULL UNIQUE REFERENCES import_runs(id),
	access_run_id TEXT NOT NULL UNIQUE REFERENCES import_runs(id),
	plusbtext_version_id TEXT NOT NULL UNIQUE REFERENCES plusbtext_versions(id),
	access_version_id TEXT NOT NULL UNIQUE REFERENCES legacy_versions(id),
	expected_current_plusbtext_version_id TEXT REFERENCES plusbtext_versions(id),
	expected_current_access_version_id TEXT REFERENCES legacy_versions(id),
	safe_summary_json TEXT NOT NULL DEFAULT '{}'
		CHECK (json_valid(safe_summary_json) AND json_type(safe_summary_json) = 'object'),
	status TEXT NOT NULL CHECK (status IN ('staged', 'reviewed', 'promoted', 'rolled_back')),
	review_digest_sha256 TEXT UNIQUE
		CHECK (
			review_digest_sha256 IS NULL OR (
				length(review_digest_sha256) = 64
				AND review_digest_sha256 NOT GLOB '*[^0-9a-f]*'
			)
		),
	reviewed_by TEXT,
	review_reason_code TEXT,
	reviewed_at TEXT,
	promoted_at TEXT,
	rolled_back_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (
		(
			status = 'staged'
			AND review_digest_sha256 IS NULL
			AND reviewed_by IS NULL
			AND review_reason_code IS NULL
			AND reviewed_at IS NULL
			AND promoted_at IS NULL
			AND rolled_back_at IS NULL
		)
		OR (
			status = 'reviewed'
			AND review_digest_sha256 IS NOT NULL
			AND reviewed_by IS NOT NULL
			AND review_reason_code IS NOT NULL
			AND reviewed_at IS NOT NULL
			AND promoted_at IS NULL
			AND rolled_back_at IS NULL
		)
		OR (
			status = 'promoted'
			AND review_digest_sha256 IS NOT NULL
			AND reviewed_by IS NOT NULL
			AND review_reason_code IS NOT NULL
			AND reviewed_at IS NOT NULL
			AND promoted_at IS NOT NULL
		)
		OR (
			status = 'rolled_back'
			AND review_digest_sha256 IS NOT NULL
			AND reviewed_by IS NOT NULL
			AND review_reason_code IS NOT NULL
			AND reviewed_at IS NOT NULL
			AND promoted_at IS NOT NULL
			AND rolled_back_at IS NOT NULL
		)
	)
);

CREATE INDEX legacy_import_release_plans_period_status
	ON legacy_import_release_plans (academic_period_id, status, created_at DESC);

CREATE TRIGGER legacy_import_release_plans_immutable_identity
BEFORE UPDATE OF plan_digest_sha256, staged_digest_sha256, environment,
	target_database_id, git_commit_sha, academic_period_id, plusbtext_run_id,
	access_run_id, plusbtext_version_id, access_version_id,
	expected_current_plusbtext_version_id, expected_current_access_version_id,
	safe_summary_json ON legacy_import_release_plans
BEGIN
	SELECT RAISE(ABORT, 'legacy import release plan identity is immutable');
END;

CREATE TRIGGER legacy_import_release_plans_review_once
BEFORE UPDATE OF review_digest_sha256, reviewed_by, review_reason_code, reviewed_at
ON legacy_import_release_plans
WHEN OLD.review_digest_sha256 IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'legacy import release plan review is immutable');
END;

CREATE TRIGGER legacy_import_release_plans_immutable_timestamps
BEFORE UPDATE OF created_at, reviewed_at, promoted_at, rolled_back_at
ON legacy_import_release_plans
WHEN OLD.created_at IS NOT NEW.created_at
	OR (OLD.reviewed_at IS NOT NULL AND OLD.reviewed_at IS NOT NEW.reviewed_at)
	OR (OLD.promoted_at IS NOT NULL AND OLD.promoted_at IS NOT NEW.promoted_at)
	OR (OLD.rolled_back_at IS NOT NULL AND OLD.rolled_back_at IS NOT NEW.rolled_back_at)
BEGIN
	SELECT RAISE(ABORT, 'legacy import release milestone timestamps are immutable');
END;

CREATE TRIGGER legacy_import_release_plans_updated_at_monotonic
BEFORE UPDATE OF updated_at ON legacy_import_release_plans
WHEN NEW.updated_at <= OLD.updated_at OR NEW.status IS OLD.status
BEGIN
	SELECT RAISE(ABORT, 'legacy import release updated_at must advance with a lifecycle transition');
END;

CREATE TRIGGER legacy_import_release_plans_allowed_transition
BEFORE UPDATE OF status ON legacy_import_release_plans
WHEN NEW.status IS NOT OLD.status
	AND NOT (
		(OLD.status = 'staged' AND NEW.status = 'reviewed')
		OR (OLD.status = 'reviewed' AND NEW.status = 'promoted')
		OR (OLD.status = 'promoted' AND NEW.status = 'rolled_back')
		OR (OLD.status = 'rolled_back' AND NEW.status = 'promoted')
	)
BEGIN
	SELECT RAISE(ABORT, 'legacy import release status transition is invalid');
END;

CREATE TRIGGER legacy_import_release_plans_transition_timestamps
BEFORE UPDATE OF status ON legacy_import_release_plans
WHEN NEW.status IS NOT OLD.status
BEGIN
	SELECT RAISE(ABORT, 'legacy import release transition timestamp invariant failed')
	WHERE NEW.updated_at <= OLD.updated_at
		OR (OLD.status = 'staged' AND NEW.status = 'reviewed' AND (
			NEW.reviewed_at IS NULL
			OR NEW.reviewed_at IS NOT NEW.updated_at
			OR NEW.promoted_at IS NOT NULL
			OR NEW.rolled_back_at IS NOT NULL
		))
		OR (OLD.status = 'reviewed' AND NEW.status = 'promoted' AND (
			NEW.reviewed_at IS NOT OLD.reviewed_at
			OR NEW.promoted_at IS NULL
			OR NEW.promoted_at IS NOT NEW.updated_at
			OR NEW.rolled_back_at IS NOT NULL
		))
		OR (OLD.status = 'promoted' AND NEW.status = 'rolled_back' AND (
			NEW.reviewed_at IS NOT OLD.reviewed_at
			OR NEW.promoted_at IS NOT OLD.promoted_at
			OR NEW.rolled_back_at IS NULL
			OR (OLD.rolled_back_at IS NULL AND NEW.rolled_back_at IS NOT NEW.updated_at)
			OR (OLD.rolled_back_at IS NOT NULL AND NEW.rolled_back_at IS NOT OLD.rolled_back_at)
		))
		OR (OLD.status = 'rolled_back' AND NEW.status = 'promoted' AND (
			NEW.reviewed_at IS NOT OLD.reviewed_at
			OR NEW.promoted_at IS NOT OLD.promoted_at
			OR NEW.rolled_back_at IS NOT OLD.rolled_back_at
		));
END;

CREATE TRIGGER legacy_import_release_plans_assert_transition
BEFORE UPDATE OF status ON legacy_import_release_plans
WHEN NEW.status IN ('promoted', 'rolled_back')
BEGIN
	SELECT RAISE(ABORT, 'legacy import release transition invariant failed')
	WHERE (
		NEW.status = 'promoted' AND (
			(SELECT id FROM plusbtext_versions
				WHERE academic_period_id = NEW.academic_period_id AND is_published = 1)
				IS NOT NEW.plusbtext_version_id
			OR (SELECT id FROM legacy_versions
				WHERE academic_period_id = NEW.academic_period_id AND is_published = 1)
				IS NOT NEW.access_version_id
			OR NOT EXISTS (
				SELECT 1 FROM legacy_versions
				WHERE id = NEW.access_version_id
					AND plusbtext_version_id = NEW.plusbtext_version_id
			)
			OR NOT EXISTS (
				SELECT 1 FROM import_runs
				WHERE id = NEW.plusbtext_run_id AND status = 'promoted'
			)
			OR NOT EXISTS (
				SELECT 1 FROM import_runs
				WHERE id = NEW.access_run_id AND status = 'promoted'
			)
		)
	) OR (
		NEW.status = 'rolled_back' AND (
			NEW.expected_current_plusbtext_version_id IS NULL
			OR NEW.expected_current_access_version_id IS NULL
			OR (SELECT id FROM plusbtext_versions
				WHERE academic_period_id = NEW.academic_period_id AND is_published = 1)
				IS NOT NEW.expected_current_plusbtext_version_id
			OR (SELECT id FROM legacy_versions
				WHERE academic_period_id = NEW.academic_period_id AND is_published = 1)
				IS NOT NEW.expected_current_access_version_id
			OR NOT EXISTS (
				SELECT 1 FROM legacy_versions
				WHERE id = NEW.expected_current_access_version_id
					AND plusbtext_version_id = NEW.expected_current_plusbtext_version_id
			)
		)
	);
END;

CREATE TABLE legacy_import_bundle_events (
	id TEXT PRIMARY KEY NOT NULL,
	plan_id TEXT NOT NULL REFERENCES legacy_import_release_plans(id),
	action TEXT NOT NULL CHECK (action IN ('promote', 'rollback', 'roll_forward')),
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	plusbtext_version_id TEXT NOT NULL REFERENCES plusbtext_versions(id),
	access_version_id TEXT NOT NULL REFERENCES legacy_versions(id),
	previous_plusbtext_version_id TEXT REFERENCES plusbtext_versions(id),
	previous_access_version_id TEXT REFERENCES legacy_versions(id),
	review_digest_sha256 TEXT NOT NULL
		CHECK (length(review_digest_sha256) = 64 AND review_digest_sha256 NOT GLOB '*[^0-9a-f]*'),
	recovery_evidence_digest_sha256 TEXT
		CHECK (
			recovery_evidence_digest_sha256 IS NULL OR (
				length(recovery_evidence_digest_sha256) = 64
				AND recovery_evidence_digest_sha256 NOT GLOB '*[^0-9a-f]*'
			)
		),
	plusbtext_fencing_token INTEGER NOT NULL CHECK (plusbtext_fencing_token > 0),
	access_fencing_token INTEGER NOT NULL CHECK (access_fencing_token > 0),
	created_at TEXT NOT NULL,
	CHECK (
		(action = 'promote' AND recovery_evidence_digest_sha256 IS NOT NULL)
		OR (action <> 'promote' AND recovery_evidence_digest_sha256 IS NULL)
	)
);

CREATE INDEX legacy_import_bundle_events_plan_created
	ON legacy_import_bundle_events (plan_id, created_at DESC);

CREATE TRIGGER legacy_import_bundle_events_validate
BEFORE INSERT ON legacy_import_bundle_events
BEGIN
	SELECT RAISE(ABORT, 'legacy import bundle plan or review mismatch')
	WHERE NOT EXISTS (
		SELECT 1 FROM legacy_import_release_plans AS plan
		WHERE plan.id = NEW.plan_id
			AND plan.academic_period_id = NEW.academic_period_id
			AND plan.review_digest_sha256 = NEW.review_digest_sha256
			AND (
				(NEW.action = 'promote' AND plan.status = 'reviewed'
					AND plan.plusbtext_version_id = NEW.plusbtext_version_id
					AND plan.access_version_id = NEW.access_version_id
					AND plan.expected_current_plusbtext_version_id IS NEW.previous_plusbtext_version_id
					AND plan.expected_current_access_version_id IS NEW.previous_access_version_id)
				OR
				(NEW.action = 'rollback' AND plan.status = 'promoted'
					AND plan.plusbtext_version_id IS NEW.previous_plusbtext_version_id
					AND plan.access_version_id IS NEW.previous_access_version_id
					AND plan.expected_current_plusbtext_version_id = NEW.plusbtext_version_id
					AND plan.expected_current_access_version_id = NEW.access_version_id)
				OR
				(NEW.action = 'roll_forward' AND plan.status = 'rolled_back'
					AND plan.plusbtext_version_id = NEW.plusbtext_version_id
					AND plan.access_version_id = NEW.access_version_id
					AND plan.expected_current_plusbtext_version_id IS NEW.previous_plusbtext_version_id
					AND plan.expected_current_access_version_id IS NEW.previous_access_version_id)
			)
	);

	SELECT RAISE(ABORT, 'legacy import bundle current PlusBText changed')
	WHERE (
		SELECT id FROM plusbtext_versions
		WHERE academic_period_id = NEW.academic_period_id AND is_published = 1
	) IS NOT NEW.previous_plusbtext_version_id;

	SELECT RAISE(ABORT, 'legacy import bundle current Access changed')
	WHERE (
		SELECT id FROM legacy_versions
		WHERE academic_period_id = NEW.academic_period_id AND is_published = 1
	) IS NOT NEW.previous_access_version_id;

	SELECT RAISE(ABORT, 'legacy import bundle target dependency mismatch')
	WHERE NOT EXISTS (
		SELECT 1 FROM legacy_versions AS access_version
		JOIN plusbtext_versions AS plus_version
			ON plus_version.id = access_version.plusbtext_version_id
		WHERE access_version.id = NEW.access_version_id
			AND plus_version.id = NEW.plusbtext_version_id
			AND access_version.academic_period_id = NEW.academic_period_id
			AND plus_version.academic_period_id = NEW.academic_period_id
	);

	SELECT RAISE(ABORT, 'legacy import bundle rollback target was never promoted')
	WHERE NEW.action = 'rollback' AND (
		NOT EXISTS (
			SELECT 1 FROM legacy_version_promotion_events
			WHERE source_kind = 'plusbtext' AND version_id = NEW.plusbtext_version_id
		) OR NOT EXISTS (
			SELECT 1 FROM legacy_version_promotion_events
			WHERE source_kind = 'access' AND version_id = NEW.access_version_id
		)
	);
END;

CREATE TRIGGER legacy_import_bundle_events_reject_update
BEFORE UPDATE ON legacy_import_bundle_events
BEGIN
	SELECT RAISE(ABORT, 'legacy import bundle events are append-only');
END;

CREATE TRIGGER legacy_import_bundle_events_reject_delete
BEFORE DELETE ON legacy_import_bundle_events
BEGIN
	SELECT RAISE(ABORT, 'legacy import bundle events are append-only');
END;

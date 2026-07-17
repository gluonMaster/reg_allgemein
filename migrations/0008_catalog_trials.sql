PRAGMA foreign_keys = ON;

CREATE TABLE trial_bookings (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id),
	child_id TEXT NOT NULL REFERENCES children(id),
	course_group_id TEXT NOT NULL REFERENCES course_groups(id),
	session_id TEXT NOT NULL REFERENCES course_sessions(id),
	status TEXT NOT NULL
		CHECK (status IN ('requested', 'confirmed', 'rejected', 'cancelled', 'attended', 'no_show', 'converted')),
	requested_date TEXT NOT NULL,
	confirmed_date TEXT,
	availability_at_request TEXT NOT NULL
		CHECK (availability_at_request IN ('available', 'full', 'unknown', 'requires_admin_review')),
	requires_admin_review_at_request INTEGER NOT NULL DEFAULT 0
		CHECK (requires_admin_review_at_request IN (0, 1)),
	request_hash_sha256 TEXT NOT NULL
		CHECK (length(request_hash_sha256) = 64 AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	idempotency_key TEXT NOT NULL,
	reviewed_by TEXT REFERENCES users(id),
	reviewed_at TEXT,
	decision_reason TEXT,
	converted_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (user_id, idempotency_key),
	CHECK (
		(status = 'requested' AND confirmed_date IS NULL)
		OR status IN ('rejected', 'cancelled')
		OR (status IN ('confirmed', 'attended', 'no_show', 'converted') AND confirmed_date IS NOT NULL)
	),
	CHECK ((status = 'converted' AND converted_at IS NOT NULL) OR status <> 'converted')
);

CREATE UNIQUE INDEX trial_bookings_one_open_child_course
	ON trial_bookings (child_id, course_group_id)
	WHERE status IN ('requested', 'confirmed', 'attended');

CREATE INDEX trial_bookings_admin_queue
	ON trial_bookings (status, requested_date, created_at);

CREATE INDEX trial_bookings_owner_created
	ON trial_bookings (user_id, created_at DESC);

CREATE TABLE trial_transition_commits (
	id TEXT PRIMARY KEY NOT NULL,
	trial_booking_id TEXT NOT NULL REFERENCES trial_bookings(id),
	from_status TEXT NOT NULL,
	to_status TEXT NOT NULL,
	idempotency_record_id TEXT NOT NULL UNIQUE REFERENCES idempotency_records(id),
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	created_at TEXT NOT NULL,
	UNIQUE (trial_booking_id, from_status)
);

CREATE TRIGGER trial_transition_commits_reject_update
BEFORE UPDATE ON trial_transition_commits
BEGIN
	SELECT RAISE(ABORT, 'trial transition commits are append-only');
END;

CREATE TRIGGER trial_transition_commits_reject_delete
BEFORE DELETE ON trial_transition_commits
BEGIN
	SELECT RAISE(ABORT, 'trial transition commits are retained evidence');
END;

CREATE TRIGGER trial_bookings_insert_requires_public_group_session
BEFORE INSERT ON trial_bookings
BEGIN
	SELECT RAISE(ABORT, 'trial must start as requested')
	WHERE NEW.status <> 'requested';

	SELECT RAISE(ABORT, 'trial course or session is not public')
	WHERE NOT EXISTS (
		SELECT 1
		FROM course_groups AS course
		JOIN academic_periods AS period
			ON period.id = course.academic_period_id AND period.is_current = 1
		JOIN schedule_versions AS schedule
			ON schedule.academic_period_id = period.id AND schedule.is_published = 1
		JOIN course_sessions AS session
			ON session.course_group_id = course.id
			AND session.schedule_version_id = schedule.id
			AND session.is_current = 1
		WHERE course.id = NEW.course_group_id
			AND session.id = NEW.session_id
			AND course.catalog_status = 'published'
			AND course.lesson_kind IN ('group', 'dance_group')
	);

	SELECT RAISE(ABORT, 'trial child ownership mismatch')
	WHERE NOT EXISTS (
		SELECT 1 FROM users AS owner
		JOIN children AS child
			ON child.owner_user_id = owner.id
			AND child.family_number_id = owner.family_number_id
		WHERE owner.id = NEW.user_id AND child.id = NEW.child_id
			AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
			AND owner.account_status = 'active' AND owner.is_blocked = 0
			AND owner.family_number_id IS NOT NULL AND child.is_current = 1
	);
END;

CREATE TRIGGER trial_bookings_immutable_request_identity
BEFORE UPDATE OF user_id, child_id, course_group_id, requested_date,
	availability_at_request, requires_admin_review_at_request,
	request_hash_sha256, idempotency_key, created_at ON trial_bookings
BEGIN
	SELECT RAISE(ABORT, 'trial request identity is immutable');
END;

CREATE TRIGGER trial_bookings_session_change_only_on_confirmation
BEFORE UPDATE OF session_id ON trial_bookings
WHEN NEW.session_id <> OLD.session_id
BEGIN
	SELECT RAISE(ABORT, 'trial session can only change during confirmation')
	WHERE OLD.status <> 'requested' OR NEW.status <> 'confirmed';
	SELECT RAISE(ABORT, 'confirmed trial session is not current')
	WHERE NOT EXISTS (
		SELECT 1 FROM course_sessions AS session
		JOIN schedule_versions AS schedule ON schedule.id = session.schedule_version_id
		JOIN academic_periods AS period ON period.id = schedule.academic_period_id
		WHERE session.id = NEW.session_id AND session.course_group_id = NEW.course_group_id
			AND session.is_current = 1 AND schedule.is_published = 1 AND period.is_current = 1
	);
END;

CREATE TRIGGER trial_bookings_confirmed_date_change_only_on_confirmation
BEFORE UPDATE OF confirmed_date ON trial_bookings
WHEN NEW.confirmed_date IS NOT OLD.confirmed_date
BEGIN
	SELECT RAISE(ABORT, 'confirmed trial date can only be set during confirmation')
	WHERE OLD.status <> 'requested' OR NEW.status <> 'confirmed';
END;

CREATE TRIGGER trial_bookings_allowed_transition
BEFORE UPDATE OF status ON trial_bookings
WHEN NEW.status <> OLD.status
BEGIN
	SELECT RAISE(ABORT, 'invalid trial transition')
	WHERE NOT (
		(OLD.status = 'requested' AND NEW.status IN ('confirmed', 'rejected', 'cancelled'))
		OR (OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'attended', 'no_show'))
		OR (OLD.status = 'attended' AND NEW.status = 'converted')
	);
END;

CREATE TRIGGER trial_bookings_confirmation_evidence
BEFORE UPDATE OF status, confirmed_date, reviewed_by, reviewed_at ON trial_bookings
WHEN NEW.status IN ('confirmed', 'attended', 'no_show', 'converted')
BEGIN
	SELECT RAISE(ABORT, 'confirmed trial requires admin evidence')
	WHERE NEW.confirmed_date IS NULL OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL;
END;

CREATE TABLE trial_parent_actions (
	id TEXT PRIMARY KEY NOT NULL,
	trial_booking_id TEXT NOT NULL REFERENCES trial_bookings(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	action TEXT NOT NULL CHECK (action = 'cancel'),
	idempotency_key TEXT NOT NULL,
	request_hash_sha256 TEXT NOT NULL
		CHECK (length(request_hash_sha256) = 64 AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	created_at TEXT NOT NULL,
	UNIQUE (user_id, idempotency_key)
);

CREATE TRIGGER trial_parent_actions_reject_update
BEFORE UPDATE ON trial_parent_actions
BEGIN
	SELECT RAISE(ABORT, 'trial parent actions are append-only');
END;

CREATE TRIGGER trial_parent_actions_reject_delete
BEFORE DELETE ON trial_parent_actions
BEGIN
	SELECT RAISE(ABORT, 'trial parent actions are retained evidence');
END;

CREATE TABLE trial_action_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	trial_booking_id TEXT NOT NULL REFERENCES trial_bookings(id),
	action TEXT NOT NULL,
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL
);

CREATE INDEX trial_action_assertions_trial
	ON trial_action_assertions (trial_booking_id, created_at);

CREATE TRIGGER trial_action_assertions_reject_update
BEFORE UPDATE ON trial_action_assertions
BEGIN
	SELECT RAISE(ABORT, 'trial action assertions are append-only');
END;

CREATE TRIGGER trial_action_assertions_reject_delete
BEFORE DELETE ON trial_action_assertions
BEGIN
	SELECT RAISE(ABORT, 'trial action assertions are retained evidence');
END;

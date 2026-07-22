PRAGMA foreign_keys = ON;

CREATE TABLE contract_provider_versions (
	id TEXT PRIMARY KEY NOT NULL,
	version TEXT NOT NULL UNIQUE,
	provider_snapshot_json TEXT NOT NULL
		CHECK (json_valid(provider_snapshot_json) AND json_type(provider_snapshot_json) = 'object'),
	payment_terms_version TEXT NOT NULL,
	payment_terms_hash TEXT NOT NULL
		CHECK (length(payment_terms_hash) = 64 AND payment_terms_hash NOT GLOB '*[^0-9a-f]*'),
	approval_status TEXT NOT NULL CHECK (approval_status IN ('draft', 'approved', 'retired')),
	approved_by TEXT REFERENCES users(id),
	approved_at TEXT,
	created_at TEXT NOT NULL,
	CHECK (approval_status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE media_withdrawal_contact_versions (
	id TEXT PRIMARY KEY NOT NULL,
	version TEXT NOT NULL UNIQUE,
	contact_snapshot_json TEXT NOT NULL
		CHECK (json_valid(contact_snapshot_json) AND json_type(contact_snapshot_json) = 'object'),
	snapshot_hash TEXT NOT NULL UNIQUE
		CHECK (length(snapshot_hash) = 64 AND snapshot_hash NOT GLOB '*[^0-9a-f]*'),
	german_text_version TEXT NOT NULL,
	approval_status TEXT NOT NULL CHECK (approval_status IN ('draft', 'approved', 'retired')),
	compliance_assessment_status TEXT NOT NULL DEFAULT 'not_assessed'
		CHECK (compliance_assessment_status IN ('not_assessed', 'passed', 'failed')),
	approved_by TEXT REFERENCES users(id),
	approved_at TEXT,
	created_at TEXT NOT NULL,
	CHECK (approval_status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE contract_template_versions (
	id TEXT PRIMARY KEY NOT NULL,
	template_id TEXT NOT NULL
		CHECK (template_id IN ('group_yearly', 'group_monthly', 'individual_hourly', 'nachhilfe_hourly')),
	template_version TEXT NOT NULL,
	render_schema_version TEXT NOT NULL,
	clause_set_version TEXT NOT NULL,
	provider_version_id TEXT NOT NULL REFERENCES contract_provider_versions(id),
	media_contact_version_id TEXT REFERENCES media_withdrawal_contact_versions(id),
	template_bundle_r2_key TEXT NOT NULL UNIQUE,
	bundle_hash TEXT NOT NULL
		CHECK (length(bundle_hash) = 64 AND bundle_hash NOT GLOB '*[^0-9a-f]*'),
	html_source_hash TEXT NOT NULL
		CHECK (length(html_source_hash) = 64 AND html_source_hash NOT GLOB '*[^0-9a-f]*'),
	css_source_hash TEXT NOT NULL
		CHECK (length(css_source_hash) = 64 AND css_source_hash NOT GLOB '*[^0-9a-f]*'),
	asset_manifest_json TEXT NOT NULL
		CHECK (json_valid(asset_manifest_json) AND json_type(asset_manifest_json) = 'object'),
	font_manifest_json TEXT NOT NULL
		CHECK (json_valid(font_manifest_json) AND json_type(font_manifest_json) = 'object'),
	required_fields_json TEXT NOT NULL
		CHECK (json_valid(required_fields_json) AND json_type(required_fields_json) = 'array'),
	renderer_id TEXT NOT NULL
		CHECK (renderer_id IN ('synthetic-test-pdf-v1', 'cloudflare-browser-run-pdf-v1')),
	renderer_contract_version TEXT NOT NULL,
	worker_compatibility_date TEXT NOT NULL,
	usage_scope TEXT NOT NULL CHECK (usage_scope IN ('synthetic_test', 'production')),
	approval_status TEXT NOT NULL CHECK (approval_status IN ('draft', 'approved', 'retired')),
	approval_basis TEXT NOT NULL
		CHECK (approval_basis IN ('synthetic_fixture', 'authorized_verein_approval', 'legal_review')),
	distance_legal_profile TEXT NOT NULL
		CHECK (distance_legal_profile IN ('offline_only', 'widerruf_applicable', 'widerruf_not_applicable_312g_2_9')),
	distance_legal_basis_version TEXT,
	distance_legal_basis_hash TEXT
		CHECK (distance_legal_basis_hash IS NULL OR (length(distance_legal_basis_hash) = 64
			AND distance_legal_basis_hash NOT GLOB '*[^0-9a-f]*')),
	kuendigung_function_required INTEGER NOT NULL DEFAULT 0
		CHECK (kuendigung_function_required IN (0, 1)),
	early_performance_supported INTEGER NOT NULL DEFAULT 0
		CHECK (early_performance_supported IN (0, 1)),
	approved_by TEXT REFERENCES users(id),
	approved_at TEXT,
	valid_from TEXT,
	valid_to TEXT,
	created_at TEXT NOT NULL,
	UNIQUE (template_id, template_version),
	CHECK (
		(usage_scope = 'synthetic_test' AND renderer_id = 'synthetic-test-pdf-v1'
			AND approval_basis = 'synthetic_fixture')
		OR (usage_scope = 'production' AND renderer_id = 'cloudflare-browser-run-pdf-v1'
			AND approval_basis IN ('authorized_verein_approval', 'legal_review'))
	),
	CHECK (approval_status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
	CHECK (usage_scope <> 'production' OR distance_legal_basis_hash IS NOT NULL)
);

CREATE TABLE contract_number_sequences (
	id TEXT PRIMARY KEY NOT NULL,
	family_number_id TEXT NOT NULL UNIQUE REFERENCES family_number_allocations(id),
	format_version TEXT NOT NULL,
	next_contract_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_contract_sequence > 0),
	status TEXT NOT NULL CHECK (status IN ('unapproved', 'active', 'collision', 'retired')),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE service_engagements (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id),
	child_id TEXT NOT NULL REFERENCES children(id),
	individual_request_id TEXT NOT NULL UNIQUE REFERENCES individual_requests(id),
	request_kind TEXT NOT NULL CHECK (request_kind IN ('nachhilfe', 'individual')),
	initial_funding_authorization_id TEXT REFERENCES funding_authorizations(id),
	current_funding_authorization_id TEXT REFERENCES funding_authorizations(id),
	status TEXT NOT NULL
		CHECK (status IN ('draft', 'contract_offered', 'active', 'funding_review', 'cancelled', 'ended')),
	active_from TEXT NOT NULL,
	active_until TEXT,
	attendance_ceased_at TEXT,
	attendance_notice_id TEXT,
	contract_id TEXT UNIQUE,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (active_until IS NULL OR active_from < active_until),
	CHECK (
		(request_kind = 'individual' AND initial_funding_authorization_id IS NULL
			AND current_funding_authorization_id IS NULL)
		OR (request_kind = 'nachhilfe' AND initial_funding_authorization_id IS NOT NULL
			AND current_funding_authorization_id IS NOT NULL AND active_until IS NOT NULL)
	)
);

CREATE INDEX service_engagements_owner_status
	ON service_engagements (user_id, status, active_from, active_until);

CREATE TABLE contract_offers (
	id TEXT PRIMARY KEY NOT NULL,
	series_id TEXT NOT NULL,
	version INTEGER NOT NULL CHECK (version > 0),
	offer_number TEXT NOT NULL UNIQUE,
	contract_number TEXT NOT NULL UNIQUE,
	user_id TEXT NOT NULL REFERENCES users(id),
	child_id TEXT NOT NULL REFERENCES children(id),
	family_number_id_at_issue TEXT NOT NULL REFERENCES family_number_allocations(id),
	family_display_id_at_issue TEXT NOT NULL,
	family_version_at_issue INTEGER NOT NULL CHECK (family_version_at_issue > 0),
	academic_period_id TEXT NOT NULL REFERENCES academic_periods(id),
	course_group_id TEXT REFERENCES course_groups(id),
	individual_request_id TEXT REFERENCES individual_requests(id),
	funding_authorization_id TEXT REFERENCES funding_authorizations(id),
	enrollment_id TEXT REFERENCES enrollments(id),
	service_engagement_id TEXT REFERENCES service_engagements(id),
	price_quote_id TEXT REFERENCES price_quotes(id),
	contract_kind TEXT NOT NULL
		CHECK (contract_kind IN ('group_yearly', 'group_monthly', 'individual_hourly', 'nachhilfe_hourly')),
	template_version_id TEXT NOT NULL REFERENCES contract_template_versions(id),
	render_schema_version TEXT NOT NULL,
	effective_from TEXT NOT NULL,
	effective_to TEXT,
	billing_model TEXT NOT NULL
		CHECK (billing_model IN ('monthly_group_fee', 'delivered_units', 'third_party_funded')),
	currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
	unit_minutes INTEGER CHECK (unit_minutes IS NULL OR unit_minutes > 0),
	price_version_id TEXT REFERENCES price_versions(id),
	price_rule_id TEXT REFERENCES price_rules(id),
	price_source TEXT NOT NULL
		CHECK (price_source IN ('excel_yearly', 'excel_monthly', 'fallback_90', 'configured_individual_hourly', 'fixed_nachhilfe_hourly')),
	price_mode TEXT NOT NULL CHECK (price_mode IN ('rule_derived', 'manual_override')),
	base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
	price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
	amount_semantics TEXT NOT NULL CHECK (amount_semantics IN ('base_price', 'unit_rate', 'third_party_rate')),
	payment_arrangement TEXT NOT NULL
		CHECK (payment_arrangement IN ('existing_external_sepa', 'manual_payment', 'not_applicable')),
	payment_due_day INTEGER CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 28),
	billing_period_code TEXT NOT NULL CHECK (billing_period_code IN ('calendar_month', 'per_45_minutes')),
	provider_snapshot_json TEXT NOT NULL
		CHECK (json_valid(provider_snapshot_json) AND json_type(provider_snapshot_json) = 'object'),
	party_snapshot_json TEXT NOT NULL
		CHECK (json_valid(party_snapshot_json) AND json_type(party_snapshot_json) = 'object'),
	service_snapshot_json TEXT NOT NULL
		CHECK (json_valid(service_snapshot_json) AND json_type(service_snapshot_json) = 'object'),
	schedule_snapshot_json TEXT NOT NULL
		CHECK (json_valid(schedule_snapshot_json) AND json_type(schedule_snapshot_json) = 'array'),
	billing_snapshot_json TEXT NOT NULL
		CHECK (json_valid(billing_snapshot_json) AND json_type(billing_snapshot_json) = 'object'),
	line_items_json TEXT NOT NULL
		CHECK (json_valid(line_items_json) AND json_type(line_items_json) = 'array'),
	term_snapshot_json TEXT NOT NULL
		CHECK (json_valid(term_snapshot_json) AND json_type(term_snapshot_json) = 'object'),
	termination_snapshot_json TEXT NOT NULL
		CHECK (json_valid(termination_snapshot_json) AND json_type(termination_snapshot_json) = 'object'),
	withdrawal_snapshot_json TEXT NOT NULL
		CHECK (json_valid(withdrawal_snapshot_json) AND json_type(withdrawal_snapshot_json) = 'object'),
	distance_legal_profile_snapshot_json TEXT NOT NULL
		CHECK (json_valid(distance_legal_profile_snapshot_json)
			AND json_type(distance_legal_profile_snapshot_json) = 'object'),
	distance_legal_basis_hash TEXT,
	early_performance_request_version TEXT,
	early_performance_requested_at TEXT,
	wertersatz_notice_version TEXT,
	clauses_manifest_json TEXT NOT NULL
		CHECK (json_valid(clauses_manifest_json) AND json_type(clauses_manifest_json) = 'object'),
	attachments_manifest_json TEXT NOT NULL
		CHECK (json_valid(attachments_manifest_json) AND json_type(attachments_manifest_json) = 'array'),
	privacy_notice_version TEXT NOT NULL,
	media_clause_version TEXT,
	media_decision_snapshot_json TEXT
		CHECK (media_decision_snapshot_json IS NULL OR (json_valid(media_decision_snapshot_json)
			AND json_type(media_decision_snapshot_json) = 'object')),
	render_input_json TEXT NOT NULL
		CHECK (json_valid(render_input_json) AND json_type(render_input_json) = 'object'),
	render_input_hash TEXT NOT NULL
		CHECK (length(render_input_hash) = 64 AND render_input_hash NOT GLOB '*[^0-9a-f]*'),
	source_manifest_json TEXT NOT NULL
		CHECK (json_valid(source_manifest_json) AND json_type(source_manifest_json) = 'object'),
	source_manifest_hash TEXT NOT NULL
		CHECK (length(source_manifest_hash) = 64 AND source_manifest_hash NOT GLOB '*[^0-9a-f]*'),
	contract_html_r2_key TEXT UNIQUE,
	contract_pdf_r2_key TEXT UNIQUE,
	contract_hash TEXT
		CHECK (contract_hash IS NULL OR (length(contract_hash) = 64 AND contract_hash NOT GLOB '*[^0-9a-f]*')),
	render_status TEXT NOT NULL DEFAULT 'not_started'
		CHECK (render_status IN ('not_started', 'rendering', 'ready', 'failed')),
	status TEXT NOT NULL DEFAULT 'draft'
		CHECK (status IN ('draft', 'sent', 'accepted_by_parent', 'declined_by_parent',
			'approved_by_admin', 'cancelled', 'expired', 'superseded')),
	sent_at TEXT,
	expires_at TEXT NOT NULL,
	accepted_at TEXT,
	declined_at TEXT,
	admin_approved_at TEXT,
	cancelled_at TEXT,
	status_reason TEXT,
	created_by_admin_user_id TEXT NOT NULL REFERENCES users(id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (series_id, version),
	CHECK (effective_to IS NULL OR effective_from <= effective_to),
	CHECK (
		(contract_kind IN ('group_yearly', 'group_monthly')
			AND course_group_id IS NOT NULL AND enrollment_id IS NOT NULL
			AND individual_request_id IS NULL AND service_engagement_id IS NULL
			AND funding_authorization_id IS NULL AND billing_model = 'monthly_group_fee'
			AND amount_semantics = 'base_price' AND billing_period_code = 'calendar_month')
		OR (contract_kind = 'individual_hourly'
			AND course_group_id IS NULL AND enrollment_id IS NULL
			AND individual_request_id IS NOT NULL AND service_engagement_id IS NOT NULL
			AND funding_authorization_id IS NULL AND billing_model = 'delivered_units'
			AND amount_semantics = 'unit_rate' AND unit_minutes = 45
			AND price_source = 'configured_individual_hourly' AND billing_period_code = 'per_45_minutes')
		OR (contract_kind = 'nachhilfe_hourly'
			AND course_group_id IS NULL AND enrollment_id IS NULL
			AND individual_request_id IS NOT NULL AND service_engagement_id IS NOT NULL
			AND funding_authorization_id IS NOT NULL AND billing_model = 'third_party_funded'
			AND amount_semantics = 'third_party_rate' AND unit_minutes = 45
			AND price_source = 'fixed_nachhilfe_hourly' AND price_cents = 3000
			AND billing_period_code = 'per_45_minutes' AND effective_to IS NOT NULL)
	),
	CHECK (
		(payment_arrangement = 'manual_payment' AND payment_due_day = 7)
		OR (payment_arrangement = 'existing_external_sepa' AND payment_due_day IS NULL)
		OR (payment_arrangement = 'not_applicable' AND payment_due_day IS NULL
			AND billing_model = 'third_party_funded')
	),
	CHECK (billing_model = 'third_party_funded' OR payment_arrangement <> 'not_applicable'),
	CHECK (render_status <> 'ready' OR (contract_html_r2_key IS NOT NULL
		AND contract_pdf_r2_key IS NOT NULL AND contract_hash IS NOT NULL)),
	CHECK (status IN ('draft', 'cancelled', 'expired', 'superseded') OR render_status = 'ready')
);

CREATE INDEX contract_offers_owner_status
	ON contract_offers (user_id, status, created_at DESC);

CREATE INDEX contract_offers_family_status
	ON contract_offers (family_number_id_at_issue, status, id);

CREATE INDEX contract_offers_request_status
	ON contract_offers (individual_request_id, status, id);

CREATE TABLE offer_manual_price_overrides (
	id TEXT PRIMARY KEY NOT NULL,
	contract_offer_id TEXT NOT NULL UNIQUE REFERENCES contract_offers(id),
	base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
	override_price_cents INTEGER NOT NULL CHECK (override_price_cents >= 0),
	delta_cents INTEGER NOT NULL,
	price_version_id TEXT REFERENCES price_versions(id),
	price_rule_id TEXT REFERENCES price_rules(id),
	reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	responsibility_confirmed INTEGER NOT NULL CHECK (responsibility_confirmed = 1),
	request_hash_sha256 TEXT NOT NULL
		CHECK (length(request_hash_sha256) = 64 AND request_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
	created_at TEXT NOT NULL
);

CREATE TABLE contract_artifacts (
	id TEXT PRIMARY KEY NOT NULL,
	contract_offer_id TEXT REFERENCES contract_offers(id),
	formation_certificate_id TEXT,
	artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('offer_html', 'offer_pdf', 'formation_certificate_pdf')),
	private_r2_key TEXT NOT NULL UNIQUE,
	content_type TEXT NOT NULL CHECK (content_type IN ('text/html; charset=utf-8', 'application/pdf')),
	size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
	sha256 TEXT NOT NULL
		CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
	source_hash TEXT NOT NULL
		CHECK (length(source_hash) = 64 AND source_hash NOT GLOB '*[^0-9a-f]*'),
	template_version_id TEXT NOT NULL REFERENCES contract_template_versions(id),
	renderer_id TEXT NOT NULL,
	renderer_contract_version TEXT NOT NULL,
	worker_compatibility_date TEXT NOT NULL,
	created_at TEXT NOT NULL,
	CHECK ((contract_offer_id IS NOT NULL) <> (formation_certificate_id IS NOT NULL)),
	CHECK ((artifact_kind IN ('offer_html', 'offer_pdf') AND contract_offer_id IS NOT NULL)
		OR (artifact_kind = 'formation_certificate_pdf' AND formation_certificate_id IS NOT NULL))
);

CREATE UNIQUE INDEX contract_artifacts_offer_kind
	ON contract_artifacts (contract_offer_id, artifact_kind) WHERE contract_offer_id IS NOT NULL;

CREATE UNIQUE INDEX contract_artifacts_certificate_kind
	ON contract_artifacts (formation_certificate_id, artifact_kind) WHERE formation_certificate_id IS NOT NULL;

CREATE TABLE contract_render_attempts (
	id TEXT PRIMARY KEY NOT NULL,
	contract_offer_id TEXT NOT NULL REFERENCES contract_offers(id),
	attempt_no INTEGER NOT NULL CHECK (attempt_no BETWEEN 1 AND 3),
	renderer_id TEXT NOT NULL,
	worker_compatibility_date TEXT NOT NULL,
	source_manifest_hash TEXT NOT NULL,
	started_at TEXT NOT NULL,
	finished_at TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('succeeded', 'retryable_failed', 'failed')),
	error_code TEXT,
	browser_ms_used INTEGER CHECK (browser_ms_used IS NULL OR browser_ms_used >= 0),
	pdf_size_bytes INTEGER CHECK (pdf_size_bytes IS NULL OR pdf_size_bytes > 0),
	pdf_sha256 TEXT,
	retry_after_seconds INTEGER CHECK (retry_after_seconds IS NULL OR retry_after_seconds >= 0),
	created_at TEXT NOT NULL,
	UNIQUE (contract_offer_id, attempt_no)
);

CREATE TABLE contract_parent_actions (
	id TEXT PRIMARY KEY NOT NULL,
	contract_offer_id TEXT NOT NULL REFERENCES contract_offers(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	action TEXT NOT NULL CHECK (action IN ('accept', 'decline')),
	from_status TEXT NOT NULL,
	to_status TEXT NOT NULL,
	offer_hash TEXT NOT NULL,
	text_version TEXT NOT NULL,
	user_agent TEXT NOT NULL,
	ip_retention_value TEXT,
	ip_expires_at TEXT,
	idempotency_key TEXT NOT NULL,
	request_hash_sha256 TEXT NOT NULL,
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	created_at TEXT NOT NULL,
	UNIQUE (user_id, idempotency_key)
);

CREATE TABLE contract_acceptances (
	id TEXT PRIMARY KEY NOT NULL,
	contract_offer_id TEXT NOT NULL UNIQUE REFERENCES contract_offers(id),
	parent_action_id TEXT NOT NULL UNIQUE REFERENCES contract_parent_actions(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	accepted_at TEXT NOT NULL,
	ip_retention_value TEXT,
	ip_expires_at TEXT,
	user_agent TEXT NOT NULL,
	acceptance_text_version TEXT NOT NULL,
	acceptance_text TEXT NOT NULL,
	contract_hash TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE contracts (
	id TEXT PRIMARY KEY NOT NULL,
	contract_offer_id TEXT NOT NULL UNIQUE REFERENCES contract_offers(id),
	contract_number TEXT NOT NULL UNIQUE,
	user_id TEXT NOT NULL REFERENCES users(id),
	child_id TEXT NOT NULL REFERENCES children(id),
	course_group_id TEXT REFERENCES course_groups(id),
	individual_request_id TEXT REFERENCES individual_requests(id),
	funding_authorization_id TEXT REFERENCES funding_authorizations(id),
	enrollment_id TEXT REFERENCES enrollments(id),
	service_engagement_id TEXT REFERENCES service_engagements(id),
	operational_status TEXT NOT NULL CHECK (operational_status IN ('active', 'terminated', 'expired', 'void')),
	parent_acceptance_id TEXT NOT NULL UNIQUE REFERENCES contract_acceptances(id),
	formed_at TEXT NOT NULL,
	formed_by_admin_user_id TEXT NOT NULL REFERENCES users(id),
	activated_at TEXT NOT NULL,
	effective_from TEXT NOT NULL,
	effective_to TEXT,
	auto_renewal_blocked_at TEXT,
	created_at TEXT NOT NULL,
	CHECK ((course_group_id IS NOT NULL AND enrollment_id IS NOT NULL
		AND individual_request_id IS NULL AND service_engagement_id IS NULL)
		OR (course_group_id IS NULL AND enrollment_id IS NULL
			AND individual_request_id IS NOT NULL AND service_engagement_id IS NOT NULL))
);

CREATE TABLE contract_formation_certificates (
	id TEXT PRIMARY KEY NOT NULL,
	contract_id TEXT NOT NULL UNIQUE REFERENCES contracts(id),
	contract_offer_id TEXT NOT NULL UNIQUE REFERENCES contract_offers(id),
	contract_number TEXT NOT NULL,
	source_snapshot_json TEXT NOT NULL
		CHECK (json_valid(source_snapshot_json) AND json_type(source_snapshot_json) = 'object'),
	source_hash TEXT NOT NULL
		CHECK (length(source_hash) = 64 AND source_hash NOT GLOB '*[^0-9a-f]*'),
	schema_version TEXT NOT NULL,
	template_version TEXT NOT NULL,
	parent_acceptance_id TEXT NOT NULL REFERENCES contract_acceptances(id),
	parent_accepted_at TEXT NOT NULL,
	formed_by_admin_user_id TEXT NOT NULL REFERENCES users(id),
	formed_at TEXT NOT NULL,
	offer_pdf_hash TEXT NOT NULL,
	render_status TEXT NOT NULL CHECK (render_status IN ('pending', 'rendering', 'ready', 'failed')),
	attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
	error_code TEXT,
	certificate_pdf_r2_key TEXT UNIQUE,
	certificate_pdf_hash TEXT,
	generated_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (render_status <> 'ready' OR (certificate_pdf_r2_key IS NOT NULL
		AND certificate_pdf_hash IS NOT NULL AND generated_at IS NOT NULL))
);

CREATE TABLE contract_deliveries (
	id TEXT PRIMARY KEY NOT NULL,
	contract_offer_id TEXT NOT NULL REFERENCES contract_offers(id),
	contract_id TEXT REFERENCES contracts(id),
	artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('offer_html', 'offer_pdf', 'formation_certificate_pdf')),
	artifact_hash TEXT NOT NULL,
	channel TEXT NOT NULL CHECK (channel IN ('portal', 'fake_email')),
	recipient_role TEXT NOT NULL CHECK (recipient_role IN ('parent', 'verein')),
	recipient_user_id TEXT REFERENCES users(id),
	delivery_status TEXT NOT NULL CHECK (delivery_status IN ('available', 'queued', 'delivered')),
	dedupe_key TEXT NOT NULL UNIQUE,
	delivered_at TEXT,
	access_expires_at TEXT,
	created_at TEXT NOT NULL
);

CREATE TABLE contract_events (
	id TEXT PRIMARY KEY NOT NULL,
	contract_id TEXT NOT NULL REFERENCES contracts(id),
	event_type TEXT NOT NULL CHECK (event_type IN ('formed', 'activated', 'amended',
		'funding_amended', 'attendance_ceased', 'withdrawal_received', 'withdrawn',
		'termination_received', 'renewal_blocked', 'termination_effective_date_confirmed',
		'termination_disputed', 'mutual_termination_approved', 'mutual_termination_declined',
		'terminated', 'expired', 'voided')),
	effective_at TEXT NOT NULL,
	reason_code TEXT NOT NULL,
	source_offer_id TEXT NOT NULL REFERENCES contract_offers(id),
	actor_user_id TEXT REFERENCES users(id),
	metadata_json TEXT NOT NULL
		CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
	dedupe_key TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL
);

CREATE TABLE contract_end_requests (
	id TEXT PRIMARY KEY NOT NULL,
	contract_id TEXT REFERENCES contracts(id),
	requested_by_user_id TEXT REFERENCES users(id),
	submission_channel TEXT NOT NULL
		CHECK (submission_channel IN ('authenticated_portal', 'public_function', 'admin_recorded')),
	requester_identity_evidence_json TEXT
		CHECK (requester_identity_evidence_json IS NULL OR (json_valid(requester_identity_evidence_json)
			AND json_type(requester_identity_evidence_json) = 'object')),
	kind TEXT NOT NULL CHECK (kind IN ('withdrawal', 'ordinary_termination',
		'extraordinary_termination', 'mutual_termination_request')),
	requested_effective_on TEXT,
	received_at TEXT NOT NULL,
	recorded_at TEXT NOT NULL,
	server_ingested_at TEXT NOT NULL,
	request_text_version TEXT NOT NULL,
	request_hash TEXT NOT NULL,
	idempotency_key TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL CHECK (status IN ('received', 'effective_date_confirmed',
		'disputed', 'approved', 'declined', 'completed')),
	calculated_effective_on TEXT,
	admin_reason TEXT,
	reviewed_by TEXT REFERENCES users(id),
	reviewed_at TEXT,
	external_debt_check_result TEXT CHECK (external_debt_check_result IS NULL OR
		external_debt_check_result IN ('not_checked', 'no_debt_reported', 'debt_reported', 'unknown')),
	confirmation_delivery_id TEXT REFERENCES contract_deliveries(id),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	CHECK (kind = 'mutual_termination_request' OR status NOT IN ('approved', 'declined'))
);

CREATE TABLE service_attendance_notices (
	id TEXT PRIMARY KEY NOT NULL,
	contract_id TEXT NOT NULL REFERENCES contracts(id),
	service_engagement_id TEXT NOT NULL REFERENCES service_engagements(id),
	requested_by_user_id TEXT NOT NULL REFERENCES users(id),
	submission_channel TEXT NOT NULL CHECK (submission_channel IN ('authenticated_portal', 'admin_recorded')),
	received_at TEXT NOT NULL,
	recorded_at TEXT NOT NULL,
	server_ingested_at TEXT NOT NULL,
	notice_text_version TEXT NOT NULL,
	notice_hash TEXT NOT NULL,
	idempotency_key TEXT NOT NULL UNIQUE,
	teacher_notification_task_id TEXT REFERENCES admin_review_tasks(id),
	confirmation_delivery_id TEXT REFERENCES contract_deliveries(id),
	scheduled_lesson_ref TEXT,
	agreed_start_at TEXT,
	agreed_place_ref TEXT,
	teacher_arrived_at TEXT,
	teacher_waited_until TEXT,
	teacher_attested_by TEXT REFERENCES users(id),
	teacher_attested_at TEXT,
	created_at TEXT NOT NULL
);

CREATE TABLE funding_amendments (
	id TEXT PRIMARY KEY NOT NULL,
	contract_id TEXT NOT NULL REFERENCES contracts(id),
	service_engagement_id TEXT NOT NULL REFERENCES service_engagements(id),
	previous_authorization_id TEXT NOT NULL REFERENCES funding_authorizations(id),
	new_authorization_id TEXT NOT NULL REFERENCES funding_authorizations(id),
	effective_from TEXT NOT NULL,
	reason TEXT NOT NULL,
	approved_by_admin_user_id TEXT NOT NULL REFERENCES users(id),
	approved_at TEXT NOT NULL,
	event_hash TEXT NOT NULL,
	idempotency_key TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL
);

CREATE TABLE media_consents (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id),
	child_id TEXT NOT NULL REFERENCES children(id),
	capture_scopes_json TEXT NOT NULL
		CHECK (json_valid(capture_scopes_json) AND json_type(capture_scopes_json) = 'array'),
	publication_channels_json TEXT NOT NULL
		CHECK (json_valid(publication_channels_json) AND json_type(publication_channels_json) = 'array'),
	text_version TEXT NOT NULL,
	withdrawal_contact_version_id TEXT NOT NULL REFERENCES media_withdrawal_contact_versions(id),
	withdrawal_contact_snapshot_hash TEXT NOT NULL,
	decision TEXT NOT NULL CHECK (decision IN ('granted', 'declined', 'revoked')),
	decision_source TEXT NOT NULL CHECK (decision_source IN ('portal', 'office', 'email', 'phone', 'account_deletion')),
	decided_at TEXT NOT NULL,
	received_at TEXT NOT NULL,
	effective_from TEXT NOT NULL,
	recorded_by_user_id TEXT REFERENCES users(id),
	recorded_at TEXT NOT NULL,
	evidence_hash TEXT NOT NULL,
	request_dedupe_key TEXT NOT NULL UNIQUE,
	source_contract_offer_id TEXT REFERENCES contract_offers(id),
	source_privacy_request_id TEXT,
	supersedes_consent_id TEXT REFERENCES media_consents(id),
	created_at TEXT NOT NULL,
	CHECK (decision <> 'revoked' OR decision_source IN ('office', 'email', 'phone', 'account_deletion')),
	CHECK (decision <> 'granted' OR decision_source = 'portal')
);

CREATE INDEX media_consents_child_effective
	ON media_consents (child_id, effective_from, created_at);

CREATE TABLE contract_admin_actions (
	id TEXT PRIMARY KEY NOT NULL,
	contract_offer_id TEXT NOT NULL REFERENCES contract_offers(id),
	action TEXT NOT NULL CHECK (action IN ('create', 'render_send', 'form_activate',
		'cancel', 'supersede', 'media_withdrawal', 'termination_review')),
	actor_user_id TEXT NOT NULL REFERENCES users(id),
	idempotency_key TEXT NOT NULL,
	request_hash_sha256 TEXT NOT NULL,
	result_ref TEXT NOT NULL,
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	created_at TEXT NOT NULL,
	UNIQUE (actor_user_id, idempotency_key)
);

CREATE TABLE contract_action_assertions (
	id TEXT PRIMARY KEY NOT NULL,
	scope TEXT NOT NULL,
	target_id TEXT NOT NULL,
	action_id TEXT NOT NULL,
	actor_user_id TEXT REFERENCES users(id),
	audit_event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
	assertion_passed INTEGER NOT NULL CHECK (assertion_passed = 1),
	created_at TEXT NOT NULL,
	UNIQUE (scope, action_id)
);

CREATE TABLE contract_outbox_events (
	id TEXT PRIMARY KEY NOT NULL,
	event_type TEXT NOT NULL CHECK (event_type IN ('offer_available', 'offer_declined',
		'contract_formed', 'termination_received', 'attendance_ceased', 'media_withdrawn')),
	source_kind TEXT NOT NULL,
	source_id TEXT NOT NULL,
	payload_json TEXT NOT NULL
		CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
	dedupe_key TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'consumed')),
	created_at TEXT NOT NULL
);

CREATE TABLE contract_family_reassignment_effects (
	id TEXT PRIMARY KEY NOT NULL,
	reassignment_id TEXT NOT NULL REFERENCES family_reassignments(id),
	contract_offer_id TEXT NOT NULL REFERENCES contract_offers(id),
	from_family_number_id TEXT NOT NULL REFERENCES family_number_allocations(id),
	to_family_number_id TEXT NOT NULL REFERENCES family_number_allocations(id),
	old_status TEXT NOT NULL,
	new_status TEXT NOT NULL CHECK (new_status = 'superseded'),
	created_at TEXT NOT NULL,
	UNIQUE (reassignment_id, contract_offer_id)
);

CREATE TRIGGER contract_provider_versions_approved_immutable
BEFORE UPDATE ON contract_provider_versions WHEN OLD.approval_status = 'approved'
BEGIN SELECT RAISE(ABORT, 'approved contract provider version is immutable'); END;

CREATE TRIGGER contract_template_versions_approved_immutable
BEFORE UPDATE ON contract_template_versions WHEN OLD.approval_status = 'approved'
BEGIN SELECT RAISE(ABORT, 'approved contract template version is immutable'); END;

CREATE TRIGGER contract_offers_allowed_transition
BEFORE UPDATE OF status ON contract_offers WHEN NEW.status <> OLD.status
BEGIN
	SELECT RAISE(ABORT, 'invalid contract offer transition') WHERE NOT (
		(OLD.status = 'draft' AND NEW.status IN ('sent', 'cancelled', 'expired', 'superseded'))
		OR (OLD.status = 'sent' AND NEW.status IN ('accepted_by_parent', 'declined_by_parent',
			'cancelled', 'expired', 'superseded'))
		OR (OLD.status = 'accepted_by_parent' AND NEW.status IN ('approved_by_admin', 'cancelled', 'superseded'))
	);
END;

CREATE TRIGGER contract_offers_allowed_render_transition
BEFORE UPDATE OF render_status ON contract_offers WHEN NEW.render_status <> OLD.render_status
BEGIN
	SELECT RAISE(ABORT, 'invalid contract render transition') WHERE NOT (
		(OLD.render_status = 'not_started' AND NEW.render_status IN ('rendering', 'failed'))
		OR (OLD.render_status = 'rendering' AND NEW.render_status IN ('ready', 'failed'))
		OR (OLD.render_status = 'failed' AND NEW.render_status = 'rendering')
	);
END;

CREATE TRIGGER contract_offers_sent_snapshot_immutable
BEFORE UPDATE OF series_id, version, offer_number, contract_number, user_id, child_id,
	family_number_id_at_issue, family_display_id_at_issue, family_version_at_issue,
	academic_period_id, course_group_id, individual_request_id, funding_authorization_id,
	enrollment_id, service_engagement_id, price_quote_id, contract_kind,
	template_version_id, render_schema_version, effective_from, effective_to,
	billing_model, currency, unit_minutes, price_version_id, price_rule_id,
	price_source, price_mode, base_price_cents, price_cents, amount_semantics,
	payment_arrangement, payment_due_day, billing_period_code, provider_snapshot_json,
	party_snapshot_json, service_snapshot_json, schedule_snapshot_json,
	billing_snapshot_json, line_items_json, term_snapshot_json,
	termination_snapshot_json, withdrawal_snapshot_json,
	distance_legal_profile_snapshot_json, distance_legal_basis_hash,
	early_performance_request_version, early_performance_requested_at,
	wertersatz_notice_version, clauses_manifest_json, attachments_manifest_json,
	privacy_notice_version, media_clause_version, media_decision_snapshot_json,
	render_input_json, render_input_hash, source_manifest_json, source_manifest_hash,
	contract_html_r2_key, contract_pdf_r2_key, contract_hash, expires_at, created_at
	ON contract_offers WHEN OLD.status <> 'draft'
BEGIN SELECT RAISE(ABORT, 'sent contract offer snapshot is immutable'); END;

CREATE TRIGGER contract_offers_insert_scope_guard
BEFORE INSERT ON contract_offers
BEGIN
	SELECT RAISE(ABORT, 'contract offer owner child family mismatch') WHERE NOT EXISTS (
		SELECT 1 FROM users owner JOIN children child ON child.owner_user_id = owner.id
		JOIN family_number_allocations family ON family.id = owner.family_number_id
		WHERE owner.id = NEW.user_id AND child.id = NEW.child_id
			AND owner.account_status = 'active' AND owner.is_blocked = 0
			AND child.family_number_id = owner.family_number_id
			AND NEW.family_number_id_at_issue = owner.family_number_id
			AND NEW.family_version_at_issue = owner.family_version
			AND family.status = 'assigned' AND family.owner_user_id = owner.id
	);
	SELECT RAISE(ABORT, 'contract template kind mismatch') WHERE NOT EXISTS (
		SELECT 1 FROM contract_template_versions template WHERE template.id = NEW.template_version_id
			AND template.template_id = NEW.contract_kind AND template.approval_status = 'approved'
	);
END;

CREATE TRIGGER service_engagements_allowed_transition
BEFORE UPDATE OF status ON service_engagements WHEN NEW.status <> OLD.status
BEGIN
	SELECT RAISE(ABORT, 'invalid service engagement transition') WHERE NOT (
		(OLD.status = 'draft' AND NEW.status IN ('contract_offered', 'cancelled'))
		OR (OLD.status = 'contract_offered' AND NEW.status IN ('active', 'cancelled'))
		OR (OLD.status = 'active' AND NEW.status IN ('funding_review', 'ended', 'cancelled'))
		OR (OLD.status = 'funding_review' AND NEW.status IN ('active', 'ended', 'cancelled'))
	);
END;

CREATE TRIGGER contract_artifacts_reject_update
BEFORE UPDATE ON contract_artifacts
BEGIN SELECT RAISE(ABORT, 'contract artifacts are immutable'); END;

CREATE TRIGGER contract_artifacts_reject_delete
BEFORE DELETE ON contract_artifacts
BEGIN SELECT RAISE(ABORT, 'contract artifacts are retained evidence'); END;

CREATE TRIGGER contract_parent_actions_reject_update
BEFORE UPDATE ON contract_parent_actions
BEGIN SELECT RAISE(ABORT, 'contract parent actions are append-only'); END;

CREATE TRIGGER contract_parent_actions_reject_delete
BEFORE DELETE ON contract_parent_actions
BEGIN SELECT RAISE(ABORT, 'contract parent actions are retained evidence'); END;

CREATE TRIGGER contract_acceptances_reject_update
BEFORE UPDATE ON contract_acceptances
BEGIN SELECT RAISE(ABORT, 'contract acceptances are immutable'); END;

CREATE TRIGGER contract_acceptances_reject_delete
BEFORE DELETE ON contract_acceptances
BEGIN SELECT RAISE(ABORT, 'contract acceptances are retained evidence'); END;

CREATE TRIGGER contracts_reject_update
BEFORE UPDATE OF contract_offer_id, contract_number, user_id, child_id,
	course_group_id, individual_request_id, funding_authorization_id,
	enrollment_id, service_engagement_id, parent_acceptance_id, formed_at,
	formed_by_admin_user_id, activated_at, effective_from, effective_to, created_at
	ON contracts
BEGIN SELECT RAISE(ABORT, 'formed contract identity is immutable'); END;

CREATE TRIGGER contract_formation_certificates_ready_immutable
BEFORE UPDATE ON contract_formation_certificates WHEN OLD.render_status = 'ready'
BEGIN SELECT RAISE(ABORT, 'ready formation certificate is immutable'); END;

CREATE TRIGGER contract_deliveries_reject_update
BEFORE UPDATE ON contract_deliveries
BEGIN SELECT RAISE(ABORT, 'contract delivery evidence is immutable'); END;

CREATE TRIGGER contract_deliveries_reject_delete
BEFORE DELETE ON contract_deliveries
BEGIN SELECT RAISE(ABORT, 'contract delivery evidence is retained evidence'); END;

CREATE TRIGGER contract_events_reject_update
BEFORE UPDATE ON contract_events
BEGIN SELECT RAISE(ABORT, 'contract events are append-only'); END;

CREATE TRIGGER contract_events_reject_delete
BEFORE DELETE ON contract_events
BEGIN SELECT RAISE(ABORT, 'contract events are retained evidence'); END;

CREATE TRIGGER contract_end_requests_receipt_immutable
BEFORE UPDATE OF contract_id, requested_by_user_id, submission_channel,
	requester_identity_evidence_json, kind, requested_effective_on, received_at,
	recorded_at, server_ingested_at, request_text_version, request_hash,
	idempotency_key, created_at ON contract_end_requests
BEGIN SELECT RAISE(ABORT, 'contract end receipt is immutable'); END;

CREATE TRIGGER service_attendance_notices_reject_update
BEFORE UPDATE ON service_attendance_notices
BEGIN SELECT RAISE(ABORT, 'attendance notices are immutable'); END;

CREATE TRIGGER service_attendance_notices_reject_delete
BEFORE DELETE ON service_attendance_notices
BEGIN SELECT RAISE(ABORT, 'attendance notices are retained evidence'); END;

CREATE TRIGGER media_consents_reject_update
BEFORE UPDATE ON media_consents
BEGIN SELECT RAISE(ABORT, 'media consent evidence is append-only'); END;

CREATE TRIGGER media_consents_reject_delete
BEFORE DELETE ON media_consents
BEGIN SELECT RAISE(ABORT, 'media consent evidence is retained evidence'); END;

CREATE TRIGGER contract_admin_actions_reject_update
BEFORE UPDATE ON contract_admin_actions
BEGIN SELECT RAISE(ABORT, 'contract admin actions are append-only'); END;

CREATE TRIGGER contract_action_assertions_reject_update
BEFORE UPDATE ON contract_action_assertions
BEGIN SELECT RAISE(ABORT, 'contract action assertions are append-only'); END;

CREATE TRIGGER contract_family_reassignment_effects_reject_update
BEFORE UPDATE ON contract_family_reassignment_effects
BEGIN SELECT RAISE(ABORT, 'family reassignment contract effects are immutable'); END;

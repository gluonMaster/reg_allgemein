PRAGMA foreign_keys = ON;

INSERT INTO academic_periods (
	id, code, display_name, starts_on, ends_on, is_current, created_at
) VALUES (
	'e2e-period', '2026-2027-e2e', 'Synthetic E2E period',
	'2026-07-01', '2027-06-30', 1, '2026-08-12T08:00:00.000Z'
);

INSERT INTO import_runs (
	id, source_kind, academic_period_id, source_label, source_hash_sha256,
	source_contract_id, source_contract_version, structural_fingerprint_sha256,
	dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
	attempt_no, retry_of_run_id, status, started_at, validated_at, promoted_at,
	finished_at, rows_total, rows_staged, rows_promoted, rows_skipped,
	safe_summary_json, error_code, created_at, updated_at
) VALUES (
	'e2e-import', 'access', 'e2e-period', 'synthetic-e2e-fixture',
	'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
	'e2e.synthetic.access', 1,
	'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
	'{}',
	'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
	'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
	1, NULL, 'promoted', '2026-08-12T08:00:00.000Z',
	'2026-08-12T08:00:01.000Z', '2026-08-12T08:00:02.000Z',
	'2026-08-12T08:00:03.000Z', 2, 2, 2, 0,
	'{"synthetic":true}', NULL, '2026-08-12T08:00:00.000Z',
	'2026-08-12T08:00:03.000Z'
);

INSERT INTO family_number_allocations (
	id, namespace, sequence_number, display_family_id, legacy_family_id,
	owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
	created_at, updated_at
) VALUES
	('e2e-family-a', 'portal_2', 9001, '2-9001-E2E', NULL,
	 'e2e-parent-a', 'portal', 'assigned', '2026-08-12T08:00:00.000Z', NULL,
	 '2026-08-12T08:00:00.000Z', '2026-08-12T08:00:00.000Z'),
	('e2e-family-b', 'portal_2', 9002, '2-9002-E2E', NULL,
	 'e2e-parent-b', 'portal', 'assigned', '2026-08-12T08:00:00.000Z', NULL,
	 '2026-08-12T08:00:00.000Z', '2026-08-12T08:00:00.000Z');

INSERT INTO users (
	id, email, email_normalized, password_hash, pending_email,
	pending_email_normalized, pending_email_expires_at, email_version,
	email_verified_at, role, is_blocked, account_status, closed_at,
	first_name, last_name, first_name_normalized, last_name_normalized,
	phone, preferred_language, family_number_id, family_assignment_status,
	family_version, family_assignment_import_run_id, privacy_notice_version,
	privacy_accepted_at, session_version, created_at, updated_at
) VALUES
	('e2e-parent-a', 'parent-a@e2e.invalid', 'parent-a@e2e.invalid',
	 '$2b$10$QFddzPUT7XT48TjIYi0aHu4NyaBlG4OloErt9R032SlcuFDQbqpuS',
	 NULL, NULL, NULL, 1, '2026-08-12T08:00:00.000Z', 'parent', 0, 'active', NULL,
	 'Synthetic', 'Parent A', 'synthetic', 'parent a', NULL, 'de',
	 'e2e-family-a', 'assigned', 1, 'e2e-import', 'e2e-synthetic-notice-v1',
	 '2026-08-12T08:00:00.000Z', 1, '2026-08-12T08:00:00.000Z',
	 '2026-08-12T08:00:00.000Z'),
	('e2e-parent-b', 'parent-b@e2e.invalid', 'parent-b@e2e.invalid',
	 '$2b$10$QFddzPUT7XT48TjIYi0aHu4NyaBlG4OloErt9R032SlcuFDQbqpuS',
	 NULL, NULL, NULL, 1, '2026-08-12T08:00:00.000Z', 'parent', 0, 'active', NULL,
	 'Synthetic', 'Parent B', 'synthetic', 'parent b', NULL, 'de',
	 'e2e-family-b', 'assigned', 1, 'e2e-import', 'e2e-synthetic-notice-v1',
	 '2026-08-12T08:00:00.000Z', 1, '2026-08-12T08:00:00.000Z',
	 '2026-08-12T08:00:00.000Z'),
	('e2e-admin', 'admin@e2e.invalid', 'admin@e2e.invalid',
	 '$2b$10$QFddzPUT7XT48TjIYi0aHu4NyaBlG4OloErt9R032SlcuFDQbqpuS',
	 NULL, NULL, NULL, 1, '2026-08-12T08:00:00.000Z', 'admin', 0, 'active', NULL,
	 'Synthetic', 'Admin', 'synthetic', 'admin', NULL, 'de',
	 NULL, 'pending_verification', 0, NULL, 'e2e-synthetic-notice-v1',
	 '2026-08-12T08:00:00.000Z', 1, '2026-08-12T08:00:00.000Z',
	 '2026-08-12T08:00:00.000Z');

INSERT INTO privacy_acknowledgements (
	id, user_id, privacy_notice_version, acknowledged_at, evidence_hash,
	source_context, created_at
) VALUES
	('e2e-privacy-a', 'e2e-parent-a', 'e2e-synthetic-notice-v1',
	 '2026-08-12T08:00:00.000Z',
	 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
	 'synthetic_e2e_fixture', '2026-08-12T08:00:00.000Z'),
	('e2e-privacy-b', 'e2e-parent-b', 'e2e-synthetic-notice-v1',
	 '2026-08-12T08:00:00.000Z',
	 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
	 'synthetic_e2e_fixture', '2026-08-12T08:00:00.000Z'),
	('e2e-privacy-admin', 'e2e-admin', 'e2e-synthetic-notice-v1',
	 '2026-08-12T08:00:00.000Z',
	 '1111111111111111111111111111111111111111111111111111111111111111',
	 'synthetic_e2e_fixture', '2026-08-12T08:00:00.000Z');

INSERT INTO children (
	id, owner_user_id, legacy_family_id, family_number_id, origin,
	source_child_key, source_full_name, source_full_name_normalized,
	source_birth_date, full_name_override, birth_date_override, full_name,
	full_name_normalized, birth_date, last_seen_run_id, is_current,
	created_at, updated_at
) VALUES
	('e2e-child-a', 'e2e-parent-a', NULL, 'e2e-family-a', 'portal',
	 'portal:e2e-child-a', 'Synthetic Child A', 'synthetic child a', '2015-01-10',
	 NULL, NULL, 'Synthetic Child A', 'synthetic child a', '2015-01-10',
	 'e2e-import', 1, '2026-08-12T08:00:00.000Z', '2026-08-12T08:00:00.000Z'),
	('e2e-child-b', 'e2e-parent-b', NULL, 'e2e-family-b', 'portal',
	 'portal:e2e-child-b', 'Synthetic Child B', 'synthetic child b', '2016-02-20',
	 NULL, NULL, 'Synthetic Child B', 'synthetic child b', '2016-02-20',
	 'e2e-import', 1, '2026-08-12T08:00:00.000Z', '2026-08-12T08:00:00.000Z');

-- PVUI-06: independent, unclaimed synthetic family; repeated labels are not identities.
INSERT INTO family_number_allocations
	(id, namespace, sequence_number, display_family_id, legacy_family_id, owner_user_id,
	 origin, status, assigned_at, created_at, updated_at)
VALUES ('e2e-admin-map-number', 'legacy_1', 9901, '1. 9901', 'e2e-admin-map-family', NULL,
	'legacy', 'assigned', '2026-08-12T08:00:00Z', '2026-08-12T08:00:00Z', '2026-08-12T08:00:00Z');
INSERT INTO legacy_families
	(id, source_namespace, source_family_id, family_number_id, numbering_status, created_at, updated_at)
VALUES ('e2e-admin-map-family', 'synthetic-admin-ui', '1. 9901', 'e2e-admin-map-number', 'valid',
	'2026-08-12T08:00:00Z', '2026-08-12T08:00:00Z');
INSERT INTO children
	(id, legacy_family_id, family_number_id, origin, source_child_key, source_full_name,
	 source_full_name_normalized, source_birth_date, full_name, full_name_normalized,
	 birth_date, last_seen_run_id, created_at, updated_at)
VALUES ('e2e-admin-map-child', 'e2e-admin-map-family', 'e2e-admin-map-number', 'legacy',
	'synthetic-admin-child', 'Synthetic Mapping Child', 'synthetic mapping child', '2016-02-01',
	'Synthetic Mapping Child', 'synthetic mapping child', '2016-02-01', 'e2e-import',
	'2026-08-12T08:00:00Z', '2026-08-12T08:00:00Z');
WITH RECURSIVE entries(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM entries WHERE n < 50)
INSERT INTO legacy_source_rows
	(id, source_namespace, academic_period_id, source_access_id, legacy_family_id, child_id,
	 import_run_id, source_hash, source_values_json, last_seen_run_id, created_at, updated_at)
SELECT 'e2e-admin-map-row-' || n, 'synthetic-admin-ui', 'e2e-period', n,
	'e2e-admin-map-family', 'e2e-admin-map-child', 'e2e-import',
	'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '{}', 'e2e-import',
	'2026-08-12T08:00:00Z', '2026-08-12T08:00:00Z' FROM entries;
INSERT INTO legacy_enrollments
	(id, legacy_source_row_id, legacy_family_id, child_id, academic_period_id, source_slot,
	 source_record_key, group_name_raw, group_name_normalized, lesson_kind,
	 last_seen_run_id, created_at, updated_at)
SELECT 'e2e-admin-mapping-' || source_access_id, id, legacy_family_id, child_id,
	academic_period_id, 'main_next', 'e2e-admin-mapping-' || source_access_id,
	CASE WHEN source_access_id = 1 THEN 'Synthetic Old Group — sehr langer Name mit zusätzlichen Angaben für die mobile Prüfung / очень длинное название для проверки мобильного экрана'
	ELSE 'Synthetic Old Group' END, 'synthetic old group', 'group', 'e2e-import',
	'2026-08-12T08:00:00Z', '2026-08-12T08:00:00Z'
FROM legacy_source_rows WHERE source_namespace = 'synthetic-admin-ui';

INSERT INTO individual_requests (
	id, user_id, child_id, request_kind, funding_kind, subjects_raw,
	description, preferred_days_json, preferred_time_windows_json,
	preferred_format, preferred_locations_json, unit_rate_cents,
	parent_payable, status, version, create_idempotency_key,
	create_request_hash_sha256, admin_decision, admin_notes, reviewed_by,
	reviewed_at, created_at, updated_at
) VALUES
	('e2e-request-a', 'e2e-parent-a', 'e2e-child-a', 'individual', 'self_pay',
	 'Synthetic subject A', '', '["MO"]', '[]', 'onsite', '[]', 3000, 1,
	 'draft', 1, 'e2e-seed-request-a',
	 '2222222222222222222222222222222222222222222222222222222222222222',
	 NULL, NULL, NULL, NULL, '2026-08-12T08:00:00.000Z',
	 '2026-08-12T08:00:00.000Z'),
	('e2e-request-b', 'e2e-parent-b', 'e2e-child-b', 'individual', 'self_pay',
	 'Synthetic subject B', '', '["TU"]', '[]', 'onsite', '[]', 3000, 1,
	 'draft', 1, 'e2e-seed-request-b',
	 '3333333333333333333333333333333333333333333333333333333333333333',
	 NULL, NULL, NULL, NULL, '2026-08-12T08:00:00.000Z',
	 '2026-08-12T08:00:00.000Z');

-- The remaining rows are deliberately owned by parent B. Parent A uses their
-- public identifiers in the browser matrix to exercise every high-value
-- ownership boundary without introducing any test-only application endpoint.

INSERT INTO individual_requests (
	id, user_id, child_id, request_kind, funding_kind, subjects_raw,
	description, preferred_days_json, preferred_time_windows_json,
	preferred_format, preferred_locations_json, unit_rate_cents,
	parent_payable, status, version, create_idempotency_key,
	create_request_hash_sha256, admin_decision, admin_notes, reviewed_by,
	reviewed_at, created_at, updated_at
) VALUES (
	'e2e-request-document-b', 'e2e-parent-b', 'e2e-child-b', 'nachhilfe',
	'jobcenter', 'Synthetic funded subject B', '', '["WE"]', '[]', 'onsite',
	'[]', 3000, 0, 'draft', 1, 'e2e-seed-request-document-b',
	'4444444444444444444444444444444444444444444444444444444444444444',
	NULL, NULL, NULL, NULL, '2026-08-12T08:01:00.000Z',
	'2026-08-12T08:01:00.000Z'
);

INSERT INTO funding_authorizations (
	id, request_id, user_id, child_id, version, kind, status, valid_from,
	valid_until, supersedes_authorization_id, decision_notes, reviewed_by,
	reviewed_at, created_at, updated_at
) VALUES (
	'e2e-authorization-b', 'e2e-request-document-b', 'e2e-parent-b',
	'e2e-child-b', 1, 'jobcenter', 'pending_review', NULL, NULL, NULL, NULL,
	NULL, NULL, '2026-08-12T08:01:00.000Z', '2026-08-12T08:01:00.000Z'
);

INSERT INTO authorization_documents (
	id, authorization_id, user_id, child_id, quarantine_r2_key, archive_r2_key,
	original_extension, mime_type, detected_type, size_bytes, sha256,
	review_status, quarantine_reason, scan_method, scanner_label,
	scanner_version, signature_version, quarantine_downloaded_by_admin_user_id,
	quarantine_downloaded_sha256, quarantine_downloaded_at,
	download_audit_event_id, scan_attested_by_admin_user_id,
	scan_attestation_text_version, scanned_at, scan_attempts,
	business_review_reason, released_by, released_at, upload_idempotency_key,
	upload_request_hash_sha256, uploaded_at, quarantine_expires_at,
	quarantine_delete_state, quarantine_purged_at,
	quarantine_cleanup_audit_event_id, deleted_at, replaced_by_document_id,
	created_at, updated_at
) VALUES (
	'e2e-document-b', 'e2e-authorization-b', 'e2e-parent-b', 'e2e-child-b',
	'quarantine/e2e-document-b', 'archive/e2e-document-b', 'pdf',
	'application/pdf', 'pdf', 16,
	'5555555555555555555555555555555555555555555555555555555555555555',
	'approved', NULL, 'manual_local_av', 'Synthetic scanner', 'e2e-v1', NULL,
	NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, 'Synthetic E2E approval',
	'e2e-admin', '2026-08-12T08:02:00.000Z', 'e2e-document-upload-b',
	'6666666666666666666666666666666666666666666666666666666666666666',
	'2026-08-12T08:01:00.000Z', '2026-08-26T08:01:00.000Z', 'present',
	NULL, NULL, NULL, NULL, '2026-08-12T08:01:00.000Z',
	'2026-08-12T08:02:00.000Z'
);

INSERT INTO authorization_documents (
	id, authorization_id, user_id, child_id, quarantine_r2_key, archive_r2_key,
	original_extension, mime_type, detected_type, size_bytes, sha256,
	review_status, quarantine_reason, scan_method, scanner_label,
	scanner_version, signature_version, quarantine_downloaded_by_admin_user_id,
	quarantine_downloaded_sha256, quarantine_downloaded_at,
	download_audit_event_id, scan_attested_by_admin_user_id,
	scan_attestation_text_version, scanned_at, scan_attempts,
	business_review_reason, released_by, released_at, upload_idempotency_key,
	upload_request_hash_sha256, uploaded_at, quarantine_expires_at,
	quarantine_delete_state, quarantine_purged_at,
	quarantine_cleanup_audit_event_id, deleted_at, replaced_by_document_id,
	created_at, updated_at
) VALUES (
	'e2e-document-delete-b', 'e2e-authorization-b', 'e2e-parent-b',
	'e2e-child-b', 'quarantine/e2e-document-delete-b', NULL, 'png', 'image/png',
	'png', 16,
	'6767676767676767676767676767676767676767676767676767676767676767',
	'quarantined', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
	NULL, NULL, 0, NULL, NULL, NULL, 'e2e-document-delete-upload-b',
	'6868686868686868686868686868686868686868686868686868686868686868',
	'2026-08-12T08:01:30.000Z', '2026-08-26T08:01:30.000Z', 'present',
	NULL, NULL, NULL, NULL, '2026-08-12T08:01:30.000Z',
	'2026-08-12T08:01:30.000Z'
);

INSERT INTO course_groups (
	id, academic_period_id, source_offering_key, display_name,
	normalized_price_key, lesson_kind, subject, capacity_default,
	capacity_override, requires_admin_approval, catalog_status,
	last_seen_schedule_version_id, retired_at, created_at, updated_at
) VALUES (
	'e2e-course-b', 'e2e-period', 'synthetic:e2e-course-b',
	'Synthetic Course B', 'synthetic course b', 'group', 'Synthetic subject',
	12, NULL, 0, 'draft', NULL, NULL, '2026-08-12T08:03:00.000Z',
	'2026-08-12T08:03:00.000Z'
);

INSERT INTO enrollments (
	id, user_id, child_id, course_group_id, legacy_enrollment_id, lesson_kind,
	status, contract_kind, active_from, active_until, current_price_cents,
	price_source, price_mode, price_effective_from, manual_override_reason,
	manual_override_by, manual_override_at, source, created_at, updated_at,
	payment_arrangement, current_base_price_cents, current_price_version_id,
	current_price_rule_id, price_assignment_version
) VALUES (
	'e2e-enrollment-b', 'e2e-parent-b', 'e2e-child-b', 'e2e-course-b', NULL,
	'group', 'active', 'group_yearly', '2026-08-01', NULL, 4600,
	'excel_yearly', 'rule_derived', '2026-08-01', NULL, NULL, NULL, 'portal',
	'2026-08-12T08:03:00.000Z', '2026-08-12T08:03:00.000Z',
	'manual_payment', 4600, NULL, NULL, 1
);

INSERT INTO price_review_batches (
	id, course_group_id, reason_code, old_active_count, new_active_count,
	old_lookup_children_count, new_lookup_children_count, price_version_id,
	effective_on, earliest_effective_from, calculation_snapshot_json,
	calculation_snapshot_hash, dedupe_key, status, notification_approved_at,
	notification_approved_by, created_at, updated_at, completed_at
) VALUES (
	'e2e-price-batch-b', 'e2e-course-b', 'occupancy_correction', 1, 2, 1, 2,
	NULL, '2026-08-12', '2026-09-01', '{"synthetic":true}',
	'7777777777777777777777777777777777777777777777777777777777777777',
	'e2e-price-batch-b', 'awaiting_responses', '2026-08-12T08:04:00.000Z',
	'e2e-admin', '2026-08-12T08:03:00.000Z', '2026-08-12T08:04:00.000Z',
	NULL
);

INSERT INTO price_review_items (
	id, batch_id, version, public_reference, enrollment_id,
	legacy_enrollment_id, user_id, old_base_price_cents, old_price_cents,
	new_base_price_cents, new_final_price_cents, old_price_source,
	new_price_source, old_price_mode, new_price_mode, old_price_version_id,
	new_price_version_id, old_price_rule_id, new_price_rule_id,
	target_state_hash, expected_active_count, expected_lookup_children_count,
	effective_on, decision_code, decision_json, terms_snapshot_json, item_hash,
	acceptance_text_version, dedupe_key, status, sent_at, response_deadline,
	responded_at, final_admin_confirmed_at, final_admin_confirmed_by,
	final_admin_confirmation_reason, manual_contact_task_id, scheduled_for,
	applied_at, superseded_by_item_id, created_at, updated_at
) VALUES (
	'e2e-price-item-b', 'e2e-price-batch-b', 1, 'e2e-price-review-b',
	'e2e-enrollment-b', NULL, 'e2e-parent-b', 4600, 4600, 5000, 5000,
	'excel_yearly', 'excel_yearly', 'rule_derived', 'rule_derived', NULL, NULL,
	NULL, NULL,
	'8888888888888888888888888888888888888888888888888888888888888888',
	2, 2, '2026-08-12', 'PRICE_CHANGED', '{"synthetic":true}',
	'{"synthetic":true}',
	'9999999999999999999999999999999999999999999999999999999999999999',
	'price-review-acceptance-de-v1', 'e2e-price-item-b', 'sent',
	'2026-08-12T08:04:00.000Z', '2099-08-26', NULL, NULL, NULL, NULL, NULL,
	NULL, NULL, NULL, '2026-08-12T08:04:00.000Z',
	'2026-08-12T08:04:00.000Z'
);

INSERT INTO contract_provider_versions (
	id, version, provider_snapshot_json, payment_terms_version,
	payment_terms_hash, approval_status, approved_by, approved_at, created_at
) VALUES (
	'e2e-contract-provider', 'e2e-provider-v1', '{"synthetic":true}',
	'e2e-payment-v1',
	'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
	'approved', 'e2e-admin', '2026-08-12T08:05:00.000Z',
	'2026-08-12T08:05:00.000Z'
);

INSERT INTO media_withdrawal_contact_versions (
	id, version, contact_snapshot_json, snapshot_hash, german_text_version,
	approval_status, compliance_assessment_status, approved_by, approved_at,
	created_at
) VALUES (
	'e2e-media-contact', 'e2e-media-contact-v1',
	'{"email":"synthetic-media-contact@e2e.invalid"}',
	'abababababababababababababababababababababababababababababababab',
	'e2e-media-contact-text-v1', 'approved', 'not_assessed', 'e2e-admin',
	'2026-08-12T08:05:00.000Z', '2026-08-12T08:05:00.000Z'
);

INSERT INTO contract_template_versions (
	id, template_id, template_version, render_schema_version,
	clause_set_version, provider_version_id, media_contact_version_id,
	template_bundle_r2_key, bundle_hash, html_source_hash, css_source_hash,
	asset_manifest_json, font_manifest_json, required_fields_json, renderer_id,
	renderer_contract_version, worker_compatibility_date, usage_scope,
	approval_status, approval_basis, distance_legal_profile,
	distance_legal_basis_version, distance_legal_basis_hash,
	kuendigung_function_required, early_performance_supported, approved_by,
	approved_at, valid_from, valid_to, created_at
) VALUES (
	'e2e-contract-template', 'individual_hourly', 'e2e-template-v1',
	'e2e-render-v1', 'e2e-clauses-v1', 'e2e-contract-provider',
	'e2e-media-contact',
	'archive/e2e-template-bundle',
	'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
	'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
	'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
	'{}', '{}', '[]', 'synthetic-test-pdf-v1', 'e2e-renderer-v1',
	'2026-08-12', 'synthetic_test', 'approved', 'synthetic_fixture',
	'offline_only', NULL, NULL, 0, 0, 'e2e-admin',
	'2026-08-12T08:05:00.000Z', '2026-08-12', NULL,
	'2026-08-12T08:05:00.000Z'
);

INSERT INTO service_engagements (
	id, user_id, child_id, individual_request_id, request_kind,
	initial_funding_authorization_id, current_funding_authorization_id, status,
	active_from, active_until, attendance_ceased_at, attendance_notice_id,
	contract_id, created_at, updated_at
) VALUES (
	'e2e-engagement-b', 'e2e-parent-b', 'e2e-child-b', 'e2e-request-b',
	'individual', NULL, NULL, 'contract_offered', '2026-09-01', NULL, NULL,
	NULL, NULL, '2026-08-12T08:05:00.000Z', '2026-08-12T08:05:00.000Z'
);

INSERT INTO contract_offers (
	id, series_id, version, offer_number, contract_number, user_id, child_id,
	family_number_id_at_issue, family_display_id_at_issue,
	family_version_at_issue, academic_period_id, course_group_id,
	individual_request_id, funding_authorization_id, enrollment_id,
	service_engagement_id, price_quote_id, contract_kind, template_version_id,
	render_schema_version, effective_from, effective_to, billing_model, currency,
	unit_minutes, price_version_id, price_rule_id, price_source, price_mode,
	base_price_cents, price_cents, amount_semantics, payment_arrangement,
	payment_due_day, billing_period_code, provider_snapshot_json,
	party_snapshot_json, service_snapshot_json, schedule_snapshot_json,
	billing_snapshot_json, line_items_json, term_snapshot_json,
	termination_snapshot_json, withdrawal_snapshot_json,
	distance_legal_profile_snapshot_json, distance_legal_basis_hash,
	early_performance_request_version, early_performance_requested_at,
	wertersatz_notice_version, clauses_manifest_json, attachments_manifest_json,
	privacy_notice_version, media_clause_version, media_decision_snapshot_json,
	render_input_json, render_input_hash, source_manifest_json,
	source_manifest_hash, contract_html_r2_key, contract_pdf_r2_key,
	contract_hash, render_status, status, sent_at, expires_at, accepted_at,
	declined_at, admin_approved_at, cancelled_at, status_reason,
	created_by_admin_user_id, created_at, updated_at
) VALUES (
	'e2e-contract-offer-b', 'e2e-contract-series-b', 1, 'E2E-OFFER-B',
	'2. 9002-1', 'e2e-parent-b', 'e2e-child-b', 'e2e-family-b',
	'2-9002-E2E', 1, 'e2e-period', NULL, 'e2e-request-b', NULL, NULL,
	'e2e-engagement-b', NULL, 'individual_hourly', 'e2e-contract-template',
	'e2e-render-v1', '2026-09-01', NULL, 'delivered_units', 'EUR', 45, NULL,
	NULL, 'configured_individual_hourly', 'rule_derived', 3000, 3000,
	'unit_rate', 'manual_payment', 7, 'per_45_minutes', '{"synthetic":true}',
	'{"synthetic":true}', '{"synthetic":true}', '[]', '{"synthetic":true}',
	'[]', '{"synthetic":true}', '{"synthetic":true}', '{"synthetic":true}',
	'{"profile":"offline_only"}', NULL, NULL, NULL, NULL,
	'{"synthetic":true}', '[]', 'e2e-synthetic-notice-v1', NULL, NULL,
	'{"synthetic":true}',
	'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
	'{"synthetic":true}',
	'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
	'archive/e2e-contract-offer-b.html', 'archive/e2e-contract-offer-b.pdf',
	'1111111111111111111111111111111111111111111111111111111111111111',
	'ready', 'sent', '2026-08-12T08:06:00.000Z',
	'2099-08-26T08:06:00.000Z', NULL, NULL, NULL, NULL, NULL, 'e2e-admin',
	'2026-08-12T08:05:00.000Z', '2026-08-12T08:06:00.000Z'
);

INSERT INTO contract_artifacts (
	id, contract_offer_id, formation_certificate_id, artifact_kind,
	private_r2_key, content_type, size_bytes, sha256, source_hash,
	template_version_id, renderer_id, renderer_contract_version,
	worker_compatibility_date, created_at
) VALUES (
	'e2e-contract-artifact-b', 'e2e-contract-offer-b', NULL, 'offer_pdf',
	'archive/e2e-contract-artifact-b.pdf', 'application/pdf', 16,
	'2222222222222222222222222222222222222222222222222222222222222222',
	'3333333333333333333333333333333333333333333333333333333333333333',
	'e2e-contract-template', 'synthetic-test-pdf-v1', 'e2e-renderer-v1',
	'2026-08-12', '2026-08-12T08:06:00.000Z'
);

INSERT INTO support_threads (
	id, public_reference, user_id, category, status, subject,
	previous_thread_id, created_at, updated_at, closed_at
) VALUES (
	'e2e-thread-b', 'e2e-message-b', 'e2e-parent-b', 'technical',
	'waiting_for_parent', 'Synthetic support thread B', NULL,
	'2026-08-12T08:07:00.000Z', '2026-08-12T08:07:00.000Z', NULL
);

INSERT INTO support_messages (
	id, thread_id, sender_kind, sender_user_id, body, created_at
) VALUES (
	'e2e-message-body-b', 'e2e-thread-b', 'admin', 'e2e-admin',
	'Synthetic owner-visible message B', '2026-08-12T08:07:00.000Z'
);

INSERT INTO privacy_requests (
	id, public_reference, subject_user_id, requested_by_user_id, kind, status,
	request_idempotency_key, request_hash_sha256, retention_holds_json,
	safe_summary_json, decision_reason, artifact_r2_key, artifact_expires_at,
	reviewed_by, reviewed_at, completed_at, created_at, updated_at
) VALUES (
	'e2e-privacy-request-b', 'e2e-privacy-export-b', 'e2e-parent-b',
	'e2e-parent-b', 'export', 'completed', 'e2e-privacy-export-request-b',
	'4444444444444444444444444444444444444444444444444444444444444444',
	'[]', '{"synthetic":true}', NULL, 'archive/e2e-privacy-export-b.json',
	'2099-08-26T08:08:00.000Z', NULL, NULL, '2026-08-12T08:08:00.000Z',
	'2026-08-12T08:08:00.000Z', '2026-08-12T08:08:00.000Z'
);

INSERT INTO privacy_export_artifacts (
	id, privacy_request_id, subject_user_id, private_r2_key, content_type,
	size_bytes, sha256, status, generation_attempts, generated_at, expires_at,
	deleted_at, created_at, updated_at
) VALUES (
	'e2e-privacy-artifact-b', 'e2e-privacy-request-b', 'e2e-parent-b',
	'archive/e2e-privacy-export-b.json', 'application/json; charset=utf-8', 16,
	'5555555555555555555555555555555555555555555555555555555555555555',
	'ready', 1, '2026-08-12T08:08:00.000Z', '2099-08-26T08:08:00.000Z',
	NULL, '2026-08-12T08:08:00.000Z', '2026-08-12T08:08:00.000Z'
);

-- A formed individual service owned by parent B exercises the parent-facing
-- termination and attendance boundaries with schema-valid UUID identifiers.
INSERT INTO individual_requests (
	id, user_id, child_id, request_kind, funding_kind, subjects_raw,
	description, preferred_days_json, preferred_time_windows_json,
	preferred_format, preferred_locations_json, unit_rate_cents,
	parent_payable, status, version, create_idempotency_key,
	create_request_hash_sha256, admin_decision, admin_notes, reviewed_by,
	reviewed_at, created_at, updated_at
) VALUES (
	'e2e-request-active-contract-b', 'e2e-parent-b', 'e2e-child-b',
	'individual', 'self_pay', 'Synthetic active service B', '', '[]', '[]',
	'onsite', '[]', 3000, 1, 'approved', 1,
	'e2e-seed-active-contract-request-b',
	'acacacacacacacacacacacacacacacacacacacacacacacacacacacacacacacac',
	'approved', 'Synthetic E2E approval', 'e2e-admin',
	'2026-08-12T08:09:00.000Z', '2026-08-12T08:09:00.000Z',
	'2026-08-12T08:09:00.000Z'
);

INSERT INTO service_engagements (
	id, user_id, child_id, individual_request_id, request_kind,
	initial_funding_authorization_id, current_funding_authorization_id, status,
	active_from, active_until, attendance_ceased_at, attendance_notice_id,
	contract_id, created_at, updated_at
) VALUES (
	'e2e-engagement-active-b', 'e2e-parent-b', 'e2e-child-b',
	'e2e-request-active-contract-b', 'individual', NULL, NULL, 'active',
	'2026-08-01', NULL, NULL, NULL,
	'00000000-0000-4000-8000-0000000000b2',
	'2026-08-12T08:09:00.000Z', '2026-08-12T08:09:00.000Z'
);

INSERT INTO contract_offers (
	id, series_id, version, offer_number, contract_number, user_id, child_id,
	family_number_id_at_issue, family_display_id_at_issue,
	family_version_at_issue, academic_period_id, course_group_id,
	individual_request_id, funding_authorization_id, enrollment_id,
	service_engagement_id, price_quote_id, contract_kind, template_version_id,
	render_schema_version, effective_from, effective_to, billing_model, currency,
	unit_minutes, price_version_id, price_rule_id, price_source, price_mode,
	base_price_cents, price_cents, amount_semantics, payment_arrangement,
	payment_due_day, billing_period_code, provider_snapshot_json,
	party_snapshot_json, service_snapshot_json, schedule_snapshot_json,
	billing_snapshot_json, line_items_json, term_snapshot_json,
	termination_snapshot_json, withdrawal_snapshot_json,
	distance_legal_profile_snapshot_json, distance_legal_basis_hash,
	early_performance_request_version, early_performance_requested_at,
	wertersatz_notice_version, clauses_manifest_json, attachments_manifest_json,
	privacy_notice_version, media_clause_version, media_decision_snapshot_json,
	render_input_json, render_input_hash, source_manifest_json,
	source_manifest_hash, contract_html_r2_key, contract_pdf_r2_key,
	contract_hash, render_status, status, sent_at, expires_at, accepted_at,
	declined_at, admin_approved_at, cancelled_at, status_reason,
	created_by_admin_user_id, created_at, updated_at
)
SELECT
	'00000000-0000-4000-8000-0000000000b1', 'e2e-active-contract-series-b', 1,
	'E2E-ACTIVE-OFFER-B', '2. 9002-2', offer.user_id, offer.child_id,
	offer.family_number_id_at_issue, offer.family_display_id_at_issue,
	offer.family_version_at_issue, offer.academic_period_id, offer.course_group_id,
	'e2e-request-active-contract-b', offer.funding_authorization_id,
	offer.enrollment_id, 'e2e-engagement-active-b', offer.price_quote_id,
	offer.contract_kind, offer.template_version_id, offer.render_schema_version,
	'2026-08-01', offer.effective_to, offer.billing_model, offer.currency,
	offer.unit_minutes, offer.price_version_id, offer.price_rule_id,
	offer.price_source, offer.price_mode, offer.base_price_cents, offer.price_cents,
	offer.amount_semantics, offer.payment_arrangement, offer.payment_due_day,
	offer.billing_period_code, offer.provider_snapshot_json,
	offer.party_snapshot_json, offer.service_snapshot_json,
	offer.schedule_snapshot_json, offer.billing_snapshot_json,
	offer.line_items_json, offer.term_snapshot_json,
	offer.termination_snapshot_json, offer.withdrawal_snapshot_json,
	offer.distance_legal_profile_snapshot_json, offer.distance_legal_basis_hash,
	offer.early_performance_request_version, offer.early_performance_requested_at,
	offer.wertersatz_notice_version, offer.clauses_manifest_json,
	offer.attachments_manifest_json, offer.privacy_notice_version,
	'e2e-media-clause-v1', offer.media_decision_snapshot_json,
	offer.render_input_json,
	'adadadadadadadadadadadadadadadadadadadadadadadadadadadadadadadad',
	offer.source_manifest_json,
	'aeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeaeae',
	'archive/e2e-active-contract-offer-b.html',
	'archive/e2e-active-contract-offer-b.pdf',
	'afafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafaf',
	'ready', 'approved_by_admin', '2026-08-12T08:09:00.000Z',
	'2099-08-26T08:09:00.000Z', '2026-08-12T08:09:01.000Z', NULL,
	'2026-08-12T08:09:02.000Z', NULL, NULL, offer.created_by_admin_user_id,
	'2026-08-12T08:09:00.000Z', '2026-08-12T08:09:02.000Z'
FROM contract_offers offer
WHERE offer.id = 'e2e-contract-offer-b';

INSERT INTO audit_events (
	id, actor_user_id, actor_kind, action, target_kind, target_id, request_id,
	safe_diff_json, created_at
) VALUES (
	'e2e-active-contract-accept-audit-b', 'e2e-parent-b', 'user',
	'contract.accepted', 'contract_offer',
	'00000000-0000-4000-8000-0000000000b1',
	'e2e-seed-active-contract-accept-b', '{"synthetic":true}',
	'2026-08-12T08:09:01.000Z'
);

INSERT INTO contract_parent_actions (
	id, contract_offer_id, user_id, action, from_status, to_status, offer_hash,
	text_version, user_agent, ip_retention_value, ip_expires_at, idempotency_key,
	request_hash_sha256, audit_event_id, created_at
) VALUES (
	'e2e-active-contract-parent-action-b',
	'00000000-0000-4000-8000-0000000000b1', 'e2e-parent-b', 'accept', 'sent',
	'accepted_by_parent',
	'afafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafaf',
	'contract-acceptance-de-v1', 'synthetic-e2e-seed', NULL, NULL,
	'e2e-seed-active-contract-accept-b',
	'bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc',
	'e2e-active-contract-accept-audit-b', '2026-08-12T08:09:01.000Z'
);

INSERT INTO contract_acceptances (
	id, contract_offer_id, parent_action_id, user_id, accepted_at,
	ip_retention_value, ip_expires_at, user_agent, acceptance_text_version,
	acceptance_text, contract_hash, idempotency_key, created_at
) VALUES (
	'e2e-active-contract-acceptance-b',
	'00000000-0000-4000-8000-0000000000b1',
	'e2e-active-contract-parent-action-b', 'e2e-parent-b',
	'2026-08-12T08:09:01.000Z', NULL, NULL, 'synthetic-e2e-seed',
	'contract-acceptance-de-v1',
	'Synthetic immutable parent acceptance for the active E2E contract.',
	'afafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafaf',
	'e2e-seed-active-contract-accept-b', '2026-08-12T08:09:01.000Z'
);

INSERT INTO contracts (
	id, contract_offer_id, contract_number, user_id, child_id, course_group_id,
	individual_request_id, funding_authorization_id, enrollment_id,
	service_engagement_id, operational_status, parent_acceptance_id, formed_at,
	formed_by_admin_user_id, activated_at, effective_from, effective_to,
	auto_renewal_blocked_at, created_at
) VALUES (
	'00000000-0000-4000-8000-0000000000b2',
	'00000000-0000-4000-8000-0000000000b1', '2. 9002-2', 'e2e-parent-b',
	'e2e-child-b', NULL, 'e2e-request-active-contract-b', NULL, NULL,
	'e2e-engagement-active-b', 'active', 'e2e-active-contract-acceptance-b',
	'2026-08-12T08:09:02.000Z', 'e2e-admin', '2026-08-12T08:09:02.000Z',
	'2026-08-01', NULL, NULL, '2026-08-12T08:09:02.000Z'
);

-- Catalog → quote → trial lifecycle fixture (PR-A12).
-- This deliberately uses separate imported schedule/price snapshots and a
-- separate course, so the browser lifecycle cannot disturb the IDOR fixtures
-- above or depend on production/provider configuration.

INSERT INTO import_runs (
	id, source_kind, academic_period_id, source_label, source_hash_sha256,
	source_contract_id, source_contract_version, structural_fingerprint_sha256,
	dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
	attempt_no, retry_of_run_id, status, started_at, validated_at, promoted_at,
	finished_at, rows_total, rows_staged, rows_promoted, rows_skipped,
	safe_summary_json, error_code, created_at, updated_at
) VALUES
	('e2e-catalog-schedule-import', 'schedule', 'e2e-period',
	 'synthetic-e2e-catalog-schedule',
	 '1212121212121212121212121212121212121212121212121212121212121212',
	 'e2e.synthetic.schedule', 1,
	 '2323232323232323232323232323232323232323232323232323232323232323',
	 '{}',
	 '3434343434343434343434343434343434343434343434343434343434343434',
	 '4545454545454545454545454545454545454545454545454545454545454545',
	 1, NULL, 'promoted', '2026-08-12T08:09:00.000Z',
	 '2026-08-12T08:09:01.000Z', '2026-08-12T08:09:02.000Z',
	 '2026-08-12T08:09:03.000Z', 1, 1, 1, 0,
	 '{"synthetic":true}', NULL, '2026-08-12T08:09:00.000Z',
	 '2026-08-12T08:09:03.000Z'),
	('e2e-catalog-price-import', 'price', 'e2e-period',
	 'synthetic-e2e-catalog-price',
	 '5656565656565656565656565656565656565656565656565656565656565656',
	 'e2e.synthetic.price', 1,
	 '6767676767676767676767676767676767676767676767676767676767676767',
	 '{}',
	 '7878787878787878787878787878787878787878787878787878787878787878',
	 '8989898989898989898989898989898989898989898989898989898989898989',
	 1, NULL, 'promoted', '2026-08-12T08:09:00.000Z',
	 '2026-08-12T08:09:01.000Z', '2026-08-12T08:09:02.000Z',
	 '2026-08-12T08:09:03.000Z', 1, 1, 1, 0,
	 '{"synthetic":true}', NULL, '2026-08-12T08:09:00.000Z',
	 '2026-08-12T08:09:03.000Z');

INSERT INTO operation_locks (
	id, scope, resource_key, lease_owner, lease_until, fencing_token,
	created_at, updated_at
) VALUES
	('e2e-catalog-schedule-lock', 'import-promotion', 'schedule:e2e-period',
	 'e2e-catalog-fixture', '2099-12-31T23:59:59.000Z', 101,
	 '2026-08-12T08:09:00.000Z', '2026-08-12T08:09:00.000Z'),
	('e2e-catalog-price-lock', 'import-promotion', 'price:e2e-period',
	 'e2e-catalog-fixture', '2099-12-31T23:59:59.000Z', 102,
	 '2026-08-12T08:09:00.000Z', '2026-08-12T08:09:00.000Z');

INSERT INTO schedule_versions (
	id, academic_period_id, import_run_id, schema_version, generation_id,
	generated_at, version_hash_sha256, is_published, published_at, retired_at,
	promotion_owner, promotion_fencing_token, created_at
) VALUES (
	'e2e-catalog-schedule', 'e2e-period', 'e2e-catalog-schedule-import', 1,
	'e2e-catalog-generation', '2026-08-12T08:09:00.000Z',
	'9090909090909090909090909090909090909090909090909090909090909090',
	0, NULL, NULL, NULL, NULL, '2026-08-12T08:09:00.000Z'
);

UPDATE schedule_versions
SET is_published = 1,
	published_at = '2026-08-12T08:09:02.000Z',
	promotion_owner = 'e2e-catalog-fixture',
	promotion_fencing_token = 101
WHERE id = 'e2e-catalog-schedule';

INSERT INTO price_versions (
	id, academic_period_id, import_run_id, label, valid_from,
	version_hash_sha256, source_headers_json, is_active, activated_at,
	retired_at, promotion_owner, promotion_fencing_token, created_at
) VALUES (
	'e2e-catalog-price', 'e2e-period', 'e2e-catalog-price-import',
	'Synthetic E2E catalog price', '2026-07-01',
	'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
	'{"synthetic":true}', 0, NULL, NULL, NULL, NULL,
	'2026-08-12T08:09:00.000Z'
);

UPDATE price_versions
SET is_active = 1,
	activated_at = '2026-08-12T08:09:02.000Z',
	promotion_owner = 'e2e-catalog-fixture',
	promotion_fencing_token = 102
WHERE id = 'e2e-catalog-price';

INSERT INTO course_groups (
	id, academic_period_id, source_offering_key, display_name,
	normalized_price_key, lesson_kind, subject, capacity_default,
	capacity_override, requires_admin_approval, catalog_status,
	last_seen_schedule_version_id, retired_at, created_at, updated_at
) VALUES (
	'e2e-trial-course', 'e2e-period', 'synthetic:e2e-trial-course',
	'Synthetic E2E Art Studio', 'kunst', 'group', 'Kunst', 12, NULL, 0,
	'published', 'e2e-catalog-schedule', NULL,
	'2026-08-12T08:10:00.000Z', '2026-08-12T08:10:00.000Z'
);

INSERT INTO course_sessions (
	id, course_group_id, schedule_version_id, source_namespace,
	source_block_id, source_block_hash_sha256, display_name_snapshot,
	lesson_kind_snapshot, subject_snapshot, day_code, start_time, end_time,
	duration_minutes, timezone, teacher_name, building, room,
	location_display, is_current, retired_at, created_at
) VALUES (
	'e2e-trial-session', 'e2e-trial-course', 'e2e-catalog-schedule',
	'synthetic-e2e', 'e2e-trial-block',
	'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
	'Synthetic E2E Art Studio', 'group', 'Kunst', 'WE', '16:00', '17:30',
	90, 'Europe/Berlin', 'Synthetic Teacher', 'Synthetic Building',
	'Synthetic Room', 'Synthetic Building · Synthetic Room', 1, NULL,
	'2026-08-12T08:10:00.000Z'
);

INSERT INTO course_pricing_profiles (
	id, course_group_id, contract_kind, price_key, normalized_price_key,
	subjects_json, duration_source, admin_duration_minutes, status, version,
	reason, confirmed_by, created_at, updated_at
) VALUES (
	'e2e-trial-pricing-profile', 'e2e-trial-course', 'group_yearly', 'Kunst',
	'kunst', '["Kunst"]', 'schedule', NULL, 'confirmed', 1,
	'Synthetic E2E exact quote fixture', 'e2e-admin',
	'2026-08-12T08:10:00.000Z', '2026-08-12T08:10:00.000Z'
);

INSERT INTO price_rules (
	id, price_version_id, source_record_key, source_row_number, key,
	normalized_key, duration_raw, subjects_raw, subject_duration_vector_json,
	duration_total_minutes, children_count, yearly_price_cents,
	monthly_price_cents, normalized_lookup_key, rule_hash_sha256,
	provenance_json, is_valid, validation_code, created_at
) VALUES (
	'e2e-trial-price-rule', 'e2e-catalog-price', 'synthetic:e2e-trial-price', 1,
	'Kunst', 'kunst', '90', 'Kunst',
	'[{"subject":"kunst","durationMinutes":90}]', 90, 1, 4600, 6000,
	'46124f84f640df8acea5efc183ef74d5f51e18596b3213e09924010ff491314c',
	'fca3e23dd665179a0a329e536331d1c10190bc605abc35d8ba600de1a2474aaf',
	'{"synthetic":true}', 1, NULL, '2026-08-12T08:10:00.000Z'
);

-- Parent B's requested row is read-only foreign state for parent A. The main
-- lifecycle creates an independent parent-A booking for the same course.
INSERT INTO trial_bookings (
	id, user_id, child_id, course_group_id, session_id, status,
	requested_date, confirmed_date, availability_at_request,
	requires_admin_review_at_request, request_hash_sha256, idempotency_key,
	reviewed_by, reviewed_at, decision_reason, converted_at, created_at, updated_at
) VALUES (
	'e2e-trial-b', 'e2e-parent-b', 'e2e-child-b', 'e2e-trial-course',
	'e2e-trial-session', 'requested', '2026-09-16', NULL, 'available', 0,
	'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3',
	'e2e-seed-trial-b', NULL, NULL, NULL, NULL,
	'2026-08-12T08:11:00.000Z', '2026-08-12T08:11:00.000Z'
);

-- Price-review response → final confirmation lifecycle fixture (PR-A12).
-- The notification is already present in the local fake-email delivery ledger;
-- the browser scenario begins with the immutable parent-facing item and never
-- invokes a remote provider or changes a feature flag.

INSERT INTO family_number_allocations (
	id, namespace, sequence_number, display_family_id, legacy_family_id,
	owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
	created_at, updated_at
) VALUES (
	'e2e-price-family', 'portal_2', 9003, '2-9003-PRICE-E2E', NULL,
	'e2e-price-parent', 'portal', 'assigned', '2026-08-12T08:12:00.000Z', NULL,
	'2026-08-12T08:12:00.000Z', '2026-08-12T08:12:00.000Z'
);

INSERT INTO users (
	id, email, email_normalized, password_hash, pending_email,
	pending_email_normalized, pending_email_expires_at, email_version,
	email_verified_at, role, is_blocked, account_status, closed_at,
	first_name, last_name, first_name_normalized, last_name_normalized,
	phone, preferred_language, family_number_id, family_assignment_status,
	family_version, family_assignment_import_run_id, privacy_notice_version,
	privacy_accepted_at, session_version, created_at, updated_at
) VALUES (
	'e2e-price-parent', 'price-parent@e2e.invalid', 'price-parent@e2e.invalid',
	'$2b$10$QFddzPUT7XT48TjIYi0aHu4NyaBlG4OloErt9R032SlcuFDQbqpuS',
	NULL, NULL, NULL, 1, '2026-08-12T08:12:00.000Z', 'parent', 0, 'active', NULL,
	'Synthetic', 'Price Parent', 'synthetic', 'price parent', NULL, 'de',
	'e2e-price-family', 'assigned', 1, 'e2e-import',
	'e2e-synthetic-notice-v1', '2026-08-12T08:12:00.000Z', 1,
	'2026-08-12T08:12:00.000Z', '2026-08-12T08:12:00.000Z'
);

INSERT INTO privacy_acknowledgements (
	id, user_id, privacy_notice_version, acknowledged_at, evidence_hash,
	source_context, created_at
) VALUES (
	'e2e-price-privacy', 'e2e-price-parent', 'e2e-synthetic-notice-v1',
	'2026-08-12T08:12:00.000Z',
	'd3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3',
	'synthetic_e2e_fixture', '2026-08-12T08:12:00.000Z'
);

INSERT INTO children (
	id, owner_user_id, legacy_family_id, family_number_id, origin,
	source_child_key, source_full_name, source_full_name_normalized,
	source_birth_date, full_name_override, birth_date_override, full_name,
	full_name_normalized, birth_date, last_seen_run_id, is_current,
	created_at, updated_at
) VALUES (
	'e2e-price-child', 'e2e-price-parent', NULL, 'e2e-price-family', 'portal',
	'portal:e2e-price-child', 'Synthetic Price Child', 'synthetic price child',
	'2015-03-15', NULL, NULL, 'Synthetic Price Child',
	'synthetic price child', '2015-03-15', 'e2e-import', 1,
	'2026-08-12T08:12:00.000Z', '2026-08-12T08:12:00.000Z'
);

INSERT INTO academic_periods (
	id, code, display_name, starts_on, ends_on, is_current, created_at
) VALUES (
	'e2e-price-lifecycle-period', '2026-2027-price-e2e',
	'Synthetic E2E price-review period', '2026-07-01', '2027-06-30', 0,
	'2026-08-12T08:12:00.000Z'
);

INSERT INTO import_runs (
	id, source_kind, academic_period_id, source_label, source_hash_sha256,
	source_contract_id, source_contract_version, structural_fingerprint_sha256,
	dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
	attempt_no, retry_of_run_id, status, started_at, validated_at, promoted_at,
	finished_at, rows_total, rows_staged, rows_promoted, rows_skipped,
	safe_summary_json, error_code, created_at, updated_at
) VALUES (
	'e2e-price-lifecycle-import', 'price', 'e2e-price-lifecycle-period',
	'synthetic-e2e-price-review',
	'd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4',
	'e2e.synthetic.price-review', 1,
	'd5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5',
	'{}',
	'd6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6',
	'd7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7',
	1, NULL, 'promoted', '2026-08-12T08:12:00.000Z',
	'2026-08-12T08:12:01.000Z', '2026-08-12T08:12:02.000Z',
	'2026-08-12T08:12:03.000Z', 2, 2, 2, 0,
	'{"synthetic":true}', NULL, '2026-08-12T08:12:00.000Z',
	'2026-08-12T08:12:03.000Z'
);

INSERT INTO operation_locks (
	id, scope, resource_key, lease_owner, lease_until, fencing_token,
	created_at, updated_at
) VALUES (
	'e2e-price-lifecycle-lock', 'import-promotion',
	'price:e2e-price-lifecycle-period', 'e2e-price-lifecycle-fixture',
	'2099-12-31T23:59:59.000Z', 103,
	'2026-08-12T08:12:00.000Z', '2026-08-12T08:12:00.000Z'
);

INSERT INTO price_versions (
	id, academic_period_id, import_run_id, label, valid_from,
	version_hash_sha256, source_headers_json, is_active, activated_at,
	retired_at, promotion_owner, promotion_fencing_token, created_at
) VALUES (
	'e2e-price-lifecycle-version', 'e2e-price-lifecycle-period',
	'e2e-price-lifecycle-import', 'Synthetic E2E price-review version',
	'2026-07-01',
	'd8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8',
	'{"synthetic":true}', 0, NULL, NULL, NULL, NULL,
	'2026-08-12T08:12:00.000Z'
);

UPDATE price_versions
SET is_active = 1,
	activated_at = '2026-08-12T08:12:02.000Z',
	promotion_owner = 'e2e-price-lifecycle-fixture',
	promotion_fencing_token = 103
WHERE id = 'e2e-price-lifecycle-version';

INSERT INTO course_groups (
	id, academic_period_id, source_offering_key, display_name,
	normalized_price_key, lesson_kind, subject, capacity_default,
	capacity_override, requires_admin_approval, catalog_status,
	last_seen_schedule_version_id, retired_at, created_at, updated_at
) VALUES (
	'e2e-price-lifecycle-course', 'e2e-price-lifecycle-period',
	'synthetic:e2e-price-lifecycle-course', 'Synthetic E2E Price Studio',
	'e2e price lifecycle', 'group', 'Synthetic price subject', 12, NULL, 0,
	'draft', NULL, NULL, '2026-08-12T08:12:00.000Z',
	'2026-08-12T08:12:00.000Z'
);

INSERT INTO course_pricing_profiles (
	id, course_group_id, contract_kind, price_key, normalized_price_key,
	subjects_json, duration_source, admin_duration_minutes, status, version,
	reason, confirmed_by, created_at, updated_at
) VALUES (
	'e2e-price-lifecycle-profile', 'e2e-price-lifecycle-course',
	'group_yearly', 'E2E Price Lifecycle', 'e2e price lifecycle', '[]',
	'admin_confirmed', 90, 'confirmed', 1,
	'Synthetic browser price-review fixture', 'e2e-admin',
	'2026-08-12T08:12:00.000Z', '2026-08-12T08:12:00.000Z'
);

INSERT INTO price_rules (
	id, price_version_id, source_record_key, source_row_number, key,
	normalized_key, duration_raw, subjects_raw, subject_duration_vector_json,
	duration_total_minutes, children_count, yearly_price_cents,
	monthly_price_cents, normalized_lookup_key, rule_hash_sha256,
	provenance_json, is_valid, validation_code, created_at
) VALUES
	('e2e-price-lifecycle-rule-1', 'e2e-price-lifecycle-version',
	 'synthetic:e2e-price-lifecycle:1', 1, 'E2E Price Lifecycle',
	 'e2e price lifecycle', '90', NULL,
	 '[{"subject":null,"durationMinutes":90}]', 90, 1, 5000, 6500,
	 '697238bfd9e7d021b9435d459f5343341f1251f6f107acb0d638bce9016d42c2',
	 'ccd289348b097a1c11d5e6fb8b531ac32d5cebcf7d6b6554f761b70c5f552f1d',
	 '{"synthetic":true}', 1, NULL, '2026-08-12T08:12:00.000Z'),
	('e2e-price-lifecycle-rule-2', 'e2e-price-lifecycle-version',
	 'synthetic:e2e-price-lifecycle:2', 2, 'E2E Price Lifecycle',
	 'e2e price lifecycle', '90', NULL,
	 '[{"subject":null,"durationMinutes":90}]', 90, 2, 4600, 6000,
	 'ff9f4fb9c105dd50aeb9cc4697155c82655e5c7db3426b8c2587fd65cb083308',
	 'f410cf31b09860a43f28d7046b1a618f24eb754b362e0e2c0b944bb5c434495e',
	 '{"synthetic":true}', 1, NULL, '2026-08-12T08:12:00.000Z');

INSERT INTO enrollments (
	id, user_id, child_id, course_group_id, legacy_enrollment_id, lesson_kind,
	status, contract_kind, active_from, active_until, current_price_cents,
	price_source, price_mode, price_effective_from, manual_override_reason,
	manual_override_by, manual_override_at, source, created_at, updated_at,
	payment_arrangement, current_base_price_cents, current_price_version_id,
	current_price_rule_id, price_assignment_version
) VALUES (
	'e2e-price-lifecycle-enrollment', 'e2e-price-parent', 'e2e-price-child',
	'e2e-price-lifecycle-course', NULL, 'group', 'active', 'group_yearly',
	'2026-07-01', NULL, 4600, 'excel_yearly', 'rule_derived', '2026-07-01',
	NULL, NULL, NULL, 'admin', '2026-08-12T08:12:00.000Z',
	'2026-08-12T08:12:00.000Z', 'manual_payment', 4600,
	'e2e-price-lifecycle-version', 'e2e-price-lifecycle-rule-2', 1
);

INSERT INTO price_review_batches (
	id, course_group_id, reason_code, old_active_count, new_active_count,
	old_lookup_children_count, new_lookup_children_count, price_version_id,
	effective_on, earliest_effective_from, calculation_snapshot_json,
	calculation_snapshot_hash, dedupe_key, status, notification_approved_at,
	notification_approved_by, created_at, updated_at, completed_at
) VALUES (
	'e2e-price-lifecycle-batch', 'e2e-price-lifecycle-course',
	'admin_price_comparison', 1, 1, 1, 1, 'e2e-price-lifecycle-version',
	'2026-08-12', '2026-09-01',
	'{"schemaVersion":1,"scope":"price-review-browser-lifecycle","synthetic":true}',
	'7d597e6d3d1f48c5b898d8aa5c6358b8f142efbb7a7b1b1c63b9aa494b08174c',
	'e2e-price-lifecycle-batch-v1', 'awaiting_responses',
	'2026-08-12T08:13:00.000Z', 'e2e-admin',
	'2026-08-12T08:12:00.000Z', '2026-08-12T08:13:01.000Z', NULL
);

INSERT INTO price_review_items (
	id, batch_id, version, public_reference, enrollment_id,
	legacy_enrollment_id, user_id, old_base_price_cents, old_price_cents,
	new_base_price_cents, new_final_price_cents, old_price_source,
	new_price_source, old_price_mode, new_price_mode, old_price_version_id,
	new_price_version_id, old_price_rule_id, new_price_rule_id,
	target_state_hash, expected_active_count, expected_lookup_children_count,
	effective_on, decision_code, decision_json, terms_snapshot_json, item_hash,
	acceptance_text_version, dedupe_key, status, sent_at, response_deadline,
	responded_at, final_admin_confirmed_at, final_admin_confirmed_by,
	final_admin_confirmation_reason, manual_contact_task_id, scheduled_for,
	applied_at, superseded_by_item_id, created_at, updated_at
) VALUES (
	'e2e-price-lifecycle-item', 'e2e-price-lifecycle-batch', 1,
	'e2e-price-lifecycle-review', 'e2e-price-lifecycle-enrollment', NULL,
	'e2e-price-parent', 4600, 4600, 5000, 5000, 'excel_yearly', 'excel_yearly',
	'rule_derived', 'rule_derived', 'e2e-price-lifecycle-version',
	'e2e-price-lifecycle-version', 'e2e-price-lifecycle-rule-2',
	'e2e-price-lifecycle-rule-1',
	'a25bc10a9228449340fcd172d58830a4cb974afa9e8c51396d47083cf152d37f',
	1, 1, '2026-08-12', 'EXACT_RULE',
	'{"decisionCode":"EXACT_RULE","manualContactRequired":false,"schemaVersion":1}',
	'{"acceptanceTextVersion":"price-review-acceptance-de-v1","amountSemantics":"monthly_base_price","basePriceNotInvoice":true,"currency":"EUR","direction":"increase","effectiveDateRule":"first_day_next_calendar_month_after_admin_confirmation","newBasePriceCents":5000,"newFinalPriceCents":5000,"newPriceMode":"rule_derived","oldBasePriceCents":4600,"oldFinalPriceCents":4600,"oldPriceMode":"rule_derived","priceRuleId":"e2e-price-lifecycle-rule-1","priceVersionId":"e2e-price-lifecycle-version","responseCalendarDays":14,"reviewEffectiveOn":"2026-08-12","schemaVersion":1,"targetKind":"enrollment"}',
	'77e0e6938d6a8dfd299c66683c82310ce2b225c368aa88f2357786433cf986f8',
	'price-review-acceptance-de-v1',
	'295506eed076e58e2662f4c02a21584a6c53ccf9d869cc75e5cd07d3e93d490c',
	'sent', '2026-08-12T08:13:01.000Z', '2099-08-26',
	NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
	'2026-08-12T08:12:00.000Z', '2026-08-12T08:13:01.000Z'
);

INSERT INTO price_review_outbox_events (
	id, event_type, source_kind, source_id, recipient_role, recipient_user_id,
	payload_json, dedupe_key, status, created_at
) VALUES (
	'e2e-price-lifecycle-outbox', 'item_available', 'price_review_item',
	'e2e-price-lifecycle-item', 'parent', 'e2e-price-parent',
	'{"templateKey":"price_review.item_available","cabinetUrl":"http://127.0.0.1:4173/price-reviews/e2e-price-lifecycle-review","responseDeadline":"2099-08-26"}',
	'e2e-price-lifecycle-item-available-v1', 'pending',
	'2026-08-12T08:13:01.000Z'
);

INSERT INTO price_review_deliveries (
	id, price_review_item_id, outbox_event_id, channel, recipient_user_id,
	cabinet_url, delivery_status, dedupe_key, delivered_at, created_at
) VALUES (
	'e2e-price-lifecycle-delivery', 'e2e-price-lifecycle-item',
	'e2e-price-lifecycle-outbox', 'fake_email', 'e2e-price-parent',
	'http://127.0.0.1:4173/price-reviews/e2e-price-lifecycle-review',
	'queued', 'fake-email:e2e-price-lifecycle-item:v1',
	'2026-08-12T08:13:01.000Z', '2026-08-12T08:13:01.000Z'
);


-- Isolated local cabinet UI fixtures (no production seed).
INSERT INTO family_number_allocations (
	id, namespace, sequence_number, display_family_id, legacy_family_id,
	owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
	created_at, updated_at
) VALUES
	('e2e-cabinet-family', 'portal_2', 9010, '2-9010-E2E', NULL,
	 'e2e-cabinet-parent', 'portal', 'assigned', '2026-08-12T08:00:00.000Z', NULL,
	 '2026-08-12T08:00:00.000Z', '2026-08-12T08:00:00.000Z');

INSERT INTO users (
	id, email, email_normalized, password_hash, pending_email,
	pending_email_normalized, pending_email_expires_at, email_version,
	email_verified_at, role, is_blocked, account_status, closed_at,
	first_name, last_name, first_name_normalized, last_name_normalized,
	phone, preferred_language, family_number_id, family_assignment_status,
	family_version, family_assignment_import_run_id, privacy_notice_version,
	privacy_accepted_at, session_version, created_at, updated_at
) VALUES
	('e2e-cabinet-parent', 'cabinet-parent@e2e.invalid', 'cabinet-parent@e2e.invalid',
	 '$2b$10$QFddzPUT7XT48TjIYi0aHu4NyaBlG4OloErt9R032SlcuFDQbqpuS',
	 NULL, NULL, NULL, 1, '2026-08-12T08:00:00.000Z', 'parent', 0, 'active', NULL,
	 'Synthetic', 'Cabinet Parent', 'synthetic', 'cabinet parent', NULL, 'de',
	 'e2e-cabinet-family', 'assigned', 1, 'e2e-import', 'e2e-synthetic-notice-v1',
	 '2026-08-12T08:00:00.000Z', 1, '2026-08-12T08:00:00.000Z',
	 '2026-08-12T08:00:00.000Z');

INSERT INTO children (
	id, owner_user_id, legacy_family_id, family_number_id, origin,
	source_child_key, source_full_name, source_full_name_normalized,
	source_birth_date, full_name_override, birth_date_override, full_name,
	full_name_normalized, birth_date, last_seen_run_id, is_current,
	created_at, updated_at
) VALUES
	('e2e-ui-legacy-child', 'e2e-parent-b', NULL, 'e2e-family-b', 'legacy',
	 'portal:e2e-ui-legacy-child', 'Synthetic Legacy Child', 'synthetic legacy child', '2015-01-10',
	 NULL, NULL, 'Synthetic Legacy Child', 'synthetic legacy child', '2015-01-10',
	 'e2e-import', 1, '2026-08-12T08:00:00.000Z', '2026-08-12T08:00:00.000Z');

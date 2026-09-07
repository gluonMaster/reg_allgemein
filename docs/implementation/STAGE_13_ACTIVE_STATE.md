# Stage 13: current operational state

<!-- stage-13-current-review-status: independent_go -->

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-09-07T12:59:55Z
reviewed_candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
local_remediation_candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
last_completed_gate: phase-5-contract-E04b-success
next_gate: phase-5-contract-C04c
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
current_review_status: independent_go
current_phase: phase-5-contract-E04b-checkpoint
last_atomic_action: E04b
last_atomic_result: success
next_atomic_action: C04c
rollover_required: no
recommended_next_session_mode: High
mode_reason_plain: Actual_postcondition_recorded_next_granted_atomic_step_has_known_target_and_containment
-->

Этот файл — **единственный источник текущего operational state** Stage 13.
Roadmap, runbooks, readiness/traceability и handoff задают стабильные правила либо
хранят историю; из них нельзя выводить current candidate, deployed version или
следующее действие. Историю открывать только по конкретной ссылке на evidence.

## Machine-readable state

```yaml
state_schema: 1
milestone: full-manual-preview
milestone_status: blocked
production_status: blocked
permission_state: C04_granted_sequence_remaining_only_unconsumed_actions_no_repeat_or_scope_expansion
review:
  status: independent_go
  candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
  last_independently_reviewed_candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
  unresolved_candidate_p0: 0
  unresolved_candidate_p1: 0
  deployed_open_p1: none_paused_config_login_P1_resolved_by_actual_200
  verdict_scope: one_code_only_preview_deploy_config_bindings_secrets_schema_preserved
  independent_reviewer: review_preview_pause
  local_validation:
    check: passed_0_errors_0_warnings
    full_vitest: 79_files_586_pass_0_fail_1_expected_Windows_skip
    chromium_e2e: 23_of_23
    build: passed
    compiled_worker_smoke: login_200_inputs_present_anonymous_admin_401_health_503_outbound_0
    independent_review: GO_no_new_P0_P1
  previous_reviewed_candidate: 438a51399ac5f58b428b624c52ca2cbbc059ae9c
preview:
  access: enforced
  deployed_candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
  deployed_fingerprint: a255463d5707
  traffic_percent: 100
  active_version_count: 1
  candidate_annotation_exact: true
  bindings_and_feature_gates_unchanged: true_exact_C00_settings_preserved_by_code_only_fix
  deployment_postcondition: success_exact_new_module_single_version_100_percent_login_200_health_503_no_domain_session_provider_monitoring_delta
  latest_readonly_control_utc: 2026-09-07T11:14:38.228Z
  latest_anonymous_access_check: 2026_09_07_C00fix_HEAD_302_Cloudflare_Access
  target_fingerprints:
    account: 5dbd04a4763a
    worker: 242c1796e930
    origin_host: 88ed782ba25a
    d1: ccdeb22bb2a1
  d1:
    applied_through: 0026_background_d1_cost_controls.sql
    pending_exactly: []
    last_recorded_foreign_key_violations: 0
    quota_precondition: confirmed_by_one_account_analytics_observation_2026_09_04T10_39_52Z_for_second_registration
    integrity_postcondition: passed_10_affected_table_scoped_quick_checks_fk_zero
    migration_attempted: true
    migration_result: success
    latest_bounded_postcondition_utc: 2026-09-07T12:59:55.688Z
    postcondition_rows_read: 319
    latest_read_kind: E04b_bounded_actual_postcondition
    preceding_preflight_rows_read: 1050
    postcondition_rows_written: 0
    postcondition_changes: 0
    postcondition_changed_db: false
    time_travel_available: true
    time_travel_observed_utc: 2026-09-04T12:40:28Z
  bootstrap:
    result: success
    cli_candidate: 438a51399ac5f58b428b624c52ca2cbbc059ae9c
    cli_invocations: 1
    cli_completed_utc: 2026-09-04T12:40:37Z
    cli_exit_code: 0
    cli_reported_status: consumed
    database_postcondition: success_reconciled_2026_09_04T12_40_39Z
    target_slot: 1
    preserved_parent_slot: 2
    request_fingerprint: e7c28770458d
    receipt_preservation: exact_before_after_equality
    linked_action_assertion_audit_control_chains: 1
    immutable_seal_triggers: 6
    permission_consumed: true
    retry_forbidden: true
  first_admin_login:
    result: success
    actor: owner_using_existing_private_credentials
    target_slot: 1
    preserved_parent_slot: 2
    new_sessions: 1
    new_session_version: 2
    new_session_created_utc: 2026-09-04T13:37:12.010Z
    latest_observed_session_touch_utc: 2026-09-04T13:38:08.263Z
    database_postcondition: success_reconciled_2026_09_04T13_38_25Z
    ui_postcondition: owner_screenshot_shows_protected_admin_shell_and_dashboard_ambient_route_admin
    historical_sessions_bootstrap_receipts_providers_unchanged: true
    authenticated_requests_by_agent_during_reconciliation: 0
    permission_completed: true
  first_admin_logout:
    result: success
    actor: owner_normal_logout_reported_in_chat
    target_slot: 1
    matched_first_admin_login_session: true
    revoked_utc: 2026-09-04T13:44:57.676Z
    revocation_reason: logout
    linked_audit_count: 1
    audit_actor_and_timestamp_match: true
    database_postcondition: success_reconciled_2026_09_04T13_47_19Z
    other_historical_sessions_and_second_parent_unchanged: true
    global_nonrevoked_sessions: 0
    agent_authenticated_requests: 0
  scheduled:
    fast: last_run_succeeded_automatic_dispatch_now_paused_by_authorized_config
    maintenance: last_run_succeeded_automatic_maintenance_now_paused_by_authorized_config
    fixed_cadence_rows: 2
    recent_failures: 0
    automatic_history_growth: stopped
    health: head_503_expected_Cron_disabled_empty_no_store_noindex
  synthetic_state:
    users: 3
    parents: 2
    verified_users: 3
    admins: 1
    privacy_acknowledgements: 3
    unused_verification_tokens: 0
    used_verification_tokens: 3
    verification_commits: 3
    users_with_family_id: 3
    verification_deliveries_sent_with_receipt: 3
    welcome_deliveries_sent_with_receipt: 3
    auth_sessions: 14
    nonrevoked_auth_sessions: 2
    logged_out_auth_sessions: 11
    role_change_revoked_auth_sessions: 1
    distinct_identities: 3
    distinct_assigned_families: 3
    nonrevoked_session_owners: 2
    distinct_delivery_recipients: 3
    orphan_sessions_and_recipients: 0
    token_commit_delivery_family_and_child_owner_mismatches: 0
    first_admin_sessions_total_nonrevoked_valid: 7_1_1
    first_admin_session_version: 2
    second_parent_sessions_total_nonrevoked_valid: 4_1_1
    second_parent_session_version: 1
    second_parent_session_drift: logout_observed_after_prompt_05_not_performed_by_this_session
    owned_children_per_parent: P1_0_P2_1
    bootstrap_control: consumed
    bootstrap_actions_assertions_audit: 1_1_1
    canonical_bootstrap_eligible_accounts: 0
    canonical_bootstrap_ineligibility_reason: control_consumed_and_active_admin_exists
    accounts_without_retained_parent_state: 3
    eligibility_guard_candidate: 438a51399ac5f58b428b624c52ca2cbbc059ae9c
    bootstrap_session_change: only_first_accounts_previously_nonrevoked_session_revoked_with_role_change
    registration_finalization_commits_per_account: 1
    registration_finalization_result: portal_allocated_assertion_passed
    other_retained_state_guard_branches_nonzero: 0
    import_pair: 2_plus_1703
  providers:
    auth_and_resend: enabled_only_behind_access_and_three_owner_controlled_recipient_hashes
    telegram: fail_closed_until_separate_manual_preview_phase
    documents: upload_enabled_authorized_scenario_D18a_verified
    contracts: fail_closed_until_separate_manual_preview_phase
flow_verification:
  cost_bounded_runtime: deployed_and_bounded_scheduled_postcondition_passed
  controlled_registration: success_one_unverified_parent_one_privacy_acceptance_one_token_one_terminal_delivery
  email_verification: success_one_used_token_one_commit_one_family_assignment_one_terminal_welcome_delivery
  login_logout: historical_parent_login_logout_passed_remaining_first_session_now_revoked_by_bootstrap
  second_registration: historical_P1_registration_complete_P2_addition_recorded_in_06b_closeout
  second_recipient_membership: owner_screenshot_email_exact_sha256_matches_protected_allowlist_slot_2
  second_verification_welcome: success_second_used_token_commit_distinct_family_and_single_terminal_welcome
  second_login: success_one_new_second_parent_session_cabinet_open_first_parent_sessions_unchanged
  prompt_05: historically_complete_at_11_23_43Z_second_session_now_logged_out
  prompt_06: complete
  first_admin_bootstrap: success_one_official_cli_attempt_and_bounded_remote_postcondition
  first_admin_login: success_admin_shell_visible_one_new_valid_version_2_session_preserved_state_reconciled
  first_admin_logout: success_matching_admin_session_revoked_logout_linked_audit_one_no_active_sessions
  local_auth09_remediation: passed_five_regressions_plus_direct_consumers_and_affected_browser_scenarios
  role_isolation_live: passed_scoped_parent_admin_CSRF_real_child_request_owner_controls_and_all_normal_logouts
  role_isolation_preparation: complete_exact_rbac_csrf_protocol_and_conditional_cross_owner_fixture_plan
  rbac_csrf_owner_denial: live_A01_A14_B01_B06_passed_plus_inherited_exact_candidate_evidence_other_object_surfaces_pending
role_isolation_plan:
  document: docs/implementation/STAGE_13_LIVE_ROLE_ISOLATION_PLAN.md
  local_execution_prompt: out/codex-two-day-preview-prompts-2026-09-03/06B_HIGH_LIVE_ROLE_ISOLATION_CLOSEOUT.md
  private_recipient_reference: tmp/role-isolation-06b-owner/recipient-private.json
  private_recipient_record: owner_only_git_ignored_contains_owner_selected_address_and_digest_no_password
  execution_prompt_status: complete
  prompt_06_interpretation: original_did_not_explicitly_require_extra_live_sessions_or_third_account_this_is_separately_requested_bounded_extension
  closeout_scope: sealed_bootstrap_plus_role_csrf_child_request_owner_pass_explained_side_effects_and_final_normal_logout
  later_full_preview_scope: document_contract_message_price_provider_checks_remain_separate_not_a_new_06_closeout_gate
  inventory_utc: 2026-09-04T16:28:08.423Z
  inventory_result: success_final_bounded_readonly_06b_closeout
  observed_roles: one_verified_admin_two_verified_active_parents
  current_nonrevoked_sessions: 0
  children: 1704_total_1_owned_portal_1703_unclaimed_legacy_baseline
  requests_documents_offers_artifacts_threads_price_items: requests_1_other_five_categories_zero
  rbac_csrf_cases: A01_A14_and_B01_B06_passed_final_reconciliation_passed
  cross_parent_fixture_gap: resolved_one_C2_and_one_Q2_draft_owned_by_P2_positive_controls_passed
  owner_input: additional_controlled_recipient_proposed_in_conversation_if_needed_not_copied_into_tracked_state
  third_parent_need: satisfied_P2_verified_active_parent
  proposed_account_setup: append_one_recipient_hash_then_normal_registration_verification_welcome_login_each_checkpointed
  proposed_fixture_setup: one_synthetic_portal_child_and_one_individual_self_pay_draft_via_normal_routes_no_submit
  live_allowlist_changed: true
  third_account_created: true
  fixture_created: true
  authenticated_probe_executed: true
  candidate_p0_p1_introduced: false_known_data_prerequisite_not_runtime_defect
document_phase_preparation:
  manifest: docs/implementation/STAGE_13_DOCUMENT_PHASE_MANIFEST.md
  result: success_readonly_local_preparation
  inventory_utc: 2026-09-05T17:37:27.347Z
  metadata_transport_utc: 2026-09-05T17:48:53.853Z
  remote_mutations: 0
  authenticated_app_requests: 0
  exact_bundle_unchanged: true
  private_eu_r2_distinct: true
  quarantine_fingerprint: 442dca1871ce
  archive_fingerprint: 3996cebdabb0
  r2_dev_enabled: false
  r2_custom_domains: 0
  bucket_object_delete_lifecycle_rules: 0
  bucket_lock_rules: 0
  current_document_upload_enabled: true
  proposed_only_change: DOCUMENT_UPLOAD_ENABLED_false_to_true
  proposed_method: strict_deploy_same_exact_reviewed_bundle
  strict_dry_run: passed_exact_module_digest_existing_build_and_restored_local_config
  current_nonrevoked_sessions: 0
  existing_funding_authorizations_documents_storage_intents: 0_0_0
  fixture_prerequisite: one_new_P2_C2_nachhilfe_jobcenter_draft_QD_and_FD_via_normal_parent_route_Q2_preserved
  synthetic_input: one_locally_generated_PNG_16954_bytes_canonical_upload_validator_passed
  synthetic_sha256: 827fbc61bdd6ec453cccdbf2a80f1b1aa036069ca246182ebf4e86659afffd81
  actual_local_av_scan: owner_ESET_19_2_7_0_completed_zero_detections_definitions_current_2026_09_05_exact_local_SHA_unchanged
  metadata_read_method: exact_key_prefix_per_page_2_zero_or_one_result_no_cursor_or_truncation
  head_transport: unsupported_405_not_used
  local_metadata_parser: optional_result_info_corrected_recorded_response_reused_no_write_ambiguity
  actual_document_lifecycle: D01a_D18b_positive_complete_owner_AV_same_admin_attestation_separate_approve_private_archive_owner_bytes_foreign_404_quarantine_deleted
  broader_req11_rejected_and_14day_cleanup: pending_separate_scenario_not_satisfied_by_one_approved_document
  protected_evidence: tmp/document-phase-07-owner
  configuration_permission: completed_one_deploy_verified_no_rollback_needed
  document_scenario_permission: granted_entire_D01a_D18b_including_normal_sessions_QD_FD_D0_download_real_owner_AV_attestation_review_archive_owner_foreign_checks_retention
document_config_deployment:
  result: success
  utc: 2026-09-05T18:12:04.158Z
  attempts: 1
  permission_consumed: true
  before_version_fingerprint: 14841fbf75b2
  after_version_fingerprint: aba79c9fa0ae
  active_versions: 1
  traffic_percent: 100
  source_candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
  module_sha256: eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b
  only_config_delta: DOCUMENT_UPLOAD_ENABLED_false_to_true
  other_settings_resources_Cron_Access: exact_preserved
  private_distinct_EU_R2: verified
  health: HEAD_204_no_store_noindex
  D1_domain_sessions_providers_audit: exact_before_after_equal
  D1_read_only_rows: 111
  D1_rows_written: 0
  local_ignored_config_synced: true
  rollback_required: false
  scenario_started: false
  protected_evidence: tmp/document-phase-07-owner/deploy-result-safe.json
document_scenario_execution:
  scope: entire_manifest_D01a_D18b_explicit_owner_approval
  scope_reconfirmation_required: false
  latest_preflight_utc: 2026-09-05T18:26:34.655Z
  result: D01a_D18b_complete_success
  scenario_mutation_attempts: 23
  active_sessions: 0
  fixture_bytes: 16954
  fixture_sha256: 827fbc61bdd6ec453cccdbf2a80f1b1aa036069ca246182ebf4e86659afffd81
  local_AV: actual_owner_clean_ESET_result_screenshot_and_local_product_version_evidence_recorded
  local_encrypted_unsynced_quarantine_workspace: owner_explicit_exact_D0_exception_no_encryption_changes_selected_local_directory_no_registered_sync_root_match
  protected_evidence: tmp/document-phase-07-owner/paid-20260906-closeout-safe.json
  containment: retain_private_approved_archive_and_local_copy_all_sessions_revoked_no_extra_fixture_repair_or_delete
document_cost_observation:
  observed_utc: 2026-09-06T17:33:56.680Z
  scope: account_all_workers_2026_09_01_to_observation_adaptive_analytics_not_invoice
  requests: 8992
  CPU_ms: 108517.073
  included_requests_percent: 0.08992
  included_CPU_percent: 0.36172357666666666
  observed_worker_overage_estimate_USD: 0
  observation_policy: before_and_final_bounded_queries_no_background_polling_or_load_test
  session_stop_budget: at_most_one_login_one_denial_one_security_form_GET_one_logout_no_blind_retry
  invoice_limit: base_subscription_other_services_and_analytics_lag_are_separate_no_hard_dollar_cap_claimed
  protected_evidence: tmp/document-phase-07-owner/paid-20260906-after-cost-safe.json
document_login_resource_incident:
  current_status: resolved_for_this_Paid_normal_login_no_new_resource_error_observed
  resolution: one_native_Paid_login_succeeded_normal_cabinet_redirect_and_only_P1_session_created_hashing_unchanged
  classification: historical_P1_resolved_for_current_Paid_login_2026_09_06_D17a_actual_session_verified
  observed_utc: 2026-09-05T20:08:16Z
  browser_request: native_POST_auth_login_HTTP503_Cloudflare1102
  reported_owner_actor: P1_not_authenticated_no_session_created
  ray_fingerprint: ce4bbd2596e4
  analytics_outcome: exceededResources_exact_CPU_vs_memory_subtype_unconfirmed
  cpu_time_microseconds: 381493
  worker_version_fingerprint: aba79c9fa0ae
  settings_exact_preserved: true
  persisted_domain_session_provider_delta: none_at_readonly_observation
  remaining_active_sessions: 0
  actual_worker_plan_and_effective_CPU_cap: Workers_Paid_confirmed_owner_and_live_same_account_UI_no_explicit_limit_documented_default_30000ms
  detailed_logs_access: API_403_no_logs_or_tail_reconfiguration_attempted
  working_hypothesis: historic_CPU_vs_memory_subtype_unproven_Paid_real_login_succeeded_without_runtime_or_hashing_change
  local_password_profile: synthetic_Node_valid_compare_391_406_438_ms_CPU_wrong_compare_359_391_391_ms_fresh_dummy_734_ms
  local_profile_remote_equivalence: not_claimed_no_actual_credentials_or_network_used
  previous_project_comparison: local_bcrypt_cost10_vs_current_cost12_approximately_fourfold_core_work
  comparison_evidence: tmp/login-project-comparison-20260905.json
  previous_project_remote_metrics_and_stored_hash_cost: not_read_local_source_only_owner_reports_Free_without_failures
  containment: no_retry_no_new_session_preserve_archive_no_config_plan_runtime_change
contract_phase_preparation:
  manifest: docs/implementation/STAGE_13_CONTRACT_PHASE_MANIFEST.md
  result: readonly_manifest_prepared_config_ready_full_scenario_not_executable_yet
  utc: 2026-09-06T18:13:57Z
  remote_mutations: 0
  authenticated_application_requests: 0
  protected_evidence: tmp/contract-phase-08-owner
  evidence_index_sha256: 033e1d64fa23ea8f0c50d7d740d1be2d76375fb73f10df3471d29bc0399e8ff5
  inventory_utc: 2026-09-06T18:01:07.463Z
  D1_rows_read_inventory_plus_course_check: 944
  D1_rows_written: 0
  D1_changes: 0
  D1_changed_db: false
  target_settings_bindings_and_version_exact: true
  Browser_binding: BROWSER_type_browser_existing
  R2_archive: private_EU_3996cebdabb0
  recipient: existing_P2_allowlist_digest_prefix_7c1f9b0ac168_no_pending_email
  active_sessions: 0
  existing_templates_offers_artifacts_certificates: 0_0_0_0
  template_version: preview-review-v1
  immutable_local_bundles: 4_canonical_hashes_and_embedded_fonts_verified_no_renderer_invoked
  actual_Browser_calls: 0
  planned_Browser_calls: four_offer_PDFs_plus_one_certificate
  planned_private_R2_objects: four_template_JSON_eight_offer_HTML_PDF_one_certificate_PDF
  current_contract_send: true
  current_preview_review_flag: true
  current_contract_renderer: browser_run
  current_scheduled_jobs: false
  current_scheduled_outbox_batch_limit: 1
  config_proposal: three_contract_values_plus_temporary_Cron_stop_and_batch_one
  config_strict_dry_run: passed_same_module_sha256_eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b
  config_local_sync: exact_proposed_config_synced_in_primary_and_detached_source_after_verified_deploy
  no_blind_resend_constraint: existing_email_trigger_max_attempts_5_and_retryable_ambiguity_contained_by_active_Cron_stop_manual_single_dispatch
  health_during_active_stop: observed_503_expected_until_separate_safe_Cron_restoration
  notification_scope: four_contract_sent_plus_six_auxiliary_rows_ten_total_not_yet_authorized
  fixture_prerequisites: Q2_QD_submit_then_Q2_approve_FD_dated_approve_QD_approve_preserve_D0
  group_prerequisite: satisfied_two_published_synthetic_90_minute_groups_and_two_current_sessions
  schedule_execution_status: C01a_and_C01b_success_actual_state_reconciled_two_groups_sessions_published
  config_permission: consumed_success_one_exact_five_value_preview_deploy
  Browser_R2_permission: not_granted
  four_PDF_email_permission: not_granted
  auxiliary_notification_permission: not_granted
  initial_control_stop: corrected_local_optional_absent_flag_predicate_before_D1_R2_inventory_no_remote_write
contract_config_deploy:
  action: C00
  utc: 2026-09-06T22:13:11Z
  phase: phase_5_contract_configuration
  result: success
  allowed_scope: one_exact_five_value_preview_deploy_owner_approval_87e0cf3
  permission_consumed: true
  remote_mutation_attempts: 1
  before_version: aba79c9fa0ae
  after_version: 7c1bae246b7f
  deployed_source_candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
  module_sha256: eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b
  one_version_at_100_percent: true
  target_fingerprints: account_5dbd04a4763a_worker_242c1796e930_origin_88ed782ba25a_D1_ccdeb22bb2a1
  CONTRACT_SEND_ENABLED: false_to_true
  CONTRACT_PREVIEW_REVIEW_ENABLED: absent_effective_false_to_true
  CONTRACT_RENDERER: disabled_to_browser_run
  SCHEDULED_JOBS_ENABLED: true_to_false
  SCHEDULED_OUTBOX_BATCH_LIMIT: 25_to_1
  other_settings_resources_runtime_Cron_entries_and_secrets: unchanged
  Access_anonymous_HEAD: 302
  archive_quarantine: private_distinct_EU_3996cebdabb0_442dca1871ce
  health_before_after: 204_to_503_expected_no_store_noindex_empty
  actual_leases_before_after: zero_active_locks_and_cadence_leases
  email_before_after: six_certain_historical_sent_zero_nonsent_unchanged
  domain_and_all_eleven_revoked_sessions: unchanged_exact_scoped_digest
  Browser_calls_R2_writes_provider_sends_app_sessions_business_commands: 0_0_0_0_0
  D1_postcondition_rows_read: 1050
  D1_postcondition_rows_written: 0
  D1_postcondition_changes: 0
  D1_postcondition_changed_db: false
  local_config_sync: success_exact_proposed_config_after_remote_reconciliation
  rollback_required: false
  rollback_authorized: false
  rollback_reference: prior_version_aba79c9fa0ae_only_with_separate_scope_no_foreign_drift_and_no_held_or_uncertain_email
  containment: preserve_Access_and_Cron_stop_no_automatic_retries_maintenance_or_new_remote_command_without_scope
  protected_evidence: tmp/contract-phase-08-owner/deploy-evidence-index.json
  evidence_index_sha256: 451f6c5e55cfff9025d2cd91f39dc07f72805cd402b3bfe1c29b2b739efc6822
  restored_credential: current_computer_DPAPI_readable_owner_only_ACL_authorized_health_passed_no_agent_Access_mutation
  nonblocking_backlog:
    - P2_OPS_HISTORICAL_RUNNING_001_old_scheduled_funding_expiry_record_4681df27717d_from_2026_09_03_no_active_lock_later_fenced_runs_succeeded_left_unchanged
  local_preflight_correction: exact_historical_record_pinned_and_preserved_new_running_rows_or_any_current_lease_still_block
contract_schedule_preparation:
  utc: 2026-09-06T22:25:35Z
  result: success_local_rehearsal_and_readonly_empty_target
  remote_mutation_attempts: 0
  driver: tmp/contract-phase-08-schedule.mjs
  driver_sha256: 7cf38b447e6cfcf9e5c19642bdc504a22cba3aaf65f19ec5d0428fce4a1923bc
  protected_plan: tmp/contract-phase-08-owner/schedule-driver-plan.json
  protected_plan_sha256: 3502774f25e6ba5b435e11116b1f6fe1b238f87bb64442e43e70ce2fd4c41b8c
  protected_rehearsal: tmp/contract-phase-08-owner/schedule-rehearsal-safe.json
  protected_empty_target: tmp/contract-phase-08-owner/schedule-empty-baseline-safe.json
  exact_source_guard: canonical_import_foundation_redaction_remote_boundary_migrations_match_0db38842524ebc146eaa56a9d089e3c3484bf0f3_clean_worktree_required
  fixture: two_synthetic_90_minute_groups_GY_90886bf5bcc5_GM_58cb630926ac_no_Office
  remote_groups_sessions_schedule_versions_matching_runs: 0_0_0_0
  local_rehearsal: nine_checks_passed_against_real_local_D1_with_all_26_migrations_and_existing_RemoteD1Boundary_transport
  stage_expected: one_validated_run_one_unpublished_version_two_draft_groups_two_noncurrent_sessions_zero_issues
  stage_internal_write_requests: 5
  promote_expected: same_version_published_two_published_groups_two_current_sessions_one_promotion_event_one_linked_system_audit
  promote_internal_write_requests: 3
  failure_containment: first_error_latches_write_stop_blocks_cleanup_retry_and_release_writes_readonly_actual_postcondition_then_checkpoint
  idempotency: pinned_run_and_fixture_stage_repeat_no_write_promote_repeat_readonly_noop
  first_schedule_publication: true_no_previous_version_for_canonical_rollback
  rollback_scope: none_no_direct_delete_repair_or_database_restore
  containment: hidden_staging_or_two_synthetic_published_groups_behind_Access_Cron_paused_no_downstream_offers_until_reconciled
  schedule_import_stage_permission: consumed_success_C01a_once
  schedule_import_promote_permission: consumed_success_C01b_once
contract_schedule_owner_scope:
  utc: 2026-09-06T22:38:11Z
  source: explicit_owner_permission_after_reviewable_two_step_plan
  stage: C01a_once
  promote: C01b_once_only_after_actual_successful_C01a_postcondition_and_separate_docs_only_commit
  protected_evidence: tmp/contract-phase-08-owner/schedule-owner-approval.json
  plan_sha256: 3502774f25e6ba5b435e11116b1f6fe1b238f87bb64442e43e70ce2fd4c41b8c
  rollback: no_previous_schedule_version_containment_only_no_delete_repair_restore_or_retry
contract_schedule_stage_postcondition:
  utc: 2026-09-06T22:38:45Z
  action: C01a
  result: success
  permitted_scope: one_canonical_two_group_synthetic_stage_command
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1
  deployed_candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
  deployed_version_fingerprint: 7c1bae246b7f
  operator_commands: 1
  internal_write_requests: 5
  run_fingerprint: 1c0c772dbff6
  schedule_version_fingerprint: 54efc84fcc54
  schedule_version_sha256: 85d4678dbee86376391a4dd180a8b5117c1e10f587ce9a261c036f12351fb45a
  before: zero_matching_runs_versions_groups_sessions
  after: one_validated_run_one_unpublished_version_two_draft_groups_two_noncurrent_sessions_zero_issues
  actual_postcondition: verified_by_readonly_D1_after_command_not_exit_code
  schedule_stage_postcondition: success_C01a_validated_hidden_two_groups_two_sessions
  other_domain_counts: unchanged_users_3_sessions_11_requests_2_authorizations_1_documents_1_offers_0_artifacts_0_emails_6_telegram_0_storage_intents_2
  active_sessions_offers_actionable_mail: 0_0_0
  write_error_or_ambiguity: none
  protected_evidence: tmp/contract-phase-08-owner/C01a-checkpoint-safe.json
  evidence_sha256: f9987631eda6b180f54ce6db64adaea1437d34a21ed43f33099989f8eb95f401
  rollback: no_prior_schedule_version_no_delete_repair_restore_authorized
  containment: keep_Access_Cron_pause_bounded_synthetic_state_stop_no_automatic_retry
contract_schedule_promotion_postcondition:
  utc: 2026-09-06T22:41:17Z
  action: C01b
  result: success
  permitted_scope: one_canonical_promotion_of_exact_staged_version_command
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1
  deployed_candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
  deployed_version_fingerprint: 7c1bae246b7f
  operator_commands: 1
  internal_write_requests: 3
  run_fingerprint: 1c0c772dbff6
  schedule_version_fingerprint: 54efc84fcc54
  schedule_version_sha256: 85d4678dbee86376391a4dd180a8b5117c1e10f587ce9a261c036f12351fb45a
  before: one_validated_run_one_unpublished_version_two_draft_groups_two_noncurrent_sessions_zero_issues
  after: same_run_promoted_same_version_published_two_published_groups_two_current_sessions_one_event_one_linked_system_audit
  actual_postcondition: verified_by_readonly_D1_after_command_not_exit_code
  active_import_promotion_locks: 0_readonly_verified
  other_domain_counts: unchanged_users_3_sessions_11_requests_2_authorizations_1_documents_1_offers_0_artifacts_0_emails_6_telegram_0_storage_intents_2
  active_sessions_offers_actionable_mail: 0_0_0
  write_error_or_ambiguity: none
  protected_evidence: tmp/contract-phase-08-owner/C01b-checkpoint-safe.json
  evidence_sha256: 3949af103e94ff2f19ecc14e6be3bc8489852a609d1834127e2b589b87b0cf9e
  rollback: no_prior_schedule_version_no_delete_repair_restore_authorized
  containment: keep_Access_Cron_pause_bounded_synthetic_state_stop_no_automatic_retry
contract_template_install_preparation:
  utc: 2026-09-06T22:45:50Z
  result: success_local_and_readonly_only
  remote_mutations: 0
  protected_plan: tmp/contract-phase-08-owner/template-install-plan.json
  protected_safe_evidence: tmp/contract-phase-08-owner/template-install-plan-safe.json
  plan_sha256: 3851ad7dca9071b00dc58414ff1297517ddbdab77a2868e28fc972ab862e9c4f
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1_archive_3996cebdabb0_version_7c1bae246b7f
  exact_source: login_and_contract_install_match_deployed_0db3884_known_role_transition_guard_matches_reviewed_438a513_and_is_outside_this_flow
  latest_readonly_access: HEAD_302_Access
  latest_readonly_R2: distinct_private_EU_archive_and_quarantine
  latest_readonly_D1_rows_read: 68
  latest_readonly_D1_writes: 0
  observed_template_rows_intents_assertions_audits: 0_0_0_0
  expected: four_v1_preview_review_bundle_JSON_objects_500443_bytes_total_four_linked_intents_four_passing_assertions_one_admin_audit_one_provider_one_media_row
  sessions: proposed_one_normal_A_login_and_one_logout_old_11_sessions_preserved_revoked
  browser_PDF_email_calls: 0_0_0
  permission: granted_C02a_C03_C02z_once_each
  containment: stop_after_one_install_attempt_preserve_zero_to_four_private_JSON_objects_intents_Cron_pause_readonly_reconcile_all_four_families_no_delete_repair_restore_or_retry
contract_template_install_continuation:
  utc: 2026-09-07T10:11:05Z
  result: success_readonly
  inspected_head: 5270b78a2f64365989811e5c9e46b6cd88b61a96
  source_candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1_archive_3996cebdabb0_version_7c1bae246b7f
  plan_sha256: 3851ad7dca9071b00dc58414ff1297517ddbdab77a2868e28fc972ab862e9c4f
  plan_and_four_prepared_bundles: exact_hashes_and_500443_bytes_preserved_no_regeneration
  settings_source_Access_private_R2: exact_no_drift
  sessions: eleven_revoked_zero_active
  template_scope_and_actionable_email: empty_exact_prior_baseline
  local_Access_credential: readable_existing_DPAPI_health_HEAD_503_expected_Cron_paused
  D1_SELECTs_rows_read_writes: 7_68_0
  D1_changes_changed_db: 0_false
  remote_mutations_Browser_calls_provider_sends: 0_0_0
  permission: owner_now_explicitly_granted_C02a_C03_C02z
  protected_evidence: tmp/contract-phase-08-owner/continue-08a-20260907101049474-safe.json
  containment: preserve_Access_Cron_pause_published_synthetic_schedule_no_remote_write
contract_template_install_owner_scope:
  utc: 2026-09-07T10:44:50Z
  permission: granted_C02a_C03_C02z_once_each
  protected_evidence: tmp/contract-phase-08-owner/template-install-owner-approval.json
  plan_sha256: 3851ad7dca9071b00dc58414ff1297517ddbdab77a2868e28fc972ab862e9c4f
  exact_target: preview_worker_242c1796e930_D1_ccdeb22bb2a1_archive_3996cebdabb0_admin_e2b29269d4e8
  sequence: C02a_success_checkpoint_commit_then_C03_actual_checkpoint_commit_then_C02z
  conditional_logout: included_after_failed_or_ambiguous_C03_checkpoint
  Browser_PDF_email_permissions: none
  latest_preflight_utc: 2026-09-07T10:43:26Z
  latest_preflight: exact_version_settings_Access_private_R2_local_credential_and_D1_baseline_7_SELECTs_68_rows_zero_writes
  protected_preflight: tmp/contract-phase-08-owner/continue-08a-20260907104311897-safe.json
contract_template_login_form_failure:
  utc: 2026-09-07T10:51:42Z
  result: failed
  severity: P1
  finding: P1-CONTRACT-PREVIEW-PAUSED-CONFIG-001
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1_version_7c1bae246b7f
  observed: Access_passed_GET_login_500_before_password_form
  root_cause: loadRuntimeConfig_rejects_approved_preview_Cron_pause_with_SCHEDULED_JOBS_ENABLED_required
  local_exact_config_reproduction: same_single_RuntimeConfigError_issue
  login_POST_attempts: 0
  sessions: eleven_revoked_zero_active
  business_provider_scope: exact_prepared_baseline_preserved
  monitoring_side_effect: one_minute_bucket_two_errors_observed_before_counter_not_captured
  automatic_error_recording: recordWorkerError_on_500_in_src_worker_ts
  permission: C02a_login_POST_C03_install_C02z_logout_remain_granted_and_unconsumed
  new_deploy_permission: granted_one_exact_reviewed_C00fix_after_tests_GO
  protected_evidence: tmp/contract-phase-08-owner/C02a-form-failed-checkpoint-safe.json
  containment: preserve_Access_Cron_pause_private_R2_no_reload_login_install_send_or_blind_retry
contract_paused_config_remediation:
  utc: 2026-09-07T11:12:02Z
  candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
  result: local_fix_full_release_gate_and_independent_GO_complete
  runtime_diff: constrained_supervised_preview_config_exception_production_and_provider_guards_retained
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1_prior_version_7c1bae246b7f
  code_sha256: 9ee23a7509999d31516f5dc063c79f7ccfbc449ac735952cc6b4318cfc81d309
  code_bytes: 3428899
  config_sha256: b2805d2b39115220482ade660cf4de7a93d6db8f42c3383b51d824eda18fe9c6
  plan_sha256: 444f24ea0c8f23a967b90ee1bf88594fd2673fe1cd0cd54bdb089355b6d4d49d
  scope: one_code_deploy_no_config_bindings_secrets_schema_change
  protected_evidence: tmp/contract-phase-08-owner/paused-config-deploy-owner-approval.json_and_paused-config-review-safe.json_and_paused-config-release-safe.json
  containment: preserve_Access_Cron_pause_batch1_private_R2_no_automatic_repeat_or_rollback
contract_paused_config_deployment:
  utc: 2026-09-07T11:14:38.228Z
  result: success
  action: C00fix-one-reviewed-runtime-deploy
  candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1_archive_3996cebdabb0_quarantine_442dca1871ce
  before_version: 7c1bae246b7f
  after_version: a255463d5707
  traffic_percent: 100
  code_sha256: 9ee23a7509999d31516f5dc063c79f7ccfbc449ac735952cc6b4318cfc81d309
  actual_postcondition: all_checks_true_exact_settings_bindings_private_R2_and_annotation_login_200_health_503_Access_302_domain_sessions_providers_cadences_monitoring_preserved
  D1_rows_read_query_writes: 198_0
  new_sessions_templates_provider_sends: 0_0_0
  remote_mutation_attempts: 1
  permission: one_deploy_consumed_no_repeat_or_automatic_rollback
  protected_evidence: tmp/contract-phase-08-owner/paused-fix-checkpoint-safe.json_and_before_after_evidence
  containment: Access_Cron_pause_batch1_private_R2_preserved
contract_C02a_actual_checkpoint:
  utc: 2026-09-07T12:23:39.763Z
  result: success
  candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
  version: a255463d5707
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1_archive_3996cebdabb0_admin_e2b29269d4e8
  actual: owner_normal_login_created_one_A_version2_session_old_eleven_revoked_and_business_provider_state_preserved
  sessions_total_active: 12_1
  actor: owner_submitted_normal_form_report_and_admin_DOM_plus_D1_verified_no_agent_login_POST
  D1_postcondition_rows_query_writes: 150_0
  Browser_PDF_provider_sends: 0_0_0
  permission_consumed: C02a_once
  protected_evidence: tmp/contract-phase-08-owner/C02a-checkpoint-safe.json_and_before_after_records
  containment: preserve_Access_private_R2_Cron_pause_no_repeat_delete_repair_restore
contract_C03_actual_checkpoint:
  utc: 2026-09-07T12:26:32.116Z
  result: success
  candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
  version: a255463d5707
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1_archive_3996cebdabb0_admin_e2b29269d4e8
  actual: four_exact_template_rows_four_linked_generation1_intents_four_assertions_one_A_audit_one_provider_one_media_four_private_JSON_500443_bytes
  sessions_total_active: 12_1
  actor: agent_one_normal_CSRF_form_operation
  D1_postcondition_rows_query_writes: 231_0
  Browser_PDF_provider_sends: 0_0_0
  permission_consumed: C03_once
  protected_evidence: tmp/contract-phase-08-owner/C03-checkpoint-safe.json_and_before_after_records
  containment: preserve_Access_private_R2_Cron_pause_no_repeat_delete_repair_restore
contract_C02z_actual_checkpoint:
  utc: 2026-09-07T12:27:51.455Z
  result: success
  candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
  version: a255463d5707
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1_archive_3996cebdabb0_admin_e2b29269d4e8
  actual: only_new_A_session_revoked_with_one_matching_logout_audit_zero_active_sessions_all_templates_R2_business_providers_preserved
  sessions_total_active: 12_0
  actor: agent_one_normal_CSRF_form_operation
  D1_postcondition_rows_query_writes: 235_0
  Browser_PDF_provider_sends: 0_0_0
  permission_consumed: C02z_once
  protected_evidence: tmp/contract-phase-08-owner/C02z-checkpoint-safe.json_and_before_after_records
  containment: preserve_Access_private_R2_Cron_pause_no_repeat_delete_repair_restore
contract_C04_prerequisite_preparation:
  utc: 2026-09-07T12:31:56.093Z
  result: ready_readonly_plan
  permission: granted_exact_prepared_plan_once_each
  candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
  version: a255463d5707
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1
  requests: Q2_b219e7909276_QD_55dd7612cb70_both_draft_v1_owned_by_P2
  authorization: FD_0424d98cd5ed_pending_review_v1_no_dates_no_superseded_version
  preserved_document: D0_a198b7bdf114_approved_current_private_16954_bytes_exact_prior_sha
  proposed_test_interval: jobcenter_2026_09_07_through_2026_09_30_inclusive
  recipient: sole_existing_P2_699b2f82b987_digest_prefix_7c1f9b0ac168_allowlist_match_no_pending_email
  commands_business_transitions_provider_requests_sessions: 13_5_4_two_logins_two_logouts
  session_transport: two_isolated_visible_browser_contexts_owner_enters_existing_credentials_no_cookie_export
  provider_queue_rule: exactly_one_current_authorized_actionable_row_before_each_manual_email_outbox_batch1_then_terminal_receipt_and_zero_actionable_before_next_queueing
  Browser_PDF_R2_writes_config_changes: 0_0_0_0
  local_payload_schema_checks: five_canonical_request_and_admin_payloads_valid_four_unique_email_row_ids_match_trigger_source
  D1_readonly_rows_query_writes: 915_0
  protected_plan: tmp/contract-phase-08-owner/C04-prerequisite-plan.json
  plan_sha256: b15108c6041f58554bbc09732c10fc9f20b3b0add325196776c96df85066e1b2
  protected_safe_evidence: tmp/contract-phase-08-owner/C04-prerequisite-plan-safe.json_and_C04-prerequisite-validation-safe.json
  containment: preserve_Cron_pause_Access_private_R2_pending_rows_no_repeat_resend_cancel_repair_rollback_conditional_logout_after_checkpoint
contract_C04_owner_scope:
  utc: 2026-09-07T12:38:56Z
  permission: granted_once_each_all_thirteen_prepared_commands
  plan_sha256: b15108c6041f58554bbc09732c10fc9f20b3b0add325196776c96df85066e1b2
  interval: jobcenter_2026_09_07_through_2026_09_30_inclusive_synthetic_only
  provider_scope: four_exact_notification_rows_only_to_existing_P2
  sessions: one_A_and_one_P2_login_in_separate_contexts_one_logout_each_also_conditional_after_failed_checkpoint
  protected_evidence: tmp/contract-phase-08-owner/C04-owner-approval.json
  forbidden: repeat_resend_cancel_repair_rollback_Browser_PDF_R2_write_or_config_change
contract_C04_progress:
  latest_utc: 2026-09-07T12:59:55.688Z
  latest_action: E04b
  latest_result: success
  candidate: 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0
  version: a255463d5707
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1_parent_699b2f82b987_admin_e2b29269d4e8
  successful_commands: C04-A-login_C04-P2-login_C04a_E04a_C04b_E04b
  successful_count_of_thirteen: 6
  provider_accepted_count_of_four: 2
  mailbox_arrival_confirmation: pending_owner_confirmation_separate_from_provider_receipts
  active_sessions: 2
  total_sessions: 14
  protected_evidence: tmp/contract-phase-08-owner/E04b-checkpoint-safe.json_and_before_after
  latest_D1_postcondition_rows_query_writes: 319_0
  containment: Access_Cron_pause_batch1_retained_no_repeat_resend_cancel_repair_or_rollback_conditional_normal_logout_after_failed_checkpoint
next_atomic_action:
  id: C04c
  permission: prior_owner_C04_grant_only_unconsumed_exact_action
  target: preview_worker_242c1796e930_D1_ccdeb22bb2a1_exact_C04_actor_and_object
  mutation: one_planned_normal_command_only_after_exact_preflight
  preconditions:
    - this_actual_checkpoint_saved_as_separate_docs_only_commit
    - exact_prior_postcondition_target_actor_and_recipient_or_session_scope
    - for_send_exactly_one_authorized_actionable_email_for_queueing_prior_actionable_rows_zero
  postcondition:
    - planned_single_delta_and_unrelated_domain_provider_session_state_preserved
  success_transition: separate_actual_checkpoint_and_docs_only_commit_before_next_mutation
  failed_or_ambiguous_transition: stop_no_repeat_record_actual_state_then_only_granted_conditional_normal_logout
  forbidden_in_this_action:
    - Browser_PDF_R2_write_deploy_config_change_or_unlisted_provider_operation
following_route_permission_boundaries:
  - config_permission_does_not_authorize_document_scenario_or_new_sessions
  - entire_D01a_D18b_scope_is_now_granted_no_repeat_permission_needed
  - actual_AV_and_business_decision_cannot_be_replaced_with_format_validation
  - full_REQ11_rejected_and_nonapproved_14day_cleanup_remain_separate_required_gates
  - full_manual_preview_and_production_remain_blocked
```

## Prompt 08A C02a actual checkpoint — 2026-09-07T12:23:39Z

The owner filled the ordinary form and clicked login before agent submission.
No second login was attempted. Existing post-deploy baseline at 2026-09-07T11:14:37.657Z
and actual D1 show exactly one new A session, version 2, with all eleven old
sessions still revoked and otherwise exact role/business/provider state.
DOM-only inspection observed the protected admin dashboard and contracts link;
no request or password read. Raw POST response was not captured and its status
is not invented. The owner report, protected UI and actual D1 establish success.

Target Worker 242c1796e930, D1 ccdeb22bb2a1; candidate 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0,
version a255463d5707. Result: success. Postcondition SELECTs read 150
rows and wrote zero. Protected evidence:
tmp/contract-phase-08-owner/C02a-checkpoint-safe.json and indexed before/after.
One next action: C03-one-native-four-template-install. Preserve Access, private R2 and paused Cron;
no repeat, repair, delete or automatic rollback.

This docs-only checkpoint uses docs:check, release:scan and git diff --check.
Runtime/check/build/full Vitest/E2E are reused from exact reviewed 4a8c028;
no executable application change requires a rerun. Full-manual-preview and
production remain blocked. rollover_required: no;
recommended_next_session_mode: High; the next approved operation has known target, postcondition and containment.

## Prompt 08A C03 actual checkpoint — 2026-09-07T12:26:32Z

One normal CSRF-protected installPreviewReview operation reconciled as success.
Actual checks: controlExact=true, usersBusinessProvidersPreserved=true, unrelatedIntentsLeasesMonitoringPreserved=true, sessionScope=true, templateRows=true, intentsLinked=true, assertions=true, adminAudit=true, approvals=true, providerMediaRows=true, countDelta=true, exactPrivateObjects=true, nativeResponse=true.
Observed 4 templates, 4 linked template intents,
4 assertions, 1 install audit and 500443 private JSON bytes.
Exact R2 SHA/bytes are compared with D1 and the immutable prepared bundles.
No Browser render, PDF or provider send was performed.

Target Worker 242c1796e930, D1 ccdeb22bb2a1; candidate 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0,
version a255463d5707. Result: success. Postcondition SELECTs read 231
rows and wrote zero. Protected evidence:
tmp/contract-phase-08-owner/C03-checkpoint-safe.json and indexed before/after.
One next action: C02z-one-normal-admin-logout. Preserve Access, private R2 and paused Cron;
no repeat, repair, delete or automatic rollback.

This docs-only checkpoint uses docs:check, release:scan and git diff --check.
Runtime/check/build/full Vitest/E2E are reused from exact reviewed 4a8c028;
no executable application change requires a rerun. Full-manual-preview and
production remain blocked. rollover_required: no;
recommended_next_session_mode: High; the next approved operation has known target, postcondition and containment.

## C04 C04-A-login actual checkpoint — 2026-09-07T12:46:37Z

One A normal operation reconciled as success. Candidate
4a8c02816ef12947d6bd748dc690dcb2f46cdbd0, version a255463d5707; Worker 242c1796e930, D1 ccdeb22bb2a1.
Expected user result: one A version2 session; preserve all prior revoked sessions.
Actual checks: controlPreserved=true, oneExpectedSession=true, oldSessionsPreserved=true, sessionCounts=true, businessProvidersPreserved=true, normalOwnerUi=true.
The owner submitted the normal login; raw POST status was not captured. Protected role UI plus exact new-session D1 evidence confirms it; no second login or password read.

Sessions total 13, active 1; cumulative C04 successful
commands 1/13, provider-accepted notifications 0/4.
Read-only postcondition read 174 D1 rows, zero query writes. Evidence:
tmp/contract-phase-08-owner/C04-A-login-checkpoint-safe.json and indexed records.
One next action: C04-P2-login. Access and Cron pause/batch1 preserved;
no repeat/resend/cancel/repair/rollback. Conditional logout remains limited to
this package's new sessions after a failed/ambiguous checkpoint.

Docs-only validation: docs:check, release:scan, git diff --check. Unchanged
runtime check/build/full Vitest/E2E reuse exact reviewed 4a8c028 evidence.
Full-manual-preview and production remain blocked. rollover_required: no;
recommended_next_session_mode: High; the next granted action has known target, postcondition and containment.

## C04 C04-P2-login actual checkpoint — 2026-09-07T12:55:11Z

One P2 normal operation reconciled as success. Candidate
4a8c02816ef12947d6bd748dc690dcb2f46cdbd0, version a255463d5707; Worker 242c1796e930, D1 ccdeb22bb2a1.
Expected user result: one P2 version1 session; exact separate A and P2 user/session roles; no cookie export.
Actual checks: controlPreserved=true, oneExpectedSession=true, oldSessionsPreserved=true, sessionCounts=true, businessProvidersPreserved=true, normalOwnerUi=true.
The owner submitted the normal login; raw POST status was not captured. Protected role UI plus exact new-session D1 evidence confirms it; no second login or password read.

Sessions total 14, active 2; cumulative C04 successful
commands 2/13, provider-accepted notifications 0/4.
Read-only postcondition read 175 D1 rows, zero query writes. Evidence:
tmp/contract-phase-08-owner/C04-P2-login-checkpoint-safe.json and indexed records.
One next action: C04a. Access and Cron pause/batch1 preserved;
no repeat/resend/cancel/repair/rollback. Conditional logout remains limited to
this package's new sessions after a failed/ambiguous checkpoint.

Docs-only validation: docs:check, release:scan, git diff --check. Unchanged
runtime check/build/full Vitest/E2E reuse exact reviewed 4a8c028 evidence.
Full-manual-preview and production remain blocked. rollover_required: no;
recommended_next_session_mode: High; the next granted action has known target, postcondition and containment.

## C04 C04a actual checkpoint — 2026-09-07T12:56:14Z

One P2 normal operation reconciled as success. Candidate
4a8c02816ef12947d6bd748dc690dcb2f46cdbd0, version a255463d5707; Worker 242c1796e930, D1 ccdeb22bb2a1.
Expected user result: Q2 pending_admin_review v2; one owner action/assertion/audit; exactly one pending request.received email.
Actual checks: controlPreserved=true, unrelatedDataPreserved=true, sessionScope=true, auditCount=true, oldPhaseAuditsPreserved=true, nativeResponse=true, oneActorAudit=true, counters=true, requestTransition=true, parentActionChain=true, exactEmailQueued=true, baseEmailDelta=true.
Native form/response and actual D1 evidence are stored privately; no repeated operation.

Sessions total 14, active 2; cumulative C04 successful
commands 3/13, provider-accepted notifications 0/4.
Read-only postcondition read 298 D1 rows, zero query writes. Evidence:
tmp/contract-phase-08-owner/C04a-checkpoint-safe.json and indexed records.
One next action: E04a. Access and Cron pause/batch1 preserved;
no repeat/resend/cancel/repair/rollback. Conditional logout remains limited to
this package's new sessions after a failed/ambiguous checkpoint.

Docs-only validation: docs:check, release:scan, git diff --check. Unchanged
runtime check/build/full Vitest/E2E reuse exact reviewed 4a8c028 evidence.
Full-manual-preview and production remain blocked. rollover_required: no;
recommended_next_session_mode: High; the next granted action has known target, postcondition and containment.

## C04 E04a actual checkpoint — 2026-09-07T12:58:22Z

One A normal operation reconciled as success. Candidate
4a8c02816ef12947d6bd748dc690dcb2f46cdbd0, version a255463d5707; Worker 242c1796e930, D1 ccdeb22bb2a1.
Expected user result: only exact Q2 row sent with terminal provider receipt; pending/unknown/dead zero.
Actual checks: controlPreserved=true, unrelatedDataPreserved=true, sessionScope=true, auditCount=true, oldPhaseAuditsPreserved=true, nativeResponse=true, oneActorAudit=true, counters=true, emailSent=true, manualJob=true, baseEmailDelta=true.
Exactly one authorized notification has a terminal sent row and provider receipt. Mailbox arrival is still a separate owner confirmation.

Sessions total 14, active 2; cumulative C04 successful
commands 4/13, provider-accepted notifications 1/4.
Read-only postcondition read 302 D1 rows, zero query writes. Evidence:
tmp/contract-phase-08-owner/E04a-checkpoint-safe.json and indexed records.
One next action: C04b. Access and Cron pause/batch1 preserved;
no repeat/resend/cancel/repair/rollback. Conditional logout remains limited to
this package's new sessions after a failed/ambiguous checkpoint.

Docs-only validation: docs:check, release:scan, git diff --check. Unchanged
runtime check/build/full Vitest/E2E reuse exact reviewed 4a8c028 evidence.
Full-manual-preview and production remain blocked. rollover_required: no;
recommended_next_session_mode: High; the next granted action has known target, postcondition and containment.

## C04 C04b actual checkpoint — 2026-09-07T12:59:09Z

One P2 normal operation reconciled as success. Candidate
4a8c02816ef12947d6bd748dc690dcb2f46cdbd0, version a255463d5707; Worker 242c1796e930, D1 ccdeb22bb2a1.
Expected user result: QD pending_admin_review v2 while FD pending and D0 current approved; one action/assertion/audit; one pending request.received.
Actual checks: controlPreserved=true, unrelatedDataPreserved=true, sessionScope=true, auditCount=true, oldPhaseAuditsPreserved=true, nativeResponse=true, oneActorAudit=true, counters=true, requestTransition=true, parentActionChain=true, exactEmailQueued=true, baseEmailDelta=true.
Native form/response and actual D1 evidence are stored privately; no repeated operation.

Sessions total 14, active 2; cumulative C04 successful
commands 5/13, provider-accepted notifications 1/4.
Read-only postcondition read 313 D1 rows, zero query writes. Evidence:
tmp/contract-phase-08-owner/C04b-checkpoint-safe.json and indexed records.
One next action: E04b. Access and Cron pause/batch1 preserved;
no repeat/resend/cancel/repair/rollback. Conditional logout remains limited to
this package's new sessions after a failed/ambiguous checkpoint.

Docs-only validation: docs:check, release:scan, git diff --check. Unchanged
runtime check/build/full Vitest/E2E reuse exact reviewed 4a8c028 evidence.
Full-manual-preview and production remain blocked. rollover_required: no;
recommended_next_session_mode: High; the next granted action has known target, postcondition and containment.

## C04 E04b actual checkpoint — 2026-09-07T12:59:55Z

One A normal operation reconciled as success. Candidate
4a8c02816ef12947d6bd748dc690dcb2f46cdbd0, version a255463d5707; Worker 242c1796e930, D1 ccdeb22bb2a1.
Expected user result: only exact QD row sent with terminal provider receipt; pending/unknown/dead zero.
Actual checks: controlPreserved=true, unrelatedDataPreserved=true, sessionScope=true, auditCount=true, oldPhaseAuditsPreserved=true, nativeResponse=true, oneActorAudit=true, counters=true, emailSent=true, manualJob=true, baseEmailDelta=true.
Exactly one authorized notification has a terminal sent row and provider receipt. Mailbox arrival is still a separate owner confirmation.

Sessions total 14, active 2; cumulative C04 successful
commands 6/13, provider-accepted notifications 2/4.
Read-only postcondition read 319 D1 rows, zero query writes. Evidence:
tmp/contract-phase-08-owner/E04b-checkpoint-safe.json and indexed records.
One next action: C04c. Access and Cron pause/batch1 preserved;
no repeat/resend/cancel/repair/rollback. Conditional logout remains limited to
this package's new sessions after a failed/ambiguous checkpoint.

Docs-only validation: docs:check, release:scan, git diff --check. Unchanged
runtime check/build/full Vitest/E2E reuse exact reviewed 4a8c028 evidence.
Full-manual-preview and production remain blocked. rollover_required: no;
recommended_next_session_mode: High; the next granted action has known target, postcondition and containment.

## C04 exact owner authorization — 2026-09-07T12:38:56Z

The owner explicitly replied Разрешаю to the prepared finite C04 package:
five request/funding transitions, four exact ordinary notifications only to P2,
and one normal login/logout pair each for A and P2 in separate browser contexts.
Synthetic FD dates 2026-09-07 through 2026-09-30 are included. Conditional
normal logout of newly opened sessions after a failed/ambiguous checkpoint is
included; no repeat/resend/cancel/repair/rollback or expanded provider scope.

Immutable plan SHA-256 b15108c6041f58554bbc09732c10fc9f20b3b0add325196776c96df85066e1b2; protected approval at
tmp/contract-phase-08-owner/C04-owner-approval.json. No remote mutation occurred
while recording this approval. One next action is C04-A-login after fresh
read-only preflight and owner private input. Each following operation retains
its own actual checkpoint and docs-only commit. No repeated permission question
is needed for this granted sequence. rollover_required: no;
recommended_next_session_mode: High; target, procedure and containment are known.

## Prompt 08A next C04 package ready for owner scope — 2026-09-07T12:31:56Z

C02a/C03/C02z are complete, each separately checkpointed. The following new
scope is only prepared, not authorized. Read-only evidence confirms Q2/QD
draft v1, FD pending without dates, exact approved/current D0, four installed
templates, no offers/renders/artifacts, six historical sent emails, zero active
sessions/actionable email/Telegram/active operation locks. Recipient P2 matches
the unchanged allowlist, with no pending email change. No PII was logged.

| Step | Proposed normal command | Required actual result |
| --- | --- | --- |
| A login, P2 login | One existing-credential login each, in separate browser contexts | Two distinct role-correct sessions; twelve prior sessions preserved |
| C04a, E04a | P2 submit Q2; after checkpoint A manually sends its one request.received | Q2 pending_admin_review v2, one certain delivery to P2 |
| C04b, E04b | P2 submit QD while FD pending; after checkpoint A sends its one request.received | QD pending_admin_review v2, D0 preserved, one certain delivery to P2 |
| C04c, E04c | A approves Q2; after checkpoint sends its one request.decision | Q2 approved v3, one certain decision delivery to P2 |
| C04d | A approves only synthetic FD as Jobcenter, inclusive 2026-09-07 to 2026-09-30 | FD approved v1 with exact dates, one A audit, no notification, D0 unchanged |
| C04e, E04e | A approves QD; after checkpoint sends its one request.decision | QD approved v3, one certain decision delivery to P2 |
| P2 logout, A logout | One normal logout each, also conditional after a failure checkpoint | Only those two new sessions revoked; zero active sessions |

This is exactly 13 logical commands: five business transitions, four separate
provider requests and two normal login/logout pairs. No offer, Browser/PDF,
R2 write or settings change. Native CSRF/idempotency forms remain in use;
each single command gets an actual postcondition and separate docs-only commit
before the next mutation. Normal authenticated GET/session touches belong to
their command. Dates are proposed synthetic inputs and fit the current academic
period; they do not represent a real funding decision.

Two notifications have subject Unterrichtsanfrage eingegangen and confirm the
saved request with its protected portal link; two have subject Entscheidung zur
Unterrichtsanfrage and report status approved with the corresponding link.
They are ordinary German notifications with no attachment; no TEST watermark
is claimed for these auxiliary templates. All four go only to the existing P2
recipient. Owner mailbox confirmation remains distinct from a provider receipt.

Before each normal manual email_outbox run, the actionable queue must contain
exactly its enumerated authorized row; Cron stays paused and batch stays one.
Require terminal sent/receipt and zero actionable rows before the next queueing
command. Any failed/ambiguous action or delivery stops progression: retain
current state and pending row, no repeat/resend/cancel/repair/rollback. Only
conditional normal logout of the newly opened sessions follows its checkpoint.

Protected immutable plan: tmp/contract-phase-08-owner/C04-prerequisite-plan.json,
SHA-256 b15108c6041f58554bbc09732c10fc9f20b3b0add325196776c96df85066e1b2. Read-only D1 rows 915, query writes zero;
five canonical payload schemas and four unique projected notification IDs passed
local validation. Browser supports isolated contexts; none was created/logged in
during this preparation. Docs/checkpoint checks only; unchanged runtime's full
release gate is reused. One next action: request this complete owner scope.
rollover_required: no; recommended_next_session_mode: Medium while awaiting
scope without remote work; after approval the planned deploy-session mode is High.

## Prompt 08A C02z actual checkpoint — 2026-09-07T12:27:51Z

One normal logout reconciled as success: 0 active sessions.
Only this phase's A session was revoked with the matching logout audit; existing
template/D1/R2/provider state was checked against the C03 checkpoint. No repeat
installer, Browser render, PDF or provider send. The granted three-action scope
is consumed; further contract prerequisites/render/delivery scope is not granted.

Target Worker 242c1796e930, D1 ccdeb22bb2a1; candidate 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0,
version a255463d5707. Result: success. Postcondition SELECTs read 235
rows and wrote zero. Protected evidence:
tmp/contract-phase-08-owner/C02z-checkpoint-safe.json and indexed before/after.
One next action: prepare-next-contract-flow-scope-readonly. Preserve Access, private R2 and paused Cron;
no repeat, repair, delete or automatic rollback.

This docs-only checkpoint uses docs:check, release:scan and git diff --check.
Runtime/check/build/full Vitest/E2E are reused from exact reviewed 4a8c028;
no executable application change requires a rerun. Full-manual-preview and
production remain blocked. rollover_required: no;
recommended_next_session_mode: Medium; the remaining preparation is read-only.

## Prompt 08A code-only deploy actual checkpoint — 2026-09-07T11:14:38Z

One approved C00fix deploy attempt reconciled as success. Candidate
4a8c02816ef12947d6bd748dc690dcb2f46cdbd0; preview Worker fingerprint 242c1796e930, D1 ccdeb22bb2a1;
version 7c1bae246b7f → a255463d5707, one version at 100 percent.
Actual remote module matches the reviewed 3428899-byte bundle. All prepared settings, bindings, secrets, Cron schedules, private EU buckets and Access were preserved. Cookie-free service-authenticated login GET returned 200 with both credential inputs; health remains expected 503/no-store/noindex. The login P1 is resolved.

Bounded postcondition read 198 D1 rows with zero query writes/changes.
Business, sessions, provider history, cadence/lease and monitoring baselines
are exact. No new session, template or provider send occurred.
Protected evidence: tmp/contract-phase-08-owner/paused-fix-checkpoint-safe.json.
One next action: C02a-owner-entered-normal-admin-login-once. No automatic retry or rollback.
The already approved C02a/C03/C02z scope is retained; Browser/PDF/email scope
remains ungranted. Full-manual-preview and production stay blocked.

Checkpoint checks: docs:check, release:scan, git diff --check; full runtime/E2E
not repeated because this commit only records actual state and reuses the exact
reviewed candidate's successful release gate. rollover_required: no;
recommended_next_session_mode: High; the next normal login has a known target, postcondition and containment.

## Prompt 08A paused-config candidate / review and deploy authorization — 2026-09-07T11:12:02Z

Candidate 4a8c02816ef12947d6bd748dc690dcb2f46cdbd0 fixes the reproduced login P1 with one constrained runtime
config exception. Full release checks passed: check 0/0, build, 79 Vitest files
(586 passed, one expected Windows skip), and all 23 Chromium E2E. The initial
regression assertion named the wrong existing allowlist error and was corrected;
the initial E2E run failed at browser launch, then matching Chromium was installed
locally and the full run passed. Compiled Worker smoke with exact plain-text
preview config returns login 200, anonymous admin 401 and paused health 503;
outbound calls zero. This local smoke does not claim real Browser/provider flow.

Independent read-only reviewer review_preview_pause returned GO, new P0/P1 zero.
The owner explicitly approved one exact code-only preview deploy after these
gates, actual postcondition and checkpoint before the already approved
C02a/C03/C02z. Config, bindings, secrets, schema, Cron pause and batch1 remain
unchanged. Strict dry-run module is 3428899 bytes, SHA-256
9ee23a7509999d31516f5dc063c79f7ccfbc449ac735952cc6b4318cfc81d309.
Protected plan, approval, review and release evidence are indexed above.

One next action is C00fix exact deploy after read-only immediate preflight.
No remote mutation occurred during local remediation/review. If the deploy fails
or is ambiguous, preserve Access and Cron pause, reconcile and checkpoint;
no repeat or automatic rollback. Prior version is containment only and would
restore the known login defect. Full-manual-preview and production remain blocked.
rollover_required: no; recommended_next_session_mode: High because target,
procedure, postcondition and containment are known.

## Prompt 08A login-form P1 / actual failed checkpoint — 2026-09-07T10:51:42Z

Cloudflare Access accepted the owner's OTP. The subsequent ordinary GET of
/auth/login returned the application 500 page before password input; no login
POST was submitted. Local reproduction using exact deployed plain-text config
and synthetic secret/binding substitutes produces only RuntimeConfigError issue
SCHEDULED_JOBS_ENABLED:required. The shared validator requires enabled scheduling
for preview, contradicting the already authorized five-value contract/Cron pause.
This is P1-CONTRACT-PREVIEW-PAUSED-CONFIG-001 for full-manual-preview.

Actual bounded D1 reconciliation preserves the complete prepared business,
provider, role and eleven-revoked-session scope (149 reads, zero query writes).
The Worker separately records 500 responses: one 10:46Z monitoring minute bucket
with two errors was observed (one additional SELECT/read, zero query writes).
No counter baseline was captured, so no exact error-counter delta is claimed.
The error path is therefore not described as globally write-free. There are no
new sessions, templates, offers, Browser calls or provider deliveries. Evidence:
tmp/contract-phase-08-owner/C02a-form-failed-checkpoint-safe.json and indexed
reproduction/domain/monitoring observations.

Preserve Access, private R2 and paused Cron; do not reload, retry login, install
or resume any provider path. C02a login POST/C03/C02z permissions remain unconsumed.
One next action: local bounded config remediation and regression, then prepare
the exact candidate and separate deploy scope. No new deploy is authorized.
Docs-only checkpoint checks are docs:check, release:scan and diff check.
rollover_required: no; recommended_next_session_mode: High for a localized
confirmed P1 with known containment; no wrong-target, data-loss or auth-bypass
evidence warrants Max.


## Prompt 08A bounded owner authorization — 2026-09-07T10:44:50Z

The owner explicitly approved the already presented C02a normal A login, C03
one native four-template installation and C02z normal logout. Scope includes
logout after a failed/ambiguous C03 checkpoint; it does not include retries,
repair, deletion, deploy, Browser/PDF or provider sends. Existing plan remains
immutable. Actual postcondition and separate docs-only commit are mandatory
between all three operations. Password remains owner-entered in the browser.

Fresh preflight at 10:43:26Z confirmed exact version/settings/Access/private R2,
locally readable existing credential, expected paused-Cron health and exact D1
baseline (7 SELECTs, 68 rows, zero writes). No remote mutation has occurred.
Permission and preflight evidence are indexed in the machine-readable state.
One next action: one normal C02a login after private owner input. Preserve
Access and Cron pause. rollover_required: no; recommended_next_session_mode:
High because the finite authorized route and containment are known.


## Prompt 08A continuation read-only checkpoint — 2026-09-07T10:11:05Z

Resumed at clean HEAD 5270b78a2f64365989811e5c9e46b6cd88b61a96. The existing
template-install plan SHA-256 and all four prepared v1 bundle hashes/sizes
matched (500443 bytes total); no plan or bundle was regenerated. Fresh live
control confirmed one version 7c1bae246b7f at 100%, exact settings, Access HEAD
302 and both distinct private EU buckets. Login/install source still matches
deployed 0db3884 with the already reviewed 438a513 role-guard exception.

Seven bounded SELECTs read 68 rows with zero writes/changes and changed_db=false.
Their exact scoped result equals the previous plan baseline: eleven revoked
sessions, two published groups/current sessions, empty template/install scope,
zero offers/artifacts/renders/contracts and no actionable email. The existing
local DPAPI credential is readable; authorized operations-health HEAD returned
the expected 503/no-store/noindex while Cron remains paused. No application
session, mutation, Browser render, R2 write or provider send was attempted.

Protected evidence: tmp/contract-phase-08-owner/continue-08a-20260907101049474-safe.json,
with matching observation and health files. The new ignored read-only helper
passed node --check; old generators and consumed C00/C01 operations were not run.
Tracked changes are documentation only: docs:check, release:scan and diff check
apply. Full check/test/build/Chromium and independent review remain inherited
from the exact candidates recorded above; no runtime/config/migration changed.

One next action remains the prepared C02a/C03/C02z permission request. Preserve
Access, paused Cron and the published synthetic schedule until scope is granted.
rollover_required: no; recommended_next_session_mode: Medium for scope/read-only,
then High for the known execution procedure after authorization.

## Prompt 08 template installation plan / C01 phase boundary — 2026-09-06T22:45:50Z

C01a and C01b are complete and consumed, with separate successful actual-state
checkpoint commits e09962a and 26482b3. Their results are not reopened. The next
local/read-only preparation is complete: C02a normal A login, one C03 native
installPreviewReview command, then C02z normal logout. Exact proposed scope is
four preview-review-v1 JSON bundles (500443 bytes total), four linked archive
intents/assertions, one provider/media pair and one admin install audit.
No Browser/PDF/provider call is included. Password stays owner-entered in the
normal browser login form. Checkpoint each logical command before the next.

Fresh read-only checks confirmed the same deployed version/settings, Access
302, both private EU buckets, two published groups/current sessions, zero
contract templates/offers/artifacts/renders, all 11 sessions revoked and no
actionable email. Seven scoped SELECTs read 68 rows and wrote zero. Protected
evidence: template-install-plan-baseline.json, template-install-plan.json and
template-install-plan-safe.json under tmp/contract-phase-08-owner.
Plan SHA-256: 3851ad7dca9071b00dc58414ff1297517ddbdab77a2868e28fc972ab862e9c4f.

The initial local source predicate stopped before network access because it
included the already reviewed admin role-transition helper. Inspection confirmed
only that known 438a513 helper differs from deployed 0db3884; login and contract
installation are unchanged. The read-only predicate now pins that exact reviewed
exception. No runtime correction, new failure/review loop or remote retry occurred.
The existing installer uses concurrent internal object creation, so failure may
leave zero to four private objects/intents. Reconcile all four exact families
after settling, preserve them, keep Cron paused and do not retry/delete/repair.
Proposed logout scope applies only after the failed/successful install checkpoint.

Tracked changes are state, manifest and phase-boundary handoff. Run docs:check,
release:scan and git diff --check; reuse unchanged runtime check/test/build/E2E
and the existing exact-source template-install regression evidence. No new
mutation driver or runtime test is needed for this existing native UI action.
One next action: request the concrete C02a/C03/C02z permission.
rollover_required: no; recommended_next_session_mode: Medium while presenting
the ready scope; High is appropriate after authorization for execution.


## Prompt 08 C01b actual promotion checkpoint — 2026-09-06T22:41:17Z

Result: **success**. One owner-authorized canonical command made exactly
3 internal write requests, with no error, write-stop latch or unresolved
response. Read-only D1 reconciliation confirmed the same run is promoted and the same version is published; both synthetic groups are published and both sessions current, with one promotion event and its linked system audit. A further SELECT confirmed zero active import-promotion locks.
Run fingerprint 1c0c772dbff6; schedule version fingerprint
54efc84fcc54, content SHA-256 85d4678dbee86376391a4dd180a8b5117c1e10f587ce9a261c036f12351fb45a.
Worker version remains 7c1bae246b7f / source 0db38842524ebc146eaa56a9d089e3c3484bf0f3;
target fingerprints: Worker 242c1796e930 and D1 ccdeb22bb2a1.
Other domain counts are unchanged, all 11 sessions remain revoked, no offers or
actionable mail exist. No Browser render, R2 object or provider send was issued.

Evidence: tmp/contract-phase-08-owner/C01b-checkpoint-safe.json indexes the
protected before, attempt, transport, actual postcondition and result evidence
by SHA-256. Full IDs and private values remain only in ignored owner-protected
evidence. C01b scope is consumed; all C00/C01 write permissions are now consumed.
There is no prior schedule version for rollback. Keep Access enforced and Cron
paused; no deletion, repair, restore or automatic retry is authorized.

Only active-state documentation changes for this checkpoint. Run docs:check,
release:scan and git diff --check. Full check/test/build/E2E and independent
review are reused from exact source 0db38842524ebc146eaa56a9d089e3c3484bf0f3;
the unchanged driver retains its nine focused local checks. One next action:
prepare-bounded-contract-lifecycle-commands-and-local-checks. rollover_required: no;
recommended_next_session_mode: Medium for local/read-only next-scope preparation.


## Prompt 08 C01a actual staging checkpoint — 2026-09-06T22:38:45Z

Result: **success**. One owner-authorized canonical command made exactly
5 internal write requests, with no error, write-stop latch or unresolved
response. Read-only D1 reconciliation confirmed one validated run, one unpublished version, two draft groups, two noncurrent sessions and zero issues. Before the command the matching schedule scope was empty.
Run fingerprint 1c0c772dbff6; schedule version fingerprint
54efc84fcc54, content SHA-256 85d4678dbee86376391a4dd180a8b5117c1e10f587ce9a261c036f12351fb45a.
Worker version remains 7c1bae246b7f / source 0db38842524ebc146eaa56a9d089e3c3484bf0f3;
target fingerprints: Worker 242c1796e930 and D1 ccdeb22bb2a1.
Other domain counts are unchanged, all 11 sessions remain revoked, no offers or
actionable mail exist. No Browser render, R2 object or provider send was issued.

Evidence: tmp/contract-phase-08-owner/C01a-checkpoint-safe.json indexes the
protected before, attempt, transport, actual postcondition and result evidence
by SHA-256. Full IDs and private values remain only in ignored owner-protected
evidence. C01a scope is consumed; the existing C01b approval remains valid after this separate checkpoint commit.
There is no prior schedule version for rollback. Keep Access enforced and Cron
paused; no deletion, repair, restore or automatic retry is authorized.

Only active-state documentation changes for this checkpoint. Run docs:check,
release:scan and git diff --check. Full check/test/build/E2E and independent
review are reused from exact source 0db38842524ebc146eaa56a9d089e3c3484bf0f3;
the unchanged driver retains its nine focused local checks. One next action:
execute-once-C01b-publish-exact-staged-schedule. rollover_required: no;
recommended_next_session_mode: High for the already authorized exact promotion.


## Prompt 08 C01 owner scope — 2026-09-06T22:38:11Z

The owner explicitly approved the concrete C01a stage and conditional C01b
promotion plan. C01a may execute once; C01b may execute once only after actual
successful C01a reconciliation and a separate docs-only checkpoint commit.
Scope is exactly two synthetic groups and sessions, one pinned import run and
one schedule version. The owner saw and accepted that first publication has no
prior version for canonical rollback: retain the bounded synthetic state behind
Access with Cron paused, stop further writes and reconcile on any failure.
No deletion, direct repair, restore, automatic retry or later contract/provider
operation is included. Protected approval: schedule-owner-approval.json under
tmp/contract-phase-08-owner; exact plan SHA-256 3502774f25e6ba5b435e11116b1f6fe1b238f87bb64442e43e70ce2fd4c41b8c.

No remote mutation occurred while recording this permission. Runtime, source,
migrations, dependencies and the rehearsed driver remain unchanged. Validation
for this status-only change is docs:check, release:scan and git diff --check.
Reuse the exact deployed candidate's full runtime/E2E evidence and the nine
focused local driver checks. One next action: execute C01a once and checkpoint
its actual postcondition before C01b. rollover_required: no;
recommended_next_session_mode: High because procedure, target and containment
are known and both bounded commands are authorized.


## Prompt 08 C01 local schedule preparation — 2026-09-06T22:25:35Z

Result: **success**, local/read-only only. C00 deploy remains successful and
checkpointed in commit 3ea61a9; version 7c1bae246b7f, exact five values and
temporary Cron/maintenance stop are not reopened. The new ignored driver
tmp/contract-phase-08-schedule.mjs uses the existing canonical ImportRepository
and RemoteD1Boundary, pinned source/fixture hashes, current preview selectors,
clean worktree and separate stage/promote permission guards.

The final exact driver passed nine focused checks against disposable local D1
with migrations 0001-0026 and the real remote-boundary serialization path:
source/parser/hash agreement; hidden two-group staging; no writes on duplicate
stage; injected ambiguous promotion transport failure stopping subsequent
cleanup writes and preserving unpublished data; exact successful publication
and audit; read-only promotion noop; wrong-environment rejection; zero foreign
keys, together with the migrated-D1 boundary check. Early local helper/schema
assumptions were corrected before success (period columns, issue columns and
diff.retired); no production code or remote write was involved. The final
source-integrity guard was followed by a fresh focused rehearsal.

Read-only remote evidence confirms zero groups, sessions, schedule versions
and matching fixture runs; a period lookup was the only additional row read
per rehearsal. Thus C01a is exactly one canonical createRun/stageSchedule
command with five internal write requests, yielding a validated run, one
unpublished version, two draft groups and two noncurrent sessions, zero issues.
C01b is a separately checkpointed promote command with three internal write
requests (lease, transactional promotion, release), yielding the same published
version, two published groups/current sessions, one promotion event and one
linked system audit. No users, documents, contracts, R2 objects, PDFs, email
or application sessions are requested by this plan.

This first publication has no prior schedule version for canonical rollback.
The earlier prospective reference to rollback is corrected: containment is to
retain hidden staging or the two synthetic published groups behind Access,
with Cron stopped and no downstream offers, while reconciling exact recorded
IDs/hashes. No deletion, direct repair, database restore or automatic retry is
authorized. The driver freezes all later writes after a transport/storage
failure, including repository cleanup paths; the operator must verify actual
state and commit the next checkpoint before any further remote command.

Evidence: schedule-driver-plan.json (hash 3502774f25e6ba5b435e11116b1f6fe1b238f87bb64442e43e70ce2fd4c41b8c),
schedule-rehearsal-safe.json, schedule-rehearsal-detail.json and
schedule-empty-baseline-safe.json under tmp/contract-phase-08-owner. Driver
SHA-256: 7cf38b447e6cfcf9e5c19642bdc504a22cba3aaf65f19ec5d0428fce4a1923bc. Permission remains ungranted
for both C01 transitions, Browser/R2, application sessions and provider sends.
Tracked updates are manifest/status/handoff only: docs:check, release:scan and
git diff --check apply. Full npm test, runtime check/build, E2E and independent
review are reused from the exact reviewed/deployed source; the new ignored
driver received its own focused transaction rehearsal.

**One next action:** request bounded C01a staging and conditional C01b promotion
permission, with actual read-only checks and a docs-only commit between them.
rollover_required: no; recommended_next_session_mode: High, because the planned
preview import has known target, finite commands, postconditions and explicit
containment, with no ambiguous remote result. Full preview and production stay
blocked until the remaining real contract/provider lifecycle gates pass.


## Prompt 08 C00 config deploy — 2026-09-06T22:13:11Z

Result: **success**. One owner-authorized strict deploy began at 2026-09-06T22:12:21.179Z.
Actual remote postcondition confirms version fingerprint 7c1bae246b7f at
100% traffic, replacing aba79c9fa0ae. Source candidate remains
0db38842524ebc146eaa56a9d089e3c3484bf0f3 and module SHA-256 remains
eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b.
The returned version matches the independently read deployment; exit code was
0. Exactly five values changed: CONTRACT_SEND_ENABLED=true,
CONTRACT_PREVIEW_REVIEW_ENABLED=true, CONTRACT_RENDERER=browser_run,
SCHEDULED_JOBS_ENABLED=false and SCHEDULED_OUTBOX_BATCH_LIMIT=1.

All other settings, bindings, runtime, resources, secret bindings and Cron
schedule entries match the baseline. Anonymous Access HEAD remains 302;
distinct EU R2 buckets remain private. Authorized health changed from 204 to
the approved empty 503 with no-store/noindex because automatic Cron and
maintenance are paused. It is expected containment, not a new runtime incident.
Scoped D1 domain/provider/session digests are identical before and after:
all 11 sessions revoked, six historical emails certain sent, no actionable
mail and zero contract templates/offers/artifacts/renders/certificates.
Postcondition read 1050 D1 rows, wrote zero, changes=0,
changed_db=false. No application, Browser, R2-write or provider command ran.
Both ignored local configs were synced only after actual deploy reconciliation.

The owner restored the existing service credential on this computer; local
DPAPI decryption and health now pass. Preflight initially stopped on one old
scheduled-job history row still marked running since 2026-09-03T07:30:45.792Z.
Exact read-only evidence proves its lock expired and later executions advanced
the fencing token and completed successfully. P2-OPS-HISTORICAL-RUNNING-001 is
retained as a nonblocking backlog item, with no repair or runtime refactor.
The ignored helper now permits only that exact unchanged historical record;
any new running history, active operation lock or running cadence still stops
deploy. Final preflight and postcondition had no active leases.

The single config permission is consumed. Containment is Access plus stopped
Cron and manual batch one; future sends still need separate exact scope and
one approved actionable row. Do not restore the old scheduler-enabled version
with held or uncertain mail. Prior-version rollback is recorded but neither
needed nor authorized; it would require separate scope and exact empty-queue,
no-foreign-drift preconditions. No next remote mutation may precede this
checkpoint's separate docs-only commit.

Protected evidence: tmp/contract-phase-08-owner/deploy-evidence-index.json,
deploy-result-safe.json, deploy-preflight-safe.json, immediate/after control,
database, R2 and lease snapshots, returned command evidence and historical-job
reconciliation. Tracked validation is docs:check, release:scan and git diff
--check only. Runtime check/test/build/E2E and independent review are reused
from exact source 0db38842524ebc146eaa56a9d089e3c3484bf0f3 (580 pass, one
expected Windows skip, 23/23 Chromium, check/build passed); no runtime or
schema source changed and the prompt forbids an unchanged-runtime review loop.

**One next action:** prepare/rehearse the bounded synthetic schedule driver
locally, using the already parsed two-block fixture and canonical repository,
before separate stage/promote permission. Full manual preview and production
remain blocked. rollover_required: no; recommended_next_session_mode: Medium,
because the next work is local/read-only and this deploy has no ambiguity.


## Prompt 08 DPAPI portability prerequisite — 2026-09-06T19:39:11Z

The owner restored the credential file and then confirmed it was created on
another computer. Fresh read-only preflight r02 again verified exact version
aba79c9fa0ae, module, settings, Access perimeter, private R2 and unchanged
business/provider/session metadata (1025 D1 rows read; zero writes/changes).
No deploy-attempt marker exists and the five-value deploy permission remains
valid and unconsumed.

The restored file has the Windows DPAPI format. Both PowerShell 5 and 7 fail
to decrypt it with HRESULT -2146893813; trimming changes nothing. A synthetic
encrypt/decrypt round trip in this current Windows context passes. The owner's
cross-computer origin explains the failed decryption; no credential value was
exported or included in evidence. The missing-file reason in the previous
checkpoint is superseded by this precise local portability prerequisite.

Prepared ignored helper tmp/repair-preview-access-token.ps1 prompts locally
for the existing Client ID and Client Secret with hidden input, performs only
an exact-origin health HEAD without redirects, and saves the values with DPAPI
and current-user-only ACL after validating the response. It keeps the prior
encrypted file as a protected backup. Parsing and local constructor/DPAPI
checks passed; the helper has not run with credentials. It does not create or
rotate remote tokens or alter Access policy. No runtime source changed.

Evidence: tmp/contract-phase-08-owner/config-dpapi-context-stop-safe.json and
deploy-preflight-r02-control/r2/db.json. One next action: the owner re-encrypts
the existing credential locally with the prepared helper; then resume fresh
read-only preflight under a new evidence label and the already approved deploy.
No render, email, application session, remote configuration write or rollback
occurred. docs:check, release:scan and diff check apply to the status update;
the unchanged exact runtime/full-suite/E2E/independent review evidence is reused.
rollover_required: no; recommended_next_session_mode: Medium for local credential
recovery and read-only verification. Full preview/production remain blocked.


## Prompt 08 authorized config preflight stop — 2026-09-06T19:21:08Z

Result: **failed read-only prerequisite; deploy was not attempted**. The owner's
explicit five-value permission is recorded in commit 87e0cf3 and remains valid
and unconsumed. Fresh controls confirm version fingerprint aba79c9fa0ae at 100%,
the exact existing module, unchanged settings/bindings/Cron, anonymous Access
302 and private distinct EU R2. Business/session/provider metadata matched the
manifest baseline; final bounded SELECT still has 11 revoked sessions, zero
non-sent email rows, offers and artifacts. Preflight read 1025 D1 rows;
final read 28; writes=0, changes=0, changed_db=false throughout.

The existing local DPAPI Access service-token file and its containing directory
are absent. Therefore the authenticated health HEAD could not run. An ordinary
Chrome navigation to the exact health endpoint was blocked by the client
(ERR_BLOCKED_BY_CLIENT); the block was not bypassed. The separate Playwright
and DevTools browser contexts have only blank pages. This is an observation
prerequisite, not evidence of an Access bypass or runtime failure. The final
in-flight Cron check was not reached and must be fresh before deploy.

No remote mutation, new application session, provider send, Browser render,
R2 write, Access change or rollback occurred. The primary ignored config is
unchanged: contract flags remain closed, renderer disabled, Cron enabled and
batch limit 25. Permission is not widened to repair Access or create a token.
Containment is to preserve this state until authorized health observation is
available; no blind deploy or repeated permission request for the same scope.

Protected evidence: tmp/contract-phase-08-owner/config-preflight-stop-safe.json,
deploy-preflight-control.json, deploy-preflight-r2.json, deploy-preflight-db.json
and config-owner-approval.json. The helper accepts a fresh preflight evidence
label for recovery; prior failed-read evidence is retained and no deploy-attempt
marker exists. Tracked changes are status/handoff only. docs:check,
release:scan and git diff --check apply; the existing full check/test/build/E2E
evidence for 0db38842524ebc146eaa56a9d089e3c3484bf0f3 and scoped independent
review are reused, with no runtime suite or review rerun.

**One next action:** restore access to the existing authorized health check
and rerun the read-only preflight. The same already approved deploy follows
only after it passes. rollover_required: no; recommended_next_session_mode:
Medium, because the immediate work is read-only access/health verification
and no remote write has an ambiguous outcome. Full manual preview and
production remain blocked.


## Prompt 08 config permission — 2026-09-06T19:14:44Z

The owner explicitly approved the preceding five-value preview-deploy request.
Scope is one config-only deploy of the unchanged exact source/build, with
CONTRACT_SEND_ENABLED=true, CONTRACT_PREVIEW_REVIEW_ENABLED=true,
CONTRACT_RENDERER=browser_run, SCHEDULED_JOBS_ENABLED=false and
SCHEDULED_OUTBOX_BATCH_LIMIT=1. Temporary maintenance pause and expected health
503 were included in the approved request. No provider, Browser, R2, import,
application session or business operation is authorized by this reply.
No remote mutation has been attempted in this permission checkpoint.
Protected evidence: tmp/contract-phase-08-owner/config-owner-approval.json.
One next action: fresh preconditions, then the single authorized deploy and
read-only postcondition followed by a separate docs-only checkpoint commit.
rollover_required: no; recommended_next_session_mode: High, because the target,
exact configuration delta, verification and stop containment are known.


## Prompt 08 read-only manifest — 2026-09-06T18:13:57Z

Result: **success** for read-only inventory, exact local bundle preparation and
the reviewable config proposal; D2-2 render/email/lifecycle remains unexecuted.
[Contract manifest](STAGE_13_CONTRACT_PHASE_MANIFEST.md) records the four exact
v1 bundle hashes, targets, A/P2/P1 actors, existing allowed P2 recipient,
prerequisites, operation counts, permissions and containment.

Live version fingerprint aba79c9fa0ae remains at 100% on deployed source
0db38842524ebc146eaa56a9d089e3c3484bf0f3. All settings/bindings/Cron match the
completed document phase. Access HEAD is 302, BROWSER and Resend secret binding
exist, distinct EU R2 stays private. Contract objects are zero; all 11 sessions
revoked; six historical auth emails are certain sent. D1 read 944 rows across
13 bounded SELECTs, wrote 0 with changes=0/changed_db=false. No remote mutation,
authenticated route, provider request, render, bucket-body read or Office access.

The local strict dry-run proposes exactly CONTRACT_SEND_ENABLED=true,
CONTRACT_PREVIEW_REVIEW_ENABLED=true, CONTRACT_RENDERER=browser_run,
SCHEDULED_JOBS_ENABLED=false and SCHEDULED_OUTBOX_BATCH_LIMIT=1. Module SHA-256
remains eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b;
both local configurations were preserved/restored. This is not a deploy.
Cron pause and batch one are explicit containment for the existing email
trigger's fixed five attempts and retryable network/invalid-response errors.
The ordinary manual outbox action remains available. While stopped, maintenance
pauses and health correctly returns 503. Restoring a scheduler-enabled version
with newly held/uncertain messages is forbidden without exact reconciliation.

Four offer PDFs plus one formation certificate require five Browser calls and
13 R2 objects including the four source bundles and four HTML artifacts.
The full normal flow queues ten emails: four contract.sent plus Q2/QD received
and decision notices, OY accepted and OY formed. The six additional notices
need separate delivery or explicit hold/cancel scope; none is silently sent,
cancelled or suppressed. No provider permission has been requested or consumed.

The data prerequisites are concrete: Q2/QD draft, FD pending with no dates,
approved current D0 retained, and zero course groups across all periods.
Two synthetic 90-minute schedule blocks and matching HTML passed the canonical
parser; a bounded remote schedule driver/rehearsal and separate stage/promote
scope are still required before those groups exist. This is a P1 data
prerequisite for the group offers, not an unchanged-runtime refactoring task.
The config-only proposal is independently reviewable; its approval does not
authorize those later import, session, offer, Browser/R2 or email operations.

One control-only helper attempt stopped on a local predicate that incorrectly
required an explicit false optional flag; canonical absent=false was confirmed
and corrected before the successful inventory. No write/uncertain mutation
occurred. No new runtime P0/P1 review loop was opened. Current review GO and
previous full release evidence are preserved; no production gate changed.

Evidence: tmp/contract-phase-08-owner/evidence-index.json, inventory-safe.json,
bundles-safe.json, config-plan-safe.json, schedule-plan-safe.json and protected
plans/config/bundle sources. Validation for tracked docs: docs:check,
release:scan and git diff --check only. Full npm test/E2E/check/build/new review
are intentionally not repeated; dry-run used the existing exact build.

**One next action:** request explicit owner approval for the five-value
config-only deploy in the manifest. rollover_required: no;
recommended_next_session_mode: High, because this exact deployment has known
target, postcondition and containment; no severe unresolved mutation risk exists.


## Prompt 07 completed on Workers Paid — 2026-09-06T17:36:18Z

Result: **success** for the authorized positive D01a–D18b document scenario.
The earlier upload → quarantine → actual owner ESET clean scan → same-admin
hash-bound attestation → separate business approval → archive → owner download
evidence is preserved. The owner enabled Workers Paid, confirmed in the live
exact-account subscription UI. Fresh remote control proved the same reviewed
source 0db38842524ebc146eaa56a9d089e3c3484bf0f3, version fingerprint aba79c9fa0ae
at 100%, unchanged settings and no explicit CPU cap (documented Paid default
30000 ms). No runtime/hash policy, config, deployment, plan or provider change
was performed by the agent. CLI OAuth was restored by the owner on this computer.

D17a: one native P1 login and normal cabinet redirect succeeded; D1 verified
exactly one new version-1 P1 session and preserved historical/domain state.
D17b: one native existing-D0 URL displayed the 404 not-found error page, matching
the deployed DOCUMENT_NOT_FOUND branch; no bytes or success download audit.
D18form: one required native security-form GET changed only P1 last_seen.
D18a: normal CSRF-protected logout and anonymous login redirect succeeded;
exactly that session was revoked with one linked logout audit. Each command
had an actual bounded read-only postcondition and its own docs-only commit.
The prior failed owner login remains recorded; this was one controlled resume
after a confirmed plan change, not a blind retry. Totals: 21 successful manifest
commands, one extra security-form GET, one historical failed login = 23 command
attempts. Normal redirect GETs are included in the corresponding native command.

D18b final at 2026-09-06T17:33:48.983Z: all 11 sessions revoked, one approved D0, one pending FD,
two drafts Q2/QD, two storage intents; roles/C2/bootstrap/providers/schema exact.
Private EU quarantine/archive fingerprints 442dca1871ce / 3996cebdabb0 remain
distinct, r2.dev disabled, custom domains absent. Exact-key metadata proves
quarantine absent, archive present; quarantine delete_state=deleted and original
expiry 2026-09-19T18:50:10.037Z unchanged. Archive and retained local bytes
are 16954 B, SHA-256 827fbc61bdd6ec453cccdbf2a80f1b1aa036069ca246182ebf4e86659afffd81. Owner download had verified actual
archive bytes; final reconciliation reads R2 metadata, not unaudited bodies.
Anonymous HEAD still redirects to Access. Final D1: 214 reads,
0 writes/changes. No direct repair, extra fixture, physical archive/local deletion,
encryption change, provider send, production or official-site operation.

Cost observations bracket this continuation: 17 additional
account-wide Worker requests and 817.058 CPU ms, zero
new execution errors; includes Cron and is not a pure login measurement.
Calendar month through 2026-09-06T17:33:56.680Z: 8992 requests and
108517.073 CPU ms, 0.08992% and
0.3617% of included Workers allowances.
Observed Workers overage estimate is $0; base subscription, other services,
invoice-period differences and analytics delay are separate. D1 today: 36815
rows read / 7542 written; continuation deltas 3438 / 84 include checks and Cron.
No background polling/load test was run. Subsequent preview phases should take
one bounded usage baseline and one final observation, define finite requests/
renders/sends in their manifest, and stop on unexpected growth/errors before
repeating a write. There is no claimed hard dollar cap or newly installed alert.
Sources: [pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[limits](https://developers.cloudflare.com/workers/platform/limits/).

Protected evidence: tmp/document-phase-07-owner/D18b-success-safe.json,
D18b-evidence-index.json, D18form-success-safe.json,
paid-20260906-closeout-safe.json and paid-20260906-after-cost-safe.json.
The supplement binds the final and extra-form hashes and corrects total attempts.
Historical 1102 CPU/memory subtype remains unproven; the current normal Paid
login and required foreign-owner flow passed, with no new observed resource error.

This completes Prompt 07's one-approved-document scope. Separate rejected and
actual nonapproved 14-day cleanup outcomes remain mandatory for full REQ-11;
contract/Browser/email, Telegram and owner acceptance remain subsequent phases.
Full manual preview and production remain blocked by those respective gates.
Production training/privacy approval is not inferred from this synthetic test.

Validation: every checkpoint passed docs:check, release:scan, git diff --check;
ignored helpers were adapted to native UI and their actual postconditions passed.
One local second-precision UTC checker failure was corrected before commit.
Full npm test, E2E, build and new independent review intentionally not rerun:
no runtime/migration/dependency/config change. Inherited exact source evidence:
580 tests passed / 1 expected Windows skip, 23/23 Chromium, check/build passed;
CLI-only bootstrap candidate 438a51399ac5f58b428b624c52ca2cbbc059ae9c has 8/8
scoped independent-review checks. No broader suite is needed for this docs diff.

**One next action:** read-only preparation of the Prompt 08 contract-phase manifest
with explicit request/CPU/Browser/provider cost bounds; no remote mutation now.
rollover_required: no; recommended_next_session_mode: Medium, because the next
preparation is read-only and there is no unresolved mutation ambiguity.


## Document scenario D18a verified — 2026-09-06T17:32:55Z

Result: **success**. One normal foreign parent P1 logout under the owner's complete D01a–D18b scope.
Before: one active P1 session after verified foreign denial. After: exact P1 session revoked with one linked logout audit; all sessions revoked and archive/domain/provider evidence preserved.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-06T17:32:55.439Z: 214 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D18a-success-safe.json`,
SHA-256 `f8692d71f976e85a6e8f824bfed9962be0a19e325179945e7367d9b86c3cbeb9`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Actual owner AV clean and separate business inspection are recorded; approved archive is retained. One next action:
D18b-final-bounded-reconciliation, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: Medium`: next action is local/manual or read-only evidence inspection with no remote write
and no unresolved ambiguity.

## Native logout form D18form verified — 2026-09-06T17:31:25Z

Result: success. Under the finite native-UI continuation scope, one GET of
/account/security displayed the normal Abmelden form. Before: one P1 session
after D17b foreign denial. After: only that P1 last_seen timestamp changed;
all domain, document, archive, provider, audit and historical sessions preserved.
Read-only postcondition: 210 rows read, zero writes/changes.
Target Worker/D1/version: 242c1796e930 / ccdeb22bb2a1 / aba79c9fa0ae.
Protected evidence: tmp/document-phase-07-owner/D18form-success-safe.json.
Containment: preserve Access/private archive; no request retry. One next action:
D18a native Abmelden with the normal anonymous login redirect, then its own
D1 reconciliation and docs-only commit. rollover_required: no;
recommended_next_session_mode: High, known logout target and postcondition.


## Document scenario D17b verified — 2026-09-06T17:30:22Z

Result: **success**. One foreign parent denial for existing archived D0 under the owner's complete D01a–D18b scope.
Before: P1 session active and real D0 owned by P2. After: HTTP 404 DOCUMENT_NOT_FOUND without document bytes or attachment; no new success audit, document, archive or domain change; only P1 session touched.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-06T17:30:22.299Z: 210 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D17b-success-safe.json`,
SHA-256 `ef660a2431bcb6110e8ca74e9083614043a1585d4ecf1c1c0c275f5b937afe99`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Actual owner AV clean and separate business inspection are recorded; approved archive is retained. One next action:
D18a-normal-P1-logout, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known target/postcondition/containment
and no unresolved ambiguity.

## Document scenario D17a verified — 2026-09-06T17:29:03Z

Result: **success**. One normal foreign parent P1 login without redirect follow under the owner's complete D01a–D18b scope.
Before: all sessions revoked, D0 belongs to P2. After: one new P1 session v1; prior sessions, ownership, archived D0 and providers preserved.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-06T17:29:03.565Z: 210 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D17a-success-safe.json`,
SHA-256 `e4b93b84853d36790c3ba9924a6930d9eef51962cc4d1728cef70afe5b449d1e`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Actual owner AV clean and separate business inspection are recorded; approved archive is retained. One next action:
D17b-foreign-parent-existing-D0-denial, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known target/postcondition/containment
and no unresolved ambiguity.

## Paid plan confirmed; finite Prompt 07 continuation — 2026-09-06T17:27:23.643Z

The owner reports enabling Workers Paid and explicitly asks to finish Prompt 07.
The live subscription UI in the exact account (fingerprint 5dbd04a4763a) shows
Workers Paid Active. A normal Wrangler OAuth login was completed by the owner in
the current Windows profile. No application role/session/bootstrap or deployment
change was performed by that CLI login. Fresh API control confirms one unchanged
version aba79c9fa0ae at 100%, exact settings, Standard usage model and no explicit
CPU limit. The documented Paid default is 30000 ms per HTTP invocation; the UI
CPU input is unset. This is a configured-default inference, not a measured hard
cutoff. Historical 1102 CPU-versus-memory subtype remains unconfirmed.

Bounded SELECT-only preflight at 2026-09-06T17:24:47.633Z: 207 rows read,
0 writes/changes; all D16 domain/session/detail fields exact, ten revoked sessions,
approved D0/archive evidence preserved. Protected control and preflight:
tmp/document-phase-07-owner/20260906-control-private.json and
tmp/document-phase-07-owner/paid-20260906-preflight-safe.json.

One account-wide calendar-month observation (2026-09-01T00:00:00Z through
2026-09-06T17:25:48.194Z) reports 8975 requests and 107700.015
CPU ms: 0.08975% and 0.35900005%
of the documented monthly included amounts. These adaptive analytics are not an
invoice and include time before the upgrade. Last 24 hours of this exact Worker:
1556 invocations, one historical exceededResources event at 381.493 ms CPU.
D1 today: 33377 rows read, 7458 written. Billing UI currently reports only R2
usage: 23 Class A, 195 Class B operations, $0 usage cost; Workers billing data
is not yet shown, so no account-wide invoice conclusion is drawn. There is one
existing budget alert; its threshold/scope was not yet inspected or modified.

The remaining commands use ordinary browser UI on this computer: D17a one login
plus its normal cabinet redirect GET; D17b one existing-document navigation;
one necessary security-form GET followed by D18a normal CSRF-protected logout.
Each authenticated command, including the additional form GET, receives its own
actual postcondition and docs-only commit. Final read-only D18b and one cost
observation complete the phase. No script-based credential/cookie extraction,
new fixture, load test, provider send, runtime/config/CPU-limit change or deploy.
Containment after any failure: reconcile once, preserve Access/private archive,
stop before another command; do not blindly retry the login. The existing P1
is cleared only after a successful real Paid login is verified.

One next action: D17a after private P1 input and this checkpoint commit.
Validation: docs:check, release:scan, git diff --check only. Runtime, migrations,
dependencies and deployment config are unchanged; inherited exact candidate
release and independent review evidence remains applicable. No full runtime,
E2E or build rerun. rollover_required: no; recommended_next_session_mode: High,
because the remaining authorized commands have exact targets and containment.
Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).


## Read-only comparison with Berufsorientierung — 2026-09-05T20:39:16Z

The owner reports the separate Berufsorientierung application works on Workers
Free without observed blocks. Its local source and installed bcrypt package were
read only; no previous-project files, application state or remote resources were
changed. Both applications use SvelteKit, the Cloudflare adapter and bcryptjs.
The previous project's auth/index.ts sets SALT_ROUNDS=10; this project's
auth/password.ts defaults to cost 12. The bcrypt core performs 2^cost iterations,
so these defaults differ by fourfold computation, not twenty percent.

A same-process synthetic comparison measured five valid checks for each package
and cost combination. Median process CPU ms: bcryptjs 3.0.2 at cost 10 = 109,
at cost 12 = 438; bcryptjs 3.0.3 at cost 10 = 110, at cost 12 = 484. All twenty
comparisons returned the expected result. Evidence:
`tmp/login-project-comparison-20260905.json`. This is local Node performance,
not a remote Worker benchmark; no actual user hashes/passwords were accessed.
The measured package-version difference does not explain the roughly fourfold
cost effect. Stored hashes carry their own cost: changing a source default alone
would not accelerate verification of existing cost-12 hashes.

Other observed differences: an unknown account returns before bcrypt in the
previous login, whereas this project's fresh runtime computes a dummy hash and
compares it; this path was previously measured at 734 ms local CPU and does not
establish the failed existing-account path. The previous app issues a JWT and
checks the user in D1; the current app additionally maintains revocable D1 sessions
and session versions. Those differences are not measured causes of the 1102.
Waiting for D1 is not itself Worker CPU time.

Cloudflare documents 10 ms CPU per Free HTTP invocation and flexibility for
infrequent excess. This can accommodate some successful expensive requests; it
does not guarantee either bcrypt configuration fits Free. Even the cost-10 local
result exceeds 10 ms, and local CPU is not a measurement of the deployed previous
Worker. Why that deployment has avoided blocks remains unverified without its
actual settings, hash-cost metadata and invocation metrics. Source:
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

This comparison supersedes the Paid-only framing of the immediately preceding
proposal: Paid is an option, not an established unique remedy or proof of the
historical error's CPU/memory subtype. One next action is to prepare bounded
login-CPU remediation options using this evidence and the security requirements.
No password-policy change, purchase, remote request or login retry occurred.
D16 and archived-document evidence remain preserved; D17b/D18 remain pending.

## Owner confirms Workers Free — 2026-09-05T20:28:00Z

The owner explicitly answered Workers Free. The actual plan is now owner-confirmed;
API lookup still returned 403 and no paid subscription is claimed. Cloudflare's
documented Free CPU allowance is 10 ms per invocation, while the existing bcrypt12
implementation measured 391–438 ms for a valid synthetic local comparison and the
failed remote invocation recorded 381.493 ms CPU. Relying on occasional over-limit
execution is unsuitable for this login flow. The exact CPU/memory subtype of the
historical 1102 remains unverified, but the CPU budget incompatibility requires
resolution independently. Several logins did not exhaust a shared daily CPU pool.

Prepared remedy proposal: owner enables the separate Workers Paid subscription on
the pinned existing account (fingerprint 5dbd04a4763a), currently USD 5/month base;
retain exact preview Worker/version, schema, secrets, Access, password strength,
providers and stored evidence. No Worker deploy or runtime rewrite is proposed as
part of the plan change itself. The effective post-change limit must be read back
and confirmed, not assumed from a payment receipt. A fresh successful, failed and
bounded concurrent synthetic login rehearsal needs exact targets, request counts,
postconditions, cost/containment and prior authorization; no uncontrolled load test.
If 1102 persists under a confirmed adequate CPU allowance, diagnose the detailed
invocation and memory/other resource behavior rather than declaring upgrade a fix.

No subscription purchase, billing acceptance, API mutation, new login, configuration
change or test dispatch occurred. The owner only confirmed the existing Free plan;
this does not authorize purchasing Paid. Earlier D16/archive/owner-download evidence
is retained; P1 is open and D17b/D18 remain unexecuted. One next action: prepare or
review the bounded Paid-plan remedy/validation scope with the owner before any
purchase or remote change. Current mode remains Medium for local/read-only work.

## Local login CPU profile and capacity clarification — 2026-09-05T20:26:19Z

Read-only/local follow-up to P1 Worker 1102. No login, configuration, plan,
permission, deployment or other remote mutation occurred. Existing
BcryptPasswordHasher was measured with synthetic input only under Node's CPU
profiler: three valid-password comparisons consumed 391, 406 and 438 ms process
CPU; three wrong-password comparisons 359, 391 and 391 ms; a fresh missing-user
dummy hash plus comparison 734 ms. Of 1740 profiler samples, 1735 were attributed
to bcryptjs. Evidence: `tmp/login-resource-local-profile-20260905.json`.
No actual password/hash was read or exported. This establishes a substantial
local CPU cost for the deployed algorithm, not a remote Worker profile or proof
of the failed invocation's exact code path.

The owner's question about several logins exhausting capacity is clarified:
1102 is a per-invocation CPU/resource failure, not evidence that a handful of
logins consumed a daily request quota. Actual Workers plan/effective cap and
CPU-versus-memory subtype remain unconfirmed; the owner was asked only which
Workers plan is active, not for permission to buy or change anything.

Current official documentation distinguishes Workers Free's 10 ms CPU/request
from Workers Paid's default 30 seconds CPU/request. Paid's base subscription is
USD 5/month, including 10 million Worker requests and 30 million CPU ms/month.
Illustrative arithmetic only: 300 logins/day × 30 days × observed 381.493 ms
= 3,433,437 CPU ms/month, about 11.45% of that included CPU allowance. This is
not a measured average, load test or full application cost forecast; Cron,
other requests, database/storage, browser rendering and providers are separate
workloads/services. A Paid CPU allowance also does not resolve a memory problem.
Sources: [Worker limits](https://developers.cloudflare.com/workers/platform/limits/)
and [Worker pricing](https://developers.cloudflare.com/workers/platform/pricing/),
retrieved 2026-09-05.

The required resolution is to establish the actual plan/cap and error subtype,
then prepare an exact configuration or implementation change appropriate to
that evidence and validate ordinary, failed and concurrent login behavior.
Do not weaken password hashing simply to fit a Free CPU allowance. No payment,
plan/config change or remote load test was performed or inferred as authorized.
Document scenario remains at D16 with failed D17a contained; previous D1
reconciliation still shows all ten sessions revoked and D0/archive preserved.

One next action: read-only confirmation of effective Worker plan/limit and
error subtype. Passed: seven synthetic local performance measurements with
expected comparison outcomes, profiler inspection, docs:check, release:scan,
git diff --check. Full runtime/E2E/build not repeated: runtime and configuration
are unchanged. `rollover_required: no`;
`recommended_next_session_mode: Medium`: the next work is read-only diagnosis.

## P1: owner native login failed with Worker 1102 — 2026-09-05T20:18:08Z

After D16 checkpoint 7289274 and private-input handoff 9f37a88, the owner
submitted the ordinary browser login form. The retained browser network list
confirms POST /auth/login -> HTTP 503; the supplied screenshot shows Cloudflare
1102 at 2026-09-05T20:08:16Z, Ray fingerprint ce4bbd2596e4. The agent did
not submit D17a or retry the owner request. The previously pending request for
private input is superseded by this reported failed login and diagnostic hold.

Actual bounded read-only D1 postcondition 2026-09-05T20:11:58.413Z matches the entire
D16 selected data/details snapshot exactly: no new session, all ten sessions
revoked, approved D0/archive metadata, earlier AV/business/owner-download
evidence, roles, C2/Q2/QD/FD and providers unchanged. No login-rate row remains;
this point-in-time result does not reconstruct any expired transient metadata
between the request and observation. This is a confirmed failed login, not an
ambiguous successful session or a reason for direct repair.

The pinned Worker remained at single version aba79c9fa0ae, 100%, exact settings
unchanged; usage_model=standard and no explicit limits object. This does not
establish Free versus Paid or the effective CPU cap. Metrics for this Worker
in 20:06–20:10Z show one failed invocation at the exact screenshot second with
status exceededResources and cpuTimeP50/P99=381493 microseconds (381.493 ms).
The live GraphQL schema independently confirms microsecond units. Five other
invocations succeeded in that window. These aggregates do not identify a code
line, distinguish the CPU/memory subtype, or prove that every earlier successful
login stayed below its effective budget.

Persisted Workers Logs are enabled, but the single temporary/dry five-second
telemetry read returned API 403; the worker-plan read also returned API 403.
This is Cloudflare authorization, not an automatic approval-review rejection.
No logging configuration, subscription, limit or permission was changed. The
source uses bcryptjs with default cost 12, which is a plausible expensive login
path; no request-level profile proves it caused this invocation's failure.
Cloudflare documents 1102 for CPU/memory and 1027 for free-tier daily requests;
the CPU limits documentation also describes burst flexibility. Free plan's
10 ms must remain conditional until the actual plan is verified.

Classification: **P1**, because normal login in the required manual-preview
flow failed. P0/data-loss/authorization-bypass evidence is absent. Last completed
gate remains D16; D17b/D18 are unexecuted, and the prepared final-complete helper
must not be run. The earlier independent scoped candidate review is historical
evidence; this new live P1 blocks continuation until resolved.

Protected evidence: `tmp/document-phase-07-owner/D17a-owner-1102-incident-safe.json`,
SHA-256 `30d074ae5a4c413bb6c9ead0ee9c301f6822ec577352d2f845fa90b48dd65885`; screenshot, exact raw metric query/result, schema units,
version/settings and selected D1 snapshots remain Git-ignored with owner-only
access. No password, email, cookie, document body or complete resource ID was
exported. Existing approved archive and local downloaded file are retained;
no encryption changes, deploy, provider send, direct repair or retry occurred.

**One next action:** read-only confirmation of effective Worker limits and the
failing login's resource path using available invocation diagnostics or a local
profile. No weakening password verification, plan purchase or configuration
change is authorized by this diagnosis. Passed: actual-state/metric/unit
verification, docs:check, release:scan and git diff --check. Runtime tests,
E2E/build were not rerun because this is diagnosis/docs with no runtime diff.
`rollover_required: no`; `recommended_next_session_mode: Medium`: immediate
work is read-only and the failed login is contained, with no active session or
unresolved application-write outcome.

## D10–D16 verified; final foreign-parent check awaiting private input — 2026-09-05T20:02:50Z

Current last completed checkpoint: D16, commit 7289274. Actual owner ESET
Internet Security clean scan, version 19.2.7.0, current definitions dated
2026-09-05 and zero detections are recorded. The screenshot's displayed
21:27:45 is retained with owner attribution; its filename association comes
from the owner's exact-D0 scan reply. Local downloaded SHA/16954 bytes remain
unchanged. No encryption setting was inspected or changed in this continuation.

D11 deliberately wrong SHA rejected 409, with no document/attestation/archive/
audit/idempotency change. D12 same-A exact-SHA clean attestation committed and
linked to the preceding A download/audit. The owner separately inspected D0
and confirmed suitable readable synthetic Nachhilfe/Jobcenter content. D13
normal business approve linked one private archive object/intent/assertion and
review audit; archive key fingerprint 581e3f17f58c. Server quarantine object
absent, D1 delete_state=deleted; original 14-day expiry preserved. The separate
FD remains pending_review and QD remains draft.

D14 revoked the A session. D15a created exactly one P2 session; D15b actual
owner archive download returned 200/forced attachment with exact SHA-256
827fbc61bdd6ec453cccdbf2a80f1b1aa036069ca246182ebf4e86659afffd81
and 16954 bytes, separate owner-download audit/assertion and unchanged domain
state. D16 revoked this P2 session with a matching logout audit. All ten sessions
are now revoked; roles, C2/Q2, archived D0 and providers are preserved. Each
application command has its own before/after evidence and docs-only commit.

**One next action:** D17a normal P1 login after the owner fills email/password
privately in the already-open fresh login form. The async input question remains
pending. Do not request scope approval again; the complete D01a–D18b scope is
already authorized. No D17a attempt marker exists, and no login was sent.
Prepared protected helpers: D17a-browser.js, D17b-browser.js, D18a-browser.js.
Use document-phase-07-access.cjs begin/reconcile per step, then
document-phase-07-step-state.cjs and docs checks/commit before the next mutation.
After successful P1 login: D17b foreign existing-D0 denial, D18a normal P1 logout,
then D18b final bounded read-only reconciliation with document-phase-07-final.cjs
and final handoff/readiness update with document-phase-07-complete-state.cjs.
Prepared final helpers have passed syntax checks but have not run.

The first anonymous login-page result formatter used unavailable URL in the
tool VM after the page loaded. A DOM-only observation confirmed the fresh
login form; the formatter was corrected for P1 preparation. No login retry or
unreconciled mutation occurred. No document contents, credentials or cookies
were exported. Exact responses/IDs remain in protected Git-ignored evidence.

Containment: retained private approved archive and synthetic QD/FD/D0, local
download retained in the owner's selected experimental directory, no direct
repair/deletion/provider send/production/CMS change. The synthetic-only
unencrypted directory exception remains as explicitly directed by the owner;
it does not change production requirements. Full REQ-11 rejected and actual
nonapproved 14-day cleanup, full manual preview and production remain pending.

Passed: actual bounded response/D1/R2/checksum postconditions through D16,
ignored helper syntax, docs:check, release:scan and git diff --check at every
checkpoint. Not repeated: full runtime suite/E2E/build/review because deployed
source 0db38842524ebc146eaa56a9d089e3c3484bf0f3 and config/version aba79c9fa0ae
are unchanged; prior exact release evidence remains reusable.
`rollover_required: no`; `recommended_next_session_mode: High`: the
remaining authorized login/access/logout actions have known targets,
postconditions and containment, with no unresolved remote ambiguity.

## Document scenario D16 verified — 2026-09-05T19:57:07Z

Result: **success**. One normal owner P2 logout under the owner's complete D01a–D18b scope.
Before: one active owner P2 session after verified archive download. After: exact P2 session revoked with one linked logout audit, no active session; archive and domain/provider state preserved.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T19:57:07.521Z: 207 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D16-success-safe.json`,
SHA-256 `f3c47db9bd9dc61d37d07b1489772a1a4b4779caf697397568c276e4658918ad`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Actual owner AV clean and separate business inspection are recorded; approved archive is retained. One next action:
D17a-normal-foreign-P1-login, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known target/postcondition/containment
and no unresolved ambiguity.

## Document scenario D15b verified — 2026-09-05T19:55:46Z

Result: **success**. One approved owner archive download under the owner's complete D01a–D18b scope.
Before: one active owner P2 session and D0 approved in private archive. After: HTTP 200 forced attachment, actual archive bytes match exact D0 SHA/16954 bytes; one linked owner-download audit/assertion; document, archive, AV, business and provider state preserved.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T19:55:46.471Z: 203 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D15b-success-safe.json`,
SHA-256 `dc634965d5f6e1f5c8c75636dd0a271207e4b389d2d1b54f52008675282e099e`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Actual owner AV clean and separate business inspection are recorded; approved archive is retained. One next action:
D16-normal-P2-logout, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known target/postcondition/containment
and no unresolved ambiguity.

## Document scenario D15a verified — 2026-09-05T19:54:46Z

Result: **success**. One normal owner P2 login without redirect follow under the owner's complete D01a–D18b scope.
Before: all sessions revoked and D0 approved in archive. After: exactly one new P2 owner session v1; historical sessions, roles, archive, document and providers preserved.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T19:54:46.245Z: 198 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D15a-success-safe.json`,
SHA-256 `a4dc34874b22b2d807b1975f9462ba1e5702e55fffda24385fd836abe765d2ef`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Actual owner AV clean and separate business inspection are recorded; approved archive is retained. One next action:
D15b-owner-approved-archive-download, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known target/postcondition/containment
and no unresolved ambiguity.

## Document scenario D14 verified — 2026-09-05T19:50:41Z

Result: **success**. One normal A logout under the owner's complete D01a–D18b scope.
Before: one active A session and one approved archived D0. After: exact A session revoked with one linked logout audit; no active session; archive and all document/AV/business evidence preserved.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T19:50:41.455Z: 195 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D14-success-safe.json`,
SHA-256 `5077b9c080718fc64bbb8964f7ea4d8fa2da979b6e0240a10e7ea99118810345`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Actual owner AV clean and separate business inspection are recorded; approved archive is retained. One next action:
D15a-normal-owner-P2-login, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known target/postcondition/containment
and no unresolved ambiguity.

## Document scenario D13 verified — 2026-09-05T19:46:35Z

Result: **success**. One separate business approval and native archive handoff under the owner's complete D01a–D18b scope.
Before: D0 clean, owner separately inspected content and confirmed suitable synthetic document. After: D0 approved by A, one linked archive intent and assertion with exact SHA/size metadata in private EU R2; server quarantine object absent and delete_state deleted; AV evidence preserved; independent archive byte check remains D15b.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T19:45:06.296Z: 191 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D13-success-safe.json`,
SHA-256 `8e43f3b001b90aa340f9c734616f68c68a2ede0c3e27a9a75d946effdbf6a764`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Actual owner AV clean and separate business inspection are recorded; approved archive is retained. One next action:
D14-normal-A-logout, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known target/postcondition/containment
and no unresolved ambiguity.

## Document scenario D12 verified — 2026-09-05T19:40:55Z

Result: **success**. One same A exact-SHA actual clean attestation under the owner's complete D01a–D18b scope.
Before: D0 quarantined, actual owner ESET clean result recorded, negative SHA probe rejected. After: D0 clean with manual_local_av and actual ESET fields; exactly one immutable attestation linked to same A download, SHA, audit and completed idempotency record; no business approval or archive.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T19:40:55.732Z: 182 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D12-success-safe.json`,
SHA-256 `13acccfc81c83f31244c9d6e07ff55fe88a66a1f76dbd50501b1b9f1d96a30e5`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Actual owner AV clean evidence is recorded; business review remains a separate decision. One next action:
D13-separate-business-inspection-and-approval, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known target/postcondition/containment
and no unresolved ambiguity.

## Document scenario D11 verified — 2026-09-05T19:39:45Z

Result: **success**. One negative wrong-SHA attestation probe under the owner's complete D01a–D18b scope.
Before: actual owner AV clean and D0 quarantined with same A download evidence. After: intentionally incorrect SHA rejected with 409; all document, attestation, idempotency, audit and archive state unchanged; only current A session touched.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T19:39:45.351Z: 178 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D11-success-safe.json`,
SHA-256 `9a623ceedbff5bd0849f78194e13637fca0e80e80d492ded26435cddb4b0af64`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Actual owner AV clean evidence is recorded; business review remains a separate decision. One next action:
D12-same-A-exact-SHA-actual-clean-attestation, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known target/postcondition/containment
and no unresolved ambiguity.

## Document scenario D10 verified — 2026-09-05T19:36:53Z

Result: **success**. One recording of actual owner ESET clean scan under the owner's complete D01a–D18b scope.
Before: downloaded exact D0 awaiting owner antivirus result. After: owner reports completed ESET Internet Security scan with zero detections and current definitions dated 2026-09-05; installed product version 19.2.7.0 verified read-only; local SHA and size unchanged, same A session and remote state preserved; no encryption change.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T19:35:58.283Z: 175 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D10-success-safe.json`,
SHA-256 `ea0883557dd11151501abf751de2c3a49446d78ec6ba1d550c1f0f91e87d0426`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Actual owner AV clean evidence is recorded; business review remains a separate decision. One next action:
D11-deny-deliberately-wrong-SHA-attestation, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known target/postcondition/containment
and no unresolved ambiguity.

## Exact D09 download complete; owner AV handoff — 2026-09-05T19:27:40Z

The owner explicitly resumed the one synthetic D0 experiment in the selected
local directory with no encryption changes. Canonical exception/check criterion
and fresh exact-target/session preflight were committed as 7b64b78. No disk,
folder or container encryption was enabled, disabled or reconfigured. The
exception does not apply to production or real client documents.

D09 dispatched once: normal A POST with CSRF and purpose local_av_scan.
HTTP 200, forced attachment with opaque filename, application/octet-stream,
private/no-store, nosniff and default-src none/sandbox all passed. The file was
saved to the exact new destination in the owner-selected local directory.
Full local SHA-256 827fbc61bdd6ec453cccdbf2a80f1b1aa036069ca246182ebf4e86659afffd81 and 16954 bytes match D0.
The path remains in protected `tmp/document-phase-07-owner/D09-download-plan.json`;
no document contents were rendered, opened for inspection or exported to chat.

Actual D1 postcondition 2026-09-05T19:23:35.640Z: 175 read-only rows,
zero writes/changes; same A session version 2, one matching quarantine-download
audit and one immutable quarantine_downloaded assertion with the same A/D0/SHA
linkage. Prior upload assertion, roles, historical sessions, QD/FD/Q2, provider
state, quarantine key/TTL/intent and status are preserved. D0 remains quarantined
with no AV attestation or archive. The local verifier initially classified the
expected new download assertion as drift; the deployed repository explicitly
inserts it. The ignored verifier now validates its exact linkage and preserves
older assertions, reusing the saved authoritative snapshot. No request retry,
runtime change or unresolved mutation ambiguity occurred.

D09 active-state checkpoint: 9e3edbd. Protected success evidence SHA-256
20dc7c25ec271f668567a7978ac29875ecd0f2a1f8db0000011c5cdb1f57d5e0. Current count: 9 sessions, 8 revoked and 1 current A; document 1,
funding authorization 1, requests 2, quarantine intent 1. Browser context is
retained for the same-admin continuation. Do not refresh, relogin or download
again merely to prepare the next step.

**One next action:** owner personally scans the downloaded file with current
approved local antivirus, without opening it first, and reports product/version,
engine/definitions freshness, completion time with time zone and clean/detected.
The agent's read-only Defender metadata inquiry was denied by local permissions;
it ran no scan and provides no AV result. Do not treat that metadata limitation
as evidence that antivirus is absent or ineffective. Owner scan facts are pending.

After actual clean: continue the already authorized D11 wrong-SHA negative,
D12 exact hash-bound attestation by the same A, then separate D13 business
inspection/decision and archive/owner/foreign checks with individual checkpoints.
If detected or uncertain, stop without inventing clean or approving business
review. Local copy cleanup follows the owner's procedure; no deletion requested
or performed. Current A session intentionally remains available for this flow.

Full REQ-11/manual preview and production remain blocked. Rejected/14-day
nonapproved cleanup outcomes remain separate. Passed: helper syntax, exact
download response, local checksum/size and linked D1 postconditions, docs:check,
release:scan and git diff --check. Full runtime/E2E/build/review deliberately
reused from exact unchanged candidate; this turn changed docs and ignored
operational helpers only. `rollover_required: no`;
`recommended_next_session_mode: Medium`: the immediate next action is local
owner AV/manual inspection without remote mutation. Return to High when the
reported scan facts permit the planned remote attestation steps.

## Document scenario D09 verified — 2026-09-05T19:25:30Z

Result: **success**. One audited forced A download of exact D0 under the owner's complete D01a–D18b scope.
Before: D0 quarantined, no admin download audit or local copy. After: forced attachment saved in owner-selected experimental directory; exact SHA/16954 bytes match, same A download actor/hash/audit linked; D0 remains quarantined, no AV attestation or archive.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T19:23:35.640Z: 175 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D09-success-safe.json`,
SHA-256 `20dc7c25ec271f668567a7978ac29875ecd0f2a1f8db0000011c5cdb1f57d5e0`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Real local AV remains pending. One next action:
D10-owner-personally-scans-downloaded-D0, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: Medium`: next action is owner local AV/manual inspection with no remote write
and no unresolved ambiguity.

## Owner resumes exact synthetic D0 without encryption — 2026-09-05T19:22:03Z

The owner explicitly instructed continuation in the previously selected local
directory and prohibited any encryption changes. This overrides the former
encrypted-workspace prerequisite for this one synthetic D0 without PII. The
limited exception is now recorded in the canonical storage contract, linked
from runbook section 4 and covered by the corresponding acceptance criterion.
It does not change the production policy or authorize real client documents.
No disk/folder/container encryption was enabled, disabled or reconfigured.

Read-only directory inspection: selected directory exists, is not a reparse
point, and matches zero of six registered Windows/OneDrive sync roots. This
is a bounded registration check, not a claim to have audited every possible
third-party sync tool. No public scanner or cloud-copy operation is performed.
Exact directory and owner-decision record remain in protected ignored evidence.

Fresh preflight 2026-09-05T19:19:53.185Z: version aba79c9fa0ae at 100%, settings exact, D0/domain/
provider/audit/session state equal to D08. Same A session v2 is unexpired;
170 scoped rows read, zero writes/changes. D09 has zero attempts
and its destination does not exist. Browser retains the exact D0 download form,
CSRF and local_av_scan purpose without refresh or session mutation.
Evidence: `tmp/document-phase-07-owner/D09-resume-safe.json`, SHA-256
`a961dd173ae7f0d6ac054f423813b2d7a7cf089c36e4ab5abc96f48752bf893a`; private exact owner decision, target and proposed destination saved.

One next action: D09, one audited admin POST download with the existing A
session. Verify forced headers, local exact SHA/size and same-admin D1 audit,
then checkpoint before the owner personally performs AV. No simulated clean,
business approval, direct repair or retention change. Full manual preview and
production remain blocked. This local/docs change touches no production path;
run docs:check, release:scan, git diff --check and helper syntax only. Inherited
runtime/E2E/build/review evidence is reused; no runtime/config/schema/dependency
change warrants repetition. `rollover_required: no`;
`recommended_next_session_mode: High`: exact authorized download, postcondition
and containment known, no unresolved mutation ambiguity.

## Document scenario D01a–D08 complete; D09 human input cursor — 2026-09-05T19:06:54Z

Completed all ten finite application actions through D08, each with actual
read-only postcondition, docs:check/release:scan/diff-check and separate active
state commit. Current reviewed/deployed sources and version aba79c9fa0ae are
unchanged; the document scenario has full owner authorization across handoffs.

- P2 normal login and new/detail forms passed; one QD draft v1 (fingerprint
  55dd7612cb70) and FD pending_review v1 (0424d98cd5ed) created for existing C2.
  Q2, C2, roles, sealed bootstrap and provider state were preserved.
- One D0 upload passed: document fingerprint a198b7bdf114, random
  quarantine-key fingerprint 79d98ac3cf1d, PNG 16954 bytes,
  SHA-256 827fbc61bdd6ec453cccdbf2a80f1b1aa036069ca246182ebf4e86659afffd81. Immutable expiry 2026-09-19T18:50:10.037Z; one linked quarantine
  intent, storage/document assertions and upload audit. Actual exact-key R2
  metadata and private distinct EU buckets passed; archive link is absent.
- P2 preapproval download returned 404 DOCUMENT_NOT_FOUND without document
  bytes or success audit; P2 normal logout was reconciled. A normal login then
  created one version-2 session; D0 appears in its queue with exact attestation
  version preview-manual-av-2026-08-10. D08 valid-CSRF approve before AV returned
  expected 409, with no document/intent/attestation/review/audit change.
- Latest D1 snapshot 2026-09-05T19:02:58.256Z: 170 read-only
  rows, zero writes/changes; 3 users, 9 sessions (8 revoked, 1 current A),
  2 requests, 1 funding authorization, 1 quarantined document and 1 quarantine
  intent. No provider send, AV, admin document-body download or archive occurred.

Checkpoint commits: D01a b7f0f84, D01b 0c59401, D02 cec6df3, D03 8ef2fa3,
D04 1743f99, D05 1b5379f, D06 738c97a, D07a 5e71996, D07b 46a8713,
D08 e25746c. Protected evidence directory remains owner-only and Git-ignored.
D04 success SHA-256 c79cf5d43778b033338b74298e18a3899a482af82a0328a4c53cb8646f95af47; D08 success SHA-256
7cc60498d1288c0e2e0973b73b80f1fbee55d7a9022324b75e04a2271fd24329; D09 preparation SHA-256
db22af2cf1d569329dd04233307c26da4363532e1db943c71d2071b3552c66a0. Exact IDs/keys and document bodies are not
part of tracked evidence. A one-time pre-D01b SELECT-only HTTP 403 was followed
by successful bounded read-only diagnostic reconciliation; D01b had not been
dispatched at that point. No uncertain remote write or login retry remains.

The owner specified a local quarantine directory for this experiment. It
exists, is an ordinary directory, is not EFS-marked; volume encryption inquiry
was unavailable because the process lacks system permission. This does not
prove the volume is unencrypted. Encryption and absence of cloud sync still
await an owner fact confirmation required by operations runbook section 4.
The private D09 plan pins that directory and a new opaque filename. D09 helper
is syntax-checked and prepared, with zero attempts and no local downloaded copy;
its begin mode requires an explicit workspace-fact record. Do not infer these
facts from scenario authorization or the directory name.

**One next atomic action:** D09 audited admin POST download, once workspace
facts are confirmed, using the same A session after fresh bounded reconciliation.
Then checkpoint and hand the exact downloaded file to the owner for an actual
local AV scan. Product/version/definitions freshness/UTC/result must come from
that scan; neither fixture validation nor the planned negative SHA probe is an
AV result. The same full D01a–D18b authorization continues; do not ask again.

P2 follow-up from owner: provide a flexible administrator choice of local
download directory in future. Record as a UX proposal; the experimental path
is not a production default and must not be hard-coded into runtime. No proven
current-flow failure, runtime change or new review loop is justified by this
wish. Decide its browser/workstation UX separately from this preview gate.

Containment: D0 remains private and quarantined under existing 14-day cleanup;
Access and provider restrictions remain; A session is intentionally retained
for the pending same-admin flow. No automatic delete, direct repair, fake scan,
attestation or approval. Rejected/14-day non-approved cleanup evidence remains
separate; full REQ-11/manual preview and production remain blocked.
Status-only validation: docs:check, release:scan, git diff --check. Full runtime
tests/E2E/build/review were deliberately not rerun: no runtime, migration,
dependency or deployed-config change occurred; exact inherited evidence applies.
`rollover_required: no`; `recommended_next_session_mode: High`: D09 has a
known target, postcondition and containment; only workstation facts are pending,
with no unresolved mutation ambiguity.

## Document scenario D08 verified — 2026-09-05T19:02:58Z

Result: **success**. One negative approval-before-AV probe under the owner's complete D01a–D18b scope.
Before: D0 quarantined with no AV attestation or archive. After: valid-CSRF admin approve rejected with 409; D0, quarantine intent, assertions/audit/providers unchanged; only current A session touch.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T19:02:58.256Z: 170 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D08-success-safe.json`,
SHA-256 `7cc60498d1288c0e2e0973b73b80f1fbee55d7a9022324b75e04a2271fd24329`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Real local AV remains pending. One next action:
D09-audited-admin-download-after-workspace-confirmation, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known
target/postcondition/containment and no unresolved ambiguity.

## Document scenario D07b verified — 2026-09-05T19:01:17Z

Result: **success**. One GET A document queue under the owner's complete D01a–D18b scope.
Before: A session active and D0 quarantined. After: D0 appears in admin queue with exact SHA, attestation version and local_av_scan POST form; review form hidden before clean; only current A session touch, document body not read.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T19:01:17.612Z: 170 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D07b-success-safe.json`,
SHA-256 `4139f54df175d7f3ff05a4384fbd798bee3f6b98c32b6666bc46cb8f51664518`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Real local AV remains pending. One next action:
D08-deny-approval-before-AV, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known
target/postcondition/containment and no unresolved ambiguity.

## Document scenario D07a verified — 2026-09-05T18:59:13Z

Result: **success**. One normal A login without redirect follow under the owner's complete D01a–D18b scope.
Before: eight revoked sessions and one quarantined D0. After: one new A admin session version 2; all historical sessions, roles, D0/QD/FD/Q2, audit and providers preserved.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T18:59:13.085Z: 170 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D07a-success-safe.json`,
SHA-256 `739e429b3760823747629f3fd98a8d38644c0520e2b70002a3025b001a044974`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Real local AV remains pending. One next action:
D07b-GET-admin-document-queue, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known
target/postcondition/containment and no unresolved ambiguity.

## Document scenario D06 verified — 2026-09-05T18:56:14Z

Result: **success**. One normal P2 logout under the owner's complete D01a–D18b scope.
Before: one current P2 session with quarantined D0 preserved. After: exact P2 session revoked with one linked logout audit; all eight sessions revoked, D0/QD/FD/Q2 and providers preserved.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T18:56:14.743Z: 167 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D06-success-safe.json`,
SHA-256 `e3a0e25d777c226261958fda35604d1909fa892f928e939d6adbf9d134901f2c`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Real local AV remains pending. One next action:
D07a-normal-A-login-after-private-input, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known
target/postcondition/containment and no unresolved ambiguity.

## Document scenario D05 verified — 2026-09-05T18:54:31Z

Result: **success**. One owner preapproval download denial under the owner's complete D01a–D18b scope.
Before: one quarantined D0 and one active P2 session. After: 404 DOCUMENT_NOT_FOUND without document attachment/body; document/intent/audit/provider state unchanged and only current P2 session touch.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T18:54:31.097Z: 163 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D05-success-safe.json`,
SHA-256 `f83c930b737cd692595f798063d74621aa1e9896f378d504567cd6000b933858`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Real local AV remains pending. One next action:
D06-normal-P2-logout, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known
target/postcondition/containment and no unresolved ambiguity.

## Document scenario D04 verified — 2026-09-05T18:51:25Z

Result: **success**. One upload of one exact synthetic D0 under the owner's complete D01a–D18b scope.
Before: QD and FD preserved, no document or storage intent. After: one quarantined D0 with exact PNG SHA/16954 bytes, random key and immutable 14-day TTL; one linked quarantine intent and assertion, P2/C2/FD scope and upload audit; private EU object metadata matches, no archive link.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T18:50:30.005Z: 163 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D04-success-safe.json`,
SHA-256 `c79cf5d43778b033338b74298e18a3899a482af82a0328a4c53cb8646f95af47`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Real local AV remains pending. One next action:
D05-owner-denial-before-approval, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known
target/postcondition/containment and no unresolved ambiguity.

## Document scenario D03 verified — 2026-09-05T18:47:41Z

Result: **success**. One GET QD upload form under the owner's complete D01a–D18b scope.
Before: QD draft and FD pending_review version 1, no document. After: normal upload form matches QD/FD/C2 and contains CSRF and command key; only current P2 session touch; domain/provider state preserved.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T18:47:41.524Z: 157 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D03-success-safe.json`,
SHA-256 `4b148ec2a2b1a81508ff7c5deb195a7d9f2aa2f7ac9a1d57d17e873eb1251587`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Real local AV remains pending. One next action:
D04-upload-one-D0-to-quarantine, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known
target/postcondition/containment and no unresolved ambiguity.

## Document scenario D02 verified — 2026-09-05T18:43:50Z

Result: **success**. One normal creation of one Nachhilfe Jobcenter draft under the owner's complete D01a–D18b scope.
Before: one Q2 draft, no QD and no funding authorization. After: one new QD draft v1 and FD pending_review v1 owned by P2/C2; creation audit and assertion linked; Q2, C2, roles and providers preserved.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T18:43:26.194Z: 157 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D02-success-safe.json`,
SHA-256 `728d8512218c698c1c444be5a402d0f684b35a038f76e1b00fa1ab4eec24ec18`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Real local AV remains pending. One next action:
D03-GET-QD-upload-form, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known
target/postcondition/containment and no unresolved ambiguity.

## Document scenario D01b verified — 2026-09-05T18:39:40Z

Result: **success**. One GET normal Nachhilfe draft form under the owner's complete D01a–D18b scope.
Before: one active P2 session and no QD/FD. After: form contains server-owned C2, CSRF and command key; only current P2 session touch; domain/provider state unchanged.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T18:39:39.783Z: 148 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D01b-success-safe.json`,
SHA-256 `e2c8710cb5ba73821ca990700de501cc5ae8daab2b49e0c9e675f3bff0cb5587`; one-attempt marker, safe response and before/after D1 retained.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Real local AV remains pending. One next action:
D02-create-one-QD-FD-draft, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known
target/postcondition/containment and no unresolved ambiguity.

## Document scenario D01a verified — 2026-09-05T18:34:52Z

Result: **success**. One normal P2 login without redirect follow under the owner's complete D01a–D18b scope.
Before: 7 revoked historical sessions and no active session. After: exactly one new P2 session version 1; all seven historical sessions, roles, C2, Q2, provider/audit/bootstrap/schema state preserved.
Version fingerprint aba79c9fa0ae, reviewed source 0db38842524ebc146eaa56a9d089e3c3484bf0f3,
account/worker/D1 fingerprints 5dbd04a4763a / 242c1796e930 / ccdeb22bb2a1.
Actual D1 postcondition 2026-09-05T18:33:29.222Z: 114 rows read,
zero writes/changes, changed_db=false. The application request's write is
accounted for separately; the SELECT metadata does not claim no application mutation.
Protected evidence: `tmp/document-phase-07-owner/D01a-success-safe.json`,
SHA-256 `5f02373c41f9b45120a33d42454311719f4c16e7906e8212ce1a45896d0247ed`; one-attempt marker, safe response and before/after D1 retained.
Local reconciliation initially referenced the wrong baseline filename; corrected the ignored helper to read the existing D01a-before-db.json. No login retry or additional application request occurred.

Containment: Access/private R2 and existing roles/data retained; no direct repair,
extra fixture or blind retry. Real local AV remains pending. One next action:
D01b-GET-new-nachhilfe-form, after this docs-only checkpoint. Run docs:check, release:scan and
git diff --check only; exact inherited runtime/E2E/build/review evidence reused
because no runtime/config/schema/dependency changed. Full manual preview and
production remain blocked. `rollover_required: no`;
`recommended_next_session_mode: High`: the next authorized action has known
target/postcondition/containment and no unresolved ambiguity.

## Document scenario permission and preflight — 2026-09-05T18:27:48Z

The owner explicitly approved the entire finite D01a–D18b scenario in the
[manifest](STAGE_13_DOCUMENT_PHASE_MANIFEST.md): normal P2/A/P1 sessions, one
QD/FD fixture, one D0 upload, audited admin download, actual owner local AV,
same-admin hash-bound attestation, separate business review, archive,
owner/foreign download checks and retention/containment. This authorization
persists across the human handoffs; do not request the same permission again.
The completed single-flag deploy scope is consumed and is not reopened.

Fresh read-only preflight 2026-09-05T18:26:34.655Z passed: version fingerprint aba79c9fa0ae
at 100%, exact module/settings/resources/Cron, upload enabled, Access 302,
two distinct private EU R2 and health HEAD 204/no-store/noindex. D1 read
111 rows, wrote 0, changes=0, changed_db=false. Bounded
business/session/provider/audit data is exactly equal to the config deployment
postcondition: users 3, historical sessions 7 all revoked, Q2/C2 preserved,
zero documents/funding/intents; schema 26/pending 0. Local D0 SHA and 16954-byte
size match the immutable fixture contract. This is not an AV result.

Protected evidence: `tmp/document-phase-07-owner/scenario-preflight-safe.json`,
SHA-256 `f065a249b6777e78d4f1bd933394b0c754f002f86f406b3a846868927c3b8fca`. The managed browser initially
contained only about:blank with no credential form. Prepare the ordinary login
page for private owner input; no D01a login or scenario mutation has occurred.

One next atomic action is D01a, a single normal P2 login without redirect
follow, after private Access/credential input. Read-only reconcile and a
docs-only commit must precede D01b. The real local AV handoff and confirmation
of an approved encrypted unsynced quarantine workspace remain prerequisites
before D09/D12. They are missing workstation/scan facts, not new scenario scope.

Containment preserves Access, private buckets and exact evidence. No direct
SQL/R2 repair, fixture duplication, provider send or destructive cleanup is
authorized. Full REQ-11 rejected/14-day outcomes, full manual preview and
production remain blocked. For this docs-only change run docs:check,
release:scan and git diff --check; inherited exact full suite/E2E/build/review
evidence is reused because no runtime/config/migration/dependency changed.
`rollover_required: no`; `recommended_next_session_mode: High`: the finite
flow is authorized with known target and containment; private input is pending.

## Document upload config deploy verified — 2026-09-05T18:12:39Z

Result: **success**. Executed the owner's approved single strict preview deploy
from exact candidate `0db38842524ebc146eaa56a9d089e3c3484bf0f3` with unchanged
build/module SHA-256 `eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b`.
Only DOCUMENT_UPLOAD_ENABLED changed false → true. Before-version fingerprint
`14841fbf75b2` → `aba79c9fa0ae`; one active version at 100%.
CLI exit 0, returned version matched the independent remote
read. The permission is consumed; no retry or rollback was necessary.

Fresh actual postcondition 2026-09-05T18:12:04.158Z: same module, runtime, other vars/bindings,
script settings/subdomain/Cron; Access anonymous 302; different EU private R2,
r2.dev disabled and no custom domains. Health HEAD 204/no-store/noindex. Nine
bounded D1 SELECTs read 111 rows and wrote 0, changes=0,
changed_db=false. All selected before/after business/session/provider/audit
state is identical: 3 users, 7 revoked sessions, one existing Q2 draft, zero
documents/funding authorizations/storage intents/offers/artifacts/Telegram.
Schema remains through 0026, pending 0. This proves config deployment only;
no upload, local AV, business review or document ownership flow was executed.

Root and detached-source Git-ignored preview config now match the verified live
single-flag setting. Full exact target/version/config records remain protected.
Evidence: `tmp/document-phase-07-owner/deploy-result-safe.json`, SHA-256
`9a0f9257e56c6fa80cefb8c6ee774bc4dbd493dd84c084be2589096d2292d097`; deploy-attempt, command response, raw logs,
immediate before and independent after control/D1/R2/health records retained in
the same owner-only directory. No secrets, IDs or document body were printed.

Containment: Access and provider restrictions preserved; no document commands
without separate scenario scope. Approved exact prior version remains recorded
as recovery evidence; no revert is needed for this successful phase. Physical
object/database repair and destructive cleanup remain excluded.

Validation: inherited exact baseline full 580-pass/1 expected Windows skip,
23 E2E/build evidence and scoped independent review 8/8; local strict dry-run
already proved exact module, fresh remote preflight/postconditions passed.
For this status-only checkpoint run docs:check, release:scan, git diff --check.
No runtime/migration/dependency change justifies rerunning full test/E2E/build
or independent review. Production readiness checklist is unchanged.

**One next action:** obtain separate permission for the prepared finite document
scenario D01a–D18b in the [manifest](STAGE_13_DOCUMENT_PHASE_MANIFEST.md), including
normal sessions, one QD/FD, one D0 upload, audited download, real owner local AV,
same-admin hash attestation, separate business decision, approved owner/foreign
download checks and retention/containment intent. Full REQ-11 rejected/14-day
cleanup outcomes remain separately required. Full manual preview and production
remain **blocked**. `rollover_required: no`;
`recommended_next_session_mode: High`: bounded routes/postconditions/containment
are known; the human AV handoff is explicit and there is no unresolved ambiguity.

## Document config permission and fresh preflight — 2026-09-05T18:10:02Z

The owner explicitly approved one preview deployment of the identical bundle
with only DOCUMENT_UPLOAD_ENABLED false → true, read-only verification and
conditional rollback of this own change to the saved prior version. No repeated
permission is needed for that operation. The separate document scenario,
user sessions, uploads, attestation, business decisions and provider sends are
not included in this approval.

Fresh preflight 2026-09-05T18:07:49.629Z: before-version fingerprint 14841fbf75b2 at 100%,
exact module/settings/resources/Cron, Access 302 and private distinct EU R2;
health HEAD 204/no-store/noindex. Nine bounded D1 SELECTs read 111
rows, wrote zero, changes=0, changed_db=false; schema remains 26/pending 0,
users 3, sessions 7 all revoked, Q2 unchanged, documents/funding/intents zero.
Business/session/provider/audit baseline is pinned for exact after comparison.
Protected evidence: `tmp/document-phase-07-owner/deploy-preflight-safe.json`,
SHA-256 `e5f261c68ba54830ca0063bd3d272678b6dac44be6a414e0ab693668c5d7053e`.

No remote mutation yet. Only next action is one prepared strict deploy after
an immediate exact version/D1 check. Containment retains Access, private
artifacts and immutable evidence; no blind retry or direct SQL. For this
permission-only checkpoint: docs:check, release:scan and git diff --check;
the unchanged baseline full test/E2E/build/review evidence is inherited.
`rollover_required: no`; `recommended_next_session_mode: High`: known
authorized target/procedure/postcondition/rollback, no unresolved ambiguity.

## Prompt 07 read-only preparation complete — 2026-09-05T17:51:43Z

Result: **success, local/read-only preparation**. [Bounded phase manifest](STAGE_13_DOCUMENT_PHASE_MANIFEST.md)
and the private exact config proposal are ready. Prompt 07 expressly excludes
flag/deploy mutation and requires separate document-scenario scope; neither
permission has been granted. No remote mutation or authenticated app request
was attempted. The actual document lifecycle has not started.

Fresh control at 2026-09-05T17:37:20.629Z confirms the same version fingerprint
`14841fbf75b2` at 100%, exact deployed candidate
`0db38842524ebc146eaa56a9d089e3c3484bf0f3`, module SHA-256
`eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b`,
settings/bindings/Cron and Access 302 as final 06B. D1 inventory at 2026-09-05T17:37:27.347Z
read 16 rows, wrote 0, changes=0, changed_db=false. A/P1/P2 remain active
verified admin/parent/parent at versions 2/1/1, all sessions revoked. C2 and Q2
remain owned by P2; Q2 is individual/self-pay draft v1. Funding authorizations,
documents and storage intents are all zero.

Both different R2 buckets are EU Standard/private: quarantine fingerprint
`442dca1871ce`, archive `3996cebdabb0`; r2.dev disabled, custom domains 0.
Lifecycle contains only multipart-abort, no object-delete rules; locks 0.
The official metadata list passed with exact random-key prefix/per_page=2 and
empty results. HEAD returned 405 and is excluded. A local parser initially
required optional result_info; the recorded successful empty response was
reused after checking the official schema. There is no remote write ambiguity.

Prepared exactly one config delta: DOCUMENT_UPLOAD_ENABLED false → true.
Use protected `config-plan-final.json`: strict Wrangler deploy of the unchanged
reviewed detached source/build. Local --dry-run passed with exact module SHA,
all build files preserved, source config restored and root config unchanged.
The initial local PATCH proposal is superseded without dispatch, because the
06B history already records that method's rejection and successful strict-deploy
alternative. Exact prior-version rollback at 100% is pinned in protected state.

Prepared one synthetic PNG, 16954 bytes, SHA-256
`827fbc61bdd6ec453cccdbf2a80f1b1aa036069ca246182ebf4e86659afffd81`; canonical upload validator and planned request schema
passed. No Office/upstream input or client data was read. Q2 cannot host funding
uploads; the later bounded scenario creates one new Nachhilfe/Jobcenter QD/FD
for existing C2 through the ordinary parent route. The owner's real local AV
scan after forced download and separate business decision remain mandatory.
One approved D0 cannot close REQ-11's separate rejected/14-day cleanup outcomes.

Protected ignored evidence under `tmp/document-phase-07-owner/`:

| Record | SHA-256 |
| --- | --- |
| inventory-safe.json | 9975eec75a00fc9645f5341da2c5d0cc852963dd936012bcbbe5146b9ceaa386 |
| local-validation-safe.json | 420f7eaab05730bc2f6879de26a6611b1294dce42138eff29a9acbe4462f3ba8 |
| config-plan-final-safe.json | 6b07f93795a638f29a8e91e8df946de9d7ef69cf4c51e2daf628e1b248f0242f |
| metadata-transport-safe.json | fe7fa95b61abae385c944a9d8129b7d37edf05aeb052c3156d7b02331c36d91c |

Affected surface: operational documentation and ignored operator preparation
only. Validation: scoped remote reads, canonical fixture/request validation,
strict exact-bundle dry-run, then docs:check, release:scan and git diff --check.
Reuse exact `0db38842524ebc146eaa56a9d089e3c3484bf0f3` full 580 pass/1 expected
Windows skip, 23 E2E and build evidence; reviewed
`438a51399ac5f58b428b624c52ca2cbbc059ae9c` focused independent review 8/8.
Full runtime suite/E2E/build and another independent review are intentionally
not repeated: no changed runtime/migration/dependency or live config. No new
proven candidate P0/P1. Production readiness checklist is unchanged.

Containment: preserve Access, flag=false, original fixtures and immutable
evidence; no direct SQL/object repair, bootstrap replay or destructive cleanup.
**One next action:** obtain the owner's separate permission for the prepared
single-flag same-bundle preview deploy and conditional own-version rollback.
Document execution remains separately gated. Full manual preview and production
remain **blocked**. `rollover_required: no`;
`recommended_next_session_mode: High`: planned config deployment has known
target, postcondition and rollback, without unresolved ambiguity.

## Prompt 06 complete: bounded live role isolation closeout — 2026-09-04T16:28:48Z

**Prompt 06: complete** under the explicit finite Prompt 06B scope.

| Проверка | Результат | Evidence |
| --- | --- | --- |
| One-shot bootstrap и seals | PASS; consumed, chain 1/1/1, seals 6; replay не выполнялся | Historical bootstrap checkpoint и final sealed-state comparison |
| A/P1/P2 и прежние receipts | PASS; admin + два verified parents, разные FamilyID | Before-registration baseline и final-closeout |
| Parent → admin | PASS; A02/A03 HTTP 403 FORBIDDEN | p1-a02-r1, p1-a03 |
| Admin → parent | PASS; A10/A11/A13 HTTP 403 FORBIDDEN | a-a10, a-a11, a-a13 |
| CSRF valid/missing/wrong | PASS; failure 400/403/403, correct Origin | p1-a05, p1-a06, p1-a07 |
| C2/Q2 owner и cross-owner | PASS; owner 200; foreign absent/404; fields/version/audit unchanged | p2-child, p2-draft, p1-b02, p1-b03-observed, p1-b04, p1-b05 |
| Побочные эффекты и logout | PASS; только разрешённые дельты, active sessions 0 | p2-logout, p1-a08, a-a14, final-closeout |
| Финальная сверка | PASS; exact bundle/config/Access/schema и ограниченные инварианты | final-closeout-verified-safe.json |

Final state: A is active verified admin/version 2; P1/P2 are active verified
parents/version 1, three distinct portal FamilyIDs. One portal C2 and one
individual/self-pay Q2 remain; Q2 is draft/version 1 and unchanged since creation.
Seven sessions are revoked: six normal logout and one historical bootstrap role
change. The package added exactly one normal login/logout for each A/P1/P2.
Verification/welcome sent receipt totals are 3/3; P2 added only one of each,
one delivery attempt each. Original A/P1 state/receipts/revocations and bootstrap
chain/seals are preserved. Legacy children remain 1703 unclaimed; no funding
authorization, document, contract, R2 intent, Telegram or unrelated provider
effect was introduced. Final audit delta: {"auth.email_verified":1,"auth.registration_created":1,"auth.session_revoked":3,"child.portal_created":1,"individual_request.created":1}.

Target fingerprints: account 5dbd04a4763a, Worker 242c1796e930, host 88ed782ba25a,
D1 ccdeb22bb2a1. Version 14841fbf75b2 at 100%, three recipient hashes, other
bindings/settings preserved. Worker module SHA-256
`eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b`
is unchanged. Access remains enforced; migrations 26 through 0026, pending 0.

Protected evidence: `tmp/role-isolation-06b-owner/execution/final-closeout-verified-safe.json`,
SHA-256 `9200ca6c6b258374d0530d733e1bdd66db4aa0282c402df7386e3536fe380996`; 25 successful bounded operation records plus exact
control/final D1/integrity evidence. Final SELECTs read 4492 rows
and wrote zero. Initial config PATCH rejection, A02 local no-request error and
B03 JSON-parser mismatch were reconciled; failed evidence is retained and no
result remains ambiguous. The A login identity precheck also blocked a local
mismatched input before submission. All completed remote operations retain
individual reconciliation/docs-only checkpoints.

Validation: safe HTTP/SSR/action-envelope observations, canonical B04/B05 payload
validation, exact per-case D1 deltas, final bounded controls, docs:check,
release:scan, git diff --check. No runtime/schema/dependency changes: reuse
`0db38842524ebc146eaa56a9d089e3c3484bf0f3` full 580 pass/1 expected Windows skip,
23 E2E and build evidence; reviewed candidate
`438a51399ac5f58b428b624c52ca2cbbc059ae9c` focused reviewer 8/8. Full suite,
build and another independent review were intentionally not repeated.
Production readiness ledger is unchanged because no production gate changed.

Containment: keep Access, P2/C2/Q2 and immutable evidence; no bootstrap replay,
cleanup deletion or direct SQL repair. Document/contract/message/price owner
checks remain for their real later flows and are not claimed live-passed here.
Full manual preview and production remain **blocked**. One next action:
read-only document-phase manifest under roadmap phase 5; further config or
remote document operations require their separate bounded scope.
`rollover_required: no`; `recommended_next_session_mode: Medium`: next work
is read-only preparation with no unresolved ambiguity. Use High for a subsequently
authorized known deployment/execution phase.


## Prompt 06B a-a14: successful atomic checkpoint — 2026-09-04T16:27:02Z

Result: **success**. Action `logout` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"A","case":"a-a14","ui":"A14_admin_normal_logout_redirect_login","httpStatus":200,"actionStatus":303,"sessionEffect":"current_session_revoked_logout","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {"auth.session_revoked":1}. Read-only reconciliation used
1055 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/a-a14-verified-safe.json`,
SHA-256 `8e547e00a1c6a67bed53eb67e55768d566ca72ce56c41d93e053d407381f7b8c`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 7/0 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `final-bounded-readonly-closeout`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: Medium`: next work is read-only final reconciliation and documentation.


## Prompt 06B a-a13: successful atomic checkpoint — 2026-09-04T16:25:35Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"A","case":"a-a13","ui":"a-a13_role_denial_before_validation","httpStatus":403,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1050 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/a-a13-verified-safe.json`,
SHA-256 `cec062320d088950577f3091c1b99413420c015d4f2e762a595bc4ba9eb9619a`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 7/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A14-admin-normal-logout`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B a-a12: successful atomic checkpoint — 2026-09-04T16:24:43Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"A","case":"a-a12","ui":"a-a12_shared_security_home_correct","httpStatus":200,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1050 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/a-a12-verified-safe.json`,
SHA-256 `ea1df7f3646e1ac9f04a4ae58b4886434e08c44a8ba4c087d970a33f5e87dbbe`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 7/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A13-admin-parent-POST-denial`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B a-a11: successful atomic checkpoint — 2026-09-04T16:23:52Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"A","case":"a-a11","ui":"a-a11_expected_denial","httpStatus":403,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1050 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/a-a11-verified-safe.json`,
SHA-256 `0b4732e16d4ce3d31005f718f68c8d0d108fc8cfbd704fc4909c603437538d5a`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 7/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A12-admin-security-page`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B a-a10: successful atomic checkpoint — 2026-09-04T16:23:07Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"A","case":"a-a10","ui":"a-a10_expected_denial","httpStatus":403,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1050 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/a-a10-verified-safe.json`,
SHA-256 `3ebf60bab677fa844589ec190853b809e5757286116b6db961332d0514f566b6`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 7/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A11-admin-contract-route-denial`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B a-a09: successful atomic checkpoint — 2026-09-04T16:22:09Z

Result: **success**. Action `login` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"A","case":"a-a09","ui":"A09_admin_login_redirect_admin_200","httpStatus":303,"sessionEffect":"one_new_session","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1050 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/a-a09-verified-safe.json`,
SHA-256 `e93f5ad3b78101ba5aeace4a7128cc76cbf97688ac7a7a01e3641012af118577`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 7/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A10-admin-cabinet-denial`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B P1 phase complete, private A login next — 2026-09-04T16:13:38Z

A01 login, A02/A03 admin denials, A04 shared security page, A05 valid-CSRF
validation control and A06/A07 missing/wrong-CSRF denials passed. B02 omitted
foreign C2/Q2 from P1 cabinet; B03 returned 404 REQUEST_NOT_FOUND; B04/B05
rejected real foreign C2/Q2 writes with failure 404, valid CSRF/Origin and
canonically valid original payload. Full C2/Q2 fields, version 1, ownership,
timestamps, actions/assertions and business audit remained unchanged after
each probe. A08 normal logout passed, checkpoint `9d0253c`. Six sessions are
revoked (five logout, one historical role change); no active app sessions.

Two local transport observations are resolved: A02 first guard failed before
any HTTP because URL was unavailable in the browser VM (`d479a09`, corrected
A02 `63ded0d`); B03 initially expected JSON but its normal SvelteKit page-load
returned SSR HTML. The original captured 404/error object was verified without
a second HTTP request, old failed-parser evidence retained (`c22217d`).
These did not change runtime code or require a new deploy. Remaining JSON
actions were decoded with the installed official devalue parser.

Only next action: A09 normal login after owner enters A/slot-1 credentials
privately in the preserved managed browser. Continue A10/A11 parent-route
403 denials, A12 shared security page, A13 parent POST middleware denial,
A14 normal logout, then bounded final closeout. Each mutation/touch keeps its
own reconciliation and docs-only commit. All three users/FamilyIDs, bootstrap
seals, receipts and provider state remain intact; one C2 and one draft Q2 retained.
Prompt 06 remains partial until A09–A14 and final reconciliation pass. No full
manual-preview/production gate change. Checks: per-case HTTP/D1 evidence and
docs:check/release:scan/git diff --check; full runtime/E2E/build evidence inherited.
`rollover_required: no`; `recommended_next_session_mode: High`: exact
remaining scope and postconditions known; no unresolved P0/P1 or ambiguity.


## Prompt 06B p1-a08: successful atomic checkpoint — 2026-09-04T16:12:25Z

Result: **success**. Action `logout` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-a08","ui":"A08_P1_normal_logout_redirect_login","httpStatus":200,"actionStatus":303,"sessionEffect":"current_session_revoked_logout","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {"auth.session_revoked":1}. Read-only reconciliation used
1048 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-a08-verified-safe.json`,
SHA-256 `c0acf63adfcc6e25bff66f54537b19053547b05e67a43b966d2c163bc81d9038`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/0 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A09-admin-normal-login`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p1-b05: successful atomic checkpoint — 2026-09-04T16:11:16Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-b05","ui":"p1-b05_expected_action_failure","httpStatus":200,"actionStatus":404,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1043 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-b05-verified-safe.json`,
SHA-256 `9b86c03431cb10ad1ff9797fcc0b76525cf83091a0bb9b46acb0dbffaad7ca8d`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A08-P1-normal-logout`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p1-b04: successful atomic checkpoint — 2026-09-04T16:10:21Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-b04","ui":"p1-b04_expected_action_failure","httpStatus":200,"actionStatus":404,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1043 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-b04-verified-safe.json`,
SHA-256 `ef842fcdb203de9d12c6fa7789ff3ffecb4db628aa7b87fcd57b5c0f10f25ed3`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `B05-P1-foreign-request-save-denial`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p1-b03-observed: successful atomic checkpoint — 2026-09-04T16:09:01Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-b03-observed","ui":"B03_original_SSR_response_404_REQUEST_NOT_FOUND","httpStatus":404,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1043 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-b03-observed-verified-safe.json`,
SHA-256 `90ff10414ad54fa35687806a5289a4efacf30e093a635de2b67fefb555116130`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `B04-P1-foreign-child-update-denial`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p1-b02: successful atomic checkpoint — 2026-09-04T16:04:58Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-b02","ui":"p1-b02_foreign_C2_Q2_absent","httpStatus":200,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1043 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-b02-verified-safe.json`,
SHA-256 `99b8f460eda7d5792b36fdbf8af67939cf259d4b1d836586b97b5d0b604aced7`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `B03-P1-foreign-request-read`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p1-a07: successful atomic checkpoint — 2026-09-04T16:04:07Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-a07","ui":"p1-a07_expected_action_failure","httpStatus":200,"actionStatus":403,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1043 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-a07-verified-safe.json`,
SHA-256 `2d0c655bc4d0c40c2c02e13d0d935907d77017e754f909114e2588c18596951b`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `B02-P1-foreign-fixtures-absent`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p1-a06: successful atomic checkpoint — 2026-09-04T16:03:06Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-a06","ui":"p1-a06_expected_action_failure","httpStatus":200,"actionStatus":403,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1043 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-a06-verified-safe.json`,
SHA-256 `42fbe9cef20992d5872c3a3edbd40cf959b5aac826c4d31b578de94b2f6737fe`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A07-P1-wrong-CSRF`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p1-a05: successful atomic checkpoint — 2026-09-04T16:02:18Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-a05","ui":"p1-a05_expected_action_failure","httpStatus":200,"actionStatus":400,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1043 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-a05-verified-safe.json`,
SHA-256 `f6b8552256b14cc5a0023b49ec554f55dcb0512fb033d28cd52c891737548408`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A06-P1-missing-CSRF`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p1-a04: successful atomic checkpoint — 2026-09-04T16:01:25Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-a04","ui":"p1-a04_shared_security_home_correct","httpStatus":200,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1043 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-a04-verified-safe.json`,
SHA-256 `42a43777da3aff20a578d9f96a7bba233f1d481a79f638483a1920a98948ac01`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A05-P1-valid-CSRF-control`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p1-a03: successful atomic checkpoint — 2026-09-04T16:00:04Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-a03","ui":"p1-a03_expected_denial","httpStatus":403,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1043 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-a03-verified-safe.json`,
SHA-256 `292e7219dd784db20fbd09372b8d616e2447e43f4d76ae51fac8c278bb79f398`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A04-P1-security-page`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p1-a02-r1: successful atomic checkpoint — 2026-09-04T15:59:05Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-a02-r1","ui":"p1-a02_expected_denial","httpStatus":403,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1043 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-a02-r1-verified-safe.json`,
SHA-256 `c8b1f4779dba81edd5c3ab10d5ea5e73c70d3eebdb8245aa95b8cfc7974ee99a`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A03-P1-admin-users-denial`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B A02 local transport precondition failed before HTTP — 2026-09-04T15:57:50Z

Result: **failed, confirmed no HTTP request and no remote change**. The browser
helper referenced the unavailable global URL constructor in its initial origin
guard. The guarded catch ran before fetch. Request inventory confirms zero
GET /admin requests; the page remains P1 cabinet at the exact origin. Bounded
read-only snapshots before/after match exactly in every selected field except
observation time, including session last_seen, C2/Q2, roles, bootstrap and providers.
This is a local operator-helper defect, not an application authorization failure.

Protected evidence: `tmp/role-isolation-06b-owner/execution/p1-a02-no-request-safe.json`,
SHA-256 `59cb9eec9f2f3500c230708af7351ee0612c952379efc74202617df27ad7e01b`. The original attempt/evidence is retained; no blind
retry occurred. The helper guard now compares the origin string using supported
VM operations. No runtime or deployed code changed. A02 has not passed and the
phase is not promoted. One next action: `A02-P1-admin-denial-corrected-transport`
under the same verified P1 session, followed by its normal reconciliation/commit.

Containment: Access and all business data remain intact; preserve the active P1
session and use the corrected one-request helper. Checks: helper syntax and
no-network capability proof, docs:check, release:scan, git diff --check.
Full runtime suite is inherited. `rollover_required: no`;
`recommended_next_session_mode: High`: confirmed no-write local error, known
correction and postcondition; no unresolved ambiguity or P0/P1 runtime finding.


## Prompt 06B p1-a01: successful atomic checkpoint — 2026-09-04T15:54:24Z

Result: **success**. Action `login` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P1","case":"p1-a01","ui":"A01_P1_login_redirect_cabinet_200","httpStatus":303,"sessionEffect":"one_new_session","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1043 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p1-a01-verified-safe.json`,
SHA-256 `36d9ae55e339eb9efa9e04196dd2fba555b3de0bbd8bb0d775a0ea1071fd699b`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 6/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A02-P1-admin-denial`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B P2 fixture phase complete — 2026-09-04T15:50:24Z

One normal P2 login passed (`0af22f9`), one portal child C2 was created
(`740d6eb`), the individual form load passed (`7a8f828`), and one self-pay
individual draft Q2 was created (`1e8e4e1`). The normal creation response/load
provided B01 owner controls: C2 is visible in the P2 cabinet and Q2 returns
200/draft/version 1 with the matching C2. The subsequent normal logout passed
with one matching audit. Five sessions are now revoked (four logout, one historical
role change); all old sessions, A/P1 identities/roles/families, bootstrap seals,
registration receipts and provider state are preserved. No fixture submit/send.

Fresh control at 15:41:27Z proved current Worker fingerprint 14841fbf75b2 at 100%,
three recipients, exact other bindings/runtime, matching bundle SHA-256 and
anonymous Access redirect. An earlier read-only control ended with a sanitized
technical error; a fresh complete read-only control succeeded before login.
There was no mutation/retry ambiguity. Exact protected evidence is under
`tmp/role-isolation-06b-owner/execution/`; completed attempts must not be replayed.

Only next action is A01, normal P1 login after private owner credential input.
Then execute A02–A07, B02–B05, A08; A09–A14; final bounded reconciliation.
Each request/touch must retain its own read-only postcondition, active-state
update, docs:check/release:scan/git diff --check and docs-only commit. C2/Q2
remain fixtures. Prompt 06 is partial; full manual preview and production gates
remain blocked. `rollover_required: no`; `recommended_next_session_mode: High`: known authorized operations, no unresolved P0/P1 or ambiguous outcome.


## Prompt 06B p2-logout: successful atomic checkpoint — 2026-09-04T15:49:04Z

Result: **success**. Action `logout` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P2","case":"p2-logout","ui":"P2_normal_logout_redirect_login","httpStatus":200,"actionStatus":303,"sessionEffect":"current_session_revoked_logout","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"none"}.
Audit delta: {"auth.session_revoked":1}. Read-only reconciliation used
1041 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p2-logout-verified-safe.json`,
SHA-256 `66b0149dee4e18d28e861f835cea53baabc3abd8843d025e8ae82d0ad157c83d`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 5/0 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `A01-P1-login`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p2-draft: successful atomic checkpoint — 2026-09-04T15:47:46Z

Result: **success**. Action `draft` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P2","case":"p2-draft","ui":"Q2_created_owner_detail_200_draft_B01_request","httpStatus":303,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":1,"requestVersion":1,"businessChangedOnly":"one_Q2_draft"}.
Audit delta: {"individual_request.created":1}. Read-only reconciliation used
1036 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p2-draft-verified-safe.json`,
SHA-256 `c306ed83c0f13fa25fcabc005c6964598a173bd3f38c32558a83841f79346673`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 5/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 1.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `logout-P2`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p2-new-form: successful atomic checkpoint — 2026-09-04T15:46:11Z

Result: **success**. Action `probe` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P2","case":"p2-new-form","ui":"P2_individual_new_form_ready_one_C2","httpStatus":200,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":0,"requestVersion":null,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1031 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p2-new-form-verified-safe.json`,
SHA-256 `f2914942c008595f2e0167215bdac06cb852a6a755d4ae546b6cdd95a63cab88`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 5/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 0.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `create-Q2`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p2-child: successful atomic checkpoint — 2026-09-04T15:44:56Z

Result: **success**. Action `child` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P2","case":"p2-child","ui":"C2_created_owner_cabinet_visible_B01_child","httpStatus":200,"sessionEffect":"current_session_touch_only","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":1,"requests":0,"requestVersion":null,"businessChangedOnly":"one_C2"}.
Audit delta: {"child.portal_created":1}. Read-only reconciliation used
1031 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p2-child-verified-safe.json`,
SHA-256 `39cd2dd655fa95707332bc0606358c997b3b34b1d7cb53385a7618d37b614362`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 5/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 1, requests 0.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `load-Q2-form`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B p2-login: successful atomic checkpoint — 2026-09-04T15:42:58Z

Result: **success**. Action `login` passed the exact protected before/after
verifier. Safe postcondition: {"actor":"P2","case":"p2-login","ui":"P2_login_redirect_cabinet_200","httpStatus":303,"sessionEffect":"one_new_session","oldSessionsPreserved":true,"rolesFamiliesReceiptsBootstrapProvidersPreserved":true,"portalChildren":0,"requests":0,"requestVersion":null,"businessChangedOnly":"none"}.
Audit delta: {}. Read-only reconciliation used
1026 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/p2-login-verified-safe.json`,
SHA-256 `6a15ca9ca0ed22cc116de5aa2dbec2e208874b624f2f7c2241f9b6e934ef3946`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 5/1 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 0, requests 0.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `create-C2`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B verification complete: private P2 login handoff — 2026-09-04T15:12:55Z

The owner completed Access and privately filled the P2 registration form.
One normal registration and its single terminal verification delivery passed
(`ed9c981`). One normal verification, portal family allocation/receipt and
single terminal welcome passed (`0596402`). All three accounts are now verified
with separate portal families, one admin and two parents. All four historical
sessions remain revoked; no new portal login/session has been created.

The preserved managed browser is on the ordinary login form. Only next action:
owner enters P2 email/password privately and reports readiness, then submit
once and reconcile/checkpoint before C2. Private browser sandbox does not
support reading the protected recipient record directly (ordinary dynamic
import was unavailable); no alternate credential extraction was attempted.
Official devalue parser from the installed dependency is installed in this
temporary browser context and passed a no-network decode proof for later
JSON action checks. No live role/CSRF/owner probes have run yet.

Continue the authorized sequence after P2 login: C2, new-request form load, Q2
draft, owner positive controls, P2 logout, P1 A/B cases and logout, A cases and
logout, final bounded closeout. Every request that touches a session receives
its own reconciliation and docs-only checkpoint. Do not repeat registration,
verification, welcome, bootstrap or config operations. Prompt 06 is partial;
full manual preview and production are still blocked. No unresolved P0/P1 or
ambiguous mutation. `rollover_required: no`;
`recommended_next_session_mode: High`: finite next operations remain authorized
with known target/postconditions; the only immediate dependency is private input.


## Prompt 06B verification-terminal: successful atomic checkpoint — 2026-09-04T15:07:30Z

Result: **success**. Action `verification` passed the exact protected before/after
verifier. Safe postcondition: {"users":3,"verifiedUsers":3,"distinctPortalFamilies":3,"P2role":"parent","P2sessionVersion":1,"newVerificationCommits":1,"newFinalizationReceipts":1,"newWelcomeDeliveries":1,"deliveryAttempts":1,"providerReceipt":true,"oldUsersAndReceiptsUnchanged":true,"sessionsUnchanged":true,"bootstrapUnchanged":true}.
Audit delta: {"auth.email_verified":1}. Read-only reconciliation used
1006 rows, wrote zero, changed_db=false. A/P1 roles/FamilyIDs, historical
revocations, sealed bootstrap and unrelated business/provider state are preserved
as required by this case. No blind retry or direct repair.

Evidence: `tmp/role-isolation-06b-owner/execution/verification-terminal-verified-safe.json`,
SHA-256 `6891e7af2b73aef741d328b704fc37b043b558f4d34ef02f59ec2987cdc7f510`; paired D1 snapshots remain owner-only and ignored.
Current totals: three users (1 admin, 2 parents),
3 verified, 3 distinct assigned families;
sessions 4/0 total/nonrevoked;
verification/welcome sent receipts 3/3;
portal children 0, requests 0.
Prompt 06 remains partial until its remaining live cases and final logout pass.

Only next atomic action: `normal-P2-login`, already within the authorized package.
Private credential/link input stays in the browser. Existing exact Worker/code,
Access and rollback containment continue unchanged. Checks for this status-only
commit: docs:check, release:scan, git diff --check; helper syntax/affected
postcondition as needed. Full runtime/E2E/build and reviewer gates are inherited
from the unchanged candidates above. No unresolved P0/P1 or ambiguous result.
`rollover_required: no`; `recommended_next_session_mode: High`: known next
operation, target and postcondition.


## Prompt 06B P2 registration and terminal verification delivery — 2026-09-04T15:01:04Z

Result: **success**. One ordinary browser form submission returned HTTP 200
with the registration-accepted message. The owner entered the selected address
and password privately; email hash matched the protected recipient record,
synthetic first/last names matched the planned values, privacy was checked and
Turnstile was ready. The password was never returned or saved by the agent.
The native POST had literal null Origin with same-origin/navigate/document
Fetch Metadata, the explicitly supported AUTH-06 native-form path; this is not
the exact-Origin control required for later CSRF probes.

Immediate SELECT reconciliation found one unverified active P2 parent, one new
privacy receipt/token and one pending verification outbox item. One bounded read
after the next scheduled email cycle confirmed sent, one attempt, provider
receipt and timestamp, no error. No resend or repeat registration occurred.
A/P1 and their roles/versions/FamilyIDs, all four revoked sessions, original
registration/token/delivery/privacy records and sealed bootstrap are unchanged.
Bootstrap control/action/assertion/audit remains consumed 1/1/1 with six seals;
its aggregate users counter is now three, which is expected. No child/request,
other provider, storage or contract write. The sole audit delta is
auth.registration_created +1. P2 is unverified, has no current FamilyID and
no session. Verification/welcome delivery totals are now 3/2.

Evidence: `tmp/role-isolation-06b-owner/execution/registration-terminal-verified-safe.json`,
SHA-256 `b281b1b728ad34fecc3fdf81e81e8e85e1e71e2403fc5e0fe0f9a1dbc3c43e04`; before/immediate/terminal snapshots and one-attempt
marker in the same owner-only ignored directory. Terminal read used 988
rows, wrote zero, changed_db=false throughout. Existing Worker/config checkpoint
remains exact; resumed controls confirmed three recipients and no other drift.

Next single action: the owner opens the current verification link privately in
the preserved managed browser, then one normal confirmation. Its automatic
welcome delivery is already expressly authorized. Do not resend, replay, log
the link/token, log in or create C2/Q2 before its terminal postcondition/checkpoint.
Prompt 06 remains partial; A/B live denials are not yet run.

Validation: helper syntax, recipient digest/form checks, live response and
exact registration/delivery/preservation assertions pass. This status-only commit
runs docs:check, release:scan and git diff --check; full runtime/E2E/build/reviewer
gates remain inherited. No unresolved P0/P1 or ambiguous registration.
`rollover_required: no`; `recommended_next_session_mode: High`: known target
and next verification/welcome procedure, private owner link handoff required.


## Prompt 06B private browser handoff — 2026-09-04T14:50:07Z

Prompt 06 remains **partial**. The whole finite 06B scope is authorized; no new
permission is requested. Same-bundle allowlist delivery succeeded and its required
postcondition/docs-only checkpoint is commit `2010882`. Initial PATCH rejection
was separately reconciled as no change and checkpointed in `1e4c831`. No blind
retry, rollback, bootstrap replay or runtime candidate change occurred.

The managed Playwright browser context has one preserved tab, index 0. Navigation
to the exact preview registration route reached Cloudflare Access. Inspection
confirmed Access handoff pending, registration form absent. No portal credentials,
registration POST, verification, login, logout, C2/Q2 fixture or authenticated
probe has been attempted. The owner must complete Access privately in this tab
and report readiness; passwords/OTP/verification links must not enter chat or
evidence. Browser fetch/request transports are available; live authenticated
transport/session/CSRF proof must still be established with the first normal
owner-created session before probes. Keep this context; do not switch profiles
or export cookies. Owner Access authentication is a prerequisite, not a new
business permission or a candidate defect.

| Closeout requirement | Evidence/status at handoff |
| --- | --- |
| Bootstrap one-shot and seals | PASS inherited chain plus fresh consumed 1/1/1, six seals |
| A/P1 preserved | PASS verified active admin/parent, versions 2/1; four old sessions revoked |
| One recipient append, same code/settings | PASS live unchanged bundle, three recipients, same other settings, Access enforced |
| P2 and its verification/welcome | NOT ATTEMPTED, private Access login required first |
| C2/Q2 and owner positive control | NOT ATTEMPTED |
| Live role, CSRF, existing-object ownership denials | NOT ATTEMPTED |
| New session logout | No new portal sessions created yet |

Continue after owner readiness from P2 registration, not bootstrap/config setup.
Do not rerun historical helpers or the one-attempt PATCH/deploy helpers. Fresh
controls, if stale, use `node tmp/role-06b-ops.cjs control <unique-label>` and
`node tmp/role-06b-ops.cjs snapshot <unique-label>`; the old preflight mode
intentionally requires the before-config baseline and must not be reused after
this change. Current protected normalized config is
`tmp/role-isolation-06b-owner/execution/same-bundle-config-normalized.json`.
The resumed object snapshots use the owner index, avoiding a repeated full
legacy-child scan. Any new remote operation still needs its individual
reconciliation and docs-only commit.

Validation for the boundary: helper syntax, docs:check, release:scan and
git diff --check. Full check/Vitest/E2E/build and independent review are inherited
from the pinned unchanged gates; strict config dry-run and live byte equality
were run for this config delivery. No unresolved P0/P1 or ambiguous remote
mutation. Full manual preview and production remain blocked.
`rollover_required: no`; `recommended_next_session_mode: High`: continue
the already authorized package after private owner input with known target,
postconditions and containment.


## Prompt 06B allowlist mutation checkpoint — 2026-09-04T14:46:41Z

Result: **success**. One authorized standard Wrangler deployment of the same reviewed bundle changed only
PREVIEW_EMAIL_RECIPIENT_HASHES from two to three entries, preserving the two
original entries. Active version changed from `ad3134edb662` to
`14841fbf75b2`, single version at 100% traffic. Downloaded deployed code
remains byte-identical SHA-256 `eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b`.
All other bindings, secret-name inventory, runtime/settings, user annotations, Cron and subdomain
settings are preserved. Access remains enforced (anonymous 302). Protected local
preview TOML and normalized config are synchronized with the new value; older
records remain immutable. No new runtime candidate was deployed.

Immediate SELECT-only reconciliation read 2642 rows, wrote zero:
A/P1, all four revoked sessions, sealed bootstrap, registration receipts,
providers and business/fixture counters exactly equal before. No P2 registration
or provider send attempted yet. Prompt 06 remains partial. Next: owner enters a
private password in the managed browser for one normal P2 registration, then
terminal verification delivery and checkpoint before verification.

Evidence: `tmp/role-isolation-06b-owner/execution/same-bundle-result-safe.json`, SHA-256
`31cce7d7383b79a7ed77f9a1bcb80c68bf4fd720de6701642d38be247df8097b`. Before/after settings, code hashes, D1
snapshots and pinned rollback are retained in that owner-only ignored directory.
Rollback containment: Access stays enforced; rollback is only for this own failed
or drifted config change after read-only reconciliation, never a blind retry.

Validation: exact one-value diff, inherited bindings, byte-identical live code,
live target/Access and bounded D1 postcondition pass. For this status-only commit
only docs:check, release:scan and git diff --check run. Full runtime tests/E2E/build
and independent review reuse the exact candidate gates above. No unresolved
P0/P1 or ambiguous mutation. `rollover_required: no`;
`recommended_next_session_mode: High`: known next registration procedure and
postconditions; private owner password/CAPTCHA handoff remains necessary.


## Prompt 06B supported same-bundle fallback prepared — 2026-09-04T14:45:00Z

The rejected PATCH is not retried: its before state was positively reconciled
and committed. Its detailed provider error was not retained, so the exact
rejection cause is unknown. Use the separately authorized standard Wrangler
strict deploy path for the same existing bundle with one recipient value change.
The detached deployed ancestor and all protected build-file hashes are unchanged.
Strict local dry-run succeeded; emitted Worker SHA-256 is
`eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b`, equal to live before code.
No build, runtime, schema or dependency candidate change occurred. Original
preview config is backed up in protected evidence; only its recipient value
changes. Exact old-version rollback remains pinned at 100%.

Evidence: `tmp/role-isolation-06b-owner/execution/same-bundle-plan-safe.json`,
SHA-256 `e6e495581404ec3b3d57e7b5f3b6721ff356e68597f9424186566637bbc4f346`.
The first local fallback preparation stopped because its new config filename was
not Git-ignored; that untracked helper copy was removed and the existing ignored
preview config was used. No remote write occurred during either preparation.
Only next action: one standard Wrangler deploy, immediate read-only postcondition
and docs-only commit. Other live steps wait for that checkpoint.

Checks: helper syntax, strict dry-run, exact code/config/build-file comparison;
docs:check, release:scan and git diff --check for this checkpoint. Inherit the
unchanged full runtime/E2E/reviewer gates. `rollover_required: no`;
`recommended_next_session_mode: High`: exact target/code/postcondition and
rollback known; no ambiguous write or candidate P0/P1.


## Prompt 06B config PATCH rejected: no change reconciled — 2026-09-04T14:41:20Z

Result: **failed**, not ambiguous. The one PATCH attempt returned HTTP 400.
Immediate independent GET controls and SELECT-only reconciliation confirm the
same deployed version `ad3134edb662` at 100%, exactly two recipient hashes,
byte-identical code, all settings/bindings/Cron/Access unchanged, and unchanged
accounts/sessions/bootstrap/receipts/providers/fixtures. D1 read 2642
rows, wrote zero; all changed_db=false. Protected local TOML is unchanged.
The helper retained the HTTP status but did not retain the provider error detail;
no guessed cause or replay is accepted. No registration/provider delivery occurred.

Evidence: `tmp/role-isolation-06b-owner/execution/config-result-safe.json`, SHA-256
`fc3c00dc04bec90b22a3decfd38b36d368e068a13ccc1ce2f40e59541d8228b7`; exact request, before/after controls and D1
snapshots in the same owner-only ignored directory. No rollback is necessary:
the before state is still active. Next atomic action is read-only inspection of
the supported settings request format and a concrete corrected operation.
The finite 06B scope remains authorized; this rejection is not a runtime P0/P1.

Validation: bounded live no-change reconciliation passed; this docs-only
checkpoint runs docs:check, release:scan and git diff --check. Unchanged runtime
full suite/E2E/build/reviewer gates are inherited. `rollover_required: no`;
`recommended_next_session_mode: High`: no-write result resolved, known target
and containment; next execution needs a supported exact config request.


## Prompt 06B invoked: exact preflight and config plan — 2026-09-04T14:39:17Z

Result: **success, read-only**. The owner's explicit invocation authorizes the
entire finite Prompt 06B package. This replaces the previous prepare-only scope;
no repeated permission is needed for its listed operations. Prompt 06 remains
partial until the specified live matrix and final logout pass.

Fresh control confirms the exact four target fingerprints, version
`ad3134edb662` at 100%, unchanged runtime/bindings/settings/Cron and Access 302.
Live downloaded worker.js is 3,428,318 bytes and SHA-256
`eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b`, equal to
the gated deployed bundle. A/P1 are verified active admin/parent at versions 2/1;
four sessions remain revoked (three logout, one role change). Historical session
digests and registration receipts match the prior logout evidence. Bootstrap
remains consumed with action/assertion/audit 1/1/1 and six seal triggers.
Verification/welcome receipts remain 2/2. P2, portal children and requests are
absent; selected recipient current/pending collisions and legacy email matches
are zero. Migrations 26/pending 0. The bounded SELECTs read 2668
rows and wrote zero, every changed_db=false.

Prepared the supported PATCH script settings operation: one recipient value
append, all other 65 bindings inherited from the exact before version, existing
settings and user annotations preserved. Exact rollback is the protected previous
version at 100%, only after reconciling an own failed/drifted config operation.
Protected local TOML before/after digests and rollback payload are prepared.
The first read-only content request used an incorrect endpoint and stopped before
D1; corrected official content/v2 succeeded. No remote mutation was attempted.

Evidence: `tmp/role-isolation-06b-owner/execution/corrected-content-route-success.json`
SHA-256 `bda483ad98ab9840265dc65eb8de0873554aa6cb77725a21ba173960727395e1`;
`config-plan-safe.json` SHA-256 `6e638d08531542f429d4d06a3c2e746adb19c68a74ac7549825e99f2eab42170` in the same
owner-only ignored directory. Helpers are distinct from historical one-shot tools.

Validation: helper syntax and exact local config diff pass. Docs checkpoint runs
only docs:check, release:scan and git diff --check. Full 580-pass/1-skip, 23 E2E
and candidate-specific reviewer 8/8 evidence are reused; no runtime/build/schema
change warrants repetition. No candidate P0/P1 found. Next: one prepared PATCH.
`rollover_required: no`; `recommended_next_session_mode: High`, because target,
postconditions and rollback are known.


## Finite live closeout prompt prepared for a new session — 2026-09-04

Result: **success, local prompt/docs only**. The owner requested an executable
new-session prompt to finish the live role-isolation work and close Prompt 06.
Prepared `out/codex-two-day-preview-prompts-2026-09-03/06B_HIGH_LIVE_ROLE_ISOLATION_CLOSEOUT.md`
and linked it from the local prompt package README. No remote operation was
performed, and Prompt 06 is not being marked complete by prompt preparation.

The prompt explicitly grants its finite package when invoked: one recipient
allowlist append with exact unchanged-code config delivery/rollback if required;
one P2 registration, verification and its welcome delivery; normal sessions;
one synthetic child and individual self-pay draft; the named RBAC/CSRF/ownership
probes; normal final logouts and per-operation docs checkpoints. It prevents
repeat permission questions for included actions while preserving private
credential handoffs, tool approvals and real failure/ambiguity stops.

The owner-selected address is available to the next session through owner-only
ignored `tmp/role-isolation-06b-owner/recipient-private.json`, with normalized
hash and no password. The address is absent from the prompt and tracked state.
No email was sent; no config, account, fixture or session was created remotely.

The previous statement that the original Prompt 06 itself explicitly required
all additional live work was too strong. The tracked plan now distinguishes the
original postcondition from this separately requested extension. The closeout
criterion is finite: existing bootstrap evidence plus role/CSRF/child-request
ownership PASS, preserved invariants, explained side effects and final logout.
Other document/contract/message/price/provider flows remain full-preview gates,
without becoming new blockers for this bounded Prompt 06 closeout.

The next atomic implementation action remains protected recipient-change
preparation. When the owner applies 06B, its explicit scope governs subsequent
execution and must be reflected in active state after fresh preflight; this
file-creation turn does not execute or consume that future permission.
All remote observations remain those dated above; no new remote claim is made.
Validation: local prompt references/privacy checks, `npm run docs:check`,
`npm run release:scan`, `git diff --check`; runtime/full-suite/build/E2E not
repeated because only documentation and local operator inputs changed.
`rollover_required: no`; `recommended_next_session_mode: High` for the requested
new execution session with a bounded target/procedure and no unresolved ambiguity.

## Read-only role plan complete; second parent required — 2026-09-04

Result: **success, read-only preparation**. The owner requested a live
role-isolation plan, then proposed an additional controlled recipient for a
second parent if needed. The requirement is confirmed: current roles are one
admin plus one parent; parent-to-parent ownership cannot be established with
an admin actor or only unclaimed legacy objects. No new permission decision
about the identity is needed merely to continue preparation; the supplied
address stays outside tracked docs and logs.

The [prepared plan](STAGE_13_LIVE_ROLE_ISOLATION_PLAN.md) maps exact RBAC/CSRF
routes and expected middleware/action responses, session effects, per-operation
checkpoints, normal logout containment and the conditional owner-fixture path.
It distinguishes JSON ActionFailure status from HTTP 200 and keeps no-send
validation controls for CSRF. Creating P2 requires a precise append to the
preview recipient hash allowlist, ordinary registration, verification and its
automatic welcome email; the proposed fixtures are one portal child and one
self-pay individual draft through normal product routes. Their later creation
does not authorize provider/contract sends or direct SQL provisioning.

Fresh aggregate inventory at `13:53:59.152Z`: one active verified admin at
version 2, one active verified parent at version 1; four sessions all revoked;
1703 unclaimed legacy children, zero owned/portal children; requests, documents,
offers, artifacts, threads and price items all zero. Bootstrap remains consumed
with action/assertion/audit `1/1/1`. Five SELECTs read 1727 rows, wrote 0,
`changes=0`, `changed_db=false`; identity values were not selected. Exact target
and protected Worker bindings remain unchanged, version `ad3134edb662` at 100%.
No application HTTP probe, account creation, provider send, fixture write,
allowlist/Access change or deployment was performed. The last atomic remote
action remains the owner's reconciled logout.

Protected ignored evidence:
`tmp/admin-first-login-20260904-owner/role-inventory-safe.json`, SHA-256
`65ffa2c2c50d1f129823d05e4b99134401f55d64be5b22349cd28c2ba7d674fc`;
SELECT-only helper `tmp/role-isolation-inventory-readonly.cjs`, SHA-256
`2999691eecb9762a8035d0ac4fe5a79bee1cd7f24308b76961fd41bda40a349a`.
The interrupted preparation had completed this bounded read; it was not rerun.

No candidate P0/P1 was found. Missing owner fixtures are an explicit next-phase
prerequisite, not a justification for changing roles, claiming absent-ID denial
as ownership proof, or reopening the reviewed runtime. The role/security route
surface and E2E matrix match deployed ancestor `0db3884`; existing gated evidence
is reused. Prompt 06 and full manual preview remain incomplete pending real
live checks; production-readiness gate status is unchanged.

**One next action:** prepare the exact protected third-recipient config diff,
supported application method, read-only postcondition and rollback/containment.
Keep live configuration unchanged during that preparation. Then the proposed
third-parent setup can proceed under its concrete scope with checkpoints.
Validation: helper syntax, `npm run docs:check`, `npm run release:scan`,
`git diff --check`; no full runtime suite/build/E2E/review for this docs-only
plan. `rollover_required: no`; `recommended_next_session_mode: Medium`: the next
work is local/read-only preparation, without a remote write or ambiguity.

## Owner admin logout succeeded and reconciled — 2026-09-04

Result: **success**. After asking whether an active admin session was needed,
the owner chose normal logout and reported completion. The supplied browser
context is now `/auth/login`. No UI action or authenticated request was made
by the agent; only the read-only postcondition was executed.

At `13:47:19.269Z`, eight SELECTs read 55 rows and wrote 0, with `changes=0`
and `changed_db=false`. The session created by the first admin login at
`13:37:12.010Z` is now revoked at `13:44:57.676Z`, reason `logout`. Exactly one
linked `auth.session_revoked` audit matches the admin actor, session, logout
reason and revocation timestamp. First-account session totals changed from
`3/1/1` to `3/0/0` (total/nonrevoked/valid); the user remains an active verified
admin at session version 2. Second-parent state remains version 1, `1/0/0`.
All four sessions are revoked: three by logout and one by role change.

The three previously revoked session hashes, sealed bootstrap control digest
and `1/1/1` action/assertion/audit counts, registration receipt digest, provider
counts and other observed auth/Telegram/storage state match the committed
login checkpoint `4244d8e686c512feb2d59a169796f3e28b9fb89a`. No new session,
provider send or unrelated state change was observed. Target fingerprints
remain account `5dbd04a4763a`, Worker `242c1796e930`, origin host `88ed782ba25a`
and D1 `ccdeb22bb2a1`. Worker fingerprint `ad3134edb662` remains the sole
version at 100%, with exact protected bindings at `13:47:16.480Z`.

Protected ignored evidence:
`tmp/admin-first-login-20260904-owner/logout-safe.json`, SHA-256
`bd36ee3cbc599a442e6993343eac513f9d4888ff8f71bb861fc090f78df0cf00`.
The separate SELECT-only helper `tmp/admin-logout-readonly.cjs`, SHA-256
`b81061e9082bcb8a2cd37312ca69e62034f421b8a00d73d08acf285a991d6491`,
uses a new bounded logout observation; the consumed login helper and its
before/after evidence were not modified or rerun. Credentials, identities,
cookies and raw session/resource IDs were not printed or persisted.

Containment: preserve Access, all revocations and sealed bootstrap; no repair,
replay or new login is needed for this successful logout. No P0/P1 or ambiguity
was found. **One next action:** prepare the bounded remaining live role-isolation
plan read-only. Later execution will need fresh appropriately separated
admin/parent sessions; the owner does not need to stay logged in now. Prompt 06,
full manual preview and production gates remain unchanged and incomplete.

Validation: `npm run docs:check`, `npm run release:scan`, `git diff --check`,
plus syntax validation of the local SELECT-only helper. Full runtime suites,
E2E, build and review are not repeated for status-only documentation; no runtime,
schema or configuration changed. `rollover_required: no`;
`recommended_next_session_mode: Medium`: the next work is read-only preparation,
with no active session, remote write or unresolved ambiguity required.

## First admin login succeeded and reconciled — 2026-09-04

Result: **success**. The owner reported successful authorization and supplied a
screenshot showing `Geschützter Verwaltungsbereich`, `Verwaltung`, the admin
navigation and `Übersicht` dashboard, with all four visible metrics at zero.
The accompanying browser context reports the exact preview `/admin` route.
This is owner-provided UI evidence; no authenticated request, reload, login or
navigation was performed by the agent during reconciliation.

The new first-account session was created at `13:37:12.010Z`; the bounded
snapshot observed its latest authentication touch at `13:38:08.263Z`. At
`13:38:25.183Z`, the prepared SELECT-only helper confirmed exactly one new valid
admin session at user/session version 2: first-account totals changed from
`2/0/0` to `3/1/1` (total/nonrevoked/valid). The second account remains an active
verified parent at version 1, totals `1/0/0`. Global totals are four sessions,
one nonrevoked, two historical logout revocations and one role-change revocation.
The hashes of all three historical session rows match the preflight exactly.

The bootstrap control digest is unchanged and consumed, with action/assertion/
audit counts `1/1/1`. Both registration-finalization receipts match exactly.
Verification and welcome deliveries remain two each, all terminal sent with
one attempt and one receipt per row; no new send, unused token, orphan session,
Telegram or storage state was observed. No login rate-limit bucket remained
at this snapshot; this does not independently establish the POST attempt count.
One successful new session and the owner's reported login are established.

Seven SELECTs read 47 rows, wrote 0, with `changes=0`, `changed_db=false`.
Target fingerprints remain account `5dbd04a4763a`, Worker `242c1796e930`,
origin host `88ed782ba25a`, D1 `ccdeb22bb2a1`. Worker fingerprint
`ad3134edb662` remains the sole version at 100%, with exact protected bindings
at `13:38:22.497Z`; local reviewed source is unchanged. The before snapshot
was recorded at `12:59:01.110Z`, with its preparation committed in
`be86309cb4ecc99587467c83d9daa0138f669519`.

Protected Git-ignored evidence:

- `tmp/admin-first-login-20260904-owner/after-safe.json`, SHA-256
  `2588ab582312d5255518b0621f8433cba402293a84b41da84b562369a5cc8845`;
- `tmp/admin-first-login-20260904-owner/ui-safe.json`, SHA-256
  `136aed93385b598b63c930bd7f943143eab14854e3fef0ee41c80e12999c1f6a`;
- owner screenshot SHA-256
  `a7135f8d8515315f1dbba0f19b44b6711ccc33dfec672c23fe23d9c7bf468d45`;
  the image was inspected as supplied, not copied into evidence or Git.

No credentials, cookies, identity values or raw session/resource IDs were
printed or persisted. The before/after helper modes are both consumed; do not
repeat them blindly. No P0/P1 or unresolved outcome ambiguity was found.

Containment: preserve Access, the current normal admin session, all historical
revocations, the second parent and sealed bootstrap. No session repair, bootstrap
replay, provider send or additional login/logout is part of this completed
operation; ordinary expiry remains available. Any later session revocation
or recovery needs its own explicit scope. There is no reason to undo this
successful login.

**One next action:** prepare a bounded read-only plan for the remaining live
role-isolation checks, with exact routes, browser/session separation, expected
denials, side effects and containment specified before requesting execution
scope. First admin entry is complete; Prompt 06 remains partial because live
parent/admin cross-role and CSRF/owner denials are still pending. The inherited
local/E2E denial evidence remains valid without a new live claim. Full manual
preview and production gates remain blocked; this login does not change a
production-readiness checklist gate.

Validation is limited to `npm run docs:check`, `npm run release:scan` and
`git diff --check`: only operational status documentation changes. No runtime,
configuration or schema changes occurred, so full check/Vitest/E2E/build/review
are not repeated. `rollover_required: no`;
`recommended_next_session_mode: Medium`: the next work is read-only preparation,
with no remote write or unresolved ambiguity.

## First admin login authorized; private credentials pending — 2026-09-04

Result: read-only preflight `success`; login **not attempted**. The owner's
explicit request to perform the first admin login authorizes one normal login,
its rate-limit consumption, session creation and linked redirect/authentication
touches. The last remote mutation remains the reconciled successful bootstrap,
committed in `ab280257f8f65af419ea4b67c6dcce961d73716b`.

At `12:58:51Z`–`12:59:01Z`, target fingerprints, config, deployed Worker
`ad3134edb662` at 100%, bindings and source ancestry matched the protected
records. Anonymous GET returned `302` to Access. Seven SELECTs read 45 rows,
wrote 0 and returned `changes=0`, `changed_db=false`. First slot remains an
active verified admin at session version 2, sessions `2/0/0` total/nonrevoked/
valid, with one historical logout and one role-change revocation. Second slot
remains an active verified parent at version 1, sessions `1/0/0`, one logout.
Control is consumed, action/assertion/audit counts are `1/1/1`, registration
receipts and terminal verification/welcome deliveries are unchanged; no unused
tokens, Telegram/storage state, orphan sessions or active login rate buckets.

The existing Access browser session opens the exact preview `/auth/login`
form. No application credentials are available to the agent; this is a missing
private input, not a missing permission. The owner should enter the **first**
account's existing email/password in that form and submit `Anmelden` once,
then remain on the resulting page. Passwords, cookies and identities must not
be sent through chat or persisted in evidence. No password reset or email send
is needed or authorized. The browser tab is retained for this handoff.

Protected ignored preflight evidence:
`tmp/admin-first-login-20260904-owner/before-safe.json`, SHA-256
`1c6b3df4987bbeb741a041d2fa13e428161b8086d0ca55a621403c0933bc5de6`.
Prepared SELECT-only helper `tmp/admin-first-login-readonly.cjs`, SHA-256
`03f5c83d6a17f812fe1438ef64835af4fd199b93b9856a59bc09185ddb7d1553`,
has separate bounded before/after modes and no remote write capability. It keeps
only sanitized counts and aggregate hashes of preserved rows; raw identities
and session identifiers stay in process memory. The `before` observation is
consumed and must not be rerun blindly.

**One next atomic action:** the already-authorized owner first-admin login.
Expected result is `/admin` and exactly one new valid first-account session at
version 2, first totals `3/1/1`, second totals `1/0/0`, with historical sessions,
bootstrap control, receipts and providers unchanged. After the visible result,
run the prepared bounded `after` reconciliation and commit its checkpoint
before another remote mutation. On failure/ambiguity, reconcile once, preserve
Access and do not retry, repair sessions or replay bootstrap. Prompt 06 remains
partial until the required live role-isolation checks are established.

Validation: helper syntax plus `npm run docs:check`, `npm run release:scan`
and `git diff --check`; no runtime/config change, so inherited exact candidate
runtime tests/build/E2E remain applicable without repetition.
`rollover_required: no`; `recommended_next_session_mode: High`: the authorized
login, exact target, postcondition and containment are known; only private owner
credential input remains.

## One official exact-target bootstrap succeeded — 2026-09-04

Result: **success**. The owner explicitly requested one official exact-target
bootstrap within the previously authorized scope. From clean docs-only HEAD
`9c8a52fb21dfcdc5de5366046c6bee42ac3f9320`, the repository-root CLI used reviewed
source `438a51399ac5f58b428b624c52ca2cbbc059ae9c` and was invoked **exactly once**.
CLI completed at `2026-09-04T12:40:37Z`, exit 0, status `consumed`, preview,
activeAdminCount 1. Immediate independent D1 SELECT reconciliation completed at
`2026-09-04T12:40:39Z` and confirmed the database outcome. No retry occurred.

Authorized scope: promote only the first previously registered verified
synthetic account; preserve the second as parent. Exact target fingerprints
remain account `5dbd04a4763a`, Worker `242c1796e930`, origin host `88ed782ba25a`
and D1 `ccdeb22bb2a1`. The CLI candidate is distinct from deployed Worker
`0db38842524ebc146eaa56a9d089e3c3484bf0f3`, version fingerprint `ad3134edb662`.
The Worker was not deployed or modified. Current vars/bindings, single version
at 100%, exact D1, config/lock/guard hashes and the corrected local source were
reconfirmed before the attempt. The anonymous Access redirect remained `302`.

Fresh preflight completed at `12:40:31Z`: eight SELECTs read 972 rows, wrote 0;
all reported changes 0 and changed_db=false. Ledger was exactly `0001`–`0026`,
pending 0. Both protected identity slots matched, both accounts were verified,
active, unblocked and eligible under the corrected guard, admins 0, control
available and actions/assertions/audits 0. Session aggregates matched the
preceding preparation. The additional bounded query captured the two exact
registration receipts in memory for comparison after the operation. Time Travel
availability and a private pre-attempt bookmark were refreshed at `12:40:28Z`.

The ignored single-attempt wrapper validated the official npm script and built
its arguments with canonical target/confirmation helpers. It invoked only
`npm run --silent admin:bootstrap -- ...` from the repository root, with values
held in memory and raw stdout/stderr captured without logging. Wrangler metrics
and disk logs were disabled. A protected exclusive attempt marker preceded the
invocation; the wrapper has no remote retry/reset route. The original read-only
preparation helper and old baseline-pinned wrapper were not modified or run.

The immediate postcondition used **nine SELECTs, 979 rows read, 0 rows written,
0 changes, changed_db=false for every statement**. Observed before/after:

| Invariant | Before | After |
| --- | --- | --- |
| Roles, slots 1 / 2 | parent / parent | admin / parent |
| User session versions | 1 / 1 | 2 / 1 |
| Slot 1 sessions total/nonrevoked/valid | 2/1/1 | 2/0/0 |
| Slot 1 revocations logout/role_change | 1/0 | 1/1 |
| Slot 2 sessions total/nonrevoked/valid | 1/0/0 | 1/0/0 |
| Bootstrap control | available | consumed |
| Actions / assertions / successful audits | 0/0/0 | 1/1/1 |
| Immutable seal triggers | 6 | 6 |
| Registration receipts | two successful portal allocations | exact records unchanged |
| Verification / welcome deliveries | 2 / 2, sent | unchanged, one attempt/receipt each |

Both accounts remain verified, active and unblocked with no retained parent
business state. The one action/assertion/audit/control chain names the exact
first target, links the same audit and request, has assertion 1 and matching
timestamps/reason; audit actor is system and safe diff is exactly role admin,
sessions revoked, one-shot. Its request matches the successful CLI response;
only fingerprint `e7c28770458d` is retained here. The second identity, role,
version and session aggregate did not change. Ledger, receipts, privacy/token/
verification counters, Telegram/storage counts and orphan-session zero remain
unchanged. There are currently **no valid application sessions** for either
account: the first's remaining parent session was revoked and the second was
already logged out. Neither account was logged in or repaired by this operation.

Prompt 06 status is **partial, not fully complete**: its bootstrap/role/session/
audit/control portion has live success; replay denial is supported by the
consumed control, immutable triggers and inherited tests without a remote retry.
Parent/admin HTTP isolation and CSRF/ownership remain inherited local unit/E2E
evidence. A real admin login and live authenticated role checks were not run.
The canonical bootstrap runbook requires a fresh admin login, while Prompt 06
authorized only the bootstrap mutation and excluded session repair. Normal
login/session touches are additional writes; the present bootstrap-only request
does not authorize them. A successful role mutation alone therefore does not
close every verification item in Prompt 06 or the `SYS-04` manual-preview gate.
This is an outstanding permission/flow boundary, not a new runtime P0/P1 or a
reason to repeat the review/full suite.

Protected owner-only Git-ignored evidence under
`tmp/bootstrap-cli-execution-20260904-owner/`:

| Evidence | SHA-256 |
| --- | --- |
| `operation-safe.json` | `9b1dea913cd5fc288f9ca0f4c0fd280035601b8f34d15c98a87ebb53da2527ef` |
| `postcondition-observed-safe.json` | `35c0df9eff5689fcf8c7d0b14394fb7c53634d2a6bbb040cc48ceb930cefa1f7` |
| `recovery-private.json` | `d54c1e75d673a24e0b70769324266a51a871a52306d097cb7e56952e7dae0bc6` |
| Single-attempt helper in parent `tmp/` | `bc631b0b2973278c7094c41fbc2e75cbfca78be1cb0bc262502feabb0018e2a8` |

Containment: preserve Access/provider restrictions and all immutable evidence.
Bootstrap permission is now consumed. Do not replay/reset it, directly edit
roles, restore old sessions or retry the wrapper. No rollback is needed for the
verified success. Time Travel is a possible separately authorized recovery
route, not permission to restore; there is no dedicated last-admin recovery CLI.
No provider send, deploy, migration, Access/secret/config change, production/CMS
action or real PII operation occurred.

**One next atomic action:** first admin login in the existing protected preview,
only after explicit scope for its new session and linked authentication touches.
It should create the normal admin session at version 2 and reach `/admin`,
preserving both historical revocations and the second parent's logout. Then
reconcile and checkpoint before any next remote mutation. Remaining parent
login and live role/owner/CSRF checks need their own scope; they are not silently
folded into this bootstrap result.

The helper syntax check passed before the attempt. For the mandatory docs-only
checkpoint after it, run only `npm run docs:check`, `npm run release:scan` and
`git diff --check`. Runtime tests, E2E, check/build, dependency audit and another
review are deliberately not repeated: application/test/migration/dependency/
config source is unchanged and exact scoped GO evidence is retained. No new
P0/P1 or mutation ambiguity remains. Production readiness is unchanged; its
historical ledger is not promoted by this synthetic preview result.
`rollover_required: no`; `recommended_next_session_mode: High`: the next normal
admin login has known target/postcondition and requires explicit session-write
scope, with no reason for Max.

## Exact-target CLI bootstrap prepared; fresh read-only preflight — 2026-09-04

Result at `2026-09-04T12:25:36Z`: **success, prepared only**. The owner requested
exact-target CLI preparation and fresh read-only eligibility/session preflight.
Bootstrap invocations, remote mutations, provider sends and authenticated
preview requests are all **0**. Prompt 06's earlier single-attempt permission
remains unconsumed; this preparatory request was not treated as an execution.

Clean HEAD `ad18c84205b2f95b0777484e012653a9533e6259` is a docs-only descendant
of independently reviewed `438a51399ac5f58b428b624c52ca2cbbc059ae9c`. Source,
dependency lock and preview config match their checked records. The official
configuration/argument helpers accepted `APP_ENV=preview`, the single deployed
D1 binding, exact protected UUID and its generated confirmation. Fingerprints:
account `5dbd04a4763a`, Worker `242c1796e930`, origin host `88ed782ba25a`,
D1 `ccdeb22bb2a1`. Full IDs, identities and confirmation were not printed.

Live Worker version fingerprint `ad3134edb662` remains the sole version at 100%
traffic with the exact baseline annotation and unchanged vars/bindings. Its D1
binding matches the prepared CLI target. Anonymous root returned the expected
Cloudflare Access `302`; no cookies or service-auth headers were sent. Access
policy internals and authenticated application routes were not newly exercised.
Time Travel returned an available bookmark at `12:25:33Z`; the bookmark and
exact recovery resource IDs are in protected ignored evidence only. No restore
was attempted and no new recovery permission is implied.

Seven SELECT statements finished at `12:25:36Z`: **970 rows read, 0 rows written,
0 changes, changed_db=false for every statement**. They confirmed:

- Exact migrations `0001`–`0026`, pending 0; no schema change.
- Exactly two active, unblocked, verified parents and zero admins. Registration
  order matches both protected recipient slots. Both pass all 31 predicates of
  the reviewed guard and each retains one successful `portal_allocated` receipt,
  with zero `exact_email` receipts. The eligibility change from the preceding
  diagnostic is due to using the reviewed CLI predicate, not a remote data write.
- Bootstrap control is `available`, consumed fields empty; actions/assertions/
  successful bootstrap audits are `0/0/0`; all six immutable seal triggers exist.
- First parent: session version 1; sessions total/nonrevoked/valid `2/1/1`,
  one historical logout and no role-change revocation. Second parent: version 1,
  `1/0/0`, one historical logout and no role-change revocation. Neither aggregate
  changed since the prior preflight. These are SQL validity checks, not new JWT
  authentication. The second parent's logout is preserved and does not block
  promotion of the first parent.
- Exactly two verification and two welcome deliveries remain terminal sent,
  one attempt/receipt per delivery, zero errors. Privacy acknowledgements and
  verification commits are 2 each; used/unused tokens `2/0`; Telegram outbox,
  Telegram attempts, storage intents and orphan sessions are 0.

Prepared official invocation from the **repository root**:

```powershell
npm run admin:bootstrap -- --environment preview --database-id <PINNED_PREVIEW_D1_UUID> --user-id <VERIFIED_SLOT_1_USER_ID> --reason "Owner-authorized synthetic preview first-account admin bootstrap" --confirmation <CANONICAL_EXACT_TARGET_CONFIRMATION> --config wrangler.preview.toml --remote
```

The placeholders intentionally keep full IDs out of tracked documents. The
preflight resolved their actual values in memory, passed the real CLI option/
target helpers and rendered the six controlled writes plus terminal SELECT
without executing them. Slot 1 is the sole target; slot 2 must remain parent.
`expectedBootstrapConfirmation('preview', pinnedDatabaseId)` supplies the exact
confirmation. Preserve `WRANGLER_WRITE_LOGS=false`, `WRANGLER_LOG_SANITIZE=true`
and `WRANGLER_SEND_METRICS=false`; raw arguments/results must not be logged.
Resolve identity and arguments afresh in memory when continuing. No Worker
deployment is required: this CLI loads the corrected statement builder locally.

Do not run the older `tmp/bootstrap-roles-operation.cjs`: it is pinned to
`0db38842524ebc146eaa56a9d089e3c3484bf0f3` and expects the superseded second-parent
session state. It was neither changed nor executed. The new ignored helper
`tmp/bootstrap-cli-readonly-preflight.cjs` has no write mode, guards its commands
as read-only and refuses to overwrite its existing attempt/evidence. Its syntax
check passed; the successful live run above is its actual validation. A later
continuation must use new protected evidence for its fresh bounded recheck.

Protected current-user-only evidence under
`tmp/bootstrap-cli-preflight-20260904-owner/`:

| Evidence | SHA-256 |
| --- | --- |
| `preflight-safe.json` | `4a7310332696c017ff46c69474b05d2289bf2bd9fa2fd00775f98da28fb5d3bc` |
| `recovery-private.json` | `2e271473f1a41986fed42899055e6370975d95bc59f7246d7f1466399b831bfd` |
| Read-only helper, in parent `tmp/` | `25328cabe2ff0e7e69e073ea09d1bac8b607b673c1e64695914b8eac6897f640` |

**One next atomic action:** one official exact-preview CLI bootstrap attempt
within the existing unconsumed Prompt 06 scope. Recheck the bounded preconditions
immediately before any later attempt; this timestamped snapshot is not a promise
that concurrent state cannot change. Expected result: slot 1 admin/version 2,
all its sessions invalid (one `role_change`, one prior logout), slot 2 unchanged
parent/version 1 with its existing logout, exactly one action/assertion/audit/
consumed-control chain, receipts and provider counts unchanged. Regardless of
CLI exit status, perform one immediate bounded read-only reconciliation and
the mandatory active-state/docs-only commit before any further remote mutation.

On mismatch/ambiguity: preserve Access/provider containment, do not retry the
bootstrap, reset control, edit roles directly or repair sessions. Time Travel
provides a possible separately authorized recovery route; there is no dedicated
last-admin recovery CLI. Do not run a restore or assume live admin login/RBAC
has passed. Those session writes require their own scope. No new P0/P1 was found.
The independent GO and inherited test evidence remain valid; full preview and
production remain blocked on their actual remaining flows.

For this local-helper/docs checkpoint, checks are the helper syntax check,
read-only preflight, `npm run docs:check`, `npm run release:scan` and
`git diff --check`. Runtime tests, E2E, check/build and dependency audit are not
repeated: application, tests, migrations, dependencies and config are unchanged.
`rollover_required: no`; `recommended_next_session_mode: High`: next is the
known single bootstrap with exact target, postcondition and recovery/containment,
without unresolved write ambiguity.

## Independent scoped bootstrap review GO — 2026-09-04

At `2026-09-04T12:12:34Z`, independent verdict: **GO** for exact implementation
candidate `438a51399ac5f58b428b624c52ca2cbbc059ae9c`, using the owner-selected
scoped gate. Unresolved candidate `P0: 0`, `P1: 0`; no new P2/P3 findings.
This closes the local review of `P1-BOOTSTRAP-REGISTRATION-FINALIZATION-001`.
Full manual preview and production remain blocked pending their actual flows.
No second reviewer or generic full gate is needed for this unchanged diff.

Scope proof: baseline `0db38842524ebc146eaa56a9d089e3c3484bf0f3` is an ancestor
of the implementation candidate, which is an ancestor of inspected clean HEAD
`3c386c3977b67faac42d33f15df09438e7350cd5`. The complete baseline-to-HEAD diff
has 17 paths: 15 documentation files, the guard and one new regression file.
The only executable diff is the comment and `result_kind <> 'portal_allocated'`
predicate in `src/lib/server/auth/admin-role-transition.ts`.
The new test is `tests/integration/admin-bootstrap-registration-d1.test.ts`.
Candidate-to-HEAD changes are documentation only; existing tests, migrations,
dependencies/lockfile, toolchain, config, hooks, routes, sessions and both CLI
implementation files have no drift. No runtime or test file was edited here.

Independent code findings:

- Migration `0006` constrains `result_kind` to non-null `exact_email` or
  `portal_allocated`, with a successful finalization assertion. The default
  `LegacyFamilyVerificationExtension` writes the receipt inside the ordinary
  verification batch. Promotion never deletes or changes it.
- The shared guard has exactly the same 31 correlated branches. Only the
  finalization branch changes: `exact_email` still rejects, and each of the
  other 30 predicates is unchanged. They are evaluated at the role update,
  including business state acquired after portal registration. The receipt
  does not short-circuit child, claim, contract, message or privacy predicates.
- `buildAdminBootstrapStatements` and `AdminIdentityRepository.assignAdmin`
  use this same guard. Verified/active/unblocked parent eligibility, zero-admin
  bootstrap precondition, existing-admin authority for normal assignment,
  session-version increment/revocation and audit predicates are unchanged.
  Repository statements share one D1 batch; bootstrap assertion constraints
  reject the transaction on failure. Migration `0014` keeps one-shot control
  and append-only action/assertion evidence. Rejection preserves target role,
  sessions and successful audit/control evidence.
- The new regression really calls register, verification with the runtime's
  default family extension and login. It verifies second-parent isolation,
  unchanged receipts, target session revocation/version, linked action/audit/
  assertion/control, replay denial, normal assignment and child/exact-email
  rejection. Its SQL case renders all six controlled writes plus the terminal
  SELECT individually into one local D1 batch and validates all seven results.
  This is local SQL evidence, not execution of the real remote CLI transport.
- `scripts/bootstrap-admin.ts` imports the statement builder from local source,
  appends the terminal SELECT, then invokes exact-ID D1 execution through the
  isolated pinned config. It never invokes the deployed Worker. Therefore no
  Worker deploy is required for the next out-of-band bootstrap from this
  reviewed checkout. Config/APP_ENV/UUID pinning, escaping, statement cardinality
  and terminal-result validation in the CLI/command helpers are unchanged.

Fresh independent validation: one invocation of the three required files,
**8 passed / 3 files**, exit 0, duration 102.11 seconds. Five ordinary-registration
scenarios, two retained-state scenarios for both consumers and the canonical
guard-coverage test cover the changed behavior and its immediate consumers.
Output is separately retained in Git-ignored
`tmp/bootstrap-registration-review-06a-20260904.log`, SHA-256
`b1f85f62927e2f2e4315d82f7aff8982d70417a5cb7903ed677c65f09861a19d`.

Inherited evidence was read and all five hashes matched:

| File under `tmp/` | SHA-256 | Reused result |
| --- | --- | --- |
| `bootstrap-registration-focused.log` | `68d943c54d6f03b48962965fa03c30b64f29183c170c5ff20c53a6352f61e69e` | 51 pass + 1 SQL-adapter failure across 9 files |
| `bootstrap-registration-rendered-green.log` | `3a651e9bea7afb82131ab33737363bafe7e596d64a3d1007db5337e1d9e086c8` | affected SQL scenario passed; other 4 skipped in this rerun |
| `bootstrap-registration-check.log` | `0bbf0b58829d7036a178be7a5183e229304ede456f8cfbd6eb6778333a17c445` | check: 0 errors, 0 warnings |
| `bootstrap-registration-e2e.log` | `e320aa587c4d2d0d302ae4d45d2bdbc6fb4b1fffaebb4ce1b46684ea383aab20` | 2 Chromium role/owner/CSRF scenarios passed |
| `bootstrap-registration-build.log` | `b9d970207f414f86950d0be5ef451fa28453e41446305171964797becd9fee55` | production build/Cloudflare adapter passed |

The initial `ADMIN_BOOTSTRAP_REMOTE_RESULT_INVALID` is not hidden: the prior
splitter-based local adapter combined the final INSERT/SELECT and returned six
results. The final test renders each original statement separately. The single
successful correction rerun and this independent eight-test run validate that
final harness; production CLI/splitter code was not changed. Combined inherited
implementation evidence covers 52 tests, including the other 44 not rerun here.

Full baseline evidence is separately inherited from exact `0db38842524ebc146eaa56a9d089e3c3484bf0f3`:
check, 78 Vitest files / 580 pass / 1 expected Windows skip, Chromium 23/23,
build and production dependency audit with 0 advisories, as recorded in
[the baseline handoff](handoffs/stage-13.md#local-d1-cost-remediation-candidate-2026-09-02).
These are historical full results for unchanged surfaces, not a fresh full run
of `438a51399ac5f58b428b624c52ca2cbbc059ae9c`. Full Vitest/E2E, the other
44 tests, check/build and dependency audit were deliberately not repeated:
ancestry, complete path/diff inspection and evidence hashes support reuse.

No remote read or mutation, authenticated preview access, bootstrap, login,
session touch/repair, provider send, deployment, migration or config/Access
change occurred. The `preview` and live `flow_verification` observations above
are retained exactly; the old Worker still contains the baseline predicate,
and no live bootstrap success is asserted. Containment remains Access and the
existing provider restrictions. There is no remote mutation to roll back.

**One next atomic action:** prepare/reconcile the exact-preview CLI bootstrap
continuation from the reviewed source, with fresh read-only target, eligibility
and session preflight. Preserve Prompt 06's unconsumed permission and confirm
its applicable scope without extending it; do not repair the second parent's
logged-out session. Before any later single authorized attempt, define bounded
postcondition and recovery/containment: no direct role edit, control reset or
blind retry; ambiguous outcome stops for read-only reconciliation and the
mandatory docs-only checkpoint. This review grants no remote mutation or
production GO. `rollover_required: no`; `recommended_next_session_mode: Medium`:
the next action is read-only preparation, with no unresolved write ambiguity.

Checkpoint checks passed: `npm run docs:check` (206 links, 110 command lines,
continuity), `npm run release:scan` (575 files, no findings) and `git diff --check`.
The first docs check caught two new report-link anchors; they were corrected
and the docs check passed. No checker was changed. Runtime tests are not repeated
after this docs-only commit.

## Scoped validation decision for the bootstrap fix — 2026-09-04

The owner requested a focused, bounded independent check of the local fix and
explicitly rejected an automatic new full-suite/review cycle. The earlier
generic full-release next action was overbroad for this demonstrated diff and
is **superseded for this candidate only**. Repository-wide validation rules are
unchanged. This entry records the owner's scope decision, not a completed
independent verdict or a waiver of a known product failure.

Exact code candidate `438a51399ac5f58b428b624c52ca2cbbc059ae9c` changes only
one executable file relative to fully gated baseline
`0db38842524ebc146eaa56a9d089e3c3484bf0f3`: one eligibility predicate and
its comment. Its only consumers are bootstrap and normal audited assignment.
All 31 guard references remain; the finalization branch distinguishes a
registration receipt from legacy-claim evidence. Migrations, dependency/lock,
toolchain, config, CLI implementation, route/hooks and session implementation
have no diff. Later HEAD changes are documentation only. Line count alone is
not the reason for scoping; this call graph and the existing focused evidence
bound the affected behavior.

The separate reviewer must read that diff and the immediate consumers once,
reconcile inherited logs and run exactly this normal-path validation:

```powershell
npx vitest run tests/integration/admin-bootstrap-registration-d1.test.ts tests/integration/admin-role-transition-d1.test.ts tests/unit/admin-role-transition.test.ts
```

This is three files / eight tests: five registration/transition regressions,
two representative retained-state tests for both entrypoints and one canonical
guard coverage test. Existing evidence for the other 44 related tests, two
Chromium role/owner/CSRF scenarios, check and build is reused after scope and
log verification. The old complete release evidence covers unchanged surfaces;
the new focused evidence covers the changed surface. Neither is misrepresented
as a fresh full run of the new candidate. The initial 51-pass/one-test-adapter-
failure log must be read together with the successful final one-test rerun.

A missing/corrupt log or actual relevant drift permits only its affected
check/scenario to be repeated. A newly demonstrated broader diff or unbounded
impact requires an exact scope/verification blocker, not an automatic full
suite. New relevant assertion failures must be resolved/classified and cannot
be dismissed. P2/P3 alone do not block the milestone or create another loop.

The ready-to-run ignored prompt is
`out/codex-two-day-preview-prompts-2026-09-03/06A_FOCUSED_BOOTSTRAP_REVIEW.md`.
It includes exact hashes of five existing logs, a single reviewer run, bounded
fallbacks, verdict/continuity instructions and no runtime edits or remote
actions. The prior generic P1-fix prompt was not a dedicated review procedure.
The protocol above remains tracked so the ignored prompt is not the only
source of the verification decision.

If scoped review is GO and no new P0/P1 remains, do not schedule another full
gate or another reviewer for this same unchanged candidate. Record independent
GO with its actual scoped evidence, then identify the smallest next bootstrap
operation and its exact target/permissions/preconditions. The reviewer must
check whether the out-of-band CLI exercise needs any Worker deploy; changing
a shared source file alone does not establish that dependency. No operation is
authorized by this instruction merely because it is the next planned step.

This preparation session changes only the prompt/operational documentation;
it performs `docs:check`, `release:scan` and `git diff --check`.
Runtime tests, independent review and all remote actions were not performed.
Review status remains pending and the last observed preview state is retained.
`rollover_required: no`; `recommended_next_session_mode: Medium`:
the requested separate session has bounded code inspection and local test
evidence work without remote writes or unresolved mutation ambiguity.

## Local AUTH-09 bootstrap eligibility remediation — 2026-09-04

Result: `success` for the owner-authorized **local fix and regression**.
Implementation commit: `438a51399ac5f58b428b624c52ca2cbbc059ae9c`. The user explicitly
approved local code changes after the preceding no-code Prompt 06 preflight.
No remote operation, bootstrap invocation, deploy, session change or provider
send occurred. Preview state below remains the last read-only observation;
the deployed code still has the recorded bootstrap blocker.

The only executable change is the finalization branch of
`NO_RETAINED_PARENT_STATE_SQL`: a `portal_allocated` receipt no longer
blocks promotion. This implements the existing empty-registration allowance
in `AUTH-09`. The receipt is retained; `exact_email` and all 30 other
retained-state checks continue to block both bootstrap and ordinary audited
admin assignment. No schema, migration, runtime configuration, provider,
dependency or route change was made. The specification, acceptance criterion
and test plan clarify this same registration-evidence distinction.

The new integration file uses `createAuthRuntime` with its **default**
family-verification extension, a local migrated D1 and a promoted synthetic
snapshot. It exercises ordinary registration, the generated verification link,
verification and login before promotion. Only local test providers are fake;
this is regression evidence, not a substitute for the required live preview.
Five scenarios cover repository bootstrap, the CLI's rendered statements with
its terminal result assertion, normal admin assignment, portal allocation with
a retained child, and isolated historical exact-email finalization. Assertions
cover retained verification receipts, unchanged second parent, revoked target
session, linked one-shot action/assertion/audit/control and replay denial.

Validation and evidence (all logs Git-ignored under `tmp/`):

- RED: `bootstrap-registration-red.log` proves the ordinary-registration
  repository scenario failed with `ADMIN_BOOTSTRAP_REJECTED` before the fix.
- Focused run: `bootstrap-registration-focused.log` contains nine files,
  52 tests: 51 passed, with one initial failure in the new local SQL test adapter.
  The Wrangler SQL splitter returned six chunks for seven controlled statements,
  combining the final INSERT/SELECT; local D1 prepare accepts one statement.
  The test now renders each original CLI statement separately for local batch
  execution. `bootstrap-registration-rendered-green.log` proves that one
  affected scenario passed after the test-only correction. No production
  splitter/CLI code changed. Combined final evidence covers all 52 tests;
  no relevant assertion failure remains unresolved.
- Direct consumers checked: auth lifecycle, family/cabinet verification,
  bootstrap/role-transition D1, exact-target command/rendering and security units.
- `bootstrap-registration-e2e.log`: two Chromium scenarios passed, role/
  route isolation and the complete cross-owner/CSRF matrix.
- `bootstrap-registration-check.log`: check passed, 0 errors/0 warnings.
  `bootstrap-registration-build.log`: production bundle/Cloudflare adapter
  build passed. Docs checks, release scan and diff check passed.

The full Vitest/E2E release gate, dependency audit and independent review were
not run in the local repair session. Its initial blanket requirement for a new
full gate is superseded by the owner's later scoped validation decision above.
Inherited baseline evidence and new focused evidence remain explicitly distinct;
the independent scoped review is still pending. The continuity field `reviewed_candidate` retains the last
actually reviewed SHA; `local_remediation_candidate` and `review.candidate`
identify the new pending candidate. Current review markers are synchronized to
pending; no production-readiness gate is declared passed.

Containment remains Access plus the existing provider restrictions. Preserve
both accounts, sessions and registration evidence. Prompt 06's one-shot
permission remains unconsumed; it does not bypass the new candidate gates or
authorize a new Worker deploy, session recovery or live authenticated probes.
There is no remote change to roll back. `rollover_required: no`;
`recommended_next_session_mode: Medium`: next work is local validation and
evidence, with no remote write or mutation ambiguity. Full manual preview and
production remain blocked until their actual remote/manual gates pass.

## Prompt 06 preflight: registration finalization blocks bootstrap — 2026-09-04

Result: `failed` preflight; **bootstrap not attempted, CLI invocations 0**.
The owner invoked Prompt 06 and authorized one official preview bootstrap for
the first registered verified synthetic account; the second must remain parent.
Its permission is unconsumed, but cannot be exercised while the required
canonical eligibility check is false. The prompt expressly forbids code
changes, direct SQL role edits, repeated bootstrap, session repair and other
remote mutations. No remote mutation or provider send was attempted here.

**P1-BOOTSTRAP-REGISTRATION-FINALIZATION-001** blocks the mandatory Stage-13
bootstrap flow. The deployed candidate's
`src/lib/server/auth/admin-role-transition.ts`,
`NO_RETAINED_PARENT_STATE_SQL` rejects every target having any
`family_finalization_commits` row. The ordinary verification extension
in `src/lib/server/family/verification-extension.ts` inserts that row
for successful empty portal allocation, with `result_kind=portal_allocated`.
The bounded live diagnostic found exactly one such successful row for each
account, and zero matching rows in each of the other 30 retained-state guard
branches. Both accounts therefore fail the actual bootstrap guard despite
having no child/claim/request/contract/price/message/privacy business state.
This conflicts with the empty-FamilyID/registration allowance in `AUTH-09`
and its existing acceptance criterion; no new business rule is needed.

Existing bootstrap success fixtures directly seed a verified user and empty
FamilyID; they omit the ordinary verification finalization record. The prior
full release gate and independent GO remain historical evidence for the exact
unchanged candidate, but cannot override this newly demonstrated P1. No review
loop or runtime test was started under this no-code operational scope.

Before any write, local source/config hashes and the protected record matched.
Clean HEAD `6abee8b3546b6e23d552407dc30d15288dbcf633` is a docs-only
descendant of the reviewed candidate. The clean exact detached source and all
396 bundle inputs retain their recorded build hashes. Preview target
fingerprints are account `5dbd04a4763a`, Worker `242c1796e930`,
origin host `88ed782ba25a` and D1 `ccdeb22bb2a1`. The live version
fingerprint remains `ad3134edb662` at 100%, with exact candidate annotation,
unchanged bindings/vars/feature gates/schedules and protected recipient hashes.
The official confirmation helper validated the preview environment and exact
D1 target in memory; no confirmation, user ID or identity was printed or saved.

The first HTTP helper stopped before the account SELECT with an unclassified
local/HTTP error. Its successful control snapshot was reused. The bounded
continuation confirmed anonymous Access redirect `302` and valid Access
root `200`, then performed nine SELECTs reading 944 rows and writing 0.
Exact ledger is `0001`–`0026`, pending 0. Both accounts are verified,
active and unblocked; their normalized identity hashes match the respective
protected recipient slots. Roles remain two parents and zero admins.
Bootstrap control is `available`; actions/assertions/bootstrap audit are
all 0; all six immutable control/action/assertion triggers are present.

The second session has drifted since Prompt 05: its one session is now revoked
with reason `logout`, so its total/nonrevoked/valid counts are `1/0/0`.
The first account remains `2/1/1`. Total sessions remain 3, with 1
nonrevoked and 2 logged out; no session has `role_change`. The read-only
session did not perform or attribute this intervening logout. No recovery or
fresh login is implied. Email remains exactly two verification and two welcome
deliveries, terminal sent with one attempt/receipt per row and no errors.
Telegram/storage intents remain 0; no extra send or orphan session was found.

The targeted eligibility diagnostic completed at `11:36:53Z`: three
SELECTs read 58 rows and wrote 0, checking all 31 guard branches per account,
the finalization kind/assertion and relevant aggregate audit counts. All 12
completed D1 SELECT statements across the preflight and diagnostic reported
`changes=0` and `changed_db=false`. Prior scoped integrity/FK and
deployment-cadence evidence is reused; no broad scan or health polling occurred.

Fresh authenticated browser denial checks were not attempted: even successful
session authentication calls `AuthRepository.touchSession` and writes
`auth_sessions.last_seen_at`. New admin login also creates a session.
RBAC/CSRF/ownership and replay-denial coverage remains the inherited exact-
candidate unit/integration/Chromium evidence, not a new live success claim.
One-admin/one-parent and sealed-bootstrap postconditions are **not achieved**.

Protected current-user-only ignored evidence:
`tmp/bootstrap-roles-20260904-owner/resume-before-safe.json`, SHA-256
`03158c4853144af0e06160fdb16f93c6ce7df68409643b7b20f1482b1a587dcf`;
`eligibility-detail-safe.json`, SHA-256
`6a64a262547ceac5f923e82e3e824ce95db2d3c15efc21985d2bb85a9dfab473`.
Resource/config evidence remains protected and ignored; identities and user IDs
were held only in process memory. Local Wrangler disk logging was disabled to
avoid storing query/argument identities. The application/config were unchanged.

Containment: preserve Access, provider restrictions, accounts, sessions and
registration proof. Do not execute bootstrap against a failing guard, delete
finalization rows, edit roles directly or reset the one-shot control. There is
no mutation to roll back and no ambiguous write. The sole next action is an
owner decision authorizing a local `AUTH-09` eligibility fix with a regression
covering ordinary registration/verification followed by bootstrap. Prompt 06's
no-code instruction is the reason implementation stops here. Any later remote
action requires valid candidate/target/eligibility gates and explicit scope.

Validation: only `npm run docs:check`, `npm run release:scan` and
`git diff --check` for this docs-only checkpoint. Full check/Vitest/E2E/build,
dependency audit and independent review are not repeated: runtime, migrations,
dependencies and configuration are unchanged. A future fix must cover this
concrete regression; inherited green fixtures do not dismiss the failure.
`rollover_required: no`; `recommended_next_session_mode: Medium`:
the next action is a scope decision, with no remote write, ambiguous mutation,
corruption, authorization bypass or reason to escalate to Max. Full manual
preview and production remain blocked.

## Second verified-parent login and Prompt 05 completion — 2026-09-04

Result: `success`; **Prompt 05 is complete**. The owner reported successful
login as the second account and supplied a cabinet screenshot. It shows the
parent cabinet with no children; the raw screenshot, identity and displayed
family number were not copied into Git/evidence. The one bounded read-only
reconciliation completed at `11:23:43Z` and confirmed exactly one new session
belonging to the second parent.

Session totals changed `2 -> 3`, nonrevoked `1 -> 2`, and logged-out remains 1.
There are exactly two distinct nonrevoked session owners. Per-owner checks
confirm first parent sessions `2 total / 1 nonrevoked / 1 valid`, unchanged,
and second parent sessions `0 -> 1 total / 0 -> 1 nonrevoked / 0 -> 1 valid`.
Validity includes unexpired session and current user session-version matching.
The consumed `auth:login` bucket count is 1. No further login or logout was
performed. This completes the two independent identity/session boundaries.

Accounts remain exactly two active, unblocked verified parents with two
distinct normalized identities and two distinct assigned FamilyIDs; admins 0.
Each parent has one privacy acknowledgement, one verification commit, no owned
children, and exactly one terminal verification and one terminal welcome email
with one attempt and one provider receipt per row. Outbox totals remain four
rows across exactly two recipients, with no error codes or additional send.
Used verification tokens and commits remain 2; unused tokens 0. Registration
and verification audit counts remain 2 each; session-revocation audit remains 1.
All checked token, verification-commit, outbox, family and owned-child owner
mismatches remain zero, with no orphan sessions or recipients.

Fourteen SELECT statements read 1,865 rows and wrote 0, with `changes=0` and
`changed_db=false` throughout. Exact ledger is `0001`–`0026`, pending 0.
Worker fingerprint `ad3134edb662` remains the sole active version at 100%, with
exact reviewed candidate annotation, unchanged target fingerprints, bindings,
feature gates, schedules and protected recipient hashes. Bootstrap, Telegram
outbox/attempts and storage intents remain zero. Maintenance is fresh/successful;
the fast cadence was observed in its normal `running` state less than two
seconds after start, with no recent failures. This is not a stalled cadence or
a failed auth postcondition; no follow-up polling or reopening of the already
proven deployment gate is needed. Prior Access and scoped integrity/FK evidence
remain inherited from the unchanged supervised preview.

Protected current-user-only ignored evidence:
`tmp/second-registration-20260904-owner/after-login-safe.json`, SHA-256
`a3dc89eaedca977f45c8d7382d467763b663238bba307d2978702c75a26b2df3`.
The helper's `mutationAttempted=false` describes its own read-only operation;
the preceding owner login/session mutation is the atomic action recorded here.
No identity, password/hash, token/link, cookie or raw resource/provider ID was
queried or stored in the aggregate reconciliation.

All Prompt 05 permissions and the separate one-welcome permission are consumed.
Containment preserves Access, the two-recipient allowlist, both accounts and
their known sessions; no further login/logout, account/role change, bootstrap,
registration, resend, verification replay, provider send or config change is
authorized. The one next action is a separate owner decision on the one-shot
admin bootstrap; perform its exact target/eligibility preflight only within that
separately defined scenario. No bootstrap or role mutation was attempted here.
The complete `full-manual-preview` and production gates remain blocked because
their later mandatory flows have not yet been completed.

Validation: only `npm run docs:check`, `npm run release:scan` and
`git diff --check`. Runtime, migrations, dependencies and config are unchanged;
full check/Vitest/E2E/build/audit and independent review are deliberately not
repeated. The exact reviewed candidate
`0db38842524ebc146eaa56a9d089e3c3484bf0f3` retains its existing full release
evidence. `rollover_required: no`; `recommended_next_session_mode: High`:
the next planned preview bootstrap has known target class/procedure and
containment, but requires its own explicit owner authorization.

## Second email verification and welcome delivery — 2026-09-04

Result: `success`. Under the recorded one-welcome permission, the owner opened
the existing second-account verification link and reported successful
verification and welcome receipt. The single read-only reconciliation completed
at `11:17:36Z`; no link replay, resend, new login or other mutation was attempted
by this session. Verification and the additional welcome permissions are consumed.

There are exactly two distinct active/unblocked verified `parent` accounts and
two distinct assigned FamilyIDs, admins 0. Verified users, used verification
tokens, verification commits and assigned families each changed `1 -> 2`;
unused tokens changed `1 -> 0`. Privacy acknowledgements remain 2. Outbox totals
are two `auth.email_verification` and two `auth.welcome`, all terminal `sent`,
each category with attempts 2, receipts 2 and no error. Per-owner checks prove
exactly one verification and one welcome sent with attempts/receipt 1 for each
parent. There are exactly two recipients, no extra rows or sends, and exactly
two registration and two verification audit events.

Fourteen SELECT statements read 1,854 rows and wrote 0; all reported
`changes=0` and `changed_db=false`. Two aggregate-only ownership queries extend
the ignored read-only helper for this required isolation check and the upcoming
login: no raw identity, user/family ID, session token, password or document body
is returned. Token-to-user, verification-commit-to-token/user, token/welcome
outbox-to-owner, assigned-family-to-owner and owned-child-to-family mismatch
counts are all zero. Each parent has one privacy acknowledgement and one
verification commit, and no owned children. The first parent still has exactly
two session rows, one nonrevoked/valid; the second has zero sessions. Session
totals remain 2, nonrevoked 1 and logged-out 1. The two independent session
boundaries will be verified after the authorized second login, not claimed now.

Exact migration ledger remains `0001`–`0026`, pending 0. The reviewed Worker
fingerprint `ad3134edb662` remains at 100% with unchanged candidate annotation,
bindings, feature gates, schedules, target fingerprints and recipient hashes.
Both fixed cadence rows are fresh and successful with no recent failures.
Bootstrap, Telegram outbox/attempts and storage intents remain zero. Prior
Access and scoped integrity/FK evidence are reused without repeated polling.

Protected current-user-only ignored evidence:
`tmp/second-registration-20260904-owner/after-verification-safe.json`, SHA-256
`c072881632998c17679854d6622f5c2520f8b8476b2fb57ab4eb33c3e55370e8`.
The helper's `mutationAttempted=false` refers to its own read-only operation;
this checkpoint records the owner's preceding verification/provider mutation.

The one next action is exactly one owner login using the second account under
the retained Prompt 05 permission. Use the normal preview login form and keep
credentials private. After the cabinet opens, run one bounded `after-login`
reconciliation and commit active state. First-account access/edit/logout,
another second-account login, logout/session cleanup, bootstrap, resend,
verification replay, unrelated sends and configuration changes remain forbidden.
On failure or ambiguity, do not retry; reconcile once and preserve containment.

Validation: `npm run docs:check`, `npm run release:scan` and
`git diff --check` only. No runtime/config change occurred; the exact reviewed
candidate's full check/Vitest/E2E/build/audit/review evidence is reused.
`rollover_required: no`; `recommended_next_session_mode: High`: the remaining
authorized login/session mutation has known target, postcondition and containment.

## Second welcome-delivery permission checkpoint — 2026-09-04

The owner explicitly authorized exactly one automatic `auth.welcome` delivery
to the same second allowlisted recipient. This completes the delivery scope for
the single initial verification already authorized by Prompt 05. Registration
and its verification delivery remain consumed; verification, the one welcome
and the subsequent single login remain unused. No new remote mutation or
provider send was attempted while recording this permission.

The one next action is the owner's single personal opening of the existing
second-account verification link. Do not share the link/token in chat or
evidence. After the visible result and expected welcome delivery, run the
prepared single `after-verification` read-only reconciliation and commit active
state before login. No replay, resend, first-account action, bootstrap or
unrelated write/send is authorized. A failed or ambiguous result is reconciled
once without blindly repeating the link open.

The immediately preceding registration postcondition and protected target
evidence are reused within this supervised window. No additional D1, analytics,
health or control polling is required for this permission-only update. Only
`npm run docs:check`, `npm run release:scan` and `git diff --check` are run;
full runtime tests/build/review remain inherited because runtime/config are
unchanged. `rollover_required: no`; `recommended_next_session_mode: High`:
the next verification/provider mutation is authorized and its target,
postcondition and containment are known.

## Second controlled registration and verification delivery — 2026-09-04

Result: `success`. The owner submitted the checked registration form and
reported receipt of the verification email. At `11:08:26Z`, the single bounded
read-only reconciliation confirmed users/parents `1 -> 2`, two distinct
identities, verified users still 1, FamilyID assignments still 1, active/unblocked
users 2 and admins 0. The added second parent remains unverified as expected.
Privacy acknowledgements changed `1 -> 2`; verification tokens total `1 -> 2`,
with used 1 and unused/unexpired 1. Verification commits remain 1.

The outbox contains exactly two terminal `auth.email_verification` rows, total
attempts 2 and provider receipts 2, plus the unchanged one terminal
`auth.welcome` with attempts/receipt 1. All safe error codes are null. There are
exactly two distinct delivery recipients and no orphan recipients/sessions.
Audit registration count changed `1 -> 2`; verification and session-revocation
counts remain 1 each. There is one `auth:register` bucket with consumed count 1.
Sessions remain exactly 2, nonrevoked 1, logged out 1, with one nonrevoked session
owner. No second-account login has occurred. Bootstrap, Telegram and storage
intent counts remain zero. No extra token, outbox row or provider send appeared.

The helper executed 12 SELECT statements, reading 82 rows and writing 0, with
`changes=0` and `changed_db=false` throughout. Exact ledger remains
`0001`–`0026`, pending 0. Worker fingerprint `ad3134edb662` remains active at
100% with the exact reviewed candidate annotation, unchanged bindings, feature
gates, schedules, target fingerprints and both protected recipient hashes.
Both fixed cadences are successful and fresh with no recent failures. The
Access perimeter and scoped integrity/FK evidence are inherited from the
unchanged supervised preflight; they were not polled again.

Protected current-user-only ignored evidence:
`tmp/second-registration-20260904-owner/after-registration-safe.json`, SHA-256
`fa383ff598f5299b130f43223641599d24270e872ad3336962f45da2e16c41ca`.
The helper's `mutationAttempted=false` describes its own read-only operation;
this checkpoint records the owner's preceding registration/provider mutation.
No identity, password, verification link/token, cookie or provider identifier
was read or stored by the reconciliation.

The second registration and its verification delivery permissions are consumed.
Prompt 05 verification/login permissions remain, but initial verification
unconditionally enqueues a second-recipient `auth.welcome` delivery. The prompt
explicitly permits only the verification email, so the one next action is to
request explicit permission for exactly that additional automatic welcome to
the same recipient. This scope constraint was already established for the
first account and does not indicate a runtime defect or new P0/P1.

Containment: do not open the verification link until that welcome scope is
authorized; no replay, resend, registration retry, login, first-account action,
bootstrap, direct D1 repair or config/provider change. Preserve Access and the
two-recipient restriction. After the separately scoped verification, reconcile
once and commit its checkpoint before the already-authorized second login.

Validation: only `npm run docs:check`, `npm run release:scan` and
`git diff --check`. Full check/Vitest/E2E/build/audit/review are not repeated:
runtime/config are unchanged from the exact reviewed candidate and its full
release evidence is reused. `rollover_required: no`;
`recommended_next_session_mode: High`: the next verification/provider mutation,
target, postcondition and containment are known; only the welcome scope needs
the owner's explicit decision.

## Second recipient validated from owner screenshot — 2026-09-04

Result: `success`, local/read-only only; registration remains **not attempted**.
The owner reported that the form was filled and not submitted, then supplied a
screenshot proving the filled form, accepted privacy notice, successful
Turnstile and enabled registration button. The previous empty email readings
from browser DOM/accessibility do not establish that the actual form was empty;
they are a limitation of this observation surface. No repeated input is needed.

At `11:00:43Z`–`11:00:44Z`, local Windows OCR of that owner-supplied screenshot
found exactly one email. Its normalized full SHA-256 matched slot 2 of the
unchanged protected two-recipient allowlist using the same normalization as
`assertAllowedRecipient` in `src/lib/server/email/resend.ts`. Only match/count
booleans, the allowlist slot and screenshot hash were saved. No email, identity,
password, token, cookie, OCR text or raw screenshot was copied into evidence/Git.
The masked screenshot did not reveal the password. The prior bounded preview
preflight is reused within this supervised registration window; no additional
D1/control polling, remote mutation or send occurred.

Protected ignored evidence:
`tmp/second-registration-20260904-owner/recipient-screenshot-safe.json`, SHA-256
`0ee69a08d0a2b0ee979ed6980dee9ab06cecf7833ee71cf44afef1ad4e8f299b`.
The browser form was not changed or reloaded. Under the computer-use credential
handoff rule, the one next action is the owner's single `Registrieren` click
with the checked recipient unchanged. After its visible result and delivery,
run the one prepared `after-registration` reconciliation and commit the active
state before verification/login. Expected changes are one additional
unverified parent, privacy acknowledgement, unused verification token and
terminal verification delivery; first-account state and sessions remain intact.

Containment remains no retry/resend, first-account action, bootstrap, unrelated
send or config change. Do not open the new verification link until the
registration checkpoint is committed and the one automatic welcome delivery
has explicit permission. Existing Prompt 05 registration permission is retained
and does not require another permission request. Runtime is unchanged; only
docs checks, release scan and diff check apply. `rollover_required: no`;
`recommended_next_session_mode: High`: the authorized registration/delivery,
target, expected result and containment are known.

## Second registration preflight and private browser input — 2026-09-04

Result: read-only preflight `success`; second registration **not attempted**.
The owner invoked Prompt 05, authorizing one separate second synthetic parent
registration, one allowlisted verification delivery, verification and login.
These permissions remain unused. First-account changes, bootstrap/role mutation,
resend/retry, unrelated sends and configuration changes are forbidden.

At `10:39:35Z`–`10:39:55Z`, the single preflight confirmed clean HEAD
`15280fa45248d8099d9a79507f4792723b2aa4e6`, a docs-only descendant of the reviewed
candidate, with unchanged exact detached source/build proof. Worker fingerprint
`ad3134edb662` remains the sole version at 100%, with exact candidate annotation,
bindings, feature gates, schedules and protected target fingerprints. Anonymous
and invalid Access probes returned login redirects `302`, authorized root and
registration GET returned `200`, and the versioned route returned `404`. The
two-recipient allowlist is unchanged; membership of the actual second
browser-entered address is **pending** and must be checked before POST.

One account-wide quota observation recorded 20,290 reads and 4,560 writes.
Twelve SELECT statements read 69 rows and wrote 0, all with `changes=0` and
`changed_db=false`. Ledger is exact `0001`–`0026`, pending 0. First account,
privacy acknowledgement, used token, verification commit, FamilyID, terminal
verification/welcome rows and receipts, session totals and auth audit counts
match the Prompt 04 logout checkpoint. There is one distinct identity, one
assigned family, one owner of nonrevoked sessions, no orphan sessions/recipients
and one email recipient. Users/parents/verified remain 1, admins/bootstrap 0,
sessions 2 with one nonrevoked and one logged out. Both cadences are fresh and
successful; Telegram/storage counts remain 0. Expired auth rate-limit buckets
have naturally disappeared. Previous scoped integrity/FK evidence is reused.

The separate in-app browser is open on the registration form with no account
fields entered by the agent. The one next action is private owner entry of only
the second approved email, followed by a value-free allowlist check; do not
submit yet. Credential creation/submission is handed to the owner under the
computer-use credential-entry policy. Passwords, OTPs, links and cookies must
not enter chat or evidence. No application mutation or provider send was
attempted, and the last atomic mutation remains the successful prior logout.

The existing delivery-scope constraint applies again:
`src/lib/server/auth/auth-repository.ts` unconditionally enqueues one
`auth.welcome` after initial verification. Prompt 05 explicitly authorizes the
verification delivery only. Before opening the verification link, obtain
explicit permission for that one additional welcome delivery to the same second
recipient. Registration remains authorized once recipient preconditions pass.
Do not change runtime/config or suppress the outbox to bypass the scope boundary.
No new runtime P0/P1 was demonstrated.

Protected current-user-only ignored evidence:
`tmp/second-registration-20260904-owner/before-safe.json`, SHA-256
`79cee0af5f374700b63e849467f1f0c6dd06f53aef3d93f01a4200b44f815165`.
The ignored `tmp/second-registration-readonly.cjs` permits one observation per
named stage, read-only control APIs and SELECT statements, storing aggregates
only. Do not rerun `before` blindly; outside this supervised window revalidate
stale preconditions once with a new bounded record.

Containment: preserve Access and recipient restrictions; no POST before the
address check, no verification before welcome scope is explicit, no first-account
action, retry, resend, bootstrap or direct D1 repair. After each authorized
registration/verification/login mutation, reconcile once and commit active state
before the next mutation, as required by `AGENTS.md` even though the operational
prompt describes the overall sequence with one reconcile.

Validation: only `npm run docs:check`, `npm run release:scan` and
`git diff --check`. Runtime/config are unchanged; full check/Vitest/E2E/build/
audit/review are inherited from the exact reviewed candidate and not repeated.
`rollover_required: no`; `recommended_next_session_mode: Medium`: the immediate
next action is private browser input/read-only recipient validation without a
remote write or unresolved mutation ambiguity. The subsequent known authorized
registration procedure uses canonical mode `High`.

## First verified-parent logout and Prompt 04 completion — 2026-09-03

Result: `success`. The owner used the normal `Abmelden` control and was returned
to the login route. The bounded reconciliation at `17:29:09Z` confirmed two auth
session rows in total, one revoked by logout and one still nonrevoked. The owner
then explained the complete sequence: after the first successful login, the
hard-to-find logout control led them back through Startseite and a second login;
the tested logout therefore correctly revoked that current second session. The
remaining row is the known first owner-created session, not an unexplained
duplicate. The tentative `P1` classification is withdrawn.

Prompt 04 is complete: the single synthetic parent is verified, delivery is
terminal, login and current-session logout both worked, and admin/bootstrap
state is unchanged. Account, privacy, used verification token, verification
commit, FamilyID, both terminal email rows/receipts and audit counts remain
exactly unchanged. There are no extra user, token, outbox or provider-send rows,
no admins/bootstrap and no unrelated Telegram/storage state. Eleven SELECT
statements read 57 rows, wrote 0 and reported `changes=0`,
`changed_db=false`; the exact Worker fingerprint `ad3134edb662`, migration
ledger `0001`–`0026`, bindings, gates, schedules and recipient hashes remain
exact.

Owner feedback is recorded as mandatory follow-up `P2-LOGOUT-UX-002`: logout
exists under `Kontosicherheit`, but it is not visible in the cabinet's primary
or persistent navigation. The owner had to search for it and created another
session while returning through Startseite. A prominent `Abmelden` control must
be added in a later UI change with an affected browser scenario. The current
milestone flow remained available and worked, so the finding does not reopen
candidate review and no code change is made under Prompt 04.

Protected current-user-only ignored evidence:
`tmp/first-registration-20260903-owner/after-logout-safe.json`, SHA-256
`92e3c2568ed53fc4b722cb3c968b33b1c85b9db3e5da26acab74a93bce8e9176`.

Containment: no new login, session cleanup, registration/resend, verification
replay, second account or bootstrap is authorized. The known remaining session
may be revoked early only under a separate explicit owner authorization and a
bounded procedure; it does not make Prompt 04 ambiguous. The one next action is
to request separate owner authorization before the second-account/bootstrap
scenario.

Validation remains `npm run docs:check`, `npm run release:scan` and
`git diff --check`; runtime/config are unchanged and the exact-candidate release
gate/review are reused. `rollover_required: no`;
`recommended_next_session_mode: High` because the next remote preview scenario
has known target and containment but still requires separate authorization.

## First verified-parent login — 2026-09-03

Result: `success`. The owner logged in once with the verified synthetic account
and reported that the parent cabinet opened. The bounded reconciliation at
`17:05:49Z` confirmed exactly one auth session, nonrevoked 1, logged-out 0, and
one consumed `auth:login` rate-limit bucket. Login authorization is consumed;
logout remains authorized by prompt 04 but was not attempted before this
checkpoint.

The exact Worker fingerprint `ad3134edb662` remains active at 100% with unchanged
bindings, feature gates, Cron schedules and recipient hashes. Eleven SELECT
statements read 56 rows, wrote 0 and reported `changes=0`, `changed_db=false`;
the exact migration ledger remains `0001`–`0026`, pending 0. Account, verified
status, FamilyID, privacy acknowledgement, used verification token, verification
commit, both terminal email rows/receipts and registration/verification audit
remain unchanged. There are no admins/bootstrap, extra outbox rows, Telegram
attempts or storage intents.

Protected current-user-only ignored evidence:
`tmp/first-registration-20260903-owner/after-login-safe.json`, SHA-256
`ad1a9e9489c4358845fea72498a3363a7d4b62e7cdb7277d7830d065a84ad528`.

Containment: the owner remains in the single active session and must perform
only one normal portal logout after this docs checkpoint. Do not login again,
register/resend/replay verification, create business state or bootstrap. After
logout, run the prepared one-time `after-logout` reconciliation and docs-only
checkpoint before any following mutation.

Validation remains `npm run docs:check`, `npm run release:scan` and
`git diff --check`; runtime/config are unchanged and the exact-candidate release
gate/review are reused. `rollover_required: no`;
`recommended_next_session_mode: High`: one authorized session-revocation action,
postcondition and containment remain.

## First email verification and welcome delivery — 2026-09-03

Result: `success`. The owner personally opened the existing verification link
once and reported both the successful portal message and receipt of the expected
welcome email. The additional one-welcome permission is consumed. No link replay,
resend, registration retry, login, bootstrap, deploy or configuration mutation
was performed before the bounded reconciliation.

At `17:02:23Z`, the protected single observation confirmed the exact reviewed
Worker fingerprint `ad3134edb662` at 100% traffic with unchanged bindings,
feature gates, Cron schedules and recipient hashes. Its 11 SELECT statements
read 54 rows, wrote 0 and reported `changes=0`, `changed_db=false`; ledger remains
exact `0001`–`0026`, pending 0.

The one account is now an active, unblocked, verified parent with exactly one
FamilyID. Its one email-verification token is used; unused count is zero; there
is exactly one verification commit. The email outbox contains exactly one
terminal `auth.email_verification` and one terminal `auth.welcome`: each has
attempts 1, provider receipt 1 and no safe error code. Audit contains exactly one
`auth.registration_created` and one `auth.email_verified`. Privacy acceptance
remains exactly one. Sessions, admins/bootstrap, Telegram outbox/attempts and
storage intents remain zero. Both fixed cadence rows were successful with no
recent failures. No identity value, password, token/link, cookie or raw provider
identifier was queried or stored.

Protected current-user-only ignored evidence:
`tmp/first-registration-20260903-owner/after-verification-safe.json`, SHA-256
`5854946c323032b4e42a3b74f983aade14b8ede3c6b7326047ed3b9ecac9094d`.

Containment: do not replay the verification link, resend, register again,
bootstrap or perform unrelated actions. The next atomic action is exactly one
owner login with the same account under prompt 04 authorization, followed by
one bounded read-only reconciliation and docs-only checkpoint before logout.

Validation remains docs-only: `npm run docs:check`, `npm run release:scan` and
`git diff --check`. Runtime/config are unchanged; full suite and independent
review are inherited and not repeated. `rollover_required: no`;
`recommended_next_session_mode: High` because the authorized login/session
mutation, postcondition and containment are known.

## Welcome-delivery permission checkpoint — 2026-09-03

The owner explicitly authorized exactly one automatic `auth.welcome` delivery
to the same allowlisted recipient after personally opening the existing
verification link once. The authorization does not permit a resend, second link
open/retry, second account, registration retry, login, bootstrap, unrelated
provider send, deploy or configuration mutation. No remote mutation or provider
send was attempted while recording this permission.

The next atomic action is the owner's single personal opening of the existing
verification link. The link/token must not be shared in chat or evidence. After
the visible result and expected welcome delivery, run the prepared single
bounded `after-verification` reconciliation and create its docs-only checkpoint
before login. Failed or ambiguous verification is not retried blindly.

This is a permission-only docs update. Existing target/candidate/registration
postconditions remain the current bounded evidence; no additional D1, analytics
or health read is justified before the immediate supervised action.
`rollover_required: no`; `recommended_next_session_mode: High` because the next
linked verification/provider mutation and its containment are known.

## First controlled registration and verification delivery — 2026-09-03

Result: `success`. The owner submitted the authorized synthetic registration
form exactly once and reported receipt of its verification email. The bounded
read-only reconciliation completed at `16:50:10Z` against the recorded preview
target and confirmed the expected reviewed Worker fingerprint `ad3134edb662` at
100% traffic, unchanged bindings/feature gates/Cron schedules and the same two
recipient hashes. Registration permission is consumed; there was no retry,
resend, second account, bootstrap, deploy or configuration mutation.

The 11 SELECT statements read 49 rows, wrote 0 and reported `changes=0`,
`changed_db=false`. The exact ledger remains `0001`–`0026`, pending 0. Before →
after counts are: users/parents `0 → 1`, privacy acknowledgements `0 → 1`,
unused unexpired email-verification tokens `0 → 1`, and register rate-limit
buckets `0 → 1` with consumed count 1. The sole account is active, unblocked,
unverified and has no FamilyID before verification, as required. The sole outbox
row is `auth.email_verification`, terminal `sent`, attempts 1, provider receipt
1 and no safe error code. Audit contains exactly one
`auth.registration_created`. Verification commits, sessions, admins/bootstrap,
Telegram outbox/attempts and storage intents remain zero. Both fixed cadence
rows were successful with no recent failures. No PII, password, token/link,
cookie or raw provider identifier was read or saved.

The owner reported that the successful German confirmation is rendered inside
the now-cleared registration form and can initially look like an error. This is
`P2-REG-UX-001`: the registration flow succeeded and the message is explicit,
but a visually separate success panel or success state would reduce uncertainty.
Per the current prompt, no runtime/UI code is changed and this P2 does not open
a new review loop or block the next manual-preview step.

Protected current-user-only ignored evidence:
`tmp/first-registration-20260903-owner/after-registration-safe.json`, SHA-256
`50fdfc0e9cb7c0d65fc9c63f2d26641d9cf6059a8999db196b8e6d9ba4c79f22`.
An attempted helper invocation after the evidence already existed stopped at
its local one-observation guard before any Cloudflare call; no duplicate remote
read or mutation occurred.

Containment: do not click the verification link, resend, repeat registration,
log in or perform another mutation before the docs-only checkpoint and explicit
authorization for the one automatically enqueued `auth.welcome` delivery. A
failed or ambiguous future verification is reconciled once and never retried
blindly. Access and recipient restrictions remain unchanged.

Validation for this operational checkpoint is limited to `npm run docs:check`,
`npm run release:scan` and `git diff --check`. Runtime, migrations, dependencies
and config are unchanged, so the existing full release gate and independent GO
are reused; full check/Vitest/E2E/build/audit/review are not repeated.
`rollover_required: no`; `recommended_next_session_mode: High`: the next
verification mutation and its automatic welcome send have a known target,
postcondition and containment, but the additional provider delivery requires
explicit permission.

## First registration preflight and owner handoff — 2026-09-03

Result: read-only preflight `success`; registration **not attempted**. The owner
invoked prompt 04, authorizing one first synthetic-parent registration, one
allowlisted verification delivery, then verification/login/logout. This
authorization is retained; it does not authorize a retry, second account,
bootstrap, unrelated provider send, configuration change or deploy. No remote
mutation or provider send was attempted by this session. The last atomic
mutation remains the successful Worker deploy recorded below.

At `16:31:39Z`, the bounded preflight confirmed candidate
`0db38842524ebc146eaa56a9d089e3c3484bf0f3`, deployed fingerprint `ad3134edb662`,
one active version at 100%, exact candidate annotation, unchanged protected
config/bindings/feature gates and both Cron schedules. The account/Worker/origin/
D1 fingerprints match the machine-readable record. Anonymous/invalid Access
probes returned login redirects `302`, valid root and registration GET returned
`200`, and the versioned route remained `404`. Both approved recipient hashes
are unchanged; their sanitized prefixes are `f229bcd52c21` and `04c5a3377cd9`.

One account-wide analytics observation at `16:31:37Z` reported 941,785 reads and
25,718 writes. The subsequent 11 SELECT statements read 47 rows, wrote 0 and
all reported `changes=0`, `changed_db=false`. Ledger names exactly match local
`0001`–`0026`, pending 0. Users/parents/admins/verified users, privacy
acknowledgements, auth tokens/verification commits, outbox/provider receipts,
sessions, auth rate buckets/audit, bootstrap, Telegram and storage intents were
all zero. Both fixed cadence rows were fresh and successful with no recent
failures. Prior scoped integrity/FK evidence is reused; neither historical-job
scans nor full integrity checks were repeated.

**Scope boundary discovered before submission:** successful initial email
verification unconditionally enqueues `auth.welcome` in
`src/lib/server/auth/auth-repository.ts`, and the enabled Resend outbox sends it
to the same current recipient. Thus completion produces two logical emails:
verification plus welcome. Prompt 04 permits only the verification delivery and
explicitly forbids other sends. Registration itself remains authorized, but
verification must wait for explicit authorization for that one additional
welcome delivery. This is a concrete permission-scope conflict, not a newly
demonstrated runtime P0/P1 or a reason to reopen the reviewed candidate. No code,
flag, secret, outbox row or provider configuration was changed to bypass it.

The owner-facing browser is at Cloudflare Access before the registration form.
The owner must complete Access and enter the first previously approved mailbox,
password and synthetic identity personally; credentials, OTP, cookies and
verification links must never enter chat or evidence. Submit the registration
once only. After the response and first delivery result, perform one bounded
read-only reconciliation and docs-only checkpoint **before** verification,
login or any further mutation. No resend or form retry on failure/ambiguity.

Protected current-user-only ignored evidence:
`tmp/first-registration-20260903-owner/before-safe.json` and
`before-counts-safe.json`; the former has SHA-256
`20ca94df4c72f2d5a61e0ddad974662b6ba05813ef007fbd2f8ef638366b13e0`.
The ignored helper
`tmp/first-registration-readonly.cjs` supports one observation per named stage
and only read-only control APIs/SELECT statements; it stores aggregate results,
never identity fields, token values or raw configuration. Two preliminary
helper invocations stopped on local evidence-directory ACL errors before their
control snapshot completed; no D1 or analytics observation was reached. The
successful preflight used a new directory created under the intended owner.
Do not run the retired historical registration snapshot helper.

Containment: keep Access and the two-recipient restriction unchanged; no
verification/welcome send until its scope is authorized; no direct D1 repair,
account deletion, automatic rollback or repeated diagnostics. If the owner
resumes outside this supervised window, revalidate stale preconditions once
before submitting. Permission for the one registration remains unused.

Validation: runtime, migrations, dependencies and config are unchanged from the
reviewed candidate; the full release evidence and independent GO above are
reused. This checkpoint uses only `npm run docs:check`, `npm run release:scan`
and `git diff --check`. Full check/Vitest/E2E/build/audit/review are not repeated.
`rollover_required: no`; `recommended_next_session_mode: High`: the authorized
registration write has a known target, procedure, postcondition and containment;
owner browser input and welcome scope must be respected.

## Exact Worker deploy checkpoint — 2026-09-03

Result: `success`. The one owner-authorized deploy was attempted at `15:46:37Z`;
the command completed at `15:47:39Z` with exit 0. The immediate read-only control check at
`15:47:58Z` confirmed the returned version fingerprint `ad3134edb662`, exact
candidate annotation and one active version at 100% traffic. All bindings,
runtime configuration class, existing feature gates and both Cron schedules
match the protected pre-deploy record. Anonymous and invalid Access probes
returned login redirects `302`; valid Access root returned `200`; the versioned
public route returned `404`. No retry or other remote mutation was performed.

The single bounded D1/cadence/health postcondition completed at `16:01:48Z`, after
waiting for the maintenance delivery without polling. Both fixed cadence rows
were fresh and `succeeded`, with zero recent failures: maintenance finished at
`16:00:49Z`, fast at `16:01:44Z`. Email claimed/sent counts were zero; Telegram
remained explicitly disabled. All seven maintenance jobs succeeded with no
business/storage work. This proves the scheduled deployment checkpoint, not the
separately gated Telegram/document/contract feature flows.

The ledger remains exact `0001`–`0026`, pending 0 and FK 0. The 13 SELECT
statements read 37 rows and wrote 0, with `changes=0` and `changed_db=false` for
every statement. Nine indexed latest-history seeks found no automatic rows
newer than `15:46:43Z`, before deploy completion; the retained ledger is no
longer growing. Users, sessions, auth tokens, bootstrap, email/Telegram outboxes,
Telegram delivery attempts and storage intents remain zero. One authenticated
health `HEAD` returned empty `204` with `no-store` and `noindex`. No unexpected
provider send or feature-gate weakening was observed.

The deploy permission is consumed. The only next action is to request separate
owner authorization for one controlled registration retry. Registration,
verification, provider send, bootstrap, rollback and feature/Access/secret changes
remain unauthorized. A later feature-flow failure alone does not justify
rolling back this successful Worker deployment.

Source proof: the primary worktree was clean at
`aa40dc766bc85e5158350a1abcf118f00d242615`, a docs-only descendant of the reviewed
candidate. A separate clean detached worktree at the exact candidate received
an offline `npm ci` from its unchanged lockfile; 274 installed packages were
verified. The protected preview config was copied byte-for-byte inside that
worktree. Wrangler resolved all 396 bundle inputs, the source entrypoint,
adapter output and assets inside it. Build and strict dry-run passed with
Wrangler `4.120.1`. Actual deploy and dry-run Worker bundles have the same SHA-256
`eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b`.

The bounded preflight at `15:45:25Z` reconfirmed migration ledger 26/pending 0,
FK 0, two idle cadence rows, no users/sessions/tokens/bootstrap/provider outbox/
storage-intent rows, Time Travel availability and unchanged protected target.
Its 13 SELECT statements read 37 rows and wrote 0; all reported
`changed_db=false`. Prior successful affected-table integrity evidence is reused.
One account-wide analytics observation showed 940,255 reads and 25,314 writes.

Protected, current-user-only evidence is under `tmp/worker-deploy-20260903/`;
full resource/version IDs, raw configuration and Time Travel bookmark remain
there. `success-safe.json` has SHA-256
`256863b209a03ec0e1c12e388affebcbccb0c8a704cd417fdf9ae76b3369a58b`.
The previous version fingerprint `745295d36248` is recorded as schema-
compatible through `0026`; it retains the old D1-cost P1. A rollback requires a
new explicit owner authorization and must preserve Access/provider containment.
`rollover_required: no`; `recommended_next_session_mode: High`: the next
controlled preview registration has known target/procedure and containment,
and requires its own permission for a remote write/provider delivery.

Validation for this checkpoint: exact detached build, strict dry-run and bounded
live pre/postconditions passed. Full `npm run check`, Vitest, Chromium E2E,
production dependency audit and independent GO are inherited from the unchanged
reviewed candidate above; none was repeated. The docs-only commit uses only
`npm run docs:check`, `npm run release:scan` and `git diff --check`. Production
readiness remains unchanged and blocked.

## Migration 0026 checkpoint — 2026-09-03

Result: `success`. The one owner-authorized remote mutation was attempted once on
the exact dedicated Access-protected preview D1 and applied only
`0026_background_d1_cost_controls.sql`. Wrangler executed its 15 statements in
132.34 ms and returned success. The conditional permission is consumed; no
Worker deploy, rollback, registration, bootstrap, provider send, Access/flag/var/
secret change, production/CMS action or real-PII action was performed.

The immediate single bounded `--command` postcondition was read-only throughout:
all statement metadata reported `changes=0`, `changed_db=false` and 0 rows
written. The migration ledger changed from exact `0001`–`0025` with only `0026`
pending to exact `0001`–`0026` with pending 0. Cadence state contains exactly the
`fast` and `maintenance` rows, both idle with fencing token 0. All 10 expected
table/index objects are present, both superseded indexes are absent, and foreign
key violations remain 0.

Retained-data counters remained valid: scheduled history increased naturally
from 80,667 to 80,692 rows while the old Cron Worker was still live; users,
contract actions/acceptances, price-review actions/acceptances and enrollments
remain 0; audit rows remain 5; legacy snapshot source rows remain 3,406; the two
bounded comparison groups remain 2 rows each. Table-scoped `quick_check` returned
`ok` for all 10 tables whose table/index structures the migration changes,
including the largest `scheduled_job_runs` table. The largest check read 242,076
rows and wrote 0; database size after the operation was 80,281,600 bytes.

The final preflight at `14:20:50Z` had reconfirmed clean candidate ancestry, no
runtime/migration/dependency/config drift, all protected target fingerprints,
the expected old Worker fingerprint at 100% traffic, Access redirect `302`, Time
Travel availability, restored daily D1 quota, and a pending set containing only
`0026`. Sanitized protected evidence is retained under
`tmp/d1-0026-20260903/`; `success-safe.json` has SHA-256
`bbf400e257850f394b3c35d829af6b6d887f08ae5362246cba47e76d4d2dce12`. Full
resource IDs, bookmarks and sensitive configuration remain outside tracked state.

The deployed old Worker still has `P1-DEPLOYED-D1-001`: the migration supplies
the compatible schema but does not itself stop cost-unbounded old health/Cron
paths. Containment therefore remains no health polling, registration, provider
send, bootstrap or other remote mutation. The only next action is to request
separate owner authorization for the exact reviewed Worker deploy and its one
bounded postcondition. `rollover_required: no`;
`recommended_next_session_mode: High`, because the exact target, reviewed
candidate, deploy procedure, postcondition and rollback/containment are known.

## Read-only integrity reconciliation checkpoint — 2026-09-03

Result: `success`; migration `0026` remains **not attempted**, and its conditional
permission is not consumed. The earlier database-wide `PRAGMA quick_check(1)`
failure is a bounded-execution limitation, not evidence of corruption. Cloudflare
documents `quick_check` as supported, but D1 query execution shares Workers CPU
and memory limits; SQLite documents the database-wide form as an O(N) scan. The
preview database currently has an approximately 80 MB logical image, 854 schema
objects and more than 80,000 retained scheduled-history rows.

The supported migration-specific integrity gate is now proven. Remote
`PRAGMA quick_check('scheduled_job_runs')` on the largest affected table returned
`ok` in 1.78 seconds with 241,848 reads and 0 writes. An isolated clean local D1
through `0026` then passed the exact command-path postcondition: ledger 26,
exactly two cadence rows, 10 required schema objects, 0 removed legacy indexes,
FK 0 and `ok` for table-scoped `quick_check` on all 10 tables whose table/index
structures `0026` changes. The remote postcondition must use `--command`, not
Wrangler's file-import path, so each result and `changed_db=false` remain visible.

Fresh control evidence at `14:07:48Z`–`14:12:14Z` confirms account-wide daily D1
usage of 357,811 reads and 23,055 writes, the unchanged protected config/target
fingerprints, the expected Worker fingerprint at 100% traffic, Access login
redirect `302` and an available Time Travel bookmark. Candidate ancestry,
runtime/migration/dependency/deploy-config equivalence and the reviewed `0026`
blob/hash remain unchanged.

One attempted SELECT-only precondition used `wrangler d1 execute --file`; Wrangler
reported 85,822 reads and 0 rows written, but also the contradictory transport
metadata `changed_db=true`. It is not accepted as evidence. The required single
query-path reconciliation immediately afterward returned ledger 25, no cadence
table, FK 0, 80,667 retained scheduled rows, `changes=0`, `changed_db=false` and
0 rows written. Therefore no logical schema/data mutation occurred, `0026` is
still pending and no recovery action is needed. Do not use `--file` for this
read-only checkpoint again.

Containment until the authorized write: no deploy, registration, provider send,
bootstrap, recovery or health polling. Immediately before apply, revalidate that
the Wrangler pending set is exactly `0026`; then apply it once and execute one
bounded `--command` ledger/schema/retention/FK/affected-table integrity
postcondition. `rollover_required: no`;
`recommended_next_session_mode: High`, because target, mutation, postcondition
and containment are exact and the contradictory read-path metadata was resolved
without a logical D1 write.

## Read-only preflight checkpoint — 2026-09-03

Result: `failed` preflight, **migration not attempted**. The owner invoked the
one-action prompt for `0026`; its conditional permission does not authorize a
write with an unavailable required integrity result. There was no remote
mutation attempt, provider send, Worker deploy or rollback in this session.

Before/after: live Worker fingerprint remains `745295d36248` at 100% traffic;
its D1 binding matches the protected preview target. Anonymous root returned an
Access login redirect (`302`). Protected record/config SHA-256 match; clean
HEAD `0f920d3762d9abfdcaddd5d54c93065a292776ba` is a docs-only descendant of the
reviewed candidate, with no runtime/migration/dependency/config diff. Migration
`0026` matches candidate blob `f105b6a2e36e0d3b6d1946864b182c38bd48be92` and
SHA-256 `167a319813f36e5f07e07ce3d75b33f588298cef951ba17ec1034fc122544e32`.

One account-wide Cloudflare analytics query at `13:12:27Z` confirmed daily usage
of 24,188 reads and 21,540 writes. Time Travel returned a pre-write bookmark at
`13:15:21Z`; it stays in protected evidence and was not restored. These are
timestamped observations, not a standing guarantee for a later write window.

Read-only D1 evidence confirms exact ledger `0001`–`0025`, only `0026` pending,
FK violations `0`, and 854 schema objects. Bounded baseline counters include
80,534 retained scheduled-job rows, 5 audit rows, 3,406 retained source rows,
2 target rows, 2 old-group rows and 0 users. The successful baseline read used
85,691 reads and 0 writes; no document bodies or client rows were retrieved.
Two earlier compound-SELECT forms received SQL compilation errors (`7500`);
the corrected separate SELECTs succeeded. Their evidence is retained, and the
completed data reads were reused without another data snapshot.

**Single blocker:** the one `PRAGMA quick_check(1)` attempt at `13:19:56Z`
returned `SQLITE_NOMEM`, API code `7500`, without an integrity result. This
reproduces the previously recorded verification limitation and does **not**
establish corruption. Applying the migration now could leave its mandatory
integrity postcondition unprovable; stop before write and reconcile that
verification capability read-only. Do not substitute FK-only evidence for the
owner's integrity requirement or retry the same failing check blindly.

Protected, Git-ignored evidence directory: `tmp/d1-0026-20260903/` (restricted
to the current Windows user). Relevant files: `control-preflight-safe.json`,
`quota-analytics.json`, `time-travel-before.json`,
`schema-before-no-compound.json`, `schema-full-before.json`,
`integrity-before.json` and `integrity-preflight-safe.json`. Full target IDs,
version IDs and the recovery bookmark are excluded from tracked state.

Containment: preserve Access and existing provider restrictions; no migration
retry, deploy, recovery write, registration or health/SQL/analytics polling.
The only next action is read-only reconciliation of the required bounded
integrity verification. `rollover_required: no`;
`recommended_next_session_mode: Medium`, because no write was attempted and
there is no ambiguous mutation or evidence of corruption requiring recovery.

## Sequencing constraint

Migration `0026` is schema-compatible with the currently deployed Worker, but it
does not make that old Worker cost-bounded. Therefore the migration checkpoint
must be followed by an immediate request for the separately authorized Worker
deploy in the same supervised window. Do not park the route while resuming health
or SQL polling; if the deploy permission is unavailable, preserve containment
and stop after the required migration postcondition/checkpoint.

## Test and review decision

The exact reviewed runtime candidate already has one full release gate and an
independent GO. Do not repeat either after this docs-only child or because of
`P2/P3`. A new full gate plus independent exact-candidate review is required only
for a material runtime, migration, dependency, deploy-config or genuinely
cross-cutting diff whose impact cannot be bounded by focused checks.

For a docs-only operational checkpoint run only the documentation/link/command
checks, release secret/PII scan and diff check. For a remote mutation run only the
exact-target preflight and bounded postcondition defined above.

## Update rule

After every attempted remote mutation, update **this file only** before the next
remote mutation. Update the large handoff only at a real phase/session boundary;
update production readiness only when a production gate changes; update
traceability only when requirement-to-evidence mapping changes. Do not copy the
current SHA, deployed fingerprint or next action into those documents.

Historical evidence: [append-only Stage-13 handoff](handoffs/stage-13.md).
Stable execution entry-point:
[stage-13-continue-deployment.md](../prompts/stage-13-continue-deployment.md).

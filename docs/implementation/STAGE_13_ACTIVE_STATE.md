# Stage 13: current operational state

<!-- stage-13-current-review-status: independent_go -->

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-09-02T20:27:28Z
reviewed_candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
last_completed_gate: phase-3-d1-cost-release-validation-and-independent-review-go
next_gate: phase-4-owner-authorized-preview-d1-0026-apply
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
current_review_status: independent_go
current_phase: phase-3-local-d1-cost-candidate-ready
last_atomic_action: owner-authorized-first-controlled-registration
last_atomic_result: failed
next_atomic_action: owner-authorized-preview-d1-0026-apply-with-one-bounded-postcondition
rollover_required: no
recommended_next_session_mode: High
mode_reason_plain: exact-preview-target-candidate-postcondition-and-containment-are-known
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
permission_state: no_remote_mutation_authorized_by_this_record
review:
  status: independent_go
  candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
  unresolved_candidate_p0: 0
  unresolved_candidate_p1: 0
  inherited_release_evidence:
    check: passed
    vitest: 78_files_580_pass_1_expected_windows_skip
    chromium_e2e: 23_of_23
    build: passed
    production_dependency_audit: 0_advisories
    docs_continuity_release_scan_diff: passed
preview:
  access: enforced
  deployed_candidate: bef578917575f233ce4853a1432f1d0d29b22289
  deployed_fingerprint: 745295d36248
  traffic_percent: 100
  d1:
    applied_through: 0025_contract_storage_intent_generations.sql
    pending_exactly:
      - 0026_background_d1_cost_controls.sql
    last_recorded_foreign_key_violations: 0
    quota_precondition: owner_must_confirm_daily_quota_restored_before_write
  synthetic_state:
    users: 0
    admins: 0
    import_pair: 2_plus_1703
  providers:
    auth_and_resend: enabled_only_behind_access_and_two_recipient_hashes
    telegram: fail_closed_until_separate_manual_preview_phase
    documents: fail_closed_until_separate_manual_preview_phase
    contracts: fail_closed_until_separate_manual_preview_phase
known_deployed_preview_p1:
  - id: P1-DEPLOYED-AUTH-001
    impact: controlled_registration_fails_at_server_siteverify
    remediation: included_in_reviewed_candidate
  - id: P1-DEPLOYED-D1-001
    impact: old_health_and_cron_paths_can_exhaust_shared_d1_quota
    remediation: migration_0026_plus_reviewed_candidate
next_atomic_action:
  id: preview-d1-apply-0026
  permission: separate_explicit_owner_authorization_required
  target: exact_dedicated_preview_d1_from_protected_config
  mutation: apply_only_0026_background_d1_cost_controls.sql
  preconditions:
    - daily_d1_quota_confirmed_restored_without_heavy_sql_or_health_polling
    - protected_target_record_matches_preview_and_excludes_production
    - reviewed_candidate_and_compatible_previous_worker_match_protected_record
    - migration_ledger_is_0001_through_0025_with_only_0026_pending
    - recovery_or_time_travel_containment_is_still_available
  postcondition:
    - one_bounded_read_only_ledger_schema_fk_check
    - ledger_applied_through_0026
    - exactly_fast_and_maintenance_cadence_rows_exist
    - expected_indexes_present_and_foreign_key_check_zero
  success_transition: request_separate_permission_for_exact_reviewed_worker_deploy
  failed_or_ambiguous_transition: stop_no_blind_retry_read_only_reconcile_and_contain
  forbidden_in_this_action:
    - reapply_0024_or_0025
    - worker_deploy_or_rollback
    - registration_or_verification
    - bootstrap_role_or_session_mutation
    - provider_send_or_secret_flag_access_change
    - production_cms_or_real_pii_action
    - repeated_health_sql_or_analytics_polling
following_route_requires_separate_permissions:
  - deploy_exact_reviewed_candidate_then_one_bounded_cadence_health_postcondition
  - one_controlled_registration_retry_and_verification_delivery
  - second_verified_synthetic_account_then_one_shot_admin_bootstrap
  - real_preview_document_contract_email_and_telegram_flows
  - owner_full_manual_exploratory_pass
```

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

# Stage 13: current operational state

<!-- stage-13-current-review-status: independent_go -->

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-09-04T13:38:25Z
reviewed_candidate: 438a51399ac5f58b428b624c52ca2cbbc059ae9c
local_remediation_candidate: 438a51399ac5f58b428b624c52ca2cbbc059ae9c
last_completed_gate: phase-4-first-admin-login-success-reconciled
next_gate: phase-4-remaining-live-role-isolation-plan
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
current_review_status: independent_go
current_phase: phase-4-bootstrap-and-first-admin-login-complete-live-role-isolation-pending
last_atomic_action: owner-first-admin-login-on-prepared-form
last_atomic_result: success
next_atomic_action: prepare-bounded-live-role-isolation-plan-readonly
rollover_required: no
recommended_next_session_mode: Medium
mode_reason_plain: first-admin-login-reconciled-next-is-readonly-preparation-of-remaining-role-checks-no-remote-write-or-ambiguity
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
permission_state: bootstrap_and_first_admin_login_completed_authorized_linked_session_touches_reconciled_other_live_flows_not_authorized
review:
  status: independent_go
  candidate: 438a51399ac5f58b428b624c52ca2cbbc059ae9c
  last_independently_reviewed_candidate: 438a51399ac5f58b428b624c52ca2cbbc059ae9c
  unresolved_candidate_p0: 0
  unresolved_candidate_p1: 0
  local_fix: P1-BOOTSTRAP-REGISTRATION-FINALIZATION-001_resolved_by_focused_regression
  deployed_source_guard: baseline_predicate_unchanged_not_used_by_reviewed_out_of_band_cli
  verdict_scope: independent_go_baseline_full_evidence_plus_focused_changed_surface_gate_no_remote_success_claim
  validation_policy: owner_requested_candidate_specific_scoped_gate_2026_09_04
  mandatory_reviewer_tests: 8_tests_3_files_one_run
  reviewer_validation: passed_8_of_8_in_one_run_at_2026_09_04T12_12_34Z
  inspected_head: 3c386c3977b67faac42d33f15df09438e7350cd5
  scope_verified: baseline_ancestor_one_executable_guard_one_new_test_file_other_paths_docs_only_clean_worktree
  worker_deploy_required_for_cli_bootstrap: false_local_cli_renders_guard_and_executes_directly_against_pinned_d1
  full_suite_expansion: only_if_pinned_scope_fails_or_concrete_unbounded_impact_is_demonstrated
  local_validation:
    check: passed_0_errors_0_warnings
    focused_unit_integration: 52_pass_across_9_files_including_one_repaired_test_harness_rerun
    chromium_e2e: 2_of_2_affected_role_owner_csrf_scenarios
    build: passed
    full_release_gate: not_required_for_this_pinned_bounded_diff_previous_blanket_requirement_superseded
    independent_review: passed_scoped_gate_2026_09_04
  previous_candidate_release_evidence:
    candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
    check: passed
    vitest: 78_files_580_pass_1_expected_windows_skip
    chromium_e2e: 23_of_23
    build: passed
    production_dependency_audit: 0_advisories
    docs_continuity_release_scan_diff: passed
preview:
  access: enforced
  deployed_candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
  deployed_fingerprint: ad3134edb662
  traffic_percent: 100
  active_version_count: 1
  candidate_annotation_exact: true
  bindings_and_feature_gates_unchanged: true
  deployment_postcondition: success_version_access_cadence_health_and_no_send_verified
  latest_readonly_control_utc: 2026-09-04T13:38:22Z
  latest_anonymous_access_check: 2026_09_04T12_58_58Z_302_cloudflare_access_redirect_no_cookie_or_authenticated_probe
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
    latest_bounded_postcondition_utc: 2026-09-04T13:38:25Z
    postcondition_rows_read: 47
    latest_read_kind: seven_selects_first_admin_login_postcondition_accounts_sessions_sealed_control_receipts_providers_and_login_rate_limits
    preceding_preflight_rows_read: 45
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
  scheduled:
    fast: running_at_bounded_snapshot_age_under_two_seconds_no_recent_failures
    maintenance: succeeded_fresh
    fixed_cadence_rows: 2
    recent_failures: 0
    automatic_history_growth: stopped
    health: head_204_empty_no_store_noindex
  synthetic_state:
    users: 2
    parents: 1
    verified_users: 2
    admins: 1
    privacy_acknowledgements: 2
    unused_verification_tokens: 0
    used_verification_tokens: 2
    verification_commits: 2
    users_with_family_id: 2
    verification_deliveries_sent_with_receipt: 2
    welcome_deliveries_sent_with_receipt: 2
    auth_sessions: 4
    nonrevoked_auth_sessions: 1
    logged_out_auth_sessions: 2
    role_change_revoked_auth_sessions: 1
    distinct_identities: 2
    distinct_assigned_families: 2
    nonrevoked_session_owners: 1
    distinct_delivery_recipients: 2
    orphan_sessions_and_recipients: 0
    token_commit_delivery_family_and_child_owner_mismatches: 0
    first_admin_sessions_total_nonrevoked_valid: 3_1_1
    first_admin_session_version: 2
    second_parent_sessions_total_nonrevoked_valid: 1_0_0
    second_parent_session_version: 1
    second_parent_session_drift: logout_observed_after_prompt_05_not_performed_by_this_session
    owned_children_per_parent: 0
    bootstrap_control: consumed
    bootstrap_actions_assertions_audit: 1_1_1
    canonical_bootstrap_eligible_accounts: 0
    canonical_bootstrap_ineligibility_reason: control_consumed_and_active_admin_exists
    accounts_without_retained_parent_state: 2
    eligibility_guard_candidate: 438a51399ac5f58b428b624c52ca2cbbc059ae9c
    bootstrap_session_change: only_first_accounts_previously_nonrevoked_session_revoked_with_role_change
    registration_finalization_commits_per_account: 1
    registration_finalization_result: portal_allocated_assertion_passed
    other_retained_state_guard_branches_nonzero: 0
    import_pair: 2_plus_1703
  providers:
    auth_and_resend: enabled_only_behind_access_and_two_recipient_hashes
    telegram: fail_closed_until_separate_manual_preview_phase
    documents: fail_closed_until_separate_manual_preview_phase
    contracts: fail_closed_until_separate_manual_preview_phase
flow_verification:
  cost_bounded_runtime: deployed_and_bounded_scheduled_postcondition_passed
  controlled_registration: success_one_unverified_parent_one_privacy_acceptance_one_token_one_terminal_delivery
  email_verification: success_one_used_token_one_commit_one_family_assignment_one_terminal_welcome_delivery
  login_logout: historical_parent_login_logout_passed_remaining_first_session_now_revoked_by_bootstrap
  second_registration: success_one_added_unverified_parent_privacy_token_and_terminal_verification_delivery
  second_recipient_membership: owner_screenshot_email_exact_sha256_matches_protected_allowlist_slot_2
  second_verification_welcome: success_second_used_token_commit_distinct_family_and_single_terminal_welcome
  second_login: success_one_new_second_parent_session_cabinet_open_first_parent_sessions_unchanged
  prompt_05: historically_complete_at_11_23_43Z_second_session_now_logged_out
  prompt_06: partial_bootstrap_and_first_admin_login_complete_remaining_live_role_owner_csrf_denials_pending
  first_admin_bootstrap: success_one_official_cli_attempt_and_bounded_remote_postcondition
  first_admin_login: success_admin_shell_visible_one_new_valid_version_2_session_preserved_state_reconciled
  local_auth09_remediation: passed_five_regressions_plus_direct_consumers_and_affected_browser_scenarios
  role_isolation_live: admin_positive_entry_passed_remaining_cross_role_and_owner_csrf_denials_not_attempted
  rbac_csrf_owner_denial: inherited_exact_candidate_unit_and_e2e_evidence_no_new_live_claim
next_atomic_action:
  id: prepare-bounded-live-role-isolation-plan-readonly
  permission: read_only_source_docs_and_sanitized_evidence_preparation_no_new_remote_write
  target: existing_preview_fingerprint_88ed782ba25a_admin_slot_1_parent_slot_2_and_exact_deployed_source
  mutation: none_do_not_navigate_authenticated_routes_or_create_sessions_during_preparation
  preconditions:
    - successful_first_admin_login_and_preserved_state_reconciled_and_checkpoint_committed
    - use_canonical_auth09_authorization_routes_and_inherited_exact_candidate_tests
    - keep_active_admin_session_private_old_revoked_sessions_and_second_parent_unchanged
  postcondition:
    - concrete_remaining_checks_map_parent_admin_surface_denial_admin_parent_actor_denial_csrf_and_owner_denial
    - exact_routes_isolated_browser_session_requirements_expected_denials_no_send_guards_and_containment_documented
    - distinguish_session_touch_or_login_writes_from_no_business_write_denial_assertions_before_requesting_execution_scope
  success_transition: review_concrete_plan_with_owner_before_additional_live_session_or_probe_writes
  failed_or_ambiguous_transition: record_missing_precondition_preserve_access_and_existing_sessions_no_remote_retry_or_repair
  forbidden_in_this_action:
    - automatic_full_vitest_e2e_release_verify_or_nested_review
    - runtime_or_test_changes_during_readonly_plan_preparation
    - any_bootstrap_retry_direct_role_edit_control_reset_remote_deploy_rollback_or_migration
    - any_login_logout_session_repair_or_authenticated_route_probe_during_readonly_preparation
    - direct_sql_role_edit_or_deletion_of_registration_finalization_evidence
    - provider_send_or_registration_verification_replay
    - secret_flag_access_change_or_unrelated_d1_r2_write
    - production_cms_or_real_pii_action
following_route_permission_boundaries:
  - bootstrap_permission_consumed_successfully_no_remote_replay_or_reset
  - first_admin_login_completed_no_extra_login_or_logout_requested
  - any_worker_deploy_only_if_required_by_the_next_execution_surface
  - remaining_parent_login_and_live_rbac_csrf_owner_denial_session_writes_require_separate_scope
  - real_preview_document_contract_email_and_telegram_flows
  - owner_full_manual_exploratory_pass
```

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

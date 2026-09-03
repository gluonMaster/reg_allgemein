# Stage 13: current operational state

<!-- stage-13-current-review-status: independent_go -->

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-09-03T14:33:27Z
reviewed_candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
last_completed_gate: phase-4-preview-d1-0026-apply-success
next_gate: phase-4-separately-authorized-reviewed-worker-deploy
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
current_review_status: independent_go
current_phase: phase-4-preview-d1-0026-applied-awaiting-worker-deploy-permission
last_atomic_action: preview-d1-apply-0026
last_atomic_result: success
next_atomic_action: request-separate-owner-authorization-for-reviewed-worker-deploy
rollover_required: no
recommended_next_session_mode: High
mode_reason_plain: exact-worker-target-candidate-postcondition-and-containment-are-known
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
permission_state: no_remote_mutation_authorized_0026_permission_consumed
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
  target_fingerprints:
    account: 5dbd04a4763a
    worker: 242c1796e930
    origin_host: 88ed782ba25a
    d1: ccdeb22bb2a1
  d1:
    applied_through: 0026_background_d1_cost_controls.sql
    pending_exactly: []
    last_recorded_foreign_key_violations: 0
    quota_precondition: confirmed_by_account_analytics_2026_09_03T14_20_50Z_consumed_by_successful_apply
    integrity_postcondition: passed_10_affected_table_scoped_quick_checks_fk_zero
    migration_attempted: true
    migration_result: success
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
    remediation: migration_0026_applied_reviewed_candidate_deploy_pending
next_atomic_action:
  id: preview-worker-deploy-reviewed-candidate
  permission: separate_explicit_owner_authorization_required
  target: exact_dedicated_access_protected_preview_worker_from_protected_config
  mutation: deploy_only_reviewed_candidate_0db38842524ebc146eaa56a9d089e3c3484bf0f3
  preconditions:
    - worktree_is_clean_docs_only_descendant_of_reviewed_candidate
    - protected_target_record_matches_preview_and_excludes_production
    - reviewed_candidate_and_compatible_previous_worker_match_protected_record
    - access_redirect_and_exact_preview_bindings_are_unchanged
    - preview_d1_ledger_is_0001_through_0026_with_pending_zero
    - current_version_and_rollback_or_containment_are_known
  postcondition:
    - exact_reviewed_worker_version_receives_100_percent_preview_traffic
    - access_and_exact_d1_r2_kv_queue_and_secret_bindings_remain_unchanged
    - one_bounded_cadence_and_health_postcondition_after_the_required_wait
    - automatic_historical_ledger_growth_is_stopped
  success_transition: request_separate_permission_for_controlled_registration_retry
  failed_or_ambiguous_transition: stop_reconcile_and_rollback_only_with_explicit_permission
  forbidden_in_this_action:
    - deploy_without_separate_owner_authorization
    - migration_reapply_or_unrelated_d1_r2_write
    - registration_or_verification
    - bootstrap_role_or_session_mutation
    - provider_send_or_secret_flag_access_change
    - production_cms_or_real_pii_action
    - repeated_health_sql_or_analytics_polling
following_route_requires_separate_permissions:
  - one_controlled_registration_retry_and_verification_delivery
  - second_verified_synthetic_account_then_one_shot_admin_bootstrap
  - real_preview_document_contract_email_and_telegram_flows
  - owner_full_manual_exploratory_pass
```

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

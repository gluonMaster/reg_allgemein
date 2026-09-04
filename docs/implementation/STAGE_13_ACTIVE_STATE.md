# Stage 13: current operational state

<!-- stage-13-current-review-status: independent_go -->

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-09-04T10:39:55Z
reviewed_candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
last_completed_gate: phase-4-first-registration-verification-login-logout-success
next_gate: phase-4-second-registration-owner-input-and-recipient-check
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
current_review_status: independent_go
current_phase: phase-4-prompt-05-preflight-passed-registration-not-attempted
last_atomic_action: preview-owner-second-session-logout
last_atomic_result: success
next_atomic_action: validate-owner-entered-second-recipient-before-registration-post
rollover_required: no
recommended_next_session_mode: Medium
mode_reason_plain: next-action-is-private-browser-input-and-read-only-recipient-validation-before-any-post
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
permission_state: prompt_05_single_second_registration_verification_delivery_and_login_authorized_unused_welcome_not_authorized
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
  deployed_candidate: 0db38842524ebc146eaa56a9d089e3c3484bf0f3
  deployed_fingerprint: ad3134edb662
  traffic_percent: 100
  active_version_count: 1
  candidate_annotation_exact: true
  bindings_and_feature_gates_unchanged: true
  deployment_postcondition: success_version_access_cadence_health_and_no_send_verified
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
    latest_bounded_postcondition_utc: 2026-09-04T10:39:55Z
    postcondition_rows_read: 69
    postcondition_rows_written: 0
  scheduled:
    fast: succeeded_fresh
    maintenance: succeeded_fresh
    fixed_cadence_rows: 2
    recent_failures: 0
    automatic_history_growth: stopped
    health: head_204_empty_no_store_noindex
  synthetic_state:
    users: 1
    parents: 1
    verified_users: 1
    admins: 0
    privacy_acknowledgements: 1
    unused_verification_tokens: 0
    used_verification_tokens: 1
    verification_commits: 1
    users_with_family_id: 1
    verification_deliveries_sent_with_receipt: 1
    welcome_deliveries_sent_with_receipt: 1
    auth_sessions: 2
    nonrevoked_auth_sessions: 1
    logged_out_auth_sessions: 1
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
  login_logout: success_current_session_revoked_one_owner_created_parallel_session_remains_active
  second_registration: not_attempted_readonly_preflight_passed_owner_recipient_input_pending
  second_recipient_membership: protected_allowlist_unchanged_actual_browser_value_not_yet_checked
  second_verification_welcome: automatic_one_welcome_requires_explicit_additional_delivery_permission
next_atomic_action:
  id: validate-owner-entered-second-recipient-before-registration-post
  permission: prompt_05_readonly_preparation_for_authorized_single_second_registration
  target: existing_access_protected_preview_registration_browser_form
  mutation: none
  preconditions:
    - prompt_04_success_checkpoint_committed
    - bounded_prompt_05_preflight_passed_first_account_aggregate_state_unchanged
    - owner_enters_only_second_previously_approved_email_in_browser_not_chat
    - do_not_submit_or_read_password_token_cookie_or_verification_link
  postcondition:
    - normalized_browser_email_hash_matches_protected_allowlist_without_disclosing_identity
    - owner_confirms_second_distinct_previously_approved_recipient
    - no_registration_post_or_provider_send_during_input_check
  success_transition: owner_submits_one_authorized_second_registration_then_bounded_reconcile_and_docs_checkpoint
  failed_or_ambiguous_transition: stop_before_post_preserve_unused_permission_and_first_account
  forbidden_in_this_action:
    - registration_retry_resend_or_verification_link_replay
    - registration_post_before_second_recipient_membership_check
    - first_account_login_logout_edit_or_session_cleanup
    - second_verification_before_explicit_one_welcome_delivery_permission
    - bootstrap_or_role_mutation
    - repeat_deploy_or_rollback_without_new_explicit_owner_authorization
    - migration_reapply_or_unrelated_d1_r2_write
    - bootstrap_role_change_or_unrelated_session_mutation
    - unrelated_provider_send_or_secret_flag_access_change
    - production_cms_or_real_pii_action
    - repeated_health_sql_or_analytics_polling
following_route_requires_separate_permissions:
  - optional_early_revocation_of_the_known_remaining_owner_created_session
  - one_automatic_welcome_delivery_to_second_recipient_at_verification
  - one_shot_admin_bootstrap_after_two_verified_synthetic_parents
  - real_preview_document_contract_email_and_telegram_flows
  - owner_full_manual_exploratory_pass
```

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

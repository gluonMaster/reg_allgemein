# Stage 13 — Prompt 08 contract phase manifest

Prepared: 2026-09-06. This document records prospective scopes and dated preparation evidence; current execution/permission status is in active state.
Current operational facts and the one next action remain in
[active state](STAGE_13_ACTIVE_STATE.md). This manifest specifies the prospective
scope; it is not permission, a passed Browser spike, or production/legal approval.

Requirements: `SYS-04`, `CONTRACT-21`/`CONTRACT-22`, `OQ-036`,
[Contracts](../domain/CONTRACTS.md),
[Browser/email runbook](../operations/OPERATIONS_RUNBOOK.md#7-проверить-browser-quota-и-contract-rendering),
[deployment protocol](../operations/PRODUCTION_DEPLOYMENT.md),
[import pipeline](../operations/IMPORT_PIPELINE.md).

## Read-only inventory and protected evidence

Protected current-user-only, Git-ignored folder: `tmp/contract-phase-08-owner/`.
Full target IDs, version IDs, provider configuration, recipient membership and
generated bundles remain there. No Office file, PDF body, credential or client
source was opened. No authenticated app request, session, provider call,
Browser render, D1/R2 mutation or deployment was attempted.

At `2026-09-06T18:01:07.463Z`, exact active version/settings/bindings and both
Cron schedules matched the completed document phase. Anonymous HEAD returned
302 to Cloudflare Access. `BROWSER` exists with type `browser`; `RESEND_API_KEY`
exists as a secret binding. Secret values were not read. EU archive/quarantine
remain distinct; r2.dev disabled, custom domains absent, no enabled object-delete
lifecycle rule. This is bucket configuration evidence, not a bucket body dump.

| Target | Sanitized fingerprint |
| --- | --- |
| Account | `5dbd04a4763a` |
| Worker | `242c1796e930` |
| Origin host | `88ed782ba25a` |
| D1 | `ccdeb22bb2a1` |
| R2_ARCHIVE | `3996cebdabb0` |
| R2_QUARANTINE | `442dca1871ce` |

The 12 SELECT inventory statements read 942 rows; a separate bounded course
availability query read 2 rows. All reported zero writes/changes and
`changed_db=false`. Ledger is exactly through 0026. There are no contract
templates, offers, artifacts, render attempts, certificates or contracts.
All 11 sessions are revoked. Six historical auth messages are terminal `sent`
with receipts; no pending/uncertain email exists. Two document storage intents
and the approved private D0 remain preserved.

The first control-only attempt stopped because the local helper incorrectly
required an explicit false value for an optional preview flag. The flag is
absent, which the canonical runtime interprets as false. No D1/R2 inventory
had started. After correcting only that local predicate, one bounded inventory
completed. This was not a failed remote mutation or deployed configuration drift.

## Exact templates and expected hashes

All four bundles use `preview-review-v1`, `contract-render-v1`,
`contract-render-source-bundle-v2`, `contract-html-renderer-v1`,
`cloudflare-browser-run-pdf-v1`, `pdf-adapter-v1`, compatibility `2026-03-24`,
scope `preview_review`, status `approved`, basis `internal_preview_review`.
The UI installer selects these v1 versions; available v2 source is not silently
substituted. Row ID pattern: `contract-template:preview-review:<template_id>:v1`.

| Alias / template ID | Bundle bytes | Expected bundle SHA-256 |
| --- | ---: | --- |
| OY / `group_yearly` | 125309 | `dbf0b028ceb042834ee75abee319b37080696799655ec855e12bd5f406506468` |
| OM / `group_monthly` | 125027 | `d9cfbd5f0e8246dc9546218125d77b474b4ac641728edc4522c8f344592a2481` |
| OI / `individual_hourly` | 125045 | `644560c6baa039d72934dc4762a7419fc26c372e40a713eaf821642cc0646743` |
| ON / `nachhilfe_hourly` | 125062 | `0b7047556cf719693258194e704627042cf6a1c1f84fc099778d5f978d03b10a` |

`bundles-safe.json` records exact HTML-source, CSS-source, provider/payment/legal/
media and both embedded font hashes. The pure canonical bundle builder verified
font bytes; it did not invoke any PDF adapter or provider. Contract/template/
email/operations/migration source matches the deployed source candidate recorded
in active state. Generated bundle bytes are retained privately for comparison
with the real installation.

Every offer input must contain `previewReviewMarker=synthetic-no-pii`.
Each PDF page must visibly carry
`TEST/ENTWURF — nicht für reale Vertragsbeziehungen`; all four attachment emails
must have `[TEST/ENTWURF]` subject and the notice in their text. Inspect actual
pages, Unicode, long fields, page breaks, provider information, price/payment,
Widerruf information and forms after the real render.

An actual offer UUID, reserved contract number and timestamps are allocated by
the server. Therefore actual render-input/source/HTML and PDF hashes cannot be
invented in this preflight. After each authorized draft, bind its returned ID,
number and immutable input to the selected bundle and calculate the exact
expected input/source/HTML hashes **before** render. After render, record actual
PDF SHA-256 and size and require equality across D1, R2, owner/admin downloads
and email attachment. Do not demand byte-identical independent Chromium renders.

## Actors, service prerequisites and recipient

| Alias | Exact role in this scenario |
| --- | --- |
| A, actor fingerprint `e2b29269d4e8` | Existing verified active admin; install, create offers, formation and audited downloads |
| P2, `699b2f82b987` | Existing verified active parent, owns C2/Q2/QD/FD/D0; accepts OY |
| P1, `f7ad8dc355aa` | Existing other parent for denied offer/PDF/certificate access |
| P2 recipient, normalized digest prefix `7c1f9b0ac168` | The sole proposed recipient for these four PDF emails; exact existing allowlist membership and no pending email change verified |

The three-recipient allowlist stays unchanged. Full digests are protected;
never substitute A's or P1's mailbox for the offer owner. Credentials remain
owner-entered in separate normal browser sessions. Each login/logout and each
audited read gets its own postcondition/checkpoint. Session last_seen changes
and normal redirect GETs are part of the corresponding command evidence.

Q2 is an individual/self-pay draft v1, tariff 3000 cents/45 minutes. QD is a
Nachhilfe/Jobcenter draft v1 with the same statutory unit rate. FD is
`pending_review` with no validity dates. D0 is already approved/current/archived:
16954 bytes, SHA-256
`827fbc61bdd6ec453cccdbf2a80f1b1aa036069ca246182ebf4e86659afffd81`.
Do not re-upload, re-scan or re-approve D0 for this phase.

Required order is P2 submit Q2, P2 submit QD **while FD remains pending**, then
A approves Q2, A approves FD with an explicit synthetic inclusive interval,
and A approves QD. Approving FD before QD submission would miss that route's
pending-authorization document predicate. Proposed FD and ON interval:
2026-09-07 through 2026-09-30, within the existing current academic period
(2026-08-17 through 2027-07-09). These are proposed test inputs, not an
unrecorded rule or a real funding decision. Revalidate dates when execution starts.

At the initial inventory, no course groups existed in this preview. The ordinary admin catalog
can update existing groups but cannot create them. Two synthetic 90-minute
groups GY/GM are prepared in `synthetic-schedule.json` and its matching HTML;
the canonical parser compared 2/2 blocks and passed. Proposed prices use
canonical `fallback_90`: yearly 4600, monthly 6000 cents per base month.
Do not claim an imported price quote or override that was never created.
Expected group fingerprints are `90886bf5bcc5` and `58cb630926ac`.

Schedule source SHA-256:
`7dd7b8d044dc91fafcd1eb0dffb250f5ac074ab16261d5337fa179f0c474e4c4`.
Canonical schedule version hash:
`85d4678dbee86376391a4dd180a8b5117c1e10f587ce9a261c036f12351fb45a`.
`schedule-plan.json` records the exact period, dependencies, run fingerprint and
group IDs. The local-only import CLI must not be repointed at remote D1.
A bounded remote schedule driver, transaction rehearsal, stage/promote
postconditions and first-publication containment must be ready before asking
for that separate import permission. This prerequisite is **not yet an
executable remote import**; raw SQL insertion is not the proposed workaround.
It does not prevent reviewing the independently prepared config delta below.

## Minimal configuration proposal — separate permission

`config-plan.json` is prepared for one strict deploy of the unchanged exact
detached source/build. Strict dry-run passed; source checkout config was restored
and the primary ignored config stayed unchanged. Resulting module SHA-256:
`eef5af208fbe323060cda90ef4a949457480e54faaca6c7c1c9efa0295c5c92b`.
No new secret, Browser resource, origin, Access, bucket, dependency or migration
is proposed.

| Variable | Observed → proposed |
| --- | --- |
| CONTRACT_SEND_ENABLED | false → true |
| CONTRACT_PREVIEW_REVIEW_ENABLED | absent, effective false → true |
| CONTRACT_RENDERER | disabled → browser_run |
| SCHEDULED_JOBS_ENABLED | true → false, temporary supervised containment |
| SCHEDULED_OUTBOX_BATCH_LIMIT | 25 → 1, temporary bounded manual drain |

The last two settings are necessary for this unchanged-runtime procedure.
The deployed contract trigger creates email rows with `max_attempts=5`; changing
`EMAIL_MAX_ATTEMPTS` does not change that trigger. Resend network/invalid-response
errors are retryable, and email stale processing can be reclaimed. Thus ordinary
Cron cannot guarantee the prompt's stop/no-blind-resend condition. With Cron
stopped and manual batch limit one, no later provider request happens without
the next explicit operator command. Do not manually drain after failure/unknown.

The normal `/admin/operations?/run`, `jobName=email_outbox`, confirmation and
fresh idempotency key remain usable with scheduled jobs disabled. Before each
authorized send require **exactly one** actionable email row, belonging to the
approved current action; a generic drain is not an exact-ID send API.

This temporary stop also pauses maintenance/cleanup and deliberately changes
operations health to empty 503, no-store/noindex. Existing Cron schedule entries
are retained. It is not a new runtime health incident and cannot be the final
full-manual-preview state. Keep the interval supervised; no automatic restore.

Config preflight: fresh exact version/settings/targets, private R2, Access,
empty actionable outboxes and no in-flight scheduled lease. Postcondition:
one returned version at 100%, same module, exactly the five allowed values
changed, same resources and no business/session/provider delta. A config-only
rollback to the prior version is permissible only with separately granted
rollback scope, no foreign drift and before newly queued email/business work.
After scenario work begins, that old version would resume Cron: it is forbidden
as a blind rollback with held or uncertain email. Preserve stopped Cron until
exact-row reconciliation permits a separately authorized restoration.

## Prospective operations and permission boundaries

These commands are a proposed sequence, not cumulative authorization. Existing
Prompt 07 permission is consumed. Every application command may contain its
normal internal D1/R2 writes; checkpoint its entire logical outcome before the
next operator command. Never parallelize the four render/send actions.

| Phase/action | Expected bounded result / gate |
| --- | --- |
| C00 config | One separately authorized deploy and checkpoint; no session/render/send |
| C01 schedule preparation/import | Driver/rehearsal passed; C01a stage and C01b promotion need separate bounded scope/checkpoints; 2 GY/GM groups and 2 sessions, no real source |
| C02 normal sessions | A and P2 enter their own credentials; distinct user IDs, correct server roles |
| C03 template install | One normal `installPreviewReview` command; 4 generation-bound private R2 JSON objects, matching template/provider/media rows, terminal install assertion and audit; zero Browser calls |
| C04 prerequisites | Q2 submit, QD submit, Q2 approve, FD approve, QD approve: 5 individually checkpointed commands; D0 preserved |
| C05–C08 drafts | One OY/GY, OM/GM, OI/Q2 and ON/QD draft each; 4 unique consumed contract numbers, owner P2/C2; verify exact source/template/service relation before render |
| RY, RM, RI, RN | Separately enumerated `renderSend` commands: one real BROWSER PDF each, one HTML + one PDF R2 object each, 2 linked intents/artifacts, exact current offer hash, one `contract.sent` outbox row each |
| EY, EM, EI, EN | Separate permission for these 4 PDF emails to P2; one manual normal-outbox dispatch per action after artifact/recipient checks; terminal receipt and owner-confirmed arrival |
| C09 owner review/accept | P2 downloads all 4 offer PDFs; accepts only exact current OY contract hash with current payable acceptance text; one parent acceptance, no contract yet |
| C10 formation | A differs from P2; one `formActivate` on OY; one contract and active group enrollment, one certificate rendered/stored once, distinct actor evidence |
| C11 artifact checks | P2 downloads certificate; A downloads all 4 offer PDFs and certificate through purpose-bound CSRF POST; compare bytes/hash, owner/admin audits |
| C12 negative owner | P1 normal login; deny existing OY and its offer PDF/certificate; no bytes or successful delivery audit; check correct 404/authorization branch |
| C13 closeout | Normal logout of all scenario sessions; exact bounded D1/R2/provider reconciliation, then separately authorized safe Cron/batch restoration and fresh successful cadence/health |

Renders cannot be treated as delivery-free: `renderSend` immediately projects
into the common email outbox. Four attachment-email permissions are separate
from Browser/R2 permissions. The certificate is a **fifth** Browser/PDF
operation and is additional to RY/RM/RI/RN. Template installation is four
additional R2 JSON writes, not a Browser render.

There are **six additional automatic notification rows** in this normal flow:
`request.received` for Q2 and QD (the transient submitted state triggers them),
`request.decision` for each approval, `contract.accepted` for OY and
`contract.formed` for OY. Thus a completely delivered normal lifecycle has
10 emails, not 4. None of the six is authorized by the four-PDF-email permission.
Before the action that queues each one, obtain its own bounded delivery scope
or an explicit exact-row hold/cancel decision. Do not cancel, alter triggers,
send or silently discard them to force a four-email report. The current
attachment resolver adds preview marking only to `contract.sent`; do not claim
these auxiliary notifications have that marking or PDF attachments.

## Verification, cost bounds and stop conditions

Browser must be the existing binding's real Quick Action `pdf`, using inline
self-contained HTML, JavaScript false, HTTP(S)/protocol-relative request
rejection, print/A4/tagged options, action timeout 30 seconds, cacheTTL zero.
Verify [current Cloudflare PDF options](https://developers.cloudflare.com/browser-run/quick-actions/pdf-endpoint/).
No fallback provider, network-enabled source, public temporary URL or re-render
of an accepted/ready artifact is permitted.

Planned successful writes: 4 template JSON objects + 8 offer HTML/PDF objects +
1 certificate PDF = 13 private archive objects. Bound template/HTML at 2 MiB
each and PDF at 10 MiB each: at most 66 MiB for those objects, excluding the
already retained D0. Exactly 5 successful Browser renders, no automatic rerender;
at most one attempt for each under the initial bounded permission. Existing
configured daily Browser guard remains 60000 ms. Observe actual usage and leave
30 seconds of headroom before another call; include the certificate in operator
accounting because the offer-attempt table alone does not cover it. Missing
usable provider-time evidence means stop and reconcile; do not increase quota
or claim a hard billing cap.

Initial email send permission covers at most 4 provider requests, one per
approved PDF. The 6 auxiliary requests require additional permission. An
owner-confirmed receipt is separate from a provider-accepted request ID.
Resend [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
have a 24-hour retention window; this is not indefinite delivery certainty.
On timeout, invalid response, lost lease, retry/dead or unclear mailbox status:
stop; keep Cron off; preserve exact outbox/source/dedupe/artifact IDs and hashes;
read-only reconciliation only, no resend. A `dead` error or missing receipt is
not evidence that the provider did not accept the email.

Budget normal sessions at 3 logins/3 logouts using isolated browser sessions,
5 owner and 5 admin artifact downloads, 3 negative-owner requests, plus the
listed commands and only required form/redirect GETs. No refresh loops, broad
E2E, polling, repeated SQL scans or load test. Before the authorized execution
window take one bounded Worker/D1/Browser usage baseline, and one final
observation at closeout. Intermediate checks are exact action postconditions.
Account analytics include Cron/other requests and are not an invoice.

Classification for this milestone: missing GY/GM and unapproved Q2/QD/FD are
P1 data prerequisites, not evidence that the reviewed runtime regressed.
Automatic email retry conflicts with this prompt's provider certainty procedure;
the proposed two containment settings address it without runtime refactoring.
Unexpected source/hash/owner/target, partial installation, missing watermark,
same-actor formation or external rendering network blocks execution immediately.
No failed/ambiguous remote result currently exists. Production stays blocked.

Prepared validations: exact template/embedded-font hashes, 2-block schedule
parser/HTML comparison and exact-bundle config dry-run. Tracked changes are
documentation only; use `npm run docs:check`, `npm run release:scan`,
`git diff --check`. Reuse full runtime/E2E/build and independent-review evidence
from active state; do not rerun it for this manifest. A later new import driver
requires its own focused transaction checks before it can execute.


## C01 executable plan after C00 — 2026-09-06T22:25:35Z

C00 completed with an actual same-module five-value deploy; current state is
recorded only in [active state](STAGE_13_ACTIVE_STATE.md), checkpoint 3ea61a9.
The local/read-only C01 preparation is now complete. Runtime source, schema and
dependencies are unchanged. No schedule import permission has been consumed.

The ignored driver tmp/contract-phase-08-schedule.mjs and protected
tmp/contract-phase-08-owner/schedule-driver-plan.json pin the current preview,
period, one run ID, source/HTML/version/run hashes and the two synthetic group
IDs already listed above. Before remote execution it requires clean reviewed
canonical import source, exact driver hash and live deployment/settings, empty
initial schedule scope, zero active sessions/offers/actionable email, plus the
explicit per-command permission marker. The local-only import-references CLI
is not repointed at remote. The canonical RemoteD1Boundary is used directly.

| Command | Finite expected result | Required boundary |
| --- | --- | --- |
| C01a: node --import tsx tmp/contract-phase-08-schedule.mjs stage | 1 validated run, 1 unpublished version, 2 draft groups, 2 noncurrent sessions, 0 issues; 5 internal write requests | Actual scoped postcondition; active state and docs-only commit before C01b |
| C01b: node --import tsx tmp/contract-phase-08-schedule.mjs promote | Same version published, 2 published groups and 2 current sessions, 1 promotion event and linked system audit; 3 internal write requests | Only after exact C01a success and committed checkpoint; actual postcondition and next docs-only commit |

The final driver passed nine focused local transaction/guard checks, including
no-write duplicate staging, read-only idempotent promotion, wrong environment,
ambiguous promotion transport with all subsequent cleanup writes blocked, and
zero FK violations. Tests use disposable local D1 with all 26 migrations and
the existing RemoteD1Boundary request/response serialization; no live write.
Separate read-only evidence confirms the real schedule scope is empty.

This is the first schedule publication, so canonical rollback has no previous
schedule version to restore. Failure containment is explicit: preserve hidden
staging or the two synthetic published groups behind Access, keep Cron paused,
start no offers, reconcile recorded exact IDs/hashes and stop. Do not delete,
directly repair, restore the database, retry, or run a repository cleanup write
after failure. A successful publication still requires the normal checkpoint
before any contract prerequisites, Browser render or provider command.

The owner is asked only for C01a and conditional C01b. This scope creates no
account/session, document, offer, PDF, R2 object or email. All later permission
boundaries in the prospective operations table remain intact.


## C02a / C03 / C02z bounded native UI plan — 2026-09-06T22:45:50Z

The C01 schedule prerequisite is complete; its actual evidence and permissions
are recorded only in [active state](STAGE_13_ACTIVE_STATE.md), checkpoints
e09962a and 26482b3. This next plan is fully prepared and still needs owner scope.

| Command | Scope and actual postcondition |
| --- | --- |
| C02a | One normal owner-entered A login at /auth/login. Exactly one new admin session at session_version 2; all 11 old sessions remain revoked, roles and business/provider state preserved. Read-only checkpoint and docs-only commit. |
| C03 | Once at /admin/contracts: press “Vier Preview-Prüfvorlagen bereitstellen” using its normal CSRF form. Exactly the four IDs/versions/bytes/hashes in the template table; four private archive JSON objects, four linked generation-bound intents and four passing assertions, one provider/media pair and one A audit. Compare bounded R2 body hashes with D1 and prepared bundles, then checkpoint and commit. |
| C02z | One normal logout of only the new A session after the C03 checkpoint, also permitted following a failed/ambiguous install checkpoint. Confirm zero active sessions and otherwise preserved state, then checkpoint and stop. |

The four template IDs are group_yearly, group_monthly, individual_hourly and
nachhilfe_hourly. Total expected bundle size is 500443 bytes. There are zero
Browser calls, PDFs, offers and email sends in this scope. P2/P1 login, draft
creation, requests/funding decisions, all renders and all provider sends remain
separate. Passwords are entered by the owner in the normal form, never in chat.

Exact protected plan: tmp/contract-phase-08-owner/template-install-plan.json,
SHA-256 3851ad7dca9071b00dc58414ff1297517ddbdab77a2868e28fc972ab862e9c4f. Read-only plan evidence confirms
live version/settings/Access/private EU buckets and the empty template scope;
seven SELECTs read 68 rows with zero writes. Source matches deployed login and
contract installation; only the previously reviewed role-transition guard is a
known local difference and is not invoked here. Existing exact-source template
installation transaction/immutability regression evidence is reused.

The installer may create its four objects concurrently inside one logical
command. On failure, wait for the command's internal work to settle and reconcile
all four exact intent families and object keys before classifying the result.
Preserve bounded private artifacts, keep Cron paused, record the actual failure
checkpoint; no retry, deletion, repair, restore, provider send or redeploy is
included. Logout is a separate already-enumerated containment command and must
follow that checkpoint. No production/legal approval is granted by installation.

## C05–C08 six-command draft scope prepared — 2026-09-07T13:17:45Z

This dated proposal follows C04 closeout and does not grant execution. Current
permission and the next action remain solely in active state. Protected plan:
`tmp/contract-phase-08-owner/C05-draft-plan.json`, SHA-256
`d6db09a96f141f0522a89d0d5093b6c74372961e2d30a6c3444d2a6f772268a0`.
Exact form payloads, full targets and synthetic party fields stay private.

| Command | Proposed normal operation and actual postcondition |
| --- | --- |
| C05-A-login | One owner-entered A login; one new version-2 session, all 14 historical sessions remain revoked |
| C05 / OY | One createDraft for GY and P2/C2; group_yearly, fallback_90, 4600 cents base monthly; one reserved number and one draft enrollment |
| C06 / OM | One createDraft for GM and P2/C2; group_monthly, fallback_90, 6000 cents base monthly; one reserved number and one draft enrollment |
| C07 / OI | One createDraft for approved Q2 and P2/C2; configured_individual_hourly, 3000 cents per 45 minutes; one reserved number and one draft service engagement |
| C08 / ON | One createDraft for approved QD/FD and P2/C2; fixed_nachhilfe_hourly, 3000 cents per 45 minutes, parent not payer; one reserved number and one draft service engagement |
| C08-A-logout | One normal logout of only this new A session; matching revocation audit, zero active sessions; also permitted after a failed checkpoint if the packet is granted |

All four offers use the exact installed v1 templates, synthetic marker and
explicitly artificial party text with Unicode/long names. Proposed service start
is 2026-09-07; ON ends 2026-09-30 inclusive, matching approved FD. Other service
end dates are null. Offers expire at 2026-09-14T21:59:59.000Z. Self-pay inputs use
manual payment, due day 7; ON uses not_applicable and no due day. These are
proposed synthetic inputs, not a change to business rules. Group quotes/version/
rule IDs and manual override are absent, as supported for preview_review;
no imported price quote is claimed. Canonical template provider/term/legal
overrides are retained.

Each draft must be version 1/status draft, linked to its exact service and
owner/child, with one linked create action, passing assertion and A audit.
Four distinct server-issued contract numbers are consumed; they must never be
reused after failure or expiry. Each native form uses its fresh CSRF and
idempotency key. This packet has zero Browser/PDF/R2 writes, email sends,
acceptances, formations or configuration changes. Native draft creation reads
the installed template bundle and generates source/HTML hashes internally.
After each draft, verify its actual server ID/number/input and calculate the
corresponding source/input/HTML hashes for the future render scope. Provisional
local validation IDs/hashes are not actual offer evidence.

Read-only preparation used 15 bounded SELECTs, 94 rows read and zero writes;
live version/settings matched. Four canonical createDraft validations reached
an intercepted persistence boundary locally; no remote write implementation or
PDF adapter was called. Exact local bundle/source and HTML validation passed
4/4. The first local probe rejected an undefined weekday label in this ignored
planner; mapping the existing MO/TU source codes resolved it before the immutable
plan was saved. No deployed defect or remote mutation resulted.

Before execution recheck plan hash, exact target/version/settings, roles,
owner/family/number state, service/template eligibility and zero actionable
outbox. After every attempted command reconcile its actual delta and preserved
state, save active state and a separate checked docs-only commit. On failed or
ambiguous result stop, preserve Access/Cron pause/batch1, record containment and
only then perform the packet's conditional new-session logout. No repeat,
cancel, repair, deletion, number reuse or rollback is included. Browser/R2/PDF
and recipient-specific email actions require their separately prepared scope.

Validation: canonical local draft/source checks above, docs:check, release:scan
and git diff --check. Unchanged runtime retains exact reviewed 4a8c028 full
Vitest/E2E/check/build evidence; no new runtime or general regression run.

## Four actual offers: render/email packet prepared — 2026-09-07T13:58:19Z

This is the next finite proposal after the six-command draft packet. Current
permission is solely in active state. Protected exact plan:
`tmp/contract-phase-08-owner/R-four-render-email-plan.json`, SHA-256
`6e56609245c1aa44dfafc453647dcbec33a5790cd31e6646294601d8750a1898`.
Full offer IDs, native keys, numbers and recipient identity remain private.

| Offer | Actual offer fingerprint | Exact HTML bytes | Render / email commands |
| --- | --- | ---: | --- |
| OY / group_yearly | 4042215b8d6c | 123656 | RY / EY |
| OM / group_monthly | f23f9e13e081 | 123386 | RM / EM |
| OI / individual_hourly | e48881cd91a0 | 123189 | RI / EI |
| ON / nachhilfe_hourly | 7a4efe22f43d | 123187 | RN / EN |

Sequence: R-A-login, RY, EY, RM, EM, RI, EI, RN, EN, R-A-logout. This grants,
only if approved, one new ordinary A session and logout, four separately
enumerated Browser/R2 operations and four separately enumerated PDF-email
operations to the existing allowlisted P2 recipient. All 15 historical
sessions must remain revoked; only the packet's new session may be touched.
Each operator command is attempted once, followed by its own actual
postcondition and checked docs-only checkpoint commit before the next command.

Each native renderSend uses its exact current offer form and unchanged source
hashes, calls the real existing BROWSER binding once, stores one HTML and one
PDF in private EU archive, and links exactly two intents/artifacts and their
assertions. It sets the exact offer sent/ready, its linked service
contract_offered, creates one available portal delivery, one render attempt,
one render action/assertion/audit chain, one offer_available event and one
pending contract.sent email. The source event's generated ID binds the actual
email ID; its dedupe key must be email:offer-available:<exact offer ID>.
The transport trigger marks the domain event consumed after projecting its
email row. The domain event is not an additional actionable email. This status
was confirmed against the deployed trigger and actual RY event; the initial
local pending expectation was corrected read-only without another render.

Rendering immediately queues email; the paused Cron/batch1 settings are
preserved. Before every email dispatch require exactly one actionable row,
bound to the just-checked offer, P2, current address, locale de and contract.sent.
Resolve its exact current PDF attachment read-only and compare bytes/SHA/size
with the verified R2 PDF. Require TEST-ENTWURF filename, [TEST/ENTWURF] subject
and marked body. One native manual email_outbox run must yield one terminal
receipt, attempts 1, no error/lease and zero actionable rows. Provider acceptance
and owner mailbox confirmation are separate evidence; no resend on uncertainty.

PDF inspection uses bounded operator R2 reads of only the two new keys for
the exact offer, preserving bodies in owner-only ignored evidence. Verify
PDF magic, size and actual SHA, reconstruct the contract hash, render every
actual PDF page to PNG with Poppler and inspect watermark, Unicode, long names,
wrapping, page breaks, provider, terms, price and Widerruf information/form.
pypdf/pdfplumber are available for text/page checks. This operator inspection
does not claim the later required owner/admin audited application downloads.
No render adapter or PDF was invoked during preparation, and no PDF hash is
invented. Current input/source/HTML and external-resource guards passed 4/4.

The unchanged native options match the documented
[Cloudflare PDF binding](https://developers.cloudflare.com/browser-run/quick-actions/pdf-endpoint/):
inline self-contained HTML, JavaScript false, HTTP(S)/protocol-relative request
rejection, print/A4/tagged/outline, action timeout 30000 ms and cacheTTL zero.
The internal daily budget stays 60000 ms. Require 30000 ms available before
each call and reconcile actual observed usage; missing usage never means zero.
Keep at least 10 seconds between calls, satisfying the stricter published
[Quick Actions rate limit](https://developers.cloudflare.com/browser-run/limits/).
The four-call packet excludes the fifth certificate call; later budget planning
must include it. Six preparation SELECTs read 950 rows with zero writes and
observed no application render attempts/recorded usage. This is application
evidence, not account-wide usage or an invoice. No limit increase is authorized.

Bounded successful writes: four Browser calls, eight new R2 objects, at most
42436458 bytes (exact combined HTML plus four PDFs capped at 10 MiB each), four
email provider requests and one recipient. Keep the four templates, D0 and all
prior business/provider records. No new template, offer, number, acceptance,
formation, certificate, configuration, Cron restoration or audited app download
is included.

Stop after any failed/ambiguous attempt, hash/owner/target mismatch, malformed or
unmarked PDF, provider uncertainty, lost lease or insufficient/unknown budget.
Record actual bounded D1/R2/provider state and containment, commit checkpoint,
then only the already-enumerated conditional logout of this new A session.
No operator retry/resend/cancel/delete/repair/rollback is included. The unchanged
runtime may compensate a failure writing the PDF by deleting only that attempt's
just-written HTML and marking its two intents delete_pending; reconcile those
internal effects. Do not hide them or treat them as permission for operator
cleanup. Other partial/ambiguous objects stay private for reconciliation.

Read-only control verified the reviewed version/settings, Access redirect,
both private EU buckets and P2 recipient binding. Runtime remains unchanged;
use inherited exact 4a8c028 full-suite evidence plus current source reconstruction
and docs:check/release:scan/git diff --check. Future execution needs its own
bounded observer with capacity for 16 sessions, 14 intents and 14 emails;
do not replay consumed C04/C05 helpers or their smaller historical query limits.


## Exact owner acceptance, formation and artifact-access packet — 2026-09-07T14:41:12Z

R completed all ten commands, four real PDFs/20 inspected pages, four actual
provider receipts and four owner-confirmed PDF emails. All 16 sessions are
revoked. See active state for current control/evidence; the following **new**
packet is prepared, not granted. Protected plan:
tmp/contract-phase-08-owner/L-lifecycle-exact-plan.json; SHA-256
94312d79cef9bf65eb788217d8555f1e85946703b905ad89ecf18d44f1fe1957.

Target is unchanged Worker 242c1796e930, D1 ccdeb22bb2a1, archive 3996cebdabb0,
candidate 4a8c028/version a255463d5707. Exact OY fingerprint 4042215b8d6c,
contract hash 0bffff25474835261eb869abe0aee24c3a1f55330ef4c2dc3f529463c26f5ef6,
offer PDF SHA-256 8fc80075148eb3105affd9ed2a0b5b1b01c22fc276fe9018693b9a2d8cc47f76.
A e2b29269d4e8, owner P2 699b2f82b987 and foreign parent P1 f7ad8dc355aa
are pinned distinct current users. Existing four source/PDF artifacts remain
immutable. Local canonical acceptance/formation payload checks pass; dates,
certificate IDs and its source/PDF hashes bind only to actual formation evidence.

| Order | Exact bounded action |
| --- | --- |
| 1–2 | L-A-login, L-P2-login: one normal owner-entered login each, isolated contexts |
| 3–6 | L-P2-DY, DM, DI, DN: owner downloads each existing offer PDF once |
| 7 | L-accept: P2 accepts only current OY hash, native payable text contract-acceptance-de-v1 |
| 8 | L-email-accepted: one exact contract.accepted email to existing P2 |
| 9 | L-form: A forms/activates OY once, creates one certificate with one real Browser call |
| 10 | L-email-formed: one exact contract.formed email to P2 after certificate QA |
| 11 | L-P2-DC: P2 downloads the actual certificate once |
| 12–16 | L-A-DY, DM, DI, DN, DC: A downloads four PDFs and certificate via purpose-bound CSRF forms |
| 17–18 | L-P2-logout, L-P1-login: revoke only new P2 session, then normal isolated P1 login |
| 19–21 | L-P1-deny-detail, deny-offer, deny-certificate: three known-existing foreign-object GETs must return 404 without document bytes or successful read audit |
| 22–23 | L-P1-logout, L-A-logout: close only this packet's new sessions; all 19 revoked |

Each successful owner/admin download requires exact bytes/hash and one read
audit plus its passing owner/admin assertion. Admin offer purpose is
contract_administration; certificate purpose legal_evidence_review. No HTML or
other sensitive artifact download is included. Repeat/idempotency checks reuse
reviewed automated evidence; this packet authorizes no duplicate native action.

Both additional emails are to the single existing P2 current/allowlisted address.
Before each native manual batch1 email_outbox run require exactly one actionable
row with the expected source/dedupe/template. Afterward require one receipt,
attempts1 and zero actionable email; mailbox receipt is separately confirmed.
These auxiliary templates have no PDF attachment and do not inherit the
contract.sent preview marking; do not claim otherwise.

The deployed transport trigger also projects one bureau.contract_signal
Telegram row at acceptance, dedupe telegram:parent-accept:<exact OY ID> and
ID telegram:contract:<actual acceptance domain-event ID>. The proposed scope
explicitly holds that one induced row pending/not_started/attempts0, with no
Telegram request or cancellation. Current TELEGRAM_PROVIDER=disabled and
stopped Cron are preserved. Activating Telegram, disposing of this row and
restoring Cron/batch are separate future scopes, not implicit in acceptance.

Certificate maximum 10 MiB, inline HTML maximum 2 MiB, one new private R2 PDF object
only. Use the existing restricted Browser adapter; verify actual source/hash,
R2 body and every rendered page before email or application downloads. Four
offer calls recorded 1484.705810546875ms; require a fresh daily observation,
at least 30000 ms headroom and 10 seconds spacing. Certificate time is not stored
in the offer-attempt table; preserve actual call/result/timing evidence and do
not claim a complete account usage or invoice. No later Browser call is allowed
without a separate usage reconciliation and scope.

Formation commits the contract before certificate rendering. Failure may leave
an active contract, failed/pending certificate, staged intent/object and queued
email. Preserve and reconcile those exact facts; no repeat formation/render,
repair, delete, cancellation or rollback. After each attempt commit an actual
checkpoint before any next mutation. Failure permits only conditional normal
logout of this packet's new sessions after that checkpoint. Access, configuration,
roles, current offer PDFs, stopped Cron and disabled Telegram remain unchanged.
Fresh execution preflight includes one bounded Worker/D1/Browser usage baseline;
observer counts must prevent truncation at 19 sessions, 32 contract assertions,
9 artifacts,15 intents,16 emails and 1 held Telegram row. No runtime/config
change; full checks reuse reviewed 4a8c028 evidence. Preparation uses local
payload/source checks, docs:check, release:scan and git diff --check.

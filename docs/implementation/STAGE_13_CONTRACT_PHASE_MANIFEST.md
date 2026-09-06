# Stage 13 — Prompt 08 contract phase manifest

Prepared: 2026-09-06. Status: **read-only preparation; execution not authorized**.
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

No course groups exist anywhere in this preview. The ordinary admin catalog
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

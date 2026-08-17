# Production readiness checklist

Актуально на 2026-08-14. Это текущий release ledger, а не обещание будущей
готовности.

**Итог:** `blocked` — портал нельзя объявлять production-ready и нельзя
развёртывать в production по этому документу. Обязательные paths выключены либо
не имеют production evidence; remote actions отдельно не авторизованы.

## Release record

Перед оценкой конкретного кандидата заполнить все поля. Placeholder не является
evidence.

| Поле                                 | Значение                                                          |
| ------------------------------------ | ----------------------------------------------------------------- |
| Release/commit SHA                   | Current Access/Telegram/import candidate: `ca4ef8f50ea0ffc1139c2ec3d286cbdb7e4158ec`. Deployed preview remains `200268f39ece1d43c5e091dcb7db6569d41275af`; no deploy/migration/import/secret mutation/provider send was performed — overall `blocked` |
| Checklist revision                   | 2026-08-17, current-source sanitized parse and read-only preview inventory recorded; external evidence is not inferred, ordinary preview remains synthetic/no-PII, overall NO-GO unchanged |
| Preview environment/config           | Read-only recheck 2026-08-17: public root HEAD 200 and operations-health HEAD 204; Worker version `sha256:f4cd52e14dbd` remains at 100%. Remote D1 is EU/EEUR, has zero academic periods/users/import runs/current legacy snapshots/Telegram rows and reports candidate migrations `0016`–`0018` pending. A current Time Travel bookmark exists but no protected backup plus independently verified isolated restore evidence exists. Runtime remains fail-closed: public auth, email, Telegram, upload, contract renderer/send, public contract functions and online-media grant are disabled; scheduled jobs are enabled |
| Latest local worktree verification   | Exact-SHA clean clone of `ca4ef8f` on 2026-08-17: `npm ci` and full `release:verify` passed in 556.4 s — check 0/0, Vitest 63 files/472 tests, Chromium 18/18, build, production audit 0, docs 143 links/51 files + 105 commands and clean-clone scan 458/458. Independent exact-SHA traceability/security review remains pending under PR-A16 |
| Production environment/config        | `<PRODUCTION_ENVIRONMENT>` — `blocked`                            |
| Portal preview/production origins    | preview workers.dev HTTP/browser smoke passed; custom/production — `blocked` |
| Migration set                        | Deployed preview: `0001`–`0015`. Committed candidate `ca4ef8f` adds append-only `0016`, `0017`, `0018`; all three are pending on remote preview and no remote migration was authorized or executed for them |
| Operator/reviewer                    | `<OWNER_ROLE>` — `blocked`                                        |
| Release window                       | `<APPROVED_WINDOW>` — `blocked`                                   |
| RPO/RTO/cadence                      | не утверждены — `blocked`                                         |
| Production action approval           | отсутствует — `blocked`                                           |
| Exact official-site URL/surface list | отсутствует — `blocked`                                           |

## Правила статуса и evidence

- `passed`: проверка выполнена на указанной immutable version в требуемой среде;
  указаны UTC date, owner role и sanitized evidence.
- `feature_disabled`: назван конкретный fail-closed flag/path и его выключение
  проверено. Это состояние feature, а не `passed` и не release approval.
- Одобрение остаточного ограниченного scope — отдельный обязательный GO-input;
  без него общий release gate остаётся `blocked`, даже если feature корректно
  отмечена `feature_disabled`.
- `blocked`: отсутствует реализация, input, approval, rehearsal/evidence либо
  проверка failed.
- Planned или локально проверенное имя не является четвёртым статусом: без
  требуемого environment-specific evidence gate остаётся `blocked`.
- Risk acceptance не заменяет обязательную норму и не переводит `blocked` в
  `passed`.

Evidence не содержит PII, secrets, cookies, tokens, document/source bodies,
filenames, полных resource IDs или local upstream paths.

`passed` для PR-A06 означает, что traceability самой проверенной версии
worktree полна и независимо перепроверена. Этот content gate не превращает
незакоммиченный worktree в immutable release candidate и не переносит локальное
evidence на preview/production gates.

## A. Clean build, traceability и качество

| Gate                                        | Статус    | Affected path / текущее evidence                                                                                                                                   | Owner / next action                                             |
| ------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| PR-A01 Clean clone + `npm ci`               | `passed`  | Clean clone exact `200268f39ece1d43c5e091dcb7db6569d41275af`; `npm ci` exit 0, 2026-08-12                                                                          | Codex release operator                                         |
| PR-A02 `npm run check`                      | `passed`  | Immutable `200268f39ece1d43c5e091dcb7db6569d41275af`: 0 errors/warnings, 2026-08-12                                                                                | Codex release operator                                         |
| PR-A03 `npm test`                           | `passed`  | Immutable candidate: 46 files, 269/269 tests, 2026-08-12                                                                                                           | Codex release operator                                         |
| PR-A04 `npm run build`                      | `passed`  | Immutable candidate build and exact preview-config Wrangler 4.120.1 dry-run passed                                                                                 | Codex release operator                                         |
| PR-A05 `npm audit --omit=dev`               | `passed`  | Immutable candidate: production-only and full install audit 0                                                                                                      | Dependency/security owner                                      |
| PR-A06 Requirement/acceptance traceability  | `passed`  | Historical fresh Ultra audit 2026-08-12 covered the then-current 91/91 normative MVP IDs and 166 acceptance bullets, including 37 untagged bullets with stable IDs; code/test paths were reconciled and independent final re-review found no HIGH/BLOCKER for that scope. Historical PR-A06 checkpoint `release:verify` passed in 487.3 s: check 0/0, Vitest 53 files/327 tests, Chromium 2 files/8 tests, build, production audit 0, docs 136 links/51 files + 82 commands, scan 492/492. The current local [matrix](../implementation/STAGE_13_TRACEABILITY.md) maps 99/99 IDs and 175 bullets, but this expanded scope has no immutable exact-SHA independent re-review and is governed by PR-A16 | Codex Ultra independent reviewer, 2026-08-12; release operator for current candidate |
| PR-A07 `docs:check`                         | `passed`  | Immutable candidate: 137 links/51 files + 82 executable command lines                                                                                              | Codex release operator                                         |
| PR-A08 `release:scan`                       | `passed`  | Clean immutable clone: 412/412 candidates; prohibited artifact/secret/PII/control-byte findings нет                                                                | Codex release operator                                         |
| PR-A09 `release:verify`                     | `passed`  | Full clean chain on immutable `200268f39ece1d43c5e091dcb7db6569d41275af` passed 2026-08-12                                                                         | Codex release operator                                         |
| PR-A10 Forbidden artifact/PII/secret scan   | `passed`  | Immutable `200268f` clean-clone post-build scan passed and remains fail-closed for raw controls in expected text files                                             | Codex release operator                                         |
| PR-A11 Markdown links                       | `passed`  | Immutable `200268f` docs check and independent content cold-read passed                                                                                            | Codex release operator + documentation reviewer                |
| PR-A12 Full synthetic E2E                   | `blocked` | Existing connected migrated-D1 register→closure flow passed 1/1. Local Chromium 8 files/18 tests covers individual request draft→submit→admin approve→parent approved; exact catalog €46 quote and trial requested→admin confirmed→parent cancelled; support and structured absence through final admin reply, parent reread and pending email/Telegram outbox deltas; sent €46→€50 price review through parent acceptance and distinct admin confirmation to `scheduled`; six access/session/IDOR, four accessibility and three foundation cases. Contract accept/form/activate is not claimed in Browser because renderer/send remain intentionally disabled. Residual browser lifecycles: register/verify/claim, funded Nachhilfe upload/document review, enabled contract lifecycle, price admin-send and scheduled apply, authenticated preview/provider rehearsal | Extend only remaining enabled/local lifecycles; preview/provider rehearsal requires separate authorization |
| PR-A13 German accessibility/mobile/keyboard | `blocked` | Public preview smoke remains passed. Local accessibility 4/4 runs every axe rule enabled by default and requires both `violations=[]` and `incomplete=[]`; it covers deterministic 640px 200%-zoom-equivalent registration reflow, inline login-error announcement/association/focus, and 390px parent/admin no-overflow, structure, labels and keyboard focus. Literal/manual zoom, assistive-technology review, manual glyph/font review and authenticated preview evidence remain absent | UX/accessibility reviewer |
| PR-A14 Permission/IDOR/CSRF/session matrix  | `blocked` | Authenticated Chromium 6/6, catalog/trial negative branches, exact route tests and focused D1 suites cover missing/wrong/valid CSRF; child; request save/submit/cancel; document download/delete plus route-request carrier binding; trial create/cancel; contract detail/artifact and active end/attendance/media plus route-offer carrier binding; price response; thread append/close; privacy artifact access and forged subject fields remaining self-scoped. Direct actions distinguish safe 404 from owned validation/state 409; browser form transport asserts semantic denial and unchanged owner state. Contract atomicity/replay selection passed 6/6, full contracts D1 passed 13/13 and independent re-review returned GO without HIGH/BLOCKER; no Browser contract-accept claim is made. Residual: enabled contract decision lifecycle, disabled upload mutation, remaining enrollment/group-service and guessed/admin-purpose variants, preview rehearsal | Security reviewer: complete residual enabled/variant matrix, then separately authorize preview rehearsal |
| PR-A15 PII-safe logging/diagnostics         | `passed`  | Immutable `200268f`/preview `62b3cac4…`: redaction + 404/500 regression, clean-clone verify, prior PII-safe export review and current bounded stored export passed. Exact GET/404 and HEAD/204 are outcome `ok`, truncation false, with no custom log/`UNEXPECTED_SERVER_ERROR`; raw platform metadata remains outside Git, 2026-08-12 | Codex security/operations review |
| PR-A16 Resulting Access/Telegram candidate  | `blocked` | Current exact candidate `ca4ef8f` contains the expanded 99/99 normative IDs and all 175 acceptance bullets plus strict Access OLE Automation date parsing. Exact-SHA clean-clone `npm ci`, full audit, `release:verify`, clean status and sanitized scan passed; historical `200268f` evidence was not transferred. Gate remains blocked for the required independent exact-SHA traceability/security re-review and its recorded verdict | Independent reviewer + release/security operator |

## B. Migrations, import и data integrity

| Gate                                             | Статус    | Affected path / текущее evidence                                                                                            | Owner / next action                   |
| ------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| PR-B01 Empty D1 migrations                       | `passed`  | Preview initial `0001`–`0014` parity/FK/users checks passed 2026-08-10; append-only `0015` later applied, current `0001`–`0015`, pending 0 | Codex release operator                |
| PR-B02 Migrations `0014`–`0015`                  | `blocked` | Targeted operations/monitoring upgrade tests + preview remote apply passed; protected backup/isolated restore отсутствуют | Stage-13 DB/security review           |
| PR-B03 Representative upgraded D1                | `blocked` | Populated `0013 → 0015` upgrade passed; selector-rejection coverage есть; remote restore отсутствует                         | DB reviewer                           |
| PR-B04 Preview D1 migration                      | `passed`  | Authorized empty EU preview D1: initial 14/14 parity/FK/users checks, then `0015` apply and monitoring smoke; pending 0 | Codex release operator                |
| PR-B05 Pre-migration backup                      | `blocked` | Time Travel recovery point captured before apply; protected export + restore evidence absent                                | Backup/data owner                     |
| PR-B06 Current real reference import             | `blocked` | Fresh 2026-08-17 read-only non-executing parse confirms Access `access-tblkartei:v1`, 1703 source rows and 21/21 required fields. Strict OLE Automation date support reduces skipped records from 261 to 26 without relaxing adjacent numeric shapes; sanitized projection is 580 families, 713 children and 929 enrollments with 1429 review warnings, 0 errors/fatals. The remaining 26 invalid/missing birth dates and warning backlog require data-owner review. No remote stage/promote or PII-bearing preview action was performed | Data owner + separate import/privacy approval; PR-B12–PR-B16 |
| PR-B07 Dry-run/review/promote/rollback rehearsal | `blocked` | Current PlusBText is v1-compatible after fixing the styled self-closing-cell sanitizer defect. The local candidate implements exact-target remote plan/stage/review/recovery-evidence/promote/verify/rollback/roll-forward boundaries, but no authorized remote command, synthetic preview lifecycle, first-import restore or current-data rehearsal occurred | Import operator; PR-B12–PR-B16        |
| PR-B08 Current promoted legacy snapshot          | `blocked` | Production/preview snapshot не существует/не проверен                                                                       | Import/data owner                     |
| PR-B09 Family lookup 0/1/multiple                | `blocked` | Integration tests есть; remote authenticated 0/1/multiple lookup smoke не выполнен                                           | Security/data reviewer                |
| PR-B10 Unavailable/stale lookup fail-closed      | `blocked` | Domain tests есть; current promoted snapshot + remote authenticated lookup smoke отсутствуют                                 | Auth/import reviewer                  |
| PR-B11 Concurrency/idempotency critical paths    | `blocked` | D1 integration tests есть; remote critical-concurrency flow/rehearsal отсутствует                                            | DB/reliability reviewer               |
| PR-B12 PlusBText current-source parser/contract evidence | `blocked` | Fresh 2026-08-17 value-free parse confirms strict `admin-xlsm-plusbtext:v1`: 302 rows, 164 old groups, 138 targets, 61 warnings and 0 errors/fatals. Candidate `ca4ef8f` preserves the self-closing-cell regression and passed exact-SHA clean-clone verification; source-owner review is still absent | Import/data owner |
| PR-B13 Exact-target remote import runner         | `blocked` | Candidate implements plan/stage/review/recovery-evidence/promote/verify/rollback/roll-forward plus local no-D1 `confirmation` helper with exact APP_ENV/config/D1 UUID, clean exact Git SHA, schema-v3 `sourceClass`/fixture ID, opaque operators/caller timestamps, parameterized D1 boundary, bounded response/read retry, one-attempt ambiguous write, protected ignored artifacts and PII-free stdout. Preview rejects Office paths and generates its own 1703-row fixtures; production requires both read-only sources and remains hard-disabled pending remote transaction evidence. The currently available protected preview config is ignored by Git but does not contain the separately pinned `account_id` and `preview_database_id`, so the remote runner correctly fails closed before any write | Import/security owner: create and independently review the protected exact-target control config; do not relax the guard |
| PR-B14 Review-bound atomic legacy bundle         | `blocked` | Candidate migrations `0016` and `0018` plus local repository tests implement append-only release control, pairwise planner/stager/reviewer separation, transition-actor separation from reviewer, recovery-verifier separation from planner/stager/reviewer/promoter, immutable verification count contract, exact-actor failed-stage cleanup, recovery-bound atomic Access+PlusBText CAS promote, rollback/roll-forward and ambiguity reconciliation. Populated `0016`→`0018` regression keeps grandfathered unhardened plans immutable but fail-closes every lifecycle transition and requires a new hardened plan. Neither migration is deployed; remote D1 transactional/replay evidence and independent operator review remain absent | Import operator + independent reviewer |
| PR-B15 Synthetic preview promote/rollback evidence | `blocked` | Ordinary preview must use CLI-built `legacy-preview-synthetic-baseline-v1` then `legacy-preview-synthetic-candidate-v1`, each a deterministic `synthetic_preview` 1703-row/no-PII Access+PlusBText bundle with no Office paths and public auth/providers disabled. Baseline covers first plan→stage→review→recovery-evidence(`none`)→promote→verify; candidate covers reviewed delta promote, repeated reconciliation, rollback and roll-forward with exact counts/timeouts. Verified recovery bookmark/backup plus isolated restore is mandatory | Privacy/data/backup/release owners |
| PR-B16 Authorized production legacy import       | `blocked` | Current Access profile is known only as sanitized evidence: 1703 rows, 21/21 required fields, `access-tblkartei:v1` compatible. Production requires `sourceClass=current_production`, private exact-byte hashes, approved academic period and PlusBText contract, fresh allowlisted parse, backup/recovery artifact, independent plan review, separately authorized stage/review/promote, post-verify safe counts and registration lookup smoke; real PII is never uploaded to ordinary preview. Production transitions currently fail closed before API-token lookup/network until PR-B15 remote transaction evidence is implemented/recorded | Data/privacy/release owners |

## C. Environment, origin и bindings

| Gate                                                            | Статус    | Affected path / текущее evidence                                                                                                          | Owner / next action              |
| --------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| PR-C01 Independent portal boundary                              | `blocked` | Код/config/tests отделяют Worker/origin; exact production manifest/smoke отсутствуют                                                      | Architecture/operations reviewer |
| PR-C02 `PORTAL_PUBLIC_ORIGIN`, absolute links, host-only cookie | `blocked` | Unit tests + preview workers.dev GET smoke есть; custom/production origin и authenticated smoke отсутствуют                               | Security/operations owner        |
| PR-C03 Preview/production D1 isolation                          | `blocked` | Отдельная EU preview D1 + ignored config verified; production D1/config ещё отсутствуют                                                   | Cloudflare resource owner        |
| PR-C04 Separate private EU R2                                   | `blocked` | Два разных private EU preview buckets verified; production buckets отсутствуют                                                            | Storage/security owner           |
| PR-C05 R2 no-public-access and archive isolation                | `blocked` | Preview archive/quarantine private, r2.dev/custom domains off; production policy/restore отсутствуют                                      | Storage/security owner           |
| PR-C06 Browser binding/quota/budget                             | `blocked` | Binding example есть; remote conformance/monitor отсутствуют                                                                              | Operations/contract owner        |
| PR-C07 Turnstile origin/key setup                               | `blocked` | Preview widget + Worker secret установлены; exact action/hostname tests passed; real-token/replay smoke отсутствуют                       | Auth/security owner              |
| PR-C08 Secrets inventory/install/rotation                       | `blocked` | Exact preview inventory currently covers JWT, Turnstile and Resend. Telegram Bot API additionally requires environment-specific `TELEGRAM_BOT_TOKEN`, protected signed-decimal `TELEGRAM_CHAT_ID`, matching `TELEGRAM_CHAT_TYPE=group|supergroup|channel` and bounded `TELEGRAM_BOT_API_TIMEOUT_MS`; no secret/destination value may enter logs/evidence. Telegram install/rotation/revoke and full provider rotation rehearsal are absent | Security/provider owners         |
| PR-C09 DNS/TLS/custom portal origin                             | `blocked` | Exact origin/DNS approval/smoke отсутствуют                                                                                               | DNS/operations owner             |
| PR-C10 Release manifest external links                          | `blocked` | Final origin, outbound legal links и site surfaces не утверждены                                                                          | Product/site/legal owners        |

## D. Scheduled jobs, monitoring и operator controls

| Gate                                        | Статус    | Affected path / текущее evidence                                                                                  | Owner / next action          |
| ------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| PR-D01 Scheduled Worker entrypoint/Cron     | `passed`  | All 9 jobs evidenced on earlier Cron/monitoring versions; current `62b3cac4…` preserves both triggers and stored export records 34 scheduled invocations; external 5-minute HEAD monitor remains Up | Operations owner             |
| PR-D02 Job-run state migration              | `blocked` | Remote `0001`–`0015`, pending 0; journal/counters read-only smoke passed, restore rehearsal absent                 | DB/reliability reviewer      |
| PR-D03 Exact schedule/timezone inventory    | `passed`  | Exact UTC buckets `* * * * *`/`*/15 * * * *` delivered; operations owner/account contact receives monitor alerts | Operations/product owners    |
| PR-D04 Dedupe/lease/manual-run              | `blocked` | Automatic buckets unique, stuck 0; local lock/manual-audit tests passed; remote manual/failure rehearsal absent   | Reliability reviewer         |
| PR-D05 Manual operations page/RBAC/audit    | `blocked` | Admin-only load, CSRF, allowlist, confirmation, idempotency и no-GET/direct bypass passed 7/7                     | Security/UX reviewer         |
| PR-D06 Missed Cron/stale lock alert         | `passed`  | UptimeRobot Free HTTP(s) HEAD, 5 min, account contact DOWN+UP; test pair recovered at `2026-08-11T14:13:22Z`; independent HEAD 204 at `2026-08-11T14:22:28Z` | Operations owner |
| PR-D07 Dead outbox alert/manual recovery    | `blocked` | Preview baseline remains provider-disabled. The local candidate implements persistent safe `dead|delivery_unknown` signals and exact-attempt audited `confirm_sent|retry_after_review|cancel`; D1 tests prove unknown never enters stale/blind retry. Target-pinned preview alert/operator rehearsal and ownership evidence remain absent | Messaging/operations owner   |
| PR-D08 Quarantine backlog/cleanup alert     | `blocked` | Preview cleanup succeeded with zero effects; remote backlog alert/manual failure rehearsal absent                | Storage/operations owner     |
| PR-D09 Browser/provider exhaustion alert    | `blocked` | Remote metrics/threshold/failure procedure not verified; Telegram timeout/rate-limit/auth/chat-drift/ambiguous-delivery thresholds and owner actions are not rehearsed | Operations/provider owner    |
| PR-D10 Failed import/promotion alert        | `blocked` | Admin review есть; exact-target plan/stage/promote failure and stale review/lease signals, threshold, monitoring owner and manual-failure rehearsal отсутствуют | Import/operations owner      |
| PR-D11 Backup failure alert/manual check    | `blocked` | Backup mechanism/cadence отсутствуют                                                                              | Backup/operations owner      |
| PR-D12 Incident/credential compromise drill | `blocked` | Runbook создан; rehearsal и exact emergency automation отсутствуют                                                | Security/operations reviewer |

## E. Admin bootstrap и доступы

| Gate                                      | Статус    | Affected path / текущее evidence                                                                                                                                | Owner / next action                         |
| ----------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| PR-E01 First-admin bootstrap              | `blocked` | One-shot repository/CLI/npm command; exact config/APP_ENV/UUID confirmation, selector-free child config, success/result, invalid/concurrent/replay tests passed | Security owner: remote clean-room rehearsal |
| PR-E02 Audit + immediate bootstrap revoke | `blocked` | Atomic audit/assertion, consume, session revoke and replay rejection locally passed; remote evidence absent                                                     | Security reviewer                           |
| PR-E03 Admin recovery/role/session revoke | `blocked` | Upgrade with existing admin auto-seals bootstrap; normal role/session actions exist; zero-admin recovery drill absent                                           | Security/operations owner                   |
| PR-E04 Least-privilege access review      | `blocked` | Cloudflare/provider/admin roster не предоставлен                                                                                                                | Authorized system owners                    |
| PR-E05 Clean-room bootstrap/RBAC smoke    | `blocked` | Preview environment существует; synthetic active-admin/bootstrap target и clean-room exercise отсутствуют                                                       | Independent reviewer                        |

## F. Providers, Browser, contracts и uploads

| Gate                                          | Статус             | Affected path / flag                                                               | Owner / next action                                                          |
| --------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| PR-F01 Public registration/email verification | `feature_disabled` | `AUTH_PUBLIC_ENABLED=false`; Worker secrets/scoped Resend key installed, real-token/send smoke отсутствуют | Provider/auth owner: DPA+preview smoke или separate limited-release approval |
| PR-F02 Email provider delivery                | `feature_disabled` | `EMAIL_PROVIDER=disabled`; verified EU Resend domain + scoped key installed; delivery/reply smoke отсутствует | Provider owner: separately authorized preview smoke                           |
| PR-F03 Telegram delivery                      | `feature_disabled` | `TELEGRAM_PROVIDER=disabled` is verified fail-closed, but the mandatory full-MVP path remains implementation/release `blocked` by PR-F12–PR-F15; disabled is not provider readiness | Provider/privacy owner                                                       |
| PR-F04 Production document upload             | `feature_disabled` | `DOCUMENT_UPLOAD_ENABLED=false`; runtime rejects production true                   | Storage/security/legal owner                                                 |
| PR-F05 Manual AV training/test passage        | `blocked`          | Preview private-EU R2 split passed; approved training/controlled AV passage/legal path отсутствуют | Admin/security owner                                                         |
| PR-F06 Contract rendering/send                | `feature_disabled` | `CONTRACT_RENDERER=disabled`, `CONTRACT_SEND_ENABLED=false`                        | Contract/legal/Browser owner                                                 |
| PR-F07 Remote Browser conformance             | `blocked`          | Glyph/font/long-name/pagination/quota evidence отсутствуют                         | Contract/operations owner                                                    |
| PR-F08 Public statutory contract functions    | `feature_disabled` | `PUBLIC_CONTRACT_FUNCTIONS_ENABLED=false`; implementation/legal profile incomplete | Legal/contract owner                                                         |
| PR-F09 Online media grant                     | `feature_disabled` | `MEDIA_ONLINE_GRANT_ENABLED=false`                                                 | Legal/privacy owner: equal-ease withdrawal assessment or keep off            |
| PR-F10 Automatic retained legal-archive purge | `feature_disabled` | policy `disabled_by_policy`; worker отсутствует                                    | Product/legal: only new written rule + migration                             |
| PR-F11 Ordinary archive read/search           | `feature_disabled` | route/search intentionally absent                                                  | Product/legal/security: purpose/RBAC/audit decision                          |
| PR-F12 Telegram Bot API adapter/config/secrets | `blocked`          | Candidate implements real HTTPS Bot API adapter, private token field, exact signed-decimal chat/type, bounded timeout/64 KiB response, strict minimized one-way renderer, activation cutoff/max-attempt config and read-only preflight. On 2026-08-17 the preview secret-name inventory confirmed that `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are absent. The owner-reported private channel invitation is not bot identity, numeric channel ID, permission or secret evidence. No external preflight occurred | Messaging/security owner: provision a dedicated preview bot and protected exact channel binding after approval |
| PR-F13 Telegram ambiguous delivery/manual resolution | `blocked`    | Unapplied candidate migration `0017` and local D1 tests implement append-only dispatch attempts, real `delivery_unknown`, no stale/blind retry, drain circuit-break, destination-wide 429 cooldown even without usable `retry_after`, activation floor/max-attempt policy, persistent alerts and exact-attempt audited `confirm_sent|retry_after_review|cancel`. Valid Bot API `ok=false` `408|425|5xx` is conclusive retryable; transport/timeout/unreadable-or-oversized/malformed/non-`ok=true` ambiguous envelope/invalid-or-mismatched success/destination/post-send-D1 uncertainty is ambiguous. Unresolved unknown or terminal dead blocks the sole bureau lane. Candidate clean-clone/independent review and operator rehearsal remain absent | Reliability/operations reviewer |
| PR-F14 Telegram synthetic preview smoke       | `blocked`          | No separately authorized Bot API send was performed. Local boundary prepares one disarmed PII-free `max_attempts=1` normal-outbox row, requires empty active/dead/unknown backlog and fresh successful preflight, atomically claims exact cohort, invokes the normal worker and locally proves sent/provider-ID/reference/no duplicate with fake transport; its fake ambiguous case proves only local terminal-unknown handling. A separate D1-only `telegram:smoke:abort` atomically cancels only an unsent prepared/partial zero-attempt row with append-only evidence; Cron cannot reclaim its smoke signature, and any attempted/terminal row fails closed. If `run` crashes after `dispatch_started`, exact-target/cohort `telegram:smoke:reconcile` rejects an active lease and, only after expiry, uses no Telegram secret/provider send/retry to idempotently move the one attempt/outbox to `delivery_unknown` for ordinary audited resolution. The required external evidence is exactly one real minimized Bot API preview message or a real ambiguous outcome, never both inferred from local tests. Protected manifest/deployment evidence creation, actual target/version observation, remote D1 prepare and Bot API send remain external gates | Provider/privacy owner + independent operator |
| PR-F15 Telegram destination/rotation/recovery drill | `blocked`    | Approved bot ownership, exact destination, absence of an inbound parent workflow, `migrate_to_chat_id` config-drift handling, token revoke/rotate, dead/unknown review and operator runbook walkthrough are absent | Provider/security/operations owners |

Все `feature_disabled` paths должны пройти отдельный negative smoke. Команда
`release:verify` включает fail-closed config tests; environment-specific gates
остаются `blocked`, поэтому общий release не готов.

## G. Privacy, legal и provider approvals

| Gate                                        | Статус    | Affected path / текущее evidence                                             | Owner / next action             |
| ------------------------------------------- | --------- | ---------------------------------------------------------------------------- | ------------------------------- |
| PR-G01 Privacy notice/version               | `blocked` | Approved production version/input отсутствует                                | Authorized privacy/legal owner  |
| PR-G02 DPA/AVV/subprocessors                | `blocked` | Provider-specific approvals не предоставлены                                 | Authorized Verein/privacy owner |
| PR-G03 Retention classes/basis/review dates | `blocked` | Runtime controls есть; production legal review отсутствует                   | Legal/privacy owner             |
| PR-G04 Contract templates/legal profiles    | `blocked` | Production version approvals/statutory applicability evidence отсутствуют    | Legal/contract owner            |
| PR-G05 Media text/contact/withdrawal path   | `blocked` | Online grant выключен; approved production text/contact evidence отсутствует | Legal/privacy owner             |
| PR-G06 Upload/scanner processing approvals  | `blocked` | Manual local AV policy есть; production training/DPA inputs отсутствуют      | Security/privacy owner          |
| PR-G07 Email/Telegram provider approval     | `blocked` | Resend выбран и adapter реализован; DPA/AVV/privacy approval отсутствует. Telegram Bot API provider, bot/chat ownership, processing/privacy approval and minimized-payload sign-off are absent | Provider/privacy owner          |

Агент не может закрыть эти gates техническим тестом или risk acceptance.

## H. Backup, restore и rollback

| Gate                                        | Статус    | Affected path / текущее evidence                                                                   | Owner / next action  |
| ------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- | -------------------- |
| PR-H01 Approved RPO                         | `blocked` | Input отсутствует                                                                                  | Data/business owner  |
| PR-H02 Approved RTO                         | `blocked` | Input отсутствует                                                                                  | Data/business owner  |
| PR-H03 Backup cadence/retention             | `blocked` | Inputs отсутствуют                                                                                 | Data/security owner  |
| PR-H04 D1 backup + integrity check          | `blocked` | Pre-apply Time Travel point + FK/schema checks есть; protected export/restore evidence отсутствуют | Backup owner         |
| PR-H05 R2 archive/quarantine backup         | `blocked` | Mechanism/script отсутствует                                                                       | Storage/backup owner |
| PR-H06 Full isolated D1 restore             | `blocked` | Restore environment/rehearsal отсутствуют                                                          | Backup/DB owner      |
| PR-H07 Full isolated R2 restore             | `blocked` | Mechanism/resources/rehearsal отсутствуют                                                          | Storage/backup owner |
| PR-H08 Code rollback compatibility          | `blocked` | Wrangler procedure описана; deployed schema through `0015` compatibility drill отсутствует, while local candidate `0016`–`0018` is unapplied and also requires its own drill | Release/DB owner |
| PR-H09 Migration roll-forward/restore drill | `blocked` | Representative local `0013 → 0015` upgrade passed; candidate `0016`–`0018` local upgrade/constraint evidence does not replace isolated restore/roll-forward drill | DB/release owner |
| PR-H10 Import rollback drill                | `blocked` | Local previous-version mechanism exists, but first-promote rollback has no prior target and no exact-target remote rehearsal exists. PR-B15 recovery bookmark/backup + isolated restore to no-current state, subsequent rollback and roll-forward are mandatory | Import/data/backup owners |

## I. Operator docs, release и внешний сайт

| Gate                                              | Статус    | Affected path / текущее evidence                                                                                              | Owner / next action            |
| ------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| PR-I01 Deployment runbook                         | `blocked` | Content cold-read + basic preview deploy passed; immutable packaging/full walkthrough отсутствуют                              | Independent operator           |
| PR-I02 Operations runbook                         | `blocked` | [Operations](OPERATIONS_RUNBOOK.md) cold-read and HEAD alert rehearsal passed; exact-target import, first-import recovery and Telegram delivery-unknown/manual-resolution walkthrough plus remaining remote manual/provider/failure procedures have not been rehearsed | Independent operator           |
| PR-I03 Disaster-recovery runbook                  | `blocked` | [DR](DISASTER_RECOVERY.md) content cold-read passed; restore inputs/resources/rehearsal отсутствуют                           | Independent operator           |
| PR-I04 Checklist completeness                     | `blocked` | Immutable candidate `ca4ef8f`, exact-SHA clean-clone verification and 2026-08-17 read-only preview/current-source inventory are recorded; independent review, Access/PlusBText PR-B12–PR-B16, Telegram PR-F12–PR-F15, external owners and remaining browser/provider/restore evidence are incomplete | Release owner                  |
| PR-I05 Clean-room walkthrough всех runbooks       | `blocked` | Content walkthrough passed; exact-target synthetic no-PII import, first-import restore, Telegram ambiguous-delivery/operator recovery and full non-production provisioning/bootstrap/provider/restore execution are absent | Independent operator           |
| PR-I06 Preview deploy/post-deploy smoke           | `blocked` | Read-only 2026-08-17 root HEAD 200 and operations-health HEAD 204 confirm availability, but exact `200268f`/`62b3cac4…` is still deployed without candidate migrations. Candidate `ca4ef8f`, synthetic no-PII legacy import lifecycle, Telegram Bot API one-way/unknown-delivery smoke, authenticated/manual and restore evidence remain absent | Operations owner |
| PR-I07 Production deploy approval                 | `blocked` | Отдельное прямое поручение отсутствует                                                                                        | Authorized release owner       |
| PR-I08 Production migration/import/send approvals | `blocked` | Separate permissions are absent. Remote import stage, review, promote/rollback, production migration/deploy and Telegram/email provider sends are distinct mutations; permission for one never authorizes another | Authorized owners по действиям |
| PR-I09 Production post-deploy smoke               | `blocked` | Deploy не выполнялся                                                                                                          | Release/security owner         |
| PR-I10 Official-site exact URL/surfaces           | `blocked` | Release input отсутствует                                                                                                     | Site/product owner             |
| PR-I11 Separate site-link go-live approval        | `blocked` | Прямое поручение отсутствует; CMS вне scope                                                                                   | Authorized site owner          |
| PR-I12 Site-link rollback                         | `blocked` | Exact CMS fields/old values/procedure неизвестны                                                                              | Site operator                  |

## Отдельно разрешаемые действия

Даже после подготовки документации каждое действие требует собственного прямого
поручения и точных targets:

1. создание/изменение Cloudflare remote resources, DNS и TLS;
2. preview deploy/migration and ordinary synthetic/no-PII import rehearsal;
3. production D1 migration;
4. production Worker deploy или rollback;
5. remote import `stage`, `review`, promote, verify и rollback/restore — отдельные
   scopes; реальный PII source требует собственное data/privacy approval и не
   используется в обычном preview;
6. включение email/Telegram и каждая реальная внешняя отправка, включая один
   synthetic Telegram preview smoke;
7. включение uploads, contract send, media/statutory paths;
8. production backup/restore;
9. изменение любой CMS/ссылки/страницы официального сайта.

Разрешение одного пункта не разрешает остальные.

## Evidence template

Для перевода gate заполнить:

```text
Gate:
Status: passed | feature_disabled | blocked
Environment:
Immutable commit/config/tool version:
UTC date:
Owner/reviewer role:
Command or exact UI field:
Sanitized expected result:
Sanitized actual result/evidence reference:
Affected path/flag:
Stop condition checked:
Rollback/recovery checked:
Next action:
```

## Go/no-go

- Full MVP `GO` допустим только если все mandatory paths имеют `passed`, в ledger
  нет `blocked`, restore/rollback доказаны и есть отдельное deploy approval.
- PR-B12–PR-B16 and PR-F12–PR-F15 are mandatory, non-skippable gates. A disabled
  provider, known Access schema, local-only import or successful unrelated smoke
  cannot close them. Ordinary preview import evidence is valid only with
  deterministic synthetic/no-PII sources.
- Limited release с `feature_disabled` требует отдельного явного owner approval,
  точного остаточного scope и проверенного fail-closed behavior. Он не называется
  полным MVP.
- Текущий результат: **NO-GO / `blocked`**.

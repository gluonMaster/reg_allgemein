# Production readiness checklist

Актуально на 2026-08-12. Это текущий release ledger, а не обещание будущей
готовности.

**Итог:** `blocked` — портал нельзя объявлять production-ready и нельзя
развёртывать в production по этому документу. Обязательные paths выключены либо
не имеют production evidence; remote actions отдельно не авторизованы.

## Release record

Перед оценкой конкретного кандидата заполнить все поля. Placeholder не является
evidence.

| Поле                                 | Значение                                                          |
| ------------------------------------ | ----------------------------------------------------------------- |
| Release/commit SHA                   | The commit containing this revision is the new local Stage-13 candidate; its exact SHA is obtained from `git rev-parse HEAD` after commit. Deployed preview remains `200268f39ece1d43c5e091dcb7db6569d41275af`; clean-clone verification and any deploy remain separate gates — overall `blocked` |
| Checklist revision                   | 2026-08-13, local Stage-13 candidate prepared after PR-A06 and final PR-A12/13/14 lifecycle/accessibility/IDOR verification; overall NO-GO unchanged |
| Preview environment/config           | Final read-only recheck 2026-08-12T17:14–17:16Z: Worker version `sha256:f4cd52e14dbd` at 100%, D1 `0001`–`0015` pending 0, both private buckets EEUR, empty HEAD+GET 204. Wrangler has no safe read-only Cron-list command; both schedules remain in config and prior remote delivery evidence remains authoritative |
| Latest local worktree verification   | Uncommitted/local-only `npm run release:verify` passed in 619.5 s: check 0/0, Vitest 54 files/340 tests, Chromium 8 files/18 tests, build, production audit 0, docs 136 links/51 files + 82 commands, scan 500/500; separate full `npm audit` total 0. Port 4173 is free, `.wrangler/e2e-runtime/runtime.env` is absent and pre-existing `.wrangler/state` is untouched |
| Production environment/config        | `<PRODUCTION_ENVIRONMENT>` — `blocked`                            |
| Portal preview/production origins    | preview workers.dev HTTP/browser smoke passed; custom/production — `blocked` |
| Migration set                        | `0001`–`0015`; local + empty preview remote apply passed              |
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
| PR-A06 Requirement/acceptance traceability  | `passed`  | Fresh Ultra audit 2026-08-12: [матрица](../implementation/STAGE_13_TRACEABILITY.md) покрывает 91/91 normative MVP IDs и все 166 acceptance bullets, включая 37 untagged bullets со stable IDs; code/test paths сверены. HIGH dual-role/dual-control и configured-upload ambiguity, скрытые privacy handlers и parent role-route gaps исправлены; независимый final re-review не нашёл HIGH/BLOCKER. Исторический PR-A06 checkpoint `release:verify` прошёл за 487.3 s: check 0/0, Vitest 53 files/327 tests, Chromium 2 files/8 tests, build, production audit 0, docs 136 links/51 files + 82 commands, scan 492/492. Новый local candidate подготовлен 2026-08-13; exact-SHA clean-clone verification остаётся отдельным gate | Codex Ultra independent reviewer, 2026-08-12; release operator для clean-clone gate |
| PR-A07 `docs:check`                         | `passed`  | Immutable candidate: 137 links/51 files + 82 executable command lines                                                                                              | Codex release operator                                         |
| PR-A08 `release:scan`                       | `passed`  | Clean immutable clone: 412/412 candidates; prohibited artifact/secret/PII/control-byte findings нет                                                                | Codex release operator                                         |
| PR-A09 `release:verify`                     | `passed`  | Full clean chain on immutable `200268f39ece1d43c5e091dcb7db6569d41275af` passed 2026-08-12                                                                         | Codex release operator                                         |
| PR-A10 Forbidden artifact/PII/secret scan   | `passed`  | Immutable `200268f` clean-clone post-build scan passed and remains fail-closed for raw controls in expected text files                                             | Codex release operator                                         |
| PR-A11 Markdown links                       | `passed`  | Immutable `200268f` docs check and independent content cold-read passed                                                                                            | Codex release operator + documentation reviewer                |
| PR-A12 Full synthetic E2E                   | `blocked` | Existing connected migrated-D1 register→closure flow passed 1/1. Local Chromium 8 files/18 tests covers individual request draft→submit→admin approve→parent approved; exact catalog €46 quote and trial requested→admin confirmed→parent cancelled; support and structured absence through final admin reply, parent reread and pending email/Telegram outbox deltas; sent €46→€50 price review through parent acceptance and distinct admin confirmation to `scheduled`; six access/session/IDOR, four accessibility and three foundation cases. Contract accept/form/activate is not claimed in Browser because renderer/send remain intentionally disabled. Residual browser lifecycles: register/verify/claim, funded Nachhilfe upload/document review, enabled contract lifecycle, price admin-send and scheduled apply, authenticated preview/provider rehearsal | Extend only remaining enabled/local lifecycles; preview/provider rehearsal requires separate authorization |
| PR-A13 German accessibility/mobile/keyboard | `blocked` | Public preview smoke remains passed. Local accessibility 4/4 runs every axe rule enabled by default and requires both `violations=[]` and `incomplete=[]`; it covers deterministic 640px 200%-zoom-equivalent registration reflow, inline login-error announcement/association/focus, and 390px parent/admin no-overflow, structure, labels and keyboard focus. Literal/manual zoom, assistive-technology review, manual glyph/font review and authenticated preview evidence remain absent | UX/accessibility reviewer |
| PR-A14 Permission/IDOR/CSRF/session matrix  | `blocked` | Authenticated Chromium 6/6, catalog/trial negative branches, exact route tests and focused D1 suites cover missing/wrong/valid CSRF; child; request save/submit/cancel; document download/delete plus route-request carrier binding; trial create/cancel; contract detail/artifact and active end/attendance/media plus route-offer carrier binding; price response; thread append/close; privacy artifact access and forged subject fields remaining self-scoped. Direct actions distinguish safe 404 from owned validation/state 409; browser form transport asserts semantic denial and unchanged owner state. Contract atomicity/replay selection passed 6/6, full contracts D1 passed 13/13 and independent re-review returned GO without HIGH/BLOCKER; no Browser contract-accept claim is made. Residual: enabled contract decision lifecycle, disabled upload mutation, remaining enrollment/group-service and guessed/admin-purpose variants, preview rehearsal | Security reviewer: complete residual enabled/variant matrix, then separately authorize preview rehearsal |
| PR-A15 PII-safe logging/diagnostics         | `passed`  | Immutable `200268f`/preview `62b3cac4…`: redaction + 404/500 regression, clean-clone verify, prior PII-safe export review and current bounded stored export passed. Exact GET/404 and HEAD/204 are outcome `ok`, truncation false, with no custom log/`UNEXPECTED_SERVER_ERROR`; raw platform metadata remains outside Git, 2026-08-12 | Codex security/operations review |

## B. Migrations, import и data integrity

| Gate                                             | Статус    | Affected path / текущее evidence                                                                                            | Owner / next action                   |
| ------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| PR-B01 Empty D1 migrations                       | `passed`  | Preview initial `0001`–`0014` parity/FK/users checks passed 2026-08-10; append-only `0015` later applied, current `0001`–`0015`, pending 0 | Codex release operator                |
| PR-B02 Migrations `0014`–`0015`                  | `blocked` | Targeted operations/monitoring upgrade tests + preview remote apply passed; protected backup/isolated restore отсутствуют | Stage-13 DB/security review           |
| PR-B03 Representative upgraded D1                | `blocked` | Populated `0013 → 0015` upgrade passed; selector-rejection coverage есть; remote restore отсутствует                         | DB reviewer                           |
| PR-B04 Preview D1 migration                      | `passed`  | Authorized empty EU preview D1: initial 14/14 parity/FK/users checks, then `0015` apply and monitoring smoke; pending 0 | Codex release operator                |
| PR-B05 Pre-migration backup                      | `blocked` | Time Travel recovery point captured before apply; protected export + restore evidence absent                                | Backup/data owner                     |
| PR-B06 Current real reference import             | `blocked` | Есть synthetic/local tests; нет разрешённого source/evidence                                                                | Data owner + separate import approval |
| PR-B07 Dry-run/review/promote/rollback rehearsal | `blocked` | Local commands есть; полный current rehearsal и remote path отсутствуют                                                     | Import operator                       |
| PR-B08 Current promoted legacy snapshot          | `blocked` | Production/preview snapshot не существует/не проверен                                                                       | Import/data owner                     |
| PR-B09 Family lookup 0/1/multiple                | `blocked` | Integration tests есть; remote authenticated 0/1/multiple lookup smoke не выполнен                                           | Security/data reviewer                |
| PR-B10 Unavailable/stale lookup fail-closed      | `blocked` | Domain tests есть; current promoted snapshot + remote authenticated lookup smoke отсутствуют                                 | Auth/import reviewer                  |
| PR-B11 Concurrency/idempotency critical paths    | `blocked` | D1 integration tests есть; remote critical-concurrency flow/rehearsal отсутствует                                            | DB/reliability reviewer               |

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
| PR-C08 Secrets inventory/install/rotation                       | `blocked` | Exact preview inventory установлен: JWT, Turnstile, Resend; значения не раскрыты, provider copies в DPAPI; rotation rehearsal отсутствует | Security/provider owners         |
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
| PR-D07 Dead outbox alert/manual recovery    | `blocked` | Preview outbox jobs fail closed as provider-disabled, queue 0; real provider/dead alert absent                    | Messaging/operations owner   |
| PR-D08 Quarantine backlog/cleanup alert     | `blocked` | Preview cleanup succeeded with zero effects; remote backlog alert/manual failure rehearsal absent                | Storage/operations owner     |
| PR-D09 Browser/provider exhaustion alert    | `blocked` | Remote metrics/threshold/failure procedure не проверены                                                           | Operations/provider owner    |
| PR-D10 Failed import/promotion alert        | `blocked` | Admin review есть; monitoring owner/signal отсутствуют                                                            | Import/operations owner      |
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
| PR-F03 Telegram delivery                      | `feature_disabled` | `TELEGRAM_PROVIDER=disabled`; real adapter/credential smoke отсутствует            | Provider/privacy owner                                                       |
| PR-F04 Production document upload             | `feature_disabled` | `DOCUMENT_UPLOAD_ENABLED=false`; runtime rejects production true                   | Storage/security/legal owner                                                 |
| PR-F05 Manual AV training/test passage        | `blocked`          | Preview private-EU R2 split passed; approved training/controlled AV passage/legal path отсутствуют | Admin/security owner                                                         |
| PR-F06 Contract rendering/send                | `feature_disabled` | `CONTRACT_RENDERER=disabled`, `CONTRACT_SEND_ENABLED=false`                        | Contract/legal/Browser owner                                                 |
| PR-F07 Remote Browser conformance             | `blocked`          | Glyph/font/long-name/pagination/quota evidence отсутствуют                         | Contract/operations owner                                                    |
| PR-F08 Public statutory contract functions    | `feature_disabled` | `PUBLIC_CONTRACT_FUNCTIONS_ENABLED=false`; implementation/legal profile incomplete | Legal/contract owner                                                         |
| PR-F09 Online media grant                     | `feature_disabled` | `MEDIA_ONLINE_GRANT_ENABLED=false`                                                 | Legal/privacy owner: equal-ease withdrawal assessment or keep off            |
| PR-F10 Automatic retained legal-archive purge | `feature_disabled` | policy `disabled_by_policy`; worker отсутствует                                    | Product/legal: only new written rule + migration                             |
| PR-F11 Ordinary archive read/search           | `feature_disabled` | route/search intentionally absent                                                  | Product/legal/security: purpose/RBAC/audit decision                          |

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
| PR-G07 Email/Telegram provider approval     | `blocked` | Resend выбран и adapter реализован; DPA/AVV/privacy approval и Telegram provider отсутствуют | Provider/privacy owner          |

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
| PR-H08 Code rollback compatibility          | `blocked` | Wrangler procedure описана; current schema through `0015` compatibility drill отсутствует          | Release/DB owner     |
| PR-H09 Migration roll-forward/restore drill | `blocked` | Representative local `0013 → 0015` upgrade passed; isolated restore/roll-forward drill отсутствует | DB/release owner     |
| PR-H10 Import rollback drill                | `blocked` | Local mechanism есть; current/remote rehearsal отсутствует                                         | Import/data owner    |

## I. Operator docs, release и внешний сайт

| Gate                                              | Статус    | Affected path / текущее evidence                                                                                              | Owner / next action            |
| ------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| PR-I01 Deployment runbook                         | `blocked` | Content cold-read + basic preview deploy passed; immutable packaging/full walkthrough отсутствуют                              | Independent operator           |
| PR-I02 Operations runbook                         | `blocked` | [Operations](OPERATIONS_RUNBOOK.md) cold-read and HEAD alert rehearsal passed; remote manual/provider/failure procedures remain | Independent operator           |
| PR-I03 Disaster-recovery runbook                  | `blocked` | [DR](DISASTER_RECOVERY.md) content cold-read passed; restore inputs/resources/rehearsal отсутствуют                           | Independent operator           |
| PR-I04 Checklist completeness                     | `blocked` | Immutable candidate recorded; external owners and remaining browser/provider/restore evidence incomplete              | Release owner                  |
| PR-I05 Clean-room walkthrough всех runbooks       | `blocked` | Content walkthrough passed; full non-production provisioning/bootstrap/provider/restore execution не выполнено                | Independent operator           |
| PR-I06 Preview deploy/post-deploy smoke           | `blocked` | Exact `200268f` deployed without migrations; public HTTP/health/404 logging smoke passed on `62b3cac4…`; prior desktop/mobile/keyboard/Lighthouse passed. Local authenticated subset is not preview evidence; preview authenticated/provider/manual/restore remain absent | Operations owner |
| PR-I07 Production deploy approval                 | `blocked` | Отдельное прямое поручение отсутствует                                                                                        | Authorized release owner       |
| PR-I08 Production migration/import/send approvals | `blocked` | Отдельные разрешения отсутствуют                                                                                              | Authorized owners по действиям |
| PR-I09 Production post-deploy smoke               | `blocked` | Deploy не выполнялся                                                                                                          | Release/security owner         |
| PR-I10 Official-site exact URL/surfaces           | `blocked` | Release input отсутствует                                                                                                     | Site/product owner             |
| PR-I11 Separate site-link go-live approval        | `blocked` | Прямое поручение отсутствует; CMS вне scope                                                                                   | Authorized site owner          |
| PR-I12 Site-link rollback                         | `blocked` | Exact CMS fields/old values/procedure неизвестны                                                                              | Site operator                  |

## Отдельно разрешаемые действия

Даже после подготовки документации каждое действие требует собственного прямого
поручения и точных targets:

1. создание/изменение Cloudflare remote resources, DNS и TLS;
2. preview deploy/migration/provider smoke;
3. production D1 migration;
4. production Worker deploy или rollback;
5. реальный PII import/promote/rollback;
6. включение email/Telegram и реальная внешняя отправка;
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
- Limited release с `feature_disabled` требует отдельного явного owner approval,
  точного остаточного scope и проверенного fail-closed behavior. Он не называется
  полным MVP.
- Текущий результат: **NO-GO / `blocked`**.

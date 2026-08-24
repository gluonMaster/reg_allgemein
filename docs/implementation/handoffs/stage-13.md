# Handoff этапа 13: hardening и production readiness

Ревизия: 2026-08-24.

Статус этапа: `in_progress` — exact `8c6e2aacc39e731ad59e8f1ca8d6fe3b5f312956`
получил authorized independent `IMPORT-08` review `NO-GO` с 2 BLOCKER и 2 HIGH.
Exact runtime remediation anchor `abb93f25a7d9ce80bdef6f204e75cabf635f9453`
с append-only migration `0022` прошёл fresh exact-SHA full chain. Immutable
documentation-only review seal `b2e8548f63ae62e33d519d61e0ac729085801052`
является его прямым runtime-empty потомком и прошёл exact short gates. Отдельно
разрешённый independent read-only re-review exact `b2e8548f` вернул NO-GO с
1 BLOCKER и 1 MEDIUM. Exact docs/test remediation anchor
`4ac6a491f2dc9a40608a4fdd77101fb4eb8853b9` закрывает findings и прошёл
proportional exact-SHA gates. Финальный review target
`2bedc73c9b39a4cb43296046986a3f48e039b022` является его прямым docs-only
потомком, не меняет `src`/`migrations`/`tests` и прошёл exact short gates.
Separately authorized independent read-only review этого exact SHA вернул GO
без BLOCKER/HIGH. Один MEDIUM test-evidence gap остаётся: stale dispatch/
final-confirm/apply fixtures fail closed, но не изолируют duplicate-specific
guard от других eligibility checks; текущего runtime bypass reviewer не нашёл.

Production readiness: **`blocked` / NO-GO**

Stage 13 реализует технический hardening и operator packet, но не даёт права на
production actions. Preview D1/R2 provision/migration и fail-closed Worker
evidence, включая automatic Cron delivery/freshness, уже получены;
authenticated/provider/remote Browser и manual-run/failure evidence,
legal/privacy approvals, RPO/RTO, reusable non-empty R2 backup и отдельное deploy
поручение остаются release blockers. One-off isolated preview D1 restore и exact
current empty-state R2 restore пройдены 2026-08-20. Независимый UptimeRobot alert
delivery/recovery rehearsal пройден 2026-08-11; public browser и PR-A15
stored-log remediation проверены 2026-08-12.

## Baseline

- Branch: `master`.
- Start HEAD: `6645df5648273d027b5e3e86eb64c024e5739b7a`.
- Initial `git status --short`: clean.
- Предыдущий handoff: [stage-12.md](stage-12.md).
- Operational contract:
  [PRODUCTION_READINESS.md](../../operations/PRODUCTION_READINESS.md).
- Historical Access/Telegram readiness candidate:
  `a590d1f08110c20b6f7b45294cb91a7be7b5a8e3`. Its parent `ca4ef8f` contains
  the Access OLE date fix; `a590d1f` adds only the tracked 2026-08-17 deployment
  checkpoint. It is narrower historical provenance, not the current candidate.
  Current immutable runtime anchor is `abb93f25`; `b2e8548f` is its rejected
  review seal. Exact docs/test remediation anchor is `4ac6a491`; final review
  target is exact docs-only seal `2bedc73c`.
- Preview D1 migration выполнена отдельно разрешённой операцией 2026-08-10.
  Production, remote import/send, DNS/CMS и официальный сайт не изменялись.

## Реализовано

- Создана requirement/acceptance → implementation → automated evidence матрица:
  [STAGE_13_TRACEABILITY.md](../STAGE_13_TRACEABILITY.md).
- Созданы и сверены четыре русскоязычных operator documents:
  [deployment](../../operations/PRODUCTION_DEPLOYMENT.md),
  [operations](../../operations/OPERATIONS_RUNBOOK.md),
  [disaster recovery](../../operations/DISASTER_RECOVERY.md) и
  [readiness checklist](../../operations/PRODUCTION_READINESS_CHECKLIST.md).
- Portal остаётся отдельным Worker/origin/D1/R2/auth/release lifecycle. Footer
  использует только versioned HTTPS `OFFICIAL_*` links из runtime config; CMS и
  официальный сайт не являются runtime-зависимостью.
- Добавлена append-only migration `0014_production_operations.sql`:
  scheduled-run ledger, storage write-ahead intents, one-shot admin bootstrap,
  cleanup leases и bounded pseudonymous-IP minimization.
- Позднее добавлена отдельная append-only migration
  `0015_worker_monitoring.sql` для PII-free error buckets и health/freshness
  monitoring; `0014` не изменялась.
- Архив и quarantine используют разные `R2_ARCHIVE`/`R2_QUARANTINE` bindings и
  namespace router; runtime отвергает один binding object для обеих ролей. Все
  новые R2 writes регистрируют intent до `put`; orphan cleanup имеет grace, lease
  и reconciliation. Для preview подтверждены два отдельных private EU buckets;
  current empty-state restore подтверждён 2026-08-20, production resources и
  reusable non-empty restore mechanism отсутствуют.
- Добавлены Worker scheduled handler, две UTC Cron-группы, allowlist jobs,
  dedupe/leases, per-job failure isolation, safe run history и admin-only manual
  operations page с CSRF/confirmation/idempotency/audit.
- Добавлен one-shot `npm run admin:bootstrap`: только verified/active target,
  atomic role+audit+assertion+consume, revoke sessions, replay/concurrency reject.
  CLI сверяет config `APP_ENV`, environment-specific D1 UUID и UUID-bound
  confirmation. Remote Wrangler получает временный selector-free config, поэтому
  UUID нельзя перенаправить через `database_name`/binding; local path не загружает
  `.dev.vars`. Upgraded DB с active admin автоматически запечатывает bootstrap.
- Усилены document/funding/contract/privacy boundaries: sensitive downloads
  POST+CSRF+typed purpose+atomic authorization/audit; closure/legal-archive guards;
  authoritative R2 cleanup; operational PII minimization и race-safe leases.
- Добавлены response headers, no-store для sensitive auth/download paths,
  versioned external footer links и расширенная upload signature/MIME validation.
- Добавлены `docs:check`, `release:scan` и `release:verify`. Последний включает
  check, Vitest, Playwright, build, production dependency audit, docs и artifact/
  high-confidence secret/PII scan.
- Добавлен связный migrated-D1 synthetic flow: registration/verify/login → cabinet
  → individual request/trial → contract accept/formation → price review → message
  → blocked/guarded/successful privacy closure. Это domain integration evidence,
  а не browser/preview evidence.

## Environment, migrations и compatibility

| Область     | Evidence                                                                                                                                                                                           | Остаточный gate                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Empty D1    | deployed preview exact `0001`–`0022`, pending 0; authorized `0016`–`0022` apply passed with complete candidate objects, empty new tables and 0 FK violations; exact runtime anchor `abb93f25`, remediation anchor `4ac6a491` and final docs-only review seal `2bedc73c` are immutable/verified; exact `2bedc73c` review is GO; protected pre-candidate full isolated restore passed 2026-08-20 | exact Worker deploy and production migration remain separate |
| Upgraded D1 | historical populated suffix tests through `0022` pass; exact runtime/remediation verification and final review pass; current pre-candidate remote state was backed up/restored in isolation and source preview schema apply through `0022` passed | post-apply isolated restore plus rollback/forward-fix rehearsal |
| R2 split    | local guards + two separate private EU preview buckets verified; exact current empty state restored into two distinct private EU buckets on 2026-08-20 | production resources/policy and reusable future non-empty backup/restore mechanism |
| Scheduler   | Local guards + preview automatic delivery/freshness for all nine jobs и внешний HEAD alert passed                                                                                                  | remote manual/dedupe/failure rehearsal                                                                                        |
| Bootstrap   | clean/invalid/replay/concurrent/upgrade, exact-ID selector isolation и result checks passed                                                                                                        | remote clean-room/least-privilege/zero-admin recovery drill                                                                   |
| Imports     | current Access sanitized profile 1703 rows/21 of 21 required fields/v1 compatible; current PlusBText v1 confirmed. Exact `8c6e2a` and `b2e8548f` reviews returned NO-GO; runtime anchor `abb93f25` passed full verification, docs/test remediation anchor `4ac6a491` passed proportional gates, final review seal `2bedc73c` passed short gates and separately authorized independent review returned GO with one MEDIUM test-evidence residual | exact-target remote lifecycle, synthetic preview/no-PII, first-import restore, admin cold-read and owner decisions |

Applied migrations `0001`–`0022` нельзя переписывать. Recovery после применённой
migration — совместимый code rollback, новая forward-fix migration либо отдельно
разрешённый restore. Следующая schema correction получает новый append-only
номер; direct edit/down migration запрещены.

## Feature flags и fail-closed production paths

| Path                                  | Fail-closed config                                                                                                                                       | Статус                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Public registration                   | `AUTH_PUBLIC_ENABLED=false`                                                                                                                              | `feature_disabled`                                             |
| Email                                 | `EMAIL_PROVIDER=disabled`                                                                                                                                | `feature_disabled`                                             |
| Telegram                              | deployed preview uses `TELEGRAM_PROVIDER=disabled`; current exact candidate passed local/exact independent review and migration `0017` is deployed, but candidate Worker/provider path is not deployed or rehearsed | `feature_disabled`; external provider/rehearsal gate `blocked` |
| Document upload                       | `DOCUMENT_UPLOAD_ENABLED=false`                                                                                                                          | `feature_disabled`                                             |
| Contract rendering/send               | `CONTRACT_RENDERER=disabled`, `CONTRACT_SEND_ENABLED=false`                                                                                              | `feature_disabled`                                             |
| Online media grant                    | `MEDIA_ONLINE_GRANT_ENABLED=false`                                                                                                                       | `feature_disabled`                                             |
| Public statutory functions            | `PUBLIC_CONTRACT_FUNCTIONS_ENABLED=false`                                                                                                                | `feature_disabled`                                             |
| Retained legal-archive purge          | policy `disabled_by_policy`                                                                                                                              | `feature_disabled`                                             |
| Ordinary retained-archive read/search | route absent                                                                                                                                             | `feature_disabled`                                             |

`feature_disabled` не равно `passed`. Ограниченный release требует отдельного
approved scope и не называется полным MVP.

## Проверки 2026-07-22

| Команда/сценарий                           | Sanitized result                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                   | passed после удаления generated Worker output; 269 packages installed                                                |
| `npm run check`                            | clean-source passed: 0 errors/warnings                                                                               |
| Targeted Stage-13 tests                    | migration/bootstrap/scheduler/storage/download/headers/connected-flow/security passed                                |
| `npm test`                                 | passed: 44 files, 241/241 tests                                                                                      |
| `npm run test:e2e`                         | passed: 3/3 boundary smoke; это не full authenticated lifecycle                                                      |
| `npm run build`                            | passed; adapter output собран                                                                                        |
| `wrangler deploy --dry-run`                | passed на placeholder example config; 68 assets, remote deploy не выполнялся                                         |
| `npm audit --omit=dev`                     | passed: 0 vulnerabilities после корректной dev-only классификации build adapter                                      |
| `npm run docs:check`                       | passed: 138 local links / 51 files + 82 executable command lines                                                     |
| `npm run release:scan`                     | passed: 469/469 candidates; artifact/secret/PII/control-byte findings отсутствуют                                    |
| `git diff --check`                         | passed после final documentation/cold-read sync                                                                      |
| Preview D1 migration                       | passed 2026-08-10: 14/14, pending 0, schema parity, FK violations 0, user rows 0                                     |
| Preview Worker/Browser/provider/Cron smoke | partial 2026-08-11: fail-closed GET/HEAD, automatic Cron и внешний alert passed; Browser/provider/manual — `blocked` |
| D1/R2 isolated restore/rollback rehearsal  | not run — `blocked`                                                                                                  |

Этот pre-preview snapshot сохранял три high advisory в dev-only
Wrangler/Miniflare/Sharp tooling. Post-PR-D06 dependency remediation ниже
обновляет совместимый tooling/API boundary и даёт полный audit 0; до нового
immutable commit/rerun dependency gate остаётся `blocked`. Remote/restore/
approval gates также удерживают общий readiness в `blocked`.

## Independent review и cold-read

- Security/reliability reads выявили и закрыли: bootstrap exact-target/selector
  ambiguity и `.dev.vars` overlay, manual scheduler without admin audit, cleanup
  lease/audit races, sensitive download/funding/closure guards, stale outbox clock,
  PDF escaped-name/polyglot bypass и legacy cleanup lease.
- Final code cold-read после исправлений не нашёл remaining HIGH/blocker. Clean
  generated-worker boundary и fail-closed text scanner покрыты проверками.
- Independent operator content cold-read 2026-07-22 прошёл: четыре runbook,
  routes, flags, prerequisites, stop/rollback и NO-GO сверены; `docs:check`
  подтвердил 138 links/51 files + 82 command lines. Найденная неясность хранения
  materialized config закрыта exact ignored paths и `git check-ignore` guard.
- Full preview provider/manual/bootstrap/restore rehearsal не выполнялся и
  остаётся `blocked`; independent HEAD monitoring alert rehearsal passed
  2026-08-11. Monitoring evidence вошёл в immutable `b1a1505`; последующая
  dependency remediation и её evidence должны войти в новый immutable commit.
- Preview D1 migration и R2 provisioning не подменяют remote Browser conformance,
  full walkthrough и полный D1/R2 restore; эти gates остаются `blocked`.

## Remote preview evidence 2026-08-10

- Authorized target: отдельная preview D1; production resources не затронуты.
- Immutable code candidate: `4c0b43b3db85f8d799b9d28bb0ed79505809656f`;
  materialized `wrangler.preview.toml` остаётся ignored и не содержит secrets.
- Tooling: Wrangler `4.120.0`; перед remote action чистый `npm run
release:verify` завершился с exit code 0.
- Перед apply подтверждены ровно 14 ожидаемых pending migrations, 0 прикладных
  таблиц, 0 applied migrations и Time Travel recovery point
  `2026-08-10T15:17:57.466Z`.
- Remote apply: `0001`–`0014` применены; повторный list — pending 0. Remote/local
  schema-object inventory совпадает (396), `PRAGMA foreign_key_check` — 0,
  user rows — 0; присутствуют только две ожидаемые control seed rows.
- Это migration evidence, а не backup/restore rehearsal: protected export,
  isolated restore и rollback/roll-forward drill остаются `blocked`.

## Preview Turnstile evidence 2026-08-10

- Создан отдельный Managed widget `kolibri-reg-allgemein-preview` для preview и
  локальной разработки; его metadata повторно прочитаны через Cloudflare API.
- Публичный sitekey записан только в ignored `wrangler.preview.toml`. Secret не
  записывался в репозиторий или config: локальная recovery-копия зашифрована
  Windows DPAPI для текущего пользователя и защищена user-only ACL.
- Dummy Siteverify подтвердил корректность secret без раскрытия его значения.
  Временный API token отозван владельцем после завершения настройки; его
  локальный plaintext-файл больше не используется и подлежит удалению.
- Registration widget отправляет action `registration`; сервер требует exact
  action и deployment-specific hostname, ограничивает token 2048 символами и
  fail-closed обрабатывает timeout/network/schema ошибки. Preview backend
  allowlist не включает `localhost`/`127.0.0.1`; они отделены в local config.
- Targeted `auth-security` и `config` tests прошли: 2 files, 32/32 tests;
  `npm run check` — 0 errors/warnings.
- Полный post-change regression run прошёл: `npm test` — 44 files, 248/248
  tests; `npm run build` — passed.
- Turnstile secret установлен в preview Worker без раскрытия значения; DPAPI ACL
  повторно проверен и ограничен текущим Windows-пользователем. Реальный
  fresh-token submit и проверка replay rejection на защищённом backend не
  выполнялись, потому что public auth/email остаются выключены. Поэтому PR-C07
  остаётся `blocked`.
- Канонический Turnstile Spin bundle сохранён локально в ignored
  `.claude/skills/turnstile-spin/`: 13 файлов, включая SvelteKit reference и
  helper scripts. Копия побайтово сверена с установленным bundle; frontmatter и
  shell syntax проверены. Она является operational aid и не заменяет spec/runbook.

## Resend email preparation 2026-08-11

- Выбран существующий Resend domain `kolibri-dresden.de` без отдельного
  user-facing sending subdomain. Public DNS audit подтвердил, что root MX остаются
  IONOS, root SPF ровно один, а Resend DKIM и `send` MX/SPF уже присутствуют;
  DNS не изменялся.
- Утверждены exact identity
  `Kinder- und Elternzentrum Kolibri e.V. <registration@kolibri-dresden.de>` и
  Reply-To `registration@kolibri-dresden.de`; preview materialized config обновлён,
  но `EMAIL_PROVIDER=disabled` сохранён.
- Реализован direct HTTPS Resend adapter без дополнительного SDK: bounded timeout,
  pseudonymous stable idempotency key, safe request-ID response parsing и
  retryable/permanent classification без provider diagnostic/recipient/body в
  error. Production fake mode остаётся запрещён.
- Targeted config/provider tests прошли: 2 files, 33/33 tests; полный
  post-change regression — 45 files, 261/261 tests; `npm run check` — 0
  errors/warnings; `npm run build`, `docs:check`, `release:scan` и
  `git diff --check` прошли. Release scan проверил 471 text candidate и получил
  узкий allowlist только для утверждённого неперсонального registration mailbox;
  произвольный адрес по-прежнему fail-closed.
- Resend dashboard подтвердил `Verified` для `kolibri-dresden.de` в `eu-west-1`.
  Отдельный domain-scoped `Sending access` key создан, recovery-копия защищена
  Windows DPAPI, а `RESEND_API_KEY` установлен в preview Worker без раскрытия
  значения. `EMAIL_PROVIDER=disabled` не изменялся; synthetic delivery/reply
  smoke и реальная отправка не выполнялись. Поэтому PR-F01/PR-F02 остаются
  `feature_disabled`, а provider/privacy approval — `blocked`.

## Fail-closed preview Worker evidence 2026-08-11

- По отдельному прямому разрешению создан только Worker `reg-allgemein-preview`:
  `https://preview.example.com`. Production,
  DNS, CMS и официальный сайт не изменялись.
- Использован локальный Wrangler `4.109.0`; перед remote action прошли exact
  preview dry-run, проверка pending D1 migrations = 0 и `npm run release:verify`
  с exit code 0. Последний включил `check`, 45 files / 261 tests, Playwright,
  build, production dependency audit, `docs:check` и 471/471 release scan.
- SHA-256 ignored materialized config:
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`.
  Git HEAD во время deploy — `9d321758c67f111fb5de17b32e6434641f5bd654`,
  но worktree содержал незакоммиченные изменения; это не immutable release
  candidate. Remote evidence привязано к Cloudflare version
  `sha256:d483454a2af1` и не закрывает immutable Git gate.
- В Worker установлены только ожидаемые secret names: `JWT_SECRET`,
  `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`. Значения не выводились и не
  записывались в repository/config; JWT создан криптографически случайно только
  в памяти, provider recovery-копии прочитаны из DPAPI.
- Сохранён exact fail-closed набор: `AUTH_PUBLIC_ENABLED=false`,
  `EMAIL_PROVIDER=disabled`, `TELEGRAM_PROVIDER=disabled`,
  `DOCUMENT_UPLOAD_ENABLED=false`, `CONTRACT_SEND_ENABLED=false`,
  `CONTRACT_RENDERER=disabled`, `MEDIA_ONLINE_GRANT_ENABLED=false` и
  `PUBLIC_CONTRACT_FUNCTIONS_ENABLED=false`.
- Read-only HTTP smoke: `/` и `/auth/register` вернули 200; registration page
  показала service-unavailable state, submit остался disabled, Turnstile client
  не загружался. POST, real-token, provider send и authenticated Browser smoke
  не выполнялись.

## Preview Cron smoke evidence 2026-08-11

- Smoke выполнен по отдельному прямому разрешению только чтением automatic Cron
  evidence. Worker version
  `sha256:d483454a2af1`, SHA-256 ignored preview config и все
  fail-closed feature flags остались без изменений; deploy и secret operations
  не выполнялись.
- Cloudflare Cron использует UTC. Оба exact bucket подтверждены remote journal:
  `* * * * *` доставляет `email_outbox`/`telegram_outbox`, а
  `*/15 * * * *` — семь maintenance jobs. Первый run записан
  `2026-08-11T12:10:15.629Z`, первый maintenance batch — около 12:15 UTC.
- Snapshot `2026-08-11T12:22:00.565Z`: 31 automatic scheduled runs, из них 7
  `succeeded`, 24 `feature_disabled`, 0 `failed`, 0 `running`, 0 manual runs.
  Все девять allowlisted job names присутствуют; неожиданных cron bucket нет.
  Continuity read после локальной полной проверки в 12:27 UTC увидел уже 43
  terminal runs, по-прежнему 0 failed/running и пустые email/Telegram outboxes.
- Email/Telegram каждый раз завершились safe result `provider_disabled` до
  provider call. Семь maintenance jobs завершились `succeeded` с нулевыми
  claimed/processed/deleted/failed effects на пустых preview resources.
- Freshness в контрольной точке: every-minute job 19 секунд, maintenance job
  379 секунд. Дополнительно подтверждены safe counts: users 0, email outbox 0,
  Telegram outbox 0, manual-run audit 0, storage intents 0. Реальная отправка и
  создание synthetic/PII records не выполнялись.
- Remote manual-run не потребовался: automatic delivery уже дала прямое
  evidence, а manual UI корректно требует active admin, CSRF, confirmation,
  idempotency и audit. Bootstrap/admin exercise не входил в это разрешение.
- Это закрывает preview automatic delivery/freshness, но не alert ownership,
  missed-Cron/stale-lock/dead/dedupe failure injection, remote manual-run/RBAC и
  incident rehearsal. Соответствующие PR-D gates и общий NO-GO остаются
  `blocked`.

## Preview monitoring preparation 2026-08-11

- Актуальная Cloudflare документация проверена до implementation: на Free plan
  нет native per-Worker missed-Cron/repeated-runtime-error alert. Workers Logs и
  Metrics доступны, но active Health Check notification требует Pro+, traffic
  error-rate alert — Enterprise, Tail Worker — Workers Paid. Поэтому один Worker
  не считается независимым наблюдателем собственного отсутствующего Cron.
- Добавлена только forward migration `0015_worker_monitoring.sql`: application
  fetch exception/5xx агрегируются в PII-free UTC minute buckets без route,
  request ID, error text или payload; bounded maintenance удаляет buckets старше
  7 суток. Applied migration `0014` не изменялась.
- `GET|HEAD /_health/operations` возвращает только empty `204|503`, `no-store` и
  `noindex`. Пороги: every-minute jobs 180 секунд, maintenance jobs 1200 секунд,
  stale `running` 360 секунд, repeated scheduled/application errors — 3 за 900
  секунд. Missing D1/query/invalid freshness fail closed как 503;
  `feature_disabled` считается terminal Cron delivery, но не включает feature.
- Нормальный Worker fetch сохраняет native exception semantics: uncaught error
  после best-effort counter снова выбрасывается; 5xx counter записывается через
  tracked `waitUntil`. Endpoint не отправляет Resend/Telegram и не меняет ни
  одного feature flag.
- Targeted migration/monitoring regression прошёл: 3 files, 14/14 tests. Полный
  regression: 46 files, 267/267 tests; `npm run check` — 0 errors/warnings;
  build, `docs:check`, `release:scan` (474/474) и `git diff --check` passed.
- Preview remote apply/deploy выполнены по прямому разрешению. D1 migration list
  после `0015` — pending 0; Worker version
  `sha256:70c02839d41d`, ignored config SHA-256 остался
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`.
  GET/HEAD `/_health/operations` вернули 204, 0 bytes, `no-store`/`noindex`;
  POST — empty 405 с `Allow: GET, HEAD`. Safe D1 snapshot: 0 monitoring error
  buckets/errors, 98 `feature_disabled`, 21 `succeeded`, email/Telegram outbox 0.
  Secret names остались JWT/Turnstile/Resend; значения не читались.
- Все прежние feature flags сохранены, real email/Telegram send не выполнялся.
  Кратковременный read-only D1 preflight один раз получил API `7403`; повторные
  whoami/account/D1/migration checks сразу прошли, remote mutation до recovery не
  запускалась.
- Владелец подтвердил создание и email-verification UptimeRobot Free account с
  включённой 2FA. Создан независимый HTTP(s) monitor
  `Kolibri registration preview - Cron/Worker health` для canonical
  `/_health/operations`, интервал 5 минут, account notification contact получает
  DOWN и UP. Фактический HTTP method — `HEAD`: UptimeRobot Free UI не разрешил
  планировавшийся `GET`, а endpoint поддерживает эквивалентный empty `HEAD`
  signal со статусами `204|503`.
- Первый dashboard state `Up` подтверждён владельцем. Независимая read-only HEAD
  проверка `2026-08-11T14:22:28Z` вернула 204, 0 bytes, `no-store`/`noindex`.
- Provider `Test Notification` без temporary monitor доставил account contact
  synthetic DOWN и сразу следующий UP. Recovery notification содержит UTC
  timestamp `2026-08-11T14:13:22Z`; synthetic DOWN incident timestamp/duration
  provider обозначил как unavailable, поэтому отдельное выдуманное время не
  записывается. Владелец подтвердил получение обоих сообщений в правильном
  порядке и recovery. Application feature flags, Resend/Telegram и Cloudflare
  resources не изменялись. PR-D06 переведён в `passed`.

### Post-PR-D06 immutable verification и dependency remediation

- На clean HEAD `b1a15058c7d41cb226ef34c83e3f6692f8c198d6` полный
  `npm run release:verify` прошёл: check 0 errors/warnings, 46 test files и
  267/267 tests, 3/3 Playwright, build, production audit 0, `docs:check`
  137 links/51 files + 82 commands и `release:scan` 474/474. Exact
  `wrangler deploy --dry-run --config wrangler.preview.toml` также прошёл без
  upload/deploy и подтвердил ожидаемые preview bindings/flags.
- Отдельный clean clone exact `b1a15058c7d41cb226ef34c83e3f6692f8c198d6`
  прошёл `npm ci`. Полный audit baseline выявил 7 исправимых dev-only findings;
  production dependencies оставались clean.
- В изолированном clone проверено обновление SvelteKit, PostCSS, Wrangler,
  Miniflare и Workers types. Breaking Miniflare 5 options boundary мигрирован
  через `convertV4MiniflareOptions`; старый global `cookie` override сужен до
  SvelteKit, чтобы не переопределять `youch` dependency.
- После повторного clean `npm ci` полный и production-only audit показывают 0.
  Обновлённый candidate прошёл полный `release:verify` с теми же 267 tests и
  3 Playwright tests. Проверенные изменения перенесены в основной worktree, но
  ещё не являются immutable commit; remote resources не менялись.
- Основной worktree затем повторно прошёл полный `release:verify` за 253.1 s:
  0 diagnostics, 46 files/267 tests, 3/3 Playwright, build, production audit 0,
  137 links/51 docs files, 82 commands и release scan 474/474. Полный audit
  также 0; `npm ls cookie --all` подтвердил отдельные совместимые ветки.
  Wrangler 4.120.1 exact preview-config dry-run прочитал 68 assets и ожидаемые
  bindings/feature flags, завершившись до upload/deploy.
- По отдельному разрешению создан commit
  `63995f8532f45441885d7e3b042f4092471a8bc3` (`chore: remediate release tooling
advisories`). Новый exact clean clone прошёл `npm ci`, полный audit 0 и полный
  `release:verify` за 264.2 s: 46 files/267 tests, 3/3 Playwright, build,
  production audit 0, 137 links/51 docs files, 82 commands и clean-clone release
  scan 410/410. Clone остался на exact SHA без tracked changes.

### Public preview browser/accessibility smoke

- После первоначальной ошибки in-app Browser использован доступный Chrome
  DevTools MCP. Пользовательская browser session, cookies и authentication не
  требовались и не читались.
- Home, catalog, register, login, forgot и resend открылись на canonical preview
  origin с document status 200. Семантические snapshots подтвердили немецкие
  titles, один `h1`, `main`, именованные navigation/footer и доступные имена
  form controls. Auth registration оставалась явно disabled.
- Home и register прошли desktop/mobile Lighthouse: Accessibility 100, Best
  Practices 100, Agentic Browsing 100. На 390×844 horizontal overflow отсутствует;
  keyboard order проходит navigation, поля формы, checkbox и footer links с
  видимым solid amber focus outline.
- Lighthouse SEO 91 воспроизводимо указал только отсутствующий meta description;
  первый home load также записал единственный console error из-за
  `/favicon.ico` 404. Остальные проверенные страницы не имели console warnings/
  errors, все application assets вернули 200.
- В browser-fix candidate добавлены общий немецкий meta description, SVG favicon и E2E
  regression для обоих ресурсов. Targeted i18n 3/3 и Playwright 3/3 passed.
  Полный working-tree `release:verify` прошёл за 264.1 s: 46 files/267 tests,
  3/3 Playwright, build, production audit 0, docs и release scan 476/476.
- Commit `5a982ee48c3ea262d1851a4ce966a9f88d67ecee` прошёл в новом clean clone:
  `npm ci`, полный audit 0 и `release:verify` за 298.2 s; 46 files/267 tests,
  3/3 Playwright, build, docs и release scan 412/412. Clone остался чистым.
- Post-fix Chrome re-audit локального candidate подтвердил на desktop и mobile по 100 для
  Accessibility, Best Practices, SEO и Agentic Browsing; failed audits 0,
  console warnings/errors 0, `/favicon.svg` 200. Временный dev server после
  проверки остановлен.
- По отдельному разрешению exact commit развёрнут без миграций в существующий
  preview Worker как version `sha256:73d63af740da` на 100%.
  Config SHA-256 не изменился, D1 pending migrations 0, оба Cron сохранены.
  HEAD health вернул empty 204 с `no-store`/`noindex,nofollow`; home, catalog и
  пять auth-boundary routes вернули 200, favicon — 200 `image/svg+xml`.
- Deployed Chrome navigation audit на desktop и mobile дал по 100 для всех
  четырёх категорий и 0 failed audits. Console warnings/errors отсутствовали,
  все browser assets вернули 200. На register 390×844 overflow и controls вне
  viewport отсутствовали; Tab прошёл navigation и поля с видимым amber outline.
- Deployed root HEAD сохранил безопасный allowlisted `X-Request-Id`. Три
  ограниченные Wrangler tail попытки с version/method/self-IP или opaque-header
  filters не получили event до timeout; процессы остановлены, temporary raw
  files удалены. Последующий Workers Logs export доказал, что все четыре exact
  probe присутствуют в stored logs на deployed version: проблема была в
  автоматизированном live-tail capture, а не в Worker observability.
- Read-only review внешнего export evidence (2 394 018 bytes, SHA-256
  `28EC30B78F806C1497F425D7FE6DED115819F7DD281419D383E8304287D2E4D1`) охватил
  1001 record за 2026-08-11 12:10:17Z–21:59:16Z. Все 949 invocation outcomes
  были `ok`; 203 health HEAD вернули 204, 589 every-minute и 39 fifteen-minute
  Cron invocations завершились успешно. Raw export содержит platform IP/header/
  geo metadata и остаётся вне Git; прикладных email, bearer values или secret
  fields review не обнаружил.
- Review также выявил 52 ошибочно классифицированных structured error records:
  все имели HTTP 404 с outcome `ok` для отсутствующих generic crawler/browser
  ресурсов, но code `UNEXPECTED_SERVER_ERROR`. На deployed current version их
  четыре (`llms.txt`/`robots.txt`); прежний `favicon.ico` 404 после browser fix
  исчез. Локально `logServerError` теперь подавляет status ниже 500; regression
  подтверждает отсутствие `console.error` для 404 и один PII-safe structured
  record для 500. Полный локальный release-контур прошёл: check 0 diagnostics,
  46 files/269 tests, Playwright 3/3, build, production audit 0, docs checks и
  release scan 476/476.
- По отдельному разрешению создан commit
  `200268f39ece1d43c5e091dcb7db6569d41275af` (`fix: suppress expected 4xx error
logs`). Новый clean clone exact SHA прошёл `npm ci` с full audit 0 и полный
  `release:verify` за 266.2 s: check 0 diagnostics, 46 files/269 tests,
  Playwright 3/3, build, production audit 0, docs checks и release scan 412/412;
  clone остался чистым. На этой промежуточной точке PR-A15 оставался `blocked`
  только на remote части до отдельного preview deploy permission и stored-log
  recheck corrected version.
- По отдельному разрешению exact `200268f` развёрнут без миграций в существующий
  preview Worker как version `sha256:f4cd52e14dbd` на 100%.
  Config SHA-256 остался
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`, D1
  pending migrations 0, оба Cron сохранены. Wrangler dry-run до upload прочитал
  69 assets и подтвердил прежние bindings/feature flags.
- Post-deploy smoke 2026-08-12 11:30:56Z–11:31:07Z: health HEAD — empty 204 с
  `no-store`/`noindex,nofollow`; intentional missing route — 404; home, catalog,
  register/login/forgot/resend и favicon — 200. Новый live tail был подключён до
  повторных exact probes и увидел оба request ID на version `62b3cac4…`: 404 и
  204 с outcome `ok`; во всём bounded capture `UNEXPECTED_SERVER_ERROR` не было.
  Первая из этих post-fix tail попыток была корректно отклонена локальным
  Wrangler из-за `--sampling-rate 1` (разрешённое значение должно быть меньше
  1), затем повтор без sampling flag прошёл; это не Worker/runtime fault.
- Владелец предоставил bounded stored Workers Logs export после deploy: 163 730
  bytes, SHA-256
  `c2c138919b7b9366502158735f43146dc0b1ca26001a1116e0fa8cb1efcdc87a`, interval
  2026-08-12 11:12:16Z–11:42:33Z. Все 60 records — `cf-worker-event`, outcomes
  `ok`, truncation 0; 26 fetch и 34 scheduled. Exact 404 probe в 11:36:33.537Z
  имеет GET/404/outcome `ok`, а exact health probe в 11:36:33.868Z —
  HEAD/204/outcome `ok`; оба относятся к version `62b3cac4…`.
- В stored export нет custom application log records и нет
  `UNEXPECTED_SERVER_ERROR`; следовательно ordinary 404 больше не создаёт
  ложный structured server error. Raw export содержит platform request metadata,
  остаётся вне Git и не копируется в evidence. Совместно с unit regression,
  immutable clean-clone verification, предыдущим PII-safe stored-log review и
  current live-tail result это переводит PR-A15 в `passed` 2026-08-12.

### Fresh Ultra PR-A06 audit и local authenticated E2E

- Fresh repository-wide Ultra audit 2026-08-12 проверил тогдашние 91/91
  нормативных MVP IDs и все 166 acceptance bullets. Для 37 bullets без embedded requirement ID
  заведены stable matrix IDs; implementation и automated-test paths сверены с
  текущим code/spec, а environment gaps отделены от local trace status.
- Audit выявил HIGH defects в dual-role/dual-control переходе parent→admin и
  configured upload concurrency/ambiguous-commit обработке, а также скрытые из
  deploy source privacy-download handlers и неполные parent role-route
  boundaries. Исправления покрыты точными unit/integration negative,
  atomicity/concurrency и safe-404 tests. Независимый финальный re-review не
  нашёл оставшихся HIGH/BLOCKER implementation/coverage discrepancies.
- Полный текущий dirty-worktree `npm run release:verify` прошёл за 487.3 s:
  check 0 errors/warnings, Vitest 53 files/327 tests, local Chromium 2 files/8
  tests, build, production audit 0, docs 136 links/51 files + 82 executable
  commands и release scan 492/492.
- Initial PR-A06 Chromium baseline дал пять authenticated и три foundation
  cases: role-aware redirects, parent ownership/request cross-user failure,
  role-route separation, tampered/revoked sessions, admin block и 390px
  keyboard/no-overflow path. Это историческая точка 8/8 до post-audit expansion,
  которая зафиксирована следующим разделом.
- Поэтому PR-A06 переведён в `passed`, а PR-A12/13/14 остаются `blocked` с
  уточнённым residual scope. Этот результат относится к проверенному
  незакоммиченному worktree: immutable HEAD всё ещё
  `200268f39ece1d43c5e091dcb7db6569d41275af`; новый immutable release candidate
  без отдельного разрешения не создавался.

### Intermediate post-PR-A06 local browser expansion

- Новый local-only Chromium run прошёл 13/13: шесть authenticated
  access/session/CSRF/IDOR cases, три accessibility cases, один individual
  request lifecycle и три foundation cases. Individual request прошёл полный
  browser путь create→submit→admin approve→parent approved 1/1.
- Cross-parent matrix проверяет child/request, document download/delete,
  contract detail/artifact, price response, message append/close и
  privacy export. Foreign reads/mutations дают безопасный результат, а
  owner-visible state остаётся неизменным; typed safe-404 regression и focused
  documents D1 suite 16/16 также прошли.
- Axe 3/3 выполнен без отключения default rules на public registration,
  authenticated parent cabinet и admin detail. Наблюдаемые raw results:
  `violations=[]`, `incomplete=[]`; German structure/labels и visible keyboard
  focus также проверены.
- Полный uninterrupted `npm run release:verify` после расширения прошёл за
  353.3 s: check 0 errors/warnings, Vitest 53 files/327 tests, Playwright 4
  files/13 tests, build, production audit 0, docs 136 links/51 files + 82
  commands и scan 494/494. Отдельный полный `npm audit` вернул 0.
- Harness cleanup подтверждён: `.wrangler/e2e-runtime/runtime.env` отсутствует,
  а pre-existing `.wrangler/state` не менялся (latest timestamp
  `2026-08-12T11:14:19Z`). Независимый read-only re-review не нашёл
  HIGH/BLOCKER. Evidence остаётся локальным и относится к незакоммиченному
  worktree; remote resources не использовались и не менялись.

### Final local PR-A12/13/14 expansion

- Финальный isolated Chromium run прошёл 8 files/18 tests: шесть authenticated
  access/session/CSRF/IDOR, четыре accessibility, три foundation и по одному
  lifecycle для individual request, catalog/trial, support, structured absence
  и price review. Request прошёл draft→submit→admin approve→parent approved;
  catalog показал exact €46, trial прошёл requested→admin confirmed→parent
  cancelled; support и absence сохранили final admin reply, parent reread и по
  одному pending email/Telegram outbox delta; price item €46→€50 прошёл exact
  parent acceptance и distinct admin confirmation до `scheduled`, сохранив €46
  как текущую цену до effective date.
- Browser contract accept/form/activate не заявляется: `CONTRACT_RENDERER` и
  `CONTRACT_SEND_ENABLED` намеренно disabled. Browser contract evidence
  ограничено foreign detail/artifact и carrier-bound active end/attendance/media
  denial без owner-state mutation.
- IDOR matrix теперь включает missing/wrong/valid CSRF; request save/submit/
  cancel; document download/delete и mismatched request carrier; trial create/
  cancel; contract detail/artifact/end/attendance/media и mismatched offer
  carrier; price response; message append/close; privacy artifact и forged
  subject fields, которые остаются self-scoped. Direct route tests различают
  safe 404 и owned validation/state 409; rendered SvelteKit form transport
  проверяется по semantic denial и неизменному owner state.
- Contract atomicity/replay focused selection прошла 6/6, полный contracts D1
  suite 13/13: exact statutory withdrawal replay после terminal state требует
  current owner, matching contract/offer/hash и passed assertion; eligibility
  race полностью откатывает attendance/media evidence; concurrent identical
  attendance/media/end оставляет одну asserted chain. Independent final
  re-review дал GO без HIGH/BLOCKER.
- Accessibility 4/4 выполняет все default-enabled axe rules и проваливается при
  любой записи в `violations` или `incomplete`; проверены inline login error
  association/announcement/focus, 390px parent/admin no-overflow и deterministic
  640px 200%-zoom-equivalent registration reflow. Literal/manual zoom,
  assistive-technology и manual glyph/font review остаются обязательными.
- Финальный `npm run release:verify` прошёл за 619.5 s: check 0/0, Vitest 54
  files/340 tests, Playwright 8 files/18 tests, build, production audit 0, docs
  136 links/51 files + 82 commands и scan 500/500. Отдельный полный `npm audit`
  вернул total 0. Port 4173 свободен, `.wrangler/e2e-runtime/runtime.env`
  отсутствует, pre-existing `.wrangler/state` не менялся.
- Эта историческая локальная ревизия позднее была зафиксирована как clean
  baseline `c5712d0`; приведённая выше pre-commit verification относится именно
  к ней и не переносится на Access/Telegram resulting candidate. Deployed preview
  остаётся на `200268f39ece1d43c5e091dcb7db6569d41275af`. Deploy, migrations,
  provider sends, feature enablement и другие remote mutations при подготовке
  baseline не выполнялись.

### Mandatory Access/PlusBText and Telegram readiness expansion 2026-08-14

- User-directed continuation established `c5712d06af217129f0344864b69ddda962c29d19`
  as the clean baseline. It does not contain the complete required work below;
  the new immutable candidate lineage through `8f247e5` now exists and passed
  exact-SHA clean-clone verification. Independent exact-SHA review remains
  pending. Existing deployed preview remains `200268f` / `62b3cac4…`.
- Current Access source was previously inspected only through the non-executing
  allowlisted parser: sanitized result 1703 rows, 21/21 required fields,
  `access-tblkartei:v1` compatible. No source row/path/hash is recorded here and
  no D1 import was performed.
- Value-free inspection established that current PlusBText still conforms to
  `admin-xlsm-plusbtext:v1`. The earlier `PLUSB_HEADER_CONTRACT_MISMATCH` was a
  parser sanitizer false mismatch around a styled self-closing empty cell that
  consumed the following populated cell, not source-contract drift. PR-B12 tracks
  focused/current-source regression plus full immutable verification; v1 is not
  silently relaxed and any true future contract change still requires a new
  approved version.
- The resulting local candidate implements the PR-B13/PR-B14 command and D1
  boundary: schema-v3 no-write plan with `sourceClass`/`syntheticFixtureId`,
  inactive stage,
  digest-bound independent review, target/plan/review-bound recovery artifact,
  recovery-bound atomic Access+PlusBText CAS promote, safe planned/actual-count
  verify, rollback and roll-forward. Preview generates its own deterministic
  1703-row `legacy-preview-synthetic-baseline-v1` /
  `legacy-preview-synthetic-candidate-v1` bundles and rejects Office
  paths; production
  requires both read-only sources. Candidate migrations `0016` and `0018` add
  append-only release/event control, pairwise planner/stager/reviewer separation,
  transition-actor separation from reviewer, recovery-verifier separation from
  planner/stager/reviewer/promoter,
  immutable count contract and exact-actor failed-stage cleanup.
  Populated `0016`→`0018` regression also proves that grandfathered plans with
  `NULL` actor fields or `{}` contract remain immutable but fail closed for
  every lifecycle transition; they must be replaced by a new hardened plan.
  Final focused legacy validation passed 13/13 integration and 38/38 unit
  tests; migration-upgrade and normal release-lifecycle subsets passed 3/3 and
  2/2.
  Deployed preview remains on `0001`–`0015`; neither migration nor a remote
  command was authorized/executed. Production transitions remain fail-closed
  before API-token lookup/network pending remote transaction evidence.
- First import has no previous-version rollback target. Before the first remote
  promote, a recovery bookmark/pre-import backup and isolated restore to the
  no-current state are mandatory. Direct SQL/delete is not recovery.
- Telegram remains externally fail-closed, while the resulting local candidate
  implements the PR-F12/PR-F13 core: one-way `TELEGRAM_PROVIDER=bot_api`, strict
  minimized payload, bounded Bot API policy, append-only dispatch evidence and
  terminal `delivery_unknown` (`TELEGRAM_DELIVERY_UNKNOWN`). Unknown/retry/dead
  stops the drain; `429` persists destination cooldown even without usable
  `retry_after`; activation cutoff keeps historical backlog out; unresolved
  unknown or terminal dead blocks later sends and alerts;
  operator uses exact-attempt audited `confirm_sent`, `retry_after_review` only
  after verifying absence, or `cancel`. No provider call was made.
- Valid Bot API `ok=false` `408|425|5xx` is conclusive retryable. Network/
  timeout/unreadable/oversized/malformed/non-`ok=true` ambiguous envelope,
  invalid/mismatched success, destination mismatch or lost post-send D1
  confirmation is ambiguous and becomes `delivery_unknown`; a local fake
  ambiguous test is not evidence that the real preview send was ambiguous.
- Telegram preview evidence requires a separately authorized single synthetic
  send plus failure/unknown operator drill, with no client/child/document/free
  text and no token/chat/body/provider diagnostic in evidence. No provider send,
  secret/config change, deploy, migration or remote import was authorized by
  this documentation update.
- The local PR-F14 boundary also implements D1-only
  `telegram:smoke:abort`: only an exact target-bound unsent `pending` or partial
  zero-attempt `processing` cohort can become `cancelled`, with append-only
  authorization/assertion. Cron cannot reclaim the smoke signature; any
  dispatch attempt or terminal row fails closed. Manifest/evidence writers use
  POSIX `0600` or a protected Windows ACL whose sole allow rule grants current
  SID `FullControl`. До final reconcile change focused Telegram verification
  passed 8 files/91 tests and `check:src` 0/0; no remote D1/provider operation
  occurred.
- Final local smoke hardening additionally provides
  `telegram:smoke:reconcile` for a crash after durable `dispatch_started`: exact
  target/cohort and expired lease are mandatory; the D1-only command has no
  Telegram secrets/preflight/send/retry path and idempotently records one
  `delivery_unknown` attempt for ordinary audited manual resolution. Active
  lease, wrong proof, new `run` or abort fail closed. Focused crash test and the
  full preview-smoke D1 suite passed 1/1 and 7/7; this command was not run
  against remote D1.
- Final mutable-worktree verification on 2026-08-14 passed: `npm run check`
  0 errors/warnings; Vitest 63 files / 471 tests; Chromium 18/18; production
  build; `npm audit --omit=dev` with 0 vulnerabilities; documentation 143
  links in 51 files plus 105 executable commands; release scan 522/522; and
  `git diff --check`. This mutable result was strong local evidence only; the
  subsequent clean-clone result below supersedes it for the exact-SHA checks.
- Exact-SHA clean clone of `8f247e5` subsequently passed `npm ci` and the full
  `npm run release:verify` in 563.9 s: check 0/0, Vitest 63 files / 471 tests,
  Chromium 18/18, build, production audit 0, documentation 143 links in 51
  files plus 105 commands and fresh-clone scan 458/458. At that historical
  checkpoint PR-A16 still awaited the later `a590d1f` independent verdict,
  which is now recorded in the 2026-08-17 checkpoint below.
- These new rows remain `blocked` after local implementation until an immutable
  candidate and exact target-pinned preview evidence exist. Legal/provider approvals, restore/RPO/RTO,
  production resources/origin, remaining browser/manual gates and explicit
  production permissions independently preserve the overall **NO-GO**.

### Read-only preview and current-source checkpoint 2026-08-17

- Parent `ca4ef8f50ea0ffc1139c2ec3d286cbdb7e4158ec` adds strict Access OLE
  Automation date-serial handling and passed exact-SHA clean-clone `npm ci` plus
  full `release:verify` in 556.4 s. At that historical checkpoint, exact
  deploy/runtime candidate `a590d1f` then passed full clean-worktree
  `release:verify` in 522.9 s: check 0/0,
  Vitest 63 files/472 tests, Chromium 18/18, build, production audit 0, docs 143
  links/51 files plus 105 commands and scan 522/522.
- Independent read-only exact-SHA review of `a590d1f` found no code HIGH/BLOCKER
  across migrations `0016`–`0018`, exact-target import/PII boundaries, strict
  Access OLE parsing and Telegram delivery certainty/minimization/operator
  flows. Evidence is recorded in docs-only seal
  `7292d6ff1dbc67f20c7f803e9da1cdb51c8aa322`. PR-A16 is passed locally; this
  does not transfer historical preview evidence or close any external gate.
- Read-only public and Wrangler inventory confirmed root HEAD 200 and
  operations-health HEAD 204. Preview still runs historical `200268f` as Worker
  version `sha256:f4cd52e14dbd` at 100%; candidate
  `a590d1f` is not deployed.
- Remote preview D1 remains without an academic period, users, import runs,
  current PlusBText/Access snapshots or Telegram outbox rows. Candidate
  migrations `0016`–`0018` are pending. A current Time Travel bookmark exists,
  but a protected backup plus independently verified isolated restore is not
  evidenced. No migration/import/restore was executed.
- Fresh read-only non-executing current-source parsing confirmed strict
  `admin-xlsm-plusbtext:v1` with 302 rows, 164 old groups, 138 targets, 61
  warnings and no error/fatal; and strict `access-tblkartei:v1` with 1703 source
  rows and 21/21 required fields. The first Access aggregate projection reported
  580 families, 713 children, 929 enrollments and 1429 warning occurrences; that
  warning count was later shown to contain normalization false positives and is
  retained only as historical evidence. No row values, PII, source hashes or
  Office contents were emitted.
- Data-owner clarification on 2026-08-17 established `IMPORT-07`: future-period
  `O/R/S/T` are group/imported current price/contract marker/activity code;
  `KN` is inactive; `NH/N/IND` are hourly; an `O/V`/`V/O` token in `S` is
  monthly and blank/other `S` is yearly. Parent names accept one semicolon,
  comma or space separator; slash/multipart stays manual. Missing duration and
  zero price do not block hourly/inactive rows, positive `R` wins for an
  existing legacy service, invalid email never auto-claims and invalid birth
  date never creates a child/enrollment.
- After implementing those rules, the same allowlisted source produces the
  sanitized aggregate 580 families, 713 children and 809 real enrollments, with
  160 issue occurrences and 53 enrollment reviews. The remaining safe classes
  are 30 complex parent names, 36 active-group durations, 32 invalid emails, 26
  invalid/missing birth dates, 21 family contact conflicts, six exact duplicate
  buckets, three child-identity anomalies, two Access ID-mirror consistency
  aggregates, two invalid and one missing active-group price, one active
  unresolved group. `OQ-029` is closed: package groups are only `AK–AN` and
  `AP–AS`; `AT/Value46` is retained by the current future-period extract but
  never a group, while `AO/Value41` is outside that allowlist and must be ignored
  if current-block import is added. `OQ-035` records that the unresolved
  group is an upstream correction case and must not be fuzzy-mapped.
- `IMPORT-08` and `AC-IMPORT-27`–`31` are now implemented locally by migration
  `0019`, stable PII-free cases/occurrences, append-only typed decisions and
  assertions, reimport persistence/reopen/resolved evidence, repository/D1
  generic-closure denial, assignment/homogeneous batch, typed duplicate and
  existing-tool evidence flows, `/admin/import-reconciliation` queue/export and
  release/registration fail-closed gates. External preview and owner/admin
  evidence are still absent.
- The resulting worktree passed `npm run check` with 0 errors/warnings, all 63
  Vitest files/478 tests, production build, docs check with 151 links/52 files
  plus 105 commands, release scan 523/523 and `git diff --check`. This is strong
  local worktree evidence, but it is not yet an immutable exact-SHA candidate or
  an independent review and does not authorize any remote action.
- The available protected preview config is Git-ignored but lacks the separate
  pinned `account_id`/`preview_database_id` control binding required by the
  remote import runner. This is a correct fail-closed boundary, not a reason to
  weaken exact-target validation.
- Ordinary preview remains a synthetic/no-PII rehearsal target. Uploading the
  current Access/Admin PII into that public preview is not authorized by an
  import request alone. If real-data rehearsal is required, the data/privacy
  owner must approve a separate locked-down PII target with public auth and
  external providers disabled, explicit retention/cleanup, a recovery point
  and independently verified isolated restore.
- Preview runtime remains fail-closed for public auth, email, Telegram, upload,
  contract renderer/send, public contract functions and online-media grant.
  Scheduled jobs are enabled. Secret-name-only inventory found no
  `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID`; the owner-reported private channel
  invitation does not establish bot identity, numeric channel ID or posting
  permission. No secret value was read and no Telegram request/send occurred.
- No deploy, remote migration, remote import/stage/promote, backup restore,
  secret/config mutation, provider send or production/CMS action occurred in
  this checkpoint. Overall status remains **NO-GO**.

## Release gates

Полный ledger: [PRODUCTION_READINESS_CHECKLIST.md](../../operations/PRODUCTION_READINESS_CHECKLIST.md).

| Gate                              | Статус                         | Evidence / next action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Owner                                             |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Local implementation/traceability | `passed`                       | PR-A06 historical audit covered 91/91 MVP IDs and 166 acceptance bullets/37 stable untagged mappings. Historical exact candidate `a590d1f` maps 99/99 IDs and 175 bullets and passed its narrower review. Exact `8c6e2a` was rejected with 2 BLOCKER/2 HIGH; exact `b2e8548f` with 1 BLOCKER/1 MEDIUM. Runtime anchor `abb93f25` passed the full chain; docs/test remediation anchor `4ac6a491` passed proportional gates. Final exact docs-only review seal `2bedc73c` passed short gates and its separately authorized independent read-only review returned GO without BLOCKER/HIGH, with one MEDIUM test-isolation residual and no runtime bypass | Local exact-SHA gate complete 2026-08-19; external gates remain separate |
| Dependency security               | `passed`                       | immutable `200268f`: clean install, full audit 0, full release verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | dependency/security owner                         |
| Environment/origin/R2 isolation   | `blocked`                      | preview Worker, D1 exact `0001`–`0022`, private EU R2 and current empty-state restore verified; exact preview hostname is protected by Access with exact two-principal OTP Allow, 168h manual policy session, one-token Service Auth and no Bypass. Custom/production origin/resources remain absent                                                                                                                                                                                                                                                                        | Cloudflare/security owner                         |
| Scheduled monitoring              | `passed`                       | preview Cron + external 5-minute HEAD monitor; DOWN→UP test delivery/recovery confirmed 2026-08-11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | operations owner/account contact                  |
| Admin bootstrap/recovery          | `blocked`                      | local one-shot passed; remote clean-room and recovery drill                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | security/operations owner                         |
| Current legacy import             | `blocked`                      | Fresh current-source sanitized parse and local `IMPORT-07` implementation reduce obsolete 1429/751 noise to 160 issue occurrences/53 enrollment reviews. Exact runtime/remediation/final-review gates pass; protected exact-target control review is GO, and remote schema prerequisites `0016`–`0022` are deployed with exact ledger/object/FK evidence. No import plan or runner transaction exists. Admin cold-read, synthetic no-PII remote lifecycle, plan-bound first-import recovery and any current-data import remain absent                                                                                                                           | import/admin/data/backup/privacy owners           |
| Public auth/email                 | `feature_disabled`             | scoped key/secrets installed; enablement, real-token and delivery smoke absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | auth/provider owner                               |
| Telegram                          | `feature_disabled` / `blocked` | fail-closed deployed evidence and historical exact `a590d1f` verification/independent review exist; local `bot_api`/delivery-certainty/operator implementation and tests exist. Preview bot/chat secrets are absent; the channel invitation alone is not target evidence. Dedicated bot ownership, exact numeric destination/permissions, preflight, authorized synthetic normal-outbox smoke and operator rehearsal remain absent                                                                                                                                                                                                   | provider/privacy/reliability/operations owners    |
| Upload                            | `feature_disabled`             | preview private-EU R2 split passed; controlled AV/training/legal/production evidence absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | storage/security/legal owner                      |
| Contract/statutory/media          | `feature_disabled`             | production renderer/templates/legal assessment absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | contract/legal/privacy owners                     |
| Backup/restore/RPO/RTO            | `blocked`                      | One-off pre-candidate D1 protected export/full isolated restore, current empty-state R2 restore and pre/post-bookmarked source apply through `0022` passed 2026-08-20. RPO/RTO, cadence/retention, reusable non-empty R2 mechanism, post-apply isolated restore, rollback/forward-fix and application critical-path smoke remain absent                                                                                                                                                                                                                                              | data/backup/operations owners                     |
| Synthetic browser lifecycle       | `blocked`                      | local Chromium 8 files/18 tests covers request, catalog/trial, support, structured absence and price review through `scheduled`; Browser contract accept/form/activate is not claimed. Register/verify/claim, funded upload/document review, enabled contract lifecycle, price admin-send/apply and preview/provider auth remain                                                                                                                                                                                                                                                                                                     | product/release owner                             |
| Accessibility/browser             | `blocked`                      | public preview smoke plus local strict accessibility 4/4: all default axe rules, empty `violations`/`incomplete`, inline-error semantics, 390px parent/admin and 640px zoom-equivalent reflow passed; literal/manual zoom, assistive-technology, glyph/font and remote auth review absent                                                                                                                                                                                                                                                                                                                                            | UX/accessibility owner                            |
| Permission/IDOR/browser           | `blocked`                      | local authenticated 6/6 plus trial branches, exact route tests and focused D1 cover request/document/trial/contract-end-attendance-media/price/message/privacy with carrier-bound safe 404, owned 409, unchanged owner state and atomic rollback/replay; enabled contract decision, disabled upload, remaining enrollment/group-service and guessed/admin-purpose variants plus preview remain                                                                                                                                                                                                                                       | security owner                                    |
| Legal/privacy/provider            | `blocked`                      | external approvals absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | authorized owners                                 |
| Production deploy                 | `blocked`                      | NO-GO + direct approval absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | authorized release owner                          |
| Official-site links               | `blocked`                      | exact surfaces/old values/separate permission absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | authorized site owner                             |

## Отдельно разрешаемые production/site действия

Каждый пункт требует отдельного прямого поручения и exact targets:

1. Cloudflare remote resources, DNS и TLS;
2. preview deploy/migration/provider/Cron/Browser smoke;
3. production D1 migration;
4. production Worker deploy или rollback;
5. remote import plan/read-only review, inactive stage, immutable review,
   promote, verify,
   rollback/roll-forward and restore are separately scoped; real PII import has
   its own data/privacy approval and is forbidden in ordinary preview;
6. email/Telegram enablement, secret/config mutation and each real external send,
   including one synthetic preview smoke, are separately scoped;
7. upload/contract/media/statutory enablement;
8. production backup/restore;
9. изменение CMS, ссылок или страниц официального сайта.

Разрешение одного пункта не разрешает остальные.

## Следующие действия

1. Ближайший отдельный gate — exact preview Worker deploy поверх уже применённой
   schema `0001`–`0022`. Он не разрешает import, bootstrap, flag/secret mutation,
   provider send или любой production/site action.
2. Не повторять full/focused chain `4ac6a491` без нового
   `src`/`migrations`/`tests` diff. Exact `2bedc73c` short gates уже прошли.
3. Exact `2bedc73c` independent review уже завершён GO. При следующем изменении
   candidate не наследовать этот verdict; один MEDIUM stale-action fixture gap
   исправлять только как отдельный локальный test change с новым immutable SHA
   и новым отдельно разрешённым review.
4. Cloudflare Access perimeter уже защищает exact preview hostname, оба manual
   OTP smoke прошли, manual policy session увеличена до 168h. Owner подтвердил
   revoke temporary Cloudflare API token; exact local DPAPI copy удалена и
   локально невосстановима. Agent service token удалить/rotate после
   автоматических preview-проверок, не позднее его expiry.
5. Protected exact-target control config подготовлен, локально проверен и
   получил independent read-only GO без BLOCKER/HIGH/MEDIUM. Auxiliary SHA/origin
   vars не заменяют canonical plan/clean-HEAD guard; при изменении HEAD их нужно
   повторно сверить. Backup/restore и migration gates завершены в отдельно
   разрешённых scopes; deploy, import, secret mutation и provider send остаются
   раздельными permissions.
6. Продолжить безопасный local PR-A12 scope только для оставшихся lifecycles:
   register/verify/claim, funded Nachhilfe upload/document review, enabled
   contract accept/form/activate, price admin-send и scheduled apply; preview/
   provider authenticated rehearsal требует отдельного разрешения.
7. Для PR-A13 провести literal/manual zoom, assistive-technology и glyph/font
   review. Для PR-A14 закрыть disabled-upload mutation, оставшиеся
   enrollment/group-service и guessed/admin-purpose variants; preview matrix
   также требует отдельного разрешения.
8. Поддерживать independent uptime monitor для `/_health/operations` и
   периодически повторять delivery test; real-token Turnstile, synthetic email
   delivery/reply и другие provider sends требуют отдельных разрешений.
9. Получить RPO/RTO/cadence, реализовать non-empty R2 backup и пройти post-apply
   isolated D1/R2 restore + rollback/roll-forward drill.
10. Получить legal/privacy/template/provider/DPA/AVV inputs и approvals.
11. Провести full non-production bootstrap/runbook execution с approved preview
    resources; локальный content cold-read уже пройден.
12. Только после отсутствия `blocked` запросить отдельные production и site-link
    поручения.

## Session checkpoint 2026-08-12

- UptimeRobot Free account создан и защищён 2FA. Main HTTP(s) monitor активен на
  canonical preview health URL с фактическим методом `HEAD`, interval 5 minutes
  и DOWN+UP delivery на account notification contact; dashboard state `Up`.
- Provider test action доставил DOWN→UP pair, recovery timestamp
  `2026-08-11T14:13:22Z`; owner подтвердил оба сообщения. Отдельный temporary
  monitor не создавался. Read-only HEAD `2026-08-11T14:22:28Z` вернул empty 204.
- In-app Browser в этой сессии не был доступен; UptimeRobot UI ранее заполнил
  владелец. Public preview smoke позднее выполнен через Chrome DevTools MCP без
  user session; browser cookies/profile/OAuth storage не читались.
- Не повторять migration/deploy по истории чата. До любой новой remote mutation
  сначала сверить tracked handoff, `git status`, current version и pending
  migrations; production, DNS/CMS, feature enablement и application sends
  требуют отдельных прямых поручений.
- Post-deploy сверка этой сессии: HEAD `200268f`, preview config SHA-256
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`,
  Worker version `sha256:f4cd52e14dbd` на 100%, D1 pending
  migrations 0; post-deploy HEAD вернул empty 204 с обязательными headers.
- Immutable logging-remediation candidate независимо проверен в clean clone:
  `npm ci`, full audit 0 и полный `release:verify` passed. Public deployed HTTP
  и bounded live-log smoke также passed; bounded stored-log confirmation
  получено, PR-A15 закрыт. Первый local authenticated subset прошёл 8/8 и затем
  до intermediate Chromium checkpoint 13/13; финальный local harness прошёл 8
  files/18 tests. Остаточные enabled lifecycles, remote authenticated,
  provider/manual и restore evidence остаются.
- Следующая remote mutation или production/site action требует нового прямого
  поручения соответствующего scope; stored-log review является read-only.

### Результат новой Ultra-сессии

- PR-A06 repository-wide audit выполнен и закрыт 2026-08-12. Matrix теперь
  является проверенным текущим source of trace claims, а не очередью на будущий
  audit; local trace gate не наследует статусы remote/provider/legal/restore
  gates.
- Следующими реально разблокированными локальными gates стали PR-A12/13/14.
  Изолированный Chromium harness теперь прошёл 8 files/18 tests с пятью
  lifecycle specs, strict accessibility 4/4 и carrier-bound cross-parent IDOR;
  Browser contract accept/form/activate не заявляется. Focused contract
  atomicity/replay прошёл 6/6, full contracts 13/13, independent re-review дал
  GO без HIGH/BLOCKER. Ledger намеренно сохраняет gates в `blocked` на точных
  residual lifecycles, manual accessibility, variants и preview evidence выше.
- Во время audit/development не выполнялись deploy, migrations, provider sends,
  feature enablement или создание remote resources. Commit также не выполнялся
  и по-прежнему требует отдельного прямого разрешения.
- Следующая remote mutation или production/site action требует нового прямого
  поручения exact scope. Историю preview PR-D06/PR-A15 не нужно повторять без
  нового основания; сначала сверять current version, pending migrations и этот
  ledger.

## Итог worktree

- At this historical 2026-08-17 checkpoint, the deploy/runtime candidate was
  `a590d1f08110c20b6f7b45294cb91a7be7b5a8e3 docs: record preview deployment
  checkpoint`; its parent `ca4ef8f` contains the Access parser fix. Exact
  candidate local verification and independent PR-A16 review passed on
  2026-08-17. Every remote/external gate remains pending.
- The historical deployed preview still runs exact `200268f` as Worker version
  `sha256:f4cd52e14dbd`; no new deploy/migration/import/send or
  feature enablement occurred during the readiness documentation expansion.
- `docs/prompts/stage-13-continue-deployment.md` обновлён как ignored local
  accelerator для новой Ultra-сессии и не должен добавляться в Git.
- Read-only preview recheck 2026-08-17 confirmed historical version
  `sha256:f4cd52e14dbd` at 100%, root HEAD 200 and operations
  health HEAD 204. Remote D1 still has deployed migrations `0001`–`0015`, while
  `0016`–`0018` are pending; client/import/Telegram aggregate state is empty.
  Runtime flags remain fail-closed and preview Telegram secret names are absent.
  Secret values, client rows and deployment author identity were not read;
  remote mutation was not performed.
- Production/CMS/official-site actions не выполнялись.

## Continuation 2026-08-17: `IMPORT-08` local gate

- Continued from exact clean checkpoint
  `d6118d17d9b48b1c00e2bdc4e02390b2d67dd9b1`; no repeated deployment audit was
  performed. Wrangler remains `4.120.1`.
- Added append-only migration `0019_legacy_import_reconciliation.sql` with
  durable PII-free cases/occurrences, typed append-only decisions/assertions,
  strict state/version/actor/terminal guards, one transition per case version
  and D1 denial of generic actionable issue closure. Applied migrations
  `0001`–`0018` were not edited.
- Validated Access/PlusBText runs now materialize a stable manifest. Persistent
  issue evidence keeps one active case, failed reimport returns
  `ready_to_verify` to `open`, disappearance closes only
  `resolved_by_reimport`, and a known changed entity/source identity explicitly
  supersedes the old case. Release verify returns class/state counts plus an
  opaque evidence ID; blocking cases also stop legacy family registration.
- Added typed admin repository and `/admin/import-reconciliation` with filters,
  assignment/unassignment, homogeneous batch, existing catalog/family evidence
  links, upstream checklist, PII-free JSON export and safe timeline. Duplicate
  decisions are typed; exact catalog evidence binds the current normalized
  source mapping, and fuzzy/unbound targets fail closed. Every POST revalidates
  current admin, CSRF, optimistic version and idempotency.
- Automated evidence:
  - `npm run check` — passed, 0 errors/warnings;
  - `npm test` — passed, 65 files / 483 tests;
  - `npm run test:e2e` — passed, 18 Chromium tests;
  - `npm run build` — passed;
  - `npm run docs:check` — passed, 151 links / 52 files and 105 commands;
  - `npm run release:scan` — passed, 532/532 text files, no prohibited
    artifacts/high-confidence secrets/high-confidence PII identifiers;
  - `git diff --check` — passed.
- The user created immutable commit
  `eb35a8c63c53c4edf44bb257a2dae641c63715cf` (`feat: add durable legacy import
  reconciliation`). A fresh post-commit exact-SHA verification on 2026-08-18
  passed in 584.2 s: `npm run check` (0/0), `npm test` (65 files / 483 tests),
  `npm run test:e2e` (18 Chromium tests), `npm run build`, `npm run docs:check`
  (151 links / 52 files and 105 commands), `npm run release:scan` (532/532),
  and `git diff --check`. HEAD remained exact and the worktree remained clean.
  Authorized independent exact-SHA review was subsequently performed and
  returned NO-GO; see the remediation checkpoint below.
- No amend, push, tag, remote migration, import, deploy, provider send, secret
  or feature mutation was performed by Codex. Deployed preview remains historical
  `200268f` / Worker version `sha256:f4cd52e14dbd`; remote D1
  still has `0001`–`0015`, while local `0016`–`0021` remain pending.
- Overall deployment remains `NO-GO`: PR-B17 needs a new immutable remediation
  checkpoint and independent exact-SHA review, admin cold-read and authorized owner
  exercise of the one upstream group/six duplicate buckets; protected preview
  migration/synthetic rehearsal, restore evidence and every production/provider/
  legal gate remain blocked. Every remote mutation still requires its own exact
  permission.

## Continuation 2026-08-18: exact review NO-GO and remediation

- User authorized an independent read-only review of exact
  `eb35a8c63c53c4edf44bb257a2dae641c63715cf`. The reviewer found 6 HIGH,
  2 MEDIUM and 1 LOW issues; local `IMPORT-08` gate verdict was NO-GO.
- Remediation in the current worktree:
  - deterministic PII-free source identities distinguish separate row-level
    PlusBText issues;
  - append-only `0020_reconciliation_release_fence.sql` rejects a promote event
    atomically when an active blocking reconciliation case exists;
  - catalog, child and duplicate decisions bind respectively to case version,
    family/source identity and the exact duplicate enrollment pair;
  - homogeneous multi-case mutation and successor/predecessor supersede are
    atomic, CAS-safe and idempotently reconciled after ambiguous commit;
  - list summary uses the same filters as rows.
- Focused synthetic verification passed 4 files / 41 tests. It includes the
  D1 promotion trigger, version-bound mapping, case-bound child correction,
  exact duplicate-pair proof, full batch rollback/replay, atomic supersede and
  parser source-identity evidence.
- The first full regression correctly exposed five legacy fixtures whose old
  promotion assumptions conflicted with the new D1 fence. Irrelevant fixtures
  were made clean; collision and continuity tests now assert promotion denial
  and unchanged canonical state. Final required worktree chain passed:
  `npm run check` 0/0, `npm test` 65 files/491 tests, `npm run test:e2e` 18/18,
  build, docs 151 links/52 files + 105 commands, release scan 533/533 and
  `git diff --check`.
- HEAD remains `eb35a8c`; the remediation worktree is intentionally dirty and
  uncommitted. No amend/push/tag, remote migration/import/deploy, config/secret
  mutation, provider call/send, production or official-site action occurred.

## Continuation 2026-08-18: remediation commit post-commit gate

- The user created immutable commit
  `4c1c78d4aa7e4eceeb0facdc79feedce38b8a7f0` (`fix: harden legacy
  reconciliation release gate`). HEAD and a clean worktree were confirmed
  before the fresh post-commit chain.
- `npm run check` passed with 0 errors/warnings. The first exact-SHA
  `npm test` run passed 490/491 tests but exceeded the global 15-second limit
  in the two-period D1 continuity-conflict scenario. An isolated rerun
  reproduced the timeout and completed in about 25.2 seconds, so exact
  `4c1c78d` did not pass the required post-commit gate.
- The current worktree changes only that test's individual timeout from the
  global 15 seconds to 45 seconds; no runtime or migration behavior changed.
  On this dirty candidate the isolated scenario passed in about 25.2 seconds
  and the full required chain passed: `npm run check` 0/0, `npm test` 65
  files/491 tests, `npm run test:e2e` 18/18, build, docs 151 links/52 files +
  105 commands, release scan 533/533 and `git diff --check`.
- A new immutable commit and fresh exact-SHA verification are required before
  requesting a separately authorized independent review. Overall deployment
  remains NO-GO. No remote migration/import/deploy, config/secret mutation,
  provider call/send, production or official-site action occurred.

## Continuation 2026-08-18: exact `f7e75f9` verification

- The user created immutable commit
  `f7e75f9b6281c44b3152c65061ab974e87153f09` (`fix of post-commit gate
  fehler`). HEAD, a clean worktree and absence of the ignored E2E runtime env
  were confirmed before verification.
- The fresh required post-commit chain passed on exact `f7e75f9`: `npm run
  check` 0 errors/warnings; `npm test` 65 files/491 tests in 329.19 seconds;
  `npm run test:e2e` 18/18; production build; docs 151 links/52 files + 105
  commands; release scan 533/533; and `git diff --check`. HEAD remained exact
  and the worktree remained clean through the immutable check.
- The next local gate is a separately authorized independent read-only review
  of exact `f7e75f9`. It is not authorized by the commit or this verification.
  Overall deployment remains NO-GO; no remote migration/import/deploy,
  config/secret mutation, provider call/send, production or official-site
  action occurred.

## Continuation 2026-08-18: exact `f7e75f9` review and local remediation

- The separately authorized independent read-only review of exact
  `f7e75f9b6281c44b3152c65061ab974e87153f09` returned NO-GO: 3 BLOCKER,
  5 HIGH and 2 MEDIUM findings. It found exact-candidate/current-pair and old-run
  replay gate gaps, incomplete Access/PlusBText classification, terminal
  recurrence loss, source-group projection drift, non-atomic/mutable typed
  evidence, sibling child mismatch, non-exact duplicate effects and paginated
  export. The review changed no files and made no remote calls.
- The current uncommitted worktree remediates those findings. Append-only
  migration `0021_reconciliation_exact_candidate_evidence.sql` adds exact
  promotion/current-registration fences, immutable snapshot/evidence bindings,
  live typed-evidence views and an assertion-time atomic guard. Import/admin,
  family, cabinet/pricing, parsers and export now enforce strict later-run
  closure, recurrence, mapping reset, exact family/source/pair semantics,
  downstream same-service consolidation and full filtered PII-free export.
- The local worktree chain passed: `npm run check` 0 errors/warnings; `npm test`
  66 files/509 tests in 344.85 seconds; Chromium 18/18; production build;
  `npm audit --omit=dev` 0 vulnerabilities; docs 151 links/52 files plus 105
  commands; release scan 535/535. A first full Vitest run exposed invalid old
  fixture ordering and a pricing test capped at migration `0020`; both test
  harness boundaries were corrected, targeted suites passed, and the complete
  rerun then passed.
- This worktree is not immutable evidence. The next local gate is a user-created
  commit, followed by fresh exact-SHA verification and a new independent
  read-only review. Overall deployment remains NO-GO. Remote D1/Worker/config,
  providers, production and the official site were not touched.

## Continuation 2026-08-18: remediation commit `b354e582`

- The user created immutable commit
  `b354e5829142e62ca0805adb7c3e9febc68145b6`
  (`fix: bind reconciliation to exact import evidence`). HEAD and a clean
  worktree were confirmed immediately after the commit.
- This commit contains append-only migration `0021`, all code/test remediation
  for the exact `f7e75f9` NO-GO findings, and the updated canonical/readiness
  documentation. It inherits no earlier exact-SHA verdict.
- Its direct parent worktree passed `npm run check`, 66 files/509 Vitest tests,
  Chromium 18/18, production build, production audit 0, docs 151 links/52 files
  plus 105 commands, release scan 535/535 and `git diff --check`. These are
  pre-commit results only.
- The next session must first account for the documentation-only handoff edits
  made after `b354e582`; they must be committed before any final exact-SHA gate.
  Then run fresh exact-SHA full verification. Only after it passes may a new
  independent read-only exact-SHA review be requested with separate explicit
  authorization. Overall deployment remains NO-GO; no remote/provider/
  production/official-site action occurred.

## Continuation 2026-08-18: exact `017c0d32` verification

- The user created documentation checkpoint
  `017c0d32e11f1dc61e32780b3bb472407cf856f9`
  (`docs: checkpoint stage 13 deployment handoff`). It is the immutable
  documentation descendant of runtime remediation commit `b354e582`.
- HEAD and a clean worktree were confirmed before the fresh chain. The exact
  SHA passed: `npm run check` 0 errors/warnings in 34.01 s; `npm test` 66 files/
  509 tests in 350.12 s; `npm run test:e2e` Chromium 18/18 in 183.15 s;
  production build in 25.23 s; `npm audit --omit=dev` 0 vulnerabilities in
  1.90 s; docs 151 links/52 files + 105 commands in 2.49 s; release scan
  535/535 in 3.67 s; final diff/status/HEAD check in 0.33 s. Total measured
  chain was 600.90 s.
- HEAD remained exact, final tracked status was clean and the ignored E2E
  runtime env was absent. No remote, provider, production or official-site
  action occurred.
- The next gate is a separately authorized independent read-only review of
  exact `017c0d32e11f1dc61e32780b3bb472407cf856f9`. Until a GO verdict, remote
  deployment remains prohibited and overall status remains NO-GO.

## Continuation 2026-08-18: exact `8c6e2a` review and `0022` remediation

- The user authorized an independent read-only review of exact
  `8c6e2aacc39e731ad59e8f1ca8d6fe3b5f312956`. The reviewer confirmed clean
  exact HEAD and a docs-only runtime-equivalent descendant of `b354e582`, but
  returned `NO-GO`: 2 BLOCKER and 2 HIGH.
- BLOCKER findings were the crash window between `validated` and completed
  reconciliation materialization, and the release record naming the parent SHA
  as current. HIGH findings were same-name sibling child evidence without exact
  `source_child_key`, and an already-created peer price-review item surviving a
  later `same_service_duplicate` decision.
- At that checkpoint, the mutable worktree added append-only migration `0022`, exact
  reconciliation materialization markers for promotion/registration, strict
  typed child evidence, and atomic downstream price-review supersession with
  rejection when a peer item is already applied. Runtime repositories and
  regression fixtures/tests use the new strict evidence surface.
- Targeted evidence passed: reconciliation D1 10/10, family/cabinet D1 9/9,
  legacy import D1 13/13, price reviews D1 6/6 and the focused applied/sent
  duplicate scenario 1/1. The first full Vitest exposed three regressions: an
  over-broad issue UPDATE fence, a legacy release trigger affecting non-legacy
  sources, and a pricing fixture that attempted a current missing-duration
  promote. The fence now preserves audited status resolution, the trigger is
  scoped to Access/PlusBText, and pricing models its fallback only as historical
  pre-IMPORT-08 state; focused admin-console 4/4 and pricing 1/1 passed.
- The corrected full local worktree chain passed: final `npm run check` 0/0 in
  34.09 s; Vitest 66 files/511 tests in 356.10 s; Chromium 18/18 in 182.39 s;
  production build in 22.56 s; production audit 0 in 1.76 s; docs/scan/diff
  passed. This remains mutable worktree evidence, not immutable release evidence.
- No remote D1/Worker/config mutation, provider call/send, production deploy or
  official-site action occurred. The next gate is a user-created commit,
  followed by fresh exact-SHA verification and a
  separately authorized independent re-review; no parent SHA is called the
  current candidate.

## Continuation 2026-08-19: exact runtime anchor `abb93f25`

- The user created immutable runtime remediation commit
  `abb93f25a7d9ce80bdef6f204e75cabf635f9453`
  (`fix: close reconciliation completion and downstream fences`). Clean exact
  HEAD, expected 26-file scope and absence of `.dev.vars.e2e` were confirmed.
- The exact SHA passed: check 0/0 in 45.12 s; Vitest 66 files/511 tests in
  361.42 s; Chromium 18/18 in 189.57 s; production build in 19.34 s;
  production audit 0 in 1.83 s; docs 151 links/52 files plus 105 commands in
  2.31 s; release scan 536/536 in 3.54 s; diff and final exact HEAD/status checks
  passed. HEAD remained exact and the worktree remained clean.
- No remote D1/Worker/config mutation, provider call/send, production deploy or
  official-site action occurred. To avoid repeating the prior release-SHA
  ambiguity, the final review target is defined as SELF: the documentation-only
  commit containing this record. It must be a runtime-empty descendant of
  `abb93f25`, pass exact short gates, and receive separately authorized review.

## Continuation 2026-08-19: immutable review seal `b2e8548f`

- The user created exact documentation-only commit
  `b2e8548f63ae62e33d519d61e0ac729085801052`
  (`docs: seal abb93f25 stage 13 verification`) with direct parent
  `abb93f25a7d9ce80bdef6f204e75cabf635f9453`. Its diff changes exactly the six
  canonical Stage-13/readiness documents recorded in the commit; `src`,
  `migrations` and `tests` have an empty diff.
- Clean exact HEAD and worktree were confirmed. Exact short gates passed: docs
  151 links/52 files plus 105 commands in 2.31 s; release scan 536/536 in
  3.37 s; `git diff --check` in 0.08 s; final HEAD/status, runtime-empty diff,
  SELF-record count and absence of `.dev.vars.e2e` passed.
- These short gates supplement, rather than repeat, the full exact runtime chain
  already recorded for `abb93f25`. No remote/provider/production/official-site
  action occurred.
- A new session must continue with
  `docs/prompts/stage-13-continue-deployment-after-b2e8548f.md`. Its first
  decision gate is separate user authorization for an independent read-only
  re-review of exact `b2e8548f`; at this checkpoint that review had not yet been
  performed. The following continuation records its NO-GO result. Remote
  deployment remains prohibited until GO and separately scoped remote approvals.

## Continuation 2026-08-19: exact `b2e8548f` review NO-GO and remediation

- The user separately authorized one independent read-only review of exact
  `b2e8548f63ae62e33d519d61e0ac729085801052`. The reviewer touched no files and
  performed no remote action. Verdict: `NO-GO`, 1 BLOCKER and 1 MEDIUM.
- BLOCKER: contradictory release provenance still called historical
  `a590d1f08110c20b6f7b45294cb91a7be7b5a8e3` the current candidate and two
  runbooks described immutable `abb93f25`/`0022` as mutable/uncommitted. This
  could direct an operator to the wrong SHA.
- MEDIUM: the exact duplicate reconciliation D1 test covered only a `sent`
  mutable price-review peer and did not exercise `accepted_by_parent`,
  `scheduled`, or stale dispatch/final-confirm/apply attempts after supersede.
- At this checkpoint, local remediation consistently treated `a590d1f` as historical,
  `abb93f25` as the immutable runtime anchor and `b2e8548f` as rejected. It adds
  data-driven atomic supersession for all three mutable statuses and proves the
  stale downstream actions fail closed without new outbox/apply evidence.
  Focused `tests/integration/legacy-reconciliation-d1.test.ts` passes 10/10;
  proportional worktree gates also pass: check 0/0, docs 151 links/52 files plus
  105 commands, release scan 536/536 and diff check.
- At this checkpoint remediation changed documentation and tests only; `src`
  and `migrations` remained unchanged. It was mutable and had no exact candidate
  SHA. The following continuation records its immutable anchor and verification.

## Continuation 2026-08-19: exact remediation anchor `4ac6a491`

- The user created exact commit
  `4ac6a491f2dc9a40608a4fdd77101fb4eb8853b9`
  (`test: close b2e8548f reconciliation review findings`) with direct parent
  `b2e8548f63ae62e33d519d61e0ac729085801052`. Clean HEAD/worktree and exact
  ancestry were confirmed. Its nine-file diff changes eight canonical docs and
  `tests/integration/legacy-reconciliation-d1.test.ts`; `src` and `migrations`
  have an empty diff.
- Exact proportional gates passed: focused reconciliation D1 10/10 in 90.86 s;
  check 0/0 in 37 s; docs 151 links/52 files plus 105 commands in 3.2 s;
  main-worktree release scan 536/536 in 4.4 s including existing build output;
  diff/final HEAD/status, empty `src`/`migrations` diff and `.dev.vars.e2e`
  absence passed. A later isolated clean detached recurrence independently
  passed focused D1 10/10, check 0/0, docs 151/52 plus 105 commands, release
  scan 406/406 tracked files, diff/final HEAD/status and runtime-env absence.
- This commit is the immutable docs/test remediation anchor, not the final
  review seal. To prevent another self-referential provenance ambiguity, final
  review target is defined as SELF of the next direct documentation-only commit
  containing this record. That seal must have direct parent `4ac6a491`, an empty
  `src`/`migrations`/`tests` diff, and pass exact short gates before separately
  authorized independent review.
- No remote/provider/production/official-site action occurred; overall status
  remains NO-GO.

## Continuation 2026-08-19: final review seal `2bedc73c`

- The user created exact docs-only commit
  `2bedc73c9b39a4cb43296046986a3f48e039b022`
  (`docs: seal 4ac6a491 review remediation`) with direct parent
  `4ac6a491f2dc9a40608a4fdd77101fb4eb8853b9`. Clean exact HEAD/worktree and
  ancestry were confirmed.
- The exact diff changes only the eight canonical Stage-13/readiness documents;
  `src`, `migrations` and `tests` have an empty diff. The SELF record therefore
  resolves unambiguously to `2bedc73c`; historical `a590d1f`, runtime anchor
  `abb93f25`, rejected seal `b2e8548f` and remediation anchor `4ac6a491` are not
  the final review target.
- Exact short gates passed: docs 151 links/52 files plus 105 commands, release
  scan 536/536, commit diff check, final HEAD/status and `.dev.vars.e2e`
  absence. Full/focused runtime gates were not repeated because the diff from
  `4ac6a491` is empty for `src`/`migrations`/`tests`.
- Independent review has deliberately not been started. The next session must
  use `docs/prompts/stage-13-continue-deployment-after-2bedc73c.md`, establish
  provenance and request separate user authorization for exactly one read-only
  independent review of `2bedc73c` with no remote/provider/production access.
- No remote D1/Worker/R2/config mutation, provider call/send, production deploy,
  DNS/CMS or official-site action occurred. Overall status remains NO-GO until
  independent GO and all separately scoped external gates.

## Continuation 2026-08-19: independent review exact `2bedc73c`

- Пользователь отдельно разрешил ровно один independent read-only review exact
  `2bedc73c9b39a4cb43296046986a3f48e039b022`. Перед запуском provenance
  подтвердил clean worktree, later docs-only handoff HEAD `82ca91e`, direct
  parent `4ac6a491`, ровно восемь docs-файлов в seal diff и пустые
  `src`/`migrations`/`tests` diffs до seal и от seal до current HEAD.
- Reviewer читал только local Git objects: exact lineage, canonical docs,
  runtime, migrations и tests. Он не запускал tests/build/formatters, не менял
  файлы/worktree и не обращался к network, remote, provider, Cloudflare,
  production или official site.
- Verdict: GO для local exact-SHA gate, без BLOCKER/HIGH. Подтверждены exact
  completion/crash marker, promotion/registration fail-closed, strict
  `source_child_key`, atomic mutable-peer supersession/applied-peer block,
  generic issue resolution, Access/PlusBText trigger scope, historical pricing
  fallback boundary и полный filtered PII-free export.
- Один MEDIUM test-evidence gap не меняет GO: stale dispatch/final-confirm/apply
  fixtures уже не eligible по другим guards, поэтому regression не изолирует
  duplicate-specific причину отказа. Reviewer не нашёл runtime bypass; текущие
  status predicates, strict target assertion и atomic assertions fail closed.
  Будущее исправление должно провести fixtures через реальный eligible lifecycle
  и проверить нулевые deltas acceptance, assignments, outboxes и apply events;
  это будет новый test diff/candidate и потребует нового separately authorized
  review.
- Local review GO не разрешает Cloudflare inventory, backup/restore, migrations,
  deploy, bootstrap, flags/secrets, provider send, import, production, DNS/CMS
  или official-site action. Все соответствующие gates остаются `blocked` либо
  `feature_disabled`; общий production verdict остаётся NO-GO.

## Continuation 2026-08-19: protected preview Access perimeter

- Пользователь отдельно разрешил настроить Cloudflare Access для последующих
  agent и manual проверок exact preview target. До mutation API token был
  проверен без вывода значения и показал, что Access в account ещё не enabled.
- Создана Zero Trust organization `Kolibri Registration Preview` с 24-hour
  default session, `deny_unmatched_requests=false` и без WARP authentication.
  Поэтому другие account resources не получили глобальную Access-блокировку.
- Добавлен One-time PIN identity provider. Exact preview `workers.dev` hostname
  защищён одной self-hosted Access application через exact public destination;
  остальные Workers, preview deployments, zones, production и official site в
  destination не входят.
- Manual policy имеет `allow`, ровно два утверждённых email principals,
  обязательный OTP login method и после owner smoke изменённую session duration
  `168h`. Адреса не записаны в tracked evidence.
  Automation policy имеет `non_identity` и ровно один exact service token.
  `Bypass` policies отсутствуют.
- Service token действует 720 hours, истекает `2026-09-18T15:55:23Z`; одноразовые
  client credentials сразу сохранены DPAPI-encrypted вне repository и не
  выводились в transcript. Temporary Cloudflare API token также хранится только
  encrypted вне repository и должен быть отозван owner через dashboard после
  завершения этой настройки.
- Post-mutation API inventory подтвердил one app, one OTP IdP, ровно две exact
  policies, manual policy session `168h`, exact destination и ноль Bypass.
  External probes:
  anonymous `302` в Access; login page `200` и содержит email form; valid service
  token получает Worker `200`; invalid service token не достигает Worker.
- Owner подтвердил успешный client/admin OTP login 2026-08-19. Первоначально
  выданные browser tokens сохраняют прежний expiry; новый 168-hour срок выдаётся
  при следующем login. Duration mutation не меняла principals, OTP requirement,
  Service Auth или Bypass count. Access mutation не меняла Worker version, D1,
  R2, portal flags/secrets, provider delivery, production, DNS/CMS или official
  site. Все portal functions остаются в прежнем fail-closed состоянии; общий
  production verdict остаётся NO-GO.

## Continuation 2026-08-19: protected exact-target control config

- Owner явно подтвердил revoke временного Cloudflare API token. После проверки
  exact parent path удалён только
  `%LOCALAPPDATA%\Kolibri\CodexSecrets\cloudflare-access-token.dpapi`; локальная
  копия невосстановима. DPAPI-файл Access service token сохранён до завершения
  agent testing.
- Канонический guard прочитан из `scripts/remote-d1-target.ts`: preview требует
  exact `APP_ENV=preview`, 32-hex `account_id`, ровно один `DB` binding, отдельный
  `preview_database_id`, совпадение explicit CLI UUID и запрет неоднозначного
  selector/shared preview-production identity. Guard не ослаблялся.
- Создан отдельный `imports/legacy-preview-control.json`. Существующее правило
  `imports/*.json` исключает его из Git, а Windows ACL отключает inheritance и
  оставляет единственное explicit FullControl rule текущего пользователя. Файл
  не содержит token/secret values и фиксирует exact preview environment/origin,
  account/D1 binding и candidate/review Git provenance. Эти auxiliary provenance
  vars не заменяют canonical clean exact-HEAD/plan guard remote runner.
- Сверка только с уже имевшимся local inventory подтвердила exact account,
  preview Worker, D1, оба private EU R2 bucket и portal origin; в evidence
  сохранены только suffixes account `…8fc0` и D1 `…608b`. Local-only
  `unstable_readConfig` плюс `assertRemoteD1ConfigTarget` прошли, candidate HEAD
  и reviewed ancestor совпали. Network/API/remote D1 для этой проверки не
  использовались.
- Plan artifact ещё не существует, поэтому plan-bound
  `import:legacy:confirmation:remote` не запускался: его подготовка потребовала
  бы отдельного remote-plan/read permission. Independent read-only review control
  binding также не запускался без отдельного разрешения пользователя.
- Не выполнялись Cloudflare/Worker/D1/R2 mutations, migration, deploy, import,
  secret/flag change, email/Telegram send, production/DNS/CMS или official-site
  action. Все portal feature flags остаются disabled/fail-closed; общий verdict
  остаётся **NO-GO**. Ближайший отдельный gate — только independent read-only
  review protected control binding.

## Continuation 2026-08-20: independent review protected control binding

- Пользователь отдельно разрешил ровно один independent read-only review только
  `imports/legacy-preview-control.json`, без network и любых remote изменений.
  Reviewer не изменял files, ACL или Git state, не читал DPAPI credentials и не
  запускал Cloudflare API, Wrangler remote, D1/R2 operations, formatter, build
  или tests.
- Независимо подтверждены HEAD `82ca91e3`, ancestry exact review target
  `2bedc73c`, ожидаемый трёхдокументный worktree diff и отсутствие
  `src`/`migrations`/`tests` diff. Control file остался regular/Git-ignored,
  current-user-only ACL и exact SHA-256
  `321e9cae0be7092f104d3435c47632344a3a89d033c2883ba5b6dfe4ba93d5f0`.
- Local Wrangler parser принял config. Exact APP_ENV/origin/account/one-DB/
  preview-D1 binding совпал с independent local inventory; в отчёте раскрыты
  только account suffix `…8fc0` и D1 suffix `…608b`. Secret-like values не
  найдены.
- Канонический guard принял исходный binding и fail-closed отклонил in-memory
  wrong-environment, wrong-explicit-UUID, shared-identity, UUID-as-name,
  multiple/wrong-binding и missing-account варианты ожидаемыми typed errors.
- Verdict: **GO только для protected control-binding sub-gate**, без
  BLOCKER/HIGH/MEDIUM. Два LOW residual не меняют GO: auxiliary origin/candidate/
  review vars правдивы, но runner enforce provenance через `plan.gitCommitSha`,
  clean worktree и exact HEAD; при изменении HEAD auxiliary SHA нужно сверять
  заново. Текущий minimal config также fail-closed для ordinary deploy из-за
  отсутствующих deploy `database_id`, `name`, `main`, compatibility date и R2
  bindings; это свойство нельзя молча потерять при расширении файла.
- Parent PR-B13 остаётся `blocked` только из-за отсутствующих plan-bound и remote
  transaction evidence; control-binding review не отменяет exact candidate GO и
  не является новым preview deploy blocker. Никаких remote mutations не было.
  Ближайший отдельный gate — backup/Time Travel point плюс independently
  verifiable isolated D1/R2 restore exact preview resources.

## Continuation 2026-08-20: isolated preview recovery rehearsal

- Пользователь отдельно разрешил только следующий gate: backup/Time Travel
  point плюс independently verifiable isolated D1/R2 restore exact preview
  resources. Перед mutation повторно подтверждены account suffix `…8fc0`, source
  D1 suffix `…608b`, EU jurisdiction, deployed migrations `0001`–`0015` и две
  distinct private EU source R2 buckets. Candidate migrations `0016`–`0022`
  остались unapplied.
- Получен current D1 Time Travel bookmark и сразу создан protected SQL export во
  внешнем current-user-only directory. Plaintext имел 18,510,591 bytes и SHA-256
  `2c3cc90ffb455dc04a7c99bf2d30ead0d578454755d9fedbfc7e8e3129dd6c92`.
  После restore он DPAPI CurrentUser-encrypted, round-trip hash совпал, encrypted
  artifact имеет 18,510,806 bytes и SHA-256
  `9401a7bb980f21804a590aac2e523b961edc35c4fd3d29273ab6fc924aea2981`;
  plaintext и scratch artifacts удалены. RPO/cadence/retention этим не объявлены.
- Созданы только отдельные recovery resources: одна unbound EU D1 (suffix
  `…250c`) и две private EU R2 buckets с restore suffix `e80850`. Protected
  ignored restore config выключает все features/providers и не содержит deploy
  `name`/`main`; source Worker/D1/R2, Access, secrets/flags, providers,
  production, DNS/CMS и official site не менялись.
- D1 export импортирован только в restore D1. Exact PII-free reconciliation
  совпало: 398 schema objects, 124 tables, 32,146 aggregate rows, schema SHA-256
  `f7588e4a5fa06b86662f1b11499637ad9b47bc339aec5786b4729205b41c9b01`,
  per-table-count SHA-256
  `7413e1c9792643ed086b12a259e753ba3fc96155452cc2e212420acf92cd25df`,
  15 migrations/max ID 15 и 0 FK violations. Local SQLite `quick_check=ok`;
  remote `quick_check` вернул safe `SQLITE_NOMEM`, поэтому зафиксирован
  independently reproducible fallback: exact remote schema/per-table counts и
  remote FK check.
- Source archive/quarantine на recovery point и обе distinct restore buckets
  имеют по `0 objects / 0 B`, location EEUR; restore buckets не привязаны к
  Worker. Это полный restore текущего empty state, но не механизм будущего
  non-empty backup: PR-H05 остаётся `blocked`.
- PII-free exact-ID/bookmark evidence сохранён только в ignored/current-user-only
  `imports/preview-recovery-evidence-e80850.json`; encrypted backup находится вне
  repository. Rehearsal занял 901 s, recovery-point delta — 133 s; RTO и RPO не
  заявлены. Restore resources оставлены изолированными для независимой проверки;
  rollback этого gate — удалить только exact restore D1/R2 из protected manifest
  после отдельного cleanup decision, без воздействия на source.
- Gate result: **GO для one-off preview D1/current-empty-R2 recovery rehearsal**.
  Это не меняет общий production **NO-GO**: RPO/RTO/cadence/retention, reusable
  non-empty R2 mechanism, application smoke и production approvals остаются.
  Ближайший отдельный gate — только remote preview migrations `0016`–`0022`;
  migration permission не подразумевает Worker deploy или любой последующий gate.

## Continuation 2026-08-20: remote preview migrations `0016`–`0022`

- Пользователь отдельно разрешил только source preview D1 apply `0016`–`0022`.
  Перед mutation exact target повторно совпал с protected control/recovery
  evidence: account suffix `…8fc0`, D1 suffix `…608b`, jurisdiction EU. Reviewed
  migration files не отличались от exact `2bedc73c`; worktree имел только
  ожидаемый docs diff, `src`/`migrations`/`tests` diff был пуст.
- Preflight показал ровно семь pending files от
  `0016_legacy_import_release_control.sql` до
  `0022_reconciliation_completion_downstream_fence.sql`, ledger 15/max ID 15 и
  нулевые academic-period/user/import/legacy-promotion/Telegram/outbox counts.
  Fresh pre-apply Time Travel bookmark зафиксирован; DPAPI backup и уже
  проверенный isolated `0001`–`0015` restore повторно прошли hash/integrity guard.
- Единственная mutation-команда `wrangler d1 migrations apply DB --remote` для
  exact preview config завершилась exit code 0. Все семь migrations получили
  success; повторный remote list вернул `No migrations to apply`.
- Post-apply PII-free checks: exact ledger 22/22/max ID 22; 523 schema objects,
  143 tables; все 130 создаваемых/заменяемых candidate objects присутствуют;
  18 новых tables пусты; девять обязательных altered columns и Telegram
  `delivery_unknown` constraint присутствуют; FK violations 0. Academic period,
  users, import runs, legacy versions/promotion events, Telegram outbox и admin
  outbox actions остались 0. Fresh post-apply Time Travel bookmark сохранён.
- Protected exact evidence находится только в ignored/current-user-only
  `imports/preview-migration-evidence-0016-0022-20260820.json`, SHA-256
  `875bb64f7dd3f555c1334e19b7a22866018d72f2a1166c2e41c70add84948bfd`.
  Он содержит exact resource IDs/bookmarks локально и не содержит PII/secrets.
- Source Worker deployment/version и обе source R2 buckets не изменились; R2
  остались private EU и `0 objects / 0 B`. Access, flags/secrets, bootstrap,
  import lifecycle, email/Telegram, production, DNS/CMS и official site не
  менялись. Новый authenticated Worker smoke не заявляется; он входит в
  отдельный exact Worker deploy/post-deploy gate.
- Applied migrations `0001`–`0022` нельзя редактировать или откатывать down
  migration. Recovery paths: совместимое code behavior, новая append-only
  forward-fix migration либо отдельно разрешённый restore к сохранённому
  pre-apply point.
- Gate result: **GO для remote preview migration apply `0016`–`0022`**. Overall
  production status остаётся **NO-GO**. Ближайший отдельный gate — только exact
  preview Worker deploy; он не включает bootstrap, flags/secrets, import,
  provider send или production/site actions.

## Continuation 2026-08-20: подготовка новой сессии для exact Worker deploy

- Следующий remote gate целесообразно выполнять в новой сессии: migration gate
  завершён GO и имеет собственный protected evidence, а Worker deploy создаёт
  новую version/deployment на 100% traffic и требует отдельного preflight,
  post-deploy smoke и rollback decision.
- Создан новый ignored operational accelerator
  `docs/prompts/stage-13-continue-exact-preview-worker-deploy.md`. Он не является
  permission и требует либо отдельного явного разрешения на exact gate, либо
  остановки после local provenance/read-only preparation.
- Текущий local preflight: HEAD `82ca91e3`; diff от final reviewed
  `2bedc73c` и worktree diff пусты для `src`/`migrations`/`tests`; local Wrangler
  `4.120.1`; ignored `wrangler.preview.toml` SHA-256 остаётся
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9` и
  содержит deploy `name`/`main`, exact DB, два EU R2 bindings, два Cron и прежний
  fail-closed vars set. Remote inventory/deploy в этой preparation не запускались.
- Access agent credential file существует, shape/expiry проверены локально без
  вывода credentials и network request. Его envelope — PowerShell
  `ConvertFrom-SecureString` с CurrentUser DPAPI; читать его нужно через
  `ConvertTo-SecureString`, а не через raw base64/`ProtectedData.Unprotect`.
  Client ID/secret присутствуют, expiry остаётся `2026-09-18T15:55:23Z`.
- Canonical deployment runbook теперь фиксирует exact current sequence: fresh
  build, strict dry-run, отдельное разрешение на единственный deploy, protected
  capture previous/new Worker IDs, Access-protected root/health и D1/R2/cron/
  fail-closed invariants. Неожиданный remote config drift — stop; `--keep-vars`
  автоматически не применяется.
- Rollback этого gate меняет только deployment обратно на exact captured
  compatible previous Worker version. Applied migrations `0001`–`0022` не
  откатываются down, D1/R2 не удаляются. Если rollback не pre-authorized новым
  поручением, agent сначала делает containment/read-only diagnosis и запрашивает
  отдельное разрешение.
- При подготовке prompt не выполнялись network/API/remote D1/R2/Worker/Access
  actions, build/deploy, secret/flag mutation, bootstrap, import, provider send,
  production, DNS/CMS или official-site changes. Ближайший gate остаётся ровно
  один: exact protected preview Worker deploy плюс его read-only post-check.

## Continuation 2026-08-20: exact Worker deploy, Access stop и rollback

- Пользователь разрешил ровно один remote read-only preflight, один exact
  Worker deploy на 100%, предусмотренные read-only post-checks и exact rollback
  только на captured previous compatible version при stop condition. Migrations,
  D1/R2 writes, Access/flags/secrets, bootstrap/import, provider sends,
  production, DNS/CMS и официальный сайт оставались вне scope.
- Local provenance остался точным: HEAD `82ca91e3`, reviewed ancestor
  `2bedc73c`, пустой committed/worktree diff для `src`/`migrations`/`tests`,
  preview config SHA-256
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`.
  Fresh `npm run build` и exact `wrangler deploy --dry-run --strict` прошли.
- Remote preflight подтвердил account suffix `…8fc0`, historical active version
  `…4154` на 100%, exact materialized vars/bindings/assets/browser/handlers,
  expected three secret names, два Cron, observability, отсутствие routes/custom
  domains, D1 suffix `…608b` с ledger 22/max 22/pending 0/FK 0/empty business
  state, две private EU R2 `0 objects / 0 B` и canonical Access boundary.
- Protected deploy evidence создан только как ignored/current-user-only
  `imports/preview-worker-deploy-evidence-20260820.json`. Полные previous/new
  deployment/version IDs и rollback target находятся только там; credentials,
  headers, cookies, PII и response bodies отсутствуют.
- Единственная exact команда `wrangler deploy --strict` завершилась exit 0,
  создала candidate version suffix `…1500` и перевела её на 100%. Read-only
  reconciliation показал ровно одну новую version/deployment, previous inactive
  и доступную для rollback; remote version/config, two Cron, observability,
  canonical root/assets/health, disabled registration, D1 и R2 совпали.
- Дополнительная обязательная boundary-проверка автоматически созданной
  versioned Preview URL обнаружила anonymous `200`, тогда как canonical hostname
  продолжал отдавать Access `302`. Это stop condition
  `ACCESS_BYPASS_VERSION_PREVIEW`; exact URL, prefix и full ID наружу не
  выводились.
- Заранее разрешённый rollback выполнен ровно на captured previous compatible
  version `…4154` и завершился exit 0. Она снова единственная active на 100%; new
  `…1500` inactive, но retained. Canonical anonymous `302`, valid root `200`,
  health `204`/empty/`no-store`/`noindex`, D1 pending 0 / ledger 22 / FK 0 /
  empty business state повторно прошли.
- Остаточный blocker: rollback не удаляет version и versioned Preview URL
  candidate продолжает отвечать anonymous `200`. Не повторять deploy и не
  начинать bootstrap/import. Следующий отдельный gate — только owner-authorized
  защита Worker previews через Access либо явное отключение `preview_urls` с
  соответствующей config/deploy procedure, затем новый exact deploy/recheck.
- В начале сессии DPAPI envelope был ошибочно прочитан как raw blob, и
  расшифрованный service-token payload попал в локальный execution transcript.
  Owner явно принял этот риск и поручил продолжить без Access/token rotation;
  credential не записан в repository/evidence, но его плановая отдельная
  ротация остаётся рекомендуемым operator action.
- Общий production verdict остаётся **NO-GO**. Production, official site и все
  provider/feature paths не изменялись.

## Continuation 2026-08-21: Preview URLs disabled и candidate redeploy

- Пользователь отдельно поручил первый необходимый gate после Access stop:
  отключить versioned Preview URLs и повторно развернуть exact candidate.
  Разрешение не расширялось на migrations, D1/R2 data writes, Access app/
  policies, runtime vars/secrets, bootstrap/import, provider calls/sends,
  production, DNS/CMS или официальный сайт.
- Перед изменением exact provenance совпал: HEAD `82ca91e3`, independent review
  seal `2bedc73c` является ancestor, committed и worktree diff для
  `src`/`migrations`/`tests` пуст. Historical ignored preview config SHA-256
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`.
- В ignored `wrangler.preview.toml` добавлена единственная строка
  `preview_urls = false`; новый SHA-256
  `b6fffb07d4c1e6654c657b2adb9a2e16acf4ed73b72cbead7465fe0908d08959`.
  Wrangler `4.120.1` schema и current Cloudflare docs подтверждают этот boolean;
  fresh `npm run build` и exact `deploy --dry-run --strict` прошли.
- Remote preflight подтвердил OAuth exact account suffix `…8fc0`, active
  compatible `…4154`/100%, retained candidate `…1500`, exact 57 vars/eight
  fail-closed values/three secret names/DB/two R2/assets/browser/fetch+scheduled,
  D1 ledger 22/max 22/pending 0/FK 0/empty business state, две private EU R2
  `0 objects / 0 B` без custom domain/r2.dev и canonical Access
  anonymous/invalid `302`, login page, valid root `200`, health `204`/empty/
  `no-store`/`noindex`. Retained versioned Preview URL до mutation оставалась
  anonymous `200`.
- Protected ignored/current-user-only evidence создано как
  `imports/preview-worker-deploy-evidence-20260821.json`, ACL inherited from the
  protected prior deploy evidence and remains protected. Exact target, previous/
  new deployment/version IDs и rollback target находятся только там; credential,
  cookie, header, PII и response body отсутствуют.
- Ровно один authorized `wrangler deploy --strict` завершился exit 0, создал
  version `…76ee`, перевёл её на 100% и сохранил оба Cron `* * * * *` и
  `*/15 * * * *`. Inventory показывает ровно одну новую version/deployment;
  `…4154` и `…1500` inactive и доступны как historical versions.
- New remote version сохраняет exact vars/fail-closed values/three secret names,
  D1/two EU R2/assets/browser bindings, fetch+scheduled handlers и compatibility.
  Canonical Access сохранил anonymous/invalid `302`, login page, valid root
  `200`, one referenced asset `200`, health `204`/empty/`no-store`/`noindex`.
  `/auth/register` остаётся `200` с service-unavailable text, disabled submit и
  без Turnstile lifecycle; POST/provider calls отсутствовали.
- Versioned routes retained `…1500` и new `…76ee` после deploy обе возвращают
  anonymous `404`, поэтому `ACCESS_BYPASS_VERSION_PREVIEW` закрыт. Cloudflare
  version view всё ещё сообщает `metadata.has_preview=true`; current docs и
  observed routing показывают, что это metadata не является признаком активной
  Preview URL routing. Explicit config плюс обе anonymous `404` являются
  recorded gate evidence.
- Post-deploy D1 повторно имеет ledger 22/max 22/pending 0/FK 0 и нулевые
  academic-period/user/import/legacy-promotion/Telegram/outbox/admin-action
  counts. Обе source R2 остаются private EU `0 objects / 0 B`, без custom domain
  и с disabled `r2.dev`. Stop condition не возник, captured `…4154` не
  использовалась для rollback.
- Final local gates: `npm run check` — 0 errors/warnings; `npm test` — 66 files,
  511/511 tests; fresh `npm run build`; `npm run docs:check` — 151 links in 52
  files и 106 executable command lines; `npm run release:scan` — 536/536;
  `git diff --check` passed. Final remote reconciliation сохранила `…76ee` на
  100%, canonical anonymous `302` и обе versioned routes `404`.
- Exact preview deploy/post-deploy gate теперь **GO**. Production verdict
  остаётся **NO-GO**. Следующий отдельный gate — clean-room preview admin
  bootstrap/recovery; в этом continuation он не начинался.

## Continuation 2026-08-24: preview admin bootstrap read-only preflight

- Пользователь поручил следующий gate — clean-room preview admin bootstrap/
  recovery. До mutation выполнен только exact-target read-only preflight;
  migrations, import, provider send, feature/secret/Access mutation, production,
  DNS/CMS и официальный сайт не затрагивались.
- Wrangler `4.120.1` и штатный config parser подтвердили `APP_ENV=preview`, один
  binding `DB` и exact dedicated preview D1. Remote read-only state: migrations
  `22`, FK violations `0`, bootstrap control `available`, users/admins/active
  sessions/bootstrap actions/assertions/audit — все `0`.
- Сработали две предусмотренные stop conditions до любой записи. Во-первых,
  eligible verified active parent отсутствует: D1 полностью пуста, а отдельного
  supported synthetic-account provisioning command в repository/runbook нет;
  public auth и email provider остаются disabled. Direct SQL для создания
  bootstrap target запрещён runbook.
- Во-вторых, materialized dedicated preview config хранит exact target в
  `database_id`, тогда как reviewed bootstrap CLI для environment `preview`
  требует `preview_database_id`. Поэтому текущая exact bootstrap command
  fail-closed с `CLI_DATABASE_TARGET_MISMATCH`; подмена отсутствующего
  production UUID или ослабление guard без отдельной реализации/review
  недопустимы.
- Bootstrap, role/session mutation, replay probe и zero-admin recovery drill не
  запускались. Control остаётся `available`, remote counts не изменились.
  PR-E01–PR-E05 остаются `blocked`.
- Следующий prerequisite требует привести bootstrap config contract к
  фактической dedicated-preview topology и закрыть current-snapshot dependency.
  Обычный preview auth/email registration нельзя считать target-creation path до
  current promoted snapshot; точный безопасный порядок зафиксирован ниже.

## Continuation 2026-08-24: multi-session deployment handoff prepared

- Documentation-only handoff зафиксирован в `2026-08-24T09:31:16Z`; remote state
  в этой continuation не менялся.
- Владелец уточнил постоянную цель следующих сессий: это не отдельный bootstrap
  или deploy task, а последовательный Stage 13 deployment process до полностью
  функционального production-состояния портала. Human gates должны сопровождаться
  простым объяснением, точной пошаговой инструкцией и перечнем credentials,
  которые владелец не передаёт агенту.
- Владелец утвердил роли двух mailbox: корпоративный mailbox используется как
  login первого администратора и отдельно как approved sender identity; второй
  owner-controlled mailbox — как обычный test parent. Роль portal user и sender
  configuration независимы. Exact личный адрес не записан в tracked evidence и
  передан только в ignored continuation prompt. Пароли, OTP и verification links
  не запрашиваются и не сохраняются.
- Runtime review исправил прежнее неполное предположение о порядке шагов.
  `LegacyFamilyVerificationExtension` требует ровно один current promoted legacy
  snapshot, а email verification и family finalization выполняются одним D1
  batch. На текущей empty preview D1 обычная registration verification поэтому
  fail-closed и не создаёт eligible target для bootstrap.
- Правильная dependency chain: (1) local implementation/review exact
  dedicated-preview bootstrap CLI/config contract; (2) отдельно разрешённый
  synthetic/no-PII import lifecycle с independent roles и recovery evidence до
  current promoted snapshot; (3) reviewed preview auth/email candidate deploy и
  только две approved verification deliveries; (4) owner выполняет регистрацию
  и verification двух accounts, не раскрывая passwords/OTP/tokens; (5) exact
  one-shot bootstrap корпоративного empty-state account, revoke/replay/audit/
  fresh-login checks; (6) manual full-cycle preview testing и оставшиеся Stage 13
  gates; (7) production только после закрытия blockers и отдельных approvals.
- Out-of-band synthetic-account provisioner допустим только после отдельной
  реализации/review и не заменяет current promoted snapshot, необходимый для
  полного registration cycle. Direct SQL остаётся stop condition.
- Перед каждым ответственным gate следующая сессия обязана оценивать context
  health. При повторных compactions, недостаточной уверенности в exact state,
  clean-room/independent-role boundary или риске ответственного шага она сначала
  выполняет разрешённую read-only reconciliation, обновляет handoff/checklist/
  runbook, создаёт новый self-contained ignored continuation prompt и только
  затем останавливается с точной инструкцией владельцу для новой сессии.
- В этой continuation remote mutation не выполнялась: D1/R2/Worker/Access/flags/
  secrets/providers/production/DNS/CMS/официальный сайт не затронуты. Работа
  сознательно передаётся до следующего ответственного gate, поскольку текущая
  сессия уже проходила несколько context compactions.
- Новый self-contained prompt:
  `docs/prompts/stage-13-continue-progressive-preview-to-production.md`. Его
  ближайшая задача — безопасно восстановить exact state, устранить local
  CLI/config mismatch и подготовить current-snapshot prerequisite; его постоянная
  цель — продолжать deployment process после каждого успешного gate, а не
  завершаться после первого шага.

## Continuation 2026-08-24: dedicated-preview D1 contract fixed locally

- Continuation начата с clean HEAD `adb7b70b`; он на один docs-only commit
  опережает указанную в prompt baseline `82ca91e3`. Diff затрагивает только 11
  canonical documentation files; `src`/`scripts`/`migrations`/`tests`, package и
  Wrangler configs между этими commits не менялись. Pre-existing commit и
  protected evidence не переписывались; новый commit не создавался.
- Fresh read-only exact-target reconciliation в `2026-08-24T10:13:28Z`
  подтвердила одну active Worker version `…76ee` на 100%, expected previous
  `…4154` inactive/available и anonymous `404` для active и retained `…1500`
  versioned preview routes. Local ignored config по-прежнему имеет
  `preview_urls=false` и SHA-256
  `b6fffb07d4c1e6654c657b2adb9a2e16acf4ed73b72cbead7465fe0908d08959`.
- Fresh Access perimeter: anonymous и invalid service token получают `302` в
  Access, valid service token достигает canonical Worker root с `200`, а
  `/_health/operations` возвращает `204`. DPAPI credential использован только
  в памяти, значения не печатались и не менялись.
- Fresh D1 read-only state: pending migrations `0`, ledger `0001`–`0022` точно
  совпадает с local files, FK violations `0`; academic periods/users/sessions/
  import runs/legacy versions/promotion events/bootstrap actions/assertions/
  audit и active admins равны `0`, bootstrap control остаётся `available`.
  Оба exact private EU R2 bucket имеют `0` objects, custom domains отсутствуют,
  `r2.dev` disabled. Deployed vars/bindings совпадают с ignored config; public
  auth, contract send/upload/public/media functions и email/Telegram/renderer
  providers остаются fail-closed. Scheduled operations остаются отдельно
  enabled по уже reviewed Cron contract.
- Wrangler `4.120.1` local schema и current official Cloudflare docs определяют
  `preview_database_id` как override для `wrangler dev`; deployed Worker binding
  использует `database_id`. Поэтому `scripts/remote-d1-target.ts` и
  `scripts/admin-bootstrap-remote.ts` теперь принимают exact deployed
  `database_id` для dedicated preview/production config и отклоняют любой
  `preview_database_id` overlay. Shared explicit identity, wrong UUID,
  placeholder, additional binding, selector collision, APP_ENV/account/target
  mismatch продолжают fail-closed до network.
- Bootstrap guard проверен на существующем ignored runtime config, import guard
  — на отдельном protected control config; targets совпадают. В
  `imports/legacy-preview-control.json` изменено только имя D1 selector
  `preview_database_id` → `database_id`; файл остаётся ignored и current-user
  ACL protected, новый SHA-256
  `c92f31615380815ade0576b724a445d7fe0d316c567daa883c72ea7e468a836f`.
  Его candidate/reviewer provenance сознательно не repin-илась без нового clean
  commit и independent review.
- Targeted unit и existing D1 integration tests прошли: 3 files, 19/19 tests.
  Затем прошли полные gates: `npm run check` — 0 errors/warnings; `npm test` —
  66 files, 512/512 tests; fresh `npm run build`; `npm run docs:check` — 151
  links in 52 files и 106 executable command lines; `npm run release:scan` —
  536/536; `git diff --check` passed. Ни один Worker/D1/R2/Access/flag/secret/
  provider/import/bootstrap/production/DNS/CMS/official-site mutation или send
  не выполнялся.
- Phase B remote plan/transition ещё не запускались: current worktree содержит
  этот uncommitted Phase A candidate, а prompt запрещает создавать commit без
  отдельного explicit permission. Protected control provenance остаётся на
  предыдущем reviewed candidate и должна быть repin-нута только после exact
  candidate commit и независимого review. Ближайший gate — разрешённый local
  candidate commit, после которого нужен отдельный reviewer/session protocol;
  разрешение на commit не является разрешением на synthetic import mutation.

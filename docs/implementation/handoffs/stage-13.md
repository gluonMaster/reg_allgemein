# Handoff этапа 13: hardening и production readiness

Ревизия: 2026-08-19.

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
Independent review этого SHA ещё не разрешён и не выполнялся.

Production readiness: **`blocked` / NO-GO**

Stage 13 реализует технический hardening и operator packet, но не даёт права на
production actions. Preview D1/R2 provision/migration и fail-closed Worker
evidence, включая automatic Cron delivery/freshness, уже получены;
authenticated/provider/remote Browser и manual-run/failure evidence,
backup/restore rehearsal, legal/privacy approvals, RPO/RTO и отдельное deploy
поручение остаются release blockers. Независимый UptimeRobot alert
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
  production resources и restore evidence отсутствуют.
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
| Empty D1    | deployed preview `0001`–`0015`, pending 0; local foundation suite includes unapplied `0016`–`0022`; exact runtime anchor `abb93f25`, remediation anchor `4ac6a491` and final docs-only review seal `2bedc73c` are immutable/verified; `b2e8548f` review is NO-GO | independent exact `2bedc73c` review, authorized remote apply, production migration и isolated restore |
| Upgraded D1 | historical populated `0013 → 0015` plus hardened suffix evidence through `0018`; focused reconciliation evidence applies `0019`–`0022`; exact runtime/remediation verification and final seal short gates passed | independent exact `2bedc73c` review, remote apply, isolated backup/restore + rollback rehearsal       |
| R2 split    | local guards + два отдельных private EU preview buckets verified                                                                                                                                   | production resources/policy и isolated restore                                                                                |
| Scheduler   | Local guards + preview automatic delivery/freshness for all nine jobs и внешний HEAD alert passed                                                                                                  | remote manual/dedupe/failure rehearsal                                                                                        |
| Bootstrap   | clean/invalid/replay/concurrent/upgrade, exact-ID selector isolation и result checks passed                                                                                                        | remote clean-room/least-privilege/zero-admin recovery drill                                                                   |
| Imports     | current Access sanitized profile 1703 rows/21 of 21 required fields/v1 compatible; current PlusBText v1 confirmed. Exact `8c6e2a` and `b2e8548f` reviews returned NO-GO; runtime anchor `abb93f25` passed full verification, docs/test remediation anchor `4ac6a491` passed proportional gates and final review seal `2bedc73c` passed short gates | independent exact `2bedc73c` review, exact-target remote lifecycle, synthetic preview/no-PII and first-import restore |

Applied migrations `0001`–`0015` нельзя переписывать. Recovery после применённой
migration — совместимый code rollback, новая forward-fix migration либо отдельно
разрешённый restore. Local migrations `0016`–`0022` не применены remote и не
входят в deployed evidence.

## Feature flags и fail-closed production paths

| Path                                  | Fail-closed config                                                                                                                                       | Статус                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Public registration                   | `AUTH_PUBLIC_ENABLED=false`                                                                                                                              | `feature_disabled`                                             |
| Email                                 | `EMAIL_PROVIDER=disabled`                                                                                                                                | `feature_disabled`                                             |
| Telegram                              | deployed preview uses `TELEGRAM_PROVIDER=disabled`; historical exact `a590d1f` `bot_api` candidate passed local verification/independent review but is not deployed | `feature_disabled`; external provider/rehearsal gate `blocked` |
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
| Local implementation/traceability | `blocked` pending independent review | PR-A06 historical audit covered 91/91 MVP IDs and 166 acceptance bullets/37 stable untagged mappings. Historical exact candidate `a590d1f` maps 99/99 IDs and 175 bullets and passed its narrower review. Exact `8c6e2a` was rejected with 2 BLOCKER/2 HIGH; exact `b2e8548f` with 1 BLOCKER/1 MEDIUM. Runtime anchor `abb93f25` passed the full chain; docs/test remediation anchor `4ac6a491` passed proportional gates. Final exact docs-only review seal `2bedc73c` passed short gates | Separate user authorization + independent exact `2bedc73c` reviewer |
| Dependency security               | `passed`                       | immutable `200268f`: clean install, full audit 0, full release verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | dependency/security owner                         |
| Environment/origin/R2 isolation   | `blocked`                      | preview Worker/D1/private EU R2 verified; custom/production origin/resources absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Cloudflare/security owner                         |
| Scheduled monitoring              | `passed`                       | preview Cron + external 5-minute HEAD monitor; DOWN→UP test delivery/recovery confirmed 2026-08-11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | operations owner/account contact                  |
| Admin bootstrap/recovery          | `blocked`                      | local one-shot passed; remote clean-room and recovery drill                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | security/operations owner                         |
| Current legacy import             | `blocked`                      | Fresh current-source sanitized parse and local `IMPORT-07` implementation reduce obsolete 1429/751 noise to 160 issue occurrences/53 enrollment reviews while retaining fail-closed records and safe admin references. One group awaits upstream correction. Exact runtime anchor `abb93f25` binds promotion/registration to exact materialization, child correction to exact `source_child_key`, and duplicate resolution to atomic peer supersession/applied-item rejection. Exact remediation anchor `4ac6a491` covers all mutable peer states and stale downstream denial and passed proportional gates. Exact `2bedc73c` review, admin cold-read, protected preview control, synthetic no-PII remote lifecycle, first-import restore and any current-data import remain absent | import/admin/data/backup/privacy owners           |
| Public auth/email                 | `feature_disabled`             | scoped key/secrets installed; enablement, real-token and delivery smoke absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | auth/provider owner                               |
| Telegram                          | `feature_disabled` / `blocked` | fail-closed deployed evidence and historical exact `a590d1f` verification/independent review exist; local `bot_api`/delivery-certainty/operator implementation and tests exist. Preview bot/chat secrets are absent; the channel invitation alone is not target evidence. Dedicated bot ownership, exact numeric destination/permissions, preflight, authorized synthetic normal-outbox smoke and operator rehearsal remain absent                                                                                                                                                                                                   | provider/privacy/reliability/operations owners    |
| Upload                            | `feature_disabled`             | preview private-EU R2 split passed; controlled AV/training/legal/production evidence absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | storage/security/legal owner                      |
| Contract/statutory/media          | `feature_disabled`             | production renderer/templates/legal assessment absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | contract/legal/privacy owners                     |
| Backup/restore/RPO/RTO            | `blocked`                      | inputs/mechanism/isolated rehearsal absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | data/backup/operations owners                     |
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

1. В новой сессии открыть и полностью выполнить
   `docs/prompts/stage-13-continue-deployment-after-2bedc73c.md`. Подтвердить
   exact review target `2bedc73c9b39a4cb43296046986a3f48e039b022`, его прямого
   родителя `4ac6a491`, docs-only/runtime-empty diff и отсутствие более нового
   runtime diff. Этот documentation handoff может быть отдельным потомком и не
   меняет зафиксированный review target.
2. Не повторять full/focused chain `4ac6a491` без нового
   `src`/`migrations`/`tests` diff. Exact `2bedc73c` short gates уже прошли.
3. Отдельно запросить разрешение пользователя ровно на один independent
   read-only review exact `2bedc73c`. Review ничего не меняет локально/удалённо
   и возвращает findings с severity/file/line/test gap и итог GO/NO-GO. Exact
   `8c6e2a` и `b2e8548f` остаются rejected checkpoints; `4ac6a491` — remediation
   anchor.
4. После независимого GO подготовить и независимо проверить protected
   exact-target preview control, затем раздельно запросить backup/isolated
   restore, deploy и migration permissions. Не объединять их с import, secret
   mutation или provider send.
5. Продолжить безопасный local PR-A12 scope только для оставшихся lifecycles:
   register/verify/claim, funded Nachhilfe upload/document review, enabled
   contract accept/form/activate, price admin-send и scheduled apply; preview/
   provider authenticated rehearsal требует отдельного разрешения.
6. Для PR-A13 провести literal/manual zoom, assistive-technology и glyph/font
   review. Для PR-A14 закрыть disabled-upload mutation, оставшиеся
   enrollment/group-service и guessed/admin-purpose variants; preview matrix
   также требует отдельного разрешения.
7. Поддерживать independent uptime monitor для `/_health/operations` и
   периодически повторять delivery test; real-token Turnstile, synthetic email
   delivery/reply и другие provider sends требуют отдельных разрешений.
8. Получить RPO/RTO/cadence, реализовать R2 backup и пройти полный isolated D1/R2
   restore + rollback/roll-forward drill.
9. Получить legal/privacy/template/provider/DPA/AVV inputs и approvals.
10. Провести full non-production bootstrap/runbook execution с approved preview
    resources; локальный content cold-read уже пройден.
11. Только после отсутствия `blocked` запросить отдельные production и site-link
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

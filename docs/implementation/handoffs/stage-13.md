# Handoff этапа 13: hardening и production readiness

Ревизия: 2026-08-14.

Статус этапа: `in_progress` — обязательный Access/Telegram local candidate
реализован и прошёл fresh full local-worktree verification; immutable exact-SHA
independent review и все external gates ещё не закрыты.

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
- Clean baseline for the Access/Telegram readiness expansion:
  `c5712d06af217129f0344864b69ddda962c29d19`. It predates the required
  implementation below and is not the resulting release candidate. The
  authorized candidate is `e7c94f8e7d33ca95cde123652223bd4c99108945` plus
  clean-clone documentation-check fix
  `8f247e5f02ef24482d2ff438d2e1e437b82caf7c`.
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

| Область     | Evidence                                                                                     | Остаточный gate                                             |
| ----------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Empty D1    | deployed preview `0001`–`0015`, pending 0; resulting local candidate suite includes unapplied `0016`–`0018` | authorized remote candidate apply, production migration и isolated restore |
| Upgraded D1 | historical populated `0013 → 0015` plus current local suffix upgrade through `0018` and selector rejection | remote apply, isolated backup/restore + rollback rehearsal |
| R2 split    | local guards + два отдельных private EU preview buckets verified                             | production resources/policy и isolated restore              |
| Scheduler   | Local guards + preview automatic delivery/freshness for all nine jobs и внешний HEAD alert passed | remote manual/dedupe/failure rehearsal                       |
| Bootstrap   | clean/invalid/replay/concurrent/upgrade, exact-ID selector isolation и result checks passed  | remote clean-room/least-privilege/zero-admin recovery drill |
| Imports     | local allowlist/dry-run/promote/rollback tests; current Access sanitized profile 1703 rows/21 of 21 required fields/v1 compatible; current PlusBText confirmed v1 after isolating parser sanitizer false mismatch | parser regression/full candidate evidence, exact-target remote bundle lifecycle, synthetic preview/no-PII, first-import restore and authorized current production import |

Applied migrations `0001`–`0015` нельзя переписывать. Recovery после применённой
migration — совместимый code rollback, новая forward-fix migration либо отдельно
разрешённый restore. Local candidates `0016`–`0018` не применены remote и не
входят в deployed evidence.

## Feature flags и fail-closed production paths

| Path                                  | Fail-closed config                                          | Статус             |
| ------------------------------------- | ----------------------------------------------------------- | ------------------ |
| Public registration                   | `AUTH_PUBLIC_ENABLED=false`                                 | `feature_disabled` |
| Email                                 | `EMAIL_PROVIDER=disabled`                                   | `feature_disabled` |
| Telegram                              | deployed preview/baseline `c5712d0`: `TELEGRAM_PROVIDER=disabled`; resulting `bot_api` candidate is not yet verified or deployed | `feature_disabled`; implementation/release gate `blocked` |
| Document upload                       | `DOCUMENT_UPLOAD_ENABLED=false`                             | `feature_disabled` |
| Contract rendering/send               | `CONTRACT_RENDERER=disabled`, `CONTRACT_SEND_ENABLED=false` | `feature_disabled` |
| Online media grant                    | `MEDIA_ONLINE_GRANT_ENABLED=false`                          | `feature_disabled` |
| Public statutory functions            | `PUBLIC_CONTRACT_FUNCTIONS_ENABLED=false`                   | `feature_disabled` |
| Retained legal-archive purge          | policy `disabled_by_policy`                                 | `feature_disabled` |
| Ordinary retained-archive read/search | route absent                                                | `feature_disabled` |

`feature_disabled` не равно `passed`. Ограниченный release требует отдельного
approved scope и не называется полным MVP.

## Проверки 2026-07-22

| Команда/сценарий                           | Sanitized result                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `npm ci`                                   | passed после удаления generated Worker output; 269 packages installed                 |
| `npm run check`                            | clean-source passed: 0 errors/warnings                                                |
| Targeted Stage-13 tests                    | migration/bootstrap/scheduler/storage/download/headers/connected-flow/security passed |
| `npm test`                                 | passed: 44 files, 241/241 tests                                                       |
| `npm run test:e2e`                         | passed: 3/3 boundary smoke; это не full authenticated lifecycle                       |
| `npm run build`                            | passed; adapter output собран                                                         |
| `wrangler deploy --dry-run`                | passed на placeholder example config; 68 assets, remote deploy не выполнялся          |
| `npm audit --omit=dev`                     | passed: 0 vulnerabilities после корректной dev-only классификации build adapter       |
| `npm run docs:check`                       | passed: 138 local links / 51 files + 82 executable command lines                      |
| `npm run release:scan`                     | passed: 469/469 candidates; artifact/secret/PII/control-byte findings отсутствуют     |
| `git diff --check`                         | passed после final documentation/cold-read sync                                       |
| Preview D1 migration                       | passed 2026-08-10: 14/14, pending 0, schema parity, FK violations 0, user rows 0      |
| Preview Worker/Browser/provider/Cron smoke | partial 2026-08-11: fail-closed GET/HEAD, automatic Cron и внешний alert passed; Browser/provider/manual — `blocked` |
| D1/R2 isolated restore/rollback rehearsal  | not run — `blocked`                                                                   |

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
  files plus 105 commands and fresh-clone scan 458/458. PR-A16 now remains
  blocked only for its independent exact-SHA traceability/security verdict.
- These new rows remain `blocked` after local implementation until an immutable
  candidate and exact target-pinned preview evidence exist. Legal/provider approvals, restore/RPO/RTO,
  production resources/origin, remaining browser/manual gates and explicit
  production permissions independently preserve the overall **NO-GO**.

### Read-only preview and current-source checkpoint 2026-08-17

- Exact candidate `ca4ef8f50ea0ffc1139c2ec3d286cbdb7e4158ec` adds strict
  Access OLE Automation date-serial handling. Its exact-SHA clean clone passed
  `npm ci` and full `release:verify` in 556.4 s: check 0/0, Vitest 63 files/472
  tests, Chromium 18/18, build, production audit 0, docs 143 links/51 files plus
  105 commands and scan 458/458. PR-A16 still requires an independent exact-SHA
  traceability/security verdict.
- Read-only public and Wrangler inventory confirmed root HEAD 200 and
  operations-health HEAD 204. Preview still runs historical `200268f` as Worker
  version `sha256:f4cd52e14dbd` at 100%; candidate
  `ca4ef8f` is not deployed.
- Remote preview D1 remains without an academic period, users, import runs,
  current PlusBText/Access snapshots or Telegram outbox rows. Candidate
  migrations `0016`–`0018` are pending. A current Time Travel bookmark exists,
  but a protected backup plus independently verified isolated restore is not
  evidenced. No migration/import/restore was executed.
- Fresh read-only non-executing current-source parsing confirmed strict
  `admin-xlsm-plusbtext:v1` with 302 rows, 164 old groups, 138 targets, 61
  warnings and no error/fatal; and strict `access-tblkartei:v1` with 1703 source
  rows and 21/21 required fields. The Access aggregate projection is 580
  families, 713 children and 929 enrollments; 26 rows remain skipped for
  missing/invalid birth dates and 1429 warnings require data-owner review. No
  row values, PII, source hashes or Office contents were emitted.
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

| Gate                              | Статус             | Evidence / next action                                                        | Owner                          |
| --------------------------------- | ------------------ | ----------------------------------------------------------------------------- | ------------------------------ |
| Local implementation/traceability | `passed` for prior audited scope; resulting candidate `blocked` | PR-A06 Ultra audit covered the then-current 91/91 MVP IDs and 166 acceptance bullets/37 stable untagged mappings with no prior HIGH/BLOCKER. Candidate `ca4ef8f` maps 99/99 IDs and 175 bullets and passed exact-SHA clean-clone verification including the current Access parser fix; PR-A16 remains blocked for independent exact-SHA traceability/security re-review | Codex Ultra independent reviewer, 2026-08-12; release operator |
| Dependency security               | `passed`           | immutable `200268f`: clean install, full audit 0, full release verification | dependency/security owner |
| Environment/origin/R2 isolation   | `blocked`          | preview Worker/D1/private EU R2 verified; custom/production origin/resources absent | Cloudflare/security owner      |
| Scheduled monitoring              | `passed`           | preview Cron + external 5-minute HEAD monitor; DOWN→UP test delivery/recovery confirmed 2026-08-11 | operations owner/account contact |
| Admin bootstrap/recovery          | `blocked`          | local one-shot passed; remote clean-room and recovery drill                   | security/operations owner      |
| Current legacy import             | `blocked`          | Fresh current-source sanitized parse and exact `ca4ef8f` clean-clone evidence exist; local PlusBText v1/parser and exact-target reviewed atomic bundle tests pass. The protected preview control config is not yet exact-target complete; synthetic no-PII remote lifecycle, first-import restore, review of 26 skipped records/1429 warnings and any authorized current-data import remain absent | import/data/backup/privacy owners |
| Public auth/email                 | `feature_disabled` | scoped key/secrets installed; enablement, real-token and delivery smoke absent | auth/provider owner            |
| Telegram                          | `feature_disabled` / `blocked` | fail-closed deployed evidence and exact `ca4ef8f` clean-clone verification exist; local `bot_api`/delivery-certainty/operator implementation and focused tests exist. Preview bot/chat secrets are absent; the channel invitation alone is not target evidence. Dedicated bot ownership, exact numeric destination/permissions, preflight, authorized synthetic normal-outbox smoke and operator rehearsal remain absent | provider/privacy/reliability/operations owners |
| Upload                            | `feature_disabled` | preview private-EU R2 split passed; controlled AV/training/legal/production evidence absent | storage/security/legal owner   |
| Contract/statutory/media          | `feature_disabled` | production renderer/templates/legal assessment absent                         | contract/legal/privacy owners  |
| Backup/restore/RPO/RTO            | `blocked`          | inputs/mechanism/isolated rehearsal absent                                    | data/backup/operations owners  |
| Synthetic browser lifecycle       | `blocked`          | local Chromium 8 files/18 tests covers request, catalog/trial, support, structured absence and price review through `scheduled`; Browser contract accept/form/activate is not claimed. Register/verify/claim, funded upload/document review, enabled contract lifecycle, price admin-send/apply and preview/provider auth remain | product/release owner          |
| Accessibility/browser             | `blocked`          | public preview smoke plus local strict accessibility 4/4: all default axe rules, empty `violations`/`incomplete`, inline-error semantics, 390px parent/admin and 640px zoom-equivalent reflow passed; literal/manual zoom, assistive-technology, glyph/font and remote auth review absent | UX/accessibility owner         |
| Permission/IDOR/browser           | `blocked`          | local authenticated 6/6 plus trial branches, exact route tests and focused D1 cover request/document/trial/contract-end-attendance-media/price/message/privacy with carrier-bound safe 404, owned 409, unchanged owner state and atomic rollback/replay; enabled contract decision, disabled upload, remaining enrollment/group-service and guessed/admin-purpose variants plus preview remain | security owner                 |
| Legal/privacy/provider            | `blocked`          | external approvals absent                                                     | authorized owners              |
| Production deploy                 | `blocked`          | NO-GO + direct approval absent                                                | authorized release owner       |
| Official-site links               | `blocked`          | exact surfaces/old values/separate permission absent                          | authorized site owner          |

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

1. Exact candidate `ca4ef8f` and its clean-clone verification are complete. The
   next non-mutating gate is an independent exact-SHA review of migrations
   `0016`–`0018`, the built-in synthetic preview source boundary, exact-target
   reviewed import/count/recovery workflow, Telegram Bot API/delivery certainty
   and operator actions. Do not perform remote stage/promote/restore,
   secret/config mutation or send as part of that review.
2. После local verification отдельно запросить exact-scope permissions для
   synthetic/no-PII preview import lifecycle/first-import restore и single
   synthetic Telegram delivery/unknown operator smoke. Current PII source не
   помещать в ordinary preview.
3. Продолжить безопасный local PR-A12 scope только для оставшихся lifecycles:
   register/verify/claim, funded Nachhilfe upload/document review, enabled
   contract accept/form/activate, price admin-send и scheduled apply; preview/
   provider authenticated rehearsal требует отдельного разрешения.
4. Для PR-A13 провести literal/manual zoom, assistive-technology и glyph/font
   review. Для PR-A14 закрыть disabled-upload mutation, оставшиеся
   enrollment/group-service и guessed/admin-purpose variants; preview matrix
   также требует отдельного разрешения.
5. На exact SHA commit, содержащего эту ревизию, выполнить clean-clone
   `npm ci`, full audit и полный `npm run release:verify`; только после этого
   переносить local evidence на immutable-candidate gate. Push/deploy остаются
   отдельными явно разрешаемыми действиями.
6. Поддерживать independent uptime monitor для `/_health/operations` и
   периодически повторять delivery test; real-token Turnstile, synthetic email
   delivery/reply и другие provider sends требуют отдельных разрешений.
7. Получить RPO/RTO/cadence, реализовать R2 backup и пройти полный isolated D1/R2
   restore + rollback/roll-forward drill.
8. Получить legal/privacy/template/provider/DPA/AVV inputs и approvals.
9. Провести full non-production bootstrap/runbook execution с approved preview
   resources; локальный content cold-read уже пройден.
10. Только после отсутствия `blocked` запросить отдельные production и site-link
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

- Current resulting deploy candidate is
  `ca4ef8f50ea0ffc1139c2ec3d286cbdb7e4158ec fix: parse Access OLE date serials`.
  Its exact-SHA clean clone passed `npm ci`, full audit and `release:verify` on
  2026-08-17. Independent PR-A16 exact-SHA review and every remote/external gate
  remain pending.
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

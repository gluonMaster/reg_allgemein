# Handoff этапа 13: hardening и production readiness

Статус этапа: `done` (локальный scope реализован и проверен)

Production readiness: **`blocked` / NO-GO**

Stage 13 реализует технический hardening и operator packet, но не даёт права на
production actions. Preview D1/R2 provision/migration и fail-closed Worker
evidence, включая automatic Cron delivery/freshness, уже получены;
provider/Browser smoke и remote manual-run/failure evidence, backup/restore
rehearsal, legal/privacy approvals, RPO/RTO и отдельное deploy поручение остаются
release blockers. Независимый UptimeRobot alert delivery/recovery rehearsal
пройден 2026-08-11.

## Baseline

- Branch: `master`.
- Start HEAD: `6645df5648273d027b5e3e86eb64c024e5739b7a`.
- Initial `git status --short`: clean.
- Предыдущий handoff: [stage-12.md](stage-12.md).
- Operational contract:
  [PRODUCTION_READINESS.md](../../operations/PRODUCTION_READINESS.md).
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
| Empty D1    | local test + preview remote `0001`–`0014` apply/schema parity passed                         | production migration и isolated restore                     |
| Upgraded D1 | populated `0013 → 0014` upgrade passed 1/1; migration file 2/2 с selector-rejection test     | isolated backup/restore + rollback rehearsal                |
| R2 split    | local guards + два отдельных private EU preview buckets verified                             | production resources/policy и isolated restore              |
| Scheduler   | Local guards + preview automatic delivery/freshness for all nine jobs и внешний HEAD alert passed | remote manual/dedupe/failure rehearsal                       |
| Bootstrap   | clean/invalid/replay/concurrent/upgrade, exact-ID selector isolation и result checks passed  | remote clean-room/least-privilege/zero-admin recovery drill |
| Imports     | local allowlist/dry-run/promote/rollback tests remain                                        | authorized current source and remote audited path           |

Applied migrations `0001`–`0014` нельзя переписывать. Recovery после применённой
migration — совместимый code rollback, новая forward-fix migration либо отдельно
разрешённый restore.

## Feature flags и fail-closed production paths

| Path                                  | Fail-closed config                                          | Статус             |
| ------------------------------------- | ----------------------------------------------------------- | ------------------ |
| Public registration                   | `AUTH_PUBLIC_ENABLED=false`                                 | `feature_disabled` |
| Email                                 | `EMAIL_PROVIDER=disabled`                                   | `feature_disabled` |
| Telegram                              | `TELEGRAM_PROVIDER=disabled`                                | `feature_disabled` |
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
  release scan 476/476. PR-A15 остаётся `blocked` до commit, immutable clean-clone
  verify, отдельного preview deploy permission и remote recheck corrected version.

## Release gates

Полный ledger: [PRODUCTION_READINESS_CHECKLIST.md](../../operations/PRODUCTION_READINESS_CHECKLIST.md).

| Gate                              | Статус             | Evidence / next action                                                        | Owner                          |
| --------------------------------- | ------------------ | ----------------------------------------------------------------------------- | ------------------------------ |
| Local implementation/traceability | `blocked`          | immutable candidate verified; final independent review/remaining remote evidence incomplete | release + independent reviewer |
| Dependency security               | `passed`           | immutable `63995f8`: clean install, full audit 0, full release verification | dependency/security owner |
| Environment/origin/R2 isolation   | `blocked`          | preview Worker/D1/private EU R2 verified; custom/production origin/resources absent | Cloudflare/security owner      |
| Scheduled monitoring              | `passed`           | preview Cron + external 5-minute HEAD monitor; DOWN→UP test delivery/recovery confirmed 2026-08-11 | operations owner/account contact |
| Admin bootstrap/recovery          | `blocked`          | local one-shot passed; remote clean-room and recovery drill                   | security/operations owner      |
| Public auth/email                 | `feature_disabled` | scoped key/secrets installed; enablement, real-token and delivery smoke absent | auth/provider owner            |
| Telegram                          | `feature_disabled` | approved adapter/DPA absent                                                   | provider/privacy owner         |
| Upload                            | `feature_disabled` | remote R2/scanner/training/legal evidence absent                              | storage/security/legal owner   |
| Contract/statutory/media          | `feature_disabled` | production renderer/templates/legal assessment absent                         | contract/legal/privacy owners  |
| Backup/restore/RPO/RTO            | `blocked`          | inputs/mechanism/isolated rehearsal absent                                    | data/backup/operations owners  |
| Accessibility/browser             | `blocked`          | deployed public desktop/mobile/keyboard passed; authenticated/axe/manual glyph evidence absent | UX/accessibility owner         |
| Legal/privacy/provider            | `blocked`          | external approvals absent                                                     | authorized owners              |
| Production deploy                 | `blocked`          | NO-GO + direct approval absent                                                | authorized release owner       |
| Official-site links               | `blocked`          | exact surfaces/old values/separate permission absent                          | authorized site owner          |

## Отдельно разрешаемые production/site действия

Каждый пункт требует отдельного прямого поручения и exact targets:

1. Cloudflare remote resources, DNS и TLS;
2. preview deploy/migration/provider/Cron/Browser smoke;
3. production D1 migration;
4. production Worker deploy или rollback;
5. реальный PII import/promote/rollback;
6. email/Telegram enablement и реальная отправка;
7. upload/contract/media/statutory enablement;
8. production backup/restore;
9. изменение CMS, ссылок или страниц официального сайта.

Разрешение одного пункта не разрешает остальные.

## Следующие действия

1. После отдельного разрешения закоммитить logging remediation, проверить exact
   SHA в clean clone, затем запросить отдельное preview deploy permission и
   подтвердить, что probe/ordinary 404 больше не создаёт
   `UNEXPECTED_SERVER_ERROR`, а health/Cron остаются healthy.
2. Поддерживать созданный independent uptime monitor для `/_health/operations`
   и периодически повторять delivery test; затем по отдельным разрешениям
   продолжить preview smoke: authenticated browser/accessibility, real-token
   Turnstile и synthetic email delivery/reply smoke.
3. Получить RPO/RTO/cadence, реализовать R2 backup и пройти полный isolated D1/R2
   restore + rollback/roll-forward drill.
4. Получить legal/privacy/template/provider/DPA/AVV inputs и approvals.
5. Провести full non-production bootstrap/runbook execution с approved preview
   resources; локальный content cold-read уже пройден.
6. Только после отсутствия `blocked` запросить отдельные production и site-link
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
- Post-deploy сверка этой сессии: HEAD `5a982ee`, preview config SHA-256
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`,
  Worker version `sha256:73d63af740da` на 100%, D1 pending
  migrations 0; post-deploy HEAD вернул empty 204 с обязательными headers.
- Immutable browser-fix candidate независимо проверен в clean clone: `npm ci`,
  full audit 0 и полный `release:verify` passed. Public deployed browser smoke
  также passed; authenticated/provider/manual/restore evidence остаётся.
- Следующий remote preview smoke или production/site action требует нового
  прямого поручения соответствующего scope.

## Итог worktree

- HEAD: `5a982ee48c3ea262d1851a4ce966a9f88d67ecee fix: add portal metadata and
  favicon` поверх `63995f8 chore: remediate release tooling advisories`.
- Dependency remediation и browser fix закоммичены и проверены на exact SHA;
  текущие незакоммиченные изменения включают post-deploy/log-review evidence,
  4xx logging remediation, regression и runbook/checklist synchronization.
- Production/CMS/official-site actions не выполнялись.

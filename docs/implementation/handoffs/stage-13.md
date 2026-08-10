# Handoff этапа 13: hardening и production readiness

Статус этапа: `done` (локальный scope реализован и проверен)

Production readiness: **`blocked` / NO-GO**

Stage 13 реализует технический hardening и operator packet, но не даёт права на
production actions. Preview D1/R2 provision/migration evidence уже получено;
preview Worker/provider/Browser/Cron evidence, backup/restore rehearsal,
legal/privacy approvals, RPO/RTO и отдельное deploy поручение остаются release
blockers.

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
| Empty D1    | local test + preview remote `0001`–`0014` apply/schema parity passed                          | production migration и isolated restore                     |
| Upgraded D1 | populated `0013 → 0014` upgrade passed 1/1; migration file 2/2 с selector-rejection test     | isolated backup/restore + rollback rehearsal                |
| R2 split    | local guards + два отдельных private EU preview buckets verified                            | production resources/policy и isolated restore              |
| Scheduler   | Cron allowlist, dedupe/lease, fresh clock, disabled path, audit and failure isolation passed | preview trigger/freshness/alerts                            |
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

| Команда/сценарий                          | Sanitized result                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm ci`                                  | passed после удаления generated Worker output; 269 packages installed                 |
| `npm run check`                           | clean-source passed: 0 errors/warnings                                                |
| Targeted Stage-13 tests                   | migration/bootstrap/scheduler/storage/download/headers/connected-flow/security passed |
| `npm test`                                | passed: 44 files, 241/241 tests                                                       |
| `npm run test:e2e`                        | passed: 3/3 boundary smoke; это не full authenticated lifecycle                       |
| `npm run build`                           | passed; adapter output собран                                                         |
| `wrangler deploy --dry-run`               | passed на placeholder example config; 68 assets, remote deploy не выполнялся          |
| `npm audit --omit=dev`                    | passed: 0 vulnerabilities после корректной dev-only классификации build adapter       |
| `npm run docs:check`                      | passed: 138 local links / 51 files + 82 executable command lines                      |
| `npm run release:scan`                    | passed: 469/469 candidates; artifact/secret/PII/control-byte findings отсутствуют     |
| `git diff --check`                        | passed после final documentation/cold-read sync                                       |
| Preview D1 migration                      | passed 2026-08-10: 14/14, pending 0, schema parity, FK violations 0, user rows 0        |
| Preview Worker/Browser/provider/Cron smoke| not run; Worker/providers не развёрнуты — `blocked`                                    |
| D1/R2 isolated restore/rollback rehearsal | not run — `blocked`                                                                   |

Полный `npm audit` сохраняет три high advisory в dev-only Wrangler/Miniflare/
Sharp tooling; совместимый upstream fix пока отсутствует, breaking
`--force`/downgrade не применялся. Production audit проходит, но remote/restore/
approval gates всё равно удерживают readiness в `blocked`.

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
- Full preview Worker/provider/Cron/bootstrap/restore rehearsal не выполнялся и
  остаётся `blocked`. Новые deliverables должны войти в будущий immutable commit;
  `git add`/commit в рамках этапа не выполнялись.
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

## Release gates

Полный ledger: [PRODUCTION_READINESS_CHECKLIST.md](../../operations/PRODUCTION_READINESS_CHECKLIST.md).

| Gate                              | Статус             | Evidence / next action                                                        | Owner                          |
| --------------------------------- | ------------------ | ----------------------------------------------------------------------------- | ------------------------------ |
| Local implementation/traceability | `blocked`          | local full run/cold-read passed; нужен commit и rerun на immutable candidate  | release + independent reviewer |
| Dependency security               | `blocked`          | production audit clean; review documented dev-tooling advisory on each update | dependency/security owner      |
| Environment/origin/R2 isolation   | `blocked`          | preview D1 + private EU R2 verified; Worker/origin/production ещё отсутствуют  | Cloudflare/security owner      |
| Scheduled monitoring              | `blocked`          | local scheduler passed; define alerts/owners and preview Cron smoke           | operations owner               |
| Admin bootstrap/recovery          | `blocked`          | local one-shot passed; remote clean-room and recovery drill                   | security/operations owner      |
| Public auth/email                 | `feature_disabled` | real approved adapter absent                                                  | auth/provider owner            |
| Telegram                          | `feature_disabled` | approved adapter/DPA absent                                                   | provider/privacy owner         |
| Upload                            | `feature_disabled` | remote R2/scanner/training/legal evidence absent                              | storage/security/legal owner   |
| Contract/statutory/media          | `feature_disabled` | production renderer/templates/legal assessment absent                         | contract/legal/privacy owners  |
| Backup/restore/RPO/RTO            | `blocked`          | inputs/mechanism/isolated rehearsal absent                                    | data/backup/operations owners  |
| Accessibility/browser             | `blocked`          | authenticated mobile/keyboard/axe/remote glyph evidence absent                | UX/accessibility owner         |
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

1. Повторить clean `release:verify` на immutable candidate; при обновлении
   Wrangler/Miniflare проверить устранение documented dev-tooling advisory.
2. Развернуть preview Worker и выполнить production-shaped smoke без PII и real
   sends, включая authenticated browser/accessibility и Cron alerts.
3. Получить RPO/RTO/cadence, реализовать R2 backup и пройти полный isolated D1/R2
   restore + rollback/roll-forward drill.
4. Получить legal/privacy/template/provider/DPA/AVV inputs и approvals.
5. Провести full non-production bootstrap/runbook execution с approved preview
   resources; локальный content cold-read уже пройден.
6. Только после отсутствия `blocked` запросить отдельные production и site-link
   поручения.

## Итог worktree

- End `git status --short`: Stage-13 implementation/docs changes present; no
  unrelated pre-existing changes were present at start.
- Commit не создавался.
- Production/CMS/official-site actions не выполнялись.

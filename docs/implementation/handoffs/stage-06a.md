# Handoff этапа 06A: базовая административная консоль

Статус: `done`

Production readiness: `feature_disabled`

## Baseline

- Branch: `master`.
- Start HEAD: `6a0d002e068f32c7585ccdb30b3e428f19ae17b8`.
- Initial `git status --short`: clean.
- Предыдущий handoff: `docs/implementation/handoffs/stage-06.md`, status
  `done`; migration `0006`, branded `AdminActor`, deny-by-default route policy,
  sessions/CSRF, typed review tasks, family claims/reassignments и owner-safe
  cabinet read models приняты как prerequisites.

## Выполнено

- Requirement/acceptance IDs: `ADMIN-01`–`ADMIN-03`, `AUTH-08`–`AUTH-09`,
  `CLAIM-04`–`CLAIM-09`, `CHILD-02`, `CAT-01`–`CAT-04`; административная
  приёмка и релевантные разделы 2–6 `ACCEPTANCE_CRITERIA.md`.
- Migration ID: `0007_admin_console.sql`. Применённые migrations `0001`–`0006`
  не изменялись. Добавлены immutable persisted FamilyID previews и точные
  child snapshots, append-only `admin_action_assertions`, reason trigger для
  admin family reassignment и необходимые indexes/retention triggers.
- Admin shell: единый `/admin` layout, dashboard, responsive German UI,
  central route guard и повторная server-side `requireAdmin`/active-admin
  проверка в loaders, form boundary и SQL mutations. `coreAdminNavigation` и
  `buildAdminNavigation(extensions)` являются единственной точкой расширения;
  второй layout/RBAC mechanism добавлять не нужно.
- Read surfaces: bounded/paginated import runs/issues, review queue, masked
  legacy/user lists, scoped PII detail, catalog/mapping queue и read-only active
  price version/rules diagnostics. Import JSON рекурсивно ограничивается и
  redacts paths, workstation/source metadata, email/phone/address-like values и
  oversized/deep content; raw source rows не выбираются.
- Typed mutations: block/unblock с session revocation, import issue
  resolve/dismiss, child correction approve/reject, typed family review
  dismissal, course mapping confirm/reject, catalog publish/hide/needs-review и
  capacity override. Каждая команда требует strict Zod payload, reason,
  explicit confirmation, idempotency key, current admin actor, target assertion
  и safe audit. Catalog actions не ставят email/Telegram notifications.
- FamilyID correction: server-validated legacy search либо server allocator,
  15-minute persisted preview, exact account/all-child cardinality, current
  promoted legacy snapshot, ownership/collision/continuity checks, reason,
  repeated confirmation и hashed idempotency. Apply одним D1 batch меняет
  allocation alias/ownership, legacy claim, account family version, все owned и
  eligible destination children, related review, audit и final transaction
  assertion. Other-owned, free-form, invalid, incomplete-child, stale preview,
  consequence change и preview/apply race fail closed без partial state.
- Contract consequence extension: `FamilyCorrectionContributor` фиксирует
  immutable preview snapshot и добавляет apply statements/assertion в тот же
  batch. `Stage06aFamilyCorrectionContributor` явно сообщает отсутствие stage-09
  offer/contract tables и нулевые counts; этап 09 обязан заменить contributor,
  сохранить old-contract evidence и supersede-ить только nonterminal old-family
  offers, не меняя correction protocol.
- Pricing diagnostics различают обычную yearly rate `Preis` и обычную monthly
  source rate из исторической колонки `Sonderpreis`; UI не называет её manual
  override и не предоставляет price override action.
- Canonical model обновлён разделами `admin_action_assertions`,
  `admin_family_correction_previews` и preview children. Все новые UI strings и
  enum labels проходят через i18n catalog.
- Environment/binding/config changes: новых bindings, env vars, flags и secret
  values нет. Существующие D1/auth/session/CSRF boundaries переиспользованы.
- Feature flags/fail-closed: production resources/deployment не изменялись;
  tracked public auth остаётся выключен `AUTH_PUBLIC_ENABLED=false`. Remote D1
  migration, admin bootstrap/role assignment и production deploy не выполнялись.
- Migration/rollback/restore compatibility: clean in-memory D1 применяет
  immutable sequence `0001`–`0007`. Remote rollback/restore rehearsal не
  выполнялся; rollback остаётся restore/forward-fix операцией, а не изменением
  применённой migration.

## Проверки

| Команда/сценарий         | Результат                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`          | passed; `svelte-check found 0 errors and 0 warnings`                                                                                                                                                               |
| `npm test`               | passed; 21 files, 128 tests                                                                                                                                                                                        |
| `npm run build`          | passed; Vite SSR/client + Cloudflare adapter build                                                                                                                                                                 |
| `npm run test:e2e`       | passed; 3 Chromium tests, включая `/admin` и direct POST denial                                                                                                                                                    |
| Stage-06A D1 matrix      | passed; diagnostics redaction/parent denial, idempotent block+session revoke+audit, typed import/child/mapping/catalog actions, no notification, FamilyID preview/apply/replay/race/cardinality/collision rollback |
| Security/read-model scan | passed; client bundle не содержит synthetic raw import path/email, source label/context storage keys или auth hashes; `git diff --check` clean                                                                     |

## Не выполнено и риски

- Открытые вопросы/OQ: открытых owner/product OQ нет. Закрытые `OQ-027` и
  `OQ-028` реализованы как обязательные typed review и high-friction atomic
  FamilyID correction.
- External/legal/operational release gates, не являющиеся OQ: production D1
  migration/backup/restore, admin account bootstrap, preview/prod smoke и deploy
  не выполнялись.
- Known failures: финальные обязательные code/test/build/browser gates проходят;
  известных code failures нет.
- Сознательно вне scope: public catalog/trial, requests/documents, contracts/PDF,
  offer-specific `manual_override`, price-review batches, support/outbox pages,
  arbitrary editing upstream PII, production import/promotion, официальный сайт
  и deploy.
- До migration этапа 09 offer/contract tables отсутствуют. Поэтому текущий
  contributor не может supersede-ить реальные offers; он fail-visible в preview
  и предоставляет обязательную atomic extension boundary, а не имитирует
  contract behavior.

## Release gates

| Gate                              | Статус             | Affected path/flag                                             | Evidence                                                          | Owner / next action                                                   |
| --------------------------------- | ------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| Stage-06A synthetic admin console | `passed`           | migration/routes/repositories/tests                            | 128 tests, check/build/e2e, D1 assertions и security scan         | этапы 07–11 расширяют готовый shell/interfaces                        |
| Production admin console          | `feature_disabled` | remote migration/deployment/admin account                      | production resources не изменялись; local/synthetic evidence only | этап 13/operator: backup, migrate, bootstrap, preview smoke и release |
| Production public auth/claim      | `feature_disabled` | `AUTH_PUBLIC_ENABLED=false`                                    | existing fail-closed config сохранён                              | этап 13/operator после provider/release rehearsal                     |
| Contract consequences             | `feature_disabled` | `FamilyCorrectionContributor` default stage-06A implementation | preview явно сообщает отсутствие contract tables                  | этап 09 заменяет contributor и тестирует immutable evidence/supersede |
| Official-site changes             | `blocked`          | external CMS/code/links                                        | официальный сайт не изменялся                                     | owner/operator только по прямому поручению                            |

`feature_disabled` означает проверенное отсутствие production exposure либо
ещё не подключённый downstream contract path, а не готовность полного MVP к
production.

## Operator docs и rehearsal

- Актуальные tracked docs: `docs/README.md`, `docs/spec/MVP_SPEC.md`,
  `docs/implementation/ROADMAP.md`, `docs/architecture/DATA_MODEL.md`,
  `docs/operations/IMPORT_PIPELINE.md`, `docs/domain/COURSES.md`,
  `docs/domain/PRICING.md` и этот handoff. Production runbook остаётся этапу 13.
- Проверенные environment и дата: Windows, 2026-07-17, Node `v22.20.0`, npm
  `10.9.3`, Wrangler `4.109.0`, Vitest `3.2.7`.
- Clean-room walkthrough выполнен против isolated in-memory D1 с synthetic
  snapshots/users/courses. Реальные upstream Office-файлы, client PII,
  provider/resources и production данные не читались и не изменялись.
- Stop conditions: actor больше не active admin; destination free-form,
  other-owned/colliding/ambiguous; current legacy snapshot/version изменился;
  preview expired; owner/child/consequence set изменился; target assertion или
  audit не создан; требуется remote/production mutation.
- Намеренно не выполнены: provisioning, secrets, remote migrations, admin role
  bootstrap, deploy, backup/restore и official-site operations.

## Следующие этапы

- Этап 07 добавляет catalog/trial-specific admin pages/items через
  `buildAdminNavigation`, не создавая новый shell или guard.
- Этап 08 добавляет request/document review pages; sensitive document reads
  требуют отдельного server authorization и audit.
- Этап 09 подключает contract pages и production
  `FamilyCorrectionContributor`; этап 10 добавляет price-review items; этап 11
  добавляет support/outbox diagnostics. Все они переиспользуют typed action,
  idempotency/assertion и safe-list patterns этапа 06A.
- Проверить первым: этот handoff, migration `0007`, `admin/contracts.ts`,
  `admin/navigation.ts`, `admin/mutation-repository.ts` и
  `admin/family-correction-repository.ts`.
- Нельзя добавлять generic `status` update endpoint, доверять actor/owner/FamilyID
  из hidden form, выводить raw import row/path/secret в admin JSON или запускать
  notification как побочный эффект catalog mutation.

## Итог worktree

- End `git status --short`: один логический stage-06A change; modified roadmap,
  canonical data model, i18n/styles и совместимый migration-list/e2e smoke;
  new migration, admin modules/routes, D1/unit tests и этот handoff.
- Diff summary: guarded extensible admin shell + bounded safe diagnostics/search
  - typed idempotent audited mutations + atomic FamilyID preview/apply + catalog
    and read-only pricing surfaces + German responsive UI + synthetic/browser
    coverage. Secrets, production IDs, raw PII, Office files и generated import
    artifacts не добавлены.
- Commit: `не создан без разрешения`.

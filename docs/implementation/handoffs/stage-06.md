# Handoff этапа 06: legacy claim и кабинет родителя

Статус: `done`

Production readiness: `feature_disabled`

## Baseline

- Branch: `master`.
- Start HEAD: `8a98f756f223671f85a21d1108d23547be88dea1`.
- Initial `git status --short`: clean.
- Предыдущий handoff: `docs/implementation/handoffs/stage-05.md`, status
  `done`; migration `0005`, verified sessions, CSRF/RBAC/owner guards и
  `PostVerificationExtension` приняты как prerequisites.

## Выполнено

- Requirement/acceptance IDs: `CLAIM-01`–`CLAIM-09`, `CAB-01`–`CAB-05`,
  `CHILD-01`–`CHILD-03`, `AUTH-08`, `CONTRACT-20`; разделы 2, 3, 3A и 6
  `ACCEPTANCE_CRITERIA.md`.
- Migration ID: `0006_family_claim_cabinet.sql`. Применённые migrations
  `0001`–`0005` не изменялись. Добавлены `family_claims`,
  `family_link_attempts`, `family_reassignments`, guarded finalization/
  transaction assertions, `child_correction_requests`, partial unique indexes,
  owner/family/alias triggers и informational `payment_arrangement`. Stage-05
  `email_outbox` forward-only пересобран с сохранением строк и server-only
  `legacy` recipient reference.
- Claim transaction contract при первом successful email verification:
  extension до batch читает ровно один current promoted legacy snapshot, а все
  mutation statements повторно guard-ят verification marker, token/user/email,
  version/import run и current promotion. Unique eligible exact email атомарно
  закрепляет namespace `1`, legacy family, claim и eligible current children;
  остальные случаи в том же batch выделяют следующий unique namespace `2`.
  Ambiguity/already-owned и каждый eligible parent-name match создают typed
  review. Последний `family_finalization_commits` assertion проверяет account,
  allocation, claim и snapshot children; lookup/storage/promotion race или
  неполный результат откатывает verification и consume token.
- Alternate-email contract: только unique eligible parent-name family с одним
  отличным current email получает `family_link_attempts` и client-safe mask.
  Полный адрес разрешается лишь dispatcher-ом по server-side reference после
  authenticated opt-in. D1 хранит scoped hash одноразового expiring token.
  Authenticated POST + session actor + CSRF запускает один batch: consume token,
  planned/applied reassignment, alias `2.*`, ownership namespace `1`, legacy
  claim, account и все owned/eligible legacy children, attempt, audit и финальный
  assertion. Concurrent/replay confirmation возвращает один applied result;
  stale/version/promotion/ownership race сохраняет namespace `2` и создаёт
  conflict review без partial merge.
- Cabinet interfaces для этапов 07–11: `CabinetService.load`,
  `CabinetRepository` owner-filtered profile/children/activity queries,
  `CabinetPricingService.summarize` и `CabinetReadModelContributor` со slots
  `trials`, `requests`, `serviceEngagements`, `contractOffers`,
  `contractHistory`, `threads`. Read model не выбирает notes/import/source IDs,
  исключает unclaimed и represented legacy duplicates, показывает legacy row
  как active service с `contractAvailable=false` и не создаёт PDF/contract.
- Child interfaces: `CabinetService.createChild` копирует current account
  FamilyID одной D1 batch; `updateChild` разрешает только owned portal child;
  legacy edit создаёт auditable correction/review. Opaque imported child IDs и
  UUID portal IDs повторно owner-check-ятся в SQL. Approved correction хранится
  в override fields и сохраняется при reimport. Branded/server-revalidated
  `ChildCorrectionAdminRepository.approve` подготовлен для admin surface этапа
  06A.
- Pricing/payment read model суммирует только known confirmed active
  `group|dance_group` base prices, считает unknown отдельно, выводит configured
  individual unit price и fixed funded-Nachhilfe contract tariff. External SEPA,
  manual payment no-later-than-7th и `not_applicable` остаются информационными;
  invoice/payable/debt/ledger/holiday calculation отсутствуют.
- Server/UI paths: `/cabinet` и `/cabinet/legacy-claim`; login теперь ведёт в
  кабинет, security page ссылается обратно. Все mutations POST + CSRF, German
  labels/messages находятся в i18n catalog, responsive cabinet styles добавлены
  в общий stylesheet.
- Environment/binding/config changes: новых bindings, env vars и secret values
  нет. Claim token использует stage-05 JWT secret и auth TTL/rate-limit/email
  settings; кабинет использует существующий pricing config.
- Feature flags/fail-closed: tracked production-shaped config по-прежнему имеет
  `AUTH_PUBLIC_ENABLED=false`; реальный email provider не подключён. Поэтому
  production registration/claim/cabinet не включались, несмотря на пройденные
  synthetic gates.
- Migration/rollback/restore compatibility: clean in-memory D1 применяет
  immutable sequence `0001`–`0006`. Remote migration, persisted local reset,
  rollback/restore rehearsal и deploy не выполнялись. Rollback остаётся restore/
  forward-fix операцией, а не переписыванием применённой migration.

## Проверки

| Команда/сценарий         | Результат                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`          | passed; `svelte-check found 0 errors and 0 warnings`                                                                                                                                                                                             |
| `npm test`               | passed; 19 files, 120 tests                                                                                                                                                                                                                      |
| `npm run build`          | passed; Vite SSR/client + Cloudflare adapter build                                                                                                                                                                                               |
| `npm run test:e2e`       | passed; 2 Chromium tests, German/mobile/protected-route smoke                                                                                                                                                                                    |
| Stage-06 D1 matrix       | passed; 6 integration tests: pre-verification neutrality, 0/1/multiple exact/name/email, already-owned, short/normal mask, TTL/rate limit/session/replay/concurrency, promotion race, child/correction/reimport, represented/unclaimed isolation |
| Security/read-model scan | passed; client bundle has no notes/source/import IDs or synthetic full legacy email; raw proof token absent from D1 token/outbox payload; `git diff --check` clean                                                                               |

## Не выполнено и риски

- Открытые вопросы/OQ: открытых owner/product OQ нет. Закрытые `OQ-002`,
  `OQ-004`, `OQ-027`, `OQ-028` реализованы как fixed MVP behavior.
- External/legal/operational release gates, не являющиеся OQ: production D1
  migration/backup/restore, real email provider/credentials, preview smoke и
  production enablement не выполнялись.
- Known failures: обязательные code/test/build и дополнительные browser/security
  проверки проходят; известных code failures нет.
- Сознательно вне scope: shared guardian access, parent editing upstream legacy
  PII, public catalog/trial, request/document flows, digital contracts/PDF,
  SEPA mandate/collection, billing/ledger/debt/holiday calculation, admin claim
  correction UI, production deploy и любые изменения официального сайта.
- Conflict/name/correction review tasks уже создаются, но operator surfaces и
  полная reason/confirm/idempotent family correction принадлежат этапу 06A.

## Release gates

| Gate                                 | Статус             | Affected path/flag                | Evidence                                                                      | Owner / next action                                       |
| ------------------------------------ | ------------------ | --------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| Stage-06 synthetic family/cabinet    | `passed`           | migration/services/routes/tests   | 120 tests, check/build/e2e и client scan                                      | stage 06A/07–11 могут расширять опубликованные interfaces |
| Production public auth/claim/cabinet | `feature_disabled` | `AUTH_PUBLIC_ENABLED=false`       | config fail-closed; fake/disabled provider не разрешает production enablement | stage 11/13: real provider + preview/release rehearsal    |
| Admin review/conflict resolution     | `feature_disabled` | review tasks без `/admin` surface | typed tasks/audit schema и correction repository проверены                    | stage 06A: guarded admin shell/handlers/search            |
| Remote D1 migration/restore/deploy   | `feature_disabled` | production resources              | remote commands не запускались                                                | stage 13/operator по отдельному разрешению                |
| Official-site changes                | `blocked`          | external CMS/code/links           | официальный сайт не изменялся                                                 | owner/operator только по прямому поручению                |

`feature_disabled` означает проверенное fail-closed выключение конкретного
production path, а не готовность полного MVP.

## Operator docs и rehearsal

- Актуальные tracked docs: `docs/README.md`, `docs/spec/MVP_SPEC.md`,
  `docs/implementation/ROADMAP.md`, `docs/architecture/DATA_MODEL.md`,
  `docs/domain/WORKFLOWS.md`, `docs/domain/COURSES.md`,
  `docs/domain/PRICING.md` и этот handoff. Production runbook остаётся этапу 13.
- Проверенные environment и дата: Windows, 2026-07-17, Node `v22.20.0`, npm
  `10.9.3`, Wrangler `4.109.0`, Vitest `3.2.7`.
- Clean-room walkthrough выполнен против isolated in-memory D1 с synthetic
  legacy snapshots/accounts и in-memory email provider. Реальные upstream
  Office-файлы, client PII, provider/resources и production данные не читались
  и не изменялись.
- Stop conditions: нет ровно одного current promoted legacy snapshot; version/
  promotion/family/owner guard устарел; candidate неоднозначен; попытка раскрыть
  полный alternate email; отсутствие session/CSRF; необходимость remote или
  production mutation.
- Намеренно не выполнены: provisioning, secrets, remote migrations, real email,
  deploy, backup/restore, admin bootstrap и official-site operations.

## Следующий этап

- Готовые prerequisites для 06A: migration `0006`, typed
  `admin_review_tasks` sources/reasons, immutable audit, current family aliases/
  claims/reassignments, owner triggers, `ChildCorrectionAdminRepository` и
  stage-05 branded `AdminActor`/deny-by-default route policy.
- Проверить первым: этот handoff, `stage-05.md`, migration `0006`, exact/late
  claim assertions, safe review summaries и `CabinetReadModelContributor`.
- Admin search/review не должен отдавать raw PII в списках; family correction
  обязан иметь preview, reason, repeated confirmation, idempotency и новый
  atomic assertion. Нельзя доверять actor/destination/free-form FamilyID из
  payload или тихо merge-ить collision/other-owned family.
- Следующий этап переоценивает gate admin review/conflict resolution; production
  public auth/email, remote deploy/restore и official-site gates остаются
  отдельными.

## Итог worktree

- End `git status --short`: один логический stage-06 change; modified auth/email,
  login/security UI, i18n/styles, roadmap и совместимые stage-03/04 fixtures;
  new migration, family/cabinet/pricing modules, cabinet routes, tests и этот
  handoff.
- Diff summary: guarded verification finalization + hashed alternate-email
  proof/reassignment + owner-scoped children/cabinet + safe pricing/payment read
  model + German UI + D1/unit/browser coverage. Secrets, production IDs, source
  PII, Office files и generated import artifacts не добавлены.
- Commit: `не создан без разрешения`.

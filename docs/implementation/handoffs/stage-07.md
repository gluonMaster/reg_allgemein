# Handoff этапа 07: каталог и trial workflow

Статус: `done`

Production readiness: `feature_disabled`

## Baseline

- Branch: `master`.
- Start HEAD: `d1011acd3b08a27f956918ba6829518dda0c2eca`.
- Initial `git status --short`: clean.
- Предыдущий handoff: `docs/implementation/handoffs/stage-06a.md`, status
  `done`; единый admin shell/RBAC, owner-safe cabinet, FamilyID и pricing/
  occupancy interfaces приняты как prerequisites.

## Выполнено

- Requirement/acceptance IDs: `SYS-01`–`SYS-03`, `CAT-01`–`CAT-04`,
  `TRIAL-01`–`TRIAL-05`, `AUTH-08`, `UI-01`, `TIME-01`; разделы 5, 6 и 10
  `ACCEPTANCE_CRITERIA.md`.
- Catalog query contract: публичный `/catalog` выбирает только current
  `academic_period`, published `schedule_version`, published course и current
  session; разрешены `group|dance_group|nachhilfe|individual`, а identity
  остаётся `course_groups.id` без объединения по `display_name`.
- Availability вычисляется на Berlin calendar date из effective capacity и
  contractual occupancy: `available|full|unknown|requires_admin_review`.
  Full/unknown/review принимают только ручную заявку без обещания места или
  waitlist. Public quote использует group engine для групп и non-group tariff
  semantics для Nachhilfe/individual.
- CTA: `group|dance_group` ведут в authenticated trial form;
  `nachhilfe|individual` формируют typed request intent. Сами request forms
  остаются scope этапа 08.
- Parent flow повторно проверяет verified active parent, assigned одинаковый
  account/child FamilyID, current owned child, published course/session и
  будущую дату на сервере. Submit и cancel атомарны, owner-scoped, idempotent и
  создают safe audit/assertion evidence. Cabinet показывает историю trials и
  разрешает отмену только `requested|confirmed`.
- Trial transitions:
  `requested -> confirmed|rejected|cancelled`;
  `confirmed -> attended|no_show|cancelled`;
  `attended -> converted`.
  `rejected|cancelled|no_show|converted` terminal. Один open trial на
  child/course; transition fence сериализует concurrent admin decisions.
- Admin actions встроены в общий `/admin` shell через navigation extension и
  typed `confirm|reject|cancel|attended|no_show|convert`. Confirm атомарно
  перепроверяет active owner/child FamilyID, current published course/session,
  actual future date, effective capacity и отсутствие active enrollment.
  Причина, idempotency record, audit и target assertion обязательны.
- Weekly session остаётся recurring schedule, а не обещанием календарной даты:
  holidays не вычисляются, `confirmed_date` задаёт только admin и после
  подтверждения она защищена от изменения вне разрешённого перехода.
- Boundary этапа 09: durable `trial_bookings.status='converted'` вместе с
  `user_id`, `child_id`, `course_group_id`, confirmed `session_id/date` и audit
  evidence является сигналом начала contract-offer workflow. Этап 07 не создаёт
  offer, contract или enrollment; любой trial status исключён из occupancy.
- Изменённые компоненты: catalog/trial repositories, services и runtimes;
  public/parent/admin SvelteKit routes; cabinet/admin extensions; route policy,
  i18n/CSS; public non-group quote dispatch; canonical data model и тесты.
- Migration ID: `0008_catalog_trials.sql`. Добавлены `trial_bookings`,
  append-only `trial_parent_actions`, `trial_transition_commits`,
  `trial_action_assertions`, indexes, unique fences и transition/ownership/
  immutability triggers. Миграции `0001`–`0007` не изменялись.
- Environment/binding/config changes: новых bindings, variables, flags и
  secret values нет.
- Feature flags/fail-closed production paths: tracked
  `AUTH_PUBLIC_ENABLED=false` сохранён; remote D1 migration и deployment не
  выполнялись, поэтому authenticated trial path в production не включён.
- Migration/rollback/restore compatibility: clean in-memory D1 применяет
  immutable sequence `0001`–`0008`. Remote rollback/restore не репетировался;
  для применённой migration используется restore/forward-fix, а не rewrite.

## Проверки

| Команда/сценарий | Результат |
| --- | --- |
| `npm run check` | passed; `svelte-check found 0 errors and 0 warnings` |
| `npm test` | passed; 23 files, 136 tests |
| `npm run build` | passed; Vite SSR/client и Cloudflare adapter build |
| `npm run test:e2e` | passed; 3 Chromium tests |
| Stage-07 D1 matrix | passed; periods/identity/CTA, all availability modes, quote pending/non-group tariff, owner/Familiennummer, full/past/duplicate/terminal, concurrent submit/confirm, audit/idempotency, no occupancy/enrollment side effects |
| Berlin date matrix | passed; strict calendar dates and both 2026 DST transitions |
| Review | `git diff --check` clean; DB tampering with confirmed date rejected |

## Не выполнено и риски

- Открытые вопросы/OQ: owner/product blockers отсутствуют. Решённый `OQ-008`
  соблюдён обязательным admin confirmation actual future date без holiday
  calculation; `OQ-027`/`OQ-028` переиспользованы через assigned FamilyID.
- External/legal/operational release gates, не являющиеся OQ: production D1
  backup/migration/restore, preview/prod smoke и deploy не выполнялись.
- Known failures: обязательные local/synthetic gates проходят; известных code
  failures нет.
- Сознательно вне scope: request forms/documents для Nachhilfe/individual
  (этап 08), waitlist и holiday calendar, offer/contract/enrollment activation
  (этап 09), official-site CMS/code/links и любые production operations.
- До этапа 08 CTA `/requests/new?kind=nachhilfe|individual` является стабильным
  intent URL без реализованной формы. Это не trial fallback.

## Release gates

| Gate | Статус | Affected path/flag | Evidence | Owner / next action |
| --- | --- | --- | --- | --- |
| Stage-07 local/synthetic workflow | `passed` | migration, catalog/trial/admin/cabinet routes | 136 tests, check/build/e2e и D1 assertions | этап 08 может использовать готовые child/catalog/admin boundaries |
| Production catalog/trial | `feature_disabled` | remote migration/deployment; `AUTH_PUBLIC_ENABLED=false` | production resources не менялись | этап 13/operator: backup, migrate, preview smoke и controlled release |
| Nachhilfe/individual request CTA destination | `feature_disabled` | `/requests/new?kind=...` | только typed intent, forms намеренно отсутствуют | этап 08 реализует owner-safe request/document flow |
| Contract conversion consequence | `feature_disabled` | `trial_bookings.status='converted'` | enrollment/occupancy count остаётся 0 | этап 09 создаёт offer только через contract workflow |
| Official-site changes | `blocked` | external CMS/code/links | официальный сайт не изменялся | owner/operator только по отдельному прямому поручению |

`feature_disabled` означает проверенное отсутствие production exposure либо ещё
не подключённый downstream workflow, а не production readiness полного MVP.

## Operator docs и rehearsal

- Актуальные tracked docs: `docs/README.md`, `docs/spec/MVP_SPEC.md`,
  `docs/spec/ACCEPTANCE_CRITERIA.md`, `docs/domain/COURSES.md`,
  `docs/domain/WORKFLOWS.md`, `docs/domain/PRICING.md`,
  `docs/architecture/DATA_MODEL.md`, `docs/implementation/ROADMAP.md` и этот
  handoff.
- Проверенные environment и дата: Windows, 2026-07-17, Node `v22.20.0`, npm
  `10.9.3`, Wrangler `4.109.0`, Vitest `3.2.7`.
- Clean-room walkthrough выполнен автоматическими unit/integration/Playwright
  тестами против synthetic in-memory D1. Client Office files, PII sources,
  secrets и production resources не читались и не изменялись.
- Stop conditions: неcurrent/unpublished/unsupported course, неowned или
  FamilyID-mismatched child, past date, stale session, duplicate open trial,
  full/unknown capacity на confirm, active enrollment, terminal transition,
  inactive admin/owner или требование production mutation.
- Намеренно не выполнялись provisioning, secrets, remote migrations,
  backup/restore, deploy и official-site operations.

## Следующий этап

- Готовые prerequisites: stable current catalog query, CTA intent, shared
  owner/child selector, cabinet contributor, admin navigation/RBAC and typed
  mutation/audit patterns.
- Этап 08 обязан первым проверить этот handoff, migration `0008`, route policy,
  `CatalogRepository`, `TrialService`, cabinet contributor и admin navigation
  extension; request routes не должны превращаться в trial.
- Stop conditions/blockers: private documents требуют отдельной server owner
  authorization, R2 quarantine/scan/audit boundary; нельзя логировать document
  content/PII или создавать contract/enrollment.
- Этап 09 обязан потреблять только audited `converted` trial, заново проверить
  owner/Familiennummer/pricing и создать offer через свой state machine, без
  прямой активации enrollment.
- Production gates остаются этапу 13/operator и не переоценены как passed.

## Итог worktree

- End `git status --short`: один логический stage-07 change; modified canonical
  docs/roadmap, shared pricing/admin/cabinet/security/UI/test files; new
  migration, catalog/time/trial modules, public/admin routes, D1/unit tests и
  этот handoff.
- Diff summary: current published catalog + availability/quote/CTA +
  owner-safe idempotent audited trial state machine + admin confirmation and
  concurrency fences + cabinet/UI integration + synthetic/browser coverage.
  Secrets, raw PII, Office files и generated import artifacts не добавлены.
- Commit: `не создан без разрешения`.

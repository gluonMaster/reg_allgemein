# Handoff этапа 01: foundation

Статус: `done`

Production readiness: `blocked`

## Baseline

- Branch: `master`.
- Start HEAD: `297b1298c7b6a607dff6ef1bbe58b1517f10e600`.
- Initial `git status --short`: пусто.
- Предыдущий handoff: отсутствует, это первый этап.

## Выполнено

- Requirement/acceptance IDs: foundation-покрытие для `SYS-01`–`SYS-03`,
  `SEC-01`, `SEC-02`, `REL-01`, `TIME-01`, `UI-01`, `OBS-01`; разделы 1, 1A и
  10 `ACCEPTANCE_CRITERIA.md`. Полная продуктовая приемка этих требований
  остаётся за последующими этапами и release gates.
- Изменённые компоненты: Cloudflare adapter/platform proxy, typed runtime config,
  canonical portal URL builder, D1 boundary, audit/redaction, request correlation,
  idempotency/rate-limit/lease repository, German i18n catalog, Vitest/Miniflare
  harness, Playwright smoke и local D1 scripts.
- Migration IDs: `0001_foundation.sql` создаёт `academic_periods`,
  `audit_events`, `admin_review_tasks`, `idempotency_records`,
  `rate_limit_buckets` и `operation_locks` с индексами/constraints; audit events
  защищены append-only triggers.
- Новые/изменённые interfaces и state transitions:
  `RuntimeConfig`/`RuntimeConfigError`, `DatabaseBoundary`, `AuditRepository`,
  `FoundationRepository`; idempotency outcomes
  `acquired|in_progress|replay|conflict`; operation lease использует возрастающий
  fencing token. Доменные state machines не добавлялись.
- Environment/binding/config changes без secret values: `APP_ENV` и
  `PORTAL_PUBLIC_ORIGIN` обязательны, `DB` обязателен во всех средах;
  preview/production дополнительно требуют `R2_BUCKET`, `ASSETS`, `BROWSER`,
  `JWT_SECRET`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`. Local platform
  proxy предоставляет `DB`/`R2_BUCKET` через `wrangler.local.toml`; примеры без
  production IDs находятся в `wrangler.example.toml` и `.dev.vars.example`.
- Feature flags и fail-closed production paths: отдельного feature flag на этом
  этапе нет. Невалидный/официальный-site origin, отсутствующий D1 и неполная
  preview/production binding/secret shape отклоняются. Ошибка D1 guard storage
  не превращается в разрешение sensitive operation.
- Migration/rollback/restore compatibility: это первая неизменяемая migration;
  stage 02 должен добавить `0002_*`, не изменяя `0001`. `db:reset:local` удаляет
  только ignored local D1 state. Remote migration, production rollback и restore
  не выполнялись.
- Удалён прежний no-op cron placeholder и post-build injection: stage 01 не
  объявляет cron/business jobs готовыми. Реальный scheduled handler должен быть
  добавлен вместе с конкретными идемпотентными задачами последующего этапа.

## Проверки

| Команда/сценарий               | Результат                                                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                | passed; `svelte-check found 0 errors and 0 warnings`                                                                                                                                            |
| `npm test`                     | passed; 6 files, 21 tests                                                                                                                                                                       |
| `npm run build`                | passed; Cloudflare adapter build завершён                                                                                                                                                       |
| `npm run test:e2e`             | passed; Chromium smoke 1/1, German page и correlation header                                                                                                                                    |
| Clean local D1                 | `db:reset:local` удалил state; `db:migrate:local` применил `0001_foundation.sql`, 18 commands                                                                                                   |
| Повтор migration/version check | повторный apply и `db:migrations:local`: `No migrations to apply`                                                                                                                               |
| `npm audit --omit=dev`         | passed; 0 vulnerabilities                                                                                                                                                                       |
| Prettier check                 | passed для package/config/src/tests/scripts/README                                                                                                                                              |
| Diff/security review           | `git diff --check` passed; production secrets, source PII и generated DB/build artifacts в tracked files не найдены; email/token-like строки существуют только как synthetic redaction fixtures |

## Не выполнено и риски

- Открытые вопросы/OQ: открытых OQ нет; новые решения не вводились.
- External/legal/operational release gates, не являющиеся OQ: production
  Cloudflare resources/secrets/final origin, remote Browser Run conformance,
  release manifest/link surfaces, backup/restore и cold-read operator rehearsal
  не проверялись.
- Known failures: отсутствуют в финальном локальном наборе проверок.
- Сознательно вне scope: users/auth tables и flows, importer, catalog, pricing,
  documents, contracts, messages/outboxes, cron jobs, production deploy/remote
  migrations и любые изменения CMS/DNS/кода/ссылок официального сайта.

## Release gates

| Gate                                  | Статус    | Affected path/flag              | Evidence                                                                           | Owner / next action                          |
| ------------------------------------- | --------- | ------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- |
| Stage-01 local foundation             | `passed`  | local config, D1, build/tests   | clean migration, 21 Vitest tests, Chromium smoke, build                            | stage 02 может использовать foundation       |
| Dependency snapshot                   | `passed`  | current lockfile                | `npm audit --omit=dev`: 0 vulnerabilities                                          | повторить clean install/audit перед release  |
| Production portal provisioning/config | `blocked` | production deployment           | production IDs, secrets и final HTTPS origin не предоставлялись и не запрашивались | stage 13/operator по отдельному разрешению   |
| Browser Run remote conformance        | `blocked` | future contract PDF path        | только typed binding; remote spike/quota/DPA не выполнялись                        | stage 09 и stage 13                          |
| Official-site link placement/rollback | `blocked` | external approved link surfaces | официальный сайт не изменялся; отдельного go-live поручения нет                    | owner/operator после portal release approval |

`feature_disabled` не использован: отсутствующие business routes не объявляются
готовыми и не подменяются формальным flag.

## Operator docs и rehearsal

- Актуальные tracked runbooks/версии: локальные команды foundation описаны в
  `README.md`; production runbooks этапа 13 ещё не создавались.
- Проверенные environment и дата rehearsal: Windows, Node `v22.20.0`, npm
  `10.9.3`, Wrangler `4.109.0`, Playwright `1.61.1`; local run 2026-07-15.
- Кто/что выполнило clean-room walkthrough: Codex выполнил local D1 reset/apply/
  repeat, Vitest, Chromium smoke и Cloudflare build; независимый оператор не
  привлекался.
- Неясные шаги, отсутствующие inputs и stop conditions: final production origin,
  Cloudflare resource IDs/secrets и разрешение на remote операции отсутствуют;
  при их отсутствии production operation должна остановиться.
- Production actions, которые намеренно не выполнялись без разрешения: deploy,
  remote D1 migration, resource provisioning, Browser Run remote call и изменение
  официального сайта.

## Следующий этап

- Готовые prerequisites: migration `0001`, local D1 apply/reset/list commands,
  `academic_periods`, audit/review/guard tables, parameterized DB boundary,
  synthetic Miniflare fixtures и test suites.
- Что обязательно проверить первым: HEAD/worktree и этот handoff; фактический
  список applied migrations; dependency policy/parser audit; current safe source
  profiles и только synthetic import fixtures для автоматических тестов.
- Stop conditions/blockers: migration history отличается от `0001`; parser
  несовместим с Workers/local separation или имеет неразрешённый high advisory;
  требуется чтение/исполнение macro-enabled Office через Excel/COM/LibreOffice;
  требуется production/официальный-site доступ.
- Release gates, которые следующий этап должен переоценить: dependency/parser
  advisory/license/maintenance и clean migration compatibility после `0002_*`.

## Итог worktree

- End `git status --short`:

  ```text
   M README.md
   M docs/implementation/ROADMAP.md
   M package-lock.json
   M package.json
   D scripts/inject-cron.js
   M src/app.d.ts
   M src/routes/+page.svelte
   D src/worker.ts
   M svelte.config.js
   M vitest.config.ts
   M wrangler.example.toml
  ?? .dev.vars.example
  ?? docs/implementation/handoffs/stage-01.md
  ?? migrations/
  ?? playwright.config.ts
  ?? scripts/reset-local-d1.js
  ?? src/hooks.server.ts
  ?? src/lib/
  ?? tests/
  ?? wrangler.local.toml
  ```

- Diff summary: один логический stage-01 change; unrelated user changes не было;
  ignored `.svelte-kit`, `.wrangler`, `node_modules` и Playwright artifacts не
  включены.
- Commit: `не создан без разрешения`.

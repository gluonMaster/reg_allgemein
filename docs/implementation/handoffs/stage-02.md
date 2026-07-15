# Handoff этапа 02: price и schedule imports

Статус: `done`

Production readiness: `blocked`

## Baseline

- Branch: `master`.
- Start HEAD: `a06496c1d05f200fbfe27d274c318ea426d949e1`.
- Initial `git status --short`: пусто.
- Предыдущий handoff: `docs/implementation/handoffs/stage-01.md`, статус `done`.

## Выполнено

- Requirement/acceptance IDs: `CAT-01`, `CAT-02`, `PRICE-01`, `SEC-02`,
  `REL-01`, `OBS-01`, технологические ограничения раздела 12
  `MVP_SPEC.md`; разделы 1, 4, 5 и 6 `ACCEPTANCE_CRITERIA.md` в границах
  price/schedule import. Public catalog UI, quote и repricing остаются за
  последующими этапами.
- Изменённые компоненты: локальные allowlisted parser-ы price XLSX/XLSM и
  schedule JSON/HTML comparison; canonical hashing/fingerprint; D1 import
  repository; dry-run/promote/status/rollback CLI; synthetic parser/D1 fixtures;
  локальная документация команд и dependency decision.
- Migration IDs: `0002_price_schedule_imports.sql` создаёт `import_runs`,
  `import_issues`, `schedule_versions`, `course_groups`, `course_sessions`,
  `price_versions`, `price_rules`, `version_promotion_events`, partial unique
  current-version indexes, immutable snapshot/history triggers и promotion
  fence triggers. `0001_foundation.sql` не изменялась.
- Новые/изменённые interfaces и state transitions:
  `price-workbook:1` и `schedule-json:1`; `ImportRepository`,
  `parsePriceWorkbook`, `parseScheduleSnapshot`; import run
  `staged -> validated -> promoted`, `staged|validated -> failed`; повтор
  считается `noop` только при уже `promoted` fingerprint. Promotion использует
  D1 lease/fencing и atomic `batch`; rollback атомарно переключает предыдущую
  опубликованную version и восстанавливает schedule current/retired projection.
  Price source columns фиксируются раздельно как `Preis -> yearly` и
  `Sonderpreis -> monthly`; `manual_override` importer не создаёт.
- CLI contracts:
  `db:period:local -- --academic-period ... --display-name ... --starts-on ... --ends-on ... [--current]`;
  `import:price:local|import:schedule:local -- --academic-period ... --action dry-run|promote [--source ...] [--html ...]`;
  `import:status:local -- [--run-id ...] [--limit ...]`;
  `import:rollback:local -- --source-kind price|schedule --academic-period ... [--to-version ...]`.
  Academic period всегда передаётся явно, source path не сохраняется в D1/report.
- Environment/binding/config changes без secret values: новых production
  bindings/secrets нет. Local platform proxy и import CLI используют один
  ignored persist root `.wrangler/state/v3`; `svelte.config.js` исправлен в
  соответствии с `db:migrate:local`/`db:reset:local`.
- Feature flags и fail-closed production paths: remote/production import,
  runtime upload и Worker filesystem path отсутствуют. CLI всегда открывает
  `wrangler.local.toml` с `remoteBindings: false`; unsupported workbook/schema,
  ambiguous header/ID, invalid rates, HTML mismatch и неверный fencing token не
  меняют current version.
- Migration/rollback/restore compatibility: clean D1 применяет неизменяемую
  последовательность `0001`, `0002`; повторный apply сообщает `No migrations to
apply`. Локальный `db:reset:local` удаляет только ignored D1 state. Domain
  rollback переключает опубликованную price/schedule version без удаления
  snapshots; remote migration, backup/restore и production rollback не
  выполнялись.

## Проверки

| Команда/сценарий                            | Результат                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                             | passed; `svelte-check found 0 errors and 0 warnings`                                                                                                                                                                                                                                                                                                                        |
| `npm test`                                  | passed; 9 files, 36 tests                                                                                                                                                                                                                                                                                                                                                   |
| `npm run build`                             | passed; Cloudflare adapter build завершён                                                                                                                                                                                                                                                                                                                                   |
| `npm run test:e2e`                          | passed; Chromium smoke 1/1                                                                                                                                                                                                                                                                                                                                                  |
| `npm audit`                                 | passed; 0 vulnerabilities с dev parser/tooling                                                                                                                                                                                                                                                                                                                              |
| Parser/license compatibility spike          | `read-excel-file@9.3.1`, MIT, Node `>=18`, sheet-specific read и exact numeric text; synthetic macro-enabled container/hidden sheet тесты passed; `xlsx@0.18.5` отсутствует                                                                                                                                                                                                 |
| Clean local D1                              | reset; `0001` (18 commands) и `0002` (31 commands) применены; repeat list: `No migrations to apply`                                                                                                                                                                                                                                                                         |
| Current safe price dry-run/promote/no-op    | source SHA-256 `55f48bbbc84270381815b6ff06c9360222121161245f66c5de08cf6820d54859`; version SHA-256 `7232afee64a97b1dc2d4abd94329aafe72e13606110f5c688c194ebed09c8c21`; 176 staged, 166 promoted, 10 safe vector-review warnings; repeat `noop`                                                                                                                              |
| Current safe schedule dry-run/promote/no-op | JSON SHA-256 `24062ff1fde2944b52e0413b19fca59184a6bbe0af7585cd1f6f5dd7172cfeb2`; HTML SHA-256 `77a59094a605b8ba731a2e8dac4d736caf6f697a267838db8a1cd5567913ba2b`; version SHA-256 `5f8f74d7a85a01bc8ddb94d0a32b84f6ba270e71f5a2bdf9747306238da2f6aa`; 112/112 HTML blocks matched, 112 promoted, duplicate display names preserved, one needs-review warning; repeat `noop` |
| Fatal/atomicity fixtures                    | unsupported schema, duplicate schedule ID, ambiguous price header, zero/negative/blank rates, failed fingerprint retry, concurrent same-fingerprint promotion, forged fencing token, soft-retire и rollback passed; current version unchanged on failures                                                                                                                   |
| Safe report/diff review                     | local status содержит только hashes/counts/codes/source record keys; synthetic email/phone/address отсутствуют; `npx prettier --check` и `git diff --check` passed; source workbook/JSON/DB artifacts отсутствуют в `git status`                                                                                                                                            |

## Не выполнено и риски

- Открытые вопросы/OQ: открытых OQ нет; новых product/business решений этап не
  вводил.
- External/legal/operational release gates, не являющиеся OQ: production
  resources/secrets/final origin, remote migration/import, backup/restore и
  cold-read production rehearsal не выполнялись.
- Known failures: финальные обязательные проверки проходят. Один дополнительный
  exploratory запуск `npm run test:unit -- --runInBand` был отклонён Vitest как
  неизвестный Jest-only flag; корректный `npm run test:unit` сразу после этого
  прошёл: 7 files, 23 tests.
- Safe current-source review issues: 10 price rows с несовпадающим количеством
  `Dauer/Faecher` сохранены как warnings и не стали publishable rules; одна
  schedule запись классифицирована `needs_review`. Полные source values в
  handoff/report не выводятся. Эти issues не подменены fallback или first-wins.
- Сознательно вне scope: Access/PlusBText client import, real XLSM structural
  contract stage 03, course mappings/occupancy/quote, public/admin UI, auth,
  production import/deploy и любые изменения официального сайта.

## Release gates

| Gate                                  | Статус             | Affected path/flag                           | Evidence                                                                                                      | Owner / next action                                         |
| ------------------------------------- | ------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Stage-02 local import                 | `passed`           | migration/parser/stage/diff/promote/rollback | clean D1, 36 tests, current safe references promoted и repeated as no-op                                      | stage 03 может использовать import boundary                 |
| Parser dependency                     | `passed`           | local dev-only XLSX/XLSM parser              | MIT/current package metadata, synthetic macro container, `npm audit` 0, Worker build не включает local parser | повторить audit и real PlusBText contract spike на stage 03 |
| Remote/production import              | `feature_disabled` | production/remote data mutation              | только local config/platform proxy; remote option/API/upload отсутствуют                                      | отдельный stage 13/operator gate и прямое разрешение        |
| Production portal provisioning/config | `blocked`          | production deployment                        | production IDs, secrets и final HTTPS origin не предоставлялись                                               | stage 13/operator по отдельному разрешению                  |
| Official-site link placement/rollback | `blocked`          | external approved link surfaces              | официальный сайт не изменялся                                                                                 | owner/operator после portal release approval                |

## Operator docs и rehearsal

- Актуальные tracked runbooks/версии: локальные period/import/status/rollback
  команды описаны в `README.md`; dependency boundary — в
  `docs/operations/DEPENDENCY_POLICY.md`. Production runbooks этапа 13 ещё не
  создавались.
- Проверенные environment и дата rehearsal: Windows, Node `v22.20.0`, npm
  `10.9.3`, Wrangler runtime `4.109.0`, Vitest `3.2.7`, Playwright `1.61.1`;
  local run 2026-07-15.
- Кто/что выполнило clean-room walkthrough: Codex выполнил reset/apply/repeat,
  explicit local academic-period creation, dry-run, promotion, no-op, safe
  status, tests/build/audit; независимый оператор не привлекался.
- Неясные шаги, отсутствующие inputs и stop conditions: final production
  origin/resources/secrets и разрешение на remote operations отсутствуют;
  production operation должна остановиться. Реальный PlusBText XLSM требует
  отдельного allowlist/source-contract fingerprint stage 03.
- Production actions, которые намеренно не выполнялись без разрешения: deploy,
  remote D1 migration/import, resource provisioning, source upload и изменение
  CMS/DNS/кода/ссылок официального сайта.

## Следующий этап

- Готовые prerequisites: migration `0002`, `import_runs/import_issues`,
  immutable fingerprints, attempt/retry linkage, D1 promotion lease/fencing,
  safe status reports, current price/schedule versions и normalized course
  offering/session snapshots.
- Ожидаемый adapter boundary: stage 03 local Access/PlusBText extractors читают
  только approved fields, возвращают normalized snapshot + safe issues и
  используют существующие run fingerprint/attempt/status/promotion contracts;
  Node filesystem/parser code не импортируется Worker runtime. Schema уже
  резервирует `source_kind=access|plusbtext`; stage 03 добавляет только новую
  migration для legacy staging/entities и source-specific repository methods.
- Что обязательно проверить первым: этот handoff, applied migrations `0001` +
  `0002`, current promoted price/schedule dependencies, наличие approved local
  Access/PlusBText paths и их exact hashes/structural profiles без вывода PII.
- Stop conditions/blockers: encrypted/unsupported XLSM, structural fingerprint
  drift, missing allowlisted `PlusBText` fields, необходимость Excel/COM/
  LibreOffice или VBA execution, Access driver/schema mismatch, unresolved high
  advisory либо production/официальный-site доступ.
- Release gates, которые следующий этап должен переоценить: real PlusBText XLSM
  allowlist/structural compatibility, parser audit/maintenance, dependency-set
  hashing Access + PlusBText и clean migration compatibility после `0003_*`.

## Итог worktree

- End `git status --short`: один логический stage-02 change; modified
  `README.md`, roadmap, dependency policy, package lock/config и foundation
  migration assertion; новые migration/import CLI/modules/tests и этот handoff.
- Diff summary: versioned import schema + local adapters/CLI + synthetic tests;
  unrelated user changes не было. Ignored raw price/schedule references,
  `.wrangler`, build/test artifacts и `node_modules` не включены.
- Commit: `не создан без разрешения`.

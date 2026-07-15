# Handoff этапа 03: Access и PlusBText import

Статус: `done`

Production readiness: `feature_disabled`

## Baseline

- Branch: `master`.
- Start HEAD: `fa99ee4469592d48173045e62b911c7f3ce9a572`.
- Initial `git status --short`: clean.
- Предыдущий handoff: `docs/implementation/handoffs/stage-02.md`, status
  `done`; текущие price/schedule versions и общие run/stage/diff/promote
  interfaces приняты как prerequisites.

## Выполнено

- Requirement/acceptance IDs: `CLAIM-01`–`CLAIM-09`, `SEC-02`, `REL-01`;
  `ACCEPTANCE_CRITERIA.md` разделы 3 и 4. Claim UI/API не реализовывался,
  но его atomic ownership prerequisites и continuity evidence сохранены.
- Измененные компоненты: Node-only readers/parser boundary для
  `tblKartei` Access и visible `PlusBText`; versioned legacy schema;
  family/child/source-row/enrollment aggregation; reconciliation repository;
  local CLI; synthetic fixtures и unit/D1 integration tests; operator README и
  dependency policy.
- Migration ID: `0003_access_plusbtext_imports.sql`. Добавлены immutable
  PlusBText/Access snapshots, canonical family-number allocations с раздельными
  `legacy_1`/`portal_2` namespaces, family-period/email/child/source-row/enrollment
  projections и fenced append-only promotion events.
- Adapter/CLI boundary: `mdb-reader@3.2.0` читает только `tblKartei`
  и точный field allowlist; PlusBText reader извлекает только container
  metadata, visible target worksheet/styles, referenced shared strings и columns
  `E/F/K/L/M/N/T`; parser получает санитизированный in-memory archive.
  Office/COM/LibreOffice, VBA execution, hidden sheets и full workbook dump не
  используются. Local commands: `import:plusbtext:local` и
  `import:access:local`; source обязателен через `--source` или
  `LOCAL_ADMIN_WORKBOOK_SOURCE`/`LOCAL_ACCESS_SOURCE`.
- Новые/changed interfaces и state transitions: `PlusBTextImportSnapshot` и
  `LegacyImportSnapshot`; `stagePlusBText`/`stageAccess`; version-aware diff;
  generalized promote/current/rollback для `plusbtext|access`; explicit promoted
  PlusBText dependency в Access fingerprint. Путь остался
  `extract -> normalize -> stage -> validate -> diff -> promote|noop`, а rollback
  переключает immutable version без удаления snapshot.
- PlusBText contract: independent old/target blocks; exact `L`, затем
  `F -> E -> K token -> target`, без physical-row fallback; `T` только
  positive integer minutes, blank/invalid — `null`, без fallback 90. Versioned
  value-free structural/logical/style fingerprints и synthetic golden hash добавлены.
- Access contract: exact raw `FamilyID` и source `ID` хранятся раздельно;
  repeated family rows aggregate; children use normalized name+birth identity; stable
  `main_next` и `package_1`–`package_5` slots; status classes normalized;
  `O/V`/`V/O` become ordinary `monthly` + `rule_derived` и не назначают
  `manual_override`. Parent match key version 1 создаётся только для
  однозначного `Surname, First`; raw name сохраняется.
- Reimport projection сохраняет claim/owner, manual course mapping,
  manual price override, child corrections и soft state; rename обновляет
  stable slot, missing rows soft-retire. Непротиворечивый claim может
  перейти на того же ребёнка нового периода; conflict сохраняет
  review evidence и не переносит owner.
- Safe issue codes не содержат source values. Основные группы:
  `PLUSB_*` container/sheet/header/dimension/fingerprint, old/target/K,
  duration/weekday/teacher и enrichment ambiguity; `ACCESS_*`
  container/table/required-field/type/ID, FamilyID/number collision, parent/contact/email,
  child/birth/duplicate slot, status/price/duration, `Value48`, continuity и stage failure.
  Status/report выводит только opaque IDs, hashes, counts, severity,
  codes и stable source record keys.
- Данные для этапа 06 без повторного upstream read: exact current promoted
  legacy/PlusBText version и dependency hash; stable raw FamilyID/numbering status;
  current family-period с raw parent data и versioned match status/key; normalized
  current email candidates; canonical children с source identity/birth date; current
  source rows и enrollments/services; continuity/review evidence. Import сам не
  назначает owner и не выполняет self-service claim.
- Environment/binding/config changes: новых Worker bindings/secrets нет;
  добавлены только local process environment names для read-only paths.
- Feature flags и fail-closed production paths: remote source/upload/import API
  отсутствует; CLI всегда использует local Wrangler D1. Production
  import/deploy не запускался.
- Migration/rollback/restore compatibility: clean in-memory D1 применяет
  immutable `0001`, `0002`, `0003`; tests покрывают promote/noop/
  rollback и atomic projection. Existing ignored local D1 не сбрасывалась,
  чтобы не удалять локальные stage-02 snapshots; remote migration и
  backup/restore не выполнялись.

## Проверки

| Команда/сценарий             | Результат                                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`              | passed; `svelte-check found 0 errors and 0 warnings`                                                                                                                                                                             |
| `npm test`                   | passed; 12 files, 58 tests                                                                                                                                                                                                       |
| `npm run build`              | passed; Cloudflare adapter build завершён                                                                                                                                                                                        |
| `npm audit`                  | passed; 0 vulnerabilities                                                                                                                                                                                                        |
| PlusBText synthetic fixtures | macro-enabled golden container, extra/hidden PII-like fields, exact/chain joins, duplicate/dangling/sparse/semicolon K, no row fallback, duration null/invalid/minutes, ambiguous enrichment и fail-closed contract cases passed |
| Access synthetic fixtures    | all six source slots, status classes, repeated/missing/colliding FamilyID, duplicate/missing ID, child/name/date/contact conflicts, Unicode parent normalization, `Value48`, dependency hash и invalid profile passed            |
| D1 reconciliation            | first promote, repeat/noop, rename, soft-retire, manual/claim preservation, rollback, orphan exclusion, cross-period inheritance и continuity quarantine passed                                                                  |
| PII/artifact review          | synthetic-only tests; safe status/issues assertions passed; no Access/XLSM/source dump/generated import artifact added                                                                                                           |

## Не выполнено и риски

- Открытые вопросы/OQ: открытых owner/product OQ нет; закрытые
  `OQ-004` и `OQ-010` применены без нового business rule.
- External/legal/operational release gates, не являющиеся OQ: реальные
  approved Access/PlusBText sources не читались, поэтому их exact
  schema/structural/source-hash dry-run остаётся operator gate. Production
  resources/secrets/origin, remote migration/import, backup/restore rehearsal не
  проверялись.
- Known failures: финальные обязательные проверки проходят; известных
  code/test failures нет.
- Сознательно вне scope: claim UI/API, auth/owner assignment, course mapping/
  occupancy/quote, active enrollments, price notifications, production import/deploy,
  upstream write и любые изменения official site.

## Release gates

| Gate                                     | Статус             | Affected path/flag                      | Evidence                                                                   | Owner / next action                                 |
| ---------------------------------------- | ------------------ | --------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| Stage-03 synthetic import/reconciliation | `passed`           | migration/parsers/repository/CLI        | 58 tests, check/build/audit, no PII artifacts                              | stage 04/06 могут использовать projections          |
| Real source conformance                  | `blocked`          | local approved Access/PlusBText sources | separate direct permission/source hashes не предоставлялись                | operator: read-only dry-run по отдельному поручению |
| Parser dependency                        | `passed`           | local dev-only parsers                  | exact allowlists, synthetic macro/profile negatives, Worker build, audit 0 | repeat audit/conformance before release             |
| Remote/production import                 | `feature_disabled` | remote mutation/upload path             | no remote option/API; local Wrangler config only                           | stage 13/operator по отдельному разрешению          |
| Production portal provisioning/config    | `blocked`          | production deployment                   | IDs, secrets, final origin не предоставлялись                              | stage 13/operator                                   |
| Official-site changes                    | `blocked`          | external CMS/code/links                 | official site не изменялся                                                 | owner/operator только по прямому поручению          |

## Operator docs и rehearsal

- Актуальные tracked runbooks/версии: local period/import/status/rollback
  команды описаны в `README.md`; parser/runtime boundary — в
  `docs/operations/DEPENDENCY_POLICY.md`; source contracts — в
  `docs/operations/DATA_SOURCES.md` и `references/data/*`.
- Проверенные environment и дата rehearsal: Windows, 2026-07-15, Node
  `v22.20.0`, npm `10.9.3`, Wrangler `4.109.0`, Vitest `3.2.7`, Playwright
  `1.61.1`.
- Кто/что выполнило clean-room walkthrough: Codex прогнал synthetic
  readers/parsers и clean in-memory D1 stage/promote/reimport/rollback; реальные
  sources и production resources не использовались.
- Неясные шаги, отсутствующие inputs и stop conditions: approved source paths
  и hashes не предоставлены; stop при encryption, schema/structural drift,
  need for Office automation/macros, unresolved source-key conflict, PII-capable
  logging/artifact и любом remote/upstream write.
- Production actions, которые намеренно не выполнялись: deploy,
  remote D1 migration/import, resource provisioning, source upload, upstream Access/
  XLSM write и official-site changes.

## Следующий этап

- Готовые prerequisites этапа 04: migration `0003`, current promoted
  PlusBText/legacy snapshots, stable source slots, normalized group names, duration/
  teacher/day enrichment, `course_group_id` preservation, review flags и current
  price/schedule projections этапа 02.
- Что обязательно проверить первым: этот handoff, migrations `0001`–`0003`,
  unknown/ambiguous `legacy_enrollments`, preservation of manual mapping и exact
  current price/schedule/legacy dependency set.
- Stop conditions/blockers: auto-mapping ambiguous/unknown group или price,
  rewriting imported raw identity, assigning owner from name/row number, losing manual
  mapping/override, or needing real/production source access.
- Release gates, которые следующий этап должен переоценить: clean
  migration compatibility, mapping ambiguity/manual preservation, dependency audit;
  real source/production gates остаются отдельными.

## Итог worktree

- End `git status --short`: один логический stage-03 change; modified
  README, roadmap, dependency policy, package lock/config, shared import CLI/repository/
  types/fixtures и foundation migration assertion; new migration, local parsers,
  legacy tests и этот handoff.
- Diff summary: Access/PlusBText versioned import schema + allowlisted local adapters +
  safe staged reconciliation + synthetic parser/D1 tests + operator documentation.
  Unrelated user changes не обнаружены; raw sources, `.wrangler`, build/test
  artifacts и `node_modules` не включены.
- Commit: `не создан без разрешения`.

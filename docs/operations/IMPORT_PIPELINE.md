# Import pipeline

Ревизия: 2026-08-24.

## Гарантии

Каждый import run должен быть:

- повторяемым и идемпотентным;
- привязанным к exact source SHA-256 и учебному периоду;
- staged и полностью проверенным до публикации;
- атомарным для runtime current version;
- наблюдаемым через безопасный report/issues;
- сохраняющим claim, manual mappings/overrides и audit;
- способным отметить исчезнувшие upstream records без физического удаления.

## Общий процесс

```text
extract -> normalize -> stage -> validate -> dry-run diff -> promote
                                      \-> failed (runtime unchanged)
```

1. **Extract.** Проверить source contract и считать только allowlisted fields.
2. **Normalize.** Создать deterministic source keys, values, warnings и hashes.
3. **Stage.** Записать version/run, не видимую runtime queries.
4. **Validate.** Проверить schema, IDs, references, duplicates, parsing и
   invariants.
5. **Dry-run diff.** Показать counts added/changed/retired/unmatched без raw PII.
6. **Promote.** В одной D1 transaction/atomic batch переключить current version,
   обновить `last_seen`/soft state и зафиксировать audit.

Только один promotion одного `source_kind + academic_period` выполняется
одновременно. No-op определяется только наличием уже `promoted` run с тем же
source hash, academic period и каноническим hash набора dependency versions.
`failed` run не блокирует новый attempt с тем же fingerprint. Тот же Access при
другой PlusBText version — новый run.

Academic period передается importer явно, например
`--academic-period 2026-2027`, и проверяется по `academic_periods`. Определять
период из имени файла, текущей даты или слова `future` запрещено.

## Порядок зависимостей

1. Price version.
2. Schedule version.
3. Access + конкретная PlusBText version.
4. Course mappings/price matching report.

Access staging возможен без готового mapping, но его promotion не должен
придумывать course/price. Unmatched records сохраняются с review issues.

## Production release актуальной PlusBText + Access pair

Нормативные требования: `IMPORT-01`–`IMPORT-08` из
[MVP specification](../spec/MVP_SPEC.md). Это отдельный target-pinned процесс;
локальные `import:plusbtext:local`/`import:access:local` не являются production
entrypoint. Ни одна команда ниже, включая remote reads, не выполняется против
preview/production без отдельного разрешения. `plan`, `verify` и
`recovery-evidence` делают remote reads; `plan`/`recovery-evidence` дополнительно
создают protected ignored local artifacts. `stage`, `review`, `promote`,
`rollback` и `roll-forward` меняют указанную D1 и разрешаются раздельно.
`confirmation` является локальной read-only проверкой config/target/artifacts/
clean HEAD: она не требует API token и не обращается к D1.

Общие обязательные границы каждого remote entrypoint:

- `--environment preview|production`, exact non-example `--config` и exact
  environment-specific `--database-id`; config обязан иметь `APP_ENV`, один
  binding `DB` и разные preview/production UUID;
- `CLOUDFLARE_API_TOKEN` передаётся только через process environment и не
  печатается/сериализуется; boundary хранит token в JS-private field;
- raw script требует явный `--remote`; package entrypoints ниже уже добавляют
  этот flag и не имеют local/implicit target fallback;
- Remote D1 API вызывается exact UUID endpoint с parameterized
  `{batch:[{sql,params}]}`. Batch response должен быть array; object допускается
  только для single query. Reads имеют bounded retry, request timeout меньше
  60 секунд и response body не больше 8 MiB; write не retry-ится автоматически;
- каждый phase требует clean worktree и exact HEAD из plan. Artifact создаётся
  только как regular non-symlink `imports/*.json` и защищается current-user ACL
  на Windows либо mode `0600` на POSIX;
- planner ≠ stager; reviewer отличается от обоих; transition operator
  отличается от reviewer; recovery verifier отличается от planner/stager/
  reviewer и promoter.

### 0. Явный academic period

`plan` является no-write import action, но он fail-closed, если переданный
academic period ещё не существует в exact remote D1. Период нельзя выводить из
текущей даты, имени файла или synthetic fixture. Data owner заранее утверждает
его code, display name, inclusive start/end dates и признак current.

Remote provisioning выполняется отдельной идемпотентной audited D1 mutation, не
direct SQL. Обе команды требуют exact non-example config/D1 UUID, clean exact
HEAD, opaque operator ID и caller-supplied canonical UTC timestamp. Сначала
локальная команда без network/D1 получает digest-bound typed confirmation:

> **Текущий gate заблокирован.** Все 1 BLOCKER/2 HIGH finding independent NO-GO
> candidate `73d41ab…` исправлены в local remediation worktree: actual protected
> preview config value-free проходит account/target guard, period/audit
> создаются атомарно, а ambiguous result имеет отдельный SELECT-only reconcile.
> Это ещё не разрешение на D1 write: `db:period:remote` нельзя запускать до нового
> immutable candidate, отдельного independent GO, утверждения всех period values
> и отдельного exact permission на одну preview D1 mutation.

```powershell
npm run db:period:confirmation:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --academic-period <APPROVED_PERIOD_CODE> --display-name "<APPROVED_DISPLAY_NAME>" --starts-on <APPROVED_YYYY-MM-DD> --ends-on <APPROVED_YYYY-MM-DD> --current --operator-id <OPAQUE_DATA_OWNER_ID> --created-at <CANONICAL_UTC_TIMESTAMP> --git-commit <FULL_GIT_SHA>
```

Только после independent review exact candidate и отдельного permission на одну
preview D1 запись допускается apply с теми же byte-exact аргументами:

```powershell
npm run db:period:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --academic-period <APPROVED_PERIOD_CODE> --display-name "<APPROVED_DISPLAY_NAME>" --starts-on <APPROVED_YYYY-MM-DD> --ends-on <APPROVED_YYYY-MM-DD> --current --operator-id <OPAQUE_DATA_OWNER_ID> --created-at <CANONICAL_UTC_TIMESTAMP> --git-commit <FULL_GIT_SHA> --confirmation <TYPED_CONFIRMATION>
```

Apply pin-ит child Wrangler process на positional exact D1 UUID, удаляет из его
temporary config resource selectors/secrets/vars и ограничивает child timeout.
Period и deterministic audit event создаются одной server-side atomic D1 batch;
terminal assertion принимает только exact `1 period / 1 valid audit`.
Byte-identical replay идемпотентен. Заранее занятый несовместимый audit ID,
existing code с другими полями либо другой current period дают
`ACADEMIC_PERIOD_REMOTE_ASSERTION_FAILED` без новой business mutation.

Timeout, transport loss, malformed/truncated/non-JSON stdout и неизвестная
post-dispatch result shape всегда дают
`ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS`. После этого исходные аргументы,
`--created-at` и `--confirmation` сохраняются byte-exact; write не повторяется.
Выполняется только следующая read-only команда с **теми же** значениями:

```powershell
npm run db:period:reconcile:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --academic-period <APPROVED_PERIOD_CODE> --display-name "<APPROVED_DISPLAY_NAME>" --starts-on <APPROVED_YYYY-MM-DD> --ends-on <APPROVED_YYYY-MM-DD> --current --operator-id <OPAQUE_DATA_OWNER_ID> --created-at <CANONICAL_UTC_TIMESTAMP> --git-commit <FULL_GIT_SHA> --confirmation <TYPED_CONFIRMATION>
```

| Reconcile outcome | Обязательное действие |
| ----------------- | --------------------- |
| `applied` | Exact period/audit pair уже зафиксирована; write не повторять, продолжить только в ранее разрешённом scope. |
| `not_applied` | Exact pair отсутствует; остановиться. Любая последующая apply требует отдельного осознанного решения и всё ещё действующего exact write permission; автоматический retry запрещён. |
| `conflict` | Обнаружено mixed/incompatible state; остановиться, не менять аргументы, не выполнять write/direct SQL и передать на расследование. |

Для production используются `--environment production` и exact production
config/UUID только после отдельного production/data-owner permission; preview
approval на production не переносится.

### 1. No-write plan

Ordinary preview никогда не принимает Office path. CLI сам создаёт 1703-row
synthetic Access extract через тот же allowlisted parser и synthetic PlusBText
v1 snapshot. `baseline` нужен для first-import/restore proof; `candidate` имеет
детерминированный safe delta и отдельные source/version hashes для последующего
promote→rollback→roll-forward. Их exact IDs:
`legacy-preview-synthetic-baseline-v1` и
`legacy-preview-synthetic-candidate-v1`:

```powershell
npm run import:legacy:plan:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --academic-period 2026-2027 --synthetic-variant baseline --git-commit <FULL_GIT_SHA> --operator-id <OPAQUE_PLANNER_ID> --created-at <CANONICAL_UTC_TIMESTAMP> --expected-access-rows 1703 --output imports/legacy-preview-baseline-plan.json
```

Preview artifact имеет schema v3, `sourceClass=synthetic_preview` и exact
`syntheticFixtureId`; переданные `--access-source`/`--plusbtext-source` либо
variant mismatch завершаются fail-closed. Production plan принимает только
`sourceClass=current_production` и имеет отдельную форму:

```powershell
npm run import:legacy:plan:remote -- --environment production --config <WRANGLER_PRODUCTION_CONFIG> --database-id <PRODUCTION_D1_UUID> --academic-period 2026-2027 --plusbtext-source <READ_ONLY_PLUSB_SOURCE> --access-source <READ_ONLY_ACCESS_SOURCE> --git-commit <FULL_GIT_SHA> --operator-id <OPAQUE_PLANNER_ID> --created-at <CANONICAL_UTC_TIMESTAMP> --expected-access-rows 1703 --output imports/legacy-production-plan.json
```

Production запрещает `--synthetic-variant`; preview запрещает оба source path.
Plan проверяет exact current pair, v1 contracts, structural fingerprints,
Access count и формирует safe diff. Stdout показывает лишь source class,
contracts и aggregate rows/diff/issues. Любое отличие 1703, 21/21 required
fields для current-source preflight, v1 logical PlusBText header или expected
current pair — stop; artifact вручную не исправляется.

### 2. Deterministic unpublished stage

Typed confirmation формируется реализованной локальной read-only командой. Она
валидирует config/target/protected plan/clean exact HEAD, не требует API token и
не обращается к D1:

```powershell
npm run import:legacy:confirmation:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --action stage --plan imports/legacy-preview-baseline-plan.json
```

```powershell
npm run import:legacy:stage:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --plan imports/legacy-preview-baseline-plan.json --synthetic-variant baseline --operator-id <OPAQUE_STAGER_ID> --confirmation <STAGE_CONFIRMATION>
```

`STAGE_CONFIRMATION` имеет форму
`LEGACY_IMPORT_STAGE_<ENV>_<D1_UUID>_<PLAN_DIGEST>`. Stage regenerates exact
preview fixture либо повторно парсит оба production read-only sources, сверяет
plan digest/source class/fixture ID, создаёт deterministic unpublished
run/version IDs, затем Access snapshot с exact dependency на новую PlusBText
version. Current pair не меняется. Safe result содержит `planId`,
`stagedDigestSha256`, aggregate diff/issues/rows.

При `delivery=ambiguous` нельзя менять plan/source или запускать новый import.
Сначала выполнить `verify`, затем повторить **точно ту же** stage-команду тем же
stager: validated deterministic state будет принят, failed incomplete staging
очистится с exact-actor append-only cleanup event и безопасно перестроится,
mixed run/version/hash завершится fail-closed. Plan нельзя удалить.

После применения candidate `0018` любой plan, созданный только под `0016` и
имеющий `NULL planned_by|staged_by` либо legacy `{}` verification contract,
остаётся неизменяемым evidence, но не может продолжить lifecycle. Не дополнять
его direct SQL: создать новый schema-v3 plan и заново пройти stage/review.

### 3. Immutable review

```powershell
npm run import:legacy:confirmation:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --action review --plan imports/legacy-preview-baseline-plan.json --staged-digest <STAGED_DIGEST>
```

```powershell
npm run import:legacy:review:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --plan-id <PLAN_ID> --staged-digest <STAGED_DIGEST> --reviewed-by <OPAQUE_REVIEWER_ID> --reason-code LEGACY_IMPORT_REVIEWED --reviewed-at <CANONICAL_UTC_TIMESTAMP> --confirmation <REVIEW_CONFIRMATION>
```

`REVIEW_CONFIRMATION` =
`LEGACY_IMPORT_REVIEW_<ENV>_<D1_UUID>_<STAGED_DIGEST>`. Reviewer сверяет safe
counts/diff/issues и immutable verification contract с reviewed release record;
free-form PII в `reviewed-by` или `reason-code` запрещена. Успех возвращает
immutable `reviewDigestSha256`.

### 4. Protected recovery evidence

До promote должен существовать отдельно проверенный recovery point и isolated
restore для exact target/current pair. Следующая read-only команда не создаёт
backup и не выполняет restore: она только связывает уже проверенное external
evidence с exact target/plan/review и создаёт protected artifact сроком не более
24 часов. Для first import `restored-current-pair=none`, для следующего —
`previous`:

```powershell
npm run import:legacy:recovery-evidence:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --plan-id <PLAN_ID> --review-digest <REVIEW_DIGEST> --recovery-method <d1-bookmark|d1-backup> --recovery-reference-digest <RECOVERY_REFERENCE_SHA256> --isolated-restore-database-id <ISOLATED_RESTORE_D1_UUID> --restore-verification-digest <RESTORE_VERIFICATION_SHA256> --restored-current-pair <none|previous> --verified-by <OPAQUE_RECOVERY_VERIFIER_ID> --verified-at <CANONICAL_UTC_TIMESTAMP> --valid-until <CANONICAL_UTC_TIMESTAMP> --output imports/legacy-preview-recovery.json
```

Произвольный 64-hex digest не принимается: promote читает сам artifact, сверяет
environment/account/D1/plan/review/current pair/freshness и независимость ролей.

### 5. Recovery-bound atomic promote

```powershell
npm run import:legacy:confirmation:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --action promote --plan imports/legacy-preview-baseline-plan.json --review-digest <REVIEW_DIGEST> --recovery-evidence imports/legacy-preview-recovery.json --operator-id <OPAQUE_PROMOTER_ID>
```

```powershell
npm run import:legacy:promote:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --plan-id <PLAN_ID> --review-digest <REVIEW_DIGEST> --recovery-evidence imports/legacy-preview-recovery.json --operator-id <OPAQUE_PROMOTER_ID> --confirmation <PROMOTE_CONFIRMATION>
```

`PROMOTE_CONFIRMATION` =
`LEGACY_IMPORT_PROMOTE_<ENV>_<D1_UUID>_<BINDING_DIGEST>`, где
`BINDING_DIGEST = SHA-256(canonical JSON {reviewDigestSha256,
recoveryEvidenceDigestSha256,operatorId})`. Promote получает PlusBText и Access
leases в фиксированном порядке и одним batch выполняет CAS expected-current,
projection, pair switch, run status, append-only events и audit. Recovery digest
обязателен для каждого promote и сохраняется в event/audit.

Сейчас `production` promote/rollback/roll-forward всегда останавливается с
`LEGACY_RELEASE_PRODUCTION_TRANSACTION_EVIDENCE_NOT_IMPLEMENTED` до чтения
Cloudflare API token и до network call. Не обходить этот guard: сначала
требуется отдельно разрешённое remote preview evidence.

### 6. PII-free verification

```powershell
npm run import:legacy:verify:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --plan-id <PLAN_ID>
```

Ожидаются `currentPair=target|previous|none`, `currentPairUnique=true`,
`dependencyCompatible=true`, `foreignKeyIntegrity=true`, exact immutable
planned-versus-actual run/source/snapshot/projection/issue counts и согласованные
event counts. Review/promote D1 triggers также fail closed при count drift,
error/fatal issue или нарушенной projection. Verify не возвращает source rows,
source hashes, client fields или token. `PRAGMA quick_check` и реальная remote
transactional/timeout semantics остаются отдельным preview evidence gate:
успешные local Miniflare tests их не доказывают.

### 7. Atomic rollback и roll-forward

Сначала локально получить каждую exact typed confirmation, используя тот же
protected candidate plan, review digest и transition operator:

```powershell
npm run import:legacy:confirmation:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --action rollback --plan imports/legacy-preview-candidate-plan.json --review-digest <REVIEW_DIGEST> --operator-id <OPAQUE_TRANSITION_OPERATOR_ID>
npm run import:legacy:confirmation:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --action roll-forward --plan imports/legacy-preview-candidate-plan.json --review-digest <REVIEW_DIGEST> --operator-id <OPAQUE_TRANSITION_OPERATOR_ID>
```

```powershell
npm run import:legacy:rollback:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --plan-id <PLAN_ID> --review-digest <REVIEW_DIGEST> --operator-id <OPAQUE_TRANSITION_OPERATOR_ID> --confirmation <ROLLBACK_CONFIRMATION>
npm run import:legacy:roll-forward:remote -- --environment preview --config <WRANGLER_PREVIEW_CONFIG> --database-id <PREVIEW_D1_UUID> --plan-id <PLAN_ID> --review-digest <REVIEW_DIGEST> --operator-id <OPAQUE_TRANSITION_OPERATOR_ID> --confirmation <ROLL_FORWARD_CONFIRMATION>
```

Confirmations связывают action/environment/UUID и canonical hash exact review +
operator. Оба действия переключают только совместимую pair и затем требуют
`verify`. При первом import previous pair отсутствует, поэтому logical rollback
возвращает `LEGACY_RELEASE_ROLLBACK_TARGET_MISSING`; восстановление выполняется
только по заранее проверенной внешней recovery процедуре. При любой
неоднозначной write delivery оператор не запускает обратную/новую команду, пока
`verify` не определит фактическое состояние; повтор completed deterministic
transition является idempotent.

Обязательный synthetic preview gate состоит из двух review-bound plans. Сначала
`baseline` проходит plan→stage→review→recovery-evidence(`none`)→promote→verify и
доказывает first-import restore. Затем новый `candidate` plan при текущем
baseline проходит stage→review→recovery-evidence(`previous`)→promote→verify→
repeated promote reconciliation→rollback→verify→roll-forward→verify, включая
timeout-after-commit reconciliation. Оба используют встроенные fixtures и
сохраняют только sanitized evidence. Production остаётся NO-GO, пока preview,
restore, legal/provider и остальные release gates не закрыты.

## Price import

- найти единственный header row по именам;
- читать data из логических columns, пропуская полностью пустой formatted tail;
- parse decimal EUR в cents без binary-float;
- сохранить ordered subject-duration vector;
- валидировать non-empty key, positive integer child count и обе positive
  integer ставки в cents; zero/negative yearly или monthly source rate создаёт
  validation error, блокирует публикацию этой price version и не превращается в
  бесплатное занятие, fallback или `manual_override`;
- duplicate normalized rules без однозначного winner пометить ambiguous;
- не менять active version при fatal/error threshold;
- импортировать обе source-ставки без назначения клиенту: contract kind позже
  выбирает `Preis` (yearly) или `Sonderpreis` (monthly); не создавать
  `manual_override`/discount из notes.

Stable row key внутри immutable version:

```text
price:{price_version_hash}:{source_row_number}
```

Перестановка строк создает новую version, но не мутирует snapshots старой.

## Schedule import

Primary JSON contract дает:

```text
schedule:{source_namespace}:{source_block_id}
```

`generation_id` определяет snapshot version, но не добавляется в identity
offering. Day/time/teacher/room/display name — mutable attributes и не могут
входить в stable identity.

Validation:

- поддерживаемый `schema_version`;
- unique non-empty block IDs;
- parseable day/start/end и positive duration;
- required subject/group/building fields;
- count и field comparison с HTML reference;
- diff IDs/attributes с current published version;
- placeholder/unknown types скрываются как `needs_review`;
- одинаковые display names не объединяются.

Отсутствующий в полном успешном snapshot block получает retired/`is_current=false`
в новой version. Active contract сохраняет свой snapshot и создает admin review,
если расписание затронуто.

## Access import

### Source rows

- проверять `ID` как non-null unique Access row key;
- сверять `Value48` mirror; mismatch/duplicate — issue;
- `Value4=Zahlung` не создает child/enrollment;
- строки без child для непустой activity quarantine/skip с warning;
- phone сохраняется как text; даты tolerant parse принимает validated ISO,
  German `D.M.YYYY`, native Date и строгий пятизначный Access/OLE Automation
  serial (epoch `1899-12-30`). Decimal/negative/short/long serial drift остаётся
  invalid и создаёт issue;
- email normalizes trim/lower, но raw сохраняется для admin verification;
- parent `Value2` сохраняется raw; normalizer v2 принимает ровно две valid части
  через одну `;`, `,` либо один пробел; slash/multipart остаётся ambiguous;
  versioned normalizer создаёт separate first-name/last-name match key только при
  детерминированном разборе, иначе
  `parent_name_match_status=ambiguous|unavailable` и self-service name-match
  запрещён;
- `Value15`–`Value20` извлекаются вместе: `O/R/S` дают future group/current
  imported price/contract marker, `T` — activity code;
- package groups текущего блока читаются из `Value37–Value40` (`AK–AN`),
  будущего — из `Value42–Value45` (`AP–AS`); importer 2026–2027 использует
  future block;
- `Value46/AT` остаётся в текущем future-period allowlisted source snapshot, но
  всегда игнорируется как service-marker cell независимо от содержимого и не
  создаёт enrollment, PlusBText lookup или issue. `Value41/AO` не входит в этот
  exact future-period extract и при будущем current-block import должен
  игнорироваться по тому же правилу.

Stable keys:

```text
access:{source_namespace}:{academic_period}:{ID}:main_next
access:{source_namespace}:{academic_period}:{ID}:package:{1..4}
```

Group name hash не входит: исправление/переименование обновляет тот же slot
внутри периода. Стабильность Access `ID` между periods не предполагается;
совпавший ID нового периода не обновляет source row прошлого периода.

### Family и child aggregation

- Stable family key = namespace + `Value1`; отдельный family-period snapshot =
  stable family + academic period;
- raw `Value1` сохраняется без удаления точки/пробела в legacy namespace 1;
  online-only family использует отдельную namespace 2. Family-number allocation
  и printable contract format `1. 3477-1`/`2. 0001-1` валидируются отдельно, а
  collision не объединяет source families;
- missing/colliding/unapproved FamilyID сохраняет affected rows в staging/source
  review, но не создаёт canonical child/enrollment без `family_number_id`;
- все distinct family emails сохраняются, conflicts становятся issues; один
  account/email с несколькими FamilyID и одна name-family с несколькими usable
  emails не выбираются автоматически на claim-слое;
- child merge только внутри stable family по normalized name + birthdate;
- точное непротиворечивое совпадение FamilyID нового периода наследует claim/
  owner; редкая ID/contact/child collision создаёт continuity review;
- row ID остается на `legacy_source_rows/enrollments`, не на child identity;
- duplicate main/package child/course учитывается один раз и даёт warning с
  opaque source key, distinct-row count и main/package pattern;
- пользовательские corrections/claim owner не перезаписываются reimport.

### Status и occupancy

- blank future `O` не создаёт enrollment; `T=KN` inactive;
- `T=NH/N/IND` задаёт hourly kind и не требует PlusBText duration/group price;
- для ordinary/dance group token `O/V` (`V/O` alias) в `S` означает monthly,
  любое `S` без token — yearly; provisional monthly из blank `T` запрещён;
- positive `R` является current imported legacy price и имеет приоритет над
  price-table lookup существующей service; zero/invalid active group price review;
- legacy occupancy меняется только после course mapping и successful promotion;
- promotion не рассылает price changes: он создает internal review batch/task.

## PlusBText enrichment

- run фиксирует PlusBText hash и Access hash;
- run отдельно фиксирует
  `source_contract_id/version + structural_fingerprint` из
  [PlusBText contract](../../references/data/plusbtext-contract.md); изменение
  content hash создаёт новый run, structural drift блокирует staging;
- XLSM читается неисполняющим Node parser без Office/COM/LibreOffice и без
  запуска/импорта embedded VBA;
- extractor открывает только allowlisted `PlusBText` fields из source contract;
  hidden/veryHidden sheets и extra columns не попадают в stage/report;
- encrypted/unsupported workbook, missing sheet/column и schema/profile mismatch
  завершаются до stage/promotion;
- old `E/F` и target `K/L/M/N/T` обнаруживаются как независимые blocks по
  anchor rules; row-wise/neighbor lookup запрещён;
- exact normalized candidates ищутся в `L`, затем fallback join выполняется как
  `F -> E -> token in K -> target row`;
- zero match → unresolved issue;
- multiple matches/conflicting teacher/day/duration → ambiguous issue;
- identical duplicate candidate collapse даёт warning; dangling K, missing
  attributes и duplicate/conflicting mapping не получают default;
- present positive integer `T` нормализуется как verified minutes; blank
  сохраняется `null` и никогда не заменяется 90 на import/staging layer;
- first-row wins запрещен;
- package импортируется даже без enrichment, но не получает выдуманные fields.

## Missing и changed records

После полного successful snapshot:

- seen records получают `last_seen_run_id`;
- unseen records получают `is_current=false`/`retired_at`;
- физическое удаление не выполняется;
- claimed family owner и historic contract/quote snapshots сохраняются;
- manual mapping/override остается, но помечается review, если source target
  исчез;
- partial/failing run не retires ничего.

## Issues и отчеты

Минимальный report:

- rows read/staged/promoted/skipped;
- added/changed/retired counts;
- fatal/errors/warnings by code;
- unmatched/ambiguous families, children, groups, durations, price rules;
- duplicate IDs/emails/sessions;
- dependency versions/hashes;
- validation/promotion timestamps.

Report не содержит полный source row, email, phone, address, child name, document
body или local workstation username/path. `source_record_key` позволяет найти
строку локальным инструментом.

Fatal examples:

- missing table/sheet/required column;
- unsupported schema version;
- duplicate/null Access `ID`;
- duplicate/null schedule block ID;
- несколько price header rows;
- невозможность завершить atomic promotion.

Warnings/review examples:

- `ID`/`Value48` mirror mismatch;
- conflicting family contacts;
- invalid email/DOB с traceable source key без auto-link/invalid child import;
- ambiguous child/group/price/duration;
- missing PlusBText enrichment;
- unknown status or placeholder course.

Actionable issue не закрывается generic `resolve|dismiss`. Его stable identity
переходит в durable cross-import case, а допустимое typed действие, проверка
следующим immutable import, grouping, assignment, audit и PII-minimized UI
определены в
[IMPORT_ADMIN_RECONCILIATION_TZ.md](../implementation/IMPORT_ADMIN_RECONCILIATION_TZ.md).
`IMPORT-08` локально реализован migrations `0019`–`0022`, stable manifest
reconciliation, typed repository/D1 transitions и
`/admin/import-reconciliation`. Generic closure для linked actionable occurrence
запрещён; exact candidate/current pair требует live typed evidence, а old-run
replay не закрывает более новый case. Exact run/version completion marker
записывается только после materialization всех actionable issues; crash до
marker блокирует promotion/registration, а поздняя mutation issues запрещена.
Child correction требует exact source child key; same-service duplicate
supersede-ит mutable peer price-review и блокируется при applied peer.
Queue/export не выводят raw source values, и export применяет filters ко всему
результату. До нового immutable exact-SHA review, отдельного preview rehearsal,
independent admin review и owner decisions этот workflow не является production
evidence; bulk-dismiss запрещён.

## Конкурентность

- promotion lock защищает current version и хранится как D1 lease с fencing
  token согласно `ADR-010`;
- claim использует conditional unique family owner;
- claim во время reimport видит только current promoted data;
- activation использует unique active child/course и conditional status;
- outbox/review creation имеет dedupe keys;
- два параллельных run с одинаковыми source/period/dependency hashes не
  публикуются дважды.
- временно упавший attempt можно повторить с тем же fingerprint; audit связывает
  retry через `retry_of_run_id`.

## Запреты

- source `.accdb/.mdb/.xlsm` и PII artifacts не коммитятся;
- client Office-файлы не открываются через Excel/COM/LibreOffice automation,
  embedded macros/VBA не исполняются и полный workbook/VBA не сериализуется;
- Worker не читает local filesystem;
- не удалять upstream-missing records без soft state/audit;
- не выбирать первую неоднозначную строку;
- не считать unknown price нулем;
- не публиковать failed/staging version;
- не запускать production import/deploy без отдельного разрешения и backup.

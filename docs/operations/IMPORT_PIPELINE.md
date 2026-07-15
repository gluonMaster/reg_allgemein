# Import pipeline

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
- phone сохраняется как text, даты tolerant parse в ISO;
- email normalizes trim/lower, но raw сохраняется для admin verification;
- parent `Value2` сохраняется raw; versioned normalizer создаёт separate
  first-name/last-name match key только при детерминированном разборе, иначе
  `parent_name_match_status=ambiguous|unavailable` и self-service name-match
  запрещён;
- `Value15`–`Value20` извлекаются вместе;
- `Value42`–`Value46` обрабатываются все пять.

Stable keys:

```text
access:{source_namespace}:{academic_period}:{ID}:main_next
access:{source_namespace}:{academic_period}:{ID}:package:{1..5}
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
- duplicate main/package child/course учитывается один раз и дает warning;
- пользовательские corrections/claim owner не перезаписываются reimport.

### Status и occupancy

- `KN` inactive;
- `NH/N/IND` не monthly group;
- неизвестный status допускает provisional mapping только при однозначной
  классификации, иначе review;
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
- ambiguous child/group/price/duration;
- missing PlusBText enrichment;
- unknown status or placeholder course.

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

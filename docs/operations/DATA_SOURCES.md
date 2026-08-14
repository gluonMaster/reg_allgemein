# Источники данных

Ревизия: 2026-08-14.

Локальные upstream-файлы считаются read-only. Они могут находиться в
игнорируемом рабочем каталоге для ручной проверки, но не попадают в Git,
runtime Worker, CI artifacts или диагностические логи. В tracked-части
repository находятся только безопасные обезличенные reference-профили.

## Access: legacy-клиенты

Локальный источник задаётся вне repository через `LOCAL_ACCESS_SOURCE`,
например абсолютным путём к актуальному `KindElternDaten_*_front.accdb`:

```text
<LOCAL_ACCESS_SOURCE>
```

Таблица `tblKartei` читается напрямую из bytes неисполняющим allowlisted
парсером; Microsoft Access/Excel/COM/LibreOffice не запускаются. Проверенный
обезличенный schema profile:
[access-schema-profile.md](../../references/data/access-schema-profile.md).
Sanitized preflight актуального 2026 snapshot от 2026-08-13 подтвердил 1703
source rows, наличие 21/21 обязательных полей и совместимость с
`access-tblkartei:1`. Эти counts являются release-plan precondition текущего
импорта, а не вечной business-константой; значения строк, source hash и локальный
absolute path в tracked docs/report не сохраняются.

### Identity

- `ID` — уникальный технический ключ строки Access в текущем snapshot;
- `Value1` — FamilyID, повторяется у строк одной семьи и не является row ID.
  Raw display имеет вид, например, `1. 3477` (точка и пробел значимы для
  отображения) и стабилен между годами в namespace 1. Online-only families
  получают отдельную namespace 2 с display `2. 0001`; contracts печатаются как
  `1. 3477-1`/`2. 0001-1`. Allocation/alias policy не меняет source identity;
- `Value48` — зеркало Excel `AV/ID`, которое нужно сверять с `ID`, но нельзя
  использовать вместо него без проверки.

Проверка 2026-07-10 обнаружила, что `ID` заполнен и уникален в текущем периоде,
но у `Value48` встречаются mismatch/duplicate. Поэтому importer использует
namespace + academic period + `ID`, а mismatch/duplicate `Value48` записывает
как issue. Номер строки и имя группы identity не являются; стабильность `ID`
между периодами не предполагается.

### Семья и ребенок

- `Value1` — FamilyID/Konto;
- `Value2` — имя/ФИО родителя;
- `Value4` — имя/ФИО ребенка;
- `Value5` — дата рождения ребенка;
- `Value6` — адрес;
- `Value7` — телефон;
- `Value8` — мобильный;
- `Value9` — email.

`Value2` может участвовать только в post-verification candidate flow. Importer
хранит raw value и создаёт versioned normalized фамилия+имя key лишь при
однозначном разборе; ambiguous/unavailable value не становится публичным
совпадением и уходит в admin review. `Value9` нормализуется для exact-email и
alternate-email proof, но полный адрес не показывается parent: UI получает
только маску по `CLAIM-06`.

`Value4 = Zahlung` означает служебную строку, не ребенка/enrollment. Даже если
текущий Access export таких строк не содержит, фильтр обязателен как защита от
другого snapshot.

Address/phones импортируются только для ручной сверки и contract prefill после
claim. Они не перезаписывают подтвержденный профиль пользователя и не
показываются до claim.

Один child может иметь несколько Access rows. `ID` идентифицирует строку
занятия, не ребенка. Child merge допускается только внутри FamilyID по
нормализованному имени + дате рождения; конфликт идет в review.

### Будущий учебный период

- `Value15` — будущая основная группа;
- `Value16` — преподаватель;
- `Value17` — день;
- `Value18` — плановая цена;
- `Value19` — примечание;
- `Value20` — статус/тип договора.

`Value20` нельзя исключать из extract: без него невозможно убрать `KN` и
классифицировать `NH/N/IND`.

Additional future packages: `Value42`–`Value46`, включая package 5.

### Status normalization

- `KN` — inactive, не участвует в occupancy;
- `J` — yearly для подтвержденной ordinary/dance group;
- `M` — monthly для подтвержденной ordinary/dance group;
- `O/V` или `V/O` — legacy monthly marker; использует месячную ставку из
  исторически названной колонки `Sonderpreis`, но не означает льготу;
- `NH`/`N` — Nachhilfe, не group monthly/yearly;
- `IND` — individual;
- `0`, пустое/неизвестное — не догадка: для надежно классифицированной обычной
  group допускается provisional monthly с warning; иначе admin review.

Сначала определяется lesson kind, затем contract kind и price source. Legacy
`Value18` сохраняется независимо от возможности нового lookup.

## Excel: PlusBText

Проверенный upstream задаётся вне repository через
`LOCAL_ADMIN_WORKBOOK_SOURCE`:

```text
<LOCAL_ADMIN_WORKBOOK_SOURCE>
```

Опциональная byte-identical локальная копия в рабочем каталоге:

```text
references/excel_admin/KindElternDaten_26_Admin.xlsm
```

Копия игнорируется Git. Её структурный и macro-risk profile:
[admin-workbook-profile.md](../../references/data/admin-workbook-profile.md).
Детерминированные row/join/drift rules:
[plusbtext-contract.md](../../references/data/plusbtext-contract.md). Новый
content hash создаёт новый import run; только structural contract/fingerprint
drift требует fail-closed review.

Используется только sheet `PlusBText`:

- `E/F` — независимый блок ID/name старой группы;
- `K/L/M/N/T` — разреженный target block: old-ID token list, имя новой группы,
  teacher, weekday, duration.

Логический header `admin-xlsm-plusbtext:1` остаётся
`E/K/T empty; F/L/M/N present`. Styled blank OOXML cell может быть
self-closing `<c .../>`; parser обязан считать её отдельной пустой cell, не
поглощая следующую populated cell. Sanitized preflight 2026-08-13 после
regression fix подтвердил v1 compatibility; parser defect не является
основанием для v2 contract.

Эти блоки не связаны физическим row number. Для future packages сначала ищутся
все exact normalized new-group candidates в `L`; fallback выполняет join
`F -> E -> token in K -> L/M/N/T`. Duplicate/conflicting candidates,
dangling IDs и missing attributes создают issue; first/same/neighbor-row wins
запрещён. Непустое positive `T` трактуется как минуты. Blank остаётся source
`null`; 90-minute estimate применяется только quote layer для уже
классифицированной group service. Access import фиксирует content hash и
source-contract version.

Эти current production sources никогда не используются в ordinary preview.
Remote preview release CLI не принимает их paths и генерирует только встроенные
`legacy-preview-synthetic-baseline-v1`/
`legacy-preview-synthetic-candidate-v1` с
`sourceClass=synthetic_preview` и 1703 synthetic Access rows. Production plan
фиксирует `sourceClass=current_production` и требует оба read-only sources.

Полный workbook содержит множество sheets, включая hidden/veryHidden с PII, и
крупный неподписанный VBA-проект с auto-run, filesystem, Access/Outlook и
shell-интеграциями. Точные operational counts не публикуются. Importer обязан:

- использовать только неисполняющий parser, без Excel/COM/LibreOffice;
- никогда не запускать, не импортировать и не компилировать embedded VBA;
- читать только allowlisted sheet/columns, даже если parser по умолчанию
  десериализует всю книгу;
- не создавать полный workbook/VBA dump и не передавать файл в Worker/CI;
- fail closed при encrypted/unsupported container, missing allowlisted field
  или неожиданной schema.

## Прайс

Локальный read-only source: `references/pricing/Price.xlsx`. Файл игнорируется
Git из-за Office metadata/external links; публичный manifest находится в
`references/pricing/README.md`.

Текущий contract:

- sheet `Tabelle8`;
- metadata row 1, header row 2;
- data columns `D:J`;
- `Key`, `Preis`, `Dauer`, `Faecher`, `Sonderpreis`, `Kinder`;
- formatted blank tail не является data.

`Preis` — monthly fee для yearly group contract; `Sonderpreis` — monthly fee
для monthly group contract. Настоящий exceptional `manual_override` не
импортируется из workbook.

Подробная семантика: [PRICING.md](../domain/PRICING.md). Importer должен найти
header по именам, а не использовать первую строку `sheet_to_json`.

## Расписание

Этот раздел описывает read-only upstream для отдельного регистрационного
портала. Страницы расписания на `kolibri-dresden.de` не являются importer input,
runtime source of truth или deployment target. Их нельзя скрейпить, перезаписывать
или редактировать как часть import/publish pipeline портала.

Основной текущий machine-readable source находится только в локальной
игнорируемой рабочей копии:

```text
references/schedule/group_occupancy_snapshot.json
```

Несмотря на имя, файл описывает schedule blocks, а не фактическое число
записанных детей. Он содержит `schema_version`, `generation_id`, `generated_at`
и для каждого block уникальный `id`, day, building, room, start/end, type,
subject, teacher и display group (`students`). Operational count не публикуется.

Визуальная контрольная копия:

```text
references/schedule/enhanced_schedule_visualization.html
```

HTML содержит те же blocks, но `.lesson-subject` отсутствует у части записей и
нет такого же надежного versioned contract. Поэтому HTML не
является primary importer input. Он используется для count/field comparison и
ручной визуальной проверки.

Финальный `PORTAL_PUBLIC_ORIGIN` и утверждённый перечень внешних surfaces
официального сайта, где должна появиться обычная ссылка на портал,
являются approved release inputs. Они не выводятся из локального HTML, имён
файлов или предположений агента. Их размещение/замена на сайте требует
отдельного прямого поручения и не является частью import promotion.

Стабильность block `id` между следующими generation должна быть подтверждена
exporter contract. До этого любое исчезновение/смена IDs показывается в diff и
требует review перед promotion.

## VBA reference

Локальная игнорируемая папка `references/pricing/vba/` содержит curated
reference-логику. Это не верифицированная точная выгрузка текущего Admin XLSM:
сопоставимые модули могут структурно различаться. Особенно важны:

- `SJ_GroupPatternUtils.bas`;
- `SJ_SubjectAnalyzer.bas`;
- `SJ_PriceLookupContext.bas`;
- `SJ_PriceVectorUtils.bas`;
- `SJ_PriceCalculationCore.bas`;
- `SJ_PriceNormalizationTests.bas`.

Reference VBA содержит больше поведения, чем разрешено MVP: automatic discount,
similar scaling, component sum и fallback. Переносится только явно принятое в
`domain/PRICING.md` и покрытое тестами.

## Проверка источника перед импортом

Для каждого запуска проверяются:

- exact SHA-256 bytes и logical source label;
- ожидаемые table/sheet/schema/header;
- необходимые columns и типы/парсеры;
- unique/null source IDs;
- зависимости и hashes связанных источников;
- отсутствие попытки сохранить source PII в repository/output.

Изменение schema без обновления contract является fatal validation error, а не
поводом сдвинуть positional columns.

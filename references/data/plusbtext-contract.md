# Source contract `PlusBText v1`

Этот обезличенный contract описывает только allowlisted columns sheet
`PlusBText` полного Admin XLSM. Он получен 2026-07-10 неисполняющим OOXML-
анализом snapshot из [admin-workbook-profile.md](admin-workbook-profile.md).
Значения клиентов/групп здесь не приводятся.

## Contract identity

- `source_contract_id = admin-xlsm-plusbtext`;
- `source_contract_version = 1`;
- sheet name: `PlusBText`;
- structural header row: `1`;
- allowlist: `E,F,K,L,M,N,T`;
- declared worksheet dimension и AutoFilter читаются из snapshot и сохраняются
  только в приватном import metadata.

Declared dimension и AutoFilter не являются data bounds; `T` может находиться
вне AutoFilter. Importer сканирует весь фактически разобранный worksheet range
по anchor rules ниже, а не останавливается на filter end, первой пустой строке
или formatted tail.

Header определяется versioned structural position/shape, не названиями:
в текущем row 1 из allowlist непусты только `F/L/M/N`, а `E/K/T` пусты.
Изменение header position/shape — schema drift, а не повод угадать новую строку.

## Два независимых блока

### Старые группы: `E/F`

Old record существует для row >= 2, если непусто `E` или `F`. Для valid record
обязательны оба поля:

- `E` — positive integer old group ID, unique/non-null;
- `F` — old group name, string.

В проверенном snapshot все `E` unique, но `F` не считается уникальным: после
normalization встречаются duplicate-name groups. Поэтому lookup по имени
собирает всех candidates; first-row-wins запрещён. Точные counts не публикуются.

### Новые/target groups: `K/L/M/N/T`

Target record существует для row >= 2 только при непустом anchor `L`:

- `L` — target group name, required;
- `K` — nullable list old IDs;
- `M` — nullable teacher;
- `N` — nullable weekday token;
- `T` — nullable positive integer duration.

Любой `K/M/N/T` без `L` — schema issue. Missing attribute остаётся missing и
никогда не берётся из соседней строки.

Поля `K/M/N/T` разрежены независимо. В проверенном snapshot present `N`
соответствуют разрешённым weekday tokens, а present `T` — finite positive
integer; importer всё равно валидирует каждый snapshot. Точные counts не
публикуются.

## Mapping algorithm

Физически соседние old/target cells не связаны. Переносить legacy fallback
«найти F и взять M/N/T этой строки» запрещено независимо от случайного
same-row совпадения.

Для входного group name:

1. normalize name как trim, NBSP->space, collapse whitespace и Unicode-aware
   casefold;
2. сначала собрать exact normalized candidates по `L`;
3. если exact target отсутствует, собрать все matching old `F` и их `E`;
4. tokenize каждое `K` и найти target rows, содержащие один из candidate `E`;
5. вернуть один логический target либо `unresolved/ambiguous` issue.

`K` читается как nullable token list: trim, split по `;`, canonical positive
integer text. Empty/non-integer/duplicate token внутри cell — issue. В текущем
snapshot cells numeric-only, но curated VBA допускает semicolon lists, поэтому
string list является предусмотренной эволюцией contract, а не positional drift.

Логически идентичные duplicate candidates можно collapse только с warning.
Разные target/attributes, несколько old IDs из duplicate `F` либо один ID,
ведущий к разным targets, — `ambiguous` и требуют admin review. Dangling `K`
создаёт issue; его нельзя объявлять опечаткой или external ID без решения.

Row number служит только diagnostic locator. Внутри immutable source version
storage key строится из canonical tuple/hash и duplicate ordinal; устойчивую
cross-version identity target rows из workbook вывести нельзя.

## Duration unit

Структура workbook не содержит единицу `T`: header cell `T1` пуст. Owner
подтвердил, что непустое positive integer `T` — duration в минутах.

Blank `T` остаётся `null` в source data: он может означать отсутствующую группу
или individual service. Importer не записывает 90 в source. Fallback 90 минут
применяется только в pricing/quote layer после подтверждённой классификации
offering как group и помечается estimated/admin-review согласно PRICING.md.

## Fingerprints и drift

Текущий whole-file SHA-256 идентифицирует содержимое import run, но обычное
изменение данных закономерно меняет его и не означает schema drift.

Value-free schema, logical-shape и layout/style fingerprints вычисляются для
каждого import run и остаются в приватном import metadata. Их точные значения
не публикуются, чтобы публичный repository не идентифицировал operational
snapshot.

Это audit diagnostics, а не значения, которые разрешено просто hardcode:
канонизатор, точный JSON payload, sorting/type rules и golden synthetic fixture
должны быть проверены в коде этапа 03 и получить собственный algorithm version.
Нормативны структурные assertions этого документа. Algorithm/version хранится
вместе с результатом. Schema fingerprint/profile проверяется fail-closed;
logical-shape drift создаёт обезличенный review. Style fingerprint только
warning: он слишком хрупок для business gate. Planned evolution (например,
string `K` token lists) требует новой утверждённой contract/profile version, а
не silent acceptance.

## Что нельзя угадывать

Из workbook нельзя достоверно вывести:

- business meaning blank `M/N/T`;
- причину dangling `K` или duplicate identical `L`;
- stable target ID между snapshots;
- business meaning конкретного blank `T` без classification/review;
- precedence конфликтующих candidates.

Эти случаи остаются missing/review; значение по соседней строке, default duration
или first candidate запрещены.

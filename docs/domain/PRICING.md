# Логика цены

Документ определяет импортный price contract, public quote, ручные корректировки
и пересмотр действующих цен.

## Денежные соглашения

- Валюта MVP — EUR.
- В D1 деньги хранятся integer cents.
- Decimal из Excel разбирается как десятичная строка, а не binary float.
- Значение с более чем двумя значимыми десятичными знаками является import
  issue; скрытого округления нет.
- Percentage discount автоматически не рассчитывается. Ручная корректировка
  задается в cents.

Если в будущем будет разрешено масштабирование цены, правило округления должно
быть принято отдельно и покрыто golden tests до включения. Текущий MVP не
переносит непроверенное scaling поведение VBA.

## Контракт `Price.xlsx`

Текущий workbook:

- sheet `Tabelle8`;
- metadata в строке 1;
- header row — строка 2;
- логические колонки `D:J`: `Key`, служебная `E`, `Preis`, `Dauer`, `Faecher`,
  `Sonderpreis`, `Kinder`;
- хвост used range может быть только форматированием и не является data row.

Importer ищет единственную строку заголовка, содержащую минимум `Key`, `Preis`,
`Kinder`, и не полагается на первую строку worksheet. Ноль или несколько таких
строк — fatal validation error.

`Dauer` может содержать вектор. Импорт сохраняет raw значения и строит
канонический ordered `subject_duration_vector`, сопоставляя компоненты
`Faecher` и `Dauer`. Несовпадающее количество/непарсируемый компонент не
схлопывается в одно число, а дает issue. `duration_total_minutes` — производное,
не замена vector.

## Режимы цены

- `standard` — колонка `Preis`;
- `ov_special` — колонка `Sonderpreis`;
- `manual` — явная цена администратора.

В исходном VBA заметки `O/V` или `V/O` выбирают `Sonderpreis`. В новом публичном
quote это поведение намеренно не переносится автоматически: право на special
не установлено. Public quote использует `standard`; `ov_special` может выбрать
только админ с reason/audit. Legacy `Value18` показывается как импортированная
плановая цена и не пересчитывается из notes без решения администратора.

Функция `ApplyUniversalDiscount*` из VBA, преобразующая ряд заметок в коэффициент
0.8, в MVP не переносится.

## Нормализация

Переносятся проверенные функции/fixtures из:

- `SJ_GroupPatternUtils.bas`;
- `SJ_SubjectAnalyzer.bas`;
- `SJ_PriceLookupContext.bas`;
- `SJ_PriceVectorUtils.bas`;
- `SJ_PriceNormalizationTests.bas`.

Обязательные golden cases включают `3Jahrige`, `4Jahrige`, `Ru/Fremd.`, Baby,
Gitarre, Kunst, Musik, Theater, Mathe Abakus, украинские группы и намеренно
неразрешимый `Tanz Ukr. Sa -> MISSING_PRICE_KEY`.

Alias может применяться автоматически только если он перечислен в коде и имеет
тест. Неизвестный первый token, одинаково хорошие candidates или неоднозначные
subjects/duration возвращают `needs_admin_review`.

## Public quote

Для нового кандидата на planned start date:

```text
active = active_children_count(course, planned_start)
lookup_children_count = min(active + 1, 6)
```

Далее:

1. определить `lesson_kind`;
2. для self-pay `individual` вернуть тариф из
   `INDIVIDUAL_PRICE_CENTS_PER_45_MIN`; default — 3000 cents / 45 минут;
3. для `nachhilfe` не выдавать self-pay quote: цена/единица берутся только из
   одобренного Jobcenter/Sozialamt funding/payer snapshot по `OQ-017`, иначе
   вернуть admin review;
4. для `group_nachhilfe` вернуть только manual review;
5. выбрать активную price version для периода/даты;
6. нормализовать key и ordered subject-duration vector;
7. найти единственное exact normalized rule по key, vector и count;
8. применить только allowlisted/tested alias;
9. при нуле или неоднозначности вернуть «Цена уточняется».

## Fallback при пустом `PlusBText!T`

Importer и source-модель всегда сохраняют пустое `PlusBText!T` как `null`.
Значение 90 минут не записывается в импортированную offering/session и не
считается найденной длительностью.

На уровне public quote разрешён один явный fallback, только если одновременно:

- offering однозначно сопоставлен и классифицирован как `group|dance_group`;
- `PlusBText!T` пуст, а не содержит непарсируемое или недопустимое значение;
- contract kind однозначно известен как `group_yearly|group_monthly`;
- normalized price key известен и не равен `MISSING_PRICE_KEY`;
- нет ambiguity по offering, mapping или price key.

Расчёт использует конфигурируемые значения:

```text
duration_minutes = GROUP_DURATION_FALLBACK_MINUTES          # default 90
academic_units = duration_minutes / 45                      # default 2

group_yearly:
    estimate = academic_units * MISSING_DURATION_YEARLY_CENTS_PER_45_MIN
             = 2 * 2300 = 4600 cents

group_monthly:
    estimate = academic_units * MISSING_DURATION_MONTHLY_CENTS_PER_45_MIN
             = 2 * 3000 = 6000 cents
```

Все три server-side значения обязательны и валидируются fail-closed: duration
— positive integer, кратный 45, ставки — non-negative integer cents. Клиентский
payload не может их переопределить.

Fallback-quote получает `decision_code = ESTIMATED_MISSING_DURATION`,
`duration_source = fallback_90`, `estimated_missing_duration = true` и
`requires_admin_confirmation = true`. Billing period не выводится из этих
ставок и до подтверждения хранится как `needs_admin_confirmation`, поскольку
его точная семантика остаётся частью `OQ-015`.

Немецкий UI явно сообщает: «Geschätzter Preis: {amount}. Dauer, Preis und
Abrechnungszeitraum müssen von der Verwaltung bestätigt werden.» До
подтверждения администратором фактической длительности, суммы и billing period
этот quote:

- не входит в monthly group total;
- не используется для пересмотра действующей цены;
- не может стать основой отправленного contract offer/договора.

Администратор может подтвердить 90 минут и рассчитанную сумму либо указать
другие фактические значения; решение сохраняется с reason/audit. Fallback
никогда не применяется к `individual|nachhilfe|group_nachhilfe`, unknown lesson
kind/mapping, непустому или невалидному `T`, неизвестному contract kind либо
missing/ambiguous price key.

Остальные VBA decision paths `SIMILAR`, duration/child scaling,
`COMPONENT_SUM`, любые другие hardcoded fallback и автоматический discount не
включаются, пока каждый путь не получит отдельное принятое правило и regression
tests.

Quote хранит active/count/date/version/rule/mode/decision и `expires_at`. Он
ориентировочный. При создании/sending offer система пересчитывает условия; если
они изменились, админ подтверждает новую цену, а старый quote не обещает прежний
результат. Default quote TTL — 24 часа; смена price/schedule version или
изменение релевантной occupancy делает его stale раньше срока.

## Ручная корректировка

`manual_discount_cents` и `manual_override_cents` взаимоисключающие:

```text
if override is set:
    final = override
else:
    final = base - discount
```

Итог не может быть отрицательным. Любая корректировка требует admin, reason,
timestamp и audit. Нулевое/пустое значение не должно случайно переключать price
mode. Клиентский payload никогда не выбирает `ov_special` или manual amount.

## Legacy и общая сумма

- `Value18` парсится в cents и хранится как planned imported price;
- непарсируемое/пустое значение — unknown, а не zero;
- legacy и portal totals в кабинете различаются, пока legacy запись не стала
  canonical active enrollment;
- Nachhilfe/individual не входят в monthly group total.

## Пересмотр действующих цен

Для пересмотра после изменения состава используется count без кандидата:

```text
active = active_children_count(course, effective_from)
if active == 0:
    не создавать price-review items и не выполнять lookup
else:
    lookup_children_count = min(active, 6)
```

Использование `active + 1` здесь является ошибкой на одного ребенка.

Триггеры review:

- admin approval/activation/cancellation/end/pause enrollment;
- подтвержденное изменение связи legacy occupancy;
- публикация новой price version, если админ запустил сравнение;
- аудируемое исправление активности.

Процесс:

1. создать/dedupe `price_review_batch` со snapshot old/new count;
2. рассчитать отдельный item на каждый затронутый active enrollment;
3. сохранить его old/new base/final/mode и decision;
4. админ проверяет batch и items;
5. по approval каждому родителю отправляется его item;
6. клиент принимает изменение явно; до этого действует старая цена;
7. на effective date accepted item применяется один раз;
8. отсутствие ответа/отказ переводит item в `needs_manual_contact`, без
   ретроактивного изменения.

До `sent` система строит immutable item snapshot/hash. После отправки изменение
цены, effective date, mode или acceptance text создает новую version и делает
старую `superseded`; прежнее согласие не применяется к новой version.

Для MVP снижение проходит тем же подтверждаемым процессом, что и повышение,
чтобы не вводить второй непроверенный договорный workflow. Одно согласие не
изменяет status других items. Manual override/discount пересчитывается только
по явному admin decision.

Одновременно для enrollment/effective date допускается один open item. Массовый
reimport не рассылает изменения автоматически.

Для yearly contract действует безопасное ограничение `OQ-001`: создать internal
manual review, но не отправлять и не применять новую цену автоматически.

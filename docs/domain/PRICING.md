# Логика цены

Документ определяет импортный price contract, public quote, ручной override
и пересмотр действующих цен.

## Денежные соглашения

- Валюта MVP — EUR.
- В D1 деньги хранятся integer cents.
- Decimal из Excel разбирается как десятичная строка, а не binary float.
- Значение с более чем двумя значимыми десятичными знаками является import
  issue; скрытого округления нет.
- Percentage discount автоматически не рассчитывается. Manual override задаётся
  абсолютной суммой в cents.

Цена по численности не рассчитывается коэффициентом: выбирается exact строка
прайса для `Kinder=min(active, 6)`. Поэтому скрытого rounding/scaling нет, а
непроверенные VBA paths `SIMILAR`, component sum и arithmetic scaling не
переносятся.

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

Для publishable data row `Kinder` является positive integer, а обе source-ставки
`Preis` и `Sonderpreis` — positive integer cents после точного decimal parse.
Zero/negative rate создаёт validation error и блокирует promotion всей price
version; он не означает бесплатное занятие и не превращается в fallback либо
`manual_override`.

`Dauer` может содержать вектор. Импорт сохраняет raw значения и строит
канонический ordered `subject_duration_vector`, сопоставляя компоненты
`Faecher` и `Dauer`. Несовпадающее количество/непарсируемый компонент не
схлопывается в одно число, а дает issue. `duration_total_minutes` — производное,
не замена vector.

## Виды договора, source-колонки и override

Заголовок `Sonderpreis` исторический и не отражает бизнес-смысл:

| `contract_kind` | Source-колонка | Значение                             |
| --------------- | -------------- | ------------------------------------ |
| `group_yearly`  | `Preis`        | месячная плата по годовому договору  |
| `group_monthly` | `Sonderpreis`  | месячная плата по месячному договору |

Access token `O/V|V/O` в current/future note cell `N/S` классифицирует запись как
`group_monthly`; отсутствие token, включая blank cell, означает `group_yearly`.
Рабочий code `T` этого не определяет, кроме `KN`/hourly classification. Contract
kind выбирает
месячную source-колонку; это не special eligibility. Для однозначно
классифицированного contract kind public quote использует соответствующую
колонку для нового quote. Для существующей legacy service положительная цена из
current/future `M/R` (`Value13/18`) является фактической imported current price и
имеет приоритет над price-table lookup, даже если это индивидуально установленная
сумма. Это source evidence, а не новый portal `manual_override`; последующее
изменение идёт только через обычный auditable price-review/override flow.

Обе суммы являются базовыми месячными тарифами, а не рассчитанным счётом за
конкретный месяц. Каникулы не оплачиваются, но календарь каникул, pauses,
prorating и фактический перерасчёт в MVP отсутствуют. Поэтому UI/contract
snapshot не должен называть base price фактической payable amount.

Настоящая индивидуальная особая цена — только `manual_override`. Это отдельный
`price_mode`, не колонка workbook и не скидка из notes. `price_source` и base
provenance при override сохраняются. Клиент никогда не выбирает contract kind,
source-колонку или override произвольным payload.

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
3. для `nachhilfe` не выдавать сумму к оплате родителем: contract snapshot
   фиксирует 3000 cents за 45 минут как funded unit rate только при approved
   Jobcenter/Sozialamt document и inclusive valid dates;
4. для `group_nachhilfe` вернуть только manual review;
5. выбрать активную price version для периода/даты;
6. нормализовать key и ordered subject-duration vector;
7. найти единственное exact normalized rule по key, vector и count и взять
   `yearly_price_cents` либо `monthly_price_cents` по contract kind;
8. применить только allowlisted/tested alias;
9. при нуле или неоднозначности вернуть «Цена уточняется».

`INDIVIDUAL_PRICE_CENTS_PER_45_MIN` — валидируемый non-negative integer server
config с default 3000; фактическое значение фиксируется в immutable offer
snapshot. Funded Nachhilfe rate не читает этот config и для MVP фиксирован на
3000 cents/45 минут. Изменять его как operational configuration запрещено без
нового утверждённого требования.

## Автоматическая цена при выборе услуги (`PRICE-05`)

Каталог, формы заявок и ценовой блок подготовки договора используют описанные
выше источники. Group показывает базовую месячную цену, individual — тариф
за 45 минут за счёт родителя, Nachhilfe — funded unit rate без объявления суммы
к оплате родителем. Месячная цена регулярных занятий не является ценой пробного.
Смена выбранной услуги обновляет цену; запоздалый ответ не возвращает сумму
предыдущего выбора. Нет результата — показывается причина, не нулевая цена.

При подготовке договора admin выбирает опубликованную группу либо одобренную
заявку нужного owner/child. Сервер формирует суммы, line items, единицу,
плательщика, source/mode и ссылки; ввод суммы/price IDs в обычном автоматическом
пути не нужен. Для group создаётся новый owner/child-bound quote, public quote
не перепривязывается. Для individual используется сохранённый тариф заявки;
Nachhilfe сохраняет проверки approved funding и inclusive периода.

Перед созданием и отправкой проверяется актуальность условий; изменение цены
требует явного подтверждения нового расчёта. После отправки immutable snapshot
не перезаписывается. Подмена суммы/source/выбранной услуги через JSON или hidden
fields не заменяет серверный расчёт. Manual override остаётся отдельным
подтверждаемым действием по существующим правилам. Исторические preview offers
без quote сохраняются; новый автоматический путь не использует этот обход.

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
    estimate = academic_units * YEARLY_MONTHLY_FEE_CENTS_PER_WEEKLY_45_MIN
             = 2 * 2300 = 4600 cents

group_monthly:
    estimate = academic_units * MONTHLY_MONTHLY_FEE_CENTS_PER_WEEKLY_45_MIN
             = 2 * 3000 = 6000 cents
```

Все три server-side значения обязательны и валидируются fail-closed: duration
— positive integer, кратный 45, ставки — non-negative integer cents. Клиентский
payload не может их переопределить.

Fallback-quote получает `decision_code = ESTIMATED_MISSING_DURATION`,
`duration_source = fallback_90`, `estimated_missing_duration = true` и
`requires_admin_confirmation = true`. Для обеих групповых моделей
`billing_period_code = calendar_month`: 4600/6000 cents — месячная плата за
еженедельное 90-минутное занятие, а не стоимость одного проведённого урока.

Немецкий UI явно сообщает: «Geschätzter Monatspreis: {amount}. Dauer und Preis
müssen von der Verwaltung bestätigt werden.» До подтверждения администратором
длительности и суммы этот quote:

- не входит в monthly group total;
- не используется для пересмотра действующей цены;
- не может стать основой отправленного contract offer/договора.

Администратор может подтвердить 90 минут и рассчитанную сумму либо указать
другие фактические значения; решение сохраняется с reason/audit. Fallback
никогда не применяется к `individual|nachhilfe|group_nachhilfe`, unknown lesson
kind/mapping, непустому или невалидному `T`, неизвестному contract kind либо
missing/ambiguous price key.

Остальные VBA decision paths `SIMILAR`, arithmetic duration/child scaling,
`COMPONENT_SUM`, любые другие hardcoded fallback и автоматический discount не
включаются, пока каждый путь не получит отдельное принятое правило и regression
tests.

Quote хранит active/count/date/version/rule/source/mode/decision и `expires_at`. Он
ориентировочный. При создании/sending offer система пересчитывает условия; если
они изменились, админ подтверждает новую цену, а старый quote не обещает прежний
результат. Default quote TTL — 24 часа; смена price/schedule version или
изменение релевантной occupancy делает его stale раньше срока.

## Ручная особая цена

`manual_override_cents` полностью заменяет rule-derived base price и не может
быть отрицательным. Автоматический или универсальный discount в MVP отсутствует.

Override доступен только на отдельном high-friction admin screen. Перед
сохранением интерфейс показывает base, override, абсолютную/процентную разницу и
предупреждение, что price rule обходится; требует непустую причину и второе
явное подтверждение. Сохраняются actor, timestamp, base/rule/version snapshot и
audit. Пустое/нулевое поле не переключает mode случайно; bulk default,
клиентский payload, `O/V`, `Sonderpreis` или notes не создают override.

## Legacy и общая сумма

- `Value18/R` парсится в cents и хранится как current imported legacy price;
- zero/непарсируемое/пустое значение активной group service — unknown/review, а
  не zero; у `KN` и individual/Nachhilfe поле не является group-price error;
- кабинет показывает claimed legacy record как строку активной услуги, а не
  digital contract; PDF/contract history для неё не создаются;
- общий показатель — только сумма известных текущих base prices активных
  group/dance services с явным предупреждением, что holiday/other adjustments
  не рассчитаны; unknown не входит в сумму и не заменяется нулём;
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

Review создаётся, когда изменился `min(active, 6)` либо админ запустил сравнение
с новой price version. Переход `5↔6` меняет lookup и проходит обычный клиентский
workflow. `7→6` и любое изменение occupancy целиком внутри диапазона `>6` не
меняют lookup и сами по себе не создают клиентские items.

Триггеры review:

- admin approval/activation/cancellation/end enrollment;
- установка/изменение future `active_from|active_until`: review создаётся сразу
  на boundary date, а не только когда календарь дойдёт до неё;
- подтвержденное изменение связи legacy occupancy;
- публикация новой price version, если админ запустил сравнение;
- аудируемое исправление активности.

Pause/resume в MVP отсутствуют и не являются trigger. Возврат после effective
end/cancel оформляется новым operational/contract flow.
Периодический reconciler находит пропущенный scheduled boundary trigger и
создаёт его идемпотентно; естественное наступление `active_until` не должно
молча менять count без review.

Процесс:

1. создать/dedupe `price_review_batch` со snapshot old/new count;
2. пересчитать каждый active enrollment, но создать клиентский item лишь когда
   current accepted final price или mode отличается от рассчитанного
   предложения; новый triggering enrollment с уже актуальным accepted snapshot
   исключить;
3. сохранить его old/new base/final/source/mode и decision;
4. admin первым явным действием утверждает batch/items именно для рассылки;
5. email outbox отправляет каждому родителю письмо increase/decrease с private
   cabinet link только на его immutable item; item даёт 14 календарных дней на
   ответ и содержит правило effective date;
6. current active parent явно принимает либо отклоняет; current admin не может
   выполнить это parent-side действие, даже если сохранил ownership;
7. parent acceptance создаёт admin task, но ещё не меняет enrollment;
8. admin с другим user ID вторым явным действием подтверждает конкретный
   accepted item; повышение роли ответившего parent не создаёт вторую сторону;
9. перед final confirmation и apply повторно проверить account/enrollment active
   state, current old price/mode, occupancy, price version/rule и отсутствие
   более новой item version; mismatch supersede item и запускает новый расчёт,
   но не меняет цену;
10. после второго admin confirmation `scheduled_for` вычисляется как первое
    число следующего календарного месяца в `Europe/Berlin`; item применяется
    один раз в эту дату, никогда ретроактивно;
11. decline немедленно уведомляет admin, а timeout создаёт manual-contact task;
    оба оставляют старую цену и не меняют другие items.

Claimed legacy-only active record с однозначным owner, service mapping и
известной/подтверждённой current price получает тот же immutable item, email,
parent accept/decline, второй admin confirmation и scheduled apply, что portal
enrollment. Apply создаёт отдельную effective legacy-price assignment и не
переписывает imported `Value18`/source row. Legacy service при этом не становится
digital contract и не получает PDF. Unknown amount, отсутствующий claim либо
identity/service conflict сохраняется nullable с явным decision code и остаётся
`manual_contact_required` без send/accept/apply. Если legacy запись уже
представлена canonical portal enrollment, действует только portal item без дубля.

Если после сравнения current/proposed final price и mode клиентских items нет,
batch завершается без уведомлений. Изменение только source/base при неизменном
manual override можно показать во внутренней диагностике, но оно само по себе не
создаёт письмо об изменении цены.

До `sent` система строит immutable item snapshot/hash. После отправки изменение
цены, effective date, source/mode или acceptance text создаёт новую version и делает
старую `superseded`; прежнее согласие не применяется к новой version.

Новый occupancy/price-version trigger для той же group пересчитывает и
supersede все ещё открытые items прошлых batches, snapshot которых уже не
соответствует новому состоянию. Поздний parent response на stale item сохраняется
как evidence попытки, но не переводит item к apply. Завершившийся/перемещённый
enrollment и закрытый account никогда не получают изменение цены.

Для MVP снижение проходит тем же подтверждаемым процессом, что и повышение,
чтобы не вводить второй непроверенный договорный workflow. Одно согласие не
изменяет status других items. Manual override/discount пересчитывается только
по явному admin decision.

Одновременно для enrollment/effective date допускается один open item. Массовый
reimport не рассылает изменения автоматически.

Одинаковая state machine действует для yearly и monthly contract. Отдельный
PDF/addendum для изменения base price в MVP не создаётся: immutable item/hash,
delivery, parent response, second admin confirmation и applied event составляют
evidence chain.

# Занятия, расписание и вместимость

Этот документ является источником истины для `lesson_kind`, course identity,
capacity и occupancy. Правила цены находятся в [PRICING.md](PRICING.md).

## Учебный период

Каждый schedule, price version, legacy enrollment, course и contract относится
к `academic_period_id`. Значение `future` как постоянная identity запрещено:
после смены года оно теряет смысл.

Публичный каталог здесь означает route/read model самостоятельного
регистрационного портала, а не страницу расписания на `kolibri-dresden.de`.
Он использует только опубликованный schedule активного периода. Прошлые версии
остаются для snapshots и аудита, но не смешиваются с текущей. Портал не
заменяет, не встраивает и не редактирует внешнюю страницу расписания; она
может только дать обычную ссылку на портал.

## Типы занятий

| `lesson_kind` | Назначение | Capacity | Public CTA | Автоматическая цена |
| --- | --- | ---: | --- | --- |
| `group` | Обычная группа | 12 | Trial request | Групповой lookup |
| `dance_group` | Танцевальная группа | 15 | Trial request | Групповой lookup |
| `nachhilfe` | Финансируемая индивидуальная Nachhilfe | 1 | Nachhilfe request | 30 EUR / 45 min funded unit; document + dates, admin review |
| `individual` | Другое индивидуальное занятие | 1 | Individual request | Config, default 30 EUR / 45 min |
| `group_nachhilfe` | Админская групповая Nachhilfe | Только manual | Нет public trial | Только manual |

`capacity_override` администратора имеет приоритет над default, требует причины
и audit. Capacity не равна price lookup count и не ограничивается шестью.

## Классификация

Приоритет правил:

1. подтвержденный `course_source_mapping` или явная админская классификация;
2. надежный структурированный source type;
3. проверенные нормализованные паттерны имени/предмета;
4. `needs_review` и скрытие из публичного каталога.

Паттерны MVP:

- `Tanz`/подтвержденный dance pattern → `dance_group`;
- `Nachhilfe` → `nachhilfe`, если админ не подтвердил `group_nachhilfe`;
- `Ind.`/явный individual pattern → `individual`;
- остальная корректная schedule group → `group` только если это действительно
  опубликованный учебный block, а не placeholder.

Тексты вроде `Der Kurs befindet sich in der Planung`, пустые/неизвестные типы и
неоднозначные записи не получают `group` по умолчанию: они импортируются как
`needs_review` и `catalog_status=hidden`.

## Identity группы и session

Display name не является identity. В текущем snapshot повторяются одинаковые
названия для разных дней, преподавателей и даже предметов. Поэтому:

- каждый schedule block по умолчанию создает отдельное offering/course group;
- `source_block_id` задает identity session внутри version;
- объединить несколько sessions в одну группу можно только подтвержденным
  mapping;
- изменение teacher, room или time обновляет новую version source block и не
  должно создавать вечный дубликат по composite key;
- если стабильность source ID между generation не подтверждается, promotion
  требует diff/review; имя группы не используется как fallback identity.

Recurring session хранит день недели, local start/end time и
`Europe/Berlin`. Она не является календарем каникул. Реальную trial date
подтверждает админ.

## Связывание Access и расписания

Нормализованное имя дает только candidate mapping. Exact unique mapping можно
предложить администратору, но неоднозначность не разрешается выбором первой
строки. Подтвержденная связь хранится отдельно и переживает reimport.

При отсутствии надежного mapping legacy enrollment сохраняется, но:

- не увеличивает capacity конкретной portal group;
- создает import issue/review;
- показывается владельцу как imported activity без выдуманного расписания;
- не используется для автоматического price review этой group.

## Occupancy

`active_children_count(course, as_of)` считает уникальных детей, а не строки:

```text
qualifying portal enrollments
UNION qualifying current legacy enrollments
MINUS legacy enrollment, уже представленный active portal enrollment
```

Qualifying portal enrollment имеет `status=active`,
`active_from <= as_of` и `active_until IS NULL OR as_of < active_until`.
Qualifying legacy enrollment имеет подтвержденный course mapping,
`is_current=true`, `is_active_for_occupancy=true` и не представлен portal
enrollment.

Инварианты:

- один child/course считается один раз, даже если он встречается в main и
  package;
- claim семьи сам по себе не меняет count;
- activation portal enrollment, связанного с legacy, атомарно исключает legacy
  запись из повторного учета;
- `KN`, trial, pending offer/request и cancelled/ended enrollment не входят;
- count вычисляется на planned/effective date, а не просто «сейчас»;
- duplicate/mapping ambiguity создает warning и не завышает count.

## Availability в каталоге

- `available` — mapping и capacity достоверны, count ниже capacity;
- `full` — достоверный count не ниже capacity;
- `unknown` — есть unmatched legacy data, import issue или неясный override;
- `requires_admin_review` — заявку принять можно, но место не обещается;
- `hidden` — source placeholder, retired или не опубликовано.

Confirmed trials могут учитываться админом при решении о месте на конкретную
дату, но не изменяют contractual occupancy и price count.

## Trial invariants

- только `group|dance_group`;
- только ребенок текущего owner;
- одна незавершенная заявка на child/course;
- admin выбирает/подтверждает session и будущую дату;
- нельзя подтвердить trial уже active child в той же course;
- terminal states: `rejected|cancelled|no_show|converted`;
- `attended` не terminal: из него разрешен единственный переход в `converted`;
- `converted` означает завершение trial workflow, но active enrollment появляется
  только через contract offer/acceptance/admin approval/activation.

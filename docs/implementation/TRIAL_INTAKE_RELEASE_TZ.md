# Срочный запуск короткой заявки на пробное

Дата: 2026-09-16. Статус: **ТЗ подготовлено по согласованным OQ-037–043/045–046**.
Шаги 01–02: серверный runtime, UI и экспортер реализованы локально;
локальный gate (03) завершён, разрешённый deployment остаётся впереди. Evidence — в
[handoff 01](handoffs/stage-13.md#trial-intake-server-20260916) и
[handoff 02](handoffs/stage-13.md#trial-intake-ui-20260916) и
[handoff 03 / deploy packet](handoffs/stage-13.md#trial-intake-release-20260916).
Снимок ниже с 108 карточками исторический: выпускной источник с 110 карточками
от 09.09.2026 выбран владельцем по OQ-047; старый HTML сохранён для rollback.
Рабочий бюджет владельца: 8–12 часов на реализацию и запуск.

## Решение

Расписание → короткая форма → проверка email → список администратора + Telegram
→ ручной звонок. Согласован гостевой сценарий без пароля. По уточнению владельца
проект включает несколько занятий с отдельной желаемой датой каждого; по умолчанию
одно занятие из карточки и ближайшая дата его дня недели. Решения владельца и
проверяемые правила находятся в [TRIAL_INTAKE](../domain/TRIAL_INTAKE.md),
[OPEN_QUESTIONS](../spec/OPEN_QUESTIONS.md) и
[ACCEPTANCE_CRITERIA](../spec/ACCEPTANCE_CRITERIA.md#короткая-заявка-tin-ac).

Новый limited release имеет приоритет перед полным preview и pricing-пакетом.
Их незавершённая работа сохраняется. Договоры, документы и real legacy import
не нужны для запуска этого сценария и не становятся его release gates.

Поддержка записи добавляется в логику визуализации редактора расписания
по TIN-01/06 и OQ-046. Netlify — место публикации генерируемого HTML, а не
редактируемый исходник. Запрещена реализация через ручной патч готового HTML
на сервере или в локальной копии. Обычная работа в веб-редакторе и последующий
экспорт должны каждый раз воспроизводить каталог и ссылки с сохранёнными
настройками. Доступ к Netlify deployment не требуется для разработки 01/02.

## Что проверено в исходниках

Исследование выполнено по local HEAD `3ea46b12d077568d3fbee6fd65b9317294b8f343`
с уже имевшимися незакоммиченными pricing docs. Remote control plane не читался,
актуальная работоспособность providers новым send не проверялась.
Последний известный preview checkpoint — в [active state](STAGE_13_ACTIVE_STATE.md).

| Поверхность | Факт и минимальная доработка |
| --- | --- |
| Опубликованное расписание | [Netlify](https://stalwart-gumption-9545e9.netlify.app/), DOM осмотрен 2026-09-16: 108 `.lesson-block`, все помечены `group`, 7 колонок, суббота разделена надвое; ссылок сейчас нет |
| Экспортер | Проверенный путь редактора на диске: `C:\path\to\schedule-editor`. `visualiser/enhanced_export_manager_html.py`, `HtmlExportMixin.export_to_html`, `_generate_lesson_block_html` совпадают со структурой сайта. Меняется этот код и необходимые callers/config штатного экспорта, не его готовый HTML |
| Данные экспортера | `visualiser/data_processor.py`: subject/group/teacher/room/building/start/end уже есть; day находится в `schedule_by_day`, не в lesson dict. Передать day из внешнего цикла; не разбирать заголовок субколонки |
| Вид карточки | `.lesson-time`, `.lesson-group`, `.lesson-teacher`, `.lesson-location`, условная `.lesson-subject`; добавить CTA с ID и общий безопасный JSON-каталог внутри того же HTML |
| Старый trial | `src/lib/server/trials/trial-service.ts`: требует authenticated parent, owned child, published course/session, future date, occupancy. Прямое переиспользование этого workflow усложнит гостевую заявку |
| Email | `src/lib/server/email/resend.ts`, `outbox/outbox-worker.ts`, `outbox/templates.ts` готовы. SQL email queue требует user FK; нужен небольшой intake store, совместимый с worker. Display name в `config/runtime.ts` пока старого написания; привести к TIN-02, сохранив sender address |
| Telegram | `outbox/outbox-repository.ts`, `outbox-worker.ts`, `telegram/bot-api.ts` готовы; нужны новый template и его точный allowlist. Рабочее окно проверяется также в worker |
| Admin UI | `routes/admin/trials`, `lib/server/admin/http.ts`, navigation, общие таблицы/формы и role/session готовы; новый intake list/detail с нужными фильтрами |
| Admin bootstrap | `auth/admin-bootstrap.ts` повышает уже существующего verified parent без business state, но не создаёт user. Обычная регистрация требует family finalization. Нужна узкая initial-admin CLI подготовка без legacy |
| Deploy mode | `config/runtime.ts` сейчас требует R2_ARCHIVE, R2_QUARANTINE и BROWSER для любого production/preview. `hooks.server.ts`, route-policy, layouts и scheduler требуют небольшой явной ветки intake mode |

Редактор сейчас не является Git checkout. До будущих изменений сделать одну
резервную копию затронутых `.py`/config и сохранить diff. На шаге 01 весь
редактор read-only. Office-файлы не открывались и не исполнялись.

Факты read-only preflight 01 от 2026-09-16, их ограничения и protected evidence
сохранены в [handoff](handoffs/stage-13.md#trial-intake-preflight-20260916).
Здесь они не дублируются как постоянные условия. Повторная проверка нужна при
drift либо непосредственно для следующего разрешённого действия.

Resend переиспользуется по OQ-046: существующие account/domain/sender и новый
Worker binding `RESEND_API_KEY`. Доступный сохранённый ключ не требует перевыпуска;
если его исходного значения нет, применить инструкцию ниже. Preview, DNS и адрес
отправителя сохраняются; отображаемое имя меняется в коде по TIN-02.

## Минимальная модель и точки изменений

Одна новая append-only migration после фактически последней. Предлагаются
`trial_intake_requests`, `trial_intake_children`, `trial_intake_items`,
`trial_intake_item_children`, `trial_intake_email_outbox`. Junction table
реализует согласованный выбор детей для каждого занятия. Verification
version/nonce/hash/expiry находятся в
request. Изменение SQL реализатор согласует с [DATA_MODEL](../architecture/DATA_MODEL.md),
не переписывая применённые migrations.

- Request: отдельные parent first/last name, normalized email, phone;
  locale/privacy version; verification/state; idempotency key +
  payload hash; created/verified/processed timestamps. Поля поиска не прятать в JSON.
- Children: request FK, отдельные first/last name, birth date, порядок показа.
  Не canonical `children`; нет FamilyID или автосвязи с существующей семьёй.
- Items: request FK, source lesson ID, typed snapshot полей занятия, desired date.
  Связь item/child допускается только внутри одного request; insert всей заявки
  атомарен. Idempotency охватывает contacts, детей, items, даты и назначения.
- Источник выбора: один JSON-блок внутри HTML визуализатора, фиксированный URL
  и bounded server fetch/cache по TIN-06. Новых D1 schedule versions/imports нет.
- Intake email store: тот же lease/retry/dedupe контракт, адрес берётся из request,
  перед dispatch проверяются текущая verification version/expiry. Existing
  `EmailOutboxWorker`/Resend используются через маленький адаптер и новый template.
  Если типу row нужен nullable user, оформить явный guest variant; не подставлять
  фиктивный user ID. Старыe auth/contract email paths сохраняют свой recipient guard.
- Existing Telegram table: `source_kind=trial_intake`, новое template, полный
  согласованный состав заявки; дедупликация request/part. Сохранение verified и
  всего набора частей — одна transaction. Обычная заявка — один sendMessage,
  длинная сохраняет весь текст в нумерованных частях. PII в outbox подпадает под
  тот же cleanup; schema старых сообщений не расширяется.
- Bootstrap: локальная CLI на существующих crypto/DB/target/audit primitives,
  exact new D1, известная владельцу identity, пароль только через protected input.
  Повтор не создаёт второго admin и не изменяет чужого. Механизм подтверждения
  operator identity и точные команды записать после реализации и local rehearsal.

## Изоляция в репозитории

Требование владельца — держать промежуточный продукт отдельно внутри существующего
репозитория. Один модуль `src/lib/trial-intake/` включает:

- `server/*.server.ts`: model/repository/service, schedule reader, verification,
  admin queries, cleanup и адаптеры email/Telegram с их шаблонами. Суффикс
  `.server.ts` обязателен для серверного кода, чтобы его нельзя было импортировать
  в клиентский bundle; общего barrel export сервера и UI нет.
- `components/`: форма, выбор детей/занятий, admin list/detail и статусы.
- `contracts.ts`, `i18n.ts`: только безопасные для browser типы и тексты этого
  контура. Общий переключатель языка переиспользуется.

`src/routes/probestunde/**` и `src/routes/admin/trial-intake/**` содержат только
SvelteKit route wrappers, вызовы серверного модуля и подключение компонентов.
Общие hooks/config/navigation/scheduler/outbox регистрируют intake в нескольких
явных точках. Общая константа полного названия учреждения используется и этим
модулем, и доступными ему auth/reset/recovery страницами и письмами.
Бизнес-логика полного портала не импортирует intake и не получает guest branches.
Отключённый intake не запускает свои jobs и не меняет full-mode бизнес-поведение.

Отдельная папка `deploy/trial-intake/` хранит собственный Wrangler config template
и краткие команды запуска/остановки; привязанные реальные IDs/secrets остаются
в protected ignored config/evidence. Команды явно выбирают этот config. Корневая
preview-конфигурация не заменяется. Используется текущая сборка приложения;
новый npm package, monorepo tool, framework, сервис или копия auth/outbox не нужны.
Пути к build assets и общей цепочке migrations проверяются относительно config.

CLI подготовки первого admin — в `scripts/trial-intake/`. Новые tests лежат в
подпапках `trial-intake` существующих `tests/unit`, `tests/integration`, `tests/e2e`
с текущим harness; его glob не требует нового test runner. Новая миграция остаётся
в общей append-only цепочке с именем `<номер>_trial_intake.sql`, таблицы имеют
префикс `trial_intake_`. Уже применённые migrations впоследствии не удаляются.

Удаление/замена временного продукта в будущем затрагивает его папки, маршруты и
явные точки подключения. Это не обещание удалить production данные или migration
history при удалении кода. Отдельный plugin registry и checker архитектуры не нужны:
достаточно просмотреть diff/imports в выпускном review и проверить mode guards.

## Четыре последовательных промпта

Оценки — рабочие интервалы, а не гарантия; внешнее ожидание отдельно. Целевой
бюджет остаётся 8–12 часов. Несколько занятий/дат — согласованная часть результата;
готовый код ещё не написан, поэтому точная стоимость не подтверждена. При P0/P1 сообщить новую оценку,
не превращать обязательный flow в stub ради срока.

| Шаг | Результат | Ориентир |
| --- | --- | --- |
| 01. Серверный срез | intake migration/service, items/dates, schedule reader, verification, email adapter, Telegram, minimal mode, initial-admin path | 3–4 ч |
| 02. Интерфейс и расписание | DE/RU форма с выбором занятий/детей/дат, admin list/detail, CTA и JSON экспортера, synthetic browser pass | 2–3 ч |
| 03. Выпускной пакет | один общий gate, ограниченный review по P0/P1, actual config/commands/rollback и готовый HTML | 1–2 ч |
| 04. Публикация | новый production target, admin, реальные controlled email/Telegram, штатная публикация результата исправленного экспортера, handoff | 2–3 ч |

Промпты — локальные помощники в `out/codex-trial-intake-prompts-2026-09-16/`.
В начале 01 выполнить короткий read-only preflight доступов/provider targets/
источника расписания; недостающее для этого шага запросить сразу и продолжать
независимый код. Для расписания достаточно read-only публичного HTML и проверки
пути экспортера. Netlify deployment credentials на 01/02 не запрашиваются;
обычный способ публикации сгенерированного результата уточняется на 03, если
его ещё нет в handoff. На 03 уточнить exact candidate/commands и только
изменившиеся внешние факты. Ответы владельца уже внесены; повторно спрашивать
OQ-037–043/045–046 не нужно.
Каждый шаг передаёт результат через [stage-13 handoff](handoffs/stage-13.md);
операционные факты — только через active state. Дополнительные обязательные
агенты, отдельные review-сессии после каждого шага и новые журналы не нужны.

## Проверки по фактической поверхности

Во время разработки: focused intake validation, D1 create/verify/replay/expiry/
filter tests; direct consumers общего email/Telegram/config/guards; один browser
сценарий формы→verification→admin плюс mobile/locale. Python — synthetic lesson
dict, link roundtrip/escaping/day passing и существующие затронутые label tests.
Обязательно покрыть обычный export entry point и повторную генерацию после
изменения synthetic занятия с сохранёнными origin/CTA settings (TIN-AC-01).
Это один focused regression в шаге 02; шаг 03 использует его evidence, если
экспортер/callers/config не изменились. При публикации проверяется фактический
артефакт, а не повторяется synthetic сценарий.
Обычная генерация из клиентских Office-файлов не является тестом.

Перед deploy один общий `npm run check`, `npm test`, `npm run test:e2e`,
`npm run build`, `npm run docs:check`, `npm run release:scan`, `git diff --check`.
Один общий прогон нужен по AGENTS.md из-за новой migration и изменения общих
config/routes/scheduler, а не после каждой UI-правки. Добавить intake-mode scenarios
в этот запуск; старый full-mode suite должен по-прежнему запускаться в full mode.
После focused фикса не повторять весь набор без нового cross-cutting diff/risk.
Не запускать несколько browser engines, нагрузку, весь Python-проект или полный
manual contract/document lifecycle ради этого release.

Последующие выпуски (решение владельца 2026-09-24): гейт перед deploy —
`npm run check`, `npm run test:intake-release`, обе intake e2e-спеки с
`KOLIBRI_E2E_TRIAL_INTAKE=1`, `npm run build`, `wrangler deploy --dry-run`,
`npm run docs:check`, `npm run release:scan`, `git diff --check`. Набор
`test:intake-release` покрывает модуль trial-intake и весь общий код, который
выполняется в этом режиме, включая migrations, outbox, scheduler, auth и config.
Полный `npm test` — только при изменении модулей полного портала, перед его
выпуском или по поручению. Повод: полный прогон 2026-09-24 содержал 670 тестов,
из них 348 (52 %, 62 % времени) проверяли модули, закрытые в режиме trial-intake,
и единственное падение было известным средовым сбоем там же. Правило — в
AGENTS.md, состав набора — `tests/intake-release-set.ts`.

## Публикация короткими фазами

OQ-040 уже выбран; до фазы 1 владелец прямо запускает deployment prompt.
Привести реальные commands из проверенного кода; этот документ не выдумывает
имена несуществующих CLI и не разрешает remote writes сам по себе.

| Фаза | Target и результат | Минимальная проверка | Rollback / containment |
| --- | --- | --- | --- |
| 1. Подготовка | новый production Worker/D1/workers.dev origin; provider bindings; тот же разрешённый Telegram bot/чат, auto-delete 14 дней | DB/Worker distinct from preview, exact bot/chat и auto-delete, ресурс доступен, секреты не в repo | остановить на закрытом intake; preview deployment/data не менять |
| 2. Schema | baseline migrations и новая intake migration в новой D1 | actual migration list, таблицы/indexes/FK, небольшой local restore rehearsal уже в release evidence | новый target закрыт; forward repair, не down-migration с потерей заявок |
| 3. Источник выбора | штатно сгенерировать HTML исправленным редактором с сохранённым CTA=off и опубликовать результат обычным способом в exact target | опубликованный artifact совпадает с экспортом; карточки совпали с актуальным live baseline; JSON соответствует им | возврат предыдущей публикации; исправленный экспортер сохраняется |
| 4. Код/admin | exact candidate, intake mode, login и контролируемый первый admin | actual version/config; public form доступна, чужие/admin routes защищены; audit bootstrap | известная совместимая версия либо intake maintenance; D1 сохраняется |
| 5. Живой flow | controlled request с synthetic именами и разрешённой почтой, verification, один Telegram event со всеми items | inbox + D1/outbox receipt + видимость у admin; вне рабочего окна Telegram queue/not_before по OQ-044 достаточны для перехода к CTA | при provider failure сохранить заявку/очередь, устранить/reconcile; Telegram сам по себе не блокирует приём, actual delivery проверить следующим рабочим утром |
| 6. CTA | сохранить CTA=on и проверенный portal origin в конфигурации редактора, повторно штатно экспортировать и опубликовать результат | опубликованный artifact совпадает с экспортом; карточки/JSON/CTA согласованы, оба здания и суббота; последующие обычные экспорты сохраняют ссылки | сохранить CTA=off, экспортировать и опубликовать вариант без ссылок либо вернуть предыдущую публикацию; новые заявки не удалять |

Каждая строка содержит несколько возможных атомарных операций. Между ними
соблюдать checkpoint после **каждой попытки** remote mutation: read-only
postcondition → active state → docs-only commit → ровно одно следующее действие.
Включая ресурс/secret/config/bootstrap/send/session и публикацию внешнего HTML.
Не группировать несколько writes под один поздний checkpoint. Автоматические
Cron sends во время реального smoke учитываются в postcondition; перед следующей
операторской mutation завершить checkpoint принятой операции.

До первого production запроса известны: точный origin, email sender/deliverability,
Telegram bot/chat, первый admin, privacy notice и сроки, штатный способ публикации
экспорта редактора,
backup/restore для новой D1 и действие «закрыть приём, сохранить данные».
Подтверждение получения письма/Telegram человеком не заменяется HTTP 200.
Изменение официального `kolibri-dresden.de` не входит в этот пакет.

Перед публикацией сравнить candidate по публичным полям с live baseline, а не
считать любой локальный Excel/HTML последней боевой версией. Если источники
расходятся, уточнить нужный source; не заменять расписание устаревшей копией.
Использовать существующий способ публикации: новый publisher, CI/CD-интеграция
с Netlify и новый экран настроек редактора не входят в этот release.
Работа с Office допускается только неисполняющим parser с явным allowlist
schedule sheets/fields, без полного workbook dump. Тесты используют synthetic data.

### Разделение работы с владельцем на шаге 04

Уточнение владельца 2026-09-16: экономить лимиты агента, передав обычные UI-действия
владельцу. Это изменение исполнителя приёмки, не ослабление TIN-AC и не запуск deploy.

| Агент | Владелец по короткой инструкции |
| --- | --- |
| Cloudflare/Wrangler, ресурсы, D1/schema, secrets/Turnstile/Cron, deploy, bootstrap и recovery | Защищённый ввод недостающих credentials |
| Backup и сохранение exact origin/CTA off/on в editor config; проверка artifact и live GET/hash/catalog/links | Штатная генерация HTML и ручная публикация в existing Netlify site, сначала off, затем on |
| Actual version/config/schema/auth boundaries и aggregate D1/outbox/audit/receipt read-backs | Login, одна controlled multi-child/multi-lesson заявка, просмотр реального письма, confirmation, Telegram, admin filters/detail/processed |
| Checkpoints и решение о завершении обязательных gates | Финальный переход из live карточки и проверка предвыбора без новой отправки |

Агент заранее сообщает URL/путь, простое действие, ожидаемый результат и короткую
форму ответа. Не требует от владельца SQL/CLI, разбора logs/IDs, правки JSON/HTML.
Не дублирует его UI-сценарий через Computer Use/E2E; при конкретном отказе делает
focused диагностику. Базовый regression03 наследуется, новый полный run без
material diff не нужен. Человек подтверждает видимость/удобство, агент — technical
postconditions; ни один из этих видов evidence не подменяет другой.

Ручные mutations login/submit/confirmation/processed/Netlify publish выполняются
по отдельным инструкциям с existing checkpoint перед следующей mutation;
read-only наблюдения можно объединять. Пока владелец занят, записать waiting_owner
и ровно следующее действие в active state, завершить ответ без polling. При выходе
за Telegram window применить OQ-044: подтвердить queue/not_before и продолжить
CTAon, actual delivery проверить следующим рабочим утром без обхода окна.
Фактически пройденные gates не переоткрывать без drift; auto-delete14 дней уже
подтверждён03, повторная настройка не нужна. Один controlled flow достаточен:
не повторять на production все combinations/negative cases локальных tests.

## Параметры выпуска

Продуктовые OQ-037–047 закрыты, включая запуск до доставки по OQ-044.
Перед deploy выбрать свободное имя workers.dev,
сверить реальные доступы/provider targets, назначить первого admin и проверить
показ согласованного текста TIN-12. Provider IDs и admin
credentials остаются в protected manifest. Рекомендуемое имя нового Worker —
`kolibri-trial-intake`, если оно свободно; это предложение, не существующий target.
Не менять origin после публикации ссылок без отдельного согласованного перехода.

Telegram reuse прямо разрешён владельцем. Если preflight выявит неправильный/
публичный destination, недостаточные права или недоступный credential, подготовить
инструкцию только для недостающего шага. Новый бот не является обязательным gate
ради прежнего общего правила разделения preview/production; исключение TIN-11
действует только для этого ограниченного release.

### Resend: минимальный шаг оператора при отсутствии сохранённого ключа

Выполняется при подготовке secret для нового exact Worker; домен уже настроен.

1. В текущем Resend account открыть **API keys → Create API key**.
2. Название: `kolibri-trial-intake`; Permission: **Sending access**; Domain:
   существующий Verified domain `kolibri-dresden.de`.
3. После создания один раз скопировать ключ в защищённое хранилище оператора.
   Не помещать его в чат, tracked config, screenshot или обычный лог.
4. Когда создан exact production Worker, добавить значение как secret
   `RESEND_API_KEY` в его **Settings → Variables and Secrets** либо проверенной
   командой packet 03 с явным config. Preview key/Worker не изменять.
5. Read-only проверить имя binding и scope ключа; реальную доставку проверять
   только согласованным controlled flow шага 04.

Resend показывает полное значение ключа только при создании; Sending access
можно ограничить одним доменом. См. [документацию Resend](https://resend.com/docs/dashboard/api-keys/introduction).
Создание ключа и привязка secret — разные remote mutations с checkpoint по AGENTS.

## Калибровка сложности

Предлагаемый объём сознательно использует готовые UI, authorization, providers,
outbox engine и D1. Новый intake data slice нужен из-за фактической зависимости
старого trial/email от аккаунтов. JSON внутри того же HTML позволяет выбрать
несколько занятий без второго импорта при обновлении расписания. Остаются только
проверки заявок/дат/доставки/доступа и один
общий выпускной gate. Нет цены, family claim, календаря, договора, загрузки,
нового кабинета родителя и автоматизации обратной связи.

Повторный проход `spec-rightsize` по исходному запросу и уточнениям владельца:
сохранены несколько детей/занятий/дат, весь Telegram payload, рабочее окно,
автоматическое обновление расписания и требуемая изоляция кода. Убраны добавленная
агентом обязательная галочка и повторное согласование готового короткого текста;
проверка доступов перенесена в начало. Изоляция использует папки и текущую сборку,
а не второй проект с дублированной инфраструктурой. Один общий release gate
сохранён из-за изменения migration/shared runtime; повторять его на каждом шаге
не требуется. Новая система тестов, отчётов или review-агентов не добавляется.
Непроверенные до реализации предположения: фактическая пригодность guest-store
adapter без существенной переделки worker и доступность внешних credentials.
Если adapter требует переписывания messaging engine, это пересмотр объёма,
о котором нужно сообщить владельцу, продолжая независимые части.

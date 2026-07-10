# Договоры

Этот документ задаёт канонический контракт для подготовки, отображения,
принятия и административной активации договорных предложений. Все четыре
Word-файла из `references/vorlage/` реально используются Verein и являются
business source для соответствующих цифровых шаблонов. Originals остаются
read-only; цифровая версия получает отдельный version/change log и approval.

## Поддерживаемые виды

| `template_id` | Исходный reference | Назначение |
| --- | --- | --- |
| `group_yearly` | `Jahresvertrag_Eltern24-25(1).docx` | Групповое обучение с годовой моделью |
| `group_monthly` | `Unterrichtsvertrag 2025 Monatsvereinbahrung.docx` | Групповое обучение с помесячной моделью |
| `individual_hourly` | `vertrag Individueller Unterricht.doc` | Индивидуальные занятия с почасовым тарифом |
| `nachhilfe_hourly` | `vertrag Nachhilfe.doc` | Почасовая единица возмещения; финансирование Jobcenter/Sozialamt |

Во всех четырёх файлах отсутствуют Word fields, content controls и bookmarks,
а два файла используют legacy-формат `.doc`. Конвертация DOC/DOCX в runtime
запрещена: результат зависит от Office/LibreOffice, которых нет в Worker, и не
даёт стабильного артефакта. Реализация использует собственные версионируемые
HTML/CSS-шаблоны и Cloudflare Browser Run Quick Action `/pdf` по `ADR-014`.

Один offer/contract покрывает ровно одного ребёнка и ровно одну услугу:
`course_group_id` либо `individual_request_id`. Несколько детей или курсов
оформляются отдельными offers/contracts.

## Версия шаблона и legal gate

Каждая отправляемая версия регистрируется как immutable
`contract_template_version` и содержит:

- `template_id`, `template_version` и `render_schema_version`;
- immutable bundle location/hash, HTML/CSS hash, font/asset manifests,
  `renderer_id`, adapter contract version и Worker compatibility date;
- версию утверждённого clause set и manifest обязательных приложений;
- `usage_scope` (`synthetic_test|production`), `approval_status`,
  `approval_basis`
  (`synthetic_fixture|authorized_verein_approval|legal_review`),
  автора/дату утверждения и интервал применимости;
- список обязательных полей render input.

Этап 09 использует `synthetic_test + approved` template/renderer только в
изолированном harness с синтетическими сторонами. Такой adapter обязан выдавать
валидный PDF, зависящий от canonical input; статический placeholder запрещён.
Он проверяет schema/hash/error contract, но не считается проверкой production
fonts/pagination.

Реальный offer переходит в `sent` только для
`usage_scope=production + approval_status=approved +
approval_basis=authorized_verein_approval|legal_review` и выбранного production
renderer. Если
обязательное поле, приложение, версия clause set или PDF отсутствуют, генератор
завершается fail-closed и оставляет offer в `draft`. Production config не может
включить synthetic adapter.

Approved template bundle, fonts/assets и renderer metadata сохраняются не
короче связанного contract evidence по политике `OQ-005`. Хранить только hash,
перезаписывая source при deploy, запрещено: старую принятую версию и готовый PDF
должно быть возможно проверить. Byte-identical повторный render не обещается.

## Production PDF renderer

`renderer_id = cloudflare-browser-run-pdf-v1` использует Workers binding
`BROWSER.quickAction("pdf", ...)` с compatibility date не ниже `2026-03-24`.
Передаётся self-contained inline HTML, а не публичный/временный URL договора.
JavaScript и внешние network resources запрещены; CSS и pinned Noto Sans
WOFF2/fonts встраиваются из approved bundle.

Базовые print options: A4, `preferCSSPageSize`, `printBackground`, tagged PDF,
outline и timeout 30 секунд. Внутренние limits значительно ниже Cloudflare:
2 MiB HTML и 10 MiB результата.

Render выполняется идемпотентно как `draft -> rendering -> ready|failed`.
Успешный PDF сразу сохраняется в private R2 вместе с PDF SHA-256, source/template/
font hashes, compatibility date, attempt timestamp и `X-Browser-Ms-Used`.
`sent` возможен только из `ready`. На 429/5xx выполняется не более трёх retry с
учётом `Retry-After`, затем manual review; автоматический fallback на другой
renderer запрещён, потому что изменит pagination.

Cloudflare использует managed Chromium без pin/version guarantee. Поэтому
canonical input/source manifest детерминированны, но два render-вызова не обязаны
дать одинаковые PDF bytes. Принятый/утверждённый PDF никогда не
перерендеривается: выдаётся сохранённый immutable artifact.

Free quota — эксплуатационный default для малого Verein; внутренний дневной
budget оставляет запас к лимиту. Перед production обязателен remote spike
четырёх шаблонов (Unicode, длинные имена, 3+ страницы, signature blocks,
text extraction, tolerant visual regression, p95/browser-ms) и проверка
Cloudflare DPA/processing record. PDF/A не обещается.

## Render input

Вход рендера валидируется общей versioned Zod-схемой и включает:

- уникальный технический `offer_number` и optional юридический
  `contract_number` по решению `OQ-013`;
- immutable provider/payment snapshot без реквизитов, зашитых в код;
- snapshot родителя/плательщика и ребёнка;
- вид услуги, связанный course/request/funding authorization, предмет,
  расписание и дату начала;
- `billing_model`, валюту, единицу и длительность тарифа, immutable line items,
  скидки и дополнительные сборы с явным основанием;
- initial term, renewal, ordinary/extraordinary termination и payment terms;
- применимые withdrawal/pre-contract information и версии приложений;
- отдельные ссылки на privacy notice acknowledgement и необходимые consents.

Поддерживаемые billing-модели не смешиваются:

- `annual_total_in_instalments`;
- `monthly_fixed`;
- `delivered_units`;
- `third_party_funded`.

Портал MVP не рассчитывает фактически проведённые почасовые занятия и не
выставляет счета. Для `delivered_units` договор фиксирует только тариф и единицу,
а начисление остаётся вне MVP. Неопределённая цена или единица не заменяется
нулём либо догадкой.

Все пользовательские значения экранируются как данные, а не HTML. Одинаковый
канонический input и template version должны давать одинаковые render-input/
source-manifest hashes; hash фактически полученного PDF сохраняется отдельно.
Тесты обязаны покрывать длинные имена, Unicode, переносы страниц, пустое
обязательное поле и каждый из четырёх template IDs.

## Жизненный цикл и доказательства

`accepted_by_parent` означает зафиксированное действие родителя над конкретным
offer hash, но ещё не образует договор. Договор формируется только когда
уполномоченный admin затем подтверждает ту же immutable version; formation
transaction сохраняет обе стороны evidence и timestamps.

Administrative approval/activation — одно второе явное действие стороны Verein.
Оно формирует immutable связь `contracts` с исходным offer и активирует ровно
один operational record: group `enrollment` либо individual/Nachhilfe
`service_engagement`. Будущий `effective_from` не переносит `formed_at`;
occupancy учитывает date boundary. Service engagement не входит в group
occupancy. Изменение, расторжение, истечение и аннулирование записываются
append-only в `contract_events`, а не переписывают принятый offer.
Выдача HTML/PDF фиксируется в `contract_deliveries` с artifact hash, channel,
recipient и временем; закрытая ссылка сама по себе не считается доказательством
доставки.

Parent cabinet показывает хронологию offer, parent acceptance, admin
approval/formation, effective dates, Kündigung request, termination/expiry/void
и superseding contract. Удаление или завершение operational record не удаляет
историю договора.

## Отдельные документы и согласия

Нельзя объединять одним флагом:

- принятие договорного предложения;
- ознакомление с privacy notice;
- добровольное media/photo consent;
- SEPA mandate;
- согласие/основание для обработки медицинских документов.

До решения `OQ-016` contract flow не создаёт media consent, SEPA mandate или
medical-data consent. Если владелец продукта позднее включает media consent, он
получает отдельную versioned/revocable сущность и не меняет contract status.
Privacy acknowledgement уже хранится отдельно при регистрации. SEPA и payment
collection не входят в MVP. Медицинские справки не загружаются: upload scope
ограничен документами финансирования Jobcenter/Sozialamt из `REQ-03–REQ-08`.

## Матрица production blockers

Blocker применяется по виду offer/включённой функции, а не автоматически ко
всем договорам:

| Область | Должны быть закрыты до production |
| --- | --- |
| Любой contract offer | `OQ-002` payment terms, `OQ-005` retention/evidence, `OQ-013` template/clause/number, `OQ-014` withdrawal, `OQ-015` billing/fees/units |
| Yearly автоматический price review | дополнительно `OQ-001` |
| `ov_special`/manual price | дополнительно `OQ-006` |
| Jobcenter/Sozialamt-funded Nachhilfe | дополнительно `OQ-009` и `OQ-017` |
| Media/SEPA/medical feature | `OQ-016`; пока feature отсутствует и обычный договор не блокирует |

Stage 09 может завершить core с `synthetic_test`-adapter, но это не снимает ни
одного production blocker.

## Юридические риски и минимальные корректировки

Reference-шаблоны содержат различающиеся и местами незавершённые условия по
сроку, продлению, оплате, библиотечному сбору, скидкам, отмене урока,
ответственности, подсудности и media consent. В частности, перед переносом
нужно проверить:

- срок/автопродление и уведомление о расторжении по
  [§ 309 BGB](https://www.gesetze-im-internet.de/bgb/__309.html);
- молчание как согласие с изменением цены по
  [§ 308 BGB](https://www.gesetze-im-internet.de/bgb/__308.html);
- договорную подсудность по
  [§ 38 ZPO](https://www.gesetze-im-internet.de/zpo/__38.html);
- обязательную преддоговорную информацию и формулировку кнопки по
  [§ 312j BGB](https://www.gesetze-im-internet.de/bgb/__312j.html);
- применимость withdrawal process/
  [§ 356a BGB](https://www.gesetze-im-internet.de/bgb/__356a.html) и отдельность
  добровольных согласий по
  [Art. 7 GDPR](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679).

Цифровые версии сохраняют экономическую и операционную суть действующих
шаблонов. Без отдельного решения не меняются тип услуги, тариф, initial term,
периодичность оплаты или cancellation practice. Разрешены только минимальные
очевидные risk corrections с отдельным diff/change log:

- после initial yearly term не обещать новое фиксированное 12-месячное
  автопродление вопреки § 309 Nr. 9 BGB;
- не исключать ответственность за жизнь/здоровье, gross negligence и иные
  случаи, где исключение недопустимо;
- не считать молчание родителя безусловным согласием на новую цену;
- не задавать исключительную подсудность для потребителя шире допустимого;
- вынести media/privacy consent из contract acceptance;
- исправить дубли, незавершённые предложения и ошибочное название услуги.

Это не юридическое заключение. Каждый digital clause diff утверждает
уполномоченный представитель Verein по `OQ-013`; повторная проверка немецким
юристом рекомендуется, если станет финансово доступна. Production send
определяется blocker matrix выше.

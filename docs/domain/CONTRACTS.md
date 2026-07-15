# Договоры

Этот документ задаёт канонический контракт для подготовки, отображения,
принятия и административной активации договорных предложений. Все четыре
Word-файла из `references/vorlage/` реально используются Verein и являются
business source для соответствующих цифровых шаблонов. Originals остаются
read-only; цифровая версия получает отдельный version/change log и approval.

## Поддерживаемые виды

| `template_id` | Исходный reference | Назначение |
| --- | --- | --- |
| `group_yearly` | `Jahresvertrag_Eltern24-25(1).docx` | Годовой срок/условия; ежемесячная плата по `Preis` |
| `group_monthly` | `Unterrichtsvertrag 2025 Monatsvereinbahrung.docx` | Месячный срок/условия; ежемесячная плата по `Sonderpreis` |
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
- `distance_legal_profile`
  (`offline_only|widerruf_applicable|widerruf_not_applicable_312g_2_9`),
  version/hash письменного основания и применимость § 312k;
- список обязательных полей render input.

Этап 09 использует `synthetic_test + approved` template/renderer только в
изолированном harness с синтетическими сторонами. Такой adapter обязан выдавать
валидный PDF, зависящий от canonical input; статический placeholder запрещён.
Он проверяет schema/hash/error contract, но не считается проверкой production
fonts/pagination.

Реальный offer переходит в `sent` только для
`usage_scope=production + approval_status=approved +
approval_basis=authorized_verein_approval|legal_review` и выбранного production
renderer. Online send дополнительно требует утверждённый не-`offline_only`
`distance_legal_profile`. Если
обязательное поле, приложение, версия clause set или PDF отсутствуют, генератор
завершается fail-closed и оставляет offer в `draft`. Production config не может
включить synthetic adapter.

Approved template bundle, fonts/assets и renderer metadata сохраняются не
короче связанного contract evidence по политике
[PRIVACY_RETENTION.md](PRIVACY_RETENTION.md); automatic archive purge выключен.
Хранить только hash,
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

- уникальный технический `offer_number` и обязательный для production render/
  send юридический `contract_number`;
- immutable provider/payment snapshot без реквизитов, зашитых в код;
- snapshot родителя как contracting party и ребёнка; для
  `third_party_funded` parent не получает payer role, а payer identity/details в
  structured snapshot отсутствуют;
- вид услуги, связанный course/request/funding authorization, предмет,
  расписание и дату начала;
- `billing_model`, валюту, единицу/длительность, price source/base/mode/final,
  immutable line items и дополнительные сборы с явным основанием;
- initial term, renewal, ordinary/extraordinary termination и payment terms;
- применимые withdrawal/pre-contract information и версии приложений;
- отдельные ссылки на privacy notice acknowledgement и необходимые consents.

Поддерживаемые billing-модели не смешиваются:

- `monthly_group_fee` — для обеих групповых моделей; contract kind определяет
  срок/колонку ставки, но не превращает плату в цену одного занятия;
- `delivered_units` — только `individual_hourly`;
- `third_party_funded` — только `nachhilfe_hourly`.

Contract kind, matching template ID, service relation и billing model образуют
закрытую матрицу: обе group-модели требуют course/enrollment,
`individual_hourly` — self-pay request/engagement без funding,
`nachhilfe_hourly` — Nachhilfe request/engagement и approved authorization с
approved current documents. Любая cross-kind permutation отклоняется до render/
send и повторно при activation.

Групповая цена — базовый месячный тариф еженедельных занятий. Для fallback
90 минут это 4600 cents по yearly и 6000 cents по monthly contract. Каникулы не
оплачиваются, но portal MVP не содержит holiday calendar, pauses, prorating и
не рассчитывает фактическую payable amount; это явно указано рядом с base price.
Для self-pay Individual immutable offer snapshot фиксирует актуальный tariff из
валидированной server configuration; default — 3000 cents за академический час
45 минут. Для funded Nachhilfe unit rate фиксирован и равен 3000 cents за 45
минут, он не наследует изменяемую Individual configuration. Портал MVP не
считает число проведённых units. Nachhilfe дополнительно требует только funding
kind, approved document и inclusive `valid_from|valid_until`, без payer
agreement, case reference или approved-hours ledger. Offer term за пределами
`valid_until` остаётся manual/fail-closed; поэтому Nachhilfe offer
хранит structured inclusive `effective_from|effective_to`, а не проверяет срок
только внутри JSON snapshot. При activation inclusive contract end проецируется
в exclusive `enrollment|service_engagement.active_until` как следующий local
calendar day; в последний `valid_until` услуга ещё разрешена.

Портал MVP не рассчитывает фактически проведённые почасовые занятия и не
выставляет счета. Для `delivered_units` договор фиксирует только тариф и единицу,
а начисление остаётся вне MVP. Неопределённая цена или единица не заменяется
нулём либо догадкой.

Все пользовательские значения экранируются как данные, а не HTML. Одинаковый
канонический input и template version должны давать одинаковые render-input/
source-manifest hashes; hash фактически полученного PDF сохраняется отдельно.
Тесты обязаны покрывать длинные имена, Unicode, переносы страниц, пустое
обязательное поле и каждый из четырёх template IDs.

## Payment information

Портал не создаёт/изменяет SEPA mandate, не инициирует списание, не ведёт ledger
и не определяет задолженность. Immutable billing snapshot содержит только
информационный `payment_arrangement`:

- `existing_external_sepa` — admin вручную подтверждает, что вне портала уже
  действует SEPA-Lastschrift; текст сообщает об ожидаемом автоматическом
  списании фактической суммы вне портала, которая может отличаться от base price;
- `manual_payment` — текст требует самостоятельно оплатить фактическую сумму с
  учётом внешних перерасчётов не позднее 7-го числа месяца, следующего за
  расчётным; base-price total не выдаётся за invoice;
- `not_applicable` — только для `third_party_funded` Nachhilfe; parent не
  показывается как плательщик и due day отсутствует.

Unknown arrangement fail-closed уходит в admin review; система не утверждает,
что счёт выставлен, платёж получен или долг отсутствует. Payment text version,
due-day rule и arrangement входят в offer hash/PDF.

## Номер договора

Raw legacy `FamilyID` хранится без изменения в namespace 1, например
`1. 3477`. Portal-only family получает namespace 2 и display с минимум четырьмя
цифрами sequence, например `2. 0001`; после `9999` sequence естественно растёт,
не переполняясь и не переиспользуясь. Unverified account номера не имеет.
Первая успешная email-verification завершает регистрацию: один eligible exact
legacy-email match назначает namespace 1, а его отсутствие/неоднозначность —
новый namespace 2 по `CLAIM-02`. Каждый portal-child сразу получает current
family аккаунта.

Каждый contract использует атомарный sequence canonical family и печатается как
`1. 3477-1` либо `2. 0001-1`. Номер резервируется до render/send offer PDF и
сразу считается израсходованным: decline, expiry, render retry или cancellation
не возвращают его в pool. Подтверждённый поздний legacy claim либо admin
correction меняет current family и переключает будущую sequence на destination.
Уже выданные numbers, offer/contract PDF, acceptances и formation certificates
не переписываются; прежняя allocation хранится как historical alias. Любой ещё
не заключённый nonterminal offer со старым `family_number_id_at_issue`
supersede-ится и при необходимости создаётся новая version с новым номером.
Collision блокирует production send. `offer_number` остаётся отдельным
техническим ID.

## Жизненный цикл и доказательства

`accepted_by_parent` означает зафиксированное действие родителя над конкретным
offer hash, но ещё не образует договор. Договор формируется только когда
уполномоченный admin затем подтверждает ту же immutable version; formation
transaction сохраняет обе стороны evidence и timestamps.

Исходный offer PDF создаётся до acceptance и после отправки не переписывается.
Он вместе с parent/admin action records образует проверяемый evidence bundle.
После admin formation из неизменяемого source snapshot один раз создаётся
отдельный `formation certificate` PDF с contract/offer number, сторонами/ролями,
parent/admin timestamps, offer PDF hash и formation source/evidence hash.
Собственный PDF hash хранится в artifact/delivery metadata, а не внутри самого
PDF. Сторонам выдаются оба artifact; объединённый
signed-copy PDF и рисунки/изображения подписей не создаются. Failed render можно
повторить только из того же source hash; готовый certificate не
перерендеривается.

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

## Widerruf, Kündigung и взаимное прекращение

Это разные процессы и разные evidence records:

- `withdrawal` — statutory Widerruf принятого online contract; при применимости
  принимается системой без admin approval и немедленно подтверждается на
  durable medium;
- `ordinary_termination|extraordinary_termination` — односторонняя Kündigung;
  система неизменно фиксирует получение и желаемую дату, admin подтверждает
  рассчитанную effective date либо открывает dispute, но не «принимает» сам
  факт заявления;
- `mutual_termination_request` — просьба прекратить раньше договорной даты по
  соглашению сторон; только она может ждать `approved|declined` admin.

Наличие задолженности не блокирует приём withdrawal/Kündigung и не удаляет
отдельное денежное требование. Поскольку портал не ведёт ledger, admin может
зафиксировать лишь результат внешней ручной сверки для mutual request.

Для `group_monthly` ordinary Kündigung, полученная в календарном месяце M,
завершает услугу последним днём M; с первого дня M+1 base price не действует.
Для `group_yearly` receipt до contractual end не сокращает текущий term, но
запрещает auto-renewal после него. Debt не сдвигает эти даты. Применимость
statutory Widerruf/early-performance и § 312k задаётся утверждённым legal profile
конкретной production template version, а не owner/product догадкой.

Для `individual` и `nachhilfe` нет trial и recurring fee. Individual unit 45
минут использует tariff, зафиксированный offer snapshot из server configuration
(default 3000 cents); funded Nachhilfe unit 45 минут фиксирован на 3000 cents, и
при Nachhilfe платит Jobcenter/Sozialamt, а не parent. Уведомление parent «больше
не посещаем»
немедленно завершает service engagement и прекращает ещё не оказанные будущие
units, и Verein не предъявляет за них требований. Это attendance notice, а не
обязательно formal Kündigung contract; её parent может отправить отдельно. Если
сообщение не дошло вовремя и teacher пришёл/ожидал на уже согласованный lesson,
этот unit может быть выставлен. Правило «вовремя» не имеет произвольного cutoff
в минутах: требование возможно только когда teacher фактически пришёл/начал
ждать до получения notice. Если server/admin receipt зафиксирован до прихода
teacher, unit не выставляется. Если receipt позже, manual evidence хранит
согласованные дату/место, фактическое время прихода/ожидания teacher и время
получения notice; портал сам invoice/charge не создаёт. Молчание после последнего
посещения не создаёт новые units.

Это business/no-show правило закрыто и не зависит от statutory Widerruf.
Отдельно, offline contract в бюро не является тем же каналом, что
Fernabsatzvertrag, а оплата только проведённых units сама по себе не названа
исключением в [§ 312g BGB](https://www.gesetze-im-internet.de/bgb/__312g.html).
Поэтому production approval каждой template version обязан письменно выбрать
ровно один legal profile:

- `widerruf_applicable`: 14-day information/function включены; если услуга может
  начаться раньше, parent отдельно и versioned просит early performance и видит
  информацию о возможном пропорциональном Wertersatz по
  [§ 357a BGB](https://www.gesetze-im-internet.de/bgb/__357a.html);
- `widerruf_not_applicable_312g_2_9`: approval evidence прямо документирует, что
  договор относится к leisure service с specific date/period, и клиент получает
  утверждённую информацию о неприменимости;
- `offline_only`: template нельзя отправить/заключить online.

Разработчик не выбирает профиль по названию услуги. Если profile не утверждён,
online send fail-closed; это release legal gate, не открытый owner question и не
изменение правила «после notice будущих units нет».

## Отдельные документы и согласия

Нельзя объединять одним флагом:

- принятие договорного предложения;
- ознакомление с privacy notice;
- добровольное media/photo consent;
- SEPA mandate;
- согласие/основание для обработки медицинских документов.

Contract flow не создаёт SEPA mandate или medical-data consent. Если применимый
шаблон содержит media/photo/video publication permission, рядом показываются
отдельные optional решения по capture type `photo|video` и publication channel
`website|social_media|print`; publication разрешена только при grant обоих
соответствующих scopes. Отказ не блокирует contract acceptance. Versioned текст
media clause входит в PDF всегда. Decision snapshot
может войти в него только если отдельное действие произошло до immutable
render/send; решение после send и любой последующий revoke хранятся только в
append-only consent history и не перезаписывают PDF/contract status.
Operational право хранится отдельно по ребёнку, а отсутствие явного grant
означает запрет publication. Consent остаётся отзываемым, но self-service revoke
в кабинете/API не реализуется. Parent может сообщить отзыв одним из трёх
утверждённых способов:

- лично в бюро по актуальному адресу, опубликованному в
  [официальном Impressum](https://kolibri-dresden.de/impressum/);
- по официальному email со страницы
  [Kontakt](https://kolibri-dresden.de/kontakt/);
- по официальному телефону с той же страницы Kontakt.

Admin не принимает бизнес-решение и не может отклонить отзыв: он только
после обычной проверки связи обращения с owning parent идемпотентно регистрирует
ребёнка, отозванные scopes, channel, фактический `received_at` и минимальный
evidence без полного email body/записи звонка. Проверка не должна раскрывать
данные ребёнка звонящему. Permission прекращается с `received_at`, а не с более
позднего момента ввода admin. Успешное удаление кабинета создаёт такой же
append-only revoke для всех ещё действующих grants с
`effective_from=account_deleted_at`. Удалять cabinet/contract ради отдельного
отзыва не требуется.

Withdrawal contacts не hardcode в UI/template: approved versioned configuration
хранит snapshot/hash адреса, email, телефона и Impressum/Kontakt URLs,
показанных при grant. Перед production уполномоченный представитель Verein
утверждает немецкую редакцию текста и contact snapshot. Базовая редакция для
такого approval:

> Sie können eine erteilte Einwilligung jederzeit mit Wirkung für die Zukunft
> widerrufen. Der Widerruf ist persönlich im Büro an der im Impressum genannten
> Anschrift sowie per E-Mail oder telefonisch über die auf unserer Kontaktseite
> veröffentlichten Kontaktdaten möglich. Eine automatische Widerrufsfunktion im
> Kundenkonto ist nicht vorgesehen. Die Löschung Ihres Kundenkontos gilt ab dem
> Löschungszeitpunkt als Widerruf aller zu diesem Zeitpunkt noch aktiven
> Medieneinwilligungen. Die Rechtmäßigkeit der bis zum Widerruf erfolgten
> Verarbeitung bleibt unberührt. Ab Eingang des Widerrufs nehmen wir für die
> widerrufenen Aufnahmearten und Veröffentlichungswege keine neuen Aufnahmen,
> Uploads, Veröffentlichungen, erneuten Veröffentlichungen oder Nachdrucke vor.
> Bereits veröffentlichte Inhalte werden nicht automatisch gesucht oder
> entfernt. Wenn Sie die Prüfung eines bestimmten älteren Beitrags wünschen,
> nennen Sie uns bitte den konkreten Link oder Beitrag; der Antrag wird gesondert
> geprüft.

Privacy acknowledgement уже хранится отдельно при регистрации. Медицинские
справки не загружаются: upload scope ограничен документами финансирования
Jobcenter/Sozialamt из `REQ-03–REQ-08`.

Портал не хранит сами media files, не индексирует официальный сайт/локальное
облако/social media и не ведёт исторический реестр, кто изображён на материалах.
Withdrawal меняет permission status на дату receipt и запрещает новые capture,
upload, post, repost и reprint; обработка до receipt не становится от этого
ретроактивно незаконной. Уже распространённые print copies физически не
отзываются. Старые online materials автоматически не ищутся и не удаляются.
Если parent сам указывает конкретный URL/post и просит deletion, это отдельный
manual privacy request вне MVP media workflow; он оценивается case-by-case по
legal ground и фактической возможности, без blanket promise удалить всё и без
blanket refusal никогда не удалять.

Основание safe gate — [Art. 7(3) GDPR](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
и [EDPB Guidelines 05/2020 on consent](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en):
withdrawal действует на будущее, а отозвать согласие должно быть так же просто,
как дать его. Текущий owner flow принимает office/email/phone, но не предоставляет
revoke в том же online cabinet, где grant мог быть дан. Поэтому online grant и
последующая publication остаются выключенными, пока документированная
compliance assessment применимого процесса не подтвердит выполнение Art. 7(3)
GDPR/EDPB guidance либо не будет реализован и утверждён иной compliant withdrawal
path. Одного approval текста, contact snapshot или принятия риска представителем
Verein недостаточно, чтобы заменить обязательное требование. Отказ/отсутствие
grant договор не блокирует. При отсутствии другого legal ground после withdrawal
может применяться erasure logic Art. 17, но это не создаёт для портала обязанности
заранее каталогизировать все исторические media.

## Матрица production blockers

Blocker применяется по виду offer/включённой функции, а не автоматически ко
всем договорам:

| Область | Должны быть закрыты до production |
| --- | --- |
| Любой online contract offer | Approved production template и не-`offline_only` legal profile; при `widerruf_applicable` реализованы § 356a/early-performance requirements, при applicable Dauerschuldverhältnis — § 312k. Automatic legal-archive purge выключен |
| Portal family/contract numbering | Open product blocker отсутствует; email-verification/family finalization, name-match proof, admin reassignment и immutable historical-number rules должны пройти acceptance tests. Ambiguous/colliding/other-owned destination остаётся fail-closed |
| Automatic price-change apply | Открытого blocker нет; действует immutable 14-day/next-month evidence flow из PRICING.md |
| `manual_override` | Открытого blocker нет, но обязателен high-friction/audit contract из PRICING.md |
| Jobcenter/Sozialamt-funded Nachhilfe | Open product blocker отсутствует; manual local-AV upload flow и funding expiry/replacement lifecycle обязательны |
| Media consent/publication | Online grant и publication disabled, пока документированная compliance assessment не подтвердит, что withdrawal path удовлетворяет требованию простоты отзыва, либо не реализован иной approved compliant path. German text/contact snapshot и admin runbook обязательны, но risk acceptance не заменяет соблюдение права. Publication по неподтверждённому scope запрещена |
| SEPA/medical feature | Вне MVP; включение требует нового требования и privacy review |

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
шаблонов. Портал фиксирует только base price и не рассчитывает holiday/proration/
fee/discount adjustments. Без отдельного решения не меняются тип услуги,
initial term или cancellation practice. Разрешены только минимальные
очевидные risk corrections с отдельным diff/change log:

- после initial yearly term не обещать новое фиксированное 12-месячное
  автопродление вопреки § 309 Nr. 9 BGB;
- не исключать ответственность за жизнь/здоровье, gross negligence и иные
  случаи, где исключение недопустимо;
- не считать молчание родителя безусловным согласием на новую цену;
- не задавать исключительную подсудность для потребителя шире допустимого;
- вынести media/privacy consent из contract acceptance;
- исправить дубли, незавершённые предложения и ошибочное название услуги.

Для online lifecycle дополнительно необходимо проверить Kündigungsbutton по
[§ 312k BGB](https://www.gesetze-im-internet.de/bgb/__312k.html), 14-дневный
Widerruf и раннее исполнение/возможный Wertersatz. С 19 июня 2026 года
электронная Widerrufsfunktion из § 356a BGB должна учитываться там, где право
применимо. Debt-check нельзя формулировать как общий admin veto на полученную
Kündigung; условное согласование долга относится только к отдельному
`mutual_termination_request`.

Routes для § 356a/§ 312k нельзя заранее ограничивать authenticated cabinet:
требования к постоянной доступности, минимальной идентификации и немедленной
durable confirmation задаются legal profile и соответствующей нормой. Public
submission не показывает,
существует ли contract/account, и может быть связан с ним только безопасным
match либо admin review.

Это не юридическое заключение. Каждый digital clause diff утверждает admin от
имени Verein; повторная проверка немецким
юристом рекомендуется, если станет финансово доступна. Production send
определяется blocker matrix выше.

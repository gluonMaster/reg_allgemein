# Критерии приемки и краевые случаи

Критерии дополняют [MVP_SPEC.md](MVP_SPEC.md), но не вводят отдельные
бизнес-правила. Идентификаторы в скобках указывают связанные требования.

## 1. Глобальное Definition of Done

MVP готов, когда:

- миграции применяются к чистой D1 и повторно проверяются в preview-среде;
- импорт текущих безопасных reference-файлов завершается отчетом, а повторный
  запуск не создает дубликаты;
- все обязательные пользовательские и административные сценарии ниже проходят;
- `npm run check`, `npm test` и `npm run build` выполняются успешно;
- authorization-, CSRF-, import rollback-, pricing- и upload-тесты включены в
  автоматический набор;
- секреты, source PII и generated artifacts отсутствуют в git и build output;
- production-конфигурация, миграции и rollback описаны; backup/restore для D1
  и R2 документирован, а тестовое восстановление в непроизводственную среду
  успешно проверено до production. (`REL-02`)
- все production blockers из `OPEN_QUESTIONS.md` закрыты либо функция, которой
  они касаются, явно отключена в production.

## 2. Auth и изоляция данных

- Регистрация с нормализованным дубликатом email не создает второго аккаунта и
  не раскрывает существование первого. (`AUTH-01`, `AUTH-07`)
- Успешная registration transaction создаёт ровно одно immutable
  acknowledgement выбранной privacy notice version; rollback или отсутствие
  явного принятия не оставляет account/acknowledgement. (`AUTH-02`, `REL-01`)
- Два аккаунта с одинаковым паролем получают разные salted hashes. Пароль
  отклоняется по ограничению длины до hash operation; исходный пароль и hash не
  появляются в логах, telemetry или тексте ошибки. (`AUTH-03`)
- Регистрация на чужой неистекший `pending_email_normalized` не резервирует тот
  же адрес; ответ не раскрывает владельца reservation. (`AUTH-01`)
- Истекший или повторно использованный verification/reset token отклоняется;
  в БД нет исходного токена. (`AUTH-04`, `AUTH-05`)
- После logout, reset password, смены email или блокировки прежняя сессия не
  дает доступ. (`AUTH-05`, `AUTH-09`)
- Два последовательных запроса смены email создают разные `email_version`;
  token первого запроса не подтверждает адрес второго и не меняет current email.
  (`AUTH-05`)
- Confirmation заново проверяет current и pending uniqueness. Если за время TTL
  адрес стал недоступен, прежний email пользователя сохраняется; истекшая
  reservation позже освобождается. (`AUTH-05`)
- POST без валидного CSRF отклоняется; API с bearer/internal auth не смешивает
  механизмы защиты случайно. (`AUTH-06`)
- Обход client-side validation не обходит server schema; SQL-injection payload
  остаётся данными параметризованного запроса, а сохранённый пользовательский
  HTML отображается экранированным. Автотесты покрывают CSRF, authorization и
  rate limits на изменяющих endpoints. (`SEC-01`)
- Изменение `child_id`, `request_id`, `document_id`, `offer_id` или `thread_id`
  на идентификатор другого пользователя всегда дает безопасный `403/404`, в том
  числе для R2 download. (`AUTH-08`, `REQ-07`)
- Публичная регистрация не может создать admin; заблокированный admin также не
  проходит middleware. (`AUTH-09`)

## 3. Legacy claim

- До email verification ответы и UI одинаковы независимо от наличия legacy-
  совпадения. (`CLAIM-01`)
- После email verification учитываются все совпавшие нормализованные legacy-
  email аккаунта и показывается только обезличенное предложение claim; до
  явного подтверждения семья, дети и занятия не связываются. (`CLAIM-02`)
- Один email с несколькими `FamilyID` связывает выбранный набор атомарно и
  создает review task; повтор запроса возвращает тот же результат. (`CLAIM-03`,
  `CLAIM-04`)
- Два аккаунта, одновременно претендующие на одну семью, не получают два
  владения; проигравшая операция создает ручную проверку без утечки PII.
  (`CLAIM-05`)
- Родитель не может сменить owning account ребёнка через UI или прямой API.
  Исправление владельца администратором требует причины, оставляет audit event
  и не создаёт у ребёнка двух владельцев. (`CLAIM-08`)
- Семья без email и совпадение только по имени никогда не self-claim. (`CLAIM-06`)
- Одинаковые имена детей с разными датами рождения не объединяются; пустая или
  конфликтующая дата создает warning/review. (`CLAIM-07`)
- Approved correction legacy child переживает повторный import: source value
  обновляется отдельно, а effective override сохраняется. (`CHILD-02`)
- Verified parent без legacy claim может создать ребёнка только с непустыми
  `full_name` и `birth_date`; без сохранённого owned child trial/request submit
  отклоняется. (`CHILD-01`)
- Create/update/select child повторно проверяет owner на сервере. Возможный
  дубликат внутри одного аккаунта требует явного решения пользователя, а
  публичный API не выполняет и не раскрывает cross-account сравнение детей.
  (`CHILD-03`)
- Совпавший непротиворечивый `source_namespace+FamilyID` в новом academic period
  наследует claim/owner и stable child, но получает новые period enrollments.
  Контактный/child конфликт или ошибочное повторное использование FamilyID
  создаёт continuity review без передачи owner. (`CLAIM-09`)
- Access row `ID` уникален только внутри source namespace + academic period:
  одинаковое значение в новом периоде не перезаписывает старую source row.

### Кабинет родителя

- На fixture с импортированным и portal-child кабинет показывает профиль,
  owned children, будущие импортированные занятия, активные enrollments, trials,
  requests/service engagements, contract offers и обращения; закрытие
  enrollment/engagement не удаляет хронологию заключения, активации и
  Kündigung договора. (`CAB-01`)
- Месячный итог включает только текущие цены активных `group|dance_group`
  enrollments. Trial, inactive/future enrollment, `individual`, `nachhilfe`,
  платежи и задолженность в сумму не входят, что явно указано рядом с итогом.
  (`CAB-02`)
- Self-pay `individual` показывает configured тариф за 45 минут (default 3000
  cents) и предупреждение об отсутствии учёта фактически проведённых уроков.
  `nachhilfe` показывает утверждённые authority, срок и объём, но не self-pay
  тариф или сумму к оплате родителем. (`CAB-03`)
- До решения `OQ-002` кабинет дословно показывает `payment_due_text` принятого
  договора и не вычисляет срок, задолженность или признак получения платежа.
  (`CAB-04`)
- Ни HTML кабинета, ни его API response не содержат admin notes, import
  diagnostics, служебные source/import identifiers или данные другой семьи.
  (`CAB-05`)

## 4. Импорт

- Отсутствие обязательной колонки, неверная версия схемы или критическая ошибка
  оставляет предыдущую активную версию без изменений.
- `Value4 = Zahlung`/служебная строка не создает ребенка или enrollment.
- `KN` не попадает в occupancy; `NH`, `N`, `IND` не становятся групповым
  месячным договором.
- Переименование package в том же `ID + slot` обновляет запись, а не создает
  новую.
- Тот же Access hash с другой PlusBText dependency или academic period создает
  новый run; no-op действует только при совпадении всех трех составляющих.
- Macro-enabled PlusBText fixture читается без Office automation/исполнения
  VBA: в extract попадают только allowlisted sheet/columns, а extra,
  hidden/veryHidden PII-like fields отсутствуют в stage/report.
- Encrypted/unsupported XLSM, отсутствующий `PlusBText`/обязательная колонка или
  изменённый source profile завершается fail-closed до promotion.
- Новый content SHA при прежнем approved source-contract/schema создаёт новый
  run без требования совпадения старых values; structural fingerprint drift
  блокирует staging до новой contract version.
- PlusBText enrichment не связывает `E/F` и `K/L/M/N/T` по номеру строки:
  exact `L` имеет приоритет, fallback использует
  `F -> E -> K token -> target`. Duplicate/conflict/dangling/missing создают
  warning/review, не first-row или соседний default. Непустое valid positive
  integer `T` публикуется как минуты, пустое остаётся `null`, а непустое
  невалидное значение создаёт issue; importer никогда не записывает вместо
  него 90.
- Failed run можно повторить с тем же fingerprint; только уже promoted run
  превращает повтор в no-op. Два concurrent attempts публикуют одну version.
- Import без явного `academic_period` или с неизвестным period завершается до
  staging; имя файла не используется как догадка.
- Повтор schedule snapshot с теми же `generation_id` и block IDs является
  no-op; одинаковые display names не объединяются.
- Исчезнувшая из нового полного snapshot запись помечается для сверки/soft
  state только после успешной публикации; данные не удаляются молча.
- Неоднозначный email, child identity, group mapping, price rule или duration
  создает `import_issue`/review, а не произвольное совпадение.
- Import report содержит counts, skipped, warnings и unmatched entities, но не
  содержит полные клиентские строки или документы.

## 5. Каталог, capacity и trial

- Каталог использует только опубликованную версию периода; прошлые или staging-
  данные не смешиваются с ней. (`CAT-01`)
- Две разные schedule-записи с одинаковым названием остаются разными курсами,
  пока админ явно их не сопоставит. (`CAT-02`)
- CTA опубликованных `group|dance_group` открывает trial form для выбранной
  группы; CTA `nachhilfe|individual` открывает соответствующую request form и
  не предлагает trial. (`CAT-03`)
- Полная группа показывает ручное подтверждение, но не обещает очередь или
  место. (`CAT-04`)
- Nachhilfe/individual не позволяют создать trial ни через UI, ни прямым API.
  (`TRIAL-01`)
- Админ может подтвердить или отклонить trial; `rejected` хранит причину, а
  повтор подтверждения не создает вторую запись. (`TRIAL-02`, `TRIAL-03`)
- Trial в прошлом, duplicate open trial и переход из terminal
  (`rejected|cancelled|no_show|converted`) status отклоняются; из `attended`
  разрешён только `converted`. (`TRIAL-03`, `TRIAL-04`)
- Trial любого статуса не меняет ценовую численность. (`TRIAL-05`)

## 6. Цена

- Для quote кандидату при `N` активных местах lookup использует
  `min(N + 1, 6)`; для пересмотра существующих enrollments после изменения
  состава при `N > 0` используется `min(N, 6)`, без второго `+1`. При `N = 0`
  price lookup/items не создаются.
- Capacity 12/15 не меняет price lookup cap 6.
- Legacy occupancy и portal occupancy объединяются без двойного учета связанной
  записи и вычисляются на выбранную дату.
- Public quote использует regular `Preis`; `Sonderpreis` не выбирается по
  клиентскому вводу или автоматически перенесенной заметке.
- Self-pay `individual` показывает configured tariff за 45 минут. `nachhilfe`
  не получает self-pay quote/сумму к оплате родителем и до одобренного
  Jobcenter/Sozialamt funding/payer snapshot остаётся в admin review.
- В contract draft только admin может выбрать `ov_special`/manual с reason,
  immutable snapshot и audit; подмена mode/amount родителем отклоняется. Право
  на special не выводится автоматически до решения `OQ-006`.
- Exact lookup учитывает key, subject-duration vector и child count. Равные или
  неоднозначные кандидаты возвращают `needs_admin_review`.
- Для однозначного `group|dance_group` с пустым `PlusBText!T`, известными
  `group_yearly|group_monthly` и price key разрешён только quote-fallback 90
  минут: `2 × 2300 = 4600` либо `2 × 3000 = 6000` cents. Он помечен
  `ESTIMATED_MISSING_DURATION`, показывает немецкое предупреждение и требует
  admin confirmation длительности, суммы и billing period.
- Fallback не меняет source `null`, не входит в monthly total/repricing и не
  используется в отправленном offer до admin confirmation. Он запрещён для
  `individual|nachhilfe|group_nachhilfe`, unknown/ambiguous mapping или contract
  kind, непустого/невалидного `T` и missing/ambiguous price key.
- Manual override имеет приоритет над base/discount, содержит причину и admin
  audit; итог не может быть отрицательным.
- Старый quote после смены price/schedule version или occupancy пересчитывается
  при создании offer и не считается гарантированной ценой.
- Один price review batch создает отдельный item для каждого затронутого
  enrollment; согласие одного родителя не меняет статусы остальных.
- Price increase не вступает задним числом; неполученное согласие не активирует
  новую цену и создает manual contact task.

## 7. Requests и документы

- После сохранения и повторной загрузки request неизменно содержит owned child,
  тип, subjects/description, дни, временные окна, формат
  `online|onsite|mixed`, предпочитаемые места и funding source; неизвестный
  формат и child другого владельца отклоняются сервером. (`REQ-01`)
- Submitted `individual` использует только `self_pay`. Submitted `nachhilfe`
  без Jobcenter/Sozialamt authority+document отклоняется; self-pay tutoring
  направляется в individual flow. (`REQ-03`)
- Переход `needs_info -> submitted/pending_admin_review` возможен после ответа;
  rejected/cancelled request не активируется напрямую. (`REQ-02`)
- Parent может отменить каждое нетерминальное состояние request, а approved —
  до создания contract/enrollment; `submitted` проходит явно проверяемые
  переходы, а не остается неописанным состоянием. (`REQ-02`)
- Файл с ложным расширением, неподдерживаемой сигнатурой, превышением лимита или
  количеством сверх лимита отклоняется до сохранения metadata. (`REQ-06`)
- Несколько JPEG/PNG разрешены в пределах лимита; два повтора одной upload-
  операции не создают два документа.
- Принятый upload хранится в private R2 под непредсказуемым ключом без public
  URL; D1 содержит metadata, checksum и начальное состояние `quarantined`, но
  не содержимое файла. (`REQ-05`)
- Истекшее Jobcenter/Sozialamt-разрешение не используется для новой активации.
  (`REQ-04`)
- Удаленный/замененный файл недоступен пользователю, но audit metadata и событие
  удаления сохраняются. (`REQ-08`)
- Новый файл остается `quarantined`; обычный/public download запрещен, доступ
  admin возможен только через изолированный auditable viewer до решения
  `OQ-009`.
- `group_nachhilfe` отсутствует в публичном каталоге, quote и trial flow. Его
  создание через parent API отклоняется; admin обязан задать manual capacity,
  price и условия Jobcenter/Sozialamt. (`REQ-09`)

## 8. Договоры и price review

- Созданный offer round-trip сохраняет immutable snapshot provider/сторон,
  одной услуги, расписания, billing line items, price mode, срока/renewal/
  termination, start date, payment/withdrawal terms, приложений, clause set и
  privacy notice; последующее изменение source-данных не мутирует этот snapshot.
  (`CONTRACT-02`)
- Offer всегда имеет `expires_at` и одно из состояний `draft`, `sent`,
  `accepted_by_parent`, `declined_by_parent`, `approved_by_admin`, `cancelled`,
  `expired`, `superseded`; неизвестное состояние/переход отклоняется, а offer с
  прошедшим `expires_at` нельзя принять. (`CONTRACT-04`)
- Все четыре template IDs проходят schema/render tests. DOC/DOCX не
  конвертируются в runtime; отсутствующее обязательное поле, несколько service
  relations, unapproved template или `synthetic_test` template в production
  оставляют offer в `draft`.
  (`CONTRACT-11`, `CONTRACT-13`, `CONTRACT-14`)
- Одинаковый canonical render input + template/renderer version даёт тот же
  source manifest/hash; long Unicode values экранированы, HTML page-break
  contract устойчив. Synthetic PDF parseable и меняется вместе с input, но не
  выдаётся за production visual conformance. (`CONTRACT-03`, `CONTRACT-13`)
- Approved bundle, fonts/assets и renderer metadata старой offer version
  доступны после нового deploy/template version вместе с готовым immutable PDF;
  byte-identical rerender managed Chromium не требуется.
  (`CONTRACT-03`, `CONTRACT-13`)
- Browser Run получает только self-contained inline HTML; successful attempt
  сохраняет PDF/hash/browser-ms в private R2 до `sent`. 429/5xx ограничены тремя
  retry, budget/size excess и final failure оставляют offer в `draft`.
  (`CONTRACT-11`)
- Acceptance доступен только владельцу ребенка и только для актуального
  `sent` offer; `draft`, `expired`, `cancelled` и измененный hash отклоняются.
  (`CONTRACT-05`, `CONTRACT-07`)
- Двойной клик/повтор запроса создает один acceptance log. (`CONTRACT-07`)
- Acceptance log после успешного действия содержит timestamp, user, offer
  hash, acceptance-text version, user agent и IP в рамках retention policy;
  попытка изменить или удалить evidence через обычный application path
  отклоняется. (`CONTRACT-06`)
- Admin approval/activation без parent acceptance невозможна; две одновременные
  операции не создают два contract/enrollment/service engagement. Request
  activation не меняет group occupancy. (`CONTRACT-08`, `CONTRACT-09`)
- Первая offer series атомарно создаёт/связывает один draft operational record;
  superseding version переиспользует его. Cancel/decline/expiry последнего open
  offer не оставляет orphan draft, блокирующий новый offer.
  (`CONTRACT-01`, `CONTRACT-09`)
- Parent acceptance не создаёт contract. Последующий admin approval той же
  version/hash одной transaction создаёт contract с обеими сторонами evidence и
  formation timestamp. (`CONTRACT-08`, `CONTRACT-16`)
- Contract child/service/funding и operational relation точно совпадают с
  approved offer и повторно выполняют XOR. Nachhilfe требует действующее
  approved Jobcenter/Sozialamt funding; individual запрещает его.
  (`CONTRACT-01`, `CONTRACT-14`)
- Изменившаяся после offer цена или вместимость требует явного admin review и,
  если условие договора изменилось, новой версии offer. (`CONTRACT-03`,
  `CONTRACT-08`)
- Accepted offer, который невозможно активировать, можно отменить с причиной
  или supersede новой version; прежнее acceptance не переносится.
  (`CONTRACT-12`)
- Contract acceptance не заменяет privacy acknowledgement и не создаёт
  media/SEPA/medical consent; эти поля отсутствуют до решения `OQ-016`.
  (`CONTRACT-15`)
- Production offer нельзя отправить до закрытия всех применимых строк blocker
  matrix из `domain/CONTRACTS.md`. Технический status `accepted_by_parent` сам
  не объявляет момент заключения договора.
  (`CONTRACT-11`, `CONTRACT-16`)
- Отправка HTML/PDF создаёт deduped delivery evidence. Admin approval/activation
  формирует один contract; будущий `effective_from` не меняет `formed_at` и не
  попадает в occupancy раньше даты. Terminate/expire/void — append-only events
  без мутации принятого offer. (`CONTRACT-17`)
- Parent/admin history показывает formation, effective dates, Kündigung,
  termination/expiry/void и superseding contract после закрытия operational
  record. (`CONTRACT-18`)
- Group activation обновляет occupancy один раз и создаёт один review batch на
  одно состояние группы; service engagement не меняет occupancy и не запускает
  group repricing. (`CONTRACT-10`)
- Для yearly contract до решения `OQ-001` новая цена не отправляется
  автоматически.
- Sent price review item immutable; acceptance фиксирует item version/hash.
  Измененное условие создает superseding item и требует нового согласия.

## 9. Сообщения и outbox

- Для каждой категории `absence`, `technical`, `contract`, `payment`,
  `schedule`, `nachhilfe`, `other` parent может создать thread и добавить
  сообщение, пока thread открыт; чужой или закрытый thread продолжить нельзя.
  (`MSG-01`)
- Absence form требует ребенка, enrollment и допустимую дату и создает одну
  связанную structured record/thread. (`MSG-02`)
- Ответ админа остается в кабинете, даже если email provider недоступен; email
  повторяется из outbox. (`MSG-03`, `REL-02`)
- Parent/admin transitions support thread соответствуют state table; в closed
  thread нельзя добавить сообщение, а повтор ответа/закрытия не дублирует его.
- Telegram вне `Mo-Fr 09:00-17:00 Europe/Berlin` получает корректный
  `not_before`; тесты покрывают выходные и оба перехода DST.
- Временная ошибка Telegram использует backoff и конечное число попыток;
  permanent failure становится `dead` и виден админу, а повтор cron не шлет
  уже отправленное сообщение. (`REL-02`)
- Telegram отправляется только в служебный канал бюро; Telegram/email payload
  не содержит содержимого funding-файла Jobcenter/Sozialamt, полного адреса,
  токена, документа или служебного stack trace. (`MSG-04`)

## 10. UX и эксплуатация

Перед UX-критериями обязательна административная/privacy приемка:

- Parent/unauthenticated не открывает admin page и не вызывает прямой admin API.
- Admin видит import runs/issues, review tasks, legacy search, users/children,
  catalog/price, trials, requests/documents, contracts/enrollments, price
  reviews, messages и outbox; typed resolution меняет только разрешённую
  сущность. (`ADMIN-01`)
- Изменение роли, family link, classification, price, capacity, status,
  contract, document или outbox создаёт audit record с actor, action, target,
  timestamp и безопасным diff без secret или file content. (`ADMIN-02`)
- Повтор опасной admin-команды с тем же idempotency key не дублирует эффект, а
  её первый запуск требует явного подтверждения. Административные списки имеют
  поиск/фильтры и не выгружают PII вне полей, необходимых выбранной операции.
  (`ADMIN-03`)
- Block user отзывает session; повтор block/unblock идемпотентен.
- Public/admin forms и API не сохраняют поля вне утверждённой схемы, показывают
  актуальную privacy notice там, где требуется сбор данных, а export/delete
  создают audit event. Active contract/retention hold блокирует физическое
  удаление до утверждённого срока хранения. (`PRIV-01`)
- Export одного subject user не содержит данные другого пользователя и доступен
  только через private expiring artifact. (`PRIV-02`)
- Delete dry-run перечисляет holds и связанные D1/R2 records. До закрытия
  `OQ-005` held request остаётся `blocked_by_retention` и ничего не удаляет.
  (`PRIV-03`)

- Основные формы работают на мобильном экране и только с клавиатуры; focus и
  ошибки связаны с соответствующими полями. (`UI-01`)
- Все обязательные пользовательские и email-тексты существуют на немецком;
  отсутствие необязательного перевода не ломает страницу.
- Persisted timestamp сохраняется в UTC; contract/trial/price-effective local
  dates интерпретируются в `Europe/Berlin`. Boundary tests покрывают оба DST
  перехода, включая несуществующее и двусмысленное local time. (`TIME-01`)
- Production secrets отсутствуют в `wrangler.toml`, логах, client bundle и
  import report. (`SEC-02`)
- Ошибка имеет correlation ID; админ может найти import/outbox/audit запись, а
  родитель не получает внутренний stack trace. (`OBS-01`)

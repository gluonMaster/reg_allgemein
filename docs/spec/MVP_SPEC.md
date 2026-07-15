# Спецификация MVP портала регистрации

Статус: этап 01 готов к реализации. Открытых owner/product-вопросов в
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) нет; независимые legal, security,
provider и operational release gates сохраняются. Актуально на 2026-07-15.

Ключевые слова **должен**, **нельзя** и **только** обозначают обязательное
требование. Проверяемые сценарии находятся в
[ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md).

## 1. Цель и участники

За целевой трехнедельный цикл создать рабочий портал регистрации Kolibri,
использующий Cloudflare D1 как runtime-источник истины и локальные скрипты для
безопасного импорта расписания, прайса и будущих legacy-записей.

- **SYS-01.** Портал регистрации является самостоятельным SvelteKit/
  Cloudflare-приложением со своими public/parent/admin routes, Worker
  deployment, D1, R2, secrets, auth/session и release lifecycle. Он не является
  страницей, модулем, плагином или deployment официального сайта
  `kolibri-dresden.de` и не использует его CMS, код, БД, cookies, sessions или
  серверный runtime.
- **SYS-02.** Интеграция с официальным сайтом в MVP только ссылочная: после
  отдельной разрешённой go-live операции сайт содержит обычные HTTPS-ссылки на
  портал, в том числе на утверждённых страницах расписания. Обратные ссылки
  портала на внешние Datenschutz, Impressum и Kontakt также являются обычными
  ссылками. Общий контур бренда и навигации не означает общую инфраструктуру.
- **SYS-03.** Preview/production используют валидированный
  `PORTAL_PUBLIC_ORIGIN`; абсолютные verification/reset/cabinet/contract links
  строятся только из него. Session cookie портала host-only, без атрибута
  `Domain`, и не разделяется с официальным сайтом. Итоговый origin и
  утверждённый перечень внешних link surfaces входят в release manifest;
  изменение CMS/инфраструктуры сайта выполняется отдельно и только по прямому
  поручению.

Роли MVP:

- `parent` — владелец аккаунта и связанных с ним детей;
- `admin` — сотрудник бюро с доступом к административным операциям.

Саморегистрация создает только роль `parent`. Администратор назначается вне
публичного процесса уполномоченным администратором или bootstrap-процедурой.

## 2. Объем MVP

В MVP входят:

- версионируемый импорт прайса, расписания и будущих legacy-записей;
- каталог текущего учебного периода;
- ориентировочный расчет групповой цены;
- регистрация, вход, выход, подтверждение email и сброс пароля;
- автоматическое связывание однозначной legacy-семьи по подтвержденному
  login-email и добровольное связывание по отдельно подтверждённому legacy-email;
- кабинет родителя с детьми, занятиями, заявками и документами;
- заявки на пробные занятия для обычных и танцевальных групп;
- заявки на Nachhilfe и индивидуальные занятия;
- защищенная загрузка документов-направлений Jobcenter/Sozialamt;
- создание, принятие и административная активация договора;
- контролируемый пересмотр групповой цены;
- удаление кабинета при отсутствии active contracts с отдельным закрытым
  архивом удерживаемых договорных доказательств;
- обращения из кабинета, email-уведомления и Telegram outbox для бюро;
- минимальная админка, audit log и отчеты импорта.

Целевой срок — ограничение планирования, а не основание пропускать обязательные
проверки безопасности или целостности данных.

## 3. Вне MVP

- прием платежей, SEPA, GoCardless, задолженность и месячные начисления;
- holiday calendar, перерасчёт базовой групповой цены по каникулам, pauses,
  prorating и вычисление фактической payable amount;
- подтверждение фактически проведенных уроков и расчет Nachhilfe по факту;
- автоматическое назначение скидок или exceptional manual price override;
- квалифицированная или автоматическая цифровая подпись;
- waitlist и автоматическое продвижение очереди;
- двусторонний Telegram-бот для родителей;
- автоматическое расписание каникул, замен и разовых отмен;
- перенос старых страниц мероприятий и отзывов;
- автоматическое объединение людей по имени, адресу или дате рождения;
- самостоятельный доступ нескольких родителей/опекунов к одному ребенку;
- хранение исходных Access/клиентских Excel-файлов в Git, Worker или CI
  artifacts; локальная ignored read-only копия для контролируемого импорта
  допустима по `operations/DATA_SOURCES.md`;
- перенос портала в CMS, репозиторий, БД, cookies, sessions или deployment
  официального сайта, reverse proxy/iframe-интеграция и изменение официального
  сайта без отдельного прямого поручения.

## 4. Аутентификация и авторизация

- **AUTH-01.** Email нормализуется как trim + lower-case и уникален без учета
  регистра; исходный вид можно хранить отдельно для отображения. Регистрация не
  может занять адрес, зарезервированный чужим неистекшим pending email-change.
- **AUTH-02.** Регистрация требует email, пароля, имени, фамилии, принятия
  актуальной privacy notice и успешного Turnstile.
- **AUTH-03.** Пароль хранится только как современный salted hash. Ограничения
  длины проверяются до хеширования; пароль и hash никогда не логируются.
- **AUTH-04.** Подтверждение email использует случайный одноразовый токен,
  хранит только его hash, имеет срок действия и инвалидируется после
  использования. Повторная отправка rate-limited и не раскрывает существование
  аккаунта. Default TTL verification token — 24 часа, resend cooldown — 60
  секунд; значения конфигурируются, но не могут быть отключены в production.
- **AUTH-05.** Должны работать вход, выход, запрос сброса пароля и одноразовый
  сброс пароля. Смена пароля, блокировка и смена email отзывают действующие
  сессии; новый email требует повторной верификации. Default reset-token TTL —
  60 минут, session TTL — 7 дней. Email-change token связан с конкретными
  pending email и `email_version`; старый token не может подтвердить более новый
  запрос или другой адрес. При подтверждении уникальность проверяется повторно
  атомарно; если адрес уже занят, current email не меняется. Истекший pending
  reservation освобождается cleanup-процессом.
- **AUTH-06.** Auth-cookie имеет `HttpOnly`, `Secure` в production,
  `SameSite=Lax`, ограниченный срок жизни и проверяемую подпись. Все изменяющие
  cookie-authenticated запросы защищены CSRF.
- **AUTH-07.** Публичные auth-, verification-, reset-, claim- и upload-endpoints
  имеют конфигурируемое ограничение частоты и нейтральные сообщения об ошибках.
- **AUTH-08.** Каждый серверный запрос к ребенку, заявке, документу, договору,
  enrollment, service engagement или thread заново проверяет владельца либо
  роль администратора.
- **AUTH-09.** Заблокированный пользователь не может продолжать старую сессию;
  повышение роли не принимается из данных клиента.

## 5. Legacy claim и дети

- **CLAIM-01.** До подтверждения login-email система не сообщает, найден ли
  legacy-контакт, не показывает FamilyID/маску другого адреса и не связывает
  legacy-данные. Завершением регистрации для family-assignment считается первая
  успешная верификация login-email, а не создание unverified account.
- **CLAIM-02.** При завершении регистрации система одной транзакцией назначает
  аккаунту ровно один current FamilyID. Ровно одно непротиворечивое, ещё не
  принадлежащее другому аккаунту совпадение normalized login-email получает
  legacy FamilyID namespace `1` и связывает доступные family/children/service
  records. При отсутствии такого email-совпадения выделяется новый FamilyID из
  namespace `2`. Отсутствие current promoted legacy snapshot, lookup/import
  error или promotion race не трактуются как «совпадений нет»: вся verification
  transaction откатывается безопасно и может быть повторена. Повтор successful
  verification/finalization идемпотентен.
- **CLAIM-03.** Если email не совпал, но найдена ровно одна однозначная, не
  принадлежащая другому аккаунту legacy-семья по нормализованному сочетанию
  фамилии и имени родителя и у неё есть ровно один иной usable email, аккаунт
  сохраняет назначенный namespace `2`, а verified parent видит в кабинете
  предложение подтвердить доступ к замаскированному legacy-email. Любое
  совпадение фамилии+имени, в том числе в exact-email сценарии, создаёт admin
  review task с безопасным reason code.
- **CLAIM-04.** Добровольный name-match claim отправляет одноразовую expiring,
  rate-limited ссылку на полный legacy-email, но в UI показывает только маску.
  Ссылка связана с requesting user, candidate family и текущей family version и
  применяется только в authenticated session этого user. Успех одной
  транзакцией связывает legacy-данные, заменяет current FamilyID аккаунта с
  namespace `2` на namespace `1` и меняет `family_number_id` всех его детей;
  invalid/expired/replayed token ничего не меняет.
- **CLAIM-05.** Несколько families по одному email, несколько name-candidates,
  несколько distinct legacy-email, collision или уже принадлежащая другому
  аккаунту family не выбираются автоматически: аккаунт получает/сохраняет один
  namespace `2`, пользователю не раскрывается список кандидатов, а admin получает
  review task. Последующая смена login-email сама по себе FamilyID не меняет.
- **CLAIM-06.** Совпадение только по имени ребёнка или неподтверждённое совпадение
  имени родителя никогда не связывает данные автоматически. Для обычного local
  part длиной от четырёх символов маска имеет вид `el*****n@gmail.com`: первые
  два и последний символ до `@`, фиксированные звёздочки и полный domain. Более
  короткий local part маскируется строже и никогда не раскрывается целиком.
- **CLAIM-07.** Строки одного ребенка внутри семьи объединяются по устойчивому
  ключу семьи, нормализованному имени и дате рождения. Любая неоднозначность
  требует ручной проверки, а не догадки.
- **CLAIM-08.** В MVP у parent account ровно один current FamilyID, а у каждого
  canonical child ровно один `family_number_id`. Portal-created/claimed child
  имеет ровно один owning account и тот же current FamilyID; unclaimed legacy
  child может не иметь owner, но не FamilyID. Admin может исправить FamilyID
  только отдельной подтверждённой аудируемой атомарной операцией с причиной: она
  меняет current family аккаунта и всех его детей, не создаёт второго owner/
  family и не переписывает immutable history.
- **CLAIM-09.** `FamilyID` считается стабильным в пределах source namespace
  между academic periods. Совпавшая непротиворечивая family наследует claim/
  owner и stable children; enrollments остаются period-scoped. Конфликт
  контактов/child identity, редкая смена или ошибочное повторное использование
  `FamilyID` создаёт admin continuity review и не передаёт owner автоматически.
  Новый exact-email match, появившийся только после reimport либо смены profile/
  login-email, не переключает FamilyID фоново: он создаёт review и требует
  approved claim/admin correction flow.

## 6. Кабинет родителя

- **CAB-01.** Кабинет показывает профиль, детей, импортированные будущие
  занятия, активные услуги, пробные заявки, Nachhilfe/individual requests/
  service engagements, договорные предложения, хронологическую историю
  заключения/активации/Kündigung цифровых договоров и обращения. Claimed legacy
  record показывается только как строка действующей услуги: он не объявляется
  digital contract и не получает PDF/artifact link, поскольку бумажный договор
  хранится вне портала.
- **CAB-02.** Кабинет складывает только известные подтверждённые базовые цены
  активных `group`/`dance_group` услуг и явно помечает результат как
  ориентировочный base-price total, а не счёт или payable amount. Он не учитывает
  каникулы, разовые перерасчёты, платежи, задолженность и Nachhilfe/individual по
  факту. Не вступивший в силу price-review item не заменяет текущую base price;
  unknown legacy amount не считается нулём и не входит в total.
- **CAB-03.** Для self-pay `individual` показывается тариф за 45 минут из server
  configuration; default — 3000 cents, с пояснением, что начисления по
  фактически проведенным урокам в портале пока не ведутся. Для `nachhilfe`
  показываются `Jobcenter|Sozialamt` и inclusive даты действия направления;
  договорный тариф — 3000 cents за академический час 45 минут, но он не
  показывается как сумма к оплате родителем и фактические часы не считаются.
- **CAB-04.** Для parent-pay услуг портал не создаёт SEPA mandate, не списывает
  деньги и не ведёт задолженность. Для вручную отмеченной действующей внешней
  SEPA-Lastschrift он сообщает, что фактическая сумма будет списана вне портала;
  иначе — что фактическую сумму с учётом внешних перерасчётов нужно оплатить
  самостоятельно не позднее 7-го числа следующего месяца.
  Для funded Nachhilfe arrangement `not_applicable` и parent-pay due text нет.
  Это информация, а не подтверждение выставления/получения платежа.
- **CAB-05.** Пользователь не видит внутренние admin notes, import diagnostics,
  служебные идентификаторы и данные других семей.
- **CHILD-01.** Verified parent с завершённым family-assignment может создать
  ребёнка с обязательными `full_name` и `birth_date`; ребёнок в той же
  транзакции получает current `family_number_id` аккаунта. Ребёнок без FamilyID
  не создаётся, а без сохранённого owned child нельзя подать trial/request.
- **CHILD-02.** Родитель может редактировать созданного им portal-child. Для
  изменения импортированного имени/даты создается auditable correction request,
  чтобы reimport не затер исправление молча.
- **CHILD-03.** Все create/update/select операции проверяют owner. Возможный
  дубликат внутри аккаунта предупреждает пользователя и требует явного решения,
  но дети разных аккаунтов никогда не сравниваются через публичный API.

## 7. Каталог и пробные занятия

- **CAT-01.** Каталог показывает только опубликованные группы активного учебного
  периода: название, предмет, повторяющиеся sessions, преподавателя, место,
  состояние вместимости и ориентировочную цену либо «Цена уточняется».
- **CAT-02.** Одинаковое display name не означает одну группу. Автоматическое
  объединение расписания по названию запрещено.
- **CAT-03.** Для `group` и `dance_group` CTA ведет к заявке на пробное; для
  `nachhilfe` и `individual` — к соответствующей форме запроса.
- **CAT-04.** Переполненная или неоднозначная группа может принять заявку только
  как `requires_admin_review`; это не waitlist и не гарантия места.
- **TRIAL-01.** Trial разрешен только для `group` и `dance_group`, для ребенка
  владельца аккаунта, конкретной session и предложенной будущей даты.
- **TRIAL-02.** Статусы: `requested`, `confirmed`, `rejected`, `cancelled`,
  `attended`, `no_show`, `converted`. Переходы определены в domain workflow.
- **TRIAL-03.** Для одного ребенка и группы нельзя создать несколько открытых
  заявок; повтор отправки идемпотентен.
- **TRIAL-04.** Админ подтверждает фактическую дату и вместимость. Повторяющееся
  расписание само по себе не учитывает каникулы и разовые отмены.
- **TRIAL-05.** Trial не участвует в price occupancy. `converted` не создает
  enrollment автоматически без contract offer и административной активации.

## 8. Nachhilfe и индивидуальные заявки

- **REQ-01.** Запрос хранит ребенка, тип, предметы/описание, дни, временные окна,
  формат `online|onsite|mixed`, предпочитаемые места и источник финансирования.
- **REQ-02.** Статусы: `draft`, `submitted`, `needs_documents`, `needs_info`,
  `pending_admin_review`, `approved`, `rejected`, `cancelled`.
- **REQ-03.** `individual` является self-pay и не требует направления.
  `nachhilfe` допускается только с действующим направлением Jobcenter или
  Sozialamt; self-pay намерение оформляется как `individual`. Submit Nachhilfe
  без выбранного authority и документа невозможен.
- **REQ-04.** Для Jobcenter/Sozialamt админ фиксирует authority, срок действия,
  решение и при необходимости внутренний комментарий. В MVP не копируются
  payer details, case/reference и разрешенный объём часов: они остаются в
  исходном документе. Истекшее разрешение нельзя считать действующим.
- **REQ-05.** Файлы хранятся приватно в R2 под непредсказуемыми ключами; D1
  содержит metadata, checksum и состояние проверки. Новый файл начинает в
  `quarantined`. Публичных R2 URL нет.
- **REQ-06.** Сервер проверяет расширение, MIME, сигнатуру файла, размер и число
  вложений. Допустимы PDF, JPEG и PNG. Default limits: 10 MiB на файл, максимум
  5 файлов и 25 MiB на authorization; лимиты можно только уменьшить обычной
  конфигурацией, а повышение требует пересмотра риска. ZIP, Office, SVG/XML,
  executable и encrypted/password-protected files запрещены. Лимиты и форматы
  сообщаются до upload.
- **REQ-07.** Просмотр/скачивание доступно только владельцу соответствующей
  заявки и администратору через короткоживущий контролируемый ответ, но parent
  получает файл только в `approved` safe state. До clean attestation quarantine
  доступен admin только как forced attachment-download для локального AV, без
  inline preview; каждый download и последующее решение аудируются.
- **REQ-08.** Замена и удаление файла не стирают audit metadata. Автоматический
  purge approved funding-document/legal archive выключен. Любой не перешедший в
  `approved` quarantine object становится eligible при
  `now >= uploaded_at + 14×24h` UTC и удаляется первым успешным cleanup после
  порога, но никогда раньше; download/attestation TTL не продлевают. Approved
  artifact переходит под business retention.
- **REQ-09.** `group_nachhilfe` не публикуется и не рассчитывается автоматически
  в MVP. Его может создать только admin с ручными capacity, price и Jobcenter-
  /Sozialamt-условиями; trial для него недоступен.
- **REQ-10.** Nachhilfe offer не обещает период за пределами funding
  `valid_until`. Если authorization заканчивается раньше желаемого contract
  term, activation требует manual review. Expiry/revoke/supersede active
  funding переводит engagement в `funding_review` и создаёт task, но не мутирует
  contract/PDF и не прекращает договор автоматически. Продолжение требует
  новой approved authorization и явного admin funding amendment; если меняются
  parent-facing условия, выпускается новый offer с parent acceptance.

## 9. Договоры и enrollments

- **CONTRACT-01.** Contract offer создает админ для конкретных user, child и
  одной услуги. Group-offer связан с course и draft enrollment; individual/
  Nachhilfe offer — с request, draft service engagement и при необходимости
  funding authorization. Offer и отсутствующий draft operational record
  создаются/связываются атомарно; пользователь не может создать или менять
  offer.
- **CONTRACT-02.** Offer фиксирует snapshot provider/сторон, услуги, расписания,
  billing line items, режима цены, срока/renewal/termination, даты начала,
  payment/withdrawal terms, приложений, clause set и privacy notice.
- **CONTRACT-03.** HTML/PDF и все значимые snapshot-поля входят в стабильный
  hash. Изменение любого условия требует нового offer/version.
- **CONTRACT-04.** Offer имеет `expires_at` и состояния `draft`, `sent`,
  `accepted_by_parent`, `declined_by_parent`, `approved_by_admin`, `cancelled`,
  `expired`, `superseded`.
- **CONTRACT-05.** Принять можно только актуальный `sent` offer до истечения,
  только владельцу указанного ребенка, явным действием с acceptance text.
- **CONTRACT-06.** Acceptance log неизменяемо фиксирует timestamp, user, hash,
  версию текста, user agent и IP с учетом политики хранения.
- **CONTRACT-07.** Повтор принятия с тем же idempotency key возвращает прежний
  результат; отмененный, истекший или измененный offer принять нельзя.
- **CONTRACT-08.** Только админ и только после parent acceptance может выполнить
  approval/activation. Это одно второе явное действие стороны Verein: операция
  формирует contract над той же immutable offer version, атомарно проверяет
  актуальную цену/вместимость, активирует group enrollment либо individual/
  Nachhilfe service engagement и записывает formation/activation/audit events.
- **CONTRACT-09.** Для одного child/course не может существовать более одного
  пересекающегося active group enrollment; для одного approved request — более
  одного active service engagement. Повторная активация не создаёт дубль, а
  service engagement никогда не увеличивает group occupancy.
- **CONTRACT-10.** Изменение group enrollment/occupancy либо явный admin
  comparison после публикации новой price version может создать price review.
  Activation, end/cancel, изменение future boundary и auditable occupancy
  correction используют один dedupe contract. Future `active_from|active_until`
  заранее создаёт review на boundary date, а reconciler восстанавливает
  пропущенный trigger идемпотентно. Pause/resume в MVP отсутствуют.
  Рассылка никогда не начинается без первого admin approval, а после parent
  acceptance нужен второй явный confirmation по item. Service engagement не
  запускает group repricing.
- **CONTRACT-11.** Для production перехода `draft -> sent` должны быть созданы
  неизменяемые HTML и PDF artifacts из production-scoped template version,
  утверждённой уполномоченным представителем Verein; основание approval
  (внутреннее или legal review) фиксируется. Placeholder не удовлетворяет
  Definition of Done; ошибка генерации или неполный render input оставляет offer
  в `draft`.
  Изолированное synthetic-test исключение определено в
  `domain/CONTRACTS.md` и недоступно production config.
- **CONTRACT-12.** Если после parent acceptance activation больше невозможна
  из-за изменившихся условий, admin может только активировать исходный offer,
  отменить его с причиной или сделать `superseded` и выпустить новую version.
  Parent acceptance старой version нельзя переносить на новую.
- **CONTRACT-13.** Каждый artifact хранит уникальный технический `offer_number`,
  а production offer PDF — зарезервированный `contract_number`, `template_id`,
  `template_version`,
  `render_schema_version`, renderer adapter/compatibility version и
  deterministic source manifest/hash.
  Word-файлы из `references/vorlage/` не конвертируются в runtime: это четыре
  действующих business source, но не автоматически утверждённые digital
  template versions.
- **CONTRACT-14.** Один offer и возникший из него contract покрывают ровно одного
  ребенка и одну услугу, связанную либо с `course_group_id`, либо с
  `individual_request_id`; отсутствующая или множественная service relation
  отклоняется. Несколько детей/услуг оформляются отдельными договорами.
- **CONTRACT-15.** Принятие договора, подтверждение ознакомления с privacy
  notice и добровольный media consent нельзя объединять одним действием/record.
  Если применимый шаблон содержит разрешение photo/video/publication, его текст
  и version входят в PDF. Parent отдельно выбирает grant/decline; решение
  versioned, revocable и привязано к ребёнку. Capture scopes `photo|video` и
  publication channels `website|social_media|print` выбираются раздельно;
  публикация требует grant нужного type и channel. В PDF decision snapshot может
  попасть только если выбор сделан до immutable render/send; более поздний
  grant/revoke хранится отдельным evidence и не переписывает PDF. Отсутствие
  grant означает запрет publication и не блокирует договор. Self-service revoke
  в кабинете отсутствует: parent отзывает permission личным посещением бюро по
  актуальному адресу из Impressum либо по официальным email/телефону со страницы
  Kontakt.
  Admin только регистрирует факт, channel и время получения, не утверждает и не
  отклоняет отзыв; `effective_from=received_at`. Удаление кабинета автоматически
  отзывает все ещё действующие media grants с timestamp удаления. До production
  немецкий текст и snapshot актуальных withdrawal contacts должны быть
  утверждены уполномоченным представителем Verein; контакты берутся из
  versioned configuration со ссылками на официальные Impressum/Kontakt, не
  hardcode в UI. Online grant production path остаётся выключенным, пока
  documented compliance assessment не подтвердит, что withdrawal доступен столь
  же легко, как grant, либо пока не реализован иной compliant path; простое
  принятие риска gate не открывает. SEPA mandate и medical data в MVP не
  собираются. Портал не
  хранит media files и не строит ретроспективный реестр старых публикаций. Withdrawal
  запрещает новые capture/upload/post/repost/reprint по отозванным scopes после
  receipt; specifically named legacy URL/post обрабатывается отдельным manual
  privacy request.
- **CONTRACT-16.** Parent acceptance фиксирует действие над конкретной версией,
  но само по себе договор не заключает. Договор считается заключённым в момент
  последующего admin approval той же неизменяемой version; обе стороны и оба
  timestamp входят в evidence. Исходный offer PDF после send не переписывается.
  После formation один раз создаётся отдельный immutable formation certificate
  PDF с contract/offer number, сторонами/ролями, parent/admin timestamps,
  offer PDF hash, formation source/evidence hash и ссылкой на исходную version.
  Собственный certificate PDF hash хранится в metadata/delivery, а не
  самореферентно внутри PDF. Рисунки подписей и
  объединённый signed-copy PDF не создаются. Production send/accept/activate
  отключены до
  утверждения clause/template versions и закрытия всех применимых строк blocker
  matrix из `domain/CONTRACTS.md`.
- **CONTRACT-17.** Administrative approval/activation формирует отдельный
  contract и активирует ровно один соответствующий operational record:
  enrollment либо service engagement. `effective_from` может быть будущей
  датой; статус и occupancy учитывают её, не меняя `formed_at`. Termination/
  expiry/void записываются append-only events. Выдача immutable offer PDF/HTML
  и formation certificate фиксируется delivery evidence с artifact hash,
  channel и timestamp.
- **CONTRACT-18.** Parent и admin видят append-only contract history:
  offer/sent/parent acceptance/admin approval/formation/effective dates,
  Kündigung request, termination/expiry/void и superseding contract. История не
  исчезает при закрытии operational enrollment/engagement.
- **CONTRACT-19.** Portal различает statutory Widerruf, ordinary/extraordinary
  Kündigung и просьбу о досрочном взаимном прекращении. Получение Widerruf или
  Kündigung фиксируется неизменно и немедленно подтверждается; наличие долга не
  блокирует получение заявления и не стирает отдельное денежное требование.
  Admin проверяет/оспаривает effective date, но только mutual termination
  требует его согласия. Реализация не предполагает молча, что statutory
  Widerruf/Kündigung function доступна только после login. Каждая production
  template version получает утверждённый `distance_legal_profile`:
  `offline_only`, `widerruf_applicable` либо документированное
  `widerruf_not_applicable_312g_2_9`, а также решение о § 312k. Без profile
  online send fail-closed. При `widerruf_applicable` public function реализует
  поля/confirmation § 356a BGB и versioned early-performance request; при
  неприменимости PDF/UI содержит утверждённое объяснение основания. Для
  `group_monthly`
  ordinary Kündigung, полученная в месяце M, завершает услугу последним днём M;
  с M+1 base price не действует. Для `group_yearly` заявление до contractual end
  не сокращает текущий term, но запрещает последующее auto-renewal. Debt не
  сдвигает эти даты и остаётся внешним отдельным вопросом. Для `individual` и
  `nachhilfe` нет trial/абонентской платы: 3000 cents относятся к фактически
  проведённым 45 минутам. Полученное уведомление «больше не посещаем» немедленно
  завершает service engagement и прекращает планирование/начисление ещё не
  оказанных будущих units, но само по себе не обязано быть формальной Kündigung
  contract. Receipt неизменяем и подтверждается parent; optional formal
  termination доступен отдельно. Уже
  согласованный unit может остаться к внешнему ручному выставлению только если
  до фактического прихода/начала ожидания teacher уведомление не было получено и
  teacher действительно пришёл/ждал. Произвольного cutoff в минутах нет; receipt
  до прихода teacher исключает требование, receipt после него не создаёт новых
  future units.
- **CONTRACT-20.** Production contract получает уникальный номер по
  формату `<namespace>. <family-sequence>-<contract-sequence>`: например,
  `1. 3477-1` для legacy-family и `2. 0001-1` для portal-only family. Portal
  FamilyID выделяется атомарно при завершении регистрации после успешной
  email-verification, если нет одного однозначного eligible legacy-email match;
  ребёнок всегда наследует current family аккаунта.
  Contract sequence сквозной внутри canonical family; номер резервируется до
  render/send offer PDF, считается израсходованным после decline/expiry и не
  переиспользуется. Подтверждённый поздний claim или admin correction меняет
  current FamilyID на approved destination и переключает только будущую
  contract sequence. Уже выданные номера, offer/contract PDF и formation
  evidence не перенумеровываются и не переписываются; незаключённый nonterminal
  offer со старым FamilyID supersede-ится до повторного render. Старый FamilyID
  остаётся только historical alias/audit reference, а не вторым current FamilyID.
  Collision всегда fail-closed.

## 9.1. Цена и её изменение

- **PRICE-01.** В `Price.xlsx` колонка `Preis` хранит месячную плату для
  `group_yearly`, а исторически названная `Sonderpreis` — месячную плату для
  `group_monthly`. Маркеры Access `O/V|V/O` означают monthly contract kind, а
  не льготу. Настоящая особая цена существует только как `manual_override`.
- **PRICE-02.** При подтверждённой длительности 90 минут обе групповые ставки
  являются базовой месячной ценой еженедельных занятий: fallback 4600 cents
  для yearly и 6000 cents для monthly. Это не фактическая payable amount:
  каникулы и прочие перерасчёты портал не вычисляет. Тариф individual
  конфигурируется с default 3000 cents, а funded Nachhilfe фиксирован как 3000
  cents за академический час 45 минут; портал не считает delivered units.
- **PRICE-03.** Group repricing использует exact price rule для
  `min(active_children_count, 6)`. Review нужен только если изменение состава
  изменило этот lookup-count либо admin явно запустил comparison после
  публикации новой active price version. Сама публикация версии клиентский
  review автоматически не запускает. `5↔6` меняет lookup и проходит обычный
  review; `7→6` и изменение только выше cap не меняют lookup и не создают
  клиентский item.
  Новая цена применяется к каждому enrollment отдельно
  после approval рассылки admin, parent acceptance и второго admin confirmation;
  parent имеет 14 календарных дней на ответ. Decline/timeout создаёт admin
  notification/manual-contact task, старая base price продолжает действовать.
  Accepted item после второго admin confirmation применяется с первого числа
  следующего календарного месяца, без retroactive apply; отдельный PDF-addendum
  не создаётся. Однозначно claimed legacy service с известной/подтверждённой
  current price проходит тот же email/accept/confirm/apply flow, но не становится
  digital contract и не получает contract PDF. Unknown/unclaimed/conflicting
  legacy остаётся manual.
- **PRICE-04.** `manual_override` назначает только admin на отдельном
  high-friction экране: UI показывает расчётную и особую цену, разницу и
  предупреждение об обходе price rule, требует непустую причину и повторное
  явное подтверждение, сохраняет actor/timestamp/audit. Он не выводится из
  `Sonderpreis`, `O/V`, notes или клиентского payload и не участвует в bulk
  default.

Правила цены и пересмотра определены в
[domain/PRICING.md](../domain/PRICING.md), типы и occupancy — в
[domain/COURSES.md](../domain/COURSES.md), а template/render/lifecycle contract —
в [domain/CONTRACTS.md](../domain/CONTRACTS.md).

## 10. Обращения, уведомления и админка

- **MSG-01.** Родитель может создать обращение категорий `absence`, `technical`,
  `contract`, `payment`, `schedule`, `nachhilfe`, `other` и продолжить открытый
  thread.
- **MSG-02.** Отсутствие использует структурированную дату и enrollment и
  одновременно создает сообщение в thread; две независимые заявки не создаются.
- **MSG-03.** Ответ админа сначала сохраняется в D1, затем ставится в email
  outbox. Ошибка email не теряет ответ и видна администратору.
- **MSG-04.** Telegram является только служебным уведомлением бюро и не содержит
  документы или избыточные PII. Правила времени и retry определены в
  [domain/MESSAGING.md](../domain/MESSAGING.md).
- **ADMIN-01.** Админка покрывает import runs/issues, review tasks, legacy-
  поиск, пользователей и детей, каталог, прайс, trials, requests/documents,
  contracts/enrollments, price reviews, messages и outbox. Для family name-match
  она показывает review и предоставляет отдельный preview/confirm-инструмент
  исправления current FamilyID аккаунта со списком затронутых детей и конфликтов;
  свободный ввод непроверенного номера и тихий merge запрещены.
- **ADMIN-02.** Изменение ролей, связей семьи, классификации, цены, вместимости,
  статуса, договора, документа или outbox фиксируется в audit log с actor,
  действием, target, временем и безопасным diff без секретов/содержимого файла.
- **ADMIN-03.** Опасные повторные действия защищены idempotency и подтверждением;
  списки имеют поиск/фильтр и не выгружают PII без явной необходимости.

## 11. Нефункциональные требования

- **SEC-01.** Валидация выполняется на сервере; SQL параметризован; output
  экранируется; CSRF, authorization и rate limits покрыты тестами.
- **SEC-02.** Секреты находятся только в Cloudflare secrets/env. Логи, telemetry
  и сообщения об ошибках не содержат токены, cookie, пароли, адреса, телефоны,
  email, содержимое договоров или загруженных документов.
- **PRIV-01.** Система собирает только необходимые поля, показывает privacy
  notice, фиксирует его immutable version/hash и поддерживает аудируемый
  export/delete process. Parent может запросить удаление кабинета только без
  active contracts; retained evidence отделяется от рабочего профиля по
  [PRIVACY_RETENTION.md](../domain/PRIVACY_RETENTION.md).
- **PRIV-02.** Export формируется только для выбранного subject user, доступен
  уполномоченному admin/владельцу через private short-lived artifact и не
  включает чужие данные, secrets или внутренние security metadata.
- **PRIV-03.** Delete сначала выполняет dry-run: перечисляет active contracts,
  legal/retention holds и связанные D1/R2 данные. Active contract блокирует
  closure как `blocked_by_active_contract`. Без active contract login/sessions и
  неудерживаемый profile закрываются, request завершается
  `completed_with_retained_evidence`, а hold каждого archive record хранится в
  его `retention_controls`, не как незавершённый общий request. Автоматический
  purge retained legal archive/approved evidence в MVP выключен независимо от
  `retain_until`; физическое удаление требует отдельного будущего утверждённого
  правила/поручения и оставляет минимальный audit. Closure lock атомарно
  запрещает дальнейшие accept/
  formation/activation/price apply и закрывает nonterminal offers/items/
  requests с сохранением уже созданного immutable evidence; race с formation
  может выиграть только одна conditional transaction. В той же successful
  closure transaction все действующие media grants получают append-only revoke
  events с `source=account_deletion` и `effective_from=account_deleted_at`.
- **REL-01.** Все import publish, claim, acceptance, activation и смены статуса
  идемпотентны и не оставляют частично примененное состояние.
- **REL-02.** Для D1 и R2 до production описаны backup/restore и проверка
  восстановления. Ошибки внешних email/Telegram API обрабатываются outbox.
- **TIME-01.** Timestamps хранятся в UTC. Даты договора, trial и вступления цены
  трактуются в `Europe/Berlin`; переходы DST покрываются тестами.
- **UI-01.** Публичная часть самостоятельного регистрационного приложения
  обязательна на немецком, адаптивна для мобильного экрана, доступна с
  клавиатуры, имеет связанные labels и понятные inline errors.
  Тексты организуются через i18n-ключи для последующих `ru`, `en`, `uk`.
- **OBS-01.** Ошибки получают correlation/request ID; админ видит состояние
  import/outbox, но технические детали и PII не раскрываются родителю.
- **OPS-01.** До production создаётся и проверяется tracked-комплект актуальных
  пошаговых инструкций на русском языке для неопытного оператора: первоначальное
  развёртывание, конфигурация и secrets, migrations и bootstrap admin, cron и
  feature gates, preview/production smoke, backup/restore, rollback/roll-forward,
  мониторинг и аварийное восстановление. Cold-read/rehearsal выполняется в
  non-production, а результат и все release gates фиксируются по
  [PRODUCTION_READINESS.md](../operations/PRODUCTION_READINESS.md).

## 12. Технологические ограничения

- SvelteKit 2, TypeScript, Cloudflare Workers, D1 и R2;
- Zod для входных контрактов, Vitest для автоматических тестов;
- локальные Node.js-скрипты для Access/Excel/расписания;
- Worker никогда не читает локальные host/сетевые диски;
- D1 — runtime-источник истины, внешние файлы — версионируемые upstream-
  источники;
- reference-реализация используется как источник инфраструктурных паттернов,
  но ее старые таблицы мероприятий не переносятся;
- официальный сайт остаётся внешней независимо развёртываемой системой;
  недоступность его CMS/API/runtime не должна мешать сборке, deployment или
  основным сценариям портала.

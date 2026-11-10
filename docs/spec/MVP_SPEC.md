# Спецификация MVP портала регистрации

Статус: этап 01 готов к реализации. В
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) нет открытых owner/data-вопросов по
Access normalization; независимые legal, security, provider и operational
release gates сохраняются.
Актуально на 2026-09-13.

Ключевые слова **должен**, **нельзя** и **только** обозначают обязательное
требование. Проверяемые сценарии находятся в
[ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md).

## 1. Цель и участники

За целевой трехнедельный цикл создать рабочий портал регистрации
Kinder- und Elternzentrum "KOLIBRI" e.V.,
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
- **SYS-04.** До объявления checkpoint `full-manual-preview` все входящие в MVP
  технические контуры должны быть реально включены и пройдены end-to-end в
  Access-protected preview на синтетических данных и выделенных preview-
  ресурсах/provider targets. Юридическое, управленческое или provider approval
  остаётся gate для production, но не заменяет preview-проверку выключенным
  флагом. `feature_disabled` допустим как production release decision, однако
  сам по себе не доказывает работоспособность соответствующего MVP-контура в
  полном manual preview.

Роли MVP:

- `parent` — владелец аккаунта и связанных с ним детей;
- `admin` — сотрудник бюро с доступом к административным операциям.

Саморегистрация создает только роль `parent`. Администратор назначается вне
публичного процесса уполномоченным администратором или bootstrap-процедурой.

## 2. Объем MVP

### Срочный ограниченный release от 2026-09-16

- **SYS-05.** По новому поручению владельца ближайший продуктовый приоритет —
  `trial-intake`: запрос из реального расписания, контакты родителя и дети,
  подтверждение email, Telegram и удобный список администратора; дальнейшая
  связь по телефону. Бюджет реализации/запуска — 8–12 часов. Требования
  `TIN-01–12` и уточняемые OQ находятся в
  [TRIAL_INTAKE.md](../domain/TRIAL_INTAKE.md). Это отдельный ограниченный release,
  не объявление готовности полного MVP. Pricing, contracts, uploads и legacy
  import не являются его предпосылками. Подготовка ТЗ не меняет deployed state
  или разрешения на remote операции; operational cursor остаётся в active state.
  Поручение 2026-11-05 добавляет к нему лист ожидания для плановых курсов с
  ценами только этих курсов, стартом курса администратором и PDF-подтверждением:
  `WL-01–15` в [TRIAL_INTAKE_WAITLIST.md](../domain/TRIAL_INTAKE_WAITLIST.md).
  Pricing-движок и договоры полного портала по-прежнему не используются.

### Полный MVP

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
  актуальной privacy notice и успешного Turnstile. Серверная Siteverify-проверка
  принимает только `success=true`, action `registration` и точный hostname
  текущего deployment; production allowlist не содержит local hostnames.
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
  роль администратора. В contract/price dual-control действие стороны parent
  дополнительно требует текущую роль `parent`: владение объектом или сохранённое
  до повышения роли evidence не превращает current admin в parent-сторону.
- **AUTH-09.** Заблокированный пользователь не может продолжать старую сессию;
  повышение роли не принимается из данных клиента. Переход `parent -> admin`
  отклоняется атомарно, пока target сохраняет parent-side business/workflow
  state (включая детей, claim/correction, trial/request, enrollment/contract,
  price-review, message или privacy workflow). Первый bootstrap может повысить
  только verified active parent без такого состояния; одна лишь пустая
  зарезервированная FamilyID/регистрационная запись, включая её служебный
  verification receipt `portal_allocated`, не считается business state.
  Finalization `exact_email` сохраняет claim evidence и остаётся блокирующей.

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
  Первый экран содержит быстрые действия и переходы к разделам. Уже загруженные
  предложения в `sent`, изменения цены в `sent` и запросы `needs_info`/
  `needs_documents` выделяются перед занятиями и формами. Остальные открытые
  объекты не объявляются требующими ответа. Занятия расположены выше карточек
  детей; профиль и история могут сворачиваться, сохраняя доступ ко всем данным.
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
  Карточка ребёнка по умолчанию компактна; добавление и изменение раскрываются
  отдельно. Ошибка сохраняет введённые имя/дату и оставляет соответствующую
  форму открытой с сообщением. Подтверждение дубликата показывается только
  рядом с полученным серверным предупреждением. Раскрытие не отправляет форму,
  скрытые обязательные поля другой формы не блокируют действие.
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
  Вторичный вход для групп «Запросить договор без пробного» открывает обычную
  форму обращения категории `contract`. Сервер проверяет ID занятия по
  опубликованному каталогу текущего периода и расписанию; тема и текст
  предзаполнены из этих данных и редактируются до явной отправки. URL содержит
  только ID занятия, без имён, контактов и свободного текста. Недоступный или
  некорректный ID открывает обычную форму без предзаполнения. Ошибка отправки
  сохраняет исправления и ключ идемпотентности. GET/переход не создаёт обращение,
  заявку, offer или enrollment. Администрация готовит предложение по
  `CONTRACT-01`; запрос не резервирует место и не означает принятие договора.
  Смена DE/RU сохраняет отредактированные категорию, тему и текст, включая
  намеренно очищенные поля; нетронутое предзаполнение может менять язык.
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
  конфигурацией, а повышение требует пересмотра риска. Пониженные configured
  ceilings по count и aggregate bytes проверяются атомарно в момент D1-записи и
  не обходятся конкурентными uploads. ZIP, Office, SVG/XML, executable и
  encrypted/password-protected files запрещены. Лимиты и форматы сообщаются до
  upload.
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
- **REQ-11.** До `full-manual-preview` синтетический funding document должен
  пройти фактический preview lifecycle через выделенные private EU R2:
  authenticated upload в quarantine, audited forced attachment-download,
  локальную проверку актуальным утверждённым antivirus, привязанную к SHA-256
  versioned clean attestation и отдельное business `approved|rejected` решение.
  Проверяются также hash mismatch/direct-approve rejection и cleanup
  неутверждённого synthetic artifact. Реальные клиентские документы и PII для
  этого checkpoint запрещены; production enablement и обучение операторов
  остаются отдельными gates.

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
  только current active parent-владельцу указанного ребенка, явным действием с
  acceptance text. Роль admin не удовлетворяет parent-side acceptance, даже
  если тот же user исторически владел offer.
- **CONTRACT-06.** Acceptance log неизменяемо фиксирует timestamp, user, hash,
  версию текста, user agent и IP с учетом политики хранения.
- **CONTRACT-07.** Повтор принятия с тем же idempotency key возвращает прежний
  результат; отмененный, истекший или измененный offer принять нельзя.
- **CONTRACT-08.** Только админ и только после parent acceptance может выполнить
  approval/activation. Это одно второе явное действие стороны Verein: операция
  формирует contract над той же immutable offer version, атомарно проверяет
  актуальную цену/вместимость, активирует group enrollment либо individual/
  Nachhilfe service engagement и записывает formation/activation/audit events.
  Admin actor обязан быть другой principal, чем parent actor/owner offer;
  последующее повышение роли parent не создаёт вторую сторону.
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
  последующего admin approval той же неизменяемой version другим user; обе
  различные стороны и оба timestamp входят в evidence. Исходный offer PDF после
  send не переписывается.
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
- **CONTRACT-21.** До `full-manual-preview` все четыре цифровых вида договора
  получают versioned `preview_review` bundle, построенный из соответствующих
  business source templates и production-candidate общих/видовых clauses.
  Bundle использует синтетические стороны, заметную маркировку
  `TEST/ENTWURF — nicht für reale Vertragsbeziehungen`, реальный Cloudflare
  Browser Run renderer, private preview R2 и доставку только на заранее
  согласованные контролируемые test recipients. Минимум один offer проходит
  `render → send → parent accept`, затем formation/activation другим admin и
  `certificate/download`; все четыре вида проходят render/
  delivery review. Полученные PDF являются материалом для управленческой и
  юридической правки; новый feedback выпускает новую immutable template
  version/change log. Preview-review artifact нельзя использовать для
  production offer, а отсутствие финального production approval не является
  основанием откладывать его создание и техническую проверку.
- **CONTRACT-22.** Каждая используемая при draft/render версия имеет полный
  immutable render-source bundle. Его canonical manifest/hash покрывает не
  ссылку на текущую функцию, а фактически исполняемое base body, общие и
  kind-specific clauses, фиксированный текст, CSS, fonts/assets, версии
  helper/schema/adapter и hashes всех provider/payment/legal/media snapshots;
  отдельно сохраняется hash полученного self-contained HTML. Bundle однозначно
  называет renderer engine version; каждый engine version имеет отдельный
  immutable dispatch и собственные output-affecting helpers без вызова
  изменяемых helpers другой версии. Runtime разрешает только exact
  зарегистрированные `template_version`/`render_schema_version`/engine version
  и не подменяет неизвестную или прежнюю version текущим/synthetic fallback.
  Новый deploy или новая template version не меняют источник уже установленной
  версии; отсутствие её полного bundle завершает draft/render fail-closed.
- **CONTRACT-23.** Установка template version является recoverable и
  conflict-safe между D1 и R2. До object write создаётся D1 storage intent;
  deterministic R2 key записывается атомарным create-if-absent, а проигравший
  concurrent writer выполняет metadata-first, ETag-bound bounded read и
  проверяет exact bytes/size/SHA-256 вместо overwrite или unbounded body read.
  Normal load/recovery/download используют тот же max+1 bound и fail closed для
  oversized, truncated либо изменившегося между metadata/body объекта.
  Provider/media/template rows, link assertions и успешный install
  audit фиксируются одной exact-state D1 transaction: count-only либо
  post-commit client verification недостаточны. Byte-identical replay
  идемпотентен, conflicting replay не оставляет partial rows или ложный success
  audit. Template intents используют immutable family/generation, generation-
  specific key и installer/cleanup fencing: retry после aged/deleted generation
  создаёт безопасную следующую generation, а stale cleaner не может удалить её
  object. `preview_review` environment/feature/synthetic gates проверяются до
  reservation contract number, draft/operational record или любого другого
  business side effect.

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
  parent-side response требует current role `parent`, а actor второго admin
  confirmation не может совпадать с parent actor/owner item. Повышение роли
  после parent response не создаёт вторую сторону. Parent имеет 14 календарных
  дней на ответ. Decline/timeout создаёт admin notification/manual-contact task,
  старая base price продолжает действовать.
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

- **PRICE-05.** Выбор занятия автоматически подставляет цену и её единицу в
  каталоге, заявке и ценовом блоке подготовки договора администратором.
  Group использует действующий прайс, individual — server-configured тариф
  (в договоре — snapshot выбранной заявки), Nachhilfe — фиксированный funded
  тариф по `PRICE-02`. Сервер определяет суммы и их источник; для нового
  автоматического group offer сохраняется расчёт конкретного owner/child.
  Missing/stale price и невалидное финансирование не заменяются догадкой или
  нулём. Детали UI и проверки актуальности определены в `domain/PRICING.md`.

Правила цены и пересмотра определены в
[domain/PRICING.md](../domain/PRICING.md), типы и occupancy — в
[domain/COURSES.md](../domain/COURSES.md), а template/render/lifecycle contract —
в [domain/CONTRACTS.md](../domain/CONTRACTS.md).

## 10. Обращения, уведомления и админка

Для ограниченного SYS-05 действуют явно согласованные исключения
`TIN-09`/`TIN-11` из payload/different-bot части MSG-04/05/07:
[короткая заявка](../domain/TRIAL_INTAKE.md). Старые сообщения и все правила
доставки/authorization ниже сохраняются.

- **MSG-01.** Родитель может создать обращение категорий `absence`, `technical`,
  `contract`, `payment`, `schedule`, `nachhilfe`, `other` и продолжить открытый
  thread.
- **MSG-02.** Отсутствие использует структурированную дату и enrollment и
  одновременно создает сообщение в thread; две независимые заявки не создаются.
- **MSG-03.** Ответ админа сначала сохраняется в D1, затем ставится в email
  outbox. Ошибка email не теряет ответ и видна администратору.
- **MSG-04.** Telegram является только односторонним служебным уведомлением бюро и содержит лишь минимизированные category/reference/time/delivery reference/admin link без документов, свободного чувствительного текста или избыточных PII.
- **MSG-05.** Настоящая отправка выполняется только в fail-closed mode `TELEGRAM_PROVIDER=bot_api` через dedicated private bureau destination, отдельные preview/production bot token, exact numeric chat config и reviewed UTC activation cutoff, который исключает автоматическую отправку старого backlog; `sendMessage` использует plain text (исключение — уведомление короткой заявки: Telegram HTML с экранированием введённых значений, [MESSAGING](../domain/MESSAGING.md#telegram-bot-api-provider)), отключенный link preview и `protect_content`, а inbound webhook/polling path отсутствует.
- **MSG-06.** Так как Telegram `sendMessage` не имеет документированного
  idempotency key, перед HTTP dispatch сохраняется durable marker. Только
  синтаксически валидный `ok=false` доказывает provider non-delivery: explicit
  `408|425|5xx` retryable, а `429` задаёт durable destination-wide cooldown даже
  без usable `retry_after`. Transport/timeout, unreadable/oversized/malformed
  response, ambiguous envelope либо invalid/mismatched success становятся
  `delivery_unknown` без blind retry; unresolved unknown или terminal `dead`
  блокирует sole bureau lane. Повтор или подтверждение доставки возможны только
  через audited operator reconciliation по правилам
  [domain/MESSAGING.md](../domain/MESSAGING.md). Target-bound synthetic preview
  smoke допускает no-send abort только до первого dispatch attempt; abort
  фиксируется append-only и не создаёт общий Cron/provider bypass. Если process
  оборвался уже после durable `dispatch_started`, отдельный target/cohort-bound
  reconcile только после lease expiry без provider secrets/send/retry переводит
  попытку в `delivery_unknown` для обычного manual resolution.
- **MSG-07.** До `full-manual-preview` выделенный preview bot и private bureau
  destination проходят реальный target-bound lifecycle через normal outbox:
  read-only preflight, ровно один минимизированный synthetic `sendMessage`,
  verify и предусмотренные abort/reconciliation/operator recovery проверки.
  Preview bot token/destination не переиспользуются в production. Недостающий
  внешний bot/chat parameter или разрешение запрашивается непосредственно перед
  соответствующей операцией и не является основанием откладывать всю
  предшествующую локальную подготовку и проверку.
- **ADMIN-01.** Админка покрывает import runs/issues, review tasks, legacy-
  поиск, пользователей и детей, каталог, прайс, trials, requests/documents,
  contracts/enrollments, price reviews, messages и outbox. Для family name-match
  она показывает review и предоставляет отдельный preview/confirm-инструмент
  исправления current FamilyID аккаунта со списком затронутых детей и конфликтов;
  свободный ввод непроверенного номера и тихий merge запрещены.
  Навигация группируется как «Семьи и обращения», «Занятия и договоры»,
  «Данные и система», сохраняет все ссылки и отмечает текущий раздел, включая
  его detail routes. На мобильном группы раскрываются штатным доступным
  элементом; обзор содержит быстрые переходы к повседневным операциям.
  Счётчик заблокированных аккаунтов отображается без кликабельного перехода;
  отдельная ссылка «Все учётные записи» открывает `/admin/users` без
  предустановленных фильтров. Подсчёт, поиск и существующие фильтры не меняются;
  новый фильтр только заблокированных отложен решением владельца 2026-09-15.
  Каталог сначала показывает занятия и их статусы; формы изменений открываются
  по запросу. Сопоставления отделены и по умолчанию свёрнуты с числом загруженных
  записей; каждая запись доступна отдельно независимо от совпадения названий.
  Технические реквизиты и JSON договора находятся в раскрываемой форме с широкой
  моноширинной областью ввода; предупреждения остаются видимыми. Списки договоров
  различают готовность PDF, ожидание родителя и фактическое состояние договора.
  Пустые выборки договоров и прайса имеют пояснения на DE/RU. (`UI-01`, `CAT-02`)
- **ADMIN-02.** Изменение ролей, связей семьи, классификации, цены, вместимости,
  статуса, договора, документа или outbox фиксируется в audit log с actor,
  действием, target, временем и безопасным diff без секретов/содержимого файла.
  Назначение admin дополнительно применяет server-side transition guard из
  `AUTH-09`; rejected переход не меняет роль/сессии и не создаёт успешное audit
  evidence.
- **ADMIN-03.** Опасные повторные действия защищены idempotency и подтверждением;
  списки имеют поиск/фильтр и не выгружают PII без явной необходимости.
  В каталоге состояние формы связано с конкретной записью: изменение состава
  списка не переносит решение или подтверждение на соседний объект. Успешная
  отправка сбрасывает отправленную форму; ошибка сохраняет её ввод и retry key.

### 10.1. Production import актуальных legacy-данных

- **IMPORT-01.** Актуальные Access и PlusBText источники всегда остаются
  read-only и читаются только неисполняющими allowlisted parsers без
  Access/Excel/COM/LibreOffice и без VBA. Access обязан соответствовать
  `access-tblkartei:1`; PlusBText — `admin-xlsm-plusbtext:1`. Логический v1
  header имеет пустые `E/K/T` и непустые `F/L/M/N`; styled self-closing OOXML
  cell является допустимым представлением пустой ячейки, а не новой версией
  contract. Любой настоящий structural drift блокирует staging.
- **IMPORT-02.** До remote write создаётся неизменяемый no-write plan: он
  pin-ит `preview|production`, exact environment-specific D1 UUID, полный git
  commit, academic period, source/contract/structure/version hashes, ожидаемое
  число Access rows, безопасный diff и exact expected-current PlusBText/Access
  pair. Schema-v3 plan обязательно фиксирует `sourceClass`: preview принимает
  только встроенные детерминированные `synthetic_preview` baseline/candidate
  bundles на 1703 строк, фиксирует exact `syntheticFixtureId`
  `legacy-preview-synthetic-baseline-v1` либо
  `legacy-preview-synthetic-candidate-v1` и отклоняет любые Office source paths,
  production принимает только
  `current_production` с обоими явными read-only source paths. Plan artifact
  хранится только в ignored protected `imports/*.json`, а stdout/evidence не
  содержат PII, локальных путей, source rows или secrets.
- **IMPORT-03.** Remote stage записывает детерминированные unpublished
  PlusBText и Access versions; Access version ссылается именно на staged
  PlusBText version. Stage не меняет runtime current pair. Review является
  отдельным явным действием и immutable связывает staged digest, opaque
  operator ID, safe reason code и переданный canonical UTC timestamp. Plan и
  stage выполняют разные operators, reviewer не совпадает ни с одним из них,
  а transition operator не совпадает с reviewer. Неоднозначный результат write
  не повторяется вслепую: тот же plan безопасно reconciles deterministic state,
  завершённый step принимает как idempotent, незавершённый failed staging
  очищает только с append-only cleanup evidence, а mixed/conflicting state
  блокирует. Plan, унаследованный из `0016` без hardened actor/count contract
  (`planned_by`/`staged_by` `NULL` либо пустой contract), остаётся immutable
  evidence, но не может перейти ни в один lifecycle status: после `0018`
  оператор обязан создать новый schema-v3 plan.
- **IMPORT-04.** Promote разрешён только exact-target remote-командой с
  review digest, защищённым recovery-evidence artifact, привязанным к exact
  target/plan/review и свежему independent isolated restore, и typed
  confirmation, связанным с action/environment/D1 UUID/review/recovery/operator.
  Recovery verifier обязан отличаться от planner, stager, reviewer и promoter;
  promoter также не совпадает с reviewer.
  PlusBText и Access current pointers, Access projection, import runs,
  append-only events и audit переключаются как один dependency-compatible D1
  batch под двумя leases/fencing tokens и compare-and-set expected-current;
  частично опубликованная legacy pair недопустима. Представительная
  1703-row projection обязана укладываться в provider query limit; все
  коррелированные snapshot/current lookups имеют явные проверяемые индексы.
- **IMPORT-05.** После каждого stage/promote/rollback/roll-forward выполняется
  PII-free verify: plan/run state, immutable planned-versus-actual source,
  snapshot, projection и issue counts,
  current-pair uniqueness, exact Access→PlusBText dependency, foreign-key
  integrity и append-only event counts. До production тот же reviewed artifact
  проходит synthetic preview stage/promote/verify/rollback/roll-forward и
  доказывает remote batch transactional semantics; локальные D1 tests не
  заменяют это environment evidence. Production transitions обязаны fail closed,
  пока это remote transaction evidence не зарегистрировано в release process:
  до API-token lookup/network call возвращается
  `LEGACY_RELEASE_PRODUCTION_TRANSACTION_EVIDENCE_NOT_IMPLEMENTED`.
- **IMPORT-06.** Rollback и roll-forward всегда переключают совместимую
  PlusBText/Access pair атомарно и требуют тот же immutable review binding.
  Если это первый import и previous pair отсутствует, logical rollback
  fail-closed; promote всё равно требует проверенный внешний D1 recovery point.
  Network/timeout/malformed response после write считается
  `delivery_unknown`: operator сначала запускает read-only verify/reconciliation
  и только затем повторяет ту же deterministic команду. Production import,
  migration или promotion выполняются лишь по отдельному прямому разрешению.
- **IMPORT-07.** Access normalization использует future `O/R/S` как group,
  фактическую imported legacy price и contract marker, а `T` — только как
  activity code: `KN` inactive, `NH/N/IND` hourly, token `O/V` (`V/O` legacy
  alias) в `S` monthly, отсутствие token — yearly. Пустая `O` не создаёт
  enrollment. Parent-name normalizer v2 принимает ровно две допустимые части с
  `;`, `,` либо одним пробелом, но slash/multipart остаётся manual. Missing
  duration допустима для individual/Nachhilfe с 3000 cents/45 minutes, но не для
  group. Invalid email не участвует в auto-claim; invalid birth date не создаёт
  child/enrollment. Package groups читаются только из первых четырёх ячеек
  каждого блока: `Value37–Value40` (`AK–AN`) и `Value42–Value45` (`AP–AS`);
  `Value41/AO` и `Value46/AT` всегда считаются служебными полями и не создают
  group/enrollment/mapping независимо от содержимого. Exact child/group
  duplicates не завышают occupancy, а contact/identity conflicts получают
  безопасную admin-traceable issue reference.
- **IMPORT-08.** Каждый actionable import issue имеет долговечный reconciliation
  case, связанный со stable source identity, academic period, issue code и exact
  import version. Case проходит только типизированные состояния `open`,
  `assigned`, `awaiting_upstream`, `ready_to_verify`, `resolved` или
  `superseded`; generic resolve/dismiss не может закрыть требующее исправления
  отклонение. Upstream-коррекция считается завершённой только когда последующий
  immutable import доказывает исчезновение того же issue; повторение сохраняет
  или переоткрывает case. Course mapping использует только exact audited target,
  fuzzy mapping запрещён. Identity/contact/email/birth-date/price/duration и
  duplicate decisions выполняются через отдельные typed actions с RBAC, CSRF,
  append-only audit/evidence и PII-minimized list/export. Полный контур задан в
  [IMPORT_ADMIN_RECONCILIATION_TZ.md](../implementation/IMPORT_ADMIN_RECONCILIATION_TZ.md)
  и является обязательным gate штатного повторяемого импорта.
- **IMPORT-09.** Remote provisioning учебного периода выполняется только через
  exact-target audited boundary с явными environment/D1 UUID, полным Git SHA,
  утверждёнными period fields, opaque operator, canonical timestamp и
  digest-bound confirmation. Period и deterministic audit event создаются
  атомарно: конфликт period/current/audit не оставляет частичную запись, а
  byte-identical replay сохраняет ровно одну exact пару. Любая неопределённость
  после dispatch write-команды требует SELECT-only reconciliation с теми же
  аргументами; blind retry и direct SQL запрещены.

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
  Любая claimed current legacy service, кроме явно завершённой `KN`, считается
  blocker fail-closed, даже если её нельзя использовать для occupancy. Closure
  и email dispatch сериализуются: уже claimed `processing` email не допускает
  closure, а установленный closure lock не допускает новый claim. Неудерживаемые
  operational subject/body/preferences и draft snapshots минимизируются; обычные
  admin списки не становятся обходом закрытого legal archive.
- **REL-01.** Все import publish, claim, acceptance, activation и смены статуса
  идемпотентны и не оставляют частично примененное состояние.
- **REL-02.** Для D1 и R2 до production описаны backup/restore и проверка
  восстановления. Ошибки внешних email/Telegram API обрабатываются outbox.
- **TIME-01.** Timestamps хранятся в UTC. Даты договора, trial и вступления цены
  трактуются в `Europe/Berlin`; переходы DST покрываются тестами.
- **UI-01.** Весь веб-интерфейс самостоятельного регистрационного приложения
  (public/auth, parent и admin) доступен на немецком и русском с общим
  переключателем `Deutsch / Русский`. По умолчанию используется немецкий;
  выбор сохраняется в отдельной host-only cookie браузера, действует до и
  после входа, при переходах и повторном открытии, применяется к SSR, заголовкам,
  навигации, формам, подсказкам, статусам и серверным сообщениям об ошибках.
  Изменение языка не меняет роль, business state, числовые суммы, валюту EUR,
  календарные даты или timezone `Europe/Berlin` и не запускает повторную отправку
  формы. Основные формы адаптивны для мобильного экрана, доступны с клавиатуры,
  имеют связанные labels и понятные inline errors. Тексты используют i18n-ключи;
  неизвестная locale получает немецкий fallback, будущие `en`, `uk` не включены.
  Email, Telegram, договоры/PDF, документы и сохраняемые доказательства согласия
  остаются на немецком. Немецкая versioned формулировка согласия показывается
  неизменённой; в русском UI рядом показывается перевод. Импортированные названия,
  свободный текст переписки и диагностические JSON/resource identifiers не
  переводятся автоматически. Cloudflare Access, браузерные системные диалоги и
  внешний официальный сайт не относятся к управляемому UI портала. (`OQ-007`)
  Во всех упоминаниях учреждения используется полное название
  `Kinder- und Elternzentrum "KOLIBRI" e.V.` на обоих языках, включая UI,
  письма/имя отправителя и служебные уведомления. Машинные ключи и исторические
  immutable artifacts от переименования не меняются. Для SYS-05 детали заданы в
  [TRIAL_INTAKE](../domain/TRIAL_INTAKE.md#название-учреждения-и-клиентские-тексты).
  Общая шапка содержит это полное название, каталог, переключатель языка и переходы по
  текущей серверной роли: гостю — вход/регистрация; parent — кабинет,
  сообщения/настройки; admin — администрирование/настройки. Для вошедшего
  пользователя показана роль; выход использует существующий CSRF-защищённый
  POST. Навигация обновляется после входа/выхода и обычного перехода/reload;
  персональное состояние не попадает в общий кэш. В browser передаются только
  role, текущий путь и штатный form CSRF token, без session identifiers/hash/token.
  Главная кратко объясняет назначение портала и ведёт к действующим функциям;
  восстановление пароля и повторное подтверждение доступны в auth-формах.
  Отказ 401 просит войти; 403 объясняет недоступность для текущей роли,
  для admin на parent-странице — необходимость входа родителя. Прямой HTML
  и клиентский переход сохраняют HTTP-статус, request ID, security headers,
  no-store, DE/RU-текст и подходящий следующий переход. Неверные credentials
  сообщаются при неуспешном входе, а не при отказе роли. Общая светлая оболочка
  использует белые карточки и единый акцент; поля ограничены шириной контейнера,
  даты/короткие числа компактны, текст переносится, таблицы прокручиваются
  локально. На 390 px нет горизонтального переполнения документа; основные
  действия имеют видимый focus и область касания не менее 44 px.
- **OBS-01.** Ошибки получают correlation/request ID; админ видит состояние
  import/outbox, но технические детали и PII не раскрываются родителю.
- **OBS-02.** Независимый monitoring проверяет fail-closed Worker endpoint без
  тела ответа и PII. Automatic delivery хранит fixed-cardinality state для двух
  cadence (`fast`/`maintenance`), а не append-only row каждого job. Cadence
  становится unhealthy, если fast delivery старше 180 секунд, maintenance
  delivery старше 1200 секунд, cadence остаётся `running` дольше 360 секунд
  либо за 900 секунд накоплено не менее трёх scheduled/application Worker
  errors. Cadence завершается успешно только после terminal результата всех
  jobs; явные manual runs остаются в отдельном аудируемом ledger. Global
  scheduled stop проверяется до D1, даёт monitoring `503` и не создаёт ложный
  heartbeat. Application 5xx агрегируются в минутные счётчики, saturate на
  alert threshold и удаляются через 7 суток; прикладные email/Telegram providers
  не используются для monitoring alerts.
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

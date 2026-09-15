# Критерии приемки и краевые случаи

Ревизия: 2026-09-13.

Критерии дополняют [MVP_SPEC.md](MVP_SPEC.md), но не вводят отдельные
бизнес-правила. Идентификаторы в скобках указывают связанные требования.

## 1. Глобальное Definition of Done

MVP готов, когда:

- миграции применяются к чистой D1 и повторно проверяются в preview-среде;
- импорт текущих безопасных reference-файлов завершается отчетом, а повторный
  запуск не создает дубликаты;
- все обязательные пользовательские и административные сценарии ниже проходят;
- до checkpoint `full-manual-preview` входящие в MVP email, Telegram,
  Browser-contract и upload/manual-review paths реально включены и пройдены в
  Access-protected preview на synthetic/no-PII data; их production
  `feature_disabled`/approval status не подменяет это evidence. (`SYS-04`)
- `npm run check`, `npm test` и `npm run build` выполняются успешно;
- authorization-, CSRF-, import rollback-, pricing- и upload-тесты включены в
  автоматический набор;
- секреты, source PII и generated artifacts отсутствуют в git и build output;
- production-конфигурация, миграции и rollback описаны; backup/restore для D1
  и R2 документирован, а тестовое восстановление в непроизводственную среду
  успешно проверено до production. (`REL-02`, `OPS-01`)
- каждый применимый owner, legal, security, provider и operational gate из
  `operations/PRODUCTION_READINESS.md` имеет evidence и status `passed` либо
  соответствующий production path технически выключен со status
  `feature_disabled`; `blocked` не совместим с production-ready. Это относится
  и к открытым вопросам, но не ограничивается ими. (`OPS-01`)

## 1A. Системная граница портала и официального сайта

- Портал собирается, разворачивается и выполняет auth/catalog/cabinet smoke без
  исходников, CMS/API, credentials, cookies, session или доступности runtime
  официального сайта. Его Worker, D1/R2 bindings, secrets и release rollback
  перечислены отдельно. (`SYS-01`)
- Переход между сайтом и порталом является обычной HTTPS-навигацией и не требует
  iframe, reverse proxy, CORS-интеграции или общей сессии. Portal session cookie
  host-only и не содержит `Domain`. (`SYS-01`, `SYS-02`, `SYS-03`)
- Все absolute portal links используют валидированный `PORTAL_PUBLIC_ORIGIN`;
  подмена origin внешним host или origin официального сайта отклоняется.
  Release manifest содержит итоговый portal origin и утверждённый список link
  surfaces сайта, а не молча выбирает одну страницу расписания. (`SYS-02`,
  `SYS-03`)
- Без отдельного прямого поручения deployment портала не меняет CMS, DNS или
  инфраструктуру официального сайта. Размещение/откат обычных ссылок является
  отдельной go-live операцией и не смешивается с rollback портала. (`SYS-02`,
  `SYS-03`)

## 2. Auth и изоляция данных

- Регистрация с нормализованным дубликатом email не создает второго аккаунта и
  не раскрывает существование первого. (`AUTH-01`, `AUTH-07`)
- Успешная registration transaction создаёт ровно одно immutable
  acknowledgement выбранной privacy notice version; rollback или отсутствие
  явного принятия не оставляет account/acknowledgement. (`AUTH-02`, `REL-01`)
- Регистрация отклоняет Turnstile token при `success=false`, несовпадении action
  `registration`, отсутствии hostname или несовпадении hostname с exact allowlist
  текущего deployment; production config не принимает local hostnames. (`AUTH-02`)
- Server Siteverify path проверяется также с default native `fetch` в Workers
  runtime: solved token действительно отправляется провайдеру, receiver error
  не маскируется injected Node fetch mock. (`AUTH-02`)
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
- Нативный browser form POST на Access-protected portal origin проходит при
  exact configured `Origin`; отсутствующий либо literal `null` Origin проходит
  только с Fetch Metadata `same-origin` + `navigate` + `document`. Cross-site,
  malformed и incomplete metadata отклоняются до route action. (`AUTH-06`,
  `SEC-01`, `SYS-03`)
- Обход client-side validation не обходит server schema; SQL-injection payload
  остаётся данными параметризованного запроса, а сохранённый пользовательский
  HTML отображается экранированным. Автотесты покрывают CSRF, authorization и
  rate limits на изменяющих endpoints. (`SEC-01`)
- Изменение `child_id`, `request_id`, `document_id`, `offer_id` или `thread_id`
  на идентификатор другого пользователя всегда дает безопасный `403/404`, в том
  числе для R2 download. (`AUTH-08`, `REQ-07`)
- Публичная регистрация не может создать admin; заблокированный admin также не
  проходит middleware. (`AUTH-09`)
- Оба server-side пути `parent -> admin` (one-shot bootstrap и обычное
  назначение существующим admin) атомарно отклоняют verified target с любым
  retained parent workflow/business state: роль и sessions не меняются,
  успешное role/bootstrap audit evidence не появляется. Verified target с
  только пустой FamilyID allocation и её служебным verification receipt
  `family_finalization_commits.result_kind=portal_allocated` может пройти
  разрешённый bootstrap и обычное назначение admin. Receipt сохраняется;
  `exact_email` и любое другое retained business/workflow state остаются
  блокирующими. Regression проходит обычные registration и email verification
  с default family extension, затем проверяет role/session/audit/control;
  последующая fresh login ведёт parent в `/cabinet`, admin в `/admin`.
  (`AUTH-09`, `ADMIN-02`)

## 3. Legacy claim

- До email verification ответы/UI одинаковы независимо от legacy-совпадения;
  unverified account не имеет/не видит FamilyID или маску legacy-email.
  (`CLAIM-01`)
- Первая successful verification атомарно завершает family assignment. Fixture
  без exact legacy-email получает следующий unique namespace `2`; fixture с
  ровно одной eligible unowned family по normalized email получает её namespace
  `1` и связанные children/services. Concurrent/replayed finalization возвращает
  одно назначение, без пропуска/двойного owner. (`CLAIM-02`)
- При отсутствии current promoted legacy snapshot, lookup error или concurrent
  promotion verification/finalization откатывается без consumed token, FamilyID
  и namespace-2 gap; retry на стабильном snapshot даёт обычный 0/1/multiple
  результат. (`CLAIM-02`, `REL-01`)
- Ноль matches, несколько FamilyID по одному email, collision и already-owned
  family дают один namespace `2` и typed admin review; parent не получает список
  кандидатов/FamilyID/адресов. Ни один неоднозначный вариант не claim-ится.
  (`CLAIM-05`)
- При ровно одном deterministic, unowned совпадении фамилии+имени и одном ином
  usable legacy-email кабинет namespace-2 account показывает предложение с маской
  вида `el*****n@gmail.com`, но не полный адрес. Local part короче четырёх
  символов скрыт строже и никогда не раскрывается целиком. Любой parent-name
  match, включая exact-email case, создаёт admin review task. (`CLAIM-03`,
  `CLAIM-06`)
- Opt-in ставит proof email в outbox полного legacy-recipient без его появления
  в UI/URL/audit/log. Token hashed, one-time, expiring, rate-limited и связан с
  user/candidate/family version; GET не меняет state, confirmation POST требует
  authenticated session того же user и CSRF. (`CLAIM-04`, `AUTH-07`)
- Valid proof одной transaction меняет current FamilyID account `2.* -> 1.*`,
  связывает legacy data и обновляет `family_number_id` всех его детей. Invalid,
  expired, replayed, foreign-session token или ownership race не меняет account/
  child, а повтор success идемпотентен. (`CLAIM-04`, `REL-01`)
- Два аккаунта, одновременно претендующие на одну семью, не получают два
  владения; проигравшая операция сохраняет прежний namespace `2` и создаёт
  ручную проверку без утечки PII. Последующая смена login-email сама по себе
  FamilyID не меняет. (`CLAIM-05`)
- Родитель не может сменить owning account/FamilyID ребёнка через UI или прямой
  API. У verified parent ровно один current FamilyID; каждый его child имеет
  ровно тот же `family_number_id`. Unclaimed legacy child допускает null owner,
  но не null FamilyID; invalid/missing/colliding source family остаётся review
  row без canonical orphan child. (`CLAIM-08`)
- Семья без usable email и совпадение только по имени никогда не self-claim;
  ambiguous name parse не создаёт selectable parent candidate. (`CLAIM-06`)
- Одинаковые имена детей с разными датами рождения не объединяются; пустая или
  конфликтующая дата создает warning/review. (`CLAIM-07`)
- Approved correction legacy child переживает повторный import: source value
  обновляется отдельно, а effective override сохраняется. (`CHILD-02`)
- Verified parent с assigned current family может создать ребёнка только с
  непустыми `full_name` и `birth_date`; child получает тот же FamilyID в create
  transaction. Unverified/unassigned parent и попытка null/foreign FamilyID
  отклоняются без orphan row; без saved owned child trial/request submit
  отклоняется. (`CHILD-01`, `CLAIM-08`)
- Create/update/select child повторно проверяет owner на сервере. Возможный
  дубликат внутри одного аккаунта требует явного решения пользователя, а
  публичный API не выполняет и не раскрывает cross-account сравнение детей.
  (`CHILD-03`)
- Совпавший непротиворечивый `source_namespace+FamilyID` в новом academic period
  наследует claim/owner и stable child, но получает новые period enrollments.
  Контактный/child конфликт или ошибочное повторное использование FamilyID
  создаёт continuity review без передачи owner. (`CLAIM-09`)
- Exact-email candidate, впервые появившийся после reimport или смены profile/
  login-email, создаёт review, но background job не меняет current FamilyID;
  переход возможен только approved claim/admin correction path. (`CLAIM-09`)
- Access row `ID` уникален только внутри source namespace + academic period:
  одинаковое значение в новом периоде не перезаписывает старую source row.

## 3A. Кабинет родителя

- На 1366×768 видны заголовок, быстрые действия «Выбрать занятие», «Добавить
  ребёнка», «Написать в бюро» и имеющийся блок внимания до форм детей/профиля.
  Блок внимания содержит только уже загруженные `sent` offers/price reviews
  и `needs_info|needs_documents` requests; draft и ожидающее администратора
  состояние не создают ложную просьбу ответить. При отсутствии таких объектов
  блока нет. Все разделы доступны по переходам; на 390×844 документ не имеет
  горизонтального переполнения. (`CAB-01`, `UI-01`, PVUI-03/05)
- Пустой кабинет объясняет отсутствие данных и предлагает следующие действия.
  Карточки детей показывают имя, локализованную дату и происхождение; формы
  добавления/изменения закрыты до раскрытия. Ошибки create/update/correction
  оставляют нужную форму открытой с введёнными значениями и связанным сообщением.
  Duplicate checkbox появляется только при фактическом предупреждении, требует
  явного выбора; серверная проверка сохраняется. Legacy correction не меняет
  имя/дату до административного решения, pending warning виден и при закрытой
  форме. Раскрытие с клавиатуры не отправляет POST; required-поля закрытых
  соседних форм не мешают отправке. (`CHILD-01–03`, `UI-01`, PVUI-03/05)
- Профиль и история раскрываются отдельно, предложения и обязательные
  предупреждения остаются доступными вне свёрнутой истории. Известные категории
  и статусы кабинета переведены на DE/RU; календарные даты не сдвигаются,
  timestamps сообщений показаны в `Europe/Berlin`, включая DST. Исходные
  названия/переписка и сохранённые payload не меняются. (`CAB-01–05`, `TIME-01`,
  `UI-01`, PVUI-07)
- На fixture с импортированным и portal-child кабинет показывает профиль,
  owned children, будущие импортированные занятия, активные enrollments, trials,
  requests/service engagements, contract offers и обращения; закрытие
  enrollment/engagement не удаляет хронологию заключения, активации и
  Kündigung digital договора. Claimed legacy record виден как строка активной
  услуги без contract label, PDF или download link. (`CAB-01`)
- Base-price total включает только известные подтверждённые текущие base prices
  активных `group|dance_group` услуг. Trial, inactive/future enrollment,
  `individual`, `nachhilfe`, unknown legacy amount, holiday adjustments,
  платежи и задолженность в сумму не входят; UI прямо говорит, что это не invoice
  и не фактическая payable amount.
  (`CAB-02`)
- Self-pay `individual` показывает configured тариф за 45 минут (default 3000
  cents) и предупреждение об отсутствии учёта фактически проведённых уроков.
  `nachhilfe` показывает funding kind и inclusive dates; unit rate 3000 cents/
  45 минут содержится в договоре, но не выводится как сумма к оплате родителем.
  (`CAB-03`)
- Для `existing_external_sepa` кабинет показывает только информационный текст
  о внешнем списании фактической суммы и не задаёт due day; для
  `manual_payment` — оплату фактической суммы с внешними корректировками не
  позднее 7-го
  числа следующего месяца. Base price не выдаётся за payable. Ни один вариант не создаёт mandate, ledger, debt или признак
  получения платежа. Funded Nachhilfe использует `not_applicable` без parent
  due text. (`CAB-04`)
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
- **AC-IMPORT-16.** Synthetic PlusBText v1 fixture со styled self-closing empty
  `K1` непосредственно перед populated `L1` сохраняет логический header
  `E/K/T empty; F/L/M/N present`, корректно читает target fields и не создаёт
  ложный `PLUSB_HEADER_CONTRACT_MISMATCH`/v2 drift. Перед release текущие
  read-only источники дают `admin-xlsm-plusbtext:1` и
  `access-tblkartei:1`; Access plan фиксирует ожидаемые `1703` source rows и
  `21/21` обязательных полей без вывода значений. Access birth date принимает
  validated ISO/German/native Date и строгий пятизначный OLE Automation serial;
  decimal/negative/short/long serial не угадывается и создаёт
  `ACCESS_CHILD_BIRTH_DATE_INVALID`.
- **AC-IMPORT-17.** `import:legacy:plan:remote` до любого write отклоняет
  отсутствующий `--remote`, example/mismatched config, неверный APP_ENV или
  D1 UUID, неизвестный period, изменившийся source/contract и Access row count,
  отличный от `--expected-access-rows`, dirty/mismatched Git candidate и
  отсутствующие opaque `--operator-id`/canonical `--created-at`. Preview plan
  сам создаёт встроенный 1703-row synthetic bundle, фиксирует
  `sourceClass=synthetic_preview`, exact baseline/candidate
  `syntheticFixtureId` (`legacy-preview-synthetic-baseline-v1` или
  `legacy-preview-synthetic-candidate-v1`) и отклоняет `--access-source`/
  `--plusbtext-source`; production фиксирует `current_production` и требует оба
  read-only path. Успех создаёт только schema-v3 ignored `imports/*.json`; safe
  stdout не содержит UUID, digests, source paths, secrets, email, телефоны,
  адреса, имена или raw rows.
- **AC-IMPORT-18.** Remote stage создаёт unpublished deterministic PlusBText и
  зависимый Access snapshot и current pair не меняется до promote. Повтор того
  же plan после timeout-before-commit и timeout-after-commit reconciles state
  без duplicate snapshot; mixed/conflicting deterministic state блокируется.
  Failed partial staging удаляется только точным повтором с append-only cleanup
  event и не позволяет удалить plan. Plan/stage operators различаются, review
  проходит только для exact staged digest, explicit canonical `reviewed-at` и
  третьего independent operator; после записи plan/count contract/review fields
  immutable. Populated `0016`→`0018` upgrade сохраняет прежний plan как
  immutable evidence, но lifecycle transition для plan с `NULL` actor fields
  либо `{}` verification contract fail-closed; продолжение требует нового
  hardened schema-v3 plan.
- **AC-IMPORT-19.** Promote без валидного recovery-evidence digest, без exact
  review binding/typed confirmation, при изменившемся current pair, неверной
  dependency или занятом lease ничего не публикует. Injected failure после
  начала PlusBText switch откатывает весь D1 batch; успешный promote оставляет
  ровно одну current PlusBText и Access pair, exact dependency, оба promoted
  run, append-only event и PII-free audit с recovery-evidence digest. Digest
  принимается только из защищённого artifact, который совпадает с exact
  environment/account/D1/plan/review/current-pair, документирует isolated
  restore, не старше 24 часов и подтверждён operator, отличным от planner,
  stager, reviewer и promoter. До отдельного remote transaction evidence
  production transition ещё до чтения API token или network call возвращает
  `LEGACY_RELEASE_PRODUCTION_TRANSACTION_EVIDENCE_NOT_IMPLEMENTED`.
  Для exact 1703-row preview fixture query plan всех коррелированных projection
  lookups использует version/current-scoped indexes; фактическое прохождение
  provider limit подтверждается отдельным remote preview lifecycle evidence.
- **AC-IMPORT-20.** Read-only verify возвращает только status, безопасные
  aggregate target/issue/event counts и booleans для pair uniqueness,
  dependency и `PRAGMA foreign_key_check`; D1 trigger и verifier отклоняют любое
  расхождение immutable verification contract с run/source/snapshot/projection/
  issue counts. Source rows и PII отсутствуют.
  Перед production synthetic preview evidence отдельно доказывает реальную
  remote batch atomicity, timeout/reconciliation и expected row-count check;
  одних local integration tests недостаточно.
- **AC-IMPORT-21.** Rollback и roll-forward атомарно переключают обе versions,
  сохраняют Access→PlusBText dependency и append-only history; повтор после
  ambiguous completed write является idempotent после verify. Для first import
  без previous pair rollback завершается
  `LEGACY_RELEASE_ROLLBACK_TARGET_MISSING`, а promote невозможен без внешнего
  recovery-evidence digest. Ни одна acceptance-проверка не выполняет
  production import/deploy/migration без отдельного разрешения.
- **AC-IMPORT-22.** Synthetic Access rows доказывают exact crosswalk: blank `O`
  не создаёт enrollment; `T=KN` inactive; `T=NH/N/IND` hourly; ordinary/dance
  group с token `O/V`/`V/O` в `S` monthly, а blank/other `S` yearly. Значения
  `J/M/O/V` в `T` contract kind не выбирают. Текущий source после этого не
  создаёт `ACCESS_STATUS_PROVISIONAL_MONTHLY`.
- **AC-IMPORT-23.** Parent normalizer v2 принимает `Surname;First`,
  `Surname, First` и ровно `Surname First` с optional whitespace, но slash,
  несколько separators и multipart whitespace остаются ambiguous и не создают
  ownership. Family contact/name/identity issue имеет safe source key и opaque
  family reference, пригодный для admin correction без PII в report.
- **AC-IMPORT-24.** Missing PlusBText duration и zero/blank `R` не создают review
  для `KN|individual|nachhilfe`; hourly rate остаётся 3000 cents/45 minutes.
  Missing group duration и zero/invalid active group `R` остаются review.
  Positive `R` является current imported legacy price и не заменяется lookup.
- **AC-IMPORT-25.** Invalid legacy email получает normalized `NULL` и не
  участвует в automatic claim. Invalid/missing birth date сохраняет source issue,
  но не создаёт legacy child/enrollment; valid portal date не исправляет source
  и требует explicit admin reconciliation.
- **AC-IMPORT-26.** Synthetic rows доказывают, что `Value37–Value40` и
  `Value42–Value45` являются четырьмя package slots соответствующего блока, а
  `Value41/AO` и `Value46/AT` всегда игнорируются как service-marker cells при
  любом содержимом. Current future-period extract сохраняет `Value46` как source
  evidence, но не создаёт enrollment, lookup или issue; `Value41` не входит в
  этот future-period allowlist. Exact child/group repetitions дают structural duplicate
  context и не завышают occupancy; разные normalized names, включая day suffix,
  не объединяются.
- **AC-IMPORT-27.** Повторные import runs создают или переиспользуют один durable
  reconciliation case по stable source identity + period + issue code в рамках
  active lifecycle. Terminal typed case при повторном появлении того же
  отклонения сохраняется, а recurrence создаёт новый active case. Исчезнувшее
  после upstream correction отклонение закрывается только как
  `resolved_by_reimport` с exact previous/current version evidence от строго
  более нового run; replay старого validated run не закрывает case.
  Переход run в `validated` сам по себе не завершает reconciliation: promotion
  и registration требуют immutable exact run/version completion marker,
  записанный только после materialization всех actionable `ACCESS_*|PLUSB_*`
  issues и равенства issue/occurrence counts. Crash до marker fail-closed;
  поздняя mutation materialized issues запрещена.
- **AC-IMPORT-28.** Actionable import issue нельзя закрыть generic
  `resolve|dismiss`. Typed action требует current admin, CSRF, reason code,
  optimistic version/idempotency key и append-only audit/assertion; concurrent
  либо stale submit отклоняется без частичного изменения. Exact typed evidence
  связывается с case decision/run/version и повторно валидируется внутри того же
  atomic D1 batch; отозванное или изменившееся evidence не освобождает gate.
- **AC-IMPORT-29.** Course/group case принимает только exact catalog target либо
  `awaiting_upstream`; fuzzy/substring/day-insensitive match запрещён. Ошибочная
  source group остаётся исключённой из automatic mapping до исправления Access и
  подтверждающего reimport. Изменение source group при новом snapshot заново
  вычисляет mapping/occupancy и сбрасывает несовместимую representation.
- **AC-IMPORT-30.** Identity/contact/email/birth-date/price/duration/duplicate
  cases направляют администратора в соответствующий typed tool. Invalid email
  не участвует в claim; invalid birth date не импортируется; duplicate service
  учитывается один раз, пока отдельность exact пары услуг не доказана; child
  correction совпадает с exact case family/source/version и `source_child_key`,
  поэтому same-name/different-DOB sibling не закрывает case. Подтверждение
  `same_service_duplicate` атомарно supersede-ит незавершённый peer price-review
  и блокируется, если peer price review уже applied. Batch action разрешена
  только для одной issue class и одного решения и атомарна для всего cohort.
- **AC-IMPORT-31.** Queue/list/export/log содержат только opaque case/family/
  source references, codes, counts, state и timestamps. PII доступна лишь в
  уже авторизованной entity detail; export применяет текущие filters ко всему
  результату, а не к одной UI page. Promotion/registration gates fail-closed
  при отсутствии completion marker, active blocking cases и blocking occurrence
  exact candidate/current run/version без live valid typed evidence;
  retention/cleanup оставляет append-only audit.
- **AC-IMPORT-32.** Exact-target academic-period provisioning до write проверяет
  real non-example config/account/D1 UUID, clean full Git SHA и digest-bound
  approved fields. Успех и byte-identical replay оставляют ровно один exact
  period и один valid deterministic audit event; заранее занятый несовместимый
  audit ID, conflicting period либо другой current period отклоняются без новой
  business mutation. Malformed/truncated result, timeout или иная
  неопределённость после dispatch классифицируются как ambiguous и разрешаются
  отдельной SELECT-only exact-argument reconciliation в `applied`,
  `not_applied` либо `conflict`; blind retry и direct SQL запрещены.

## 5. Каталог, capacity и trial

- Каталог использует только опубликованную версию периода; прошлые или staging-
  данные не смешиваются с ней. (`CAT-01`)
- Две разные schedule-записи с одинаковым названием остаются разными курсами,
  пока админ явно их не сопоставит. (`CAT-02`)
- CTA опубликованных `group|dance_group` открывает trial form для выбранной
  группы; CTA `nachhilfe|individual` открывает соответствующую request form и
  не предлагает trial. (`CAT-03`)
- Вторичная ссылка группы открывает существующее обращение `contract` с DE/RU
  темой и текстом выбранного занятия, включая расписание. Родитель может
  изменить текст; при отказе валидации/CSRF значения и ключ идемпотентности
  сохраняются. Отправка остаётся явным защищённым message action; повтор с тем
  же ключом не создаёт второе обращение. (`CAT-03`, `MSG-01`, PVUI-04)
- Переключение DE/RU до отправки сохраняет изменённые категорию/тему/текст,
  включая пустые значения, и retry key после отказа. Нетронутые defaults
  переводятся; новый вход в обычную форму не получает правки другого обращения.
  Само переключение не отправляет business action. (`CAT-03`, `UI-01`, review R2)
- Неопубликованный, retired, staging, неизвестный, некорректный ID или занятие
  без текущей session не дают предзаполнения и не раскрывают скрытую запись.
  Individual/Nachhilfe не получают групповой contract entry. GET/load и обычные
  переходы не создают thread/message/request/trial/offer/enrollment; штатный
  session last-seen не считается business entity. (`CAT-01`, `CAT-03`)
- Карточки сохраняют исходное название и synthetic маркировку, показывают
  предмет, расписание, преподавателя, место, длительность, честную доступность
  и цену либо «Цена уточняется». Рядом с запросом объяснено отсутствие резерва
  и принятия договора; страница предложения объясняет подготовку администрацией,
  принятие родителем и последующее подтверждение. На 390×844 и 1366×768
  карточки и формы доступны без переполнения документа; trial, сообщения,
  individual/Nachhilfe и договор имеют возврат в кабинет. (`CAT-01–04`,
  `CONTRACT-01`, `UI-01`, PVUI-04/05/07)
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
  состава при `N > 0` используется `min(N, 6)`, без второго `+1`. Для
  пересмотра при `N = 0` price lookup/items не создаются.
- Capacity 12/15 не меняет price lookup cap 6.
- Legacy occupancy и portal occupancy объединяются без двойного учета связанной
  записи и вычисляются на выбранную дату.
- `group_yearly` quote берёт месячную ставку `Preis`, а `group_monthly` —
  месячную ставку из исторически названной `Sonderpreis`; `O/V|V/O` означает
  monthly contract, а не льготу. Клиентский payload не меняет contract kind/
  source column. (`PRICE-01`)
- Self-pay `individual` использует configured тариф с default 3000 cents, а
  funded `nachhilfe` — фиксированные 3000 cents за 45 минут. Nachhilfe не
  получает сумму к оплате parent и до approved document,
  funding kind и inclusive dates остаётся в admin review. (`PRICE-02`)
- Только admin может создать `manual_override`: отдельный экран показывает
  base/override/delta и warning, требует reason и повторное подтверждение,
  сохраняет immutable base/rule/source snapshot и audit. Override меняет mode/
  final, но не теряет provenance. Parent tampering, bulk
  default, `O/V`, notes и колонка `Sonderpreis` override не создают.
  (`PRICE-04`)
- Exact lookup учитывает key, subject-duration vector и child count. Равные или
  неоднозначные кандидаты возвращают `needs_admin_review`.
- Для однозначного `group|dance_group` с пустым `PlusBText!T`, известными
  `group_yearly|group_monthly` и price key разрешён только quote-fallback 90
  минут: `2 × 2300 = 4600` либо `2 × 3000 = 6000` cents. Он помечен
  `ESTIMATED_MISSING_DURATION`, показывает предупреждение на выбранном языке UI и требует
  admin confirmation длительности/суммы; billing period сразу
  `calendar_month`. (`PRICE-02`)
- Fallback не меняет source `null`, не входит в monthly total/repricing и не
  используется в отправленном offer до admin confirmation. Он запрещён для
  `individual|nachhilfe|group_nachhilfe`, unknown/ambiguous mapping или contract
  kind, непустого/невалидного `T` и missing/ambiguous price key.
- Manual override полностью заменяет base, содержит причину и admin audit;
  итог не может быть отрицательным, автоматического discount нет.
- Старый quote после смены price/schedule version или occupancy пересчитывается
  при создании offer и не считается гарантированной ценой.
- Публикация новой active price version сама по себе не создаёт client batch,
  item или outbox message. Только явный auditable admin comparison запускает
  соответствующий review; автоматические occupancy/boundary triggers остаются
  отдельным источником по `CONTRACT-10`. (`PRICE-03`)
- Один price review batch создаёт отдельный клиентский item только для
  enrollment, где current accepted final price или mode отличается от
  рассчитанного предложения; triggering enrollment с уже актуальным snapshot
  item не получает. Empty batch завершается без сообщений; согласие одного
  родителя не меняет статусы остальных.
- Claimed legacy-only active service с однозначным owner/mapping и известной/
  admin-confirmed price включается ровно один раз и проходит тот же email/
  accept/second-admin-confirm/apply flow; apply создаёт effective price
  assignment, не мутирует source и не создаёт contract/PDF. Unknown/unclaimed/
  conflicting legacy имеет explicit decision code и
  `manual_contact_required` без send/accept/apply. Represented legacy + portal
  enrollment не дублируются. (`PRICE-03`)
- `5↔6` меняет lookup и создаёт обычные review items. `7→6` и изменение только
  выше cap 6 не меняют lookup и клиентских items не создают. (`PRICE-03`)
- Первый admin approval разрешает только рассылку. Parent acceptance не меняет
  service price; response deadline равен 14 календарным дням, каждый accepted
  item требует второго явного admin confirmation. Current admin не может дать
  parent response, а actor final confirmation не совпадает с parent actor/owner,
  включая повышение роли после response. Decline немедленно уведомляет admin,
  timeout создаёт manual-contact task. (`AUTH-08`, `PRICE-03`)
- Increase/decrease не вступает задним числом. После второго admin confirmation
  item планируется на первое число следующего календарного месяца в
  `Europe/Berlin`; до idempotent apply действует старая base price. Отдельный
  PDF-addendum не создаётся, evidence строится из item/hash/delivery/actions.
  (`PRICE-03`)
- Второе изменение occupancy/price version supersede несовместимые open items
  предыдущего batch. Final admin confirmation/apply отклоняет stale count/rule,
  изменённую old price/mode, ended/moved enrollment, closed account и newer item;
  поздний parent response сохраняет evidence, но не оживляет stale item.
  (`PRICE-03`, `REL-01`)

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
  количеством сверх лимита отклоняется до сохранения metadata. ZIP, Office,
  SVG/XML, executable и encrypted/password-protected PDF также отклоняются.
  (`REQ-06`)
- При configured maximum `1` два конкурентных допустимых upload не создают два
  документа. Аналогично два конкурентных файла не обходят пониженный aggregate
  byte ceiling: ровно допустимое подмножество фиксируется атомарно, а
  отклонённый upload не получает domain link. (`REQ-06`, `REL-01`)
- Несколько JPEG/PNG разрешены в пределах лимита; два повтора одной upload-
  операции не создают два документа.
- Принятый upload хранится в private R2 под непредсказуемым ключом без public
  URL; D1 содержит metadata, checksum и начальное состояние `quarantined`, но
  не содержимое файла. (`REQ-05`)
- Истекшее Jobcenter/Sozialamt-разрешение не используется для новой активации.
  Inclusive start/end dates и funding kind хранятся отдельно от pages;
  payer/reference/hours не копируются из документа в D1. (`REQ-04`)
- Funding authorization допускает только
  `pending_review -> approved|rejected` и
  `approved -> revoked|superseded`; terminal status нельзя реактивировать.
  Expiry вычисляется по inclusive `valid_until`, а замена approved content
  создаёт новую version и сохраняет прежнее evidence. Approval, offer send и
  activation требуют хотя бы один current document и запрещают любой его state,
  кроме `approved`. (`REQ-04`, `REQ-05`)
- Offer, чей term выходит за funding `valid_until`, остаётся в admin review и
  не активируется. (`REQ-10`)
- Parent не может заменить/удалить document, уже связанный с sent/accepted offer
  или contract; replacement создаёт новую authorization version и не
  переключает старый contract. Expiry/revoke/supersede active funding атомарно
  supersede open offers, ставит engagement в `funding_review` и создаёт admin
  task без silent contract termination. Продолжение после `funding_review`
  требует нового approved funding и admin amendment; изменившиеся parent-facing
  terms требуют нового offer/
  acceptance. (`REQ-08`, `REQ-10`)
- Удаленный/замененный файл недоступен пользователю, но audit metadata и событие
  удаления сохраняются. (`REQ-08`)
- Новый файл остается `quarantined`; обычный/public download запрещен, доступ
  admin возможен только как audited forced attachment без inline preview до
  clean attestation. Manual `quarantined -> clean` требует предшествующий
  download того же SHA-256 и versioned local-AV attestation. Только `clean`
  может отдельно перейти в business `approved`; replacement/hash mismatch,
  missing scanner label/attestation и direct approve fail closed. Clean, но
  business-invalid/unreadable document переходит в `rejected` с reason и
  request-reupload. (`REQ-05`, `REQ-06`)
- Не получивший `approved` quarantine object становится допустимым к удалению
  при `now >= uploaded_at + 14×24h` UTC и удаляется первым успешно завершившимся
  cleanup после этого порога, но никогда раньше; download/scan/attestation TTL
  не продлевают. Duplicate/retried cleanup идемпотентен, approved archive не
  затрагивается, expired body нельзя восстановить через прежнюю ссылку.
  (`REQ-08`)
- `group_nachhilfe` отсутствует в публичном каталоге, quote и trial flow. Его
  создание через parent API отклоняется; admin обязан задать manual capacity,
  price и условия Jobcenter/Sozialamt. (`REQ-09`)
- В Access-protected preview parent загружает synthetic PDF, JPEG и PNG в
  реальные private-EU quarantine objects. Admin получает каждый только как
  audited forced attachment, локально проверяет актуальным approved AV,
  подтверждает показанный SHA-256/versioned attestation и отдельно принимает
  business `approved|rejected` решение. Parent видит только approved artifact;
  hash mismatch, direct approve и повтор чужой роли отклоняются. Отдельный
  неутверждённый synthetic object проходит idempotent cleanup по каноническому
  TTL без удаления approved archive. (`REQ-05`, `REQ-07`, `REQ-08`, `REQ-11`)
- Для одного synthetic D0 по owner decision 2026-09-05 отсутствие шифрования
  выбранной локальной папки не блокирует эксперимент и не вызывает включение
  шифрования. Остальные проверки предыдущего критерия сохраняются; исключение
  не закрывает workstation gate для реальных документов. Scope задан в
  [storage contract](../operations/STORAGE_AND_UPLOAD_SECURITY.md#обязательный-preview-rehearsal).

## 8. Договоры и price review

- Созданный offer round-trip сохраняет immutable snapshot provider/сторон,
  одной услуги, расписания, billing line items, price source/mode, срока/renewal/
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
- **AC-CONTRACT-02.** Source manifest каждой из четырёх versions меняется при
  изменении base body, kind clause, fixed copy, helper/schema/adapter, CSS/font/
  asset либо связанного snapshot hash. Он строится из полного canonical bundle,
  а не только `Function.toString()` delegating wrapper; hash фактически
  полученного self-contained HTML сохраняется отдельно. Exact bundle содержит
  renderer engine version; v1 и v2 имеют разные immutable dispatch paths и
  собственные output-affecting helpers. Committed v1 golden HTML/hash остаётся
  byte-for-byte тем же после реальной регистрации/render v2 и изменения v2
  helper, а unknown/missing engine завершается fail-closed без fallback.
  (`CONTRACT-03`, `CONTRACT-13`, `CONTRACT-22`)
- **AC-CONTRACT-03.** Два concurrent install одной version с одинаковыми bytes
  создают один неизменяемый R2 object, одну exact D1 installation и один success
  audit; replay возвращает тот же результат. При разных bytes для одного key
  atomic create-if-absent не позволяет второму writer перезаписать object, а D1
  не оставляет partial provider/media/template rows либо ложный installed audit.
  Crash/ambiguous windows `intent → R2 → D1 link` восстанавливаются штатным
  reconciler. Aged staged intent во время/после cleanup получает новую immutable
  generation/key; stale cleaner не удаляет новый object, expired processing не
  блокирует retry, а повторный retry остаётся идемпотентным. Финальные D1/R2 и
  append-only generation audit согласованы. (`REL-01`, `CONTRACT-23`)
- **AC-CONTRACT-04.** Seeded `preview_review` row в production либо выключенный
  preview flag отклоняются до `prepareNumber`, draft/operational record,
  idempotency/audit и любого другого D1/R2 side effect; direct service/API и UI
  дают одинаковый fail-closed результат. (`CONTRACT-11`, `CONTRACT-21`,
  `CONTRACT-23`)
- **AC-CONTRACT-05.** Permanent populated migration test применяет `0024` к
  схеме `0001`–`0023` с прежними approved provider/template rows и зависимыми
  offers/artifacts. После upgrade все исходные значения, FK и triggers
  сохранены, разрешённые preview scope/basis работают, а forbidden pairings
  отклоняются. Fresh empty migration sequence этот regression не заменяет.
  (`CONTRACT-21`, `CONTRACT-23`)
- **AC-CONTRACT-06.** Normal template/artifact load, winning/losing installer
  verification, recovery, owner/admin download и email attachment отклоняют
  oversized object по metadata до body read. Exact maximum читается только
  bounded `maximum + 1` range, связанный ETag conditional request с проверенным
  metadata; max+1, truncated, changed-between-requests и hash-invalid object
  fail closed без unbounded/full-body `arrayBuffer()`. (`CONTRACT-23`, `SEC-01`)
- **AC-CONTRACT-07.** Permanent populated migration test применяет append-only
  `0025` к схеме `0001`–`0024`, сохраняет прежние intent fields/status/object
  keys, backfill-ит generation 1, создаёт immutable generation history и
  запрещает missing/mutable lineage; FK остаются целыми. (`CONTRACT-23`, `REL-01`)
- Browser Run получает только self-contained inline HTML; successful attempt
  сохраняет PDF/hash/browser-ms в private R2 до `sent`. 429/5xx ограничены тремя
  retry, budget/size excess и final failure оставляют offer в `draft`.
  (`CONTRACT-11`)
- Acceptance доступен только владельцу ребенка и только для актуального
  `sent` offer; `draft`, `expired`, `cancelled` и измененный hash отклоняются.
  Current admin не может выполнить это parent-side действие, даже если тот же
  user раньше был parent/owner. (`AUTH-08`, `CONTRACT-05`, `CONTRACT-07`)
- Двойной клик/повтор запроса создает один acceptance log. (`CONTRACT-07`)
- Acceptance log после успешного действия содержит timestamp, user, offer
  hash, acceptance-text version, user agent и IP в рамках retention policy;
  попытка изменить или удалить evidence через обычный application path
  отклоняется. (`CONTRACT-06`)
- Admin approval/activation без parent acceptance невозможна; две одновременные
  операции не создают два contract/enrollment/service engagement. Request
  activation не меняет group occupancy. Admin actor, совпадающий с parent
  actor/owner, отклоняется атомарно, включая сценарий parent acceptance → role
  promotion → formation тем же user. (`AUTH-08`, `CONTRACT-08`, `CONTRACT-09`)
- Первая offer series атомарно создаёт/связывает один draft operational record;
  superseding version переиспользует его. Cancel/decline/expiry последнего open
  offer не оставляет orphan draft, блокирующий новый offer.
  (`CONTRACT-01`, `CONTRACT-09`)
- Parent acceptance не создаёт contract. Последующий admin approval той же
  version/hash одной transaction создаёт contract с обеими сторонами evidence и
  formation timestamp и immutable source formation certificate. Исходный offer
  PDF не мутирует; отдельный certificate содержит номера, роли, оба timestamps
  и offer/source hashes, но не собственный PDF hash или рисунки/изображения
  подписей. Его PDF hash хранится отдельно. Retry использует тот же source
  hash, ready certificate не перерендеривается и объединённый signed-copy PDF не
  создаётся. (`CONTRACT-08`, `CONTRACT-16`)
- Accept/decline, admin formation/activation и scheduled/manual price apply
  непосредственно перед записью проверяют `users.account_status=active`.
  Закрытый account отклоняется одинаково для UI, прямого API и queued/retried
  operation; сохранённое immutable evidence не активируется. (`CONTRACT-05`,
  `CONTRACT-08`, `PRIV-03`)
- Contract child/service/funding и operational relation точно совпадают с
  approved offer и повторно выполняют XOR. Nachhilfe требует действующее
  approved Jobcenter/Sozialamt funding с inclusive dates/document, но не payer
  snapshot/reference/hours; individual запрещает funding authorization.
  (`CONTRACT-01`, `CONTRACT-14`)
- Изменившаяся после offer цена или вместимость требует явного admin review и,
  если условие договора изменилось, новой версии offer. (`CONTRACT-03`,
  `CONTRACT-08`)
- Accepted offer, который невозможно активировать, можно отменить с причиной
  или supersede новой version; прежнее acceptance не переносится.
  (`CONTRACT-12`)
- Contract acceptance не заменяет privacy acknowledgement или media decision и
  не создаёт SEPA/medical consent. Media grant/decline выполняется отдельным
  действием по capture `photo|video` и channel
  `website|social_media|print`; публикация требует оба grant, refusal не
  блокирует contract. Versioned media clause присутствует в применимом PDF;
  decision snapshot допустим там только при отдельном pre-render event. После
  send decision/revoke не мутируют artifact. Self-service revoke в cabinet/API
  отсутствует. Withdrawal через office/email/phone создаёт append-only event с
  фактическим `received_at`; admin не может approve/decline его или сдвинуть
  effective date. Перед записью связь с owning parent проверяется без раскрытия
  child data; evidence не хранит полный email body или запись звонка. Повтор с
  тем же evidence/dedupe key не создаёт второй event.
  UI/PDF показывают утверждённый немецкий текст и contacts из versioned
  configuration со ссылками на официальные Impressum/Kontakt, а не hardcoded
  реквизиты.
  Портал не индексирует historical media и не обещает automated takedown;
  withdrawal блокирует только новые capture/upload/post/repost/reprint по
  отозванным scopes после receipt. Конкретно названный старый URL обрабатывается
  отдельным manual privacy request. (`CONTRACT-15`)
- Production capture нового media grant остаётся технически выключенным, пока
  документированная compliance assessment не подтвердит, что утверждённый
  office/email/phone withdrawal path для конкретного capture flow доступен столь
  же легко, как выдача согласия, либо пока не реализован иной compliant path.
  Простая запись `risk accepted` не переводит этот legal gate в `passed`; decline
  и contract flow при этом продолжают работать независимо. (`CONTRACT-15`)
- Production offer нельзя отправить до закрытия всех применимых строк blocker
  matrix из `domain/CONTRACTS.md`. Технический status `accepted_by_parent` сам
  не объявляет момент заключения договора.
  (`CONTRACT-11`, `CONTRACT-16`)
- Отправка offer HTML/PDF и formation certificate создаёт отдельные deduped
  delivery evidence. Admin approval/activation формирует один contract; будущий
  `effective_from` не меняет `formed_at` и не попадает в occupancy раньше даты.
  Terminate/expire/void — append-only events без мутации принятого offer.
  (`CONTRACT-17`)
- Parent/admin history показывает formation, effective dates, Kündigung,
  termination/expiry/void и superseding contract после закрытия operational
  record. (`CONTRACT-18`)
- Applicable Widerruf и Kündigung сохраняют immutable receipt и немедленное
  confirmation независимо от debt check. Admin может подтвердить/оспорить
  effective date; `approved|declined` допустимы только для
  `mutual_termination_request`. Group-monthly receipt в месяце M рассчитывает
  end на последний день M; group-yearly receipt до contractual end блокирует
  renewal, не сокращая term. Debt даты не меняет. Online send fail-closed без
  approved `distance_legal_profile`; `widerruf_applicable` включает постоянно
  доступную в срок public § 356a function, required identity/contract/contact
  fields, immediate durable confirmation и отдельный early-performance request.
  `widerruf_not_applicable_312g_2_9` требует approval evidence и утверждённого
  notice, `offline_only` запрещает online send.
  (`CONTRACT-19`)
- Individual/Nachhilfe не создают trial или recurring fee: после полученного
  notice «больше не посещаем» engagement становится `ended`, будущие
  неоказанные units не возникают, а parent получает durable receipt. Contract
  termination остаётся отдельным optional action. Уже
  согласованный lesson может остаться к внешнему ручному выставлению только если
  teacher фактически пришёл/начал ждать до фактического `received_at` notice;
  receipt до прихода исключает требование. Delayed admin recording не сдвигает
  `received_at`. Evidence содержит согласованные дату/место, teacher arrival/
  waiting, notice receipt и recorded time; портал не создаёт invoice/charge.
  (`CONTRACT-19`)
- Public-function submission для применимого legal profile не требует owner
  session, не
  раскрывает существование contract/account, дедуплицируется и создаёт durable
  receipt confirmation. § 356a принимает name, contract/part identifier и
  electronic confirmation channel; § 312k использует обязательные поля своей
  confirmation page. (`CONTRACT-19`, `AUTH-07`)
- Legacy family отображается как `1. 3477`, online-only family — `2. 0001`, а
  contracts — `1. 3477-1`/`2. 0001-1`. Unverified account номера не имеет;
  успешная verification атомарно назначает exact eligible namespace `1` либо
  новый namespace `2`, и child всегда копирует current family. Concurrent
  pre-render reservation не дублирует number; decline/expiry оставляют gap и
  номер не переиспользуется. Поздний approved claim/admin correction меняет
  current account/children FamilyID и только будущую contract sequence; прежние
  numbers/PDF/certificates остаются byte/hash-identical historical evidence,
  старый FamilyID — только alias. Nonterminal offer со старым family snapshot
  superseded и не принимается; collision/stale version fail-closed.
  (`CONTRACT-20`)
- Оба group template используют `monthly_group_fee`; individual —
  `delivered_units`, Nachhilfe — `third_party_funded`, обе hourly unit rates
  3000 cents/45 минут. Existing external SEPA/manual payment — только hashed
  immutable informational terms; due-day manual path равен 7, а funded
  Nachhilfe использует `not_applicable` без due day; external SEPA также не
  получает portal due day. Group amount помечен как base price; holiday/
  payable adjustment не рассчитывается. (`CAB-04`, `PRICE-02`)
- Каждая permutation contract kind/template/service relation/billing model
  вне закрытой матрицы отклоняется при draft validation, send и activation.
  Nachhilfe дополнительно требует structured inclusive
  `effective_from|effective_to` внутри authorization dates и approved current
  documents. (`CONTRACT-01`, `CONTRACT-09`, `CONTRACT-14`, `REQ-10`)
- Inclusive contract `effective_to` проецируется в exclusive operational
  `active_until=calendar_day_after(effective_to)` для enrollment и engagement;
  month/year/leap-day boundaries не теряют последний разрешённый день.
  (`TIME-01`, `REQ-10`)
- Parent получает только свои current/archived contract artifacts; admin read/
  download требует RBAC, цели и audit event. Guess/cross-owner artifact ID
  отклоняется без раскрытия существования объекта. (`AUTH-08`, `SEC-01`)
- Любое transactional изменение group enrollment/occupancy создаёт не более
  одного review batch на одно состояние группы; service engagement не меняет
  occupancy и не запускает group repricing. Future activation/end заранее
  создаёт batch на boundary date; duplicate scheduler/reconciler delivery не
  создаёт второй. Pause/resume command/model в MVP отсутствует. (`CONTRACT-10`)
- Sent price review item immutable; acceptance фиксирует item version/hash и
  ещё не применяет цену без второго admin confirmation.
  Измененное условие создает superseding item и требует нового согласия.
- При временной остановке Cron в разрешённой конфигурации supervised contract
  preview из `OPERATIONS_RUNBOOK.md`, раздел 7, обычные login/admin routes не
  возвращают 500 из-за остановки. Scheduled jobs не выполняются, health остаётся
  503, manual batch равен 1. Production, отсутствующий explicit stop, другой
  batch и preview без contract scope по-прежнему отклоняются; provider/recipient
  guards сохраняются. (`SYS-04`, `CONTRACT-21`)
- Для каждого `group_yearly|group_monthly|individual_hourly|nachhilfe_hourly`
  real Browser Run создаёт из `preview_review` bundle читаемый PDF с корректной
  Unicode/pagination/signature layout и заметным на каждой странице
  `TEST/ENTWURF — nicht für reale Vertragsbeziehungen`. Artifact и source
  manifests/hash находятся в private preview R2, а email уходит только
  согласованному test recipient с тем же предупреждением. Synthetic adapter или
  локально подложенный PDF не удовлетворяет этому checkpoint. (`CONTRACT-21`)
- Минимум один preview-review offer проходит через обычные application paths:
  admin render/send, owning parent accept, formation/activation другим admin
  principal, immutable formation certificate и owner/admin download с RBAC/
  audit. Повтор render/send/accept/formation не дублирует artifacts, delivery,
  contract или enrollment/engagement. (`AUTH-08`, `CONTRACT-07`,
  `CONTRACT-08`, `CONTRACT-16`, `CONTRACT-21`)
- `preview_review` template принимается только при `APP_ENV=preview`, explicit
  feature flag, synthetic party marker и watermark. Он отклоняется в production
  и не удовлетворяет production template/legal gate. Замечания по реально
  полученному PDF выпускают новую immutable bundle version/change log, сохраняя
  старый artifact. (`CONTRACT-03`, `CONTRACT-11`, `CONTRACT-21`)

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
- Валидный Telegram `ok=false` классифицирует retryable/permanent error; `429`
  учитывает max(backoff, `retry_after`) и атомарно блокирует весь тот же
  destination до deadline, сохраняя computed backoff как cooldown также при
  missing/invalid `retry_after`; explicit `408|425|5xx` только в синтаксически
  валидном `ok=false` являются conclusive retryable, а не ambiguous;
  `migrate_to_chat_id` fail closed как config drift, а network/timeout/
  unreadable/oversized/malformed response, non-`ok=true` ambiguous envelope,
  invalid/mismatched success, destination mismatch или потерянный post-send D1
  commit дают `delivery_unknown` без blind retry. Первый unknown/retry/dead
  останавливает текущий drain, а unresolved unknown или terminal dead блокирует
  последующие sends и остаётся persistent alert также при disabled provider.
  Stale lease после
  durable dispatch marker не reclaimed для отправки; audited `confirm_sent`,
  `retry_after_review` или `cancel` привязаны к exact attempt и требуют operator
  reason/evidence, а `sent` cron повторно не шлет. (`MSG-06`, `REL-02`)
- Resend mode загружается только с отдельным secret и exact identity
  `Kinder- und Elternzentrum Kolibri e.V. <registration@kolibri-dresden.de>` /
  `registration@kolibri-dresden.de`; adapter передаёт псевдонимизированный
  стабильный idempotency key, классифицирует retryable/permanent failures и не
  раскрывает API key, recipient, body или provider diagnostic. Fake provider в
  production отклоняется, а disabled mode не имеет внешнего fallback.
  (`MSG-03`, `SEC-02`, `REL-02`)
- `TELEGRAM_PROVIDER=bot_api` требует раздельные preview/production bot secrets,
  exact numeric private bureau destination и reviewed canonical UTC activation
  cutoff; строки до cutoff не отправляются автоматически, а configured max
  attempts применяется при claim. Режим запрещает inbound path/fake production
  fallback и отправляет только plain `sendMessage` с disabled link preview и
  `protect_content`. Final renderer принимает exact keys, allowlisted category,
  opaque UUID reference, canonical UTC time и предопределённый query-free admin
  path. Telegram payload не содержит funding-файл, полный адрес/email/телефон,
  token, document, sensitive free text или provider diagnostic.
  (`MSG-04`, `MSG-05`, `SEC-02`)
- Отдельно разрешённый preview smoke сначала pin-ит exact target/candidate,
  выполняет read-only bot/chat/rights/no-webhook preflight и создаёт ровно один
  PII-free normal-outbox cohort с `max_attempts=1`. Ровно один реальный
  `sendMessage` attempt через normal worker даёт фактический `sent` с одним
  provider reference либо `delivery_unknown` без retry; local fake success или
  ambiguity не являются внешним evidence и не доказывают оба исхода.
  (`MSG-05`, `MSG-06`, `REL-02`)
- Для Access-protected synthetic preview одного владельца не требуется второй
  человек: подтверждение владельцем dedicated bot/private destination и scope
  связывается с фактической read-only технической сверкой deployment/target по
  разделу 3.1 [runbook](../operations/OPERATIONS_RUNBOOK.md). Observer и owner
  reviewer имеют разные правдивые идентификаторы; автоматическая проверка не
  выдаётся за независимую человеческую. Ни разрешение на send, ни реальные
  provider postconditions этим не заменяются. (`SYS-04`, `MSG-07`)
- Если provider dispatch не начинался, D1-only smoke abort без Telegram secret/
  preflight/provider call атомарно отменяет только exact prepared `pending` или
  partial `processing` cohort с нулём delivery attempts, записывает append-only
  authorization/assertion и исключает smoke signature из Cron reclaim. После
  любого dispatch attempt или terminal state abort fail-closed; неоднозначный
  D1 результат сначала сверяется read-only verify. (`MSG-06`, `REL-02`)
- Если smoke process оборвался после durable `dispatch_started`, exact target/
  cohort reconcile до lease expiry fail-closed. После expiry команда без
  Telegram secrets/preflight/provider send/retry проверяет claim/attempt proof,
  идемпотентно переводит attempt и outbox в `delivery_unknown`, возвращает
  `attemptCount=1`, no provider ID и `requiresManualResolution=true`; повторный
  `run`/abort запрещён, дальше применима только обычная exact-attempt operator
  resolution. (`MSG-06`, `REL-02`)
- `full-manual-preview` не закрывается локальным Telegram fake или deployed
  `TELEGRAM_PROVIDER=disabled`: dedicated preview bot/destination должен пройти
  описанный read-only preflight и ровно один реальный minimized normal-outbox
  attempt, затем verify и применимые no-send/ambiguous reconciliation drills.
  Production token/destination и реальные PII не используются. (`MSG-07`)

## 10. UX и эксплуатация

Перед UX-критериями обязательна административная/privacy приемка:

- Parent/unauthenticated не открывает admin page и не вызывает прямой admin API.
- Admin видит import runs/issues, review tasks, legacy search, users/children,
  catalog/price, trials, requests/documents, contracts/enrollments, price
  reviews, messages и outbox; typed resolution меняет только разрешённую
  сущность. (`ADMIN-01`)
- В admin navigation сохранены все прежние ссылки, сгруппированные в «Семьи и
  обращения», «Занятия и договоры», «Данные и система»; текущий раздел отмечен
  также на detail route. На телефоне доступны раскрытие и переходы с клавиатуры,
  обзор показывает повседневные действия до технических форм. (`ADMIN-01`, PVUI-06)
- Счётчик «Заблокированные учётные записи» не является ссылкой. Рядом отдельная
  ссылка «Все учётные записи» открывает `/admin/users` без query-фильтра;
  существующие поиск и фильтры сохраняются, нового blocked-only фильтра нет.
  (`ADMIN-01`, PVUI-06; решение владельца 2026-09-15)
- Каталог отделяет занятия от свёрнутых по умолчанию сопоставлений и показывает
  число фактически загруженных записей. DOM содержит каждую запись с собственным
  target и формой, включая одинаковые и длинные названия; любую запись можно
  открыть. Раскрытие не отправляет форму, подтверждения и idempotency сохранены.
  (`CAT-02`, `ADMIN-02–03`, PVUI-06)
- После успешного изменения занятия, удаляющего его из текущего фильтра,
  соседняя форма сохраняет только собственный черновик и подтверждение.
  Успешная отправка формы занятия/сопоставления сбрасывает её поля и checkbox;
  rejected action оставляет ввод и retry key той же записи для исправления.
  (`ADMIN-03`, PVUI-06, review R1)
- На 390×844 документ admin catalog/users/contracts/pricing не шире viewport;
  таблицы прокручиваются локально с клавиатуры, select/textarea и кнопки находятся
  в контейнере. На 1366×768 JSON договора занимает широкую строку, имеет
  моноширинный шрифт и удобную высоту. Ошибка отправки доступна у редактора через
  `aria-describedby`; enhanced JSON rejection сохраняет введённые значения и
  retry key. Существующие payload и механизм создания сохранены. (`UI-01`, PVUI-05/06)
- DE/RU admin contracts отдельно обозначает готовый PDF, ожидание принятия
  родителем, принятие до admin confirmation и фактический operational status
  договора; статус formation certificate не заменяет статус договора.
  Пустые offers/end requests/price versions/active rules объяснены текстом.
  Timestamps локализованы в Berlin, calendar dates сохраняют день.
  (`ADMIN-01`, `UI-01`, `TIME-01`, PVUI-07)
- Каждый name-match виден admin как typed review. Family correction UI сначала
  показывает source/destination, всех affected children, ownership/collision и
  offer/contract consequences, затем требует reason, explicit confirmation и
  idempotency key. Apply атомарно меняет account и всех children, supersede-ит
  только nonterminal old-family offers и сохраняет immutable history. Free-form
  непроверенный FamilyID, partial child update, тихий merge и destination
  другого active account отклоняются. (`ADMIN-01`, `ADMIN-03`, `CLAIM-08`)
- Изменение роли, family link, classification, price, capacity, status,
  contract, document или outbox создаёт audit record с actor, action, target,
  timestamp и безопасным diff без secret или file content. (`ADMIN-02`)
- Повтор опасной admin-команды с тем же idempotency key не дублирует эффект, а
  её первый запуск требует явного подтверждения. Административные списки имеют
  поиск/фильтры и не выгружают PII вне полей, необходимых выбранной операции.
  (`ADMIN-03`)
- Block user отзывает session; повтор block/unblock идемпотентен.
- Public/admin forms и API не сохраняют поля вне утверждённой схемы, показывают
  актуальную versioned/hash-fixed privacy notice там, где требуется сбор данных,
  а export/delete создают audit event. Active contract блокирует closure;
  retention hold блокирует purge соответствующего archive record, но не обязан
  сохранять рабочий login после approved closure. (`PRIV-01`)
- Export одного subject user не содержит данные другого пользователя и доступен
  только через private expiring artifact. (`PRIV-02`)
- Delete dry-run перечисляет active contracts, holds и связанные D1/R2 records.
  Без active contracts approved process отзывает sessions и удаляет/
  обезличивает неудерживаемый profile, а held contract evidence переносит в
  закрытый archive. Request завершается `completed_with_retained_evidence`, а
  каждый retained archive record имеет
  `retention_controls.purge_status=disabled_by_policy`; `retain_until` не
  планирует job;
  результат ясно перечисляет retained categories/dates. Active contract даёт
  `blocked_by_active_contract` без частичного closure. Closure lock отменяет
  nonterminal offers/items/requests, сохраняет acceptance evidence и запрещает
  последующие accept/admin formation/activation/price apply. Concurrent closure
  и formation дают ровно один результат: active contract либо closed account,
  но не оба. Successful closure атомарно создаёт по всем active media grants
  append-only revoke с `source=account_deletion` и effective timestamp удаления;
  повтор closure не дублирует события. Claimed current legacy service с любым
  status, кроме явного `KN`, блокирует closure независимо от occupancy mapping.
  Concurrent email claim и closure не оставляют одновременно `closed` account и
  `processing` outbox row: claim-first откладывает closure, closure-first
  отменяет/не claim-ит неотправленное письмо. Неудерживаемые request/support/
  absence тексты, preferences и draft offer snapshots заменены безопасными
  closure markers; retained legal evidence не переписывается. Обычные admin
  списки исключают закрытого subject и legal archive, а purpose-bound download
  на каждом replay повторно проверяет active actor/subject и создаёт audit.
  (`PRIV-03`, `CONTRACT-15`, `REL-01`)
- Каждый R2 `put` application artifact предварён D1 storage intent. Успешная
  domain transaction атомарно связывает intent и создаёт assertion; ambiguous D1
  result не разрешает eager delete. Reconciler сохраняет referenced object, а
  orphan cleanup после 15-минутного grace удаляет только всё ещё unreferenced
  object с действующим lease. (`REL-01`, `SEC-01`)
- Scheduled/manual jobs имеют allowlist, exact Cron mapping, unique dedupe и
  lease/fencing. Automatic Cron обновляет ровно две fixed-cardinality cadence
  rows и не добавляет per-job rows в retained ledger; job, способный выполнить
  работу, сохраняет отдельный lease для изоляции с manual run. Заведомо inert
  disabled job lease не создаёт. Ошибка setup/execution одного job сохраняется в
  PII-free bounded cadence result, делает cadence failed и не прерывает остальные
  jobs. Manual route сохраняет PII-free per-job ledger и требует admin, CSRF,
  audit до side effect, typed job, confirmation и idempotency. Global scheduled
  stop выполняется до первого D1 query: Cron имеет 0 reads/0 writes, health —
  fail-closed `503`. (`REL-01`, `ADMIN-02`, `OPS-01`)
- `GET|HEAD /_health/operations` возвращает только empty `204` либо fail-closed
  empty `503`, `no-store` и `noindex`; D1 failure, отсутствие любого job либо
  превышение порога не раскрывает job name/error code в ответе. Freshness
  thresholds равны 180 секунд для `* * * * *`, 1200 секунд для
  `*/15 * * * *`, stale-running — 360 секунд, repeated error — 3 за 900 секунд.
  `feature_disabled` является допустимым свежим terminal delivery, но не
  означает готовность выключенной функции. Application 5xx учитываются в
  PII-free minute buckets с bounded 7-day cleanup. Production gate требует
  отдельного внешнего poller, проверенной доставки alert и owner; сам Worker не
  может доказать отсутствие собственного Cron. (`OBS-02`, `OPS-01`, `SEC-02`)
- Накопление завершённых scheduled runs не влияет на стоимость health/Cron и не
  превращает operator view в полный обход истории. Локальный regression с
  20,000 старыми runs проверяет фактические `meta.rows_read`/`rows_written`: health
  читает не более 10 rows, two-cadence operator snapshot — не более 5, routine
  manual history — не более 5 при одной manual row. Empty production-shaped
  background имеет budgets: fast ≤40 reads/≤10 writes, maintenance ≤80/≤20,
  scheduled day ≤100,000/≤15,000; с 5-minute health и максимально насыщаемыми
  minute error buckets общий daily budget ≤100,000 reads/≤20,000 writes. Queue,
  retry, unknown-result и concurrent duplicate scenarios сохраняют fencing,
  idempotency, delivery certainty и fail-closed semantics. (`OBS-02`, `OPS-01`)
- First-admin capability не имеет HTTP route и потребляется ровно один раз:
  verified active parent без retained parent workflow/business state повышается
  только при нуле active admin, sessions отзываются, audit/assertion
  сохраняются, replay/race отклоняется. Наличие child/claim/correction/trial/
  request/enrollment/contract/price-review/message/privacy state отклоняет весь
  batch без consume control или partial role/session/audit mutation. Upgrade с
  существующим active admin запечатывает capability в migration. (`AUTH-09`,
  `ADMIN-02`, `OPS-01`)
- Acceptance IP хранится только как scoped pseudonymous hash. Текущая
  реализация использует временный технический upper bound 30×24h и после expiry
  однонаправленно очищает значение, сохраняя timestamp/evidence. Это не legal
  approval срока: production privacy/retention gate остаётся `blocked` до
  письменного owner/legal input либо изменения реализации. (`PRIV-01`, `SEC-02`)

- Основные формы работают на мобильном экране и только с клавиатуры; focus и
  ошибки связаны с соответствующими полями. (`UI-01`)
- На главной и в каталоге шапка соответствует текущему серверному входу:
  guest — вход/регистрация; parent — кабинет, сообщения, настройки; admin —
  администрирование, настройки. Роль показана текстом; logout выполняет
  существующий POST с CSRF, после него видна гостевая шапка. Восстановление и
  повторное подтверждение доступны из auth-форм. Главная объясняет назначение
  портала и ведёт к действующим функциям. (`UI-01`, `AUTH-05`–`AUTH-06`; PVUI-02)
- Два входа в разных вкладках одного context используют текущую общую cookie:
  после parent → admin обновление кабинета/открытие trial даёт 403; обычный
  клиентский переход обновляет роль в шапке. В изолированных contexts parent
  открывает кабинет/trial с 200, admin открывает админку с 200 и получает 403
  на parent routes. Это не доказательство причины конкретного исторического
  входа. (`AUTH-08`–`AUTH-09`, `UI-01`; PVUI-01)
- Прямой GET и Svelte client navigation показывают на DE/RU: 401 — просьбу
  войти и ссылку входа; 403 — отказ текущей роли и переход в доступный раздел,
  для admin на parent route — пояснение о входе родителя. Пароль не объявляется
  неверным при отказе доступа. Сохраняются HTTP status, request ID, no-store,
  security headers и RBAC; public layout с ролью не кэшируется совместно и
  не раскрывает session identifiers, session token или csrfHash.
  (`AUTH-05`–`AUTH-09`, `UI-01`, `OBS-01`; PVUI-01/02/07)
- На 390×844 и 1366×768 главная, каталог, auth/error и parent/admin consumers
  общей оболочки имеют доступные основные действия, перенос текста и видимый
  focus. Поля помещаются в контейнере, даты/числа не растягиваются на всю
  desktop-строку; таблицы прокручиваются локально. Горизонтальное переполнение
  не скрывается на уровне страницы. (`UI-01`; общая часть PVUI-05)
- Все обязательные пользовательские и email-тексты существуют на немецком;
  отсутствие необязательного перевода не ломает страницу.
- Переключатель `Deutsch / Русский` действует во всех public/auth/parent/admin
  разделах, включая административную сверку, эксплуатацию, статусы и ошибки
  серверных form actions. Русский UI полностью покрыт словарями с теми же
  параметрами подстановки. После переключения, навигации, входа и reload язык
  сохраняется; другая browser session с собственной cookie не получает чужую
  настройку. Начальный SSR и `html lang` соответствуют языку. (`UI-01`)
- Переключение работает обычной формой без JavaScript; при включённом JavaScript
  не очищает введённые регистрационные поля. Нельзя уйти на внешний origin через
  return path; неподдерживаемый язык и недопустимый Origin не меняют cookie.
  Существующие RBAC/ownership/CSRF gates сохраняются. (`UI-01`, `SEC-01`)
- Русская настройка UI не меняет немецкие email/Telegram, contract artifacts,
  acceptance text/version и их hashes. Исходные формулировки согласия доступны
  на немецком, русский перевод показан рядом; бизнес-поля/коды form payload
  сохраняют прежние значения. (`UI-01`, `CONTRACT-06`)
- Persisted timestamp сохраняется в UTC; contract/trial/price-effective local
  dates интерпретируются в `Europe/Berlin`. Boundary tests покрывают оба DST
  перехода, включая несуществующее и двусмысленное local time. (`TIME-01`)
- Время в списке обращений и внутри переписки показывается на DE/RU в
  `Europe/Berlin`; категория, отправитель и статус локализованы, исходные тема
  и текст сохранены. На настройках учётной записи labels и видимый keyboard
  focus работают на обоих языках. Промежуточные размеры 768×1024/1536×864
  сохраняют доступность public/parent/admin страниц без переполнения документа
  и повторного входа при resize. (`UI-01`, `TIME-01`; PVUI-05/07)
- Production secrets отсутствуют в `wrangler.toml`, логах, client bundle и
  import report. (`SEC-02`)
- Ошибка имеет correlation ID; админ может найти import/outbox/audit запись, а
  родитель не получает внутренний stack trace. (`OBS-01`)
- Перед production существуют tracked и сверенные с реализацией
  `PRODUCTION_DEPLOYMENT.md`, `OPERATIONS_RUNBOOK.md`,
  `DISASTER_RECOVERY.md` и `PRODUCTION_READINESS_CHECKLIST.md`. Они написаны
  пошагово на русском для оператора без опыта разработки, содержат prerequisites,
  точные команды/поля без значений secrets, ожидаемый результат, stop conditions
  и безопасный rollback. (`OPS-01`)
- Незнакомый с проектом оператор выполняет cold-read/rehearsal в
  non-production: clean provisioning/migrations, bootstrap admin, preview smoke,
  production-shaped bindings, Browser/provider sandbox, cron inventory и
  D1/R2 backup/restore/rollback. Evidence, дата и обнаруженные gaps записаны в
  readiness checklist. Отсутствие разрешённого preview/remote доступа оставляет
  соответствующий gate `blocked`, а не превращает проверку в optional.
  (`OPS-01`, `REL-02`)
- Remote first-admin bootstrap до любой mutation сверяет `APP_ENV` и exact
  deployed D1 UUID из `database_id` указанного dedicated-environment config,
  требует тот же UUID в confirmation и отклоняет `preview_database_id` как
  неоднозначный `wrangler dev --remote` overlay. Shared ID, placeholder,
  selector collision и target mismatch также fail-closed до network; preview
  intent не может молча выбрать production binding. (`OPS-01`, `REL-01`)

# Как владельцу запустить полностью рабочий preview

Эта инструкция — короткий маршрут до тестовой системы, которую можно проверить
руками. Подробные технические команды остаются в
[FULL_MANUAL_PREVIEW.md](FULL_MANUAL_PREVIEW.md) и
[PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md); здесь только ваши действия
и понятные контрольные точки.

## Что получится

- отдельный preview URL за Cloudflare Access;
- только синтетические данные и два контролируемых test account;
- реальные email, Browser PDF, private R2, upload/manual AV и Telegram paths;
- parent и admin flows, которые можно пройти глазами на desktop и телефоне;
- production, официальный сайт и реальные клиентские данные не затрагиваются.

Текущий код уже имеет independent GO. Следующий шаг — recovery, migrations
`0024`/`0025` и deploy этого exact reviewed candidate в preview; новый общий
review до этого не нужен.

## Что подготовить заранее

1. Оставьте открытым доступ к Cloudflare account и Zero Trust. Сам preview уже
   существует и закрыт Access.
2. Имейте доступ к двум ранее согласованным почтовым ящикам:
   корпоративному для первого admin и второму для test parent. Адреса уже были
   переданы в локальном operator context; не записывайте их в Git и не присылайте
   повторно, если новая сессия видит ту же рабочую копию.
3. Имейте доступ к Resend account. API key вводится только в интерактивный secret
   prompt, не в чат и не в командную строку.
4. Для Telegram подготовьте отдельного preview bot и private channel:
   добавьте bot как administrator и разрешите **Post Messages**.
5. Подготовьте установленный антивирус с видимым названием и актуальной версией
   базы. Он понадобится для одного скачанного синтетического файла.

### Важно про Telegram

Ссылка-приглашение в private channel полезна человеку, но её недостаточно для
Bot API. Нужны ещё:

- token отдельного preview bot;
- точный signed-decimal `TELEGRAM_CHAT_ID`;
- тип `channel`;
- подтверждение, что bot является member/admin и может публиковать сообщения.

Invite link, bot token и exact chat ID не помещайте в tracked docs или чат.
Token вводится интерактивно. Если numeric ID пока неизвестен, скажите агенту
только об этом: он должен подготовить безопасный discovery/preflight шаг без
печати token или chat ID. Первая прикладная отправка всё равно потребует вашего
отдельного подтверждения.

## Как начать новую сессию

Для обычного выполнения готового runbook выберите reasoning **High**. Это
разумный default для планового deploy, где target, проверка результата и rollback
заранее известны. Понижать всю deploy-сессию до `Medium` ради простых команд не
стоит: выигрыш даёт короткая фазировка и запрет нерелевантных повторных тестов.
`Medium` подходит отдельной следующей сессии, если в ней будут только read-only
сверка, документация/evidence или ручной осмотр и точно не будет remote write.

`Max` нужен не «на всякий случай», а только после факта с действительно высоким
риском: могла быть изменена не та среда или production; результат важной записи
неоднозначен; recovery/rollback отсутствует или не сработал; есть признаки
повреждения данных/schema, обхода Access/authorization, утечки secret либо
несовместимости уже развёрнутого кода и базы. Тогда агент обязан простыми словами
назвать: что именно может пострадать, какой факт это показывает, почему обычного
`High` недостаточно и какое безопасное решение должна принять следующая сессия.
Обычная ошибка провайдера, доказанный no-write timeout, косметический дефект или
штатная fail-closed остановка сами по себе не требуют `Max`.

Откройте новую сессию в корне репозитория и вставьте этот goal prompt целиком:

```text
Выполни полностью docs/prompts/stage-13-continue-deployment.md.

Ближайшая конечная цель — как можно быстрее передать мне полностью рабочий
Access-protected full-manual-preview на синтетических данных, без заглушек в
обязательных MVP-контурах. Production, официальный сайт и реальные PII/Office
sources не трогать.

Это моё прямое разрешение только на preview Фазы 0–2: после fresh read-only
exact-target reconciliation и при отсутствии drift создай candidate-bound
recovery evidence/isolated recovery, примени ровно ожидаемые pending append-only
migrations 0024 и 0025 только к dedicated preview и предусмотренной recovery
copy, затем выполни dry-run и deploy exact independently reviewed candidate
только в существующий Access-protected preview. Providers и public auth на этом
шаге оставить fail-closed. Перед первой mutation кратко назови exact target,
candidate, expected result и rollback; если они не совпадают с active state —
остановись как на hard blocker.

После Фаз 0–2 продолжай всю безопасную подготовку самостоятельно. Для auth,
secret input, bootstrap и первых email/Telegram sends собери следующий scope и
задай мне один пакетный вопрос непосредственно перед действиями. Используй
risk-proportional проверки и inherited exact evidence; не запускай полный suite
без основания из AGENTS.md. Не открывай новый review-loop без material runtime
изменения или воспроизводимого P0/P1.

После каждой попытки remote mutation до следующей mutation read-only проверь
фактический результат, обнови STAGE_13_ACTIVE_STATE.md отдельным малым docs-only
checkpoint commit и сообщи current/next atomic step, rollover_required и
recommended_next_session_mode с простой ситуационной причиной.
```

Ваше сообщение уже даёт ограниченное разрешение на recovery/apply/deploy. В UI
Codex останется подтвердить системный запрос на выполнение remote-команд; это
защита среды, а не новый анализ проекта.

### Что агент обязан сообщать после каждой атомарной операции

До следующей remote mutation агент должен read-only сверить реальное состояние,
обновить tracked active state и коротко сообщить вам:

- что фактически пытались изменить и с каким результатом;
- что подтверждено после операции, а не только какой был exit code;
- на каком atomic step находится deployment и какое действие следующее;
- выполнен ли rollback/containment, если результат failed/ambiguous;
- `rollover_required: yes|no`;
- `recommended_next_session_mode: Medium|High|Max` и понятную причину.

Если новая сессия не нужна, агент всё равно указывает режим «на случай следующей
сессии» и продолжает в текущей. Не подтверждайте следующую mutation, пока этот
checkpoint не записан. После remote mutation он сохраняется отдельным небольшим
docs-only commit; многочасовой runtime suite ради такой записи не запускается.

## Что делать дальше

### 1. Дождаться первой контрольной точки

Агент должен коротко показать:

- preview target совпал с защищённым current record;
- exact reviewed candidate имеет independent GO;
- ожидаются только migrations `0024` и `0025`;
- известна предыдущая совместимая Worker version для rollback;
- production/CMS targets отсутствуют.

Если всё совпало, подтвердите один пакет remote-команд. Не соглашайтесь, если
агент предлагает заново выполнить полный аудит или полный suite без нового
material runtime diff.

### 2. Проверить результат базового deploy

После Фаз 1–2 агент должен дать preview URL и четыре простых результата:

1. без Access вход закрыт;
2. после Access входа URL открывается;
3. health отвечает ожидаемо;
4. providers/public registration пока безопасно выключены.

Если это пройдено, база и Worker готовы к включению функций.

### 3. Включить email и создать два account

Подтвердите пакетную preview-only операцию. Когда появится интерактивный prompt,
лично введите Resend secret. Затем:

1. зарегистрируйте corporate test account;
2. откройте письмо и подтвердите адрес;
3. зарегистрируйте второй test-parent account;
4. подтвердите второй адрес;
5. не передавайте агенту passwords, OTP, verification links, cookies или tokens.

Сообщите только «оба account verified». Агент сам найдёт их безопасные internal
IDs и подготовит штатный one-shot bootstrap.

### 4. Подтвердить one-shot admin bootstrap

Перед подтверждением проверьте, что target — corporate test account и preview
D1. После команды агент должен показать только безопасные факты: admin count,
audit present, replay denied и второй account остаётся parent-only.

### 5. Подключить Telegram

Введите bot token только в interactive secret prompt. Numeric chat ID/type и
binding key также передавайте защищённым способом, который не печатает values.
Разрешите сначала read-only `getMe/getChat/getChatMember/getWebhookInfo`
preflight. После его успеха отдельно подтвердите ровно один PII-free
normal-outbox message и визуально проверьте, что он появился в нужном channel
ровно один раз.

### 6. Выполнить ручную проверку

Используйте два разных browser profile/incognito window для parent и admin.
Пройдите по порядку:

1. registration, verification, login, logout и password reset;
2. parent: child, catalog, trial, request, cabinet;
3. admin: поиск case, решение, group/enrollment и price review;
4. support, absence и реальные test emails;
5. synthetic upload → quarantine → admin download → ваш AV scan → hash-bound
   attestation → отдельное approve/reject → cleanup;
6. четыре marked test PDF; у одного — parent accept, затем отдельный admin
   formation/activation, certificate и download;
7. Telegram: одно сообщение, без имени/почты/телефона/текста документа;
8. privacy export/delete dry-run/closure на специально созданном synthetic case;
9. desktop и телефон: меню, формы, немецкие тексты, keyboard navigation, zoom и
   очевидные визуальные дефекты.

Для AV шага сообщите агенту только product/version, время и `clean|detected`;
сам файл и его содержимое в чат не копируйте.

## Как сообщать об ошибке

Достаточно написать:

```text
Где: <страница/действие>
Ожидал: <результат>
Получил: <результат>
Время: <Europe/Berlin>
Correlation ID: <если показан>
```

Можно приложить screenshot после удаления email, имен, адресов и tokens. Агент
должен сначала исправлять только `P0/P1`, запускать affected tests и возвращать
вам тот же сценарий на повтор. Косметику и необязательную полировку — в backlog.

## Когда preview готов

Готовность означает одновременно:

- два verified account и раздельные parent/admin роли работают;
- все девять блоков ручной проверки пройдены;
- четыре PDF и один полный formation lifecycle реально получены;
- upload/AV/review/cleanup и один Telegram send реально выполнены;
- нет открытого `P0/P1`;
- Access остаётся включён, production/CMS/real PII не затронуты.

После этого агент фиксирует `full-manual-preview` как завершённый и отдельно
сообщает production NO-GO/remaining approvals. Production не включается
автоматически.

## Если что-то пошло не так

- Сначала выключить только затронутый feature/provider.
- Worker вернуть на заранее записанную compatible version только после exact
  rollback confirmation.
- D1 migration не удалять и не переписывать; использовать зафиксированный
  recovery/forward-fix plan.
- Telegram `delivery_unknown` никогда не отправлять повторно вслепую.
- При сомнении сохранить Access и все providers fail-closed, затем сообщить
  safe correlation ID и остановиться.

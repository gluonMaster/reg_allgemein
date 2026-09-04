# Stage 13: план live-проверок ролей и ownership

Подготовлен 2026-09-04. Статус: **read-only preparation complete**;
live-пробы и создание новых fixtures не выполнялись. Текущее разрешение,
target/version и следующее действие задаёт только
[active state](STAGE_13_ACTIVE_STATE.md). Этот план не расширяет разрешения.

## 1. Требования и проверенная исходная точка

Источники: `AUTH-05/06/08/09` в [MVP](../spec/MVP_SPEC.md), раздел 2
[acceptance criteria](../spec/ACCEPTANCE_CRITERIA.md),
[Stage 13 roadmap](ROADMAP.md#131-ближайший-milestone-full-manual-preview),
bootstrap § 7 [deployment runbook](../operations/PRODUCTION_DEPLOYMENT.md).
В [OPEN_QUESTIONS](../spec/OPEN_QUESTIONS.md) открытых вопросов нет; план не
создаёт новых бизнес-правил. Provider/document/contract flows остаются частью
`SYS-04`/`OQ-036`, а production — отдельным gate.

Snapshot inventory `2026-09-04T13:53:59.152Z`:

| Объект | Подтверждённое состояние |
| --- | --- |
| Admin A, прежний slot 1 | verified active admin; user session version 2 |
| Parent P1, прежний slot 2 | verified active parent; user session version 1 |
| Sessions | 4, все revoked: 3 logout + 1 role change |
| Children | 1703 legacy, все unclaimed; owned 0, portal 0 |
| Requests/documents/offers/artifacts/threads/price items | 0 каждого вида |
| Bootstrap | consumed; action/assertion/audit 1/1/1 |

Пять SELECT прочитали 1727 строк, записали 0; `changes=0`, `changed_db=false`.
Identity values не выбирались, HTTP к приложению не выполнялся. Protected
evidence `tmp/admin-first-login-20260904-owner/role-inventory-safe.json`, SHA-256
`65ffa2c2c50d1f129823d05e4b99134401f55d64be5b22349cd28c2ba7d674fc`.
Worker fingerprint `ad3134edb662`, 100%, bindings совпали с protected record;
target fingerprints: account `5dbd04a4763a`, Worker `242c1796e930`, origin
`88ed782ba25a`, D1 `ccdeb22bb2a1`. Это датированное evidence, не будущий preflight.

Проверенные runtime routes/security modules совпадают с deployed ancestor
`0db38842524ebc146eaa56a9d089e3c3484bf0f3`; единственный runtime diff reviewed
candidate `438a51399ac5f58b428b624c52ca2cbbc059ae9c` — bootstrap role-transition
guard. Для перечисленных probes новый deploy кода не требуется.

## 2. Второй parent необходим для cross-owner проверки

Нужны три аккаунта: **A + P1 + P2**. Admin не заменяет второго parent: middleware
отказывает ему до object-owner проверки. Unclaimed legacy child также не
подходит для проверки parent-to-parent доступа. Случайный несуществующий ID
доказывает только not-found, а не отказ на существующем чужом объекте.

Владелец предложил дополнительный контролируемый email для P2, если это нужно
для полного контура. Это условие подтверждено inventory. Адрес не переносится
в tracked план, код, отчёты или логи. Профиль, ребёнок и заявка должны содержать
только синтетические данные; пароль создаётся владельцем приватно в форме.

До регистрации необходимо подготовить exact change
`PREVIEW_EMAIL_RECIPIENT_HASHES`: сохранить два текущих значения и добавить
ровно SHA-256 от `trim().toLowerCase()` выбранного адреса. Нормализация взята из
`src/lib/server/email/resend.ts`; provider отклоняет неразрешённый recipient
до отправки. Сейчас это **проект изменения**, live allowlist не менялся.
Добавление адреса не должно включать другие providers, routes, flags или роли.

После exact allowlist change и его checkpoint:

1. Одна обычная регистрация P2: unverified parent, privacy acknowledgement,
   verification token/outbox и одно verification-письмо. Проверить отсутствие
   existing/pending-email collision и принадлежность адреса выбранному recipient.
2. Одна verification: verified parent, отдельный FamilyID и registration receipt;
   реализация автоматически ставит **одно welcome-письмо** в outbox. Оно должно
   входить в согласованный scope этой регистрации вместе с verification-письмом.
3. Обычный вход P2, checkpoint. Одна запись синтетического portal child C2 через
   `POST /cabinet?/createChild`, checkpoint.
4. Один self-pay individual **draft** Q2 для C2 через
   `POST /requests/new?/create`, checkpoint. Не выполнять submit/contract/send.
   `createDraft` создаёт request, audit и assertion; для `individual` funding
   authorization и provider-send отсутствуют.

Exact diff allowlist, способ применения/восстановления binding и его защищённое
evidence готовятся до live change. Существующие двухаккаунтные helpers ожидают
ровно два recipients/users: их нельзя запускать после расширения и считать
ожидаемый cardinality mismatch дефектом приложения. Новые SELECT-only проверки
должны явно принимать A/P1/P2, не переписывая старое evidence.

## 3. Протокол live-проб

`O` — exact preview origin из protected record. Не брать origin, cookie или
object ID из произвольной ссылки. Перед выполнением — fresh read-only target,
deployment/bindings, account/session и fixture preflight. Нет совпадения — stop.

Использовать обычные owner-created sessions в управляемом browser context.
Логины выполняет владелец приватно. Для разных ролей — отдельные cookie jars
либо последовательные normal logout → checkpoint → login; две вкладки одного
browser profile **не изолируют** cookies. Вторая схема достаточна и не требует
сохранять параллельные сессии. Не экспортировать cookies/passwords/CSRF в файлы,
чат, HAR или traces. Сессионные данные для разрешённой пробы остаются в памяти
того же защищённого browser context; неподдерживаемый транспорт не обходить
подделкой JWT, SQL session insert или изменением browser protection.

Для POST: `Origin: O`, `Content-Type: application/x-www-form-urlencoded`,
`Accept: application/json`; точный named-action URL из таблицы. Правильный `_csrf`
брать из normal form текущей сессии; wrong token — фиксированная несекретная
строка `role-probe-invalid-csrf`. Не менять session cookie/CSRF cookie.

`src/hooks.server.ts` сначала проверяет form origin, затем аутентифицирует
сессию с `touchSession`, затем применяет role policy. Поэтому и отказанный
authenticated GET/POST может писать `last_seen_at`. Wrong/missing CSRF проверять
с **правильным Origin**, чтобы отказ origin guard не замаскировал token check.

В установленном SvelteKit 2.70.2 JSON `ActionFailure` имеет HTTP **200** с
envelope `type='failure'`, `status=403|404|400`; `data` — сериализованный devalue.
Проверять envelope и безопасные `success/message` после штатного decode,
а не считать любой HTTP 200 успехом. Middleware role denial возвращает HTTP
403/`FORBIDDEN`; отсутствие сессии — 401 и **не** считается role/CSRF proof.
Cloudflare Access redirect, 5xx, HTML вместо ожидаемого JSON или неизвестный
envelope — unresolved/failed probe, без автоматического retry.

## 4. Минимальный RBAC/CSRF пакет

Этот пакет возможен с A/P1 и не требует нового ребёнка. P2 нужен для § 5.
Проверки выполнять по порядку, каждый row — отдельное атомарное действие с
checkpoint. Никакой дополнительной формы/кнопки при просмотре страниц.

| ID | Actor / exact request | Ожидаемый результат |
| --- | --- | --- |
| A01 | P1: normal `POST /auth/login` | 303 → `/cabinet`, одна новая session version 1 |
| A02 | P1: `GET /admin` | HTTP 403, `FORBIDDEN`, admin shell/data отсутствуют |
| A03 | P1: `GET /admin/users` | HTTP 403, `FORBIDDEN`, roster отсутствует |
| A04 | P1: `GET /account/security` | 200; shared security page, home `/cabinet`; token остаётся приватным |
| A05 | P1: `POST /account/security?/changeEmail`; valid `_csrf`, `email=` | failure/status 400, `auth.invalidInput`; pending email/tokens/outbox не меняются |
| A06 | P1: тот же POST, `email=`, `_csrf` отсутствует | failure/status 403, `auth.csrfRejected` |
| A07 | P1: тот же POST, `email=`, wrong `_csrf` | failure/status 403, `auth.csrfRejected` |
| A08 | P1: normal `POST /account/security?/logout` | 303 → `/auth/login`, отзыв только текущей сессии и matching audit |
| A09 | A: normal `POST /auth/login` | 303 → `/admin`, одна новая session version 2 |
| A10 | A: `GET /cabinet` | HTTP 403, `FORBIDDEN`, parent shell/data отсутствуют |
| A11 | A: `GET /contracts/00000000-0000-4000-8000-000000000001` | HTTP 403, `FORBIDDEN` до offer lookup; это role proof, не ownership proof |
| A12 | A: `GET /account/security` | 200; shared security page, home `/admin` |
| A13 | A: `POST /cabinet?/updateChild`; valid `_csrf`, `fullName=`, `birthDate=`, без childId | HTTP 403, `FORBIDDEN` от role guard; child/audit не меняются |
| A14 | A: normal `POST /account/security?/logout` | 303 → `/auth/login`, отзыв только текущей сессии и matching audit |

A05 отделяет работающий session-bound CSRF path от ранней ошибки origin/session.
Пустой email исключает изменение адреса/provider-send даже если token guard
не сработает. A13 не содержит допустимого child mutation payload, но требует
именно middleware `FORBIDDEN`, а не поздний validation отказ.

Если пакет запускается от inventory § 1 без предварительного создания P2:
sessions total 4 → 5 → 6; после normal logouts все revoked, logout count 5,
role-change count 1; user versions остаются A=2/P1=1. После добавления P2 считать
такие же **дельты** от нового checkpoint, не использовать старые totals.

## 5. Ownership пакет после создания P2/C2/Q2

Перед пробами доказать D1-SELECT: C2 существует, `origin='portal'`, current,
`owner_user_id=P2`, FamilyID совпадает с P2; Q2 существует, принадлежит P2,
ссылается на C2, `status='draft'`, ожидаемая version известна. P1 != P2, оба —
verified active parent. IDs и имена не публиковать; использовать label/digest.

| ID | Actor / request | Ожидаемый результат и значение |
| --- | --- | --- |
| B01 | P2: `GET /cabinet`, затем отдельный `GET /requests/<Q2>` | C2 виден только владельцу; request 200, draft. Это positive owner control |
| B02 | P1: `GET /cabinet` | C2/Q2 отсутствуют в owner model; проверка без вывода чужого тела/identity |
| B03 | P1: `GET /requests/<Q2>` | HTTP 404 `REQUEST_NOT_FOUND`, без request/child fields |
| B04 | P1: `POST /cabinet?/updateChild` с valid `_csrf`, реальным C2, исходными synthetic fullName/birthDate, `confirmDuplicate=false` | failure/status 404, `cabinet.child.rejected`; C2 и child audit неизменны |
| B05 | P1: `POST /requests/<Q2>?/save` с valid `_csrf`, expectedVersion Q2, C2 и исходным валидным individual/self-pay payload, новым bounded idempotency key | failure/status 404, `request.error.change`; request/version/action/assertion/audit неизменны |
| B06 | Read-only D1 reconciliation после каждого запроса | Сопоставить protected digests C2/Q2 и action/audit counts; owner P2 и FamilyID неизменны |

В B04 исходные значения ограничивают возможный эффект дефекта; даже изменение
`updated_at` или появление чужого success audit считается провалом. B05 берёт
валидный payload существующего synthetic draft в память, а не случайные
невалидные поля: schema failure не засчитывается как owner denial. Не выполнять
foreign submit, acceptance, delete или provider send ради этого smoke.

Дальнейшие AUTH-08 surfaces проходят с настоящими synthetic fixtures своих
полных flows: `/requests/documents/<D>/download`, `/contracts/<offer>`,
`/contracts/artifacts/<artifact>/download`, `/messages/<reference>` и price items.
Нужны owner positive control, чужой parent denial и неизменность объекта; для
документа/артефакта — также отсутствие возвращённого тела/R2 key. Сейчас этих
объектов нет. Disabled feature, absent ID, admin role denial или inherited test
не подменяют live cross-owner evidence. Подготовка этих fixtures относится к
соответствующим document/contract/messaging preview phases.

## 6. Postcondition, containment и evidence

После **каждой попытки** действия, способного писать session/business/provider
state, сначала bounded SELECT postcondition, затем active-state docs-only commit
с `docs:check`, `release:scan`, `git diff --check`; только затем следующий write.
Это требование `AGENTS.md`, включая denied requests с session touch. Login с его
обычным redirect — одна заранее ограниченная операция; owner control GET в B01
и каждый последующий запрос — отдельные checkpoints. Один execution scope может
охватывать весь явно согласованный пакет; повторное разрешение на каждый row
не требуется, но checkpoints не объединяются в один финальный.

Минимальный reconciliation: exact slot/role/user-version; session creation,
revocation и допустимый last_seen delta; sealed bootstrap digest/chain counts;
verification receipts; неизменность pending email/tokens/outbox/provider counts;
affected object digests, ownership/version и action/assertion/audit counts.
Login допускает rate-limit consumption; normal logout — matching audit. Для
отказанных probes допустим session touch, но не business mutation/success audit.
Секреты/PII/raw IDs не попадают в stdout, tracked state или screenshots; сохранять
UTC, case ID, role label, route template, transport/action status, безопасные
booleans/counts и evidence hashes. Raw response body после проверки не хранить.

При mismatch: остановить пакет, сохранить Access, read-only reconciliation и
checkpoint даже при timeout/ambiguous ответе. Не делать blind retry, SQL repair,
bootstrap replay, role switch, secret change или автоматический restore. Для
обычного завершения согласовать normal logout созданных сессий. Подтверждённый
authorization bypass/неожиданная запись — P0 и recovery scope; обычный expired
session/Access login redirect требует нового preflight, сам по себе не Max.
Нехватка P2/fixtures — известный prerequisite, не новый runtime P0/P1.

## 7. Что считается выполненным

- Подготовка выполнена: exact routes, результаты, эффект, checkpoints и gaps
  описаны; ни live denial, ни создание третьего аккаунта ещё не заявляются.
- A закрывает scoped live role/CSRF checks; B закрывает child/request owner
  компонент только после реального выполнения с P2/C2/Q2.
- Prompt 06 пока partial. Нельзя объявлять его завершённым только по этому
  плану, созданию P2 или одному успешному `/admin`; remaining live evidence
  фиксируется по каждому требованию. Полный AUTH-08 контур и full-manual-preview
  требуют также реальных document/contract/message/price flows.

Повторно использованы gated tests deployed ancestor: 580 pass/1 expected
Windows skip, 23 E2E; candidate-specific focused review 8/8. Проверенные
соответствия: `tests/unit/auth-security.test.ts`,
`tests/unit/parent-product-route-security.test.ts`,
`tests/unit/parent-product-service-security.test.ts`,
`tests/e2e/authenticated-access.spec.ts`; production paths в этом turn не менялись.
Выполняются только helper syntax, docs checks, release scan и diff check.
Полные runtime suites/build/E2E не повторяются ради планирования.

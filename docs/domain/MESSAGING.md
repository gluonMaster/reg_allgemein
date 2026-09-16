# Обращения, email и Telegram

Ревизия: 2026-08-14.

## Каналы MVP

- Кабинет/D1 — каноническая история обращения.
- Email — уведомление родителю, но не единственное хранилище ответа.
- Telegram — одностороннее служебное уведомление бюро.

Сбой внешнего канала не должен откатывать сохраненное сообщение, договорное
действие или заявку.

## Категории

- `absence` — структурированное сообщение об отсутствии;
- `technical`;
- `contract`;
- `payment` — вопрос, но не учет оплаты;
- `schedule`;
- `nachhilfe`;
- `other`.

Thread states: `open`, `waiting_for_admin`, `waiting_for_parent`, `answered`,
`closed`. Parent может продолжать незакрытый thread. Reopen закрытого thread —
отдельное действие или новый thread, а не скрытый status reset.

## Absence

Absence содержит child, active/relevant enrollment, local absence date, reason и
message. Parent не может отправить отсутствие по чужому/ended enrollment или на
недопустимую дату. Одна submit-операция создает один `absence_report`, один
message и один deduped Telegram event.

## Business hours

Конфигурация по умолчанию:

```text
TELEGRAM_BUSINESS_TIMEZONE=Europe/Berlin
TELEGRAM_BUSINESS_HOURS=Mo-Fr 09:00-17:00
```

Праздники не моделируются в MVP. Вне окна сообщение сохраняется сразу, а
Telegram `not_before` переносится на следующее рабочее окно. Расчет производится
timezone-aware и тестируется на выходных и DST. Родитель видит, что обращение
принято и когда бюро обычно будет уведомлено, но не внутренний token/status Bot
API.

## Outbox state machine

```text
pending -> processing -> sent
                    \-> retry -> processing
                    \-> dead
                    \-> delivery_unknown   (только Telegram)
pending|retry -> cancelled

delivery_unknown --confirm_sent--------> sent
                 --retry_after_review--> retry
                 --cancel--------------> cancelled
```

- worker берет due rows с lock/lease;
- `dedupe_key` уникален для доменного события и канала, но дедуплицирует только
  постановку в outbox и не является idempotency key внешнего provider;
- transient error увеличивает attempts и ставит `next_attempt_at` с
  конфигурируемым exponential backoff;
- permanent error или исчерпание `max_attempts` дает `dead`;
- stale processing lease можно безопасно забрать повторно только если для него
  не был зафиксирован Telegram dispatch marker; stale Telegram lease после
  dispatch marker переводится в `delivery_unknown` без автоматической отправки;
- `sent` никогда не отправляется cron повторно;
- ручной retry `dead` создает audit и не меняет dedupe identity;
- `delivery_unknown` не участвует в обычном retry/cron: admin может выполнить
  только audited `confirm_sent`, `retry_after_review` после проверки отсутствия
  сообщения по delivery reference либо `cancel`, с обязательными reason и
  evidence без PII.

По умолчанию `max_attempts` должен быть конечным и задаваться конфигурацией.

Один Cron drain выполняет queue maintenance ровно один раз перед bounded claim
loop. Email invalid-recipient cancellation и Telegram stale-dispatch reconcile
ограничены тем же batch ceiling (не более 100); они не повторяются перед каждой
строкой batch. Неизменившиеся Telegram activation floor и max-attempt policy
проверяются conditional UPSERT без D1 write. Наличие `delivery_unknown` или
`dead` проверяется как boolean `EXISTS`, поэтому retained terminal history не
суммируется при каждом minute tick. При `TELEGRAM_PROVIDER=disabled` provider
send не выполняется, но bounded stale-marker reconcile и persistent safe signal
остаются обязательными: именно они не дают потерять неизвестный исход отправки.
Точные интервалы являются эксплуатационной настройкой, но тест использует
детерминированную функцию backoff.

## Origins и ссылки

Все absolute links на verification, password reset, cabinet, admin UI,
contract artifacts и price-review items строятся только от валидированного
`PORTAL_PUBLIC_ORIGIN`. Request-controlled host header и origin
`https://kolibri-dresden.de/` для этого не используются. Ссылка в письме не
заменяет ownership/session check после перехода.

Официальные Datenschutz, Impressum и Kontakt остаются внешними HTTPS-
ссылками из approved versioned configuration; портал не использует сайт как
redirect bridge, auth/session provider или runtime API.

## Минимизация Telegram payload

Telegram содержит category, ticket/reference ID, время, стабильный
псевдонимизированный delivery reference и ссылку на admin UI.
Он не должен содержать:

- содержимое funding documents Jobcenter/Sozialamt или contract documents;
- полный адрес, телефон или email;
- секретный object URL/token;
- полный свободный текст чувствительного обращения, если достаточно summary;
- stack trace или provider credentials.

## Telegram Bot API provider

Production-shaped runtime mode называется `TELEGRAM_PROVIDER=bot_api`. При
включении обязательны отдельный environment secret `TELEGRAM_BOT_TOKEN` и
защищенное `TELEGRAM_CHAT_ID` как exact signed-decimal string без `@username`
alias; отсутствие любого из них, fake mode в production или невалидный numeric
destination должны fail closed.
До включения также задаётся canonical UTC `TELEGRAM_ACTIVATION_AT`, привязанный
к reviewed change. Worker никогда автоматически не отправляет накопленные до
этого cutoff `pending|retry` rows: такой backlog сначала отдельно считают,
проверяют и аудируемо отменяют/переносят. Настройка
`TELEGRAM_MAX_ATTEMPTS` применяется при D1 claim и не может оставаться
неиспользуемой декларацией поверх producer default.
Preview и production используют разные dedicated bot/token/destination. Bot
добавляется только в утвержденный private bureau channel/supergroup с минимальным
правом публикации, не переиспользуется для иных процессов и не принимает
родительские сообщения. Портал не регистрирует webhook, long polling или иной
inbound Telegram path.

Adapter вызывает только `sendMessage` HTTPS POST с JSON и exact destination из
конфигурации. Текст plain, без `parse_mode`, entities, reply markup, media или
documents; `link_preview_options.is_disabled=true` не дает Telegram получать
admin URL для preview, а `protect_content=true` ограничивает пересылку/сохранение.
Успехом считается только валидный ответ `ok=true` с `message_id` и ожидаемым
`chat.id`/разрешенным типом destination. В D1 сохраняются только безопасный
provider message ID, delivery reference и timestamp, но не token, chat ID,
request/response body или provider `description`.

Telegram Bot API не предоставляет документированный idempotency key для
`sendMessage`; `UNIQUE(dedupe_key)` поэтому не доказывает exactly-once delivery.
Перед первым возможным HTTP dispatch worker обязан отдельной завершенной D1-
операцией записать `dispatch_started_at` и стабильный PII-free delivery reference.
После этого действуют следующие правила certainty:

- только синтаксически валидный `ok=false` означает, что provider явно отклонил
  запрос и автоматический retry можно классифицировать безопасно;
- `error_code=429` является retryable, а `next_attempt_at` не может быть раньше
  ни exponential backoff, ни provider `parameters.retry_after`; тот же deadline
  атомарно становится durable destination-wide cooldown. Если `retry_after`
  отсутствует/невалиден, computed backoff всё равно сохраняется как cooldown,
  поэтому другой или вновь созданный row не обходит rate limit в следующем cron;
- явные `408|425|5xx` с валидным `ok=false` являются retryable;
- `400|401|403|404`, validation/auth/permission failures и иные явно permanent
  ответы переходят в `dead`;
- `parameters.migrate_to_chat_id` считается permanent configuration drift:
  destination никогда не меняется и отправка не повторяется автоматически;
- network error, timeout, unreadable/oversized/malformed/truncated/contradictory
  response, non-`ok=true` ambiguous envelope, `ok=true` без проверяемого
  ожидаемого результата, destination mismatch или потеря D1-
  подтверждения после provider success переводят строку в `delivery_unknown` с
  безопасным кодом `TELEGRAM_DELIVERY_UNKNOWN` и без blind retry.

Telegram drain останавливается после первого `delivery_unknown`, retryable или
permanent provider outcome. Пока существует unresolved `delivery_unknown` либо
terminal `dead`, последующие provider sends для sole bureau destination
заблокированы, а scheduler продолжает поднимать persistent safe alert даже при
`TELEGRAM_PROVIDER=disabled`.
Final external-send boundary принимает только exact per-template payload keys,
allowlisted category, opaque UUID reference, canonical UTC timestamp и
предопределённый admin path без query; любое несоответствие становится
pre-dispatch terminal error и не вызывает provider.

Read-only preflight сверяет ожидаемую bot identity, exact chat/type, право
публикации и отсутствие webhook. Он не заменяет delivery smoke. Реальный preview
smoke допускается только по отдельному разрешению: отдельный preview bot/channel,
один синтетический row и ровно один реальный `sendMessage` attempt. Его
фактический результат фиксируется как `sent` с message ID/delivery reference/no
duplicate либо как `delivery_unknown` без retry. Local automated fake-transport
success/ambiguity не подменяет ни один внешний исход. Local automated tests всегда
используют fake fetch/provider и не выполняют Telegram API calls. Provider/privacy
approval, secret provisioning и preview smoke остаются самостоятельными release
gates и не закрываются локальным тестом adapter.

Подготовленный synthetic smoke cohort имеет отдельный no-send abort. Он не
вызывает preflight или Bot API и разрешён только для exact target-bound
`pending` row либо partial `processing` claim с нулём dispatch attempts. Один D1
batch записывает append-only authorization/assertion и переводит row в
`cancelled`; ordinary Cron не может reclaim-ить smoke signature. После любого
dispatch attempt либо terminal state abort fail-closed, а неоднозначный D1
результат сначала сверяется read-only verify. Поэтому abort не является способом
повторить или замаскировать возможную provider delivery.

Crash после durable `dispatch_started` не переводится в abort и не разрешает
повтор `run`. Только после expiry исходного lease exact target/cohort-bound
reconcile без Telegram secrets, preflight или provider call проверяет сохранённый
claim/attempt proof и переводит попытку в `delivery_unknown`. Операция
идемпотентно reconciles partial D1 write, сама ничего не отправляет и оставляет
строку для обычного exact-attempt audited manual resolution.

## Email outbox

Email templates нужны для:

- verification и password reset;
- registration/welcome;
- alternate legacy-email proof и claim result;
- trial received/confirmed/rejected;
- Nachhilfe request/needs info/decision;
- contract sent/accepted/formed; formation notice ведёт к immutable offer PDF и
  отдельному formation certificate, а delivery каждого artifact фиксируется;
- подтверждение зарегистрированного media-consent withdrawal;
- price increase/decrease review с private cabinet link;
- receipt/status для Widerruf, Kündigung и mutual termination request;
- admin reply.

Domain transaction записывает template ID, recipient reference и минимальный
snapshot параметров. Worker формирует письмо на утвержденном locale. Ошибка
provider сохраняет error code/attempt, но ответ admin уже виден в кабинете.

Claim email выполняет conditional recipient revalidation непосредственно в
`UPDATE`: account должен оставаться active/unblocked, а token/email/family
version — current. Account closure и dispatch используют один D1 serialization
barrier. `processing` row не позволяет closure завершиться; closure, выигравший
первым, отменяет `pending|retry` rows и делает последующий claim пустым. Worker
не продолжает отправку по одному лишь результату предварительного `SELECT`.

Для verification/password-reset stage-05 outbox хранит только server-side
`auth_token` reference и template ID, но не raw token или готовую secret-bearing
ссылку. Dispatch adapter восстанавливает одноразовый opaque token server-side из
отдельного secret и случайного token ID, сверяет актуальные target/email version
и строит absolute link только через `PORTAL_PUBLIC_ORIGIN`. Автоматические тесты
используют in-memory fake provider; production provider подключается отдельным
release-gated wiring и не имеет insecure fallback.

Alternate legacy-email proof отправляется только после authenticated opt-in для
одного unambiguous name-match candidate. Письмо содержит expiring one-time link,
привязанный к requesting user/candidate/current family version, и объясняет, что
переход должен быть завершён после входа именно в запросивший portal account.
Полный recipient не включается в URL, template parameters для UI, audit или log;
в кабинете используется только утверждённая маска. GET не меняет FamilyID:
после перехода требуется authenticated confirmation POST с CSRF и повторной
server-side проверкой token/ownership/version. Provider failure оставляет
namespace `2` без изменений и отображается как безопасно повторяемая отправка.

Price-review email не содержит accept token или изменение через GET. Он
сообщает old/new base monthly amount, предупреждает об отсутствии holiday/
payable adjustments, даёт 14 календарных дней на ответ и объясняет, что после
второго admin confirmation новая base price начнёт действовать с первого числа
следующего календарного месяца. Он ведёт в authenticated cabinet. Первый admin approval разрешает
рассылку, но parent acceptance ещё создаёт второй admin-confirmation task.
Decline и timeout создают deduped admin notification/manual-contact task;
Telegram при необходимости содержит только internal item ID и admin link.

Widerruf/Kündigung receipt сохраняется до постановки email в outbox и не зависит
от доставки provider. Письмо подтверждает неизменяемые contract/request IDs,
вид заявления и server receipt timestamp; debt/payment details в него не
подмешиваются.

Individual/Nachhilfe notice «больше не посещаем» также получает durable receipt
с server timestamp и перечнем затронутых future appointments, если они известны.
Письмо подтверждает, что после receipt новые future units не начисляются. Для
уже согласованного lesson оно допускает только manual review: требование возможно
лишь при attested фактическом приходе/ожидании teacher до receipt; если receipt
был раньше прихода, требование исключено. Портал не выставляет invoice.

Media-withdrawal confirmation формируется только после сохранения append-only
revoke event и содержит ребёнка/отозванные scopes, source channel и фактический
receipt timestamp, но не перечисляет исторические публикации. Admin не может
поставить withdrawal в `approved|declined`: email подтверждает регистрацию
факта. Ошибка provider не откатывает revoke. При успешном account deletion тот
же timestamp используется для автоматических revoke events; отдельное письмо
может быть частью итогового closure confirmation, если email ещё доступен до
минимизации profile. Актуальные способы обращения выводятся из approved
versioned contact configuration со ссылками на официальные Impressum/Kontakt,
а не из hardcoded template values.

Не следует логировать полный recipient email или body. Для диагностики можно
хранить internal user ID, provider request ID и безопасный error code.

### Транзакционный email provider

Для портала выбран Resend через HTTPS Email API. Входящая почта домена остаётся
в IONOS: подключение Resend не изменяет root MX и не создаёт второй SPF record на
`@`. Утверждённая identity одинакова для preview и production:

```text
From: Kinder- und Elternzentrum Kolibri e.V. <registration@kolibri-dresden.de>
Reply-To: registration@kolibri-dresden.de
```

Runtime mode `EMAIL_PROVIDER=resend` разрешён только при exact значениях выше и
secret `RESEND_API_KEY`; production fake mode запрещён. Ключ выпускается отдельно
для этого приложения с `Sending access` и ограничением доменом
`kolibri-dresden.de`, не переиспользуется из другого проекта и не хранится в Git,
vars, документации или shell history.

Adapter отправляет plain-text template через `POST /emails`, передаёт стабильный
псевдонимизированный `Idempotency-Key` из outbox identity и сохраняет только
provider request ID. Network/rate-limit/5xx ошибки повторяются через outbox;
validation, credential, domain и исчерпание quota переводятся в безопасную
permanent provider error для operator review. Текст provider error, recipient,
subject/body и credential не попадают в логи или audit. После неопределённого
network result ручной retry старше provider idempotency window требует отдельной
operator-проверки, чтобы не создать поздний дубль.

Provider остаётся `disabled` до установки environment-specific secret,
разрешённого preview smoke с синтетическим адресатом и отдельного решения о
включении реальной отправки.

Для рабочего preview `EMAIL_PROVIDER=resend` дополнительно требует
`PREVIEW_EMAIL_RECIPIENT_HASHES`: comma-separated SHA-256 allowlist максимум из
пяти нормализованных test-recipient адресов либо exact значение `*`.
По решению владельца от 2026-09-16 `*` явно снимает ограничение получателей
в Access-protected preview для ручных пробных регистраций и их уведомлений.
Отсутствующее, пустое или ошибочное значение не включает этот режим; смесь
`*` и hashes недопустима. В production эта preview-настройка запрещена.
Сам режим не снимает Access, Turnstile, rate limits, ownership и provider
credentials/identity checks и не повторяет ранее завершённые `dead` deliveries.
При настроенном списке проверка выполняется до HTTPS-запроса к Resend;
адрес вне allowlist завершается permanent safe error. Сами адреса не попадают
в Git, Worker vars, audit или evidence. `contract.sent` может
содержать ровно один PDF до 10 MiB: worker получает его только из private R2,
предварительно сверяет D1 size/SHA-256, а provider передаёт Base64 attachment.
Официальный Resend batch endpoint для этого пути не используется.

## Языки

Обязательный MVP locale — German. Template keys и UI не должны блокировать
добавление Russian/English/Ukrainian; отсутствие необязательного перевода
использует German fallback и регистрируется в non-PII diagnostics.

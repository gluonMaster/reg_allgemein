# Обращения, email и Telegram

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
pending|retry -> cancelled
```

- worker берет due rows с lock/lease;
- `dedupe_key` уникален для доменного события и канала;
- transient error увеличивает attempts и ставит `next_attempt_at` с
  конфигурируемым exponential backoff;
- permanent error или исчерпание `max_attempts` дает `dead`;
- stale processing lease можно безопасно забрать повторно;
- `sent` никогда не отправляется cron повторно;
- ручной retry admin создает audit и не меняет dedupe identity.

По умолчанию `max_attempts` должен быть конечным и задаваться конфигурацией.
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

Telegram содержит category, ticket/reference ID, время и ссылку на admin UI.
Он не должен содержать:

- содержимое funding documents Jobcenter/Sozialamt или contract documents;
- полный адрес, телефон или email;
- секретный object URL/token;
- полный свободный текст чувствительного обращения, если достаточно summary;
- stack trace или provider credentials.

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

## Языки

Обязательный MVP locale — German. Template keys и UI не должны блокировать
добавление Russian/English/Ukrainian; отсутствие необязательного перевода
использует German fallback и регистрируется в non-PII diagnostics.

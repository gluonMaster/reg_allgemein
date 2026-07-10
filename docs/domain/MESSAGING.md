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
- claim result;
- trial received/confirmed/rejected;
- Nachhilfe request/needs info/decision;
- contract sent/accepted/activated;
- price review;
- admin reply.

Domain transaction записывает template ID, recipient reference и минимальный
snapshot параметров. Worker формирует письмо на утвержденном locale. Ошибка
provider сохраняет error code/attempt, но ответ admin уже виден в кабинете.

Не следует логировать полный recipient email или body. Для диагностики можно
хранить internal user ID, provider request ID и безопасный error code.

## Языки

Обязательный MVP locale — German. Template keys и UI не должны блокировать
добавление Russian/English/Ukrainian; отсутствие необязательного перевода
использует German fallback и регистрируется в non-PII diagnostics.

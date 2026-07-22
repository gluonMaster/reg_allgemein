# Handoff этапа 11: messaging и надёжные outbox-очереди

Статус: `done`

Production readiness: `cron_and_real_delivery_not_wired`

## Baseline

- Branch: `master`.
- Start HEAD: `73539f426c3818058785a89849cfd355d89506f6`.
- Initial worktree: clean.
- Предыдущий handoff: `docs/implementation/handoffs/stage-10.md`, status `done`.
- Применены канонические `SYS-03`, `MSG-01`–`MSG-04`, `ADMIN-01`–`ADMIN-03`,
  `AUTH-08`, `SEC-02`, `REL-02`, `TIME-01`, `OBS-01` и соответствующие разделы
  1A, 2, 9 и 10 acceptance criteria. Нерешённые вопросы из
  `docs/spec/OPEN_QUESTIONS.md` не превращались в бизнес-правила.

## Migration и модель данных

- Добавлена новая immutable migration `0012_messaging_outboxes.sql`; применённые
  migration `0001`–`0011` не изменялись.
- Общий `email_outbox` расширен lease-полями, счётчиком manual retry и timestamp
  обновления. Старые строки `processing` при migration переводятся в `retry` или
  `dead` по лимиту попыток.
- Добавлены `telegram_outbox`, support threads/messages, structured absence,
  evidence административных действий и transaction assertions.
- D1 triggers ограничивают lifecycle-переходы, сохраняют immutable evidence и
  запрещают сообщения в закрытый thread.
- Pending contract/price typed events детерминированно backfill-ятся в общий
  outbox и помечаются consumed. Новые contract, price, trial, individual-request
  события мостятся триггерами без дубликатов.

## Support и absence

- Parent routes `/messages` и `/messages/<public-reference>` показывают только
  owner-scoped threads. Public reference не является bearer token: каждый read и
  mutation повторно проверяет authenticated owner на сервере.
- Категории: absence, technical, contract, payment, schedule, nachhilfe, other.
  Состояния: open, waiting_for_admin, waiting_for_parent, answered, closed.
- Первое сообщение родителя создаёт `waiting_for_admin`; admin reply атомарно
  сохраняет сообщение и email outbox и переводит thread в
  `waiting_for_parent`/`answered`; продолжение родителя снова переводит его в
  `waiting_for_admin`. Любой незакрытый thread можно закрыть, после закрытия
  новые сообщения запрещены.
- Structured absence атомарно создаёт ровно один absence report, message, thread
  и Telegram event. Проверяются owner, текущий ребёнок, релевантная active
  enrollment и календарная дата; операции имеют idempotency keys и assertions.
- Admin routes `/admin/messages` и detail поддерживают review, ответ и закрытие с
  CSRF, RBAC, audit и server-side guards. Parent/admin navigation и cabinet card
  добавлены, весь пользовательский текст локализован по-немецки через i18n.

## Общий email/Telegram outbox

```text
pending -> processing -> sent
                      -> retry -> processing
                      -> dead
pending|retry -> cancelled
```

- Claim использует lease owner/until и возвращает просроченный `processing` в
  работу. Успешно отправленная запись повторно не отправляется.
- Retry использует детерминированный bounded exponential backoff и конечное число
  попыток. Permanent provider error сразу завершает запись как `dead`.
- Provider получает стабильный idempotency key. Fake adapters поддерживают
  scripted success/retryable/permanent outcomes; disabled adapters не выполняют
  внешнюю доставку. Реальные provider adapters сознательно не реализованы.
- Telegram dispatch переносит доставку на следующее разрешённое окно по
  `Europe/Berlin`; поддерживаются weekday/weekend и оба DST-перехода. Расписание
  конфигурируется, default: Mo–Fr 09:00–17:00.
- Telegram payload минимален: category, public reference, event time и admin
  portal link. Имя, email, телефон, адрес, свободный текст, документы, token,
  cookie и stack trace в payload не попадают.
- Email templates покрывают auth/family claim, trial, individual request,
  contract lifecycle, price review lifecycle и support reply. Absolute links
  строятся только через валидированный `PORTAL_PUBLIC_ORIGIN`; raw auth token
  выводится из серверного claim и не хранится в outbox.
- `/admin/outbox` показывает только безопасные metadata без recipient/body/payload
  и позволяет audited/idempotent manual retry для `dead` либо cancel для
  `pending|retry`. Ручного endpoint для непосредственного drain/send нет.
- Admin reply и outbox insertion находятся в одной D1 transaction: временный
  сбой provider не теряет сохранённый ответ.

## Config и release gates

- Runtime config получил общие lease/retry/max-attempt параметры, email и
  Telegram provider modes, Telegram chat и business schedule.
- `wrangler.example.toml` и local config содержат только безопасные disabled/fake
  defaults, без secret values. Production validation отклоняет fake и любой пока
  не реализованный non-disabled provider.
- Feature остаётся application/D1-ready, но внешняя отправка и scheduler не
  подключены. Production migration, deploy и реальные сообщения не выполнялись.

## Проверки

| Команда/сценарий | Результат |
| --- | --- |
| `npm run check` | passed, 0 errors/warnings |
| `npm test` | passed, 30 files / 178 tests |
| `npm run build` | passed, Cloudflare adapter build |
| `npm run test:e2e` | passed, 3 Chromium tests |

D1/integration tests покрывают атомарный и идемпотентный absence, owner/date
guards, state machine, forged admin rejection, сохранность admin reply при
временном email failure, Telegram transient/permanent/max-attempt/stale-lease/
concurrent claim/sent-no-repeat/weekend, audited manual recovery и safe monitor.
Отдельно проверены bridge и dedupe для family claim, trial, individual requests,
contracts и price review, включая отсутствие price email до initial admin
dispatch. Unit tests покрывают retry/backoff, German templates, safe origin,
минимальный Telegram payload и Berlin business hours на обоих DST-переходах.

## Production cron/bindings/secrets inventory для этапа 13

Ниже inventory, а не утверждение о подключённом production runtime.

### Scheduled jobs

| Logical job | Требуемый вызов | Текущее состояние |
| --- | --- | --- |
| email outbox drain | bounded loop над `EmailOutboxWorker.dispatchNext(now)`; proposed cadence раз в минуту, подтвердить в runbook | scheduled handler/trigger отсутствует |
| Telegram outbox drain | bounded loop над `TelegramOutboxWorker.dispatchNext(now)`; proposed cadence раз в минуту, business-hours gate находится внутри worker | scheduled handler/trigger отсутствует |
| price review maintenance | `PriceReviewService.runScheduledMaintenance(now)`; ранее proposed `*/15 * * * *` | scheduled handler/trigger отсутствует |
| document quarantine cleanup | `DocumentService.cleanupExpired(now, limit)` | scheduled handler/trigger отсутствует |
| expired request authorization | `IndividualRequestAdminService.processExpiredAuthorizations(now)` | scheduled handler/trigger отсутствует |
| expired email reservation cleanup | `AuthService.cleanupExpiredEmailReservations()` | scheduled handler/trigger отсутствует |

Этап 13 должен выбрать окончательную cadence и bounded batch/drain limits,
добавить один Cloudflare scheduled entrypoint/`wrangler` triggers и обеспечить
изоляцию ошибок jobs. Сейчас scheduled export и cron triggers отсутствуют.

### Bindings и secrets

- `DB` нужен всем outbox и maintenance jobs; production migration `0012`, backup,
  restore rehearsal и roll-forward ещё не выполнялись.
- `R2_BUCKET` нужен document cleanup. Существующие `ASSETS`/`BROWSER` относятся к
  другим production flows и сами по себе outbox worker не запускают.
- `PORTAL_PUBLIC_ORIGIN` обязан пройти существующую origin validation.
- `JWT_SECRET` нужен серверному выводу одноразовых auth email tokens.
- Реальному email adapter понадобится provider API secret (существующий тип
  допускает `RESEND_API_KEY`, но adapter/wiring пока отсутствует).
- Реальному Telegram adapter нужны `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`.
- Значения secrets в repository, handoff, логах и inventory не записаны.

### Feature flags и provider gates

- `AUTH_PUBLIC_ENABLED=false`, `DOCUMENT_UPLOAD_ENABLED=false`,
  `CONTRACT_SEND_ENABLED=false`, renderer disabled,
  `MEDIA_ONLINE_GRANT_ENABLED=false`, `PUBLIC_CONTRACT_FUNCTIONS_ENABLED=false`
  остаются production gates соответствующих upstream flows.
- Email/Telegram production providers сейчас должны оставаться `disabled`:
  реальные adapters не реализованы, а production config запрещает fake mode.
- `TURNSTILE` остаётся отдельным auth gate и не заменяет outbox protections.

### Manual recovery, metrics и alerts

- `/admin/outbox`: CSRF/RBAC/audit/idempotent retry `dead` и cancel
  `pending|retry`; payload/recipient скрыты. Manual dispatch/drain route нет.
- Price-review manual maintenance уже существует. Для остальных cleanup jobs
  этап 13 должен определить безопасный manual-run path и runbook.
- Нужны timestamp/duration/result и freshness каждого scheduled run; counts и
  oldest age для `pending|retry|dead`; stale `processing` старше lease; max-attempt
  exhaustion; oldest due/`not_before`; provider safe error-code distribution;
  transaction-assertion failures; duplicate/replay counters. Метрики и alerts не
  должны содержать PII, bodies, payloads или secrets.
- Provider adapters должны передавать и соблюдать outbox idempotency key. Runbook
  должен описать safe retry, poison/dead review, D1 backup/restore и migration
  roll-forward; dashboards/alerts и production-shaped concurrency rehearsal ещё
  не выполнены.

## Не выполнено и осознанно вне scope

- Real email/Telegram adapters, credentials, Cron wiring, production migration,
  deploy, backup/restore rehearsal и monitoring dashboards остаются этапу 13.
- Праздничный календарь поверх weekday schedule, двусторонний Telegram bot,
  Telegram documents/free text и manual direct-send не добавлялись.
- Privacy export/delete и account closure относятся к этапу 12.
- Официальный сайт/CMS `kolibri-dresden.de` не изменялся.
- Новых открытых OQ и известных local/test failures нет.

`cron_and_real_delivery_not_wired` означает проверенный application/D1 boundary,
а не готовность production delivery.

## Итог worktree

- Commit не создавался без отдельного поручения.
- Изменения ограничены migration 0012, messaging/outbox server/UI/config,
  bridge существующих typed events, тестами и tracked docs.

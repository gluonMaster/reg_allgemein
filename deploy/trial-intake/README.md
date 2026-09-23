# Trial-intake deployment inputs

Это template для отдельного Worker `kolibri-trial-intake`, не готовый production
config и не разрешение на deployment. Канонические требования:
[TIN-11](../../docs/domain/TRIAL_INTAKE.md), порядок выпуска:
[release ТЗ](../../docs/implementation/TRIAL_INTAKE_RELEASE_TZ.md).
Существующие preview config, Worker и D1 не используются как deployment target.

Шаг 03 сохраняет protected draft и exact deploy packet; ID нового D1 и site key
нового Turnstile становятся известны после создания ресурсов на разрешённом шаге 04.
Тогда заполнить Git-ignored `deploy/trial-intake/wrangler.production.jsonc`
рядом с [template](wrangler.example.jsonc): account, новый D1, точный workers.dev
origin, approved official links и Turnstile host/site key. Относительные пути
template рассчитаны именно на эту папку. Secret bindings: `JWT_SECRET`,
`TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
Значения не включать в config, командную строку, handoff или Git.
Resend использует уже проверенный account/domain/sender. Владелец сообщил,
что создал ключ для `kolibri-trial-intake`; чтение/ввод и установка binding —
следующий разрешённый remote этап, повторный DNS setup не нужен.

Template начинает с `TRIAL_INTAKE_ACCEPTING=false`,
`SCHEDULED_JOBS_ENABLED=false`, `TELEGRAM_PROVIDER=disabled`.
Это подготовка/containment, а не допустимое конечное состояние release.
При включении Telegram нужны согласованные destination, bot identity и
activation cutoff согласно существующему outbox config. Для выпуска с открытым
приёмом нужны реальные Resend/Turnstile/Telegram и работающий scheduler.
`TELEGRAM_BOT_API_TIMEOUT_MS=25000`: при штатных 10 с медленный ответ Bot API
уже давал `delivery_unknown` на фактически доставленном сообщении. Значение
остаётся ниже потолка 30 000 мс и аренды `OUTBOX_LEASE_SECONDS` (60 с). Оно
делает неоднозначность реже, но не устраняет её.
Минимальные batch limits 1/5 ограничивают одну cron invocation; увеличение
проверять по D1 query budget фактического плана. Create использует постоянное
число запросов даже для 10×10 назначений.

Automatic Workers request logs/traces выключены: invocation metadata может
содержать URL с verification/reset token
([Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)).
Штатные D1 `job_runs`, audit и aggregate `/_health/operations` сохраняются.
Любое последующее включение логирования сначала проверять на отсутствие PII,
query tokens и credentials. Не использовать raw tail на реальной заявке.

## Первый администратор

CLI: `scripts/trial-intake/bootstrap-admin.ts`. Локальная репетиция без remote
доступа создаёт временную D1 и только synthetic identity:

```bash
npx tsx scripts/trial-intake/bootstrap-admin.ts --rehearse
```

Remote процедура на следующем разрешённом этапе:

1. Согласовать реальную identity; подготовить protected JSON stdin с полями
   `email`, `confirmEmail`, `firstName`, `lastName`, `password`. Повтор email —
   явная operator attestation для заранее известной учётной записи владельца.
   CLI не печатает identity/password; protected input после процедуры удалить.
2. Задать `--config`, `--database-id`, новый UUID `--user-id` и
   `--print-confirmation`. Этот режим не пишет в remote D1; confirmation
   связывает target и identity. Не передавать пароль аргументом CLI.
3. Для того же input/target использовать `--remote --confirmation` и
   protected `CLOUDFLARE_API_TOKEN`. Требуются intake schema, пустая users и
   доступный existing first-admin latch. Identity + existing role/bootstrap
   audit записываются одной batch-транзакцией; family/import не создаются.
4. CLI делает read-back после попытки записи, в том числе failed transport,
   и выводит только aggregate postcondition. При ambiguous не повторять write:
   сверить exact user/bootstrap/audit read-only. После каждой remote попытки
   выполнить checkpoint и отдельный docs-only commit по AGENTS.md.

CLI не переносит preview passwords/sessions. После bootstrap проверить login
и password reset existing auth routes; реальные provider sends требуют
отдельного разрешённого этапа. Откат нового target до первого приёма — закрыть
приём/доставку, не выдумывать предыдущую Worker version и не удалять D1 с заявками.
Exact deployment/rollback commands и fingerprint фиксируются в release packet
шага 03 до первой remote операции.

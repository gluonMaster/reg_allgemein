# Ежедневная эксплуатация и реагирование

Ревизия: 2026-08-14.

Статус документа: `blocked`; текущий production verdict — **NO-GO**. Scheduled
handler и manual operations реализованы и локально протестированы; независимый
content cold-read 2026-07-22 прошёл. Preview Worker/D1/R2, automatic Cron
delivery/freshness и независимый UptimeRobot 5-minute `HEAD` alert с DOWN→UP
delivery подтверждены 2026-08-11; remote authenticated/manual/provider/Browser
Run/failure, target-pinned legacy import/first-import restore и Telegram Bot API
ambiguous-delivery operator procedures остаются непроверенными.

Runbook относится только к самостоятельному порталу регистрации. Он не даёт
доступа к CMS или runtime официального сайта. Production-команды выполняются
только пользователем с нужной ролью и только в рамках отдельного change/incident
approval.

## Правила безопасной диагностики

1. Сначала записать UTC-время, environment, immutable Worker version и безопасный
   correlation/request ID.
2. Не записывать email, телефон, адрес, имя ребёнка, filename, document body,
   token, cookie, secret, полный URL с query string или полную client row.
3. Для поиска использовать internal IDs только в защищённом operator UI; в
   incident evidence оставлять opaque/sanitized reference.
4. Не исправлять данные direct SQL/R2 object edit. Использовать только
   owner/RBAC-checked admin action или утверждённую recovery procedure.
5. Любое действие с gate `blocked` или без current evidence не выполнять, даже
   если соответствующий local implementation уже существует.

Для каждого действия в журнале достаточно полей: `timestamp_utc`, `environment`,
`worker_version`, `operation`, `sanitized_result`, `correlation_id`, `operator_role`,
`next_action`. Значения PII/secrets запрещены.

## Текущий operational inventory

| Область               | Реализованный интерфейс                                                                                                                                                              | Недостающее                                                                                                                            | Gate                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Import review         | `/admin/imports`, `/admin/imports/<run-id>`                                                                                                                                          | remote import/recovery rehearsal                                                                                                       | `blocked`                    |
| Outbox review         | `/admin/outbox`, retry/cancel; local scheduler tests + preview automatic Cron passed                                                                                                 | production providers, dead alert/manual failure rehearsal                                                                              | `feature_disabled`/`blocked` |
| Document review       | `/admin/requests`, AV/business review; separate preview EU R2 bindings и cleanup verified                                                                                            | remote R2 failure/restore alert, approved training                                                                                     | `feature_disabled`/`blocked` |
| Price maintenance     | `/admin/price-reviews` и `/admin/operations` manual/Cron run; local tests                                                                                                            | remote manual/failure rehearsal и job-specific alert                                                                                   | `blocked`                    |
| Privacy operations    | `/admin/privacy` и `/admin/operations` cleanup run; local D1/R2 + preview automatic cleanup verified                                                                                 | remote R2 failure/retry rehearsal and job-specific alert                                                                               | `blocked`                    |
| Health/cron dashboard | `/admin/operations` + empty `/_health/operations` 204/503 signal; preview external HEAD monitor delivery passed                                                                      | authenticated admin/manual/failure rehearsal                                                                                           | `blocked`                    |
| Scheduled operations  | `src/worker.ts`, two triggers, nine allowlisted jobs; preview automatic delivery/freshness passed                                                                                    | remote manual/dedupe/failure и job-specific alerts                                                                                     | `blocked`                    |
| Admin bootstrap       | `npm run admin:bootstrap`; target guard, one-shot D1 flow, session revoke/audit и upgrade auto-seal tested locally                                                                   | remote exercise; отдельной post-consume recovery CLI нет                                                                               | `blocked`                    |
| Email provider        | Resend HTTPS adapter, verified EU domain, scoped sending key и preview Worker secret подготовлены                                                                                    | provider disabled; delivery/reply smoke и approvals отсутствуют                                                                        | `feature_disabled`/`blocked` |
| Telegram provider     | deployed preview/baseline `c5712d0` is disabled; local candidate implements `bot_api`, durable certainty/cooldown/activation policy and audited exact-attempt actions                | exact candidate verification, token/chat ownership, target-pinned preflight, operator drill and authorized synthetic send smoke absent | `feature_disabled`/`blocked` |
| Legacy import         | current Access profile reports 1703 rows, 21/21 required fields, v1 compatible; PlusBText v1 sanitizer regression fixed; exact-target reviewed atomic bundle boundary passes locally | authorized synthetic remote lifecycle, first-import restore, immutable candidate evidence and current production import absent         | `blocked`                    |
| Browser Run           | binding/config и fail-closed contract renderer path реализованы                                                                                                                      | remote conformance, quota/budget, templates/legal approval                                                                             | `feature_disabled`/`blocked` |

## Scheduled jobs inventory

Cloudflare [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
исполняют expressions в UTC. Это не локальная/provider
timezone: `Europe/Berlin` применяется только внутри Telegram business-hours
calculation и покрыт DST-тестами. Локальные scheduler/route tests, preview
automatic delivery/freshness и aggregate external UptimeRobot `HEAD` alert
проходят. Этот aggregate signal покрывает freshness и repeated scheduled/
application Worker errors; он не является job-specific backlog/dead/provider/
failure alert. Такие alerts и remote manual/dedupe/failure rehearsals отсутствуют,
поэтому ни один job ниже не имеет production `passed`.

| Назначение                       | Реализованный service method                                   | Schedule/timezone                         | Dedupe/lock                                                                                            | Manual run / signal                                                                          | Статус                                 |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| Email outbox drain               | `EmailOutboxWorker.dispatchNext()`                             | `* * * * *` UTC                           | job lock/dedupe + outbox lease/retry                                                                   | aggregate freshness/error passed; oldest/dead/provider alert missing                         | `blocked`; provider `feature_disabled` |
| Telegram outbox drain            | disabled/fake plus locally tested real Bot API worker          | `* * * * *`; business rules Europe/Berlin | lease + dispatch evidence, terminal unknown, circuit-break, activation cutoff and destination cooldown | local persistent dead/unknown signal; target-pinned preview alert/provider rehearsal missing | `blocked`; provider `feature_disabled` |
| Price-review maintenance         | `PriceReviewService.runScheduledMaintenance()`                 | `*/15 * * * *` UTC                        | job lock/dedupe + repository guards                                                                    | aggregate freshness/error passed; job-specific failure alert missing                         | `blocked`                              |
| Quarantine cleanup               | `DocumentService.cleanupExpired()`                             | `*/15 * * * *`; 14×24h threshold UTC      | job lock + conditional object claim                                                                    | aggregate freshness/error passed; backlog alert missing                                      | `blocked`; uploads `feature_disabled`  |
| Expired funding authorizations   | `IndividualRequestAdminService.processExpiredAuthorizations()` | `*/15 * * * *` UTC                        | job lock/dedupe + repository guards                                                                    | aggregate freshness/error passed; job-specific failure alert missing                         | `blocked`                              |
| Expired email reservations       | `AuthService.cleanupExpiredEmailReservations()`                | `*/15 * * * *` UTC                        | job lock/dedupe + repository guards                                                                    | aggregate freshness/error passed; job-specific failure alert missing                         | `blocked`                              |
| Expired privacy exports/R2 retry | `PrivacyService.cleanupExpiredExports()`                       | `*/15 * * * *` UTC                        | job lock/dedupe + object state                                                                         | aggregate freshness/error passed; R2 retry alert missing                                     | `blocked`                              |
| Expired security metadata        | `OperationsRepository.cleanupSecurityMetadata()`               | `*/15 * * * *`; UTC expiry timestamps     | job lock/dedupe + bounded batch                                                                        | aggregate freshness/error passed; job-specific failure alert missing                         | `blocked`                              |
| Orphan storage intents           | `StorageIntentRepository`                                      | `*/15 * * * *`; UTC lease/age             | job lock + intent lease/dedupe                                                                         | aggregate freshness/error passed; R2 retry/orphan alert missing                              | `blocked`                              |

Migrations `0014_production_operations.sql` и `0015_worker_monitoring.sql`,
clean/upgrade coverage, job/storage repositories, Worker scheduled handler,
triggers, `/admin/operations`, empty 204/503 health signal и раздельные R2
bindings реализованы и проходят targeted local tests. Preview Cron delivery и
freshness, monitoring migration/smoke и independent aggregate HEAD alert
delivery/recovery подтверждены. R2 restore, authenticated manual run и
job-specific failure rehearsal остаются `blocked`.

Current preview D1 inventory — migrations `0001`–`0015`, pending 0. Initial
preview apply 2026-08-10 (`0001`–`0014`, 14/14) остаётся датированным
историческим evidence; append-only `0015_worker_monitoring.sql` была применена
2026-08-11. Initial 14/14 не является текущим migration inventory и не доказывает
backup/restore.

Resulting local candidate добавляет append-only `0016`–`0018`. Они проходят
local migration suites, но не применены remote и не входят в current preview
inventory/evidence; до их separately authorized apply Telegram/import candidate
paths там отсутствуют.

## 1. Начало смены: health и freshness

**Prerequisites:** target environment и Worker version известны; для деталей
есть read-only operator/admin access; incident log защищён. Для active alert
должны быть отдельно утверждены независимый monitor account, recipient и owner.

**Точная команда/UI:** сначала проверить обезличенный endpoint:

```powershell
$portalOriginForMonitoring = '<PORTAL_ORIGIN>'
curl.exe --silent --show-error --output NUL --write-out "%{http_code}" "$portalOriginForMonitoring/_health/operations"
```

`204` означает: оба every-minute jobs не старше 180 секунд, все семь 15-minute
jobs не старше 1200 секунд, нет run старше 360 секунд в `running` и за последние
900 секунд меньше трёх `failed|skipped_locked` scheduled runs плюс application
5xx. `feature_disabled` считается доставленным terminal run, но не включает
соответствующую функцию. Любая D1/query/clock проблема даёт empty `503`; response
не содержит reason, job name, error code, PII или secret.

Для деталей открыть `<PORTAL_ORIGIN>/admin/operations`: страница показывает
recent `job_name`, `status`, trigger/start/finish, safe result и safe error code.
В Cloudflare Workers Logs фильтровать `$metadata.error EXISTS` либо
`$workers.outcome = "exception"`, не копируя raw payload. Дополнительный
read-only tail, только если он разрешён policy:

```powershell
npx wrangler tail --config <TARGET_CONFIG>
```

Прикладной структурированный `UNEXPECTED_SERVER_ERROR` создаётся только для
status `>=500`; обычный `4xx` остаётся в invocation log и не является Worker
error. Если `4xx` помечен этим прикладным error code, это дефект классификации
логов, а не подтверждение отказа Worker. Raw Workers Logs могут содержать
platform request headers, IP/geo и User-Agent даже при безопасном прикладном
логировании: не коммитить export и не копировать raw request/log payload в
ticket; сохранять только обезличенные counts, UTC interval, version и hash
внешнего evidence-файла.

Датированное preview evidence 2026-08-12 для immutable `200268f`, развёрнутого
как version `sha256:f4cd52e14dbd`, прошло: bounded stored-log
export содержит 60/60 outcomes `ok`, exact missing-route 404 и health `HEAD` 204,
а `UNEXPECTED_SERVER_ERROR` отсутствует. Это подтверждает preview logging/
aggregate health path, но не заменяет production logs, job-specific alerts или
provider/Browser failure rehearsal.

**Ожидаемый безопасный результат:** endpoint возвращает 204; independent poller
видит ту же проверку с интервалом не более 5 минут и доставляет test alert
утверждённому recipient; каждый job имеет свежий terminal run, repeated safe
error, stale lease и growing backlog отсутствуют.

**Проверка:** сравнить UTC timestamp с `* * * * *` или `*/15 * * * *`;
отдельно для Telegram проверить `Europe/Berlin` business-window result. Убедиться,
что typecheck/tests/preview trigger evidence прошли. Проверить incident/recovery
alert без переключения feature flags и без application email/Telegram send.
Без независимой доставки alert результат production gate не может быть `passed`.

**Stop condition:** operations page отсутствует, timestamp неизвестен, missed job,
stale lock, repeated Worker error, raw logs содержат PII или target environment
не подтверждён.

**Rollback/recovery:** прекратить tail; не запускать job вслепую. Открыть incident,
при необходимости оставить affected feature disabled и перейти к разделу
«Инциденты».

## 2. Проверить import и review queues

**Prerequisites:** active admin session; CSRF/session valid; operator понимает
source kind и academic period; source files не открываются Office/COM/LibreOffice.

Current-source evidence is sanitized only: Access has 1703 rows and 21/21
required fields under `access-tblkartei:v1`; PlusBText remains compatible with
`admin-xlsm-plusbtext:v1`. Earlier header mismatch came from a parser sanitizer
defect around a styled self-closing empty cell, not a changed source contract.
The owner-approved `IMPORT-07` normalization rerun produces 580 families, 713
children and 809 real enrollments with 160 aggregate issue occurrences and 53
enrollment reviews; the older 1429/751 counts contained false-positive status,
name and fifth-package-slot diagnostics. `AO/AT` are service-marker cells and
never packages. The active unresolved group is an upstream correction case and
must not receive fuzzy mapping. Operator must still stop until six structural
duplicate buckets, the `IMPORT-08` durable reconciliation contour and the full
immutable candidate gate are closed. No source row/path is copied here.

**Точное UI:** открыть `<PORTAL_ORIGIN>/admin/imports`; выбрать безопасный status
filter; открыть `/admin/imports/<run-id>`. Не вставлять source row в комментарий.
Для local диагностики:

```powershell
npm run import:status:local -- --limit <SAFE_LIMIT>
```

**Ожидаемый безопасный результат:** видны safe counts, hashes, dependency state и
issue codes; family/contact/identity issues expose only an opaque admin link,
not client values. There are no unexplained failed/promoting runs or stale
current snapshots. `Value46/AT` is retained by the exact future-period extract
but never expanded into groups or issue rows; `Value41/AO` is outside that
allowlist and must follow the same ignore rule if current-block import is added.

До реализации
[IMPORT_ADMIN_RECONCILIATION_TZ.md](../implementation/IMPORT_ADMIN_RECONCILIATION_TZ.md)
generic `resolve|dismiss` не считается исправлением actionable issue. Для
ошибки upstream администратор фиксирует `awaiting_upstream`, оператор исправляет
read-only source вне портала, а closure подтверждает только следующий import.

**Проверка:** current promoted price/schedule/access/plusbtext версии согласованы
по academic period; fatal/error issue запрещает promotion/registration enable.

For a separately authorized remote operation, `/admin/imports` is review-only
and never replaces exact-target CLI pinning. Required sequence is no-write
`plan` → inactive `stage` → digest-bound independent `review` → protected
`recovery-evidence` → atomic Access+PlusBText `promote` → safe `verify`; exact
flags are in [IMPORT_PIPELINE.md](IMPORT_PIPELINE.md). The operator verifies
environment, ignored config, D1 UUID, clean exact SHA, schema-v3 `sourceClass`,
academic period, source/fixture/dependency hashes, caller timestamps, separated
operator IDs and safe diff/count contract at every boundary. Preview accepts
only CLI-built 1703-row `baseline|candidate` fixtures and forbids Office paths;
production requires both read-only paths. No remote command has been authorized
or executed.

**Stop condition:** failed promotion, dependency mismatch, PII в issue output,
0/multiple current snapshot, unavailable/stale legacy snapshot, parser contract
regression not evidenced, plan digest changed, target/config/D1 UUID mismatch,
role separation/recovery artifact/count contract invalid, stage attempts to
change current pointer, review/promote are conflated or production guard would
need bypassing.

**Rollback/recovery:** выключить public registration; не править D1 вручную.
Local rehearsal rollback:

```powershell
npm run import:rollback:local -- --source-kind <price|schedule|plusbtext|access> --academic-period <PERIOD_CODE> --to-version <VERSION_ID>
```

Exact-target remote import/rollback command boundary реализована и локально
протестирована, но ни одна remote команда не была разрешена или выполнена;
production recovery остаётся `blocked` до preview rehearsal. Для первого promote
previous version не существует: operator до mutation проверяет recovery
bookmark/pre-import backup, successful isolated restore to no-current state и
создаёт plan/review-bound artifact командой
`import:legacy:recovery-evidence:remote`. Ordinary preview uses only built-in
`synthetic_preview` sources. Real current Access/PlusBText data never enters
ordinary preview and requires separate data/privacy plus exact mutation
permission. Candidate migrations `0016`/`0018` не применены в deployed preview;
production transitions пока fail closed.

## 3. Проверить outbox retry/dead

**Prerequisites:** active admin; provider path и его gate известны; реальная
отправка отдельно разрешена.

**Точное UI:** `<PORTAL_ORIGIN>/admin/outbox`; поля filter `channel` и `status`.
Для обычной строки `dead` доступно действие `outboxAction=retry`; для
`pending|retry` — `outboxAction=cancel`; для обоих действий установить
обязательное `confirmation=confirmed`. Telegram `delivery_unknown` намеренно не
принимает эти generic actions: форма связывает решение с exact attempt ID и
предлагает только audited `confirm_sent|retry_after_review|cancel` с фиксированным
safe reason code. PR-F13 остаётся `blocked` до immutable-candidate verification и
target-pinned operator rehearsal.
Unknown означает, что HTTP request мог быть доставлен, хотя Worker не получил
однозначного success. Такая row не reclaim-ится и не retry-ится автоматически.
Синтаксически валидный Bot API `ok=false` означает provider rejection: `429` и
explicit `408|425|5xx` являются conclusive retryable, не unknown. Transport/
timeout/unreadable-or-oversized/malformed/contradictory response, non-`ok=true`
ambiguous envelope, invalid/mismatched success либо destination mismatch после
`sendMessage` являются ambiguous. `429` сохраняет computed `nextAttemptAt` как
destination-wide D1 cooldown даже при missing/invalid `retry_after`. Unresolved
unknown или terminal dead блокирует sole bureau lane на следующих Cron runs.
`retry_after_review` допустим только после проверки approved bureau chat и
доказанного отсутствия сообщения; operator не читает/копирует клиентский payload
в incident evidence.

**Ожидаемый безопасный результат:** retry/cancel создаёт audit-safe transition;
dedupe сохраняется; message body и recipient не появляются в evidence.

**Проверка:** обновить страницу и убедиться, что изменена одна выбранная запись;
после разрешённого dispatch status движется по documented state machine.

**Stop condition:** provider `disabled`, массовый dead backlog, повтор создаёт
duplicate send, неизвестный recipient scope, нет scheduled drain/alert или нужен
просмотр body вне authorized UI. Для Telegram также остановиться, если
`delivery_unknown` попал в обычный retry/stale reclaim, exact destination или bot
owner неизвестен, `migrate_to_chat_id` предлагается принять автоматически либо
operator resolution action/audit отсутствуют.

**Rollback/recovery:** при provider incident оставить provider disabled; cancel
только доказанно небезопасные pending items после обязательного confirmation.
Не включать real provider ради очистки backlog. Эскалировать owner provider и
сохранить sanitized counts/error code. Telegram unknown row не переводить direct
SQL в `retry|sent`: использовать только exact-attempt audited action; пока
target-pinned rehearsal не пройден, оставить provider disabled.

### 3.1 Telegram Bot API smoke и provider incident

**Current status:** `blocked`. Deployed preview и baseline `c5712d0` используют
`TELEGRAM_PROVIDER=disabled`; local candidate реализует `bot_api`, token/config
wiring, durable `delivery_unknown` и operator actions, но не имеет immutable
clean-clone/target-pinned preview evidence. No application Telegram send is
authorized by this runbook.

**Prerequisites for a future preview smoke:** PR-F12 local conformance passed;
approved bot owner and exact bureau test/approved chat; separately authorized
one-message preview send; synthetic event only; public auth and unrelated
providers remain disabled; operator can inspect the destination without copying
chat content to evidence. Historical Telegram `pending|retry` count must be
reviewed first and remain outside a new canonical UTC `TELEGRAM_ACTIVATION_AT`;
any unresolved unknown/dead row or eligible historical backlog is a stop.

**Реализованная boundary (внешне не выполнялась):** ignored
`wrangler.preview.toml`, protected `imports/telegram-preview-target.json` и
отдельный `imports/telegram-preview-deployment-evidence.json` связывают exact
preview Worker/account/D1/origin, fail-closed flags, `bot_api` settings,
`TELEGRAM_ACTIVATION_AT`, resulting clean Git SHA и observed deployed Worker
version. Deployment observer и manifest reviewer обязаны различаться; observation
не старше 24 часов. Оба JSON остаются ignored, не могут быть symlink и должны
иметь owner-only POSIX mode либо Windows ACL без Everyone/Authenticated Users/
Users allow. Manifest хранит только HMAC-SHA-256 chat/bot bindings; ключ
`TELEGRAM_TARGET_BINDING_KEY`, bot token и exact chat остаются environment-only.

Read-only target/preflight sequence после отдельных разрешений:

Independent deployment observer получает exact deployed Worker version из
read-only Cloudflare dashboard/API evidence после отдельно разрешённого deploy и
создаёт `imports/telegram-preview-deployment-evidence.json` с exact keys
`schemaVersion,purpose,accountId,workerName,workerVersionId,candidateGitCommitSha,observedAt,observedBy`.
Внешнее наблюдение остаётся независимой ручной сверкой, а local writer только
валидирует и записывает уже наблюдённые значения: observer через утверждённый
protected environment injection задаёт `APP_ENV=preview`,
`TELEGRAM_DEPLOYMENT_ACCOUNT_ID`, `TELEGRAM_DEPLOYMENT_WORKER_NAME`,
`TELEGRAM_DEPLOYMENT_WORKER_VERSION_ID`, `TELEGRAM_DEPLOYMENT_GIT_SHA`,
`TELEGRAM_DEPLOYMENT_OBSERVED_AT`, `TELEGRAM_DEPLOYMENT_OBSERVED_BY`, затем
выполняет команду без identifiers в argv:

```powershell
npm run telegram:deployment-evidence:create -- --environment preview --confirmation WRITE_PROTECTED_DEPLOYMENT_EVIDENCE
```

Writer не обращается к Cloudflare и не превращает operator input в доказательство
remote truth: source остаётся read-only Cloudflare dashboard/API, а реальный
external evidence gate закрывается только независимым наблюдением. Reviewer
(другой человек) через protected environment injection задаёт `APP_ENV=preview`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_CHAT_TYPE`,
`TELEGRAM_TARGET_BINDING_KEY`, `TELEGRAM_TARGET_REVIEWED_AT` и
`TELEGRAM_TARGET_REVIEWED_BY`, затем создаёт manifest без identifiers/secrets в
argv или output:

```powershell
npm run telegram:target:create -- --environment preview --config wrangler.preview.toml --deployment-evidence imports/telegram-preview-deployment-evidence.json --manifest imports/telegram-preview-target.json --confirmation WRITE_PROTECTED_TARGET_MANIFEST
```

Оба writer используют `flag=wx` (не перезаписывают существующий artifact), POSIX
mode 0600 и затем тот же ACL/path/symlink validator. На Windows writer сам
отключает inheritance, назначает текущий SID owner, оставляет единственное
`FullControl` allow rule для этого SID и fail-closed проверяет
`rulesProtected`/owner/rules. Артефакты удаляются после evidence capture через
утверждённую local secure-delete/retention procedure; Git/release scan их не
подхватывает. Writer никогда не перезаписывает stale artifact: его удаление и
повторное создание требуют отдельного retention/secure-delete шага. Exact chat,
token, binding key и infrastructure/observer/reviewer identifiers не входят в
argv/output; chat/token/key также не входят в JSON.

```powershell
npm run telegram:smoke:target -- --environment preview --config wrangler.preview.toml --target-manifest imports/telegram-preview-target.json --deployment-evidence imports/telegram-preview-deployment-evidence.json --confirmation TARGET_MANIFEST_READ_ONLY
npm run telegram:preflight -- --environment preview --config wrangler.preview.toml --target-manifest imports/telegram-preview-target.json --deployment-evidence imports/telegram-preview-deployment-evidence.json --confirm-preview-secrets PREVIEW_SECRETS_ONLY --confirm-read-only PREFLIGHT_READ_ONLY
```

Target command требует clean worktree и exact manifest Git SHA; preflight вызывает
только `getMe|getChat|getChatMember|getWebhookInfo`, не `sendMessage`. Safe output
содержит только derived fingerprint и boolean checks. `APP_ENV=preview`, token,
exact chat/type и binding key передаются только через protected environment.

Separately authorized normal one-row lifecycle использует один UUID cohort и
три remote D1/provider phases; `<TARGET_FINGERPRINT>` берётся из target output.
Abort ниже является отдельной no-send альтернативой, а не четвёртой provider
phase:

```powershell
npm run telegram:smoke:prepare -- --environment preview --config wrangler.preview.toml --target-manifest imports/telegram-preview-target.json --deployment-evidence imports/telegram-preview-deployment-evidence.json --cohort <UUID_V4> --confirmation TELEGRAM_PREVIEW_SMOKE_PREPARE_ONE_<TARGET_FINGERPRINT>_<UUID_V4>
npm run telegram:smoke:run -- --environment preview --config wrangler.preview.toml --target-manifest imports/telegram-preview-target.json --deployment-evidence imports/telegram-preview-deployment-evidence.json --cohort <UUID_V4> --confirmation TELEGRAM_PREVIEW_SMOKE_SEND_ONE_<TARGET_FINGERPRINT>_<UUID_V4>
npm run telegram:smoke:verify -- --environment preview --config wrangler.preview.toml --target-manifest imports/telegram-preview-target.json --deployment-evidence imports/telegram-preview-deployment-evidence.json --cohort <UUID_V4> --confirmation SMOKE_VERIFY_READ_ONLY
```

`prepare` — отдельная remote D1 mutation: она fail-closed при любом active/dead/
unresolved Telegram backlog и создаёт одну PII-free row с `max_attempts=1`,
disarmed far-future `not_before`; ordinary drain её не claim-ит. `run` — отдельная
provider-send authorization: после fresh successful preflight exact-row CAS без
eligible-pending окна сразу переводит cohort в `processing`, затем существующий
`TelegramOutboxWorker` выполняет normal dispatch. Concurrent second run row не
получает. `verify` только читает D1. Direct Bot API calls из curl/dashboard и
manual text sends не являются evidence. Cloudflare token нужен remote D1 phases;
Telegram secrets — только preflight/run. Эти команды здесь не запускались.

Если после `prepare` send permission отозвана, target изменился либо `run`
остановился до dispatch marker, cohort обязательно закрывается отдельной D1-only
командой без Telegram secret/preflight/provider call:

```powershell
npm run telegram:smoke:abort -- --environment preview --config wrangler.preview.toml --target-manifest imports/telegram-preview-target.json --deployment-evidence imports/telegram-preview-deployment-evidence.json --cohort <UUID_V4> --confirmation TELEGRAM_PREVIEW_SMOKE_ABORT_UNSENT_ONE_<TARGET_FINGERPRINT>_<UUID_V4>
```

Abort разрешён только exact target-bound synthetic `pending` row либо partial
`processing` claim с нулём `telegram_delivery_attempts`; одним D1 batch он
добавляет append-only authorization, переводит row в `cancelled` и фиксирует
assertion. Ordinary cron не reclaim-ит smoke signature, включая stale partial
claim. После любого dispatch attempt либо для `sent|dead|delivery_unknown|
cancelled` abort fail closed. Неоднозначный D1 результат сначала сверяется
read-only `telegram:smoke:verify`; повторять send/abort вслепую нельзя.
Успешный safe outcome: `state=cancelled`, `attemptCount=0`,
`providerRequestIdPresent=false`; такой row больше не блокирует новый cohort.

Поле claim proof `provider_send_disabled=1` означает только, что preparation/
authorization batch сам не вызывал provider. Оно не отключает последующий
normal-worker dispatch после exact `SEND_ONE` confirmation.

Если `run` завершился уже после durable `dispatch_started`, но до terminal
evidence, его нельзя повторять и abort уже неприменим. Дождаться expiry exact
claim lease; до expiry reconcile возвращает
`TELEGRAM_SMOKE_RECONCILE_LEASE_ACTIVE`. Затем выполнить отдельную D1-only
команду с Cloudflare D1 token, но без Telegram secrets/preflight/provider path:

```powershell
npm run telegram:smoke:reconcile -- --environment preview --config wrangler.preview.toml --target-manifest imports/telegram-preview-target.json --deployment-evidence imports/telegram-preview-deployment-evidence.json --cohort <UUID_V4> --confirmation TELEGRAM_PREVIEW_SMOKE_RECONCILE_EXPIRED_NO_SEND_<TARGET_FINGERPRINT>_<UUID_V4>
```

Reconcile принимает только exact target/cohort, `processing`, один matching
`dispatch_started` attempt, immutable target/reviewer/activation/request-hash-
bound claim authorization + assertion, no abort proof/provider request ID и
expired lease. Wrong/absent proof возвращает
`TELEGRAM_SMOKE_RECONCILE_PROOF_INVALID`. Команда сама ничего не отправляет и не
retry-ит: guarded D1 writes переводят attempt/outbox в `delivery_unknown`,
увеличивают attempts `0 → 1`, очищают lease и возвращают
`state=delivery_unknown`, `attemptCount=1`,
`providerRequestIdPresent=false`, `requiresManualResolution=true`. Partial/
ambiguous D1 write сверяется read-back, а повтор уже reconciled cohort
идемпотентен. После этого используется только exact-attempt audited operator
resolution; повторять `run`/abort или делать direct SQL нельзя.

**Expected safe result:** exactly one real `sendMessage` attempt containing only
category, synthetic reference, event time and authenticated admin link. Its
actual result is either `sent` with one provider message ID/reference and no
duplicate, or `delivery_unknown` with safe operator visibility and no retry; the
runbook не требует намеренно создавать второй ambiguous external send. Local
fake-provider tests отдельно доказывают uncertain-response handling and не
закрывают external smoke. One unknown/retry/dead stops the drain, а unresolved
unknown или terminal dead блокирует sole bureau lane. A modeled valid-`ok=false`
`429` creates durable cooldown at computed `nextAttemptAt` even without usable
`retry_after`; a second/new row cannot send before its deadline.

**Verification/evidence:** environment, immutable Worker/config fingerprints,
UTC timestamps, safe row/message references, delivery/unknown counts, operator
role and audit action only. Never copy bot token, exact chat ID, client/child
data, message body or provider diagnostic. Verify `migrate_to_chat_id` is treated
as permanent config drift and no auto-reroute occurred.

**Stop condition:** any client/PII/free-text row, wrong/unknown destination,
inbound bot workflow, secret/body in logs, duplicate delivery, unknown row
auto-retry, provider flag change outside approved deploy or absent audit action.

**Rollback/recovery:** keep/return `TELEGRAM_PROVIDER=disabled` through the
approved config/deploy procedure; preserve unknown rows; revoke/rotate token on
compromise; correct destination only through reviewed config. `confirm_sent`,
`retry_after_review` and `cancel` are separate audited decisions after the
operator checks the approved chat. Prepared unsent smoke cohort закрывать только
`telegram:smoke:abort` по ограничениям выше; post-marker expired cohort — только
`telegram:smoke:reconcile`, не generic cancel/direct SQL.

## 4. Ручная проверка quarantined document

Production upload сейчас `feature_disabled`. Раздельные
`R2_QUARANTINE`/`R2_ARCHIVE`, local tests и private preview EU wiring evidence
уже есть, но процедура применяется только после production/restore resource
evidence, approved training, controlled AV passage, legal/provider approval и
полного release gate.

**Prerequisites:** active admin с purpose; выделенная локальная quarantine-папка
внутри утверждённого encrypted workspace; актуальные утверждённые AV definitions;
никакого cloud sync/public scanner; document status `quarantined`.

**Точное UI/команда:** на `<PORTAL_ORIGIN>/admin/requests` использовать forced
download для одной записи. Сохранить файл в выделенную папку, не открывать его.
Для Microsoft Defender допустима команда:

```powershell
Start-MpScan -ScanType CustomScan -ScanPath <ABSOLUTE_QUARANTINE_FILE_OR_DIRECTORY>
```

После завершения в форме этой же записи заполнить `outcome` (`clean` или
`infected`), `scannerLabel`, `scannerVersion`, подтвердить versioned attestation
с показанным short SHA-256 и отправить действие.

**Ожидаемый безопасный результат:** download принудительный, не inline; scan
относится к тому же hash; audit сохраняет admin ID, hash, scanner label/version,
attestation text version и timestamp без filename/body.

**Проверка:** short hash в UI совпадает с downloaded artifact; status становится
`clean` только при clean result или `infected` при alert. `clean` ещё не означает
business approval.

**Stop condition:** файл открылся inline, hash изменился, AV definitions/stamp
неизвестны, scanner недоступен, download не был audited, документ предлагают
передать VirusTotal/public scanner, результат сомнителен.

**Rollback/recovery:** выбрать `infected` при подтверждённом alert либо прекратить
процесс без attestation и запросить re-upload/review. Локальную копию удалить
только утверждённой secure-workspace procedure; runbook не даёт destructive
команд.

## 5. Выполнить отдельный business review документа

**Prerequisites:** status `clean`; тот же document version/hash; reviewer имеет
business purpose и не подменяет AV attestation.

**Точное UI:** `/admin/requests`, форма document review: поле `decision`
`approve|reject`, безопасное поле `reason`, checkbox confirmation.

**Ожидаемый безопасный результат:** approve копирует/перемещает artifact только в
private `R2_ARCHIVE`, фиксирует audit и делает quarantine copy eligible для
cleanup; reject не создаёт archive object.

**Проверка:** status одной записи изменён; owner access остаётся object-scoped;
archive не появляется в ordinary admin search.

**Stop condition:** используется единый bucket, clean attestation относится к
другому hash, reason требует записать PII/body, archive public или business
содержание нельзя подтвердить.

**Rollback/recovery:** выбрать reject/request re-upload; ошибочный approve считать
security/privacy incident и не удалять evidence вручную.

## 6. Проверить quarantine cleanup

**Prerequisites:** scheduled job и operations page реализованы и локально
протестированы; exact schedule/batch limit подтверждены; alert threshold и
delivery утверждены; remote R2 buckets доказанно разделены.

**Точная команда/UI:** `<PORTAL_ORIGIN>/admin/operations`, выбрать
`jobName=document_quarantine`, оставить generated hidden `idempotencyKey`,
установить `confirmation=confirmed` и отправить `?/run`. Не запускать service
method напрямую из ad-hoc script.

**Ожидаемый безопасный результат:** удаляются только non-approved objects при
`now >= uploaded_at + 14×24h` и approved quarantine copies после успешного
archive handoff; duplicate run идемпотентен; approved archive не затронут.

**Проверка:** operations history показывает только safe counts
`claimed/deleted`. Отдельных `retry/failed` и oldest-age counters текущая
реализация не выводит; их отсутствие оставляет backlog/alert gate `blocked`.
Ни filename, ни owner data не выводятся.

**Stop condition:** раннее удаление, archive/quarantine не разделены, growing
`delete_pending`, stale claim, ручной запуск неаудируем или schedule неизвестен.

**Rollback/recovery:** отключить cleanup trigger; не удалять R2 objects вручную.
Разобрать failed set по opaque IDs после backup/evidence preservation.

## 7. Проверить Browser quota и contract rendering

Production contract send сейчас `feature_disabled`.

**Prerequisites:** Browser binding и approved templates/legal profiles; remote
conformance passed; budget/alert inputs утверждены.

**Точная UI:** `/admin/contracts`. `/admin/operations` показывает scheduled job
runs, но не Browser quota/render metrics. Отдельной безопасной CLI/manual-render
команды нет, поэтому Browser production gate остаётся `blocked`.

**Ожидаемый безопасный результат:** quota/budget не исчерпаны; rendering errors
не создают send без immutable PDF; glyph/font/long-name/pagination tests passed.

**Проверка:** safe counts/duration/error code; PDF body и client content не
попадают в logs/evidence.

**Stop condition:** metrics отсутствуют, renderer disabled, template/legal gate
не passed, quota exhaustion или partial artifact.

**Rollback/recovery:** оставить `CONTRACT_SEND_ENABLED=false` и renderer disabled;
не применять manual PDF workaround к production договору.

## 8. Безопасный block/session incident и family correction

**Prerequisites:** active admin, reason/confirmation, exact target по internal
ID; least-privilege approval. Назначение второго admin и отдельный session-only
revoke path не реализованы.

**Точное UI:** `/admin/users/<user-id>`; доступны только audited block/unblock
(`?/setBlocked`) и отдельный high-friction family correction. Blocking отзывает
sessions; role assignment и initial bootstrap через этот экран отсутствуют.

**Ожидаемый безопасный результат:** изменён один target; при blocking его
sessions отозваны; audit не содержит PII. Создать/recover admin этим шагом нельзя.

**Проверка:** target больше не имеет старого доступа; другой пользователь и
последний recovery admin не затронуты; повтор безопасно отклоняется/дедуплицируется.

**Stop condition:** target определяется email из ticket, действие оставляет
сессию active, остаётся ноль recovery admins, требуется direct SQL или audit
отсутствует.

**Rollback/recovery:** использовать audited unblock либо отдельную correction
action. `npm run admin:bootstrap` — одноразовый initial-bootstrap, а не last-admin
recovery: после успешного запуска или automatic seal при migration `0014` его
control consumed и не reset/replay. Если active admin не осталось, отдельной
recovery CLI нет; это `blocked` incident с security escalation и решением о
restore/recovery, без direct SQL.

## 9. Manual run scheduled job

**Prerequisites:** конкретный job enabled; normal scheduler остановлен или manual
delivery доказанно deduped; batch limit/lease/freshness известны; operator имеет
RBAC.

**Точная UI:** `<PORTAL_ORIGIN>/admin/operations`; поле `jobName` выбирается из
девяти allowlisted IDs, hidden `idempotencyKey` генерируется сервером, checkbox
`confirmation` должен иметь value `confirmed`, submit отправляет `?/run`.
Отдельного preview-count и reason field сейчас нет; если они обязательны для
конкретного опасного run, остановиться и обновить implementation/runbook.

**Ожидаемый безопасный результат:** один bounded batch, unique run ID, audit и
sanitized counts; concurrent Cron не создаёт duplicate side effects.

**Проверка:** last attempt/success/failure обновлены; lease освобождён; backlog
движется ожидаемо.

**Stop condition:** current typecheck/test failed, job ID/schedule неизвестен,
для опасной операции нужен отсутствующий preview/reason, stale lease, provider
disabled или manual action неаудируема. Local scheduler, D1 и route-security
tests проходят, но production action сейчас `blocked` из-за отсутствующих remote
authenticated manual/dedupe/failure и job-specific alert evidence. Preview
automatic Cron и aggregate alert уже подтверждены.

**Rollback/recovery:** не повторять вслепую. Отключить affected trigger/feature по
change procedure, дождаться lease expiry только если это подтверждено design, и
эскалировать.

## 10. Secret rotation и credential compromise

**Prerequisites:** incident/change approval; owner provider; список affected
Worker/environment/secret names без values; новый credential создан в provider
по approved policy.

**Команда для каждого реализованного secret:**

```powershell
npx wrangler secret put <SECRET_NAME> --config <TARGET_CONFIG>
```

**Ожидаемый безопасный результат:** новый value передан интерактивно; old
credential отозван provider-side; affected sessions/tokens revoked, если это
требует threat model; feature возвращается только после smoke.

Для Telegram сначала установить `TELEGRAM_PROVIDER=disabled` approved change,
затем revoke old bot token через BotFather/provider owner, выпустить отдельный
environment token и интерактивно обновить `TELEGRAM_BOT_TOKEN`. Protected
signed-decimal `TELEGRAM_CHAT_ID` и `TELEGRAM_CHAT_TYPE` перепроверяются отдельно;
`TELEGRAM_BOT_API_TIMEOUT_MS` должен оставаться в range 1000..30000 и ниже
outbox lease. `migrate_to_chat_id` не является поводом молча принять новый chat.
Feature возвращается только после separately approved synthetic smoke и review
всех `delivery_unknown` rows.

**Проверка:** safe authentication/sending smoke в разрешённой среде; logs не
содержат old/new values.

**Stop condition:** target Worker неизвестен, secret попал в shell history/log,
невозможно отозвать old credential, provider contract не approved.

**Rollback/recovery:** немедленно отключить affected feature, revoke оба
сомнительных credential, повторить rotation из clean terminal. JWT/session
incident требует массового session revoke; точная stage-13 recovery automation
ещё должна быть проверена.

## 11. Dependency и access review

**Prerequisites:** clean clone; lockfile immutable; есть security/operations owner.

**Команды:**

```powershell
npm run release:verify
```

`release:verify` реализован и последовательно запускает `check`, полный Vitest,
Playwright E2E, build, `npm audit --omit=dev`, `docs:check` и `release:scan`.
Immutable `200268f` прошёл production-only и full audit с `0 advisories`, clean
install и полный `release:verify`; история remediation документирована в
[DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md). После новых local changes нужен
новый immutable run; environment gates остаются отдельными.

**Ожидаемый безопасный результат:** advisory triage обновлён; runtime high/critical
не остаётся без обязательного исправления; roles, provider accounts и access
owners актуальны.

**Проверка:** sanitized summary, commit SHA и дата в checklist; не копировать
package registry token или полный account roster.

**Stop condition:** unresolved mandatory advisory, orphan admin/provider access,
unexpected lockfile diff, missing release scripts.

**Rollback/recovery:** не deploy; исправить/ограничить feature, revoke orphan
access и повторить полный preflight.

## Инциденты

| Severity | Пример                                                                                       | Первое безопасное действие                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| S1       | cross-user document/contract access, exposed secret/PII, corrupted active data               | отключить affected path, revoke credential/session, сохранить sanitized evidence, немедленная security/privacy escalation            |
| S2       | missed Cron, growing dead/`delivery_unknown` outbox, quarantine, provider/Browser exhaustion | оставить external path disabled, запретить blind retry/auto-reroute, остановить trigger при риске side effect, operations escalation |
| S3       | единичная retriable operation без data/security impact                                       | bounded retry по verified UI, наблюдать freshness                                                                                    |

### Универсальная процедура инцидента

**Prerequisites:** безопасно определены environment и affected path.

**Точное действие:** выставить конкретный fail-closed flag/provider value только
через approved config/deploy procedure; прямой универсальной emergency command
пока нет. Записать sanitized incident reference.

**Ожидаемый безопасный результат:** новые опасные действия прекращены; evidence
сохранено; unaffected paths не меняются.

**Проверка:** negative smoke affected route, session/provider revocation,
monitoring signal стабилен.

**Stop condition:** containment требует удаления evidence/data, изменения
официального сайта или неизвестного config. Эскалировать, не импровизировать.

**Rollback/recovery:** восстановить функцию только после root-cause fix, clean
verification, restore/rollback decision и отдельного enable approval.

## Обновление runbook

После изменения migrations, bindings, secrets names, feature flags, provider
adapter, scheduled job, monitoring signal или admin UI этот документ и
checklist обновляются в том же change. Реализованные `docs:check`, `release:scan`
и `release:verify` обязательны для release evidence, но не заменяют ручной
review, authenticated manual/failure/provider smoke, production-resource checks,
job-specific alert или restore rehearsal. Preview Worker/D1/private EU R2,
automatic Cron и aggregate alert уже подтверждены; пока оставшиеся manual/
provider/job-specific/production-resource/restore/approval gates не закрыты,
а exact-target legacy import/first-import restore и Telegram Bot API unknown-
delivery/operator smoke также не закрыты, production verdict — **NO-GO**.

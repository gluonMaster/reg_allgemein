# Ежедневная эксплуатация и реагирование

<!-- stage-13-current-review-status: pending_independent_review -->

Ревизия: 2026-09-02.

Это стабильный operations/incident runbook, а не current Stage-13 state.
Candidate, deployed version, pending migration, feature state и next action
читать только в
[STAGE_13_ACTIVE_STATE.md](../implementation/STAGE_13_ACTIVE_STATE.md).
Production verdict — **NO-GO** до отдельного production ledger.

Runbook относится только к самостоятельному порталу регистрации. Он не даёт
доступа к CMS или runtime официального сайта. Production-команды выполняются
только пользователем с нужной ролью и только в рамках отдельного change/incident
approval. Historical measurements/status below are evidence snapshots, not
commands to repeat.

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

## Operational surface inventory (stable, not current state)

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
| Telegram provider     | real `bot_api` adapter, durable certainty/cooldown/activation policy and audited exact-attempt actions are implemented                                                    | target ownership, target-pinned preflight, operator drill and authorized synthetic send smoke                                           | `feature_disabled`/`blocked` |
| Legacy import         | exact-target atomic bundle boundary, versioned parsers and synthetic fixtures are implemented                                                                           | production source-owner approval, restricted real-source lifecycle and production recovery evidence                                      | `blocked`                    |
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

Migrations and runtime implement two cadence classes, bounded/indexed health and
operator reads, job/storage repositories, Worker scheduled handlers,
`/admin/operations`, an empty 204/503 health signal and separate R2 bindings.
Exact applied/pending migrations and live Worker shape are never inferred from
this runbook; read them only from active state. A forward migration may be
applied before its compatible Worker only when active state explicitly records
that compatibility, the old Worker cannot corrupt the new schema, and the
separate deploy request follows without resuming polling.

Remote manual/dedupe/failure, R2 failure, authenticated operations and
job-specific alert rehearsals remain environment gates; their absence does not
justify repeating an already gated runtime suite.

## Карта потребителей D1 и regression budgets

Ниже — recurring cost budget для fixed-cadence runtime shape после migration
`0026`. Exact release anchor находится только в active state. Значения
получены из фактических local-D1 `meta.rows_read`/`meta.rows_written`; D1 включает
работу secondary indexes в эти counters. Test meter не сохраняет SQL params или
result rows. Числа являются budgets, а не разрешением расходовать общий Free
limit аккаунта (`5M reads`/`100k writes` за UTC-сутки).

| Потребитель                                         |                               Частота | Запросы и measured cost                                                                                             | Почему операция нужна                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------: | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fast Cron, providers enabled, empty queues          |                             1,440/day | 14 queries, 33 reads, 6 writes/tick                                                                                 | atomic cadence dedupe/start/finish; email/Telegram bounded prepare/claim; per-job lease/fence защищает от concurrent manual run                                                   |
| Fast Cron, providers disabled                       |                             1,440/day | 8 queries, 14 reads, 4 writes/tick                                                                                  | email — inert, поэтому нет job lease; Telegram сохраняет только bounded stale-marker reconcile, boolean unknown/dead signal и свой lease, но не вызывает provider                 |
| Maintenance Cron, R2 bindings present, empty portal |                                96/day | 35 queries, 72 reads, 17 writes/tick                                                                                | одна cadence row start/finish, семь job lease acquire/release и один advancing price watermark; due/outbox/expiry/R2-intent probes bounded `LIMIT ≤100` и используют seek indexes |
| Operations health                                   | внешний `HEAD` раз в 5 минут, 288/day | empty window: 2 queries, 3 reads, 0 writes/probe; saturated 16-bucket window: 2/18/0; при global stop — 0/0/0 и `503` | читает только две cadence rows и indexed 15-minute error-window; independent monitor не создаёт quota-polling writes                                                             |
| Application 5xx bucket                              |     только при реальном 5xx, не timer | первые три ошибки одной минуты: 3 queries, 2 reads, 4 writes; четвёртая: 1/1/0                                      | существующий PII-free alert signal; counter saturates на 3, поэтому error storm не создаёт поток D1 writes                                                                        |
| Admin operations page                               |                только ручное открытие | cadence 1 query/2 reads; manual history 1 query/1 read при одной row                                                | текущий Cron берётся из fixed state; обычная history использует partial manual-only index и не читает retained scheduled history                                                  |
| `latest-job-status.sql`                             |    только один явно нужный checkpoint | 1 query, 2 reads, 0 writes                                                                                          | компактный postcondition двух cadence; не применять для частого quota polling                                                                                                     |
| Non-empty Telegram queue                            |            только когда есть due work | три сообщения в одном fast cadence: 37 queries, 131 reads, 36 writes; один retry 10/39/10; unknown outcome 10/38/10 | claim/fence, durable dispatch marker, append-only attempt, terminal certainty и no-blind-retry являются обязательными writes                                                      |

Fast outbox подготовка выполняется один раз на drain, а не перед каждой строкой.
Unchanged Telegram activation/policy UPSERT даёт 0 writes. Email invalid-row и
Telegram stale-marker maintenance имеют bounded batch; unknown/dead проверяются
через `EXISTS`, а не полным `COUNT`. Maintenance empty-queue reads остаются
необходимыми due probes; mutation происходит только для lease/cadence и price
watermark либо при фактической работе.

Старая scheduled execution создавала и завершала per-job ledger row, затрагивая
table, primary/unique и два secondary indexes; вместе с lease это локально давало
13 `rows_written` на один пустой job. Новый cadence update не имеет secondary
index, а `operation_locks_expiry` удалён: ни один запрос не ищет lock только по
expiry. Unique `(scope, resource_key)` и монотонный fence сохранены. Partial
manual-history index исключает старые/rollback scheduled rows. Новые partial
expiry/enrollment indexes добавляют write только при фактическом изменении
соответствующей domain row; они не переписываются на empty tick и нужны, чтобы
bounded cleanup/reconciler не сканировали растущие таблицы. Existing transition/
append-only triggers сохранены; оптимизация не ослабляет audit или state guards.

Import, migration/index build, isolated restore и recovery — разовые операции,
не часть daily projection. Их cost измеряется отдельно перед каждой разрешённой
фазой; dormant heavy import projection остаётся backlog и не запускается ради
preview registration. Retained history не удаляется, старые operational scripts
с window snapshots остаются заблокированы.

### Before/after за 24 часа

| Контур                                                                   |                                                     Reads/day | Writes/day | Примечание                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------: | ---------: | ---------------------------------------------------------------------------- |
| Historical unbounded-health incident shape                                  | 783,068 за 10 calls; около 22.55M/day при 5-minute projection |          0 | history-wide query; projection показывает риск, а не billing total           |
| Старые operator snapshots                                                |                                         5,187,297 за 11 calls |          0 | разовые, но unbounded; остановлены                                           |
| Intermediate pre-fixed-cadence shape, providers/storage disabled            |                                                        31,872 |     46,176 | Cron 27,552/46,176 + fixed health 4,320/0; ещё append-ил per-job runs        |
| Новый candidate, тот же inert shape                                      |                                                        25,728 |      6,816 | Cron 24,864/6,816 + fixed-cadence health 864/0; writes −85.2% like-for-like  |
| Новый candidate, preview shape (providers disabled, R2 bindings present) |                                                        27,936 |      7,392 | Cron 27,072/7,392 + health 864/0                                             |
| Новый candidate, все services active, empty queues                       |                                                        55,296 |     10,272 | Cron 54,432/10,272 + health 864/0                                            |
| Active shape + три recorded 5xx каждую минуту                            |                                                        62,496 |     16,032 | measured saturated-window ceiling; последующие ошибки той же минуты не пишут |

Regression gates: fast `≤40 reads/≤10 writes`, maintenance `≤80/≤20`, scheduled
day `≤100k/≤15k`; вместе с 5-minute health и error buckets `≤100k reads/≤20k
writes`. Это оставляет значительный запас до shared Free quota, но не резервирует
её для портала: фактический account-wide расход контролируется Cloudflare D1
Analytics/Query Insights без SQL к самой базе.

## Cost-bounded preview migration/deploy procedure

Exact migration, candidate, deployed rollback version and permission are read
only from active state. This procedure never authorizes a remote mutation.

1. **Preflight:** confirm protected preview target, recovery/Time Travel
   containment, exact pending migration set and quota availability without heavy
   SQL/health polling. Any production/CMS target or drift is a stop.
2. **Migration action:** under its own permission apply only the current forward
   migration. Perform one bounded ledger/schema/FK postcondition, update active
   state and make a docs-only checkpoint. `failed|ambiguous` means stop and
   read-only reconciliation; no blind retry.
3. **Worker action:** under a separate permission deploy only the reviewed
   candidate named in active state. Verify version/traffic and Access without D1,
   then wait for one fast and one maintenance cadence and execute one bounded
   health/cadence postcondition. Do not poll.
4. **Success:** reviewed version active, Access unchanged, fixed cadence fresh,
   automatic historical ledger no longer grows, and measured projection remains
   inside recorded budgets. Only then request separate registration permission.
5. **Rollback/containment:** use only the pre-recorded compatible Worker version.
   Forward migration is not removed/re-written. Because an old Worker may be
   schema-compatible but not cost-compatible, rollback is brief: keep auth and
   affected providers closed, stop health/SQL polling and prefer a forward fix.

Migration alone does not bound the old Worker. Plan migration checkpoint and the
separately authorized deploy in one supervised window; if the next permission is
not available, preserve containment instead of resuming diagnostic polling.

## 1. Начало смены: health и freshness

**Prerequisites:** target environment и Worker version известны; для деталей
есть read-only operator/admin access; incident log защищён. Для active alert
должны быть отдельно утверждены независимый monitor account, recipient и owner.

**Точная команда/UI:** сначала проверить обезличенный endpoint:

```powershell
$portalOriginForMonitoring = '<PORTAL_ORIGIN>'
curl.exe --silent --show-error --output NUL --write-out "%{http_code}" "$portalOriginForMonitoring/_health/operations"
```

`204` означает: fast cadence не старше 180 секунд, maintenance cadence не старше
1200 секунд, ни одна cadence не остаётся `running` дольше 360 секунд и за
последние 900 секунд меньше трёх scheduled job failures/skipped locks плюс
application 5xx. Cadence завершается только после terminal результата всей exact
job group; `feature_disabled` job допустим в свежем successful delivery, но не
означает готовность функции. Global scheduled stop даёт `503` до D1. Любая
D1/query/clock проблема также даёт empty `503`; response не содержит reason, job
name, error code, PII или secret.

**D1 incident snapshot 2026-09-02:** прежний deployed runtime выполнял
unbounded history scan при freshness query. До исправления не поллить health и не повторять прежние
operator snapshots с `row_number()` по всей `scheduled_job_runs` для диагностики.
Read-only запрос тоже расходует daily rows_read; при quota warning читать
Cloudflare Metrics/Query Insights, не SQL console. Сначала локально измерить
`meta.rows_read` на накопленной истории и проверить indexed latest-job lookup.
Не удалять историю и не отключать Cron вслепую; `SCHEDULED_JOBS_ENABLED=false`
сам по себе не прекращает lease/run writes. Подробности и protected evidence находятся в
[append-only handoff](../implementation/handoffs/stage-13.md); active state
содержит только текущий containment/route.

Fixed-cadence runtime использует ровно две `scheduled_cadence_state` rows;
automatic Cron больше не дописывает `scheduled_job_runs`. Для operator summary использовать
[latest-job-status.sql](../../scripts/sql/latest-job-status.sql), а не window
functions по всей таблице. Regression с 20,000 завершёнными историческими runs
измеряет `meta.rows_read`: health — 3, cadence summary — 2, routine manual history
— 1 при одной manual row. Это local evidence. Любой live Worker со старой shape сохраняет дорогой запрос
и per-job writes до отдельно разрешённых migration/deploy phases; фактическую
live shape проверять только по active state.

Для деталей открыть `<PORTAL_ORIGIN>/admin/operations`: страница показывает две
current cadence cards и recent manual `job_name`, `status`, start/finish, safe
result и safe error code. Retained automatic history обычная страница не читает.
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
утверждённому recipient; обе cadence rows имеют свежий terminal result и exact
job-group summary, repeated safe error, stale lease и growing backlog отсутствуют.
Automatic per-job terminal rows после `0026` намеренно не создаются; manual runs
по-прежнему попадают в отдельный audited ledger.

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
permission. Candidate migrations `0016`–`0022` применены в deployed preview,
но ни один remote plan/stage/review/promote/rollback transition не выполнялся;
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

**Gate:** Telegram остаётся `feature_disabled|blocked`, пока active state не
зафиксирует exact deployed runtime, target ownership, target-pinned preflight,
operator drill и отдельно разрешённый synthetic one-message smoke. Никакая
application Telegram send не авторизуется этим runbook.

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

Production upload остаётся `feature_disabled`, но по `REQ-11` рабочий preview
обязан фактически пройти эту процедуру на синтетическом файле через реальные
раздельные preview `R2_QUARANTINE`/`R2_ARCHIVE`. Training/legal/provider approval
являются production gates и не откладывают контролируемый preview rehearsal.

**Prerequisites:** active admin с purpose; выделенная локальная quarantine-папка
внутри утверждённого encrypted workspace; актуальные утверждённые AV definitions;
никакого cloud sync/public scanner; document status `quarantined`. Для preview:
`APP_ENV=preview`, Access protection, `DOCUMENT_UPLOAD_ENABLED=true`, verified
synthetic parent и файл без PII.

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

Production contract send остаётся `feature_disabled`. Ниже описан обязательный
`preview_review` rehearsal; он не выдаёт production approval.

**Prerequisites:** Access-protected preview; verified synthetic parent и active
admin; Browser/private archive bindings; Resend key; SHA-256 адреса только
контролируемых test recipients в `PREVIEW_EMAIL_RECIPIENT_HASHES`;
`CONTRACT_SEND_ENABLED=true`, `CONTRACT_PREVIEW_REVIEW_ENABLED=true`,
`CONTRACT_RENDERER=browser_run`; active state подтверждает deployed reviewed
runtime, exact required migration ledger and separate permission for this
provider/storage phase. Complete exact-version render bundle, D1 storage intent,
atomic R2 create-if-absent, exact D1 install assertion and populated-upgrade
regression должны быть частью inherited candidate evidence. Реальные клиенты и
Office/PII запрещены.

**Точное UI:** `/admin/contracts`. Сначала один active admin нажимает «Vier
Preview-Prüfvorlagen bereitstellen»; создаются четыре immutable
`preview-review-v1` bundle в private R2 и D1. Затем для synthetic owner/child
создаются четыре offer вида `group_yearly|group_monthly|individual_hourly|
nachhilfe_hourly` с `previewReviewMarker=synthetic-no-pii`. Кнопка render/send
вызывает Browser Run и штатный email outbox. Родитель открывает offer из кабинета,
скачивает PDF и для одного offer выполняет acceptance; другой active admin
выполняет formation/activation. Родитель и admin отдельно скачивают offer PDF и
formation certificate.

**Ожидаемый безопасный результат:** все четыре письма имеют тему/текст
`TEST/ENTWURF`, содержат именно hash-verified PDF attachment, а каждая страница
PDF — watermark `TEST/ENTWURF — nicht für reale Vertragsbeziehungen`. Static
provider/register/contact, общие и kind-specific clauses, цена/оплата,
Widerrufsinformation и Muster-Widerrufsformular визуально проверяются на
фактическом output. Для платного договора кнопка явно сообщает платежное
обязательство; funded Nachhilfe использует отдельную неплатёжную кнопку.

**Проверка:** D1 template scope/basis ровно `preview_review/internal_preview_review`;
offer artifact size/SHA совпадают с R2 и email attachment; outbox `sent` содержит
только provider request ID; offer acceptance actor отличается по роли от
formation admin; certificate ready и оба download audit существуют. Evidence
хранит только opaque IDs, hashes, statuses, timestamps и safe error codes — без
email, имени, адреса или PDF body.

**Stop condition:** любой адрес вне allowlist, отсутствующий marker/watermark,
R2/hash/source-version mismatch, неизвестная template version/fallback,
conflicting/partial template installation или ложный install audit, письмо без
attachment, renderer disabled, quota exhaustion, partial artifact, реальный
клиент/PII либо попытка использовать preview template в production. Любая
preview draft/number/D1 mutation в production или при выключенном preview flag
также немедленно останавливает gate.

**Rollback/recovery:** вернуть `CONTRACT_PREVIEW_REVIEW_ENABLED=false`,
`CONTRACT_SEND_ENABLED=false`, `CONTRACT_RENDERER=disabled`, сохранить D1/R2/
outbox evidence и разбирать ошибку по opaque IDs. Не перерендеривать уже принятый
offer и не применять manual PDF workaround к production договору.

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

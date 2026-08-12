# Ежедневная эксплуатация и реагирование

Статус документа: `blocked`; текущий production verdict — **NO-GO**. Scheduled
handler и manual operations реализованы и локально протестированы; независимый
content cold-read 2026-07-22 прошёл. Preview Worker/D1/R2, automatic Cron
delivery/freshness и независимый 5-minute HEAD alert с DOWN→UP delivery
подтверждены 2026-08-11; remote manual/provider/failure и restore procedures
остаются непроверенными.

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

| Область               | Реализованный интерфейс                                                                                            | Недостающее                                              | Gate                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ---------------------------- |
| Import review         | `/admin/imports`, `/admin/imports/<run-id>`                                                                        | remote import/recovery rehearsal                         | `blocked`                    |
| Outbox review         | `/admin/outbox`, retry/cancel; local scheduler tests + preview automatic Cron passed                               | production providers, dead alert/manual failure rehearsal | `feature_disabled`/`blocked` |
| Document review       | `/admin/requests`, AV/business review; separate preview EU R2 bindings и cleanup verified                          | remote R2 failure/restore alert, approved training       | `feature_disabled`/`blocked` |
| Price maintenance     | `/admin/price-reviews` и `/admin/operations` manual/Cron run; local tests                                          | remote manual/failure rehearsal и job-specific alert     | `blocked`                    |
| Privacy operations    | `/admin/privacy` и `/admin/operations` cleanup run; local D1/R2 + preview automatic cleanup verified              | remote R2 failure/retry rehearsal and job-specific alert | `blocked`                    |
| Health/cron dashboard | `/admin/operations` + empty `/_health/operations` 204/503 signal; preview external HEAD monitor delivery passed | authenticated admin/manual/failure rehearsal              | `blocked`                    |
| Scheduled operations  | `src/worker.ts`, two triggers, nine allowlisted jobs; preview automatic delivery/freshness passed                  | remote manual/dedupe/failure и job-specific alerts       | `blocked`                    |
| Admin bootstrap       | `npm run admin:bootstrap`; target guard, one-shot D1 flow, session revoke/audit и upgrade auto-seal tested locally | remote exercise; отдельной post-consume recovery CLI нет | `blocked`                    |

## Scheduled jobs inventory

Cloudflare [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
исполняют expressions в UTC. Это не локальная/provider
timezone: `Europe/Berlin` применяется только внутри Telegram business-hours
calculation и покрыт DST-тестами. Локальные scheduler/route tests, preview
automatic delivery/freshness и aggregate external HEAD alert проходят, но
job-specific backlog/dead/provider alerts и remote manual/failure rehearsals
отсутствуют, поэтому ни один job ниже не имеет production `passed`.

| Назначение                       | Реализованный service method                                   | Schedule/timezone                         | Dedupe/lock                          | Manual run / signal                               | Статус                                 |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------- | ------------------------------------ | ------------------------------------------------- | -------------------------------------- |
| Email outbox drain               | `EmailOutboxWorker.dispatchNext()`                             | `* * * * *` UTC                           | job lock/dedupe + outbox lease/retry | `/admin/operations`; oldest-pending alert missing | `blocked`; provider `feature_disabled` |
| Telegram outbox drain            | Telegram dispatch worker                                       | `* * * * *`; business rules Europe/Berlin | job lock/dedupe + outbox lease/retry | `/admin/operations`; dead alert missing           | `blocked`; provider `feature_disabled` |
| Price-review maintenance         | `PriceReviewService.runScheduledMaintenance()`                 | `*/15 * * * *` UTC                        | job lock/dedupe + repository guards  | `/admin/operations`; freshness alert missing      | `blocked`                              |
| Quarantine cleanup               | `DocumentService.cleanupExpired()`                             | `*/15 * * * *`; 14×24h threshold UTC      | job lock + conditional object claim  | `/admin/operations`; backlog alert missing        | `blocked`; uploads `feature_disabled`  |
| Expired funding authorizations   | `IndividualRequestAdminService.processExpiredAuthorizations()` | `*/15 * * * *` UTC                        | job lock/dedupe + repository guards  | `/admin/operations`; freshness alert missing      | `blocked`                              |
| Expired email reservations       | `AuthService.cleanupExpiredEmailReservations()`                | `*/15 * * * *` UTC                        | job lock/dedupe + repository guards  | `/admin/operations`; freshness alert missing      | `blocked`                              |
| Expired privacy exports/R2 retry | `PrivacyService.cleanupExpiredExports()`                       | `*/15 * * * *` UTC                        | job lock/dedupe + object state       | `/admin/operations`; failure alert missing        | `blocked`                              |
| Expired security metadata        | `OperationsRepository.cleanupSecurityMetadata()`               | `*/15 * * * *`; UTC expiry timestamps     | job lock/dedupe + bounded batch      | `/admin/operations`; freshness alert missing      | `blocked`                              |
| Orphan storage intents           | `StorageIntentRepository`                                      | `*/15 * * * *`; UTC lease/age             | job lock + intent lease/dedupe       | `/admin/operations`; R2 retry alert missing       | `blocked`                              |

Migrations `0014_production_operations.sql` и `0015_worker_monitoring.sql`,
clean/upgrade coverage, job/storage repositories, Worker scheduled handler,
triggers, `/admin/operations`, empty 204/503 health signal и раздельные R2
bindings реализованы и проходят targeted local tests. Preview Cron delivery и
freshness, monitoring migration/smoke и independent aggregate HEAD alert
delivery/recovery подтверждены. R2 restore, authenticated manual run и
job-specific failure rehearsal остаются `blocked`.

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

**Точное UI:** открыть `<PORTAL_ORIGIN>/admin/imports`; выбрать безопасный status
filter; открыть `/admin/imports/<run-id>`. Не вставлять source row в комментарий.
Для local диагностики:

```powershell
npm run import:status:local -- --limit <SAFE_LIMIT>
```

**Ожидаемый безопасный результат:** видны safe counts, hashes, dependency state и
issue codes; нет необъяснённых failed/promoting run или stale current snapshot.

**Проверка:** current promoted price/schedule/access/plusbtext версии согласованы
по academic period; fatal/error issue запрещает promotion/registration enable.

**Stop condition:** failed promotion, dependency mismatch, PII в issue output,
0/multiple current snapshot, unavailable/stale legacy snapshot.

**Rollback/recovery:** выключить public registration; не править D1 вручную.
Local rehearsal rollback:

```powershell
npm run import:rollback:local -- --source-kind <price|schedule|plusbtext|access> --academic-period <PERIOD_CODE> --to-version <VERSION_ID>
```

Remote import/rollback command отсутствует; production recovery `blocked` до его
реализации и rehearsal.

## 3. Проверить outbox retry/dead

**Prerequisites:** active admin; provider path и его gate известны; реальная
отправка отдельно разрешена.

**Точное UI:** `<PORTAL_ORIGIN>/admin/outbox`; поля filter `channel` и `status`.
Для строки `dead` доступно действие `outboxAction=retry`; для `pending|retry` —
`outboxAction=cancel`; для обоих действий установить обязательное
`confirmation=confirmed`. Поля `reason` в этой форме нет.

**Ожидаемый безопасный результат:** retry/cancel создаёт audit-safe transition;
dedupe сохраняется; message body и recipient не появляются в evidence.

**Проверка:** обновить страницу и убедиться, что изменена одна выбранная запись;
после разрешённого dispatch status движется по documented state machine.

**Stop condition:** provider `disabled`, массовый dead backlog, повтор создаёт
duplicate send, неизвестный recipient scope, нет scheduled drain/alert или нужен
просмотр body вне authorized UI.

**Rollback/recovery:** при provider incident оставить provider disabled; cancel
только доказанно небезопасные pending items после обязательного confirmation;
поля причины у действия cancel нет. Не включать real provider ради очистки
backlog. Эскалировать owner provider и сохранить sanitized counts/error code.

## 4. Ручная проверка quarantined document

Production upload сейчас `feature_disabled`. Раздельные
`R2_QUARANTINE`/`R2_ARCHIVE` и их local tests уже есть, но процедура применяется
только после private remote EU wiring evidence, approved training и полного
release gate.

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
preview/Cron и alert evidence.

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
Текущий production dependency audit показывает `0 vulnerabilities`. Три high
advisory полного audit ограничены dev-only Wrangler/Miniflare/Sharp tooling и
документированы в [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md); полный release
gate всё равно не passed без immutable run и environment evidence.

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

| Severity | Пример                                                                         | Первое безопасное действие                                                                                                |
| -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| S1       | cross-user document/contract access, exposed secret/PII, corrupted active data | отключить affected path, revoke credential/session, сохранить sanitized evidence, немедленная security/privacy escalation |
| S2       | missed Cron, growing dead outbox/quarantine, provider/Browser exhaustion       | оставить external path disabled, остановить trigger при риске side effect, operations escalation                          |
| S3       | единичная retriable operation без data/security impact                         | bounded retry по verified UI, наблюдать freshness                                                                         |

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
review, remote preview/Cron/R2 checks, alert rehearsal или restore rehearsal.
Пока remote preview/Cron/R2, alerts, restore и approval gates не закрыты,
production verdict — **NO-GO**.

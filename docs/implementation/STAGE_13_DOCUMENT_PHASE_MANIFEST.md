# Stage 13: bounded document phase manifest

Подготовлен 2026-09-05 по Prompt 07. Это фиксированный план одной фазы, а не
второй current-state ledger. Разрешения, текущая версия и единственное следующее
действие находятся в [active state](STAGE_13_ACTIVE_STATE.md).

## Scope и канонический contract

Источники: `SYS-04`, `REQ-11` в [MVP](../spec/MVP_SPEC.md), `OQ-036` в
[решениях](../spec/OPEN_QUESTIONS.md), [storage/upload security](../operations/STORAGE_AND_UPLOAD_SECURITY.md),
[manual preview](../operations/FULL_MANUAL_PREVIEW.md), runbook sections
[4–6](../operations/OPERATIONS_RUNBOOK.md#4-ручная-проверка-quarantined-document),
[roadmap Stage 13](ROADMAP.md#13-независимый-hardening-и-production-readiness).

Prompt 07 разрешает read-only/local preparation. Он прямо требует отдельное
разрешение на config/deploy и отдельное разрешение на перечисленный ниже
document scenario. Текущая подготовка не авторизует ни один из этих writes.

Один D0 проходит положительный quarantine → local AV → business approval →
archive → owner/cross-owner download flow. Полный `REQ-11` дополнительно требует
отдельный rejected artifact и фактический idempotent cleanup non-approved
artifact по 14×24h. Один approved D0 не доказывает эти outcomes. Они остаются
незакрытыми до отдельного ограниченного сценария; backdating, изменение TTL,
повторная запись D0 и прямой SQL не заменяют этот gate.

## Exact target: snapshot read-only подготовки

Полные identifiers, origin, version и config находятся только в защищённой
Git-ignored папке `tmp/document-phase-07-owner/`. Перед разрешённым write
сверить fingerprint и exact значения с `control.json` и `config-plan-final.json`.

| Target | SHA-256 fingerprint, первые 12 hex | Проверенный результат |
| --- | --- | --- |
| Account | `5dbd04a4763a` | Dedicated preview account target |
| Worker | `242c1796e930` | Тот же deployed bundle; 100% одной версии |
| Origin host | `88ed782ba25a` | Anonymous GET → 302 Cloudflare Access; body не читался |
| D1 | `ccdeb22bb2a1` | Scoped SELECT-only; 16 reads, 0 writes, changed_db=false |
| R2_QUARANTINE | `442dca1871ce` | EU Standard, r2.dev disabled, custom domains 0 |
| R2_ARCHIVE | `3996cebdabb0` | Другой bucket, EU Standard, r2.dev disabled, custom domains 0 |

Remote snapshot: `2026-09-05T17:37:27.347Z`. Exact module, settings, bindings,
Cron и deployment совпали с final 06B evidence. Нового authenticated request,
login/logout, provider send, D1/R2 write или deploy не было. R2 object bodies
не читались и bucket-wide object listing не выполнялся; baseline D1 documents,
funding authorizations и storage intents равны нулю. Это не утверждение о
полном inventory всех объектов bucket.

## Единственное config change для отдельного approval

`DOCUMENT_UPLOAD_ENABLED = "false"` → `"true"` только в pinned preview.
Все прочие vars/bindings/secrets, Access, provider allowlist, routes, assets,
limits и Cron сохраняются. Production upload остаётся закрыт собственным gate.

| Document setting | Значение snapshot и proposed config |
| --- | --- |
| Max file bytes | 10485760 |
| Max files per authorization | 5 |
| Max aggregate bytes | 26214400 |
| Upload rate limit | 5 / 60 seconds |
| AV attestation text version | `preview-manual-av-2026-08-10` |
| Scheduled jobs | enabled; existing cleanup lifecycle сохраняется |

Использовать `config-plan-final.json`: strict Wrangler deploy exact detached
reviewed source и существующего build. Локальный `--dry-run` прошёл, module
SHA-256 byte-identical; исходная ignored config checkout восстановлена,
root config не менялась. Не делать build/deploy текущего HEAD. Первичный
`config-proposal.json` с PATCH — superseded, не исполнять: в истории 06B этот
метод получил подтверждённый provider rejection, затем сработал strict deploy.

Перед dispatch: свежий exact version/settings/target comparison, EU/private R2,
Access, сохранённый compatible rollback version. После одной попытки: remote
version/100% traffic, exact module digest, единственный flag diff, остальные
settings и resources; bounded D1 session/business/provider deltas = 0.
Затем active-state docs-only commit до следующего remote action.

Rollback, если разрешён вместе с config change: после read-only reconciliation
вернуть ровно сохранённую prior version на 100% только при отсутствии чужого
drift; проверить postcondition и checkpoint. Если причина/результат неясны,
сохранить Access и evidence, остановить сценарий. Не повторять deploy вслепую.
Выключение upload не отключает admin download/review и existing cleanup jobs;
поэтому containment включает прекращение authenticated document commands,
а не предположение о полном выключении document surface.

## Identities и synthetic input

| Alias | Проверено | Роль в плане |
| --- | --- | --- |
| A / прежний slot 1 | Active verified admin, session version 2 | Forced download, AV attestation, отдельный business review |
| P1 / прежний slot 2 | Active verified parent, session version 1 | Чужой parent для реального D0 denial |
| P2 / added 06B parent | Active verified parent, session version 1 | Owner нового QD/FD/D0, уже владеет C2 |
| C2 | Current portal child P2 | Используется без изменения child fields |
| Q2 | Individual/self-pay draft v1 | Сохраняется как evidence 06B; не подходит для funding upload |

У всех трёх identities nonrevoked sessions = 0. Credentials вводит владелец
приватно. Известные IDs берутся из `database.json`, без email lookup/dump.

Prerequisite scenario: P2 через `/requests/new?/create` создаёт ровно один QD
`nachhilfe/jobcenter` draft для C2. Repository атомарно создаёт FD v1
`pending_review`, audit и assertion; submit, funding approval и provider send
не нужны. `request-draft-proposal.json` прошёл canonical request schema.

D0 уже создан локально из synthetic-only drawing, без Office/upstream inputs:
PNG, 900×650, `image/png`, 16954 bytes. SHA-256:
`827fbc61bdd6ec453cccdbf2a80f1b1aa036069ca246182ebf4e86659afffd81`.
Файл и `fixture-contract.json` остаются в protected ignored folder. Он имеет
test marking и только synthetic scenario fields; содержимое не выводится в
transcript и не загружается в inline viewer. Canonical `validateUpload` принял
exact bytes/type/size/hash. Это не AV scan и не business approval.

Перед настоящей загрузкой повторно сверить immutable local SHA. После forced
download владелец сохраняет те же bytes в выделенную quarantine-папку
утверждённого encrypted workspace без cloud sync, не открывает файл и сам
запускает актуальный approved AV. Эти workstation prerequisites и реальный
результат пока не подтверждены; до clean attestation они обязательны.
В чат достаточно product, engine/definitions version, scan time UTC и
`clean|detected`; SHA сверяется локально, body/logs/screenshots с содержимым
не нужны. `detected`, неизвестная freshness или несовпадение hash останавливают
approval. Не придумывать scanner result из локальной format validation.

## Отдельно согласуемый конечный scenario

Каждый numbered action — одна application command либо read-only observation.
Login/logout, authenticated GET с session touch, audited download и rejected
POST также требуют own postcondition/checkpoint перед следующей mutation.
Автоматический redirect после login/create надо либо остановить, либо заранее
включить ровно один target GET в command и проверить его session effect.
Не выполнять скрытых refresh/poll/retry между checkpoint commits.

| ID | Операция | Один bounded postcondition / containment |
| --- | --- | --- |
| D01a | Один normal P2 login, без follow redirect | Одна session P2; другие sessions/roles сохранены |
| D01b | GET `/requests/new?kind=nachhilfe` | Server-owned C2, commandKey/CSRF; только допустимый session touch |
| D02 | POST `/requests/new?/create`, prepared QD payload + CSRF | Ровно QD draft v1 + FD pending_review v1 + связанный audit/assertion; Q2 без diff |
| D03 | GET QD upload form | Server-owned FD/C2, свежие commandKey/CSRF; только допустимый session touch |
| D04 | POST `/requests/{QD}?/upload`, FD + D0 + новый idempotency key | Один D0 quarantined, random `quarantine/UUID`, exact size/type/SHA, owner P2/C2/FD, upload audit, linked quarantine intent/assertion; archive link отсутствует |
| D05 | P2 GET `/requests/documents/{D0}/download` до approval | 404 DOCUMENT_NOT_FOUND, body не выдан, document/intent/audit успеха не меняются |
| D06 | Normal P2 logout | Именно session D01a revoked + один связанный logout audit |
| D07a | Один normal A login, без follow redirect | Только одна новая session A |
| D07b | GET `/admin/requests` document queue | D0 виден в admin queue; body не читается; session touch сверяется |
| D08 | A POST `?/documentReview`, approve до AV, valid CSRF | 409, D0 остаётся quarantined, нет archive intent/object/review-success evidence |
| D09 | A POST `/admin/requests/documents/{D0}/download`, CSRF, purpose=local_av_scan | Attachment/octet-stream/no-store/nosniff/sandbox; exact local bytes/SHA; D1 download actor A/hash/audit связаны с D0 |
| D10 | Владелец лично выполняет local AV scan | Product/version/freshness/time и clean для exact D0; remote mutation отсутствует; иначе stop |
| D11 | После реального clean A отправляет один намеренно неверный SHA в `?/documentAttestation` | 409, status/attestation/archive не меняются; expected negative не означает реальный byte mismatch |
| D12 | A POST `?/documentAttestation` с настоящим SHA, scanner fields, version, confirmation, новым key | D0 clean, одна immutable clean attestation A → download A → exact SHA; business decision ещё отсутствует |
| D13 | После отдельной business inspection A POST `?/documentReview`, approve, safe test reason, confirmation, новый key | Approved + exact archive bytes/hash/size под random `archive/funding/UUID`, linked archive intent/assertion, review actor/audit; quarantine handoff проверен |
| D14 | Normal A logout | Именно session D07a revoked + один logout audit |
| D15a | Один normal P2 login, без follow redirect | Одна новая owner session P2 |
| D15b | Approved GET download D0 | Attachment 200, exact D0 SHA/size; owner P2 и отдельный approved-download audit |
| D16 | Normal P2 logout | Именно session D15a revoked; archive evidence сохранено |
| D17a | Один normal P1 login, без follow redirect | Одна новая foreign-parent session P1 |
| D17b | GET download существующего D0 | 404 DOCUMENT_NOT_FOUND, bytes не выданы, ни document success audit, ни archive/domain diff |
| D18a | Normal P1 logout | Именно session D17a revoked + один logout audit |
| D18b | Final bounded reconciliation | Все новые sessions revoked; один approved D0; Q2/C2/roles/receipts сохранены; результат и containment зафиксированы |

Вызов D13 уже включает archive put, D1 link и штатную попытку удалить quarantine
copy. Не выполнять отдельный direct R2 copy/delete. После D13 нормальный
результат — quarantine object отсутствует и delete_state=deleted; если archive
точно linked, а quarantine delete остался pending, сохранить known containment
и сверить следующий штатный cleanup. Не выдавать это за завершённый cleanup.
Manual `document_quarantine` run не включён автоматически: при необходимости
он требует заранее ограниченного approval через `/admin/operations?/run`.

Для business reject вместо D13 нужен зафиксированный выбор владельца; D0
становится rejected без archive, и positive archive/owner flow не считается
пройденным. Никакого фиктивного approve, смены результата задним числом или
второго документа без собственного scope.

## Evidence, stop и cleanup/recovery

На каждом шаге хранить safe observation и protected exact IDs: candidate/version,
request ID, actor/owner relation, status/hash/size/type, opaque random-key check,
object existence, intent/assertion/audit linkage. Object-body read допустим
только у разрешённого download/checksum operation; в отчёте только hash/size.
Для R2 existence использовать официальный metadata list с `prefix` равным
полному exact key и `per_page=2`. Принимать только 0 либо 1 result, без cursor
или явного truncation; для существующего object требовать точное равенство key,
size и custom SHA. Optional отсутствие `result_info` допустимо по API contract.
Bucket-wide listing и unaudited body download запрещены. Два absence probes
прошли с 200/empty result; positive metadata будет проверена на настоящем D0.
REST object HEAD вернул 405 в обоих buckets и исключён из процедуры. Первый
локальный parser ошибочно требовал optional `result_info`; сохранённый 200/empty
ответ переиспользован после сверки официальной схемы, remote write не было.
Bucket lifecycle содержит только multipart-abort rules, не object-delete rule;
bucket locks отсутствуют. Полные ответы остаются в protected evidence.

Реальное изменение bytes/hash, wrong owner/admin, successful direct approval
без AV, cross-owner read или mixed/ambiguous R2/D1 — немедленный stop.
Запланированные invalid-input probes D08/D11 считаются PASS только при rejection
и unchanged domain evidence. Непредвиденная ошибка не авторизует blind retry.

После каждой попытки mutation: exact read-only reconcile → active state
`success|failed|ambiguous` с UTC/scope/fingerprints/before-after/evidence/
containment и ровно одним next action → `docs:check`, `release:scan`,
`git diff --check` → отдельный docs-only commit. После этого возможен следующий
уже разрешённый action. Phase/session boundary обновляет handoff.

Approved archive сохраняется; автоматическое его удаление запрещено. TTL
quarantine = uploaded_at + 14×24h; download/attestation срок не меняют. При
неоднозначном put/link preserve intent/object, сначала authoritative D1
reconciliation; unreferenced staged intent обслуживает штатный grace/lease
reconciler. Local downloaded copy удаляется владельцем только по утверждённой
workspace procedure. Принятие этого retention/containment intent должно входить
в отдельное scenario approval; destructive cleanup сейчас не выполнялся.

## Validation и ограничения результата

Production paths не меняются: только документация и ignored local preparation.
Выполнены scoped remote inventory, canonical fixture/request validation и
strict deploy dry-run. Полный test/E2E/build и новый independent review не
нужны: exact inherited baseline и scoped bootstrap review перечислены в active
state, а document/runtime/migration/dependency/config live diff отсутствует.
Новых доказанных candidate P0/P1 не найдено; feature/fixture prerequisites
перечислены явно. `full-manual-preview`, `REQ-11` и production остаются blocked.

Cloudflare references для подготовки: [EU bucket metadata](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/get/),
[managed public domain state](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/managed/methods/list/),
[custom public domain state](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/custom/methods/list/),
[bounded object metadata list](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/list/).
Приватность подтверждена metadata ответами этих exact-target GET, не одной
локальной декларацией binding.

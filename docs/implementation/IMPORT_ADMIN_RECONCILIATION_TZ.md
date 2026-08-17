# Техническое задание: админский контур сверки повторных импортов

Статус: обязательный Stage-13 scope, реализация отсутствует. Актуально на
2026-08-17. Нормативное требование — `IMPORT-08`, критерии —
`AC-IMPORT-27`–`AC-IMPORT-31`.

## 1. Цель

Access и PlusBText остаются штатными read-only upstream-источниками, поэтому
после каждого нового периода или исправления оператором будут появляться
повторные import issues. Администратор должен получать не список из сотен
неструктурированных предупреждений, а устойчивые cases, сгруппированные по
причине и сущности, с понятным допустимым действием и автоматической проверкой
результата на следующем immutable import.

Контур не изменяет Access/Office-файлы, immutable source snapshot или staging
rows. Он либо применяет уже разрешённую portal-side typed correction, либо
фиксирует `awaiting_upstream` и ждёт подтверждающий reimport.

## 2. Подтверждённые правила источника

- Package blocks worksheet: `AK–AO` (`Value37–Value41`) и `AP–AT`
  (`Value42–Value46`). Group slots — только первые четыре: `AK–AN` и `AP–AS`.
  `AO/Value41` и `AT/Value46` — служебные ячейки; любое содержимое игнорируется
  как услуга, но сохраняется в source snapshot.
- Текущая unresolved source group из `OQ-035` не получает fuzzy или global
  mapping. Подтверждённое exact исправление конкретной записи должно быть
  внесено оператором в Access; case остаётся `awaiting_upstream`, пока новый
  import не докажет исчезновение проблемы.
- Invalid email не участвует в automatic claim. Valid portal login email сам по
  себе не исправляет legacy family; linking требует существующего typed family
  correction proof.
- Invalid/missing birth date не создаёт legacy child/enrollment. Portal date не
  переписывает upstream и требует отдельной подтверждённой reconciliation.
- Duplicate child/group считается один раз для occupancy, пока отдельность услуг
  не доказана typed решением.

## 3. Что уже есть и чего не хватает

Есть:

- `/admin/imports/[runId]` показывает safe issue context;
- `/admin/catalog` умеет exact course mapping с audit и применяет mapping к
  текущим enrollment rows;
- `/admin/legacy` и review queue имеют family/claim correction actions;
- D1 хранит immutable import runs, source versions и audit events.

Не хватает:

- stable case между несколькими import runs;
- typed outcome, связанного с фактической коррекцией;
- `awaiting_upstream -> resolved_by_reimport`;
- assignment, фильтров и безопасных однотипных batch actions;
- typed duplicate, duration и price workflows;
- запрета generic `resolve/dismiss` для actionable codes;
- автоматического reopen/supersede и release-gate summary.

До реализации generic issue decision не является доказательством исправления и
не должен закрывать blocking/actionable class.

## 4. D1-модель

Реализовать новой append-only migration
`0019_legacy_import_reconciliation.sql`. Номер является планом и должен быть
перепроверен перед созданием; уже применённые migrations не менять.

### `legacy_reconciliation_cases`

Обязательные поля:

- opaque `id`;
- `academic_period_id`, `source_kind`, safe stable `source_identity_digest`;
- `issue_code`, `issue_class`, `entity_type`, optional opaque `entity_id`;
- `first_import_run_id`, `last_seen_import_run_id`, `last_seen_version_id`;
- `state`: `open|assigned|awaiting_upstream|ready_to_verify|resolved|superseded`;
- `resolution_kind`, `resolved_import_run_id`, `superseded_by_case_id`;
- `assigned_to`, `created_at`, `updated_at`, `resolved_at`, integer `version`.

Unique active identity: period + source kind + stable source digest + issue code.
Raw name, email, phone, address, birth date, group label и source row JSON в
таблицу case не записываются.

### `legacy_reconciliation_decisions`

Append-only typed decision:

- case/version, action, reason code, actor, timestamp;
- idempotency/request hash;
- target type и opaque target ID, когда применимо;
- import/version evidence digests;
- safe structured metadata allowlist без free-form PII.

### Assertions и audit

Каждая state mutation выполняется одним D1 batch с decision, audit event и
terminal assertion. D1 triggers запрещают update/delete evidence, invalid state
transition, stale version, actor mismatch и generic closure actionable case.

## 5. Reconciliation при новом импорте

После validation и до promotion gate строится PII-free issue manifest.

1. Та же stable identity + issue code присутствует снова: case остаётся open/
   assigned/awaiting_upstream, обновляется только `last_seen_*`, history
   append-only.
2. Case был `ready_to_verify`, но issue остался: case возвращается в `open`,
   создаётся failed-verification decision; portal-side correction не принимается
   как успешная автоматически.
3. Issue исчез после upstream action: case закрывается только
   `resolved_by_reimport` с exact prior/current run и version evidence.
4. Source identity изменилась так, что старый case неприменим: старый получает
   `superseded`, новый создаётся отдельно; silent merge запрещён.
5. New blocking case удерживает promote/registration enable. Aggregate verify
   выводит только counts по class/state и opaque evidence ID.

## 6. Typed actions по классам

| Класс                          | Разрешённые действия                                                                              | Запрещено                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Course/group mapping           | открыть existing catalog tool; выбрать exact target; либо `awaiting_upstream`                     | fuzzy/substring/day-insensitive mapping, свободный target label |
| Parent/family/contact identity | открыть authorized family correction; либо upstream correction                                    | менять immutable source snapshot, auto-merge по похожему имени  |
| Invalid email                  | upstream correction или verified portal identity + однозначный audited family link                | automatic claim по invalid legacy email                         |
| Invalid/missing birth date     | upstream correction или отдельная typed child reconciliation после valid portal input             | импортировать нераспознанное значение как дату                  |
| Price/duration                 | upstream Access/PlusBText correction; позднее — только versioned period/service-bound override    | generic dismiss или неограниченная special price                |
| Duplicate child/group          | `same_service_duplicate` либо `distinct_service_proven` с distinct stable service/course evidence | двойной occupancy без доказательства                            |
| Family/identity conflict       | assignment + entity detail + typed correction/upstream                                            | показывать PII в queue/export/audit                             |
| Value48/source consistency     | только upstream correction + reimport                                                             | portal-side подмена source ID                                   |

Batch action разрешена только для одного `issue_code`, одного action/reason и
совместимой state/version cohort. Identity, duplicate и course-target decisions
по умолчанию individual; массовое exact mapping требует отдельной confirmation с
preview counts.

## 7. Admin UI

Добавить `/admin/import-reconciliation`:

- summary cards по issue class/state/period, без PII;
- filters: period, source, class, state, assignee, first/last seen run;
- assignment/unassignment с optimistic version;
- case detail с safe timeline и ссылкой в существующий authorized entity tool;
- typed action form с reason code и точным expected effect;
- `awaiting_upstream` view с printable/exportable PII-free operator checklist;
- compare previous/current import aggregates и `resolved_by_reimport` evidence;
- blocking banner для promote/registration gate.

List/export не показывает source label, client name, email, phone, address или
birth date. Полные данные доступны только через существующую server-authorized
entity detail и не копируются в reconciliation audit.

## 8. Security и reliability

- Current admin RBAC, session revalidation и CSRF обязательны для каждого POST.
- Every mutation checks case `version`, exact actor, action allowlist and
  idempotency key; stale/concurrent submit returns conflict.
- Free-form operator text не входит в audit JSON или public evidence. При
  необходимости заметка хранится отдельно по privacy/retention policy.
- `resolved`, `superseded`, decisions, assertions и audit append-only.
- No Office/Access write, no VBA, no source upload в Worker, no PII in logs.
- Failed/abandoned cases не удаляются без отдельной retention policy; current
  queue может скрывать terminal state, но evidence сохраняется.

## 9. Automated evidence

Минимальный новый suite `T-IMPORT-RECONCILIATION`:

- migration fresh + populated upgrade, FK/check/append-only triggers;
- same issue across two runs gives one case; disappearance closes only by exact
  reimport evidence; persistence/reappearance keeps or reopens it;
- actionable generic resolve/dismiss rejected at repository and route boundary;
- RBAC, CSRF, inactive admin, stale version, idempotent replay and two-admin race;
- exact mapping accepted, fuzzy/mismatched mapping rejected;
- duplicate defaults to one occupancy; `distinct_service_proven` requires exact
  evidence;
- invalid email/DOB never creates automatic claim/child;
- batch rejects mixed code/action/version;
- list/export/audit/error snapshots pass PII canary/redaction tests;
- unresolved blocking cases make release verify non-zero; resolved-by-reimport
  produces only safe aggregate evidence.

## 10. Acceptance и rollout

1. Local migration/repository/route/UI tests pass.
2. Synthetic baseline/candidate import proves open → awaiting upstream →
   resolved-by-reimport and duplicate/mapping flows without PII.
3. Independent admin cold-read validates wording and operator ergonomics.
4. Authorized isolated preview migration and synthetic rehearsal are separate
   external changes.
5. Only after preview evidence may routine current-source production import use
   this queue; real PII is not copied into ordinary preview.

Until steps 1–4 are complete, PR-B17 remains `blocked` and current import issues
must not be bulk-dismissed.

## 11. Готовый implementation prompt

> Реализуй `IMPORT-08` и `AC-IMPORT-27`–`AC-IMPORT-31` строго по
> `docs/implementation/IMPORT_ADMIN_RECONCILIATION_TZ.md`. Сначала прочитай
> canonical import, admin, privacy, readiness и handoff документы. Создай только
> новую append-only migration после актуального номера; не переписывай
> применённые migrations. Запрети generic closure actionable import issues на
> server/D1 boundary. Реализуй durable cross-import cases, typed decisions,
> audit/assertions, exact mapping/upstream/duplicate/family flows и PII-minimized
> admin UI. Покрой RBAC, CSRF, stale/concurrent submit, idempotency, reimport
> reconciliation, release-gate и redaction tests. Не читай Office через
> Access/Excel/COM/LibreOffice, не исполняй VBA, не выводи PII и не выполняй
> remote migration/import/deploy без отдельного разрешения. Сохраняй общий
> production NO-GO до внешних preview, restore, legal/provider и production
> gates.

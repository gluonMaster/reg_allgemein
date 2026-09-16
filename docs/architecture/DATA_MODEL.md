# Целевая модель данных D1

Ограниченный `trial-intake` добавляет собственные request/child/item и email-store
records по [TRIAL_INTAKE](../domain/TRIAL_INTAKE.md) и
[плану модели](../implementation/TRIAL_INTAKE_RELEASE_TZ.md).
Они не являются `users`, canonical `children` или `trial_requests`; ordinary
family/ownership invariants ниже не заменяются гостевыми идентификаторами.
Репозиторий/сервисы этой модели изолированы в `src/lib/trial-intake/` по TIN-11;
схема добавлена append-only миграцией `0027_trial_intake.sql`:

- `trial_intake_requests`: контакты, state, content-bound idempotency, версия
  privacy text, scoped verification hash/nonces, timestamps и retention deadline;
- `trial_intake_children`, `trial_intake_items`, `trial_intake_item_children`:
  дети, неизменяемый snapshot занятия/желаемая дата, назначения; composite FK
  запрещают связать ребёнка и занятие разных заявок;
- `trial_intake_email_outbox`: гостевые задания с request/version, без фиктивных
  users; existing EmailOutboxWorker работает через intake store adapter;
- `trial_intake_telegram_payloads`: удаляемые тела частей нового template.
  Immutable existing Telegram ledger хранит только opaque `payloadId`,
  request reference и delivery metadata. После TTL payload удаляется каскадом.

Создание использует одну D1 batch и JSON `INSERT … SELECT` с постоянным числом
SQL queries при максимуме назначений. Verification и постановка всех частей
уведомления также атомарны. Cleanup сначала reconciles истёкшие delivery leases,
отменяет unsent jobs и удаляет PII; live processing блокирует удаление. Новая
миграция добавляет узкий audited retention переход Telegram pending/retry →
cancelled, сохраняя остальные transition guards. Retry после удаления payload
запрещён; разрешён existing audited cancel/confirm_sent для unknown ledger.

Ревизия: 2026-08-20.

Документ задает логическую модель и обязательные инварианты. Конкретные SQL-
миграции создаются поэтапно и могут добавлять технические поля, но не должны
ослаблять эти ограничения.

## Общие соглашения

- ID — opaque UUID/ULID/text, если не указано, что это upstream ID.
- Деньги — integer cents, `currency = EUR`.
- Timestamp — UTC ISO-8601; business date — `YYYY-MM-DD` в `Europe/Berlin`.
- Raw токены не хранятся, только криптографические hashes.
- JSON допустим для immutable snapshot/raw evidence, но не заменяет поля,
  участвующие в фильтрации, уникальности и переходах статусов.
- Все mutable таблицы имеют `created_at`, `updated_at`; soft-retired/deleted
  сущности — соответствующий timestamp и actor/reason.
- Retained evidence имеет или связывает `retention_class`,
  `retention_started_on`, nullable informational `retain_until`, `legal_hold`,
  basis/actor. Automatic legal-archive purge выключен; эти поля сами не создают
  ни delete job, ни правовое основание хранения.

## Identity и доступ

### `users`

- `id`, `email`, `email_normalized`, `password_hash`;
- `pending_email`, `pending_email_normalized`, `pending_email_expires_at`,
  `email_version`;
- `email_verified_at`, `role`, `is_blocked`;
- `account_status` (`active|deletion_requested|closed`), `closed_at`;
- `first_name`, `last_name`, `first_name_normalized`, `last_name_normalized`,
  `phone`, `preferred_language`;
- `family_number_id` nullable для unverified/non-parent,
  `family_assignment_status` (`pending_verification|assigned|review_required`),
  `family_version`, `family_assignment_import_run_id` nullable;
- `privacy_notice_version`, `privacy_accepted_at`;
- `session_version`, `created_at`, `updated_at`.

`UNIQUE(email_normalized)` и partial unique для непустого
`pending_email_normalized`. При запросе смены транзакция проверяет, что target не
занят ни current, ни неистекшим pending email другого user. Регистрация и
подтверждение выполняют ту же cross-field проверку; confirmation меняет current
email только conditional transaction. `role` — только `parent|admin`.
Для verified active parent `family_number_id` обязателен и указывает ровно на
одну current assigned allocation. Первый successful verification атомарно
назначает eligible legacy namespace 1 либо новый namespace 2 и увеличивает
`family_version`; повтор finalization возвращает то же назначение. Admin account
без parent cabinet family не требует.
Family finalization хранит `family_assignment_import_run_id`/snapshot version, по которому
был выполнен lookup. Отсутствие current promoted snapshot либо смена current
version во время transaction откатывает verification/finalization целиком и не
выделяет namespace 2 по ошибке.
Approved closure отзывает sessions/tokens, очищает contact/profile и заменяет
email identity непереиспользуемым non-contact tombstone; закрытый legal archive
связан только через opaque tombstone `user_id`, а не через действующий
login/email. Immutable acceptance/contract evidence при этом не мутирует, но
неterminal operational records закрываются по правилу ниже.

### `auth_tokens`

- `id`, `user_id`, `kind`
  (`email_verification|password_reset|legacy_email_claim`);
- `token_hash`, `target_email_normalized`, `email_version`;
- `legacy_family_id` nullable, `family_version` nullable;
- `expires_at`, `used_at`, `created_at`;
- `used_by_request_id` для conditional consume/atomic extension commit;
- `requested_ip_hash` или минимизированные anti-abuse metadata.

`UNIQUE(token_hash)`. Использование выполняется conditional update при
`used_at IS NULL AND expires_at > now`; email token дополнительно требует
совпадения current `email_version` и target current/pending address. Новый
email-change request инвалидирует старый version. `legacy_email_claim` связан с
конкретными user, candidate family и current `family_version`, требует active
authenticated session того же user и при применении повторно проверяет family
ownership. Любой token хранится только как hash.

### `auth_verification_commits`

- `request_id`, `token_id`, `user_id`, `target_email_normalized`, `created_at`;
- `UNIQUE(token_id)` не допускает второго successful verification commit.

Marker создаётся только conditional insert после успешного consume verification
token и входит в тот же D1 batch, что `users.email_verified_at`. Этап legacy claim
добавляет guarded family-finalization statements к этому batch и обязан завершить
его assertion-ом: отсутствие current promoted snapshot, lookup error или race
откатывают marker, verification и consume token целиком. Raw token marker не
содержит.

### `auth_sessions`

- `id`, `user_id`, `jti_hash`, `csrf_hash`, `session_version`;
- `expires_at`, `revoked_at`, `revocation_reason`, `created_at`, `last_seen_at`.

Позволяет logout/revocation при смене пароля, email, роли или блокировке.

### `audit_events`

- `id`, `actor_user_id`, `actor_kind`, `action`;
- `target_kind`, `target_id`, `request_id`;
- `safe_diff_json`, `ip_retention_value`, `created_at`.

`safe_diff_json` не хранит пароль, token, cookie, document body, полный адрес,
email/телефон или содержимое support message.

### `admin_review_tasks`

- `id`, `kind`, `source_kind`, `source_id`, `reason_code`;
- `safe_summary`, `status` (`open|in_progress|resolved|dismissed`);
- `assigned_to`, `resolution`, `created_at`, `resolved_at`.

Используется для `family_name_match`, `family_claim_conflict`,
`family_correction`, import ambiguity, unknown mapping/price и других случаев,
где автоматическая догадка запрещена. Name-match task создаётся для каждого
совпадения фамилии+имени независимо от результата exact-email assignment; safe
summary не содержит полный email, а authorized admin открывает PII только через
отдельный legacy/user detail.

### `privacy_requests`

- `id`, `subject_user_id`, `requested_by_user_id`, `kind`
  (`export|delete|media_content_request`);
- `status`
  (`requested|reviewing|blocked_by_active_contract|approved|processing|completed|completed_with_retained_evidence|failed|cancelled`);
- `retention_holds_json`, `safe_summary_json`, `decision_reason`;
- `artifact_r2_key`, `artifact_expires_at` для private export;
- `reviewed_by`, `reviewed_at`, `completed_at`, timestamps.

Export/delete/media-content actions используют audit и idempotency.
`media_content_request` хранит предоставленный заявителем конкретный URL/post
reference и safe summary, но не создаёт исторический media index и не является
самим отзывом consent. Export artifact шифруется
или выдаётся только через short-lived authenticated response. Delete dry-run не
меняет данные. Active contract блокирует закрытие кабинета; archive hold может
блокировать purge конкретного evidence, но после approval не обязан сохранять
рабочий login/profile. Физическое удаление retained archive records отсутствует
в MVP и требует отдельного будущего утверждённого правила/поручения.

Active contract блокирует весь account-closure request как
`blocked_by_active_contract`. Retention hold не оставляет request зависшим:
после успешного закрытия login/profile request получает
`completed_with_retained_evidence`, а блокировка purge хранится per record в
`retention_controls.purge_status=disabled_by_policy`. UI result перечисляет
retained classes и доступные review/retain dates без payload.

Approved closure без active contract сначала conditional-transaction переводит
account в `deletion_requested` как lock. Затем отменяет/закрывает все
nonterminal trials, requests, draft/contract_offered operational records,
contract offers и price-review items; уже созданное acceptance evidence
сохраняется с closure reason. Любые accept, admin formation/activation, final
price confirmation/apply и новые user actions повторно требуют
`users.account_status=active`. В race contract formation либо closure lock может
победить только один: formed active contract блокирует closure, выигравший
closure lock блокирует formation/apply. После cleanup account становится
`closed`.

### `retention_controls`

- `id`, `target_kind`, `target_id`, `retention_class`, `legal_basis`;
- `retention_started_on`, `retain_until` nullable informational;
- `legal_hold`, `hold_reason`, `hold_set_by`, `hold_set_at`, `hold_review_on`;
- `purge_status`
  (`disabled_by_policy|held|scheduled|processing|completed|failed`),
  `purged_or_anonymized_at`, timestamps.

`UNIQUE(target_kind, target_id)`. Mutable retention metadata хранится отдельно
от immutable offer/PDF/acceptance body. Hold/purge меняются только аудируемой
идемпотентной операцией; policy version входит в decision evidence. Для legal
archive/approved evidence default MVP status всегда `disabled_by_policy`;
`retain_until` не переводит его в `scheduled`. Другие purge states зарезервированы
для будущего отдельно утверждённого flow. Это не относится к самостоятельному
14×24-hour cleanup quarantine objects.

### `idempotency_records`, `rate_limit_buckets`, `operation_locks`

- `idempotency_records`: `scope`, `key_hash`, `request_hash`, `result_ref`,
  `status`, `expires_at`, timestamps; `UNIQUE(scope, key_hash)`;
- `rate_limit_buckets`: `scope`, `subject_hash`, `window_start`, `count`,
  `expires_at`; atomic conditional increment;
- `operation_locks`: `scope`, `resource_key`, `lease_owner`, `lease_until`,
  `fencing_token`; `UNIQUE(scope, resource_key)`.

Для MVP эти механизмы хранятся в D1 и используют conditional write/transaction.
Ошибка rate-limit storage на чувствительном endpoint обрабатывается fail closed.
Истекший lease можно забрать только с новым fencing token. Если нагрузка или
конкурентность превысит возможности D1, переход на Durable Object/managed rate
limiting требует нового ADR, но не меняет доменные ключи.

### `scheduled_cadence_state` и `scheduled_job_runs`

`scheduled_cadence_state` имеет ровно две строки, `fast` и `maintenance`:

- `status` (`idle|running|succeeded|failed`), последний UTC `dedupe_key`,
  lease owner/until и монотонный `fencing_token`;
- PII-free bounded `safe_result_json`, не более 64 timestamps недавних ошибок,
  start/finish/update timestamps.

Automatic Cron атомарно получает cadence lease и обновляет ту же строку в конце
доставки. Каждый job, который реально может читать D1/R2 или выполнять side
effect, дополнительно получает прежний `operation_locks` lease: он сохраняет
изоляцию от manual run и monotonic fencing. Заведомо inert job с отсутствующим
provider/binding не создаёт такой lease. Ошибка/занятый lease одного job
фиксируется в aggregate cadence result, делает cadence `failed` и не прерывает
остальные jobs. Exact Cron expression выбирает только фиксированную группу;
неизвестный или частичный scheduled set отклоняется.

`scheduled_job_runs` сохраняет прежнюю схему и всю историческую информацию, но
новые строки создаются только для явных manual actions. Manual run требует
active-admin audit до side effect и продолжает использовать per-job dedupe,
lease/fence и PII-free result/error. Routine operator list читает только manual
rows через partial index; retained automatic history не сканируется и не
удаляется.

Глобальный `SCHEDULED_JOBS_ENABLED=false` проверяется до первого D1 обращения:
Cron делает 0 reads/0 writes, а health возвращает fail-closed `503`, не создавая
ложный heartbeat. Forward migration `0026_background_d1_cost_controls.sql`
добавляет fixed-cardinality state и seek indexes для bounded cleanup, удаляет
только неиспользуемые secondary indexes; применённые migrations не меняются.

### `storage_object_intents`, `storage_intent_generations`, `storage_intent_link_assertions`

- intent хранит `storage_class` (`archive|quarantine`), opaque `object_key`,
  `object_kind`, optional `source_ref`, SHA-256, size, state
  (`staged|linked|delete_pending|processing|deleted`), lease/attempt/error и
  timestamps; `UNIQUE(storage_class, object_key)`;
- contract-template installer дополнительно использует immutable
  `intent_family_id`, монотонную `generation`, `installer_owner` и
  `installer_lease_until`; object key уникален для каждой generation;
- `storage_intent_generations` является append-only exact history family,
  generation, object key, hash/size и installer owner; update/delete запрещены;
- link assertion append-only связывает один intent с authoritative target после
  одной D1 transaction.

R2 body записывается только после `staged`. Domain commit переводит intent в
`linked` в том же batch, где появляется D1 reference. Reconciler при ambiguous
result сначала восстанавливает `linked`; cleanup claim допускает только object,
который всё ещё нигде не referenced, и повторяет это условие в conditional
`UPDATE`. Для orphan `staged` применяется технический grace 15 минут, затем
lease; это recovery delay, не business retention period. Cleanup завершает
только claimed exact generation. Истёкшая `staged|processing` либо `deleted`
generation не блокирует installer навсегда: exact-byte retry создаёт следующую
generation и generation-specific key, поэтому stale cleaner не может удалить
новый object.

### `admin_bootstrap_control`, `admin_bootstrap_actions`, `admin_bootstrap_assertions`

Единственная control row допускает только необратимый переход
`available → consumed`. На чистой D1 out-of-band CLI может один раз повысить
только active, unblocked, verified parent при полном отсутствии active admin;
роль меняется вместе с session-version increment, отзывом sessions, system audit,
action и final assertion. Replay/конкурентная попытка откатывается. При upgrade
БД с уже существующим active admin migration `0014` сама аудируемо переводит
control в `consumed`, чтобы не оставлять dormant privilege path.
Remote CLI до batch pin-ит exact environment-specific D1 UUID из указанного
config (`preview_database_id` либо `database_id`), включает UUID в typed
confirmation и не использует implicit dev/proxy binding selection.

### `admin_action_assertions`

- `id`, `scope`, `idempotency_record_id` unique;
- `actor_user_id`, `target_kind`, `target_id`;
- `assertion_passed=1`, `created_at`.

Append-only assertion связывает завершённую admin-команду с её idempotency
record, повторной server-side проверкой active admin actor, итоговым состоянием
target и audit event. Если хотя бы одна проверка не выполнена, D1 batch
откатывается целиком и idempotency record не остаётся завершённым.

## Учебные периоды и импорты

### `academic_periods`

- `id`, `code` (`2026-2027`), `display_name`;
- `starts_on`, `ends_on`, `is_current`, `created_at`.

`UNIQUE(code)`; одновременно только один current period для публичного каталога.

### `import_runs`

- `id`, `source_kind` (`access|plusbtext|price|schedule`);
- `academic_period_id`, `source_label`, `source_hash_sha256`;
- `source_contract_id`, `source_contract_version`,
  `structural_fingerprint_sha256`;
- `dependency_hashes_json`, `dependency_set_hash_sha256`;
- `run_fingerprint`, `attempt_no`, `retry_of_run_id`;
- `status` (`staged|validated|promoted|failed`);
- `started_at`, `validated_at`, `promoted_at`, `finished_at`;
- `rows_total`, `rows_staged`, `rows_promoted`, `rows_skipped`;
- `safe_summary_json`, `error_code`.

`run_fingerprint` строится из source kind, period, source hash и dependency set.
Partial unique запрещает более одного `promoted` run на fingerprint, но failed
attempt не блокирует retry с новым `attempt_no`. Dependency set канонически
сортируется до hash; тот же Access с другой PlusBText version или в другом
периоде является новым run. Локальный абсолютный path и полные source rows не
обязаны попадать в production D1.

Whole-file/content hash определяет конкретный snapshot. Source contract version
и value-free structural fingerprint проверяются отдельно: новое содержимое при
том же approved contract допустимо, structural drift завершается до staging/
promotion и требует новой contract version.

### `import_issues`

- `id`, `import_run_id`, `severity` (`info|warning|error|fatal`);
- `code`, `source_record_key`, `safe_context_json`, `status`;
- `created_at`, `resolved_at`, `resolved_by`.

Issues хранят безопасный контекст, достаточный для поиска записи локальным
инструментом, но не полный PII dump.

### `legacy_reconciliation_cases`, occurrences, decisions и assertions

`IMPORT-08` требует durable case поверх run-scoped `import_issues`. Stable
identity связывает academic period, source kind, PII-free source identity digest
и issue code. Case state:
`open|assigned|awaiting_upstream|ready_to_verify|resolved|superseded`; exact
first/last-seen run/version и optimistic integer version обязательны.

Migration `0019_legacy_import_reconciliation.sql` реализует case, occurrence
между run-scoped issue и case, typed decision и terminal assertion. Active
identity уникальна по period/source/digest/code; identity columns immutable,
terminal cases retained, а `(case_id, case_version_before)` допускает ровно
один выигравший transition при гонке администраторов.

Row-scoped parser issue обязан иметь детерминированный PII-free
`source_record_key`; в частности, разные строки/поля PlusBText не используют
общую aggregate identity. Identity PlusBText строится из allowlisted semantic
row values и duplicate ordinal, а не из физического номера строки, поэтому
вставка или перестановка соседних строк её не меняет. Duplicate Access evidence
хранит только exact opaque pair `legacy_enrollment_id`, необходимую для проверки
typed решения, без group label или исходной строки.

Typed decisions, transition assertions и audit append-only. Actionable case не
переходит terminal через generic `resolve|dismiss`; upstream correction закрывает
его только новый immutable import как `resolved_by_reimport`. Full planned
schema, transitions и privacy contract заданы в
[IMPORT_ADMIN_RECONCILIATION_TZ.md](../implementation/IMPORT_ADMIN_RECONCILIATION_TZ.md).
Queue/export хранит и возвращает только issue class/code, state, opaque IDs,
run/version references и aggregate counts; raw source key digest вычисляется до
case storage и не раскрывается в reconciliation evidence.

Typed correction evidence привязывается к `last_seen_version_id` case. Exact
course mapping проверяет snapshot enrollment этой версии; child correction
дополнительно сверяет family/source identity и exact `source_child_key`, поэтому
same-name/different-DOB sibling не является evidence; `distinct_service_proven`
доказывает именно две enrollment записи duplicate occurrence и две разные
current course assignments. Homogeneous multi-case mutation, а также создание
successor и supersede predecessor выполняются одним D1 batch, поэтому stale CAS
не оставляет частично применённый cohort.

Append-only migration `0021_reconciliation_exact_candidate_evidence.sql`
добавляет immutable `legacy_reconciliation_evidence_bindings` и live views для
typed evidence. Binding, decision, case transition, audit и terminal assertion
записываются одним D1 batch; assertion trigger повторно проверяет exact
run/version, source row/family, mapping, correction или duplicate pair в момент
commit. Snapshot families/source rows/enrollments становятся immutable после
materialization reconciliation occurrence либо promotion. Отзыв или изменение
current projection делает typed evidence невалидным для gate без переписывания
истории решения.

Append-only migration `0022_reconciliation_completion_downstream_fence.sql`
добавляет `legacy_reconciliation_materializations`: один immutable completion
marker на exact source kind/run/version с равными actionable issue/occurrence
counts. Marker создаётся последним после reconciliation; promotion и family
registration требуют marker для exact Access/PlusBText pair, а `import_issues`
после marker immutable. Strict typed-evidence views добавляют exact child key.
Valid `same_service_duplicate` в той же D1 transaction supersede-ит mutable
peer `price_review_items` и пишет PII-free audit; наличие applied peer item
блокирует решение до отдельной финансовой сверки.

### `legacy_import_release_plans`, `legacy_import_bundle_events`,

`legacy_import_stage_cleanup_events`

Schema-v3 protected plan artifact до D1 фиксирует
`sourceClass=synthetic_preview|current_production` и nullable
`syntheticFixtureId`. Preview требует exact
`legacy-preview-synthetic-baseline-v1|legacy-preview-synthetic-candidate-v1`,
production требует `syntheticFixtureId=null`; preview/source и
production/source-class cross-combinations недопустимы.

`legacy_import_release_plans` связывает immutable plan/staged digests с exact
environment/D1 UUID/git commit/period, deterministic PlusBText и Access
run/version pair, expected previous pair и безопасным aggregate summary. Поля
`planned_by`, `staged_by` различаются. `verification_contract_json` immutable
фиксирует planned run/source/snapshot/projection/issue counts; D1 triggers
сверяют его перед review/promote и запрещают error/fatal publication. Review
fields записываются один раз independent reviewer, не совпадающим с planner или
stager; status допускает только
`staged → reviewed → promoted ↔ rolled_back` через repository invariants.

`legacy_import_bundle_events` — append-only history
`promote|rollback|roll_forward`. Каждая строка связывает target и previous
PlusBText/Access pair, review digest, два fencing token и обязательный для
`promote` recovery-evidence digest, а `actor_operator_id` обязан отличаться от
reviewer. Trigger проверяет expected current pointers, Access→PlusBText
dependency, review/status и ранее опубликованную rollback pair.
Pair pointers, Access projection, run statuses, release status, source events и
audit меняются одним D1 batch. Детерминированные run/version/plan IDs и read-back
event/current state дают явное reconciliation после ambiguous remote write;
mixed state не принимается за успех.

Append-only migration `0020_reconciliation_release_fence.sql` добавляет
transactional release fence: D1 trigger на `promote` event проверяет отсутствие
active blocking `legacy_reconciliation_cases` того же academic period внутри
той же транзакции. Application pre-check остаётся ранней диагностикой, но не
является единственной защитой от TOCTOU.

Migration `0021` заменяет period-only promotion check exact-candidate fence:
каждый blocking occurrence именно продвигаемых run/version обязан либо
отсутствовать, либо иметь live valid typed resolution для того же case decision.
Historical terminal case или clean replay другого run не освобождает candidate;
параллельно сохраняется запрет любого active blocking case периода. Registration
проверяет тем же правилом exact current Access и published PlusBText versions.
Migration `0022` добавляет prerequisite completion marker, поэтому пустое
множество occurrences после crash между `validated` и reconciliation больше не
может трактоваться как clean candidate.

Protected ignored recovery-evidence artifact не является D1 substitute или
произвольным digest: он связывает exact environment/account/database/plan/review/
current pair, recovery method/reference, distinct isolated-restore database,
restore verification digest, `restoredCurrentPair`, `verifiedBy`, `verifiedAt`
и `validUntil`. `verifiedBy` отличается от planner, stager, reviewer и promoter;
promote хранит только проверенный artifact digest в append-only event/audit.

`legacy_import_stage_cleanup_events` — append-only exact-actor evidence удаления
только failed deterministic staging attempt. `UNIQUE(import_run_id, action)`,
source-kind/status triggers и запрет update/delete не позволяют превратить
cleanup в произвольное удаление plan либо validated/published run.

При populated upgrade `0016`→`0018` старые plan rows с `planned_by`/
`staged_by IS NULL` либо legacy `{}` verification contract не переписываются и
остаются immutable historical evidence. Явные NULL/schema guards и null-safe
actor comparisons запрещают для них review/promote/rollback/roll-forward;
оператор создаёт новый hardened schema-v3 plan.

## Legacy family и дети

### `family_number_allocations`

- `id`, `namespace` (`legacy_1|portal_2`), `sequence_number`;
- `display_family_id`, `legacy_family_id` nullable, `owner_user_id` nullable;
- `origin` (`legacy|portal`), `status`
  (`pending|assigned|collision|merged_alias|retired`);
- `assigned_at`, `merged_into_family_number_id` nullable, timestamps.

`UNIQUE(namespace, sequence_number)` и `UNIQUE(display_family_id)`. Legacy raw
`1. 3477` получает namespace 1; online-only family — отдельную сквозную
sequence namespace 2 с display `2. 0001`. Unverified account allocation не
получает. Email-verification family-finalization одной conditional transaction
либо присваивает unique eligible legacy allocation, либо резервирует следующий
portal sequence и связывает его с user. Для current assigned rows действуют
partial unique constraints по `owner_user_id`: один parent account — одна current
allocation, одна current allocation — один owner.

Успешный late proof/admin correction переводит прежнюю current allocation в
`merged_alias` с `merged_into_family_number_id=destination`, назначает destination
current и увеличивает `users.family_version`. Это historical identity/audit
reference, не второй FamilyID аккаунта. Reverse chain/cycle запрещены. Уже
выданные contracts не перенумеровываются; old contract sequence остаётся для
проверки history и больше не выдаёт новые номера.

### `legacy_families`

- `id`, `source_namespace`, `source_family_id`, `family_number_id` nullable;
- `numbering_status`
  (`valid|collision|missing|unapproved`);
- `claimed_by_user_id`, `claimed_at`;
- `continuity_status` (`stable|needs_review|corrected`);
- `created_at`, `updated_at`.

`UNIQUE(source_namespace, source_family_id)`. Это stable cross-period identity.
Claim owner наследуется новым period snapshot и не перезаписывается reimport.
Конфликт/редкое изменение ID создаёт review; автоматический merge по имени,
адресу или email запрещён.
`source_family_id` хранит raw display (`1. 3477`) без нормализации точки/пробела.
Он не участвует в identity/merge вне source namespace; family-number allocation
и contract formatting проходят отдельный fail-closed collision check.

### `legacy_family_periods`

- `id`, `legacy_family_id`, `academic_period_id`, `import_run_id`;
- `parent_name_raw`, `parent_first_name_normalized`,
  `parent_last_name_normalized`, `parent_name_match_status`
  (`eligible|ambiguous|unavailable`), `address_raw`, `phone_raw`, `mobile_raw`;
- `last_seen_run_id`, `is_current`, `retired_at`, `created_at`, `updated_at`.

`UNIQUE(legacy_family_id, academic_period_id)`. Source/contact snapshots и
enrollments period-scoped; claim/owner и stable child identity — нет.
Name-match key создаётся только когда `Value2` детерминированно разобран на
фамилию+имя по versioned normalizer. Ambiguous/unavailable value не участвует в
self-service matching и остаётся только для admin review.

### `legacy_family_emails`

- `id`, `legacy_family_id`, `legacy_family_period_id`, `email_raw`,
  `email_normalized`;
- `source_access_id`, `last_seen_run_id`, `is_current`.

Сохраняются все distinct emails строк семьи. Конфликтующие контакты создают
issue; выбор «первого» email запрещен.

### `family_claims`

- `id`, `legacy_family_id`, `user_id`;
- `status` (`candidate|claimed|conflict|released|superseded`);
- `proof_kind` (`verified_login_email|legacy_email_token|admin_reassignment`),
  `proof_at`, `consented_at` nullable, `claimed_at`, `review_task_id`,
  `created_at`.

Partial `UNIQUE(legacy_family_id)` и `UNIQUE(user_id)` для active `claimed`:
legacy family и parent account не могут иметь два current claim. Exact
login-email claim не требует дополнительного consent, потому что та же
одноразовая verification доказывает контроль адреса; name-match path требует
opt-in request и отдельный `legacy_email_claim` token. Claim выполняется в той
же транзакции, что смена current family/children.

### `family_link_attempts`

- `id`, `user_id`, `legacy_family_id`, `from_family_number_id`;
- `match_kind` (`exact_email|parent_name`), `masked_email_snapshot` nullable;
- `status`
  (`candidate|proof_sent|confirmed|expired|conflict|cancelled`),
  `family_version`, `review_task_id`, timestamps.

Active self-service attempt допускается только для одного unambiguous, unowned
candidate с одним distinct usable legacy-email. `masked_email_snapshot` содержит только
разрешённую маску, полный recipient берётся server-side из current promoted
legacy email при постановке outbox и не копируется в audit/log. Multiple exact
email/name families или multiple candidate emails не создают selectable rows в
parent API.

### `family_reassignments`

- `id`, `user_id`, `from_family_number_id`, `to_family_number_id`;
- `source` (`legacy_email_token|admin_correction`), `reason_code`,
  `reason_note` nullable;
- `requested_by`, `confirmed_by`, `idempotency_key`, `family_version_before`;
- `status` (`planned|applied|conflict|cancelled`), `safe_effects_json`,
  timestamps.

`UNIQUE(source, idempotency_key)`. Admin preview не является apply. Apply
проверяет unchanged version, ownership/collision, destination и affected rows,
затем атомарно меняет user/children/claims, supersede-ит nonterminal offers и
записывает безопасный audit. Destination другого active account либо cycle
завершается `conflict`, не создавая shared family.

### `admin_family_correction_previews`

- `id`, `actor_user_id`, `user_id`, `from_family_number_id`,
  `to_family_number_id`, `destination_kind`;
- current `legacy_version_id`/`legacy_import_run_id` для legacy destination;
- `family_version_before`, `owned_child_count`, `destination_child_count`,
  `children_snapshot_hash`;
- immutable `consequence_snapshot_json`/`consequence_snapshot_hash`;
- `status` (`ready|applied|stale|cancelled`), `applied_reassignment_id`,
  `expires_at`, timestamps.

Preview живёт ограниченное время, принадлежит создавшему admin actor и
не разрешает передать FamilyID строкой при apply. Portal destination сначала
резервируется server-side как pending namespace-2 allocation. Legacy
destination обязан входить в current promoted snapshot, быть valid/unowned и
не иметь пропущенных, owned или continuity-ambiguous current children.
Consequence contributor добавляет snapshot offer/contract effects; после
появления contract tables он обязан сохранять immutable old-contract evidence
и supersede-ить только nonterminal old-family offers в том же apply batch.

### `admin_family_correction_preview_children`

- composite key `preview_id, child_id`, `effect_kind`
  (`owned_switch|destination_claim`);
- `expected_owner_user_id`, `expected_family_number_id`, `created_at`.

Строки append-only и фиксируют точный набор детей preview. Apply повторно
проверяет owner/family/current state, отсутствие новых owned children и итоговую
cardinality; race или частичный switch нарушает assertion и откатывает весь
batch.

### `children`

- `id`, `owner_user_id` nullable только для unclaimed legacy,
  `legacy_family_id` nullable, `family_number_id`;
- `origin` (`portal|legacy`), `source_child_key`;
- `source_full_name`, `source_full_name_normalized`, `source_birth_date`;
- `full_name_override`, `birth_date_override`;
- effective `full_name`, `full_name_normalized`, `birth_date`;
- `last_seen_run_id`, `is_current`, `created_at`, `updated_at`.

Access row ID не является child ID. `source_child_key` строится только внутри
stable family из нормализованных имени и даты рождения и может переживать
academic period.
Пустые/конфликтующие атрибуты
не объединяются автоматически. Parent может редактировать portal-created child;
исправление legacy child идет через review/audited admin action. Reimport меняет
только `source_*`; effective fields вычисляются как override или source и потому
подтвержденная correction не теряется.

`children.family_number_id` обязателен. Portal child создаётся только после
family-finalization и копирует current family owning account в той же
transaction; claimed child обязан иметь тот же FamilyID, что owner. Unclaimed
legacy child может иметь `owner_user_id=null`, но использует валидную namespace-1
allocation своей source family. Family с missing/colliding/unapproved FamilyID
остаётся в source/staging/review tables и не создаёт canonical child/enrollment,
пока allocation не разрешена. Legacy child сохраняет `legacy_family_id` как
source identity; portal child может оставить его `null` даже после присоединения
к legacy family, поскольку его origin не становится импортным. Family
reassignment меняет `family_number_id` всех owned children account одной
транзакцией; смешанный результат запрещён invariant check.

### `child_correction_requests`

- `id`, `child_id`, `requested_by`, `requested_values_json`;
- `status` (`pending|approved|rejected|cancelled`);
- `reviewed_by`, `reviewed_at`, `decision_reason`, `created_at`.

Approved correction обновляет override fields и audit. Source evidence остается
доступным админу, но не показывается как второе значение публично.

### `legacy_source_rows`

- `id`, `source_namespace`, `academic_period_id`, `source_access_id`,
  `value48_mirror`;
- `legacy_family_id`, `child_id`, `import_run_id`;
- `source_hash`, `last_seen_run_id`, `is_current`, `retired_at`;
- `safe_raw_json` только для разрешенных полей.

`UNIQUE(source_namespace, academic_period_id, source_access_id)`. В текущем
Access snapshot `ID` является уникальным ключом строки, но его стабильность
между academic periods не предполагается. Повтор ID в новом периоде создаёт
новую source row; `Value48` сверяется как зеркало, а mismatch становится issue.

### `legacy_enrollments`

- `id`, `legacy_source_row_id`, `legacy_family_id`, `child_id`;
- `academic_period_id`, `source_slot` (`main_next|package_1..package_5`);
- `source_record_key`, `group_name_raw`, `course_group_id`;
- `teacher_name`, `day_raw`, `duration_raw`, `subject_duration_vector_json`;
- `status_code_raw`, `lesson_kind`, `contract_kind`, `price_source`,
  `price_mode` (`rule_derived|manual_override`);
- `planned_price_cents`, `notes_raw`, `needs_admin_review`;
- `is_active_for_occupancy`, `represented_by_enrollment_id`;
- `last_seen_run_id`, `is_current`, `retired_at`, `created_at`, `updated_at`.

`UNIQUE(source_record_key)`. Main/package одного child/course и legacy запись,
уже представленная portal enrollment, не считаются дважды.
Schema enum сохраняет historical `package_5` ради append-only migration
compatibility, но owner-approved importer больше никогда его не создаёт:
физические пятые cells `Value41/AO` и `Value46/AT` являются service markers.
Новые rows используют только `package_1..package_4`.

## Каталог и расписание

### `schedule_versions`

- `id`, `academic_period_id`, `import_run_id`;
- `schema_version`, `generation_id`, `generated_at`;
- `is_published`, `published_at`, `retired_at`.

### `course_groups`

- `id`, `academic_period_id`, `source_offering_key`;
- `display_name`, `normalized_price_key`, `lesson_kind`, `subject`;
- `capacity_default`, `capacity_override`;
- `requires_admin_approval`, `catalog_status`
  (`draft|published|hidden|needs_review|retired`);
- `created_at`, `updated_at`.

Одинаковый `display_name` не уникален. По умолчанию schedule block становится
отдельным offering.

### `course_sessions`

- `id`, `course_group_id`, `schedule_version_id`;
- `source_block_id`, `day_code`, `start_time`, `end_time`;
- `duration_minutes`, `timezone`, `teacher_name`, `building`, `room`;
- `location_display`, `is_current`, `retired_at`.

`UNIQUE(schedule_version_id, source_block_id)`. Source ID должен быть проверен
на устойчивость между generation; изменение mutable полей не определяет ID.

### `course_source_mappings`

- `id`, `academic_period_id`, `source_kind`, `source_value_normalized`;
- `course_group_id`, `status` (`confirmed|suggested|rejected`);
- `reason`, `created_by`, `created_at`.

Нужен для явного связывания Access/PlusBText names с offering. Неоднозначный
mapping не выбирается автоматически.

## Прайс, quotes и enrollments

### `price_versions`

- `id`, `academic_period_id`, `import_run_id`, `label`;
- `valid_from`, `is_active`, `activated_at`, `created_at`.

### `price_rules`

- `id`, `price_version_id`, `source_row_number`;
- `key`, `duration_raw`, `subjects_raw`;
- `subject_duration_vector_json`, `duration_total_minutes`;
- `children_count`, `yearly_price_cents`, `monthly_price_cents`;
- `raw_json`, `created_at`.

Уникальность определяется всем normalized lookup contract. `children_count`,
`yearly_price_cents` и `monthly_price_cents` обязаны быть positive integers;
zero/negative source rate не создаёт publishable rule. Дубли без однозначного
winner блокируют автоматический lookup.

### `price_quotes`

- `id`, `user_id`, `child_id`, `course_group_id`, `planned_start_on`;
- `active_children_count_as_of`, `lookup_children_count`;
- `price_version_id`, `price_rule_id`, `price_source`, `price_mode`,
  `contract_kind`;
- `duration_source`, `duration_minutes_used`, `billing_period_code`;
- `estimated_missing_duration`, `requires_admin_confirmation`;
- `base_price_cents`, `manual_override_cents`, `manual_override_reason`;
- `final_price_cents`, `decision_code`, `decision_json`;
- `confirmed_by_admin_user_id`, `confirmed_at`, `confirmation_json`;
- `status` (`quoted|needs_admin_confirmation|confirmed|stale|superseded`),
  `created_at`, `expires_at`.

`price_source`:
`excel_yearly|excel_monthly|fallback_90|configured_individual_hourly|fixed_nachhilfe_hourly`.
`price_mode`: `rule_derived|manual_override`.
`group_yearly` выбирает `yearly_price_cents` из Excel `Preis`,
`group_monthly` — `monthly_price_cents` из исторически названного
`Sonderpreis`. `manual_override` меняет только mode/final amount, сохраняя
исходный source/base/rule provenance; он требует high-friction admin
confirmation, reason/base snapshot/audit и никогда не выводится из source
marker или parent payload.

`duration_source`: `plusbtext|price_rule|fallback_90|not_applicable`.
`billing_period_code` для `fallback_90` всегда `calendar_month`; админ
подтверждает длительность и сумму, но не угадывает период. Такой
quote имеет `decision_code = ESTIMATED_MISSING_DURATION`, не участвует в
monthly total/repricing и не может быть использован в отправленном offer, пока
имеет статус `needs_admin_confirmation`. После аудируемого подтверждения
длительности и суммы его immutable confirmed snapshot разрешено использовать в
offer.
Подтверждение выполняется атомарно, требует reason/audit; изменение рассчитанных
условий создаёт новый quote snapshot, а не переписывает исходный decision.

### `enrollments`

- `id`, `user_id`, `child_id`, `course_group_id`, `legacy_enrollment_id`;
- `lesson_kind`, `status`
  (`draft|contract_offered|active|cancelled|ended`);
- `contract_kind`, `active_from`, `active_until`;
- `current_base_price_cents`, `current_price_cents`, `price_source`, `price_mode`,
  `current_price_version_id`, `current_price_rule_id`, `price_effective_from`,
  `price_assignment_version`;
- `manual_override_reason`, `manual_override_by`, `manual_override_at`;
- `source` (`legacy|portal|admin`), `created_at`, `updated_at`.

Не более одного пересекающегося active enrollment для child/course. D1 не имеет
полноценного exclusion constraint, поэтому это обеспечивается индексами на
нормализованный active key плюс transactional check и тестами concurrency.

Базовые переходы: `draft -> contract_offered -> active`,
`draft|contract_offered -> cancelled`, `active -> ended|cancelled`;
`ended|cancelled` terminal. Pause/resume в MVP не моделируются; неоднозначный
legacy pause создаёт admin review. Любая транзакция, задающая или меняющая future
`active_from|active_until`, создаёт/supersede deduped price-review boundary на
эту дату; reconciler идемпотентно восстанавливает пропущенный trigger.

## Trials и индивидуальные запросы

### `trial_bookings`

- `id`, `user_id`, `child_id`, `course_group_id`, `session_id`;
- `status` (`requested|confirmed|rejected|cancelled|attended|no_show|converted`);
- `requested_date`, `confirmed_date`, `reviewed_by`, `reviewed_at`;
- immutable `availability_at_request`, `requires_admin_review_at_request`,
  `request_hash_sha256`, `idempotency_key`;
- `decision_reason`, `converted_at`, `created_at`, `updated_at`.

Один open trial на child/course.
`rejected|cancelled|no_show|converted` terminal; `attended` допускает только
переход в `converted`.

`trial_parent_actions` хранит append-only idempotent parent cancellation, а
`trial_transition_commits` ставит unique fence на `trial_booking_id+from_status`,
чтобы две concurrent административные команды не создавали два решения.
`trial_action_assertions` связывает parent action с безопасным audit event;
административные переходы дополнительно используют общий
`admin_action_assertions`. Эти таблицы не создают enrollment и не участвуют в
occupancy.

### `individual_requests`

- `id`, `user_id`, `child_id`, `request_kind` (`nachhilfe|individual`);
- `funding_kind` (`self_pay|jobcenter|socialamt|unknown`);
- `subjects_raw`, `preferred_days_json`, `preferred_time_windows_json`;
- `description`, `preferred_format`, `preferred_locations_json`;
- immutable tariff snapshot `unit_rate_cents`, `parent_payable`;
- `status` (`draft|submitted|needs_documents|needs_info|pending_admin_review|approved|rejected|cancelled`);
- optimistic `version`, `create_idempotency_key`, `create_request_hash_sha256`;
- `admin_decision`, `admin_notes`, `reviewed_by`, `reviewed_at`,
  `created_at`, `updated_at`.

Cross-field constraint: submitted `individual` требует
`funding_kind=self_pay`; submitted `nachhilfe` требует
`funding_kind=jobcenter|socialamt` и document/authorization. UI перенаправляет
self-pay tutoring intention в `individual`, но сервер проверяет это независимо.

### `service_engagements`

- `id`, `user_id`, `child_id`, `individual_request_id`;
- `request_kind` (`nachhilfe|individual`),
  `initial_funding_authorization_id` nullable,
  `current_funding_authorization_id` nullable;
- `status` (`draft|contract_offered|active|funding_review|cancelled|ended`);
- `active_from`, `active_until`, `attendance_ceased_at` nullable,
  `attendance_notice_id` nullable, `contract_id` nullable until activation;
- `created_at`, `updated_at`.

Как и enrollment, engagement использует inclusive `active_from` и exclusive
`active_until`. При projection из inclusive contract `effective_to` действует
`active_until = calendar_day_after(effective_to)`; null означает open-ended и
запрещён для funded Nachhilfe.

Для одного request допускается только один nonterminal engagement; activation
защищена conditional unique и idempotency. Первый offer series атомарно создаёт
`draft`, send переводит его в `contract_offered`, activation — в `active`.
Superseding version той же series переиспользует engagement. Cancel/decline/
expiry последнего open offer отменяет draft/contract_offered engagement; cleanup
не трогает active и не оставляет orphan, блокирующий новый offer. Эта сущность
не имеет
`course_group_id`, не входит в `active_children_count` и не влияет на group
capacity/repricing. Фактически проведённые уроки и начисления вне MVP.

Cross-field invariant: `nachhilfe` в `contract_offered|active` требует non-null
current funding authorization со статусом `approved`, authority
`jobcenter|socialamt`, действующим сроком на дату начала и хотя бы одним
current document, причём все current documents имеют `review_status=approved`.
`individual` требует обоих funding authorization ID `NULL` и исходный request с
`funding_kind=self_pay`.
Если requested term выходит за `valid_until`, offer остаётся fail-closed/manual
и не обещает услугу за пределами authorization.

Expiry либо `approved -> revoked|superseded` для authorization, связанного с
sent/accepted offer или active Nachhilfe, не выполняется одиночным update:
open offers supersede, active engagement атомарно переходит в `funding_review`,
создаётся admin task, а accepted contract/evidence остаются immutable. New
authorization не переключает существующий contract автоматически. Продолжение
требует append-only admin-approved funding amendment; если parent-facing terms
изменились, amendment запрещён и нужен новый offer/parent acceptance.

### `funding_amendments`

- `id`, `contract_id`, `service_engagement_id`;
- `previous_authorization_id`, `new_authorization_id`;
- `effective_from`, `reason`, `approved_by_admin_user_id`, `approved_at`;
- `event_hash`, `idempotency_key`, `created_at`.

Amendment разрешён только для той же child/service, approved current document и
неизменных parent-facing terms. Он append-only, атомарно меняет только
`service_engagements.current_funding_authorization_id`, переводит
`funding_review -> active` на/после `effective_from` и пишет contract/audit
event. Original contract/offer/PDF и initial authorization не мутируют.

`request_parent_actions` хранит idempotent append-only parent save/submit/cancel и
document-delete evidence, а `request_action_assertions` связывает успешную
мутацию с owner assertion и безопасным audit event.

### `funding_authorizations`

- `id`, `request_id`, `user_id`, `child_id`, immutable `version`,
  `kind` (`jobcenter|socialamt`);
- `status` (`pending_review|approved|rejected|revoked|superseded`),
  `valid_from`, `valid_until`, `supersedes_authorization_id` nullable;
- `decision_notes`, `reviewed_by`, `reviewed_at`, `created_at`, `updated_at`.

`valid_from`/`valid_until` — inclusive dates разрешения, не даты каждой страницы.
Payer name/address, case/reference и approved hours не копируются в поля D1:
они остаются только в private source document. Attendance/billing вне MVP.

Новый record начинается `pending_review`, затем переходит в
`approved|rejected`; approved record может стать `revoked` явным аудируемым
решением либо `superseded` атомарно при approval новой version. Rejected/
revoked/superseded terminal и не возвращаются в `approved`. Expiry вычисляется
по inclusive `valid_until` на нужную дату, а не записывается mutable status.

Approval разрешён только если есть хотя бы один non-deleted/non-replaced
document и каждый current document имеет `review_status=approved`; карантинный
либо любой non-clean файл блокирует approval. Замена content уже approved
документа создаёт новый authorization/document record; старое evidence не
перезаписывается. Offer send и activation повторно проверяют этот guard.

Document, на который ссылается sent/accepted offer либо contract, становится
immutable retained evidence: parent replace/delete не меняет его status/object.
Replacement upload создаёт новую authorization/document version; прежнее
evidence остаётся связано со старым offer/contract. Новый approval не переводит
contract на новую authorization молча.

### `authorization_documents`

- `id`, `authorization_id`, `user_id`, `child_id`;
- private random `quarantine_r2_key`, nullable private `archive_r2_key`,
  `original_extension`, `mime_type`, `detected_type`;
- `size_bytes`, `sha256`;
- `review_status`
  (`quarantined|scan_pending|clean|infected|suspicious|scan_failed|approved|rejected|deleted`);
- `quarantine_reason`, `scan_method` (`manual_local_av|automated_adapter`)
  nullable, `scanner_label`, `scanner_version`, `signature_version`;
- `quarantine_downloaded_by_admin_user_id`, `quarantine_downloaded_sha256`,
  `quarantine_downloaded_at`, `download_audit_event_id`;
- `scan_attested_by_admin_user_id`, `scan_attestation_text_version`,
  `scanned_at`, `scan_attempts`;
- `business_review_reason`, `released_by`, `released_at`,
  `retention_control_id`;
- `upload_idempotency_key`, `upload_request_hash_sha256`, `uploaded_at`,
  `quarantine_expires_at`;
- `quarantine_delete_state` (`present|delete_pending|deleted`),
  `quarantine_purged_at`, `quarantine_cleanup_audit_event_id`, `deleted_at`,
  `replaced_by_document_id`.

R2 key уникален и случайный. Новый файл остаётся `quarantined`; inline preview/
public/parent download запрещены. Admin получает
только audited forced attachment как `application/octet-stream`. Ручной
`quarantined -> clean` требует предшествующий download того же SHA-256 и
hash-bound attestation с `scan_method=manual_local_av`; замена content
инвалидирует её. `clean` допускает отдельное business решение
`approved|rejected`. `scan_pending|suspicious|scan_failed` зарезервированы для
будущего automated adapter и не используются как shortcut ручного approval.
Нечитабельный/нерелевантный/неверный по датам document отклоняется с reason/
request-reupload.
Переходы и доступ аудируются. Физическое удаление следует retention policy и
отдельному quarantine TTL: при upload `quarantine_expires_at = uploaded_at +
14*24h` в UTC. Object без `review_status=approved` становится eligible для
удаления только при `now >= quarantine_expires_at` и удаляется первым успешным
cleanup после этого порога, но никогда раньше. Download/attestation не меняют
expiry; duplicate cleanup идемпотентен. Approved artifact покидает quarantine
lifecycle и получает business retention.

Parent delete/replacement немедленно убирает доступ к non-approved metadata, но
не ускоряет физическое удаление quarantine body: до исходного
`quarantine_expires_at` сохраняется `quarantine_delete_state=present`.
Approved artifact копируется под новым случайным `archive_r2_key`; после
атомарной фиксации approval карантинная копия становится `delete_pending`.
Cleanup удаляет только quarantine key и никогда не выбирает approved archive.
Физический purge approved archive в MVP отключён.

`document_scan_attestations`, `document_action_assertions` и
`funding_action_assertions` — append-only evidence. `funding_lifecycle_events`
дедуплицирует `revoked|superseded|expired`; для inclusive `valid_until` событие
expiry имеет `effective_on = calendar_day_after(valid_until)`, при этом mutable
status `expired` не добавляется.

## Договоры

### `contract_provider_versions` и `media_withdrawal_contact_versions`

- provider version хранит immutable provider/payment-terms snapshot и hash;
- media contact version хранит immutable German-text/contact snapshot и hash,
  `approval_status` и `compliance_assessment_status`
  (`not_assessed|passed|failed`).

Approved versions не изменяются. `compliance_assessment_status=passed` является
обязательным, но не единственным gate для online media grant; synthetic fixture
остаётся `not_assessed` и не открывает grant.

### `contract_template_versions`

- `id`, `template_id`
  (`group_yearly|group_monthly|individual_hourly|nachhilfe_hourly`);
- `template_version`, `render_schema_version`, `clause_set_version`;
- `provider_version_id`, `media_contact_version_id` nullable;
- `template_bundle_r2_key`, `bundle_hash`, `html_source_hash`,
  `css_source_hash`;
- `asset_manifest_json`, `font_manifest_json`, `required_fields_json`;
- `renderer_id`, `renderer_contract_version`, `worker_compatibility_date`;
- `usage_scope` (`synthetic_test|preview_review|production`);
- `approval_status` (`draft|approved|retired`);
- `approval_basis`
  (`synthetic_fixture|internal_preview_review|authorized_verein_approval|legal_review`);
- `distance_legal_profile`
  (`offline_only|widerruf_applicable|widerruf_not_applicable_312g_2_9`),
  `distance_legal_basis_version`, `distance_legal_basis_hash`,
  `kuendigung_function_required`, `early_performance_supported`;
- `approved_by`, `approved_at`, `valid_from`, `valid_to`, `created_at`.

`UNIQUE(template_id, template_version)`. После `approved` bundle и manifests
immutable и удерживаются не короче связанных договоров; automatic archive purge
выключен. Одного hash без сохраняемого source/assets недостаточно для
воспроизведения.
`usage_scope=synthetic_test` разрешает send/accept только внутри изолированного
test harness с синтетическими сторонами и никогда — при production config.
Реальный offer
требует одновременно `usage_scope=production` и
`approval_status=approved` с
`approval_basis=authorized_verein_approval|legal_review`. Online send также
требует `distance_legal_profile != offline_only` и соответствующие approved
notice/function versions.

### `contract_number_sequences`

- `id`, `family_number_id`, `format_version`, `next_contract_sequence`;
- `status` (`unapproved|active|collision|retired`), `updated_at`.

`UNIQUE(family_number_id)`. Reservation выполняется conditional transaction и
никогда не использует один full number дважды. Namespace 1/2 и family sequence
берутся только из assigned canonical `family_number_allocations`. Full number
форматируется как `1. 3477-1`/`2. 0001-1` и резервируется до production render/
send. Increment коммитится даже при последующем decline/expiry/cancellation;
gap допустим, reuse нет. При family reassignment old sequence перестаёт выдавать
номера этому account, а future reservation использует sequence destination.
Ни reassignment, ни новая policy version не переформатируют выданные номера.
Отсутствие assigned current family, несовпадение child family с account,
collision или stale `family_version` завершает reservation fail-closed.

### `contract_offers`

- `id`, `series_id`, `version`, `offer_number`, `contract_number`,
  `user_id`, `child_id`, `family_number_id_at_issue`,
  `family_display_id_at_issue`, `family_version_at_issue`;
- `course_group_id`, `individual_request_id`, `funding_authorization_id`,
  `enrollment_id`, `service_engagement_id`;
- `contract_kind`, `template_version_id`, `render_schema_version`,
  `effective_from`, `effective_to` nullable;
- `billing_model`
  (`monthly_group_fee|delivered_units|third_party_funded`),
  `currency`, `unit_minutes`, `price_source`, `price_mode`, `price_cents`,
  `amount_semantics` (`base_price|unit_rate|third_party_rate`);
- `payment_arrangement`
  (`existing_external_sepa|manual_payment|not_applicable`),
  `payment_due_day` nullable, `billing_period_code`;
- `provider_snapshot_json`, `party_snapshot_json`, `service_snapshot_json`,
  `schedule_snapshot_json`;
- `billing_snapshot_json`, `line_items_json`, `term_snapshot_json`,
  `termination_snapshot_json`, `withdrawal_snapshot_json`;
- `distance_legal_profile_snapshot_json`, `distance_legal_basis_hash`;
- `early_performance_request_version`, `early_performance_requested_at`
  nullable, `wertersatz_notice_version` nullable;
- `clauses_manifest_json`, `attachments_manifest_json`,
  `privacy_notice_version`, `media_clause_version` nullable,
  `media_decision_snapshot_json` nullable;
- `render_input_json`, `render_input_hash`, `source_manifest_json`,
  `source_manifest_hash`, `contract_html_r2_key`, `contract_pdf_r2_key`,
  `contract_hash`;
- `render_status` (`not_started|rendering|ready|failed`);
- `status` (`draft|sent|accepted_by_parent|declined_by_parent|approved_by_admin|cancelled|expired|superseded`);
- `sent_at`, `expires_at`, `accepted_at`, `declined_at`;
- `admin_approved_at`, `cancelled_at`, `status_reason`;
- `created_at`, `updated_at`.

После `sent` содержимое immutable. Изменение условий создает новую version и
делает старую `superseded`. Проверка требует ровно одну service relation:
`course_group_id XOR individual_request_id`. Полная матрица fail-closed:

- `group_yearly|group_monthly` требуют matching template ID, `course_group_id`,
  `enrollment_id`, `billing_model=monthly_group_fee` и запрещают request,
  engagement и funding authorization;
- `individual_hourly` требует matching template ID, `individual_request_id`,
  `service_engagement_id`, `billing_model=delivered_units`, request kind
  `individual`/self-pay, `price_source=configured_individual_hourly` с immutable
  snapshot фактического configured тарифа и запрещает course/enrollment/funding
  authorization;
- `nachhilfe_hourly` требует matching template ID, request/engagement kind
  `nachhilfe`, `billing_model=third_party_funded` и approved Jobcenter/Sozialamt
  `funding_authorization_id`, `price_source=fixed_nachhilfe_hourly` и фиксированный
  unit rate 3000 cents/45 минут; все его current documents должны быть
  `approved`.

Любая другая permutation contract kind/template/service relation/billing model
отклоняется при draft validation, send и повторно при activation. Для Nachhilfe
structured `effective_from|effective_to` обязательны и должны целиком входить в
inclusive `valid_from|valid_until`; null/out-of-range `effective_to` остаётся
fail-closed. `term_snapshot_json` не заменяет эти поля.
Offer/contract `effective_from|effective_to` — inclusive local calendar dates;
enrollment/engagement `active_until` остаётся exclusive boundary. Если closed
contract end-date проецируется в operational record, действует
`active_until = calendar_day_after(effective_to)` в `Europe/Berlin`, одной
протестированной calendar-date функцией, без duration arithmetic.
`third_party_funded` требует `payment_arrangement=not_applicable` и null
`payment_due_day`; parent-pay arrangement запрещает `not_applicable`.
`manual_payment` требует due day 7, а `existing_external_sepa` — null due day,
поскольку портал не обещает дату внешнего списания.
Для `monthly_group_fee` `amount_semantics=base_price`: holiday/proration/other
adjustments и фактическая payable amount не вычисляются и это входит в
`billing_snapshot_json`/PDF text.
`media_clause_version` входит в render/hash, если template содержит media clause.
Optional `media_decision_snapshot_json` разрешён только для отдельного
`media_consents` event, существовавшего до immutable render/send; решение после
send и revoke не мутируют offer/PDF. Отсутствие explicit grant означает запрет
publication. Production требует approved German text и immutable withdrawal
contact snapshot/hash, но не меняет уже отправленный offer при последующем
обновлении контактов.
`UNIQUE(series_id, version)`, `UNIQUE(offer_number)` и
`UNIQUE(contract_number)`. Номер current family резервируется атомарно при
создании draft до render; synthetic test использует тот же non-reuse invariant.

### `contract_artifacts`

- `id`, ровно одна ссылка `contract_offer_id XOR formation_certificate_id`;
- `artifact_kind` (`offer_html|offer_pdf|formation_certificate_pdf`),
  `private_r2_key`, `content_type`, `size_bytes`, `sha256`, `source_hash`;
- `template_version_id`, `renderer_id`, `renderer_contract_version`,
  `worker_compatibility_date`, `created_at`.

По одному artifact каждого kind на offer/certificate. Строки и private object
append-only: download повторно вычисляет SHA-256, проверяет owner/admin на сервере
и пишет audit. HTML/PDF сохраняются до перевода offer в `sent`; неудачная D1
фиксация удаляет только новую orphan R2 copy.

### `contract_render_attempts`

- `id`, `contract_offer_id`, `attempt_no`;
- `renderer_id` (`cloudflare-browser-run-pdf-v1`),
  `worker_compatibility_date`;
- `source_manifest_hash`, `started_at`, `finished_at`;
- `status` (`succeeded|retryable_failed|failed`), `error_code`;
- `browser_ms_used`, `pdf_size_bytes`, `pdf_sha256`, `retry_after_seconds`.

`UNIQUE(contract_offer_id, attempt_no)`. Не более трёх retry на 429/5xx;
успешный attempt переводит `render_status=ready` и сохраняет immutable PDF в R2.
Accepted/approved artifact никогда не перерендеривается. Managed Chromium version
не считается pin-able renderer version; canonical source hash и фактический PDF
hash имеют разные назначения.

### `contract_acceptances`

- `id`, `contract_offer_id`, `user_id`, `accepted_at`;
- `ip_retention_value`, `ip_expires_at`, `user_agent`, `acceptance_text_version`;
- `acceptance_text`, `contract_hash`, `idempotency_key`.

`UNIQUE(contract_offer_id)`. Parent acceptance и последующее admin
approval/activation — разные действия; только второе формирует contract.
Отдельная append-only `contract_parent_actions` хранит accept и decline,
request hash/idempotency, offer hash, versioned text, user-agent и ограниченное
по сроку hashed IP evidence. `contract_admin_actions` аналогично дедуплицирует
create/render-send/form-activate и связывает каждое действие с audit event.

### `contract_deliveries`

- `id`, `contract_offer_id`, `contract_id` nullable,
  `artifact_kind` (`offer_html|offer_pdf|formation_certificate_pdf`),
  `artifact_hash`;
- `channel` (`portal|fake_email`), `recipient_role` (`parent|verein`),
  `recipient_user_id`, `delivery_status`;
- `dedupe_key`, `delivered_at`, `access_expires_at`, `created_at`.

Delivery evidence не содержит body договора. Повторная доставка имеет
idempotency/dedupe key; ссылка на private artifact не заменяет запись события.

### `contract_formation_certificates`

- `id`, `contract_id`, `contract_offer_id`, `contract_number`;
- `source_snapshot_json`, `source_hash`, `schema_version`, `template_version`;
- `parent_acceptance_id`, `parent_accepted_at`, `formed_by_admin_user_id`,
  `formed_at`, `offer_pdf_hash`;
- `render_status` (`pending|rendering|ready|failed`), `attempts`, `error_code`;
- `certificate_pdf_r2_key`, `certificate_pdf_hash`, `generated_at`, timestamps.

`UNIQUE(contract_id)` и `UNIQUE(contract_offer_id)`. Formation transaction
создаёт immutable source snapshot/hash с обеими сторонами/timestamps и pending
certificate record. Renderer может retry только тот же source hash; первый
успешный PDF становится immutable и доставляется обеим сторонам вместе с
исходным offer PDF. Ready certificate не перерендеривается. Certificate не
содержит изображения подписей и не объединяет/переписывает offer PDF.

### `contracts`

- `id`, `contract_offer_id`, `contract_number`, `user_id`, `child_id`;
- `course_group_id`, `individual_request_id`, `funding_authorization_id`,
  `enrollment_id`, `service_engagement_id`;
- `operational_status` (`active|terminated|expired|void`);
- `parent_acceptance_id`, `formed_at`, `formed_by_admin_user_id`;
- `activated_at`, `effective_from`, `effective_to`,
  `auto_renewal_blocked_at` nullable;
- `created_at`.

`UNIQUE(contract_offer_id)`. Contract указывает на immutable approved offer, а
не копирует изменяемые profile/course данные. В production contract number
обязателен, точно наследуется из offer и unique; synthetic test может оставаться
только на `offer_number` и не создавать production-shaped `contracts`.

Child/service/funding/enrollment/engagement relations либо выводятся из
approved offer, либо проверяются на точное равенство ему; для contract повторно
действует XOR service relation. `formed_at` фиксирует admin approval и не
сдвигается к будущему `effective_from`. Связанные enrollment/service engagement
могут иметь `status=active` с будущим `active_from`; вычисления активности и
occupancy обязаны учитывать date boundary, а не только status.
Contract `effective_from|effective_to` наследует inclusive calendar-date
semantics offer; для open-ended допустим null, кроме funded Nachhilfe safe path
— для него end date обязателен и не выходит за current authorization.
Enrollment `active_until` остаётся exclusive.

### `contract_events`

- `id`, `contract_id`, `event_type`
  (`formed|activated|amended|funding_amended|attendance_ceased|withdrawal_received|withdrawn|termination_received|renewal_blocked|termination_effective_date_confirmed|termination_disputed|mutual_termination_approved|mutual_termination_declined|terminated|expired|voided`);
- `effective_at`, `reason_code`, `source_offer_id`;
- `actor_user_id`, `metadata_json`, `created_at`.

События append-only. Обычное изменение parent-facing contract terms требует
нового approved offer; событие хранит ссылку, но не переносит старое acceptance.
`funding_amended` — узкое исключение из `funding_amendments`: оно меняет только
current funding authorization при неизменных parent-facing terms и не мутирует
исходный offer/PDF.

`formed_at` совпадает с transactional admin approval после проверки
`parent_acceptance_id` той же offer version/hash. Parent acceptance без admin
approval не создаёт `contracts`. Parent/admin history строится из offer,
acceptance, contract и events; закрытие enrollment/engagement ничего не удаляет.

### `contract_end_requests`

- `id`, `contract_id` nullable until safe match, `requested_by_user_id` nullable,
  `submission_channel` (`authenticated_portal|public_function|admin_recorded`),
  `requester_identity_evidence_json` nullable, `kind`
  (`withdrawal|ordinary_termination|extraordinary_termination|mutual_termination_request`);
- `requested_effective_on`, `received_at`, `recorded_at`,
  `server_ingested_at`, `request_text_version`, `request_hash`, `idempotency_key`;
- `status`
  (`received|effective_date_confirmed|disputed|approved|declined|completed`);
- `calculated_effective_on`, `admin_reason`, `reviewed_by`, `reviewed_at`;
- `external_debt_check_result` nullable
  (`not_checked|no_debt_reported|debt_reported|unknown`);
- `confirmation_delivery_id`, `created_at`, `updated_at`.

Receipt `withdrawal|ordinary_termination|extraordinary_termination` не ждёт
admin/debt check и immutable после submit. `approved|declined` допустимы только
для `mutual_termination_request`: его базовый переход
`received -> approved|declined`, а необходимость ручного контакта оформляется
отдельной admin task, не status request. Для Kündigung admin может подтвердить
дату либо открыть `disputed`. Debt field — manual external attestation, не
portal ledger. Для `group_monthly` calculated effective date — последний день
месяца фактического `received_at`; для `group_yearly` receipt до contractual end
фиксирует запрет renewal и сохраняет текущий effective end. Debt не меняет
расчёт. Для individual/Nachhilfe уведомление прекращает будущие неоказанные
units. Уже согласованный lesson может остаться к внешнему ручному выставлению
только если teacher фактически пришёл/начал ждать раньше receipt notice; receipt
до прихода teacher исключает требование. Произвольного minute cutoff нет, портал
не создаёт invoice/charge.

`public_function` нельзя строить как owner-session-only: unmatched submission
сохраняется без раскрытия существования contract/account, проходит abuse guard
и связывается с contract только безопасным match/manual review. Для applicable
§ 356a flow identity payload содержит только name, contract/part identifier и
electronic confirmation channel; § 312k flow использует обязательные поля своей
confirmation page. `confirmation_delivery_id` фиксирует немедленную durable
receipt delivery. Route включается только из approved legal-profile snapshot.
Для portal/public submission `received_at=server_ingested_at`; при
`admin_recorded` поле хранит подтверждённое время получения email/звонка/визита,
а `recorded_at` — более позднее время ввода. Исправление времени требует
superseding audit evidence, бесследное backdate запрещено.

### `service_attendance_notices`

- `id`, `contract_id`, `service_engagement_id`, `requested_by_user_id`;
- `submission_channel` (`authenticated_portal|admin_recorded`),
  `received_at`, `recorded_at`, `server_ingested_at`, `notice_text_version`,
  `notice_hash`, `idempotency_key`;
- `teacher_notification_task_id`, `confirmation_delivery_id`;
- `scheduled_lesson_ref` nullable, `agreed_start_at` nullable,
  `agreed_place_ref` nullable;
- `teacher_arrived_at`, `teacher_waited_until`, `teacher_attested_by`,
  `teacher_attested_at` nullable, `created_at`.

Таблица только для `individual|nachhilfe`; это append-only notice «больше не
посещаем», а не statutory Widerruf и не обязательная формальная Kündigung.
Receipt одной transaction ставит engagement `ended`, фиксирует
`attendance_ceased_at`, создаёт `attendance_ceased` event, teacher/admin task и
durable confirmation. Любой unit после receipt запрещён. Если конкретный lesson
уже был согласован, external manual billing review допустим только при
`teacher_arrived_at < received_at` и attested actual arrival/waiting.
Отсутствующий/более поздний arrival evidence либо receipt до arrival исключает
требование. Портал не создаёт invoice/charge. Optional formal termination может
быть отправлен отдельно через `contract_end_requests`. Для portal notice
`received_at=server_ingested_at`; delayed admin entry сохраняет фактический
external receipt отдельно от `recorded_at` и не превращает своевременное notice
в no-show.

### `media_consents`

- `id`, `user_id`, `child_id`,
  `capture_scopes_json` (`photo|video` only),
  `publication_channels_json` (`website|social_media|print` only),
  `text_version`, `withdrawal_contact_version_id`,
  `withdrawal_contact_snapshot_hash`;
- `decision` (`granted|declined|revoked`), `decision_source`
  (`portal|office|email|phone|account_deletion`), `decided_at`, `received_at`,
  `effective_from`;
- `recorded_by_user_id` nullable, `recorded_at`, `evidence_hash`,
  `request_dedupe_key`;
- `source_contract_offer_id`, `source_privacy_request_id` nullable;
- `supersedes_consent_id` nullable, `created_at`.

Каждое новое решение append-only/superseding. Contract acceptance не создаёт
его автоматически; decline не блокирует contract. Publication конкретного
material type разрешена только при grant этого capture type и target channel.
Offer/PDF хранит snapshot решения, а последующий revoke меняет operational
permission только на будущее — запрещает новые capture/upload/post/repost/
reprint — и не перезаписывает accepted PDF. Media files и historical
publication index в этой модели отсутствуют; specifically named legacy URL
обрабатывается отдельным `privacy_requests(kind=media_content_request)`.

Grant/decline может прийти из portal contract flow. Для revoke нет parent
self-service endpoint: уполномоченный admin записывает полученный лично, по
email или телефону факт без approve/decline, причём
`effective_from=received_at`, а `recorded_at` может быть позже. Исправление
ошибочной записи создаёт superseding event/audit и не переписывает историю.
`request_dedupe_key` уникален в рамках consent stream, поэтому повтор ввода
одного обращения не дублирует revoke. Evidence хранит hash/reference и result
обычной identity linkage check, но не полный email body или запись звонка.

Portal action `decision=granted` и любая publication, опирающаяся на него,
доступны только при active документированной compliance assessment, которая
подтверждает применимый withdrawal path по Art. 7(3) GDPR/EDPB guidance, либо
при реализованном и утверждённом ином compliant path. Без такого gate grant UI/
API disabled; `declined`/отсутствие grant не блокируют contract. Поле «risk
accepted» или обычный admin override не может обойти этот invariant.

Successful account closure одной transaction создаёт revoke для каждого current
grant с `decision_source=account_deletion`,
`received_at=effective_from=account_deleted_at` и затем минимизирует profile/
child links. Эти events сохраняются только в минимальном объёме, допускаемом
retention policy. Withdrawal contacts берутся из утверждённой versioned
configuration со ссылками на официальный Impressum и официальную страницу
Kontakt; runtime scraping и hardcoded contact fields не являются source of
truth.

### `privacy_acknowledgements`

- `id`, `user_id`, `privacy_notice_version`, `acknowledged_at`;
- `evidence_hash`, `source_context`, `created_at`.

`UNIQUE(user_id, privacy_notice_version)`. Поля на `users` могут кешировать
последнюю принятую версию, но история acknowledgement не заменяется media
consent или contract acceptance. SEPA/medical consent tables в MVP не создаются.

## Пересмотр цены

### `price_review_triggers` и `price_review_trigger_batches`

- trigger: `id`, `course_group_id`, `source_kind`, `source_ref`, `reason_code`,
  `effective_on`, old/new active и lookup counts, optional requested
  `price_version_id`, stable `dedupe_key`, `status`, timestamps;
- link: unique `trigger_id`, `batch_id`, `created_at`.

Один boundary/admin-comparison dedupe key связывается максимум с одним batch.
Price-version promotion сам trigger не вставляет. Boundary trigger записывается
в транзакции activation/future end; reconciler использует тот же key и
singleton `price_review_reconciler_state` watermark. Watermark начинает scan с
момента migration, а все ещё будущие boundaries проверяются независимо от него:
это не воспроизводит исторические activations при первом запуске и не теряет
future activation/end.

### `price_review_batches`

- `id`, `course_group_id`, `reason_code`;
- `old_active_count`, `new_active_count`, `old_lookup_children_count`,
  `new_lookup_children_count`;
- `price_version_id`, `effective_on`, `earliest_effective_from`;
- immutable `calculation_snapshot_json`, `calculation_snapshot_hash`, stable
  `dedupe_key`;
- `status`
  (`draft|pending_notification_approval|notifications_approved|sending|awaiting_responses|completed|cancelled`);
- `created_at`, `notification_approved_at`, `notification_approved_by`.

### `price_review_items`

- `id`, `batch_id`, `version`, random non-bearer `public_reference`,
  `enrollment_id` nullable, `legacy_enrollment_id` nullable, `user_id` nullable;
- `old_base_price_cents`, `old_price_cents`, `new_base_price_cents`,
  `new_final_price_cents` nullable;
- `old_price_source`, `new_price_source`, `old_price_mode`, `new_price_mode`
  nullable; old/new price-version и rule IDs;
- expected occupancy/lookup counts, `target_state_hash`, `decision_code`,
  `decision_json`, stable `dedupe_key`;
- `terms_snapshot_json`, `item_hash`, `acceptance_text_version`;
- `status`
  (`draft|manual_contact_required|notification_approved|sent|accepted_by_parent|declined_by_parent|response_overdue|approved_by_admin|scheduled|applied|cancelled|superseded`);
- `sent_at`, `response_deadline`, `responded_at`;
- `final_admin_confirmed_at`, `final_admin_confirmed_by`,
  `final_admin_confirmation_reason`;
- `manual_contact_task_id`, `scheduled_for`, `applied_at`.

После `sent` item immutable. Изменение price/effective/terms создает новую
version и делает старую `superseded`; parent acceptance не переносится.
Ровно одна target relation: `enrollment_id XOR legacy_enrollment_id`.
Для этой XOR-модели создаются два partial unique index:
`(batch_id, enrollment_id, version) WHERE enrollment_id IS NOT NULL` и
`(batch_id, legacy_enrollment_id, version) WHERE legacy_enrollment_id IS NOT NULL`;
для target одновременно только один open item на одну effective date.

Sendable portal item создаётся только когда его принятый текущий
`final_price_cents` или `price_mode` отличается от рассчитанного предложения;
поэтому triggering enrollment с уже актуальным accepted price snapshot не
получает лишнего item. Batch без таких items завершается без рассылки.
Legacy-only target без digital acceptance остаётся
sendable, если legacy family claimed этим active user, service mapping
однозначен, а current amount/source/mode известны или подтверждены admin. Он
проходит тот же parent/admin workflow, но apply создаёт
`legacy_service_price_assignments`, не переписывает imported source и не создаёт
contract/PDF. Represented legacy row второй item не создаёт. Unclaimed/
conflicting/unknown legacy получает `manual_contact_required`; null amount/
source/mode требует явный `decision_code` и запрещает send/accept/apply.
Batch notification approval и per-item final admin confirmation — разные
actions/actors/timestamps. `accepted_by_parent` не меняет enrollment;
`declined_by_parent|response_overdue` создают deduped admin task. Только
`approved_by_admin|scheduled` допускает idempotent apply. `response_deadline`
равен 14 календарным дням после send. При final admin confirmation
`scheduled_for = first_day_of_next_calendar_month(final_admin_confirmed_at,
Europe/Berlin)`; apply до этой даты и retroactive apply запрещены.

Новый trigger для той же group supersede каждый open prior-batch item, если
count/price-version/rule/target state больше не совпадает. Final confirmation и
apply conditional-transaction повторно требуют active account, qualifying
active enrollment на effective date, exact current old price/mode, matching
new count/version/rule и отсутствие newer open/applied item. Любой mismatch
ставит `superseded`, сохраняет response evidence и не меняет enrollment.
Legacy peer, подтверждённый typed решением `same_service_duplicate`, также
исключается из accept/final-confirm/apply target assertions. Незавершённый item
supersede-ится атомарно вместе с reconciliation evidence; applied item требует
отдельной сверки и блокирует duplicate resolution.

### `price_change_acceptances`

- `id`, `price_review_item_id`, `user_id`, `accepted_at`;
- `ip_retention_value`, `ip_expires_at`, `user_agent`, `acceptance_text`;
- `acceptance_text_version`, `item_hash`, `idempotency_key`.

`UNIQUE(price_review_item_id)`. Согласие относится к неизменяемой item
version/hash, не к group batch.

### Evidence, delivery и apply

- `price_review_parent_actions`: append-only accept/decline attempt,
  request/idempotency hashes и `applied|stale|late` evidence status;
- `price_review_admin_actions`: append-only admin comparison, notification
  approval/dispatch, final confirmation и manual scheduler invocation со ссылкой
  на обязательный `audit_events` row;
- `price_review_outbox_events` и `price_review_deliveries`: typed deduped fake
  delivery; cabinet URL строится из portal origin и random public reference;
- `price_change_apply_events`: unique immutable apply evidence на item с old/new
  amounts/provenance, effective date, evidence hash и audit link;
- `price_review_action_assertions`: append-only transaction assertions; failed
  guard откатывает всю mutation batch.

`public_reference` только маршрутизирует owner-authenticated lookup и не является
bearer token. Parent lookup всегда требует `user_id`; admin и document access
остаются отдельными RBAC/audit paths.

### `legacy_service_price_assignments`

- `id`, `legacy_enrollment_id`, `price_review_item_id` nullable;
- `base_price_cents`, `final_price_cents`, `price_source`, `price_mode`;
- `effective_from`, `effective_until` nullable, `status` (`scheduled|active|ended`);
- `applied_by_event_id`, `created_at`.

Imported `Value18`/source row immutable. На дату действует максимум одна
assignment; overlapping activation защищена conditional transaction/index.
Cabinet и следующий price review используют current effective assignment, а
при её отсутствии — подтверждённую imported planned price либо explicit unknown.

## Сообщения и уведомления

### `support_threads`

- `id`, `user_id`, `category`, `status`
  (`open|waiting_for_admin|waiting_for_parent|answered|closed`);
- `subject`, `created_at`, `updated_at`, `closed_at`.

### `support_messages`

- `id`, `thread_id`, `sender_kind` (`parent|admin|system`);
- `sender_user_id`, `body`, `created_at`.

### `absence_reports`

- `id`, `thread_id`, `user_id`, `child_id`, `enrollment_id`;
- `absence_date`, `reason_code`, optional operational `reason_text`, `message_id`,
  `created_at`.

Структурированная absence record и сообщение создаются одной операцией.

### `email_outbox`, `telegram_outbox` и Telegram delivery evidence

Общие поля:

- `id`, `source_kind`, `source_id`, `template_or_category`;
- `payload_json` с минимизированными данными, `dedupe_key`;
- `not_before`, `status`; email допускает
  `pending|processing|retry|sent|dead|cancelled`, Telegram дополнительно допускает
  terminal-for-automatic-worker `delivery_unknown`;
- `attempts`, `max_attempts`, `next_attempt_at`, `last_error_code`;
- `locked_at`, `sent_at`, `created_at`.

Email дополнительно хранит recipient/reference template; Telegram — bureau chat
destination из конфигурации, но не secret token. Telegram также хранит stable
PII-free `delivery_reference`, `dispatch_started_at` как durable marker перед
первым возможным HTTP dispatch, safe `provider_message_id` только после
проверенного success и optional `delivery_unknown_at`/`resolved_at`. Token, chat
ID, request/response body и provider description в D1/audit/log не сохраняются.

`UNIQUE(dedupe_key)` исключает только вторую outbox row для того же доменного
события; Telegram `sendMessage` не имеет документированного idempotency key,
поэтому этот constraint не доказывает exactly-once внешнего side effect. Stale
`processing` без `dispatch_started_at` можно reclaim. Stale `processing` после
marker атомарно переводится в `delivery_unknown` и не выбирается обычным cron.
Valid `ok=false` может очистить marker только в той же D1-операции, которая
фиксирует conclusive retry/dead result: `429`/`408`/`425`/`5xx` retryable, а
permanent rejection становится `dead`. Неопределенный transport/timeout,
unreadable/oversized/malformed response, ambiguous envelope, invalid/mismatched
success или post-send commit result сохраняет marker и safe code
`TELEGRAM_DELIVERY_UNKNOWN`.

Manual resolution `delivery_unknown` выполняется только idempotent audited
командой `confirm_sent|retry_after_review|cancel`. Audit хранит actor, timestamp,
обязательную безопасную reason/evidence и before/after status; delivery/dedupe
identity не меняется. `retry_after_review` разрешен только после operator check,
что delivery reference отсутствует в approved destination, и создает новый
dispatch attempt, а не скрыто переиспользует ambiguous lease.

`telegram_delivery_attempts` содержит append-only identity и допустимый переход
`dispatch_started → delivered|not_delivered|delivery_unknown`; terminal evidence
immutable. `telegram_delivery_resolutions` и
`telegram_delivery_resolution_assertions` связывают ровно один exact attempt,
actor/reason/evidence, before/after state и commit assertion; update/delete
запрещены. `telegram_destination_activation_floors` монотонно исключает backlog,
а `telegram_destination_policies` durable связывает claim с configured
`max_attempts`. `telegram_preview_smoke_claim_authorizations` и
`telegram_preview_smoke_claim_assertions` разрешают только отдельно
подготовленный disarmed `max_attempts=1` cohort и не создают общий bypass
обычного outbox claim. `telegram_preview_smoke_abort_authorizations` и
`telegram_preview_smoke_abort_assertions` образуют отдельную append-only
no-send ветку: exact target-bound synthetic row можно атомарно перевести в
`cancelled` только из `pending` либо partial `processing`, когда для неё нет ни
одного `telegram_delivery_attempts`. Initial-state/transition triggers,
append-only guards и ordinary-claim exclusion запрещают abort после dispatch,
повторный abort и Cron reclaim smoke signature, включая stale partial claim.

Если exact smoke row остался `processing` после durable `dispatch_started`,
target/cohort-bound reconcile разрешён только при истёкшем `lease_until`, exact
claim proof, одном unresolved attempt и отсутствии abort/provider request ID.
Команда не вызывает provider: guarded updates переводят attempt, затем outbox в
`delivery_unknown`, увеличивают `attempts` до 1 и освобождают lease. Partial или
completed D1 result read-back reconciles идемпотентно; row далее подчиняется
обычной `telegram_delivery_resolutions` state machine и никогда не возвращается
в smoke run/abort.

Claim исключает destination при unresolved `delivery_unknown`, terminal `dead`,
active durable cooldown или pre-activation row. Для `429` cooldown равен
computed `next_attempt_at` и сохраняется даже при missing/invalid
`parameters.retry_after`. Поэтому новый row не обходит
неразобранный инцидент, а configured `max_attempts` применяется из durable
destination policy, а не только из producer default.

Migration `0017_telegram_delivery_certainty.sql` реализует эту модель;
`0016_legacy_import_release_control.sql`,
`0018_legacy_import_release_hardening.sql` и reconciliation suffix `0019`–`0022`
реализуют hardened legacy release control. Весь append-only set `0001`–`0022`
применён в deployed preview D1 2026-08-20; ledger/schema/FK verification passed.

Email claim повторяет recipient/account/token predicates в conditional `UPDATE`,
а не доверяет предварительному candidate `SELECT`. Privacy closure меняет
account только при отсутствии его `processing` email; тот же closure batch
отменяет `pending|retry`. Инвариант состояния: `users.account_status='closed'`
и `email_outbox.status='processing'` для этого recipient не существуют
одновременно.

При privacy closure operational payload (`support_threads.subject`,
`support_messages.body`, `absence_reports.reason_text`, свободные поля/
preferences `individual_requests`, snapshots неотправленных draft offers) может
быть только однонаправленно заменён фиксированным marker/пустой структурой.
Обычные immutable triggers сохраняются для любых других updates. Retained
contract/funding/acceptance evidence не входит в эту минимизацию и доступно
только через отдельную purpose-bound authorization + audit boundary.

`privacy_r2_cleanup_jobs` использует `lease_owner`/`lease_until`, чтобы Worker
мог вернуть прерванный `processing` job в повторную обработку. При upgrade на
`0014` существующие `processing` rows, созданные до появления lease columns,
одноразово переводятся в retryable `failed` с typed code
`MIGRATION_LEASE_RECOVERY_REQUIRED`: nullable lease не оставляет cleanup
навсегда зависшим.

## Ключевые вычисляемые инварианты

```text
active_children_count(course, as_of) =
  COUNT(DISTINCT child_id) из qualifying portal enrollments
  UNION qualifying current legacy enrollments
  MINUS legacy records, represented_by_enrollment_id которых уже active
```

Учитываются `active_from <= as_of` и
`active_until IS NULL OR as_of < active_until`; для portal enrollment
дополнительно требуется `status=active`, для legacy — approved
`is_active_for_occupancy`. Статус без дат недостаточен.

```text
quote lookup count    = min(active_children_count(planned_start) + 1, 6)
repricing lookup count = no lookup/items при active=0,
                         иначе min(active_children_count(effective_from), 6)
```

Capacity и price lookup count — разные понятия. Trial не входит ни в один
ценовой count. Поэтому `5↔6` меняет lookup, а `7→6` — нет.

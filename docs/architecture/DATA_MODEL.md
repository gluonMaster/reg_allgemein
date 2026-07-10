# Целевая модель данных D1

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

## Identity и доступ

### `users`

- `id`, `email`, `email_normalized`, `password_hash`;
- `pending_email`, `pending_email_normalized`, `pending_email_expires_at`,
  `email_version`;
- `email_verified_at`, `role`, `is_blocked`;
- `first_name`, `last_name`, `phone`, `preferred_language`;
- `privacy_notice_version`, `privacy_accepted_at`;
- `session_version`, `created_at`, `updated_at`.

`UNIQUE(email_normalized)` и partial unique для непустого
`pending_email_normalized`. При запросе смены транзакция проверяет, что target не
занят ни current, ни неистекшим pending email другого user. Регистрация и
подтверждение выполняют ту же cross-field проверку; confirmation меняет current
email только conditional transaction. `role` — только `parent|admin`.

### `auth_tokens`

- `id`, `user_id`, `kind` (`email_verification|password_reset`);
- `token_hash`, `target_email_normalized`, `email_version`;
- `expires_at`, `used_at`, `created_at`;
- `requested_ip_hash` или минимизированные anti-abuse metadata.

`UNIQUE(token_hash)`. Использование выполняется conditional update при
`used_at IS NULL AND expires_at > now`; email token дополнительно требует
совпадения current `email_version` и target current/pending address. Новый
email-change request инвалидирует старый version.

### `auth_sessions`

- `id`, `user_id`, `jti_hash`, `session_version`;
- `expires_at`, `revoked_at`, `created_at`, `last_seen_at`.

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

Используется для claim conflicts, import ambiguity, unknown mapping/price и
других случаев, где автоматическая догадка запрещена.

### `privacy_requests`

- `id`, `subject_user_id`, `requested_by_user_id`, `kind` (`export|delete`);
- `status` (`requested|reviewing|blocked_by_retention|approved|processing|completed|failed|cancelled`);
- `retention_holds_json`, `safe_summary_json`, `decision_reason`;
- `artifact_r2_key`, `artifact_expires_at` для private export;
- `reviewed_by`, `reviewed_at`, `completed_at`, timestamps.

Export/delete actions используют audit и idempotency. Export artifact шифруется
или выдаётся только через short-lived authenticated response. Delete dry-run не
меняет данные. До решения `OQ-005` физическое удаление held records запрещено.

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

## Legacy family и дети

### `legacy_families`

- `id`, `source_namespace`, `source_family_id`;
- `claimed_by_user_id`, `claimed_at`;
- `continuity_status` (`stable|needs_review|corrected`);
- `created_at`, `updated_at`.

`UNIQUE(source_namespace, source_family_id)`. Это stable cross-period identity.
Claim owner наследуется новым period snapshot и не перезаписывается reimport.
Конфликт/редкое изменение ID создаёт review; автоматический merge по имени,
адресу или email запрещён.

### `legacy_family_periods`

- `id`, `legacy_family_id`, `academic_period_id`, `import_run_id`;
- `parent_name_raw`, `address_raw`, `phone_raw`, `mobile_raw`;
- `last_seen_run_id`, `is_current`, `retired_at`, `created_at`, `updated_at`.

`UNIQUE(legacy_family_id, academic_period_id)`. Source/contact snapshots и
enrollments period-scoped; claim/owner и stable child identity — нет.

### `legacy_family_emails`

- `id`, `legacy_family_id`, `legacy_family_period_id`, `email_raw`,
  `email_normalized`;
- `source_access_id`, `last_seen_run_id`, `is_current`.

Сохраняются все distinct emails строк семьи. Конфликтующие контакты создают
issue; выбор «первого» email запрещен.

### `family_claims`

- `id`, `legacy_family_id`, `user_id`;
- `status` (`candidate|claimed|conflict|released`);
- `consented_at`, `claimed_at`, `review_task_id`, `created_at`.

`UNIQUE(legacy_family_id)` для активного `claimed`; claim выполняется атомарно.

### `children`

- `id`, `owner_user_id`, `legacy_family_id`;
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
- `status_code_raw`, `lesson_kind`, `contract_kind`, `price_mode`;
- `planned_price_cents`, `notes_raw`, `needs_admin_review`;
- `is_active_for_occupancy`, `represented_by_enrollment_id`;
- `last_seen_run_id`, `is_current`, `retired_at`, `created_at`, `updated_at`.

`UNIQUE(source_record_key)`. Main/package одного child/course и legacy запись,
уже представленная portal enrollment, не считаются дважды.

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
- `children_count`, `regular_price_cents`, `special_price_cents`;
- `raw_json`, `created_at`.

Уникальность определяется всем normalized lookup contract. Дубли без
однозначного winner блокируют автоматический lookup.

### `price_quotes`

- `id`, `user_id`, `child_id`, `course_group_id`, `planned_start_on`;
- `active_children_count_as_of`, `lookup_children_count`;
- `price_version_id`, `price_rule_id`, `price_mode`, `contract_kind`;
- `duration_source`, `duration_minutes_used`, `billing_period_code`;
- `estimated_missing_duration`, `requires_admin_confirmation`;
- `base_price_cents`, `manual_discount_cents`, `manual_override_cents`;
- `final_price_cents`, `decision_code`, `decision_json`;
- `confirmed_by_admin_user_id`, `confirmed_at`, `confirmation_json`;
- `status` (`quoted|needs_admin_confirmation|confirmed|stale|superseded`),
  `created_at`, `expires_at`.

`price_mode`: `standard|ov_special|manual`. Public quote всегда `standard` до
явного admin decision.

`duration_source`: `plusbtext|price_rule|fallback_90|not_applicable`.
`billing_period_code` для `fallback_90` равен `needs_admin_confirmation`, пока
админ не подтвердит фактическую длительность, сумму и billing period. Такой
quote имеет `decision_code = ESTIMATED_MISSING_DURATION`, не участвует в
monthly total/repricing и не может быть использован в отправленном offer.
Подтверждение выполняется атомарно, требует reason/audit; изменение рассчитанных
условий создаёт новый quote snapshot, а не переписывает исходный decision.

### `enrollments`

- `id`, `user_id`, `child_id`, `course_group_id`, `legacy_enrollment_id`;
- `lesson_kind`, `status`
  (`draft|contract_offered|active|paused|cancelled|ended`);
- `contract_kind`, `active_from`, `active_until`;
- `current_price_cents`, `price_mode`, `price_effective_from`;
- `source` (`legacy|portal|admin`), `created_at`, `updated_at`.

Не более одного пересекающегося active enrollment для child/course. D1 не имеет
полноценного exclusion constraint, поэтому это обеспечивается индексами на
нормализованный active key плюс transactional check и тестами concurrency.

## Trials и индивидуальные запросы

### `trial_bookings`

- `id`, `user_id`, `child_id`, `course_group_id`, `session_id`;
- `status` (`requested|confirmed|rejected|cancelled|attended|no_show|converted`);
- `requested_date`, `confirmed_date`, `reviewed_by`, `reviewed_at`;
- `decision_reason`, `idempotency_key`, `created_at`, `updated_at`.

Один open trial на child/course.
`rejected|cancelled|no_show|converted` terminal; `attended` допускает только
переход в `converted`.

### `individual_requests`

- `id`, `user_id`, `child_id`, `request_kind` (`nachhilfe|individual`);
- `funding_kind` (`self_pay|jobcenter|socialamt|unknown`);
- `subjects_raw`, `preferred_days_json`, `preferred_time_windows_json`;
- `preferred_format`, `preferred_locations_json`;
- `status` (`draft|submitted|needs_documents|needs_info|pending_admin_review|approved|rejected|cancelled`);
- `admin_decision`, `admin_notes`, `created_at`, `updated_at`.

Cross-field constraint: submitted `individual` требует
`funding_kind=self_pay`; submitted `nachhilfe` требует
`funding_kind=jobcenter|socialamt` и document/authorization. UI перенаправляет
self-pay tutoring intention в `individual`, но сервер проверяет это независимо.

### `service_engagements`

- `id`, `user_id`, `child_id`, `individual_request_id`;
- `request_kind` (`nachhilfe|individual`), `funding_authorization_id` nullable;
- `status` (`draft|contract_offered|active|paused|cancelled|ended`);
- `active_from`, `active_until`, `contract_id` nullable until activation;
- `created_at`, `updated_at`.

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
`funding_authorization_id` со статусом `approved`, authority
`jobcenter|socialamt` и действующим сроком на дату начала. `individual` требует
`funding_authorization_id IS NULL` и исходный request с `funding_kind=self_pay`.

### `funding_authorizations`

- `id`, `request_id`, `kind` (`jobcenter|socialamt`);
- `authority_name_snapshot`, `authority_reference`;
- `status`, `valid_from`, `valid_until`, `approved_hours_total`;
- `decision_notes`, `reviewed_by`, `reviewed_at`, `created_at`, `updated_at`.

Срок и часы принадлежат разрешению, а не каждой странице документа. Остаток
часов не рассчитывается, пока attendance/billing вне MVP.

### `authorization_documents`

- `id`, `authorization_id`, `user_id`, `child_id`;
- `r2_key`, `original_filename`, `mime_type`, `detected_type`;
- `size_bytes`, `sha256`;
- `review_status` (`quarantined|reviewable|approved|rejected|deleted`);
- `quarantine_reason`, `released_by`, `released_at`;
- `uploaded_at`, `deleted_at`, `replaced_by_document_id`.

R2 key уникален и случайный. До решения `OQ-009` новый файл остается
`quarantined`; доступен только уполномоченному admin через изолированный viewer,
а не обычный/public download. Переход из quarantine аудируется. Физическое
удаление следует retention policy.

## Договоры

### `contract_template_versions`

- `id`, `template_id`
  (`group_yearly|group_monthly|individual_hourly|nachhilfe_hourly`);
- `template_version`, `render_schema_version`, `clause_set_version`;
- `template_bundle_r2_key`, `bundle_hash`, `html_source_hash`,
  `css_source_hash`;
- `asset_manifest_json`, `font_manifest_json`, `required_fields_json`;
- `renderer_id`, `renderer_contract_version`, `worker_compatibility_date`;
- `usage_scope` (`synthetic_test|production`);
- `approval_status` (`draft|approved|retired`);
- `approval_basis`
  (`synthetic_fixture|authorized_verein_approval|legal_review`);
- `approved_by`, `approved_at`, `valid_from`, `valid_to`, `created_at`.

`UNIQUE(template_id, template_version)`. После `approved` bundle и manifests
immutable и удерживаются не короче связанных договоров по `OQ-005`: одного hash
без сохраняемого source/assets недостаточно для воспроизведения.
`usage_scope=synthetic_test` разрешает send/accept только внутри изолированного
test harness с синтетическими сторонами и никогда — при production config.
Реальный offer
требует одновременно `usage_scope=production` и
`approval_status=approved` с
`approval_basis=authorized_verein_approval|legal_review`.

### `contract_offers`

- `id`, `series_id`, `version`, `offer_number`, `contract_number` nullable,
  `user_id`, `child_id`;
- `course_group_id`, `individual_request_id`, `funding_authorization_id`,
  `enrollment_id`, `service_engagement_id`;
- `contract_kind`, `template_version_id`, `render_schema_version`,
  `start_date`;
- `billing_model`
  (`annual_total_in_instalments|monthly_fixed|delivered_units|third_party_funded`),
  `currency`, `unit_minutes`, `price_mode`, `price_cents`;
- `provider_snapshot_json`, `party_snapshot_json`, `service_snapshot_json`,
  `schedule_snapshot_json`;
- `billing_snapshot_json`, `line_items_json`, `term_snapshot_json`,
  `termination_snapshot_json`, `withdrawal_snapshot_json`;
- `clauses_manifest_json`, `attachments_manifest_json`,
  `privacy_notice_version`;
- `render_input_hash`, `artifact_manifest_json`, `contract_html_r2_key`,
  `contract_pdf_r2_key`, `contract_hash`;
- `render_status` (`not_started|rendering|ready|failed`);
- `status` (`draft|sent|accepted_by_parent|declined_by_parent|approved_by_admin|cancelled|expired|superseded`);
- `sent_at`, `expires_at`, `accepted_at`, `declined_at`;
- `admin_approved_at`, `cancelled_at`, `status_reason`;
- `created_at`, `updated_at`.

После `sent` содержимое immutable. Изменение условий создает новую version и
делает старую `superseded`. Проверка требует ровно одну service relation:
`course_group_id XOR individual_request_id`. Nachhilfe offer требует approved,
действующий на `start_date` Jobcenter/Sozialamt `funding_authorization_id` и
`billing_model=third_party_funded`; individual offer запрещает funding
authorization. Group relation требует `enrollment_id` и запрещает
`service_engagement_id`; request relation — наоборот.
`UNIQUE(series_id, version)` и
`UNIQUE(offer_number)`. Для непустого `contract_number` действует partial
unique; момент назначения и связь номера с offer series определяет `OQ-013`.

### `contract_render_attempts`

- `id`, `contract_offer_id`, `attempt_no`;
- `renderer_id` (`cloudflare-browser-run-pdf-v1`),
  `worker_compatibility_date`;
- `source_manifest_hash`, `started_at`, `finished_at`;
- `status` (`running|succeeded|retryable_failed|failed`), `error_code`;
- `browser_ms_used`, `pdf_size_bytes`, `pdf_sha256`, `retry_after_seconds`.

`UNIQUE(contract_offer_id, attempt_no)`. Не более трёх retry на 429/5xx;
успешный attempt переводит `render_status=ready` и сохраняет immutable PDF в R2.
Accepted/approved artifact никогда не перерендеривается. Managed Chromium version
не считается pin-able renderer version; canonical source hash и фактический PDF
hash имеют разные назначения.

### `contract_acceptances`

- `id`, `contract_offer_id`, `user_id`, `accepted_at`;
- `ip_retention_value`, `user_agent`, `acceptance_text_version`;
- `acceptance_text`, `contract_hash`, `idempotency_key`.

`UNIQUE(contract_offer_id)`. Parent acceptance и последующее admin
approval/activation — разные действия; только второе формирует contract.

### `contract_deliveries`

- `id`, `contract_offer_id`, `artifact_kind` (`html|pdf`), `artifact_hash`;
- `channel` (`portal|email`), `recipient_user_id`, `delivery_status`;
- `dedupe_key`, `delivered_at`, `access_expires_at`, `provider_message_id`,
  `created_at`.

Delivery evidence не содержит body договора. Повторная доставка имеет
idempotency/dedupe key; ссылка на private artifact не заменяет запись события.

### `contracts`

- `id`, `contract_offer_id`, `contract_number` nullable, `user_id`, `child_id`;
- `course_group_id`, `individual_request_id`, `funding_authorization_id`,
  `enrollment_id`, `service_engagement_id`;
- `operational_status` (`active|terminated|expired|void`);
- `parent_acceptance_id`, `formed_at`, `formed_by_admin_user_id`;
- `activated_at`, `effective_from`, `effective_to`, `created_at`.

`UNIQUE(contract_offer_id)`. Contract указывает на immutable approved offer, а
не копирует изменяемые profile/course данные. В production contract number
обязателен по утверждённому lifecycle и имеет partial unique; synthetic test
остаётся на `offer_number`.

Child/service/funding/enrollment/engagement relations либо выводятся из
approved offer, либо проверяются на точное равенство ему; для contract повторно
действует XOR service relation. `formed_at` фиксирует admin approval и не
сдвигается к будущему `effective_from`. Связанные enrollment/service engagement
могут иметь `status=active` с будущим `active_from`; вычисления активности и
occupancy обязаны учитывать date boundary, а не только status.

### `contract_events`

- `id`, `contract_id`, `event_type`
  (`formed|activated|amended|termination_requested|terminated|expired|voided`);
- `effective_at`, `reason_code`, `source_offer_id`;
- `actor_user_id`, `metadata_json`, `created_at`.

События append-only. Amendment требует нового approved offer; событие хранит
ссылку, но не переносит старое acceptance.

`formed_at` совпадает с transactional admin approval после проверки
`parent_acceptance_id` той же offer version/hash. Parent acceptance без admin
approval не создаёт `contracts`. Parent/admin history строится из offer,
acceptance, contract и events; закрытие enrollment/engagement ничего не удаляет.

### `privacy_acknowledgements`

- `id`, `user_id`, `privacy_notice_version`, `acknowledged_at`;
- `evidence_hash`, `source_context`, `created_at`.

`UNIQUE(user_id, privacy_notice_version)`. Поля на `users` могут кешировать
последнюю принятую версию, но история acknowledgement не заменяется media
consent или contract acceptance. Media/SEPA/medical consent tables не создаются
до решения `OQ-016`.

## Пересмотр цены

### `price_review_batches`

- `id`, `course_group_id`, `reason_code`;
- `old_active_count`, `new_active_count`, `lookup_children_count`;
- `price_version_id`, `effective_from`;
- `status` (`draft|pending_admin|approved|processing|completed|cancelled`);
- `created_at`, `approved_at`, `approved_by`.

### `price_review_items`

- `id`, `batch_id`, `version`, `enrollment_id`, `user_id`;
- `old_price_cents`, `new_base_price_cents`, `new_final_price_cents`;
- `old_price_mode`, `new_price_mode`, `decision_json`;
- `terms_snapshot_json`, `item_hash`, `acceptance_text_version`;
- `status` (`draft|approved|sent|accepted|declined|needs_manual_contact|applied|cancelled|superseded`);
- `sent_at`, `response_deadline`, `responded_at`, `applied_at`.

После `sent` item immutable. Изменение price/effective/terms создает новую
version и делает старую `superseded`; parent acceptance не переносится.
`UNIQUE(batch_id, enrollment_id, version)`; для enrollment одновременно только
один open item на одну effective date.

### `price_change_acceptances`

- `id`, `price_review_item_id`, `user_id`, `accepted_at`;
- `ip_retention_value`, `user_agent`, `acceptance_text`;
- `acceptance_text_version`, `item_hash`, `idempotency_key`.

`UNIQUE(price_review_item_id)`. Согласие относится к неизменяемой item
version/hash, не к group batch.

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
- `absence_date`, `reason_code`, `message_id`, `created_at`.

Структурированная absence record и сообщение создаются одной операцией.

### `email_outbox` и `telegram_outbox`

Общие поля:

- `id`, `source_kind`, `source_id`, `template_or_category`;
- `payload_json` с минимизированными данными, `dedupe_key`;
- `not_before`, `status` (`pending|processing|retry|sent|dead|cancelled`);
- `attempts`, `max_attempts`, `next_attempt_at`, `last_error_code`;
- `locked_at`, `sent_at`, `created_at`.

Email дополнительно хранит recipient/reference template; Telegram — bureau chat
destination из конфигурации, но не secret token. `UNIQUE(dedupe_key)` исключает
двойную отправку одного события.

## Ключевые вычисляемые инварианты

```text
active_children_count(course, as_of) =
  COUNT(DISTINCT child_id) из qualifying portal enrollments
  UNION qualifying current legacy enrollments
  MINUS legacy records, represented_by_enrollment_id которых уже active
```

Учитываются `active_from <= as_of` и
`active_until IS NULL OR as_of < active_until`. Статус без дат недостаточен.

```text
quote lookup count    = min(active_children_count(planned_start) + 1, 6)
repricing lookup count = no lookup/items при active=0,
                         иначе min(active_children_count(effective_from), 6)
```

Capacity и price lookup count — разные понятия. Trial не входит ни в один
ценовой count.

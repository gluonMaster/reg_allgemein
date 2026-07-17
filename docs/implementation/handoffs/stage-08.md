# Handoff этапа 08: Nachhilfe и individual requests

Статус: `done`

Production readiness: `feature_disabled`

## Baseline

- Branch: `master`.
- Start HEAD: `14fb46290631d119326f4d6a0f7d901234bbc2b9`.
- Initial `git status --short`: clean.
- Предыдущий handoff: `docs/implementation/handoffs/stage-07.md`, status
  `done`; owner-safe cabinet/children, общий admin shell/RBAC, catalog CTA и
  trial workflow приняты как prerequisites.

## Выполнено

- Requirement/acceptance IDs: `REQ-01`–`REQ-10`, `PRICE-02`, `AUTH-07`,
  `AUTH-08`, `SEC-01`, `SEC-02`, `UI-01`; разделы 2, 7 и 10
  `ACCEPTANCE_CRITERIA.md`.
- Parent request API/UI: authenticated `/requests/new?kind=nachhilfe|individual`
  создаёт idempotent owner-scoped draft только для current child с тем же
  assigned FamilyID; `/requests/[requestId]` выполняет optimistic save,
  submit/resubmit и cancel. Cabinet получает request cards через read-model
  contributor. Request transitions реализованы по `WORKFLOWS.md`:
  `draft -> submitted -> needs_documents|pending_admin_review`,
  `needs_documents|needs_info -> submitted`, admin
  `pending_admin_review -> needs_documents|needs_info|approved|rejected`,
  parent/admin cancel допустим только для разрешённых nonterminal/approved
  состояний.
- Tariff/funding invariants: `individual` всегда `self_pay`, snapshot configured
  rate с default `3000` cents/45 min и `parent_payable=1`; `nachhilfe` допускает
  только `jobcenter|socialamt`, фиксирует `3000` cents/45 min как third-party
  funded rate и `parent_payable=0`. Payer name/address/reference, bank/payment и
  approved-hours поля/логи не добавлялись.
- Private document boundary: PDF/JPEG/PNG проверяются по extension, exact MIME,
  signature и фактическому size; encrypted/malformed PDF, ZIP polyglot,
  Office/SVG/XML/executable/unknown bodies отклоняются. Действуют configurable
  limits не выше 10 MiB/file, 5 files/authorization, 25 MiB/authorization и
  отдельный upload rate limit.
- R2 objects имеют только случайные opaque keys:
  `quarantine/<uuid>` и `archive/funding/<uuid>`; filename/PII в key, D1 и audit
  не сохраняются. Body никогда не хранится в D1/log. Storage provider fail-closed
  при отсутствии private binding.
- Quarantine flow разделяет audited admin forced attachment
  (`application/octet-stream`, `nosniff`, `no-store`, без inline preview),
  hash-bound manual local-AV attestation и отдельное business решение
  `clean -> approved|rejected`. Clean требует предыдущий download тем же admin
  и того же SHA-256, scanner label/version и text version
  `manual-local-av-v1`. Checksum тела повторно вычисляется перед download и
  archive copy.
- Approved document копируется в private archive двухфазно: при D1 failure новая
  archive copy удаляется; после commit quarantine copy становится
  `delete_pending`. Parent получает только owner-checked approved archive как
  forced attachment. Public URL, bearer document token и parent quarantine
  download отсутствуют.
- Quarantine cleanup использует immutable
  `quarantine_expires_at = uploaded_at + 14*24h` UTC. Parent delete/replacement
  сразу убирает доступ, но не ускоряет physical delete; первый успешный cleanup
  при `now >= quarantine_expires_at` удаляет body, retry идемпотентен, download/
  attestation TTL не продлевают. Approved archive cleanup не выбирает; physical
  purge approved archive отключён.
- Authorization lifecycle: versioned
  `pending_review -> approved|rejected`, `approved -> revoked|superseded`,
  terminal reactivation запрещена. Approval требует inclusive dates и все
  current documents `approved`; replacement approved evidence создаёт новую
  pending authorization version без изменения старого evidence/current funding.
  Expiry вычисляется после inclusive `valid_until`, создаёт один append-only
  lifecycle event с `effective_on=calendar_day_after(valid_until)` и не вводит
  mutable status `expired`.
- Offer/activation boundary: `fundingEligibilityAssertion` требует approved
  request/current authorization, inclusive coverage, active owner/child FamilyID
  и только approved archive documents. `FundingDiscontinuityContributor`
  атомарно включён в revoke/supersede/expiry; stage-08 default честно сообщает,
  что contract/engagement/task tables ещё отсутствуют.
- Stage-09 extension points: `RequestMutationGuard` блокирует cancel после
  будущей contract reference; `DocumentMutationGuard` блокирует replace/delete
  retained evidence; `FundingDiscontinuityContributor` должен атомарно supersede
  open offers, перевести active engagement в `funding_review`, создать deduped
  admin task и не мутировать accepted contract/PDF. Новая authorization не
  переключает contract молча.
- Admin UI встроен в общий `/admin` shell как `/admin/requests`: typed request,
  document attestation/business review и authorization actions имеют CSRF,
  current-admin assertion, idempotency, safe audit и append-only evidence.
- Изменённые компоненты: request/document repositories, services, schemas,
  runtime и funding boundaries; parent/admin/download routes; cabinet/admin
  extensions; i18n/CSS; config/R2 adapters; canonical technical data model;
  unit/integration/E2E tests.
- Migration ID: `0009_requests_documents.sql`. Добавлены
  `individual_requests`, `funding_authorizations`, `authorization_documents`,
  append-only `request_parent_actions`, `request_action_assertions`,
  `document_scan_attestations`, `document_action_assertions`,
  `funding_lifecycle_events`, `funding_action_assertions`, conditional unique
  fences, indexes и transition/ownership/evidence/immutability/limit triggers.
  Миграции `0001`–`0008` не переписывались.
- Environment/binding/config changes без secret values:
  `DOCUMENT_UPLOAD_ENABLED`, `DOCUMENT_MAX_FILE_BYTES`,
  `DOCUMENT_MAX_FILES_PER_AUTHORIZATION`, `DOCUMENT_MAX_AUTHORIZATION_BYTES`,
  `DOCUMENT_UPLOAD_RATE_LIMIT_WINDOW_SECONDS`,
  `DOCUMENT_UPLOAD_RATE_LIMIT_MAX_ATTEMPTS`,
  `DOCUMENT_AV_ATTESTATION_TEXT_VERSION`; local/example private `R2_BUCKET`
  shape задокументирован. И local, и example default сохраняют upload выключенным.
- Feature flags и fail-closed production paths: `DOCUMENT_UPLOAD_ENABLED=false`;
  runtime дополнительно отвергает `DOCUMENT_UPLOAD_ENABLED=true` в production и
  требует R2/JWT вне production при явном включении. `AUTH_PUBLIC_ENABLED=false`
  сохранён. Remote D1/R2/deploy операции не выполнялись.
- Migration/rollback/restore compatibility: clean in-memory D1 применяет
  immutable sequence `0001`–`0009`; для уже применённой migration требуется
  restore/forward-fix, а не rewrite. Production migration/restore rehearsal не
  выполнялся.

## Проверки

| Команда/сценарий | Результат |
| --- | --- |
| `npm run check` | passed; `svelte-check found 0 errors and 0 warnings` |
| `npm test` | passed; 25 files, 147 tests |
| `npm run build` | passed; Vite SSR/client и Cloudflare adapter output |
| `npm run test:e2e` | passed; Chromium 3/3, включая unauthenticated request/admin 401 |
| Stage-08 focused suite | passed; 26 tests для config/validation/D1 workflow |
| Quarantine boundary | passed: spoof/encrypted/polyglot/limits/rate/storage denial; hash-bound AV и separate approval |
| Retention/expiry | passed: ровно 14×24h, early parent delete не удаляет body, retry, archive exclusion, inclusive funding expiry |
| Cross-account/idempotency | passed: foreign child/request/document denial, repeated upload/submit и lifecycle event dedupe |
| `git diff --check` | passed |
| Встроенный Browser skill | backend в сессии отсутствовал (`agent.browsers.list() = []`); заменяющий visual smoke не заявляется, Playwright suite passed |

## Не выполнено и риски

- Открытые вопросы/OQ: новых решений не принято. `OQ-027/OQ-028` применяются
  только через уже assigned одинаковый account/child FamilyID. Закрытые funding/
  retention решения не переоткрывались.
- External/legal/operational release gates, не являющиеся OQ: нет утверждённого
  короткого quarantine/AV runbook, admin training и clean-room walkthrough;
  production private bucket/provider/retention setup не проверен. Поэтому upload
  остаётся feature-disabled.
- Known failures: отсутствуют для обязательных команд. Первый локальный
  Playwright startup выявил небезопасную комбинацию upload enabled без secret;
  default исправлен на fail-closed `false`, после чего suite прошёл 3/3.
- Сознательно вне scope: contracts/offers/PDF, service engagements/enrollments,
  group_nachhilfe, attendance/billing/approved-hours decrement, payer ledger,
  funding amendments, production scheduler/deploy/R2 actions и purge approved
  archive.

## Release gates

| Gate | Статус | Affected path/flag | Evidence | Owner / next action |
| --- | --- | --- | --- | --- |
| Stage-08 local/test request and document boundary | `passed` | D1 `0009`, private store interfaces, routes | 147 Vitest + 3 Playwright, build/check | Stage 09 сохраняет guards и eligibility |
| Production parent document upload | `feature_disabled` | `DOCUMENT_UPLOAD_ENABLED=false`; production `true` rejected | config tests, runtime fail-closed | Operations/security: утвердить runbook, bucket/provider, training и test upload; этап 13 переоценивает |
| Manual local-AV operation | `feature_disabled` | admin quarantine download/attestation | workflow integration test; training не выполнен | Operations: versioned short runbook + trained admins + clean-room walkthrough |
| Approved archive physical purge | `feature_disabled` | archive keys не входят в cleanup | archive exclusion integration test; canonical MVP policy | Этап 12/authorized retention decision; не добавлять purge молча |
| Production D1/R2 migration/deploy | `feature_disabled` | remote resources | production actions не выполнялись | Отдельное прямое поручение и stage-13 rehearsal |

## Operator docs и rehearsal

- Актуальные tracked policy: `docs/operations/STORAGE_AND_UPLOAD_SECURITY.md` и
  `docs/operations/PRIVACY_RETENTION.md`; attestation text version
  `manual-local-av-v1`.
- Проверенные environment и дата rehearsal: synthetic in-memory D1/private
  memory store и local Playwright, `2026-07-17`; production/preview не трогались.
- Clean-room walkthrough человеком не выполнялся; integration test прошёл весь
  hash-bound flow.
- До release отсутствуют approved short runbook, admin training evidence,
  production bucket/provider/retention validation и scheduler rehearsal.
- Production migration, deploy, R2 upload/delete и реальные client documents
  намеренно не выполнялись без разрешения.

## Следующий этап

- Готовые prerequisites: owner-scoped approved requests; immutable tariff
  snapshots; approved versioned funding/document archive; eligibility assertion;
  admin/cabinet read models; audit/idempotency evidence.
- Что обязательно проверить первым: stage-09 migration должна подключить
  `RequestMutationGuard`, `DocumentMutationGuard` и
  `FundingDiscontinuityContributor` к реальным offer/contract/engagement/task
  таблицам в той же D1 transaction. Offer send и activation обязаны вызывать
  `fundingEligibilityAssertion` с inclusive planned term.
- Stop conditions/blockers: нельзя отправлять/активировать funded offer при
  quarantine/non-approved/deleted/replaced/expired funding; нельзя менять или
  удалять evidence, связанное с sent/accepted offer/contract; нельзя автоматически
  переключать contract на новую authorization. Funding discontinuity обязан
  supersede open offer, поставить engagement в `funding_review`, создать deduped
  task и сохранить accepted contract/PDF immutable.
- Release gates: stage 09 не включает production upload; runbook/training/bucket
  gates и approved archive purge остаются в указанном состоянии.

## Итог worktree

- End `git status --short`: 25 entries — 17 modified tracked paths и 23 новых
  файла под 8 untracked path groups; только stage-08 source/docs/tests/config,
  generated build output не отслеживается.
- Diff summary: 40 файлов; tracked diff `+415/-14`, плюс 23 новых файла
  (migration, request/document backend, routes и tests). `git diff --check`
  passed; document bodies, source filenames, secrets и PII artifacts отсутствуют.
- Commit: `не создан без разрешения`.

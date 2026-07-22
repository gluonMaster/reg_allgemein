# Handoff этапа 12: privacy export/delete и account closure

Статус: `done`

Production readiness: `stage_13_independent_audit_required`

## Baseline и scope

- Branch: `master`.
- Start HEAD: `f61ab391f2d084d371a646d1884bef93a880fa8c`.
- Initial worktree: clean.
- Предыдущий handoff: `docs/implementation/handoffs/stage-11.md`, status `done`.
- Реализованы `PRIV-01`–`PRIV-03`, closure-части `CONTRACT-05`,
  `CONTRACT-08`, `CONTRACT-15`, а также связанные `SEC-01`, `SEC-02` и
  acceptance criteria разделов 2, 8 и 10. Нерешённые вопросы из
  `OPEN_QUESTIONS.md` не превращались в новые business rules.
- Production migration, provisioning, deploy и операции с официальным сайтом
  `kolibri-dresden.de` не выполнялись.

## Migration и privacy state

- Добавлена новая migration `0013_privacy_closure.sql`; применённые migration
  `0001`–`0012` не переписывались.
- Добавлены `privacy_requests`, `privacy_export_artifacts`,
  `retention_controls`, `legal_archive_records`, `privacy_r2_cleanup_jobs`,
  `privacy_admin_actions`, `privacy_closure_results` и
  `privacy_transaction_assertions`; `children` получил nullable
  `minimized_at`.
- D1 triggers ограничивают privacy/export lifecycle, сохраняют append-only
  archive/action/result/assertion records и не разрешают перевести account в
  `closed` без tombstone/minimization полей.
- Database-level guards повторно требуют активный незаблокированный account
  при parent accept/decline, admin contract formation/approval, activation и
  price-review response/schedule/apply. Эти guards действуют и для прямого D1
  вызова или queued retry, а не только для UI.

## Subject export

- Parent создаёт export только для себя; admin может создать export конкретного
  parent subject. Каждый create/download повторно проверяет authenticated
  owner/admin на сервере.
- JSON собирается явными allowlist-запросами только для выбранного subject.
  Password hashes, auth sessions/tokens, cookie/token values, internal audit и
  security metadata, R2 keys и данные другой семьи не экспортируются.
- Artifact записывается под случайным private R2 key, хранит hash/size и
  выдаётся только authenticated attachment response с `private, no-store`,
  `nosniff` и sandbox CSP. Проверяются body size и SHA-256.
- TTL задаёт `PRIVACY_EXPORT_TTL_SECONDS`: default `3600`, минимум `300`,
  максимум `86400`. Retry с тем же idempotency key возвращает тот же artifact;
  повтор одного download request не дублирует audit event.
- После TTL download fail-closed. `cleanupExpiredExports()` создаёт
  idempotent R2 cleanup job и переводит artifact через
  `ready -> delete_pending -> deleted`.

## Delete dry-run и результаты

- Parent dry-run не меняет данные и перечисляет category/count для active
  contract/service blockers, retained evidence, уже установленных per-record
  legal holds, D1 operational cleanup и R2 cleanup.
- Наличие active contract/enrollment/service завершает request как
  `blocked_by_active_contract`. Account, sessions, profile, nonterminal records,
  R2 objects и media grants в этой ветке не изменяются.
- Admin processing требует CSRF/RBAC, typed confirmation, reason и idempotency
  key. Перед записью inventory вычисляется заново.
- Обычные admin lists/download не показывают offer/artifact/approved funding
  document после помещения их индекса в legal archive. Сам archive не имеет
  обычного read/search endpoint; будущий доступ потребует отдельной цели и
  audit.

## Успешная closure transaction

Один D1 batch выполняет conditional closure lock и только при отсутствии
active contract:

1. переводит privacy request в `processing`, а account во внутренний
   `deletion_requested`;
2. создаёт ровно один append-only `decision_source=account_deletion` revoke для
   каждого ещё действующего media grant с единым closure timestamp;
3. отменяет/закрывает nonterminal contract offers, price items, trials,
   individual requests, enrollment/service drafts, support threads, pending
   email и другие незавершённые privacy requests;
4. создаёт per-record retention controls и append-only legal archive index до
   разрыва ownership; существующий legal hold/review date сохраняется;
5. освобождает legacy claim, отделяет и минимизирует owned children, retire-ит
   portal family allocation, отзывает sessions/tokens;
6. заменяет login/email/contact/profile непереиспользуемым tombstone и завершает
   account как `closed`;
7. записывает минимальный audit, immutable closure result и transaction
   assertion со статусом `completed_with_retained_evidence`.

Retained contract/source/PDF, parent/admin acceptance, formation/delivery/
lifecycle/termination, approved funding, media и privacy acknowledgement
evidence физически не удаляются. Для legal archive используется
`purge_status=disabled_by_policy`; `retain_until` nullable/informational и не
создаёт purge job. Автоматический purge legal archive отсутствует намеренно.

## D1/R2 cleanup

- Private export objects удаляются immediate best-effort после successful
  closure и scheduler-call после TTL; failed deletion остаётся retryable job.
- Non-approved document quarantine objects входят в closure plan, но claim
  запрещён до исходного `quarantine_expires_at`. Closure не сокращает
  установленный минимум 14×24 часа. Approved archive key никогда не выбирается
  этим cleanup.
- Cleanup jobs имеют conditional claim, attempt/status, idempotent object key,
  safe error code и audit completion. Внутри successful closure pending R2
  failure не возвращает login и не затрагивает retained archive.

## Race results

- Closure против parent acceptance сериализуется: successful closure закрывает
  offer и account; если acceptance успел записаться, immutable acceptance
  индексируется в archive, если closure выиграл — поздний accept отклоняется.
- Closure против admin formation даёт ровно одно конечное состояние: либо
  active contract и `blocked_by_active_contract` без revoke/cleanup, либо closed
  account и отклонённая formation. D1 conflict после выигравшей formation
  повторно классифицируется через свежий blocker inventory.
- Закрытый/closure-locked account не проходит последующие accept, formation,
  activation или price apply.

## UI и config

- Parent route `/account/privacy` показывает export, deletion dry-run, blockers,
  holds, retained/D1/R2 categories и историю; download доступен только до TTL.
- Admin route `/admin/privacy` показывает privacy queue, safe summary,
  retained/hold categories, private export и подтверждаемую обработку delete.
  Все новые пользовательские сообщения — немецкие i18n strings.
- Новый runtime parameter только `PRIVACY_EXPORT_TTL_SECONDS`; используется
  существующий private `R2_BUCKET`. Отдельного feature flag нет: операции
  закрыты существующими auth/CSRF/RBAC и fail closed без D1/R2 binding.
- Существующие production gates auth/document/contract/media и disabled/fake
  provider policy не ослаблялись.

## Проверки

| Команда/сценарий | Результат |
| --- | --- |
| `npm run check` | passed, 0 errors/warnings |
| `npm test` | passed, 31 files / 183 tests |
| `npm run build` | passed, Cloudflare adapter build |
| `npm run test:e2e` | не запускался; не является обязательной проверкой prompt этапа 12 |

D1/R2 integration tests проверяют subject A/B isolation, отсутствие secrets и
security metadata, TTL/private authenticated download, idempotent export/audit/
cleanup, dry-run hold inventory, whole-request active-service blocker без
media revoke или R2 job, successful tombstone/session revoke/child minimization,
единый timestamp и dedupe media revoke, retained archive и сохранение hold,
немедленное удаление export, запрет раннего document-quarantine cleanup и
изоляцию чужих support records. Contract integration tests покрывают обе
closure races.

## Обязательные gates этапа 13

Stage 12 завершает domain workflow, но не объявляет production readiness. Этап
13 должен независимо проверить и закрыть как минимум:

| Gate | Статус | Affected path и evidence | Owner / next action |
| --- | --- | --- | --- |
| Domain export/delete/closure | `passed` | migration `0013`, privacy routes/services; `npm test` 183/183 | stage 12 завершён; этап 13 независимо перепроверяет |
| Automatic legal-archive purge | `feature_disabled` | `retention_controls.purge_status=disabled_by_policy`, purge worker отсутствует | product/legal: только новое письменное правило и отдельная migration |
| Ordinary archive read/search | `feature_disabled` | archive исключён из обычных admin lists/download; archive read route отсутствует | product/legal/security: утвердить purpose/RBAC/audit либо оставить выключенным |
| Expired export и R2 retry scheduler | `blocked` | `cleanupExpiredExports()` реализован, scheduled entrypoint/trigger отсутствует | stage 13/operator: cadence, bounded batch, retry monitor и runbook |
| Retention/legal/privacy notice review | `blocked` | runtime хранит classes/holds, но production basis/dates/notice/AVV не утверждались | уполномоченный представитель Verein и legal/privacy review |
| Production D1/R2 migration/deploy | `blocked` | только local Miniflare D1/R2 fixtures и Cloudflare build | stage 13/operator: backup, migration rehearsal, bindings и deploy |

- production migration `0013`, backup/restore rehearsal и roll-forward plan;
- Cloudflare D1/R2 bindings, bucket policy/encryption/access logs и отсутствие
  public object path;
- scheduled bounded вызов `cleanupExpiredExports()`/privacy R2 retries,
  метрики oldest pending/failed, alerts и безопасный manual recovery runbook;
- независимый permission/IDOR/CSRF/session invalidation и indirect admin-query
  audit, включая полноту отделения archive от обычного search;
- production-shaped D1 concurrency для closure/accept/formation/activation/
  price apply и повторов после transient failure;
- юридически утверждённые retention classes/basis/review dates, portal privacy
  notice, AVV/DPA/subprocessors и решение по будущему archive-purpose read path;
- отдельную проверку минимизации operational payloads и срока очистки
  short-lived acceptance IP/anti-abuse metadata; stage 12 не добавлял purge
  legal archive и не выводил срок из догадки;
- реальный R2 failure/retry drill, отсутствие PII/secrets/generated export в
  logs, repository, build artifacts и telemetry;
- production deploy, smoke/E2E, observability и русские operator runbooks.

## Итог worktree

- Commit не создавался без отдельного поручения.
- Изменения ограничены migration `0013`, privacy server/UI/config, closure
  guards/archive filters, D1/R2 tests, roadmap и этим handoff.
- Секреты, реальные PII, Office/Access sources и generated privacy export
  artifacts в Git не добавлялись.
- Финальный `git status --short`: 15 изменённых tracked файлов и 5 untracked
  path roots (14 новых файлов), все относятся к scope этапа 12.
- `git diff --check` passed; отдельный path/secret scan не нашёл Office/Access,
  generated export artifacts или private-key/token signatures в изменениях.

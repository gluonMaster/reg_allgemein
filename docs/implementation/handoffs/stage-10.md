# Handoff этапа 10: контролируемый пересмотр действующей цены

Статус: `done`

Production readiness: `cron_and_real_delivery_not_wired`

## Baseline

- Branch: `master`.
- Start HEAD: `cc264908fe057edaf0e2c0755461046ab9654ac8`.
- Initial worktree: clean.
- Предыдущий handoff: `docs/implementation/handoffs/stage-09.md`, status `done`.
- Применены канонические `SYS-03`, `CONTRACT-03`, `CONTRACT-08`–`CONTRACT-10`,
  `PRICE-03`, `PRICE-04`, `REL-01`, `TIME-01` и соответствующие разделы 1A,
  6, 8 и 10 acceptance criteria. Новых бизнес-решений из открытых OQ не
  добавлено.

## Migration и current price provenance

- Новая immutable migration: `0011_price_reviews.sql`; применённые `0001`–`0010`
  не изменялись.
- `enrollments` получил `current_base_price_cents`,
  `current_price_version_id`, `current_price_rule_id` и монотонный
  `price_assignment_version`; draft из этапа 09 сразу сохраняет это provenance.
- Добавлены `price_review_triggers`, `price_review_reconciler_state`,
  `price_review_batches`, `price_review_trigger_batches`, `price_review_items`,
  parent/admin action evidence, immutable acceptances, typed outbox/deliveries,
  apply events, legacy effective assignments и transaction assertions.
- Partial unique indexes ограничивают один open item на target/effective date;
  D1 triggers запрещают недопустимые lifecycle transitions, mutation sent
  snapshot и update/delete append-only evidence.

## Trigger и dedupe contract

- Group contract activation атомарно вставляет
  `enrollment:<id>:active_from:<date>:v1`; известный future end одновременно
  вставляет `enrollment:<id>:active_until:<date>:v1`.
- Occupancy correction/legacy mapping используют переданный stable source key.
  Явный admin comparison использует
  `admin-price-comparison:<course>:<active-price-version>:<effective-on>:v1`.
- Price import/promotion не пишет trigger и не начинает клиентский flow.
- Trigger связывается максимум с одним content-addressed batch; item dedupe
  включает batch state, target и immutable item hash. Fake delivery/outbox и
  apply event имеют отдельные unique dedupe keys.
- Reconciler хранит migration-time singleton watermark. Он повторно смотрит
  enrollment rows, изменённые после watermark, и все future boundaries; поэтому
  не воспроизводит всю историческую occupancy при первом запуске и использует
  тот же boundary dedupe key при repair.

## State machine и guards

```text
trigger -> calculated batch/item
  -> notification approval
  -> fake outbox dispatch
  -> owner accept | owner decline | timeout | stale
  -> per-item final admin confirmation
  -> scheduled(first day next Berlin calendar month)
  -> applied exactly once
```

- Calculate вызывает существующий repricing engine. `5↔6` меняет lookup;
  `7→6`, wholly-above-cap и unchanged comparison остаются silent/empty.
  Yearly/monthly и increase/decrease используют одну state machine.
- Обычный flow создаёт item только при changed final amount/mode. Existing
  manual override не переписывается; unknown/invalid provenance создаёт только
  manual-contact item.
- Notification approval, dispatch и final per-item confirmation — три разные
  admin actions. Parent acceptance сама цену не меняет.
- До dispatch, response, final confirmation и apply повторно проверяются active
  account, owner, active target на effective date, old base/final/source/mode/
  version/rule, occupancy, active new version/rule и отсутствие newer item.
  Critical guards повторены внутри conditional D1 transaction.
- Sent item immutable. Acceptance включает exact item hash, versioned German
  text, actor, time, scoped IP-retention value и idempotency key. Late/stale
  попытка остаётся evidence-only без acceptance/apply.
- Final confirmation рассчитывает `scheduled_for` как первое число следующего
  календарного месяца в `Europe/Berlin`. Applier до этой даты ничего не делает,
  а unique apply event и assignment version дают single apply без retroactivity.
- Decline, timeout, stale и parent acceptance создают deduped admin task/outbox;
  закрытый/blocked account и foreign owner fail closed.

## Legacy projection

- Repricing repository объединяет active portal enrollments и не представленные
  active legacy services.
- Только однозначно claimed active owner с известными amount/source/mode и
  однозначной mapping проходит общий send/accept/confirm/apply flow.
- Apply добавляет `legacy_service_price_assignments`; imported source row,
  `planned_price_cents`, contract/PDF и accepted historical artifacts не
  мутируются.
- Unknown amount, unclaimed family, identity/service conflict и represented row
  соответственно дают manual-contact либо исключаются как duplicate.

## UI и delivery boundary

- Cabinet показывает owner-only cards и detail route
  `/price-reviews/<random-public-reference>`; reference не является bearer
  token, server lookup всегда требует authenticated `user_id`.
- Admin получил `/admin/price-reviews`: explicit comparison, отдельные approve,
  fake dispatch, per-item final confirmation и audited manual maintenance.
- Absolute link строится только через валидированный `PORTAL_PUBLIC_ORIGIN`; URL
  не содержит internal item/user ID, token или PII.
- Реального email нет. `price_review_outbox_events` и channel `fake_email` —
  durable boundary для этапа 11.

## Проверки

| Команда/сценарий | Результат |
| --- | --- |
| `npm run check` | passed, 0 errors/warnings |
| Stage-10 unit/D1 focused + regression | passed, 6 files / 36 tests |
| `npm run test:e2e` | passed, 3 Chromium tests; parent/admin routes и mutation требуют auth |
| `npm test` | passed, 28 files / 168 tests |
| `npm run build` | passed, Cloudflare adapter build |

D1 scenarios включают 5→6, silent 7→6, empty comparison, yearly/monthly
increase/decrease, early/duplicate gates, owner/cross-owner/closed account,
accept/decline/timeout/late/stale, immutable sent snapshot, first-next-month and
single apply, future expiry reconciliation, manual scheduler audit, origin-safe
deduped delivery и claimed/unknown/unclaimed/conflicting/represented legacy.

## Production Cron/binding/monitoring inventory для этапа 13

Ниже inventory, а не утверждение о подключённом production runtime.

| Объект | Требование этапу 13 | Текущее состояние |
| --- | --- | --- |
| Scheduled entrypoint | Вызвать `PriceReviewService.runScheduledMaintenance(now)` из Cloudflare scheduled handler | handler/trigger отсутствует |
| Logical job | `price-review-maintenance`; proposed cadence `*/15 * * * *` UTC, окончательно подтвердить в production runbook; вся date logic остаётся Berlin-calendar | не настроен |
| D1 binding | `DB`, migration `0011`, production compatibility/backup/restore rehearsal | local Miniflare проверен; remote не применялся |
| Runtime config | Валидированный `PORTAL_PUBLIC_ORIGIN` и существующие pricing config values; secret values не требуются этому job | validation существует |
| Concurrency | Сохранить stable dedupe/unique/conditional guards; stage 13 должен решить, добавлять ли общий `operation_locks` lease/fence вокруг orchestration | операции идемпотентны, Cron lease не подключён |
| Delivery consumer | Stage 11 должен consuming/retry/dead-letter для `price_review_outbox_events`, не меняя item state evidence | только fake pending outbox |
| Manual recovery | Admin maintenance с CSRF, explicit confirmation, idempotency и audit | реализовано |

Обязательные production metrics/alerts:

- timestamp/duration/result последнего Cron run; alert при freshness более двух
  подтверждённых intervals;
- count/oldest age `price_review_triggers.status=pending|failed`;
- due `scheduled` items с `scheduled_for <= Berlin today`, отдельно apply
  failures/stale supersedes;
- sent items past response deadline без timeout transition;
- open manual/stale/decline/overdue tasks и их oldest age;
- pending/retry/dead outbox age после этапа 11;
- reconciler watermark age и число repaired boundaries;
- audit/action assertion failure и duplicate/replay counters без PII.

Runbook этапа 13 должен содержать manual trigger, проверку watermark/queues,
safe retry, D1 backup/restore и roll-forward для migration. Никакие secret values
в inventory не записаны.

## Не выполнено и release gates

- Production Cron/scheduled handler, wrangler trigger и deploy не выполнялись.
- Real email/provider retry/dead-letter остаётся этапу 11.
- Production migration, backup/restore rehearsal, monitoring dashboards/alerts
  и production-shaped concurrency rehearsal остаются этапу 13.
- Payment/ledger/invoice, retroactive apply, pause/resume и PDF addendum вне
  scope. Официальный сайт/CMS не изменялся.
- Новых открытых OQ и известных local/test failures нет.

`cron_and_real_delivery_not_wired` означает готовый проверенный application/D1
boundary, но не production readiness.

## Итог worktree

- Commit не создавался без отдельного поручения.
- Изменения ограничены migration 0011, pricing/contract contributors,
  price-review server/UI, cabinet/admin navigation, tests и tracked docs.

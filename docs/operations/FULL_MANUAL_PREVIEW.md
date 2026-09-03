# Полный ручной preview

<!-- stage-13-current-review-status: independent_go -->

Этот runbook определяет checkpoint `full-manual-preview`: рабочую тестовую
систему на синтетических данных, а не production release. Cloudflare Access
остаётся перед Worker; D1/R2/Browser/provider bindings относятся только к
выделенной preview-среде.

Current candidate, deployed version, pending migration и ровно одно следующее
действие находятся **только** в
[active state](../implementation/STAGE_13_ACTIVE_STATE.md). Этот runbook хранит
стабильный порядок и не должен содержать current SHA/status.

Источники требований: `SYS-04`, `REQ-11`, `CONTRACT-21`, `MSG-07` в
[MVP_SPEC.md](../spec/MVP_SPEC.md), `OQ-036` в
[OPEN_QUESTIONS.md](../spec/OPEN_QUESTIONS.md), критерии в
[ACCEPTANCE_CRITERIA.md](../spec/ACCEPTANCE_CRITERIA.md), детальные процедуры в
[OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md).

## Неподвижные границы

- production, официальный сайт, реальные Office/PII-источники и реальные
  клиенты не затрагиваются;
- используются только synthetic records/files и owner-controlled test mailboxes;
- PII, document body, cookies, verification links и secrets не попадают в Git,
  evidence, audit summaries или terminal transcript;
- production approvals не подменяются preview evidence, но не блокируют
  synthetic preview lifecycle;
- ownership/RBAC/CSRF, exact-target checks, recovery/rollback, provider certainty
  и обязательный postcondition после mutation не ослабляются ради темпа;
- до продвижения блокируют только доказанные `P0/P1`; `P2/P3` идут в backlog.

## Стабильный порядок достижения checkpoint

1. Выполнить ровно `next_atomic_action` active state после отдельного разрешения,
   exact-target preflight и с указанным bounded postcondition.
2. После каждого migration/deploy/config/provider/bootstrap write обновить только
   active state и сделать docs-only checkpoint; следующий write требует отдельного
   разрешения.
3. Доставить reviewed Worker после совместимой forward migration; сохранить
   заранее подтверждённый compatible Worker как краткий rollback и не откатывать
   D1 direct SQL.
4. Выполнить одну controlled registration + verification delivery, затем второй
   synthetic parent account и штатный one-shot admin bootstrap. Проверить две
   отдельные роли, session revocation, audit и replay denial.
5. Пройти parent/admin/catalog/trial/request/price/support/absence/privacy flows,
   включая negative cross-owner, RBAC, CSRF и idempotency cases.
6. Пройти document flow: synthetic upload → private quarantine R2 → forced admin
   download → current local AV → hash-bound attestation того же администратора →
   отдельный business approve/reject → approved owner download/negative access →
   cleanup evidence.
7. Установить четыре marked `preview_review` bundles и через реальный Browser Run
   получить четыре PDF, private R2 artifacts и email deliveries. Для одного offer
   выполнить parent accept → different-admin formation/activation → certificate.
8. Выполнить target-pinned Telegram preflight и ровно один отдельно разрешённый
   PII-free normal-outbox send. `delivery_unknown` проверяется вручную и никогда
   не отправляется повторно вслепую.
9. Владелец проходит desktop/mobile exploratory matrix, тексты, keyboard/zoom,
   outbox/Cron/storage/monitoring и фиксирует только реальные P0/P1 failures.
10. После всех flows записать phase-boundary handoff. Production остаётся NO-GO
    до собственных legal/privacy/provider/training/data/resource gates.

## Разрешения и проверки

Один permission может покрывать только тесно связанный atomic action или заранее
описанный однородный пакет. Перед каждым action владелец видит target class,
expected result, минимальную проверку и rollback/containment. После попытки
обязателен read-only фактический postcondition; `failed|ambiguous` не ретраится до
reconciliation.

Exact test/review decision table находится в
[TEST_PLAN.md](../implementation/TEST_PLAN.md) и evergreen deploy entry-point.
Не повторять полный suite или independent review для docs-only child,
неизменённого fully gated candidate либо P2/P3.

## Когда checkpoint пройден

Одновременно выполнены:

- два verified synthetic account и раздельные parent/admin роли;
- все обязательные parent/admin и negative isolation flows;
- document quarantine/manual-AV/business-review/cleanup lifecycle;
- четыре реальных preview PDF + один formation/certificate lifecycle;
- один verified PII-free Telegram normal-outbox delivery с certainty handling;
- owner desktop/mobile exploratory pass;
- открытых milestone `P0/P1` нет, Access включён, production/CMS/real PII не
  затронуты.

## Rollback и containment

При runtime regression вернуть только заранее подтверждённую compatible Worker
version; forward migration не переписывать и не удалять. При provider/document/
contract failure выключить только затронутый preview feature, сохранить durable
evidence и private artifacts. Telegram `delivery_unknown` требует ручного
reconcile. При wrong target, authorization bypass, corruption или ambiguous
irreversible write сохранить Access/fail-closed state и остановить дальнейшие
mutations.

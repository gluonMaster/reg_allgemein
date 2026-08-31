# Stage 13: активное состояние

<!-- stage-13-current-review-status: independent_go -->

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-08-31T17:39:46Z
reviewed_candidate: 1607d6de55491afe7a2bea059e5f36e8718e0b8c
last_completed_gate: phase-1-recovery-migrations-applied-and-verified
next_gate: phase-1-apply-0024-0025-to-preview
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
current_review_status: independent_go
current_phase: phase-1-recovery-schema
last_atomic_action: apply-0024-0025-to-recovery-d1
last_atomic_result: success
next_atomic_action: apply-0024-0025-to-preview-d1
rollover_required: no
recommended_next_session_mode: High
mode_reason_plain: planned-preview-migration-with-exact-pending-set-verified-recovery-and-no-downgrade
-->

Этот файл содержит только current operational truth. История reviews и прежних
candidates сохранена в [persistent handoff](handoffs/stage-13.md); её не нужно
перечитывать для обычного продолжения deploy.

## Ближайший outcome

Как можно быстрее передать владельцу Access-protected preview, в котором весь
MVP реально работает end-to-end на синтетических данных. По `SYS-04`/`OQ-036`
обязательны Browser/R2/email contracts, Telegram normal-outbox и document
upload/quarantine/manual-AV/business-review. Stub, fake provider и
`feature_disabled` не закрывают этот checkpoint.

Production, официальный сайт, реальные Office/PII sources и реальные клиенты не
входят в текущую программу. После manual preview production остаётся отдельным
NO-GO до собственных approvals и отдельного поручения.

## Current verdict и следующий gate

- Latest independently reviewed candidate:
  `1607d6de55491afe7a2bea059e5f36e8718e0b8c`; direct parent
  `6ebf4761712c07de262fbac0bb3d532f98fd74c3`.
- Fresh independent verdict: **GO**, 0 BLOCKER / 0 HIGH / 0 MEDIUM / 0 LOW.
  Runtime, migrations, dependencies, deployment config и E2E harness после
  reviewed full-suite ancestor не менялись. Status/docs descendants не создают
  новый implementation candidate и не требуют нового review-loop.
- Следующий gate: candidate-bound recovery evidence/isolated recovery, затем
  apply pending `0024`/`0025` только к preview/recovery и deploy exact reviewed
  Worker только в preview. Fresh target reconciliation завершён; пакет
  recovery/apply/deploy требует отдельного прямого разрешения владельца.
  Production не разрешён.

### Phase 0 target lock — 2026-08-31

- Clean `HEAD=cc5c83b…`; reviewed `1607d6d…` is an ancestor. Descendant changes
  are limited to docs/checker/tests and do not change runtime, migrations,
  dependencies, deployment config or E2E harness.
- Protected config/control agree on one preview account/Worker/D1, two distinct
  private EEUR R2 buckets and the canonical preview origin. Production/CMS
  targets are absent. Active Worker remains one version at 100%; the protected
  compatible rollback version is still available.
- Exactly `0024_contract_preview_review.sql` and
  `0025_contract_storage_intent_generations.sql` are pending. Preview and the
  distinct existing recovery D1 both have FK violations `0`, one current
  academic period, synthetic current counts `2 + 1703`, users/admins/bootstrap
  actions/contract offers/Telegram rows `0`.
- Both preview R2 buckets remain private/EEUR and empty. Deployed fail-closed
  vars, D1/R2/Browser/assets bindings and the three existing secret names match;
  Telegram secret remains absent. All nine latest scheduled-job states are
  `succeeded|feature_disabled`; two historical failed rows are from 2026-08-25
  and are not current.
- Fresh anonymous and invalid Access probes return `302` to the same login host;
  no bypass was observed. The protected CurrentUser-DPAPI service token was
  decrypted only in memory: root returned `200`, operations health returned
  `204` with `no-store` and `noindex, nofollow`. No OTP/login was initiated and
  no credential value was printed. Phase 2 must repeat the same valid-side smoke
  after deploy.
- Remote `PRAGMA quick_check` made no write and returned safe Cloudflare/D1
  `SQLITE_NOMEM` code `7500`; FK and targeted counts succeeded. Phase 1 must run
  the full integrity check on the fresh isolated restore before apply. The old
  recovery record is verified but expired and bound to an older candidate, so
  it cannot authorize this deploy.

## Последнее известное preview state

Fresh reconciliation нужно выполнить непосредственно перед mutation; ниже —
последнее зафиксированное состояние, которое нельзя молча считать актуальным при
обнаружении drift.

- Canonical preview Worker обслуживает 100% traffic, hostname закрыт Cloudflare
  Access, versioned preview routes закрыты. Deployed Worker старше current
  full-manual-preview candidate.
- Preview D1: migrations `0001`–`0023`, pending `0` на момент последней проверки,
  FK violations `0`; current synthetic import pair опубликована; users/admins
  `0`; one-shot bootstrap доступен и не использован.
- Два отдельных preview R2 bucket private/EU и пусты.
- Public auth, application email, Telegram, document upload и contract send/
  renderer остаются fail-closed. Scheduled operations deployed.
- Resend preview sender/domain/key были подготовлены без фактической delivery.
  Два owner-controlled mailbox roles известны только локальному operator context
  и не должны попадать в tracked docs/output.
- Для Telegram известен private channel invite link, но это не Bot API target.
  До preflight нужны dedicated bot token, exact signed-decimal chat ID,
  `channel` type и bot-admin permission **Post Messages**. Values не выводятся.

## Квазиатомарная цепочка

| Фаза | Статус | Результат | Минимальная проверка |
| --- | --- | --- | --- |
| 0. Target lock | `passed` | exact candidate/preview targets/rollback/recovery source сверены read-only; old recovery is expired/not candidate-bound | no drift, production/CMS absent; Access deny `302`, valid root/health `200/204` |
| 1. Recovery/schema | `in_progress` | DPAPI restore exact and plaintext removed; recovery applied `0024`/`0025`: pending 0, ledger 25, 535 objects, lineage 8/4, current `2 + 1703`, FK 0; preview apply remains | ledger, FK, quick-check, key counts |
| 2. Worker deploy | `blocked_on_phase_1` | exact reviewed Worker deployed fail-closed | Access/root/health/version/bindings smoke |
| 3. Auth/roles | `blocked_on_phase_2_and_owner_input` | Resend allowlist, два verified accounts, one-shot bootstrap | real test email, audit/replay denial, role split |
| 4a. Product flows | `blocked_on_phase_3` | parent/admin/catalog/trial/request/price/support/privacy | guided affected browser scenarios |
| 4b. Documents | `blocked_on_phase_3` | real synthetic upload → AV → review → cleanup | R2 isolation/hash/owner access |
| 4c. Contracts | `blocked_on_phase_3` | 4 marked PDF + 1 accept/formation/certificate | Browser/R2/email receipts and lifecycle |
| 4d. Telegram | `blocked_on_target_and_send_permission` | one PII-free normal-outbox delivery | preflight, exactly-one send, verify/reconcile |
| 5. Owner pass | `blocked_on_phases_3_4` | desktop/mobile/manual exploratory complete | no open P0/P1 |

После каждой фазы записываются только `result / evidence / next / rollback`.
Зелёная фаза не повторяется без actual drift, material diff или воспроизводимого
`P0/P1`. Отказ одного независимого блока не отменяет evidence остальных.

## Persistent checkpoint после атомарной операции

После каждой попытки remote mutation и до следующей mutation этот файл обязан
получить фактический read-only postcondition и небольшой docs-only commit. В
metadata обновляются `updated_utc`, `current_phase`, `last_atomic_action`,
`last_atomic_result`, `next_atomic_action`, `rollover_required`,
`recommended_next_session_mode` и `mode_reason_plain`; в строке фазы — её статус,
sanitized результат и минимальная проверка. Full IDs/secrets/PII остаются только
в protected Git-ignored evidence.

`failed|ambiguous` не разрешает продвижение или слепой retry: сначала фиксируется
`rollback_or_containment` либо hard blocker. В сообщении владельцу обязательно
назвать, что сделано, что read-only подтверждено, текущий/следующий atomic step и
режим следующей сессии, даже если `rollover_required: no`.

Текущая рекомендация — **High**: впереди обычный плановый preview deploy, exact
candidate и rollback известны, серьёзного incident/drift сейчас не зафиксировано.
`Medium` подходит только для следующего чисто read-only/docs/manual шага. `Max`
нужен лишь при подтверждённом риске неверной среды/production, неоднозначной
потенциально необратимой записи, неработающем recovery/rollback, corruption,
Access/authorization bypass, secret exposure или несовместимости code/schema.
Штатная fail-closed остановка, обычный provider rejection, подтверждённый
no-write timeout, косметика и локализованная docs-ошибка не являются причиной
для `Max`.

### Последний atomic record

Последняя remote mutation текущего продолжения зафиксирована явно:

```text
atomic_action: apply-0024-0025-to-recovery-d1
observed_utc: 2026-08-31T17:39:46Z
phase: phase-1-recovery-schema
authorization_scope: owner-authorized-preview-only-phases-1-2
target_fingerprint: preview-d1-ccdeb22bb2a1-new-recovery-d1-4b2802119d09
candidate_or_version: 1607d6de55491afe7a2bea059e5f36e8718e0b8c
before: isolated-recovery-exactly-restored-at-migrations-1-through-23-with-fk-zero
after: recovery-pending-zero-ledger-25-max-25-schema-535-lineage-8-objects-4-columns-current-2-plus-1703-fk-zero
result: success
evidence: protected-currentuser-stage13-recovery-candidate-1607d6d-migration-verification
rollback_or_containment: no-downgrade-recovery-remains-unbound-forward-fix-or-separate-cleanup-only
next_atomic_action: apply-0024-0025-to-preview-d1
rollover_required: no
recommended_next_session_mode: High
mode_reason_plain: planned-preview-migration-with-exact-pending-set-verified-recovery-and-no-downgrade
```

После первой mutation этот block заменяется её фактическим record; результаты
попыток принимают ровно `success|failed|ambiguous`.

## Что не повторять

- Не повторять independent review current candidate: GO уже получен.
- Не повторять full Vitest/E2E для неизменённого reviewed runtime. Exact inherited
  evidence: full Vitest 75/75 files, 561 pass + 1 Windows-only skip; Chromium
  E2E 18/18; dependency audit 0. Current review additionally passed focused
  continuity unit, check, docs, build, release scan и diff check.
- Не повторять migrations `0001`–`0023`, synthetic import baseline/candidate
  lifecycle, Access perimeter setup или empty-R2 verification без drift.
- Не включать real Office/PII import и не использовать direct SQL для account/
  bootstrap/provider state.
- Не задерживать preview из-за `P2/P3`; записать backlog. До продвижения
  исправляются только reproducible `P0/P1` по `AGENTS.md`.

## Permission и stop conditions

Без вопроса разрешены local/read-only preparation, focused checks и read-only
remote reconciliation без PII/secrets. Owner permission нужна перед D1/R2 write,
migration/import transition, Worker deploy/rollback, Access/config/secret
mutation, provider send, bootstrap/role/session mutation и production/CMS.

Однородные preview mutations запрашиваются одной пакетной фазой. Владелец лично
вводит password, OTP, verification link и secret values. Остановка допустима
только непосредственно перед human/permission boundary, независимой ролью или
hard blocker: target drift, отсутствующий rollback/recovery, security/PII/
ownership риск либо воспроизводимо сломанный обязательный flow.

## Ссылки

- [Краткая инструкция владельца](../operations/OWNER_FULL_MANUAL_PREVIEW_GUIDE.md)
- [Полный manual-preview runbook](../operations/FULL_MANUAL_PREVIEW.md)
- [Постоянный goal prompt](../prompts/stage-13-continue-deployment.md)
- [Deployment runbook](../operations/PRODUCTION_DEPLOYMENT.md)
- [Readiness checklist](../operations/PRODUCTION_READINESS_CHECKLIST.md)
- [Persistent handoff](handoffs/stage-13.md)

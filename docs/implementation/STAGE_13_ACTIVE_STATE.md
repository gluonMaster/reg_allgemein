# Stage 13: активное состояние

<!-- stage-13-current-review-status: independent_go -->

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-08-31T17:57:10Z
reviewed_candidate: 1607d6de55491afe7a2bea059e5f36e8718e0b8c
last_completed_gate: phase-2-fail-closed-worker-deploy-verified
next_gate: phase-3-owner-authorized-auth-roles
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
current_review_status: independent_go
current_phase: phase-3-auth-roles
last_atomic_action: deploy-reviewed-candidate-to-preview-worker
last_atomic_result: success
next_atomic_action: owner-authorized-enable-preview-auth-email-for-controlled-recipients
rollover_required: no
recommended_next_session_mode: High
mode_reason_plain: controlled-preview-auth-and-role-mutations-have-known-target-boundaries-and-fail-closed-containment
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
- Owner-authorized preview-only phases 1–2 завершены: candidate-bound protected
  recovery/restore verified, `0024`/`0025` применены только к recovery и preview,
  exact reviewed Worker deployed и проверен с fail-closed auth/providers.
- Следующий gate — отдельно разрешённые controlled preview auth/email, два
  verified owner-controlled account и one-shot bootstrap/RBAC. Production не
  разрешён.

### Phase 0 target lock — 2026-08-31 (pre-mutation evidence)

- Clean `HEAD=cc5c83b…`; reviewed `1607d6d…` is an ancestor. Descendant changes
  are limited to docs/checker/tests and do not change runtime, migrations,
  dependencies, deployment config or E2E harness.
- Protected config/control agree on one preview account/Worker/D1, two distinct
  private EEUR R2 buckets and the canonical preview origin. Production/CMS
  targets are absent. Active Worker remains one version at 100%; the protected
  compatible rollback version is still available.
- Pre-mutation preview had exactly `0024_contract_preview_review.sql` and
  `0025_contract_storage_intent_generations.sql` pending, FK violations `0`, one
  current academic period, synthetic current counts `2 + 1703`, and zero users/
  admins/bootstrap actions/contract offers/Telegram rows. Later phase records
  below supersede this baseline.
- Both preview R2 buckets remain private/EEUR and empty. Deployed fail-closed
  vars, D1/R2/Browser/assets bindings and the three existing secret names match;
  Telegram secret remains absent. All nine latest scheduled-job states are
  `succeeded|feature_disabled`; two historical failed rows are from 2026-08-25
  and are not current.
- Fresh anonymous and invalid Access probes return `302` to the same login host;
  no bypass was observed. The protected CurrentUser-DPAPI service token was
  decrypted only in memory: root returned `200`, operations health returned
  `204` with `no-store` and `noindex, nofollow`. No OTP/login was initiated and
  no credential value was printed. Phase 2 repeated the same valid-side smoke
  successfully after deploy.
- Remote `PRAGMA quick_check` made no write and returned safe Cloudflare/D1
  `SQLITE_NOMEM` code `7500`; FK and targeted counts succeeded. Phase 1 then ran
  local full integrity plus exact remote schema/per-table/FK fallback on the new
  candidate-bound isolated restore before apply.

## Последнее известное preview state

Fresh reconciliation нужно выполнить непосредственно перед mutation; ниже —
последнее зафиксированное состояние, которое нельзя молча считать актуальным при
обнаружении drift.

- Exact reviewed candidate `1607d6d…` обслуживает 100% preview traffic
  (sanitized version fingerprint `1a0707dc5dec`); hostname закрыт Cloudflare
  Access, versioned preview routes возвращают `404`. Previous compatible Worker
  version сохранена inactive для rollback.
- Preview и candidate-bound unbound recovery D1 имеют migrations `0001`–`0025`,
  pending `0`, FK violations `0`, schema objects `535` и lineage `8/4`. Preview
  сохраняет current synthetic pair `2 + 1703`, users/admins `0`; one-shot
  bootstrap доступен и не использован.
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
| 1. Recovery/schema | `passed` | DPAPI restore exact/plaintext removed; recovery and preview both `25/535`, lineage `8/4`, current `2 + 1703`, FK 0; old Worker root/health `200/204` | ledger, FK, local quick-check plus remote exact fallback, key counts |
| 2. Worker deploy | `passed` | strict dry-run и deploy exact `1607d6d…`; one active version 100%, bindings/vars/secrets exact, auth/providers fail-closed, previous compatible version retained | Access deny `302`, valid root/health `200/204`, versioned routes `404`, D1/R2/jobs stable |
| 3. Auth/roles | `blocked_on_owner_authorization_and_input` | Resend allowlist, два verified accounts, one-shot bootstrap | real test email, audit/replay denial, role split |
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

Текущая рекомендация — **High**: впереди контролируемые preview auth/email,
account и bootstrap mutations с известными target/containment; серьёзного
incident/drift сейчас не зафиксировано.
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
atomic_action: deploy-reviewed-candidate-to-preview-worker
observed_utc: 2026-08-31T17:57:10Z
phase: phase-3-auth-roles
authorization_scope: owner-authorized-preview-only-phases-1-2
target_fingerprint: worker-242c1796e930-active-version-1a0707dc5dec-preview-d1-ccdeb22bb2a1
candidate_or_version: 1607d6de55491afe7a2bea059e5f36e8718e0b8c
before: strict-dry-run-passed-schema-25-compatible-previous-version-captured-access-closed
after: exact-candidate-one-active-100-percent-fail-closed-bindings-exact-access-302-valid-root-health-200-204-versioned-routes-404-d1-r2-jobs-stable
result: success
evidence: protected-currentuser-stage13-recovery-candidate-1607d6d-worker-deploy-evidence
rollback_or_containment: rollback-not-needed-previous-compatible-worker-retained-d1-downgrade-forbidden
next_atomic_action: owner-authorized-enable-preview-auth-email-for-controlled-recipients
rollover_required: no
recommended_next_session_mode: High
mode_reason_plain: controlled-preview-auth-and-role-mutations-have-known-target-boundaries-and-fail-closed-containment
```

После каждой следующей mutation этот block заменяется её фактическим record;
результаты попыток принимают ровно `success|failed|ambiguous`.

## Что не повторять

- Не повторять independent review current candidate: GO уже получен.
- Не повторять full Vitest/E2E для неизменённого reviewed runtime. Exact inherited
  evidence: full Vitest 75/75 files, 561 pass + 1 Windows-only skip; Chromium
  E2E 18/18; dependency audit 0. Current review additionally passed focused
  continuity unit, check, docs, build, release scan и diff check.
- Не повторять phases 1–2, migrations `0001`–`0025`, synthetic import baseline/
  candidate lifecycle, Access perimeter setup или empty-R2 verification без
  drift/material diff/reproducible `P0/P1`.
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

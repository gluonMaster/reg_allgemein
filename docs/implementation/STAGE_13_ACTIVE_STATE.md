# Stage 13: активное состояние

<!-- stage-13-current-review-status: independent_go -->

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-08-31T10:42:11Z
reviewed_candidate: 1607d6de55491afe7a2bea059e5f36e8718e0b8c
last_completed_gate: full-manual-preview-remediation-independent-review-go
next_gate: full-manual-preview-owner-authorized-recovery-apply-deploy
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
current_review_status: independent_go
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
- Следующий gate: fresh read-only target reconciliation, candidate-bound
  recovery evidence/isolated recovery, apply pending `0024`/`0025` только к
  preview/recovery и deploy exact reviewed Worker только в preview. Требуется
  отдельное прямое разрешение владельца; production не разрешён.

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
| 0. Target lock | `next` | exact candidate/preview targets/rollback/recovery source сверены read-only | no drift, production/CMS absent |
| 1. Recovery/schema | `blocked_on_owner_permission` | fresh recovery + `0024`/`0025` только preview/recovery | ledger, FK, quick-check, key counts |
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

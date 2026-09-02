# Stage 13: активное состояние

<!-- stage-13-current-review-status: pending_independent_review -->

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-09-02T13:40:19Z
reviewed_candidate: 146f9c54ff082ad695ef47c7da9c6a578e09a9a5
last_completed_gate: phase-3-turnstile-async-onload-local-remediation-verified
next_gate: phase-3-turnstile-async-onload-independent-review
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
current_review_status: pending_independent_review
current_phase: phase-3-auth-roles
last_atomic_action: deploy-reviewed-registration-invalid-input-remediation-to-preview
last_atomic_result: success
next_atomic_action: independent-review-local-turnstile-async-onload-remediation
rollover_required: yes
recommended_next_session_mode: Medium
mode_reason_plain: next-step-is-read-only-independent-review-of-local-fix-no-remote-write-or-ambiguous-remote-result
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

- Local runtime candidate: `bef578917575f233ce4853a1432f1d0d29b22289`,
  direct parent `27218225de661126ffde0a8cb597a3add949f619`. Изменены только
  `TurnstileWidget.svelte` и два E2E files. Он не развёрнут и ожидает
  independent review. Классификация preview: `P0: 0`, `P1: 1`, `P2: 1`,
  `P3: 0`; `P1` локально исправлен, но remote flow ещё не подтверждён.
- **Текущий blocker `P1`:** deployed registration не создаёт Turnstile widget.
  Реальный `api.js` загружен, но `ready()` выбрасывает `TurnstileError 3857`
  при `async/defer`; render не вызывается, iframe отсутствует, submit disabled.
  Это подтверждённый отказ `AUTH-02` текущего milestone, а не прежний `P2`.
  Owner разрешил только минимальную локальную frontend remediation и проверки.
  Новый candidate ожидает independent review; deploy/registration/provider
  writes не разрешены. Last remote deploy record ниже остаётся `success`.
- Fresh local evidence `bef5789…`: regression RED на старом коде → GREEN после
  API-onload fix; Chromium `23/23`, включая registration `5/5`; check `0/0`,
  build, production dependency audit `0`, focused formatting, docs/continuity,
  release scan `569/569` и diff check прошли. Full Vitest `--maxWorkers=4`:
  `76/76` files, `566` passed + 1 предусмотренный Windows skip, `703.14s`.
  Все проверки относятся к неизменённому runtime tree `bef5789…`; последующий
  checkpoint только docs. Повтор полного suite без material diff не требуется.
  Mock не заменяет real-token/Siteverify/replay validation, которая pending.
- Latest independently reviewed historical runtime remediation anchor
  `146f9c54ff082ad695ef47c7da9c6a578e09a9a5`; direct parent
  `fbb9520eb670cd22f5ac236f1203823942078c1a`. Он сохраняет безопасные
  registration values, никогда не возвращает password, обновляет current privacy
  version, управляет Turnstile explicit-render lifecycle и не разрешает submit
  до полученного token. Исторический verdict для `146f9c5…` — **GO**,
  0 `P0`, 0 `P1`, 1 `P2`, 0 `P3`; новое browser evidence выше открыло `P1`.
  Preview deploy завершён, но повтор registration запрещён до исправления,
  отдельного review и отдельно разрешённого нового deploy.
- Last deployed candidate:
  `146f9c54ff082ad695ef47c7da9c6a578e09a9a5`; direct parent
  `fbb9520eb670cd22f5ac236f1203823942078c1a`.
- Исторический verdict `583165e…`: **GO**, 0 `P0` / 0 `P1`. Candidate заменяет
  SvelteKit static URL-origin comparison на runtime guard, привязанный к
  validated `PORTAL_PUBLIC_ORIGIN`; literal `Origin: null` принимается только
  с exact same-origin navigation Fetch Metadata. Full Vitest `75/75`, `563`
  pass + 1 Windows skip, Chromium E2E `18/18`, check/build/audit/docs/scan и
  diff check прошли. Два reviewer `P2` записаны в handoff и не блокируют
  ближайший milestone.
- Owner-authorized preview-only phases 1–2 завершены: candidate-bound protected
  recovery/restore verified, `0024`/`0025` применены только к recovery и preview,
  exact reviewed Worker deployed и проверен с fail-closed auth/providers.
- Отдельно разрешённый preview-only auth/email deploy exact `ec11bbc…` завершён:
  auth и Resend включены только для двух hashed allowlisted recipients; реальные
  sends/accounts/bootstrap не выполнялись. Первая owner-controlled registration
  attempt затем воспроизводимо остановилась на SvelteKit CSRF/origin boundary с
  `Cross-site POST form submissions are forbidden` до application action. Fresh
  D1 postcondition подтвердил полный no-write: users/tokens/privacy acknowledgement/
  email outbox/sessions/auth audit/bootstrap остаются `0`, FK `0`. Это было
  `P1` текущего milestone.
- Отдельно разрешённый preview-only deploy exact `583165e…` завершён успешно:
  active version fingerprint `2de99c0c5815` обслуживает 100% traffic, previous
  `3f189dd10ce8` сохранена для rollback. Access `302/302/200/204`, register GET
  `200` с form, новая и предыдущая versioned routes `404`; D1 остаётся
  `25/pending 0/FK 0`, synthetic `2 + 1703`, все auth/account/outbox/session/
  bootstrap counts `0`, оба R2 пусты и latest nine jobs healthy. Rollback не
  потребовался.
- Разрешённый retry первого controlled account затем вернул generic `400`
  `Bitte prüfen Sie Ihre Eingaben.` и очистил форму. Read-only D1 reconciliation
  доказал полный no-write/no-send: users/tokens/privacy acknowledgement/email
  outbox/sessions/auth audit/bootstrap и даже `auth:register` rate-limit buckets
  остались `0`, FK `0`. Значит request был отклонён `registerInputSchema` до
  auth service, Turnstile verification, password hash и provider dispatch.
  Failed-response DOM имеет пустые `privacyNoticeVersion` и
  `cf-turnstile-response`, тогда как fresh GET отдаёт privacy version длиной 25;
  exact исходное invalid field generic response не раскрывает. Это новый `P1`
  текущего milestone. Повтор submit запрещён до local diagnosis/remediation;
  production не разрешён.
- Local remediation gate завершён на exact runtime anchor `146f9c5…`:
  focused registration browser `2/2`, `svelte-check` `0/0`, полный Chromium
  `20/20`, полный Vitest при `4 workers` — `76/76` files, `566` passed и один
  Windows-only skip, build, production dependency audit `0`, docs/continuity,
  release scan `569/569`, formatting и diff check прошли. Первый unrestricted
  Vitest run дал только три D1 timeout на 15 сек.; все три прошли последовательно
  и затем в полном `4 workers` run. Independent review дополнительно выполнил
  check 0/0, focused unit 15/15 и registration browser 2/2. Reviewer `P2`:
  expiry/client-error recovery требует reload вместо explicit reset, а повторная
  загрузка после уже failed script element может остаться pending. Это не ломает
  ближайший controlled retry и не блокирует milestone.
- Отдельно разрешённый exact preview Worker deploy `146f9c5…` завершён exit 0.
  Новая version fingerprint `a4fab5d09f63` одна обслуживает 100% traffic;
  предыдущая compatible `2de99c0c5815` сохранена для rollback. Fresh read-only
  postcondition подтвердил Access `302/302/200/204`, registration GET `200`,
  versioned route `404`, exact config/bindings/three secret names, D1
  `25/pending 0/FK 0`, synthetic `2 + 1703`, нулевые users/tokens/privacy/
  outbox/sessions/auth-audit/register-rate/bootstrap counts, обе private EEUR R2
  пусты и latest jobs `9/9` healthy. Rollback не требовался. Более поздний
  Turnstile `3857` блокирует регистрацию, но не отменяет deployment postcondition.

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

- Exact reviewed candidate `146f9c5…` обслуживает 100% preview traffic
  (sanitized version fingerprint `a4fab5d09f63`); hostname закрыт Cloudflare
  Access, active versioned preview route возвращает `404`. Previous compatible
  registration-origin Worker `2de99c0c5815` сохранена inactive для rollback;
  более ранние auth-email/fail-closed versions также retained.
- Preview и candidate-bound unbound recovery D1 имеют migrations `0001`–`0025`,
  pending `0`, FK violations `0`, schema objects `535` и lineage `8/4`. Preview
  сохраняет current synthetic pair `2 + 1703`, users/admins `0`; one-shot
  bootstrap доступен и не использован.
- Два отдельных preview R2 bucket private/EU и пусты.
- Public auth и Resend включены только в Access-protected preview и ограничены
  allowlist ровно из двух уникальных SHA-256. Plaintext mailbox в config/tracked
  evidence нет; failed first registration не создала delivery, account или
  session. Telegram,
  document upload, contract send/renderer, media и public contract functions
  остаются fail-closed. Scheduled operations deployed.
- Для Telegram известен private channel invite link, но это не Bot API target.
  До preflight нужны dedicated bot token, exact signed-decimal chat ID,
  `channel` type и bot-admin permission **Post Messages**. Values не выводятся.

## Квазиатомарная цепочка

| Фаза               | Статус                                                   | Результат                                                                                                                                                                 | Минимальная проверка                                                                                                                      |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Target lock     | `passed`                                                 | exact candidate/preview targets/rollback/recovery source сверены read-only; old recovery is expired/not candidate-bound                                                   | no drift, production/CMS absent; Access deny `302`, valid root/health `200/204`                                                           |
| 1. Recovery/schema | `passed`                                                 | DPAPI restore exact/plaintext removed; recovery and preview both `25/535`, lineage `8/4`, current `2 + 1703`, FK 0; old Worker root/health `200/204`                      | ledger, FK, local quick-check plus remote exact fallback, key counts                                                                      |
| 2. Worker deploy   | `passed`                                                 | strict dry-run и deploy exact `1607d6d…`; one active version 100%, bindings/vars/secrets exact, auth/providers fail-closed, previous compatible version retained          | Access deny `302`, valid root/health `200/204`, versioned routes `404`, D1/R2/jobs stable                                                 |
| 3. Auth/roles      | `turnstile_async_onload_pending_independent_review` | deployed `146f9c5…`/`a4fab5d09f63` has confirmed pre-render P1 error 3857; local frontend fix prepared; previous `2de99c0c5815` retained | independent read-only review of local fix; no deploy or registration retry yet |
| 4a. Product flows  | `blocked_on_phase_3`                                     | parent/admin/catalog/trial/request/price/support/privacy                                                                                                                  | guided affected browser scenarios                                                                                                         |
| 4b. Documents      | `blocked_on_phase_3`                                     | real synthetic upload → AV → review → cleanup                                                                                                                             | R2 isolation/hash/owner access                                                                                                            |
| 4c. Contracts      | `blocked_on_phase_3`                                     | 4 marked PDF + 1 accept/formation/certificate                                                                                                                             | Browser/R2/email receipts and lifecycle                                                                                                   |
| 4d. Telegram       | `blocked_on_target_and_send_permission`                  | one PII-free normal-outbox delivery                                                                                                                                       | preflight, exactly-one send, verify/reconcile                                                                                             |
| 5. Owner pass      | `blocked_on_phases_3_4`                                  | desktop/mobile/manual exploratory complete                                                                                                                                | no open P0/P1                                                                                                                             |

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

Текущая рекомендация — **Medium**: следующий шаг — read-only independent review
локального frontend fix; нет неоднозначного remote результата. Новый deploy,
account write и verification delivery требуют отдельных разрешений. `Max`
нужен лишь при подтверждённом риске неверной среды/production, неоднозначной
потенциально необратимой записи, неработающем recovery/rollback, corruption,
Access/authorization bypass, secret exposure или несовместимости code/schema.
Штатная fail-closed остановка, обычный provider rejection, подтверждённый
no-write timeout, косметика и локализованная docs-ошибка не являются причиной
для `Max`.

### Последний atomic record

Последняя попытка remote mutation текущего продолжения зафиксирована явно:

```text
atomic_action: deploy-reviewed-registration-invalid-input-remediation-to-preview
observed_utc: 2026-09-02T12:46:12Z
phase: phase-3-auth-roles
authorization_scope: owner-authorized-exact-reviewed-registration-remediation-preview-worker-deploy-only-no-registration-retry-provider-send-account-bootstrap-production-or-cms
target_fingerprint: preview-worker-active-version-a4fab5d09f63-preview-d1-unchanged
candidate_or_version: 146f9c54ff082ad695ef47c7da9c6a578e09a9a5
before: one-active-100-percent-version-2de99c0c5815-access-302-302-200-204-d1-25-pending-zero-fk-zero-auth-counts-zero-r2-empty-jobs-nine-of-nine
after: one-active-100-percent-version-a4fab5d09f63-previous-2de99c0c5815-available-access-302-302-200-204-register-get-200-versioned-route-404-config-exact-d1-r2-auth-counts-and-jobs-unchanged
result: success
evidence: protected-ignored-preview-worker-deploy-evidence-20260902-registration-remediation-json-sha256-prefix-615418836c4a
rollback_or_containment: rollback-not-required-previous-compatible-version-2de99c0c5815-retained
next_atomic_action: independent-review-local-turnstile-async-onload-remediation
rollover_required: yes
recommended_next_session_mode: Medium
mode_reason_plain: next-step-is-read-only-independent-review-of-local-fix-no-remote-write-or-ambiguous-remote-result
```

После каждой следующей mutation этот block заменяется её фактическим record;
результаты попыток принимают ровно `success|failed|ambiguous`.
Поля next/mode обновлены после локальной диагностики `3857`; before/after/result
по-прежнему описывают последнюю remote mutation, успешный deploy.

## Что не повторять

- Не переносить historical GO `146f9c5…` на новую local remediation: реальный
  browser отказ `3857` — `P1`, поэтому новый exact candidate требует review.
- Не повторять deploy exact `146f9c5…`: preview postcondition прошёл, active
  fingerprint `a4fab5d09f63`; повторный deploy без material drift запрещён.
- Не повторять registration submit до исправленного reviewed preview deploy
  и отдельного разрешения; retry — account/provider mutation с обязательным
  read-only reconcile до любого второго account или bootstrap.
- Не повторять full local gates без material diff. Historical `146f9c5…` evidence:
  full Vitest 76/76 files, 566 pass + 1 Windows-only skip; Chromium E2E 20/20;
  check, build, dependency audit 0, docs, release scan и diff check прошли.
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

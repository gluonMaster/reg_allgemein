# Stage 13: активное состояние

<!-- stage-13-current-review-status: independent_go -->

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-09-02T14:08:03Z
reviewed_candidate: bef578917575f233ce4853a1432f1d0d29b22289
last_completed_gate: phase-3-turnstile-async-onload-preview-deploy-and-real-widget-passed
next_gate: phase-3-authorized-first-controlled-registration-owner-input
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
current_review_status: independent_go
current_phase: phase-3-auth-roles
last_atomic_action: deploy-reviewed-turnstile-async-onload-remediation-to-preview
last_atomic_result: success
next_atomic_action: owner-submit-first-controlled-registration-once-then-readonly-reconcile
rollover_required: no
recommended_next_session_mode: High
mode_reason_plain: authorized-controlled-preview-registration-awaiting-owner-input-known-target-and-reconciliation-no-remote-ambiguity
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

- Owner `2026-09-02` явно разрешил первую controlled registration с verification
  delivery. Разрешение принято и повторно не запрашивается. Fresh read-only
  preflight `2026-09-02T14:08:03Z`: exact `745295d36248`/100%, Access
  `302/302/200/204`, config exact, D1 `25/pending 0/FK 0`, synthetic `2 + 1703`,
  users/admins/tokens/privacy/outbox/session/auth-audit/register-rate/bootstrap
  и provider receipts `0`, R2 empty, latest jobs `9/9` healthy.
  Protected ignored before evidence
  `imports/preview-first-registration-before-20260902T140803Z.json`, digest
  `985e4b4f1084`. Remote mutation в этом preflight не выполнялась.
  Chrome form подготовлена с synthetic names; corporate mailbox/password и
  privacy acknowledgement вводит владелец по owner guide. Разрешена одна
  отправка; до retry/verification-link consumption/second account/bootstrap
  обязателен read-only reconcile и отдельный docs-only atomic checkpoint.
  Read-only helper `tmp/stage13-first-registration-checkpoint.ps1 -Mode after`
  сохраняет агрегаты без PII; canonical checks — account/token/privacy/audit,
  outbox status/attempts/provider receipt, sessions/roles/FK и exact target.
- Local runtime candidate: `bef578917575f233ce4853a1432f1d0d29b22289`,
  direct parent `27218225de661126ffde0a8cb597a3add949f619`. Изменены только
  `TurnstileWidget.svelte` и два E2E files. Independent review завершён: **GO**,
  candidate `P0: 0`, `P1: 0`, `P2: 1`, `P3: 0` (прежний backlog).
  Fresh review: registration Chromium `5/5`, auth/registration unit `15/15`,
  check `0/0`; runtime после exact candidate не менялся. Отдельно разрешённый
  preview deploy завершён: version fingerprint `745295d36248`, 100% traffic.
  Текущих подтверждённых `P0/P1` нет; прежний `P2` остаётся backlog.
- **Turnstile render `P1` закрыт:** fresh Chrome GET после deploy создал реальный
  widget, показал «Успешно» и enabled submit. Отказ `3857` до render больше не
  воспроизводится. Поля оставлены пустыми, submit не выполнялся. Real client
  widget evidence получено; server Siteverify/replay и registration/email
  end-to-end всё ещё pending. Разрешение на первый controlled registration и
  verification delivery получено; ожидается ввод владельца с read-only reconcile
  до любого повтора, второго account или bootstrap.
- Fresh deploy evidence: build и strict dry-run прошли; exact candidate
  annotation/100% traffic, Access `302/302/200/204`, register GET `200`, versioned
  route `404`, config/bindings/three secret names совпали. D1 `25/pending 0/FK 0`,
  synthetic `2 + 1703`, нулевые auth/account/outbox/session/bootstrap/register-rate
  counts, пустые EEUR R2 и latest jobs `9/9` healthy сохранены. Previous compatible
  `a4fab5d09f63` available; rollback не требовался. Protected ignored evidence
  digest `31115e396ae0`; postcondition `2026-09-02T13:56:02Z`, browser checkpoint
  `2026-09-02T13:57:13Z`.
- Fresh local evidence `bef5789…`: regression RED на старом коде → GREEN после
  API-onload fix; Chromium `23/23`, включая registration `5/5`; check `0/0`,
  build, production dependency audit `0`, focused formatting, docs/continuity,
  release scan `569/569` и diff check прошли. Full Vitest `--maxWorkers=4`:
  `76/76` files, `566` passed + 1 предусмотренный Windows skip, `703.14s`.
  Все проверки относятся к неизменённому runtime tree `bef5789…`; последующий
  checkpoint только docs. Повтор полного suite без material diff не требуется.
  Реальный client widget теперь также прошёл; Siteverify/replay validation pending.
- Historical runtime remediation anchor
  `146f9c54ff082ad695ef47c7da9c6a578e09a9a5`; direct parent
  `fbb9520eb670cd22f5ac236f1203823942078c1a`. Он сохраняет безопасные
  registration values, никогда не возвращает password, обновляет current privacy
  version, управляет Turnstile explicit-render lifecycle и не разрешает submit
  до полученного token. Исторический verdict для `146f9c5…` — **GO**,
  0 `P0`, 0 `P1`, 1 `P2`, 0 `P3`; новое browser evidence выше открыло `P1`.
  Исторический preview deploy завершён; последующий Turnstile fix/review/deploy
  и реальный widget check теперь пройдены. Registration разрешена и ждёт ввода владельца.
- Last deployed candidate:
  `bef578917575f233ce4853a1432f1d0d29b22289`; direct parent
  `27218225de661126ffde0a8cb597a3add949f619`.
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
  Turnstile `3857` затем блокировал регистрацию; новый deploy `bef5789…` и
  реальный widget check выше закрыли этот render P1.

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

- Exact reviewed candidate `bef5789…` обслуживает 100% preview traffic
  (sanitized version fingerprint `745295d36248`); hostname закрыт Cloudflare
  Access, active versioned preview route возвращает `404`. Previous compatible
  registration-remediation Worker `a4fab5d09f63` сохранена inactive для rollback;
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
| 3. Auth/roles      | `first_registration_authorized_awaiting_owner_input` | deployed `bef5789…`/`745295d36248` at 100%; widget success; fresh preflight zero accounts/tokens/outbox; owner authorized one registration and verification delivery | owner submits once, then read-only reconcile and atomic checkpoint before any next write |
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

Текущая рекомендация — **High**: разрешённый controlled registration ожидает ввода
владельца; target и read-only reconciliation известны, remote ambiguity отсутствует.
Rollover не обязателен: точный context сохранён. Account write и verification
delivery требуют отдельных разрешений. `Max`
нужен лишь при подтверждённом риске неверной среды/production, неоднозначной
потенциально необратимой записи, неработающем recovery/rollback, corruption,
Access/authorization bypass, secret exposure или несовместимости code/schema.
Штатная fail-closed остановка, обычный provider rejection, подтверждённый
no-write timeout, косметика и локализованная docs-ошибка не являются причиной
для `Max`.

### Последний atomic record

Последняя попытка remote mutation текущего продолжения зафиксирована явно:

```text
atomic_action: deploy-reviewed-turnstile-async-onload-remediation-to-preview
observed_utc: 2026-09-02T13:56:02Z
phase: phase-3-auth-roles
authorization_scope: owner-authorized-exact-reviewed-turnstile-onload-preview-worker-deploy-only-no-registration-retry-provider-send-account-bootstrap-production-or-cms
target_fingerprint: preview-worker-active-version-745295d36248-preview-d1-unchanged
candidate_or_version: bef578917575f233ce4853a1432f1d0d29b22289
before: one-active-100-percent-version-a4fab5d09f63-access-302-302-200-204-d1-25-pending-zero-fk-zero-auth-counts-zero-r2-empty-jobs-nine-of-nine
after: one-active-100-percent-version-745295d36248-previous-a4fab5d09f63-available-exact-candidate-annotation-access-302-302-200-204-register-get-200-versioned-route-404-config-exact-d1-r2-auth-counts-and-jobs-unchanged
result: success
evidence: protected-ignored-preview-worker-deploy-evidence-20260902-turnstile-onload-json-sha256-prefix-31115e396ae0-includes-read-only-browser-widget-success
rollback_or_containment: rollback-not-required-previous-compatible-version-a4fab5d09f63-retained
next_atomic_action: owner-submit-first-controlled-registration-once-then-readonly-reconcile
rollover_required: no
recommended_next_session_mode: High
mode_reason_plain: authorized-controlled-preview-registration-awaiting-owner-input-known-target-and-reconciliation-no-remote-ambiguity
```

После каждой следующей mutation этот block заменяется её фактическим record;
результаты попыток принимают ровно `success|failed|ambiguous`.
Before/after/result описывают последнюю remote mutation, успешный deploy `bef5789…`.
Последующий browser GET подтвердил реальный widget без submit или provider send.

## Что не повторять

- Не повторять deploy exact `bef5789…`: preview postcondition и real widget
  прошли, active fingerprint `745295d36248`; повтор без material drift запрещён.
- Не считать client widget success доказательством server Siteverify/replay,
  account creation или verification delivery: эти paths ещё не выполнялись.
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

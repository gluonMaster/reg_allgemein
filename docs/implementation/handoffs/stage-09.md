# Handoff этапа 09: договоры, acceptance и activation

Статус: `done`

Production readiness: `feature_disabled`

## Baseline

- Branch: `master`.
- Start HEAD: `82a4df94205dc7f10bc7bf62e92ca5d1674ed080`.
- Initial `git status --short`: возобновление прерванного этапа с единственным
  незавершённым artifact `?? migrations/0010_contracts.sql`; migration была
  проверена и дополнена, применённые `0001`–`0009` не изменялись.
- Предыдущий handoff: `docs/implementation/handoffs/stage-08.md`, status `done`.

## Выполнено

- Requirement/acceptance IDs: `SYS-03`, `CONTRACT-01`–`CONTRACT-20`,
  `PRICE-01`, `PRICE-02`, `PRICE-04`, `AUTH-08`, `PRIV-03`, `REL-01`,
  `TIME-01`; разделы 1A, 6, 8 и 10 `ACCEPTANCE_CRITERIA.md`.
- Migration ID: `0010_contracts.sql`. Добавлены approved provider/media-contact/
  template versions, family contract sequences, operational engagements,
  offers/snapshots, render attempts, private artifacts, parent/admin evidence,
  acceptances, formed contracts/certificates/deliveries/events, termination/
  attendance/funding/media records, fake outbox, assertions и family correction
  effects. Constraints/triggers запрещают mutation принятого evidence и
  недопустимые lifecycle/service XOR.
- Render contract: `contract-render-v1`; template IDs `group_yearly`,
  `group_monthly`, `individual_hourly`, `nachhilfe_hourly`; closed Zod matrix
  service/template/billing/payer/unit semantics проверяется до render и повторно
  при formation.
- Artifact boundary: `ContractPdfAdapter` версии `pdf-adapter-v1`.
  `synthetic-test-pdf-v1` создаёт input-dependent valid PDF только в `APP_ENV=test`.
  `cloudflare-browser-run-pdf-v1` принимает только inline HTML, выключает JS,
  запрещает external resources, применяет A4/tagged/outline options и учитывает
  HTML/PDF size, daily browser budget, 429/5xx retry metadata. HTML/PDF и
  formation certificate сохраняются под random private R2 keys; SHA-256
  проверяется при owner/admin download, чтение audit-ится.
- Snapshot/hash versions: canonical render input + source manifest + HTML/PDF
  hashes образуют immutable `contract_hash`; acceptance связывается ровно с ним.
  Formation создаёт отдельный `contract-formation-v1` source/hash и certificate,
  не перерендеривая accepted offer.
- Lifecycle: draft с окончательно зарезервированным FamilyID contract number →
  render/send → owner accept/decline → отдельная atomic admin formation/activation.
  Idempotency проверяется до mutable-state checks; закрытый account, cross-owner,
  stale offer/hash/price/funding/capacity и duplicate activation fail-closed.
  Group price quote обязателен для production template и повторно проверяется на
  status/expiry/current version/exact snapshot при formation.
- Numbering: current assigned family/version/child проверяются в reservation
  transaction; sequence не откатывается и номера не переиспользуются. Family
  correction supersede-ит old-family nonterminal offers, сохраняет их immutable
  number/artifacts и переводит только future reservations на destination.
- End/media: owner portal сохраняет immutable Widerruf/Kündigung/mutual receipts
  и fake durable-confirmation outbox; admin отдельно подтверждает/оспаривает дату,
  а approve/decline разрешены только mutual request. Group-monthly month-end и
  group-yearly renewal block используют Berlin calendar semantics. Individual/
  Nachhilfe attendance notice немедленно завершает будущую service participation,
  создаёт event, confirmation outbox и teacher/admin task, не подменяя formal
  termination. Media decline/grant отделены от acceptance; online grant требует
  одновременно feature flag и `compliance_assessment_status=passed`. Admin revoke
  append-only, owner-linked, idempotent и действует с фактического `received_at`.
- Integrations: request/document mutation guards не позволяют менять source
  принятого offer; funding discontinuity supersede-ит открытые funded offers и
  переводит active engagement в `funding_review`; cabinet/history и admin shell
  получили contract pages, audited forced downloads, controlled draft, formation,
  termination review и media-withdrawal forms. Fake typed outbox events готовы
  для этапов 10–11, реальная отправка отсутствует.
- Environment/config без secret values: `CONTRACT_SEND_ENABLED`,
  `CONTRACT_RENDERER`, `CONTRACT_PDF_MAX_HTML_BYTES`, `CONTRACT_PDF_MAX_BYTES`,
  `CONTRACT_MAX_RENDER_ATTEMPTS`, `BROWSER_RUN_DAILY_BUDGET_MS`,
  `MEDIA_ONLINE_GRANT_ENABLED`, `PUBLIC_CONTRACT_FUNCTIONS_ENABLED`.
  Local/example defaults: send/grant/public functions false, renderer disabled.
- Migration/rollback/restore compatibility: clean immutable sequence
  `0001`–`0010` проходит D1 harness; rollback migration не создавалась. До deploy
  требуется обычный backup/restore rehearsal этапа release; production migration
  не выполнялась.

## Проверки

| Команда/сценарий | Результат |
| --- | --- |
| `npm run check` | passed, 0 errors/warnings |
| `npm test` | passed, 27 files / 161 tests |
| `npm run build` | passed, Cloudflare adapter build |
| `npm run test:e2e` | passed, 3 Chromium tests; contract/admin routes и mutation требуют auth |
| Stage-09 focused D1 | passed: full group flow/certificate/end review, number reuse/account closure/price race, media gates/revoke, individual attendance, family reassignment |
| Browser/synthetic adapter unit | passed: four templates, forbidden permutations, valid input-dependent PDF, size/script/external/budget/retry rules |

## Не выполнено и риски

- Открытые вопросы/OQ: новых нет; `OPEN_QUESTIONS.md` не содержит незакрытого
  решения, превращённого в правило.
- External/legal/operational release gates: реальные provider/template bundles,
  legal profile/§ 356a/§ 312k/early-performance approvals, Verein sign-off,
  media withdrawal compliance assessment, Browser Run/R2 production rehearsal и
  production migration отсутствуют.
- Known failures: нет для local/test scope.
- Сознательно вне scope: реальные email/Telegram providers, billing/SEPA/debt
  ledger, Office conversion, runtime source Office templates, automatic legal
  archive purge, media files/historical publication index, self-service media
  revoke, production deploy.

## Release gates

| Gate | Статус | Affected path/flag | Evidence | Owner / next action |
| --- | --- | --- | --- | --- |
| Stage-09 synthetic contract core | `passed` | `APP_ENV=test`, `CONTRACT_RENDERER=synthetic_test` | D1/unit/Playwright/build | Stage 10 может использовать immutable contracts/events |
| Production online contract send | `feature_disabled` | `CONTRACT_SEND_ENABLED=false`, `CONTRACT_RENDERER=disabled` | config rejects production enable; send gate requires approved production template, provider/media snapshots and legal profile | Verein/legal + stage 13 rehearsal |
| Production Browser Run/R2 | `feature_disabled` | `CONTRACT_RENDERER=browser_run` | adapter boundary/unit only; no real invocation | Operator provisions bindings and rehearses approved fixture |
| § 356a/§ 312k public functions | `feature_disabled` | `PUBLIC_CONTRACT_FUNCTIONS_ENABLED=false` | service boundary returns disabled; no public route; production send requiring the function is blocked | Legal approval + dedicated implementation/rehearsal |
| Online media grant/publication | `feature_disabled` | `MEDIA_ONLINE_GRANT_ENABLED=false` | decline works; grant requires flag + passed assessment; risk acceptance cannot bypass | Privacy/legal assessment or approved equivalent revoke path |
| Contract/funding/numbering boundaries | `passed` | D1 `0010`, request/admin contributors | race/reassignment/account-status tests | Preserve in stages 10–12 |
| Real delivery providers | `feature_disabled` | `contract_outbox_events`, `fake_email` evidence | fake typed events only | Stage 11 provider integration |
| Automatic legal archive purge | `feature_disabled` | no purge path | retained immutable artifacts/triggers | New approved retention requirement before any enablement |

`feature_disabled` означает проверенное fail-closed выключение конкретного
production path, а не готовность production MVP.

## Operator docs и rehearsal

- Актуальные tracked документы: `docs/domain/CONTRACTS.md`,
  `docs/architecture/DATA_MODEL.md`, `docs/operations/STORAGE_AND_UPLOAD_SECURITY.md`,
  этот handoff и config examples.
- Проверенная среда: local/test, 2026-07-22; clean D1/Miniflare, synthetic private
  store, Cloudflare build и Chromium auth boundary.
- Clean-room production walkthrough не выполнялся: отсутствуют approved real
  templates/legal evidence и прямое поручение на deploy.
- Stop conditions: не включать ни один production flag, не отправлять real offer,
  не применять migration и не подставлять реальные стороны/templates до
  закрытия каждой применимой строки blocker matrix.

## Следующий этап

- Готовые prerequisites: immutable formed contracts, operational relations,
  price snapshot/revalidation, private artifacts, owner/admin history, typed
  contract/funding/outbox events.
- Этапу 10 сначала проверить exact offer/contract price evidence и не мутировать
  accepted snapshots при создании price-review batches/items.
- Stop conditions/blockers: автоматическое применение новой цены не переносит
  acceptance, не меняет historical contract number/artifact и использует только
  утверждённый workflow `PRICING.md`.
- Этапы 11–13 обязаны переоценить delivery provider, Browser Run/R2, legal/public
  functions, media и retention gates; текущий `feature_disabled` не считать
  production approval.

## Итог worktree

- End `git status --short`: stage-09 implementation/docs/tests modified and
  untracked files present; unrelated user files не изменялись.
- Diff summary: migration `0010`, contract server/UI modules, runtime bindings,
  cabinet/admin integrations, canonical data-model/roadmap/handoff и tests.
- Commit: `не создан без разрешения`.

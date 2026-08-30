# Stage 13: активное состояние

<!-- stage-13-current-review-status: pending_independent_review -->

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-08-30T14:59:40Z
reviewed_candidate: f33885257019ea0aeec9f839595fc5596f004240
last_completed_gate: full-manual-preview-remediation-independent-review-no-go
next_gate: full-manual-preview-new-remediation-candidate-independent-review
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
current_review_status: pending_independent_review
-->

Этот файл — короткий tracked operational checkpoint, а не источник
бизнес-правил. При конфликте действуют спецификация, тематические документы,
readiness contract/checklist, roadmap и persistent handoff.

## Постоянная цель

Ближайшая цель — получить Access-protected preview, в котором владелец может
вручную проверить весь MVP end-to-end на синтетических данных без PII. По
`SYS-04`/`OQ-036` email, Telegram, Browser-contract и document upload/manual
review для этого checkpoint реально включаются на выделенных preview resources;
их production legal/provider/training gate не заменяется одним fail-closed
negative smoke. После этого процесс продолжается до production readiness и
отдельно разрешённого production deploy.

`full-manual-preview` достигнут только когда владелец получил URL и пошаговый
manual test plan, два контролируемых verified account работают с разными ролями,
первый admin bootstrap проверен, а user/admin/import/operations/email/Telegram/
Browser-contract/upload и обязательные security/accessibility сценарии
фактически выполнены в preview. Fail-closed verdict допустим для намеренно
вне-MVP или production-only unsafe эффекта, но не вместо обязательного MVP-
контура. Один deploy, login, import или bootstrap эту цель не закрывает.

## Текущий remediation checkpoint — independent review pending

- Independent review exact candidate
  `f33885257019ea0aeec9f839595fc5596f004240`, parent
  `1ba7d49b0212a5897e25f468f16184f73ae2a0d2`, завершился **NO-GO**: 0 BLOCKER /
  0 HIGH / 2 MEDIUM. Предыдущие local green claims не считаются
  доказательством закрытия.
- MEDIUM findings: pending/requires statement о current candidate подавлял
  contextual detection соседнего completed independent GO; checklist PR-A18/
  PR-I04 и full-preview current gate продолжали называть `02d7cbc…` latest/base,
  хотя metadata уже указывала `1ba7d49…`.
- Текущая remediation оставляет runtime, migrations и Cloudflare boundaries без
  изменений. Shared pure validator теперь связывает pending current-candidate
  statement с соседним unbound completed-GO, сохраняя historical controls, и
  сверяет active `latest/last reviewed` assertions с metadata SHA. Actual
  `docs:check` исполняет четыре новые RU/EN contradiction fixtures и stale-SHA
  injection для каждого из семи status paths.
- Regression-first: unit получил ожидаемые 3 failed / 1 passed, а прежний
  `docs:check` перечислил четыре пропущенных adjacent claims. После detector fix
  unit прошёл 4/4, а реальный `docs:check` ожидаемо обнаружил stale operational
  assertions до их исправления. Финальная verification: check 0/0; full Vitest
  75/75 files, 561 passed + 1 Windows signal skip из 562 за 2889.43 s; build
  passed; Chromium 18/18 за 3.6 min на unique port `50886`; audit 0; docs 170/56 +
  109 + continuity; release scan 562/562; diff check passed. После E2E отсутствуют
  owned roots/runtime/listener и новые tracked test/browser PID; exact evidence —
  в handoff.
- Статус — `remediation candidate prepared; independent review pending`.
  Точный SHA является финальным local commit этой сессии и намеренно не
  записывается внутрь самого commit. Remote D1/R2/Worker/provider/CMS state не
  менялся. Следующий gate — новый independent review отдельной ролью; эта
  remediation session не присваивает GO.

## Предыдущий blocking review — исторический контекст

- Exact candidate `fa7aeeb40726089a72396b41b27ce93db1f2a096`, direct parent
  `c02b1bf1067e46c178dd0ead6f55bf1f0ede09b9`, прошёл отдельно порученный
  independent read-only review. Provenance/worktree и все mandatory commands
  были зелёными: check 0/0, Vitest 69 files/541 tests, build, Chromium 18/18,
  production dependency audit 0, docs 168 links/56 files + 109 commands,
  release scan 549/549 и candidate diff check. Verdict — **NO-GO**: 2 HIGH и
  2 MEDIUM; review не выполнял remote mutation.
- **HIGH — incomplete runtime source binding.** Preview renderer hash покрывает
  delegating `render.toString()`, но не полные base body/kind clauses/fixed copy/
  helpers/assets. R2 bundle содержит metadata/CSS, а runtime выбирает current
  registry и допускает fallback для неизвестной version. Новый deploy способен
  изменить v1 под прежним approved hash или сломать старую version.
- **HIGH — template install не atomic/write-once/recoverable.** `GET → PUT`
  допускает TOCTOU overwrite одного deterministic key, template bundle не имеет
  обязательного D1 storage intent, а D1 count-only audit и post-commit client
  verification допускают false installed audit/partial conflicting install.
- **MEDIUM — production isolation запаздывает.** `preview_review` gate проверен
  при send, но не до `prepareNumber`/create draft. Seeded preview row в
  production способен израсходовать number и создать draft state до позднего
  отказа.
- **MEDIUM — нет permanent populated-upgrade regression именно для `0024`.**
  Empty sequence проходит, но общий populated suite не seed-ит прежние
  provider/template rows и зависимые offers/artifacts перед `0024`, поэтому
  preservation FK/triggers/forbidden pairings не доказан.
- Следующий gate полностью local: реализовать `CONTRACT-22`/`CONTRACT-23` и
  `AC-CONTRACT-02`–`AC-CONTRACT-05`, выполнить focused concurrency/crash/
  cross-deploy/production-side-effect/migration tests и полную gate-цепочку,
  создать новый immutable remediation candidate и передать другой identity на
  новый independent exact-SHA review. До его GO запрещены `0024` apply,
  Worker/config deploy, R2/D1 write, provider send, bootstrap и production.

## Исторический remediation 2026-08-27 — позднее отклонён candidate `02d7cbc…`

- Рабочее состояние: `remediated_candidate_pending_independent_review`.
  Исторический verdict `fa7aeeb…` остаётся NO-GO; эта implementation session не
  присваивает себе independent GO. Exact remediation SHA появляется только у
  единственного финального local commit и фиксируется в ignored self-contained
  review prompt.
- **HIGH source/version binding закрыт локально:**
  `src/lib/server/contracts/templates.ts` сериализует полный canonical bundle с
  base body, общими/видовыми clauses, copy, CSS, встроенными DejaVu Sans
  Regular/Bold bytes, helper/schema/adapter versions и provider/payment/legal/
  media snapshot hashes. Runtime принимает только explicit exact bundle;
  string/current/synthetic fallback удалён. Actual self-contained HTML SHA-256
  хранится отдельно в source evidence. Golden v1 bytes/hashes и mutation/
  unknown/missing/retired regressions находятся в
  `tests/unit/contract-template-bundles.test.ts` и
  `tests/integration/contracts-d1.test.ts`.
- **HIGH atomic/write-once/recoverable install закрыт локально:** до R2 write
  создаётся exact staged `storage_object_intents`; Workers R2 binding использует
  conditional `onlyIf`, а winner всегда перечитывается и сверяется по bounded
  bytes/size/SHA-256. Provider/media/four templates/link assertions/success
  audit и terminal exact assertion входят в одну D1 batch transaction;
  ambiguous result проходит только read-only exact reconciliation. Race/crash/
  conflict regressions находятся в `contract-template-install-d1.test.ts` и
  `contract-storage.test.ts`.
- **MEDIUM pre-draft isolation закрыт локально:** preview environment/flag/
  renderer/approval/marker gate выполняется до `prepareNumber` и любого draft,
  operational, idempotency, audit или R2 side effect. Direct service и route/UI
  evidence покрывают test/production/disabled-preview, missing marker и exact
  source failure.
- **MEDIUM populated `0024` upgrade закрыт локально:** permanent migration test
  создаёт схему exact through `0023`, approved provider/media/templates и
  offer/artifact/delivery graph, применяет original `0024`, сравнивает все
  seeded fields, требует FK zero и повторно проверяет template/offer/artifact
  triggers плюс allowed/forbidden scope/basis pairings.
- Focused source/storage/route/contract/install/migration/production-readiness
  suites прошли. Финальная local command chain на том же implementation tree:
  check 0/0, controlled-worker Vitest 73 files/548 tests, build, Playwright
  18/18, production dependency audit 0, docs/continuity, release scan и diff
  check. Local E2E helper изолирует Wrangler logs/config в system temp и
  детерминированно завершает только synthetic server после global teardown.
- Immutable remediation candidate — единственный local commit, содержащий этот
  checkpoint. Его exact SHA/direct parent фиксируются после commit в ignored
  self-contained review prompt. Текущий gate — отдельный independent exact-SHA
  review. Никакой remote/provider/production/official-site state не менялся.

## Последний закрытый gate

- По точному разрешению владельца из clean detached worktree exact HEAD
  `c02b1bf1067e46c178dd0ead6f55bf1f0ede09b9` выполнен весь built-in no-PII
  candidate lifecycle с отдельными planner/stager/reviewer/recovery-verifier/
  promoter/transition identities. Plan зафиксировал ожидаемую baseline pair и
  safe delta: PlusBText `changed=1, unchanged=1`, Access
  `changed=1, unchanged=1702`; stage дал `2 + 1703` promotable rows и issues `0`.
- До stage создан fresh protected DPAPI CurrentUser export и новый distinct
  unbound EU D1 restore. Exact export↔restore сверка подтвердила `527`
  comparable schema objects, `142` tables, `67,422` rows на recovery point,
  migrations `23/max 23`, FK `0`, current pair `previous`, PlusBText `2`, Access
  projection `1703`, users `0`. Единственный post-export drift live source —
  append-only `scheduled_job_runs`; local SQLite oracle доказал exact export↔
  restore counts/digests и `quick_check=ok`. Plaintext/local scratch удалены,
  зашифрованный backup и protected ignored point/evidence сохранены.
- Independent review закрепил immutable staged digest; отдельный recovery
  verifier привязал fresh evidence к exact plan/review с
  `restored-current-pair=previous`. Первый promote завершился однозначно;
  canonical verify дал `promoted/target`, unique/dependency/FK/reconciliation
  `true`, `2 + 1703`, issues `0`, events `1/0/0`.
- Ровно один повтор той же promote-команды reconciled idempotently: transition
  result и canonical verify byte-identical, rows/events не изменились. Затем
  rollback/verify дал `rolled_back/previous`, events `1/1/0`; roll-forward/
  verify вернул `promoted/target`, events `1/1/1`, issues `0` и все invariants
  `true`.
- Final aggregate audit: migrations `23/max 23`, FK `0`, один current period,
  users `0`, два release plans и оба `promoted`, non-promoted `0`, total bundle
  events `2/1/1` с учётом baseline, ровно одна current pair `2 + 1703`, current
  issues `0`, bootstrap `available`, actions `0`. Worker/Access/auth/email,
  bootstrap, Telegram, Office/PII, production и официальный сайт не менялись.
- По точному разрешению владельца append-only migration
  `0023_legacy_projection_lookup_indexes.sql` применена только к source preview
  D1 и существующей distinct/unbound isolated recovery D1. На обеих exact
  ledger теперь `0001`–`0023`, pending `0`, все пять indexes присутствуют,
  пять deterministic `EXPLAIN QUERY PLAN` используют ожидаемые indexes,
  FK violations `0`. Production не затронут.
- Исходные protected pre-stage recovery artifacts не перезаписывались. Тот же
  независимый recovery-verifier перепроверил plan-bound isolated recovery на
  schema `0023`: source/restore comparable schema совпадает (`527` objects,
  `142` tables), aggregate pre-promote rows `49,731`, current pair `none`, FK
  violations `0`. Созданы отдельные protected ignored versioned artifacts
  `legacy-preview-baseline-recovery-point-0023.json` и
  `legacy-preview-baseline-recovery-0023.json`.
- Из clean detached worktree exact plan anchor
  `a098b8324ddca337c19b3344c7c1f82dfb68a36a` создана новая digest-bound
  confirmation и выполнена ровно одна разрешённая baseline promote attempt.
  Она завершилась `promote`, exit `0`, без ambiguous delivery; повторной
  попытки не было.
- Immediate canonical read-only verify вернул `promoted`, current pair
  `target`, unique/dependency/FK/reconciliation `true`, issues `0`; PlusBText
  `2/2`, Access run/target/projection `1703/1703`, promote events `1`, rollback
  и roll-forward events `0`. Это закрыло исторический first baseline publish;
  отдельный candidate rollback/roll-forward lifecycle теперь также закрыт выше,
  но не `full-manual-preview`.
- В preview атомарно создан и проверен утверждённый current academic period
  `2026-2027` / `2026/2027`, `2026-08-17`–`2027-07-09`; users/admins остались
  `0`, FK violations `0`. Разрешение не распространялось на production.
- До `0023` remediation built-in no-PII baseline
  `legacy-preview-synthetic-baseline-v1` прошёл
  независимые plan/stage/review/recovery роли: `2` PlusBText и `1703` Access
  rows, issues `0`, exact current pair `none`. Full isolated EU D1 restore
  проверен, source preview не публиковал current pair.
- Первый promote до `0023` не уложился в 30-second D1 query limit. Два post-exit
  canonical verify однозначно доказали `not applied`: plan остаётся `reviewed`,
  current pair `none`, projection/events/promoted rows `0`, FK/dependency
  invariants проходят. Blind retry остановлен.
- Root cause локализован в correlated projection lookups без exact indexes.
  Immutable remediation anchor
  `5789e319fd65850112a1bf05961e96c86f7c76aa` содержит append-only migration
  `0023_legacy_projection_lookup_indexes.sql` с пятью узкими indexes;
  deterministic `EXPLAIN QUERY PLAN` focused test проходит. Full gates прошли:
  check 0/0, Vitest 68 files/531 tests, build, Playwright 18/18, audit 0,
  docs/continuity и release scan. Независимый exact-SHA read-only review вернул
  GO без BLOCKER/HIGH/MEDIUM. В текущем gate migration была отдельно разрешена,
  применена и проверена на preview и isolated recovery D1.
- Immutable remediation anchor
  `723e94715c2764f829bf718c49989428fa3c169a` создан непосредственным потомком
  rejected `73d41ab855cfd670f24b6791563e335f6828e446`. Exact diff содержит 14
  ожидаемых файлов, 817 additions/144 deletions и не содержит migration,
  application route либо production/deploy change. Clean exact SHA повторно
  прошёл всю обязательную gate-цепочку. Ближайший gate — отдельный independent
  read-only review; кандидат не является GO и не разрешает D1 mutation.
- Все 1 BLOCKER/2 HIGH finding academic-period candidate `73d41ab…` исправлены
  локально. Actual ignored `wrangler.preview.toml` безопасно дополнен account ID
  из существующего protected read-only control; value-free recheck подтверждает
  current-user-only ACL, Git-ignore, `APP_ENV=preview`, один exact `DB` binding,
  valid account/D1 shapes, отсутствие selector и отсутствие child vars/secrets.
  Значения account/resource ID в evidence не записывались.
- Period и deterministic audit теперь создаются одной atomic D1 batch с
  fail-closed preconditions. Несовместимый заранее занятый audit ID не оставляет
  period; injected failure второго statement откатывает audit. Любая
  post-dispatch transport/result uncertainty имеет единый ambiguous code и
  bounded child timeout.
- Добавлен `db:period:reconcile:remote`: один SELECT-only exact-argument query с
  той же confirmation возвращает `applied|not_applied|conflict`. Focused suite
  прошёл 4 файла/33 tests, включая timeout before/after commit и malformed after
  commit. Remote D1 write/read, deploy или provider action не выполнялись.
- Exact candidate `73d41ab855cfd670f24b6791563e335f6828e446` с direct
  parent `920c3ee8fe240cfd889d66d637fb46b8ecb93938` прошёл независимый
  read-only review с verdict **NO-GO**: 1 BLOCKER и 2 HIGH. Actual ignored
  preview config не проходит account-ID guard; SQL допускает partial
  `period / no valid audit` при конфликте deterministic audit ID; malformed
  post-dispatch result не классифицируется как ambiguous и отсутствует
  SELECT-only exact-argument reconciliation entrypoint. Никакой remote mutation
  review не выполнял.
- Protected ignored Phase B control локально repin-нут на independently reviewed
  candidate/reviewer SHA `8362ffa875dde563519d91482e5aa5c8d6a2eca5` без remote
  mutation. Selector остаётся exact deployed `database_id`; current-user ACL и
  Git-ignore сохранены. Новый protected control SHA-256:
  `f154471dd2497fcb144168c1b67ec1116b1aca1904481d7718bdc1636eb63393`.
- Fresh exact-target read-only preflight около `2026-08-24T14:17Z` подтвердил
  migration ledger `0001`–`0022` (digest
  `c50295a8dc2e5d79d0fed983a02acd36ba1d1943c2c96e5d924e9344112a4840`),
  pending `0`, FK violations `0`, empty business/import/bootstrap state, два
  distinct private empty EEUR R2 bucket, expected deployed Worker vars/bindings,
  healthy scheduled journal и intact Access perimeter (`302/302/200`, health
  `204`). Никакие D1/R2/Worker/Access/provider writes не выполнялись.
- Time Travel read-only preflight вернул fresh source bookmark; в документацию
  записан только его SHA-256
  `2aa4c2e747d30f7511354d3398d69c7785a42404319659793af1ee3b738c2066`.
  Старое protected recovery evidence от 2026-08-20 цело, но привязано к старой
  provenance и schema `0001`–`0015`, поэтому не является fresh plan-bound
  evidence для Phase B.

## Reviewed full-manual-preview candidate (rejected)

- На базе exact continuation HEAD `c02b1bf1067e46c178dd0ead6f55bf1f0ede09b9`
  подготовлена append-only migration `0024_contract_preview_review.sql` и
  fail-closed `preview_review` scope для всех четырёх видов договора. Он
  допускается только в `APP_ENV=preview`, требует Browser Run, synthetic marker
  и печатает на каждой странице `TEST/ENTWURF`; полная маркировка уточняет
  `nicht für reale Vertragsbeziehungen`. Production scope/gates не ослаблены.
- Rejected candidate пытался идемпотентно установить четыре versioned bundle,
  но blocking review выше доказал неполный source binding и неатомарный install.
  Остальной application flow создаёт source snapshot, реально рендерит PDF,
  кладёт HTML/PDF в private archive R2, а email worker перед отправкой повторно
  читает ровно этот PDF и проверяет его D1-bound size/SHA-256. Preview Resend
  принимает только заранее согласованный SHA-256 allowlist получателей и
  отправляет сам marked PDF как attachment, а не одну ссылку.
- Parent acceptance теперь явно различает платный и не платный договор;
  последующая formation/activation остаётся отдельным действием admin principal
  и создаёт отдельный marked formation certificate. Preview bundle — внутренний
  draft для получения фактических PDF и последующих правок, а не production
  legal approval.
- Обязательный document flow не переписан и не подменён stub: профильный и
  полный D1 test подтверждают synthetic upload → quarantine R2 → forced admin
  download → hash-bound local-AV attestation → отдельную business review →
  owner download/negative access → cleanup. Telegram normal-outbox
  prepare/send/unknown/reconcile/abort path также повторно прошёл полный test
  gate. Удалённый upload/AV и Bot API send ещё не выполнялись.
- Local candidate gates зелёные: `npm run check` — 0 errors/warnings;
  `npm test` — 69 files/541 tests; `npm run build`; Playwright — 18/18;
  `npm audit --omit=dev` — 0 vulnerabilities; `npm run docs:check` — 168 links/
  56 files, 109 commands и continuity; `npm run release:scan` — 549/549;
  `git diff --check`. Focused contract/config/migration suite — 71/71,
  Telegram — 56/56, documents — 25/25.
- Эти изменения зафиксированы exact candidate `fa7aeeb…`, но independent review
  вернул NO-GO по разделу выше. Migration `0024`, Worker/config/flags,
  auth/bootstrap, Resend/Telegram sends и реальные preview R2 uploads не
  применялись. Следующий gate — local remediation и новый immutable candidate;
  старые зелёные tests и verdict не наследуются.

## Фактическое preview состояние

- Существующий preview Worker deployed на 100%, canonical hostname защищён
  Cloudflare Access, versioned preview routes закрыты. Это прежняя версия до
  full-manual-preview candidate; после independent GO потребуется отдельно
  разрешённый exact-SHA deploy.
- Preview D1 имеет applied migrations `0001`–`0023`, pending `0`, пять новых
  projection lookup indexes и FK violations `0`; current approved academic
  period существует. После успешного candidate roll-forward единственная
  current pair — built-in synthetic candidate: PlusBText `2`, Access/projection
  `1703`, issues `0`; users/admins `0`, bootstrap control доступен и не
  использован. Synthetic baseline остаётся exact previous rollback target.
- Два preview R2 bucket private/EU и пусты.
- Public auth, прикладной email, Telegram, document upload, contract send,
  public statutory и media paths остаются fail-closed. Scheduled operations
  отдельно deployed и активны.
- Решение владельца `OQ-036` требует после auth/bootstrap реально включить на
  synthetic data preview-review договоры через Browser Run/R2/email, dedicated
  Telegram normal-outbox и upload/quarantine/manual-AV/business-review. Их
  нынешний disabled status является исходным безопасным состоянием, а не
  завершённым manual-preview evidence.
- Production verdict остаётся **NO-GO / blocked**; production и официальный
  сайт не входят в разрешение preview-гейтов.

## Fresh continuation audit

- Final canonical `verify` выполнен 2026-08-25 из clean detached exact candidate
  worktree `c02b1bf…`: status `promoted`, current pair `target`, unique/
  dependency/FK/reconciliation passed, PlusBText `2`, Access target/projection
  `1703`, issues `0`, candidate events `promote=1`, `rollback=1`,
  `roll_forward=1`.
- Отдельный SELECT-only aggregate audit подтвердил migrations `23/max 23`, FK
  `0`, один current academic period, users `0`, два release plans и оба
  `promoted`, non-promoted plans `0`, total events `2/1/1`, bootstrap control
  `available`, completed bootstrap actions `0`.
- Fresh browser preflight без credentials проверил canonical root, operations
  health, registration и admin-operations routes. Все четыре route до Worker UI
  остановлены Cloudflare Access login с доступными heading/email-label/button;
  browser console errors `0`. Активной Access/portal session не было, email/OTP
  не вводились, поэтому authenticated portal/manual evidence не заявляется.
- Completion audit сохраняет `full-manual-preview` в `blocked`: candidate
  transition lifecycle закрыт, но сначала нужен исправленный contract runtime с
  новым independent GO, затем отдельно разрешённые deploy preview auth/email,
  два созданных владельцем
  verified account, one-shot admin bootstrap и guided authenticated manual/
  security/accessibility/provider проверки, включая реальные synthetic
  Browser-contract/email, Telegram и upload/manual-review lifecycles.
  Production approval и production enablement остаются отдельными gates.

## Не повторять

- Не повторять migrations `0001`–`0023`, baseline promote, candidate plan/stage/
  review/promote/repeated-promote/rollback/roll-forward, preview Worker deploy,
  Access perimeter setup, empty-R2 verification или Phase A D1-contract
  implementation/review, пока fresh read-only reconciliation не обнаружит
  drift. При неопределённости использовать только canonical read-only verify.
- Не пытаться создать bootstrap target direct SQL или включить auth до current
  promoted snapshot: verification fail-closed по каноническому контракту.
- Не использовать ordinary preview для Access/Office PII и не считать
  `feature_disabled` доказательством работоспособности включённого provider path.

## Точная цепочка до full manual preview

1. Завершено 2026-08-25: `0023` применена и проверена только на preview и
   distinct/unbound isolated recovery D1; production не затронут.
2. Завершено 2026-08-25: versioned recovery point/evidence выпущены без
   перезаписи исходных artifacts; одна baseline promote attempt и canonical
   verify успешно опубликовали единственную target pair.
3. Завершено 2026-08-25: fresh candidate-current recovery point/isolated restore
   и независимые plan → stage → review → recovery evidence(previous) → promote →
   verify → repeated-promote reconciliation → rollback → verify → roll-forward →
   verify получили ровно один current promoted synthetic candidate snapshot.
4. Завершено с NO-GO 2026-08-27: immutable `fa7aeeb…` прошёл independent
   read-only exact-SHA review, который обнаружил 2 HIGH/2 MEDIUM.
5. Исправить все findings локально, выполнить full gates, создать новый
   immutable candidate и получить новый independent review другой ролью.
6. Только после GO создать fresh candidate-bound recovery point/isolated
   restore, применить `0024` и возможную следующую append-only migration только
   к preview/recovery и после отдельного разрешения deploy exact reviewed
   Worker. Ограничить email согласованными SHA-256 test recipients.
7. Владелец лично создаёт и подтверждает два account, не передавая password,
   OTP, verification link, cookie или token.
8. После exact permission выполнить one-shot bootstrap корпоративного
   empty-state account и проверить audit, replay denial, session revoke, admin
   RBAC и сохранение parent-only роли второго account.
9. Пройти guided full manual preview plan: family lookup/registration, parent и
   admin workflows, security/IDOR/CSRF/session, operations/manual jobs/failures,
   pricing, все четыре preview-review договора через реальный Browser Run/
   private R2/email и минимум один полный accept/different-admin formation/
   certificate lifecycle, synthetic upload/quarantine/local-AV/hash attestation/
   business review/cleanup, accessibility/mobile/keyboard, а также один
   отдельно разрешённый минимизированный Telegram normal-outbox smoke и его
   recovery/reconciliation checks.
10. Обновить checklist/handoff после каждого блока. Legal/privacy/provider paths
    не переносить в production без требуемого approval. Для preview agent обязан
    сначала завершить всю локальную подготовку и остановиться только
    непосредственно перед точным внешним параметром, credential, remote
    mutation, deploy или provider send.

## Когда агент обязан остановиться

Без вопроса выполняются local/read-only/reversible действия в текущем scope,
проверки и документация. Остановка допустима только когда нужен:

- exact owner permission на remote mutation, deploy/rollback, provider send,
  secret/Access/security mutation или production action;
- независимый reviewer/operator, которого нельзя изображать той же identity;
- ввод владельцем password/OTP/verification link или другой credential;
- owner/legal/privacy решение, которое нельзя вывести из канонических docs и
  требуется именно перед следующей внешней операцией либо production gate;
- rollover в новую сессию из-за потери точного target/permission/rollback state.

Перед такой остановкой агент завершает всю безопасную подготовку, обновляет этот
checkpoint, readiness checklist и `handoffs/stage-13.md`, выполняет docs/diff
checks и задаёт один точный вопрос с environment, scope, expected result, stop
condition и rollback. После успешного gate агент сам переходит к следующему
разрешённому prerequisite.

## Ссылки состояния

- [Readiness checklist](../operations/PRODUCTION_READINESS_CHECKLIST.md)
- [Полный ручной preview](../operations/FULL_MANUAL_PREVIEW.md)
- [Deployment runbook](../operations/PRODUCTION_DEPLOYMENT.md)
- [Import pipeline](../operations/IMPORT_PIPELINE.md)
- [Persistent Stage 13 handoff](handoffs/stage-13.md)
- [Постоянная команда продолжения](../prompts/stage-13-continue-deployment.md)

## Проверка continuity worktree

- Exact rejected full-manual-preview candidate `fa7aeeb…` из `c02b1bf…`:
  independent review подтвердил `npm run check`
  — 0 errors/warnings; полный `npm test` — 69 files/541 tests; `npm run build`
  — passed; Playwright — 18/18; dependency audit — 0; `npm run docs:check` —
  168 links/56 files, 109 executable commands и continuity passed;
  `npm run release:scan` — 549/549; `git diff --check` — passed. Remote Worker/D1/R2/
  Access/provider/production state этими проверками не менялся. Несмотря на
  зелёные gates, 2 HIGH/2 MEDIUM выше делают candidate NO-GO до remediation и
  нового independent review.
- Exact remediation anchor `723e947…` повторно прошёл обязательную clean
  exact-SHA цепочку: focused 4 файла/33 tests; `npm run check` — 0
  errors/warnings; полный `npm test` — 68 файлов, 530/530 tests; `npm run build`
  — passed; `npm run docs:check` — 163 links/55 files, 109 executable commands и
  continuity passed; `npm run release:scan` — 544/544; `git diff --check` —
  passed. Следующий gate — отдельный role-specific independent read-only review.
- Independent review exact candidate `73d41ab…`/parent `920c3ee…` подтвердил
  clean exact 14-file diff. Focused review suite прошла 4 файла/24 tests;
  `npm run check` — 0 errors/warnings; полный `npm test` — 68 файлов, 521/521;
  `npm run build`, `npm run docs:check` (162 links/55 files, 108 commands),
  `npm run release:scan` (544/544), candidate `git diff --check` — passed.
- Несмотря на зелёные общие gates, review воспроизвёл partial state
  `1 period / 0 valid audit`, обнаружил нерабочий actual-config account target и
  отсутствие безопасной reconciliation после ambiguous dispatch. Поэтому
  `73d41ab…` не одобрен и `db:period:remote` запрещён до remediation и нового
  independent GO.
- Прежний reviewed candidate `8362ffa…` остаётся действующим только для уже
  repin-нутого Phase B import control; academic-period boundary он не одобряет.
- Documentation remediation checkpoint добавил канонические `IMPORT-09` и
  `AC-IMPORT-32`, обязательные regression scenarios в test plan, явный runbook
  stop condition и отдельный local ignored Goal prompt. После правок standalone
  `npm run check` — 0 errors/warnings; полный `npm test` — 68 файлов, 521/521;
  `npm run build` — passed. Remote/protected state не менялся.

# Handoff этапа 13: hardening и production readiness

<!-- stage-13-current-review-status: independent_go -->

Ревизия: 2026-09-02.

> **Append-only history, не current truth.** Для продолжения Stage 13 читать
> только [STAGE_13_ACTIVE_STATE.md](../STAGE_13_ACTIVE_STATE.md) и evergreen
> deploy entry-point. Этот файл открывать адресно по evidence-ссылке; старые
> status/SHA/next-action ниже являются историческими снимками и никогда не
> переопределяют active state. Обновлять его только на границе фазы/сессии.

<!-- stage-13-continuity-reviewed-candidate-compatibility-only: 438a51399ac5f58b428b624c52ca2cbbc059ae9c -->

Последний сохранённый phase-boundary record: exact D1-cost remediation candidate
получил independent GO с `P0/P1 = 0`; production остаётся **NO-GO**. Текущее
разрешение, deployed fingerprint и next atomic action намеренно здесь не
повторяются.

## Append-only evidence history

### First logout, explained parallel session and Prompt 04 completion — 2026-09-03

- The owner used `Abmelden` and returned to the login route. The bounded
  postcondition found two session rows: one logged out and one nonrevoked. The
  owner explained that they had made a second login after returning through
  Startseite while looking for logout. The current logout correctly revoked
  that second session; the first owner-created session remains known and
  contained. There is no unexplained duplicate and no `P1`.
- Prompt 04 is complete. One verified synthetic parent, privacy acceptance,
  FamilyID, used token, verification commit, verification/welcome deliveries
  and audit state remain exact; admins/bootstrap, extra user/token/outbox/send
  and unrelated provider/storage state remain absent. Eleven SELECTs read 57
  rows and wrote 0; the exact target and deployed candidate remain unchanged.
- Mandatory follow-up `P2-LOGOUT-UX-002`: make `Abmelden` prominent in the
  cabinet's primary or persistent navigation and cover the affected browser
  flow. Its current placement under `Kontosicherheit` made the owner search for
  it and contributed to an extra login. Prompt 04 forbids the UI code change,
  and the working logout flow does not reopen candidate review.
- Protected evidence:
  `tmp/first-registration-20260903-owner/after-logout-safe.json`, SHA-256
  `92e3c2568ed53fc4b722cb3c968b33b1c85b9db3e5da26acab74a93bce8e9176`.
  Current containment, permissions and next action remain exclusively in
  [active state](../STAGE_13_ACTIVE_STATE.md).

### First verified-parent login — 2026-09-03

- One owner login successfully opened the parent cabinet. The bounded
  postcondition confirmed exactly one nonrevoked session and one login rate
  consumption, with unchanged account/verification/email state and no bootstrap
  or unrelated provider/storage state.
- Eleven SELECTs read 56 rows and wrote 0; target, reviewed Worker, bindings,
  gates, schedules and recipient hashes remained exact. Protected evidence:
  `tmp/first-registration-20260903-owner/after-login-safe.json`, SHA-256
  `ad1a9e9489c4358845fea72498a3363a7d4b62e7cdb7277d7830d065a84ad528`.
  Current logout authorization and containment remain in
  [active state](../STAGE_13_ACTIVE_STATE.md).

### First verification and welcome delivery — 2026-09-03

- The owner opened the existing verification link once and received the single
  separately authorized welcome email. The bounded postcondition confirmed one
  verified parent with one FamilyID, one used verification token, zero unused
  tokens and one verification commit.
- Verification and welcome outbox rows are each terminal `sent` with attempts 1
  and one provider receipt; registration/verification audit rows are each
  exactly one. Sessions, admins/bootstrap and unrelated provider/storage state
  remained zero. Eleven SELECTs read 54 rows and wrote 0; target, reviewed
  Worker, bindings, gates, schedules and recipient hashes remained exact.
- Protected evidence:
  `tmp/first-registration-20260903-owner/after-verification-safe.json`, SHA-256
  `5854946c323032b4e42a3b74f983aade14b8ede3c6b7326047ed3b9ecac9094d`.
  Current next action and containment remain in
  [active state](../STAGE_13_ACTIVE_STATE.md).

### First controlled registration and terminal verification delivery — 2026-09-03

- The owner submitted the authorized synthetic registration once and received
  the verification email. The bounded `16:50:10Z` reconciliation confirmed one
  active unverified parent, one privacy acknowledgement, one unused verification
  token, one register rate-limit consumption and one registration audit event.
- The single verification outbox row was terminal `sent` with attempts 1 and one
  provider receipt. Verification commits, sessions, admins/bootstrap and all
  unrelated provider/storage state stayed zero. Eleven SELECT statements read
  49 rows and wrote 0; target, reviewed Worker, bindings, gates and recipient
  hashes remained exact.
- Owner feedback `P2-REG-UX-001`: the success message sits inside the cleared
  form and is easy to mistake for an error; a distinct success panel/state would
  make completion clearer. The prompt forbids code changes and the successful
  required flow is not blocked, so this does not reopen candidate review.
- Protected evidence: `tmp/first-registration-20260903-owner/after-registration-safe.json`,
  SHA-256 `50fdfc0e9cb7c0d65fc9c63f2d26641d9cf6059a8999db196b8e6d9ba4c79f22`.
  Current permissions and next action remain exclusively in
  [active state](../STAGE_13_ACTIVE_STATE.md).

### Prompt 04 registration preflight and owner-input boundary — 2026-09-03

- The fourth owner-invoked prompt authorized one controlled synthetic-parent
  registration and verification delivery. Registration was not attempted before
  the owner-input handoff; no remote mutation or provider send occurred.
- The read-only preflight at `16:31:39Z` confirmed the recorded deployed
  candidate, Access, two recipient hashes, migration ledger through `0026`,
  fresh successful cadences and empty account/auth/outbox/bootstrap state.
  Eleven SELECT statements read 47 rows and wrote 0. One account analytics
  observation confirmed quota headroom; historical integrity evidence was reused.
- Verification automatically enqueues a welcome email. The prompt's explicit
  one-verification-email limit therefore needs a separate allowance for that
  additional delivery before verification. This is a permission boundary, not a
  new runtime defect. Runtime/config were unchanged and full suites/review were
  not repeated; docs, release scan and diff checks passed.
- Protected evidence: `tmp/first-registration-20260903-owner/before-safe.json`,
  SHA-256 `20ca94df4c72f2d5a61e0ddad974662b6ba05813ef007fbd2f8ef638366b13e0`.
  Current authorization, owner-input boundary, containment and the next atomic
  action are maintained only in [active state](../STAGE_13_ACTIVE_STATE.md).

### Exact preview Worker deployment checkpoint — 2026-09-03

- The owner-invoked third prompt authorized one Worker deploy. It was executed
  once from a separate clean detached worktree of the reviewed candidate, with
  an unchanged protected preview config copied inside that worktree. The primary
  worktree was not switched or cleaned. Offline exact-lockfile installation,
  verification of 274 installed packages, build and strict dry-run passed; all
  396 bundle inputs resolved inside the detached worktree. Actual deploy and
  dry-run bundles were byte-identical.
- The immediate read-only checkpoint proved one expected version at 100%
  traffic, exact annotation, unchanged bindings/runtime configuration/feature
  gates, Access denials, valid root and closed versioned URL. After the prescribed
  wait, one bounded postcondition at `16:01:48Z` proved two fresh successful
  cadences, empty health `204`, ledger through `0026`, pending 0, FK 0 and stopped
  automatic history growth. Its 13 SELECTs read 37 rows and wrote 0. User,
  session, bootstrap, provider and storage-intent counters remained zero.
- Full release checks and independent GO were inherited from the exact SHA
  recorded in [the local D1-cost candidate evidence](#local-d1-cost-remediation-candidate-2026-09-02):
  78 Vitest files, 580 passed/1 expected Windows skip, Chromium 23/23. No runtime,
  migration, dependency or deploy-config change justified rerunning those gates.
  Only docs/link/command/continuity, release scan and diff checks accompany the
  docs-only checkpoint commit. Production readiness was not changed.
- Protected evidence: `tmp/worker-deploy-20260903/success-safe.json`, SHA-256
  `256863b209a03ec0e1c12e388affebcbccb0c8a704cd417fdf9ae76b3369a58b`.
  Full target/version IDs and recovery data remain protected and ignored.
  Current permission, deployed fingerprint and the single next action are
  recorded only in [active state](../STAGE_13_ACTIVE_STATE.md). This deployment
  does not authorize registration, provider send, bootstrap, rollback or any
  production/CMS action. The compatible previous Worker retains its D1-cost P1;
  rollback requires a new explicit authorization and preserved containment.

Исторический reviewed registration remediation anchor
`146f9c54ff082ad695ef47c7da9c6a578e09a9a5`, direct parent
`fbb9520eb670cd22f5ac236f1203823942078c1a`, получил fresh independent **GO**:
0 `P0`, 0 `P1`, 1 `P2`, 0 `P3` и ранее был развёрнут как `a4fab5d09f63`/100%.
Теперь он сохранён inactive для rollback нового `bef5789…`. Historical target
`583165e316b739f4fb6a30001dae3a98ec62e1a1` с direct parent
`3ad9527fb1d334d1a854ce69ff584ddb6d89d28d` получил fresh independent **GO**:
0 `P0` / 0 `P1` для reviewed CSRF-remediation scope. После deploy первый
controlled retry обнаружил новый `P1`: generic invalid-input rejection до auth
service с полным no-write/no-send postcondition и потерей hidden form state в
failed response. Это снова блокирует обязательный registration flow до local
remediation. Owner-authorized preview-only phases 1–2 применили
`0024`/`0025`, а
2026-09-01 отдельно разрешённый deploy exact `ec11bbc…` включил preview auth и
Resend только для двух hashed allowlisted recipients, а следующий отдельно
разрешённый deploy exact `583165e…` установил form-origin remediation. Failed
registration retry не создал account/email write и не даёт authority на повтор,
provider send, account/verification/bootstrap, новые D1/R2 writes, production
или CMS; каждое следующее remote действие требует отдельного прямого разрешения.
Исторический exact `2bedc73c9b39a4cb43296046986a3f48e039b022` сохраняет GO только
для своего более узкого IMPORT-08 docs/test scope и не одобряет новый contract
runtime.

Production readiness: **`blocked` / NO-GO**

### Local D1-cost remediation candidate — 2026-09-02

- Работа начата с clean `8f04554ad001d12eb447a0eccc8dc883e9a8c951`; preview
  остаётся на `bef5789…` / fingerprint `745295d36248`. Remote SQL, migration,
  deploy, registration retry, Cron/flag/tariff/provider mutation не выполнялись.
- Forward migration `0026_background_d1_cost_controls.sql` добавляет ровно две
  cadence rows. Automatic Cron больше не append-ит per-job ledger; manual run
  сохраняет audit/dedupe/lease/fence и partial manual-history index. Global stop
  теперь стоит до любого D1, inert provider/binding job не получает лишний
  lease, а Telegram-disabled path сохраняет обязательный bounded unknown-result
  reconcile/signal.
- Health и operator summary читают только fixed cadence state; при 20,000
  retained scheduled rows measured health `2 queries/3 reads/0 writes`, summary
  `1/2/0`, routine history `1/1/0` при одной manual row. Старые тяжёлые scripts
  остаются заблокированы.
- Empty production-shaped cost: fast `14 queries/33 reads/6 writes`, maintenance
  `35/72/17`; scheduled projection `54,432 reads/10,272 writes/day`. Preview shape
  с disabled providers и active R2 — `27,072/7,392`; 5-minute health добавляет
  `864/0`. Saturated-window regression с 16 minute buckets фактически измерил
  health `2 queries/18 reads/0 writes`; три recorded 5xx каждую минуту дают
  общий `62,496 reads/16,032 writes/day` против shared Free `5M/100k`.
- Outbox preparation выполняется один раз за bounded drain; unchanged Telegram
  policy — no-write; invalid email/stale Telegram maintenance ограничены;
  terminal checks используют `EXISTS`. Три Telegram rows: `37/131/36`; retry
  `10/39/10`; unknown outcome `10/38/10`. Price boundary OR scan заменён indexed
  candidate streams; security/email expiry queries получили partial seek indexes.
- Exact candidate `0db38842524ebc146eaa56a9d089e3c3484bf0f3`, direct parent
  `8f04554ad001d12eb447a0eccc8dc883e9a8c951`, прошёл focused regressions,
  `npm run check`, полный Vitest `78/78` files (`580 passed`, `1 skipped`),
  Chromium E2E `23/23`, build, production audit `0`, docs/continuity,
  release scan `574/574` и diff check. Monolithic `release:verify` после
  interruption не перезапускался: завершены ровно ещё не выполненные обязательные
  контуры, без повторения тяжёлых suites. Independent read-only exact-SHA review
  вернул **GO**: `P0: 0`, `P1: 0`, `P2: 4`, `P3: 0`.
- Review P2 не блокируют текущий preview milestone: corrected worst-case health
  calculation и stale per-job documentation исправлены этим docs-only seal;
  accumulated future-enrollment cost regression/pagination требуется до массового
  import; rollback на старый Worker функционально schema-compatible, но после
  `0026` его `updated_at` retention query может сканировать накопленные error
  buckets, поэтому rollback должен быть кратким, без health/SQL polling, с
  предпочтением forward fix. Runtime candidate из-за P2 не менялся.
- Следующая remote фаза — только отдельно разрешённый apply `0026` к exact
  preview D1 после восстановления quota, с одним bounded ledger/schema/FK
  postcondition и обязательным active-state checkpoint. Cost table и phased
  postcondition/rollback procedure находятся в
  [OPERATIONS_RUNBOOK](../../operations/OPERATIONS_RUNBOOK.md).
  `rollover_required: no`, `recommended_next_session_mode: High`: target,
  postcondition и containment известны; remote ambiguity отсутствует.

### Controlled registration failed; D1 quota incident — 2026-09-02

- Разрешённая одна registration выполнена владельцем. Postcondition
  `14:14:25Z`: version `745295d36248`/100%, config exact, accounts/tokens/privacy/
  outbox/sessions/auth-audit/bootstrap/provider attempts/receipts `0`, register
  rate buckets `2`, schema/FK/synthetic/R2 unchanged. Failed registration создала
  rate-limit metadata; полного no-write не было. Protected after evidence
  `imports/preview-first-registration-after-20260902T141425Z.json`, digest
  `112d74be920a`; before digest `985e4b4f1084`. Retry не разрешён.
- Workerd reproduction: сохранённый unbound global `fetch`, вызываемый как
  `this.fetcher(...)`, даёт `Illegal invocation` до outbound network. Bound
  `globalThis.fetch.bind(globalThis)` проходит. Реальный widget solve не
  доказывает Siteverify; Cloudflare analytics показывала ноль verify requests.
  Старые Node mocks не покрывали receiver binding. Это P1 AUTH-02.
- После owner D1 warning remote SQL и health probes остановлены. Query Insights
  через analytics API (`1d`) показывает 11 operator snapshots / **5,187,297
  rows_read**, 10 health queries / 783,068 reads. UI rolling-24h snapshot ранее
  показывал 14 health queries / 1.08M и 6.6M total reads; срезы не идентичны.
  Snapshot содержит два unbounded `row_number()` по истории jobs; health —
  unbounded `MAX(started_at) GROUP BY job_name`. Это P1 OBS-02/OPS-01: служебная
  диагностика способна исчерпать free daily quota и остановить preview.
- 30-day analytics отдельно показывает health 4,784 calls / 70,505,423 reads;
  legacy family projection UPDATE 4 calls / 26,175,110 reads, 6,812 writes.
  Это исторический расход, не daily counter. Query Insights adaptive sampling,
  rolling windows и top-N не обязаны суммироваться в overview/billing total.
  Dormant import cost записан как P2 до следующего import gate; новый import
  для текущей регистрации не нужен и не запускается.
- Cron inventory: 2 jobs/minute + 7 jobs/15 minutes = 3,552 planned runs/day.
  В 1d insights start/finish/lease дали 38,917 из 39,022 writes; фоновые jobs
  объясняют постоянный поток SQL при нуле accounts. Feature flag alone не
  прекращает job logging/lease writes. Cron/monitor/flags/deployment не менялись.
- Protected current-user-only analytics:
  `imports/d1-query-insights-20260902.json` digest `4b09060ddd46`;
  `imports/d1-query-insights-20260902-30d.json` digest `4c1967a15637`.
  Никаких SQL-запросов к D1 при получении analytics не выполнялось.
- Containment: прекратить expensive snapshots/health diagnostic polling;
  подготовить локально indexed latest-job queries и Workers fetch regression.
  Не удалять историю, не менять тариф, не повторять регистрацию или deploy.
  Следующее атомарное действие — local remediation с measured D1 rows_read.
  Этот checkpoint только docs; выполняются docs:check/release:scan/diff.
  `rollover_required: no`, `recommended_next_session_mode: High`: причины
  локализованы, account/provider state нулевой, remote ambiguity нет.

### Первая controlled registration разрешена, preflight пройден — 2026-09-02

- Owner разрешил одну первую controlled registration с verification delivery.
  Fresh preflight `2026-09-02T14:08:03Z` подтвердил `745295d36248`/100%, exact
  config, Access `302/302/200/204`, D1 `25/pending 0/FK 0`, synthetic `2 + 1703`,
  все account/token/privacy/outbox/session/auth-audit/register-rate/bootstrap/
  provider-receipt counts `0`, R2 empty и jobs `9/9` healthy.
- Protected current-user-only ignored before evidence:
  `imports/preview-first-registration-before-20260902T140803Z.json`, digest
  `985e4b4f1084`. Подготовлен read-only post-submit helper без remote write.
  Browser form содержит только synthetic names; owner лично вводит corporate
  mailbox/password/privacy acknowledgement и отправляет один раз. До повтора,
  перехода по verification link или следующего account/bootstrap — read-only
  reconcile и обязательный atomic docs-only checkpoint. Секреты/PII не сообщать.
- Remote mutation не выполнялась, прежний atomic deploy record остаётся success.
  Runtime unchanged; только docs:check/release:scan/diff для этого docs checkpoint,
  full suites/check/build/audit не повторяются. Разрешение сохраняется без нового
  вопроса. `rollover_required: no`, `recommended_next_session_mode: High`:
  известный authorized preview flow, ожидание owner input, ambiguity нет.

### Turnstile async/onload preview deploy и real widget — 2026-09-02

- Owner отдельно разрешил deploy exact reviewed
  `bef578917575f233ce4853a1432f1d0d29b22289`; clean start HEAD `36ae558`.
  После reviewed anchor diff только docs; runtime/migrations/dependencies/config
  unchanged. Protected config digest `3aaebf49223f` совпал с previous success.
- Fresh build и Wrangler 4.120.1 strict dry-run прошли. Full Vitest `566` pass +
  1 Windows skip, Chromium `23/23`, check и audit `0` переиспользованы из exact
  `bef5789…`; без material diff повтор полных suites не требовался.
- Read-only preflight подтвердил `a4fab5d09f63`/100% и exact preview target.
  Один strict deploy завершился exit 0. Postcondition `2026-09-02T13:56:02Z`:
  новая version `745295d36248` одна обслуживает 100%, exact candidate annotation
  совпала; previous compatible `a4fab5d09f63` доступна для rollback.
- Access `302/302/200/204`, register GET `200`, active versioned route `404`,
  exact vars/bindings/three secret names; D1 `25/pending 0/FK 0`, synthetic
  `2 + 1703`, users/tokens/privacy/outbox/session/auth-audit/register-rate/
  bootstrap `0`, обе EEUR R2 пусты, latest jobs `9/9` healthy. Drift отсутствует,
  rollback не требовался. D1/R2/Access/config/secret/provider writes не выполнялись.
- Fresh Chrome GET `/auth/register` показал реальный Turnstile widget с
  результатом «Успешно» и enabled submit. Поля пусты, submit не отправлялся.
  `P1` error `3857` до render закрыт, прежний `P2` recovery остаётся backlog.
  Server Siteverify/replay и registration/verification delivery pending.
- Protected current-user-only ignored evidence:
  `imports/preview-worker-deploy-evidence-20260902-turnstile-onload.json`,
  SHA-256 prefix `31115e396ae0`. Full IDs остаются только там; browser evidence
  содержит лишь sanitized booleans/result. Checkpoint checks: docs:check,
  release:scan и git diff --check; runtime suites повторно не запускались.
- Следующее ровно одно действие — получить отдельное разрешение на первый
  controlled registration и verification delivery с read-only reconcile до
  повтора, второго account или bootstrap. `rollover_required: no`,
  `recommended_next_session_mode: High`: известный preview target и механизм
  reconciliation, remote ambiguity нет. Production и CMS не разрешены.

### Turnstile async/onload independent review GO — 2026-09-02 (история)

- Reviewed exact candidate `bef578917575f233ce4853a1432f1d0d29b22289`, parent
  `27218225de661126ffde0a8cb597a3add949f619`; review начат на clean docs-only
  descendant `c23e50211ebf0c8a98f0f7c06e40ea53d34a9bd2`.
- Независимо проверены три changed files, registration consumer и server-side
  Siteverify boundary. API onload callback установлен до script append; shared
  promise не позволяет раннему mount обойти readiness, disposed instance не
  вызывает render, teardown удаляет widget. Action `registration`, hidden token
  и fail-closed submit сохранены. Паттерн соответствует
  [Cloudflare onload example](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/#complete-explicit-rendering-examples-by-use-case).
- Mock запрещает `ready()` для async/defer и render до отложенного API callback;
  он отличает script load от API readiness. Fresh review checks: Chromium
  registration `5/5` (59.6s), registration-route/auth-security unit `15/15`,
  `npm run check` — 0 errors/warnings. Нового runtime diff нет.
- Verdict по candidate: **GO**, `P0: 0`, `P1: 0`, `P2: 1`, `P3: 0`.
  Новых findings нет. Прежний P2 recoverability (client/script error и reload)
  остаётся backlog и не открывает новый remediation loop.
- Переиспользованы full Vitest `566` passed + 1 Windows skip, full Chromium
  `23/23`, build и audit `0` exact `bef5789…`: runtime, migrations, dependencies
  и config после него не менялись. Полные suites/build/audit не повторялись.
  Для review checkpoint выполняются только docs:check, release:scan и diff check.
- Review не выполнял remote reads/writes, deploy, registration retry или sends.
  Deployed `146f9c5…` сохраняет подтверждённый P1; real-token/Siteverify/replay
  validation pending. Следующее одно действие — получить отдельное разрешение
  на exact preview Worker deploy `bef5789…`. Retry и production не разрешены.
  `rollover_required: no`, `recommended_next_session_mode: High`: context точен,
  следующий разрешённый deploy имеет известные target/postcondition/rollback.

### Turnstile async/onload P1 и локальная remediation — 2026-09-02 (история)

- Exact local runtime candidate `bef578917575f233ce4853a1432f1d0d29b22289`,
  parent `27218225de661126ffde0a8cb597a3add949f619`; не развёрнут, independent
  review pending. Historical reviewed anchor остаётся `146f9c5…`.
- После успешного deploy `146f9c5…` владелец открыл registration и увидел
  `auth.turnstileUnavailable` с disabled submit. POST не был отправлен.
  Read-only browser diagnosis: actual `api.js` загружен, API существует,
  script `async/defer=true`, widget iframe count `0`, state `failed`.
  Вызов `ready()` с no-op callback выбросил `TurnstileError`, code `3857`,
  до выполнения callback. Это воспроизводимый `P1` для `AUTH-02`, а не key,
  hostname, CSP или provider rejection.
- Последний fresh read-only remote preflight `2026-09-02T12:58:14Z` подтвердил
  `a4fab5d09f63`/100%, Access `302/302/200/204`, exact config/bindings/secrets,
  D1 `25/pending 0/FK 0`, synthetic `2 + 1703`, нулевые users/tokens/privacy/
  email-outbox/sessions/auth-audit/register-rate/bootstrap и jobs `9/9` healthy.
  Диагностика и local remediation не выполняли remote mutation.
- Owner разрешил только минимальный frontend fix и проверки. `TurnstileWidget`
  устанавливает global onload callback до script append, ждёт именно API onload
  и вызывает explicit `render` без `ready()`. Shared promise проверяется раньше
  наличия API object, чтобы ранний повтор mount не обходил ожидание readiness.
  Teardown, token callbacks и fail-closed submit сохраняются. Siteverify,
  backend, keys, Cloudflare settings, dependencies и migrations не изменены.
- Regression сначала упал на старом коде: ready-state count `0` вместо `1`.
  Mock теперь воспроизводит запрет `ready()` при async/defer и откладывает API
  onload после DOM script load. После fix focused registration `3/3` прошли;
  дополнительные сценарии проверяют failed script и SPA unmount/remount.
  Full Chromium `23/23` (registration `5/5`), check `0/0`, build,
  production dependency audit `0`, docs/continuity, release scan `569/569`,
  focused formatting и diff check прошли. Full Vitest `--maxWorkers=4`:
  `76/76` files, `566` passed + 1 предусмотренный Windows-only lifecycle skip,
  `703.14s`, без failed tests. Focused auth/registration unit `15/15` включены
  в этот полный run. Runtime tree после начала проверок не менялся;
  последующий checkpoint docs-only, full suite для него не повторяется.
- Использованы `turnstile-spin` SvelteKit pattern и
  [актуальная Cloudflare documentation](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).
  Browser mock не заменяет real-token/Siteverify/replay preview evidence:
  destination validation остаётся pending до review, отдельно разрешённого
  deploy и controlled owner flow. Никаких provider sends в этой сессии нет.
- Существующий `P2` expiry/client-error reload и failed retained-script retry
  не расширяет scope. Следующее ровно одно действие — independent read-only
  review локального exact candidate; после него deploy требует отдельного
  разрешения. `rollover_required: yes`, `recommended_next_session_mode: Medium`:
  следующий шаг без remote write и без unresolved remote ambiguity.

### Registration invalid-input remediation preview deploy — 2026-09-02

- Owner отдельно разрешил только exact preview Worker deploy reviewed runtime
  anchor `146f9c54ff082ad695ef47c7da9c6a578e09a9a5`. Registration retry, provider
  send, account/bootstrap, D1/R2/Access/secret/flag, production и CMS не входили
  в scope.
- Fresh provenance подтвердил clean worktree, reviewed anchor как ancestor и
  отсутствие runtime/migration/dependency/config diff. Переиспользовано exact
  release evidence; дополнительно прошли fresh build и Wrangler 4.120.1 strict
  dry-run. Protected preview config digest остался `3aaebf…`.
- Read-only preflight подтвердил active `2de99c0c5815`/100%, exact vars/bindings/
  three secret names, Access `302/302/200/204`, registration GET `200`,
  versioned route `404`, D1 `25/pending 0/FK 0`, current synthetic `2 + 1703`,
  нулевые auth/account/outbox/session/bootstrap/register-rate counts, две пустые
  private EEUR R2 и latest jobs `9/9` healthy.
- Ровно один `wrangler deploy --strict` завершился exit 0. New version
  fingerprint `a4fab5d09f63` одна обслуживает 100%; previous compatible
  `2de99c0c5815` retained и available. Fresh postcondition повторил Access,
  registration GET, closed versioned route, exact config, D1/R2/auth counts и
  jobs без drift. Rollback не требовался.
- Full IDs и command evidence сохранены только в protected ignored
  `imports/preview-worker-deploy-evidence-20260902-registration-remediation.json`;
  digest prefix `615418836c4a`, ACL current-user-only. Следующий gate — отдельное
  разрешение на retry только первого controlled account и verification delivery
  с обязательным reconcile до любого второго account/bootstrap.

### Registration invalid-input remediation review GO — 2026-09-01

- Exact runtime anchor `146f9c54ff082ad695ef47c7da9c6a578e09a9a5`, parent
  `fbb9520eb670cd22f5ac236f1203823942078c1a`, ограничен registration form/action,
  explicit Turnstile widget lifecycle, German feedback и затронутыми unit/E2E
  tests. D1 migrations, dependencies и protected preview config не менялись.
- Server failure сохраняет только bounded first/last name и email, privacy
  choice/version; password никогда не возвращается. Stale privacy version
  требует нового acceptance. Turnstile missing/rejected token получает
  отдельное safe сообщение, а submit остаётся disabled до callback с token.
- Первый full E2E run обнаружил controlled-input race: async widget render
  сбрасывал заполненные safe values перед forced submit. Исправление использует
  writable derived fields, после чего focused registration `2/2` и полный
  Chromium `20/20` прошли.
- Exact release evidence: `svelte-check` 0 errors/warnings; full Vitest с
  `--maxWorkers=4` — 76/76 files, 566 passed + 1 Windows-only skip; build;
  `npm audit --omit=dev` — 0; docs/continuity; release scan 569/569; focused
  formatting и `git diff --check`. Предшествующий unrestricted Vitest run имел
  три timeout-only D1 failures; exact cases прошли 3/3 последовательно и затем
  внутри полного green run с четырьмя workers.
- Independent code/security review сверил exact parent/anchor/docs child,
  bounded retained values, отсутствие password в action data/DOM, current
  privacy-version renewal, server-side Siteverify boundary и explicit Turnstile
  API с актуальной Cloudflare documentation. Fresh focused evidence: check 0/0,
  registration/auth-security unit 15/15 и registration Chromium 2/2.
- Verdict: **GO**, 0 `P0`, 0 `P1`, 1 `P2`, 0 `P3`. Reviewer `P2`: после
  expiry/client error компонент полагается на reload вместо explicit
  `turnstile.reset`, а повторная загрузка после уже failed retained script
  element может остаться pending. Это ограниченная recoverability/UX проблема:
  быстрый controlled retry и server-side security boundary не сломаны, поэтому
  по milestone policy она не блокирует deploy и записана в backlog.
- Никакой Worker/D1/R2/Access/secret/provider/account/
  bootstrap/production/CMS mutation после failed registration retry не было.
  Preview Worker deploy exact `146f9c5…` и read-only postcondition завершены
  2026-09-02. Новый registration retry остаётся отдельным gate.

### First controlled registration retry — failed/no-write — 2026-09-01

- Owner лично заполнил первую allowlisted preview registration form и выполнил
  submit. UI очистил поля и показал generic `400` text
  `Bitte prüfen Sie Ihre Eingaben.`; verification email не появилась.
- Fresh read-only D1 reconciliation подтвердил users, auth tokens, privacy
  acknowledgements, email outbox, sessions, auth audit, bootstrap actions и
  `auth:register` rate-limit buckets ровно `0`, FK `0`. Request не дошёл до
  auth service/Turnstile verifier/password hash/outbox/provider dispatch.
- Failed-response DOM содержит пустые обязательные hidden values
  `privacyNoticeVersion` и `cf-turnstile-response`; fresh authenticated GET
  отдаёт configured privacy notice version длиной 25, а deployed binding
  совпадает с `wrangler.preview.toml`. Generic response не позволяет доказать,
  какое exact поле было invalid в исходном POST, поэтому это diagnostic lead,
  а не молчаливо установленное business rule.
- Classification: `P1` ближайшего `full-manual-preview`. Containment: не
  повторять submit и не начинать второй account/bootstrap; сначала local
  diagnosis/remediation, affected tests и новый review/deploy gate в зависимости
  от material diff. Protected evidence SHA-256 prefix `bf8e23909d88`.

### Registration form remediation — exact `583165e` — 2026-09-01

- Первый controlled account submit воспроизводимо вернул SvelteKit
  `Cross-site POST form submissions are forbidden`. Read-only preview D1
  postcondition подтвердил no-write/no-send: users/tokens/privacy/outbox/sessions/
  audit/bootstrap остались `0`, FK `0`; checkpoint — `3ad9527…`.
- Root cause: Access/adapter request URL не совпал с browser-facing origin, а
  нативный submit при действующем `Referrer-Policy: no-referrer` пришёл с literal
  `Origin: null` и Fetch Metadata `same-origin`/`navigate`/`document`.
- Exact `583165e…` переносит form-origin boundary в runtime hook: public origin
  принимается только при exact match с validated `PORTAL_PUBLIC_ORIGIN`, а
  absent/literal-null — только с exact same-origin navigation metadata.
  Cross-site/malformed/incomplete variants остаются fail-closed до route action;
  JSON/API behavior и session-bound CSRF не меняются.
- Fresh gates: check 0/0; full Vitest 75/75 files, 563 pass + 1 Windows skip;
  Chromium E2E 18/18; build; audit 0; docs; release scan 564/564; diff check.
  Initial full Vitest attempt имел четыре concurrent local-D1 timeouts; все
  четыре прошли изолированно и затем прошли в полном run с четырьмя workers.
- Independent verdict exact `583165e…`: **GO**, 0 `P0` / 0 `P1`. Reviewer `P2`
  backlog: canonical raw-Origin syntax hardening и отдельный negative
  hook-level browser case; доказанного bypass/отказа milestone нет, поэтому они
  не блокируют deploy по Stage 13 priority policy.
- Отдельно разрешённый preview Worker deploy exact `583165e…` выполнен одной
  `wrangler deploy --strict` mutation. New active version fingerprint
  `2de99c0c5815` обслуживает 100%; previous `3f189dd10ce8` retained для rollback.
  Access `302/302/200/204`, register GET `200` с form, new/previous versioned
  routes `404`, bindings/vars/three secret names exact. D1 остаётся `25/pending
0/FK 0`, synthetic `2 + 1703`, auth/account/outbox/session/bootstrap counts
  `0`; R2 empty, nine latest jobs healthy. Rollback не понадобился. Protected
  evidence digest prefix `1e22812b898c`; docs-only checkpoint следует отдельно.
- Следующий atomic step — отдельно разрешённый retry только первого controlled
  account и verification delivery, затем read-only reconcile до любого второго
  account. Production/CMS и остальные mutations не разрешены.

## Current continuation: быстрый путь к full manual preview — 2026-09-01

- **Outcome:** owner-authorized preview phases 1–2 and registration-origin
  remediation deploy complete. Exact reviewed `583165e316b739f4fb6a30001dae3a98ec62e1a1`
  is active at 100% with auth+Resend enabled only in preview and limited to two
  SHA-256 allowlist entries. Next gate is separately authorized retry of only
  the first controlled account registration/verification; the second account
  and one-shot bootstrap/RBAC follow only after its checkpoint. Новый review-loop
  не нужен без material diff.
- **Recovery/schema:** created one distinct unbound EEUR recovery D1 (fingerprint
  `4b2802119d09`). CurrentUser-DPAPI export round-trip, local `quick_check=ok`,
  exact 527 objects/142 tables/95,573 rows/count/schema/current-pair digests and
  FK 0 passed; plaintext/local scratch removed. Only `0024`/`0025` were applied
  to recovery then preview. Both finish ledger 25/max 25, pending 0, schema 535,
  lineage 8 objects/4 columns and FK 0.
- **Fail-closed deploy:** strict dry-run and exact reviewed deploy passed. Active
  version fingerprint `1a0707dc5dec`, one version at 100%; previous compatible
  version retained. Anonymous/invalid Access `302`, valid root `200`, health
  `204`, versioned routes `404`; D1 state, two empty private EEUR R2 buckets and
  nine latest scheduled jobs remain healthy. Public auth, email, Telegram,
  document and contract flags remain fail-closed; no send/login/bootstrap/PII.
- **Auth/email deploy:** one separately authorized `wrangler deploy --strict`
  exact `ec11bbc…` completed successfully. Active version fingerprint
  `3f189dd10ce8`, one version at 100%; previous fail-closed `1a0707dc5dec`
  remains available for rollback. Exact vars/bindings/three secret names match;
  auth and Resend are enabled, recipient allowlist is exactly two unique hashes
  with no plaintext address, while Telegram/uploads/contracts/media/public
  contract functions remain fail-closed. Anonymous/invalid Access is `302`,
  valid root/health is `200/204`, new and previous versioned routes are `404`.
  D1 remains migration 25/pending 0/FK 0/current `2 + 1703`, with zero users,
  sessions, accounts, email/Telegram rows, bootstrap actions and contract offers;
  both private EEUR R2 buckets remain empty and all nine latest jobs are healthy.
  No provider send or data/account/bootstrap mutation was performed; rollback
  was not needed.
- **Registration-origin remediation deploy:** one separately authorized strict
  deploy exact `583165e…` completed. Fingerprint `2de99c0c5815` is active 100%,
  previous `3f189dd10ce8` remains available. Access/root/health/register GET,
  both versioned routes, bindings/config, D1 `25/pending 0/FK 0`, synthetic
  `2 + 1703`, zero auth/account/outbox/session/bootstrap counts, empty R2 and
  nine latest jobs all passed; rollback was not needed.
- **Phase 0 baseline:** pre-mutation lock proved reviewed runtime ancestry,
  exact preview target, compatible rollback, exactly pending `0024`/`0025`, FK
  `0`/synthetic `2 + 1703`, two empty private EEUR R2 buckets, fail-closed
  vars/bindings/secrets and Access deny/valid-side smoke. Protected service-token
  values remained memory-only. Phase 1–2 evidence above supersedes its pending/
  recovery/active-version facts; no OTP/login occurred.
- **Приоритет:** root `AGENTS.md`, roadmap и test plan теперь требуют связать
  findings с ближайшим milestone. До продвижения исправляются `P0/P1`;
  `P2/P3` не задерживают preview и уходят в backlog. Связанные мелкие fixes
  получают один focused regression run.
- **Deployment:** постоянный tracked prompt разделён на короткие target-bound
  фазы: lock → recovery/schema → fail-closed deploy → auth/accounts/bootstrap →
  product/document/contract/Telegram blocks → owner exploratory pass. У каждой
  фазы есть минимальная проверка и rollback; зелёная фаза без drift/material
  diff/`P0/P1` не повторяется.
- **Persistent synchronization:** после каждой попытки remote mutation, включая
  failed/ambiguous, до следующей mutation теперь обязательны actual read-only
  postcondition, обновление metadata/atomic record в active state и отдельный
  малый docs-only commit. Exit code и история чата не заменяют фактическое
  environment evidence; blind retry запрещён до containment/reconciliation.
- **Session mode checkpoint:** после каждой атомарной операции агент обязан
  сообщить `rollover_required`, текущий/следующий step и рекомендацию
  `Medium|High|Max` простыми словами. `High` — normal deploy default; `Medium` —
  только read-only/docs/manual continuation; `Max` — лишь при подтверждённом
  серьёзном риске неверной среды, неоднозначной необратимой записи, failure
  recovery/rollback, corruption, security bypass/secret exposure или
  code/schema incompatibility. Обычная fail-closed/provider/UI ошибка не
  повышает режим автоматически.
- **Context cost:** active state сокращён до current operational truth. Новый
  session читает верхний current handoff block и открывает 2500-line history
  только для конкретного provenance/evidence, а не перечитывает её автоматически.
- **Owner guide:** создан
  `docs/operations/OWNER_FULL_MANUAL_PREVIEW_GUIDE.md` с reasoning `High` для
  детерминированного deploy, готовым goal prompt, действиями владельца, manual
  matrix, обязательным post-mutation report и stop/rollback rules.
- **Known inputs:** роли двух owner-controlled mailbox уже известны локальному
  operator context и не записаны в Git. Private Telegram invite link не является
  Bot API binding; ещё нужны protected dedicated bot token, exact signed-decimal
  chat ID, type `channel` и bot-admin `Post Messages` permission.
- **Focused verification:** `npm.cmd run docs:check` passed — 188 links / 57
  files, 109 executable command lines и Stage-13 continuity; `npm.cmd run
release:scan` passed — 563/563 text files, no prohibited artifact/high-confidence
  secret/PII; `git diff --check` passed.
- **Осознанно не запускались:** `npm run check`, full Vitest, E2E, build и audit.
  Diff ограничен docs/prompt/agent instructions, не меняет runtime, migrations,
  dependencies или deployment config; используется inherited reviewed evidence
  75/75 files, 561 pass + 1 Windows skip, E2E 18/18, build и audit 0.
- **Untouched by the latest mutation:** D1/R2/Access/secrets/Telegram, provider
  sends, accounts, sessions, bootstrap, production, DNS/CMS, официальный сайт и
  real PII не менялись. Изменён только preview Worker version/config с указанным
  auth/email enablement.

Exact next action владельца: отдельно разрешить controlled registration и
verification первого allowlisted preview account. Это вызовет preview D1 write и
ровно предусмотренную auth email delivery; второй account и bootstrap не должны
начинаться до read-only reconciliation и отдельного checkpoint этой операции.

## Independent GO для exact `1607d6d` — 2026-08-30

- **Provenance:** exact candidate
  `1607d6de55491afe7a2bea059e5f36e8718e0b8c`, direct parent
  `6ebf4761712c07de262fbac0bb3d532f98fd74c3`; fresh separate reviewer verdict —
  **GO**, 0 BLOCKER / 0 HIGH / 0 MEDIUM / 0 LOW. Exact HEAD/parent/worktree были
  подтверждены до и после read-only review.
- **Scoped evidence:** все 8 mixed-polarity вариантов отклонены во всех семи
  status paths, 8 pure-negative controls дают 0 false rejection; missing/
  mismatch/metadata paths — 7/7. Focused unit — 1 file/4 tests; check — 0/0;
  docs — 171 links/56 files + 109 commands; build, release scan 562/562 и exact
  diff check прошли.
- **Proportional scope:** runtime/migrations/dependencies/config/E2E harness не
  менялись, поэтому full Vitest/E2E осознанно не повторялись. Reviewer принял
  inherited exact runtime evidence: 75/75 files, 561 pass + 1 Windows skip,
  E2E 18/18 и audit 0.
- **Boundary:** этот status-recording child фиксирует внешний verdict, но не
  становится новой implementation candidate и не запускает новый review loop.
  Reviewed implementation SHA остаётся `1607d6d…`; remote/provider/production/
  CMS mutation не выполнялась и не авторизована.

## Четвёртая continuity remediation после review `6ebf476` — 2026-08-30

- **Provenance:** iteration 4 rejected candidate — exact
  `6ebf4761712c07de262fbac0bb3d532f98fd74c3`, direct parent
  `df49837be5889559b928b8b9a14136eb5ac8db65`. Fresh independent verdict —
  **NO-GO**, 0 BLOCKER / 0 HIGH / 1 MEDIUM; exact HEAD/parent/worktree clean.
- **Scoped reviewer gates:** check 0/0 за 40.84 s; continuity unit — 1 file/4
  tests, 0 skips; docs — 171 links/56 files + 109 commands + continuity; build —
  passed за 26.11 s; release scan — 562/562; diff check passed. Full Vitest/E2E
  осознанно не повторялись; reviewer подтвердил unchanged runtime/migrations/
  dependencies/config/harness и inherited `df49837…` full evidence.
- **MEDIUM — mixed-clause negation:** statement-wide negative predicate скрывал
  отдельный positive review clause, когда unrelated comments/findings clause
  содержал отрицательный completion-like verb. Public validator принимал EN и
  RU reproduction во всех семи status paths.
- **Regression first:** четыре shared EN/RU mixed-polarity fixtures в обоих
  clause orders дали ожидаемые 3 failed / 1 passed в focused unit и 32 явные
  contract-проблемы в actual `docs:check`.
- **Fix:** completion vocabulary теперь проверяется token-by-token; только
  локально связанная auxiliary/`not|never|no|without|не`/`has yet to` polarity
  исключает token. Отдельный non-negated `completed|concluded|passed|returned`
  сохраняет positive claim; все pure-negative/historical/pending controls
  остаются разрешёнными.
- **Focused после fix:** continuity unit — 1 file/4 tests, 0 skips, passed;
  actual docs — 171/56 + 109 + continuity; check — 0 errors/0 warnings; build —
  passed; release scan — 562/562; diff check — passed.
- **Scope:** runtime/migrations/dependencies/config/E2E harness byte-identical к
  rejected parent; remote/provider/production/CMS actions не выполнялись. Эта
  remediation создала exact `1607d6d…`, который затем получил отдельный GO,
  зафиксированный выше.

## Третья continuity remediation после review `df49837` — 2026-08-30

- **Provenance:** iteration 3 rejected candidate — exact
  `df49837be5889559b928b8b9a14136eb5ac8db65`, direct parent
  `f33885257019ea0aeec9f839595fc5596f004240`. Independent verdict — **NO-GO**,
  0 BLOCKER / 0 HIGH / 1 MEDIUM; reviewer сохранил exact HEAD/parent и worktree
  clean и не выполнял tracked/remote/provider/production/CMS mutation.
- **Reviewer gates для rejected SHA:** focused 10-file set — 10/10 files,
  40 passed + 1 Windows-only signal skip; full Vitest — 75/75 files, 561 passed +
  1 skip из 562 за 2844.11 s; check/build/docs/audit/release scan passed; real
  E2E — 18/18 за 3.4 min на port `58874`; intentional no-tests failure завершился
  ожидаемым exit 1 на port `60577`. Оба E2E ownership audit clean; docs — 170
  links/56 files + 109 commands, release scan — 562/562, exact diff passed.
- **MEDIUM — completion/negation polarity:** ordinary English `completed` и
  `concluded` отсутствовали в positive completion vocabulary, а direct positive
  check выполнялся до explicit outcome negation. Поэтому natural completion
  claim мог быть пропущен, а `not received` — ошибочно отклонён.
- **Regression first:** shared direct/adjacent completion fixtures и mandatory
  `not received`/`did not return` controls дали ожидаемые 4 failed / 0 passed в
  focused unit и 48 contract-проблем в actual `docs:check`. Дополнительные
  contraction/future/RU negative controls дали ожидаемые 3 failed / 1 passed до
  semantic fix.
- **Один production validator:** positive vocabulary теперь включает direct и
  adjacent completion/conclusion forms. Explicit auxiliary negation,
  contractions, `has yet to` и RU `не` polarity обрабатываются до positive
  outcome; исторические и pending controls сохраняются.
- **Executable contract:** shared positive/negative fixtures проверяются pure
  API и инъецируются через actual validator для каждого из семи status paths;
  CLI и tests не дублируют matcher rules.
- **Scope:** runtime source, migrations `0024`/`0025`, D1/R2 semantics, Worker,
  E2E lifecycle и deployment configuration не меняются. Remote/provider/
  production/CMS operations не выполнялись.
- **Focused после fix:** continuity unit — 1/1 file, 4/4 tests за 1.46 s; actual
  `docs:check` — 171 links/56 files + 109 commands + continuity; release scan —
  562/562; diff check — passed. `npm run check` вернул 0 errors/0 warnings и
  build passed на тех же неизменённых checker/runtime bytes до последующих
  docs-only policy edits.
- **Proportional verification:** полный Vitest/E2E/audit не повторялись, потому
  что diff не меняет runtime, migrations, dependencies, config или E2E harness.
  Exact rejected runtime ancestor `df49837…` уже независимо прошёл full 75/75
  files, 561 pass + 1 Windows skip, E2E 18/18 и audit 0 (evidence выше). Один
  начатый до owner clarification полный Vitest был остановлен; его результат не
  заявляется. Новые правила закреплены в root `AGENTS.md`, roadmap, test plan и
  active remediation prompt.
- После immutable direct-child commit обязателен fresh independent reviewer с
  тем же focused proportional scope; эта implementation session не присваивает
  себе GO.

## Вторая continuity remediation после review `f338852` — 2026-08-30

- **Provenance:** iteration 2 rejected candidate — exact
  `f33885257019ea0aeec9f839595fc5596f004240`, direct parent
  `1ba7d49b0212a5897e25f468f16184f73ae2a0d2`. Independent verdict — **NO-GO**,
  0 BLOCKER / 0 HIGH / 2 MEDIUM; reviewer сохранил candidate/worktree clean и не
  выполнял remote/provider/production/CMS mutation.
- **Reviewer gates для rejected SHA:** focused 10-file set — 10/10 files,
  40 passed + 1 Windows-only signal skip; full Vitest — 75/75 files, 561 passed +
  1 skip из 562, 2902.21 s; check/build/docs/audit/release scan passed; real E2E —
  18/18 за 3.5 min на port `49347`; intentional no-tests failure завершилась
  ожидаемым exit 1 на port `51258`. Оба E2E пути оставили 0 owned roots/runtime/
  listener/E2E-owned process, четыре unrelated release roots не изменились.
- **MEDIUM 1 — contextual bypass:** pending/future candidate statement вызывал
  ранний `continue`, поэтому соседний unbound completed positive-review claim не
  связывался с тем же текущим объектом проверки.
- **MEDIUM 2 — stale current reviewed SHA:** checklist PR-A18/PR-I04 и
  full-preview current gate продолжали называть `02d7cbc…` latest/base, хотя
  active metadata уже указывала `1ba7d49…`; прежний `docs:check` не сверял такие
  assertions с metadata.
- **Regression first:** четыре shared EN/RU adjacent pending/requires + GO
  fixtures дали ожидаемые unit 3 failed / 1 passed и четыре явных ошибки в
  реальном `docs:check`. После detector fix unit прошёл 4/4, затем усиленный
  `docs:check` ожидаемо стал red на реальных stale checklist/full-preview claims
  до их исправления.
- **Один production validator:** pending/future statement теперь проверяет
  соседний unbound completed independent-GO, но explicit historical candidate
  controls остаются разрешёнными. Тот же pure API извлекает active latest/last
  reviewed SHA assertions и сверяет их с `reviewed_candidate` metadata.
- **Executable contract:** actual `docs:check` исполняет все shared fixtures и
  для каждого из семи status paths инъецирует четыре adjacent contradictions и
  stale reviewed-SHA assertion; CLI и unit tests не имеют копии detector rules.
- **Scope:** runtime source, migrations `0024`/`0025`, D1/R2 semantics, Worker,
  E2E lifecycle и deployment configuration не меняются. Remote/provider/
  production/CMS operations не выполнялись.
- **Полная local gate chain нового tree:** `npm.cmd run check` — 0 errors/
  0 warnings; `npm.cmd test -- --maxWorkers=1` — 75/75 files, 561 passed + один
  ожидаемый Windows-only signal skip из 562, 2889.43 s; build — passed; Chromium
  E2E — 18/18 за 3.6 min на unique port `50886`; production audit — 0;
  `docs:check` — 170 links/56 files + 109 commands + continuity; release scan —
  562/562; `git diff --check` — passed.
- **E2E ownership audit:** до/после run — 0 `reg-allgemein-e2e-run-*`, 0
  `runtime.env`, repository `.wrangler/e2e-runtime` отсутствует, port `50886`
  закрыт, 0 новых tracked Node/Chrome/Playwright/Wrangler PID; четыре unrelated
  `tmp/release-verify-*` timestamp не изменились. Пользовательские процессы не
  завершались.
- После immutable direct-child commit обязательны exact parent/HEAD/status checks
  и short recurrence `check` + continuity unit + `docs:check` + build; результат
  post-commit проверки не записывается самоссылочно внутрь candidate.

## Предыдущая continuity remediation после review `1ba7d49b` — 2026-08-30

- **Provenance:** iteration 1 rejected candidate — exact
  `1ba7d49b0212a5897e25f468f16184f73ae2a0d2`, direct parent
  `02d7cbc9d3f3772e2fb5f41da5eb375c9a722ac8`; clean initial worktree и
  `git diff --check 02d7cbc… 1ba7d49…` подтверждены. Independent verdict —
  **NO-GO**, 0 BLOCKER / 0 HIGH / 1 MEDIUM.
- **MEDIUM:** production detector покрывал только узкую последовательность слов
  и пропускал обычные RU/EN формулировки, reverse order, punctuation и line-wrap.
  Его обязательные adversarial fixtures не являлись исполняемой частью
  `docs:check`.
- **Regression first:** неизменённый helper воспроизвёл `[false, false, false,
false]` на четырёх representative phrases, а прежний `docs:check` ошибочно
  прошёл 170 links / 56 files, 109 commands и continuity. После добавления
  regression unit test ожидаемо упал на первой ранее пропущенной English phrase.
- **Один production validator:** `scripts/stage13-review-status.ts` теперь
  содержит pure text/data semantic detector и shared validation API;
  `scripts/check-stage13-continuity.ts` и unit tests используют именно их, без
  параллельной копии правил.
- **Executable adversarial contract:** сам `docs:check` импортирует и выполняет
  восемь mandatory RU/EN rejected fixtures, allowed historical/pending controls,
  case/punctuation/line-wrap semantics, а также missing/mismatched marker и
  premature-claim probes для каждого из семи status-bearing paths.
- **Scope:** runtime source, migrations `0024`/`0025`, D1/R2 semantics, Worker,
  E2E lifecycle и deployment configuration не меняются. Remote/provider/
  production/CMS operations не выполнялись.
- **Focused verification:** regression-first unit ожидаемо был red на первой
  ранее пропущенной phrase; после исправления continuity unit — 4/4, `check` —
  0 errors/0 warnings, `docs:check` — 170 links / 56 files, 109 commands и
  executable continuity contract passed, build — passed.
- **Полная local gate chain:** `npm.cmd run check` — 0/0;
  `npm.cmd test -- --maxWorkers=1` — 75/75 files, 561 passed и один ожидаемый
  Windows-only signal skip из 562, 2868.75 s; `npm.cmd run build` — passed;
  `npm.cmd run test:e2e` — Chromium 18/18 за 3.4 min на unique port `61881`;
  `npm.cmd audit --omit=dev` — 0 vulnerabilities; `npm.cmd run docs:check` —
  170/56 + 109 + continuity passed; `npm.cmd run release:scan` — 562/562;
  `git diff --check` — passed.
- **E2E ownership audit:** до/после run — 0 `reg-allgemein-e2e-run-*`, 0
  `runtime.env`, repository `.wrangler/e2e-runtime` отсутствует, port `61881`
  закрыт, четыре unrelated `tmp/release-verify-*` timestamp не изменились.
  Кратковременный post-run Chrome PID завершился сам; более поздний Chrome churn
  был read-only классифицирован как child pre-existing baseline Chrome без
  E2E/Playwright command marker. Новых E2E-owned Node/Playwright/Wrangler
  процессов нет; пользовательские browser processes не завершались.
- **Cloudflare contract cold-read:** official 2026-08 docs, installed Wrangler
  `4.120.1`, local `config-schema.json` и `@cloudflare/workers-types` повторно
  подтверждают используемые R2 `onlyIf`/`range` и D1 `batch` boundaries. Это был
  только read-only review; remote preflight/mutation не выполнялись.
- После immutable commit обязательны exact parent/HEAD/status checks и short
  recurrence `check` + continuity unit + `docs:check` + build; их result не может
  быть самоссылочно записан внутрь этого candidate commit.

| Iteration | Rejected/reviewed candidate                | Direct parent                              | Verdict | Findings                                                              | Next candidate state                                                 |
| --------- | ------------------------------------------ | ------------------------------------------ | ------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1         | `1ba7d49b0212a5897e25f468f16184f73ae2a0d2` | `02d7cbc9d3f3772e2fb5f41da5eb375c9a722ac8` | NO-GO   | 0 BLOCKER / 0 HIGH / 1 MEDIUM continuity self-check gap               | Next candidate `f338852…`, later reviewed NO-GO                      |
| 2         | `f33885257019ea0aeec9f839595fc5596f004240` | `1ba7d49b0212a5897e25f468f16184f73ae2a0d2` | NO-GO   | 0 BLOCKER / 0 HIGH / 2 MEDIUM adjacent-GO and stale-reviewed-SHA gaps | Next candidate `df49837…`, later reviewed NO-GO                      |
| 3         | `df49837be5889559b928b8b9a14136eb5ac8db65` | `f33885257019ea0aeec9f839595fc5596f004240` | NO-GO   | 0 BLOCKER / 0 HIGH / 1 MEDIUM completion/negation polarity gap        | Next candidate `6ebf476…`, later reviewed NO-GO                      |
| 4         | `6ebf4761712c07de262fbac0bb3d532f98fd74c3` | `df49837be5889559b928b8b9a14136eb5ac8db65` | NO-GO   | 0 BLOCKER / 0 HIGH / 1 MEDIUM mixed-clause negation bypass            | Next candidate `1607d6d…`, later reviewed GO                         |
| 5         | `1607d6de55491afe7a2bea059e5f36e8718e0b8c` | `6ebf4761712c07de262fbac0bb3d532f98fd74c3` | GO      | 0 BLOCKER / 0 HIGH / 0 MEDIUM / 0 LOW                                 | Local continuity gate complete; remote actions separately authorized |

## Предыдущая runtime/E2E remediation — 2026-08-29

- **Renderer isolation:** canonical bundle schema v2 обязательно содержит
  `renderer.engineVersion`. Exact registry связывает template version с engine и
  helper versions. `contract-html-renderer-v1` и реальный
  `contract-html-renderer-v2` имеют раздельные output-affecting escape/currency/
  interpolation/CSS/HTML implementations; unknown engine fail-closed. Unit
  regression реально рендерит v2, сравнивает v1 byte/hash golden и доказывает,
  что отличающийся v2 helper не меняет v1 output.
- **Bounded R2 reads:** contract R2 adapter сначала выполняет `head`, проверяет
  maximum/expected size, затем выполняет только `range max+1` GET с
  `onlyIf.etagMatches`. Conditional miss, changed ETag/size, truncated body,
  max+1 и hash mismatch fail-closed. Template normal load, winner/loser install
  verification, downloads и email attachment передают explicit bounds.
- **Recoverable intent cleanup:** append-only migration
  `0025_contract_storage_intent_generations.sql` добавляет immutable family/
  generation lineage, installer lease и append-only generation audit. Retry из
  aged `processing`, `delete_pending` или `deleted` создаёт отдельные intent ID и
  R2 key; cleanup claim/complete fenced exact generation. Поэтому stale cleaner
  удаляет только старый key. Ephemeral-D1 regressions покрывают processing/deleted
  retry, concurrent installers, stale cleaner, repeated replay и final D1/R2
  consistency без orphan/corrupt current object.
- **E2E ownership:** каждый `npm run test:e2e` получает unique port и один
  `reg-allgemein-e2e-run-*` temp root с ownership marker. Runtime secret,
  Wrangler state/log/config находятся только внутри него; success/failure и
  supported SIGINT/SIGTERM/SIGHUP проходят единый cleanup. Unit tests покрывают
  success/failure, collision-free roots, сохранение sibling и signal cleanup на
  платформах, где Node доставляет signal handler (Windows case явно skipped).
- **Initial status continuity attempt:** во всех status-bearing Stage 13 docs
  появился одинаковый `pending_independent_review` marker, а преждевременная
  строка runbook была удалена. Последующий review `1ba7d49b` показал, что
  detector и его self-test оставались слишком узкими; это закрывает текущая
  continuity remediation выше.
- **Focused verification:** exact Windows command
  `npm.cmd test -- --maxWorkers=1 tests/unit/contract-template-bundles.test.ts tests/unit/contract-storage.test.ts tests/unit/admin-contracts-preview-gate.test.ts tests/unit/e2e-run-lifecycle.test.ts tests/unit/stage13-review-status.test.ts tests/integration/storage-intents-d1.test.ts tests/integration/contract-template-install-d1.test.ts tests/integration/contracts-d1.test.ts tests/integration/migration-upgrade-d1.test.ts tests/integration/production-readiness-flow-d1.test.ts`
  завершилась exit `0`: 10 files, 38 passed и 1 skipped из 39, 602.98 s. Skip —
  только POSIX signal-delivery subprocess на Windows; success, failure, parallel
  roots и ownership cleanup исполнялись и прошли. Exact migration upgrade suite
  отдельно прошёл 5/5, включая populated `0023 → 0024` и `0024 → 0025`.
- **Полная локальная цепочка:** `npm.cmd test -- --maxWorkers=1` — exit `0`,
  75/75 files, 559 passed и тот же 1 Windows-only skip из 560, 2787.22 s;
  `npm.cmd run check` — exit `0`, 0 errors/0 warnings; `npm.cmd run build` — exit
  `0`; `npm.cmd run test:e2e` — exit `0`, Chromium 18/18 за 3.2 min на уникальном
  локальном порту `58960`; `npm.cmd audit --omit=dev` — exit `0`, 0
  vulnerabilities; `npm.cmd run docs:check` — exit `0`, 170 links/56 files, 109
  commands и Stage-13 continuity passed; `npm.cmd run release:scan` — exit `0`,
  562/562 text files, без prohibited artifacts/high-confidence secrets/PII;
  `git diff --check` — exit `0`.
- **E2E cleanup evidence:** после финального реального run отдельный read-only
  audit дал 0 `reg-allgemein-e2e-run-*` roots, 0 `runtime.env`, 0 listeners на
  `58960`, 0 новых Node/browser PID; fixed legacy config/log dirs и repository-root
  `.wrangler/e2e-runtime` отсутствуют. Исторические generated leftovers из
  rejected helper (30 log, 2 config и 14 runtime files) были удалены только из
  трёх точно проверенных generated roots; unrelated paths не затронуты.
- Четыре pre-existing ignored `tmp/release-verify-*` копии от 14/17 августа имеют
  собственный nested `.wrangler/e2e-runtime`, но не содержат `runtime.env`, не
  менялись этим run и не принадлежат новому `reg-allgemein-e2e-run-*` lifecycle.
  Они сохранены как unrelated user state и исключены из run-owned delta.
- Первый промежуточный E2E run выявил отсутствие teardown handshake и зависание
  Vite close, а один ранний foundation assertion был transient. Исправленный
  global teardown/shutdown повторно прошёл foundation 3/3, затем полный 18/18 и
  финальный 18/18 после port logging; незавершённый run-owned root был удалён
  тем же ownership-guarded cleanup. Эти ранние runs не используются как green
  evidence.
- Новое independent review остаётся обязательным; remote D1/R2/Workers/Pages,
  provider, secrets, Git remotes, официальный сайт и production в remediation не
  изменялись.

## Owner clarification 2026-08-26: рабочий preview до approvals

- Закрытый `OQ-036` исправляет прежнюю последовательность: руководитель и
  legal должны получить реально сформированные preview-договоры и уже по ним
  дать правки. Финальное approval блокирует production, а не создание
  production-candidate draft и полный synthetic technical lifecycle.
- `full-manual-preview` теперь обязательно включает четыре реальных Browser Run
  render/delivery review, минимум один offer→accept→different-admin formation/
  activation→certificate/download, private R2 и контролируемую email delivery с
  заметной `TEST/ENTWURF` маркировкой. Текущий `synthetic-core-v1` доказывает
  core, но не закрывает этот checkpoint; нужна append-only migration и
  отдельный fail-closed `preview_review` scope.
- Telegram implementation, preflight/smoke/abort/reconcile tools и migration
  `0017` уже существуют. Для checkpoint нужен dedicated preview bot, exact
  private destination и ровно один реальный minimized normal-outbox attempt с
  recovery evidence; credentials/permission запрашиваются непосредственно
  перед внешним шагом.
- Upload/manual-review implementation и два private EU R2 существуют. Для
  checkpoint synthetic PDF/JPEG/PNG фактически проходят upload→quarantine→
  audited forced download→local AV→hash-bound clean attestation→отдельное
  business decision, включая negative/hash/cleanup cases. Production training/
  privacy approval остаётся отдельным gate и не отменяет preview rehearsal.
- Агент без ожидания approval выполняет все безопасные local/read-only/
  reversible prerequisites и останавливается только непосредственно перед
  точным credential, external parameter, remote mutation, deploy или provider
  send. Production, официальный сайт и реальные Office/PII не входят в scope.

## Full-manual-preview reviewed candidate (rejected) — 2026-08-26

- Из exact starting HEAD `c02b1bf1067e46c178dd0ead6f55bf1f0ede09b9`
  подготовлена append-only migration `0024_contract_preview_review.sql`.
  Applied migrations не переписывались; remote preview/recovery всё ещё имеют
  только `0001`–`0023`.
- Новый `preview_review` scope разрешён только при `APP_ENV=preview`, explicit
  flag и Browser Run renderer. Четыре versioned bundle устанавливаются
  идемпотентно, используют provider/contact/register snapshots и общие/видовые
  production-candidate clauses, но каждый HTML/PDF/certificate заметно помечен
  `TEST/ENTWURF — nicht für reale Vertragsbeziehungen`. Production template
  gates и legal approval не ослаблены.
- Candidate пытался реализовать deterministic template R2 keys через
  pre-read/verify-existing и сверять D1 provider/media/template snapshots, а
  draft creation привязывал approved HTML/CSS source hashes к текущему runtime
  renderer source. Independent review ниже доказал, что `GET → PUT` не даёт
  atomic write-once, а source binding и D1 terminal assertion неполны; эти
  свойства нельзя считать реализованными до remediation и нового GO.
- Реальный preview email больше не является одной ссылкой: worker читает exact
  offer PDF из private archive R2, сверяет content type, размер и SHA-256 с D1,
  после чего передаёт один bounded Base64 attachment в Resend. В preview Resend
  fail-closed разрешает только адреса из `PREVIEW_EMAIL_RECIPIENT_HASHES`;
  plaintext recipient values не попадают в tracked config/evidence.
- Parent page показывает отдельный однозначный текст и acceptance evidence для
  платного и funded offer. Parent и admin стороны остаются разными principals;
  admin formation/activation выпускает отдельный immutable marked certificate.
- Existing mandatory upload/manual-review application path повторно проверен:
  synthetic upload, private quarantine R2, forced admin download, hash-bound AV
  attestation, separate business decision, owner/cross-owner download и cleanup
  прошли 25/25 профильных тестов и 19/19 D1 document tests в полном suite.
  Никакой remote upload или фактический local-AV operator step не выполнялся.
- Existing dedicated Telegram normal-outbox boundary повторно прошёл 56/56
  профильных tests и полный suite: target/preflight, ровно один attempt,
  ambiguous delivery quarantine, abort/reconcile и запрет blind retry. Bot
  token/destination не устанавливались, remote prepare/send не выполнялись.
- Candidate verification: focused contract/config/migration — 71/71;
  `npm run check` — 0 errors/warnings; полный `npm test` — 69 files/541 tests;
  `npm run build`; Playwright — 18/18; `npm audit --omit=dev` — 0
  vulnerabilities; `npm run docs:check` — 168 links/56 files, 109 commands и
  continuity; `npm run release:scan` — 549/549; `git diff --check` — passed.
  Первый Playwright run
  выявил только устаревшее ожидание старого общего текста кнопки; fixture имеет
  `manual_payment`, ожидание исправлено на новый payable label, полный повтор
  прошёл 18/18.
- Ни Worker, D1/R2, Access, secrets, provider, bootstrap, production, CMS,
  официальный сайт, Office либо PII state не менялись. Этот local candidate был
  зафиксирован как `fa7aeeb…` и получил independent NO-GO, описанный ниже;
  candidate-bound recovery, `0024` apply, deploy и sends запрещены до нового
  remediation candidate и отдельного GO.

## Full-manual-preview independent review NO-GO — 2026-08-27

- Exact candidate `fa7aeeb40726089a72396b41b27ce93db1f2a096`/parent
  `c02b1bf1067e46c178dd0ead6f55bf1f0ede09b9` был clean до и после review.
  `git diff --check`, check 0/0, 69 files/541 Vitest, build, Chromium 18/18,
  audit 0, docs 168 links/56 files + 109 commands и scan 549/549 прошли. Зелёная
  общая цепочка не перекрыла findings; verdict — **NO-GO**.
- **HIGH:** `templates.ts` hash-ит delegating `render.toString()`, не полные
  `renderBody`/kind clauses/copy/helpers; R2 bundle не содержит исполняемый HTML
  source/fonts/partials, version resolution использует current registry и
  unknown-version fallback. Remediation: canonical complete source bundle,
  exact version registry без fallback, actual HTML hash и cross-deploy v1/v2
  regressions.
- **HIGH:** template bundle использует `GET → unconditional PUT` без D1 intent;
  D1 install делает count-only audit, а exact check выполняет после committed
  batch. Remediation: staged storage intent, conditional R2 create-if-absent с
  verify-existing/no-overwrite, exact link assertion/reconcile и server-side D1
  terminal assertion, включая same/different-byte concurrency/crash tests.
- **MEDIUM:** `preview_review` draft path проверяет marker, но environment/flag
  gate приходит только при send. Remediation должна отказать production/disabled
  preview до `prepareNumber`, draft/operational record, audit или R2 side effect
  и закрепить seeded-preview-row production regression.
- **MEDIUM:** `0024` имеет empty migration evidence, но permanent populated
  upgrade suite не seed-ит approved provider/templates и dependent offers/
  artifacts. Нужен exact `0023 → 0024` fixture с preservation/FK/triggers/
  forbidden-pairing assertions.
- Canonical requirements добавлены как `CONTRACT-22`/`CONTRACT-23`, acceptance —
  `AC-CONTRACT-02`–`AC-CONTRACT-05`; test plan/storage/manual-preview/runbook
  синхронизированы. Для следующей основной Goal session подготовлен ignored
  prompt `docs/prompts/stage-13-remediate-full-manual-preview-review.md`.
- Следующий gate полностью local и не требует Cloudflare mutation. После
  implementation выполнить focused tests и полную цепочку, получить новый
  immutable candidate и остановиться на независимой role boundary. Только новый
  separate GO возвращает процесс к candidate-bound recovery/apply/deploy plan.

## Full-manual-preview NO-GO remediation — local candidate pending review

- Четыре review findings реализованы локально без remote mutation. Status этой
  session — `remediated_candidate_pending_independent_review`, а не GO.
- Renderer теперь получает только canonical serialized bundle из exact R2
  object. Bundle связывает body/common и kind clauses/copy/CSS, embedded pinned
  DejaVu Sans WOFF bytes, helper/schema/adapter versions и exact provider/
  payment/legal/media snapshot hashes; отдельный `renderedHtmlHash` связывает
  фактически собранный self-contained HTML. Любой string/current/synthetic
  fallback удалён. Hard-coded v1 golden и source/component/version denials
  закреплены в `tests/unit/contract-template-bundles.test.ts`.
- Template install сначала создаёт deterministic staged storage intent, затем
  делает R2 create-if-absent через type-supported `onlyIf`, всегда сверяет
  winner и связывает provider/media/four template rows, intent assertions,
  audit и server-side terminal exact assertion одной D1 batch transaction.
  `tests/integration/contract-template-install-d1.test.ts` покрывает same/different
  bytes, crash after intent/R2, conflict и ambiguous R2/D1 outcomes.
- `createDraft` проверяет preview environment/flag/Browser renderer/approval
  basis и synthetic marker до number/draft/operational/idempotency/audit/storage
  mutations. `contracts-d1.test.ts` доказывает неизменность state для test,
  production, disabled preview, unknown/missing/retired bundle; route/UI boundary
  закреплён `admin-contracts-preview-gate.test.ts`.
- Permanent `migration-upgrade-d1.test.ts` начинает с exact `0023`, создаёт
  provider/media/templates и полный offer/artifact/delivery FK graph, применяет
  original `0024`, сравнивает seeded rows и проверяет FK/triggers и scope/basis
  pairings. Applied migrations `0001`–`0023` не переписывались; `0024` remote не
  применялась.
- Focused suites и полная local chain прошли: check 0/0, controlled-worker
  Vitest 73 files/548 tests, build, Playwright 18/18, production audit 0,
  docs/continuity, release scan и diff check. E2E helper также получил
  workspace-independent Wrangler/XDG paths и deterministic synthetic-server
  teardown; remote/provider state он не использует.
- Immutable remediation candidate — единственный local commit, содержащий этот
  checkpoint. Его exact SHA/direct parent и clean-worktree expectation после
  commit записываются в ignored
  `stage-13-independent-review-full-manual-preview-remediation.md`. Следующая
  session выполняет только independent read-only review. До её GO recovery/
  apply/deploy/provider send/bootstrap/production остаются запрещены.

## Full-manual-preview checkpoint — текущий проход 2026-08-25

- Independently reviewed period/import execution anchor:
  `a098b8324ddca337c19b3344c7c1f82dfb68a36a`. Timeout remediation имеет
  отдельный immutable anchor `5789e319fd65850112a1bf05961e96c86f7c76aa`;
  его exact-SHA independent read-only review вернул GO без
  BLOCKER/HIGH/MEDIUM.
- Утверждённый владельцем current period создан в preview одной атомарной D1
  mutation: `2026-2027` / `2026/2027`, даты
  `2026-08-17`–`2027-07-09`. Exact postverify: одна period/audit pair, users `0`,
  FK violations `0`.
- Встроенный no-PII baseline прошёл раздельные planner/stager/reviewer/recovery
  роли: PlusBText `2/2`, Access `1703/1703`, issues `0`. Fresh protected
  recovery point и полный isolated restore отдельной EU D1 проверены; source
  preview не менялся при restore.
- Первый baseline promote превысил provider 30-second query limit. После
  завершения процесса два canonical read-only verify доказали `not applied`,
  поэтому blind retry был остановлен.
- Причина — пять неиндексированных correlated lookups в атомарной projection.
  Подготовлена append-only migration `0023_legacy_projection_lookup_indexes.sql`
  и deterministic EXPLAIN regression. Check, 68 files/531 Vitest, build,
  Playwright 18/18, audit 0, docs/continuity и release scan прошли; независимый
  exact-SHA read-only review вернул GO без BLOCKER/HIGH/MEDIUM.
- В continuation из exact HEAD
  `c02b1bf1067e46c178dd0ead6f55bf1f0ede09b9` владелец отдельно разрешил
  применить `0023` к preview и существующей recovery-копии, обновить recovery
  evidence и ровно один раз повторить baseline publication. На обеих D1 теперь
  exact `0001`–`0023`, pending `0`, пять indexes и пять ожидаемых EXPLAIN plans,
  FK violations `0`.
- Исходные recovery artifacts сохранены неизменными. Новый versioned protected
  recovery point/evidence подтверждает exact source/restore schema (`527`
  comparable objects, `142` tables), `49,731` aggregate pre-promote rows,
  current pair `none` и FK `0` в isolated recovery.
- Ровно одна новая promote attempt выполнена из clean exact
  `a098b8324ddca337c19b3344c7c1f82dfb68a36a` worktree и завершилась успешно.
  Canonical verify: status `promoted`, current pair `target`, unique/dependency/
  FK/reconciliation passed, PlusBText `2`, Access target/projection `1703`,
  issues `0`, promote events `1`, rollback/roll-forward events `0`.
- Финальные local gates из starting HEAD continuation: `npm run check` — 0
  errors/warnings; полный `npm test` — 68 files/531 tests; `npm run build` —
  passed; `npm run docs:check` — 163 links/55 files, 109 commands и continuity
  passed; `npm run release:scan` — 545/545; `git diff --check` — passed.
- Следующая automatic continuation выполнила только read-only audit. Canonical
  exact-plan verify повторно подтвердил promoted target pair, `2 + 1703`, issues
  `0`, все invariants и events `1/0/0`. Aggregate D1 preflight: migrations
  `23/max 23`, FK `0`, current periods `1`, users `0`, release plans `1`
  (`promoted=1`, non-promoted `0`), bootstrap available/completed `1/0`.
- Browser без credentials проверил root, operations health, registration и
  admin-operations: все четыре route корректно остановлены Cloudflare Access
  login, доступные login controls присутствуют, console errors `0`. Email/OTP не
  вводились; authenticated portal evidence не заявляется.
- Production, официальный сайт, реальные Office/PII источники, auth/email и
  bootstrap в этом проходе не изменялись.
- В следующем отдельно разрешённом D1-only проходе из clean detached exact
  `c02b1bf1067e46c178dd0ead6f55bf1f0ede09b9` worktree выполнен весь built-in
  synthetic candidate lifecycle с distinct planner/stager/reviewer/recovery-
  verifier/promoter/transition identities. Plan safe delta: PlusBText `1`
  changed/`1` unchanged, Access `1` changed/`1702` unchanged; stage `2 + 1703`,
  issues `0`.
- Fresh candidate-current recovery point использовал новый protected DPAPI
  CurrentUser export и новую distinct/unbound EU D1. Export↔restore exact:
  `527` comparable schema objects, `142` tables, `67,422` rows, migrations
  `23/max 23`, FK `0`, current pair `previous`, `2 + 1703`, users `0`. Live
  source за время rehearsal добавил только append-only `scheduled_job_runs`;
  local SQLite oracle подтвердил exact export↔restore table/schema/migration/
  current-pair digests и `quick_check=ok`. Plaintext/local scratch удалены.
- Candidate review/recovery binding прошли. Promote/verify дал
  `promoted/target`, rows `2 + 1703`, issues `0`, events `1/0/0`. Ровно один
  repeated promote reconciled idempotently без нового event или row drift.
  Rollback/verify дал `rolled_back/previous`, events `1/1/0`; roll-forward/
  verify вернул `promoted/target`, events `1/1/1`, unique/dependency/FK/
  reconciliation passed.
- Final aggregate D1 audit: migrations `23/max 23`, FK `0`, current periods `1`,
  users `0`, release plans `2` (`promoted=2`, non-promoted `0`), total bundle
  events `2/1/1` с baseline, одна current pair `2 + 1703`, current issues `0`,
  bootstrap available/actions `1/0`. Worker/Access/auth/email deploy, bootstrap,
  Telegram, Office/PII, production, CMS и официальный сайт не затрагивались.

### Продолжение goal в новой сессии

- Продолжать из clean local workspace на commit, содержащем этот handoff;
  immutable code/migration anchor —
  `5789e319fd65850112a1bf05961e96c86f7c76aa`. Перед действиями сверить
  `STAGE_13_ACTIVE_STATE.md`, этот раздел и exact Git ancestry.
- На этой же машине сохранены protected ignored controls
  `wrangler.preview.toml`, `imports/legacy-preview-baseline-plan.json`,
  `imports/legacy-preview-baseline-recovery-point.json` и
  `imports/legacy-preview-baseline-recovery.json`. Они не входят в Git, не
  должны выводиться или переноситься небезопасным способом и не появятся
  автоматически в другой машине/cloud workspace.
- Remote source теперь имеет migrations `0001`–`0023`, approved period и одну
  current built-in synthetic candidate pair; exact synthetic baseline остаётся
  previous rollback target, users/admins — `0`. Migration, baseline publication
  и candidate lifecycle повторять запрещено; при сомнении использовать только
  canonical read-only verify.
- На этой же машине дополнительно сохранены protected ignored versioned
  `imports/legacy-preview-baseline-recovery-point-0023.json` и
  `imports/legacy-preview-baseline-recovery-0023.json`. Исходные pre-stage
  artifacts не перезаписаны.
- На этой же машине дополнительно сохранены protected ignored candidate point,
  plan, stage/review, plan-bound recovery evidence и все promote/verify/
  repeated-promote/rollback/roll-forward results. Основные entry artifacts:
  `imports/legacy-preview-candidate-recovery-point.json`,
  `imports/legacy-preview-candidate-plan.json` и
  `imports/legacy-preview-candidate-recovery.json`; full resource IDs остаются
  только внутри protected artifacts.
- Ближайший внешний gate — independently reviewed preview auth/email candidate
  и отдельное точное разрешение на его Worker deploy/enablement с заранее
  ограниченными test recipients. Candidate D1 lifecycle не разрешал и не
  выполнял deploy, account/bootstrap, provider send, Telegram, Office/PII,
  production или официальный сайт.

Stage 13 реализует технический hardening и operator packet, но не даёт права на
production actions. Preview D1/R2 provision/migration и fail-closed Worker
evidence, включая automatic Cron delivery/freshness, уже получены;
authenticated/provider/remote Browser и manual-run/failure evidence,
legal/privacy approvals, RPO/RTO, reusable non-empty R2 backup и отдельное deploy
поручение остаются release blockers. One-off isolated preview D1 restore и exact
current empty-state R2 restore пройдены 2026-08-20. Независимый UptimeRobot alert
delivery/recovery rehearsal пройден 2026-08-11; public browser и PR-A15
stored-log remediation проверены 2026-08-12.

## Baseline

- Branch: `master`.
- Start HEAD: `6645df5648273d027b5e3e86eb64c024e5739b7a`.
- Initial `git status --short`: clean.
- Предыдущий handoff: [stage-12.md](stage-12.md).
- Operational contract:
  [PRODUCTION_READINESS.md](../../operations/PRODUCTION_READINESS.md).
- Historical Access/Telegram readiness candidate:
  `a590d1f08110c20b6f7b45294cb91a7be7b5a8e3`. Its parent `ca4ef8f` contains
  the Access OLE date fix; `a590d1f` adds only the tracked 2026-08-17 deployment
  checkpoint. It is narrower historical provenance, not the current candidate.
  Current immutable runtime anchor is `abb93f25`; `b2e8548f` is its rejected
  review seal. Exact docs/test remediation anchor is `4ac6a491`; final review
  target is exact docs-only seal `2bedc73c`.
- Preview D1 migration выполнена отдельно разрешённой операцией 2026-08-10.
  Production, remote import/send, DNS/CMS и официальный сайт не изменялись.

## Реализовано

- Создана requirement/acceptance → implementation → automated evidence матрица:
  [STAGE_13_TRACEABILITY.md](../STAGE_13_TRACEABILITY.md).
- Созданы и сверены четыре русскоязычных operator documents:
  [deployment](../../operations/PRODUCTION_DEPLOYMENT.md),
  [operations](../../operations/OPERATIONS_RUNBOOK.md),
  [disaster recovery](../../operations/DISASTER_RECOVERY.md) и
  [readiness checklist](../../operations/PRODUCTION_READINESS_CHECKLIST.md).
- Portal остаётся отдельным Worker/origin/D1/R2/auth/release lifecycle. Footer
  использует только versioned HTTPS `OFFICIAL_*` links из runtime config; CMS и
  официальный сайт не являются runtime-зависимостью.
- Добавлена append-only migration `0014_production_operations.sql`:
  scheduled-run ledger, storage write-ahead intents, one-shot admin bootstrap,
  cleanup leases и bounded pseudonymous-IP minimization.
- Позднее добавлена отдельная append-only migration
  `0015_worker_monitoring.sql` для PII-free error buckets и health/freshness
  monitoring; `0014` не изменялась.
- Архив и quarantine используют разные `R2_ARCHIVE`/`R2_QUARANTINE` bindings и
  namespace router; runtime отвергает один binding object для обеих ролей. Все
  новые R2 writes регистрируют intent до `put`; orphan cleanup имеет grace, lease
  и reconciliation. Для preview подтверждены два отдельных private EU buckets;
  current empty-state restore подтверждён 2026-08-20, production resources и
  reusable non-empty restore mechanism отсутствуют.
- Добавлены Worker scheduled handler, две UTC Cron-группы, allowlist jobs,
  dedupe/leases, per-job failure isolation, safe run history и admin-only manual
  operations page с CSRF/confirmation/idempotency/audit.
- Добавлен one-shot `npm run admin:bootstrap`: только verified/active target,
  atomic role+audit+assertion+consume, revoke sessions, replay/concurrency reject.
  CLI сверяет config `APP_ENV`, environment-specific D1 UUID и UUID-bound
  confirmation. Remote Wrangler получает временный selector-free config, поэтому
  UUID нельзя перенаправить через `database_name`/binding; local path не загружает
  `.dev.vars`. Upgraded DB с active admin автоматически запечатывает bootstrap.
- Усилены document/funding/contract/privacy boundaries: sensitive downloads
  POST+CSRF+typed purpose+atomic authorization/audit; closure/legal-archive guards;
  authoritative R2 cleanup; operational PII minimization и race-safe leases.
- Добавлены response headers, no-store для sensitive auth/download paths,
  versioned external footer links и расширенная upload signature/MIME validation.
- Добавлены `docs:check`, `release:scan` и `release:verify`. Последний включает
  check, Vitest, Playwright, build, production dependency audit, docs и artifact/
  high-confidence secret/PII scan.
- Добавлен связный migrated-D1 synthetic flow: registration/verify/login → cabinet
  → individual request/trial → contract accept/formation → price review → message
  → blocked/guarded/successful privacy closure. Это domain integration evidence,
  а не browser/preview evidence.

## Environment, migrations и compatibility

| Область     | Evidence                                                                                                                                                                                                                                                                                                                                        | Остаточный gate                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Empty D1    | deployed preview exact `0001`–`0023`, pending 0; authorized applies passed with complete candidate objects, five projection indexes and 0 FK violations; exact runtime/review/remediation anchors remain immutable/verified; protected pre-candidate and fresh candidate-current full isolated restores passed                                  | exact Worker deploy and production migration remain separate                               |
| Upgraded D1 | historical populated suffix tests through `0023` pass; exact runtime/remediation verification and final review pass; source preview and isolated recovery received append-only `0023`, then fresh post-baseline export/full isolated restore and candidate rollback/roll-forward passed                                                         | failed-migration decision/application smoke remain separate                                |
| R2 split    | local guards + two separate private EU preview buckets verified; exact current empty state restored into two distinct private EU buckets on 2026-08-20                                                                                                                                                                                          | production resources/policy and reusable future non-empty backup/restore mechanism         |
| Scheduler   | Local guards + preview automatic delivery/freshness for all nine jobs и внешний HEAD alert passed                                                                                                                                                                                                                                               | remote manual/dedupe/failure rehearsal                                                     |
| Bootstrap   | clean/invalid/replay/concurrent/upgrade, exact-ID selector isolation и result checks passed                                                                                                                                                                                                                                                     | remote clean-room/least-privilege/zero-admin recovery drill                                |
| Imports     | current Access sanitized profile 1703 rows/21 of 21 required fields/v1 compatible; current PlusBText v1 confirmed. Exact runner/review/remediation gates passed. Built-in synthetic baseline and candidate remote lifecycles, first-import/fresh candidate recovery, idempotent repeat, rollback and roll-forward passed with independent roles | real/current-data authorization, admin cold-read, authenticated lookup and owner decisions |

Applied migrations `0001`–`0023` нельзя переписывать. Recovery после применённой
migration — совместимый code rollback, новая forward-fix migration либо отдельно
разрешённый restore. Следующая schema correction получает новый append-only
номер; direct edit/down migration запрещены.

## Feature flags и fail-closed production paths

| Path                                  | Fail-closed config                                                                                                                                                                                                  | Статус                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Public registration                   | `AUTH_PUBLIC_ENABLED=false`                                                                                                                                                                                         | `feature_disabled`                                             |
| Email                                 | `EMAIL_PROVIDER=disabled`                                                                                                                                                                                           | `feature_disabled`                                             |
| Telegram                              | deployed preview uses `TELEGRAM_PROVIDER=disabled`; current exact candidate passed local/exact independent review and migration `0017` is deployed, but candidate Worker/provider path is not deployed or rehearsed | `feature_disabled`; external provider/rehearsal gate `blocked` |
| Document upload                       | `DOCUMENT_UPLOAD_ENABLED=false`                                                                                                                                                                                     | `feature_disabled`                                             |
| Contract rendering/send               | `CONTRACT_RENDERER=disabled`, `CONTRACT_SEND_ENABLED=false`                                                                                                                                                         | `feature_disabled`                                             |
| Online media grant                    | `MEDIA_ONLINE_GRANT_ENABLED=false`                                                                                                                                                                                  | `feature_disabled`                                             |
| Public statutory functions            | `PUBLIC_CONTRACT_FUNCTIONS_ENABLED=false`                                                                                                                                                                           | `feature_disabled`                                             |
| Retained legal-archive purge          | policy `disabled_by_policy`                                                                                                                                                                                         | `feature_disabled`                                             |
| Ordinary retained-archive read/search | route absent                                                                                                                                                                                                        | `feature_disabled`                                             |

`feature_disabled` не равно `passed`. Ограниченный release требует отдельного
approved scope и не называется полным MVP.

## Проверки 2026-07-22

| Команда/сценарий                           | Sanitized result                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                   | passed после удаления generated Worker output; 269 packages installed                                                |
| `npm run check`                            | clean-source passed: 0 errors/warnings                                                                               |
| Targeted Stage-13 tests                    | migration/bootstrap/scheduler/storage/download/headers/connected-flow/security passed                                |
| `npm test`                                 | passed: 44 files, 241/241 tests                                                                                      |
| `npm run test:e2e`                         | passed: 3/3 boundary smoke; это не full authenticated lifecycle                                                      |
| `npm run build`                            | passed; adapter output собран                                                                                        |
| `wrangler deploy --dry-run`                | passed на placeholder example config; 68 assets, remote deploy не выполнялся                                         |
| `npm audit --omit=dev`                     | passed: 0 vulnerabilities после корректной dev-only классификации build adapter                                      |
| `npm run docs:check`                       | passed: 138 local links / 51 files + 82 executable command lines                                                     |
| `npm run release:scan`                     | passed: 469/469 candidates; artifact/secret/PII/control-byte findings отсутствуют                                    |
| `git diff --check`                         | passed после final documentation/cold-read sync                                                                      |
| Preview D1 migration                       | passed 2026-08-10: 14/14, pending 0, schema parity, FK violations 0, user rows 0                                     |
| Preview Worker/Browser/provider/Cron smoke | partial 2026-08-11: fail-closed GET/HEAD, automatic Cron и внешний alert passed; Browser/provider/manual — `blocked` |
| D1/R2 isolated restore/rollback rehearsal  | not run — `blocked`                                                                                                  |

Этот pre-preview snapshot сохранял три high advisory в dev-only
Wrangler/Miniflare/Sharp tooling. Post-PR-D06 dependency remediation ниже
обновляет совместимый tooling/API boundary и даёт полный audit 0; до нового
immutable commit/rerun dependency gate остаётся `blocked`. Remote/restore/
approval gates также удерживают общий readiness в `blocked`.

## Independent review и cold-read

- Security/reliability reads выявили и закрыли: bootstrap exact-target/selector
  ambiguity и `.dev.vars` overlay, manual scheduler without admin audit, cleanup
  lease/audit races, sensitive download/funding/closure guards, stale outbox clock,
  PDF escaped-name/polyglot bypass и legacy cleanup lease.
- Final code cold-read после исправлений не нашёл remaining HIGH/blocker. Clean
  generated-worker boundary и fail-closed text scanner покрыты проверками.
- Independent operator content cold-read 2026-07-22 прошёл: четыре runbook,
  routes, flags, prerequisites, stop/rollback и NO-GO сверены; `docs:check`
  подтвердил 138 links/51 files + 82 command lines. Найденная неясность хранения
  materialized config закрыта exact ignored paths и `git check-ignore` guard.
- Full preview provider/manual/bootstrap/restore rehearsal не выполнялся и
  остаётся `blocked`; independent HEAD monitoring alert rehearsal passed
  2026-08-11. Monitoring evidence вошёл в immutable `b1a1505`; последующая
  dependency remediation и её evidence должны войти в новый immutable commit.
- Preview D1 migration и R2 provisioning не подменяют remote Browser conformance,
  full walkthrough и полный D1/R2 restore; эти gates остаются `blocked`.

## Remote preview evidence 2026-08-10

- Authorized target: отдельная preview D1; production resources не затронуты.
- Immutable code candidate: `4c0b43b3db85f8d799b9d28bb0ed79505809656f`;
  materialized `wrangler.preview.toml` остаётся ignored и не содержит secrets.
- Tooling: Wrangler `4.120.0`; перед remote action чистый `npm run
release:verify` завершился с exit code 0.
- Перед apply подтверждены ровно 14 ожидаемых pending migrations, 0 прикладных
  таблиц, 0 applied migrations и Time Travel recovery point
  `2026-08-10T15:17:57.466Z`.
- Remote apply: `0001`–`0014` применены; повторный list — pending 0. Remote/local
  schema-object inventory совпадает (396), `PRAGMA foreign_key_check` — 0,
  user rows — 0; присутствуют только две ожидаемые control seed rows.
- Это migration evidence, а не backup/restore rehearsal: protected export,
  isolated restore и rollback/roll-forward drill остаются `blocked`.

## Preview Turnstile evidence 2026-08-10

- Создан отдельный Managed widget `kolibri-reg-allgemein-preview` для preview и
  локальной разработки; его metadata повторно прочитаны через Cloudflare API.
- Публичный sitekey записан только в ignored `wrangler.preview.toml`. Secret не
  записывался в репозиторий или config: локальная recovery-копия зашифрована
  Windows DPAPI для текущего пользователя и защищена user-only ACL.
- Dummy Siteverify подтвердил корректность secret без раскрытия его значения.
  Временный API token отозван владельцем после завершения настройки; его
  локальный plaintext-файл больше не используется и подлежит удалению.
- Registration widget отправляет action `registration`; сервер требует exact
  action и deployment-specific hostname, ограничивает token 2048 символами и
  fail-closed обрабатывает timeout/network/schema ошибки. Preview backend
  allowlist не включает `localhost`/`127.0.0.1`; они отделены в local config.
- Targeted `auth-security` и `config` tests прошли: 2 files, 32/32 tests;
  `npm run check` — 0 errors/warnings.
- Полный post-change regression run прошёл: `npm test` — 44 files, 248/248
  tests; `npm run build` — passed.
- Turnstile secret установлен в preview Worker без раскрытия значения; DPAPI ACL
  повторно проверен и ограничен текущим Windows-пользователем. Реальный
  fresh-token submit и проверка replay rejection на защищённом backend не
  выполнялись, потому что public auth/email остаются выключены. Поэтому PR-C07
  остаётся `blocked`.
- Канонический Turnstile Spin bundle сохранён локально в ignored
  `.claude/skills/turnstile-spin/`: 13 файлов, включая SvelteKit reference и
  helper scripts. Копия побайтово сверена с установленным bundle; frontmatter и
  shell syntax проверены. Она является operational aid и не заменяет spec/runbook.

## Resend email preparation 2026-08-11

- Выбран существующий Resend domain `kolibri-dresden.de` без отдельного
  user-facing sending subdomain. Public DNS audit подтвердил, что root MX остаются
  IONOS, root SPF ровно один, а Resend DKIM и `send` MX/SPF уже присутствуют;
  DNS не изменялся.
- Утверждены exact identity
  `Kinder- und Elternzentrum Kolibri e.V. <registration@kolibri-dresden.de>` и
  Reply-To `registration@kolibri-dresden.de`; preview materialized config обновлён,
  но `EMAIL_PROVIDER=disabled` сохранён.
- Реализован direct HTTPS Resend adapter без дополнительного SDK: bounded timeout,
  pseudonymous stable idempotency key, safe request-ID response parsing и
  retryable/permanent classification без provider diagnostic/recipient/body в
  error. Production fake mode остаётся запрещён.
- Targeted config/provider tests прошли: 2 files, 33/33 tests; полный
  post-change regression — 45 files, 261/261 tests; `npm run check` — 0
  errors/warnings; `npm run build`, `docs:check`, `release:scan` и
  `git diff --check` прошли. Release scan проверил 471 text candidate и получил
  узкий allowlist только для утверждённого неперсонального registration mailbox;
  произвольный адрес по-прежнему fail-closed.
- Resend dashboard подтвердил `Verified` для `kolibri-dresden.de` в `eu-west-1`.
  Отдельный domain-scoped `Sending access` key создан, recovery-копия защищена
  Windows DPAPI, а `RESEND_API_KEY` установлен в preview Worker без раскрытия
  значения. `EMAIL_PROVIDER=disabled` не изменялся; synthetic delivery/reply
  smoke и реальная отправка не выполнялись. Поэтому PR-F01/PR-F02 остаются
  `feature_disabled`, а provider/privacy approval — `blocked`.

## Fail-closed preview Worker evidence 2026-08-11

- По отдельному прямому разрешению создан только Worker `reg-allgemein-preview`:
  `https://preview.example.com`. Production,
  DNS, CMS и официальный сайт не изменялись.
- Использован локальный Wrangler `4.109.0`; перед remote action прошли exact
  preview dry-run, проверка pending D1 migrations = 0 и `npm run release:verify`
  с exit code 0. Последний включил `check`, 45 files / 261 tests, Playwright,
  build, production dependency audit, `docs:check` и 471/471 release scan.
- SHA-256 ignored materialized config:
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`.
  Git HEAD во время deploy — `9d321758c67f111fb5de17b32e6434641f5bd654`,
  но worktree содержал незакоммиченные изменения; это не immutable release
  candidate. Remote evidence привязано к Cloudflare version
  `sha256:d483454a2af1` и не закрывает immutable Git gate.
- В Worker установлены только ожидаемые secret names: `JWT_SECRET`,
  `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`. Значения не выводились и не
  записывались в repository/config; JWT создан криптографически случайно только
  в памяти, provider recovery-копии прочитаны из DPAPI.
- Сохранён exact fail-closed набор: `AUTH_PUBLIC_ENABLED=false`,
  `EMAIL_PROVIDER=disabled`, `TELEGRAM_PROVIDER=disabled`,
  `DOCUMENT_UPLOAD_ENABLED=false`, `CONTRACT_SEND_ENABLED=false`,
  `CONTRACT_RENDERER=disabled`, `MEDIA_ONLINE_GRANT_ENABLED=false` и
  `PUBLIC_CONTRACT_FUNCTIONS_ENABLED=false`.
- Read-only HTTP smoke: `/` и `/auth/register` вернули 200; registration page
  показала service-unavailable state, submit остался disabled, Turnstile client
  не загружался. POST, real-token, provider send и authenticated Browser smoke
  не выполнялись.

## Preview Cron smoke evidence 2026-08-11

- Smoke выполнен по отдельному прямому разрешению только чтением automatic Cron
  evidence. Worker version
  `sha256:d483454a2af1`, SHA-256 ignored preview config и все
  fail-closed feature flags остались без изменений; deploy и secret operations
  не выполнялись.
- Cloudflare Cron использует UTC. Оба exact bucket подтверждены remote journal:
  `* * * * *` доставляет `email_outbox`/`telegram_outbox`, а
  `*/15 * * * *` — семь maintenance jobs. Первый run записан
  `2026-08-11T12:10:15.629Z`, первый maintenance batch — около 12:15 UTC.
- Snapshot `2026-08-11T12:22:00.565Z`: 31 automatic scheduled runs, из них 7
  `succeeded`, 24 `feature_disabled`, 0 `failed`, 0 `running`, 0 manual runs.
  Все девять allowlisted job names присутствуют; неожиданных cron bucket нет.
  Continuity read после локальной полной проверки в 12:27 UTC увидел уже 43
  terminal runs, по-прежнему 0 failed/running и пустые email/Telegram outboxes.
- Email/Telegram каждый раз завершились safe result `provider_disabled` до
  provider call. Семь maintenance jobs завершились `succeeded` с нулевыми
  claimed/processed/deleted/failed effects на пустых preview resources.
- Freshness в контрольной точке: every-minute job 19 секунд, maintenance job
  379 секунд. Дополнительно подтверждены safe counts: users 0, email outbox 0,
  Telegram outbox 0, manual-run audit 0, storage intents 0. Реальная отправка и
  создание synthetic/PII records не выполнялись.
- Remote manual-run не потребовался: automatic delivery уже дала прямое
  evidence, а manual UI корректно требует active admin, CSRF, confirmation,
  idempotency и audit. Bootstrap/admin exercise не входил в это разрешение.
- Это закрывает preview automatic delivery/freshness, но не alert ownership,
  missed-Cron/stale-lock/dead/dedupe failure injection, remote manual-run/RBAC и
  incident rehearsal. Соответствующие PR-D gates и общий NO-GO остаются
  `blocked`.

## Preview monitoring preparation 2026-08-11

- Актуальная Cloudflare документация проверена до implementation: на Free plan
  нет native per-Worker missed-Cron/repeated-runtime-error alert. Workers Logs и
  Metrics доступны, но active Health Check notification требует Pro+, traffic
  error-rate alert — Enterprise, Tail Worker — Workers Paid. Поэтому один Worker
  не считается независимым наблюдателем собственного отсутствующего Cron.
- Добавлена только forward migration `0015_worker_monitoring.sql`: application
  fetch exception/5xx агрегируются в PII-free UTC minute buckets без route,
  request ID, error text или payload; bounded maintenance удаляет buckets старше
  7 суток. Applied migration `0014` не изменялась.
- `GET|HEAD /_health/operations` возвращает только empty `204|503`, `no-store` и
  `noindex`. Пороги: every-minute jobs 180 секунд, maintenance jobs 1200 секунд,
  stale `running` 360 секунд, repeated scheduled/application errors — 3 за 900
  секунд. Missing D1/query/invalid freshness fail closed как 503;
  `feature_disabled` считается terminal Cron delivery, но не включает feature.
- Нормальный Worker fetch сохраняет native exception semantics: uncaught error
  после best-effort counter снова выбрасывается; 5xx counter записывается через
  tracked `waitUntil`. Endpoint не отправляет Resend/Telegram и не меняет ни
  одного feature flag.
- Targeted migration/monitoring regression прошёл: 3 files, 14/14 tests. Полный
  regression: 46 files, 267/267 tests; `npm run check` — 0 errors/warnings;
  build, `docs:check`, `release:scan` (474/474) и `git diff --check` passed.
- Preview remote apply/deploy выполнены по прямому разрешению. D1 migration list
  после `0015` — pending 0; Worker version
  `sha256:70c02839d41d`, ignored config SHA-256 остался
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`.
  GET/HEAD `/_health/operations` вернули 204, 0 bytes, `no-store`/`noindex`;
  POST — empty 405 с `Allow: GET, HEAD`. Safe D1 snapshot: 0 monitoring error
  buckets/errors, 98 `feature_disabled`, 21 `succeeded`, email/Telegram outbox 0.
  Secret names остались JWT/Turnstile/Resend; значения не читались.
- Все прежние feature flags сохранены, real email/Telegram send не выполнялся.
  Кратковременный read-only D1 preflight один раз получил API `7403`; повторные
  whoami/account/D1/migration checks сразу прошли, remote mutation до recovery не
  запускалась.
- Владелец подтвердил создание и email-verification UptimeRobot Free account с
  включённой 2FA. Создан независимый HTTP(s) monitor
  `Kolibri registration preview - Cron/Worker health` для canonical
  `/_health/operations`, интервал 5 минут, account notification contact получает
  DOWN и UP. Фактический HTTP method — `HEAD`: UptimeRobot Free UI не разрешил
  планировавшийся `GET`, а endpoint поддерживает эквивалентный empty `HEAD`
  signal со статусами `204|503`.
- Первый dashboard state `Up` подтверждён владельцем. Независимая read-only HEAD
  проверка `2026-08-11T14:22:28Z` вернула 204, 0 bytes, `no-store`/`noindex`.
- Provider `Test Notification` без temporary monitor доставил account contact
  synthetic DOWN и сразу следующий UP. Recovery notification содержит UTC
  timestamp `2026-08-11T14:13:22Z`; synthetic DOWN incident timestamp/duration
  provider обозначил как unavailable, поэтому отдельное выдуманное время не
  записывается. Владелец подтвердил получение обоих сообщений в правильном
  порядке и recovery. Application feature flags, Resend/Telegram и Cloudflare
  resources не изменялись. PR-D06 переведён в `passed`.

### Post-PR-D06 immutable verification и dependency remediation

- На clean HEAD `b1a15058c7d41cb226ef34c83e3f6692f8c198d6` полный
  `npm run release:verify` прошёл: check 0 errors/warnings, 46 test files и
  267/267 tests, 3/3 Playwright, build, production audit 0, `docs:check`
  137 links/51 files + 82 commands и `release:scan` 474/474. Exact
  `wrangler deploy --dry-run --config wrangler.preview.toml` также прошёл без
  upload/deploy и подтвердил ожидаемые preview bindings/flags.
- Отдельный clean clone exact `b1a15058c7d41cb226ef34c83e3f6692f8c198d6`
  прошёл `npm ci`. Полный audit baseline выявил 7 исправимых dev-only findings;
  production dependencies оставались clean.
- В изолированном clone проверено обновление SvelteKit, PostCSS, Wrangler,
  Miniflare и Workers types. Breaking Miniflare 5 options boundary мигрирован
  через `convertV4MiniflareOptions`; старый global `cookie` override сужен до
  SvelteKit, чтобы не переопределять `youch` dependency.
- После повторного clean `npm ci` полный и production-only audit показывают 0.
  Обновлённый candidate прошёл полный `release:verify` с теми же 267 tests и
  3 Playwright tests. Проверенные изменения перенесены в основной worktree, но
  ещё не являются immutable commit; remote resources не менялись.
- Основной worktree затем повторно прошёл полный `release:verify` за 253.1 s:
  0 diagnostics, 46 files/267 tests, 3/3 Playwright, build, production audit 0,
  137 links/51 docs files, 82 commands и release scan 474/474. Полный audit
  также 0; `npm ls cookie --all` подтвердил отдельные совместимые ветки.
  Wrangler 4.120.1 exact preview-config dry-run прочитал 68 assets и ожидаемые
  bindings/feature flags, завершившись до upload/deploy.
- По отдельному разрешению создан commit
  `63995f8532f45441885d7e3b042f4092471a8bc3` (`chore: remediate release tooling
advisories`). Новый exact clean clone прошёл `npm ci`, полный audit 0 и полный
  `release:verify` за 264.2 s: 46 files/267 tests, 3/3 Playwright, build,
  production audit 0, 137 links/51 docs files, 82 commands и clean-clone release
  scan 410/410. Clone остался на exact SHA без tracked changes.

### Public preview browser/accessibility smoke

- После первоначальной ошибки in-app Browser использован доступный Chrome
  DevTools MCP. Пользовательская browser session, cookies и authentication не
  требовались и не читались.
- Home, catalog, register, login, forgot и resend открылись на canonical preview
  origin с document status 200. Семантические snapshots подтвердили немецкие
  titles, один `h1`, `main`, именованные navigation/footer и доступные имена
  form controls. Auth registration оставалась явно disabled.
- Home и register прошли desktop/mobile Lighthouse: Accessibility 100, Best
  Practices 100, Agentic Browsing 100. На 390×844 horizontal overflow отсутствует;
  keyboard order проходит navigation, поля формы, checkbox и footer links с
  видимым solid amber focus outline.
- Lighthouse SEO 91 воспроизводимо указал только отсутствующий meta description;
  первый home load также записал единственный console error из-за
  `/favicon.ico` 404. Остальные проверенные страницы не имели console warnings/
  errors, все application assets вернули 200.
- В browser-fix candidate добавлены общий немецкий meta description, SVG favicon и E2E
  regression для обоих ресурсов. Targeted i18n 3/3 и Playwright 3/3 passed.
  Полный working-tree `release:verify` прошёл за 264.1 s: 46 files/267 tests,
  3/3 Playwright, build, production audit 0, docs и release scan 476/476.
- Commit `5a982ee48c3ea262d1851a4ce966a9f88d67ecee` прошёл в новом clean clone:
  `npm ci`, полный audit 0 и `release:verify` за 298.2 s; 46 files/267 tests,
  3/3 Playwright, build, docs и release scan 412/412. Clone остался чистым.
- Post-fix Chrome re-audit локального candidate подтвердил на desktop и mobile по 100 для
  Accessibility, Best Practices, SEO и Agentic Browsing; failed audits 0,
  console warnings/errors 0, `/favicon.svg` 200. Временный dev server после
  проверки остановлен.
- По отдельному разрешению exact commit развёрнут без миграций в существующий
  preview Worker как version `sha256:73d63af740da` на 100%.
  Config SHA-256 не изменился, D1 pending migrations 0, оба Cron сохранены.
  HEAD health вернул empty 204 с `no-store`/`noindex,nofollow`; home, catalog и
  пять auth-boundary routes вернули 200, favicon — 200 `image/svg+xml`.
- Deployed Chrome navigation audit на desktop и mobile дал по 100 для всех
  четырёх категорий и 0 failed audits. Console warnings/errors отсутствовали,
  все browser assets вернули 200. На register 390×844 overflow и controls вне
  viewport отсутствовали; Tab прошёл navigation и поля с видимым amber outline.
- Deployed root HEAD сохранил безопасный allowlisted `X-Request-Id`. Три
  ограниченные Wrangler tail попытки с version/method/self-IP или opaque-header
  filters не получили event до timeout; процессы остановлены, temporary raw
  files удалены. Последующий Workers Logs export доказал, что все четыре exact
  probe присутствуют в stored logs на deployed version: проблема была в
  автоматизированном live-tail capture, а не в Worker observability.
- Read-only review внешнего export evidence (2 394 018 bytes, SHA-256
  `28EC30B78F806C1497F425D7FE6DED115819F7DD281419D383E8304287D2E4D1`) охватил
  1001 record за 2026-08-11 12:10:17Z–21:59:16Z. Все 949 invocation outcomes
  были `ok`; 203 health HEAD вернули 204, 589 every-minute и 39 fifteen-minute
  Cron invocations завершились успешно. Raw export содержит platform IP/header/
  geo metadata и остаётся вне Git; прикладных email, bearer values или secret
  fields review не обнаружил.
- Review также выявил 52 ошибочно классифицированных structured error records:
  все имели HTTP 404 с outcome `ok` для отсутствующих generic crawler/browser
  ресурсов, но code `UNEXPECTED_SERVER_ERROR`. На deployed current version их
  четыре (`llms.txt`/`robots.txt`); прежний `favicon.ico` 404 после browser fix
  исчез. Локально `logServerError` теперь подавляет status ниже 500; regression
  подтверждает отсутствие `console.error` для 404 и один PII-safe structured
  record для 500. Полный локальный release-контур прошёл: check 0 diagnostics,
  46 files/269 tests, Playwright 3/3, build, production audit 0, docs checks и
  release scan 476/476.
- По отдельному разрешению создан commit
  `200268f39ece1d43c5e091dcb7db6569d41275af` (`fix: suppress expected 4xx error
logs`). Новый clean clone exact SHA прошёл `npm ci` с full audit 0 и полный
  `release:verify` за 266.2 s: check 0 diagnostics, 46 files/269 tests,
  Playwright 3/3, build, production audit 0, docs checks и release scan 412/412;
  clone остался чистым. На этой промежуточной точке PR-A15 оставался `blocked`
  только на remote части до отдельного preview deploy permission и stored-log
  recheck corrected version.
- По отдельному разрешению exact `200268f` развёрнут без миграций в существующий
  preview Worker как version `sha256:f4cd52e14dbd` на 100%.
  Config SHA-256 остался
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`, D1
  pending migrations 0, оба Cron сохранены. Wrangler dry-run до upload прочитал
  69 assets и подтвердил прежние bindings/feature flags.
- Post-deploy smoke 2026-08-12 11:30:56Z–11:31:07Z: health HEAD — empty 204 с
  `no-store`/`noindex,nofollow`; intentional missing route — 404; home, catalog,
  register/login/forgot/resend и favicon — 200. Новый live tail был подключён до
  повторных exact probes и увидел оба request ID на version `62b3cac4…`: 404 и
  204 с outcome `ok`; во всём bounded capture `UNEXPECTED_SERVER_ERROR` не было.
  Первая из этих post-fix tail попыток была корректно отклонена локальным
  Wrangler из-за `--sampling-rate 1` (разрешённое значение должно быть меньше
  1), затем повтор без sampling flag прошёл; это не Worker/runtime fault.
- Владелец предоставил bounded stored Workers Logs export после deploy: 163 730
  bytes, SHA-256
  `c2c138919b7b9366502158735f43146dc0b1ca26001a1116e0fa8cb1efcdc87a`, interval
  2026-08-12 11:12:16Z–11:42:33Z. Все 60 records — `cf-worker-event`, outcomes
  `ok`, truncation 0; 26 fetch и 34 scheduled. Exact 404 probe в 11:36:33.537Z
  имеет GET/404/outcome `ok`, а exact health probe в 11:36:33.868Z —
  HEAD/204/outcome `ok`; оба относятся к version `62b3cac4…`.
- В stored export нет custom application log records и нет
  `UNEXPECTED_SERVER_ERROR`; следовательно ordinary 404 больше не создаёт
  ложный structured server error. Raw export содержит platform request metadata,
  остаётся вне Git и не копируется в evidence. Совместно с unit regression,
  immutable clean-clone verification, предыдущим PII-safe stored-log review и
  current live-tail result это переводит PR-A15 в `passed` 2026-08-12.

### Fresh Ultra PR-A06 audit и local authenticated E2E

- Fresh repository-wide Ultra audit 2026-08-12 проверил тогдашние 91/91
  нормативных MVP IDs и все 166 acceptance bullets. Для 37 bullets без embedded requirement ID
  заведены stable matrix IDs; implementation и automated-test paths сверены с
  текущим code/spec, а environment gaps отделены от local trace status.
- Audit выявил HIGH defects в dual-role/dual-control переходе parent→admin и
  configured upload concurrency/ambiguous-commit обработке, а также скрытые из
  deploy source privacy-download handlers и неполные parent role-route
  boundaries. Исправления покрыты точными unit/integration negative,
  atomicity/concurrency и safe-404 tests. Независимый финальный re-review не
  нашёл оставшихся HIGH/BLOCKER implementation/coverage discrepancies.
- Полный текущий dirty-worktree `npm run release:verify` прошёл за 487.3 s:
  check 0 errors/warnings, Vitest 53 files/327 tests, local Chromium 2 files/8
  tests, build, production audit 0, docs 136 links/51 files + 82 executable
  commands и release scan 492/492.
- Initial PR-A06 Chromium baseline дал пять authenticated и три foundation
  cases: role-aware redirects, parent ownership/request cross-user failure,
  role-route separation, tampered/revoked sessions, admin block и 390px
  keyboard/no-overflow path. Это историческая точка 8/8 до post-audit expansion,
  которая зафиксирована следующим разделом.
- Поэтому PR-A06 переведён в `passed`, а PR-A12/13/14 остаются `blocked` с
  уточнённым residual scope. Этот результат относится к проверенному
  незакоммиченному worktree: immutable HEAD всё ещё
  `200268f39ece1d43c5e091dcb7db6569d41275af`; новый immutable release candidate
  без отдельного разрешения не создавался.

### Intermediate post-PR-A06 local browser expansion

- Новый local-only Chromium run прошёл 13/13: шесть authenticated
  access/session/CSRF/IDOR cases, три accessibility cases, один individual
  request lifecycle и три foundation cases. Individual request прошёл полный
  browser путь create→submit→admin approve→parent approved 1/1.
- Cross-parent matrix проверяет child/request, document download/delete,
  contract detail/artifact, price response, message append/close и
  privacy export. Foreign reads/mutations дают безопасный результат, а
  owner-visible state остаётся неизменным; typed safe-404 regression и focused
  documents D1 suite 16/16 также прошли.
- Axe 3/3 выполнен без отключения default rules на public registration,
  authenticated parent cabinet и admin detail. Наблюдаемые raw results:
  `violations=[]`, `incomplete=[]`; German structure/labels и visible keyboard
  focus также проверены.
- Полный uninterrupted `npm run release:verify` после расширения прошёл за
  353.3 s: check 0 errors/warnings, Vitest 53 files/327 tests, Playwright 4
  files/13 tests, build, production audit 0, docs 136 links/51 files + 82
  commands и scan 494/494. Отдельный полный `npm audit` вернул 0.
- Harness cleanup подтверждён: `.wrangler/e2e-runtime/runtime.env` отсутствует,
  а pre-existing `.wrangler/state` не менялся (latest timestamp
  `2026-08-12T11:14:19Z`). Независимый read-only re-review не нашёл
  HIGH/BLOCKER. Evidence остаётся локальным и относится к незакоммиченному
  worktree; remote resources не использовались и не менялись.

### Final local PR-A12/13/14 expansion

- Финальный isolated Chromium run прошёл 8 files/18 tests: шесть authenticated
  access/session/CSRF/IDOR, четыре accessibility, три foundation и по одному
  lifecycle для individual request, catalog/trial, support, structured absence
  и price review. Request прошёл draft→submit→admin approve→parent approved;
  catalog показал exact €46, trial прошёл requested→admin confirmed→parent
  cancelled; support и absence сохранили final admin reply, parent reread и по
  одному pending email/Telegram outbox delta; price item €46→€50 прошёл exact
  parent acceptance и distinct admin confirmation до `scheduled`, сохранив €46
  как текущую цену до effective date.
- Browser contract accept/form/activate не заявляется: `CONTRACT_RENDERER` и
  `CONTRACT_SEND_ENABLED` намеренно disabled. Browser contract evidence
  ограничено foreign detail/artifact и carrier-bound active end/attendance/media
  denial без owner-state mutation.
- IDOR matrix теперь включает missing/wrong/valid CSRF; request save/submit/
  cancel; document download/delete и mismatched request carrier; trial create/
  cancel; contract detail/artifact/end/attendance/media и mismatched offer
  carrier; price response; message append/close; privacy artifact и forged
  subject fields, которые остаются self-scoped. Direct route tests различают
  safe 404 и owned validation/state 409; rendered SvelteKit form transport
  проверяется по semantic denial и неизменному owner state.
- Contract atomicity/replay focused selection прошла 6/6, полный contracts D1
  suite 13/13: exact statutory withdrawal replay после terminal state требует
  current owner, matching contract/offer/hash и passed assertion; eligibility
  race полностью откатывает attendance/media evidence; concurrent identical
  attendance/media/end оставляет одну asserted chain. Independent final
  re-review дал GO без HIGH/BLOCKER.
- Accessibility 4/4 выполняет все default-enabled axe rules и проваливается при
  любой записи в `violations` или `incomplete`; проверены inline login error
  association/announcement/focus, 390px parent/admin no-overflow и deterministic
  640px 200%-zoom-equivalent registration reflow. Literal/manual zoom,
  assistive-technology и manual glyph/font review остаются обязательными.
- Финальный `npm run release:verify` прошёл за 619.5 s: check 0/0, Vitest 54
  files/340 tests, Playwright 8 files/18 tests, build, production audit 0, docs
  136 links/51 files + 82 commands и scan 500/500. Отдельный полный `npm audit`
  вернул total 0. Port 4173 свободен, `.wrangler/e2e-runtime/runtime.env`
  отсутствует, pre-existing `.wrangler/state` не менялся.
- Эта историческая локальная ревизия позднее была зафиксирована как clean
  baseline `c5712d0`; приведённая выше pre-commit verification относится именно
  к ней и не переносится на Access/Telegram resulting candidate. Deployed preview
  остаётся на `200268f39ece1d43c5e091dcb7db6569d41275af`. Deploy, migrations,
  provider sends, feature enablement и другие remote mutations при подготовке
  baseline не выполнялись.

### Mandatory Access/PlusBText and Telegram readiness expansion 2026-08-14

- User-directed continuation established `c5712d06af217129f0344864b69ddda962c29d19`
  as the clean baseline. It does not contain the complete required work below;
  the new immutable candidate lineage through `8f247e5` now exists and passed
  exact-SHA clean-clone verification. Independent exact-SHA review remains
  pending. Existing deployed preview remains `200268f` / `62b3cac4…`.
- Current Access source was previously inspected only through the non-executing
  allowlisted parser: sanitized result 1703 rows, 21/21 required fields,
  `access-tblkartei:v1` compatible. No source row/path/hash is recorded here and
  no D1 import was performed.
- Value-free inspection established that current PlusBText still conforms to
  `admin-xlsm-plusbtext:v1`. The earlier `PLUSB_HEADER_CONTRACT_MISMATCH` was a
  parser sanitizer false mismatch around a styled self-closing empty cell that
  consumed the following populated cell, not source-contract drift. PR-B12 tracks
  focused/current-source regression plus full immutable verification; v1 is not
  silently relaxed and any true future contract change still requires a new
  approved version.
- The resulting local candidate implements the PR-B13/PR-B14 command and D1
  boundary: schema-v3 no-write plan with `sourceClass`/`syntheticFixtureId`,
  inactive stage,
  digest-bound independent review, target/plan/review-bound recovery artifact,
  recovery-bound atomic Access+PlusBText CAS promote, safe planned/actual-count
  verify, rollback and roll-forward. Preview generates its own deterministic
  1703-row `legacy-preview-synthetic-baseline-v1` /
  `legacy-preview-synthetic-candidate-v1` bundles and rejects Office
  paths; production
  requires both read-only sources. Candidate migrations `0016` and `0018` add
  append-only release/event control, pairwise planner/stager/reviewer separation,
  transition-actor separation from reviewer, recovery-verifier separation from
  planner/stager/reviewer/promoter,
  immutable count contract and exact-actor failed-stage cleanup.
  Populated `0016`→`0018` regression also proves that grandfathered plans with
  `NULL` actor fields or `{}` contract remain immutable but fail closed for
  every lifecycle transition; they must be replaced by a new hardened plan.
  Final focused legacy validation passed 13/13 integration and 38/38 unit
  tests; migration-upgrade and normal release-lifecycle subsets passed 3/3 and
  2/2.
  Deployed preview remains on `0001`–`0015`; neither migration nor a remote
  command was authorized/executed. Production transitions remain fail-closed
  before API-token lookup/network pending remote transaction evidence.
- First import has no previous-version rollback target. Before the first remote
  promote, a recovery bookmark/pre-import backup and isolated restore to the
  no-current state are mandatory. Direct SQL/delete is not recovery.
- Telegram remains externally fail-closed, while the resulting local candidate
  implements the PR-F12/PR-F13 core: one-way `TELEGRAM_PROVIDER=bot_api`, strict
  minimized payload, bounded Bot API policy, append-only dispatch evidence and
  terminal `delivery_unknown` (`TELEGRAM_DELIVERY_UNKNOWN`). Unknown/retry/dead
  stops the drain; `429` persists destination cooldown even without usable
  `retry_after`; activation cutoff keeps historical backlog out; unresolved
  unknown or terminal dead blocks later sends and alerts;
  operator uses exact-attempt audited `confirm_sent`, `retry_after_review` only
  after verifying absence, or `cancel`. No provider call was made.
- Valid Bot API `ok=false` `408|425|5xx` is conclusive retryable. Network/
  timeout/unreadable/oversized/malformed/non-`ok=true` ambiguous envelope,
  invalid/mismatched success, destination mismatch or lost post-send D1
  confirmation is ambiguous and becomes `delivery_unknown`; a local fake
  ambiguous test is not evidence that the real preview send was ambiguous.
- Telegram preview evidence requires a separately authorized single synthetic
  send plus failure/unknown operator drill, with no client/child/document/free
  text and no token/chat/body/provider diagnostic in evidence. No provider send,
  secret/config change, deploy, migration or remote import was authorized by
  this documentation update.
- The local PR-F14 boundary also implements D1-only
  `telegram:smoke:abort`: only an exact target-bound unsent `pending` or partial
  zero-attempt `processing` cohort can become `cancelled`, with append-only
  authorization/assertion. Cron cannot reclaim the smoke signature; any
  dispatch attempt or terminal row fails closed. Manifest/evidence writers use
  POSIX `0600` or a protected Windows ACL whose sole allow rule grants current
  SID `FullControl`. До final reconcile change focused Telegram verification
  passed 8 files/91 tests and `check:src` 0/0; no remote D1/provider operation
  occurred.
- Final local smoke hardening additionally provides
  `telegram:smoke:reconcile` for a crash after durable `dispatch_started`: exact
  target/cohort and expired lease are mandatory; the D1-only command has no
  Telegram secrets/preflight/send/retry path and idempotently records one
  `delivery_unknown` attempt for ordinary audited manual resolution. Active
  lease, wrong proof, new `run` or abort fail closed. Focused crash test and the
  full preview-smoke D1 suite passed 1/1 and 7/7; this command was not run
  against remote D1.
- Final mutable-worktree verification on 2026-08-14 passed: `npm run check`
  0 errors/warnings; Vitest 63 files / 471 tests; Chromium 18/18; production
  build; `npm audit --omit=dev` with 0 vulnerabilities; documentation 143
  links in 51 files plus 105 executable commands; release scan 522/522; and
  `git diff --check`. This mutable result was strong local evidence only; the
  subsequent clean-clone result below supersedes it for the exact-SHA checks.
- Exact-SHA clean clone of `8f247e5` subsequently passed `npm ci` and the full
  `npm run release:verify` in 563.9 s: check 0/0, Vitest 63 files / 471 tests,
  Chromium 18/18, build, production audit 0, documentation 143 links in 51
  files plus 105 commands and fresh-clone scan 458/458. At that historical
  checkpoint PR-A16 still awaited the later `a590d1f` independent verdict,
  which is now recorded in the 2026-08-17 checkpoint below.
- These new rows remain `blocked` after local implementation until an immutable
  candidate and exact target-pinned preview evidence exist. Legal/provider approvals, restore/RPO/RTO,
  production resources/origin, remaining browser/manual gates and explicit
  production permissions independently preserve the overall **NO-GO**.

### Read-only preview and current-source checkpoint 2026-08-17

- Parent `ca4ef8f50ea0ffc1139c2ec3d286cbdb7e4158ec` adds strict Access OLE
  Automation date-serial handling and passed exact-SHA clean-clone `npm ci` plus
  full `release:verify` in 556.4 s. At that historical checkpoint, exact
  deploy/runtime candidate `a590d1f` then passed full clean-worktree
  `release:verify` in 522.9 s: check 0/0,
  Vitest 63 files/472 tests, Chromium 18/18, build, production audit 0, docs 143
  links/51 files plus 105 commands and scan 522/522.
- Independent read-only exact-SHA review of `a590d1f` found no code HIGH/BLOCKER
  across migrations `0016`–`0018`, exact-target import/PII boundaries, strict
  Access OLE parsing and Telegram delivery certainty/minimization/operator
  flows. Evidence is recorded in docs-only seal
  `7292d6ff1dbc67f20c7f803e9da1cdb51c8aa322`. PR-A16 is passed locally; this
  does not transfer historical preview evidence or close any external gate.
- Read-only public and Wrangler inventory confirmed root HEAD 200 and
  operations-health HEAD 204. Preview still runs historical `200268f` as Worker
  version `sha256:f4cd52e14dbd` at 100%; candidate
  `a590d1f` is not deployed.
- Remote preview D1 remains without an academic period, users, import runs,
  current PlusBText/Access snapshots or Telegram outbox rows. Candidate
  migrations `0016`–`0018` are pending. A current Time Travel bookmark exists,
  but a protected backup plus independently verified isolated restore is not
  evidenced. No migration/import/restore was executed.
- Fresh read-only non-executing current-source parsing confirmed strict
  `admin-xlsm-plusbtext:v1` with 302 rows, 164 old groups, 138 targets, 61
  warnings and no error/fatal; and strict `access-tblkartei:v1` with 1703 source
  rows and 21/21 required fields. The first Access aggregate projection reported
  580 families, 713 children, 929 enrollments and 1429 warning occurrences; that
  warning count was later shown to contain normalization false positives and is
  retained only as historical evidence. No row values, PII, source hashes or
  Office contents were emitted.
- Data-owner clarification on 2026-08-17 established `IMPORT-07`: future-period
  `O/R/S/T` are group/imported current price/contract marker/activity code;
  `KN` is inactive; `NH/N/IND` are hourly; an `O/V`/`V/O` token in `S` is
  monthly and blank/other `S` is yearly. Parent names accept one semicolon,
  comma or space separator; slash/multipart stays manual. Missing duration and
  zero price do not block hourly/inactive rows, positive `R` wins for an
  existing legacy service, invalid email never auto-claims and invalid birth
  date never creates a child/enrollment.
- After implementing those rules, the same allowlisted source produces the
  sanitized aggregate 580 families, 713 children and 809 real enrollments, with
  160 issue occurrences and 53 enrollment reviews. The remaining safe classes
  are 30 complex parent names, 36 active-group durations, 32 invalid emails, 26
  invalid/missing birth dates, 21 family contact conflicts, six exact duplicate
  buckets, three child-identity anomalies, two Access ID-mirror consistency
  aggregates, two invalid and one missing active-group price, one active
  unresolved group. `OQ-029` is closed: package groups are only `AK–AN` and
  `AP–AS`; `AT/Value46` is retained by the current future-period extract but
  never a group, while `AO/Value41` is outside that allowlist and must be ignored
  if current-block import is added. `OQ-035` records that the unresolved
  group is an upstream correction case and must not be fuzzy-mapped.
- `IMPORT-08` and `AC-IMPORT-27`–`31` are now implemented locally by migration
  `0019`, stable PII-free cases/occurrences, append-only typed decisions and
  assertions, reimport persistence/reopen/resolved evidence, repository/D1
  generic-closure denial, assignment/homogeneous batch, typed duplicate and
  existing-tool evidence flows, `/admin/import-reconciliation` queue/export and
  release/registration fail-closed gates. External preview and owner/admin
  evidence are still absent.
- The resulting worktree passed `npm run check` with 0 errors/warnings, all 63
  Vitest files/478 tests, production build, docs check with 151 links/52 files
  plus 105 commands, release scan 523/523 and `git diff --check`. This is strong
  local worktree evidence, but it is not yet an immutable exact-SHA candidate or
  an independent review and does not authorize any remote action.
- The available protected preview config is Git-ignored but lacks the separate
  pinned `account_id`/`preview_database_id` control binding required by the
  remote import runner. This is a correct fail-closed boundary, not a reason to
  weaken exact-target validation.
- Ordinary preview remains a synthetic/no-PII rehearsal target. Uploading the
  current Access/Admin PII into that public preview is not authorized by an
  import request alone. If real-data rehearsal is required, the data/privacy
  owner must approve a separate locked-down PII target with public auth and
  external providers disabled, explicit retention/cleanup, a recovery point
  and independently verified isolated restore.
- Preview runtime remains fail-closed for public auth, email, Telegram, upload,
  contract renderer/send, public contract functions and online-media grant.
  Scheduled jobs are enabled. Secret-name-only inventory found no
  `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID`; the owner-reported private channel
  invitation does not establish bot identity, numeric channel ID or posting
  permission. No secret value was read and no Telegram request/send occurred.
- No deploy, remote migration, remote import/stage/promote, backup restore,
  secret/config mutation, provider send or production/CMS action occurred in
  this checkpoint. Overall status remains **NO-GO**.

## Release gates

Полный ledger: [PRODUCTION_READINESS_CHECKLIST.md](../../operations/PRODUCTION_READINESS_CHECKLIST.md).

| Gate                              | Статус                         | Evidence / next action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Owner                                                                    |
| --------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Local implementation/traceability | `passed`                       | PR-A06 historical audit covered 91/91 MVP IDs and 166 acceptance bullets/37 stable untagged mappings. Historical exact candidate `a590d1f` maps 99/99 IDs and 175 bullets and passed its narrower review. Exact `8c6e2a` was rejected with 2 BLOCKER/2 HIGH; exact `b2e8548f` with 1 BLOCKER/1 MEDIUM. Runtime anchor `abb93f25` passed the full chain; docs/test remediation anchor `4ac6a491` passed proportional gates. Final exact docs-only review seal `2bedc73c` passed short gates and its separately authorized independent read-only review returned GO without BLOCKER/HIGH, with one MEDIUM test-isolation residual and no runtime bypass | Local exact-SHA gate complete 2026-08-19; external gates remain separate |
| Dependency security               | `passed`                       | immutable `200268f`: clean install, full audit 0, full release verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | dependency/security owner                                                |
| Environment/origin/R2 isolation   | `blocked`                      | preview Worker, D1 exact `0001`–`0023`, private EU R2 and current empty-state restore verified; exact preview hostname is protected by Access with exact two-principal OTP Allow, 168h manual policy session, one-token Service Auth and no Bypass. Custom/production origin/resources remain absent                                                                                                                                                                                                                                                                                                                                                  | Cloudflare/security owner                                                |
| Scheduled monitoring              | `passed`                       | preview Cron + external 5-minute HEAD monitor; DOWN→UP test delivery/recovery confirmed 2026-08-11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | operations owner/account contact                                         |
| Admin bootstrap/recovery          | `blocked`                      | local one-shot passed; remote clean-room and recovery drill                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | security/operations owner                                                |
| Current legacy import             | `blocked`                      | Synthetic/no-PII baseline and candidate lifecycles passed with independent roles on schema `0001`–`0023`. Fresh candidate-current backup/full isolated restore, promote, idempotent repeated-promote reconciliation, rollback and roll-forward are verified; one current candidate pair has PlusBText `2`, Access/projection `1703`, issues 0 and FK/dependency/reconciliation passed. Admin cold-read, authenticated lookup and any real/current-data import remain absent                                                                                                                                                                           | import/admin/data/backup/privacy owners                                  |
| Public auth/email                 | `feature_disabled`             | scoped key/secrets installed; enablement, real-token and delivery smoke absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | auth/provider owner                                                      |
| Telegram                          | `feature_disabled` / `blocked` | fail-closed deployed evidence and historical exact `a590d1f` verification/independent review exist; local `bot_api`/delivery-certainty/operator implementation and tests exist. Preview bot/chat secrets are absent; the channel invitation alone is not target evidence. Dedicated bot ownership, exact numeric destination/permissions, preflight, authorized synthetic normal-outbox smoke and operator rehearsal remain absent                                                                                                                                                                                                                    | provider/privacy/reliability/operations owners                           |
| Upload                            | `feature_disabled` / `blocked` | implementation и preview private-EU R2 split существуют; `OQ-036` требует реальный synthetic upload/quarantine/forced-download/local-AV/hash-attestation/business-review/cleanup lifecycle до full manual preview. Production training/privacy approval остаётся отдельным gate                                                                                                                                                                                                                                                                                                                                                                       | preview storage/security operator; затем production owners               |
| Contract/statutory/media          | `feature_disabled` / `blocked` | contract lifecycle, generic synthetic templates и Browser Run adapter существуют; до full manual preview нужны отдельный `preview_review` scope, четыре production-candidate Browser Run/R2/email artifacts и минимум один полный synthetic formation lifecycle. Финальное template/legal approval блокирует только production. Statutory/media production paths остаются отдельно fail-closed                                                                                                                                                                                                                                                        | preview contract/review owners; затем production legal/privacy owners    |
| Backup/restore/RPO/RTO            | `blocked`                      | One-off pre-candidate D1 protected export/full isolated restore and current empty-state R2 restore passed 2026-08-20. Plan-bound recovery was revalidated through `0023` before baseline publish. Fresh 2026-08-25 candidate-current DPAPI export/new isolated EU D1 restore passed exact export↔restore schema/per-table/migration/current-pair verification and local `quick_check=ok`. RPO/RTO, cadence/retention, reusable non-empty R2 mechanism and application critical-path smoke remain absent                                                                                                                                               | data/backup/operations owners                                            |
| Synthetic browser lifecycle       | `blocked`                      | local Chromium 8 files/18 tests covers request, catalog/trial, support, structured absence and price review through `scheduled`; Browser contract accept/form/activate is not claimed. Register/verify/claim, funded upload/document review, enabled contract lifecycle, price admin-send/apply and preview/provider auth remain                                                                                                                                                                                                                                                                                                                      | product/release owner                                                    |
| Accessibility/browser             | `blocked`                      | public preview smoke plus local strict accessibility 4/4: all default axe rules, empty `violations`/`incomplete`, inline-error semantics, 390px parent/admin and 640px zoom-equivalent reflow passed; literal/manual zoom, assistive-technology, glyph/font and remote auth review absent                                                                                                                                                                                                                                                                                                                                                             | UX/accessibility owner                                                   |
| Permission/IDOR/browser           | `blocked`                      | local authenticated 6/6 plus trial branches, exact route tests and focused D1 cover request/document/trial/contract-end-attendance-media/price/message/privacy with carrier-bound safe 404, owned 409, unchanged owner state and atomic rollback/replay; enabled contract decision, disabled upload, remaining enrollment/group-service and guessed/admin-purpose variants plus preview remain                                                                                                                                                                                                                                                        | security owner                                                           |
| Legal/privacy/provider            | `blocked`                      | external approvals absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | authorized owners                                                        |
| Production deploy                 | `blocked`                      | NO-GO + direct approval absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | authorized release owner                                                 |
| Official-site links               | `blocked`                      | exact surfaces/old values/separate permission absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | authorized site owner                                                    |

## Отдельно разрешаемые production/site действия

Каждый пункт требует отдельного прямого поручения и exact targets:

1. Cloudflare remote resources, DNS и TLS;
2. preview deploy/migration/provider/Cron/Browser smoke;
3. production D1 migration;
4. production Worker deploy или rollback;
5. remote import plan/read-only review, inactive stage, immutable review,
   promote, verify,
   rollback/roll-forward and restore are separately scoped; real PII import has
   its own data/privacy approval and is forbidden in ordinary preview;
6. email/Telegram enablement, secret/config mutation and each real external send,
   including one synthetic preview smoke, are separately scoped;
7. upload/contract/media/statutory enablement;
8. production backup/restore;
9. изменение CMS, ссылок или страниц официального сайта.

Разрешение одного пункта не разрешает остальные.

## Следующие действия

1. Ближайший отдельный gate — independently reviewed preview auth/email
   candidate и отдельное exact разрешение на Worker deploy/enablement. Он не
   разрешает bootstrap, Telegram, Office/PII, production или site action;
   email smoke ограничивается заранее согласованными test recipients. После
   двух verified accounts и one-shot bootstrap продолжение не останавливается:
   обязательны реальные contract/email, Telegram и upload/manual-review preview
   blocks из `SYS-04`/`OQ-036`.
2. Не повторять full/focused chain `4ac6a491` без нового
   `src`/`migrations`/`tests` diff. Exact `2bedc73c` short gates уже прошли.
3. Exact `2bedc73c` independent review уже завершён GO. При следующем изменении
   candidate не наследовать этот verdict; один MEDIUM stale-action fixture gap
   исправлять только как отдельный локальный test change с новым immutable SHA
   и новым отдельно разрешённым review.
4. Cloudflare Access perimeter уже защищает exact preview hostname, оба manual
   OTP smoke прошли, manual policy session увеличена до 168h. Owner подтвердил
   revoke temporary Cloudflare API token; exact local DPAPI copy удалена и
   локально невосстановима. Agent service token удалить/rotate после
   автоматических preview-проверок, не позднее его expiry.
5. Protected exact-target control config подготовлен, локально проверен и
   получил independent read-only GO без BLOCKER/HIGH/MEDIUM. Auxiliary SHA/origin
   vars не заменяют canonical plan/clean-HEAD guard; при изменении HEAD их нужно
   повторно сверить. Synthetic baseline/candidate import, backup/restore и
   migration gates завершены в отдельно разрешённых scopes; deploy, real-data
   import, secret mutation и provider send остаются раздельными permissions.
6. Продолжить безопасный local PR-A12 scope для оставшихся lifecycles:
   register/verify/claim, funded Nachhilfe upload/document review, enabled
   production-candidate preview contracts через Browser Run/R2/email,
   accept/form/activate/certificate, price admin-send и scheduled apply.
   Параллельно подготовить dedicated Telegram target/smoke package. Каждый
   preview deploy/provider send запрашивает отдельное exact разрешение только
   после полной локальной подготовки.
7. Для PR-A13 провести literal/manual zoom, assistive-technology и glyph/font
   review. Для PR-A14 закрыть disabled-upload mutation, оставшиеся
   enrollment/group-service и guessed/admin-purpose variants; preview matrix
   также требует отдельного разрешения.
8. Поддерживать independent uptime monitor для `/_health/operations` и
   периодически повторять delivery test; real-token Turnstile, synthetic email
   delivery/reply и другие provider sends требуют отдельных разрешений.
9. Получить RPO/RTO/cadence, реализовать non-empty R2 backup и пройти полный
   application critical-path restore smoke; candidate-current D1 restore и
   import rollback/roll-forward drill уже завершены.
10. Получить legal/privacy/template/provider/DPA/AVV inputs и approvals.
11. Провести full non-production bootstrap/runbook execution с approved preview
    resources; локальный content cold-read уже пройден.
12. Только после отсутствия `blocked` запросить отдельные production и site-link
    поручения.

## Session checkpoint 2026-08-12

- UptimeRobot Free account создан и защищён 2FA. Main HTTP(s) monitor активен на
  canonical preview health URL с фактическим методом `HEAD`, interval 5 minutes
  и DOWN+UP delivery на account notification contact; dashboard state `Up`.
- Provider test action доставил DOWN→UP pair, recovery timestamp
  `2026-08-11T14:13:22Z`; owner подтвердил оба сообщения. Отдельный temporary
  monitor не создавался. Read-only HEAD `2026-08-11T14:22:28Z` вернул empty 204.
- In-app Browser в этой сессии не был доступен; UptimeRobot UI ранее заполнил
  владелец. Public preview smoke позднее выполнен через Chrome DevTools MCP без
  user session; browser cookies/profile/OAuth storage не читались.
- Не повторять migration/deploy по истории чата. До любой новой remote mutation
  сначала сверить tracked handoff, `git status`, current version и pending
  migrations; production, DNS/CMS, feature enablement и application sends
  требуют отдельных прямых поручений.
- Post-deploy сверка этой сессии: HEAD `200268f`, preview config SHA-256
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`,
  Worker version `sha256:f4cd52e14dbd` на 100%, D1 pending
  migrations 0; post-deploy HEAD вернул empty 204 с обязательными headers.
- Immutable logging-remediation candidate независимо проверен в clean clone:
  `npm ci`, full audit 0 и полный `release:verify` passed. Public deployed HTTP
  и bounded live-log smoke также passed; bounded stored-log confirmation
  получено, PR-A15 закрыт. Первый local authenticated subset прошёл 8/8 и затем
  до intermediate Chromium checkpoint 13/13; финальный local harness прошёл 8
  files/18 tests. Остаточные enabled lifecycles, remote authenticated,
  provider/manual и restore evidence остаются.
- Следующая remote mutation или production/site action требует нового прямого
  поручения соответствующего scope; stored-log review является read-only.

### Результат новой Ultra-сессии

- PR-A06 repository-wide audit выполнен и закрыт 2026-08-12. Matrix теперь
  является проверенным текущим source of trace claims, а не очередью на будущий
  audit; local trace gate не наследует статусы remote/provider/legal/restore
  gates.
- Следующими реально разблокированными локальными gates стали PR-A12/13/14.
  Изолированный Chromium harness теперь прошёл 8 files/18 tests с пятью
  lifecycle specs, strict accessibility 4/4 и carrier-bound cross-parent IDOR;
  Browser contract accept/form/activate не заявляется. Focused contract
  atomicity/replay прошёл 6/6, full contracts 13/13, independent re-review дал
  GO без HIGH/BLOCKER. Ledger намеренно сохраняет gates в `blocked` на точных
  residual lifecycles, manual accessibility, variants и preview evidence выше.
- Во время audit/development не выполнялись deploy, migrations, provider sends,
  feature enablement или создание remote resources. Commit также не выполнялся
  и по-прежнему требует отдельного прямого разрешения.
- Следующая remote mutation или production/site action требует нового прямого
  поручения exact scope. Историю preview PR-D06/PR-A15 не нужно повторять без
  нового основания; сначала сверять current version, pending migrations и этот
  ledger.

## Итог worktree

- At this historical 2026-08-17 checkpoint, the deploy/runtime candidate was
  `a590d1f08110c20b6f7b45294cb91a7be7b5a8e3 docs: record preview deployment
checkpoint`; its parent `ca4ef8f` contains the Access parser fix. Exact
  candidate local verification and independent PR-A16 review passed on
  2026-08-17. Every remote/external gate remains pending.
- The historical deployed preview still runs exact `200268f` as Worker version
  `sha256:f4cd52e14dbd`; no new deploy/migration/import/send or
  feature enablement occurred during the readiness documentation expansion.
- `docs/prompts/stage-13-continue-deployment.md` обновлён как ignored local
  accelerator для новой Ultra-сессии и не должен добавляться в Git.
- Read-only preview recheck 2026-08-17 confirmed historical version
  `sha256:f4cd52e14dbd` at 100%, root HEAD 200 and operations
  health HEAD 204. Remote D1 still has deployed migrations `0001`–`0015`, while
  `0016`–`0018` are pending; client/import/Telegram aggregate state is empty.
  Runtime flags remain fail-closed and preview Telegram secret names are absent.
  Secret values, client rows and deployment author identity were not read;
  remote mutation was not performed.
- Production/CMS/official-site actions не выполнялись.

## Continuation 2026-08-17: `IMPORT-08` local gate

- Continued from exact clean checkpoint
  `d6118d17d9b48b1c00e2bdc4e02390b2d67dd9b1`; no repeated deployment audit was
  performed. Wrangler remains `4.120.1`.
- Added append-only migration `0019_legacy_import_reconciliation.sql` with
  durable PII-free cases/occurrences, typed append-only decisions/assertions,
  strict state/version/actor/terminal guards, one transition per case version
  and D1 denial of generic actionable issue closure. Applied migrations
  `0001`–`0018` were not edited.
- Validated Access/PlusBText runs now materialize a stable manifest. Persistent
  issue evidence keeps one active case, failed reimport returns
  `ready_to_verify` to `open`, disappearance closes only
  `resolved_by_reimport`, and a known changed entity/source identity explicitly
  supersedes the old case. Release verify returns class/state counts plus an
  opaque evidence ID; blocking cases also stop legacy family registration.
- Added typed admin repository and `/admin/import-reconciliation` with filters,
  assignment/unassignment, homogeneous batch, existing catalog/family evidence
  links, upstream checklist, PII-free JSON export and safe timeline. Duplicate
  decisions are typed; exact catalog evidence binds the current normalized
  source mapping, and fuzzy/unbound targets fail closed. Every POST revalidates
  current admin, CSRF, optimistic version and idempotency.
- Automated evidence:
  - `npm run check` — passed, 0 errors/warnings;
  - `npm test` — passed, 65 files / 483 tests;
  - `npm run test:e2e` — passed, 18 Chromium tests;
  - `npm run build` — passed;
  - `npm run docs:check` — passed, 151 links / 52 files and 105 commands;
  - `npm run release:scan` — passed, 532/532 text files, no prohibited
    artifacts/high-confidence secrets/high-confidence PII identifiers;
  - `git diff --check` — passed.
- The user created immutable commit
  `eb35a8c63c53c4edf44bb257a2dae641c63715cf` (`feat: add durable legacy import
reconciliation`). A fresh post-commit exact-SHA verification on 2026-08-18
  passed in 584.2 s: `npm run check` (0/0), `npm test` (65 files / 483 tests),
  `npm run test:e2e` (18 Chromium tests), `npm run build`, `npm run docs:check`
  (151 links / 52 files and 105 commands), `npm run release:scan` (532/532),
  and `git diff --check`. HEAD remained exact and the worktree remained clean.
  Authorized independent exact-SHA review was subsequently performed and
  returned NO-GO; see the remediation checkpoint below.
- No amend, push, tag, remote migration, import, deploy, provider send, secret
  or feature mutation was performed by Codex. Deployed preview remains historical
  `200268f` / Worker version `sha256:f4cd52e14dbd`; remote D1
  still has `0001`–`0015`, while local `0016`–`0021` remain pending.
- Overall deployment remains `NO-GO`: PR-B17 needs a new immutable remediation
  checkpoint and independent exact-SHA review, admin cold-read and authorized owner
  exercise of the one upstream group/six duplicate buckets; protected preview
  migration/synthetic rehearsal, restore evidence and every production/provider/
  legal gate remain blocked. Every remote mutation still requires its own exact
  permission.

## Continuation 2026-08-18: exact review NO-GO and remediation

- User authorized an independent read-only review of exact
  `eb35a8c63c53c4edf44bb257a2dae641c63715cf`. The reviewer found 6 HIGH,
  2 MEDIUM and 1 LOW issues; local `IMPORT-08` gate verdict was NO-GO.
- Remediation in the current worktree:
  - deterministic PII-free source identities distinguish separate row-level
    PlusBText issues;
  - append-only `0020_reconciliation_release_fence.sql` rejects a promote event
    atomically when an active blocking reconciliation case exists;
  - catalog, child and duplicate decisions bind respectively to case version,
    family/source identity and the exact duplicate enrollment pair;
  - homogeneous multi-case mutation and successor/predecessor supersede are
    atomic, CAS-safe and idempotently reconciled after ambiguous commit;
  - list summary uses the same filters as rows.
- Focused synthetic verification passed 4 files / 41 tests. It includes the
  D1 promotion trigger, version-bound mapping, case-bound child correction,
  exact duplicate-pair proof, full batch rollback/replay, atomic supersede and
  parser source-identity evidence.
- The first full regression correctly exposed five legacy fixtures whose old
  promotion assumptions conflicted with the new D1 fence. Irrelevant fixtures
  were made clean; collision and continuity tests now assert promotion denial
  and unchanged canonical state. Final required worktree chain passed:
  `npm run check` 0/0, `npm test` 65 files/491 tests, `npm run test:e2e` 18/18,
  build, docs 151 links/52 files + 105 commands, release scan 533/533 and
  `git diff --check`.
- HEAD remains `eb35a8c`; the remediation worktree is intentionally dirty and
  uncommitted. No amend/push/tag, remote migration/import/deploy, config/secret
  mutation, provider call/send, production or official-site action occurred.

## Continuation 2026-08-18: remediation commit post-commit gate

- The user created immutable commit
  `4c1c78d4aa7e4eceeb0facdc79feedce38b8a7f0` (`fix: harden legacy
reconciliation release gate`). HEAD and a clean worktree were confirmed
  before the fresh post-commit chain.
- `npm run check` passed with 0 errors/warnings. The first exact-SHA
  `npm test` run passed 490/491 tests but exceeded the global 15-second limit
  in the two-period D1 continuity-conflict scenario. An isolated rerun
  reproduced the timeout and completed in about 25.2 seconds, so exact
  `4c1c78d` did not pass the required post-commit gate.
- The current worktree changes only that test's individual timeout from the
  global 15 seconds to 45 seconds; no runtime or migration behavior changed.
  On this dirty candidate the isolated scenario passed in about 25.2 seconds
  and the full required chain passed: `npm run check` 0/0, `npm test` 65
  files/491 tests, `npm run test:e2e` 18/18, build, docs 151 links/52 files +
  105 commands, release scan 533/533 and `git diff --check`.
- A new immutable commit and fresh exact-SHA verification are required before
  requesting a separately authorized independent review. Overall deployment
  remains NO-GO. No remote migration/import/deploy, config/secret mutation,
  provider call/send, production or official-site action occurred.

## Continuation 2026-08-18: exact `f7e75f9` verification

- The user created immutable commit
  `f7e75f9b6281c44b3152c65061ab974e87153f09` (`fix of post-commit gate
fehler`). HEAD, a clean worktree and absence of the ignored E2E runtime env
  were confirmed before verification.
- The fresh required post-commit chain passed on exact `f7e75f9`: `npm run
check` 0 errors/warnings; `npm test` 65 files/491 tests in 329.19 seconds;
  `npm run test:e2e` 18/18; production build; docs 151 links/52 files + 105
  commands; release scan 533/533; and `git diff --check`. HEAD remained exact
  and the worktree remained clean through the immutable check.
- The next local gate is a separately authorized independent read-only review
  of exact `f7e75f9`. It is not authorized by the commit or this verification.
  Overall deployment remains NO-GO; no remote migration/import/deploy,
  config/secret mutation, provider call/send, production or official-site
  action occurred.

## Continuation 2026-08-18: exact `f7e75f9` review and local remediation

- The separately authorized independent read-only review of exact
  `f7e75f9b6281c44b3152c65061ab974e87153f09` returned NO-GO: 3 BLOCKER,
  5 HIGH and 2 MEDIUM findings. It found exact-candidate/current-pair and old-run
  replay gate gaps, incomplete Access/PlusBText classification, terminal
  recurrence loss, source-group projection drift, non-atomic/mutable typed
  evidence, sibling child mismatch, non-exact duplicate effects and paginated
  export. The review changed no files and made no remote calls.
- The current uncommitted worktree remediates those findings. Append-only
  migration `0021_reconciliation_exact_candidate_evidence.sql` adds exact
  promotion/current-registration fences, immutable snapshot/evidence bindings,
  live typed-evidence views and an assertion-time atomic guard. Import/admin,
  family, cabinet/pricing, parsers and export now enforce strict later-run
  closure, recurrence, mapping reset, exact family/source/pair semantics,
  downstream same-service consolidation and full filtered PII-free export.
- The local worktree chain passed: `npm run check` 0 errors/warnings; `npm test`
  66 files/509 tests in 344.85 seconds; Chromium 18/18; production build;
  `npm audit --omit=dev` 0 vulnerabilities; docs 151 links/52 files plus 105
  commands; release scan 535/535. A first full Vitest run exposed invalid old
  fixture ordering and a pricing test capped at migration `0020`; both test
  harness boundaries were corrected, targeted suites passed, and the complete
  rerun then passed.
- This worktree is not immutable evidence. The next local gate is a user-created
  commit, followed by fresh exact-SHA verification and a new independent
  read-only review. Overall deployment remains NO-GO. Remote D1/Worker/config,
  providers, production and the official site were not touched.

## Continuation 2026-08-18: remediation commit `b354e582`

- The user created immutable commit
  `b354e5829142e62ca0805adb7c3e9febc68145b6`
  (`fix: bind reconciliation to exact import evidence`). HEAD and a clean
  worktree were confirmed immediately after the commit.
- This commit contains append-only migration `0021`, all code/test remediation
  for the exact `f7e75f9` NO-GO findings, and the updated canonical/readiness
  documentation. It inherits no earlier exact-SHA verdict.
- Its direct parent worktree passed `npm run check`, 66 files/509 Vitest tests,
  Chromium 18/18, production build, production audit 0, docs 151 links/52 files
  plus 105 commands, release scan 535/535 and `git diff --check`. These are
  pre-commit results only.
- The next session must first account for the documentation-only handoff edits
  made after `b354e582`; they must be committed before any final exact-SHA gate.
  Then run fresh exact-SHA full verification. Only after it passes may a new
  independent read-only exact-SHA review be requested with separate explicit
  authorization. Overall deployment remains NO-GO; no remote/provider/
  production/official-site action occurred.

## Continuation 2026-08-18: exact `017c0d32` verification

- The user created documentation checkpoint
  `017c0d32e11f1dc61e32780b3bb472407cf856f9`
  (`docs: checkpoint stage 13 deployment handoff`). It is the immutable
  documentation descendant of runtime remediation commit `b354e582`.
- HEAD and a clean worktree were confirmed before the fresh chain. The exact
  SHA passed: `npm run check` 0 errors/warnings in 34.01 s; `npm test` 66 files/
  509 tests in 350.12 s; `npm run test:e2e` Chromium 18/18 in 183.15 s;
  production build in 25.23 s; `npm audit --omit=dev` 0 vulnerabilities in
  1.90 s; docs 151 links/52 files + 105 commands in 2.49 s; release scan
  535/535 in 3.67 s; final diff/status/HEAD check in 0.33 s. Total measured
  chain was 600.90 s.
- HEAD remained exact, final tracked status was clean and the ignored E2E
  runtime env was absent. No remote, provider, production or official-site
  action occurred.
- The next gate is a separately authorized independent read-only review of
  exact `017c0d32e11f1dc61e32780b3bb472407cf856f9`. Until a GO verdict, remote
  deployment remains prohibited and overall status remains NO-GO.

## Continuation 2026-08-18: exact `8c6e2a` review and `0022` remediation

- The user authorized an independent read-only review of exact
  `8c6e2aacc39e731ad59e8f1ca8d6fe3b5f312956`. The reviewer confirmed clean
  exact HEAD and a docs-only runtime-equivalent descendant of `b354e582`, but
  returned `NO-GO`: 2 BLOCKER and 2 HIGH.
- BLOCKER findings were the crash window between `validated` and completed
  reconciliation materialization, and the release record naming the parent SHA
  as current. HIGH findings were same-name sibling child evidence without exact
  `source_child_key`, and an already-created peer price-review item surviving a
  later `same_service_duplicate` decision.
- At that checkpoint, the mutable worktree added append-only migration `0022`, exact
  reconciliation materialization markers for promotion/registration, strict
  typed child evidence, and atomic downstream price-review supersession with
  rejection when a peer item is already applied. Runtime repositories and
  regression fixtures/tests use the new strict evidence surface.
- Targeted evidence passed: reconciliation D1 10/10, family/cabinet D1 9/9,
  legacy import D1 13/13, price reviews D1 6/6 and the focused applied/sent
  duplicate scenario 1/1. The first full Vitest exposed three regressions: an
  over-broad issue UPDATE fence, a legacy release trigger affecting non-legacy
  sources, and a pricing fixture that attempted a current missing-duration
  promote. The fence now preserves audited status resolution, the trigger is
  scoped to Access/PlusBText, and pricing models its fallback only as historical
  pre-IMPORT-08 state; focused admin-console 4/4 and pricing 1/1 passed.
- The corrected full local worktree chain passed: final `npm run check` 0/0 in
  34.09 s; Vitest 66 files/511 tests in 356.10 s; Chromium 18/18 in 182.39 s;
  production build in 22.56 s; production audit 0 in 1.76 s; docs/scan/diff
  passed. This remains mutable worktree evidence, not immutable release evidence.
- No remote D1/Worker/config mutation, provider call/send, production deploy or
  official-site action occurred. The next gate is a user-created commit,
  followed by fresh exact-SHA verification and a
  separately authorized independent re-review; no parent SHA is called the
  current candidate.

## Continuation 2026-08-19: exact runtime anchor `abb93f25`

- The user created immutable runtime remediation commit
  `abb93f25a7d9ce80bdef6f204e75cabf635f9453`
  (`fix: close reconciliation completion and downstream fences`). Clean exact
  HEAD, expected 26-file scope and absence of `.dev.vars.e2e` were confirmed.
- The exact SHA passed: check 0/0 in 45.12 s; Vitest 66 files/511 tests in
  361.42 s; Chromium 18/18 in 189.57 s; production build in 19.34 s;
  production audit 0 in 1.83 s; docs 151 links/52 files plus 105 commands in
  2.31 s; release scan 536/536 in 3.54 s; diff and final exact HEAD/status checks
  passed. HEAD remained exact and the worktree remained clean.
- No remote D1/Worker/config mutation, provider call/send, production deploy or
  official-site action occurred. To avoid repeating the prior release-SHA
  ambiguity, the final review target is defined as SELF: the documentation-only
  commit containing this record. It must be a runtime-empty descendant of
  `abb93f25`, pass exact short gates, and receive separately authorized review.

## Continuation 2026-08-19: immutable review seal `b2e8548f`

- The user created exact documentation-only commit
  `b2e8548f63ae62e33d519d61e0ac729085801052`
  (`docs: seal abb93f25 stage 13 verification`) with direct parent
  `abb93f25a7d9ce80bdef6f204e75cabf635f9453`. Its diff changes exactly the six
  canonical Stage-13/readiness documents recorded in the commit; `src`,
  `migrations` and `tests` have an empty diff.
- Clean exact HEAD and worktree were confirmed. Exact short gates passed: docs
  151 links/52 files plus 105 commands in 2.31 s; release scan 536/536 in
  3.37 s; `git diff --check` in 0.08 s; final HEAD/status, runtime-empty diff,
  SELF-record count and absence of `.dev.vars.e2e` passed.
- These short gates supplement, rather than repeat, the full exact runtime chain
  already recorded for `abb93f25`. No remote/provider/production/official-site
  action occurred.
- A new session must continue with
  `docs/prompts/stage-13-continue-deployment-after-b2e8548f.md`. Its first
  decision gate is separate user authorization for an independent read-only
  re-review of exact `b2e8548f`; at this checkpoint that review had not yet been
  performed. The following continuation records its NO-GO result. Remote
  deployment remains prohibited until GO and separately scoped remote approvals.

## Continuation 2026-08-19: exact `b2e8548f` review NO-GO and remediation

- The user separately authorized one independent read-only review of exact
  `b2e8548f63ae62e33d519d61e0ac729085801052`. The reviewer touched no files and
  performed no remote action. Verdict: `NO-GO`, 1 BLOCKER and 1 MEDIUM.
- BLOCKER: contradictory release provenance still called historical
  `a590d1f08110c20b6f7b45294cb91a7be7b5a8e3` the current candidate and two
  runbooks described immutable `abb93f25`/`0022` as mutable/uncommitted. This
  could direct an operator to the wrong SHA.
- MEDIUM: the exact duplicate reconciliation D1 test covered only a `sent`
  mutable price-review peer and did not exercise `accepted_by_parent`,
  `scheduled`, or stale dispatch/final-confirm/apply attempts after supersede.
- At this checkpoint, local remediation consistently treated `a590d1f` as historical,
  `abb93f25` as the immutable runtime anchor and `b2e8548f` as rejected. It adds
  data-driven atomic supersession for all three mutable statuses and proves the
  stale downstream actions fail closed without new outbox/apply evidence.
  Focused `tests/integration/legacy-reconciliation-d1.test.ts` passes 10/10;
  proportional worktree gates also pass: check 0/0, docs 151 links/52 files plus
  105 commands, release scan 536/536 and diff check.
- At this checkpoint remediation changed documentation and tests only; `src`
  and `migrations` remained unchanged. It was mutable and had no exact candidate
  SHA. The following continuation records its immutable anchor and verification.

## Continuation 2026-08-19: exact remediation anchor `4ac6a491`

- The user created exact commit
  `4ac6a491f2dc9a40608a4fdd77101fb4eb8853b9`
  (`test: close b2e8548f reconciliation review findings`) with direct parent
  `b2e8548f63ae62e33d519d61e0ac729085801052`. Clean HEAD/worktree and exact
  ancestry were confirmed. Its nine-file diff changes eight canonical docs and
  `tests/integration/legacy-reconciliation-d1.test.ts`; `src` and `migrations`
  have an empty diff.
- Exact proportional gates passed: focused reconciliation D1 10/10 in 90.86 s;
  check 0/0 in 37 s; docs 151 links/52 files plus 105 commands in 3.2 s;
  main-worktree release scan 536/536 in 4.4 s including existing build output;
  diff/final HEAD/status, empty `src`/`migrations` diff and `.dev.vars.e2e`
  absence passed. A later isolated clean detached recurrence independently
  passed focused D1 10/10, check 0/0, docs 151/52 plus 105 commands, release
  scan 406/406 tracked files, diff/final HEAD/status and runtime-env absence.
- This commit is the immutable docs/test remediation anchor, not the final
  review seal. To prevent another self-referential provenance ambiguity, final
  review target is defined as SELF of the next direct documentation-only commit
  containing this record. That seal must have direct parent `4ac6a491`, an empty
  `src`/`migrations`/`tests` diff, and pass exact short gates before separately
  authorized independent review.
- No remote/provider/production/official-site action occurred; overall status
  remains NO-GO.

## Continuation 2026-08-19: final review seal `2bedc73c`

- The user created exact docs-only commit
  `2bedc73c9b39a4cb43296046986a3f48e039b022`
  (`docs: seal 4ac6a491 review remediation`) with direct parent
  `4ac6a491f2dc9a40608a4fdd77101fb4eb8853b9`. Clean exact HEAD/worktree and
  ancestry were confirmed.
- The exact diff changes only the eight canonical Stage-13/readiness documents;
  `src`, `migrations` and `tests` have an empty diff. The SELF record therefore
  resolves unambiguously to `2bedc73c`; historical `a590d1f`, runtime anchor
  `abb93f25`, rejected seal `b2e8548f` and remediation anchor `4ac6a491` are not
  the final review target.
- Exact short gates passed: docs 151 links/52 files plus 105 commands, release
  scan 536/536, commit diff check, final HEAD/status and `.dev.vars.e2e`
  absence. Full/focused runtime gates were not repeated because the diff from
  `4ac6a491` is empty for `src`/`migrations`/`tests`.
- Independent review has deliberately not been started. The next session must
  use `docs/prompts/stage-13-continue-deployment-after-2bedc73c.md`, establish
  provenance and request separate user authorization for exactly one read-only
  independent review of `2bedc73c` with no remote/provider/production access.
- No remote D1/Worker/R2/config mutation, provider call/send, production deploy,
  DNS/CMS or official-site action occurred. Overall status remains NO-GO until
  independent GO and all separately scoped external gates.

## Continuation 2026-08-19: independent review exact `2bedc73c`

- Пользователь отдельно разрешил ровно один independent read-only review exact
  `2bedc73c9b39a4cb43296046986a3f48e039b022`. Перед запуском provenance
  подтвердил clean worktree, later docs-only handoff HEAD `82ca91e`, direct
  parent `4ac6a491`, ровно восемь docs-файлов в seal diff и пустые
  `src`/`migrations`/`tests` diffs до seal и от seal до current HEAD.
- Reviewer читал только local Git objects: exact lineage, canonical docs,
  runtime, migrations и tests. Он не запускал tests/build/formatters, не менял
  файлы/worktree и не обращался к network, remote, provider, Cloudflare,
  production или official site.
- Verdict: GO для local exact-SHA gate, без BLOCKER/HIGH. Подтверждены exact
  completion/crash marker, promotion/registration fail-closed, strict
  `source_child_key`, atomic mutable-peer supersession/applied-peer block,
  generic issue resolution, Access/PlusBText trigger scope, historical pricing
  fallback boundary и полный filtered PII-free export.
- Один MEDIUM test-evidence gap не меняет GO: stale dispatch/final-confirm/apply
  fixtures уже не eligible по другим guards, поэтому regression не изолирует
  duplicate-specific причину отказа. Reviewer не нашёл runtime bypass; текущие
  status predicates, strict target assertion и atomic assertions fail closed.
  Будущее исправление должно провести fixtures через реальный eligible lifecycle
  и проверить нулевые deltas acceptance, assignments, outboxes и apply events;
  это будет новый test diff/candidate и потребует нового separately authorized
  review.
- Local review GO не разрешает Cloudflare inventory, backup/restore, migrations,
  deploy, bootstrap, flags/secrets, provider send, import, production, DNS/CMS
  или official-site action. Все соответствующие gates остаются `blocked` либо
  `feature_disabled`; общий production verdict остаётся NO-GO.

## Continuation 2026-08-19: protected preview Access perimeter

- Пользователь отдельно разрешил настроить Cloudflare Access для последующих
  agent и manual проверок exact preview target. До mutation API token был
  проверен без вывода значения и показал, что Access в account ещё не enabled.
- Создана Zero Trust organization `Kolibri Registration Preview` с 24-hour
  default session, `deny_unmatched_requests=false` и без WARP authentication.
  Поэтому другие account resources не получили глобальную Access-блокировку.
- Добавлен One-time PIN identity provider. Exact preview `workers.dev` hostname
  защищён одной self-hosted Access application через exact public destination;
  остальные Workers, preview deployments, zones, production и official site в
  destination не входят.
- Manual policy имеет `allow`, ровно два утверждённых email principals,
  обязательный OTP login method и после owner smoke изменённую session duration
  `168h`. Адреса не записаны в tracked evidence.
  Automation policy имеет `non_identity` и ровно один exact service token.
  `Bypass` policies отсутствуют.
- Service token действует 720 hours, истекает `2026-09-18T15:55:23Z`; одноразовые
  client credentials сразу сохранены DPAPI-encrypted вне repository и не
  выводились в transcript. Temporary Cloudflare API token также хранится только
  encrypted вне repository и должен быть отозван owner через dashboard после
  завершения этой настройки.
- Post-mutation API inventory подтвердил one app, one OTP IdP, ровно две exact
  policies, manual policy session `168h`, exact destination и ноль Bypass.
  External probes:
  anonymous `302` в Access; login page `200` и содержит email form; valid service
  token получает Worker `200`; invalid service token не достигает Worker.
- Owner подтвердил успешный client/admin OTP login 2026-08-19. Первоначально
  выданные browser tokens сохраняют прежний expiry; новый 168-hour срок выдаётся
  при следующем login. Duration mutation не меняла principals, OTP requirement,
  Service Auth или Bypass count. Access mutation не меняла Worker version, D1,
  R2, portal flags/secrets, provider delivery, production, DNS/CMS или official
  site. Все portal functions остаются в прежнем fail-closed состоянии; общий
  production verdict остаётся NO-GO.

## Continuation 2026-08-19: protected exact-target control config

- Owner явно подтвердил revoke временного Cloudflare API token. После проверки
  exact parent path удалён только
  `%LOCALAPPDATA%\Kolibri\CodexSecrets\cloudflare-access-token.dpapi`; локальная
  копия невосстановима. DPAPI-файл Access service token сохранён до завершения
  agent testing.
- Канонический guard прочитан из `scripts/remote-d1-target.ts`: preview требует
  exact `APP_ENV=preview`, 32-hex `account_id`, ровно один `DB` binding, отдельный
  `preview_database_id`, совпадение explicit CLI UUID и запрет неоднозначного
  selector/shared preview-production identity. Guard не ослаблялся.
- Создан отдельный `imports/legacy-preview-control.json`. Существующее правило
  `imports/*.json` исключает его из Git, а Windows ACL отключает inheritance и
  оставляет единственное explicit FullControl rule текущего пользователя. Файл
  не содержит token/secret values и фиксирует exact preview environment/origin,
  account/D1 binding и candidate/review Git provenance. Эти auxiliary provenance
  vars не заменяют canonical clean exact-HEAD/plan guard remote runner.
- Сверка только с уже имевшимся local inventory подтвердила exact account,
  preview Worker, D1, оба private EU R2 bucket и portal origin; в evidence
  сохранены только suffixes account `…8fc0` и D1 `…608b`. Local-only
  `unstable_readConfig` плюс `assertRemoteD1ConfigTarget` прошли, candidate HEAD
  и reviewed ancestor совпали. Network/API/remote D1 для этой проверки не
  использовались.
- Plan artifact ещё не существует, поэтому plan-bound
  `import:legacy:confirmation:remote` не запускался: его подготовка потребовала
  бы отдельного remote-plan/read permission. Independent read-only review control
  binding также не запускался без отдельного разрешения пользователя.
- Не выполнялись Cloudflare/Worker/D1/R2 mutations, migration, deploy, import,
  secret/flag change, email/Telegram send, production/DNS/CMS или official-site
  action. Все portal feature flags остаются disabled/fail-closed; общий verdict
  остаётся **NO-GO**. Ближайший отдельный gate — только independent read-only
  review protected control binding.

## Continuation 2026-08-20: independent review protected control binding

- Пользователь отдельно разрешил ровно один independent read-only review только
  `imports/legacy-preview-control.json`, без network и любых remote изменений.
  Reviewer не изменял files, ACL или Git state, не читал DPAPI credentials и не
  запускал Cloudflare API, Wrangler remote, D1/R2 operations, formatter, build
  или tests.
- Независимо подтверждены HEAD `82ca91e3`, ancestry exact review target
  `2bedc73c`, ожидаемый трёхдокументный worktree diff и отсутствие
  `src`/`migrations`/`tests` diff. Control file остался regular/Git-ignored,
  current-user-only ACL и exact SHA-256
  `321e9cae0be7092f104d3435c47632344a3a89d033c2883ba5b6dfe4ba93d5f0`.
- Local Wrangler parser принял config. Exact APP_ENV/origin/account/one-DB/
  preview-D1 binding совпал с independent local inventory; в отчёте раскрыты
  только account suffix `…8fc0` и D1 suffix `…608b`. Secret-like values не
  найдены.
- Канонический guard принял исходный binding и fail-closed отклонил in-memory
  wrong-environment, wrong-explicit-UUID, shared-identity, UUID-as-name,
  multiple/wrong-binding и missing-account варианты ожидаемыми typed errors.
- Verdict: **GO только для protected control-binding sub-gate**, без
  BLOCKER/HIGH/MEDIUM. Два LOW residual не меняют GO: auxiliary origin/candidate/
  review vars правдивы, но runner enforce provenance через `plan.gitCommitSha`,
  clean worktree и exact HEAD; при изменении HEAD auxiliary SHA нужно сверять
  заново. Текущий minimal config также fail-closed для ordinary deploy из-за
  отсутствующих deploy `database_id`, `name`, `main`, compatibility date и R2
  bindings; это свойство нельзя молча потерять при расширении файла.
- Parent PR-B13 остаётся `blocked` только из-за отсутствующих plan-bound и remote
  transaction evidence; control-binding review не отменяет exact candidate GO и
  не является новым preview deploy blocker. Никаких remote mutations не было.
  Ближайший отдельный gate — backup/Time Travel point плюс independently
  verifiable isolated D1/R2 restore exact preview resources.

## Continuation 2026-08-20: isolated preview recovery rehearsal

- Пользователь отдельно разрешил только следующий gate: backup/Time Travel
  point плюс independently verifiable isolated D1/R2 restore exact preview
  resources. Перед mutation повторно подтверждены account suffix `…8fc0`, source
  D1 suffix `…608b`, EU jurisdiction, deployed migrations `0001`–`0015` и две
  distinct private EU source R2 buckets. Candidate migrations `0016`–`0022`
  остались unapplied.
- Получен current D1 Time Travel bookmark и сразу создан protected SQL export во
  внешнем current-user-only directory. Plaintext имел 18,510,591 bytes и SHA-256
  `2c3cc90ffb455dc04a7c99bf2d30ead0d578454755d9fedbfc7e8e3129dd6c92`.
  После restore он DPAPI CurrentUser-encrypted, round-trip hash совпал, encrypted
  artifact имеет 18,510,806 bytes и SHA-256
  `9401a7bb980f21804a590aac2e523b961edc35c4fd3d29273ab6fc924aea2981`;
  plaintext и scratch artifacts удалены. RPO/cadence/retention этим не объявлены.
- Созданы только отдельные recovery resources: одна unbound EU D1 (suffix
  `…250c`) и две private EU R2 buckets с restore suffix `e80850`. Protected
  ignored restore config выключает все features/providers и не содержит deploy
  `name`/`main`; source Worker/D1/R2, Access, secrets/flags, providers,
  production, DNS/CMS и official site не менялись.
- D1 export импортирован только в restore D1. Exact PII-free reconciliation
  совпало: 398 schema objects, 124 tables, 32,146 aggregate rows, schema SHA-256
  `f7588e4a5fa06b86662f1b11499637ad9b47bc339aec5786b4729205b41c9b01`,
  per-table-count SHA-256
  `7413e1c9792643ed086b12a259e753ba3fc96155452cc2e212420acf92cd25df`,
  15 migrations/max ID 15 и 0 FK violations. Local SQLite `quick_check=ok`;
  remote `quick_check` вернул safe `SQLITE_NOMEM`, поэтому зафиксирован
  independently reproducible fallback: exact remote schema/per-table counts и
  remote FK check.
- Source archive/quarantine на recovery point и обе distinct restore buckets
  имеют по `0 objects / 0 B`, location EEUR; restore buckets не привязаны к
  Worker. Это полный restore текущего empty state, но не механизм будущего
  non-empty backup: PR-H05 остаётся `blocked`.
- PII-free exact-ID/bookmark evidence сохранён только в ignored/current-user-only
  `imports/preview-recovery-evidence-e80850.json`; encrypted backup находится вне
  repository. Rehearsal занял 901 s, recovery-point delta — 133 s; RTO и RPO не
  заявлены. Restore resources оставлены изолированными для независимой проверки;
  rollback этого gate — удалить только exact restore D1/R2 из protected manifest
  после отдельного cleanup decision, без воздействия на source.
- Gate result: **GO для one-off preview D1/current-empty-R2 recovery rehearsal**.
  Это не меняет общий production **NO-GO**: RPO/RTO/cadence/retention, reusable
  non-empty R2 mechanism, application smoke и production approvals остаются.
  Ближайший отдельный gate — только remote preview migrations `0016`–`0022`;
  migration permission не подразумевает Worker deploy или любой последующий gate.

## Continuation 2026-08-20: remote preview migrations `0016`–`0022`

- Пользователь отдельно разрешил только source preview D1 apply `0016`–`0022`.
  Перед mutation exact target повторно совпал с protected control/recovery
  evidence: account suffix `…8fc0`, D1 suffix `…608b`, jurisdiction EU. Reviewed
  migration files не отличались от exact `2bedc73c`; worktree имел только
  ожидаемый docs diff, `src`/`migrations`/`tests` diff был пуст.
- Preflight показал ровно семь pending files от
  `0016_legacy_import_release_control.sql` до
  `0022_reconciliation_completion_downstream_fence.sql`, ledger 15/max ID 15 и
  нулевые academic-period/user/import/legacy-promotion/Telegram/outbox counts.
  Fresh pre-apply Time Travel bookmark зафиксирован; DPAPI backup и уже
  проверенный isolated `0001`–`0015` restore повторно прошли hash/integrity guard.
- Единственная mutation-команда `wrangler d1 migrations apply DB --remote` для
  exact preview config завершилась exit code 0. Все семь migrations получили
  success; повторный remote list вернул `No migrations to apply`.
- Post-apply PII-free checks: exact ledger 22/22/max ID 22; 523 schema objects,
  143 tables; все 130 создаваемых/заменяемых candidate objects присутствуют;
  18 новых tables пусты; девять обязательных altered columns и Telegram
  `delivery_unknown` constraint присутствуют; FK violations 0. Academic period,
  users, import runs, legacy versions/promotion events, Telegram outbox и admin
  outbox actions остались 0. Fresh post-apply Time Travel bookmark сохранён.
- Protected exact evidence находится только в ignored/current-user-only
  `imports/preview-migration-evidence-0016-0022-20260820.json`, SHA-256
  `875bb64f7dd3f555c1334e19b7a22866018d72f2a1166c2e41c70add84948bfd`.
  Он содержит exact resource IDs/bookmarks локально и не содержит PII/secrets.
- Source Worker deployment/version и обе source R2 buckets не изменились; R2
  остались private EU и `0 objects / 0 B`. Access, flags/secrets, bootstrap,
  import lifecycle, email/Telegram, production, DNS/CMS и official site не
  менялись. Новый authenticated Worker smoke не заявляется; он входит в
  отдельный exact Worker deploy/post-deploy gate.
- Applied migrations `0001`–`0022` нельзя редактировать или откатывать down
  migration. Recovery paths: совместимое code behavior, новая append-only
  forward-fix migration либо отдельно разрешённый restore к сохранённому
  pre-apply point.
- Gate result: **GO для remote preview migration apply `0016`–`0022`**. Overall
  production status остаётся **NO-GO**. Ближайший отдельный gate — только exact
  preview Worker deploy; он не включает bootstrap, flags/secrets, import,
  provider send или production/site actions.

## Continuation 2026-08-20: подготовка новой сессии для exact Worker deploy

- Следующий remote gate целесообразно выполнять в новой сессии: migration gate
  завершён GO и имеет собственный protected evidence, а Worker deploy создаёт
  новую version/deployment на 100% traffic и требует отдельного preflight,
  post-deploy smoke и rollback decision.
- Создан новый ignored operational accelerator
  `docs/prompts/stage-13-continue-exact-preview-worker-deploy.md`. Он не является
  permission и требует либо отдельного явного разрешения на exact gate, либо
  остановки после local provenance/read-only preparation.
- Текущий local preflight: HEAD `82ca91e3`; diff от final reviewed
  `2bedc73c` и worktree diff пусты для `src`/`migrations`/`tests`; local Wrangler
  `4.120.1`; ignored `wrangler.preview.toml` SHA-256 остаётся
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9` и
  содержит deploy `name`/`main`, exact DB, два EU R2 bindings, два Cron и прежний
  fail-closed vars set. Remote inventory/deploy в этой preparation не запускались.
- Access agent credential file существует, shape/expiry проверены локально без
  вывода credentials и network request. Его envelope — PowerShell
  `ConvertFrom-SecureString` с CurrentUser DPAPI; читать его нужно через
  `ConvertTo-SecureString`, а не через raw base64/`ProtectedData.Unprotect`.
  Client ID/secret присутствуют, expiry остаётся `2026-09-18T15:55:23Z`.
- Canonical deployment runbook теперь фиксирует exact current sequence: fresh
  build, strict dry-run, отдельное разрешение на единственный deploy, protected
  capture previous/new Worker IDs, Access-protected root/health и D1/R2/cron/
  fail-closed invariants. Неожиданный remote config drift — stop; `--keep-vars`
  автоматически не применяется.
- Rollback этого gate меняет только deployment обратно на exact captured
  compatible previous Worker version. Applied migrations `0001`–`0022` не
  откатываются down, D1/R2 не удаляются. Если rollback не pre-authorized новым
  поручением, agent сначала делает containment/read-only diagnosis и запрашивает
  отдельное разрешение.
- При подготовке prompt не выполнялись network/API/remote D1/R2/Worker/Access
  actions, build/deploy, secret/flag mutation, bootstrap, import, provider send,
  production, DNS/CMS или official-site changes. Ближайший gate остаётся ровно
  один: exact protected preview Worker deploy плюс его read-only post-check.

## Continuation 2026-08-20: exact Worker deploy, Access stop и rollback

- Пользователь разрешил ровно один remote read-only preflight, один exact
  Worker deploy на 100%, предусмотренные read-only post-checks и exact rollback
  только на captured previous compatible version при stop condition. Migrations,
  D1/R2 writes, Access/flags/secrets, bootstrap/import, provider sends,
  production, DNS/CMS и официальный сайт оставались вне scope.
- Local provenance остался точным: HEAD `82ca91e3`, reviewed ancestor
  `2bedc73c`, пустой committed/worktree diff для `src`/`migrations`/`tests`,
  preview config SHA-256
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`.
  Fresh `npm run build` и exact `wrangler deploy --dry-run --strict` прошли.
- Remote preflight подтвердил account suffix `…8fc0`, historical active version
  `…4154` на 100%, exact materialized vars/bindings/assets/browser/handlers,
  expected three secret names, два Cron, observability, отсутствие routes/custom
  domains, D1 suffix `…608b` с ledger 22/max 22/pending 0/FK 0/empty business
  state, две private EU R2 `0 objects / 0 B` и canonical Access boundary.
- Protected deploy evidence создан только как ignored/current-user-only
  `imports/preview-worker-deploy-evidence-20260820.json`. Полные previous/new
  deployment/version IDs и rollback target находятся только там; credentials,
  headers, cookies, PII и response bodies отсутствуют.
- Единственная exact команда `wrangler deploy --strict` завершилась exit 0,
  создала candidate version suffix `…1500` и перевела её на 100%. Read-only
  reconciliation показал ровно одну новую version/deployment, previous inactive
  и доступную для rollback; remote version/config, two Cron, observability,
  canonical root/assets/health, disabled registration, D1 и R2 совпали.
- Дополнительная обязательная boundary-проверка автоматически созданной
  versioned Preview URL обнаружила anonymous `200`, тогда как canonical hostname
  продолжал отдавать Access `302`. Это stop condition
  `ACCESS_BYPASS_VERSION_PREVIEW`; exact URL, prefix и full ID наружу не
  выводились.
- Заранее разрешённый rollback выполнен ровно на captured previous compatible
  version `…4154` и завершился exit 0. Она снова единственная active на 100%; new
  `…1500` inactive, но retained. Canonical anonymous `302`, valid root `200`,
  health `204`/empty/`no-store`/`noindex`, D1 pending 0 / ledger 22 / FK 0 /
  empty business state повторно прошли.
- Остаточный blocker: rollback не удаляет version и versioned Preview URL
  candidate продолжает отвечать anonymous `200`. Не повторять deploy и не
  начинать bootstrap/import. Следующий отдельный gate — только owner-authorized
  защита Worker previews через Access либо явное отключение `preview_urls` с
  соответствующей config/deploy procedure, затем новый exact deploy/recheck.
- В начале сессии DPAPI envelope был ошибочно прочитан как raw blob, и
  расшифрованный service-token payload попал в локальный execution transcript.
  Owner явно принял этот риск и поручил продолжить без Access/token rotation;
  credential не записан в repository/evidence, но его плановая отдельная
  ротация остаётся рекомендуемым operator action.
- Общий production verdict остаётся **NO-GO**. Production, official site и все
  provider/feature paths не изменялись.

## Continuation 2026-08-21: Preview URLs disabled и candidate redeploy

- Пользователь отдельно поручил первый необходимый gate после Access stop:
  отключить versioned Preview URLs и повторно развернуть exact candidate.
  Разрешение не расширялось на migrations, D1/R2 data writes, Access app/
  policies, runtime vars/secrets, bootstrap/import, provider calls/sends,
  production, DNS/CMS или официальный сайт.
- Перед изменением exact provenance совпал: HEAD `82ca91e3`, independent review
  seal `2bedc73c` является ancestor, committed и worktree diff для
  `src`/`migrations`/`tests` пуст. Historical ignored preview config SHA-256
  `d0292d875b148da0cca0d97f8c188b2c8eae11a94c4d81fbfe1b25b18188cac9`.
- В ignored `wrangler.preview.toml` добавлена единственная строка
  `preview_urls = false`; новый SHA-256
  `b6fffb07d4c1e6654c657b2adb9a2e16acf4ed73b72cbead7465fe0908d08959`.
  Wrangler `4.120.1` schema и current Cloudflare docs подтверждают этот boolean;
  fresh `npm run build` и exact `deploy --dry-run --strict` прошли.
- Remote preflight подтвердил OAuth exact account suffix `…8fc0`, active
  compatible `…4154`/100%, retained candidate `…1500`, exact 57 vars/eight
  fail-closed values/three secret names/DB/two R2/assets/browser/fetch+scheduled,
  D1 ledger 22/max 22/pending 0/FK 0/empty business state, две private EU R2
  `0 objects / 0 B` без custom domain/r2.dev и canonical Access
  anonymous/invalid `302`, login page, valid root `200`, health `204`/empty/
  `no-store`/`noindex`. Retained versioned Preview URL до mutation оставалась
  anonymous `200`.
- Protected ignored/current-user-only evidence создано как
  `imports/preview-worker-deploy-evidence-20260821.json`, ACL inherited from the
  protected prior deploy evidence and remains protected. Exact target, previous/
  new deployment/version IDs и rollback target находятся только там; credential,
  cookie, header, PII и response body отсутствуют.
- Ровно один authorized `wrangler deploy --strict` завершился exit 0, создал
  version `…76ee`, перевёл её на 100% и сохранил оба Cron `* * * * *` и
  `*/15 * * * *`. Inventory показывает ровно одну новую version/deployment;
  `…4154` и `…1500` inactive и доступны как historical versions.
- New remote version сохраняет exact vars/fail-closed values/three secret names,
  D1/two EU R2/assets/browser bindings, fetch+scheduled handlers и compatibility.
  Canonical Access сохранил anonymous/invalid `302`, login page, valid root
  `200`, one referenced asset `200`, health `204`/empty/`no-store`/`noindex`.
  `/auth/register` остаётся `200` с service-unavailable text, disabled submit и
  без Turnstile lifecycle; POST/provider calls отсутствовали.
- Versioned routes retained `…1500` и new `…76ee` после deploy обе возвращают
  anonymous `404`, поэтому `ACCESS_BYPASS_VERSION_PREVIEW` закрыт. Cloudflare
  version view всё ещё сообщает `metadata.has_preview=true`; current docs и
  observed routing показывают, что это metadata не является признаком активной
  Preview URL routing. Explicit config плюс обе anonymous `404` являются
  recorded gate evidence.
- Post-deploy D1 повторно имеет ledger 22/max 22/pending 0/FK 0 и нулевые
  academic-period/user/import/legacy-promotion/Telegram/outbox/admin-action
  counts. Обе source R2 остаются private EU `0 objects / 0 B`, без custom domain
  и с disabled `r2.dev`. Stop condition не возник, captured `…4154` не
  использовалась для rollback.
- Final local gates: `npm run check` — 0 errors/warnings; `npm test` — 66 files,
  511/511 tests; fresh `npm run build`; `npm run docs:check` — 151 links in 52
  files и 106 executable command lines; `npm run release:scan` — 536/536;
  `git diff --check` passed. Final remote reconciliation сохранила `…76ee` на
  100%, canonical anonymous `302` и обе versioned routes `404`.
- Exact preview deploy/post-deploy gate теперь **GO**. Production verdict
  остаётся **NO-GO**. Следующий отдельный gate — clean-room preview admin
  bootstrap/recovery; в этом continuation он не начинался.

## Continuation 2026-08-24: preview admin bootstrap read-only preflight

- Пользователь поручил следующий gate — clean-room preview admin bootstrap/
  recovery. До mutation выполнен только exact-target read-only preflight;
  migrations, import, provider send, feature/secret/Access mutation, production,
  DNS/CMS и официальный сайт не затрагивались.
- Wrangler `4.120.1` и штатный config parser подтвердили `APP_ENV=preview`, один
  binding `DB` и exact dedicated preview D1. Remote read-only state: migrations
  `22`, FK violations `0`, bootstrap control `available`, users/admins/active
  sessions/bootstrap actions/assertions/audit — все `0`.
- Сработали две предусмотренные stop conditions до любой записи. Во-первых,
  eligible verified active parent отсутствует: D1 полностью пуста, а отдельного
  supported synthetic-account provisioning command в repository/runbook нет;
  public auth и email provider остаются disabled. Direct SQL для создания
  bootstrap target запрещён runbook.
- Во-вторых, materialized dedicated preview config хранит exact target в
  `database_id`, тогда как reviewed bootstrap CLI для environment `preview`
  требует `preview_database_id`. Поэтому текущая exact bootstrap command
  fail-closed с `CLI_DATABASE_TARGET_MISMATCH`; подмена отсутствующего
  production UUID или ослабление guard без отдельной реализации/review
  недопустимы.
- Bootstrap, role/session mutation, replay probe и zero-admin recovery drill не
  запускались. Control остаётся `available`, remote counts не изменились.
  PR-E01–PR-E05 остаются `blocked`.
- Следующий prerequisite требует привести bootstrap config contract к
  фактической dedicated-preview topology и закрыть current-snapshot dependency.
  Обычный preview auth/email registration нельзя считать target-creation path до
  current promoted snapshot; точный безопасный порядок зафиксирован ниже.

## Continuation 2026-08-24: multi-session deployment handoff prepared

- Documentation-only handoff зафиксирован в `2026-08-24T09:31:16Z`; remote state
  в этой continuation не менялся.
- Владелец уточнил постоянную цель следующих сессий: это не отдельный bootstrap
  или deploy task, а последовательный Stage 13 deployment process до полностью
  функционального production-состояния портала. Human gates должны сопровождаться
  простым объяснением, точной пошаговой инструкцией и перечнем credentials,
  которые владелец не передаёт агенту.
- Владелец утвердил роли двух mailbox: корпоративный mailbox используется как
  login первого администратора и отдельно как approved sender identity; второй
  owner-controlled mailbox — как обычный test parent. Роль portal user и sender
  configuration независимы. Exact личный адрес не записан в tracked evidence и
  передан только в ignored continuation prompt. Пароли, OTP и verification links
  не запрашиваются и не сохраняются.
- Runtime review исправил прежнее неполное предположение о порядке шагов.
  `LegacyFamilyVerificationExtension` требует ровно один current promoted legacy
  snapshot, а email verification и family finalization выполняются одним D1
  batch. На текущей empty preview D1 обычная registration verification поэтому
  fail-closed и не создаёт eligible target для bootstrap.
- Правильная dependency chain: (1) local implementation/review exact
  dedicated-preview bootstrap CLI/config contract; (2) отдельно разрешённый
  synthetic/no-PII import lifecycle с independent roles и recovery evidence до
  current promoted snapshot; (3) reviewed preview auth/email candidate deploy и
  только две approved verification deliveries; (4) owner выполняет регистрацию
  и verification двух accounts, не раскрывая passwords/OTP/tokens; (5) exact
  one-shot bootstrap корпоративного empty-state account, revoke/replay/audit/
  fresh-login checks; (6) manual full-cycle preview testing и оставшиеся Stage 13
  gates; (7) production только после закрытия blockers и отдельных approvals.
- Out-of-band synthetic-account provisioner допустим только после отдельной
  реализации/review и не заменяет current promoted snapshot, необходимый для
  полного registration cycle. Direct SQL остаётся stop condition.
- Перед каждым ответственным gate следующая сессия обязана оценивать context
  health. При повторных compactions, недостаточной уверенности в exact state,
  clean-room/independent-role boundary или риске ответственного шага она сначала
  выполняет разрешённую read-only reconciliation, обновляет handoff/checklist/
  runbook, создаёт новый self-contained ignored continuation prompt и только
  затем останавливается с точной инструкцией владельцу для новой сессии.
- В этой continuation remote mutation не выполнялась: D1/R2/Worker/Access/flags/
  secrets/providers/production/DNS/CMS/официальный сайт не затронуты. Работа
  сознательно передаётся до следующего ответственного gate, поскольку текущая
  сессия уже проходила несколько context compactions.
- Новый self-contained prompt:
  `docs/prompts/stage-13-continue-progressive-preview-to-production.md`. Его
  ближайшая задача — безопасно восстановить exact state, устранить local
  CLI/config mismatch и подготовить current-snapshot prerequisite; его постоянная
  цель — продолжать deployment process после каждого успешного gate, а не
  завершаться после первого шага.

## Continuation 2026-08-24: dedicated-preview D1 contract fixed locally

- Continuation начата с clean HEAD `adb7b70b`; он на один docs-only commit
  опережает указанную в prompt baseline `82ca91e3`. Diff затрагивает только 11
  canonical documentation files; `src`/`scripts`/`migrations`/`tests`, package и
  Wrangler configs между этими commits не менялись. Pre-existing commit и
  protected evidence не переписывались; новый commit не создавался.
- Fresh read-only exact-target reconciliation в `2026-08-24T10:13:28Z`
  подтвердила одну active Worker version `…76ee` на 100%, expected previous
  `…4154` inactive/available и anonymous `404` для active и retained `…1500`
  versioned preview routes. Local ignored config по-прежнему имеет
  `preview_urls=false` и SHA-256
  `b6fffb07d4c1e6654c657b2adb9a2e16acf4ed73b72cbead7465fe0908d08959`.
- Fresh Access perimeter: anonymous и invalid service token получают `302` в
  Access, valid service token достигает canonical Worker root с `200`, а
  `/_health/operations` возвращает `204`. DPAPI credential использован только
  в памяти, значения не печатались и не менялись.
- Fresh D1 read-only state: pending migrations `0`, ledger `0001`–`0022` точно
  совпадает с local files, FK violations `0`; academic periods/users/sessions/
  import runs/legacy versions/promotion events/bootstrap actions/assertions/
  audit и active admins равны `0`, bootstrap control остаётся `available`.
  Оба exact private EU R2 bucket имеют `0` objects, custom domains отсутствуют,
  `r2.dev` disabled. Deployed vars/bindings совпадают с ignored config; public
  auth, contract send/upload/public/media functions и email/Telegram/renderer
  providers остаются fail-closed. Scheduled operations остаются отдельно
  enabled по уже reviewed Cron contract.
- Wrangler `4.120.1` local schema и current official Cloudflare docs определяют
  `preview_database_id` как override для `wrangler dev`; deployed Worker binding
  использует `database_id`. Поэтому `scripts/remote-d1-target.ts` и
  `scripts/admin-bootstrap-remote.ts` теперь принимают exact deployed
  `database_id` для dedicated preview/production config и отклоняют любой
  `preview_database_id` overlay. Shared explicit identity, wrong UUID,
  placeholder, additional binding, selector collision, APP_ENV/account/target
  mismatch продолжают fail-closed до network.
- Bootstrap guard проверен на существующем ignored runtime config, import guard
  — на отдельном protected control config; targets совпадают. В
  `imports/legacy-preview-control.json` изменено только имя D1 selector
  `preview_database_id` → `database_id`; файл остаётся ignored и current-user
  ACL protected, новый SHA-256
  `c92f31615380815ade0576b724a445d7fe0d316c567daa883c72ea7e468a836f`.
  Его candidate/reviewer provenance сознательно не repin-илась без нового clean
  commit и independent review.
- Targeted unit и existing D1 integration tests прошли: 3 files, 19/19 tests.
  Затем прошли полные gates: `npm run check` — 0 errors/warnings; `npm test` —
  66 files, 512/512 tests; fresh `npm run build`; `npm run docs:check` — 151
  links in 52 files и 106 executable command lines; `npm run release:scan` —
  536/536; `git diff --check` passed. Ни один Worker/D1/R2/Access/flag/secret/
  provider/import/bootstrap/production/DNS/CMS/official-site mutation или send
  не выполнялся.
- Phase B remote plan/transition ещё не запускались: current worktree содержит
  этот uncommitted Phase A candidate, а prompt запрещает создавать commit без
  отдельного explicit permission. Protected control provenance остаётся на
  предыдущем reviewed candidate и должна быть repin-нута только после exact
  candidate commit и независимого review. Ближайший gate — разрешённый local
  candidate commit, после которого нужен отдельный reviewer/session protocol;
  разрешение на commit не является разрешением на synthetic import mutation.

## Continuation 2026-08-24: exact D1-contract review GO and durable continuity

- Phase A candidate был committed как exact
  `8362ffa875dde563519d91482e5aa5c8d6a2eca5` (`fix: align dedicated preview D1
target contract`) поверх `adb7b70b77c8b39fb0d9d71efe9946739c4f1964`.
  Independent role-specific review полностью выполнил
  `docs/prompts/stage-13-independent-review-dedicated-preview-d1-contract.md` и
  вернул **GO**: provenance, exact 10-file scope, Wrangler 4.120.1 semantics,
  exact-target guards, protected ignored configs/ACL и code/security review
  прошли.
- Review был строго read-only и не являлся Phase B approval. Ни protected
  provenance, ни remote Worker/D1/R2/Access/flags/secrets/providers/import/
  bootstrap/production state не менялись.
- Fresh review gates: `npm run check` — 0 errors/warnings; `npm test` — 66 files,
  512/512 tests; `npm run build`; `npm run docs:check` — 151 links/52 files и
  106 executable command lines; `npm run release:scan` — 536/536;
  candidate-range `git diff --check` — passed. Worktree после review был clean.
- Обнаружен continuity defect: прежний
  `docs/prompts/stage-13-continue-deployment.md` всё ещё описывал SHA `d6118d1`
  и состояние 2026-08-17, а рядом находились несколько конкурирующих ignored
  continuation snapshots. Они не могли надёжно переносить постоянную цель и
  заставляли новые сессии повторять уже закрытые gates.
- В текущем documentation/automation worktree введён tracked обезличенный
  operational checkpoint `docs/implementation/STAGE_13_ACTIVE_STATE.md` и
  постоянный tracked entry-point
  `docs/prompts/stage-13-continue-deployment.md`. Остальные одноразовые prompts
  остаются ignored, чтобы infrastructure details/PII не попадали в Git.
  `scripts/check-stage13-continuity.ts`, включённый в `npm run docs:check`,
  проверяет Git visibility, отсутствие email-like PII, evergreen prompt без
  pinned SHA, schema active-state, существование reviewed commit и совпадение
  candidate evidence в handoff/checklist.
- Ближайший незакрытый gate больше не Phase A review: нужно отдельно
  синхронизировать protected Phase B control provenance с reviewed candidate,
  подготовить fresh recovery point/exact scope и затем через независимые роли
  выполнить synthetic/no-PII import lifecycle до ровно одного current promoted
  snapshot. Remote writes этим documentation update не разрешены.
- Continuity worktree verification: `npm run check`, `npm run build`,
  `npm run docs:check`, `npm run release:scan` (540/540) и `git diff --check`
  passed. Параллельный `npm test` дал 507/512 с пятью timeout-only D1 failures
  за 443 s и без assertion failures; все пять затем прошли при последовательной
  targeted перепроверке (legacy-import 1/1 внутри 13/13 файла, messaging 3/3,
  price-review 1/1). Full-suite run поэтому честно не помечается зелёным, но
  targeted evidence не обнаружило regression от documentation/continuity scope.

## Continuation 2026-08-24: Phase B provenance, preflight и academic-period boundary

- По прямому разрешению владельца protected ignored
  `imports/legacy-preview-control.json` локально repin-нут: candidate и
  independent-review provenance теперь оба exact
  `8362ffa875dde563519d91482e5aa5c8d6a2eca5`. Selector остаётся deployed
  `database_id`; account/D1 target не менялись. Файл остаётся Git-ignored,
  current-user ACL protected; новый SHA-256
  `f154471dd2497fcb144168c1b67ec1116b1aca1904481d7718bdc1636eb63393`.
  Runtime target guard прочитал его успешно. Targeted existing remote/import/
  bootstrap guards прошли 44/44.
- Fresh read-only Phase B preflight около `2026-08-24T14:17Z` подтвердил exact
  D1 migration ledger `0001`–`0022` с digest
  `c50295a8dc2e5d79d0fed983a02acd36ba1d1943c2c96e5d924e9344112a4840`,
  pending `0`, FK violations `0`; academic periods/users/admins/current
  PlusBText/current Access/import plans/runs/events/bootstrap actions/assertions
  — все `0`. Worker `…76ee` остаётся active на 100% с expected disabled
  provider/public vars и двумя Cron; scheduled journal не имеет running/failed
  rows. Canonical Access probes снова дали anonymous `302`, invalid `302`, valid
  root `200`, valid health `204` с empty body/`no-store`/`noindex`.
- Source/restore R2 archive/quarantine роли остаются четырьмя distinct private
  EEUR bucket, каждый `0 objects / 0 B`. Fresh D1 Time Travel info был только
  прочитан; bookmark не печатался, его digest
  `2aa4c2e747d30f7511354d3398d69c7785a42404319659793af1ee3b738c2066`.
  Старый protected isolated-restore evidence остаётся целым и подтверждает
  `0001`–`0015`, 398 comparable schema objects, 124 tables, FK `0` и empty
  state, но он старше 24 часов и привязан к прежней provenance. Он не пригоден
  как fresh plan-bound Phase B recovery evidence.
- Fresh state обнаружил предусмотренный fail-closed prerequisite: source D1 не
  имеет academic period, а `import:legacy:plan:remote` читает его до создания
  plan и возвращает `ACADEMIC_PERIOD_UNKNOWN`. Direct SQL запрещён, а прежний
  `db:period:local` не является remote boundary. Никакой plan artifact поэтому
  не создавался.
- Локально подготовлены отдельные
  `db:period:confirmation:remote`/`db:period:remote` entrypoints. Confirmation
  только читает exact ignored config и clean exact HEAD; apply требует explicit
  `--remote`, exact deployed D1 UUID, approved period fields, opaque operator,
  canonical timestamp и digest-bound typed confirmation. Child Wrangler config
  selector-free, write не retry-ится blind. Controlled SQL идемпотентно создаёт
  current period и append-only system audit, server-side проверяет exact row/
  audit и не заменяет conflicting code либо другой current period.
- Focused verification прошла: unit academic-period 6/6, shared bootstrap
  remote guards 6/6 и migrated Miniflare D1 contract 3/3. Integration доказал
  exact-repeat `1 period / 1 audit`, conflicting-display denial и сохранение
  существующего current period. Полные local gates также прошли: `npm run
check` — 0 errors/warnings; `npm test` — 68 файлов, 521/521 tests; `npm run
build`; `npm run docs:check` — 162 links/55 files, 108 commands и continuity;
  `npm run release:scan` — 544/544; `git diff --check`. Immutable candidate
  commit ещё должен быть создан до independent review.
- Ни один D1/R2/Worker/Access/secret/flag/provider/import/bootstrap/production/
  DNS/CMS/official-site write или send не выполнялся. Ближайшая boundary —
  independent read-only review нового exact academic-period candidate. Только
  после GO отдельно требуются data-owner values для code/display/dates/current
  и exact разрешение на одну preview D1 provisioning mutation; оно не разрешает
  последующие import transitions или recovery writes.

## Continuation 2026-08-24: academic-period independent NO-GO

- Exact candidate `73d41ab855cfd670f24b6791563e335f6828e446` с direct
  parent `920c3ee8fe240cfd889d66d637fb46b8ecb93938` и clean 14-file
  diff прошёл отдельно порученный independent read-only review. Verdict —
  **NO-GO**: 1 BLOCKER и 2 HIGH. Никакой remote/protected mutation review не
  выполнял.
- BLOCKER: actual ignored preview Wrangler config value-free имеет ожидаемые
  `APP_ENV=preview`, один DB binding, exact D1 UUID и не содержит selector, но
  его account target не является допустимым exact 32-hex account ID. Runtime
  guard останавливается с `CLI_ACCOUNT_ID_INVALID`; доступного env override нет.
  До безопасного заполнения exact account ID из authorised local/read-only
  Cloudflare context confirmation/apply boundary практически неисполняема.
- HIGH: controlled SQL использует `INSERT OR IGNORE` отдельно для period и audit,
  а terminal assertion проверяется клиентом уже после выполнения statements.
  Independent reproduction exact rendered SQL с заранее занятым несовместимым
  deterministic audit ID получил `1 period / 0 valid audit`. Remediation должна
  отсечь конфликт до period insert либо обеспечить настоящий server-side atomic
  rollback и закрепить case migrated D1 integration test.
- HIGH: malformed/truncated JSON после dispatch write-команды сейчас даёт
  `ACADEMIC_PERIOD_REMOTE_RESULT_INVALID`, хотя commit мог состояться. Отдельного
  SELECT-only reconcile action/entrypoint нет, а runbook не содержит исполнимой
  exact reconciliation команды. Remediation должна классифицировать такую
  неопределённость как `ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS`, добавить
  exact-argument `applied|not_applied|conflict` reconciliation и покрыть
  timeout/malformed before/after-commit scenarios.
- Review gates были зелёными, но не перекрывают findings: focused 4 files/24
  tests; `npm run check` — 0 errors/warnings; полный `npm test` — 68 files,
  521/521; `npm run build`; `npm run docs:check` — 162 links/55 files, 108
  commands и continuity; `npm run release:scan` — 544/544; candidate
  `git diff --check` — passed. Worktree после review был exact и clean.
- Владелец уточнил period code `2026-2027`. Display name, inclusive dates,
  current flag, operator/timestamp и отдельное разрешение на preview D1 write
  не утверждены этим уточнением. Ближайший gate — local remediation всех трёх
  findings в Goal, новый immutable candidate и отдельный independent read-only
  review. `db:period:remote`, import transitions и любые прочие remote mutations
  до этого запрещены.
- Для следующей основной сессии подготовлен local Git-ignored role prompt
  `docs/prompts/stage-13-remediate-academic-period-boundary.md`. Канонические
  `IMPORT-09`/`AC-IMPORT-32`, test plan, traceability, active state, readiness и
  runbook stop condition синхронизированы с NO-GO. Проверка documentation
  checkpoint: standalone `npm run check` — 0 errors/warnings; полный
  `npm test` — 68 files/521 tests; `npm run build`, `npm run docs:check`,
  `npm run release:scan` и `git diff --check` — passed. Отдельная transient
  ошибка
  первого `npm run check` была вызвана одновременной генерацией `.svelte-kit`
  параллельным build; последовательный повтор полностью зелёный.

## Continuation 2026-08-24: academic-period NO-GO remediation

- Remediation выполнялась строго против exact failed candidate
  `73d41ab855cfd670f24b6791563e335f6828e446` / direct parent
  `920c3ee8fe240cfd889d66d637fb46b8ecb93938`. Canonical `IMPORT-09` и
  `AC-IMPORT-32` сохраняют правило atomic exact pair и обязательный SELECT-only
  reconcile после любой post-dispatch uncertainty; open business question не
  преобразовывался в правило.
- BLOCKER actual config закрыт из существующего authorized protected local
  control `imports/legacy-preview-control.json`: в ignored
  `wrangler.preview.toml` добавлен только exact account target. После изменения
  target value-free проходит Git-ignore, current-user owner/ACL-only,
  `APP_ENV=preview`, один exact `DB` binding, valid 32-hex account shape, valid
  D1 UUID shape и отсутствие selector; generated child config имеет no vars,
  no secrets и no resource selector. Account/resource values, token, cookie и
  secret не выводились и в tracked evidence не записывались.
- Write boundary теперь отправляет три statements одной D1 batch: conditional
  deterministic audit insert, conditional period insert, зависящий от успешной
  вставки audit или exact replay, и terminal exact-state SELECT. D1 batch
  rollback и fail-closed preconditions не допускают partial business state.
  Preoccupied incompatible deterministic audit ID оставляет исходный audit
  неизменным и не создаёт period; exact replay сохраняет `1 period / 1 audit`.
- Child Wrangler timeout ограничен 30 секундами. Dispatch rejection,
  timeout/transport loss, malformed/truncated/non-JSON stdout и invalid result
  shape после write классифицируются только как
  `ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS`; write автоматически не
  повторяется.
- Добавлен `db:period:reconcile:remote`. Он требует те же exact inputs и
  digest-bound confirmation, строит ровно один SELECT и возвращает только
  `applied|not_applied|conflict`. Runbook требует сохранить byte-exact
  timestamp/confirmation/arguments: `applied` запрещает replay, `not_applied`
  требует stop и отдельного решения до любого write, `conflict` запрещает
  write/direct SQL и требует расследования.
- Focused verification прошла: 4 файла/33 tests. Она включает missing/invalid
  account fail-closed, value-free config output, SELECT-only SQL, deterministic
  audit-ID collision без partial period, injected full-batch rollback, timeout
  before/after commit и malformed-after-commit reconcile. Standalone `npm run
check` завершился с 0 errors/warnings. Полные gates, immutable candidate и
  отдельный independent review следуют дальше.
- Никакой D1/R2/Worker/Access/secret/flag/provider/import/bootstrap/production/
  DNS/CMS/official-site remote mutation, remote reconcile или send не
  выполнялись. Owner-approved только code `2026-2027`; display name, inclusive
  dates, current, operator, timestamp и отдельное разрешение на одну preview D1
  write остаются заблокированными даже после будущего independent GO.
- Полная обязательная worktree-проверка также прошла: `npm run check` — 0
  errors/warnings; полный `npm test` — 68 файлов/530 tests; `npm run build`;
  `npm run docs:check` — 163 links/55 files, 109 executable commands и
  continuity; `npm run release:scan` — 544/544; `git diff --check` и focused
  Prettier check. Следующий локальный шаг — immutable remediation candidate,
  exact-SHA повтор gates и отдельный role-specific read-only review prompt.

## Continuation 2026-08-24: immutable academic-period remediation anchor

- Создан immutable local remediation anchor
  `723e94715c2764f829bf718c49989428fa3c169a` с direct parent exact rejected
  candidate `73d41ab855cfd670f24b6791563e335f6828e446`. Exact diff — 14 files,
  817 additions/144 deletions: девять canonical/test-plan/traceability/
  readiness/runbook/handoff docs, `package.json`, два academic-period scripts и
  два academic-period test files. Migration, `src`, deploy config, production
  resource или application route не изменялись.
- Clean exact `723e947…` повторно прошёл всю обязательную цепочку: focused 4
  files/33 tests; `npm run check` — 0 errors/warnings; полный `npm test` — 68
  files/530 tests; `npm run build`; `npm run docs:check` — 163 links/55 files,
  109 executable commands и continuity; `npm run release:scan` — 544/544;
  `git diff --check`. Worktree после exact-SHA chain был clean.
- Actual ignored protected preview config повторно проверен value-free:
  target/config summary полностью `true`, Git-ignore и current-user-only ACL
  сохранены, child selector/vars/secrets отсутствуют. Ни account/resource ID,
  ни credential в tracked evidence не записаны.
- `723e947…` является только кандидатом на отдельный independent read-only
  review, а не GO. Даже будущий GO не разрешает `db:period:remote`: отдельно
  отсутствуют display name, inclusive dates, current, operator, canonical
  timestamp и exact permission на одну preview D1 mutation. Remote reconcile,
  D1 write и любые прочие remote actions не выполнялись.

## Continuation 2026-09-04: Prompt 05 second-registration preflight

- Owner invoked the single second synthetic-parent registration prompt. One
  bounded read-only preflight matched the completed first-account checkpoint,
  exact reviewed deployment, protected target, Access and recipient allowlist.
  No registration, provider delivery or other remote mutation was attempted.
- The browser form is prepared for private owner input. Actual second-recipient
  membership must pass before POST; the known automatic welcome delivery needs
  explicit scope before verification. First account and sessions remain intact.
- Aggregate-only evidence, its digest, retained permissions, containment and the
  sole current next action are recorded in
  [active state](../STAGE_13_ACTIVE_STATE.md), section
  "Second registration preflight and private browser input — 2026-09-04".
- Runtime/config remain unchanged. Exact-candidate full release/review evidence
  is reused; this session runs only docs checks, release scan and diff check.

## Continuation 2026-09-04: second-recipient private validation

- The owner-supplied filled-form screenshot resolved the browser observation
  limitation. A local OCR/hash comparison proved that its sole email matches
  protected allowlist slot 2; no identity or raw screenshot was saved to evidence.
- No registration or provider send was attempted. The checked form remains
  ready for the owner's one authorized submission, followed by the mandatory
  bounded reconciliation/checkpoint. See the dated recipient-validation section
  of [active state](../STAGE_13_ACTIVE_STATE.md) for evidence and containment.
- Only docs checks, release scan and diff check apply; runtime is unchanged.

## Continuation 2026-09-04: second registration and delivery

- The owner's single second registration and receipt of its verification email
  were confirmed by one aggregate-only read-only reconciliation. The added
  parent remains unverified, the first-account session counts remain unchanged,
  administrators remain absent, and no extra delivery was found.
- The per-mutation active-state checkpoint records exact before/after counts,
  unchanged candidate/target controls, protected evidence digest and containment.
  See [active state](../STAGE_13_ACTIVE_STATE.md), section
  "Second controlled registration and verification delivery — 2026-09-04".
- No link was opened or login attempted. The known automatic welcome delivery
  requires explicit scope before verification. Only docs checks, release scan
  and diff check are run; exact-candidate runtime/review evidence is reused.

## Continuation 2026-09-04: second verification and welcome

- Following the owner's explicit welcome permission, one verification and its
  welcome delivery were reconciled successfully. Both synthetic parents are
  verified with distinct families; aggregate per-owner delivery and relationship
  checks found no extra sends or cross-links. The first parent's sessions remain
  unchanged and the second parent has no session yet.
- The mandatory checkpoint, protected evidence digest and exact next action
  are in [active state](../STAGE_13_ACTIVE_STATE.md), section
  "Second email verification and welcome delivery — 2026-09-04". Prompt 05 still
  authorizes one second-account login; bootstrap remains outside scope.
- Runtime/config are unchanged. Only docs checks, release scan and diff check
  are run; full exact-candidate runtime/review evidence is reused.

## Continuation 2026-09-04: Prompt 05 complete

- The owner opened the second verified parent's cabinet after one login.
  Its single bounded read-only postcondition proves two distinct verified
  synthetic parents, distinct families, one valid session per owner, unchanged
  first-parent session totals, no checked owner cross-links, no extra sends and
  zero administrators/bootstrap. Prompt 05 and its separately authorized welcome
  delivery are complete; no logout or role mutation is implied.
- Exact before/after session counts, the protected evidence digest and retained
  containment are in [active state](../STAGE_13_ACTIVE_STATE.md), section
  "Second verified-parent login and Prompt 05 completion — 2026-09-04".
  A normal just-started fast cadence observed during the snapshot does not
  reopen the successful deployment gate.
- Full release/review evidence is reused from the exact candidate recorded in
  active state. Only docs checks, release scan and diff check were run; runtime,
  migrations, dependencies and config are unchanged. Full manual preview and
  production still require their later gates, and bootstrap requires a separate
  explicit owner instruction.

## Continuation 2026-09-04: Prompt 06 stopped before bootstrap

- The owner's one-shot bootstrap scope was read and its preview target, exact
  candidate, migration ledger, Access and two verified synthetic identities were
  checked without mutation. The official bootstrap CLI was not invoked.
- A concrete mandatory-flow P1 was isolated: ordinary email verification writes
  a successful empty-portal family finalization, while the role guard rejects
  every such finalization. All other retained-state branches were empty. Existing
  bootstrap success fixtures omit the ordinary verification record. No role
  repair, evidence deletion, code change or review loop was performed.
- A separate observed logout of the second parent means its earlier valid
  session is no longer current. No fresh login or session repair was attempted.
- Counts, fingerprints, protected evidence hashes, permission boundary,
  containment and the sole current next action are in
  [active state](../STAGE_13_ACTIVE_STATE.md), section
  "Prompt 06 preflight: registration finalization blocks bootstrap — 2026-09-04".
- Prompt 06 prohibits code changes, so a local eligibility fix needs an owner
  scope decision. This session uses only docs checks, release scan and diff
  check; unchanged-candidate test/review results remain historical evidence and
  do not override the demonstrated bootstrap blocker.

## Continuation 2026-09-04: local bootstrap eligibility fix

- The owner authorized the local AUTH-09 correction after Prompt 06 preflight
  stopped. A successful empty-portal verification receipt is now registration
  evidence; exact-email finalization and other retained business/workflow state
  still block both role-transition entrypoints. Receipts are not removed.
- A new regression uses ordinary registration and the runtime's default family
  verification extension. It reproduced the failure before the fix and now
  covers both bootstrap transports, normal assignment, receipt/session/audit/
  control preservation and negative retained-child/exact-email cases.
- Final focused evidence covers 52 unit/integration tests across nine files,
  including the resolved and individually rerun SQL test-adapter case; two
  Chromium role/owner/CSRF scenarios, check and build passed. Full release and
  independent review remain pending for the new runtime; old results are not
  presented as a release gate for this change.
- See [active state](../STAGE_13_ACTIVE_STATE.md), section
  "Local AUTH-09 bootstrap eligibility remediation — 2026-09-04", for the exact
  implementation commit, logs, unchanged remote state, permissions and next gate.
  No remote write, bootstrap, deploy or session/provider action was performed.

## Continuation 2026-09-04: owner-requested scoped bootstrap review

- The owner requested a targeted prompt for a separate review session instead
  of the previously scheduled full-suite cycle. Exact diff inspection confirms
  one executable guard change with two immediate consumers; the generic full
  gate next action is superseded for this candidate, not repository-wide.
- A dedicated ignored 06A prompt now defines one independent code review, one
  three-file/eight-test run, inherited baseline/52-test/E2E/check/build evidence,
  exact evidence hashes and bounded fallback only for a concrete missing fact.
  No second review or automatic full suite follows a valid scoped GO.
- The active protocol, pending verdict, unchanged preview state and next action
  are in [active state](../STAGE_13_ACTIVE_STATE.md), section
  "Scoped validation decision for the bootstrap fix — 2026-09-04". The reviewer
  will also establish whether the next out-of-band CLI bootstrap actually needs
  a Worker deploy; no remote permission is granted by preparing this prompt.
- This preparation is docs-only: docs checks, release scan and diff check only.
  No runtime test, independent review or remote action was performed here.

## Continuation 2026-09-04: independent scoped bootstrap review GO

- At `2026-09-04T12:12:34Z`, exact implementation candidate
  `438a51399ac5f58b428b624c52ca2cbbc059ae9c` received independent **GO** under
  the owner-selected scoped gate. New findings: `P0: 0`, `P1: 0`, `P2: 0`,
  `P3: 0`. No nested reviewer, runtime edits or test edits were used.
- Clean inspected HEAD `3c386c3977b67faac42d33f15df09438e7350cd5` is a docs-only
  descendant. Baseline ancestry and all 17 changed paths prove one executable
  guard change, one new test file and 15 docs files, with unchanged migrations,
  dependencies, config, CLI, hooks, routes and session implementation.
- One independent three-file run passed all 8 tests. Ignored output:
  `tmp/bootstrap-registration-review-06a-20260904.log`, SHA-256
  `b1f85f62927e2f2e4315d82f7aff8982d70417a5cb7903ed677c65f09861a19d`.
  The 51-pass/one-adapter-failure implementation log and successful one-test
  correction rerun were reconciled; all five inherited log hashes matched.
  The other 44 related tests, two Chromium scenarios, check/build and exact
  baseline `0db38842524ebc146eaa56a9d089e3c3484bf0f3` full Vitest/E2E/dependency
  evidence are reused for unchanged surfaces, not represented as fresh runs.
- Local CLI imports the corrected builder and executes directly against pinned
  D1; it does not call the deployed Worker. No Worker deployment is necessary
  for that bootstrap operation. Local SQL regression executes all seven
  controlled statements, including terminal SELECT; remote transport was not run.
- No remote reads/writes, bootstrap, session/provider actions or authenticated
  preview access occurred. Production and full manual preview remain blocked.
  Only required current-review/compatibility markers were synchronized outside
  active state/handoff; production readiness/business rules were not changed.
- The one next action and permission/containment boundary are in
  [active state](../STAGE_13_ACTIVE_STATE.md#independent-scoped-bootstrap-review-go-2026-09-04):
  prepare the exact-preview CLI bootstrap continuation with fresh read-only
  eligibility/session preflight. No new generic full gate or reviewer follows
  this GO for the unchanged diff. `rollover_required: no`;
  `recommended_next_session_mode: Medium`, because next is read-only preparation.
- Docs-only checkpoint validation: `docs:check`, `release:scan`, `git diff --check`;
  no runtime rerun after the checkpoint commit.

## Continuation 2026-09-04: exact-target CLI bootstrap preparation passed

- At `2026-09-04T12:25:36Z`, owner-requested read-only preparation succeeded.
  Clean `ad18c84205b2f95b0777484e012653a9533e6259` retains exact reviewed CLI
  source `438a51399ac5f58b428b624c52ca2cbbc059ae9c`; config and target match
  protected evidence. Worker version/bindings are unchanged; anonymous Access
  redirect and Time Travel availability were freshly confirmed.
- Seven SELECTs read 970 rows, wrote 0, with 0 changes and changed_db=false.
  Ledger is exactly through `0026`; both synthetic parents are verified, active
  and eligible under the corrected guard. Admins 0; control available;
  actions/assertions/audits `0/0/0`; six seal triggers present. Registration
  receipts and provider counts are intact. Session aggregates remain first
  `2/1/1`, second `1/0/0`; the second parent's existing logout was not repaired.
- Official CLI options/target/confirmation helpers validated the actual arguments
  in memory; all seven controlled statements were rendered but not executed.
  The old baseline-pinned wrapper was not used. New read-only helper syntax and
  actual preflight passed; no write mode exists. No Worker deployment is needed.
- Protected evidence: `tmp/bootstrap-cli-preflight-20260904-owner/preflight-safe.json`,
  SHA-256 `4a7310332696c017ff46c69474b05d2289bf2bd9fa2fd00775f98da28fb5d3bc`.
  The exact command mapping, private recovery evidence, expected role/session/
  audit/control postcondition and no-retry containment are in
  [active state](../STAGE_13_ACTIVE_STATE.md#exact-target-cli-bootstrap-prepared-fresh-read-only-preflight-2026-09-04).
- Bootstrap/remote mutation/provider send/authenticated preview invocations: 0.
  One next action is the single official exact-preview bootstrap under Prompt
  06's unconsumed scope, after a fresh bounded recheck when continued. It must
  checkpoint immediately after its read-only reconciliation; no live session
  recovery or additional writes are implied. Full preview/production remain blocked.
- Checkpoint validation: helper syntax, fresh read-only preflight, docs checks,
  release scan and diff check. Runtime/tests/config/dependencies are unchanged,
  so inherited review and test gates are reused. `rollover_required: no`;
  `recommended_next_session_mode: High`: known target, procedure, postcondition
  and Time Travel containment, with no unresolved mutation ambiguity.

## Continuation 2026-09-04: one official bootstrap succeeded; live roles pending

- The owner explicitly authorized execution within the earlier one-bootstrap
  scope. Exactly one repository-root `npm run admin:bootstrap` invocation used
  reviewed candidate `438a51399ac5f58b428b624c52ca2cbbc059ae9c` from clean
  docs-only HEAD `9c8a52fb21dfcdc5de5366046c6bee42ac3f9320`. CLI exit 0/status
  consumed at `2026-09-04T12:40:37Z`; read-only postcondition success at
  `12:40:39Z`. No retry or additional remote mutation occurred.
- Fresh preflight used eight SELECTs/972 rows read/0 writes and verified exact
  target, deployed bindings, Access redirect, ledger through `0026`, both
  eligible parents, available control and unchanged sessions. Time Travel was
  refreshed before the attempt. Worker deployment was unnecessary and not done.
- Nine postcondition SELECTs read 979 rows, wrote 0, changes 0, changed_db=false.
  The first account is admin/version 2 with sessions `2/0/0`: one old logout and
  one role-change revocation. The second remains parent/version 1 with sessions
  `1/0/0`, its previous logout unchanged. Control consumed; exactly one linked
  action/assertion/audit/control chain matches the CLI request; six seal triggers
  remain. Exact registration receipts, provider counts and other checked state
  are unchanged. Both accounts now have no valid application session.
- Prompt 06 is **partial**: bootstrap/role/session/audit/control have live evidence;
  replay denial uses sealed state and inherited tests. Fresh admin login and live
  authenticated role/owner/CSRF verification have not run. Those create/touch
  sessions beyond the authorized bootstrap mutation. Full manual preview and
  production remain blocked; no generic full suite or new reviewer is scheduled.
- Evidence: `tmp/bootstrap-cli-execution-20260904-owner/operation-safe.json`,
  SHA-256 `9b1dea913cd5fc288f9ca0f4c0fd280035601b8f34d15c98a87ebb53da2527ef`.
  See [active state](../STAGE_13_ACTIVE_STATE.md#one-official-exact-target-bootstrap-succeeded-2026-09-04)
  for exact postcondition/recovery hashes, permission consumption and containment.
  No credentials, identities or full resource IDs are in this tracked checkpoint.
- One next action is first admin login after explicit scope for its normal
  session creation/touches, then bounded reconciliation and checkpoint. No
  bootstrap retry/reset, session repair, provider/config/Access change or CMS
  action is allowed by the completed request. `rollover_required: no`;
  `recommended_next_session_mode: High`: known login target and postcondition,
  separate permission boundary, no ambiguity or serious recovery risk.
- After-mutation checkpoint checks: `docs:check`, `release:scan`, `git diff --check`
  only. Existing scoped GO/test evidence is inherited because runtime, tests,
  migrations, dependencies and config did not change. No new P0/P1 was found.

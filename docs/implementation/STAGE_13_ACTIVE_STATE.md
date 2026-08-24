# Stage 13: активное состояние

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-08-24T16:41:24Z
reviewed_candidate: 8362ffa875dde563519d91482e5aa5c8d6a2eca5
last_completed_gate: phase-b-academic-period-boundary-local-remediation
next_gate: phase-b-academic-period-boundary-immutable-candidate-review
nearest_milestone: full-manual-preview
manual_preview_status: blocked
production_status: blocked
-->

Этот файл — короткий tracked operational checkpoint, а не источник
бизнес-правил. При конфликте действуют спецификация, тематические документы,
readiness contract/checklist, roadmap и persistent handoff.

## Постоянная цель

Ближайшая цель — получить Access-protected preview, в котором владелец может
вручную проверить весь MVP в максимально полном канонически допустимом виде на
синтетических данных без PII: разрешённые пути проходят end-to-end, а путь,
который по legal/security policy обязан оставаться выключенным, проходит явный
fail-closed negative smoke с зафиксированной причиной. После этого процесс
продолжается до production readiness и отдельно разрешённого production deploy.

`full-manual-preview` достигнут только когда владелец получил URL и пошаговый
manual test plan, два контролируемых verified account работают с разными ролями,
первый admin bootstrap проверен, а user/admin/import/operations/email/Telegram/
Browser-contract/upload и обязательные security/accessibility сценарии либо
выполнены в preview, либо имеют канонически обязательный и проверенный
fail-closed verdict. Один deploy, login, import или bootstrap эту цель не
закрывает.

## Последний закрытый gate

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

## Фактический preview baseline

- Exact preview Worker уже deployed на 100%, canonical hostname защищён
  Cloudflare Access, versioned preview routes закрыты; повторный Worker deploy
  сейчас не нужен.
- Preview D1 имеет migrations `0001`–`0022`, pending `0`, FK violations `0`, но
  business state пуст: нет academic period, current promoted legacy snapshot,
  users или admins; bootstrap control доступен и не использован.
- Два preview R2 bucket private/EU и пусты.
- Public auth, прикладной email, Telegram, document upload, contract send,
  public statutory и media paths остаются fail-closed. Scheduled operations
  отдельно deployed и активны.
- Production verdict остаётся **NO-GO / blocked**; production и официальный
  сайт не входят в разрешение preview-гейтов.

## Не повторять

- Не повторять migrations `0001`–`0022`, preview Worker deploy, Access perimeter
  setup, empty-R2 verification или Phase A D1-contract implementation/review,
  пока fresh read-only reconciliation не обнаружит drift.
- Не пытаться создать bootstrap target direct SQL или включить auth до current
  promoted snapshot: verification fail-closed по каноническому контракту.
- Не использовать ordinary preview для Access/Office PII и не считать
  `feature_disabled` доказательством работоспособности включённого provider path.

## Точная цепочка до full manual preview

1. Создать новый immutable candidate из local remediation всех 1 BLOCKER/2 HIGH
   finding candidate `73d41ab…` и получить отдельный independent read-only GO.
   Reviewer обязан проверить actual config value-free, atomic period/audit
   denial и SELECT-only exact-argument reconciliation. Только затем
   запросить exact owner values/permission на одну preview D1 запись; direct SQL
   запрещён. Владелец подтвердил code `2026-2027`, но display/dates/current
   остаются отдельными explicit inputs.
2. Создать no-write baseline plan и fresh plan-bound recovery point.
3. В отдельных независимых ролях выполнить разрешённый synthetic/no-PII import
   lifecycle `plan → stage → review → recovery evidence → promote → verify →
   rollback → verify → roll-forward → verify`, получив ровно один current
   promoted snapshot.
4. Подготовить, независимо проверить и отдельно разрешённо deployed preview
   auth/email candidate; ограничить email smoke согласованными test recipients.
5. Владелец лично создаёт и подтверждает два account, не передавая password,
   OTP, verification link, cookie или token.
6. После exact permission выполнить one-shot bootstrap корпоративного
   empty-state account и проверить audit, replay denial, session revoke, admin
   RBAC и сохранение parent-only роли второго account.
7. Пройти guided full manual preview plan: family lookup/registration, parent и
   admin workflows, security/IDOR/CSRF/session, operations/manual jobs/failures,
   pricing, synthetic Browser contract lifecycle, synthetic upload/local-AV,
   accessibility/mobile/keyboard, а также отдельно разрешённые email и один
   минимизированный Telegram preview smoke.
8. Обновить checklist/handoff после каждого блока. Legal/privacy/provider paths
   без требуемого approval не включать молча: получить owner input либо проверить
   предусмотренный каноническим контрактом fail-closed режим.

## Когда агент обязан остановиться

Без вопроса выполняются local/read-only/reversible действия в текущем scope,
проверки и документация. Остановка допустима только когда нужен:

- exact owner permission на remote mutation, deploy/rollback, provider send,
  secret/Access/security mutation или production action;
- независимый reviewer/operator, которого нельзя изображать той же identity;
- ввод владельцем password/OTP/verification link или другой credential;
- owner/legal/privacy решение, которое нельзя вывести из канонических docs;
- rollover в новую сессию из-за потери точного target/permission/rollback state.

Перед такой остановкой агент завершает всю безопасную подготовку, обновляет этот
checkpoint, readiness checklist и `handoffs/stage-13.md`, выполняет docs/diff
checks и задаёт один точный вопрос с environment, scope, expected result, stop
condition и rollback. После успешного gate агент сам переходит к следующему
разрешённому prerequisite.

## Ссылки состояния

- [Readiness checklist](../operations/PRODUCTION_READINESS_CHECKLIST.md)
- [Deployment runbook](../operations/PRODUCTION_DEPLOYMENT.md)
- [Import pipeline](../operations/IMPORT_PIPELINE.md)
- [Persistent Stage 13 handoff](handoffs/stage-13.md)
- [Постоянная команда продолжения](../prompts/stage-13-continue-deployment.md)

## Проверка continuity worktree

- Local remediation прошла обязательную worktree-цепочку: focused 4 файла/33
  tests; `npm run check` — 0 errors/warnings; полный `npm test` — 68 файлов,
  530/530 tests; `npm run build` — passed; `npm run docs:check` — 163 links/55
  files, 109 executable commands и continuity passed; `npm run release:scan` —
  544/544; `git diff --check` и focused Prettier check — passed. Immutable
  candidate seal и повтор exact-SHA gates выполняются перед independent review.
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

# Stage 13: активное состояние

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-08-24T14:50:03Z
reviewed_candidate: 8362ffa875dde563519d91482e5aa5c8d6a2eca5
last_completed_gate: phase-b-academic-period-boundary-local-implementation
next_gate: phase-b-academic-period-boundary-independent-review
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

1. Независимо проверить подготовленную local exact-target границу provisioning
   approved current academic period. Затем получить exact owner permission и
   выполнить только эту идемпотентную audited preview D1 запись; direct SQL
   запрещён. Код/display/dates/current должны быть явно утверждены data owner.
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

- Новый local academic-period boundary прошёл focused suites: 3 файла, 15/15
  tests, включая 3 migrated Miniflare D1 cases.
- Полные gates текущего worktree прошли: `npm run check` — 0 errors/warnings;
  `npm test` — 68 файлов, 521/521 tests; `npm run build` — passed.
- После обновления operational evidence `npm run docs:check` — 162 links/55
  files, 108 executable command lines и continuity passed; `npm run
  release:scan` — 544/544; `git diff --check` — passed.
- Worktree ещё не является independently reviewed candidate. До review нельзя
  выполнять `db:period:remote`; прежний reviewed candidate `8362ffa…` остаётся
  действующим только для уже repin-нутого Phase B import control.

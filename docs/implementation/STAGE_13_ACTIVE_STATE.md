# Stage 13: активное состояние

<!-- stage-13-continuity
schema: 1
updated_utc: 2026-08-24T13:58:11Z
reviewed_candidate: 8362ffa875dde563519d91482e5aa5c8d6a2eca5
last_completed_gate: phase-a-dedicated-preview-d1-independent-review
next_gate: phase-b-protected-provenance-and-synthetic-import-lifecycle
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

- Exact candidate `8362ffa875dde563519d91482e5aa5c8d6a2eca5` прошёл независимый
  read-only review dedicated-preview D1 contract: **GO**.
- Provenance, committed scope, Wrangler semantics, exact-target guards,
  ignored configs/ACL и полные local gates прошли. Review не менял remote state
  и не являлся разрешением Phase B.
- Проверки candidate: `npm run check`, `npm test` (66 файлов, 512 тестов),
  `npm run build`, `npm run docs:check`, `npm run release:scan` и
  `git diff --check` — passed.

## Фактический preview baseline

- Exact preview Worker уже deployed на 100%, canonical hostname защищён
  Cloudflare Access, versioned preview routes закрыты; повторный Worker deploy
  сейчас не нужен.
- Preview D1 имеет migrations `0001`–`0022`, pending `0`, FK violations `0`, но
  business state пуст: нет current promoted legacy snapshot, users или admins;
  bootstrap control доступен и не использован.
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

1. Синхронизировать protected ignored Phase B control provenance с reviewed
   candidate; затем подготовить exact scope и recovery point без remote write.
2. В отдельных независимых ролях выполнить разрешённый synthetic/no-PII import
   lifecycle `plan → stage → review → recovery evidence → promote → verify →
   rollback → verify → roll-forward → verify`, получив ровно один current
   promoted snapshot.
3. Подготовить, независимо проверить и отдельно разрешённо deployed preview
   auth/email candidate; ограничить email smoke согласованными test recipients.
4. Владелец лично создаёт и подтверждает два account, не передавая password,
   OTP, verification link, cookie или token.
5. После exact permission выполнить one-shot bootstrap корпоративного
   empty-state account и проверить audit, replay denial, session revoke, admin
   RBAC и сохранение parent-only роли второго account.
6. Пройти guided full manual preview plan: family lookup/registration, parent и
   admin workflows, security/IDOR/CSRF/session, operations/manual jobs/failures,
   pricing, synthetic Browser contract lifecycle, synthetic upload/local-AV,
   accessibility/mobile/keyboard, а также отдельно разрешённые email и один
   минимизированный Telegram preview smoke.
7. Обновить checklist/handoff после каждого блока. Legal/privacy/provider paths
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

- `npm run check`, `npm run build`, `npm run docs:check`,
  `npm run release:scan` (540/540) и `git diff --check` — passed.
- Обычный параллельный `npm test` завершился 507/512: пять D1 tests превысили
  свои timeout при общем времени 443 s, без assertion failures. Все пять
  отдельно перепроверены последовательно и прошли: legacy-import 1/1 в составе
  полного файла 13/13, messaging 3/3 и price-review 1/1. Это зафиксированный
  resource/parallel-timeout residual текущего worktree, а не скрытый зелёный
  full-suite verdict.

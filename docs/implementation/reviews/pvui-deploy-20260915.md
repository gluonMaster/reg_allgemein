# PVUI: проверка исправлений и готовности к preview deploy

**Вердикт: GO** для code-only публикации в существующий Access-protected preview.
Exact candidate: `f4ea330c4f637fb0fd09ca3e5bea7bb936cc9db3`; runtime полностью совпадает с
`a4a3952cc96c69d43e0692571a2bb3c018b36d52`. Между ними изменены только два E2E specs и тест-план.
Проверку 2026-09-15T17:41:29.673Z выполнила новая сессия Codex, не реализовавшая UI/R1/R2;
без subagent и второго человека. Это bounded release verification исправлений
и прежнего независимого review, а не новый полный product/legal audit.

## Проверка R1/R2 и scope

Исходный [независимый review](pvui-exact-candidate-20260915.md) проверил весь
UI diff и нашёл R1/P1 и R2/P2. Здесь проверены исправленные keyed course/mapping
lists, reset только при success, сохранение failure/retry и соседнего draft,
а также явное состояние message edits, связанное с course и сохраняющее пустые
значения при locale reload. Проверены непосредственные server actions:
owner/role/CSRF и существующие payload/idempotency guards сохранены.
Browser assertions R1/R2 прошли. Новых блокирующих P0/P1 на этих путях не выявлено.
Исторический NO-GO не распространяется на исправленный tree.

Manifest исходных исправлений совпал 397/397. После test-only доработки
395/397 остались неизменны, изменены только два E2E specs. Новый manifest и
hashes находятся в ignored `tmp/pvui-preview-20260915/candidate-safe.json`
и `candidate-files.sha256`. Runtime, schema, dependencies, deploy config
в этой сессии не менялись.

## Выполненные проверки

- `npm.cmd run check`: 0 errors/warnings.
- `npm.cmd test -- --maxWorkers=4`: **84/84 files, 623 passed,
  1 ожидаемый Windows skip**. Предварительный запуск с одним worker остановлен
  после 19 успешных tests для изменения параллельности; он не считается
  завершённым gate. Полный итог относится к новому четырёхпоточному запуску.
- `npm.cmd run test:e2e`: 36 passed, 4 failed. Три failure вызваны тем,
  что security test оставлял общий parent B заблокированным для следующих specs.
  Ещё один — быстрым вводом до hydration: subject очищался, submit не проходил
  browser required validation. Это P2 тестового harness, не подтверждённый
  отказ обязательного preview flow при готовой форме.
- Test-only fix возвращает fixture в unblocked через обычный admin action после
  всех negative assertions; старая session повторно проверяется как 401.
  Message test ждёт существующий hydration marker перед вводом. Assertions,
  timeouts, runtime и seed не ослаблены и не изменены.
- Focused completion: `npm.cmd run test:e2e -- tests/e2e/authenticated-access.spec.ts tests/e2e/catalog-contract-entry.spec.ts tests/e2e/parent-cabinet.spec.ts --grep 'revokes the target session|opens catalog contract|preserves inquiry edits|keeps edited inquiry|shows real pending actions'`
  — 4 passed, 1 failed: тот же pre-hydration ввод на первом входе в message form.
  После добавления ожидания также на первом входе/после rejection:
  `npm.cmd run test:e2e -- tests/e2e/catalog-contract-entry.spec.ts --grep 'preserves inquiry edits'`
  — 1/1 passed. Итого **40 разных Chromium scenarios** с успешным evidence;
  это documented completion, не единый green full-suite run.
- `npm.cmd run build`: passed; `npm.cmd audit --omit=dev`: 0 vulnerabilities.
- Strict actual-config Wrangler dry-run: passed. Module SHA-256:
  `ab054783c68d2329a66ed08ce025625fbfe4b8570bd6cd786506a0db3649557d`.
- `docs:check`, `release:scan`, `git diff --check`: docs/checkpoint gates.
  Каждый статусный commit получает только эти проверки.

Исходные failures/traces и все command logs сохранены в ignored
`tmp/pvui-preview-20260915/`. Local E2E использует отдельную D1 и synthetic
fixtures, без remote bindings/provider sends. Выборочно осмотрены mobile admin
catalog и desktop parent screenshots; полный E2E также проверяет reflow/DE/RU.

## Публикация и границы

Владелец прямо поручил deploy UI и исправлений 2026-09-15. Fresh target lock
подтвердил account/Worker/origin/D1 fingerprints, прежний module/version,
62 actual vars, bindings/secrets/Cron/Access, 26 migrations и pending 0.
Root 200, health HEAD 204; anonymous/invalid Access blocked. Совместимая
предыдущая Worker version доступна. Exact IDs и config остаются в protected evidence.
Новая отправка Telegram не выполнялась: bounded SELECT обнаружил у прежней
отложенной row sent, receipt и 2 attempts, unresolved unknown 0.

Одна code-only deployment operation сохраняет actual configuration и данные.
После попытки — actual version/module/annotation/traffic/settings/schema/counts/
HTTP read-back и отдельный docs-only checkpoint commit. При неоднозначности
сначала reconciliation, без blind repeat; rollback — captured compatible baseline.
Final publication outcome и следующий action находятся только в
[active state](../STAGE_13_ACTIVE_STATE.md).

После test-only/docs-only изменений повторный полный runtime suite не нужен:
runtime exact ancestor неизменён, затронутые E2E assertions проверены focused.
Не запускались remote parent/admin logins, business actions, provider sends,
новые migrations/imports, production/CMS операции или полный manual lifecycle:
этот deploy scope их не требует. Фактический post-deploy UI проверяется HTTP и
hash-проверкой JS/CSS; interactive parent/admin preview остаётся ручным gate владельца.
Full-manual-preview и production этим UI deploy не объявляются пройденными.
`rollover_required: no`; `recommended_next_session_mode: High` до deploy,
`Medium` после успешной публикации для owner inspection.

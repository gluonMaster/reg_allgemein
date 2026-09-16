# Preview: снятие ограничения email-получателей

Владелец 2026-09-16 поручил снять ограничение получателей в действующем
Access-protected preview. Новый адрес успешно зарегистрирован, но verification
остановлено до provider request с `RESEND_RECIPIENT_NOT_ALLOWLISTED`.
Это P1 для желаемого ручного регистрационного flow; прежнее ограничение работало
по старому правилу. Неясная формулировка success в UI — P2, отдельный backlog;
она не меняется в этом пакете.

Candidate: `3638dce8be9bb0a2155860dd055112c3f5b62a43`. Runtime diff относительно
опубликованного `f4ea330c4f637fb0fd09ca3e5bea7bb936cc9db3` ограничен parser/guard
`PREVIEW_EMAIL_RECIPIENT_HASHES` в `runtime.ts`. Exact `*` разрешает любой адрес;
старый список, отсутствующее/ошибочное значение и запрет preview-var в production
сохраняют прежнее поведение. Provider, outbox, auth routes, schema, dependencies,
Access и все остальные runtime настройки не меняются.

Новый режим распространяется на все email-уведомления preview. Он не запускает
пересылку `dead` rows: для незавершённой регистрации нужен обычный resend.
Обновлены канонический MESSAGING, acceptance criteria и пример конфигурации.
Адреса владельца в tracked файлы не добавлены.

Проверку diff выполняет реализующий агент, не независимый reviewer; новый
independent GO не заявляется. Исторический independent baseline и его evidence
сохраняются. Production и full-manual-preview gates этим не закрываются.

## Проверки

- Focused config/provider: 41/41 passed, включая реальный путь configuration →
  Resend adapter с перехваченным HTTPS transport, новый адрес и отсутствие
  request при отказе старого allowlist.
- `npm run check`: 0 errors, 0 warnings.
- Build выполнен из чистого detached worktree exact candidate; passed.
- Полный Chromium: 38 passed и два `page.goto: ERR_ABORTED`/HTTP 500 на
  `/admin/contracts` и `/messages?flow=absence` при параллельном local run.
  Оба без изменения runtime/test/timeout прошли в свежем focused completion:
  `tests/e2e/01-portal-ui-validation.spec.ts tests/e2e/absence-lifecycle.spec.ts`,
  2/2 passed. Все 40 разных сценариев имеют успешное evidence; это completion,
  а не единый полностью зелёный прогон. Первые traces/errors сохранены.
- Общий Vitest остановлен 2026-09-16T09:35:03Z по прямому уточнению владельца:
  только необходимые проверки для снятия email-ограничения. Полный suite
  не объявляется пройденным и не перезапускается. До остановки завершены
  восемь integration suites (86 tests), observed assertion failures 0;
  незавершённые suites не засчитаны. Этот общий запуск был избыточным для
  узкого parser/guard diff. Gate для этой публикации: 41 affected tests,
  check/build и exact-config dry-run; ранее выполненный Chromium сохранён
  как дополнительное evidence, без повторения.
- Strict Wrangler dry-run с актуальными settings и единственным var delta:
  passed; module SHA-256
  `4b3e652a21b4e2a0d3d6ce382e982511c5ad9894856226927674507ed2aab163`.

Protected evidence: `tmp/preview-email-open-20260916/`. Предшествующие pricing
изменения владельца исключены из candidate и сохраняются в рабочем дереве.
Dependency audit не повторяется: package/lock/toolchain неизменны, опубликованный
ancestor прошёл audit; текущая работа не добавляет внешних API или библиотек.

## Remote phase

Разрешена одна публикация candidate + wildcard в существующий preview.
Exact target fingerprints: account `5dbd04a4763a`, Worker `242c1796e930`,
D1 `ccdeb22bb2a1`, origin `88ed782ba25a`. Перед deploy — fresh read-only
сверка фактических bindings, vars, Access, schema, очереди и rollback.
После попытки — read-back version/traffic/module/config/Access/HTTP/D1,
затем отдельный docs-only checkpoint commit до любого дальнейшего write.
Rollback — captured предыдущая версия со старым списком, без schema migration.
Новых аккаунтов, сессий или писем агент не создаёт.
Фактический исход и следующее действие фиксируются в
[active state](../STAGE_13_ACTIVE_STATE.md).


## Фактический результат

Одна разрешённая публикация завершена 2026-09-16T09:36:38.220Z: success. Before
version fingerprint 761139c10e86, after 323a11197dcd, одна версия
на 100% traffic. Фактический модуль совпал с dry-run и upload; wildcard
подтверждён. Другие settings/bindings, Access, schema и bounded D1 snapshot
сохранены; health 204, registration/resend 200. Postcondition: 137 rows read,
zero written, operator provider sends 0. Root ignored config синхронизирована
с actual settings; protected копия — actual-wrangler.preview.toml в evidence
пакете. Rollback сохранён, не понадобился. Старое dead verification не повторялось.

Следующий шаг — владелец запрашивает новое письмо через обычную форму resend;
новая регистрация существующего аккаунта не нужна. Финальный status-only
checkpoint получает только docs:check, release:scan и git diff --check.

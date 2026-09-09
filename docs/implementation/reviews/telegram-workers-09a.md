# Telegram Workers: независимый review 9A

Фактическое завершение технического review: **2026-09-09T10:03:04Z**.
Reviewer: **Codex, новая сессия 9A, независимый code reviewer** подготовленного
исправления. Это проверка агентом в отдельной сессии, не второй человек и не
выдуманный subagent. Runtime и tests в этой сессии не изменялись.

**Вердикт: GO**, новых candidate P0/P1 нет. Scope — exact Telegram fix и
подготовленный маршрут восстановления существующего уведомления в отдельной
9B. GO открывает следующий `TG09-parent-code-deploy` под уже выданным owner
approval; он не доказывает remote delivery, full-manual-preview или production
readiness. Deployed parent-flow P1 остаётся открытым до фактического recovery.
Current operational state — [STAGE_13_ACTIVE_STATE.md](../STAGE_13_ACTIVE_STATE.md).

## Exact candidate и границы diff

| Объект | Проверенное значение |
| --- | --- |
| Runtime candidate | `23c3999d206ef9551f775a5dda2b30939cf746c7` |
| Его непосредственный parent | `115dfac1b1d35e3be4c42bcb310e273e42851c2e` |
| HEAD до review-документов | `b53cafb56daa98232e78a5c55d290b82fb509b27` |
| Последний recorded deployed runtime | `4a8c02816ef12947d6bd748dc690dcb2f46cdbd0`, fix отсутствует |
| Candidate Worker SHA-256 | `441dd3df4295f7146683638fa51654f060d06bbe7aed8cea5f7a1ccdf7212d51` |
| Candidate Worker size | 3429623 bytes |

Начальное worktree чистое; `git merge-base --is-ancestor` подтвердил ancestry.
Полный changed-path list candidate относительно его parent:

- `src/lib/server/telegram/bot-api.ts`;
- `tests/unit/telegram-bot-api-provider.test.ts`;
- `tests/integration/telegram-workers.test.ts` (new);
- `tests/fixtures/telegram-worker.ts` (new);
- `docs/implementation/STAGE_13_TRACEABILITY.md`;
- `docs/implementation/TEST_PLAN.md`.

Полный changed-path list между candidate и исходным HEAD состоит только из:

- `docs/implementation/ROADMAP.md`;
- `docs/implementation/STAGE_13_ACTIVE_STATE.md`;
- `docs/implementation/STAGE_13_TRACEABILITY.md`;
- `docs/implementation/handoffs/stage-13.md`;
- `docs/operations/FULL_MANUAL_PREVIEW.md`;
- `docs/operations/OPERATIONS_RUNBOOK.md`;
- `docs/operations/PRODUCTION_READINESS_CHECKLIST.md`.

Дополнительного runtime/config/schema/migration/dependency drift нет. Runtime
diff — `redirect: 'error'` → `'manual'` и отказ принимать весь HTTP 3xx диапазон
до разбора envelope. Других runtime changes в candidate нет.

## Прослеженная цепочка

Проверены `SYS-04`, `MSG-04..07`, `OQ-036`, acceptance criteria раздела 9,
[MESSAGING.md](../../domain/MESSAGING.md), Telegram-раздел 3.1
[runbook](../../operations/OPERATIONS_RUNBOOK.md), Stage 13 roadmap, evergreen
continuation и адресные incident/local-fix/9A–9B handoff records. Открытых
продуктовых вопросов, требующих нового бизнес-правила, нет.

1. **Причина отказа и native fetch.** Прочитан весь `TelegramBotApiProvider`.
   Сохранённый RED log показывает четыре workerd failures до fix, включая
   пустой intercepted outbound и `TELEGRAM_PREFLIGHT_UNAVAILABLE`. Node CLI
   technical smoke не проверял этот runtime boundary. В GREEN default
   `globalThis.fetch.bind(globalThis)` вызывается из скомпилированного fixture
   внутри Miniflare/workerd; injected fetch в provider отсутствует.
   `outboundService` перехватывает все обращения с synthetic token/destination.
   Успешны send с exact receipt и последовательность
   `getMe/getChat/getChatMember/getWebhookInfo`. Compatibility date
   `2026-03-24` и flags `[nodejs_compat]` совпадают с сохранённым actual control.
   Source map готового Worker содержит provider source, совпадающий с Git
   candidate после нормализации CRLF. Это packaging/runtime evidence, не
   доказательство отсутствия исторической доставки у Telegram.
2. **Redirect и certainty.** `bot-api.ts:TelegramBotApiProvider.call` использует
   manual mode, отменяет body для 3xx и выдаёт send outcome
   `TELEGRAM_DELIVERY_UNKNOWN`, `retryable=false`, `delivery=unknown`.
   До `classifyRejected` такой response не доходит: даже body `ok=false/429`
   не разрешает retry/cooldown. Native 302/307 tests наблюдают ровно один
   исходный outbound, preflight redirect прекращает дальнейшие методы.
   Timer с AbortController, finally/clearTimeout и bounded JSON parsing
   сохранены; unit tests покрывают timeout, oversized/malformed response.
3. **Receipt и минимизация.** `send` сохраняет exact numeric chat ID,
   configured chat type и положительный safe-integer message ID. Token/chat
   остаются private fields; provider cause/description не выходят в safe error.
   `outbox/templates.ts:renderTelegramTemplate` по-прежнему требует exact
   allowlist keys/category/UUID/canonical time/admin path и стабильный reference
   из dedupe key. Plain text, disabled link preview и protect_content сохранены.
4. **Durable dispatch и остановка.** Прочитаны direct consumers
   `outbox/runtime.ts`, `providers.ts`, `outbox-worker.ts`, dispatch/unknown/
   resolution paths `outbox-repository.ts` и Telegram branch
   `operations/scheduler.ts`. `TelegramOutboxWorker.dispatchNext` ожидает
   `startTelegramDispatch` до provider.send. `safeTelegramError` направляет
   ambiguous outcome в `markTelegramUnknown`. Claim исключает unresolved
   unknown и stale dispatch markers; scheduler блокирует sole lane при
   unknown/dead и прекращает drain после unknown/retry/dead. Неопределённый D1
   commit после provider success не превращается в новую отправку.
5. **Один audited recovery.** Прочитаны обе `/admin/outbox` страницы и
   `verifiedAdminForm`: сервер проверяет admin/CSRF, exact outbox/attempt,
   confirmation и action. `resolveTelegramUnknown` сохраняет linked audit,
   append-only resolution/assertion и исходный attempt, связывает idempotency
   с exact input. При проверенном исходном `attempts=1/max_attempts=1` и
   actual `TELEGRAM_MAX_ATTEMPTS=1` действие `retry_after_review` с
   `message_absence_verified` устанавливает максимум 2 total attempts.
   Claim сохраняет этот manual limit; второй rejected outcome становится dead,
   ambiguous — unknown. Source/dedupe/reference не заменяются.

Актуальная [Cloudflare Request documentation](https://developers.cloudflare.com/workers/runtime-apis/request/)
описывает возврат 3xx вызывающему коду при manual mode. Также прочитаны
[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
и получены latest published workers types `5.20260908.1` в ignored review
directory без изменения зависимостей. Тип `redirect?: string` и общий список
режимов в документации сами по себе не доказывают поддержку `error` в данном
workerd: вывод об исходном отказе привязан к записанному RED и native tests.

## Recovery/deploy packet и обязательные preconditions 9B

Protected records `TG09-parent-1112-safe`, `TG09-parent-recovery-packet-safe`,
`TG09-parent-candidate-safe`, `TG09-parent-local-validation-safe`,
`TG09-parent-local-final-safe` и поздний
`TG09-parent-continuation-owner-approval.json` сопоставлены. Hash private
recovery packet и оба prompt hashes совпали с owner approval. Исторические
`permission=false/pending` не отменяют позднее разрешение.

Target fingerprints: account `5dbd04a4763a`, Worker `242c1796e930`, origin
`88ed782ba25a`, D1 `ccdeb22bb2a1`. Held outbox `ddbd7d01ec2e`, исходный attempt
`52edf4875835`. Full IDs и защищённые значения остаются в ignored evidence.

`full-manual-preview-canonical-time.toml` имеет SHA-256
`9d0b223decacc70bef02388396ec5a76b24f0e72560a439ee286e1e107934316`;
все 62 vars, compatibility settings, D1 и обе R2 bindings совпали с сохранённым
actual control. Это локальная сверка исторического snapshot. Корневой
`wrangler.preview.toml` не является deploy-ready snapshot: в частности, его
лимит попыток 5 вместо actual 1. `proposedDeployArgs` из старого packet также
требуют подготовки конфигурации с fresh comparison, а не буквального запуска.
Consumed smoke/enable helpers с прежним candidate pin не подходят для новой
операции; их markers нельзя очищать или обходить.

В 9B остаются обязательными:

- Перед code-only deploy: clean ancestry/material-diff check, fresh actual
  target/settings/queue observation, сравнение сохранённой конфигурации со всеми
  actual vars/bindings/secrets/Access/schedules, проверенный rollback baseline.
  После deploy — actual module hash/annotation, одна version с 100% traffic,
  preserved configuration/Access и тот же held unknown attempt.
- До единственной native audited resolution: fresh exact destination/reference
  absence, fixed deployed module, отсутствие другого deliverable Telegram work,
  исходный attempts/max limit и actual max-attempt policy 1. Исторический owner
  absence report и объяснение workerd-сбоя этого не заменяют.
- После resolution: matching audit/resolution/assertion, сохранённый исходный
  attempt/reference, максимум один новый normal-Cron attempt. Допустима race,
  при которой scheduled attempt уже завершился к read-back. Фактические receipt,
  одно видимое сообщение и последующая healthy cadence проверяются отдельно.
  Вне Berlin window ждать штатного окна; time override/new cohort запрещены.
- После каждой mutation attempt — actual read-back, active-state update и
  отдельный docs-only commit до следующей mutation. При failed/ambiguous —
  containment и сверка, без повторного submit/send. Rollback возвращает
  проверенный baseline module/version `7b3987503c77` с сохранением actual settings
  и unknown history; его известный provider defect сам по себе не разрешает
  снять hold или объявить flow исправленным.

## Findings и validation

| Приоритет | Результат в пределах review |
| --- | --- |
| P0 | Новых findings нет |
| P1 | Новых candidate findings нет; recorded deployed parent-flow P1 ещё требует 9B |
| P2 | Новых backlog findings нет |
| P3 | Новых findings нет |

Выполнена ровно требуемая focused regression:

```powershell
npx vitest run tests/unit/telegram-bot-api-provider.test.ts tests/integration/telegram-workers.test.ts
```

**2 files / 42 passed / 0 failed** (37 unit + 5 native Workers).
Log: `tmp/telegram-phase-09-owner/09a-focused-review.log`, SHA-256
`58b2d9f96138bc9c7f6680cb82b9e7d109c15279c2508b1e3e6c7d199cee84cf`.
Integrity results: `tmp/telegram-phase-09-owner/09a-review-integrity-safe.json`.

Для exact candidate унаследованы: check 0 errors/warnings; 80 Vitest files,
591 passed, один ожидаемый Windows skip в `e2e-run-lifecycle.test.ts`;
23 Chromium E2E; build; production dependency audit без vulnerabilities;
strict local dry-run с actual vars. Все семь log hashes сверены с validation
record, tails подтверждают результаты. Ранний GREEN 41 относится к версии
теста до добавления пятого preflight scenario; full log уже содержит 5 native
tests, а свежая 9A regression — все 42. Исторический GO от `4a8c028` не
использован как вердикт нового runtime.

Full suite/check/build/E2E/audit/dry-run повторно не запускались: нет нового
material runtime/config/schema/dependency diff или выявленного риска за
пределами focused coverage. Финальные docs-only gates пройдены:
`npm run docs:check` (287 links, 112 commands, continuity passed),
`npm run release:scan` (581 files, без запрещённых artifacts/secrets/PII),
`git diff --check` (без ошибок). Commit/clean-tree receipt сохраняется в
`tmp/telegram-phase-09-owner/09a-review-final-safe.json`.
Проверки production/runtime не расширялись ради синхронизации status markers.

Remote target reads, login, remote mutations, Telegram preflight и provider sends
в 9A: **0**. Следующая сессия — локальный prompt
`09B_HIGH_TELEGRAM_DEPLOY_RECOVERY.md`, следующий action только
`TG09-parent-code-deploy` после его fresh preconditions.
`rollover_required: yes`; `recommended_next_session_mode: High` — владелец выбрал
отдельную deploy-сессию, target/procedure/postconditions/containment известны.

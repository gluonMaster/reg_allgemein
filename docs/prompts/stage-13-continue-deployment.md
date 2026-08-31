# Продолжение Stage 13 до полного manual preview

Открой этот файл полностью и выполняй последовательно. Это единственный
постоянный tracked entry-point текущего preview deployment. Не выбирай другой
локальный `stage-13-*` prompt по имени или дате: одноразовые prompts могут быть
историческими, Git-ignored или role-specific.

## Цель этой программы

Как можно быстрее передать владельцу Access-protected preview, в котором он
сможет глазами и руками проверить весь MVP end-to-end на синтетических данных.
По `SYS-04`/`OQ-036` обязательны реальные preview-only Browser/R2/email,
Telegram normal-outbox и document upload/quarantine/manual-AV/business-review
paths. Stub, fake transport, `feature_disabled` или один automated test не
являются evidence работоспособности такого контура.

Эта программа заканчивается полным manual-preview checkpoint и его handoff.
Production readiness/deploy, официальный сайт, реальные PII/Office sources и
реальные клиенты — отдельная будущая программа с отдельным разрешением.

## Быстрый обязательный старт

1. Полностью прочитай `AGENTS.md`, `docs/README.md`,
   `docs/spec/MVP_SPEC.md` и `docs/spec/OPEN_QUESTIONS.md`.
2. Прочитай Stage 13 в `docs/implementation/ROADMAP.md`, previous-stage handoff,
   весь [active state](../implementation/STAGE_13_ACTIVE_STATE.md),
   [full-manual-preview runbook](../operations/FULL_MANUAL_PREVIEW.md) и
   [инструкцию владельца](../operations/OWNER_FULL_MANUAL_PREVIEW_GUIDE.md).
3. Из acceptance criteria, test plan, readiness checklist и большого deployment/
   operations runbook читай разделы только текущей фазы и прямые ссылки active
   state. В `handoffs/stage-13.md` прочитай верхний current-continuation блок;
   исторические разделы открывай лишь для конкретного evidence/provenance.
4. Выполни `git status --short`, `git rev-parse HEAD` и короткую read-only
   reconciliation только ресурсов текущей фазы. Не повторяй многочасовой общий
   аудит уже зафиксированного состояния и не делай reset/checkout/cleanup.
5. Одной короткой записью назови: текущую фазу, exact target/candidate/rollback,
   затронутые production paths, минимальные проверки и одну пакетную permission,
   если она уже нужна. Затем сразу выполняй всё разрешённое.

## Outcome-first triage

Следуй классификации `P0`–`P3` из `AGENTS.md`. Исправление до продвижения
обязательно только для воспроизводимого `P0/P1`: безопасность/PII/ownership,
неверный remote target или rollback, либо фактически сломанный обязательный
preview flow. `P2/P3` занеси в backlog и не открывай ради них новый review-loop.

Не начинай рефакторинг, общую полировку или расширение scope во время deploy,
если без этого текущий обязательный flow работает и безопасен. Несколько
связанных мелких исправлений объединяй в один пакет с одним focused test run.

## Review status

Review status и exact reviewed candidate бери только из active-state metadata.

- При `independent_go` не запрашивай новый review и не создавай новый candidate
  из-за status/docs-only child. Переходи к remote preview фазе.
- При настоящем independent `NO-GO` сначала проверь связь findings с текущим
  milestone. Исправь `BLOCKER/HIGH` и доказанно milestone-blocking `MEDIUM`,
  выполни focused regression изменённой поверхности и только необходимые gates.
  Новый immutable runtime candidate требует отдельного independent exact-SHA
  review; автор не присваивает себе GO.
- Нерелевантные LOW/обычные MEDIUM не должны заставлять повторять сотни tests
  или задерживать рабочий preview.

## Квазиатомарные фазы

Не смешивай все операции в один длинный непрозрачный запуск. После каждой фазы
зафиксируй коротко `result / evidence / next / rollback` и сразу продолжай.

### Обязательный post-mutation checkpoint

Remote mutation здесь — D1/R2 write, migration/import transition, Worker deploy/
rollback/traffic, Access/flag/var/secret mutation, provider send или bootstrap/
role/session mutation. После **каждой попытки** такой атомарной операции —
успешной, failed или ambiguous — и до следующей remote mutation:

1. выполни read-only postcondition против фактической целевой среды; exit code
   сам по себе не доказывает результат;
2. сразу обнови metadata и таблицу текущей фазы в
   [active state](../implementation/STAGE_13_ACTIVE_STATE.md);
3. запиши только sanitized evidence; exact IDs, secrets и PII оставь в
   защищённом Git-ignored evidence;
4. при `failed|ambiguous` не продвигай фазу и не повторяй write вслепую — сначала
   докажи containment либо зафиксируй hard blocker;
5. до следующей remote mutation создай небольшой docs-only checkpoint commit.
   Для него нужны только `docs:check`, `release:scan` и `git diff --check`;
6. handoff обновляй на границе фазы/сессии, readiness checklist — только при
   фактическом изменении gate, чтобы не раздувать историю после read-only команд.

Используй этот компактный tracked record:

```text
atomic_action: <что фактически пытались изменить>
observed_utc: <UTC>
phase: <current phase/block>
authorization_scope: <exact approved scope>
target_fingerprint: <sanitized target, без полного resource ID>
candidate_or_version: <exact SHA/version или n/a>
before: <подтверждённый факт до операции>
after: <read-only postcondition>
result: success|failed|ambiguous
evidence: <защищённый pointer или sanitized summary>
rollback_or_containment: <not-needed|completed|pending + факт>
next_atomic_action: <ровно одно действие>
rollover_required: yes|no
recommended_next_session_mode: Medium|High|Max
mode_reason_plain: <простое объяснение>
```

После checkpoint сообщи владельцу, что реально сделано и проверено, текущий и
следующий atomic step, нужен ли rollover и в каком режиме запускать следующую
сессию, если она понадобится. Не создавай новую сессию после каждого шага только
ради ритуала.

- `Medium` рекомендуй для следующего чисто read-only/docs/evidence/manual шага,
  если нет unresolved ambiguity и remote write.
- `High` — default для обычной плановой deploy-сессии, когда exact target,
  процедура, postcondition и rollback/containment известны.
- `Max` рекомендуй только при реальном серьёзном риске: возможна mutation не той
  среды/production; результат потенциально необратимой записи неоднозначен;
  recovery/rollback отсутствует или не сработал; есть data/schema corruption,
  Access/authorization bypass, secret exposure либо несовместимость deployed
  code/schema. Объясни без инженерного тумана: что может быть повреждено, какой
  факт на это указывает, почему `High` недостаточно и какое решение предстоит.

Обычный provider rejection, подтверждённый no-write timeout, косметический/UI
дефект, локализованная docs-ошибка или штатный fail-closed stop не повышают режим
до `Max`. Рекомендация режима не даёт новых permissions.

### Фаза 0 — lock цели

Read-only подтверди exact reviewed candidate, preview Worker/D1/R2/origin,
Access perimeter, pending migrations, предыдущую совместимую Worker version и
fresh candidate-bound recovery source. Любая production/CMS цель или drift —
stop. Без drift прежние зелёные фазы не переигрываются.

### Фаза 1 — recovery и schema

После одной exact owner authorization создай fresh candidate-bound recovery
evidence/isolated recovery, затем примени только ожидаемые append-only migrations
к preview и предусмотренной recovery copy. Проверь migration inventory, FK,
quick-check и ключевые counts. Не выполняй downgrade и не переписывай migration.

### Фаза 2 — fail-closed Worker deploy

Сделай candidate-bound dry-run и deploy exact reviewed Worker только в preview.
Сначала providers/public auth остаются fail-closed. Минимальный smoke: Access не
обходится, canonical root/health отвечает ожидаемо, exact Worker version активна,
D1/R2/Cron bindings не дрейфовали. При ошибке — containment и заранее
зафиксированный compatible Worker rollback; D1 не откатывается вслепую.

### Фаза 3 — controlled auth и роли

После отдельной пакетной authorization включи Resend/public auth только для
двух owner-controlled test recipients. Владелец сам вводит passwords/OTP и
открывает verification links. После двух verified synthetic accounts выполни
one-shot admin bootstrap штатной CLI, проверь audit/replay denial/session revoke
и отдельную parent-only роль второго account.

### Фаза 4 — реальные MVP-контуры preview

Включай и проверяй небольшими блоками:

1. parent/admin/catalog/trial/request/price/support/absence/privacy;
2. synthetic document → private quarantine R2 → forced admin download → current
   local AV → hash-bound attestation → отдельный business decision → cleanup;
3. четыре marked preview-review PDF через реальный Browser Run/private R2/email,
   включая один accept → different-admin formation/activation → certificate;
4. dedicated Telegram bot/channel: read-only preflight и ровно один отдельно
   разрешённый PII-free normal-outbox send с verify/reconcile policy.

Fake provider используется только для локальной regression, но не как evidence
этой фазы. Один сломанный блок не отменяет evidence уже завершённых независимых
блоков; исправляется только его affected surface.

### Фаза 5 — owner exploratory pass

Передай владельцу URL и guided checklist. Он проверяет desktop/mobile, тексты,
навигацию и основные роли глазами; агент параллельно смотрит только безопасные
correlation IDs/status/counts. Реальные дефекты классифицируются `P0`–`P3`.
`P0/P1` исправляются focused-пакетом, `P2/P3` идут в backlog.

Checkpoint достигнут только после реального owner pass всех обязательных
контуров. После этого обнови active state/checklist/handoff и останови программу
с отдельным production verdict; автоматически переходить к production нельзя.

## Проверки без пустых многочасовых прогонов

До каждой проверки перечисли изменённую surface и почему выбранный набор её
покрывает. Применяй правила `AGENTS.md` и `TEST_PLAN.md`:

- remote config/secret/migration/deploy без runtime diff получает target-specific
  preflight, postcondition и smoke, а не повтор полного local suite;
- docs/status-only diff получает `docs:check`, `release:scan` и
  `git diff --check`;
- unchanged reviewed runtime наследует exact full-suite evidence из active
  state; не запускать его ещё раз «для уверенности»;
- material runtime/migration/dependency/cross-cutting diff перед deploy требует
  релевантных focused tests и полной release-цепочки только в случаях,
  перечисленных в `AGENTS.md`;
- assertion failure релевантного test нельзя игнорировать, но unrelated suite не
  становится обязательным из-за одного documentation/config шага.

## Permission и human boundary

Без вопроса разрешены local/read-only inspection, docs, focused checks и
read-only remote reconciliation без PII/secrets. Exact permission нужна перед
D1/R2 write, migration/import transition, Worker deploy/rollback/traffic,
Access/flag/var/secret mutation, email/Telegram send, bootstrap/role/session
mutation и любой production/CMS action.

Группируй однородные preview mutations в одну заранее описанную фазу и проси
одно пакетное разрешение с exact target, результатом, stop condition и rollback.
Пароли, OTP, verification links и secret values владелец вводит лично; не проси
присылать их в чат и не выводи их в evidence.

Остановка допустима только непосредственно перед таким human/permission gate,
независимой role boundary или настоящим hard blocker. До остановки заверши всю
безопасную подготовку и задай один точный вопрос. Отсутствующий production-only
approval не блокирует synthetic preview.

## Финальный отчёт сессии

Сообщи: достигнутый пользовательский outcome, реально выполненные focused
проверки, сознательно не запущенные тяжёлые suites и почему, untouched scope,
статус full-manual-preview, production verdict, следующую фазу и ровно одно
действие владельца — только если без него продолжение невозможно. Повтори
`rollover_required`, `recommended_next_session_mode` и простую ситуационную
причину; это обязательно даже при `rollover_required: no`.

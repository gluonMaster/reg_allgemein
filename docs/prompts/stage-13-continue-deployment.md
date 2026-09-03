# Продолжение Stage 13 до full manual preview

Это единственный постоянный tracked entry-point. Он не содержит current SHA,
deployed version или next action: их всегда читать из
[STAGE_13_ACTIVE_STATE.md](../implementation/STAGE_13_ACTIVE_STATE.md).

## Outcome

Передать владельцу Access-protected preview, где на синтетических данных реально
работают обязательные Browser Run/R2/email, Telegram normal-outbox и document
quarantine/manual-AV/business-review paths. Production, официальный сайт,
реальные Office/PII sources и реальные клиенты не входят в эту программу.

## Минимальный старт

1. Прочитай `AGENTS.md`, этот файл и active state полностью.
2. Для текущего action открой только прямо названный раздел стабильного runbook,
   соответствующие требования `SYS-04`/`OQ-036` и affected code/tests.
3. Не читай большой handoff либо весь readiness/traceability ledger без точной
   evidence-ссылки из active state.
4. Read-only сверь protected target record, repository HEAD/runtime candidate и
   preconditions ровно текущего action. Не делай cleanup/reset/checkout.
5. Одной короткой записью назови exact action, target class, permission,
   expected postcondition и containment. Выполняй только уже явно разрешённое.

## Один action за раз

- Current action берётся только из `next_atomic_action` active state.
- Разрешение на один action не распространяется на следующий, production, CMS,
  provider send, bootstrap или иной remote write.
- После **каждой попытки** remote mutation выполни ровно один bounded read-only
  postcondition. Exit code не является результатом.
- При `failed|ambiguous` остановись, не повторяй write вслепую и зафиксируй
  containment/reconciliation.
- До следующей mutation обнови active state и создай малый docs-only checkpoint.
  Handoff обновляется только на границе фазы/сессии; production checklist — только
  при реальном изменении production gate.

## Исполняемый test/review gate

| Изменение или действие | Обязательные проверки | Full release gate | Independent review |
| --- | --- | --- | --- |
| Docs-only current-state checkpoint | docs/link/command check, release scan, diff check | запрещён без другого material diff | не повторять |
| Remote migration/deploy неизменённого reviewed candidate | exact-target preflight + bounded postcondition/smoke | наследовать записанный gate | наследовать GO |
| Локализованный runtime fix одной surface | минимальный RED→GREEN affected test + непосредственные consumers; check/build только если затронуты | только если impact нельзя ограничить или candidate ещё не gated | только для нового material candidate после нужного full gate |
| Migration/dependency/deploy-config/cross-cutting diff | focused RED→GREEN + совместимость/upgrade checks | один раз для exact candidate | один раз для exact candidate |
| Только P2/P3 | backlog | не запускать | не запускать |

Полный suite нельзя запускать «для уверенности». Сначала письменно назови material
risk, который не покрывают existing evidence и focused checks; без такого риска
решение gate — `inherit`.

## Severity gate

До продвижения блокируют только доказанные `P0/P1` из `AGENTS.md`. Для `P0/P1`
обязательны exact path/symbol, механизм отказа и воспроизводимое либо прямо
выводимое evidence. `P2/P3` заносятся в backlog и не открывают новый review-loop.

## Stop conditions

Немедленно остановись до mutation, если protected target не совпал, появилась
production/CMS/real-PII surface, pending migration set отличается, recovery/
rollback неизвестен, current action не имеет отдельного разрешения или результат
предыдущей mutation ещё не доказан. Сохрани Access и affected providers
fail-closed.

После checkpoint сообщи владельцу только: `result`, bounded evidence, current
state, ровно один следующий action, containment/rollback, `rollover_required` и
`recommended_next_session_mode`. Для известного маршрута default — `High`;
`Max` нужен только при доказанном риске wrong target, corruption, authorization
bypass, secret exposure, необратимой ambiguous mutation или отказе recovery.

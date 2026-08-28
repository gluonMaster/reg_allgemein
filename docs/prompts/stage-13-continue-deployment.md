# Продолжение Stage 13 до полного manual preview и production

Открой этот файл полностью и выполняй последовательно. Это постоянный tracked
entry-point, а не snapshot отдельного gate. Не выбирай другой локальный
`stage-13-*` prompt по имени или дате: одноразовые prompts могут быть
историческими, Git-ignored или role-specific.

## Постоянная цель

Ближайшая проверяемая цель — Access-protected preview, в котором владелец может
вручную проверить весь MVP end-to-end на синтетических данных без PII. По
`SYS-04`/`OQ-036` это требует реально включённых preview-only contract/
Browser/R2/email, Telegram normal-outbox и document upload/quarantine/manual-AV/
business-review paths; production approval или `feature_disabled` не заменяет
их проверку. После достижения этого milestone продолжай Stage 13 до production
readiness и отдельно разрешённого production deploy. Один local fix, review,
import, deploy, login или bootstrap не завершает процесс.

## Обязательный старт

1. Полностью прочитай `AGENTS.md`, `docs/README.md`,
   `docs/spec/MVP_SPEC.md`, `docs/spec/ACCEPTANCE_CRITERIA.md`,
   `docs/spec/OPEN_QUESTIONS.md`, Stage 13 в
   `docs/implementation/ROADMAP.md`, previous-stage handoff, весь
   `docs/implementation/handoffs/stage-13.md`,
   [активное состояние](../implementation/STAGE_13_ACTIVE_STATE.md),
   `docs/operations/PRODUCTION_READINESS.md`,
   `docs/operations/PRODUCTION_READINESS_CHECKLIST.md`,
   `docs/operations/PRODUCTION_DEPLOYMENT.md` и тематический runbook следующего
   gate. Для всех preview-функций обязательно прочитай
   `docs/operations/FULL_MANUAL_PREVIEW.md`.
2. Выполни `git status --short`, `git rev-parse HEAD` и fresh read-only
   reconciliation только тех remote ресурсов, которые нужны для следующего
   gate. Сохрани чужие изменения; не делай reset/checkout/cleanup.
3. Сопоставь actual state с metadata и разделами active-state. Если есть drift,
   не повторяй старый gate: сначала установи sanitized provenance, обнови
   checkpoint/handoff/checklist и выбери фактический следующий prerequisite.
4. Составь короткий working plan и сразу выполняй все разрешённые
   local/read-only/reversible шаги. Не проси подтверждения для каждого такого
   шага и не останавливайся после промежуточного успеха.

## Приоритет independent NO-GO

Если active-state фиксирует independent `NO-GO`, его remediation становится
первым hard gate независимо от старых зелёных tests или historical GO другого
scope. Полностью прочитай записанные findings, соответствующие canonical
requirements/acceptance/test plan и local exact remediation prompt, если он
назван в handoff. Исправь все BLOCKER/HIGH и обязательные MEDIUM, выполни
focused regression плюс полную gate-цепочку и подготовь новый immutable
candidate. Не присваивай своему candidate independent GO: на role boundary
подготовь exact read-only review prompt для другой session/identity.

До нового independent GO не запрашивай и не выполняй candidate-bound recovery,
migration apply, deploy, config/secret mutation, provider send или bootstrap.
Для Cloudflare Workers/D1/R2 remediation загрузи `cloudflare` и
`workers-best-practices`, а перед Wrangler commands — `wrangler`; exact API/
binding semantics сверяй с текущими official docs/types/schema. Historical
review verdict не переносится на changed candidate.

## Правило продвижения

После каждого успешного gate:

1. обнови `docs/implementation/STAGE_13_ACTIVE_STATE.md`, readiness checklist и
   `docs/implementation/handoffs/stage-13.md`;
2. обнови deployment/operations/import/DR runbook, если изменилось фактическое
   operational evidence; canonical requirement/acceptance — только если
   изменилось поведение;
3. выполни `npm run check`, `npm test`, `npm run build`, применимые
   `npm run docs:check`, `npm run release:scan` и `git diff --check`;
4. самостоятельно переходи к следующему разрешённому prerequisite.

Остановка допустима только на настоящем human/permission gate, независимой role
boundary или при небезопасной потере context. Перед остановкой заверши всю
безопасную подготовку и задай один точный вопрос: environment, scope, expected
result, stop condition и rollback. Разрешение одного remote scope не переносится
на другой. Legal/provider/training approval, нужный только для production, не
является причиной останавливать подготовку synthetic preview lifecycle.

## Permission boundary

Без нового вопроса разрешены local/read-only inspection, implementation,
tests/build/docs и read-only remote reconciliation без PII/secrets.

Отдельное exact permission обязательно перед D1/R2 write, migration/import
transition, Worker deploy/rollback/traffic, Access/flag/var/secret mutation,
email/Telegram send, bootstrap/role/session mutation, production, DNS/CMS и
официальным сайтом. Владелец лично вводит passwords, OTP и verification links;
никогда не проси их прислать. Реальный Access/Office PII не попадает в ordinary
preview.

Независимые import/recovery/review роли нельзя изображать одной identity. Для
role boundary сначала обнови persistent evidence, затем создай минимальный
role-specific local prompt и прямо скажи владельцу начать новую сессию с этим
файлом. Постоянная цель и active-state при этом не меняются.

## Context rollover

Перед remote mutation, provider send, irreversible security action, production
gate и independent review проверь, можешь ли однозначно назвать actual target,
candidate provenance, permission, stop condition и rollback source. Если нет:

1. выполни разрешённую read-only reconciliation;
2. обнови active-state, handoff, checklist и нужный runbook;
3. выполни docs/diff checks;
4. создай обезличенный self-contained role/scope prompt только если он
   действительно нужен;
5. сообщи владельцу точный файл и фразу для новой сессии.

Не жди полной потери контекста, но не создавай новую сессию только из-за обычной
длины, пока безопасная работа уверенно продолжается.

## Финальный отчёт каждой сессии

Финальный ответ обязан быть self-contained и сообщать: достигнутый outcome,
реально пройденные проверки, untouched scope, status ближайшего manual-preview
milestone, production verdict, exact next gate и одно требуемое действие
владельца — только если без него действительно нельзя продолжить.

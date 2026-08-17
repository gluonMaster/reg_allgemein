# Roadmap реализации MVP

Ревизия: 2026-08-14.

Roadmap определяет порядок и quality gates, но не является источником
бизнес-правил. Каждый этап читает [спецификацию](../spec/MVP_SPEC.md),
[открытые вопросы](../spec/OPEN_QUESTIONS.md) и перечисленные тематические
документы.

Статусы: `pending`, `in_progress`, `done`, `blocked`. Этап считается `done`
только после code, migrations, tests, persistent
[handoff](handoffs/README.md) и обновления канонической документации. Status
обновляет агент, выполняющий этап.

`done` означает завершённый и проверенный scope этапа, а не автоматическую
готовность production release. Если каноническая blocker matrix требует
внешнего решения, production path остаётся fail-closed/feature-gated и явно
переносится в release gate; stage не вправе подменить это решение.

## Общие правила этапа

Перед началом:

1. проверить prerequisites и состояние worktree;
2. прочитать раздел этапа ниже, его тематические документы и persistent handoff
   предыдущего этапа;
3. не реализовывать production blocker как догадку;
4. ограничить изменения scope этапа;
5. создать/обновить тест до handoff.

Раздел каждого этапа ниже вместе с указанными каноническими документами задаёт
полный воспроизводимый scope. Игнорируемые Git локальные промпты, если они есть,
могут лишь помогать исполнению и не являются prerequisite или дополнительным
источником требований.

После этапа:

```bash
npm run check
npm test
npm run build
```

## Этапы

|   № | Статус      | Результат                                                                                                                              | Зависит от              |
| --: | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
|  01 | done        | Baseline структуры, D1 migration/test harness, config validation, error/audit foundations                                              | —                       |
|  02 | done        | Versioned import schema, price и schedule staging/validation/promotion                                                                 | 01                      |
|  03 | done        | Access/PlusBText import, family/child aggregation, issues и reconciliation                                                             | 02                      |
|  04 | done        | Course mappings, occupancy и безопасный pricing/quote engine                                                                           | 02–03                   |
|  05 | done        | Auth, sessions, verification/reset, CSRF/Turnstile/rate limit/RBAC                                                                     | 01                      |
|  06 | done        | Portal children, atomic legacy claim и parent cabinet                                                                                  | 03–05                   |
| 06A | done        | Admin shell, import/review/legacy/users/catalog core surfaces                                                                          | 02–06                   |
|  07 | done        | Published catalog, availability и полный trial workflow                                                                                | 04, 06, 06A             |
|  08 | done        | Nachhilfe/individual requests, private R2 documents и review                                                                           | 05, 06, 06A             |
|  09 | done        | Contract core: immutable HTML, Browser Run/synthetic adapters, acceptance и admin approval/activation; legal/business production gated | 04, 05, 06, 06A, 07, 08 |
|  10 | done        | Price review batches/items, notifications и effective-date apply                                                                       | 04, 09                  |
|  11 | done        | Support/absence, email/Telegram outboxes и cron retry                                                                                  | 05–10                   |
|  12 | done        | Privacy export/delete, account closure, retained-archive separation и closure races                                                    | 05–11, включая 06A      |
|  13 | in_progress | Независимый hardening, production readiness, Access/Telegram candidate и русские operator runbooks; external NO-GO gates остаются      | 01–12                   |

## 01. Foundation

Exit gate:

- clean migrations создают common/auth/audit/import foundations;
- local/preview config проверяется fail-closed для критических secrets/bindings;
- typed config валидирует `PORTAL_PUBLIC_ORIGIN`; портал имеет собственные
  deployment/resources и не зависит от CMS/runtime/credentials официального
  сайта;
- unit и D1 integration test harness работают;
- Playwright browser smoke и минимальная i18n-инфраструктура с German fallback
  настроены;
- общие error IDs/redaction и idempotency helpers покрыты тестами;
- scaffold не объявляет незавершенные функции готовыми.

## 02. Price и schedule imports

Exit gate:

- выбран поддерживаемый non-executing XLSX/XLSM parser после license/advisory/
  compatibility spike; known-high dependency без risk decision не добавлена;
- price header row 2 находится по contract, vector duration сохраняется;
- `Preis` импортируется как yearly monthly fee, `Sonderpreis` как monthly-
  contract monthly fee; exceptional override не импортируется;
- zero/negative/non-integer source price создаёт issue и не публикуется;
- schedule JSON primary, IDs/version metadata валидируются;
- schedule references локальны: import не скрейпит и не изменяет официальный
  сайт и его страницы расписания;
- stage/validate/promote и повтор hash работают;
- failed/partial run не меняет current version;
- одинаковые display names не сливаются.

## 03. Access и PlusBText

Exit gate:

- Access schema profile проверяется по именам fields;
- PlusBText old/target blocks связываются только по source contract; content
  hash отделён от structural fingerprint; valid `T` хранится как минуты, blank
  остаётся `null`, invalid present value создаёт issue без import fallback;
- OOXML sanitizer не поглощает следующую populated cell после styled
  self-closing blank cell: v1 header `E/K/T empty; F/L/M/N present` покрыт
  regression fixture и не требует ложной v2 contract;
- `ID`/`Value48`, `Value15`–`Value20` и historical package-slot schema покрыты
  fixtures; актуальный owner rule создаёт только package 1–4 и оставляет slot 5
  service-marker evidence;
- raw legacy FamilyID (`1. 3477`, namespace 1), portal namespace 2 и
  collision-checked family/contract numbering не смешиваются;
- `Zahlung`, child aggregation и contact conflicts обработаны; raw parent name
  хранится отдельно, а self-service match key создаётся только при
  детерминированном versioned разборе фамилии+имени;
- missing/colliding/unapproved FamilyID остаётся source/review evidence и не
  создаёт canonical child/enrollment без family;
- rename package обновляет stable slot;
- reimport сохраняет claim/manual state и soft-retires missing rows.

## 04. Courses, occupancy и pricing

Exit gate:

- explicit course mappings и unknown/placeholder review;
- migrations для `enrollments`, `price_quotes` и pricing projections применены;
- distinct-child legacy + portal occupancy без double count;
- quote `active + 1`, repricing `active` реализованы разными функциями;
- cap-boundary тестирует обычный review для `5↔6` и no-item для `7→6`;
- exact vector lookup, yearly/monthly source selection, high-friction
  `manual_override` и ambiguity behavior протестированы;
- разрешённый missing-duration fallback 90 минут даёт только estimated quote,
  сохраняет decision/flags и блокирует total/repricing/offer до admin
  confirmation;
- public quote сохраняет decision/version/expiry.

## 05. Auth/security

Exit gate:

- register/login/logout/verify/resend/forgot/reset работают;
- registration атомарно фиксирует versioned privacy acknowledgement;
- tokens hashed, expiring, single-use; sessions revocable;
- CSRF, Turnstile, rate limit и uniform enumeration-safe responses;
- admin bootstrap out-of-band; ownership/RBAC deny-by-default;
- verification service имеет transactional extension boundary, через который
  этап 06 добавит family finalization без observable pre-verification lookup;
- security integration tests проходят.

## 06. Children, claim, cabinet

Exit gate:

- successful email verification атомарно назначает unique eligible legacy
  namespace `1` либо новый namespace `2`; replay/concurrency не создают второй
  FamilyID, а ambiguity/already-owned family дают namespace `2` + review;
- unique parent-name + one alternate legacy-email показывает только безопасную
  маску и поддерживает authenticated one-time proof; success атомарно меняет
  account и всех children `2.* -> 1.*`, failure/replay ничего не меняет;
- verified new parent создает portal child сразу с current FamilyID аккаунта;
- legacy child correction не перезаписывается обычным parent update;
- claim atomic/idempotent, conflicts идут в review;
- новый period с тем же непротиворечивым FamilyID наследует owner/stable child,
  а collision создаёт continuity review без передачи owner;
- кабинет изолирован по owner, unknown prices не считаются нулем;
- base-price totals/disclaimer, legacy service lines без PDF,
  external-SEPA/manual-not-later-than-7th informational payment text и funded-Nachhilfe
  `not_applicable` соответствуют spec без ledger/debt/holiday calculation.

## 06A. Admin console foundation

Exit gate:

- admin-only shell/guard и navigation extension points работают;
- import runs/issues, review tasks и legacy search доступны без raw PII;
- user block, child correction и claim conflict resolution аудируются;
- каждый name-match создаёт typed review; family correction имеет preview,
  reason/confirm/idempotency, атомарно меняет account/all children и отклоняет
  free-form/colliding/other-owned destination без тихого merge;
- course mapping, capacity override и publish/hide имеют typed handlers;
- parent/direct API не может выполнить admin action;
- последующие этапы могут добавлять feature-specific admin pages без второго
  layout/RBAC механизма.

## 07. Catalog и trial

Prerequisites:

- этапы 04, 06 и 06A завершены; прочитан `stage-06a.md`, а trial pages
  расширяют существующий admin shell и его RBAC, не создавая второй механизм.

Exit gate:

- только current published catalog виден parent;
- каталог является route самостоятельного портала и не заменяет/не меняет
  страницу расписания официального сайта;
- CTA соответствует lesson kind;
- availability имеет `available|full|unknown|review` semantics;
- trial поддерживает confirm/reject/cancel/attendance/convert;
- duplicate, full, past date и unauthorized child покрыты тестами.

## 08. Requests и documents

Prerequisites:

- этапы 05, 06 и 06A завершены; прочитан `stage-06a.md`, а document review
  добавляется в существующий admin shell;
- local/test R2 bindings не указывают на production resources.

Exit gate:

- draft/status transitions и funding behavior реализованы;
- Jobcenter/Sozialamt funding authorization отделён от document pages;
- expiry/revoke/supersede переводит engagement в `funding_review`; continuation
  flow через new approved authorization + admin amendment и
  new-offer-on-term-change
  протестированы;
- authorization state machine и current-approved-document guard проверяются при
  approval, offer send и activation; referenced evidence не заменяется;
- private R2, random keys, MIME/signature/size/count checks;
- quarantine не имеет inline viewer; audited forced download, local-AV
  hash-bound attestation и отдельный business approval реализованы;
- manual clean без same-hash download/attestation fail closed; non-approved
  object становится eligible при `now >= uploaded_at + 14×24h` и удаляется
  первым успешным cleanup после threshold, но не раньше; TTL не продлевается;
- cross-user/admin document access и deletion audit протестированы;
- automatic purge approved funding/legal archive отсутствует и остаётся
  `disabled_by_policy`; 14-day quarantine cleanup работает отдельно.

## 09. Contracts

Prerequisites:

- завершены этапы 04, 05, 06, 06A, 07 и 08, включая `stage-06a.md`;
- contract pages используют существующие parent cabinet/admin shell, owner/RBAC,
  pricing, trial/request и private-artifact boundaries.

Exit gate:

- четыре HTML/CSS template IDs и versioned Zod render schema реализованы без
  runtime-конвертации DOC/DOCX;
- offer snapshots/line items полны; `synthetic_test` adapter создаёт
  input-dependent valid PDF и не доступен production config;
- Browser Run adapter сохраняет immutable PDF в R2 до send, ограничивает
  retry/size/budget и не обещает byte-identical rerender;
- manual override выбирается только на high-friction admin flow с base/delta,
  reason, repeated confirmation, snapshot/audit;
- hash/version/expiry/decline/cancel/supersede соблюдаются;
- double acceptance/activation не дублируют записи;
- parent/admin actions образуют immutable evidence bundle; стороны получают
  исходный offer PDF и отдельный formation certificate с timestamps и
  offer/source hashes (собственный PDF hash хранится только в metadata),
  signature images/combined signed copy не создаются и offer не переписывается;
- activation transaction создаёт group enrollment либо request service
  engagement; только group branch меняет occupancy и проверяет legacy link;
- contract kind/template/service relation/billing model проходят закрытую
  matrix, а inclusive end date проецируется в exclusive operational boundary;
- delivery evidence и active contract/events проверены; optional media scopes
  `photo|video` + `website|social_media|print` отдельны от acceptance, а
  revoke принимается только через office/email/phone и admin records receipt
  без approve/decline; parent self-service route отсутствует, contacts/text
  versioned и approved, historical media registry отсутствует; SEPA/medical
  consent отсутствуют;
- online media grant production path остаётся выключен до documented compliance
  assessment о равной лёгкости withdrawal либо иного проверенного compliant
  path; risk acceptance gate не открывает;
- payment/base-price arrangement informational; family/contract formats
  `1. 3477-1`/`2. 0001-1`, pre-render permanent reservation, late claim/admin
  reassignment и immutable historical numbers/artifacts тестируются end-to-end;
  nonterminal old-family offer superseded, future sequence использует current
  destination, а ambiguity/collision/stale version fail-closed;
  Widerruf/Kündigung/mutual termination разделены; approved
  template legal profile fail-closed включает applicable § 356a/§ 312k либо
  документированную non-applicability. Individual/Nachhilfe future units
  прекращаются после notice; no-show review возможен только при attested arrival/
  waiting teacher до receipt, без minute cutoff и portal invoice;
- placeholder/unapproved artifact не проходит tests/DoD; stage core может быть
  `done` при выключенной production feature, а release остаётся заблокирован
  всеми применимыми строками blocker matrix из CONTRACTS.md.
- accept/decline, formation/activation и queued retry повторно проверяют
  `users.account_status=active`; absolute portal links строятся только из
  `PORTAL_PUBLIC_ORIGIN`.

## 10. Price reviews

Exit gate:

- новая active price version сама не начинает клиентский flow: comparison
  запускается явным admin action; occupancy trigger остаётся автоматическим по
  каноническому dedupe contract;

- batch и changed-per-enrollment items разделены; unchanged/triggering-current
  enrollment не получает redundant item, empty batch ничего не отправляет;
  notification approval и final per-item admin confirmation — разные действия;
- sent item immutable и acceptance связан с version/hash;
- индивидуальные modes/overrides сохраняются;
- consent одного user не меняет других;
- decline/timeout создают admin/manual-contact notification, старая цена
  сохраняется;
- response deadline 14 дней; second admin confirmation планирует idempotent
  apply на первое число следующего календарного месяца без retroactivity;
- `5↔6` рассылается, `7→6` и wholly-above-cap change не создают item;
- future activation/expiry создают idempotent boundary batch заранее;
  reconciliation восстанавливает missed trigger, pause/resume отсутствуют;
- claimed/known legacy-only service проходит общий send/accept/confirm/apply
  flow без contract/PDF; unknown/unclaimed/conflict остаётся manual;
- yearly/monthly и increase/decrease используют одну state machine.

## 11. Messaging/outboxes

Exit gate:

- support и structured absence создаются атомарно;
- price-change emails содержат private cabinet link, а termination receipt
  доставляется через deduped outbox; absolute links используют
  `PORTAL_PUBLIC_ORIGIN`;
- ответ admin сохраняется независимо от email;
- outbox lock/dedupe/retry/dead/manual retry работают;
- Telegram respects Berlin business hours/weekend/DST и минимизирует PII.
- handoff передаёт этапу 13 полный inventory cron schedules, bindings, secrets,
  feature flags, manual-run/alert paths и production wiring без secret values.

## 12. Privacy export/delete и account closure

Exit gate:

- новые migrations создают `privacy_requests`, необходимые retention/closure
  controls и constraints, не переписывая применённые migrations;
- subject-scoped private export не содержит данные другой семьи, secrets или
  внутренние security metadata;
- delete dry-run ничего не изменяет и показывает active-contract blockers,
  удерживаемые категории и безопасный план D1/R2 cleanup;
- active contract атомарно блокирует closure, а успешное закрытие отделяет
  retained legal archive от login/profile и завершает request каноническим
  status;
- closure lock закрывает nonterminal records, сохраняет immutable evidence и
  запрещает accept/formation/activation/price apply после начала закрытия;
- successful deletion атомарно создаёт deduped revoke events для всех current
  media grants с timestamp удаления до минимизации profile/child links;
- automatic purge approved legal archive остаётся `disabled_by_policy`, а
  quarantine cleanup не смешивается с retention flow;
- permission, cross-user, idempotency и closure-race tests проходят; audit не
  содержит PII или document body.

## 13. Независимый hardening и production readiness

Канонический operational contract этапа —
[PRODUCTION_READINESS.md](../operations/PRODUCTION_READINESS.md). Этап не
выполняет production deploy, remote production migration, реальный PII import
или внешнюю отправку без отдельного прямого поручения.

Текущий статус: fresh Ultra audit закрыл local traceability gate PR-A06
2026-08-12, но production readiness остаётся `blocked`. Матрица проверена для
всех normative MVP IDs и acceptance bullets, найденные dual-control,
configured-upload, privacy-handler и parent-route gaps исправлены; полный
финальный local-only worktree `release:verify` прошёл за 619.5 s: check 0/0,
Vitest 54 files/340 tests, Chromium 8 files/18 tests, build, production audit 0,
docs 136 links/51 files + 82 commands и scan 500/500; отдельный полный
`npm audit` вернул total 0. Focused contract atomicity/replay прошёл 6/6,
полный contracts D1 suite 13/13, independent final re-review дал GO без
HIGH/BLOCKER. Commit, содержащий эту ревизию, является новым локальным Stage-13
candidate; его exact SHA определяется после commit через `git rev-parse HEAD`.
Он ещё не прошёл отдельную clean-clone verification и не развёрнут: preview
остаётся на `200268f39ece1d43c5e091dcb7db6569d41275af`.

Preview Worker/D1/private EU R2/Cron/empty 204|503 monitoring signal и
independent HEAD alert delivery/recovery проверены; public browser smoke прошёл.
Tracked local Chromium harness прошёл 8 files/18 tests: access/session/CSRF;
broad child/trial/price/message/privacy IDOR plus carrier-bound request/document/
contract-end-attendance-media cases; individual request create→approved; exact catalog €46 and
trial requested→confirmed→cancelled; support and structured absence through
final admin answer plus email/Telegram outbox deltas; price €46→€50 through
parent acceptance and distinct admin confirmation to `scheduled`. Browser
contract accept/form/activate не заявляется: renderer/send намеренно disabled.
Accessibility 4/4 требует пустые `violations` и `incomplete` для всех default
axe rules и покрывает inline login-error semantics, 390px parent/admin и 640px
200%-zoom-equivalent reflow.

PR-A12/13/14 всё ещё `blocked`: отсутствуют register/verify/claim, funded
Nachhilfe upload/document review, enabled contract lifecycle, price admin-send
и scheduled apply; disabled upload mutation, оставшиеся enrollment/group-service
и guessed/admin-purpose permission variants; literal/manual zoom,
assistive-technology/glyph review и preview/provider authenticated evidence.
Provider/manual smoke, job-specific alerts, restore rehearsal и внешние release
inputs также отсутствуют.
`feature_disabled` не считается завершением полного MVP.

Production legacy release из `IMPORT-01`–`IMPORT-08` теперь является отдельным
обязательным Stage-13 gate. Локально реализованы v1 parser regression,
exact-target remote boundary, schema-v3 protected no-write plan с
`sourceClass`/`syntheticFixtureId`, встроенные 1703-row
`legacy-preview-synthetic-baseline-v1|legacy-preview-synthetic-candidate-v1`
без Office paths,
deterministic resumable PlusBText+Access stage, попарно разные planner/stager/
reviewer, transition actor, отличный от reviewer, и recovery verifier,
отличный от planner/stager/reviewer/promoter, immutable digest/count review,
target-bound recovery artifact,
failed-stage cleanup evidence, recovery-bound atomic promote/
rollback/roll-forward и aggregate verify. Это реализуют candidate migrations
`0016` и `0018`; populated-upgrade tests сохраняют прежние unhardened plans как
immutable evidence, но запрещают их lifecycle и требуют новый hardened plan.
Deployed preview остаётся на `0001`–`0015`.
Production transitions намеренно fail closed ещё до API-token lookup/network,
пока remote transaction evidence отсутствует.
Это не делает environment gate `passed`: remote preview plan/stage/promotion не
выполнялись, реальная remote D1 batch atomicity/timeout reconciliation не
доказана, recovery point/restore не проверены, а production import не разрешён.
Access normalization `IMPORT-07` локально переведена на exact `O/R/S/T`
crosswalk, parent-name normalizer v2, hourly duration semantics, invalid email/
DOB fail-closed и traceable family issues. Owner decision ограничивает package
groups первыми четырьмя cells каждого блока и всегда исключает `AO/AT`; sanitized
current-source projection снизила warning occurrences с 1429 до 160 и enrollment
review queue с 751 до 53 без вывода PII. Единственный active unresolved-group
case признан upstream error и не получает fuzzy mapping. Шесть structural
duplicate buckets и остальные anomaly classes требуют штатного cross-import
admin contour. Он нормативно зафиксирован как `IMPORT-08`/
`AC-IMPORT-27`–`AC-IMPORT-31` в
[отдельном ТЗ](IMPORT_ADMIN_RECONCILIATION_TZ.md), но migration/repository/UI/
suite ещё отсутствуют, поэтому PR-B17 остаётся blocked. Этот local delta ещё не
является exact-SHA candidate evidence и ничего не менял remote.

Telegram `MSG-05`–`MSG-06` также остаётся обязательным Stage-13 gate. Локальный
candidate добавляет real one-way `bot_api` adapter, strict minimized payload,
activation/max-attempt destination policy, append-only delivery attempts,
terminal `delivery_unknown`, exact-attempt operator resolution и target-bound
single-message preview-smoke boundary через candidate migration `0017`, включая
append-only D1-only abort только для unsent zero-attempt cohort и запрет Cron
reclaim его smoke signature, а также exact-target expired-lease reconcile
post-`dispatch_started` crash в `delivery_unknown` без provider send/retry.
Синтаксически валидный Bot API `ok=false` `408|425|5xx` является conclusive
retryable; `429` сохраняет destination cooldown даже без usable `retry_after`;
transport/timeout/unreadable/oversized/malformed, ambiguous envelope,
invalid/mismatched success и post-send-D1 uncertainty — ambiguous. Ни migration,
ни secret/config, ни external preflight/send не
применялись; PR-F12–PR-F15 остаются `blocked`.

Tracked packet этапа:

- [traceability matrix](STAGE_13_TRACEABILITY.md);
- [import admin reconciliation TZ](IMPORT_ADMIN_RECONCILIATION_TZ.md);
- [deployment runbook](../operations/PRODUCTION_DEPLOYMENT.md);
- [operations runbook](../operations/OPERATIONS_RUNBOOK.md);
- [disaster-recovery runbook](../operations/DISASTER_RECOVERY.md);
- [production readiness checklist](../operations/PRODUCTION_READINESS_CHECKLIST.md);
- [persistent handoff](handoffs/stage-13.md).

Stage-13 contracts `R2_ARCHIVE`, `R2_QUARANTINE`, deployed migrations
`0014`–`0015`, local unapplied candidates `0016`–`0018`,
scheduled Worker/Cron, empty monitoring endpoint и manual operations page,
`admin:bootstrap`, `docs:check`, `release:scan`, `release:verify` реализованы и
покрыты тестами. PR-A12/13/14 и environment-specific release gates остаются
`blocked` до полного browser/accessibility/security evidence,
job/provider-specific alerts, оставшегося preview rehearsal, restore, approvals
и остальных обязательных external inputs.

Exit gate:

- независимо построена traceability requirements/acceptance → implementation →
  automated tests; permission matrix, cross-user checks, German accessibility,
  responsive paths, PII redaction и dependency audit закрыты;
- clean install, все migrations на empty и representative upgraded D1,
  `npm run check`, `npm test` и `npm run build` проходят;
- production-shaped preview использует отдельные D1/R2 resources, Browser,
  provider и Cron bindings; preview migration/smoke, remote Browser conformance
  и разрешённый provider smoke выполнены либо соответствующий path имеет явный
  `feature_disabled|blocked`, но не ложный `passed`;
- создан и проверен полный inventory environment variables, secrets, bindings,
  feature flags и scheduled jobs с owner, schedule/timezone, dedupe/lock,
  monitoring, manual-run и failure procedure;
- out-of-band admin bootstrap, immediate bootstrap disable/revocation, audit и
  recovery описаны и испытаны без записи credentials/PII в документацию;
- current promoted legacy snapshot проверен до enable registration; 0/1/multiple
  lookup smoke проходит, а unavailable/stale snapshot не выделяет namespace `2`;
- synthetic isolated preview проходит exact-target legacy
  plan→stage→review→recovery-evidence→promote→verify→rollback→roll-forward с
  CLI-built expected 1703 Access rows/21-field contract без source paths,
  immutable planned/actual count contract, timeout reconciliation, one current
  dependency-compatible pair, FK integrity и PII-free evidence; local D1 tests
  не заменяют этот gate;
- D1/R2 backup, restore и migration/code/import rollback/roll-forward
  отрепетированы в non-production; RPO/RTO и backup cadence рассматриваются как
  явные release inputs и не выдумываются агентом;
- в tracked `docs/operations/` созданы актуальные русскоязычные пошаговые
  `PRODUCTION_DEPLOYMENT.md`, `OPERATIONS_RUNBOOK.md`, `DISASTER_RECOVERY.md` и
  `PRODUCTION_READINESS_CHECKLIST.md`, понятные неопытному оператору и
  проверенные clean-room rehearsal;
- runbooks содержат prerequisites, точные команды из фактической реализации,
  ожидаемые безопасные результаты, stop conditions и rollback для provisioning,
  config/secrets, migrations, bootstrap, import, deploy, smoke, Cron/providers,
  monitoring, incident response, backup/restore и feature enablement;
- runbooks явно фиксируют, что портал разворачивается как самостоятельная
  система в отдельной инфраструктуре. Изменение ссылок на утверждённых surfaces
  официального сайта, включая согласованные страницы расписания, — отдельный
  post-health-check go-live с собственным разрешением и rollback, а не deploy
  портала в инфраструктуру сайта; точный URL-list является release input;
- каждый release gate имеет `passed|feature_disabled|blocked`, owner, evidence,
  affected path и next action; полный MVP называется production-ready только
  при выполнении правил из `PRODUCTION_READINESS.md`.

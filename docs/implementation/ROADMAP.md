# Roadmap реализации MVP

Ревизия: 2026-08-31.

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

После этапа выполняется минимальный достаточный risk-proportional gate. Exact
unit/integration/browser suites выбираются по изменённой production surface;
выбор и сознательно пропущенные unrelated suites фиксируются в handoff.
Безусловный полный прогон после docs-only, prompt-only, test-only или локального
checker diff запрещён, если exact runtime ancestor уже имеет зелёный full-suite
evidence и runtime/migrations/dependencies/config не менялись.

Полная цепочка:

```bash
npm run check
npm test
npm run build
```

обязательна перед release/deploy после материального runtime, migration,
dependency/toolchain, shared-infrastructure или cross-cutting изменения, при
неограниченном impact либо по прямому поручению. Для ограниченного diff нужны
focused tests и только релевантные дополнительные gates согласно
[TEST_PLAN.md](TEST_PLAN.md).

Ближайший явно установленный владельцем milestone имеет приоритет над
необязательной полировкой. До продвижения исправляются `P0/P1` из `AGENTS.md`;
`P2/P3` записываются в backlog и сами по себе не переоткрывают завершённый gate.
Deployment разбивается на короткие target-bound фазы с отдельными expected
result, focused verification и rollback. Без drift/material diff/
воспроизводимого `P0/P1` зелёная фаза не повторяется.

После каждой попытки remote mutation и до следующей mutation обязателен
persistent checkpoint по `AGENTS.md`: read-only postcondition, обновлённый active
state, отдельный docs-only commit и понятная рекомендация `Medium|High|Max` для
следующей сессии. `High` — обычный deploy default; `Max` не используется без
подтверждённого серьёзного риска и его простого объяснения владельцу.

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

<!-- stage-13-current-review-status: pending_independent_review -->

Roadmap хранит только stable scope и exit criteria. Current reviewed candidate,
deployed preview version, pending migration и next atomic action находятся
исключительно в [active state](STAGE_13_ACTIVE_STATE.md). Historical SHA, remote
postconditions и incident evidence находятся в append-only handoff и читаются
только по точной evidence-ссылке.

### 13.1 Ближайший milestone: `full-manual-preview`

Поручение владельца 2026-09-16 ставит впереди завершения полного preview срочный
limited release `trial-intake` по SYS-05. Его scope и четыре шага:
[TRIAL_INTAKE_RELEASE_TZ](TRIAL_INTAKE_RELEASE_TZ.md). Требования к полному
preview ниже сохраняются для последующего продолжения; его готовность не
объявляется по результату ограниченного запуска. Operational state в этой
сессии планирования не переключался. Расширение листом ожидания плановых курсов
(поручение 2026-11-05) идёт семью шагами
[TRIAL_INTAKE_WAITLIST_TZ](TRIAL_INTAKE_WAITLIST_TZ.md) в том же ограниченном
release.

`full-manual-preview` по `SYS-04`/`OQ-036` — отдельный delivery gate, а не
production release. На выделенных Access-protected preview resources и только с
synthetic data должны реально пройти:

- compatible forward migration и exact reviewed Worker deploy с exact-target,
  recovery/rollback и bounded postcondition;
- две verified synthetic parent account, one-shot bootstrap и раздельные
  parent/admin роли;
- ownership/RBAC/CSRF, cross-owner denial, idempotency и session-revocation
  checks в обязательных parent/admin flows;
- document upload в private quarantine R2, forced admin download, current local
  AV, hash-bound attestation, отдельный business decision, approved archive R2,
  owner/negative download и cleanup evidence;
- четыре marked `preview_review` contract bundle через реальный Browser Run,
  private R2 и email; один accept → different-admin formation/activation →
  certificate lifecycle;
- target-pinned PII-free Telegram normal-outbox send с durable certainty и без
  blind retry при `delivery_unknown`;
- owner desktop/mobile exploratory pass, cadence/health и provider/storage
  postconditions.

Stub, fake provider и `feature_disabled` не закрывают эти preview flows. До
продвижения блокируют только доказанные milestone `P0/P1`; `P2/P3` идут в backlog
и не запускают новый review-loop. Production-only legal/privacy/provider/
training/data/custom-origin/resource approvals не задерживают synthetic preview.

Stable phase order:

1. exact-target/recovery lock;
2. compatible forward migrations;
3. fail-closed reviewed Worker deploy;
4. two verified synthetic accounts and one-shot bootstrap;
5. real preview document/contract/email/Telegram flows;
6. owner exploratory pass and phase-boundary handoff;
7. separate future production-readiness program.

`full-manual-preview` пройден, когда Access остаётся включён, production/CMS/real
PII не затронуты, все перечисленные реальные preview paths подтверждены и
открытых milestone `P0/P1` нет.

### 13.2 Отдельный последующий production gate

Канонический production contract —
[PRODUCTION_READINESS.md](../operations/PRODUCTION_READINESS.md). После manual
preview отдельно остаются, в частности:

- real-source `IMPORT-01`–`IMPORT-08` с owner-approved contracts, exact-target
  plan/stage/review/recovery/promote/verify/rollback/roll-forward, immutable
  counts/digests, independent roles и без Office/PII leakage;
- production D1/R2/Browser/provider/DNS/origin resources, least-privilege
  secrets, monitoring/job-specific alerts и failure rehearsals;
- legal/privacy/template/training/data approvals, retention decisions and
  approved RPO/RTO/backup cadence;
- non-empty backup/restore, migration/code/import rollback or forward-fix
  rehearsal and incident ownership;
- отдельный post-health-check go-live утверждённых ссылок официального сайта.

Preview evidence не авторизует ни один из этих production actions. Production
остаётся `blocked`/NO-GO, пока его собственный ledger не закрыт.

### 13.3 Process contract

После каждой попытки remote mutation и до следующей mutation обновляется только
active state. Handoff обновляется на реальной границе фазы/сессии; production
checklist — только при изменении production gate; traceability — только при
изменении requirement mapping.

Full suite выполняется один раз для exact material runtime/migration/dependency/
deploy-config candidate. Для docs-only child, unchanged gated candidate и
`P2/P3` наследуются записанный release gate и independent verdict; повтор
запрещён без названного cross-cutting risk, который нельзя покрыть focused
checks.

Tracked Stage-13 packet:

- [active operational state](STAGE_13_ACTIVE_STATE.md);
- [evergreen continuation entry-point](../prompts/stage-13-continue-deployment.md);
- [full manual preview runbook](../operations/FULL_MANUAL_PREVIEW.md);
- [test decision table](TEST_PLAN.md);
- [traceability mapping](STAGE_13_TRACEABILITY.md);
- [production readiness contract](../operations/PRODUCTION_READINESS.md);
- [production evidence ledger](../operations/PRODUCTION_READINESS_CHECKLIST.md);
- [append-only evidence history](handoffs/stage-13.md).

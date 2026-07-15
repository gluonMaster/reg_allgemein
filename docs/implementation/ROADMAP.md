# Roadmap реализации MVP

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

| № | Статус | Результат | Зависит от |
| ---: | --- | --- | --- |
| 01 | done | Baseline структуры, D1 migration/test harness, config validation, error/audit foundations | — |
| 02 | done | Versioned import schema, price и schedule staging/validation/promotion | 01 |
| 03 | pending | Access/PlusBText import, family/child aggregation, issues и reconciliation | 02 |
| 04 | pending | Course mappings, occupancy и безопасный pricing/quote engine | 02–03 |
| 05 | pending | Auth, sessions, verification/reset, CSRF/Turnstile/rate limit/RBAC | 01 |
| 06 | pending | Portal children, atomic legacy claim и parent cabinet | 03–05 |
| 06A | pending | Admin shell, import/review/legacy/users/catalog core surfaces | 02–06 |
| 07 | pending | Published catalog, availability и полный trial workflow | 04, 06, 06A |
| 08 | pending | Nachhilfe/individual requests, private R2 documents и review | 05, 06, 06A |
| 09 | pending | Contract core: immutable HTML, Browser Run/synthetic adapters, acceptance и admin approval/activation; legal/business production gated | 04, 05, 06, 06A, 07, 08 |
| 10 | pending | Price review batches/items, notifications и effective-date apply | 04, 09 |
| 11 | pending | Support/absence, email/Telegram outboxes и cron retry | 05–10 |
| 12 | pending | Privacy export/delete, account closure, retained-archive separation и closure races | 05–11, включая 06A |
| 13 | pending | Независимый hardening, production readiness и проверенные русские operator runbooks | 01–12 |

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
- `ID`/`Value48`, `Value15`–`Value20`, packages 1–5 покрыты fixtures;
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

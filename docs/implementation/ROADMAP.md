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
| 01 | pending | Baseline структуры, D1 migration/test harness, config validation, error/audit foundations | — |
| 02 | pending | Versioned import schema, price и schedule staging/validation/promotion | 01 |
| 03 | pending | Access/PlusBText import, family/child aggregation, issues и reconciliation | 02 |
| 04 | pending | Course mappings, occupancy и безопасный pricing/quote engine | 02–03 |
| 05 | pending | Auth, sessions, verification/reset, CSRF/Turnstile/rate limit/RBAC | 01 |
| 06 | pending | Portal children, atomic legacy claim и parent cabinet | 03–05 |
| 06A | pending | Admin shell, import/review/legacy/users/catalog core surfaces | 02–06 |
| 07 | pending | Published catalog, availability и полный trial workflow | 04, 06A |
| 08 | pending | Nachhilfe/individual requests, private R2 documents и review | 05–06A |
| 09 | pending | Contract core: immutable HTML, Browser Run/synthetic adapters, acceptance и admin approval/activation; legal/business production gated | 04–08 |
| 10 | pending | Price review batches/items, notifications и effective-date apply | 04, 09 |
| 11 | pending | Support/absence, email/Telegram outboxes и cron retry | 05–10 |
| 12 | pending | Permission/privacy audit, accessibility, backup/restore, release checklist | 01–11 |

## 01. Foundation

Exit gate:

- clean migrations создают common/auth/audit/import foundations;
- local/preview config проверяется fail-closed для критических secrets/bindings;
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
- schedule JSON primary, IDs/version metadata валидируются;
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
- `Zahlung`, child aggregation и contact conflicts обработаны;
- rename package обновляет stable slot;
- reimport сохраняет claim/manual state и soft-retires missing rows.

## 04. Courses, occupancy и pricing

Exit gate:

- explicit course mappings и unknown/placeholder review;
- migrations для `enrollments`, `price_quotes` и pricing projections применены;
- distinct-child legacy + portal occupancy без double count;
- quote `active + 1`, repricing `active` реализованы разными функциями;
- exact vector lookup, special/manual modes и ambiguity behavior протестированы;
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
- security integration tests проходят.

## 06. Children, claim, cabinet

Exit gate:

- verified new parent создает portal child;
- legacy child correction не перезаписывается обычным parent update;
- claim atomic/idempotent, conflicts идут в review;
- новый period с тем же непротиворечивым FamilyID наследует owner/stable child,
  а collision создаёт continuity review без передачи owner;
- кабинет изолирован по owner, unknown prices не считаются нулем;
- monthly totals и payment text соответствуют spec.

## 06A. Admin console foundation

Exit gate:

- admin-only shell/guard и navigation extension points работают;
- import runs/issues, review tasks и legacy search доступны без raw PII;
- user block, child correction и claim conflict resolution аудируются;
- course mapping, capacity override и publish/hide имеют typed handlers;
- parent/direct API не может выполнить admin action;
- последующие этапы могут добавлять feature-specific admin pages без второго
  layout/RBAC механизма.

## 07. Catalog и trial

Exit gate:

- только current published catalog виден parent;
- CTA соответствует lesson kind;
- availability имеет `available|full|unknown|review` semantics;
- trial поддерживает confirm/reject/cancel/attendance/convert;
- duplicate, full, past date и unauthorized child покрыты тестами.

## 08. Requests и documents

Exit gate:

- draft/status transitions и funding behavior реализованы;
- Jobcenter/Sozialamt funding authorization отделён от document pages;
- private R2, random keys, MIME/signature/size/count checks;
- quarantine state и изолированный auditable admin viewer соблюдают `OQ-009`;
- cross-user/admin document access и deletion audit протестированы;
- production retention остается выключаемым/configurable до `OQ-005`.

## 09. Contracts

Exit gate:

- четыре HTML/CSS template IDs и versioned Zod render schema реализованы без
  runtime-конвертации DOC/DOCX;
- offer snapshots/line items полны; `synthetic_test` adapter создаёт
  input-dependent valid PDF и не доступен production config;
- Browser Run adapter сохраняет immutable PDF в R2 до send, ограничивает
  retry/size/budget и не обещает byte-identical rerender;
- special/manual offer price выбирается только admin с reason/snapshot/audit;
- hash/version/expiry/decline/cancel/supersede соблюдаются;
- double acceptance/activation не дублируют записи;
- activation transaction создаёт group enrollment либо request service
  engagement; только group branch меняет occupancy и проверяет legacy link;
- delivery evidence и active contract/events проверены; contract flow не
  собирает media/SEPA/medical consent;
- placeholder/unapproved artifact не проходит tests/DoD; stage core может быть
  `done` при выключенной production feature, а release остаётся заблокирован
  всеми применимыми строками blocker matrix из CONTRACTS.md.

## 10. Price reviews

Exit gate:

- batch и per-enrollment items разделены;
- sent item immutable и acceptance связан с version/hash;
- индивидуальные modes/overrides сохраняются;
- consent одного user не меняет других;
- effective apply не retroactive и idempotent;
- yearly automation заблокирована до `OQ-001`.

## 11. Messaging/outboxes

Exit gate:

- support и structured absence создаются атомарно;
- ответ admin сохраняется независимо от email;
- outbox lock/dedupe/retry/dead/manual retry работают;
- Telegram respects Berlin business hours/weekend/DST и минимизирует PII.

## 12. Hardening/release readiness

Exit gate:

- permission matrix и cross-user tests закрыты;
- privacy export/delete request workflow и retention-hold dry-run реализованы;
- privacy/retention/open production blockers рассмотрены;
- accessible German UI и responsive paths проверены;
- D1/R2 backup/restore rehearsal описан и выполнен в non-production;
- deployment/migration/rollback/runbooks готовы;
- audit/check/test/build проходят на clean install.

# Стратегия тестирования

## Принципы

- Ни один automated fixture не содержит реальных имен, email, телефонов,
  адресов или документов клиентов.
- Бизнес-правило получает unit/golden test; граница D1/R2/API — integration test;
  критический пользовательский путь — browser/e2e smoke.
- Ошибка внешнего провайдера эмулируется deterministic fake adapter.
- Concurrency/idempotency проверяется повтором и параллельными запросами, а не
  только happy path.
- Browser/e2e runner — Playwright согласно `ADR-011`; этап 01 создает harness,
  последующие этапы добавляют свои критические сценарии.
- Тест не использует production/local PII source напрямую. Реальные source
  файлы допускаются только в отдельном ручном local validation run с
  обезличенным отчетом.

## Уровни

### Unit

- normalization, classification и status transitions;
- money/decimal/vector parsing;
- price exact lookup и decision codes;
- occupancy на заданную дату;
- business hours/DST/backoff;
- token/hash/idempotency helpers;
- document type/limit validation.
- contract render schema, canonical manifest и context escaping;

### Import contract

- synthetic workbook с metadata row 1/header row 2/formatted tail;
- synthetic macro-enabled workbook читается без исполнения VBA и только по
  allowlisted sheet/fields; hidden/veryHidden sheets и PII-like extra columns
  не попадают в extract/report;
- encrypted/unsupported workbook, missing `PlusBText`/column и изменённый
  schema/hash завершаются fail-closed;
- vector `Dauer/Faecher`, duplicate/ambiguous price rule;
- schedule schema/generation/duplicate IDs/display-name collisions;
- Access rows с `ID`, mirror mismatch, `Zahlung`, packages 1–5;
- family/child/contact conflicts и PlusBText ambiguity;
- PlusBText independent old/target blocks, anchor bounds, exact-L then
  F->E->K-token join, semicolon K, duplicate/dangling/sparse cases;
- content hash change with stable contract vs structural fingerprint drift;
- valid positive integer `T` сохраняется в минутах, blank остаётся `null`,
  invalid present value создаёт issue; import никогда не подставляет 90;
- same hash no-op, package rename, source disappearance, failed promotion;
- тот же source hash с другим academic period/dependency set;
- retry failed fingerprint, concurrent promotion lease и fencing token;
- two concurrent promotions and preservation of current version.

### D1 integration

- clean migrations and constraints;
- conditional token/session/claim/status updates;
- object ownership/RBAC;
- distinct occupancy and legacy/portal dedupe;
- contract accept/activate race;
- template approval/service-cardinality constraints, delivery dedupe и
  append-only contract events;
- price review batch/item cardinality;
- outbox lease/dedupe/retry.

### API/browser integration

Сценарии выполняются Playwright против local/preview окружения с synthetic data:

- register → verify → create child;
- register → verify → legacy claim → cabinet;
- catalog → quote → trial → admin decision;
- Nachhilfe/individual request → document/review;
- offer → parent acceptance → admin approval/activation;
- price review → individual acceptance/apply;
- support/absence → admin answer → outbox;
- mobile/keyboard German UI smoke.

## Обязательные suites

### Auth и authorization

- normalized duplicate email и enumeration-safe response;
- verification/reset expiry, single-use, resend cooldown;
- logout/password/email/block session revocation;
- email-change pending target/version и replay более старого token;
- registration/confirmation race вокруг чужого pending email и cleanup expiry;
- registration + privacy acknowledgement atomicity, exact notice version и
  rollback without orphan evidence;
- CSRF missing/wrong/correct;
- rate limit boundaries;
- atomic D1 guard buckets и fail-closed behavior при ошибке guard storage;
- parent cannot create admin;
- cross-user child/request/document/offer/thread IDs;
- blocked parent/admin and unauthenticated access.

### Claim и children

- already-claimed и два concurrent claim;
- one email/multiple families;
- family without email/name-only no claim;
- duplicate child names, different/missing birthdate;
- new parent creates/edits portal child;
- legacy correction requires review;
- claim during reimport uses promoted snapshot and stays idempotent.
- тот же непротиворечивый `source_namespace+FamilyID` в новом period наследует
  owner/claim и stable child, но создаёт новые period-scoped enrollments;
- reused/colliding FamilyID или конфликт child/contact создаёт continuity review
  и не передаёт owner автоматически;
- одинаковый Access row `ID` в разных periods создаёт две period-scoped source
  rows и не обновляет запись прошлого периода.

### Occupancy и price

- counts 0, 1, 5, 6 и >6;
- quote uses `active + 1`; repricing uses `active` при `active > 0`, а при 0 не
  создает lookup/items;
- active date boundaries and `active_until` exclusive;
- main/package duplicate child;
- legacy + represented portal enrollment counted once;
- trial/pending/cancelled/KN excluded;
- capacity 12/15 independent of lookup cap;
- regular vs admin special vs manual;
- parent tampering special/manual denied; admin decision требует reason,
  snapshot и audit;
- mutual exclusion override/discount and nonnegative final;
- exact subject-duration vector and ambiguous candidates;
- golden VBA normalization cases, including `MISSING_PRICE_KEY`;
- blank `T` для однозначной `group|dance_group`: yearly fallback даёт 4600,
  monthly fallback 6000 cents, сохраняет `ESTIMATED_MISSING_DURATION` и
  показывает немецкое estimated/admin-confirmation сообщение;
- fallback не срабатывает для `individual|nachhilfe|group_nachhilfe`, unknown/
  ambiguous mapping или contract kind, present/invalid `T` и
  `MISSING_PRICE_KEY`; source duration остаётся `null`;
- fallback-quote не входит в monthly total/repricing и не создаёт отправляемый
  offer до аудируемого admin confirmation длительности, суммы и billing period;
- old/expired quote recalculated before offer.

### Trial и requests

- invalid lesson kind, unauthorized child, duplicate open trial;
- full/unknown capacity, past date, rejected state;
- invalid transition from `rejected|cancelled|no_show|converted`; для
  `attended` разрешён только `converted`;
- draft Nachhilfe without document;
- individual self-pay path; Nachhilfe Jobcenter/Sozialamt document rule и
  запрет self-pay/unknown Nachhilfe;
- individual configured tariff отображается отдельно; Nachhilfe не получает
  self-pay quote и требует approved funding/payer snapshot для contract path;
- `needs_documents` vs `needs_info`;
- expired authorization and nullable approved hours;
- `group_nachhilfe` unavailable publicly.

### Documents

- PDF/JPEG/PNG correct signature;
- spoofed extension/MIME, oversize, too many files;
- duplicate upload idempotency;
- random private R2 key and no public URL;
- cross-user download/delete and admin audited access;
- quarantine по `OQ-009`, запрет обычного download и isolated viewer audit;
- replaced/deleted metadata preserved;
- R2 failure leaves consistent D1 cleanup/retry state.

### Contracts

- incomplete snapshot/artifact cannot be sent;
- four template IDs и отдельные billing models;
- DOC/DOCX runtime conversion отсутствует;
- invalid zero/multiple service relation и unapproved/production-use of
  synthetic_test template;
- missing render field, long name, Unicode, HTML page-break contract и escaped
  payload;
- accept draft/cancelled/expired/superseded/changed-hash rejected;
- parent decline;
- double accept and concurrent accept/cancel;
- admin approval/activation without parent acceptance rejected;
- parent acceptance alone creates no contract; admin approval persists both
  actor/timestamps and formation event;
- double/concurrent activation creates one enrollment либо service engagement;
- atomic offer+draft operational record, reuse on supersede, orphan cleanup on
  last cancel/decline/expiry;
- individual/Nachhilfe activation validates request/funding и не меняет group
  occupancy;
- contract relations равны approved offer и сохраняют XOR; Nachhilfe требует
  valid approved Jobcenter/Sozialamt funding, individual запрещает его;
- future `effective_from` сохраняет более ранний `formed_at`, но не включает
  enrollment в occupancy до даты начала;
- price/capacity change before activation;
- generated HTML/synthetic PDF hash stable for identical canonical snapshot;
  synthetic PDF parseable и меняется при изменении input;
- Browser Run adapter: inline-only input, R2-before-send, 429/5xx retry cap,
  size/budget limit, browser-ms metadata и no rerender after acceptance;
- production remote spike перед release проходит отдельные glyph/font,
  long-name и pagination conformance tests;
- template/source version меняет source manifest/hash предсказуемо; managed
  Chromium PDF bytes не сравниваются на strict equality между calls;
- новая template version не перезаписывает retained bundle/fonts/assets старого
  accepted offer;
- delivery evidence deduped, approval/activation creates one contract, lifecycle events
  append-only;
- contract acceptance не изменяет privacy acknowledgement и не принимает
  media/SEPA/medical consent до решения `OQ-016`.
- contract/Kündigung history survives enrollment/engagement end and supersede.

### Price review

- one batch with several enrollment items;
- one accepts, one declines/times out, one has manual price;
- item immutable after send; changed terms supersede version/hash and require
  new acceptance;
- response of one item does not mutate others;
- only accepted item applies on/not before effective date;
- no retroactive application;
- duplicate trigger/apply idempotent;
- yearly item never auto-sent/applied before decision.

### Messaging

- structured absence creates one report/message/outbox event;
- support waiting/answered/closed transitions, closed-thread continuation и
  idempotent reply/close;
- admin answer persists when email fails;
- outbox duplicate event sends once;
- transient retry/backoff, permanent/dead, stale lease recovery;
- outside hours, Friday evening/weekend;
- DST start/end in `Europe/Berlin`;
- payload redaction/minimal Telegram content.

### Admin и privacy

- parent/direct API denial для каждой admin surface;
- import issue/review task typed resolution и audit;
- legacy search pagination/redaction, user block session revocation;
- mapping/capacity/publish handlers и price diagnostics without raw source;
- subject-scoped private export без cross-user data;
- delete dry-run, retention hold, idempotent approval/failure и R2 cleanup plan;
- physical deletion disabled/blocked до закрытия `OQ-005`.

## Quality gates

Для каждого этапа:

```bash
npm run check
npm test
npm run build
```

Перед release дополнительно:

- clean `npm ci`;
- migrations on empty and representative upgraded D1;
- `npm audit --omit=dev` с документированным результатом;
- preview smoke с fake/non-production email, Telegram и R2;
- backup/restore rehearsal;
- link/documentation validation;
- manual accessibility and responsive pass;
- проверка отсутствия secrets/PII/generated artifacts в git/build/log samples.

Тест, временно отключенный из-за открытого вопроса, должен ссылаться на ID из
`OPEN_QUESTIONS.md`; silent skip без причины запрещен.

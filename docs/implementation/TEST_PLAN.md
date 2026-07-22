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
  обезличенным отчетом и после отдельного прямого поручения; обычный stage run
  использует только synthetic fixtures.

## Проекция требований на suites

Каждый диапазон ниже обязан иметь позитивные, негативные и, где применимо,
concurrency/idempotency проверки в названном suite. Точные cases уточняются в
соответствующих разделах этого плана; диапазон не заменяет acceptance criterion.

| Требования                                                      | Обязательный suite                              |
| --------------------------------------------------------------- | ----------------------------------------------- |
| `SYS-01`–`SYS-03`                                               | System boundary и release smoke                 |
| `AUTH-01`–`AUTH-09`, `SEC-01`–`SEC-02`                          | Auth и authorization                            |
| `CLAIM-01`–`CLAIM-09`, `CHILD-01`–`CHILD-03`, `CAB-01`–`CAB-05` | Claim, children и cabinet                       |
| `CAT-01`–`CAT-04`, `TRIAL-01`–`TRIAL-05`                        | Catalog, occupancy, trial                       |
| `PRICE-01`–`PRICE-04`                                           | Import contract, occupancy/price и price review |
| `REQ-01`–`REQ-10`                                               | Requests и documents                            |
| `CONTRACT-01`–`CONTRACT-20`                                     | Contracts и price review                        |
| `MSG-01`–`MSG-04`                                               | Messaging                                       |
| `ADMIN-01`–`ADMIN-03`, `PRIV-01`–`PRIV-03`                      | Admin и privacy                                 |
| `REL-01`–`REL-02`, `TIME-01`, `UI-01`, `OBS-01`, `OPS-01`       | Cross-suite quality/release gates               |

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
- zero/negative/non-integer price создаёт import issue и не публикуется как
  допустимая price rule;
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

- register → verify → namespace-2 assignment → create child with same FamilyID;
- register → verify exact legacy email → namespace-1 data in cabinet;
- register → verify → masked name-match proof → atomic FamilyID/children switch;
- catalog → quote → trial → admin decision;
- Nachhilfe/individual request → document/review;
- offer → parent acceptance → admin approval/activation;
- price review → admin send approval → parent response → per-item admin
  confirmation → first-next-month scheduled apply;
- support/absence → admin answer → outbox;
- mobile/keyboard German UI smoke.

### System boundary

- portal build/local/preview smoke не читает CMS/API/code/credentials официального
  сайта и проходит при его недоступности;
- все absolute auth/cabinet/admin/document links используют валидированный
  `PORTAL_PUBLIC_ORIGIN`, а allowlist не принимает origin официального сайта;
- session cookie host-only без `Domain`; переход по обычной ссылке не создаёт
  shared session и не требует iframe/reverse proxy/CORS;
- environment manifest показывает отдельные Worker/D1/R2/secrets портала;
  portal rollback не изменяет сайт, а отдельный authorised link rollback не
  изменяет deployment портала;
- release smoke проверяет каждую утверждённую link surface только после
  отдельного поручения на внешнее изменение; до него gate остаётся pending/
  `blocked`, без записи в CMS.

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

- pre-verification observable parity и отсутствие FamilyID/mask;
- exact-email 0/1/multiple families, already-claimed и два concurrent finalize/
  claim: только unique eligible match получает namespace `1`, остальные один
  namespace `2` и review без раскрытия кандидатов;
- missing current legacy snapshot, lookup error и concurrent promotion не
  превращаются в 0 matches: transaction rollback сохраняет retryable token и не
  выделяет namespace `2`/gap;
- deterministic name-match с одним alternate email, multiple names/emails,
  ambiguous parse и family without email; только unique case показывает mask и
  opt-in, но name-only сам не claim-ит;
- mask fixtures для local part длиной 1/2/3/4+, Unicode/domain cases без полного
  address в UI/URL/audit/log;
- legacy proof token TTL/replay/rate limit, foreign/no session, CSRF, changed
  family version и ownership race; GET не мутирует, success POST идемпотентен;
- duplicate child names, different/missing birthdate;
- new parent creates/edits portal child только с current account FamilyID;
  null/foreign/mixed family и partial reassignment отклоняются;
- unclaimed legacy child имеет namespace-1 FamilyID и null owner; source family
  с missing/colliding/unapproved FamilyID не создаёт canonical orphan child/
  enrollment до review resolution;
- legacy correction requires review;
- claim during reimport uses promoted snapshot and stays idempotent.
- exact-email candidate, впервые появившийся после reimport/profile email
  change, создаёт review и не переключает FamilyID background job-ом;
- unverified account allocation не получает; first successful verification
  назначает FamilyID атомарно. Late approved namespace-1 claim/admin correction
  меняет account и всех children, supersede-ит nonterminal old-family offer,
  сохраняет historical numbers/artifacts и переключает только future sequence;
- admin family correction preview/reason/confirm/idempotency, affected-child
  cardinality, invalid free-form/collision/other-owned/cycle и transaction
  rollback;
- тот же непротиворечивый `source_namespace+FamilyID` в новом period наследует
  owner/claim и stable child, но создаёт новые period-scoped enrollments;
- reused/colliding FamilyID или конфликт child/contact создаёт continuity review
  и не передаёт owner автоматически;
- одинаковый Access row `ID` в разных periods создаёт две period-scoped source
  rows и не обновляет запись прошлого периода.
- cabinet показывает claimed legacy activity как service line без digital
  contract/PDF; base-price total исключает unknown и имеет holiday/payable
  disclaimer.

### Occupancy и price

- counts 0, 1, 5, 6 и >6;
- quote uses `active + 1`; repricing uses `active` при `active > 0`, а при 0 не
  создает lookup/items;
- active date boundaries and `active_until` exclusive;
- main/package duplicate child;
- legacy + represented portal enrollment counted once;
- trial/pending/cancelled/KN excluded;
- capacity 12/15 independent of lookup cap;
- yearly `Preis` vs monthly `Sonderpreis`; `O/V|V/O` selects monthly, не
  exceptional price;
- parent tampering contract kind/manual denied; manual override screen требует
  base/delta warning, reason, repeated confirmation, snapshot и audit;
- manual override replaces base, stays nonnegative; automatic discount absent;
- exact subject-duration vector and ambiguous candidates;
- golden VBA normalization cases, including `MISSING_PRICE_KEY`;
- blank `T` для однозначной `group|dance_group`: yearly fallback даёт 4600,
  monthly fallback 6000 cents, сохраняет `ESTIMATED_MISSING_DURATION` и
  показывает немецкое estimated/admin-confirmation сообщение;
- fallback не срабатывает для `individual|nachhilfe|group_nachhilfe`, unknown/
  ambiguous mapping или contract kind, present/invalid `T` и
  `MISSING_PRICE_KEY`; source duration остаётся `null`;
- fallback-quote не входит в monthly total/repricing и не создаёт отправляемый
  offer до аудируемого admin confirmation длительности/суммы; billing period
  уже `calendar_month`;
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
  parent-pay amount и требует approved document/kind/inclusive dates;
- `needs_documents` vs `needs_info`;
- expired authorization; payer/reference/hours fields отсутствуют;
- funding authorization approve/reject/revoke/supersede transitions, запрет
  terminal reactivation, inclusive expiry и immutable replacement evidence;
- authorization approval, offer send и activation отклоняют отсутствие current
  document и каждый non-approved state (`quarantined|scan_pending|clean|infected|suspicious|scan_failed|rejected|deleted`);
- authorization valid only for part of requested contract term remains manual/
  fail-closed;
- parent replace/delete referenced sent/active document is denied; replacement
  creates new authorization/version and leaves old contract evidence intact;
- authorization expiry/revoke/supersede races with offer send/activation and
  active contract: open offer supersedes, active engagement becomes exactly one
  `funding_review` task, contract/PDF remains immutable, no automatic switch;
  new approved authorization + idempotent admin funding amendment returns the
  engagement to active only with unchanged parent-facing terms, otherwise a new
  offer/acceptance is required;
- `group_nachhilfe` unavailable publicly.

### Documents

- PDF/JPEG/PNG correct signature;
- encrypted PDF с literal `/Encrypt` и PDF name escapes (`/Encr#79pt`,
  `/#45ncrypt`) отклоняется;
- spoofed extension/MIME, oversize, too many files;
- duplicate upload idempotency;
- random private R2 key and no public URL;
- cross-user download/delete and admin audited access;
- quarantine запрещает inline/public/parent download; admin получает
  только audited forced attachment с opaque name/short hash;
- manual clean attestation требует предшествующий download того же SHA-256,
  scanner label, versioned confirmation и idempotency; missing/mismatched hash,
  replacement и direct approval fail closed;
- известный local-AV alert остаётся blocked/rejected; зарезервированные future
  automated states не дают manual shortcut;
- clean-but-wrong/unreadable authorization document is rejected with safe
  reason/request-reupload and cannot approve authorization;
- non-approved body is cleanup-eligible при
  `now >= uploaded_at + 14×24h` UTC: cron никогда не удаляет его раньше и первый
  успешно завершившийся cleanup после threshold удаляет body; download/
  attestation do not extend TTL, duplicate/retried cron is idempotent and
  approved archive survives cleanup;
- replaced/deleted metadata preserved;
- R2 failure leaves consistent D1 cleanup/retry state.

### Contracts

- incomplete snapshot/artifact cannot be sent;
- four template IDs; обе group-модели используют monthly fee, individual —
  configured delivered-unit rate with default 3000 cents/45 minutes, Nachhilfe —
  fixed third-party-funded 3000 cents/45 minutes;
- DOC/DOCX runtime conversion отсутствует;
- invalid zero/multiple service relation и unapproved/production-use of
  synthetic_test template;
- negative matrix всех mismatched contract kind/template/service relation/
  billing model permutations; Nachhilfe null/out-of-range structured
  `effective_to` и non-approved current document fail closed;
- missing render field, long name, Unicode, HTML page-break contract и escaped
  payload;
- accept draft/cancelled/expired/superseded/changed-hash rejected;
- parent decline;
- double accept and concurrent accept/cancel;
- admin approval/activation without parent acceptance rejected;
- parent acceptance alone creates no contract; admin approval persists both
  actor/timestamps and formation event;
- offer PDF remains immutable after both actions; formation certificate is
  generated once from fixed source hash, contains numbers/roles/timestamps/
  hashes and is delivered separately; retry does not rerender a ready artifact,
  signature image and combined signed-copy artifact are never generated;
- double/concurrent activation creates one enrollment либо service engagement;
- atomic offer+draft operational record, reuse on supersede, orphan cleanup on
  last cancel/decline/expiry;
- individual/Nachhilfe activation validates request/funding и не меняет group
  occupancy;
- contract relations равны approved offer и сохраняют XOR; Nachhilfe требует
  valid approved Jobcenter/Sozialamt document/kind/inclusive dates без payer/
  reference/hours, individual запрещает funding authorization;
- future `effective_from` сохраняет более ранний `formed_at`, но не включает
  enrollment в occupancy до даты начала;
- inclusive contract `effective_to` корректно преобразуется в следующий
  exclusive `enrollment|service_engagement.active_until` без DST/date off-by-one
  на month/year/leap-day boundaries; funding `valid_until` остаётся допустимым
  последним service day;
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
- external-SEPA/manual-payment informational snapshots, manual due-day 7,
  external-SEPA без portal due day, `not_applicable` без due day для funded
  Nachhilfe, group base-price disclaimer и отсутствие holiday/payable/mandate/
  ledger/debt calculation;
- media grant/decline отдельны от acceptance по capture `photo|video` и channel
  `website|social_media|print`; publication требует оба grant, refusal/absence
  не блокирует contract и запрещает publication; applicable PDF содержит clause
  version, post-send decision/revoke не переписывает PDF; self-service revoke
  UI/API отсутствует, office/email/phone запись не имеет approve/decline,
  `effective_from=received_at`, delayed admin recording не сдвигает effect, а
  одинаковый evidence/dedupe key не дублирует event; связь с owning parent
  проверяется без disclosure child data и без хранения полного email/call;
  approved German text и
  contact snapshot/version с official Impressum/Kontakt links обязательны; портал не
  хранит/index historical media, revoke запрещает new capture/upload/post/
  repost/reprint по отозванным scopes, а specifically named legacy URL создаёт
  отдельный `media_content_request`;
- production media-grant capture fail-closed/disabled без documented compliance
  assessment о том, что withdrawal path столь же лёгок, как grant, либо без
  иного compliant path; status `risk_accepted` gate не открывает, а decline и
  contract acceptance продолжают работать;
  SEPA/medical consent tables отсутствуют;
- exact display/contract formats `1. 3477`/`2. 0001` и
  `1. 3477-1`/`2. 0001-1`; concurrent pre-render reservation уникальна,
  decline/expiry оставляют gap без reuse; late legacy claim/admin correction
  сохраняет byte/hash-identical old artifacts/numbers, блокирует acceptance
  superseded offer и использует destination sequence только для future offer;
- withdrawal/ordinary/extraordinary/mutual paths различаются; receipt
  подтверждается идемпотентно, debt не блокирует Kündigung, admin approve/
  decline разрешён только для mutual request; group-monthly receipt в месяце M
  заканчивает service последним днём M, group-yearly receipt до end блокирует
  renewal без сокращения term;
- individual/Nachhilfe notice idempotently ends engagement, stops every future
  undelivered unit and emits durable receipt without silently terminating the
  contract; receipt before teacher arrival excludes a claim, while external
  manual no-show review requires attested actual arrival/waiting before receipt;
  delayed admin entry сохраняет earlier actual `received_at`; arbitrary minute
  cutoff и portal invoice отсутствуют;
- production template without approved distance legal profile cannot send;
  `offline_only` rejects online send, documented § 312g Abs. 2 Nr. 9 profile
  renders approved non-applicability notice, `widerruf_applicable` exposes the
  § 356a function during its window and stores separate early-performance proof;
- public termination/withdrawal function: no-login path не раскрывает contract/
  account existence, accepts only fields required by applicable § 356a/§ 312k,
  dedupes receipt и создаёт immediate durable confirmation;
- contract/Kündigung history survives enrollment/engagement end and supersede.
- owner/cross-owner/guessed contract artifact reads, archived artifact access и
  admin read/download purpose + audit event.

### Price review

- publishing a new active price version creates no batch/item/outbox by itself;
  explicit admin comparison creates the review once and is audited, while the
  occupancy trigger remains independently idempotent;
- one batch with several changed enrollment items; enrollment with unchanged
  current final price/mode and newly activated triggering enrollment with an
  already-current accepted snapshot produce no client item; empty batch sends
  nothing;
- claimed/represented legacy dedupes with portal item; claimed legacy-only с
  known/admin-confirmed price проходит send/accept/confirm/apply и создаёт
  effective assignment без source mutation/contract/PDF; unknown/unclaimed/
  conflicting legacy получает `manual_contact_required` и explicit decision
  code без send/accept/apply;
- one accepts, one declines/times out, one has manual price;
- first admin notification approval does not apply price; accepted parent item
  requires second per-item admin confirmation;
- item immutable after send; changed terms supersede version/hash and require
  new acceptance;
- second occupancy/price-version change supersedes incompatible open items
  across prior batches; late stale response is evidence-only;
- response of one item does not mutate others;
- response deadline равен 14 календарным дням; only parent-accepted and
  admin-confirmed item schedules for first day of next calendar month in
  `Europe/Berlin` and applies once without retroactivity;
- final confirmation/apply revalidate active account/enrollment, exact current
  old price/mode, count/rule/version and no newer item; ended/moved enrollment
  and stale snapshot cannot apply;
- no retroactive application;
- duplicate trigger/apply idempotent;
- future `active_from|active_until` schedules boundary review immediately;
  natural expiry and duplicate/missed-trigger reconciliation create exactly one
  batch; pause/resume commands/model отсутствуют;
- yearly/monthly and increase/decrease use the same transitions;
- occupancy change wholly above cap 6 creates no price-change item;
- `5↔6` creates ordinary client items; `7→6` and changes wholly above cap 6
  create no client item.

### Messaging

- structured absence creates one report/message/outbox event;
- support waiting/answered/closed transitions, closed-thread continuation и
  idempotent reply/close;
- admin answer persists when email fails;
- outbox duplicate event sends once;
- transient retry/backoff, permanent/dead, stale lease recovery;
- outbox candidate-select race повторно проверяет recipient внутри claim UPDATE;
  claim-first блокирует closure, closure-first возвращает null/cancelled и
  никогда не даёт одновременно closed account + processing email;
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
- export-download audit replay после block/closure повторно проверяет actor,
  artifact status/expiry и ownership вместо доверия старому audit ID;
- active contract blocks account closure; without it sessions/profile close
  with `completed_with_retained_evidence` while per-record holds remain in an
  inaccessible legal archive; active path is `blocked_by_active_contract`;
- closure lock cancels nonterminal offer/accepted-but-unformed offer, price
  item, request/trial and inactive operational draft while preserving immutable
  evidence; accept/admin activation/price apply after lock fail;
- successful closure atomically creates one `account_deletion` revoke per current
  media grant at `account_deleted_at` before relationship minimization; retry
  creates no duplicate and failed/blocked closure creates no revoke;
- delete-vs-parent-accept and delete-vs-admin-formation concurrency: exactly one
  side wins and no contract forms for a closed account;
- accept/decline, formation/activation и price apply повторно требуют
  `users.account_status=active`; закрытый account не проходит ни один прямой API
  или queued/retried path;
- claimed current legacy row с status не `KN` блокирует closure, включая
  unmapped/non-occupancy row;
- closure минимизирует operational request/support/absence/draft-offer payload,
  но сохраняет immutable retained evidence; ordinary admin lists не показывают
  closed/legal-archive rows;
- document attestation, business review и funding authorization review
  проигрывают closure/legal-archive race без позднего audit/evidence/R2 orphan;
- legal-archive/approved-evidence records stay `disabled_by_policy`; nullable or
  elapsed `retain_until` never schedules automatic purge, while 14-day
  quarantine cleanup remains active and separate.

### Stage 13 operations и storage recovery

- empty migration и populated `0013 → 0014`: existing admin capability sealed,
  privacy cleanup/support rows сохранены, новые triggers/columns работают;
  legacy lease-less `processing` privacy cleanup становится retryable `failed`
  и затем успешно claim-ится новым Worker;
- clean first-admin bootstrap, invalid candidate, existing-admin denial,
  replay и two-candidate concurrency; role/session/audit/assertion cardinality;
  remote config `APP_ENV`, `database_id`/`preview_database_id`, UUID-bearing
  confirmation, shared-ID/overlay/mismatch rejection и escaped batch rendering;
- exact Cron allowlist, все fast/maintenance job IDs, scheduled disable,
  duplicate bucket, busy lease, manual audit/idempotency и failure isolation;
- `/admin/operations` anonymous/parent/CSRF/job/confirmation/key denial до D1/
  scheduler side effect;
- R2 write-ahead intent: grace boundary, current/stale lease, wrong-owner
  finalize, authoritative reference before claim и ambiguous-result reconcile;
- contract/document/privacy R2 paths не делают eager delete после ambiguous D1
  response и не удаляют object, который мог быть linked;
- один binding object для archive/quarantine отклоняется, а allowed
  `archive/`/`quarantine/` keys маршрутизируются только в свой R2 binding;
- upload boundary отклоняет реальный PDF/ZIP dual-parser, в котором ZIP EOCD
  расположен до финального PDF xref/EOF, а также escaped PDF name `/Encrypt`;
- acceptance IP hash получает технический expiry 30×24h; cleanup до expiry не
  проходит, после expiry null-ит только IP value и сохраняет immutable evidence.

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
- remote Browser Run и provider sandbox smoke с production-shaped bindings;
- D1/R2 backup/restore и code/data rollback/roll-forward rehearsal в отдельной
  non-production среде;
- link/documentation validation;
- manual accessibility and responsive pass;
- проверка отсутствия secrets/PII/generated artifacts в git/build/log samples.
- cold-read русских `PRODUCTION_DEPLOYMENT.md`, `OPERATIONS_RUNBOOK.md`,
  `DISASTER_RECOVERY.md` и `PRODUCTION_READINESS_CHECKLIST.md` оператором, не
  участвовавшим в реализации: prerequisites, команды, ожидаемые результаты,
  stop conditions, cron/secrets/bootstrap/monitoring и incident steps должны
  быть исполнимы. Каждый release gate имеет evidence и один из разрешённых
  статусов; `blocked` не считается production-ready.

Тест, временно отключенный из-за открытого вопроса, должен ссылаться на ID из
`OPEN_QUESTIONS.md`; silent skip без причины запрещен.

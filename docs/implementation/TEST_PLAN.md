# Стратегия тестирования

Ревизия: 2026-08-17.

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
| `MSG-01`–`MSG-06`                                               | Messaging                                       |
| `IMPORT-01`–`IMPORT-08`                                         | Production legacy release and reconciliation    |
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
- styled self-closing empty `K1` непосредственно перед populated `L1` не
  поглощает следующую cell: логический v1 header остаётся
  `E/K/T empty; F/L/M/N present`, target fields читаются полностью;
- encrypted/unsupported workbook, missing `PlusBText`/column и изменённый
  schema/hash завершаются fail-closed;
- vector `Dauer/Faecher`, duplicate/ambiguous price rule;
- schedule schema/generation/duplicate IDs/display-name collisions;
- Access rows с `ID`, mirror mismatch, `Zahlung`, package groups только в
  `Value37–Value40`/`Value42–Value45`; arbitrary `Value46` сохраняется текущим
  future-period extract в source evidence, но не создаёт group/enrollment/issue;
  будущий current-block extract обязан так же игнорировать `Value41`;
- Access future `O/R/S/T`: blank group, `KN`, hourly codes, `O/V|V/O` token in
  notes, blank/other notes yearly и запрет provisional monthly по blank `T`;
- parent-name v2 separators `;|,|single-space`, optional whitespace и
  fail-closed slash/multipart; issue содержит opaque family/source reference;
- Access birth dates: ISO/German/native Date и exact five-digit OLE Automation
  serial; decimal/negative/short/long drift остаётся invalid;
- family/child/contact conflicts и PlusBText ambiguity;
- invalid email исключён из exact claim; invalid DOB не создаёт child/enrollment;
- individual/Nachhilfe missing duration и zero price не требуют group review;
  group missing duration и zero/invalid `R` требуют review, positive `R`
  сохраняется как current legacy price;
- любой package value в первых четырёх slots остаётся fail-closed group
  candidate, тогда как пятый slot игнорируется независимо от значения;
  duplicate source-row/main/package profiles и distinct-name no-merge;
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

### Production legacy release

- remote academic-period boundary требует exact environment/config/D1 UUID,
  clean exact Git SHA, approved explicit code/display/dates/current, opaque
  operator/timestamp и digest-bound typed confirmation; child Wrangler config
  не содержит selectors/secrets/vars. D1 contract атомарно создаёт ровно один
  period и valid append-only audit; заранее занятый несовместимый deterministic
  audit ID, conflicting code или другой current period не оставляют новой
  business mutation, а byte-identical replay остаётся `1 period / 1 audit`;
- post-dispatch malformed/truncated JSON и timeout до/после commit
  классифицируются как ambiguous. Отдельная SELECT-only academic-period
  reconciliation с теми же exact аргументами и confirmation возвращает только
  `applied|not_applied|conflict`, не меняет D1 и не разрешает blind retry;
- CLI parser для
  `plan|stage|review|recovery-evidence|confirmation|promote|verify|rollback|roll-forward`
  требует explicit `--remote`, принимает только command-specific flags и
  отклоняет example config, APP_ENV/D1 UUID mismatch и ambiguous selector до
  source/target mutation;
- local/read-only `confirmation` валидирует protected plan, exact config/target
  и clean HEAD без API token/D1 call и формирует action-specific confirmation;
  лишние или недостающие stage/review/promote/rollback flags отклоняются;
- preview plan запрещает Office source args и детерминированно строит встроенные
  `baseline|candidate` 1703-row fixtures с `sourceClass=synthetic_preview` и
  immutable `syntheticFixtureId` values
  `legacy-preview-synthetic-baseline-v1` и
  `legacy-preview-synthetic-candidate-v1`; stage обязан regenerate exact variant;
  production требует оба read-only source path и
  `sourceClass=current_production`;
- no-write schema-v3 plan pin-ит exact target/current pair, period, clean exact
  full git SHA, opaque planner, caller-supplied canonical UTC creation time,
  `access-tblkartei:1`, `admin-xlsm-plusbtext:1`, source/structure/version
  hashes, expected Access rows и safe diff; protected artifact остаётся только
  в ignored `imports/*.json`, а serialized CLI/boundary state не содержит token,
  target UUID, source paths, digests или PII в printable summary;
- `RemoteD1Boundary` отправляет официальный parameterized
  `{batch:[{sql,params}]}` на exact database UUID, принимает array result для
  batch и документированный object result для single query, retry-ит только
  reads, имеет bounded `<60s` AbortSignal и классифицирует любое uncertain
  write как ambiguous без blind retry; token является JS-private и
  non-enumerable;
- deterministic run/version/plan IDs: обычный повтор validated stage — no-op;
  synthetic timeout-before-commit очищает/replays incomplete unpublished state,
  timeout-after-commit принимает committed state, а mixed run/version/hash
  блокируется. Failed partial staging требует exact-actor append-only cleanup
  event; plan delete запрещён. Отдельно покрываются PlusBText и зависимый Access
  stage;
- review принимает только exact staged digest, immutable operator/reason/time
  binding, требует попарно различных planner/stager/reviewer и не позволяет
  заменить review после записи; transition actor отличается от reviewer;
- `recovery-evidence` создаёт protected artifact только из exact target/plan/
  review, recovery reference, distinct isolated D1, restore digest/current-pair,
  independent verifier, отличного от planner/stager/reviewer/promoter, и
  canonical `verified-at|valid-until` не более 24 часов;
- promote без этого artifact или с неверным confirmation binding
  `hash(review+recovery+operator)` блокируется; успешный event сохраняет digest,
  injected Access publish failure после PlusBText work откатывает весь batch;
- append-only projection-index migration проходит empty/populated upgrade;
  deterministic `EXPLAIN QUERY PLAN` использует пять exact version/current-scoped
  indexes вместо correlated snapshot/current scans. Exact 1703-row wall-clock
  и 30-second provider limit доказываются remote preview lifecycle, а не временем
  полного Miniflare stage setup;
- bundle promote/rollback/roll-forward проверяет expected current pair,
  PlusBText/Access leases и fencing tokens, dependency и append-only events;
  retry timeout-after-commit reconciles completed event/current pair, а
  incompatible/mixed current state fail-closed;
- verify возвращает только aggregate target/issue/event counts, pair status и
  booleans pair uniqueness/dependency/foreign-key integrity и сверяет immutable
  planned run/source/snapshot/projection/issue count contract; first-import
  logical rollback отсутствует и возвращает
  `LEGACY_RELEASE_ROLLBACK_TARGET_MISSING`. Production promote/rollback/
  roll-forward до API-token lookup/network call fail closed кодом
  `LEGACY_RELEASE_PRODUCTION_TRANSACTION_EVIDENCE_NOT_IMPLEMENTED`;

### Import admin reconciliation

Реализованный suite `T-IMPORT-RECONCILIATION` по
[IMPORT_ADMIN_RECONCILIATION_TZ.md](IMPORT_ADMIN_RECONCILIATION_TZ.md):

- append-only migrations `0019`–`0022`: fresh/populated upgrade,
  FK/check/allowed transitions, immutable decisions/assertions/audit и atomic
  promotion fence при missing completion marker, active blocking case и exact
  candidate occurrence;
- один stable case для одного issue через несколько runs; persistence,
  disappearance, terminal recurrence, old-run replay и supersede проверяются
  exact version evidence и строгим порядком runs;
- generic `resolve|dismiss` actionable issue отклоняется на D1/repository/route
  boundary; typed action проверяет admin/RBAC, CSRF, optimistic version,
  idempotency и concurrent stale submit;
- exact course target связан с case `last_seen_version_id`; status-only/current-
  projection, fuzzy и mismatched evidence отклонены; revoke/race evidence
  откатывает весь terminal batch и снимает valid-resolution gate evidence;
- invalid email/DOB, family correction, price/duration и duplicate actions
  сохраняют fail-closed domain semantics; child evidence совпадает с case
  family/source/version/`source_child_key` и отвергает same-name sibling, а
  distinct-service доказывает exact duplicate pair;
- mixed/duplicate cohort запрещён; concurrent stale case откатывает весь batch,
  successful replay идемпотентен, changed-identity successor/supersede атомарен;
- row-level PlusBText issues получают разные PII-free source identities, а
  их semantic identity переживает вставку/перестановку соседних строк; duplicate
  Access issue сохраняет каждую exact opaque enrollment pair;
- `same_service_duplicate` удаляет peer из cabinet/pricing projections,
  атомарно supersede-ит mutable in-flight price-review item и fail-closed при
  applied peer; `distinct_service_proven` требует exact pair и разные current
  mappings;
- PII canaries отсутствуют в queue/export/audit/log; export сохраняет filters и
  выгружает весь результат за пределами первой UI page;
- exact bad candidate, active case и registration current pair fail closed;
  crash после `validated` до materialization не создаёт completion marker и
  блокирует promotion/registration, а исчезновение issue закрывает case только
  `resolved_by_reimport`.

Migrations `0019`–`0022`, `tests/integration/legacy-reconciliation-d1.test.ts`,
`tests/unit/admin-reconciliation-route-security.test.ts`, release verification
regression и parser/occupancy suites покрывают local `IMPORT-08`. Focused D1
suite отдельно проверяет scoped summary filters, version-bound mapping,
case/source-child-bound correction, exact duplicate pair/downstream price-review
consolidation, atomic evidence race/batch rollback, completion-marker
registration/promotion, atomic supersede reconciliation и promotion trigger.
Populated upgrade дополнительно проходит общий
`tests/integration/migration-upgrade-d1.test.ts`. External preview rehearsal,
independent admin cold-read и current-source owner decisions остаются отдельными
blocked gates и local suite их не заменяет.

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
- append-only migrations `0016_legacy_import_release_control.sql` и
  `0018_legacy_import_release_hardening.sql`: immutable plan/review/event,
  actor separation, protected count contract, append-only cleanup evidence и
  atomic PlusBText+Access release batch; populated `0016`→`0018` regression
  сохраняет grandfathered rows, но доказывает fail-closed для всех lifecycle
  transitions при `NULL` actors/`{}` contract и требует новый hardened plan.
- `0017_telegram_delivery_certainty.sql`: append-only delivery attempts/
  resolutions, activation/cooldown/policy constraints and preview-smoke claim/
  abort authorization/assertion guards. Empty и populated upgrade suites проходят
  весь local candidate `0001`–`0018`; deployed preview остаётся на
  `0001`–`0015`, поэтому local migration evidence не считается remote apply.

### API/browser integration

Сценарии выполняются Playwright против local/preview окружения с synthetic data:

- register → verify → namespace-2 assignment → create child with same FamilyID;
- register → verify exact legacy email → namespace-1 data in cabinet;
- register → verify → masked name-match proof → atomic FamilyID/children switch;
- catalog → quote → trial → admin decision;
- Nachhilfe/individual request → document/review;
- offer → parent acceptance → admin approval/activation; Browser lifecycle
  evidence для этого path допускается только в явно enabled approved synthetic
  renderer/send environment, а disabled flags дают лишь negative fail-closed
  evidence;
- price review → admin send approval → parent response → per-item admin
  confirmation → first-next-month scheduled apply;
- support/absence → admin answer → outbox;
- server-known login role redirect (`parent -> /cabinet`, `admin -> /admin`),
  shared `/account/security` и взаимный `parent`/`admin` route denial;
- parent A → parent B IDOR для child; request save/submit/cancel; document
  download/delete и route-request carrier; trial create/cancel; contract
  detail/artifact/end/attendance/media и route-offer carrier; price-review;
  message; privacy artifact/subject fields, включая valid-CSRF mutation без side
  effect;
- direct action boundary возвращает safe `404` для inaccessible object/carrier
  mismatch, а owned validation/state conflict остаётся `409`; обычный SvelteKit
  form transport может сериализовать semantic action failure в rendered 2xx,
  поэтому Browser дополнительно проверяет denial body и неизменность owner state;
- tampered cookie, revoked session и blocked user fail closed;
- mobile/keyboard German UI smoke и axe scan representative public/parent/admin
  forms; любая запись в `violations` либо `incomplete` проваливает automated
  accessibility case.

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
- lowered configured count/aggregate-byte ceilings remain atomic under two
  concurrent uploads; the losing write creates neither document nor linked
  storage-intent assertion;
- duplicate upload idempotency;
- document delete связывает server-injected route `requestId` с внутренним
  `document.request_id`; cross-owner и same-owner mismatched carrier дают safe
  not-found до replay/mutation, а exact replay требует тот же owner/request/
  document/key/hash и завершённую atomic assertion;
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
- complete canonical render-source bundle включает base body, kind clauses,
  fixed copy, CSS/fonts/assets и helper/schema/adapter versions; mutation каждой
  составляющей меняет source manifest/hash и hash фактического HTML;
- настоящий v2 регистрируется и реально рендерится отдельным engine/helper
  dispatch; committed v1 golden HTML/hash остаётся byte-for-byte прежним после
  добавления и изменения v2, unknown engine/version отклоняется без fallback;
- template install использует D1 staged storage intent и conditional
  create-if-absent R2 put: concurrent same-bytes replay даёт один object/link/
  success audit, concurrent different bytes не overwrite-ит winner и не
  оставляет partial/ложную D1 installation; crash после intent и после object
  write проходит штатный reconcile/cleanup;
- normal load и winner/loser verification делают metadata-first ETag-bound
  bounded `maximum + 1` read: exact max проходит, max+1 не вызывает full-body
  read, changed/truncated/hash-invalid object fail closed;
- aged staged intent → cleanup processing → concurrent installer retry и
  aged staged → deleted → retry создают/reuse следующую immutable generation;
  stale cleaner удаляет только старый key, повторный retry не создаёт лишнюю
  generation, итоговые D1/R2/history не содержат orphan/corrupt object;
- production с seeded `preview_review` row и preview с выключенным flag
  отклоняются до number reservation, draft/operational row, audit или R2 write;
- отдельный permanent `0023 → 0024` populated-upgrade fixture содержит approved
  provider/template rows и зависимые offers/artifacts; после migration проверяет
  полное сохранение полей/FK/triggers и forbidden scope/basis pairings;
- отдельный permanent `0024 → 0025` populated-upgrade fixture проверяет intent
  field/status preservation, generation-1 backfill, immutable lineage/key,
  append-only generation history и FK;
- exact evidence paths: `tests/unit/contract-template-bundles.test.ts`,
  `tests/unit/contract-storage.test.ts`,
  `tests/unit/admin-contracts-preview-gate.test.ts`, focused preview cases в
  `tests/integration/contracts-d1.test.ts`, recovery/concurrency suite
  `tests/integration/contract-template-install-d1.test.ts` и permanent fixture
  `tests/integration/migration-upgrade-d1.test.ts`;
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
- current admin is rejected from parent accept/decline even for an historically
  owned offer; parent accept followed by role promotion cannot be formed by the
  same user ID as Verein actor;
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
- authenticated end/attendance/media actions используют server-injected route
  `offerId`; contract/child и offer должны образовывать один owner-scoped
  canonical context, mismatch возвращает safe not-found до replay/mutation;
- exact statutory-withdrawal replay после terminal contract разрешён только
  тому же current eligible parent для тех же contract, route offer,
  idempotency key и command hash и только при passed atomic assertion; replay не
  дублирует request/events/outbox/audit/assertion, а foreign, mismatched и blocked
  actor fail closed;
- owner eligibility change immediately before attendance/media D1 batch rolls
  back the complete notice/task/event/outbox/audit/assertion or consent/audit/
  assertion chain; concurrent identical attendance/media/end calls produce one
  asserted evidence chain и один result reference;
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
- current admin cannot submit the parent response, and parent response followed
  by role promotion cannot be finally confirmed by the same user ID;
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
- outbox duplicate event creates one D1 row; fake-provider dedupe sends once, но
  этот тест не считается evidence внешней Telegram idempotency;
- transient retry/backoff, permanent/dead и stale lease recovery до provider
  dispatch;
- outbox candidate-select race повторно проверяет recipient внутри claim UPDATE;
  claim-first блокирует closure, closure-first возвращает null/cancelled и
  никогда не даёт одновременно closed account + processing email;
- outside hours, Friday evening/weekend;
- DST start/end in `Europe/Berlin`;
- payload redaction/minimal Telegram content;
- `tests/unit/telegram-bot-api-provider.test.ts`: exact `sendMessage` POST JSON,
  numeric configured destination, plain text, `link_preview_options.is_disabled`,
  `protect_content`, no parse mode/media/reply markup и отсутствие token/chat/
  payload/provider description в diagnostics;
- provider response matrix: valid `ok=true` с ожидаемым message/chat, destination
  mismatch, `429` с `retry_after`, explicit valid-`ok=false` `408|425|5xx` как
  conclusive retryable, permanent `400|401|403|404` и `migrate_to_chat_id`;
  destination mismatch, malformed/truncated/oversized/contradictory response,
  non-`ok=true` ambiguous envelope, network error и timeout становятся
  `TELEGRAM_DELIVERY_UNKNOWN` без automatic retry;
- `tests/unit/config.test.ts`: `bot_api` требует token и exact numeric chat,
  принимает signed-decimal string без `@username`, разделяет preview/production
  config, требует canonical UTC activation cutoff, запрещает production fake и
  fail closed при missing/invalid values;
- `tests/integration/messaging-outbox-d1.test.ts`: durable dispatch marker до
  fetch, post-dispatch crash/timeout и потерянный mark-sent переходят в
  `delivery_unknown`; stale lease после marker не отправляется снова, тогда как
  lease без marker остается reclaimable;
- audited manual reconciliation: `confirm_sent`, `retry_after_review` только с
  reason/evidence и explicit confirmation, `cancel`, неизменный delivery/
  dedupe reference, отсутствие generic retry для `delivery_unknown`;
- scheduler/admin-route tests различают `dead` и `delivery_unknown`, не считают
  их успешной доставкой и не раскрывают provider/PII evidence;
- `tests/integration/telegram-drain-safety-d1.test.ts`: первая ambiguous/retry/
  dead provider result размыкает batch; unresolved unknown или terminal dead
  блокирует следующий cron; `429` сохраняет destination cooldown даже без
  usable `retry_after`, который не обходит newly queued row; configured max
  attempts применяется при claim; pre-activation backlog остаётся pending;
- `tests/integration/telegram-preview-smoke-d1.test.ts`: exact target-bound
  `telegram:smoke:abort` отменяет только prepared pending или partial processing
  cohort с нулём attempts одним append-only authorization/update/assertion
  batch; cron не reclaim-ит smoke signature, post-dispatch/terminal abort
  запрещён, uncertain abort reconciles через read-only verify;
- тот же suite моделирует crash сразу после durable `dispatch_started` без
  provider call: `telegram:smoke:reconcile` до lease expiry отклоняется, после
  expiry без provider secrets/send/retry переводит exact attempt/outbox в
  `delivery_unknown`, возвращает one-attempt/manual-resolution evidence,
  идемпотентно reconciles partial/complete D1 write и запрещает новый run/abort;
- renderer/worker negative cases отклоняют до provider unexpected payload key,
  PII/free text, non-UUID reference, noncanonical time, query string и path/
  reference mismatch; D1 trigger tests отклоняют terminal status без matching
  append-only attempt/audit/resolution evidence;
- все перечисленные provider tests используют injected fake fetch и не делают
  внешних Telegram API calls.

### Admin и privacy

- parent/direct API denial для каждой admin surface;
- current admin получает `403` на всех parent product routes, включая direct
  child/correction/claim/message actions; retained parent state после
  synthetic role change не читается и не мутируется;
- обычное назначение admin и first-admin bootstrap отклоняют target с retained
  child/claim/correction/trial/request/enrollment/contract/price-review/message/
  privacy state одним batch без role/session/audit/control side effects;
- canonical retained-state guard явно перечисляет все 31 unique
  table/column reference, но не считает пустую FamilyID allocation
  retained business state;
- import issue/review task typed resolution и audit;
- legacy search pagination/redaction, user block session revocation;
- mapping/capacity/publish handlers и price diagnostics without raw source;
- subject-scoped private export без cross-user data; оба deployable download
  route существуют в clean source tree, self-service требует current parent,
  admin endpoint — current admin;
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

- empty migration и populated `0013 → 0015`: existing admin capability sealed,
  privacy cleanup/support rows сохранены, новые triggers/columns работают;
  legacy lease-less `processing` privacy cleanup становится retryable `failed`
  и затем успешно claim-ится новым Worker;
- clean first-admin bootstrap, invalid candidate, existing-admin denial,
  retained-parent-state denial, replay и two-candidate concurrency;
  role/session/audit/assertion/control cardinality;
  remote dedicated-environment config `APP_ENV`/deployed `database_id`,
  UUID-bearing confirmation, wrong UUID/shared-ID/placeholder/selector/
  `preview_database_id` dev-overlay/target mismatch rejection и escaped batch
  rendering;
- exact Cron allowlist, все fast/maintenance job IDs, scheduled disable,
  duplicate bucket, busy lease, manual audit/idempotency и failure isolation;
- `/admin/operations` anonymous/parent/CSRF/job/confirmation/key denial до D1/
  scheduler side effect;
- R2 write-ahead intent: grace boundary, current/stale lease, wrong-owner
  finalize, authoritative reference before claim и ambiguous-result reconcile;
- contract-template intent generation: cleanup processing/deleted retry,
  concurrent restage/install, stale-cleaner fencing, repeated idempotency и
  D1/R2/history consistency;
- contract/document/privacy R2 paths не делают eager delete после ambiguous D1
  response и не удаляют object, который мог быть linked;
- один binding object для archive/quarantine отклоняется, а allowed
  `archive/`/`quarantine/` keys маршрутизируются только в свой R2 binding;
- upload boundary отклоняет реальный PDF/ZIP dual-parser, в котором ZIP EOCD
  расположен до финального PDF xref/EOF, а также escaped PDF name `/Encrypt`;
- acceptance IP hash получает технический expiry 30×24h; cleanup до expiry не
  проходит, после expiry null-ит только IP value и сохраняет immutable evidence.
- E2E harness создаёт уникальный owner-marked temp root для каждого parallel run
  и удаляет runtime env/config/log/state после success/failure и поддерживаемых
  termination signals, не затрагивая sibling files; реальный Playwright run не
  оставляет новый root, runtime secret, listener либо Node/Playwright process.
- Stage-13 continuity check требует одинаковый structured
  `pending_independent_review` marker во всех status-bearing документах и
  отклоняет преждевременное current/latest independent GO на русском и английском.

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
- preview smoke с fake/non-production email и R2; локальные Telegram tests
  используют только fake fetch/provider;
- только после отдельного разрешения — один real Telegram `bot_api` preview smoke
  в dedicated preview channel с синтетическим минимизированным payload:
  ignored target manifest, independent ≤24h deployment observation, clean exact
  Git SHA и deployed Worker version; keyed bot/chat binding; read-only
  identity/chat/rights/no-webhook preflight; disarmed `max_attempts=1` normal-
  outbox row; exact-cohort atomic claim, concurrent run/ordinary-cron exclusion,
  видимый delivery reference, returned message ID, exact one delivery и PII-free
  log/admin evidence. Ambiguous result обязан остаться `delivery_unknown` без
  retry. Если send не разрешён/не начался, D1-only abort доказывает `cancelled`,
  zero attempts и no provider ID. Local suites используют fake provider/D1 и не
  являются external smoke;
- если authorized `run` завершился после `dispatch_started` без terminal
  evidence, не повторять его: после exact lease expiry D1-only reconcile без
  Telegram secrets/provider path должен доказать `delivery_unknown`, one attempt
  и необходимость обычного audited operator resolution;
- target/deployment-evidence writers не перезаписывают artifact, отклоняют
  symlink, используют POSIX `0600`; на Windows удаляют inheritance, назначают
  current SID owner и единственный `FullControl` allow rule, затем fail-closed
  сверяют `rulesProtected`/owner/rules. Secret/chat/observer identifiers не
  попадают в argv/stdout;
- remote Browser Run и provider sandbox smoke с production-shaped bindings;
- отдельный synthetic preview legacy release: exact-target plan с ожидаемыми
  встроенными 1703 Access rows/21 required fields и без Office paths,
  stage/review/recovery-evidence/promote/verify/rollback/
  roll-forward, timeout reconciliation, FK/pair/dependency checks и PII-free
  evidence. Этот gate требует отдельного разрешения на remote changes и остаётся
  blocked до фактического rehearsal; local D1 atomicity его не заменяет;
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

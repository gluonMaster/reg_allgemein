# R2-хранилище и безопасность загрузок

Документ задаёт утверждённый operational contract для private artifacts.
Бизнес-сроки хранения находятся в
[PRIVACY_RETENTION.md](../domain/PRIVACY_RETENTION.md). Для MVP принят ручной
local-AV flow; платный server scanner не требуется.

## Размещение и объём

Используются два физически разных private R2 Standard bucket без `r2.dev`/
public URL: `R2_QUARANTINE` для недоверенных uploads и `R2_ARCHIVE` для approved/
generated evidence. Оба создаются сразу с `jurisdiction=eu`, потому что
jurisdiction нельзя изменить после создания. Один bucket под двумя bindings не
считается изоляцией. Location Hint не заменяет jurisdictional restriction.

Оценка для 5 000 PDF:

| Средний размер PDF | Общий объём |
| -----------------: | ----------: |
|           0,25 MiB |     1,31 GB |
|            0,5 MiB |     2,62 GB |
|              1 MiB |     5,24 GB |
|              2 MiB |    10,49 GB |

Это небольшой объём. R2 Standard включает 10 GB-month и большие бесплатные
месячные квоты операций; при 2 MiB на PDF превышение составляет около 0,49 GB,
а округлённая стоимость порядка 0,015 USD/месяц по текущему тарифу. В capacity
plan отдельно считаются funding uploads, HTML/source bundles, новые immutable
versions, quarantine и backups. Infrequent Access для такого MVP не выбирается:
его free tier не касается и он добавляет retrieval/minimum-duration costs.

Актуальные источники: [R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[data location](https://developers.cloudflare.com/r2/reference/data-location/)
и [R2 limits](https://developers.cloudflare.com/r2/platform/limits/).

## Разделение artifacts

- internally generated contract HTML/PDF идёт сразу в immutable private
  contract archive: пользовательский файл в renderer не исполняется;
- PDF/JPEG/PNG от parent сначала попадает только в private quarantine; JPEG/PNG
  предпочтительнее как менее функциональные форматы, но PDF остаётся нужен для
  многостраничных решений Jobcenter/Sozialamt;
- object keys случайные и не содержат имя, email, FamilyID или original filename;
- D1 хранит owner, size, detected type, SHA-256, status и scan-attestation
  metadata, но
  не body документа;
- выдача всегда проходит server-side owner/RBAC check и audit для admin.

Каждый application `put`, включая contract template/source bundle, использует
D1 write-ahead intent: до записи body
создаётся `storage_object_intents(status=staged)` с bucket class, opaque key,
hash, size и source reference. Domain D1 batch одновременно фиксирует ссылку на
object, переводит intent в `linked` и создаёт append-only
`storage_intent_link_assertions`. Если ответ D1 после `put` неоднозначен,
application не удаляет object наугад: reconciler сначала ищет authoritative D1
reference. Referenced intent становится `linked`; только не referenced staged/
`delete_pending` object после 15-минутного grace можно lease-нуть и удалить.
Claim повторяет `NOT referenced` в conditional update, поэтому поздно
зафиксированная ссылка выигрывает у cleanup. Duplicate/stale Worker delivery
ограничивается lease owner и не завершает чужую попытку.

Contract-template installer дополнительно использует immutable intent family,
монотонную generation, generation-specific R2 key и отдельную installer lease.
Cleanup claim/complete/delete всегда fenced exact `id + generation + owner`.
Истёкший `processing` либо уже `deleted` intent не блокирует safe retry:
installer создаёт следующую generation с тем же exact bundle binding. Старый
cleaner может удалить только object своей generation и не затрагивает новый.
Append-only `storage_intent_generations` сохраняет lineage/hash/size/key.

Для deterministic immutable template key обычная последовательность
`GET-if-missing → PUT` запрещена как TOCTOU. R2 `put` обязан использовать
atomic create-if-absent precondition через Workers binding `onlyIf`; failed
precondition возвращает no-write result, после чего application перечитывает
объект и проверяет exact bytes/size/SHA-256. Ни failed precondition, ни
concurrent conflicting body не разрешают overwrite. D1 link/install transaction
принимает только exact intent/object/template state и сама создаёт terminal
assertion; post-commit client check не превращает partial installation в
success. Crash после R2 write оставляет staged intent для штатного reconcile и
grace/lease cleanup, а не неучтённый special-case object. Актуальные provider
semantics сверяются по
[R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
и
[D1 batch contract](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch):
conditional R2 `put` при failed precondition не записывает object, а ошибка
statement в D1 batch откатывает всю последовательность.

Любое чтение contract template/HTML/PDF сначала выполняет metadata-only `head`
и отклоняет declared size выше domain ceiling. Body читается только bounded
range длиной `maximum + 1`, conditional по ETag из `head`; metadata-only ответ
на failed condition, изменившийся ETag/size, truncated body, max+1 или hash
mismatch завершаются fail-closed. `arrayBuffer()` допускается только для такого
уже bounded response. Это правило одинаково для normal load, winning/losing
installer verification, recovery, owner/admin download и email attachment.

Configured ceilings, если они ниже hard default, входят в тот же conditional D1
batch: document INSERT проверяет актуальные `COUNT`/`SUM(size_bytes)` на момент
записи. Конкурентный upload, проигравший этот guard, не создаёт domain link и не
переводит intent в `linked`; staged object остаётся для штатной reconciliation/
orphan cleanup, а не удаляется по неоднозначному результату.

## Базовая изоляция

Auth/ownership, idempotency, hard limits, allowlist extension/MIME, basic
magic-byte validation и SHA-256 выполняются до либо во время streaming upload.
Разрешены только PDF, JPEG и PNG. ZIP, Office, SVG/XML, executable formats,
encrypted/password-protected, oversize и type-conflicting files отклоняются.
Original filename не используется как object key или response filename.

Для PDF допустим только bounded non-rendering header/trailer check, необходимый
для type/encryption rejection; full document parse, embedded-content extraction
и decompression в application Worker запрещены. Encryption-name check
декодирует стандартные PDF escapes `#HH`, поэтому `/Encr#79pt` и аналогичные
варианты не обходят fail-closed rejection.

Эти проверки не являются антивирусом. R2 хранит объект как opaque bytes и не
исполняет его; заражение server-side возникает только если приложение передаст
untrusted body уязвимому parser/renderer. Поэтому quarantine body:

- не рендерится, не извлекается full parser-ом и не индексируется;
- не передаётся contract renderer, OCR, email preview или third-party service;
- не выдаётся parent и не показывается inline даже admin;
- доступен только через отдельный audited forced attachment-download.

## Ручной MVP-flow без server scanner

```text
authenticated parent upload
  -> private EU R2 quarantine (opaque random key)
  -> admin forced download as application/octet-stream
  -> local approved antivirus scan
  -> hash-bound admin clean attestation
  -> separate business review
  -> approved private document access
```

### Обязательный preview rehearsal

По `REQ-11`/`OQ-036` этот flow до `full-manual-preview` проходит фактически, а
не только unit/integration tests или disabled-flag smoke. Используются
Access-protected preview, его реальные раздельные private EU R2 bindings,
verified synthetic parent и admin roles и специально созданные PDF/JPEG/PNG без
PII. Оператор сохраняет forced download в выделенную локальную quarantine-
папку, не открывает файл до актуальной Defender/approved-AV проверки, затем в
UI сверяет SHA-256 и выполняет clean attestation; business review остаётся
отдельным действием.

Evidence фиксирует только opaque IDs, hash/status/version/timestamps и audit,
без filename/body, email или иных PII. Минимальный проход включает approved и
rejected outcomes, hash mismatch/direct-approve negative checks, owner/admin
access boundary и idempotent cleanup отдельного неутверждённого synthetic
artifact по 14×24h contract. Production flag, реальные документы, обучение
всех операторов и privacy/provider approval остаются отдельными gates после
этого rehearsal.

Controlled download:

- разрешён только admin после повторной RBAC-проверки и purpose/audit;
- использует short-lived single-object response, `Content-Disposition:
attachment`, `Content-Type: application/octet-stream` и opaque filename с
  short SHA-256; карантинный файл нельзя открыть через inline viewer;
- не использует public bucket/r2.dev. Presigned URL, если выбран, считается
  bearer token и получает минимальный TTL; предпочтителен authenticated Worker
  proxy, не раскрывающий reusable object URL.

Admin сохраняет файл в выделенную локальную quarantine-папку, не открывает его
и запускает custom scan актуальным утверждённым antivirus. Для штатного Windows
Defender допустим Windows Security custom scan либо
`Start-MpScan -ScanType CustomScan -ScanPath <path>`. После clean result admin
на сайте подтверждает versioned текст: проверен именно artifact с показанным
SHA-256, antivirus definitions актуальны, угроз не найдено. Система сохраняет
admin ID, artifact hash, scanner label, attestation-text version и timestamp.

Переходы ручного пути:

```text
quarantined -> clean                 # только manual local-AV attestation
quarantined -> infected|rejected     # AV alert либо отказ admin
clean -> approved|rejected           # отдельный business review
```

`clean` не означает, что направление действительно или читаемо. Business
approval отдельно проверяет authority/dates/content. Замена хотя бы одного byte
создаёт новый SHA-256/document version и снова начинает с `quarantined`.
Абстрактные `scan_pending|suspicious|scan_failed` остаются зарезервированы для
будущего automated adapter и не используются ручной кнопкой.

Для каждого object `quarantine_expires_at = uploaded_at + 14×24h` в UTC. Object,
который не перешёл в `approved`, становится eligible для удаления только при
`now >= quarantine_expires_at` и удаляется первым успешным cleanup после этого
порога, но никогда раньше. Cleanup идемпотентен, оставляет минимальный audit без
body/filename и не продлевает TTL повторным download/attestation. Истёкший
документ нужно загрузить заново. После
`approved` artifact перемещается/копируется в private document archive и
подчиняется business retention, а не quarantine TTL.

После `approved` JPEG/PNG можно показывать через owner-checked response. PDF
можно просматривать только через отдельный document origin без application
cookies и с short-lived authorization; если отдельная origin/sandbox boundary
не настроена, остаётся только forced download. Ни один approved object не
становится public.

Ручная attestation — контролируемый человеческий процесс, а не техническое
доказательство результата antivirus. Production upload включается только после
реализации flow, утверждения короткого runbook, обучения admin и тестового
прохода. Если позднее появится бюджет, этот interface можно заменить
автоматическим Queue/ClamAV adapter без изменения business review.

Источники operational guidance:
[OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html),
[Microsoft Defender custom scans](https://learn.microsoft.com/en-us/defender-endpoint/run-scan-microsoft-defender-antivirus),
[Start-MpScan](https://learn.microsoft.com/en-us/powershell/module/defender/start-mpscan),
[R2 presigned URL security](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

Публичный VirusTotal и аналогичные бесплатные public scanners для клиентских
документов запрещены: конфиденциальный upload нельзя передавать сервису с
неподходящим sharing/retention contract. Любой внешний scanner требует EU
processing, AVV/DPA, subprocessor/no-training/no-retention review.

## Проверки

- clean PDF/JPEG/PNG, encrypted PDF и известный local-AV alert fixture;
- clean, но нерелевантный/нечитабельный funding document и request-reupload;
- MIME/extension spoof, реальный PDF/ZIP dual-parser polyglot (ZIP EOCD до
  финального PDF xref/EOF) и malformed file;
- oversize, ZIP/Office/SVG/executable rejection;
- два конкурентных upload при configured count limit `1` и при пониженном
  aggregate byte ceiling не обходят лимит; проигравшая запись не получает
  document/link assertion;
- ни parent, ни обычный inline/download path не получает quarantined object;
  admin получает только forced attachment после RBAC/audit;
- clean attestation без предшествующего download, для другого hash, без scanner
  label/text confirmation либо повторная attestation отклоняются/дедуплицируются;
- `clean` не равен business `approved`; после replacement прежняя attestation не
  переносится;
- approved PDF не открывается на application origin с session cookies;
- cross-user object ID и expired link отклоняются;
- до `quarantine_expires_at` cleanup не удаляет body; первый успешный cleanup при
  `now >= quarantine_expires_at` удаляет его, не затрагивает approved archive и
  безопасно переживает duplicate cron delivery;
- ambiguous D1 result после R2 put не вызывает eager delete; reconciler связывает
  referenced object, а orphan cleanup не claim-ит object при появившейся D1
  ссылке и соблюдает 15-минутный grace/lease;
- oversized contract object отклоняется по metadata до body read; exact max
  читается bounded range, max+1 отклоняется; changed ETag, truncated range и
  integrity mismatch не принимаются ни normal load, ни installer verification;
- aged staged intent можно повторно установить во время/после cleanup через
  следующую generation; stale cleaner удаляет только старый key, повторные
  retries идемпотентны, а D1/R2 остаются согласованными без orphan/corrupt object;
- logs/outbox не содержат filename, document body и PII.

# R2-хранилище и безопасность загрузок

Документ задаёт утверждённый operational contract для private artifacts.
Бизнес-сроки хранения находятся в
[PRIVACY_RETENTION.md](../domain/PRIVACY_RETENTION.md). Для MVP принят ручной
local-AV flow; платный server scanner не требуется.

## Размещение и объём

Используются private R2 Standard buckets без `r2.dev`/public URL. Bucket для
клиентских документов и договоров создаётся сразу с `jurisdiction=eu`, потому
что jurisdiction нельзя изменить после создания. Location Hint не заменяет
jurisdictional restriction.

Оценка для 5 000 PDF:

| Средний размер PDF | Общий объём |
| ---: | ---: |
| 0,25 MiB | 1,31 GB |
| 0,5 MiB | 2,62 GB |
| 1 MiB | 5,24 GB |
| 2 MiB | 10,49 GB |

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

## Базовая изоляция

Auth/ownership, idempotency, hard limits, allowlist extension/MIME, basic
magic-byte validation и SHA-256 выполняются до либо во время streaming upload.
Разрешены только PDF, JPEG и PNG. ZIP, Office, SVG/XML, executable formats,
encrypted/password-protected, oversize и type-conflicting files отклоняются.
Original filename не используется как object key или response filename.

Для PDF допустим только bounded non-rendering header/trailer check, необходимый
для type/encryption rejection; full document parse, embedded-content extraction
и decompression в application Worker запрещены.

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
- MIME/extension spoof, polyglot и malformed file;
- oversize, ZIP/Office/SVG/executable rejection;
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
- logs/outbox не содержат filename, document body и PII.

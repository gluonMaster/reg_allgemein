# Полный ручной preview

<!-- stage-13-current-review-status: independent_go -->

Этот runbook определяет checkpoint `full-manual-preview`: рабочую тестовую
систему на синтетических данных, а не production release. Канонический origin —
`https://preview.example.com/`; Cloudflare
Access остаётся перед Worker. Provider-вызовы уходят из этого Worker в Resend и
Telegram, а D1/R2/Browser используют только отдельные preview resources.

Источники требований: `SYS-04`, `REQ-11`, `CONTRACT-21`, `MSG-07` в
[MVP_SPEC.md](../spec/MVP_SPEC.md), критерии в
[ACCEPTANCE_CRITERIA.md](../spec/ACCEPTANCE_CRITERIA.md), детальные процедуры в
[OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md). Этот документ не заменяет их.

## Неподвижные границы

- production, официальный сайт, реальные Office/PII-источники и реальные
  клиенты не затрагиваются;
- используются только заранее созданные синтетические записи/файлы и
  owner-controlled test mailboxes;
- email/Telegram/document body, имена, адреса, телефоны, cookies и secrets не
  записываются в Git, evidence, audit summaries или консольный вывод;
- production approvals не подменяются preview evidence, но их отсутствие не
  блокирует выполнение preview lifecycle;
- deploy, secret/provider mutation и первая внешняя отправка выполняются только
  после точной остановки и подтверждения владельца; independent review выполняет
  отдельная роль/сессия и не симулируется автором кандидата.

## Порядок достижения checkpoint

1. Exact reviewed candidate `1607d6de55491afe7a2bea059e5f36e8718e0b8c`,
   direct child `6ebf4761712c07de262fbac0bb3d532f98fd74c3`, содержит неизменённые
   runtime/migration `0024`/`0025`/E2E boundaries и token-local continuity
   remediation. Fresh independent review вернул **GO** с 0 BLOCKER / 0 HIGH /
   0 MEDIUM / 0 LOW.
2. Зафиксированная remediation не меняет runtime или migrations: один pure
   validator обслуживает CLI/tests и связывает negation только с конкретным
   completion token. Unrelated negative clause больше не подавляет отдельный
   positive review clause; pure-negative/historical controls сохраняются.
   `docs:check` сам исполняет mixed-polarity RU/EN probes в обоих clause orders
   во всех семи status paths. Текущий статус — `independent_go`; local
   continuity/review gate закрыт. Remote recovery/apply/deploy остаются
   запрещены до отдельного прямого разрешения владельца.
3. После отдельной authorization создать fresh candidate-bound preview D1
   recovery point и isolated restore; проверить
   migration inventory, per-table counts, FK/quick-check и protected evidence.
4. Согласовать без публикации значений: два owner-controlled email accounts,
   dedicated preview Telegram bot + exact numeric destination/type, текущий
   approved local AV label/version и факт готовности отдельной quarantine-папки.
5. Только после зафиксированного independent GO, fresh recovery evidence и
   отдельного разрешения применить `0024`, `0025` и весь exact reviewed
   append-only ledger только к
   preview и candidate-bound recovery copy. Развернуть exact reviewed candidate
   в тот же Access-protected origin с fail-closed конфигурацией и выполнить
   health/auth smoke до внешней отправки.
6. Включить public auth + Resend только для SHA-256 allowlist согласованных
   test recipients. Создать и email-верифицировать два synthetic аккаунта;
   bootstrap admin выполнять ровно один раз штатной командой. После bootstrap
   родительская и административная роли остаются раздельными.
7. Пройти регистрацию, кабинет, child/course/request и отрицательные
   cross-owner/CSRF/idempotency сценарии по test plan.
8. Пройти документный flow: synthetic upload → preview quarantine R2 → forced
   admin download → local AV → hash-bound attestation → отдельный business
   approve/reject → owner download/negative access → cleanup evidence.
9. Пройти договорный flow: установить четыре `preview-review-v1` bundle; реально
   отрендерить и доставить четыре marked PDF; для одного выполнить parent
   acceptance → отдельное admin formation/activation → certificate/download.
10. Пройти dedicated Telegram target/preflight и ровно один normal-outbox
    PII-free smoke: prepare → send/unknown handling → verify/operator rehearsal.
11. Выполнить authenticated browser/accessibility/manual matrix, outbox/cron/
    storage/monitoring checks и обновить Stage-13 ledger только фактическими
    evidence. После прохождения checkpoint production остаётся NO-GO до своих
    legal/privacy/provider/training/data approvals.

## Точные остановки для владельца

Агент останавливается не «заранее вообще», а непосредственно перед одним из
следующих действий:

- ввод/установка Resend, Turnstile или Telegram secret;
- подтверждение двух test-recipient адресов (в evidence используются только их
  SHA-256) и отправка первого письма;
- подтверждение bot identity, exact numeric Telegram destination/type и отправка
  единственного smoke message;
- deploy exact reviewed candidate или применение migration к remote preview;
- ручной local-AV шаг, который физически выполняет оператор на скачанном файле;
- independent exact-SHA verdict отдельной ролью.

Independent GO exact `1607d6d…` зафиксирован. Следующий gate уже не требует
нового review loop, но recovery/apply/deploy/provider-send остаются remote
mutations и выполняются только после отдельного прямого разрешения владельца.

Если один параметр отсутствует, остальные локальные и read-only проверки
продолжаются. Нельзя объявлять весь preview «заблокированным» из-за будущего
production approval.

## Rollback

Preview выключается fail-closed значениями
`AUTH_PUBLIC_ENABLED=false`, `EMAIL_PROVIDER=disabled`,
`DOCUMENT_UPLOAD_ENABLED=false`, `CONTRACT_PREVIEW_REVIEW_ENABLED=false`,
`CONTRACT_SEND_ENABLED=false`, `CONTRACT_RENDERER=disabled`,
`TELEGRAM_PROVIDER=disabled`. Evidence и immutable D1/R2 artifacts сохраняются;
ручное удаление или переписывание принятого contract artifact запрещено.

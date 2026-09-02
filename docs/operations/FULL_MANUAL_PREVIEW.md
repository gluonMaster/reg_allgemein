# Полный ручной preview

<!-- stage-13-current-review-status: pending_independent_review -->

Этот runbook определяет checkpoint `full-manual-preview`: рабочую тестовую
систему на синтетических данных, а не production release. Канонический origin —
`https://preview.example.com/`; Cloudflare
Access остаётся перед Worker. Provider-вызовы уходят из этого Worker в Resend и
Telegram, а D1/R2/Browser используют только отдельные preview resources.

Источники требований: `SYS-04`, `REQ-11`, `CONTRACT-21`, `MSG-07` в
[MVP_SPEC.md](../spec/MVP_SPEC.md), критерии в
[ACCEPTANCE_CRITERIA.md](../spec/ACCEPTANCE_CRITERIA.md), детальные процедуры в
[OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md). Этот документ не заменяет их.
Краткие действия владельца и готовый goal prompt находятся в
[OWNER_FULL_MANUAL_PREVIEW_GUIDE.md](OWNER_FULL_MANUAL_PREVIEW_GUIDE.md).

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

## Приоритет и темп

Ближайший результат — работающий preview, который владелец видит и проверяет
руками. На этом пути немедленно блокируют только `P0/P1` из `AGENTS.md`:
безопасность/PII/ownership/target/rollback либо воспроизводимый отказ
обязательного flow. `P2/P3` фиксируются в backlog и не запускают новый цикл
полировки или independent review.

Работа делится на короткие фазы: target/recovery → migrations → fail-closed
Worker deploy → auth/accounts/bootstrap → реальные provider/document/contract
контуры → owner exploratory pass. Успешная фаза не повторяется без drift,
material diff или воспроизводимого `P0/P1`. Проверки каждой фазы покрывают только
её изменённую surface; unchanged reviewed runtime наследует уже записанный
full-suite evidence.

После каждой попытки remote mutation и до следующей mutation обязательны
read-only postcondition, обновление tracked active state и маленький docs-only
checkpoint commit. Владелец получает текущий/следующий atomic step,
`rollover_required` и рекомендацию режима следующей сессии: `High` для обычного
известного deploy, `Medium` для чисто read-only продолжения, `Max` только при
подтверждённом серьёзном риске с понятным объяснением. Failed/ambiguous write не
повторяется вслепую.

## Порядок достижения checkpoint

1. Historical reviewed Turnstile async/onload candidate `bef5789…` развёрнут как
   `745295d36248`/100%; real widget показал «Успешно», submit enabled, render P1
   закрыт. Последующая разрешённая registration failed. Локально исправляются
   native fetch receiver и D1 history-scan cost; новый review/deploy/retry pending.
   Exact current evidence
   находится в [active state](../implementation/STAGE_13_ACTIVE_STATE.md).
   Historical registration remediation anchor
   `146f9c54ff082ad695ef47c7da9c6a578e09a9a5`, parent `fbb9520…`, прошёл local
   release gates и получил fresh independent **GO**: 0 `P0`, 0 `P1`, 1 `P2`,
   0 `P3`. Он ранее был развёрнут как `a4fab5d09f63`/100% и теперь retained
   для rollback этого исторического deploy.
   Historical deployed candidate
   `ec11bbc43c3af69d9e60cce4064863db33c45ad2`,
   direct child `e8a67d088ef1ddd2b362596fee494c3e68b6c985`, сохраняет Worker runtime,
   migrations `0024`/`0025`, dependency/config/E2E boundaries reviewed full-suite
   ancestor и добавляет только fail-closed ACL verification локального operator
   artifact. Fresh independent review вернул **GO** с P0/P1/P2/P3 = 0.
2. Historical `146f9c5…` evidence: check 0/0, full Vitest 566 pass + 1 Windows
   skip, Chromium 20/20, build, audit 0, docs/scan/diff. Historical focused
   auth/email 71/71 и ACL 25/25, check, build, strict dry-run, audit,
   executable docs contract, release scan и exact diff прошли. Текущий статус —
   `pending_independent_review` для нового local remediation. Deploy exact
   `bef5789…` и real widget check остаются историческим evidence. Дорогие D1
   snapshots и health diagnostic polling остановлены; следующие remote gates
   требуют cost-bounded procedure и нового разрешения после review.
   Recovery/schema и два Worker
   deploy уже выполнены по отдельным разрешениям; provider sends, accounts,
   bootstrap и production по-прежнему требуют отдельного прямого разрешения.
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

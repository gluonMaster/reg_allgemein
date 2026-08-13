# Аварийное восстановление

Статус документа: `blocked`. RPO, RTO, backup cadence/retention, R2 backup
mechanism и full isolated restore rehearsal ещё не утверждены и не доказаны.
Два отдельных private EU preview R2 bucket проверены, но это только isolation/
placement evidence: production и restore-target buckets, backup mechanism и
восстановление остаются недоказанными.

Наличие export или provider backup само по себе не означает возможность
восстановления. `passed` допустим только после полного D1/R2 restore в новую
non-production environment и критического smoke. Production restore требует
отдельного прямого поручения.

## Неизменяемые правила

- Applied D1 migrations не переписываются и не удаляются. После migration
  выбирается совместимый code rollback, forward-fix migration либо restore.
- Code rollback, D1 restore, R2 restore и import-version rollback — четыре разные
  процедуры и четыре отдельных решения.
- Preview/restore resources никогда не используют production Worker, D1, R2,
  credentials, origin или client-facing providers.
- Backup/export с PII хранится вне Git/build/log, в утверждённом encrypted
  location с least-privilege access.
- В evidence допускаются только environment, timestamp, object/table counts,
  schema/migration IDs, hashes и safe error codes; не допускаются rows, filenames,
  bodies, email, token, cookie, secret или полный local path.
- Удаление production data/resources не является частью этого runbook.

## Release inputs

| Input                               | Значение                                        | Gate при отсутствии |
| ----------------------------------- | ----------------------------------------------- | ------------------- |
| RPO                                 | `<APPROVED_RPO>` — не задано                    | `blocked`           |
| RTO                                 | `<APPROVED_RTO>` — не задано                    | `blocked`           |
| Backup cadence                      | `<APPROVED_CADENCE>` — не задано                | `blocked`           |
| Backup retention                    | `<APPROVED_RETENTION>` — не задано              | `blocked`           |
| D1 backup owner/location/encryption | `<APPROVED_D1_BACKUP_PROFILE>` — не задано      | `blocked`           |
| R2 backup owner/location/encryption | `<APPROVED_R2_BACKUP_PROFILE>` — не задано      | `blocked`           |
| Restore environment config          | `<RESTORE_CONFIG>` — не создан/не проверен      | `blocked`           |
| Restore D1                          | отдельная пустая non-production D1              | `blocked`           |
| Restore R2                          | отдельные private EU archive/quarantine buckets | `blocked`           |
| Production restore approval         | отдельное прямое поручение                      | `blocked`           |

Эти значения нельзя заменять отраслевыми defaults или оценкой агента.

## Resource inventory

Реализованный stage-13 inventory:

| Назначение                   | Binding         | Restore target                     |
| ---------------------------- | --------------- | ---------------------------------- |
| Runtime database             | `DB`; current migrations `0001`–`0015` | новая isolated non-production D1   |
| Retained/approved archive    | `R2_ARCHIVE`    | новый private EU archive bucket    |
| Quarantine/transient objects | `R2_QUARANTINE` | новый private EU quarantine bucket |

Полный append-only migration set `0001_foundation.sql`–
`0015_worker_monitoring.sql`, `R2_ARCHIVE` и `R2_QUARANTINE` сверены с runtime и
локальными migration/storage-intent тестами. Current preview имеет migrations
`0001`–`0015`, pending 0, и физически разные private EU buckets. Это не доказывает
production/restore-target placement и не заменяет полный restore rehearsal; R2
backup/restore gate остаётся `blocked`.

Initial preview migration evidence 2026-08-10 (`0001`–`0014`, 14/14, pending 0)
сохраняется как историческая точка до monitoring migration. Append-only
`0015_worker_monitoring.sql` применена 2026-08-11. Поэтому current backup/restore
compatibility и rollback проверяются относительно `0001`–`0015`, а не прежнего
набора из 14 migrations.

## 1. Классифицировать событие

**Prerequisites:** известны UTC start time, environment, Worker version и safe
incident reference; operator не изменяет data.

**Точное действие:** выбрать один или несколько классов:

1. `code_only` — новая Worker version дефектна, schema/data целы;
2. `migration` — schema/data изменены migration;
3. `import` — promoted import version неверна, runtime schema цела;
4. `d1_loss_or_corruption` — требуется D1 restore;
5. `r2_loss_or_corruption` — требуется R2 restore;
6. `credential_or_access` — требуется containment/rotation, а не data restore.

**Ожидаемый безопасный результат:** incident имеет affected resources, known-good
version/time, containment owner и предполагаемую процедуру без client data.

**Проверка:** второй operator/security owner подтверждает класс и границы.

**Stop condition:** environment/known-good point неизвестны, evidence исчезает,
или предлагают один общий «rollback» для code/migration/import/storage.

**Rollback/recovery:** оставить affected write/external feature fail-closed,
сохранить evidence и эскалировать. Не начинать restore по догадке.

## 2. Создать и проверить pre-change D1 export

Команда поддерживается Wrangler, но approved storage/encryption/cadence ещё не
заданы. Поэтому production применение `blocked`.

**Prerequisites:** exact target D1/config проверены двумя людьми; protected output
directory находится вне repository/cloud sync; достаточно encrypted capacity;
получено backup approval.

**Команды:**

```powershell
npx wrangler d1 export DB --remote --config <TARGET_CONFIG> --output <PROTECTED_BACKUP_PATH>
Get-FileHash -Algorithm SHA256 -LiteralPath <PROTECTED_BACKUP_PATH>
```

Не использовать `--skip-confirmation` в ручной production процедуре.

**Ожидаемый безопасный результат:** создан SQL export с schema/data; hash и UTC
timestamp записаны в закрытом backup catalog; файл не находится в Git workspace.

**Проверка:** размер ненулевой; hash повторяется; backup catalog указывает
environment/Worker/migration state и access owner. Полный path и содержимое не
копируются в checklist.

**Stop condition:** output path внутри repository, target D1 не подтверждена,
disk/encryption/access неизвестны, export failed/partial, backup невозможно
немедленно проверить restore rehearsal.

**Rollback/recovery:** remote D1 не изменена. Изолировать partial file и удалить
его только approved secure-disposal procedure; повторить после устранения причины.

## 3. Создать pre-change R2 backup

**Prerequisites:** утверждены `R2_ARCHIVE` и `R2_QUARANTINE`, destination,
encryption, access, cadence/retention, object version/metadata semantics и
копирующий tool.

**Точная команда/UI:** отсутствует. Репозиторий не содержит проверенного полного
R2 backup script; provider backup/copy mechanism не выбран. Не использовать
ad-hoc `r2 object get`, public URL или произвольный sync tool.

**Ожидаемый безопасный результат:** два независимых manifests содержат object
count, opaque key hash, size/content hash, metadata/version и backup timestamp;
archive/quarantine не смешаны.

**Проверка:** полный restore в новые private EU buckets и выборочная сверка hash/
metadata/ownership.

**Stop condition:** один bucket/binding, public destination, unknown jurisdiction,
нет manifest/hash/metadata, backup tool выводит object keys/PII или restore не
репетировался.

**Rollback/recovery:** не выполнять migration/import/deploy, требующие R2 backup.
Gate остаётся `blocked` до реализации и rehearsal.

## 4. Восстановить D1 в isolated non-production

**Prerequisites:** шаг 2 имеет verified backup/hash; создана новая пустая restore
D1, не связанная с preview/production Worker; `<RESTORE_CONFIG>` указывает только
на restore resources; client-facing providers disabled.

**Команда:**

```powershell
npx wrangler d1 execute DB --remote --config <RESTORE_CONFIG> --file <PROTECTED_BACKUP_PATH>
```

**Ожидаемый безопасный результат:** import завершается с code 0; production D1
не изменена; restored schema/data соответствуют backup point.

**Проверка:** migration/schema inventory, table-level safe counts/constraints,
foreign-key/uniqueness smoke и automated integration/synthetic critical path.
Нельзя выводить sample rows.

**Stop condition:** restore config содержит production ID/origin/credentials,
target не пуст, SQL error, schema mismatch, PII появляется в transcript или
application пытается отправить email/Telegram.

**Rollback/recovery:** прекратить; изолировать restore Worker/resources. Не
повторять поверх partial target: создать новый пустой restore target после
provider-approved cleanup decision.

## 5. Восстановить R2 в isolated non-production

**Prerequisites:** approved R2 backup mechanism и manifests; новые private EU
`R2_ARCHIVE`/`R2_QUARANTINE`; restore Worker не имеет production secrets/origin.

**Точная команда/UI:** отсутствует. Полный restore нельзя
заменить ручным копированием нескольких объектов.

**Ожидаемый безопасный результат:** object counts, content hashes, metadata,
archive/quarantine placement и D1 references совпадают с manifest; public access
отсутствует.

**Проверка:** safe aggregate reconciliation; owner-scoped authenticated downloads
для synthetic records; quarantined objects по-прежнему forced-download/admin-only;
ordinary archive search отсутствует.

**Stop condition:** object key/body выводится в evidence, bucket public/non-EU,
hash/metadata mismatch, D1 указывает на отсутствующие objects, archive попал в
quarantine или наоборот.

**Rollback/recovery:** оставить restore resources изолированными, не подключать
к Worker. Исправить backup/restore mechanism и повторить в новых empty buckets.

## 6. Выполнить полный restore verification

**Prerequisites:** шаги 4 и 5 завершились без stop condition; synthetic identities
не являются реальными клиентами.

**Команды:**

```powershell
npm run release:verify
```

`npm run release:verify` проверяет typecheck, полный Vitest suite, Playwright,
build, production dependency audit, документацию и artifact/secret/PII scan.
Локальные проверки полного migration set `0001`–`0015`, job inventory и
fail-closed config входят в suite, но полный release gate остаётся `blocked` при
любой неуспешной команде и до remote restore smoke.

**Ожидаемый безопасный результат:** schema/objects reconciled; synthetic register
→ cabinet → request/trial → contract → price review → message → privacy closure
работает либо конкретный path честно `feature_disabled`; cross-user доступ
отклоняется; logs redacted.

**Проверка:** sanitized evidence включает backup hash, restore environment,
commit/tool versions, safe counts, smoke result и duration для сравнения с
утверждённым RTO.

**Stop condition:** full E2E отсутствует, любой mandatory path failed, runtime
provider реально отправляет сообщение, restore duration/RPO невозможно оценить.

**Rollback/recovery:** production не менять; обновить runbook/tooling и повторить
rehearsal с новым restore target.

## 7. Code rollback без migration rollback

**Prerequisites:** incident классифицирован `code_only`; выбранная previous Worker
version совместима с текущей D1 schema/feature flags; direct rollback approval
получен.

**Команды read-only и rollback:**

```powershell
npx wrangler versions list --config <TARGET_CONFIG>
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --config <TARGET_CONFIG> --message "<SANITIZED_REASON>"
```

**Ожидаемый безопасный результат:** Worker возвращён к exact known-good version;
D1/R2 не изменены; reason не содержит PII.

**Проверка:** version ID, health, authorization, current migration compatibility,
scheduled/provider behavior и post-rollback smoke.

**Stop condition:** previous code не понимает current schema `0001`–`0015`,
known-good ID неизвестен, rollback затронет wrong Worker или проблема в data/
import.

**Rollback/recovery:** не выполнять code rollback; deploy совместимый forward fix
или перейти к restore decision. Applied migration не удалять.

## 8. Migration recovery: roll-forward или restore

**Prerequisites:** pre-migration D1/R2 backups verified; exact failed migration и
scope известны; write/external paths contained; database/security owners приняли
решение.

**Точное действие:**

- если migration не применена — исправить новую unapplied migration и повторить
  non-production rehearsal;
- если применена — создать следующую immutable forward-fix migration;
- если damage нельзя безопасно исправить — восстановить D1/R2 в isolated env и
  запросить отдельное production restore approval.

Весь set `0001`–`0015`, включая Stage-13 migrations
`0014_production_operations.sql` и `0015_worker_monitoring.sql`, проходит local
empty tests; representative populated upgrade проверяет `0013 → 0015`. Recovery
compatibility всё равно не доказана без isolated backup/restore и code-rollback
rehearsal.

**Ожидаемый безопасный результат:** migration history остаётся append-only;
schema/data compatibility доказана.

**Проверка:** empty + representative upgraded D1 tests, restore rehearsal и
critical smoke.

**Stop condition:** предложение отредактировать любую applied migration
`0001`–`0015`, direct SQL hotfix без migration/audit, backup не восстанавливается
или code/schema несовместимы. Исправление current schema начинается с новой
append-only migration `0016` или выше.

**Rollback/recovery:** оставить feature disabled; подготовить reviewed forward
migration либо санкционированный restore.

## 9. Import-version rollback

Это не D1 restore: immutable import history остаётся, current promoted pointer
возвращается на доказанную version.

**Prerequisites:** source kind/academic period/target version подтверждены по safe
status; dependency graph совместим; registration disabled; action approved.

**Точная команда (local rehearsal):**

```powershell
npm run import:rollback:local -- --source-kind <price|schedule|plusbtext|access> --academic-period <PERIOD_CODE> --to-version <VERSION_ID>
```

**Ожидаемый безопасный результат:** current pointer атомарно изменён; immutable
runs/snapshots не удалены; dependent current state согласован.

**Проверка:** `npm run import:status:local -- --limit <SAFE_LIMIT>`, 0/1/multiple
lookup и unavailable/stale fail-closed smoke.

**Stop condition:** target version неизвестна/incompatible, output содержит PII,
remote command отсутствует, rollback выделяет namespace `2` при lookup failure.

**Rollback/recovery:** production не менять. Remote import rollback path сейчас
`blocked`; нужен implemented/audited command и rehearsal.

## 10. Emergency feature disable

**Prerequisites:** affected path/flag точно определены; config/deploy approval;
known-good fail-closed value.

| Path                       | Fail-closed value                                           |
| -------------------------- | ----------------------------------------------------------- |
| Registration               | `AUTH_PUBLIC_ENABLED=false`                                 |
| Email                      | `EMAIL_PROVIDER=disabled`                                   |
| Telegram                   | `TELEGRAM_PROVIDER=disabled`                                |
| Upload                     | `DOCUMENT_UPLOAD_ENABLED=false`                             |
| Contract send              | `CONTRACT_SEND_ENABLED=false`, `CONTRACT_RENDERER=disabled` |
| Online media grant         | `MEDIA_ONLINE_GRANT_ENABLED=false`                          |
| Public statutory functions | `PUBLIC_CONTRACT_FUNCTIONS_ENABLED=false`                   |

**Точная команда:** отдельного audited emergency script нет; config change/deploy
проходит обычную approved release procedure. Не использовать ad-hoc dashboard
edit без audit.

**Ожидаемый безопасный результат:** новый affected action fail-closed; existing
evidence/data сохранены; unrelated paths не изменены.

**Проверка:** negative smoke и config/version evidence.

**Stop condition:** flag semantics неизвестна, runtime не принимает значение,
deploy target не подтверждён.

**Rollback/recovery:** оставить функцию выключенной до root-cause fix и отдельного
enable approval.

## 11. Credential compromise

**Prerequisites:** security incident owner; affected provider/Worker/secret name
из inventory; values не записываются.

**Команда установки нового secret:**

```powershell
npx wrangler secret put <SECRET_NAME> --config <TARGET_CONFIG>
```

**Ожидаемый безопасный результат:** affected feature disabled, old credential
revoked provider-side, new value передан интерактивно, sessions/tokens revoked по
threat model.

**Проверка:** safe non-production/production smoke только после approval; logs и
evidence не содержат credential.

**Stop condition:** old credential нельзя revoke, target Worker неизвестен,
secret уже попал в Git/log. Немедленная security escalation.

**Rollback/recovery:** revoke сомнительные values, продолжать с feature disabled;
не восстанавливать data, если incident не затронул integrity.

## 12. Переход к production restore

**Prerequisites:** isolated full restore `passed`; RPO/RTO/cadence approved;
root-cause contained; data owner/security/legal/operations approvals записаны;
имеется отдельное прямое поручение на exact production restore actions и
communication plan.

**Точная команда/UI:** намеренно не задана до выбора approved D1/R2 backup
mechanism и restore topology. Production target нельзя подставлять в команды из
разделов 4–5 автоматически.

**Ожидаемый безопасный результат:** согласован immutable recovery point,
maintenance/read-only behavior, exact resources, expected data-loss window,
post-restore monitoring и rollback trigger.

**Проверка:** two-person review exact target/backup hash/version и go/no-go record.

**Stop condition:** любой `blocked`, неполный R2 restore, неизвестный RPO/RTO,
отсутствие communication/approval или PII в evidence.

**Rollback/recovery:** production restore не начинать; продолжать containment и
подготовить новый rehearsal.

## Rehearsal record

Каждая репетиция добавляет в checklist/handoff только:

| Поле                             | Значение                                                   |
| -------------------------------- | ---------------------------------------------------------- |
| Date/time UTC                    | `<UTC_TIMESTAMP>`                                          |
| Environment                      | `<ISOLATED_ENVIRONMENT>`                                   |
| Commit/Worker/tool versions      | `<IMMUTABLE_VERSIONS>`                                     |
| D1 backup hash и safe counts     | `<SANITIZED_EVIDENCE>`                                     |
| R2 manifest hashes и safe counts | `<SANITIZED_EVIDENCE>`                                     |
| Restore duration                 | `<MEASURED_DURATION>`; не объявлять RTO без approved input |
| Recovery-point delta             | `<MEASURED_DELTA>`; не объявлять RPO без approved input    |
| Smoke/result                     | `passed`, `feature_disabled` или `blocked`                 |
| Operator/reviewer role           | `<ROLE>`, без personal details                             |
| Gaps/next action                 | `<ACTION>`                                                 |

До заполнения этого record успешным isolated D1/R2 restore production readiness
остаётся `blocked`.

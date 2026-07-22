# Production readiness checklist

Актуально на 2026-07-22. Это текущий release ledger, а не обещание будущей
готовности.

**Итог:** `blocked` — портал нельзя объявлять production-ready и нельзя
развёртывать в production по этому документу. Обязательные paths выключены либо
не имеют production evidence; remote actions отдельно не авторизованы.

## Release record

Перед оценкой конкретного кандидата заполнить все поля. Placeholder не является
evidence.

| Поле                                 | Значение                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| Release/commit SHA                   | `<IMMUTABLE_RELEASE>` — `blocked`                                                   |
| Checklist revision                   | 2026-07-22, stage-13 local verification + independent content cold-read             |
| Preview environment/config           | `<PREVIEW_ENVIRONMENT>` — `blocked`                                                 |
| Production environment/config        | `<PRODUCTION_ENVIRONMENT>` — `blocked`                                              |
| Portal preview/production origins    | `<APPROVED_ORIGINS>` — `blocked`                                                    |
| Migration set                        | `0001`–`0014_production_operations.sql`; local empty/populated-upgrade tests passed |
| Operator/reviewer                    | `<OWNER_ROLE>` — `blocked`                                                          |
| Release window                       | `<APPROVED_WINDOW>` — `blocked`                                                     |
| RPO/RTO/cadence                      | не утверждены — `blocked`                                                           |
| Production action approval           | отсутствует — `blocked`                                                             |
| Exact official-site URL/surface list | отсутствует — `blocked`                                                             |

## Правила статуса и evidence

- `passed`: проверка выполнена на указанной immutable version в требуемой среде;
  указаны UTC date, owner role и sanitized evidence.
- `feature_disabled`: назван конкретный fail-closed flag/path и его выключение
  проверено. Это состояние feature, а не `passed` и не release approval.
- Одобрение остаточного ограниченного scope — отдельный обязательный GO-input;
  без него общий release gate остаётся `blocked`, даже если feature корректно
  отмечена `feature_disabled`.
- `blocked`: отсутствует реализация, input, approval, rehearsal/evidence либо
  проверка failed.
- Planned или локально проверенное имя не является четвёртым статусом: без
  требуемого environment-specific evidence gate остаётся `blocked`.
- Risk acceptance не заменяет обязательную норму и не переводит `blocked` в
  `passed`.

Evidence не содержит PII, secrets, cookies, tokens, document/source bodies,
filenames, полных resource IDs или local upstream paths.

## A. Clean build, traceability и качество

| Gate                                        | Статус    | Affected path / текущее evidence                                                                                                                                   | Owner / next action                                             |
| ------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| PR-A01 Clean clone + `npm ci`               | `blocked` | Clean install passed после удаления generated Worker output; release SHA всё ещё placeholder                                                                       | Stage-13 operator: повторить на immutable SHA                   |
| PR-A02 `npm run check`                      | `blocked` | Clean-source run 2026-07-22 passed: 0 errors/warnings; immutable rerun нужен                                                                                       | Stage-13 operator: повторить на final SHA                       |
| PR-A03 `npm test`                           | `blocked` | Final working-tree full suite passed: 44 files, 241/241 tests                                                                                                      | Stage-13 operator: повторить на immutable SHA                   |
| PR-A04 `npm run build`                      | `blocked` | Cloudflare adapter build и `wrangler deploy --dry-run` на example config passed; remote build/smoke отсутствуют                                                    | Stage-13 operator: immutable build + preview smoke              |
| PR-A05 `npm audit --omit=dev`               | `blocked` | Final production audit passed: 0; full audit имеет 3 documented dev-only Wrangler/Miniflare/Sharp high advisory                                                    | Security/dependency owner: immutable lockfile + advisory review |
| PR-A06 Requirement/acceptance traceability  | `blocked` | [Матрица](../implementation/STAGE_13_TRACEABILITY.md) синхронизирована; independent reviews не нашли remaining HIGH/blocker; immutable/remote evidence отсутствует | Independent reviewer                                            |
| PR-A07 `docs:check`                         | `blocked` | Passed: 138 links/51 files + 82 executable command lines                                                                                                           | Stage-13 operator + independent docs review                     |
| PR-A08 `release:scan`                       | `blocked` | Passed: 469/469 candidates; prohibited artifact/secret/PII/control-byte findings нет; immutable rerun нужен                                                        | Security reviewer                                               |
| PR-A09 `release:verify`                     | `blocked` | Clean working-tree chain passed: check, 241 Vitest, 3 Playwright, build, audit, docs, scan; immutable SHA/remote gates отсутствуют                                 | Release operator                                                |
| PR-A10 Forbidden artifact/PII/secret scan   | `blocked` | Post-build scan passed и теперь fail-closed для raw controls в ожидаемо текстовых files                                                                            | Security reviewer                                               |
| PR-A11 Markdown links                       | `blocked` | `docs:check` и independent content cold-read passed; immutable commit/full preview rehearsal отсутствуют                                                           | Documentation reviewer                                          |
| PR-A12 Full synthetic E2E                   | `blocked` | Connected migrated-D1 register→closure flow passed 1/1; Playwright пока содержит только boundary smoke                                                             | Implement authenticated browser/preview flow                    |
| PR-A13 German accessibility/mobile/keyboard | `blocked` | Нет keyboard/focus/error association/axe/manual evidence                                                                                                           | UX/accessibility reviewer                                       |
| PR-A14 Permission/IDOR/CSRF/session matrix  | `blocked` | Sensitive-download, admin operations, closure/contract/funding guards и race tests локально passed; browser/remote matrix отсутствует                              | Security reviewer                                               |
| PR-A15 PII-safe logging/diagnostics         | `blocked` | Unit redaction tests есть; remote log sample/operations review отсутствуют                                                                                         | Security/operations reviewer                                    |

## B. Migrations, import и data integrity

| Gate                                             | Статус    | Affected path / текущее evidence                                                                                            | Owner / next action                   |
| ------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| PR-B01 Empty D1 migrations                       | `blocked` | Final full suite применил ordered `0001`–`0014` к empty D1; immutable/remote apply отсутствует                              | Stage-13 operator                     |
| PR-B02 Migration `0014`                          | `blocked` | Targeted upgrade/recovery tests и independent code review passed; remote backup/apply/restore отсутствуют                   | Stage-13 DB/security review           |
| PR-B03 Representative upgraded D1                | `blocked` | Populated `0013 → 0014` upgrade passed 1/1; файл 2/2 включает отдельный selector-rejection test; remote restore отсутствует | DB reviewer                           |
| PR-B04 Preview D1 migration                      | `blocked` | Preview config/resources/approval отсутствуют                                                                               | Operations owner                      |
| PR-B05 Pre-migration backup                      | `blocked` | Approved protected storage/backup evidence отсутствуют                                                                      | Backup/data owner                     |
| PR-B06 Current real reference import             | `blocked` | Есть synthetic/local tests; нет разрешённого source/evidence                                                                | Data owner + separate import approval |
| PR-B07 Dry-run/review/promote/rollback rehearsal | `blocked` | Local commands есть; полный current rehearsal и remote path отсутствуют                                                     | Import operator                       |
| PR-B08 Current promoted legacy snapshot          | `blocked` | Production/preview snapshot не существует/не проверен                                                                       | Import/data owner                     |
| PR-B09 Family lookup 0/1/multiple                | `blocked` | Integration tests есть; production-shaped smoke не выполнен                                                                 | Security/data reviewer                |
| PR-B10 Unavailable/stale lookup fail-closed      | `blocked` | Domain tests есть; preview/production config evidence отсутствует                                                           | Auth/import reviewer                  |
| PR-B11 Concurrency/idempotency critical paths    | `blocked` | D1 integration tests есть; production-shaped D1/release run отсутствуют                                                     | DB/reliability reviewer               |

## C. Environment, origin и bindings

| Gate                                                            | Статус    | Affected path / текущее evidence                                                                                                           | Owner / next action              |
| --------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| PR-C01 Independent portal boundary                              | `blocked` | Код/config/tests отделяют Worker/origin; exact production manifest/smoke отсутствуют                                                       | Architecture/operations reviewer |
| PR-C02 `PORTAL_PUBLIC_ORIGIN`, absolute links, host-only cookie | `blocked` | Unit tests есть; final origin и remote smoke отсутствуют                                                                                   | Security/operations owner        |
| PR-C03 Preview/production D1 isolation                          | `blocked` | Remote resources/configs не созданы и не проверены                                                                                         | Cloudflare resource owner        |
| PR-C04 Separate private EU R2                                   | `blocked` | Локально проверены distinct binding objects и namespace routing; физическая раздельность/private-EU identity удалённых buckets не доказана | Storage/security owner           |
| PR-C05 R2 no-public-access and archive isolation                | `blocked` | Unknown namespace fail-closed, cross-store и storage-intent tests passed; remote no-public-access/provider policy отсутствует              | Storage/security owner           |
| PR-C06 Browser binding/quota/budget                             | `blocked` | Binding example есть; remote conformance/monitor отсутствуют                                                                               | Operations/contract owner        |
| PR-C07 Turnstile origin/key setup                               | `blocked` | Placeholder config; approved remote keys/smoke отсутствуют                                                                                 | Auth/security owner              |
| PR-C08 Secrets inventory/install/rotation                       | `blocked` | Имена частично известны; provider secrets и rotation rehearsal неполны                                                                     | Security/provider owners         |
| PR-C09 DNS/TLS/custom portal origin                             | `blocked` | Exact origin/DNS approval/smoke отсутствуют                                                                                                | DNS/operations owner             |
| PR-C10 Release manifest external links                          | `blocked` | Final origin, outbound legal links и site surfaces не утверждены                                                                           | Product/site/legal owners        |

## D. Scheduled jobs, monitoring и operator controls

| Gate                                        | Статус    | Affected path / текущее evidence                                                                                  | Owner / next action          |
| ------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| PR-D01 Scheduled Worker entrypoint/Cron     | `blocked` | Worker/scheduler/two allowlisted triggers; targeted scheduler tests passed, preview delivery не проверена         | Operations owner             |
| PR-D02 Job-run state migration              | `blocked` | `0014` + repository; migration, dedupe/lease/failure-isolation tests passed; remote evidence отсутствует          | DB/reliability reviewer      |
| PR-D03 Exact schedule/timezone inventory    | `blocked` | `* * * * *`/`*/15 * * * *` исполняются в UTC; Telegram policy считает Europe/Berlin; preview evidence отсутствует | Operations/product owners    |
| PR-D04 Dedupe/lease/manual-run              | `blocked` | Lock/dedupe/bounded batches/manual mandatory-admin audit локально passed; non-production rehearsal отсутствует    | Reliability reviewer         |
| PR-D05 Manual operations page/RBAC/audit    | `blocked` | Admin-only load, CSRF, allowlist, confirmation, idempotency и no-GET/direct bypass passed 7/7                     | Security/UX reviewer         |
| PR-D06 Missed Cron/stale lock alert         | `blocked` | Signal/threshold/owner отсутствуют                                                                                | Operations owner             |
| PR-D07 Dead outbox alert/manual recovery    | `blocked` | schedule/manual UI есть; real provider и alert отсутствуют                                                        | Messaging/operations owner   |
| PR-D08 Quarantine backlog/cleanup alert     | `blocked` | R2 split/Cron/manual cleanup и local retry/intent tests есть; remote R2/backlog alert отсутствуют                 | Storage/operations owner     |
| PR-D09 Browser/provider exhaustion alert    | `blocked` | Remote metrics/threshold/failure procedure не проверены                                                           | Operations/provider owner    |
| PR-D10 Failed import/promotion alert        | `blocked` | Admin review есть; monitoring owner/signal отсутствуют                                                            | Import/operations owner      |
| PR-D11 Backup failure alert/manual check    | `blocked` | Backup mechanism/cadence отсутствуют                                                                              | Backup/operations owner      |
| PR-D12 Incident/credential compromise drill | `blocked` | Runbook создан; rehearsal и exact emergency automation отсутствуют                                                | Security/operations reviewer |

## E. Admin bootstrap и доступы

| Gate                                      | Статус    | Affected path / текущее evidence                                                                                                                                | Owner / next action                         |
| ----------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| PR-E01 First-admin bootstrap              | `blocked` | One-shot repository/CLI/npm command; exact config/APP_ENV/UUID confirmation, selector-free child config, success/result, invalid/concurrent/replay tests passed | Security owner: remote clean-room rehearsal |
| PR-E02 Audit + immediate bootstrap revoke | `blocked` | Atomic audit/assertion, consume, session revoke and replay rejection locally passed; remote evidence absent                                                     | Security reviewer                           |
| PR-E03 Admin recovery/role/session revoke | `blocked` | Upgrade with existing admin auto-seals bootstrap; normal role/session actions exist; zero-admin recovery drill absent                                           | Security/operations owner                   |
| PR-E04 Least-privilege access review      | `blocked` | Cloudflare/provider/admin roster не предоставлен                                                                                                                | Authorized system owners                    |
| PR-E05 Clean-room bootstrap/RBAC smoke    | `blocked` | Synthetic remote environment отсутствует                                                                                                                        | Independent reviewer                        |

## F. Providers, Browser, contracts и uploads

| Gate                                          | Статус             | Affected path / flag                                                               | Owner / next action                                                          |
| --------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| PR-F01 Public registration/email verification | `feature_disabled` | `AUTH_PUBLIC_ENABLED=false`; real email adapter отсутствует                        | Provider/auth owner: adapter+DPA+smoke или separate limited-release approval |
| PR-F02 Email provider delivery                | `feature_disabled` | `EMAIL_PROVIDER=disabled`; only fake/disabled adapter                              | Provider owner                                                               |
| PR-F03 Telegram delivery                      | `feature_disabled` | `TELEGRAM_PROVIDER=disabled`; real adapter/credential smoke отсутствует            | Provider/privacy owner                                                       |
| PR-F04 Production document upload             | `feature_disabled` | `DOCUMENT_UPLOAD_ENABLED=false`; runtime rejects production true                   | Storage/security/legal owner                                                 |
| PR-F05 Manual AV training/test passage        | `blocked`          | Flow реализован в UI, но R2 split/training/controlled test отсутствуют             | Admin/security owner                                                         |
| PR-F06 Contract rendering/send                | `feature_disabled` | `CONTRACT_RENDERER=disabled`, `CONTRACT_SEND_ENABLED=false`                        | Contract/legal/Browser owner                                                 |
| PR-F07 Remote Browser conformance             | `blocked`          | Glyph/font/long-name/pagination/quota evidence отсутствуют                         | Contract/operations owner                                                    |
| PR-F08 Public statutory contract functions    | `feature_disabled` | `PUBLIC_CONTRACT_FUNCTIONS_ENABLED=false`; implementation/legal profile incomplete | Legal/contract owner                                                         |
| PR-F09 Online media grant                     | `feature_disabled` | `MEDIA_ONLINE_GRANT_ENABLED=false`                                                 | Legal/privacy owner: equal-ease withdrawal assessment or keep off            |
| PR-F10 Automatic retained legal-archive purge | `feature_disabled` | policy `disabled_by_policy`; worker отсутствует                                    | Product/legal: only new written rule + migration                             |
| PR-F11 Ordinary archive read/search           | `feature_disabled` | route/search intentionally absent                                                  | Product/legal/security: purpose/RBAC/audit decision                          |

Все `feature_disabled` paths должны пройти отдельный negative smoke. Команда
`release:verify` включает fail-closed config tests; environment-specific gates
остаются `blocked`, поэтому общий release не готов.

## G. Privacy, legal и provider approvals

| Gate                                        | Статус    | Affected path / текущее evidence                                             | Owner / next action             |
| ------------------------------------------- | --------- | ---------------------------------------------------------------------------- | ------------------------------- |
| PR-G01 Privacy notice/version               | `blocked` | Approved production version/input отсутствует                                | Authorized privacy/legal owner  |
| PR-G02 DPA/AVV/subprocessors                | `blocked` | Provider-specific approvals не предоставлены                                 | Authorized Verein/privacy owner |
| PR-G03 Retention classes/basis/review dates | `blocked` | Runtime controls есть; production legal review отсутствует                   | Legal/privacy owner             |
| PR-G04 Contract templates/legal profiles    | `blocked` | Production version approvals/statutory applicability evidence отсутствуют    | Legal/contract owner            |
| PR-G05 Media text/contact/withdrawal path   | `blocked` | Online grant выключен; approved production text/contact evidence отсутствует | Legal/privacy owner             |
| PR-G06 Upload/scanner processing approvals  | `blocked` | Manual local AV policy есть; production training/DPA inputs отсутствуют      | Security/privacy owner          |
| PR-G07 Email/Telegram provider approval     | `blocked` | Real adapters/providers не утверждены                                        | Provider/privacy owner          |

Агент не может закрыть эти gates техническим тестом или risk acceptance.

## H. Backup, restore и rollback

| Gate                                        | Статус    | Affected path / текущее evidence                                                                   | Owner / next action  |
| ------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- | -------------------- |
| PR-H01 Approved RPO                         | `blocked` | Input отсутствует                                                                                  | Data/business owner  |
| PR-H02 Approved RTO                         | `blocked` | Input отсутствует                                                                                  | Data/business owner  |
| PR-H03 Backup cadence/retention             | `blocked` | Inputs отсутствуют                                                                                 | Data/security owner  |
| PR-H04 D1 backup + integrity check          | `blocked` | Runbook command описан; protected storage/evidence отсутствуют                                     | Backup owner         |
| PR-H05 R2 archive/quarantine backup         | `blocked` | Mechanism/script отсутствует                                                                       | Storage/backup owner |
| PR-H06 Full isolated D1 restore             | `blocked` | Restore environment/rehearsal отсутствуют                                                          | Backup/DB owner      |
| PR-H07 Full isolated R2 restore             | `blocked` | Mechanism/resources/rehearsal отсутствуют                                                          | Storage/backup owner |
| PR-H08 Code rollback compatibility          | `blocked` | Wrangler procedure описана; migration `0014` compatibility drill отсутствует                       | Release/DB owner     |
| PR-H09 Migration roll-forward/restore drill | `blocked` | Representative local `0013 → 0014` upgrade passed; isolated restore/roll-forward drill отсутствует | DB/release owner     |
| PR-H10 Import rollback drill                | `blocked` | Local mechanism есть; current/remote rehearsal отсутствует                                         | Import/data owner    |

## I. Operator docs, release и внешний сайт

| Gate                                              | Статус    | Affected path / текущее evidence                                                                                              | Owner / next action            |
| ------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| PR-I01 Deployment runbook                         | `blocked` | [Deployment](PRODUCTION_DEPLOYMENT.md) content cold-read 2026-07-22 passed; immutable packaging/preview execution отсутствуют | Independent operator           |
| PR-I02 Operations runbook                         | `blocked` | [Operations](OPERATIONS_RUNBOOK.md) content cold-read passed; remote monitoring/alert rehearsal отсутствует                   | Independent operator           |
| PR-I03 Disaster-recovery runbook                  | `blocked` | [DR](DISASTER_RECOVERY.md) content cold-read passed; restore inputs/resources/rehearsal отсутствуют                           | Independent operator           |
| PR-I04 Checklist completeness                     | `blocked` | Local ledger/owners/next actions заполнены; immutable release identity и external owners/evidence отсутствуют                 | Release owner                  |
| PR-I05 Clean-room walkthrough всех runbooks       | `blocked` | Content walkthrough passed; full non-production provisioning/bootstrap/provider/restore execution не выполнено                | Independent operator           |
| PR-I06 Preview deploy/post-deploy smoke           | `blocked` | Нет preview resources/approval                                                                                                | Operations owner               |
| PR-I07 Production deploy approval                 | `blocked` | Отдельное прямое поручение отсутствует                                                                                        | Authorized release owner       |
| PR-I08 Production migration/import/send approvals | `blocked` | Отдельные разрешения отсутствуют                                                                                              | Authorized owners по действиям |
| PR-I09 Production post-deploy smoke               | `blocked` | Deploy не выполнялся                                                                                                          | Release/security owner         |
| PR-I10 Official-site exact URL/surfaces           | `blocked` | Release input отсутствует                                                                                                     | Site/product owner             |
| PR-I11 Separate site-link go-live approval        | `blocked` | Прямое поручение отсутствует; CMS вне scope                                                                                   | Authorized site owner          |
| PR-I12 Site-link rollback                         | `blocked` | Exact CMS fields/old values/procedure неизвестны                                                                              | Site operator                  |

## Отдельно разрешаемые действия

Даже после подготовки документации каждое действие требует собственного прямого
поручения и точных targets:

1. создание/изменение Cloudflare remote resources, DNS и TLS;
2. preview deploy/migration/provider smoke;
3. production D1 migration;
4. production Worker deploy или rollback;
5. реальный PII import/promote/rollback;
6. включение email/Telegram и реальная внешняя отправка;
7. включение uploads, contract send, media/statutory paths;
8. production backup/restore;
9. изменение любой CMS/ссылки/страницы официального сайта.

Разрешение одного пункта не разрешает остальные.

## Evidence template

Для перевода gate заполнить:

```text
Gate:
Status: passed | feature_disabled | blocked
Environment:
Immutable commit/config/tool version:
UTC date:
Owner/reviewer role:
Command or exact UI field:
Sanitized expected result:
Sanitized actual result/evidence reference:
Affected path/flag:
Stop condition checked:
Rollback/recovery checked:
Next action:
```

## Go/no-go

- Full MVP `GO` допустим только если все mandatory paths имеют `passed`, в ledger
  нет `blocked`, restore/rollback доказаны и есть отдельное deploy approval.
- Limited release с `feature_disabled` требует отдельного явного owner approval,
  точного остаточного scope и проверенного fail-closed behavior. Он не называется
  полным MVP.
- Текущий результат: **NO-GO / `blocked`**.

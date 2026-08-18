# Развёртывание портала регистрации

Ревизия: 2026-08-14.

Статус документа: `blocked`; текущий production verdict — **NO-GO**. Локальная
реализация Stage 13 не заменяет clean-room rehearsal и закрытие release gates из
[production-readiness checklist](PRODUCTION_READINESS_CHECKLIST.md).

Эта инструкция описывает самостоятельное Cloudflare-приложение портала. Оно
имеет собственные Worker, origin, D1, private R2, secrets, sessions и release
lifecycle. Она не даёт доступа к CMS, серверу, базе или deployment официального
сайта `kolibri-dresden.de`. Изменение ссылок на официальном сайте — отдельная
операция после успешного post-deploy health check и отдельного прямого
разрешения.

Production deploy, remote migration, реальный импорт клиентов, внешняя отправка,
DNS и изменения официального сайта этой инструкцией не авторизуются.

## Как пользоваться инструкцией

Допустимые статусы шага:

- `passed` — шаг выполнен в указанной среде, а sanitized evidence записано в
  checklist;
- `feature_disabled` — путь проверяемо fail-closed и не входит в разрешённый
  ограниченный release;
- `blocked` — не хватает реализации, input, доступа, approval или проверки.

Placeholder в угловых скобках, например `<PREVIEW_CONFIG>`, должен поступить из
утверждённого release manifest. Нельзя подставлять догадку. Команды выполняются
из корня clean clone. Значения secrets, PII, полные source rows, document bodies
и локальные upstream paths не копируются в терминальный transcript или
checklist.

## Текущее состояние реализации

| Объект                              | Фактическое состояние                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Gate                                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local config                        | `wrangler.local.toml`: `DB`, отдельные `R2_ARCHIVE`/`R2_QUARANTINE`; local config/storage/contract tests проходят                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | local evidence `passed`; environment gates отдельно                                                                                                                                                                                                  |
| Example production config           | `wrangler.example.toml`: отдельные archive/quarantine bindings с `jurisdiction = "eu"`, без real IDs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | production resources/rehearsal `blocked`                                                                                                                                                                                                             |
| Preview Worker/D1 (2026-08-12)      | `reg-allgemein-preview`: immutable `200268f` развёрнут как version `sha256:f4cd52e14dbd`; D1 migrations `0001`–`0015`, pending 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | preview runtime/migrations `passed`; production/custom origin `blocked`                                                                                                                                                                              |
| Раздельные R2                       | runtime guards и два отдельных private EU preview bucket проверены                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | preview split `passed`; production/restore `blocked`                                                                                                                                                                                                 |
| Последняя migration                 | `0015_worker_monitoring.sql`; clean/populated `0013` → `0015` tests и preview apply `0001`–`0015`, pending 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | apply evidence есть; protected restore `blocked`                                                                                                                                                                                                     |
| Scheduled jobs/Cron                 | два UTC trigger доставили все девять jobs; UptimeRobot 5-minute `HEAD` aggregate monitor доставил DOWN→UP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | automatic/aggregate `passed`; manual/failure/job-specific alerts `blocked`                                                                                                                                                                           |
| Manual operations page              | `/admin/operations`: RBAC, CSRF, allowlist, confirmation, idempotency, history и audit покрыты local tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | authenticated remote manual/failure rehearsal `blocked`                                                                                                                                                                                              |
| First-admin CLI                     | `npm run admin:bootstrap` и local unit/integration tests реализованы; exact target guard и one-shot seal проверены                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | remote exercise и post-consume recovery `blocked`                                                                                                                                                                                                    |
| Release helpers                     | immutable `200268f`: clean `npm ci`, full и production-only audit по 0 advisories, `release:verify` passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | local gate `passed`; environment gates отдельно                                                                                                                                                                                                      |
| Stored Worker logs (2026-08-12)     | bounded export version `62b3cac4…`: 60/60 outcomes `ok`; exact 404/health probes корректны, `UNEXPECTED_SERVER_ERROR` отсутствует                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | preview observability `passed`; production evidence `blocked`                                                                                                                                                                                        |
| Email/Telegram adapters             | Resend adapter/domain/scoped key/Worker secret подготовлены, но provider disabled. Deployed preview и baseline `c5712d0` допускают для Telegram только disabled/fake; resulting `bot_api` candidate ещё не верифицирован и не развернут                                                                                                                                                                                                                                                                                                                                                                             | оба delivery path `feature_disabled`; Telegram PR-F12–PR-F15 `blocked`                                                                                                                                                                               |
| Current legacy import               | Access read-only profile: 1703 rows, 21/21 required fields, `access-tblkartei:v1` compatible. PlusBText is also v1-compatible; the earlier mismatch was a parser sanitizer defect. `IMPORT-07` owner rules, including four package slots and unconditional AO/AT exclusion, reduce obsolete 1429/751 warning/review counts to 160 issue occurrences/53 enrollment reviews. Current `IMPORT-08` worktree uses migrations `0019`–`0021`, durable reconciliation/admin queue, exact candidate/current registration gates and atomic live typed evidence; full local chain passes, but exact `f7e75f9` review was NO-GO and the remediation is uncommitted/unreviewed | PR-B06/B07/B12–B17 remain `blocked`; new immutable exact-SHA review, one upstream group correction, six duplicate buckets/remaining cases, independent admin review and all remote evidence remain open; no remote command or PII import performed |
| Production uploads                  | runtime запрещает включение                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `feature_disabled`                                                                                                                                                                                                                                   |
| Production contract send            | runtime запрещает включение                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `feature_disabled`                                                                                                                                                                                                                                   |
| Online media grant                  | fail-closed flag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `feature_disabled`                                                                                                                                                                                                                                   |
| Public statutory contract functions | fail-closed flag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `feature_disabled`                                                                                                                                                                                                                                   |

Preview evidence не авторизует новую remote mutation или production deploy.
Public auth/real-token, remote authenticated browser, provider delivery, Browser
Run, manual dedupe/failure, job-specific alerts, bootstrap, production resources/
custom origin, restore и legal/privacy approval gates остаются незакрытыми,
поэтому текущий production verdict — **NO-GO**.

## Release inputs и доступы

До первого remote шага оператор получает и записывает в закрытый release record,
но не в Git:

| Input                                                   | Требование                                                                                                                                       | При отсутствии                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Immutable commit SHA и release tag                      | утверждённый build candidate                                                                                                                     | `blocked`                                                       |
| Cloudflare account/roles                                | least-privilege доступ к Workers, D1, R2, Browser, DNS и Turnstile                                                                               | `blocked`                                                       |
| `<PREVIEW_CONFIG>`, `<PRODUCTION_CONFIG>`               | materialized ignored config paths с target resource IDs, без secrets                                                                             | `blocked`                                                       |
| D1 names/IDs по средам                                  | local, preview и production не совпадают                                                                                                         | `blocked`                                                       |
| R2 bucket names                                         | отдельные preview/production archive и quarantine, EU jurisdiction                                                                               | `blocked`                                                       |
| `<PORTAL_PREVIEW_ORIGIN>`, `<PORTAL_PRODUCTION_ORIGIN>` | HTTPS origins, не origin официального сайта                                                                                                      | `blocked`                                                       |
| Provider decisions                                      | approved email/Telegram providers, DPA/AVV, exact Telegram bot/chat ownership and credentials owner                                              | `blocked` либо путь `feature_disabled`                          |
| Legacy import release record                            | academic period, private Access/PlusBText hashes, approved source-contract versions, exact target config/D1 UUID, plan digest and recovery point | `blocked`; never place source path/rows/PII in tracked evidence |
| RPO/RTO, backup cadence/retention                       | утверждённые owner/security inputs                                                                                                               | `blocked`                                                       |
| Legal/privacy/template approvals                        | конкретные version IDs и evidence                                                                                                                | `blocked` либо соответствующий путь `feature_disabled`          |
| Production action approval                              | отдельное прямое поручение на deploy/migration/import/send                                                                                       | `blocked`                                                       |
| Site-link manifest                                      | точный portal URL и полный список внешних surfaces                                                                                               | `blocked`                                                       |

## 1. Подготовить clean clone

**Prerequisites:** разрешена локальная работа; известен immutable commit SHA;
remote credentials не нужны.

**Команды:**

```powershell
git status --short
git rev-parse HEAD
npm ci
npx wrangler --version
```

**Ожидаемый безопасный результат:** до `npm ci` status пуст; SHA совпадает с
release candidate; install использует lockfile; Wrangler version записана без
environment values.

**Проверка:** повторить `git status --short`; допустимы только заранее объяснённые
локальные generated/ignored files. Не добавлять их в Git.

**Stop condition:** dirty tracked worktree, несовпадающий SHA, изменение
`package-lock.json`, install/audit script с неожиданным сетевым или secret
доступом.

**Rollback/recovery:** прекратить работу; удалить только созданный специально
для rehearsal clone либо создать новый clean clone. Не применять `git reset
--hard` к пользовательской рабочей копии.

## 2. Выполнить локальный release preflight

**Prerequisites:** шаг 1 завершён; используются только синтетические fixtures.

**Команда полного gate:**

```powershell
npm run release:verify
```

Она последовательно выполняет:

```powershell
npm run check
npm test
npm run test:e2e
npm run build
npm audit --omit=dev
npm run docs:check
npm run release:scan
```

Все команды реализованы, включая Playwright E2E внутри `release:verify`.
Build-only Cloudflare adapter находится в `devDependencies`; текущий
`npm audit --omit=dev` показывает `0 advisories`. Immutable baseline
`b1a1505` имел 7 dev-only findings; successor `63995f8` обновил
SvelteKit/PostCSS/Wrangler/Miniflare, а immutable `200268f` прошёл clean
`npm ci`, полный и production-only audit с 0 advisories и `release:verify`, как описано в
[DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md). Незакрытые environment gates всё
равно удерживают общий gate в `blocked`.

**Ожидаемый безопасный результат:** все существующие команды завершаются с code
0; связный synthetic lifecycle проходит на migrated D1, а local Playwright
evidence остаётся отдельным результатом. Оно не заменяет remote authenticated/
public-auth, provider и Browser Run evidence; соответствующие release gates
остаются `blocked|feature_disabled`. Отчёты не содержат PII/secrets; build не
содержит source Office/Access, generated imports, DB snapshots или privacy
exports.

**Проверка:** записать только command, version/commit, дату, exit code и
агрегированный count. Не вставлять полный dependency tree или лог с данными.

**Stop condition:** любой failed test/check/build, high-severity unresolved
runtime advisory, secret/PII/generated artifact в Git/build/log либо
несуществующая команда.

**Rollback/recovery:** remote state не изменён. Исправить причину отдельным
изменением, повторить весь clean preflight; не помечать частичный прогон
`passed`.

## 3. Подготовить матрицу независимых сред

**Prerequisites:** утверждены имена ресурсов и EU jurisdiction; operator имеет
least-privilege Cloudflare role; preview и production account/resource inputs
не смешаны.

**Точная команда/поле UI:** tracked source — только `wrangler.example.toml` с
placeholder values. Оператор создаёт из него два materialized файла
`wrangler.preview.toml` (`<PREVIEW_CONFIG>`) и `wrangler.production.toml`
(`<PRODUCTION_CONFIG>`). Оба пути явно игнорируются Git; их нельзя добавлять в
commit, artifact или evidence. После provisioning в них записываются exact
target resource IDs/names, но secrets устанавливаются только через
`wrangler secret put`.

В этих двух файлах должны быть отдельные `name`, `PORTAL_PUBLIC_ORIGIN`,
`[[d1_databases]]`, `[[r2_buckets]]`, `[browser]`, vars и triggers. До создания
ресурса соответствующий ID остаётся placeholder; сразу после `d1 create` snippet
переносится только в нужный ignored config. Ни один remote ID/bucket/secret не
копируется в tracked example.

| Resource        | Local                 | Preview                   | Production                   |
| --------------- | --------------------- | ------------------------- | ---------------------------- |
| Worker          | local dev             | отдельный preview Worker  | отдельный production Worker  |
| D1 `DB`         | local persisted state | отдельная preview D1      | отдельная production D1      |
| `R2_ARCHIVE`    | local test store      | private preview EU bucket | private production EU bucket |
| `R2_QUARANTINE` | local test store      | private preview EU bucket | private production EU bucket |
| Secrets         | `.dev.vars`, ignored  | preview secrets           | production secrets           |
| Origin/cookies  | localhost             | preview HTTPS host-only   | production HTTPS host-only   |

`R2_ARCHIVE`/`R2_QUARANTINE` закреплены в local/example config и runtime contract.
Локальные config, request-contract, privacy и storage tests проверяют разделение;
два разных private preview bucket с EU jurisdiction и выключенными public/
`r2.dev` endpoints подтверждены. Production buckets и isolated restore ещё не
созданы/не проверены. Один provider bucket под двумя bindings этому gate не
соответствует.

**Ожидаемый безопасный результат:** каждая строка manifest указывает уникальный
resource; buckets не имеют public access/r2.dev; archive и quarantine не являются
одним bucket с разными префиксами.

**Проверка:** второй оператор сравнивает sanitized resource suffix/fingerprint,
не записывая полный ID. Проверяется EU jurisdiction и отсутствие reuse.

**Stop condition:** materialized config не находится по явно утверждённому
ignored path, `git check-ignore <TARGET_CONFIG>` не подтверждает ignore,
неизвестная jurisdiction, одинаковый remote resource в двух средах, public
bucket, production credentials в preview или один bucket для archive/quarantine.

**Rollback/recovery:** ничего не загружать. Ошибочно созданный пустой ресурс
пометить для удаления по отдельной provider-процедуре; не удалять ресурс с
объектами без инвентаризации и approval.

## 4. Создать remote ресурсы

Этот раздел нельзя исполнять до отдельного разрешения на инфраструктурные
изменения. Команды приведены как rehearsal template.

### 4.1 D1

**Prerequisites:** утверждены `<D1_NAME>` и target environment; нет ресурса с тем
же именем; получено remote provisioning approval.

**Команда:**

```powershell
npx wrangler d1 create <D1_NAME> --jurisdiction eu --config <TARGET_CONFIG>
```

**Ожидаемый безопасный результат:** создана пустая D1; CLI возвращает binding
configuration. Полный database ID хранится только в разрешённой environment
config/secret store, не в operator evidence.

**Проверка:** target account/environment дважды сверены; production ID не
использован в preview.

**Stop condition:** CLI предлагает другой account, config не существует, имя не
утверждено или command output собираются коммитить.

**Rollback/recovery:** не применять migrations; эскалировать владельцу
Cloudflare. Удаление remote D1 — отдельное destructive действие.

### 4.2 Private EU R2 archive/quarantine

**Prerequisites:** утверждены два разных bucket name, remote provisioning
approval и provider-confirmed EU jurisdiction semantics.

**Команды:**

```powershell
npx wrangler r2 bucket create <ARCHIVE_BUCKET_NAME> --jurisdiction eu --config <TARGET_CONFIG>
npx wrangler r2 bucket create <QUARANTINE_BUCKET_NAME> --jurisdiction eu --config <TARGET_CONFIG>
```

Bindings имеют точные имена `R2_ARCHIVE` и `R2_QUARANTINE`; их разделение
проверено локально. Автоматический `--update-config` не используется, чтобы CLI
не изменил не тот config. Для preview разные private EU resources уже сверены;
production resource IDs и EU/private evidence должны быть подтверждены отдельно
до production provisioning gate.

**Ожидаемый безопасный результат:** два пустых private bucket в EU jurisdiction,
без public/r2.dev access.

**Проверка:** provider UI показывает разные resources, EU jurisdiction и
отсутствие public endpoint; sanitized evidence содержит только environment и
результат проверки.

**Stop condition:** `--jurisdiction eu` не поддержан текущей account policy,
bucket уже существует/содержит objects, включён public access или bindings ещё
не реализованы.

**Rollback/recovery:** не загружать data и не подменять EU bucket глобальным.
Удаление ошибочно созданного пустого bucket требует отдельной проверки target и
approval.

### 4.3 Browser, Turnstile, providers, TLS/origin

**Prerequisites:** approved provider/account/DPA inputs и exact origins.

**Точная команда/поле UI:** config fields `[browser].binding = "BROWSER"`,
`TURNSTILE_SITE_KEY`, `TURNSTILE_HOSTNAMES`, secret `TURNSTILE_SECRET_KEY`,
`PORTAL_PUBLIC_ORIGIN`,
`OFFICIAL_PRIVACY_URL`, `OFFICIAL_IMPRINT_URL`, `OFFICIAL_CONTACT_URL`,
`OFFICIAL_LINKS_VERSION`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_REPLY_TO`,
secret `RESEND_API_KEY`, `TELEGRAM_PROVIDER`. После реализации PR-F12 Telegram
inventory также обязан включать environment-specific secret
`TELEGRAM_BOT_TOKEN` и exact approved bureau destination по реализованному
config contract. Provider credential names нельзя
придумывать; `OFFICIAL_*` values требуют approved versioned snapshot.

**Ожидаемый безопасный результат:** widget разрешает только утверждённые hostnames;
сервер принимает только `success=true`, action `registration` и exact hostname
своего deployment. Даже если preview widget также используется для локальной
разработки, preview backend allowlist содержит только preview hostname, а
production backend и production widget не разрешают local hostnames. Browser
binding принадлежит portal Worker; TLS действителен; официальный сайт не является
application origin.

**Проверка:** production-shaped config validation и remote smoke без PII.

**Stop condition:** provider/credential contract не утверждён, origin неизвестен,
key допускает лишние origins, Telegram destination/bot owner неизвестен, real
send не разрешён, adapter отсутствует либо ambiguous delivery может попасть в
blind automatic retry.

**Rollback/recovery:** оставить provider `disabled` и public auth false; revoke
ошибочно выданный credential через provider-owned procedure.

### 4.4 Resend: домен, identity и least-privilege key

**Prerequisites:** владелец вошёл в тот же Resend team/account, где уже настроен
`kolibri-dresden.de`; публичный DNS audit подтверждает root MX IONOS, один root
SPF, Resend DKIM и служебные `send` MX/SPF. Реальная отправка ещё не разрешена.

**Поля UI:** `Resend → Domains → kolibri-dresden.de` должен иметь status
`Verified` и region `eu-west-1`. Повторно добавлять домен, менять root MX или
создавать второй TXT SPF на `@` нельзя. Затем `Resend → API Keys → Create API
Key`: отдельное имя для приложения/environment, permission `Sending access`,
domain `kolibri-dresden.de`. Не использовать Full access и ключ другого проекта.

Token показывается один раз. Его нужно сразу сохранить в Windows DPAPI store для
текущего пользователя с user-only ACL, очистить clipboard и не помещать в
`.env`, Wrangler config, командную строку, ticket или transcript. Для Worker
secret используется только имя `RESEND_API_KEY` и интерактивный stdin.

Vars имеют exact значения:

```text
EMAIL_PROVIDER=disabled
EMAIL_FROM=Kinder- und Elternzentrum Kolibri e.V. <registration@kolibri-dresden.de>
EMAIL_REPLY_TO=registration@kolibri-dresden.de
```

`EMAIL_PROVIDER` меняется на `resend` только в отдельно утверждённом preview
enablement. Первый smoke использует один контролируемый синтетический recipient,
проверяет доставку и Reply-To, но не включает клиента/ребёнка/договор или другой
PII. Production key выпускается отдельно после preview gate; preview key нельзя
копировать в production.

Историческое preview evidence 2026-08-11 подтверждает `Verified` domain в
`eu-west-1`, отдельный domain-scoped `Sending access` key и установленное имя
Worker secret `RESEND_API_KEY` без раскрытия value. `EMAIL_PROVIDER=disabled`
сохранён; delivery/reply smoke и любые реальные отправки не выполнялись. Поэтому
подготовка adapter/domain/key/secret не переводит provider gate в `passed`.

**Ожидаемый безопасный результат:** IONOS продолжает принимать входящую почту;
adapter отправляет с утверждённой Verein identity; API key может только отправлять
с разрешённого домена; outbox dedupe и provider idempotency не создают повтор в
обычном retry window.

**Проверка:** status/region в Resend, sanitized key name/permission/domain,
runtime config tests, один отдельно разрешённый preview delivery/reply smoke и
provider request ID без recipient/body в evidence.

**Stop condition:** domain не `Verified`, region/account неизвестен, DNS требует
удалить IONOS MX/заменить root SPF, key имеет Full access/другой domain, secret
попал в plaintext/history, либо нет отдельного разрешения на real send.

**Rollback/recovery:** оставить `EMAIL_PROVIDER=disabled`; revoke environment key
в Resend при раскрытии/ошибочном scope и выпустить новый. DNS и IONOS mailbox не
удалять. Remote Worker secret rotation/deploy выполняются отдельной change
procedure.

### 4.5 Telegram Bot API: односторонний bureau channel

Этот раздел является обязательным gate, а не утверждением готовой реализации.
На deployed preview и baseline `c5712d0` действует
`TELEGRAM_PROVIDER=disabled`; local candidate реализует selector `bot_api`, adapter,
durable `delivery_unknown` и operator resolution actions, но ещё не прошёл
immutable candidate/target-pinned preview evidence sequence, поэтому PR-F12–PR-F15 имеют
`blocked`.

**Prerequisites:** provider/privacy approval, владелец bot account и exact bureau
chat подтверждены out-of-band; bot не используется для parent identity, inbound
commands/replies, документов или свободного клиентского текста; отдельно
разрешена ровно одна synthetic preview send.

**Config/secrets contract локального кандидата:**

```text
TELEGRAM_PROVIDER=disabled
TELEGRAM_BOT_TOKEN=<WRANGLER_SECRET_NAME_ONLY>
TELEGRAM_CHAT_ID=<APPROVED_EXACT_DESTINATION>
TELEGRAM_CHAT_TYPE=<group|supergroup|channel>
TELEGRAM_BOT_API_TIMEOUT_MS=<1000..30000_AND_BELOW_OUTBOX_LEASE_MS>
TELEGRAM_ACTIVATION_AT=<REVIEWED_CANONICAL_UTC_CUTOFF>
TELEGRAM_MAX_ATTEMPTS=<REVIEWED_POSITIVE_INTEGER>
TELEGRAM_BUSINESS_TIMEZONE=Europe/Berlin
TELEGRAM_BUSINESS_HOURS=Mo-Fr 09:00-17:00
```

`TELEGRAM_PROVIDER` меняется на `bot_api` только отдельным reviewed config change
после local conformance. Token передаётся только интерактивно через Wrangler
secret input, не хранится в vars/CLI/history/evidence. `TELEGRAM_CHAT_ID` —
защищённая signed-decimal string, не `@username`; type согласуется с утверждённым
destination. Timeout обязан быть меньше outbox lease. Exact chat destination не
выводится в публичный transcript; checklist хранит только approved role и
sanitized fingerprint. `migrate_to_chat_id` считается permanent config drift:
adapter не перенаправляет сообщение молча.
`TELEGRAM_ACTIVATION_AT` выбирается после отдельного просмотра historical
pending/retry backlog: строки старше cutoff не отправляются при включении, а
оставляются для audited cancel/review. Activation cutoff, provider selector,
token/chat и deploy относятся к одному exact reviewed change; произвольный
старый cutoff является stop condition.

**Обязательная delivery policy:** successful Bot API response сохраняет только
sanitized provider message ID. Только синтаксически валидный `ok=false`
доказывает provider rejection/non-delivery: `429` и explicit `408|425|5xx`
retryable, validation/auth/chat errors permanent. Timeout/transport exception
после `sendMessage`, unreadable/oversized/malformed response, non-`ok=true`
ambiguous envelope либо invalid/mismatched success, при котором доставка могла
состояться, переводит row в terminal
`delivery_unknown` с code `TELEGRAM_DELIVERY_UNKNOWN`. Первый unknown/retry/dead
останавливает текущий drain; unresolved unknown или terminal dead блокирует
следующие sends. `429` ставит durable cooldown всему bureau destination до
вычисленного `nextAttemptAt`, используя valid `retry_after` как нижнюю границу,
но сохраняя cooldown и при его отсутствии/невалидности. Newly queued row его не
обходит. Automatic retry и stale reclaim unknown-строки запрещены.
Operator после проверки provider/chat выполняет
только аудируемое `confirm_sent`, `retry_after_review` при доказанном отсутствии
сообщения либо `cancel`.

**Ожидаемый безопасный результат:** Telegram получает только category, public/
internal reference, event time и authenticated admin link; client/child name,
email, phone, address, document/contract body, free text, token и diagnostics
отсутствуют. Domain action остаётся сохранённым независимо от provider outcome.

**Проверка:** local fake/protocol tests отдельно покрывают success, conclusive
retry/dead и ambiguous state. Затем отдельно разрешённый preview smoke создаёт
одну synthetic row и допускает ровно один реальный `sendMessage`: фактический
результат фиксируется как `sent` с provider message ID/reference/no duplicate
либо как `delivery_unknown` без retry. Local fake ambiguity не является external
smoke evidence. Если row подготовлен, но provider dispatch не начинался,
отдельная D1-only `telegram:smoke:abort` из operations runbook отменяет только
exact zero-attempt cohort с append-only evidence; после любого attempt она
fail-closed. Если crash произошёл после `dispatch_started`, exact-target/cohort
`telegram:smoke:reconcile` до lease expiry fail-closed, а после expiry без
Telegram secrets/provider send/retry переводит attempt/outbox в
`delivery_unknown` для обычного operator resolution. Evidence содержит только
safe codes/counts/timestamps.

**Stop condition:** adapter/unknown state/operator action отсутствуют; token/chat
попал в output; destination не подтверждён; payload содержит PII/free text;
provider response body логируется; требуется blind retry; нет отдельного send
approval.

**Rollback/recovery:** сохранить `TELEGRAM_PROVIDER=disabled`; при compromise
revoke token provider-side и rotate Worker secret отдельной change procedure;
unknown rows не переводить в retry без operator review. Remote secret/config/send
являются разными отдельно разрешаемыми mutations.

## 5. Установить vars, secrets и feature flags

**Prerequisites:** target config и Worker name проверены; secret передаётся через
интерактивный stdin, а не аргумент/историю shell.

**Команда для каждого реализованного secret name:**

```powershell
npx wrangler secret put <SECRET_NAME> --config <TARGET_CONFIG>
```

Текущий реализованный remote inventory secret names: `JWT_SECRET`,
`TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`; resulting local candidate также
объявляет `TELEGRAM_BOT_TOKEN`, но он не установлен. Exact bureau destination
хранится по реализованному reviewed config/secret contract и не раскрывается в evidence. Telegram values не
устанавливать без approved provider path и отдельного remote permission.
`RESEND_API_KEY` устанавливается только для точного
environment Worker после проверки key scope по § 4.4.

**Ожидаемый безопасный результат:** CLI подтверждает имя secret и target Worker,
но evidence не содержит value. Vars из config не имеют `replace-*` или
`example.invalid`.

**Проверка:** реализованный `release:verify` запускает code/tests/E2E/build,
dependency audit, documentation checks и repository scan, не печатая secret
values. Он не доказывает наличие remote secret и не заменяет provider/UI review.
Immutable `200268f` прошёл production и full dependency audit с 0 findings;
границы policy документированы в [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md).
Полный release gate всё равно требует свежий immutable run после локальных
изменений и оставшееся environment evidence.

**Stop condition:** secret показан в terminal history/log, target Worker не тот,
vars содержат placeholder, feature flag включён до своего gate.

**Rollback/recovery:** немедленно revoke/rotate exposed credential; отключить
affected feature; сохранить только sanitized incident ID.

## 6. Проверить migrations и backup gate

### 6.1 Empty local D1

**Prerequisites:** отдельный clean clone; `.wrangler/state` не содержит нужных
данных.

**Команды:**

```powershell
npm run db:reset:local
npm run db:migrate:local
npm run db:migrations:local
```

**Ожидаемый безопасный результат:** все local candidate migrations от
`0001_foundation.sql` до `0021_reconciliation_exact_candidate_evidence.sql`
применены по одному разу. Clean-D1 coverage проверяет последовательный набор
`0001`–`0021`, включая deployed operations/monitoring `0014`–`0015` и unapplied
remote candidate migrations `0016`–`0021`.

**Проверка:** targeted foundation D1 test проходит локально. Это не заменяет
полный immutable `npm run release:verify` и remote restore evidence.

**Stop condition:** изменён уже применённый migration, duplicate/failed migration,
неожиданная remote D1 или missing `0014|0015|0016|0017|0018|0019|0020|0021` в
local candidate.

**Rollback/recovery:** удалить только специально созданное local persisted state
через существующий `db:reset:local`; remote state не трогать.

### 6.2 Representative upgraded D1 и remote migration

**Prerequisites:** проверенный sanitized fixture предыдущей schema и explicit
pre-migration backup.

**Команда:** `tests/integration/migration-upgrade-d1.test.ts`, запускаемый общим
`npm test`, локально проверяет populated schema через `0013`, затем применяет
`0014`–`0018`, сохраняет существующие records/constraints и создаёт новые
structures.
Если до upgrade уже есть active admin, migration автоматически и аудируемо
запечатывает one-shot bootstrap. Remote apply имеет форму:

```powershell
npx wrangler d1 migrations apply DB --remote --config <TARGET_CONFIG>
```

**Ожидаемый безопасный результат:** backup проверен, migration применена один
раз, данные/constraints сохранены; существующий active admin не оставляет
bootstrap capability открытой. Populated `0016`→`0018` fixture сохраняет
grandfathered legacy release plans как immutable evidence, но каждый lifecycle
transition для `NULL` actors/legacy `{}` contract fail-closed; дальнейшая работа
начинается новым hardened plan, не direct SQL repair.

**Проверка:** schema/data compatibility smoke и migration list.

Датированное initial preview apply 2026-08-10 (`0001`–`0014`, 14/14, pending 0)
сохраняется как историческое evidence именно той точки. После него append-only
`0015_worker_monitoring.sql` применена 2026-08-11; текущий preview inventory —
`0001`–`0015`, pending 0. Исторические 14/14 нельзя использовать как current
schema inventory или как restore rehearsal. `0016`–`0018` — только local
candidate; их remote preview apply требует отдельного разрешения, pre-migration
recovery point и post-apply verification.

**Stop condition:** нет restore rehearsal, нет representative fixture, target
не preview, command просит применить неизвестную migration. Сейчас gate
`blocked`; production команду не выполнять.

**Rollback/recovery:** applied migrations не переписывать и не удалять. Выбрать
совместимый code rollback, forward-fix migration либо отдельно разрешённый
restore по [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).

## 7. Bootstrap первого администратора

**Prerequisites:** для resulting candidate schema through migration `0018` и
audited bootstrap mechanism реализованы; deployed preview пока through `0015`,
поэтому candidate bootstrap там не запускается;
target user уже подтверждён безопасным out-of-band способом;
target не сохраняет parent-side child/claim/correction/trial/request/enrollment/
contract/price-review/message/privacy state (пустая FamilyID allocation
допустима и проверяется server-side);
получено двухстороннее approval; значение user ID не попадает в evidence.

**Точная local команда:**

```powershell
npm run admin:bootstrap -- --environment local --user-id <TARGET_USER_ID> --reason "<SAFE_REASON>" --confirmation BOOTSTRAP_FIRST_ADMIN_LOCAL
```

Remote preview требует точный UUID из approved preview config и confirmation,
включающий тот же UUID:

```powershell
npm run admin:bootstrap -- --environment preview --database-id <PREVIEW_D1_UUID> --user-id <TARGET_USER_ID> --reason "<SAFE_REASON>" --confirmation BOOTSTRAP_FIRST_ADMIN_PREVIEW_<PREVIEW_D1_UUID> --config <PREVIEW_CONFIG> --remote
```

Remote production имеет отдельную форму, но сейчас запрещён общим production
**NO-GO**:

```powershell
npm run admin:bootstrap -- --environment production --database-id <PRODUCTION_D1_UUID> --user-id <TARGET_USER_ID> --reason "<SAFE_REASON>" --confirmation BOOTSTRAP_FIRST_ADMIN_PRODUCTION_<PRODUCTION_D1_UUID> --config <PRODUCTION_CONFIG> --remote
```

До mutation CLI читает именно указанный config без `.dev.vars` overlay, сверяет
`APP_ENV`, единственный binding `DB` и environment-specific ID
(`preview_database_id` либо `database_id`), запрещает общий preview/production
ID, selector collision и placeholder config. Для дочерней Wrangler-команды
создаётся временный config без vars и D1 bindings: positional UUID нельзя
перенаправить через `database_name`/binding. CLI требует успешный результат для
каждого statement и ровно одну terminal assertion row. Unit/integration tests
проверяют target pinning, parameter escaping, one-shot execution, session
revocation и audit; remote clean-room rehearsal всё ещё обязателен.

**Ожидаемый безопасный результат:** ровно один eligible active account получает
admin role; создан audit event без email/PII; bootstrap capability становится
непригодна для повтора; старые sessions отозваны. Target с retained parent state
отклоняется целиком: роль/sessions/control/audit остаются без изменений.

**Проверка:** admin входит заново, видит только разрешённый admin shell; повтор
той же команды fail-closed; security reviewer подтверждает audit и отсутствие
постоянного privilege path.

**Stop condition:** config/`APP_ENV`/D1 UUID не совпали, UUID не включён в exact
confirmation, direct SQL, вывод email, роль без audit, replay успешен, bootstrap
secret/flag остаётся активным, target имеет retained parent state или невозможно
немедленно снять роль.

**Rollback/recovery:** bootstrap нельзя reset/replay: после успешного запуска или
автоматического seal при upgrade с существующим admin control остаётся consumed.
Пока есть другой authorized admin, использовать только существующие audited
role/session actions. Отдельной last-admin recovery CLI нет; если после consume
не осталось active admin, это `blocked` security incident с решением о
restore/recovery по утверждённой процедуре, а не повод повторять bootstrap или
править D1 напрямую.

## 8. Выполнить безопасный initial import rehearsal

Resulting local candidate содержит exact-target remote CLI из
[import pipeline](IMPORT_PIPELINE.md): `plan`, local/read-only `confirmation`,
`stage`, `review`, `recovery-evidence`, `promote`, `verify`, `rollback`,
`roll-forward`. Это не
разрешение на запуск и не environment evidence. Deployed preview остаётся на
migrations `0001`–`0015`; candidate migrations `0016`–`0018` локальны и не
применены. Production transitions дополнительно fail closed до отдельно
зафиксированного remote transaction evidence.

Current sanitized source inventory: актуальный Access snapshot ранее проверен
неисполняющим allowlisted parser — 1703 rows, 21/21 required fields,
`access-tblkartei:v1` compatible. Это не dry-run/promotion evidence.
Value-free inspection confirms the current PlusBText source still matches
`admin-xlsm-plusbtext:v1`. Earlier `PLUSB_HEADER_CONTRACT_MISMATCH` evidence was
caused by sanitizer handling of a styled self-closing empty cell that consumed
the following populated cell; it was a parser defect, not source drift. Before
stage/promote, the fix requires focused regression/current-source safe aggregate
evidence and full candidate verification. Нельзя ослаблять v1, подбирать
header/columns позиционно или извлекать extra workbook sheets. A true future
contract change still requires a new approved version.

**Prerequisites:** утверждён academic period; source находится вне Git и считается
read-only; parser allowlist подтверждён; exact candidate clean. Ordinary preview
использует только built-in `synthetic_preview` fixtures
`legacy-preview-synthetic-baseline-v1|legacy-preview-synthetic-candidate-v1` и
никогда не принимает Office paths. Production использует только
`current_production` с двумя явными read-only source paths.
Office/Access/Excel/COM/LibreOffice/VBA не запускаются, полный workbook/row dump
не создаётся. Для ordinary preview разрешён только synthetic bundle: реальный
Access/PlusBText PII source туда не загружается.

**Команды local rehearsal:**

```powershell
npm run db:period:local -- --academic-period <PERIOD_CODE> --display-name "<DISPLAY_NAME>" --starts-on <YYYY-MM-DD> --ends-on <YYYY-MM-DD> --current
npm run import:price:local -- --academic-period <PERIOD_CODE> --action dry-run --source <READ_ONLY_SOURCE_PATH>
npm run import:schedule:local -- --academic-period <PERIOD_CODE> --action dry-run --source <READ_ONLY_SOURCE_PATH> --html <READ_ONLY_HTML_REFERENCE_PATH>
npm run import:plusbtext:local -- --academic-period <PERIOD_CODE> --action dry-run --source <READ_ONLY_SOURCE_PATH>
npm run import:access:local -- --academic-period <PERIOD_CODE> --action dry-run --source <READ_ONLY_SOURCE_PATH>
npm run import:status:local -- --limit <SAFE_LIMIT>
```

Только после review dry-run issues и source/dependency hashes действие можно
повторить с `--action promote` в разрешённой non-production среде.

Эти local commands не моделируют production-grade remote protocol полностью:
текущий local `dry-run` создаёт staging/run rows и потому не является no-write
plan. Реализованный remote lifecycle вызывается только после отдельного
разрешения; точные flags/confirmations приведены в
[IMPORT_PIPELINE.md](IMPORT_PIPELINE.md):

```text
npm run import:legacy:plan:remote              # remote reads + protected plan
npm run import:legacy:stage:remote             # inactive target-pinned rows
npm run import:legacy:review:remote            # immutable independent review
npm run import:legacy:recovery-evidence:remote # binds verified isolated restore
npm run import:legacy:confirmation:remote      # local exact typed confirmation
npm run import:legacy:promote:remote           # atomic pair switch
npm run import:legacy:verify:remote            # PII-free counts/FK/current
npm run import:legacy:rollback:remote          # previous compatible pair
npm run import:legacy:roll-forward:remote      # reviewed target pair
```

Каждая command должна pin-ить exact environment, ignored target config и D1
UUID, запрещать selector/overlay/shared preview-production ID/placeholder,
записывать только safe audit metadata и требовать отдельное exact-scope
разрешение на remote mutation. Schema-v3 plan связывает `sourceClass`, exact
synthetic fixture ID либо private source hashes, PlusBText contract/dependency
versions, academic period, target identity, planner/caller time и safe diff.
Stage не меняет current pointer; review не выполняет promote; planner/stager/
reviewer попарно различаются, transition actor отличается от reviewer, а
recovery verifier — от planner/stager/reviewer/promoter. Migration `0018`
связывает immutable run/source/snapshot/projection/issue count contract и
append-only failed-stage cleanup; promote повторно сверяет artifact/current/
leases/recovery и публикует Access+PlusBText атомарно.

**Ожидаемый безопасный результат:** output содержит safe counts/hashes/error
codes, но не source rows; promotion идемпотентна; current promoted legacy
snapshot существует.

**Проверка:** автоматические 0/1/multiple lookup cases и unavailable/stale
snapshot fail-closed проходят; отсутствие snapshot не выделяет namespace `2`.

**Stop condition:** fatal/error issues, changed source во время review, parser
выходит за allowlist, output содержит PII, snapshot missing/stale/unavailable,
PlusBText v1 current-source parser/regression evidence не завершено,
remote command/target pinning/independent review отсутствуют. Production
import сейчас `blocked`.

**Rollback/recovery:** local rollback:

```powershell
npm run import:rollback:local -- --source-kind <price|schedule|plusbtext|access> --academic-period <PERIOD_CODE> --to-version <VERSION_ID>
```

`<VERSION_ID>` берётся только из безопасного status output. Remote rollback
boundary реализована локально, но production нельзя включать до rehearsal. Для первого
promote предыдущей published version нет, поэтому обычный version rollback
неприменим: до stage/promote обязателен verified recovery bookmark/pre-import D1
backup и isolated restore к no-current state по DR runbook. После последующих
promotions отдельно проверяются previous-version rollback и roll-forward.

**Remote evidence boundary:** synthetic preview rehearsal записывает только
plan digest fingerprint, safe aggregate counts/codes, target fingerprint,
timestamps и reviewer roles. Реальный current PII import выполняется только в
production/отдельно утверждённый restricted target после data/privacy approval,
backup/restore evidence и отдельного разрешения на каждый stage/review/promote;
никакого provider send/public auth во время import.

## 9. Подключить scheduled jobs и manual operations

**Prerequisites:** scheduled entrypoint, migrations `0014`–`0015`, triggers, leases,
job-run state, alerts и RBAC manual operations page реализованы и протестированы.

Migrations `0014`–`0015` и scheduler задают exact job IDs `email_outbox`, `telegram_outbox`,
`price_review`, `document_quarantine`, `funding_authorization_expiry`,
`email_reservation_cleanup`, `privacy_r2_cleanup`, `security_metadata_cleanup` и
`storage_orphan_cleanup`. Для каждого записываются exact cron expression,
timezone, batch limit, dedupe/lease, freshness signal, manual action и failure
procedure.

**Точная команда/UI:** config fields `SCHEDULED_JOBS_ENABLED`,
`SCHEDULED_OUTBOX_BATCH_LIMIT`, `SCHEDULED_MAINTENANCE_BATCH_LIMIT` и
`SCHEDULED_LEASE_SECONDS`; `[triggers].crons = ["* * * * *", "*/15 * * * *"]`.
Every-minute trigger запускает email/Telegram jobs, fifteen-minute trigger —
остальные maintenance jobs. Manual UI: `<PORTAL_ORIGIN>/admin/operations`, поле
`jobName`, hidden CSRF/idempotency key и checkbox `confirmation`; action
`?/run`. Оба Cloudflare Cron expression исполняются в UTC; только Telegram
business-hours вычисляются в `Europe/Berlin`. Local scheduler/route tests
и preview automatic delivery/freshness всех девяти jobs прошли; оба trigger
сохранены, aggregate HEAD freshness/error signal и независимая DOWN→UP delivery
проверены. Remote manual-run/dedupe/failure и job-specific thresholds остаются
`blocked`.

**Ожидаемый безопасный результат:** duplicate delivery не дублирует side effect;
ошибка одного job не скрывает другие; manual run возвращает sanitized counts и
audit event; stale/missed/dead вызывает проверяемый signal.

**Проверка:** local `tests/unit/operations-scheduler.test.ts`,
`tests/integration/operations-scheduler-d1.test.ts` и security tests маршрута
`/admin/operations` проходят. Automatic Cron delivery/freshness и aggregate
alert rehearsal уже получены; отдельно обязательны remote preview manual-run/
dedupe/dead/stale-lock и job-specific failure/backlog alerts.

**Stop condition:** typecheck/test failed, timezone/owner не подтверждены, job
нельзя безопасно повторить, manual action неаудируема или alert не наблюдаем.
Сейчас automatic/aggregate часть `passed`, оставшаяся manual/failure/job-specific
часть `blocked`.

**Rollback/recovery:** не добавлять triggers. Если trigger уже создан ошибочно —
сначала отключить его утверждённым config change, затем разбирать backlog по
[OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md).

## 10. Preview deploy и smoke

**Prerequisites:** шаги 1–9 имеют evidence; preview resources отделены;
production credentials/PII отсутствуют; legacy-import rehearsal использует
только deterministic synthetic/no-PII bundle; remote preview deploy, import
stage/promote/rollback и provider send разрешаются раздельно exact scope.

**Команды:**

```powershell
npm run build
npx wrangler deploy --config <PREVIEW_CONFIG>
```

**Ожидаемый безопасный результат:** опубликован только preview Worker;
`PORTAL_PUBLIC_ORIGIN` равен preview HTTPS origin; cookies host-only; providers
fake/disabled; real sends невозможны.

**Проверка:** synthetic register → cabinet → request/trial → contract → price
review → message → privacy closure; cross-user/RBAC/CSRF; German keyboard/mobile;
Browser glyph/font/long-name/pagination/quota; Cron manual-run; R2 isolation;
logs redacted. Отдельные обязательные checks: exact-target synthetic legacy
baseline plan→stage→review→recovery-evidence(`none`)→promote→verify, затем
candidate plan→stage→review→recovery-evidence(`previous`)→promote→verify→
rollback/roll-forward с first-import restore;
Telegram Bot API one-way minimized delivery и `delivery_unknown` operator path —
только после собственных разрешений и без client PII.

**Stop condition:** нет preview approval/resources, config содержит production
ID/secret, обязательный smoke отсутствует либо authenticated Browser/provider/
manual-failure wiring не проходит current tests/rehearsal. Preview Worker, D1,
private EU R2, automatic Cron, aggregate alert, public HTTP/desktop/mobile/
keyboard smoke и stored-log review уже подтверждены; remote authenticated/IDOR/
axe, real-token public auth, provider delivery, Browser Run, manual/dedupe/
failure, bootstrap, synthetic remote-import/first-import restore и Telegram Bot
API smoke части остаются `blocked`.

**Rollback/recovery:** отключить affected feature; rollback preview Worker к
известной совместимой version либо исправить forward. D1/R2 не удалять.

## 11. Production deploy и post-deploy smoke

**Prerequisites:** в checklist нет `blocked`; mandatory MVP paths имеют `passed`;
RPO/RTO/cadence утверждены; backup/restore и rollback rehearsal прошли; имеется
отдельное прямое поручение на точные production действия. PR-B12–PR-B17 и
PR-F12–PR-F15 пройдены: current legacy bundle проверен и recoverable, Telegram
Bot API provider/operator ambiguity path доказан либо release явно и отдельно
одобрен как ограниченный с Telegram fail-closed.

**Команды:**

```powershell
npm run build
npx wrangler d1 migrations apply DB --remote --config <PRODUCTION_CONFIG>
npx wrangler deploy --config <PRODUCTION_CONFIG>
```

Эти команды сейчас запрещены: prerequisites не выполнены. `npm run deploy` без
явного config не использовать для operator release.

**Ожидаемый безопасный результат:** migration backup/evidence создано; Worker
отвечает только на утверждённом portal origin; health и read-only synthetic smoke
проходят; реальные sends/import/uploads остаются выключены до своих gates.

**Проверка:** immutable version, migration list, TLS/origin/cookies, health,
authorization, monitoring, Cron freshness и zero-PII logs. Не создавать реального
клиента ради smoke.

**Stop condition:** любой `blocked`, неизвестная migration, failed smoke/alert,
нет direct approval или нужно изменить официальный сайт. Текущий статус:
`blocked`.

**Rollback/recovery:** остановить enablement; выключить affected feature;
выполнить совместимый code rollback либо roll-forward/restore decision по DR
runbook. Никогда не переписывать applied migration.

## 12. Включить функции по одной

| Path                                   | Управляющий config                           | Текущий статус     |
| -------------------------------------- | -------------------------------------------- | ------------------ |
| Public registration/auth               | `AUTH_PUBLIC_ENABLED` + email adapter        | `feature_disabled` |
| Email delivery                         | `EMAIL_PROVIDER`                             | `feature_disabled` |
| Telegram delivery                      | `TELEGRAM_PROVIDER`                          | `feature_disabled` |
| Document upload                        | `DOCUMENT_UPLOAD_ENABLED`                    | `feature_disabled` |
| Contract rendering/send                | `CONTRACT_RENDERER`, `CONTRACT_SEND_ENABLED` | `feature_disabled` |
| Online media grant                     | `MEDIA_ONLINE_GRANT_ENABLED`                 | `feature_disabled` |
| Public statutory contract functions    | `PUBLIC_CONTRACT_FUNCTIONS_ENABLED`          | `feature_disabled` |
| Automatic retained legal-archive purge | policy state `disabled_by_policy`            | `feature_disabled` |
| Ordinary legal-archive read/search     | route отсутствует                            | `feature_disabled` |

**Prerequisites:** только соответствующий gate стал `passed`, limited-release
scope отдельно одобрен, fail-closed и rollback проверены.

Для Telegram это означает не только наличие token/chat: PR-F12 adapter/config,
PR-F13 terminal `delivery_unknown`, PR-F14 separately authorized synthetic
preview smoke и PR-F15 destination/rotation/operator recovery должны иметь
evidence. До этого единственное допустимое значение — `disabled`.

**Точная команда:** отдельного универсального enable script нет. Конкретный
approved config change и deploy выполняются только по отдельной change procedure
после успешного `release:verify`, remote preview evidence и approval данного
path. Сейчас ни один такой production enable не разрешён.

**Ожидаемый безопасный результат:** включён ровно один approved path; остальные
flags не изменены.

**Проверка:** positive и negative smoke, monitoring и rollback trigger.

**Stop condition:** runtime запрещает production value, legal/provider gate не
passed, нет adapter/runbook/training.

**Rollback/recovery:** вернуть конкретный flag в fail-closed value и deploy
только по утверждённой change procedure.

## 13. Отдельный go-live ссылок официального сайта

**Prerequisites:** production portal post-deploy smoke `passed`; получено
отдельное прямое поручение владельца официального сайта; release manifest
содержит точный portal URL, каждую approved surface, CMS field и прежнее
значение.

**Точная команда/UI:** неизвестны и не входят в репозиторий портала. Пока exact
CMS fields и разрешение не переданы, шаг `blocked`; оператор ничего не меняет.

**Ожидаемый безопасный результат:** только утверждённые HTTPS-ссылки ведут на
проверенный portal origin; CMS/runtime/auth сайта не объединяются с порталом.

**Проверка:** открыть каждую URL из manifest в private browser, проверить target,
TLS и отсутствие session sharing; сохранить sanitized list/result.

**Stop condition:** нет exact URL-list/field/approval, portal health не passed,
редактирование требует server/database access либо меняет расписание сверх
ссылки.

**Rollback/recovery:** восстановить прежнее значение только на перечисленных
site surfaces по отдельной site change procedure. Это не откатывает Worker, D1
или R2 портала.

## Итоговый stop rule

При любом `blocked`, failed обязательном check, неизвестном provider/Cron wiring,
непроверенном restore/rollback, object-authorization/PII defect или
несуществующей команде production-ready объявлять нельзя. Документированный
план не является разрешением на remote действие. Preview Worker/D1/private EU
R2/automatic Cron/aggregate alert/public browser/stored-log evidence уже есть.
Authenticated/provider/Browser Run/manual-failure/job-specific alert/bootstrap,
restore rehearsal с утверждёнными RPO/RTO, production resources/custom origin,
approved PlusBText contract/current target-pinned legacy import with first-import
restore, Telegram Bot API adapter/ambiguous-delivery/operator smoke, production
provider adapters и legal/privacy/template approvals отсутствуют;
production verdict остаётся **NO-GO**.

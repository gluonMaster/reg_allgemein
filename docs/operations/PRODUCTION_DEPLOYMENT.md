# Развёртывание портала регистрации

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

| Объект                              | Фактическое состояние                                                                                              | Gate                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Local config                        | `wrangler.local.toml`: `DB`, отдельные `R2_ARCHIVE`/`R2_QUARANTINE`; local config/storage/contract tests проходят  | локальное evidence есть; remote evidence `blocked`   |
| Example production config           | `wrangler.example.toml`: отдельные archive/quarantine bindings с `jurisdiction = "eu"`, без real IDs               | remote resources/rehearsal `blocked`                 |
| Раздельные R2                       | runtime требует оба binding в preview/production и отклоняет один object для двух ролей; локальные tests проходят  | private remote EU buckets/wiring evidence `blocked`  |
| Последняя migration                 | `0014_production_operations.sql`; clean и populated `0013` → `0014` upgrade tests проходят локально                | remote migration/restore evidence `blocked`          |
| Scheduled jobs/Cron                 | scheduled handler, два trigger, девять allowlisted jobs и job-run repository покрыты local unit/integration tests  | remote preview delivery/freshness и alerts `blocked` |
| Manual operations page              | `/admin/operations`: RBAC, CSRF, allowlist, confirmation, idempotency, history и audit покрыты local tests         | remote preview/alerts/operator approval `blocked`    |
| First-admin CLI                     | `npm run admin:bootstrap` и local unit/integration tests реализованы; exact target guard и one-shot seal проверены | remote exercise и post-consume recovery `blocked`    |
| Release helpers                     | `docs:check`, `release:scan`, `release:verify` реализованы; verify включает E2E/docs/scan/audit                    | full immutable run и remote gates ещё `blocked`      |
| Email/Telegram adapters             | только `disabled`/fake, production adapters отсутствуют                                                            | `feature_disabled`                                   |
| Production uploads                  | runtime запрещает включение                                                                                        | `feature_disabled`                                   |
| Production contract send            | runtime запрещает включение                                                                                        | `feature_disabled`                                   |
| Online media grant                  | fail-closed flag                                                                                                   | `feature_disabled`                                   |
| Public statutory contract functions | fail-closed flag                                                                                                   | `feature_disabled`                                   |

Локальные tests подтверждают реализацию, но не авторизуют remote provisioning,
migration, preview deploy или production deploy. До remote preview evidence,
alerting и restore rehearsal текущий production verdict остаётся **NO-GO**.

## Release inputs и доступы

До первого remote шага оператор получает и записывает в закрытый release record,
но не в Git:

| Input                                                   | Требование                                                           | При отсутствии                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| Immutable commit SHA и release tag                      | утверждённый build candidate                                         | `blocked`                                              |
| Cloudflare account/roles                                | least-privilege доступ к Workers, D1, R2, Browser, DNS и Turnstile   | `blocked`                                              |
| `<PREVIEW_CONFIG>`, `<PRODUCTION_CONFIG>`               | materialized ignored config paths с target resource IDs, без secrets | `blocked`                                              |
| D1 names/IDs по средам                                  | local, preview и production не совпадают                             | `blocked`                                              |
| R2 bucket names                                         | отдельные preview/production archive и quarantine, EU jurisdiction   | `blocked`                                              |
| `<PORTAL_PREVIEW_ORIGIN>`, `<PORTAL_PRODUCTION_ORIGIN>` | HTTPS origins, не origin официального сайта                          | `blocked`                                              |
| Provider decisions                                      | approved email/Telegram providers, DPA/AVV и credentials owner       | `blocked` либо путь `feature_disabled`                 |
| RPO/RTO, backup cadence/retention                       | утверждённые owner/security inputs                                   | `blocked`                                              |
| Legal/privacy/template approvals                        | конкретные version IDs и evidence                                    | `blocked` либо соответствующий путь `feature_disabled` |
| Production action approval                              | отдельное прямое поручение на deploy/migration/import/send           | `blocked`                                              |
| Site-link manifest                                      | точный portal URL и полный список внешних surfaces                   | `blocked`                                              |

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
`npm audit --omit=dev` показывает `0 vulnerabilities`. Immutable baseline
`b1a1505` имел 7 dev-only findings; проверенный working-tree successor обновляет
SvelteKit/PostCSS/Wrangler/Miniflare, проходит полный audit с 0 vulnerabilities и
описан в [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md). До фиксации successor в
immutable commit, повторного clean прогона и закрытия environment gates общий
gate `blocked`.

**Ожидаемый безопасный результат:** все существующие команды завершаются с code
0; связный synthetic lifecycle проходит на migrated D1, а Playwright boundary
smoke остаётся отдельным результатом. Полный authenticated browser lifecycle
ещё не реализован и оставляет release gate `blocked`; его нельзя приписывать
текущему `release:verify`. Отчёты не содержат PII/secrets; build не содержит
source Office/Access, generated imports, DB snapshots или privacy exports.

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
remote EU resource evidence по-прежнему отсутствует. Один provider bucket под
двумя bindings этому gate не соответствует.

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
не изменил не тот config. Remote bucket IDs и EU/private evidence всё ещё должны
быть подтверждены отдельно.

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
secret `RESEND_API_KEY`, `TELEGRAM_PROVIDER`. Provider credential names сверх текущего inventory нельзя
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
key допускает лишние origins, real send не разрешён или adapter отсутствует.

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

## 5. Установить vars, secrets и feature flags

**Prerequisites:** target config и Worker name проверены; secret передаётся через
интерактивный stdin, а не аргумент/историю shell.

**Команда для каждого реализованного secret name:**

```powershell
npx wrangler secret put <SECRET_NAME> --config <TARGET_CONFIG>
```

Текущий inventory secret names: `JWT_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Последние два не устанавливать без
approved Telegram path. `RESEND_API_KEY` устанавливается только для точного
environment Worker после проверки key scope по § 4.4.

**Ожидаемый безопасный результат:** CLI подтверждает имя secret и target Worker,
но evidence не содержит value. Vars из config не имеют `replace-*` или
`example.invalid`.

**Проверка:** реализованный `release:verify` запускает code/tests/E2E/build,
dependency audit, documentation checks и repository scan, не печатая secret
values. Он не доказывает наличие remote secret и не заменяет provider/UI review.
Текущий production dependency audit проходит; dev-only tooling advisory и его
границы документированы в [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md). Полный
release gate всё равно требует immutable run и remote evidence.

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

**Ожидаемый безопасный результат:** migrations `0001`–
`0014_production_operations.sql` применены один раз. Local clean-D1 integration
coverage проверяет последовательное применение и новые operations/bootstrap/
storage tables migration `0014`.

**Проверка:** targeted foundation D1 test проходит локально. Это не заменяет
полный immutable `npm run release:verify` и remote restore evidence.

**Stop condition:** изменён уже применённый migration, duplicate/failed migration,
неожиданная remote D1 или missing `0014`, если release объявляет её частью.

**Rollback/recovery:** удалить только специально созданное local persisted state
через существующий `db:reset:local`; remote state не трогать.

### 6.2 Representative upgraded D1 и remote migration

**Prerequisites:** проверенный sanitized fixture предыдущей schema и explicit
pre-migration backup.

**Команда:** `tests/integration/migration-upgrade-d1.test.ts`, запускаемый общим
`npm test`, локально проверяет populated schema через `0013`, затем применяет
`0014`, сохраняет существующие records/constraints и создаёт новые structures.
Если до upgrade уже есть active admin, migration автоматически и аудируемо
запечатывает one-shot bootstrap. Remote apply имеет форму:

```powershell
npx wrangler d1 migrations apply DB --remote --config <TARGET_CONFIG>
```

**Ожидаемый безопасный результат:** backup проверен, migration применена один
раз, данные/constraints сохранены; существующий active admin не оставляет
bootstrap capability открытой.

**Проверка:** schema/data compatibility smoke и migration list.

**Stop condition:** нет restore rehearsal, нет representative fixture, target
не preview, command просит применить неизвестную migration. Сейчас gate
`blocked`; production команду не выполнять.

**Rollback/recovery:** applied migrations не переписывать и не удалять. Выбрать
совместимый code rollback, forward-fix migration либо отдельно разрешённый
restore по [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).

## 7. Bootstrap первого администратора

**Prerequisites:** migration `0014` и audited bootstrap mechanism реализованы;
target user уже подтверждён безопасным out-of-band способом;
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

**Ожидаемый безопасный результат:** ровно один active account получает admin role;
создан audit event без email/PII; bootstrap capability становится непригодна для
повтора; старые sessions отозваны.

**Проверка:** admin входит заново, видит только разрешённый admin shell; повтор
той же команды fail-closed; security reviewer подтверждает audit и отсутствие
постоянного privilege path.

**Stop condition:** config/`APP_ENV`/D1 UUID не совпали, UUID не включён в exact
confirmation, direct SQL, вывод email, роль без audit, replay успешен, bootstrap
secret/flag остаётся активным или невозможно немедленно снять роль.

**Rollback/recovery:** bootstrap нельзя reset/replay: после успешного запуска или
автоматического seal при upgrade с существующим admin control остаётся consumed.
Пока есть другой authorized admin, использовать только существующие audited
role/session actions. Отдельной last-admin recovery CLI нет; если после consume
не осталось active admin, это `blocked` security incident с решением о
restore/recovery по утверждённой процедуре, а не повод повторять bootstrap или
править D1 напрямую.

## 8. Выполнить безопасный initial import rehearsal

Существующие import scripts работают только с local D1 и read-only upstream.
Remote preview/production import command отсутствует.

**Prerequisites:** утверждён academic period; source находится вне Git и считается
read-only; parser allowlist подтверждён; используются synthetic/sanitized data.

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

**Ожидаемый безопасный результат:** output содержит safe counts/hashes/error
codes, но не source rows; promotion идемпотентна; current promoted legacy
snapshot существует.

**Проверка:** автоматические 0/1/multiple lookup cases и unavailable/stale
snapshot fail-closed проходят; отсутствие snapshot не выделяет namespace `2`.

**Stop condition:** fatal/error issues, changed source во время review, parser
выходит за allowlist, output содержит PII, snapshot missing/stale/unavailable,
remote import command отсутствует. Production import сейчас `blocked`.

**Rollback/recovery:** local rollback:

```powershell
npm run import:rollback:local -- --source-kind <price|schedule|plusbtext|access> --academic-period <PERIOD_CODE> --to-version <VERSION_ID>
```

`<VERSION_ID>` берётся только из безопасного status output. Remote rollback
implementation отсутствует; production нельзя включать до rehearsal.

## 9. Подключить scheduled jobs и manual operations

**Prerequisites:** scheduled entrypoint, migration `0014`, triggers, leases,
job-run state, alerts и RBAC manual operations page реализованы и протестированы.

Migration `0014` и scheduler задают exact job IDs `email_outbox`, `telegram_outbox`,
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
проходят, но preview trigger и alert thresholds требуют явной проверки, поэтому
gate остаётся `blocked`.

**Ожидаемый безопасный результат:** duplicate delivery не дублирует side effect;
ошибка одного job не скрывает другие; manual run возвращает sanitized counts и
audit event; stale/missed/dead вызывает проверяемый signal.

**Проверка:** local `tests/unit/operations-scheduler.test.ts`,
`tests/integration/operations-scheduler-d1.test.ts` и security tests маршрута
`/admin/operations` проходят. Затем всё равно обязательны remote preview
manual-run/dedupe/dead/stale-lock, Cron delivery/freshness и alert rehearsal.

**Stop condition:** typecheck/test failed, timezone/owner не подтверждены, job
нельзя безопасно повторить, manual action неаудируема или alert не наблюдаем.
Сейчас весь gate `blocked`.

**Rollback/recovery:** не добавлять triggers. Если trigger уже создан ошибочно —
сначала отключить его утверждённым config change, затем разбирать backlog по
[OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md).

## 10. Preview deploy и smoke

**Prerequisites:** шаги 1–9 имеют evidence; preview resources отделены;
production credentials/PII отсутствуют; remote preview action разрешено.

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
logs redacted.

**Stop condition:** нет preview approval/resources, config содержит production
ID/secret, E2E отсутствует либо Browser/provider/Cron wiring не проходит current
tests/rehearsal. Текущий preview gate `blocked`: remote resources, Cron delivery,
alerts и provider wiring не подтверждены.

**Rollback/recovery:** отключить affected feature; rollback preview Worker к
известной совместимой version либо исправить forward. D1/R2 не удалять.

## 11. Production deploy и post-deploy smoke

**Prerequisites:** в checklist нет `blocked`; mandatory MVP paths имеют `passed`;
RPO/RTO/cadence утверждены; backup/restore и rollback rehearsal прошли; имеется
отдельное прямое поручение на точные production действия.

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
план не является разрешением на remote действие. Сейчас remote preview/alerts,
restore rehearsal с утверждёнными RPO/RTO, production provider adapters,
legal/privacy/template approvals и remote resource evidence отсутствуют;
production verdict остаётся **NO-GO**.

# reg_allgemein

Портал регистрации Kolibri на SvelteKit и Cloudflare: каталог занятий,
ориентировочная цена, аккаунты родителей, перенос будущих legacy-записей,
заявки, договоры и коммуникация с бюро.

Это самостоятельное приложение со своим public origin, deployment, D1/R2 и
auth/session. [Официальный сайт Kolibri](https://kolibri-dresden.de/) живёт в
отдельной инфраструктуре и связывается с порталом только обычными HTTPS-
ссылками, включая ссылку со страницы расписания. Этот репозиторий не
содержит и не разворачивает CMS/код официального сайта.

- [Карта документации](docs/README.md)
- [Спецификация MVP](docs/spec/MVP_SPEC.md)
- [Пошаговая реализация](docs/implementation/ROADMAP.md)

Локальная разработка:

```bash
npm ci
npm run db:migrate:local
npm run dev
```

`wrangler.local.toml` содержит только локальные имена ресурсов и поднимает
отдельные D1/R2 bindings через Cloudflare platform proxy. Локальное состояние
попадает в игнорируемый каталог `.wrangler/`. Для очистки только локальной D1 и
повторного применения миграций:

```bash
npm run db:reset:local
npm run db:migrate:local
npm run db:migrations:local
```

Проверки foundation:

```bash
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Chromium устанавливается один раз в локальный cache Playwright и не попадает в
репозиторий. Unit/integration tests используют только synthetic data и
изолированную in-memory D1.

Локальный импорт прайса, расписания и legacy-данных требует заранее
зарегистрированный
учебный период. Следующий пример создаёт только локальную запись с явно
переданными датами; importer никогда не определяет период по имени файла или
текущей дате:

```bash
npm run db:period:local -- \
  --academic-period 2026-2027 \
  --display-name 2026/2027 \
  --starts-on 2026-08-01 \
  --ends-on 2027-07-31
```

Безопасный dry-run выполняет extract/normalize/stage/validate/diff и не меняет
runtime current version. `--action promote` добавляет атомарную локальную
публикацию; повтор уже опубликованного fingerprint возвращает `noop`:

```bash
npm run import:price:local -- --academic-period 2026-2027 --action dry-run
npm run import:schedule:local -- --academic-period 2026-2027 --action dry-run
npm run import:price:local -- --academic-period 2026-2027 --action promote
npm run import:schedule:local -- --academic-period 2026-2027 --action promote
npm run import:plusbtext:local -- --academic-period 2026-2027 --action dry-run --source <read-only-admin.xlsm>
npm run import:plusbtext:local -- --academic-period 2026-2027 --action promote --source <read-only-admin.xlsm>
npm run import:access:local -- --academic-period 2026-2027 --action dry-run --source <read-only-front.accdb>
npm run import:access:local -- --academic-period 2026-2027 --action promote --source <read-only-front.accdb>
npm run import:status:local -- --limit 10
```

По умолчанию price/schedule команды читают только ignored read-only
`references/pricing/Price.xlsx`, primary schedule JSON и контрольный HTML.
Для Access и PlusBText нет default path: нужен `--source` или переменная
`LOCAL_ACCESS_SOURCE`/`LOCAL_ADMIN_WORKBOOK_SOURCE`. Снача публикуется
PlusBText; Access использует текущую опубликованную PlusBText-версию или
явно указанную `--plusbtext-version`. Все source paths остаются вне D1/report.
Реальные клиентские файлы можно читать только read-only и после отдельного
прямого поручения. Просмотр одного запуска и rollback предыдущей опубликованной
версии:

```bash
npm run import:status:local -- --run-id <opaque-run-id>
npm run import:rollback:local -- \
  --source-kind schedule \
  --academic-period 2026-2027
```

Rollback и promotion в этих командах работают только с локальной D1 из
`.wrangler/state/v3`. Production import/remote migration/deploy ими не
выполняются.

`PORTAL_PUBLIC_ORIGIN` задаётся явно. В preview/production принимается только
отдельный canonical HTTPS origin портала; origin официального сайта отклоняется.
Пример production-shaped конфигурации без идентификаторов и секретов находится
в `wrangler.example.toml`, примеры локальных secret placeholders — в
`.dev.vars.example`. Реальные secrets задаются вне Git.

Сейчас реализованы foundation-инфраструктура и локальные versioned importers
прайса, расписания, Access и PlusBText. Auth, public catalog UI, pricing quote и остальные business
workflows добавляются последующими этапами roadmap; cron placeholder намеренно
отсутствует.

Персональные базы данных, клиентские Excel-файлы, секреты и import artifacts в
git не хранятся.

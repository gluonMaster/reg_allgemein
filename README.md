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

`PORTAL_PUBLIC_ORIGIN` задаётся явно. В preview/production принимается только
отдельный canonical HTTPS origin портала; origin официального сайта отклоняется.
Пример production-shaped конфигурации без идентификаторов и секретов находится
в `wrangler.example.toml`, примеры локальных secret placeholders — в
`.dev.vars.example`. Реальные secrets задаются вне Git.

Сейчас реализована только foundation-инфраструктура. Auth, importer, каталог и
business workflows добавляются последующими этапами roadmap; cron placeholder
на этом этапе намеренно отсутствует.

Персональные базы данных, клиентские Excel-файлы, секреты и import artifacts в
git не хранятся.

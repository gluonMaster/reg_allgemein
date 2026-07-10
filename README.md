# reg_allgemein

Портал регистрации Kolibri на SvelteKit и Cloudflare: каталог занятий,
ориентировочная цена, аккаунты родителей, перенос будущих legacy-записей,
заявки, договоры и коммуникация с бюро.

- [Карта документации](docs/README.md)
- [Спецификация MVP](docs/spec/MVP_SPEC.md)
- [Пошаговая реализация](docs/implementation/ROADMAP.md)

Локальная разработка:

```bash
npm install
npm run check
npm run build
```

Текущий scaffold еще не содержит test files, поэтому `npm test` начнет быть
обязательным рабочим gate после этапа 01 из roadmap.

Персональные базы данных, клиентские Excel-файлы, секреты и import artifacts в
git не хранятся.

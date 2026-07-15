# Политика зависимостей

## Правила

- Production dependencies должны быть совместимы с Cloudflare Workers и не
  полагаться на недоступные Node APIs без осознанного compatibility layer.
- Локальные import parsers остаются в `devDependencies` и не импортируются из
  Worker runtime modules.
- `@playwright/test` и browser binaries являются dev/CI tooling и не входят в
  Cloudflare Worker bundle.
- Production PDF renderer зафиксирован `ADR-014`: Cloudflare Browser Run Quick
  Action `/pdf` через binding, без Puppeteer/Playwright session dependency в
  Worker bundle. Другой converter/service нельзя добавлять как silent fallback.
  Unit tests используют `synthetic_test` adapter; remote Browser Run
  conformance выполняется отдельным integration gate.
- Lockfile коммитится; обновление зависимости сопровождается `check`, tests,
  build и audit.
- Override допустим только с причиной, ссылкой на upstream issue/advisory при
  наличии и условием удаления.
- Уязвимость parser-а внутренних файлов оценивается отдельно от production
  runtime, но не игнорируется: sources считаются доверенными только по
  утвержденным local paths и hashes. Parser не добавляется до проверки его
  maintenance status, license, advisory history и чтения XLSX/XLSM без macro
  execution.

## Текущий audit snapshot

Повторно проверено 2026-07-15 после этапа 02:

- `npm run check` проходил;
- `npm test` проходил;
- `npm run build` проходил;
- `npm audit` показывал `0 vulnerabilities`;
- `xlsx@0.18.5` не возвращён.

Для локального allowlisted extract выбран `read-excel-file@9.3.1`:

- MIT license, Node.js `>=18`, активный release на момент проверки;
- находится только в `devDependencies` и не импортируется Worker runtime;
- читает конкретный sheet `Tabelle8`, а числовой XML-текст передаётся в
  собственный decimal-to-cents parser без binary-float arithmetic;
- synthetic macro-enabled container с `vbaProject.bin` разбирается без
  Office/COM/LibreOffice и без исполнения/экспорта VBA; hidden/veryHidden sheet
  не попадает в extractor result;
- encrypted/unsupported container и несовпадение sheet/header contract
  завершаются fail-closed.

`fflate` используется только тестом для создания synthetic XLSX/XLSM container,
а `tsx` — только как Node runner локальных TypeScript CLI. Оба также остаются в
`devDependencies`. XLSM allowlist для реального `PlusBText` и его structural
fingerprint проверяется отдельно на этапе 03; успешный synthetic container не
подменяет этот source-specific gate.

Этот snapshot не является вечной гарантией. Перед release audit запускается
повторно, результат и принятое исключение обновляются.

Этап 02 выбирает поддерживаемый parser после отдельного spike. Допустимые
варианты:

- перейти на поддерживаемый parser;
- конвертировать утвержденные sheets в CSV/JSON локальным отдельным шагом;
- изолировать parsing process и проверять allowlisted sheet/columns/size.

Возвращать `xlsx@0.18.5` или другую версию с неустранённым high advisory без
письменного risk decision запрещено.

## Текущий override

В `package.json`:

```json
{
	"overrides": {
		"cookie": "^0.7.2"
	}
}
```

Причина: использованная версия SvelteKit могла транзитивно тянуть версию
`cookie`, ниже безопасной границы audit. При каждом обновлении SvelteKit нужно
проверить, остается ли override необходимым и совместимым; лишний override
удаляется.

## Release gate

Этот gate является обязательной строкой сводного
[production-readiness contract](PRODUCTION_READINESS.md). Его нельзя считать
закрытым только по устаревшему audit snapshot выше: в release evidence
фиксируются фактические результаты текущего clean install, команд, advisory
classification и каждого принятого исключения.

Перед production:

```bash
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
```

Неустраненный production advisory требует явного risk decision; dev-only
advisory документируется вместе с границами исполнения и планом замены.

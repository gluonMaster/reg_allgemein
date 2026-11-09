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

Повторно проверено 2026-07-15 после этапа 03:

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

`fflate` используется PlusBText boundary для выборочного чтения только
container metadata, target worksheet, styles и referenced shared-string entries, а
также тестами для создания synthetic XLSX/XLSM. Перед передачей в
`read-excel-file` создаётся in-memory archive только с visible `PlusBText`
и cells `E/F/K/L/M/N/T`; unreferenced shared strings заменяются пустыми.
Hidden/veryHidden worksheets, extra columns и VBA parts не распаковываются
этим reader-слоем.
`tsx` используется только как Node runner локальных TypeScript CLI. Оба
остаются в `devDependencies`. Для `PlusBText` добавлен версионный
value-free structural fingerprint с fail-closed drift и отдельными
logical/style review issues. Синтетический golden fixture не подменяет
source-specific dry-run реального файла, который требует отдельного прямого
поручения.

Для локального Access extract выбран `mdb-reader@3.2.0`:

- MIT license, pure Node/JavaScript reader без Office/COM/LibreOffice и ODBC;
- находится только в `devDependencies` и не импортируется Worker runtime;
- читает только `tblKartei` и точный allowlist `ID`, `Value1`, `Value2`,
  `Value4`–`Value9`, `Value15`–`Value20`, `Value42`–`Value46`, `Value48`;
- encrypted/password-protected/unreadable database и schema/profile mismatch
  завершаются fail-closed;
- тесты используют synthetic extract adapter и не читают клиентскую базу.

Этот snapshot не является вечной гарантией. Перед release audit запускается
повторно, результат и принятое исключение обновляются.

### Stage 13 snapshot — 2026-07-22

- `@sveltejs/adapter-cloudflare` классифицирован как `devDependency`: он
  импортируется только build-time `svelte.config.js`, а Worker получает готовый
  bundle. Release pipeline обязан выполнять полный `npm ci` перед build.
- `fast-xml-parser` в lockfile обновлён до `5.10.1` в пределах разрешённого
  диапазона `mdb-reader`; advisory повторного DOCTYPE закрыт.
- `npm audit --omit=dev` показывает `0 vulnerabilities`.
- Полный `npm audit` отдельно показывает три high advisory в dev-only цепочке
  `wrangler → miniflare → sharp`. Текущие совместимые releases Wrangler/
  Miniflare всё ещё фиксируют `sharp@0.34.5`; предлагаемый `--force` downgrade не
  применяется. Эти инструменты не входят в Worker runtime, но advisory остаётся
  документированным CI/local-tooling риском и проверяется при каждом update.

### Stage 13 snapshot — 2026-08-11

- Clean `npm ci` на immutable `b1a15058c7d41cb226ef34c83e3f6692f8c198d6`
  прошёл; `npm audit --omit=dev` показывал 0, а полный audit обнаружил 7
  исправимых dev-only advisory в SvelteKit, Wrangler/Miniflare, PostCSS и их
  транзитивных зависимостях.
- В изолированном clean clone проверены `@sveltejs/kit@2.70.2`,
  `postcss@8.5.26`, `wrangler@4.120.1`, `miniflare@5.20260804.0-alpha` и
  `@cloudflare/workers-types@5.20260811.1`. Miniflare 5 меняет lower-level
  options API; два прямых вызова мигрированы через официальный
  `convertV4MiniflareOptions`, без изменения D1 behavior.
- Глобальный override `cookie` сужен до транзитивной зависимости SvelteKit:
  SvelteKit получает `cookie@0.7.2`, а `youch` сохраняет совместимую ветку
  `cookie@1.1.1`. `npm ls cookie --all` проходит без dependency conflict.
- Повторный clean `npm ci`, полный `npm audit` и `npm audit --omit=dev` показывают
  0 vulnerabilities. Полный `release:verify` в изолированном clone прошёл:
  check, 46 test files/267 tests, 3 Playwright tests, build, docs и release scan.
  После переноса основной worktree прошёл тот же полный chain и exact preview
  Wrangler dry-run. Candidate зафиксирован как immutable
  `63995f8532f45441885d7e3b042f4092471a8bc3`; повторный clean clone, полный
  audit и `release:verify` прошли. Это закрывает dependency verification, но не
  является production approval.

### Лист ожидания — 2026-11-09

- `fflate@0.8.3` переведён из `devDependencies` в `dependencies`: админ-страница
  цен листа ожидания ([TRIAL_INTAKE_WAITLIST](../domain/TRIAL_INTAKE_WAITLIST.md),
  WL-05) собирает и читает XLSX в Worker runtime. Версия та же, что уже была в
  lockfile; MIT, чистый JavaScript без Node APIs. Чтение ограничено allowlist частей
  архива: `[Content_Types].xml`, workbook и его rels, `sharedStrings.xml` и один
  лист; размер каждой части проверяется до распаковки. Файл с `vbaProject.bin`,
  macro-enabled типом, OLE/CFB-заголовком или повреждённый отклоняется целиком.
- `xlsx`/SheetJS не добавлен. `npm audit --omit=dev` для этого изменения
  выполняется в gate выпуска листа ожидания (этап 06).

Локальный import boundary выбирает поддерживаемый parser после отдельного spike.
Допустимые
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
		"@sveltejs/kit": {
			"cookie": "^0.7.2"
		}
	}
}
```

Причина: использованная версия SvelteKit могла транзитивно тянуть версию
`cookie`, ниже безопасной границы audit. При каждом обновлении SvelteKit нужно
проверить, остается ли scoped override необходимым и совместимым. Он не должен
переопределять независимые зависимости других packages; лишний override удаляется.

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

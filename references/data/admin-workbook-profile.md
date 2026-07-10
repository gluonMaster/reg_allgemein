# Обезличенный профиль Admin XLSM

Локальный файл `references/excel_admin/KindElternDaten_26_Admin.xlsm` проверен
2026-07-10 только неисполняющим OOXML-анализом. Сам файл содержит персональные
данные, игнорируется Git и не является безопасным reference-артефактом.

## Структурный профиль snapshot

Workbook содержит множество worksheets, включая hidden/veryHidden; основной
используемый enrichment-sheet — `PlusBText`. Формул мало относительно объёма
автоматизации: основная логика находится в VBA. Точные operational counts не
публикуются.

Whole-file hash вычисляется локально для import run, но не публикуется: он
идентифицирует приватный content snapshot. Нормальное изменение клиентских
данных создаёт новый hash/import run и само по себе не означает schema drift.
Структурный contract и value-free fingerprints вынесены в
[plusbtext-contract.md](plusbtext-contract.md).

## Разрешённый extract

Для `PlusBText` разрешены только колонки `E/F`, `K/L`, `M`, `N` и `T`.
Declared dimension и AutoFilter читаются из конкретного snapshot, но ни одно из
них не является data bound. Row discovery и join двух независимых блоков задаёт
[source contract](plusbtext-contract.md).

Остальные sheets/columns не читаются импортом и не попадают в dump, fixture,
report либо лог. Allowlist действует даже если библиотека по умолчанию
десериализует весь workbook.

## Macro risk

В workbook находится крупный неподписанный VBA-проект, включая auto-run hooks,
файловые операции и интеграции с Access/Outlook/shell. Поэтому запрещены:

- открытие файла через Excel/COM или LibreOffice automation;
- запуск, импорт или компиляция встроенных макросов;
- доверие hidden/veryHidden sheets как к безопасным;
- публикация полного VBA-проекта или workbook в repository/CI.

Используется только parser, который читает OOXML/BIFF-контейнер без выполнения
макросов и поддерживает field allowlist. Encrypted/unsupported container,
отсутствующий sheet/column или неожиданный schema/hash завершаются fail-closed.

Локальные ignored `references/pricing/vba/SJ_*.bas` — отдельная curated
reference-выборка, а не точная выгрузка VBA из этого workbook; сопоставимые
модули могут структурно отличаться. Из неё нельзя выводить происхождение или
эквивалентность без отдельной сверки.

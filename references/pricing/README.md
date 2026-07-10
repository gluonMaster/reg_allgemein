# Прайс и VBA reference

Локальная рабочая копия может содержать исходный Excel-прайс и curated VBA
modules прежнего процесса. Эти файлы считаются read-only и игнорируются Git:
Office container может хранить author metadata и внешние links, а VBA —
внутренние пути и другие environment-specific значения.

Excel читается только неисполняющим parser по allowlist sheet/header/columns.
VBA не запускается и не переносится целиком: это исследовательский источник,
который содержит в том числе поведение вне MVP.

Публичный репозиторий не зависит от raw workbook или VBA. Канонические правила
расчёта находятся в [PRICING.md](../../docs/domain/PRICING.md), а contract
источника, validation и import lifecycle — в
[DATA_SOURCES.md](../../docs/operations/DATA_SOURCES.md) и
[IMPORT_PIPELINE.md](../../docs/operations/IMPORT_PIPELINE.md). Тестовые
workbook/rows должны быть синтетическими и не содержать реальные реквизиты,
внутренние пути или Office metadata upstream-файла.

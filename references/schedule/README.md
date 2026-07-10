# Экспорты расписания

Локальная рабочая копия может содержать machine-readable JSON snapshot и HTML
для визуальной сверки. Оба файла считаются read-only и игнорируются Git: в них
могут присутствовать имена преподавателей, display-названия групп/занятости,
generation metadata и иные сведения, непригодные для публичного репозитория.

JSON является primary importer input и ожидаемо содержит version/generation
metadata и уникальные schedule blocks с днём, помещением, временем, видом
занятия, предметом, преподавателем и display group. HTML используется только
для ручной визуальной проверки и сравнения структуры; он не заменяет versioned
machine-readable contract.

Публичный репозиторий не зависит от наличия этих raw-файлов. Канонические
правила схемы, validation, staging и promotion находятся в
[DATA_SOURCES.md](../../docs/operations/DATA_SOURCES.md) и
[IMPORT_PIPELINE.md](../../docs/operations/IMPORT_PIPELINE.md). Fixtures должны
быть синтетическими и не воспроизводить реальные имена или исходные строки.

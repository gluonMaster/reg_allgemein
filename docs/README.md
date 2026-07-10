# Документация проекта

Актуально на 2026-07-10. Документация разделена по назначению, чтобы требования,
архитектура и рабочие материалы не конкурировали как источники истины.

## С чего начинать

1. [Спецификация MVP](spec/MVP_SPEC.md) — состав продукта и обязательные
   требования.
2. [Критерии приемки](spec/ACCEPTANCE_CRITERIA.md) — проверяемое определение
   готовности и краевые случаи.
3. Тематический документ из разделов `domain`, `architecture` или `operations`.
4. [Roadmap](implementation/ROADMAP.md) и persistent handoff предыдущего этапа —
   только когда начинается реализация.

Нерешенные бизнес-вопросы собраны в
[OPEN_QUESTIONS.md](spec/OPEN_QUESTIONS.md). Безопасное временное поведение из
этого файла не следует принимать за окончательное решение владельца продукта.

## Карта источников истины

| Тема | Канонический документ |
| --- | --- |
| Состав и границы MVP | [spec/MVP_SPEC.md](spec/MVP_SPEC.md) |
| Приемка и edge cases | [spec/ACCEPTANCE_CRITERIA.md](spec/ACCEPTANCE_CRITERIA.md) |
| Архитектурные границы | [architecture/OVERVIEW.md](architecture/OVERVIEW.md) |
| Целевая D1-модель | [architecture/DATA_MODEL.md](architecture/DATA_MODEL.md) |
| Принятые технические решения | [architecture/DECISIONS.md](architecture/DECISIONS.md) |
| Типы занятий и вместимость | [domain/COURSES.md](domain/COURSES.md) |
| Расчет и пересмотр цены | [domain/PRICING.md](domain/PRICING.md) |
| Договоры и шаблоны | [domain/CONTRACTS.md](domain/CONTRACTS.md) |
| Состояния и пользовательские процессы | [domain/WORKFLOWS.md](domain/WORKFLOWS.md) |
| Обращения, email и Telegram | [domain/MESSAGING.md](domain/MESSAGING.md) |
| Внешние данные | [operations/DATA_SOURCES.md](operations/DATA_SOURCES.md) |
| Импорт и сверка | [operations/IMPORT_PIPELINE.md](operations/IMPORT_PIPELINE.md) |
| Политика зависимостей | [operations/DEPENDENCY_POLICY.md](operations/DEPENDENCY_POLICY.md) |
| Этапы реализации | [implementation/ROADMAP.md](implementation/ROADMAP.md) |
| Стратегия тестирования | [implementation/TEST_PLAN.md](implementation/TEST_PLAN.md) |
| Persistent handoff этапов | [implementation/handoffs/README.md](implementation/handoffs/README.md) |

При конфликте общего документа с тематическим действует тематический документ.
`architecture/DECISIONS.md` объясняет причину решения, но актуальное поведение
всегда определяется спецификацией и `domain/*`.

## `docs` и `references`

`docs/` содержит действующие требования и проектные решения. В tracked-части
`references/` находятся только обезличенные профили и описания локальных
read-only источников. Сами файлы с PII, Office metadata, банковскими реквизитами
или внутренними путями хранятся только в игнорируемой рабочей копии.
Reference-файл не становится требованием сам по себе: найденное поведение нужно
явно зафиксировать в каноническом документе и покрыть тестом.

Локальные операционные промпты допустимы как необязательная помощь агенту и
игнорируются Git. Полный scope каждого этапа должен оставаться воспроизводимым
по roadmap, спецификации, тематическим документам и persistent handoff без
доступа к таким промптам.

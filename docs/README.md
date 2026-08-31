# Документация проекта

Актуально на 2026-08-31. Документация разделена по назначению, чтобы требования,
архитектура и рабочие материалы не конкурировали как источники истины.

## С чего начинать

1. [Спецификация MVP](spec/MVP_SPEC.md) — состав продукта и обязательные
   требования.
2. [Критерии приемки](spec/ACCEPTANCE_CRITERIA.md) — проверяемое определение
   готовности и краевые случаи.
3. Тематический документ из разделов `domain`, `architecture` или `operations`.
4. [Roadmap](implementation/ROADMAP.md) и persistent handoff предыдущего этапа —
   только когда начинается реализация.

Owner/product decisions и ещё не закрытые вопросы отслеживаются в
[OPEN_QUESTIONS.md](spec/OPEN_QUESTIONS.md). На 2026-08-17 открытых owner/data-
вопросов по Access normalization нет; stage 13 и production readiness остаются
`blocked` до закрытия independent legal, security, provider и operational gates.
Statutory release checks конкретной template version описываются в
тематическом legal gate и не подменяются повторным вопросом владельцу.

## Ключевая системная граница

Репозиторий описывает самостоятельное приложение регистрации со своим
deployment, public origin, auth/session, D1 и R2. `kolibri-dresden.de` — внешний
официальный сайт на другой инфраструктуре. Интеграция между ними в MVP
только ссылочная; общий бренд и навигация не означают общую codebase,
базу, сессии или deployment. Подробная граница задана в
[architecture/OVERVIEW.md](architecture/OVERVIEW.md). Любая запись в CMS/файлы
официального сайта или замена его ссылок требует отдельного прямого
поручения.

## Карта источников истины

| Тема                                        | Канонический документ                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Состав и границы MVP                        | [spec/MVP_SPEC.md](spec/MVP_SPEC.md)                                                                 |
| Приемка и edge cases                        | [spec/ACCEPTANCE_CRITERIA.md](spec/ACCEPTANCE_CRITERIA.md)                                           |
| Архитектурные границы                       | [architecture/OVERVIEW.md](architecture/OVERVIEW.md)                                                 |
| Целевая D1-модель                           | [architecture/DATA_MODEL.md](architecture/DATA_MODEL.md)                                             |
| Принятые технические решения                | [architecture/DECISIONS.md](architecture/DECISIONS.md)                                               |
| Типы занятий и вместимость                  | [domain/COURSES.md](domain/COURSES.md)                                                               |
| Расчет и пересмотр цены                     | [domain/PRICING.md](domain/PRICING.md)                                                               |
| Договоры и шаблоны                          | [domain/CONTRACTS.md](domain/CONTRACTS.md)                                                           |
| Privacy, удаление и retention               | [domain/PRIVACY_RETENTION.md](domain/PRIVACY_RETENTION.md)                                           |
| Состояния и пользовательские процессы       | [domain/WORKFLOWS.md](domain/WORKFLOWS.md)                                                           |
| Обращения, email и Telegram                 | [domain/MESSAGING.md](domain/MESSAGING.md)                                                           |
| Внешние данные                              | [operations/DATA_SOURCES.md](operations/DATA_SOURCES.md)                                             |
| Импорт и сверка                             | [operations/IMPORT_PIPELINE.md](operations/IMPORT_PIPELINE.md)                                       |
| Админская сверка повторных импортов         | [implementation/IMPORT_ADMIN_RECONCILIATION_TZ.md](implementation/IMPORT_ADMIN_RECONCILIATION_TZ.md) |
| Политика зависимостей                       | [operations/DEPENDENCY_POLICY.md](operations/DEPENDENCY_POLICY.md)                                   |
| R2 и безопасность uploads                   | [operations/STORAGE_AND_UPLOAD_SECURITY.md](operations/STORAGE_AND_UPLOAD_SECURITY.md)               |
| Канонический production-readiness contract  | [operations/PRODUCTION_READINESS.md](operations/PRODUCTION_READINESS.md)                             |
| Развёртывание портала                       | [operations/PRODUCTION_DEPLOYMENT.md](operations/PRODUCTION_DEPLOYMENT.md)                           |
| Ежедневная эксплуатация и incident response | [operations/OPERATIONS_RUNBOOK.md](operations/OPERATIONS_RUNBOOK.md)                                 |
| Полный ручной preview checkpoint            | [operations/FULL_MANUAL_PREVIEW.md](operations/FULL_MANUAL_PREVIEW.md)                               |
| Краткие действия владельца для preview      | [operations/OWNER_FULL_MANUAL_PREVIEW_GUIDE.md](operations/OWNER_FULL_MANUAL_PREVIEW_GUIDE.md)       |
| Backup, rollback и disaster recovery        | [operations/DISASTER_RECOVERY.md](operations/DISASTER_RECOVERY.md)                                   |
| Текущий production readiness ledger         | [operations/PRODUCTION_READINESS_CHECKLIST.md](operations/PRODUCTION_READINESS_CHECKLIST.md)         |
| Этапы реализации                            | [implementation/ROADMAP.md](implementation/ROADMAP.md)                                               |
| Стратегия тестирования                      | [implementation/TEST_PLAN.md](implementation/TEST_PLAN.md)                                           |
| Stage-13 traceability                       | [implementation/STAGE_13_TRACEABILITY.md](implementation/STAGE_13_TRACEABILITY.md)                   |
| Активный Stage-13 operational checkpoint    | [implementation/STAGE_13_ACTIVE_STATE.md](implementation/STAGE_13_ACTIVE_STATE.md)                   |
| Persistent handoff этапов                   | [implementation/handoffs/README.md](implementation/handoffs/README.md)                               |
| Текущий stage-13 handoff                    | [implementation/handoffs/stage-13.md](implementation/handoffs/stage-13.md)                           |
| Постоянная команда продолжения Stage 13     | [prompts/stage-13-continue-deployment.md](prompts/stage-13-continue-deployment.md)                   |

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

Локальные одноразовые операционные промпты допустимы как необязательная помощь
агенту и игнорируются Git. Исключение — обезличенный постоянный entry-point
Stage 13, который только направляет к tracked operational checkpoint и
каноническим документам. Полный scope каждого этапа должен оставаться
воспроизводимым по roadmap, спецификации, тематическим документам и persistent
handoff без доступа к локальным одноразовым промптам.

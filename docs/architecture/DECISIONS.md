# Реестр архитектурных решений

Запись объясняет причину решения. Актуальное требование находится в документе,
указанном в колонке «Контракт».

| ID | Статус / дата | Решение и последствия | Контракт |
| --- | --- | --- | --- |
| `ADR-001` | Accepted, 2026-07-09 | Новый портал развивается в отдельном репозитории. Старый deployment не изменяется; из него берутся только reference-паттерны. | [OVERVIEW.md](OVERVIEW.md) |
| `ADR-002` | Accepted, 2026-07-09 | D1 — runtime source of truth. Access/Excel/schedule читаются только локально и публикуются версионируемым импортом. | [IMPORT_PIPELINE.md](../operations/IMPORT_PIPELINE.md) |
| `ADR-003` | Accepted, 2026-07-10 | Локальный `group_occupancy_snapshot.json` используется как основной schedule contract: в снимке есть schema/generation metadata и уникальные block IDs. HTML — визуальная проверка. Название файла не означает, что он содержит фактическую occupancy; operational counts не публикуются. | [DATA_SOURCES.md](../operations/DATA_SOURCES.md) |
| `ADR-004` | Accepted for MVP, 2026-07-10 | Одна legacy-family/child имеет один owning parent account. Конфликт claim идет в ручную проверку; shared guardian access отложен. | [MVP_SPEC.md](../spec/MVP_SPEC.md) |
| `ADR-005` | Accepted, 2026-07-10 | Одинаковые display names расписания не объединяются автоматически. По умолчанию source block — отдельное offering; объединение выполняется явным mapping. | [COURSES.md](../domain/COURSES.md) |
| `ADR-006` | Accepted, 2026-07-10 | Public price quote ориентировочный. Contract offer повторно вычисляет условия и фиксирует immutable snapshot/hash. | [PRICING.md](../domain/PRICING.md) |
| `ADR-007` | Accepted, 2026-07-10 | Автоматический discount из VBA notes не переносится. `Sonderpreis` хранится как отдельный price mode и назначается только администратором до отдельного бизнес-решения. | [PRICING.md](../domain/PRICING.md) |
| `ADR-008` | Accepted, 2026-07-10 | Email и Telegram выполняются через transactional outbox. Ошибка провайдера не откатывает сохраненное доменное действие. | [MESSAGING.md](../domain/MESSAGING.md) |
| `ADR-009` | Accepted, 2026-07-10 | Изменение occupancy создает batch и отдельные price review items на enrollments; согласие и индивидуальная цена не хранятся на уровне группы. | [PRICING.md](../domain/PRICING.md) |
| `ADR-010` | Accepted for MVP, 2026-07-10 | Idempotency records, rate-limit buckets и promotion/cron locks хранятся в D1 с conditional writes, leases и fencing tokens. Sensitive endpoints fail closed при недоступности guard storage. Durable Objects не требуются для исходного MVP, но могут заменить реализацию без смены доменных контрактов. | [DATA_MODEL.md](DATA_MODEL.md) |
| `ADR-011` | Accepted, 2026-07-10 | Browser/e2e-инструмент — Playwright. Этап 01 добавляет test harness и минимум один smoke; последующие этапы расширяют критические пути. | [TEST_PLAN.md](../implementation/TEST_PLAN.md) |
| `ADR-012` | Accepted, 2026-07-10 | Word-образцы договоров остаются operational business sources и не конвертируются в runtime. Отправка использует только собственную approved versioned HTML/CSS template, валидированный render input и versioned PDF adapter с immutable source/PDF hashes; byte-identical rerender не обещается. | [CONTRACTS.md](../domain/CONTRACTS.md) |
| `ADR-013` | Accepted, 2026-07-10 | Admin XLSM остаётся локальным ignored source: только non-executing allowlisted extract. Office automation, embedded VBA и полный workbook dump запрещены; curated `SJ_*.bas` не считается точной копией workbook. | [DATA_SOURCES.md](../operations/DATA_SOURCES.md) |
| `ADR-014` | Accepted for MVP, 2026-07-10 | Production contract PDF создаётся Cloudflare Browser Run Quick Action `/pdf` через Workers binding из self-contained inline HTML/CSS/fonts. Free quota подходит малому объёму Verein; вводятся usage cap/retry/manual review. Managed Chromium нельзя pin, поэтому accepted PDF и source bundle сохраняются immutable и никогда не перерендериваются; byte-identical rerender не обещается. Release требует remote conformance spike и Cloudflare DPA/processing check. | [CONTRACTS.md](../domain/CONTRACTS.md) |

Непринятые продуктовые решения хранятся не здесь, а в
[OPEN_QUESTIONS.md](../spec/OPEN_QUESTIONS.md).

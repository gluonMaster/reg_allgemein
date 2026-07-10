# References

В публичной части этой папки находятся только обезличенные профили и описания
локальных read-only источников. Исходные Office/Access-файлы, экспорты,
reference-код и артефакты с PII, служебными metadata, банковскими реквизитами
или внутренними путями игнорируются Git и не требуются для чтения публичной
спецификации.

## Публичные reference-материалы

- `data/datamodel.md` — позиционная семантика legacy-полей `Value*`;
- `data/access-schema-profile.md` — обезличенный профиль Access-таблицы и row
  identity;
- `data/admin-workbook-profile.md` — обезличенный профиль Admin workbook,
  allowlist и macro-risk boundaries;
- `data/plusbtext-contract.md` — value-free правила discovery, join, ambiguity и
  structural fingerprint для `PlusBText`;
- [pricing/README.md](pricing/README.md) — manifest локального прайса и VBA
  reference;
- [schedule/README.md](schedule/README.md) — manifest локальных экспортов
  расписания;
- [vorlage/README.md](vorlage/README.md) — manifest четырёх действующих
  операционных образцов договоров.

Нормализованные требования находятся в `docs/spec`, `docs/domain`,
`docs/architecture` и `docs/operations`. Reference-файл или обнаруженное в нём
поведение не становится правилом системы, пока оно не зафиксировано в
каноническом документе и тесте.

## Только локальные источники

В игнорируемой рабочей копии могут находиться:

- клиентские Access/XLSM и другие Office-файлы;
- исходные прайс, VBA и экспорты расписания;
- четыре Word-образца договоров;
- выборочные файлы прежнего приложения для изучения технических подходов.

Они считаются read-only upstream, не попадают в Git, CI, Worker, build output
или диагностические логи. Office-файлы читаются только неисполняющим parser с
явным allowlist; macro/VBA, Excel/COM и LibreOffice запускать нельзя. Значения
клиентов, контакты, банковские реквизиты и внутренние пути нельзя переносить в
fixtures, документацию или отчёты.

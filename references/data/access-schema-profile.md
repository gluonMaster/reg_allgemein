# Обезличенный профиль Access `tblKartei`

Проверено 2026-07-10 по локальному
`KindElternDaten_26_front.accdb`. Документ содержит только schema и агрегированные
проверки, без клиентских значений.

## Таблица и поля

В базе присутствуют `tblKartei`, `pre_tblKartei`, `decl_tblKartei`. Для MVP
источник — `tblKartei`.

Schema `tblKartei`:

- `ID` — integer;
- `Value1`–`Value52` — text;
- `InteriorColor1`–`InteriorColor51` и отдельные `FontColor*` — технические
  formatting fields, не входят в MVP extract.

Фактический порядок Access columns чередует `ValueN` и `InteriorColorN`, поэтому
импорт обязан обращаться по именам полей, а не по ordinal position.

## Проверка identity

В проверенном приватном snapshot `ID` заполнен и уникален внутри периода,
`Value48` заполнен, но среди его значений обнаружены mismatch и duplicate.
Точные operational counts намеренно не публикуются.

Следствие: source row key — Access `ID` в source namespace и academic period.
Стабильность `ID` между периодами не предполагается. `Value48` является
контрольным зеркалом Excel `AV/ID`; mismatch/duplicate должен попасть в import
issue и не должен молча заменить `ID`.

## Семантический crosswalk

Смысл `ValueN` основан на синхронизированной позиционной модели Excel `Kartei`
из [datamodel.md](datamodel.md): `Value1` соответствует колонке A, `Value2` — B
и т. д. Это не отменяет runtime schema validation каждого snapshot.

Обязательные для MVP поля:

```text
ID
Value1, Value2, Value4, Value5, Value6, Value7, Value8, Value9
Value15, Value16, Value17, Value18, Value19, Value20
Value42, Value43, Value44, Value45, Value46
Value48 (control mirror)
```

При отсутствии/переименовании поля importer завершается до staging/promotion.

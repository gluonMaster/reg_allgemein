# Исходники HTML-экспорта расписания

Этот небольшой source mirror относится к `trial-intake` (TIN-01/06), а не к CMS.
Рабочая установка: `C:\path\to\schedule-editor`.
В Git находятся изменяемые исходники, три небольших неизменённых зависимости
и synthetic regression. Office-файлы, рабочий `config.json`, созданный HTML,
локальные пути публикации и резервные копии сюда не входят.

## Штатный путь

`gui_services/app_actions.py::_run_visualiser_command` запускает
`visualiser/example_usage_enhanced.py --lesson-type …`. Этот entry point вызывает
`schedule_visualizer_enhanced.main(..., export_html=True)`, затем
`EnhancedExportManager.export_to_html`. Эту же команду вызывает полный pipeline
после работы с веб-редактором и оптимизатором. Чтение исходных таблиц и PDF-ветки
сохраняют своё прежнее поведение; в тесте они заменены синтетическими границами.

При **каждом** вызове HTML-экспорт читает секцию `trial_intake` существующего
корневого `config.json`, относительно расположения модуля, независимо от cwd:

```json
{
  "trial_intake": {
    "portal_origin": "",
    "cta_enabled": false
  }
}
```

Это только добавляемая секция: остальные ключи рабочего config сохраняются.
`portal_origin` впоследствии получает проверенный HTTPS origin портала без пути,
query и credentials. До выпуска `cta_enabled=false`: каталог уже создаётся,
ссылок нет. После отдельного release gate оператор сохраняет origin и включает
флаг, затем штатно экспортирует и публикует результат. Повторный экспорт читает
сохранённую настройку без ручного патча HTML. Существующее сохранение конфигурации
редактора сохраняет неизвестные ему ключи.

Каталог и карточка строятся из одной нормализованной модели; внешний цикл передаёт
настоящий день, в том числе для субботних подколонок. Неполная публичная group-строка
останавливает HTML-экспорт с обезличенной диагностикой. Ошибка распространяется
вверх через обычный entry point, поэтому старый HTML нельзя принять за успешный
новый экспорт. Цвета, поиск, темы, машинные ключи зданий и источники не меняются.

## Проверка и перенос

```powershell
python -X utf8 integrations/schedule-exporter/test_exporter.py
npx vitest run tests/unit/trial-intake/exporter-roundtrip.test.ts
```

Тест проходит реальную цепочку `main → EnhancedExportManager → export_to_html`
на synthetic данных: CTA off/on, сохранённые настройки, изменение занятия и
повторный экспорт, обе building keys, субботние колонки, NFC/hash, escaping,
dedupe, исключение скрытых/индивидуальных строк и отказ при неполном контексте.
Vitest дополнительно читает результат настоящим portal reader.

В рабочую установку переносятся только:

- `visualiser/enhanced_export_manager_html.py`;
- `visualiser/schedule_visualizer_enhanced.py`;
- `visualiser/example_usage_enhanced.py` (ненулевой exit code при ошибке);
- секция `trial_intake` в существующем `config.json`.

Перед переносом исходные три `.py` и config сохранены одной копией в
Git-ignored `tmp/trial-intake-exporter-backup/`. Diff и контрольные хеши помещаются
в `tmp/trial-intake-exporter-evidence/`. Не перезаписывать backup повторным запуском.
Для локального rollback восстановить эти четыре исходных файла из backup.
Не переносить три поддерживающих модуля, тесты или пример config поверх рабочей
установки. Публикация готового расписания выполняется отдельно, по шагу 03/04.

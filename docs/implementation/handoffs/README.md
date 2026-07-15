# Persistent handoff между этапами

История чата не является хранилищем состояния реализации. Завершённый этап
создаёт файл `stage-NN.md` в этом каталоге по [TEMPLATE.md](TEMPLATE.md); для
промежуточного этапа используется `stage-06a.md`. Статус этапа и production
readiness различаются: `done` не снимает внешний release gate и не разрешает
production-операцию.

## Протокол этапа

Перед началом:

1. убедиться, что существует Git `HEAD` (`git rev-parse --verify HEAD`);
2. если baseline commit отсутствует, остановиться и запросить разрешение на его
   создание — не коммитить весь untracked repository молча;
3. записать branch/HEAD и исходный `git status --short`;
4. прочитать handoff предыдущего этапа;
5. перевести свой status в `ROADMAP.md` в `in_progress`.

При завершении:

1. заполнить `stage-NN.md` фактическими изменениями и результатами команд;
2. записать migration IDs, новые contracts/interfaces, known failures и
   prerequisites следующего этапа;
3. перечислить затронутые release gates отдельно от owner/product OQ; для
   каждого использовать только `passed`, `feature_disabled` или `blocked` и
   указать affected path/flag, evidence, owner/next action;
4. записать environment/binding changes, migration/rollback compatibility,
   feature flags и версии/rehearsal operator docs без secret values;
5. приложить итоговый `git status --short` и review diff summary;
6. перевести roadmap status в `done` только после обязательных gates этапа;
7. подготовить один логический commit. Сам commit создаётся только когда
   пользователь явно разрешил commit в текущем задании.

Если работа остановлена, status становится `blocked`, а handoff фиксирует
конкретный blocker и безопасное состояние. Handoff не содержит secrets, PII,
полных source rows или document bodies.

`feature_disabled` допустим только когда production path действительно
fail-closed, его выключение проверено и оставшийся scope честно указан. Он не
равен `passed` и сам по себе не позволяет назвать полный MVP production-ready.
Этап 13 ведёт полный реестр по каноническому
[production-readiness contract](../../operations/PRODUCTION_READINESS.md) и
ссылается на tracked operator runbooks и результаты rehearsal.

Ветки не навязываются документацией: существующая стратегия пользователя имеет
приоритет. Нельзя включать в stage commit чужие/предшествующие изменения только
ради чистого status.

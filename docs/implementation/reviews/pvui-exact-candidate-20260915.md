# PVUI-01–07: независимый review кандидата

**Вердикт: NO-GO для публикации этого кандидата в preview.**
Проверен `d58f9db54bede6cdf8f7cc21da93b23a6de37c72` относительно
`dbbaf21424e9798e8cdf56d373886e288e98fd40`: оба UI-коммита после опубликованного
UI-01. Начальное рабочее дерево чистое. Review выполнен 2026-09-15 новой сессией
Codex, не реализовавшей пакет; без subagents и второго человека.

Ближайший milestone — пригодный для ручной проверки synthetic preview по
`SYS-04`/`OQ-036`, текущий scope — UI-пакет PVUI. Найден **один P1** и один
неблокирующий P2. P0 на рассмотренных путях не обнаружен. Исторический GO для
`117a9356346c4489f6d74f50af984e5f39601992` к этому новому diff не применяется.

## R1 — P1: подтверждение переходит на другое занятие

Источник: [admin catalog](../../../src/routes/admin/catalog/+page.svelte),
строки 47 и 72–75; аналогичная конструкция mapping queue — строки 154 и 165–168.
Новые enhanced forms вызывают `update({ reset: false })` и после успеха;
списки не имеют ключа по identity объекта.

В Chromium на неизменённом runtime и существующем изолированном E2E seed:

1. Admin открывает `/admin/catalog?status=draft`, где два занятия.
2. У первого выбирает `hide`, вводит причину, отмечает подтверждение и отправляет.
3. Сервер возвращает успешный action; в выборке остаётся одно, другое занятие.
4. У оставшейся формы скрытый `courseGroupId` уже другой, но `hide`, причина
   предыдущего решения и отмеченный checkbox подтверждения сохранены.

Все четыре postconditions подтверждены `course-after-safe.json`. Assertion,
что подтверждение не переносится на другой объект, падает: expected false,
actual true. Это позволяет отправить решение для нового target с подтверждением,
данным предыдущей записи. Серверные RBAC/CSRF не проверяют намерение оператора;
при обновлении layout также выдаётся новый command key. Второй submit в review
не выполнялся. Аналогичный эффект mapping queue установлен по коду, отдельным
успешным mapping-сценарием не подтверждался.

Нарушены сохранность admin flow и подтверждений (`ADMIN-03`, PVUI-06).
До публикации нужны привязка состояния форм к стабильному ID и сброс после
успеха; сохранение ввода при ошибке должно относиться к тому же объекту.
Регрессия должна проверять успешное удаление строки из фильтра и состояние
соседней формы, включая её подтверждение. Это блокер текущего UI milestone.

## R2 — P2: смена языка заменяет отредактированный запрос договора

Источник: [messages](../../../src/routes/messages/+page.svelte), строки 13–15.
На `/messages?course=…` родитель меняет тему и текст, затем переключает DE → RU.
Оба поля заменяются новым локализованным предзаполнением: собственные правки
теряются. Chromium подтвердил `subjectRetained=false`, `messageRetained=false`;
business submit для этой проверки не выполнялся.

`$derived` зависит от заново загруженного `data.contractInquiry`. Для правок
пользователя требуется отдельное состояние, которое смена locale не заменяет.
Это ограниченный дефект черновика (PVUI-04/07, `CAT-03`/`UI-01`): язык можно
выбрать до ввода, сам путь отправки не заблокирован. P2 записан в backlog и
сам по себе не открывает новый review-loop.

## Проверки и ограничения

- Все **397/397** файлов manifest шага 05 совпадают с текущим кандидатом.
  SHA-256 manifest: `5525db6edfabd462f87f352a69b1a9ab824f3f1d077ce550aee9563e053d4401`.
  Migrations, dependencies, toolchain и deploy config в UI diff не менялись.
- Переиспользован [полный gate шага 05](../handoffs/stage-13.md#pvui-prompt-05):
  623 исполняемых Vitest tests после документированных focused reruns,
  1 ожидаемый Windows skip; 38 разных Chromium scenarios после focused
  completion; check 0/0, успешный build. Логи проверены: первоначальные пять
  timeout и два E2E failure не представлены как зелёный единичный запуск.
- В review выполнены **44/44 unit tests**: `portal-shell`, `cabinet-ui`,
  `catalog-contract-entry`, `parent-product-route-security`, `admin-console`,
  `i18n`, с `--maxWorkers=1`.
- Дополнительные **два Chromium regression assertions упали**, воспроизведя
  R1/R2. Они не входят в прежние 38 scenarios. Две подготовительные попытки
  останавливались до submit на скрытом после hydration элементе; финальный
  тест явно ждёт `data-enhanced=true`. Эти setup timeouts не являются R1/R2.
- Выборочно осмотрены сохранённые desktop/mobile screenshots 02–05: кабинет,
  каталог, запрос договора RU, настройки, admin catalog и contract editor.
  Проверены diff оболочки/401/403/cache, ownership/CSRF consumers, read-only
  prefill, child feedback, даты/статусы и сохранность form action payload.
- Полные Vitest/E2E/check/build повторно не запускались: exact runtime совпал
  с manifest, новая проверка ограничена выявленным пробелом. Dependency audit
  и deploy dry-run не запускались: dependency/config diff отсутствует,
  публикация не поручена. Финальные docs gates: `docs:check`, `release:scan`,
  `git diff --check`.

Ignored evidence: `tmp/pvui-independent-review-20260915/` — `integrity-safe.json`,
`focused-unit.log`, `reproduction-final.log`, `reproduction.spec.ts`,
`course-after-safe.json`, `inquiry-language-safe.json` и два сохранённых trace ZIP.
Regression spec временно запускался через штатный E2E wrapper из `tests/e2e/`,
затем перенесён в evidence; runtime, seed и tracked tests не изменены.
Harness использует отдельную локальную D1, `remoteBindings: false`, synthetic
auth, fake email, выключенные Telegram/renderer/scheduler. Remote reads/writes,
deploy, provider sends, изменения production и официального сайта — ноль.

**Единственный следующий шаг:** локально исправить R1 и проверить affected
admin flow нового кандидата. Публикация следует только после устранения P1
и отдельного поручения владельца. `full-manual-preview`, Telegram и production
gates этим review не закрываются. `rollover_required: no`,
`recommended_next_session_mode: High`: причина локализована, нужен обычный
UI fix без неопределённости remote state или recovery.

## Последующее исправление — 2026-09-15

По отдельному поручению владельца R1/P1 и R2/P2 исправлены в рабочем дереве
поверх проверенного SHA. [Handoff исправлений](../handoffs/stage-13.md#pvui-review-fixes)
содержит manifest нового локального candidate, изменения и focused evidence:
check 0/0, 12 unit tests, 6 разных affected Chromium scenarios после test-only
completion и успешный build. Это проверка исправлений тем же агентом;
исходный независимый вердикт выше относится только к неизменённому `d58f9db`.
Публикация preview не выполнялась и требует отдельного поручения.

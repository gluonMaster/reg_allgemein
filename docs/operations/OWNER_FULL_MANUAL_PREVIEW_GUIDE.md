# Краткая инструкция владельца: full manual preview

Цель — за короткие контролируемые фазы получить рабочий Access-protected preview
на синтетических данных. Production, официальный сайт, реальные Office/PII
sources и реальные клиенты не входят в эти действия.

Текущий candidate, deployed version и одно следующее действие всегда смотрите в
[STAGE_13_ACTIVE_STATE.md](../implementation/STAGE_13_ACTIVE_STATE.md). Не
принимайте их из roadmap, большого handoff, readiness checklist или старого чата.

## Как начать сессию

Откройте сессию в корне repository и отправьте:

```text
Выполни docs/prompts/stage-13-continue-deployment.md.
Текущую operational truth бери только из
`docs/implementation/STAGE_13_ACTIVE_STATE.md`. Большой handoff читай лишь по
точной evidence-ссылке. Production, CMS, официальный сайт и реальные PII/Office
sources не трогать. Сначала назови ровно одно next_atomic_action, exact target
class, необходимые preconditions, bounded postcondition и containment. Remote
mutation без отдельного разрешения не выполняй.
```

Для обычного известного deploy-маршрута используйте reasoning **High**. `Max`
нужен только при доказанном риске wrong target, corruption, authorization bypass,
secret exposure, необратимой ambiguous mutation или отказе recovery/rollback.

## Как дать ограниченное разрешение

После того как агент сверил active state и protected target record, используйте
универсальный permission prompt:

```text
Разрешаю выполнить только текущее `next_atomic_action` из
`docs/implementation/STAGE_13_ACTIVE_STATE.md`, и только если все перечисленные
там preconditions подтверждены read-only и production/CMS/real-PII targets
исключены. После одной попытки выполни ровно указанный bounded postcondition,
обнови active state отдельным docs-only checkpoint и остановись перед любым
следующим remote write. Failed/ambiguous result не ретраить вслепую.
```

Это разрешение не распространяется на следующий deploy/migration, registration,
bootstrap, secret/flag/Access change или provider send.

## Что должно быть после каждой mutation

До следующего разрешения агент сообщает:

- что именно пытался изменить и фактический `success|failed|ambiguous`;
- bounded read-only postcondition, а не только exit code;
- rollback/containment;
- ровно одно следующее действие;
- `rollover_required` и рекомендуемый режим следующей сессии.

Проверяйте, что обновлён только active state. Большой handoff нужен на границе
фазы/сессии, production checklist — только при изменении production gate.
Docs-only checkpoint не требует полного runtime suite или нового review.

## Ручной owner pass после account/bootstrap

Для Telegram в отдельном закрытом preview искать второго человека не нужно:
владелец подтверждает выбранного бота и группу, агент проверяет фактические
настройки и сохраняет техническое evidence по разделу 3.1
[runbook](OPERATIONS_RUNBOOK.md). Это подготовка подключения. Затем владелец
проверяет обычный путь: обращение из кабинета родителя сохраняется сразу,
уведомление вне рабочих часов остаётся в очереди и автоматически доставляется
после начала следующего рабочего окна. Правило времени задано в
[MESSAGING.md](../domain/MESSAGING.md); технический one-message smoke сам по себе
не доказывает этот пользовательский сценарий и готовность автоматической очереди.

Используйте разные browser profiles для parent и admin и пройдите:

1. registration, verification, login/logout, password reset;
2. child, catalog, trial, request, cabinet и negative cross-owner/RBAC/CSRF;
3. admin decisions, enrollment/price review, support/absence/privacy;
4. synthetic document: quarantine download → локальный AV → hash attestation →
   отдельный business decision → owner/negative download → cleanup;
5. четыре marked preview PDF через Browser/R2/email; один accept → formation →
   activation → certificate;
6. один PII-free Telegram normal-outbox message, визуально ровно один раз;
7. desktop/mobile layout, немецкие тексты, keyboard navigation и zoom.

Пароли, OTP, verification links, cookies, tokens, email values, document body и
Telegram secret/destination не передавайте в чат или Git. Для AV сообщайте только
product/version, время и `clean|detected`.

## Как сообщить дефект

```text
Где: <страница/действие>
Ожидал: <результат>
Получил: <результат>
Время: <Europe/Berlin>
Correlation ID: <если показан>
```

Перед следующим action исправляются только доказанные milestone `P0/P1`.
Косметика и robustness без отказа текущего flow идут в backlog.

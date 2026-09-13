# UI-01: проверка публикации русского UI

**Вердикт: GO** для публикации UI в существующий Access-protected preview.
Проверен exact candidate `117a9356346c4489f6d74f50af984e5f39601992`
относительно `510a3714c5d4f2d519b6fcc4de69acd5f8fa39c7`.
Проверку выполнила новая сессия Codex, не реализовавшая этот diff;
это отдельная проверка кода агентом, без второго человека или subagent.
Исторический Telegram 9A GO не использован как вердикт для UI.

Ближайший результат — опубликованный немецкий/русский UI по UI-01/OQ-007.
Блокирующих P0/P1 в рассмотренных изменениях не обнаружено.

Проверены locale cookie/SSR/layout, public route переключателя, Origin и
same-origin return path, сохранение RBAC/owner/CSRF guards, экранирование
HTML отказов, server action feedback и непосредственные read-model consumers.
Компонент EvidenceText сохраняет немецкий оригинал; versioned business
constants, outgoing provider templates, form action values и idempotency
остаются прежними. Проверены Turnstile language remount и браузерные сценарии
сохранения заполненной формы, no-JS, parent и 16 admin разделов.
Это ограниченный release review, не новый полный product/legal audit.

Унаследован полный gate exact candidate из
[handoff UI-01](../handoffs/stage-13.md) (секция локальной реализации 2026-09-13):
600 исполняемых unit/integration tests имеют успешный результат после
описанных focused reruns, один ожидаемый Windows skip, 28/28 Chromium E2E,
check без errors/warnings. Финальный локальный E2E marker также `passed`.
Повторный полный suite/check/E2E не нужен: runtime после этого gate не менялся.

В этой сессии выполнены 17/17 focused tests (`i18n`, `ui-language-route`,
`login-role-redirect`), новый build и strict Wrangler dry-run для actual config.
Module SHA-256: `26d6bfcddc953cced2d758256bef57bc9fadd204b78580ce72d21e69d00e8c8c`.
Dependency install/audit не повторялись: dependency/toolchain diff отсутствует.

Fresh read-only preflight: exact target fingerprints совпали; действующая
версия и module совпали с 09B; 62 vars, bindings/secrets, Cron и Access
сохранены; 26 migrations, pending 0; root 200 и health HEAD 204;
invalid Access credential отклонён; предыдущая версия доступна для rollback.
104 D1 rows read, zero writes. Отложенная Telegram row остаётся retry до
понедельника, без unresolved unknown. Эта публикация не закрывает её receipt gate.

Разрешение — прямое поручение владельца от 2026-09-13 опубликовать русский UI
в preview. Одна code-only deployment operation; сохранение actual configuration.
После попытки обязательно actual module/version/traffic/settings/schema/UI
read-back и docs-only checkpoint. При неоднозначности — read-only reconciliation,
без слепого повторения. Rollback target — захваченная совместимая предыдущая
версия; D1/R2 не откатываются.

Protected evidence: `tmp/ui01-preview-20260913/before-safe.json`,
`before-control.json`, `before-rollback.json`, `before-database.json`,
`before-smoke.json`, `package-safe.json`; build log `tmp/ui01-build.log`.
Текущий operational cursor находится только в
[active state](../STAGE_13_ACTIVE_STATE.md).

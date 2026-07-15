# Handoff этапа 04: courses, occupancy и pricing engine

Статус: `done`

Production readiness: `feature_disabled`

## Baseline

- Branch: `master`.
- Start HEAD: `464af66f61afd0ab58d973b54a576ef4e7264fd5`.
- Initial `git status --short`: clean.
- Предыдущий handoff: `docs/implementation/handoffs/stage-03.md`, status
  `done`; current promoted price/schedule/PlusBText/legacy projections приняты
  как prerequisites без повторного чтения upstream-файлов.

## Выполнено

- Requirement/acceptance IDs: `CAB-02`, `CAB-03`, `CAT-01`, `CAT-04`,
  `CONTRACT-10`, `PRICE-01`–`PRICE-04`, `REL-01`;
  `ACCEPTANCE_CRITERIA.md` разделы 3A, 5 и 6.
- Изменённые компоненты: D1 pricing/occupancy schema; сохранение точного
  `duration_status` из PlusBText в legacy projections; allowlisted
  normalization; pure pricing/repricing decisions; explicit mapping и pricing
  profile admin repository; date-aware occupancy repository; quote persistence,
  revalidation и repricing service; validated runtime config; German fallback
  message; synthetic unit/D1 integration tests.
- Migration ID: `0004_courses_occupancy_pricing.sql`. Добавлены
  `course_source_mappings`, `course_pricing_profiles`, `enrollments`,
  append-only `price_manual_overrides`, immutable-decision `price_quotes`,
  индексы и deduplicated open pricing review tasks. Применённые migrations
  `0001`–`0003` не переписывались.
- Публичные server-side interfaces для следующих этапов:
  `parsePublicQuoteRequest`, `PricingService.createPublicQuote`,
  `PricingService.revalidateQuote`, `PricingService.calculateRepricing`,
  `OccupancyRepository.activeChildrenCount`, `calculateGroupPrice`,
  `calculateNonGroupPrice`, `quoteLookupChildrenCount`,
  `repricingLookupChildrenCount`, `occupancyRepricingDecision`,
  `buildRepricingProposals` и `sumConfirmedMonthlyGroupBasePrices`.
  HTTP route/UI намеренно ещё отсутствуют.
- Admin-only interfaces: `confirmCourseMapping`, `configureCoursePricing`,
  `ensureMappingReviewTasks`, `confirmEstimatedQuote` и `applyManualOverride`.
  Они требуют typed admin actor, непустую причину и отдельное подтверждение;
  override дополнительно сверяет base/rule/version/source с опубликованным
  pricing context, сохраняет immutable evidence и audit.
- Decision codes: success/estimate — `EXACT_RULE`,
  `ESTIMATED_MISSING_DURATION`, `INDIVIDUAL_CONFIGURED_RATE`,
  `NACHHILFE_FIXED_RATE`; review/block — `GROUP_NACHHILFE_MANUAL_ONLY`,
  `UNKNOWN_OR_AMBIGUOUS_MAPPING`, `UNKNOWN_LESSON_KIND`,
  `UNKNOWN_CONTRACT_KIND`, `MISSING_PRICE_VERSION`, `MISSING_PRICE_KEY`,
  `MISSING_PRICE_RULE`, `AMBIGUOUS_PRICE_RULE`, `INVALID_PRESENT_DURATION`,
  `AMBIGUOUS_DURATION`, `UNRESOLVED_DURATION`,
  `MISSING_DURATION_REPRICING_BLOCKED`,
  `INVALID_MANUAL_OVERRIDE_EVIDENCE`; repricing control —
  `NO_ACTIVE_CHILDREN`, `LOOKUP_COUNT_UNCHANGED`.
- Pricing semantics: exact key + ordered subject-duration vector + count lookup;
  `Preis`/yearly и `Sonderpreis`/monthly сохраняют `rule_derived` mode;
  quote использует `min(active + 1, 6)`, repricing — `min(active, 6)` или no
  lookup при zero. Capacity не влияет на price cap.
- Единственный fallback применяется только к blank `PlusBText!T` при полностью
  однозначном group context: default 90 минут, 4600/6000 cents как месячная
  цена weekly service, `estimated_missing_duration` и обязательное admin
  confirmation. Source `T` остаётся `null`; invalid/ambiguous/present context
  fallback не получает. До подтверждения estimate исключается из total,
  repricing и offer boundary.
- Individual tariff читается из config с default 3000 cents/45 минут; funded
  Nachhilfe фиксирован 3000 cents/45 минут и помечен `parentPayable = false`.
- Quote state transitions: `quoted|needs_admin_review|needs_admin_confirmation`
  -> `confirmed` только для подтверждённого estimate; expiry либо изменение
  occupancy/price/schedule/PlusBText/profile dependency -> `stale`.
  Decision snapshot и dependencies неизменяемы.
- Golden fixture coverage: `3Jahrige`/`4Jahrige`, number-letter class keys,
  `Ru/Fremd.`, Baby/Gitarre/Kunst/Musik/Theater, Mathe Abakus/Soroban,
  Ukrainian keys, subject aliases и намеренно unresolved Tanz Ukr/Nachhilfe/
  individual/unknown. VBA `SIMILAR`, scaling, component sum, automatic discount
  и другие непринятые branches не портированы.
- Гарантии для этапов 06/07/09/10: claimed children можно считать через единый
  distinct legacy+portal occupancy boundary; catalog может создавать только
  server-derived, expiring quote; contract обязан revalidate snapshot и не
  использовать неподтверждённый estimate; price review получает расчётные
  proposals без auto-apply/notification и сохраняет manual overrides.
- Environment/binding/config changes без secret values:
  `INDIVIDUAL_PRICE_CENTS_PER_45_MIN`, `GROUP_DURATION_FALLBACK_MINUTES`,
  `MISSING_DURATION_YEARLY_CENTS_PER_45_MIN`,
  `MISSING_DURATION_MONTHLY_CENTS_PER_45_MIN`, `PRICE_QUOTE_TTL_SECONDS`.
  Defaults: `3000`, `90`, `2300`, `3000`, `86400`; integer/multiple-of-45
  validation fail-closed.
- Feature flags и fail-closed production paths: public/admin HTTP routes ещё не
  подключены, поэтому engine недоступен извне; unknown/ambiguous data создают
  review/no-price, а не догадку. Production deploy/migration не выполнялись.
- Migration/rollback/restore compatibility: clean in-memory D1 применяет
  immutable `0001`–`0004`; append-only override evidence и quote decision
  защищены triggers. Remote migration, backup/restore rehearsal и local
  persisted D1 reset не выполнялись.

## Проверки

| Команда/сценарий             | Результат                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`              | passed; `svelte-check found 0 errors and 0 warnings`                                                                                                                                   |
| `npm test`                   | passed; 15 files, 99 tests                                                                                                                                                             |
| `npm run build`              | passed; Cloudflare adapter build завершён                                                                                                                                              |
| `npm audit`                  | passed; 0 vulnerabilities                                                                                                                                                              |
| Golden normalization         | passed; 19 allowlisted и intentionally unresolved cases                                                                                                                                |
| Pure pricing/repricing       | passed; 14 tests, включая exact/ambiguous/fallback/config payload/count cap/manual evidence/non-group/total                                                                            |
| D1 mapping/occupancy/quote   | passed; explicit reviews/mappings, legacy-package и portal dedupe, future date, transition race, yearly/monthly repricing, immutable quote/revalidation, override и confirmation audit |
| Forbidden-branch diff review | passed; непринятые VBA calculation branches отсутствуют                                                                                                                                |

## Не выполнено и риски

- Открытые вопросы/OQ: открытых owner/product OQ нет; закрытые решения
  `OQ-001` и `OQ-006` применены без восстановления старых fallback-ветвей.
- External/legal/operational release gates, не являющиеся OQ: реальные approved
  Access/PlusBText/price/schedule sources не читались на этом этапе; production
  resources/secrets/origin, remote migration и backup/restore не проверялись.
- Known failures: обязательные проверки проходят; известных code/test failures
  нет.
- Сознательно вне scope: auth/RBAC route wiring и high-friction admin UI,
  catalog/quote HTTP UI, contract offer, price review batches/items,
  notifications/auto-apply, billing, production deploy/import и любые изменения
  official site.
- До этапов 05/06A admin actor является repository boundary, а не заменой
  session/RBAC: будущий route обязан получать его только из серверной auth-
  сессии. Mapping/profile требуют явной admin конфигурации; unknown и conflicts
  остаются review tasks.

## Release gates

| Gate                                  | Статус             | Affected path/flag                  | Evidence                                                      | Owner / next action                                 |
| ------------------------------------- | ------------------ | ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Stage-04 synthetic pricing/occupancy  | `passed`           | migration/domain/repositories/tests | 99 tests, check/build/audit, forbidden-branch review          | stages 05–10 могут использовать boundaries          |
| Authenticated public/admin exposure   | `feature_disabled` | HTTP routes/UI отсутствуют          | engine не экспортирован клиенту; strict public payload parser | stages 05, 06A и 07                                 |
| Real source conformance               | `blocked`          | approved upstream sources           | отдельное разрешение/source hashes не предоставлялись         | operator: read-only dry-run по отдельному поручению |
| Remote D1 migration/production deploy | `feature_disabled` | production deployment               | remote commands не запускались                                | stage 13/operator по отдельному разрешению          |
| Official-site changes                 | `blocked`          | external CMS/code/links             | official site не изменялся                                    | owner/operator только по прямому поручению          |

`feature_disabled` означает проверенное fail-closed выключение конкретного
production path, а не готовность полного MVP.

## Operator docs и rehearsal

- Актуальные tracked runbooks/версии: существующие local import/migration
  команды в `README.md`; pricing runtime names и defaults —
  `wrangler.example.toml` и этот handoff; canonical rules —
  `docs/domain/PRICING.md`.
- Проверенные environment и дата rehearsal: Windows, 2026-07-15, Node
  `v22.20.0`, npm `10.9.3`, Wrangler `4.109.0`, Vitest `3.2.7`.
- Clean-room walkthrough: Codex применил migrations к clean in-memory D1,
  импортировал только synthetic fixtures и проверил mapping, occupancy,
  quote/revalidation, repricing и audit. Реальные источники и production
  resources не использовались.
- Stop conditions: unresolved mapping/classification/key/duration/rule;
  неподтверждённый fallback/override; попытка передать pricing controls через
  public payload; потребность в неразрешённой VBA branch, real source access или
  remote mutation.
- Production actions, намеренно не выполненные без разрешения: deploy, remote
  migrations/import, resource provisioning, backup/restore, upstream write и
  official-site changes.

## Следующий этап

- Готовые prerequisites этапа 05: foundation config/error/audit boundaries не
  изменены; pricing admin interfaces уже отделены от public payload.
- Проверить первым: этот handoff, migrations `0001`–`0004`, server-only import/
  pricing module boundaries и отсутствие доверия к client-supplied actor/role.
- Stop conditions/blockers: создание admin actor из request body, доступ к quote
  или enrollment без server-side owner/RBAC, ослабление CSRF/Turnstile/rate-limit
  либо необходимость production secrets/resources.
- Release gates, которые этап 05 должен переоценить: authenticated exposure
  остаётся disabled до реальной session/RBAC wiring; real-source/production/
  official-site gates остаются отдельными.

## Итог worktree

- End `git status --short`: один логический stage-04 change; modified config,
  i18n и duration-status import projection/tests; new migration, pricing modules,
  pricing tests, README/roadmap и этот handoff.
- Diff summary: explicit course mapping + date-aware deduplicated occupancy +
  exact/fail-closed pricing decisions + immutable quote/override evidence +
  validated config + synthetic regression coverage. Unrelated user changes не
  обнаружены; source Office/Access files, PII, secrets и generated import
  artifacts не добавлены.
- Commit: `не создан без разрешения`.

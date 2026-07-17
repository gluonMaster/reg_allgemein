# Handoff этапа 05: auth и email verification

Статус: `done`

Production readiness: `feature_disabled`

## Baseline

- Branch: `master`.
- Start HEAD: `bdb7ecf404bacc898d0585fa5a7b40c1091bf1c3`.
- Initial `git status --short`: clean.
- Предыдущий handoff: `docs/implementation/handoffs/stage-04.md`, status
  `done`; migrations `0001`–`0004`, config/error/audit foundations и запрет
  client-supplied actor/role приняты как prerequisites.

## Выполнено

- Requirement/acceptance IDs: `SYS-01`–`SYS-03`, `AUTH-01`–`AUTH-09`,
  `SEC-01`, `SEC-02`, `UI-01`, `OBS-01`, `REL-01`, `PRIV-01`;
  `ACCEPTANCE_CRITERIA.md` разделы 1A, 2 и 10.
- Migration ID: `0005_auth_security.sql`. Применённые migrations `0001`–`0004`
  не переписывались. Добавлены `users`, immutable
  `privacy_acknowledgements`, hashed `auth_tokens`, revocable `auth_sessions`,
  `auth_verification_commits`, `email_outbox`, cross-field current/pending email
  guards и индексы.
- Registration одной D1 batch создаёт только `parent`, отдельное immutable
  acknowledgement exact privacy notice version/evidence, hashed verification
  token, outbox reference и безопасный audit. Duplicate current/non-expired
  pending email возвращает тот же public result без orphan rows.
- Реализованы `AuthService.register`, `login`, `logout`,
  `resendVerification`, `verifyEmail`, `requestPasswordReset`, `resetPassword`,
  `requestEmailChange`, `revokeAllSessions` и cleanup expired reservations.
  Password reset, email confirmation, block и role change отзывают sessions и
  увеличивают server-side session version.
- Password boundary: bcrypt с отдельной солью, configurable 12–128 character
  policy и обязательным pre-hash rejection bcrypt inputs длиннее 72 bytes.
  Missing-user login выполняет dummy bcrypt verification; public login error
  не раскрывает состояние account/verification/block.
- Raw verification/reset tokens не хранятся. Opaque link token server-side
  выводится HMAC из secret + random token ID; D1 хранит только scoped SHA-256
  hash, target/email version и outbox reference. Resend/reset supersede previous
  unsent/usable token/outbox; TTL, cooldown и single-use conditional consume
  проверяются повторно в D1.
- Transactional extension contract: `PostVerificationExtension.prepare` получает
  `VerificationExtensionContext`; его guarded statements входят в тот же
  atomic D1 batch после `auth_verification_commits`. Ошибка extension откатывает
  marker, `email_verified_at` и token consume. Этап 06 обязан завершать extension
  fail-closed assertion-ом current promoted snapshot/family finalization.
- Session contract: signed HS256 JWT содержит только opaque user/session/JTI и
  version; D1 хранит JTI/CSRF hashes. `SessionService.authenticate` повторно
  проверяет expiry, revoke, current session version, block, account status,
  verification и current DB role. Cookie `HttpOnly`, production `Secure`,
  `SameSite=Lax`, host-only без `Domain`; separate readable CSRF cookie связан
  hash-ом с конкретной session.
- Authorization contract: central route policy публично разрешает только `/` и
  `/auth/*`; остальные future routes deny-by-default, `/admin/*` требует current
  DB admin. `requireAuthenticated`, branded `requireAdmin`,
  `requireObjectOwner` и `requireCsrf` предназначены для следующих этапов.
  `AdminIdentityRepository` повторно проверяет admin actor в D1, отзывает target
  sessions и audit-ит role/block change; публичного assignment/bootstrap route
  нет.
- Server/UI paths: `/auth/register`, `/auth/login`, `/auth/resend`,
  `/auth/forgot`, `/auth/verify`, `/auth/reset`, `/account/security`.
  Labels, errors, auth navigation и German email subjects/bodies находятся в
  i18n catalog; mobile/keyboard form smoke добавлен.
- Email boundary: `EmailProvider`, `FakeEmailProvider`,
  `DisabledEmailProvider`, `AuthEmailDispatcher`; tests используют только
  in-memory fake. Dispatcher строит absolute links только через validated
  `PORTAL_PUBLIC_ORIGIN`, сверяет current/pending target+version и сохраняет
  только safe provider error code.
- Environment/config changes без secret values:
  `AUTH_PUBLIC_ENABLED`, `EMAIL_PROVIDER`, `PRIVACY_NOTICE_VERSION`,
  `AUTH_VERIFICATION_TTL_SECONDS` (default `86400`),
  `AUTH_RESET_TTL_SECONDS` (`3600`), `AUTH_EMAIL_CHANGE_TTL_SECONDS` (`86400`),
  `AUTH_SESSION_TTL_SECONDS` (`604800`), `AUTH_RESEND_COOLDOWN_SECONDS` (`60`),
  `AUTH_RATE_LIMIT_WINDOW_SECONDS` (`60`),
  `AUTH_RATE_LIMIT_MAX_ATTEMPTS` (`5`), `AUTH_PASSWORD_MIN_LENGTH` (`12`),
  `AUTH_PASSWORD_MAX_LENGTH` (`128`) и `EMAIL_MAX_ATTEMPTS` (`5`).
- Feature flags/fail-closed: tracked local и production-shaped config держат
  `AUTH_PUBLIC_ENABLED=false`. Enabled auth требует JWT secret, Turnstile,
  non-placeholder privacy version и non-disabled email adapter. Production
  дополнительно отклоняет fake provider и `AUTH_PUBLIC_ENABLED=true`, пока не
  реализован реальный provider wiring.
- Migration/rollback/restore compatibility: clean in-memory D1 применяет
  immutable `0001`–`0005`. Remote migration, persisted local reset,
  backup/restore и production deploy не выполнялись.

## Проверки

| Команда/сценарий | Результат |
| --- | --- |
| `npm run check` | passed; `svelte-check found 0 errors and 0 warnings` |
| `npm test` | passed; 17 files, 111 tests |
| `npm run build` | passed; Cloudflare adapter build завершён |
| `npm run test:e2e` | passed; 2 Chromium tests: German foundation и mobile auth/protected-route smoke |
| `npm audit` | passed; 0 vulnerabilities |
| Auth D1/security | passed; privacy atomicity, duplicate/reservation, token hash/TTL/replay/cooldown, extension rollback, reset/email races, sessions, rate limit, role/block |
| Diff/client/log scan | passed; no secret/hash/cookie/synthetic PII in client bundle; no raw token in D1 outbox; `git diff --check` clean |

## Не выполнено и риски

- Открытые вопросы/OQ: открытых owner/product OQ нет; закрытый `OQ-007` применён
  как German-only mandatory locale с i18n keys.
- External/legal/operational release gates, не являющиеся OQ: approved
  production privacy notice version, real provider credentials/wiring,
  production origin/resources, remote migration и backup/restore не проверялись.
- Known failures: обязательные code/test/build проверки проходят; известных
  code failures нет.
- Сознательно вне scope: legacy lookup/FamilyID/children/cabinet, namespace 1/2
  allocation, real email delivery/cron, initial bootstrap admin procedure,
  social login/MFA/shared guardians, production deploy и любые изменения
  official site.
- Stage-05 default verification extension не назначает FamilyID и оставляет
  `family_assignment_status=pending_verification`; поэтому production public
  registration остаётся выключенной до подключения stage-06 family-finalization.

## Release gates

| Gate | Статус | Affected path/flag | Evidence | Owner / next action |
| --- | --- | --- | --- | --- |
| Stage-05 synthetic auth/security | `passed` | migration/services/routes/tests | 111 tests, check/build/e2e/audit и security scans | stage 06/06A могут использовать boundaries |
| Production public auth/email | `feature_disabled` | `AUTH_PUBLIC_ENABLED=false` | production config rejects enabled auth/fake provider | stage 11/13: real provider + preview/release smoke |
| Atomic FamilyID finalization | `feature_disabled` | default verification extension | rollback test passes; no family lookup/allocation implemented | stage 06: guarded extension + current snapshot assertion |
| Initial admin bootstrap | `feature_disabled` | no public/bootstrap route | public schema strict; assignment needs current DB admin | stage 13: authorized one-shot procedure, disable/rehearse/audit |
| Remote D1 migration/deploy | `feature_disabled` | production deployment | remote commands not run | stage 13/operator by separate authorization |
| Official-site changes | `blocked` | external CMS/code/links | official site not changed | owner/operator only by direct instruction |

`feature_disabled` означает проверенное fail-closed выключение конкретного
production path, а не готовность полного MVP.

## Operator docs и rehearsal

- Актуальные tracked docs: `README.md`, `wrangler.example.toml`,
  `.dev.vars.example`, `docs/architecture/DATA_MODEL.md`,
  `docs/domain/MESSAGING.md` и этот handoff. Полный bootstrap/provider/cron/
  production runbook остаётся этапу 13.
- Проверенные environment и дата: Windows, 2026-07-17, Node `v22.20.0`, npm
  `10.9.3`, Wrangler `4.109.0`, Vitest `3.2.7`.
- Clean-room walkthrough: migrations применены к isolated in-memory D1; только
  synthetic accounts/addresses, fake Turnstile/email и fake operator bootstrap
  fixture использовались. Реальные client sources/provider/resources не
  читались и не изменялись.
- Stop conditions: missing D1/JWT/Turnstile/privacy version; disabled/real email
  adapter not wired; attempt public admin/role payload; missing current promoted
  legacy snapshot/family assertion; request to expose token/cookie/hash; need for
  remote/production mutation.
- Production actions, намеренно не выполненные: resource provisioning, secrets,
  remote migrations, real email, admin bootstrap, deploy, backup/restore и
  official-site changes.

## Следующий этап

- Готовые prerequisites stage 06: `users`/token/session schema, verified current
  email conditional consume, `auth_verification_commits`,
  `PostVerificationExtension`, server actor/owner/RBAC helpers и current legacy
  projections from stage 03.
- Проверить первым: этот handoff, migration `0005_auth_security.sql`,
  `AuthRepository.verifyCurrentEmail`, extension contract и stage-03 promoted
  snapshot/import invariants.
- Stage 06 подключает extension object с D1 access. Каждый family mutation должен
  быть conditional on supplied verification request marker; final assertion
  обязан abort batch при unavailable/stale snapshot, lookup error, promotion/
  allocation/ownership race. Нельзя делать observable pre-verification lookup
  или второй post-verification flow.
- Stop conditions/blockers: enabling production registration до atomic family
  finalization; interpreting unavailable snapshot as zero matches; allocating
  namespace 2 outside verification batch; trusting user/role/owner IDs from
  payload; weakening token/session/CSRF/rate-limit boundaries.
- Release gates stage 06 должен переоценить: atomic FamilyID finalization и
  production public auth остаются disabled; provider/bootstrap/deploy/official
  site gates остаются отдельными.

## Итог worktree

- End `git status --short`: один логический stage-05 change; modified README,
  canonical data/message docs, roadmap, config/i18n/hooks/styles/tests; new
  migration, auth/email/security modules, auth/account routes, tests и этот
  handoff.
- Diff summary: atomic auth/privacy schema + bcrypt/token/session lifecycle +
  email-change reservations + fake outbox + Turnstile/rate-limit/CSRF/RBAC +
  German UI/email + security/integration/browser coverage. Secrets, production
  IDs, source PII и generated import artifacts не добавлены.
- Commit: `не создан без разрешения`.

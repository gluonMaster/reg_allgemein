# Канонический контракт production readiness

Ревизия: 2026-08-14.

Этот документ задаёт обязательные deliverables, release gates и доказательства
для доведения портала до production. Он не является готовой инструкцией по
несуществующей реализации: точные команды, имена scripts, bindings и ожидаемые
результаты добавляются на этапе 13 только после сверки с фактическим кодом и
проверки в non-production. Выдумывать их заранее запрещено.

Production deploy, remote production migration, реальный PII import, включение
внешних отправок и изменение официального сайта выполняются только по отдельному
прямому поручению.

## Системная граница

Портал регистрации — самостоятельное приложение со своим deployment lifecycle,
Cloudflare Worker, D1, private R2, bindings, secrets и monitoring. Он физически
не использует серверный runtime или deployment-инфраструктуру официального
сайта `https://kolibri-dresden.de/` и не является его модулем. Для serverless
проверяется изоляция application/origin/resources/lifecycle, а не конкретный
физический host провайдера.

Официальный сайт и страница расписания публикуют обычные ссылки на уже
проверенный production URL портала. Добавление этих ссылок выполняется только
после post-deploy health check как отдельная внешняя операция с отдельным
разрешением. Её rollback удаляет/возвращает ссылки, но не откатывает Worker, D1
или R2 портала. Runbook не должен предполагать доступ к инфраструктуре сайта.

## Статусы release gate

Каждый gate имеет ровно один status:

- `passed` — проверка выполнена в требуемой среде, а handoff/checklist содержит
  актуальное evidence, дату и ответственного;
- `feature_disabled` — затронутый production path реально fail-closed, его
  выключение проверено, а пользовательский и операторский scope честно описан;
- `blocked` — обязательное evidence или решение отсутствует либо проверка
  завершилась ошибкой.

Статус нельзя выводить из обещания «должно работать». `feature_disabled` не
равен `passed`. Полный MVP можно назвать production-ready только когда все его
обязательные paths имеют `passed`; ограниченный release с выключенной функцией
требует отдельного явного разрешения владельца и не объявляется полным MVP.

Для каждого gate фиксируются:

- ID/область, status и affected feature/path;
- конкретная environment и immutable code/config version;
- sanitized evidence и дата проверки;
- owner решения или проверки;
- feature flag/fail-closed механизм, если применимо;
- next action, stop condition и rollback trigger.

## Обязательные tracked deliverables этапа 13

Все инструкции пишутся на русском языке, доступны из `docs/README.md`, не
содержат secrets/PII и рассчитаны на неопытного оператора. Каждый опасный шаг
содержит prerequisites, точную команду из фактической реализации, объяснение
placeholder-ов, ожидаемый безопасный результат, способ проверки, stop condition
и rollback/эскалацию.

### `docs/operations/PRODUCTION_DEPLOYMENT.md`

Пошаговая инструкция должна покрывать:

1. системную границу и отдельный deployment портала;
2. доступы, роли, версии tooling и подготовку clean clone;
3. матрицу local/preview/production без reuse D1/R2/secrets;
4. создание D1 и private R2 archive/quarantine с обязательным EU jurisdiction
   до загрузки данных;
5. Worker, Browser Run, Turnstile, email, Telegram, custom domain/TLS и прочие
   bindings согласно фактической реализации;
6. inventory environment variables, secrets и feature flags без самих secret
   values, включая безопасную первичную установку и ротацию;
7. inventory всех Cron/scheduled jobs с schedule/timezone, dedupe/lease,
   manual-run, monitoring и failure procedure;
8. preflight, backup, migrations, compatibility check и rollback/roll-forward;
9. out-of-band first-admin bootstrap, проверку audit и немедленное отключение
   или отзыв bootstrap capability;
10. безопасный staged/dry-run/promote initial import с явным academic period и
    проверку current promoted legacy snapshot до включения регистрации: lookup
    error/отсутствие snapshot не должны превращаться в namespace-2 allocation;
    production-grade import обязан отдельно покрывать актуальный Access source,
    current-source parser regression/contract evidence для PlusBText,
    target-pinned remote `plan -> stage -> review -> recovery-evidence ->
promote -> verify -> rollback|roll-forward`, попарно разные planner/stager/
    reviewer, transition actor, отличный от reviewer, recovery verifier,
    отличный от planner/stager/reviewer/promoter, typed confirmations exact
    target/config/D1 UUID,
    идемпотентность и rollback. Preview plan обязан использовать только
    встроенный deterministic `synthetic_preview` bundle из 1703 строк без
    Office source paths; production plan — только `current_production` с двумя
    явными read-only sources. Первый promote, у которого
    нет предыдущей published version, восстанавливается из проверенного
    pre-import D1 backup либо отдельным заранее реализованным и испытанным
    переходом к `no current snapshot`; обычная команда rollback предыдущей
    version этот случай не доказывает;
11. preview deploy и production-shaped smoke без production PII;
12. production deployment и post-deploy smoke как команды, которые исполняются
    только после отдельного разрешения;
13. feature enablement только после соответствующих `passed` gates;
14. отдельный post-health-check go-live ссылок на каждой утверждённой external
    surface официального сайта (включая согласованные страницы расписания), а
    также rollback этих ссылок; список URL является release input.

### `docs/operations/OPERATIONS_RUNBOOK.md`

Инструкция ежедневной эксплуатации должна покрывать:

- health, Worker errors, correlation IDs и PII-safe diagnostics;
- import issues/review queues, outbox `retry|dead`, Cron freshness и stale locks;
- R2/quarantine backlog, 14×24-hour cleanup и approved archive isolation;
- Browser usage/quota/budget, provider failures и manual retry;
- безопасные admin actions, role/session incidents и admin recovery;
- полный manual local-AV/hash-attestation/business-review процесс, обучение и
  контрольный проход;
- secret rotation/revocation, provider credential compromise и access review;
- incident severity, feature disable, escalation, evidence preservation и
  recovery verification;
- регулярный dependency/security review и обновление runbooks после изменений.

Monitoring может использовать доступные средства выбранного deployment, но
обязан иметь проверяемые owners, сигналы и действия для missed Cron, dead
outbox, repeated Worker errors, failed import/promotion, backup failure,
quarantine backlog и Browser/provider exhaustion. Платный сервис нельзя
предполагать без отдельного решения.

Реализованный базовый signal `GET|HEAD /_health/operations` намеренно возвращает
только empty `204|503` с `no-store`: он проверяет свежесть всех scheduled jobs,
stale `running` и repeated scheduled/application Worker errors по порогам
`180s|1200s|360s|3 за 900s`. D1 недоступна — signal `503`. Application 5xx
хранятся только как минутные PII-free counters и очищаются через 7 суток.
Signal не является alert сам по себе: независимый внешний poller, recipient,
owner и delivery/recovery rehearsal остаются обязательными release evidence и
не используют прикладные Resend/Telegram adapters.

### `docs/operations/DISASTER_RECOVERY.md`

Инструкция должна покрывать:

- D1/R2 inventory, backup mechanism, encryption, location и least-privilege
  access без публикации credentials;
- согласованные RPO/RTO, backup cadence и retention как явные release inputs;
- обязательный pre-migration/pre-import backup и проверку его пригодности;
- восстановление D1 и R2 в изолированную non-production environment;
- проверку schema, object hashes/metadata, ownership и критических smoke paths;
- code rollback, migration roll-forward/restore и import-version rollback как
  разные процедуры без переписывания применённых migrations;
- критерии перехода к production restore, дополнительное прямое разрешение,
  коммуникацию, post-restore monitoring и audit evidence.

Неопределённые RPO/RTO/cadence не заполняются догадкой: gate остаётся `blocked`
до утверждения input. Наличие backup без успешного restore rehearsal не даёт
`passed`.

### `docs/operations/PRODUCTION_READINESS_CHECKLIST.md`

Checklist является текущим release ledger и содержит status/evidence/owner/date
как минимум для:

- clean install, traceability, full automated suite и dependency audit;
- environment isolation, production-shaped bindings и secrets inventory;
- preview migrations, end-to-end smoke и accessibility/security review;
- D1/R2 backup/restore и migration/import rollback rehearsal;
- current promoted legacy snapshot, 0/1/multiple FamilyID lookup smoke и
  fail-closed registration при unavailable/stale snapshot;
- Cron inventory и проверку каждого scheduled path;
- email/Telegram provider configuration и разрешённый non-production smoke;
- настоящий односторонний Telegram Bot API adapter: environment-specific bot
  token и утверждённый bureau chat, минимизированный payload, timeout/error/retry
  policy, valid-`ok=false` retry/permanent classification, destination-wide 429
  cooldown, terminal `delivery_unknown` для неоднозначного результата, dead/
  unknown lane block, аудируемые operator decisions без blind retry и
  разрешённый synthetic preview smoke с no-send abort для zero-attempt cohort и
  no-send reconcile истёкшего `dispatch_started` lease в `delivery_unknown`;
- remote Browser Run glyph/font/pagination/quota/budget conformance;
- approved production templates, legal profiles и applicable contract blockers;
- privacy notice, DPA/AVV/subprocessors и media text/contact approval;
- upload runbook, admin training и manual AV test passage;
- admin bootstrap/recovery и least-privilege access review;
- monitoring, alerts/manual checks, incident response и secret rotation;
- clean-room walkthrough всех operator docs;
- production deploy approval, post-deploy smoke и отдельный site-link go-live.

External legal/business approval записывается как evidence и owner, но агент не
подменяет его своей оценкой. Gate конкретной функции может быть
`feature_disabled`; checklist обязан назвать проверенный flag/path и остаточный
scope.

Следующие stable rows нельзя объединять с общим «import/provider smoke» или
пропускать: PR-B12 PlusBText current-source parser/contract evidence, PR-B13
exact-target remote runner, PR-B14 review-bound atomic legacy bundle, PR-B15
synthetic no-PII preview promote/rollback/roll-forward with first-import restore,
PR-B16 authorized production current import/post-verify, PR-B17 Access owner
semantics/current-source reconciliation; PR-F12 Telegram Bot API
adapter/config/secrets, PR-F13 ambiguous delivery/manual resolution, PR-F14
authorized synthetic preview smoke и PR-F15 destination/rotation/recovery drill.
Пока реализация/evidence отсутствует, row остаётся `blocked`, даже если source
profile известен или provider flag `disabled`.

На ревизию 2026-08-14 local worktree реализует code/migrations boundary этих
rows через unapplied candidates `0016` (legacy release control), `0017`
(Telegram delivery certainty) и `0018` (legacy role/count/cleanup hardening).
`0018` сохраняет grandfathered `0016` plans как immutable evidence, но
fail-closes их lifecycle при `NULL` actors/legacy `{}` contract и требует новый
hardened plan.
Текущий worktree дополнительно реализует `IMPORT-07`: owner-approved
`O/R/S/T` crosswalk, versioned safe name normalization, hourly exceptions,
Access-price priority и PII-free admin references. Package groups ограничены
первыми четырьмя slots, `AO/AT` всегда исключены. Read-only current-source rerun
сократил obsolete 1429 warning occurrences/751 enrollment reviews до 160/53;
это уменьшение false positives, а не автоматическое принятие данных. Active
unresolved group подтверждён как upstream error и остаётся `awaiting_upstream`.
Для structural duplicates и остальных actionable classes обязателен `IMPORT-08`
durable reconciliation contour из tracked TZ; его migration/repository/UI/tests
пока отсутствуют.

Это не меняет deployed preview `0001`–`0015`, не закрывает PR-B12–PR-B17 или
PR-F12–PR-F15 и не является разрешением на remote migration/import/send.

## Обязательная non-production валидация

До статуса `passed` инструкции проходят clean-room rehearsal на clean clone и
отдельных preview resources. Walkthrough выполняет человек, не участвовавший в
реализации, либо независимый агент, которому доступны только tracked docs и
явно перечисленные безопасные inputs. Устные пояснения автора инструкции не
считаются частью runbook.

Rehearsal включает:

- provisioning/config validation без production credentials;
- empty и representative upgraded D1 migrations;
- production-shaped bindings и Cron manual trigger/freshness checks;
- remote Browser conformance и разрешённый provider smoke;
- remote import rehearsal использует только synthetic/no-PII fixture в обычном
  preview, причём fixture генерируется самим release CLI, фиксируется как
  `sourceClass=synthetic_preview`, а любые Office source arguments отклоняются.
  Актуальный Access source с PII не загружается в обычный preview:
  реальный import допустим только в отдельно утверждённый target с data-owner/
  privacy approval, выключенными public auth/providers, pre-import backup,
  ограниченным доступом и доказанным cleanup/restore plan;
- bootstrap/admin/RBAC smoke без реальных клиентов;
- backup и полное восстановление D1/R2 в новую non-production environment;
- code/migration/import rollback decision drill;
- полный post-deploy smoke и проверку monitoring/incident paths.

Sanitized result, версии commands/config и найденные неясности записываются в
`stage-13.md` и production checklist. Непройденный или неприменимый шаг получает
`blocked|feature_disabled`, но не `passed`.

## Stop conditions

Production readiness запрещено объявлять, если:

- инструкция требует устного знания, отсутствующего tracked input или
  несуществующей команды;
- preview использует production D1/R2, credentials либо клиентские данные;
- отсутствует доказуемый restore или безопасный migration rollback/roll-forward;
- scheduled job/provider/monitoring path реализован, но не подключён и не имеет
  failure procedure;
- registration включена без валидного current promoted legacy snapshot либо
  lookup failure ошибочно трактуется как отсутствие legacy match;
- актуальный Access profile не проверен allowlisted неисполняющим parser,
  PlusBText current-source parse не подтверждает exact approved v1 contract либо
  parser sanitizer меняет логическую структуру self-closing/styled empty cells;
  изменение настоящего source contract по-прежнему требует отдельной version,
  но parser bug нельзя ошибочно выдавать за business/schema drift;
- remote import command не pin-ит exact environment/config/D1 UUID/clean Git
  candidate/`sourceClass`, допускает stage/promote без отдельного immutable
  review и role separation, принимает произвольный recovery digest вместо
  target/plan/review-bound fresh isolated-restore artifact, выводит source
  rows/paths/PII или не имеет доказанного first-import restore/no-current
  rollback;
- production import transition не остаётся fail-closed ещё до API-token lookup/
  network, пока отдельное preview remote-transaction evidence отсутствует,
  либо ошибочно выдаёт local D1 test за это environment evidence;
- обычный preview rehearsal использует актуальные клиентские Access/Office data,
  а не synthetic/no-PII fixture;
- Telegram Bot API path не имеет exact destination ownership, secret/config
  validation, безопасного `delivery_unknown` состояния и auditable manual
  resolution, ошибочно считает valid `ok=false` 408/425/5xx неоднозначным, повторяет
  возможную доставку, обходит terminal dead/unknown lane block либо позволяет
  abort/reclaim smoke cohort после dispatch attempt; crash после
  `dispatch_started` повторяется или reconciles до lease expiry/с provider path
  вместо terminal `delivery_unknown`;
- first-admin bootstrap оставляет постоянный неаудируемый privilege path;
- secret попал в tracked file, output, log sample или operator evidence;
- обязательный legal/privacy/template/upload gate не имеет `passed`, а функция
  не выключена проверяемым fail-closed способом;
- deploy портала ошибочно требует изменение или доступ к серверной
  инфраструктуре официального сайта;
- production или сайт изменяются без отдельного прямого поручения.

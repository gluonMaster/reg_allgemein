# Открытые продуктовые и технические вопросы

Этот файл содержит продуктовые, юридические и технические решения, которые
нельзя достоверно вывести из исходного кода или данных. До ответа действует
указанное безопасное временное поведение.
Оно позволяет разрабатывать систему, но вопросы со статусом **blocker** должны
быть закрыты до запуска соответствующего production path с реальными клиентами.

| ID | Вопрос | Временное безопасное поведение | Статус |
| --- | --- | --- | --- |
| `OQ-001` | Может ли цена действующего годового договора меняться из-за численности группы и на каких юридических условиях? | Для `yearly` создавать только внутренний review task; не отправлять и не применять новую цену автоматически. | Open, blocker for yearly repricing |
| `OQ-002` | Каков точный срок/способ оплаты и различается ли он по виду договора? | Админ вводит `payment_due_text` в offer; портал его показывает, но не рассчитывает срок и задолженность. | Open, production blocker |
| `OQ-004` | Нужен ли одновременный доступ двух родителей/опекунов к одному ребенку? | Одна legacy-family и ребенок имеют один owning account; дополнительный доступ решает админ вручную без совместного кабинета. | Open |
| `OQ-005` | Каковы утвержденные сроки хранения документов финансирования Jobcenter/Sozialamt, договоров, acceptance IP и audit logs? | Сроки конфигурируются; автоматическое физическое удаление не включается до письменного решения, доступ строго ограничен. | Open, production blocker |
| `OQ-006` | Кто имеет право на `Sonderpreis` и означает ли `O/V` тот же критерий в новом портале? | Публичный quote использует `Preis`; `Sonderpreis` может выбрать только админ с причиной и snapshot. | Open, blocker for special price |
| `OQ-007` | Какие языки обязательны в первом production-релизе? | Полный немецкий UI/email обязателен; архитектура i18n-ready, остальные переводы не входят в Definition of Done. | Open |
| `OQ-008` | Нужно ли учитывать школьные каникулы и праздники при выборе trial date? | Каталог показывает недельное расписание, но реальную дату всегда подтверждает админ. | Open |
| `OQ-009` | Нужна ли обязательная антивирусная/контентная проверка funding-document uploads Jobcenter/Sozialamt и каким сервисом? | Файл проходит allowlist MIME/signature/size, получает `quarantined` и не участвует в автоматической обработке. До утверждения политики его открывает только уполномоченный admin в изолированном актуальном viewer; публичная раздача запрещена. | Open, production blocker |
| `OQ-013` | Кто из уполномоченных представителей Verein утверждает итоговые clause/template versions и `contract_number` policy; будет ли доступна повторная юридическая проверка? | Все четыре reference-шаблона считаются действующими business sources, их экономическая/операционная суть сохраняется. В HTML вносятся только явно необходимые корректировки из CONTRACTS.md; production version требует документированного approval уполномоченного представителя Verein, legal review — если доступен. | Open, production blocker |
| `OQ-014` | Как именно реализовать Fernabsatz/Widerruf: применимость, начало занятий до истечения срока и electronic withdrawal function? | Договор считается заключённым только после parent acceptance и последующего admin approval. До решения withdrawal-части production send/activation выключены. | Open, production blocker |
| `OQ-015` | Каковы точные billing-модели, единицы почасового тарифа, библиотечные сборы и скидки для каждого вида договора? | Админ задаёт явный immutable billing snapshot/line items; портал не начисляет фактические часы, не выводит догадки и не применяет скидки автоматически. Срок/способ оплаты отдельно определяет `OQ-002`. | Open, production blocker |
| `OQ-016` | Какие privacy/media/SEPA/medical документы и согласия должны оформляться в портале и каковы их purpose, access и retention? | Media/SEPA не включаются в contract acceptance; медицинские справки не принимаются; upload остаётся только для документов финансирования Jobcenter/Sozialamt. | Open, blocker if feature enabled |
| `OQ-017` | Нужен ли отдельный payer agreement/contract и какие реквизиты/условия фиксировать для Nachhilfe, финансируемой Jobcenter или Sozialamt? | Nachhilfe не бывает self-pay: требуется действующее направление Jobcenter/Sozialamt. Funding authorization хранится отдельно; third-party-funded contract нельзя активировать без утверждённой payer/template model. | Open, blocker for publicly funded Nachhilfe contract |

## Закрытые вопросы

| ID | Решение | Закрыт |
| --- | --- | --- |
| `OQ-003` | Nachhilfe в портале допускается только по действующему направлению Jobcenter или Sozialamt. Self-pay оформляется как `individual`, а не Nachhilfe. | 2026-07-10, owner decision |
| `OQ-010` | `FamilyID` считается стабильным между учебными периодами. Claim/child identity наследуются; редкое расхождение блокирует автоматический перенос и исправляется через review/upstream correction. | 2026-07-10, owner decision |
| `OQ-011` | Production PDF renderer — Cloudflare Browser Run Quick Action `/pdf` через Workers binding. Используются inline HTML/CSS/fonts, private R2 artifact и immutable PDF hash; accepted PDF никогда не перерендеривается. Release требует remote spike, quota/budget и DPA check. | 2026-07-10, technical decision ADR-014 |
| `OQ-012` | Один цифровой договор покрывает ровно одного ребёнка и одну услугу. Кабинет хранит историю заключения, Kündigung/termination и последующих договоров. | 2026-07-10, owner decision |
| `OQ-018` | `PlusBText!T` хранит минуты. Для подтверждённой group service без найденной duration используется ориентировочный fallback 90 минут: 2 × 23 EUR для yearly или 2 × 30 EUR для monthly; результат требует сообщения и admin confirmation. | 2026-07-10, owner decision |

## Как закрывать вопрос

После решения нужно:

1. записать дату, владельца решения и ответ здесь;
2. обновить соответствующий `domain/*` и при необходимости data model;
3. добавить или изменить критерий приемки и тест;
4. удалить временное поведение из промптов — оно не должно жить отдельно от
   канонической документации.

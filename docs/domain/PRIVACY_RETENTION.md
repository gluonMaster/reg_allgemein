# Privacy, удаление аккаунта и retention

Документ задаёт продуктовые границы удаления кабинета и хранения доказательств.
Автоматический purge retained legal archive в MVP выключен. Это owner/product
policy, а не утверждение, что бессрочное хранение автоматически получает
правовое основание.

## Privacy notice

Внешняя официальная страница Verein:
[kolibri-dresden.de/datenschutz](https://kolibri-dresden.de/datenschutz/).
Она уже описывает удаление после исчезновения цели обработки с исключением для
обязательных сроков хранения. Официальный сайт не является частью deployment
портала: изменение его privacy content требует отдельного прямого поручения и
остаётся внешней content/legal операцией. Портал не полагается на live-fetch этой
страницы. Для портала недостаточно сохранять только URL:
registration/contract flow фиксирует version, hash, опубликованный текст или
immutable artifact и timestamp той редакции, которую видел пользователь.

До production privacy notice дополняется portal-specific обработкой как минимум
для Cloudflare Workers/D1/R2/Browser Rendering, email, document scanning,
contract archive, audit и сроков по каждой категории. Cloudflare DPA/AVV,
subprocessors и processing record проверяются отдельно.

## Удаление кабинета

Parent может запросить удаление, только если у него нет active contracts.
Процесс начинается с dry-run и дополнительно показывает открытые contract/
termination/privacy requests и legal holds; наличие hold не должно оставлять
рабочую login-сессию без необходимости.

После approval одной идемпотентной операцией:

1. account получает closure lock; повторная contract formation/activation,
   price apply и новые действия после этого запрещены;
2. для каждого действующего media grant создаётся append-only revoke с
   `source=account_deletion` и `effective_from=account_deleted_at`;
3. отзываются sessions/tokens и закрывается доступ к кабинету;
4. nonterminal offers/items/requests/trials и неактивные operational drafts
   закрываются с reason/audit, а уже созданное immutable acceptance evidence
   сохраняется;
5. удаляются либо обезличиваются не нужные более profile/contact, drafts,
   preferences и operational данные;
6. owned children и связи минимизируются в пределах допустимых holds;
7. retained contract/funding evidence переносится в закрытый legal archive,
   недоступный через удалённый parent account;
8. создаётся минимальный audit result без полного профиля, документа или IP.

Closure и concurrent accept/admin-approval выполняются conditional: если
contract успел сформироваться первым, active contract блокирует closure; если
closure lock установлен первым, offer/price activation отклоняется.

«Удалённый профиль» и «уничтожены все документы» — разные состояния. Retained
PDF может содержать имя стороны, поэтому интерфейс обязан честно сообщить, какие
категории и до какой даты остаются по legal/contractual basis.

## Retention model

Каждый удерживаемый D1/R2 record имеет или наследует:

- `retention_class` и документированное `legal_basis`;
- `retention_started_on`, `retain_until` и правило расчёта;
- `legal_hold` с actor/reason/review date;
- результат purge/anonymization и audit без payload.

Минимальные отдельные категории: account/profile, contract PDF/source bundle,
parent/admin acceptance and delivery evidence, termination/withdrawal evidence,
funding authorization/document, media consent, audit/security event и
short-lived acceptance IP/anti-abuse metadata.

Автоматическое удаление contract PDF/source bundle, formation/acceptance/
termination evidence и approved funding documents не реализуется и не
планируется cron/job. `retain_until` может быть пустым или информационным и не
является trigger. Пятилетняя оценка объёма не превращается в срок удаления.
Любое будущее физическое удаление архива требует нового отдельного письменного
правила/поручения с category scope, legal basis, датой отсчёта, hold handling и
audit; оно не выводится разработчиком из догадки.
Причина разделения категорий: storage limitation/erasure из
[Art. 5/17 GDPR](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679),
обычная исковая давность по
[§§ 195/199 BGB](https://www.gesetze-im-internet.de/bgb/__199.html) и
налоговые категории [§ 147 AO](https://www.gesetze-im-internet.de/ao_1977/__147.html)
считаются по разным правилам.

Media consent отзывается на будущее и не получает срок договора автоматически.
Self-service revoke в кабинете отсутствует. Parent обращается лично по адресу
из [официального Impressum](https://kolibri-dresden.de/impressum/), по
официальному email либо телефону со страницы
[Kontakt](https://kolibri-dresden.de/kontakt/). Admin не approve/decline отзыв, а
регистрирует его фактический receipt; с этого времени отозванные scopes больше
не разрешают новые действия. Удаление кабинета автоматически считается отзывом
всех активных media grants с даты/времени удаления. Контакты показываются из
approved versioned configuration со snapshot/hash, а не hardcode в UI.

Онлайн-функция выдачи media consent (`grant`) должна fail closed и оставаться
выключенной до выполнения хотя бы одного из двух условий:

1. документированная правовая оценка подтвердила, что утверждённый withdrawal
   path позволяет отозвать согласие столь же легко, как его выдать;
2. реализован и проверен соответствующий compliant withdrawal path.
Обычный internal risk acceptance, owner approval или утверждение немецкого
текста не заменяют применимое право и не могут включить несоответствующую
функцию. До закрытия gate отсутствие grant означает запрет новой publication и не
блокирует договор.

Портал не управляет media files и не строит исторический реестр официального
сайта, локального облака, Facebook/Instagram или печати. Withdrawal не делает
прошлую обработку ретроактивно незаконной, но с receipt блокирует новые capture/
upload/post/repost/reprint по отозванным scopes. Распространённая печать не
получает физический recall. Legacy online materials автоматически не ищутся;
запрос на конкретно названный URL/post регистрируется как отдельный manual
privacy request и оценивается case-by-case, без обещания автоматического
удаления либо заранее установленного blanket-отказа. Выбранное отсутствие
same-cabinet revoke остаётся документированным release risk по Art. 7(3) GDPR/
EDPB guidance. До production немецкий текст и процесс письменно утверждает
уполномоченный представитель Verein, но такое утверждение не закрывает описанный
выше legal gate без документированной правовой оценки или compliant
withdrawal path.
Заражённый,
отклонённый или не получивший business approval upload не хранится весь
contract-retention период: его R2 body становится eligible при
`now >= uploaded_at + 14×24h` UTC и удаляется первым успешным cleanup после
порога, но никогда раньше. Approved document переходит под отдельную business
retention policy; DST/calendar-day неоднозначности здесь нет.

## Инварианты

- active contract не удаляется обычным profile-delete;
- successful profile-delete атомарно отзывает все действующие media grants, а
  повтор операции не создаёт дубликаты;
- наличие архивного contract evidence не сохраняет действующий login;
- обычный admin search не показывает archive без отдельной цели и audit;
- legal hold нельзя снять неаудируемым bulk action;
- online media-consent `grant` остаётся disabled до закрытия legal gate;
- `retain_until` не запускает automatic purge/anonymization legal archive;
- физический archive purge отсутствует в MVP и может появиться только новым
  утверждённым требованием, миграцией, dry-run и audit;
- privacy export одного пользователя не содержит данные другой семьи.

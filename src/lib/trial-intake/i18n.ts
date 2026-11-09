import type { AgeRange } from './age';
import type {
	IntakeOutboxContext,
	WaitlistCourse,
	WaitlistEntryStatus,
	WaitlistStartBlock,
	WaitlistTariff,
} from './contracts';
import { euroAmount } from './prices';

export type Locale = 'de' | 'ru';
const text = {
	title: ['Probestunde anfragen', 'Запросить пробное занятие'],
	intro: [
		'Wählen Sie Ihre Wunschtermine. Nach der E-Mail-Bestätigung meldet sich unser Büro telefonisch bei Ihnen.',
		'Выберите желаемые даты. После подтверждения email бюро свяжется с вами по телефону.',
	],
	dateNotice: [
		'Die Termine sind Wünsche. Platz und Besuch werden vom Büro bestätigt. Feiertage sowie Weihnachts- und Sommerferien in Sachsen sind nicht wählbar.',
		'Это желаемые даты. Место и посещение согласует бюро. Праздники, рождественские и летние каникулы Саксонии выбрать нельзя.',
	],
	selected: ['Ihr ausgewähltes Angebot', 'Выбранное занятие'],
	contacts: ['Ihre Kontaktdaten', 'Ваши контактные данные'],
	notMyDetails: ['Das sind nicht meine Daten', 'Это не мои данные'],
	firstName: ['Vorname', 'Имя'],
	lastName: ['Nachname', 'Фамилия'],
	email: ['E-Mail-Adresse', 'Email'],
	phone: ['Telefonnummer', 'Телефон'],
	children: ['Kinder', 'Дети'],
	child: ['Kind', 'Ребёнок'],
	birthDate: ['Geburtsdatum', 'Дата рождения'],
	addChild: ['Weiteres Kind hinzufügen', 'Ещё один ребёнок'],
	remove: ['Entfernen', 'Удалить'],
	lessons: ['Angebote und Wunschtermine', 'Занятия и желаемые даты'],
	addLesson: ['Angebot auswählen', 'Выбрать занятие'],
	addAnotherLesson: ['Weiteres Angebot hinzufügen', 'Ещё одно занятие'],
	search: ['Angebot suchen', 'Найти занятие'],
	choose: ['Auswählen', 'Выбрать'],
	noResults: ['Keine passenden Angebote gefunden.', 'Подходящих занятий не найдено.'],
	date: ['Wunschdatum', 'Желаемая дата'],
	assignments: ['Welche Kinder nehmen teil?', 'Кто из детей будет участвовать?'],
	assignmentError: [
		'Wählen Sie für jedes Angebot mindestens ein Kind aus.',
		'Выберите хотя бы одного ребёнка для каждого занятия.',
	],
	dateError: [
		'Wählen Sie einen zukünftigen Termin am angegebenen Wochentag, frühestens morgen.',
		'Выберите дату нужного дня недели, начиная с завтрашнего дня.',
	],
	birthError: [
		'Das Geburtsdatum darf nicht in der Zukunft liegen.',
		'Дата рождения не может быть в будущем.',
	],
	holidayError: [
		'An diesem Termin findet kein Unterricht statt (Feiertag oder Ferien). Bitte wählen Sie einen anderen Termin.',
		'В эту дату занятий нет (праздник или каникулы). Выберите другую дату.',
	],
	age: ['Alter', 'Возраст'],
	ageByArrangement: ['nach Absprache', 'по согласованию'],
	ageYoung: [
		'ist am Wunschtermin jünger als für diese Gruppe vorgesehen. Bitte wählen Sie für dieses Kind ein anderes Angebot oder einen späteren Termin.',
		'на желаемую дату младше возраста этой группы. Выберите для этого ребёнка другое занятие или более позднюю дату.',
	],
	ageOldTitle: ['Hinweis zum Alter', 'Внимание: возраст'],
	ageOld: [
		'ist am Wunschtermin älter als für diese Gruppe vorgesehen.',
		'на желаемую дату старше возраста этой группы.',
	],
	ageOldHint: [
		'Sie können die Anfrage trotzdem senden. Das Büro prüft, ob die Gruppe passt, und meldet sich bei Bedarf.',
		'Запрос можно отправить. Бюро проверит, подходит ли группа, и при необходимости свяжется с вами.',
	],
	ageConfirm: [
		'Ich habe verstanden, dass das Alter nicht zu dieser Gruppe passt, und möchte die Anfrage trotzdem senden.',
		'Я понимаю, что возраст не соответствует этой группе, и всё равно хочу отправить запрос.',
	],
	ageConfirmError: [
		'Bitte bestätigen Sie den Hinweis zum Alter oder ändern Sie die Auswahl.',
		'Подтвердите предупреждение о возрасте или измените выбор.',
	],
	ageError: [
		'Mindestens ein Kind ist für das gewählte Angebot noch zu jung. Bitte wählen Sie ein anderes Angebot oder einen späteren Termin.',
		'Хотя бы один ребёнок слишком мал для выбранного занятия. Выберите другое занятие или более позднюю дату.',
	],
	adminAgeYoung: ['jünger als die Gruppe', 'младше возраста группы'],
	adminAgeOld: ['älter als die Gruppe', 'старше возраста группы'],
	holidayTableEnding: [
		'Die sächsischen Ferientermine sind im Portal nur bis Sommer 2030 hinterlegt. Bitte die neuen Termine nachtragen lassen, sonst sind Weihnachts- und Sommerferien wieder wählbar.',
		'Даты каникул Саксонии внесены в портал только до лета 2030 года. Попросите добавить новые даты, иначе рождественские и летние каникулы снова станут доступны для записи.',
	],
	submit: ['Anfrage absenden', 'Подать запрос'],
	busy: ['Bitte warten …', 'Подождите …'],
	privacy: [
		'Ohne Bestätigung Ihrer E-Mail-Adresse werden die Daten Ihrer Anfrage 14 Tage nach dem Absenden gelöscht. Nach der Bestätigung werden sie 90 Tage nach Abschluss der Bearbeitung durch unser Büro gelöscht.',
		'Без подтверждения email данные заявки удаляются через 14 дней после отправки. После подтверждения — через 90 дней после обработки заявки администратором.',
	],
	checkMail: ['Bitte prüfen Sie Ihr Postfach', 'Проверьте почту'],
	mailHint: [
		'Bestätigen Sie Ihre Anfrage über den Link in der E-Mail. Die Zustellung kann bis zu 5 Minuten dauern. Bitte prüfen Sie auch Ihren Spam-Ordner.',
		'Подтвердите заявку по ссылке в письме. Доставка письма может занять до 5 минут. Проверьте также папку «Спам».',
	],
	resend: ['E-Mail erneut senden', 'Отправить письмо повторно'],
	wait: ['Erneut senden in', 'Повторная отправка через'],
	seconds: ['Sek.', 'сек.'],
	resent: [
		'Die erneute E-Mail wurde angefordert. Verwenden Sie bitte den neuesten Link.',
		'Повторное письмо запрошено. Используйте последнюю ссылку.',
	],
	correctEmail: ['E-Mail-Adresse korrigieren', 'Исправить email'],
	confirmTitle: ['Anfrage bestätigen', 'Подтвердить заявку'],
	confirmHint: [
		'Bestätigen Sie Ihre E-Mail-Adresse, um Ihre Anfrage an unser Büro weiterzuleiten.',
		'Подтвердите email, чтобы передать заявку в бюро.',
	],
	successTitle: ['Vielen Dank für Ihre Anfrage', 'Спасибо за вашу заявку'],
	success: [
		'Ihre E-Mail-Adresse wurde bestätigt und Ihre Anmeldung ist bei uns eingegangen. Die Angaben zu Ihren Probestunden haben wir Ihnen per E-Mail geschickt. Bei Bedarf melden wir uns bei Ihnen.',
		'Email подтверждён, заявка принята. Детали записи отправлены вам письмом. При необходимости мы свяжемся с вами.',
	],
	already: ['Ihre Anfrage wurde bereits angenommen.', 'Ваша заявка уже принята.'],
	invalid: [
		'Dieser Bestätigungslink ist ungültig oder wurde ersetzt. Verwenden Sie den neuesten Link.',
		'Ссылка подтверждения недействительна или заменена. Используйте последнюю ссылку.',
	],
	expired: [
		'Dieser Link ist abgelaufen. Fordern Sie auf der noch geöffneten Anfrageseite eine neue E-Mail an oder stellen Sie eine neue Anfrage.',
		'Срок ссылки истёк. Запросите новое письмо на открытой странице заявки или подайте новую заявку.',
	],
	back: ['Zurück zum Stundenplan', 'Вернуться к расписанию'],
	newRequest: ['Neue Anfrage', 'Новая заявка'],
	stale: [
		'Dieses Angebot ist nicht mehr im aktuellen Stundenplan. Bitte wählen Sie ein aktuelles Angebot aus.',
		'Этого занятия больше нет в актуальном расписании. Выберите актуальное занятие.',
	],
	chooseFirst: ['Wählen Sie ein Angebot aus dem Stundenplan.', 'Выберите занятие из расписания.'],
	maintenance: [
		'Neue Anfragen sind zurzeit nicht möglich. Bitte versuchen Sie es später erneut.',
		'Приём новых заявок временно закрыт. Попробуйте позже.',
	],
	unavailable: [
		'Der Stundenplan ist gerade nicht verfügbar. Bitte versuchen Sie es erneut. Ihre Eingaben bleiben erhalten.',
		'Расписание сейчас недоступно. Попробуйте ещё раз. Введённые данные сохранены.',
	],
	retry: ['Erneut versuchen', 'Повторить'],
	error: [
		'Die Anfrage konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut. Ihre Eingaben bleiben erhalten.',
		'Не удалось завершить запрос. Попробуйте ещё раз. Введённые данные сохранены.',
	],
	inputError: [
		'Bitte prüfen Sie Ihre Angaben, insbesondere E-Mail-Adresse und Telefonnummer.',
		'Проверьте введённые данные, особенно email и телефон.',
	],
	tooLarge: [
		'Die Anfrage ist zu lang. Bitte kürzen Sie lange Textfelder.',
		'Заявка слишком большая. Сократите длинные текстовые поля.',
	],
	rateLimit: [
		'Zu viele Versuche. Bitte warten Sie kurz und versuchen Sie es erneut.',
		'Слишком много попыток. Немного подождите и попробуйте снова.',
	],
	captcha: ['Bitte schließen Sie die Sicherheitsprüfung ab.', 'Пройдите проверку безопасности.'],
	captchaRetry: ['Sicherheitsprüfung neu laden', 'Повторить проверку безопасности'],
	noScript: [
		'Bitte aktivieren Sie JavaScript, um diese Anfrage auszufüllen.',
		'Для заполнения заявки включите JavaScript.',
	],
	closedTitle: ['Diese Gruppe ist bereits belegt', 'Эта группа уже укомплектована'],
	closedText: [
		'Für dieses Angebot nehmen wir zurzeit keine Anfragen an. Bitte wählen Sie ein anderes Angebot.',
		'Запись на это занятие сейчас закрыта. Пожалуйста, выберите другое занятие.',
	],
	closedBack: ['Zurück zum Stundenplan', 'Вернуться к расписанию'],
	closedChoose: ['Anderes Angebot wählen', 'Выбрать другое занятие'],
	closedError: [
		'Dieses Angebot ist belegt. Bitte wählen Sie ein anderes.',
		'Это занятие укомплектовано. Выберите другое.',
	],
	plannedLabel: ['Kurs in Planung', 'Курс в планировании'],
	plannedError: [
		'Dieser Kurs befindet sich in der Planung. Eine Probestunde ist dafür nicht möglich.',
		'Этот курс в планировании, пробное занятие на него невозможно.',
	],
	adminWaitlist: ['Warteliste', 'Лист ожидания'],
	adminWaitlistIntro: [
		'Geplante Kurse des aktuellen Stundenplans. Beträge gelten je Kind und Monat; die Anmeldung zur Warteliste ist erst mit einem Preis möglich. Solange es aktive Anmeldungen gibt, sind die Beträge gesperrt; die Mindestzahl bleibt änderbar.',
		'Плановые курсы текущего расписания. Суммы — за ребёнка в месяц; запись в лист возможна только после ввода цены. Пока есть активные записи, суммы заблокированы; минимум участников можно менять.',
	],
	adminWaitlistNone: [
		'Im aktuellen Stundenplan gibt es keine geplanten Kurse.',
		'В текущем расписании нет плановых курсов.',
	],
	adminWaitlistCatalogError: [
		'Der Stundenplan ist gerade nicht erreichbar; unten stehen nur die gespeicherten Preise.',
		'Расписание сейчас недоступно; ниже показаны только сохранённые цены.',
	],
	adminWaitlistAmbiguous: [
		'Zwei geplante Karten beschreiben denselben Kurs. Bitte die überzählige Karte im Stundenplan-Editor entfernen.',
		'Две плановые карточки описывают один курс. Уберите лишнюю карточку в редакторе расписания.',
	],
	adminWaitlistUnscheduled: ['Nicht im Stundenplan', 'Нет в расписании'],
	adminWaitlistUnscheduledIntro: [
		'Gespeicherte Preise, zu denen der aktuelle Stundenplan keine geplante Karte hat.',
		'Сохранённые цены, для которых в текущем расписании нет плановой карточки.',
	],
	monthlyContract: ['Monatsvertrag €/Monat', 'Месячный договор, €/мес.'],
	yearlyContract: ['Jahresvertrag €/Monat', 'Годовой договор, €/мес.'],
	minParticipants: ['Mindestteilnehmer', 'Минимум участников'],
	waitlistStatus: ['Status', 'Статус'],
	time: ['Uhrzeit', 'Время'],
	priceLockColumn: ['Sperre', 'Блокировка'],
	adminWaitlistStored: ['Gespeicherte Preise', 'Сохранённые цены'],
	importResult: ['Ergebnis', 'Результат'],
	importBefore: ['Bisher', 'Было'],
	importAfter: ['Neu', 'Станет'],
	save: ['Speichern', 'Сохранить'],
	saved: ['Gespeichert.', 'Сохранено.'],
	deletePrice: ['Preis löschen', 'Удалить цену'],
	priceLocked: ['gesperrt: {n} aktive Anmeldungen', 'заблокировано: активных записей — {n}'],
	unconfirmed: ['+{n} unbestätigt', '+{n} не подтверждено'],
	statusPriceMissing: ['Preis fehlt', 'Нет цены'],
	statusCollecting: ['sammelt: {n} von {m} Kindern', 'набор: {n} из {m} детей'],
	statusReady: [
		'Mindestzahl erreicht — Kurs kann gestartet werden',
		'Минимум набран — курс можно запускать',
	],
	statusStarted: ['gestartet: erster Termin {date}', 'стартовал: первое занятие {date}'],
	statusGone: [
		'Kurs nicht mehr im Stundenplan: {n} Familien warten',
		'Курса больше нет в расписании: ждут семей — {n}',
	],
	statusNotInSchedule: ['Nicht im Stundenplan', 'Нет в расписании'],
	statusAmbiguous: ['mehrdeutig', 'неоднозначно'],
	statusClosed: ['geschlossen', 'закрыт'],
	priceExport: ['Preisliste exportieren', 'Экспорт прайса'],
	priceImport: ['Preisliste importieren', 'Импорт прайса'],
	priceImportHint: [
		'CSV oder XLSX bis 256 KiB und 500 Zeilen. Zuerst erscheint eine Vorschau; übernommen wird erst mit „Anwenden“. Raum und Status werden nicht eingelesen.',
		'CSV или XLSX до 256 KiB и 500 строк. Сначала показывается предпросмотр; изменения вносятся только кнопкой «Применить». Кабинет и статус не читаются.',
	],
	priceImportFile: ['Datei', 'Файл'],
	priceImportPreview: ['Vorschau anzeigen', 'Показать предпросмотр'],
	priceImportApplied: ['Übernommene Zeilen: {n}.', 'Применено строк: {n}.'],
	priceImportNothing: ['Keine Änderungen zum Übernehmen.', 'Нечего применять.'],
	importLine: ['Zeile', 'Строка'],
	importNew: ['neuer Preis', 'новая цена'],
	importChange: ['Änderung', 'изменение'],
	importSame: ['ohne Änderung', 'без изменений'],
	importLocked: ['gesperrt', 'заблокировано'],
	importUnknown: ['Kurs nicht gefunden', 'курс не найден'],
	importError: ['Fehler', 'ошибка'],
	importCourseInvalid: [
		'Fach, Wochentag, Uhrzeit, Gebäude oder Lehrkraft fehlt oder ist ungültig',
		'предмет, день, время, здание или преподаватель не указаны или неверны',
	],
	importAmbiguous: ['mehrdeutiger Kurs', 'неоднозначный курс'],
	importDuplicate: ['Kurs mehrfach in der Datei', 'курс повторяется в файле'],
	importOnePrice: ['nur einer der beiden Beträge angegeben', 'указана только одна из двух сумм'],
	importPriceInvalid: [
		'Betrag ungültig (0,01 bis 1000,00 €, ohne Tausenderpunkt)',
		'неверная сумма (от 0,01 до 1000,00 €, без разделителя тысяч)',
	],
	importThresholdInvalid: ['Mindestzahl ungültig (1 bis 30)', 'неверный минимум (от 1 до 30)'],
	priceInvalid: [
		'Bitte beide Beträge zwischen 0,01 und 1000,00 € und eine Mindestzahl von 1 bis 30 eingeben.',
		'Введите обе суммы от 0,01 до 1000,00 € и минимум участников от 1 до 30.',
	],
	priceLockedError: [
		'Der Preis ist gesperrt: Für diesen Kurs gibt es aktive Anmeldungen. Die Mindestzahl kann geändert werden.',
		'Цена заблокирована: на курс есть активные записи. Минимум участников менять можно.',
	],
	importFileInvalid: [
		'Die Datei konnte nicht gelesen werden. Erwartet wird die exportierte Preisliste als CSV oder XLSX.',
		'Файл не удалось прочитать. Ожидается экспортированный прайс в CSV или XLSX.',
	],
	importFileMacro: [
		'Dateien mit Makros werden nicht angenommen.',
		'Файлы с макросами не принимаются.',
	],
	importFileEncrypted: [
		'Verschlüsselte Dateien und das alte XLS-Format werden nicht angenommen.',
		'Зашифрованные файлы и старый формат XLS не принимаются.',
	],
	importFileTooLarge: [
		'Die Datei ist zu groß: höchstens 256 KiB und 500 Zeilen.',
		'Файл слишком большой: не более 256 KiB и 500 строк.',
	],
	// Waitlist page, mail screens and withdrawal: approved texts of OQ-050/OQ-052, verbatim.
	waitlistTitle: ['Warteliste: {subject}', 'Лист ожидания: {subject}'],
	waitlistIntro: [
		'Dieser Kurs befindet sich in der Planung. Er beginnt, sobald mindestens {n} Kinder angemeldet sind. Tragen Sie sich in die Warteliste ein: Sobald der Kurs zustande kommt, schreiben wir Ihnen eine E-Mail mit dem ersten Termin.',
		'Этот курс сейчас в планировании. Он начнётся, как только запишутся минимум {n} детей. Запишитесь в лист ожидания: когда курс состоится, мы пришлём письмо с датой первого занятия.',
	],
	waitlistPrice: ['Monatlicher Beitrag je Kind', 'Ежемесячный взнос за ребёнка'],
	waitlistTariffMonthly: [
		'Monatsvertrag – {amount} € pro Monat',
		'Месячный договор — {amount} € в месяц',
	],
	waitlistTariffYearly: [
		'Jahresvertrag – {amount} € pro Monat',
		'Годовой договор — {amount} € в месяц',
	],
	waitlistContractNote: [
		'Der Vertrag wird vor Kursbeginn in unserem Büro abgeschlossen.',
		'Договор заключается до начала курса в нашем офисе.',
	],
	waitlistConsentOne: [
		'Ich melde mein Kind für diesen Kurs an. Kommt der Kurs zustande, verpflichte ich mich, vor dem ersten Termin in Ihrem Büro in der Villa der Kulturen einen Vertrag abzuschließen und den monatlichen Beitrag von {amount} € je Kind ({tariff}) zu zahlen.',
		'Я записываю ребёнка на этот курс. Если курс состоится, я обязуюсь до первого занятия заключить договор в вашем офисе в Villa der Kulturen и оплачивать ежемесячный взнос {amount} € за каждого ребёнка ({tariff}).',
	],
	waitlistConsentMany: [
		'Ich melde meine Kinder für diesen Kurs an. Kommt der Kurs zustande, verpflichte ich mich, vor dem ersten Termin in Ihrem Büro in der Villa der Kulturen einen Vertrag abzuschließen und den monatlichen Beitrag von {amount} € je Kind ({tariff}) zu zahlen.',
		'Я записываю детей на этот курс. Если курс состоится, я обязуюсь до первого занятия заключить договор в вашем офисе в Villa der Kulturen и оплачивать ежемесячный взнос {amount} € за каждого ребёнка ({tariff}).',
	],
	tariffMonthly: ['Monatsvertrag', 'Месячный договор'],
	tariffYearly: ['Jahresvertrag', 'Годовой договор'],
	waitlistSubmit: ['Auf die Warteliste setzen', 'Записаться в лист ожидания'],
	waitlistPrivacy: [
		'Ohne Bestätigung Ihrer E-Mail-Adresse werden die Daten Ihrer Anmeldung 14 Tage nach dem Absenden gelöscht. Nach der Bestätigung bleiben sie gespeichert, solange Sie auf der Warteliste stehen, höchstens 12 Monate. Nach dem Austragen oder nach Kursbeginn werden sie 90 Tage nach Abschluss der Bearbeitung durch unser Büro gelöscht.',
		'Без подтверждения email данные записи удаляются через 14 дней после отправки. После подтверждения они хранятся, пока вы стоите в листе ожидания, но не дольше 12 месяцев. После выхода из листа или начала курса — через 90 дней после завершения обработки бюро.',
	],
	waitlistConfirmed: [
		'Ihre E-Mail-Adresse wurde bestätigt. Sie stehen jetzt auf der Warteliste. Die Einzelheiten haben wir Ihnen per E-Mail geschickt.',
		'Email подтверждён. Вы в листе ожидания. Подробности мы отправили письмом.',
	],
	waitlistPriceMissing: [
		'Die Anmeldung zur Warteliste für diesen Kurs ist bald möglich. Bei Fragen rufen Sie uns an: {phone}.',
		'Запись в лист ожидания на этот курс скоро откроется. Если есть вопросы — позвоните нам: {phone}.',
	],
	waitlistUnavailable: [
		'Für diesen Kurs ist eine Anmeldung zur Warteliste derzeit nicht möglich. Bitte rufen Sie uns an: {phone}.',
		'Запись в лист ожидания на этот курс сейчас невозможна. Пожалуйста, позвоните нам: {phone}.',
	],
	waitlistStarted: [
		'Dieser Kurs ist bereits gestartet (erster Termin: {date}). Wenn Sie teilnehmen möchten, rufen Sie uns bitte an: {phone}.',
		'Этот курс уже стартовал (первое занятие: {date}). Если хотите присоединиться, позвоните нам: {phone}.',
	],
	waitlistChanged: [
		'Die Angaben zu diesem Kurs haben sich geändert. Bitte melden Sie sich erneut an oder rufen Sie uns an: {phone}.',
		'Данные этого курса изменились. Пожалуйста, запишитесь заново или позвоните нам: {phone}.',
	],
	withdrawQuestion: [
		'Von der Warteliste für {subject} austragen?',
		'Выйти из листа ожидания на курс {subject}?',
	],
	withdrawButton: ['Austragen', 'Выйти'],
	withdrawDone: ['Sie wurden von der Warteliste ausgetragen.', 'Вы вышли из листа ожидания.'],
	withdrawStarted: [
		'Der Kurs hat bereits begonnen. Bitte wenden Sie sich an unser Büro: {phone}.',
		'Курс уже стартовал. Пожалуйста, свяжитесь с бюро: {phone}.',
	],
	// Service texts of the waitlist outside the approved list.
	waitlistHeading: ['Warteliste', 'Лист ожидания'],
	minutes: ['{n} Min.', '{n} мин.'],
	waitlistTariffRequired: ['Bitte wählen Sie einen Tarif.', 'Выберите тариф.'],
	waitlistConsentRequired: [
		'Bitte bestätigen Sie die Erklärung zur Anmeldung und zum Beitrag.',
		'Подтвердите согласие с записью и взносом.',
	],
	waitlistPriceChanged: [
		'Der Beitrag für diesen Kurs wurde geändert. Bitte prüfen Sie den neuen Betrag und bestätigen Sie die Erklärung erneut.',
		'Взнос за этот курс изменился. Проверьте новую сумму и снова отметьте согласие.',
	],
	waitlistConfirmTitle: ['Anmeldung bestätigen', 'Подтвердить запись'],
	waitlistConfirmHint: [
		'Bestätigen Sie Ihre E-Mail-Adresse. Erst danach stehen Sie auf der Warteliste.',
		'Подтвердите email. Только после этого вы окажетесь в листе ожидания.',
	],
	withdrawTitle: ['Von der Warteliste austragen', 'Выход из листа ожидания'],
	withdrawInvalid: [
		'Dieser Link ist ungültig oder nicht mehr gültig.',
		'Ссылка недействительна или больше не действует.',
	],
	adminWaitlistEntries: ['Anmeldungen', 'Записи'],
	adminWaitlistNoEntries: [
		'Noch keine bestätigten Anmeldungen.',
		'Подтверждённых записей пока нет.',
	],
	adminWaitlistOpen: ['Anmeldung öffnen', 'Открыть запись'],
	adminWaitlistCompact: [
		'Warteliste: {n} Kurse, {m} Kinder',
		'Лист ожидания: курсов — {n}, детей — {m}',
	],
	adminWaitlistAttention: ['Warteliste: bitte prüfen', 'Лист ожидания: требует внимания'],
	adminWaitlistAttentionLink: ['Zur Warteliste', 'К листу ожидания'],
	entryWaiting: ['wartet', 'ожидает'],
	entryStarted: ['gestartet', 'стартовал'],
	entryWithdrawn: ['ausgetragen', 'вышел'],
	entryCancelled: ['beim Start storniert', 'отменена при старте'],
	entryExpired: ['abgelaufen', 'истекла'],
	waitlistEntry: ['Anmeldung zur Warteliste', 'Запись в лист ожидания'],
	tariff: ['Tarif', 'Тариф'],
	perChildMonth: ['{amount} € pro Monat je Kind', '{amount} € в месяц за ребёнка'],
	shownSums: ['Angezeigte Beträge', 'Показанные суммы'],
	thresholdAtSignup: ['Mindestzahl bei der Anmeldung', 'Минимум при записи'],
	consentGiven: ['Zustimmung (Version, Zeitpunkt)', 'Согласие (версия, время)'],
	entryStatus: ['Status der Anmeldung', 'Статус записи'],
	ageCheckDate: ['Alter geprüft zum', 'Возраст проверен на'],
	withdrawAdmin: ['Aus der Warteliste austragen', 'Вывести из листа ожидания'],
	withdrawAdminHint: [
		'Nach einem Anruf der Familie. Die Familie erhält keine Nachricht; ihre Kinder zählen nicht mehr.',
		'По звонку семьи. Семья уведомления не получает; её дети больше не считаются.',
	],
	processedWaiting: [
		'„Bearbeitet“ ist erst nach Start, Austragen oder Storno möglich.',
		'«Обработано» доступно только после старта, выхода или отмены.',
	],
	outboxWaitlist: ['Warteliste', 'Лист ожидания'],
	outboxWaitlistTemplate: [
		'Büro-Benachrichtigung über eine Anmeldung zur Warteliste',
		'Уведомление бюро о записи в лист ожидания',
	],
	// Course start of the waitlist (WL-10), admin only; the letters themselves are German.
	startCourse: ['Kurs starten', 'Запустить курс'],
	startProbeOpen: ['Probe-E-Mail vorbereiten', 'Подготовить пробное письмо'],
	startDialogTitle: ['Kurs starten: {subject}', 'Запуск курса: {subject}'],
	startDialogIntro: [
		'Prüfen Sie Termin, Ort und Empfänger. Die Probe-E-Mail zeigt Ihnen E-Mail und PDF einer Familie, bevor alle Familien sie erhalten.',
		'Проверьте дату, место и получателей. Пробное письмо покажет вам письмо и PDF одной семьи до отправки всем семьям.',
	],
	startFirstDate: ['Erster Termin', 'Первое занятие'],
	startRecipients: [
		'Empfänger: {n} Familien, {m} Kinder',
		'Получатели: семей — {n}, детей — {m}',
	],
	startUnconfirmed: [
		'Unbestätigte Anmeldungen ({n}) werden beim Start storniert.',
		'Неподтверждённые записи ({n}) при старте будут отменены.',
	],
	startFamily: ['Familie für Vorschau und Probe', 'Семья для предпросмотра и пробы'],
	startLetter: ['Text der E-Mail', 'Текст письма'],
	startProbe: ['Probe-E-Mail an mich', 'Пробное письмо мне'],
	startProbeSent: [
		'Die Probe-E-Mail mit PDF ist an Ihre Adresse eingeplant. An den Anmeldungen ändert sich nichts.',
		'Пробное письмо с PDF поставлено на отправку на ваш адрес. Записи не меняются.',
	],
	startChecked: ['Termin, Ort und Empfänger geprüft', 'Дата, место и получатели проверены'],
	startConfirm: ['Start bestätigen', 'Подтвердить старт'],
	startFinal: [
		'Ein Start lässt sich nicht zurücknehmen, sein Termin nicht ändern. Jede Familie erhält danach ihre E-Mail mit PDF.',
		'Старт нельзя отменить, а его дату — изменить. Затем каждая семья получит письмо с PDF.',
	],
	startDone: [
		'Der Kurs ist gestartet. Die E-Mails an die Familien sind eingeplant.',
		'Курс запущен. Письма семьям поставлены на отправку.',
	],
	closeDialog: ['Schließen', 'Закрыть'],
	startBlocked: ['Start nicht möglich: {reason}', 'Старт невозможен: {reason}'],
	startBlockStarted: ['bereits gestartet', 'уже стартовал'],
	startBlockNotInSchedule: ['nicht im Stundenplan', 'нет в расписании'],
	startBlockAmbiguous: ['zwei Karten desselben Kurses', 'две карточки одного курса'],
	startBlockClosed: ['als belegt markiert', 'отмечен как укомплектованный'],
	startBlockPriceMissing: ['Preis fehlt', 'нет цены'],
	startBlockRenderer: ['PDF-Erzeugung nicht eingerichtet', 'формирование PDF не настроено'],
	startBlockThreshold: ['Mindestzahl noch nicht erreicht', 'минимум участников ещё не набран'],
	startBlockNoEntries: ['noch keine bestätigte Anmeldung', 'нет подтверждённых записей'],
	startDateInvalid: [
		'Dieser Termin ist nicht mehr wählbar. Bitte laden Sie die Seite neu.',
		'Эту дату больше нельзя выбрать. Обновите страницу.',
	],
	startUnchecked: [
		'Bitte bestätigen Sie, dass Termin, Ort und Empfänger geprüft sind.',
		'Подтвердите, что дата, место и получатели проверены.',
	],
	statusRenameHint: [
		'Bitte die Gruppe im Stundenplan umbenennen: Die Karte steht noch als Kurs in Planung.',
		'Переименуйте группу в расписании: карточка всё ещё помечена как курс в планировании.',
	],
	adminStartLettersUnsent: [
		'E-Mails zum Kursstart noch nicht versendet: {n}',
		'Писем о старте ещё не отправлено: {n}',
	],
	adminStartLettersDead: [
		'E-Mails zum Kursstart nicht zugestellt: {n}',
		'Писем о старте не доставлено: {n}',
	],
	entryStartTitle: ['Kursstart', 'Старт курса'],
	entryStartedAt: ['Gestartet am', 'Запущен'],
	entryParticipants: ['Kinder beim Start', 'Детей при старте'],
	startLetterTitle: ['E-Mail zum Kursstart', 'Письмо о старте'],
	letterAttempts: ['Versuche: {n}', 'Попыток: {n}'],
	letterRetry: ['Erneut senden', 'Отправить повторно'],
	pdfView: ['PDF ansehen', 'Открыть PDF'],
	pdfPending: [
		'Das PDF entsteht beim ersten Versand der E-Mail.',
		'PDF создаётся при первой отправке письма.',
	],
	pdfStored: ['PDF gespeichert: {date}, {size} KB', 'PDF сохранён: {date}, {size} КБ'],
	adminTitle: ['Anfragen für Probestunden', 'Заявки на пробные занятия'],
	adminGroups: ['Belegte Angebote', 'Укомплектованные занятия'],
	adminGroupsIntro: [
		'Ein belegtes Angebot nimmt keine Anfragen mehr an. Die Sperre gilt für Fach, Gruppe und Wochentag und bleibt auch nach einer Zeit- oder Raumänderung bestehen.',
		'Укомплектованное занятие больше не принимает заявки. Отметка действует на предмет, группу и день недели и сохраняется при смене времени или кабинета.',
	],
	adminGroupsClosed: ['Belegt', 'Укомплектовано'],
	adminGroupsStale: [
		'Diese Sperren passen zu keinem Angebot des aktuellen Stundenplans.',
		'Эти отметки не совпадают ни с одним занятием текущего расписания.',
	],
	adminGroupsRemove: ['Eintrag entfernen', 'Удалить отметку'],
	adminGroupsCatalogError: [
		'Der Stundenplan ist gerade nicht erreichbar; unten stehen nur die gespeicherten Sperren.',
		'Расписание сейчас недоступно; ниже показаны только сохранённые отметки.',
	],
	adminGroupsMatches: ['Betroffene Angebote', 'Затронуто занятий'],
	adminIntro: [
		'Bestätigte Anfragen. Eine Zeile je Angebot; die Bearbeitung gilt für die gesamte Anfrage.',
		'Подтверждённые заявки. Одна строка на занятие; отметка обработки относится ко всей заявке.',
	],
	filters: ['Filter und Sortierung', 'Фильтры и сортировка'],
	subject: ['Fach', 'Предмет'],
	teacher: ['Lehrkraft', 'Преподаватель'],
	day: ['Wochentag', 'День недели'],
	building: ['Gebäude', 'Здание'],
	room: ['Raum', 'Кабинет'],
	parentSurname: ['Nachname des Elternteils', 'Фамилия родителя'],
	childSurname: ['Nachname des Kindes', 'Фамилия ребёнка'],
	status: ['Bearbeitung', 'Обработка'],
	verified: ['Unbearbeitet', 'Не обработано'],
	processed: ['Bearbeitet', 'Обработано'],
	all: ['Alle', 'Все'],
	sort: ['Sortieren nach', 'Сортировать по'],
	received: ['Eingang', 'Время поступления'],
	created: ['Abgesendet', 'Отправлена'],
	confirmed: ['E-Mail bestätigt', 'Email подтверждён'],
	direction: ['Reihenfolge', 'Порядок'],
	asc: ['Aufsteigend', 'По возрастанию'],
	desc: ['Absteigend', 'По убыванию'],
	apply: ['Anwenden', 'Применить'],
	reset: ['Zurücksetzen', 'Сбросить'],
	total: ['Angebote gefunden', 'Найдено занятий'],
	details: ['Gesamte Anfrage öffnen', 'Открыть всю заявку'],
	previous: ['Zurück', 'Назад'],
	next: ['Weiter', 'Вперёд'],
	page: ['Seite', 'Страница'],
	empty: ['Keine Anfragen für diese Auswahl.', 'Для выбранных фильтров заявок нет.'],
	request: ['Anfrage', 'Заявка'],
	parent: ['Elternteil', 'Родитель'],
	markProcessed: [
		'Gesamte Anfrage als bearbeitet markieren',
		'Отметить всю заявку как обработанную',
	],
	reopen: ['Gesamte Anfrage wieder öffnen', 'Вернуть всю заявку в необработанные'],
	processedHint: [
		'Nach dem telefonischen Kontakt. Es werden keine Plätze gebucht oder Nachrichten versendet.',
		'После телефонного контакта. Эта отметка не зачисляет детей и не отправляет уведомлений.',
	],
	backList: ['Zur Anfragenliste', 'К списку заявок'],
	delivery: ['Benachrichtigungen an das Büro', 'Уведомления бюро'],
	deliveryPart: ['Teil', 'Часть'],
	deliveryUnknownHint: [
		'diesen Code im Büro-Chat suchen und über „Zustellung prüfen / wiederherstellen“ entscheiden.',
		'найдите этот код в чате бюро и примите решение по кнопке «Проверить / восстановить доставку».',
	],
	deliveryAttention: [
		'Eine Büro-Benachrichtigung muss geprüft werden',
		'Уведомление бюро требует проверки',
	],
	deliveryAttentionUnknown: [
		'Bei mindestens einer Telegram-Nachricht ist unklar, ob sie im Büro-Chat angekommen ist. Weitere Teile derselben Anfrage warten auf Ihre Entscheidung.',
		'Минимум для одного сообщения Telegram неизвестно, дошло ли оно в чат бюро. Следующие части той же заявки ждут вашего решения.',
	],
	deliveryAttentionDead: [
		'Mindestens eine Telegram-Nachricht konnte nicht zugestellt werden. Andere Anfragen werden normal gesendet; diese Nachricht wartet auf Ihre Entscheidung.',
		'Минимум одно сообщение Telegram не удалось доставить. Другие заявки отправляются как обычно; это сообщение ждёт вашего решения.',
	],
	deliveryAttentionLink: ['Zustellung prüfen', 'Проверить доставку'],
	outboxReceived: ['eingegangen', 'получена'],
	outboxOpen: ['Anfrage öffnen', 'Открыть заявку'],
	outboxDeleted: [
		'Anfrage nach Ablauf der Aufbewahrungsfrist gelöscht',
		'Заявка удалена по сроку хранения',
	],
	recovery: ['Zustellung prüfen / wiederherstellen', 'Проверить / восстановить доставку'],
	emailQueue: [
		'Prüf-E-Mails: ausstehende Zustellungen',
		'Проверочные письма: ожидающие отправки',
	],
	emailQueueHint: [
		'Technische Warteschlange, noch keine bestätigten Anfragen. Bis zu 50 Einträge.',
		'Техническая очередь, ещё не подтверждённые заявки. До 50 записей.',
	],
	emailRetry: ['Zustellung erneut einplanen', 'Повторно поставить на отправку'],
	emailQueued: ['Die Zustellung wurde erneut eingeplant.', 'Повторная отправка запланирована.'],
	emailExpired: [
		'Falls der Eintrag nicht erneut eingeplant wurde, ist der Link abgelaufen oder ersetzt. Ein neues Schreiben kann über die Anfrageseite angefordert werden.',
		'Если повторная отправка не запланирована, срок ссылки истёк или она заменена. Новое письмо запрашивается на странице заявки.',
	],
	operations: ['Betrieb', 'Операции'],
	outbox: ['Zustellung', 'Доставка'],
	login: ['Büro-Anmeldung', 'Вход для бюро'],
	logout: ['Abmelden', 'Выйти'],
} satisfies Record<string, readonly [string, string]>;
export type TextKey = keyof typeof text;
export function t(locale: Locale, key: TextKey): string {
	return text[key][locale === 'ru' ? 1 : 0];
}
export function dayLabel(day: number, locale: Locale): string {
	return (
		(locale === 'ru'
			? ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
			: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'])[
			day - 1
		] ?? ''
	);
}
/** Russian noun after a number: 1 год, 2–4 года, 5 лет; `from` is the genitive of «от N». */
function russianYears(n: number, from = false): string {
	const one = n % 10 === 1 && n % 100 !== 11;
	if (from) return one ? 'года' : 'лет';
	if (one) return 'год';
	return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'года' : 'лет';
}
export function ageRangeLabel(range: AgeRange, locale: Locale): string {
	const { min, max } = range;
	if (locale === 'ru') {
		if (max === undefined) return `от ${min} ${russianYears(min, true)}`;
		return `${min === max ? min : `${min}–${max}`} ${russianYears(max)}`;
	}
	if (max === undefined) return `ab ${min} ${min === 1 ? 'Jahr' : 'Jahren'}`;
	return `${min === max ? min : `${min}–${max}`} ${max === 1 ? 'Jahr' : 'Jahre'}`;
}
export function formatDate(date: string, locale: Locale): string {
	return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'de-DE', {
		timeZone: 'Europe/Berlin',
		dateStyle: 'medium',
	}).format(new Date(date));
}
export function formatTimestamp(date: string, locale: Locale): string {
	return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'de-DE', {
		timeZone: 'Europe/Berlin',
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(date));
}
/** Fills `{name}` placeholders of a text. */
export function fill(text: string, values: Record<string, string | number>): string {
	return text.replace(/\{(\w+)\}/gu, (match, name: string) =>
		name in values ? String(values[name]) : match
	);
}
/** WL-07 status line of a waitlist course; empty while the schedule cannot be read. */
export function waitlistStatusText(
	course: Pick<WaitlistCourse, 'status' | 'children' | 'price' | 'firstDate' | 'activeEntries'>,
	locale: Locale
): string {
	if (!course.status) return '';
	const key = (
		{
			price_missing: 'statusPriceMissing',
			collecting: 'statusCollecting',
			ready: 'statusReady',
			started: 'statusStarted',
			gone: 'statusGone',
			not_in_schedule: 'statusNotInSchedule',
			ambiguous: 'statusAmbiguous',
			closed: 'statusClosed',
		} as const
	)[course.status];
	return fill(t(locale, key), {
		n: course.status === 'gone' ? course.activeEntries : course.children,
		m: course.price?.minParticipants ?? 0,
		date: course.firstDate ? formatDate(course.firstDate, locale) : '',
	});
}
export function tariffLabel(tariff: WaitlistTariff, locale: Locale): string {
	return t(locale, tariff === 'monthly' ? 'tariffMonthly' : 'tariffYearly');
}
/** The consent tick of WL-04 with the chosen tariff and sum; one or several children. */
export function waitlistConsentText(
	locale: Locale,
	tariff: WaitlistTariff,
	cents: number,
	children: number
): string {
	return fill(t(locale, children > 1 ? 'waitlistConsentMany' : 'waitlistConsentOne'), {
		amount: euroAmount(cents),
		tariff: tariffLabel(tariff, locale),
	});
}
export function entryStatusText(status: WaitlistEntryStatus, locale: Locale): string {
	return t(
		locale,
		(
			{
				waiting: 'entryWaiting',
				started: 'entryStarted',
				withdrawn: 'entryWithdrawn',
				cancelled: 'entryCancelled',
				expired: 'entryExpired',
			} as const
		)[status]
	);
}
/** The reason next to a course that cannot be started or probed yet. */
export function startBlockText(block: WaitlistStartBlock, locale: Locale): string {
	return t(
		locale,
		(
			{
				started: 'startBlockStarted',
				not_in_schedule: 'startBlockNotInSchedule',
				ambiguous: 'startBlockAmbiguous',
				closed: 'startBlockClosed',
				price_missing: 'startBlockPriceMissing',
				renderer: 'startBlockRenderer',
				threshold: 'startBlockThreshold',
				no_entries: 'startBlockNoEntries',
			} as const
		)[block]
	);
}
/** The delivery page names a waitlist notification by its kind of request. */
export function outboxTemplateLabel(context: IntakeOutboxContext | undefined, locale: Locale) {
	return context && !context.deleted && context.kind === 'waitlist'
		? t(locale, 'outboxWaitlistTemplate')
		: null;
}
/** Reasons of an import row: codes of the price import service. */
export function importReasonKey(code: string | null): TextKey {
	return (
		(
			{
				WAITLIST_IMPORT_COURSE_INVALID: 'importCourseInvalid',
				WAITLIST_IMPORT_AMBIGUOUS: 'importAmbiguous',
				WAITLIST_IMPORT_DUPLICATE: 'importDuplicate',
				WAITLIST_IMPORT_ONE_PRICE: 'importOnePrice',
				WAITLIST_IMPORT_PRICE_INVALID: 'importPriceInvalid',
				WAITLIST_IMPORT_THRESHOLD_INVALID: 'importThresholdInvalid',
			} as Record<string, TextKey>
		)[code ?? ''] ?? 'importError'
	);
}
export function errorKey(code: string): TextKey {
	if (code.includes('RATE_LIMIT') || code === 'INTAKE_RESEND_COOLDOWN') return 'rateLimit';
	return (
		(
			{
				INTAKE_DATE_INVALID: 'dateError',
				INTAKE_DATE_HOLIDAY: 'holidayError',
				INTAKE_CHILD_TOO_YOUNG: 'ageError',
				INTAKE_AGE_UNCONFIRMED: 'ageConfirmError',
				INTAKE_BIRTH_DATE_INVALID: 'birthError',
				INTAKE_LESSON_UNAVAILABLE: 'stale',
				INTAKE_LESSON_CLOSED: 'closedError',
				INTAKE_LESSON_PLANNED: 'plannedError',
				WAITLIST_CONSENT_REQUIRED: 'waitlistConsentRequired',
				WAITLIST_PRICE_CHANGED: 'waitlistPriceChanged',
				WAITLIST_ENTRY_WAITING: 'processedWaiting',
				WAITLIST_WITHDRAW_INVALID: 'withdrawInvalid',
				WAITLIST_PRICE_INVALID: 'priceInvalid',
				WAITLIST_PRICE_LOCKED: 'priceLockedError',
				WAITLIST_START_STARTED: 'startBlockStarted',
				WAITLIST_START_NOT_IN_SCHEDULE: 'startBlockNotInSchedule',
				WAITLIST_START_AMBIGUOUS: 'startBlockAmbiguous',
				WAITLIST_START_CLOSED: 'startBlockClosed',
				WAITLIST_START_PRICE_MISSING: 'startBlockPriceMissing',
				WAITLIST_START_RENDERER: 'startBlockRenderer',
				WAITLIST_START_THRESHOLD: 'startBlockThreshold',
				WAITLIST_START_NO_ENTRIES: 'startBlockNoEntries',
				WAITLIST_START_DATE_INVALID: 'startDateInvalid',
				WAITLIST_START_UNCHECKED: 'startUnchecked',
				WAITLIST_IMPORT_INVALID: 'importFileInvalid',
				WAITLIST_IMPORT_MACRO: 'importFileMacro',
				WAITLIST_IMPORT_ENCRYPTED: 'importFileEncrypted',
				WAITLIST_IMPORT_TOO_LARGE: 'importFileTooLarge',
				WAITLIST_IMPORT_TOO_MANY_ROWS: 'importFileTooLarge',
				INTAKE_CATALOG_UNAVAILABLE: 'unavailable',
				INTAKE_MAINTENANCE: 'maintenance',
				INTAKE_INPUT_INVALID: 'inputError',
				INTAKE_BODY_TOO_LARGE: 'tooLarge',
				INTAKE_TURNSTILE_REJECTED: 'captcha',
			} as Record<string, TextKey>
		)[code] ?? 'error'
	);
}

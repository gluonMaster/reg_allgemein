import { ORGANIZATION_NAME } from '$lib/organization';
export type Locale = 'de' | 'ru';
const text = {
	title: ['Probestunde anfragen', 'Запросить пробное занятие'],
	intro: [
		'Wählen Sie Ihre Wunschtermine. Nach der E-Mail-Bestätigung meldet sich unser Büro telefonisch bei Ihnen.',
		'Выберите желаемые даты. После подтверждения email бюро свяжется с вами по телефону.',
	],
	dateNotice: [
		'Die Termine sind Wünsche. Platz und Besuch werden vom Büro bestätigt.',
		'Это желаемые даты. Место и посещение согласует бюро.',
	],
	selected: ['Ihr ausgewähltes Angebot', 'Выбранное занятие'],
	contacts: ['Ihre Kontaktdaten', 'Ваши контактные данные'],
	firstName: ['Vorname', 'Имя'],
	lastName: ['Nachname', 'Фамилия'],
	email: ['E-Mail-Adresse', 'Email'],
	phone: ['Telefonnummer', 'Телефон'],
	children: ['Kinder', 'Дети'],
	child: ['Kind', 'Ребёнок'],
	birthDate: ['Geburtsdatum', 'Дата рождения'],
	addChild: ['Kind hinzufügen', 'Добавить ребёнка'],
	remove: ['Entfernen', 'Удалить'],
	lessons: ['Angebote und Wunschtermine', 'Занятия и желаемые даты'],
	addLesson: ['Angebot hinzufügen', 'Добавить занятие'],
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
	submit: ['Anfrage absenden', 'Подать запрос'],
	busy: ['Bitte warten …', 'Подождите …'],
	privacy: [
		'Ohne Bestätigung Ihrer E-Mail-Adresse werden die Daten Ihrer Anfrage 14 Tage nach dem Absenden gelöscht. Nach der Bestätigung werden sie 90 Tage nach Abschluss der Bearbeitung durch unser Büro gelöscht.',
		'Без подтверждения email данные заявки удаляются через 14 дней после отправки. После подтверждения — через 90 дней после обработки заявки администратором.',
	],
	checkMail: ['Bitte prüfen Sie Ihr Postfach', 'Проверьте почту'],
	mailHint: [
		'Bestätigen Sie Ihre Anfrage über den Link in der E-Mail. Bitte prüfen Sie auch Ihren Spam-Ordner.',
		'Подтвердите заявку по ссылке в письме. Проверьте также папку «Спам».',
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
		'Ihre E-Mail-Adresse wurde bestätigt. Ihre Anfrage wurde an unser Büro weitergeleitet. Wir melden uns bei Ihnen.',
		'Email подтверждён. Заявка передана в бюро. Мы свяжемся с вами.',
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
	adminTitle: ['Anfragen für Probestunden', 'Заявки на пробные занятия'],
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
export function buildingLabel(value: string): string {
	return value === 'Kolibri' ? ORGANIZATION_NAME : value;
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
export function errorKey(code: string): TextKey {
	if (code.includes('RATE_LIMIT') || code === 'INTAKE_RESEND_COOLDOWN') return 'rateLimit';
	return (
		(
			{
				INTAKE_DATE_INVALID: 'dateError',
				INTAKE_BIRTH_DATE_INVALID: 'birthError',
				INTAKE_LESSON_UNAVAILABLE: 'stale',
				INTAKE_CATALOG_UNAVAILABLE: 'unavailable',
				INTAKE_MAINTENANCE: 'maintenance',
				INTAKE_INPUT_INVALID: 'inputError',
				INTAKE_BODY_TOO_LARGE: 'tooLarge',
				INTAKE_TURNSTILE_REJECTED: 'captcha',
			} as Record<string, TextKey>
		)[code] ?? 'error'
	);
}

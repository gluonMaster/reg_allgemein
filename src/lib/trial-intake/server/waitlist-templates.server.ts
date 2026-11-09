import { ORGANIZATION_NAME } from '$lib/organization';
import type { EmailMessage } from '$lib/server/outbox/providers';
import type { Lesson } from '../contracts';
import { ageFit, lessonAgeRange } from '../age';
import { nextLessonDate } from '../dates';
import { ageRangeLabel } from '../i18n';
import { euroAmount } from '../prices';
import type { IntakeDetail, WaitlistEntry } from './model.server';
import {
	BUILDING_ADDRESS,
	DAYS,
	ORGANIZATION_PHONE,
	buildingLabel,
	htmlMessage,
	splitTelegram,
} from './templates.server';

// Letters and the Telegram notification of a waitlist signup: approved texts of
// TRIAL_INTAKE_WAITLIST "Texte" (OQ-050), German only. The sum always comes from the snapshot.
const TARIFF = { monthly: 'Monatsvertrag', yearly: 'Jahresvertrag' } as const;
type Entry = Pick<
	WaitlistEntry,
	'lesson_json' | 'tariff' | 'monthly_cents' | 'yearly_cents' | 'min_participants' | 'created_at'
>;
export const entryLesson = (entry: Pick<WaitlistEntry, 'lesson_json'>) =>
	JSON.parse(entry.lesson_json) as Lesson;
/** The monthly sum per child of the tariff the family chose. */
export const entryCents = (entry: Pick<Entry, 'tariff' | 'monthly_cents' | 'yearly_cents'>) =>
	entry.tariff === 'monthly' ? entry.monthly_cents : entry.yearly_cents;
const tariffLine = (entry: Entry) =>
	`Tarif: ${TARIFF[entry.tariff]}, ${euroAmount(entryCents(entry))} € pro Monat je Kind`;
/** The lesson date the age was checked against at signup: the next allowed date of its weekday. */
export const entryAgeDate = (entry: Pick<Entry, 'lesson_json' | 'created_at'>) =>
	nextLessonDate(entryLesson(entry).weekday, entry.created_at);
/** Children outside the course age; an older one passed submit only with the acknowledgment. */
function ageMismatches(detail: IntakeDetail, entry: Entry) {
	const range = lessonAgeRange(entryLesson(entry));
	const date = entryAgeDate(entry);
	return detail.children.flatMap((child, index) => {
		const fit = ageFit(range, child.birth_date, date);
		return fit === 'ok' || !range
			? []
			: [{ child, index, fit, label: ageRangeLabel(range, 'de') }];
	});
}
const childName = (c: IntakeDetail['children'][number]) => `${c.first_name} ${c.last_name}`;

export function waitlistVerificationEmail(
	detail: IntakeDetail,
	entry: Entry,
	link: string
): EmailMessage {
	const lesson = entryLesson(entry);
	const message: EmailMessage = {
		to: detail.request.email,
		subject: `Bitte bestätigen Sie Ihre Anmeldung zur Warteliste beim ${ORGANIZATION_NAME}`,
		text:
			`Sie möchten sich beim ${ORGANIZATION_NAME} für folgenden Kurs auf die Warteliste setzen lassen:\n\n` +
			`${lesson.subject} (in Planung) — ${DAYS[lesson.weekday]}, ${lesson.start}–${lesson.end}, ${buildingLabel(lesson.building)}\n` +
			`${tariffLine(entry)}\n\n` +
			'Bitte bestätigen Sie Ihre E-Mail-Adresse über die Schaltfläche „Anmeldung bestätigen“. Erst danach stehen Sie auf der Warteliste.\n\n' +
			`Anmeldung bestätigen: ${link}\n\n` +
			'Nach der Bestätigung erhalten Sie eine E-Mail mit allen Angaben zu Ihrer Anmeldung.\n\n' +
			ORGANIZATION_NAME,
	};
	message.html = htmlMessage(message.text, { label: 'Anmeldung bestätigen', link });
	return message;
}
/** After the e-mail confirmation: course, children, tariff, start rule and the withdrawal link. */
export function waitlistConfirmationEmail(
	detail: IntakeDetail,
	entry: Entry,
	withdrawLink: string
): EmailMessage {
	const lesson = entryLesson(entry);
	const message: EmailMessage = {
		to: detail.request.email,
		subject: `Sie stehen auf der Warteliste: ${lesson.subject} — ${ORGANIZATION_NAME}`,
		text:
			'Ihre Anmeldung zur Warteliste ist bei uns eingegangen.\n\n' +
			[
				`${detail.children.map(childName).join(', ')}: ${lesson.subject} (in Planung)`,
				`${DAYS[lesson.weekday]}, ${lesson.start}–${lesson.end}`,
				`${buildingLabel(lesson.building)}, ${BUILDING_ADDRESS[lesson.building] ?? ''}, Raum ${lesson.room}`,
				tariffLine(entry),
				...ageMismatches(detail, entry).map(
					(m) =>
						`Hinweis: ${childName(m.child)} ist am Wunschtermin ${m.fit === 'old' ? 'älter' : 'jünger'} als für diese Gruppe vorgesehen (${m.label}). Das Büro prüft, ob die Gruppe passt.`
				),
			].join('\n') +
			`\n\nDer Kurs beginnt, sobald mindestens ${entry.min_participants} Kinder angemeldet sind. Dann schreiben wir Ihnen eine E-Mail mit dem ersten Termin und einer Bestätigung als PDF. Vor dem ersten Termin schließen Sie den Vertrag in unserem Büro in der Villa der Kulturen ab.\n\n` +
			`Sie möchten nicht mehr auf der Warteliste stehen? Austragen: ${withdrawLink}\n\n` +
			'Bei Bedarf melden wir uns bei Ihnen.\n\n' +
			`Tel. ${ORGANIZATION_PHONE}\n${ORGANIZATION_NAME}`,
	};
	message.html = htmlMessage(message.text, undefined, withdrawLink);
	return message;
}
/**
 * WL-08: one notification per confirmed signup. The queue line is computed before the
 * confirming transaction, so simultaneous confirmations may show an approximate count.
 */
export function waitlistTelegramParts(
	detail: IntakeDetail,
	entry: Entry,
	queue: { children: number; minParticipants: number; reached: boolean }
): string[] {
	const r = detail.request;
	const lesson = entryLesson(entry);
	return splitTelegram([
		ORGANIZATION_NAME,
		...(queue.reached ? ['Mindestteilnehmerzahl erreicht – Kurs kann gestartet werden'] : []),
		'Neue Anmeldung zur Warteliste',
		`Kurs: ${lesson.subject} (in Planung)`,
		`${DAYS[lesson.weekday]} ${lesson.start}–${lesson.end}, ${buildingLabel(lesson.building)}, Raum ${lesson.room}`,
		`Lehrkraft: ${lesson.teacher}`,
		tariffLine(entry),
		`Eltern: ${r.parent_first_name} ${r.parent_last_name}`,
		`Telefon: ${r.phone}`,
		`E-Mail: ${r.email}`,
		'Kinder:',
		...detail.children.map(
			(c, index) => `${index + 1}. ${childName(c)}; geboren: ${c.birth_date}`
		),
		...ageMismatches(detail, entry).map(
			(m) =>
				`Alter: Kind ${m.index + 1} ${m.fit === 'old' ? 'älter' : 'jünger'} als die Gruppe (${m.label})${m.fit === 'old' ? ', Hinweis bestätigt' : ''}`
		),
		`Warteliste: ${queue.children} von ${queue.minParticipants} Kindern`,
	]);
}

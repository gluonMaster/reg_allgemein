import { ORGANIZATION_NAME } from '$lib/organization';
import { euroAmount } from '$lib/trial-intake/prices';
import { fill, t, waitlistConsentText } from '$lib/trial-intake/i18n';
import {
	waitlistConfirmationEmail,
	waitlistTelegramParts,
	waitlistVerificationEmail,
} from '$lib/trial-intake/server/waitlist-templates.server';
import type { IntakeDetail } from '$lib/trial-intake/server/model.server';

// Approved texts of TRIAL_INTAKE_WAITLIST "Тексты" (OQ-050): these tests pin them verbatim.
const lesson = {
	id: 'a'.repeat(64),
	subject: '1 E',
	group: 'Der Kurs befindet sich in der Planung 1',
	weekday: 2,
	start: '16:00',
	end: '16:45',
	teacher: 'Lehrkraft A',
	room: 'R2',
	building: 'Kolibri' as const,
};
// Created on a Wednesday: the age is checked on the next Tuesday, 2026-09-22.
const entry = {
	lesson_json: JSON.stringify(lesson),
	tariff: 'yearly' as const,
	monthly_cents: 6650,
	yearly_cents: 5905,
	min_participants: 3,
	created_at: '2026-09-16T12:00:00.000Z',
};
const child = (id: string, first: string, last: string, birth: string, position: number) => ({
	id,
	request_id: 'r',
	position,
	first_name: first,
	last_name: last,
	birth_date: birth,
});
const detail = {
	request: {
		id: 'r',
		email: 'guest@example.test',
		parent_first_name: 'Anna',
		parent_last_name: 'Muster',
		phone: '+49 000000000',
	},
	// Six on the lesson date fits 5-6; eight is older than the class.
	children: [
		child('c1', 'Jörg', 'Muster', '2020-05-01', 0),
		child('c2', 'Иван', 'Тестов', '2018-01-01', 1),
	],
	items: [],
} as unknown as IntakeDetail;

describe('waitlist texts (OQ-050)', () => {
	it('formats sums as German amounts without binary arithmetic', () => {
		expect(euroAmount(6650)).toBe('66,50');
		expect(euroAmount(5)).toBe('0,05');
		expect(euroAmount(1234)).toBe('12,34');
		expect(euroAmount(100000)).toBe('1.000,00');
	});
	it('fills the consent tick with tariff and sum, singular or plural', () => {
		expect(waitlistConsentText('de', 'monthly', 6650, 1)).toBe(
			'Ich melde mein Kind für diesen Kurs an. Kommt der Kurs zustande, verpflichte ich mich, vor dem ersten Termin in Ihrem Büro in der Villa der Kulturen einen Vertrag abzuschließen und den monatlichen Beitrag von 66,50 € je Kind (Monatsvertrag) zu zahlen.'
		);
		expect(waitlistConsentText('de', 'yearly', 5905, 2)).toContain(
			'Ich melde meine Kinder für diesen Kurs an.'
		);
		expect(waitlistConsentText('de', 'yearly', 5905, 2)).toContain(
			'59,05 € je Kind (Jahresvertrag)'
		);
		expect(waitlistConsentText('ru', 'monthly', 6650, 1)).toBe(
			'Я записываю ребёнка на этот курс. Если курс состоится, я обязуюсь до первого занятия заключить договор в вашем офисе в Villa der Kulturen и оплачивать ежемесячный взнос 66,50 € за каждого ребёнка (Месячный договор).'
		);
		expect(waitlistConsentText('ru', 'yearly', 5905, 3)).toMatch(
			/^Я записываю детей на этот курс/u
		);
		expect(fill(t('de', 'waitlistTariffYearly'), { amount: euroAmount(5905) })).toBe(
			'Jahresvertrag – 59,05 € pro Monat'
		);
	});
	it('verification letter: the course and the button, no children or birth dates', () => {
		const message = waitlistVerificationEmail(detail, entry, 'https://portal.example.test/v');
		expect(message.to).toBe('guest@example.test');
		expect(message.subject).toBe(
			`Bitte bestätigen Sie Ihre Anmeldung zur Warteliste beim ${ORGANIZATION_NAME}`
		);
		expect(message.text).toBe(
			`Sie möchten sich beim ${ORGANIZATION_NAME} für folgenden Kurs auf die Warteliste setzen lassen:\n\n` +
				`1 E (in Planung) — Dienstag, 16:00–16:45, ${ORGANIZATION_NAME}\n` +
				'Tarif: Jahresvertrag, 59,05 € pro Monat je Kind\n\n' +
				'Bitte bestätigen Sie Ihre E-Mail-Adresse über die Schaltfläche „Anmeldung bestätigen“. Erst danach stehen Sie auf der Warteliste.\n\n' +
				'Anmeldung bestätigen: https://portal.example.test/v\n\n' +
				'Nach der Bestätigung erhalten Sie eine E-Mail mit allen Angaben zu Ihrer Anmeldung.\n\n' +
				ORGANIZATION_NAME
		);
		for (const secret of ['Jörg', 'Иван', '2018-01-01', '2020-05-01'])
			expect(`${message.text}${message.html}`).not.toContain(secret);
	});
	it('confirmation letter: children, place, tariff, start rule, withdrawal link and phone', () => {
		const message = waitlistConfirmationEmail(
			detail,
			entry,
			'https://portal.example.test/w?token=x'
		);
		expect(message.subject).toBe(`Sie stehen auf der Warteliste: 1 E — ${ORGANIZATION_NAME}`);
		expect(message.text).toBe(
			'Ihre Anmeldung zur Warteliste ist bei uns eingegangen.\n\n' +
				'Jörg Muster, Иван Тестов: 1 E (in Planung)\n' +
				'Dienstag, 16:00–16:45\n' +
				`${ORGANIZATION_NAME}, Ritzenbergstraße 3 • 01067 Dresden, Raum R2\n` +
				'Tarif: Jahresvertrag, 59,05 € pro Monat je Kind\n' +
				'Hinweis: Иван Тестов ist am Wunschtermin älter als für diese Gruppe vorgesehen (5–6 Jahre). Das Büro prüft, ob die Gruppe passt.\n\n' +
				'Der Kurs beginnt, sobald mindestens 3 Kinder angemeldet sind. Dann schreiben wir Ihnen eine E-Mail mit dem ersten Termin und einer Bestätigung als PDF. Vor dem ersten Termin schließen Sie den Vertrag in unserem Büro in der Villa der Kulturen ab.\n\n' +
				'Sie möchten nicht mehr auf der Warteliste stehen? Austragen: https://portal.example.test/w?token=x\n\n' +
				'Bei Bedarf melden wir uns bei Ihnen.\n\n' +
				`Tel. +49 179 9474938\n${ORGANIZATION_NAME}`
		);
		expect(message.html).toContain(
			'<a href="https://portal.example.test/w?token=x">https://portal.example.test/w?token=x</a>'
		);
	});
	it('Telegram: the whole signup, the queue line and the threshold line when it was reached', () => {
		const queue = { children: 2, minParticipants: 3, reached: false };
		expect(waitlistTelegramParts(detail, entry, queue)).toEqual([
			[
				ORGANIZATION_NAME,
				'Neue Anmeldung zur Warteliste',
				'Kurs: 1 E (in Planung)',
				`Dienstag 16:00–16:45, ${ORGANIZATION_NAME}, Raum R2`,
				'Lehrkraft: Lehrkraft A',
				'Tarif: Jahresvertrag, 59,05 € pro Monat je Kind',
				'Eltern: Anna Muster',
				'Telefon: +49 000000000',
				'E-Mail: guest@example.test',
				'Kinder:',
				'1. Jörg Muster; geboren: 2020-05-01',
				'2. Иван Тестов; geboren: 2018-01-01',
				'Alter: Kind 2 älter als die Gruppe (5–6 Jahre), Hinweis bestätigt',
				'Warteliste: 2 von 3 Kindern',
			].join('\n'),
		]);
		const [reached] = waitlistTelegramParts(detail, entry, {
			...queue,
			children: 3,
			reached: true,
		});
		expect(reached.split('\n').slice(0, 3)).toEqual([
			ORGANIZATION_NAME,
			'Mindestteilnehmerzahl erreicht – Kurs kann gestartet werden',
			'Neue Anmeldung zur Warteliste',
		]);
		expect(reached.split('\n').at(-1)).toBe('Warteliste: 3 von 3 Kindern');
	});
});

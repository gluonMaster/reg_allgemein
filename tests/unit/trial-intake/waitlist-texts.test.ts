import { ORGANIZATION_NAME } from '$lib/organization';
import { euroAmount } from '$lib/trial-intake/prices';
import { fill, t, waitlistConsentText } from '$lib/trial-intake/i18n';
import {
	waitlistConfirmationEmail,
	waitlistStartEmail,
	waitlistTelegramParts,
	waitlistVerificationEmail,
} from '$lib/trial-intake/server/waitlist-templates.server';
import {
	documentFileName,
	documentReference,
	waitlistDocumentHtml,
} from '$lib/trial-intake/server/waitlist-pdf.server';
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

describe('waitlist start letter and PDF document (OQ-050, WL-11)', () => {
	const start = { lesson: { ...lesson, room: 'R7' }, firstDate: '2026-09-29' };
	const request = {
		...detail.request,
		id: '5f0c3a4e-1111-4222-8333-944455556666',
		parent_first_name: 'Ünal',
		parent_last_name: "O'Brien & <Söhne>",
		email: 'guest@example.test',
		created_at: '2026-09-16T12:00:00.000Z',
		verified_at: '2026-09-16T12:05:00.000Z',
	};
	it('writes the start letter verbatim with the sum of the snapshot; a probe goes to the admin', () => {
		const letter = waitlistStartEmail(detail, entry, start);
		expect(letter.to).toBe('guest@example.test');
		expect(letter.subject).toBe(`Ihr Kurs 1 E beginnt am 29.09.2026 — ${ORGANIZATION_NAME}`);
		expect(letter.text).toBe(
			[
				'Gute Nachricht: Für den Kurs 1 E haben sich genügend Kinder angemeldet. Der Kurs findet statt.',
				'',
				'Erster Termin: Dienstag, 29.09.2026, 16:00–16:45',
				`Ort: ${ORGANIZATION_NAME}, Ritzenbergstraße 3 • 01067 Dresden, Raum R7`,
				'Angemeldet: Jörg Muster, Иван Тестов',
				'Ihr Tarif: Jahresvertrag, 59,05 € pro Monat je Kind (bei Ihrer Anmeldung festgelegt)',
				'',
				'Wichtig: Bitte kommen Sie bis zum ersten Termin am 29.09.2026 in unser Büro in der Villa der Kulturen (Kraftwerk Mitte 2 • 01067 Dresden) und schließen Sie den Vertrag ab. Bürozeiten: Mo–Fr 9–18 Uhr, Sa 9–14 Uhr. Die Teilnahme am Kurs ist erst mit unterschriebenem Vertrag möglich.',
				'',
				'Im Anhang finden Sie die Bestätigung Ihrer Anmeldung und Ihrer Zahlungszusage. Bitte bringen Sie sie unterschrieben mit.',
				'',
				'Bei Bedarf melden wir uns bei Ihnen.',
				'',
				'Tel. +49 179 9474938',
				ORGANIZATION_NAME,
			].join('\n')
		);
		const probe = waitlistStartEmail(detail, entry, start, 'admin@example.test');
		expect(probe.to).toBe('admin@example.test');
		expect(probe.subject).toBe(`[PROBE] ${letter.subject}`);
		expect(probe.text).toBe(letter.text);
	});
	it('builds a self-contained A4 document with every element of WL-11, all fields escaped', async () => {
		const reference = await documentReference({ withdraw_nonce: 'synthetic-nonce' });
		expect(reference).toMatch(/^WL-[0-9A-F]{4}-[0-9A-F]{4}$/u);
		const html = waitlistDocumentHtml({
			reference,
			createdAt: '2026-09-17T08:00:00.000Z',
			request,
			children: detail.children,
			entry,
			start,
		});
		// The Browser Run adapter refuses scripts and external URLs; the fonts are inline.
		expect(html).not.toMatch(/<script/iu);
		expect(html).not.toMatch(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//iu);
		const outsideFonts = html.replace(/data:font\/woff;base64,[A-Za-z0-9+/=]+/gu, '');
		expect(outsideFonts).not.toMatch(/https?:|\/\/|url\((?!'')/iu);
		expect(html).toContain('@page { size: A4;');
		expect(
			html.match(
				/@font-face \{ font-family: 'Kolibri Document'; src: url\('data:font\/woff;base64,/gu
			)
		).toHaveLength(2);
		expect(html).toContain('font-weight: 700');
		// Names with umlauts and Cyrillic arrive as text; markup in a name is escaped.
		expect(html).toContain('Ünal O&#39;Brien &amp; &lt;Söhne&gt;');
		expect(html).not.toContain('<Söhne>');
		const text = html.replace(/<style>[\s\S]*<\/style>/u, '').replace(/<[^>]+>/gu, ' ');
		for (const part of [
			ORGANIZATION_NAME.replaceAll('"', '&quot;'),
			'Ritzenbergstraße 3 • 01067 Dresden',
			'Villa der Kulturen, Kraftwerk Mitte 2 • 01067 Dresden',
			'Tel. +49 179 9474938',
			'registration@kolibri-dresden.de',
			'Bestätigung der Anmeldung und Zahlungszusage',
			'Kurs 1 E — Beginn am 29.09.2026',
			`Nr. ${reference} · Erstellt am 17.09.2026`,
			'Erziehungsberechtigte(r)',
			'guest@example.test',
			'+49 000000000',
			'Angemeldete Kinder',
			'Jörg Muster, geboren am 01.05.2020',
			'Иван Тестов, geboren am 01.01.2018',
			'Dienstag, 16:00–16:45 (45 Minuten)',
			'Erster Termin: Dienstag, 29.09.2026',
			'Ritzenbergstraße 3 • 01067 Dresden, Raum R7',
			'Lehrkraft: Lehrkraft A',
			'Tarif: Jahresvertrag',
			'59,05 € pro Monat je Kind',
			'Dieser Betrag wurde bei Ihrer Anmeldung am 16.09.2026 festgelegt.',
			'Sie haben sich am 16.09.2026, 14:00 Uhr auf der Warteliste angemeldet und die Anmeldung am 16.09.2026, 14:05 Uhr über den Link in unserer E-Mail bestätigt. Dabei haben Sie folgender Erklärung zugestimmt:',
			waitlistConsentText('de', 'yearly', 5905, 2),
			'Nächster Schritt',
			'Bitte kommen Sie bis zum ersten Termin am 29.09.2026 in unser Büro in der Villa der Kulturen, Kraftwerk Mitte 2 • 01067 Dresden, und schließen Sie den Vertrag ab. Bürozeiten: Mo–Fr 9–18 Uhr, Sa 9–14 Uhr. Bringen Sie dieses Schreiben unterschrieben mit. Die Teilnahme am Kurs ist erst mit unterschriebenem Vertrag möglich.',
			'Ort, Datum',
			'Unterschrift Erziehungsberechtigte(r)',
			'Dieses Dokument ist kein Vertrag. Der Vertrag kommt erst mit Ihrer Unterschrift in unserem Büro zustande. Das Dokument bestätigt Ihre Anmeldung und Ihre Zusage, den oben genannten Beitrag zu zahlen.',
		])
			expect(text).toContain(part);
		expect(html).not.toContain(request.id);
	});
	it('uses the approved variants of OQ-052 only for a family that confirmed a new sum by phone', async () => {
		// The duration went from 45 to 60 minutes; the family accepted 64,00 € on 2026-09-20 (Berlin).
		const confirmation = {
			cents: 6400,
			confirmedAt: '2026-09-20T21:30:00.000Z',
			minutes: 60,
		};
		const confirmed = { ...entry, confirmation };
		const letter = waitlistStartEmail(detail, confirmed, start);
		expect(letter.text.split('\n')).toContain(
			'Ihr Tarif: Jahresvertrag, 64,00 € pro Monat je Kind (von Ihnen am 20.09.2026 telefonisch bestätigt)'
		);
		expect(letter.text).not.toContain('59,05');
		expect(letter.text).not.toContain('bei Ihrer Anmeldung festgelegt');
		// Everything else of the letter stays as approved.
		expect(
			letter.text
				.replace('64,00 €', '59,05 €')
				.replace(
					'von Ihnen am 20.09.2026 telefonisch bestätigt',
					'bei Ihrer Anmeldung festgelegt'
				)
		).toBe(waitlistStartEmail(detail, entry, start).text);
		// Without a confirmation, or with none recorded, the letter is the approved one.
		expect(waitlistStartEmail(detail, { ...entry, confirmation: null }, start).text).toBe(
			waitlistStartEmail(detail, entry, start).text
		);
		const document = (value: typeof entry & { confirmation?: typeof confirmation }) =>
			waitlistDocumentHtml({
				reference: 'WL-0000-0000',
				createdAt: '2026-09-17T08:00:00.000Z',
				request,
				children: detail.children,
				entry: value,
				start,
			})
				.replace(/<style>[\s\S]*<\/style>/u, '')
				.replace(/<[^>]+>/gu, ' ');
		const text = document(confirmed);
		expect(text).toContain('64,00 € pro Monat je Kind');
		expect(text).toContain(
			'Die Kursdauer hat sich auf 60 Minuten geändert. Den neuen Betrag haben Sie am 20.09.2026 telefonisch bestätigt.'
		);
		expect(text).not.toContain('Dieser Betrag wurde bei Ihrer Anmeldung');
		// The consent stays verbatim with the sum agreed to, followed by the replacement note.
		const consent = waitlistConsentText('de', 'yearly', 5905, 2);
		expect(text).toContain(consent);
		expect(
			text.indexOf('Der dort genannte Betrag wurde durch den oben genannten Beitrag ersetzt.')
		).toBeGreaterThan(text.indexOf(consent));
		const plain = document(entry);
		expect(plain).toContain(
			'Dieser Betrag wurde bei Ihrer Anmeldung am 16.09.2026 festgelegt.'
		);
		expect(plain).not.toContain('Kursdauer');
		expect(plain).not.toContain('Der dort genannte Betrag');
	});
	it('names the file in ASCII with subject and first date', () => {
		expect(documentFileName('English', '2026-09-29')).toBe(
			'Anmeldebestaetigung-English-29.09.2026.pdf'
		);
		expect(documentFileName('Früh-Förderung ß', '2026-09-29')).toBe(
			'Anmeldebestaetigung-Frueh-Foerderung-ss-29.09.2026.pdf'
		);
		expect(documentFileName('Crème Café', '2026-10-06')).toBe(
			'Anmeldebestaetigung-Creme-Cafe-06.10.2026.pdf'
		);
		expect(documentFileName('Русский', '2026-10-06')).toBe(
			'Anmeldebestaetigung-Kurs-06.10.2026.pdf'
		);
		expect(documentFileName('1 E', '2026-10-06')).toBe(
			'Anmeldebestaetigung-1-E-06.10.2026.pdf'
		);
	});
});

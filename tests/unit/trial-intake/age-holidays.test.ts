import { ageByArrangement, ageFit, ageOn, lessonAgeRange } from '$lib/trial-intake/age';
import { lessonDates, nextLessonDate } from '$lib/trial-intake/dates';
import { noLessonDay } from '$lib/trial-intake/holidays';
import { ageRangeLabel } from '$lib/trial-intake/i18n';
import { INTAKE_PRIVACY_VERSION, type Lesson } from '$lib/trial-intake/contracts';
import { validateSubmission } from '$lib/trial-intake/server/validation.server';
import { confirmationEmail, telegramParts } from '$lib/trial-intake/server/templates.server';
import type { IntakeDetail } from '$lib/trial-intake/server/model.server';

describe('trial intake holidays', () => {
	it('blocks Saxon public holidays of any year, but not Fronleichnam or Allerheiligen', () => {
		for (const date of [
			'2026-10-31',
			'2026-11-18', // Buß- und Bettag
			'2028-11-22', // Buß- und Bettag on the 22nd itself
			'2027-03-26', // Karfreitag
			'2027-03-29', // Ostermontag
			'2027-05-06', // Christi Himmelfahrt
			'2027-05-17', // Pfingstmontag
			'2027-05-01',
			'2027-10-03',
			'2031-04-14', // Ostermontag beyond the school holiday list
		])
			expect(noLessonDay(date), date).toBe(true);
		for (const date of ['2027-05-27', '2026-11-01', '2026-11-11', '2028-11-15'])
			expect(noLessonDay(date), date).toBe(false);
	});
	it('blocks Christmas and summer school holidays inclusively, not autumn or winter ones', () => {
		for (const date of ['2026-12-23', '2027-01-02', '2027-07-10', '2027-08-20', '2030-08-23'])
			expect(noLessonDay(date), date).toBe(true);
		for (const date of ['2026-12-22', '2027-01-04', '2027-08-21', '2027-10-12', '2027-02-10'])
			expect(noLessonDay(date), date).toBe(false);
	});
	it('offers only lesson dates outside holidays', () => {
		expect(lessonDates(6, '2027-07-01T10:00:00.000Z', 3)).toEqual([
			'2027-07-03',
			'2027-08-21',
			'2027-08-28',
		]);
		expect(lessonDates(3, '2026-11-10T10:00:00.000Z', 2)).toEqual(['2026-11-11', '2026-11-25']);
		expect(nextLessonDate(4, '2026-12-20T10:00:00.000Z')).toBe('2027-01-07');
	});
});

describe('trial intake age ranges', () => {
	it('reads the age from schedule group names', () => {
		const cases: [string, string, ReturnType<typeof lessonAgeRange>][] = [
			['Russisch', '3-4JC', { min: 3, max: 4 }],
			['Tanz', 'Tanz Sa 14-18J', { min: 14, max: 18 }],
			['Ukr. Mus.', 'Ukrainische Musik Do 5-6JA', { min: 5, max: 6 }],
			['Deutsch für Vorschulkinder', 'Deutsch 5-6J', { min: 5, max: 6 }],
			['Tanz', 'Tanz Mi ab 7J', { min: 7 }],
			['Deutsch', 'Deutsch ab 4J Fr', { min: 4 }],
			['Logorithmika', '4J Log', { min: 4, max: 4 }],
			['3Jahrige Ukr', '3J Ukr', { min: 3, max: 3 }],
			['Russisch', '1B', { min: 5, max: 6 }],
			['Deutsch', 'Deutsch 1Kl Fr', { min: 5, max: 6 }],
			['Mathe', '4D1', { min: 8, max: 9 }],
			['Kunst', 'Kunst Sa 12E', { min: 16, max: 17 }],
			['Kunst', 'Kunst Fr 6D+8B', { min: 10, max: 13 }],
			['Kunst', 'Kunst Sa 4B+10D', { min: 8, max: 15 }],
			['Deutsch', 'Deutsch Mo ab 9J', { min: 9 }],
			['Schach', 'Schach Sa C', { min: 5 }],
			['Gitarre', 'Gitarre E Di', { min: 10 }],
			['Orchester', 'Orchester Sa', { min: 6 }],
			['English', 'Der Kurs befindet sich in der Planung', { min: 6 }],
			['Baby', 'Der Kurs befindet sich in der Planung2', { min: 1, max: 3 }],
			['1 E', 'Der Kurs befindet sich in der Planung 1', { min: 5, max: 6 }],
			['Soroban-Abacus', 'Mathe', { min: 6, max: 9 }],
			// The name's lower bound stays; the owner rule adds only the missing upper one.
			['Soroban-Abacus', 'Mathe ab 6J', { min: 6, max: 9 }],
			['Soroban-Abacus', 'Mathe ab 10J', { min: 10 }],
			['Kunst', 'Kunst Mi', { min: 10 }],
			['Kunst', 'Kunst  Sa', { min: 8 }],
			['Kunst', 'Kunst Sa StudioO', null],
			['Russisch', '13A', null],
			['Musik', 'Der Kurs befindet sich in der Planung', null],
		];
		for (const [subject, group, range] of cases)
			expect(lessonAgeRange({ subject, group }), group).toEqual(range);
	});
	it('leaves the Kunst studios to an agreement with the bureau', () => {
		expect(ageByArrangement({ subject: 'Kunst', group: 'Kunst Mi StudioO' })).toBe(true);
		expect(ageByArrangement({ subject: 'Kunst', group: 'Kunst Sa StudioP' })).toBe(true);
		expect(ageByArrangement({ subject: 'Kunst', group: 'Kunst Sa' })).toBe(false);
		expect(ageByArrangement({ subject: 'Kunst', group: 'Kunst Sa Studio ab 12J' })).toBe(false);
	});
	it('counts completed years on the lesson date', () => {
		expect(ageOn('2020-03-15', '2026-03-14')).toBe(5);
		expect(ageOn('2020-03-15', '2026-03-15')).toBe(6);
		expect(ageOn('2020-02-29', '2027-02-28')).toBe(6);
		expect(ageOn('2020-02-29', '2027-03-01')).toBe(7);
		const range = { min: 5, max: 6 };
		expect(ageFit(range, '2021-11-13', '2026-11-12')).toBe('young');
		expect(ageFit(range, '2021-11-12', '2026-11-12')).toBe('ok');
		expect(ageFit(range, '2019-11-13', '2026-11-12')).toBe('ok');
		expect(ageFit(range, '2019-11-12', '2026-11-12')).toBe('old');
		expect(ageFit({ min: 7 }, '2000-01-01', '2026-11-12')).toBe('ok');
		expect(ageFit(null, '2025-01-01', '2026-11-12')).toBe('ok');
		expect(ageFit(range, '', '2026-11-12')).toBe('ok');
	});
	it('labels ranges in German and Russian', () => {
		expect(ageRangeLabel({ min: 5, max: 6 }, 'de')).toBe('5–6 Jahre');
		expect(ageRangeLabel({ min: 7 }, 'de')).toBe('ab 7 Jahren');
		expect(ageRangeLabel({ min: 4, max: 4 }, 'de')).toBe('4 Jahre');
		expect(ageRangeLabel({ min: 3, max: 4 }, 'ru')).toBe('3–4 года');
		expect(ageRangeLabel({ min: 5, max: 6 }, 'ru')).toBe('5–6 лет');
		expect(ageRangeLabel({ min: 11, max: 12 }, 'ru')).toBe('11–12 лет');
		expect(ageRangeLabel({ min: 21, max: 21 }, 'ru')).toBe('21 год');
		expect(ageRangeLabel({ min: 7 }, 'ru')).toBe('от 7 лет');
		expect(ageRangeLabel({ min: 1 }, 'ru')).toBe('от 1 года');
	});
});

describe('trial intake submission rules for holidays and age', () => {
	const lesson = (id: string, group: string, weekday: number): Lesson => ({
		id: id.repeat(64),
		subject: 'Russisch',
		group,
		weekday,
		start: '16:00',
		end: '16:45',
		teacher: 'Lehrkraft',
		room: 'R1',
		building: 'Kolibri',
	});
	const lessons = [lesson('a', '1B', 4), lesson('b', 'Gruppe', 3)];
	const now = '2026-11-10T12:00:00.000Z';
	const submit = (birthDate: string, item: Record<string, unknown> = {}) =>
		validateSubmission(
			{
				idempotencyKey: 'a'.repeat(32),
				parentFirstName: 'Synthetic',
				parentLastName: 'Parent',
				email: 'guest@example.test',
				phone: '+49 000000000',
				locale: 'de',
				privacyVersion: INTAKE_PRIVACY_VERSION,
				children: [{ key: 'c', firstName: 'Kind', lastName: 'Synthetic', birthDate }],
				items: [
					{
						lessonId: lessons[0].id,
						desiredDate: '2026-11-12',
						childKeys: ['c'],
						...item,
					},
				],
			},
			lessons,
			now
		);
	it('refuses holiday dates even on the right weekday', () => {
		for (const [lessonId, desiredDate] of [
			[lessons[1].id, '2026-11-18'],
			[lessons[0].id, '2026-12-24'],
		])
			expect(() => submit('2021-01-01', { lessonId, desiredDate })).toThrow(
				expect.objectContaining({ code: 'INTAKE_DATE_HOLIDAY' })
			);
		expect(submit('2021-01-01').items).toHaveLength(1);
	});
	it('refuses a younger child and an older one without acknowledgment', () => {
		expect(() => submit('2022-01-01')).toThrow(
			expect.objectContaining({ code: 'INTAKE_CHILD_TOO_YOUNG' })
		);
		expect(() => submit('2019-01-01')).toThrow(
			expect.objectContaining({ code: 'INTAKE_AGE_UNCONFIRMED' })
		);
		expect(submit('2019-01-01', { ageConfirmed: true }).items).toHaveLength(1);
		expect(() => submit('2019-01-01', { ageConfirmed: false })).toThrow(
			expect.objectContaining({ code: 'INTAKE_INPUT_INVALID' })
		);
	});
	it('tells the parent and the bureau about an older child', () => {
		const child = {
			id: 'child-1',
			request_id: 'r',
			position: 1,
			first_name: 'Anna',
			last_name: 'Synthetic',
			birth_date: '2019-01-01',
		};
		const detail = {
			request: {
				parent_first_name: 'Synthetic',
				parent_last_name: 'Parent',
				email: 'guest@example.test',
				phone: '+49 000000000',
			},
			children: [child],
			items: [
				{
					id: 'item-1',
					request_id: 'r',
					position: 1,
					lesson_id: lessons[0].id,
					desired_date: '2026-11-12',
					subject: 'Russisch',
					group_name: '1B',
					weekday: 4,
					start_time: '16:00',
					end_time: '16:45',
					teacher: 'Lehrkraft',
					room: 'R1',
					building: 'Kolibri',
					children: [child],
				},
			],
		} as unknown as IntakeDetail;
		expect(confirmationEmail(detail).text).toContain(
			'Hinweis: Anna Synthetic ist am Wunschtermin älter als für diese Gruppe vorgesehen (5–6 Jahre).'
		);
		expect(telegramParts(detail).join('\n')).toContain(
			'Alter: Kind 1 älter als die Gruppe (5–6 Jahre), Hinweis bestätigt'
		);
		detail.children[0].birth_date = detail.items[0].children[0].birth_date = '2021-01-01';
		expect(confirmationEmail(detail).text).not.toContain('Hinweis:');
		expect(telegramParts(detail).join('\n')).not.toContain('Alter:');
	});
});

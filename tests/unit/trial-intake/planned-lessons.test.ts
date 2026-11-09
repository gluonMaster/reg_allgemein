import examples from '../../fixtures/trial-intake/planned-groups.json';
import {
	compareLessons,
	isClassName,
	isPlannedLesson,
	keyAge,
	mergeReasons,
	plannedCourseKey,
	subjectBase,
	type CourseLesson,
} from '$lib/trial-intake/planned';
import { closedKey } from '$lib/trial-intake/closed';
import { INTAKE_PRIVACY_VERSION, type Lesson } from '$lib/trial-intake/contracts';
import { validateSubmission } from '$lib/trial-intake/server/validation.server';
import { t } from '$lib/trial-intake/i18n';
import { parseEuroCents, parseMinParticipants, centsText } from '$lib/trial-intake/prices';
import { parseTimeRange, parseWeekday } from '$lib/trial-intake/server/prices.server';

describe('planned lessons (WL-01)', () => {
	it('recognizes the placeholder on the shared example list of portal and exporter', () => {
		expect(examples.some((e) => e.planned)).toBe(true);
		expect(examples.some((e) => !e.planned)).toBe(true);
		// The list keeps one decomposed spelling, so the NFC step stays covered.
		expect(examples.some((e) => e.group.normalize('NFC') !== e.group)).toBe(true);
		for (const { group, planned } of examples)
			expect(isPlannedLesson({ group }), JSON.stringify(group)).toBe(planned);
	});
	it('labels a planned card without the placeholder and its suffix', () => {
		expect(t('de', 'plannedLabel')).toBe('Kurs in Planung');
		expect(t('ru', 'plannedLabel')).toBe('Курс в планировании');
	});
});
describe('course entity key (WL-15)', () => {
	const base: CourseLesson = {
		subject: 'English',
		group: 'Der Kurs befindet sich in der Planung',
		weekday: 2,
		start: '16:00',
		end: '17:00',
		teacher: 'Lehrkraft A',
		building: 'Villa',
	};
	const key = plannedCourseKey(base);
	it('ignores the editor suffix, the room and letter case', () => {
		for (const change of [
			{ group: 'Der Kurs befindet sich in der Planung 1' },
			{ group: 'Der Kurs befindet sich in der Planung2' },
			{ subject: 'english', teacher: ' lehrkraft  a ' },
		])
			expect(plannedCourseKey({ ...base, ...change }), JSON.stringify(change)).toBe(key);
		const withRoom = { ...base, room: 'R1' } as CourseLesson & { room: string };
		expect(plannedCourseKey({ ...withRoom, room: 'R2' } as CourseLesson)).toBe(key);
	});
	it('changes with weekday, start, duration, teacher, building and age', () => {
		const changes: Partial<CourseLesson>[] = [
			{ weekday: 3 },
			{ start: '15:00', end: '16:00' }, // same duration, other start
			{ end: '16:45' }, // same start, other duration
			{ teacher: 'Lehrkraft B' },
			{ building: 'Kolibri' },
			// Only the age: the name states 5-6 instead of the English rule "ab 6".
			{ group: 'Der Kurs befindet sich in der Planung 5-6J' },
			{ subject: 'Russisch' },
		];
		const keys = new Set(changes.map((change) => plannedCourseKey({ ...base, ...change })));
		expect(keys.size).toBe(changes.length);
		expect(keys.has(key)).toBe(false);
	});
	it('keeps the duration at index 3 for the rebind guards of migration 0032', () => {
		expect(JSON.parse(plannedCourseKey({ ...base, end: '16:45' }))[3]).toBe(45);
		expect(JSON.parse(key)).toEqual([
			2,
			'english',
			'16:00',
			60,
			'lehrkraft a',
			'villa',
			[6, null],
		]);
	});
	it('leaves the full-group mark on its own key', () => {
		expect(closedKey({ ...base, group: 'Der Kurs befindet sich in der Planung 1' })).not.toBe(
			closedKey(base)
		);
	});
});
describe('trial request for a planned course (WL-03)', () => {
	const lesson = (id: string, group: string): Lesson => ({
		id: id.repeat(64),
		subject: 'English',
		group,
		weekday: 4,
		start: '16:00',
		end: '17:00',
		teacher: 'Lehrkraft',
		room: 'R1',
		building: 'Villa',
	});
	const planned = lesson('a', 'Der Kurs befindet sich in der Planung 1');
	const regular = lesson('b', 'English Do');
	const submit = (lessonId: string) =>
		validateSubmission(
			{
				idempotencyKey: 'a'.repeat(32),
				parentFirstName: 'Synthetic',
				parentLastName: 'Parent',
				email: 'guest@example.test',
				phone: '+49 000000000',
				locale: 'de',
				privacyVersion: INTAKE_PRIVACY_VERSION,
				children: [
					{ key: 'c', firstName: 'Kind', lastName: 'Synthetic', birthDate: '2018-01-01' },
				],
				items: [{ lessonId, desiredDate: '2026-11-12', childKeys: ['c'] }],
			},
			[planned, regular],
			'2026-11-10T12:00:00.000Z'
		);
	it('is refused with INTAKE_LESSON_PLANNED, a regular lesson still passes', () => {
		expect(() => submit(planned.id)).toThrow(
			expect.objectContaining({ code: 'INTAKE_LESSON_PLANNED', status: 409 })
		);
		expect(submit(regular.id).items).toHaveLength(1);
	});
});
describe('price input', () => {
	it('reads euros into exact cents without binary arithmetic', () => {
		for (const [text, cents] of [
			['66,50', 6650],
			['66.5', 6650],
			['66', 6600],
			[' 0,01 ', 1],
			['1000', 100000],
			['1000,00', 100000],
			['12,3 €', 1230],
			['0,29', 29],
			['4,35', 435],
		] as const)
			expect(parseEuroCents(text), text).toBe(cents);
		for (const text of [
			'',
			'0',
			'0,00',
			'1000,01',
			'1.000',
			'1.000,00',
			'66,505',
			'-5',
			'5e1',
			'abc',
			'66,',
			',50',
		])
			expect(parseEuroCents(text), text).toBeNull();
		expect(centsText(6650)).toBe('66,50');
		expect(centsText(5, '.')).toBe('0.05');
	});
	it('accepts a threshold from 1 to 30 children', () => {
		expect(parseMinParticipants('3')).toBe(3);
		expect(parseMinParticipants('30')).toBe(30);
		for (const text of ['0', '31', '2.5', '', 'drei'])
			expect(parseMinParticipants(text)).toBeNull();
	});
	it('reads weekday and time of an imported row', () => {
		expect(['Dienstag', 'di', 'Di.', '2'].map(parseWeekday)).toEqual([2, 2, 2, 2]);
		expect(['', 'Tue', '8', 'Diens'].map(parseWeekday)).toEqual([null, null, null, null]);
		expect(parseTimeRange('16:00–17:00')).toEqual({ start: '16:00', end: '17:00' });
		expect(parseTimeRange('9:30 - 10:15')).toEqual({ start: '09:30', end: '10:15' });
		for (const text of ['16:00', '17:00-16:00', '25:00-26:00', '16-17'])
			expect(parseTimeRange(text), text).toBeNull();
	});
});
describe('rebind comparison of two cards (WL-15)', () => {
	const PLANNED = 'Der Kurs befindet sich in der Planung';
	const russisch: CourseLesson = {
		subject: 'Russisch',
		group: PLANNED,
		weekday: 2,
		start: '16:00',
		end: '16:45',
		teacher: 'Lehrkraft A',
		building: 'Kolibri',
	};
	const firstGrade: CourseLesson = { ...russisch, subject: '1 E' };
	const compare = (from: CourseLesson, change: Partial<CourseLesson>) =>
		compareLessons(from, { ...from, ...change });
	it('follows every row of the WL-15 table', () => {
		// Another subject is refused, its spelling passes without a status.
		expect(compare(russisch, { subject: 'English' })).toMatchObject({ allowed: false });
		expect(compare(russisch, { subject: 'Russisch1' })).toEqual({
			allowed: true,
			kind: 'plain',
			differences: [{ field: 'subject', from: 'Russisch', to: 'Russisch1' }],
			reasons: [],
		});
		// A class of the same age passes, the building is shown and changes nothing.
		expect(compare(firstGrade, { subject: '1 A' })).toMatchObject({
			allowed: true,
			kind: 'plain',
			reasons: [],
		});
		expect(compare(russisch, { building: 'Villa' })).toEqual({
			allowed: true,
			kind: 'plain',
			differences: [{ field: 'building', from: 'Kolibri', to: 'Villa' }],
			reasons: [],
		});
		// Weekday, start, teacher and age need a call, without any threshold of the change.
		expect(compare(russisch, { weekday: 3 })).toMatchObject({
			kind: 'notify',
			reasons: [{ code: 'weekday' }],
		});
		for (const start of ['17:00', '19:00'])
			expect(
				compare(russisch, { start, end: `${start.slice(0, 2)}:45` }),
				start
			).toMatchObject({
				kind: 'notify',
				reasons: [{ code: 'time', from: '16:00', to: start }],
			});
		expect(compare(russisch, { teacher: 'Lehrkraft B' })).toMatchObject({
			kind: 'notify',
			reasons: [{ code: 'teacher' }],
		});
		expect(compare(firstGrade, { subject: '2 E' })).toMatchObject({
			allowed: true,
			kind: 'notify',
			differences: [
				{ field: 'subject', from: '1 E', to: '2 E' },
				{ field: 'age', from: { min: 5, max: 6 }, to: { min: 6, max: 7 } },
			],
			reasons: [{ code: 'age' }],
		});
		// A class instead of a subject cannot be checked; the age of the class goes with it.
		expect(compare(firstGrade, { subject: 'Russisch' })).toMatchObject({
			allowed: true,
			kind: 'notify',
			reasons: [{ code: 'subject_check' }, { code: 'age' }],
		});
		expect(compare(russisch, { subject: '1 E' })).toMatchObject({
			allowed: true,
			kind: 'notify',
		});
		// The duration needs new sums.
		expect(compare(russisch, { end: '17:00' })).toEqual({
			allowed: true,
			kind: 'price',
			differences: [{ field: 'minutes', from: 45, to: 60 }],
			reasons: [],
		});
	});
	it('compares subjects without case, digits and spaces; a class is a whole name', () => {
		expect(subjectBase('Russisch')).toBe(subjectBase('russisch'));
		expect(subjectBase('Russisch1')).toBe('russisch');
		expect(subjectBase('Russisch Fremd')).not.toBe('russisch');
		for (const [from, to, allowed] of [
			['Russisch', 'russisch', true],
			['Russisch', 'Russisch1', true],
			['Russisch', 'Russisch Fremd', false],
			['Russisch', 'English', false],
			['English', 'English1', true],
		] as const)
			expect(compare({ ...russisch, subject: from }, { subject: to }).allowed, to).toBe(
				allowed
			);
		for (const name of ['1 E', '1A', '1 e', '4D1', '1Kl', '12 C'])
			expect(isClassName(name), name).toBe(true);
		for (const name of ['Russisch', '13A', '1 F', 'Deutsch 3-4Kl', '1 E Russisch', ''])
			expect(isClassName(name), name).toBe(false);
		// "1 E" and "1A" are both classes: no subject refusal, the age decides.
		expect(compare(firstGrade, { subject: '1A' })).toMatchObject({
			allowed: true,
			kind: 'plain',
		});
	});
	it('never matches a subject that is empty after cleaning', () => {
		expect(compare({ ...russisch, subject: '' }, { subject: '' }).allowed).toBe(false);
		expect(compare({ ...russisch, subject: '1' }, { subject: '2' }).allowed).toBe(false);
		expect(compare(russisch, { subject: '' }).allowed).toBe(false);
	});
	it('lists every difference at once and takes the strictest kind', () => {
		expect(
			compare(russisch, {
				subject: 'russisch1',
				weekday: 4,
				start: '15:00',
				end: '16:00',
				teacher: 'Lehrkraft B',
				building: 'Villa',
			})
		).toEqual({
			allowed: true,
			kind: 'price',
			differences: [
				{ field: 'subject', from: 'Russisch', to: 'russisch1' },
				{ field: 'weekday', from: 2, to: 4 },
				{ field: 'start', from: '16:00', to: '15:00' },
				{ field: 'minutes', from: 45, to: 60 },
				{ field: 'teacher', from: 'Lehrkraft A', to: 'Lehrkraft B' },
				{ field: 'building', from: 'Kolibri', to: 'Villa' },
			],
			reasons: [
				{ code: 'weekday' },
				{ code: 'time', from: '16:00', to: '15:00' },
				{ code: 'teacher' },
			],
		});
		// Another subject stays refused whatever else changes.
		expect(compare(russisch, { subject: 'English', end: '17:00' })).toMatchObject({
			allowed: false,
			kind: 'price',
		});
	});
	it('reads the age of a stored course from its key and merges orange reasons once', () => {
		expect(keyAge(plannedCourseKey(firstGrade))).toEqual({ min: 5, max: 6 });
		expect(keyAge(plannedCourseKey({ ...russisch, subject: 'English' }))).toEqual({ min: 6 });
		expect(keyAge(plannedCourseKey(russisch))).toBeNull();
		expect(
			mergeReasons(
				[{ code: 'teacher' }, { code: 'time', from: '16:00', to: '17:00' }],
				null,
				[{ code: 'teacher' }, { code: 'age' }]
			)
		).toEqual([
			{ code: 'teacher' },
			{ code: 'time', from: '16:00', to: '17:00' },
			{ code: 'age' },
		]);
	});
});

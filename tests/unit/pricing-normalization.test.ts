import {
	MISSING_PRICE_KEY,
	buildScalarSubjectDurationVector,
	extractNumberLetterKey,
	normalizePriceLookupKey,
	normalizePricingSubject,
	startsWithJahrige,
} from '$lib/server/pricing/normalization';

describe('pricing golden normalization', () => {
	it.each([
		['3 Jahrige Sa', '3Jahrige'],
		['3J Ru Mi', '3Jahrige'],
		['4 Jahrige Sa Log', '4Jahrige'],
		['3-4Jahrige Mi Log', '3Jahrige'],
		['4-5Jahrige Mi', '4Jahrige'],
		['1Kl Ru_Fremd Sa', 'Ru/Fremd.'],
		['Baby Do', 'Baby'],
		['Gitarre Di 17_00', 'Gitarre'],
		['Kunst Sa 1B', 'Kunst'],
		['Musik 1B Sa', 'Musik'],
		['Theater 10-12 Mo 16_00', 'Theater'],
		['Mathe Abakus', 'Mathe Abakus'],
		['Soroban-Abakus', 'Mathe Abakus'],
		['Ukrainisch_5-6J Di', 'Ukrainisch_5-6J'],
		['Ukrainisch_Musik_5-6J Di', 'Ukrainisch_Musik_5-6J'],
		['Tanz Ukr. Sa', MISSING_PRICE_KEY],
	])('normalizes %s to %s', (input, expected) => {
		expect(normalizePriceLookupKey(input)).toBe(expected);
	});

	it('keeps deliberately unknown keys fail-closed', () => {
		expect(normalizePriceLookupKey('Completely unknown group')).toBe(MISSING_PRICE_KEY);
		expect(normalizePriceLookupKey('Nachhilfe Mathe')).toBe(MISSING_PRICE_KEY);
		expect(normalizePriceLookupKey('Individuelle Beratung')).toBe(MISSING_PRICE_KEY);
		expect(normalizePriceLookupKey('  ')).toBe(MISSING_PRICE_KEY);
	});

	it('distinguishes Jahrige from number-letter classes', () => {
		expect(startsWithJahrige('3 J')).toBe(true);
		expect(startsWithJahrige('4J Ru')).toBe(true);
		expect(startsWithJahrige('13J')).toBe(false);
		expect(startsWithJahrige('3 Klasse')).toBe(false);
		expect(extractNumberLetterKey('4A Gruppe')).toBe('4A');
		expect(extractNumberLetterKey('12 b Gruppe')).toBe('12B');
		expect(extractNumberLetterKey('3J Ru')).toBeNull();
	});

	it('normalizes only allowlisted subject aliases and keeps an ordered integer vector', () => {
		expect(normalizePricingSubject('Ru')).toBe('russisch');
		expect(normalizePricingSubject('Kunst')).toBe('kunst');
		expect(normalizePricingSubject('Mathematik')).toBe('mathe');
		expect(buildScalarSubjectDurationVector(['Ru', 'Kunst', 'Ru'], 45)).toEqual([
			{ subject: 'russisch', durationMinutes: 45 },
			{ subject: 'kunst', durationMinutes: 45 },
		]);
		expect(buildScalarSubjectDurationVector([], 90)).toEqual([
			{ subject: null, durationMinutes: 90 },
		]);
	});
});

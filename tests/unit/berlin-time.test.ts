import { describe, expect, it } from 'vitest';
import { berlinCalendarDate, isCalendarDate } from '$lib/server/time/berlin';

describe('Europe/Berlin calendar dates', () => {
	it('strictly validates persisted local calendar dates', () => {
		expect(isCalendarDate('2028-02-29')).toBe(true);
		expect(isCalendarDate('2026-02-29')).toBe(false);
		expect(isCalendarDate('2026-7-17')).toBe(false);
	});

	it('uses the Berlin date across the spring DST transition', () => {
		expect(berlinCalendarDate('2026-03-28T23:30:00.000Z')).toBe('2026-03-29');
		expect(berlinCalendarDate('2026-03-29T22:30:00.000Z')).toBe('2026-03-30');
	});

	it('uses the Berlin date across the autumn DST transition', () => {
		expect(berlinCalendarDate('2026-10-24T22:30:00.000Z')).toBe('2026-10-25');
		expect(berlinCalendarDate('2026-10-25T23:30:00.000Z')).toBe('2026-10-26');
	});
});

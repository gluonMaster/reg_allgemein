import { describe, expect, it } from 'vitest';
import {
	berlinCalendarDate,
	calendarDaysAfter,
	calendarDaysBefore,
	firstDayOfNextCalendarMonth,
	isCalendarDate,
} from '$lib/server/time/berlin';

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

	it('uses calendar arithmetic for review deadlines and bounded reconciliation', () => {
		expect(calendarDaysAfter('2026-02-20', 14)).toBe('2026-03-06');
		expect(calendarDaysBefore('2026-03-02', 7)).toBe('2026-02-23');
		expect(calendarDaysAfter('2026-03-22', 14)).toBe('2026-04-05');
	});

	it('schedules on the first day of the next calendar month', () => {
		expect(firstDayOfNextCalendarMonth('2026-08-31')).toBe('2026-09-01');
		expect(firstDayOfNextCalendarMonth('2026-12-01')).toBe('2027-01-01');
	});
});

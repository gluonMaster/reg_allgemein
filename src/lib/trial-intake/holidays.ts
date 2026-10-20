/**
 * Days without trial lessons (owner decision 2026-10-20): Saxon public holidays, computed for any
 * year, and the Christmas and summer school holidays. The ministry fixes school holidays years
 * ahead, so they are listed from https://www.schule.sachsen.de/schuljahrestermine-4793.html,
 * first and last day inclusive. Other school holidays keep their lessons.
 */
const SCHOOL_HOLIDAYS: readonly (readonly [string, string])[] = [
	['2026-12-23', '2027-01-02'],
	['2027-07-10', '2027-08-20'],
	['2027-12-23', '2028-01-01'],
	['2028-07-22', '2028-09-01'],
	['2028-12-23', '2029-01-03'],
	['2029-07-21', '2029-08-31'],
	['2029-12-22', '2030-01-04'],
	['2030-07-13', '2030-08-23'],
];
/** The list above covers school years up to 2029/30; the admin list warns half a year ahead. */
export const SCHOOL_HOLIDAYS_REMINDER_FROM = '2030-03-01';

const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
/** Anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
function easterSunday(year: number): number {
	const a = year % 19,
		b = Math.floor(year / 100),
		c = year % 100;
	const h =
		(19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) %
		30;
	const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const n = h + l - 7 * m + 114;
	return Date.UTC(year, Math.floor(n / 31) - 1, (n % 31) + 1);
}
const DAY = 86_400_000;
const publicHolidays = new Map<number, Set<string>>();
/** SächsSFG: Fronleichnam is a holiday only in some Sorbian municipalities, not in Dresden. */
export function saxonPublicHolidays(year: number): Set<string> {
	let days = publicHolidays.get(year);
	if (!days) {
		const easter = easterSunday(year);
		const nov22 = Date.UTC(year, 10, 22);
		days = new Set([
			...['01-01', '05-01', '10-03', '10-31', '12-25', '12-26'].map((d) => `${year}-${d}`),
			// Karfreitag, Ostermontag, Christi Himmelfahrt, Pfingstmontag.
			...[-2, 1, 39, 50].map((offset) => iso(easter + offset * DAY)),
			// Buß- und Bettag: the Wednesday before 23 November.
			iso(nov22 - ((new Date(nov22).getUTCDay() + 4) % 7) * DAY),
		]);
		publicHolidays.set(year, days);
	}
	return days;
}
export function noLessonDay(date: string): boolean {
	return (
		saxonPublicHolidays(Number(date.slice(0, 4))).has(date) ||
		SCHOOL_HOLIDAYS.some(([first, last]) => first <= date && date <= last)
	);
}

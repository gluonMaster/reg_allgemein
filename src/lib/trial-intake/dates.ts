import { noLessonDay } from './holidays';

/** Calendar arithmetic is shared with validation; dates are always Berlin calendar dates. */
export function berlinDate(now: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Berlin',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(new Date(now));
	return ['year', 'month', 'day'].map((t) => parts.find((p) => p.type === t)!.value).join('-');
}
export function weekday(date: string): number {
	return new Date(date).getUTCDay() || 7;
}
export function nextLessonDate(day: number, now: string): string {
	return lessonDates(day, now, 1)[0];
}
/**
 * Upcoming dates of the lesson's own weekday, so no other day can be offered. Holidays and the
 * blocked school holidays are skipped; the longest of them, summer, spans seven weeks.
 */
export function lessonDates(day: number, now: string, count: number): string[] {
	const today = berlinDate(now);
	const next = new Date(today);
	next.setUTCDate(next.getUTCDate() + ((day - weekday(today) + 7) % 7 || 7));
	const dates: string[] = [];
	while (dates.length < count) {
		const date = next.toISOString().slice(0, 10);
		if (!noLessonDay(date)) dates.push(date);
		next.setUTCDate(next.getUTCDate() + 7);
	}
	return dates;
}
export function tomorrow(now: string): string {
	const d = new Date(berlinDate(now));
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

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
	const today = berlinDate(now);
	const d = new Date(today);
	d.setUTCDate(d.getUTCDate() + ((day - weekday(today) + 7) % 7 || 7));
	return d.toISOString().slice(0, 10);
}
/** Upcoming dates of the lesson's own weekday, so no other day can be offered. */
export function lessonDates(day: number, now: string, count: number): string[] {
	const dates = [nextLessonDate(day, now)];
	while (dates.length < count) {
		const next = new Date(dates[dates.length - 1]);
		next.setUTCDate(next.getUTCDate() + 7);
		dates.push(next.toISOString().slice(0, 10));
	}
	return dates;
}
export function tomorrow(now: string): string {
	const d = new Date(berlinDate(now));
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

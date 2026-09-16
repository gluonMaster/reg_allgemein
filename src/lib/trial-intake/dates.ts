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
export function tomorrow(now: string): string {
	const d = new Date(berlinDate(now));
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

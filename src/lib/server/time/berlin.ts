const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/u;

export function isCalendarDate(value: string): boolean {
	if (!calendarDatePattern.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function berlinCalendarDate(instant: string): string {
	const parsed = new Date(instant);
	if (Number.isNaN(parsed.valueOf())) throw new TypeError('instant must be a valid timestamp.');
	const parts = new Intl.DateTimeFormat('en', {
		timeZone: 'Europe/Berlin',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(parsed);
	const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${value.year}-${value.month}-${value.day}`;
}

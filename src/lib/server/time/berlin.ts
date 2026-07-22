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

export function calendarDayAfter(value: string): string {
	if (!isCalendarDate(value)) throw new TypeError('value must be a valid calendar date.');
	const next = new Date(`${value}T12:00:00.000Z`);
	next.setUTCDate(next.getUTCDate() + 1);
	return next.toISOString().slice(0, 10);
}

export function calendarDaysAfter(value: string, days: number): string {
	if (!isCalendarDate(value)) throw new TypeError('value must be a valid calendar date.');
	if (!Number.isSafeInteger(days) || days < 0) {
		throw new TypeError('days must be a non-negative integer.');
	}
	const next = new Date(`${value}T12:00:00.000Z`);
	next.setUTCDate(next.getUTCDate() + days);
	return next.toISOString().slice(0, 10);
}

export function calendarDaysBefore(value: string, days: number): string {
	if (!isCalendarDate(value)) throw new TypeError('value must be a valid calendar date.');
	if (!Number.isSafeInteger(days) || days < 0) {
		throw new TypeError('days must be a non-negative integer.');
	}
	const previous = new Date(`${value}T12:00:00.000Z`);
	previous.setUTCDate(previous.getUTCDate() - days);
	return previous.toISOString().slice(0, 10);
}

export function calendarMonthEnd(value: string): string {
	if (!isCalendarDate(value)) throw new TypeError('value must be a valid calendar date.');
	const [year, month] = value.split('-').map(Number);
	return new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
}

export function firstDayOfNextCalendarMonth(value: string): string {
	if (!isCalendarDate(value)) throw new TypeError('value must be a valid calendar date.');
	const [year, month] = value.split('-').map(Number);
	return new Date(Date.UTC(year, month, 1, 12)).toISOString().slice(0, 10);
}

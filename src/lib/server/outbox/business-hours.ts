const dayCodes = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
type DayCode = (typeof dayCodes)[number];

export interface BusinessHoursSchedule {
	timeZone: string;
	activeWeekdays: ReadonlySet<number>;
	startMinute: number;
	endMinute: number;
	canonical: string;
}

const schedulePattern = /^(Su|Mo|Tu|We|Th|Fr|Sa)-(Su|Mo|Tu|We|Th|Fr|Sa) (\d{2}):(\d{2})-(\d{2}):(\d{2})$/u;

function minute(hour: string, value: string): number {
	const parsedHour = Number(hour);
	const parsedMinute = Number(value);
	if (parsedHour > 23 || parsedMinute > 59) throw new TypeError('Invalid business-hours time.');
	return parsedHour * 60 + parsedMinute;
}

function dayIndex(code: DayCode): number {
	return dayCodes.indexOf(code);
}

export function parseBusinessHours(timeZone: string, value: string): BusinessHoursSchedule {
	try {
		new Intl.DateTimeFormat('en', { timeZone }).format(new Date(0));
	} catch {
		throw new TypeError('Invalid business-hours timezone.');
	}
	const match = schedulePattern.exec(value.trim());
	if (!match) throw new TypeError('Invalid business-hours schedule.');
	const fromCode = match[1] as DayCode;
	const toCode = match[2] as DayCode;
	const startHour = match[3];
	const startMinute = match[4];
	const endHour = match[5];
	const endMinute = match[6];
	const from = dayIndex(fromCode);
	const to = dayIndex(toCode);
	if (from > to) throw new TypeError('Wrapped business weekdays are not supported.');
	const start = minute(startHour, startMinute);
	const end = minute(endHour, endMinute);
	if (start >= end) throw new TypeError('Business-hours end must follow start.');
	return {
		timeZone,
		activeWeekdays: new Set(Array.from({ length: to - from + 1 }, (_, index) => from + index)),
		startMinute: start,
		endMinute: end,
		canonical: `${fromCode}-${toCode} ${startHour}:${startMinute}-${endHour}:${endMinute}`,
	};
}

interface ZonedParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
	weekday: number;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		weekday: 'short',
	}).formatToParts(instant);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(values.weekday);
	if (weekday < 0) throw new TypeError('Unable to resolve business weekday.');
	return {
		year: Number(values.year),
		month: Number(values.month),
		day: Number(values.day),
		hour: Number(values.hour),
		minute: Number(values.minute),
		second: Number(values.second),
		weekday,
	};
}

function addCalendarDay(parts: Pick<ZonedParts, 'year' | 'month' | 'day'>, days: number) {
	const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
	return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function localToInstant(input: {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	timeZone: string;
}): Date {
	const desired = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0);
	let candidate = desired;
	for (let iteration = 0; iteration < 4; iteration += 1) {
		const actual = zonedParts(new Date(candidate), input.timeZone);
		const actualWall = Date.UTC(
			actual.year,
			actual.month - 1,
			actual.day,
			actual.hour,
			actual.minute,
			actual.second
		);
		const delta = desired - actualWall;
		candidate += delta;
		if (delta === 0) break;
	}
	const result = new Date(candidate);
	const actual = zonedParts(result, input.timeZone);
	if (
		actual.year !== input.year ||
		actual.month !== input.month ||
		actual.day !== input.day ||
		actual.hour !== input.hour ||
		actual.minute !== input.minute
	) {
		throw new TypeError('Business-hours local time does not exist.');
	}
	return result;
}

export function nextBusinessWindow(
	instantValue: string,
	schedule: BusinessHoursSchedule
): string {
	const instant = new Date(instantValue);
	if (Number.isNaN(instant.valueOf())) throw new TypeError('Invalid instant.');
	const local = zonedParts(instant, schedule.timeZone);
	const localMinute = local.hour * 60 + local.minute;
	if (
		schedule.activeWeekdays.has(local.weekday) &&
		localMinute >= schedule.startMinute &&
		localMinute < schedule.endMinute
	) {
		return instant.toISOString();
	}

	let candidateDate = { year: local.year, month: local.month, day: local.day };
	let candidateWeekday = local.weekday;
	if (!(schedule.activeWeekdays.has(local.weekday) && localMinute < schedule.startMinute)) {
		do {
			candidateDate = addCalendarDay(candidateDate, 1);
			candidateWeekday = (candidateWeekday + 1) % 7;
		} while (!schedule.activeWeekdays.has(candidateWeekday));
	}
	return localToInstant({
		...candidateDate,
		hour: Math.floor(schedule.startMinute / 60),
		minute: schedule.startMinute % 60,
		timeZone: schedule.timeZone,
	}).toISOString();
}

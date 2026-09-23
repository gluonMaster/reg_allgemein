export const UI_LOCALE_COOKIE = 'kolibri_ui_locale';
export type UiLocale = 'de' | 'ru';

export function normalizeUiLocale(value: string | undefined): UiLocale {
	return value?.trim().toLowerCase().split(/[-_]/, 1)[0] === 'ru' ? 'ru' : 'de';
}

/** Only same-origin page paths may be used by the language form. */
export function languageReturnPath(value: FormDataEntryValue | null): string {
	if (
		typeof value !== 'string' ||
		!value.startsWith('/') ||
		value.startsWith('//') ||
		/[\\\r\n]/.test(value)
	)
		return '/';
	const url = new URL(value, 'https://portal.invalid');
	return url.origin === 'https://portal.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/';
}

export function formatEuro(locale: string | undefined, cents: number): string {
	return new Intl.NumberFormat(normalizeUiLocale(locale) === 'ru' ? 'ru-RU' : 'de-DE', {
		style: 'currency',
		currency: 'EUR',
	}).format(cents / 100);
}

/** Calendar dates keep their day; timestamps are displayed in Berlin time. */
export function formatCalendarDate(locale: string | undefined, value: string): string {
	const date = new Date(`${value}T00:00:00Z`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(normalizeUiLocale(locale) === 'ru' ? 'ru-RU' : 'de-DE', {
		dateStyle: 'medium', timeZone: 'UTC',
	}).format(date);
}

export function formatTimestamp(locale: string | undefined, value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(normalizeUiLocale(locale) === 'ru' ? 'ru-RU' : 'de-DE', {
		dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin',
	}).format(date);
}

/** Operational timestamps name their zone: "22.09.2026, 14:09 (Berlin)". */
export function formatBerlinTime(locale: string | undefined, value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	const ru = normalizeUiLocale(locale) === 'ru';
	const time = new Intl.DateTimeFormat(ru ? 'ru-RU' : 'de-DE', {
		day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
		timeZone: 'Europe/Berlin',
	}).format(date);
	return `${time} (${ru ? 'Берлин' : 'Berlin'})`;
}

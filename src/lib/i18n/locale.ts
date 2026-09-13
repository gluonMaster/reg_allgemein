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

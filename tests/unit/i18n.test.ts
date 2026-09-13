import {
	germanCatalog,
	translate,
	formatMessage,
	translateAdminCode,
	translateUiFeedback,
	type MessageKey,
} from '$lib/i18n';
import { russianCatalog } from '$lib/i18n/ru';
import { normalizeUiLocale, formatEuro, languageReturnPath } from '$lib/i18n/locale';

describe('i18n catalog', () => {
	it('covers every UI key in Russian with exactly the same placeholders', () => {
		const keys = Object.keys(germanCatalog).filter(
			(key) =>
				!key.includes('.email.') &&
				!key.startsWith('telegram.') &&
				!['absence.subject', 'absence.messageFormat'].includes(key)
		);
		expect(Object.keys(russianCatalog).sort()).toEqual(keys.sort());
		for (const key of keys as Array<keyof typeof russianCatalog>) {
			expect(russianCatalog[key].trim(), key).not.toBe('');
			expect(russianCatalog[key].match(/\{\w+\}/g)?.sort() ?? [], key).toEqual(
				germanCatalog[key].match(/\{\w+\}/g)?.sort() ?? []
			);
		}
	});

	it('leaves every outgoing message in German even for a Russian UI preference', () => {
		for (const key of Object.keys(germanCatalog).filter(
			(key) =>
				key.includes('.email.') ||
				key.startsWith('telegram.') ||
				['absence.subject', 'absence.messageFormat'].includes(key)
		) as MessageKey[]) {
			expect(translate('ru', key), key).toBe(germanCatalog[key]);
		}
	});

	it('normalizes browser locale, formats Russian UI values and retains safe fallbacks', () => {
		expect(translate('ru-RU', 'auth.login.title')).toBe('Вход');
		expect(translateUiFeedback('ru', germanCatalog['auth.invalidCredentials'])).toBe(
			russianCatalog['auth.invalidCredentials']
		);
		expect(translateUiFeedback('de', russianCatalog['auth.invalidCredentials'])).toBe(
			germanCatalog['auth.invalidCredentials']
		);
		expect(translateUiFeedback('ru', '4 Preview-Vertragsvorlagen wurden bereitgestellt.')).toBe(
			'Подготовлено шаблонов договоров для preview: 4.'
		);
		expect(formatMessage('ru', 'request.rate.individual', { amount: '30,00 €' })).toContain(
			'30,00 € за 45 минут'
		);
		expect(translateAdminCode('ru', 'delivery_unknown')).toBe('Результат доставки неизвестен');
		expect(translateAdminCode('ru', 'opaque-diagnostic-code')).toBe('opaque-diagnostic-code');
		expect(normalizeUiLocale(' RU_ru ')).toBe('ru');
		for (const invalid of [undefined, '', 'en', 'ru<script>'])
			expect(normalizeUiLocale(invalid)).toBe('de');
		expect(formatEuro('ru', 3000)).toContain('30,00');
		expect(formatEuro('ru', 3000)).toContain('€');
		for (const invalid of [
			null,
			'https://elsewhere.invalid',
			'//elsewhere.invalid',
			'/\\elsewhere.invalid',
			'/\r\nlocation: bad',
		])
			expect(languageReturnPath(invalid)).toBe('/');
		expect(languageReturnPath('/catalog?kind=group#courses')).toBe('/catalog?kind=group#courses');
	});
	it('returns the German catalog entry', () => {
		expect(translate('de-DE', 'home.title')).toBe(germanCatalog['home.title']);
	});

	it('falls back to German for a future locale without a catalog', () => {
		expect(translate('uk', 'errors.unexpected')).toBe(germanCatalog['errors.unexpected']);
	});

	it('contains the required German missing-duration warning', () => {
		expect(germanCatalog['pricing.estimatedMissingDuration']).toBe(
			'Geschätzter Monatspreis: {amount}. Dauer und Preis müssen von der Verwaltung bestätigt werden.'
		);
	});
});

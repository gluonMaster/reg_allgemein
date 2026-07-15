import { germanCatalog, translate } from '$lib/i18n';

describe('i18n catalog', () => {
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

export const defaultLocale = 'de' as const;

export const germanCatalog = {
	'home.title': 'Kolibri Anmeldung',
	'home.foundationNotice':
		'Das Registrierungsportal wird vorbereitet. Verfügbare Funktionen werden hier veröffentlicht.',
	'errors.unexpected':
		'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
} as const;

export type MessageKey = keyof typeof germanCatalog;

type Catalog = Partial<Record<MessageKey, string>>;

const catalogs: Record<string, Catalog> = {
	de: germanCatalog,
};

function baseLocale(locale: string | undefined): string {
	return locale?.trim().toLowerCase().split(/[-_]/, 1)[0] || defaultLocale;
}

export function translate(locale: string | undefined, key: MessageKey): string {
	return catalogs[baseLocale(locale)]?.[key] ?? germanCatalog[key];
}

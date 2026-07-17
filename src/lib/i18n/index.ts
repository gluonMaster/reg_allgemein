export const defaultLocale = 'de' as const;

export const germanCatalog = {
	'home.title': 'Kolibri Anmeldung',
	'home.foundationNotice':
		'Das Registrierungsportal wird vorbereitet. Verfügbare Funktionen werden hier veröffentlicht.',
	'errors.unexpected':
		'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
	'pricing.estimatedMissingDuration':
		'Geschätzter Monatspreis: {amount}. Dauer und Preis müssen von der Verwaltung bestätigt werden.',
	'pricing.needsAdminReview': 'Preis wird von der Verwaltung geprüft.',
	'auth.emailLabel': 'E-Mail-Adresse',
	'auth.passwordLabel': 'Passwort',
	'auth.firstNameLabel': 'Vorname',
	'auth.lastNameLabel': 'Nachname',
	'auth.csrfRejected': 'Die Sicherheitsprüfung ist abgelaufen. Bitte laden Sie die Seite neu.',
	'auth.invalidInput': 'Bitte prüfen Sie Ihre Eingaben.',
	'auth.invalidCredentials': 'E-Mail-Adresse oder Passwort ist nicht gültig.',
	'auth.neutralAccountMessage':
		'Wenn die Angaben zu einem Konto passen, wurde eine E-Mail vorbereitet.',
	'auth.registrationAccepted':
		'Vielen Dank. Bitte prüfen Sie Ihr E-Mail-Postfach und bestätigen Sie Ihre Adresse.',
	'auth.verificationSucceeded': 'Ihre E-Mail-Adresse wurde bestätigt.',
	'auth.verificationFailed': 'Der Link ist ungültig oder abgelaufen.',
	'auth.passwordResetSucceeded': 'Ihr Passwort wurde geändert. Bitte melden Sie sich neu an.',
	'auth.passwordResetFailed': 'Der Link ist ungültig oder abgelaufen.',
	'auth.emailChangeAccepted':
		'Bitte prüfen Sie das Postfach der neuen Adresse und bestätigen Sie die Änderung.',
	'auth.emailChangeUnavailable': 'Die E-Mail-Adresse kann derzeit nicht verwendet werden.',
	'auth.sessionsRevoked': 'Ihre Sitzungen wurden beendet.',
	'auth.rateLimited': 'Zu viele Versuche. Bitte versuchen Sie es später erneut.',
	'auth.serviceUnavailable': 'Diese Funktion ist derzeit nicht verfügbar.',
	'auth.privacyAcceptance':
		'Ich habe die aktuelle Datenschutzerklärung gelesen und akzeptiere sie.',
	'auth.register.title': 'Konto erstellen',
	'auth.register.submit': 'Registrieren',
	'auth.login.title': 'Anmelden',
	'auth.login.submit': 'Anmelden',
	'auth.logout.submit': 'Abmelden',
	'auth.resend.title': 'Bestätigungs-E-Mail erneut anfordern',
	'auth.resend.submit': 'E-Mail anfordern',
	'auth.forgot.title': 'Passwort zurücksetzen',
	'auth.forgot.submit': 'Link anfordern',
	'auth.verify.title': 'E-Mail-Adresse bestätigen',
	'auth.verify.submit': 'E-Mail bestätigen',
	'auth.reset.title': 'Neues Passwort festlegen',
	'auth.reset.submit': 'Passwort ändern',
	'auth.security.title': 'Kontosicherheit',
	'auth.security.newEmailLabel': 'Neue E-Mail-Adresse',
	'auth.security.changeEmailSubmit': 'Neue E-Mail bestätigen lassen',
	'auth.security.revokeSessionsSubmit': 'Alle Sitzungen beenden',
	'auth.link.register': 'Konto erstellen',
	'auth.link.login': 'Anmelden',
	'auth.link.forgot': 'Passwort vergessen?',
	'auth.link.resend': 'Bestätigungs-E-Mail erneut senden',
	'auth.navigationLabel': 'Kontonavigation',
	'auth.email.verification.subject': 'E-Mail-Adresse bestätigen',
	'auth.email.verification.body':
		'Bitte bestätigen Sie Ihre E-Mail-Adresse über diesen Link:\n\n{link}\n\nDer Link ist zeitlich begrenzt und kann nur einmal verwendet werden.',
	'auth.email.change.subject': 'Neue E-Mail-Adresse bestätigen',
	'auth.email.change.body':
		'Bitte bestätigen Sie die neue E-Mail-Adresse über diesen Link:\n\n{link}\n\nDer Link ist zeitlich begrenzt und kann nur einmal verwendet werden.',
	'auth.email.reset.subject': 'Passwort zurücksetzen',
	'auth.email.reset.body':
		'Über diesen Link können Sie ein neues Passwort festlegen:\n\n{link}\n\nDer Link ist zeitlich begrenzt und kann nur einmal verwendet werden.',
	'auth.email.welcome.subject': 'E-Mail-Adresse bestätigt',
	'auth.email.welcome.body':
		'Ihre E-Mail-Adresse wurde bestätigt. Sie können sich jetzt im Registrierungsportal anmelden.',
	'auth.email.passwordChanged.subject': 'Passwort geändert',
	'auth.email.passwordChanged.body':
		'Ihr Passwort wurde geändert und bestehende Sitzungen wurden beendet.',
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

export function formatMessage(
	locale: string | undefined,
	key: MessageKey,
	parameters: Readonly<Record<string, string | number>>
): string {
	return translate(locale, key).replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, name: string) =>
		Object.hasOwn(parameters, name) ? String(parameters[name]) : placeholder
	);
}

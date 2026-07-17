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
	'claim.email.proof.subject': 'Frühere Familiendaten bestätigen',
	'claim.email.proof.body':
		'Über diesen Link können Sie den Zugriff auf Ihre früheren Familiendaten bestätigen:\n\n{link}\n\nMelden Sie sich dazu mit dem anfragenden Konto an. Der Link ist zeitlich begrenzt und kann nur einmal verwendet werden.',
	'cabinet.title': 'Mein Bereich',
	'cabinet.profile.title': 'Profil',
	'cabinet.profile.familyId': 'Familiennummer',
	'cabinet.children.title': 'Kinder',
	'cabinet.children.empty': 'Noch keine Kinder gespeichert.',
	'cabinet.child.fullName': 'Vollständiger Name',
	'cabinet.child.birthDate': 'Geburtsdatum',
	'cabinet.child.create': 'Kind hinzufügen',
	'cabinet.child.update': 'Kind speichern',
	'cabinet.child.correct': 'Korrektur anfragen',
	'cabinet.child.portal': 'Im Portal angelegt',
	'cabinet.child.legacy': 'Aus früheren Daten übernommen',
	'cabinet.child.correctionPending': 'Die Korrektur wird geprüft.',
	'cabinet.child.saved': 'Das Kind wurde gespeichert.',
	'cabinet.child.updated': 'Die Angaben wurden aktualisiert.',
	'cabinet.child.correctionRequested': 'Die Korrektur wurde zur Prüfung eingereicht.',
	'cabinet.child.rejected': 'Die Änderung konnte nicht gespeichert werden.',
	'cabinet.child.duplicateWarning':
		'Ein Kind mit diesem Namen und Geburtsdatum ist bereits in Ihrem Konto gespeichert. Bestätigen Sie, wenn Sie es trotzdem anlegen oder ändern möchten.',
	'cabinet.child.confirmDuplicate': 'Trotzdem speichern',
	'cabinet.claim.title': 'Frühere Familiendaten gefunden',
	'cabinet.claim.offer':
		'Zu Ihren Angaben passt genau eine frühere Familie. Zur Bestätigung senden wir einen Link an {maskedEmail}.',
	'cabinet.claim.request': 'Bestätigungslink senden',
	'cabinet.claim.requested': 'Der Bestätigungslink wurde vorbereitet.',
	'cabinet.claim.unavailable': 'Die Bestätigung ist derzeit nicht verfügbar.',
	'cabinet.claim.confirmTitle': 'Frühere Familiendaten verbinden',
	'cabinet.claim.confirmText':
		'Bestätigen Sie die Verbindung nur, wenn Sie den Link selbst angefordert haben.',
	'cabinet.claim.confirm': 'Familiendaten verbinden',
	'cabinet.claim.confirmed': 'Die früheren Familiendaten wurden verbunden.',
	'cabinet.claim.failed': 'Der Link ist ungültig, abgelaufen oder gehört zu einem anderen Konto.',
	'cabinet.activities.title': 'Aktuelle und übernommene Angebote',
	'cabinet.activities.empty': 'Derzeit sind keine Angebote verfügbar.',
	'cabinet.activities.legacyService': 'Übernommene aktive Leistung',
	'cabinet.activities.kind.group': 'Gruppenangebot',
	'cabinet.activities.kind.danceGroup': 'Tanzgruppe',
	'cabinet.activities.kind.nachhilfe': 'Nachhilfe',
	'cabinet.activities.kind.individual': 'Einzelunterricht',
	'cabinet.activities.kind.needsReview': 'Zuordnung wird geprüft',
	'cabinet.activities.noDigitalContract':
		'Der frühere Papiervertrag wird nicht als digitaler Vertrag im Portal geführt. Deshalb gibt es hier kein Vertrags-PDF.',
	'cabinet.activities.priceUnknown': 'Grundpreis wird geprüft',
	'cabinet.pricing.totalTitle': 'Orientierender monatlicher Grundpreis',
	'cabinet.pricing.totalDisclaimer':
		'Dies ist keine Rechnung und kein tatsächlich zu zahlender Betrag. Ferien und andere externe Anpassungen sind nicht berechnet.',
	'cabinet.pricing.unknownNotice':
		'Mindestens ein unbekannter oder noch nicht bestätigter Grundpreis ist nicht in der Summe enthalten.',
	'cabinet.pricing.individualNotice':
		'Einzelunterricht: {amount} je 45 Minuten. Tatsächlich durchgeführte Stunden werden im Portal nicht abgerechnet.',
	'cabinet.pricing.nachhilfeNotice':
		'Finanzierte Nachhilfe: 30,00 € je 45 Minuten als Vertragstarif. Dies ist kein Zahlbetrag für Eltern; tatsächlich durchgeführte Stunden werden im Portal nicht berechnet.',
	'cabinet.payment.externalSepa':
		'Eine bestehende Lastschrift erfolgt außerhalb des Portals über den tatsächlich fälligen Betrag. Das Portal erstellt kein SEPA-Mandat und führt keine Zahlungen oder Schulden.',
	'cabinet.payment.manual':
		'Der tatsächlich fällige Betrag einschließlich externer Anpassungen ist selbstständig spätestens bis zum 7. des Folgemonats zu zahlen. Das Portal führt keine Zahlungen oder Schulden.',
	'cabinet.payment.notApplicable': 'Für finanzierte Nachhilfe gibt es keinen Zahlhinweis für Eltern.',
	'cabinet.navigationLabel': 'Bereichsnavigation',
	'cabinet.link.home': 'Startseite',
	'cabinet.link.security': 'Kontosicherheit',
	'cabinet.link.cabinet': 'Mein Bereich',
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

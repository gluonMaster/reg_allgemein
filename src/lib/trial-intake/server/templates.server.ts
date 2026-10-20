import { ORGANIZATION_NAME } from '$lib/organization';
import type { IntakeDetail } from './model.server';
import type { EmailMessage, TelegramMessage } from '$lib/server/outbox/providers';
import { telegramDeliveryReference, OutboxTemplateError } from '$lib/server/outbox/templates';
import type { TelegramOutboxRow } from '$lib/server/outbox/contracts';
import type { DatabaseBoundary } from '$lib/server/db/database';
import { ageFit, lessonAgeRange } from '../age';
import { ageRangeLabel } from '../i18n';

export const buildingLabel = (key: string) => (key === 'Kolibri' ? ORGANIZATION_NAME : key);
/** A guest reads the letter away from the portal, so the building carries its street address. */
export const BUILDING_ADDRESS: Record<string, string> = {
	Kolibri: 'Ritzenbergstraße 3 • 01067 Dresden',
	Villa: 'Kraftwerk Mitte 2 • 01067 Dresden',
};
export const ORGANIZATION_PHONE = '+49 179 9474938';
/** Owner decision 2026-09-24: the bureau mailbox learns when Telegram did not take a notification. */
export const BUREAU_ALERT_EMAIL = 'registration@kolibri-dresden.de';
const DAYS = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
/** Children outside the group's age; an older one passed submit only with the parent's acknowledgment. */
function ageMismatches(item: IntakeDetail['items'][number]) {
	const range = lessonAgeRange({ subject: item.subject, group: item.group_name });
	return item.children.flatMap((child) => {
		const fit = ageFit(range, child.birth_date, item.desired_date);
		return fit === 'ok' || !range ? [] : [{ child, fit, label: ageRangeLabel(range, 'de') }];
	});
}
const germanDate = (date: string) => date.split('-').reverse().join('.');
const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
function htmlMessage(text: string, button?: { label: string; link: string }): string {
	return (
		'<!doctype html><html lang="de"><body>' +
		text
			.split('\n\n')
			.map((paragraph) =>
				button && paragraph === `${button.label}: ${button.link}`
					? `<p><a href="${escapeHtml(button.link)}" style="display:inline-block;padding:12px 18px;background:#176b4a;color:white;border-radius:6px">${escapeHtml(button.label)}</a></p>`
					: `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`
			)
			.join('') +
		'</body></html>'
	);
}
export function verificationEmail(detail: IntakeDetail, link: string): EmailMessage {
	const message: EmailMessage = {
		to: detail.request.email,
		subject: `Bitte bestätigen Sie Ihre Anfrage für Probestunden beim ${ORGANIZATION_NAME}`,
		text:
			`Sie haben beim ${ORGANIZATION_NAME} Probestunden für folgende Angebote angefragt:\n\n` +
			detail.items
				.map(
					(i) =>
						`${i.subject} — ${germanDate(i.desired_date)}, ${i.start_time}–${i.end_time}, ${buildingLabel(i.building)}`
				)
				.join('\n') +
			'\n\nBitte bestätigen Sie Ihre E-Mail-Adresse über die Schaltfläche „Anfrage bestätigen“, damit Ihre Anfrage an unser Büro weitergeleitet wird.\n\n' +
			`Anfrage bestätigen: ${link}\n\nNach der Bestätigung erhalten Sie eine E-Mail mit allen Angaben zu Ihrer Anmeldung. Ihre Anfrage ist noch keine Zusage für einen Platz.\n\n${ORGANIZATION_NAME}`,
	};
	message.html = htmlMessage(message.text, { label: 'Anfrage bestätigen', link });
	return message;
}
/** Sent once the address is confirmed: what is registered, where it happens, how to reach us. */
export function confirmationEmail(detail: IntakeDetail): EmailMessage {
	const message: EmailMessage = {
		to: detail.request.email,
		subject: `Ihre Anmeldung für Probestunden beim ${ORGANIZATION_NAME}`,
		text:
			'Ihre Anmeldung ist bei uns eingegangen. Wir haben folgende Probestunden notiert:\n\n' +
			detail.items
				.map((i) =>
					[
						`${i.children.map((c) => `${c.first_name} ${c.last_name}`).join(', ')}: ${i.subject} — ${i.group_name}`,
						`${DAYS[i.weekday]}, ${germanDate(i.desired_date)}, ${i.start_time}–${i.end_time}`,
						`${buildingLabel(i.building)}, ${BUILDING_ADDRESS[i.building] ?? ''}, Raum ${i.room}`,
						...ageMismatches(i).map(
							(m) =>
								`Hinweis: ${m.child.first_name} ${m.child.last_name} ist am Wunschtermin ${m.fit === 'old' ? 'älter' : 'jünger'} als für diese Gruppe vorgesehen (${m.label}). Das Büro prüft, ob die Gruppe passt.`
						),
					].join('\n')
				)
				.join('\n\n') +
			'\n\nBei Bedarf melden wir uns bei Ihnen.\n\n' +
			`Tel. ${ORGANIZATION_PHONE}\n${ORGANIZATION_NAME}`,
	};
	message.html = htmlMessage(message.text);
	return message;
}
/** Tells the bureau mailbox that a request notification needs a look; carries no request data. */
export function telegramAlertEmail(
	alert: {
		reason: 'delivery_unknown' | 'dead';
		requestId: string;
		part: number;
		deliveryReference: string | null;
		errorCode: string | null;
	},
	origin: string
): EmailMessage {
	const request = new URL(`/admin/trial-intake/${alert.requestId}`, origin).toString();
	const delivery = new URL(`/admin/outbox?channel=telegram&status=${alert.reason}`, origin).toString();
	const unknown = alert.reason === 'delivery_unknown';
	const paragraphs = [
		unknown
			? 'Eine Telegram-Benachrichtigung des Portals an das Büro wurde nicht bestätigt. Die Nachricht kann im Büro-Chat angekommen sein oder fehlen.'
			: `Telegram hat eine Benachrichtigung des Portals an das Büro abgelehnt (Fehlercode: ${alert.errorCode ?? 'unbekannt'}). Die Nachricht ist nicht im Büro-Chat angekommen.`,
		...(alert.deliveryReference
			? [`Zustellcode: ${alert.deliveryReference} (Teil ${alert.part})`]
			: []),
		unknown
			? 'Bitte im Büro-Chat nach dem Zustellcode suchen; er steht in der letzten Zeile der Nachricht. Gefunden: auf der Zustellseite „Nachricht gefunden“ wählen. Nicht gefunden: „Nachricht nicht gefunden“ wählen, dann wird sie erneut gesendet. Weitere Teile dieser Anfrage warten bis dahin, andere Anfragen werden normal gesendet.'
			: 'Andere Anfragen werden weiter gesendet. Nach Klärung der Ursache kann der Versand auf der Zustellseite erneut freigegeben werden.',
		`Anfrage im Portal: ${request}`,
		`Zustellung prüfen: ${delivery}`,
		'Die Anfrage selbst ist im Portal gespeichert.',
		ORGANIZATION_NAME,
	];
	const message: EmailMessage = {
		to: BUREAU_ALERT_EMAIL,
		subject: unknown
			? 'Telegram-Benachrichtigung nicht bestätigt — Probestunden-Anfrage'
			: 'Telegram-Benachrichtigung nicht zugestellt — Probestunden-Anfrage',
		text: paragraphs.join('\n\n'),
	};
	message.html = htmlMessage(message.text, { label: 'Zustellung prüfen', link: delivery });
	return message;
}
export function telegramParts(detail: IntakeDetail): string[] {
	const r = detail.request;
	const lines = [
		ORGANIZATION_NAME,
		'Neue Anfrage für Probestunden',
		`Eltern: ${r.parent_first_name} ${r.parent_last_name}`,
		`Telefon: ${r.phone}`,
		`E-Mail: ${r.email}`,
		'Kinder:',
		...detail.children.map(
			(c, index) => `${index + 1}. ${c.first_name} ${c.last_name}; geboren: ${c.birth_date}`
		),
		...detail.items.flatMap((i) => [
			`Fach: ${i.subject}`,
			`Gruppe: ${i.group_name}`,
			`Wunschtermin: ${i.desired_date}`,
			`${DAYS[i.weekday]} ${i.start_time}–${i.end_time}`,
			`Lehrkraft: ${i.teacher}`,
			`Raum: ${i.room}`,
			`Gebäude: ${buildingLabel(i.building)}`,
			`Kinder: ${i.children.map((c) => detail.children.findIndex((child) => child.id === c.id) + 1).join(', ')}`,
			...ageMismatches(i).map(
				(m) =>
					`Alter: Kind ${detail.children.findIndex((child) => child.id === m.child.id) + 1} ${m.fit === 'old' ? 'älter' : 'jünger'} als die Gruppe (${m.label})${m.fit === 'old' ? ', Hinweis bestätigt' : ''}`
			),
		]),
	];
	// <= 160 per field; split by lines, reserving 596 UTF-16 units for references/URL.
	const parts: string[] = [];
	let part = '';
	for (const line of lines) {
		if (line.length > 3500) throw new OutboxTemplateError('INTAKE_TELEGRAM_TOO_LONG');
		if (part && part.length + 1 + line.length > 3500) {
			parts.push(part);
			part = '';
		}
		part += (part ? '\n' : '') + line;
	}
	if (part) parts.push(part);
	return parts;
}
export async function renderIntakeTelegram(
	db: DatabaseBoundary,
	input: {
		row: TelegramOutboxRow;
		config: { portalPublicOrigin: string };
		chatId?: string;
		now: string;
	}
): Promise<TelegramMessage> {
	const { row } = input;
	let data: unknown;
	try {
		data = JSON.parse(row.payload_json);
	} catch {
		throw new OutboxTemplateError('INTAKE_TELEGRAM_INVALID');
	}
	if (
		!input.chatId ||
		row.source_kind !== 'trial_intake' ||
		row.template_or_category !== 'bureau.trial_intake' ||
		row.destination_ref !== 'bureau' ||
		row.locale !== 'de' ||
		!data ||
		typeof data !== 'object' ||
		Object.keys(data).join() !== 'payloadId' ||
		typeof Reflect.get(data, 'payloadId') !== 'string'
	) {
		throw new OutboxTemplateError('INTAKE_TELEGRAM_INVALID');
	}
	const p = await db.first<{ request_id: string; body: string; part: number; total: number }>({
		sql: `SELECT p.* FROM trial_intake_telegram_payloads p JOIN trial_intake_requests r ON r.id = p.request_id
		 JOIN telegram_outbox o ON o.source_id = r.id
		 WHERE p.id = ? AND r.id = ? AND o.id = ? AND o.status = 'processing' AND o.lease_owner = ?
		 AND r.state IN ('verified','processed') AND (r.delete_after IS NULL OR r.delete_after > ?)`,
		params: [Reflect.get(data, 'payloadId'), row.source_id, row.id, row.lease_owner, input.now],
	});
	if (!p) throw new OutboxTemplateError('INTAKE_PAYLOAD_UNAVAILABLE');
	const deliveryReference = await telegramDeliveryReference(row.dedupe_key);
	const text =
		`Anfrage ${p.request_id} — Teil ${p.part}/${p.total}\n${p.body}\n` +
		`${new URL(`/admin/trial-intake/${p.request_id}`, input.config.portalPublicOrigin)}\nZustellung: ${deliveryReference}`;
	if (text.length > 4096) throw new OutboxTemplateError('INTAKE_TELEGRAM_TOO_LONG');
	return { chatId: input.chatId, text, deliveryReference };
}

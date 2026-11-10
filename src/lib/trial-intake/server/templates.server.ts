import { ORGANIZATION_NAME } from '$lib/organization';
import type { IntakeChild, IntakeDetail } from './model.server';
import type { EmailMessage, TelegramMessage } from '$lib/server/outbox/providers';
import { telegramDeliveryReference, OutboxTemplateError } from '$lib/server/outbox/templates';
import type { TelegramOutboxRow } from '$lib/server/outbox/contracts';
import type { DatabaseBoundary } from '$lib/server/db/database';
import { ageFit, ageOn, lessonAgeRange } from '../age';
import { ageRangeLabel } from '../i18n';

export const buildingLabel = (key: string) => (key === 'Kolibri' ? ORGANIZATION_NAME : key);
import {
	BUILDING_ADDRESS,
	OFFICE_HOURS,
	ORGANIZATION_EMAIL,
	ORGANIZATION_PHONE,
} from '../organization';
export { BUILDING_ADDRESS, OFFICE_HOURS, ORGANIZATION_EMAIL, ORGANIZATION_PHONE };
/** Owner decision 2026-09-24: the bureau mailbox learns when Telegram did not take a notification. */
export const BUREAU_ALERT_EMAIL = ORGANIZATION_EMAIL;
export const DAYS = [
	'',
	'Montag',
	'Dienstag',
	'Mittwoch',
	'Donnerstag',
	'Freitag',
	'Samstag',
	'Sonntag',
];
/** Children outside the group's age; an older one passed submit only with the parent's acknowledgment. */
function ageMismatches(item: IntakeDetail['items'][number]) {
	const range = lessonAgeRange({ subject: item.subject, group: item.group_name });
	return item.children.flatMap((child) => {
		const fit = ageFit(range, child.birth_date, item.desired_date);
		return fit === 'ok' || !range ? [] : [{ child, fit, label: ageRangeLabel(range, 'de') }];
	});
}
export const germanDate = (date: string) => date.split('-').reverse().join('.');
const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
/** `button` turns its "label: link" paragraph into a button; `link` becomes a plain anchor. */
export function htmlMessage(
	text: string,
	button?: { label: string; link: string },
	link?: string
): string {
	const linked = (html: string) =>
		link
			? html.replaceAll(
					escapeHtml(link),
					`<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`
				)
			: html;
	return (
		'<!doctype html><html lang="de"><body>' +
		text
			.split('\n\n')
			.map((paragraph) =>
				button && paragraph === `${button.label}: ${button.link}`
					? `<p><a href="${escapeHtml(button.link)}" style="display:inline-block;padding:12px 18px;background:#176b4a;color:white;border-radius:6px">${escapeHtml(button.label)}</a></p>`
					: `<p>${linked(escapeHtml(paragraph)).replaceAll('\n', '<br>')}</p>`
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
	const delivery = new URL(
		`/admin/outbox?channel=telegram&status=${alert.reason}`,
		origin
	).toString();
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
/*
 * The bureau notification is Telegram HTML (parse_mode HTML, owner decision 2026-11-11): every
 * value a family typed is escaped, and each line closes its own tags, so a split by lines keeps
 * every part valid. Inside the bureau chat the building is its short key ("Kolibri", "Villa").
 */
export const tgText = escapeHtml;
export const tgBold = (text: string) => `<b>${escapeHtml(text)}</b>`;
/** "Di" of "Dienstag". */
export const shortDay = (weekday: number) => DAYS[weekday].slice(0, 2);
type TelegramChild = Pick<IntakeChild, 'id' | 'first_name' | 'last_name' | 'birth_date'>;
/** The first name, or the full name where two children of the request share it. */
export function tgChildName(child: TelegramChild, all: readonly TelegramChild[]) {
	return all.filter((c) => c.first_name === child.first_name).length > 1
		? `${child.first_name} ${child.last_name}`
		: child.first_name;
}
export function tgParent(r: IntakeDetail['request']): string[] {
	return [
		`👤 ${tgBold(`${r.parent_first_name} ${r.parent_last_name}`)}`,
		`📞 ${tgText(r.phone)}`,
		`✉️ ${tgText(r.email)}`,
	];
}
/** The age counts on the lesson date the family chose (`ageDate`). */
export function tgChildren(children: readonly TelegramChild[], ageDate: string): string[] {
	return children.map((c) => {
		const age = ageDate && c.birth_date ? `${ageOn(c.birth_date, ageDate)} J. ` : '';
		return `🧒 ${tgBold(`${c.first_name} ${c.last_name}`)}, ${age}(${germanDate(c.birth_date)})`;
	});
}
export function tgAgeWarning(name: string, fit: 'young' | 'old', label: string) {
	return `⚠️ ${tgBold(`${name} ist ${fit === 'old' ? 'älter' : 'jünger'} als die Gruppe (${label})`)}${fit === 'old' ? ' · Hinweis bestätigt' : ''}`;
}
/** "👩‍🏫 Lehrkraft · 📍 Raum 3.3, Kolibri"; an empty teacher is left out. */
export function tgPlace(lesson: { teacher: string; room: string; building: string }) {
	return [
		...(lesson.teacher ? [`👩‍🏫 ${tgText(lesson.teacher)}`] : []),
		`📍 ${tgText(`Raum ${lesson.room}, ${lesson.building}`)}`,
	].join(' · ');
}
export function telegramParts(detail: IntakeDetail): string[] {
	const n = detail.items.length;
	const ageDate = detail.items.map((i) => i.desired_date).sort()[0] ?? '';
	const lines = [
		`🆕 ${tgBold(n === 1 ? 'Neue Probestunde' : `Neue Anfrage: ${n} Probestunden`)}`,
		'',
		...tgParent(detail.request),
		'',
		...tgChildren(detail.children, ageDate),
		...detail.items.flatMap((i) => [
			'',
			`📚 ${tgBold(i.subject)} · ${tgText(i.group_name)}`,
			`📅 ${tgBold(`${shortDay(i.weekday)}, ${germanDate(i.desired_date)}, ${i.start_time}–${i.end_time}`)}`,
			tgPlace(i),
			...(detail.children.length > 1
				? [
						`🧒 ${tgText(i.children.map((c) => tgChildName(c, detail.children)).join(', '))}`,
					]
				: []),
			...ageMismatches(i).map((m) =>
				tgAgeWarning(tgChildName(m.child, detail.children), m.fit, m.label)
			),
		]),
	];
	return splitTelegram(lines);
}
/** <= 160 per field; split by lines, reserving 596 UTF-16 units for references/URL. */
export function splitTelegram(lines: readonly string[]): string[] {
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
	const p = await db.first<{
		request_id: string;
		body: string;
		part: number;
		total: number;
		kind: string;
		lead: string | null;
	}>({
		sql: `SELECT p.*, r.kind,
			 (SELECT substr(f.body, 1, 64) FROM trial_intake_telegram_payloads f WHERE f.request_id = p.request_id AND f.part = 1) AS lead
			 FROM trial_intake_telegram_payloads p JOIN trial_intake_requests r ON r.id = p.request_id
		 JOIN telegram_outbox o ON o.source_id = r.id
		 WHERE p.id = ? AND r.id = ? AND o.id = ? AND o.status = 'processing' AND o.lease_owner = ?
		 AND r.state IN ('verified','processed') AND (r.delete_after IS NULL OR r.delete_after > ?)`,
		params: [Reflect.get(data, 'payloadId'), row.source_id, row.id, row.lease_owner, input.now],
	});
	if (!p) throw new OutboxTemplateError('INTAKE_PAYLOAD_UNAVAILABLE');
	const deliveryReference = await telegramDeliveryReference(row.dedupe_key);
	const link = new URL(
		`/admin/trial-intake/${p.request_id}`,
		input.config.portalPublicOrigin
	).toString();
	// Parts stored before the HTML template (their first part opens with the organization name)
	// keep the plain frame; this branch can go once no such part is left in any queue.
	if (p.lead?.startsWith(`${ORGANIZATION_NAME}\n`)) {
		const text = `Anfrage ${p.request_id} — Teil ${p.part}/${p.total}\n${p.body}\n${link}\nZustellung: ${deliveryReference}`;
		if (text.length > 4096) throw new OutboxTemplateError('INTAKE_TELEGRAM_TOO_LONG');
		return { chatId: input.chatId, text, deliveryReference };
	}
	// The request ID travels in the link; the code stays the last line for the bureau's search.
	const text = [
		...(p.total > 1 ? [`<i>Teil ${p.part}/${p.total}</i>`] : []),
		p.body,
		'',
		`🔗 <a href="${escapeHtml(link)}">${p.kind === 'waitlist' ? 'Anmeldung' : 'Anfrage'} im Portal öffnen</a>`,
		`Zustellung: <code>${deliveryReference}</code>`,
	].join('\n');
	if (text.length > 4096) throw new OutboxTemplateError('INTAKE_TELEGRAM_TOO_LONG');
	return { chatId: input.chatId, text, deliveryReference, parseMode: 'HTML' };
}

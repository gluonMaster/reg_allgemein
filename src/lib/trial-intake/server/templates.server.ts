import { ORGANIZATION_NAME } from '$lib/organization';
import type { IntakeDetail } from './model.server';
import type { EmailMessage, TelegramMessage } from '$lib/server/outbox/providers';
import { telegramDeliveryReference, OutboxTemplateError } from '$lib/server/outbox/templates';
import type { TelegramOutboxRow } from '$lib/server/outbox/contracts';
import type { DatabaseBoundary } from '$lib/server/db/database';

export const buildingLabel = (key: string) => (key === 'Kolibri' ? ORGANIZATION_NAME : key);
const DAYS = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export function verificationEmail(detail: IntakeDetail, link: string): EmailMessage {
	const message: EmailMessage = {
		to: detail.request.email,
		subject: `Bitte bestätigen Sie Ihre Anfrage für Probestunden beim ${ORGANIZATION_NAME}`,
		text:
			`Sie haben beim ${ORGANIZATION_NAME} Probestunden für folgende Angebote angefragt:\n\n` +
			detail.items
				.map(
					(i) =>
						`${i.subject} — ${i.desired_date}, ${i.start_time}–${i.end_time}, ${buildingLabel(i.building)}`
				)
				.join('\n') +
			'\n\nBitte bestätigen Sie Ihre E-Mail-Adresse über die Schaltfläche „Anfrage bestätigen“, damit Ihre Anfrage an unser Büro weitergeleitet wird.\n\n' +
			`Anfrage bestätigen: ${link}\n\nNach der Bestätigung melden wir uns telefonisch bei Ihnen, um den Besuch abzustimmen. Ihre Anfrage ist noch keine Zusage für einen Platz.\n\n${ORGANIZATION_NAME}`,
	};
	const escape = (v: string) =>
		v
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	message.html =
		'<!doctype html><html lang="de"><body>' +
		message.text
			.split('\n\n')
			.map((p) =>
				p === `Anfrage bestätigen: ${link}`
					? `<p><a href="${escape(link)}" style="display:inline-block;padding:12px 18px;background:#176b4a;color:white;border-radius:6px">Anfrage bestätigen</a></p>`
					: `<p>${escape(p).replaceAll('\n', '<br>')}</p>`
			)
			.join('') +
		'</body></html>';
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

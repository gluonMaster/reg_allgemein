import { ORGANIZATION_NAME } from '$lib/organization';
import type { RuntimeConfig } from '$lib/server/config/runtime';
import type { DatabaseBoundary } from '$lib/server/db/database';
import { sha256Bytes, sha256Hex } from '$lib/server/security/digest';
import {
	BrowserRunContractPdfAdapter,
	ContractPdfError,
	SyntheticContractPdfAdapter,
	type ContractPdfAdapter,
} from '$lib/server/contracts/pdf';
import {
	DEJAVU_SANS_BOLD_CONTRACT_V1_BASE64,
	DEJAVU_SANS_CONTRACT_V1_BASE64,
} from '$lib/server/contracts/dejavu-sans-subset';
import type { EmailOutboxRow } from '$lib/server/outbox/contracts';
import type {
	EmailAttachmentResolution,
	EmailAttachmentResolver,
} from '$lib/server/outbox/email-attachments';
import { OutboxProviderError, type EmailMessage } from '$lib/server/outbox/providers';
import { OutboxTemplateError } from '$lib/server/outbox/templates';
import type { Lesson } from '../contracts';
import { berlinDate } from '../dates';
import { waitlistConsentText } from '../i18n';
import { lessonMinutes } from '../planned';
import { euroAmount } from '../prices';
import type { IntakeChild, IntakeRequest, WaitlistEntry } from './model.server';
import {
	BUILDING_ADDRESS,
	DAYS,
	OFFICE_HOURS,
	ORGANIZATION_EMAIL,
	ORGANIZATION_PHONE,
	buildingLabel,
	germanDate,
} from './templates.server';
import { entryWithConfirmation, readEntry } from './waitlist-core.server';
import {
	TARIFF,
	childName,
	confirmationDay,
	entryCents,
	startSum,
	waitlistStartEmail,
	type StartEntry,
	type StartLesson,
} from './waitlist-templates.server';

// The PDF "Bestätigung der Anmeldung und Zahlungszusage" of a start letter (WL-11, ADR-032):
// self-contained HTML with the DejaVu subset of the contract module, rendered by the Browser Run
// adapter of ADR-014. The adapter and the font are imported unchanged.

/** WL-11: one A4 page; the D1 column of 0032 accepts at most 1 MiB. */
export const WAITLIST_PDF_MAX_BYTES = 1024 * 1024;
/** `source_kind` of the start and probe letters in the shared e-mail worker. */
export const WAITLIST_LETTER_SOURCE = 'trial_intake_waitlist';
/** Browser Run in the Worker, the synthetic adapter in tests, otherwise no renderer (WL-10). */
export function waitlistPdfAdapter(
	config: Pick<RuntimeConfig, 'browser' | 'appEnvironment' | 'contracts'>
): ContractPdfAdapter | null {
	const limits = {
		maxHtmlBytes: config.contracts.maxHtmlBytes,
		maxPdfBytes: Math.min(config.contracts.maxPdfBytes, WAITLIST_PDF_MAX_BYTES),
		browserDailyBudgetMs: config.contracts.browserDailyBudgetMs,
	};
	if (config.browser) return new BrowserRunContractPdfAdapter(config.browser, limits);
	if (config.appEnvironment === 'test') return new SyntheticContractPdfAdapter(limits, 'test');
	return null;
}

const escapeHtml = (value: string | number) =>
	String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
/** "05.11.2026, 14:30 Uhr" in Berlin time. */
function berlinDateTime(instant: string): string {
	return `${new Intl.DateTimeFormat('de-DE', {
		timeZone: 'Europe/Berlin',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(instant))} Uhr`;
}
const berlinDay = (instant: string) => germanDate(berlinDate(instant));
/** A short, unguessable number of the signup; its request ID is never printed. */
export async function documentReference(entry: Pick<WaitlistEntry, 'withdraw_nonce'>) {
	const hex = (await sha256Hex(`trial-intake:document:v1:${entry.withdraw_nonce}`))
		.slice(0, 8)
		.toUpperCase();
	return `WL-${hex.slice(0, 4)}-${hex.slice(4)}`;
}
/** ASCII only, as Resend requires: `Anmeldebestaetigung-<Fach>-<DD.MM.YYYY>.pdf`. */
export function documentFileName(subject: string, firstDate: string): string {
	const fach =
		subject
			.replace(
				/[äÄöÖüÜß]/gu,
				(c) => ({ ä: 'ae', Ä: 'Ae', ö: 'oe', Ö: 'Oe', ü: 'ue', Ü: 'Ue', ß: 'ss' })[c]!
			)
			.normalize('NFKD')
			.replace(/\p{M}+/gu, '')
			.replace(/[^A-Za-z0-9]+/gu, '-')
			.replace(/^-+|-+$/gu, '')
			.slice(0, 60) || 'Kurs';
	return `Anmeldebestaetigung-${fach}-${germanDate(firstDate)}.pdf`;
}
export interface WaitlistDocumentInput {
	reference: string;
	/** When the document is rendered: "Erstellt am". */
	createdAt: string;
	request: Pick<
		IntakeRequest,
		'parent_first_name' | 'parent_last_name' | 'email' | 'phone' | 'created_at' | 'verified_at'
	>;
	children: Pick<IntakeChild, 'first_name' | 'last_name' | 'birth_date'>[];
	entry: StartEntry;
	start: StartLesson;
}
const CSS = `
@font-face { font-family: 'Kolibri Document'; src: url('data:font/woff;base64,${DEJAVU_SANS_CONTRACT_V1_BASE64}') format('woff'); font-style: normal; font-weight: 400; font-display: block; }
@font-face { font-family: 'Kolibri Document'; src: url('data:font/woff;base64,${DEJAVU_SANS_BOLD_CONTRACT_V1_BASE64}') format('woff'); font-style: normal; font-weight: 700; font-display: block; }
@page { size: A4; margin: 13mm 16mm 12mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #172033; font-family: 'Kolibri Document'; font-size: 9.5pt; line-height: 1.38; }
header { display: flex; justify-content: space-between; gap: 6mm; border-bottom: 0.4mm solid #172033; padding-bottom: 2.5mm; margin-bottom: 4mm; }
header strong { font-size: 11pt; }
header .contact { text-align: right; font-size: 8.5pt; }
h1 { font-size: 15pt; margin: 0 0 1mm; }
.subtitle { font-size: 11pt; font-weight: 700; margin: 0 0 1mm; }
.meta { font-size: 8.5pt; color: #4d5668; margin: 0 0 2mm; }
h2 { font-size: 10.5pt; margin: 3.2mm 0 1mm; break-after: avoid; }
p { margin: 0 0 1mm; }
ul { margin: 0; padding-left: 5mm; }
.columns { display: grid; grid-template-columns: 1fr 1fr; gap: 0 8mm; }
.consent { border-left: 1mm solid #8993a8; background: #f4f5f8; padding: 1.5mm 3mm; margin-top: 1mm; }
.next { border: 0.5mm solid #176b4a; background: #eef7f2; padding: 3mm 4mm; margin-top: 4mm; break-inside: avoid; }
.next h2 { margin-top: 0; }
.signature { display: flex; gap: 12mm; margin-top: 11mm; }
.signature div { flex: 1; border-top: 0.3mm solid #172033; padding-top: 1mm; font-size: 8.5pt; }
footer { margin-top: 6mm; border-top: 0.3mm solid #8993a8; padding-top: 2mm; font-size: 8pt; color: #4d5668; }
`;
/** WL-11 and "Texte" (OQ-050): every field is escaped; no script and no external resource. */
export function waitlistDocumentHtml(input: WaitlistDocumentInput): string {
	const { request: r, entry, start } = input;
	const { lesson } = start;
	const first = germanDate(start.firstDate);
	const signupDay = berlinDay(r.created_at);
	const p = (text: string) => `<p>${escapeHtml(text)}</p>`;
	// After a duration change the family confirmed a new sum by phone: approved variants of OQ-052.
	const sum = startSum(entry);
	const consent = waitlistConsentText(
		'de',
		entry.tariff,
		entryCents(entry),
		input.children.length
	);
	const body = [
		'<header><div>',
		`<strong>${escapeHtml(ORGANIZATION_NAME)}</strong><br>`,
		`${escapeHtml(BUILDING_ADDRESS.Kolibri)}<br>`,
		`Villa der Kulturen, ${escapeHtml(BUILDING_ADDRESS.Villa)}`,
		'</div><div class="contact">',
		`Tel. ${escapeHtml(ORGANIZATION_PHONE)}<br>${escapeHtml(ORGANIZATION_EMAIL)}`,
		'</div></header>',
		'<h1>Bestätigung der Anmeldung und Zahlungszusage</h1>',
		`<p class="subtitle">Kurs ${escapeHtml(lesson.subject)} — Beginn am ${escapeHtml(first)}</p>`,
		`<p class="meta">Nr. ${escapeHtml(input.reference)} · Erstellt am ${escapeHtml(berlinDay(input.createdAt))}</p>`,
		'<div class="columns"><section>',
		'<h2>Erziehungsberechtigte(r)</h2>',
		p(`${r.parent_first_name} ${r.parent_last_name}`),
		p(r.email),
		p(r.phone),
		'</section><section>',
		'<h2>Angemeldete Kinder</h2><ul>',
		...input.children.map(
			(c) =>
				`<li>${escapeHtml(childName(c))}, geboren am ${escapeHtml(germanDate(c.birth_date))}</li>`
		),
		'</ul></section></div>',
		'<h2>Kurs</h2>',
		p(lesson.subject),
		p(
			`${DAYS[lesson.weekday]}, ${lesson.start}–${lesson.end} (${lessonMinutes(lesson)} Minuten)`
		),
		p(`Erster Termin: ${DAYS[lesson.weekday]}, ${first}`),
		p(
			`${buildingLabel(lesson.building)}, ${BUILDING_ADDRESS[lesson.building] ?? ''}, Raum ${lesson.room}`
		),
		p(`Lehrkraft: ${lesson.teacher}`),
		'<h2>Beitrag</h2>',
		p(`Tarif: ${TARIFF[entry.tariff]}`),
		`<p><strong>${escapeHtml(euroAmount(sum.cents))} € pro Monat je Kind</strong></p>`,
		p(
			sum.confirmation
				? `Die Kursdauer hat sich auf ${sum.confirmation.minutes} Minuten geändert. Den neuen Betrag haben Sie am ${confirmationDay(sum.confirmation)} telefonisch bestätigt.`
				: `Dieser Betrag wurde bei Ihrer Anmeldung am ${signupDay} festgelegt.`
		),
		'<h2>Ihre Zusage</h2>',
		p(
			`Sie haben sich am ${berlinDateTime(r.created_at)} auf der Warteliste angemeldet und die Anmeldung am ${r.verified_at ? berlinDateTime(r.verified_at) : '—'} über den Link in unserer E-Mail bestätigt. Dabei haben Sie folgender Erklärung zugestimmt:`
		),
		`<p class="consent">${escapeHtml(consent)}</p>`,
		...(sum.confirmation
			? [p('Der dort genannte Betrag wurde durch den oben genannten Beitrag ersetzt.')]
			: []),
		'<section class="next"><h2>Nächster Schritt</h2>',
		p(
			`Bitte kommen Sie bis zum ersten Termin am ${first} in unser Büro in der Villa der Kulturen, ${BUILDING_ADDRESS.Villa}, und schließen Sie den Vertrag ab. Bürozeiten: ${OFFICE_HOURS}. Bringen Sie dieses Schreiben unterschrieben mit. Die Teilnahme am Kurs ist erst mit unterschriebenem Vertrag möglich.`
		),
		'</section>',
		'<div class="signature"><div>Ort, Datum</div><div>Unterschrift Erziehungsberechtigte(r)</div></div>',
		'<footer>',
		p(
			'Dieses Dokument ist kein Vertrag. Der Vertrag kommt erst mit Ihrer Unterschrift in unserem Büro zustande. Das Dokument bestätigt Ihre Anmeldung und Ihre Zusage, den oben genannten Beitrag zu zahlen.'
		),
		p(`${ORGANIZATION_NAME} · Tel. ${ORGANIZATION_PHONE} · ${ORGANIZATION_EMAIL}`),
		'</footer>',
	].join('\n');
	return `<!doctype html>\n<html lang="de"><head><meta charset="utf-8"><title>Bestätigung der Anmeldung und Zahlungszusage</title><style>${CSS}</style></head><body>\n${body}\n</body></html>`;
}

/** SQL: waitlist letter `o` of request `r` and entry `e` may still go out. Bind `now` once. */
export const WAITLIST_LETTER_VALID = `((r.delete_after IS NULL OR r.delete_after > ?) AND (
 (o.kind = 'start' AND e.status = 'started' AND e.start_id = o.start_id)
 OR (o.kind = 'probe' AND EXISTS(SELECT 1 FROM users u WHERE u.id = o.probe_recipient_user_id
  AND u.role = 'admin' AND u.account_status = 'active' AND u.is_blocked = 0))))`;
export const WAITLIST_LETTER_FROM = `trial_intake_waitlist_email_outbox o
 JOIN trial_intake_requests r ON r.id = o.request_id
 JOIN trial_intake_waitlist_entries e ON e.request_id = o.request_id`;
interface WaitlistLetter {
	kind: 'start' | 'probe';
	startId: string | null;
	to: string;
	request: IntakeRequest;
	children: IntakeChild[];
	entry: WaitlistEntry & StartEntry;
	start: StartLesson;
}
/** The letter the worker holds the lease of, if it is still current at dispatch. */
async function readLetter(
	db: DatabaseBoundary,
	row: Pick<EmailOutboxRow, 'id' | 'source_id' | 'lease_owner'>,
	now: string
): Promise<WaitlistLetter | null> {
	const letter = await db.first<{
		kind: 'start' | 'probe';
		start_id: string | null;
		probe_date: string | null;
		probe_lesson_json: string | null;
		first_date: string | null;
		start_lesson_json: string | null;
		admin_email: string | null;
	}>({
		sql: `SELECT o.kind, o.start_id, o.probe_date, o.probe_lesson_json, s.first_date, s.lesson_json AS start_lesson_json,
		 (SELECT u.email FROM users u WHERE u.id = o.probe_recipient_user_id) AS admin_email
		 FROM ${WAITLIST_LETTER_FROM} LEFT JOIN trial_intake_waitlist_starts s ON s.id = o.start_id
		 WHERE o.id = ? AND o.request_id = ? AND o.status = 'processing' AND o.lease_owner = ? AND ${WAITLIST_LETTER_VALID}`,
		params: [row.id, row.source_id, row.lease_owner, now],
	});
	if (!letter) return null;
	const [request, children, entry] = await Promise.all([
		db.first<IntakeRequest>({
			sql: 'SELECT * FROM trial_intake_requests WHERE id = ?',
			params: [row.source_id],
		}),
		db.all<IntakeChild>({
			sql: 'SELECT * FROM trial_intake_children WHERE request_id = ? ORDER BY position',
			params: [row.source_id],
		}),
		readEntry(db, row.source_id),
	]);
	const lessonJson =
		letter.kind === 'start' ? letter.start_lesson_json : letter.probe_lesson_json;
	const firstDate = letter.kind === 'start' ? letter.first_date : letter.probe_date;
	const to = letter.kind === 'start' ? request?.email : letter.admin_email;
	if (!request || !entry || !lessonJson || !firstDate || !to) return null;
	return {
		kind: letter.kind,
		startId: letter.start_id,
		to,
		request,
		children: children.results,
		entry: await entryWithConfirmation(db, entry),
		start: { lesson: JSON.parse(lessonJson) as Lesson, firstDate },
	};
}
/** Text of a start or probe letter; the PDF is attached by the resolver below. */
export async function renderWaitlistLetter(
	db: DatabaseBoundary,
	row: EmailOutboxRow,
	now: string
): Promise<EmailMessage> {
	const letter = await readLetter(db, row, now);
	if (!letter) throw new OutboxTemplateError('INTAKE_EMAIL_EXPIRED');
	return waitlistStartEmail(
		letter,
		letter.entry,
		letter.start,
		letter.kind === 'probe' ? letter.to : undefined
	);
}
/** D1 hands a BLOB back as an array of bytes or as a buffer, depending on the runtime. */
function blobBytes(value: unknown): Uint8Array<ArrayBuffer> {
	if (value instanceof Uint8Array) return Uint8Array.from(value);
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (Array.isArray(value)) return Uint8Array.from(value as number[]);
	throw new OutboxTemplateError('WAITLIST_PDF_INVALID');
}
interface StoredDocument {
	bytes: Uint8Array<ArrayBuffer>;
	sha256: string;
}
async function storedDocument(
	db: DatabaseBoundary,
	requestId: string,
	startId: string
): Promise<StoredDocument | null> {
	const row = await db.first<{ pdf: unknown; sha256: string; byte_size: number }>({
		sql: 'SELECT pdf, sha256, byte_size FROM trial_intake_waitlist_documents WHERE request_id = ? AND start_id = ?',
		params: [requestId, startId],
	});
	if (!row) return null;
	const bytes = blobBytes(row.pdf);
	if (bytes.byteLength !== row.byte_size || (await sha256Bytes(bytes)) !== row.sha256)
		throw new OutboxTemplateError('WAITLIST_PDF_HASH_MISMATCH');
	return { bytes, sha256: row.sha256 };
}
/**
 * Attaches the PDF to a start or probe letter. A start letter renders its document once, stores
 * it and sends the stored file on every retry; a probe renders anew and stores nothing. A Browser
 * Run failure that may pass (limit, 429, 5xx) leaves the letter in its ordinary retry.
 */
export class WaitlistAttachmentResolver implements EmailAttachmentResolver {
	constructor(
		private readonly db: DatabaseBoundary,
		private readonly adapter: ContractPdfAdapter | null,
		private readonly clock: () => string = () => new Date().toISOString()
	) {}
	async resolve(row: EmailOutboxRow): Promise<EmailAttachmentResolution> {
		if (row.source_kind !== WAITLIST_LETTER_SOURCE)
			return { attachments: [], previewReview: false };
		const now = this.clock();
		const letter = await readLetter(this.db, row, now);
		if (!letter) throw new OutboxTemplateError('INTAKE_EMAIL_EXPIRED');
		const pdf =
			letter.kind === 'start'
				? ((await storedDocument(this.db, letter.request.id, letter.startId!)) ??
					(await this.render(letter, now)))
				: await this.render(letter, now);
		await this.db.run({
			sql: `UPDATE trial_intake_waitlist_email_outbox SET pdf_sha256 = ?
			 WHERE id = ? AND status = 'processing' AND lease_owner = ?`,
			params: [pdf.sha256, row.id, row.lease_owner],
		});
		return {
			previewReview: false,
			attachments: [
				{
					filename: documentFileName(letter.start.lesson.subject, letter.start.firstDate),
					content: pdf.bytes,
					contentType: 'application/pdf',
				},
			],
		};
	}
	/** Browser time of the Berlin calendar day, as the contract module counts it; no family data. */
	private async budgetUsed(now: string) {
		const from = `${berlinDate(now)}T00:00:00.000Z`;
		const row = await this.db.first<{ used: number }>({
			sql: `SELECT COALESCE(SUM(browser_ms_used), 0) AS used FROM trial_intake_waitlist_render_usage
			 WHERE created_at >= ? AND created_at < ?`,
			params: [from, new Date(Date.parse(from) + 86_400_000).toISOString()],
		});
		return Number(row?.used ?? 0);
	}
	private usage(
		kind: WaitlistLetter['kind'],
		status: 'succeeded' | 'failed',
		errorCode: string | null,
		browserMs: number | null,
		now: string
	) {
		return this.db.run({
			sql: `INSERT INTO trial_intake_waitlist_render_usage(id, kind, renderer, status, error_code, browser_ms_used, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			params: [
				crypto.randomUUID(),
				kind,
				this.adapter?.rendererId ?? 'none',
				status,
				errorCode,
				browserMs,
				now,
			],
		});
	}
	private async render(letter: WaitlistLetter, now: string): Promise<StoredDocument> {
		if (!this.adapter) throw new OutboxProviderError('WAITLIST_PDF_RENDERER_MISSING', true);
		const html = waitlistDocumentHtml({
			reference: await documentReference(letter.entry),
			createdAt: now,
			request: letter.request,
			children: letter.children,
			entry: letter.entry,
			start: letter.start,
		});
		let result;
		try {
			result = await this.adapter.render({
				html,
				sourceManifestHash: await sha256Hex(html),
				browserBudgetUsedMs: await this.budgetUsed(now),
			});
		} catch (error) {
			const code = error instanceof ContractPdfError ? error.code : 'WAITLIST_PDF_FAILED';
			await this.usage(letter.kind, 'failed', code, null, now);
			// The daily budget renews tomorrow; any other adapter refusal says itself whether it may pass.
			const retryable =
				!(error instanceof ContractPdfError) ||
				error.retryable ||
				code === 'BROWSER_DAILY_BUDGET_EXCEEDED';
			throw new OutboxProviderError(code, retryable);
		}
		await this.usage(letter.kind, 'succeeded', null, result.browserMsUsed, now);
		if (letter.kind === 'probe')
			return { bytes: Uint8Array.from(result.bytes), sha256: result.sha256 };
		const { id } = letter.request;
		// A parallel render may have stored its file first: every retry then sends that one.
		await this.db.run({
			sql: `INSERT OR IGNORE INTO trial_intake_waitlist_documents(request_id, start_id, pdf, sha256, byte_size, renderer, created_at)
			 SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS(SELECT 1 FROM trial_intake_waitlist_entries e
			 WHERE e.request_id = ? AND e.start_id = ? AND e.status = 'started')`,
			params: [
				id,
				letter.startId,
				result.bytes.slice().buffer,
				result.sha256,
				result.bytes.byteLength,
				this.adapter.rendererId,
				now,
				id,
				letter.startId,
			],
		});
		const stored = await storedDocument(this.db, id, letter.startId!);
		if (!stored) throw new OutboxTemplateError('INTAKE_EMAIL_EXPIRED');
		return stored;
	}
}
/** The stored PDF of a started signup for the admin download, with the name of its letter. */
export async function readWaitlistDocument(db: DatabaseBoundary, requestId: string) {
	const row = await db.first<{
		pdf: unknown;
		sha256: string;
		first_date: string;
		lesson_json: string;
	}>({
		sql: `SELECT d.pdf, d.sha256, s.first_date, s.lesson_json FROM trial_intake_waitlist_documents d
		 JOIN trial_intake_waitlist_entries e ON e.request_id = d.request_id AND e.start_id = d.start_id
		 JOIN trial_intake_waitlist_starts s ON s.id = d.start_id WHERE d.request_id = ?`,
		params: [requestId],
	});
	if (!row) return null;
	return {
		bytes: blobBytes(row.pdf),
		sha256: row.sha256,
		fileName: documentFileName((JSON.parse(row.lesson_json) as Lesson).subject, row.first_date),
	};
}

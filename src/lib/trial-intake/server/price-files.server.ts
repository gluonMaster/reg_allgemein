import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { centsText } from '../prices';
import { IntakeError } from './validation.server';

// The admin price list of WL-05 as CSV and XLSX with the same columns. Import reads only these
// columns of one sheet through a non-executing parser: no formulas are evaluated, macros,
// encrypted and damaged files are refused whole, and the workbook is never dumped.
export const PRICE_COLUMNS = [
	'Fach',
	'Wochentag',
	'Uhrzeit',
	'Gebäude',
	'Lehrkraft',
	'Raum',
	'Monatsvertrag €/Monat',
	'Jahresvertrag €/Monat',
	'Mindestteilnehmer',
	'Status',
] as const;
export const IMPORT_MAX_BYTES = 256 * 1024;
export const IMPORT_MAX_ROWS = 500;
/** Each XML part may unpack to this size; the archive itself is at most 256 KiB. */
const PART_MAX_BYTES = 4 * 1024 * 1024;

export interface PriceExportRow {
	fach: string;
	wochentag: string;
	uhrzeit: string;
	gebaeude: string;
	lehrkraft: string;
	raum: string;
	monthlyCents: number | null;
	yearlyCents: number | null;
	minParticipants: number | null;
	status: string;
}
type Field =
	| 'fach'
	| 'wochentag'
	| 'uhrzeit'
	| 'gebaeude'
	| 'lehrkraft'
	| 'raum'
	| 'monthly'
	| 'yearly'
	| 'min'
	| 'status';
export type PriceFileRow = Record<Field, string>;
export interface PriceFileLine {
	line: number;
	row: PriceFileRow;
}

function exportCells(row: PriceExportRow) {
	return [
		row.fach,
		row.wochentag,
		row.uhrzeit,
		row.gebaeude,
		row.lehrkraft,
		row.raum,
		row.monthlyCents,
		row.yearlyCents,
		row.minParticipants,
		row.status,
	] as const;
}
function csvField(value: string): string {
	return /[;",\r\n]|^\s|\s$/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
/** UTF-8 with BOM, semicolon, decimal comma and CRLF: German Excel opens it without a wizard. */
export function priceCsv(rows: readonly PriceExportRow[]): Uint8Array {
	const lines = [PRICE_COLUMNS.join(';')];
	for (const row of rows) {
		lines.push(
			exportCells(row)
				.map((cell, index) =>
					cell === null
						? ''
						: typeof cell === 'number'
							? index === 8
								? String(cell)
								: centsText(cell)
							: csvField(cell)
				)
				.join(';')
		);
	}
	return strToU8(`\uFEFF${lines.join('\r\n')}\r\n`);
}
const escapeXml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		// XML 1.0 has no representation for most control characters.
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '');
const columnName = (index: number) => String.fromCharCode(65 + index);
/** One sheet "Preise"; amounts are numbers shown with two decimals, text is inline. */
export function priceXlsx(rows: readonly PriceExportRow[]): Uint8Array {
	const cell = (value: string | number | null, column: number, row: number) => {
		const ref = `${columnName(column)}${row}`;
		if (value === null) return '';
		if (typeof value === 'number') {
			return column === 8
				? `<c r="${ref}"><v>${value}</v></c>`
				: `<c r="${ref}" s="1"><v>${centsText(value, '.')}</v></c>`;
		}
		return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
	};
	const sheetRows = [
		PRICE_COLUMNS as readonly (string | number | null)[],
		...rows.map(exportCells),
	]
		.map(
			(cells, index) =>
				`<row r="${index + 1}">${cells.map((value, column) => cell(value, column, index + 1)).join('')}</row>`
		)
		.join('');
	const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
	const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
	const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
	return zipSync(
		{
			'[Content_Types].xml': strToU8(
				`${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
			),
			'_rels/.rels': strToU8(
				`${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
			),
			'xl/workbook.xml': strToU8(
				`${xml}<workbook xmlns="${main}" xmlns:r="${rel}"><sheets><sheet name="Preise" sheetId="1" r:id="rId1"/></sheets></workbook>`
			),
			'xl/_rels/workbook.xml.rels': strToU8(
				`${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`
			),
			'xl/styles.xml': strToU8(
				`${xml}<styleSheet xmlns="${main}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`
			),
			'xl/worksheets/sheet1.xml': strToU8(
				`${xml}<worksheet xmlns="${main}"><sheetData>${sheetRows}</sheetData></worksheet>`
			),
		},
		{ level: 6 }
	);
}

const invalid = () => new IntakeError('WAITLIST_IMPORT_INVALID', 422);
function decodeXml(value: string): string {
	return value.replace(
		/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/giu,
		(_, hex, dec, name) => {
			if (hex || dec) {
				const code = Number.parseInt(hex ?? dec, hex ? 16 : 10);
				return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
			}
			return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name as 'amp'];
		}
	);
}
const attribute = (attributes: string, name: string) =>
	new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'u').exec(attributes)?.[1] ?? null;
/** Text of all runs, without phonetic hints. */
const runText = (xml: string) =>
	[...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/gu, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
		.map((m) => decodeXml(m[1]))
		.join('');
function columnIndex(ref: string | null): number | null {
	const letters = ref && /^([A-Z]{1,3})\d+$/u.exec(ref)?.[1];
	if (!letters) return null;
	let index = 0;
	for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
	return index - 1;
}
function sheetTable(xml: string, shared: readonly string[]): { line: number; cells: string[] }[] {
	const table: { line: number; cells: string[] }[] = [];
	for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/gu)) {
		const line = Number(attribute(row[1], 'r')) || table.length + 1;
		const cells: string[] = [];
		for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
			const index = columnIndex(attribute(cell[1], 'r')) ?? cells.length;
			if (index > 64) continue; // far beyond the ten columns of the price list
			const body = cell[2] ?? '';
			const type = attribute(cell[1], 't');
			const stored = /<v>([\s\S]*?)<\/v>/u.exec(body)?.[1];
			let value = '';
			if (type === 'inlineStr')
				value = runText(/<is>([\s\S]*?)<\/is>/u.exec(body)?.[1] ?? '');
			else if (type === 's') {
				const text = shared[Number(stored)];
				if (stored === undefined || text === undefined) throw invalid();
				value = text;
			} else if (type !== 'e' && stored !== undefined) value = decodeXml(stored);
			cells[index] = value;
		}
		table.push({ line, cells: Array.from(cells, (value) => value ?? '') });
	}
	return table;
}
function readXlsx(bytes: Uint8Array): { line: number; cells: string[] }[] {
	const names: string[] = [];
	const unzip = (wanted: (name: string) => boolean) => {
		try {
			return unzipSync(bytes, {
				filter: (file) => {
					names.push(file.name);
					if (!wanted(file.name)) return false;
					if (file.originalSize > PART_MAX_BYTES) throw invalid();
					return true;
				},
			});
		} catch {
			throw invalid();
		}
	};
	const meta = new Set([
		'[Content_Types].xml',
		'xl/workbook.xml',
		'xl/_rels/workbook.xml.rels',
		'xl/sharedStrings.xml',
	]);
	const parts = unzip((name) => meta.has(name));
	const text = (name: string) => {
		try {
			return parts[name] ? strFromU8(parts[name]) : null;
		} catch {
			throw invalid();
		}
	};
	const types = text('[Content_Types].xml');
	if (
		names.some((name) => /(?:^|\/)vbaProject\.bin$/iu.test(name)) ||
		/macroEnabled|vbaProject/iu.test(types ?? '')
	)
		throw new IntakeError('WAITLIST_IMPORT_MACRO', 422);
	const workbook = text('xl/workbook.xml');
	const rels = text('xl/_rels/workbook.xml.rels');
	if (!types?.includes('spreadsheetml.sheet.main+xml') || !workbook || !rels) throw invalid();
	const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/gu)].map((m) => ({
		name: decodeXml(attribute(m[1], 'name') ?? ''),
		rid: attribute(m[1], 'r:id'),
	}));
	const sheet =
		sheets.find((s) => s.name.trim().toLocaleLowerCase('de-DE') === 'preise') ??
		(sheets.length === 1 ? sheets[0] : undefined);
	if (!sheet?.rid) throw invalid();
	const target = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/gu)]
		.map((m) => m[1])
		.find((r) => attribute(r, 'Id') === sheet.rid);
	const path = target && attribute(target, 'Target');
	if (!path || path.includes('..')) throw invalid();
	const sheetPath = path.startsWith('/') ? path.slice(1) : `xl/${path}`;
	const sheetXml = unzip((name) => name === sheetPath)[sheetPath];
	if (!sheetXml) throw invalid();
	const sharedXml = text('xl/sharedStrings.xml');
	const shared = sharedXml
		? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/gu)].map((m) => runText(m[1]))
		: [];
	try {
		return sheetTable(strFromU8(sheetXml), shared);
	} catch (error) {
		if (error instanceof IntakeError) throw error;
		throw invalid();
	}
}
function decodeCsv(bytes: Uint8Array): string {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		// German Excel saves "CSV (Trennzeichen-getrennt)" in Windows-1252.
		try {
			return new TextDecoder('windows-1252').decode(bytes);
		} catch {
			throw invalid();
		}
	}
}
/** RFC 4180 with the delimiter of the header line: `;` from German Excel, otherwise `,`. */
function readCsv(bytes: Uint8Array): { line: number; cells: string[] }[] {
	const text = decodeCsv(bytes).replace(/^\uFEFF/u, '');
	const header = text.slice(0, text.search(/\r?\n|$/u));
	const delimiter = header.includes(';') ? ';' : ',';
	const table: { line: number; cells: string[] }[] = [];
	let cells: string[] = [];
	let field = '';
	let quoted = false;
	let line = 1;
	let start = 1;
	const endRow = () => {
		cells.push(field);
		table.push({ line: start, cells });
		cells = [];
		field = '';
	};
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (char === '"') quoted = false;
			else {
				if (char === '\n') line++;
				field += char;
			}
		} else if (char === '"' && field === '') quoted = true;
		else if (char === delimiter) {
			cells.push(field);
			field = '';
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && text[i + 1] === '\n') i++;
			endRow();
			start = ++line;
		} else field += char;
	}
	if (quoted) throw invalid();
	if (field !== '' || cells.length) endRow();
	return table;
}
const HEADERS: [Field, (header: string) => boolean][] = [
	['fach', (h) => h === 'fach'],
	['wochentag', (h) => h === 'wochentag'],
	['uhrzeit', (h) => h === 'uhrzeit'],
	['gebaeude', (h) => h.startsWith('geb')],
	['lehrkraft', (h) => h === 'lehrkraft'],
	['raum', (h) => h === 'raum'],
	['monthly', (h) => h.startsWith('monatsvertrag')],
	['yearly', (h) => h.startsWith('jahresvertrag')],
	['min', (h) => h.startsWith('mindestteilnehmer')],
	['status', (h) => h === 'status'],
];
const REQUIRED: Field[] = [
	'fach',
	'wochentag',
	'uhrzeit',
	'gebaeude',
	'lehrkraft',
	'monthly',
	'yearly',
];
/**
 * A CSV or XLSX price list as rows of the allowlisted columns. Format, size, macros,
 * encryption, header and row limit are checked for the whole file before any row is used.
 */
export function readPriceFile(bytes: Uint8Array, fileName: string): PriceFileLine[] {
	if (bytes.byteLength > IMPORT_MAX_BYTES)
		throw new IntakeError('WAITLIST_IMPORT_TOO_LARGE', 413);
	const name = fileName.toLocaleLowerCase('de-DE');
	if (name.endsWith('.xlsm')) throw new IntakeError('WAITLIST_IMPORT_MACRO', 422);
	// Encrypted OOXML and the old binary .xls are OLE compound files.
	if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0)
		throw new IntakeError('WAITLIST_IMPORT_ENCRYPTED', 422);
	const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
	if (!zip && /\.xlsx?$/u.test(name)) throw invalid();
	const table = zip ? readXlsx(bytes) : readCsv(bytes);
	const [head, ...body] = table;
	if (!head) throw invalid();
	const columns = new Map<Field, number>();
	head.cells.forEach((cell, index) => {
		const header = cell
			.normalize('NFC')
			.trim()
			.replace(/\s+/gu, ' ')
			.toLocaleLowerCase('de-DE');
		const field = HEADERS.find(([, matches]) => matches(header))?.[0];
		if (!field) return;
		if (columns.has(field)) throw invalid();
		columns.set(field, index);
	});
	if (REQUIRED.some((field) => !columns.has(field))) throw invalid();
	const rows = body.filter((row) => row.cells.some((cell) => cell.trim() !== ''));
	if (rows.length > IMPORT_MAX_ROWS) throw new IntakeError('WAITLIST_IMPORT_TOO_MANY_ROWS', 413);
	return rows.map(({ line, cells }) => ({
		line,
		row: Object.fromEntries(
			HEADERS.map(([field]) => {
				const index = columns.get(field);
				return [
					field,
					index === undefined ? '' : (cells[index] ?? '').trim().slice(0, 160),
				];
			})
		) as PriceFileRow,
	}));
}

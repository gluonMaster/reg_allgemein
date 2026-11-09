import { strToU8, zipSync } from 'fflate';
import {
	IMPORT_MAX_BYTES,
	IMPORT_MAX_ROWS,
	PRICE_COLUMNS,
	priceCsv,
	priceXlsx,
	readPriceFile,
	type PriceExportRow,
} from '$lib/trial-intake/server/price-files.server';

const rows: PriceExportRow[] = [
	{
		fach: 'English',
		wochentag: 'Dienstag',
		uhrzeit: '16:00–17:00',
		gebaeude: 'Villa',
		lehrkraft: 'Lehrkraft Ä',
		raum: 'R 1; oben',
		monthlyCents: 6650,
		yearlyCents: 5905,
		minParticipants: 3,
		status: 'sammelt: 0 von 3 Kindern',
	},
	{
		fach: 'Baby',
		wochentag: 'Donnerstag',
		uhrzeit: '16:00–16:45',
		gebaeude: 'Kolibri',
		lehrkraft: 'Lehrkraft "B"',
		raum: 'R2',
		monthlyCents: null,
		yearlyCents: null,
		minParticipants: null,
		status: 'Preis fehlt',
	},
];
const code = (fn: () => unknown) => {
	try {
		fn();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return 'no error';
};
const XML = '<?xml version="1.0" encoding="UTF-8"?>';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function workbook(files: Record<string, string>, extra: Record<string, Uint8Array> = {}) {
	return zipSync({
		'[Content_Types].xml': strToU8(
			files.types ??
				`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`
		),
		'xl/workbook.xml': strToU8(
			`${XML}<workbook xmlns="${MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Notizen" sheetId="1" r:id="rId1"/><sheet name="Preise" sheetId="2" r:id="rId2"/></sheets></workbook>`
		),
		'xl/_rels/workbook.xml.rels': strToU8(
			`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`
		),
		'xl/sharedStrings.xml': strToU8(files.shared ?? `${XML}<sst xmlns="${MAIN}"></sst>`),
		'xl/worksheets/sheet1.xml': strToU8(
			`${XML}<worksheet xmlns="${MAIN}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>not read</t></is></c></row></sheetData></worksheet>`
		),
		'xl/worksheets/sheet2.xml': strToU8(files.sheet),
		...extra,
	});
}
/** Shared strings as Excel writes them: header and text cells by index, a rich-text run. */
function sharedStringsWorkbook(extra: Record<string, Uint8Array> = {}, types?: string) {
	const strings = [
		...PRICE_COLUMNS,
		'English',
		'Di',
		'16:00-17:00',
		'Villa',
		'Lehrkraft &amp; Co',
	];
	const shared = `${XML}<sst xmlns="${MAIN}">${strings
		.map((s, i) =>
			i === 10
				? `<si><r><t>Eng</t></r><r><t>lish</t></r><rPh><t>x</t></rPh></si>`
				: `<si><t>${s}</t></si>`
		)
		.join('')}<si><t>ignored column</t></si></sst>`;
	const sheet = `${XML}<worksheet xmlns="${MAIN}"><sheetData>
<row r="1">${PRICE_COLUMNS.map((_, i) => `<c r="${String.fromCharCode(65 + i)}1" t="s"><v>${i}</v></c>`).join('')}<c r="L1" t="s"><v>15</v></c></row>
<row r="2"/>
<row r="3"><c r="A3" t="s"><v>10</v></c><c r="B3" t="s"><v>11</v></c><c r="C3" t="s"><v>12</v></c><c r="D3" t="s"><v>13</v></c><c r="E3" t="s"><v>14</v></c><c r="G3"><f>G9*2</f><v>66.5</v></c><c r="H3"><v>59</v></c><c r="I3"><v>4</v></c><c r="L3" t="inlineStr"><is><t>secret</t></is></c></row>
</sheetData></worksheet>`;
	return workbook({ shared, sheet, ...(types ? { types } : {}) }, extra);
}

describe('waitlist price export', () => {
	it('writes CSV for German Excel: BOM, semicolon, decimal comma, CRLF', () => {
		const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(priceCsv(rows));
		expect(text.startsWith('\uFEFFFach;Wochentag;Uhrzeit;Gebäude;Lehrkraft;Raum;')).toBe(true);
		expect(text.split('\r\n')).toEqual([
			`\uFEFF${PRICE_COLUMNS.join(';')}`,
			'English;Dienstag;16:00–17:00;Villa;Lehrkraft Ä;"R 1; oben";66,50;59,05;3;sammelt: 0 von 3 Kindern',
			'Baby;Donnerstag;16:00–16:45;Kolibri;"Lehrkraft ""B""";R2;;;;Preis fehlt',
			'',
		]);
	});
	it('reads its own CSV and XLSX back to the same rows', () => {
		const expected = [
			{
				line: 2,
				row: {
					fach: 'English',
					wochentag: 'Dienstag',
					uhrzeit: '16:00–17:00',
					gebaeude: 'Villa',
					lehrkraft: 'Lehrkraft Ä',
					raum: 'R 1; oben',
					monthly: '66,50',
					yearly: '59,05',
					min: '3',
					status: 'sammelt: 0 von 3 Kindern',
				},
			},
			{
				line: 3,
				row: {
					fach: 'Baby',
					wochentag: 'Donnerstag',
					uhrzeit: '16:00–16:45',
					gebaeude: 'Kolibri',
					lehrkraft: 'Lehrkraft "B"',
					raum: 'R2',
					monthly: '',
					yearly: '',
					min: '',
					status: 'Preis fehlt',
				},
			},
		];
		expect(readPriceFile(priceCsv(rows), 'Warteliste-Preise.csv')).toEqual(expected);
		// XLSX stores the amounts as numbers with a decimal point.
		expected[0].row.monthly = '66.50';
		expected[0].row.yearly = '59.05';
		expect(readPriceFile(priceXlsx(rows), 'Warteliste-Preise.xlsx')).toEqual(expected);
	});
});
describe('waitlist price import', () => {
	it('reads a synthetic Excel archive with shared strings, only the allowlisted cells', () => {
		expect(readPriceFile(sharedStringsWorkbook(), 'preise.xlsx')).toEqual([
			{
				line: 3,
				row: {
					fach: 'English',
					wochentag: 'Di',
					uhrzeit: '16:00-17:00',
					gebaeude: 'Villa',
					lehrkraft: 'Lehrkraft & Co',
					raum: '',
					// The stored value of a formula; nothing is evaluated.
					monthly: '66.5',
					yearly: '59',
					min: '4',
					status: '',
				},
			},
		]);
	});
	it('reads CSV with a comma, quotes, without BOM and in Windows-1252', () => {
		const comma = strToU8(
			'Fach,Wochentag,Uhrzeit,Gebäude,Lehrkraft,Monatsvertrag,Jahresvertrag\n"Eng,lish",Di,16:00-17:00,Villa,"Multi\nLine",66.5,59\n'
		);
		expect(readPriceFile(comma, 'x.csv')).toEqual([
			{
				line: 2,
				row: expect.objectContaining({
					fach: 'Eng,lish',
					lehrkraft: 'Multi\nLine',
					monthly: '66.5',
				}),
			},
		]);
		const latin = Uint8Array.from(
			[
				...'Fach;Wochentag;Uhrzeit;Gebäude;Lehrkraft;Monatsvertrag €/Monat;Jahresvertrag\r\nMüller;Di;16:00-17:00;Villa;Ä;1;2\r\n',
			].map((c) => (c === '€' ? 0x80 : c.charCodeAt(0)))
		);
		expect(readPriceFile(latin, 'x.csv')[0].row).toMatchObject({
			fach: 'Müller',
			lehrkraft: 'Ä',
		});
	});
	it('refuses macros, encryption, damage, limits and a foreign header as a whole', () => {
		expect(
			code(() =>
				readPriceFile(
					sharedStringsWorkbook({ 'xl/vbaProject.bin': new Uint8Array([1]) }),
					'a.xlsx'
				)
			)
		).toBe('WAITLIST_IMPORT_MACRO');
		const macroType = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>`;
		expect(code(() => readPriceFile(sharedStringsWorkbook({}, macroType), 'a.xlsx'))).toBe(
			'WAITLIST_IMPORT_MACRO'
		);
		expect(code(() => readPriceFile(priceXlsx(rows), 'preise.xlsm'))).toBe(
			'WAITLIST_IMPORT_MACRO'
		);
		const ole = new Uint8Array(512);
		ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
		expect(code(() => readPriceFile(ole, 'preise.xlsx'))).toBe('WAITLIST_IMPORT_ENCRYPTED');
		const damaged = priceXlsx(rows).slice(0, 200);
		expect(code(() => readPriceFile(damaged, 'preise.xlsx'))).toBe('WAITLIST_IMPORT_INVALID');
		expect(code(() => readPriceFile(strToU8('not a zip'), 'preise.xlsx'))).toBe(
			'WAITLIST_IMPORT_INVALID'
		);
		// A small archive that would unpack far beyond the part limit.
		const bomb = workbook(
			{ sheet: `${XML}<worksheet/>` },
			{ 'xl/sharedStrings.xml': new Uint8Array(5 * 1024 * 1024) }
		);
		expect(code(() => readPriceFile(bomb, 'preise.xlsx'))).toBe('WAITLIST_IMPORT_INVALID');
		expect(code(() => readPriceFile(new Uint8Array(IMPORT_MAX_BYTES + 1), 'preise.csv'))).toBe(
			'WAITLIST_IMPORT_TOO_LARGE'
		);
		const many = `Fach;Wochentag;Uhrzeit;Gebäude;Lehrkraft;Monatsvertrag;Jahresvertrag\r\n${'English;Di;16:00-17:00;Villa;L;1;1\r\n'.repeat(IMPORT_MAX_ROWS + 1)}`;
		expect(code(() => readPriceFile(strToU8(many), 'preise.csv'))).toBe(
			'WAITLIST_IMPORT_TOO_MANY_ROWS'
		);
		expect(
			readPriceFile(
				strToU8(
					many
						.split('\r\n')
						.slice(0, IMPORT_MAX_ROWS + 1)
						.join('\r\n')
				),
				'a.csv'
			)
		).toHaveLength(IMPORT_MAX_ROWS);
		expect(
			code(() =>
				readPriceFile(strToU8('Fach;Wochentag;Uhrzeit\r\nEnglish;Di;16:00-17:00'), 'a.csv')
			)
		).toBe('WAITLIST_IMPORT_INVALID');
		expect(
			code(() =>
				readPriceFile(
					strToU8(
						'Fach;Fach;Wochentag;Uhrzeit;Gebäude;Lehrkraft;Monatsvertrag;Jahresvertrag\r\n'
					),
					'a.csv'
				)
			)
		).toBe('WAITLIST_IMPORT_INVALID');
		expect(code(() => readPriceFile(strToU8('Fach;"Wochentag\r\n'), 'a.csv'))).toBe(
			'WAITLIST_IMPORT_INVALID'
		);
	});
});

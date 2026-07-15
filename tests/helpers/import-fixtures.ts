import { strToU8, zipSync } from 'fflate';

export interface SyntheticPriceRow {
	key: string | null;
	preis: string | null;
	dauer: string | null;
	faecher: string | null;
	sonderpreis: string | null;
	kinder: string | null;
}

export interface SyntheticScheduleBlock {
	id: string;
	day: 'Mo' | 'Di' | 'Mi' | 'Do' | 'Fr' | 'Sa' | 'So';
	building: string;
	room: string;
	startTime: string;
	endTime: string;
	lessonType: string;
	subject: string;
	teacher: string;
	displayName: string;
	includeHtmlSubject?: boolean;
}

const xmlEscape = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');

function inlineCell(reference: string, value: string): string {
	return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
}

function numericCell(reference: string, value: string): string {
	return `<c r="${reference}"><v>${xmlEscape(value)}</v></c>`;
}

function priceRowXml(rowNumber: number, row: SyntheticPriceRow): string {
	const cells = [
		row.key === null ? '' : inlineCell(`D${rowNumber}`, row.key),
		row.preis === null ? '' : numericCell(`F${rowNumber}`, row.preis),
		row.dauer === null
			? ''
			: row.dauer.includes(';')
				? inlineCell(`G${rowNumber}`, row.dauer)
				: numericCell(`G${rowNumber}`, row.dauer),
		row.faecher === null ? '' : inlineCell(`H${rowNumber}`, row.faecher),
		row.sonderpreis === null ? '' : numericCell(`I${rowNumber}`, row.sonderpreis),
		row.kinder === null ? '' : numericCell(`J${rowNumber}`, row.kinder),
	].join('');
	return `<row r="${rowNumber}">${cells}</row>`;
}

export function createSyntheticPriceWorkbook(input?: {
	rows?: SyntheticPriceRow[];
	duplicateHeader?: boolean;
	macroEnabled?: boolean;
}): Buffer {
	const rows = input?.rows ?? [
		{
			key: 'Synthetic A',
			preis: '46.25',
			dauer: '90',
			faecher: null,
			sonderpreis: '60.50',
			kinder: '1',
		},
	];
	const header = [
		inlineCell('D2', 'Key'),
		inlineCell('E2', 'Service'),
		inlineCell('F2', 'Preis'),
		inlineCell('G2', 'Dauer'),
		inlineCell('H2', 'Faecher'),
		inlineCell('I2', 'Sonderpreis'),
		inlineCell('J2', 'Kinder'),
	].join('');
	const worksheetRows = [
		`<row r="1">${inlineCell('D1', 'Synthetic metadata')}</row>`,
		`<row r="2">${header}</row>`,
		...rows.map((row, index) => priceRowXml(index + 3, row)),
	];
	if (input?.duplicateHeader) {
		const duplicateRow = rows.length + 4;
		worksheetRows.push(
			`<row r="${duplicateRow}">${header.replaceAll(/([A-J])2/g, `$1${duplicateRow}`)}</row>`
		);
	}

	const macroEnabled = input?.macroEnabled ?? true;
	const workbookContentType = macroEnabled
		? 'application/vnd.ms-excel.sheet.macroEnabled.main+xml'
		: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
	const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
			<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
			<Default Extension="xml" ContentType="application/xml"/>
			<Override PartName="/xl/workbook.xml" ContentType="${workbookContentType}"/>
			<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
			<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
			<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
			${macroEnabled ? '<Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/>' : ''}
		</Types>`;
	const files: Record<string, Uint8Array> = {
		'[Content_Types].xml': strToU8(contentTypes),
		'_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
			<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
				<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
			</Relationships>`),
		'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
			<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
				<sheets>
					<sheet name="Tabelle8" sheetId="1" r:id="rId1"/>
					<sheet name="HiddenData" sheetId="2" state="veryHidden" r:id="rId2"/>
				</sheets>
			</workbook>`),
		'xl/_rels/workbook.xml.rels':
			strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
			<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
				<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
				<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
				<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
				${macroEnabled ? '<Relationship Id="rId4" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/>' : ''}
			</Relationships>`),
		'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
			<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
				<sheetData>${worksheetRows.join('')}</sheetData>
			</worksheet>`),
		'xl/worksheets/sheet2.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
			<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
				<sheetData><row r="1">${inlineCell('A1', 'hidden-person@example.invalid')}</row></sheetData>
			</worksheet>`),
		'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
			<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
				<fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders>
				<cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs>
			</styleSheet>`),
	};
	if (macroEnabled) files['xl/vbaProject.bin'] = strToU8('AUTO_OPEN_SYNTHETIC_MARKER');
	return Buffer.from(zipSync(files));
}

const fullDayNames: Record<SyntheticScheduleBlock['day'], string> = {
	Mo: 'Montag',
	Di: 'Dienstag',
	Mi: 'Mittwoch',
	Do: 'Donnerstag',
	Fr: 'Freitag',
	Sa: 'Samstag',
	So: 'Sonntag',
};

export function createSyntheticSchedule(input?: {
	blocks?: SyntheticScheduleBlock[];
	schemaVersion?: number;
	generationId?: string;
}): { jsonText: string; htmlText: string } {
	const blocks = input?.blocks ?? [
		{
			id: 'block-a',
			day: 'Mo',
			building: 'B1',
			room: 'R1',
			startTime: '16:00',
			endTime: '17:30',
			lessonType: 'group',
			subject: 'Synthetic subject',
			teacher: 'Lehrkraft A',
			displayName: 'Synthetic group',
			includeHtmlSubject: true,
		},
	];
	const jsonText = JSON.stringify({
		schema_version: input?.schemaVersion ?? 1,
		generation_id: input?.generationId ?? 'synthetic-generation-1',
		generated_at: '2026-07-15T10:00:00.000Z',
		source: 'synthetic-test',
		blocks: blocks.map((block) => ({
			id: block.id,
			day: block.day,
			building: block.building,
			room: block.room,
			start_time: block.startTime,
			end_time: block.endTime,
			lesson_type: block.lessonType,
			subject: block.subject,
			teacher: block.teacher,
			students: block.displayName,
			room_display: `${block.building} ${block.room}`,
		})),
	});
	const htmlText = `<div class="schedule-wrapper"><div class="schedule-container">${blocks
		.map(
			(block) => `<div class="day-column">
				<div class="day-header">${fullDayNames[block.day]}</div>
				<div class="lesson-block">
					<div class="lesson-time">${block.startTime} - ${block.endTime}</div>
					<div class="lesson-group">Gruppe: ${xmlEscape(block.displayName)}</div>
					<div class="lesson-teacher">Lehrkraft: ${xmlEscape(block.teacher)}</div>
					<div class="lesson-location">Ort: ${xmlEscape(block.building)} ${xmlEscape(block.room)}</div>
					${block.includeHtmlSubject === false ? '' : `<div class="lesson-subject">Fach: ${xmlEscape(block.subject)}</div>`}
				</div>
			</div>`
		)
		.join('')}</div></div>`;
	return { jsonText, htmlText };
}

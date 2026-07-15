import { readSheet } from 'read-excel-file/node';
import { strFromU8, strToU8, unzipSync, zipSync, type UnzipFileInfo } from 'fflate';
import { hashCanonical, normalizeImportText, normalizeLookupText } from '../canonical';
import { ImportContractError } from '../errors';
import type {
	ImportIssueDraft,
	PlusBTextImportSnapshot,
	PlusBTextOldGroupDraft,
	PlusBTextTargetDraft,
} from '../types';

const SHEET_NAME = 'PlusBText';
const HEADER_ROW = 1;
const ALLOWLIST = ['E', 'F', 'K', 'L', 'M', 'N', 'T'] as const;
const REQUIRED_HEADER_VALUES = new Set(['F', 'L', 'M', 'N']);
const FINGERPRINT_ALGORITHM_VERSION = 1 as const;
const ALLOWED_WEEKDAYS = new Set([
	'mo',
	'di',
	'mi',
	'do',
	'fr',
	'sa',
	'so',
	'montag',
	'dienstag',
	'mittwoch',
	'donnerstag',
	'freitag',
	'samstag',
	'sonntag',
]);

type AllowlistedColumn = (typeof ALLOWLIST)[number];

interface ContainerProfile {
	worksheetXml: string;
	stylesXml: string;
	parserArchive: Buffer;
	declaredMaxColumn: number;
	declaredMaxRow: number;
	containerKind: 'xlsm';
}

export interface PlusBTextResolution {
	status: 'resolved' | 'unresolved' | 'ambiguous';
	teacherName: string | null;
	dayRaw: string | null;
	durationMinutes: number | null;
	issues: ImportIssueDraft[];
}

function cellText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (value instanceof Date) return value.toISOString();
	return normalizeImportText(String(value));
}

function xmlAttribute(value: string, name: string): string | null {
	return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(value)?.[1] ?? null;
}

function columnNumber(reference: string): number {
	const letters = /^[A-Z]+/i.exec(reference)?.[0]?.toUpperCase();
	if (!letters) return 0;
	let number = 0;
	for (const character of letters) number = number * 26 + character.charCodeAt(0) - 64;
	return number;
}

function unzipSelected(input: Uint8Array, names: Set<string>): Record<string, Uint8Array> {
	return unzipSync(input, {
		filter: (file: UnzipFileInfo) => names.has(file.name.replaceAll('\\', '/')),
	});
}

function requireArchiveText(files: Record<string, Uint8Array>, name: string, code: string): string {
	const value = files[name];
	if (!value) throw new Error(code);
	return strFromU8(value);
}

function workbookPartName(target: string | null, code: string): string {
	if (!target || target.includes('..') || /^[a-z]+:/i.test(target)) throw new Error(code);
	return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
}

function allowlistedWorksheetXml(input: { worksheetXml: string; declaredMaxRow: number }): {
	xml: string;
	sharedStringIndexes: Set<number>;
} {
	const rows: string[] = [];
	const sharedStringIndexes = new Set<number>();
	for (const rowMatch of input.worksheetXml.matchAll(
		/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g
	)) {
		const rowAttributes = rowMatch[1] ?? rowMatch[3] ?? '';
		const cells: string[] = [];
		for (const cellMatch of (rowMatch[2] ?? '').matchAll(
			/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g
		)) {
			const attributes = cellMatch[1] ?? cellMatch[3] ?? '';
			const reference = xmlAttribute(attributes, 'r');
			const column = reference ? /^[A-Z]+/i.exec(reference)?.[0]?.toUpperCase() : null;
			if (!column || !ALLOWLIST.includes(column as AllowlistedColumn)) continue;
			if (xmlAttribute(attributes, 't') === 's') {
				const indexText = /<v(?:\s[^>]*)?>(\d+)<\/v>/.exec(cellMatch[2] ?? '')?.[1];
				if (indexText === undefined) throw new Error('PLUSB_SHARED_STRING_INDEX_INVALID');
				sharedStringIndexes.add(Number(indexText));
			}
			cells.push(cellMatch[0]);
		}
		if (!cells.length) continue;
		const declaredRow = Number(xmlAttribute(rowAttributes, 'r') ?? 0);
		const firstReference = xmlAttribute(/<c\b([^>]*)/.exec(cells[0])?.[1] ?? '', 'r');
		const inferredRow = Number(/\d+$/.exec(firstReference ?? '')?.[0] ?? 0);
		const rowNumber = declaredRow || inferredRow;
		if (!Number.isSafeInteger(rowNumber) || rowNumber < 1) {
			throw new Error('PLUSB_ROW_REFERENCE_INVALID');
		}
		rows.push(`<row r="${rowNumber}">${cells.join('')}</row>`);
	}
	return {
		xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
			<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
				<dimension ref="A1:T${input.declaredMaxRow}"/>
				<sheetData>${rows.join('')}</sheetData>
			</worksheet>`,
		sharedStringIndexes,
	};
}

function allowlistedSharedStringsXml(
	sharedStringsXml: string | null,
	referencedIndexes: Set<number>
): string | null {
	if (!sharedStringsXml) {
		if (referencedIndexes.size) throw new Error('PLUSB_SHARED_STRINGS_MISSING');
		return null;
	}
	const entries = [
		...sharedStringsXml.matchAll(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>|<si(?:\s[^>]*)?\/>/g),
	].map((match) => match[0]);
	for (const index of referencedIndexes) {
		if (!Number.isSafeInteger(index) || index < 0 || index >= entries.length) {
			throw new Error('PLUSB_SHARED_STRING_INDEX_INVALID');
		}
	}
	const sanitizedEntries = entries.map((entry, index) =>
		referencedIndexes.has(index) ? entry : '<si><t/></si>'
	);
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
			count="${sanitizedEntries.length}" uniqueCount="${sanitizedEntries.length}">
			${sanitizedEntries.join('')}
		</sst>`;
}

function buildParserArchive(input: {
	worksheetXml: string;
	stylesXml: string;
	sharedStringsXml: string | null;
	declaredMaxRow: number;
}): Buffer {
	const worksheet = allowlistedWorksheetXml(input);
	const sharedStringsXml = allowlistedSharedStringsXml(
		input.sharedStringsXml,
		worksheet.sharedStringIndexes
	);
	const files: Record<string, Uint8Array> = {
		'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
			<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
				xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
				<sheets><sheet name="${SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets>
			</workbook>`),
		'xl/_rels/workbook.xml.rels': strToU8(
			`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
			<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
				<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
				${input.stylesXml ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' : ''}
				${sharedStringsXml ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' : ''}
			</Relationships>`
		),
		'xl/worksheets/sheet1.xml': strToU8(worksheet.xml),
	};
	if (input.stylesXml) files['xl/styles.xml'] = strToU8(input.stylesXml);
	if (sharedStringsXml) files['xl/sharedStrings.xml'] = strToU8(sharedStringsXml);
	return Buffer.from(zipSync(files));
}

function containerProfile(input: Buffer): ContainerProfile {
	try {
		const bootstrapNames = new Set([
			'[Content_Types].xml',
			'xl/workbook.xml',
			'xl/_rels/workbook.xml.rels',
		]);
		const bootstrap = unzipSelected(input, bootstrapNames);
		const contentTypes = requireArchiveText(
			bootstrap,
			'[Content_Types].xml',
			'PLUSB_CONTAINER_CONTENT_TYPES_MISSING'
		);
		if (!contentTypes.includes('application/vnd.ms-excel.sheet.macroEnabled.main+xml')) {
			throw new Error('PLUSB_CONTAINER_UNSUPPORTED');
		}

		const workbook = requireArchiveText(
			bootstrap,
			'xl/workbook.xml',
			'PLUSB_WORKBOOK_XML_MISSING'
		);
		const sheetTags = [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)];
		const matchingSheets = sheetTags.filter(
			(match) => xmlAttribute(match[1], 'name') === SHEET_NAME
		);
		if (matchingSheets.length !== 1) throw new Error('PLUSB_SHEET_MISSING_OR_AMBIGUOUS');
		const sheetAttributes = matchingSheets[0][1];
		if (xmlAttribute(sheetAttributes, 'state')) throw new Error('PLUSB_SHEET_NOT_VISIBLE');
		const relationId = xmlAttribute(sheetAttributes, 'r:id');
		if (!relationId) throw new Error('PLUSB_SHEET_RELATION_MISSING');

		const relationships = requireArchiveText(
			bootstrap,
			'xl/_rels/workbook.xml.rels',
			'PLUSB_WORKBOOK_RELATIONS_MISSING'
		);
		const relationTags = [...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)];
		const relation = relationTags.find((match) => xmlAttribute(match[1], 'Id') === relationId);
		if (relation && xmlAttribute(relation[1], 'TargetMode') === 'External') {
			throw new Error('PLUSB_SHEET_TARGET_INVALID');
		}
		const targetName = workbookPartName(
			relation ? xmlAttribute(relation[1], 'Target') : null,
			'PLUSB_SHEET_TARGET_INVALID'
		);
		if (!targetName.startsWith('xl/worksheets/') || !targetName.endsWith('.xml')) {
			throw new Error('PLUSB_SHEET_TARGET_UNSUPPORTED');
		}

		const stylesRelation = relationTags.find((match) =>
			xmlAttribute(match[1], 'Type')?.endsWith('/styles')
		);
		const sharedStringsRelation = relationTags.find((match) =>
			xmlAttribute(match[1], 'Type')?.endsWith('/sharedStrings')
		);
		const stylesName = stylesRelation
			? workbookPartName(
					xmlAttribute(stylesRelation[1], 'Target'),
					'PLUSB_STYLES_TARGET_INVALID'
				)
			: null;
		const sharedStringsName = sharedStringsRelation
			? workbookPartName(
					xmlAttribute(sharedStringsRelation[1], 'Target'),
					'PLUSB_SHARED_STRINGS_TARGET_INVALID'
				)
			: null;
		const payloadNames = new Set([targetName]);
		if (stylesName) payloadNames.add(stylesName);
		if (sharedStringsName) payloadNames.add(sharedStringsName);
		const payload = unzipSelected(input, payloadNames);
		const worksheetXml = requireArchiveText(payload, targetName, 'PLUSB_WORKSHEET_XML_MISSING');
		const stylesXml = stylesName && payload[stylesName] ? strFromU8(payload[stylesName]) : '';
		const sharedStringsXml =
			sharedStringsName && payload[sharedStringsName]
				? strFromU8(payload[sharedStringsName])
				: null;
		const dimension = /<dimension\b[^>]*\bref="([A-Z]+\d+)(?::([A-Z]+\d+))?"/i.exec(
			worksheetXml
		);
		if (!dimension) throw new Error('PLUSB_DIMENSION_MISSING');
		const endReference = dimension[2] ?? dimension[1];
		const declaredMaxColumn = columnNumber(endReference);
		const declaredMaxRow = Number(/\d+$/.exec(endReference)?.[0] ?? 0);
		if (declaredMaxColumn < columnNumber('T') || declaredMaxRow < HEADER_ROW) {
			throw new Error('PLUSB_DIMENSION_CONTRACT_MISMATCH');
		}
		return {
			worksheetXml,
			stylesXml,
			parserArchive: buildParserArchive({
				worksheetXml,
				stylesXml,
				sharedStringsXml,
				declaredMaxRow,
			}),
			declaredMaxColumn,
			declaredMaxRow,
			containerKind: 'xlsm',
		};
	} catch (cause) {
		if (cause instanceof ImportContractError) throw cause;
		const code =
			cause instanceof Error && /^PLUSB_[A-Z0-9_]+$/.test(cause.message)
				? cause.message
				: 'PLUSB_CONTAINER_UNREADABLE';
		throw new ImportContractError({
			code,
			structuralFingerprintSha256: '',
			safeContext: { sheet: SHEET_NAME },
			cause,
		});
	}
}

function allowlistedCellProfile(worksheetXml: string): Array<{
	column: AllowlistedColumn;
	row: number;
	type: string | null;
	style: string | null;
	hasFormula: boolean;
}> {
	const cells: Array<{
		column: AllowlistedColumn;
		row: number;
		type: string | null;
		style: string | null;
		hasFormula: boolean;
	}> = [];
	for (const match of worksheetXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
		const attributes = match[1] ?? match[3] ?? '';
		const reference = xmlAttribute(attributes, 'r');
		const column = reference ? /^[A-Z]+/i.exec(reference)?.[0]?.toUpperCase() : null;
		if (!column || !ALLOWLIST.includes(column as AllowlistedColumn)) continue;
		cells.push({
			column: column as AllowlistedColumn,
			row: Number(/\d+$/.exec(reference!)?.[0] ?? 0),
			type: xmlAttribute(attributes, 't'),
			style: xmlAttribute(attributes, 's'),
			hasFormula: /<f(?:\s|>)/.test(match[2] ?? ''),
		});
	}
	return cells.sort(
		(left, right) => left.row - right.row || left.column.localeCompare(right.column)
	);
}

export async function canonicalizePlusBTextFingerprints(input: {
	rows: unknown[][];
	profile: ContainerProfile;
}): Promise<{
	structuralFingerprintSha256: string;
	logicalShapeFingerprintSha256: string;
	styleFingerprintSha256: string;
}> {
	const header = input.rows[0] ?? [];
	const headerShape = Object.fromEntries(
		ALLOWLIST.map((column) => [column, Boolean(cellText(header[columnNumber(column) - 1]))])
	);
	const cellProfile = allowlistedCellProfile(input.profile.worksheetXml);
	const schemaPayload = {
		algorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
		containerKind: input.profile.containerKind,
		sheet: SHEET_NAME,
		headerRow: HEADER_ROW,
		allowlist: [...ALLOWLIST],
		headerShape,
		declaredMaxColumnAtLeast: 'T',
	};
	const logicalShapePayload = {
		algorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
		rows: input.rows.slice(1).map((row, index) => ({
			row: index + 2,
			present: Object.fromEntries(
				ALLOWLIST.map((column) => [
					column,
					Boolean(cellText(row[columnNumber(column) - 1])),
				])
			),
		})),
	};
	const stylePayload = {
		algorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
		stylesPresent: Boolean(input.profile.stylesXml),
		cells: cellProfile.map(({ column, row, type, style, hasFormula }) => ({
			column,
			row,
			type,
			style,
			hasFormula,
		})),
	};
	return {
		structuralFingerprintSha256: await hashCanonical(schemaPayload),
		logicalShapeFingerprintSha256: await hashCanonical(logicalShapePayload),
		styleFingerprintSha256: await hashCanonical(stylePayload),
	};
}

function issue(input: {
	code: string;
	row?: number;
	field?: string;
	severity?: ImportIssueDraft['severity'];
}): ImportIssueDraft {
	return {
		severity: input.severity ?? 'warning',
		code: input.code,
		safeContext: {
			...(input.row ? { rowNumber: input.row } : {}),
			...(input.field ? { field: input.field } : {}),
		},
		blocksPromotion: false,
	};
}

function parsePositiveInteger(value: string): number | null {
	if (!/^[1-9]\d*$/.test(value)) return null;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseOldIdTokens(
	raw: string,
	row: number,
	issues: ImportIssueDraft[]
): { values: number[]; valid: boolean } {
	if (!raw) return { values: [], valid: true };
	const tokens = raw.split(';').map((token) => normalizeImportText(token));
	if (tokens.some((token) => !token)) {
		issues.push(issue({ code: 'PLUSB_K_TOKEN_EMPTY', row, field: 'K' }));
		return { values: [], valid: false };
	}
	const parsed = tokens.map(parsePositiveInteger);
	if (parsed.some((value) => value === null)) {
		issues.push(issue({ code: 'PLUSB_K_TOKEN_INVALID', row, field: 'K' }));
		return { values: [], valid: false };
	}
	const values = parsed as number[];
	if (new Set(values).size !== values.length) {
		issues.push(issue({ code: 'PLUSB_K_TOKEN_DUPLICATE', row, field: 'K' }));
		return { values: [], valid: false };
	}
	return { values, valid: true };
}

function duplicateOrdinals<T>(values: T[], key: (value: T) => string): Map<T, number> {
	const counts = new Map<string, number>();
	const result = new Map<T, number>();
	for (const value of values) {
		const canonical = key(value);
		const ordinal = (counts.get(canonical) ?? 0) + 1;
		counts.set(canonical, ordinal);
		result.set(value, ordinal);
	}
	return result;
}

export async function parsePlusBTextWorkbook(input: Buffer): Promise<PlusBTextImportSnapshot> {
	const bytes = input;
	let profile: ContainerProfile;
	try {
		profile = containerProfile(bytes);
	} catch (error) {
		if (error instanceof ImportContractError && !error.structuralFingerprintSha256) {
			throw new ImportContractError({
				code: error.issue.code,
				structuralFingerprintSha256: await hashCanonical({
					algorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
					containerReadable: false,
					sheet: SHEET_NAME,
				}),
				safeContext: error.issue.safeContext,
				cause: error,
			});
		}
		throw error;
	}

	let rows: unknown[][];
	try {
		rows = (await readSheet(profile.parserArchive, SHEET_NAME, { trim: false })) as unknown[][];
	} catch (cause) {
		throw new ImportContractError({
			code: 'PLUSB_SHEET_UNREADABLE',
			structuralFingerprintSha256: await hashCanonical({
				algorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
				sheet: SHEET_NAME,
				readable: false,
			}),
			safeContext: { sheet: SHEET_NAME },
			cause,
		});
	}
	const fingerprints = await canonicalizePlusBTextFingerprints({ rows, profile });
	const header = rows[0] ?? [];
	const headerMatches = ALLOWLIST.every((column) => {
		const present = Boolean(cellText(header[columnNumber(column) - 1]));
		return present === REQUIRED_HEADER_VALUES.has(column);
	});
	if (!headerMatches) {
		throw new ImportContractError({
			code: 'PLUSB_HEADER_CONTRACT_MISMATCH',
			structuralFingerprintSha256: fingerprints.structuralFingerprintSha256,
			safeContext: {
				headerRow: HEADER_ROW,
				matchingAllowlistedColumns: ALLOWLIST.filter((column) => {
					const present = Boolean(cellText(header[columnNumber(column) - 1]));
					return present === REQUIRED_HEADER_VALUES.has(column);
				}).length,
			},
		});
	}

	const issues: ImportIssueDraft[] = [];
	const oldWork: Array<Omit<PlusBTextOldGroupDraft, 'storageKey' | 'recordHashSha256'>> = [];
	const targetWork: Array<Omit<PlusBTextTargetDraft, 'storageKey' | 'recordHashSha256'>> = [];
	for (let index = 1; index < rows.length; index += 1) {
		const sourceRowNumber = index + 1;
		const row = rows[index] ?? [];
		const values = Object.fromEntries(
			ALLOWLIST.map((column) => [column, cellText(row[columnNumber(column) - 1])])
		) as Record<AllowlistedColumn, string>;

		if (values.E || values.F) {
			const oldGroupId = parsePositiveInteger(values.E);
			const groupNameRaw = values.F || null;
			const isValid = oldGroupId !== null && groupNameRaw !== null;
			if (oldGroupId === null)
				issues.push(
					issue({ code: 'PLUSB_OLD_ID_INVALID', row: sourceRowNumber, field: 'E' })
				);
			if (!groupNameRaw)
				issues.push(
					issue({ code: 'PLUSB_OLD_NAME_MISSING', row: sourceRowNumber, field: 'F' })
				);
			oldWork.push({
				sourceRowNumber,
				oldGroupId,
				groupNameRaw,
				groupNameNormalized: groupNameRaw ? normalizeLookupText(groupNameRaw) : null,
				isValid,
			});
		}

		if (!values.L && (values.K || values.M || values.N || values.T)) {
			issues.push(
				issue({ code: 'PLUSB_TARGET_ANCHOR_MISSING', row: sourceRowNumber, field: 'L' })
			);
			continue;
		}
		if (!values.L) continue;
		const oldIds = parseOldIdTokens(values.K, sourceRowNumber, issues);
		let durationMinutes: number | null = null;
		let durationStatus: PlusBTextTargetDraft['durationStatus'] = 'missing';
		if (values.T) {
			durationMinutes = parsePositiveInteger(values.T);
			durationStatus = durationMinutes === null ? 'invalid' : 'verified';
			if (durationStatus === 'invalid')
				issues.push(
					issue({ code: 'PLUSB_DURATION_INVALID', row: sourceRowNumber, field: 'T' })
				);
		} else
			issues.push(
				issue({ code: 'PLUSB_DURATION_MISSING', row: sourceRowNumber, field: 'T' })
			);
		if (!values.M)
			issues.push(issue({ code: 'PLUSB_TEACHER_MISSING', row: sourceRowNumber, field: 'M' }));
		if (!values.N)
			issues.push(issue({ code: 'PLUSB_WEEKDAY_MISSING', row: sourceRowNumber, field: 'N' }));
		else if (!ALLOWED_WEEKDAYS.has(normalizeLookupText(values.N)))
			issues.push(issue({ code: 'PLUSB_WEEKDAY_INVALID', row: sourceRowNumber, field: 'N' }));
		targetWork.push({
			sourceRowNumber,
			oldGroupIds: oldIds.values,
			groupNameRaw: values.L,
			groupNameNormalized: normalizeLookupText(values.L),
			teacherName: values.M || null,
			dayRaw: values.N || null,
			durationMinutes,
			durationStatus,
			isValid: true,
		});
	}

	const oldIdCounts = new Map<number, number>();
	const oldNameCounts = new Map<string, number>();
	for (const old of oldWork) {
		if (old.oldGroupId !== null)
			oldIdCounts.set(old.oldGroupId, (oldIdCounts.get(old.oldGroupId) ?? 0) + 1);
		if (old.groupNameNormalized)
			oldNameCounts.set(
				old.groupNameNormalized,
				(oldNameCounts.get(old.groupNameNormalized) ?? 0) + 1
			);
	}
	for (const old of oldWork) {
		if (old.oldGroupId !== null && (oldIdCounts.get(old.oldGroupId) ?? 0) > 1)
			old.isValid = false;
	}
	const duplicateOldIds = [...oldIdCounts.values()].filter((count) => count > 1);
	if (duplicateOldIds.length)
		issues.push(issue({ code: 'PLUSB_OLD_ID_DUPLICATE', severity: 'error' }));
	const duplicateOldNames = [...oldNameCounts.values()].filter((count) => count > 1);
	if (duplicateOldNames.length) issues.push(issue({ code: 'PLUSB_OLD_NAME_DUPLICATE' }));

	const validOldIds = new Set(
		oldWork.filter((old) => old.isValid).map((old) => old.oldGroupId as number)
	);
	const targetByOldId = new Map<number, number>();
	let danglingCount = 0;
	let duplicateMappingCount = 0;
	for (const target of targetWork) {
		for (const oldId of target.oldGroupIds) {
			if (!validOldIds.has(oldId)) danglingCount += 1;
			targetByOldId.set(oldId, (targetByOldId.get(oldId) ?? 0) + 1);
		}
	}
	duplicateMappingCount = [...targetByOldId.values()].filter((count) => count > 1).length;
	if (danglingCount)
		issues.push({
			...issue({ code: 'PLUSB_K_DANGLING_ID' }),
			safeContext: { danglingTokenCount: danglingCount },
		});
	if (duplicateMappingCount)
		issues.push({
			...issue({ code: 'PLUSB_K_AMBIGUOUS_TARGET' }),
			safeContext: { ambiguousOldIdCount: duplicateMappingCount },
		});

	const targetNameCounts = new Map<string, number>();
	for (const target of targetWork)
		targetNameCounts.set(
			target.groupNameNormalized,
			(targetNameCounts.get(target.groupNameNormalized) ?? 0) + 1
		);
	if ([...targetNameCounts.values()].some((count) => count > 1))
		issues.push(issue({ code: 'PLUSB_TARGET_NAME_DUPLICATE' }));

	const oldOrdinals = duplicateOrdinals(oldWork, (old) =>
		JSON.stringify([old.oldGroupId, old.groupNameNormalized])
	);
	const oldGroups: PlusBTextOldGroupDraft[] = [];
	for (const old of oldWork) {
		const tuple = {
			oldGroupId: old.oldGroupId,
			groupNameNormalized: old.groupNameNormalized,
			isValid: old.isValid,
		};
		oldGroups.push({
			...old,
			storageKey: await hashCanonical({ tuple, duplicateOrdinal: oldOrdinals.get(old) }),
			recordHashSha256: await hashCanonical(tuple),
		});
	}
	const targetOrdinals = duplicateOrdinals(targetWork, (target) =>
		JSON.stringify([
			target.groupNameNormalized,
			target.oldGroupIds,
			target.teacherName,
			target.dayRaw,
			target.durationMinutes,
			target.durationStatus,
		])
	);
	const targets: PlusBTextTargetDraft[] = [];
	for (const target of targetWork) {
		const tuple = {
			groupNameNormalized: target.groupNameNormalized,
			oldGroupIds: [...target.oldGroupIds].sort((left, right) => left - right),
			teacherName: target.teacherName,
			dayRaw: target.dayRaw,
			durationMinutes: target.durationMinutes,
			durationStatus: target.durationStatus,
			isValid: target.isValid,
		};
		targets.push({
			...target,
			storageKey: await hashCanonical({
				tuple,
				duplicateOrdinal: targetOrdinals.get(target),
			}),
			recordHashSha256: await hashCanonical(tuple),
		});
	}

	const versionHashSha256 = await hashCanonical({
		contract: 'admin-xlsm-plusbtext:1',
		fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
		oldGroups: oldGroups
			.map((old) => ({ storageKey: old.storageKey, recordHashSha256: old.recordHashSha256 }))
			.sort((left, right) => left.storageKey.localeCompare(right.storageKey)),
		targets: targets
			.map((target) => ({
				storageKey: target.storageKey,
				recordHashSha256: target.recordHashSha256,
			}))
			.sort((left, right) => left.storageKey.localeCompare(right.storageKey)),
	});
	return {
		sourceContractId: 'admin-xlsm-plusbtext',
		sourceContractVersion: 1,
		fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
		...fingerprints,
		versionHashSha256,
		oldGroups,
		targets,
		issues,
		rowsTotal: oldGroups.length + targets.length,
		rowsStaged: oldGroups.length + targets.length,
		rowsSkipped: oldGroups.filter((old) => !old.isValid).length,
	};
}

function sameLogicalTarget(left: PlusBTextTargetDraft, right: PlusBTextTargetDraft): boolean {
	return (
		left.groupNameNormalized === right.groupNameNormalized &&
		left.teacherName === right.teacherName &&
		left.dayRaw === right.dayRaw &&
		left.durationMinutes === right.durationMinutes &&
		left.durationStatus === right.durationStatus
	);
}

function resolveCandidates(
	candidates: PlusBTextTargetDraft[],
	sourceRecordKey: string,
	duplicateCode: string,
	ambiguousCode: string
): PlusBTextResolution {
	if (!candidates.length) {
		return {
			status: 'unresolved',
			teacherName: null,
			dayRaw: null,
			durationMinutes: null,
			issues: [],
		};
	}
	const first = candidates[0];
	if (candidates.every((candidate) => sameLogicalTarget(first, candidate))) {
		return {
			status: 'resolved',
			teacherName: first.teacherName,
			dayRaw: first.dayRaw,
			durationMinutes: first.durationMinutes,
			issues:
				candidates.length > 1
					? [
							{
								severity: 'warning',
								code: duplicateCode,
								sourceRecordKey,
								safeContext: { candidateCount: candidates.length },
								blocksPromotion: false,
							},
						]
					: [],
		};
	}
	return {
		status: 'ambiguous',
		teacherName: null,
		dayRaw: null,
		durationMinutes: null,
		issues: [
			{
				severity: 'warning',
				code: ambiguousCode,
				sourceRecordKey,
				safeContext: { candidateCount: candidates.length },
				blocksPromotion: false,
			},
		],
	};
}

export function resolvePlusBTextGroup(input: {
	groupName: string;
	sourceRecordKey: string;
	oldGroups: PlusBTextOldGroupDraft[];
	targets: PlusBTextTargetDraft[];
}): PlusBTextResolution {
	const normalized = normalizeLookupText(input.groupName);
	const exact = input.targets.filter(
		(target) => target.isValid && target.groupNameNormalized === normalized
	);
	if (exact.length) {
		return resolveCandidates(
			exact,
			input.sourceRecordKey,
			'PLUSB_ENRICHMENT_IDENTICAL_DUPLICATE',
			'PLUSB_ENRICHMENT_EXACT_AMBIGUOUS'
		);
	}
	const oldCandidates = input.oldGroups.filter(
		(old) => old.isValid && old.groupNameNormalized === normalized
	);
	if (oldCandidates.length > 1) {
		return {
			status: 'ambiguous',
			teacherName: null,
			dayRaw: null,
			durationMinutes: null,
			issues: [
				{
					severity: 'warning',
					code: 'PLUSB_ENRICHMENT_OLD_NAME_AMBIGUOUS',
					sourceRecordKey: input.sourceRecordKey,
					safeContext: { candidateCount: oldCandidates.length },
					blocksPromotion: false,
				},
			],
		};
	}
	if (!oldCandidates.length) {
		return {
			status: 'unresolved',
			teacherName: null,
			dayRaw: null,
			durationMinutes: null,
			issues: [
				{
					severity: 'warning',
					code: 'PLUSB_ENRICHMENT_UNRESOLVED',
					sourceRecordKey: input.sourceRecordKey,
					safeContext: {},
					blocksPromotion: false,
				},
			],
		};
	}
	const oldId = oldCandidates[0].oldGroupId!;
	const joined = input.targets.filter(
		(target) => target.isValid && target.oldGroupIds.includes(oldId)
	);
	const resolved = resolveCandidates(
		joined,
		input.sourceRecordKey,
		'PLUSB_ENRICHMENT_IDENTICAL_DUPLICATE',
		'PLUSB_ENRICHMENT_JOIN_AMBIGUOUS'
	);
	if (resolved.status === 'unresolved') {
		resolved.issues.push({
			severity: 'warning',
			code: 'PLUSB_ENRICHMENT_DANGLING_OLD_ID',
			sourceRecordKey: input.sourceRecordKey,
			safeContext: {},
			blocksPromotion: false,
		});
	}
	return resolved;
}

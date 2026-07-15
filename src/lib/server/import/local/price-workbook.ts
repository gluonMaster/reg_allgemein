import { readSheet } from 'read-excel-file/node';
import { hashCanonical, normalizeImportText, normalizeLookupText } from '../canonical';
import { ImportContractError } from '../errors';
import type {
	ImportIssueDraft,
	PriceImportSnapshot,
	PriceRuleDraft,
	PriceVectorComponent,
} from '../types';

const PRICE_SHEET = 'Tabelle8';
const HEADER_ROW_NUMBER = 2;
const HEADER_COLUMNS = {
	Key: 4,
	Preis: 6,
	Dauer: 7,
	Faecher: 8,
	Sonderpreis: 9,
	Kinder: 10,
} as const;
const HEADER_NAMES = Object.keys(HEADER_COLUMNS) as Array<keyof typeof HEADER_COLUMNS>;
const DETECTION_HEADERS = ['Key', 'Preis', 'Kinder'] as const;

type WorkbookInput = string | Buffer;

interface ParsedInteger {
	value: number | null;
	code: string | null;
}

interface PriceRowWork {
	sourceRowNumber: number;
	key: string | null;
	normalizedKey: string | null;
	durationRaw: string | null;
	subjectsRaw: string | null;
	subjectDurationVector: PriceVectorComponent[] | null;
	durationTotalMinutes: number | null;
	childrenCount: number | null;
	yearlyPriceCents: number | null;
	monthlyPriceCents: number | null;
	normalizedLookupKey: string | null;
	ruleHashSha256: string;
	isValid: boolean;
	validationCode: string | null;
}

function cellText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (value instanceof Date) return value.toISOString();
	return normalizeImportText(String(value));
}

function parsePositiveInteger(raw: string, codePrefix: string): ParsedInteger {
	if (!raw) return { value: null, code: `${codePrefix}_MISSING` };
	if (!/^\+?\d+$/.test(raw)) return { value: null, code: `${codePrefix}_NOT_INTEGER` };
	const value = Number(raw);
	if (!Number.isSafeInteger(value)) return { value: null, code: `${codePrefix}_OUT_OF_RANGE` };
	if (value <= 0) return { value: null, code: `${codePrefix}_NOT_POSITIVE` };
	return { value, code: null };
}

function parsePositiveCents(raw: string): ParsedInteger {
	if (!raw) return { value: null, code: 'PRICE_RATE_MISSING' };
	const match = /^([+-]?)(\d+)(?:[.,](\d+))?$/.exec(raw);
	if (!match) return { value: null, code: 'PRICE_RATE_NOT_DECIMAL' };
	const fraction = match[3] ?? '';
	if (fraction.length > 2) return { value: null, code: 'PRICE_RATE_PRECISION' };

	const sign = match[1] === '-' ? -1n : 1n;
	const cents = sign * (BigInt(match[2]) * 100n + BigInt(fraction.padEnd(2, '0') || '0'));
	if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) {
		return { value: null, code: 'PRICE_RATE_OUT_OF_RANGE' };
	}
	const value = Number(cents);
	if (value <= 0) return { value: null, code: 'PRICE_RATE_NOT_POSITIVE' };
	return { value, code: null };
}

function parseVector(
	durationRaw: string,
	subjectsRaw: string
): {
	vector: PriceVectorComponent[] | null;
	totalMinutes: number | null;
	code: string | null;
} {
	if (!durationRaw) return { vector: null, totalMinutes: null, code: 'PRICE_DURATION_MISSING' };
	const durationParts = durationRaw.split(';').map((part) => normalizeImportText(part));
	if (durationParts.some((part) => !part)) {
		return { vector: null, totalMinutes: null, code: 'PRICE_DURATION_EMPTY_COMPONENT' };
	}

	const durations = durationParts.map((part) => parsePositiveInteger(part, 'PRICE_DURATION'));
	const invalidDuration = durations.find((duration) => duration.code);
	if (invalidDuration) {
		return { vector: null, totalMinutes: null, code: invalidDuration.code };
	}

	const subjects = subjectsRaw
		? subjectsRaw.split(';').map((part) => normalizeImportText(part))
		: [];
	if (subjects.some((subject) => !subject)) {
		return { vector: null, totalMinutes: null, code: 'PRICE_SUBJECT_EMPTY_COMPONENT' };
	}
	if (
		(subjects.length === 0 && durations.length !== 1) ||
		(subjects.length > 0 && subjects.length !== durations.length)
	) {
		return { vector: null, totalMinutes: null, code: 'PRICE_SUBJECT_DURATION_MISMATCH' };
	}

	const vector = durations.map((duration, index) => ({
		subject: subjects.length ? normalizeLookupText(subjects[index]) : null,
		durationMinutes: duration.value!,
	}));
	return {
		vector,
		totalMinutes: vector.reduce((sum, component) => sum + component.durationMinutes, 0),
		code: null,
	};
}

async function structuralFingerprint(rows: unknown[][]): Promise<string> {
	const candidateRows = rows
		.map((row, index) => ({
			rowNumber: index + 1,
			columns: Object.fromEntries(
				HEADER_NAMES.map((header) => [
					header,
					row
						.map(cellText)
						.flatMap((value, column) => (value === header ? [column + 1] : [])),
				])
			),
		}))
		.filter(({ columns }) => DETECTION_HEADERS.every((header) => columns[header].length > 0));
	return hashCanonical({ sheet: PRICE_SHEET, candidateRows });
}

function issueForRow(input: {
	code: string;
	rowNumber: number;
	field: string;
	blocksPromotion: boolean;
}): ImportIssueDraft {
	return {
		severity: input.blocksPromotion ? 'error' : 'warning',
		code: input.code,
		safeContext: { rowNumber: input.rowNumber, field: input.field },
		blocksPromotion: input.blocksPromotion,
	};
}

export async function parsePriceWorkbook(input: WorkbookInput): Promise<PriceImportSnapshot> {
	let rows: unknown[][];
	try {
		rows = (await readSheet(input, PRICE_SHEET, {
			trim: false,
			parseNumber: (value) => value as unknown as number,
		})) as unknown[][];
	} catch (cause) {
		throw new ImportContractError({
			code: 'PRICE_WORKBOOK_UNREADABLE',
			structuralFingerprintSha256: await hashCanonical({
				sheet: PRICE_SHEET,
				readable: false,
			}),
			safeContext: { sheet: PRICE_SHEET },
			cause,
		});
	}

	const fingerprint = await structuralFingerprint(rows);
	const normalizedRows = rows.map((row) => row.map(cellText));
	const headerCandidates = normalizedRows
		.map((row, index) => ({ row, rowNumber: index + 1 }))
		.filter(({ row }) => DETECTION_HEADERS.every((header) => row.includes(header)));

	if (headerCandidates.length !== 1) {
		throw new ImportContractError({
			code: 'PRICE_HEADER_AMBIGUOUS',
			structuralFingerprintSha256: fingerprint,
			safeContext: { candidateCount: headerCandidates.length },
		});
	}

	const header = headerCandidates[0];
	const actualColumns = Object.fromEntries(
		HEADER_NAMES.map((name) => [
			name,
			header.row.flatMap((value, index) => (value === name ? [index + 1] : [])),
		])
	) as Record<keyof typeof HEADER_COLUMNS, number[]>;
	const headerShapeMatches =
		header.rowNumber === HEADER_ROW_NUMBER &&
		HEADER_NAMES.every(
			(name) =>
				actualColumns[name].length === 1 && actualColumns[name][0] === HEADER_COLUMNS[name]
		);
	if (!headerShapeMatches) {
		throw new ImportContractError({
			code: 'PRICE_HEADER_CONTRACT_MISMATCH',
			structuralFingerprintSha256: fingerprint,
			safeContext: {
				headerRowNumber: header.rowNumber,
				columnMatchCount: HEADER_NAMES.filter(
					(name) =>
						actualColumns[name].length === 1 &&
						actualColumns[name][0] === HEADER_COLUMNS[name]
				).length,
			},
		});
	}

	const dataRows = normalizedRows
		.slice(header.rowNumber)
		.map((row, index) => ({ row, sourceRowNumber: header.rowNumber + index + 1 }))
		.filter(({ row }) => {
			const logicalCells = Array.from({ length: 7 }, (_, index) => row[index + 3] ?? '');
			return logicalCells.some(Boolean);
		});

	const issues: ImportIssueDraft[] = [];
	const work: PriceRowWork[] = [];
	for (const { row, sourceRowNumber } of dataRows) {
		const rawKey = row[HEADER_COLUMNS.Key - 1] ?? '';
		const durationRaw = row[HEADER_COLUMNS.Dauer - 1] ?? '';
		const subjectsRaw = row[HEADER_COLUMNS.Faecher - 1] ?? '';
		const yearly = parsePositiveCents(row[HEADER_COLUMNS.Preis - 1] ?? '');
		const monthly = parsePositiveCents(row[HEADER_COLUMNS.Sonderpreis - 1] ?? '');
		const children = parsePositiveInteger(
			row[HEADER_COLUMNS.Kinder - 1] ?? '',
			'PRICE_CHILDREN'
		);
		const vector = parseVector(durationRaw, subjectsRaw);
		const normalizedKey = rawKey ? normalizeLookupText(rawKey) : null;

		const rowIssues: Array<{ code: string; field: string; blocking: boolean }> = [];
		if (!normalizedKey)
			rowIssues.push({ code: 'PRICE_KEY_MISSING', field: 'Key', blocking: true });
		if (yearly.code) rowIssues.push({ code: yearly.code, field: 'Preis', blocking: true });
		if (monthly.code)
			rowIssues.push({ code: monthly.code, field: 'Sonderpreis', blocking: true });
		if (children.code) rowIssues.push({ code: children.code, field: 'Kinder', blocking: true });
		if (vector.code)
			rowIssues.push({ code: vector.code, field: 'Dauer/Faecher', blocking: false });
		for (const rowIssue of rowIssues) {
			issues.push(
				issueForRow({
					code: rowIssue.code,
					rowNumber: sourceRowNumber,
					field: rowIssue.field,
					blocksPromotion: rowIssue.blocking,
				})
			);
		}

		const lookupContract =
			normalizedKey && vector.vector && children.value
				? { normalizedKey, vector: vector.vector, childrenCount: children.value }
				: null;
		work.push({
			sourceRowNumber,
			key: rawKey || null,
			normalizedKey,
			durationRaw: durationRaw || null,
			subjectsRaw: subjectsRaw || null,
			subjectDurationVector: vector.vector,
			durationTotalMinutes: vector.totalMinutes,
			childrenCount: children.value,
			yearlyPriceCents: yearly.value,
			monthlyPriceCents: monthly.value,
			normalizedLookupKey: lookupContract ? await hashCanonical(lookupContract) : null,
			ruleHashSha256: await hashCanonical({
				lookupContract,
				yearlyPriceCents: yearly.value,
				monthlyPriceCents: monthly.value,
			}),
			isValid: rowIssues.length === 0,
			validationCode: rowIssues[0]?.code ?? null,
		});
	}

	const duplicateLookups = new Map<string, PriceRowWork[]>();
	for (const rule of work) {
		if (!rule.isValid || !rule.normalizedLookupKey) continue;
		const candidates = duplicateLookups.get(rule.normalizedLookupKey) ?? [];
		candidates.push(rule);
		duplicateLookups.set(rule.normalizedLookupKey, candidates);
	}
	for (const candidates of duplicateLookups.values()) {
		if (candidates.length < 2) continue;
		for (const candidate of candidates) {
			candidate.isValid = false;
			candidate.validationCode = 'PRICE_RULE_AMBIGUOUS';
		}
		issues.push({
			severity: 'fatal',
			code: 'PRICE_RULE_AMBIGUOUS',
			safeContext: {
				candidateCount: candidates.length,
				rowNumbers: candidates.map((candidate) => candidate.sourceRowNumber),
			},
			blocksPromotion: true,
		});
	}

	const versionHashSha256 = await hashCanonical({
		contract: 'price-workbook:1',
		headerRowNumber: header.rowNumber,
		rules: work.map(({ sourceRowNumber, ruleHashSha256, validationCode }) => ({
			sourceRowNumber,
			ruleHashSha256,
			validationCode,
		})),
	});
	const rules: PriceRuleDraft[] = work.map((rule) => ({
		...rule,
		sourceRecordKey: `price:${versionHashSha256}:${rule.sourceRowNumber}`,
		provenance: {
			sourceRowNumber: rule.sourceRowNumber,
			yearlySourceColumn: 'Preis',
			monthlySourceColumn: 'Sonderpreis',
		},
	}));
	for (const issue of issues) {
		const rowNumber = issue.safeContext?.rowNumber;
		if (typeof rowNumber === 'number') {
			issue.sourceRecordKey = `price:${versionHashSha256}:${rowNumber}`;
		}
	}

	return {
		sourceContractId: 'price-workbook',
		sourceContractVersion: 1,
		structuralFingerprintSha256: fingerprint,
		versionHashSha256,
		headerRowNumber: header.rowNumber,
		headerColumns: HEADER_COLUMNS,
		rules,
		issues,
		rowsTotal: rules.length,
		rowsStaged: rules.length,
		rowsSkipped: rules.filter((rule) => !rule.isValid).length,
	};
}

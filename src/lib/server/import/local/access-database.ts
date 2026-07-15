import MDBReader from 'mdb-reader';
import { hashCanonical, normalizeImportText, normalizeLookupText } from '../canonical';
import { ImportContractError } from '../errors';
import type {
	ImportIssueDraft,
	LegacyChildDraft,
	LegacyEmailDraft,
	LegacyEnrollmentDraft,
	LegacyFamilyDraft,
	LegacyImportSnapshot,
	LegacySourceRowDraft,
	LessonKind,
	PlusBTextImportSnapshot,
} from '../types';
import { resolvePlusBTextGroup } from './plusbtext-workbook';

const TABLE_NAME = 'tblKartei';
const SOURCE_NAMESPACE = 'legacy_1' as const;
const PARENT_NAME_NORMALIZER_VERSION = 1 as const;
const REQUIRED_VALUE_FIELDS = [
	'Value1',
	'Value2',
	'Value4',
	'Value5',
	'Value6',
	'Value7',
	'Value8',
	'Value9',
	'Value15',
	'Value16',
	'Value17',
	'Value18',
	'Value19',
	'Value20',
	'Value42',
	'Value43',
	'Value44',
	'Value45',
	'Value46',
	'Value48',
] as const;
export const ACCESS_REQUIRED_FIELDS = ['ID', ...REQUIRED_VALUE_FIELDS] as const;

type AccessField = (typeof ACCESS_REQUIRED_FIELDS)[number];
export type AccessSourceRow = Record<AccessField, unknown>;

export interface AccessExtract {
	sourceContractId: 'access-tblkartei';
	sourceContractVersion: 1;
	structuralFingerprintSha256: string;
	columns: Array<{ name: string; type: string }>;
	rows: AccessSourceRow[];
}

interface FamilyWork {
	stableFamilyKey: string;
	legacyFamilyId: string;
	sourceFamilyId: string;
	familyNumberId: string | null;
	legacySequenceNumber: number | null;
	numberingStatus: LegacyFamilyDraft['numberingStatus'];
	rows: Array<{ accessId: number; values: Record<AccessField, string | null> }>;
}

function safeIssue(input: {
	code: string;
	sourceRecordKey?: string;
	field?: string;
	count?: number;
	severity?: ImportIssueDraft['severity'];
	blocksPromotion?: boolean;
}): ImportIssueDraft {
	return {
		severity: input.severity ?? 'warning',
		code: input.code,
		sourceRecordKey: input.sourceRecordKey,
		safeContext: {
			...(input.field ? { field: input.field } : {}),
			...(input.count !== undefined ? { count: input.count } : {}),
		},
		blocksPromotion: input.blocksPromotion ?? false,
	};
}

function rawText(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) {
		return Number.isFinite(value.getTime()) ? value.toISOString() : null;
	}
	const text = String(value);
	return text.trim() ? text : null;
}

function parseAccessId(value: unknown): number | null {
	if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
	if (typeof value === 'bigint')
		return value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
	const text = rawText(value)?.trim() ?? '';
	if (!/^[1-9]\d*$/.test(text)) return null;
	const parsed = Number(text);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

function sourceRowKey(periodCode: string, accessId: number): string {
	return `access:${SOURCE_NAMESPACE}:${periodCode}:${accessId}`;
}

function normalizeEmail(value: string): string | null {
	const normalized = value.trim().toLowerCase();
	if (!normalized || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
		return null;
	return normalized;
}

function parseBirthDate(value: unknown): string | null {
	if (value instanceof Date && Number.isFinite(value.getTime()))
		return value.toISOString().slice(0, 10);
	const raw = rawText(value)?.trim() ?? '';
	if (!raw) return null;
	const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(raw);
	const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
	const parts = iso
		? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
		: german
			? { year: Number(german[3]), month: Number(german[2]), day: Number(german[1]) }
			: null;
	if (!parts) return null;
	const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
	if (
		probe.getUTCFullYear() !== parts.year ||
		probe.getUTCMonth() !== parts.month - 1 ||
		probe.getUTCDate() !== parts.day
	)
		return null;
	return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function validNamePart(value: string): boolean {
	return /^(?:[\p{L}\p{M}][\p{L}\p{M}'’.-]*)(?: (?:[\p{L}\p{M}][\p{L}\p{M}'’.-]*))*$/u.test(
		value
	);
}

export function normalizeLegacyParentName(raw: string | null): {
	firstNameNormalized: string | null;
	lastNameNormalized: string | null;
	status: 'eligible' | 'ambiguous' | 'unavailable';
	version: 1;
} {
	if (!raw || !normalizeImportText(raw)) {
		return {
			firstNameNormalized: null,
			lastNameNormalized: null,
			status: 'unavailable',
			version: PARENT_NAME_NORMALIZER_VERSION,
		};
	}
	const normalized = normalizeImportText(raw);
	const parts = normalized.split(',').map((part) => normalizeImportText(part));
	if (
		parts.length !== 2 ||
		!parts[0] ||
		!parts[1] ||
		!validNamePart(parts[0]) ||
		!validNamePart(parts[1])
	) {
		return {
			firstNameNormalized: null,
			lastNameNormalized: null,
			status: 'ambiguous',
			version: PARENT_NAME_NORMALIZER_VERSION,
		};
	}
	return {
		firstNameNormalized: normalizeLookupText(parts[1]),
		lastNameNormalized: normalizeLookupText(parts[0]),
		status: 'eligible',
		version: PARENT_NAME_NORMALIZER_VERSION,
	};
}

function parseFamilyNumber(raw: string | null): {
	sequenceNumber: number | null;
	status: LegacyFamilyDraft['numberingStatus'];
} {
	if (!raw) return { sequenceNumber: null, status: 'missing' };
	const match = /^1\. ([1-9]\d*)$/.exec(raw);
	if (!match) return { sequenceNumber: null, status: 'unapproved' };
	const sequenceNumber = Number(match[1]);
	if (!Number.isSafeInteger(sequenceNumber))
		return { sequenceNumber: null, status: 'unapproved' };
	return { sequenceNumber, status: 'valid' };
}

function uniqueRaw(
	rows: FamilyWork['rows'],
	field: AccessField
): { value: string | null; count: number } {
	const values = [
		...new Set(
			rows.map((row) => row.values[field]).filter((value): value is string => Boolean(value))
		),
	].sort((left, right) => left.localeCompare(right));
	return { value: values.length === 1 ? values[0] : null, count: values.length };
}

function parsePositiveCents(value: string | null): number | null {
	if (!value) return null;
	const normalized = normalizeImportText(value).replace(/\s*(?:€|EUR)$/iu, '');
	const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(normalized);
	if (!match) return null;
	const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
	if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
	return Number(cents);
}

function classifyLesson(groupName: string, statusRaw: string | null): LessonKind {
	const status = normalizeLookupText(statusRaw ?? '').toUpperCase();
	const name = normalizeLookupText(groupName);
	if (status === 'NH' || status === 'N' || /nachhilfe/.test(name)) return 'nachhilfe';
	if (status === 'IND' || /(^|\s)ind\.(\s|$)/.test(name)) return 'individual';
	if (/planung|placeholder|unbekannt|unknown/.test(name)) return 'needs_review';
	if (/tanz/.test(name)) return 'dance_group';
	return 'group';
}

function normalizeStatus(input: {
	statusRaw: string | null;
	lessonKind: LessonKind;
	sourceRecordKey: string;
}): {
	contractKind: LegacyEnrollmentDraft['contractKind'];
	priceSource: LegacyEnrollmentDraft['priceSource'];
	priceMode: LegacyEnrollmentDraft['priceMode'];
	needsReview: boolean;
	issues: ImportIssueDraft[];
} {
	const status = normalizeImportText(input.statusRaw ?? '').toUpperCase();
	if (status === 'NH' || status === 'N' || input.lessonKind === 'nachhilfe')
		return {
			contractKind: 'nachhilfe',
			priceSource: null,
			priceMode: null,
			needsReview: false,
			issues: [],
		};
	if (status === 'IND' || input.lessonKind === 'individual')
		return {
			contractKind: 'individual',
			priceSource: null,
			priceMode: null,
			needsReview: false,
			issues: [],
		};
	if (status === 'J')
		return {
			contractKind: 'yearly',
			priceSource: 'yearly',
			priceMode: 'rule_derived',
			needsReview: false,
			issues: [],
		};
	if (status === 'M' || status === 'O/V' || status === 'V/O')
		return {
			contractKind: 'monthly',
			priceSource: 'monthly',
			priceMode: 'rule_derived',
			needsReview: false,
			issues: [],
		};
	if (status === 'KN')
		return {
			contractKind: null,
			priceSource: null,
			priceMode: null,
			needsReview: false,
			issues: [],
		};
	if (
		(status === '' || status === '0') &&
		(input.lessonKind === 'group' || input.lessonKind === 'dance_group')
	) {
		return {
			contractKind: 'monthly',
			priceSource: 'monthly',
			priceMode: 'rule_derived',
			needsReview: true,
			issues: [
				safeIssue({
					code: 'ACCESS_STATUS_PROVISIONAL_MONTHLY',
					sourceRecordKey: input.sourceRecordKey,
				}),
			],
		};
	}
	return {
		contractKind: null,
		priceSource: null,
		priceMode: null,
		needsReview: true,
		issues: [
			safeIssue({
				code: 'ACCESS_STATUS_NEEDS_REVIEW',
				sourceRecordKey: input.sourceRecordKey,
			}),
		],
	};
}

async function deterministicId(prefix: string, value: unknown): Promise<string> {
	return `${prefix}_${(await hashCanonical(value)).slice(0, 32)}`;
}

async function schemaFingerprint(columns: Array<{ name: string; type: string }>): Promise<string> {
	return hashCanonical({
		contract: 'access-tblkartei:1',
		table: TABLE_NAME,
		fields: ACCESS_REQUIRED_FIELDS.map((name) => ({
			name,
			type: columns.find((column) => column.name === name)?.type ?? null,
		})),
	});
}

function validateColumnProfile(columns: Array<{ name: string; type: string }>): string | null {
	const byName = new Map(columns.map((column) => [column.name, column.type.toLowerCase()]));
	if (ACCESS_REQUIRED_FIELDS.some((field) => !byName.has(field)))
		return 'ACCESS_REQUIRED_FIELD_MISSING';
	const idType = byName.get('ID')!;
	if (!['integer', 'long', 'bigint'].includes(idType)) return 'ACCESS_ID_TYPE_UNSUPPORTED';
	if (REQUIRED_VALUE_FIELDS.some((field) => !['text', 'memo'].includes(byName.get(field) ?? '')))
		return 'ACCESS_VALUE_TYPE_UNSUPPORTED';
	return null;
}

export async function readAccessDatabase(input: Buffer): Promise<AccessExtract> {
	let reader: MDBReader;
	try {
		reader = new MDBReader(input);
	} catch (cause) {
		throw new ImportContractError({
			code: 'ACCESS_CONTAINER_UNREADABLE',
			structuralFingerprintSha256: await hashCanonical({
				contract: 'access-tblkartei:1',
				readable: false,
			}),
			cause,
		});
	}
	if (reader.getPassword()) {
		throw new ImportContractError({
			code: 'ACCESS_ENCRYPTED_UNSUPPORTED',
			structuralFingerprintSha256: await hashCanonical({
				contract: 'access-tblkartei:1',
				encrypted: true,
			}),
		});
	}
	const tableNames = reader.getTableNames({
		normalTables: true,
		systemTables: false,
		linkedTables: false,
	});
	if (!tableNames.includes(TABLE_NAME)) {
		throw new ImportContractError({
			code: 'ACCESS_TABLE_MISSING',
			structuralFingerprintSha256: await hashCanonical({
				contract: 'access-tblkartei:1',
				tablePresent: false,
			}),
			safeContext: { table: TABLE_NAME },
		});
	}
	const table = reader.getTable(TABLE_NAME);
	const columns = table.getColumns().map((column) => ({ name: column.name, type: column.type }));
	const fingerprint = await schemaFingerprint(columns);
	const profileError = validateColumnProfile(columns);
	if (profileError) {
		throw new ImportContractError({
			code: profileError,
			structuralFingerprintSha256: fingerprint,
			safeContext: {
				requiredFieldCount: ACCESS_REQUIRED_FIELDS.length,
				matchedFieldCount: ACCESS_REQUIRED_FIELDS.filter((field) =>
					columns.some((column) => column.name === field)
				).length,
			},
		});
	}
	let rows: AccessSourceRow[];
	try {
		rows = table.getData({ columns: ACCESS_REQUIRED_FIELDS }) as AccessSourceRow[];
	} catch (cause) {
		throw new ImportContractError({
			code: 'ACCESS_TABLE_READ_FAILED',
			structuralFingerprintSha256: fingerprint,
			safeContext: { table: TABLE_NAME },
			cause,
		});
	}
	return {
		sourceContractId: 'access-tblkartei',
		sourceContractVersion: 1,
		structuralFingerprintSha256: fingerprint,
		columns,
		rows,
	};
}

export async function createSyntheticAccessExtract(
	rows: AccessSourceRow[],
	input?: { omitField?: AccessField; fieldTypeOverrides?: Partial<Record<AccessField, string>> }
): Promise<AccessExtract> {
	const columns = ACCESS_REQUIRED_FIELDS.filter((field) => field !== input?.omitField).map(
		(name) => ({
			name,
			type: input?.fieldTypeOverrides?.[name] ?? (name === 'ID' ? 'long' : 'text'),
		})
	);
	const fingerprint = await schemaFingerprint(columns);
	const profileError = validateColumnProfile(columns);
	if (profileError) {
		throw new ImportContractError({
			code: profileError,
			structuralFingerprintSha256: fingerprint,
		});
	}
	return {
		sourceContractId: 'access-tblkartei',
		sourceContractVersion: 1,
		structuralFingerprintSha256: fingerprint,
		columns,
		rows,
	};
}

export async function parseAccessExtract(input: {
	extract: AccessExtract;
	academicPeriodCode: string;
	plusBTextVersionId: string;
	plusBText: PlusBTextImportSnapshot;
}): Promise<LegacyImportSnapshot> {
	const ids = input.extract.rows.map((row) => parseAccessId(row.ID));
	if (ids.some((id) => id === null)) {
		throw new ImportContractError({
			code: 'ACCESS_ID_INVALID',
			structuralFingerprintSha256: input.extract.structuralFingerprintSha256,
			safeContext: { invalidIdCount: ids.filter((id) => id === null).length },
		});
	}
	if (new Set(ids).size !== ids.length) {
		throw new ImportContractError({
			code: 'ACCESS_ID_DUPLICATE',
			structuralFingerprintSha256: input.extract.structuralFingerprintSha256,
			safeContext: { duplicateIdCount: ids.length - new Set(ids).size },
		});
	}

	const issues: ImportIssueDraft[] = [];
	const rows = input.extract.rows.map((row, index) => {
		const accessId = ids[index]!;
		const values = Object.fromEntries(
			ACCESS_REQUIRED_FIELDS.map((field) => [field, rawText(row[field])])
		) as Record<AccessField, string | null>;
		return { accessId, values, raw: row };
	});
	const mirrorCounts = new Map<string, number>();
	for (const row of rows) {
		const mirror = row.values.Value48?.trim() ?? '';
		if (mirror) mirrorCounts.set(mirror, (mirrorCounts.get(mirror) ?? 0) + 1);
		if (mirror !== String(row.accessId)) {
			issues.push(
				safeIssue({
					code: 'ACCESS_VALUE48_MISMATCH',
					sourceRecordKey: sourceRowKey(input.academicPeriodCode, row.accessId),
					field: 'Value48',
				})
			);
		}
	}
	const duplicateMirrors = [...mirrorCounts.values()].filter((count) => count > 1);
	if (duplicateMirrors.length)
		issues.push(
			safeIssue({
				code: 'ACCESS_VALUE48_DUPLICATE',
				count: duplicateMirrors.length,
			})
		);

	const familyByKey = new Map<string, FamilyWork>();
	const familyForAccessId = new Map<number, FamilyWork>();
	for (const row of rows) {
		const rawFamilyId = row.values.Value1;
		const parsed = parseFamilyNumber(rawFamilyId);
		const sourceFamilyId = rawFamilyId ?? '';
		const identityValue = rawFamilyId ?? `missing:${row.accessId}`;
		const stableFamilyKey = await deterministicId('legacy_family_key', {
			namespace: SOURCE_NAMESPACE,
			sourceFamilyId: identityValue,
		});
		let family = familyByKey.get(stableFamilyKey);
		if (!family) {
			const legacyFamilyId = await deterministicId('legacy_family', {
				namespace: SOURCE_NAMESPACE,
				sourceFamilyId: identityValue,
			});
			family = {
				stableFamilyKey,
				legacyFamilyId,
				sourceFamilyId,
				familyNumberId:
					parsed.status === 'valid'
						? await deterministicId('family_number', {
								namespace: SOURCE_NAMESPACE,
								sequenceNumber: parsed.sequenceNumber,
							})
						: null,
				legacySequenceNumber: parsed.sequenceNumber,
				numberingStatus: parsed.status,
				rows: [],
			};
			familyByKey.set(stableFamilyKey, family);
			if (parsed.status !== 'valid') {
				issues.push(
					safeIssue({
						code:
							parsed.status === 'missing'
								? 'ACCESS_FAMILY_ID_MISSING'
								: 'ACCESS_FAMILY_ID_UNAPPROVED',
						sourceRecordKey: sourceRowKey(input.academicPeriodCode, row.accessId),
						field: 'Value1',
					})
				);
			}
		}
		family.rows.push({ accessId: row.accessId, values: row.values });
		familyForAccessId.set(row.accessId, family);
	}

	const families: LegacyFamilyDraft[] = [];
	const emails: LegacyEmailDraft[] = [];
	for (const family of familyByKey.values()) {
		const parent = uniqueRaw(family.rows, 'Value2');
		const address = uniqueRaw(family.rows, 'Value6');
		const phone = uniqueRaw(family.rows, 'Value7');
		const mobile = uniqueRaw(family.rows, 'Value8');
		const parentName =
			parent.count > 1
				? {
						firstNameNormalized: null,
						lastNameNormalized: null,
						status: 'ambiguous' as const,
						version: PARENT_NAME_NORMALIZER_VERSION,
					}
				: normalizeLegacyParentName(parent.value);
		if (parent.count > 1)
			issues.push(safeIssue({ code: 'ACCESS_PARENT_NAME_CONFLICT', count: parent.count }));
		else if (parentName.status !== 'eligible')
			issues.push(
				safeIssue({
					code:
						parentName.status === 'ambiguous'
							? 'ACCESS_PARENT_NAME_AMBIGUOUS'
							: 'ACCESS_PARENT_NAME_UNAVAILABLE',
				})
			);
		for (const [field, contact] of [
			['Value6', address],
			['Value7', phone],
			['Value8', mobile],
		] as const) {
			if (contact.count > 1)
				issues.push(
					safeIssue({
						code: 'ACCESS_FAMILY_CONTACT_CONFLICT',
						field,
						count: contact.count,
					})
				);
		}
		const familyDraft: LegacyFamilyDraft = {
			stableFamilyKey: family.stableFamilyKey,
			legacyFamilyId: family.legacyFamilyId,
			sourceFamilyId: family.sourceFamilyId,
			familyNumberId: family.familyNumberId,
			legacySequenceNumber: family.legacySequenceNumber,
			numberingStatus: family.numberingStatus,
			parentNameRaw: parent.value,
			parentFirstNameNormalized: parentName.firstNameNormalized,
			parentLastNameNormalized: parentName.lastNameNormalized,
			parentNameMatchStatus: parentName.status,
			parentNameNormalizerVersion: PARENT_NAME_NORMALIZER_VERSION,
			continuityNeedsReview: false,
			addressRaw: address.value,
			phoneRaw: phone.value,
			mobileRaw: mobile.value,
			recordHashSha256: '',
		};
		familyDraft.recordHashSha256 = await hashCanonical({
			sourceFamilyId: familyDraft.sourceFamilyId,
			numberingStatus: familyDraft.numberingStatus,
			parentNameRaw: familyDraft.parentNameRaw,
			parentNameMatchStatus: familyDraft.parentNameMatchStatus,
			addressRaw: familyDraft.addressRaw,
			phoneRaw: familyDraft.phoneRaw,
			mobileRaw: familyDraft.mobileRaw,
		});
		families.push(familyDraft);

		const familyEmailRows = family.rows.filter((row) => row.values.Value9);
		const distinctRawEmails = new Map<string, number>();
		for (const row of familyEmailRows) {
			const raw = row.values.Value9!;
			const previous = distinctRawEmails.get(raw);
			if (previous === undefined || row.accessId < previous)
				distinctRawEmails.set(raw, row.accessId);
		}
		const normalizedEmails = new Set<string>();
		for (const [emailRaw, sourceAccessId] of distinctRawEmails) {
			const emailNormalized = normalizeEmail(emailRaw);
			if (emailNormalized) normalizedEmails.add(emailNormalized);
			else
				issues.push(
					safeIssue({
						code: 'ACCESS_EMAIL_INVALID',
						sourceRecordKey: sourceRowKey(input.academicPeriodCode, sourceAccessId),
						field: 'Value9',
					})
				);
			const email: LegacyEmailDraft = {
				id: await deterministicId('legacy_email', {
					family: family.stableFamilyKey,
					period: input.academicPeriodCode,
					emailRaw,
				}),
				stableFamilyKey: family.stableFamilyKey,
				emailRaw,
				emailNormalized,
				sourceAccessId,
				recordHashSha256: await hashCanonical({ emailRaw, emailNormalized }),
			};
			emails.push(email);
		}
		if (normalizedEmails.size > 1)
			issues.push(
				safeIssue({ code: 'ACCESS_FAMILY_EMAIL_CONFLICT', count: normalizedEmails.size })
			);
	}

	const sourceRows: LegacySourceRowDraft[] = [];
	const childrenByKey = new Map<string, LegacyChildDraft>();
	const sourceChildKeyByAccessId = new Map<number, string | null>();
	let skippedRows = 0;
	for (const row of rows) {
		const family = familyForAccessId.get(row.accessId)!;
		const rowKey = sourceRowKey(input.academicPeriodCode, row.accessId);
		const childRaw = row.values.Value4;
		const isPayment = childRaw ? normalizeLookupText(childRaw) === 'zahlung' : false;
		let sourceChildKey: string | null = null;
		if (!isPayment && childRaw) {
			const birthDate = parseBirthDate(row.raw.Value5);
			if (!birthDate) {
				issues.push(
					safeIssue({
						code: 'ACCESS_CHILD_BIRTH_DATE_INVALID',
						sourceRecordKey: rowKey,
						field: 'Value5',
					})
				);
				skippedRows += 1;
			} else {
				const normalizedName = normalizeLookupText(childRaw);
				sourceChildKey = await deterministicId('legacy_child_key', {
					family: family.stableFamilyKey,
					name: normalizedName,
					birthDate,
				});
				if (!childrenByKey.has(sourceChildKey)) {
					const child: LegacyChildDraft = {
						stableFamilyKey: family.stableFamilyKey,
						legacyChildId: await deterministicId('child', { sourceChildKey }),
						sourceChildKey,
						sourceFullName: childRaw,
						sourceFullNameNormalized: normalizedName,
						sourceBirthDate: birthDate,
						continuityNeedsReview: false,
						recordHashSha256: await hashCanonical({
							sourceFullName: childRaw,
							normalizedName,
							birthDate,
						}),
					};
					childrenByKey.set(sourceChildKey, child);
				}
			}
		} else if (
			!isPayment &&
			[
				row.values.Value15,
				row.values.Value42,
				row.values.Value43,
				row.values.Value44,
				row.values.Value45,
				row.values.Value46,
			].some(Boolean)
		) {
			issues.push(
				safeIssue({
					code: 'ACCESS_ACTIVITY_WITHOUT_CHILD',
					sourceRecordKey: rowKey,
					field: 'Value4',
				})
			);
			skippedRows += 1;
		}
		sourceChildKeyByAccessId.set(row.accessId, sourceChildKey);
		const sourceValues = Object.fromEntries(
			REQUIRED_VALUE_FIELDS.map((field) => [field, row.values[field]])
		) as Record<string, string | null>;
		sourceRows.push({
			id: await deterministicId('legacy_source_row', {
				namespace: SOURCE_NAMESPACE,
				period: input.academicPeriodCode,
				accessId: row.accessId,
			}),
			sourceNamespace: SOURCE_NAMESPACE,
			sourceAccessId: row.accessId,
			sourceRecordKey: rowKey,
			stableFamilyKey: family.stableFamilyKey,
			sourceChildKey,
			value48Mirror: row.values.Value48,
			sourceHashSha256: await hashCanonical(sourceValues),
			sourceValues,
		});
	}

	const children = [...childrenByKey.values()];
	const childDatesByFamilyAndName = new Map<string, Set<string>>();
	for (const child of children) {
		const key = `${child.stableFamilyKey}:${child.sourceFullNameNormalized}`;
		const dates = childDatesByFamilyAndName.get(key) ?? new Set<string>();
		dates.add(child.sourceBirthDate);
		childDatesByFamilyAndName.set(key, dates);
	}
	const sameNameDifferentDates = [...childDatesByFamilyAndName.values()].filter(
		(dates) => dates.size > 1
	).length;
	if (sameNameDifferentDates)
		issues.push(
			safeIssue({
				code: 'ACCESS_CHILD_SAME_NAME_MULTIPLE_BIRTH_DATES',
				count: sameNameDifferentDates,
			})
		);

	const enrollments: LegacyEnrollmentDraft[] = [];
	const packageFields = ['Value42', 'Value43', 'Value44', 'Value45', 'Value46'] as const;
	for (const row of rows) {
		const family = familyForAccessId.get(row.accessId)!;
		const sourceChildKey = sourceChildKeyByAccessId.get(row.accessId);
		if (!sourceChildKey || family.numberingStatus !== 'valid') continue;
		const slots: Array<{
			slot: LegacyEnrollmentDraft['sourceSlot'];
			groupName: string | null;
			teacher: string | null;
			day: string | null;
			plannedPrice: string | null;
			notes: string | null;
		}> = [
			{
				slot: 'main_next',
				groupName: row.values.Value15,
				teacher: row.values.Value16,
				day: row.values.Value17,
				plannedPrice: row.values.Value18,
				notes: row.values.Value19,
			},
			...packageFields.map((field, index) => ({
				slot: `package_${index + 1}` as LegacyEnrollmentDraft['sourceSlot'],
				groupName: row.values[field],
				teacher: null,
				day: null,
				plannedPrice: null,
				notes: null,
			})),
		];
		for (const slot of slots) {
			if (!slot.groupName) continue;
			const slotSuffix =
				slot.slot === 'main_next' ? 'main_next' : `package:${slot.slot.slice(-1)}`;
			const recordKey = `${sourceRowKey(input.academicPeriodCode, row.accessId)}:${slotSuffix}`;
			const resolution = resolvePlusBTextGroup({
				groupName: slot.groupName,
				sourceRecordKey: recordKey,
				oldGroups: input.plusBText.oldGroups,
				targets: input.plusBText.targets,
			});
			issues.push(...resolution.issues);
			const lessonKind = classifyLesson(slot.groupName, row.values.Value20);
			const status = normalizeStatus({
				statusRaw: row.values.Value20,
				lessonKind,
				sourceRecordKey: recordKey,
			});
			issues.push(...status.issues);
			const plannedPriceCents = parsePositiveCents(slot.plannedPrice);
			if (slot.plannedPrice && plannedPriceCents === null)
				issues.push(
					safeIssue({
						code: 'ACCESS_PLANNED_PRICE_INVALID',
						sourceRecordKey: recordKey,
						field: 'Value18',
					})
				);
			const needsAdminReview =
				resolution.status !== 'resolved' ||
				resolution.durationMinutes === null ||
				status.needsReview ||
				lessonKind === 'needs_review' ||
				Boolean(slot.plannedPrice && plannedPriceCents === null);
			if (resolution.status === 'resolved' && resolution.durationMinutes === null)
				issues.push(
					safeIssue({ code: 'ACCESS_DURATION_MISSING', sourceRecordKey: recordKey })
				);
			const draft: LegacyEnrollmentDraft = {
				id: await deterministicId('legacy_enrollment', { sourceRecordKey: recordKey }),
				sourceAccessId: row.accessId,
				stableFamilyKey: family.stableFamilyKey,
				sourceChildKey,
				sourceSlot: slot.slot,
				sourceRecordKey: recordKey,
				groupNameRaw: slot.groupName,
				groupNameNormalized: normalizeLookupText(slot.groupName),
				teacherName: slot.teacher ?? resolution.teacherName,
				dayRaw: slot.day ?? resolution.dayRaw,
				durationMinutes: resolution.durationMinutes,
				statusCodeRaw: row.values.Value20,
				lessonKind,
				contractKind: status.contractKind,
				priceSource: status.priceSource,
				priceMode: status.priceMode,
				plannedPriceCents,
				notesRaw: slot.notes,
				needsAdminReview,
				recordHashSha256: '',
			};
			draft.recordHashSha256 = await hashCanonical({
				sourceSlot: draft.sourceSlot,
				groupNameRaw: draft.groupNameRaw,
				teacherName: draft.teacherName,
				dayRaw: draft.dayRaw,
				durationMinutes: draft.durationMinutes,
				statusCodeRaw: draft.statusCodeRaw,
				lessonKind: draft.lessonKind,
				contractKind: draft.contractKind,
				priceSource: draft.priceSource,
				priceMode: draft.priceMode,
				plannedPriceCents: draft.plannedPriceCents,
				notesRaw: draft.notesRaw,
				needsAdminReview: draft.needsAdminReview,
			});
			enrollments.push(draft);
		}
	}

	const duplicateServiceGroups = new Map<string, LegacyEnrollmentDraft[]>();
	for (const enrollment of enrollments) {
		const key = `${enrollment.sourceChildKey}:${enrollment.groupNameNormalized}`;
		const candidates = duplicateServiceGroups.get(key) ?? [];
		candidates.push(enrollment);
		duplicateServiceGroups.set(key, candidates);
	}
	for (const candidates of duplicateServiceGroups.values()) {
		if (candidates.length < 2) continue;
		for (const candidate of candidates) candidate.needsAdminReview = true;
		issues.push(
			safeIssue({ code: 'ACCESS_CHILD_GROUP_DUPLICATE_SLOTS', count: candidates.length })
		);
	}

	const versionHashSha256 = await hashCanonical({
		contract: 'access-tblkartei:1',
		academicPeriod: input.academicPeriodCode,
		plusBTextVersionHashSha256: input.plusBText.versionHashSha256,
		sourceRows: sourceRows
			.map((row) => ({
				sourceRecordKey: row.sourceRecordKey,
				sourceHashSha256: row.sourceHashSha256,
			}))
			.sort((left, right) => left.sourceRecordKey.localeCompare(right.sourceRecordKey)),
		enrollments: enrollments
			.map((enrollment) => ({
				sourceRecordKey: enrollment.sourceRecordKey,
				recordHashSha256: enrollment.recordHashSha256,
			}))
			.sort((left, right) => left.sourceRecordKey.localeCompare(right.sourceRecordKey)),
	});
	return {
		sourceContractId: 'access-tblkartei',
		sourceContractVersion: 1,
		structuralFingerprintSha256: input.extract.structuralFingerprintSha256,
		versionHashSha256,
		plusBTextVersionId: input.plusBTextVersionId,
		plusBTextVersionHashSha256: input.plusBText.versionHashSha256,
		families,
		emails,
		children,
		sourceRows,
		enrollments,
		issues,
		rowsTotal: rows.length,
		rowsStaged: rows.length,
		rowsSkipped: skippedRows,
	};
}

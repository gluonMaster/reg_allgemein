export type ImportSourceKind = 'access' | 'plusbtext' | 'price' | 'schedule';
export type ImportIssueSeverity = 'info' | 'warning' | 'error' | 'fatal';

export interface ImportIssueDraft {
	severity: ImportIssueSeverity;
	code: string;
	sourceRecordKey?: string;
	safeContext?: Record<string, unknown>;
	blocksPromotion: boolean;
}

export interface ImportDiffSummary {
	added: number;
	changed: number;
	retired: number;
	unchanged: number;
}

export interface PriceVectorComponent {
	subject: string | null;
	durationMinutes: number;
}

export interface PriceRuleDraft {
	sourceRowNumber: number;
	sourceRecordKey: string;
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
	provenance: {
		sourceRowNumber: number;
		yearlySourceColumn: 'Preis';
		monthlySourceColumn: 'Sonderpreis';
	};
	isValid: boolean;
	validationCode: string | null;
}

export interface PriceImportSnapshot {
	sourceContractId: 'price-workbook';
	sourceContractVersion: 1;
	structuralFingerprintSha256: string;
	versionHashSha256: string;
	headerRowNumber: number;
	headerColumns: Record<'Key' | 'Preis' | 'Dauer' | 'Faecher' | 'Sonderpreis' | 'Kinder', number>;
	rules: PriceRuleDraft[];
	issues: ImportIssueDraft[];
	rowsTotal: number;
	rowsStaged: number;
	rowsSkipped: number;
}

export type LessonKind = 'group' | 'dance_group' | 'nachhilfe' | 'individual' | 'needs_review';

export interface ScheduleBlockDraft {
	sourceNamespace: 'primary';
	sourceBlockId: string;
	sourceOfferingKey: string;
	sourceBlockHashSha256: string;
	displayName: string;
	lessonKind: LessonKind;
	subject: string;
	dayCode: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
	startTime: string;
	endTime: string;
	durationMinutes: number;
	teacher: string;
	building: string;
	room: string;
	locationDisplay: string;
	catalogStatus: 'published' | 'needs_review';
	requiresAdminApproval: boolean;
	capacityDefault: number | null;
}

export interface ScheduleImportSnapshot {
	sourceContractId: 'schedule-json';
	sourceContractVersion: 1;
	structuralFingerprintSha256: string;
	versionHashSha256: string;
	schemaVersion: 1;
	generationId: string;
	generatedAt: string;
	blocks: ScheduleBlockDraft[];
	issues: ImportIssueDraft[];
	rowsTotal: number;
	rowsStaged: number;
	rowsSkipped: number;
	htmlComparison: {
		blocksCompared: number;
		blocksMatched: number;
	};
}

export interface PlusBTextOldGroupDraft {
	storageKey: string;
	sourceRowNumber: number;
	oldGroupId: number | null;
	groupNameRaw: string | null;
	groupNameNormalized: string | null;
	recordHashSha256: string;
	isValid: boolean;
}

export interface PlusBTextTargetDraft {
	storageKey: string;
	sourceRowNumber: number;
	oldGroupIds: number[];
	groupNameRaw: string;
	groupNameNormalized: string;
	teacherName: string | null;
	dayRaw: string | null;
	durationMinutes: number | null;
	durationStatus: 'verified' | 'missing' | 'invalid';
	recordHashSha256: string;
	isValid: boolean;
}

export interface PlusBTextImportSnapshot {
	sourceContractId: 'admin-xlsm-plusbtext';
	sourceContractVersion: 1;
	fingerprintAlgorithmVersion: 1;
	structuralFingerprintSha256: string;
	logicalShapeFingerprintSha256: string;
	styleFingerprintSha256: string;
	versionHashSha256: string;
	oldGroups: PlusBTextOldGroupDraft[];
	targets: PlusBTextTargetDraft[];
	issues: ImportIssueDraft[];
	rowsTotal: number;
	rowsStaged: number;
	rowsSkipped: number;
}

export interface LegacyFamilyDraft {
	stableFamilyKey: string;
	legacyFamilyId: string;
	sourceFamilyId: string;
	familyNumberId: string | null;
	legacySequenceNumber: number | null;
	numberingStatus: 'valid' | 'collision' | 'missing' | 'unapproved';
	parentNameRaw: string | null;
	parentFirstNameNormalized: string | null;
	parentLastNameNormalized: string | null;
	parentNameMatchStatus: 'eligible' | 'ambiguous' | 'unavailable';
	parentNameNormalizerVersion: 2;
	continuityNeedsReview: boolean;
	addressRaw: string | null;
	phoneRaw: string | null;
	mobileRaw: string | null;
	recordHashSha256: string;
}

export interface LegacyEmailDraft {
	id: string;
	stableFamilyKey: string;
	emailRaw: string;
	emailNormalized: string | null;
	sourceAccessId: number;
	recordHashSha256: string;
}

export interface LegacyChildDraft {
	stableFamilyKey: string;
	legacyChildId: string;
	sourceChildKey: string;
	sourceFullName: string;
	sourceFullNameNormalized: string;
	sourceBirthDate: string;
	continuityNeedsReview: boolean;
	recordHashSha256: string;
}

export interface LegacySourceRowDraft {
	id: string;
	sourceNamespace: 'legacy_1';
	sourceAccessId: number;
	sourceRecordKey: string;
	stableFamilyKey: string | null;
	sourceChildKey: string | null;
	value48Mirror: string | null;
	sourceHashSha256: string;
	sourceValues: Record<string, string | null>;
}

export interface LegacyEnrollmentDraft {
	id: string;
	sourceAccessId: number;
	stableFamilyKey: string;
	sourceChildKey: string;
	sourceSlot: 'main_next' | 'package_1' | 'package_2' | 'package_3' | 'package_4' | 'package_5';
	sourceRecordKey: string;
	groupNameRaw: string;
	groupNameNormalized: string;
	teacherName: string | null;
	dayRaw: string | null;
	durationMinutes: number | null;
	durationStatus: 'verified' | 'missing' | 'invalid' | 'ambiguous' | 'unresolved';
	statusCodeRaw: string | null;
	lessonKind: LessonKind | null;
	contractKind: 'yearly' | 'monthly' | 'nachhilfe' | 'individual' | null;
	priceSource: 'yearly' | 'monthly' | null;
	priceMode: 'rule_derived' | null;
	plannedPriceCents: number | null;
	notesRaw: string | null;
	needsAdminReview: boolean;
	recordHashSha256: string;
}

export interface LegacyImportSnapshot {
	sourceContractId: 'access-tblkartei';
	sourceContractVersion: 1;
	structuralFingerprintSha256: string;
	versionHashSha256: string;
	plusBTextVersionId: string;
	plusBTextVersionHashSha256: string;
	families: LegacyFamilyDraft[];
	emails: LegacyEmailDraft[];
	children: LegacyChildDraft[];
	sourceRows: LegacySourceRowDraft[];
	enrollments: LegacyEnrollmentDraft[];
	issues: ImportIssueDraft[];
	rowsTotal: number;
	rowsStaged: number;
	rowsSkipped: number;
}

export interface AcademicPeriodRow {
	id: string;
	code: string;
	display_name: string;
	starts_on: string;
	ends_on: string;
	is_current: number;
}

export interface ImportRunResult {
	runId: string;
	status: 'validated' | 'promoted' | 'failed' | 'noop';
	sourceKind: ImportSourceKind;
	academicPeriod: string;
	sourceHashSha256: string;
	versionHashSha256?: string;
	diff?: ImportDiffSummary;
	issueCounts?: Record<ImportIssueSeverity, number>;
	rows?: {
		total: number;
		staged: number;
		promoted: number;
		skipped: number;
	};
	errorCode?: string;
}

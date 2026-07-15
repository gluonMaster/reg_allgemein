export type ImportSourceKind = 'price' | 'schedule';
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

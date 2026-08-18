import type { SqlDatabaseBoundary, StatementSpec } from '$lib/server/db/database';
import { FoundationRepository } from '$lib/server/db/foundation-repository';
import { redactSensitive } from '$lib/server/observability/redaction';
import { hashCanonical } from './canonical';
import {
	LegacyImportReconciliationRepository,
	type ReconciliationGateSummary,
} from './reconciliation';
import type {
	AcademicPeriodRow,
	ImportDiffSummary,
	ImportIssueDraft,
	ImportIssueSeverity,
	ImportSourceKind,
	LegacyImportSnapshot,
	PlusBTextImportSnapshot,
	PriceImportSnapshot,
	ScheduleImportSnapshot,
} from './types';

// Remote release acquisition performs two fenced writes before the atomic batch.
// Keep the lease longer than the bounded sum of those requests and the batch.
const PROMOTION_LEASE_MS = 120_000;
const BATCH_SIZE = 50;

interface ImportRunRow {
	id: string;
	source_kind: ImportSourceKind;
	academic_period_id: string;
	source_hash_sha256: string;
	run_fingerprint: string;
	status: 'staged' | 'validated' | 'promoted' | 'failed';
	attempt_no: number;
	rows_total: number;
	rows_staged: number;
	rows_promoted: number;
	rows_skipped: number;
	safe_summary_json: string;
}

interface VersionRow {
	id: string;
	import_run_id: string;
	version_hash_sha256: string;
}

export interface CreateImportRunInput {
	runId?: string;
	sourceKind: ImportSourceKind;
	academicPeriodId: string;
	sourceLabel: string;
	sourceHashSha256: string;
	sourceContractId: string;
	sourceContractVersion: number;
	structuralFingerprintSha256: string;
	dependencyHashes: Record<string, string>;
	dependencySetHashSha256: string;
	runFingerprint: string;
	now: string;
}

export interface StagedImportResult {
	runId: string;
	versionId: string;
	versionHashSha256: string;
	status: 'validated' | 'failed';
	diff: ImportDiffSummary;
	issueCounts: Record<ImportIssueSeverity, number>;
	rowsPromotable: number;
	verificationRows?:
		| { kind: 'plusbtext'; oldGroups: number; targets: number }
		| {
				kind: 'access';
				sourceRows: number;
				families: number;
				emails: number;
				children: number;
				enrollments: number;
				projectedFamilies: number;
				projectedEmails: number;
				projectedChildren: number;
				projectedEnrollments: number;
		  };
}

export interface LegacyReleaseVerificationContract {
	plusBText: {
		rowsTotal: number;
		rowsStaged: number;
		rowsSkipped: number;
		oldGroups: number;
		targets: number;
	};
	access: {
		rowsTotal: number;
		rowsStaged: number;
		rowsSkipped: number;
		sourceRows: number;
		families: number;
		emails: number;
		children: number;
		enrollments: number;
		projectedFamilies: number;
		projectedEmails: number;
		projectedChildren: number;
		projectedEnrollments: number;
	};
	issues: Record<ImportIssueSeverity, number>;
}

export interface PromotionResult {
	outcome: 'promoted' | 'noop';
	runId: string;
	versionId: string;
	previousVersionId: string | null;
}

export interface CreateLegacyReleasePlanInput {
	planId?: string;
	planDigestSha256: string;
	stagedDigestSha256: string;
	environment: 'preview' | 'production';
	targetDatabaseId: string;
	gitCommitSha: string;
	plannedBy: string;
	stagedBy: string;
	academicPeriodId: string;
	plusBTextRunId: string;
	accessRunId: string;
	plusBTextVersionId: string;
	accessVersionId: string;
	expectedCurrentPlusBTextVersionId: string | null;
	expectedCurrentAccessVersionId: string | null;
	verificationContract: LegacyReleaseVerificationContract;
	safeSummary: unknown;
	now: string;
}

export interface LegacyReleasePlanRow {
	id: string;
	plan_digest_sha256: string;
	staged_digest_sha256: string;
	academic_period_id: string;
	plusbtext_run_id: string;
	access_run_id: string;
	plusbtext_version_id: string;
	access_version_id: string;
	expected_current_plusbtext_version_id: string | null;
	expected_current_access_version_id: string | null;
	environment: 'preview' | 'production';
	target_database_id: string;
	git_commit_sha: string;
	planned_by: string;
	staged_by: string;
	verification_contract_json: string;
	status: 'staged' | 'reviewed' | 'promoted' | 'rolled_back';
	review_digest_sha256: string | null;
	reviewed_by: string | null;
}

export interface LegacyBundleTransitionResult {
	planId: string;
	action: 'promote' | 'rollback' | 'roll_forward';
	plusBTextVersionId: string;
	accessVersionId: string;
	previousPlusBTextVersionId: string | null;
	previousAccessVersionId: string | null;
}

export interface LegacyReleaseVerification {
	planId: string;
	status: LegacyReleasePlanRow['status'];
	currentPair: 'target' | 'previous' | 'none' | 'unexpected';
	currentPairUnique: boolean;
	dependencyCompatible: boolean;
	foreignKeyIntegrity: boolean;
	runStatus: {
		plusBText: ImportRunRow['status'];
		access: ImportRunRow['status'];
	};
	expected: LegacyReleaseVerificationContract;
	runRows: {
		plusBText: { total: number; staged: number; promoted: number; skipped: number };
		access: { total: number; staged: number; promoted: number; skipped: number };
	};
	targetRows: {
		plusBTextOldGroups: number;
		plusBTextTargets: number;
		accessSourceRows: number;
		accessFamilies: number;
		accessEmails: number;
		accessChildren: number;
		accessEnrollments: number;
	};
	projectionRows: {
		accessSourceRows: number;
		accessFamilies: number;
		accessEmails: number;
		accessChildren: number;
		accessEnrollments: number;
	};
	issues: Record<ImportIssueSeverity, number>;
	reconciliation: ReconciliationGateSummary;
	events: { promote: number; rollback: number; rollForward: number };
}

export class ImportStorageError extends Error {
	readonly code: string;
	readonly delivery?: 'ambiguous';

	constructor(code: string, cause?: unknown) {
		super('Import storage operation failed.', { cause });
		this.name = 'ImportStorageError';
		this.code = code;
		if (isAmbiguousDatabaseDelivery(cause)) this.delivery = 'ambiguous';
	}
}

export function assertLegacyReleaseVerificationReady(
	verification: LegacyReleaseVerification
): LegacyReleaseVerification {
	const expected = verification.expected;
	const plusRun = verification.runRows.plusBText;
	const accessRun = verification.runRows.access;
	const countsMatch =
		expected.plusBText.rowsTotal > 0 &&
		expected.plusBText.rowsStaged > 0 &&
		expected.access.rowsTotal > 0 &&
		expected.access.rowsStaged > 0 &&
		plusRun.total === expected.plusBText.rowsTotal &&
		plusRun.staged === expected.plusBText.rowsStaged &&
		plusRun.skipped === expected.plusBText.rowsSkipped &&
		accessRun.total === expected.access.rowsTotal &&
		accessRun.staged === expected.access.rowsStaged &&
		accessRun.skipped === expected.access.rowsSkipped &&
		verification.targetRows.plusBTextOldGroups === expected.plusBText.oldGroups &&
		verification.targetRows.plusBTextTargets === expected.plusBText.targets &&
		verification.targetRows.accessSourceRows === expected.access.sourceRows &&
		verification.targetRows.accessFamilies === expected.access.families &&
		verification.targetRows.accessEmails === expected.access.emails &&
		verification.targetRows.accessChildren === expected.access.children &&
		verification.targetRows.accessEnrollments === expected.access.enrollments &&
		(Object.keys(expected.issues) as ImportIssueSeverity[]).every(
			(severity) => verification.issues[severity] === expected.issues[severity]
		);
	const promotedRunCountsMatch =
		plusRun.promoted === expected.plusBText.rowsStaged - expected.plusBText.rowsSkipped &&
		accessRun.promoted === expected.access.rowsStaged - expected.access.rowsSkipped;
	const promotedCountsMatch =
		promotedRunCountsMatch &&
		verification.projectionRows.accessSourceRows === expected.access.sourceRows &&
		verification.projectionRows.accessFamilies === expected.access.projectedFamilies &&
		verification.projectionRows.accessEmails === expected.access.projectedEmails &&
		verification.projectionRows.accessChildren === expected.access.projectedChildren &&
		verification.projectionRows.accessEnrollments === expected.access.projectedEnrollments;
	const inactiveTargetCountsMatch =
		plusRun.promoted === 0 &&
		accessRun.promoted === 0 &&
		verification.projectionRows.accessSourceRows === 0 &&
		verification.projectionRows.accessFamilies === 0 &&
		verification.projectionRows.accessEmails === 0 &&
		verification.projectionRows.accessChildren === 0 &&
		verification.projectionRows.accessEnrollments === 0;
	const rolledBackCountsMatch =
		promotedRunCountsMatch &&
		verification.projectionRows.accessSourceRows === 0 &&
		verification.projectionRows.accessFamilies === 0 &&
		verification.projectionRows.accessEmails === 0 &&
		verification.projectionRows.accessChildren === 0 &&
		verification.projectionRows.accessEnrollments === 0;
	const statusStateValid =
		verification.status === 'staged' || verification.status === 'reviewed'
			? (verification.currentPair === 'previous' || verification.currentPair === 'none') &&
				verification.runStatus.plusBText === 'validated' &&
				verification.runStatus.access === 'validated' &&
				verification.events.promote === 0 &&
				verification.events.rollback === 0 &&
				verification.events.rollForward === 0 &&
				inactiveTargetCountsMatch
			: verification.status === 'rolled_back'
				? verification.currentPair === 'previous' &&
					verification.runStatus.plusBText === 'promoted' &&
					verification.runStatus.access === 'promoted' &&
					verification.events.promote === 1 &&
					verification.events.rollback === verification.events.rollForward + 1 &&
					rolledBackCountsMatch
				: verification.currentPair === 'target' &&
					verification.runStatus.plusBText === 'promoted' &&
					verification.runStatus.access === 'promoted' &&
					verification.events.promote === 1 &&
					verification.events.rollback === verification.events.rollForward &&
					promotedCountsMatch;
	if (
		!verification.currentPairUnique ||
		!verification.dependencyCompatible ||
		!verification.foreignKeyIntegrity ||
		expected.issues.error !== 0 ||
		expected.issues.fatal !== 0 ||
		verification.issues.error !== 0 ||
		verification.issues.fatal !== 0 ||
		!countsMatch ||
		!statusStateValid ||
		!verification.reconciliation.passed
	) {
		throw new ImportStorageError('LEGACY_RELEASE_VERIFY_FAILED');
	}
	return verification;
}

function assertInstant(value: string, field: string): void {
	if (!Number.isFinite(Date.parse(value)))
		throw new TypeError(`${field} must be an ISO-8601 timestamp.`);
}

function assertDate(value: string, field: string): void {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError(`${field} must be YYYY-MM-DD.`);
}

function issueCounts(issues: ImportIssueDraft[]): Record<ImportIssueSeverity, number> {
	const counts: Record<ImportIssueSeverity, number> = { info: 0, warning: 0, error: 0, fatal: 0 };
	for (const issue of issues) counts[issue.severity] += 1;
	return counts;
}

function chunk<T>(values: readonly T[], size = BATCH_SIZE): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}

function diffMaps(
	before: ReadonlyMap<string, string>,
	after: ReadonlyMap<string, string>
): ImportDiffSummary {
	let added = 0;
	let changed = 0;
	let unchanged = 0;
	for (const [key, hash] of after) {
		if (!before.has(key)) added += 1;
		else if (before.get(key) !== hash) changed += 1;
		else unchanged += 1;
	}
	return {
		added,
		changed,
		retired: [...before.keys()].filter((key) => !after.has(key)).length,
		unchanged,
	};
}

function accessVerificationRows(
	snapshot: LegacyImportSnapshot
): Extract<NonNullable<StagedImportResult['verificationRows']>, { kind: 'access' }> {
	const validFamilies = new Set(
		snapshot.families
			.filter((family) => family.numberingStatus === 'valid' && family.familyNumberId)
			.map((family) => family.stableFamilyKey)
	);
	const validChildren = new Set(
		snapshot.children
			.filter((child) => validFamilies.has(child.stableFamilyKey))
			.map((child) => `${child.stableFamilyKey}\u0000${child.sourceChildKey}`)
	);
	return {
		kind: 'access',
		sourceRows: snapshot.sourceRows.length,
		families: snapshot.families.length,
		emails: snapshot.emails.length,
		children: snapshot.children.length,
		enrollments: snapshot.enrollments.length,
		projectedFamilies: validFamilies.size,
		projectedEmails: snapshot.emails.filter((email) => validFamilies.has(email.stableFamilyKey))
			.length,
		projectedChildren: validChildren.size,
		projectedEnrollments: snapshot.enrollments.filter(
			(enrollment) =>
				validFamilies.has(enrollment.stableFamilyKey) &&
				validChildren.has(`${enrollment.stableFamilyKey}\u0000${enrollment.sourceChildKey}`)
		).length,
	};
}

function safeJson(value: unknown): string {
	return JSON.stringify(redactSensitive(value));
}

function assertOperatorId(value: string, field: string): void {
	if (!/^[a-z0-9][a-z0-9._:-]{2,63}$/u.test(value)) {
		throw new TypeError(`${field} must be an opaque operator ID.`);
	}
}

function assertVerificationContract(value: LegacyReleaseVerificationContract): void {
	for (const [section, counts] of Object.entries(value)) {
		for (const [key, count] of Object.entries(counts as Record<string, number>)) {
			if (!Number.isSafeInteger(count) || count < 0) {
				throw new TypeError(
					`verificationContract.${section}.${key} must be a non-negative integer.`
				);
			}
		}
	}
	if (
		value.plusBText.rowsTotal < 1 ||
		value.plusBText.rowsStaged < 1 ||
		value.access.rowsTotal < 1 ||
		value.access.rowsStaged < 1 ||
		value.access.sourceRows < 1 ||
		value.plusBText.oldGroups + value.plusBText.targets !== value.plusBText.rowsStaged ||
		value.access.sourceRows !== value.access.rowsStaged
	) {
		throw new TypeError('verificationContract row counts are inconsistent.');
	}
}

function isAmbiguousDatabaseDelivery(value: unknown): boolean {
	let current = value;
	for (let depth = 0; depth < 8 && typeof current === 'object' && current !== null; depth += 1) {
		if ('delivery' in current && (current as { delivery?: unknown }).delivery === 'ambiguous') {
			return true;
		}
		current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
	}
	return false;
}

function promotionResourceKey(sourceKind: ImportSourceKind, academicPeriodId: string): string {
	return `${sourceKind}:${academicPeriodId}`;
}

export class ImportRepository {
	private readonly foundation: FoundationRepository;
	private readonly reconciliation: LegacyImportReconciliationRepository;

	constructor(private readonly db: SqlDatabaseBoundary) {
		this.foundation = new FoundationRepository(db);
		this.reconciliation = new LegacyImportReconciliationRepository(db);
	}

	async getAcademicPeriod(code: string): Promise<AcademicPeriodRow | null> {
		return this.db.first<AcademicPeriodRow>({
			sql: `SELECT id, code, display_name, starts_on, ends_on, is_current
				FROM academic_periods WHERE code = ?`,
			params: [code],
		});
	}

	async ensureAcademicPeriod(input: {
		code: string;
		displayName: string;
		startsOn: string;
		endsOn: string;
		isCurrent: boolean;
		now: string;
	}): Promise<AcademicPeriodRow> {
		assertDate(input.startsOn, 'startsOn');
		assertDate(input.endsOn, 'endsOn');
		assertInstant(input.now, 'now');
		if (input.startsOn > input.endsOn)
			throw new TypeError('startsOn must not be after endsOn.');

		const existing = await this.getAcademicPeriod(input.code);
		if (existing) {
			if (
				existing.display_name !== input.displayName ||
				existing.starts_on !== input.startsOn ||
				existing.ends_on !== input.endsOn ||
				existing.is_current !== Number(input.isCurrent)
			) {
				throw new ImportStorageError('ACADEMIC_PERIOD_CONFLICT');
			}
			return existing;
		}

		const id = crypto.randomUUID();
		try {
			await this.db.run({
				sql: `INSERT INTO academic_periods
					(id, code, display_name, starts_on, ends_on, is_current, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?)`,
				params: [
					id,
					input.code,
					input.displayName,
					input.startsOn,
					input.endsOn,
					Number(input.isCurrent),
					input.now,
				],
			});
		} catch (cause) {
			throw new ImportStorageError('ACADEMIC_PERIOD_CREATE_FAILED', cause);
		}
		const created = await this.getAcademicPeriod(input.code);
		if (!created) throw new ImportStorageError('ACADEMIC_PERIOD_CREATE_MISSING');
		return created;
	}

	async findPromotedRun(runFingerprint: string): Promise<ImportRunRow | null> {
		return this.db.first<ImportRunRow>({
			sql: `SELECT id, source_kind, academic_period_id, source_hash_sha256,
				run_fingerprint, status, attempt_no, rows_total, rows_staged,
				rows_promoted, rows_skipped, safe_summary_json
				FROM import_runs WHERE run_fingerprint = ? AND status = 'promoted'`,
			params: [runFingerprint],
		});
	}

	async latestRunAttempt(runFingerprint: string): Promise<ImportRunRow | null> {
		return this.db.first<ImportRunRow>({
			sql: `SELECT id, source_kind, academic_period_id, source_hash_sha256,
				run_fingerprint, status, attempt_no, rows_total, rows_staged,
				rows_promoted, rows_skipped, safe_summary_json
				FROM import_runs WHERE run_fingerprint = ?
				ORDER BY attempt_no DESC LIMIT 1`,
			params: [runFingerprint],
		});
	}

	async createRun(input: CreateImportRunInput): Promise<{ runId: string; attemptNo: number }> {
		assertInstant(input.now, 'now');
		if (input.runId) {
			const existing = await this.getRun(input.runId);
			if (existing) {
				if (
					existing.source_kind !== input.sourceKind ||
					existing.academic_period_id !== input.academicPeriodId ||
					existing.source_hash_sha256 !== input.sourceHashSha256 ||
					existing.run_fingerprint !== input.runFingerprint ||
					existing.status === 'failed'
				) {
					throw new ImportStorageError('IMPORT_RUN_IDEMPOTENCY_CONFLICT');
				}
				return { runId: existing.id, attemptNo: existing.attempt_no };
			}
		}
		const previous = await this.db.first<{ id: string; status: string; attempt_no: number }>({
			sql: `SELECT id, status, attempt_no FROM import_runs
				WHERE run_fingerprint = ? ORDER BY attempt_no DESC LIMIT 1`,
			params: [input.runFingerprint],
		});
		const attemptNo = (previous?.attempt_no ?? 0) + 1;
		const runId = input.runId ?? crypto.randomUUID();
		try {
			await this.db.run({
				sql: `INSERT INTO import_runs
					(id, source_kind, academic_period_id, source_label, source_hash_sha256,
					 source_contract_id, source_contract_version, structural_fingerprint_sha256,
					 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
					 attempt_no, retry_of_run_id, status, started_at, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'staged', ?, ?, ?)`,
				params: [
					runId,
					input.sourceKind,
					input.academicPeriodId,
					input.sourceLabel,
					input.sourceHashSha256,
					input.sourceContractId,
					input.sourceContractVersion,
					input.structuralFingerprintSha256,
					JSON.stringify(input.dependencyHashes),
					input.dependencySetHashSha256,
					input.runFingerprint,
					attemptNo,
					previous?.status === 'failed' ? previous.id : null,
					input.now,
					input.now,
					input.now,
				],
			});
		} catch (cause) {
			throw new ImportStorageError('IMPORT_RUN_CREATE_FAILED', cause);
		}
		return { runId, attemptNo };
	}

	async discardFailedLegacyStaging(input: {
		runId: string;
		sourceKind: 'plusbtext' | 'access';
		operatorId: string;
		now: string;
	}): Promise<void> {
		assertInstant(input.now, 'now');
		assertOperatorId(input.operatorId, 'operatorId');
		const run = await this.getRun(input.runId);
		if (!run || run.source_kind !== input.sourceKind || run.status !== 'failed') {
			throw new ImportStorageError('LEGACY_RELEASE_FAILED_STAGING_INVALID');
		}
		const existingCleanup = await this.db.first<{
			operator_id: string;
			source_kind: 'plusbtext' | 'access';
		}>({
			sql: `SELECT operator_id, source_kind FROM legacy_import_stage_cleanup_events
				WHERE import_run_id = ? AND action = 'discard_failed_staging'`,
			params: [input.runId],
		});
		if (existingCleanup) {
			if (
				existingCleanup.operator_id !== input.operatorId ||
				existingCleanup.source_kind !== input.sourceKind
			) {
				throw new ImportStorageError('LEGACY_RELEASE_FAILED_STAGING_CLEANUP_CONFLICT');
			}
			return;
		}
		const statements: StatementSpec[] = [];
		if (input.sourceKind === 'plusbtext') {
			statements.push(
				{
					sql: `DELETE FROM plusbtext_targets WHERE plusbtext_version_id IN
						(SELECT id FROM plusbtext_versions WHERE import_run_id = ? AND is_published = 0)`,
					params: [input.runId],
				},
				{
					sql: `DELETE FROM plusbtext_old_groups WHERE plusbtext_version_id IN
						(SELECT id FROM plusbtext_versions WHERE import_run_id = ? AND is_published = 0)`,
					params: [input.runId],
				},
				{
					sql: `DELETE FROM plusbtext_versions WHERE import_run_id = ? AND is_published = 0`,
					params: [input.runId],
				}
			);
		} else {
			for (const table of [
				'legacy_snapshot_enrollments',
				'legacy_snapshot_source_rows',
				'legacy_snapshot_children',
				'legacy_snapshot_emails',
				'legacy_snapshot_families',
			]) {
				statements.push({
					sql: `DELETE FROM ${table} WHERE legacy_version_id IN
						(SELECT id FROM legacy_versions WHERE import_run_id = ? AND is_published = 0)`,
					params: [input.runId],
				});
			}
			statements.push({
				sql: `DELETE FROM legacy_versions WHERE import_run_id = ? AND is_published = 0`,
				params: [input.runId],
			});
		}
		statements.push(
			{ sql: `DELETE FROM import_issues WHERE import_run_id = ?`, params: [input.runId] },
			{
				sql: `UPDATE import_runs SET safe_summary_json = ?, updated_at = ?
					WHERE id = ? AND status = 'failed'`,
				params: [safeJson({ stagingDiscarded: true }), input.now, input.runId],
			},
			{
				sql: `INSERT INTO legacy_import_stage_cleanup_events
					(id, import_run_id, source_kind, operator_id, action, created_at)
					VALUES (?, ?, ?, ?, 'discard_failed_staging', ?)`,
				params: [
					`legacy-stage-cleanup:${input.runId}`,
					input.runId,
					input.sourceKind,
					input.operatorId,
					input.now,
				],
			}
		);
		try {
			await this.db.batch(statements);
		} catch (cause) {
			throw new ImportStorageError('LEGACY_RELEASE_FAILED_STAGING_DISCARD_FAILED', cause);
		}
	}

	async failContractRun(input: {
		runId: string;
		issue: ImportIssueDraft;
		now: string;
	}): Promise<void> {
		assertInstant(input.now, 'now');
		await this.db.batch([
			this.issueStatement(input.runId, input.issue, input.now),
			{
				sql: `UPDATE import_runs SET status = 'failed', error_code = ?, finished_at = ?,
					updated_at = ?, safe_summary_json = ? WHERE id = ? AND status = 'staged'`,
				params: [
					input.issue.code,
					input.now,
					input.now,
					safeJson({ issueCounts: issueCounts([input.issue]) }),
					input.runId,
				],
			},
		]);
	}

	private issueStatement(runId: string, issue: ImportIssueDraft, now: string): StatementSpec {
		return {
			sql: `INSERT INTO import_issues
				(id, import_run_id, severity, code, source_record_key, safe_context_json, status, created_at)
				VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
			params: [
				crypto.randomUUID(),
				runId,
				issue.severity,
				issue.code,
				issue.sourceRecordKey ?? null,
				safeJson(issue.safeContext ?? {}),
				now,
			],
		};
	}

	private async insertIssues(
		runId: string,
		issues: ImportIssueDraft[],
		now: string
	): Promise<void> {
		for (const statements of chunk(
			issues.map((issue) => this.issueStatement(runId, issue, now))
		)) {
			if (statements.length) await this.db.batch(statements);
		}
	}

	async stagePrice(input: {
		runId: string;
		period: AcademicPeriodRow;
		snapshot: PriceImportSnapshot;
		now: string;
	}): Promise<StagedImportResult> {
		assertInstant(input.now, 'now');
		const versionId = crypto.randomUUID();
		try {
			await this.db.run({
				sql: `INSERT INTO price_versions
					(id, academic_period_id, import_run_id, label, valid_from,
					 version_hash_sha256, source_headers_json, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					versionId,
					input.period.id,
					input.runId,
					`price:${input.snapshot.versionHashSha256.slice(0, 12)}`,
					input.period.starts_on,
					input.snapshot.versionHashSha256,
					JSON.stringify({
						headerRowNumber: input.snapshot.headerRowNumber,
						columns: input.snapshot.headerColumns,
						yearlySourceColumn: 'Preis',
						monthlySourceColumn: 'Sonderpreis',
					}),
					input.now,
				],
			});

			const ruleStatements = input.snapshot.rules.map<StatementSpec>((rule) => ({
				sql: `INSERT INTO price_rules
					(id, price_version_id, source_record_key, source_row_number, key, normalized_key,
					 duration_raw, subjects_raw, subject_duration_vector_json, duration_total_minutes,
					 children_count, yearly_price_cents, monthly_price_cents, normalized_lookup_key,
					 rule_hash_sha256, provenance_json, is_valid, validation_code, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					crypto.randomUUID(),
					versionId,
					rule.sourceRecordKey,
					rule.sourceRowNumber,
					rule.key,
					rule.normalizedKey,
					rule.durationRaw,
					rule.subjectsRaw,
					rule.subjectDurationVector ? JSON.stringify(rule.subjectDurationVector) : null,
					rule.durationTotalMinutes,
					rule.childrenCount,
					rule.yearlyPriceCents,
					rule.monthlyPriceCents,
					rule.normalizedLookupKey,
					rule.ruleHashSha256,
					JSON.stringify(rule.provenance),
					Number(rule.isValid),
					rule.validationCode,
					input.now,
				],
			}));
			for (const statements of chunk(ruleStatements)) await this.db.batch(statements);
			await this.insertIssues(input.runId, input.snapshot.issues, input.now);

			const diff = await this.diffPrice(input.period.id, input.snapshot);
			const counts = issueCounts(input.snapshot.issues);
			const blocking = input.snapshot.issues.some((issue) => issue.blocksPromotion);
			const rowsPromotable = input.snapshot.rules.filter((rule) => rule.isValid).length;
			const status = blocking ? 'failed' : 'validated';
			await this.db.run({
				sql: `UPDATE import_runs SET status = ?, validated_at = ?, finished_at = ?,
					rows_total = ?, rows_staged = ?, rows_skipped = ?, safe_summary_json = ?,
					error_code = ?, updated_at = ? WHERE id = ? AND status = 'staged'`,
				params: [
					status,
					input.now,
					blocking ? input.now : null,
					input.snapshot.rowsTotal,
					input.snapshot.rowsStaged,
					input.snapshot.rowsSkipped,
					safeJson({
						versionHashSha256: input.snapshot.versionHashSha256,
						diff,
						issueCounts: counts,
						rowsPromotable,
					}),
					blocking ? 'VALIDATION_FAILED' : null,
					input.now,
					input.runId,
				],
			});
			return {
				runId: input.runId,
				versionId,
				versionHashSha256: input.snapshot.versionHashSha256,
				status,
				diff,
				issueCounts: counts,
				rowsPromotable,
			};
		} catch (cause) {
			await this.markRunFailed(input.runId, 'PRICE_STAGE_FAILED', input.now);
			throw new ImportStorageError('PRICE_STAGE_FAILED', cause);
		}
	}

	private async diffPrice(
		academicPeriodId: string,
		snapshot: PriceImportSnapshot
	): Promise<ImportDiffSummary> {
		const current = await this.db.all<{
			normalized_lookup_key: string;
			rule_hash_sha256: string;
		}>({
			sql: `SELECT rule.normalized_lookup_key, rule.rule_hash_sha256
				FROM price_rules AS rule
				JOIN price_versions AS version ON version.id = rule.price_version_id
				WHERE version.academic_period_id = ? AND version.is_active = 1 AND rule.is_valid = 1`,
			params: [academicPeriodId],
		});
		const before = new Map(
			current.results.map((rule) => [rule.normalized_lookup_key, rule.rule_hash_sha256])
		);
		const after = new Map(
			snapshot.rules
				.filter((rule) => rule.isValid && rule.normalizedLookupKey)
				.map((rule) => [rule.normalizedLookupKey!, rule.ruleHashSha256])
		);
		let added = 0;
		let changed = 0;
		let unchanged = 0;
		for (const [key, hash] of after) {
			if (!before.has(key)) added += 1;
			else if (before.get(key) !== hash) changed += 1;
			else unchanged += 1;
		}
		const retired = [...before.keys()].filter((key) => !after.has(key)).length;
		return { added, changed, retired, unchanged };
	}

	async stageSchedule(input: {
		runId: string;
		period: AcademicPeriodRow;
		snapshot: ScheduleImportSnapshot;
		now: string;
	}): Promise<StagedImportResult> {
		assertInstant(input.now, 'now');
		const versionId = crypto.randomUUID();
		try {
			await this.db.run({
				sql: `INSERT INTO schedule_versions
					(id, academic_period_id, import_run_id, schema_version, generation_id,
					 generated_at, version_hash_sha256, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					versionId,
					input.period.id,
					input.runId,
					input.snapshot.schemaVersion,
					input.snapshot.generationId,
					input.snapshot.generatedAt,
					input.snapshot.versionHashSha256,
					input.now,
				],
			});

			const groupIds = new Map<string, string>();
			const groupStatements: StatementSpec[] = [];
			for (const block of input.snapshot.blocks) {
				const groupId = `course_${(await hashCanonical({ period: input.period.id, key: block.sourceOfferingKey })).slice(0, 32)}`;
				groupIds.set(block.sourceOfferingKey, groupId);
				groupStatements.push({
					sql: `INSERT OR IGNORE INTO course_groups
						(id, academic_period_id, source_offering_key, display_name, normalized_price_key,
						 lesson_kind, subject, capacity_default, capacity_override,
						 requires_admin_approval, catalog_status, last_seen_schedule_version_id,
						 retired_at, created_at, updated_at)
						VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, 'draft', NULL, NULL, ?, ?)`,
					params: [
						groupId,
						input.period.id,
						block.sourceOfferingKey,
						block.displayName,
						block.lessonKind,
						block.subject,
						block.capacityDefault,
						Number(block.requiresAdminApproval),
						input.now,
						input.now,
					],
				});
			}
			for (const statements of chunk(groupStatements)) await this.db.batch(statements);

			const sessionStatements = input.snapshot.blocks.map<StatementSpec>((block) => ({
				sql: `INSERT INTO course_sessions
					(id, course_group_id, schedule_version_id, source_namespace, source_block_id,
					 source_block_hash_sha256, display_name_snapshot, lesson_kind_snapshot,
					 subject_snapshot, day_code, start_time, end_time, duration_minutes, timezone,
					 teacher_name, building, room, location_display, is_current, retired_at, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Europe/Berlin', ?, ?, ?, ?, 0, NULL, ?)`,
				params: [
					crypto.randomUUID(),
					groupIds.get(block.sourceOfferingKey)!,
					versionId,
					block.sourceNamespace,
					block.sourceBlockId,
					block.sourceBlockHashSha256,
					block.displayName,
					block.lessonKind,
					block.subject,
					block.dayCode,
					block.startTime,
					block.endTime,
					block.durationMinutes,
					block.teacher,
					block.building,
					block.room,
					block.locationDisplay,
					input.now,
				],
			}));
			for (const statements of chunk(sessionStatements)) await this.db.batch(statements);
			await this.insertIssues(input.runId, input.snapshot.issues, input.now);

			const diff = await this.diffSchedule(input.period.id, input.snapshot);
			const counts = issueCounts(input.snapshot.issues);
			const blocking = input.snapshot.issues.some((issue) => issue.blocksPromotion);
			const status = blocking ? 'failed' : 'validated';
			await this.db.run({
				sql: `UPDATE import_runs SET status = ?, validated_at = ?, finished_at = ?,
					rows_total = ?, rows_staged = ?, rows_skipped = ?, safe_summary_json = ?,
					error_code = ?, updated_at = ? WHERE id = ? AND status = 'staged'`,
				params: [
					status,
					input.now,
					blocking ? input.now : null,
					input.snapshot.rowsTotal,
					input.snapshot.rowsStaged,
					input.snapshot.rowsSkipped,
					safeJson({
						versionHashSha256: input.snapshot.versionHashSha256,
						diff,
						issueCounts: counts,
						htmlComparison: input.snapshot.htmlComparison,
					}),
					blocking ? 'VALIDATION_FAILED' : null,
					input.now,
					input.runId,
				],
			});
			return {
				runId: input.runId,
				versionId,
				versionHashSha256: input.snapshot.versionHashSha256,
				status,
				diff,
				issueCounts: counts,
				rowsPromotable: input.snapshot.blocks.length,
			};
		} catch (cause) {
			await this.markRunFailed(input.runId, 'SCHEDULE_STAGE_FAILED', input.now);
			throw new ImportStorageError('SCHEDULE_STAGE_FAILED', cause);
		}
	}

	private async diffSchedule(
		academicPeriodId: string,
		snapshot: ScheduleImportSnapshot
	): Promise<ImportDiffSummary> {
		const current = await this.db.all<{
			source_block_id: string;
			source_block_hash_sha256: string;
		}>({
			sql: `SELECT session.source_block_id, session.source_block_hash_sha256
				FROM course_sessions AS session
				JOIN schedule_versions AS version ON version.id = session.schedule_version_id
				WHERE version.academic_period_id = ? AND version.is_published = 1
					AND session.is_current = 1`,
			params: [academicPeriodId],
		});
		const before = new Map(
			current.results.map((block) => [block.source_block_id, block.source_block_hash_sha256])
		);
		const after = new Map(
			snapshot.blocks.map((block) => [block.sourceBlockId, block.sourceBlockHashSha256])
		);
		let added = 0;
		let changed = 0;
		let unchanged = 0;
		for (const [key, hash] of after) {
			if (!before.has(key)) added += 1;
			else if (before.get(key) !== hash) changed += 1;
			else unchanged += 1;
		}
		return {
			added,
			changed,
			retired: [...before.keys()].filter((key) => !after.has(key)).length,
			unchanged,
		};
	}

	async stagePlusBText(input: {
		runId: string;
		versionId?: string;
		period: AcademicPeriodRow;
		snapshot: PlusBTextImportSnapshot;
		now: string;
	}): Promise<StagedImportResult> {
		assertInstant(input.now, 'now');
		const versionId = input.versionId ?? crypto.randomUUID();
		try {
			if (input.versionId) {
				const run = await this.getRun(input.runId);
				const existing = await this.versionById('plusbtext', versionId, input.period.id);
				if (
					run?.status === 'validated' &&
					existing?.import_run_id === input.runId &&
					existing.version_hash_sha256 === input.snapshot.versionHashSha256
				) {
					await this.reconciliation.reconcileValidatedImport({
						academicPeriodId: input.period.id,
						sourceKind: 'plusbtext',
						importRunId: input.runId,
						versionId,
						now: input.now,
					});
					return {
						runId: input.runId,
						versionId,
						versionHashSha256: existing.version_hash_sha256,
						status: 'validated',
						diff: await this.diffPlusBText(input.period.id, input.snapshot),
						issueCounts: issueCounts(input.snapshot.issues),
						rowsPromotable:
							input.snapshot.targets.length +
							input.snapshot.oldGroups.filter((old) => old.isValid).length,
						verificationRows: {
							kind: 'plusbtext',
							oldGroups: input.snapshot.oldGroups.length,
							targets: input.snapshot.targets.length,
						},
					};
				}
				if (!run || run.status !== 'staged') {
					throw new ImportStorageError('PLUSB_STAGE_IDEMPOTENCY_CONFLICT');
				}
				await this.db.batch([
					{
						sql: `DELETE FROM plusbtext_targets WHERE plusbtext_version_id = ?`,
						params: [versionId],
					},
					{
						sql: `DELETE FROM plusbtext_old_groups WHERE plusbtext_version_id = ?`,
						params: [versionId],
					},
					{
						sql: `DELETE FROM plusbtext_versions WHERE id = ? AND import_run_id = ? AND is_published = 0`,
						params: [versionId, input.runId],
					},
					{
						sql: `DELETE FROM import_issues WHERE import_run_id = ?`,
						params: [input.runId],
					},
				]);
			}
			const currentFingerprint = await this.db.first<{
				structural_fingerprint_sha256: string;
				logical_shape_fingerprint_sha256: string;
				style_fingerprint_sha256: string;
			}>({
				sql: `SELECT run.structural_fingerprint_sha256,
					version.logical_shape_fingerprint_sha256, version.style_fingerprint_sha256
					FROM plusbtext_versions AS version
					JOIN import_runs AS run ON run.id = version.import_run_id
					WHERE version.academic_period_id = ? AND version.is_published = 1`,
				params: [input.period.id],
			});
			if (
				currentFingerprint &&
				currentFingerprint.structural_fingerprint_sha256 !==
					input.snapshot.structuralFingerprintSha256
			) {
				input.snapshot.issues.push({
					severity: 'fatal',
					code: 'PLUSB_STRUCTURAL_FINGERPRINT_DRIFT',
					safeContext: {},
					blocksPromotion: true,
				});
			}
			if (
				currentFingerprint &&
				currentFingerprint.logical_shape_fingerprint_sha256 !==
					input.snapshot.logicalShapeFingerprintSha256
			) {
				input.snapshot.issues.push({
					severity: 'warning',
					code: 'PLUSB_LOGICAL_SHAPE_DRIFT',
					safeContext: {},
					blocksPromotion: false,
				});
			}
			if (
				currentFingerprint &&
				currentFingerprint.style_fingerprint_sha256 !==
					input.snapshot.styleFingerprintSha256
			) {
				input.snapshot.issues.push({
					severity: 'warning',
					code: 'PLUSB_STYLE_FINGERPRINT_DRIFT',
					safeContext: {},
					blocksPromotion: false,
				});
			}
			await this.db.run({
				sql: `INSERT INTO plusbtext_versions
					(id, academic_period_id, import_run_id, version_hash_sha256,
					 fingerprint_algorithm_version, logical_shape_fingerprint_sha256,
					 style_fingerprint_sha256, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					versionId,
					input.period.id,
					input.runId,
					input.snapshot.versionHashSha256,
					input.snapshot.fingerprintAlgorithmVersion,
					input.snapshot.logicalShapeFingerprintSha256,
					input.snapshot.styleFingerprintSha256,
					input.now,
				],
			});

			const oldStatements = input.snapshot.oldGroups.map<StatementSpec>((old) => ({
				sql: `INSERT INTO plusbtext_old_groups
					(id, plusbtext_version_id, storage_key, source_row_number, old_group_id,
					 group_name_raw, group_name_normalized, record_hash_sha256, is_valid, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					crypto.randomUUID(),
					versionId,
					old.storageKey,
					old.sourceRowNumber,
					old.oldGroupId,
					old.groupNameRaw,
					old.groupNameNormalized,
					old.recordHashSha256,
					Number(old.isValid),
					input.now,
				],
			}));
			for (const statements of chunk(oldStatements)) await this.db.batch(statements);
			const targetStatements = input.snapshot.targets.map<StatementSpec>((target) => ({
				sql: `INSERT INTO plusbtext_targets
					(id, plusbtext_version_id, storage_key, source_row_number, old_group_ids_json,
					 group_name_raw, group_name_normalized, teacher_name, day_raw,
					 duration_minutes, duration_status, record_hash_sha256, is_valid, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					crypto.randomUUID(),
					versionId,
					target.storageKey,
					target.sourceRowNumber,
					JSON.stringify(target.oldGroupIds),
					target.groupNameRaw,
					target.groupNameNormalized,
					target.teacherName,
					target.dayRaw,
					target.durationMinutes,
					target.durationStatus,
					target.recordHashSha256,
					Number(target.isValid),
					input.now,
				],
			}));
			for (const statements of chunk(targetStatements)) await this.db.batch(statements);
			await this.insertIssues(input.runId, input.snapshot.issues, input.now);

			const diff = await this.diffPlusBText(input.period.id, input.snapshot);
			const counts = issueCounts(input.snapshot.issues);
			const blocking = input.snapshot.issues.some((issue) => issue.blocksPromotion);
			const status = blocking ? 'failed' : 'validated';
			const rowsPromotable =
				input.snapshot.targets.length +
				input.snapshot.oldGroups.filter((old) => old.isValid).length;
			await this.db.run({
				sql: `UPDATE import_runs SET status = ?, validated_at = ?, finished_at = ?,
					rows_total = ?, rows_staged = ?, rows_skipped = ?, safe_summary_json = ?,
					error_code = ?, updated_at = ? WHERE id = ? AND status = 'staged'`,
				params: [
					status,
					input.now,
					blocking ? input.now : null,
					input.snapshot.rowsTotal,
					input.snapshot.rowsStaged,
					input.snapshot.rowsSkipped,
					safeJson({
						versionHashSha256: input.snapshot.versionHashSha256,
						fingerprintAlgorithmVersion: input.snapshot.fingerprintAlgorithmVersion,
						logicalShapeFingerprintSha256: input.snapshot.logicalShapeFingerprintSha256,
						styleFingerprintSha256: input.snapshot.styleFingerprintSha256,
						diff,
						issueCounts: counts,
						rowsPromotable,
					}),
					blocking ? 'VALIDATION_FAILED' : null,
					input.now,
					input.runId,
				],
			});
			if (status === 'validated') {
				await this.reconciliation.reconcileValidatedImport({
					academicPeriodId: input.period.id,
					sourceKind: 'plusbtext',
					importRunId: input.runId,
					versionId,
					now: input.now,
				});
			}
			return {
				runId: input.runId,
				versionId,
				versionHashSha256: input.snapshot.versionHashSha256,
				status,
				diff,
				issueCounts: counts,
				rowsPromotable,
				verificationRows: {
					kind: 'plusbtext',
					oldGroups: input.snapshot.oldGroups.length,
					targets: input.snapshot.targets.length,
				},
			};
		} catch (cause) {
			if (isAmbiguousDatabaseDelivery(cause)) throw cause;
			await this.markRunFailed(input.runId, 'PLUSB_STAGE_FAILED', input.now);
			throw new ImportStorageError('PLUSB_STAGE_FAILED', cause);
		}
	}

	private async diffPlusBText(
		academicPeriodId: string,
		snapshot: PlusBTextImportSnapshot
	): Promise<ImportDiffSummary> {
		const current = await this.db.all<{ storage_key: string; record_hash_sha256: string }>({
			sql: `SELECT 'old:' || old.storage_key AS storage_key, old.record_hash_sha256
					FROM plusbtext_old_groups AS old
					JOIN plusbtext_versions AS version ON version.id = old.plusbtext_version_id
					WHERE version.academic_period_id = ? AND version.is_published = 1
					UNION ALL
					SELECT 'target:' || target.storage_key, target.record_hash_sha256
					FROM plusbtext_targets AS target
					JOIN plusbtext_versions AS version ON version.id = target.plusbtext_version_id
					WHERE version.academic_period_id = ? AND version.is_published = 1`,
			params: [academicPeriodId, academicPeriodId],
		});
		const before = new Map(
			current.results.map((row) => [row.storage_key, row.record_hash_sha256])
		);
		const after = new Map([
			...snapshot.oldGroups.map(
				(old) => [`old:${old.storageKey}`, old.recordHashSha256] as const
			),
			...snapshot.targets.map(
				(target) => [`target:${target.storageKey}`, target.recordHashSha256] as const
			),
		]);
		return diffMaps(before, after);
	}

	async loadPlusBTextVersion(input: {
		academicPeriodId: string;
		versionId?: string;
		allowValidatedStaged?: boolean;
	}): Promise<(PlusBTextImportSnapshot & { versionId: string }) | null> {
		const version = await this.db.first<{
			id: string;
			version_hash_sha256: string;
			structural_fingerprint_sha256: string;
			fingerprint_algorithm_version: 1;
			logical_shape_fingerprint_sha256: string;
			style_fingerprint_sha256: string;
		}>({
			sql: `SELECT version.id, version.version_hash_sha256,
				run.structural_fingerprint_sha256, version.fingerprint_algorithm_version,
				version.logical_shape_fingerprint_sha256, version.style_fingerprint_sha256
				FROM plusbtext_versions AS version
				JOIN import_runs AS run ON run.id = version.import_run_id
				WHERE version.academic_period_id = ?
					AND ((? IS NULL AND version.is_published = 1) OR (
						version.id = ? AND (
							EXISTS (
								SELECT 1 FROM legacy_version_promotion_events AS event
								WHERE event.source_kind = 'plusbtext' AND event.version_id = version.id
							) OR (? = 1 AND run.status = 'validated')
						)
					))`,
			params: [
				input.academicPeriodId,
				input.versionId ?? null,
				input.versionId ?? null,
				Number(input.allowValidatedStaged === true),
			],
		});
		if (!version) return null;
		const oldRows = await this.db.all<{
			storage_key: string;
			source_row_number: number;
			old_group_id: number | null;
			group_name_raw: string | null;
			group_name_normalized: string | null;
			record_hash_sha256: string;
			is_valid: number;
		}>({
			sql: `SELECT storage_key, source_row_number, old_group_id, group_name_raw,
				group_name_normalized, record_hash_sha256, is_valid
				FROM plusbtext_old_groups WHERE plusbtext_version_id = ? ORDER BY storage_key`,
			params: [version.id],
		});
		const targetRows = await this.db.all<{
			storage_key: string;
			source_row_number: number;
			old_group_ids_json: string;
			group_name_raw: string;
			group_name_normalized: string;
			teacher_name: string | null;
			day_raw: string | null;
			duration_minutes: number | null;
			duration_status: 'verified' | 'missing' | 'invalid';
			record_hash_sha256: string;
			is_valid: number;
		}>({
			sql: `SELECT storage_key, source_row_number, old_group_ids_json,
				group_name_raw, group_name_normalized, teacher_name, day_raw,
				duration_minutes, duration_status, record_hash_sha256, is_valid
				FROM plusbtext_targets WHERE plusbtext_version_id = ? ORDER BY storage_key`,
			params: [version.id],
		});
		const oldGroups = oldRows.results.map((row) => ({
			storageKey: row.storage_key,
			sourceRowNumber: row.source_row_number,
			oldGroupId: row.old_group_id,
			groupNameRaw: row.group_name_raw,
			groupNameNormalized: row.group_name_normalized,
			recordHashSha256: row.record_hash_sha256,
			isValid: Boolean(row.is_valid),
		}));
		const targets = targetRows.results.map((row) => ({
			storageKey: row.storage_key,
			sourceRowNumber: row.source_row_number,
			oldGroupIds: JSON.parse(row.old_group_ids_json) as number[],
			groupNameRaw: row.group_name_raw,
			groupNameNormalized: row.group_name_normalized,
			teacherName: row.teacher_name,
			dayRaw: row.day_raw,
			durationMinutes: row.duration_minutes,
			durationStatus: row.duration_status,
			recordHashSha256: row.record_hash_sha256,
			isValid: Boolean(row.is_valid),
		}));
		return {
			versionId: version.id,
			sourceContractId: 'admin-xlsm-plusbtext',
			sourceContractVersion: 1,
			fingerprintAlgorithmVersion: version.fingerprint_algorithm_version,
			structuralFingerprintSha256: version.structural_fingerprint_sha256,
			logicalShapeFingerprintSha256: version.logical_shape_fingerprint_sha256,
			styleFingerprintSha256: version.style_fingerprint_sha256,
			versionHashSha256: version.version_hash_sha256,
			oldGroups,
			targets,
			issues: [],
			rowsTotal: oldGroups.length + targets.length,
			rowsStaged: oldGroups.length + targets.length,
			rowsSkipped: oldGroups.filter((old) => !old.isValid).length,
		};
	}

	async stageAccess(input: {
		runId: string;
		versionId?: string;
		period: AcademicPeriodRow;
		snapshot: LegacyImportSnapshot;
		now: string;
	}): Promise<StagedImportResult> {
		assertInstant(input.now, 'now');
		const snapshot = structuredClone(input.snapshot);
		const versionId = input.versionId ?? crypto.randomUUID();
		try {
			if (input.versionId) {
				const run = await this.getRun(input.runId);
				const existing = await this.versionById('access', versionId, input.period.id);
				if (
					run?.status === 'validated' &&
					existing?.import_run_id === input.runId &&
					existing.version_hash_sha256 === snapshot.versionHashSha256
				) {
					await this.reconciliation.reconcileValidatedImport({
						academicPeriodId: input.period.id,
						sourceKind: 'access',
						importRunId: input.runId,
						versionId,
						now: input.now,
					});
					return {
						runId: input.runId,
						versionId,
						versionHashSha256: existing.version_hash_sha256,
						status: 'validated',
						diff: await this.diffAccess(input.period.id, snapshot),
						issueCounts: issueCounts(snapshot.issues),
						rowsPromotable: snapshot.sourceRows.filter((row) => {
							const family = snapshot.families.find(
								(candidate) => candidate.stableFamilyKey === row.stableFamilyKey
							);
							return family?.numberingStatus === 'valid' && row.sourceChildKey;
						}).length,
						verificationRows: accessVerificationRows(snapshot),
					};
				}
				if (!run || run.status !== 'staged') {
					throw new ImportStorageError('ACCESS_STAGE_IDEMPOTENCY_CONFLICT');
				}
				await this.db.batch([
					{
						sql: `DELETE FROM legacy_snapshot_enrollments WHERE legacy_version_id = ?`,
						params: [versionId],
					},
					{
						sql: `DELETE FROM legacy_snapshot_source_rows WHERE legacy_version_id = ?`,
						params: [versionId],
					},
					{
						sql: `DELETE FROM legacy_snapshot_children WHERE legacy_version_id = ?`,
						params: [versionId],
					},
					{
						sql: `DELETE FROM legacy_snapshot_emails WHERE legacy_version_id = ?`,
						params: [versionId],
					},
					{
						sql: `DELETE FROM legacy_snapshot_families WHERE legacy_version_id = ?`,
						params: [versionId],
					},
					{
						sql: `DELETE FROM legacy_versions WHERE id = ? AND import_run_id = ? AND is_published = 0`,
						params: [versionId, input.runId],
					},
					{
						sql: `DELETE FROM import_issues WHERE import_run_id = ?`,
						params: [input.runId],
					},
				]);
			}
			for (const family of snapshot.families.filter(
				(family) => family.numberingStatus === 'valid'
			)) {
				const allocation = await this.db.first<{
					id: string;
					legacy_family_id: string | null;
					origin: string;
				}>({
					sql: `SELECT id, legacy_family_id, origin FROM family_number_allocations
						WHERE namespace = 'legacy_1' AND sequence_number = ?`,
					params: [family.legacySequenceNumber],
				});
				if (
					allocation &&
					(allocation.id !== family.familyNumberId ||
						allocation.origin !== 'legacy' ||
						(allocation.legacy_family_id !== null &&
							allocation.legacy_family_id !== family.legacyFamilyId))
				) {
					family.numberingStatus = 'collision';
					family.familyNumberId = null;
					snapshot.issues.push({
						severity: 'error',
						code: 'ACCESS_FAMILY_NUMBER_COLLISION',
						sourceRecordKey: family.stableFamilyKey,
						safeContext: {},
						blocksPromotion: false,
					});
				}

				const existingFamily = await this.db.first<{
					id: string;
					claimed_by_user_id: string | null;
				}>({
					sql: `SELECT id, claimed_by_user_id FROM legacy_families
						WHERE source_namespace = 'legacy_1' AND source_family_id = ?`,
					params: [family.sourceFamilyId],
				});
				if (!existingFamily) continue;
				const snapshotChildren = snapshot.children.filter(
					(child) => child.stableFamilyKey === family.stableFamilyKey
				);
				for (const child of snapshotChildren) {
					const conflictingBirthDate = await this.db.first<{ id: string }>({
						sql: `SELECT id FROM children WHERE legacy_family_id = ?
							AND source_full_name_normalized = ? AND source_birth_date <> ? LIMIT 1`,
						params: [
							existingFamily.id,
							child.sourceFullNameNormalized,
							child.sourceBirthDate,
						],
					});
					if (conflictingBirthDate) {
						family.continuityNeedsReview = true;
						child.continuityNeedsReview = true;
						snapshot.issues.push({
							severity: 'warning',
							code: 'ACCESS_CONTINUITY_CHILD_IDENTITY_CONFLICT',
							sourceRecordKey: child.sourceChildKey,
							safeContext: {},
							blocksPromotion: false,
						});
					}
				}
				if (existingFamily.claimed_by_user_id) {
					const previousEmails = await this.db.all<{ email_normalized: string }>({
						sql: `SELECT DISTINCT email_normalized FROM legacy_family_emails
							WHERE legacy_family_id = ? AND is_current = 1 AND email_normalized IS NOT NULL`,
						params: [existingFamily.id],
					});
					const before = previousEmails.results.map((row) => row.email_normalized).sort();
					const after = [
						...new Set(
							snapshot.emails
								.filter(
									(email) =>
										email.stableFamilyKey === family.stableFamilyKey &&
										email.emailNormalized
								)
								.map((email) => email.emailNormalized!)
						),
					].sort();
					if (JSON.stringify(before) !== JSON.stringify(after)) {
						family.continuityNeedsReview = true;
						snapshot.issues.push({
							severity: 'warning',
							code: 'ACCESS_CONTINUITY_CLAIMED_CONTACT_CHANGED',
							sourceRecordKey: family.stableFamilyKey,
							safeContext: {},
							blocksPromotion: false,
						});
					}
				}
			}

			for (const family of snapshot.families.filter(
				(family) => family.numberingStatus === 'valid'
			)) {
				const normalizedEmails = [
					...new Set(
						snapshot.emails
							.filter(
								(email) =>
									email.stableFamilyKey === family.stableFamilyKey &&
									email.emailNormalized
							)
							.map((email) => email.emailNormalized!)
					),
				];
				if (!normalizedEmails.length) continue;
				const placeholders = normalizedEmails.map(() => '?').join(', ');
				const conflict = await this.db.first<{ id: string }>({
					sql: `SELECT family.id FROM legacy_family_emails AS email
						JOIN legacy_families AS family ON family.id = email.legacy_family_id
						WHERE email.is_current = 1 AND email.email_normalized IN (${placeholders})
							AND family.id <> ? LIMIT 1`,
					params: [...normalizedEmails, family.legacyFamilyId],
				});
				if (conflict) {
					family.continuityNeedsReview = true;
					snapshot.issues.push({
						severity: 'warning',
						code: 'ACCESS_CONTINUITY_FAMILY_ID_CONFLICT',
						sourceRecordKey: family.stableFamilyKey,
						safeContext: {},
						blocksPromotion: false,
					});
				}
			}

			await this.db.run({
				sql: `INSERT INTO legacy_versions
					(id, academic_period_id, import_run_id, plusbtext_version_id,
					 version_hash_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
				params: [
					versionId,
					input.period.id,
					input.runId,
					snapshot.plusBTextVersionId,
					snapshot.versionHashSha256,
					input.now,
				],
			});

			const familyStatements = snapshot.families.map<StatementSpec>((family) => ({
				sql: `INSERT INTO legacy_snapshot_families
					(id, legacy_version_id, stable_family_key, legacy_family_id,
					 source_family_id, family_number_id, legacy_sequence_number, numbering_status,
					 parent_name_raw, parent_first_name_normalized, parent_last_name_normalized,
					 parent_name_match_status, parent_name_normalizer_version,
					 continuity_needs_review, address_raw, phone_raw, mobile_raw,
					 record_hash_sha256, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					crypto.randomUUID(),
					versionId,
					family.stableFamilyKey,
					family.legacyFamilyId,
					family.sourceFamilyId,
					family.familyNumberId,
					family.legacySequenceNumber,
					family.numberingStatus,
					family.parentNameRaw,
					family.parentFirstNameNormalized,
					family.parentLastNameNormalized,
					family.parentNameMatchStatus,
					family.parentNameNormalizerVersion,
					Number(family.continuityNeedsReview),
					family.addressRaw,
					family.phoneRaw,
					family.mobileRaw,
					family.recordHashSha256,
					input.now,
				],
			}));
			for (const statements of chunk(familyStatements)) await this.db.batch(statements);
			const emailStatements = snapshot.emails.map<StatementSpec>((email) => ({
				sql: `INSERT INTO legacy_snapshot_emails
					(id, legacy_version_id, legacy_email_id, stable_family_key, email_raw, email_normalized,
					 source_access_id, record_hash_sha256, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					crypto.randomUUID(),
					versionId,
					email.id,
					email.stableFamilyKey,
					email.emailRaw,
					email.emailNormalized,
					email.sourceAccessId,
					email.recordHashSha256,
					input.now,
				],
			}));
			for (const statements of chunk(emailStatements)) await this.db.batch(statements);
			const childStatements = snapshot.children.map<StatementSpec>((child) => ({
				sql: `INSERT INTO legacy_snapshot_children
					(id, legacy_version_id, stable_family_key, legacy_child_id, source_child_key,
					 source_full_name, source_full_name_normalized, source_birth_date,
					 continuity_needs_review, record_hash_sha256, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					crypto.randomUUID(),
					versionId,
					child.stableFamilyKey,
					child.legacyChildId,
					child.sourceChildKey,
					child.sourceFullName,
					child.sourceFullNameNormalized,
					child.sourceBirthDate,
					Number(child.continuityNeedsReview),
					child.recordHashSha256,
					input.now,
				],
			}));
			for (const statements of chunk(childStatements)) await this.db.batch(statements);
			const sourceRowStatements = snapshot.sourceRows.map<StatementSpec>((row) => ({
				sql: `INSERT INTO legacy_snapshot_source_rows
					(id, legacy_version_id, legacy_source_row_id, source_namespace, source_access_id, source_record_key,
					 stable_family_key, source_child_key, value48_mirror, source_hash_sha256,
					 source_values_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					crypto.randomUUID(),
					versionId,
					row.id,
					row.sourceNamespace,
					row.sourceAccessId,
					row.sourceRecordKey,
					row.stableFamilyKey,
					row.sourceChildKey,
					row.value48Mirror,
					row.sourceHashSha256,
					JSON.stringify(row.sourceValues),
					input.now,
				],
			}));
			for (const statements of chunk(sourceRowStatements)) await this.db.batch(statements);
			const enrollmentStatements = snapshot.enrollments.map<StatementSpec>((enrollment) => ({
				sql: `INSERT INTO legacy_snapshot_enrollments
					(id, legacy_version_id, legacy_enrollment_id, source_access_id, stable_family_key, source_child_key,
					 source_slot, source_record_key, group_name_raw, group_name_normalized,
					 teacher_name, day_raw, duration_minutes, duration_status, status_code_raw, lesson_kind,
					 contract_kind, price_source, price_mode, planned_price_cents, notes_raw,
					 needs_admin_review, record_hash_sha256, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					crypto.randomUUID(),
					versionId,
					enrollment.id,
					enrollment.sourceAccessId,
					enrollment.stableFamilyKey,
					enrollment.sourceChildKey,
					enrollment.sourceSlot,
					enrollment.sourceRecordKey,
					enrollment.groupNameRaw,
					enrollment.groupNameNormalized,
					enrollment.teacherName,
					enrollment.dayRaw,
					enrollment.durationMinutes,
					enrollment.durationStatus,
					enrollment.statusCodeRaw,
					enrollment.lessonKind,
					enrollment.contractKind,
					enrollment.priceSource,
					enrollment.priceMode,
					enrollment.plannedPriceCents,
					enrollment.notesRaw,
					Number(enrollment.needsAdminReview),
					enrollment.recordHashSha256,
					input.now,
				],
			}));
			for (const statements of chunk(enrollmentStatements)) await this.db.batch(statements);
			await this.insertIssues(input.runId, snapshot.issues, input.now);

			const diff = await this.diffAccess(input.period.id, snapshot);
			const counts = issueCounts(snapshot.issues);
			const blocking = snapshot.issues.some((issue) => issue.blocksPromotion);
			const status = blocking ? 'failed' : 'validated';
			const rowsPromotable = snapshot.sourceRows.filter((row) => {
				const family = snapshot.families.find(
					(candidate) => candidate.stableFamilyKey === row.stableFamilyKey
				);
				return family?.numberingStatus === 'valid' && row.sourceChildKey;
			}).length;
			await this.db.run({
				sql: `UPDATE import_runs SET status = ?, validated_at = ?, finished_at = ?,
					rows_total = ?, rows_staged = ?, rows_skipped = ?, safe_summary_json = ?,
					error_code = ?, updated_at = ? WHERE id = ? AND status = 'staged'`,
				params: [
					status,
					input.now,
					blocking ? input.now : null,
					snapshot.rowsTotal,
					snapshot.rowsStaged,
					snapshot.rowsSkipped,
					safeJson({
						versionHashSha256: snapshot.versionHashSha256,
						plusBTextVersionHashSha256: snapshot.plusBTextVersionHashSha256,
						diff,
						issueCounts: counts,
						rowsPromotable,
						families: {
							staged: snapshot.families.length,
							canonicalEligible: snapshot.families.filter(
								(family) => family.numberingStatus === 'valid'
							).length,
						},
						children: snapshot.children.length,
						enrollments: snapshot.enrollments.length,
					}),
					blocking ? 'VALIDATION_FAILED' : null,
					input.now,
					input.runId,
				],
			});
			if (status === 'validated') {
				await this.reconciliation.reconcileValidatedImport({
					academicPeriodId: input.period.id,
					sourceKind: 'access',
					importRunId: input.runId,
					versionId,
					now: input.now,
				});
			}
			return {
				runId: input.runId,
				versionId,
				versionHashSha256: snapshot.versionHashSha256,
				status,
				diff,
				issueCounts: counts,
				rowsPromotable,
				verificationRows: accessVerificationRows(snapshot),
			};
		} catch (cause) {
			if (isAmbiguousDatabaseDelivery(cause)) throw cause;
			await this.markRunFailed(input.runId, 'ACCESS_STAGE_FAILED', input.now);
			throw new ImportStorageError('ACCESS_STAGE_FAILED', cause);
		}
	}

	private async diffAccess(
		academicPeriodId: string,
		snapshot: LegacyImportSnapshot
	): Promise<ImportDiffSummary> {
		const current = await this.db.all<{
			source_access_id: number;
			source_hash: string;
		}>({
			sql: `SELECT source_access_id, source_hash FROM legacy_source_rows
				WHERE academic_period_id = ? AND source_namespace = 'legacy_1' AND is_current = 1`,
			params: [academicPeriodId],
		});
		const before = new Map(
			current.results.map((row) => [String(row.source_access_id), row.source_hash])
		);
		const after = new Map(
			snapshot.sourceRows.map((row) => [String(row.sourceAccessId), row.sourceHashSha256])
		);
		return diffMaps(before, after);
	}

	private legacyProjectionStatements(input: {
		academicPeriodId: string;
		versionId: string;
		runId: string;
		now: string;
	}): StatementSpec[] {
		return [
			{
				sql: `UPDATE legacy_family_periods SET is_current = 0, retired_at = ?, updated_at = ?
					WHERE academic_period_id = ? AND is_current = 1`,
				params: [input.now, input.now, input.academicPeriodId],
			},
			{
				sql: `UPDATE legacy_family_emails SET is_current = 0, updated_at = ?
					WHERE legacy_family_period_id IN (
						SELECT id FROM legacy_family_periods WHERE academic_period_id = ?
					)`,
				params: [input.now, input.academicPeriodId],
			},
			{
				sql: `UPDATE legacy_source_rows SET is_current = 0, retired_at = ?, updated_at = ?
					WHERE source_namespace = 'legacy_1' AND academic_period_id = ? AND is_current = 1`,
				params: [input.now, input.now, input.academicPeriodId],
			},
			{
				sql: `UPDATE legacy_enrollments SET is_current = 0, retired_at = ?, updated_at = ?,
					needs_admin_review = CASE WHEN course_group_id IS NOT NULL THEN 1 ELSE needs_admin_review END
					WHERE academic_period_id = ? AND is_current = 1`,
				params: [input.now, input.now, input.academicPeriodId],
			},
			{
				sql: `INSERT OR IGNORE INTO family_number_allocations
					(id, namespace, sequence_number, display_family_id, legacy_family_id,
					 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
					 created_at, updated_at)
					SELECT family_number_id, 'legacy_1', legacy_sequence_number, source_family_id,
						legacy_family_id, NULL, 'legacy', 'assigned', ?, NULL, ?, ?
					FROM legacy_snapshot_families
					WHERE legacy_version_id = ? AND numbering_status = 'valid'
						AND family_number_id IS NOT NULL`,
				params: [input.now, input.now, input.now, input.versionId],
			},
			{
				sql: `INSERT OR IGNORE INTO legacy_families
					(id, source_namespace, source_family_id, family_number_id, numbering_status,
					 claimed_by_user_id, claimed_at, continuity_status, created_at, updated_at)
					SELECT legacy_family_id, 'legacy_1', source_family_id, family_number_id, 'valid',
						NULL, NULL, CASE WHEN continuity_needs_review = 1 THEN 'needs_review' ELSE 'stable' END,
						?, ?
					FROM legacy_snapshot_families
					WHERE legacy_version_id = ? AND numbering_status = 'valid'
						AND family_number_id IS NOT NULL`,
				params: [input.now, input.now, input.versionId],
			},
			{
				sql: `UPDATE legacy_families SET updated_at = ?,
					continuity_status = CASE
						WHEN continuity_status = 'corrected' THEN continuity_status
						WHEN EXISTS (
							SELECT 1 FROM legacy_snapshot_families AS snapshot
							WHERE snapshot.legacy_version_id = ?
								AND snapshot.legacy_family_id = legacy_families.id
								AND snapshot.continuity_needs_review = 1
						) THEN 'needs_review'
						ELSE continuity_status END
					WHERE EXISTS (
						SELECT 1 FROM legacy_snapshot_families AS snapshot
						WHERE snapshot.legacy_version_id = ?
							AND snapshot.legacy_family_id = legacy_families.id
							AND snapshot.numbering_status = 'valid'
					)`,
				params: [input.now, input.versionId, input.versionId],
			},
			{
				sql: `INSERT OR IGNORE INTO legacy_family_periods
					(id, legacy_family_id, academic_period_id, import_run_id, parent_name_raw,
					 parent_first_name_normalized, parent_last_name_normalized,
					 parent_name_match_status, parent_name_normalizer_version,
					 address_raw, phone_raw, mobile_raw, last_seen_run_id, is_current,
					 retired_at, created_at, updated_at)
					SELECT 'legacy_family_period:' || legacy_family_id || ':' || ?, legacy_family_id,
						?, ?, parent_name_raw, parent_first_name_normalized,
						parent_last_name_normalized, parent_name_match_status,
						parent_name_normalizer_version, address_raw, phone_raw, mobile_raw,
						?, 1, NULL, ?, ?
					FROM legacy_snapshot_families
					WHERE legacy_version_id = ? AND numbering_status = 'valid'`,
				params: [
					input.academicPeriodId,
					input.academicPeriodId,
					input.runId,
					input.runId,
					input.now,
					input.now,
					input.versionId,
				],
			},
			{
				sql: `UPDATE legacy_family_periods SET
					import_run_id = ?,
					parent_name_raw = (SELECT snapshot.parent_name_raw FROM legacy_snapshot_families AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_family_id = legacy_family_periods.legacy_family_id),
					parent_first_name_normalized = (SELECT snapshot.parent_first_name_normalized FROM legacy_snapshot_families AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_family_id = legacy_family_periods.legacy_family_id),
					parent_last_name_normalized = (SELECT snapshot.parent_last_name_normalized FROM legacy_snapshot_families AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_family_id = legacy_family_periods.legacy_family_id),
					parent_name_match_status = (SELECT snapshot.parent_name_match_status FROM legacy_snapshot_families AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_family_id = legacy_family_periods.legacy_family_id),
					parent_name_normalizer_version = (SELECT snapshot.parent_name_normalizer_version FROM legacy_snapshot_families AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_family_id = legacy_family_periods.legacy_family_id),
					address_raw = (SELECT snapshot.address_raw FROM legacy_snapshot_families AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_family_id = legacy_family_periods.legacy_family_id),
					phone_raw = (SELECT snapshot.phone_raw FROM legacy_snapshot_families AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_family_id = legacy_family_periods.legacy_family_id),
					mobile_raw = (SELECT snapshot.mobile_raw FROM legacy_snapshot_families AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_family_id = legacy_family_periods.legacy_family_id),
					last_seen_run_id = ?, is_current = 1, retired_at = NULL, updated_at = ?
					WHERE academic_period_id = ? AND EXISTS (
						SELECT 1 FROM legacy_snapshot_families AS snapshot
						WHERE snapshot.legacy_version_id = ?
							AND snapshot.legacy_family_id = legacy_family_periods.legacy_family_id
							AND snapshot.numbering_status = 'valid'
					)`,
				params: [
					input.runId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.runId,
					input.now,
					input.academicPeriodId,
					input.versionId,
				],
			},
			{
				sql: `INSERT OR IGNORE INTO legacy_family_emails
					(id, legacy_family_id, legacy_family_period_id, email_raw, email_normalized,
					 source_access_id, last_seen_run_id, is_current, created_at, updated_at)
					SELECT email.legacy_email_id, family.legacy_family_id,
						'legacy_family_period:' || family.legacy_family_id || ':' || ?,
						email.email_raw, email.email_normalized, email.source_access_id,
						?, 1, ?, ?
					FROM legacy_snapshot_emails AS email
					JOIN legacy_snapshot_families AS family
						ON family.legacy_version_id = email.legacy_version_id
						AND family.stable_family_key = email.stable_family_key
					WHERE email.legacy_version_id = ? AND family.numbering_status = 'valid'`,
				params: [
					input.academicPeriodId,
					input.runId,
					input.now,
					input.now,
					input.versionId,
				],
			},
			{
				sql: `UPDATE legacy_family_emails SET
					email_normalized = (SELECT email.email_normalized FROM legacy_snapshot_emails AS email
						WHERE email.legacy_version_id = ? AND email.legacy_email_id = legacy_family_emails.id),
					source_access_id = (SELECT email.source_access_id FROM legacy_snapshot_emails AS email
						WHERE email.legacy_version_id = ? AND email.legacy_email_id = legacy_family_emails.id),
					last_seen_run_id = ?, is_current = 1, updated_at = ?
					WHERE EXISTS (SELECT 1 FROM legacy_snapshot_emails AS email
						WHERE email.legacy_version_id = ? AND email.legacy_email_id = legacy_family_emails.id)`,
				params: [input.versionId, input.versionId, input.runId, input.now, input.versionId],
			},
			{
				sql: `INSERT OR IGNORE INTO children
					(id, owner_user_id, legacy_family_id, family_number_id, origin,
					 source_child_key, source_full_name, source_full_name_normalized,
					 source_birth_date, full_name_override, birth_date_override,
					 full_name, full_name_normalized, birth_date, last_seen_run_id,
					 is_current, created_at, updated_at)
					SELECT child.legacy_child_id,
						CASE WHEN child.continuity_needs_review = 1 THEN NULL
							ELSE (SELECT claimed_by_user_id FROM legacy_families
								WHERE id = family.legacy_family_id) END,
						family.legacy_family_id,
						family.family_number_id, 'legacy', child.source_child_key,
						child.source_full_name, child.source_full_name_normalized,
						child.source_birth_date, NULL, NULL, child.source_full_name,
						child.source_full_name_normalized, child.source_birth_date,
						?, 1, ?, ?
					FROM legacy_snapshot_children AS child
					JOIN legacy_snapshot_families AS family
						ON family.legacy_version_id = child.legacy_version_id
						AND family.stable_family_key = child.stable_family_key
					WHERE child.legacy_version_id = ? AND family.numbering_status = 'valid'`,
				params: [input.runId, input.now, input.now, input.versionId],
			},
			{
				sql: `UPDATE children SET
					source_full_name = (SELECT snapshot.source_full_name FROM legacy_snapshot_children AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_child_id = children.id),
					source_full_name_normalized = (SELECT snapshot.source_full_name_normalized FROM legacy_snapshot_children AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_child_id = children.id),
					source_birth_date = (SELECT snapshot.source_birth_date FROM legacy_snapshot_children AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_child_id = children.id),
					full_name = CASE WHEN full_name_override IS NOT NULL THEN full_name_override
						ELSE (SELECT snapshot.source_full_name FROM legacy_snapshot_children AS snapshot
							WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_child_id = children.id) END,
					full_name_normalized = CASE WHEN full_name_override IS NOT NULL THEN full_name_normalized
						ELSE (SELECT snapshot.source_full_name_normalized FROM legacy_snapshot_children AS snapshot
							WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_child_id = children.id) END,
					birth_date = CASE WHEN birth_date_override IS NOT NULL THEN birth_date_override
						ELSE (SELECT snapshot.source_birth_date FROM legacy_snapshot_children AS snapshot
							WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_child_id = children.id) END,
					last_seen_run_id = ?, is_current = 1, updated_at = ?
					WHERE origin = 'legacy' AND EXISTS (
						SELECT 1 FROM legacy_snapshot_children AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_child_id = children.id
					)`,
				params: [
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.runId,
					input.now,
					input.versionId,
				],
			},
			{
				sql: `INSERT OR IGNORE INTO legacy_source_rows
					(id, source_namespace, academic_period_id, source_access_id, value48_mirror,
					 legacy_family_id, child_id, import_run_id, source_hash, source_values_json,
					 last_seen_run_id, is_current, retired_at, created_at, updated_at)
					SELECT source.legacy_source_row_id, source.source_namespace, ?, source.source_access_id,
						source.value48_mirror,
						(SELECT family.legacy_family_id FROM legacy_snapshot_families AS family
							WHERE family.legacy_version_id = source.legacy_version_id
								AND family.stable_family_key = source.stable_family_key
								AND family.numbering_status = 'valid'),
						(SELECT child.legacy_child_id FROM legacy_snapshot_children AS child
							JOIN legacy_snapshot_families AS family
								ON family.legacy_version_id = child.legacy_version_id
								AND family.stable_family_key = child.stable_family_key
							WHERE child.legacy_version_id = source.legacy_version_id
								AND child.source_child_key = source.source_child_key
								AND family.numbering_status = 'valid'),
						?, source.source_hash_sha256, source.source_values_json, ?, 1, NULL, ?, ?
					FROM legacy_snapshot_source_rows AS source WHERE source.legacy_version_id = ?`,
				params: [
					input.academicPeriodId,
					input.runId,
					input.runId,
					input.now,
					input.now,
					input.versionId,
				],
			},
			{
				sql: `UPDATE legacy_source_rows SET
					value48_mirror = (SELECT source.value48_mirror FROM legacy_snapshot_source_rows AS source
						WHERE source.legacy_version_id = ? AND source.legacy_source_row_id = legacy_source_rows.id),
					legacy_family_id = (SELECT family.legacy_family_id
						FROM legacy_snapshot_source_rows AS source
						LEFT JOIN legacy_snapshot_families AS family
							ON family.legacy_version_id = source.legacy_version_id
							AND family.stable_family_key = source.stable_family_key
							AND family.numbering_status = 'valid'
						WHERE source.legacy_version_id = ? AND source.legacy_source_row_id = legacy_source_rows.id),
					child_id = (SELECT child.legacy_child_id
						FROM legacy_snapshot_source_rows AS source
						JOIN legacy_snapshot_children AS child
							ON child.legacy_version_id = source.legacy_version_id
							AND child.source_child_key = source.source_child_key
						JOIN legacy_snapshot_families AS family
							ON family.legacy_version_id = child.legacy_version_id
							AND family.stable_family_key = child.stable_family_key
							AND family.numbering_status = 'valid'
						WHERE source.legacy_version_id = ? AND source.legacy_source_row_id = legacy_source_rows.id),
					import_run_id = ?,
					source_hash = (SELECT source.source_hash_sha256 FROM legacy_snapshot_source_rows AS source
						WHERE source.legacy_version_id = ? AND source.legacy_source_row_id = legacy_source_rows.id),
					source_values_json = (SELECT source.source_values_json FROM legacy_snapshot_source_rows AS source
						WHERE source.legacy_version_id = ? AND source.legacy_source_row_id = legacy_source_rows.id),
					last_seen_run_id = ?, is_current = 1, retired_at = NULL, updated_at = ?
					WHERE academic_period_id = ? AND EXISTS (
						SELECT 1 FROM legacy_snapshot_source_rows AS source
						WHERE source.legacy_version_id = ? AND source.legacy_source_row_id = legacy_source_rows.id
					)`,
				params: [
					input.versionId,
					input.versionId,
					input.versionId,
					input.runId,
					input.versionId,
					input.versionId,
					input.runId,
					input.now,
					input.academicPeriodId,
					input.versionId,
				],
			},
			{
				sql: `INSERT OR IGNORE INTO legacy_enrollments
					(id, legacy_source_row_id, legacy_family_id, child_id, academic_period_id,
					 source_slot, source_record_key, group_name_raw, group_name_normalized,
					 course_group_id, teacher_name, day_raw, duration_minutes, duration_status, status_code_raw,
					 lesson_kind, contract_kind, price_source, price_mode, planned_price_cents,
					 notes_raw, needs_admin_review, is_active_for_occupancy,
					 represented_by_enrollment_id, last_seen_run_id, is_current, retired_at,
					 created_at, updated_at)
					SELECT enrollment.legacy_enrollment_id, source.id, family.legacy_family_id, child.legacy_child_id, ?,
						enrollment.source_slot, enrollment.source_record_key,
						enrollment.group_name_raw, enrollment.group_name_normalized,
						(SELECT mapping.course_group_id FROM course_source_mappings AS mapping
							WHERE mapping.academic_period_id = ? AND mapping.source_kind = 'access'
								AND mapping.source_value_normalized = enrollment.group_name_normalized
								AND mapping.status = 'confirmed' LIMIT 1),
						enrollment.teacher_name, enrollment.day_raw, enrollment.duration_minutes,
						enrollment.duration_status,
						enrollment.status_code_raw, enrollment.lesson_kind,
						enrollment.contract_kind, enrollment.price_source, enrollment.price_mode,
						enrollment.planned_price_cents, enrollment.notes_raw,
						enrollment.needs_admin_review,
						CASE WHEN enrollment.lesson_kind IN ('group', 'dance_group')
							AND enrollment.contract_kind IN ('yearly', 'monthly')
							AND upper(trim(coalesce(enrollment.status_code_raw, ''))) <> 'KN'
							AND EXISTS (SELECT 1 FROM course_source_mappings AS mapping
								WHERE mapping.academic_period_id = ? AND mapping.source_kind = 'access'
									AND mapping.source_value_normalized = enrollment.group_name_normalized
									AND mapping.status = 'confirmed')
						THEN 1 ELSE 0 END,
						NULL, ?, 1, NULL, ?, ?
					FROM legacy_snapshot_enrollments AS enrollment
					JOIN legacy_snapshot_families AS family
						ON family.legacy_version_id = enrollment.legacy_version_id
						AND family.stable_family_key = enrollment.stable_family_key
						AND family.numbering_status = 'valid'
					JOIN legacy_snapshot_children AS child
						ON child.legacy_version_id = enrollment.legacy_version_id
						AND child.source_child_key = enrollment.source_child_key
					JOIN legacy_source_rows AS source
						ON source.academic_period_id = ?
						AND source.source_namespace = 'legacy_1'
						AND source.source_access_id = enrollment.source_access_id
					WHERE enrollment.legacy_version_id = ?`,
				params: [
					input.academicPeriodId,
					input.academicPeriodId,
					input.academicPeriodId,
					input.runId,
					input.now,
					input.now,
					input.academicPeriodId,
					input.versionId,
				],
			},
			{
					sql: `UPDATE legacy_enrollments SET
					course_group_id = (SELECT mapping.course_group_id
						FROM legacy_snapshot_enrollments AS snapshot
						JOIN course_source_mappings AS mapping
							ON mapping.academic_period_id = legacy_enrollments.academic_period_id
							AND mapping.source_kind = 'access'
							AND mapping.source_value_normalized = snapshot.group_name_normalized
							AND mapping.status = 'confirmed'
						WHERE snapshot.legacy_version_id = ?
							AND snapshot.legacy_enrollment_id = legacy_enrollments.id LIMIT 1),
					group_name_raw = (SELECT snapshot.group_name_raw FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					group_name_normalized = (SELECT snapshot.group_name_normalized FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					teacher_name = (SELECT snapshot.teacher_name FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					day_raw = (SELECT snapshot.day_raw FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					duration_minutes = (SELECT snapshot.duration_minutes FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					duration_status = (SELECT snapshot.duration_status FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					status_code_raw = (SELECT snapshot.status_code_raw FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					lesson_kind = (SELECT snapshot.lesson_kind FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					contract_kind = (SELECT snapshot.contract_kind FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					price_source = (SELECT snapshot.price_source FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					price_mode = CASE WHEN price_mode = 'manual_override' THEN price_mode
						ELSE (SELECT snapshot.price_mode FROM legacy_snapshot_enrollments AS snapshot
							WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id) END,
					planned_price_cents = (SELECT snapshot.planned_price_cents FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					notes_raw = (SELECT snapshot.notes_raw FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					needs_admin_review = (SELECT snapshot.needs_admin_review FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id),
					is_active_for_occupancy = CASE WHEN EXISTS (
						SELECT 1 FROM legacy_snapshot_enrollments AS snapshot
						JOIN course_source_mappings AS mapping
							ON mapping.academic_period_id = legacy_enrollments.academic_period_id
							AND mapping.source_kind = 'access'
							AND mapping.source_value_normalized = snapshot.group_name_normalized
							AND mapping.status = 'confirmed'
						WHERE snapshot.legacy_version_id = ?
							AND snapshot.legacy_enrollment_id = legacy_enrollments.id
							AND snapshot.lesson_kind IN ('group', 'dance_group')
							AND snapshot.contract_kind IN ('yearly', 'monthly')
							AND upper(trim(coalesce(snapshot.status_code_raw, ''))) <> 'KN'
					) THEN 1 ELSE 0 END,
					represented_by_enrollment_id = CASE WHEN group_name_normalized =
						(SELECT snapshot.group_name_normalized
							FROM legacy_snapshot_enrollments AS snapshot
							WHERE snapshot.legacy_version_id = ?
								AND snapshot.legacy_enrollment_id = legacy_enrollments.id)
					THEN represented_by_enrollment_id ELSE NULL END,
					last_seen_run_id = ?, is_current = 1, retired_at = NULL, updated_at = ?
					WHERE academic_period_id = ? AND EXISTS (
						SELECT 1 FROM legacy_snapshot_enrollments AS snapshot
						WHERE snapshot.legacy_version_id = ? AND snapshot.legacy_enrollment_id = legacy_enrollments.id
					)`,
				params: [
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.runId,
					input.now,
					input.academicPeriodId,
					input.versionId,
				],
			},
			{
				sql: `UPDATE children SET is_current = 0, updated_at = ?
					WHERE origin = 'legacy' AND is_current = 1 AND NOT EXISTS (
						SELECT 1 FROM legacy_source_rows AS source
						WHERE source.child_id = children.id AND source.is_current = 1
					)`,
				params: [input.now],
			},
		];
	}

	private scheduleProjectionStatements(input: {
		academicPeriodId: string;
		versionId: string;
		now: string;
	}): StatementSpec[] {
		return [
			{
				sql: `UPDATE course_sessions SET is_current = 0, retired_at = ?
					WHERE is_current = 1 AND course_group_id IN
						(SELECT id FROM course_groups WHERE academic_period_id = ?)`,
				params: [input.now, input.academicPeriodId],
			},
			{
				sql: `UPDATE course_groups SET
					display_name = (SELECT display_name_snapshot FROM course_sessions
						WHERE course_group_id = course_groups.id AND schedule_version_id = ? LIMIT 1),
					lesson_kind = (SELECT lesson_kind_snapshot FROM course_sessions
						WHERE course_group_id = course_groups.id AND schedule_version_id = ? LIMIT 1),
					subject = (SELECT subject_snapshot FROM course_sessions
						WHERE course_group_id = course_groups.id AND schedule_version_id = ? LIMIT 1),
					capacity_default = CASE
						WHEN (SELECT lesson_kind_snapshot FROM course_sessions
							WHERE course_group_id = course_groups.id AND schedule_version_id = ? LIMIT 1) = 'dance_group' THEN 15
						WHEN (SELECT lesson_kind_snapshot FROM course_sessions
							WHERE course_group_id = course_groups.id AND schedule_version_id = ? LIMIT 1) = 'group' THEN 12
						WHEN (SELECT lesson_kind_snapshot FROM course_sessions
							WHERE course_group_id = course_groups.id AND schedule_version_id = ? LIMIT 1)
							IN ('nachhilfe', 'individual') THEN 1
						ELSE NULL END,
					requires_admin_approval = CASE
						WHEN (SELECT lesson_kind_snapshot FROM course_sessions
							WHERE course_group_id = course_groups.id AND schedule_version_id = ? LIMIT 1)
							IN ('group', 'dance_group') THEN 0 ELSE 1 END,
					catalog_status = CASE
						WHEN (SELECT lesson_kind_snapshot FROM course_sessions
							WHERE course_group_id = course_groups.id AND schedule_version_id = ? LIMIT 1) = 'needs_review'
							THEN 'needs_review' ELSE 'published' END,
					last_seen_schedule_version_id = ?, retired_at = NULL, updated_at = ?
					WHERE academic_period_id = ? AND EXISTS (
						SELECT 1 FROM course_sessions WHERE course_group_id = course_groups.id
							AND schedule_version_id = ?
					)`,
				params: [
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.versionId,
					input.now,
					input.academicPeriodId,
					input.versionId,
				],
			},
			{
				sql: `UPDATE course_groups SET catalog_status = 'retired', retired_at = ?, updated_at = ?
					WHERE academic_period_id = ? AND last_seen_schedule_version_id IS NOT NULL
						AND NOT EXISTS (
							SELECT 1 FROM course_sessions WHERE course_group_id = course_groups.id
								AND schedule_version_id = ?
						)`,
				params: [input.now, input.now, input.academicPeriodId, input.versionId],
			},
			{
				sql: `UPDATE course_sessions SET is_current = 1, retired_at = NULL
					WHERE schedule_version_id = ?`,
				params: [input.versionId],
			},
		];
	}

	async createLegacyReleasePlan(
		input: CreateLegacyReleasePlanInput
	): Promise<LegacyReleasePlanRow> {
		assertInstant(input.now, 'now');
		assertOperatorId(input.plannedBy, 'plannedBy');
		assertOperatorId(input.stagedBy, 'stagedBy');
		if (input.plannedBy === input.stagedBy) {
			throw new ImportStorageError('LEGACY_RELEASE_OPERATOR_SEPARATION_REQUIRED');
		}
		assertVerificationContract(input.verificationContract);
		if (
			Boolean(input.expectedCurrentPlusBTextVersionId) !==
			Boolean(input.expectedCurrentAccessVersionId)
		) {
			throw new ImportStorageError('LEGACY_RELEASE_EXPECTED_CURRENT_PAIR_INVALID');
		}
		const plusRun = await this.getRun(input.plusBTextRunId);
		const accessRun = await this.getRun(input.accessRunId);
		const plusVersion = await this.versionById(
			'plusbtext',
			input.plusBTextVersionId,
			input.academicPeriodId
		);
		const accessVersion = await this.versionById(
			'access',
			input.accessVersionId,
			input.academicPeriodId
		);
		if (
			!plusRun ||
			!accessRun ||
			!plusVersion ||
			!accessVersion ||
			plusRun.status !== 'validated' ||
			accessRun.status !== 'validated' ||
			plusRun.source_kind !== 'plusbtext' ||
			accessRun.source_kind !== 'access' ||
			plusVersion.import_run_id !== plusRun.id ||
			accessVersion.import_run_id !== accessRun.id
		) {
			throw new ImportStorageError('LEGACY_RELEASE_STAGED_PAIR_INVALID');
		}
		if (
			plusRun.rows_total !== input.verificationContract.plusBText.rowsTotal ||
			plusRun.rows_staged !== input.verificationContract.plusBText.rowsStaged ||
			plusRun.rows_skipped !== input.verificationContract.plusBText.rowsSkipped ||
			plusRun.rows_promoted !== 0 ||
			accessRun.rows_total !== input.verificationContract.access.rowsTotal ||
			accessRun.rows_staged !== input.verificationContract.access.rowsStaged ||
			accessRun.rows_skipped !== input.verificationContract.access.rowsSkipped ||
			accessRun.rows_promoted !== 0
		) {
			throw new ImportStorageError('LEGACY_RELEASE_RUN_COUNT_MISMATCH');
		}
		const dependency = await this.db.first<{ plusbtext_version_id: string }>({
			sql: `SELECT plusbtext_version_id FROM legacy_versions WHERE id = ?`,
			params: [accessVersion.id],
		});
		if (dependency?.plusbtext_version_id !== plusVersion.id) {
			throw new ImportStorageError('LEGACY_RELEASE_DEPENDENCY_MISMATCH');
		}
		const currentPlus = await this.currentVersion('plusbtext', input.academicPeriodId);
		const currentAccess = await this.currentVersion('access', input.academicPeriodId);
		if (
			(currentPlus?.id ?? null) !== input.expectedCurrentPlusBTextVersionId ||
			(currentAccess?.id ?? null) !== input.expectedCurrentAccessVersionId
		) {
			throw new ImportStorageError('LEGACY_RELEASE_CURRENT_CHANGED');
		}
		const existingPlan = await this.db.first<{ id: string }>({
			sql: `SELECT id FROM legacy_import_release_plans WHERE plan_digest_sha256 = ?`,
			params: [input.planDigestSha256],
		});
		if (existingPlan) {
			const existing = await this.legacyReleasePlan(existingPlan.id);
			if (
				existing?.staged_digest_sha256 !== input.stagedDigestSha256 ||
				existing.plusbtext_run_id !== input.plusBTextRunId ||
				existing.access_run_id !== input.accessRunId ||
				existing.plusbtext_version_id !== input.plusBTextVersionId ||
				existing.access_version_id !== input.accessVersionId ||
				existing.expected_current_plusbtext_version_id !==
					input.expectedCurrentPlusBTextVersionId ||
				existing.expected_current_access_version_id !==
					input.expectedCurrentAccessVersionId ||
				existing.planned_by !== input.plannedBy ||
				existing.staged_by !== input.stagedBy ||
				existing.verification_contract_json !== JSON.stringify(input.verificationContract)
			) {
				throw new ImportStorageError('LEGACY_RELEASE_PLAN_IDEMPOTENCY_CONFLICT');
			}
			return existing;
		}
		const id = input.planId ?? crypto.randomUUID();
		try {
			await this.db.run({
				sql: `INSERT INTO legacy_import_release_plans
					(id, plan_digest_sha256, staged_digest_sha256, environment, target_database_id,
					 git_commit_sha, academic_period_id, plusbtext_run_id, access_run_id,
					 plusbtext_version_id, access_version_id,
					 expected_current_plusbtext_version_id, expected_current_access_version_id,
					 safe_summary_json, planned_by, staged_by, verification_contract_json,
					 status, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'staged', ?, ?)`,
				params: [
					id,
					input.planDigestSha256,
					input.stagedDigestSha256,
					input.environment,
					input.targetDatabaseId,
					input.gitCommitSha,
					input.academicPeriodId,
					input.plusBTextRunId,
					input.accessRunId,
					input.plusBTextVersionId,
					input.accessVersionId,
					input.expectedCurrentPlusBTextVersionId,
					input.expectedCurrentAccessVersionId,
					safeJson(input.safeSummary),
					input.plannedBy,
					input.stagedBy,
					JSON.stringify(input.verificationContract),
					input.now,
					input.now,
				],
			});
		} catch (cause) {
			throw new ImportStorageError('LEGACY_RELEASE_PLAN_CREATE_FAILED', cause);
		}
		return (await this.legacyReleasePlan(id))!;
	}

	async reviewLegacyReleasePlan(input: {
		planId: string;
		stagedDigestSha256: string;
		reviewDigestSha256: string;
		reviewedBy: string;
		reasonCode: string;
		now: string;
	}): Promise<LegacyReleasePlanRow> {
		assertInstant(input.now, 'now');
		assertOperatorId(input.reviewedBy, 'reviewedBy');
		const existing = await this.legacyReleasePlan(input.planId);
		if (
			existing &&
			(input.reviewedBy === existing.planned_by || input.reviewedBy === existing.staged_by)
		) {
			throw new ImportStorageError('LEGACY_RELEASE_REVIEWER_NOT_INDEPENDENT');
		}
		if (
			existing &&
			existing.status !== 'staged' &&
			existing.staged_digest_sha256 === input.stagedDigestSha256 &&
			existing.review_digest_sha256 === input.reviewDigestSha256
		) {
			return existing;
		}
		assertLegacyReleaseVerificationReady(await this.verifyLegacyReleasePlan(input.planId));
		const result = await this.db.run({
			sql: `UPDATE legacy_import_release_plans SET status = 'reviewed',
				review_digest_sha256 = ?, reviewed_by = ?, review_reason_code = ?,
				reviewed_at = ?, updated_at = ?
				WHERE id = ? AND status = 'staged' AND staged_digest_sha256 = ?`,
			params: [
				input.reviewDigestSha256,
				input.reviewedBy,
				input.reasonCode,
				input.now,
				input.now,
				input.planId,
				input.stagedDigestSha256,
			],
		});
		if (result.meta.changes !== 1) {
			throw new ImportStorageError('LEGACY_RELEASE_REVIEW_BINDING_MISMATCH');
		}
		return (await this.legacyReleasePlan(input.planId))!;
	}

	async legacyReleaseControl(planId: string): Promise<LegacyReleasePlanRow | null> {
		return this.legacyReleasePlan(planId);
	}

	private async legacyReleasePlan(planId: string): Promise<LegacyReleasePlanRow | null> {
		return this.db.first<LegacyReleasePlanRow>({
			sql: `SELECT id, plan_digest_sha256, staged_digest_sha256, environment,
				target_database_id, git_commit_sha, academic_period_id,
				plusbtext_run_id, access_run_id, plusbtext_version_id, access_version_id,
				expected_current_plusbtext_version_id, expected_current_access_version_id,
				planned_by, staged_by, verification_contract_json,
				status, review_digest_sha256, reviewed_by
				FROM legacy_import_release_plans WHERE id = ?`,
			params: [planId],
		});
	}

	async verifyLegacyReleasePlan(planId: string): Promise<LegacyReleaseVerification> {
		const row = await this.db.first<{
			id: string;
			academic_period_id: string;
			status: LegacyReleasePlanRow['status'];
			verification_contract_json: string;
			plusbtext_run_status: ImportRunRow['status'];
			access_run_status: ImportRunRow['status'];
			plusbtext_rows_total: number;
			plusbtext_rows_staged: number;
			plusbtext_rows_promoted: number;
			plusbtext_rows_skipped: number;
			access_rows_total: number;
			access_rows_staged: number;
			access_rows_promoted: number;
			access_rows_skipped: number;
			plusbtext_run_id: string;
			access_run_id: string;
			target_plusbtext_version_id: string;
			target_access_version_id: string;
			expected_plusbtext_version_id: string | null;
			expected_access_version_id: string | null;
			current_plusbtext_version_id: string | null;
			current_access_version_id: string | null;
			current_access_dependency_id: string | null;
			current_plusbtext_count: number;
			current_access_count: number;
			plusbtext_old_groups: number;
			plusbtext_targets: number;
			access_source_rows: number;
			access_families: number;
			access_emails: number;
			access_children: number;
			access_enrollments: number;
			projected_access_source_rows: number;
			projected_access_families: number;
			projected_access_emails: number;
			projected_access_children: number;
			projected_access_enrollments: number;
			issues_info: number;
			issues_warning: number;
			issues_error: number;
			issues_fatal: number;
			events_promote: number;
			events_rollback: number;
			events_roll_forward: number;
		}>({
			sql: `SELECT plan.id, plan.academic_period_id, plan.status, plan.verification_contract_json,
				plan.plusbtext_run_id, plan.access_run_id,
				plus_run.status AS plusbtext_run_status,
				access_run.status AS access_run_status,
				plus_run.rows_total AS plusbtext_rows_total,
				plus_run.rows_staged AS plusbtext_rows_staged,
				plus_run.rows_promoted AS plusbtext_rows_promoted,
				plus_run.rows_skipped AS plusbtext_rows_skipped,
				access_run.rows_total AS access_rows_total,
				access_run.rows_staged AS access_rows_staged,
				access_run.rows_promoted AS access_rows_promoted,
				access_run.rows_skipped AS access_rows_skipped,
				plan.plusbtext_version_id AS target_plusbtext_version_id,
				plan.access_version_id AS target_access_version_id,
				plan.expected_current_plusbtext_version_id AS expected_plusbtext_version_id,
				plan.expected_current_access_version_id AS expected_access_version_id,
				(SELECT id FROM plusbtext_versions
					WHERE academic_period_id = plan.academic_period_id AND is_published = 1)
					AS current_plusbtext_version_id,
				(SELECT id FROM legacy_versions
					WHERE academic_period_id = plan.academic_period_id AND is_published = 1)
					AS current_access_version_id,
				(SELECT plusbtext_version_id FROM legacy_versions
					WHERE academic_period_id = plan.academic_period_id AND is_published = 1)
					AS current_access_dependency_id,
				(SELECT COUNT(*) FROM plusbtext_versions
					WHERE academic_period_id = plan.academic_period_id AND is_published = 1)
					AS current_plusbtext_count,
				(SELECT COUNT(*) FROM legacy_versions
					WHERE academic_period_id = plan.academic_period_id AND is_published = 1)
					AS current_access_count,
				(SELECT COUNT(*) FROM plusbtext_old_groups
					WHERE plusbtext_version_id = plan.plusbtext_version_id) AS plusbtext_old_groups,
				(SELECT COUNT(*) FROM plusbtext_targets
					WHERE plusbtext_version_id = plan.plusbtext_version_id) AS plusbtext_targets,
				(SELECT COUNT(*) FROM legacy_snapshot_source_rows
					WHERE legacy_version_id = plan.access_version_id) AS access_source_rows,
				(SELECT COUNT(*) FROM legacy_snapshot_families
					WHERE legacy_version_id = plan.access_version_id) AS access_families,
				(SELECT COUNT(*) FROM legacy_snapshot_emails
					WHERE legacy_version_id = plan.access_version_id) AS access_emails,
				(SELECT COUNT(*) FROM legacy_snapshot_children
					WHERE legacy_version_id = plan.access_version_id) AS access_children,
				(SELECT COUNT(*) FROM legacy_snapshot_enrollments
					WHERE legacy_version_id = plan.access_version_id) AS access_enrollments,
				(SELECT COUNT(*) FROM legacy_source_rows
					WHERE last_seen_run_id = plan.access_run_id AND is_current = 1)
					AS projected_access_source_rows,
				(SELECT COUNT(*) FROM legacy_family_periods
					WHERE last_seen_run_id = plan.access_run_id AND is_current = 1)
					AS projected_access_families,
				(SELECT COUNT(*) FROM legacy_family_emails
					WHERE last_seen_run_id = plan.access_run_id AND is_current = 1)
					AS projected_access_emails,
				(SELECT COUNT(*) FROM children
					WHERE last_seen_run_id = plan.access_run_id AND is_current = 1)
					AS projected_access_children,
				(SELECT COUNT(*) FROM legacy_enrollments
					WHERE last_seen_run_id = plan.access_run_id AND is_current = 1)
					AS projected_access_enrollments,
				(SELECT COUNT(*) FROM import_issues WHERE import_run_id IN
					(plan.plusbtext_run_id, plan.access_run_id) AND severity = 'info') AS issues_info,
				(SELECT COUNT(*) FROM import_issues WHERE import_run_id IN
					(plan.plusbtext_run_id, plan.access_run_id) AND severity = 'warning') AS issues_warning,
				(SELECT COUNT(*) FROM import_issues WHERE import_run_id IN
					(plan.plusbtext_run_id, plan.access_run_id) AND severity = 'error') AS issues_error,
				(SELECT COUNT(*) FROM import_issues WHERE import_run_id IN
					(plan.plusbtext_run_id, plan.access_run_id) AND severity = 'fatal') AS issues_fatal,
				(SELECT COUNT(*) FROM legacy_import_bundle_events
					WHERE plan_id = plan.id AND action = 'promote') AS events_promote,
				(SELECT COUNT(*) FROM legacy_import_bundle_events
					WHERE plan_id = plan.id AND action = 'rollback') AS events_rollback,
				(SELECT COUNT(*) FROM legacy_import_bundle_events
					WHERE plan_id = plan.id AND action = 'roll_forward') AS events_roll_forward
			FROM legacy_import_release_plans AS plan
			JOIN import_runs AS plus_run ON plus_run.id = plan.plusbtext_run_id
			JOIN import_runs AS access_run ON access_run.id = plan.access_run_id
			WHERE plan.id = ?`,
			params: [planId],
		});
		if (!row) throw new ImportStorageError('LEGACY_RELEASE_PLAN_NOT_FOUND');
		let expected: LegacyReleaseVerificationContract;
		try {
			expected = JSON.parse(
				row.verification_contract_json
			) as LegacyReleaseVerificationContract;
			assertVerificationContract(expected);
		} catch (cause) {
			throw new ImportStorageError('LEGACY_RELEASE_VERIFICATION_CONTRACT_INVALID', cause);
		}
		const foreignKeyViolation = await this.db.first<Record<string, unknown>>({
			sql: `PRAGMA foreign_key_check`,
		});
		const reconciliation = await this.reconciliation.releaseGate(row.academic_period_id, [
			{
				sourceKind: 'plusbtext',
				importRunId: row.plusbtext_run_id,
				versionId: row.target_plusbtext_version_id,
			},
			{
				sourceKind: 'access',
				importRunId: row.access_run_id,
				versionId: row.target_access_version_id,
			},
		]);
		const currentPair =
			row.current_plusbtext_version_id === row.target_plusbtext_version_id &&
			row.current_access_version_id === row.target_access_version_id
				? 'target'
				: row.current_plusbtext_version_id === row.expected_plusbtext_version_id &&
					  row.current_access_version_id === row.expected_access_version_id
					? row.current_plusbtext_version_id === null
						? 'none'
						: 'previous'
					: 'unexpected';
		return {
			planId: row.id,
			status: row.status,
			currentPair,
			currentPairUnique:
				row.current_plusbtext_count <= 1 &&
				row.current_access_count <= 1 &&
				row.current_plusbtext_count === row.current_access_count,
			dependencyCompatible:
				row.current_access_version_id === null
					? row.current_plusbtext_version_id === null &&
						row.current_access_dependency_id === null
					: row.current_access_dependency_id === row.current_plusbtext_version_id,
			foreignKeyIntegrity: foreignKeyViolation === null,
			runStatus: {
				plusBText: row.plusbtext_run_status,
				access: row.access_run_status,
			},
			expected,
			runRows: {
				plusBText: {
					total: row.plusbtext_rows_total,
					staged: row.plusbtext_rows_staged,
					promoted: row.plusbtext_rows_promoted,
					skipped: row.plusbtext_rows_skipped,
				},
				access: {
					total: row.access_rows_total,
					staged: row.access_rows_staged,
					promoted: row.access_rows_promoted,
					skipped: row.access_rows_skipped,
				},
			},
			targetRows: {
				plusBTextOldGroups: row.plusbtext_old_groups,
				plusBTextTargets: row.plusbtext_targets,
				accessSourceRows: row.access_source_rows,
				accessFamilies: row.access_families,
				accessEmails: row.access_emails,
				accessChildren: row.access_children,
				accessEnrollments: row.access_enrollments,
			},
			projectionRows: {
				accessSourceRows: row.projected_access_source_rows,
				accessFamilies: row.projected_access_families,
				accessEmails: row.projected_access_emails,
				accessChildren: row.projected_access_children,
				accessEnrollments: row.projected_access_enrollments,
			},
			issues: {
				info: row.issues_info,
				warning: row.issues_warning,
				error: row.issues_error,
				fatal: row.issues_fatal,
			},
			reconciliation,
			events: {
				promote: row.events_promote,
				rollback: row.events_rollback,
				rollForward: row.events_roll_forward,
			},
		};
	}

	async transitionLegacyBundle(input: {
		planId: string;
		reviewDigestSha256: string;
		recoveryEvidenceDigestSha256?: string;
		operatorId: string;
		action: 'promote' | 'rollback' | 'roll_forward';
		now: string;
	}): Promise<LegacyBundleTransitionResult> {
		assertInstant(input.now, 'now');
		assertOperatorId(input.operatorId, 'operatorId');
		if (
			input.action === 'promote'
				? !/^[0-9a-f]{64}$/u.test(input.recoveryEvidenceDigestSha256 ?? '')
				: input.recoveryEvidenceDigestSha256 !== undefined
		) {
			throw new ImportStorageError('LEGACY_RELEASE_RECOVERY_EVIDENCE_INVALID');
		}
		const plan = await this.legacyReleasePlan(input.planId);
		if (!plan || plan.review_digest_sha256 !== input.reviewDigestSha256) {
			throw new ImportStorageError('LEGACY_RELEASE_REVIEW_BINDING_MISMATCH');
		}
		if (plan.reviewed_by === input.operatorId) {
			throw new ImportStorageError('LEGACY_RELEASE_PROMOTER_NOT_INDEPENDENT');
		}
		assertLegacyReleaseVerificationReady(await this.verifyLegacyReleasePlan(input.planId));
		const completedStatus = input.action === 'rollback' ? 'rolled_back' : 'promoted';
		if (plan.status === completedStatus) {
			const event = await this.db.first<{
				plusbtext_version_id: string;
				access_version_id: string;
				previous_plusbtext_version_id: string | null;
				previous_access_version_id: string | null;
				actor_operator_id: string;
				recovery_evidence_digest_sha256: string | null;
			}>({
				sql: `SELECT plusbtext_version_id, access_version_id,
					previous_plusbtext_version_id, previous_access_version_id,
					actor_operator_id, recovery_evidence_digest_sha256
					FROM legacy_import_bundle_events
					WHERE plan_id = ? AND action = ? AND review_digest_sha256 = ?
					ORDER BY created_at DESC LIMIT 1`,
				params: [plan.id, input.action, input.reviewDigestSha256],
			});
			if (
				event &&
				event.actor_operator_id === input.operatorId &&
				event.recovery_evidence_digest_sha256 ===
					(input.recoveryEvidenceDigestSha256 ?? null)
			) {
				const [currentPlus, currentAccess] = await Promise.all([
					this.currentVersion('plusbtext', plan.academic_period_id),
					this.currentVersion('access', plan.academic_period_id),
				]);
				if (
					currentPlus?.id === event.plusbtext_version_id &&
					currentAccess?.id === event.access_version_id
				) {
					return {
						planId: plan.id,
						action: input.action,
						plusBTextVersionId: event.plusbtext_version_id,
						accessVersionId: event.access_version_id,
						previousPlusBTextVersionId: event.previous_plusbtext_version_id,
						previousAccessVersionId: event.previous_access_version_id,
					};
				}
			}
		}
		const requiredStatus =
			input.action === 'promote'
				? 'reviewed'
				: input.action === 'rollback'
					? 'promoted'
					: 'rolled_back';
		if (plan.status !== requiredStatus) {
			throw new ImportStorageError('LEGACY_RELEASE_TRANSITION_INVALID');
		}

		const targetPlusId =
			input.action === 'rollback'
				? plan.expected_current_plusbtext_version_id
				: plan.plusbtext_version_id;
		const targetAccessId =
			input.action === 'rollback'
				? plan.expected_current_access_version_id
				: plan.access_version_id;
		if (!targetPlusId || !targetAccessId) {
			throw new ImportStorageError('LEGACY_RELEASE_ROLLBACK_TARGET_MISSING');
		}
		const currentPlus = await this.currentVersion('plusbtext', plan.academic_period_id);
		const currentAccess = await this.currentVersion('access', plan.academic_period_id);
		const expectedCurrentPlusId =
			input.action === 'rollback'
				? plan.plusbtext_version_id
				: plan.expected_current_plusbtext_version_id;
		const expectedCurrentAccessId =
			input.action === 'rollback'
				? plan.access_version_id
				: plan.expected_current_access_version_id;
		if (
			(currentPlus?.id ?? null) !== expectedCurrentPlusId ||
			(currentAccess?.id ?? null) !== expectedCurrentAccessId
		) {
			throw new ImportStorageError('LEGACY_RELEASE_CURRENT_CHANGED');
		}
		const targetPlus = await this.versionById(
			'plusbtext',
			targetPlusId,
			plan.academic_period_id
		);
		const targetAccess = await this.versionById(
			'access',
			targetAccessId,
			plan.academic_period_id
		);
		if (!targetPlus || !targetAccess) {
			throw new ImportStorageError('LEGACY_RELEASE_TARGET_INVALID');
		}
		const dependency = await this.db.first<{ plusbtext_version_id: string }>({
			sql: `SELECT plusbtext_version_id FROM legacy_versions WHERE id = ?`,
			params: [targetAccess.id],
		});
		if (dependency?.plusbtext_version_id !== targetPlus.id) {
			throw new ImportStorageError('LEGACY_RELEASE_DEPENDENCY_MISMATCH');
		}

		const owner = `legacy-bundle:${crypto.randomUUID()}`;
		const leaseUntil = new Date(Date.parse(input.now) + PROMOTION_LEASE_MS).toISOString();
		const plusLease = await this.foundation.tryAcquireLease({
			scope: 'import-promotion',
			resourceKey: promotionResourceKey('plusbtext', plan.academic_period_id),
			owner,
			now: input.now,
			leaseUntil,
		});
		if (!plusLease.acquired) throw new ImportStorageError('PROMOTION_LEASE_BUSY');
		let accessLease:
			| { acquired: false }
			| { acquired: true; fencingToken: number; leaseUntil: string }
			| undefined;
		try {
			accessLease = await this.foundation.tryAcquireLease({
				scope: 'import-promotion',
				resourceKey: promotionResourceKey('access', plan.academic_period_id),
				owner,
				now: input.now,
				leaseUntil,
			});
			if (!accessLease.acquired) throw new ImportStorageError('PROMOTION_LEASE_BUSY');

			const eventId = crypto.randomUUID();
			const legacyRunId = targetAccess.import_run_id;
			const targetStatus = input.action === 'rollback' ? 'rolled_back' : 'promoted';
			const statusColumn = input.action === 'rollback' ? 'rolled_back_at' : 'promoted_at';
			const statements: StatementSpec[] = [
				{
					sql: `INSERT INTO legacy_import_bundle_events
						(id, plan_id, action, academic_period_id, plusbtext_version_id,
						 access_version_id, previous_plusbtext_version_id, previous_access_version_id,
						 review_digest_sha256, recovery_evidence_digest_sha256,
						 plusbtext_fencing_token, access_fencing_token, actor_operator_id, created_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					params: [
						eventId,
						plan.id,
						input.action,
						plan.academic_period_id,
						targetPlus.id,
						targetAccess.id,
						currentPlus?.id ?? null,
						currentAccess?.id ?? null,
						input.reviewDigestSha256,
						input.recoveryEvidenceDigestSha256 ?? null,
						plusLease.fencingToken,
						accessLease.fencingToken,
						input.operatorId,
						input.now,
					],
				},
				{
					sql: `UPDATE plusbtext_versions SET is_published = 0, retired_at = ?
						WHERE academic_period_id = ? AND is_published = 1`,
					params: [input.now, plan.academic_period_id],
				},
				{
					sql: `UPDATE legacy_versions SET is_published = 0, retired_at = ?
						WHERE academic_period_id = ? AND is_published = 1`,
					params: [input.now, plan.academic_period_id],
				},
				...this.legacyProjectionStatements({
					academicPeriodId: plan.academic_period_id,
					versionId: targetAccess.id,
					runId: legacyRunId,
					now: input.now,
				}),
				{
					sql: `UPDATE plusbtext_versions SET is_published = 1, published_at = ?,
						retired_at = NULL, promotion_owner = ?, promotion_fencing_token = ?
						WHERE id = ? AND is_published = 0`,
					params: [input.now, owner, plusLease.fencingToken, targetPlus.id],
				},
				{
					sql: `UPDATE legacy_versions SET is_published = 1, published_at = ?,
						retired_at = NULL, promotion_owner = ?, promotion_fencing_token = ?
						WHERE id = ? AND is_published = 0`,
					params: [input.now, owner, accessLease.fencingToken, targetAccess.id],
				},
			];
			if (input.action === 'promote') {
				statements.push(
					{
						sql: `UPDATE import_runs SET status = 'promoted', promoted_at = ?, finished_at = ?,
							rows_promoted = rows_staged - rows_skipped, updated_at = ?
							WHERE id IN (?, ?) AND status = 'validated'`,
						params: [
							input.now,
							input.now,
							input.now,
							plan.plusbtext_run_id,
							plan.access_run_id,
						],
					},
					...this.legacySourcePromotionEventStatements({
						plan,
						action: 'promote',
						targetPlus,
						targetAccess,
						previousPlusId: currentPlus?.id ?? null,
						previousAccessId: currentAccess?.id ?? null,
						plusFencingToken: plusLease.fencingToken,
						accessFencingToken: accessLease.fencingToken,
						now: input.now,
					})
				);
			} else {
				statements.push(
					...this.legacySourcePromotionEventStatements({
						plan,
						action: input.action === 'roll_forward' ? 'promote' : 'rollback',
						targetPlus,
						targetAccess,
						previousPlusId: currentPlus?.id ?? null,
						previousAccessId: currentAccess?.id ?? null,
						plusFencingToken: plusLease.fencingToken,
						accessFencingToken: accessLease.fencingToken,
						now: input.now,
					})
				);
			}
			statements.push(
				{
					sql: `UPDATE legacy_import_release_plans SET status = ?,
						${statusColumn} = COALESCE(${statusColumn}, ?),
						updated_at = ? WHERE id = ? AND status = ?`,
					params: [targetStatus, input.now, input.now, plan.id, requiredStatus],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, ip_retention_value, created_at)
						 VALUES (?, NULL, 'system', ?, 'legacy_import_bundle', ?, ?, ?, NULL, ?)`,
					params: [
						crypto.randomUUID(),
						`import.legacy_bundle.${input.action}`,
						plan.id,
						eventId,
						safeJson({
							previousPlusBTextVersionId: currentPlus?.id ?? null,
							previousAccessVersionId: currentAccess?.id ?? null,
							recoveryEvidenceDigestSha256:
								input.recoveryEvidenceDigestSha256 ?? null,
							operatorId: input.operatorId,
						}),
						input.now,
					],
				}
			);
			await this.db.batch(statements);
			return {
				planId: plan.id,
				action: input.action,
				plusBTextVersionId: targetPlus.id,
				accessVersionId: targetAccess.id,
				previousPlusBTextVersionId: currentPlus?.id ?? null,
				previousAccessVersionId: currentAccess?.id ?? null,
			};
		} catch (cause) {
			if (cause instanceof ImportStorageError) throw cause;
			throw new ImportStorageError('LEGACY_RELEASE_TRANSITION_FAILED', cause);
		} finally {
			if (accessLease?.acquired) {
				await this.foundation.releaseLease({
					scope: 'import-promotion',
					resourceKey: promotionResourceKey('access', plan.academic_period_id),
					owner,
					fencingToken: accessLease.fencingToken,
					now: input.now,
				});
			}
			await this.foundation.releaseLease({
				scope: 'import-promotion',
				resourceKey: promotionResourceKey('plusbtext', plan.academic_period_id),
				owner,
				fencingToken: plusLease.fencingToken,
				now: input.now,
			});
		}
	}

	private legacySourcePromotionEventStatements(input: {
		plan: LegacyReleasePlanRow;
		action: 'promote' | 'rollback';
		targetPlus: VersionRow;
		targetAccess: VersionRow;
		previousPlusId: string | null;
		previousAccessId: string | null;
		plusFencingToken: number;
		accessFencingToken: number;
		now: string;
	}): StatementSpec[] {
		return [
			{
				sql: `INSERT INTO legacy_version_promotion_events
					(id, source_kind, academic_period_id, version_id, previous_version_id,
					 import_run_id, action, fencing_token, created_at)
					 VALUES (?, 'plusbtext', ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					crypto.randomUUID(),
					input.plan.academic_period_id,
					input.targetPlus.id,
					input.previousPlusId,
					input.targetPlus.import_run_id,
					input.action,
					input.plusFencingToken,
					input.now,
				],
			},
			{
				sql: `INSERT INTO legacy_version_promotion_events
					(id, source_kind, academic_period_id, version_id, previous_version_id,
					 import_run_id, action, fencing_token, created_at)
					 VALUES (?, 'access', ?, ?, ?, ?, ?, ?, ?)`,
				params: [
					crypto.randomUUID(),
					input.plan.academic_period_id,
					input.targetAccess.id,
					input.previousAccessId,
					input.targetAccess.import_run_id,
					input.action,
					input.accessFencingToken,
					input.now,
				],
			},
		];
	}

	async promote(runId: string, now: string): Promise<PromotionResult> {
		assertInstant(now, 'now');
		const run = await this.getRun(runId);
		if (!run) throw new ImportStorageError('IMPORT_RUN_NOT_FOUND');
		if (run.status === 'failed') throw new ImportStorageError('IMPORT_RUN_FAILED');
		const winner = await this.findPromotedRun(run.run_fingerprint);
		if (winner) {
			const version = await this.versionForRun(winner.source_kind, winner.id);
			if (!version) throw new ImportStorageError('PROMOTED_VERSION_MISSING');
			return {
				outcome: 'noop',
				runId: winner.id,
				versionId: version.id,
				previousVersionId: null,
			};
		}
		if (run.status !== 'validated') throw new ImportStorageError('IMPORT_RUN_NOT_VALIDATED');

		const owner = `import:${crypto.randomUUID()}`;
		const leaseUntil = new Date(Date.parse(now) + PROMOTION_LEASE_MS).toISOString();
		const lease = await this.foundation.tryAcquireLease({
			scope: 'import-promotion',
			resourceKey: promotionResourceKey(run.source_kind, run.academic_period_id),
			owner,
			now,
			leaseUntil,
		});
		if (!lease.acquired) {
			await this.markRunFailed(runId, 'PROMOTION_LEASE_BUSY', now);
			throw new ImportStorageError('PROMOTION_LEASE_BUSY');
		}

		try {
			const version = await this.versionForRun(run.source_kind, runId);
			if (!version) throw new ImportStorageError('STAGED_VERSION_MISSING');
			const previous = await this.currentVersion(run.source_kind, run.academic_period_id);
			const statements: StatementSpec[] = [];
			if (run.source_kind === 'price') {
				statements.push(
					{
						sql: `UPDATE price_versions SET is_active = 0, retired_at = ?
							WHERE academic_period_id = ? AND is_active = 1`,
						params: [now, run.academic_period_id],
					},
					{
						sql: `UPDATE price_versions SET is_active = 1, activated_at = ?, retired_at = NULL,
							promotion_owner = ?, promotion_fencing_token = ? WHERE id = ? AND is_active = 0`,
						params: [now, owner, lease.fencingToken, version.id],
					}
				);
			} else if (run.source_kind === 'schedule') {
				statements.push(
					{
						sql: `UPDATE schedule_versions SET is_published = 0, retired_at = ?
							WHERE academic_period_id = ? AND is_published = 1`,
						params: [now, run.academic_period_id],
					},
					...this.scheduleProjectionStatements({
						academicPeriodId: run.academic_period_id,
						versionId: version.id,
						now,
					}),
					{
						sql: `UPDATE schedule_versions SET is_published = 1, published_at = ?, retired_at = NULL,
							promotion_owner = ?, promotion_fencing_token = ? WHERE id = ? AND is_published = 0`,
						params: [now, owner, lease.fencingToken, version.id],
					}
				);
			} else if (run.source_kind === 'plusbtext') {
				statements.push(
					{
						sql: `UPDATE plusbtext_versions SET is_published = 0, retired_at = ?
							WHERE academic_period_id = ? AND is_published = 1`,
						params: [now, run.academic_period_id],
					},
					{
						sql: `UPDATE plusbtext_versions SET is_published = 1, published_at = ?,
							retired_at = NULL, promotion_owner = ?, promotion_fencing_token = ?
							WHERE id = ? AND is_published = 0`,
						params: [now, owner, lease.fencingToken, version.id],
					}
				);
			} else {
				statements.push(
					{
						sql: `UPDATE legacy_versions SET is_published = 0, retired_at = ?
							WHERE academic_period_id = ? AND is_published = 1`,
						params: [now, run.academic_period_id],
					},
					...this.legacyProjectionStatements({
						academicPeriodId: run.academic_period_id,
						versionId: version.id,
						runId,
						now,
					}),
					{
						sql: `UPDATE legacy_versions SET is_published = 1, published_at = ?,
							retired_at = NULL, promotion_owner = ?, promotion_fencing_token = ?
							WHERE id = ? AND is_published = 0`,
						params: [now, owner, lease.fencingToken, version.id],
					}
				);
			}
			statements.push(
				{
					sql: `UPDATE import_runs SET status = 'promoted', promoted_at = ?, finished_at = ?,
						rows_promoted = rows_staged - rows_skipped, updated_at = ?
						WHERE id = ? AND status = 'validated'`,
					params: [now, now, now, runId],
				},
				{
					sql: `INSERT INTO ${
						run.source_kind === 'price' || run.source_kind === 'schedule'
							? 'version_promotion_events'
							: 'legacy_version_promotion_events'
					}
						(id, source_kind, academic_period_id, version_id, previous_version_id,
						 import_run_id, action, fencing_token, created_at)
						VALUES (?, ?, ?, ?, ?, ?, 'promote', ?, ?)`,
					params: [
						crypto.randomUUID(),
						run.source_kind,
						run.academic_period_id,
						version.id,
						previous?.id ?? null,
						runId,
						lease.fencingToken,
						now,
					],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, ip_retention_value, created_at)
						VALUES (?, NULL, 'system', ?, 'import_version', ?, ?, ?, NULL, ?)`,
					params: [
						crypto.randomUUID(),
						`import.${run.source_kind}.promote`,
						version.id,
						runId,
						safeJson({
							previousVersionId: previous?.id ?? null,
							fencingToken: lease.fencingToken,
						}),
						now,
					],
				}
			);
			await this.db.batch(statements);
			return {
				outcome: 'promoted',
				runId,
				versionId: version.id,
				previousVersionId: previous?.id ?? null,
			};
		} catch (cause) {
			const winningRun = await this.findPromotedRun(run.run_fingerprint);
			await this.markRunFailed(runId, 'PROMOTION_FAILED', now);
			if (winningRun) {
				const winningVersion = await this.versionForRun(
					winningRun.source_kind,
					winningRun.id
				);
				if (winningVersion) {
					return {
						outcome: 'noop',
						runId: winningRun.id,
						versionId: winningVersion.id,
						previousVersionId: null,
					};
				}
			}
			if (cause instanceof ImportStorageError) throw cause;
			throw new ImportStorageError('PROMOTION_FAILED', cause);
		} finally {
			await this.foundation.releaseLease({
				scope: 'import-promotion',
				resourceKey: promotionResourceKey(run.source_kind, run.academic_period_id),
				owner,
				fencingToken: lease.fencingToken,
				now,
			});
		}
	}

	async rollback(input: {
		sourceKind: ImportSourceKind;
		academicPeriodId: string;
		toVersionId?: string;
		now: string;
	}): Promise<{ versionId: string; previousVersionId: string }> {
		assertInstant(input.now, 'now');
		const current = await this.currentVersion(input.sourceKind, input.academicPeriodId);
		if (!current) throw new ImportStorageError('CURRENT_VERSION_MISSING');
		let targetId = input.toVersionId;
		if (!targetId) {
			const event = await this.db.first<{ previous_version_id: string | null }>({
				sql: `SELECT previous_version_id FROM ${
					input.sourceKind === 'price' || input.sourceKind === 'schedule'
						? 'version_promotion_events'
						: 'legacy_version_promotion_events'
				}
					WHERE source_kind = ? AND academic_period_id = ? AND version_id = ?
					ORDER BY created_at DESC LIMIT 1`,
				params: [input.sourceKind, input.academicPeriodId, current.id],
			});
			targetId = event?.previous_version_id ?? undefined;
		}
		if (!targetId || targetId === current.id)
			throw new ImportStorageError('ROLLBACK_TARGET_MISSING');
		const target = await this.versionById(input.sourceKind, targetId, input.academicPeriodId);
		if (!target) throw new ImportStorageError('ROLLBACK_TARGET_INVALID');
		const wasPublished = await this.db.first<{ id: string }>({
			sql: `SELECT id FROM ${
				input.sourceKind === 'price' || input.sourceKind === 'schedule'
					? 'version_promotion_events'
					: 'legacy_version_promotion_events'
			}
				WHERE source_kind = ? AND academic_period_id = ? AND version_id = ? LIMIT 1`,
			params: [input.sourceKind, input.academicPeriodId, target.id],
		});
		if (!wasPublished) throw new ImportStorageError('ROLLBACK_TARGET_NEVER_PUBLISHED');

		const owner = `rollback:${crypto.randomUUID()}`;
		const leaseUntil = new Date(Date.parse(input.now) + PROMOTION_LEASE_MS).toISOString();
		const lease = await this.foundation.tryAcquireLease({
			scope: 'import-promotion',
			resourceKey: promotionResourceKey(input.sourceKind, input.academicPeriodId),
			owner,
			now: input.now,
			leaseUntil,
		});
		if (!lease.acquired) throw new ImportStorageError('PROMOTION_LEASE_BUSY');
		try {
			const statements: StatementSpec[] = [];
			if (input.sourceKind === 'price') {
				statements.push(
					{
						sql: `UPDATE price_versions SET is_active = 0, retired_at = ? WHERE id = ?`,
						params: [input.now, current.id],
					},
					{
						sql: `UPDATE price_versions SET is_active = 1, activated_at = ?, retired_at = NULL,
							promotion_owner = ?, promotion_fencing_token = ? WHERE id = ? AND is_active = 0`,
						params: [input.now, owner, lease.fencingToken, target.id],
					}
				);
			} else if (input.sourceKind === 'schedule') {
				statements.push(
					{
						sql: `UPDATE schedule_versions SET is_published = 0, retired_at = ? WHERE id = ?`,
						params: [input.now, current.id],
					},
					...this.scheduleProjectionStatements({
						academicPeriodId: input.academicPeriodId,
						versionId: target.id,
						now: input.now,
					}),
					{
						sql: `UPDATE schedule_versions SET is_published = 1, published_at = ?, retired_at = NULL,
							promotion_owner = ?, promotion_fencing_token = ? WHERE id = ? AND is_published = 0`,
						params: [input.now, owner, lease.fencingToken, target.id],
					}
				);
			} else if (input.sourceKind === 'plusbtext') {
				statements.push(
					{
						sql: `UPDATE plusbtext_versions SET is_published = 0, retired_at = ? WHERE id = ?`,
						params: [input.now, current.id],
					},
					{
						sql: `UPDATE plusbtext_versions SET is_published = 1, published_at = ?,
							retired_at = NULL, promotion_owner = ?, promotion_fencing_token = ?
							WHERE id = ? AND is_published = 0`,
						params: [input.now, owner, lease.fencingToken, target.id],
					}
				);
			} else {
				statements.push(
					{
						sql: `UPDATE legacy_versions SET is_published = 0, retired_at = ? WHERE id = ?`,
						params: [input.now, current.id],
					},
					...this.legacyProjectionStatements({
						academicPeriodId: input.academicPeriodId,
						versionId: target.id,
						runId: target.import_run_id,
						now: input.now,
					}),
					{
						sql: `UPDATE legacy_versions SET is_published = 1, published_at = ?,
							retired_at = NULL, promotion_owner = ?, promotion_fencing_token = ?
							WHERE id = ? AND is_published = 0`,
						params: [input.now, owner, lease.fencingToken, target.id],
					}
				);
			}
			statements.push(
				{
					sql: `INSERT INTO ${
						input.sourceKind === 'price' || input.sourceKind === 'schedule'
							? 'version_promotion_events'
							: 'legacy_version_promotion_events'
					}
						(id, source_kind, academic_period_id, version_id, previous_version_id,
						 import_run_id, action, fencing_token, created_at)
						VALUES (?, ?, ?, ?, ?, ?, 'rollback', ?, ?)`,
					params: [
						crypto.randomUUID(),
						input.sourceKind,
						input.academicPeriodId,
						target.id,
						current.id,
						target.import_run_id,
						lease.fencingToken,
						input.now,
					],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, ip_retention_value, created_at)
						VALUES (?, NULL, 'system', ?, 'import_version', ?, ?, ?, NULL, ?)`,
					params: [
						crypto.randomUUID(),
						`import.${input.sourceKind}.rollback`,
						target.id,
						`rollback_${crypto.randomUUID()}`,
						safeJson({
							previousVersionId: current.id,
							fencingToken: lease.fencingToken,
						}),
						input.now,
					],
				}
			);
			await this.db.batch(statements);
			return { versionId: target.id, previousVersionId: current.id };
		} catch (cause) {
			throw new ImportStorageError('ROLLBACK_FAILED', cause);
		} finally {
			await this.foundation.releaseLease({
				scope: 'import-promotion',
				resourceKey: promotionResourceKey(input.sourceKind, input.academicPeriodId),
				owner,
				fencingToken: lease.fencingToken,
				now: input.now,
			});
		}
	}

	async safeStatus(input: { runId?: string; limit?: number }): Promise<unknown[]> {
		const limit = Math.min(Math.max(input.limit ?? 10, 1), 100);
		const runs = await this.db.all<{
			id: string;
			source_kind: string;
			academic_period: string;
			source_hash_sha256: string;
			structural_fingerprint_sha256: string;
			dependency_set_hash_sha256: string;
			status: string;
			attempt_no: number;
			started_at: string;
			validated_at: string | null;
			promoted_at: string | null;
			finished_at: string | null;
			rows_total: number;
			rows_staged: number;
			rows_promoted: number;
			rows_skipped: number;
			safe_summary_json: string;
			error_code: string | null;
		}>({
			sql: `SELECT run.id, run.source_kind, period.code AS academic_period,
				run.source_hash_sha256, run.structural_fingerprint_sha256,
				run.dependency_set_hash_sha256, run.status, run.attempt_no,
				run.started_at, run.validated_at, run.promoted_at, run.finished_at,
				run.rows_total, run.rows_staged, run.rows_promoted, run.rows_skipped,
				run.safe_summary_json, run.error_code
				FROM import_runs AS run
				JOIN academic_periods AS period ON period.id = run.academic_period_id
				WHERE (? IS NULL OR run.id = ?)
				ORDER BY run.started_at DESC LIMIT ?`,
			params: [input.runId ?? null, input.runId ?? null, limit],
		});

		const output: unknown[] = [];
		for (const run of runs.results) {
			const issues = await this.db.all<{
				severity: string;
				code: string;
				source_record_key: string | null;
				safe_context_json: string;
				status: string;
			}>({
				sql: `SELECT severity, code, source_record_key, safe_context_json, status
					FROM import_issues WHERE import_run_id = ? ORDER BY severity, code, id`,
				params: [run.id],
			});
			output.push({
				...run,
				safe_summary: JSON.parse(run.safe_summary_json),
				safe_summary_json: undefined,
				issues: issues.results.map((issue) => ({
					...issue,
					safe_context: JSON.parse(issue.safe_context_json),
					safe_context_json: undefined,
				})),
			});
		}
		return output;
	}

	private async getRun(runId: string): Promise<ImportRunRow | null> {
		return this.db.first<ImportRunRow>({
			sql: `SELECT id, source_kind, academic_period_id, source_hash_sha256,
				run_fingerprint, status, attempt_no, rows_total, rows_staged,
				rows_promoted, rows_skipped, safe_summary_json
				FROM import_runs WHERE id = ?`,
			params: [runId],
		});
	}

	private async versionForRun(
		sourceKind: ImportSourceKind,
		runId: string
	): Promise<VersionRow | null> {
		const table = this.versionTable(sourceKind);
		return this.db.first<VersionRow>({
			sql: `SELECT id, import_run_id, version_hash_sha256 FROM ${table} WHERE import_run_id = ?`,
			params: [runId],
		});
	}

	private async versionById(
		sourceKind: ImportSourceKind,
		versionId: string,
		academicPeriodId: string
	): Promise<VersionRow | null> {
		const table = this.versionTable(sourceKind);
		return this.db.first<VersionRow>({
			sql: `SELECT id, import_run_id, version_hash_sha256 FROM ${table}
				WHERE id = ? AND academic_period_id = ?`,
			params: [versionId, academicPeriodId],
		});
	}

	private async currentVersion(
		sourceKind: ImportSourceKind,
		academicPeriodId: string
	): Promise<VersionRow | null> {
		const table = this.versionTable(sourceKind);
		const currentColumn = sourceKind === 'price' ? 'is_active' : 'is_published';
		return this.db.first<VersionRow>({
			sql: `SELECT id, import_run_id, version_hash_sha256 FROM ${table}
				WHERE academic_period_id = ? AND ${currentColumn} = 1`,
			params: [academicPeriodId],
		});
	}

	private versionTable(sourceKind: ImportSourceKind): string {
		switch (sourceKind) {
			case 'price':
				return 'price_versions';
			case 'schedule':
				return 'schedule_versions';
			case 'plusbtext':
				return 'plusbtext_versions';
			case 'access':
				return 'legacy_versions';
		}
	}

	private async markRunFailed(runId: string, errorCode: string, now: string): Promise<void> {
		await this.db.run({
			sql: `UPDATE import_runs SET status = 'failed', error_code = ?, finished_at = ?, updated_at = ?
				WHERE id = ? AND status IN ('staged', 'validated')`,
			params: [errorCode, now, now, runId],
		});
	}
}

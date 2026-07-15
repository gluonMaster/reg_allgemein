import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import { FoundationRepository } from '$lib/server/db/foundation-repository';
import { redactSensitive } from '$lib/server/observability/redaction';
import { hashCanonical } from './canonical';
import type {
	AcademicPeriodRow,
	ImportDiffSummary,
	ImportIssueDraft,
	ImportIssueSeverity,
	ImportSourceKind,
	PriceImportSnapshot,
	ScheduleImportSnapshot,
} from './types';

const PROMOTION_LEASE_MS = 60_000;
const BATCH_SIZE = 50;

interface ImportRunRow {
	id: string;
	source_kind: ImportSourceKind;
	academic_period_id: string;
	source_hash_sha256: string;
	run_fingerprint: string;
	status: 'staged' | 'validated' | 'promoted' | 'failed';
	attempt_no: number;
	safe_summary_json: string;
}

interface VersionRow {
	id: string;
	import_run_id: string;
	version_hash_sha256: string;
}

export interface CreateImportRunInput {
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
}

export interface PromotionResult {
	outcome: 'promoted' | 'noop';
	runId: string;
	versionId: string;
	previousVersionId: string | null;
}

export class ImportStorageError extends Error {
	readonly code: string;

	constructor(code: string, cause?: unknown) {
		super('Import storage operation failed.', { cause });
		this.name = 'ImportStorageError';
		this.code = code;
	}
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

function safeJson(value: unknown): string {
	return JSON.stringify(redactSensitive(value));
}

function promotionResourceKey(sourceKind: ImportSourceKind, academicPeriodId: string): string {
	return `${sourceKind}:${academicPeriodId}`;
}

export class ImportRepository {
	private readonly foundation: FoundationRepository;

	constructor(private readonly db: DatabaseBoundary) {
		this.foundation = new FoundationRepository(db);
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
				run_fingerprint, status, attempt_no, safe_summary_json
				FROM import_runs WHERE run_fingerprint = ? AND status = 'promoted'`,
			params: [runFingerprint],
		});
	}

	async createRun(input: CreateImportRunInput): Promise<{ runId: string; attemptNo: number }> {
		assertInstant(input.now, 'now');
		const previous = await this.db.first<{ id: string; status: string; attempt_no: number }>({
			sql: `SELECT id, status, attempt_no FROM import_runs
				WHERE run_fingerprint = ? ORDER BY attempt_no DESC LIMIT 1`,
			params: [input.runFingerprint],
		});
		const attemptNo = (previous?.attempt_no ?? 0) + 1;
		const runId = crypto.randomUUID();
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
			} else {
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
			}
			statements.push(
				{
					sql: `UPDATE import_runs SET status = 'promoted', promoted_at = ?, finished_at = ?,
						rows_promoted = rows_staged - rows_skipped, updated_at = ?
						WHERE id = ? AND status = 'validated'`,
					params: [now, now, now, runId],
				},
				{
					sql: `INSERT INTO version_promotion_events
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
				sql: `SELECT previous_version_id FROM version_promotion_events
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
			sql: `SELECT id FROM version_promotion_events
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
			} else {
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
			}
			statements.push(
				{
					sql: `INSERT INTO version_promotion_events
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
				run_fingerprint, status, attempt_no, safe_summary_json
				FROM import_runs WHERE id = ?`,
			params: [runId],
		});
	}

	private async versionForRun(
		sourceKind: ImportSourceKind,
		runId: string
	): Promise<VersionRow | null> {
		const table = sourceKind === 'price' ? 'price_versions' : 'schedule_versions';
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
		const table = sourceKind === 'price' ? 'price_versions' : 'schedule_versions';
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
		const table = sourceKind === 'price' ? 'price_versions' : 'schedule_versions';
		const currentColumn = sourceKind === 'price' ? 'is_active' : 'is_published';
		return this.db.first<VersionRow>({
			sql: `SELECT id, import_run_id, version_hash_sha256 FROM ${table}
				WHERE academic_period_id = ? AND ${currentColumn} = 1`,
			params: [academicPeriodId],
		});
	}

	private async markRunFailed(runId: string, errorCode: string, now: string): Promise<void> {
		await this.db.run({
			sql: `UPDATE import_runs SET status = 'failed', error_code = ?, finished_at = ?, updated_at = ?
				WHERE id = ? AND status IN ('staged', 'validated')`,
			params: [errorCode, now, now, runId],
		});
	}
}

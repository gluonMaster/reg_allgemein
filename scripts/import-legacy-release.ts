import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unstable_readConfig } from 'wrangler';
import {
	buildDependencySet,
	buildRunFingerprint,
	hashCanonical,
} from '../src/lib/server/import/canonical';
import {
	buildLegacyReleasePlan,
	buildLegacyRecoveryEvidence,
	buildLegacyReleaseReviewBinding,
	LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS,
	assertLegacyOperatorId,
	assertLegacyRecoveryEvidenceForPromotion,
	deterministicLegacyReleaseUuid,
	safeLegacyReleasePlanSummary,
	verifyLegacyReleasePlan,
	type LegacyReleasePlanArtifact,
	type LegacyPreviewSyntheticFixtureId,
	type LegacyPreviewSyntheticVariant,
	type LegacyRecoveryEvidenceArtifact,
	type LegacyReleaseSourceEvidence,
} from '../src/lib/server/import/legacy-release';
import {
	ImportRepository,
	ImportStorageError,
	assertLegacyReleaseVerificationReady,
	type LegacyReleaseVerification,
	type LegacyReleaseVerificationContract,
	type StagedImportResult,
} from '../src/lib/server/import/import-repository';
import {
	parseAccessExtract,
	readAccessDatabase,
	type AccessExtract,
} from '../src/lib/server/import/local/access-database';
import {
	buildLegacyPreviewSyntheticSources,
	LEGACY_PREVIEW_SYNTHETIC_ROWS,
} from '../src/lib/server/import/local/legacy-preview-fixture';
import { parsePlusBTextWorkbook } from '../src/lib/server/import/local/plusbtext-workbook';
import type {
	ImportDiffSummary,
	ImportIssueDraft,
	ImportIssueSeverity,
	LegacyImportSnapshot,
	PlusBTextImportSnapshot,
} from '../src/lib/server/import/types';
import {
	RemoteD1Boundary,
	RemoteD1Error,
	assertRemoteD1ConfigTarget,
	expectedRemoteImportConfirmation,
	type RemoteD1Environment,
} from './remote-d1-target';

type Command =
	| 'plan'
	| 'stage'
	| 'review'
	| 'recovery-evidence'
	| 'confirmation'
	| 'promote'
	| 'verify'
	| 'rollback'
	| 'roll-forward';

const PRODUCTION_TRANSITION_DISABLED =
	'LEGACY_RELEASE_PRODUCTION_TRANSACTION_EVIDENCE_NOT_IMPLEMENTED';

export function assertLegacyProductionTransitionBoundary(
	environment: RemoteD1Environment,
	command: Command
): void {
	if (
		environment === 'production' &&
		(command === 'promote' || command === 'rollback' || command === 'roll-forward')
	) {
		throw new Error(PRODUCTION_TRANSITION_DISABLED);
	}
}

const COMMAND_OPTIONS: Record<Command, ReadonlySet<string>> = {
	plan: new Set([
		'remote',
		'environment',
		'config',
		'database-id',
		'academic-period',
		'plusbtext-source',
		'access-source',
		'git-commit',
		'operator-id',
		'created-at',
		'expected-access-rows',
		'synthetic-variant',
		'output',
	]),
	stage: new Set([
		'remote',
		'environment',
		'config',
		'database-id',
		'plan',
		'plusbtext-source',
		'access-source',
		'synthetic-variant',
		'operator-id',
		'confirmation',
	]),
	review: new Set([
		'remote',
		'environment',
		'config',
		'database-id',
		'plan-id',
		'staged-digest',
		'reviewed-by',
		'reason-code',
		'reviewed-at',
		'confirmation',
	]),
	'recovery-evidence': new Set([
		'remote',
		'environment',
		'config',
		'database-id',
		'plan-id',
		'review-digest',
		'recovery-method',
		'recovery-reference-digest',
		'isolated-restore-database-id',
		'restore-verification-digest',
		'restored-current-pair',
		'verified-by',
		'verified-at',
		'valid-until',
		'output',
	]),
	confirmation: new Set([
		'remote',
		'environment',
		'config',
		'database-id',
		'action',
		'plan',
		'staged-digest',
		'review-digest',
		'recovery-evidence',
		'operator-id',
	]),
	promote: new Set([
		'remote',
		'environment',
		'config',
		'database-id',
		'plan-id',
		'review-digest',
		'recovery-evidence',
		'operator-id',
		'confirmation',
	]),
	verify: new Set(['remote', 'environment', 'config', 'database-id', 'plan-id']),
	rollback: new Set([
		'remote',
		'environment',
		'config',
		'database-id',
		'plan-id',
		'review-digest',
		'operator-id',
		'confirmation',
	]),
	'roll-forward': new Set([
		'remote',
		'environment',
		'config',
		'database-id',
		'plan-id',
		'review-digest',
		'operator-id',
		'confirmation',
	]),
};

interface ParsedCommand {
	command: Command;
	options: Map<string, string | true>;
}

export function parseLegacyReleaseArguments(values: string[]): ParsedCommand {
	const [commandValue, ...tokens] = values;
	if (!(commandValue in COMMAND_OPTIONS)) throw new Error('CLI_COMMAND_INVALID');
	const command = commandValue as Command;
	const allowed = COMMAND_OPTIONS[command];
	const options = new Map<string, string | true>();
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (!token.startsWith('--') || token.length === 2) throw new Error('CLI_ARGUMENT_INVALID');
		const key = token.slice(2);
		if (!allowed.has(key)) throw new Error('CLI_ARGUMENT_UNKNOWN');
		if (options.has(key)) throw new Error('CLI_ARGUMENT_DUPLICATE');
		if (key === 'remote') {
			if (tokens[index + 1] && !tokens[index + 1].startsWith('--')) {
				throw new Error('CLI_FLAG_VALUE_FORBIDDEN');
			}
			options.set(key, true);
			continue;
		}
		const value = tokens[index + 1];
		if (!value || value.startsWith('--')) throw new Error('CLI_ARGUMENT_VALUE_REQUIRED');
		options.set(key, value);
		index += 1;
	}
	if (options.get('remote') !== true) throw new Error('CLI_REMOTE_CONFIRMATION_REQUIRED');
	return { command, options };
}

function required(options: ReadonlyMap<string, string | true>, key: string): string {
	const value = options.get(key);
	if (typeof value !== 'string' || !value) {
		throw new Error(`CLI_${key.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
	}
	return value;
}

function optional(options: ReadonlyMap<string, string | true>, key: string): string | undefined {
	const value = options.get(key);
	return typeof value === 'string' ? value : undefined;
}

export function assertLegacyReleaseSourceBoundary(input: {
	environment: RemoteD1Environment;
	plusBTextPath?: string;
	accessPath?: string;
	syntheticVariant?: string;
}): LegacyReleasePlanArtifact['sourceClass'] {
	if (input.environment === 'preview') {
		if (input.plusBTextPath || input.accessPath) {
			throw new Error('LEGACY_RELEASE_PREVIEW_SOURCE_PATH_FORBIDDEN');
		}
		if (!input.syntheticVariant) {
			throw new Error('LEGACY_RELEASE_PREVIEW_SYNTHETIC_VARIANT_REQUIRED');
		}
		if (!(input.syntheticVariant in LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS)) {
			throw new Error('LEGACY_RELEASE_PREVIEW_SYNTHETIC_VARIANT_INVALID');
		}
		return 'synthetic_preview';
	}
	if (input.syntheticVariant) {
		throw new Error('LEGACY_RELEASE_PRODUCTION_SYNTHETIC_VARIANT_FORBIDDEN');
	}
	if (!input.plusBTextPath || !input.accessPath) {
		throw new Error('LEGACY_RELEASE_PRODUCTION_SOURCE_REQUIRED');
	}
	return 'current_production';
}

export function legacyPreviewSyntheticFixtureId(
	variant: string
): LegacyPreviewSyntheticFixtureId {
	if (!(variant in LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS)) {
		throw new Error('LEGACY_RELEASE_PREVIEW_SYNTHETIC_VARIANT_INVALID');
	}
	return LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS[variant as LegacyPreviewSyntheticVariant];
}

export function assertIndependentRecoveryVerifier(input: {
	verifiedBy: string;
	plannedBy: string | null;
	stagedBy: string | null;
	reviewedBy: string | null;
	promoterId?: string;
}): string {
	const verifiedBy = assertLegacyOperatorId(input.verifiedBy, 'verifiedBy');
	const releaseActors = [
		input.plannedBy,
		input.stagedBy,
		input.reviewedBy,
		input.promoterId,
	].filter((actor): actor is string => typeof actor === 'string');
	if (releaseActors.includes(verifiedBy)) {
		throw new Error('LEGACY_RECOVERY_EVIDENCE_OPERATOR_NOT_INDEPENDENT');
	}
	return verifiedBy;
}

export async function promotionConfirmationBindingDigest(
	options: ReadonlyMap<string, string | true>,
	recoveryEvidenceDigest?: string
): Promise<{
	reviewDigestSha256: string;
	recoveryEvidenceDigestSha256: string;
	operatorId: string;
	bindingDigestSha256: string;
}> {
	const reviewDigestSha256 = required(options, 'review-digest');
	if (!/^[0-9a-f]{64}$/u.test(reviewDigestSha256)) {
		throw new Error('CLI_REVIEW_DIGEST_INVALID');
	}
	const recoveryEvidenceDigestSha256 =
		recoveryEvidenceDigest ?? required(options, 'recovery-evidence-digest');
	if (!/^[0-9a-f]{64}$/u.test(recoveryEvidenceDigestSha256)) {
		throw new Error('CLI_RECOVERY_EVIDENCE_DIGEST_INVALID');
	}
	const operatorId = assertLegacyOperatorId(required(options, 'operator-id'));
	return {
		reviewDigestSha256,
		recoveryEvidenceDigestSha256,
		operatorId,
		bindingDigestSha256: await hashCanonical({
			reviewDigestSha256,
			recoveryEvidenceDigestSha256,
			operatorId,
		}),
	};
}

function parseEnvironment(value: string): RemoteD1Environment {
	if (value !== 'preview' && value !== 'production') throw new Error('CLI_ENVIRONMENT_INVALID');
	return value;
}

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function issueCounts(issues: readonly ImportIssueDraft[]): Record<ImportIssueSeverity, number> {
	const counts: Record<ImportIssueSeverity, number> = { info: 0, warning: 0, error: 0, fatal: 0 };
	for (const issue of issues) counts[issue.severity] += 1;
	return counts;
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
		else if (before.get(key) === hash) unchanged += 1;
		else changed += 1;
	}
	return {
		added,
		changed,
		retired: [...before.keys()].filter((key) => !after.has(key)).length,
		unchanged,
	};
}

interface RemotePreflight {
	period: NonNullable<Awaited<ReturnType<ImportRepository['getAcademicPeriod']>>>;
	currentPlusBTextVersionId: string | null;
	currentAccessVersionId: string | null;
	currentPlusDependencyId: string | null;
	plusHashes: Map<string, string>;
	accessHashes: Map<string, string>;
}

async function loadRemotePreflight(
	repository: ImportRepository,
	database: RemoteD1Boundary,
	academicPeriod: string
): Promise<RemotePreflight> {
	const period = await repository.getAcademicPeriod(academicPeriod);
	if (!period) throw new ImportStorageError('ACADEMIC_PERIOD_UNKNOWN');
	const current = await database.first<{
		plus_id: string | null;
		access_id: string | null;
		dependency_id: string | null;
	}>({
		sql: `SELECT
			(SELECT id FROM plusbtext_versions WHERE academic_period_id = ? AND is_published = 1) AS plus_id,
			(SELECT id FROM legacy_versions WHERE academic_period_id = ? AND is_published = 1) AS access_id,
			(SELECT plusbtext_version_id FROM legacy_versions
				WHERE academic_period_id = ? AND is_published = 1) AS dependency_id`,
		params: [period.id, period.id, period.id],
	});
	if (!current) throw new ImportStorageError('LEGACY_RELEASE_PREFLIGHT_MISSING');
	if (Boolean(current.plus_id) !== Boolean(current.access_id)) {
		throw new ImportStorageError('LEGACY_RELEASE_CURRENT_PAIR_INVALID');
	}
	if (current.access_id && current.dependency_id !== current.plus_id) {
		throw new ImportStorageError('LEGACY_RELEASE_CURRENT_DEPENDENCY_INVALID');
	}
	const plus = await database.all<{ storage_key: string; record_hash_sha256: string }>({
		sql: `SELECT 'old:' || old.storage_key AS storage_key, old.record_hash_sha256
			FROM plusbtext_old_groups AS old
			JOIN plusbtext_versions AS version ON version.id = old.plusbtext_version_id
			WHERE version.academic_period_id = ? AND version.is_published = 1
			UNION ALL
			SELECT 'target:' || target.storage_key, target.record_hash_sha256
			FROM plusbtext_targets AS target
			JOIN plusbtext_versions AS version ON version.id = target.plusbtext_version_id
			WHERE version.academic_period_id = ? AND version.is_published = 1`,
		params: [period.id, period.id],
	});
	const access = await database.all<{ source_access_id: number; source_hash: string }>({
		sql: `SELECT source_access_id, source_hash FROM legacy_source_rows
			WHERE academic_period_id = ? AND source_namespace = 'legacy_1' AND is_current = 1`,
		params: [period.id],
	});
	return {
		period,
		currentPlusBTextVersionId: current.plus_id,
		currentAccessVersionId: current.access_id,
		currentPlusDependencyId: current.dependency_id,
		plusHashes: new Map(plus.results.map((row) => [row.storage_key, row.record_hash_sha256])),
		accessHashes: new Map(
			access.results.map((row) => [String(row.source_access_id), row.source_hash])
		),
	};
}

interface ParsedSources {
	plusBytes: Buffer;
	accessBytes: Buffer;
	plusSnapshot: PlusBTextImportSnapshot;
	accessSnapshot: LegacyImportSnapshot;
	accessExtract?: AccessExtract;
	plusEvidence: LegacyReleaseSourceEvidence;
	accessEvidence: LegacyReleaseSourceEvidence;
}

async function parseSources(input: {
	sourceClass: LegacyReleasePlanArtifact['sourceClass'];
	syntheticFixtureId: LegacyPreviewSyntheticFixtureId | null;
	plusBTextPath?: string;
	accessPath?: string;
	academicPeriod: string;
	plusBTextVersionId: string;
	preflight: RemotePreflight;
}): Promise<ParsedSources> {
	let plusBytes: Buffer;
	let accessBytes: Buffer;
	let plusSnapshot: PlusBTextImportSnapshot;
	let accessSnapshot: LegacyImportSnapshot;
	let accessExtract: AccessExtract | undefined;
	if (input.sourceClass === 'synthetic_preview') {
		if (!input.syntheticFixtureId) {
			throw new Error('LEGACY_RELEASE_PREVIEW_SYNTHETIC_VARIANT_REQUIRED');
		}
		const variant = Object.entries(LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS).find(
			([, fixtureId]) => fixtureId === input.syntheticFixtureId
		)?.[0] as LegacyPreviewSyntheticVariant | undefined;
		if (!variant) throw new Error('LEGACY_RELEASE_PREVIEW_SYNTHETIC_VARIANT_INVALID');
		assertLegacyReleaseSourceBoundary({
			environment: 'preview',
			plusBTextPath: input.plusBTextPath,
			accessPath: input.accessPath,
			syntheticVariant: variant,
		});
		const synthetic = await buildLegacyPreviewSyntheticSources({
			academicPeriod: input.academicPeriod,
			plusBTextVersionId: input.plusBTextVersionId,
			variant,
		});
		({ plusBytes, accessBytes, plusSnapshot, accessSnapshot, accessExtract } = synthetic);
	} else {
		assertLegacyReleaseSourceBoundary({
			environment: 'production',
			plusBTextPath: input.plusBTextPath,
			accessPath: input.accessPath,
			syntheticVariant: undefined,
		});
		const [plusFileBytes, accessFileBytes] = await Promise.all([
			readFile(input.plusBTextPath!),
			readFile(input.accessPath!),
		]);
		plusBytes = Buffer.from(plusFileBytes);
		accessBytes = Buffer.from(accessFileBytes);
		plusSnapshot = await parsePlusBTextWorkbook(plusBytes);
		accessExtract = await readAccessDatabase(accessBytes);
		accessSnapshot = await parseAccessExtract({
			extract: accessExtract,
			academicPeriodCode: input.academicPeriod,
			plusBTextVersionId: input.plusBTextVersionId,
			plusBText: plusSnapshot,
		});
	}
	const plusAfter = new Map([
		...plusSnapshot.oldGroups.map(
			(row) => [`old:${row.storageKey}`, row.recordHashSha256] as const
		),
		...plusSnapshot.targets.map(
			(row) => [`target:${row.storageKey}`, row.recordHashSha256] as const
		),
	]);
	const accessAfter = new Map(
		accessSnapshot.sourceRows.map((row) => [String(row.sourceAccessId), row.sourceHashSha256])
	);
	return {
		plusBytes,
		accessBytes,
		plusSnapshot,
		accessSnapshot,
		accessExtract,
		plusEvidence: {
			sourceContractId: plusSnapshot.sourceContractId,
			sourceContractVersion: plusSnapshot.sourceContractVersion,
			sourceHashSha256: sha256(plusBytes),
			structuralFingerprintSha256: plusSnapshot.structuralFingerprintSha256,
			versionHashSha256: plusSnapshot.versionHashSha256,
			rows: {
				total: plusSnapshot.rowsTotal,
				staged: plusSnapshot.rowsStaged,
				skipped: plusSnapshot.rowsSkipped,
			},
			diff: diffMaps(input.preflight.plusHashes, plusAfter),
			issueCounts: issueCounts(plusSnapshot.issues),
		},
		accessEvidence: {
			sourceContractId: accessSnapshot.sourceContractId,
			sourceContractVersion: accessSnapshot.sourceContractVersion,
			sourceHashSha256: sha256(accessBytes),
			structuralFingerprintSha256: accessSnapshot.structuralFingerprintSha256,
			versionHashSha256: accessSnapshot.versionHashSha256,
			rows: {
				total: accessSnapshot.rowsTotal,
				staged: accessSnapshot.rowsStaged,
				skipped: accessSnapshot.rowsSkipped,
			},
			diff: diffMaps(input.preflight.accessHashes, accessAfter),
			issueCounts: issueCounts(accessSnapshot.issues),
		},
	};
}

function assertProtectedArtifactPath(value: string): string {
	const target = resolve(value);
	const importsRoot = resolve(process.cwd(), 'imports');
	const location = relative(importsRoot, target);
	if (
		!location ||
		dirname(target) !== importsRoot ||
		location.startsWith('..') ||
		resolve(importsRoot, location) !== target
	) {
		throw new Error('CLI_PROTECTED_ARTIFACT_PATH_REQUIRED');
	}
	if (!target.toLowerCase().endsWith('.json')) throw new Error('CLI_ARTIFACT_EXTENSION_INVALID');
	return target;
}

async function assertRegularArtifact(path: string): Promise<Awaited<ReturnType<typeof lstat>>> {
	let stat: Awaited<ReturnType<typeof lstat>>;
	try {
		stat = await lstat(path);
	} catch {
		throw new Error('CLI_PROTECTED_ARTIFACT_MISSING');
	}
	if (!stat.isFile() || stat.isSymbolicLink()) {
		throw new Error('CLI_PROTECTED_ARTIFACT_TYPE_INVALID');
	}
	return stat;
}

function currentWindowsSid(): string {
	let output: string;
	try {
		output = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
	} catch {
		throw new Error('CLI_PROTECTED_ARTIFACT_ACL_FAILED');
	}
	const sid = output.match(/S-\d-(?:\d+-)+\d+/u)?.[0];
	if (!sid) throw new Error('CLI_PROTECTED_ARTIFACT_ACL_FAILED');
	return sid;
}

function hardenWindowsArtifactAcl(path: string): void {
	const sid = currentWindowsSid();
	try {
		execFileSync('icacls.exe', [path, '/inheritance:r', '/grant:r', `*${sid}:(R,W)`], {
			stdio: ['ignore', 'ignore', 'ignore'],
		});
		const script =
			'$acl=Get-Acl -LiteralPath $env:KOLIBRI_PROTECTED_ARTIFACT_PATH; ' +
			'$items=@($acl.Access | ForEach-Object { ' +
			'[PSCustomObject]@{ sid=$_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; inherited=$_.IsInherited; type=$_.AccessControlType.ToString() } ' +
			'}); [Console]::Out.Write((ConvertTo-Json -Compress -InputObject $items))';
		const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
		const raw = execFileSync(
			'powershell.exe',
			['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript],
			{
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
				env: { ...process.env, KOLIBRI_PROTECTED_ARTIFACT_PATH: path },
			}
		);
		const parsed = JSON.parse(raw) as
			| {
					sid?: unknown;
					inherited?: unknown;
					type?: unknown;
			  }
			| Array<{
			sid?: unknown;
			inherited?: unknown;
			type?: unknown;
			  }>;
		const entries = Array.isArray(parsed) ? parsed : [parsed];
		if (
			!Array.isArray(entries) ||
			entries.length < 1 ||
			entries.some(
				(entry) =>
					entry.sid !== sid || entry.inherited !== false || entry.type !== 'Allow'
			)
		) {
			throw new Error('ACL_VERIFY_FAILED');
		}
	} catch (cause) {
		throw new Error('CLI_PROTECTED_ARTIFACT_ACL_FAILED', { cause });
	}
}

async function hardenAndVerifyProtectedArtifact(path: string): Promise<void> {
	const stat = await assertRegularArtifact(path);
	if (process.platform === 'win32') {
		hardenWindowsArtifactAcl(path);
		await assertRegularArtifact(path);
		return;
	}
	await chmod(path, 0o600);
	const protectedStat = await assertRegularArtifact(path);
	if (
		(Number(protectedStat.mode) & 0o077) !== 0 ||
		stat.dev !== protectedStat.dev ||
		stat.ino !== protectedStat.ino
	) {
		throw new Error('CLI_PROTECTED_ARTIFACT_PERMISSIONS_INVALID');
	}
}

export async function verifyProtectedArtifact(path: string): Promise<void> {
	await hardenAndVerifyProtectedArtifact(assertProtectedArtifactPath(path));
}

export async function writeProtectedArtifact(path: string, artifact: unknown): Promise<void> {
	const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
	await mkdir(dirname(path), { recursive: true });
	const directoryStat = await lstat(dirname(path));
	if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
		throw new Error('CLI_PROTECTED_ARTIFACT_DIRECTORY_INVALID');
	}
	try {
		await writeFile(path, serialized, {
			encoding: 'utf8',
			mode: 0o600,
			flag: 'wx',
		});
	} catch (cause) {
		if (
			typeof cause !== 'object' ||
			cause === null ||
			!('code' in cause) ||
			(cause as { code?: unknown }).code !== 'EEXIST'
		) {
			throw cause;
		}
		let existing: string;
		try {
			await hardenAndVerifyProtectedArtifact(path);
			existing = await readFile(path, 'utf8');
		} catch {
			throw new Error('CLI_PROTECTED_ARTIFACT_CONFLICT');
		}
		if (existing !== serialized) throw new Error('CLI_PROTECTED_ARTIFACT_CONFLICT');
	}
	await hardenAndVerifyProtectedArtifact(path);
}

export function assertGitCommitMatchesHead(requested: string, head: string): string {
	const normalizedRequested = requested.toLowerCase();
	const normalizedHead = head.trim().toLowerCase();
	if (!/^[0-9a-f]{40,64}$/u.test(normalizedRequested)) {
		throw new Error('CLI_GIT_COMMIT_INVALID');
	}
	if (!/^[0-9a-f]{40,64}$/u.test(normalizedHead)) {
		throw new Error('CLI_GIT_HEAD_INVALID');
	}
	if (normalizedRequested !== normalizedHead) {
		throw new Error('CLI_GIT_COMMIT_HEAD_MISMATCH');
	}
	return normalizedHead;
}

export function currentGitCommitSha(): string {
	let value: string;
	try {
		value = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
			cwd: process.cwd(),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
	} catch {
		throw new Error('CLI_GIT_HEAD_UNAVAILABLE');
	}
	const normalized = value.trim().toLowerCase();
	if (!/^[0-9a-f]{40,64}$/u.test(normalized)) throw new Error('CLI_GIT_HEAD_INVALID');
	return normalized;
}

export function assertGitWorktreeClean(status: string): void {
	if (status.trim()) throw new Error('CLI_GIT_WORKTREE_DIRTY');
}

export function currentGitWorktreeStatus(): string {
	try {
		return execFileSync(
			'git',
			['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'],
			{
				cwd: process.cwd(),
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			}
		);
	} catch {
		throw new Error('CLI_GIT_WORKTREE_STATUS_UNAVAILABLE');
	}
}

export function assertLegacyReleaseVerification(
	verification: LegacyReleaseVerification
): LegacyReleaseVerification {
	return assertLegacyReleaseVerificationReady(verification);
}

async function readPlanArtifact(path: string): Promise<LegacyReleasePlanArtifact> {
	const protectedPath = assertProtectedArtifactPath(path);
	await verifyProtectedArtifact(protectedPath);
	const value = JSON.parse(await readFile(protectedPath, 'utf8')) as LegacyReleasePlanArtifact;
	return verifyLegacyReleasePlan(value);
}

async function readRecoveryEvidenceArtifact(path: string): Promise<LegacyRecoveryEvidenceArtifact> {
	const protectedPath = assertProtectedArtifactPath(path);
	await verifyProtectedArtifact(protectedPath);
	return JSON.parse(await readFile(protectedPath, 'utf8')) as LegacyRecoveryEvidenceArtifact;
}

function printSafe(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function assertReleaseControlTarget(
	control: NonNullable<Awaited<ReturnType<ImportRepository['legacyReleaseControl']>>>,
	target: { environment: RemoteD1Environment; databaseId: string }
): void {
	if (
		control.environment !== target.environment ||
		control.target_database_id !== target.databaseId
	) {
		throw new Error('LEGACY_RELEASE_PLAN_TARGET_MISMATCH');
	}
}

function assertExecutableCandidate(gitCommitSha: string): void {
	assertGitWorktreeClean(currentGitWorktreeStatus());
	assertGitCommitMatchesHead(gitCommitSha, currentGitCommitSha());
}

async function legacyReleaseAttemptIdentity(input: {
	repository: ImportRepository;
	plan: LegacyReleasePlanArtifact;
	sourceKind: 'plusbtext' | 'access';
	runFingerprint: string;
	operatorId: string;
	now: string;
}): Promise<{ runId: string; versionId: string; attemptNo: number }> {
	const latest = await input.repository.latestRunAttempt(input.runFingerprint);
	let attemptNo = 1;
	if (latest) {
		if (latest.status === 'promoted') {
			throw new ImportStorageError('LEGACY_RELEASE_SOURCE_ALREADY_PROMOTED');
		}
		if (latest.status === 'failed') {
			await input.repository.discardFailedLegacyStaging({
				runId: latest.id,
				sourceKind: input.sourceKind,
				operatorId: input.operatorId,
				now: input.now,
			});
			attemptNo = latest.attempt_no + 1;
		} else {
			attemptNo = latest.attempt_no;
		}
	}
	const roleSuffix = attemptNo === 1 ? '' : `-attempt-${attemptNo}`;
	const runId = await deterministicLegacyReleaseUuid({
		planDigestSha256: input.plan.planDigestSha256,
		role: `${input.sourceKind}-run${roleSuffix}`,
	});
	const versionId = await deterministicLegacyReleaseUuid({
		planDigestSha256: input.plan.planDigestSha256,
		role: `${input.sourceKind}-version${roleSuffix}`,
	});
	if (latest && latest.status !== 'failed' && latest.id !== runId) {
		throw new ImportStorageError('LEGACY_RELEASE_RUN_FINGERPRINT_BUSY');
	}
	return { runId, versionId, attemptNo };
}

async function stageRun(input: {
	repository: ImportRepository;
	plan: LegacyReleasePlanArtifact;
	preflight: RemotePreflight;
	parsed: ParsedSources;
	stageOperatorId: string;
	now: string;
}): Promise<{
	plus: StagedImportResult;
	access: StagedImportResult;
	stagedDigestSha256: string;
	verificationContract: LegacyReleaseVerificationContract;
}> {
	const plusDependencies = await buildDependencySet({
		source_contract: `${input.parsed.plusSnapshot.sourceContractId}:${input.parsed.plusSnapshot.sourceContractVersion}`,
	});
	const plusFingerprint = await buildRunFingerprint({
		sourceKind: 'plusbtext',
		academicPeriodId: input.preflight.period.id,
		sourceHashSha256: input.plan.plusBText.sourceHashSha256,
		dependencySetHashSha256: plusDependencies.hashSha256,
	});
	if (await input.repository.findPromotedRun(plusFingerprint)) {
		throw new ImportStorageError('LEGACY_RELEASE_SOURCE_ALREADY_PROMOTED');
	}
	const plusIdentity = await legacyReleaseAttemptIdentity({
		repository: input.repository,
		plan: input.plan,
		sourceKind: 'plusbtext',
		runFingerprint: plusFingerprint,
		operatorId: input.stageOperatorId,
		now: input.now,
	});
	const plusRun = await input.repository.createRun({
		runId: plusIdentity.runId,
		sourceKind: 'plusbtext',
		academicPeriodId: input.preflight.period.id,
		sourceLabel: 'admin-xlsm-plusbtext',
		sourceHashSha256: input.plan.plusBText.sourceHashSha256,
		sourceContractId: input.parsed.plusSnapshot.sourceContractId,
		sourceContractVersion: input.parsed.plusSnapshot.sourceContractVersion,
		structuralFingerprintSha256: input.parsed.plusSnapshot.structuralFingerprintSha256,
		dependencyHashes: plusDependencies.canonical,
		dependencySetHashSha256: plusDependencies.hashSha256,
		runFingerprint: plusFingerprint,
		now: input.now,
	});
	const plus = await input.repository.stagePlusBText({
		runId: plusRun.runId,
		versionId: plusIdentity.versionId,
		period: input.preflight.period,
		snapshot: input.parsed.plusSnapshot,
		now: input.now,
	});
	if (plus.status !== 'validated')
		throw new ImportStorageError('LEGACY_RELEASE_PLUSB_VALIDATION_FAILED');

	const accessSnapshot = await parseAccessExtract({
		extract:
			input.parsed.accessExtract ?? (await readAccessDatabase(input.parsed.accessBytes)),
		academicPeriodCode: input.plan.academicPeriod,
		plusBTextVersionId: plus.versionId,
		plusBText: input.parsed.plusSnapshot,
	});
	const accessDependencies = await buildDependencySet({
		plusbtext_version_sha256: plus.versionHashSha256,
		source_contract: `${accessSnapshot.sourceContractId}:${accessSnapshot.sourceContractVersion}`,
	});
	const accessFingerprint = await buildRunFingerprint({
		sourceKind: 'access',
		academicPeriodId: input.preflight.period.id,
		sourceHashSha256: input.plan.access.sourceHashSha256,
		dependencySetHashSha256: accessDependencies.hashSha256,
	});
	if (await input.repository.findPromotedRun(accessFingerprint)) {
		throw new ImportStorageError('LEGACY_RELEASE_SOURCE_ALREADY_PROMOTED');
	}
	const accessIdentity = await legacyReleaseAttemptIdentity({
		repository: input.repository,
		plan: input.plan,
		sourceKind: 'access',
		runFingerprint: accessFingerprint,
		operatorId: input.stageOperatorId,
		now: input.now,
	});
	const accessRun = await input.repository.createRun({
		runId: accessIdentity.runId,
		sourceKind: 'access',
		academicPeriodId: input.preflight.period.id,
		sourceLabel: 'access-tblkartei',
		sourceHashSha256: input.plan.access.sourceHashSha256,
		sourceContractId: accessSnapshot.sourceContractId,
		sourceContractVersion: accessSnapshot.sourceContractVersion,
		structuralFingerprintSha256: accessSnapshot.structuralFingerprintSha256,
		dependencyHashes: accessDependencies.canonical,
		dependencySetHashSha256: accessDependencies.hashSha256,
		runFingerprint: accessFingerprint,
		now: input.now,
	});
	const access = await input.repository.stageAccess({
		runId: accessRun.runId,
		versionId: accessIdentity.versionId,
		period: input.preflight.period,
		snapshot: accessSnapshot,
		now: input.now,
	});
	if (access.status !== 'validated')
		throw new ImportStorageError('LEGACY_RELEASE_ACCESS_VALIDATION_FAILED');
	if (plus.verificationRows?.kind !== 'plusbtext' || access.verificationRows?.kind !== 'access') {
		throw new ImportStorageError('LEGACY_RELEASE_VERIFICATION_COUNTS_MISSING');
	}
	const verificationContract: LegacyReleaseVerificationContract = {
		plusBText: {
			rowsTotal: input.plan.plusBText.rows.total,
			rowsStaged: input.plan.plusBText.rows.staged,
			rowsSkipped: input.plan.plusBText.rows.skipped,
			oldGroups: plus.verificationRows.oldGroups,
			targets: plus.verificationRows.targets,
		},
		access: {
			rowsTotal: input.plan.access.rows.total,
			rowsStaged: input.plan.access.rows.staged,
			rowsSkipped: input.plan.access.rows.skipped,
			sourceRows: access.verificationRows.sourceRows,
			families: access.verificationRows.families,
			emails: access.verificationRows.emails,
			children: access.verificationRows.children,
			enrollments: access.verificationRows.enrollments,
			projectedFamilies: access.verificationRows.projectedFamilies,
			projectedEmails: access.verificationRows.projectedEmails,
			projectedChildren: access.verificationRows.projectedChildren,
			projectedEnrollments: access.verificationRows.projectedEnrollments,
		},
		issues: {
			info: plus.issueCounts.info + access.issueCounts.info,
			warning: plus.issueCounts.warning + access.issueCounts.warning,
			error: plus.issueCounts.error + access.issueCounts.error,
			fatal: plus.issueCounts.fatal + access.issueCounts.fatal,
		},
	};
	const stagedDigestSha256 = await hashCanonical({
		planDigestSha256: input.plan.planDigestSha256,
		plannedBy: input.plan.plannedBy,
		stagedBy: input.stageOperatorId,
		verificationContract,
		plus: {
			runId: plus.runId,
			versionId: plus.versionId,
			versionHashSha256: plus.versionHashSha256,
			diff: plus.diff,
			issueCounts: plus.issueCounts,
		},
		access: {
			runId: access.runId,
			versionId: access.versionId,
			versionHashSha256: access.versionHashSha256,
			diff: access.diff,
			issueCounts: access.issueCounts,
		},
	});
	return { plus, access, stagedDigestSha256, verificationContract };
}

async function main(): Promise<void> {
	const { command, options } = parseLegacyReleaseArguments(process.argv.slice(2));
	const environment = parseEnvironment(required(options, 'environment'));
	const configPath = required(options, 'config');
	if (
		configPath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase() ===
		'wrangler.example.toml'
	) {
		throw new Error('CLI_EXAMPLE_CONFIG_FORBIDDEN');
	}
	const databaseId = required(options, 'database-id');
	const config = unstable_readConfig({ config: configPath }, { hideWarnings: true });
	const target = assertRemoteD1ConfigTarget(config, environment, databaseId);
	assertLegacyProductionTransitionBoundary(environment, command);

	if (command === 'confirmation') {
		const plan = await readPlanArtifact(required(options, 'plan'));
		assertExecutableCandidate(plan.gitCommitSha);
		if (plan.environment !== environment || plan.targetDatabaseId !== target.databaseId) {
			throw new Error('LEGACY_RELEASE_PLAN_TARGET_MISMATCH');
		}
		const action = required(options, 'action');
		if (!['stage', 'review', 'promote', 'rollback', 'roll-forward'].includes(action)) {
			throw new Error('CLI_CONFIRMATION_ACTION_INVALID');
		}
		const actionOptions: Record<string, readonly string[]> = {
			stage: [],
			review: ['staged-digest'],
			promote: ['review-digest', 'recovery-evidence', 'operator-id'],
			rollback: ['review-digest', 'operator-id'],
			'roll-forward': ['review-digest', 'operator-id'],
		};
		const commonOptions = new Set([
			'remote',
			'environment',
			'config',
			'database-id',
			'action',
			'plan',
		]);
		const permitted = new Set([...commonOptions, ...actionOptions[action]]);
		if ([...options.keys()].some((key) => !permitted.has(key))) {
			throw new Error('CLI_CONFIRMATION_ARGUMENT_INVALID');
		}
		let bindingDigestSha256: string;
		if (action === 'stage') {
			bindingDigestSha256 = plan.planDigestSha256;
		} else if (action === 'review') {
			bindingDigestSha256 = required(options, 'staged-digest');
			if (!/^[0-9a-f]{64}$/u.test(bindingDigestSha256)) {
				throw new Error('CLI_STAGED_DIGEST_INVALID');
			}
		} else {
			const reviewDigestSha256 = required(options, 'review-digest');
			const operatorId = assertLegacyOperatorId(required(options, 'operator-id'));
			if (!/^[0-9a-f]{64}$/u.test(reviewDigestSha256)) {
				throw new Error('CLI_REVIEW_DIGEST_INVALID');
			}
			if (action === 'promote') {
				const planId = await deterministicLegacyReleaseUuid({
					planDigestSha256: plan.planDigestSha256,
					role: 'plan',
				});
				const evidence = await assertLegacyRecoveryEvidenceForPromotion({
					artifact: await readRecoveryEvidenceArtifact(
						required(options, 'recovery-evidence')
					),
					environment,
					accountId: target.accountId,
					targetDatabaseId: target.databaseId,
					planId,
					reviewDigestSha256,
					expectedCurrentPair:
						plan.expectedCurrent.accessVersionId === null ? 'none' : 'previous',
					now: new Date().toISOString(),
				});
				bindingDigestSha256 = (
					await promotionConfirmationBindingDigest(
						new Map([
							['review-digest', reviewDigestSha256],
							['operator-id', operatorId],
						]),
						evidence.recoveryEvidenceDigestSha256
					)
				).bindingDigestSha256;
			} else {
				bindingDigestSha256 = await hashCanonical({ reviewDigestSha256, operatorId });
			}
		}
		const confirmation = expectedRemoteImportConfirmation({
			action: action as 'stage' | 'review' | 'promote' | 'rollback' | 'roll-forward',
			target,
			bindingDigestSha256,
		});
		printSafe({ status: 'confirmation-created', action, confirmation });
		return;
	}

	const token = process.env.CLOUDFLARE_API_TOKEN;
	if (!token) throw new Error('CLOUDFLARE_API_TOKEN_REQUIRED');
	const database = new RemoteD1Boundary(target, token);
	const repository = new ImportRepository(database);

	if (command === 'plan') {
		const academicPeriod = required(options, 'academic-period');
		const plannedBy = assertLegacyOperatorId(required(options, 'operator-id'));
		const syntheticVariant = optional(options, 'synthetic-variant');
		const sourceClass = assertLegacyReleaseSourceBoundary({
			environment,
			plusBTextPath: optional(options, 'plusbtext-source'),
			accessPath: optional(options, 'access-source'),
			syntheticVariant,
		});
		const syntheticFixtureId =
			environment === 'preview'
				? legacyPreviewSyntheticFixtureId(syntheticVariant!)
				: null;
		assertGitWorktreeClean(currentGitWorktreeStatus());
		const gitCommitSha = assertGitCommitMatchesHead(
			required(options, 'git-commit'),
			currentGitCommitSha()
		);
		const preflight = await loadRemotePreflight(repository, database, academicPeriod);
		const parsed = await parseSources({
			sourceClass,
			syntheticFixtureId,
			plusBTextPath: optional(options, 'plusbtext-source'),
			accessPath: optional(options, 'access-source'),
			academicPeriod,
			plusBTextVersionId: '00000000-0000-4000-8000-000000000000',
			preflight,
		});
		const expectedAccessRows = Number(
			environment === 'preview'
				? optional(options, 'expected-access-rows') ?? LEGACY_PREVIEW_SYNTHETIC_ROWS
				: required(options, 'expected-access-rows')
		);
		if (!Number.isSafeInteger(expectedAccessRows) || expectedAccessRows < 1) {
			throw new Error('CLI_EXPECTED_ACCESS_ROWS_INVALID');
		}
		if (parsed.accessEvidence.rows.total !== expectedAccessRows) {
			throw new Error('LEGACY_RELEASE_ACCESS_ROW_COUNT_MISMATCH');
		}
		const plan = await buildLegacyReleasePlan({
			schemaVersion: 3,
			environment,
			sourceClass,
			syntheticFixtureId,
			targetDatabaseId: target.databaseId,
			academicPeriod,
			gitCommitSha,
			plannedBy,
			expectedCurrent: {
				plusBTextVersionId: preflight.currentPlusBTextVersionId,
				accessVersionId: preflight.currentAccessVersionId,
			},
			plusBText: parsed.plusEvidence,
			access: parsed.accessEvidence,
			createdAt: required(options, 'created-at'),
		});
		await writeProtectedArtifact(
			assertProtectedArtifactPath(required(options, 'output')),
			plan
		);
		printSafe(safeLegacyReleasePlanSummary(plan));
		return;
	}

	if (command === 'stage') {
		const plan = await readPlanArtifact(required(options, 'plan'));
		assertExecutableCandidate(plan.gitCommitSha);
		if (plan.environment !== environment || plan.targetDatabaseId !== target.databaseId) {
			throw new Error('LEGACY_RELEASE_PLAN_TARGET_MISMATCH');
		}
		const expectedConfirmation = expectedRemoteImportConfirmation({
			action: 'stage',
			target,
			bindingDigestSha256: plan.planDigestSha256,
		});
		if (required(options, 'confirmation') !== expectedConfirmation) {
			throw new Error('CLI_IMPORT_CONFIRMATION_INVALID');
		}
		const syntheticVariant = optional(options, 'synthetic-variant');
		const sourceClass = assertLegacyReleaseSourceBoundary({
			environment,
			plusBTextPath: optional(options, 'plusbtext-source'),
			accessPath: optional(options, 'access-source'),
			syntheticVariant,
		});
		const syntheticFixtureId =
			environment === 'preview'
				? legacyPreviewSyntheticFixtureId(syntheticVariant!)
				: null;
		if (
			sourceClass !== plan.sourceClass ||
			syntheticFixtureId !== plan.syntheticFixtureId
		) {
			throw new Error('LEGACY_RELEASE_PLAN_SOURCE_VARIANT_MISMATCH');
		}
		const preflight = await loadRemotePreflight(repository, database, plan.academicPeriod);
		const parsed = await parseSources({
			sourceClass: plan.sourceClass,
			syntheticFixtureId: plan.syntheticFixtureId,
			plusBTextPath: optional(options, 'plusbtext-source'),
			accessPath: optional(options, 'access-source'),
			academicPeriod: plan.academicPeriod,
			plusBTextVersionId: '00000000-0000-4000-8000-000000000000',
			preflight,
		});
		const { planDigestSha256: _plannedDigest, ...plannedPayload } = plan;
		const refreshed = await buildLegacyReleasePlan({
			...plannedPayload,
			plusBText: parsed.plusEvidence,
			access: parsed.accessEvidence,
		});
		if (refreshed.planDigestSha256 !== plan.planDigestSha256) {
			throw new Error('LEGACY_RELEASE_PLAN_SOURCE_CHANGED');
		}
		const now = new Date().toISOString();
		const stageOperatorId = assertLegacyOperatorId(required(options, 'operator-id'));
		if (stageOperatorId === plan.plannedBy) {
			throw new Error('LEGACY_RELEASE_OPERATOR_SEPARATION_REQUIRED');
		}
		const staged = await stageRun({
			repository,
			plan,
			preflight,
			parsed,
			stageOperatorId,
			now,
		});
		const release = await repository.createLegacyReleasePlan({
			planId: await deterministicLegacyReleaseUuid({
				planDigestSha256: plan.planDigestSha256,
				role: 'plan',
			}),
			planDigestSha256: plan.planDigestSha256,
			stagedDigestSha256: staged.stagedDigestSha256,
			environment,
			targetDatabaseId: target.databaseId,
			gitCommitSha: plan.gitCommitSha,
			plannedBy: plan.plannedBy,
			stagedBy: stageOperatorId,
			academicPeriodId: preflight.period.id,
			plusBTextRunId: staged.plus.runId,
			accessRunId: staged.access.runId,
			plusBTextVersionId: staged.plus.versionId,
			accessVersionId: staged.access.versionId,
			expectedCurrentPlusBTextVersionId: plan.expectedCurrent.plusBTextVersionId,
			expectedCurrentAccessVersionId: plan.expectedCurrent.accessVersionId,
			verificationContract: staged.verificationContract,
			safeSummary: {
				plusBText: {
					diff: staged.plus.diff,
					issueCounts: staged.plus.issueCounts,
					rowsPromotable: staged.plus.rowsPromotable,
				},
				access: {
					diff: staged.access.diff,
					issueCounts: staged.access.issueCounts,
					rowsPromotable: staged.access.rowsPromotable,
				},
			},
			now,
		});
		printSafe({
			status: 'staged',
			environment,
			academicPeriod: plan.academicPeriod,
			planId: release.id,
			stagedDigestSha256: release.staged_digest_sha256,
			plusBText: {
				diff: staged.plus.diff,
				issueCounts: staged.plus.issueCounts,
				rowsPromotable: staged.plus.rowsPromotable,
			},
			access: {
				diff: staged.access.diff,
				issueCounts: staged.access.issueCounts,
				rowsPromotable: staged.access.rowsPromotable,
			},
		});
		return;
	}

	if (command === 'review') {
		const planId = required(options, 'plan-id');
		const control = await repository.legacyReleaseControl(planId);
		if (!control) throw new ImportStorageError('LEGACY_RELEASE_PLAN_NOT_FOUND');
		assertReleaseControlTarget(control, target);
		assertExecutableCandidate(control.git_commit_sha);
		const stagedDigestSha256 = required(options, 'staged-digest');
		const expectedConfirmation = expectedRemoteImportConfirmation({
			action: 'review',
			target,
			bindingDigestSha256: stagedDigestSha256,
		});
		if (required(options, 'confirmation') !== expectedConfirmation) {
			throw new Error('CLI_IMPORT_CONFIRMATION_INVALID');
		}
		const review = await buildLegacyReleaseReviewBinding({
			stagedDigestSha256,
			reviewedBy: required(options, 'reviewed-by'),
			reasonCode: required(options, 'reason-code'),
			reviewedAt: required(options, 'reviewed-at'),
		});
		const updated = await repository.reviewLegacyReleasePlan({
			planId,
			stagedDigestSha256,
			reviewDigestSha256: review.reviewDigestSha256,
			reviewedBy: review.reviewedBy,
			reasonCode: review.reasonCode,
			now: review.reviewedAt,
		});
		printSafe({
			status: updated.status,
			planId: updated.id,
			reviewDigestSha256: review.reviewDigestSha256,
		});
		return;
	}

	if (command === 'recovery-evidence') {
		const planId = required(options, 'plan-id');
		const control = await repository.legacyReleaseControl(planId);
		if (!control) throw new ImportStorageError('LEGACY_RELEASE_PLAN_NOT_FOUND');
		assertReleaseControlTarget(control, target);
		assertExecutableCandidate(control.git_commit_sha);
		const recoveryMethod = required(options, 'recovery-method');
		if (recoveryMethod !== 'd1-bookmark' && recoveryMethod !== 'd1-backup') {
			throw new Error('CLI_RECOVERY_METHOD_INVALID');
		}
		const restoredCurrentPair = required(options, 'restored-current-pair');
		if (restoredCurrentPair !== 'none' && restoredCurrentPair !== 'previous') {
			throw new Error('CLI_RESTORED_CURRENT_PAIR_INVALID');
		}
		const reviewDigestSha256 = required(options, 'review-digest');
		if (
			control.status !== 'reviewed' ||
			control.review_digest_sha256 !== reviewDigestSha256 ||
			!control.reviewed_by
		) {
			throw new Error('LEGACY_RECOVERY_EVIDENCE_REVIEW_BINDING_MISMATCH');
		}
		const expectedRestoredCurrentPair =
			control.expected_current_access_version_id === null ? 'none' : 'previous';
		if (restoredCurrentPair !== expectedRestoredCurrentPair) {
			throw new Error('LEGACY_RECOVERY_EVIDENCE_CURRENT_PAIR_MISMATCH');
		}
		const verifiedBy = assertIndependentRecoveryVerifier({
			verifiedBy: required(options, 'verified-by'),
			plannedBy: control.planned_by,
			stagedBy: control.staged_by,
			reviewedBy: control.reviewed_by,
		});
		const evidence = await buildLegacyRecoveryEvidence({
			schemaVersion: 1,
			environment,
			accountId: target.accountId,
			targetDatabaseId: target.databaseId,
			planId,
			reviewDigestSha256,
			recoveryMethod,
			recoveryReferenceDigestSha256: required(options, 'recovery-reference-digest'),
			isolatedRestoreDatabaseId: required(options, 'isolated-restore-database-id'),
			restoreVerificationDigestSha256: required(options, 'restore-verification-digest'),
			restoredCurrentPair,
			verifiedBy,
			verifiedAt: required(options, 'verified-at'),
			validUntil: required(options, 'valid-until'),
		});
		await writeProtectedArtifact(
			assertProtectedArtifactPath(required(options, 'output')),
			evidence
		);
		printSafe({
			status: 'recovery-evidence-created',
			environment,
			planId,
			recoveryEvidenceDigestSha256: evidence.recoveryEvidenceDigestSha256,
			validUntil: evidence.validUntil,
		});
		return;
	}

	if (command === 'verify') {
		const planId = required(options, 'plan-id');
		const control = await repository.legacyReleaseControl(planId);
		if (!control) throw new ImportStorageError('LEGACY_RELEASE_PLAN_NOT_FOUND');
		assertReleaseControlTarget(control, target);
		assertExecutableCandidate(control.git_commit_sha);
		const verification = await repository.verifyLegacyReleasePlan(planId);
		printSafe(assertLegacyReleaseVerification(verification));
		return;
	}

	const planId = required(options, 'plan-id');
	const control = await repository.legacyReleaseControl(planId);
	if (!control) throw new ImportStorageError('LEGACY_RELEASE_PLAN_NOT_FOUND');
	assertReleaseControlTarget(control, target);
	assertExecutableCandidate(control.git_commit_sha);
	const operatorId = assertLegacyOperatorId(required(options, 'operator-id'));
	const reviewDigestOption = required(options, 'review-digest');
	let recoveryEvidenceDigestSha256: string | undefined;
	if (command === 'promote') {
		const now = new Date().toISOString();
		const evidence = await assertLegacyRecoveryEvidenceForPromotion({
			artifact: await readRecoveryEvidenceArtifact(required(options, 'recovery-evidence')),
			environment,
			accountId: target.accountId,
			targetDatabaseId: target.databaseId,
			planId,
			reviewDigestSha256: reviewDigestOption,
			expectedCurrentPair:
				control.expected_current_access_version_id === null ? 'none' : 'previous',
			now,
		});
		assertIndependentRecoveryVerifier({
			verifiedBy: evidence.verifiedBy,
			plannedBy: control.planned_by,
			stagedBy: control.staged_by,
			reviewedBy: control.reviewed_by,
			promoterId: operatorId,
		});
		recoveryEvidenceDigestSha256 = evidence.recoveryEvidenceDigestSha256;
	}
	const promotionBinding =
		command === 'promote'
			? await promotionConfirmationBindingDigest(options, recoveryEvidenceDigestSha256)
			: null;
	const reviewDigestSha256 =
		promotionBinding?.reviewDigestSha256 ?? reviewDigestOption;
	recoveryEvidenceDigestSha256 = promotionBinding?.recoveryEvidenceDigestSha256;
	const confirmationBindingDigestSha256 =
		promotionBinding?.bindingDigestSha256 ??
		(await hashCanonical({ reviewDigestSha256, operatorId }));
	const expectedConfirmation = expectedRemoteImportConfirmation({
		action: command,
		target,
		bindingDigestSha256: confirmationBindingDigestSha256,
	});
	if (required(options, 'confirmation') !== expectedConfirmation) {
		throw new Error('CLI_IMPORT_CONFIRMATION_INVALID');
	}
	const action = command === 'roll-forward' ? 'roll_forward' : command;
	const transition = await repository.transitionLegacyBundle({
		planId,
		reviewDigestSha256,
		recoveryEvidenceDigestSha256,
		operatorId,
		action,
		now: new Date().toISOString(),
	});
	printSafe({ status: transition.action, ...transition });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
	main().catch((error: unknown) => {
		let delivery: 'ambiguous' | undefined;
		let current = error;
		for (
			let depth = 0;
			depth < 8 && typeof current === 'object' && current !== null;
			depth += 1
		) {
			if (
				'delivery' in current &&
				(current as { delivery?: unknown }).delivery === 'ambiguous'
			) {
				delivery = 'ambiguous';
				break;
			}
			current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
		}
		const errorCode =
			error instanceof ImportStorageError || error instanceof RemoteD1Error
				? error.code
				: error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)
					? error.message
					: 'LEGACY_RELEASE_COMMAND_FAILED';
		printSafe({
			status: 'failed',
			errorCode,
			...(delivery ? { delivery } : {}),
		});
		process.exitCode = 1;
	});
}

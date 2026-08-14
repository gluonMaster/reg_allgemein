import { hashCanonical } from './canonical';
import type { ImportDiffSummary, ImportIssueSeverity } from './types';

export type LegacyReleaseEnvironment = 'preview' | 'production';

export const LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS = {
	baseline: 'legacy-preview-synthetic-baseline-v1',
	candidate: 'legacy-preview-synthetic-candidate-v1',
} as const;

export type LegacyPreviewSyntheticVariant = keyof typeof LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS;
export type LegacyPreviewSyntheticFixtureId =
	(typeof LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS)[LegacyPreviewSyntheticVariant];

export interface LegacyReleaseSourceEvidence {
	sourceContractId: 'admin-xlsm-plusbtext' | 'access-tblkartei';
	sourceContractVersion: number;
	sourceHashSha256: string;
	structuralFingerprintSha256: string;
	versionHashSha256: string;
	rows: {
		total: number;
		staged: number;
		skipped: number;
	};
	diff: ImportDiffSummary;
	issueCounts: Record<ImportIssueSeverity, number>;
}

export interface LegacyReleasePlanPayload {
	schemaVersion: 3;
	environment: LegacyReleaseEnvironment;
	sourceClass: 'synthetic_preview' | 'current_production';
	syntheticFixtureId: LegacyPreviewSyntheticFixtureId | null;
	targetDatabaseId: string;
	academicPeriod: string;
	gitCommitSha: string;
	plannedBy: string;
	expectedCurrent: {
		plusBTextVersionId: string | null;
		accessVersionId: string | null;
	};
	plusBText: LegacyReleaseSourceEvidence;
	access: LegacyReleaseSourceEvidence;
	createdAt: string;
}

export interface LegacyReleasePlanArtifact extends LegacyReleasePlanPayload {
	planDigestSha256: string;
}

export interface LegacyReleaseReviewBinding {
	stagedDigestSha256: string;
	reviewedBy: string;
	reasonCode: string;
	reviewedAt: string;
	reviewDigestSha256: string;
}

export interface LegacyRecoveryEvidencePayload {
	schemaVersion: 1;
	environment: LegacyReleaseEnvironment;
	accountId: string;
	targetDatabaseId: string;
	planId: string;
	reviewDigestSha256: string;
	recoveryMethod: 'd1-bookmark' | 'd1-backup';
	recoveryReferenceDigestSha256: string;
	isolatedRestoreDatabaseId: string;
	restoreVerificationDigestSha256: string;
	restoredCurrentPair: 'none' | 'previous';
	verifiedBy: string;
	verifiedAt: string;
	validUntil: string;
}

export interface LegacyRecoveryEvidenceArtifact extends LegacyRecoveryEvidencePayload {
	recoveryEvidenceDigestSha256: string;
}

function assertSha256(value: string, field: string): void {
	if (!/^[0-9a-f]{64}$/u.test(value)) throw new TypeError(`${field} must be a SHA-256 digest.`);
}

function assertUuid(value: string, field: string): void {
	if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(value)) {
		throw new TypeError(`${field} must be a lowercase UUID.`);
	}
}

function assertInstant(value: string, field: string): void {
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
		throw new TypeError(`${field} must be a canonical UTC instant.`);
	}
}

export function assertLegacyOperatorId(value: string, field = 'operatorId'): string {
	if (!/^[a-z0-9][a-z0-9._:-]{2,63}$/u.test(value)) {
		throw new TypeError(`${field} must be an opaque operator ID.`);
	}
	return value;
}

function assertSourceEvidence(
	value: LegacyReleaseSourceEvidence,
	expectedContractId: LegacyReleaseSourceEvidence['sourceContractId']
): void {
	if (value.sourceContractId !== expectedContractId || value.sourceContractVersion !== 1) {
		throw new TypeError('Legacy release source contract is not approved.');
	}
	assertSha256(value.sourceHashSha256, `${expectedContractId}.sourceHashSha256`);
	assertSha256(
		value.structuralFingerprintSha256,
		`${expectedContractId}.structuralFingerprintSha256`
	);
	assertSha256(value.versionHashSha256, `${expectedContractId}.versionHashSha256`);
	for (const [name, count] of Object.entries({ ...value.rows, ...value.issueCounts })) {
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new TypeError(`${expectedContractId}.${name} must be a non-negative integer.`);
		}
	}
	for (const [name, count] of Object.entries(value.diff)) {
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new TypeError(`${expectedContractId}.diff.${name} must be a non-negative integer.`);
		}
	}
	if (value.rows.staged > value.rows.total || value.rows.skipped > value.rows.total) {
		throw new TypeError('Legacy release source row counts are inconsistent.');
	}
}

function assertPlanPayload(value: LegacyReleasePlanPayload): void {
	if (value.schemaVersion !== 3) throw new TypeError('Legacy release plan schema is unsupported.');
	if (value.environment !== 'preview' && value.environment !== 'production') {
		throw new TypeError('Legacy release environment is invalid.');
	}
	if (
		(value.environment === 'preview' && value.sourceClass !== 'synthetic_preview') ||
		(value.environment === 'production' && value.sourceClass !== 'current_production')
	) {
		throw new TypeError('Legacy release source class does not match the environment.');
	}
	const allowedSyntheticFixtures = Object.values(LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS);
	if (
		(value.environment === 'preview' &&
			!allowedSyntheticFixtures.includes(
				value.syntheticFixtureId as LegacyPreviewSyntheticFixtureId
			)) ||
		(value.environment === 'production' && value.syntheticFixtureId !== null)
	) {
		throw new TypeError('Legacy release synthetic fixture does not match the environment.');
	}
	assertUuid(value.targetDatabaseId, 'targetDatabaseId');
	if (!/^\d{4}-\d{4}$/u.test(value.academicPeriod)) {
		throw new TypeError('academicPeriod must be YYYY-YYYY.');
	}
	if (!/^[0-9a-f]{40,64}$/u.test(value.gitCommitSha)) {
		throw new TypeError('gitCommitSha must be a full hexadecimal commit ID.');
	}
	assertLegacyOperatorId(value.plannedBy, 'plannedBy');
	if (value.expectedCurrent.plusBTextVersionId) {
		assertUuid(value.expectedCurrent.plusBTextVersionId, 'expectedCurrent.plusBTextVersionId');
	}
	if (value.expectedCurrent.accessVersionId) {
		assertUuid(value.expectedCurrent.accessVersionId, 'expectedCurrent.accessVersionId');
	}
	if (
		Boolean(value.expectedCurrent.plusBTextVersionId) !==
		Boolean(value.expectedCurrent.accessVersionId)
	) {
		throw new TypeError('Expected current legacy versions must be both present or both absent.');
	}
	assertSourceEvidence(value.plusBText, 'admin-xlsm-plusbtext');
	assertSourceEvidence(value.access, 'access-tblkartei');
	assertInstant(value.createdAt, 'createdAt');
}

export async function buildLegacyReleasePlan(
	payload: LegacyReleasePlanPayload
): Promise<LegacyReleasePlanArtifact> {
	assertPlanPayload(payload);
	return {
		...structuredClone(payload),
		planDigestSha256: await hashCanonical(payload),
	};
}

export async function verifyLegacyReleasePlan(
	artifact: LegacyReleasePlanArtifact
): Promise<LegacyReleasePlanArtifact> {
	const { planDigestSha256, ...payload } = artifact;
	assertSha256(planDigestSha256, 'planDigestSha256');
	const expected = await buildLegacyReleasePlan(payload);
	if (expected.planDigestSha256 !== planDigestSha256) {
		throw new Error('LEGACY_RELEASE_PLAN_DIGEST_MISMATCH');
	}
	return expected;
}

export async function buildLegacyReleaseReviewBinding(input: {
	stagedDigestSha256: string;
	reviewedBy: string;
	reasonCode: string;
	reviewedAt: string;
}): Promise<LegacyReleaseReviewBinding> {
	assertSha256(input.stagedDigestSha256, 'stagedDigestSha256');
	assertLegacyOperatorId(input.reviewedBy, 'reviewedBy');
	if (!/^[A-Z0-9][A-Z0-9_.:-]{2,95}$/u.test(input.reasonCode)) {
		throw new TypeError('reasonCode must be a safe operational code.');
	}
	assertInstant(input.reviewedAt, 'reviewedAt');
	const payload = {
		stagedDigestSha256: input.stagedDigestSha256,
		reviewedBy: input.reviewedBy,
		reasonCode: input.reasonCode,
		reviewedAt: input.reviewedAt,
	};
	return { ...payload, reviewDigestSha256: await hashCanonical(payload) };
}

export async function deterministicLegacyReleaseUuid(input: {
	planDigestSha256: string;
	role: string;
}): Promise<string> {
	assertSha256(input.planDigestSha256, 'planDigestSha256');
	if (!/^[a-z0-9][a-z0-9-]{1,95}$/u.test(input.role)) {
		throw new TypeError('Legacy release deterministic role is invalid.');
	}
	const hex = (await hashCanonical(input)).slice(0, 32).split('');
	hex[12] = '5';
	hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
	const value = hex.join('');
	return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function assertRecoveryEvidencePayload(value: LegacyRecoveryEvidencePayload): void {
	if (value.schemaVersion !== 1) {
		throw new TypeError('Legacy recovery evidence schema is unsupported.');
	}
	if (value.environment !== 'preview' && value.environment !== 'production') {
		throw new TypeError('Legacy recovery evidence environment is invalid.');
	}
	if (!/^[0-9a-f]{32}$/u.test(value.accountId)) {
		throw new TypeError('accountId must be a lowercase Cloudflare account ID.');
	}
	assertUuid(value.targetDatabaseId, 'targetDatabaseId');
	assertUuid(value.planId, 'planId');
	assertSha256(value.reviewDigestSha256, 'reviewDigestSha256');
	if (value.recoveryMethod !== 'd1-bookmark' && value.recoveryMethod !== 'd1-backup') {
		throw new TypeError('recoveryMethod is invalid.');
	}
	assertSha256(value.recoveryReferenceDigestSha256, 'recoveryReferenceDigestSha256');
	assertUuid(value.isolatedRestoreDatabaseId, 'isolatedRestoreDatabaseId');
	if (value.isolatedRestoreDatabaseId === value.targetDatabaseId) {
		throw new TypeError('Recovery verification must use an isolated database.');
	}
	assertSha256(value.restoreVerificationDigestSha256, 'restoreVerificationDigestSha256');
	if (value.restoredCurrentPair !== 'none' && value.restoredCurrentPair !== 'previous') {
		throw new TypeError('restoredCurrentPair is invalid.');
	}
	assertLegacyOperatorId(value.verifiedBy, 'verifiedBy');
	assertInstant(value.verifiedAt, 'verifiedAt');
	assertInstant(value.validUntil, 'validUntil');
	const validityMs = Date.parse(value.validUntil) - Date.parse(value.verifiedAt);
	if (validityMs <= 0 || validityMs > 24 * 60 * 60 * 1_000) {
		throw new TypeError('Recovery evidence validity must be greater than zero and at most 24 hours.');
	}
}

export async function buildLegacyRecoveryEvidence(
	payload: LegacyRecoveryEvidencePayload
): Promise<LegacyRecoveryEvidenceArtifact> {
	assertRecoveryEvidencePayload(payload);
	return {
		...structuredClone(payload),
		recoveryEvidenceDigestSha256: await hashCanonical(payload),
	};
}

export async function verifyLegacyRecoveryEvidence(
	artifact: LegacyRecoveryEvidenceArtifact
): Promise<LegacyRecoveryEvidenceArtifact> {
	const { recoveryEvidenceDigestSha256, ...payload } = artifact;
	assertSha256(recoveryEvidenceDigestSha256, 'recoveryEvidenceDigestSha256');
	const expected = await buildLegacyRecoveryEvidence(payload);
	if (expected.recoveryEvidenceDigestSha256 !== recoveryEvidenceDigestSha256) {
		throw new Error('LEGACY_RECOVERY_EVIDENCE_DIGEST_MISMATCH');
	}
	return expected;
}

export async function assertLegacyRecoveryEvidenceForPromotion(input: {
	artifact: LegacyRecoveryEvidenceArtifact;
	environment: LegacyReleaseEnvironment;
	accountId: string;
	targetDatabaseId: string;
	planId: string;
	reviewDigestSha256: string;
	expectedCurrentPair: 'none' | 'previous';
	now: string;
}): Promise<LegacyRecoveryEvidenceArtifact> {
	assertInstant(input.now, 'now');
	const artifact = await verifyLegacyRecoveryEvidence(input.artifact);
	if (
		artifact.environment !== input.environment ||
		artifact.accountId !== input.accountId ||
		artifact.targetDatabaseId !== input.targetDatabaseId ||
		artifact.planId !== input.planId ||
		artifact.reviewDigestSha256 !== input.reviewDigestSha256 ||
		artifact.restoredCurrentPair !== input.expectedCurrentPair ||
		artifact.verifiedBy === '' ||
		Date.parse(input.now) < Date.parse(artifact.verifiedAt) - 5 * 60 * 1_000 ||
		Date.parse(input.now) > Date.parse(artifact.validUntil)
	) {
		throw new Error('LEGACY_RECOVERY_EVIDENCE_BINDING_MISMATCH');
	}
	return artifact;
}

export function safeLegacyReleasePlanSummary(artifact: LegacyReleasePlanArtifact): {
	status: 'planned';
	environment: LegacyReleaseEnvironment;
	academicPeriod: string;
	contracts: { plusBText: string; access: string };
	sourceClass: LegacyReleasePlanPayload['sourceClass'];
	syntheticFixtureId: LegacyReleasePlanPayload['syntheticFixtureId'];
	rows: { plusBText: LegacyReleaseSourceEvidence['rows']; access: LegacyReleaseSourceEvidence['rows'] };
	diff: { plusBText: ImportDiffSummary; access: ImportDiffSummary };
	issueCounts: {
		plusBText: Record<ImportIssueSeverity, number>;
		access: Record<ImportIssueSeverity, number>;
	};
} {
	return {
		status: 'planned',
		environment: artifact.environment,
		academicPeriod: artifact.academicPeriod,
		sourceClass: artifact.sourceClass,
		syntheticFixtureId: artifact.syntheticFixtureId,
		contracts: {
			plusBText: `${artifact.plusBText.sourceContractId}:${artifact.plusBText.sourceContractVersion}`,
			access: `${artifact.access.sourceContractId}:${artifact.access.sourceContractVersion}`,
		},
		rows: { plusBText: artifact.plusBText.rows, access: artifact.access.rows },
		diff: { plusBText: artifact.plusBText.diff, access: artifact.access.diff },
		issueCounts: {
			plusBText: artifact.plusBText.issueCounts,
			access: artifact.access.issueCounts,
		},
	};
}

export interface LegacyStagedSafeSummary {
	plusBText: {
		diff: ImportDiffSummary;
		rowsPromotable: number;
		issueCounts: Record<ImportIssueSeverity, number>;
	};
	access: {
		diff: ImportDiffSummary;
		rowsPromotable: number;
		issueCounts: Record<ImportIssueSeverity, number>;
	};
}

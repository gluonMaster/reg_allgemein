import {
	buildLegacyReleasePlan,
	buildLegacyReleaseReviewBinding,
	safeLegacyReleasePlanSummary,
	verifyLegacyReleasePlan,
} from '$lib/server/import/legacy-release';

const digest = (character: string): string => character.repeat(64);

function source(
	contract: 'admin-xlsm-plusbtext' | 'access-tblkartei',
	marker: string
) {
	return {
		sourceContractId: contract,
		sourceContractVersion: 1,
		sourceHashSha256: digest(marker),
		structuralFingerprintSha256: digest(marker === 'a' ? 'b' : 'c'),
		versionHashSha256: digest(marker === 'a' ? 'd' : 'e'),
		rows: { total: 10, staged: 10, skipped: 0 },
		diff: { added: 10, changed: 0, retired: 0, unchanged: 0 },
		issueCounts: { info: 0, warning: 1, error: 0, fatal: 0 },
	};
}

describe('legacy release plan and review binding', () => {
	it('binds sources, target and expected current pair to an immutable digest', async () => {
		const plan = await buildLegacyReleasePlan({
			schemaVersion: 3,
			environment: 'preview',
			sourceClass: 'synthetic_preview',
			syntheticFixtureId: 'legacy-preview-synthetic-baseline-v1',
			targetDatabaseId: '11111111-1111-4111-8111-111111111111',
			academicPeriod: '2026-2027',
			gitCommitSha: '1'.repeat(40),
			plannedBy: 'operator.planner',
			expectedCurrent: { plusBTextVersionId: null, accessVersionId: null },
			plusBText: source('admin-xlsm-plusbtext', 'a'),
			access: source('access-tblkartei', 'f'),
			createdAt: '2026-08-13T10:00:00.000Z',
		});

		await expect(verifyLegacyReleasePlan(plan)).resolves.toEqual(plan);
		await expect(
			verifyLegacyReleasePlan({
				...plan,
				academicPeriod: '2027-2028',
			})
		).rejects.toThrow('LEGACY_RELEASE_PLAN_DIGEST_MISMATCH');
	});

	it('requires an all-or-none expected current pair', async () => {
		await expect(
			buildLegacyReleasePlan({
				schemaVersion: 3,
				environment: 'production',
				sourceClass: 'current_production',
				syntheticFixtureId: null,
				targetDatabaseId: '11111111-1111-4111-8111-111111111111',
				academicPeriod: '2026-2027',
				gitCommitSha: '1'.repeat(40),
				plannedBy: 'operator.planner',
				expectedCurrent: {
					plusBTextVersionId: '22222222-2222-4222-8222-222222222222',
					accessVersionId: null,
				},
				plusBText: source('admin-xlsm-plusbtext', 'a'),
				access: source('access-tblkartei', 'f'),
				createdAt: '2026-08-13T10:00:00.000Z',
			})
		).rejects.toThrow('Expected current legacy versions');
	});

	it('creates a review digest from only the exact staged digest and safe operator codes', async () => {
		const review = await buildLegacyReleaseReviewBinding({
			stagedDigestSha256: digest('a'),
			reviewedBy: 'operator.release-1',
			reasonCode: 'LEGACY_IMPORT_REVIEWED',
			reviewedAt: '2026-08-13T10:30:00.000Z',
		});

		expect(review.reviewDigestSha256).toMatch(/^[0-9a-f]{64}$/u);
		await expect(
			buildLegacyReleaseReviewBinding({
				...review,
				reasonCode: 'unsafe free-form reason',
			})
		).rejects.toThrow('reasonCode');
	});

	it('keeps target IDs and source fingerprints out of the printable summary', async () => {
		const plan = await buildLegacyReleasePlan({
			schemaVersion: 3,
			environment: 'preview',
			sourceClass: 'synthetic_preview',
			syntheticFixtureId: 'legacy-preview-synthetic-baseline-v1',
			targetDatabaseId: '11111111-1111-4111-8111-111111111111',
			academicPeriod: '2026-2027',
			gitCommitSha: '1'.repeat(40),
			plannedBy: 'operator.planner',
			expectedCurrent: { plusBTextVersionId: null, accessVersionId: null },
			plusBText: source('admin-xlsm-plusbtext', 'a'),
			access: source('access-tblkartei', 'f'),
			createdAt: '2026-08-13T10:00:00.000Z',
		});
		const printable = JSON.stringify(safeLegacyReleasePlanSummary(plan));

		expect(printable).not.toContain(plan.targetDatabaseId);
		expect(printable).not.toContain(plan.planDigestSha256);
		expect(printable).not.toContain(plan.access.sourceHashSha256);
		expect(printable).not.toContain(plan.plusBText.structuralFingerprintSha256);
	});
});

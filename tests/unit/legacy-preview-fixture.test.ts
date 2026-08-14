import {
	LEGACY_PREVIEW_SYNTHETIC_ROWS,
	buildLegacyPreviewSyntheticSources,
} from '$lib/server/import/local/legacy-preview-fixture';
import { LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS } from '$lib/server/import/legacy-release';
import {
	assertLegacyReleaseSourceBoundary,
	legacyPreviewSyntheticFixtureId,
} from '../../scripts/import-legacy-release';

describe('legacy preview synthetic-only source boundary', () => {
	it('rejects every Office/source path in preview and requires both paths in production', () => {
		expect(
			assertLegacyReleaseSourceBoundary({
				environment: 'preview',
				syntheticVariant: 'baseline',
			})
		).toBe('synthetic_preview');
		expect(() =>
			assertLegacyReleaseSourceBoundary({ environment: 'preview' })
		).toThrow('LEGACY_RELEASE_PREVIEW_SYNTHETIC_VARIANT_REQUIRED');
		expect(() =>
			assertLegacyReleaseSourceBoundary({
				environment: 'preview',
				syntheticVariant: 'unapproved',
			})
		).toThrow('LEGACY_RELEASE_PREVIEW_SYNTHETIC_VARIANT_INVALID');
		expect(() =>
			assertLegacyReleaseSourceBoundary({
				environment: 'preview',
				accessPath: 'client.accdb',
				syntheticVariant: 'baseline',
			})
		).toThrow('LEGACY_RELEASE_PREVIEW_SOURCE_PATH_FORBIDDEN');
		expect(() =>
			assertLegacyReleaseSourceBoundary({
				environment: 'preview',
				plusBTextPath: 'client.xlsm',
				syntheticVariant: 'baseline',
			})
		).toThrow('LEGACY_RELEASE_PREVIEW_SOURCE_PATH_FORBIDDEN');
		expect(() =>
			assertLegacyReleaseSourceBoundary({ environment: 'production' })
		).toThrow('LEGACY_RELEASE_PRODUCTION_SOURCE_REQUIRED');
		expect(() =>
			assertLegacyReleaseSourceBoundary({
				environment: 'production',
				accessPath: 'client.accdb',
				plusBTextPath: 'client.xlsm',
				syntheticVariant: 'candidate',
			})
		).toThrow('LEGACY_RELEASE_PRODUCTION_SYNTHETIC_VARIANT_FORBIDDEN');
		expect(
			assertLegacyReleaseSourceBoundary({
				environment: 'production',
				accessPath: 'client.accdb',
				plusBTextPath: 'client.xlsm',
			})
		).toBe('current_production');
		expect(legacyPreviewSyntheticFixtureId('baseline')).toBe(
			LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS.baseline
		);
	});

	it('regenerates allowlisted 1703-row baseline/candidate fixtures with one safe known delta', async () => {
		const first = await buildLegacyPreviewSyntheticSources({
			academicPeriod: '2026-2027',
			plusBTextVersionId: '11111111-1111-4111-8111-111111111111',
			variant: 'baseline',
		});
		const replay = await buildLegacyPreviewSyntheticSources({
			academicPeriod: '2026-2027',
			plusBTextVersionId: '11111111-1111-4111-8111-111111111111',
			variant: 'baseline',
		});
		const candidate = await buildLegacyPreviewSyntheticSources({
			academicPeriod: '2026-2027',
			plusBTextVersionId: '22222222-2222-4222-8222-222222222222',
			variant: 'candidate',
		});

		expect(first.accessExtract.rows).toHaveLength(LEGACY_PREVIEW_SYNTHETIC_ROWS);
		expect(first.accessSnapshot.rowsTotal).toBe(LEGACY_PREVIEW_SYNTHETIC_ROWS);
		expect(first.accessSnapshot.rowsStaged).toBe(LEGACY_PREVIEW_SYNTHETIC_ROWS);
		expect(first.accessSnapshot.issues).toEqual([]);
		expect(first.plusSnapshot).toEqual(replay.plusSnapshot);
		expect(first.accessSnapshot.versionHashSha256).toBe(
			replay.accessSnapshot.versionHashSha256
		);
		expect(candidate.accessExtract.rows).toHaveLength(LEGACY_PREVIEW_SYNTHETIC_ROWS);
		expect(candidate.accessSnapshot.rowsStaged).toBe(LEGACY_PREVIEW_SYNTHETIC_ROWS);
		expect(candidate.accessSnapshot.issues).toEqual([]);
		expect(candidate.fixtureId).toBe(LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS.candidate);
		expect(candidate.plusSnapshot.versionHashSha256).not.toBe(
			first.plusSnapshot.versionHashSha256
		);
		expect(candidate.plusSnapshot.structuralFingerprintSha256).toBe(
			first.plusSnapshot.structuralFingerprintSha256
		);
		expect(candidate.plusSnapshot.logicalShapeFingerprintSha256).toBe(
			first.plusSnapshot.logicalShapeFingerprintSha256
		);
		expect(candidate.plusSnapshot.styleFingerprintSha256).toBe(
			first.plusSnapshot.styleFingerprintSha256
		);
		expect(candidate.accessSnapshot.versionHashSha256).not.toBe(
			first.accessSnapshot.versionHashSha256
		);
		expect(candidate.accessExtract.rows.slice(0, -1)).toEqual(
			first.accessExtract.rows.slice(0, -1)
		);
		expect(candidate.accessExtract.rows.at(-1)?.Value18).toBe('47,00');
		expect(first.accessExtract.rows.at(-1)?.Value18).toBe('46,00');
		const accessManifest = new TextDecoder().decode(first.accessBytes);
		expect(accessManifest).toContain(LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS.baseline);
		expect(accessManifest).not.toContain('@');
		for (const row of first.accessExtract.rows) {
			expect(row.Value6).toBeNull();
			expect(row.Value7).toBeNull();
			expect(row.Value8).toBeNull();
			expect(row.Value9).toBeNull();
		}
	}, 30_000);
});

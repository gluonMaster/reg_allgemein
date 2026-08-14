import { hashCanonical } from '../canonical';
import {
	LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS,
	type LegacyPreviewSyntheticFixtureId,
	type LegacyPreviewSyntheticVariant,
} from '../legacy-release';
import type { PlusBTextImportSnapshot } from '../types';
import {
	createSyntheticAccessExtract,
	parseAccessExtract,
	type AccessExtract,
	type AccessSourceRow,
} from './access-database';

export const LEGACY_PREVIEW_SYNTHETIC_ROWS = 1_703;
const LEGACY_PREVIEW_SYNTHETIC_SHAPE_ID = 'legacy-preview-synthetic-shape-v1';

async function buildSyntheticPlusBText(input: {
	variant: LegacyPreviewSyntheticVariant;
}): Promise<PlusBTextImportSnapshot> {
	const oldGroupRecord = {
		storageKey: 'old:1',
		sourceRowNumber: 2,
		oldGroupId: 1,
		groupNameRaw: 'Synthetic Old Group',
		groupNameNormalized: 'synthetic old group',
		isValid: true,
	};
	const oldGroup = {
		...oldGroupRecord,
		recordHashSha256: await hashCanonical(oldGroupRecord),
	};
	const targetRecord = {
		storageKey: 'target:1',
		sourceRowNumber: 3,
		oldGroupIds: [1],
		groupNameRaw: 'Synthetic Target Group',
		groupNameNormalized: 'synthetic target group',
		teacherName:
			input.variant === 'baseline' ? 'Synthetic Teacher' : 'Synthetic Teacher Candidate',
		dayRaw: 'Mo',
		durationMinutes: 90,
		durationStatus: 'verified' as const,
		isValid: true,
	};
	const target = {
		...targetRecord,
		recordHashSha256: await hashCanonical(targetRecord),
	};
	const structuralFingerprintSha256 = await hashCanonical({
		shape: LEGACY_PREVIEW_SYNTHETIC_SHAPE_ID,
		contract: 'admin-xlsm-plusbtext:1',
		fields: ['E', 'F', 'K', 'L', 'M', 'N', 'T'],
	});
	const logicalShapeFingerprintSha256 = await hashCanonical({
		shape: LEGACY_PREVIEW_SYNTHETIC_SHAPE_ID,
		oldGroups: 1,
		targets: 1,
	});
	const styleFingerprintSha256 = await hashCanonical({
		shape: LEGACY_PREVIEW_SYNTHETIC_SHAPE_ID,
		style: 'not-applicable-no-office',
	});
	return {
		sourceContractId: 'admin-xlsm-plusbtext',
		sourceContractVersion: 1,
		fingerprintAlgorithmVersion: 1,
		structuralFingerprintSha256,
		logicalShapeFingerprintSha256,
		styleFingerprintSha256,
		versionHashSha256: await hashCanonical({
			contract: 'admin-xlsm-plusbtext:1',
			oldGroup,
			target,
		}),
		oldGroups: [oldGroup],
		targets: [target],
		issues: [],
		rowsTotal: 2,
		rowsStaged: 2,
		rowsSkipped: 0,
	};
}

export async function buildLegacyPreviewSyntheticPlusBText(
	variant: LegacyPreviewSyntheticVariant
): Promise<PlusBTextImportSnapshot> {
	const fixtureId = LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS[variant];
	if (!fixtureId) throw new TypeError('LEGACY_PREVIEW_SYNTHETIC_VARIANT_INVALID');
	return buildSyntheticPlusBText({ variant });
}

function syntheticAccessRows(variant: LegacyPreviewSyntheticVariant): AccessSourceRow[] {
	return Array.from({ length: LEGACY_PREVIEW_SYNTHETIC_ROWS }, (_, index) => {
		const id = index + 1;
		return {
			ID: id,
			Value1: `1. ${10_000 + id}`,
			Value2: 'Synthetic, Parent',
			Value4: `Synthetic Child ${String(id).padStart(4, '0')}`,
			Value5: '2016-01-01',
			Value6: null,
			Value7: null,
			Value8: null,
			Value9: null,
			Value15: 'Synthetic Old Group',
			Value16: null,
			Value17: null,
			Value18: variant === 'candidate' && id === LEGACY_PREVIEW_SYNTHETIC_ROWS ? '47,00' : '46,00',
			Value19: null,
			Value20: 'J',
			Value42: null,
			Value43: null,
			Value44: null,
			Value45: null,
			Value46: null,
			Value48: String(id),
		};
	});
}

export interface LegacyPreviewSyntheticSources {
	fixtureId: LegacyPreviewSyntheticFixtureId;
	plusBytes: Buffer;
	accessBytes: Buffer;
	plusSnapshot: PlusBTextImportSnapshot;
	accessExtract: AccessExtract;
	accessSnapshot: Awaited<ReturnType<typeof parseAccessExtract>>;
}

export async function buildLegacyPreviewSyntheticSources(input: {
	academicPeriod: string;
	plusBTextVersionId: string;
	variant: LegacyPreviewSyntheticVariant;
}): Promise<LegacyPreviewSyntheticSources> {
	const fixtureId = LEGACY_PREVIEW_SYNTHETIC_FIXTURE_IDS[input.variant];
	if (!fixtureId) throw new TypeError('LEGACY_PREVIEW_SYNTHETIC_VARIANT_INVALID');
	const plusSnapshot = await buildLegacyPreviewSyntheticPlusBText(input.variant);
	const rows = syntheticAccessRows(input.variant);
	const accessExtract = await createSyntheticAccessExtract(rows);
	const accessSnapshot = await parseAccessExtract({
		extract: accessExtract,
		academicPeriodCode: input.academicPeriod,
		plusBTextVersionId: input.plusBTextVersionId,
		plusBText: plusSnapshot,
	});
	const plusBytes = Buffer.from(
		JSON.stringify({ fixture: fixtureId, source: 'plusbtext' }),
		'utf8'
	);
	const accessBytes = Buffer.from(
		JSON.stringify({
			fixture: fixtureId,
			source: 'access',
			rows: LEGACY_PREVIEW_SYNTHETIC_ROWS,
		}),
		'utf8'
	);
	return { fixtureId, plusBytes, accessBytes, plusSnapshot, accessExtract, accessSnapshot };
}

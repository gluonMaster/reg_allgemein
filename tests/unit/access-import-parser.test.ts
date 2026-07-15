import { ImportContractError } from '$lib/server/import/errors';
import {
	createSyntheticAccessExtract,
	normalizeLegacyParentName,
	parseAccessExtract,
	readAccessDatabase,
} from '$lib/server/import/local/access-database';
import { parsePlusBTextWorkbook } from '$lib/server/import/local/plusbtext-workbook';
import {
	createSyntheticAccessRow,
	createSyntheticPlusBTextWorkbook,
} from '../helpers/import-fixtures';

async function plusSnapshot(input?: Parameters<typeof createSyntheticPlusBTextWorkbook>[0]) {
	return parsePlusBTextWorkbook(createSyntheticPlusBTextWorkbook(input));
}

describe('Access legacy parser', () => {
	it('aggregates repeated FamilyID and child identity while preserving every source ID and slot', async () => {
		const plus = await plusSnapshot({
			rows: [
				{ e: '10', f: 'Old Group' },
				{ k: '10', l: 'Target Group', m: 'Teacher A', n: 'Mo', t: '90' },
				{ l: 'Package Two', m: 'Teacher B', n: 'Di', t: '45' },
				{ l: 'Package Three', m: 'Teacher C', n: 'Mi', t: '50' },
				{ l: 'Package Four', m: 'Teacher D', n: 'Do', t: '55' },
				{ l: 'Package Five', m: 'Teacher E', n: 'Fr', t: '60' },
			],
		});
		const extract = await createSyntheticAccessExtract([
			createSyntheticAccessRow({
				Value43: 'Package Two',
				Value44: 'Package Three',
				Value45: 'Package Four',
				Value46: 'Package Five',
			}),
			createSyntheticAccessRow({
				ID: 102,
				Value15: 'Target Group',
				Value42: null,
				Value43: null,
				Value48: '102',
			}),
		]);
		const snapshot = await parseAccessExtract({
			extract,
			academicPeriodCode: '2026-2027',
			plusBTextVersionId: 'plus-version-a',
			plusBText: plus,
		});

		expect(snapshot.families).toHaveLength(1);
		expect(snapshot.families[0]).toMatchObject({
			sourceFamilyId: '1. 3477',
			numberingStatus: 'valid',
			parentNameMatchStatus: 'eligible',
			parentFirstNameNormalized: 'maria',
			parentLastNameNormalized: 'muster',
		});
		expect(snapshot.children).toHaveLength(1);
		expect(snapshot.sourceRows.map((row) => row.sourceAccessId)).toEqual([101, 102]);
		expect(snapshot.enrollments.map((enrollment) => enrollment.sourceSlot)).toEqual(
			expect.arrayContaining([
				'main_next',
				'package_1',
				'package_2',
				'package_3',
				'package_4',
				'package_5',
			])
		);
		expect(snapshot.enrollments.find((item) => item.sourceSlot === 'package_2')).toMatchObject({
			teacherName: 'Teacher B',
			dayRaw: 'Di',
			durationMinutes: 45,
		});
		expect(Object.keys(snapshot.sourceRows[0].sourceValues).sort()).not.toContain('ID');
		expect(Object.keys(snapshot.sourceRows[0].sourceValues)).toHaveLength(20);
	});

	it('normalizes every status class without turning O/V or V/O into an override', async () => {
		const plus = await plusSnapshot({
			rows: [
				{ l: 'Group J', m: 'Teacher', n: 'Mo', t: '90' },
				{ l: 'Group M', m: 'Teacher', n: 'Mo', t: '90' },
				{ l: 'Group OV', m: 'Teacher', n: 'Mo', t: '90' },
				{ l: 'Group VO', m: 'Teacher', n: 'Mo', t: '90' },
				{ l: 'Nachhilfe', m: 'Teacher', n: 'Mo', t: '45' },
				{ l: 'Ind. Musik', m: 'Teacher', n: 'Mo', t: '45' },
				{ l: 'Group KN', m: 'Teacher', n: 'Mo', t: '90' },
				{ l: 'Group Provisional', m: 'Teacher', n: 'Mo', t: '90' },
			],
		});
		const inputs = [
			['J', 'Group J'],
			['M', 'Group M'],
			['O/V', 'Group OV'],
			['V/O', 'Group VO'],
			['NH', 'Nachhilfe'],
			['IND', 'Ind. Musik'],
			['KN', 'Group KN'],
			['0', 'Group Provisional'],
		] as const;
		const extract = await createSyntheticAccessExtract(
			inputs.map(([status, group], index) =>
				createSyntheticAccessRow({
					ID: index + 1,
					Value1: `1. ${4000 + index}`,
					Value4: `Child ${index}`,
					Value5: `201${index}-01-01`,
					Value15: group,
					Value20: status,
					Value42: null,
					Value48: String(index + 1),
				})
			)
		);
		const snapshot = await parseAccessExtract({
			extract,
			academicPeriodCode: '2026-2027',
			plusBTextVersionId: 'plus-version-a',
			plusBText: plus,
		});
		const byStatus = new Map(snapshot.enrollments.map((item) => [item.statusCodeRaw, item]));

		expect(byStatus.get('J')).toMatchObject({ contractKind: 'yearly', priceSource: 'yearly' });
		expect(byStatus.get('M')).toMatchObject({
			contractKind: 'monthly',
			priceSource: 'monthly',
		});
		for (const marker of ['O/V', 'V/O']) {
			expect(byStatus.get(marker)).toMatchObject({
				contractKind: 'monthly',
				priceSource: 'monthly',
				priceMode: 'rule_derived',
			});
		}
		expect(byStatus.get('NH')).toMatchObject({
			lessonKind: 'nachhilfe',
			contractKind: 'nachhilfe',
		});
		expect(byStatus.get('IND')).toMatchObject({
			lessonKind: 'individual',
			contractKind: 'individual',
		});
		expect(byStatus.get('KN')).toMatchObject({ contractKind: null, priceSource: null });
		expect(byStatus.get('0')).toMatchObject({
			contractKind: 'monthly',
			needsAdminReview: true,
		});
		expect(snapshot.enrollments.map((item) => item.priceMode)).not.toContain('manual_override');
	});

	it('keeps invalid family rows as evidence but excludes payment and unstable children', async () => {
		const plus = await plusSnapshot();
		const extract = await createSyntheticAccessExtract([
			createSyntheticAccessRow({ ID: 1, Value1: null, Value48: '1' }),
			createSyntheticAccessRow({ ID: 2, Value1: 'legacy-unknown', Value48: '2' }),
			createSyntheticAccessRow({
				ID: 3,
				Value4: 'Zahlung',
				Value15: 'Target Group',
				Value48: '3',
			}),
			createSyntheticAccessRow({
				ID: 4,
				Value4: null,
				Value15: 'Target Group',
				Value48: '4',
			}),
		]);
		const snapshot = await parseAccessExtract({
			extract,
			academicPeriodCode: '2026-2027',
			plusBTextVersionId: 'plus-version-a',
			plusBText: plus,
		});

		expect(snapshot.sourceRows).toHaveLength(4);
		expect(snapshot.families.map((family) => family.numberingStatus)).toEqual(
			expect.arrayContaining(['missing', 'unapproved', 'valid'])
		);
		expect(snapshot.enrollments.every((enrollment) => enrollment.sourceAccessId > 2)).toBe(
			true
		);
		expect(snapshot.enrollments.some((enrollment) => enrollment.sourceAccessId === 3)).toBe(
			false
		);
		expect(snapshot.enrollments.some((enrollment) => enrollment.sourceAccessId === 4)).toBe(
			false
		);
		expect(snapshot.issues.map((entry) => entry.code)).toEqual(
			expect.arrayContaining([
				'ACCESS_FAMILY_ID_MISSING',
				'ACCESS_FAMILY_ID_UNAPPROVED',
				'ACCESS_ACTIVITY_WITHOUT_CHILD',
			])
		);
	});

	it('rejects duplicate/null IDs and schema/profile drift before staging', async () => {
		const plus = await plusSnapshot();
		const duplicate = await createSyntheticAccessExtract([
			createSyntheticAccessRow({ ID: 5, Value48: '5' }),
			createSyntheticAccessRow({ ID: 5, Value48: '5' }),
		]);
		await expect(
			parseAccessExtract({
				extract: duplicate,
				academicPeriodCode: '2026-2027',
				plusBTextVersionId: 'plus-version-a',
				plusBText: plus,
			})
		).rejects.toMatchObject({
			issue: expect.objectContaining({ code: 'ACCESS_ID_DUPLICATE' }),
		});

		await expect(
			createSyntheticAccessExtract([createSyntheticAccessRow()], { omitField: 'Value20' })
		).rejects.toMatchObject({
			issue: expect.objectContaining({ code: 'ACCESS_REQUIRED_FIELD_MISSING' }),
		});
		await expect(
			createSyntheticAccessExtract([createSyntheticAccessRow()], {
				fieldTypeOverrides: { Value48: 'binary' },
			})
		).rejects.toMatchObject({
			issue: expect.objectContaining({ code: 'ACCESS_VALUE_TYPE_UNSUPPORTED' }),
		});
		await expect(
			readAccessDatabase(Buffer.from('unsupported-access-container'))
		).rejects.toMatchObject({
			issue: expect.objectContaining({ code: 'ACCESS_CONTAINER_UNREADABLE' }),
		});
	});

	it('versions the same Access values by academic period and PlusBText dependency', async () => {
		const access = await createSyntheticAccessExtract([createSyntheticAccessRow()]);
		const plusA = await plusSnapshot();
		const plusB = await plusSnapshot({
			rows: [
				{ e: '10', f: 'Old Group' },
				{ k: '10', l: 'Target Group', m: 'Teacher B', n: 'Mo', t: '90' },
			],
		});
		const first = await parseAccessExtract({
			extract: access,
			academicPeriodCode: '2026-2027',
			plusBTextVersionId: 'plus-a',
			plusBText: plusA,
		});
		const otherPeriod = await parseAccessExtract({
			extract: access,
			academicPeriodCode: '2027-2028',
			plusBTextVersionId: 'plus-a',
			plusBText: plusA,
		});
		const otherDependency = await parseAccessExtract({
			extract: access,
			academicPeriodCode: '2026-2027',
			plusBTextVersionId: 'plus-b',
			plusBText: plusB,
		});

		expect(otherPeriod.versionHashSha256).not.toBe(first.versionHashSha256);
		expect(otherDependency.versionHashSha256).not.toBe(first.versionHashSha256);
		expect(otherPeriod.sourceRows[0].sourceRecordKey).not.toBe(
			first.sourceRows[0].sourceRecordKey
		);
	});

	it.each([
		[null, 'unavailable'],
		['', 'unavailable'],
		['Muster Maria', 'ambiguous'],
		['Muster, Maria', 'eligible'],
		['Müller-Šimić, Zoë', 'eligible'],
	])('normalizes parent name %j as %s without assigning identity', (raw, status) => {
		const normalized = normalizeLegacyParentName(raw);
		expect(normalized.status).toBe(status);
		expect(normalized).not.toHaveProperty('ownerUserId');
		expect(normalized).not.toHaveProperty('familyId');
	});
});

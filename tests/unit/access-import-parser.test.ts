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
			])
		);
		expect(snapshot.enrollments.map((item) => item.groupNameRaw)).not.toContain('Package Five');
		expect(snapshot.enrollments.find((item) => item.sourceSlot === 'package_2')).toMatchObject({
			teacherName: 'Teacher B',
			dayRaw: 'Di',
			durationMinutes: 45,
		});
		expect(Object.keys(snapshot.sourceRows[0].sourceValues).sort()).not.toContain('ID');
		expect(Object.keys(snapshot.sourceRows[0].sourceValues)).toHaveLength(20);
	});

	it('uses S contract markers and T activity codes without treating notes as an override', async () => {
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
			['J', null, 'Group J'],
			['M', 'O/V', 'Group M'],
			['', 'monthly O/V note', 'Group OV'],
			['O/V', 'V/O', 'Group VO'],
			['NH', null, 'Nachhilfe'],
			['IND', null, 'Ind. Musik'],
			['KN', 'O/V', 'Group KN'],
			['0', null, 'Group Provisional'],
		] as const;
		const extract = await createSyntheticAccessExtract(
			inputs.map(([activityCode, contractMarker, group], index) =>
				createSyntheticAccessRow({
					ID: index + 1,
					Value1: `1. ${4000 + index}`,
					Value4: `Child ${index}`,
					Value5: `201${index}-01-01`,
					Value15: group,
					Value19: contractMarker,
					Value20: activityCode,
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
		const byGroup = new Map(snapshot.enrollments.map((item) => [item.groupNameRaw, item]));

		expect(byGroup.get('Group J')).toMatchObject({
			contractKind: 'yearly',
			priceSource: 'yearly',
		});
		expect(byGroup.get('Group M')).toMatchObject({
			contractKind: 'monthly',
			priceSource: 'monthly',
		});
		for (const group of ['Group OV', 'Group VO']) {
			expect(byGroup.get(group)).toMatchObject({
				contractKind: 'monthly',
				priceSource: 'monthly',
				priceMode: 'rule_derived',
			});
		}
		expect(byGroup.get('Nachhilfe')).toMatchObject({
			lessonKind: 'nachhilfe',
			contractKind: 'nachhilfe',
		});
		expect(byGroup.get('Ind. Musik')).toMatchObject({
			lessonKind: 'individual',
			contractKind: 'individual',
		});
		expect(byGroup.get('Group KN')).toMatchObject({ contractKind: null, priceSource: null });
		expect(byGroup.get('Group Provisional')).toMatchObject({
			contractKind: 'yearly',
			needsAdminReview: false,
		});
		expect(snapshot.enrollments.map((item) => item.priceMode)).not.toContain('manual_override');
	});

	it('does not require PlusBText duration or a positive R price for inactive and hourly services', async () => {
		const plus = await plusSnapshot({
			rows: [
				{ l: 'Group Missing Duration', m: 'Teacher', n: 'Mo' },
				{ l: 'Nachhilfe', m: 'Teacher', n: 'Di' },
				{ l: 'Ind. Musik', m: 'Teacher', n: 'Mi' },
				{ l: 'Inactive Group', m: 'Teacher', n: 'Do' },
			],
		});
		const extract = await createSyntheticAccessExtract(
			[
				['', 'Group Missing Duration'],
				['NH', 'Nachhilfe'],
				['IND', 'Ind. Musik'],
				['KN', 'Inactive Group'],
			].map(([activityCode, groupName], index) =>
				createSyntheticAccessRow({
					ID: index + 1,
					Value1: `1. ${5000 + index}`,
					Value4: `Synthetic Child ${index}`,
					Value5: `201${index}-01-01`,
					Value15: groupName,
					Value18: '0',
					Value19: null,
					Value20: activityCode,
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
		const issueCodes = snapshot.issues.map((issue) => issue.code);

		expect(issueCodes.filter((code) => code === 'ACCESS_DURATION_MISSING')).toHaveLength(1);
		expect(issueCodes.filter((code) => code === 'ACCESS_PLANNED_PRICE_INVALID')).toHaveLength(
			1
		);
		for (const groupName of ['Nachhilfe', 'Ind. Musik', 'Inactive Group']) {
			expect(
				snapshot.enrollments.find((item) => item.groupNameRaw === groupName)
			).toMatchObject({
				plannedPriceCents: null,
				needsAdminReview: false,
			});
		}
	});

	it('always ignores service-marker AT while keeping AP-AS package values fail-closed', async () => {
		const plus = await plusSnapshot();
		const extract = await createSyntheticAccessExtract([
			createSyntheticAccessRow({ Value42: '3', Value46: 'arbitrary service marker' }),
		]);
		const snapshot = await parseAccessExtract({
			extract,
			academicPeriodCode: '2026-2027',
			plusBTextVersionId: 'plus-version-a',
			plusBText: plus,
		});

		expect(snapshot.enrollments.map((item) => item.groupNameRaw)).toContain('3');
		expect(snapshot.enrollments.map((item) => item.groupNameRaw)).not.toContain(
			'arbitrary service marker'
		);
		expect(snapshot.issues.map((issue) => issue.code)).not.toContain(
			'ACCESS_PACKAGE_NUMERIC_MARKERS_IGNORED'
		);
	});

	it('keeps opaque references for the exact two-enrollment duplicate bucket', async () => {
		const plus = await plusSnapshot();
		const extract = await createSyntheticAccessExtract([
			createSyntheticAccessRow({ Value15: 'Target Group', Value42: 'Target Group' }),
		]);
		const snapshot = await parseAccessExtract({
			extract,
			academicPeriodCode: '2026-2027',
			plusBTextVersionId: 'plus-version-a',
			plusBText: plus,
		});
		const duplicate = snapshot.issues.find(
			(issue) => issue.code === 'ACCESS_CHILD_GROUP_DUPLICATE_SLOTS'
		);

		expect(duplicate?.safeContext?.relatedEnrollmentIds).toEqual(
			snapshot.enrollments.map((enrollment) => enrollment.id).sort()
		);
		expect(JSON.stringify(duplicate?.safeContext)).not.toContain('Target Group');
	});

	it('emits one stable exact-pair issue for every pair in a three-slot duplicate bucket', async () => {
		const plus = await plusSnapshot();
		const extract = await createSyntheticAccessExtract([
			createSyntheticAccessRow({
				Value15: 'Target Group',
				Value42: 'Target Group',
				Value43: 'Target Group',
			}),
		]);
		const snapshot = await parseAccessExtract({
			extract,
			academicPeriodCode: '2026-2027',
			plusBTextVersionId: 'plus-version-a',
			plusBText: plus,
		});
		const duplicates = snapshot.issues.filter(
			(issue) => issue.code === 'ACCESS_CHILD_GROUP_DUPLICATE_SLOTS'
		);
		expect(duplicates).toHaveLength(3);
		expect(new Set(duplicates.map((issue) => issue.sourceRecordKey)).size).toBe(3);
		for (const duplicate of duplicates) {
			expect(duplicate.safeContext?.relatedEnrollmentIds).toHaveLength(2);
			expect(new Set(duplicate.safeContext?.relatedEnrollmentIds as string[]).size).toBe(2);
			expect(JSON.stringify(duplicate.safeContext)).not.toContain('Target Group');
		}
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

	it('parses strict five-digit Access/OLE date serials without accepting adjacent drift', async () => {
		const plus = await plusSnapshot();
		const extract = await createSyntheticAccessExtract([
			createSyntheticAccessRow({ ID: 1, Value5: '43831', Value48: '1' }),
			createSyntheticAccessRow({
				ID: 2,
				Value1: '1. 3478',
				Value4: 'Other Child',
				Value5: '43831.5',
				Value48: '2',
			}),
		]);
		const snapshot = await parseAccessExtract({
			extract,
			academicPeriodCode: '2026-2027',
			plusBTextVersionId: 'plus-version-a',
			plusBText: plus,
		});

		expect(snapshot.children).toHaveLength(1);
		expect(snapshot.children[0].sourceBirthDate).toBe('2020-01-01');
		expect(snapshot.issues.map((entry) => entry.code)).toContain(
			'ACCESS_CHILD_BIRTH_DATE_INVALID'
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
		['Muster Maria', 'eligible'],
		['Muster;Anna', 'eligible'],
		['Muster; Anna', 'eligible'],
		['Muster, Maria', 'eligible'],
		['Müller-Šimić, Zoë', 'eligible'],
		['Muster/Beispiel, Anna', 'ambiguous'],
		['von Muster Maria', 'ambiguous'],
	])('normalizes parent name %j as %s without assigning identity', (raw, status) => {
		const normalized = normalizeLegacyParentName(raw);
		expect(normalized.status).toBe(status);
		expect(normalized).not.toHaveProperty('ownerUserId');
		expect(normalized).not.toHaveProperty('familyId');
	});
});

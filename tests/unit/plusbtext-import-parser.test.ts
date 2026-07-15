import {
	parsePlusBTextWorkbook,
	resolvePlusBTextGroup,
} from '$lib/server/import/local/plusbtext-workbook';
import { createSyntheticPlusBTextWorkbook } from '../helpers/import-fixtures';

describe('PlusBText allowlisted parser', () => {
	it('parses the macro-enabled golden fixture without exposing hidden or extra fields', async () => {
		const snapshot = await parsePlusBTextWorkbook(createSyntheticPlusBTextWorkbook());

		expect(snapshot.structuralFingerprintSha256).toBe(
			'81ca334f1a6d8961c626dfb1bae63287ad9314911acac05361cde2c274dced2f'
		);
		expect(snapshot.fingerprintAlgorithmVersion).toBe(1);
		expect(snapshot.oldGroups).toHaveLength(1);
		expect(snapshot.targets).toMatchObject([
			{
				oldGroupIds: [10],
				groupNameRaw: 'Target Group',
				teacherName: 'Teacher A',
				dayRaw: 'Mo',
				durationMinutes: 90,
				durationStatus: 'verified',
			},
		]);
		const serialized = JSON.stringify(snapshot);
		expect(serialized).not.toContain('visible-person@example.invalid');
		expect(serialized).not.toContain('hidden-person@example.invalid');
		expect(serialized).not.toContain('AUTO_OPEN_SYNTHETIC_MARKER');
	});

	it('uses exact L first and then the exact F -> E -> K target join', async () => {
		const snapshot = await parsePlusBTextWorkbook(
			createSyntheticPlusBTextWorkbook({
				rows: [
					{ e: '10', f: 'Old A' },
					{ e: '20', f: 'Old B' },
					{ k: '10;20', l: 'Target AB', m: 'Teacher AB', n: 'Di', t: '75' },
				],
			})
		);
		const exact = resolvePlusBTextGroup({
			groupName: ' Target AB ',
			sourceRecordKey: 'access:test:exact',
			oldGroups: snapshot.oldGroups,
			targets: snapshot.targets,
		});
		const fallback = resolvePlusBTextGroup({
			groupName: 'Old A',
			sourceRecordKey: 'access:test:fallback',
			oldGroups: snapshot.oldGroups,
			targets: snapshot.targets,
		});

		expect(exact).toMatchObject({
			status: 'resolved',
			teacherName: 'Teacher AB',
			dayRaw: 'Di',
			durationMinutes: 75,
		});
		expect(fallback).toMatchObject({
			status: 'resolved',
			teacherName: 'Teacher AB',
			dayRaw: 'Di',
			durationMinutes: 75,
		});
	});

	it('never uses same-row or neighbor-row fallback', async () => {
		const snapshot = await parsePlusBTextWorkbook(
			createSyntheticPlusBTextWorkbook({
				rows: [
					{
						e: '10',
						f: 'Old Same Row',
						l: 'Unrelated Target',
						m: 'Wrong Teacher',
						n: 'Mi',
						t: '60',
					},
					{ l: 'Neighbor Target', m: 'Neighbor Teacher', n: 'Do', t: '45' },
				],
			})
		);
		const resolution = resolvePlusBTextGroup({
			groupName: 'Old Same Row',
			sourceRecordKey: 'access:test:no-row-fallback',
			oldGroups: snapshot.oldGroups,
			targets: snapshot.targets,
		});

		expect(resolution.status).toBe('unresolved');
		expect(resolution.teacherName).toBeNull();
		expect(resolution.durationMinutes).toBeNull();
		expect(resolution.issues.map((entry) => entry.code)).toContain(
			'PLUSB_ENRICHMENT_DANGLING_OLD_ID'
		);
	});

	it('keeps blank and invalid T null and records duplicate/dangling K safely', async () => {
		const snapshot = await parsePlusBTextWorkbook(
			createSyntheticPlusBTextWorkbook({
				rows: [
					{ e: '10', f: 'Old A' },
					{ e: '11', f: 'Old A' },
					{ k: '10;10', l: 'Blank Duration', m: 'Teacher', n: 'Fr', t: null },
					{ k: '999', l: 'Invalid Duration', m: 'Teacher', n: 'Fr', t: '-5' },
					{ k: '10', l: 'Duplicate Target', m: 'Teacher A', n: 'Fr', t: '30' },
					{ k: '10', l: 'Duplicate Target', m: 'Teacher B', n: 'Fr', t: '45' },
				],
			})
		);
		const codes = snapshot.issues.map((entry) => entry.code);

		expect(
			snapshot.targets.find((target) => target.groupNameRaw === 'Blank Duration')
		).toMatchObject({
			durationMinutes: null,
			durationStatus: 'missing',
		});
		expect(
			snapshot.targets.find((target) => target.groupNameRaw === 'Invalid Duration')
		).toMatchObject({
			durationMinutes: null,
			durationStatus: 'invalid',
		});
		expect(snapshot.targets.some((target) => target.durationMinutes === 90)).toBe(false);
		expect(codes).toEqual(
			expect.arrayContaining([
				'PLUSB_OLD_NAME_DUPLICATE',
				'PLUSB_K_TOKEN_DUPLICATE',
				'PLUSB_K_DANGLING_ID',
				'PLUSB_K_AMBIGUOUS_TARGET',
				'PLUSB_DURATION_MISSING',
				'PLUSB_DURATION_INVALID',
				'PLUSB_TARGET_NAME_DUPLICATE',
			])
		);
	});

	it.each([
		['encrypted/unsupported bytes', Buffer.from('not-a-zip'), 'PLUSB_CONTAINER_UNREADABLE'],
		[
			'non-macro container',
			createSyntheticPlusBTextWorkbook({ macroEnabled: false }),
			'PLUSB_CONTAINER_UNSUPPORTED',
		],
		[
			'missing sheet',
			createSyntheticPlusBTextWorkbook({ includeSheet: false }),
			'PLUSB_SHEET_MISSING_OR_AMBIGUOUS',
		],
		[
			'header drift',
			createSyntheticPlusBTextWorkbook({ headerMismatch: true }),
			'PLUSB_HEADER_CONTRACT_MISMATCH',
		],
	])('fails closed for %s', async (_label, workbook, code) => {
		await expect(parsePlusBTextWorkbook(workbook as Buffer)).rejects.toMatchObject({
			issue: expect.objectContaining({ code }),
		});
	});
});

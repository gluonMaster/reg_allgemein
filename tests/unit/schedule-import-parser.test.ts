import { parseScheduleSnapshot } from '$lib/server/import/local/schedule-json';
import { createSyntheticSchedule, type SyntheticScheduleBlock } from '../helpers/import-fixtures';

const sameNameBlocks: SyntheticScheduleBlock[] = [
	{
		id: 'block-a',
		day: 'Mo',
		building: 'B1',
		room: 'R1',
		startTime: '16:00',
		endTime: '17:30',
		lessonType: 'group',
		subject: 'Synthetic subject A',
		teacher: 'Lehrkraft A',
		displayName: 'Same display name',
	},
	{
		id: 'block-b',
		day: 'Di',
		building: 'B2',
		room: 'R2',
		startTime: '17:00',
		endTime: '18:00',
		lessonType: 'group',
		subject: 'Synthetic subject B',
		teacher: 'Lehrkraft B',
		displayName: 'Same display name',
	},
];

describe('schedule JSON parser', () => {
	it('keeps equal display names as separate source identities and verifies the HTML reference', async () => {
		const snapshot = await parseScheduleSnapshot(
			createSyntheticSchedule({ blocks: sameNameBlocks })
		);

		expect(snapshot.blocks).toHaveLength(2);
		expect(snapshot.blocks.map((block) => block.sourceOfferingKey)).toEqual([
			'schedule:primary:block-a',
			'schedule:primary:block-b',
		]);
		expect(snapshot.blocks[0].displayName).toBe(snapshot.blocks[1].displayName);
		expect(snapshot.htmlComparison).toEqual({ blocksCompared: 2, blocksMatched: 2 });
		expect(snapshot.issues).toContainEqual(
			expect.objectContaining({ code: 'SCHEDULE_DUPLICATE_DISPLAY_NAMES_PRESERVED' })
		);
	});

	it('changes the block hash without changing source identity when mutable fields change', async () => {
		const first = await parseScheduleSnapshot(
			createSyntheticSchedule({ blocks: [sameNameBlocks[0]] })
		);
		const changed = await parseScheduleSnapshot(
			createSyntheticSchedule({
				generationId: 'synthetic-generation-2',
				blocks: [{ ...sameNameBlocks[0], room: 'R9' }],
			})
		);

		expect(changed.blocks[0].sourceOfferingKey).toBe(first.blocks[0].sourceOfferingKey);
		expect(changed.blocks[0].sourceBlockHashSha256).not.toBe(
			first.blocks[0].sourceBlockHashSha256
		);
	});

	it('rejects unsupported schema and duplicate block IDs', async () => {
		await expect(
			parseScheduleSnapshot(createSyntheticSchedule({ schemaVersion: 2 }))
		).rejects.toMatchObject({
			issue: expect.objectContaining({ code: 'SCHEDULE_SCHEMA_UNSUPPORTED' }),
		});

		await expect(
			parseScheduleSnapshot(
				createSyntheticSchedule({
					blocks: [sameNameBlocks[0], { ...sameNameBlocks[1], id: 'block-a' }],
				})
			)
		).rejects.toMatchObject({
			issue: expect.objectContaining({ code: 'SCHEDULE_BLOCK_ID_AMBIGUOUS' }),
		});
	});

	it('fails when the control HTML cannot be matched to the JSON snapshot', async () => {
		const fixture = createSyntheticSchedule({ blocks: [sameNameBlocks[0]] });
		await expect(
			parseScheduleSnapshot({
				jsonText: fixture.jsonText,
				htmlText: fixture.htmlText.replace('Lehrkraft A', 'Different synthetic teacher'),
			})
		).rejects.toMatchObject({
			issue: expect.objectContaining({ code: 'SCHEDULE_HTML_COMPARISON_FAILED' }),
		});
	});
});

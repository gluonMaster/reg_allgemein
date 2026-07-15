import { parsePriceWorkbook } from '$lib/server/import/local/price-workbook';
import { createSyntheticPriceWorkbook } from '../helpers/import-fixtures';

describe('price workbook parser', () => {
	it('reads only Tabelle8 from a synthetic macro-enabled container and preserves both rates', async () => {
		const workbook = createSyntheticPriceWorkbook({
			macroEnabled: true,
			rows: [
				{
					key: 'Synthetic A',
					preis: '46.25',
					dauer: '90',
					faecher: null,
					sonderpreis: '60.50',
					kinder: '1',
				},
				{
					key: 'Synthetic B',
					preis: '51.10',
					dauer: '45;90',
					faecher: 'Kunst;Musik',
					sonderpreis: '72.20',
					kinder: '2',
				},
			],
		});

		const snapshot = await parsePriceWorkbook(workbook);

		expect(snapshot.headerRowNumber).toBe(2);
		expect(snapshot.headerColumns).toMatchObject({
			Key: 4,
			Preis: 6,
			Sonderpreis: 9,
			Kinder: 10,
		});
		expect(snapshot.rules).toHaveLength(2);
		expect(snapshot.rules[0]).toMatchObject({
			yearlyPriceCents: 4625,
			monthlyPriceCents: 6050,
			childrenCount: 1,
			durationTotalMinutes: 90,
			isValid: true,
			provenance: {
				yearlySourceColumn: 'Preis',
				monthlySourceColumn: 'Sonderpreis',
			},
		});
		expect(snapshot.rules[1].subjectDurationVector).toEqual([
			{ subject: 'kunst', durationMinutes: 45 },
			{ subject: 'musik', durationMinutes: 90 },
		]);
		const serialized = JSON.stringify(snapshot);
		expect(serialized).not.toContain('hidden-person@example.invalid');
		expect(serialized).not.toContain('AUTO_OPEN_SYNTHETIC_MARKER');
	});

	it('rejects zero, negative and blank rates without substituting one source column for the other', async () => {
		const snapshot = await parsePriceWorkbook(
			createSyntheticPriceWorkbook({
				rows: [
					{
						key: 'Zero yearly',
						preis: '0',
						dauer: '90',
						faecher: null,
						sonderpreis: '60',
						kinder: '1',
					},
					{
						key: 'Negative monthly',
						preis: '46',
						dauer: '90',
						faecher: null,
						sonderpreis: '-1',
						kinder: '2',
					},
					{
						key: 'Blank yearly',
						preis: null,
						dauer: '90',
						faecher: null,
						sonderpreis: '61',
						kinder: '3',
					},
				],
			})
		);

		expect(snapshot.rules.every((rule) => !rule.isValid)).toBe(true);
		expect(snapshot.rules[0]).toMatchObject({
			yearlyPriceCents: null,
			monthlyPriceCents: 6000,
		});
		expect(snapshot.rules[1]).toMatchObject({
			yearlyPriceCents: 4600,
			monthlyPriceCents: null,
		});
		expect(snapshot.rules[2]).toMatchObject({
			yearlyPriceCents: null,
			monthlyPriceCents: 6100,
		});
		expect(snapshot.issues.filter((issue) => issue.blocksPromotion)).toHaveLength(3);
	});

	it('keeps a subject-duration mismatch as a non-publishable row and review issue', async () => {
		const snapshot = await parsePriceWorkbook(
			createSyntheticPriceWorkbook({
				rows: [
					{
						key: 'Mismatch',
						preis: '46',
						dauer: '45;90',
						faecher: 'Kunst',
						sonderpreis: '60',
						kinder: '1',
					},
				],
			})
		);

		expect(snapshot.rules[0]).toMatchObject({
			isValid: false,
			validationCode: 'PRICE_SUBJECT_DURATION_MISMATCH',
			subjectDurationVector: null,
		});
		expect(snapshot.issues).toContainEqual(
			expect.objectContaining({
				severity: 'warning',
				code: 'PRICE_SUBJECT_DURATION_MISMATCH',
				blocksPromotion: false,
			})
		);
	});

	it('fails closed when more than one price header is present', async () => {
		await expect(
			parsePriceWorkbook(createSyntheticPriceWorkbook({ duplicateHeader: true }))
		).rejects.toMatchObject({
			name: 'ImportContractError',
			issue: expect.objectContaining({ code: 'PRICE_HEADER_AMBIGUOUS' }),
		});
	});
});

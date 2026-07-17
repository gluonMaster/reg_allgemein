import { maskLegacyEmail } from '$lib/server/family/verification-extension';
import { CabinetPricingService } from '$lib/server/pricing/cabinet-pricing';
import { childCorrectionSchema } from '$lib/server/cabinet/contracts';

describe('stage 06 family and cabinet boundaries', () => {
	it('masks normal and short legacy addresses without exposing the full local part', () => {
		expect(maskLegacyEmail('legacy.owner@example.test')).toBe('le*****r@example.test');
		expect(maskLegacyEmail('ab@example.test')).toBe('a*****@example.test');
		expect(maskLegacyEmail('a@example.test')).toBe('*****@example.test');
		expect(maskLegacyEmail('invalid-address')).toBe('*****');
	});

	it('totals only known active group base prices and preserves unknown/payment semantics', () => {
		const summary = new CabinetPricingService({
			individualPriceCentsPer45Min: 3100,
			groupDurationFallbackMinutes: 90,
			missingDurationYearlyCentsPer45Min: 2300,
			missingDurationMonthlyCentsPer45Min: 3000,
			quoteTtlSeconds: 86_400,
		}).summarize([
			{
				lessonKind: 'group',
				isActive: true,
				basePriceCents: 4200,
				priceConfirmed: true,
				paymentArrangement: 'manual_payment',
			},
			{
				lessonKind: 'dance_group',
				isActive: true,
				basePriceCents: null,
				priceConfirmed: false,
				paymentArrangement: 'existing_external_sepa',
			},
			{
				lessonKind: 'group',
				isActive: false,
				basePriceCents: 9900,
				priceConfirmed: true,
				paymentArrangement: 'manual_payment',
			},
			{
				lessonKind: 'nachhilfe',
				isActive: true,
				basePriceCents: 3000,
				priceConfirmed: true,
				paymentArrangement: 'not_applicable',
			},
		]);

		expect(summary).toEqual({
			knownMonthlyBaseTotalCents: 4200,
			unknownMonthlyBasePriceCount: 1,
			individualUnitPriceCents: 3100,
			nachhilfeFundedUnitPriceCents: 3000,
			paymentNotices: ['manual_payment', 'existing_external_sepa', 'not_applicable'],
		});
	});

	it('accepts deterministic legacy child identities as opaque values but no extra fields', () => {
		expect(
			childCorrectionSchema.safeParse({
				childId: `child_${'a'.repeat(32)}`,
				fullName: 'Synthetic Child',
				birthDate: '2016-05-04',
			}).success
		).toBe(true);
		expect(
			childCorrectionSchema.safeParse({
				childId: `child_${'a'.repeat(32)}`,
				fullName: 'Synthetic Child',
				birthDate: '2016-05-04',
				ownerUserId: 'foreign-owner',
			}).success
		).toBe(false);
	});
});

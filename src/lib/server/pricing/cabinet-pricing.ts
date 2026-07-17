import type { PricingRuntimeConfig } from '$lib/server/config/runtime';

export type CabinetPaymentArrangement =
	'existing_external_sepa' | 'manual_payment' | 'not_applicable';

export interface CabinetPriceInput {
	lessonKind: 'group' | 'dance_group' | 'nachhilfe' | 'individual' | 'needs_review';
	isActive: boolean;
	basePriceCents: number | null;
	priceConfirmed: boolean;
	paymentArrangement: CabinetPaymentArrangement;
}

export interface CabinetPriceSummary {
	knownMonthlyBaseTotalCents: number;
	unknownMonthlyBasePriceCount: number;
	individualUnitPriceCents: number;
	nachhilfeFundedUnitPriceCents: 3000;
	paymentNotices: CabinetPaymentArrangement[];
}

export class CabinetPricingService {
	constructor(private readonly config: PricingRuntimeConfig) {}

	summarize(lines: readonly CabinetPriceInput[]): CabinetPriceSummary {
		let knownMonthlyBaseTotalCents = 0;
		let unknownMonthlyBasePriceCount = 0;
		for (const line of lines) {
			if (!line.isActive || !['group', 'dance_group'].includes(line.lessonKind)) continue;
			if (line.basePriceCents === null || !line.priceConfirmed) {
				unknownMonthlyBasePriceCount += 1;
				continue;
			}
			knownMonthlyBaseTotalCents += line.basePriceCents;
		}
		return {
			knownMonthlyBaseTotalCents,
			unknownMonthlyBasePriceCount,
			individualUnitPriceCents: this.config.individualPriceCentsPer45Min,
			nachhilfeFundedUnitPriceCents: 3000,
			paymentNotices: [...new Set(lines.map((line) => line.paymentArrangement))],
		};
	}
}

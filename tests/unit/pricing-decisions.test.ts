import {
	buildRepricingProposals,
	calculateGroupPrice,
	calculateNonGroupPrice,
	occupancyRepricingDecision,
	quoteLookupChildrenCount,
	repricingLookupChildrenCount,
	sumConfirmedMonthlyGroupBasePrices,
	type GroupPricingInput,
	type PriceRuleCandidate,
} from '$lib/server/pricing/decisions';
import { parsePublicQuoteRequest } from '$lib/server/pricing/pricing-service';

const config = {
	individualPriceCentsPer45Min: 3000,
	groupDurationFallbackMinutes: 90,
	missingDurationYearlyCentsPer45Min: 2300,
	missingDurationMonthlyCentsPer45Min: 3000,
	quoteTtlSeconds: 86_400,
};

const vector = [{ subject: null, durationMinutes: 90 }];
const yearlyMonthlyRule: PriceRuleCandidate = {
	id: 'rule-1',
	priceVersionId: 'price-v1',
	normalizedKey: 'kunst',
	subjectDurationVector: vector,
	childrenCount: 6,
	yearlyPriceCents: 4600,
	monthlyPriceCents: 6000,
};

function groupInput(overrides: Partial<GroupPricingInput> = {}): GroupPricingInput {
	return {
		lessonKind: 'group',
		mappingStatus: 'confirmed',
		contractKind: 'group_yearly',
		priceVersionId: 'price-v1',
		normalizedPriceKey: 'kunst',
		durationSource: 'plusbtext',
		durationStatus: 'verified',
		durationMinutes: 90,
		subjectDurationVector: vector,
		lookupChildrenCount: 6,
		rules: [yearlyMonthlyRule],
		...overrides,
	};
}

describe('pure pricing decisions', () => {
	it('accepts only the public course/date payload and rejects pricing controls', () => {
		expect(
			parsePublicQuoteRequest({ courseGroupId: 'course-1', plannedStartOn: '2026-09-01' })
		).toEqual({ courseGroupId: 'course-1', plannedStartOn: '2026-09-01' });
		expect(() =>
			parsePublicQuoteRequest({
				courseGroupId: 'course-1',
				plannedStartOn: '2026-09-01',
				contractKind: 'group_monthly',
				manualOverrideCents: 1,
				GROUP_DURATION_FALLBACK_MINUTES: 45,
			})
		).toThrowError(/INVALID_PUBLIC_QUOTE_REQUEST/);
		expect(() =>
			parsePublicQuoteRequest({ courseGroupId: 'course-1', plannedStartOn: '2026-02-30' })
		).toThrowError(/INVALID_PUBLIC_QUOTE_REQUEST/);
	});

	it('keeps quote and repricing counts separate and capped independently from capacity', () => {
		expect([0, 1, 5, 6, 12, 15].map(quoteLookupChildrenCount)).toEqual([1, 2, 6, 6, 6, 6]);
		expect([0, 1, 5, 6, 12, 15].map(repricingLookupChildrenCount)).toEqual([
			null,
			1,
			5,
			6,
			6,
			6,
		]);
		expect(
			occupancyRepricingDecision({ oldActiveChildrenCount: 5, newActiveChildrenCount: 6 })
		).toMatchObject({ shouldLookup: true, lookupChildrenCount: 6 });
		expect(
			occupancyRepricingDecision({ oldActiveChildrenCount: 7, newActiveChildrenCount: 6 })
		).toMatchObject({ shouldLookup: false, decisionCode: 'LOOKUP_COUNT_UNCHANGED' });
		expect(
			occupancyRepricingDecision({ oldActiveChildrenCount: 1, newActiveChildrenCount: 0 })
		).toMatchObject({ shouldLookup: false, decisionCode: 'NO_ACTIVE_CHILDREN' });
	});

	it('selects Preis for yearly and Sonderpreis for monthly without treating monthly as override', () => {
		expect(
			calculateGroupPrice(groupInput(), config, { allowMissingDurationFallback: true })
		).toMatchObject({
			decisionCode: 'EXACT_RULE',
			priceSource: 'excel_yearly',
			priceMode: 'rule_derived',
			finalPriceCents: 4600,
		});
		expect(
			calculateGroupPrice(groupInput({ contractKind: 'group_monthly' }), config, {
				allowMissingDurationFallback: true,
			})
		).toMatchObject({
			priceSource: 'excel_monthly',
			priceMode: 'rule_derived',
			finalPriceCents: 6000,
		});
	});

	it('uses the only allowed missing-duration fallback as a monthly estimate', () => {
		const yearly = calculateGroupPrice(
			groupInput({
				durationStatus: 'missing',
				durationMinutes: null,
				subjectDurationVector: null,
			}),
			config,
			{ allowMissingDurationFallback: true }
		);
		const monthly = calculateGroupPrice(
			groupInput({
				contractKind: 'group_monthly',
				durationStatus: 'missing',
				durationMinutes: null,
				subjectDurationVector: null,
			}),
			config,
			{ allowMissingDurationFallback: true }
		);
		expect(yearly).toMatchObject({
			decisionCode: 'ESTIMATED_MISSING_DURATION',
			finalPriceCents: 4600,
			durationMinutesUsed: 90,
			billingPeriodCode: 'calendar_month',
			estimatedMissingDuration: true,
			requiresAdminConfirmation: true,
			messageKey: 'pricing.estimatedMissingDuration',
		});
		expect(monthly.finalPriceCents).toBe(6000);
		expect(
			calculateGroupPrice(
				groupInput({
					durationStatus: 'missing',
					durationMinutes: null,
					subjectDurationVector: null,
				}),
				config,
				{ allowMissingDurationFallback: false }
			).decisionCode
		).toBe('MISSING_DURATION_REPRICING_BLOCKED');
	});

	it.each([
		[{ mappingStatus: 'unknown' }, 'UNKNOWN_OR_AMBIGUOUS_MAPPING'],
		[{ contractKind: null }, 'UNKNOWN_CONTRACT_KIND'],
		[{ normalizedPriceKey: null }, 'MISSING_PRICE_KEY'],
		[{ durationStatus: 'invalid' }, 'INVALID_PRESENT_DURATION'],
		[{ durationStatus: 'ambiguous' }, 'AMBIGUOUS_DURATION'],
	])('blocks forbidden fallback/lookup branch %#', (overrides, expected) => {
		expect(
			calculateGroupPrice(groupInput(overrides as Partial<GroupPricingInput>), config, {
				allowMissingDurationFallback: true,
			}).decisionCode
		).toBe(expected);
	});

	it('returns review for missing or ambiguous exact vector candidates', () => {
		expect(
			calculateGroupPrice(groupInput({ rules: [] }), config, {
				allowMissingDurationFallback: true,
			}).decisionCode
		).toBe('MISSING_PRICE_RULE');
		expect(
			calculateGroupPrice(
				groupInput({ rules: [yearlyMonthlyRule, { ...yearlyMonthlyRule, id: 'rule-2' }] }),
				config,
				{ allowMissingDurationFallback: true }
			).decisionCode
		).toBe('AMBIGUOUS_PRICE_RULE');
	});

	it('requires complete admin evidence before manual override takes precedence', () => {
		const overridden = calculateGroupPrice(
			groupInput({
				manualOverride: {
					amountCents: 4200,
					reason: 'Approved exception',
					actorUserId: 'admin-1',
					responsibilityConfirmed: true,
				},
			}),
			config,
			{ allowMissingDurationFallback: true }
		);
		expect(overridden).toMatchObject({
			basePriceCents: 4600,
			manualOverrideCents: 4200,
			finalPriceCents: 4200,
			priceMode: 'manual_override',
		});
		expect(
			calculateGroupPrice(
				groupInput({
					manualOverride: {
						amountCents: 4200,
						reason: '',
						actorUserId: 'admin-1',
						responsibilityConfirmed: false,
					},
				}),
				config,
				{ allowMissingDurationFallback: true }
			).decisionCode
		).toBe('INVALID_MANUAL_OVERRIDE_EVIDENCE');
	});

	it('keeps individual and funded Nachhilfe unit rates distinct from parent monthly totals', () => {
		expect(calculateNonGroupPrice('individual', config)).toMatchObject({
			finalPriceCents: 3000,
			durationMinutesUsed: 45,
			parentPayable: true,
		});
		expect(calculateNonGroupPrice('nachhilfe', config)).toMatchObject({
			finalPriceCents: 3000,
			durationMinutesUsed: 45,
			parentPayable: false,
			priceSource: 'fixed_nachhilfe_hourly',
		});
		expect(calculateNonGroupPrice('group_nachhilfe', config).status).toBe('needs_admin_review');
	});

	it('sums only confirmed active group base prices and never treats unknown as zero', () => {
		expect(
			sumConfirmedMonthlyGroupBasePrices([
				{
					lessonKind: 'group',
					isActive: true,
					currentBasePriceCents: 4600,
					priceConfirmed: true,
					estimatedMissingDuration: false,
				},
				{
					lessonKind: 'dance_group',
					isActive: true,
					currentBasePriceCents: 6000,
					priceConfirmed: false,
					estimatedMissingDuration: true,
				},
				{
					lessonKind: 'nachhilfe',
					isActive: true,
					currentBasePriceCents: 3000,
					priceConfirmed: true,
					estimatedMissingDuration: false,
				},
				{
					lessonKind: 'group',
					isActive: true,
					currentBasePriceCents: 5000,
					priceConfirmed: true,
					estimatedMissingDuration: true,
				},
			])
		).toEqual({ totalCents: 9600, includedCount: 2, excludedUnknownCount: 1 });
	});

	it('does not create a repricing item when an explicit override keeps final mode/amount unchanged', () => {
		const base = calculateGroupPrice(groupInput(), config, {
			allowMissingDurationFallback: false,
		});
		expect(
			buildRepricingProposals({
				baseDecision: base,
				targets: [
					{
						id: 'enrollment-1',
						currentPriceCents: 4200,
						currentPriceMode: 'manual_override',
						manualOverride: {
							amountCents: 4200,
							reason: 'Approved exception',
							actorUserId: 'admin-1',
							responsibilityConfirmed: true,
						},
					},
				],
			})[0]
		).toMatchObject({ itemRequired: false, newFinalPriceCents: 4200 });
	});

	it('creates only changed yearly/monthly increase or decrease proposals', () => {
		const yearly = calculateGroupPrice(groupInput(), config, {
			allowMissingDurationFallback: false,
		});
		const monthly = calculateGroupPrice(
			groupInput({ contractKind: 'group_monthly' }),
			config,
			{ allowMissingDurationFallback: false }
		);
		const target = (currentPriceCents: number) => ({
			id: `enrollment-${currentPriceCents}`,
			userId: 'parent-1',
			currentBasePriceCents: currentPriceCents,
			currentPriceCents,
			currentPriceSource: 'excel_yearly' as const,
			currentPriceMode: 'rule_derived' as const,
			currentPriceVersionId: 'price-v1',
			currentPriceRuleId: 'old-rule',
			sendEligibilityCode: 'ELIGIBLE' as const,
		});
		expect(buildRepricingProposals({ baseDecision: yearly, targets: [target(4500)] })[0])
			.toMatchObject({ itemRequired: true, oldFinalPriceCents: 4500,
				newFinalPriceCents: 4600 });
		expect(buildRepricingProposals({ baseDecision: yearly, targets: [target(4700)] })[0])
			.toMatchObject({ itemRequired: true, oldFinalPriceCents: 4700,
				newFinalPriceCents: 4600 });
		expect(buildRepricingProposals({ baseDecision: yearly, targets: [target(4600)] })[0])
			.toMatchObject({ itemRequired: false, manualContactRequired: false });
		expect(buildRepricingProposals({ baseDecision: monthly, targets: [
			{ ...target(6100), currentPriceSource: 'excel_monthly' as const,
				contractKind: 'group_monthly' as const },
		] })[0]).toMatchObject({ itemRequired: true, oldFinalPriceCents: 6100,
			newFinalPriceCents: 6000 });
	});

	it('routes unknown, unclaimed, conflicting and inactive targets to manual contact', () => {
		const decision = calculateGroupPrice(groupInput(), config, {
			allowMissingDurationFallback: false,
		});
		for (const sendEligibilityCode of [
			'UNKNOWN_CURRENT_PRICE',
			'UNCLAIMED_LEGACY_SERVICE',
			'LEGACY_SERVICE_CONFLICT',
			'INACTIVE_PRICE_OWNER',
		] as const) {
			expect(buildRepricingProposals({
				baseDecision: decision,
				targets: [{ id: sendEligibilityCode, currentPriceCents: 4500,
					currentPriceMode: 'rule_derived', sendEligibilityCode }],
			})[0]).toMatchObject({ decisionCode: sendEligibilityCode,
				itemRequired: false, manualContactRequired: true });
		}
	});
});

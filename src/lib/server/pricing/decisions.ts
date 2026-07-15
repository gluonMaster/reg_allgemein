import type { PricingRuntimeConfig } from '$lib/server/config/runtime';
import type { SubjectDurationComponent } from './normalization';

export type PricingLessonKind =
	'group' | 'dance_group' | 'nachhilfe' | 'individual' | 'group_nachhilfe' | 'needs_review';
export type GroupContractKind = 'group_yearly' | 'group_monthly';
export type PricingDurationStatus =
	'verified' | 'missing' | 'invalid' | 'ambiguous' | 'unresolved' | 'not_applicable';
export type PriceSource =
	| 'excel_yearly'
	| 'excel_monthly'
	| 'fallback_90'
	| 'configured_individual_hourly'
	| 'fixed_nachhilfe_hourly';
export type PriceMode = 'rule_derived' | 'manual_override';

export type PricingDecisionCode =
	| 'EXACT_RULE'
	| 'ESTIMATED_MISSING_DURATION'
	| 'INDIVIDUAL_CONFIGURED_RATE'
	| 'NACHHILFE_FIXED_RATE'
	| 'GROUP_NACHHILFE_MANUAL_ONLY'
	| 'UNKNOWN_OR_AMBIGUOUS_MAPPING'
	| 'UNKNOWN_LESSON_KIND'
	| 'UNKNOWN_CONTRACT_KIND'
	| 'MISSING_PRICE_VERSION'
	| 'MISSING_PRICE_KEY'
	| 'MISSING_PRICE_RULE'
	| 'AMBIGUOUS_PRICE_RULE'
	| 'INVALID_PRESENT_DURATION'
	| 'AMBIGUOUS_DURATION'
	| 'UNRESOLVED_DURATION'
	| 'MISSING_DURATION_REPRICING_BLOCKED'
	| 'INVALID_MANUAL_OVERRIDE_EVIDENCE'
	| 'NO_ACTIVE_CHILDREN'
	| 'LOOKUP_COUNT_UNCHANGED';

export interface PriceRuleCandidate {
	id: string;
	priceVersionId: string;
	normalizedKey: string;
	subjectDurationVector: SubjectDurationComponent[];
	childrenCount: number;
	yearlyPriceCents: number;
	monthlyPriceCents: number;
}

export interface ManualOverrideEvidence {
	amountCents: number;
	reason: string;
	actorUserId: string;
	responsibilityConfirmed: boolean;
}

export interface PricingDecision {
	decisionCode: PricingDecisionCode;
	status: 'quoted' | 'needs_admin_review' | 'needs_admin_confirmation';
	priceSource: PriceSource | null;
	priceMode: PriceMode | null;
	contractKind: GroupContractKind | null;
	priceVersionId: string | null;
	priceRuleId: string | null;
	basePriceCents: number | null;
	manualOverrideCents: number | null;
	manualOverrideReason: string | null;
	finalPriceCents: number | null;
	durationSource:
		| 'plusbtext'
		| 'schedule'
		| 'admin_confirmed'
		| 'price_rule'
		| 'fallback_90'
		| 'not_applicable'
		| null;
	durationStatus: PricingDurationStatus;
	durationMinutesUsed: number | null;
	billingPeriodCode: 'calendar_month' | 'per_45_minutes' | null;
	estimatedMissingDuration: boolean;
	requiresAdminConfirmation: boolean;
	parentPayable: boolean;
	messageKey: 'pricing.estimatedMissingDuration' | 'pricing.needsAdminReview' | null;
}

export interface GroupPricingInput {
	lessonKind: PricingLessonKind;
	mappingStatus: 'confirmed' | 'unknown' | 'ambiguous';
	contractKind: GroupContractKind | null;
	priceVersionId: string | null;
	normalizedPriceKey: string | null;
	durationSource: 'plusbtext' | 'schedule' | 'admin_confirmed';
	durationStatus: Exclude<PricingDurationStatus, 'not_applicable'>;
	durationMinutes: number | null;
	subjectDurationVector: SubjectDurationComponent[] | null;
	lookupChildrenCount: number;
	rules: readonly PriceRuleCandidate[];
	manualOverride?: ManualOverrideEvidence;
}

function review(
	decisionCode: PricingDecisionCode,
	input?: Partial<
		Pick<
			PricingDecision,
			'contractKind' | 'priceVersionId' | 'durationSource' | 'durationStatus'
		>
	>
): PricingDecision {
	return {
		decisionCode,
		status: 'needs_admin_review',
		priceSource: null,
		priceMode: null,
		contractKind: input?.contractKind ?? null,
		priceVersionId: input?.priceVersionId ?? null,
		priceRuleId: null,
		basePriceCents: null,
		manualOverrideCents: null,
		manualOverrideReason: null,
		finalPriceCents: null,
		durationSource: input?.durationSource ?? null,
		durationStatus: input?.durationStatus ?? 'unresolved',
		durationMinutesUsed: null,
		billingPeriodCode: null,
		estimatedMissingDuration: false,
		requiresAdminConfirmation: false,
		parentPayable: true,
		messageKey: 'pricing.needsAdminReview',
	};
}

function sameVector(
	left: readonly SubjectDurationComponent[],
	right: readonly SubjectDurationComponent[]
): boolean {
	return (
		left.length === right.length &&
		left.every(
			(component, index) =>
				component.subject === right[index].subject &&
				component.durationMinutes === right[index].durationMinutes
		)
	);
}

function validOverride(value: ManualOverrideEvidence): boolean {
	return (
		Number.isSafeInteger(value.amountCents) &&
		value.amountCents >= 0 &&
		value.reason.trim().length > 0 &&
		value.actorUserId.trim().length > 0 &&
		value.responsibilityConfirmed
	);
}

function exactGroupDecision(input: GroupPricingInput): PricingDecision {
	const candidates = input.rules.filter(
		(rule) =>
			rule.priceVersionId === input.priceVersionId &&
			rule.normalizedKey === input.normalizedPriceKey &&
			rule.childrenCount === input.lookupChildrenCount &&
			input.subjectDurationVector !== null &&
			sameVector(rule.subjectDurationVector, input.subjectDurationVector)
	);
	if (candidates.length === 0) {
		return review('MISSING_PRICE_RULE', {
			contractKind: input.contractKind,
			priceVersionId: input.priceVersionId,
			durationSource: input.durationSource,
			durationStatus: input.durationStatus,
		});
	}
	if (candidates.length > 1) {
		return review('AMBIGUOUS_PRICE_RULE', {
			contractKind: input.contractKind,
			priceVersionId: input.priceVersionId,
			durationSource: input.durationSource,
			durationStatus: input.durationStatus,
		});
	}

	const rule = candidates[0];
	const yearly = input.contractKind === 'group_yearly';
	const basePriceCents = yearly ? rule.yearlyPriceCents : rule.monthlyPriceCents;
	if (!Number.isSafeInteger(basePriceCents) || basePriceCents < 0) {
		return review('MISSING_PRICE_RULE', {
			contractKind: input.contractKind,
			priceVersionId: input.priceVersionId,
			durationSource: input.durationSource,
			durationStatus: input.durationStatus,
		});
	}

	if (input.manualOverride && !validOverride(input.manualOverride)) {
		return review('INVALID_MANUAL_OVERRIDE_EVIDENCE', {
			contractKind: input.contractKind,
			priceVersionId: input.priceVersionId,
			durationSource: input.durationSource,
			durationStatus: input.durationStatus,
		});
	}
	const override = input.manualOverride;
	return {
		decisionCode: 'EXACT_RULE',
		status: 'quoted',
		priceSource: yearly ? 'excel_yearly' : 'excel_monthly',
		priceMode: override ? 'manual_override' : 'rule_derived',
		contractKind: input.contractKind,
		priceVersionId: input.priceVersionId,
		priceRuleId: rule.id,
		basePriceCents,
		manualOverrideCents: override?.amountCents ?? null,
		manualOverrideReason: override?.reason.trim() ?? null,
		finalPriceCents: override?.amountCents ?? basePriceCents,
		durationSource: input.durationSource,
		durationStatus: 'verified',
		durationMinutesUsed: input.durationMinutes,
		billingPeriodCode: 'calendar_month',
		estimatedMissingDuration: false,
		requiresAdminConfirmation: false,
		parentPayable: true,
		messageKey: null,
	};
}

export function calculateGroupPrice(
	input: GroupPricingInput,
	config: PricingRuntimeConfig,
	options: { allowMissingDurationFallback: boolean }
): PricingDecision {
	if (input.lessonKind !== 'group' && input.lessonKind !== 'dance_group') {
		return review(
			input.lessonKind === 'group_nachhilfe'
				? 'GROUP_NACHHILFE_MANUAL_ONLY'
				: 'UNKNOWN_LESSON_KIND'
		);
	}
	if (input.mappingStatus !== 'confirmed') {
		return review('UNKNOWN_OR_AMBIGUOUS_MAPPING', {
			contractKind: input.contractKind,
			durationSource: input.durationSource,
			durationStatus: input.durationStatus,
		});
	}
	if (!input.contractKind) return review('UNKNOWN_CONTRACT_KIND');
	if (!input.priceVersionId) {
		return review('MISSING_PRICE_VERSION', { contractKind: input.contractKind });
	}
	if (!input.normalizedPriceKey) {
		return review('MISSING_PRICE_KEY', {
			contractKind: input.contractKind,
			priceVersionId: input.priceVersionId,
		});
	}

	if (input.durationStatus === 'missing') {
		if (!options.allowMissingDurationFallback) {
			return review('MISSING_DURATION_REPRICING_BLOCKED', {
				contractKind: input.contractKind,
				priceVersionId: input.priceVersionId,
				durationSource: input.durationSource,
				durationStatus: 'missing',
			});
		}
		const units = config.groupDurationFallbackMinutes / 45;
		const yearly = input.contractKind === 'group_yearly';
		const amount =
			units *
			(yearly
				? config.missingDurationYearlyCentsPer45Min
				: config.missingDurationMonthlyCentsPer45Min);
		return {
			decisionCode: 'ESTIMATED_MISSING_DURATION',
			status: 'needs_admin_confirmation',
			priceSource: 'fallback_90',
			priceMode: 'rule_derived',
			contractKind: input.contractKind,
			priceVersionId: input.priceVersionId,
			priceRuleId: null,
			basePriceCents: amount,
			manualOverrideCents: null,
			manualOverrideReason: null,
			finalPriceCents: amount,
			durationSource: 'fallback_90',
			durationStatus: 'missing',
			durationMinutesUsed: config.groupDurationFallbackMinutes,
			billingPeriodCode: 'calendar_month',
			estimatedMissingDuration: true,
			requiresAdminConfirmation: true,
			parentPayable: true,
			messageKey: 'pricing.estimatedMissingDuration',
		};
	}
	if (input.durationStatus === 'invalid') {
		return review('INVALID_PRESENT_DURATION', {
			contractKind: input.contractKind,
			priceVersionId: input.priceVersionId,
			durationSource: input.durationSource,
			durationStatus: 'invalid',
		});
	}
	if (input.durationStatus === 'ambiguous') {
		return review('AMBIGUOUS_DURATION', {
			contractKind: input.contractKind,
			priceVersionId: input.priceVersionId,
			durationSource: input.durationSource,
			durationStatus: 'ambiguous',
		});
	}
	if (
		input.durationStatus !== 'verified' ||
		!input.durationMinutes ||
		!input.subjectDurationVector
	) {
		return review('UNRESOLVED_DURATION', {
			contractKind: input.contractKind,
			priceVersionId: input.priceVersionId,
			durationSource: input.durationSource,
			durationStatus: input.durationStatus,
		});
	}
	return exactGroupDecision(input);
}

export function calculateNonGroupPrice(
	lessonKind: PricingLessonKind,
	config: PricingRuntimeConfig
): PricingDecision {
	if (lessonKind === 'individual') {
		return {
			decisionCode: 'INDIVIDUAL_CONFIGURED_RATE',
			status: 'quoted',
			priceSource: 'configured_individual_hourly',
			priceMode: 'rule_derived',
			contractKind: null,
			priceVersionId: null,
			priceRuleId: null,
			basePriceCents: config.individualPriceCentsPer45Min,
			manualOverrideCents: null,
			manualOverrideReason: null,
			finalPriceCents: config.individualPriceCentsPer45Min,
			durationSource: 'not_applicable',
			durationStatus: 'not_applicable',
			durationMinutesUsed: 45,
			billingPeriodCode: 'per_45_minutes',
			estimatedMissingDuration: false,
			requiresAdminConfirmation: false,
			parentPayable: true,
			messageKey: null,
		};
	}
	if (lessonKind === 'nachhilfe') {
		return {
			decisionCode: 'NACHHILFE_FIXED_RATE',
			status: 'quoted',
			priceSource: 'fixed_nachhilfe_hourly',
			priceMode: 'rule_derived',
			contractKind: null,
			priceVersionId: null,
			priceRuleId: null,
			basePriceCents: 3000,
			manualOverrideCents: null,
			manualOverrideReason: null,
			finalPriceCents: 3000,
			durationSource: 'not_applicable',
			durationStatus: 'not_applicable',
			durationMinutesUsed: 45,
			billingPeriodCode: 'per_45_minutes',
			estimatedMissingDuration: false,
			requiresAdminConfirmation: false,
			parentPayable: false,
			messageKey: null,
		};
	}
	return review(
		lessonKind === 'group_nachhilfe' ? 'GROUP_NACHHILFE_MANUAL_ONLY' : 'UNKNOWN_LESSON_KIND'
	);
}

export function quoteLookupChildrenCount(activeChildrenCount: number): number {
	if (!Number.isSafeInteger(activeChildrenCount) || activeChildrenCount < 0) {
		throw new TypeError('activeChildrenCount must be a non-negative integer.');
	}
	return Math.min(activeChildrenCount + 1, 6);
}

export function repricingLookupChildrenCount(activeChildrenCount: number): number | null {
	if (!Number.isSafeInteger(activeChildrenCount) || activeChildrenCount < 0) {
		throw new TypeError('activeChildrenCount must be a non-negative integer.');
	}
	return activeChildrenCount === 0 ? null : Math.min(activeChildrenCount, 6);
}

export function occupancyRepricingDecision(input: {
	oldActiveChildrenCount: number;
	newActiveChildrenCount: number;
}): {
	shouldLookup: boolean;
	decisionCode: 'NO_ACTIVE_CHILDREN' | 'LOOKUP_COUNT_UNCHANGED' | 'EXACT_RULE';
	lookupChildrenCount: number | null;
} {
	const oldLookup = repricingLookupChildrenCount(input.oldActiveChildrenCount);
	const newLookup = repricingLookupChildrenCount(input.newActiveChildrenCount);
	if (newLookup === null) {
		return {
			shouldLookup: false,
			decisionCode: 'NO_ACTIVE_CHILDREN',
			lookupChildrenCount: null,
		};
	}
	if (oldLookup === newLookup) {
		return {
			shouldLookup: false,
			decisionCode: 'LOOKUP_COUNT_UNCHANGED',
			lookupChildrenCount: newLookup,
		};
	}
	return { shouldLookup: true, decisionCode: 'EXACT_RULE', lookupChildrenCount: newLookup };
}

export interface RepricingTarget {
	id: string;
	currentPriceCents: number | null;
	currentPriceMode: PriceMode | null;
	manualOverride?: ManualOverrideEvidence;
}

export interface RepricingProposal {
	targetId: string;
	decisionCode: PricingDecisionCode;
	newBasePriceCents: number | null;
	newFinalPriceCents: number | null;
	newPriceMode: PriceMode | null;
	itemRequired: boolean;
}

export function buildRepricingProposals(input: {
	baseDecision: PricingDecision;
	targets: readonly RepricingTarget[];
}): RepricingProposal[] {
	return input.targets.map((target) => {
		let decision = input.baseDecision;
		if (target.manualOverride) {
			if (!validOverride(target.manualOverride)) {
				decision = review('INVALID_MANUAL_OVERRIDE_EVIDENCE', {
					contractKind: decision.contractKind,
					priceVersionId: decision.priceVersionId,
					durationSource: decision.durationSource ?? undefined,
					durationStatus: decision.durationStatus,
				});
			} else if (decision.basePriceCents !== null) {
				decision = {
					...decision,
					priceMode: 'manual_override',
					manualOverrideCents: target.manualOverride.amountCents,
					manualOverrideReason: target.manualOverride.reason.trim(),
					finalPriceCents: target.manualOverride.amountCents,
				};
			}
		}
		return {
			targetId: target.id,
			decisionCode: decision.decisionCode,
			newBasePriceCents: decision.basePriceCents,
			newFinalPriceCents: decision.finalPriceCents,
			newPriceMode: decision.priceMode,
			itemRequired:
				decision.status === 'quoted' &&
				(target.currentPriceCents !== decision.finalPriceCents ||
					target.currentPriceMode !== decision.priceMode),
		};
	});
}

export interface MonthlyGroupBasePriceLine {
	lessonKind: PricingLessonKind;
	isActive: boolean;
	currentBasePriceCents: number | null;
	priceConfirmed: boolean;
	estimatedMissingDuration: boolean;
}

export function sumConfirmedMonthlyGroupBasePrices(lines: readonly MonthlyGroupBasePriceLine[]): {
	totalCents: number;
	includedCount: number;
	excludedUnknownCount: number;
} {
	let totalCents = 0;
	let includedCount = 0;
	let excludedUnknownCount = 0;
	for (const line of lines) {
		if (!line.isActive || (line.lessonKind !== 'group' && line.lessonKind !== 'dance_group')) {
			continue;
		}
		if (!line.priceConfirmed || line.currentBasePriceCents === null) {
			excludedUnknownCount += 1;
			continue;
		}
		if (!Number.isSafeInteger(line.currentBasePriceCents) || line.currentBasePriceCents < 0) {
			throw new TypeError('Monthly base prices must be non-negative integer cents.');
		}
		totalCents += line.currentBasePriceCents;
		includedCount += 1;
	}
	return { totalCents, includedCount, excludedUnknownCount };
}

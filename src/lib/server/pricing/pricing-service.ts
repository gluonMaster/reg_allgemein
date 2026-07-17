import { z } from 'zod';
import type { PricingRuntimeConfig } from '$lib/server/config/runtime';
import { OccupancyRepository } from './occupancy-repository';
import {
	buildRepricingProposals,
	calculateGroupPrice,
	calculateNonGroupPrice,
	occupancyRepricingDecision,
	quoteLookupChildrenCount,
	repricingLookupChildrenCount,
	type PricingDecisionCode,
	type RepricingProposal,
} from './decisions';
import { PricingRepository, type StoredPriceQuote } from './pricing-repository';

function isCalendarDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

const publicQuoteRequestSchema = z
	.object({
		courseGroupId: z.string().min(1).max(200),
		plannedStartOn: z.string().refine(isCalendarDate),
	})
	.strict();

export type PublicQuoteRequest = z.infer<typeof publicQuoteRequestSchema>;

export class PricingServiceError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'PricingServiceError';
	}
}

function assertInstant(value: string): void {
	if (
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) ||
		Number.isNaN(Date.parse(value))
	) {
		throw new PricingServiceError('INVALID_UTC_INSTANT');
	}
}

function addSeconds(instant: string, seconds: number): string {
	return new Date(Date.parse(instant) + seconds * 1000).toISOString();
}

export function parsePublicQuoteRequest(payload: unknown): PublicQuoteRequest {
	const parsed = publicQuoteRequestSchema.safeParse(payload);
	if (!parsed.success) throw new PricingServiceError('INVALID_PUBLIC_QUOTE_REQUEST');
	return parsed.data;
}

export class PricingService {
	constructor(
		private readonly pricing: PricingRepository,
		private readonly occupancy: OccupancyRepository,
		private readonly config: PricingRuntimeConfig
	) {}

	async createPublicQuote(payload: unknown, now: string): Promise<StoredPriceQuote> {
		assertInstant(now);
		const request = parsePublicQuoteRequest(payload);
		const activeChildrenCount = await this.occupancy.activeChildrenCount(
			request.courseGroupId,
			request.plannedStartOn
		);
		const lookupChildrenCount = quoteLookupChildrenCount(activeChildrenCount);
		const context = await this.pricing.loadCourseContext({
			courseGroupId: request.courseGroupId,
			asOf: request.plannedStartOn,
			lookupChildrenCount,
		});
		if (!context) throw new PricingServiceError('COURSE_NOT_FOUND');
		if (context.catalogStatus !== 'published') {
			throw new PricingServiceError('COURSE_NOT_PUBLIC');
		}
		const decision =
			context.lessonKind === 'group' || context.lessonKind === 'dance_group'
				? calculateGroupPrice(
						{
							lessonKind: context.lessonKind,
							mappingStatus: context.mappingStatus,
							contractKind: context.contractKind,
							priceVersionId: context.priceVersionId,
							normalizedPriceKey: context.normalizedPriceKey,
							durationSource: context.durationSource,
							durationStatus: context.durationStatus,
							durationMinutes: context.durationMinutes,
							subjectDurationVector: context.subjectDurationVector,
							lookupChildrenCount,
							rules: context.rules,
						},
						this.config,
						{ allowMissingDurationFallback: true }
					)
				: calculateNonGroupPrice(context.lessonKind, this.config);
		const quote: StoredPriceQuote = {
			id: crypto.randomUUID(),
			courseGroupId: request.courseGroupId,
			plannedStartOn: request.plannedStartOn,
			activeChildrenCountAsOf: activeChildrenCount,
			lookupChildrenCount,
			decision,
			status: decision.status,
			createdAt: now,
			expiresAt: addSeconds(now, this.config.quoteTtlSeconds),
		};
		await this.pricing.insertQuote({
			id: quote.id,
			context,
			plannedStartOn: quote.plannedStartOn,
			activeChildrenCount,
			lookupChildrenCount,
			decision,
			createdAt: quote.createdAt,
			expiresAt: quote.expiresAt,
		});
		return quote;
	}

	async revalidateQuote(
		quoteId: string,
		now: string
	): Promise<{ fresh: boolean; reason: string }> {
		assertInstant(now);
		const quote = await this.pricing.getQuoteDependencies(quoteId);
		if (!quote) throw new PricingServiceError('QUOTE_NOT_FOUND');
		if (quote.status === 'stale' || quote.status === 'superseded') {
			return { fresh: false, reason: quote.status.toUpperCase() };
		}
		if (quote.expiresAt <= now) {
			await this.pricing.markQuoteStale(quoteId);
			return { fresh: false, reason: 'QUOTE_EXPIRED' };
		}
		const activeChildrenCount = await this.occupancy.activeChildrenCount(
			quote.courseGroupId,
			quote.plannedStartOn
		);
		const context = await this.pricing.loadCourseContext({
			courseGroupId: quote.courseGroupId,
			asOf: quote.plannedStartOn,
			lookupChildrenCount: quoteLookupChildrenCount(activeChildrenCount),
		});
		const stale =
			!context ||
			activeChildrenCount !== quote.activeChildrenCount ||
			context.priceVersionId !== quote.priceVersionId ||
			context.scheduleVersionId !== quote.scheduleVersionId ||
			context.plusBTextVersionId !== quote.plusBTextVersionId ||
			context.pricingProfileVersion !== quote.pricingProfileVersion;
		if (stale) {
			await this.pricing.markQuoteStale(quoteId);
			return { fresh: false, reason: 'QUOTE_DEPENDENCY_CHANGED' };
		}
		return { fresh: true, reason: 'CURRENT' };
	}

	async calculateRepricing(input: {
		courseGroupId: string;
		effectiveOn: string;
		oldActiveChildrenCount: number;
		reason: 'occupancy_changed' | 'admin_price_comparison';
	}): Promise<{
		decisionCode: PricingDecisionCode;
		activeChildrenCount: number;
		lookupChildrenCount: number | null;
		proposals: RepricingProposal[];
	}> {
		const activeChildrenCount = await this.occupancy.activeChildrenCount(
			input.courseGroupId,
			input.effectiveOn
		);
		const trigger = occupancyRepricingDecision({
			oldActiveChildrenCount: input.oldActiveChildrenCount,
			newActiveChildrenCount: activeChildrenCount,
		});
		const lookupChildrenCount = repricingLookupChildrenCount(activeChildrenCount);
		if (
			lookupChildrenCount === null ||
			(input.reason === 'occupancy_changed' && !trigger.shouldLookup)
		) {
			return {
				decisionCode: trigger.decisionCode,
				activeChildrenCount,
				lookupChildrenCount,
				proposals: [],
			};
		}

		const context = await this.pricing.loadCourseContext({
			courseGroupId: input.courseGroupId,
			asOf: input.effectiveOn,
			lookupChildrenCount,
		});
		if (!context) throw new PricingServiceError('COURSE_NOT_FOUND');
		const targets = await this.pricing.listRepricingTargets(
			input.courseGroupId,
			input.effectiveOn
		);
		const contractKinds = await this.pricing.contractKindsForTargets(
			targets.map((target) => target.id)
		);
		const proposals = targets.flatMap((target) => {
			const contractKind = contractKinds.get(target.id);
			const decision = calculateGroupPrice(
				{
					lessonKind: context.lessonKind,
					mappingStatus: context.mappingStatus,
					contractKind: contractKind ?? null,
					priceVersionId: context.priceVersionId,
					normalizedPriceKey: context.normalizedPriceKey,
					durationSource: context.durationSource,
					durationStatus: context.durationStatus,
					durationMinutes: context.durationMinutes,
					subjectDurationVector: context.subjectDurationVector,
					lookupChildrenCount,
					rules: context.rules,
				},
				this.config,
				{ allowMissingDurationFallback: false }
			);
			return buildRepricingProposals({ baseDecision: decision, targets: [target] });
		});
		const firstBlocking = proposals.find((proposal) => proposal.decisionCode !== 'EXACT_RULE');
		return {
			decisionCode: firstBlocking?.decisionCode ?? 'EXACT_RULE',
			activeChildrenCount,
			lookupChildrenCount,
			proposals,
		};
	}
}

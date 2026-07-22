import { z } from 'zod';
import type { PriceMode, PriceSource, PricingDecisionCode } from '$lib/server/pricing/decisions';

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const identifier = z.string().trim().min(1).max(200);
const idempotencyKey = z.string().trim().min(8).max(200);

export const PRICE_REVIEW_ACCEPTANCE_TEXT_VERSION = 'price-review-acceptance-de-v1';
export const PRICE_REVIEW_ACCEPTANCE_TEXT =
	'Ich stimme der in diesem Preisänderungsvorschlag genannten neuen monatlichen Grundgebühr zu. Mir ist bekannt, dass die Änderung erst nach einer gesonderten Bestätigung durch die Verwaltung und frühestens zum angegebenen Wirksamkeitsdatum gilt.';

export const adminComparisonSchema = z
	.object({
		courseGroupId: identifier,
		effectiveOn: calendarDate,
		reason: z.string().trim().min(3).max(500),
		confirmation: z.literal('confirmed'),
		idempotencyKey,
	})
	.strict();

export const batchApprovalSchema = z
	.object({
		batchId: identifier,
		reason: z.string().trim().min(3).max(500),
		confirmation: z.literal('confirmed'),
		idempotencyKey,
	})
	.strict();

export const batchDispatchSchema = z
	.object({
		batchId: identifier,
		confirmation: z.literal('confirmed'),
		idempotencyKey,
	})
	.strict();

export const parentPriceResponseSchema = z
	.object({
		publicReference: identifier,
		itemHash: sha256,
		decision: z.enum(['accept', 'decline']),
		idempotencyKey,
	})
	.strict();

export const finalConfirmationSchema = z
	.object({
		itemId: identifier,
		reason: z.string().trim().min(3).max(500),
		confirmation: z.literal('confirmed'),
		idempotencyKey,
	})
	.strict();

export const manualMaintenanceSchema = z
	.object({
		confirmation: z.literal('confirmed'),
		idempotencyKey,
	})
	.strict();

export type AdminComparisonInput = z.infer<typeof adminComparisonSchema>;
export type BatchApprovalInput = z.infer<typeof batchApprovalSchema>;
export type BatchDispatchInput = z.infer<typeof batchDispatchSchema>;
export type ParentPriceResponseInput = z.infer<typeof parentPriceResponseSchema>;
export type FinalConfirmationInput = z.infer<typeof finalConfirmationSchema>;
export type ManualMaintenanceInput = z.infer<typeof manualMaintenanceSchema>;

export type PriceReviewTargetKind = 'enrollment' | 'legacy_enrollment';

export interface StoredPriceReviewTrigger {
	id: string;
	courseGroupId: string;
	sourceKind: string;
	sourceRef: string;
	reasonCode: string;
	effectiveOn: string;
	oldActiveCount: number;
	newActiveCount: number;
	oldLookupChildrenCount: number | null;
	newLookupChildrenCount: number | null;
	requestedPriceVersionId: string | null;
	dedupeKey: string;
	status: string;
	createdAt: string;
}

export interface StoredPriceReviewItem {
	id: string;
	batchId: string;
	batchCourseGroupId: string;
	batchCreatedAt: string;
	version: number;
	publicReference: string;
	targetKind: PriceReviewTargetKind;
	targetId: string;
	userId: string | null;
	oldBasePriceCents: number | null;
	oldPriceCents: number | null;
	newBasePriceCents: number | null;
	newFinalPriceCents: number | null;
	oldPriceSource: PriceSource | null;
	newPriceSource: PriceSource | null;
	oldPriceMode: PriceMode | null;
	newPriceMode: PriceMode | null;
	oldPriceVersionId: string | null;
	newPriceVersionId: string | null;
	oldPriceRuleId: string | null;
	newPriceRuleId: string | null;
	targetStateHash: string;
	expectedActiveCount: number;
	expectedLookupChildrenCount: number | null;
	effectiveOn: string;
	decisionCode: PricingDecisionCode;
	termsSnapshotJson: string;
	itemHash: string;
	acceptanceTextVersion: string;
	status: string;
	sentAt: string | null;
	responseDeadline: string | null;
	respondedAt: string | null;
	scheduledFor: string | null;
	appliedAt: string | null;
}

export interface CalculatedPriceReviewItem {
	id: string;
	publicReference: string;
	targetKind: PriceReviewTargetKind;
	targetId: string;
	userId: string | null;
	oldBasePriceCents: number | null;
	oldPriceCents: number | null;
	newBasePriceCents: number | null;
	newFinalPriceCents: number | null;
	oldPriceSource: PriceSource | null;
	newPriceSource: PriceSource | null;
	oldPriceMode: PriceMode | null;
	newPriceMode: PriceMode | null;
	oldPriceVersionId: string | null;
	newPriceVersionId: string | null;
	oldPriceRuleId: string | null;
	newPriceRuleId: string | null;
	targetStateHash: string;
	expectedActiveCount: number;
	expectedLookupChildrenCount: number | null;
	effectiveOn: string;
	decisionCode: PricingDecisionCode;
	decisionJson: string;
	termsSnapshotJson: string;
	itemHash: string;
	dedupeKey: string;
	manualContactRequired: boolean;
}

export interface PriceReviewRevalidation {
	current: boolean;
	reason: string;
}

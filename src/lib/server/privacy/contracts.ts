import { z } from 'zod';

const idempotencyKey = z.string().trim().min(8).max(200);

export const privacyExportRequestSchema = z.object({
	subjectUserId: z.string().uuid().optional(),
	idempotencyKey,
});

export const privacyDeleteRequestSchema = z.object({
	idempotencyKey,
});

export const privacyDeleteProcessSchema = z.object({
	privacyRequestId: z.string().uuid(),
	reason: z.string().trim().min(10).max(1000),
	confirmation: z.literal('confirmed'),
	idempotencyKey,
});

export interface PrivacyInventoryCategory {
	category: string;
	count: number;
}

export interface PrivacyDeletionInventory {
	subjectUserId: string;
	activeContracts: PrivacyInventoryCategory[];
	retainedCategories: PrivacyInventoryCategory[];
	holds: PrivacyInventoryCategory[];
	d1Cleanup: PrivacyInventoryCategory[];
	r2Cleanup: PrivacyInventoryCategory[];
	activeContractCount: number;
	retainedRecordCount: number;
	holdCount: number;
}

export type PrivacyClosureStatus =
	| 'blocked_by_active_contract'
	| 'completed_with_retained_evidence';

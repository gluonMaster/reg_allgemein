import { z } from 'zod';

const opaqueId = z.string().trim().min(1).max(200);
const reason = z.string().trim().min(3).max(1000);
const idempotencyKey = z.string().trim().min(8).max(200);

export const adminListQuerySchema = z.object({
	q: z.string().trim().max(160).default(''),
	status: z.string().trim().max(80).default(''),
	kind: z.string().trim().max(80).default(''),
	page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const blockUserSchema = z.object({
	userId: opaqueId,
	blocked: z.enum(['true', 'false']).transform((value) => value === 'true'),
	reason,
	confirmation: z.literal('confirmed'),
	idempotencyKey,
});

export const childCorrectionDecisionSchema = z.object({
	taskId: opaqueId,
	correctionId: opaqueId,
	decision: z.enum(['approve', 'reject']),
	reason,
	confirmation: z.literal('confirmed'),
	idempotencyKey,
});

export const importIssueDecisionSchema = z.object({
	issueId: opaqueId,
	decision: z.enum(['resolve', 'dismiss']),
	reason,
	confirmation: z.literal('confirmed'),
	idempotencyKey,
});

export const reviewDismissalSchema = z.object({
	taskId: opaqueId,
	decision: z.enum(['dismiss_name_match', 'dismiss_claim_conflict']),
	reason,
	confirmation: z.literal('confirmed'),
	idempotencyKey,
});

export const courseMappingDecisionSchema = z.object({
	taskId: opaqueId.optional(),
	mappingId: opaqueId.optional(),
	legacyEnrollmentId: opaqueId.optional(),
	courseGroupId: opaqueId.optional(),
	decision: z.enum(['confirm', 'reject']),
	reason,
	confirmation: z.literal('confirmed'),
	idempotencyKey,
});

export const catalogCourseDecisionSchema = z.object({
	courseGroupId: opaqueId,
	action: z.enum(['publish', 'hide', 'needs_review', 'set_capacity']),
	capacity: z.union([z.coerce.number().int().positive().max(10_000), z.literal('')]).optional(),
	reason,
	confirmation: z.literal('confirmed'),
	idempotencyKey,
});

export const familyCorrectionPreviewSchema = z
	.object({
		userId: opaqueId,
		destinationKind: z.enum(['legacy_existing', 'portal_allocated']),
		destinationAllocationId: opaqueId.optional(),
	})
	.superRefine((value, context) => {
		if (value.destinationKind === 'legacy_existing' && !value.destinationAllocationId) {
			context.addIssue({
				code: 'custom',
				path: ['destinationAllocationId'],
				message: 'A validated legacy destination is required.',
			});
		}
		if (value.destinationKind === 'portal_allocated' && value.destinationAllocationId) {
			context.addIssue({
				code: 'custom',
				path: ['destinationAllocationId'],
				message: 'A portal destination is allocated by the server.',
			});
		}
	});

export const familyCorrectionApplySchema = z.object({
	previewId: opaqueId,
	reason,
	confirmation: z.literal('confirmed'),
	idempotencyKey,
});

export const trialTransitionSchema = z
	.object({
		trialId: opaqueId,
		action: z.enum(['confirm', 'reject', 'cancel', 'attended', 'no_show', 'convert']),
		sessionId: opaqueId.optional(),
		confirmedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
		reason,
		confirmation: z.literal('confirmed'),
		idempotencyKey,
	})
	.superRefine((value, context) => {
		if (value.action === 'confirm' && (!value.sessionId || !value.confirmedDate)) {
			context.addIssue({
				code: 'custom',
				path: ['confirmedDate'],
				message: 'Confirmation requires a current session and future date.',
			});
		}
	});

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

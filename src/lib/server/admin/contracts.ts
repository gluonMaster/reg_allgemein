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

export const reconciliationListQuerySchema = z.object({
	periodId: opaqueId.optional(),
	sourceKind: z.enum(['access', 'plusbtext']).optional(),
	issueClass: z
		.enum([
			'course_mapping',
			'family_identity',
			'invalid_email',
			'invalid_birth_date',
			'price',
			'duration',
			'duplicate_service',
			'source_consistency',
		])
		.optional(),
	state: z
		.enum([
			'open',
			'assigned',
			'awaiting_upstream',
			'ready_to_verify',
			'resolved',
			'superseded',
		])
		.optional(),
	assigneeId: opaqueId.optional(),
	firstSeenRunId: opaqueId.optional(),
	lastSeenRunId: opaqueId.optional(),
	page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const reconciliationAction = z.enum([
	'assign',
	'unassign',
	'await_upstream',
	'mark_ready_to_verify',
	'same_service_duplicate',
	'distinct_service_proven',
	'exact_catalog_mapping',
	'verified_portal_family_link',
	'typed_child_correction',
	'typed_family_correction',
]);

const reconciliationReasonCode = z.enum([
	'operator_assignment',
	'operator_unassignment',
	'upstream_correction_requested',
	'upstream_correction_reported',
	'exact_mapping_confirmed',
	'same_service_confirmed',
	'distinct_service_evidence_confirmed',
	'portal_family_link_verified',
	'child_correction_verified',
	'family_correction_verified',
]);

export const reconciliationMutationSchema = z.object({
	caseId: opaqueId,
	expectedVersion: z.coerce.number().int().positive(),
	action: reconciliationAction,
	reasonCode: reconciliationReasonCode,
	assigneeId: opaqueId.optional(),
	targetType: z
		.enum(['course_group', 'legacy_family', 'legacy_child', 'user', 'family_reassignment'])
		.optional(),
	targetId: opaqueId.optional(),
	confirmation: z.literal('confirmed'),
	idempotencyKey,
});

export const reconciliationBatchMutationSchema = z.object({
	casesJson: z
		.string()
		.max(20_000)
		.transform((value, context) => {
			try {
				return z
					.array(
						z.object({ caseId: opaqueId, expectedVersion: z.number().int().positive() })
					)
					.min(1)
					.max(50)
					.parse(JSON.parse(value));
			} catch {
				context.addIssue({ code: 'custom', message: 'Invalid reconciliation batch.' });
				return z.NEVER;
			}
		}),
	action: z.enum(['assign', 'unassign', 'await_upstream', 'mark_ready_to_verify']),
	reasonCode: reconciliationReasonCode,
	assigneeId: opaqueId.optional(),
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
		confirmedDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/u)
			.optional(),
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

import { z } from 'zod';
import { isCalendarDate } from '$lib/server/time/berlin';

const opaqueId = z.string().trim().min(1).max(200);
const idempotencyKey = z.string().trim().min(8).max(200);
const reason = z.string().trim().min(3).max(1000);
const dayCode = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
const wallTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);

const requestFields = {
	childId: opaqueId,
	requestKind: z.enum(['nachhilfe', 'individual']),
	fundingKind: z.enum(['self_pay', 'jobcenter', 'socialamt', 'unknown']),
	subjects: z.string().trim().min(1).max(500),
	description: z.string().trim().max(2000).default(''),
	preferredDays: z.array(dayCode).max(7).default([]),
	preferredTimeWindows: z
		.array(
			z
				.object({ dayCode, startTime: wallTime, endTime: wallTime })
				.strict()
				.refine((value) => value.startTime < value.endTime, {
					message: 'The end time must be after the start time.',
				})
		)
		.max(14)
		.default([]),
	preferredFormat: z.enum(['online', 'onsite', 'mixed']),
	preferredLocations: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
};

export const requestCreateSchema = z
	.object({ ...requestFields, idempotencyKey })
	.strict()
	.superRefine((value, context) => {
		if (value.requestKind === 'individual' && value.fundingKind !== 'self_pay') {
			context.addIssue({ code: 'custom', path: ['fundingKind'], message: 'Individual is self-pay.' });
		}
		if (
			value.requestKind === 'nachhilfe' &&
			!['jobcenter', 'socialamt'].includes(value.fundingKind)
		) {
			context.addIssue({
				code: 'custom',
				path: ['fundingKind'],
				message: 'Nachhilfe requires Jobcenter or Sozialamt funding.',
			});
		}
	});

export const requestSaveSchema = z
	.object({
		requestId: opaqueId,
		expectedVersion: z.coerce.number().int().positive(),
		...requestFields,
		idempotencyKey,
	})
	.strict();

export const requestStateActionSchema = z
	.object({
		requestId: opaqueId,
		expectedVersion: z.coerce.number().int().positive(),
		idempotencyKey,
	})
	.strict();

export const documentUploadCommandSchema = z
	.object({
		requestId: opaqueId,
		authorizationId: opaqueId,
		replaceDocumentId: opaqueId.optional(),
		idempotencyKey,
	})
	.strict();

export const documentDeleteCommandSchema = z
	.object({ requestId: opaqueId, documentId: opaqueId, idempotencyKey })
	.strict();

export const adminRequestTransitionSchema = z
	.object({
		requestId: opaqueId,
		action: z.enum(['needs_documents', 'needs_info', 'approve', 'reject', 'cancel']),
		reason,
		confirmation: z.literal('confirmed'),
		idempotencyKey,
	})
	.strict();

export const adminDocumentAttestationSchema = z
	.object({
		documentId: opaqueId,
		documentSha256: z.string().regex(/^[a-f0-9]{64}$/u),
		outcome: z.enum(['clean', 'infected']),
		scannerLabel: z.string().trim().min(2).max(120),
		scannerVersion: z.string().trim().min(1).max(120),
		attestationTextVersion: z.string().trim().min(1).max(120),
		confirmation: z.literal('confirmed'),
		idempotencyKey,
	})
	.strict();

export const adminDocumentReviewSchema = z
	.object({
		documentId: opaqueId,
		decision: z.enum(['approve', 'reject']),
		reason,
		confirmation: z.literal('confirmed'),
		idempotencyKey,
	})
	.strict();

export const adminAuthorizationReviewSchema = z
	.object({
		authorizationId: opaqueId,
		action: z.enum(['approve', 'reject', 'revoke']),
		kind: z.enum(['jobcenter', 'socialamt']).optional(),
		validFrom: z.string().refine(isCalendarDate).optional(),
		validUntil: z.string().refine(isCalendarDate).optional(),
		reason,
		confirmation: z.literal('confirmed'),
		idempotencyKey,
	})
	.strict()
	.superRefine((value, context) => {
		if (
			value.action === 'approve' &&
			(!value.kind || !value.validFrom || !value.validUntil || value.validFrom > value.validUntil)
		) {
			context.addIssue({
				code: 'custom',
				path: ['validUntil'],
				message: 'Approval requires authority and inclusive dates.',
			});
		}
	});

export type RequestCreateInput = z.infer<typeof requestCreateSchema>;
export type RequestSaveInput = z.infer<typeof requestSaveSchema>;

import { z } from 'zod';
import { isCalendarDate } from '$lib/server/time/berlin';

const opaqueId = z.string().trim().min(1).max(200);
const idempotencyKey = z.string().trim().min(8).max(200);

export const trialSubmissionSchema = z
	.object({
		courseGroupId: opaqueId,
		childId: opaqueId,
		sessionId: opaqueId,
		requestedDate: z.string().refine(isCalendarDate),
		idempotencyKey,
	})
	.strict();

export const trialParentCancellationSchema = z
	.object({
		trialId: opaqueId,
		idempotencyKey,
	})
	.strict();

export type TrialSubmission = z.infer<typeof trialSubmissionSchema>;


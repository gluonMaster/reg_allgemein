import { z } from 'zod';

export const supportCategories = [
	'absence',
	'technical',
	'contract',
	'payment',
	'schedule',
	'nachhilfe',
	'other',
] as const;

export type SupportCategory = (typeof supportCategories)[number];
export type SupportStatus =
	| 'open'
	| 'waiting_for_admin'
	| 'waiting_for_parent'
	| 'answered'
	| 'closed';

const opaqueId = z.string().trim().min(1).max(200);
const idempotencyKey = z.string().trim().min(8).max(200);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const message = z.string().trim().min(1).max(4000);

export const createThreadSchema = z
	.object({
		category: z.enum(supportCategories),
		subject: z.string().trim().min(1).max(160),
		message,
		idempotencyKey,
	})
	.strict();

export const absenceSchema = z
	.object({
		enrollmentId: opaqueId,
		childId: opaqueId,
		absenceDate: calendarDate,
		reason: z.string().trim().min(1).max(500),
		message: z.string().trim().max(3000).default(''),
		idempotencyKey,
	})
	.strict();

export const parentMessageSchema = z
	.object({
		publicReference: opaqueId,
		message,
		idempotencyKey,
	})
	.strict();

export const closeThreadSchema = z
	.object({ publicReference: opaqueId, idempotencyKey })
	.strict();

export const adminReplySchema = z
	.object({
		publicReference: opaqueId,
		message,
		outcome: z.enum(['waiting_for_parent', 'answered']),
		idempotencyKey,
	})
	.strict();

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type AbsenceInput = z.infer<typeof absenceSchema>;
export type ParentMessageInput = z.infer<typeof parentMessageSchema>;
export type CloseThreadInput = z.infer<typeof closeThreadSchema>;
export type AdminReplyInput = z.infer<typeof adminReplySchema>;

export interface SupportThreadSummary {
	id: string;
	publicReference: string;
	category: SupportCategory;
	status: SupportStatus;
	subject: string;
	createdAt: string;
	updatedAt: string;
	closedAt: string | null;
	messageCount: number;
	absenceDate: string | null;
}

export interface SupportMessageView {
	id: string;
	senderKind: 'parent' | 'admin' | 'system';
	body: string;
	createdAt: string;
}

export interface SupportThreadDetail extends SupportThreadSummary {
	userId: string;
	messages: SupportMessageView[];
}

export interface AbsenceEnrollmentOption {
	enrollmentId: string;
	childId: string;
	childName: string;
	courseName: string;
	activeFrom: string;
	activeUntil: string | null;
}


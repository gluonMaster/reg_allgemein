import { z } from 'zod';

function isCalendarDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export const childValuesSchema = z
	.object({
		fullName: z.string().trim().min(1).max(160),
		birthDate: z.string().refine(isCalendarDate),
	})
	.strict();

// Legacy import identities are deterministic opaque keys (`child_<hash>`), while
// portal-created children use UUIDs. Authorization is always enforced by the
// repository, so the public contract accepts either representation as an opaque ID.
const childIdSchema = z.string().trim().min(1).max(128);

export const childMutationSchema = childValuesSchema.extend({
	childId: childIdSchema.optional(),
	confirmDuplicate: z.boolean().default(false),
});

export const childCorrectionSchema = childValuesSchema.extend({
	childId: childIdSchema,
});

export const legacyClaimConfirmationSchema = z
	.object({ token: z.string().min(32).max(512) })
	.strict();

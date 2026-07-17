import { z } from 'zod';

const email = z.string().trim().email().max(254);
const password = z.string().min(1).max(256);
const personName = z.string().trim().min(1).max(100);
const opaqueToken = z.string().min(32).max(512);

export const registerInputSchema = z
	.object({
		email,
		password,
		firstName: personName,
		lastName: personName,
		privacyAccepted: z.literal(true),
		privacyNoticeVersion: z.string().min(1).max(100),
		turnstileToken: z.string().min(1).max(4096),
	})
	.strict();

export const loginInputSchema = z
	.object({
		email,
		password,
	})
	.strict();

export const emailOnlyInputSchema = z.object({ email }).strict();

export const tokenInputSchema = z.object({ token: opaqueToken }).strict();

export const resetPasswordInputSchema = z
	.object({
		token: opaqueToken,
		password,
	})
	.strict();

export const emailChangeInputSchema = z.object({ email }).strict();

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;

export function formDataRecord(form: FormData): Record<string, unknown> {
	return Object.fromEntries(form.entries());
}

import { z } from 'zod';
import { buildAdminBootstrapStatements } from '$lib/server/auth/admin-bootstrap';
import { BcryptPasswordHasher } from '$lib/server/auth/password';
import { normalizeEmail, normalizePersonName } from '$lib/server/auth/normalization';
import type { StatementSpec } from '$lib/server/db/database';
import { textField } from './validation.server';

export const bootstrapIdentitySchema = z
	.object({
		email: z.email().max(160),
		firstName: textField,
		lastName: textField,
		password: z.string().min(12).max(128),
		confirmEmail: z.email().max(160),
	})
	.strict()
	.refine((v) => normalizeEmail(v.email) === normalizeEmail(v.confirmEmail));
/** Operator explicitly attests the initial admin identity out-of-band; no public registration bypass. */
export async function buildIntakeBootstrap(input: {
	identity: unknown;
	now: string;
	requestId: string;
	userId: string;
}): Promise<StatementSpec[]> {
	const data = bootstrapIdentitySchema.parse(input.identity);
	const email = normalizeEmail(data.email);
	const hash = await new BcryptPasswordHasher(12, 128).hash(data.password);
	return [
		{
			sql: `INSERT INTO users(id, email, email_normalized, password_hash, email_verified_at,
	 first_name, last_name, first_name_normalized, last_name_normalized, privacy_notice_version, privacy_accepted_at, created_at, updated_at)
	 SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'intake-operator-attestation-v1', ?, ?, ?
	 WHERE NOT EXISTS(SELECT 1 FROM users)
	 AND EXISTS(SELECT 1 FROM admin_bootstrap_control WHERE id = 'first-admin' AND status = 'available')`,
			params: [
				input.userId,
				email,
				email,
				hash,
				input.now,
				data.firstName,
				data.lastName,
				normalizePersonName(data.firstName),
				normalizePersonName(data.lastName),
				input.now,
				input.now,
				input.now,
			],
		},
		...buildAdminBootstrapStatements({
			targetUserId: input.userId,
			reason: 'trial_intake_operator_identity_attested',
			requestId: input.requestId,
			now: input.now,
		}),
	];
}

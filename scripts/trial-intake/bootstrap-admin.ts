import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { unstable_readConfig } from 'wrangler';
import { z } from 'zod';
import { assertRemoteD1ConfigTarget, RemoteD1Boundary } from '../remote-d1-target';
import {
	buildIntakeBootstrap,
	bootstrapIdentitySchema,
} from '../../src/lib/trial-intake/server/bootstrap.server';
import { DatabaseBoundary, type SqlDatabaseBoundary } from '../../src/lib/server/db/database';
import { remoteBootstrapVerificationStatement } from '../admin-bootstrap-remote';
import { createMigratedTestD1 } from '../../tests/helpers/d1';

const fingerprint = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function stdinIdentity() {
	let raw = '';
	for await (const chunk of process.stdin) {
		raw += chunk.toString();
		if (Buffer.byteLength(raw) > 8192) throw new Error('IDENTITY_TOO_LARGE');
	}
	return bootstrapIdentitySchema.parse(JSON.parse(raw));
}
async function apply(db: SqlDatabaseBoundary, identity: unknown, userId: string) {
	// Require the dedicated intake schema before the single atomic identity/role write.
	await db.first({ sql: 'SELECT id FROM trial_intake_requests LIMIT 1' });
	const requestId = `trial-intake-bootstrap:${userId}`;
	const before = await db.first<{ status: string; consumed_by_user_id: string | null }>({
		sql: `SELECT status, consumed_by_user_id FROM admin_bootstrap_control WHERE id = 'first-admin'`,
	});
	if (before?.status !== 'available') throw new Error('INTAKE_BOOTSTRAP_ALREADY_CONSUMED');
	const statements = await buildIntakeBootstrap({
		identity,
		userId,
		requestId,
		now: new Date().toISOString(),
	});
	let writeFailed = false;
	try {
		await db.batch(statements);
	} catch {
		writeFailed = true;
	}
	// Read-back after every attempt, including a transport failure. Never blindly retry a write.
	const after = await db.first<Record<string, unknown>>(
		remoteBootstrapVerificationStatement({ targetUserId: userId, requestId })
	);
	const success =
		after?.status === 'consumed' &&
		after.active_admin_count === 1 &&
		after.action_recorded === 1 &&
		after.assertion_recorded === 1;
	process.stdout.write(
		JSON.stringify({
			result: success ? 'success' : 'ambiguous',
			writeFailed,
			activeAdminCount: after?.active_admin_count ?? null,
			auditVerified: success,
		}) + '\n'
	);
	if (!success) throw new Error('INTAKE_BOOTSTRAP_POSTCONDITION_UNCONFIRMED');
}
async function main() {
	const { values } = parseArgs({
		options: {
			rehearse: { type: 'boolean' },
			remote: { type: 'boolean' },
			config: { type: 'string' },
			'database-id': { type: 'string' },
			'user-id': { type: 'string' },
			confirmation: { type: 'string' },
			'print-confirmation': { type: 'boolean' },
		},
	});
	if (values.rehearse) {
		if (Object.keys(values).length !== 1) throw new Error('REHEARSAL_OPTIONS_FORBIDDEN');
		const context = await createMigratedTestD1();
		try {
			await apply(
				new DatabaseBoundary(context.db),
				{
					email: 'operator@example.test',
					confirmEmail: 'operator@example.test',
					firstName: 'Synthetic',
					lastName: 'Operator',
					password: 'Synthetic-only-Password-2026!',
				},
				crypto.randomUUID()
			);
		} finally {
			await context.dispose();
		}
		return;
	}
	if (!values.config || !values['database-id'] || !values['user-id'])
		throw new Error('EXACT_TARGET_REQUIRED');
	const config = unstable_readConfig({ config: values.config }, { hideWarnings: true });
	if (config.vars?.PORTAL_MODE !== 'trial_intake' || config.name !== 'kolibri-trial-intake')
		throw new Error('INTAKE_TARGET_REQUIRED');
	const target = assertRemoteD1ConfigTarget(config, 'production', values['database-id']);
	const userId = z.uuid().parse(values['user-id']);
	const identity = await stdinIdentity();
	const confirmation = `INTAKE_FIRST_ADMIN_${fingerprint([target, userId, identity.email.toLowerCase(), identity.firstName, identity.lastName])}`;
	if (values['print-confirmation']) {
		if (values.remote || values.confirmation) throw new Error('CONFIRMATION_READ_ONLY');
		process.stdout.write(confirmation + '\n');
		return;
	}
	if (!values.remote || values.confirmation !== confirmation)
		throw new Error('IDENTITY_TARGET_CONFIRMATION_REQUIRED');
	const token = process.env.CLOUDFLARE_API_TOKEN;
	if (!token) throw new Error('CLOUDFLARE_API_TOKEN_REQUIRED');
	await apply(new RemoteD1Boundary(target, token), identity, userId);
}
main().catch(() => {
	// Do not print SQL, credentials, source identity, provider responses, or nested causes.
	process.stderr.write(
		'INTAKE_BOOTSTRAP_FAILED: inspect the read-only target state before any retry.\n'
	);
	process.exitCode = 1;
});

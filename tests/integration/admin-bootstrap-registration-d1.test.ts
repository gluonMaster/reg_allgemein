import {
	AdminBootstrapRepository,
	buildAdminBootstrapStatements,
} from '$lib/server/auth/admin-bootstrap';
import { AdminIdentityRepository } from '$lib/server/auth/admin-identity-repository';
import { createAuthRuntime, type AuthRuntime } from '$lib/server/auth/runtime';
import { BcryptPasswordHasher } from '$lib/server/auth/password';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { AuthEmailDispatcher, FakeEmailProvider } from '$lib/server/email/auth-email';
import { requireAdmin } from '$lib/server/security/authorization';
import {
	assertRemoteBootstrapResult,
	remoteBootstrapVerificationStatement,
	renderD1BatchSql,
} from '../../scripts/admin-bootstrap-remote';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';
import { seedCurrentLegacySnapshot } from '../helpers/legacy-claim-fixtures';

const NOW = '2026-09-04T10:00:00.000Z';
const LATER = '2026-09-04T10:01:00.000Z';
const SECRET = 'synthetic-registration-bootstrap-secret-'.repeat(2);
const PASSWORD = 'synthetic-bootstrap-password';

describe('ordinary verified registration to admin transition', () => {
	let context: TestD1Context;
	let auth: AuthRuntime;
	let bootstrap: AdminBootstrapRepository;
	let identities: AdminIdentityRepository;
	let provider: FakeEmailProvider;
	let dispatcher: AuthEmailDispatcher;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		await seedCurrentLegacySnapshot({ db: context.db, families: [], now: NOW });
		const database = new DatabaseBoundary(context.db);
		const config = loadRuntimeConfig({
			APP_ENV: 'test',
			PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
			DB: context.db,
			JWT_SECRET: SECRET,
			AUTH_PUBLIC_ENABLED: 'true',
			EMAIL_PROVIDER: 'fake',
			PRIVACY_NOTICE_VERSION: 'synthetic-notice-v1',
		});
		// Keep the runtime's default family-verification extension enabled. Directly
		// seeding a verified user/FamilyID would miss the original production failure.
		auth = createAuthRuntime(config, {
			clock: { now: () => NOW },
			passwordHasher: new BcryptPasswordHasher(12, 128, 4),
		});
		bootstrap = new AdminBootstrapRepository(database);
		identities = new AdminIdentityRepository(database);
		provider = new FakeEmailProvider();
		dispatcher = new AuthEmailDispatcher(auth.repository, provider, SECRET, config, () => NOW);
	});

	afterEach(async () => {
		if (context) await context.dispose();
	});

	async function registeredParent(slot: string) {
		const email = `bootstrap-${slot}@example.test`;
		expect(
			await auth.service.register({
				data: {
					email,
					password: PASSWORD,
					firstName: 'Synthetic',
					lastName: 'Operator',
					privacyAccepted: true,
					privacyNoticeVersion: 'synthetic-notice-v1',
					turnstileToken: 'synthetic-turnstile-pass',
				},
				requestId: `register-${slot}`,
				requestSubject: `register-${slot}`,
			})
		).toMatchObject({ created: true });
		await dispatcher.dispatchNext();
		const message = provider.messages.find((item) => item.to === email);
		const link = message?.text.match(
			/https:\/\/portal\.example\.test\/auth\/verify\?[^\s]+/
		)?.[0];
		if (!link) throw new Error('Synthetic verification link missing.');
		expect(
			await auth.service.verifyEmail({
				token: new URL(link).searchParams.get('token')!,
				requestId: `verify-${slot}`,
				requestSubject: `verify-${slot}`,
			})
		).toBe(true);
		await dispatcher.dispatchNext(); // Complete only the local fake welcome delivery.
		const session = await auth.service.login({
			data: { email, password: PASSWORD },
			requestSubject: `login-${slot}`,
		});
		const actor = await auth.sessions.authenticate(session.sessionToken, NOW);
		if (!actor) throw new Error('Verified synthetic parent session missing.');
		expect(actor.role).toBe('parent');
		const finalization = await context.db
			.prepare('SELECT * FROM family_finalization_commits WHERE user_id = ?')
			.bind(actor.id)
			.first();
		expect(finalization).toMatchObject({
			result_kind: 'portal_allocated',
			assertion_passed: 1,
		});
		return { actor, session, finalization, email };
	}

	async function transitionState(userId: string) {
		return context.db
			.prepare(
				`SELECT users.role, users.session_version, sessions.revoked_at,
				sessions.revocation_reason FROM users
				JOIN auth_sessions AS sessions ON sessions.user_id = users.id WHERE users.id = ?`
			)
			.bind(userId)
			.first();
	}

	it.each(['repository', 'remote-sql-rendering'] as const)(
		'bootstraps one ordinarily verified parent via %s and preserves registration evidence',
		async (transport) => {
			const first = await registeredParent('first');
			const second = await registeredParent('second');
			const secondBefore = await transitionState(second.actor.id);
			const input = {
				targetUserId: first.actor.id,
				reason: 'Synthetic first administrator approval',
				requestId: 'ordinary-registration-bootstrap',
				now: LATER,
			};
			if (transport === 'repository') await bootstrap.consume(input);
			else {
				const statements = [
					...buildAdminBootstrapStatements(input),
					remoteBootstrapVerificationStatement(input),
				];
				const result = await context.db.batch(
					// D1's local prepare accepts one statement. Render the CLI's same
					// controlled statements individually, including its terminal SELECT.
					statements.map((statement) => context.db.prepare(renderD1BatchSql([statement])))
				);
				assertRemoteBootstrapResult(result, statements.length);
			}
			expect(await bootstrap.status()).toEqual({ status: 'consumed', activeAdminCount: 1 });
			expect(await transitionState(first.actor.id)).toEqual({
				role: 'admin',
				session_version: 2,
				revoked_at: LATER,
				revocation_reason: 'role_change',
			});
			expect(await auth.sessions.authenticate(first.session.sessionToken, LATER)).toBeNull();
			expect(
				await auth.sessions.authenticate(second.session.sessionToken, LATER)
			).toMatchObject({
				id: second.actor.id,
				role: 'parent',
			});
			expect(await transitionState(second.actor.id)).toEqual(secondBefore);
			for (const parent of [first, second]) {
				expect(
					await context.db
						.prepare('SELECT * FROM family_finalization_commits WHERE user_id = ?')
						.bind(parent.actor.id)
						.first()
				).toEqual(parent.finalization);
			}
			expect(
				await context.db
					.prepare(
						`SELECT
				(SELECT COUNT(*) FROM admin_bootstrap_actions) AS actions,
				(SELECT COUNT(*) FROM admin_bootstrap_assertions WHERE assertion_passed = 1) AS assertions,
				(SELECT COUNT(*) FROM audit_events WHERE action = 'auth.first_admin_bootstrapped') AS audits,
				(SELECT COUNT(*) FROM admin_bootstrap_actions a
				 JOIN admin_bootstrap_assertions s ON s.action_id = a.id
				 JOIN audit_events e ON e.id = a.audit_event_id AND e.request_id = a.request_id
				 JOIN admin_bootstrap_control c ON c.audit_event_id = e.id
				 WHERE c.status = 'consumed' AND c.consumed_by_user_id = a.target_user_id
				 AND e.target_id = a.target_user_id) AS chains`
					)
					.first()
			).toEqual({ actions: 1, assertions: 1, audits: 1, chains: 1 });
			await expect(
				bootstrap.consume({ ...input, requestId: 'replay-bootstrap' })
			).rejects.toMatchObject({ code: 'ADMIN_BOOTSTRAP_REJECTED' });
			expect(await bootstrap.status()).toEqual({ status: 'consumed', activeAdminCount: 1 });
		},
		45_000
	);

	it('allows the same registration evidence for normal audited admin assignment', async () => {
		const first = await registeredParent('first');
		const second = await registeredParent('second');
		await bootstrap.consume({
			targetUserId: first.actor.id,
			reason: 'Synthetic bootstrap',
			requestId: 'bootstrap',
			now: LATER,
		});
		const adminSession = await auth.service.login({
			data: { email: first.email, password: PASSWORD },
			requestSubject: 'admin-login',
		});
		const admin = requireAdmin(
			(await auth.sessions.authenticate(adminSession.sessionToken, LATER))!
		);
		expect(
			await identities.assignAdmin({
				actor: admin,
				targetUserId: second.actor.id,
				reason: 'Synthetic assignment',
				requestId: 'assign',
				now: LATER,
			})
		).toBe(true);
		expect(await transitionState(second.actor.id)).toEqual({
			role: 'admin',
			session_version: 2,
			revoked_at: LATER,
			revocation_reason: 'role_change',
		});
		expect(
			await context.db
				.prepare('SELECT * FROM family_finalization_commits WHERE user_id = ?')
				.bind(second.actor.id)
				.first()
		).toEqual(second.finalization);
		expect(
			await context.db
				.prepare(
					"SELECT COUNT(*) AS count FROM audit_events WHERE action = 'auth.role_assigned' AND target_id = ?"
				)
				.bind(second.actor.id)
				.first()
		).toEqual({ count: 1 });
	}, 45_000);

	it.each(['portal-allocation-with-child', 'exact-email-finalization'] as const)(
		'rejects both transitions for %s without changing role, session, audit or control',
		async (retained) => {
			const target = await registeredParent('target');
			if (retained === 'portal-allocation-with-child') {
				await context.db
					.prepare(
						`INSERT INTO children
					(id, owner_user_id, family_number_id, origin, source_child_key,
					 source_full_name, source_full_name_normalized, source_birth_date,
					 full_name, full_name_normalized, birth_date, last_seen_run_id, created_at, updated_at)
					SELECT 'retained-child', user_id, family_number_id, 'portal', 'retained-child',
					 'Synthetic Child', 'synthetic child', '2016-01-01',
					 'Synthetic Child', 'synthetic child', '2016-01-01', legacy_import_run_id, ?, ?
					FROM family_finalization_commits WHERE user_id = ?`
					)
					.bind(NOW, NOW, target.actor.id)
					.run();
			} else {
				// Isolate historical exact-email evidence from the independent claim/child guards.
				await context.db
					.prepare(
						"UPDATE family_finalization_commits SET result_kind = 'exact_email' WHERE user_id = ?"
					)
					.bind(target.actor.id)
					.run();
			}
			const before = await transitionState(target.actor.id);
			const input = {
				targetUserId: target.actor.id,
				reason: 'Reject retained state',
				requestId: 'denied-bootstrap',
				now: LATER,
			};
			await expect(bootstrap.consume(input)).rejects.toMatchObject({
				code: 'ADMIN_BOOTSTRAP_REJECTED',
			});
			expect(await transitionState(target.actor.id)).toEqual(before);
			expect(await bootstrap.status()).toEqual({ status: 'available', activeAdminCount: 0 });
			expect(
				await context.db
					.prepare(
						`SELECT
				(SELECT COUNT(*) FROM admin_bootstrap_actions) AS actions,
				(SELECT COUNT(*) FROM admin_bootstrap_assertions) AS assertions,
				(SELECT COUNT(*) FROM audit_events WHERE action = 'auth.first_admin_bootstrapped') AS audits`
					)
					.first()
			).toEqual({ actions: 0, assertions: 0, audits: 0 });
			const operator = await registeredParent('operator');
			// Local fixture only: establish the existing admin independently of the guard under test.
			await context.db
				.prepare("UPDATE users SET role = 'admin' WHERE id = ?")
				.bind(operator.actor.id)
				.run();
			const actor = requireAdmin(
				(await auth.sessions.authenticate(operator.session.sessionToken, LATER))!
			);
			expect(
				await identities.assignAdmin({ ...input, actor, requestId: 'denied-assignment' })
			).toBe(false);
			expect(await transitionState(target.actor.id)).toEqual(before);
			expect(
				await context.db
					.prepare(
						"SELECT COUNT(*) AS count FROM audit_events WHERE action = 'auth.role_assigned'"
					)
					.first()
			).toEqual({ count: 0 });
		},
		45_000
	);
});

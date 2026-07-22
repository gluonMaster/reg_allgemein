import {
	AdminBootstrapError,
	AdminBootstrapRepository,
	buildAdminBootstrapStatements,
} from '$lib/server/auth/admin-bootstrap';
import { DatabaseBoundary } from '$lib/server/db/database';
import {
	remoteBootstrapVerificationStatement,
	renderD1BatchSql,
} from '../../scripts/admin-bootstrap-remote';
import { unstable_splitSqlQuery } from 'wrangler';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const NOW = '2026-07-22T12:00:00.000Z';

async function insertUser(
	context: TestD1Context,
	input: {
		id: string;
		role?: 'parent' | 'admin';
		verified?: boolean;
		blocked?: boolean;
	}
): Promise<void> {
	await context.db
		.prepare(
			`INSERT INTO users (
			id, email, email_normalized, password_hash, email_verified_at, role,
			is_blocked, account_status, first_name, last_name,
			first_name_normalized, last_name_normalized, preferred_language,
			privacy_notice_version, privacy_accepted_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 'de', ?, ?, ?, ?)`
		)
		.bind(
			input.id,
			`${input.id}@example.test`,
			`${input.id}@example.test`,
			`synthetic-password-hash-${input.id}`,
			input.verified === false ? null : NOW,
			input.role ?? 'parent',
			input.blocked ? 1 : 0,
			'Synthetic',
			'Operator',
			'synthetic',
			'operator',
			'synthetic-notice-v1',
			NOW,
			NOW,
			NOW
		)
		.run();
}

async function insertSession(context: TestD1Context, userId: string): Promise<void> {
	await context.db
		.prepare(
			`INSERT INTO auth_sessions (
			id, user_id, jti_hash, csrf_hash, session_version, expires_at,
			revoked_at, revocation_reason, created_at, last_seen_at
		) VALUES (?, ?, ?, ?, 1, ?, NULL, NULL, ?, ?)`
		)
		.bind(
			`session-${userId}`,
			userId,
			'a'.repeat(64),
			'b'.repeat(64),
			'2026-07-29T12:00:00.000Z',
			NOW,
			NOW
		)
		.run();
}

describe('stage 13 one-shot first-admin bootstrap', () => {
	let contexts: TestD1Context[] = [];

	afterEach(async () => {
		await Promise.all(contexts.map((context) => context.dispose()));
		contexts = [];
	});

	async function setup(): Promise<{
		context: TestD1Context;
		repository: AdminBootstrapRepository;
	}> {
		const context = await createMigratedTestD1();
		contexts.push(context);
		return {
			context,
			repository: new AdminBootstrapRepository(new DatabaseBoundary(context.db)),
		};
	}

	it('promotes exactly one verified parent, revokes sessions and permanently consumes the control', async () => {
		const { context, repository } = await setup();
		await insertUser(context, { id: 'bootstrap-parent' });
		await insertSession(context, 'bootstrap-parent');

		await repository.consume({
			targetUserId: 'bootstrap-parent',
			reason: 'initial production operator approval',
			requestId: 'request-bootstrap-first',
			now: NOW,
		});

		expect(await repository.status()).toEqual({ status: 'consumed', activeAdminCount: 1 });
		expect(
			await context.db
				.prepare(`SELECT role, session_version FROM users WHERE id = ?`)
				.bind('bootstrap-parent')
				.first()
		).toEqual({ role: 'admin', session_version: 2 });
		expect(
			await context.db
				.prepare(
					`SELECT revoked_at, revocation_reason FROM auth_sessions WHERE user_id = ?`
				)
				.bind('bootstrap-parent')
				.first()
		).toEqual({ revoked_at: NOW, revocation_reason: 'role_change' });

		const evidence = await context.db
			.prepare(
				`SELECT action.reason, audit.action, audit.actor_kind, audit.safe_diff_json,
				assertion.assertion_passed
			FROM admin_bootstrap_actions action
			JOIN audit_events audit ON audit.id = action.audit_event_id
			JOIN admin_bootstrap_assertions assertion ON assertion.action_id = action.id`
			)
			.first<{
				reason: string;
				action: string;
				actor_kind: string;
				safe_diff_json: string;
				assertion_passed: number;
			}>();
		expect(evidence).toMatchObject({
			reason: 'initial production operator approval',
			action: 'auth.first_admin_bootstrapped',
			actor_kind: 'system',
			assertion_passed: 1,
		});
		expect(JSON.parse(evidence?.safe_diff_json ?? '{}')).toEqual({
			role: 'admin',
			sessions_revoked: true,
			oneShot: true,
		});

		await expect(
			repository.consume({
				targetUserId: 'bootstrap-parent',
				reason: 'replay',
				requestId: 'request-bootstrap-replay',
				now: '2026-07-22T12:01:00.000Z',
			})
		).rejects.toMatchObject({ code: 'ADMIN_BOOTSTRAP_REJECTED' });
		expect(await repository.status()).toEqual({ status: 'consumed', activeAdminCount: 1 });
	}, 45_000);

	it('rejects an unverified or blocked target and refuses bootstrap while an active admin exists', async () => {
		const { context, repository } = await setup();
		for (const candidate of [
			{ id: 'unverified-parent', verified: false },
			{ id: 'blocked-parent', blocked: true },
		] as const) {
			await insertUser(context, candidate);
			await expect(
				repository.consume({
					targetUserId: candidate.id,
					reason: 'invalid candidate',
					requestId: `request-${candidate.id}`,
					now: NOW,
				})
			).rejects.toBeInstanceOf(AdminBootstrapError);
			expect(await repository.status()).toEqual({ status: 'available', activeAdminCount: 0 });
		}

		await insertUser(context, { id: 'existing-admin', role: 'admin' });
		await insertUser(context, { id: 'candidate-parent' });
		await expect(
			repository.consume({
				targetUserId: 'candidate-parent',
				reason: 'must not create another admin',
				requestId: 'request-existing-admin',
				now: NOW,
			})
		).rejects.toMatchObject({ code: 'ADMIN_BOOTSTRAP_REJECTED' });
		expect(await repository.status()).toEqual({ status: 'available', activeAdminCount: 1 });
	}, 45_000);

	it('serializes concurrent attempts so only one candidate can become admin', async () => {
		const { context, repository } = await setup();
		await insertUser(context, { id: 'candidate-a' });
		await insertUser(context, { id: 'candidate-b' });

		const attempts = await Promise.allSettled([
			repository.consume({
				targetUserId: 'candidate-a',
				reason: 'concurrent bootstrap A',
				requestId: 'request-concurrent-a',
				now: NOW,
			}),
			repository.consume({
				targetUserId: 'candidate-b',
				reason: 'concurrent bootstrap B',
				requestId: 'request-concurrent-b',
				now: NOW,
			}),
		]);
		expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
		expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
		expect(await repository.status()).toEqual({ status: 'consumed', activeAdminCount: 1 });
		expect(
			await context.db
				.prepare(`SELECT COUNT(*) AS count FROM admin_bootstrap_actions`)
				.first<{ count: number }>()
		).toEqual({ count: 1 });
	}, 45_000);

	it('executes the exact-ID remote SQL rendering with escaped evidence values', async () => {
		const { context, repository } = await setup();
		await insertUser(context, { id: 'rendered-bootstrap-parent' });
		const input = {
			targetUserId: 'rendered-bootstrap-parent',
			reason: "two-person operator's approval",
			requestId: 'request-rendered-bootstrap',
			now: NOW,
		};
		const rendered = renderD1BatchSql([
			...buildAdminBootstrapStatements(input),
			remoteBootstrapVerificationStatement(input),
		]);
		await context.db.batch(
			unstable_splitSqlQuery(rendered).map((statement) => context.db.prepare(statement))
		);
		expect(await repository.status()).toEqual({ status: 'consumed', activeAdminCount: 1 });
		expect(
			await context.db
				.prepare(`SELECT reason FROM admin_bootstrap_actions WHERE request_id = ?`)
				.bind(input.requestId)
				.first()
		).toEqual({ reason: input.reason });
	}, 45_000);
});

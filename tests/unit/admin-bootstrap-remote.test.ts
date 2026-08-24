import { describe, expect, it } from 'vitest';
import { buildAdminBootstrapStatements } from '$lib/server/auth/admin-bootstrap';
import {
	assertLocalBootstrapConfigTarget,
	assertRemoteBootstrapConfigTarget,
	assertRemoteBootstrapResult,
	buildPinnedWranglerConfig,
	remoteBootstrapVerificationStatement,
	renderD1BatchSql,
} from '../../scripts/admin-bootstrap-remote';

const productionId = '11111111-1111-4111-8111-111111111111';
const previewId = '22222222-2222-4222-8222-222222222222';
const accountId = 'a'.repeat(32);

describe('pinned remote first-admin bootstrap', () => {
	it('requires the exact config APP_ENV and environment-specific database ID', () => {
		const production = {
			account_id: accountId,
			vars: { APP_ENV: 'production' },
			d1_databases: [
				{
					binding: 'DB',
					database_id: productionId,
				},
			],
		};
		expect(() =>
			assertRemoteBootstrapConfigTarget(production, 'production', productionId)
		).not.toThrow();
		expect(() => assertRemoteBootstrapConfigTarget(production, 'preview', previewId)).toThrow(
			'CLI_ENVIRONMENT_TARGET_MISMATCH'
		);
		expect(() =>
			assertRemoteBootstrapConfigTarget(production, 'production', previewId)
		).toThrow('CLI_DATABASE_TARGET_MISMATCH');
	});

	it('accepts a dedicated preview database_id and rejects dev overlays or shared identities', () => {
		expect(() =>
			assertRemoteBootstrapConfigTarget(
				{
					account_id: accountId,
					vars: { APP_ENV: 'preview' },
					d1_databases: [
						{
							binding: 'DB',
							database_id: previewId,
						},
					],
				},
				'preview',
				previewId
			)
		).not.toThrow();
		expect(() =>
			assertRemoteBootstrapConfigTarget(
				{
					account_id: accountId,
					vars: { APP_ENV: 'preview' },
					d1_databases: [
						{
							binding: 'DB',
							database_id: previewId,
							preview_database_id: previewId,
						},
					],
				},
				'preview',
				previewId
			)
		).toThrow('CLI_REMOTE_DATABASE_ISOLATION_REQUIRED');
		expect(() =>
			assertRemoteBootstrapConfigTarget(
				{
					account_id: accountId,
					vars: { APP_ENV: 'preview' },
					d1_databases: [
						{
							binding: 'DB',
							database_id: productionId,
							preview_database_id: previewId,
						},
					],
				},
				'preview',
				previewId
			)
		).toThrow('CLI_DATABASE_SELECTOR_AMBIGUOUS');
	});

	it('rejects selector collisions and additional D1 bindings before remote execution', () => {
		const base = {
			account_id: accountId,
			vars: { APP_ENV: 'preview' },
			d1_databases: [
				{
					binding: 'DB',
					database_name: previewId,
					database_id: previewId,
				},
			],
		};
		expect(() => assertRemoteBootstrapConfigTarget(base, 'preview', previewId)).toThrow(
			'CLI_DATABASE_SELECTOR_AMBIGUOUS'
		);
		expect(() =>
			assertRemoteBootstrapConfigTarget(
				{
					...base,
					d1_databases: [
						{ ...base.d1_databases[0], database_name: 'preview-database' },
						{ binding: previewId, database_id: productionId },
					],
				},
				'preview',
				previewId
			)
		).toThrow('CLI_DATABASE_BINDING_INVALID');
		expect(() =>
			assertRemoteBootstrapConfigTarget(
				{
					account_id: accountId,
					vars: { APP_ENV: 'preview' },
					d1_databases: [{ binding: 'DB', database_id: 'replace-me' }],
				},
				'preview',
				previewId
			)
		).toThrow('CLI_DATABASE_ID_INVALID');
	});

	it('uses config-only local targeting and strips all resource selectors from the child config', () => {
		expect(
			assertLocalBootstrapConfigTarget({
				vars: { APP_ENV: 'development', SECRET_FROM_DEV_VARS: 'must-not-be-loaded' },
				d1_databases: [{ binding: 'DB', database_id: 'local-reg-allgemein' }],
			})
		).toBe('local-reg-allgemein');
		const childConfig = JSON.parse(
			buildPinnedWranglerConfig({
				account_id: 'synthetic-account',
				compliance_region: 'eu',
				vars: { APP_ENV: 'preview', SECRET: 'not-forwarded' },
				d1_databases: [{ binding: 'DB', database_id: productionId }],
			})
		);
		expect(childConfig).toEqual({
			name: 'kolibri-admin-bootstrap-exact-target',
			send_metrics: false,
			d1_databases: [],
			account_id: 'synthetic-account',
			compliance_region: 'eu',
		});
	});

	it('renders the shared parameterized statement set without an injectable value', () => {
		const statements = buildAdminBootstrapStatements({
			targetUserId: '33333333-3333-4333-8333-333333333333',
			reason: "approved operator's bootstrap",
			requestId: '44444444-4444-4444-8444-444444444444',
			now: '2026-07-22T00:00:00.000Z',
		});
		statements.push(
			remoteBootstrapVerificationStatement({
				targetUserId: '33333333-3333-4333-8333-333333333333',
				requestId: '44444444-4444-4444-8444-444444444444',
			})
		);
		const sql = renderD1BatchSql(statements);
		expect(sql).not.toContain('?');
		expect(sql).toContain("approved operator''s bootstrap");
		expect(sql).toContain('admin_bootstrap_assertions');
		expect(() =>
			renderD1BatchSql([{ sql: 'SELECT ?', params: ['unsafe\u0000value'] }])
		).toThrow('CLI_REMOTE_SQL_VALUE_INVALID');
	});

	it('accepts only the terminal server-side assertion row', () => {
		const valid = [
			{ success: true, results: [] },
			{
				success: true,
				results: [
					{
						status: 'consumed',
						active_admin_count: 1,
						action_recorded: 1,
						assertion_recorded: 1,
					},
				],
			},
		];
		expect(() => assertRemoteBootstrapResult(valid, 2)).not.toThrow();
		expect(() => assertRemoteBootstrapResult(valid, 3)).toThrow(
			'ADMIN_BOOTSTRAP_REMOTE_RESULT_INVALID'
		);
		expect(() =>
			assertRemoteBootstrapResult([valid[0], { ...valid[1], success: false }], 2)
		).toThrow('ADMIN_BOOTSTRAP_REMOTE_RESULT_INVALID');
		expect(() =>
			assertRemoteBootstrapResult([{ success: true, results: [{ status: 'consumed' }] }], 1)
		).toThrow('ADMIN_BOOTSTRAP_REMOTE_ASSERTION_FAILED');
		expect(() =>
			assertRemoteBootstrapResult(
				[{ ...valid[1], results: [valid[1].results[0], valid[1].results[0]] }],
				1
			)
		).toThrow('ADMIN_BOOTSTRAP_REMOTE_ASSERTION_FAILED');
	});
});

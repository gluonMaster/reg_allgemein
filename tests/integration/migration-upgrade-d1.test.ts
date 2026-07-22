import { applyTestD1Migrations, createMigratedTestD1, listTestD1MigrationIds } from '../helpers/d1';
import { DatabaseBoundary } from '$lib/server/db/database';
import { PrivacyRepository } from '$lib/server/privacy/privacy-repository';

const SYNTHETIC_NOW = '2026-07-22T10:00:00.000Z';

describe('D1 production migration upgrade', () => {
	it('upgrades a populated pre-production schema without losing synthetic records', async () => {
		const availableMigrationIds = await listTestD1MigrationIds();
		const productionMigration = availableMigrationIds.find((migrationId) =>
			migrationId.startsWith('0014_')
		);
		const baselineMigration = productionMigration
			? availableMigrationIds.find((migrationId) => migrationId.startsWith('0013_'))
			: availableMigrationIds.at(-2);

		expect(baselineMigration).toBeDefined();
		if (!baselineMigration)
			throw new Error('A baseline D1 migration is required for upgrade testing.');

		const baselineIndex = availableMigrationIds.indexOf(baselineMigration);
		const expectedUpgradeIds = availableMigrationIds.slice(baselineIndex + 1);
		expect(expectedUpgradeIds.length).toBeGreaterThan(0);

		const context = await createMigratedTestD1({ through: baselineMigration });
		try {
			expect(context.migrationIds.at(-1)).toBe(baselineMigration);

			await context.db.batch([
				context.db
					.prepare(
						`INSERT INTO academic_periods
							(id, code, display_name, starts_on, ends_on, is_current, created_at)
						 VALUES (?, ?, ?, ?, ?, 1, ?)`
					)
					.bind(
						'period-upgrade-synthetic',
						'2026-2027-upgrade',
						'Synthetic upgrade period',
						'2026-08-01',
						'2027-07-31',
						SYNTHETIC_NOW
					),
				context.db
					.prepare(
						`INSERT INTO users (
							id, email, email_normalized, password_hash, email_verified_at,
							role,
							first_name, last_name, first_name_normalized, last_name_normalized,
							privacy_notice_version, privacy_accepted_at, created_at, updated_at
						) VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, ?, ?, ?, ?, ?, ?)`
					)
					.bind(
						'user-upgrade-synthetic',
						'upgrade@example.invalid',
						'upgrade@example.invalid',
						'synthetic-password-hash-not-a-credential',
						SYNTHETIC_NOW,
						'Synthetic',
						'Upgrade',
						'synthetic',
						'upgrade',
						'privacy-v1',
						SYNTHETIC_NOW,
						SYNTHETIC_NOW,
						SYNTHETIC_NOW
					),
				context.db
					.prepare(
						`INSERT INTO audit_events (
							id, actor_user_id, actor_kind, action, target_kind, target_id,
							request_id, safe_diff_json, created_at
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
					)
					.bind(
						'audit-upgrade-synthetic',
						'user-upgrade-synthetic',
						'admin',
						'migration.upgrade_fixture',
						'runtime',
						'production-readiness',
						'request-upgrade-synthetic',
						'{"status":"before-upgrade"}',
						SYNTHETIC_NOW
					),
				context.db
					.prepare(
						`INSERT INTO privacy_requests (
							id, public_reference, subject_user_id, requested_by_user_id, kind,
							status, request_idempotency_key, request_hash_sha256,
							retention_holds_json, safe_summary_json, created_at, updated_at
						) VALUES (?, ?, ?, ?, 'export', 'requested', ?, ?, '[]', '{}', ?, ?)`
					)
					.bind(
						'privacy-request-upgrade-synthetic',
						'PRIV-UPGRADE-SYNTHETIC',
						'user-upgrade-synthetic',
						'user-upgrade-synthetic',
						'privacy-upgrade-synthetic',
						'a'.repeat(64),
						SYNTHETIC_NOW,
						SYNTHETIC_NOW
					),
				context.db
					.prepare(
						`INSERT INTO privacy_r2_cleanup_jobs (
							id, privacy_request_id, subject_user_id, object_kind, private_r2_key,
							source_record_id, status, attempts, created_at, updated_at
						) VALUES (?, ?, ?, 'privacy_export', ?, ?, 'pending', 0, ?, ?)`
					)
					.bind(
						'privacy-cleanup-upgrade-synthetic',
						'privacy-request-upgrade-synthetic',
						'user-upgrade-synthetic',
						'privacy/export/upgrade-synthetic',
						'privacy-artifact-upgrade-synthetic',
						SYNTHETIC_NOW,
						SYNTHETIC_NOW
					),
				context.db
					.prepare(
						`INSERT INTO privacy_r2_cleanup_jobs (
							id, privacy_request_id, subject_user_id, object_kind, private_r2_key,
							source_record_id, status, attempts, created_at, updated_at
						) VALUES (?, ?, ?, 'privacy_export', ?, ?, 'processing', 1, ?, ?)`
					)
					.bind(
						'privacy-cleanup-processing-upgrade-synthetic',
						'privacy-request-upgrade-synthetic',
						'user-upgrade-synthetic',
						'privacy/export/processing-upgrade-synthetic',
						'privacy-artifact-processing-upgrade-synthetic',
						SYNTHETIC_NOW,
						SYNTHETIC_NOW
					),
				context.db
					.prepare(
						`INSERT INTO support_threads (
							id, public_reference, user_id, category, status, subject,
							previous_thread_id, created_at, updated_at, closed_at
						) VALUES (?, ?, ?, 'technical', 'waiting_for_admin', ?, NULL, ?, ?, NULL)`
					)
					.bind(
						'support-thread-upgrade-synthetic',
						'MSG-UPGRADE-SYNTHETIC',
						'user-upgrade-synthetic',
						'Synthetic upgrade subject',
						SYNTHETIC_NOW,
						SYNTHETIC_NOW
					),
				context.db
					.prepare(
						`INSERT INTO support_messages
							(id, thread_id, sender_kind, sender_user_id, body, created_at)
						VALUES (?, ?, 'admin', ?, ?, ?)`
					)
					.bind(
						'support-message-upgrade-synthetic',
						'support-thread-upgrade-synthetic',
						'user-upgrade-synthetic',
						'Synthetic upgrade body',
						SYNTHETIC_NOW
					),
			]);

			const appliedMigrationIds = await applyTestD1Migrations(context.db, {
				after: baselineMigration,
			});
			expect(appliedMigrationIds).toEqual(expectedUpgradeIds);

			const period = await context.db
				.prepare('SELECT code, is_current FROM academic_periods WHERE id = ?')
				.bind('period-upgrade-synthetic')
				.first<{ code: string; is_current: number }>();
			const user = await context.db
				.prepare('SELECT email, role, account_status FROM users WHERE id = ?')
				.bind('user-upgrade-synthetic')
				.first<{ email: string; role: string; account_status: string }>();
			const auditEvent = await context.db
				.prepare('SELECT action, safe_diff_json FROM audit_events WHERE id = ?')
				.bind('audit-upgrade-synthetic')
				.first<{ action: string; safe_diff_json: string }>();

			expect(period).toEqual({ code: '2026-2027-upgrade', is_current: 1 });
			expect(user).toEqual({
				email: 'upgrade@example.invalid',
				role: 'admin',
				account_status: 'active',
			});
			expect(auditEvent).toEqual({
				action: 'migration.upgrade_fixture',
				safe_diff_json: '{"status":"before-upgrade"}',
			});

			const tableRows = await context.db
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
				.all<{ name: string }>();
			const tables = tableRows.results.map(({ name }) => name);

			if (productionMigration) {
				expect(tables).toEqual(
					expect.arrayContaining([
						'scheduled_job_runs',
						'storage_object_intents',
						'admin_bootstrap_control',
						'admin_bootstrap_actions',
						'admin_bootstrap_assertions',
					])
				);
				const cleanupColumns = await context.db
					.prepare('PRAGMA table_info(privacy_r2_cleanup_jobs)')
					.all<{ name: string }>();
				expect(cleanupColumns.results.map(({ name }) => name)).toEqual(
					expect.arrayContaining(['lease_owner', 'lease_until'])
				);
				expect(
					await context.db
						.prepare(
							`SELECT status, attempts, lease_owner, lease_until
							FROM privacy_r2_cleanup_jobs WHERE id = ?`
						)
						.bind('privacy-cleanup-upgrade-synthetic')
						.first()
				).toEqual({ status: 'pending', attempts: 0, lease_owner: null, lease_until: null });
				expect(
					await context.db
						.prepare(
							`SELECT status, attempts, last_error_code, lease_owner, lease_until
							FROM privacy_r2_cleanup_jobs WHERE id = ?`
						)
						.bind('privacy-cleanup-processing-upgrade-synthetic')
						.first()
				).toEqual({
					status: 'failed',
					attempts: 1,
					last_error_code: 'MIGRATION_LEASE_RECOVERY_REQUIRED',
					lease_owner: null,
					lease_until: null,
				});
				const reclaimed = await new PrivacyRepository(
					new DatabaseBoundary(context.db)
				).claimCleanupJobs(
					'privacy-request-upgrade-synthetic',
					'2026-07-22T10:05:00.000Z',
					10,
					'upgrade-recovery-worker',
					60
				);
				expect(reclaimed.map(({ id }) => id).sort()).toEqual([
					'privacy-cleanup-processing-upgrade-synthetic',
					'privacy-cleanup-upgrade-synthetic',
				]);
				expect(
					await context.db
						.prepare(`SELECT body FROM support_messages WHERE id = ?`)
						.bind('support-message-upgrade-synthetic')
						.first()
				).toEqual({ body: 'Synthetic upgrade body' });
				expect(
					await context.db
						.prepare(
							`SELECT control.status, control.consumed_by_user_id,
							audit.action, assertion.assertion_passed
						FROM admin_bootstrap_control control
						JOIN audit_events audit ON audit.id = control.audit_event_id
						JOIN admin_bootstrap_actions action
							ON action.audit_event_id = control.audit_event_id
						JOIN admin_bootstrap_assertions assertion ON assertion.action_id = action.id
						WHERE control.id = 'first-admin'`
						)
						.first()
				).toEqual({
					status: 'consumed',
					consumed_by_user_id: 'user-upgrade-synthetic',
					action: 'auth.first_admin_bootstrap_sealed_on_upgrade',
					assertion_passed: 1,
				});
				await expect(
					context.db
						.prepare(
							`UPDATE support_messages SET body = 'forbidden rewrite' WHERE id = ?`
						)
						.bind('support-message-upgrade-synthetic')
						.run()
				).rejects.toThrow('support message is immutable');
			} else {
				expect(tables).toEqual(
					expect.arrayContaining(['privacy_requests', 'privacy_export_artifacts'])
				);
			}
		} finally {
			await context.dispose();
		}
	});

	it('rejects an unknown migration boundary before creating a test database', async () => {
		await expect(createMigratedTestD1({ through: '9999' })).rejects.toThrow(
			'Unknown D1 migration selector'
		);
	});
});

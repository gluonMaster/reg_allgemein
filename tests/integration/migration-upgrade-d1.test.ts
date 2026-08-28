import { applyTestD1Migrations, createMigratedTestD1, listTestD1MigrationIds } from '../helpers/d1';
import { DatabaseBoundary } from '$lib/server/db/database';
import { PrivacyRepository } from '$lib/server/privacy/privacy-repository';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { ContractRepository } from '$lib/server/contracts/contract-repository';
import { ContractService } from '$lib/server/contracts/contract-service';
import type { ContractArtifactStore } from '$lib/server/contracts/storage';
import { requireAdmin } from '$lib/server/security/authorization';

const SYNTHETIC_NOW = '2026-07-22T10:00:00.000Z';

class MigrationContractStore implements ContractArtifactStore {
	readonly values = new Map<string, Uint8Array>();

	async put(key: string, body: Uint8Array) {
		this.values.set(key, Uint8Array.from(body));
	}

	async putIfAbsent(key: string, body: Uint8Array) {
		if (this.values.has(key)) return false;
		this.values.set(key, Uint8Array.from(body));
		return true;
	}

	async get(key: string) {
		const value = this.values.get(key);
		if (!value) return null;
		const copy = Uint8Array.from(value);
		return { body: copy.buffer, size: copy.byteLength };
	}

	async delete(key: string) {
		this.values.delete(key);
	}
}

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
				context.db
					.prepare(
						`INSERT INTO telegram_outbox
							(id, source_kind, source_id, template_or_category, destination_ref,
							 locale, payload_json, dedupe_key, not_before, status, attempts,
							 max_attempts, created_at, updated_at)
						 VALUES (?, 'fixture', ?, 'bureau.support', 'bureau', 'de', '{}', ?, ?,
							 'pending', 0, 3, ?, ?)`
					)
					.bind(
						'telegram-upgrade-synthetic',
						'telegram-upgrade-source',
						'telegram-upgrade-dedupe',
						SYNTHETIC_NOW,
						SYNTHETIC_NOW,
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
						'worker_error_buckets',
						'legacy_import_release_plans',
						'telegram_delivery_attempts',
						'telegram_delivery_resolutions',
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
				expect(
					await context.db
						.prepare(`SELECT status, dedupe_key FROM telegram_outbox WHERE id = ?`)
						.bind('telegram-upgrade-synthetic')
						.first()
				).toEqual({ status: 'pending', dedupe_key: 'telegram-upgrade-dedupe' });

				const bridgeTriggers = await context.db
					.prepare(
						`SELECT name FROM sqlite_master
						 WHERE type = 'trigger' AND name IN (
							'contract_outbox_to_common_transport',
							'price_review_outbox_to_common_transport'
						 ) ORDER BY name`
					)
					.all<{ name: string }>();
				expect(bridgeTriggers.results.map(({ name }) => name)).toEqual([
					'contract_outbox_to_common_transport',
					'price_review_outbox_to_common_transport',
				]);
				await context.db.batch([
					context.db
						.prepare(
							`INSERT INTO contract_outbox_events
								(id, event_type, source_kind, source_id, payload_json,
								 dedupe_key, status, created_at)
							 VALUES (?, 'offer_declined', 'contract_offer', ?, '{}', ?,
								 'pending', ?)`
						)
						.bind(
							'contract-bridge-upgrade-synthetic',
							'contract-source-upgrade-synthetic',
							'contract-bridge-upgrade-dedupe',
							SYNTHETIC_NOW
						),
					context.db
						.prepare(
							`INSERT INTO price_review_outbox_events
								(id, event_type, source_kind, source_id, recipient_role,
								 recipient_user_id, payload_json, dedupe_key, status, created_at)
							 VALUES (?, 'parent_declined', 'price_review_item', ?, 'admin',
								 NULL, '{}', ?, 'pending', ?)`
						)
						.bind(
							'price-bridge-upgrade-synthetic',
							'price-source-upgrade-synthetic',
							'price-bridge-upgrade-dedupe',
							SYNTHETIC_NOW
						),
				]);
				expect(
					await context.db
						.prepare(
							`SELECT COUNT(*) AS count FROM telegram_outbox
							 WHERE id IN (?, ?)`
						)
						.bind(
							'telegram:contract:contract-bridge-upgrade-synthetic',
							'telegram:price-review:price-bridge-upgrade-synthetic'
						)
						.first()
				).toEqual({ count: 2 });
			} else {
				expect(tables).toEqual(
					expect.arrayContaining(['privacy_requests', 'privacy_export_artifacts'])
				);
			}
		} finally {
			await context.dispose();
		}
	});

	it('fails closed for a release plan populated after 0016 but before hardening', async () => {
		const availableMigrationIds = await listTestD1MigrationIds();
		const releaseControlMigration = availableMigrationIds.find((migrationId) =>
			migrationId.startsWith('0016_')
		);
		const hardeningMigration = availableMigrationIds.find((migrationId) =>
			migrationId.startsWith('0018_')
		);
		expect(releaseControlMigration).toBeDefined();
		expect(hardeningMigration).toBeDefined();
		if (!releaseControlMigration || !hardeningMigration) {
			throw new Error('Release-control and hardening migrations are required.');
		}

		const context = await createMigratedTestD1({ through: releaseControlMigration });
		try {
			const periodId = 'period-release-hardening-upgrade';
			const plusRunId = 'run-plus-release-hardening-upgrade';
			const accessRunId = 'run-access-release-hardening-upgrade';
			const plusVersionId = 'version-plus-release-hardening-upgrade';
			const accessVersionId = 'version-access-release-hardening-upgrade';
			const planId = 'plan-release-hardening-upgrade';
			await context.db.batch([
				context.db
					.prepare(
						`INSERT INTO academic_periods
							(id, code, display_name, starts_on, ends_on, is_current, created_at)
						 VALUES (?, 'release-hardening-upgrade', 'Release hardening upgrade',
							'2026-08-01', '2027-07-31', 0, ?)`
					)
					.bind(periodId, SYNTHETIC_NOW),
				...[
					{
						id: plusRunId,
						kind: 'plusbtext',
						label: 'synthetic-plus-release-hardening-upgrade',
						hash: '1',
					},
					{
						id: accessRunId,
						kind: 'access',
						label: 'synthetic-access-release-hardening-upgrade',
						hash: '2',
					},
				].map(({ id, kind, label, hash }) =>
					context.db
						.prepare(
							`INSERT INTO import_runs (
								id, source_kind, academic_period_id, source_label,
								source_hash_sha256, source_contract_id, source_contract_version,
								structural_fingerprint_sha256, dependency_hashes_json,
								dependency_set_hash_sha256, run_fingerprint, attempt_no, status,
								started_at, validated_at, finished_at, rows_total, rows_staged,
								rows_promoted, rows_skipped, created_at, updated_at
							) VALUES (?, ?, ?, ?, ?, ?, 1, ?, '{}', ?, ?, 1, 'validated',
								?, ?, ?, 9, 9, 0, 0, ?, ?)`
						)
						.bind(
							id,
							kind,
							periodId,
							label,
							hash.repeat(64),
							`synthetic-${kind}`,
							(hash === '1' ? '3' : '4').repeat(64),
							(hash === '1' ? '5' : '6').repeat(64),
							(hash === '1' ? '7' : '8').repeat(64),
							SYNTHETIC_NOW,
							SYNTHETIC_NOW,
							SYNTHETIC_NOW,
							SYNTHETIC_NOW,
							SYNTHETIC_NOW
						)
				),
				context.db
					.prepare(
						`INSERT INTO plusbtext_versions (
							id, academic_period_id, import_run_id, version_hash_sha256,
							fingerprint_algorithm_version, logical_shape_fingerprint_sha256,
							style_fingerprint_sha256, created_at
						) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
					)
					.bind(
						plusVersionId,
						periodId,
						plusRunId,
						'9'.repeat(64),
						'a'.repeat(64),
						'b'.repeat(64),
						SYNTHETIC_NOW
					),
				context.db
					.prepare(
						`INSERT INTO legacy_versions (
							id, academic_period_id, import_run_id, plusbtext_version_id,
							version_hash_sha256, created_at
						) VALUES (?, ?, ?, ?, ?, ?)`
					)
					.bind(
						accessVersionId,
						periodId,
						accessRunId,
						plusVersionId,
						'c'.repeat(64),
						SYNTHETIC_NOW
					),
				context.db
					.prepare(
						`INSERT INTO legacy_import_release_plans (
							id, plan_digest_sha256, staged_digest_sha256, environment,
							target_database_id, git_commit_sha, academic_period_id,
							plusbtext_run_id, access_run_id, plusbtext_version_id,
							access_version_id, safe_summary_json, status, created_at, updated_at
						) VALUES (?, ?, ?, 'preview', ?, ?, ?, ?, ?, ?, ?, '{}', 'staged', ?, ?)`
					)
					.bind(
						planId,
						'd'.repeat(64),
						'e'.repeat(64),
						'11111111-1111-4111-8111-111111111111',
						'f'.repeat(40),
						periodId,
						plusRunId,
						accessRunId,
						plusVersionId,
						accessVersionId,
						SYNTHETIC_NOW,
						SYNTHETIC_NOW
					),
			]);

			const applied = await applyTestD1Migrations(context.db, {
				after: releaseControlMigration,
			});
			expect(applied).toContain(hardeningMigration);
			expect(
				await context.db
					.prepare(
						`SELECT status, planned_by, staged_by, verification_contract_json
						 FROM legacy_import_release_plans WHERE id = ?`
					)
					.bind(planId)
					.first()
			).toEqual({
				status: 'staged',
				planned_by: null,
				staged_by: null,
				verification_contract_json: '{}',
			});
			await expect(
				context.db
					.prepare(
						`UPDATE legacy_import_release_plans
						 SET status = 'reviewed', review_digest_sha256 = ?,
							reviewed_by = 'independent-upgrade-reviewer',
							review_reason_code = 'UPGRADE_REVIEW', reviewed_at = ?, updated_at = ?
						 WHERE id = ?`
					)
					.bind(
						'0'.repeat(64),
						'2026-07-22T10:01:00.000Z',
						'2026-07-22T10:01:00.000Z',
						planId
					)
					.run()
			).rejects.toThrow();
			expect(
				await context.db
					.prepare(
						`SELECT status, review_digest_sha256, reviewed_by, reviewed_at
						 FROM legacy_import_release_plans WHERE id = ?`
					)
					.bind(planId)
					.first()
			).toEqual({
				status: 'staged',
				review_digest_sha256: null,
				reviewed_by: null,
				reviewed_at: null,
			});
		} finally {
			await context.dispose();
		}
	});

	it('preserves a populated contract graph across exact 0023 to 0024 and recreates scope guards', async () => {
		const context = await createMigratedTestD1({ through: '0023' });
		try {
			expect(context.migrationIds.at(-1)).toBe('0023_legacy_projection_lookup_indexes.sql');
			const db = new DatabaseBoundary(context.db);
			const admin = requireAdmin({
				id: 'contract-upgrade-admin',
				role: 'admin',
				emailVerified: true,
				sessionId: 'contract-upgrade-admin-session',
				sessionVersion: 1,
				csrfHash: 'contract-upgrade-admin-csrf',
			});
			await db.batch([
				{
					sql: `INSERT INTO academic_periods
							(id, code, display_name, starts_on, ends_on, is_current, created_at)
						VALUES ('contract-upgrade-period', 'contract-upgrade-2026',
							'Contract upgrade period', '2026-01-01', '2027-12-31', 1, ?)`,
					params: [SYNTHETIC_NOW],
				},
				{
					sql: `INSERT INTO import_runs
							(id, source_kind, academic_period_id, source_label, source_hash_sha256,
							 source_contract_id, source_contract_version, structural_fingerprint_sha256,
							 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
							 attempt_no, retry_of_run_id, status, started_at, validated_at, promoted_at,
							 finished_at, rows_total, rows_staged, rows_promoted, rows_skipped,
							 safe_summary_json, error_code, created_at, updated_at)
						VALUES ('contract-upgrade-run', 'schedule', 'contract-upgrade-period',
							'synthetic-contract-upgrade', ?, 'schedule-json', 1, ?, '{}', ?, ?, 1,
							NULL, 'validated', ?, ?, NULL, NULL, 0, 0, 0, 0, '{}', NULL, ?, ?)`,
					params: [
						'1'.repeat(64),
						'2'.repeat(64),
						'3'.repeat(64),
						'4'.repeat(64),
						SYNTHETIC_NOW,
						SYNTHETIC_NOW,
						SYNTHETIC_NOW,
						SYNTHETIC_NOW,
					],
				},
				{
					sql: `INSERT INTO family_number_allocations
							(id, namespace, sequence_number, display_family_id, legacy_family_id,
							 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
							 created_at, updated_at)
						VALUES ('contract-upgrade-family', 'portal_2', 9876, '2. 9876', NULL,
							'contract-upgrade-parent', 'portal', 'assigned', ?, NULL, ?, ?)`,
					params: [SYNTHETIC_NOW, SYNTHETIC_NOW, SYNTHETIC_NOW],
				},
			]);
			for (const user of [
				[
					'contract-upgrade-parent',
					'contract-upgrade-parent@example.test',
					'parent',
					'contract-upgrade-family',
					'assigned',
					1,
				],
				[
					admin.id,
					'contract-upgrade-admin@example.test',
					'admin',
					null,
					'pending_verification',
					0,
				],
			] as const) {
				await db.run({
					sql: `INSERT INTO users
							(id, email, email_normalized, password_hash, email_verified_at, role,
							 first_name, last_name, first_name_normalized, last_name_normalized,
							 family_number_id, family_assignment_status, family_version,
							 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
						VALUES (?, ?, ?, 'not-used', ?, ?, 'Synthetic', 'Person', 'synthetic',
							'person', ?, ?, ?, 'privacy-v1', ?, ?, ?)`,
					params: [
						user[0],
						user[1],
						user[1],
						SYNTHETIC_NOW,
						user[2],
						user[3],
						user[4],
						user[5],
						SYNTHETIC_NOW,
						SYNTHETIC_NOW,
						SYNTHETIC_NOW,
					],
				});
			}
			await db.batch([
				{
					sql: `INSERT INTO children
							(id, owner_user_id, legacy_family_id, family_number_id, origin,
							 source_child_key, source_full_name, source_full_name_normalized,
							 source_birth_date, full_name_override, birth_date_override, full_name,
							 full_name_normalized, birth_date, last_seen_run_id, is_current,
							 created_at, updated_at)
						VALUES ('contract-upgrade-child', 'contract-upgrade-parent', NULL,
							'contract-upgrade-family', 'portal', 'contract-upgrade-child-source',
							'Synthetic Child', 'synthetic child', '2017-03-04', NULL, NULL,
							'Synthetic Child', 'synthetic child', '2017-03-04',
							'contract-upgrade-run', 1, ?, ?)`,
					params: [SYNTHETIC_NOW, SYNTHETIC_NOW],
				},
				{
					sql: `INSERT INTO course_groups
							(id, academic_period_id, source_offering_key, display_name,
							 normalized_price_key, lesson_kind, subject, capacity_default,
							 capacity_override, requires_admin_approval, catalog_status,
							 last_seen_schedule_version_id, retired_at, created_at, updated_at)
						VALUES ('contract-upgrade-course', 'contract-upgrade-period',
							'contract-upgrade-course-source', 'Synthetic contract course',
							'synthetic-contract-course', 'group', 'Mathematik', 6, NULL, 0,
							'published', NULL, NULL, ?, ?)`,
					params: [SYNTHETIC_NOW, SYNTHETIC_NOW],
				},
			]);

			const store = new MigrationContractStore();
			const config = loadRuntimeConfig({
				APP_ENV: 'test',
				PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
				DB: context.db,
				R2_ARCHIVE: { get() {}, put() {}, delete() {} } as unknown as R2Bucket,
				R2_QUARANTINE: { get() {}, put() {}, delete() {} } as unknown as R2Bucket,
				CONTRACT_SEND_ENABLED: 'true',
				CONTRACT_RENDERER: 'synthetic_test',
			});
			const repository = new ContractRepository(db);
			const service = new ContractService(
				repository,
				store,
				config,
				undefined,
				() => SYNTHETIC_NOW
			);
			await service.installSyntheticTestFixtures(admin);
			const created = await service.createDraft({
				admin,
				requestId: 'contract-upgrade-create',
				payload: {
					userId: 'contract-upgrade-parent',
					childId: 'contract-upgrade-child',
					academicPeriodId: 'contract-upgrade-period',
					templateVersionId: 'contract-template:synthetic:group_yearly:v1',
					renderInput: {
						schemaVersion: 'contract-render-v1',
						templateId: 'group_yearly',
						provider: {
							fullName: 'Synthetic provider',
							addressLines: ['Synthetic address'],
							role: 'provider',
							payerRole: false,
							paymentTermsVersion: 'synthetic-payment-v1',
						},
						parent: {
							fullName: 'Synthetic parent',
							addressLines: ['Synthetic address'],
							role: 'contracting_parent',
							payerRole: true,
						},
						child: {
							fullName: 'Synthetic child',
							addressLines: ['Synthetic address'],
							role: 'child',
							payerRole: false,
							birthDate: '2017-03-04',
						},
						service: {
							relation: 'course',
							courseGroupId: 'contract-upgrade-course',
							requestId: null,
							requestKind: null,
							fundingAuthorizationId: null,
							subject: 'Mathematik',
							scheduleLines: ['Synthetic schedule'],
							effectiveFrom: '2026-08-01',
							effectiveTo: null,
						},
						billing: {
							model: 'monthly_group_fee',
							currency: 'EUR',
							unitMinutes: null,
							priceSource: 'excel_yearly',
							priceMode: 'rule_derived',
							basePriceCents: 4600,
							finalPriceCents: 4600,
							amountSemantics: 'base_price',
							paymentArrangement: 'manual_payment',
							paymentDueDay: 7,
							billingPeriodCode: 'calendar_month',
							lineItems: [
								{
									code: 'base',
									description: 'Synthetic base price',
									amountCents: 4600,
									semantics: 'base_price',
									basis: 'synthetic fixture',
								},
							],
							basePriceDisclaimer: true,
						},
						term: {
							initialTermText: 'Synthetic initial term.',
							renewalText: 'Synthetic renewal.',
							ordinaryTerminationText: 'Synthetic ordinary termination.',
							extraordinaryTerminationText: 'Synthetic extraordinary termination.',
						},
						legal: {
							clauseSetVersion: 'synthetic-clause-v1',
							attachments: ['Synthetic privacy notice'],
							privacyNoticeVersion: 'privacy-v1',
							distanceLegalProfile: 'offline_only',
							distanceLegalBasisHash: null,
							withdrawalTextVersion: 'synthetic-withdrawal-v1',
							earlyPerformanceRequestVersion: null,
							wertersatzNoticeVersion: null,
							mediaClauseVersion: 'synthetic-media-v1',
						},
					},
					expiresAt: '2026-09-05T10:00:00.000Z',
					idempotencyKey: 'contract-upgrade-create',
				},
			});
			await service.renderAndSend({
				admin,
				offerId: created.offerId,
				idempotencyKey: 'contract-upgrade-render',
				requestId: 'contract-upgrade-render',
			});

			const snapshot = async () => ({
				provider: await db.first({
					sql: `SELECT * FROM contract_provider_versions
							WHERE id = 'contract-provider:synthetic-v1'`,
				}),
				media: await db.first({
					sql: `SELECT * FROM media_withdrawal_contact_versions
							WHERE id = 'media-contact:synthetic-v1'`,
				}),
				template: await db.first({
					sql: `SELECT * FROM contract_template_versions
							WHERE id = 'contract-template:synthetic:group_yearly:v1'`,
				}),
				offer: await db.first({
					sql: 'SELECT * FROM contract_offers WHERE id = ?',
					params: [created.offerId],
				}),
				artifacts: (
					await db.all({
						sql: `SELECT * FROM contract_artifacts
								WHERE contract_offer_id = ? ORDER BY artifact_kind`,
						params: [created.offerId],
					})
				).results,
				deliveries: (
					await db.all({
						sql: `SELECT * FROM contract_deliveries
								WHERE contract_offer_id = ? ORDER BY id`,
						params: [created.offerId],
					})
				).results,
			});
			const before = await snapshot();
			expect(before.artifacts).toHaveLength(2);
			expect(before.deliveries).toHaveLength(1);
			expect((await db.all({ sql: 'PRAGMA foreign_key_check' })).results).toEqual([]);

			const applied = await applyTestD1Migrations(context.db, { after: '0023' });
			expect(applied).toEqual(['0024_contract_preview_review.sql']);
			expect(await snapshot()).toEqual(before);
			expect((await db.all({ sql: 'PRAGMA foreign_key_check' })).results).toEqual([]);

			await expect(
				db.run({
					sql: `UPDATE contract_template_versions SET valid_to = '2027-01-01'
							WHERE id = 'contract-template:synthetic:group_yearly:v1'`,
				})
			).rejects.toThrow('approved contract template version is immutable');
			expect((await snapshot()).template).toEqual(before.template);
			await expect(
				db.run({
					sql: 'DELETE FROM contract_artifacts WHERE contract_offer_id = ?',
					params: [created.offerId],
				})
			).rejects.toThrow('contract artifacts are retained evidence');
			expect((await snapshot()).artifacts).toEqual(before.artifacts);

			await db.run({
				sql: `INSERT INTO contract_template_versions
						(id, template_id, template_version, render_schema_version, clause_set_version,
						 provider_version_id, media_contact_version_id, template_bundle_r2_key,
						 bundle_hash, html_source_hash, css_source_hash, asset_manifest_json,
						 font_manifest_json, required_fields_json, renderer_id,
						 renderer_contract_version, worker_compatibility_date, usage_scope,
						 approval_status, approval_basis, distance_legal_profile,
						 distance_legal_basis_version, distance_legal_basis_hash,
						 kuendigung_function_required, early_performance_supported,
						 approved_by, approved_at, valid_from, valid_to, created_at)
					SELECT 'contract-template:upgrade:preview:v1', 'group_monthly',
						'upgrade-preview-v1', render_schema_version, 'upgrade-preview-clauses-v1',
						provider_version_id, media_contact_version_id,
						'contract-templates/upgrade/preview-v1.json', bundle_hash, html_source_hash,
						css_source_hash, asset_manifest_json, font_manifest_json,
						'["previewReviewMarker"]', 'cloudflare-browser-run-pdf-v1',
						renderer_contract_version, worker_compatibility_date, 'preview_review',
						'approved', 'internal_preview_review', 'widerruf_applicable',
						'upgrade-preview-distance-v1', ?, 1, 1, approved_by, approved_at,
						valid_from, valid_to, created_at
					FROM contract_template_versions
					WHERE id = 'contract-template:synthetic:group_yearly:v1'`,
				params: ['a'.repeat(64)],
			});
			expect(
				await db.first({
					sql: `SELECT usage_scope, approval_basis FROM contract_template_versions
							WHERE id = 'contract-template:upgrade:preview:v1'`,
				})
			).toEqual({ usage_scope: 'preview_review', approval_basis: 'internal_preview_review' });

			for (const forbidden of [
				{
					id: 'contract-template:upgrade:forbidden-preview:v1',
					templateId: 'individual_hourly',
					version: 'upgrade-forbidden-preview-v1',
					key: 'contract-templates/upgrade/forbidden-preview-v1.json',
					scope: 'preview_review',
					basis: 'legal_review',
				},
				{
					id: 'contract-template:upgrade:forbidden-production:v1',
					templateId: 'nachhilfe_hourly',
					version: 'upgrade-forbidden-production-v1',
					key: 'contract-templates/upgrade/forbidden-production-v1.json',
					scope: 'production',
					basis: 'internal_preview_review',
				},
			] as const) {
				await expect(
					db.run({
						sql: `INSERT INTO contract_template_versions
								(id, template_id, template_version, render_schema_version,
								 clause_set_version, provider_version_id, media_contact_version_id,
								 template_bundle_r2_key, bundle_hash, html_source_hash, css_source_hash,
								 asset_manifest_json, font_manifest_json, required_fields_json,
								 renderer_id, renderer_contract_version, worker_compatibility_date,
								 usage_scope, approval_status, approval_basis, distance_legal_profile,
								 distance_legal_basis_version, distance_legal_basis_hash,
								 kuendigung_function_required, early_performance_supported,
								 approved_by, approved_at, valid_from, valid_to, created_at)
							SELECT ?, ?, ?, render_schema_version, clause_set_version,
								provider_version_id, media_contact_version_id, ?, bundle_hash,
								html_source_hash, css_source_hash, asset_manifest_json,
								font_manifest_json, required_fields_json,
								'cloudflare-browser-run-pdf-v1', renderer_contract_version,
								worker_compatibility_date, ?, 'approved', ?, 'widerruf_applicable',
								'upgrade-forbidden-distance-v1', ?, 0, 1, approved_by, approved_at,
								valid_from, valid_to, created_at
							FROM contract_template_versions
							WHERE id = 'contract-template:synthetic:group_yearly:v1'`,
						params: [
							forbidden.id,
							forbidden.templateId,
							forbidden.version,
							forbidden.key,
							forbidden.scope,
							forbidden.basis,
							'b'.repeat(64),
						],
					})
				).rejects.toThrow();
			}

			const cloneOffer = async (overrides: Record<string, unknown>) => {
				const columns = (
					await db.all<{ name: string }>({ sql: 'PRAGMA table_info(contract_offers)' })
				).results.map((column) => column.name);
				const params: unknown[] = [];
				const selections = columns.map((column) => {
					if (!Object.hasOwn(overrides, column)) return `"${column}"`;
					params.push(overrides[column]);
					return '?';
				});
				params.push(created.offerId);
				return db.run({
					sql: `INSERT INTO contract_offers (${columns.map((column) => `"${column}"`).join(', ')})
						SELECT ${selections.join(', ')} FROM contract_offers WHERE id = ?`,
					params,
				});
			};
			await cloneOffer({
				id: 'contract-upgrade-preview-offer',
				series_id: 'contract-upgrade-preview-series',
				offer_number: 'OFFER-UPGRADE-PREVIEW',
				contract_number: '2. 9876-2',
				contract_kind: 'group_monthly',
				template_version_id: 'contract-template:upgrade:preview:v1',
				contract_html_r2_key: 'contract-artifacts/upgrade/preview.html',
				contract_pdf_r2_key: 'contract-artifacts/upgrade/preview.pdf',
				render_input_json: '{"templateId":"group_monthly"}',
				source_manifest_json: '{"templateVersion":"upgrade-preview-v1"}',
			});
			expect(
				await db.first({
					sql: `SELECT template_version_id FROM contract_offers
							WHERE id = 'contract-upgrade-preview-offer'`,
				})
			).toEqual({ template_version_id: 'contract-template:upgrade:preview:v1' });
			await expect(
				cloneOffer({
					id: 'contract-upgrade-kind-mismatch-offer',
					series_id: 'contract-upgrade-kind-mismatch-series',
					offer_number: 'OFFER-UPGRADE-MISMATCH',
					contract_number: '2. 9876-3',
					contract_kind: 'group_monthly',
					template_version_id: 'contract-template:synthetic:group_yearly:v1',
					contract_html_r2_key: 'contract-artifacts/upgrade/mismatch.html',
					contract_pdf_r2_key: 'contract-artifacts/upgrade/mismatch.pdf',
				})
			).rejects.toThrow('contract template kind mismatch');
			expect((await db.all({ sql: 'PRAGMA foreign_key_check' })).results).toEqual([]);
		} finally {
			await context.dispose();
		}
	}, 120_000);

	it('rejects an unknown migration boundary before creating a test database', async () => {
		await expect(createMigratedTestD1({ through: '9999' })).rejects.toThrow(
			'Unknown D1 migration selector'
		);
	});
});

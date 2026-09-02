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
			const adminId = 'contract-upgrade-admin';
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
					adminId,
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

			// Seed with the exact pre-0024 schema instead of invoking current runtime
			// code, which intentionally requires the later 0025 generation columns.
			const created = { offerId: 'contract-upgrade-offer' };
			const hashes = {
				payment: '1'.repeat(64),
				media: '2'.repeat(64),
				bundle: '3'.repeat(64),
				html: '4'.repeat(64),
				css: '5'.repeat(64),
				renderInput: '6'.repeat(64),
				source: '7'.repeat(64),
				offer: '8'.repeat(64),
				htmlArtifact: '9'.repeat(64),
				pdfArtifact: 'a'.repeat(64),
			};
			await db.batch([
				{
					sql: `INSERT INTO contract_provider_versions
							(id, version, provider_snapshot_json, payment_terms_version,
							 payment_terms_hash, approval_status, approved_by, approved_at, created_at)
						 VALUES ('contract-provider:synthetic-v1', 'synthetic-provider-v1', '{}',
							 'synthetic-payment-v1', ?, 'approved', ?, ?, ?)`,
					params: [hashes.payment, adminId, SYNTHETIC_NOW, SYNTHETIC_NOW],
				},
				{
					sql: `INSERT INTO media_withdrawal_contact_versions
							(id, version, contact_snapshot_json, snapshot_hash, german_text_version,
							 approval_status, compliance_assessment_status, approved_by, approved_at,
							 created_at)
						 VALUES ('media-contact:synthetic-v1', 'synthetic-media-v1', '{}', ?,
							 'synthetic-media-text-v1', 'approved', 'not_assessed', ?, ?, ?)`,
					params: [hashes.media, adminId, SYNTHETIC_NOW, SYNTHETIC_NOW],
				},
				{
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
						 VALUES ('contract-template:synthetic:group_yearly:v1', 'group_yearly',
							 'synthetic-template-v1', 'contract-render-v1', 'synthetic-clause-v1',
							 'contract-provider:synthetic-v1', 'media-contact:synthetic-v1',
							 'contract-templates/synthetic/group-yearly-v1.json', ?, ?, ?, '{}', '{}',
							 '[]', 'synthetic-test-pdf-v1', 'pdf-adapter-v1', '2026-03-24',
							 'synthetic_test', 'approved', 'synthetic_fixture', 'offline_only',
							 NULL, NULL, 0, 0, ?, ?, '2026-01-01', NULL, ?)`,
					params: [
						hashes.bundle,
						hashes.html,
						hashes.css,
						adminId,
						SYNTHETIC_NOW,
						SYNTHETIC_NOW,
					],
				},
				{
					sql: `INSERT INTO enrollments
							(id, user_id, child_id, course_group_id, legacy_enrollment_id,
							 lesson_kind, status, contract_kind, active_from, active_until,
							 current_price_cents, price_source, price_mode, price_effective_from,
							 manual_override_reason, manual_override_by, manual_override_at,
							 source, created_at, updated_at)
						 VALUES ('contract-upgrade-enrollment', 'contract-upgrade-parent',
							 'contract-upgrade-child', 'contract-upgrade-course', NULL, 'group',
							 'contract_offered', 'group_yearly', '2026-08-01', NULL, 4600,
							 'excel_yearly', 'rule_derived', '2026-08-01', NULL, NULL, NULL,
							 'admin', ?, ?)`,
					params: [SYNTHETIC_NOW, SYNTHETIC_NOW],
				},
				{
					sql: `INSERT INTO contract_offers
							(id, series_id, version, offer_number, contract_number, user_id, child_id,
							 family_number_id_at_issue, family_display_id_at_issue,
							 family_version_at_issue, academic_period_id, course_group_id, enrollment_id,
							 contract_kind, template_version_id, render_schema_version, effective_from,
							 billing_model, currency, price_source, price_mode, base_price_cents,
							 price_cents, amount_semantics, payment_arrangement, payment_due_day,
							 billing_period_code, provider_snapshot_json, party_snapshot_json,
							 service_snapshot_json, schedule_snapshot_json, billing_snapshot_json,
							 line_items_json, term_snapshot_json, termination_snapshot_json,
							 withdrawal_snapshot_json, distance_legal_profile_snapshot_json,
							 clauses_manifest_json, attachments_manifest_json, privacy_notice_version,
							 media_clause_version, render_input_json, render_input_hash,
							 source_manifest_json, source_manifest_hash, contract_html_r2_key,
							 contract_pdf_r2_key, contract_hash, render_status, status, sent_at,
							 expires_at, created_by_admin_user_id, created_at, updated_at)
						 VALUES (?, 'contract-upgrade-series', 1, 'OFFER-UPGRADE-1', '2. 9876-1',
							 'contract-upgrade-parent', 'contract-upgrade-child',
							 'contract-upgrade-family', '2. 9876', 1, 'contract-upgrade-period',
							 'contract-upgrade-course', 'contract-upgrade-enrollment', 'group_yearly',
							 'contract-template:synthetic:group_yearly:v1', 'contract-render-v1',
							 '2026-08-01', 'monthly_group_fee', 'EUR', 'excel_yearly', 'rule_derived',
							 4600, 4600, 'base_price', 'manual_payment', 7, 'calendar_month', '{}',
							 '{}', '{}', '[]', '{}', '[]', '{}', '{}', '{}', '{}', '{}',
							 '[]', 'privacy-v1', 'synthetic-media-v1', '{}', ?, '{}', ?,
							 'contract-artifacts/upgrade/offer.html',
							 'contract-artifacts/upgrade/offer.pdf', ?, 'ready', 'sent', ?,
							 '2026-09-05T10:00:00.000Z', ?, ?, ?)`,
					params: [
						created.offerId,
						hashes.renderInput,
						hashes.source,
						hashes.offer,
						SYNTHETIC_NOW,
						adminId,
						SYNTHETIC_NOW,
						SYNTHETIC_NOW,
					],
				},
				{
					sql: `INSERT INTO contract_artifacts
							(id, contract_offer_id, formation_certificate_id, artifact_kind,
							 private_r2_key, content_type, size_bytes, sha256, source_hash,
							 template_version_id, renderer_id, renderer_contract_version,
							 worker_compatibility_date, created_at)
						 VALUES ('contract-upgrade-html', ?, NULL, 'offer_html',
							 'contract-artifacts/upgrade/offer.html', 'text/html; charset=utf-8',
							 127, ?, ?, 'contract-template:synthetic:group_yearly:v1',
							 'synthetic-test-pdf-v1', 'pdf-adapter-v1', '2026-03-24', ?)`,
					params: [created.offerId, hashes.htmlArtifact, hashes.source, SYNTHETIC_NOW],
				},
				{
					sql: `INSERT INTO contract_artifacts
							(id, contract_offer_id, formation_certificate_id, artifact_kind,
							 private_r2_key, content_type, size_bytes, sha256, source_hash,
							 template_version_id, renderer_id, renderer_contract_version,
							 worker_compatibility_date, created_at)
						 VALUES ('contract-upgrade-pdf', ?, NULL, 'offer_pdf',
							 'contract-artifacts/upgrade/offer.pdf', 'application/pdf', 256, ?, ?,
							 'contract-template:synthetic:group_yearly:v1', 'synthetic-test-pdf-v1',
							 'pdf-adapter-v1', '2026-03-24', ?)`,
					params: [created.offerId, hashes.pdfArtifact, hashes.source, SYNTHETIC_NOW],
				},
				{
					sql: `INSERT INTO contract_deliveries
							(id, contract_offer_id, contract_id, artifact_kind, artifact_hash, channel,
							 recipient_role, recipient_user_id, delivery_status, dedupe_key,
							 delivered_at, access_expires_at, created_at)
						 VALUES ('contract-upgrade-delivery', ?, NULL, 'offer_pdf', ?, 'fake_email',
							 'parent', 'contract-upgrade-parent', 'delivered',
							 'contract-upgrade-delivery', ?, NULL, ?)`,
					params: [created.offerId, hashes.pdfArtifact, SYNTHETIC_NOW, SYNTHETIC_NOW],
				},
			]);

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

			const applied = await applyTestD1Migrations(context.db, {
				after: '0023',
				through: '0024',
			});
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

	it('backfills immutable storage-intent generations across exact 0024 to 0025', async () => {
		const context = await createMigratedTestD1({ through: '0024' });
		try {
			const db = new DatabaseBoundary(context.db);
			const oldRows = [
				{
					id: 'storage-intent:upgrade:staged',
					objectKey: 'contract-templates/upgrade/staged.json',
					status: 'staged',
					deletedAt: null,
				},
				{
					id: 'storage-intent:upgrade:deleted',
					objectKey: 'contract-templates/upgrade/deleted.json',
					status: 'deleted',
					deletedAt: '2026-07-22T10:20:00.000Z',
				},
			] as const;

			for (const row of oldRows) {
				await db.run({
					sql: `INSERT INTO storage_object_intents
							(id, storage_class, object_key, object_kind, source_ref, sha256,
							 size_bytes, status, attempts, lease_owner, lease_until,
							 last_error_code, linked_at, deleted_at, created_at, updated_at)
						 VALUES (?, 'archive', ?, 'contract_template_bundle', ?, ?, 127, ?, 0,
							 NULL, NULL, NULL, NULL, ?, ?, ?)`,
					params: [
						row.id,
						row.objectKey,
						`template-version:${row.id}`,
						'a'.repeat(64),
						row.status,
						row.deletedAt,
						SYNTHETIC_NOW,
						SYNTHETIC_NOW,
					],
				});
			}

			const before = (
				await db.all<{
					id: string;
					object_key: string;
					status: string;
					deleted_at: string | null;
				}>({
					sql: `SELECT id, object_key, status, deleted_at
						 FROM storage_object_intents ORDER BY id`,
				})
			).results;

			const applied = await applyTestD1Migrations(context.db, {
				after: '0024',
				through: '0025',
			});
			expect(applied).toEqual(['0025_contract_storage_intent_generations.sql']);

			const after = (
				await db.all<{
					id: string;
					object_key: string;
					status: string;
					deleted_at: string | null;
					intent_family_id: string;
					generation: number;
					installer_owner: string | null;
					installer_lease_until: string | null;
				}>({
					sql: `SELECT id, object_key, status, deleted_at, intent_family_id, generation,
							installer_owner, installer_lease_until
						 FROM storage_object_intents ORDER BY id`,
				})
			).results;
			expect(
				after.map(
					({
						intent_family_id,
						generation,
						installer_owner,
						installer_lease_until,
						...row
					}) => row
				)
			).toEqual(before);
			expect(after).toEqual(
				expect.arrayContaining(
					oldRows.map((row) =>
						expect.objectContaining({
							id: row.id,
							intent_family_id: row.id,
							generation: 1,
							installer_owner: null,
							installer_lease_until: null,
						})
					)
				)
			);
			expect(
				(
					await db.all<{
						intent_id: string;
						intent_family_id: string;
						generation: number;
						object_key: string;
					}>({
						sql: `SELECT intent_id, intent_family_id, generation, object_key
							 FROM storage_intent_generations ORDER BY intent_id`,
					})
				).results
			).toEqual(
				oldRows
					.map((row) => ({
						intent_id: row.id,
						intent_family_id: row.id,
						generation: 1,
						object_key: row.objectKey,
					}))
					.sort((left, right) => left.intent_id.localeCompare(right.intent_id))
			);

			await expect(
				db.run({
					sql: `UPDATE storage_object_intents SET object_key = ? WHERE id = ?`,
					params: ['contract-templates/upgrade/replaced.json', oldRows[0].id],
				})
			).rejects.toThrow('storage intent generation is immutable');
			await expect(
				db.run({
					sql: `UPDATE storage_object_intents SET intent_family_id = NULL WHERE id = ?`,
					params: [oldRows[0].id],
				})
			).rejects.toThrow('storage intent generation is immutable');
			await expect(
				db.run({
					sql: `INSERT INTO storage_object_intents
							(id, storage_class, object_key, object_kind, source_ref, sha256,
							 size_bytes, status, attempts, created_at, updated_at)
						 VALUES (?, 'archive', ?, 'contract_template_bundle', ?, ?, 127,
							 'staged', 0, ?, ?)`,
					params: [
						'storage-intent:upgrade:missing-lineage',
						'contract-templates/upgrade/missing-lineage.json',
						'template-version:missing-lineage',
						'b'.repeat(64),
						SYNTHETIC_NOW,
						SYNTHETIC_NOW,
					],
				})
			).rejects.toThrow('storage intent lineage is required');

			await db.run({
				sql: `INSERT INTO storage_object_intents
						(id, storage_class, object_key, object_kind, source_ref, sha256,
						 size_bytes, status, attempts, created_at, updated_at,
						 intent_family_id, generation, installer_owner, installer_lease_until)
					 VALUES (?, 'archive', ?, 'contract_template_bundle', ?, ?, 127,
						 'staged', 0, ?, ?, ?, 2, ?, ?)`,
				params: [
					'storage-intent:upgrade:staged:generation:2',
					'contract-templates/upgrade/staged.generation-2.json',
					'template-version:storage-intent:upgrade:staged',
					'a'.repeat(64),
					SYNTHETIC_NOW,
					SYNTHETIC_NOW,
					oldRows[0].id,
					'installer:upgrade',
					'2026-07-22T10:05:00.000Z',
				],
			});
			expect(
				await db.first({
					sql: `SELECT intent_family_id, generation, object_key, installer_owner
						 FROM storage_intent_generations WHERE intent_id = ?`,
					params: ['storage-intent:upgrade:staged:generation:2'],
				})
			).toEqual({
				intent_family_id: oldRows[0].id,
				generation: 2,
				object_key: 'contract-templates/upgrade/staged.generation-2.json',
				installer_owner: 'installer:upgrade',
			});
			await expect(
				db.run({
					sql: `UPDATE storage_intent_generations SET object_key = ? WHERE intent_id = ?`,
					params: [
						'contract-templates/upgrade/staged.changed.json',
						'storage-intent:upgrade:staged:generation:2',
					],
				})
			).rejects.toThrow('storage intent generations are append-only');
			expect((await db.all({ sql: 'PRAGMA foreign_key_check' })).results).toEqual([]);
		} finally {
			await context.dispose();
		}
	}, 120_000);

	it('preserves retained operations history across exact 0025 to 0026', async () => {
		const context = await createMigratedTestD1({ through: '0025' });
		try {
			const db = new DatabaseBoundary(context.db);
			await db.batch([
				{
					sql: `INSERT INTO scheduled_job_runs
						(id, job_name, trigger_kind, dedupe_key, status, lease_owner,
						 fencing_token, safe_result_json, error_code, started_at,
						 finished_at, created_at, updated_at)
					VALUES ('upgrade-run', 'email_outbox', 'scheduled', 'upgrade-bucket',
						'succeeded', NULL, NULL, '{"sent":0}', NULL, ?, ?, ?, ?)`,
					params: [SYNTHETIC_NOW, SYNTHETIC_NOW, SYNTHETIC_NOW, SYNTHETIC_NOW],
				},
				{
					sql: `INSERT INTO operation_locks
						(id, scope, resource_key, lease_owner, lease_until, fencing_token,
						 created_at, updated_at)
					VALUES ('upgrade-lock', 'scheduled-job', 'email_outbox', 'old-owner',
						'2026-07-22T10:05:00.000Z', 7, ?, ?)`,
					params: [SYNTHETIC_NOW, SYNTHETIC_NOW],
				},
			]);

			const applied = await applyTestD1Migrations(context.db, {
				after: '0025',
				through: '0026',
			});
			expect(applied).toEqual(['0026_background_d1_cost_controls.sql']);
			expect(
				await db.first({
					sql: `SELECT job_name, status, safe_result_json FROM scheduled_job_runs
					WHERE id = 'upgrade-run'`,
				})
			).toEqual({
				job_name: 'email_outbox',
				status: 'succeeded',
				safe_result_json: '{"sent":0}',
			});
			expect(
				await db.first({
					sql: `SELECT lease_owner, lease_until, fencing_token FROM operation_locks
					WHERE id = 'upgrade-lock'`,
				})
			).toEqual({
				lease_owner: 'old-owner',
				lease_until: '2026-07-22T10:05:00.000Z',
				fencing_token: 7,
			});
			expect(
				(
					await db.all({
						sql: `SELECT cadence, status FROM scheduled_cadence_state ORDER BY cadence`,
					})
				).results
			).toEqual([
				{ cadence: 'fast', status: 'idle' },
				{ cadence: 'maintenance', status: 'idle' },
			]);

			const indexes = (
				await db.all<{ name: string }>({
					sql: `SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name`,
				})
			).results.map((row) => row.name);
			expect(indexes).not.toContain('operation_locks_expiry');
			expect(indexes).not.toContain('worker_error_buckets_retention');
			expect(indexes).toEqual(
				expect.arrayContaining([
					'scheduled_job_runs_manual_recent',
					'users_pending_email_expiry',
					'contract_parent_actions_ip_expiry',
					'contract_acceptances_ip_expiry',
					'price_review_parent_actions_ip_expiry',
					'price_change_acceptances_ip_expiry',
					'enrollments_reconciler_updated',
					'enrollments_reconciler_active_from',
					'enrollments_reconciler_active_until',
				])
			);

			const queryPlan = async (sql: string) =>
				(await db.all<{ detail: string }>({ sql: `EXPLAIN QUERY PLAN ${sql}` })).results
					.map((row) => row.detail)
					.join('\n');
			expect(
				await queryPlan(`SELECT id FROM scheduled_job_runs
				WHERE trigger_kind = 'manual'
				ORDER BY started_at DESC, id DESC LIMIT 50`)
			).toContain('scheduled_job_runs_manual_recent');
			expect(
				await queryPlan(`SELECT id FROM users
				WHERE pending_email_expires_at IS NOT NULL AND pending_email_expires_at <= '2030-01-01'
				ORDER BY pending_email_expires_at, id LIMIT 50`)
			).toContain('users_pending_email_expiry');
			for (const [table, index] of [
				['contract_parent_actions', 'contract_parent_actions_ip_expiry'],
				['contract_acceptances', 'contract_acceptances_ip_expiry'],
				['price_review_parent_actions', 'price_review_parent_actions_ip_expiry'],
				['price_change_acceptances', 'price_change_acceptances_ip_expiry'],
			] as const) {
				expect(
					await queryPlan(`SELECT id FROM ${table}
					WHERE ip_retention_value IS NOT NULL AND ip_expires_at <= '2030-01-01'
					ORDER BY ip_expires_at, id LIMIT 50`)
				).toContain(index);
			}
			expect(
				await queryPlan(`SELECT id FROM enrollments
				WHERE status = 'active' AND updated_at >= '2030-01-01'
				ORDER BY updated_at, id LIMIT 50`)
			).toContain('enrollments_reconciler_updated');
			expect(
				await queryPlan(`SELECT id FROM enrollments
				WHERE status = 'active' AND active_from >= '2030-01-01'
				ORDER BY active_from, id LIMIT 50`)
			).toContain('enrollments_reconciler_active_from');
			expect(
				await queryPlan(`SELECT id FROM enrollments
				WHERE status = 'active' AND active_until IS NOT NULL
					AND active_until >= '2030-01-01'
				ORDER BY active_until, id LIMIT 50`)
			).toContain('enrollments_reconciler_active_until');
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

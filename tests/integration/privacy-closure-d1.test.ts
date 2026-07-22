import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import { DatabaseBoundary } from '$lib/server/db/database';
import { PrivacyRepository } from '$lib/server/privacy/privacy-repository';
import { PrivacyService } from '$lib/server/privacy/privacy-service';
import type { PrivacyArtifactStore } from '$lib/server/privacy/storage';
import { OutboxRepository } from '$lib/server/outbox/outbox-repository';
import { requireAdmin } from '$lib/server/security/authorization';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const now = '2026-07-22T10:00:00.000Z';
const hash = (character: string) => character.repeat(64);
const parentA: AuthenticatedUser = { id: 'privacy-parent-a', role: 'parent',
	emailVerified: true, sessionId: 'privacy-session-a', sessionVersion: 1, csrfHash: 'csrf-a' };
const parentB: AuthenticatedUser = { id: 'privacy-parent-b', role: 'parent',
	emailVerified: true, sessionId: 'privacy-session-b', sessionVersion: 1, csrfHash: 'csrf-b' };
const admin = requireAdmin({ id: 'privacy-admin', role: 'admin', emailVerified: true,
	sessionId: 'privacy-admin-session', sessionVersion: 1, csrfHash: 'csrf-admin' });

class MemoryStore implements PrivacyArtifactStore {
	readonly values = new Map<string, Uint8Array>();
	async put(key: string, body: Uint8Array) { this.values.set(key, Uint8Array.from(body)); }
	async get(key: string) {
		const value = this.values.get(key);
		return value ? { body: Uint8Array.from(value).buffer, size: value.byteLength } : null;
	}
	async delete(key: string) { this.values.delete(key); }
}

async function seed(db: DatabaseBoundary) {
	await db.batch([
		{ sql: `INSERT INTO academic_periods
			(id, code, display_name, starts_on, ends_on, is_current, created_at)
			VALUES ('privacy-period', 'privacy-2026', 'Privacy 2026', '2026-01-01',
				'2027-12-31', 1, ?)`, params: [now] },
		{ sql: `INSERT INTO import_runs
			(id, source_kind, academic_period_id, source_label, source_hash_sha256,
			 source_contract_id, source_contract_version, structural_fingerprint_sha256,
			 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
			 attempt_no, retry_of_run_id, status, started_at, validated_at, promoted_at,
			 finished_at, rows_total, rows_staged, rows_promoted, rows_skipped,
			 safe_summary_json, error_code, created_at, updated_at)
			VALUES ('privacy-run', 'schedule', 'privacy-period', 'synthetic', ?,
				'schedule-json', 1, ?, '{}', ?, ?, 1, NULL, 'validated', ?, ?, NULL,
				NULL, 0, 0, 0, 0, '{}', NULL, ?, ?)`,
			params: [hash('1'), hash('2'), hash('3'), hash('4'), now, now, now, now] },
		...[
			['privacy-family-a', 9301, '2. 9301', parentA.id],
			['privacy-family-b', 9302, '2. 9302', parentB.id],
		].map(([id, sequence, display, owner]) => ({
			sql: `INSERT INTO family_number_allocations
				(id, namespace, sequence_number, display_family_id, legacy_family_id,
				 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
				 created_at, updated_at)
				VALUES (?, 'portal_2', ?, ?, NULL, ?, 'portal', 'assigned', ?, NULL, ?, ?)`,
			params: [id, sequence, display, owner, now, now, now],
		})),
	]);
	for (const user of [
		[parentA.id, 'alice.privacy@example.test', 'Alice', 'A', 'privacy-family-a', 'assigned', 1],
		[parentB.id, 'bob.privacy@example.test', 'Bob', 'B', 'privacy-family-b', 'assigned', 1],
		[admin.id, 'admin.privacy@example.test', 'Admin', 'Privacy', null, 'pending_verification', 0],
	] as const) {
		await db.run({ sql: `INSERT INTO users
			(id, email, email_normalized, password_hash, email_verified_at, role,
			 first_name, last_name, first_name_normalized, last_name_normalized,
			 family_number_id, family_assignment_status, family_version,
			 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
			VALUES (?, ?, ?, 'not-used', ?, ?, ?, ?, lower(?), lower(?), ?, ?, ?,
				'privacy-v1', ?, ?, ?)`,
			params: [user[0], user[1], user[1], now, user[0] === admin.id ? 'admin' : 'parent',
				user[2], user[3], user[2], user[3], user[4], user[5], user[6], now, now, now] });
	}
	for (const child of [
		['privacy-child-a', parentA.id, 'privacy-family-a', 'Alice Kind'],
		['privacy-child-b', parentB.id, 'privacy-family-b', 'Bob Kind'],
	] as const) {
		await db.run({ sql: `INSERT INTO children
			(id, owner_user_id, legacy_family_id, family_number_id, origin,
			 source_child_key, source_full_name, source_full_name_normalized,
			 source_birth_date, full_name_override, birth_date_override, full_name,
			 full_name_normalized, birth_date, last_seen_run_id, is_current,
			 created_at, updated_at)
			VALUES (?, ?, NULL, ?, 'portal', ?, ?, lower(?), '2017-03-04', NULL,
				NULL, ?, lower(?), '2017-03-04', 'privacy-run', 1, ?, ?)`,
			params: [child[0], child[1], child[2], `source-${child[0]}`, child[3], child[3],
				child[3], child[3], now, now] });
	}
	await db.batch([
		{ sql: `INSERT INTO privacy_acknowledgements
			(id, user_id, privacy_notice_version, acknowledged_at, evidence_hash,
			 source_context, created_at) VALUES ('privacy-ack-a', ?, 'privacy-v1', ?, ?,
			 'registration', ?)`, params: [parentA.id, now, hash('a'), now] },
		{ sql: `INSERT INTO privacy_acknowledgements
			(id, user_id, privacy_notice_version, acknowledged_at, evidence_hash,
			 source_context, created_at) VALUES ('privacy-ack-b', ?, 'privacy-v1', ?, ?,
			 'registration', ?)`, params: [parentB.id, now, hash('b'), now] },
		{ sql: `INSERT INTO media_withdrawal_contact_versions
			(id, version, contact_snapshot_json, snapshot_hash, german_text_version,
			 approval_status, compliance_assessment_status, approved_by, approved_at, created_at)
			VALUES ('privacy-media-contact', 'privacy-media-v1', '{}', ?, 'privacy-media-de-v1',
			 'approved', 'passed', ?, ?, ?)`, params: [hash('c'), admin.id, now, now] },
		{ sql: `INSERT INTO media_consents
			(id, user_id, child_id, capture_scopes_json, publication_channels_json,
			 text_version, withdrawal_contact_version_id, withdrawal_contact_snapshot_hash,
			 decision, decision_source, decided_at, received_at, effective_from,
			 recorded_by_user_id, recorded_at, evidence_hash, request_dedupe_key,
			 source_contract_offer_id, source_privacy_request_id, supersedes_consent_id, created_at)
			VALUES ('privacy-grant-a', ?, 'privacy-child-a', '["photo"]', '["website"]',
			 'privacy-media-text-v1', 'privacy-media-contact', ?, 'granted', 'portal',
			 ?, ?, ?, ?, ?, ?, 'privacy-grant-a', NULL, NULL, NULL, ?)`,
			params: [parentA.id, hash('c'), now, now, now, parentA.id, now, hash('d'), now] },
		{ sql: `INSERT INTO retention_controls
			(id, target_kind, target_id, retention_class, legal_basis,
			 retention_started_on, retain_until, legal_hold, hold_reason,
			 hold_set_by, hold_set_at, hold_review_on, purge_status, policy_version,
			 purged_or_anonymized_at, created_at, updated_at)
			VALUES ('privacy-held-media', 'media_consent', 'privacy-grant-a',
				'media_consent_evidence', 'privacy_accountability', ?, NULL, 1,
				'Pending documented retention review.', ?, ?, '2026-10-01',
				'disabled_by_policy', 'privacy-test-v1', NULL, ?, ?)`,
			params: [now, admin.id, now, now, now] },
		{ sql: `INSERT INTO individual_requests
			(id, user_id, child_id, request_kind, funding_kind, subjects_raw, description,
			 preferred_days_json, preferred_time_windows_json, preferred_format,
			 preferred_locations_json, unit_rate_cents, parent_payable, status, version,
			 create_idempotency_key, create_request_hash_sha256, admin_decision,
			 admin_notes, reviewed_by, reviewed_at, created_at, updated_at)
			VALUES ('privacy-request-a', ?, 'privacy-child-a', 'nachhilfe', 'jobcenter',
				'Mathematik', '', '[]', '[]', 'onsite', '[]', 0, 0, 'draft', 1,
				'privacy-request-a', ?, NULL, NULL, NULL, NULL, ?, ?)`,
			params: [parentA.id, hash('6'), now, now] },
		{ sql: `INSERT INTO funding_authorizations
			(id, request_id, user_id, child_id, version, kind, status, valid_from,
			 valid_until, supersedes_authorization_id, decision_notes, reviewed_by,
			 reviewed_at, created_at, updated_at)
			VALUES ('privacy-authorization-a', 'privacy-request-a', ?, 'privacy-child-a',
				1, 'jobcenter', 'pending_review', NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
			params: [parentA.id, now, now] },
		{ sql: `INSERT INTO authorization_documents
			(id, authorization_id, user_id, child_id, quarantine_r2_key, archive_r2_key,
			 original_extension, mime_type, detected_type, size_bytes, sha256, review_status,
			 quarantine_reason, scan_method, scanner_label, scanner_version, signature_version,
			 quarantine_downloaded_by_admin_user_id, quarantine_downloaded_sha256,
			 quarantine_downloaded_at, download_audit_event_id, scan_attested_by_admin_user_id,
			 scan_attestation_text_version, scanned_at, scan_attempts, business_review_reason,
			 released_by, released_at, upload_idempotency_key, upload_request_hash_sha256,
			 uploaded_at, quarantine_expires_at, quarantine_delete_state,
			 quarantine_purged_at, quarantine_cleanup_audit_event_id, deleted_at,
			 replaced_by_document_id, created_at, updated_at)
			VALUES ('privacy-document-a', 'privacy-authorization-a', ?, 'privacy-child-a',
				'privacy-quarantine-a', NULL, 'pdf', 'application/pdf', 'pdf', 4, ?,
				'quarantined', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
				NULL, NULL, NULL, 0, NULL, NULL, NULL, 'privacy-document-a', ?, ?,
				'2026-08-05T10:00:00.000Z', 'present', NULL, NULL, NULL, NULL, ?, ?)`,
			params: [parentA.id, hash('7'), hash('8'), now, now, now] },
		{ sql: `INSERT INTO auth_sessions
			(id, user_id, jti_hash, csrf_hash, session_version, expires_at, revoked_at,
			 revocation_reason, created_at, last_seen_at)
			VALUES ('privacy-db-session-a', ?, ?, ?, 1, '2026-08-01T00:00:00.000Z',
			 NULL, NULL, ?, ?)`, params: [parentA.id, hash('e'), hash('f'), now, now] },
		{ sql: `INSERT INTO support_threads
			(id, public_reference, user_id, category, status, subject, previous_thread_id,
			 created_at, updated_at, closed_at)
			VALUES ('privacy-thread-a', 'MSG-PRIV-A', ?, 'technical', 'waiting_for_admin',
			 'Alice private subject', NULL, ?, ?, NULL)`, params: [parentA.id, now, now] },
		{ sql: `INSERT INTO support_messages
			(id, thread_id, sender_kind, sender_user_id, body, created_at)
			VALUES ('privacy-message-a', 'privacy-thread-a', 'parent', ?,
			 'Alice private message', ?)`, params: [parentA.id, now] },
		{ sql: `INSERT INTO support_threads
			(id, public_reference, user_id, category, status, subject, previous_thread_id,
			 created_at, updated_at, closed_at)
			VALUES ('privacy-thread-b', 'MSG-PRIV-B', ?, 'technical', 'waiting_for_admin',
			 'Bob private subject', NULL, ?, ?, NULL)`, params: [parentB.id, now, now] },
		{ sql: `INSERT INTO support_messages
			(id, thread_id, sender_kind, sender_user_id, body, created_at)
			VALUES ('privacy-message-b', 'privacy-thread-b', 'parent', ?,
			 'Bob private message', ?)`, params: [parentB.id, now] },
	]);
}

describe('stage 12 privacy export and account closure', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;
	let repository: PrivacyRepository;
	let service: PrivacyService;
	let store: MemoryStore;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		await seed(db);
		repository = new PrivacyRepository(db);
		store = new MemoryStore();
		service = new PrivacyService(repository, store, { exportTtlSeconds: 3600 }, () => now);
	});

	afterEach(async () => context.dispose());

	it('creates one private expiring subject export without another family or security metadata', async () => {
		const result = await service.generateExport({ actor: parentA,
			idempotencyKey: 'privacy-export-a-0001', requestId: 'privacy-export-a' });
		expect(result.ready).toBe(true);
		expect(await service.generateExport({ actor: parentA,
			idempotencyKey: 'privacy-export-a-0001', requestId: 'privacy-export-a-replay' }))
			.toMatchObject({ artifactId: result.artifactId, replayed: true });
		expect(store.values.size).toBe(1);
		const download = await service.downloadExport({ actor: parentA,
			artifactId: result.artifactId!, requestId: 'privacy-download-a' });
		await service.downloadExport({ actor: parentA,
			artifactId: result.artifactId!, requestId: 'privacy-download-a' });
		const body = new TextDecoder().decode(download.body);
		expect(body).toContain('alice.privacy@example.test');
		expect(body).toContain('Alice private message');
		expect(body).not.toContain('bob.privacy@example.test');
		expect(body).not.toContain('Bob private message');
		expect(body).not.toContain('password_hash');
		expect(body).not.toContain('jti_hash');
		await expect(service.downloadExport({ actor: parentB,
			artifactId: result.artifactId!, requestId: 'privacy-cross-download' }))
			.rejects.toMatchObject({ code: 'PRIVACY_EXPORT_NOT_FOUND' });
		expect(await db.first<{ expires_at: string; status: string }>({
			sql: `SELECT expires_at, status FROM privacy_export_artifacts WHERE id = ?`,
			params: [result.artifactId],
		})).toEqual({ expires_at: '2026-07-22T11:00:00.000Z', status: 'ready' });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM audit_events
			WHERE action = 'privacy.export.downloaded' AND target_id = ?`,
			params: [result.artifactId],
		})).toEqual({ count: 1 });
		const expiredService = new PrivacyService(repository, store,
			{ exportTtlSeconds: 3600 }, () => '2026-07-22T11:00:01.000Z');
		await expect(expiredService.downloadExport({ actor: parentA,
			artifactId: result.artifactId!, requestId: 'privacy-expired-download' }))
			.rejects.toMatchObject({ code: 'PRIVACY_EXPORT_NOT_FOUND' });
		expect(await expiredService.cleanupExpiredExports()).toEqual({
			claimed: 1, completed: 1, failed: 0,
		});
		expect(store.values.size).toBe(0);
	});

	it('revalidates current authorization when a download audit is replayed', async () => {
		const generated = await service.generateExport({
			actor: parentA,
			idempotencyKey: 'privacy-export-download-race',
			requestId: 'privacy-export-download-race',
		});
		await service.downloadExport({
			actor: parentA,
			artifactId: generated.artifactId!,
			requestId: 'privacy-download-reused-request',
		});
		await db.run({
			sql: `UPDATE users SET is_blocked = 1, updated_at = ? WHERE id = ?`,
			params: [now, parentA.id],
		});

		await expect(repository.auditExportDownload({
			actor: parentA,
			artifactId: generated.artifactId!,
			requestId: 'privacy-download-reused-request',
			now,
		})).rejects.toMatchObject({ code: 'PRIVACY_EXPORT_NOT_FOUND' });
	});

	it('does not report cleanup completion when the linked D1 record cannot be finalized', async () => {
		const generated = await service.generateExport({ actor: parentA,
			idempotencyKey: 'privacy-export-cleanup-guard', requestId: 'privacy-export-cleanup-guard' });
		const expiredAt = '2026-07-22T11:00:01.000Z';
		await repository.queueExpiredExports(expiredAt, 10);
		await db.run({
			sql: `UPDATE privacy_r2_cleanup_jobs SET source_record_id = 'missing-artifact'
				WHERE private_r2_key = (SELECT private_r2_key FROM privacy_export_artifacts WHERE id = ?)`,
			params: [generated.artifactId],
		});
		const expiredService = new PrivacyService(repository, store,
			{ exportTtlSeconds: 3600 }, () => expiredAt);

		expect(await expiredService.runCleanup({ privacyRequestId: null, limit: 10 })).toEqual({
			claimed: 1, completed: 0, failed: 1,
		});
		expect(await db.first<{ status: string }>({
			sql: `SELECT status FROM privacy_export_artifacts WHERE id = ?`,
			params: [generated.artifactId],
		})).toEqual({ status: 'delete_pending' });
		expect(await db.first<{ status: string; last_error_code: string }>({
			sql: `SELECT status, last_error_code FROM privacy_r2_cleanup_jobs
				WHERE source_record_id = 'missing-artifact'`,
		})).toEqual({ status: 'failed', last_error_code: 'D1_FINALIZE_FAILED' });
	});

	it('lets only the current cleanup lease complete and emits one deterministic audit event', async () => {
		await service.generateExport({ actor: parentA,
			idempotencyKey: 'privacy-export-cleanup-race', requestId: 'privacy-export-cleanup-race' });
		const firstNow = '2026-07-22T11:00:01.000Z';
		await repository.queueExpiredExports(firstNow, 10);
		const first = await repository.claimCleanupJobs(null, firstNow, 10, 'worker-a', 300);
		expect(first).toHaveLength(1);
		const secondNow = '2026-07-22T11:05:02.000Z';
		const second = await repository.claimCleanupJobs(null, secondNow, 10, 'worker-b', 300);
		expect(second).toEqual(first);

		expect(await repository.completeCleanupJob({
			jobId: second[0].id, leaseOwner: 'worker-b', objectKind: second[0].object_kind,
			sourceRecordId: second[0].source_record_id, now: secondNow,
		})).toBe(true);
		expect(await repository.completeCleanupJob({
			jobId: first[0].id, leaseOwner: 'worker-a', objectKind: first[0].object_kind,
			sourceRecordId: first[0].source_record_id, now: secondNow,
		})).toBe(false);
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM audit_events
				WHERE action = 'privacy.r2_cleanup.completed'
					AND target_id = ?`,
			params: [first[0].id],
		})).toEqual({ count: 1 });
	});

	it('blocks the whole closure with an active service and creates no media revoke', async () => {
		await db.batch([
			{ sql: `INSERT INTO course_groups
				(id, academic_period_id, source_offering_key, display_name, normalized_price_key,
				 lesson_kind, subject, capacity_default, capacity_override,
				 requires_admin_approval, catalog_status, last_seen_schedule_version_id,
				 retired_at, created_at, updated_at)
				VALUES ('privacy-course', 'privacy-period', 'privacy-course', 'Privacy Course',
				 'privacy', 'group', 'Privacy', 6, NULL, 0, 'published', NULL, NULL, ?, ?)`,
				params: [now, now] },
			{ sql: `INSERT INTO enrollments
				(id, user_id, child_id, course_group_id, legacy_enrollment_id, lesson_kind,
				 status, contract_kind, active_from, active_until, current_price_cents,
				 price_source, price_mode, price_effective_from, manual_override_reason,
				 manual_override_by, manual_override_at, source, created_at, updated_at)
				VALUES ('privacy-active-enrollment', ?, 'privacy-child-a', 'privacy-course', NULL,
				 'group', 'active', 'group_yearly', '2026-01-01', NULL, 4600,
				 'excel_yearly', 'rule_derived', '2026-01-01', NULL, NULL, NULL,
				 'portal', ?, ?)`, params: [parentA.id, now, now] },
		]);
		const blocked = await service.requestDeletion({ actor: parentA,
			idempotencyKey: 'privacy-delete-blocked-0001', requestId: 'privacy-delete-blocked' });
		expect(blocked.status).toBe('blocked_by_active_contract');
		expect(await service.requestDeletion({ actor: parentA,
			idempotencyKey: 'privacy-delete-blocked-0001', requestId: 'privacy-delete-replay' }))
			.toMatchObject({ requestId: blocked.requestId, replayed: true });
		expect(await db.first<{ account_status: string }>({
			sql: `SELECT account_status FROM users WHERE id = ?`, params: [parentA.id],
		})).toEqual({ account_status: 'active' });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM media_consents
			WHERE decision_source = 'account_deletion'`,
		})).toEqual({ count: 0 });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM privacy_r2_cleanup_jobs
			WHERE privacy_request_id = ?`, params: [blocked.requestId],
		})).toEqual({ count: 0 });
	});

	it('fails closed for a claimed current legacy service that is not an occupancy row', async () => {
		await db.batch([
			{
				sql: `INSERT INTO legacy_families
					(id, source_namespace, source_family_id, family_number_id, numbering_status,
					 claimed_by_user_id, claimed_at, continuity_status, created_at, updated_at)
				VALUES ('privacy-legacy-family-a', 'legacy_1', 'privacy-legacy-a',
					'privacy-family-a', 'valid', ?, ?, 'stable', ?, ?)`,
				params: [parentA.id, now, now, now],
			},
			{
				sql: `INSERT INTO children
					(id, owner_user_id, legacy_family_id, family_number_id, origin,
					 source_child_key, source_full_name, source_full_name_normalized,
					 source_birth_date, full_name_override, birth_date_override, full_name,
					 full_name_normalized, birth_date, last_seen_run_id, is_current,
					 created_at, updated_at)
				VALUES ('privacy-legacy-child-a', ?, 'privacy-legacy-family-a',
					'privacy-family-a', 'legacy', 'privacy-legacy-child-a', 'Legacy Kind',
					'legacy kind', '2016-01-02', NULL, NULL, 'Legacy Kind', 'legacy kind',
					'2016-01-02', 'privacy-run', 1, ?, ?)`,
				params: [parentA.id, now, now],
			},
			{
				sql: `INSERT INTO legacy_source_rows
					(id, source_namespace, academic_period_id, source_access_id, value48_mirror,
					 legacy_family_id, child_id, import_run_id, source_hash, source_values_json,
					 last_seen_run_id, is_current, retired_at, created_at, updated_at)
				VALUES ('privacy-legacy-row-a', 'legacy_1', 'privacy-period', 99001, NULL,
					'privacy-legacy-family-a', 'privacy-legacy-child-a', 'privacy-run', ?, '{}',
					'privacy-run', 1, NULL, ?, ?)`,
				params: [hash('9'), now, now],
			},
			{
				sql: `INSERT INTO legacy_enrollments
					(id, legacy_source_row_id, legacy_family_id, child_id, academic_period_id,
					 source_slot, source_record_key, group_name_raw, group_name_normalized,
					 status_code_raw, lesson_kind, contract_kind, needs_admin_review,
					 is_active_for_occupancy, represented_by_enrollment_id, last_seen_run_id,
					 is_current, created_at, updated_at, payment_arrangement)
				VALUES ('privacy-legacy-nachhilfe-a', 'privacy-legacy-row-a',
					'privacy-legacy-family-a', 'privacy-legacy-child-a', 'privacy-period',
					'main_next', 'privacy-legacy-nachhilfe-a', 'Legacy Nachhilfe',
					'legacy nachhilfe', 'NH', 'nachhilfe', 'nachhilfe', 0, 0, NULL,
					'privacy-run', 1, ?, ?, 'not_applicable')`,
				params: [now, now],
			},
		]);

		const result = await service.requestDeletion({ actor: parentA,
			idempotencyKey: 'privacy-delete-legacy-blocked', requestId: 'privacy-delete-legacy' });
		expect(result.status).toBe('blocked_by_active_contract');
		expect((await service.dryRunDeletion(parentA)).activeContracts)
			.toContainEqual({ category: 'legacy_active_service', count: 1 });
	});

	it('closes atomically, revokes grants once, separates retained evidence, and cleans R2', async () => {
		const inventory = await service.dryRunDeletion(parentA);
		expect(inventory.holds).toEqual([{ category: 'media_consent_evidence', count: 1 }]);
		expect(inventory.r2Cleanup).toContainEqual({ category: 'document_quarantine', count: 1 });
		store.values.set('privacy-quarantine-a', new Uint8Array([1, 2, 3, 4]));
		const exported = await service.generateExport({ actor: parentA,
			idempotencyKey: 'privacy-export-before-delete', requestId: 'privacy-export-before-delete' });
		const requested = await service.requestDeletion({ actor: parentA,
			idempotencyKey: 'privacy-delete-success-0001', requestId: 'privacy-delete-success' });
		expect(requested.status).toBe('requested');
		const result = await service.processDeletion({ admin,
			privacyRequestId: requested.requestId,
			reason: 'Verified request, identity, blockers and retained evidence inventory.',
			idempotencyKey: 'privacy-admin-close-0001', requestId: 'privacy-admin-close' });
		expect(result.status).toBe('completed_with_retained_evidence');
		expect(result.cleanup).toContainEqual({ status: 'completed', count: 1 });
		expect(result.cleanup).toContainEqual({ status: 'pending', count: 1 });
		expect(await service.processDeletion({ admin,
			privacyRequestId: requested.requestId,
			reason: 'Verified request, identity, blockers and retained evidence inventory.',
			idempotencyKey: 'privacy-admin-close-0001', requestId: 'privacy-admin-close-replay' }))
			.toMatchObject({ status: 'completed_with_retained_evidence', replayed: true });
		const user = await db.first<{ account_status: string; email: string; phone: string | null;
			family_number_id: string | null; closed_at: string }>({
			sql: `SELECT account_status, email, phone, family_number_id, closed_at
			FROM users WHERE id = ?`, params: [parentA.id],
		});
		expect(user).toMatchObject({ account_status: 'closed', phone: null,
			family_number_id: null, closed_at: now });
		expect(user!.email).toMatch(/^closed-.+@tombstone\.invalid$/u);
		expect(await db.first<{ revoked_at: string; revocation_reason: string }>({
			sql: `SELECT revoked_at, revocation_reason FROM auth_sessions WHERE user_id = ?`,
			params: [parentA.id],
		})).toEqual({ revoked_at: now, revocation_reason: 'account_deletion' });
		expect(await db.first<{ owner_user_id: string | null; full_name: string;
			minimized_at: string }>({
			sql: `SELECT owner_user_id, full_name, minimized_at FROM children
			WHERE id = 'privacy-child-a'`,
		})).toEqual({ owner_user_id: null, full_name: 'Geschlossenes Profil', minimized_at: now });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM media_consents
			WHERE user_id = ? AND decision = 'revoked' AND decision_source = 'account_deletion'
				AND received_at = ? AND effective_from = ?`, params: [parentA.id, now, now],
		})).toEqual({ count: 1 });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM legal_archive_records archive
			JOIN retention_controls control ON control.id = archive.retention_control_id
			WHERE archive.owner_tombstone_user_id = ?
				AND control.purge_status = 'disabled_by_policy'`, params: [parentA.id],
		})).toEqual({ count: 3 });
		expect(await db.first<{ legal_hold: number; hold_reason: string;
			purge_status: string; hold_review_on: string }>({
			sql: `SELECT control.legal_hold, control.hold_reason, control.purge_status,
				control.hold_review_on FROM retention_controls control
			JOIN legal_archive_records archive ON archive.retention_control_id = control.id
			WHERE archive.target_kind = 'media_consent'
				AND archive.target_id = 'privacy-grant-a'`,
		})).toEqual({ legal_hold: 1, hold_reason: 'Pending documented retention review.',
			purge_status: 'disabled_by_policy', hold_review_on: '2026-10-01' });
		expect(await db.first<{ status: string }>({
			sql: `SELECT status FROM privacy_export_artifacts WHERE id = ?`,
			params: [exported.artifactId],
		})).toEqual({ status: 'deleted' });
		expect(store.values.has('privacy-quarantine-a')).toBe(true);
		expect(await db.first<{ quarantine_delete_state: string; review_status: string }>({
			sql: `SELECT quarantine_delete_state, review_status
			FROM authorization_documents WHERE id = 'privacy-document-a'`,
		})).toEqual({ quarantine_delete_state: 'present', review_status: 'quarantined' });
		expect(await db.first<{ status: string; subject: string }>({
			sql: `SELECT status, subject FROM support_threads WHERE id = 'privacy-thread-a'`,
		})).toEqual({ status: 'closed', subject: '[account-closed]' });
		expect(await db.first<{ body: string }>({
			sql: `SELECT body FROM support_messages WHERE id = 'privacy-message-a'`,
		})).toEqual({ body: '[account-closed]' });
		expect(await db.first<{
			subjects_raw: string;
			description: string;
			preferred_days_json: string;
			admin_notes: string | null;
		}>({
			sql: `SELECT subjects_raw, description, preferred_days_json, admin_notes
				FROM individual_requests WHERE id = 'privacy-request-a'`,
		})).toEqual({
			subjects_raw: '[account-closed]', description: '', preferred_days_json: '[]',
			admin_notes: null,
		});
		expect(await db.first<{ status: string }>({
			sql: `SELECT status FROM support_threads WHERE id = 'privacy-thread-b'`,
		})).toEqual({ status: 'waiting_for_admin' });
	});

	it('serializes account closure with an email-outbox claim', async () => {
		await db.run({
			sql: `INSERT INTO email_outbox
				(id, source_kind, source_id, template_or_category, recipient_user_id,
				 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
				 status, attempts, max_attempts, created_at, updated_at)
			VALUES ('privacy-email-race', 'support_message', 'privacy-message-a',
				'support_reply', ?, 'current', 'de', '{}', 'privacy-email-race', ?,
				'pending', 0, 5, ?, ?)`,
			params: [parentA.id, now, now, now],
		});
		const requested = await service.requestDeletion({
			actor: parentA,
			idempotencyKey: 'privacy-delete-email-race',
			requestId: 'privacy-delete-email-race',
		});
		const outbox = new OutboxRepository(db);

		const [closureAttempt, claimAttempt] = await Promise.allSettled([
			service.processDeletion({
				admin,
				privacyRequestId: requested.requestId,
				reason: 'Synthetic concurrency verification.',
				idempotencyKey: 'privacy-admin-email-race',
				requestId: 'privacy-admin-email-race',
			}),
			outbox.claimEmail({
				now,
				leaseOwner: 'privacy-email-worker',
				leaseUntil: '2026-07-22T10:05:00.000Z',
			}),
		]);

		const state = await db.first<{ account_status: string; outbox_status: string }>({
			sql: `SELECT user.account_status, outbox.status AS outbox_status
				FROM users user JOIN email_outbox outbox ON outbox.id = 'privacy-email-race'
				WHERE user.id = ?`,
			params: [parentA.id],
		});
		expect(state).not.toEqual({ account_status: 'closed', outbox_status: 'processing' });
		if (closureAttempt.status === 'fulfilled') {
			expect(closureAttempt.value.status).toBe('completed_with_retained_evidence');
			expect(state?.account_status).toBe('closed');
			expect(claimAttempt).toMatchObject({ status: 'fulfilled', value: null });
		} else {
			expect(state).toEqual({ account_status: 'active', outbox_status: 'processing' });
			expect(claimAttempt.status).toBe('fulfilled');
			if (claimAttempt.status === 'fulfilled') expect(claimAttempt.value?.id).toBe('privacy-email-race');
		}
	}, 45_000);
});

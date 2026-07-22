import { DatabaseBoundary } from '$lib/server/db/database';
import { StorageIntentRepository } from '$lib/server/operations/storage-intents';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const NOW = '2026-07-22T12:00:00.000Z';
const EARLIER = '2026-07-22T11:00:00.000Z';
const LATER = '2026-07-22T12:05:00.000Z';

describe('stage 13 D1/R2 write-ahead storage intents', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;
	let repository: StorageIntentRepository;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		repository = new StorageIntentRepository(db);
	});

	afterEach(async () => context.dispose());

	it('leases and completes only old unreferenced objects with the current owner', async () => {
		const intentId = await repository.stage({
			storageClass: 'quarantine',
			objectKey: 'quarantine/stage-13-orphan',
			objectKind: 'synthetic_orphan',
			sha256: 'a'.repeat(64),
			sizeBytes: 42,
			now: EARLIER,
		});

		expect(await repository.claimCleanup({
			now: NOW,
			stagedBefore: '2026-07-22T10:59:59.000Z',
			leaseOwner: 'cleanup-too-early',
			leaseUntil: LATER,
			limit: 10,
		})).toEqual([]);
		expect(await repository.claimCleanup({
			now: NOW,
			stagedBefore: EARLIER,
			leaseOwner: 'cleanup-owner-a',
			leaseUntil: LATER,
			limit: 10,
		})).toEqual([{ id: intentId, storage_class: 'quarantine',
			object_key: 'quarantine/stage-13-orphan' }]);
		expect(await repository.completeDelete(intentId, 'cleanup-owner-b', NOW)).toBe(false);
		expect(await repository.completeDelete(intentId, 'cleanup-owner-a', NOW)).toBe(true);
		expect(await repository.claimCleanup({
			now: LATER,
			stagedBefore: LATER,
			leaseOwner: 'cleanup-owner-c',
			leaseUntil: '2026-07-22T12:10:00.000Z',
			limit: 10,
		})).toEqual([]);
	});

	it('never claims a referenced object and reconciles an ambiguous D1 result to linked', async () => {
		const objectKey = 'archive/privacy/stage-13-linked';
		const intentId = await repository.stage({
			storageClass: 'archive',
			objectKey,
			objectKind: 'privacy_export',
			sourceRef: 'stage-13-artifact',
			sha256: 'b'.repeat(64),
			sizeBytes: 12,
			now: EARLIER,
		});
		await db.batch([
			{
				sql: `INSERT INTO users
					(id, email, email_normalized, password_hash, email_verified_at, role,
					 account_status, first_name, last_name, first_name_normalized,
					 last_name_normalized, preferred_language, privacy_notice_version,
					 privacy_accepted_at, created_at, updated_at)
				VALUES ('intent-user', 'intent-user@example.test',
					'intent-user@example.test', 'synthetic-not-used', ?, 'parent',
					'active', 'Intent', 'User', 'intent', 'user', 'de', 'notice-v1', ?, ?, ?)`,
				params: [NOW, NOW, NOW, NOW],
			},
			{
				sql: `INSERT INTO privacy_requests
					(id, public_reference, subject_user_id, requested_by_user_id, kind,
					 status, request_idempotency_key, request_hash_sha256,
					 retention_holds_json, safe_summary_json, artifact_r2_key,
					 artifact_expires_at, created_at, updated_at)
				VALUES ('stage-13-request', 'PRIV-STAGE-13', 'intent-user', 'intent-user',
					'export', 'completed', 'stage-13-export', ?, '[]', '{}', ?,
					'2026-07-22T13:00:00.000Z', ?, ?)`,
				params: ['c'.repeat(64), objectKey, NOW, NOW],
			},
			{
				sql: `INSERT INTO privacy_export_artifacts
					(id, privacy_request_id, subject_user_id, private_r2_key, content_type,
					 size_bytes, sha256, status, generation_attempts, generated_at,
					 expires_at, created_at, updated_at)
				VALUES ('stage-13-artifact', 'stage-13-request', 'intent-user', ?,
					'application/json; charset=utf-8', 12, ?, 'ready', 1, ?,
					'2026-07-22T13:00:00.000Z', ?, ?)`,
				params: [objectKey, 'b'.repeat(64), NOW, NOW, NOW],
			},
		]);

		expect(await repository.claimCleanup({
			now: NOW,
			stagedBefore: NOW,
			leaseOwner: 'must-not-claim',
			leaseUntil: LATER,
			limit: 10,
		})).toEqual([]);
		expect(await repository.reconcileLinked(NOW, 10)).toBe(1);
		expect(await db.first<{ status: string; linked_at: string }>({
			sql: `SELECT status, linked_at FROM storage_object_intents WHERE id = ?`,
			params: [intentId],
		})).toEqual({ status: 'linked', linked_at: NOW });
	});
});

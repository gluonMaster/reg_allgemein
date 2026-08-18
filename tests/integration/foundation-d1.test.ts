import { AuditRepository } from '$lib/server/audit/audit-repository';
import { DatabaseBoundary } from '$lib/server/db/database';
import {
	FoundationRepository,
	hashIdempotencyKey,
	hashRequestFingerprint,
} from '$lib/server/db/foundation-repository';
import { scopedHash } from '$lib/server/security/digest';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

describe('foundation D1 migration and repositories', () => {
	let context: TestD1Context;
	let database: DatabaseBoundary;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		database = new DatabaseBoundary(context.db);
	});

	afterEach(async () => {
		if (context) await context.dispose();
	});

	it('applies the immutable migration sequence to an empty D1', async () => {
		expect(context.migrationIds).toEqual([
			'0001_foundation.sql',
			'0002_price_schedule_imports.sql',
			'0003_access_plusbtext_imports.sql',
			'0004_courses_occupancy_pricing.sql',
			'0005_auth_security.sql',
			'0006_family_claim_cabinet.sql',
			'0007_admin_console.sql',
			'0008_catalog_trials.sql',
			'0009_requests_documents.sql',
			'0010_contracts.sql',
			'0011_price_reviews.sql',
			'0012_messaging_outboxes.sql',
			'0013_privacy_closure.sql',
			'0014_production_operations.sql',
			'0015_worker_monitoring.sql',
			'0016_legacy_import_release_control.sql',
			'0017_telegram_delivery_certainty.sql',
			'0018_legacy_import_release_hardening.sql',
			'0019_legacy_import_reconciliation.sql',
			'0020_reconciliation_release_fence.sql',
			'0021_reconciliation_exact_candidate_evidence.sql',
		]);

		const result = await context.db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.all<{ name: string }>();
		const tables = result.results.map((row) => row.name);

		expect(tables).toEqual(
			expect.arrayContaining([
				'academic_periods',
				'admin_review_tasks',
				'audit_events',
				'idempotency_records',
				'operation_locks',
				'rate_limit_buckets',
				'users',
				'auth_tokens',
				'auth_sessions',
				'privacy_acknowledgements',
				'email_outbox',
				'price_review_triggers',
				'price_review_batches',
				'price_review_items',
				'price_review_reconciler_state',
				'price_change_acceptances',
				'price_change_apply_events',
				'legacy_service_price_assignments',
				'support_threads',
				'support_messages',
				'absence_reports',
				'telegram_outbox',
				'outbox_admin_actions',
				'scheduled_job_runs',
				'storage_object_intents',
				'admin_bootstrap_control',
				'admin_bootstrap_actions',
				'admin_bootstrap_assertions',
				'worker_error_buckets',
				'legacy_reconciliation_cases',
				'legacy_reconciliation_decisions',
				'legacy_reconciliation_assertions',
				'legacy_reconciliation_evidence_bindings',
			])
		);
	});

	it('allows only one current academic period', async () => {
		const statement = `INSERT INTO academic_periods
			(id, code, display_name, starts_on, ends_on, is_current, created_at)
			VALUES (?, ?, ?, ?, ?, 1, ?)`;

		await context.db
			.prepare(statement)
			.bind(
				'period-1',
				'2026-2027',
				'2026/2027',
				'2026-08-01',
				'2027-07-31',
				'2026-07-15T10:00:00.000Z'
			)
			.run();

		await expect(
			context.db
				.prepare(statement)
				.bind(
					'period-2',
					'2027-2028',
					'2027/2028',
					'2027-08-01',
					'2028-07-31',
					'2026-07-15T10:00:00.000Z'
				)
				.run()
		).rejects.toThrow();
	});

	it('stores redacted append-only audit events', async () => {
		const audit = new AuditRepository(database);
		const id = await audit.append({
			actorKind: 'system',
			action: 'foundation.check',
			targetKind: 'runtime',
			targetId: 'foundation',
			requestId: 'request_12345678',
			safeDiff: {
				status: 'checked',
				email: 'synthetic@example.invalid',
				token: 'must-not-be-stored',
			},
			createdAt: '2026-07-15T10:00:00.000Z',
		});

		const row = await context.db
			.prepare('SELECT safe_diff_json FROM audit_events WHERE id = ?')
			.bind(id)
			.first<{ safe_diff_json: string }>();

		expect(row?.safe_diff_json).toContain('checked');
		expect(row?.safe_diff_json).not.toContain('synthetic@example.invalid');
		expect(row?.safe_diff_json).not.toContain('must-not-be-stored');
		await expect(
			context.db
				.prepare('UPDATE audit_events SET action = ? WHERE id = ?')
				.bind('changed', id)
				.run()
		).rejects.toThrow(/append-only/);
		await expect(
			context.db.prepare('DELETE FROM audit_events WHERE id = ?').bind(id).run()
		).rejects.toThrow(/append-only/);
	});

	it('increments rate-limit buckets atomically and denies after the limit', async () => {
		const repository = new FoundationRepository(database);
		const subjectHash = await scopedHash('rate-limit:registration', 'synthetic-subject');
		const results = await Promise.all(
			Array.from({ length: 5 }, () =>
				repository.consumeRateLimit({
					scope: 'registration',
					subjectHash,
					windowStart: '2026-07-15T10:00:00.000Z',
					expiresAt: '2026-07-15T10:01:00.000Z',
					now: '2026-07-15T10:00:05.000Z',
					limit: 3,
				})
			)
		);

		expect(results.map((result) => result.count).sort((a, b) => a - b)).toEqual([
			1, 2, 3, 4, 5,
		]);
		expect(results.filter((result) => result.allowed)).toHaveLength(3);
	});

	it('replays one completed idempotent result and rejects payload reuse', async () => {
		const repository = new FoundationRepository(database);
		const scope = 'foundation-test';
		const keyHash = await hashIdempotencyKey(scope, 'client-operation-key');
		const requestHash = await hashRequestFingerprint(scope, '{"operation":"one"}');
		const differentRequestHash = await hashRequestFingerprint(scope, '{"operation":"two"}');
		const reservation = {
			scope,
			keyHash,
			requestHash,
			now: '2026-07-15T10:00:00.000Z',
			expiresAt: '2026-07-15T11:00:00.000Z',
		};

		expect(await repository.reserveIdempotency(reservation)).toEqual({ outcome: 'acquired' });
		expect(await repository.reserveIdempotency(reservation)).toEqual({
			outcome: 'in_progress',
		});
		expect(
			await repository.completeIdempotency({
				scope,
				keyHash,
				requestHash,
				resultRef: 'result:foundation:1',
				now: '2026-07-15T10:00:01.000Z',
			})
		).toBe(true);
		expect(await repository.reserveIdempotency(reservation)).toEqual({
			outcome: 'replay',
			resultRef: 'result:foundation:1',
		});
		expect(
			await repository.reserveIdempotency({
				...reservation,
				requestHash: differentRequestHash,
			})
		).toEqual({ outcome: 'conflict' });
	});

	it('uses lease expiry and increasing fencing tokens', async () => {
		const repository = new FoundationRepository(database);
		const first = await repository.tryAcquireLease({
			scope: 'promotion',
			resourceKey: 'period:2026-2027',
			owner: 'worker-a',
			now: '2026-07-15T10:00:00.000Z',
			leaseUntil: '2026-07-15T10:01:00.000Z',
		});

		expect(first).toEqual({
			acquired: true,
			fencingToken: 1,
			leaseUntil: '2026-07-15T10:01:00.000Z',
		});
		expect(
			await repository.tryAcquireLease({
				scope: 'promotion',
				resourceKey: 'period:2026-2027',
				owner: 'worker-b',
				now: '2026-07-15T10:00:30.000Z',
				leaseUntil: '2026-07-15T10:02:00.000Z',
			})
		).toEqual({ acquired: false });

		const second = await repository.tryAcquireLease({
			scope: 'promotion',
			resourceKey: 'period:2026-2027',
			owner: 'worker-b',
			now: '2026-07-15T10:01:00.000Z',
			leaseUntil: '2026-07-15T10:03:00.000Z',
		});

		expect(second).toMatchObject({ acquired: true, fencingToken: 2 });
		expect(
			await repository.releaseLease({
				scope: 'promotion',
				resourceKey: 'period:2026-2027',
				owner: 'worker-a',
				fencingToken: 1,
				now: '2026-07-15T10:02:00.000Z',
			})
		).toBe(false);
		expect(
			await repository.releaseLease({
				scope: 'promotion',
				resourceKey: 'period:2026-2027',
				owner: 'worker-b',
				fencingToken: 2,
				now: '2026-07-15T10:02:00.000Z',
			})
		).toBe(true);
	});
});

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import { DatabaseBoundary } from '$lib/server/db/database';
import { MessageRepository } from '$lib/server/messages/message-repository';
import { MessageService } from '$lib/server/messages/message-service';
import { parseBusinessHours } from '$lib/server/outbox/business-hours';
import { OutboxRepository } from '$lib/server/outbox/outbox-repository';
import { EmailOutboxWorker, TelegramOutboxWorker } from '$lib/server/outbox/outbox-worker';
import {
	EmailProviderError,
	FakeEmailProvider,
	FakeTelegramProvider,
	TelegramProviderError,
} from '$lib/server/outbox/providers';
import { requireAdmin } from '$lib/server/security/authorization';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const now = '2026-07-22T10:00:00.000Z';
const timing = { leaseSeconds: 30, retryBaseSeconds: 60, retryMaxSeconds: 300 };
const portal = { portalPublicOrigin: 'https://portal.example.test' };
const schedule = parseBusinessHours('Europe/Berlin', 'Mo-Fr 09:00-17:00');
const parent: AuthenticatedUser = {
	id: 'message-parent', role: 'parent', emailVerified: true,
	sessionId: 'parent-session', sessionVersion: 1, csrfHash: 'parent-csrf',
};
const foreignParent: AuthenticatedUser = {
	id: 'message-foreign', role: 'parent', emailVerified: true,
	sessionId: 'foreign-session', sessionVersion: 1, csrfHash: 'foreign-csrf',
};
const admin = requireAdmin({
	id: 'message-admin', role: 'admin', emailVerified: true,
	sessionId: 'admin-session', sessionVersion: 1, csrfHash: 'admin-csrf',
});

async function seed(db: DatabaseBoundary): Promise<void> {
	const hash = (character: string) => character.repeat(64);
	await db.batch([
		{
			sql: `INSERT INTO academic_periods
				(id, code, display_name, starts_on, ends_on, is_current, created_at)
			VALUES ('message-period', '2026-2027-message', '2026/2027',
				'2026-01-01', '2027-12-31', 1, ?)`,
			params: [now],
		},
		{
			sql: `INSERT INTO import_runs
				(id, source_kind, academic_period_id, source_label, source_hash_sha256,
				 source_contract_id, source_contract_version, structural_fingerprint_sha256,
				 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
				 attempt_no, retry_of_run_id, status, started_at, validated_at, promoted_at,
				 finished_at, rows_total, rows_staged, rows_promoted, rows_skipped,
				 safe_summary_json, error_code, created_at, updated_at)
			VALUES ('message-run', 'schedule', 'message-period', 'synthetic', ?,
				'schedule-json', 1, ?, '{}', ?, ?, 1, NULL, 'validated', ?, ?, NULL,
				NULL, 0, 0, 0, 0, '{}', NULL, ?, ?)`,
			params: [hash('1'), hash('2'), hash('3'), hash('4'), now, now, now, now],
		},
	]);
	for (const [id, role] of [
		[parent.id, 'parent'], [foreignParent.id, 'parent'], [admin.id, 'admin'],
	] as const) {
		await db.run({
			sql: `INSERT INTO users
				(id, email, email_normalized, password_hash, email_verified_at, role,
				 first_name, last_name, first_name_normalized, last_name_normalized,
				 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
			VALUES (?, ?, ?, 'unused', ?, ?, 'Test', 'Person', 'test', 'person',
				'privacy-v1', ?, ?, ?)`,
			params: [id, `${id}@example.test`, `${id}@example.test`, now, role, now, now, now],
		});
	}
	for (const [userId, familyId, sequence] of [
		[parent.id, 'message-family', 12_001],
		[foreignParent.id, 'message-foreign-family', 12_002],
	] as const) {
		await db.batch([
			{
				sql: `INSERT INTO family_number_allocations
					(id, namespace, sequence_number, display_family_id, legacy_family_id,
					 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
					 created_at, updated_at)
				VALUES (?, 'portal_2', ?, ?, NULL, ?, 'portal', 'assigned', ?, NULL, ?, ?)`,
				params: [familyId, sequence, `2. ${sequence}`, userId, now, now, now],
			},
			{
				sql: `UPDATE users SET family_number_id = ?, family_assignment_status = 'assigned',
					family_version = 1, updated_at = ? WHERE id = ?`,
				params: [familyId, now, userId],
			},
		]);
	}
	for (const [id, ownerId, familyId, name] of [
		['message-child', parent.id, 'message-family', 'Beispielkind'],
		['message-foreign-child', foreignParent.id, 'message-foreign-family', 'Fremdes Kind'],
	] as const) {
		await db.run({
			sql: `INSERT INTO children
				(id, owner_user_id, legacy_family_id, family_number_id, origin,
				 source_child_key, source_full_name, source_full_name_normalized,
				 source_birth_date, full_name_override, birth_date_override, full_name,
				 full_name_normalized, birth_date, last_seen_run_id, is_current,
				 created_at, updated_at)
			VALUES (?, ?, NULL, ?, 'portal', ?, ?, lower(?), '2016-02-03', NULL,
				NULL, ?, lower(?), '2016-02-03', 'message-run', 1, ?, ?)`,
			params: [id, ownerId, familyId, id, name, name, name, name, now, now],
		});
	}
	await db.run({
		sql: `INSERT INTO course_groups
			(id, academic_period_id, source_offering_key, display_name, normalized_price_key,
			 lesson_kind, subject, capacity_default, capacity_override,
			 requires_admin_approval, catalog_status, last_seen_schedule_version_id,
			 retired_at, created_at, updated_at)
		VALUES ('message-course', 'message-period', 'message-course', 'Kunstgruppe',
			'kunst', 'group', 'Kunst', 10, NULL, 0, 'published', NULL, NULL, ?, ?)`,
		params: [now, now],
	});
	for (const [id, userId, childId] of [
		['message-enrollment', parent.id, 'message-child'],
		['message-foreign-enrollment', foreignParent.id, 'message-foreign-child'],
	] as const) {
		await db.run({
			sql: `INSERT INTO enrollments
				(id, user_id, child_id, course_group_id, legacy_enrollment_id, lesson_kind,
				 status, contract_kind, active_from, active_until, current_price_cents,
				 price_source, price_mode, price_effective_from, source, created_at, updated_at)
			VALUES (?, ?, ?, 'message-course', NULL, 'group', 'active', 'group_yearly',
				'2026-01-01', '2027-01-01', 4500, 'excel_yearly', 'rule_derived',
				'2026-01-01', 'portal', ?, ?)`,
			params: [id, userId, childId, now, now],
		});
	}
}

function directTelegram(id: string, input: {
	notBefore?: string; createdAt?: string; maxAttempts?: number;
	extraPayload?: Record<string, unknown>;
} = {}) {
	const createdAt = input.createdAt ?? now;
	const reference = '11111111-1111-4111-8111-111111111111';
	return {
		sql: `INSERT INTO telegram_outbox
			(id, source_kind, source_id, template_or_category, destination_ref, locale,
			 payload_json, dedupe_key, not_before, status, attempts, max_attempts,
			 created_at, updated_at)
		VALUES (?, 'support_thread', ?, 'bureau.support', 'bureau', 'de', ?, ?, ?,
			'pending', 0, ?, ?, ?)`,
		params: [id, reference, JSON.stringify({ category: 'technical', reference,
			receivedAt: createdAt, adminPath: `/admin/messages/${reference}`,
			...(input.extraPayload ?? {}) }),
			`dedupe:${id}`, input.notBefore ?? createdAt, input.maxAttempts ?? 3,
			createdAt, createdAt],
	};
}

describe('stage 11 messages and common outbox in D1', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;
	let messages: MessageService;
	let repository: MessageRepository;
	let outbox: OutboxRepository;

	beforeAll(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		await seed(db);
		repository = new MessageRepository(db);
		messages = new MessageService(repository, {
			emailMaxAttempts: 2,
			telegramMaxAttempts: 2,
			telegramSchedule: schedule,
		});
		outbox = new OutboxRepository(db);
	});

	afterAll(async () => {
		if (context) await context.dispose();
	});

	it('creates one owner-scoped absence, message, and minimized Telegram event atomically', async () => {
		const payload = {
			enrollmentId: 'message-enrollment', childId: 'message-child',
			absenceDate: '2026-08-03', reason: 'Krank', message: 'Vertrauliche Details',
			idempotencyKey: 'absence-command-1',
		};
		const first = await messages.createAbsence({ actor: parent, payload, requestId: 'absence-1', now });
		const replay = await messages.createAbsence({ actor: parent, payload, requestId: 'absence-2', now });
		expect(replay).toEqual({ publicReference: first.publicReference, replayed: true });

		const counts = await db.first<Record<string, number>>({
			sql: `SELECT
				(SELECT COUNT(*) FROM support_threads WHERE category = 'absence') AS threads,
				(SELECT COUNT(*) FROM support_messages message JOIN support_threads thread
					ON thread.id = message.thread_id WHERE thread.category = 'absence') AS messages,
				(SELECT COUNT(*) FROM absence_reports) AS absences,
				(SELECT COUNT(*) FROM telegram_outbox WHERE source_kind = 'absence_report') AS telegrams`,
		});
		expect(counts).toEqual({ threads: 1, messages: 1, absences: 1, telegrams: 1 });
		const queued = await db.first<{ payload_json: string; dedupe_key: string }>({
			sql: `SELECT payload_json, dedupe_key FROM telegram_outbox
			WHERE source_kind = 'absence_report'`,
		});
		expect(Object.keys(JSON.parse(queued!.payload_json)).sort())
			.toEqual(['adminPath', 'category', 'receivedAt', 'reference']);
		expect(queued!.payload_json).not.toContain('Krank');
		expect(queued!.payload_json).not.toContain('Vertrauliche');
		expect(queued!.payload_json).not.toContain('@example.test');

		await expect(messages.createAbsence({
			actor: foreignParent, payload: { ...payload, idempotencyKey: 'absence-foreign-1' },
			requestId: 'absence-foreign', now,
		})).rejects.toMatchObject({ code: 'ABSENCE_CREATE_REJECTED' });
		await expect(messages.createAbsence({
			actor: parent, payload: { ...payload, absenceDate: '2027-01-01',
				idempotencyKey: 'absence-outside-1' }, requestId: 'absence-outside', now,
		})).rejects.toMatchObject({ code: 'ABSENCE_CREATE_REJECTED' });
		expect(await db.first<{ total: number }>({ sql: 'SELECT COUNT(*) AS total FROM absence_reports' }))
			.toEqual({ total: 1 });
	});

	it('enforces the thread state machine and keeps an admin reply when email delivery fails', async () => {
		const created = await messages.createThread({
			actor: parent,
			payload: { category: 'technical', subject: 'Portalfrage', message: 'Bitte prüfen',
				idempotencyKey: 'support-create-1' },
			requestId: 'support-create', now,
		});
		await expect(messages.appendParentMessage({
			actor: foreignParent,
			payload: {
				publicReference: created.publicReference,
				message: 'Synthetic foreign append',
				idempotencyKey: 'support-foreign-append-1',
			},
			requestId: 'support-foreign-append',
			now,
		})).rejects.toMatchObject({ code: 'SUPPORT_THREAD_NOT_FOUND' });
		await expect(messages.closeAsParent({
			actor: foreignParent,
			payload: {
				publicReference: created.publicReference,
				idempotencyKey: 'support-foreign-close-1',
			},
			requestId: 'support-foreign-close',
			now,
		})).rejects.toMatchObject({ code: 'SUPPORT_THREAD_NOT_FOUND' });
		await expect(messages.appendParentMessage({
			actor: parent, payload: { publicReference: created.publicReference,
				message: 'Zu früh', idempotencyKey: 'support-early-1' },
			requestId: 'support-early', now,
		})).rejects.toMatchObject({ code: 'SUPPORT_MESSAGE_REJECTED' });
		await expect(messages.replyAsAdmin({
			admin: foreignParent as unknown as typeof admin,
			payload: { publicReference: created.publicReference, message: 'Forged reply',
				outcome: 'answered', idempotencyKey: 'support-forged-admin-1' },
			requestId: 'support-forged-admin', now,
		})).rejects.toMatchObject({ code: 'ADMIN_REPLY_REJECTED' });
		expect(await repository.getOwnerThread(created.publicReference, parent.id))
			.toMatchObject({ status: 'waiting_for_admin', messageCount: 1 });

		const replyPayload = { publicReference: created.publicReference,
			message: 'Wir prüfen das.', outcome: 'waiting_for_parent' as const,
			idempotencyKey: 'support-admin-reply-1' };
		expect(await messages.replyAsAdmin({ admin, payload: replyPayload,
			requestId: 'support-reply', now })).toEqual({ replayed: false });
		expect(await messages.replyAsAdmin({ admin, payload: replyPayload,
			requestId: 'support-reply-replay', now })).toEqual({ replayed: true });
		const detail = await repository.getOwnerThread(created.publicReference, parent.id);
		expect(detail).toMatchObject({ status: 'waiting_for_parent', messageCount: 2 });
		expect(await repository.getOwnerThread(created.publicReference, foreignParent.id)).toBeNull();

		const provider = new FakeEmailProvider();
		provider.failNext(new EmailProviderError('TEMPORARY_UNAVAILABLE', true));
		const worker = new EmailOutboxWorker(outbox, provider, undefined, portal, timing, 'email-test');
		expect(await worker.dispatchNext(now)).toBe('retry');
		expect(await repository.getOwnerThread(created.publicReference, parent.id))
			.toMatchObject({ status: 'waiting_for_parent', messageCount: 2 });
		expect(await worker.dispatchNext('2026-07-22T10:01:00.000Z')).toBe('sent');
		expect(provider.messages).toHaveLength(1);
		expect(provider.messages[0].text).toContain(created.publicReference);

		await messages.appendParentMessage({ actor: parent,
			payload: { publicReference: created.publicReference, message: 'Hier die Antwort.',
				idempotencyKey: 'support-parent-answer-1' }, requestId: 'support-parent-answer', now });
		expect(await repository.getOwnerThread(created.publicReference, parent.id))
			.toMatchObject({ status: 'waiting_for_admin', messageCount: 3 });
		await messages.closeAsAdmin({ admin, payload: { publicReference: created.publicReference,
			idempotencyKey: 'support-close-admin-1' }, requestId: 'support-close', now });
		await expect(messages.appendParentMessage({ actor: parent,
			payload: { publicReference: created.publicReference, message: 'Nach Abschluss',
				idempotencyKey: 'support-after-close-1' }, requestId: 'after-close', now,
		})).rejects.toMatchObject({ code: 'SUPPORT_MESSAGE_REJECTED' });
	});

	it('retries, exhausts, reclaims stale leases, defers weekends, and prevents duplicate sends', async () => {
		await db.run({
			sql: `UPDATE telegram_outbox SET not_before = '9999-12-31T23:59:59.999Z',
				next_attempt_at = '9999-12-31T23:59:59.999Z', updated_at = ?
				WHERE status IN ('pending', 'retry')`, params: [now],
		});
		await db.run(directTelegram('telegram-transient', { createdAt: '2026-07-22T09:00:00.000Z', maxAttempts: 2 }));
		const provider = new FakeTelegramProvider();
		provider.failNext(new TelegramProviderError('TELEGRAM_TEMPORARY', true));
		const worker = new TelegramOutboxWorker(outbox, provider, 'bureau-chat', portal,
			schedule, timing, 'telegram-worker-1', () => now);
		expect(await worker.dispatchNext(now)).toBe('retry');
		expect(await worker.dispatchNext('2026-07-22T10:01:00.000Z')).toBe('sent');
		expect(await worker.dispatchNext('2026-07-22T10:02:00.000Z')).toBe('empty');
		expect(provider.messages).toHaveLength(1);

		await db.run(directTelegram('telegram-exhausted', { maxAttempts: 1 }));
		provider.failNext(new TelegramProviderError('TELEGRAM_TEMPORARY', true));
		expect(await worker.dispatchNext(now)).toBe('dead');
		expect(await db.first<{ status: string; attempts: number }>({
			sql: `SELECT status, attempts FROM telegram_outbox WHERE id = 'telegram-exhausted'`,
		})).toEqual({ status: 'dead', attempts: 1 });
		await db.run(directTelegram('telegram-permanent', { maxAttempts: 3 }));
		provider.failNext(new TelegramProviderError('TELEGRAM_REQUEST_REJECTED', false));
		expect(await worker.dispatchNext(now)).toBe('dead');
		expect(await db.first<{ status: string; attempts: number }>({
			sql: `SELECT status, attempts FROM telegram_outbox WHERE id = 'telegram-permanent'`,
		})).toEqual({ status: 'dead', attempts: 1 });

		await db.run(directTelegram('telegram-stale'));
		expect(await outbox.claimTelegram({ now, leaseOwner: 'abandoned-worker',
			leaseUntil: '2026-07-22T10:00:30.000Z' })).toMatchObject({ id: 'telegram-stale' });
		const reclaimWorker = new TelegramOutboxWorker(outbox, provider, 'bureau-chat', portal,
			schedule, timing, 'telegram-worker-2');
		expect(await reclaimWorker.dispatchNext('2026-07-22T10:00:31.000Z')).toBe('sent');

		await db.run(directTelegram('telegram-concurrent'));
		const concurrentA = new TelegramOutboxWorker(outbox, provider, 'bureau-chat', portal,
			schedule, timing, 'telegram-concurrent-a');
		const concurrentB = new TelegramOutboxWorker(outbox, provider, 'bureau-chat', portal,
			schedule, timing, 'telegram-concurrent-b');
		const beforeConcurrent = provider.messages.length;
		const outcomes = await Promise.all([concurrentA.dispatchNext(now), concurrentB.dispatchNext(now)]);
		expect(outcomes.sort()).toEqual(['empty', 'sent']);
		expect(provider.messages).toHaveLength(beforeConcurrent + 1);

		const saturday = '2026-07-25T10:00:00.000Z';
		await db.run(directTelegram('telegram-weekend', { notBefore: saturday, createdAt: saturday }));
		const beforeWeekend = provider.messages.length;
		expect(await worker.dispatchNext(saturday)).toBe('deferred');
		expect(provider.messages).toHaveLength(beforeWeekend);
		expect(await db.first<{ status: string; not_before: string }>({
			sql: `SELECT status, not_before FROM telegram_outbox WHERE id = 'telegram-weekend'`,
		})).toEqual({ status: 'retry', not_before: '2026-07-27T07:00:00.000Z' });
	});

	it('audits idempotent manual recovery without changing the dedupe identity', async () => {
		const before = await db.first<{ dedupe_key: string }>({
			sql: `SELECT dedupe_key FROM telegram_outbox WHERE id = 'telegram-exhausted'`,
		});
		const command = {
			admin, channel: 'telegram' as const, outboxId: 'telegram-exhausted',
			action: 'retry' as const, idempotencyKey: 'outbox-manual-retry-1',
			requestId: 'outbox-retry', now: '2026-07-22T10:05:00.000Z', additionalAttempts: 2,
		};
		expect(await outbox.adminAction(command)).toEqual({ replayed: false });
		expect(await outbox.adminAction(command)).toEqual({ replayed: true });
		expect(await db.first<{ status: string; max_attempts: number;
			manual_retry_count: number; dedupe_key: string }>({
			sql: `SELECT status, max_attempts, manual_retry_count, dedupe_key
			FROM telegram_outbox WHERE id = 'telegram-exhausted'`,
		})).toEqual({ status: 'retry', max_attempts: 3, manual_retry_count: 1,
			dedupe_key: before!.dedupe_key });
		expect(await db.first<{ total: number }>({
			sql: `SELECT COUNT(*) AS total FROM audit_events
			WHERE action = 'outbox.telegram.retry' AND target_id = 'telegram-exhausted'`,
		})).toEqual({ total: 1 });
		const safeRows = await outbox.listAdmin({ channel: 'telegram', q: 'telegram-exhausted' });
		expect(safeRows).toHaveLength(1);
		expect(JSON.stringify(safeRows[0])).not.toContain('@example.test');
		expect(JSON.stringify(safeRows[0])).not.toContain('payload_json');
	});

	it('quarantines ambiguous Telegram delivery and requires audited human reconciliation', async () => {
		await db.run(directTelegram('telegram-unknown', { maxAttempts: 2 }));
		const provider = new FakeTelegramProvider();
		provider.failNext(new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, {
			delivery: 'unknown',
		}));
		const worker = new TelegramOutboxWorker(outbox, provider, 'bureau-chat', portal,
			schedule, timing, 'telegram-unknown-worker');
		expect(await worker.dispatchNext(now)).toBe('delivery_unknown');
		expect(await worker.dispatchNext('2026-07-22T10:01:00.000Z')).toBe('empty');
		expect(provider.messages).toHaveLength(0);

		const unknown = await db.first<{ status: string; attempts: number; state: string }>( {
			sql: `SELECT outbox.status, outbox.attempts, attempt.state
				FROM telegram_outbox outbox JOIN telegram_delivery_attempts attempt
					ON attempt.outbox_id = outbox.id
				WHERE outbox.id = 'telegram-unknown'`,
		});
		expect(unknown).toEqual({
			status: 'delivery_unknown', attempts: 1, state: 'delivery_unknown',
		});
		const rows = await outbox.listAdmin({ channel: 'telegram', status: 'delivery_unknown' });
		expect(rows.find((row) => row.id === 'telegram-unknown')).toMatchObject({
			status: 'delivery_unknown',
			deliveryState: 'delivery_unknown',
		});
		expect(rows.find((row) => row.id === 'telegram-unknown')?.deliveryReference)
			.toMatch(/^TG-[A-F0-9]{12}$/u);
		const unknownAttemptId = rows.find((row) => row.id === 'telegram-unknown')!
			.deliveryAttemptId!;
		await expect(db.run({
			sql: `UPDATE telegram_delivery_attempts SET resolved_at = ?, resolved_by = ?,
				resolution = 'retry_after_review', updated_at = ? WHERE id = ?`,
			params: ['2026-07-22T10:02:00.000Z', admin.id,
				'2026-07-22T10:02:00.000Z', unknownAttemptId],
		})).rejects.toThrow('telegram delivery resolution is immutable');
		expect(await outbox.countUnresolvedTelegramDeliveries()).toBe(1);
		await expect(db.run({
			sql: `UPDATE telegram_delivery_attempts SET id = ? WHERE id = ?`,
			params: ['rewritten-attempt-id', unknownAttemptId],
		})).rejects.toThrow('telegram delivery attempt identity is immutable');
		await expect(db.run({
			sql: `UPDATE telegram_delivery_attempts SET created_at = ? WHERE id = ?`,
			params: ['2026-07-22T10:02:00.000Z', unknownAttemptId],
		})).rejects.toThrow('telegram delivery attempt identity is immutable');
		await expect(db.run({
			sql: `UPDATE telegram_delivery_attempts SET updated_at = ? WHERE id = ?`,
			params: ['2026-07-22T10:02:00.000Z', unknownAttemptId],
		})).rejects.toThrow('telegram delivery attempt update time is immutable');

		await expect(outbox.adminAction({
			admin, channel: 'telegram', outboxId: 'telegram-unknown', action: 'retry',
			idempotencyKey: 'unknown-generic-retry', requestId: 'unknown-generic',
			now: '2026-07-22T10:02:00.000Z', additionalAttempts: 2,
		})).rejects.toMatchObject({ code: 'OUTBOX_ADMIN_ACTION_REJECTED' });

		const resolution = {
			admin,
			outboxId: 'telegram-unknown',
			attemptId: unknownAttemptId,
			action: 'retry_after_review' as const,
			reasonCode: 'message_absence_verified' as const,
			idempotencyKey: 'unknown-reviewed-retry',
			requestId: 'unknown-reviewed',
			now: '2026-07-22T10:03:00.000Z',
			additionalAttempts: 2,
		};
		expect(await outbox.resolveTelegramUnknown(resolution)).toEqual({ replayed: false });
		expect(await outbox.resolveTelegramUnknown(resolution)).toEqual({ replayed: true });
		await expect(db.run({
			sql: `UPDATE telegram_delivery_attempts SET resolution = 'cancel'
				WHERE id = ?`,
			params: [resolution.attemptId],
		})).rejects.toThrow('telegram delivery resolution is immutable');
		await expect(db.run({
			sql: `DELETE FROM telegram_delivery_attempts WHERE id = ?`,
			params: [resolution.attemptId],
		})).rejects.toThrow('telegram delivery attempt is append-only');
		await expect(db.run({
			sql: `DELETE FROM telegram_delivery_resolutions WHERE attempt_id = ?`,
			params: [resolution.attemptId],
		})).rejects.toThrow('telegram delivery resolution is append-only');
		await expect(db.run({
			sql: `DELETE FROM telegram_delivery_resolution_assertions
				WHERE resolution_id = (SELECT id FROM telegram_delivery_resolutions
					WHERE attempt_id = ?)`,
			params: [resolution.attemptId],
		})).rejects.toThrow('telegram delivery resolution assertion is append-only');
		expect(await worker.dispatchNext('2026-07-22T10:03:00.000Z')).toBe('sent');
		expect(provider.messages).toHaveLength(1);
		expect(await db.first<{ total: number }>({
			sql: `SELECT COUNT(*) AS total FROM audit_events
				WHERE action = 'outbox.telegram.retry_after_review'
					AND target_id = 'telegram-unknown'`,
		})).toEqual({ total: 1 });
	});

	it('preserves an audited retry allowance when runtime policy is lower', async () => {
		await db.run(directTelegram('telegram-reviewed-attempt-budget', { maxAttempts: 1 }));
		const provider = new FakeTelegramProvider();
		provider.failNext(new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, {
			delivery: 'unknown',
		}));
		const worker = new TelegramOutboxWorker(outbox, provider, 'bureau-chat', portal,
			schedule, timing, 'telegram-reviewed-budget-worker',
			() => '2026-07-22T10:00:05.000Z');
		expect(await worker.dispatchNext(now)).toBe('delivery_unknown');
		const row = (await outbox.listAdmin({
			channel: 'telegram', q: 'telegram-reviewed-attempt-budget',
		}))[0]!;
		expect(await outbox.resolveTelegramUnknown({
			admin,
			outboxId: row.id,
			attemptId: row.deliveryAttemptId!,
			action: 'retry_after_review',
			reasonCode: 'message_absence_verified',
			idempotencyKey: 'reviewed-budget-retry',
			requestId: 'reviewed-budget-request',
			now: '2026-07-22T10:01:00.000Z',
			additionalAttempts: 5,
		})).toEqual({ replayed: false });

		const claimed = await outbox.claimTelegram({
			now: '2026-07-22T10:01:00.000Z',
			leaseOwner: 'telegram-reviewed-budget-claim',
			leaseUntil: '2026-07-22T10:01:30.000Z',
			maxAttempts: 2,
		});
		expect(claimed).toMatchObject({
			id: 'telegram-reviewed-attempt-budget',
			max_attempts: 6,
		});
		expect(await outbox.deferTelegram({
			id: 'telegram-reviewed-attempt-budget',
			leaseOwner: 'telegram-reviewed-budget-claim',
			notBefore: '2026-07-22T10:02:00.000Z',
			now: '2026-07-22T10:01:01.000Z',
		})).toBe(true);
		await expect(db.run({
			sql: `UPDATE telegram_outbox SET status = 'cancelled', updated_at = ? WHERE id = ?`,
			params: ['2026-07-22T10:01:02.000Z', 'telegram-reviewed-attempt-budget'],
		})).rejects.toThrow('invalid telegram outbox transition');
		expect(await outbox.adminAction({
			admin, channel: 'telegram', outboxId: 'telegram-reviewed-attempt-budget',
			action: 'cancel', idempotencyKey: 'reviewed-budget-cancel',
			requestId: 'reviewed-budget-cancel-request',
			now: '2026-07-22T10:01:03.000Z', additionalAttempts: 1,
		})).toEqual({ replayed: false });
	});

	it('binds an unknown-delivery resolution to the exact reviewed attempt', async () => {
		await db.run(directTelegram('telegram-unknown-attempt-binding'));
		const firstProvider = new FakeTelegramProvider();
		firstProvider.failNext(new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, {
			delivery: 'unknown',
		}));
		const worker = new TelegramOutboxWorker(outbox, firstProvider, 'bureau-chat', portal,
			schedule, timing, 'telegram-attempt-binding-worker');
		expect(await worker.dispatchNext(now)).toBe('delivery_unknown');
		const firstRow = (await outbox.listAdmin({
			channel: 'telegram', q: 'telegram-unknown-attempt-binding',
		}))[0]!;
		const firstResolution = {
			admin, outboxId: firstRow.id, attemptId: firstRow.deliveryAttemptId!,
			action: 'retry_after_review' as const,
			reasonCode: 'message_absence_verified' as const,
			idempotencyKey: 'unknown-binding-first-review', requestId: 'binding-first',
			now: '2026-07-22T10:01:00.000Z', additionalAttempts: 2,
		};
		expect(await outbox.resolveTelegramUnknown(firstResolution)).toEqual({ replayed: false });
		const secondProvider = new FakeTelegramProvider();
		secondProvider.failNext(new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, {
			delivery: 'unknown',
		}));
		const secondWorker = new TelegramOutboxWorker(outbox, secondProvider, 'bureau-chat', portal,
			schedule, timing, 'telegram-attempt-binding-worker-2');
		expect(await secondWorker.dispatchNext('2026-07-22T10:01:00.000Z'))
			.toBe('delivery_unknown');
		const secondRow = (await outbox.listAdmin({
			channel: 'telegram', q: 'telegram-unknown-attempt-binding',
		}))[0]!;
		expect(secondRow.deliveryAttemptId).not.toBe(firstRow.deliveryAttemptId);
		await expect(outbox.resolveTelegramUnknown({
			...firstResolution,
			idempotencyKey: 'unknown-binding-stale-review',
			requestId: 'binding-stale',
			now: '2026-07-22T10:02:00.000Z',
		})).rejects.toMatchObject({ code: 'TELEGRAM_DELIVERY_UNKNOWN_NOT_FOUND' });
		expect((await outbox.listAdmin({ channel: 'telegram', q: secondRow.id }))[0])
			.toMatchObject({
				status: 'delivery_unknown', deliveryAttemptId: secondRow.deliveryAttemptId,
			});
		expect(await outbox.resolveTelegramUnknown({
			admin, outboxId: secondRow.id, attemptId: secondRow.deliveryAttemptId!,
			action: 'cancel', reasonCode: 'delivery_abandoned',
			idempotencyKey: 'unknown-binding-second-cancel', requestId: 'binding-second-cancel',
			now: '2026-07-22T10:03:00.000Z', additionalAttempts: 1,
		})).toEqual({ replayed: false });
	});

	it('never reclaims a stale Telegram lease after the dispatch marker', async () => {
		await db.run(directTelegram('telegram-stale-after-dispatch'));
		const claimed = await outbox.claimTelegram({
			now,
			leaseOwner: 'telegram-abandoned-after-dispatch',
			leaseUntil: '2026-07-22T10:00:30.000Z',
		});
		expect(claimed).toMatchObject({ id: 'telegram-stale-after-dispatch' });
		expect(await outbox.startTelegramDispatch({
			id: 'telegram-stale-after-dispatch',
			leaseOwner: 'telegram-abandoned-after-dispatch',
			deliveryReference: 'TG-ABCDEF123456',
			now,
		})).not.toBeNull();
		expect(await outbox.claimTelegram({
			now: '2026-07-22T10:00:31.000Z',
			leaseOwner: 'telegram-reclaimer',
			leaseUntil: '2026-07-22T10:01:01.000Z',
		})).toBeNull();
		expect(await db.first<{ status: string; last_error_code: string }>( {
			sql: `SELECT status, last_error_code FROM telegram_outbox
				WHERE id = 'telegram-stale-after-dispatch'`,
		})).toEqual({
			status: 'delivery_unknown', last_error_code: 'TELEGRAM_DELIVERY_UNKNOWN',
		});
		const row = (await outbox.listAdmin({
			channel: 'telegram', q: 'telegram-stale-after-dispatch',
		}))[0]!;
		expect(await outbox.resolveTelegramUnknown({
			admin, outboxId: row.id, attemptId: row.deliveryAttemptId!,
			action: 'cancel', reasonCode: 'delivery_abandoned',
			idempotencyKey: 'stale-after-dispatch-cancel',
			requestId: 'stale-after-dispatch-cancel',
			now: '2026-07-22T10:00:32.000Z', additionalAttempts: 1,
		})).toEqual({ replayed: false });
	});

	it('rejects Telegram success or ambiguity transitions without durable evidence', async () => {
		await db.run(directTelegram('telegram-transition-evidence'));
		const claimed = await outbox.claimTelegram({
			now, leaseOwner: 'telegram-transition-worker',
			leaseUntil: '2026-07-22T10:00:30.000Z',
		});
		expect(claimed).toMatchObject({ id: 'telegram-transition-evidence' });
		for (const status of ['sent', 'retry', 'dead', 'delivery_unknown'] as const) {
			await expect(db.run({
				sql: `UPDATE telegram_outbox SET status = ? WHERE id = ?`,
				params: [status, 'telegram-transition-evidence'],
			})).rejects.toThrow('invalid telegram outbox transition');
		}
		expect(await outbox.startTelegramDispatch({
			id: 'telegram-transition-evidence', leaseOwner: 'telegram-transition-worker',
			deliveryReference: 'TG-ABCDEF654321', now,
		})).not.toBeNull();
		for (const statement of [
			{
				sql: `UPDATE telegram_delivery_attempts SET state = 'delivered',
					finished_at = ?, updated_at = ? WHERE outbox_id = ?`,
				params: [now, now, 'telegram-transition-evidence'],
			},
			{
				sql: `UPDATE telegram_delivery_attempts SET state = 'not_delivered',
					provider_request_id = 'telegram-message:1', safe_error_code = 'REJECTED',
					finished_at = ?, updated_at = ? WHERE outbox_id = ?`,
				params: [now, now, 'telegram-transition-evidence'],
			},
			{
				sql: `UPDATE telegram_delivery_attempts SET state = 'delivery_unknown',
					safe_error_code = 'SOME_OTHER_ERROR', finished_at = ?, updated_at = ?
					WHERE outbox_id = ?`,
				params: [now, now, 'telegram-transition-evidence'],
			},
		]) {
			await expect(db.run(statement)).rejects.toThrow();
		}
		await expect(db.run({
			sql: `UPDATE telegram_delivery_attempts SET state = 'delivered',
				provider_request_id = 'telegram-message:transition-proof',
				finished_at = ?, updated_at = ? WHERE outbox_id = ?`,
			params: [now, now, 'telegram-transition-evidence'],
		})).resolves.toMatchObject({ meta: { changes: 1 } });
		for (const status of ['sent', 'retry', 'dead', 'delivery_unknown'] as const) {
			await expect(db.run({
				sql: `UPDATE telegram_outbox SET status = ? WHERE id = ?`,
				params: [status, 'telegram-transition-evidence'],
			})).rejects.toThrow('invalid telegram outbox transition');
		}
		for (const unrelatedMutation of [
			'max_attempts = max_attempts + 1',
			'manual_retry_count = manual_retry_count + 1',
			"not_before = '2026-07-22T11:00:00.000Z'",
		]) {
			await expect(db.run({
				sql: `UPDATE telegram_outbox SET status = 'sent', attempts = attempts + 1,
					sent_at = ?, provider_request_id = 'telegram-message:transition-proof',
					last_error_code = NULL, next_attempt_at = NULL, locked_at = NULL,
					lease_owner = NULL, lease_until = NULL, updated_at = ?,
					${unrelatedMutation} WHERE id = ?`,
				params: [now, now, 'telegram-transition-evidence'],
			})).rejects.toThrow('invalid telegram outbox transition');
		}
		await expect(db.run({
			sql: `UPDATE telegram_outbox SET status = 'sent', attempts = attempts + 1,
				sent_at = ?, provider_request_id = 'telegram-message:transition-proof',
				last_error_code = NULL, next_attempt_at = NULL, locked_at = NULL,
				lease_owner = NULL, lease_until = NULL, updated_at = ? WHERE id = ?`,
			params: [now, now, 'telegram-transition-evidence'],
		})).resolves.toMatchObject({ meta: { changes: 1 } });
	});

	it('rejects forged claims, unaudited recovery, and terminal evidence rewrites', async () => {
		await expect(db.run({
			sql: `INSERT INTO telegram_outbox
				(id, source_kind, source_id, template_or_category, destination_ref, locale,
				 payload_json, dedupe_key, not_before, status, attempts, max_attempts,
				 provider_request_id, sent_at, created_at, updated_at)
			VALUES ('telegram-forged-initial-terminal', 'fixture', 'fixture-source',
				'bureau.support', 'bureau', 'de', '{}', 'forged-initial-terminal', ?,
				'sent', 1, 3, 'forged-provider-id', ?, ?, ?)`,
			params: [now, now, now, now],
		})).rejects.toThrow('invalid telegram outbox initial state');
		await db.run(directTelegram('telegram-claim-invariants'));
		for (const statement of [
			{
				sql: `UPDATE telegram_outbox SET status = 'processing', updated_at = ? WHERE id = ?`,
				params: [now, 'telegram-claim-invariants'],
			},
			{
				sql: `UPDATE telegram_outbox SET status = 'processing', locked_at = ?,
					lease_owner = 'forged-claim', lease_until = ?, updated_at = ? WHERE id = ?`,
				params: [now, now, now, 'telegram-claim-invariants'],
			},
		]) {
			await expect(db.run(statement)).rejects.toThrow('invalid telegram outbox transition');
		}
		await db.run(directTelegram('telegram-future-claim', {
			notBefore: '2026-07-22T11:00:00.000Z',
		}));
		await expect(db.run({
			sql: `UPDATE telegram_outbox SET status = 'processing', locked_at = ?,
				lease_owner = 'forged-future', lease_until = ?, updated_at = ? WHERE id = ?`,
			params: [now, '2026-07-22T10:00:30.000Z', now, 'telegram-future-claim'],
		})).rejects.toThrow('invalid telegram outbox transition');
		for (const statement of [
			{
				sql: `UPDATE telegram_outbox SET not_before = ?, next_attempt_at = ?,
					updated_at = ? WHERE id = ?`,
				params: [now, now, '2026-07-22T10:00:01.000Z', 'telegram-future-claim'],
			},
			{
				sql: `UPDATE telegram_outbox SET max_attempts = max_attempts + 1,
					updated_at = ? WHERE id = ?`,
				params: ['2026-07-22T10:00:01.000Z', 'telegram-future-claim'],
			},
			{
				sql: `UPDATE telegram_outbox SET attempts = attempts + 1,
					last_error_code = 'FORGED', updated_at = ? WHERE id = ?`,
				params: ['2026-07-22T10:00:01.000Z', 'telegram-future-claim'],
			},
		]) {
			await expect(db.run(statement))
				.rejects.toThrow('invalid telegram outbox pending/retry update');
		}
		await expect(db.run({
			sql: `UPDATE telegram_outbox SET not_before = ?, next_attempt_at = ?,
				updated_at = ? WHERE id = ?`,
			params: ['2026-07-22T12:00:00.000Z', '2026-07-22T12:00:00.000Z',
				'2026-07-22T10:00:01.000Z', 'telegram-future-claim'],
		})).resolves.toMatchObject({ meta: { changes: 1 } });
		await expect(db.run({
			sql: `UPDATE telegram_outbox SET status = 'cancelled', next_attempt_at = NULL,
				locked_at = NULL, lease_owner = NULL, lease_until = NULL,
				updated_at = ? WHERE id = ?`,
			params: ['2026-07-22T10:05:00.000Z', 'telegram-claim-invariants'],
		})).rejects.toThrow('invalid telegram outbox transition');
		expect(await outbox.adminAction({
			admin, channel: 'telegram', outboxId: 'telegram-claim-invariants',
			action: 'cancel', idempotencyKey: 'telegram-authorized-cancel',
			requestId: 'telegram-authorized-cancel',
			now: '2026-07-22T10:05:01.000Z', additionalAttempts: 1,
		})).toEqual({ replayed: false });

		await db.run(directTelegram('telegram-outcome-field-invariants'));
		expect(await outbox.claimTelegram({
			now, leaseOwner: 'telegram-outcome-field-worker',
			leaseUntil: '2026-07-22T10:00:30.000Z',
		})).toMatchObject({ id: 'telegram-outcome-field-invariants' });
		await expect(db.run({
			sql: `INSERT INTO telegram_delivery_attempts
				(id, outbox_id, attempt_no, delivery_reference, lease_owner, state,
				 provider_request_id, started_at, finished_at, created_at, updated_at)
			VALUES ('telegram-forged-terminal-attempt', 'telegram-outcome-field-invariants',
				1, 'TG-ABCDEF123456', 'telegram-outcome-field-worker', 'delivered',
				'forged-provider-id', ?, ?, ?, ?)`,
			params: [now, now, now, now],
		})).rejects.toThrow('invalid telegram delivery attempt initial state');
		for (const unrelatedMutation of [
			'max_attempts = max_attempts + 1',
			'manual_retry_count = manual_retry_count + 1',
		]) {
			await expect(db.run({
				sql: `UPDATE telegram_outbox SET status = 'retry', not_before = ?,
					next_attempt_at = ?, locked_at = NULL, lease_owner = NULL,
					lease_until = NULL, updated_at = ?, ${unrelatedMutation} WHERE id = ?`,
				params: ['2026-07-22T10:10:00.000Z', '2026-07-22T10:10:00.000Z',
					'2026-07-22T10:00:01.000Z', 'telegram-outcome-field-invariants'],
			})).rejects.toThrow('invalid telegram outbox transition');
		}
		expect(await outbox.deferTelegram({
			id: 'telegram-outcome-field-invariants',
			leaseOwner: 'telegram-outcome-field-worker',
			notBefore: '2026-07-22T10:10:00.000Z',
			now: '2026-07-22T10:00:01.000Z',
		})).toBe(true);
		expect(await outbox.adminAction({
			admin, channel: 'telegram', outboxId: 'telegram-outcome-field-invariants',
			action: 'cancel', idempotencyKey: 'telegram-outcome-field-cancel',
			requestId: 'telegram-outcome-field-cancel',
			now: '2026-07-22T10:05:02.000Z', additionalAttempts: 1,
		})).toEqual({ replayed: false });

		await db.run(directTelegram('telegram-unaudited-recovery', { maxAttempts: 1 }));
		const provider = new FakeTelegramProvider();
		provider.failNext(new TelegramProviderError('TELEGRAM_REQUEST_REJECTED', false));
		const worker = new TelegramOutboxWorker(outbox, provider, 'bureau-chat', portal,
			schedule, timing, 'telegram-unaudited-recovery-worker');
		expect(await worker.dispatchNext(now)).toBe('dead');
		await expect(db.run({
			sql: `UPDATE telegram_outbox SET status = 'retry', max_attempts = attempts + 1,
				next_attempt_at = ?, locked_at = NULL, lease_owner = NULL,
				lease_until = NULL, manual_retry_count = manual_retry_count + 1,
				updated_at = ? WHERE id = ?`,
			params: ['2026-07-22T10:05:00.000Z', '2026-07-22T10:05:00.000Z',
				'telegram-unaudited-recovery'],
		})).rejects.toThrow('invalid telegram outbox transition');
		expect(await outbox.adminAction({
			admin, channel: 'telegram', outboxId: 'telegram-unaudited-recovery',
			action: 'retry', idempotencyKey: 'telegram-authorized-recovery',
			requestId: 'telegram-authorized-recovery',
			now: '2026-07-22T10:06:00.000Z', additionalAttempts: 2,
		})).toEqual({ replayed: false });
		await expect(db.run({
			sql: `UPDATE telegram_outbox SET last_error_code = 'FORGED'
				WHERE id = 'telegram-claim-invariants'`,
		})).rejects.toThrow('telegram outbox terminal evidence is immutable');
		await expect(db.run({
			sql: `DELETE FROM telegram_outbox WHERE id = 'telegram-claim-invariants'`,
		})).rejects.toThrow('telegram outbox is append-only');
	});

	it('does not resend after provider success when the sent-state write is uncertain', async () => {
		await db.run(directTelegram('telegram-commit-unknown'));
		const provider = new FakeTelegramProvider();
		const worker = new TelegramOutboxWorker(outbox, provider, 'bureau-chat', portal,
			schedule, timing, 'telegram-commit-worker');
		const original = outbox.markTelegramSent.bind(outbox);
		const sentSpy = vi.spyOn(outbox, 'markTelegramSent')
			.mockRejectedValueOnce(new Error('synthetic ambiguous D1 result'));
		expect(await worker.dispatchNext(now)).toBe('delivery_unknown');
		sentSpy.mockImplementation(original);
		expect(provider.messages).toHaveLength(1);
		expect(await worker.dispatchNext('2026-07-22T10:01:00.000Z')).toBe('empty');
		expect(provider.messages).toHaveLength(1);
		sentSpy.mockRestore();
		const row = (await outbox.listAdmin({
			channel: 'telegram', q: 'telegram-commit-unknown',
		}))[0]!;
		expect(await outbox.resolveTelegramUnknown({
			admin, outboxId: row.id, attemptId: row.deliveryAttemptId!,
			action: 'confirm_sent', reasonCode: 'message_found_in_destination',
			idempotencyKey: 'commit-unknown-confirm-sent',
			requestId: 'commit-unknown-confirm-sent',
			now: '2026-07-22T10:01:01.000Z', additionalAttempts: 1,
		})).toEqual({ replayed: false });
	});

	it('fails closed before the provider when a Telegram row is not minimized', async () => {
		await db.run(directTelegram('telegram-pii-boundary', {
			extraPayload: { freeText: 'synthetic-forbidden-field' },
		}));
		const provider = new FakeTelegramProvider();
		const worker = new TelegramOutboxWorker(
			outbox, provider, 'bureau-chat', portal, schedule, timing,
			'telegram-pii-boundary-worker', () => now
		);
		expect(await worker.dispatchNext()).toBe('dead');
		expect(provider.messages).toHaveLength(0);
		expect(await db.first<{ attempts: number; total: number }>({
			sql: `SELECT outbox.attempts,
				(SELECT COUNT(*) FROM telegram_delivery_attempts attempt
					WHERE attempt.outbox_id = outbox.id) AS total
			FROM telegram_outbox outbox WHERE outbox.id = 'telegram-pii-boundary'`,
		})).toEqual({ attempts: 1, total: 0 });
	});

	it('records Telegram completion and retry timing from the post-provider clock', async () => {
		await db.run(directTelegram('telegram-completion-clock'));
		const provider = new FakeTelegramProvider();
		provider.failNext(new TelegramProviderError('TELEGRAM_RATE_LIMITED', true, {
			retryAfterSeconds: 120,
		}));
		const instants = [now, '2026-07-22T10:00:05.000Z'];
		const worker = new TelegramOutboxWorker(
			outbox, provider, 'bureau-chat', portal, schedule, timing,
			'telegram-completion-clock-worker', () => instants.shift() ?? instants.at(-1)!
		);
		expect(await worker.dispatchNext()).toBe('retry');
		expect(await db.first<{
			started_at: string; finished_at: string; next_attempt_at: string;
		}>({
			sql: `SELECT attempt.started_at, attempt.finished_at, outbox.next_attempt_at
				FROM telegram_delivery_attempts attempt
				JOIN telegram_outbox outbox ON outbox.id = attempt.outbox_id
				WHERE outbox.id = 'telegram-completion-clock'`,
		})).toEqual({
			started_at: now,
			finished_at: '2026-07-22T10:00:05.000Z',
			next_attempt_at: '2026-07-22T10:02:05.000Z',
		});
	});

	it('rejects a stale parent actor after the authoritative role becomes admin', async () => {
		const payload = {
			category: 'technical',
			subject: 'Synthetic stale-role check',
			message: 'Synthetic message body',
			idempotencyKey: 'stale-role-message-create',
		};
		const created = await messages.createThread({
			actor: parent,
			payload,
			requestId: 'stale-role-message-parent',
			now,
		});
		await db.run({
			sql: `UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?`,
			params: [now, parent.id],
		});
		try {
			await expect(messages.createThread({
				actor: parent,
				payload,
				requestId: 'stale-role-message-admin',
				now,
			})).rejects.toMatchObject({ code: 'SUPPORT_THREAD_CREATE_REJECTED' });
			expect(await repository.listOwnerThreads(parent.id)).toEqual([]);
			expect(await db.first<{ total: number }>({
				sql: `SELECT COUNT(*) AS total FROM support_actions
					WHERE actor_user_id = ? AND idempotency_key = ?`,
				params: [parent.id, payload.idempotencyKey],
			})).toEqual({ total: 1 });
			expect(created.replayed).toBe(false);
		} finally {
			await db.run({
				sql: `UPDATE users SET role = 'parent', updated_at = ? WHERE id = ?`,
				params: [now, parent.id],
			});
		}
	});

	it('persists a monotonic Telegram activation floor across runtime config changes', async () => {
		const isolated = await createMigratedTestD1();
		const activationDb = new DatabaseBoundary(isolated.db);
		const activationOutbox = new OutboxRepository(activationDb);
		try {
			const initialCutoff = '2026-07-22T10:00:10.000Z';
			await activationDb.run(directTelegram('telegram-before-activation', {
				createdAt: '2026-07-22T10:00:09.000Z',
			}));
			expect(await activationOutbox.claimTelegram({
				now: '2026-07-22T10:20:00.000Z', leaseOwner: 'activation-floor-initial',
				leaseUntil: '2026-07-22T10:20:30.000Z', activationAt: initialCutoff,
			})).toBeNull();
			await expect(activationOutbox.claimTelegram({
				now: '2026-07-22T10:21:00.000Z', leaseOwner: 'activation-floor-backward',
				leaseUntil: '2026-07-22T10:21:30.000Z',
				activationAt: '2026-07-22T10:00:05.000Z',
			})).rejects.toThrow('telegram activation floor cannot move backwards');
			expect(await activationDb.first<{ activation_at: string }>({
				sql: `SELECT activation_at FROM telegram_destination_activation_floors
					WHERE destination_ref = 'bureau'`,
			})).toEqual({ activation_at: initialCutoff });

			const advancedCutoff = '2026-07-22T10:00:20.000Z';
			expect(await activationOutbox.claimTelegram({
				now: '2026-07-22T10:31:00.000Z', leaseOwner: 'activation-floor-advance',
				leaseUntil: '2026-07-22T10:31:30.000Z', activationAt: advancedCutoff,
			})).toBeNull();
			expect(await activationDb.first<{ activation_at: string }>({
				sql: `SELECT activation_at FROM telegram_destination_activation_floors
					WHERE destination_ref = 'bureau'`,
			})).toEqual({ activation_at: advancedCutoff });
			await activationDb.run(directTelegram('telegram-after-activation', {
				createdAt: '2026-07-22T10:00:30.000Z',
			}));
			expect(await activationOutbox.claimTelegram({
				now: '2026-07-22T10:31:00.000Z', leaseOwner: 'activation-floor-current',
				leaseUntil: '2026-07-22T10:31:30.000Z', activationAt: advancedCutoff,
			})).toMatchObject({ id: 'telegram-after-activation' });
		} finally {
			await isolated.dispose();
		}
	});

	it('binds ordinary Telegram claims to the durable configured retry policy', async () => {
		const isolated = await createMigratedTestD1();
		const policyDb = new DatabaseBoundary(isolated.db);
		const policyOutbox = new OutboxRepository(policyDb);
		try {
			await policyDb.run(directTelegram('telegram-policy-bound', { maxAttempts: 5 }));
			expect(await policyOutbox.claimTelegram({
				now, leaseOwner: 'telegram-policy-first',
				leaseUntil: '2026-07-22T10:00:30.000Z', maxAttempts: 2,
			})).toMatchObject({ id: 'telegram-policy-bound', max_attempts: 2 });
			expect(await policyOutbox.deferTelegram({
				id: 'telegram-policy-bound', leaseOwner: 'telegram-policy-first',
				notBefore: '2026-07-22T10:01:00.000Z',
				now: '2026-07-22T10:00:01.000Z',
			})).toBe(true);
			await expect(policyDb.run({
				sql: `UPDATE telegram_outbox SET status = 'processing', locked_at = ?,
					lease_owner = ?, lease_until = ?, max_attempts = 9, updated_at = ?
					WHERE id = ?`,
				params: ['2026-07-22T10:02:00.000Z', 'telegram-policy-forged',
					'2026-07-22T10:02:30.000Z', '2026-07-22T10:02:00.000Z',
					'telegram-policy-bound'],
			})).rejects.toThrow('invalid telegram outbox transition');
			expect(await policyOutbox.claimTelegram({
				now: '2026-07-22T10:03:00.000Z', leaseOwner: 'telegram-policy-lowered',
				leaseUntil: '2026-07-22T10:03:30.000Z', maxAttempts: 1,
			})).toMatchObject({ id: 'telegram-policy-bound', max_attempts: 1 });
			expect(await policyDb.first<{ configured_max_attempts: number }>({
				sql: `SELECT configured_max_attempts FROM telegram_destination_policies
					WHERE destination_ref = 'bureau'`,
			})).toEqual({ configured_max_attempts: 1 });
		} finally {
			await isolated.dispose();
		}
	});

	it('never lets ordinary cron reclaim a partially authorized preview smoke row', async () => {
		const isolated = await createMigratedTestD1();
		const smokeDb = new DatabaseBoundary(isolated.db);
		const smokeOutbox = new OutboxRepository(smokeDb);
		const cohortId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
		const fingerprint = 'b'.repeat(64);
		const dedupeKey = `telegram-preview-smoke:${fingerprint}:${cohortId}`;
		const smokeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
		const leaseOwner = `telegram-preview-smoke:${cohortId}`;
		try {
			await smokeDb.run({
				sql: `INSERT INTO telegram_outbox
					(id, source_kind, source_id, template_or_category, destination_ref, locale,
					 payload_json, dedupe_key, not_before, status, attempts, max_attempts,
					 created_at, updated_at)
				VALUES (?, 'support_thread', ?, 'bureau.support', 'bureau', 'de', '{}', ?,
					'9999-12-31T23:59:59.999Z', 'pending', 0, 1, ?, ?)`,
				params: [smokeId, cohortId, dedupeKey, now, now],
			});
			await smokeDb.run({
				sql: `INSERT INTO telegram_preview_smoke_claim_authorizations
					(id, outbox_id, source_id, dedupe_key, target_fingerprint_sha256,
					 activation_at, lease_owner, locked_at, lease_until, reviewed_by,
					 reason_code, request_hash_sha256, provider_send_disabled, created_at)
				VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', ?, ?, ?, ?, ?, ?, ?, ?,
					'preview-reviewer', 'preview_synthetic_smoke', ?, 1, ?)`,
				params: [smokeId, cohortId, dedupeKey, fingerprint, now, leaseOwner, now,
					'2026-07-22T10:00:30.000Z', 'e'.repeat(64), now],
			});
			await smokeDb.run({
				sql: `UPDATE telegram_outbox SET status = 'processing', not_before = ?,
					locked_at = ?, lease_owner = ?, lease_until = ?, updated_at = ?
					WHERE id = ?`,
				params: [now, now, leaseOwner, '2026-07-22T10:00:30.000Z', now, smokeId],
			});
			expect(await smokeOutbox.claimTelegram({
				now: '2026-07-22T10:01:00.000Z', leaseOwner: 'ordinary-cron',
				leaseUntil: '2026-07-22T10:01:30.000Z',
			})).toBeNull();
			await expect(smokeDb.run({
				sql: `UPDATE telegram_outbox SET locked_at = ?, lease_owner = ?,
					lease_until = ?, updated_at = ? WHERE id = ?`,
				params: ['2026-07-22T10:01:00.000Z', 'forged-ordinary-reclaim',
					'2026-07-22T10:01:30.000Z', '2026-07-22T10:01:00.000Z', smokeId],
			})).rejects.toThrow('invalid telegram outbox processing reclaim');
			expect(await smokeDb.first<{ status: string; assertions: number }>({
				sql: `SELECT outbox.status,
					(SELECT COUNT(*) FROM telegram_preview_smoke_claim_assertions assertion
					 WHERE assertion.outbox_id = outbox.id) AS assertions
				FROM telegram_outbox outbox WHERE outbox.id = ?`,
				params: [smokeId],
			})).toEqual({ status: 'processing', assertions: 0 });
		} finally {
			await isolated.dispose();
		}
	});
});

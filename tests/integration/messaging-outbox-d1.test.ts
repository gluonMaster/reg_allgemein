import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
} = {}) {
	const createdAt = input.createdAt ?? now;
	return {
		sql: `INSERT INTO telegram_outbox
			(id, source_kind, source_id, template_or_category, destination_ref, locale,
			 payload_json, dedupe_key, not_before, status, attempts, max_attempts,
			 created_at, updated_at)
		VALUES (?, 'fixture', ?, 'bureau.support', 'bureau', 'de', ?, ?, ?,
			'pending', 0, ?, ?, ?)`,
		params: [id, id, JSON.stringify({ category: 'technical', reference: id,
			receivedAt: createdAt, adminPath: `/admin/messages/${id}` }),
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
			sql: `UPDATE telegram_outbox SET status = 'cancelled', updated_at = ?
			WHERE status IN ('pending', 'retry')`, params: [now],
		});
		await db.run(directTelegram('telegram-transient', { createdAt: '2026-07-22T09:00:00.000Z', maxAttempts: 2 }));
		const provider = new FakeTelegramProvider();
		provider.failNext(new TelegramProviderError('TELEGRAM_TEMPORARY', true));
		const worker = new TelegramOutboxWorker(outbox, provider, 'bureau-chat', portal,
			schedule, timing, 'telegram-worker-1');
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
});

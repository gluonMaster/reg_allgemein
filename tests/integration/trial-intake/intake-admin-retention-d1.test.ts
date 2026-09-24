import { afterSeconds } from '$lib/trial-intake/server/service.server';
import { IntakeAdmin } from '$lib/trial-intake/server/admin.server';
import { closedLessonIds } from '$lib/trial-intake/server/closed.server';
import { cleanupIntake } from '$lib/trial-intake/server/cleanup.server';
import { createOutboxRuntime } from '$lib/server/outbox/runtime';
import { requireAdmin } from '$lib/server/security/authorization';
import {
	useIntakeD1,
	NOW,
	lessons,
	actor,
	db,
	service,
	data,
	config,
	verified,
	seedAdmin,
} from './intake-harness';

useIntakeD1();

describe('intake admin and retention', () => {
	it('an admin closes a full lesson, the portal refuses it and reopening is audited', async () => {
		await seedAdmin();
		const admin = new IntakeAdmin(service);
		const closedIds = () => closedLessonIds(db, lessons);
		expect(await closedIds()).toEqual([]);
		await admin.setLessonClosed(actor, lessons[0], true, 'test', NOW);
		expect(await closedIds()).toEqual([lessons[0].id]);
		// Repeating the same closure stays a no-op instead of failing the admin action.
		await admin.setLessonClosed(actor, lessons[0], true, 'test', NOW);
		expect((await admin.closedLessons(actor)).length).toBe(1);
		await expect(
			service.create(data(), async () => lessons, NOW, closedIds)
		).rejects.toMatchObject({ code: 'INTAKE_LESSON_CLOSED', status: 409 });
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_requests',
				})
			)?.n
		).toBe(0);
		await expect(
			admin.setLessonClosed(undefined, lessons[0], false, 'test', NOW)
		).rejects.toThrow();
		await admin.setLessonClosed(actor, lessons[0], false, 'test', NOW);
		expect(await closedIds()).toEqual([]);
		// The other lesson stays available throughout, and both actions are audited.
		expect((await service.create(data(), async () => lessons, NOW, closedIds)).state).toBe(
			'pending_email'
		);
		const audited = (
			await db.all<{ action: string }>({
				sql: `SELECT action FROM audit_events WHERE action LIKE 'trial_intake.lesson_%' ORDER BY created_at, action`,
			})
		).results.map((row) => row.action);
		expect(audited).toEqual([
			'trial_intake.lesson_closed',
			'trial_intake.lesson_closed',
			'trial_intake.lesson_reopened',
		]);
	});
	it('admin filters any assigned child, pagination/sorts and idempotent reversible processing are audited', async () => {
		await seedAdmin();
		const r = await verified();
		const admin = new IntakeAdmin(service);
		await expect(admin.list(undefined, {}, 'test', NOW)).rejects.toMatchObject({
			code: 'AUTHENTICATION_REQUIRED',
		});
		await expect(
			admin.detail({ ...actor, role: 'parent' }, r.id, 'test', NOW)
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(
			(
				await admin.list(
					actor,
					{
						childLastName: 'alpha',
						subject: 'Musik',
						teacher: 'Lehrkraft A',
						building: 'Kolibri',
						weekday: 4,
					},
					'test',
					NOW
				)
			).rows
		).toHaveLength(1);
		expect(
			(await admin.list(actor, { childLastName: 'alpha', subject: 'Kunst' }, 'test', NOW))
				.rows
		).toHaveLength(0);
		for (const sort of ['received', 'subject', 'teacher', 'day', 'parent', 'child'])
			for (const direction of ['asc', 'desc'])
				expect(
					(await admin.list(actor, { sort, direction }, 'test', NOW)).rows
				).toHaveLength(2);
		await admin.setProcessed(actor, r.id, true, 'test', NOW);
		await admin.setProcessed(actor, r.id, true, 'test', afterSeconds(NOW, 60));
		expect((await service.get(r.id))?.delete_after).toBe(afterSeconds(NOW, 90 * 86400));
		await admin.setProcessed(actor, r.id, false, 'test', NOW);
		expect((await service.get(r.id))?.delete_after).toBeNull();
		const audits = (
			await db.all<{ safe_diff_json: string }>({
				sql: "SELECT safe_diff_json FROM audit_events WHERE action = 'trial_intake.status_changed'",
			})
		).results;
		expect(audits).toHaveLength(2);
		expect(JSON.stringify(audits)).not.toContain('guest@');
		for (let i = 0; i < 25; i++) await verified();
		const first = await admin.list(actor, { sort: 'child', page: 1 }, 'test', NOW);
		const second = await admin.list(actor, { sort: 'child', page: 2 }, 'test', NOW);
		expect(first.total).toBe(52);
		expect(first.rows).toHaveLength(50);
		expect(second.rows).toHaveLength(2);
		expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(52);
	}, 45_000);
	it('retention deletes PII/cascades and cancels unsent jobs; processed date controls 90-day TTL', async () => {
		await seedAdmin();
		const pending = await service.create(data(), async () => lessons, NOW);
		const active = await verified();
		const done = await verified();
		const admin = new IntakeAdmin(service);
		await admin.setProcessed(actor, done.id, true, 'test', NOW);
		expect(await cleanupIntake(db, afterSeconds(NOW, 14 * 86400 - 1))).toEqual({ deleted: 0 });
		expect(await cleanupIntake(db, afterSeconds(NOW, 14 * 86400))).toEqual({ deleted: 1 });
		expect(await service.get(pending.id)).toBeNull();
		expect(await cleanupIntake(db, afterSeconds(NOW, 90 * 86400))).toEqual({ deleted: 1 });
		expect(await service.get(done.id)).toBeNull();
		expect(await service.get(active.id)).not.toBeNull();
		expect(
			(
				await db.first<{ status: string }>({
					sql: 'SELECT status FROM telegram_outbox WHERE source_id = ?',
					params: [done.id],
				})
			)?.status
		).toBe('cancelled');
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_telegram_payloads WHERE request_id = ?',
					params: [done.id],
				})
			)?.n
		).toBe(0);
	});
	it('in-flight email fences deletion until lease reconciliation, and resend cannot invalidate dispatch', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		const runtime = createOutboxRuntime(config());
		await runtime.repository.claimEmail({
			now: NOW,
			leaseOwner: 'lease',
			leaseUntil: afterSeconds(NOW, 15 * 86400),
		});
		await expect(service.resend(r.id, r.receipt, afterSeconds(NOW, 61))).rejects.toMatchObject({
			status: 409,
		});
		expect(await cleanupIntake(db, afterSeconds(NOW, 14 * 86400))).toEqual({ deleted: 0 });
		expect(await cleanupIntake(db, afterSeconds(NOW, 15 * 86400))).toEqual({ deleted: 1 });
	});
	it('retention fences in-flight Telegram, reconciles ambiguity and permits cancellation but no retry after payload deletion', async () => {
		await seedAdmin();
		const r = await verified();
		await new IntakeAdmin(service).setProcessed(actor, r.id, true, 'test', NOW);
		const due = afterSeconds(NOW, 90 * 86400);
		const outbox = createOutboxRuntime(config()).repository;
		const row = (await outbox.claimTelegram({
			now: NOW,
			leaseOwner: 'synthetic-lease',
			leaseUntil: afterSeconds(due, 60),
		}))!;
		expect(
			await outbox.startTelegramDispatch({
				id: row.id,
				leaseOwner: row.lease_owner,
				deliveryReference: 'TG-ABCDEF123456',
				now: NOW,
			})
		).not.toBeNull();
		expect(await cleanupIntake(db, due)).toEqual({ deleted: 0 });
		const reconciled = afterSeconds(due, 61);
		expect(await cleanupIntake(db, reconciled)).toEqual({ deleted: 1 });
		const ledger = (await outbox.listAdmin({ channel: 'telegram', q: row.id }))[0];
		expect(ledger.status).toBe('delivery_unknown');
		const recovery = {
			admin: requireAdmin(actor),
			outboxId: row.id,
			attemptId: ledger.deliveryAttemptId!,
			reasonCode: 'delivery_abandoned' as const,
			idempotencyKey: 'synthetic-recovery',
			requestId: 'synthetic-recovery',
			now: reconciled,
			additionalAttempts: 1,
		};
		await expect(
			outbox.resolveTelegramUnknown({ ...recovery, action: 'retry_after_review' })
		).rejects.toThrow('INTAKE_PAYLOAD_UNAVAILABLE');
		expect(await outbox.resolveTelegramUnknown({ ...recovery, action: 'cancel' })).toEqual({
			replayed: false,
		});
	});
});

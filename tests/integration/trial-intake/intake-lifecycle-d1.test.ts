import { createMeteredD1 } from '../../helpers/d1';
import { DatabaseBoundary } from '$lib/server/db/database';
import { IntakeService, afterSeconds } from '$lib/trial-intake/server/service.server';
import { lessonIdentity } from '$lib/trial-intake/server/catalog.server';
import {
	useIntakeD1,
	NOW,
	SECRET,
	schedule,
	lessons,
	ctx,
	db,
	service,
	data,
	token,
	verified,
} from './intake-harness';

useIntakeD1();

describe('intake D1 create and verification', () => {
	it('creates all data and guest email atomically; concurrent create/replay is content-bound without users', async () => {
		const input = data();
		const results = await Promise.all([
			service.create(input, async () => lessons, NOW),
			service.create(input, async () => lessons, NOW),
		]);
		expect(results[0]).toEqual(results[1]);
		expect(
			await service.create(
				input,
				async () => {
					throw new Error('offline');
				},
				NOW
			)
		).toEqual(results[0]);
		await expect(
			service.create({ ...input, phone: '+49 111111111' }, async () => lessons, NOW)
		).rejects.toMatchObject({ status: 409 });
		expect((await db.first<{ n: number }>({ sql: 'SELECT COUNT(*) AS n FROM users' }))?.n).toBe(
			0
		);
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_email_outbox',
				})
			)?.n
		).toBe(1);
		expect((await service.detail(results[0].id))?.items.map((i) => i.children.length)).toEqual([
			2, 1,
		]);
		expect(
			(await db.first<{ n: number }>({ sql: 'SELECT COUNT(*) AS n FROM telegram_outbox' }))?.n
		).toBe(0);
	});
	it('rejects a desired date on another weekday, today or in the past', async () => {
		const input = data();
		// The form offers only the lesson's own weekday; the server stays the authority.
		for (const desiredDate of ['2026-09-18', '2026-09-16', '2026-09-10']) {
			await expect(
				service.create(
					{ ...input, items: [{ ...input.items[0], desiredDate }] },
					async () => lessons,
					NOW
				)
			).rejects.toMatchObject({ code: 'INTAKE_DATE_INVALID' });
		}
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_requests',
				})
			)?.n
		).toBe(0);
	});
	it('rolls back the whole create if a child insert fails and rejects cross-request assignments', async () => {
		await db.run({
			sql: `CREATE TRIGGER synthetic_reject_child BEFORE INSERT ON trial_intake_children BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`,
		});
		await expect(service.create(data(), async () => lessons, NOW)).rejects.toThrow();
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_requests',
				})
			)?.n
		).toBe(0);
		await db.run({ sql: 'DROP TRIGGER synthetic_reject_child' });
		const a = await verified();
		const b = await verified();
		const first = (await service.detail(a.id))!;
		const second = (await service.detail(b.id))!;
		await expect(
			db.run({
				sql: 'INSERT INTO trial_intake_item_children VALUES(?,?,?)',
				params: [a.id, first.items[0].id, second.children[0].id],
			})
		).rejects.toThrow();
	});
	it('accepts the maximum 10x10 assignments with bounded D1 queries', async () => {
		const input = data();
		input.children = Array.from({ length: 10 }, (_, i) => ({
			key: `c${i}`,
			firstName: 'Kind',
			lastName: `Synthetic${i}`,
			birthDate: '2020-01-01',
		}));
		const catalog = await Promise.all(
			Array.from({ length: 10 }, async (_, i) => {
				const l = { ...lessons[0], group: `Group ${i}` };
				return { ...l, id: await lessonIdentity(l) };
			})
		);
		input.items = catalog.map((l) => ({
			lessonId: l.id,
			desiredDate: '2026-09-17',
			childKeys: input.children.map((c) => c.key),
		}));
		const metered = createMeteredD1(ctx.db);
		const bounded = new IntakeService(new DatabaseBoundary(metered.database), SECRET, schedule);
		const r = await bounded.create(input, async () => catalog, NOW);
		expect(metered.snapshot().queries).toBeLessThan(10);
		expect((await service.detail(r.id))?.items.every((i) => i.children.length === 10)).toBe(
			true
		);
	});
	it('GET inspection has no effects; concurrent verification creates one notification and never re-fetches catalog', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		const t = await token(r.id);
		expect(await service.inspectToken(t, NOW)).toEqual({ state: 'confirm' });
		expect((await service.get(r.id))?.state).toBe('pending_email');
		await Promise.all([service.verify(t, NOW), service.verify(t, NOW), service.verify(t, NOW)]);
		expect(
			(await db.first<{ n: number }>({ sql: 'SELECT COUNT(*) AS n FROM telegram_outbox' }))?.n
		).toBe(1);
		expect(await service.verify(t, afterSeconds(NOW, 86401))).toMatchObject({
			state: 'accepted',
		});
	});
	it('verification and Telegram queue are one transaction', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		await db.run({
			sql: `CREATE TRIGGER synthetic_reject_telegram BEFORE INSERT ON telegram_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`,
		});
		await expect(service.verify(await token(r.id), NOW)).rejects.toThrow();
		expect((await service.get(r.id))?.state).toBe('pending_email');
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_telegram_payloads',
				})
			)?.n
		).toBe(0);
	});
	it('expires tokens; resend rotates/cancels with cooldown, receipt scope and fixed request TTL', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		const old = await token(r.id);
		await expect(
			service.resend(r.id, 'b'.repeat(64), afterSeconds(NOW, 61))
		).rejects.toMatchObject({ status: 403 });
		await expect(service.resend(r.id, r.receipt, afterSeconds(NOW, 59))).rejects.toMatchObject({
			status: 429,
		});
		expect(await service.inspectToken(old, afterSeconds(NOW, 86400))).toEqual({
			state: 'expired',
		});
		const resends = await Promise.allSettled([
			service.resend(r.id, r.receipt, afterSeconds(NOW, 86401)),
			service.resend(r.id, r.receipt, afterSeconds(NOW, 86401)),
		]);
		expect(resends.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		await expect(service.verify(old, afterSeconds(NOW, 86402))).rejects.toMatchObject({
			status: 410,
		});
		expect(
			(
				await db.first<{ n: number }>({
					sql: "SELECT COUNT(*) AS n FROM trial_intake_email_outbox WHERE status = 'pending'",
				})
			)?.n
		).toBe(1);
		await expect(
			service.resend(r.id, r.receipt, afterSeconds(NOW, 14 * 86400))
		).rejects.toMatchObject({ status: 410 });
	});
});

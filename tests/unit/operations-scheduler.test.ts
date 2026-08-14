import { describe, expect, it } from 'vitest';
import {
	drainOutbox,
	runScheduledJobs,
	scheduledJobNamesForCron,
	TELEGRAM_DRAIN_STOP_OUTCOMES,
} from '$lib/server/operations/scheduler';

describe('operations scheduler', () => {
	it('allows only the tracked cron schedules', () => {
		expect(scheduledJobNamesForCron('* * * * *')).toEqual(['email_outbox', 'telegram_outbox']);
		expect(scheduledJobNamesForCron('*/15 * * * *')).toEqual([
			'price_review',
			'document_quarantine',
			'funding_authorization_expiry',
			'email_reservation_cleanup',
			'privacy_r2_cleanup',
			'security_metadata_cleanup',
			'storage_orphan_cleanup',
		]);
		expect(scheduledJobNamesForCron('0 * * * *')).toBeNull();
		expect(scheduledJobNamesForCron('')).toBeNull();
	});

	it('reads a fresh timestamp before every dispatch after a delayed provider call', async () => {
		let current = '2026-07-22T10:00:00.000Z';
		const seen: string[] = [];

		const result = await drainOutbox(
			async (dispatchNow) => {
				seen.push(dispatchNow);
				if (seen.length === 1) {
					await Promise.resolve();
					current = '2026-07-22T10:01:05.000Z';
					return 'sent';
				}
				if (seen.length === 2) {
					current = '2026-07-22T10:01:06.000Z';
					return 'retry';
				}
				return 'empty';
			},
			3,
			() => current
		);

		expect(seen).toEqual([
			'2026-07-22T10:00:00.000Z',
			'2026-07-22T10:01:05.000Z',
			'2026-07-22T10:01:06.000Z',
		]);
		expect(result).toMatchObject({ claimed: 2, sent: 1, retry: 1 });
	});

	it.each(['delivery_unknown', 'retry', 'dead'] as const)(
		'stops a Telegram drain immediately after %s',
		async (terminalOutcome) => {
			let calls = 0;
			const result = await drainOutbox(
				async () => {
					calls += 1;
					return calls === 1 ? terminalOutcome : 'sent';
				},
				10,
				() => '2026-07-22T10:00:00.000Z',
				TELEGRAM_DRAIN_STOP_OUTCOMES
			);

			expect(calls).toBe(1);
			expect(result.claimed).toBe(1);
			expect(result.sent).toBe(0);
			expect(result[terminalOutcome === 'delivery_unknown'
				? 'deliveryUnknown'
				: terminalOutcome]).toBe(1);
		}
	);

	it('rejects an unaudited manual invocation before touching runtime bindings', async () => {
		await expect(
			runScheduledJobs({} as never, {
				triggerKind: 'manual',
				dedupeKey: 'missing-admin',
				jobNames: ['email_outbox'],
			})
		).rejects.toThrow('MANUAL_JOB_ADMIN_REQUIRED');
	});
});

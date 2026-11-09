import type { DatabaseBoundary } from '$lib/server/db/database';
import { OutboxRepository } from '$lib/server/outbox/outbox-repository';
import { IntakeEmailStore } from './email-store.server';

const due = `((r.state = 'pending_email' AND r.pending_expires_at <= ?) OR (r.state = 'processed' AND r.delete_after <= ?))`;
const idle = `NOT EXISTS(SELECT 1 FROM trial_intake_email_outbox e WHERE e.request_id = r.id AND e.status = 'processing')
 AND NOT EXISTS(SELECT 1 FROM telegram_outbox t WHERE t.source_kind = 'trial_intake' AND t.source_id = r.id AND t.status = 'processing')`;
export async function cleanupIntake(db: DatabaseBoundary, now: string, limit = 50) {
	if (!Number.isInteger(limit) || limit < 1 || limit > 100)
		throw new Error('INTAKE_CLEANUP_LIMIT');
	const outbox = new OutboxRepository(db);
	await outbox.reconcileStaleTelegramDispatches(now, limit);
	await new IntakeEmailStore(db).cancelInvalidEmailRows(now, limit);
	// Reconcile expired leases that never reached provider dispatch, even while sends are stopped.
	const abandoned = (
		await db.all<{ id: string; lease_owner: string }>({
			sql: `SELECT t.id, t.lease_owner FROM telegram_outbox t
	 JOIN trial_intake_requests r ON r.id = t.source_id WHERE t.source_kind = 'trial_intake' AND t.status = 'processing'
	 AND t.lease_until <= ? AND ${due} AND NOT EXISTS(SELECT 1 FROM telegram_delivery_attempts a WHERE a.outbox_id = t.id AND a.state = 'dispatch_started') LIMIT ?`,
			params: [now, now, now, limit],
		})
	).results;
	for (const row of abandoned)
		await outbox.deferTelegram({
			id: row.id,
			leaseOwner: row.lease_owner,
			notBefore: now,
			now,
		});
	// WL-13: a confirmed waiting signup is kept at most 12 months from submission. It becomes a
	// processed request due now, so the deletion below and the Telegram TTL guard of 0027 apply.
	const cutoff = new Date(now);
	cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
	await db.batch([
		{
			sql: `UPDATE trial_intake_requests SET state = 'processed', processed_at = ?, delete_after = ?
		 WHERE id IN (SELECT e.request_id FROM trial_intake_waitlist_entries e JOIN trial_intake_requests r ON r.id = e.request_id
		 WHERE e.status = 'waiting' AND r.state = 'verified' AND e.created_at <= ? LIMIT ?)`,
			params: [now, now, cutoff.toISOString(), limit],
		},
		{
			// A waiting entry of a processed request exists only right after the statement above.
			sql: `UPDATE trial_intake_waitlist_entries SET status = 'expired', status_changed_at = ?
		 WHERE status = 'waiting' AND EXISTS(SELECT 1 FROM trial_intake_requests r
		 WHERE r.id = trial_intake_waitlist_entries.request_id AND r.state = 'processed')`,
			params: [now],
		},
	]);
	const eligible = (
		await db.all<{ id: string }>({
			sql: `SELECT r.id FROM trial_intake_requests r WHERE ${due} AND ${idle} ORDER BY r.created_at, r.id LIMIT ?`,
			params: [now, now, limit],
		})
	).results;
	let deleted = 0;
	for (const { id } of eligible) {
		const auditId = crypto.randomUUID();
		const results = await db.batch([
			{
				sql: `INSERT INTO audit_events(id, actor_kind, action, target_kind, target_id, request_id, safe_diff_json, created_at)
			 SELECT ?, 'system', 'trial_intake.retention_deleted', 'trial_intake', id, ?, '{}', ? FROM trial_intake_requests r
			 WHERE r.id = ? AND ${due} AND ${idle}`,
				params: [auditId, auditId, now, id, now, now],
			},
			{
				sql: `UPDATE telegram_outbox SET status = 'cancelled', next_attempt_at = NULL, locked_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = ?
			 WHERE source_kind = 'trial_intake' AND source_id = ? AND status IN ('pending','retry') AND EXISTS(SELECT 1 FROM audit_events WHERE id = ?)`,
				params: [now, id, auditId],
			},
			{
				sql: `UPDATE trial_intake_email_outbox SET status = 'cancelled', updated_at = ? WHERE request_id = ? AND status IN ('pending','retry') AND EXISTS(SELECT 1 FROM audit_events WHERE id = ?)`,
				params: [now, id, auditId],
			},
			{
				sql: `DELETE FROM trial_intake_requests WHERE id = ? AND EXISTS(SELECT 1 FROM audit_events WHERE id = ?) RETURNING id`,
				params: [id, auditId],
			},
		]);
		// D1 meta.changes also counts cascaded children; report deleted requests only.
		deleted += results[3].results.length;
	}
	return { deleted };
}

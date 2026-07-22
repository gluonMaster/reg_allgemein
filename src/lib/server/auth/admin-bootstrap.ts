import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';

export class AdminBootstrapError extends Error {
	constructor(
		readonly code: string,
		options?: { cause?: unknown }
	) {
		super(code, options);
		this.name = 'AdminBootstrapError';
	}
}

export interface AdminBootstrapInput {
	targetUserId: string;
	reason: string;
	requestId: string;
	now: string;
}

/**
 * Keep the out-of-band remote command and the local repository on the exact
 * same atomic D1 statement set. The remote CLI renders these controlled
 * statements as a parameter-escaped batch after pinning an exact database ID.
 */
export function buildAdminBootstrapStatements(input: AdminBootstrapInput): StatementSpec[] {
	const reason = input.reason.trim();
	if (!reason || reason.length > 200) {
		throw new AdminBootstrapError('ADMIN_BOOTSTRAP_REASON_INVALID');
	}
	const auditId = crypto.randomUUID();
	const actionId = crypto.randomUUID();
	return [
		{
			sql: `UPDATE users SET role = 'admin', session_version = session_version + 1,
				updated_at = ?
			WHERE id = ? AND role = 'parent' AND account_status = 'active'
				AND is_blocked = 0 AND email_verified_at IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin'
					AND account_status = 'active' AND is_blocked = 0)
				AND EXISTS (SELECT 1 FROM admin_bootstrap_control
					WHERE id = 'first-admin' AND status = 'available')`,
			params: [input.now, input.targetUserId],
		},
		{
			sql: `UPDATE auth_sessions SET revoked_at = ?, revocation_reason = 'role_change'
			WHERE user_id = ? AND revoked_at IS NULL
				AND EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'admin'
					AND updated_at = ?)`,
			params: [input.now, input.targetUserId, input.targetUserId, input.now],
		},
		{
			sql: `INSERT INTO audit_events
				(id, actor_user_id, actor_kind, action, target_kind, target_id,
				 request_id, safe_diff_json, created_at)
			SELECT ?, NULL, 'system', 'auth.first_admin_bootstrapped', 'user', id, ?,
				'{"role":"admin","sessions_revoked":true,"oneShot":true}', ?
			FROM users WHERE id = ? AND role = 'admin' AND updated_at = ?
				AND EXISTS (SELECT 1 FROM admin_bootstrap_control
					WHERE id = 'first-admin' AND status = 'available')`,
			params: [auditId, input.requestId, input.now, input.targetUserId, input.now],
		},
		{
			sql: `UPDATE admin_bootstrap_control
			SET status = 'consumed', consumed_by_user_id = ?, consumed_at = ?,
				audit_event_id = ?, updated_at = ?
			WHERE id = 'first-admin' AND status = 'available'
				AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
			params: [input.targetUserId, input.now, auditId, input.now, auditId],
		},
		{
			sql: `INSERT INTO admin_bootstrap_actions
				(id, target_user_id, request_id, reason, audit_event_id, created_at)
			SELECT ?, ?, ?, ?, ?, ? FROM admin_bootstrap_control
			WHERE id = 'first-admin' AND status = 'consumed'
				AND consumed_by_user_id = ? AND audit_event_id = ?`,
			params: [
				actionId,
				input.targetUserId,
				input.requestId,
				reason,
				auditId,
				input.now,
				input.targetUserId,
				auditId,
			],
		},
		{
			sql: `INSERT INTO admin_bootstrap_assertions
				(id, action_id, assertion_passed, created_at)
			VALUES (?, ?, CASE WHEN
				EXISTS (SELECT 1 FROM admin_bootstrap_actions WHERE id = ?)
				AND EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'admin'
					AND account_status = 'active' AND is_blocked = 0)
				AND (SELECT COUNT(*) FROM users WHERE role = 'admin'
					AND account_status = 'active' AND is_blocked = 0) = 1
				AND EXISTS (SELECT 1 FROM admin_bootstrap_control
					WHERE id = 'first-admin' AND status = 'consumed'
						AND consumed_by_user_id = ? AND audit_event_id = ?)
			THEN 1 ELSE 0 END, ?)`,
			params: [
				crypto.randomUUID(),
				actionId,
				actionId,
				input.targetUserId,
				input.targetUserId,
				auditId,
				input.now,
			],
		},
	];
}

export class AdminBootstrapRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async status(): Promise<{
		status: 'available' | 'consumed';
		activeAdminCount: number;
	}> {
		const row = await this.db.first<{
			status: 'available' | 'consumed';
			active_admin_count: number;
		}>({
			sql: `SELECT control.status,
				(SELECT COUNT(*) FROM users WHERE role = 'admin'
					AND account_status = 'active' AND is_blocked = 0) AS active_admin_count
			FROM admin_bootstrap_control control WHERE control.id = 'first-admin'`,
		});
		if (!row) throw new AdminBootstrapError('ADMIN_BOOTSTRAP_CONTROL_MISSING');
		return { status: row.status, activeAdminCount: row.active_admin_count };
	}

	async consume(input: AdminBootstrapInput): Promise<void> {
		try {
			await this.db.batch(buildAdminBootstrapStatements(input));
		} catch (cause) {
			if (cause instanceof AdminBootstrapError) throw cause;
			throw new AdminBootstrapError('ADMIN_BOOTSTRAP_REJECTED', { cause });
		}
	}
}

import { DatabaseBoundary } from '$lib/server/db/database';
import type { AdminActor } from '$lib/server/security/authorization';
import { NO_RETAINED_PARENT_STATE_SQL } from './admin-role-transition';

/**
 * Server-only role assignment boundary. There is intentionally no public route
 * or self-registration field for this operation. Initial bootstrap remains an
 * operator-controlled, feature-disabled release gate until its dedicated
 * procedure is authorized and rehearsed.
 */
export class AdminIdentityRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async assignAdmin(input: {
		actor: AdminActor;
		targetUserId: string;
		reason: string;
		requestId: string;
		now: string;
	}): Promise<boolean> {
		if (!input.reason.trim()) throw new TypeError('Admin assignment reason is required.');

		const results = await this.db.batch([
			{
				sql: `UPDATE users SET role = 'admin', session_version = session_version + 1,
						updated_at = ?
					WHERE id = ? AND role = 'parent' AND account_status = 'active'
						AND is_blocked = 0 AND email_verified_at IS NOT NULL
						AND ${NO_RETAINED_PARENT_STATE_SQL}
						AND EXISTS (
							SELECT 1 FROM users actor
							WHERE actor.id = ? AND actor.role = 'admin'
								AND actor.account_status = 'active' AND actor.is_blocked = 0
						)`,
				params: [input.now, input.targetUserId, input.actor.id],
			},
			{
				sql: `UPDATE auth_sessions SET revoked_at = ?, revocation_reason = 'role_change'
					WHERE user_id = ? AND revoked_at IS NULL
						AND EXISTS (
							SELECT 1 FROM users WHERE id = ? AND role = 'admin' AND updated_at = ?
						)`,
				params: [input.now, input.targetUserId, input.targetUserId, input.now],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'auth.role_assigned', 'user', id, ?,
						'{"role":"admin","sessions_revoked":true}', ? FROM users
					WHERE id = ? AND role = 'admin' AND updated_at = ?
						AND NOT EXISTS (
							SELECT 1 FROM audit_events existing
							WHERE existing.action = 'auth.role_assigned'
								AND existing.target_kind = 'user'
								AND existing.target_id = users.id
						)`,
				params: [
					crypto.randomUUID(),
					input.actor.id,
					input.requestId,
					input.now,
					input.targetUserId,
					input.now,
				],
			},
		]);
		return results[0]?.meta.changes === 1;
	}

	async setBlocked(input: {
		actor: AdminActor;
		targetUserId: string;
		blocked: boolean;
		reason: string;
		requestId: string;
		now: string;
	}): Promise<boolean> {
		if (!input.reason.trim()) throw new TypeError('User block reason is required.');
		const blocked = Number(input.blocked);
		const action = input.blocked ? 'auth.user_blocked' : 'auth.user_unblocked';
		const results = await this.db.batch([
			{
				sql: `UPDATE users SET is_blocked = ?, session_version = session_version + 1,
						updated_at = ?
					WHERE id = ? AND is_blocked <> ? AND account_status = 'active'
						AND EXISTS (
							SELECT 1 FROM users actor
							WHERE actor.id = ? AND actor.role = 'admin'
								AND actor.account_status = 'active' AND actor.is_blocked = 0
						)`,
				params: [blocked, input.now, input.targetUserId, blocked, input.actor.id],
			},
			{
				sql: `UPDATE auth_sessions SET revoked_at = ?, revocation_reason = 'user_blocked'
					WHERE user_id = ? AND revoked_at IS NULL
						AND EXISTS (
							SELECT 1 FROM users WHERE id = ? AND is_blocked = ? AND updated_at = ?
						)`,
				params: [input.now, input.targetUserId, input.targetUserId, blocked, input.now],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', ?, 'user', id, ?, json_object('blocked', ?), ?
					FROM users WHERE id = ? AND is_blocked = ? AND updated_at = ?
						AND NOT EXISTS (
							SELECT 1 FROM audit_events existing
							WHERE existing.request_id = ? AND existing.action = ?
								AND existing.target_id = users.id
						)`,
				params: [
					crypto.randomUUID(),
					input.actor.id,
					action,
					input.requestId,
					blocked,
					input.now,
					input.targetUserId,
					blocked,
					input.now,
					input.requestId,
					action,
				],
			},
		]);
		return results[0]?.meta.changes === 1;
	}
}

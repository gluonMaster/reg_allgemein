import { DatabaseBoundary } from '$lib/server/db/database';
import { redactSensitive } from '$lib/server/observability/redaction';
import { isSha256Hex } from '$lib/server/security/digest';

export interface AppendAuditEvent {
	actorUserId?: string;
	actorKind: 'anonymous' | 'system' | 'user';
	action: string;
	targetKind: string;
	targetId: string;
	requestId: string;
	safeDiff?: Record<string, unknown>;
	ipRetentionValue?: string;
	createdAt: string;
}

export class AuditRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async append(input: AppendAuditEvent): Promise<string> {
		if (input.ipRetentionValue && !isSha256Hex(input.ipRetentionValue)) {
			throw new TypeError('ipRetentionValue must be a SHA-256 hex digest.');
		}

		const id = crypto.randomUUID();
		const safeDiffJson = JSON.stringify(redactSensitive(input.safeDiff ?? {}));

		await this.db.run({
			sql: `INSERT INTO audit_events
				(id, actor_user_id, actor_kind, action, target_kind, target_id,
				 request_id, safe_diff_json, ip_retention_value, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			params: [
				id,
				input.actorUserId ?? null,
				input.actorKind,
				input.action,
				input.targetKind,
				input.targetId,
				input.requestId,
				safeDiffJson,
				input.ipRetentionValue ?? null,
				input.createdAt,
			],
		});

		return id;
	}
}

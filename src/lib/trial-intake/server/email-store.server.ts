import { DatabaseBoundary } from '$lib/server/db/database';
import { OutboxRepository, OutboxRepositoryError } from '$lib/server/outbox/outbox-repository';
import type {
	EmailOutboxRow,
	OutboxClaimInput,
	OutboxFailureInput,
} from '$lib/server/outbox/contracts';
import { renderEmailTemplate, OutboxTemplateError } from '$lib/server/outbox/templates';
import { IntakeService, verificationToken } from './service.server';
import { confirmationEmail, verificationEmail } from './templates.server';
import { ORGANIZATION_NAME } from '$lib/organization';

const valid = `((o.kind = 'verification' AND r.state = 'pending_email' AND r.pending_expires_at > ?
 AND r.verification_expires_at > ? AND r.verification_version = o.verification_version)
 OR (o.kind = 'confirmation' AND r.state IN ('verified','processed') AND (r.delete_after IS NULL OR r.delete_after > ?)))`;
export class IntakeEmailStore extends OutboxRepository {
	constructor(private readonly intakeDb: DatabaseBoundary) {
		super(intakeDb);
	}
	private async requireRetryPayload(id: string, now: string) {
		const row = await this.intakeDb.first<{ source_kind: string; live: number }>({
			sql: `SELECT o.source_kind, EXISTS(SELECT 1 FROM trial_intake_telegram_payloads p JOIN trial_intake_requests r ON r.id = p.request_id
			 WHERE p.id = json_extract(o.payload_json, '$.payloadId') AND (r.delete_after IS NULL OR r.delete_after > ?)) AS live
			 FROM telegram_outbox o WHERE o.id = ?`,
			params: [now, id],
		});
		if (row?.source_kind === 'trial_intake' && !row.live)
			throw new OutboxRepositoryError('INTAKE_PAYLOAD_UNAVAILABLE');
	}
	override async adminAction(input: Parameters<OutboxRepository['adminAction']>[0]) {
		if (input.channel === 'telegram' && input.action === 'retry')
			await this.requireRetryPayload(input.outboxId, input.now);
		return super.adminAction(input);
	}
	override async resolveTelegramUnknown(
		input: Parameters<OutboxRepository['resolveTelegramUnknown']>[0]
	) {
		if (input.action === 'retry_after_review')
			await this.requireRetryPayload(input.outboxId, input.now);
		return super.resolveTelegramUnknown(input);
	}
	override async cancelInvalidEmailRows(now: string, limit = 100) {
		const old = await super.cancelInvalidEmailRows(now, limit);
		const changed = await this.intakeDb.run({
			sql: `UPDATE trial_intake_email_outbox SET status = 'cancelled', lease_owner = NULL, lease_until = NULL, updated_at = ?
		 WHERE id IN (SELECT o.id FROM trial_intake_email_outbox o JOIN trial_intake_requests r ON r.id = o.request_id
		 WHERE (o.status IN ('pending','retry') OR (o.status = 'processing' AND o.lease_until <= ?)) AND NOT (${valid}) LIMIT ?)`,
			params: [now, now, now, now, now, limit],
		});
		return old + changed.meta.changes;
	}
	override async claimEmail(input: OutboxClaimInput): Promise<EmailOutboxRow | null> {
		// Admin authentication mail keeps its original store/guards and takes precedence.
		const standard = await super.claimEmail(input);
		if (standard) return standard;
		const row = await this.intakeDb.first<{
			id: string;
			request_id: string;
			dedupe_key: string;
			attempts: number;
			max_attempts: number;
			kind: 'verification' | 'confirmation';
		}>({
			sql: `UPDATE trial_intake_email_outbox SET status = 'processing', lease_owner = ?, lease_until = ?, updated_at = ?
		 WHERE id = (SELECT o.id FROM trial_intake_email_outbox o JOIN trial_intake_requests r ON r.id = o.request_id
		 WHERE ((o.status IN ('pending','retry') AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?)) OR (o.status = 'processing' AND o.lease_until <= ?))
		 AND ${valid} ORDER BY o.created_at, o.id LIMIT 1) RETURNING *`,
			params: [
				input.leaseOwner,
				input.leaseUntil,
				input.now,
				input.now,
				input.now,
				input.now,
				input.now,
				input.now,
			],
		});
		if (!row) return null;
		const r = await this.intakeDb.first<{ email: string }>({
			sql: 'SELECT email FROM trial_intake_requests WHERE id = ?',
			params: [row.request_id],
		});
		if (!r) return null;
		return {
			...row,
			source_kind: 'trial_intake',
			source_id: row.request_id,
			template_or_category: row.kind === 'confirmation' ? 'intake.confirm' : 'intake.verify',
			recipient_address_kind: 'guest',
			user_id: null,
			locale: 'de',
			payload_json: '{}',
			email: r.email,
			token_id: null,
			token_kind: null,
			lease_owner: input.leaseOwner,
		};
	}
	override async markEmailSent(input: Parameters<OutboxRepository['markEmailSent']>[0]) {
		if (!input.id.startsWith('intake-email:')) return super.markEmailSent(input);
		return (
			(
				await this.intakeDb.run({
					sql: `UPDATE trial_intake_email_outbox SET status = 'sent', attempts = attempts + 1,
		 provider_request_id = ?, sent_at = ?, updated_at = ?, lease_owner = NULL, lease_until = NULL, last_error_code = NULL, next_attempt_at = NULL
		 WHERE id = ? AND status = 'processing' AND lease_owner = ?`,
					params: [
						input.providerRequestId.slice(0, 200),
						input.now,
						input.now,
						input.id,
						input.leaseOwner,
					],
				})
			).meta.changes === 1
		);
	}
	override async markEmailFailed(
		input: OutboxFailureInput
	): Promise<'retry' | 'dead' | 'lost_lease'> {
		if (!input.id.startsWith('intake-email:')) return super.markEmailFailed(input);
		const row = await this.intakeDb.first<{ status: 'retry' | 'dead' }>({
			sql: `UPDATE trial_intake_email_outbox
		 SET status = CASE WHEN ? OR attempts + 1 >= max_attempts THEN 'dead' ELSE 'retry' END,
		 next_attempt_at = CASE WHEN ? OR attempts + 1 >= max_attempts THEN NULL ELSE ? END,
		 attempts = attempts + 1, last_error_code = ?, updated_at = ?, lease_owner = NULL, lease_until = NULL
		 WHERE id = ? AND status = 'processing' AND lease_owner = ? RETURNING status`,
			params: [
				Number(input.permanent),
				Number(input.permanent),
				input.nextAttemptAt,
				input.errorCode,
				input.now,
				input.id,
				input.leaseOwner,
			],
		});
		return row?.status ?? 'lost_lease';
	}
}
export async function renderIntakeEmail(
	service: IntakeService,
	input: Parameters<typeof renderEmailTemplate>[0] & { now: string }
) {
	if (input.row.recipient_address_kind !== 'guest') {
		const message = await renderEmailTemplate(input);
		return {
			...message,
			subject: `${message.subject} — ${ORGANIZATION_NAME}`,
			text: `${message.text}\n\n${ORGANIZATION_NAME}`,
		};
	}
	const row = input.row;
	const confirmation = row.template_or_category === 'intake.confirm';
	if (
		row.source_kind !== 'trial_intake' ||
		(!confirmation && (!input.secret || row.template_or_category !== 'intake.verify'))
	)
		throw new OutboxTemplateError('INTAKE_EMAIL_INVALID');
	const current = await service.db.first<{ id: string }>({
		sql: `SELECT o.id FROM trial_intake_email_outbox o
	 JOIN trial_intake_requests r ON r.id = o.request_id WHERE o.id = ? AND o.request_id = ?
	 AND o.status = 'processing' AND o.lease_owner = ? AND ${valid}`,
		params: [row.id, row.source_id, row.lease_owner, input.now, input.now, input.now],
	});
	const detail = current ? await service.detail(row.source_id) : null;
	if (!detail) throw new OutboxTemplateError('INTAKE_EMAIL_EXPIRED');
	if (confirmation) return confirmationEmail(detail);
	const token = await verificationToken(input.secret!, detail.request);
	return verificationEmail(
		detail,
		new URL(`/probestunde/verify?token=${token}`, input.config.portalPublicOrigin).toString()
	);
}

import { DatabaseBoundary } from '$lib/server/db/database';
import { OutboxRepository, OutboxRepositoryError } from '$lib/server/outbox/outbox-repository';
import type {
	EmailOutboxRow,
	OutboxClaimInput,
	OutboxFailureInput,
} from '$lib/server/outbox/contracts';
import { renderEmailTemplate, OutboxTemplateError } from '$lib/server/outbox/templates';
import { IntakeService, verificationToken } from './service.server';
import {
	BUREAU_ALERT_EMAIL,
	confirmationEmail,
	telegramAlertEmail,
	verificationEmail,
} from './templates.server';
import { ORGANIZATION_NAME } from '$lib/organization';
import { readEntry, withdrawToken } from './waitlist-core.server';
import { waitlistConfirmationEmail, waitlistVerificationEmail } from './waitlist-templates.server';
import {
	WAITLIST_LETTER_FROM,
	WAITLIST_LETTER_SOURCE,
	WAITLIST_LETTER_VALID,
	renderWaitlistLetter,
} from './waitlist-pdf.server';

const valid = `((o.kind = 'verification' AND r.state = 'pending_email' AND r.pending_expires_at > ?
 AND r.verification_expires_at > ? AND r.verification_version = o.verification_version)
 OR (o.kind = 'confirmation' AND r.state IN ('verified','processed') AND (r.delete_after IS NULL OR r.delete_after > ?)))`;
/** Guest letters and bureau alerts live in their own tables; admin mail stays in email_outbox. */
function intakeEmailTable(id: string) {
	if (id.startsWith('intake-email:')) return 'trial_intake_email_outbox';
	if (id.startsWith('intake-alert:')) return 'trial_intake_telegram_alerts';
	if (id.startsWith('intake-wl:')) return 'trial_intake_waitlist_email_outbox';
	return null;
}
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
		// A start letter whose signup was deleted, or a probe whose admin lost the role.
		const waitlist = await this.intakeDb.run({
			sql: `UPDATE trial_intake_waitlist_email_outbox SET status = 'cancelled', lease_owner = NULL, lease_until = NULL, updated_at = ?
		 WHERE id IN (SELECT o.id FROM trial_intake_waitlist_email_outbox o LEFT JOIN trial_intake_requests r ON r.id = o.request_id
		 LEFT JOIN trial_intake_waitlist_entries e ON e.request_id = o.request_id
		 WHERE (o.status IN ('pending','retry') OR (o.status = 'processing' AND o.lease_until <= ?))
		 AND (r.id IS NULL OR e.request_id IS NULL OR NOT (${WAITLIST_LETTER_VALID})) LIMIT ?)`,
			params: [now, now, now, limit],
		});
		return old + changed.meta.changes + waitlist.meta.changes;
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
		if (!row) return (await this.claimTelegramAlert(input)) ?? this.claimWaitlistLetter(input);
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
	/** The bureau alert of a request notification that Telegram did not confirm or refused. */
	private async claimTelegramAlert(input: OutboxClaimInput): Promise<EmailOutboxRow | null> {
		const row = await this.intakeDb.first<{
			id: string;
			telegram_outbox_id: string;
			attempts: number;
			max_attempts: number;
		}>({
			sql: `UPDATE trial_intake_telegram_alerts SET status = 'processing', lease_owner = ?, lease_until = ?, updated_at = ?
		 WHERE id = (SELECT id FROM trial_intake_telegram_alerts
		 WHERE (status IN ('pending','retry') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) OR (status = 'processing' AND lease_until <= ?)
		 ORDER BY created_at, id LIMIT 1) RETURNING id, telegram_outbox_id, attempts, max_attempts`,
			params: [input.leaseOwner, input.leaseUntil, input.now, input.now, input.now],
		});
		if (!row) return null;
		return {
			id: row.id,
			source_kind: 'trial_intake_alert',
			source_id: row.telegram_outbox_id,
			template_or_category: 'intake.telegram_alert',
			recipient_address_kind: 'guest',
			user_id: null,
			locale: 'de',
			payload_json: '{}',
			dedupe_key: row.id,
			attempts: row.attempts,
			max_attempts: row.max_attempts,
			email: BUREAU_ALERT_EMAIL,
			token_id: null,
			token_kind: null,
			lease_owner: input.leaseOwner,
		};
	}
	/** Start letters and admin probes of the waitlist come after every existing source. */
	private async claimWaitlistLetter(input: OutboxClaimInput): Promise<EmailOutboxRow | null> {
		const row = await this.intakeDb.first<{
			id: string;
			kind: 'start' | 'probe';
			request_id: string;
			probe_recipient_user_id: string | null;
			dedupe_key: string;
			attempts: number;
			max_attempts: number;
		}>({
			sql: `UPDATE trial_intake_waitlist_email_outbox SET status = 'processing', lease_owner = ?, lease_until = ?, updated_at = ?
		 WHERE id = (SELECT o.id FROM ${WAITLIST_LETTER_FROM}
		 WHERE ((o.status IN ('pending','retry') AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?)) OR (o.status = 'processing' AND o.lease_until <= ?))
		 AND ${WAITLIST_LETTER_VALID} ORDER BY o.created_at, o.id LIMIT 1)
		 RETURNING id, kind, request_id, probe_recipient_user_id, dedupe_key, attempts, max_attempts`,
			params: [
				input.leaseOwner,
				input.leaseUntil,
				input.now,
				input.now,
				input.now,
				input.now,
			],
		});
		if (!row) return null;
		// A probe goes to the signed-in admin who asked for it, never to the family.
		const recipient = await this.intakeDb.first<{ email: string }>(
			row.kind === 'start'
				? {
						sql: 'SELECT email FROM trial_intake_requests WHERE id = ?',
						params: [row.request_id],
					}
				: {
						sql: 'SELECT email FROM users WHERE id = ?',
						params: [row.probe_recipient_user_id],
					}
		);
		if (!recipient) return null;
		return {
			id: row.id,
			source_kind: WAITLIST_LETTER_SOURCE,
			source_id: row.request_id,
			template_or_category:
				row.kind === 'start' ? 'intake.waitlist_start' : 'intake.waitlist_probe',
			recipient_address_kind: 'guest',
			user_id: null,
			locale: 'de',
			payload_json: '{}',
			dedupe_key: row.dedupe_key,
			attempts: row.attempts,
			max_attempts: row.max_attempts,
			email: recipient.email,
			token_id: null,
			token_kind: null,
			lease_owner: input.leaseOwner,
		};
	}
	override async markEmailSent(input: Parameters<OutboxRepository['markEmailSent']>[0]) {
		const table = intakeEmailTable(input.id);
		if (!table) return super.markEmailSent(input);
		return (
			(
				await this.intakeDb.run({
					sql: `UPDATE ${table} SET status = 'sent', attempts = attempts + 1,
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
		const table = intakeEmailTable(input.id);
		if (!table) return super.markEmailFailed(input);
		const row = await this.intakeDb.first<{ status: 'retry' | 'dead' }>({
			sql: `UPDATE ${table}
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
	if (row.source_kind === WAITLIST_LETTER_SOURCE)
		return renderWaitlistLetter(service.db, row, input.now);
	if (row.template_or_category === 'intake.telegram_alert') {
		if (row.source_kind !== 'trial_intake_alert')
			throw new OutboxTemplateError('INTAKE_EMAIL_INVALID');
		const alert = await service.db.first<{
			reason: 'delivery_unknown' | 'dead';
			outbox_id: string;
			request_id: string;
			error_code: string | null;
			delivery_reference: string | null;
		}>({
			sql: `SELECT a.reason, o.id AS outbox_id, o.source_id AS request_id, o.last_error_code AS error_code,
		 (SELECT t.delivery_reference FROM telegram_delivery_attempts t WHERE t.outbox_id = o.id
		 ORDER BY t.attempt_no DESC LIMIT 1) AS delivery_reference
		 FROM trial_intake_telegram_alerts a JOIN telegram_outbox o ON o.id = a.telegram_outbox_id
		 WHERE a.id = ? AND a.telegram_outbox_id = ? AND a.status = 'processing' AND a.lease_owner = ?
		 AND o.source_kind = 'trial_intake'`,
			params: [row.id, row.source_id, row.lease_owner],
		});
		if (!alert) throw new OutboxTemplateError('INTAKE_EMAIL_EXPIRED');
		return telegramAlertEmail(
			{
				reason: alert.reason,
				requestId: alert.request_id,
				part: Number(alert.outbox_id.slice(alert.outbox_id.lastIndexOf(':') + 1)),
				deliveryReference: alert.delivery_reference,
				errorCode: alert.error_code,
			},
			input.config.portalPublicOrigin
		);
	}
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
	const link = (path: string) => new URL(path, input.config.portalPublicOrigin).toString();
	// A waitlist signup keeps both kinds of letter; only the text depends on the request kind.
	if (detail.request.kind === 'waitlist') {
		const entry = await readEntry(service.db, detail.request.id);
		if (!entry || !input.secret) throw new OutboxTemplateError('INTAKE_EMAIL_INVALID');
		if (confirmation)
			return waitlistConfirmationEmail(
				detail,
				entry,
				link(`/warteliste/austragen?token=${await withdrawToken(input.secret, entry)}`)
			);
		const token = await verificationToken(input.secret, detail.request);
		return waitlistVerificationEmail(detail, entry, link(`/probestunde/verify?token=${token}`));
	}
	if (confirmation) return confirmationEmail(detail);
	const token = await verificationToken(input.secret!, detail.request);
	return verificationEmail(detail, link(`/probestunde/verify?token=${token}`));
}

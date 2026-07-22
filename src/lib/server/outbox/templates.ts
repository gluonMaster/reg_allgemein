import { formatMessage, translate, type MessageKey } from '$lib/i18n';
import { buildPortalUrl, type RuntimeConfig } from '$lib/server/config/runtime';
import { deriveOpaqueAuthToken } from '$lib/server/auth/tokens';
import type { EmailOutboxRow, TelegramOutboxRow } from './contracts';
import type { EmailMessage, TelegramMessage } from './providers';

export const EMAIL_TEMPLATE_IDS = [
	'auth.email_verification',
	'auth.email_change_verification',
	'auth.password_reset',
	'auth.welcome',
	'auth.password_changed',
	'claim.legacy_email_proof',
	'claim.result',
	'trial.received',
	'trial.confirmed',
	'trial.rejected',
	'request.received',
	'request.needs_info',
	'request.decision',
	'contract.sent',
	'contract.accepted',
	'contract.formed',
	'contract.termination.received',
	'contract.attendance.received',
	'media.withdrawal.confirmation',
	'price_review.item_available',
	'price_review.applied',
	'support.admin_reply',
] as const;

export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];

export const TELEGRAM_TEMPLATE_IDS = [
	'bureau.support',
	'bureau.contract_signal',
	'bureau.price_review_signal',
] as const;

export type TelegramTemplateId = (typeof TELEGRAM_TEMPLATE_IDS)[number];

export class OutboxTemplateError extends Error {
	constructor(readonly code: string) {
		super('Outbox template rendering failed.');
		this.name = 'OutboxTemplateError';
	}
}

function payload(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
		return parsed as Record<string, unknown>;
	} catch {
		throw new OutboxTemplateError('OUTBOX_PAYLOAD_INVALID');
	}
}

function requiredString(input: Record<string, unknown>, key: string): string {
	const value = input[key];
	if (typeof value !== 'string' || value.length === 0 || value.length > 1000) {
		throw new OutboxTemplateError('OUTBOX_PAYLOAD_INVALID');
	}
	return value;
}

function optionalString(input: Record<string, unknown>, key: string, fallback = '—'): string {
	const value = input[key];
	return typeof value === 'string' && value.length > 0 && value.length <= 1000
		? value
		: fallback;
}

function requiredCents(input: Record<string, unknown>, key: string): number {
	const value = input[key];
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new OutboxTemplateError('OUTBOX_PAYLOAD_INVALID');
	}
	return value as number;
}

function germanMoney(cents: number): string {
	return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function joinedList(input: Record<string, unknown>, key: string): string {
	const value = input[key];
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
		throw new OutboxTemplateError('OUTBOX_PAYLOAD_INVALID');
	}
	return value.join(', ');
}

function portalLink(
	config: Pick<RuntimeConfig, 'portalPublicOrigin'>,
	input: Record<string, unknown>
): string {
	return buildPortalUrl(config, requiredString(input, 'portalPath')).toString();
}

function translatedEmail(
	row: Pick<EmailOutboxRow, 'email' | 'locale'>,
	subject: MessageKey,
	body: MessageKey,
	parameters: Record<string, string | number> = {}
): EmailMessage {
	return {
		to: row.email,
		subject: translate(row.locale, subject),
		text: formatMessage(row.locale, body, parameters),
	};
}

async function authLink(
	row: EmailOutboxRow,
	secret: string | undefined,
	config: Pick<RuntimeConfig, 'portalPublicOrigin'>
): Promise<string> {
	if (!secret || !row.token_id || !row.token_kind) {
		throw new OutboxTemplateError('AUTH_EMAIL_CONTEXT_INVALID');
	}
	const token = await deriveOpaqueAuthToken({
		secret,
		tokenId: row.token_id,
		kind: row.token_kind,
	});
	const path =
		row.token_kind === 'password_reset'
			? `/auth/reset?token=${encodeURIComponent(token)}`
			: row.token_kind === 'legacy_email_claim'
				? `/cabinet/legacy-claim?token=${encodeURIComponent(token)}`
				: `/auth/verify?token=${encodeURIComponent(token)}`;
	return buildPortalUrl(config, path).toString();
}

export async function renderEmailTemplate(input: {
	row: EmailOutboxRow;
	config: Pick<RuntimeConfig, 'portalPublicOrigin'>;
	secret?: string;
}): Promise<EmailMessage> {
	const { row } = input;
	const data = payload(row.payload_json);
	switch (row.template_or_category as EmailTemplateId) {
		case 'auth.email_verification':
			return translatedEmail(row, 'auth.email.verification.subject', 'auth.email.verification.body', {
				link: await authLink(row, input.secret, input.config),
			});
		case 'auth.email_change_verification':
			return translatedEmail(row, 'auth.email.change.subject', 'auth.email.change.body', {
				link: await authLink(row, input.secret, input.config),
			});
		case 'auth.password_reset':
			return translatedEmail(row, 'auth.email.reset.subject', 'auth.email.reset.body', {
				link: await authLink(row, input.secret, input.config),
			});
		case 'auth.welcome':
			return translatedEmail(row, 'auth.email.welcome.subject', 'auth.email.welcome.body');
		case 'auth.password_changed':
			return translatedEmail(
				row,
				'auth.email.passwordChanged.subject',
				'auth.email.passwordChanged.body'
			);
		case 'claim.legacy_email_proof':
			return translatedEmail(row, 'claim.email.proof.subject', 'claim.email.proof.body', {
				link: await authLink(row, input.secret, input.config),
			});
		case 'claim.result':
			return translatedEmail(row, 'claim.email.result.subject', 'claim.email.result.body', {
				link: portalLink(input.config, data),
			});
		case 'trial.received':
			return translatedEmail(row, 'trial.email.received.subject', 'trial.email.received.body', {
				link: portalLink(input.config, data),
			});
		case 'trial.confirmed':
			return translatedEmail(row, 'trial.email.confirmed.subject', 'trial.email.confirmed.body', {
				link: portalLink(input.config, data),
				date: optionalString(data, 'confirmedDate'),
			});
		case 'trial.rejected':
			return translatedEmail(row, 'trial.email.rejected.subject', 'trial.email.rejected.body', {
				link: portalLink(input.config, data),
			});
		case 'request.received':
			return translatedEmail(row, 'request.email.received.subject', 'request.email.received.body', {
				link: portalLink(input.config, data),
			});
		case 'request.needs_info':
			return translatedEmail(row, 'request.email.needsInfo.subject', 'request.email.needsInfo.body', {
				link: portalLink(input.config, data),
			});
		case 'request.decision':
			return translatedEmail(row, 'request.email.decision.subject', 'request.email.decision.body', {
				link: portalLink(input.config, data),
				status: optionalString(data, 'status'),
			});
		case 'contract.sent':
			return translatedEmail(row, 'contract.email.sent.subject', 'contract.email.sent.body', {
				link: portalLink(input.config, data),
				contractNumber: optionalString(data, 'contractNumber'),
			});
		case 'contract.accepted':
			return translatedEmail(row, 'contract.email.accepted.subject', 'contract.email.accepted.body', {
				link: portalLink(input.config, data),
			});
		case 'contract.formed':
			return translatedEmail(row, 'contract.email.formed.subject', 'contract.email.formed.body', {
				link: portalLink(input.config, data),
				contractNumber: optionalString(data, 'contractNumber'),
			});
		case 'contract.termination.received':
			return translatedEmail(row, 'contract.email.termination.subject', 'contract.email.termination.body', {
				link: portalLink(input.config, data),
				reference: requiredString(data, 'reference'),
				kind: requiredString(data, 'kind'),
				receivedAt: requiredString(data, 'receivedAt'),
			});
		case 'contract.attendance.received':
			return translatedEmail(row, 'contract.email.attendance.subject', 'contract.email.attendance.body', {
				link: portalLink(input.config, data),
				reference: requiredString(data, 'reference'),
				receivedAt: requiredString(data, 'receivedAt'),
			});
		case 'media.withdrawal.confirmation':
			return translatedEmail(row, 'media.email.withdrawal.subject', 'media.email.withdrawal.body', {
				childName: requiredString(data, 'childName'),
				captureScopes: joinedList(data, 'captureScopes'),
				publicationChannels: joinedList(data, 'publicationChannels'),
				sourceChannel: requiredString(data, 'sourceChannel'),
				receivedAt: requiredString(data, 'receivedAt'),
			});
		case 'price_review.item_available':
			return translatedEmail(
				row,
				'priceReview.email.available.subject',
				'priceReview.email.available.body',
				{
					link: portalLink(input.config, data),
					oldAmount: germanMoney(requiredCents(data, 'oldPriceCents')),
					newAmount: germanMoney(requiredCents(data, 'newPriceCents')),
					deadline: requiredString(data, 'responseDeadline'),
				}
			);
		case 'price_review.applied':
			return translatedEmail(row, 'priceReview.email.applied.subject', 'priceReview.email.applied.body', {
				link: portalLink(input.config, data),
				amount: germanMoney(requiredCents(data, 'newPriceCents')),
				effectiveFrom: requiredString(data, 'effectiveFrom'),
			});
		case 'support.admin_reply':
			return translatedEmail(row, 'support.email.reply.subject', 'support.email.reply.body', {
				link: portalLink(input.config, data),
				reference: requiredString(data, 'threadReference'),
			});
		default:
			throw new OutboxTemplateError('EMAIL_TEMPLATE_UNSUPPORTED');
	}
}

export function renderTelegramTemplate(input: {
	row: TelegramOutboxRow;
	config: Pick<RuntimeConfig, 'portalPublicOrigin'>;
	chatId: string | undefined;
}): TelegramMessage {
	if (!input.chatId) throw new OutboxTemplateError('TELEGRAM_DESTINATION_UNAVAILABLE');
	if (!TELEGRAM_TEMPLATE_IDS.includes(input.row.template_or_category as TelegramTemplateId)) {
		throw new OutboxTemplateError('TELEGRAM_TEMPLATE_UNSUPPORTED');
	}
	const data = payload(input.row.payload_json);
	return {
		chatId: input.chatId,
		text: formatMessage(input.row.locale, 'telegram.bureau.notification', {
			category: requiredString(data, 'category'),
			reference: requiredString(data, 'reference'),
			receivedAt: requiredString(data, 'receivedAt'),
			link: buildPortalUrl(input.config, requiredString(data, 'adminPath')).toString(),
		}),
	};
}


import { z } from 'zod';
import {
	EmailProviderError,
	type EmailMessage,
	type EmailProvider,
	type ProviderSendContext,
} from '$lib/server/outbox/providers';

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 10_000;

const resendSuccessSchema = z.object({
	id: z.string().min(1).max(200),
});

const resendErrorSchema = z.object({
	type: z.string().min(1).max(100).optional(),
});

export interface ResendEmailProviderOptions {
	apiKey: string;
	from: string;
	replyTo: string;
	fetcher?: typeof fetch;
	timeoutMs?: number;
	allowedRecipientHashes?: readonly string[];
}

function bytesToBase64(content: Uint8Array): string {
	const chunkSize = 3 * 8_192;
	const parts: string[] = [];
	for (let offset = 0; offset < content.byteLength; offset += chunkSize) {
		const chunk = content.subarray(offset, Math.min(content.byteLength, offset + chunkSize));
		parts.push(btoa(String.fromCharCode(...chunk)));
	}
	return parts.join('');
}

async function assertAllowedRecipient(
	recipient: string,
	allowedHashes: readonly string[] | undefined
): Promise<void> {
	if (!allowedHashes || allowedHashes.length === 0) return;
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(recipient.trim().toLowerCase())
	);
	const hash = [...new Uint8Array(digest)]
		.map((value) => value.toString(16).padStart(2, '0'))
		.join('');
	if (!allowedHashes.includes(hash)) {
		throw new EmailProviderError('RESEND_RECIPIENT_NOT_ALLOWLISTED', false);
	}
}

function resendAttachments(message: EmailMessage) {
	if (!message.attachments || message.attachments.length === 0) return undefined;
	if (
		message.attachments.length > 1 ||
		message.attachments.some(
			(attachment) =>
				attachment.contentType !== 'application/pdf' ||
				attachment.content.byteLength < 1 ||
				attachment.content.byteLength > 10 * 1024 * 1024 ||
				!/^[A-Za-z0-9._-]{1,120}$/u.test(attachment.filename)
		)
	) {
		throw new EmailProviderError('RESEND_ATTACHMENT_INVALID', false);
	}
	return message.attachments.map((attachment) => ({
		filename: attachment.filename,
		content: bytesToBase64(attachment.content),
	}));
}

function safeErrorCode(type: string | undefined, status: number): string {
	const normalized = type
		?.toUpperCase()
		.replace(/[^A-Z0-9_]/g, '_')
		.slice(0, 100);
	return normalized ? `RESEND_${normalized}` : `RESEND_HTTP_${status}`;
}

function isRetryableResponse(status: number, type: string | undefined): boolean {
	if (type === 'invalid_idempotent_request') return false;
	if (type === 'concurrent_idempotent_requests') return true;
	if (type === 'daily_quota_exceeded' || type === 'monthly_quota_exceeded') return false;
	return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function providerIdempotencyKey(context: ProviderSendContext | undefined): Promise<string> {
	if (!context?.idempotencyKey || context.idempotencyKey.length > 1_024) {
		throw new EmailProviderError('RESEND_IDEMPOTENCY_KEY_REQUIRED', false);
	}

	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(context.idempotencyKey)
	);
	const hex = [...new Uint8Array(digest)]
		.map((value) => value.toString(16).padStart(2, '0'))
		.join('');
	return `reg-allgemein/${hex}`;
}

async function readErrorType(response: Response): Promise<string | undefined> {
	try {
		const parsed = resendErrorSchema.safeParse(await response.json());
		return parsed.success ? parsed.data.type : undefined;
	} catch {
		return undefined;
	}
}

export class ResendEmailProvider implements EmailProvider {
	private readonly fetcher: typeof fetch;
	private readonly timeoutMs: number;

	constructor(private readonly options: ResendEmailProviderOptions) {
		this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async send(
		message: EmailMessage,
		context?: ProviderSendContext
	): Promise<{ providerRequestId: string }> {
		const idempotencyKey = await providerIdempotencyKey(context);
		await assertAllowedRecipient(message.to, this.options.allowedRecipientHashes);
		const attachments = resendAttachments(message);
		let response: Response;

		try {
			response = await this.fetcher(RESEND_EMAILS_ENDPOINT, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.options.apiKey}`,
					'Content-Type': 'application/json',
					'Idempotency-Key': idempotencyKey,
					'User-Agent': 'kolibri-reg-allgemein/1.0',
				},
				body: JSON.stringify({
					from: this.options.from,
					to: [message.to],
					reply_to: this.options.replyTo,
					subject: message.subject,
					text: message.text,
					...(attachments ? { attachments } : {}),
				}),
				signal: AbortSignal.timeout(this.timeoutMs),
			});
		} catch {
			throw new EmailProviderError('RESEND_NETWORK_FAILURE', true);
		}

		if (!response.ok) {
			const type = await readErrorType(response);
			throw new EmailProviderError(
				safeErrorCode(type, response.status),
				isRetryableResponse(response.status, type)
			);
		}

		try {
			const parsed = resendSuccessSchema.safeParse(await response.json());
			if (!parsed.success) throw new Error('Invalid provider response');
			return { providerRequestId: parsed.data.id };
		} catch {
			throw new EmailProviderError('RESEND_INVALID_RESPONSE', true);
		}
	}
}

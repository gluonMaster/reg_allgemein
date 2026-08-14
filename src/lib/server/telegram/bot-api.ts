import type { TelegramMessage, TelegramProvider } from '$lib/server/outbox/providers';
import { TelegramProviderError } from '$lib/server/outbox/providers';

export const TELEGRAM_BOT_API_TIMEOUT_MS = 10_000;
export const TELEGRAM_BOT_API_MIN_TIMEOUT_MS = 1_000;
export const TELEGRAM_BOT_API_MAX_TIMEOUT_MS = 30_000;
export const TELEGRAM_BOT_API_MAX_RESPONSE_BYTES = 64 * 1_024;

export type TelegramBureauChatType = 'group' | 'supergroup' | 'channel';

interface TelegramEnvelope {
	ok?: unknown;
	result?: unknown;
	error_code?: unknown;
	parameters?: unknown;
}

export interface TelegramBotApiProviderOptions {
	token: string;
	chatId: string;
	chatType: TelegramBureauChatType;
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
}

export interface TelegramPreflightResult {
	botIdentityVerified: true;
	destinationVerified: true;
	postingPermissionVerified: true;
	webhookDisabled: true;
	chatType: TelegramBureauChatType;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown): number | null {
	return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function retryAfter(parameters: unknown): number | undefined {
	if (!isRecord(parameters)) return undefined;
	const value = safeInteger(parameters.retry_after);
	return value !== null && value >= 1 ? value : undefined;
}

function hasMigration(parameters: unknown): boolean {
	return isRecord(parameters) && parameters.migrate_to_chat_id !== undefined;
}

async function boundedJsonResponse(response: Response): Promise<unknown> {
	const contentLength = response.headers.get('content-length');
	if (contentLength !== null) {
		const parsed = Number(contentLength);
		if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > TELEGRAM_BOT_API_MAX_RESPONSE_BYTES) {
			throw new Error('response_too_large');
		}
	}
	if (!response.body) return JSON.parse(await response.text());
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > TELEGRAM_BOT_API_MAX_RESPONSE_BYTES) {
				await reader.cancel();
				throw new Error('response_too_large');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return JSON.parse(new TextDecoder().decode(bytes));
}

function classifyRejected(envelope: TelegramEnvelope, httpStatus: number): TelegramProviderError {
	if (hasMigration(envelope.parameters)) {
		return new TelegramProviderError('TELEGRAM_DESTINATION_MIGRATED', false);
	}
	const status = safeInteger(envelope.error_code) ?? httpStatus;
	if (status === 429) {
		return new TelegramProviderError('TELEGRAM_RATE_LIMITED', true, {
			retryAfterSeconds: retryAfter(envelope.parameters),
		});
	}
	if (status === 408 || status === 425 || (status !== null && status >= 500 && status <= 599)) {
		return new TelegramProviderError('TELEGRAM_TEMPORARY_FAILURE', true);
	}
	if (status !== null && status >= 400 && status < 500) {
		return new TelegramProviderError('TELEGRAM_REQUEST_REJECTED', false);
	}
	return new TelegramProviderError('TELEGRAM_PROVIDER_REJECTED', false);
}

function chatIdMatches(actual: unknown, expected: string): boolean {
	const parsed = safeInteger(actual);
	return parsed !== null && String(parsed) === expected;
}

export function isTelegramBotToken(value: string): boolean {
	const match = /^([1-9]\d{4,}):[A-Za-z0-9_-]{20,}$/u.exec(value);
	return Boolean(match && Number.isSafeInteger(Number(match[1])));
}

export function isTelegramChatId(value: string): boolean {
	return /^-?[1-9]\d*$/u.test(value) && Number.isSafeInteger(Number(value));
}

export class TelegramBotApiProvider implements TelegramProvider {
	private readonly fetchImpl: typeof globalThis.fetch;
	private readonly timeoutMs: number;
	readonly #token: string;
	readonly #chatId: string;
	readonly #chatType: TelegramBureauChatType;
	readonly #botId: string;

	constructor(options: TelegramBotApiProviderOptions) {
		if (!isTelegramBotToken(options.token)) {
			throw new TypeError('Telegram bot token is invalid.');
		}
		this.#token = options.token;
		this.#botId = options.token.slice(0, options.token.indexOf(':'));
		if (!isTelegramChatId(options.chatId)) {
			throw new TypeError('Telegram chat ID must be an exact safe integer.');
		}
		this.#chatId = options.chatId;
		this.#chatType = options.chatType;
		this.timeoutMs = options.timeoutMs ?? TELEGRAM_BOT_API_TIMEOUT_MS;
		if (
			!Number.isSafeInteger(this.timeoutMs) ||
			this.timeoutMs < TELEGRAM_BOT_API_MIN_TIMEOUT_MS ||
			this.timeoutMs > TELEGRAM_BOT_API_MAX_TIMEOUT_MS
		) {
			throw new TypeError('Telegram Bot API timeout is outside the safe range.');
		}
		this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
	}

	private async call(
		method: string,
		body: Record<string, unknown>,
		mayDeliver: boolean
	): Promise<unknown> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			let response: Response;
			try {
				response = await this.fetchImpl(
					`https://api.telegram.org/bot${this.#token}/${method}`,
					{
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(body),
						signal: controller.signal,
						redirect: 'error',
					}
				);
			} catch {
				throw new TelegramProviderError(
					mayDeliver ? 'TELEGRAM_DELIVERY_UNKNOWN' : 'TELEGRAM_PREFLIGHT_UNAVAILABLE',
					!mayDeliver,
					{ delivery: mayDeliver ? 'unknown' : 'not_delivered' }
				);
			}

			let envelope: TelegramEnvelope;
			try {
				envelope = (await boundedJsonResponse(response)) as TelegramEnvelope;
			} catch {
				throw new TelegramProviderError(
					mayDeliver ? 'TELEGRAM_DELIVERY_UNKNOWN' : 'TELEGRAM_RESPONSE_INVALID',
					false,
					{ delivery: mayDeliver ? 'unknown' : 'not_delivered' }
				);
			}
			if (!isRecord(envelope)) {
				throw new TelegramProviderError(
					mayDeliver ? 'TELEGRAM_DELIVERY_UNKNOWN' : 'TELEGRAM_RESPONSE_INVALID',
					false,
					{ delivery: mayDeliver ? 'unknown' : 'not_delivered' }
				);
			}
			if (envelope.ok === false) throw classifyRejected(envelope, response.status);
			if (envelope.ok !== true || !response.ok) {
				throw new TelegramProviderError(
					mayDeliver ? 'TELEGRAM_DELIVERY_UNKNOWN' : 'TELEGRAM_RESPONSE_INVALID',
					false,
					{ delivery: mayDeliver ? 'unknown' : 'not_delivered' }
				);
			}
			return envelope.result;
		} finally {
			clearTimeout(timer);
		}
	}

	async send(message: TelegramMessage): Promise<{ providerRequestId: string }> {
		if (message.chatId !== this.#chatId) {
			throw new TelegramProviderError('TELEGRAM_DESTINATION_MISMATCH', false);
		}
		if (
			message.text.length < 1 ||
			message.text.length > 4_096 ||
			!/^TG-[A-F0-9]{12}$/u.test(message.deliveryReference) ||
			!message.text.includes(message.deliveryReference)
		) {
			throw new TelegramProviderError('TELEGRAM_MESSAGE_INVALID', false);
		}
		const result = await this.call(
			'sendMessage',
			{
				chat_id: this.#chatId,
				text: message.text,
				link_preview_options: { is_disabled: true },
				protect_content: true,
			},
			true
		);
		if (!isRecord(result)) {
			throw new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, {
				delivery: 'unknown',
			});
		}
		const messageId = safeInteger(result.message_id);
		const chat = isRecord(result.chat) ? result.chat : null;
		if (
			messageId === null ||
			messageId < 1 ||
			!chat ||
			!chatIdMatches(chat.id, this.#chatId) ||
			chat.type !== this.#chatType
		) {
			throw new TelegramProviderError('TELEGRAM_DELIVERY_UNKNOWN', false, {
				delivery: 'unknown',
			});
		}
		return { providerRequestId: `telegram-message:${messageId}` };
	}

	async preflight(): Promise<TelegramPreflightResult> {
		const bot = await this.call('getMe', {}, false);
		if (
			!isRecord(bot) ||
			bot.is_bot !== true ||
			safeInteger(bot.id) === null ||
			String(bot.id) !== this.#botId
		) {
			throw new TelegramProviderError('TELEGRAM_BOT_IDENTITY_INVALID', false);
		}
		const chat = await this.call('getChat', { chat_id: this.#chatId }, false);
		if (
			!isRecord(chat) ||
			!chatIdMatches(chat.id, this.#chatId) ||
			chat.type !== this.#chatType
		) {
			throw new TelegramProviderError('TELEGRAM_DESTINATION_MISMATCH', false);
		}
		const member = await this.call(
			'getChatMember',
			{ chat_id: this.#chatId, user_id: bot.id },
			false
		);
		if (!isRecord(member)) {
			throw new TelegramProviderError('TELEGRAM_POST_PERMISSION_MISSING', false);
		}
		const status = member.status;
		const defaultPermissions = isRecord(chat.permissions) ? chat.permissions : null;
		const allowed =
			this.#chatType === 'channel'
				? status === 'creator' ||
					(status === 'administrator' && member.can_post_messages === true)
				: status === 'creator' ||
					status === 'administrator' ||
					(status === 'member' && defaultPermissions?.can_send_messages === true) ||
					(status === 'restricted' && member.is_member === true &&
						member.can_send_messages === true);
		if (!allowed) {
			throw new TelegramProviderError('TELEGRAM_POST_PERMISSION_MISSING', false);
		}
		const webhook = await this.call('getWebhookInfo', {}, false);
		if (!isRecord(webhook) || webhook.url !== '') {
			throw new TelegramProviderError('TELEGRAM_WEBHOOK_MUST_BE_DISABLED', false);
		}
		return {
			botIdentityVerified: true,
			destinationVerified: true,
			postingPermissionVerified: true,
			webhookDisabled: true,
			chatType: this.#chatType,
		};
	}
}

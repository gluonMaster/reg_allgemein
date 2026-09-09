import { TelegramProviderError, type TelegramMessage } from '$lib/server/outbox/providers';
import { createOutboxRuntime } from '$lib/server/outbox/runtime';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import {
	TELEGRAM_BOT_API_MAX_RESPONSE_BYTES,
	TelegramBotApiProvider,
	type TelegramBotApiProviderOptions,
	type TelegramBureauChatType,
} from '$lib/server/telegram/bot-api';

const token = `123456:${'A'.repeat(30)}`;
const chatId = '-1001234567890';
const deliveryReference = 'TG-ABCDEF012345';
const message: TelegramMessage = {
	chatId,
	deliveryReference,
	text: `Neue Portal-Mitteilung. Zustellreferenz: ${deliveryReference}. Verwaltung: https://portal.example.org/admin/messages/item-1`,
};
const fakeDb = { prepare() {} } as unknown as D1Database;

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

function createProvider(
	fetchImpl: typeof globalThis.fetch,
	overrides: Partial<TelegramBotApiProviderOptions> = {}
): TelegramBotApiProvider {
	return new TelegramBotApiProvider({
		token,
		chatId,
		chatType: 'channel',
		fetch: fetchImpl,
		...overrides,
	});
}

async function expectProviderError(
	promise: Promise<unknown>,
	expected: {
		code: string;
		retryable: boolean;
		delivery?: 'not_delivered' | 'unknown';
		retryAfterSeconds?: number;
	}
): Promise<TelegramProviderError> {
	try {
		await promise;
		throw new Error('Expected Telegram provider operation to fail.');
	} catch (error) {
		expect(error).toBeInstanceOf(TelegramProviderError);
		const providerError = error as TelegramProviderError;
		expect(providerError.code).toBe(expected.code);
		expect(providerError.retryable).toBe(expected.retryable);
		expect(providerError.options.delivery).toBe(expected.delivery ?? 'not_delivered');
		expect(providerError.options.retryAfterSeconds).toBe(expected.retryAfterSeconds);
		return providerError;
	}
}

function preflightFetch(input: {
	chatType: TelegramBureauChatType;
	member: Record<string, unknown>;
	webhookUrl?: string;
}): ReturnType<typeof vi.fn<typeof globalThis.fetch>> {
	return vi
		.fn<typeof globalThis.fetch>()
		.mockResolvedValueOnce(jsonResponse({ ok: true, result: { id: 123_456, is_bot: true } }))
		.mockResolvedValueOnce(
			jsonResponse({
				ok: true,
				result: {
					id: Number(chatId),
					type: input.chatType,
					permissions: { can_send_messages: true },
				},
			})
		)
		.mockResolvedValueOnce(jsonResponse({ ok: true, result: input.member }))
		.mockResolvedValueOnce(jsonResponse({ ok: true, result: { url: input.webhookUrl ?? '' } }));
}

describe('Telegram Bot API provider', () => {
	it('sends only a minimized protected Bot API message and validates the result', async () => {
		const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
			jsonResponse({
				ok: true,
				result: { message_id: 42, chat: { id: Number(chatId), type: 'channel' } },
			})
		);
		const provider = createProvider(fetchMock);

		await expect(provider.send(message)).resolves.toEqual({
			providerRequestId: 'telegram-message:42',
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
		expect(init).toMatchObject({
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			redirect: 'manual',
		});
		const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
		expect(body).toEqual({
			chat_id: chatId,
			text: message.text,
			link_preview_options: { is_disabled: true },
			protect_content: true,
		});
		expect(body).not.toHaveProperty('parse_mode');
		expect(body).not.toHaveProperty('entities');
		expect(body).not.toHaveProperty('reply_markup');
		expect(body).not.toHaveProperty('document');
	});

	it('keeps token and protected destination out of enumerable provider state', () => {
		const provider = createProvider(vi.fn<typeof globalThis.fetch>());
		const serialized = JSON.stringify(provider);
		expect(serialized).not.toContain(token);
		expect(serialized).not.toContain(chatId);
	});

	it('rejects an unsafe destination, text, or delivery reference before fetch', async () => {
		const fetchMock = vi.fn<typeof globalThis.fetch>();
		const provider = createProvider(fetchMock);
		const invalidMessages: Array<{ value: TelegramMessage; code: string }> = [
			{
				value: { ...message, chatId: '-1009999999999' },
				code: 'TELEGRAM_DESTINATION_MISMATCH',
			},
			{ value: { ...message, text: '' }, code: 'TELEGRAM_MESSAGE_INVALID' },
			{
				value: { ...message, deliveryReference: 'not-a-delivery-reference' },
				code: 'TELEGRAM_MESSAGE_INVALID',
			},
			{
				value: { ...message, text: `${deliveryReference}${'x'.repeat(4_096)}` },
				code: 'TELEGRAM_MESSAGE_INVALID',
			},
		];

		for (const invalid of invalidMessages) {
			await expectProviderError(provider.send(invalid.value), {
				code: invalid.code,
				retryable: false,
			});
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		{
			name: 'rate limit',
			status: 429,
			body: { ok: false, error_code: 429, parameters: { retry_after: 17 } },
			code: 'TELEGRAM_RATE_LIMITED',
			retryable: true,
			retryAfterSeconds: 17,
		},
		{
			name: 'HTTP rate limit fallback',
			status: 429,
			body: { ok: false, parameters: { retry_after: 9 } },
			code: 'TELEGRAM_RATE_LIMITED',
			retryable: true,
			retryAfterSeconds: 9,
		},
		{
			name: 'request timeout rejection',
			status: 400,
			body: { ok: false, error_code: 408 },
			code: 'TELEGRAM_TEMPORARY_FAILURE',
			retryable: true,
		},
		{
			name: 'too early rejection',
			status: 400,
			body: { ok: false, error_code: 425 },
			code: 'TELEGRAM_TEMPORARY_FAILURE',
			retryable: true,
		},
		{
			name: 'server rejection',
			status: 503,
			body: { ok: false },
			code: 'TELEGRAM_TEMPORARY_FAILURE',
			retryable: true,
		},
		{
			name: 'permanent request rejection',
			status: 400,
			body: { ok: false, error_code: 400 },
			code: 'TELEGRAM_REQUEST_REJECTED',
			retryable: false,
		},
		{
			name: 'authentication rejection',
			status: 401,
			body: { ok: false, error_code: 401 },
			code: 'TELEGRAM_REQUEST_REJECTED',
			retryable: false,
		},
		{
			name: 'permission rejection',
			status: 403,
			body: { ok: false, error_code: 403 },
			code: 'TELEGRAM_REQUEST_REJECTED',
			retryable: false,
		},
		{
			name: 'missing destination rejection',
			status: 404,
			body: { ok: false, error_code: 404 },
			code: 'TELEGRAM_REQUEST_REJECTED',
			retryable: false,
		},
		{
			name: 'destination migration',
			status: 400,
			body: {
				ok: false,
				error_code: 400,
				parameters: { migrate_to_chat_id: -1_001_111_111_111 },
			},
			code: 'TELEGRAM_DESTINATION_MIGRATED',
			retryable: false,
		},
	])('classifies a conclusive $name without exposing provider diagnostics', async (input) => {
		const providerDiagnostic = `sensitive ${token} client@example.org`;
		const fetchMock = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValue(
				jsonResponse({ ...input.body, description: providerDiagnostic }, input.status)
			);
		const error = await expectProviderError(createProvider(fetchMock).send(message), {
			code: input.code,
			retryable: input.retryable,
			retryAfterSeconds: input.retryAfterSeconds,
		});

		expect(String(error)).not.toContain(providerDiagnostic);
		expect(JSON.stringify(error)).not.toContain(providerDiagnostic);
		expect(JSON.stringify(error)).not.toContain(token);
		expect(JSON.stringify(error)).not.toContain(chatId);
	});

	it.each([
		{
			name: 'malformed JSON',
			response: new Response('{', {
				status: 502,
				headers: { 'content-type': 'application/json' },
			}),
		},
		{ name: 'non-object JSON', response: jsonResponse(['unexpected']) },
		{ name: 'contradictory success status', response: jsonResponse({ ok: true }, 500) },
		{ name: 'missing result', response: jsonResponse({ ok: true }) },
		{
			name: 'unexpected destination',
			response: jsonResponse({
				ok: true,
				result: { message_id: 42, chat: { id: -1_009_999_999_999, type: 'channel' } },
			}),
		},
		{
			name: 'unexpected chat type',
			response: jsonResponse({
				ok: true,
				result: { message_id: 42, chat: { id: Number(chatId), type: 'supergroup' } },
			}),
		},
	])('marks $name as delivery unknown and never retryable', async ({ response }) => {
		const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
		await expectProviderError(createProvider(fetchMock).send(message), {
			code: 'TELEGRAM_DELIVERY_UNKNOWN',
			retryable: false,
			delivery: 'unknown',
		});
	});

	it('discards a network cause and marks the dispatch result unknown', async () => {
		const cause = `socket failed for ${token} with client@example.org`;
		const fetchMock = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error(cause));
		const error = await expectProviderError(createProvider(fetchMock).send(message), {
			code: 'TELEGRAM_DELIVERY_UNKNOWN',
			retryable: false,
			delivery: 'unknown',
		});
		expect(String(error)).not.toContain(cause);
		expect(JSON.stringify(error)).not.toContain(cause);
	});

	it('bounds the provider response body before parsing it', async () => {
		const oversized = JSON.stringify({
			ok: true,
			result: { message_id: 42, chat: { id: Number(chatId), type: 'channel' } },
			padding: 'x'.repeat(TELEGRAM_BOT_API_MAX_RESPONSE_BYTES),
		});
		const provider = createProvider(
			vi.fn<typeof globalThis.fetch>().mockResolvedValue(
				new Response(oversized, { headers: { 'content-type': 'application/json' } })
			)
		);
		await expectProviderError(provider.send(message), {
			code: 'TELEGRAM_DELIVERY_UNKNOWN',
			retryable: false,
			delivery: 'unknown',
		});
	});

	it('aborts at the bounded timeout and treats the result as ambiguous', async () => {
		vi.useFakeTimers();
		try {
			const fetchMock = vi.fn<typeof globalThis.fetch>((_input, init) => {
				return new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener(
						'abort',
						() => reject(new DOMException('aborted', 'AbortError')),
						{ once: true }
					);
				});
			});
			const pending = createProvider(fetchMock, { timeoutMs: 1_000 }).send(message);
			const assertion = expectProviderError(pending, {
				code: 'TELEGRAM_DELIVERY_UNKNOWN',
				retryable: false,
				delivery: 'unknown',
			});
			await vi.advanceTimersByTimeAsync(1_000);
			await assertion;
		} finally {
			vi.useRealTimers();
		}
	});

	it.each([
		{
			name: 'channel administrator with posting permission',
			chatType: 'channel' as const,
			member: { status: 'administrator', can_post_messages: true },
		},
		{
			name: 'channel creator',
			chatType: 'channel' as const,
			member: { status: 'creator' },
		},
		{
			name: 'supergroup member',
			chatType: 'supergroup' as const,
			member: { status: 'member' },
		},
	])('performs a read-only preflight for a $name', async ({ chatType, member }) => {
		const fetchMock = preflightFetch({ chatType, member });
		const result = await createProvider(fetchMock, { chatType }).preflight();

		expect(result).toEqual({
			botIdentityVerified: true,
			destinationVerified: true,
			postingPermissionVerified: true,
			webhookDisabled: true,
			chatType,
		});
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(fetchMock.mock.calls.map(([url]) => String(url).split('/').at(-1))).toEqual([
			'getMe',
			'getChat',
			'getChatMember',
			'getWebhookInfo',
		]);
		expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body))).toEqual({
			chat_id: chatId,
			user_id: 123_456,
		});
	});

	it('fails preflight when getMe does not match the bot identity encoded by the token', async () => {
		const fetchMock = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValue(jsonResponse({ ok: true, result: { id: 999_999, is_bot: true } }));
		await expectProviderError(createProvider(fetchMock).preflight(), {
			code: 'TELEGRAM_BOT_IDENTITY_INVALID',
			retryable: false,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('keeps a preflight network failure retryable without claiming a delivery attempt', async () => {
		const fetchMock = vi
			.fn<typeof globalThis.fetch>()
			.mockRejectedValue(new Error(`network ${token} ${chatId}`));
		const error = await expectProviderError(createProvider(fetchMock).preflight(), {
			code: 'TELEGRAM_PREFLIGHT_UNAVAILABLE',
			retryable: true,
			delivery: 'not_delivered',
		});
		expect(JSON.stringify(error)).not.toContain(token);
		expect(JSON.stringify(error)).not.toContain(chatId);
	});

	it('fails preflight for missing post permission or an active webhook', async () => {
		const permissionFetch = preflightFetch({
			chatType: 'channel',
			member: { status: 'administrator', can_post_messages: false },
		});
		await expectProviderError(createProvider(permissionFetch).preflight(), {
			code: 'TELEGRAM_POST_PERMISSION_MISSING',
			retryable: false,
		});

		const memberWithoutDefaultPermission = preflightFetch({
			chatType: 'supergroup',
			member: { status: 'member' },
		});
		memberWithoutDefaultPermission.mockReset();
		memberWithoutDefaultPermission
			.mockResolvedValueOnce(
				jsonResponse({ ok: true, result: { id: 123_456, is_bot: true } })
			)
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					result: {
						id: Number(chatId),
						type: 'supergroup',
						permissions: { can_send_messages: false },
					},
				})
			)
			.mockResolvedValueOnce(jsonResponse({ ok: true, result: { status: 'member' } }));
		await expectProviderError(
			createProvider(memberWithoutDefaultPermission, { chatType: 'supergroup' }).preflight(),
			{
				code: 'TELEGRAM_POST_PERMISSION_MISSING',
				retryable: false,
			}
		);

		const restrictedNonMember = preflightFetch({
			chatType: 'supergroup',
			member: { status: 'restricted', is_member: false, can_send_messages: true },
		});
		await expectProviderError(
			createProvider(restrictedNonMember, { chatType: 'supergroup' }).preflight(),
			{ code: 'TELEGRAM_POST_PERMISSION_MISSING', retryable: false }
		);

		const webhookFetch = preflightFetch({
			chatType: 'channel',
			member: { status: 'creator' },
			webhookUrl: 'https://unexpected.example.org/telegram',
		});
		await expectProviderError(createProvider(webhookFetch).preflight(), {
			code: 'TELEGRAM_WEBHOOK_MUST_BE_DISABLED',
			retryable: false,
		});
	});

	it.each([
		{ token: 'replace-with-token' },
		{ token: `012345:${'A'.repeat(30)}` },
		{ token: `9007199254740992:${'A'.repeat(30)}` },
		{ chatId: '@bureau-channel' },
		{ chatId: '0012345' },
		{ chatId: '9007199254740992' },
		{ timeoutMs: 999 },
		{ timeoutMs: 30_001 },
	])('rejects unsafe constructor options before any API call: %#', (override) => {
		const fetchMock = vi.fn<typeof globalThis.fetch>();
		expect(() => createProvider(fetchMock, override)).toThrow(TypeError);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('selects the Bot API adapter from validated outbox runtime config without sending', () => {
		const config = loadRuntimeConfig({
			APP_ENV: 'development',
			PORTAL_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
			DB: fakeDb,
			TELEGRAM_PROVIDER: 'bot_api',
			TELEGRAM_BOT_TOKEN: token,
			TELEGRAM_CHAT_ID: chatId,
			TELEGRAM_CHAT_TYPE: 'channel',
			TELEGRAM_ACTIVATION_AT: '2026-08-13T12:00:00.000Z',
		});

		const runtime = createOutboxRuntime(config);
		expect(runtime.telegramProvider).toBeInstanceOf(TelegramBotApiProvider);
	});
});

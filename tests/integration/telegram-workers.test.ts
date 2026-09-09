import { resolve } from 'node:path';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

describe('Telegram native Workers fetch', () => {
	let script: string;
	beforeAll(async () => {
		const bundle = await build({
			configFile: false,
			envFile: false,
			publicDir: false,
			logLevel: 'silent',
			resolve: { alias: { $lib: resolve('src/lib') } },
			build: {
				write: false,
				minify: false,
				lib: { entry: resolve('tests/fixtures/telegram-worker.ts'), formats: ['es'] },
			},
		});
		const output = Array.isArray(bundle) ? bundle[0] : bundle;
		if (!('output' in output)) throw new Error('Expected one Worker bundle.');
		const chunk = output.output.find((item) => item.type === 'chunk' && item.isEntry);
		if (!chunk || chunk.type !== 'chunk') throw new Error('Missing Worker entry.');
		script = chunk.code;
	});

	function startWorker(reply: (request: Request) => Promise<Response> | Response) {
		return new Miniflare(
			convertV4MiniflareOptions({
				modules: true,
				compatibilityDate: '2026-03-24',
				compatibilityFlags: ['nodejs_compat'],
				script,
				outboundService: reply,
			})
		);
	}

	it('sends through default workerd fetch and returns the validated receipt', async () => {
		const outbound: { url: string; method: string; body: unknown }[] = [];
		const worker = startWorker(async (request) => {
			outbound.push({ url: request.url, method: request.method, body: await request.json() });
			return Response.json({
				ok: true,
				result: { message_id: 42, chat: { id: -1001234567890, type: 'channel' } },
			});
		});
		try {
			const response = await worker.dispatchFetch('http://localhost/');
			expect(await response.json()).toEqual({ providerRequestId: 'telegram-message:42' });
			expect(outbound).toEqual([
				{
					url: `https://api.telegram.org/bot123456:${'A'.repeat(30)}/sendMessage`,
					method: 'POST',
					body: {
						chat_id: '-1001234567890',
						text: 'Neue Portal-Mitteilung. Zustellreferenz: TG-ABCDEF012345.',
						link_preview_options: { is_disabled: true },
						protect_content: true,
					},
				},
			]);
		} finally {
			await worker.dispose();
		}
	});

	it('completes read-only destination preflight through default workerd fetch', async () => {
		const outbound: string[] = [];
		const results: Record<string, unknown> = {
			getMe: { id: 123456, is_bot: true },
			getChat: { id: -1001234567890, type: 'channel' },
			getChatMember: { status: 'administrator', can_post_messages: true },
			getWebhookInfo: { url: '' },
		};
		const worker = startWorker((request) => {
			const method = new URL(request.url).pathname.split('/').at(-1)!;
			outbound.push(method);
			return Response.json({ ok: true, result: results[method] });
		});
		try {
			const response = await worker.dispatchFetch('http://localhost/preflight');
			expect(await response.json()).toEqual({
				botIdentityVerified: true,
				destinationVerified: true,
				postingPermissionVerified: true,
				webhookDisabled: true,
				chatType: 'channel',
			});
			expect(outbound).toEqual(['getMe', 'getChat', 'getChatMember', 'getWebhookInfo']);
		} finally {
			await worker.dispose();
		}
	});

	it.each([302, 307])('does not follow HTTP %i or trust its rejection body', async (status) => {
		const outbound: string[] = [];
		const worker = startWorker((request) => {
			outbound.push(request.url);
			return new Response(JSON.stringify({ ok: false, error_code: 429 }), {
				status,
				headers: { location: 'https://redirect.example.test/' },
			});
		});
		try {
			const response = await worker.dispatchFetch('http://localhost/');
			expect(await response.json()).toEqual({
				code: 'TELEGRAM_DELIVERY_UNKNOWN',
				retryable: false,
				delivery: 'unknown',
			});
			expect(outbound).toEqual([
				`https://api.telegram.org/bot123456:${'A'.repeat(30)}/sendMessage`,
			]);
		} finally {
			await worker.dispose();
		}
	});

	it('rejects a preflight redirect without calling another destination', async () => {
		const outbound: string[] = [];
		const worker = startWorker((request) => {
			outbound.push(request.url);
			return Response.redirect('https://redirect.example.test/', 307);
		});
		try {
			const response = await worker.dispatchFetch('http://localhost/preflight');
			expect(await response.json()).toEqual({
				code: 'TELEGRAM_RESPONSE_INVALID',
				retryable: false,
				delivery: 'not_delivered',
			});
			expect(outbound).toEqual([
				`https://api.telegram.org/bot123456:${'A'.repeat(30)}/getMe`,
			]);
		} finally {
			await worker.dispose();
		}
	});
});

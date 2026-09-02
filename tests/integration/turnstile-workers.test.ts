import { resolve } from 'node:path';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

describe('Turnstile native Workers fetch', () => {
	it('sends Siteverify through the default workerd fetch without a receiver error', async () => {
		const bundle = await build({
			configFile: false,
			envFile: false,
			publicDir: false,
			logLevel: 'silent',
			build: {
				write: false,
				minify: false,
				lib: {
					entry: resolve('tests/fixtures/turnstile-worker.ts'),
					formats: ['es'],
				},
			},
		});
		const output = Array.isArray(bundle) ? bundle[0] : bundle;
		if (!('output' in output)) throw new Error('Expected one Worker bundle.');
		const chunk = output.output.find((item) => item.type === 'chunk' && item.isEntry);
		if (!chunk || chunk.type !== 'chunk') throw new Error('Missing Worker entry.');

		const outbound: { url: string; method: string; body: string }[] = [];
		const worker = new Miniflare(
			convertV4MiniflareOptions({
				modules: true,
				compatibilityDate: '2026-03-24',
				compatibilityFlags: ['nodejs_compat'],
				script: chunk.code,
				async outboundService(request) {
					outbound.push({
						url: request.url,
						method: request.method,
						body: await request.text(),
					});
					return Response.json({
						success: true,
						action: 'registration',
						hostname: 'preview.example.test',
					});
				},
			})
		);
		try {
			const response = await worker.dispatchFetch('http://localhost/');
			expect(await response.json()).toEqual({ success: true });
			expect(outbound).toEqual([
				{
					url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
					method: 'POST',
					body: 'secret=synthetic-secret&response=synthetic-token',
				},
			]);
		} finally {
			await worker.dispose();
		}
	});
});

import { resolve } from 'node:path';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { build } from 'vite';
import fixture from '../../fixtures/trial-intake/catalog-v1.json';

it.each([false, true])(
	'uses native workerd fetch/cache and never follows redirects (redirect=%s)',
	async (redirect) => {
		const bundle = await build({
			configFile: false,
			envFile: false,
			publicDir: false,
			logLevel: 'silent',
			resolve: { alias: { $lib: resolve('src/lib') } },
			build: {
				write: false,
				minify: false,
				lib: {
					entry: resolve('tests/fixtures/trial-intake/catalog-worker.ts'),
					formats: ['es'],
				},
			},
		});
		const output = Array.isArray(bundle) ? bundle[0] : bundle;
		if (!('output' in output)) throw new Error('Expected Worker bundle');
		const chunk = output.output.find((item) => item.type === 'chunk' && item.isEntry);
		if (!chunk || chunk.type !== 'chunk') throw new Error('Missing Worker entry');
		const outbound: string[] = [];
		const worker = new Miniflare(
			convertV4MiniflareOptions({
				modules: true,
				compatibilityDate: '2026-03-24',
				script: chunk.code,
				outboundService(request) {
					outbound.push(request.url);
					return redirect
						? Response.redirect('https://untrusted.example.test/', 302)
						: new Response(
								`<script type="application/json" id="trial-intake-catalog">${JSON.stringify(fixture)}</script>`
							);
				},
			})
		);
		try {
			const response = await worker.dispatchFetch('http://localhost/');
			expect(await response.json()).toEqual(
				redirect
					? { code: 'CATALOG_FAILED' }
					: { first: fixture.lessons, cached: fixture.lessons }
			);
			expect(response.status).toBe(redirect ? 503 : 200);
			expect(outbound).toEqual(['https://schedule.example.test/']);
		} finally {
			await worker.dispose();
		}
	}
);

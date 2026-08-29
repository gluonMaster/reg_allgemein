// @ts-check
import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { join, resolve } from 'node:path';

const authenticatedE2e = process.env.KOLIBRI_E2E === '1';
const e2eRuntimeRoot = process.env.KOLIBRI_E2E_RUNTIME_ROOT
	? resolve(process.env.KOLIBRI_E2E_RUNTIME_ROOT)
	: null;
if (authenticatedE2e && !e2eRuntimeRoot) {
	throw new Error('KOLIBRI_E2E_RUNTIME_ROOT is required for an authenticated E2E run.');
}
const platformProxy = authenticatedE2e
	? {
			configPath: 'wrangler.e2e.toml',
			envFiles: [join(e2eRuntimeRoot, 'runtime.env')],
			persist: { path: join(e2eRuntimeRoot, 'state', 'v3') },
			remoteBindings: false,
		}
	: {
			configPath: 'wrangler.local.toml',
			persist: { path: '.wrangler/state/v3' },
			remoteBindings: false,
		};

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			config: 'wrangler.adapter.toml',
			platformProxy,
		}),
	},
};

export default config;

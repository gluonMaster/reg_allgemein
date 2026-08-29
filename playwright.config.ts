import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.KOLIBRI_E2E_PORT ?? '4173');
if (!Number.isSafeInteger(e2ePort) || e2ePort < 1 || e2ePort > 65_535) {
	throw new Error('KOLIBRI_E2E_PORT must be a valid TCP port.');
}
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
	testDir: './tests/e2e',
	globalTeardown: './tests/e2e/global-teardown.ts',
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	// The authenticated suite intentionally exercises revocation/blocking against a
	// freshly seeded local D1. Retrying against that mutated state would be misleading.
	retries: 0,
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: e2eOrigin,
		trace: 'retain-on-failure',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: {
		command: 'node scripts/run-e2e-server.js',
		url: e2eOrigin,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});

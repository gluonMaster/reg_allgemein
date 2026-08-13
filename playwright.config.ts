import { defineConfig, devices } from '@playwright/test';

const e2eOrigin = 'http://127.0.0.1:4173';

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

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		include: ['tests/{unit,integration}/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'node',
		setupFiles: ['./tests/setup.ts'],
		testTimeout: 15_000,
		// Applying the full append-only D1 migration chain is intentionally part of
		// every integration fixture. Keep assertions tight, but leave enough room
		// for Miniflare setup when the full suite runs several fixtures in parallel.
		hookTimeout: 30_000,
	},
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib'),
		},
	},
});

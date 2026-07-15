import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		include: ['tests/{unit,integration}/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'node',
		setupFiles: ['./tests/setup.ts'],
		testTimeout: 15_000,
		hookTimeout: 15_000,
	},
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib'),
		},
	},
});

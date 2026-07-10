import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		include: ['tests/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'node',
		setupFiles: ['./tests/setup.ts'], // Загружаем моки перед тестами
	},
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib'),
		},
	},
});

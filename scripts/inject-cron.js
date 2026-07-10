/**
 * Post-build script: inject a Cloudflare Cron handler into the generated
 * SvelteKit worker. The handler itself lives in src/worker.ts.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const workerPath = join(__dirname, '..', '.svelte-kit', 'cloudflare', '_worker.js');

try {
	if (!existsSync(workerPath)) {
		console.error('Worker file not found:', workerPath);
		console.error('   Make sure to run this script after vite build.');
		process.exit(1);
	}

	let workerCode = readFileSync(workerPath, 'utf-8');

	if (workerCode.includes('export { scheduled }')) {
		console.log('Scheduled handler already injected, skipping.');
		process.exit(0);
	}

	const scheduledExport = `
// ========================================
// Cloudflare Cron Handler
// Automatically injected by scripts/inject-cron.js
// ========================================
export { scheduled } from '../../src/worker.ts';
`;

	workerCode += scheduledExport;
	writeFileSync(workerPath, workerCode, 'utf-8');

	console.log('Successfully injected scheduled handler into _worker.js');
	console.log('   Cloudflare Cron triggers will now work.');
	console.log('   Default schedule: every 15 minutes, configured in wrangler.toml.');
} catch (error) {
	console.error('Error injecting scheduled handler:', error);
	process.exit(1);
}

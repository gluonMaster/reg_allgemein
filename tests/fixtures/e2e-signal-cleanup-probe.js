// @ts-check
import { createE2eRunDirectory, cleanupE2eRunDirectory } from '../../scripts/e2e-run-lifecycle.js';

const base = process.argv[2];
if (!base) throw new Error('Probe base directory is required.');
const run = createE2eRunDirectory(base);
process.stdout.write(`${run.root}\n`);
const cleanup = () => {
	cleanupE2eRunDirectory(run);
	process.exit(0);
};
process.once('SIGINT', cleanup);
process.once('SIGTERM', cleanup);
setInterval(() => undefined, 1_000);

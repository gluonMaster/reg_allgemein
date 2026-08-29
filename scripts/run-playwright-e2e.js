// @ts-check
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withE2eRunDirectory } from './e2e-run-lifecycle.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function reserveAvailablePort() {
	const server = createServer();
	await new Promise((resolveListen, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolveListen);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Unable to allocate an E2E port.');
	await new Promise((resolveClose, reject) =>
		server.close((error) => (error ? reject(error) : resolveClose(undefined)))
	);
	return address.port;
}

const exitCode = await withE2eRunDirectory(async (run) => {
	const port = process.env.KOLIBRI_E2E_PORT ?? String(await reserveAvailablePort());
	console.log(`[e2e] local port ${port}`);
	const playwrightCli = resolve(repositoryRoot, 'node_modules', '@playwright', 'test', 'cli.js');
	const child = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
		cwd: repositoryRoot,
		env: {
			...process.env,
			KOLIBRI_E2E_PORT: port,
			KOLIBRI_E2E_RUNTIME_ROOT: run.root,
		},
		stdio: 'inherit',
	});

	for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
		process.once(signal, () => child.kill(signal));
	}

	return await new Promise((resolveExit, reject) => {
		child.once('error', reject);
		child.once('exit', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
	});
});
process.exitCode = exitCode;

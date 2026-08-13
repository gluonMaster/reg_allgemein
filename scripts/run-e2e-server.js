// @ts-check
import { randomBytes } from 'node:crypto';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wranglerRoot = resolve(repositoryRoot, '.wrangler');
const runtimeRoot = resolve(wranglerRoot, 'e2e-runtime');
const expectedRelativeTarget = join('.wrangler', 'e2e-runtime');
const actualRelativeTarget = relative(repositoryRoot, runtimeRoot);
const runtimeEnvironmentFile = resolve(runtimeRoot, 'runtime.env');

if (
	actualRelativeTarget !== expectedRelativeTarget ||
	runtimeRoot !== resolve(repositoryRoot, expectedRelativeTarget) ||
	runtimeRoot === repositoryRoot
) {
	throw new Error('Refusing to reset an E2E path outside .wrangler/e2e-runtime.');
}

if (existsSync(wranglerRoot) && lstatSync(wranglerRoot).isSymbolicLink()) {
	throw new Error('Refusing to reset E2E state through a symbolic .wrangler directory.');
}
if (existsSync(runtimeRoot) && lstatSync(runtimeRoot).isSymbolicLink()) {
	throw new Error('Refusing to reset a symbolic .wrangler/e2e-runtime path.');
}

rmSync(runtimeRoot, { recursive: true, force: true });
mkdirSync(runtimeRoot, { recursive: true });

const syntheticJwtSecret = randomBytes(48).toString('base64url');
writeFileSync(runtimeEnvironmentFile, `JWT_SECRET=${syntheticJwtSecret}\n`, {
	encoding: 'utf8',
	mode: 0o600,
});

const wranglerBin = resolve(repositoryRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const viteBin = resolve(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const persistedState = join('.wrangler', 'e2e-runtime');
const wranglerConfig = 'wrangler.e2e.toml';

/** @param {string[]} arguments_ */
function runWrangler(arguments_) {
	const result = spawnSync(process.execPath, [wranglerBin, ...arguments_], {
		cwd: repositoryRoot,
		env: { ...process.env, CI: '1' },
		stdio: 'inherit',
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`Local E2E Wrangler command failed with status ${result.status}.`);
	}
}

try {
	runWrangler([
		'd1',
		'migrations',
		'apply',
		'DB',
		'--local',
		'--config',
		wranglerConfig,
		'--persist-to',
		persistedState,
	]);
	runWrangler([
		'd1',
		'execute',
		'DB',
		'--local',
		'--config',
		wranglerConfig,
		'--persist-to',
		persistedState,
		'--file',
		'tests/e2e/fixtures/authenticated-seed.sql',
		'--yes',
	]);
} catch (error) {
	rmSync(runtimeEnvironmentFile, { force: true });
	throw error;
}

const vite = spawn(
	process.execPath,
	[viteBin, 'dev', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
	{
		cwd: repositoryRoot,
		env: { ...process.env, KOLIBRI_E2E: '1' },
		stdio: 'inherit',
	}
);

let stopping = false;
const removeGeneratedEnvironment = () => rmSync(runtimeEnvironmentFile, { force: true });

/** @param {NodeJS.Signals} signal */
function stop(signal) {
	if (stopping) return;
	stopping = true;
	if (vite.exitCode === null && vite.signalCode === null) vite.kill(signal);
}

process.once('SIGINT', () => {
	removeGeneratedEnvironment();
	stop('SIGINT');
});
process.once('SIGTERM', () => {
	removeGeneratedEnvironment();
	stop('SIGTERM');
});
process.once('exit', removeGeneratedEnvironment);

vite.once('error', (error) => {
	removeGeneratedEnvironment();
	throw error;
});
vite.once('exit', (code, signal) => {
	removeGeneratedEnvironment();
	if (!stopping && code !== 0) {
		process.exitCode = code ?? (signal ? 1 : 0);
	}
});

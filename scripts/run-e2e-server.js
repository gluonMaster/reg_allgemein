// @ts-check
import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wranglerRoot = resolve(repositoryRoot, '.wrangler');
const runtimeRoot = resolve(wranglerRoot, 'e2e-runtime');
const expectedRelativeTarget = join('.wrangler', 'e2e-runtime');
const actualRelativeTarget = relative(repositoryRoot, runtimeRoot);
const runtimeEnvironmentFile = resolve(runtimeRoot, 'runtime.env');
const wranglerLogRoot = resolve(tmpdir(), 'reg-allgemein-wrangler-e2e-logs');
const wranglerConfigRoot = resolve(tmpdir(), 'reg-allgemein-wrangler-e2e-config');

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
mkdirSync(wranglerLogRoot, { recursive: true });
mkdirSync(wranglerConfigRoot, { recursive: true });

const syntheticJwtSecret = randomBytes(48).toString('base64url');
writeFileSync(runtimeEnvironmentFile, `JWT_SECRET=${syntheticJwtSecret}\n`, {
	encoding: 'utf8',
	mode: 0o600,
});

const wranglerBin = resolve(repositoryRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const persistedState = join('.wrangler', 'e2e-runtime');
const wranglerConfig = 'wrangler.e2e.toml';
const localWranglerEnvironment = {
	...process.env,
	WRANGLER_LOG_PATH: wranglerLogRoot,
	XDG_CONFIG_HOME: wranglerConfigRoot,
};

/** @param {string[]} arguments_ */
function runWrangler(arguments_) {
	const result = spawnSync(process.execPath, [wranglerBin, ...arguments_], {
		cwd: repositoryRoot,
		env: { ...localWranglerEnvironment, CI: '1' },
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

process.env.KOLIBRI_E2E = '1';
process.env.WRANGLER_LOG_PATH = wranglerLogRoot;
process.env.XDG_CONFIG_HOME = wranglerConfigRoot;

const removeGeneratedEnvironment = () => rmSync(runtimeEnvironmentFile, { force: true });
const vite = await createServer({
	root: repositoryRoot,
	server: {
		host: '127.0.0.1',
		port: 4173,
		strictPort: true,
	},
});

try {
	await vite.listen();
	vite.printUrls();
} catch (error) {
	removeGeneratedEnvironment();
	throw error;
}

let stopping = false;
const runtimeEnvironmentWatch = setInterval(() => {
	if (!existsSync(runtimeEnvironmentFile)) stop();
}, 250);

function stop() {
	if (stopping) return;
	stopping = true;
	clearInterval(runtimeEnvironmentWatch);
	removeGeneratedEnvironment();
	process.exit(0);
}

process.once('SIGINT', () => {
	stop();
});
process.once('SIGTERM', () => {
	stop();
});
process.once('exit', removeGeneratedEnvironment);

vite.httpServer?.once('error', () => {
	clearInterval(runtimeEnvironmentWatch);
	removeGeneratedEnvironment();
	process.exit(1);
});
vite.httpServer?.once('close', () => {
	clearInterval(runtimeEnvironmentWatch);
	removeGeneratedEnvironment();
	if (!stopping) process.exit(1);
});

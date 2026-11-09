// @ts-check
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = process.env.KOLIBRI_E2E_RUNTIME_ROOT;
if (!runtimeRoot) {
	throw new Error('KOLIBRI_E2E_RUNTIME_ROOT must be owned by the E2E wrapper.');
}
const run = {
	root: resolve(runtimeRoot),
	runtimeEnvironmentFile: join(resolve(runtimeRoot), 'runtime.env'),
	stateRoot: join(resolve(runtimeRoot), 'state'),
	logRoot: join(resolve(runtimeRoot), 'logs'),
	configRoot: join(resolve(runtimeRoot), 'config'),
};
const port = Number(process.env.KOLIBRI_E2E_PORT ?? '4173');
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
	throw new Error('KOLIBRI_E2E_PORT must be a valid TCP port.');
}

const syntheticJwtSecret = randomBytes(48).toString('base64url');
const intakeTestEnvironment = process.env.KOLIBRI_E2E_TRIAL_INTAKE === '1'
	? 'PORTAL_MODE=trial_intake\nTRIAL_INTAKE_ACCEPTING=true\nTRIAL_INTAKE_SCHEDULE_URL=https://schedule.example.test/\n'
	: '';
if (intakeTestEnvironment) {
	// Test process only: keep production readers, HTTP validation and D1 real;
	// replace only the two external boundaries. No provider request may escape.
	const actualFetch = globalThis.fetch.bind(globalThis);
	const fixture = (name) => JSON.parse(readFileSync(join(repositoryRoot, 'tests/fixtures/trial-intake', name), 'utf8'));
	// The shared reader/exporter fixture plus one class group, so the browser sees the age rules,
	// and one planned course for the waitlist.
	const shared = fixture('catalog-v1.json');
	const catalog = JSON.stringify({
		...shared,
		lessons: [
			...shared.lessons,
			...fixture('catalog-e2e-ages.json').lessons,
			...fixture('catalog-e2e-planned.json').lessons,
		],
	});
	globalThis.fetch = async (input, init) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		if (url.href === 'https://schedule.example.test/') return new Response(`<script type="application/json" id="trial-intake-catalog">${catalog.replaceAll('<', '\\u003c')}</script>`);
		if (url.href === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
			const token = new URLSearchParams(String(init?.body)).get('response');
			return Response.json({success: token === 'synthetic-turnstile-pass', action: 'trial_intake', hostname: '127.0.0.1'});
		}
		if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return actualFetch(input, init);
		throw new Error('External network disabled in synthetic intake harness');
	};
}
writeFileSync(run.runtimeEnvironmentFile, `JWT_SECRET=${syntheticJwtSecret}\n${intakeTestEnvironment}`, {
	encoding: 'utf8',
	mode: 0o600,
});

const wranglerBin = resolve(repositoryRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const wranglerConfig = 'wrangler.e2e.toml';
const localWranglerEnvironment = {
	...process.env,
	CI: '1',
	WRANGLER_LOG_PATH: run.logRoot,
	XDG_CONFIG_HOME: run.configRoot,
};

/** @param {string[]} arguments_ */
function runWrangler(arguments_) {
	const result = spawnSync(process.execPath, [wranglerBin, ...arguments_], {
		cwd: repositoryRoot,
		env: localWranglerEnvironment,
		stdio: 'inherit',
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`Local E2E Wrangler command failed with status ${result.status}.`);
	}
}

let vite;
let runtimeEnvironmentWatch;
let stopping;

async function shutdown(exitCode) {
	if (stopping) return stopping;
	if (runtimeEnvironmentWatch) clearInterval(runtimeEnvironmentWatch);
	// Vite can wait indefinitely for keep-alive browser connections during a
	// Playwright-owned shutdown. The process exit is the lifecycle boundary, so
	// close active sockets first and let Node release the listener immediately.
	vite?.httpServer?.closeAllConnections?.();
	stopping = Promise.resolve(exitCode);
	return stopping;
}

function requestShutdown(exitCode) {
	void shutdown(exitCode)
		.then((code) => process.exit(code))
		.catch(() => process.exit(1));
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
	process.once(signal, () => requestShutdown(0));
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
		run.stateRoot,
	]);
	runWrangler([
		'd1',
		'execute',
		'DB',
		'--local',
		'--config',
		wranglerConfig,
		'--persist-to',
		run.stateRoot,
		'--file',
		'tests/e2e/fixtures/authenticated-seed.sql',
		'--yes',
	]);

	process.env.KOLIBRI_E2E = '1';
	process.env.KOLIBRI_E2E_PORT = String(port);
	process.env.KOLIBRI_E2E_RUNTIME_ROOT = run.root;
	process.env.WRANGLER_LOG_PATH = run.logRoot;
	process.env.XDG_CONFIG_HOME = run.configRoot;

	vite = await createServer({
		root: repositoryRoot,
		server: {
			host: '127.0.0.1',
			port,
			strictPort: true,
		},
	});
	await vite.listen();
	vite.printUrls();
	runtimeEnvironmentWatch = setInterval(() => {
		if (!existsSync(run.runtimeEnvironmentFile)) requestShutdown(1);
	}, 250);
	vite.httpServer?.once('error', () => requestShutdown(1));
	vite.httpServer?.once('close', () => {
		if (!stopping) requestShutdown(1);
	});
} catch (error) {
	await shutdown(1);
	throw error;
}

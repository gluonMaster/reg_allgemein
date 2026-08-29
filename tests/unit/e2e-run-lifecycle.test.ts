import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	cleanupE2eRunDirectory,
	createE2eRunDirectory,
	withE2eRunDirectory,
} from '../../scripts/e2e-run-lifecycle.js';
import removeSyntheticRuntimeSecret from '../e2e/global-teardown';

function temporaryBase(): string {
	return mkdtempSync(join(tmpdir(), 'reg-allgemein-e2e-lifecycle-test-'));
}

describe('E2E run-owned lifecycle', () => {
	it('removes every owned artifact after success and leaves siblings untouched', async () => {
		const base = temporaryBase();
		const sibling = join(base, 'unrelated.txt');
		writeFileSync(sibling, 'keep', 'utf8');
		let runRoot = '';
		try {
			await withE2eRunDirectory(async (run) => {
				runRoot = run.root;
				writeFileSync(run.runtimeEnvironmentFile, 'JWT_SECRET=synthetic\n', 'utf8');
				writeFileSync(join(run.logRoot, 'wrangler.log'), 'synthetic', 'utf8');
				writeFileSync(join(run.configRoot, 'config.json'), '{}', 'utf8');
				writeFileSync(join(run.stateRoot, 'state.bin'), 'synthetic', 'utf8');
			}, base);
			expect(existsSync(runRoot)).toBe(false);
			expect(existsSync(sibling)).toBe(true);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it('runs the same cleanup after failure and creates collision-free parallel roots', async () => {
		const base = temporaryBase();
		let failedRoot = '';
		try {
			await expect(
				withE2eRunDirectory(async (run) => {
					failedRoot = run.root;
					writeFileSync(run.runtimeEnvironmentFile, 'JWT_SECRET=synthetic\n', 'utf8');
					throw new Error('injected E2E startup failure');
				}, base)
			).rejects.toThrow('injected E2E startup failure');
			expect(existsSync(failedRoot)).toBe(false);

			const first = createE2eRunDirectory(base);
			const second = createE2eRunDirectory(base);
			expect(first.root).not.toBe(second.root);
			cleanupE2eRunDirectory(first);
			expect(existsSync(second.root)).toBe(true);
			cleanupE2eRunDirectory(second);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it('signals the owned web server by removing only its runtime environment file', () => {
		const run = createE2eRunDirectory();
		const previousRoot = process.env.KOLIBRI_E2E_RUNTIME_ROOT;
		try {
			writeFileSync(run.runtimeEnvironmentFile, 'JWT_SECRET=synthetic\n', 'utf8');
			writeFileSync(join(run.stateRoot, 'state.bin'), 'keep-until-wrapper-finally', 'utf8');
			process.env.KOLIBRI_E2E_RUNTIME_ROOT = run.root;
			removeSyntheticRuntimeSecret();
			expect(existsSync(run.runtimeEnvironmentFile)).toBe(false);
			expect(existsSync(run.root)).toBe(true);
			expect(existsSync(join(run.stateRoot, 'state.bin'))).toBe(true);
		} finally {
			if (previousRoot === undefined) delete process.env.KOLIBRI_E2E_RUNTIME_ROOT;
			else process.env.KOLIBRI_E2E_RUNTIME_ROOT = previousRoot;
			cleanupE2eRunDirectory(run);
		}
	});

	it.skipIf(process.platform === 'win32')(
		'removes the owned root when a supported termination signal arrives',
		async () => {
			const base = temporaryBase();
			try {
				const child = spawn(
					process.execPath,
					[resolve('tests/fixtures/e2e-signal-cleanup-probe.js'), base],
					{ stdio: ['ignore', 'pipe', 'inherit'] }
				);
				const runRoot = await new Promise<string>((resolveRoot, reject) => {
					child.once('error', reject);
					child.stdout!.once('data', (chunk) => resolveRoot(String(chunk).trim()));
				});
				expect(existsSync(runRoot)).toBe(true);
				child.kill('SIGTERM');
				await new Promise<void>((resolveExit, reject) => {
					child.once('error', reject);
					child.once('exit', () => resolveExit());
				});
				expect(existsSync(runRoot)).toBe(false);
			} finally {
				rmSync(base, { recursive: true, force: true });
			}
		}
	);
});

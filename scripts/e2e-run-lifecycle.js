// @ts-check
import { randomUUID } from 'node:crypto';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';

export const E2E_RUN_PREFIX = 'reg-allgemein-e2e-run-';
const OWNER_MARKER = '.run-owner';

/** @typedef {{ root: string; base: string; ownerToken: string; runtimeEnvironmentFile: string; stateRoot: string; logRoot: string; configRoot: string }} E2eRunDirectory */

/** @param {string} [baseDirectory] @returns {E2eRunDirectory} */
export function createE2eRunDirectory(baseDirectory = tmpdir()) {
	const base = resolve(baseDirectory);
	mkdirSync(base, { recursive: true });
	const root = mkdtempSync(join(base, E2E_RUN_PREFIX));
	const ownerToken = randomUUID();
	writeFileSync(join(root, OWNER_MARKER), ownerToken, { encoding: 'utf8', mode: 0o600 });
	const stateRoot = join(root, 'state');
	const logRoot = join(root, 'logs');
	const configRoot = join(root, 'config');
	for (const directory of [stateRoot, logRoot, configRoot]) {
		mkdirSync(directory, { recursive: true });
	}
	return {
		root,
		base,
		ownerToken,
		runtimeEnvironmentFile: join(root, 'runtime.env'),
		stateRoot,
		logRoot,
		configRoot,
	};
}

/** @param {E2eRunDirectory} run */
function assertOwnedRunDirectory(run) {
	const root = resolve(run.root);
	const base = resolve(run.base);
	if (
		root === base ||
		dirname(root) !== base ||
		relative(base, root).startsWith('..') ||
		!basename(root).startsWith(E2E_RUN_PREFIX)
	) {
		throw new Error('Refusing to clean a path outside the owned E2E run namespace.');
	}
	if (!existsSync(root)) return false;
	if (lstatSync(root).isSymbolicLink()) {
		throw new Error('Refusing to clean a symbolic E2E run directory.');
	}
	const marker = join(root, OWNER_MARKER);
	if (
		!existsSync(marker) ||
		lstatSync(marker).isSymbolicLink() ||
		readFileSync(marker, 'utf8') !== run.ownerToken
	) {
		throw new Error('Refusing to clean an E2E directory without its ownership marker.');
	}
	return true;
}

/** @param {E2eRunDirectory} run */
export function cleanupE2eRunDirectory(run) {
	if (!assertOwnedRunDirectory(run)) return;
	rmSync(run.root, { recursive: true, force: true });
}

/**
 * @template T
 * @param {(run: E2eRunDirectory) => Promise<T>} work
 * @param {string} [baseDirectory]
 */
export async function withE2eRunDirectory(work, baseDirectory) {
	const run = createE2eRunDirectory(baseDirectory);
	try {
		return await work(run);
	} finally {
		cleanupE2eRunDirectory(run);
	}
}

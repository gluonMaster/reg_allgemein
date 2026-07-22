// @ts-check
import { existsSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateRoot = resolve(repositoryRoot, '.wrangler', 'state', 'v3');
const d1State = resolve(stateRoot, 'd1');
const relativeTarget = relative(stateRoot, d1State);

if (relativeTarget.startsWith('..') || relativeTarget === '') {
	throw new Error('Refusing to remove a D1 path outside the local Wrangler state directory.');
}

if (!existsSync(d1State)) {
	console.log('Local D1 state is already empty.');
	process.exit(0);
}

rmSync(d1State, { recursive: true, force: true });
console.log('Removed local D1 state from .wrangler/state/v3/d1.');

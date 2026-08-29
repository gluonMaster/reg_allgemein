import { existsSync, lstatSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { E2E_RUN_PREFIX } from '../../scripts/e2e-run-lifecycle.js';

export default function removeSyntheticRuntimeSecret(): void {
	const configuredRoot = process.env.KOLIBRI_E2E_RUNTIME_ROOT;
	if (!configuredRoot) throw new Error('Missing E2E runtime root during global teardown.');
	const runtimeRoot = resolve(configuredRoot);
	const expectedBase = resolve(tmpdir());
	const runtimeEnvironmentFile = join(runtimeRoot, 'runtime.env');
	const ownerMarker = join(runtimeRoot, '.run-owner');

	if (dirname(runtimeRoot) !== expectedBase || !basename(runtimeRoot).startsWith(E2E_RUN_PREFIX)) {
		throw new Error('Refusing to signal an E2E path outside the owned temp namespace.');
	}
	if (
		!existsSync(runtimeRoot) ||
		lstatSync(runtimeRoot).isSymbolicLink() ||
		!existsSync(ownerMarker) ||
		lstatSync(ownerMarker).isSymbolicLink()
	) {
		throw new Error('Refusing to signal an E2E root without a regular ownership marker.');
	}
	if (!existsSync(runtimeEnvironmentFile)) return;
	if (lstatSync(runtimeEnvironmentFile).isSymbolicLink()) {
		throw new Error('Refusing to clean a symbolic E2E runtime environment file.');
	}
	unlinkSync(runtimeEnvironmentFile);
}

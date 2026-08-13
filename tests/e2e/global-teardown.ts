import { existsSync, lstatSync, unlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export default function removeSyntheticRuntimeSecret(): void {
	const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
	const runtimeRoot = resolve(repositoryRoot, '.wrangler', 'e2e-runtime');
	const runtimeEnvironmentFile = resolve(runtimeRoot, 'runtime.env');

	if (relative(repositoryRoot, runtimeRoot) !== join('.wrangler', 'e2e-runtime')) {
		throw new Error('Refusing to clean an E2E path outside .wrangler/e2e-runtime.');
	}
	if (!existsSync(runtimeEnvironmentFile)) return;
	if (lstatSync(runtimeEnvironmentFile).isSymbolicLink()) {
		throw new Error('Refusing to clean a symbolic E2E runtime environment file.');
	}
	unlinkSync(runtimeEnvironmentFile);
}

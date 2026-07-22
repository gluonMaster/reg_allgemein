import { basename, extname } from 'node:path';

const expectedTextExtensions = new Set([
	'.cjs',
	'.css',
	'.csv',
	'.d.ts',
	'.graphql',
	'.htm',
	'.html',
	'.js',
	'.json',
	'.jsonc',
	'.jsx',
	'.lock',
	'.md',
	'.mjs',
	'.scss',
	'.sql',
	'.svelte',
	'.svg',
	'.toml',
	'.ts',
	'.tsx',
	'.txt',
	'.xml',
	'.yaml',
	'.yml',
]);

export function requiresTextScan(path: string): boolean {
	const normalized = path.replaceAll('\\', '/').toLocaleLowerCase('en-US');
	const fileName = basename(normalized);
	if (expectedTextExtensions.has(extname(fileName))) return true;
	return (
		fileName === '.gitignore' ||
		fileName === 'dockerfile' ||
		/^\.(?:dev\.vars|env)(?:\..+)?$/u.test(fileName)
	);
}

export function hasUnexpectedTextControl(buffer: Buffer): boolean {
	for (const byte of buffer) {
		if ((byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte === 127) {
			return true;
		}
	}
	return false;
}

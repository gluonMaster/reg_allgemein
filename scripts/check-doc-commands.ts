import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface CommandProblem {
	file: string;
	line: number;
	rule: string;
	target: string;
}

const repositoryRoot = resolve(process.cwd());
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};
const packageScripts = new Set(Object.keys(packageJson.scripts ?? {}));
const packageNames = new Set([
	...Object.keys(packageJson.dependencies ?? {}),
	...Object.keys(packageJson.devDependencies ?? {}),
]);
const allowedNpxCommands = new Set(['playwright', 'tsx', 'vitest', 'wrangler']);

function markdownFiles(): string[] {
	return execFileSync(
		'git',
		['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md'],
		{ cwd: repositoryRoot, encoding: 'buffer' }
	)
		.toString('utf8')
		.split('\0')
		.filter(Boolean)
		.sort((left, right) => left.localeCompare(right));
}

function sanitized(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, 180);
}

function isPlaceholder(value: string): boolean {
	return /[<$>{}]|\$env:|%[A-Z_]+%/i.test(value);
}

function commandLines(markdown: string): Array<{ line: number; text: string }> {
	const lines = markdown.split(/\r?\n/);
	const commands: Array<{ line: number; text: string }> = [];
	let executableFence = false;
	let fenceMarker = '';
	for (const [index, line] of lines.entries()) {
		const opening = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([\w-]*)/);
		if (opening) {
			if (fenceMarker && opening[1][0] === fenceMarker[0]
				&& opening[1].length >= fenceMarker.length) {
				executableFence = false;
				fenceMarker = '';
			} else if (!fenceMarker) {
				fenceMarker = opening[1];
				executableFence = /^(?:bash|console|powershell|ps1|sh|shell)$/i.test(opening[2]);
			}
			continue;
		}
		if (executableFence) commands.push({ line: index + 1, text: line.trim() });
	}
	return commands;
}

function validateCommand(file: string, line: number, text: string): CommandProblem[] {
	if (!text || text.startsWith('#') || text.startsWith('//')) return [];
	const problems: CommandProblem[] = [];
	for (const match of text.matchAll(/\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g)) {
		if (!packageScripts.has(match[1])) {
			problems.push({ file, line, rule: 'missing-package-script', target: match[1] });
		}
	}
	for (const match of text.matchAll(/\bnpx\s+([A-Za-z0-9@/_-]+)/g)) {
		const command = match[1].replace(/^@[^/]+\//, '');
		if (!allowedNpxCommands.has(command)
			&& !packageNames.has(match[1]) && !packageNames.has(command)) {
			problems.push({ file, line, rule: 'untracked-npx-command', target: match[1] });
		}
	}
	for (const match of text.matchAll(/\b(?:node|tsx)\s+([^\s"']+)/g)) {
		const candidate = match[1].replace(/[;,]$/, '');
		if (!isPlaceholder(candidate) && !existsSync(resolve(repositoryRoot, candidate))) {
			problems.push({ file, line, rule: 'missing-command-file', target: candidate });
		}
	}
	for (const match of text.matchAll(/--config\s+([^\s"']+)/g)) {
		const candidate = match[1].replace(/[;,]$/, '');
		if (!isPlaceholder(candidate) && !existsSync(resolve(repositoryRoot, candidate))) {
			problems.push({ file, line, rule: 'missing-config-file', target: candidate });
		}
	}
	const requireFlags = (commandPattern: RegExp, flags: readonly string[]) => {
		if (!commandPattern.test(text)) return;
		for (const flag of flags) {
			if (!text.includes(flag)) {
				problems.push({ file, line, rule: 'missing-required-command-flag', target: flag });
			}
		}
	};
	requireFlags(/\bwrangler\s+r2\s+bucket\s+create\b/, ['--jurisdiction eu', '--config']);
	if (file === 'docs/operations/PRODUCTION_DEPLOYMENT.md') {
		requireFlags(/\bnpm\s+run\s+import:schedule(?::local)?\b/, [
			'--academic-period', '--action', '--source', '--html',
		]);
	}
	if (/\bwrangler\s+d1\b/.test(text) && text.includes('--remote')) {
		requireFlags(/\bwrangler\s+d1\b/, ['--config']);
	}
	requireFlags(/\bwrangler\s+deploy\b/, ['--config']);
	return problems;
}

const problems: CommandProblem[] = [];
let checkedCommands = 0;
for (const file of markdownFiles()) {
	const markdown = readFileSync(resolve(repositoryRoot, file), 'utf8');
	for (const command of commandLines(markdown)) {
		if (!/\b(?:npm|npx|node|tsx)\b|--config\b/.test(command.text)) continue;
		checkedCommands += 1;
		problems.push(...validateCommand(file, command.line, command.text));
	}
}

for (const problem of problems) {
	console.error(`${sanitized(problem.file)}:${problem.line} ${problem.rule} ${sanitized(problem.target)}`);
}
if (problems.length > 0) {
	console.error(`Documentation command check failed: ${problems.length} problem(s).`);
	process.exitCode = 1;
} else {
	console.log(`Documentation command check passed: ${checkedCommands} executable command line(s).`);
}

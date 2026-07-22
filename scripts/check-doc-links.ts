import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

interface MarkdownLink {
	destination: string;
	line: number;
}

interface LinkProblem {
	file: string;
	line: number;
	rule:
		| 'invalid-encoding'
		| 'outside-repository'
		| 'missing-target'
		| 'path-case'
		| 'missing-anchor';
	target: string;
}

const repositoryRoot = resolve(process.cwd());

function gitMarkdownFiles(): string[] {
	const output = execFileSync(
		'git',
		['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md'],
		{ cwd: repositoryRoot, encoding: 'buffer' }
	);

	return output
		.toString('utf8')
		.split('\0')
		.filter(Boolean)
		.sort((left, right) => left.localeCompare(right));
}

function stripFencedCode(lines: string[]): string[] {
	let fence: { character: string; length: number } | undefined;

	return lines.map((line) => {
		const opening = line.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (fence) {
			if (
				opening &&
				opening[1][0] === fence.character &&
				opening[1].length >= fence.length &&
				line.slice(opening[0].length).trim() === ''
			) {
				fence = undefined;
			}
			return '';
		}

		if (opening) {
			const marker = opening[1];
			fence = { character: marker[0], length: marker.length };
			return '';
		}

		return line;
	});
}

function stripLinkCode(lines: string[]): string[] {
	return stripFencedCode(lines).map((line) => {
		let result = '';
		let cursor = 0;
		while (cursor < line.length) {
			if (line[cursor] !== '`') {
				result += line[cursor];
				cursor += 1;
				continue;
			}

			let markerEnd = cursor;
			while (line[markerEnd] === '`') markerEnd += 1;
			const marker = line.slice(cursor, markerEnd);
			const closing = line.indexOf(marker, markerEnd);
			if (closing === -1) {
				result += marker;
				cursor = markerEnd;
				continue;
			}

			result += ' '.repeat(closing + marker.length - cursor);
			cursor = closing + marker.length;
		}
		return result;
	});
}

function unescapeMarkdownDestination(destination: string): string {
	return destination.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1');
}

function extractInlineLinks(line: string, lineNumber: number): MarkdownLink[] {
	const links: MarkdownLink[] = [];
	let cursor = 0;

	while (cursor < line.length) {
		const opening = line.indexOf('](', cursor);
		if (opening === -1) break;

		let position = opening + 2;
		while (/\s/.test(line[position] ?? '')) position += 1;
		let destination = '';

		if (line[position] === '<') {
			position += 1;
			while (position < line.length && line[position] !== '>') {
				destination += line[position];
				position += 1;
			}
		} else {
			let nestedParentheses = 0;
			let escaped = false;
			while (position < line.length) {
				const character = line[position];
				if (escaped) {
					destination += character;
					escaped = false;
					position += 1;
					continue;
				}
				if (character === '\\') {
					destination += character;
					escaped = true;
					position += 1;
					continue;
				}
				if (character === '(') nestedParentheses += 1;
				if (character === ')') {
					if (nestedParentheses === 0) break;
					nestedParentheses -= 1;
				}
				if (/\s/.test(character) && nestedParentheses === 0) break;
				destination += character;
				position += 1;
			}
		}

		if (destination) {
			links.push({ destination: unescapeMarkdownDestination(destination), line: lineNumber });
		}
		cursor = Math.max(position + 1, opening + 2);
	}

	return links;
}

function extractLinks(markdown: string): MarkdownLink[] {
	const lines = stripLinkCode(markdown.split(/\r?\n/));
	const links: MarkdownLink[] = [];

	for (const [index, line] of lines.entries()) {
		links.push(...extractInlineLinks(line, index + 1));
		const definition = line.match(/^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/);
		const destination = definition?.[1] ?? definition?.[2];
		if (destination) {
			links.push({ destination: unescapeMarkdownDestination(destination), line: index + 1 });
		}
	}

	return links;
}

function isExternal(destination: string): boolean {
	return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination);
}

function decodeLinkPart(value: string): string | undefined {
	try {
		return decodeURIComponent(value);
	} catch {
		return undefined;
	}
}

function sanitizeForOutput(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, 240);
}

function isInsideRepository(path: string): boolean {
	const relativePath = relative(repositoryRoot, path);
	return (
		relativePath === '' ||
		(!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
	);
}

function hasExactPathCase(path: string): boolean {
	const relativePath = relative(repositoryRoot, path);
	if (relativePath === '') return true;

	let current = repositoryRoot;
	for (const part of relativePath.split(sep)) {
		if (!existsSync(current) || !statSync(current).isDirectory()) return false;
		const entries = readdirSync(current);
		if (!entries.includes(part)) return false;
		current = resolve(current, part);
	}
	return true;
}

function decodeHtmlEntities(value: string): string {
	const decodeCodePoint = (entity: string, digits: string, radix: number): string => {
		const codePoint = Number.parseInt(digits, radix);
		return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
			? String.fromCodePoint(codePoint)
			: entity;
	};

	return value
		.replace(/&#(\d+);/g, (entity, code: string) => decodeCodePoint(entity, code, 10))
		.replace(/&#x([\da-f]+);/gi, (entity, code: string) => decodeCodePoint(entity, code, 16))
		.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => {
			const decoded: Record<string, string> = {
				'&amp;': '&',
				'&lt;': '<',
				'&gt;': '>',
				'&quot;': '"',
				'&apos;': "'",
			};
			return decoded[entity] ?? entity;
		});
}

function headingSlug(heading: string): string {
	const plainText = decodeHtmlEntities(heading)
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, '')
		.replace(/[`*_~]/g, '')
		.trim()
		.toLocaleLowerCase('en-US');

	return Array.from(plainText)
		.filter((character) => /[\p{L}\p{N}\p{M}\s_-]/u.test(character))
		.join('')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
}

function markdownAnchors(path: string): Set<string> {
	const lines = stripFencedCode(readFileSync(path, 'utf8').split(/\r?\n/));
	const anchors = new Set<string>();
	const slugCounts = new Map<string, number>();

	for (const [index, line] of lines.entries()) {
		for (const match of line.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/gi)) {
			anchors.add(match[1]);
		}

		const atxHeading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1];
		const setextHeading =
			index + 1 < lines.length && /^\s{0,3}(?:=+|-+)\s*$/.test(lines[index + 1])
				? line.trim()
				: undefined;
		const heading = atxHeading ?? setextHeading;
		if (!heading) continue;
		const baseSlug = headingSlug(heading);
		if (!baseSlug) continue;
		const duplicateNumber = slugCounts.get(baseSlug) ?? 0;
		slugCounts.set(baseSlug, duplicateNumber + 1);
		anchors.add(duplicateNumber === 0 ? baseSlug : `${baseSlug}-${duplicateNumber}`);
	}

	return anchors;
}

function checkLink(sourceFile: string, link: MarkdownLink): LinkProblem | undefined {
	const destination = link.destination.trim();
	if (!destination || isExternal(destination)) return undefined;

	const hashPosition = destination.indexOf('#');
	const encodedPath = (
		hashPosition === -1 ? destination : destination.slice(0, hashPosition)
	).split('?')[0];
	const encodedFragment = hashPosition === -1 ? '' : destination.slice(hashPosition + 1);
	const decodedPath = decodeLinkPart(encodedPath);
	const fragment = decodeLinkPart(encodedFragment);
	if (decodedPath === undefined || fragment === undefined) {
		return { file: sourceFile, line: link.line, rule: 'invalid-encoding', target: destination };
	}

	const sourceAbsolutePath = resolve(repositoryRoot, sourceFile);
	const targetAbsolutePath = decodedPath
		? decodedPath.startsWith('/')
			? resolve(repositoryRoot, `.${decodedPath}`)
			: resolve(dirname(sourceAbsolutePath), decodedPath)
		: sourceAbsolutePath;

	if (!isInsideRepository(targetAbsolutePath)) {
		return {
			file: sourceFile,
			line: link.line,
			rule: 'outside-repository',
			target: destination,
		};
	}
	if (!existsSync(targetAbsolutePath)) {
		return { file: sourceFile, line: link.line, rule: 'missing-target', target: destination };
	}
	if (!hasExactPathCase(targetAbsolutePath)) {
		return { file: sourceFile, line: link.line, rule: 'path-case', target: destination };
	}

	if (
		fragment &&
		['.md', '.markdown'].includes(extname(targetAbsolutePath).toLocaleLowerCase('en-US'))
	) {
		const anchors = markdownAnchors(targetAbsolutePath);
		if (!anchors.has(fragment)) {
			return {
				file: sourceFile,
				line: link.line,
				rule: 'missing-anchor',
				target: destination,
			};
		}
	}

	return undefined;
}

const markdownFiles = gitMarkdownFiles();
const problems: LinkProblem[] = [];
let checkedLinks = 0;

for (const file of markdownFiles) {
	const markdown = readFileSync(resolve(repositoryRoot, file), 'utf8');
	for (const link of extractLinks(markdown)) {
		if (isExternal(link.destination.trim())) continue;
		checkedLinks += 1;
		const problem = checkLink(file, link);
		if (problem) problems.push(problem);
	}
}

for (const problem of problems) {
	console.error(
		`${sanitizeForOutput(problem.file)}:${problem.line} ${problem.rule} ${sanitizeForOutput(problem.target)}`
	);
}

if (problems.length > 0) {
	console.error(`Documentation link check failed: ${problems.length} problem(s).`);
	process.exitCode = 1;
} else {
	console.log(
		`Documentation link check passed: ${checkedLinks} local link(s) in ${markdownFiles.length} file(s).`
	);
}

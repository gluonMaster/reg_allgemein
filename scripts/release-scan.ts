import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import {
	hasUnexpectedTextControl,
	isApprovedOperationalEmail,
	requiresTextScan,
} from './release-scan-policy';

interface ScanTarget {
	absolutePath: string;
	displayPath: string;
	origin: 'worktree' | 'build';
}

interface Finding {
	path: string;
	line?: number;
	rule: string;
}

interface SecretRule {
	id: string;
	pattern: RegExp;
}

const repositoryRoot = resolve(process.cwd());
const buildRoots = ['.svelte-kit/cloudflare', 'build', 'dist'];
const prohibitedExtensions = new Set([
	'.accdb',
	'.db',
	'.db-shm',
	'.db-wal',
	'.doc',
	'.docm',
	'.docx',
	'.dot',
	'.dotm',
	'.dotx',
	'.mdb',
	'.potm',
	'.potx',
	'.ppt',
	'.pptm',
	'.pptx',
	'.sqlite',
	'.sqlite3',
	'.xls',
	'.xlsb',
	'.xlsm',
	'.xlsx',
]);
const prohibitedTrackedRoots = new Set([
	'.svelte-kit',
	'.wrangler',
	'build',
	'coverage',
	'dist',
	'exports',
	'out',
	'playwright-report',
	'test-results',
	'tmp',
]);
const highConfidenceSecretRules: SecretRule[] = [
	{
		id: 'private-key',
		pattern: /-----BEGIN (?:DSA |EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/g,
	},
	{ id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
	{
		id: 'github-token',
		pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g,
	},
	{ id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
	{ id: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{30,}\b/g },
	{ id: 'sendgrid-api-key', pattern: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
	{ id: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
	{ id: 'stripe-live-key', pattern: /\b(?:rk|sk)_live_[A-Za-z0-9]{16,}\b/g },
	{ id: 'telegram-bot-token', pattern: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g },
	{ id: 'twilio-api-key', pattern: /\bSK[a-fA-F0-9]{32}\b/g },
	{
		id: 'bearer-jwt',
		pattern: /\bBearer\s+[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
	},
];
const sensitiveKeyName =
	'[A-Za-z0-9_-]*(?:api[_-]?key|password|passwd|private[_-]?key|secret|token)[A-Za-z0-9_-]*';
const quotedSecretAssignment = new RegExp(
	`\\b${sensitiveKeyName}\\b\\s*[:=]\\s*["'\\x60]([^"'\\x60\\s]{20,})["'\\x60]`,
	'gi'
);
const unquotedSecretAssignment = new RegExp(
	`\\b${sensitiveKeyName}\\b\\s*[:=]\\s*([A-Za-z0-9+/_=-]{20,})\\s*(?:#.*)?$`,
	'gi'
);

function repositoryRelative(path: string): string {
	return relative(repositoryRoot, path).split(sep).join('/');
}

function sanitizeForOutput(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, 240);
}

function worktreeTargets(): ScanTarget[] {
	const output = execFileSync(
		'git',
		['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
		{
			cwd: repositoryRoot,
			encoding: 'buffer',
		}
	);

	return output
		.toString('utf8')
		.split('\0')
		.filter(Boolean)
		.filter((displayPath) => existsSync(resolve(repositoryRoot, displayPath)))
		.map((displayPath) => ({
			absolutePath: resolve(repositoryRoot, displayPath),
			displayPath,
			origin: 'worktree' as const,
		}));
}

function walkBuildDirectory(directory: string, targets: ScanTarget[]): void {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolutePath = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			walkBuildDirectory(absolutePath, targets);
		} else if (entry.isFile()) {
			targets.push({
				absolutePath,
				displayPath: repositoryRelative(absolutePath),
				origin: 'build',
			});
		}
	}
}

function buildTargets(): ScanTarget[] {
	const targets: ScanTarget[] = [];
	for (const buildRoot of buildRoots) {
		const absoluteRoot = resolve(repositoryRoot, buildRoot);
		try {
			if (statSync(absoluteRoot).isDirectory()) walkBuildDirectory(absoluteRoot, targets);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== 'ENOENT') throw error;
		}
	}
	return targets;
}

function artifactRule(target: ScanTarget): string | undefined {
	const normalizedPath = target.displayPath.replaceAll('\\', '/');
	const lowerPath = normalizedPath.toLocaleLowerCase('en-US');
	const lowerExtension = extname(lowerPath);

	if (prohibitedExtensions.has(lowerExtension)) return `prohibited-artifact${lowerExtension}`;
	if (/\.(?:db-shm|db-wal)$/i.test(lowerPath)) return 'prohibited-database-sidecar';
	if (
		/(?:^|\/)~\$[^/]+$/.test(lowerPath) ||
		/(?:^|\/)(?:\.ds_store|thumbs\.db)$/.test(lowerPath)
	) {
		return 'generated-host-file';
	}
	if (/\.log$/i.test(lowerPath)) return 'generated-log';

	if (target.origin === 'worktree') {
		const firstPart = lowerPath.split('/')[0];
		if (prohibitedTrackedRoots.has(firstPart)) return 'tracked-generated-output';
		if (/^imports\/.*\.(?:json|sql)$/i.test(lowerPath)) return 'tracked-generated-import';
	}

	return undefined;
}

function isText(buffer: Buffer): boolean {
	const sampleLength = Math.min(buffer.length, 8_192);
	for (let index = 0; index < sampleLength; index += 1) {
		if (buffer[index] === 0) return false;
	}
	return true;
}

function looksLikePlaceholder(value: string): boolean {
	const normalized = value.toLocaleLowerCase('en-US');
	if (
		/(?:change[-_]?me|dummy|example|fake|placeholder|redacted|replace|sample|synthetic|test[-_]?only|your[-_])/i.test(
			normalized
		)
	) {
		return true;
	}
	if (/^[x*._-]+$/i.test(value)) return true;
	if (/^(.)\1{15,}$/.test(value)) return true;
	return value.includes('${') || value.includes('<') || value.includes('...');
}

function entropy(value: string): number {
	const counts = new Map<string, number>();
	for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
	let result = 0;
	for (const count of counts.values()) {
		const probability = count / value.length;
		result -= probability * Math.log2(probability);
	}
	return result;
}

function isLikelySecretValue(value: string): boolean {
	if (looksLikePlaceholder(value)) return false;
	if (/^[a-z][a-z\d_-]*(?:\.[a-z][a-z\d_-]*){2,}$/.test(value)) return false;
	if (new Set(value).size < 10) return false;
	return entropy(value) >= 3.4;
}

function allowGenericAssignments(path: string): boolean {
	const normalized = path.toLocaleLowerCase('en-US').replaceAll('\\', '/');
	if (normalized.startsWith('docs/') || normalized.startsWith('references/')) return false;
	if (normalized.startsWith('tests/') || normalized.includes('/__fixtures__/')) return false;
	if (/(?:^|\/)package-lock\.json$/.test(normalized)) return false;
	if (/\.(?:md|lock)$/.test(normalized)) return false;
	if (/(?:^|\/)\.?[^/]*(?:example|sample)(?:\.[^/]*)?$/.test(normalized)) return false;
	return true;
}

function allowUnquotedAssignments(path: string): boolean {
	const normalized = path.toLocaleLowerCase('en-US').replaceAll('\\', '/');
	return /(?:^|\/)(?:\.env[^/]*|\.dev\.vars[^/]*|[^/]+\.(?:toml|ya?ml|vars))$/.test(normalized);
}

function secretFindings(target: ScanTarget, content: string): Finding[] {
	const findings: Finding[] = [];
	const lines = content.split(/\r?\n/);

	for (const [index, line] of lines.entries()) {
		for (const rule of highConfidenceSecretRules) {
			rule.pattern.lastIndex = 0;
			for (const match of line.matchAll(rule.pattern)) {
				if (!looksLikePlaceholder(match[0])) {
					findings.push({ path: target.displayPath, line: index + 1, rule: rule.id });
					break;
				}
			}
		}

		if (!allowGenericAssignments(target.displayPath)) continue;
		quotedSecretAssignment.lastIndex = 0;
		for (const match of line.matchAll(quotedSecretAssignment)) {
			if (isLikelySecretValue(match[1])) {
				findings.push({
					path: target.displayPath,
					line: index + 1,
					rule: 'high-entropy-secret-assignment',
				});
				break;
			}
		}

		if (!allowUnquotedAssignments(target.displayPath)) continue;
		unquotedSecretAssignment.lastIndex = 0;
		for (const match of line.matchAll(unquotedSecretAssignment)) {
			if (isLikelySecretValue(match[1])) {
				findings.push({
					path: target.displayPath,
					line: index + 1,
					rule: 'high-entropy-secret-assignment',
				});
				break;
			}
		}
	}

	return findings;
}

function piiFindings(target: ScanTarget, content: string): Finding[] {
	const findings: Finding[] = [];
	const normalizedPath = target.displayPath.toLocaleLowerCase('en-US').replaceAll('\\', '/');
	// Lockfiles contain maintainer metadata rather than portal/client data.
	if (/(?:^|\/)package-lock\.json$/.test(normalizedPath)) return findings;
	const lines = content.split(/\r?\n/);
	const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
	const ibanPattern = /\bDE\d{20}\b/gi;
	for (const [index, line] of lines.entries()) {
		for (const match of line.matchAll(emailPattern)) {
			if (isApprovedOperationalEmail(match[0])) continue;
			const domain = (match[1] ?? '').toLocaleLowerCase('en-US');
			const nearbyPrefix = line.slice(Math.max(0, (match.index ?? 0) - 24), match.index ?? 0);
			const reservedDomain =
				/(?:^|\.)(?:example\.(?:com|net|org)|[^.]+\.(?:example|invalid|test))$/.test(
					domain
				);
			if (!reservedDomain && !nearbyPrefix.includes('*') && !looksLikePlaceholder(match[0])) {
				findings.push({
					path: target.displayPath,
					line: index + 1,
					rule: 'possible-non-placeholder-email',
				});
				break;
			}
		}
		ibanPattern.lastIndex = 0;
		if (ibanPattern.test(line) && !looksLikePlaceholder(line)) {
			findings.push({
				path: target.displayPath,
				line: index + 1,
				rule: 'possible-german-iban',
			});
		}
	}
	return findings;
}

const targetsByPath = new Map<string, ScanTarget>();
for (const target of [...buildTargets(), ...worktreeTargets()]) {
	targetsByPath.set(target.displayPath.replaceAll('\\', '/'), target);
}

const findings: Finding[] = [];
let textFilesScanned = 0;
for (const target of targetsByPath.values()) {
	const artifact = artifactRule(target);
	if (artifact) findings.push({ path: target.displayPath, rule: artifact });

	const buffer = readFileSync(target.absolutePath);
	if (requiresTextScan(target.displayPath) && hasUnexpectedTextControl(buffer)) {
		findings.push({ path: target.displayPath, rule: 'unexpected-binary-text' });
		continue;
	}
	if (!isText(buffer)) continue;
	textFilesScanned += 1;
	const content = buffer.toString('utf8');
	findings.push(...secretFindings(target, content), ...piiFindings(target, content));
}

for (const finding of findings) {
	const location = finding.line ? `${finding.path}:${finding.line}` : finding.path;
	console.error(`${sanitizeForOutput(location)} ${finding.rule}`);
}

if (findings.length > 0) {
	console.error(
		`Release scan failed: ${findings.length} finding(s); matched values were not printed.`
	);
	process.exitCode = 1;
} else {
	console.log(
		`Release scan passed: ${targetsByPath.size} file(s), ${textFilesScanned} text file(s), no prohibited artifacts, high-confidence secrets, or high-confidence PII identifiers.`
	);
}

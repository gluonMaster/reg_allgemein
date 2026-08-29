import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	STAGE_13_PENDING_REVIEW,
	hasPrematureCurrentIndependentGoClaim,
	stage13ReviewStatusMarker,
} from './stage13-review-status';

const repositoryRoot = resolve(process.cwd());
const promptPath = 'docs/prompts/stage-13-continue-deployment.md';
const promptReadmePath = 'docs/prompts/README.md';
const activeStatePath = 'docs/implementation/STAGE_13_ACTIVE_STATE.md';
const handoffPath = 'docs/implementation/handoffs/stage-13.md';
const checklistPath = 'docs/operations/PRODUCTION_READINESS_CHECKLIST.md';
const currentStatusPaths = [
	activeStatePath,
	'docs/implementation/ROADMAP.md',
	handoffPath,
	checklistPath,
	'docs/implementation/STAGE_13_TRACEABILITY.md',
	'docs/operations/FULL_MANUAL_PREVIEW.md',
	'docs/operations/OPERATIONS_RUNBOOK.md',
] as const;

const problems: string[] = [];
const read = (path: string) => readFileSync(resolve(repositoryRoot, path), 'utf8');

function isIgnored(path: string): boolean {
	try {
		execFileSync('git', ['check-ignore', '--quiet', '--', path], {
			cwd: repositoryRoot,
			stdio: 'ignore',
		});
		return true;
	} catch {
		return false;
	}
}

function isVisibleToGit(path: string): boolean {
	const output = execFileSync(
		'git',
		['ls-files', '--cached', '--others', '--exclude-standard', '--', path],
		{ cwd: repositoryRoot, encoding: 'utf8' }
	);
	return output.trim() === path;
}

for (const path of [promptPath, promptReadmePath, activeStatePath]) {
	if (isIgnored(path)) problems.push(`${path}: must not be ignored`);
	if (!isVisibleToGit(path)) problems.push(`${path}: must be tracked or visible to Git`);
}

const ignoreFile = read('.gitignore');
for (const exception of [
	'!/docs/prompts/README.md',
	'!/docs/prompts/stage-13-continue-deployment.md',
]) {
	if (!ignoreFile.split(/\r?\n/).includes(exception)) {
		problems.push(`.gitignore: missing ${exception}`);
	}
}

const prompt = read(promptPath);
const activeState = read(activeStatePath);
const handoff = read(handoffPath);
const checklist = read(checklistPath);
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;

for (const [path, content] of [
	[promptPath, prompt],
	[promptReadmePath, read(promptReadmePath)],
	[activeStatePath, activeState],
] as const) {
	if (emailPattern.test(content)) problems.push(`${path}: email/PII-like value is forbidden`);
}

if (/\b[0-9a-f]{40}\b/iu.test(prompt)) {
	problems.push(`${promptPath}: exact Git SHA belongs in active state, not the evergreen prompt`);
}
if (!prompt.includes('../implementation/STAGE_13_ACTIVE_STATE.md')) {
	problems.push(`${promptPath}: missing active-state link`);
}

const metadataBlock = activeState.match(/<!-- stage-13-continuity\s+([\s\S]*?)-->/u)?.[1];
const metadata = new Map<string, string>();
for (const line of metadataBlock?.split(/\r?\n/) ?? []) {
	const match = line.trim().match(/^([a-z_]+):\s*(\S.*)$/u);
	if (match) metadata.set(match[1], match[2].trim());
}

const requiredMetadata: Record<string, string | undefined> = {
	schema: '1',
	updated_utc: undefined,
	reviewed_candidate: undefined,
	last_completed_gate: undefined,
	next_gate: undefined,
	nearest_milestone: 'full-manual-preview',
	manual_preview_status: 'blocked',
	production_status: 'blocked',
	current_review_status: STAGE_13_PENDING_REVIEW,
};
for (const [key, expected] of Object.entries(requiredMetadata)) {
	const actual = metadata.get(key);
	if (!actual) problems.push(`${activeStatePath}: missing metadata ${key}`);
	else if (expected && actual !== expected) {
		problems.push(`${activeStatePath}: ${key} must be ${expected}, received ${actual}`);
	}
}

const updatedUtc = metadata.get('updated_utc');
if (updatedUtc && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(updatedUtc)) {
	problems.push(`${activeStatePath}: updated_utc must be second-precision UTC`);
}

const candidate = metadata.get('reviewed_candidate');
if (candidate && !/^[0-9a-f]{40}$/u.test(candidate)) {
	problems.push(`${activeStatePath}: reviewed_candidate must be a full Git SHA`);
} else if (candidate) {
	try {
		execFileSync('git', ['cat-file', '-e', `${candidate}^{commit}`], {
			cwd: repositoryRoot,
			stdio: 'ignore',
		});
	} catch {
		problems.push(`${activeStatePath}: reviewed_candidate is not a local commit`);
	}
	for (const [path, content] of [
		[handoffPath, handoff],
		[checklistPath, checklist],
	] as const) {
		if (!content.includes(candidate)) problems.push(`${path}: missing reviewed_candidate`);
	}
}

const currentReviewStatus = metadata.get('current_review_status');
for (const path of currentStatusPaths) {
	const content = read(path);
	const marker = stage13ReviewStatusMarker(content);
	if (marker !== currentReviewStatus) {
		problems.push(
			`${path}: stage-13 current review marker must be ${currentReviewStatus ?? 'defined'}, received ${marker ?? 'missing'}`
		);
	}
	if (
		currentReviewStatus === STAGE_13_PENDING_REVIEW &&
		hasPrematureCurrentIndependentGoClaim(content)
	) {
		problems.push(`${path}: current remediation candidate must not claim independent GO`);
	}
}

if (problems.length > 0) {
	for (const problem of problems) console.error(problem);
	console.error(`Stage 13 continuity check failed: ${problems.length} problem(s).`);
	process.exitCode = 1;
} else {
	console.log('Stage 13 continuity check passed: tracked prompt, active state and evidence agree.');
}

export const STAGE_13_PENDING_REVIEW = 'pending_independent_review' as const;

export const STAGE_13_CURRENT_STATUS_PATHS = [
	'docs/implementation/STAGE_13_ACTIVE_STATE.md',
	'docs/implementation/ROADMAP.md',
	'docs/implementation/handoffs/stage-13.md',
	'docs/operations/PRODUCTION_READINESS_CHECKLIST.md',
	'docs/implementation/STAGE_13_TRACEABILITY.md',
	'docs/operations/FULL_MANUAL_PREVIEW.md',
	'docs/operations/OPERATIONS_RUNBOOK.md',
] as const;

export const STAGE_13_ADJACENT_PENDING_GO_FIXTURES = [
	'The current candidate is pending independent review. Independent review verdict: GO.',
	'Текущий кандидат ожидает независимую проверку. Итог независимой проверки: GO.',
	'The current candidate requires independent review. Independent review returned GO.',
	'Текущий кандидат требует независимой проверки. Независимая проверка вернула итог GO.',
] as const;

export const STAGE_13_COMPLETION_POLARITY_GO_FIXTURES = [
	"The current candidate's independent review completed with GO.",
	"The current candidate's independent review concluded with GO.",
	'The current candidate is pending independent review. The independent review completed with GO.',
	'The current candidate requires independent review. The independent review concluded with GO.',
	'Независимая проверка текущего кандидата вернула GO.',
] as const;

export const STAGE_13_MIXED_POLARITY_GO_FIXTURES = [
	'The current candidate did not receive additional comments, but its independent review concluded with GO.',
	"The current candidate's independent review concluded with GO, but it did not receive additional comments.",
	'Текущий кандидат не получил замечаний, но прошёл независимую проверку с итогом GO.',
	'Текущий кандидат прошёл независимую проверку с итогом GO, но не получил дополнительных комментариев.',
] as const;

export const STAGE_13_PREMATURE_GO_FIXTURES = [
	'The current candidate passed an independent review with verdict GO.',
	'The latest candidate independent review returned GO.',
	'Independent review verdict for the new candidate: GO.',
	'GO is the independent-review result for the current candidate.',
	'Текущий кандидат прошёл отдельный independent review с итогом GO.',
	'Новый кандидат получил отдельный независимый review: GO.',
	'Вердикт независимого ревью последнего кандидата — GO.',
	'GO — результат независимой проверки текущего кандидата.',
	'THE CURRENT CANDIDATE\nPASSED AN INDEPENDENT REVIEW — VERDICT: go.',
	'go: результат независимой проверки\nтекущего кандидата.',
	'The current candidate passed an independent review. Verdict: GO.',
	'GO. Результат независимой проверки текущего кандидата.',
	...STAGE_13_ADJACENT_PENDING_GO_FIXTURES,
	...STAGE_13_COMPLETION_POLARITY_GO_FIXTURES,
	...STAGE_13_MIXED_POLARITY_GO_FIXTURES,
] as const;

export const STAGE_13_ALLOWED_GO_CONTROLS = [
	'Exact historical 2bedc73c candidate received independent GO.',
	'The current remediation candidate is pending independent review.',
	'Исторический exact candidate 2bedc73c получил GO; текущий кандидат ожидает отдельный review.',
	'Exact f33885257019ea0aeec9f839595fc5596f004240 received independent GO. The current remediation candidate is pending independent review.',
	'Exact f33885257019ea0aeec9f839595fc5596f004240 получил independent GO; текущий кандидат ожидает отдельный review.',
	'The current candidate has not received an independent GO.',
	'The current candidate did not receive an independent GO.',
	"The current candidate's independent review did not return GO.",
	"The current candidate's independent review has not concluded with GO.",
	"The current candidate hasn't received an independent GO.",
	"The current candidate's independent review didn't return GO.",
	'The current candidate has yet to receive an independent GO.',
	'Текущий кандидат не получил независимый GO.',
	'Независимая проверка текущего кандидата не вернула GO.',
] as const;

const reviewStatusMarkerPattern =
	/<!--\s*stage-13-current-review-status:\s*([a-z_]+)\s*-->/gu;

const currentCandidatePattern = new RegExp(
	'(?:^|\\s)(?:current|latest|new|текущ[\\p{L}]*|последн[\\p{L}]*|нов[\\p{L}]*)(?:\\s+[\\p{L}\\p{N}_]+){0,4}\\s+(?:candidate|кандидат[\\p{L}]*)(?=\\s|$)',
	'u'
);
const independentReviewPattern = new RegExp(
	'(?:^|\\s)(?:independent\\s+(?:review|go)|независим[\\p{L}]*\\s+(?:review|ревью|провер[\\p{L}]*|go))(?=\\s|$)',
	'u'
);
const completedReviewClaimTokenPattern = new RegExp(
	'^(?:pass(?:ed|es)?|receiv(?:e|ed|es)|return(?:ed|s)?|complet(?:e|ed|es)|conclud(?:e|ed|es)|verdict|result|outcome|got|has|прош(?:ёл|ел|ла|ли|ло)|получ(?:ил[аио]?|ен[аоы]?)|вернул[аио]?|вердикт|итог[\\p{L}]*|результат[\\p{L}]*|имеет|заверш(?:ил[аио]?|ён|ен[аоы]?))$',
	'u'
);
const pendingOrFutureCandidatePattern = new RegExp(
	'(?:^|\\s)(?:pending|await[\\p{L}]*|waiting|requires?|required|must|until|before|blocked|not|never|ожида[\\p{L}]*|требу[\\p{L}]*|пока|до|не)(?=\\s|$)',
	'u'
);
const historicalCandidatePattern = new RegExp(
	'(?:^|\\s)(?:historical|previous|earlier|old|rejected|историческ[\\p{L}]*|предыдущ[\\p{L}]*|стар[\\p{L}]*|отклон[\\p{L}]*)(?=\\s|$)',
	'u'
);
const activeReviewedAssertionPattern = new RegExp(
	'(?:^|\\s)(?:(?:latest|last)(?:\\s+[\\p{L}\\p{N}_]+){0,8}\\s+review[\\p{L}]*|review[\\p{L}]*(?:\\s+[\\p{L}\\p{N}_]+){0,8}\\s+(?:latest|last)|последн[\\p{L}]*(?:\\s+[\\p{L}\\p{N}_]+){0,8}\\s+review[\\p{L}]*|remediation\\s+findings\\s+exact|candidate\\s+(?:after|после)\\s+exact)(?=\\s|$)',
	'u'
);
const gitReferencePattern = /\b[0-9a-f]{7,40}(?=\b|…|\.{3})/gu;
const gitReferencePresencePattern = /\b[0-9a-f]{7,40}\b/u;

export type Stage13ReviewDocuments = Readonly<Record<string, string | undefined>>;

export function stage13ReviewStatusMarker(content: string): string | null {
	reviewStatusMarkerPattern.lastIndex = 0;
	return reviewStatusMarkerPattern.exec(content)?.[1] ?? null;
}

function stage13ReviewStatusMarkerCount(content: string): number {
	reviewStatusMarkerPattern.lastIndex = 0;
	return Array.from(content.matchAll(reviewStatusMarkerPattern)).length;
}

function normalizedReviewStatements(content: string): string[] {
	return content
		.normalize('NFKC')
		.replace(/\r\n?/gu, '\n')
		.replace(/\b(has|have|had|did|does|is|was|were)n['’]t\b/giu, '$1 not')
		.replace(/\bno\s*(?:[-–—]\s*|\s+)go\b/giu, ' nogo ')
		.replace(/\n[\t ]*\n/gu, ';')
		.toLocaleLowerCase('en-US')
		.split(/[.!?;]+/u)
		.map((statement) => statement.replace(/[^\p{L}\p{N}_]+/gu, ' ').trim())
		.filter(Boolean);
}

export function hasPrematureCurrentIndependentGoClaim(content: string): boolean {
	const statements = normalizedReviewStatements(content);
	const isNegatedCompletionToken = (tokens: string[], index: number): boolean => {
		const token = tokens[index];
		const previous = tokens[index - 1];
		const twoBack = tokens[index - 2];
		const threeBack = tokens[index - 3];
		const next = tokens[index + 1];
		const twoAhead = tokens[index + 2];

		if (['not', 'never', 'no', 'without', 'не'].includes(previous)) return true;
		if (previous === 'yet' && ['not', 'never'].includes(twoBack)) return true;
		if (
			previous === 'to' &&
			twoBack === 'yet' &&
			['has', 'have', 'had'].includes(threeBack)
		) {
			return true;
		}
		if (token === 'has' || token === 'имеет') {
			if (['not', 'never', 'no', 'without', 'не'].includes(next)) return true;
			if (next === 'yet' && twoAhead === 'to') return true;
		}
		return false;
	};
	const hasCompletedClaim = (statement: string): boolean => {
		const tokens = statement.split(/\s+/u);
		return (
			tokens.includes('go') &&
			currentCandidatePattern.test(statement) &&
			independentReviewPattern.test(statement) &&
			tokens.some(
				(token, index) =>
					completedReviewClaimTokenPattern.test(token) &&
					!isNegatedCompletionToken(tokens, index)
			)
		);
	};
	const hasUnboundCompletedClaim = (statement: string): boolean =>
		hasCompletedClaim(`current candidate ${statement}`) &&
		!currentCandidatePattern.test(statement) &&
		!historicalCandidatePattern.test(statement) &&
		!gitReferencePresencePattern.test(statement);

	for (const [index, statement] of statements.entries()) {
		if (hasCompletedClaim(statement)) return true;
		if (!currentCandidatePattern.test(statement)) {
			continue;
		}
		if (pendingOrFutureCandidatePattern.test(statement)) {
			for (const adjacent of [
				statements.slice(Math.max(0, index - 2), index).join(' '),
				statements.slice(index + 1, Math.min(statements.length, index + 3)).join(' '),
			]) {
				if (adjacent && hasUnboundCompletedClaim(adjacent)) return true;
			}
			continue;
		}

		for (const [start, end] of [
			[Math.max(0, index - 1), Math.min(statements.length, index + 2)],
			[Math.max(0, index - 2), index + 1],
			[index, Math.min(statements.length, index + 3)],
		] as const) {
			if (hasCompletedClaim(statements.slice(start, end).join(' '))) return true;
		}
	}

	return false;
}

function activeReviewedCandidateProblems(content: string, reviewedCandidate: string): string[] {
	const lines = content
		.normalize('NFKC')
		.replace(/\r\n?/gu, '\n')
		.toLocaleLowerCase('en-US')
		.split('\n');
	const expectedPrefix = reviewedCandidate.slice(0, 7);
	const staleReferences = new Set<string>();
	const referencesIn = (value: string): string[] => {
		gitReferencePattern.lastIndex = 0;
		return Array.from(value.matchAll(gitReferencePattern), (match) => match[0]);
	};

	for (const [index, line] of lines.entries()) {
		const normalizedLine = line.replace(/[^\p{L}\p{N}_]+/gu, ' ').trim();
		if (!activeReviewedAssertionPattern.test(normalizedLine)) continue;

		const lineReferences = referencesIn(line);
		const followingReferences = referencesIn(
			lines.slice(index + 1, Math.min(lines.length, index + 3)).join(' ')
		);
		const references =
			lineReferences.length > 0
				? lineReferences
				: followingReferences.length > 0
					? followingReferences
					: referencesIn(lines.slice(Math.max(0, index - 2), index).join(' '));
		if (references.length === 0) continue;
		const assertedReference = references[0];
		if (reviewedCandidate.startsWith(assertedReference)) continue;
		staleReferences.add(assertedReference);
	}

	return Array.from(staleReferences, (reference) =>
		`active reviewed_candidate assertion references ${reference}, expected ${expectedPrefix}`
	);
}

export function validateStage13ReviewStatusDocuments(
	documents: Stage13ReviewDocuments,
	currentReviewStatus: string | undefined,
	reviewedCandidate?: string
): string[] {
	const problems: string[] = [];

	for (const path of STAGE_13_CURRENT_STATUS_PATHS) {
		const content = documents[path];
		if (content === undefined) {
			problems.push(`${path}: status-bearing document is missing`);
			continue;
		}

		const markerCount = stage13ReviewStatusMarkerCount(content);
		const marker = stage13ReviewStatusMarker(content);
		if (markerCount !== 1) {
			problems.push(
				`${path}: expected exactly one stage-13 current review marker, received ${markerCount}`
			);
		}
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
		if (reviewedCandidate) {
			for (const problem of activeReviewedCandidateProblems(content, reviewedCandidate)) {
				problems.push(`${path}: ${problem}`);
			}
		}
	}

	return problems;
}

function hasPathProblem(problems: readonly string[], path: string, fragment: string): boolean {
	return problems.some((problem) => problem.startsWith(`${path}:`) && problem.includes(fragment));
}

export function stage13ReviewStatusContractProblems(): string[] {
	const problems: string[] = [];
	const reviewedCandidate = '1111111111111111111111111111111111111111';
	const staleReviewedCandidate = '2222222222222222222222222222222222222222';
	const pendingMarker =
		'<!-- stage-13-current-review-status: pending_independent_review -->';
	const cleanDocuments: Record<string, string> = Object.fromEntries(
		STAGE_13_CURRENT_STATUS_PATHS.map((path) => [
			path,
			`${pendingMarker}\nThe current remediation candidate is pending independent review.`,
		])
	);

	for (const fixture of STAGE_13_PREMATURE_GO_FIXTURES) {
		if (!hasPrematureCurrentIndependentGoClaim(fixture)) {
			problems.push(`adversarial fixture was not rejected: ${fixture}`);
		}
	}
	for (const fixture of STAGE_13_ALLOWED_GO_CONTROLS) {
		if (hasPrematureCurrentIndependentGoClaim(fixture)) {
			problems.push(`historical/pending control was rejected: ${fixture}`);
		}
	}

	for (const path of STAGE_13_CURRENT_STATUS_PATHS) {
		const missingMarker = { ...cleanDocuments, [path]: 'marker intentionally missing' };
		const missingProblems = validateStage13ReviewStatusDocuments(
			missingMarker,
			STAGE_13_PENDING_REVIEW,
			reviewedCandidate
		);
		if (!hasPathProblem(missingProblems, path, 'exactly one')) {
			problems.push(`${path}: contract did not reject a missing marker`);
		}

		const mismatchedMarker = {
			...cleanDocuments,
			[path]: '<!-- stage-13-current-review-status: independent_go -->',
		};
		const mismatchProblems = validateStage13ReviewStatusDocuments(
			mismatchedMarker,
			STAGE_13_PENDING_REVIEW,
			reviewedCandidate
		);
		if (!hasPathProblem(mismatchProblems, path, 'must be pending_independent_review')) {
			problems.push(`${path}: contract did not reject marker independent_go vs metadata pending`);
		}

		const prematureClaim = {
			...cleanDocuments,
			[path]: `${pendingMarker}\n${STAGE_13_PREMATURE_GO_FIXTURES[0]}`,
		};
		const prematureProblems = validateStage13ReviewStatusDocuments(
			prematureClaim,
			STAGE_13_PENDING_REVIEW,
			reviewedCandidate
		);
		if (!hasPathProblem(prematureProblems, path, 'must not claim independent GO')) {
			problems.push(`${path}: contract did not reject a premature independent GO claim`);
		}

		for (const claim of STAGE_13_ADJACENT_PENDING_GO_FIXTURES) {
			const adjacentClaim = { ...cleanDocuments, [path]: `${pendingMarker}\n${claim}` };
			const adjacentProblems = validateStage13ReviewStatusDocuments(
				adjacentClaim,
				STAGE_13_PENDING_REVIEW,
				reviewedCandidate
			);
			if (!hasPathProblem(adjacentProblems, path, 'must not claim independent GO')) {
				problems.push(`${path}: contract did not reject adjacent pending/GO contradiction`);
			}
		}

		for (const claim of STAGE_13_COMPLETION_POLARITY_GO_FIXTURES) {
			const completionClaim = { ...cleanDocuments, [path]: `${pendingMarker}\n${claim}` };
			const completionProblems = validateStage13ReviewStatusDocuments(
				completionClaim,
				STAGE_13_PENDING_REVIEW,
				reviewedCandidate
			);
			if (!hasPathProblem(completionProblems, path, 'must not claim independent GO')) {
				problems.push(`${path}: contract did not reject completed/concluded GO claim`);
			}
		}

		for (const claim of STAGE_13_MIXED_POLARITY_GO_FIXTURES) {
			const mixedClaim = { ...cleanDocuments, [path]: `${pendingMarker}\n${claim}` };
			const mixedProblems = validateStage13ReviewStatusDocuments(
				mixedClaim,
				STAGE_13_PENDING_REVIEW,
				reviewedCandidate
			);
			if (!hasPathProblem(mixedProblems, path, 'must not claim independent GO')) {
				problems.push(`${path}: contract did not reject mixed-polarity GO claim`);
			}
		}

		for (const control of STAGE_13_ALLOWED_GO_CONTROLS) {
			const allowedControl = { ...cleanDocuments, [path]: `${pendingMarker}\n${control}` };
			const allowedProblems = validateStage13ReviewStatusDocuments(
				allowedControl,
				STAGE_13_PENDING_REVIEW,
				reviewedCandidate
			);
			if (hasPathProblem(allowedProblems, path, 'must not claim independent GO')) {
				problems.push(`${path}: contract rejected an allowed negative/historical control`);
			}
		}

		const staleReviewedClaim = {
			...cleanDocuments,
			[path]: `${pendingMarker}\nLatest independently reviewed target: ${reviewedCandidate}.\nLatest independently reviewed target: ${staleReviewedCandidate}.`,
		};
		const staleReviewedProblems = validateStage13ReviewStatusDocuments(
			staleReviewedClaim,
			STAGE_13_PENDING_REVIEW,
			reviewedCandidate
		);
		if (!hasPathProblem(staleReviewedProblems, path, 'reviewed_candidate')) {
			problems.push(`${path}: contract did not reject a stale reviewed-candidate assertion`);
		}
	}

	const metadataMismatchProblems = validateStage13ReviewStatusDocuments(
		cleanDocuments,
		'independent_go',
		reviewedCandidate
	);
	for (const path of STAGE_13_CURRENT_STATUS_PATHS) {
		if (!hasPathProblem(metadataMismatchProblems, path, 'must be independent_go')) {
			problems.push(`${path}: contract did not reject marker pending vs different metadata`);
		}
	}

	return problems;
}

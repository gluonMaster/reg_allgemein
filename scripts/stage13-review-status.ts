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
] as const;

export const STAGE_13_ALLOWED_GO_CONTROLS = [
	'Exact historical 2bedc73c candidate received independent GO.',
	'The current remediation candidate is pending independent review.',
	'Исторический exact candidate 2bedc73c получил GO; текущий кандидат ожидает отдельный review.',
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
const completedReviewClaimPattern = new RegExp(
	'(?:^|\\s)(?:passed|received|returned|verdict|result|outcome|got|has|прош(?:ёл|ел|ла|ли|ло)|получ(?:ил[аио]?|ен[аоы]?)|вердикт|итог[\\p{L}]*|результат[\\p{L}]*|имеет|заверш(?:ил[аио]?|ён|ен[аоы]?))(?=\\s|$)',
	'u'
);
const pendingOrFutureCandidatePattern = new RegExp(
	'(?:^|\\s)(?:pending|await[\\p{L}]*|waiting|requires?|required|must|until|before|blocked|not|never|ожида[\\p{L}]*|требу[\\p{L}]*|пока|до|не)(?=\\s|$)',
	'u'
);

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
		.replace(/\bno\s*(?:[-–—]\s*|\s+)go\b/giu, ' nogo ')
		.replace(/\n[\t ]*\n/gu, ';')
		.toLocaleLowerCase('en-US')
		.split(/[.!?;]+/u)
		.map((statement) => statement.replace(/[^\p{L}\p{N}_]+/gu, ' ').trim())
		.filter(Boolean);
}

export function hasPrematureCurrentIndependentGoClaim(content: string): boolean {
	const statements = normalizedReviewStatements(content);
	const hasCompletedClaim = (statement: string): boolean => {
		const tokens = statement.split(/\s+/u);
		return (
			tokens.includes('go') &&
			currentCandidatePattern.test(statement) &&
			independentReviewPattern.test(statement) &&
			completedReviewClaimPattern.test(statement)
		);
	};

	for (const [index, statement] of statements.entries()) {
		if (hasCompletedClaim(statement)) return true;
		if (
			!currentCandidatePattern.test(statement) ||
			pendingOrFutureCandidatePattern.test(statement)
		) {
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

export function validateStage13ReviewStatusDocuments(
	documents: Stage13ReviewDocuments,
	currentReviewStatus: string | undefined
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
	}

	return problems;
}

function hasPathProblem(problems: readonly string[], path: string, fragment: string): boolean {
	return problems.some((problem) => problem.startsWith(`${path}:`) && problem.includes(fragment));
}

export function stage13ReviewStatusContractProblems(): string[] {
	const problems: string[] = [];
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
			STAGE_13_PENDING_REVIEW
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
			STAGE_13_PENDING_REVIEW
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
			STAGE_13_PENDING_REVIEW
		);
		if (!hasPathProblem(prematureProblems, path, 'must not claim independent GO')) {
			problems.push(`${path}: contract did not reject a premature independent GO claim`);
		}
	}

	const metadataMismatchProblems = validateStage13ReviewStatusDocuments(
		cleanDocuments,
		'independent_go'
	);
	for (const path of STAGE_13_CURRENT_STATUS_PATHS) {
		if (!hasPathProblem(metadataMismatchProblems, path, 'must be independent_go')) {
			problems.push(`${path}: contract did not reject marker pending vs different metadata`);
		}
	}

	return problems;
}

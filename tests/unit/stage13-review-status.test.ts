import { describe, expect, it } from 'vitest';
import {
	STAGE_13_ADJACENT_PENDING_GO_FIXTURES,
	STAGE_13_ALLOWED_GO_CONTROLS,
	STAGE_13_COMPLETION_POLARITY_GO_FIXTURES,
	STAGE_13_CURRENT_STATUS_PATHS,
	STAGE_13_PENDING_REVIEW,
	STAGE_13_PREMATURE_GO_FIXTURES,
	hasPrematureCurrentIndependentGoClaim,
	stage13ReviewStatusMarker,
	stage13ReviewStatusContractProblems,
	validateStage13ReviewStatusDocuments,
} from '../../scripts/stage13-review-status';

const pendingMarker = '<!-- stage-13-current-review-status: pending_independent_review -->';
const reviewedCandidate = '1111111111111111111111111111111111111111';
const staleReviewedCandidate = '2222222222222222222222222222222222222222';

function pendingDocuments(): Record<string, string> {
	return Object.fromEntries(
		STAGE_13_CURRENT_STATUS_PATHS.map((path) => [
			path,
			`${pendingMarker}\nThe current remediation candidate is pending independent review.`,
		])
	);
}

describe('Stage 13 current review continuity', () => {
	it('detects premature current-candidate independent GO claims in Russian and English', () => {
		const claims = [
			...STAGE_13_PREMATURE_GO_FIXTURES,
			'Новый remediation candidate после прошлого NO-GO имеет separate independent GO.',
			'The current immutable candidate has received an independent GO.',
			'THE CURRENT CANDIDATE\nPASSED AN INDEPENDENT REVIEW — VERDICT: go.',
			'go: результат независимой проверки\nтекущего кандидата.',
		];

		for (const claim of claims) {
			expect(hasPrematureCurrentIndependentGoClaim(claim), claim).toBe(true);
		}
	});

	it('allows historical GO evidence and an explicitly pending current candidate', () => {
		for (const control of STAGE_13_ALLOWED_GO_CONTROLS) {
			expect(hasPrematureCurrentIndependentGoClaim(control), control).toBe(false);
		}
		expect(
			hasPrematureCurrentIndependentGoClaim(
				'Exact historical 2bedc73c independent review завершён GO. Current remediation candidate is pending independent review.'
			)
		).toBe(false);
		expect(
			stage13ReviewStatusMarker(pendingMarker)
		).toBe('pending_independent_review');
	});

	it('keeps the executable docs-check adversarial contract green', () => {
		expect(stage13ReviewStatusContractProblems()).toEqual([]);
	});

	it('rejects missing or mismatched markers and premature GO in every status document', () => {
		for (const path of STAGE_13_CURRENT_STATUS_PATHS) {
			const missingProblems = validateStage13ReviewStatusDocuments(
				{ ...pendingDocuments(), [path]: 'marker missing' },
				STAGE_13_PENDING_REVIEW
			);
			expect(missingProblems.some((problem) => problem.startsWith(`${path}:`)), path).toBe(
				true
			);

			const mismatchProblems = validateStage13ReviewStatusDocuments(
				{
					...pendingDocuments(),
					[path]: '<!-- stage-13-current-review-status: independent_go -->',
				},
				STAGE_13_PENDING_REVIEW
			);
			expect(
				mismatchProblems.some(
					(problem) => problem.startsWith(`${path}:`) && problem.includes('must be')
				),
				path
			).toBe(true);

			const prematureProblems = validateStage13ReviewStatusDocuments(
				{
					...pendingDocuments(),
					[path]: `${pendingMarker}\n${STAGE_13_PREMATURE_GO_FIXTURES[0]}`,
				},
				STAGE_13_PENDING_REVIEW
			);
			expect(
				prematureProblems.some(
					(problem) =>
						problem.startsWith(`${path}:`) && problem.includes('must not claim independent GO')
				),
				path
			).toBe(true);

			for (const claim of STAGE_13_ADJACENT_PENDING_GO_FIXTURES) {
				const adjacentProblems = validateStage13ReviewStatusDocuments(
					{
						...pendingDocuments(),
						[path]: `${pendingMarker}\n${claim}`,
					},
					STAGE_13_PENDING_REVIEW,
					reviewedCandidate
				);
				expect(
					adjacentProblems.some(
						(problem) =>
							problem.startsWith(`${path}:`) &&
							problem.includes('must not claim independent GO')
					),
					`${path}: ${claim}`
				).toBe(true);
			}

			for (const claim of STAGE_13_COMPLETION_POLARITY_GO_FIXTURES) {
				const completionProblems = validateStage13ReviewStatusDocuments(
					{
						...pendingDocuments(),
						[path]: `${pendingMarker}\n${claim}`,
					},
					STAGE_13_PENDING_REVIEW,
					reviewedCandidate
				);
				expect(
					completionProblems.some(
						(problem) =>
							problem.startsWith(`${path}:`) &&
							problem.includes('must not claim independent GO')
					),
					`${path}: ${claim}`
				).toBe(true);
			}

			for (const control of STAGE_13_ALLOWED_GO_CONTROLS) {
				const allowedProblems = validateStage13ReviewStatusDocuments(
					{
						...pendingDocuments(),
						[path]: `${pendingMarker}\n${control}`,
					},
					STAGE_13_PENDING_REVIEW,
					reviewedCandidate
				);
				expect(
					allowedProblems.some(
						(problem) =>
							problem.startsWith(`${path}:`) &&
							problem.includes('must not claim independent GO')
					),
					`${path}: ${control}`
				).toBe(false);
			}

			const staleReviewedProblems = validateStage13ReviewStatusDocuments(
				{
					...pendingDocuments(),
					[path]: `${pendingMarker}\nLatest independently reviewed target: ${reviewedCandidate}.\nLatest independently reviewed target: ${staleReviewedCandidate}.`,
				},
				STAGE_13_PENDING_REVIEW,
				reviewedCandidate
			);
			expect(
				staleReviewedProblems.some(
					(problem) =>
						problem.startsWith(`${path}:`) && problem.includes('reviewed_candidate')
				),
				path
			).toBe(true);
		}

		const metadataMismatchProblems = validateStage13ReviewStatusDocuments(
			pendingDocuments(),
			'independent_go'
		);
		for (const path of STAGE_13_CURRENT_STATUS_PATHS) {
			expect(
				metadataMismatchProblems.some(
					(problem) => problem.startsWith(`${path}:`) && problem.includes('independent_go')
				),
				path
			).toBe(true);
		}
	});
});

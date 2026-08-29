export const STAGE_13_PENDING_REVIEW = 'pending_independent_review' as const;

export function stage13ReviewStatusMarker(content: string): string | null {
	return (
		content.match(/<!--\s*stage-13-current-review-status:\s*([a-z_]+)\s*-->/u)?.[1] ?? null
	);
}

export function hasPrematureCurrentIndependentGoClaim(content: string): boolean {
	return /(?:current|latest|new|текущ(?:ий|его|ему|им)|нов(?:ый|ого|ому|ым))\s+(?:immutable\s+|remediation\s+)?(?:candidate|кандидат)[^\n.!?;]{0,120}?(?:has|received|имеет|получил)[^\n.!?;]{0,60}?(?:separate(?:ly)?\s+|отдельн(?:ый|ого|ому|ым)\s+)?independent\s+GO/iu.test(
		content
	);
}

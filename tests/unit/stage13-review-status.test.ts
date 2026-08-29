import { describe, expect, it } from 'vitest';
import {
	hasPrematureCurrentIndependentGoClaim,
	stage13ReviewStatusMarker,
} from '../../scripts/stage13-review-status';

describe('Stage 13 current review continuity', () => {
	it('detects premature current-candidate independent GO claims in Russian and English', () => {
		expect(
			hasPrematureCurrentIndependentGoClaim(
				'Новый remediation candidate после прошлого NO-GO имеет separate independent GO.'
			)
		).toBe(true);
		expect(
			hasPrematureCurrentIndependentGoClaim(
				'The current immutable candidate has received an independent GO.'
			)
		).toBe(true);
	});

	it('allows historical GO evidence and an explicitly pending current candidate', () => {
		expect(
			hasPrematureCurrentIndependentGoClaim(
				'Exact historical 2bedc73c independent review завершён GO. Current remediation candidate is pending independent review.'
			)
		).toBe(false);
		expect(
			stage13ReviewStatusMarker(
				'<!-- stage-13-current-review-status: pending_independent_review -->'
			)
		).toBe('pending_independent_review');
	});
});

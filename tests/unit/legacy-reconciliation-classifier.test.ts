import { describe, expect, it } from 'vitest';
import { reconciliationIssueClass } from '$lib/server/import/reconciliation';

describe('legacy reconciliation issue classifier', () => {
	it.each([
		'ACCESS_ACTIVITY_WITHOUT_CHILD',
		'ACCESS_FAMILY_NUMBER_COLLISION',
		'PLUSB_K_TOKEN_EMPTY',
		'PLUSB_K_TOKEN_INVALID',
		'PLUSB_K_TOKEN_DUPLICATE',
		'PLUSB_OLD_ID_INVALID',
		'PLUSB_OLD_NAME_MISSING',
		'PLUSB_TARGET_ANCHOR_MISSING',
		'PLUSB_K_DANGLING_ID',
		'PLUSB_K_AMBIGUOUS_TARGET',
		'PLUSB_OLD_NAME_DUPLICATE',
		'PLUSB_TARGET_NAME_DUPLICATE',
	])('materializes validated actionable issue %s', (code) => {
		expect(reconciliationIssueClass(code)).not.toBeNull();
	});

	it('keeps non-import namespaces outside the reconciliation manifest', () => {
		expect(reconciliationIssueClass('SCHEDULE_CONTRACT_DRIFT')).toBeNull();
	});
});

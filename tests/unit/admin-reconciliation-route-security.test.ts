import type { AuthenticatedUser } from '$lib/server/auth/session';

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	exportList: vi.fn(),
	detail: vi.fn(),
	mutate: vi.fn(),
	batchMutate: vi.fn(),
}));

vi.mock('$lib/server/security/csrf', () => ({
	requireCsrf: vi.fn(async (input: { submittedToken?: string; user?: AuthenticatedUser }) => {
		if (!input.user || input.submittedToken !== 'valid-csrf') throw new Error('CSRF_INVALID');
	}),
}));

vi.mock('$lib/server/admin/runtime', () => ({
	requestAdminConsoleRuntime: () => ({
		reconciliation: {
			list: mocks.list,
			exportList: mocks.exportList,
			detail: mocks.detail,
			mutate: mocks.mutate,
			batchMutate: mocks.batchMutate,
		},
	}),
}));

import * as route from '../../src/routes/admin/import-reconciliation/+page.server';
import * as exportRoute from '../../src/routes/admin/import-reconciliation/export.json/+server';

const admin: AuthenticatedUser = {
	id: 'reconciliation-route-admin',
	role: 'admin',
	emailVerified: true,
	sessionId: 'reconciliation-route-session',
	sessionVersion: 1,
	csrfHash: 'a'.repeat(64),
};
const parent: AuthenticatedUser = { ...admin, id: 'reconciliation-route-parent', role: 'parent' };

function event(input: { user?: AuthenticatedUser; fields?: Record<string, string> }) {
	return {
		request: new Request('https://portal.example.test/admin/import-reconciliation?/mutate', {
			method: 'POST',
			body: new URLSearchParams(input.fields ?? {}),
		}),
		cookies: { get: vi.fn(() => 'valid-csrf') },
		locals: { user: input.user, requestId: 'reconciliation-route-request' },
		platform: { env: {} },
	};
}

const valid = {
	_csrf: 'valid-csrf',
	caseId: 'legacy-reconciliation:synthetic-case',
	expectedVersion: '3',
	action: 'await_upstream',
	reasonCode: 'upstream_correction_requested',
	confirmation: 'confirmed',
	idempotencyKey: 'reconciliation-route-command',
};

describe('/admin/import-reconciliation mutation boundary', () => {
	beforeEach(() => {
		mocks.mutate.mockReset().mockResolvedValue({ replayed: false });
		mocks.batchMutate.mockReset().mockResolvedValue(undefined);
		mocks.exportList.mockReset().mockResolvedValue([]);
	});

	it('rejects anonymous, parent, missing CSRF, forged action and missing confirmation', async () => {
		for (const candidate of [
			event({ fields: valid }),
			event({ user: parent, fields: valid }),
			event({ user: admin, fields: { ...valid, _csrf: 'wrong' } }),
			event({ user: admin, fields: { ...valid, action: 'resolve' } }),
			event({ user: admin, fields: { ...valid, confirmation: 'not-confirmed' } }),
		]) {
			expect(await route.actions.mutate(candidate as never)).toMatchObject({
				status: expect.any(Number),
				data: { success: false },
			});
		}
		expect(mocks.mutate).not.toHaveBeenCalled();
	});

	it('passes only typed server-validated fields with the current admin actor', async () => {
		const result = await route.actions.mutate(event({ user: admin, fields: valid }) as never);
		expect(result).toMatchObject({ success: true });
		expect(mocks.mutate).toHaveBeenCalledWith(
			expect.objectContaining({
				actor: expect.objectContaining({ id: admin.id, role: 'admin' }),
				caseId: 'legacy-reconciliation:synthetic-case',
				expectedVersion: 3,
				action: 'await_upstream',
				reasonCode: 'upstream_correction_requested',
			})
		);
	});

	it('redacts repository diagnostics from stale and inactive-admin failures', async () => {
		mocks.mutate.mockRejectedValueOnce(
			new Error('inactive admin; client pii-canary@example.invalid; stale version')
		);
		const result = await route.actions.mutate(event({ user: admin, fields: valid }) as never);
		expect(result).toMatchObject({ status: 409, data: { success: false } });
		expect(JSON.stringify(result)).not.toContain('pii-canary@example.invalid');
	});

	it('exports every repository result for the current filters without PII fields', async () => {
		mocks.exportList.mockResolvedValueOnce([
			{
				id: 'case-export-1',
				periodCode: '2026-export',
				sourceKind: 'access',
				issueCode: 'ACCESS_EMAIL_INVALID',
				issueClass: 'invalid_email',
				state: 'awaiting_upstream',
				firstImportRunId: 'run-export-first',
				lastSeenImportRunId: 'run-export-last',
				version: 2,
			},
		]);
		const url = new URL(
			'https://portal.example.test/admin/import-reconciliation/export.json?period=period-export&source=access&class=invalid_email&state=awaiting_upstream&assignee=admin-export&firstRun=run-export-first&lastRun=run-export-last&page=9'
		);
		const response = await exportRoute.GET({
			url,
			locals: { user: admin, requestId: 'export-request' },
		} as never);
		const payload = await response.json();
		expect(mocks.exportList).toHaveBeenCalledWith({
			periodId: 'period-export',
			sourceKind: 'access',
			issueClass: 'invalid_email',
			state: 'awaiting_upstream',
			assigneeId: 'admin-export',
			firstSeenRunId: 'run-export-first',
			lastSeenRunId: 'run-export-last',
		});
		expect(payload).toMatchObject({
			contract: 'legacy-import-reconciliation-checklist:v2',
			total: 1,
			items: [{ caseId: 'case-export-1', issueCode: 'ACCESS_EMAIL_INVALID' }],
		});
		expect(JSON.stringify(payload)).not.toContain('pii-canary@example.invalid');
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});

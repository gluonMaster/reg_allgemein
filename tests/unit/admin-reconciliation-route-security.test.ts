import type { AuthenticatedUser } from '$lib/server/auth/session';

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
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
			detail: mocks.detail,
			mutate: mocks.mutate,
			batchMutate: mocks.batchMutate,
		},
	}),
}));

import * as route from '../../src/routes/admin/import-reconciliation/+page.server';

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
});

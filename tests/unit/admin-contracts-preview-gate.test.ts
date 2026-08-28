import type { AuthenticatedUser } from '$lib/server/auth/session';

const mocks = vi.hoisted(() => ({
	createDraft: vi.fn(),
	admin: {
		id: 'admin-contract-preview-gate',
		role: 'admin' as const,
		emailVerified: true,
		sessionId: 'admin-contract-preview-gate-session',
		sessionVersion: 1,
		csrfHash: 'a'.repeat(64),
	},
}));

vi.mock('$lib/server/admin/http', () => ({
	adminQuery: () => ({ q: '' }),
	verifiedAdminForm: async (event: { request: Request }) => ({
		form: await event.request.formData(),
		actor: mocks.admin,
	}),
}));

vi.mock('$lib/server/contracts/runtime', () => ({
	requestContractRuntime: () => ({
		service: { createDraft: mocks.createDraft, installPreviewReviewTemplates: vi.fn() },
		repository: {
			listAdminOffers: vi.fn(async () => []),
			listAdminEndRequests: vi.fn(async () => []),
		},
	}),
}));

vi.mock('$lib/server/config/runtime', () => ({
	loadRuntimeConfig: () => ({ contracts: { previewReviewEnabled: false } }),
}));

import * as route from '../../src/routes/admin/contracts/+page.server';

const admin = mocks.admin as AuthenticatedUser;

function event(fields: Record<string, string> = {}) {
	return {
		request: new Request('https://portal.example.test/admin/contracts?/createDraft', {
			method: 'POST',
			body: new URLSearchParams(fields),
		}),
		url: new URL('https://portal.example.test/admin/contracts'),
		locals: { user: admin, requestId: 'admin-contract-preview-gate-request' },
		platform: { env: {} },
	};
}

describe('/admin/contracts preview draft boundary', () => {
	beforeEach(() => {
		mocks.createDraft
			.mockReset()
			.mockRejectedValue(new Error('PREVIEW_REVIEW_TEMPLATE_FORBIDDEN'));
	});

	it('keeps the preview UI disabled and returns the same fail-closed API action outcome', async () => {
		const loaded = await route.load(event() as never);
		expect(loaded).toMatchObject({ previewReviewEnabled: false });

		const result = await route.actions.createDraft(
			event({
				userId: 'synthetic-parent',
				childId: 'synthetic-child',
				academicPeriodId: 'synthetic-period',
				templateVersionId: 'contract-template:preview-review:group_yearly:v1',
				renderInput: JSON.stringify({ previewReviewMarker: 'synthetic-no-pii' }),
				expiresAt: '2026-09-01T10:00:00.000Z',
				idempotencyKey: 'preview-gate-route-test',
			}) as never
		);

		expect(result).toMatchObject({ status: 409, data: { success: false } });
		expect(mocks.createDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: expect.objectContaining({
					templateVersionId: 'contract-template:preview-review:group_yearly:v1',
				}),
			})
		);
		expect(JSON.stringify(result)).not.toContain('PREVIEW_REVIEW_TEMPLATE_FORBIDDEN');
	});
});

import type { AuthenticatedUser } from '$lib/server/auth/session';
import { ContractServiceError } from '$lib/server/contracts/contract-service';
import { IndividualRequestError } from '$lib/server/requests/request-repository';

const runtimeMocks = vi.hoisted(() => ({
	loadOwnerOffer: vi.fn(),
	loadOwnerRequest: vi.fn(),
	saveRequest: vi.fn(),
}));

vi.mock('$lib/server/contracts/runtime', () => ({
	requestContractRuntime: () => ({
		service: { loadOwnerOffer: runtimeMocks.loadOwnerOffer },
	}),
}));

vi.mock('$lib/server/requests/runtime', () => ({
	requestRequestsRuntime: () => ({
		requestService: {
			loadOwnerRequest: runtimeMocks.loadOwnerRequest,
			save: runtimeMocks.saveRequest,
		},
	}),
}));

vi.mock('$lib/server/security/csrf', () => ({
	requireCsrf: vi.fn(async () => undefined),
}));

import * as contractRoute from '../../src/routes/contracts/[offerId]/+page.server';
import * as requestRoute from '../../src/routes/requests/[requestId]/+page.server';

const parent: AuthenticatedUser = {
	id: 'route-error-parent',
	role: 'parent',
	emailVerified: true,
	sessionId: 'route-error-session',
	sessionVersion: 1,
	csrfHash: 'a'.repeat(64),
};

function eventFor(kind: 'contract' | 'request', request?: Request) {
	const resourceId = kind === 'contract' ? 'foreign-offer' : 'foreign-request';
	const path = kind === 'contract' ? `/contracts/${resourceId}` : `/requests/${resourceId}`;
	return {
		cookies: { get: vi.fn(() => 'csrf-token') },
		locals: { user: parent, requestId: `${kind}-route-safe-error` },
		params: { offerId: resourceId, requestId: resourceId },
		request: request ?? new Request(`https://portal.example.test${path}`),
		url: new URL(`https://portal.example.test${path}`),
	};
}

describe('parent detail route safe errors', () => {
	beforeEach(() => vi.clearAllMocks());

	it('maps a foreign request detail to a safe 404', async () => {
		runtimeMocks.loadOwnerRequest.mockRejectedValueOnce(
			new IndividualRequestError('REQUEST_NOT_FOUND')
		);
		await expect(requestRoute.load(eventFor('request') as never)).rejects.toMatchObject({
			status: 404,
			body: {
				code: 'REQUEST_NOT_FOUND',
				requestId: 'request-route-safe-error',
			},
		});
	});

	it('keeps a foreign request action in the safe action-failure path', async () => {
		runtimeMocks.saveRequest.mockRejectedValueOnce(
			new IndividualRequestError('REQUEST_SAVE_REJECTED')
		);
		const form = new FormData();
		form.set('_csrf', 'csrf-token');
		const result = await requestRoute.actions.save(eventFor(
			'request',
			new Request('https://portal.example.test/requests/foreign-request?/save', {
				method: 'POST',
				body: form,
			})
		) as never);
		expect(result).toMatchObject({ status: 409, data: { success: false } });
	});

	it('maps a foreign contract offer detail to a safe 404', async () => {
		runtimeMocks.loadOwnerOffer.mockRejectedValueOnce(
			new ContractServiceError('CONTRACT_NOT_FOUND')
		);
		await expect(contractRoute.load(eventFor('contract') as never)).rejects.toMatchObject({
			status: 404,
			body: {
				code: 'CONTRACT_NOT_FOUND',
				requestId: 'contract-route-safe-error',
			},
		});
	});
});

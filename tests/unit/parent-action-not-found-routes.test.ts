import type { AuthenticatedUser } from '$lib/server/auth/session';
import { ContractServiceError } from '$lib/server/contracts/contract-service';
import { DocumentServiceError } from '$lib/server/documents/document-service';
import { MessageRepositoryError } from '$lib/server/messages/message-repository';
import { PriceReviewServiceError } from '$lib/server/price-reviews/price-review-service';
import { IndividualRequestError } from '$lib/server/requests/request-repository';
import { TrialError } from '$lib/server/trials/trial-repository';

const runtimeMocks = vi.hoisted(() => ({
	cancelTrial: vi.fn(),
	deleteDocument: vi.fn(),
	messageAppend: vi.fn(),
	messageClose: vi.fn(),
	recordMediaDecision: vi.fn(),
	requestCancel: vi.fn(),
	requestSave: vi.fn(),
	requestSubmit: vi.fn(),
	respondPrice: vi.fn(),
	submitAttendance: vi.fn(),
	submitContractEnd: vi.fn(),
	submitTrial: vi.fn(),
	updateChild: vi.fn(),
}));

vi.mock('$lib/server/security/csrf', () => ({
	requireCsrf: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/requests/runtime', () => ({
	requestRequestsRuntime: () => ({
		documentService: { deleteByParent: runtimeMocks.deleteDocument },
		requestService: {
			cancel: runtimeMocks.requestCancel,
			save: runtimeMocks.requestSave,
			submit: runtimeMocks.requestSubmit,
		},
	}),
}));

vi.mock('$lib/server/cabinet/runtime', () => ({
	requestCabinetRuntime: () => ({ service: { updateChild: runtimeMocks.updateChild } }),
}));

vi.mock('$lib/server/family/runtime', () => ({
	requestFamilyRuntime: () => ({ service: {} }),
}));

vi.mock('$lib/server/price-reviews/runtime', () => ({
	requestPriceReviewRuntime: () => ({
		repository: {},
		service: { respond: runtimeMocks.respondPrice },
	}),
}));

vi.mock('$lib/server/messages/runtime', () => ({
	requestMessageRuntime: () => ({
		service: {
			appendParentMessage: runtimeMocks.messageAppend,
			closeAsParent: runtimeMocks.messageClose,
		},
	}),
}));

vi.mock('$lib/server/contracts/runtime', () => ({
	requestContractRuntime: () => ({
		service: {
			recordMediaDecision: runtimeMocks.recordMediaDecision,
			submitAttendanceNotice: runtimeMocks.submitAttendance,
			submitEndRequest: runtimeMocks.submitContractEnd,
		},
	}),
}));

vi.mock('$lib/server/trials/runtime', () => ({
	requestTrialRuntime: () => ({
		service: {
			cancel: runtimeMocks.cancelTrial,
			submit: runtimeMocks.submitTrial,
		},
	}),
}));

import * as cabinetRoute from '../../src/routes/cabinet/+page.server';
import * as trialRoute from '../../src/routes/catalog/[courseId]/trial/+page.server';
import * as contractRoute from '../../src/routes/contracts/[offerId]/+page.server';
import * as messageRoute from '../../src/routes/messages/[publicReference]/+page.server';
import * as priceRoute from '../../src/routes/price-reviews/[publicReference]/+page.server';
import * as requestRoute from '../../src/routes/requests/[requestId]/+page.server';

const parent: AuthenticatedUser = {
	id: 'action-route-parent',
	role: 'parent',
	emailVerified: true,
	sessionId: 'action-route-session',
	sessionVersion: 1,
	csrfHash: 'a'.repeat(64),
};

type ActionName =
	| 'cancelTrial'
	| 'deleteDocument'
	| 'messageAppend'
	| 'messageClose'
	| 'recordMediaDecision'
	| 'requestCancel'
	| 'requestSave'
	| 'requestSubmit'
	| 'respondPrice'
	| 'submitAttendance'
	| 'submitContractEnd'
	| 'submitTrial'
	| 'updateChild';

function eventFor(path: string, fields: Record<string, string> = {}) {
	const form = new FormData();
	form.set('_csrf', 'csrf-token');
	for (const [name, value] of Object.entries(fields)) form.append(name, value);
	return {
		cookies: { get: vi.fn(() => 'csrf-token') },
		locals: { user: parent, requestId: 'parent-action-safe-error' },
		params: {
			courseId: 'course-1',
			offerId: 'foreign-offer',
			publicReference: 'foreign-reference',
			requestId: 'foreign-request',
		},
		request: new Request(`https://portal.example.test${path}`, {
			method: 'POST',
			body: form,
		}),
		url: new URL(`https://portal.example.test${path}`),
	};
}

function expectFailure(result: unknown, status: 404 | 409) {
	expect(result).toMatchObject({ status, data: { success: false } });
}

describe('parent action safe not-found responses', () => {
	beforeEach(() => vi.clearAllMocks());

	it('maps foreign request, document, child, price and trial IDs to 404', async () => {
		runtimeMocks.requestSave.mockRejectedValueOnce(new IndividualRequestError('REQUEST_NOT_FOUND'));
		expectFailure(
			await requestRoute.actions.save(
				eventFor('/requests/foreign-request?/save', {
					childId: 'owned-child',
					expectedVersion: '1',
					fundingKind: 'self_pay',
					idempotencyKey: 'request-save-not-found',
					preferredFormat: 'online',
					requestKind: 'individual',
					subjects: 'Synthetic subject',
				}) as never
			),
			404
		);

		runtimeMocks.requestSubmit.mockRejectedValueOnce(
			new IndividualRequestError('REQUEST_NOT_FOUND')
		);
		expectFailure(
			await requestRoute.actions.submit(
				eventFor('/requests/foreign-request?/submit', {
					expectedVersion: '1',
					idempotencyKey: 'request-not-found',
				}) as never
			),
			404
		);

		runtimeMocks.requestCancel.mockRejectedValueOnce(
			new IndividualRequestError('REQUEST_NOT_FOUND')
		);
		expectFailure(
			await requestRoute.actions.cancel(
				eventFor('/requests/foreign-request?/cancel', {
					expectedVersion: '1',
					idempotencyKey: 'request-cancel-not-found',
				}) as never
			),
			404
		);

		runtimeMocks.deleteDocument.mockRejectedValueOnce(
			new DocumentServiceError('DOCUMENT_NOT_FOUND')
		);
		expectFailure(
			await requestRoute.actions.deleteDocument(
				eventFor('/requests/foreign-request?/deleteDocument', {
					documentId: 'foreign-document',
					idempotencyKey: 'document-not-found',
				}) as never
			),
			404
		);
		expect(runtimeMocks.deleteDocument).toHaveBeenCalledWith(
			expect.objectContaining({ payload: expect.objectContaining({ requestId: 'foreign-request' }) })
		);

		runtimeMocks.updateChild.mockResolvedValueOnce('rejected');
		expectFailure(
			await cabinetRoute.actions.updateChild(
				eventFor('/cabinet?/updateChild', {
					childId: 'foreign-child',
					fullName: 'Synthetic foreign child',
					birthDate: '2015-01-01',
				}) as never
			),
			404
		);

		runtimeMocks.respondPrice.mockRejectedValueOnce(
			new PriceReviewServiceError('PRICE_REVIEW_ITEM_NOT_FOUND')
		);
		expectFailure(
			await priceRoute.actions.respond(
				eventFor('/price-reviews/foreign-reference?/respond', {
					decision: 'accept',
					idempotencyKey: 'price-not-found',
					itemHash: 'b'.repeat(64),
				}) as never
			),
			404
		);

		runtimeMocks.submitTrial.mockRejectedValueOnce(
			new TrialError('TRIAL_CHILD_NOT_OWNED')
		);
		expectFailure(
			await trialRoute.actions.submit(
				eventFor('/catalog/course-1/trial?/submit', {
					childId: 'foreign-child',
					idempotencyKey: 'trial-child-not-owned',
					requestedDate: '2026-09-01',
					sessionId: 'session-1',
				}) as never
			),
			404
		);

		runtimeMocks.cancelTrial.mockRejectedValueOnce(new TrialError('TRIAL_NOT_FOUND'));
		expectFailure(
			await cabinetRoute.actions.cancelTrial(
				eventFor('/cabinet?/cancelTrial', {
					idempotencyKey: 'trial-not-found',
					trialId: 'foreign-trial',
				}) as never
			),
			404
		);
	});

	it('maps foreign thread and contract-side IDs to 404', async () => {
		for (const [mockName, action, path, error] of [
			[
				'messageAppend',
				messageRoute.actions.append,
				'/messages/foreign-reference?/append',
				new MessageRepositoryError('SUPPORT_THREAD_NOT_FOUND'),
			],
			[
				'messageClose',
				messageRoute.actions.close,
				'/messages/foreign-reference?/close',
				new MessageRepositoryError('SUPPORT_THREAD_NOT_FOUND'),
			],
			[
				'submitContractEnd',
				contractRoute.actions.end,
				'/contracts/foreign-offer?/end',
				new ContractServiceError('CONTRACT_NOT_FOUND'),
			],
			[
				'submitAttendance',
				contractRoute.actions.attendance,
				'/contracts/foreign-offer?/attendance',
				new ContractServiceError('CONTRACT_NOT_FOUND'),
			],
			[
				'recordMediaDecision',
				contractRoute.actions.mediaDecline,
				'/contracts/foreign-offer?/mediaDecline',
				new ContractServiceError('MEDIA_DECISION_NOT_FOUND'),
			],
		] as const) {
			runtimeMocks[mockName as ActionName].mockRejectedValueOnce(error);
			expectFailure(
				await action(
					eventFor(path, {
						childId: 'foreign-child',
						contractId: 'foreign-contract',
						idempotencyKey: `${mockName}-not-found`,
						message: 'Synthetic message',
					}) as never
				),
				404
			);
		}
		for (const mock of [
			runtimeMocks.submitContractEnd,
			runtimeMocks.submitAttendance,
			runtimeMocks.recordMediaDecision,
		]) {
			expect(mock).toHaveBeenCalledWith(
				expect.objectContaining({ payload: expect.objectContaining({ offerId: 'foreign-offer' }) })
			);
		}
	});

	it('keeps non-ownership validation and state conflicts at 409', async () => {
		for (const [mockName, action, path, error] of [
			[
				'requestSave',
				requestRoute.actions.save,
				'/requests/foreign-request?/save',
				new IndividualRequestError('REQUEST_NOT_EDITABLE'),
			],
			[
				'requestCancel',
				requestRoute.actions.cancel,
				'/requests/foreign-request?/cancel',
				new IndividualRequestError('REQUEST_CANCELLATION_REJECTED'),
			],
			[
				'requestSubmit',
				requestRoute.actions.submit,
				'/requests/foreign-request?/submit',
				new IndividualRequestError('REQUEST_SUBMISSION_REJECTED'),
			],
			[
				'deleteDocument',
				requestRoute.actions.deleteDocument,
				'/requests/foreign-request?/deleteDocument',
				new DocumentServiceError('DOCUMENT_DELETE_REJECTED'),
			],
			[
				'respondPrice',
				priceRoute.actions.respond,
				'/price-reviews/foreign-reference?/respond',
				new PriceReviewServiceError('PRICE_REVIEW_RESPONSE_NOT_ALLOWED'),
			],
			[
				'messageAppend',
				messageRoute.actions.append,
				'/messages/foreign-reference?/append',
				new MessageRepositoryError('SUPPORT_MESSAGE_REJECTED'),
			],
			[
				'submitAttendance',
				contractRoute.actions.attendance,
				'/contracts/foreign-offer?/attendance',
				new ContractServiceError('ATTENDANCE_NOTICE_NOT_APPLICABLE'),
			],
			[
				'recordMediaDecision',
				contractRoute.actions.mediaDecline,
				'/contracts/foreign-offer?/mediaDecline',
				new ContractServiceError('MEDIA_DECISION_CONTEXT_REJECTED'),
			],
			[
				'submitTrial',
				trialRoute.actions.submit,
				'/catalog/course-1/trial?/submit',
				new TrialError('TRIAL_DATE_NOT_FUTURE'),
			],
			[
				'cancelTrial',
				cabinetRoute.actions.cancelTrial,
				'/cabinet?/cancelTrial',
				new TrialError('TRIAL_CANCELLATION_REJECTED'),
			],
		] as const) {
			runtimeMocks[mockName as ActionName].mockRejectedValueOnce(error);
			expectFailure(
				await action(
					eventFor(path, {
						childId: 'owned-child',
						contractId: 'owned-contract',
						documentId: 'owned-document',
						idempotencyKey: `${mockName}-conflict`,
						message: 'Synthetic message',
					}) as never
				),
				409
			);
		}
	});
});

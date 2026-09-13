import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requestSubject } from '$lib/server/auth/http';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { ContractServiceError } from '$lib/server/contracts/contract-service';
import { requestContractRuntime } from '$lib/server/contracts/runtime';
import { requireParent } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { translate } from '$lib/i18n';

export const load: PageServerLoad = async (event) => {
	const actor = requireParent(event.locals.user);
	let offer: Awaited<
		ReturnType<ReturnType<typeof requestContractRuntime>['service']['loadOwnerOffer']>
	>;
	try {
		offer = await requestContractRuntime(event).service.loadOwnerOffer(
			actor,
			event.params.offerId
		);
	} catch (caught) {
		if (caught instanceof ContractServiceError && caught.code === 'CONTRACT_NOT_FOUND') {
			throw error(404, {
				code: 'CONTRACT_NOT_FOUND',
				message: translate(event.locals.locale, 'admin.notFound'),
				requestId: event.locals.requestId,
			});
		}
		throw caught;
	}
	return {
		csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
		endIdempotencyKey: crypto.randomUUID(),
		attendanceIdempotencyKey: crypto.randomUUID(),
		mediaIdempotencyKey: crypto.randomUUID(),
		offer,
	};
};

async function decide(event: Parameters<Actions[string]>[0], decision: 'accept' | 'decline') {
	try {
		const form = await event.request.formData();
		await requireCsrf({
			cookies: event.cookies,
			user: event.locals.user,
			submittedToken: form.get('_csrf')?.toString(),
		});
		const actor = requireParent(event.locals.user);
		const offer = await requestContractRuntime(event).service.loadOwnerOffer(
			actor,
			event.params.offerId
		);
		await requestContractRuntime(event).service.parentDecision({
			actor,
			payload: {
				offerId: event.params.offerId,
				expectedContractHash: form.get('expectedContractHash'),
				decision,
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText:
					decision === 'accept'
						? translate(
								'de',
								offer.paymentRequired
									? 'contract.acceptance.payableText'
									: 'contract.acceptance.fundedText'
							)
						: translate('de', 'contract.decline.text'),
				idempotencyKey: form.get('idempotencyKey'),
			},
			userAgent: event.request.headers.get('user-agent') ?? 'not-provided',
			requestSubject: requestSubject(event),
			requestId: event.locals.requestId,
		});
		return {
			success: true,
			message: translate(event.locals.locale,
				decision === 'accept' ? 'contract.accepted' : 'contract.declined'
			),
		};
	} catch {
		return fail(409, { success: false, message: translate(event.locals.locale, 'contract.decisionFailed') });
	}
}

async function protectedForm(event: Parameters<Actions[string]>[0]) {
	const form = await event.request.formData();
	await requireCsrf({
		cookies: event.cookies,
		user: event.locals.user,
		submittedToken: form.get('_csrf')?.toString(),
	});
	return { form, actor: requireParent(event.locals.user) };
}

export const actions = {
	accept: (event) => decide(event, 'accept'),
	decline: (event) => decide(event, 'decline'),
	end: async (event) => {
		try {
			const { form, actor } = await protectedForm(event);
			await requestContractRuntime(event).service.submitEndRequest({
				actor,
				payload: {
					offerId: event.params.offerId,
					contractId: form.get('contractId'),
					kind: form.get('kind'),
					requestedEffectiveOn: form.get('requestedEffectiveOn')?.toString() || null,
					requestTextVersion: 'contract-end-request-de-v1',
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate(event.locals.locale, 'contract.end.received') };
		} catch (caught) {
			return fail(
				caught instanceof ContractServiceError && caught.code === 'CONTRACT_NOT_FOUND'
					? 404
					: 409,
				{ success: false, message: translate(event.locals.locale, 'contract.end.failed') }
			);
		}
	},
	attendance: async (event) => {
		try {
			const { form, actor } = await protectedForm(event);
			await requestContractRuntime(event).service.submitAttendanceNotice({
				actor,
				payload: {
					offerId: event.params.offerId,
					contractId: form.get('contractId'),
					noticeTextVersion: 'attendance-ceased-de-v1',
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate(event.locals.locale, 'contract.attendance.received') };
		} catch (caught) {
			return fail(
				caught instanceof ContractServiceError && caught.code === 'CONTRACT_NOT_FOUND'
					? 404
					: 409,
				{ success: false, message: translate(event.locals.locale, 'contract.attendance.failed') }
			);
		}
	},
	mediaDecline: async (event) => {
		try {
			const { form, actor } = await protectedForm(event);
			await requestContractRuntime(event).service.recordMediaDecision({
				actor,
				payload: {
					offerId: event.params.offerId,
					childId: form.get('childId'),
					captureScopes: form.getAll('captureScopes').map(String),
					publicationChannels: form.getAll('publicationChannels').map(String),
					decision: 'declined',
					textVersion: 'media-decision-de-v1',
					withdrawalContactVersionId: form.get('withdrawalContactVersionId'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate(event.locals.locale, 'contract.media.declined') };
		} catch (caught) {
			return fail(
				caught instanceof ContractServiceError && caught.code === 'MEDIA_DECISION_NOT_FOUND'
					? 404
					: 409,
				{ success: false, message: translate(event.locals.locale, 'contract.media.failed') }
			);
		}
	},
} satisfies Actions;

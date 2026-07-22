import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requestSubject } from '$lib/server/auth/http';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { requestContractRuntime } from '$lib/server/contracts/runtime';
import { requireAuthenticated } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { translate } from '$lib/i18n';

export const load: PageServerLoad = async (event) => ({
	csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
	endIdempotencyKey: crypto.randomUUID(),
	attendanceIdempotencyKey: crypto.randomUUID(),
	mediaIdempotencyKey: crypto.randomUUID(),
	offer: await requestContractRuntime(event).service.loadOwnerOffer(
		requireAuthenticated(event.locals.user),
		event.params.offerId
	),
});

async function decide(event: Parameters<Actions[string]>[0], decision: 'accept' | 'decline') {
	try {
		const form = await event.request.formData();
		await requireCsrf({
			cookies: event.cookies,
			user: event.locals.user,
			submittedToken: form.get('_csrf')?.toString(),
		});
		const actor = requireAuthenticated(event.locals.user);
		await requestContractRuntime(event).service.parentDecision({
			actor,
			payload: {
				offerId: event.params.offerId,
				expectedContractHash: form.get('expectedContractHash'),
				decision,
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText:
					decision === 'accept'
						? translate('de', 'contract.acceptance.text')
						: translate('de', 'contract.decline.text'),
				idempotencyKey: form.get('idempotencyKey'),
			},
			userAgent: event.request.headers.get('user-agent') ?? 'not-provided',
			requestSubject: requestSubject(event),
			requestId: event.locals.requestId,
		});
		return {
			success: true,
			message: translate('de', decision === 'accept' ? 'contract.accepted' : 'contract.declined'),
		};
	} catch {
		return fail(409, { success: false, message: translate('de', 'contract.decisionFailed') });
	}
}

async function protectedForm(event: Parameters<Actions[string]>[0]) {
	const form = await event.request.formData();
	await requireCsrf({
		cookies: event.cookies,
		user: event.locals.user,
		submittedToken: form.get('_csrf')?.toString(),
	});
	return { form, actor: requireAuthenticated(event.locals.user) };
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
					contractId: form.get('contractId'),
					kind: form.get('kind'),
					requestedEffectiveOn: form.get('requestedEffectiveOn')?.toString() || null,
					requestTextVersion: 'contract-end-request-de-v1',
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'contract.end.received') };
		} catch {
			return fail(409, { success: false, message: translate('de', 'contract.end.failed') });
		}
	},
	attendance: async (event) => {
		try {
			const { form, actor } = await protectedForm(event);
			await requestContractRuntime(event).service.submitAttendanceNotice({
				actor,
				payload: {
					contractId: form.get('contractId'),
					noticeTextVersion: 'attendance-ceased-de-v1',
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'contract.attendance.received') };
		} catch {
			return fail(409, { success: false, message: translate('de', 'contract.attendance.failed') });
		}
	},
	mediaDecline: async (event) => {
		try {
			const { form, actor } = await protectedForm(event);
			await requestContractRuntime(event).service.recordMediaDecision({
				actor,
				payload: {
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
			return { success: true, message: translate('de', 'contract.media.declined') };
		} catch {
			return fail(409, { success: false, message: translate('de', 'contract.media.failed') });
		}
	},
} satisfies Actions;

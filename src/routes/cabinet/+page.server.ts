import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { requireAuthenticated } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { requestSubject } from '$lib/server/auth/http';
import { requestCabinetRuntime } from '$lib/server/cabinet/runtime';
import { requestFamilyRuntime } from '$lib/server/family/runtime';
import { requestTrialRuntime } from '$lib/server/trials/runtime';

export const load: PageServerLoad = async (event) => ({
	csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
	cabinet: await requestCabinetRuntime(event).service.load(
		requireAuthenticated(event.locals.user)
	),
});

async function verifiedForm(event: Parameters<Actions[string]>[0]) {
	const form = await event.request.formData();
	await requireCsrf({
		cookies: event.cookies,
		user: event.locals.user,
		submittedToken: form.get('_csrf')?.toString(),
	});
	return { form, actor: requireAuthenticated(event.locals.user) };
}

function childPayload(form: FormData, includeId: boolean) {
	return {
		...(includeId ? { childId: form.get('childId')?.toString() } : {}),
		fullName: form.get('fullName')?.toString(),
		birthDate: form.get('birthDate')?.toString(),
		confirmDuplicate: form.get('confirmDuplicate') === 'true',
	};
}

function correctionPayload(form: FormData) {
	return {
		childId: form.get('childId')?.toString(),
		fullName: form.get('fullName')?.toString(),
		birthDate: form.get('birthDate')?.toString(),
	};
}

export const actions = {
	createChild: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			const result = await requestCabinetRuntime(event).service.createChild({
				actor,
				payload: childPayload(form, false),
				requestId: event.locals.requestId,
			});
			if (result === 'duplicate') {
				return fail(409, {
					success: false,
					duplicate: true,
					message: translate('de', 'cabinet.child.duplicateWarning'),
				});
			}
			if (result !== 'created') {
				return fail(400, {
					success: false,
					message: translate('de', 'cabinet.child.rejected'),
				});
			}
			return { success: true, message: translate('de', 'cabinet.child.saved') };
		} catch {
			return fail(403, { success: false, message: translate('de', 'auth.csrfRejected') });
		}
	},
	updateChild: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			const result = await requestCabinetRuntime(event).service.updateChild({
				actor,
				payload: childPayload(form, true),
				requestId: event.locals.requestId,
			});
			if (result === 'duplicate') {
				return fail(409, {
					success: false,
					duplicate: true,
					message: translate('de', 'cabinet.child.duplicateWarning'),
				});
			}
			if (result !== 'updated') {
				return fail(404, {
					success: false,
					message: translate('de', 'cabinet.child.rejected'),
				});
			}
			return { success: true, message: translate('de', 'cabinet.child.updated') };
		} catch {
			return fail(403, { success: false, message: translate('de', 'auth.csrfRejected') });
		}
	},
	requestCorrection: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			const requested = await requestCabinetRuntime(event).service.requestCorrection({
				actor,
				payload: correctionPayload(form),
				requestId: event.locals.requestId,
			});
			return requested
				? { success: true, message: translate('de', 'cabinet.child.correctionRequested') }
				: fail(404, { success: false, message: translate('de', 'cabinet.child.rejected') });
		} catch {
			return fail(403, { success: false, message: translate('de', 'auth.csrfRejected') });
		}
	},
	requestClaim: async (event) => {
		try {
			const { actor } = await verifiedForm(event);
			const requested = await requestFamilyRuntime(event).service.requestLegacyClaimProof({
				actor,
				requestSubject: requestSubject(event),
			});
			return requested
				? { success: true, message: translate('de', 'cabinet.claim.requested') }
				: fail(400, {
						success: false,
						message: translate('de', 'cabinet.claim.unavailable'),
					});
		} catch {
			return fail(400, {
				success: false,
				message: translate('de', 'cabinet.claim.unavailable'),
			});
		}
	},
	cancelTrial: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			await requestTrialRuntime(event).service.cancel({
				actor,
				payload: {
					trialId: form.get('trialId'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'cabinet.trials.cancelled') };
		} catch {
			return fail(409, {
				success: false,
				message: translate('de', 'cabinet.trials.cancelFailed'),
			});
		}
	},
} satisfies Actions;

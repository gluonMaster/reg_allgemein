import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { requireParent } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { requestSubject } from '$lib/server/auth/http';
import { requestCabinetRuntime } from '$lib/server/cabinet/runtime';
import { requestFamilyRuntime } from '$lib/server/family/runtime';
import { requestTrialRuntime } from '$lib/server/trials/runtime';
import { TrialError } from '$lib/server/trials/trial-repository';
import { requestPriceReviewRuntime } from '$lib/server/price-reviews/runtime';

export const load: PageServerLoad = async (event) => {
	const actor = requireParent(event.locals.user);
	const [cabinet, priceReviews] = await Promise.all([
		requestCabinetRuntime(event).service.load(actor, event.locals.locale),
		requestPriceReviewRuntime(event).repository.listParentItems(actor.id),
	]);
	return {
		csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
		cabinet,
		priceReviews,
	};
};

async function verifiedForm(event: Parameters<Actions[string]>[0]) {
	const form = await event.request.formData();
	await requireCsrf({
		cookies: event.cookies,
		user: event.locals.user,
		submittedToken: form.get('_csrf')?.toString(),
	});
	return { form, actor: requireParent(event.locals.user) };
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
					message: translate(event.locals.locale, 'cabinet.child.duplicateWarning'),
				});
			}
			if (result !== 'created') {
				return fail(400, {
					success: false,
					message: translate(event.locals.locale, 'cabinet.child.rejected'),
				});
			}
			return { success: true, message: translate(event.locals.locale, 'cabinet.child.saved') };
		} catch {
			return fail(403, { success: false, message: translate(event.locals.locale, 'auth.csrfRejected') });
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
					message: translate(event.locals.locale, 'cabinet.child.duplicateWarning'),
				});
			}
			if (result !== 'updated') {
				return fail(404, {
					success: false,
					message: translate(event.locals.locale, 'cabinet.child.rejected'),
				});
			}
			return { success: true, message: translate(event.locals.locale, 'cabinet.child.updated') };
		} catch {
			return fail(403, { success: false, message: translate(event.locals.locale, 'auth.csrfRejected') });
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
				? { success: true, message: translate(event.locals.locale, 'cabinet.child.correctionRequested') }
				: fail(404, { success: false, message: translate(event.locals.locale, 'cabinet.child.rejected') });
		} catch {
			return fail(403, { success: false, message: translate(event.locals.locale, 'auth.csrfRejected') });
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
				? { success: true, message: translate(event.locals.locale, 'cabinet.claim.requested') }
				: fail(400, {
						success: false,
						message: translate(event.locals.locale, 'cabinet.claim.unavailable'),
					});
		} catch {
			return fail(400, {
				success: false,
				message: translate(event.locals.locale, 'cabinet.claim.unavailable'),
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
			return { success: true, message: translate(event.locals.locale, 'cabinet.trials.cancelled') };
		} catch (caught) {
			return fail(
				caught instanceof TrialError && caught.code === 'TRIAL_NOT_FOUND' ? 404 : 409,
				{
				success: false,
				message: translate(event.locals.locale, 'cabinet.trials.cancelFailed'),
				}
			);
		}
	},
} satisfies Actions;

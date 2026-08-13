import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { requireParent } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { requestSubject } from '$lib/server/auth/http';
import { legacyClaimConfirmationSchema } from '$lib/server/cabinet/contracts';
import { requestFamilyRuntime } from '$lib/server/family/runtime';

export const load: PageServerLoad = (event) => {
	requireParent(event.locals.user);
	return {
		token: event.url.searchParams.get('token') ?? '',
		csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
	};
};

export const actions = {
	default: async (event) => {
		try {
			const form = await event.request.formData();
			await requireCsrf({
				cookies: event.cookies,
				user: event.locals.user,
				submittedToken: form.get('_csrf')?.toString(),
			});
			const parsed = legacyClaimConfirmationSchema.safeParse({ token: form.get('token') });
			if (!parsed.success) {
				return fail(400, {
					success: false,
					message: translate('de', 'cabinet.claim.failed'),
				});
			}
			const confirmed = await requestFamilyRuntime(event).service.confirmLegacyClaim({
				actor: requireParent(event.locals.user),
				token: parsed.data.token,
				requestId: event.locals.requestId,
				requestSubject: requestSubject(event),
			});
			return confirmed
				? { success: true, message: translate('de', 'cabinet.claim.confirmed') }
				: fail(400, { success: false, message: translate('de', 'cabinet.claim.failed') });
		} catch {
			return fail(400, { success: false, message: translate('de', 'cabinet.claim.failed') });
		}
	},
} satisfies Actions;

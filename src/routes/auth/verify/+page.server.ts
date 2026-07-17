import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { tokenInputSchema } from '$lib/server/auth/contracts';
import {
	requestAuthRuntime,
	requestSubject,
	translatedPublicAuthError,
} from '$lib/server/auth/http';

export const load: PageServerLoad = ({ url }) => ({ token: url.searchParams.get('token') ?? '' });

export const actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const parsed = tokenInputSchema.safeParse({ token: form.get('token') });
		if (!parsed.success) {
			return fail(400, { success: false, message: translate('de', 'auth.verificationFailed') });
		}
		try {
			const verified = await requestAuthRuntime(event).service.verifyEmail({
				token: parsed.data.token,
				requestId: event.locals.requestId,
				requestSubject: requestSubject(event),
			});
			if (!verified) {
				return fail(400, { success: false, message: translate('de', 'auth.verificationFailed') });
			}
			return { success: true, message: translate('de', 'auth.verificationSucceeded') };
		} catch (error) {
			const result = translatedPublicAuthError(error);
			return fail(result.status, { success: false, message: result.message });
		}
	},
} satisfies Actions;

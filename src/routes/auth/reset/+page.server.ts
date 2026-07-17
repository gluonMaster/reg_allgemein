import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { resetPasswordInputSchema } from '$lib/server/auth/contracts';
import {
	requestAuthRuntime,
	requestSubject,
	translatedPublicAuthError,
} from '$lib/server/auth/http';

export const load: PageServerLoad = ({ url }) => ({ token: url.searchParams.get('token') ?? '' });

export const actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const parsed = resetPasswordInputSchema.safeParse({
			token: form.get('token'),
			password: form.get('password'),
		});
		if (!parsed.success) {
			return fail(400, { success: false, message: translate('de', 'auth.invalidInput') });
		}
		try {
			const reset = await requestAuthRuntime(event).service.resetPassword({
				token: parsed.data.token,
				password: parsed.data.password,
				requestId: event.locals.requestId,
				requestSubject: requestSubject(event),
			});
			if (!reset) {
				return fail(400, { success: false, message: translate('de', 'auth.passwordResetFailed') });
			}
			return { success: true, message: translate('de', 'auth.passwordResetSucceeded') };
		} catch (error) {
			const result = translatedPublicAuthError(error);
			return fail(result.status, { success: false, message: result.message });
		}
	},
} satisfies Actions;

import { fail, type Actions } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import { emailOnlyInputSchema } from '$lib/server/auth/contracts';
import {
	requestAuthRuntime,
	requestSubject,
	translatedPublicAuthError,
} from '$lib/server/auth/http';

export const actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const parsed = emailOnlyInputSchema.safeParse({ email: form.get('email') });
		if (!parsed.success) {
			return fail(400, { success: false, message: translate(event.locals.locale, 'auth.invalidInput') });
		}
		try {
			await requestAuthRuntime(event).service.resendVerification({
				email: parsed.data.email,
				requestSubject: requestSubject(event),
			});
			return { success: true, message: translate(event.locals.locale, 'auth.neutralAccountMessage') };
		} catch (error) {
			const result = translatedPublicAuthError(error, event.locals.locale);
			return fail(result.status, { success: false, message: result.message });
		}
	},
} satisfies Actions;

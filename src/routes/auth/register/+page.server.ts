import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { registerInputSchema } from '$lib/server/auth/contracts';
import {
	requestAuthRuntime,
	requestSubject,
	translatedPublicAuthError,
} from '$lib/server/auth/http';

export const load: PageServerLoad = ({ platform }) => {
	const config = loadRuntimeConfig(platform?.env);
	return {
		privacyNoticeVersion: config.auth.privacyNoticeVersion ?? '',
		turnstileSiteKey: config.turnstileSiteKey ?? '',
		authEnabled: config.auth.publicEnabled,
	};
};

export const actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const parsed = registerInputSchema.safeParse({
			email: form.get('email'),
			password: form.get('password'),
			firstName: form.get('firstName'),
			lastName: form.get('lastName'),
			privacyAccepted: form.get('privacyAccepted') === 'on',
			privacyNoticeVersion: form.get('privacyNoticeVersion'),
			turnstileToken: form.get('cf-turnstile-response'),
		});
		if (!parsed.success) {
			return fail(400, { success: false, message: translate('de', 'auth.invalidInput') });
		}

		try {
			const { service } = requestAuthRuntime(event);
			await service.register({
				data: parsed.data,
				requestSubject: requestSubject(event),
				remoteIp: requestSubject(event),
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'auth.registrationAccepted') };
		} catch (error) {
			const result = translatedPublicAuthError(error);
			return fail(result.status, { success: false, message: result.message });
		}
	},
} satisfies Actions;

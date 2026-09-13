import { fail, redirect, type Actions } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import { loginInputSchema } from '$lib/server/auth/contracts';
import {
	requestAuthRuntime,
	requestSubject,
	translatedPublicAuthError,
} from '$lib/server/auth/http';
import { setSessionCookies } from '$lib/server/auth/session';

export const actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const parsed = loginInputSchema.safeParse({
			email: form.get('email'),
			password: form.get('password'),
		});
		if (!parsed.success) {
			const invalidFields = (['email', 'password'] as const).filter((field) =>
				parsed.error.issues.some((issue) => issue.path[0] === field)
			);
			return fail(400, {
				success: false,
				message: translate(event.locals.locale, 'auth.invalidCredentials'),
				invalidFields: invalidFields.length > 0 ? invalidFields : ['email', 'password'],
			});
		}

		let runtime: ReturnType<typeof requestAuthRuntime>;
		let session;
		try {
			runtime = requestAuthRuntime(event);
			session = await runtime.service.login({
				data: parsed.data,
				requestSubject: requestSubject(event),
			});
		} catch (error) {
			const result = translatedPublicAuthError(error, event.locals.locale);
			return fail(result.status, {
				success: false,
				message: result.message,
				invalidFields:
					result.messageKey === 'auth.invalidCredentials'
						? (['email', 'password'] as const)
						: undefined,
			});
		}
		setSessionCookies({
			cookies: event.cookies,
			session,
			environment: runtime.config.appEnvironment,
		});
		throw redirect(303, session.role === 'admin' ? '/admin' : '/cabinet');
	},
} satisfies Actions;

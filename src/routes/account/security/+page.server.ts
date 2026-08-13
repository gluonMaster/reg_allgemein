import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { emailChangeInputSchema } from '$lib/server/auth/contracts';
import { requestAuthRuntime, translatedPublicAuthError } from '$lib/server/auth/http';
import {
	clearSessionCookies,
	CSRF_COOKIE_NAME,
} from '$lib/server/auth/session';
import { requireAuthenticated } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';

export const load: PageServerLoad = ({ cookies, locals }) => {
	const actor = requireAuthenticated(locals.user);
	return {
		csrfToken: cookies.get(CSRF_COOKIE_NAME) ?? '',
		homeHref: actor.role === 'admin' ? '/admin' : '/cabinet',
		role: actor.role,
	};
};

async function verifiedForm(event: Parameters<Actions[string]>[0]) {
	const form = await event.request.formData();
	await requireCsrf({
		cookies: event.cookies,
		user: event.locals.user,
		submittedToken: form.get('_csrf')?.toString(),
	});
	return { form, actor: requireAuthenticated(event.locals.user) };
}

export const actions = {
	changeEmail: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			const parsed = emailChangeInputSchema.safeParse({ email: form.get('email') });
			if (!parsed.success) {
				return fail(400, { success: false, message: translate('de', 'auth.invalidInput') });
			}
			const changed = await requestAuthRuntime(event).service.requestEmailChange({
				actor,
				email: parsed.data.email,
			});
			return changed
				? { success: true, message: translate('de', 'auth.emailChangeAccepted') }
				: fail(400, {
						success: false,
						message: translate('de', 'auth.emailChangeUnavailable'),
					});
		} catch (error) {
			const result = translatedPublicAuthError(error);
			return fail(result.status, { success: false, message: result.message });
		}
	},
	revokeSessions: async (event) => {
		try {
			const { actor } = await verifiedForm(event);
			const runtime = requestAuthRuntime(event);
			await runtime.service.revokeAllSessions({ actor, requestId: event.locals.requestId });
			clearSessionCookies(event.cookies, runtime.config.appEnvironment);
		} catch (error) {
			const result = translatedPublicAuthError(error);
			return fail(result.status, { success: false, message: result.message });
		}
		throw redirect(303, '/auth/login');
	},
	logout: async (event) => {
		try {
			const { actor } = await verifiedForm(event);
			const runtime = requestAuthRuntime(event);
			await runtime.service.logout({ actor, requestId: event.locals.requestId });
			clearSessionCookies(event.cookies, runtime.config.appEnvironment);
		} catch (error) {
			const result = translatedPublicAuthError(error);
			return fail(result.status, { success: false, message: result.message });
		}
		throw redirect(303, '/auth/login');
	},
} satisfies Actions;

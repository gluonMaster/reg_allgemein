import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { requireParent } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { requestTrialRuntime } from '$lib/server/trials/runtime';
import { TrialError } from '$lib/server/trials/trial-repository';
import { berlinCalendarDate } from '$lib/server/time/berlin';

function nextCalendarDate(now: string): string {
	const today = berlinCalendarDate(now);
	return new Date(Date.parse(`${today}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
}

export const load: PageServerLoad = async (event) => {
	const actor = requireParent(event.locals.user);
	return {
		csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
		commandKey: crypto.randomUUID(),
		minimumDate: nextCalendarDate(new Date().toISOString()),
		trial: await requestTrialRuntime(event).service.loadSubmissionPage(actor, event.params.courseId),
	};
};

export const actions = {
	submit: async (event) => {
		try {
			const form = await event.request.formData();
			await requireCsrf({
				cookies: event.cookies,
				user: event.locals.user,
				submittedToken: form.get('_csrf')?.toString(),
			});
			await requestTrialRuntime(event).service.submit({
				actor: requireParent(event.locals.user),
				payload: {
					courseGroupId: event.params.courseId,
					childId: form.get('childId'),
					sessionId: form.get('sessionId'),
					requestedDate: form.get('requestedDate'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate(event.locals.locale, 'trial.submitted') };
		} catch (caught) {
			return fail(
				caught instanceof TrialError && caught.code === 'TRIAL_CHILD_NOT_OWNED' ? 404 : 409,
				{ success: false, message: translate(event.locals.locale, 'trial.rejected') }
			);
		}
	},
} satisfies Actions;

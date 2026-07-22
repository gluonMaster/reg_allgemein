import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { requireAuthenticated } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { requestMessageRuntime } from '$lib/server/messages/runtime';

async function verifiedForm(event: Parameters<Actions[string]>[0]) {
	const form = await event.request.formData();
	await requireCsrf({
		cookies: event.cookies,
		user: event.locals.user,
		submittedToken: form.get('_csrf')?.toString(),
	});
	return { form, actor: requireAuthenticated(event.locals.user) };
}

export const load: PageServerLoad = async (event) => {
	const actor = requireAuthenticated(event.locals.user);
	const runtime = requestMessageRuntime(event);
	const [threads, absenceEnrollments] = await Promise.all([
		runtime.repository.listOwnerThreads(actor.id),
		runtime.repository.listAbsenceEnrollments(actor.id),
	]);
	return {
		csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
		threadKey: crypto.randomUUID(),
		absenceKey: crypto.randomUUID(),
		threads,
		absenceEnrollments,
	};
};

export const actions = {
	create: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			await requestMessageRuntime(event).service.createThread({
				actor,
				payload: {
					category: form.get('category'),
					subject: form.get('subject'),
					message: form.get('message'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'messages.created') };
		} catch {
			return fail(409, { success: false, message: translate('de', 'messages.failed') });
		}
	},
	absence: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			const runtime = requestMessageRuntime(event);
			const enrollmentId = form.get('enrollmentId')?.toString() ?? '';
			const option = (await runtime.repository.listAbsenceEnrollments(actor.id)).find(
				(candidate) => candidate.enrollmentId === enrollmentId
			);
			await runtime.service.createAbsence({
				actor,
				payload: {
					enrollmentId,
					childId: option?.childId ?? '',
					absenceDate: form.get('absenceDate'),
					reason: form.get('reason'),
					message: form.get('message')?.toString() ?? '',
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'absence.created') };
		} catch {
			return fail(409, { success: false, message: translate('de', 'messages.failed') });
		}
	},
} satisfies Actions;


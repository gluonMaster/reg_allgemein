import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { requireParent } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { requestMessageRuntime } from '$lib/server/messages/runtime';
import { requestCatalogRuntime } from '$lib/server/catalog/runtime';
import { loadContractInquiry } from '$lib/server/messages/contract-entry';

async function verifiedForm(event: Parameters<Actions[string]>[0], submittedForm?: FormData) {
	const form = submittedForm ?? await event.request.formData();
	await requireCsrf({
		cookies: event.cookies,
		user: event.locals.user,
		submittedToken: form.get('_csrf')?.toString(),
	});
	return { form, actor: requireParent(event.locals.user) };
}

export const load: PageServerLoad = async (event) => {
	const actor = requireParent(event.locals.user);
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
		contractInquiry: event.url.searchParams.has('course')
			? await loadContractInquiry(requestCatalogRuntime(event).repository, event.url.searchParams.get('course'), event.locals.locale ?? 'de')
			: null,
	};
};

export const actions = {
	create: async (event) => {
		let submittedForm: FormData | undefined;
		try {
			submittedForm = await event.request.formData();
			const { form, actor } = await verifiedForm(event, submittedForm);
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
			return { success: true, message: translate(event.locals.locale, 'messages.created') };
		} catch {
			const textField = (name: string) => {
				const value = submittedForm?.get(name);
				return typeof value === 'string' ? value : '';
			};
			return fail(409, {
				success: false,
				message: translate(event.locals.locale, 'messages.failed'),
				threadValues: {
					category: textField('category'), subject: textField('subject'),
					message: textField('message'), idempotencyKey: textField('idempotencyKey'),
				},
			});
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
			return { success: true, message: translate(event.locals.locale, 'absence.created') };
		} catch {
			return fail(409, { success: false, message: translate(event.locals.locale, 'messages.failed') });
		}
	},
} satisfies Actions;

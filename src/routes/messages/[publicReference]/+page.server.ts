import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { requireParent } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { MessageRepositoryError } from '$lib/server/messages/message-repository';
import { requestMessageRuntime } from '$lib/server/messages/runtime';

async function verifiedForm(event: Parameters<Actions[string]>[0]) {
	const form = await event.request.formData();
	await requireCsrf({ cookies: event.cookies, user: event.locals.user,
		submittedToken: form.get('_csrf')?.toString() });
	return { form, actor: requireParent(event.locals.user) };
}

export const load: PageServerLoad = async (event) => {
	const actor = requireParent(event.locals.user);
	const thread = await requestMessageRuntime(event).repository.getOwnerThread(
		event.params.publicReference,
		actor.id
	);
	if (!thread) throw error(404, {
		code: 'SUPPORT_THREAD_NOT_FOUND',
		message: translate(event.locals.locale, 'admin.notFound'),
		requestId: event.locals.requestId,
	});
	return { csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '', commandKey: crypto.randomUUID(), thread };
};

export const actions = {
	append: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			await requestMessageRuntime(event).service.appendParentMessage({ actor,
				payload: { publicReference: event.params.publicReference,
					message: form.get('message'), idempotencyKey: form.get('idempotencyKey') },
				requestId: event.locals.requestId });
			return { success: true, message: translate(event.locals.locale, 'messages.updated') };
		} catch (caught) {
			return fail(
				caught instanceof MessageRepositoryError &&
					caught.code === 'SUPPORT_THREAD_NOT_FOUND'
					? 404
					: 409,
				{ success: false, message: translate(event.locals.locale, 'messages.failed') }
			);
		}
	},
	close: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			await requestMessageRuntime(event).service.closeAsParent({ actor,
				payload: { publicReference: event.params.publicReference,
					idempotencyKey: form.get('idempotencyKey') }, requestId: event.locals.requestId });
			return { success: true, message: translate(event.locals.locale, 'messages.closed') };
		} catch (caught) {
			return fail(
				caught instanceof MessageRepositoryError &&
					caught.code === 'SUPPORT_THREAD_NOT_FOUND'
					? 404
					: 409,
				{ success: false, message: translate(event.locals.locale, 'messages.failed') }
			);
		}
	},
} satisfies Actions;

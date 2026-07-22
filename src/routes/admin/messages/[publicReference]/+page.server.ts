import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { verifiedAdminForm } from '$lib/server/admin/http';
import { requireAdmin } from '$lib/server/security/authorization';
import { requestMessageRuntime } from '$lib/server/messages/runtime';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const thread = await requestMessageRuntime(event).repository.getAdminThread(event.params.publicReference);
	if (!thread) throw error(404, {
		code: 'SUPPORT_THREAD_NOT_FOUND',
		message: translate('de', 'admin.notFound'),
		requestId: event.locals.requestId,
	});
	return { thread, commandKey: crypto.randomUUID() };
};

export const actions = {
	reply: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestMessageRuntime(event).service.replyAsAdmin({ admin: actor,
				payload: { publicReference: event.params.publicReference,
					message: form.get('message'), outcome: form.get('outcome'),
					idempotencyKey: form.get('idempotencyKey') }, requestId: event.locals.requestId });
			return { success: true, message: translate('de', 'admin.messages.replySaved') };
		} catch { return fail(409, { success: false, message: translate('de', 'admin.messages.actionFailed') }); }
	},
	close: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestMessageRuntime(event).service.closeAsAdmin({ admin: actor,
				payload: { publicReference: event.params.publicReference,
					idempotencyKey: form.get('idempotencyKey') }, requestId: event.locals.requestId });
			return { success: true, message: translate('de', 'messages.closed') };
		} catch { return fail(409, { success: false, message: translate('de', 'admin.messages.actionFailed') }); }
	},
} satisfies Actions;

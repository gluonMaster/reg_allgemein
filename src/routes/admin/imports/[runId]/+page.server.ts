import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { importIssueDecisionSchema } from '$lib/server/admin/contracts';
import { adminActionError, verifiedAdminForm } from '$lib/server/admin/http';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const run = await requestAdminConsoleRuntime(event).repository.importRunDetail(
		event.params.runId
	);
	if (!run)
		throw error(404, {
			code: 'ADMIN_RESOURCE_NOT_FOUND',
			message: translate('de', 'admin.notFound'),
			requestId: event.locals.requestId,
		});
	return { run };
};

export const actions = {
	decideIssue: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const parsed = importIssueDecisionSchema.safeParse({
				issueId: form.get('issueId'),
				decision: form.get('decision'),
				reason: form.get('reason'),
				confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) return fail(400, { success: false, message: adminActionError() });
			await requestAdminConsoleRuntime(event).mutations.decideImportIssue({
				actor,
				...parsed.data,
				requestId: event.locals.requestId,
				now: new Date().toISOString(),
			});
			return { success: true, message: translate('de', 'admin.action.completed') };
		} catch {
			return fail(409, { success: false, message: adminActionError() });
		}
	},
} satisfies Actions;

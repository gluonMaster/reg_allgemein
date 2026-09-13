import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { childCorrectionDecisionSchema, reviewDismissalSchema } from '$lib/server/admin/contracts';
import { adminActionError, adminQuery, verifiedAdminForm } from '$lib/server/admin/http';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const query = adminQuery(event.url);
	return {
		query,
		reviews: await requestAdminConsoleRuntime(event).repository.listReviews(query),
	};
};

export const actions = {
	decideChildCorrection: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const parsed = childCorrectionDecisionSchema.safeParse({
				taskId: form.get('taskId'),
				correctionId: form.get('correctionId'),
				decision: form.get('decision'),
				reason: form.get('reason'),
				confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) return fail(400, { success: false, message: adminActionError(event.locals.locale) });
			await requestAdminConsoleRuntime(event).mutations.decideChildCorrection({
				actor,
				...parsed.data,
				requestId: event.locals.requestId,
				now: new Date().toISOString(),
			});
			return { success: true, message: translate(event.locals.locale, 'admin.action.completed') };
		} catch {
			return fail(409, { success: false, message: adminActionError(event.locals.locale) });
		}
	},
	dismissFamilyReview: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const parsed = reviewDismissalSchema.safeParse({
				taskId: form.get('taskId'),
				decision: form.get('decision'),
				reason: form.get('reason'),
				confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) return fail(400, { success: false, message: adminActionError(event.locals.locale) });
			await requestAdminConsoleRuntime(event).mutations.dismissReview({
				actor,
				...parsed.data,
				requestId: event.locals.requestId,
				now: new Date().toISOString(),
			});
			return { success: true, message: translate(event.locals.locale, 'admin.action.completed') };
		} catch {
			return fail(409, { success: false, message: adminActionError(event.locals.locale) });
		}
	},
} satisfies Actions;

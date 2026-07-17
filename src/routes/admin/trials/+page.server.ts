import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { trialTransitionSchema } from '$lib/server/admin/contracts';
import { adminActionError, adminQuery, verifiedAdminForm } from '$lib/server/admin/http';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';
import { requireAdmin } from '$lib/server/security/authorization';
import { requestTrialRuntime } from '$lib/server/trials/runtime';
import { berlinCalendarDate } from '$lib/server/time/berlin';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const query = adminQuery(event.url);
	const repository = requestTrialRuntime(event).repository;
	const [trials, sessions] = await Promise.all([
		repository.listAdminTrials(query),
		repository.listAdminSessionOptions(),
	]);
	return { query, trials, sessions };
};

export const actions = {
	transition: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const parsed = trialTransitionSchema.safeParse({
				trialId: form.get('trialId'),
				action: form.get('action'),
				sessionId: form.get('sessionId')?.toString() || undefined,
				confirmedDate: form.get('confirmedDate')?.toString() || undefined,
				reason: form.get('reason'),
				confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) return fail(400, { success: false, message: adminActionError() });
			const now = new Date().toISOString();
			await requestAdminConsoleRuntime(event).mutations.transitionTrial({
				actor,
				...parsed.data,
				requestId: event.locals.requestId,
				currentDate: berlinCalendarDate(now),
				now,
			});
			return { success: true, message: translate('de', 'admin.action.completed') };
		} catch {
			return fail(409, { success: false, message: adminActionError() });
		}
	},
} satisfies Actions;


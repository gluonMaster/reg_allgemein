import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import {
	catalogCourseDecisionSchema,
	courseMappingDecisionSchema,
} from '$lib/server/admin/contracts';
import { adminActionError, adminQuery, verifiedAdminForm } from '$lib/server/admin/http';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const runtime = requestAdminConsoleRuntime(event);
	const query = adminQuery(event.url);
	const [catalog, mappingQueue] = await Promise.all([
		runtime.repository.listCatalog(query),
		runtime.repository.mappingQueue(),
	]);
	return { query, catalog, mappingQueue };
};

export const actions = {
	decideMapping: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const parsed = courseMappingDecisionSchema.safeParse({
				taskId: form.get('taskId')?.toString() || undefined,
				legacyEnrollmentId: form.get('legacyEnrollmentId')?.toString() || undefined,
				courseGroupId: form.get('courseGroupId')?.toString() || undefined,
				decision: form.get('decision'),
				reason: form.get('reason'),
				confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success || !parsed.data.legacyEnrollmentId || !parsed.data.courseGroupId) {
				return fail(400, { success: false, message: adminActionError() });
			}
			await requestAdminConsoleRuntime(event).mutations.decideCourseMapping({
				actor,
				taskId: parsed.data.taskId,
				legacyEnrollmentId: parsed.data.legacyEnrollmentId,
				courseGroupId: parsed.data.courseGroupId,
				decision: parsed.data.decision,
				reason: parsed.data.reason,
				idempotencyKey: parsed.data.idempotencyKey,
				requestId: event.locals.requestId,
				now: new Date().toISOString(),
			});
			return { success: true, message: translate('de', 'admin.action.completed') };
		} catch {
			return fail(409, { success: false, message: adminActionError() });
		}
	},
	updateCourse: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const parsed = catalogCourseDecisionSchema.safeParse({
				courseGroupId: form.get('courseGroupId'),
				action: form.get('action'),
				capacity: form.get('capacity')?.toString() ?? undefined,
				reason: form.get('reason'),
				confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) return fail(400, { success: false, message: adminActionError() });
			await requestAdminConsoleRuntime(event).mutations.updateCatalogCourse({
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

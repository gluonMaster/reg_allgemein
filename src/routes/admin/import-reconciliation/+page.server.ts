import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import {
	reconciliationBatchMutationSchema,
	reconciliationListQuerySchema,
	reconciliationMutationSchema,
} from '$lib/server/admin/contracts';
import { adminActionError, verifiedAdminForm } from '$lib/server/admin/http';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const parsed = reconciliationListQuerySchema.safeParse({
		periodId: event.url.searchParams.get('period') || undefined,
		sourceKind: event.url.searchParams.get('source') || undefined,
		issueClass: event.url.searchParams.get('class') || undefined,
		state: event.url.searchParams.get('state') || undefined,
		assigneeId: event.url.searchParams.get('assignee') || undefined,
		firstSeenRunId: event.url.searchParams.get('firstRun') || undefined,
		lastSeenRunId: event.url.searchParams.get('lastRun') || undefined,
		page: event.url.searchParams.get('page') || '1',
	});
	if (!parsed.success) {
		throw error(400, {
			code: 'ADMIN_QUERY_INVALID',
			message: translate('de', 'admin.action.failed'),
			requestId: event.locals.requestId,
		});
	}
	const runtime = requestAdminConsoleRuntime(event);
	const queue = await runtime.reconciliation.list(parsed.data);
	const selectedId = event.url.searchParams.get('case');
	const selected = selectedId ? await runtime.reconciliation.detail(selectedId) : null;
	return { queue, filters: parsed.data, selected };
};

export const actions = {
	mutate: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const parsed = reconciliationMutationSchema.safeParse({
				caseId: form.get('caseId'),
				expectedVersion: form.get('expectedVersion'),
				action: form.get('action'),
				reasonCode: form.get('reasonCode'),
				assigneeId: form.get('assigneeId')?.toString() || undefined,
				targetType: form.get('targetType')?.toString() || undefined,
				targetId: form.get('targetId')?.toString() || undefined,
				confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) return fail(400, { success: false, message: adminActionError() });
			await requestAdminConsoleRuntime(event).reconciliation.mutate({
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
	batch: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const cases = form.getAll('case').map((value) => {
				const [caseId, rawVersion] = value.toString().split('|');
				return { caseId, expectedVersion: Number(rawVersion) };
			});
			const parsed = reconciliationBatchMutationSchema.safeParse({
				casesJson: JSON.stringify(cases),
				action: form.get('action'),
				reasonCode: form.get('reasonCode'),
				assigneeId: form.get('assigneeId')?.toString() || undefined,
				confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) return fail(400, { success: false, message: adminActionError() });
			await requestAdminConsoleRuntime(event).reconciliation.batchMutate({
				actor,
				cases: parsed.data.casesJson,
				action: parsed.data.action,
				reasonCode: parsed.data.reasonCode,
				assigneeId: parsed.data.assigneeId,
				idempotencyKey: parsed.data.idempotencyKey,
				requestId: event.locals.requestId,
				now: new Date().toISOString(),
			});
			return { success: true, message: translate('de', 'admin.action.completed') };
		} catch {
			return fail(409, { success: false, message: adminActionError() });
		}
	},
} satisfies Actions;

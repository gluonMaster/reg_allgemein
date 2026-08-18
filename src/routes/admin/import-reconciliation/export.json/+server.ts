import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reconciliationListQuerySchema } from '$lib/server/admin/contracts';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const GET: RequestHandler = async (event) => {
	requireAdmin(event.locals.user);
	const filters = reconciliationListQuerySchema.parse({
		periodId: event.url.searchParams.get('period') || undefined,
		sourceKind: event.url.searchParams.get('source') || undefined,
		issueClass: event.url.searchParams.get('class') || undefined,
		state: event.url.searchParams.get('state') || undefined,
		assigneeId: event.url.searchParams.get('assignee') || undefined,
		firstSeenRunId: event.url.searchParams.get('firstRun') || undefined,
		lastSeenRunId: event.url.searchParams.get('lastRun') || undefined,
		page: '1',
	});
	const items = await requestAdminConsoleRuntime(event).reconciliation.exportList({
		periodId: filters.periodId,
		sourceKind: filters.sourceKind,
		issueClass: filters.issueClass,
		state: filters.state,
		assigneeId: filters.assigneeId,
		firstSeenRunId: filters.firstSeenRunId,
		lastSeenRunId: filters.lastSeenRunId,
	});
	return json(
		{
			contract: 'legacy-import-reconciliation-checklist:v2',
			generatedAt: new Date().toISOString(),
			total: items.length,
			items: items.map((item) => ({
				caseId: item.id,
				periodCode: item.periodCode,
				sourceKind: item.sourceKind,
				issueCode: item.issueCode,
				issueClass: item.issueClass,
				state: item.state,
				firstImportRunId: item.firstImportRunId,
				lastSeenImportRunId: item.lastSeenImportRunId,
				version: item.version,
			})),
		},
		{
			headers: {
				'cache-control': 'no-store',
				'content-disposition':
					'attachment; filename="import-reconciliation-checklist.json"',
			},
		}
	);
};

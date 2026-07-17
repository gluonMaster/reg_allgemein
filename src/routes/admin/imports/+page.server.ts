import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/security/authorization';
import { adminQuery } from '$lib/server/admin/http';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const query = adminQuery(event.url);
	return {
		query,
		runs: await requestAdminConsoleRuntime(event).repository.listImportRuns(query),
	};
};

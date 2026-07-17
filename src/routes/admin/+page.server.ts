import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/security/authorization';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	return { dashboard: await requestAdminConsoleRuntime(event).repository.dashboard() };
};

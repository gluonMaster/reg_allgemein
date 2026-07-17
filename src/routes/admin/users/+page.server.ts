import type { PageServerLoad } from './$types';
import { adminQuery } from '$lib/server/admin/http';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const query = adminQuery(event.url);
	return {
		query,
		users: await requestAdminConsoleRuntime(event).repository.listUsers(query),
	};
};

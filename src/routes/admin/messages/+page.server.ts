import type { PageServerLoad } from './$types';
import { adminQuery } from '$lib/server/admin/http';
import { requireAdmin } from '$lib/server/security/authorization';
import { requestMessageRuntime } from '$lib/server/messages/runtime';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const query = adminQuery(event.url);
	return {
		query,
		threads: await requestMessageRuntime(event).repository.listAdminThreads({
			q: query.q,
			status: query.status,
			category: query.kind,
		}),
	};
};


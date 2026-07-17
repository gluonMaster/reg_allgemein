import type { PageServerLoad } from './$types';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	return {
		pricing: await requestAdminConsoleRuntime(event).repository.pricingDiagnostics(),
	};
};

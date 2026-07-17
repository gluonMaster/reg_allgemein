import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const family = await requestAdminConsoleRuntime(event).repository.legacyFamilyDetail(
		event.params.familyId
	);
	if (!family)
		throw error(404, {
			code: 'ADMIN_RESOURCE_NOT_FOUND',
			message: translate('de', 'admin.notFound'),
			requestId: event.locals.requestId,
		});
	return { family };
};

import type { LayoutServerLoad } from './$types';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { requireAdmin } from '$lib/server/security/authorization';
import { buildAdminNavigation, trialAdminNavigation } from '$lib/server/admin/navigation';

export const load: LayoutServerLoad = (event) => {
	const actor = requireAdmin(event.locals.user);
	return {
		csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
		adminActorId: actor.id,
		navigation: buildAdminNavigation(trialAdminNavigation),
		commandKey: crypto.randomUUID(),
	};
};

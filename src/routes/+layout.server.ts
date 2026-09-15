import type { LayoutServerLoad } from './$types';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';

export const load: LayoutServerLoad = (event) => {
	const config = loadRuntimeConfig(event.platform?.env);
	return {
		officialLinks: config.officialLinks ?? null,
		locale: event.locals.locale ?? 'de',
		portalNavigation: {
			// Reading pathname makes SvelteKit refresh this server state on route navigation.
			pathname: event.url.pathname,
			role: event.locals.user?.role ?? null,
			csrfToken: event.locals.user ? (event.cookies.get(CSRF_COOKIE_NAME) ?? '') : '',
		},
	};
};

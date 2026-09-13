import type { LayoutServerLoad } from './$types';
import { loadRuntimeConfig } from '$lib/server/config/runtime';

export const load: LayoutServerLoad = (event) => {
	const config = loadRuntimeConfig(event.platform?.env);
	return { officialLinks: config.officialLinks ?? null, locale: event.locals.locale ?? 'de' };
};

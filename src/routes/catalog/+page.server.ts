import type { PageServerLoad } from './$types';
import { requestCatalogRuntime } from '$lib/server/catalog/runtime';

export const load: PageServerLoad = async (event) => ({
	courses: await requestCatalogRuntime(event).service.loadPublishedCatalog(),
});


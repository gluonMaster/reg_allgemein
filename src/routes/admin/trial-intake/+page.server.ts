import { loadIntakeList } from '$lib/trial-intake/server/pages.server';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = loadIntakeList;

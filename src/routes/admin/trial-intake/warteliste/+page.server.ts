import { loadWaitlistPrices } from '$lib/trial-intake/server/http.server';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = loadWaitlistPrices;

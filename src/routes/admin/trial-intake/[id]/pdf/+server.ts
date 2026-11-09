import { adminWaitlistPdf } from '$lib/trial-intake/server/http.server';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (event) => adminWaitlistPdf(event);

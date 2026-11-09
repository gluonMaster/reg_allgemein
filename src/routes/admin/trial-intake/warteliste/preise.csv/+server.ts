import { adminWaitlistExport } from '$lib/trial-intake/server/http.server';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (event) => adminWaitlistExport(event, 'csv');

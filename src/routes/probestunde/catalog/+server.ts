import { intakeEndpoint, catalog } from '$lib/trial-intake/server/http.server';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (event) => intakeEndpoint(() => catalog(event));

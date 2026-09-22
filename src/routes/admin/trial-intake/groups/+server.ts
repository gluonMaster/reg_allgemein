import { intakeEndpoint, adminClosed } from '$lib/trial-intake/server/http.server';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (event) => intakeEndpoint(() => adminClosed(event));
export const POST: RequestHandler = (event) => intakeEndpoint(() => adminClosed(event));

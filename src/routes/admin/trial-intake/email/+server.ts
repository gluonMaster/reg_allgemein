import { intakeEndpoint, adminEmail } from '$lib/trial-intake/server/http.server';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (event) => intakeEndpoint(() => adminEmail(event));
export const POST: RequestHandler = (event) => intakeEndpoint(() => adminEmail(event));

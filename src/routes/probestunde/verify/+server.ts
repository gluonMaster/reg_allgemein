import { intakeEndpoint, verify } from '$lib/trial-intake/server/http.server';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (event) => intakeEndpoint(() => verify(event));
export const POST: RequestHandler = (event) => intakeEndpoint(() => verify(event));

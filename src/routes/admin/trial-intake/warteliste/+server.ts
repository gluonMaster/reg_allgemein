import { intakeEndpoint, adminWaitlistPrice } from '$lib/trial-intake/server/http.server';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (event) => intakeEndpoint(() => adminWaitlistPrice(event));
export const POST: RequestHandler = (event) => intakeEndpoint(() => adminWaitlistPrice(event));

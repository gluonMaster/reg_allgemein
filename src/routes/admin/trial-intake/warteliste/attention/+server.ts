import { intakeEndpoint, adminWaitlistMarks } from '$lib/trial-intake/server/http.server';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = (event) => intakeEndpoint(() => adminWaitlistMarks(event));

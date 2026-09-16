import { intakeEndpoint, adminDetail, adminStatus } from '$lib/trial-intake/server/http.server';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (event) => intakeEndpoint(() => adminDetail(event));
export const POST: RequestHandler = (event) => intakeEndpoint(() => adminStatus(event));

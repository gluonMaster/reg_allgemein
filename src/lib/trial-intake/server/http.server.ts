import { json, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { FoundationRepository } from '$lib/server/db/foundation-repository';
import { CloudflareTurnstileVerifier } from '$lib/server/security/turnstile';
import { AuthRateLimiter, RateLimitExceededError } from '$lib/server/security/rate-limit';
import { AuthorizationError } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { requestSubject } from '$lib/server/auth/http';
import { INTAKE_BODY_LIMIT, INTAKE_PRIVACY_VERSION, type CatalogData } from '../contracts';
import { CatalogReader, boundedText } from './catalog.server';
import { closedLessonIds } from './closed.server';
import { IntakeService } from './service.server';
import { IntakeAdmin } from './admin.server';
import { IntakeError, intakeInputSchema } from './validation.server';

export function intakeRuntime(event: RequestEvent) {
	const config = loadRuntimeConfig(event.platform?.env);
	if (config.portalMode !== 'trial_intake' || !config.trialIntake || !config.jwtSecret)
		throw new IntakeError('INTAKE_UNAVAILABLE', 404);
	const db = new DatabaseBoundary(config.db);
	const service = new IntakeService(
		db,
		config.jwtSecret,
		config.messaging.telegramSchedule,
		config.messaging.emailMaxAttempts
	);
	return {
		config,
		service,
		admin: new IntakeAdmin(service),
		catalog: new CatalogReader(
			config.trialIntake.scheduleUrl,
			undefined,
			event.platform?.caches
				? () => event.platform!.caches.open('trial-intake-catalog-v1')
				: undefined
		),
		limiter: new AuthRateLimiter(
			new FoundationRepository(db),
			config.jwtSecret,
			config.auth.rateLimitWindowSeconds,
			config.auth.rateLimitMaxAttempts
		),
	};
}
async function readJson(event: RequestEvent): Promise<Record<string, unknown>> {
	const config = loadRuntimeConfig(event.platform?.env);
	const origin = event.request.headers.get('origin');
	const localTest =
		config.appEnvironment === 'test' &&
		origin === event.url.origin &&
		['127.0.0.1', 'localhost'].includes(event.url.hostname);
	if (origin !== config.portalPublicOrigin && !localTest)
		throw new IntakeError('INTAKE_ORIGIN_FORBIDDEN', 403);
	if (!event.request.headers.get('content-type')?.startsWith('application/json'))
		throw new IntakeError('INTAKE_JSON_REQUIRED', 415);
	if (Number(event.request.headers.get('content-length')) > INTAKE_BODY_LIMIT)
		throw new IntakeError('INTAKE_BODY_TOO_LARGE', 413);
	try {
		const value: unknown = JSON.parse(
			await boundedText(event.request.body, INTAKE_BODY_LIMIT, AbortSignal.timeout(5000))
		);
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
		return value as Record<string, unknown>;
	} catch (error) {
		if (error instanceof IntakeError) throw error;
		throw new IntakeError('INTAKE_INPUT_INVALID');
	}
}
export async function intakeEndpoint(action: () => Promise<unknown>): Promise<Response> {
	try {
		return json(await action(), {
			headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
		});
	} catch (error) {
		const status =
			error instanceof IntakeError
				? error.status
				: error instanceof RateLimitExceededError
					? 429
					: error instanceof AuthorizationError
						? error.code === 'AUTHENTICATION_REQUIRED'
							? 401
							: 403
						: error instanceof z.ZodError
							? 400
							: 503;
		const code =
			error instanceof IntakeError ||
			error instanceof AuthorizationError ||
			error instanceof RateLimitExceededError
				? error.code
				: status === 400
					? 'INTAKE_INPUT_INVALID'
					: 'INTAKE_UNAVAILABLE';
		return json(
			{ code },
			{ status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } }
		);
	}
}
export async function submit(event: RequestEvent) {
	const r = intakeRuntime(event);
	if (!r.config.trialIntake?.accepting) throw new IntakeError('INTAKE_MAINTENANCE', 503);
	const body = await readJson(event);
	const { turnstileToken, ...value } = body;
	const parsed = intakeInputSchema.safeParse(value);
	if (!parsed.success || typeof turnstileToken !== 'string')
		throw new IntakeError('INTAKE_INPUT_INVALID');
	const now = new Date().toISOString();
	const subject = requestSubject(event);
	await r.limiter.consume('intake-submit-ip', subject, now);
	await r.limiter.consume('intake-submit-email', parsed.data.email, now);
	const verifier = new CloudflareTurnstileVerifier(
		r.config.turnstileSecretKey ?? '',
		'trial_intake',
		r.config.turnstileHostnames
	);
	if (!(await verifier.verify({ token: turnstileToken, remoteIp: subject })))
		throw new IntakeError('INTAKE_TURNSTILE_REJECTED');
	return r.service.create(
		parsed.data,
		() => r.catalog.read(),
		now,
		(lessons) => closedLessonIds(r.service.db, lessons)
	);
}
export async function catalog(event: RequestEvent): Promise<CatalogData> {
	const r = intakeRuntime(event);
	const lessons = await r.catalog.read();
	return {
		lessons,
		closedLessonIds: await closedLessonIds(r.service.db, lessons),
		privacyVersion: INTAKE_PRIVACY_VERSION,
		accepting: r.config.trialIntake!.accepting,
		turnstileSiteKey: r.config.turnstileSiteKey,
		now: new Date().toISOString(),
	};
}
export async function verify(event: RequestEvent) {
	const r = intakeRuntime(event);
	const now = new Date().toISOString();
	if (event.request.method === 'GET')
		return r.service.inspectToken(event.url.searchParams.get('token') ?? '', now);
	const body = await readJson(event);
	await r.limiter.consume('intake-verify-ip', requestSubject(event), now);
	return r.service.verify(z.string().max(128).parse(body.token), now);
}
export async function resend(event: RequestEvent) {
	const r = intakeRuntime(event);
	const body = z
		.object({ id: z.uuid(), receipt: z.string().regex(/^[a-f0-9]{64}$/u) })
		.parse(await readJson(event));
	const now = new Date().toISOString();
	await r.limiter.consume('intake-resend-ip', requestSubject(event), now);
	await r.limiter.consume('intake-resend-receipt', body.id, now);
	return r.service.resend(body.id, body.receipt, now);
}
export async function adminList(event: RequestEvent) {
	return intakeRuntime(event).admin.list(
		event.locals.user,
		Object.fromEntries(event.url.searchParams),
		event.locals.requestId,
		new Date().toISOString()
	);
}
export async function adminDetail(event: RequestEvent) {
	return intakeRuntime(event).admin.detail(
		event.locals.user,
		event.params.id ?? '',
		event.locals.requestId,
		new Date().toISOString()
	);
}
async function adminBody(event: RequestEvent) {
	const body = await readJson(event);
	await requireCsrf({
		cookies: event.cookies,
		user: event.locals.user,
		submittedToken: typeof body._csrf === 'string' ? body._csrf : undefined,
	});
	return body;
}
export async function adminStatus(event: RequestEvent) {
	const body = await adminBody(event);
	return intakeRuntime(event).admin.setProcessed(
		event.locals.user,
		event.params.id ?? '',
		z.boolean().parse(body.processed),
		event.locals.requestId,
		new Date().toISOString()
	);
}
export async function adminClosed(event: RequestEvent) {
	const r = intakeRuntime(event);
	if (event.request.method === 'GET') return r.admin.closedLessons(event.locals.user);
	const body = await adminBody(event);
	const closed = z.boolean().parse(body.closed);
	const now = new Date().toISOString();
	if (typeof body.matchKey === 'string' && !closed)
		return r.admin.removeClosedLesson(
			event.locals.user,
			z.string().max(400).parse(body.matchKey),
			event.locals.requestId,
			now
		);
	const lessonId = z
		.string()
		.regex(/^[a-f0-9]{64}$/u)
		.parse(body.lessonId);
	const lesson = (await r.catalog.read()).find((l) => l.id === lessonId);
	if (!lesson) throw new IntakeError('INTAKE_LESSON_UNAVAILABLE', 409);
	return r.admin.setLessonClosed(event.locals.user, lesson, closed, event.locals.requestId, now);
}
export async function adminEmail(event: RequestEvent) {
	const r = intakeRuntime(event);
	if (event.request.method === 'GET') return r.admin.emailQueue(event.locals.user);
	const body = await adminBody(event);
	return r.admin.retryEmail(
		event.locals.user,
		z.string().max(160).parse(body.id),
		event.locals.requestId,
		new Date().toISOString()
	);
}

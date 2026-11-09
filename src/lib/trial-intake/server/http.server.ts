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
import { IntakeAdmin, requireActiveAdmin } from './admin.server';
import { IntakeError, intakeInputSchema } from './validation.server';
import { WaitlistPrices } from './prices.server';
import { IMPORT_MAX_BYTES, priceCsv, priceXlsx } from './price-files.server';
import { parseEuroCents, parseMinParticipants } from '../prices';
import {
	matchesVerifiedDevice,
	verifiedDeviceValue,
	VERIFIED_DEVICE_COOKIE,
	VERIFIED_DEVICE_MAX_AGE,
} from './device.server';

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
		prices: new WaitlistPrices(db),
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
async function readJson(
	event: RequestEvent,
	limit = INTAKE_BODY_LIMIT
): Promise<Record<string, unknown>> {
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
	if (Number(event.request.headers.get('content-length')) > limit)
		throw new IntakeError('INTAKE_BODY_TOO_LARGE', 413);
	try {
		const value: unknown = JSON.parse(
			await boundedText(event.request.body, limit, AbortSignal.timeout(5000))
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
		const details = error instanceof IntakeError ? error.details : undefined;
		return json(
			{ code, ...details },
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
		(lessons) => closedLessonIds(r.service.db, lessons),
		await matchesVerifiedDevice(
			r.config.jwtSecret!,
			event.cookies.get(VERIFIED_DEVICE_COOKIE),
			parsed.data.email
		)
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
	const result = await r.service.verify(z.string().max(128).parse(body.token), now);
	event.cookies.set(
		VERIFIED_DEVICE_COOKIE,
		await verifiedDeviceValue(r.config.jwtSecret!, result.email),
		{
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			path: '/probestunde',
			maxAge: VERIFIED_DEVICE_MAX_AGE,
		}
	);
	return { state: result.state };
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
async function adminBody(event: RequestEvent, limit = INTAKE_BODY_LIMIT) {
	const body = await readJson(event, limit);
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
/** The schedule, or null when it cannot be read: stored prices stay visible without it. */
async function plannedCatalog(r: ReturnType<typeof intakeRuntime>) {
	try {
		return [...(await r.catalog.read())];
	} catch {
		return null;
	}
}
async function catalogLesson(r: ReturnType<typeof intakeRuntime>, lessonId: unknown) {
	const id = z
		.string()
		.regex(/^[a-f0-9]{64}$/u)
		.parse(lessonId);
	const lesson = (await r.catalog.read()).find((l) => l.id === id);
	if (!lesson) throw new IntakeError('INTAKE_LESSON_UNAVAILABLE', 409);
	return lesson;
}
export async function loadWaitlistPrices(event: RequestEvent) {
	const r = intakeRuntime(event);
	// The admin check runs first; a missing schedule must still show what is stored.
	await requireActiveAdmin(r.service.db, event.locals.user);
	return r.prices.overview(event.locals.user, await plannedCatalog(r));
}
/** Set both sums and the threshold of a planned course, or delete an unlocked price. */
export async function adminWaitlistPrice(event: RequestEvent) {
	const r = intakeRuntime(event);
	if (event.request.method === 'GET') return loadWaitlistPrices(event);
	const body = await adminBody(event);
	const now = new Date().toISOString();
	if (body.delete === true)
		return r.prices.deletePrice(
			event.locals.user,
			z.string().min(2).max(400).parse(body.key),
			event.locals.requestId,
			now
		);
	const text = (value: unknown) =>
		typeof value === 'string' || typeof value === 'number' ? String(value) : '';
	const monthlyCents = parseEuroCents(text(body.monthly));
	const yearlyCents = parseEuroCents(text(body.yearly));
	const minParticipants = parseMinParticipants(text(body.minParticipants));
	if (monthlyCents === null || yearlyCents === null || minParticipants === null)
		throw new IntakeError('WAITLIST_PRICE_INVALID');
	await requireActiveAdmin(r.service.db, event.locals.user);
	return r.prices.setPrice(
		event.locals.user,
		await catalogLesson(r, body.lessonId),
		{ monthlyCents, yearlyCents, minParticipants },
		event.locals.requestId,
		now
	);
}
const FILES = {
	csv: { type: 'text/csv; charset=utf-8', build: priceCsv },
	xlsx: {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		build: priceXlsx,
	},
};
export async function adminWaitlistExport(event: RequestEvent, format: keyof typeof FILES) {
	try {
		const r = intakeRuntime(event);
		await requireActiveAdmin(r.service.db, event.locals.user);
		const rows = await r.prices.exportRows(event.locals.user, await plannedCatalog(r));
		return new Response(new Blob([FILES[format].build(rows) as Uint8Array<ArrayBuffer>]), {
			headers: {
				'content-type': FILES[format].type,
				'content-disposition': `attachment; filename="Warteliste-Preise.${format}"`,
				'cache-control': 'no-store',
				'referrer-policy': 'no-referrer',
			},
		});
	} catch (error) {
		return intakeEndpoint(() => Promise.reject(error));
	}
}
/** Base64 inflates the file by a third; JSON adds the name and the token. */
const IMPORT_BODY_LIMIT = Math.ceil((IMPORT_MAX_BYTES * 4) / 3) + 4096;
/** Two steps: an upload returns the preview, `apply` sends the normalized changes back. */
export async function adminWaitlistImport(event: RequestEvent) {
	const r = intakeRuntime(event);
	const body = await adminBody(event, IMPORT_BODY_LIMIT);
	await requireActiveAdmin(r.service.db, event.locals.user);
	if (body.action === 'apply') {
		return r.prices.applyImport(
			event.locals.user,
			body.changes,
			await r.catalog.read(),
			event.locals.requestId,
			new Date().toISOString()
		);
	}
	const file = z
		.object({
			fileName: z.string().max(200),
			content: z
				.string()
				.max(IMPORT_BODY_LIMIT)
				.regex(/^[A-Za-z0-9+/]*={0,2}$/u),
		})
		.parse(body);
	let bytes: Uint8Array;
	try {
		bytes = Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0));
	} catch {
		throw new IntakeError('WAITLIST_IMPORT_INVALID', 422);
	}
	return r.prices.previewImport(event.locals.user, bytes, file.fileName, await r.catalog.read());
}

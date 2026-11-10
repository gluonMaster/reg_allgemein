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
import {
	INTAKE_BODY_LIMIT,
	INTAKE_PRIVACY_VERSION,
	type CatalogData,
	type Lesson,
	type VerificationResult,
	type WaitlistAttention,
} from '../contracts';
import { CatalogReader, boundedText } from './catalog.server';
import { closedLessonIds } from './closed.server';
import { IntakeService } from './service.server';
import { ACTIVE, IntakeAdmin, requireActiveAdmin } from './admin.server';
import { IntakeError, intakeInputSchema } from './validation.server';
import { WaitlistPrices } from './prices.server';
import { WaitlistSignup, waitlistInputSchema } from './waitlist.server';
import { WaitlistStart } from './waitlist-start.server';
import { WaitlistRebind, rebindOptions } from './waitlist-rebind.server';
import { isPlannedLesson, plannedCourseKey } from '../planned';
import { readWaitlistDocument, waitlistPdfAdapter } from './waitlist-pdf.server';
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
	const prices = new WaitlistPrices(db);
	const service = new IntakeService(
		db,
		config.jwtSecret,
		config.messaging.telegramSchedule,
		config.messaging.emailMaxAttempts
	);
	const waitlist = new WaitlistSignup(
		service,
		config.jwtSecret,
		config.messaging.emailMaxAttempts
	);
	return {
		config,
		service,
		admin: new IntakeAdmin(service),
		prices,
		waitlist,
		rebind: new WaitlistRebind(db, prices, waitlist),
		start: new WaitlistStart(
			db,
			prices,
			waitlistPdfAdapter(config) !== null,
			config.messaging.emailMaxAttempts
		),
		catalog: new CatalogReader(
			config.trialIntake.scheduleUrl,
			undefined,
			event.platform?.caches
				? () => event.platform!.caches.open('trial-intake-catalog-v1')
				: undefined,
			// The admin always reads the published schedule; the public pages keep the short cache.
			event.url.pathname.startsWith('/admin/')
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
/** Both submit rate limits and Turnstile, shared by the trial request and the waitlist (TIN-10). */
async function guardSubmit(
	event: RequestEvent,
	r: ReturnType<typeof intakeRuntime>,
	email: string,
	turnstileToken: string,
	now: string
) {
	const subject = requestSubject(event);
	await r.limiter.consume('intake-submit-ip', subject, now);
	await r.limiter.consume('intake-submit-email', email, now);
	const verifier = new CloudflareTurnstileVerifier(
		r.config.turnstileSecretKey ?? '',
		'trial_intake',
		r.config.turnstileHostnames
	);
	if (!(await verifier.verify({ token: turnstileToken, remoteIp: subject })))
		throw new IntakeError('INTAKE_TURNSTILE_REJECTED');
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
	await guardSubmit(event, r, parsed.data.email, turnstileToken, now);
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
/** WL-04: one signup to the waitlist of a planned course; never pre-verified by the device cookie. */
export async function waitlistSubmit(event: RequestEvent) {
	const r = intakeRuntime(event);
	if (!r.config.trialIntake?.accepting) throw new IntakeError('INTAKE_MAINTENANCE', 503);
	const body = await readJson(event);
	const { turnstileToken, ...value } = body;
	if (value.consent !== true) throw new IntakeError('WAITLIST_CONSENT_REQUIRED');
	const parsed = waitlistInputSchema.safeParse(value);
	if (!parsed.success || typeof turnstileToken !== 'string')
		throw new IntakeError('INTAKE_INPUT_INVALID');
	const now = new Date().toISOString();
	await guardSubmit(event, r, parsed.data.email, turnstileToken, now);
	return r.waitlist.create(parsed.data, () => r.catalog.read(), now);
}
/** GET shows the course and one button; POST withdraws (WL-12). */
export async function withdrawal(event: RequestEvent) {
	const r = intakeRuntime(event);
	const now = new Date().toISOString();
	if (event.request.method === 'GET')
		return r.waitlist.inspectWithdrawal(event.url.searchParams.get('token') ?? '', now);
	const body = await readJson(event);
	await r.limiter.consume('waitlist-withdraw-ip', requestSubject(event), now);
	return r.waitlist.withdraw(z.string().max(128).parse(body.token), event.locals.requestId, now);
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
/**
 * A signup cancelled by a rebind may join the course its queue moved to: the page links the form
 * when that course has exactly one planned card in the schedule (OQ-052). The key stays internal.
 */
async function signupLink(
	r: ReturnType<typeof intakeRuntime>,
	result: VerificationResult & { courseKey?: string }
): Promise<VerificationResult> {
	const { courseKey, ...rest } = result;
	if (!courseKey) return rest;
	let lessons: readonly Lesson[];
	try {
		lessons = await r.catalog.read();
	} catch {
		return rest;
	}
	const cards = lessons.filter((l) => isPlannedLesson(l) && plannedCourseKey(l) === courseKey);
	return cards.length === 1 ? { ...rest, lessonId: cards[0].id } : rest;
}
export async function verify(event: RequestEvent) {
	const r = intakeRuntime(event);
	const now = new Date().toISOString();
	if (event.request.method === 'GET')
		return signupLink(
			r,
			await r.service.inspectToken(event.url.searchParams.get('token') ?? '', now)
		);
	const body = await readJson(event);
	await r.limiter.consume('intake-verify-ip', requestSubject(event), now);
	const { email, ...result } = await r.service.verify(z.string().max(128).parse(body.token), now);
	// The address is confirmed also when a waitlist signup came too late for its course.
	event.cookies.set(
		VERIFIED_DEVICE_COOKIE,
		await verifiedDeviceValue(r.config.jwtSecret!, email),
		{
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			path: '/probestunde',
			maxAge: VERIFIED_DEVICE_MAX_AGE,
		}
	);
	return signupLink(r, result);
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
	if (typeof body.retryLetter === 'string')
		return intakeRuntime(event).start.retryLetter(
			event.locals.user,
			event.params.id ?? '',
			z.string().max(200).parse(body.retryLetter),
			event.locals.requestId,
			new Date().toISOString()
		);
	if (body.withdraw === true)
		return intakeRuntime(event).waitlist.withdrawByAdmin(
			event.locals.user,
			event.params.id ?? '',
			event.locals.requestId,
			new Date().toISOString()
		);
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
	const actor = await requireActiveAdmin(r.service.db, event.locals.user);
	const data = await r.prices.overview(event.locals.user, await plannedCatalog(r));
	const entries = await r.waitlist.entries(
		actor,
		event.locals.requestId,
		new Date().toISOString()
	);
	const now = new Date().toISOString();
	for (const course of [...data.courses, ...data.unscheduled])
		course.entries = entries.get(course.key) ?? [];
	for (const course of data.courses) course.start = r.start.options(course, now);
	// Without a readable schedule the tool stays closed: no course turns into a vanished one.
	if (!data.catalogError)
		for (const course of data.unscheduled) course.rebind = rebindOptions(course, data);
	return data;
}
const ATTENTION = new Set(['ready', 'price_missing', 'gone', 'ambiguous']);
/** WL-07: the banner of `/admin/trial-intake`; without a schedule only the counts remain. */
export async function waitlistAttention(event: RequestEvent): Promise<WaitlistAttention> {
	const r = intakeRuntime(event);
	const data = await r.prices.overview(event.locals.user, await plannedCatalog(r));
	const all = [...data.courses, ...data.unscheduled];
	// A dead letter stays in the banner until the bureau marks the signup as processed.
	const letters = await r.service.db.first<{ unsent: number; dead: number }>({
		sql: `SELECT COALESCE(SUM(o.status IN ('pending','retry','processing')), 0) AS unsent,
		 COALESCE(SUM(o.status = 'dead' AND r.state = 'verified'), 0) AS dead
		 FROM trial_intake_waitlist_email_outbox o JOIN trial_intake_requests r ON r.id = o.request_id
		 WHERE o.kind = 'start'`,
	});
	return {
		startLetters: { unsent: Number(letters?.unsent ?? 0), dead: Number(letters?.dead ?? 0) },
		courses: data.courses.length,
		children: all.reduce((sum, course) => sum + course.children, 0),
		attention: all
			.filter(
				(course) =>
					ATTENTION.has(course.status ?? '') ||
					course.attention?.length ||
					course.priceOpen.length
			)
			.map(
				({
					key,
					course,
					status,
					children,
					price,
					firstDate,
					activeEntries,
					attention,
					priceOpen,
				}) => ({
					key,
					course,
					status,
					children,
					price,
					firstDate,
					activeEntries,
					attention,
					priceOpen,
				})
			),
	};
}
/** WL-15: rebind of a queue or of a price without one to another planned card. */
export async function adminWaitlistRebind(event: RequestEvent) {
	const r = intakeRuntime(event);
	const body = await adminBody(event);
	await requireActiveAdmin(r.service.db, event.locals.user);
	// The server compares against the schedule as it is now; without it the rebind is refused.
	const lessons = await r.catalog.read();
	return r.rebind.rebind(
		event.locals.user,
		lessons,
		body,
		event.locals.requestId,
		new Date().toISOString()
	);
}
/** "Familien informiert" and the price decisions of the red mark (WL-15). */
export async function adminWaitlistMarks(event: RequestEvent) {
	const r = intakeRuntime(event);
	const body = await adminBody(event);
	const now = new Date().toISOString();
	if (body.action === 'informed')
		return r.rebind.informed(event.locals.user, body, event.locals.requestId, now);
	if (body.action === 'confirmed' || body.action === 'declined')
		return r.rebind.decide(
			event.locals.user,
			{ requestId: body.requestId, decision: body.action },
			event.locals.requestId,
			now
		);
	throw new IntakeError('INTAKE_INPUT_INVALID');
}
/** "Als neuen Kurs öffnen" (WL-15). */
export async function adminWaitlistReopen(event: RequestEvent) {
	const r = intakeRuntime(event);
	const body = await adminBody(event);
	return r.rebind.reopen(
		event.locals.user,
		body,
		event.locals.requestId,
		new Date().toISOString()
	);
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
/** The start dialog: letter preview, probe to the signed-in admin, confirmed start (WL-10). */
export async function adminWaitlistStart(event: RequestEvent) {
	const r = intakeRuntime(event);
	const body = await adminBody(event);
	await requireActiveAdmin(r.service.db, event.locals.user);
	const lessons = await r.catalog.read();
	const now = new Date().toISOString();
	if (body.action === 'preview') return r.start.preview(event.locals.user, lessons, body, now);
	if (body.action === 'probe')
		return r.start.probe(event.locals.user, lessons, body, event.locals.requestId, now);
	if (body.action === 'start')
		return r.start.start(event.locals.user, lessons, body, event.locals.requestId, now);
	throw new IntakeError('INTAKE_INPUT_INVALID');
}
/** "PDF ansehen": the stored start PDF of a signup; it carries family data, so it is audited. */
export async function adminWaitlistPdf(event: RequestEvent) {
	try {
		const r = intakeRuntime(event);
		const actor = await requireActiveAdmin(r.service.db, event.locals.user);
		const id = z.uuid().parse(event.params.id);
		const document = await readWaitlistDocument(r.service.db, id);
		if (!document) throw new IntakeError('INTAKE_NOT_FOUND', 404);
		const audit = await r.service.db.run({
			sql: `INSERT INTO audit_events(id, actor_user_id, actor_kind, action, target_kind, target_id, request_id, safe_diff_json, created_at)
			 SELECT ?, ?, 'user', 'trial_intake.waitlist_pdf_read', 'trial_intake', ?, ?, ?, ? WHERE ${ACTIVE}`,
			params: [
				crypto.randomUUID(),
				actor.id,
				id,
				event.locals.requestId,
				JSON.stringify({ sha256: document.sha256 }),
				new Date().toISOString(),
				actor.id,
			],
		});
		if (audit.meta.changes !== 1) throw new AuthorizationError('FORBIDDEN');
		return new Response(new Blob([document.bytes as Uint8Array<ArrayBuffer>]), {
			headers: {
				'content-type': 'application/pdf',
				'content-disposition': `attachment; filename="${document.fileName}"`,
				'cache-control': 'no-store',
				'referrer-policy': 'no-referrer',
				'x-content-type-options': 'nosniff',
			},
		});
	} catch (error) {
		return intakeEndpoint(() => Promise.reject(error));
	}
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

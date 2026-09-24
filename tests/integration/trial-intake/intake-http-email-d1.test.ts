import fixture from '../../fixtures/trial-intake/catalog-v1.json';
import { afterSeconds } from '$lib/trial-intake/server/service.server';
import { INTAKE_PRIVACY_VERSION } from '$lib/trial-intake/contracts';
import { IntakeAdmin } from '$lib/trial-intake/server/admin.server';
import { buildIntakeBootstrap } from '$lib/trial-intake/server/bootstrap.server';
import { createAuthRuntime } from '$lib/server/auth/runtime';
import { createOutboxRuntime } from '$lib/server/outbox/runtime';
import { FakeEmailProvider, EmailProviderError } from '$lib/server/outbox/providers';
import { ORGANIZATION_NAME } from '$lib/organization';
import { intakeEndpoint, submit, verify } from '$lib/trial-intake/server/http.server';
import { verifiedDeviceValue } from '$lib/trial-intake/server/device.server';
import type { RequestEvent } from '@sveltejs/kit';
import {
	useIntakeD1,
	NOW,
	SECRET,
	schedule,
	lessons,
	actor,
	ctx,
	db,
	service,
	data,
	config,
	token,
	verified,
	seedAdmin,
} from './intake-harness';

useIntakeD1();

describe('intake HTTP, device cookie, e-mail and admin bootstrap', () => {
	it('HTTP submit uses real Turnstile action/hostname validation and rate limits before intake writes', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(NOW));
		let action = 'wrong-action';
		const fetcher = vi.fn(async (url: string | URL | Request) =>
			String(url).includes('/siteverify')
				? Response.json({ success: true, action, hostname: 'portal.example.test' })
				: new Response(
						`<script id="trial-intake-catalog" type="application/json">${JSON.stringify(fixture)}</script>`
					)
		);
		vi.stubGlobal('fetch', fetcher);
		const env = {
			APP_ENV: 'test',
			DB: ctx.db,
			PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
			PORTAL_MODE: 'trial_intake',
			TRIAL_INTAKE_SCHEDULE_URL: 'https://schedule.example.test/',
			TRIAL_INTAKE_ACCEPTING: 'true',
			JWT_SECRET: SECRET,
			AUTH_PUBLIC_ENABLED: 'true',
			PRIVACY_NOTICE_VERSION: INTAKE_PRIVACY_VERSION,
			EMAIL_PROVIDER: 'fake',
			TURNSTILE_SECRET_KEY: 'synthetic-secret',
			TURNSTILE_HOSTNAMES: 'portal.example.test',
			AUTH_RATE_LIMIT_MAX_ATTEMPTS: '2',
		} as App.Platform['env'];
		const input = data();
		const cookie = await verifiedDeviceValue(SECRET, input.email);
		const invoke = () => {
			const event = {
				cookies: { get: () => cookie },
				platform: { env },
				url: new URL('https://portal.example.test/probestunde/submit'),
				locals: { requestId: 'synthetic' },
				getClientAddress: () => '192.0.2.1',
				request: new Request('https://portal.example.test/probestunde/submit', {
					method: 'POST',
					headers: {
						origin: 'https://portal.example.test',
						'content-type': 'application/json',
					},
					body: JSON.stringify({ ...input, turnstileToken: 'synthetic-token' }),
				}),
			} as unknown as RequestEvent;
			return intakeEndpoint(() => submit(event));
		};
		expect((await invoke()).status).toBe(400);
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_requests',
				})
			)?.n
		).toBe(0);
		action = 'trial_intake';
		expect((await invoke()).status).toBe(200);
		expect((await invoke()).status).toBe(429);
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM trial_intake_requests',
				})
			)?.n
		).toBe(1);
	});
	it('issues the device cookie only on successful POST and accepts only its signed matching address', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(NOW));
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string | URL | Request) =>
				String(url).includes('/siteverify')
					? Response.json({
							success: true,
							action: 'trial_intake',
							hostname: 'portal.example.test',
						})
					: new Response(
							`<script id="trial-intake-catalog" type="application/json">${JSON.stringify(fixture)}</script>`
						)
			)
		);
		const setCookie = vi.fn();
		const event = (path: string, body?: unknown, cookie?: string) =>
			({
				platform: {
					env: {
						APP_ENV: 'test',
						DB: ctx.db,
						PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
						PORTAL_MODE: 'trial_intake',
						TRIAL_INTAKE_SCHEDULE_URL: 'https://schedule.example.test/',
						TRIAL_INTAKE_ACCEPTING: 'true',
						JWT_SECRET: SECRET,
						AUTH_PUBLIC_ENABLED: 'true',
						PRIVACY_NOTICE_VERSION: INTAKE_PRIVACY_VERSION,
						EMAIL_PROVIDER: 'fake',
						TURNSTILE_SECRET_KEY: 'synthetic-secret',
						TURNSTILE_HOSTNAMES: 'portal.example.test',
						AUTH_RATE_LIMIT_MAX_ATTEMPTS: '30',
					},
				},
				url: new URL(`https://portal.example.test/probestunde/${path}`),
				locals: { requestId: 'synthetic' },
				getClientAddress: () => '192.0.2.1',
				cookies: { get: () => cookie, set: setCookie },
				request: new Request(`https://portal.example.test/probestunde/${path}`, {
					method: body ? 'POST' : 'GET',
					headers: {
						origin: 'https://portal.example.test',
						'content-type': 'application/json',
					},
					...(body ? { body: JSON.stringify(body) } : {}),
				}),
			}) as unknown as RequestEvent;
		const first = await service.create(data(), async () => lessons, NOW);
		const t = await token(first.id);
		expect(await verify(event(`verify?token=${t}`))).toEqual({ state: 'confirm' });
		expect(setCookie).not.toHaveBeenCalled();
		expect(
			(await intakeEndpoint(() => verify(event('verify', { token: 'invalid' })))).status
		).toBe(410);
		expect(setCookie).not.toHaveBeenCalled();
		expect(await verify(event('verify', { token: t }))).toEqual({ state: 'accepted' });
		const cookie = await verifiedDeviceValue(SECRET, data().email);
		expect(setCookie).toHaveBeenCalledWith('ti_verified', cookie, {
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			path: '/probestunde',
			maxAge: 180 * 86400,
		});
		const [email, signature] = JSON.parse(cookie);
		const cases = [
			{ cookie, state: 'verified' },
			{ cookie: undefined, state: 'pending_email' },
			{
				cookie: JSON.stringify([
					email,
					`${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`,
				]),
				state: 'pending_email',
			},
			{
				cookie: await verifiedDeviceValue(SECRET, 'other@example.test'),
				state: 'pending_email',
			},
			{
				cookie: await verifiedDeviceValue('different-secret', email),
				state: 'pending_email',
			},
			{ cookie: 'malformed', state: 'pending_email' },
		];
		for (const entry of cases) {
			const input = {
				...data(),
				email: 'GUEST@example.test',
				turnstileToken: 'synthetic-token',
			};
			const response = await submit(event('submit', input, entry.cookie));
			expect(response.state).toBe(entry.state);
			const stored = (await service.get(response.id))!;
			expect(stored.verified_at).toBe(entry.state === 'verified' ? NOW : null);
			const emails = (
				await db.all<{ kind: string }>({
					sql: 'SELECT kind FROM trial_intake_email_outbox WHERE request_id = ?',
					params: [response.id],
				})
			).results;
			expect(emails).toEqual([
				{ kind: entry.state === 'verified' ? 'confirmation' : 'verification' },
			]);
			const payloads = (
				await db.all({
					sql: 'SELECT id FROM trial_intake_telegram_payloads WHERE request_id = ?',
					params: [response.id],
				})
			).results;
			const jobs = (
				await db.all({
					sql: 'SELECT id FROM telegram_outbox WHERE source_id = ?',
					params: [response.id],
				})
			).results;
			expect(payloads).toHaveLength(entry.state === 'verified' ? 1 : 0);
			expect(jobs).toHaveLength(payloads.length);
		}
	});
	it('preverified acceptance is atomic, retryable after failure and concurrent replay does not duplicate deliveries', async () => {
		const input = data();
		await db.run({
			sql: `CREATE TRIGGER synthetic_reject_confirmation BEFORE INSERT ON trial_intake_email_outbox WHEN NEW.kind = 'confirmation' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END`,
		});
		await expect(
			service.create(input, async () => lessons, NOW, undefined, true)
		).rejects.toThrow();
		expect(
			(await db.first<{ state: string }>({ sql: 'SELECT state FROM trial_intake_requests' }))
				?.state
		).toBe('pending_email');
		for (const table of [
			'trial_intake_email_outbox',
			'trial_intake_telegram_payloads',
			'telegram_outbox',
		])
			expect(
				(await db.first<{ n: number }>({ sql: `SELECT COUNT(*) AS n FROM ${table}` }))?.n
			).toBe(0);
		await db.run({ sql: 'DROP TRIGGER synthetic_reject_confirmation' });
		const results = await Promise.all([
			service.create(input, async () => lessons, NOW, undefined, true),
			service.create(input, async () => lessons, NOW, undefined, true),
		]);
		expect(results[0]).toEqual(results[1]);
		expect(results[0].state).toBe('verified');
		for (const table of [
			'trial_intake_requests',
			'trial_intake_email_outbox',
			'trial_intake_telegram_payloads',
			'telegram_outbox',
		])
			expect(
				(await db.first<{ n: number }>({ sql: `SELECT COUNT(*) AS n FROM ${table}` }))?.n
			).toBe(1);
		await expect(
			service.create(
				{ ...input, phone: '+49 111111111' },
				async () => lessons,
				NOW,
				undefined,
				true
			)
		).rejects.toMatchObject({ status: 409 });
		const email = new FakeEmailProvider();
		const runtime = createOutboxRuntime(config(), { emailProvider: email });
		expect(await runtime.emailWorker.dispatchNext(NOW)).toBe('sent');
		expect(email.messages[0].subject).toContain('Ihre Anmeldung');
		expect(email.messages[0].text).not.toContain('/probestunde/verify');
		expect(await runtime.emailWorker.dispatchNext(NOW)).toBe('empty');
	});
	it('uses the existing email engine, minimal German mail and current-token dispatch guard', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		const email = new FakeEmailProvider();
		const runtime = createOutboxRuntime(config(), { emailProvider: email });
		expect(await runtime.emailWorker.dispatchNext(NOW)).toBe('sent');
		expect(email.messages[0].text).toContain('Musik');
		expect(email.messages[0].text).toContain(ORGANIZATION_NAME);
		expect(email.messages[0].text).not.toContain('2020-02-29');
		expect(email.messages[0].text).not.toContain('Zulu');
		expect(email.messages[0].html).toContain('>Anfrage bestätigen</a>');
		await service.resend(r.id, r.receipt, afterSeconds(NOW, 61));
		await service.verify(await token(r.id), afterSeconds(NOW, 62));
		// The cancelled verification letter is replaced by the confirmation letter.
		expect(
			await createOutboxRuntime(config(), { emailProvider: email }).emailWorker.dispatchNext(
				afterSeconds(NOW, 63)
			)
		).toBe('sent');
		const confirmation = email.messages[email.messages.length - 1];
		expect(confirmation.subject).toContain('Ihre Anmeldung');
		expect(confirmation.text).toContain('Ritzenbergstraße 3 • 01067 Dresden');
		expect(confirmation.text).toContain('+49 179 9474938');
		expect(confirmation.text).toContain('Kind Zulu');
		expect(confirmation.text).not.toContain('/probestunde/verify');
		expect(
			await createOutboxRuntime(config(), { emailProvider: email }).emailWorker.dispatchNext(
				afterSeconds(NOW, 63)
			)
		).toBe('empty');
		await seedAdmin();
		await service.create(data(), async () => lessons, afterSeconds(NOW, 64));
		email.failNext(new EmailProviderError('SYNTHETIC_REJECTION', false));
		expect(await runtime.emailWorker.dispatchNext(afterSeconds(NOW, 65))).toBe('dead');
		const admin = new IntakeAdmin(service);
		const dead = (await admin.emailQueue(actor))[0];
		expect(dead.status).toBe('dead');
		await admin.retryEmail(
			actor,
			String(dead.id),
			'synthetic-email-recovery',
			afterSeconds(NOW, 66)
		);
		expect(await runtime.emailWorker.dispatchNext(afterSeconds(NOW, 67))).toBe('sent');
		expect(await admin.emailQueue(actor)).toEqual([]);
	});
	it('confirmation is queued once per verified request and survives the verification cancel', async () => {
		const r = await service.create(data(), async () => lessons, NOW);
		const rows = async () =>
			(
				await db.all<{ kind: string; status: string; verification_version: number }>({
					sql: 'SELECT kind, status, verification_version FROM trial_intake_email_outbox WHERE request_id = ? ORDER BY kind',
					params: [r.id],
				})
			).results;
		expect(await rows()).toEqual([
			{ kind: 'verification', status: 'pending', verification_version: 1 },
		]);
		const t = await token(r.id);
		await service.verify(t, NOW);
		await service.verify(t, afterSeconds(NOW, 1));
		expect(await rows()).toEqual([
			{ kind: 'confirmation', status: 'pending', verification_version: 0 },
			{ kind: 'verification', status: 'cancelled', verification_version: 1 },
		]);
	});
	it('fresh empty D1 admin bootstrap reuses password/session/reset primitives; repeat is rejected without a second identity', async () => {
		const userId = crypto.randomUUID();
		const identity = {
			firstName: 'Synthetic',
			lastName: 'Operator',
			email: 'operator@example.test',
			confirmEmail: 'operator@example.test',
			password: 'Synthetic-Password-2026!',
		};
		await db.batch(
			await buildIntakeBootstrap({ identity, userId, requestId: 'bootstrap', now: NOW })
		);
		const runtime = createAuthRuntime(config());
		const session = await runtime.service.login({
			data: { email: identity.email, password: identity.password },
			requestSubject: 'synthetic',
		});
		expect(session.role).toBe('admin');
		await runtime.service.requestPasswordReset({
			email: identity.email,
			requestSubject: 'synthetic',
		});
		expect(
			(
				await db.first<{ n: number }>({
					sql: "SELECT COUNT(*) AS n FROM email_outbox WHERE template_or_category = 'auth.password_reset'",
				})
			)?.n
		).toBe(1);
		await expect(
			db.batch(
				await buildIntakeBootstrap({
					identity,
					userId: crypto.randomUUID(),
					requestId: 'repeat',
					now: NOW,
				})
			)
		).rejects.toThrow();
		expect((await db.first<{ n: number }>({ sql: 'SELECT COUNT(*) AS n FROM users' }))?.n).toBe(
			1
		);
		expect(
			(
				await db.first<{ n: number }>({
					sql: 'SELECT COUNT(*) AS n FROM family_number_allocations',
				})
			)?.n
		).toBe(0);
	});
});

import { DatabaseBoundary } from '$lib/server/db/database';
import { FoundationRepository } from '$lib/server/db/foundation-repository';
import { AuthRepository } from '$lib/server/auth/auth-repository';
import { AdminIdentityRepository } from '$lib/server/auth/admin-identity-repository';
import { AuthService, type AuthClock } from '$lib/server/auth/auth-service';
import { BcryptPasswordHasher } from '$lib/server/auth/password';
import { SessionService } from '$lib/server/auth/session';
import { FakeTurnstileVerifier } from '$lib/server/security/turnstile';
import { AuthRateLimiter } from '$lib/server/security/rate-limit';
import { requireAdmin } from '$lib/server/security/authorization';
import { AuthEmailDispatcher, FakeEmailProvider } from '$lib/server/email/auth-email';
import type { AuthRuntimeConfig } from '$lib/server/config/runtime';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const SECRET = 'synthetic-auth-secret-for-tests-only-'.repeat(2);
const PASSWORD = 'synthetic-password-123';

describe('stage 05 auth lifecycle in D1', () => {
	let context: TestD1Context;
	let repository: AuthRepository;
	let service: AuthService;
	let sessions: SessionService;
	let provider: FakeEmailProvider;
	let dispatcher: AuthEmailDispatcher;
	let currentTime = '2026-07-17T10:00:00.000Z';
	let revocableSessionToken = '';

	const clock: AuthClock = { now: () => currentTime };
	const config: AuthRuntimeConfig = {
		publicEnabled: true,
		emailProvider: 'fake',
		privacyNoticeVersion: 'synthetic-notice-v1',
		verificationTtlSeconds: 86_400,
		resetTtlSeconds: 3_600,
		emailChangeTtlSeconds: 86_400,
		sessionTtlSeconds: 604_800,
		resendCooldownSeconds: 60,
		rateLimitWindowSeconds: 60,
		rateLimitMaxAttempts: 100,
		passwordMinLength: 12,
		passwordMaxLength: 128,
		emailMaxAttempts: 3,
	};

	beforeAll(async () => {
		context = await createMigratedTestD1();
		const database = new DatabaseBoundary(context.db);
		repository = new AuthRepository(database);
		const passwordHasher = new BcryptPasswordHasher(12, 128, 4);
		const limiter = new AuthRateLimiter(
			new FoundationRepository(database),
			SECRET,
			config.rateLimitWindowSeconds,
			config.rateLimitMaxAttempts
		);
		sessions = new SessionService(repository, SECRET, config.sessionTtlSeconds);
		service = new AuthService(
			repository,
			passwordHasher,
			new FakeTurnstileVerifier(),
			limiter,
			sessions,
			SECRET,
			config,
			clock
		);
		provider = new FakeEmailProvider();
		dispatcher = new AuthEmailDispatcher(
			repository,
			provider,
			SECRET,
			{ portalPublicOrigin: 'https://portal.example.test' },
			() => currentTime
		);
	});

	afterAll(async () => {
		if (context) await context.dispose();
	});

	async function register(email: string, requestId: string) {
		return service.register({
			data: {
				email,
				password: PASSWORD,
				firstName: 'Synthetic',
				lastName: 'Parent',
				privacyAccepted: true,
				privacyNoticeVersion: 'synthetic-notice-v1',
				turnstileToken: 'synthetic-turnstile-pass',
			},
			requestSubject: `subject:${requestId}`,
			requestId,
		});
	}

	async function nextLink(
		path: '/auth/verify' | '/auth/reset',
		recipient: string
	): Promise<string> {
		const startingMessageCount = provider.messages.length;
		for (let attempt = 0; attempt < 12; attempt += 1) {
			await dispatcher.dispatchNext();
			const message = provider.messages
				.slice(startingMessageCount)
				.findLast((candidate) => candidate.to === recipient && candidate.text.includes(path));
			if (message) {
				const match = message.text.match(/https:\/\/portal\.example\.test\/[^\s]+/);
				if (!match) throw new Error('Synthetic email did not contain an absolute link.');
				return new URL(match[0]).searchParams.get('token') ?? '';
			}
		}
		throw new Error(`No synthetic ${path} email was dispatched.`);
	}

	it('registers atomically, stays enumeration-safe, hashes tokens and verifies once', async () => {
		await expect(
			service.register({
				data: {
					email: 'privacy-rejected@example.test',
					password: PASSWORD,
					firstName: 'Synthetic',
					lastName: 'Rejected',
					privacyAccepted: true,
					privacyNoticeVersion: 'stale-notice',
					turnstileToken: 'synthetic-turnstile-pass',
				},
				requestSubject: 'privacy-rejected',
				requestId: 'request_privacy_rejected',
			})
		).rejects.toMatchObject({ code: 'PRIVACY_VERSION_MISMATCH' });
		expect(
			await context.db
				.prepare("SELECT COUNT(*) AS count FROM users WHERE email_normalized = ?")
				.bind('privacy-rejected@example.test')
				.first<{ count: number }>()
		).toEqual({ count: 0 });

		expect(await register('Parent.One@Example.Test ', 'request_register_one')).toMatchObject({
			accepted: true,
			created: true,
		});
		expect(await register(' parent.one@example.test', 'request_register_duplicate')).toMatchObject({
			accepted: true,
			created: false,
		});
		expect(await register('parent.two@example.test', 'request_register_two')).toMatchObject({
			created: true,
		});

		const accountRows = await context.db
			.prepare(`SELECT id, email_normalized, password_hash, role
				FROM users WHERE email_normalized IN (?, ?) ORDER BY email_normalized`)
			.bind('parent.one@example.test', 'parent.two@example.test')
			.all<{ id: string; email_normalized: string; password_hash: string; role: string }>();
		expect(accountRows.results).toHaveLength(2);
		expect(accountRows.results.every((row) => row.role === 'parent')).toBe(true);
		expect(accountRows.results[0]?.password_hash).not.toBe(accountRows.results[1]?.password_hash);

		const acknowledgement = await context.db
			.prepare(`SELECT privacy_notice_version, evidence_hash, source_context
				FROM privacy_acknowledgements WHERE user_id = ?`)
			.bind(accountRows.results[0]?.id)
			.first<{
				privacy_notice_version: string;
				evidence_hash: string;
				source_context: string;
			}>();
		expect(acknowledgement).toMatchObject({
			privacy_notice_version: 'synthetic-notice-v1',
			source_context: 'public_registration_v1',
		});
		expect(acknowledgement?.evidence_hash).toMatch(/^[a-f0-9]{64}$/);

		const verificationToken = await nextLink('/auth/verify', 'Parent.One@Example.Test');
		expect(verificationToken.length).toBeGreaterThan(32);
		const persistedSecurityData = await context.db
			.prepare(`SELECT group_concat(token_hash || payload_json, '|') AS persisted
				FROM auth_tokens LEFT JOIN email_outbox ON email_outbox.source_id = auth_tokens.id`)
			.first<{ persisted: string }>();
		expect(persistedSecurityData?.persisted).not.toContain(verificationToken);

		expect(
			await service.verifyEmail({
				token: verificationToken,
				requestId: 'request_verify_one',
				requestSubject: 'verify-subject-one',
			})
		).toBe(true);
		expect(
			await service.verifyEmail({
				token: verificationToken,
				requestId: 'request_verify_replay',
				requestSubject: 'verify-subject-replay',
			})
		).toBe(false);

		const session = await service.login({
			data: { email: 'PARENT.ONE@example.test', password: PASSWORD },
			requestSubject: 'login-one',
		});
		const actor = await sessions.authenticate(session.sessionToken, currentTime);
		expect(actor).toMatchObject({ id: accountRows.results[0]?.id, role: 'parent' });
		expect(
			await service.logout({ actor: actor!, requestId: 'request_logout_one' })
		).toBe(true);
		expect(await sessions.authenticate(session.sessionToken, currentTime)).toBeNull();
	});

	it('rolls back token consumption when the transactional verification extension fails', async () => {
		await register('extension.rollback@example.test', 'request_extension_register');
		const token = await nextLink('/auth/verify', 'extension.rollback@example.test');
		const database = new DatabaseBoundary(context.db);
		const passwordHasher = new BcryptPasswordHasher(12, 128, 4);
		const limiter = new AuthRateLimiter(
			new FoundationRepository(database),
			SECRET,
			60,
			100
		);
		const failingService = new AuthService(
			repository,
			passwordHasher,
			new FakeTurnstileVerifier(),
			limiter,
			sessions,
			SECRET,
			config,
			clock,
			{
				async prepare(extensionContext) {
					return [
						{
							sql: `INSERT INTO auth_verification_commits
								(request_id, token_id, user_id, target_email_normalized, created_at)
								VALUES (?, ?, ?, ?, ?)`,
							params: [
								extensionContext.verificationRequestId,
								extensionContext.verificationTokenId,
								extensionContext.userId,
								extensionContext.targetEmailNormalized,
								extensionContext.now,
							],
						},
					];
				},
			}
		);

		await expect(
			failingService.verifyEmail({
				token,
				requestId: 'request_extension_failure',
				requestSubject: 'extension-failure',
			})
		).rejects.toThrow();
		const tokenAfterRollback = await context.db
			.prepare(`SELECT used_at FROM auth_tokens
				WHERE user_id = (SELECT id FROM users WHERE email_normalized = ?)
				ORDER BY created_at DESC LIMIT 1`)
			.bind('extension.rollback@example.test')
			.first<{ used_at: string | null }>();
		expect(tokenAfterRollback?.used_at).toBeNull();
		expect(
			await service.verifyEmail({
				token,
				requestId: 'request_extension_retry',
				requestSubject: 'extension-retry',
			})
		).toBe(true);
	});

	it('enforces resend cooldown and token expiry without changing the neutral response', async () => {
		await register('resend.cooldown@example.test', 'request_resend_register');
		await nextLink('/auth/verify', 'resend.cooldown@example.test');
		const tokenCount = async () =>
			(
				await context.db
					.prepare(`SELECT COUNT(*) AS count FROM auth_tokens
						WHERE user_id = (SELECT id FROM users WHERE email_normalized = ?)
							AND kind = 'email_verification'`)
					.bind('resend.cooldown@example.test')
					.first<{ count: number }>()
			)?.count;

		expect(
			await service.resendVerification({
				email: 'resend.cooldown@example.test',
				requestSubject: 'resend-within-cooldown',
			})
		).toEqual({ accepted: true });
		expect(await tokenCount()).toBe(1);

		currentTime = '2026-07-17T10:01:01.000Z';
		expect(
			await service.resendVerification({
				email: 'resend.cooldown@example.test',
				requestSubject: 'resend-after-cooldown',
			})
		).toEqual({ accepted: true });
		expect(await tokenCount()).toBe(2);
		const freshToken = await nextLink('/auth/verify', 'resend.cooldown@example.test');
		currentTime = '2026-07-19T10:01:02.000Z';
		expect(
			await service.verifyEmail({
				token: freshToken,
				requestId: 'request_expired_verification',
				requestSubject: 'expired-verification',
			})
		).toBe(false);
		currentTime = '2026-07-17T10:05:00.000Z';
	});

	it('resets a password once and revokes every prior session', async () => {
		await register('password.reset@example.test', 'request_password_register');
		const verificationToken = await nextLink('/auth/verify', 'password.reset@example.test');
		await service.verifyEmail({
			token: verificationToken,
			requestId: 'request_password_verify',
			requestSubject: 'password-verify',
		});
		const oldSession = await service.login({
			data: { email: 'password.reset@example.test', password: PASSWORD },
			requestSubject: 'password-login',
		});

		expect(
			await service.requestPasswordReset({
				email: 'missing.account@example.test',
				requestSubject: 'password-missing',
			})
		).toEqual({ accepted: true });
		await service.requestPasswordReset({
			email: 'password.reset@example.test',
			requestSubject: 'password-existing',
		});
		const resetToken = await nextLink('/auth/reset', 'password.reset@example.test');
		const newPassword = 'synthetic-new-password-456';
		expect(
			await service.resetPassword({
				token: resetToken,
				password: newPassword,
				requestId: 'request_password_reset',
				requestSubject: 'password-reset-consume',
			})
		).toBe(true);
		expect(
			await service.resetPassword({
				token: resetToken,
				password: newPassword,
				requestId: 'request_password_reset_replay',
				requestSubject: 'password-reset-replay',
			})
		).toBe(false);
		expect(await sessions.authenticate(oldSession.sessionToken, currentTime)).toBeNull();
		await expect(
			service.login({
				data: { email: 'password.reset@example.test', password: PASSWORD },
				requestSubject: 'password-old-login',
			})
		).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
		const newSession = await service.login({
			data: { email: 'password.reset@example.test', password: newPassword },
			requestSubject: 'password-new-login',
		});
		expect(newSession).toMatchObject({ sessionId: expect.any(String) });
		revocableSessionToken = newSession.sessionToken;
	});

	it('rate-limits auth attempts and keeps role/block operations behind a current admin actor', async () => {
		const database = new DatabaseBoundary(context.db);
		const limitedService = new AuthService(
			repository,
			new BcryptPasswordHasher(12, 128, 4),
			new FakeTurnstileVerifier(),
			new AuthRateLimiter(new FoundationRepository(database), SECRET, 60, 2),
			sessions,
			SECRET,
			config,
			clock
		);
		for (let attempt = 0; attempt < 2; attempt += 1) {
			await expect(
				limitedService.login({
					data: { email: 'missing.rate-limit@example.test', password: PASSWORD },
					requestSubject: 'shared-rate-limit-subject',
				})
			).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
		}
		await expect(
			limitedService.login({
				data: { email: 'missing.rate-limit@example.test', password: PASSWORD },
				requestSubject: 'shared-rate-limit-subject',
			})
		).rejects.toMatchObject({ code: 'RATE_LIMITED' });

		// Synthetic fixture setup represents a separately authorized out-of-band bootstrap.
		await context.db
			.prepare(`UPDATE users SET role = 'admin', session_version = session_version + 1
				WHERE email_normalized = 'extension.rollback@example.test'`)
			.run();
		const bootstrapSession = await service.login({
			data: { email: 'extension.rollback@example.test', password: PASSWORD },
			requestSubject: 'synthetic-admin-login',
		});
		const adminActor = requireAdmin(
			(await sessions.authenticate(bootstrapSession.sessionToken, currentTime)) ?? undefined
		);
		const parentActor = (await sessions.authenticate(revocableSessionToken, currentTime))!;
		const adminIdentity = new AdminIdentityRepository(database);
		expect(
			await adminIdentity.assignAdmin({
				actor: parentActor as never,
				targetUserId: parentActor.id,
				reason: 'synthetic unauthorized attempt',
				requestId: 'request_unauthorized_role',
				now: currentTime,
			})
		).toBe(false);
		expect(
			await adminIdentity.assignAdmin({
				actor: adminActor,
				targetUserId: parentActor.id,
				reason: 'synthetic authorized assignment',
				requestId: 'request_authorized_role',
				now: currentTime,
			})
		).toBe(true);
		expect(await sessions.authenticate(revocableSessionToken, currentTime)).toBeNull();
		expect(
			await adminIdentity.assignAdmin({
				actor: adminActor,
				targetUserId: parentActor.id,
				reason: 'synthetic authorized assignment replay',
				requestId: 'request_authorized_role',
				now: currentTime,
			})
		).toBe(false);

		const blockTargetSession = await service.login({
			data: { email: 'parent.one@example.test', password: PASSWORD },
			requestSubject: 'block-target-login',
		});
		const blockTarget = (await sessions.authenticate(blockTargetSession.sessionToken, currentTime))!;
		expect(
			await adminIdentity.setBlocked({
				actor: adminActor,
				targetUserId: blockTarget.id,
				blocked: true,
				reason: 'synthetic block',
				requestId: 'request_block_target',
				now: currentTime,
			})
		).toBe(true);
		expect(await sessions.authenticate(blockTargetSession.sessionToken, currentTime)).toBeNull();
		currentTime = '2026-07-17T10:05:01.000Z';
		expect(
			await adminIdentity.setBlocked({
				actor: adminActor,
				targetUserId: blockTarget.id,
				blocked: false,
				reason: 'synthetic unblock',
				requestId: 'request_unblock_target',
				now: currentTime,
			})
		).toBe(true);
		expect(await sessions.authenticate(blockTargetSession.sessionToken, currentTime)).toBeNull();
	});

	it('versions pending email changes, rejects stale tokens and releases expired reservations', async () => {
		await register('email.change@example.test', 'request_email_change_register');
		const verificationToken = await nextLink('/auth/verify', 'email.change@example.test');
		await service.verifyEmail({
			token: verificationToken,
			requestId: 'request_email_change_verify',
			requestSubject: 'email-change-verify',
		});
		const session = await service.login({
			data: { email: 'email.change@example.test', password: PASSWORD },
			requestSubject: 'email-change-login',
		});
		const actor = (await sessions.authenticate(session.sessionToken, currentTime))!;

		expect(
			await service.requestEmailChange({ actor, email: 'reserved.target@example.test' })
		).toBe(true);
		const staleToken = await nextLink('/auth/verify', 'reserved.target@example.test');
		expect(await register('RESERVED.TARGET@example.test', 'request_reserved_register')).toMatchObject({
			created: false,
		});
		expect(
			await service.requestEmailChange({ actor, email: 'newer.target@example.test' })
		).toBe(true);
		const newerToken = await nextLink('/auth/verify', 'newer.target@example.test');
		expect(
			await service.verifyEmail({
				token: staleToken,
				requestId: 'request_stale_email_token',
				requestSubject: 'stale-email-token',
			})
		).toBe(false);
		expect(
			await service.verifyEmail({
				token: newerToken,
				requestId: 'request_new_email_token',
				requestSubject: 'new-email-token',
			})
		).toBe(true);
		expect(await sessions.authenticate(session.sessionToken, currentTime)).toBeNull();

		const changedSession = await service.login({
			data: { email: 'newer.target@example.test', password: PASSWORD },
			requestSubject: 'changed-email-login',
		});
		const changedActor = (await sessions.authenticate(changedSession.sessionToken, currentTime))!;
		expect(
			await service.requestEmailChange({ actor: changedActor, email: 'expires@example.test' })
		).toBe(true);
		const expiredToken = await nextLink('/auth/verify', 'expires@example.test');
		currentTime = '2026-07-19T10:00:00.000Z';
		expect(await register('expires@example.test', 'request_expired_reservation_register')).toMatchObject({
			created: true,
		});
		expect(
			await service.verifyEmail({
				token: expiredToken,
				requestId: 'request_expired_email_token',
				requestSubject: 'expired-email-token',
			})
		).toBe(false);
	});
});

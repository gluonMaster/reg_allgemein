import type { AuthRuntimeConfig } from '$lib/server/config/runtime';
import { translate } from '$lib/i18n';
import type { TurnstileVerifier } from '$lib/server/security/turnstile';
import type { AuthRateLimiter } from '$lib/server/security/rate-limit';
import type { PasswordHasher } from './password';
import type {
	AuthRepository,
	PostVerificationExtension,
} from './auth-repository';
import { noPostVerificationExtension } from './auth-repository';
import type { CreatedSession, AuthenticatedUser, SessionService } from './session';
import {
	deriveOpaqueAuthToken,
	hashAuthToken,
	privacyAcknowledgementEvidence,
} from './tokens';
import { cleanDisplayText, normalizeEmail, normalizePersonName } from './normalization';
import type { LoginInput, RegisterInput } from './contracts';

export class AuthFlowError extends Error {
	readonly code:
		| 'AUTH_PUBLIC_DISABLED'
		| 'AUTH_SECRET_UNAVAILABLE'
		| 'TURNSTILE_REJECTED'
		| 'PRIVACY_VERSION_MISMATCH'
		| 'INVALID_CREDENTIALS';

	constructor(
		code:
			| 'AUTH_PUBLIC_DISABLED'
			| 'AUTH_SECRET_UNAVAILABLE'
			| 'TURNSTILE_REJECTED'
			| 'PRIVACY_VERSION_MISMATCH'
			| 'INVALID_CREDENTIALS'
	) {
		super('Authentication flow was rejected.');
		this.name = 'AuthFlowError';
		this.code = code;
	}
}

export interface AuthClock {
	now(): string;
}

const systemClock: AuthClock = {
	now: () => new Date().toISOString(),
};

function addSeconds(instant: string, seconds: number): string {
	return new Date(Date.parse(instant) + seconds * 1000).toISOString();
}

export class AuthService {
	constructor(
		private readonly repository: AuthRepository,
		private readonly passwordHasher: PasswordHasher,
		private readonly turnstile: TurnstileVerifier,
		private readonly rateLimiter: AuthRateLimiter,
		private readonly sessions: SessionService,
		private readonly secret: string,
		private readonly config: AuthRuntimeConfig,
		private readonly clock: AuthClock = systemClock,
		private readonly verificationExtension: PostVerificationExtension =
			noPostVerificationExtension
	) {}

	private assertPublicEnabled(): void {
		if (!this.secret) throw new AuthFlowError('AUTH_SECRET_UNAVAILABLE');
		if (!this.config.publicEnabled) throw new AuthFlowError('AUTH_PUBLIC_DISABLED');
	}

	async register(input: {
		data: RegisterInput;
		requestSubject: string;
		remoteIp?: string;
		requestId: string;
	}): Promise<{ accepted: true; created: boolean }> {
		this.assertPublicEnabled();
		const now = this.clock.now();
		const emailNormalized = normalizeEmail(input.data.email);
		await this.rateLimiter.consume('register', `${input.requestSubject}|${emailNormalized}`, now);

		if (input.data.privacyNoticeVersion !== this.config.privacyNoticeVersion) {
			throw new AuthFlowError('PRIVACY_VERSION_MISMATCH');
		}
		if (!(await this.turnstile.verify({ token: input.data.turnstileToken, remoteIp: input.remoteIp }))) {
			throw new AuthFlowError('TURNSTILE_REJECTED');
		}

		// Hashing intentionally happens before identity availability is known.
		const passwordHash = await this.passwordHasher.hash(input.data.password);
		const userId = crypto.randomUUID();
		const tokenId = crypto.randomUUID();
		const rawToken = await deriveOpaqueAuthToken({
			secret: this.secret,
			tokenId,
			kind: 'email_verification',
		});
		const tokenHash = await hashAuthToken('email_verification', rawToken);
		const sourceContext = 'public_registration_v1';
		const privacyEvidenceHash = await privacyAcknowledgementEvidence({
			privacyNoticeVersion: input.data.privacyNoticeVersion,
			acceptanceText: translate('de', 'auth.privacyAcceptance'),
			sourceContext,
		});
		const requestedSubjectHash = await this.rateLimiter.subjectHash(
			'registration',
			input.requestSubject
		);
		const created = await this.repository.register({
			userId,
			acknowledgementId: crypto.randomUUID(),
			tokenId,
			outboxId: crypto.randomUUID(),
			auditId: crypto.randomUUID(),
			email: input.data.email.trim(),
			emailNormalized,
			passwordHash,
			firstName: cleanDisplayText(input.data.firstName),
			lastName: cleanDisplayText(input.data.lastName),
			firstNameNormalized: normalizePersonName(input.data.firstName),
			lastNameNormalized: normalizePersonName(input.data.lastName),
			privacyNoticeVersion: input.data.privacyNoticeVersion,
			privacyEvidenceHash,
			privacySourceContext: sourceContext,
			tokenHash,
			tokenExpiresAt: addSeconds(now, this.config.verificationTtlSeconds),
			requestedSubjectHash,
			requestId: input.requestId,
			now,
			emailMaxAttempts: this.config.emailMaxAttempts,
		});
		return { accepted: true, created };
	}

	async resendVerification(input: {
		email: string;
		requestSubject: string;
	}): Promise<{ accepted: true }> {
		this.assertPublicEnabled();
		const now = this.clock.now();
		const emailNormalized = normalizeEmail(input.email);
		await this.rateLimiter.consume('resend', `${input.requestSubject}|${emailNormalized}`, now);
		const tokenId = crypto.randomUUID();
		const rawToken = await deriveOpaqueAuthToken({
			secret: this.secret,
			tokenId,
			kind: 'email_verification',
		});
		await this.repository.enqueueVerification({
			tokenId,
			tokenHash: await hashAuthToken('email_verification', rawToken),
			outboxId: crypto.randomUUID(),
			emailNormalized,
			expiresAt: addSeconds(now, this.config.verificationTtlSeconds),
			cooldownAfter: new Date(
				Date.parse(now) - this.config.resendCooldownSeconds * 1000
			).toISOString(),
			requestedSubjectHash: await this.rateLimiter.subjectHash(
				'verification-resend',
				input.requestSubject
			),
			now,
			emailMaxAttempts: this.config.emailMaxAttempts,
		});
		return { accepted: true };
	}

	async verifyEmail(input: {
		token: string;
		requestId: string;
		requestSubject: string;
	}): Promise<boolean> {
		this.assertPublicEnabled();
		const now = this.clock.now();
		await this.rateLimiter.consume('verify', input.requestSubject, now);
		const context = await this.repository.findEmailToken(
			await hashAuthToken('email_verification', input.token),
			now
		);
		if (!context || context.is_blocked === 1 || context.account_status !== 'active') return false;

		if (
			context.pending_email_normalized === context.target_email_normalized &&
			context.pending_email_expires_at !== null &&
			context.pending_email_expires_at > now
		) {
			return this.repository.confirmPendingEmail({
				context,
				requestId: input.requestId,
				auditId: crypto.randomUUID(),
				now,
			});
		}

		if (
			context.email_verified_at === null &&
			context.current_email_normalized === context.target_email_normalized
		) {
			return this.repository.verifyCurrentEmail({
				context,
				verificationRequestId: input.requestId,
				auditId: crypto.randomUUID(),
				welcomeOutboxId: crypto.randomUUID(),
				now,
				emailMaxAttempts: this.config.emailMaxAttempts,
				extension: this.verificationExtension,
			});
		}

		return false;
	}

	async login(input: {
		data: LoginInput;
		requestSubject: string;
	}): Promise<CreatedSession & { role: AuthenticatedUser['role'] }> {
		this.assertPublicEnabled();
		const now = this.clock.now();
		const emailNormalized = normalizeEmail(input.data.email);
		await this.rateLimiter.consume('login', `${input.requestSubject}|${emailNormalized}`, now);
		const user = await this.repository.findLoginUser(emailNormalized);
		if (!user) {
			await this.passwordHasher.verifyAgainstDummy(input.data.password);
			throw new AuthFlowError('INVALID_CREDENTIALS');
		}
		const passwordValid = await this.passwordHasher.verify(input.data.password, user.password_hash);
		if (
			!passwordValid ||
			user.email_verified_at === null ||
			user.is_blocked === 1 ||
			user.account_status !== 'active'
		) {
			throw new AuthFlowError('INVALID_CREDENTIALS');
		}
		const session = await this.sessions.create({
			userId: user.id,
			sessionVersion: user.session_version,
			now,
		});
		if (!session) throw new AuthFlowError('INVALID_CREDENTIALS');
		return { ...session, role: user.role };
	}

	async requestPasswordReset(input: {
		email: string;
		requestSubject: string;
	}): Promise<{ accepted: true }> {
		this.assertPublicEnabled();
		const now = this.clock.now();
		const emailNormalized = normalizeEmail(input.email);
		await this.rateLimiter.consume('forgot', `${input.requestSubject}|${emailNormalized}`, now);
		const tokenId = crypto.randomUUID();
		const rawToken = await deriveOpaqueAuthToken({
			secret: this.secret,
			tokenId,
			kind: 'password_reset',
		});
		await this.repository.enqueuePasswordReset({
			tokenId,
			tokenHash: await hashAuthToken('password_reset', rawToken),
			outboxId: crypto.randomUUID(),
			emailNormalized,
			expiresAt: addSeconds(now, this.config.resetTtlSeconds),
			requestedSubjectHash: await this.rateLimiter.subjectHash(
				'password-reset',
				input.requestSubject
			),
			now,
			emailMaxAttempts: this.config.emailMaxAttempts,
		});
		return { accepted: true };
	}

	async resetPassword(input: {
		token: string;
		password: string;
		requestId: string;
		requestSubject: string;
	}): Promise<boolean> {
		this.assertPublicEnabled();
		const now = this.clock.now();
		await this.rateLimiter.consume('reset', input.requestSubject, now);
		const passwordHash = await this.passwordHasher.hash(input.password);
		return this.repository.consumePasswordReset({
			tokenHash: await hashAuthToken('password_reset', input.token),
			passwordHash,
			requestId: input.requestId,
			auditId: crypto.randomUUID(),
			outboxId: crypto.randomUUID(),
			now,
			emailMaxAttempts: this.config.emailMaxAttempts,
		});
	}

	async requestEmailChange(input: {
		actor: AuthenticatedUser | NonNullable<App.Locals['user']>;
		email: string;
	}): Promise<boolean> {
		this.assertPublicEnabled();
		const now = this.clock.now();
		const pendingEmailNormalized = normalizeEmail(input.email);
		await this.rateLimiter.consume('email-change', input.actor.id, now);
		const user = await this.repository.getUserEmailVersion(input.actor.id);
		if (!user) return false;
		const tokenId = crypto.randomUUID();
		const rawToken = await deriveOpaqueAuthToken({
			secret: this.secret,
			tokenId,
			kind: 'email_verification',
		});
		return this.repository.requestEmailChange({
			userId: input.actor.id,
			expectedEmailVersion: user.email_version,
			pendingEmail: input.email.trim(),
			pendingEmailNormalized,
			pendingExpiresAt: addSeconds(now, this.config.emailChangeTtlSeconds),
			tokenId,
			tokenHash: await hashAuthToken('email_verification', rawToken),
			outboxId: crypto.randomUUID(),
			requestedSubjectHash: await this.rateLimiter.subjectHash(
				'email-change',
				input.actor.id
			),
			now,
			emailMaxAttempts: this.config.emailMaxAttempts,
		});
	}

	logout(input: {
		actor: AuthenticatedUser | NonNullable<App.Locals['user']>;
		requestId: string;
	}): Promise<boolean> {
		return this.repository.revokeSession({
			sessionId: input.actor.sessionId,
			userId: input.actor.id,
			reason: 'logout',
			requestId: input.requestId,
			auditId: crypto.randomUUID(),
			now: this.clock.now(),
		});
	}

	revokeAllSessions(input: {
		actor: AuthenticatedUser | NonNullable<App.Locals['user']>;
		requestId: string;
	}): Promise<number> {
		return this.repository.revokeAllSessions({
			userId: input.actor.id,
			reason: 'user_requested',
			requestId: input.requestId,
			auditId: crypto.randomUUID(),
			now: this.clock.now(),
		});
	}

	cleanupExpiredEmailReservations(limit = 100): Promise<number> {
		if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
			throw new TypeError('AUTH_MAINTENANCE_LIMIT_INVALID');
		}
		return this.repository.cleanupExpiredEmailReservations(this.clock.now(), limit);
	}
}

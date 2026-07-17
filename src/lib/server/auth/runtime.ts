import type { RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { FoundationRepository } from '$lib/server/db/foundation-repository';
import { AuthRateLimiter } from '$lib/server/security/rate-limit';
import {
	CloudflareTurnstileVerifier,
	DenyTurnstileVerifier,
	FakeTurnstileVerifier,
} from '$lib/server/security/turnstile';
import { AuthFlowError, AuthService, type AuthClock } from './auth-service';
import {
	AuthRepository,
	noPostVerificationExtension,
	type PostVerificationExtension,
} from './auth-repository';
import { BcryptPasswordHasher, type PasswordHasher } from './password';
import { SessionService } from './session';

export interface AuthRuntime {
	repository: AuthRepository;
	sessions: SessionService;
	service: AuthService;
}

export function createAuthRuntime(
	config: RuntimeConfig,
	overrides: {
		clock?: AuthClock;
		passwordHasher?: PasswordHasher;
		verificationExtension?: PostVerificationExtension;
	} = {}
): AuthRuntime {
	if (!config.jwtSecret) throw new AuthFlowError('AUTH_SECRET_UNAVAILABLE');
	const database = new DatabaseBoundary(config.db);
	const repository = new AuthRepository(database);
	const foundation = new FoundationRepository(database);
	const rateLimiter = new AuthRateLimiter(
		foundation,
		config.jwtSecret,
		config.auth.rateLimitWindowSeconds,
		config.auth.rateLimitMaxAttempts
	);
	const sessions = new SessionService(
		repository,
		config.jwtSecret,
		config.auth.sessionTtlSeconds
	);
	const turnstile =
		config.appEnvironment === 'test'
			? new FakeTurnstileVerifier()
			: config.turnstileSecretKey
				? new CloudflareTurnstileVerifier(config.turnstileSecretKey)
				: new DenyTurnstileVerifier();
	const passwordHasher =
		overrides.passwordHasher ??
		new BcryptPasswordHasher(
			config.auth.passwordMinLength,
			config.auth.passwordMaxLength
		);
	const service = new AuthService(
		repository,
		passwordHasher,
		turnstile,
		rateLimiter,
		sessions,
		config.jwtSecret,
		config.auth,
		overrides.clock,
		overrides.verificationExtension ?? noPostVerificationExtension
	);
	return { repository, sessions, service };
}

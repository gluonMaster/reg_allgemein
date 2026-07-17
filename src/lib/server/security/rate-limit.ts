import type { FoundationRepository } from '$lib/server/db/foundation-repository';
import { hmacSha256Hex } from '$lib/server/auth/tokens';

export class RateLimitExceededError extends Error {
	readonly code = 'RATE_LIMITED';

	constructor() {
		super('Rate limit exceeded.');
		this.name = 'RateLimitExceededError';
	}
}

export class AuthRateLimiter {
	constructor(
		private readonly repository: FoundationRepository,
		private readonly secret: string,
		private readonly windowSeconds: number,
		private readonly limit: number
	) {}

	async consume(scope: string, rawSubject: string, now: string): Promise<void> {
		const nowMilliseconds = Date.parse(now);
		const windowMilliseconds = this.windowSeconds * 1000;
		const windowStartMilliseconds =
			Math.floor(nowMilliseconds / windowMilliseconds) * windowMilliseconds;
		const windowStart = new Date(windowStartMilliseconds).toISOString();
		const expiresAt = new Date(windowStartMilliseconds + windowMilliseconds * 2).toISOString();
		const subjectHash = await hmacSha256Hex(
			this.secret,
			`auth-rate-limit:${scope}:v1`,
			rawSubject
		);
		const result = await this.repository.consumeRateLimit({
			scope: `auth:${scope}`,
			subjectHash,
			windowStart,
			expiresAt,
			now,
			limit: this.limit,
		});
		if (!result.allowed) throw new RateLimitExceededError();
	}

	subjectHash(scope: string, rawSubject: string): Promise<string> {
		return hmacSha256Hex(this.secret, `auth-subject:${scope}:v1`, rawSubject);
	}
}

import type { AuthRuntimeConfig } from '$lib/server/config/runtime';
import type { AuthRateLimiter } from '$lib/server/security/rate-limit';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import { deriveOpaqueAuthToken, hashAuthToken } from '$lib/server/auth/tokens';
import { FamilyRepository } from './family-repository';

export interface FamilyClock {
	now(): string;
}

const systemClock: FamilyClock = {
	now: () => new Date().toISOString(),
};

function addSeconds(instant: string, seconds: number): string {
	return new Date(Date.parse(instant) + seconds * 1000).toISOString();
}

export class FamilyService {
	constructor(
		private readonly repository: FamilyRepository,
		private readonly rateLimiter: AuthRateLimiter,
		private readonly secret: string,
		private readonly config: AuthRuntimeConfig,
		private readonly clock: FamilyClock = systemClock
	) {}

	async requestLegacyClaimProof(input: {
		actor: AuthenticatedUser | NonNullable<App.Locals['user']>;
		requestSubject: string;
	}): Promise<boolean> {
		const now = this.clock.now();
		await this.rateLimiter.consume('legacy-claim-request', input.actor.id, now);
		const candidate = await this.repository.findClaimCandidate(input.actor.id);
		if (!candidate) return false;
		const tokenId = crypto.randomUUID();
		const rawToken = await deriveOpaqueAuthToken({
			secret: this.secret,
			tokenId,
			kind: 'legacy_email_claim',
		});
		return this.repository.enqueueClaimProof({
			candidate,
			tokenId,
			tokenHash: await hashAuthToken('legacy_email_claim', rawToken),
			outboxId: crypto.randomUUID(),
			expiresAt: addSeconds(now, this.config.verificationTtlSeconds),
			cooldownAfter: new Date(
				Date.parse(now) - this.config.resendCooldownSeconds * 1000
			).toISOString(),
			requestedSubjectHash: await this.rateLimiter.subjectHash(
				'legacy-claim-request',
				input.requestSubject
			),
			now,
			emailMaxAttempts: this.config.emailMaxAttempts,
		});
	}

	async confirmLegacyClaim(input: {
		actor: AuthenticatedUser | NonNullable<App.Locals['user']>;
		token: string;
		requestId: string;
		requestSubject: string;
	}): Promise<boolean> {
		const now = this.clock.now();
		await this.rateLimiter.consume('legacy-claim-confirm', input.actor.id, now);
		const context = await this.repository.findClaimToken(
			await hashAuthToken('legacy_email_claim', input.token)
		);
		if (!context || context.user_id !== input.actor.id) return false;
		if (context.used_at !== null) {
			return this.repository.claimAlreadyApplied(context.token_id, input.actor.id);
		}
		if (context.expires_at <= now) return false;

		try {
			return await this.repository.confirmClaim({
				context,
				userId: input.actor.id,
				requestId: input.requestId,
				reassignmentId: crypto.randomUUID(),
				claimId: crypto.randomUUID(),
				auditId: crypto.randomUUID(),
				assertionId: crypto.randomUUID(),
				emailMaxAttempts: this.config.emailMaxAttempts,
				now,
			});
		} catch {
			if (await this.repository.claimAlreadyApplied(context.token_id, input.actor.id)) {
				return true;
			}
			await this.repository.recordClaimConflict({ context, now });
			return false;
		}
	}
}

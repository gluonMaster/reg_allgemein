import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { FoundationRepository } from '$lib/server/db/foundation-repository';
import { AuthRateLimiter } from '$lib/server/security/rate-limit';
import { FamilyRepository } from './family-repository';
import { FamilyService, type FamilyClock } from './family-service';

export function createFamilyRuntime(
	config: RuntimeConfig,
	overrides: { clock?: FamilyClock } = {}
): { repository: FamilyRepository; service: FamilyService } {
	if (!config.jwtSecret) throw new Error('Family runtime secret unavailable.');
	const database = new DatabaseBoundary(config.db);
	const repository = new FamilyRepository(database);
	const limiter = new AuthRateLimiter(
		new FoundationRepository(database),
		config.jwtSecret,
		config.auth.rateLimitWindowSeconds,
		config.auth.rateLimitMaxAttempts
	);
	return {
		repository,
		service: new FamilyService(
			repository,
			limiter,
			config.jwtSecret,
			config.auth,
			overrides.clock
		),
	};
}

export function requestFamilyRuntime(event: RequestEvent) {
	return createFamilyRuntime(loadRuntimeConfig(event.platform?.env));
}

import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { PrivacyRepository } from './privacy-repository';
import { PrivacyService } from './privacy-service';
import { privacyArtifactStore } from './storage';

export function createPrivacyRuntime(config: RuntimeConfig) {
	const repository = new PrivacyRepository(new DatabaseBoundary(config.db));
	return {
		repository,
		service: new PrivacyService(
			repository,
			privacyArtifactStore(config.r2Bucket),
			config.privacy
		),
	};
}

export function requestPrivacyRuntime(event: RequestEvent) {
	return createPrivacyRuntime(loadRuntimeConfig(event.platform?.env));
}

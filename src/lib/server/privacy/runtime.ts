import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { PrivacyRepository } from './privacy-repository';
import { PrivacyService } from './privacy-service';
import { privacyArtifactStore } from './storage';
import { StorageIntentRepository } from '$lib/server/operations/storage-intents';

export function createPrivacyRuntime(config: RuntimeConfig) {
	const repository = new PrivacyRepository(new DatabaseBoundary(config.db));
	const storageIntents = new StorageIntentRepository(new DatabaseBoundary(config.db));
	return {
		repository,
		service: new PrivacyService(
			repository,
			privacyArtifactStore(config.r2ArchiveBucket),
			config.privacy,
			undefined,
			privacyArtifactStore(config.r2QuarantineBucket),
			storageIntents
		),
	};
}

export function requestPrivacyRuntime(event: RequestEvent) {
	return createPrivacyRuntime(loadRuntimeConfig(event.platform?.env));
}

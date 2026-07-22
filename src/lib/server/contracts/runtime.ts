import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { ContractRepository } from './contract-repository';
import { ContractService } from './contract-service';
import { contractArtifactStore } from './storage';
import { StorageIntentRepository } from '$lib/server/operations/storage-intents';

export function createContractRuntime(config: RuntimeConfig) {
	const database = new DatabaseBoundary(config.db);
	const repository = new ContractRepository(database);
	return {
		repository,
		service: new ContractService(
			repository,
			contractArtifactStore(config.r2ArchiveBucket),
			config,
			undefined,
			undefined,
			new StorageIntentRepository(database)
		),
	};
}

export function requestContractRuntime(event: RequestEvent) {
	return createContractRuntime(loadRuntimeConfig(event.platform?.env));
}

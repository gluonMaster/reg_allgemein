import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { ContractRepository } from './contract-repository';
import { ContractService } from './contract-service';
import { contractArtifactStore } from './storage';

export function createContractRuntime(config: RuntimeConfig) {
	const database = new DatabaseBoundary(config.db);
	const repository = new ContractRepository(database);
	return {
		repository,
		service: new ContractService(repository, contractArtifactStore(config.r2Bucket), config),
	};
}

export function requestContractRuntime(event: RequestEvent) {
	return createContractRuntime(loadRuntimeConfig(event.platform?.env));
}

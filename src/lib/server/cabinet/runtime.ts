import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { CabinetPricingService } from '$lib/server/pricing/cabinet-pricing';
import { CabinetRepository } from './cabinet-repository';
import { CabinetService } from './cabinet-service';

export function createCabinetRuntime(config: RuntimeConfig) {
	const repository = new CabinetRepository(new DatabaseBoundary(config.db));
	return {
		repository,
		service: new CabinetService(repository, new CabinetPricingService(config.pricing)),
	};
}

export function requestCabinetRuntime(event: RequestEvent) {
	return createCabinetRuntime(loadRuntimeConfig(event.platform?.env));
}

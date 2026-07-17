import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { CabinetPricingService } from '$lib/server/pricing/cabinet-pricing';
import { CabinetRepository } from './cabinet-repository';
import { CabinetService } from './cabinet-service';
import { CatalogRepository } from '$lib/server/catalog/catalog-repository';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import { TrialRepository } from '$lib/server/trials/trial-repository';
import { TrialService } from '$lib/server/trials/trial-service';

export function createCabinetRuntime(config: RuntimeConfig) {
	const database = new DatabaseBoundary(config.db);
	const repository = new CabinetRepository(database);
	const trialRepository = new TrialRepository(database);
	const trialService = new TrialService(
		trialRepository,
		new CatalogRepository(database),
		new OccupancyRepository(database)
	);
	return {
		repository,
		service: new CabinetService(repository, new CabinetPricingService(config.pricing), [trialService]),
	};
}

export function requestCabinetRuntime(event: RequestEvent) {
	return createCabinetRuntime(loadRuntimeConfig(event.platform?.env));
}

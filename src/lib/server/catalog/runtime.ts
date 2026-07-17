import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import { PricingRepository } from '$lib/server/pricing/pricing-repository';
import { PricingService } from '$lib/server/pricing/pricing-service';
import { CatalogRepository } from './catalog-repository';
import { CatalogService } from './catalog-service';

export function createCatalogRuntime(config: RuntimeConfig) {
	const database = new DatabaseBoundary(config.db);
	const repository = new CatalogRepository(database);
	const occupancy = new OccupancyRepository(database);
	const pricing = new PricingService(new PricingRepository(database), occupancy, config.pricing);
	return { repository, service: new CatalogService(repository, occupancy, pricing) };
}

export function requestCatalogRuntime(event: RequestEvent) {
	return createCatalogRuntime(loadRuntimeConfig(event.platform?.env));
}

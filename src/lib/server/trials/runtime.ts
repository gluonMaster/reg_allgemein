import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { CatalogRepository } from '$lib/server/catalog/catalog-repository';
import { DatabaseBoundary } from '$lib/server/db/database';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import { TrialRepository } from './trial-repository';
import { TrialService } from './trial-service';

export function createTrialRuntime(config: RuntimeConfig) {
	const database = new DatabaseBoundary(config.db);
	const repository = new TrialRepository(database);
	return {
		repository,
		service: new TrialService(
			repository,
			new CatalogRepository(database),
			new OccupancyRepository(database)
		),
	};
}

export function requestTrialRuntime(event: RequestEvent) {
	return createTrialRuntime(loadRuntimeConfig(event.platform?.env));
}

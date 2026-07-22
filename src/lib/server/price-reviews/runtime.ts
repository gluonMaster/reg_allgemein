import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import { PricingRepository } from '$lib/server/pricing/pricing-repository';
import { PricingService } from '$lib/server/pricing/pricing-service';
import { PriceReviewRepository } from './price-review-repository';
import { PriceReviewService } from './price-review-service';

export function createPriceReviewRuntime(config: RuntimeConfig) {
	const database = new DatabaseBoundary(config.db);
	const occupancy = new OccupancyRepository(database);
	const pricing = new PricingService(new PricingRepository(database), occupancy, config.pricing);
	const repository = new PriceReviewRepository(database);
	return {
		repository,
		service: new PriceReviewService(repository, pricing, occupancy, config),
	};
}

export function requestPriceReviewRuntime(event: RequestEvent) {
	return createPriceReviewRuntime(loadRuntimeConfig(event.platform?.env));
}


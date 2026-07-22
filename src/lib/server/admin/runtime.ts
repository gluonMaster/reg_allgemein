import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { AdminConsoleRepository } from './admin-repository';
import {
	FamilyCorrectionRepository,
	type FamilyCorrectionContributor,
} from './family-correction-repository';
import { AdminMutationRepository } from './mutation-repository';
import { ContractFamilyCorrectionContributor } from '$lib/server/contracts/boundaries';

export function createAdminConsoleRuntime(
	config: RuntimeConfig,
	options: { familyCorrectionContributor?: FamilyCorrectionContributor } = {}
) {
	const database = new DatabaseBoundary(config.db);
	return {
		repository: new AdminConsoleRepository(database),
		mutations: new AdminMutationRepository(database),
		familyCorrection: new FamilyCorrectionRepository(
			database,
			options.familyCorrectionContributor ?? new ContractFamilyCorrectionContributor(database)
		),
	};
}

export function requestAdminConsoleRuntime(event: RequestEvent) {
	return createAdminConsoleRuntime(loadRuntimeConfig(event.platform?.env));
}

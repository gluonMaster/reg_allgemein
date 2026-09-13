import { translateAdminCode } from '$lib/i18n';
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
import { IndividualRequestRepository } from '$lib/server/requests/request-repository';
import { IndividualRequestService } from '$lib/server/requests/request-service';
import { ContractRepository } from '$lib/server/contracts/contract-repository';
import type { CabinetReadModelContributor } from './cabinet-service';
import { MessageRepository } from '$lib/server/messages/message-repository';
import { MessageService } from '$lib/server/messages/message-service';

class ContractCabinetContributor implements CabinetReadModelContributor {
	constructor(private readonly contracts: ContractRepository) {}

	async contribute(userId: string, locale?: string) {
		const rows = await this.contracts.listOwnerHistory(userId);
		return {
			contractOffers: rows
				.filter((row) => ['draft', 'sent', 'accepted_by_parent'].includes(row.status))
				.map((row) => ({
					id: row.id,
					label: `${row.child_name} · ${row.contract_number}`,
					status: row.status,
					detail: `${translateAdminCode(locale, row.contract_kind)} · ${row.effective_from}${row.effective_to ? `–${row.effective_to}` : ''}`,
					href: `/contracts/${row.id}`,
				})),
			contractHistory: rows
				.filter((row) => !['draft', 'sent', 'accepted_by_parent'].includes(row.status))
				.map((row) => ({
					id: row.id,
					label: `${row.child_name} · ${row.contract_number}`,
					status: row.status,
					detail: `${translateAdminCode(locale, row.contract_kind)} · ${row.effective_from}${row.effective_to ? `–${row.effective_to}` : ''}`,
					href: `/contracts/${row.id}`,
				})),
		};
	}
}

export function createCabinetRuntime(config: RuntimeConfig) {
	const database = new DatabaseBoundary(config.db);
	const repository = new CabinetRepository(database);
	const trialRepository = new TrialRepository(database);
	const trialService = new TrialService(
		trialRepository,
		new CatalogRepository(database),
		new OccupancyRepository(database)
	);
	const requestService = new IndividualRequestService(
		new IndividualRequestRepository(database),
		config.pricing
	);
	const contractContributor = new ContractCabinetContributor(new ContractRepository(database));
	const messageContributor = new MessageService(new MessageRepository(database), config.messaging);
	return {
		repository,
		service: new CabinetService(repository, new CabinetPricingService(config.pricing), [
			trialService,
			requestService,
			contractContributor,
			messageContributor,
		]),
	};
}

export function requestCabinetRuntime(event: RequestEvent) {
	return createCabinetRuntime(loadRuntimeConfig(event.platform?.env));
}

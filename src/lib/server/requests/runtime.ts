import type { RequestEvent } from '@sveltejs/kit';
import { CabinetRepository } from '$lib/server/cabinet/cabinet-repository';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { FoundationRepository } from '$lib/server/db/foundation-repository';
import { AuthorizationDocumentRepository } from '$lib/server/documents/document-repository';
import { AuthorizationDocumentService } from '$lib/server/documents/document-service';
import { documentStore } from '$lib/server/documents/storage';
import { AuthRateLimiter } from '$lib/server/security/rate-limit';
import { RequestAdminRepository } from './admin-repository';
import { RequestAdminService } from './admin-service';
import { IndividualRequestRepository } from './request-repository';
import { IndividualRequestService } from './request-service';
import {
	ContractDocumentMutationGuard,
	ContractFundingDiscontinuityContributor,
	ContractRequestMutationGuard,
} from '$lib/server/contracts/boundaries';
import { StorageIntentRepository } from '$lib/server/operations/storage-intents';

export function createRequestRuntime(config: RuntimeConfig) {
	const database = new DatabaseBoundary(config.db);
	const requestRepository = new IndividualRequestRepository(
		database,
		new ContractRequestMutationGuard()
	);
	const documentRepository = new AuthorizationDocumentRepository(
		database,
		new ContractDocumentMutationGuard()
	);
	const store = documentStore(config.r2QuarantineBucket, config.r2ArchiveBucket);
	const storageIntents = new StorageIntentRepository(database);
	const limiter = new AuthRateLimiter(
		new FoundationRepository(database),
		config.jwtSecret ?? 'document-upload-disabled-without-secret',
		config.documents.uploadRateLimitWindowSeconds,
		config.documents.uploadRateLimitMaxAttempts
	);
	const adminRepository = new RequestAdminRepository(
		database,
		config.documents,
		new ContractFundingDiscontinuityContributor(database)
	);
	return {
		requestRepository,
		requestService: new IndividualRequestService(requestRepository, config.pricing),
		documentRepository,
		documentService: new AuthorizationDocumentService(
			documentRepository,
			store,
			config.documents,
			limiter,
			undefined,
			storageIntents
		),
		adminRepository,
		adminService: new RequestAdminService(
			adminRepository,
			documentRepository,
			store,
			undefined,
			storageIntents
		),
		documentConfig: config.documents,
		cabinetRepository: new CabinetRepository(database),
	};
}

export function requestRequestsRuntime(event: RequestEvent) {
	return createRequestRuntime(loadRuntimeConfig(event.platform?.env));
}

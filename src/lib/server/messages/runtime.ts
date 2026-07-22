import type { RequestEvent } from '@sveltejs/kit';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import { MessageRepository } from './message-repository';
import { MessageService } from './message-service';

export function createMessageRuntime(config: RuntimeConfig) {
	const repository = new MessageRepository(new DatabaseBoundary(config.db));
	return {
		repository,
		service: new MessageService(repository, config.messaging),
	};
}

export function requestMessageRuntime(event: RequestEvent) {
	return createMessageRuntime(loadRuntimeConfig(event.platform?.env));
}


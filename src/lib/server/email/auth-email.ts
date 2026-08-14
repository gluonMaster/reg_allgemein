import type { RuntimeConfig } from '$lib/server/config/runtime';
import type { EmailOutboxStore } from '$lib/server/outbox/contracts';
import { EmailOutboxWorker } from '$lib/server/outbox/outbox-worker';

export {
	DisabledEmailProvider,
	EmailProviderError,
	FakeEmailProvider,
	type EmailMessage,
	type EmailProvider,
} from '$lib/server/outbox/providers';

import type { EmailProvider } from '$lib/server/outbox/providers';

/**
 * Compatibility facade for the stage-05 auth harness.  Auth and every later
 * domain event now use the same leased email-outbox worker and template catalog.
 */
export class AuthEmailDispatcher {
	private readonly worker: EmailOutboxWorker;

	constructor(
		repository: EmailOutboxStore,
		provider: EmailProvider,
		secret: string,
		config: Pick<RuntimeConfig, 'portalPublicOrigin'>,
		now: () => string = () => new Date().toISOString()
	) {
		this.worker = new EmailOutboxWorker(
			repository,
			provider,
			secret,
			config,
			{ leaseSeconds: 60, retryBaseSeconds: 60, retryMaxSeconds: 3600 },
			`auth-email-worker:${crypto.randomUUID()}`,
			now
		);
	}

	async dispatchNext(): Promise<'empty' | 'sent' | 'retry' | 'dead'> {
		const result = await this.worker.dispatchNext();
		return result === 'lost_lease' || result === 'deferred' || result === 'delivery_unknown'
			? 'empty'
			: result;
	}
}

import { loadRuntimeConfig } from './lib/server/config/runtime';
import { runScheduledEvent } from './lib/server/operations/scheduler';
import { withSecurityHeaders } from './lib/server/security/response-headers';

// This module is emitted by the Svelte adapter before Wrangler bundles this
// tracked source entrypoint. `npm run build` is therefore a deploy prerequisite.
// @ts-ignore -- a clean `svelte-kit sync` has no adapter output yet; build creates it.
import svelteWorker from '../.svelte-kit/cloudflare/svelte-worker.js';

export default {
	async fetch(request: Request, env: App.Platform['env'], context: ExecutionContext) {
		const response = await svelteWorker.fetch(request, env, context);
		const pathname = new URL(request.url).pathname;
		return withSecurityHeaders(response, {
			production: env.APP_ENV === 'production',
			noStore: pathname === '/auth/reset' || pathname === '/auth/verify',
		});
	},
	scheduled(
		controller: ScheduledController,
		env: App.Platform['env'],
		context: ExecutionContext
	) {
		context.waitUntil(
			(async () => {
				const results = await runScheduledEvent(loadRuntimeConfig(env), {
					scheduledTime: controller.scheduledTime,
					cron: controller.cron,
				});
				if (results.some((result) => result.status === 'failed')) {
					throw new Error('SCHEDULED_JOB_BATCH_FAILED');
				}
			})()
		);
	},
} satisfies ExportedHandler<App.Platform['env']>;

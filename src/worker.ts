import { loadRuntimeConfig } from './lib/server/config/runtime';
import { runScheduledEvent } from './lib/server/operations/scheduler';
import {
	createOperationsHealthResponse,
	recordWorkerError,
} from './lib/server/operations/monitoring';
import { withSecurityHeaders } from './lib/server/security/response-headers';

// This module is emitted by the Svelte adapter before Wrangler bundles this
// tracked source entrypoint. `npm run build` is therefore a deploy prerequisite.
// @ts-ignore -- a clean `svelte-kit sync` has no adapter output yet; build creates it.
import svelteWorker from '../.svelte-kit/cloudflare/svelte-worker.js';

const OPERATIONS_HEALTH_PATH = '/_health/operations';

export default {
	async fetch(request: Request, env: App.Platform['env'], context: ExecutionContext) {
		const pathname = new URL(request.url).pathname;
		const production = env.APP_ENV === 'production';
		if (pathname === OPERATIONS_HEALTH_PATH) {
			if (request.method !== 'GET' && request.method !== 'HEAD') {
				return withSecurityHeaders(
					new Response(null, {
						status: 405,
						headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' },
					}),
					{ production, noStore: true }
				);
			}
			return createOperationsHealthResponse({
				database: env.DB,
				now: new Date().toISOString(),
				production,
			});
		}

		try {
			const response = await svelteWorker.fetch(request, env, context);
			if (response.status >= 500 && env.DB) {
				context.waitUntil(
					recordWorkerError(env.DB, new Date().toISOString()).catch(() => undefined)
				);
			}
			return withSecurityHeaders(response, {
				production,
				noStore: pathname === '/auth/reset' || pathname === '/auth/verify',
			});
		} catch (error) {
			if (env.DB) {
				await recordWorkerError(env.DB, new Date().toISOString()).catch(() => undefined);
			}
			throw error;
		}
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

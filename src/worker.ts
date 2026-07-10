export async function scheduled(
	event: ScheduledController,
	env: App.Platform['env'],
	ctx: ExecutionContext
): Promise<void> {
	ctx.waitUntil(runScheduledTasks(event, env));
}

async function runScheduledTasks(
	event: ScheduledController,
	env: App.Platform['env']
): Promise<void> {
	console.log(`[cron] ${event.cron}: scheduled task placeholder`);

	if (!env.DB) {
		console.warn('[cron] DB binding is not configured');
	}
}

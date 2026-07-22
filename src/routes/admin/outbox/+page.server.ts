import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { verifiedAdminForm } from '$lib/server/admin/http';
import { requireAdmin } from '$lib/server/security/authorization';
import type { OutboxChannel, OutboxStatus } from '$lib/server/outbox/contracts';
import { requestOutboxRuntime } from '$lib/server/outbox/runtime';
import { loadRuntimeConfig } from '$lib/server/config/runtime';

const channels = new Set<OutboxChannel>(['email', 'telegram']);
const statuses = new Set<OutboxStatus>(['pending', 'processing', 'retry', 'sent', 'dead', 'cancelled']);

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const channelValue = event.url.searchParams.get('channel') ?? '';
	const statusValue = event.url.searchParams.get('status') ?? '';
	const channel = channels.has(channelValue as OutboxChannel) ? channelValue as OutboxChannel : '';
	const status = statuses.has(statusValue as OutboxStatus) ? statusValue as OutboxStatus : '';
	const q = (event.url.searchParams.get('q') ?? '').trim().slice(0, 160);
	return {
		query: { channel, status, q },
		rows: (await requestOutboxRuntime(event).repository.listAdmin({ channel, status, q })).map((row) => ({
			...row,
			commandKey: crypto.randomUUID(),
		})),
	};
};

export const actions = {
	change: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const channel = form.get('channel')?.toString() as OutboxChannel;
			const action = form.get('outboxAction')?.toString() as 'retry' | 'cancel';
			if (!channels.has(channel) || !['retry', 'cancel'].includes(action)
				|| form.get('confirmation') !== 'confirmed') throw new Error('invalid');
			const config = loadRuntimeConfig(event.platform?.env);
			await requestOutboxRuntime(event).repository.adminAction({
				admin: actor, channel, action, outboxId: form.get('outboxId')?.toString() ?? '',
				idempotencyKey: form.get('idempotencyKey')?.toString() ?? '',
				requestId: event.locals.requestId, now: new Date().toISOString(),
				additionalAttempts: channel === 'email'
					? config.messaging.emailMaxAttempts
					: config.messaging.telegramMaxAttempts,
			});
			return { success: true, message: translate('de', 'admin.outbox.actionDone') };
		} catch { return fail(409, { success: false, message: translate('de', 'admin.outbox.actionFailed') }); }
	},
} satisfies Actions;

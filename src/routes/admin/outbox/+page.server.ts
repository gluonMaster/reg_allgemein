import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { verifiedAdminForm } from '$lib/server/admin/http';
import { requireAdmin } from '$lib/server/security/authorization';
import type { AdminOutboxStatus, OutboxChannel } from '$lib/server/outbox/contracts';
import { requestOutboxRuntime } from '$lib/server/outbox/runtime';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { outboxWaitReason } from '$lib/outbox-wait';
import { loadIntakeOutboxContext } from '$lib/trial-intake/server/pages.server';
import type { IntakeOutboxContext } from '$lib/trial-intake/contracts';

const channels = new Set<OutboxChannel>(['email', 'telegram']);
const statuses = new Set<AdminOutboxStatus>([
	'pending', 'processing', 'retry', 'sent', 'dead', 'cancelled', 'delivery_unknown',
]);

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const channelValue = event.url.searchParams.get('channel') ?? '';
	const statusValue = event.url.searchParams.get('status') ?? '';
	const channel = channels.has(channelValue as OutboxChannel) ? channelValue as OutboxChannel : '';
	const status = statuses.has(statusValue as AdminOutboxStatus)
		? statusValue as AdminOutboxStatus
		: '';
	const q = (event.url.searchParams.get('q') ?? '').trim().slice(0, 160);
	const now = new Date().toISOString();
	const { repository } = requestOutboxRuntime(event);
	const rows = await repository.listAdmin({ channel, status, q });
	const laneStopped = (await repository.countTerminalTelegramFailures()) > 0;
	// Request context is trial-intake enrichment and exists only in that portal mode (TIN-11).
	const intake: Record<string, IntakeOutboxContext> =
		loadRuntimeConfig(event.platform?.env).portalMode === 'trial_intake'
			? await loadIntakeOutboxContext(event, rows)
			: {};
	return {
		query: { channel, status, q },
		rows: rows.map((row) => ({
			...row,
			commandKey: crypto.randomUUID(),
			wait: outboxWaitReason(row, now, laneStopped) ?? null,
		})),
		intake,
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
			return { success: true, message: translate(event.locals.locale, 'admin.outbox.actionDone') };
		} catch { return fail(409, { success: false, message: translate(event.locals.locale, 'admin.outbox.actionFailed') }); }
	},
	resolveTelegram: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const action = form.get('outboxAction')?.toString() as
				| 'confirm_sent'
				| 'retry_after_review'
				| 'cancel';
			if (!['confirm_sent', 'retry_after_review', 'cancel'].includes(action)
				|| form.get('confirmation') !== 'confirmed') throw new Error('invalid');
			const reasonCode = {
				confirm_sent: 'message_found_in_destination',
				retry_after_review: 'message_absence_verified',
				cancel: 'delivery_abandoned',
			} as const;
			const config = loadRuntimeConfig(event.platform?.env);
			await requestOutboxRuntime(event).repository.resolveTelegramUnknown({
				admin: actor,
				outboxId: form.get('outboxId')?.toString() ?? '',
				attemptId: form.get('attemptId')?.toString() ?? '',
				action,
				reasonCode: reasonCode[action],
				idempotencyKey: form.get('idempotencyKey')?.toString() ?? '',
				requestId: event.locals.requestId,
				now: new Date().toISOString(),
				additionalAttempts: config.messaging.telegramMaxAttempts,
			});
			return { success: true, message: translate(event.locals.locale, 'admin.outbox.actionDone') };
		} catch {
			return fail(409, {
				success: false,
				message: translate(event.locals.locale, 'admin.outbox.actionFailed'),
			});
		}
	},
} satisfies Actions;

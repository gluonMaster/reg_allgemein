import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { verifiedAdminForm } from '$lib/server/admin/http';
import {
	privacyDeleteProcessSchema,
	privacyExportRequestSchema,
} from '$lib/server/privacy/contracts';
import { requestPrivacyRuntime } from '$lib/server/privacy/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	return {
		now: new Date().toISOString(),
		requests: await requestPrivacyRuntime(event).repository.listAdminRequests(),
	};
};

export const actions = {
	createExport: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const parsed = privacyExportRequestSchema.safeParse({
				subjectUserId: form.get('subjectUserId'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success || !parsed.data.subjectUserId) throw new Error('invalid');
			await requestPrivacyRuntime(event).service.generateExport({
				actor,
				subjectUserId: parsed.data.subjectUserId,
				idempotencyKey: parsed.data.idempotencyKey,
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate(event.locals.locale, 'privacy.export.ready') };
		} catch {
			return fail(409, { success: false, message: translate(event.locals.locale, 'admin.privacy.failed') });
		}
	},
	processDelete: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const parsed = privacyDeleteProcessSchema.safeParse({
				privacyRequestId: form.get('privacyRequestId'),
				reason: form.get('reason'),
				confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) throw new Error('invalid');
			const result = await requestPrivacyRuntime(event).service.processDeletion({
				admin: actor,
				...parsed.data,
				requestId: event.locals.requestId,
			});
			return {
				success: result.status === 'completed_with_retained_evidence',
				message: translate(event.locals.locale, result.status === 'blocked_by_active_contract'
					? 'privacy.delete.blocked' : 'admin.privacy.completed'),
			};
		} catch {
			return fail(409, { success: false, message: translate(event.locals.locale, 'admin.privacy.failed') });
		}
	},
} satisfies Actions;

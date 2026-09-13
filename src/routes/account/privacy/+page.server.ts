import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { privacyDeleteRequestSchema, privacyExportRequestSchema } from '$lib/server/privacy/contracts';
import { requestPrivacyRuntime } from '$lib/server/privacy/runtime';
import { requireParent } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';

export const load: PageServerLoad = async (event) => {
	const actor = requireParent(event.locals.user);
	const runtime = requestPrivacyRuntime(event);
	return {
		csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
		commandKey: crypto.randomUUID(),
		now: new Date().toISOString(),
		inventory: await runtime.service.dryRunDeletion(actor),
		requests: await runtime.repository.listOwnerRequests(actor.id),
	};
};

async function verifiedForm(event: Parameters<Actions[string]>[0]) {
	const form = await event.request.formData();
	await requireCsrf({
		cookies: event.cookies,
		user: event.locals.user,
		submittedToken: form.get('_csrf')?.toString(),
	});
	return { form, actor: requireParent(event.locals.user) };
}

export const actions = {
	exportData: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			const parsed = privacyExportRequestSchema.safeParse({
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) throw new Error('invalid');
			await requestPrivacyRuntime(event).service.generateExport({
				actor,
				idempotencyKey: parsed.data.idempotencyKey,
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate(event.locals.locale, 'privacy.export.ready') };
		} catch {
			return fail(409, { success: false, message: translate(event.locals.locale, 'privacy.failed') });
		}
	},
	requestDeletion: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			const parsed = privacyDeleteRequestSchema.safeParse({
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) throw new Error('invalid');
			const result = await requestPrivacyRuntime(event).service.requestDeletion({
				actor,
				idempotencyKey: parsed.data.idempotencyKey,
				requestId: event.locals.requestId,
			});
			return {
				success: result.status !== 'blocked_by_active_contract',
				message: translate(event.locals.locale, result.status === 'blocked_by_active_contract'
					? 'privacy.delete.blocked' : 'privacy.delete.requested'),
			};
		} catch {
			return fail(409, { success: false, message: translate(event.locals.locale, 'privacy.failed') });
		}
	},
} satisfies Actions;

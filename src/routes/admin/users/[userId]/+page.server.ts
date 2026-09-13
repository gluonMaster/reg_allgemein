import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import {
	blockUserSchema,
	familyCorrectionApplySchema,
	familyCorrectionPreviewSchema,
} from '$lib/server/admin/contracts';
import { adminActionError, verifiedAdminForm } from '$lib/server/admin/http';
import { requestAdminConsoleRuntime } from '$lib/server/admin/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const runtime = requestAdminConsoleRuntime(event);
	const user = await runtime.repository.userDetail(event.params.userId);
	if (!user)
		throw error(404, {
			code: 'ADMIN_RESOURCE_NOT_FOUND',
			message: translate(event.locals.locale, 'admin.notFound'),
			requestId: event.locals.requestId,
		});
	const familyQuery = event.url.searchParams.get('familyQ') ?? '';
	return {
		user,
		familyQuery,
		destinations: await runtime.repository.familyDestinations({
			userId: event.params.userId,
			query: familyQuery,
		}),
	};
};

export const actions = {
	setBlocked: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const parsed = blockUserSchema.safeParse({
				userId: event.params.userId,
				blocked: form.get('blocked'),
				reason: form.get('reason'),
				confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) return fail(400, { success: false, message: adminActionError(event.locals.locale) });
			await requestAdminConsoleRuntime(event).mutations.setBlocked({
				actor,
				...parsed.data,
				requestId: event.locals.requestId,
				now: new Date().toISOString(),
			});
			return { success: true, message: translate(event.locals.locale, 'admin.action.completed') };
		} catch {
			return fail(409, { success: false, message: adminActionError(event.locals.locale) });
		}
	},
	previewFamilyCorrection: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const destination = form.get('destination')?.toString() ?? '';
			const legacyPrefix = 'legacy_existing:';
			const parsed = familyCorrectionPreviewSchema.safeParse({
				userId: event.params.userId,
				destinationKind: destination.startsWith(legacyPrefix)
					? 'legacy_existing'
					: destination,
				destinationAllocationId: destination.startsWith(legacyPrefix)
					? destination.slice(legacyPrefix.length)
					: undefined,
			});
			if (!parsed.success) return fail(400, { success: false, message: adminActionError(event.locals.locale) });
			const preview = await requestAdminConsoleRuntime(event).familyCorrection.createPreview({
				actor,
				...parsed.data,
				requestId: event.locals.requestId,
				now: new Date().toISOString(),
			});
			return {
				success: true,
				message: translate(event.locals.locale, 'admin.family.previewReady'),
				preview,
			};
		} catch {
			return fail(409, { success: false, message: adminActionError(event.locals.locale) });
		}
	},
	applyFamilyCorrection: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const parsed = familyCorrectionApplySchema.safeParse({
				previewId: form.get('previewId'),
				reason: form.get('reason'),
				confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			});
			if (!parsed.success) return fail(400, { success: false, message: adminActionError(event.locals.locale) });
			await requestAdminConsoleRuntime(event).familyCorrection.apply({
				actor,
				...parsed.data,
				requestId: event.locals.requestId,
				now: new Date().toISOString(),
			});
			return { success: true, message: translate(event.locals.locale, 'admin.family.applied') };
		} catch {
			return fail(409, { success: false, message: adminActionError(event.locals.locale) });
		}
	},
} satisfies Actions;

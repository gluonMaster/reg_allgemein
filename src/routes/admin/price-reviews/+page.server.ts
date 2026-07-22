import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { verifiedAdminForm } from '$lib/server/admin/http';
import { requestPriceReviewRuntime } from '$lib/server/price-reviews/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const runtime = requestPriceReviewRuntime(event);
	const [batches, courses] = await Promise.all([
		runtime.repository.listAdminBatches(),
		runtime.repository.listComparableCourses(),
	]);
	return {
		courses,
		compareKey: crypto.randomUUID(),
		maintenanceKey: crypto.randomUUID(),
		batches: await Promise.all(
			batches.map(async (batch) => ({
				...batch,
				approveKey: crypto.randomUUID(),
				dispatchKey: crypto.randomUUID(),
				items: (await runtime.repository.listBatchItems(batch.id)).map((item) => ({
					...item,
					finalKey: crypto.randomUUID(),
				})),
			}))
		),
	};
};

export const actions = {
	compare: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestPriceReviewRuntime(event).service.createAdminComparison({
				admin: actor,
				payload: {
					courseGroupId: form.get('courseGroupId'),
					effectiveOn: form.get('effectiveOn'),
					reason: form.get('reason'),
					confirmation: form.get('confirmation'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'admin.priceReviews.actionDone') };
		} catch {
			return fail(409, { success: false, message: translate('de', 'admin.priceReviews.actionFailed') });
		}
	},
	approve: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestPriceReviewRuntime(event).service.approveBatch({
				admin: actor,
				payload: {
					batchId: form.get('batchId'),
					reason: form.get('reason'),
					confirmation: form.get('confirmation'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'admin.priceReviews.actionDone') };
		} catch {
			return fail(409, { success: false, message: translate('de', 'admin.priceReviews.actionFailed') });
		}
	},
	dispatch: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestPriceReviewRuntime(event).service.dispatchBatch({
				admin: actor,
				payload: {
					batchId: form.get('batchId'),
					confirmation: form.get('confirmation'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'admin.priceReviews.actionDone') };
		} catch {
			return fail(409, { success: false, message: translate('de', 'admin.priceReviews.actionFailed') });
		}
	},
	finalConfirm: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestPriceReviewRuntime(event).service.finalConfirm({
				admin: actor,
				payload: {
					itemId: form.get('itemId'),
					reason: form.get('reason'),
					confirmation: form.get('confirmation'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'admin.priceReviews.actionDone') };
		} catch {
			return fail(409, { success: false, message: translate('de', 'admin.priceReviews.actionFailed') });
		}
	},
	maintenance: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestPriceReviewRuntime(event).service.runManualMaintenance({
				admin: actor,
				payload: {
					confirmation: form.get('confirmation'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'admin.priceReviews.actionDone') };
		} catch {
			return fail(409, { success: false, message: translate('de', 'admin.priceReviews.actionFailed') });
		}
	},
} satisfies Actions;

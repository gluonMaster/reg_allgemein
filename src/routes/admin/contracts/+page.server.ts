import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminQuery, verifiedAdminForm } from '$lib/server/admin/http';
import { requestContractRuntime } from '$lib/server/contracts/runtime';
import { requireAdmin } from '$lib/server/security/authorization';
import { translate, formatMessage } from '$lib/i18n';
import { loadRuntimeConfig } from '$lib/server/config/runtime';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const query = adminQuery(event.url);
	const runtime = requestContractRuntime(event);
	const config = loadRuntimeConfig(event.platform?.env);
	const [offers, endRequests] = await Promise.all([
		runtime.repository.listAdminOffers(query.q),
		runtime.repository.listAdminEndRequests(),
	]);
	return {
		query,
		offers,
		endRequests,
		productionSendEnabled: false,
		previewReviewEnabled: config.contracts.previewReviewEnabled,
		mediaIdempotencyKey: crypto.randomUUID(),
		createIdempotencyKey: crypto.randomUUID(),
	};
};

export const actions = {
	installPreviewReview: async (event) => {
		try {
			const { actor } = await verifiedAdminForm(event);
			const installed =
				await requestContractRuntime(event).service.installPreviewReviewTemplates(actor);
			return {
				success: true,
				message: formatMessage(event.locals.locale, 'ui.preview.installed', { count: installed.length }),
			};
		} catch {
			return fail(409, {
				success: false,
				message: translate(event.locals.locale, 'ui.preview.failed'),
			});
		}
	},
	createDraft: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const manualOverrideReason = form.get('manualOverrideReason')?.toString().trim() ?? '';
			if (manualOverrideReason && form.get('responsibilityConfirmed') !== 'confirmed') {
				throw new Error('manual override confirmation required');
			}
			await requestContractRuntime(event).service.createDraft({
				admin: actor,
				payload: {
					userId: form.get('userId')?.toString() ?? '',
					childId: form.get('childId')?.toString() ?? '',
					academicPeriodId: form.get('academicPeriodId')?.toString() ?? '',
					templateVersionId: form.get('templateVersionId')?.toString() ?? '',
					renderInput: JSON.parse(form.get('renderInput')?.toString() ?? '{}'),
					priceQuoteId: form.get('priceQuoteId')?.toString() || undefined,
					priceVersionId: form.get('priceVersionId')?.toString() || undefined,
					priceRuleId: form.get('priceRuleId')?.toString() || undefined,
					manualOverride: manualOverrideReason
						? { reason: manualOverrideReason, responsibilityConfirmed: true }
						: undefined,
					expiresAt: form.get('expiresAt')?.toString() ?? '',
					idempotencyKey: form.get('idempotencyKey')?.toString() ?? '',
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate(event.locals.locale, 'admin.contracts.created') };
		} catch {
			return fail(409, {
				success: false,
				message: translate(event.locals.locale, 'admin.contracts.failed'),
			});
		}
	},
	renderSend: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestContractRuntime(event).service.renderAndSend({
				admin: actor,
				offerId: form.get('offerId')?.toString() ?? '',
				idempotencyKey: form.get('idempotencyKey')?.toString() ?? '',
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate(event.locals.locale, 'admin.contracts.sent') };
		} catch {
			return fail(409, {
				success: false,
				message: translate(event.locals.locale, 'admin.contracts.failed'),
			});
		}
	},
	formActivate: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestContractRuntime(event).service.formAndActivate({
				admin: actor,
				payload: {
					offerId: form.get('offerId'),
					reason: form.get('reason'),
					confirmation: form.get('confirmation'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate(event.locals.locale, 'admin.contracts.formed') };
		} catch {
			return fail(409, {
				success: false,
				message: translate(event.locals.locale, 'admin.contracts.failed'),
			});
		}
	},
	mediaWithdrawal: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestContractRuntime(event).service.recordMediaWithdrawal({
				admin: actor,
				payload: {
					ownerUserId: form.get('ownerUserId'),
					childId: form.get('childId'),
					captureScopes: form.getAll('captureScopes').map(String),
					publicationChannels: form.getAll('publicationChannels').map(String),
					channel: form.get('channel'),
					receivedAt: form.get('receivedAt'),
					evidenceSummary: form.get('evidenceSummary'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return {
				success: true,
				message: translate(event.locals.locale, 'admin.contracts.mediaWithdrawalRecorded'),
			};
		} catch {
			return fail(409, {
				success: false,
				message: translate(event.locals.locale, 'admin.contracts.failed'),
			});
		}
	},
	terminationReview: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestContractRuntime(event).service.reviewEndRequest({
				admin: actor,
				payload: {
					endRequestId: form.get('endRequestId'),
					decision: form.get('decision'),
					effectiveOn: form.get('effectiveOn')?.toString() || null,
					reason: form.get('reason'),
					externalDebtCheckResult: form.get('externalDebtCheckResult'),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			return {
				success: true,
				message: translate(event.locals.locale, 'admin.contracts.terminationReviewed'),
			};
		} catch {
			return fail(409, {
				success: false,
				message: translate(event.locals.locale, 'admin.contracts.failed'),
			});
		}
	},
} satisfies Actions;

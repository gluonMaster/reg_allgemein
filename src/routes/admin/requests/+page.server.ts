import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminActionError, adminQuery, verifiedAdminForm } from '$lib/server/admin/http';
import { requireAdmin } from '$lib/server/security/authorization';
import { requestRequestsRuntime } from '$lib/server/requests/runtime';
import { translate } from '$lib/i18n';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const query = adminQuery(event.url);
	const runtime = requestRequestsRuntime(event);
	return {
		query,
		documentStatus: event.url.searchParams.get('documentStatus')?.slice(0, 80) ?? '',
		queue: await runtime.adminService.list({
			q: query.q, status: query.status, kind: query.kind,
			documentStatus: event.url.searchParams.get('documentStatus')?.slice(0, 80) ?? '',
		}),
		attestationTextVersion: runtime.documentConfig.avAttestationTextVersion,
	};
};

export const actions = {
	requestTransition: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestRequestsRuntime(event).adminService.transitionRequest({ actor, payload: {
				requestId: form.get('requestId'), action: form.get('action'), reason: form.get('reason'),
				confirmation: form.get('confirmation'), idempotencyKey: form.get('idempotencyKey'),
			}, requestId: event.locals.requestId });
			return { success: true, message: translate('de', 'admin.requests.requestUpdated') };
		} catch { return fail(409, { success: false, message: adminActionError() }); }
	},
	documentAttestation: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestRequestsRuntime(event).adminService.attestDocument({ actor, payload: {
				documentId: form.get('documentId'), documentSha256: form.get('documentSha256'), outcome: form.get('outcome'),
				scannerLabel: form.get('scannerLabel'), scannerVersion: form.get('scannerVersion'),
				attestationTextVersion: form.get('attestationTextVersion'), confirmation: form.get('confirmation'),
				idempotencyKey: form.get('idempotencyKey'),
			}, requestId: event.locals.requestId });
			return { success: true, message: translate('de', 'admin.requests.attested') };
		} catch { return fail(409, { success: false, message: adminActionError() }); }
	},
	documentReview: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestRequestsRuntime(event).adminService.reviewDocument({ actor, payload: {
				documentId: form.get('documentId'), decision: form.get('decision'), reason: form.get('reason'),
				confirmation: form.get('confirmation'), idempotencyKey: form.get('idempotencyKey'),
			}, requestId: event.locals.requestId });
			return { success: true, message: translate('de', 'admin.requests.documentReviewed') };
		} catch { return fail(409, { success: false, message: adminActionError() }); }
	},
	authorizationReview: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			await requestRequestsRuntime(event).adminService.reviewAuthorization({ actor, payload: {
				authorizationId: form.get('authorizationId'), action: form.get('action'),
				kind: form.get('kind')?.toString() || undefined, validFrom: form.get('validFrom')?.toString() || undefined,
				validUntil: form.get('validUntil')?.toString() || undefined, reason: form.get('reason'),
				confirmation: form.get('confirmation'), idempotencyKey: form.get('idempotencyKey'),
			}, requestId: event.locals.requestId });
			return { success: true, message: translate('de', 'admin.requests.authorizationReviewed') };
		} catch { return fail(409, { success: false, message: adminActionError() }); }
	},
} satisfies Actions;

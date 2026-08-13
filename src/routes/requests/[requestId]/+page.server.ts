import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requestSubject } from '$lib/server/auth/http';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { requireParent } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { DocumentServiceError } from '$lib/server/documents/document-service';
import { IndividualRequestError } from '$lib/server/requests/request-repository';
import { requestRequestsRuntime } from '$lib/server/requests/runtime';
import { translate } from '$lib/i18n';

async function verifiedForm(event: Parameters<Actions[string]>[0]) {
	const form = await event.request.formData();
	await requireCsrf({
		cookies: event.cookies,
		user: event.locals.user,
		submittedToken: form.get('_csrf')?.toString(),
	});
	return { form, actor: requireParent(event.locals.user) };
}

function statePayload(form: FormData, requestId: string) {
	return {
		requestId,
		expectedVersion: form.get('expectedVersion'),
		idempotencyKey: form.get('idempotencyKey'),
	};
}

export const load: PageServerLoad = async (event) => {
	const actor = requireParent(event.locals.user);
	let request: Awaited<ReturnType<
		ReturnType<typeof requestRequestsRuntime>['requestService']['loadOwnerRequest']
	>>;
	try {
		request = await requestRequestsRuntime(event).requestService.loadOwnerRequest(
			actor,
			event.params.requestId
		);
	} catch (caught) {
		if (caught instanceof IndividualRequestError && caught.code === 'REQUEST_NOT_FOUND') {
			throw error(404, {
				code: 'REQUEST_NOT_FOUND',
				message: translate('de', 'admin.notFound'),
				requestId: event.locals.requestId,
			});
		}
		throw caught;
	}
	return {
		csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
		commandKey: crypto.randomUUID(),
		request,
	};
};

export const actions = {
	save: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			const kind = form.get('requestKind')?.toString();
			await requestRequestsRuntime(event).requestService.save({
				actor,
				payload: {
					...statePayload(form, event.params.requestId),
					childId: form.get('childId'), requestKind: kind,
					fundingKind: kind === 'individual' ? 'self_pay' : form.get('fundingKind'),
					subjects: form.get('subjects'), description: form.get('description'),
					preferredDays: form.getAll('preferredDays').map(String),
					preferredTimeWindows: [], preferredFormat: form.get('preferredFormat'),
					preferredLocations: form.get('preferredLocations')?.toString().split(/\r?\n/u).map((value) => value.trim()).filter(Boolean) ?? [],
				},
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'request.saved') };
		} catch (caught) {
			return fail(
				caught instanceof IndividualRequestError && caught.code === 'REQUEST_NOT_FOUND'
					? 404
					: 409,
				{ success: false, message: translate('de', 'request.error.change') }
			);
		}
	},
	submit: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			await requestRequestsRuntime(event).requestService.submit({ actor, payload: statePayload(form, event.params.requestId), requestId: event.locals.requestId });
			return { success: true, message: translate('de', 'request.submitted') };
		} catch (caught) {
			return fail(
				caught instanceof IndividualRequestError && caught.code === 'REQUEST_NOT_FOUND'
					? 404
					: 409,
				{ success: false, message: translate('de', 'request.error.submit') }
			);
		}
	},
	cancel: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			await requestRequestsRuntime(event).requestService.cancel({ actor, payload: statePayload(form, event.params.requestId), requestId: event.locals.requestId });
			return { success: true, message: translate('de', 'request.cancelled') };
		} catch (caught) {
			return fail(
				caught instanceof IndividualRequestError && caught.code === 'REQUEST_NOT_FOUND'
					? 404
					: 409,
				{ success: false, message: translate('de', 'request.error.cancel') }
			);
		}
	},
	upload: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			await requestRequestsRuntime(event).documentService.upload({
				actor,
				payload: { requestId: event.params.requestId, authorizationId: form.get('authorizationId'), replaceDocumentId: form.get('replaceDocumentId')?.toString() || undefined, idempotencyKey: form.get('idempotencyKey') },
				file: form.get('document'), requestSubject: requestSubject(event), requestId: event.locals.requestId,
			});
			return { success: true, message: translate('de', 'request.documentUploaded') };
		} catch { return fail(409, { success: false, message: translate('de', 'request.error.upload') }); }
	},
	deleteDocument: async (event) => {
		try {
			const { form, actor } = await verifiedForm(event);
			await requestRequestsRuntime(event).documentService.deleteByParent({ actor, payload: {
				requestId: event.params.requestId,
				documentId: form.get('documentId'),
				idempotencyKey: form.get('idempotencyKey'),
			}, requestId: event.locals.requestId });
			return { success: true, message: translate('de', 'request.documentDeleted') };
		} catch (caught) {
			return fail(
				caught instanceof DocumentServiceError && caught.code === 'DOCUMENT_NOT_FOUND'
					? 404
					: 409,
				{ success: false, message: translate('de', 'request.error.documentDelete') }
			);
		}
	},
} satisfies Actions;

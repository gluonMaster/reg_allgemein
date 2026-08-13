import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { requireParent } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { requestRequestsRuntime } from '$lib/server/requests/runtime';
import { translate } from '$lib/i18n';

function requestKind(value: string | null): 'nachhilfe' | 'individual' {
	return value === 'individual' ? 'individual' : 'nachhilfe';
}

function locations(value: FormDataEntryValue | null) {
	return value?.toString().split(/\r?\n/u).map((item) => item.trim()).filter(Boolean) ?? [];
}

export const load: PageServerLoad = async (event) => {
	const actor = requireParent(event.locals.user);
	return {
		csrfToken: event.cookies.get(CSRF_COOKIE_NAME) ?? '',
		commandKey: crypto.randomUUID(),
		requestKind: requestKind(event.url.searchParams.get('kind')),
		page: await requestRequestsRuntime(event).requestService.loadNewPage(actor),
	};
};

export const actions = {
	create: async (event) => {
		try {
			const form = await event.request.formData();
			await requireCsrf({
				cookies: event.cookies,
				user: event.locals.user,
				submittedToken: form.get('_csrf')?.toString(),
			});
			const kind = requestKind(form.get('requestKind')?.toString() ?? null);
			const result = await requestRequestsRuntime(event).requestService.createDraft({
				actor: requireParent(event.locals.user),
				payload: {
					childId: form.get('childId'),
					requestKind: kind,
					fundingKind: kind === 'individual' ? 'self_pay' : form.get('fundingKind'),
					subjects: form.get('subjects'),
					description: form.get('description'),
					preferredDays: form.getAll('preferredDays').map(String),
					preferredTimeWindows: [],
					preferredFormat: form.get('preferredFormat'),
					preferredLocations: locations(form.get('preferredLocations')),
					idempotencyKey: form.get('idempotencyKey'),
				},
				requestId: event.locals.requestId,
			});
			throw redirect(303, `/requests/${encodeURIComponent(result.requestId)}`);
		} catch (error) {
			if (error && typeof error === 'object' && 'status' in error) throw error;
			return fail(409, {
				success: false,
				message: translate('de', 'request.error.save'),
			});
		}
	},
} satisfies Actions;

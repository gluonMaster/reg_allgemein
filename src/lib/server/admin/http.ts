import type { RequestEvent } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import { requireAdmin } from '$lib/server/security/authorization';
import { requireCsrf } from '$lib/server/security/csrf';
import { adminListQuerySchema } from './contracts';

export function adminQuery(url: URL) {
	return adminListQuerySchema.parse({
		q: url.searchParams.get('q') ?? '',
		status: url.searchParams.get('status') ?? '',
		kind: url.searchParams.get('kind') ?? '',
		page: url.searchParams.get('page') ?? '1',
	});
}

export async function verifiedAdminForm(event: RequestEvent) {
	const form = await event.request.formData();
	await requireCsrf({
		cookies: event.cookies,
		user: event.locals.user,
		submittedToken: form.get('_csrf')?.toString(),
	});
	return { form, actor: requireAdmin(event.locals.user) };
}

export function adminActionError() {
	return translate('de', 'admin.action.failed');
}

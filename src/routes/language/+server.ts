import { error, json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { languageReturnPath, UI_LOCALE_COOKIE } from '$lib/i18n/locale';
import { translate } from '$lib/i18n';
import { isPortalFormOriginAllowed } from '$lib/server/security/form-origin';
import { loadRuntimeConfig } from '$lib/server/config/runtime';

export const POST: RequestHandler = async ({ request, cookies, url, locals, platform }) => {
	// The preference changes no account data, and still requires a same-origin form.
	const origin = loadRuntimeConfig(platform?.env).portalPublicOrigin;
	if (!isPortalFormOriginAllowed(request, origin))
		error(403, {
			code: 'FORM_ORIGIN_FORBIDDEN',
			message: translate(locals.locale, 'auth.invalidInput'),
			requestId: locals.requestId,
			locale: locals.locale,
		});
	const form = await request.formData();
	const locale = form.get('locale');
	if (locale !== 'de' && locale !== 'ru')
		error(400, {
			code: 'INVALID_UI_LOCALE',
			message: translate(locals.locale, 'auth.invalidInput'),
			requestId: locals.requestId,
			locale: locals.locale,
		});
	cookies.set(UI_LOCALE_COOKIE, locale, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 60 * 60 * 24 * 365,
	});
	if (request.headers.get('accept') === 'application/json') return json({ locale });
	redirect(303, languageReturnPath(form.get('returnTo')));
};

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import { requestPrivacyRuntime } from '$lib/server/privacy/runtime';
import { PrivacyServiceError } from '$lib/server/privacy/privacy-service';
import { requireParent } from '$lib/server/security/authorization';

export const GET: RequestHandler = async (event) => {
	const actor = requireParent(event.locals.user);
	let result: Awaited<ReturnType<
		ReturnType<typeof requestPrivacyRuntime>['service']['downloadExport']
	>>;
	try {
		result = await requestPrivacyRuntime(event).service.downloadExport({
			actor,
			artifactId: event.params.artifactId,
			requestId: event.locals.requestId,
		});
	} catch (caught) {
		if (caught instanceof PrivacyServiceError && caught.code === 'PRIVACY_EXPORT_NOT_FOUND') {
			throw error(404, {
				code: 'PRIVACY_EXPORT_NOT_FOUND',
				message: translate(event.locals.locale, 'admin.notFound'),
				requestId: event.locals.requestId,
			});
		}
		throw caught;
	}
	return new Response(result.body, {
		headers: {
			'content-type': result.contentType,
			'content-disposition': `attachment; filename="${result.filename}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'; sandbox",
		},
	});
};

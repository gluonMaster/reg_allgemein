import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import { DocumentServiceError } from '$lib/server/documents/document-service';
import { requireParent } from '$lib/server/security/authorization';
import { requestRequestsRuntime } from '$lib/server/requests/runtime';

export const GET: RequestHandler = async (event) => {
	const actor = requireParent(event.locals.user);
	let result: Awaited<
		ReturnType<
			ReturnType<typeof requestRequestsRuntime>['documentService']['parentApprovedDownload']
		>
	>;
	try {
		result = await requestRequestsRuntime(event).documentService.parentApprovedDownload({
			actor,
			documentId: event.params.documentId,
			requestId: event.locals.requestId,
		});
	} catch (caught) {
		if (caught instanceof DocumentServiceError && caught.code === 'DOCUMENT_NOT_FOUND') {
			throw error(404, {
				code: 'DOCUMENT_NOT_FOUND',
				message: translate(event.locals.locale, 'admin.notFound'),
				requestId: event.locals.requestId,
			});
		}
		throw caught;
	}
	return new Response(result.body, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-disposition': `attachment; filename="${result.filename}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'; sandbox",
		},
	});
};

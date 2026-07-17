import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/security/authorization';
import { requestRequestsRuntime } from '$lib/server/requests/runtime';

export const GET: RequestHandler = async (event) => {
	const result = await requestRequestsRuntime(event).documentService.adminQuarantineDownload({
		actor: requireAdmin(event.locals.user), documentId: event.params.documentId,
		requestId: event.locals.requestId,
	});
	return new Response(result.body, { headers: {
		'content-type': 'application/octet-stream',
		'content-disposition': `attachment; filename="${result.filename}"`,
		'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
		'content-security-policy': "default-src 'none'; sandbox",
	} });
};

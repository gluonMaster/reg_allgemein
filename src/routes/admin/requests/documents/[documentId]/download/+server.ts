import type { RequestHandler } from './$types';
import { verifiedAdminForm } from '$lib/server/admin/http';
import { requestRequestsRuntime } from '$lib/server/requests/runtime';

export const POST: RequestHandler = async (event) => {
	const { form, actor } = await verifiedAdminForm(event);
	const result = await requestRequestsRuntime(event).documentService.adminQuarantineDownload({
		actor,
		documentId: event.params.documentId,
		purpose: form.get('purpose'),
		requestId: event.locals.requestId,
	});
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

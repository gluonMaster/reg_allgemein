import type { RequestHandler } from './$types';
import { verifiedAdminForm } from '$lib/server/admin/http';
import { requestContractRuntime } from '$lib/server/contracts/runtime';

export const POST: RequestHandler = async (event) => {
	const { form, actor } = await verifiedAdminForm(event);
	const artifact = await requestContractRuntime(event).service.downloadAdminArtifact({
		admin: actor,
		artifactId: event.params.artifactId,
		purpose: form.get('purpose'),
		requestId: event.locals.requestId,
	});
	return new Response(artifact.body, {
		headers: {
			'content-type': artifact.contentType,
			'content-disposition': `attachment; filename="${artifact.filename}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'; sandbox",
		},
	});
};

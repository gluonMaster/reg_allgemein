import type { RequestHandler } from './$types';
import { requestContractRuntime } from '$lib/server/contracts/runtime';
import { requireAdmin } from '$lib/server/security/authorization';

export const GET: RequestHandler = async (event) => {
	const artifact = await requestContractRuntime(event).service.downloadAdminArtifact({
		admin: requireAdmin(event.locals.user),
		artifactId: event.params.artifactId,
		requestId: event.locals.requestId,
	});
	return new Response(artifact.body, {
		headers: {
			'content-type': artifact.contentType,
			'content-disposition': `attachment; filename="${artifact.filename}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff',
		},
	});
};

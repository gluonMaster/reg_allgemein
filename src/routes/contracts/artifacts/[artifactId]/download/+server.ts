import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { translate } from '$lib/i18n';
import { ContractServiceError } from '$lib/server/contracts/contract-service';
import { requestContractRuntime } from '$lib/server/contracts/runtime';
import { requireParent } from '$lib/server/security/authorization';

export const GET: RequestHandler = async (event) => {
	let artifact: Awaited<
		ReturnType<ReturnType<typeof requestContractRuntime>['service']['downloadArtifact']>
	>;
	try {
		artifact = await requestContractRuntime(event).service.downloadArtifact({
			actor: requireParent(event.locals.user),
			artifactId: event.params.artifactId,
			requestId: event.locals.requestId,
		});
	} catch (caught) {
		if (
			caught instanceof ContractServiceError &&
			caught.code === 'CONTRACT_ARTIFACT_NOT_FOUND'
		) {
			throw error(404, {
				code: 'CONTRACT_ARTIFACT_NOT_FOUND',
				message: translate(event.locals.locale, 'admin.notFound'),
				requestId: event.locals.requestId,
			});
		}
		throw caught;
	}
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

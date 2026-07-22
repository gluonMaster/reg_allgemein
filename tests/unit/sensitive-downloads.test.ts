import { describe, expect, it } from 'vitest';
import {
	contractArtifactDownloadPurposeSchema,
	quarantineDownloadPurposeSchema,
} from '$lib/server/security/download-purpose';
import * as adminContractDownloadRoute from '../../src/routes/admin/contracts/artifacts/[artifactId]/download/+server';
import * as adminDocumentDownloadRoute from '../../src/routes/admin/requests/documents/[documentId]/download/+server';

const adminUser = {
	id: 'admin-download-test',
	role: 'admin' as const,
	emailVerified: true,
	sessionId: 'admin-download-session',
	sessionVersion: 1,
	csrfHash: 'not-used-with-missing-cookie',
};

function eventWithoutCsrf(path: string) {
	return {
		request: new Request(`https://portal.example.test${path}`, {
			method: 'POST',
			body: new URLSearchParams({ purpose: 'local_av_scan' }),
		}),
		cookies: { get: () => undefined },
		locals: { user: adminUser, requestId: 'request-download-csrf' },
		params: { documentId: 'document-1', artifactId: 'artifact-1' },
	};
}

describe('sensitive admin downloads', () => {
	it('uses fixed safe purpose categories instead of free text', () => {
		expect(quarantineDownloadPurposeSchema.parse('local_av_scan')).toBe('local_av_scan');
		expect(contractArtifactDownloadPurposeSchema.parse('contract_administration')).toBe(
			'contract_administration'
		);
		expect(contractArtifactDownloadPurposeSchema.parse('legal_evidence_review')).toBe(
			'legal_evidence_review'
		);
		expect(quarantineDownloadPurposeSchema.safeParse('inspect because requested').success).toBe(
			false
		);
		expect(contractArtifactDownloadPurposeSchema.safeParse('debug').success).toBe(false);
	});

	it('exposes admin downloads only as CSRF-protected POST handlers', async () => {
		expect('GET' in adminDocumentDownloadRoute).toBe(false);
		expect('GET' in adminContractDownloadRoute).toBe(false);
		await expect(
			adminDocumentDownloadRoute.POST(
				eventWithoutCsrf('/admin/requests/documents/document-1/download') as never
			)
		).rejects.toMatchObject({ code: 'CSRF_REJECTED' });
		await expect(
			adminContractDownloadRoute.POST(
				eventWithoutCsrf('/admin/contracts/artifacts/artifact-1/download') as never
			)
		).rejects.toMatchObject({ code: 'CSRF_REJECTED' });
	});
});

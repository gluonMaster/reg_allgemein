import type { AuthenticatedUser } from '$lib/server/auth/session';
import { CabinetService } from '$lib/server/cabinet/cabinet-service';
import { AuthorizationDocumentService } from '$lib/server/documents/document-service';
import { FamilyService } from '$lib/server/family/family-service';
import { MessageService } from '$lib/server/messages/message-service';
import { PrivacyService } from '$lib/server/privacy/privacy-service';
import { IndividualRequestService } from '$lib/server/requests/request-service';
import { TrialService } from '$lib/server/trials/trial-service';

const admin: AuthenticatedUser = {
	id: 'service-admin',
	role: 'admin',
	emailVerified: true,
	sessionId: 'service-admin-session',
	sessionVersion: 1,
	csrfHash: 'a'.repeat(64),
};

const cabinet = new CabinetService({} as never, {} as never);
const family = new FamilyService({} as never, {} as never, 'synthetic-secret', {} as never);
const messages = new MessageService({} as never, {} as never);
const trials = new TrialService({} as never, {} as never, {} as never);
const privacy = new PrivacyService({} as never, {} as never, { exportTtlSeconds: 3600 });
const requests = new IndividualRequestService({} as never, {} as never);
const documents = new AuthorizationDocumentService(
	{} as never,
	{} as never,
	{} as never,
	{} as never
);

describe('parent product service boundaries', () => {
	it.each([
		['cabinet read', 'FORBIDDEN', () => cabinet.load(admin)],
		['cabinet child create', 'FORBIDDEN', () => cabinet.createChild({ actor: admin, payload: {}, requestId: 'x' })],
		['cabinet child update', 'FORBIDDEN', () => cabinet.updateChild({ actor: admin, payload: {}, requestId: 'x' })],
		['cabinet correction', 'FORBIDDEN', () => cabinet.requestCorrection({ actor: admin, payload: {}, requestId: 'x' })],
		['legacy claim request', 'FORBIDDEN', () => family.requestLegacyClaimProof({ actor: admin, requestSubject: 'x' })],
		['legacy claim confirmation', 'FORBIDDEN', () => family.confirmLegacyClaim({ actor: admin, token: 'x', requestId: 'x', requestSubject: 'x' })],
		['message create', 'FORBIDDEN', () => messages.createThread({ actor: admin, payload: {}, requestId: 'x' })],
		['absence create', 'FORBIDDEN', () => messages.createAbsence({ actor: admin, payload: {}, requestId: 'x' })],
		['parent message append', 'FORBIDDEN', () => messages.appendParentMessage({ actor: admin, payload: {}, requestId: 'x' })],
		['parent message close', 'FORBIDDEN', () => messages.closeAsParent({ actor: admin, payload: {}, requestId: 'x' })],
		['trial page', 'PARENT_REQUIRED', () => trials.loadSubmissionPage(admin, 'course-1')],
		['trial submit', 'PARENT_REQUIRED', () => trials.submit({ actor: admin, payload: {}, requestId: 'x' })],
		['trial cancel', 'PARENT_REQUIRED', () => trials.cancel({ actor: admin, payload: {}, requestId: 'x' })],
		['privacy deletion inventory', 'PRIVACY_PARENT_REQUIRED', () => privacy.dryRunDeletion(admin)],
		['privacy deletion request', 'PRIVACY_PARENT_REQUIRED', () => privacy.requestDeletion({ actor: admin, idempotencyKey: 'x', requestId: 'x' })],
		['request create page', 'PARENT_REQUIRED', () => requests.loadNewPage(admin)],
		['request create', 'PARENT_REQUIRED', () => requests.createDraft({ actor: admin, payload: {}, requestId: 'x' })],
		['request read', 'PARENT_REQUIRED', () => requests.loadOwnerRequest(admin, 'request-1')],
		['request save', 'PARENT_REQUIRED', () => requests.save({ actor: admin, payload: {}, requestId: 'x' })],
		['request submit', 'PARENT_REQUIRED', () => requests.submit({ actor: admin, payload: {}, requestId: 'x' })],
		['request cancel', 'PARENT_REQUIRED', () => requests.cancel({ actor: admin, payload: {}, requestId: 'x' })],
		['document upload', 'PARENT_REQUIRED', () => documents.upload({ actor: admin, payload: {}, file: {}, requestSubject: 'x', requestId: 'x' })],
		['document delete', 'PARENT_REQUIRED', () => documents.deleteByParent({ actor: admin, payload: {}, requestId: 'x' })],
		['document download', 'PARENT_REQUIRED', () => documents.parentApprovedDownload({ actor: admin, documentId: 'document-1', requestId: 'x' })],
	])('rejects a current admin at the %s boundary', async (_name, code, operation) => {
		await expect(operation()).rejects.toMatchObject({ code });
	});
});

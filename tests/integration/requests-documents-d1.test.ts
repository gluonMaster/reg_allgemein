import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import { DatabaseBoundary } from '$lib/server/db/database';
import { AuthorizationDocumentRepository } from '$lib/server/documents/document-repository';
import { AuthorizationDocumentService } from '$lib/server/documents/document-service';
import type { PrivateDocumentStore } from '$lib/server/documents/storage';
import { requireAdmin } from '$lib/server/security/authorization';
import { RequestAdminRepository } from '$lib/server/requests/admin-repository';
import { RequestAdminService } from '$lib/server/requests/admin-service';
import { IndividualRequestRepository } from '$lib/server/requests/request-repository';
import { IndividualRequestService } from '$lib/server/requests/request-service';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const initialNow = '2026-07-17T10:00:00.000Z';
const hash = (character: string) => character.repeat(64);
const pricing = {
	individualPriceCentsPer45Min: 3000,
	groupDurationFallbackMinutes: 90,
	missingDurationYearlyCentsPer45Min: 2300,
	missingDurationMonthlyCentsPer45Min: 3000,
	quoteTtlSeconds: 86_400,
};
const documentConfig = {
	uploadEnabled: true,
	maxFileBytes: 10 * 1024 * 1024,
	maxFilesPerAuthorization: 5,
	maxAuthorizationBytes: 25 * 1024 * 1024,
	uploadRateLimitWindowSeconds: 60,
	uploadRateLimitMaxAttempts: 5,
	avAttestationTextVersion: 'manual-local-av-v1',
};
const parent: AuthenticatedUser = { id: 'parent-request', role: 'parent', emailVerified: true, sessionId: 'p', sessionVersion: 1, csrfHash: 'p' };
const foreignParent: AuthenticatedUser = { id: 'foreign-request', role: 'parent', emailVerified: true, sessionId: 'f', sessionVersion: 1, csrfHash: 'f' };
const admin = requireAdmin({ id: 'admin-request', role: 'admin', emailVerified: true, sessionId: 'a', sessionVersion: 1, csrfHash: 'a' });

class MemoryStore implements PrivateDocumentStore {
	readonly values = new Map<string, Uint8Array>();
	readonly deletes: string[] = [];
	async put(key: string, body: Uint8Array) { this.values.set(key, Uint8Array.from(body)); }
	async get(key: string) {
		const value = this.values.get(key);
		if (!value) return null;
		const copy = Uint8Array.from(value);
		return { body: copy.buffer, size: copy.byteLength };
	}
	async delete(key: string) { this.deletes.push(key); this.values.delete(key); }
}

function pdfFile(suffix = '') {
	const body = new TextEncoder().encode(`%PDF-1.7\n${suffix}\n%%EOF`);
	return { name: 'proof.pdf', type: 'application/pdf', size: body.byteLength, arrayBuffer: async () => body.buffer };
}

async function seedIdentity(db: DatabaseBoundary) {
	await db.batch([
		{ sql: `INSERT INTO academic_periods (id, code, display_name, starts_on, ends_on, is_current, created_at)
			VALUES ('period-requests', '2026-2027', '2026/2027', '2026-01-01', '2027-12-31', 1, ?)`, params: [initialNow] },
		{ sql: `INSERT INTO import_runs
			(id, source_kind, academic_period_id, source_label, source_hash_sha256,
			 source_contract_id, source_contract_version, structural_fingerprint_sha256,
			 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
			 attempt_no, retry_of_run_id, status, started_at, validated_at, promoted_at,
			 finished_at, rows_total, rows_staged, rows_promoted, rows_skipped,
			 safe_summary_json, error_code, created_at, updated_at)
			VALUES ('run-requests', 'schedule', 'period-requests', 'synthetic', ?,
			 'schedule-json', 1, ?, '{}', ?, ?, 1, NULL, 'validated', ?, ?, NULL,
			 NULL, 0, 0, 0, 0, '{}', NULL, ?, ?)`, params: [hash('1'), hash('2'), hash('3'), hash('4'), initialNow, initialNow, initialNow, initialNow] },
		{ sql: `INSERT INTO family_number_allocations
			(id, namespace, sequence_number, display_family_id, legacy_family_id,
			 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
			 created_at, updated_at)
			VALUES ('family-request', 'portal_2', 8101, '2. 8101', NULL,
			 'parent-request', 'portal', 'assigned', ?, NULL, ?, ?)`, params: [initialNow, initialNow, initialNow] },
		{ sql: `INSERT INTO family_number_allocations
			(id, namespace, sequence_number, display_family_id, legacy_family_id,
			 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
			 created_at, updated_at)
			VALUES ('family-foreign-request', 'portal_2', 8102, '2. 8102', NULL,
			 'foreign-request', 'portal', 'assigned', ?, NULL, ?, ?)`, params: [initialNow, initialNow, initialNow] },
	]);
	for (const user of [
		['parent-request', 'parent-request@example.test', 'parent', 'family-request', 'assigned', 1],
		['foreign-request', 'foreign-request@example.test', 'parent', 'family-foreign-request', 'assigned', 1],
		['admin-request', 'admin-request@example.test', 'admin', null, 'pending_verification', 0],
	] as const) {
		await db.run({ sql: `INSERT INTO users
			(id, email, email_normalized, password_hash, email_verified_at, role,
			 first_name, last_name, first_name_normalized, last_name_normalized,
			 family_number_id, family_assignment_status, family_version,
			 family_assignment_import_run_id, privacy_notice_version,
			 privacy_accepted_at, created_at, updated_at)
			VALUES (?, ?, ?, 'not-used', ?, ?, 'Test', 'User', 'test', 'user', ?, ?, ?,
			 NULL, 'synthetic-v1', ?, ?, ?)`, params: [user[0], user[1], user[1], initialNow, user[2], user[3], user[4], user[5], initialNow, initialNow, initialNow] });
	}
	for (const child of [
		['child-request', 'parent-request', 'family-request', 'Request Child'],
		['child-foreign-request', 'foreign-request', 'family-foreign-request', 'Foreign Child'],
	] as const) {
		await db.run({ sql: `INSERT INTO children
			(id, owner_user_id, legacy_family_id, family_number_id, origin,
			 source_child_key, source_full_name, source_full_name_normalized,
			 source_birth_date, full_name_override, birth_date_override, full_name,
			 full_name_normalized, birth_date, last_seen_run_id, is_current,
			 created_at, updated_at)
			VALUES (?, ?, NULL, ?, 'portal', ?, ?, lower(?), '2017-03-04', NULL,
			 NULL, ?, lower(?), '2017-03-04', 'run-requests', 1, ?, ?)`, params: [child[0], child[1], child[2], `source-${child[0]}`, child[3], child[3], child[3], child[3], initialNow, initialNow] });
	}
}

describe('stage 08 request and private document workflow in D1', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;
	let clock: string;
	let requests: IndividualRequestService;
	let requestRepository: IndividualRequestRepository;
	let documentRepository: AuthorizationDocumentRepository;
	let documents: AuthorizationDocumentService;
	let adminRepository: RequestAdminRepository;
	let adminService: RequestAdminService;
	let store: MemoryStore;

	beforeEach(async () => {
		context = await createMigratedTestD1(); db = new DatabaseBoundary(context.db);
		await seedIdentity(db); clock = initialNow; store = new MemoryStore();
		requestRepository = new IndividualRequestRepository(db);
		documentRepository = new AuthorizationDocumentRepository(db);
		requests = new IndividualRequestService(requestRepository, pricing, () => clock);
		documents = new AuthorizationDocumentService(documentRepository, store, documentConfig, { consume: async () => undefined }, () => clock);
		adminRepository = new RequestAdminRepository(db, documentConfig);
		adminService = new RequestAdminService(adminRepository, documentRepository, store, () => clock);
	});
	afterEach(async () => context.dispose());

	async function createNachhilfe(key: string) {
		const created = await requests.createDraft({ actor: parent, requestId: `req-${key}`, payload: {
			childId: 'child-request', requestKind: 'nachhilfe', fundingKind: 'jobcenter', subjects: 'Mathematik', description: '', preferredDays: ['MO'], preferredTimeWindows: [], preferredFormat: 'onsite', preferredLocations: [], idempotencyKey: `create-${key}`,
		} });
		return requests.loadOwnerRequest(parent, created.requestId);
	}

	it('enforces individual self-pay and the fixed 3000-cent tariff snapshot', async () => {
		await expect(requests.createDraft({ actor: parent, requestId: 'bad-kind', payload: {
			childId: 'child-request', requestKind: 'individual', fundingKind: 'jobcenter', subjects: 'Deutsch', description: '', preferredDays: [], preferredTimeWindows: [], preferredFormat: 'online', preferredLocations: [], idempotencyKey: 'invalid-kind-key',
		} })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		const created = await requests.createDraft({ actor: parent, requestId: 'individual', payload: {
			childId: 'child-request', requestKind: 'individual', fundingKind: 'self_pay', subjects: 'Deutsch', description: '', preferredDays: [], preferredTimeWindows: [], preferredFormat: 'online', preferredLocations: [], idempotencyKey: 'individual-create',
		} });
		const request = await requests.loadOwnerRequest(parent, created.requestId);
		expect(request).toMatchObject({ unitRateCents: 3000, parentPayable: true, fundingKind: 'self_pay' });
		expect(JSON.stringify(request)).not.toMatch(/payer|bank|reference|payment_details/iu);
	});

	it('isolates children, requests, and document IDs by owner', async () => {
		await expect(requests.createDraft({ actor: parent, requestId: 'foreign-child', payload: {
			childId: 'child-foreign-request', requestKind: 'individual', fundingKind: 'self_pay', subjects: 'Deutsch', description: '', preferredDays: [], preferredTimeWindows: [], preferredFormat: 'online', preferredLocations: [], idempotencyKey: 'foreign-child-key',
		} })).rejects.toBeDefined();
		const request = await createNachhilfe('owner-scope');
		await expect(requests.loadOwnerRequest(foreignParent, request.id)).rejects.toMatchObject({ code: 'REQUEST_NOT_FOUND' });
	});

	it('requires a document on submit and treats repeated submission keys idempotently', async () => {
		const request = await createNachhilfe('needs-doc');
		const first = await requests.submit({ actor: parent, payload: { requestId: request.id, expectedVersion: request.version, idempotencyKey: 'submit-needs-document' }, requestId: 'submit-1' });
		expect(first).toMatchObject({ status: 'needs_documents', replayed: false });
		const replay = await requests.submit({ actor: parent, payload: { requestId: request.id, expectedVersion: request.version, idempotencyKey: 'submit-needs-document' }, requestId: 'submit-2' });
		expect(replay).toMatchObject({ status: 'needs_documents', replayed: true });
	});

	it('performs download-bound AV attestation, separate approval, inclusive funding, and owner download', async () => {
		let request = await createNachhilfe('full-flow');
		const authorizationId = request.authorizations[0].id;
		const uploaded = await documents.upload({ actor: parent, payload: { requestId: request.id, authorizationId, idempotencyKey: 'upload-full-flow' }, file: pdfFile(), requestSubject: 'test-subject', requestId: 'upload-request' });
		const replay = await documents.upload({ actor: parent, payload: { requestId: request.id, authorizationId, idempotencyKey: 'upload-full-flow' }, file: pdfFile(), requestSubject: 'test-subject', requestId: 'upload-replay' });
		expect(replay).toMatchObject({ documentId: uploaded.documentId, replayed: true });
		await requests.submit({ actor: parent, payload: { requestId: request.id, expectedVersion: request.version, idempotencyKey: 'submit-full-flow' }, requestId: 'submit-full-flow' });
		request = await requests.loadOwnerRequest(parent, request.id);
		await expect(adminService.attestDocument({ actor: admin, payload: { documentId: uploaded.documentId, documentSha256: hash('0'), outcome: 'clean', scannerLabel: 'Test AV', scannerVersion: '1', attestationTextVersion: 'manual-local-av-v1', confirmation: 'confirmed', idempotencyKey: 'attest-before-download' }, requestId: 'attest-before' })).rejects.toBeDefined();
		await documents.adminQuarantineDownload({ actor: admin, documentId: uploaded.documentId, requestId: 'admin-download' });
		const internal = await db.first<{ sha256: string }>({ sql: `SELECT sha256 FROM authorization_documents WHERE id = ?`, params: [uploaded.documentId] });
		await adminService.attestDocument({ actor: admin, payload: { documentId: uploaded.documentId, documentSha256: internal!.sha256, outcome: 'clean', scannerLabel: 'Test AV', scannerVersion: '1', attestationTextVersion: 'manual-local-av-v1', confirmation: 'confirmed', idempotencyKey: 'attest-after-download' }, requestId: 'attest-after' });
		await adminService.reviewDocument({ actor: admin, payload: { documentId: uploaded.documentId, decision: 'approve', reason: 'Lesbar und zutreffend', confirmation: 'confirmed', idempotencyKey: 'approve-document' }, requestId: 'approve-document' });
		expect([...store.values.keys()].some((key) => key.startsWith('archive/funding/'))).toBe(true);
		await adminService.reviewAuthorization({ actor: admin, payload: { authorizationId, action: 'approve', kind: 'jobcenter', validFrom: '2026-08-01', validUntil: '2026-08-31', reason: 'Bescheid geprüft', confirmation: 'confirmed', idempotencyKey: 'approve-authorization' }, requestId: 'approve-authorization' });
		await adminService.transitionRequest({ actor: admin, payload: { requestId: request.id, action: 'approve', reason: 'Förderung vollständig', confirmation: 'confirmed', idempotencyKey: 'approve-request' }, requestId: 'approve-request' });
		await expect(adminRepository.assertEligibleForOffer({ requestId: request.id, plannedFrom: '2026-08-01', plannedUntilInclusive: '2026-08-31' })).resolves.toBeUndefined();
		await expect(adminRepository.assertEligibleForOffer({ requestId: request.id, plannedFrom: '2026-08-31', plannedUntilInclusive: '2026-09-01' })).rejects.toMatchObject({ code: 'FUNDING_NOT_ELIGIBLE' });
		await expect(documents.parentApprovedDownload({ actor: foreignParent, documentId: uploaded.documentId, requestId: 'foreign-download' })).rejects.toBeDefined();
		await expect(documents.parentApprovedDownload({ actor: parent, documentId: uploaded.documentId, requestId: 'owner-download' })).resolves.toMatchObject({ filename: expect.stringMatching(/^document-/u) });
		const archiveKey = [...store.values.keys()].find((key) => key.startsWith('archive/funding/'))!;
		await documents.cleanupExpired('2027-01-01T00:00:00.000Z');
		expect(store.values.has(archiveKey)).toBe(true);

		const replacement = await documents.upload({ actor: parent, payload: {
			requestId: request.id, authorizationId, replaceDocumentId: uploaded.documentId,
			idempotencyKey: 'replace-approved-document',
		}, file: pdfFile('replacement'), requestSubject: 'replacement-subject', requestId: 'replacement-upload' });
		const versions = await db.all<{ id: string; version: number; status: string; supersedes_authorization_id: string | null }>({
			sql: `SELECT id, version, status, supersedes_authorization_id FROM funding_authorizations
				WHERE request_id = ? ORDER BY version`, params: [request.id],
		});
		expect(versions.results).toEqual([
			expect.objectContaining({ id: authorizationId, version: 1, status: 'approved', supersedes_authorization_id: null }),
			expect.objectContaining({ version: 2, status: 'pending_review', supersedes_authorization_id: authorizationId }),
		]);
		const oldDocument = await db.first<{ review_status: string; replaced_by_document_id: string | null }>({ sql: `SELECT review_status, replaced_by_document_id FROM authorization_documents WHERE id = ?`, params: [uploaded.documentId] });
		expect(oldDocument).toEqual({ review_status: 'approved', replaced_by_document_id: null });
		expect(replacement.documentId).not.toBe(uploaded.documentId);

		clock = '2026-09-01T10:00:00.000Z';
		expect(await adminService.processExpiredAuthorizations(clock)).toMatchObject({ processed: 1 });
		expect(await adminService.processExpiredAuthorizations(clock)).toMatchObject({ processed: 0 });
		const expiry = await db.all<{ effective_on: string }>({ sql: `SELECT effective_on FROM funding_lifecycle_events WHERE authorization_id = ? AND event_kind = 'expired'`, params: [authorizationId] });
		expect(expiry.results).toEqual([{ effective_on: '2026-09-01' }]);
	});

	it('does not purge before exactly 14 days and retries cleanup idempotently', async () => {
		const request = await createNachhilfe('cleanup'); const authorizationId = request.authorizations[0].id;
		const uploaded = await documents.upload({ actor: parent, payload: { requestId: request.id, authorizationId, idempotencyKey: 'upload-cleanup' }, file: pdfFile('cleanup'), requestSubject: 'cleanup-subject', requestId: 'upload-cleanup' });
		const key = (await db.first<{ quarantine_r2_key: string }>({ sql: `SELECT quarantine_r2_key FROM authorization_documents WHERE id = ?`, params: [uploaded.documentId] }))!.quarantine_r2_key;
		await documents.deleteByParent({ actor: parent, payload: { documentId: uploaded.documentId, idempotencyKey: 'parent-delete-cleanup' }, requestId: 'parent-delete' });
		expect(store.values.has(key)).toBe(true);
		expect((await documents.cleanupExpired('2026-07-31T09:59:59.999Z')).deleted).toBe(0);
		expect(store.values.has(key)).toBe(true);
		expect((await documents.cleanupExpired('2026-07-31T10:00:00.000Z')).deleted).toBe(1);
		expect(store.values.has(key)).toBe(false);
		expect((await documents.cleanupExpired('2026-08-01T10:00:00.000Z')).deleted).toBe(0);
	});

	it('enforces configured count, rate-limit, and fail-closed storage boundaries', async () => {
		const request = await createNachhilfe('limits'); const authorizationId = request.authorizations[0].id;
		const limited = new AuthorizationDocumentService(documentRepository, store, { ...documentConfig, maxFilesPerAuthorization: 1 }, { consume: async () => undefined }, () => clock);
		await limited.upload({ actor: parent, payload: { requestId: request.id, authorizationId, idempotencyKey: 'limit-upload-one' }, file: pdfFile('one'), requestSubject: 'limit', requestId: 'limit-one' });
		await expect(limited.upload({ actor: parent, payload: { requestId: request.id, authorizationId, idempotencyKey: 'limit-upload-two' }, file: pdfFile('two'), requestSubject: 'limit', requestId: 'limit-two' })).rejects.toMatchObject({ code: 'DOCUMENT_AUTHORIZATION_LIMIT_REJECTED' });
		const rateLimited = new AuthorizationDocumentService(documentRepository, store, documentConfig, { consume: async () => { throw new Error('rate limited'); } }, () => clock);
		await expect(rateLimited.upload({ actor: parent, payload: { requestId: request.id, authorizationId, idempotencyKey: 'rate-limit-upload' }, file: pdfFile('rate'), requestSubject: 'rate', requestId: 'rate' })).rejects.toThrow('rate limited');
		const unavailable = new AuthorizationDocumentService(documentRepository, {
			put: async () => { throw new Error('storage unavailable'); }, get: async () => null,
			delete: async () => { throw new Error('storage unavailable'); },
		}, documentConfig, { consume: async () => undefined }, () => clock);
		await expect(unavailable.upload({ actor: parent, payload: { requestId: request.id, authorizationId, idempotencyKey: 'storage-unavailable-upload' }, file: pdfFile('unavailable'), requestSubject: 'unavailable', requestId: 'unavailable' })).rejects.toThrow('storage unavailable');
	});
});

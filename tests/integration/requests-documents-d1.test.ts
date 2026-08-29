import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import { ContractDocumentMutationGuard } from '$lib/server/contracts/boundaries';
import { DatabaseBoundary } from '$lib/server/db/database';
import { AuthorizationDocumentRepository } from '$lib/server/documents/document-repository';
import { AuthorizationDocumentService } from '$lib/server/documents/document-service';
import type { PrivateDocumentStore } from '$lib/server/documents/storage';
import { requireAdmin } from '$lib/server/security/authorization';
import { RequestAdminRepository } from '$lib/server/requests/admin-repository';
import { RequestAdminService } from '$lib/server/requests/admin-service';
import { IndividualRequestRepository } from '$lib/server/requests/request-repository';
import { IndividualRequestService } from '$lib/server/requests/request-service';
import { PrivacyRepository } from '$lib/server/privacy/privacy-repository';
import { PrivacyService } from '$lib/server/privacy/privacy-service';
import { StorageIntentRepository } from '$lib/server/operations/storage-intents';
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
	beforePut?: (key: string) => Promise<void>;
	beforeGet?: (key: string) => Promise<void>;
	async put(key: string, body: Uint8Array) {
		await this.beforePut?.(key);
		this.values.set(key, Uint8Array.from(body));
	}
	async get(key: string) {
		const value = this.values.get(key);
		if (!value) return null;
		const copy = Uint8Array.from(value);
		await this.beforeGet?.(key);
		return { body: copy.buffer, size: copy.byteLength };
	}
	async delete(key: string) { this.deletes.push(key); this.values.delete(key); }
}

function pdfFile(suffix = '') {
	const body = new TextEncoder().encode(`%PDF-1.7\n${suffix}\n%%EOF`);
	return { name: 'proof.pdf', type: 'application/pdf', size: body.byteLength, arrayBuffer: async () => body.buffer };
}

function exactSizePdfFile(size: number, suffix: string) {
	const prefix = new TextEncoder().encode(`%PDF-1.7\n${suffix}\n`);
	const trailer = new TextEncoder().encode('%%EOF');
	if (prefix.byteLength + trailer.byteLength > size) {
		throw new Error('Synthetic PDF size is too small.');
	}
	const body = new Uint8Array(size);
	body.fill(0x20);
	body.set(prefix);
	body.set(trailer, size - trailer.byteLength);
	return {
		name: 'proof.pdf',
		type: 'application/pdf',
		size: body.byteLength,
		arrayBuffer: async () => body.buffer,
	};
}

function createBarrier(parties: number): () => Promise<void> {
	let arrived = 0;
	let release!: () => void;
	const ready = new Promise<void>((resolve) => {
		release = resolve;
	});
	return async () => {
		arrived += 1;
		if (arrived === parties) release();
		await ready;
	};
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
	let privacyRepository: PrivacyRepository;
	let privacyService: PrivacyService;
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
		privacyRepository = new PrivacyRepository(db);
		privacyService = new PrivacyService(
			privacyRepository,
			store,
			{ exportTtlSeconds: 3600 },
			() => clock,
			store
		);
	});
	afterEach(async () => context.dispose());

	async function createNachhilfe(key: string) {
		const created = await requests.createDraft({ actor: parent, requestId: `req-${key}`, payload: {
			childId: 'child-request', requestKind: 'nachhilfe', fundingKind: 'jobcenter', subjects: 'Mathematik', description: '', preferredDays: ['MO'], preferredTimeWindows: [], preferredFormat: 'onsite', preferredLocations: [], idempotencyKey: `create-${key}`,
		} });
		return requests.loadOwnerRequest(parent, created.requestId);
	}

	async function createIndividual(key: string) {
		const created = await requests.createDraft({
			actor: parent,
			requestId: `req-${key}`,
			payload: {
				childId: 'child-request',
				requestKind: 'individual',
				fundingKind: 'self_pay',
				subjects: 'Deutsch',
				description: 'Ausgang',
				preferredDays: ['TU'],
				preferredTimeWindows: [],
				preferredFormat: 'online',
				preferredLocations: [],
				idempotencyKey: `create-${key}`,
			},
		});
		return requests.loadOwnerRequest(parent, created.requestId);
	}

	function contractGuardedDocuments() {
		return new AuthorizationDocumentService(
			new AuthorizationDocumentRepository(db, new ContractDocumentMutationGuard()),
			store,
			documentConfig,
			{ consume: async () => undefined },
			() => clock
		);
	}

	async function prepareDownloadedDocument(key: string) {
		const request = await createNachhilfe(key);
		const authorizationId = request.authorizations[0].id;
		const uploaded = await documents.upload({
			actor: parent,
			payload: {
				requestId: request.id,
				authorizationId,
				idempotencyKey: `upload-${key}`,
			},
			file: pdfFile(key),
			requestSubject: `subject-${key}`,
			requestId: `upload-${key}`,
		});
		await requests.submit({
			actor: parent,
			payload: {
				requestId: request.id,
				expectedVersion: request.version,
				idempotencyKey: `submit-${key}`,
			},
			requestId: `submit-${key}`,
		});
		await documents.adminQuarantineDownload({
			actor: admin,
			documentId: uploaded.documentId,
			purpose: 'local_av_scan',
			requestId: `download-${key}`,
		});
		const internal = await db.first<{ sha256: string; quarantine_r2_key: string }>({
			sql: `SELECT sha256, quarantine_r2_key
				FROM authorization_documents WHERE id = ?`,
			params: [uploaded.documentId],
		});
		return {
			requestId: request.id,
			authorizationId,
			documentId: uploaded.documentId,
			sha256: internal!.sha256,
			quarantineKey: internal!.quarantine_r2_key,
		};
	}

	async function attestClean(
		item: Awaited<ReturnType<typeof prepareDownloadedDocument>>,
		key: string
	) {
		await adminService.attestDocument({
			actor: admin,
			payload: {
				documentId: item.documentId,
				documentSha256: item.sha256,
				outcome: 'clean',
				scannerLabel: 'Test AV',
				scannerVersion: '1',
				attestationTextVersion: 'manual-local-av-v1',
				confirmation: 'confirmed',
				idempotencyKey: `attest-${key}`,
			},
			requestId: `attest-${key}`,
		});
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
		await expect(requests.submit({
			actor: foreignParent,
			payload: {
				requestId: request.id,
				expectedVersion: request.version,
				idempotencyKey: 'foreign-request-submit-key',
			},
			requestId: 'foreign-request-submit',
		})).rejects.toMatchObject({ code: 'REQUEST_NOT_FOUND' });
		const uploaded = await documents.upload({
			actor: parent,
			payload: {
				requestId: request.id,
				authorizationId: request.authorizations[0].id,
				idempotencyKey: 'owner-scope-upload-key',
			},
			file: pdfFile('owner-scope'),
			requestSubject: 'owner-scope-subject',
			requestId: 'owner-scope-upload',
		});
		const carrierRequest = await createNachhilfe('owner-scope-carrier');
		const guardedDocuments = contractGuardedDocuments();
		await expect(guardedDocuments.deleteByParent({
			actor: parent,
			payload: {
				requestId: carrierRequest.id,
				documentId: uploaded.documentId,
				idempotencyKey: 'mismatched-document-carrier-key',
			},
			requestId: 'mismatched-document-carrier',
		})).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
		expect(await db.first<{ review_status: string }>({
			sql: `SELECT review_status FROM authorization_documents WHERE id = ?`,
			params: [uploaded.documentId],
		})).toEqual({ review_status: 'quarantined' });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM audit_events WHERE request_id = ?`,
			params: ['mismatched-document-carrier'],
		})).toEqual({ count: 0 });
		await expect(guardedDocuments.deleteByParent({
			actor: foreignParent,
			payload: {
				requestId: request.id,
				documentId: uploaded.documentId,
				idempotencyKey: 'foreign-document-delete-key',
			},
			requestId: 'foreign-document-delete',
		})).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
	});

	it('requires a document on submit and treats repeated submission keys idempotently', async () => {
		const request = await createNachhilfe('needs-doc');
		const first = await requests.submit({ actor: parent, payload: { requestId: request.id, expectedVersion: request.version, idempotencyKey: 'submit-needs-document' }, requestId: 'submit-1' });
		expect(first).toMatchObject({ status: 'needs_documents', replayed: false });
		const replay = await requests.submit({ actor: parent, payload: { requestId: request.id, expectedVersion: request.version, idempotencyKey: 'submit-needs-document' }, requestId: 'submit-2' });
		expect(replay).toMatchObject({ status: 'needs_documents', replayed: true });
		expect(await db.first<{ count: number }>({ sql: `SELECT COUNT(*) AS count FROM email_outbox
			WHERE source_id = ? AND template_or_category = 'request.needs_info'`, params: [request.id] }))
			.toEqual({ count: 1 });
	});

	it('replays an exact individual submit after pending admin review without leaking across owners', async () => {
		const request = await createIndividual('submit-pending-replay');
		const payload = {
			requestId: request.id,
			expectedVersion: request.version,
			idempotencyKey: 'submit-pending-replay',
		};

		expect(
			await requests.submit({
				actor: parent,
				payload,
				requestId: 'submit-pending-replay-first',
			})
		).toEqual({ status: 'pending_admin_review', replayed: false });
		await expect(
			requests.submit({
				actor: foreignParent,
				payload,
				requestId: 'submit-pending-replay-foreign',
			})
		).rejects.toMatchObject({ code: 'REQUEST_NOT_FOUND' });
		await expect(
			requests.submit({
				actor: parent,
				payload: { ...payload, idempotencyKey: 'submit-pending-new-key' },
				requestId: 'submit-pending-replay-new-key',
			})
		).rejects.toMatchObject({ code: 'REQUEST_SUBMISSION_REJECTED' });
		expect(
			await requests.submit({
				actor: parent,
				payload,
				requestId: 'submit-pending-replay-second',
			})
		).toEqual({ status: 'pending_admin_review', replayed: true });

		expect(
			await db.first<{ status: string; version: number }>({
				sql: `SELECT status, version FROM individual_requests WHERE id = ?`,
				params: [request.id],
			})
		).toEqual({ status: 'pending_admin_review', version: 2 });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM request_parent_actions
				WHERE request_id = ? AND action = 'submit'`,
				params: [request.id],
			})
		).toEqual({ count: 1 });
	});

	it('replays an exact cancellation after cancelled and rejects a changed command hash first', async () => {
		const request = await createIndividual('cancel-replay');
		const payload = {
			requestId: request.id,
			expectedVersion: request.version,
			idempotencyKey: 'cancel-exact-replay',
		};

		expect(
			await requests.cancel({
				actor: parent,
				payload,
				requestId: 'cancel-exact-replay-first',
			})
		).toEqual({ status: 'cancelled', replayed: false });
		await expect(
			requests.cancel({
				actor: parent,
				payload: { ...payload, expectedVersion: request.version + 1 },
				requestId: 'cancel-exact-replay-changed',
			})
		).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
		await expect(
			requests.cancel({
				actor: parent,
				payload: { ...payload, idempotencyKey: 'cancel-new-key-after-terminal' },
				requestId: 'cancel-exact-replay-new-key',
			})
		).rejects.toMatchObject({ code: 'REQUEST_CANCELLATION_REJECTED' });
		expect(
			await requests.cancel({
				actor: parent,
				payload,
				requestId: 'cancel-exact-replay-second',
			})
		).toEqual({ status: 'cancelled', replayed: true });

		expect(
			await db.first<{ status: string; version: number }>({
				sql: `SELECT status, version FROM individual_requests WHERE id = ?`,
				params: [request.id],
			})
		).toEqual({ status: 'cancelled', version: 2 });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM request_parent_actions
				WHERE request_id = ? AND action = 'cancel'`,
				params: [request.id],
			})
		).toEqual({ count: 1 });
	});

	it('replays an exact save after submit and binds the key to its route request', async () => {
		const request = await createIndividual('save-after-submit');
		const otherRequest = await createIndividual('save-other-carrier');
		const savePayload = {
			requestId: request.id,
			expectedVersion: request.version,
			childId: 'child-request',
			requestKind: 'individual' as const,
			fundingKind: 'self_pay' as const,
			subjects: 'Deutsch Intensiv',
			description: 'Nachmittag',
			preferredDays: ['TU'],
			preferredTimeWindows: [],
			preferredFormat: 'online' as const,
			preferredLocations: ['Online'],
			idempotencyKey: 'save-after-submit-replay',
		};

		expect(
			await requests.save({
				actor: parent,
				payload: savePayload,
				requestId: 'save-after-submit-first',
			})
		).toEqual({ status: 'draft', replayed: false });
		const saved = await requests.loadOwnerRequest(parent, request.id);
		expect(
			await requests.submit({
				actor: parent,
				payload: {
					requestId: request.id,
					expectedVersion: saved.version,
					idempotencyKey: 'submit-after-save',
				},
				requestId: 'submit-after-save',
			})
		).toEqual({ status: 'pending_admin_review', replayed: false });
		await expect(
			requests.save({
				actor: parent,
				payload: { ...savePayload, idempotencyKey: 'save-after-submit-new-key' },
				requestId: 'save-after-submit-new-key',
			})
		).rejects.toMatchObject({ code: 'REQUEST_NOT_EDITABLE' });
		expect(
			await requests.save({
				actor: parent,
				payload: savePayload,
				requestId: 'save-after-submit-second',
			})
		).toEqual({ status: 'draft', replayed: true });
		await expect(
			requests.save({
				actor: parent,
				payload: {
					...savePayload,
					requestId: otherRequest.id,
					expectedVersion: otherRequest.version,
				},
				requestId: 'save-other-carrier',
			})
		).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

		expect(
			await db.first<{ status: string; version: number; subjects_raw: string }>({
				sql: `SELECT status, version, subjects_raw FROM individual_requests WHERE id = ?`,
				params: [request.id],
			})
		).toEqual({ status: 'pending_admin_review', version: 3, subjects_raw: 'Deutsch Intensiv' });
		expect(
			await db.first<{ status: string; version: number; subjects_raw: string }>({
				sql: `SELECT status, version, subjects_raw FROM individual_requests WHERE id = ?`,
				params: [otherRequest.id],
			})
		).toEqual({ status: 'draft', version: 1, subjects_raw: 'Deutsch' });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM request_parent_actions
				WHERE request_id = ? AND action = 'save'`,
				params: [request.id],
			})
		).toEqual({ count: 1 });
	});

	it('removes a closed owner document from the ordinary admin queue', async () => {
		const request = await createNachhilfe('closed-admin-queue');
		const uploaded = await documents.upload({
			actor: parent,
			payload: {
				requestId: request.id,
				authorizationId: request.authorizations[0].id,
				idempotencyKey: 'upload-closed-admin-queue',
			},
			file: pdfFile('closed-admin-queue'),
			requestSubject: 'closed-admin-queue-subject',
			requestId: 'upload-closed-admin-queue',
		});
		expect(
			await documentRepository.listAdminDocuments({ q: uploaded.documentId, status: '' })
		).toHaveLength(1);
		await db.run({
			sql: `UPDATE users SET account_status = 'deletion_requested', updated_at = ?
				WHERE id = ?`,
			params: [clock, parent.id],
		});
		expect(
			await documentRepository.listAdminDocuments({ q: uploaded.documentId, status: '' })
		).toHaveLength(1);
		await db.run({
			sql: `UPDATE users SET account_status = 'active', updated_at = ? WHERE id = ?`,
			params: [clock, parent.id],
		});

		const deletion = await privacyService.requestDeletion({
			actor: parent,
			idempotencyKey: 'delete-closed-admin-queue',
			requestId: 'delete-closed-admin-queue',
		});
		expect(deletion.status).toBe('requested');
		expect(
			await privacyService.processDeletion({
				admin,
				privacyRequestId: deletion.requestId,
				reason: 'Synthetic closed-owner admin queue check.',
				idempotencyKey: 'process-closed-admin-queue',
				requestId: 'process-closed-admin-queue',
			})
		).toMatchObject({ status: 'completed_with_retained_evidence' });
		expect(
			await documentRepository.listAdminDocuments({ q: uploaded.documentId, status: '' })
		).toEqual([]);
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
		await expect(documents.adminQuarantineDownload({ actor: admin, documentId: uploaded.documentId,
			purpose: 'unstructured-free-text', requestId: 'admin-download-invalid-purpose' }))
			.rejects.toMatchObject({ code: 'INVALID_DOWNLOAD_PURPOSE' });
		store.beforeGet = async () => {
			store.beforeGet = undefined;
			await db.run({ sql: `UPDATE users SET is_blocked = 1 WHERE id = ?`, params: [parent.id] });
		};
		await expect(documents.adminQuarantineDownload({ actor: admin, documentId: uploaded.documentId,
			purpose: 'local_av_scan', requestId: 'admin-download-owner-race' }))
			.rejects.toMatchObject({ code: 'DOCUMENT_DOWNLOAD_REJECTED' });
		expect(await db.first<{ count: number }>({ sql: `SELECT COUNT(*) AS count FROM audit_events
			WHERE request_id = 'admin-download-owner-race'` })).toEqual({ count: 0 });
		expect(await db.first<{ quarantine_downloaded_at: string | null }>({
			sql: `SELECT quarantine_downloaded_at FROM authorization_documents WHERE id = ?`,
			params: [uploaded.documentId],
		})).toEqual({ quarantine_downloaded_at: null });
		await db.run({ sql: `UPDATE users SET is_blocked = 0 WHERE id = ?`, params: [parent.id] });
		await documents.adminQuarantineDownload({ actor: admin, documentId: uploaded.documentId,
			purpose: 'local_av_scan', requestId: 'admin-download' });
		const downloadAudit = await db.first<{ safe_diff_json: string }>({
			sql: `SELECT safe_diff_json FROM audit_events WHERE request_id = 'admin-download'`,
		});
		expect(JSON.parse(downloadAudit!.safe_diff_json)).toMatchObject({
			forcedAttachment: true, purposeCode: 'local_av_scan',
		});
		const internal = await db.first<{ sha256: string }>({ sql: `SELECT sha256 FROM authorization_documents WHERE id = ?`, params: [uploaded.documentId] });
		await adminService.attestDocument({ actor: admin, payload: { documentId: uploaded.documentId, documentSha256: internal!.sha256, outcome: 'clean', scannerLabel: 'Test AV', scannerVersion: '1', attestationTextVersion: 'manual-local-av-v1', confirmation: 'confirmed', idempotencyKey: 'attest-after-download' }, requestId: 'attest-after' });
		await adminService.reviewDocument({ actor: admin, payload: { documentId: uploaded.documentId, decision: 'approve', reason: 'Lesbar und zutreffend', confirmation: 'confirmed', idempotencyKey: 'approve-document' }, requestId: 'approve-document' });
		expect([...store.values.keys()].some((key) => key.startsWith('archive/funding/'))).toBe(true);
		await adminService.reviewAuthorization({ actor: admin, payload: { authorizationId, action: 'approve', kind: 'jobcenter', validFrom: '2026-08-01', validUntil: '2026-08-31', reason: 'Bescheid geprüft', confirmation: 'confirmed', idempotencyKey: 'approve-authorization' }, requestId: 'approve-authorization' });
		await adminService.transitionRequest({ actor: admin, payload: { requestId: request.id, action: 'approve', reason: 'Förderung vollständig', confirmation: 'confirmed', idempotencyKey: 'approve-request' }, requestId: 'approve-request' });
		expect(await db.first<{ count: number }>({ sql: `SELECT COUNT(*) AS count FROM email_outbox
			WHERE source_id = ? AND template_or_category IN ('request.received', 'request.decision')`,
			params: [request.id] })).toEqual({ count: 2 });
		await expect(adminRepository.assertEligibleForOffer({ requestId: request.id, plannedFrom: '2026-08-01', plannedUntilInclusive: '2026-08-31' })).resolves.toBeUndefined();
		await expect(adminRepository.assertEligibleForOffer({ requestId: request.id, plannedFrom: '2026-08-31', plannedUntilInclusive: '2026-09-01' })).rejects.toMatchObject({ code: 'FUNDING_NOT_ELIGIBLE' });
		await expect(documents.parentApprovedDownload({ actor: foreignParent,
			documentId: uploaded.documentId, requestId: 'foreign-download' }))
			.rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
		await expect(documents.parentApprovedDownload({ actor: parent, documentId: uploaded.documentId, requestId: 'owner-download' })).resolves.toMatchObject({ filename: expect.stringMatching(/^document-/u) });
		store.beforeGet = async () => {
			store.beforeGet = undefined;
			await db.run({ sql: `UPDATE users SET is_blocked = 1 WHERE id = ?`, params: [parent.id] });
		};
		await expect(documents.parentApprovedDownload({ actor: parent,
			documentId: uploaded.documentId, requestId: 'owner-download-race' }))
			.rejects.toMatchObject({ code: 'DOCUMENT_DOWNLOAD_REJECTED' });
		expect(await db.first<{ count: number }>({ sql: `SELECT COUNT(*) AS count FROM audit_events
			WHERE request_id = 'owner-download-race'` })).toEqual({ count: 0 });
		await db.run({ sql: `UPDATE users SET is_blocked = 0 WHERE id = ?`, params: [parent.id] });
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

	it('keeps closure inventory and retained funding evidence consistent when review wins first', async () => {
		const item = await prepareDownloadedDocument('review-before-closure');
		await attestClean(item, 'review-before-closure');
		let privacyRequestId = '';
		store.beforeGet = async (key) => {
			if (key !== item.quarantineKey) return;
			store.beforeGet = undefined;
			const requested = await privacyService.requestDeletion({
				actor: parent,
				idempotencyKey: 'delete-review-before-closure',
				requestId: 'delete-review-before-closure',
			});
			privacyRequestId = requested.requestId;
		};

		await adminService.reviewDocument({
			actor: admin,
			payload: {
				documentId: item.documentId,
				decision: 'approve',
				reason: 'Lesbar und zutreffend',
				confirmation: 'confirmed',
				idempotencyKey: 'review-before-closure',
			},
			requestId: 'review-before-closure',
		});
		expect(privacyRequestId).not.toBe('');
		await adminService.reviewAuthorization({
			actor: admin,
			payload: {
				authorizationId: item.authorizationId,
				action: 'approve',
				kind: 'jobcenter',
				validFrom: '2026-08-01',
				validUntil: '2026-08-31',
				reason: 'Bescheid geprüft',
				confirmation: 'confirmed',
				idempotencyKey: 'authorization-before-closure',
			},
			requestId: 'authorization-before-closure',
		});
		const approved = await db.first<{ archive_r2_key: string; review_status: string }>({
			sql: `SELECT archive_r2_key, review_status
				FROM authorization_documents WHERE id = ?`,
			params: [item.documentId],
		});
		expect(approved?.review_status).toBe('approved');
		expect(store.values.has(approved!.archive_r2_key)).toBe(true);

		const closure = await privacyService.processDeletion({
			admin,
			privacyRequestId,
			reason: 'Verified deletion request and retained funding evidence.',
			idempotencyKey: 'close-after-review',
			requestId: 'close-after-review',
		});
		expect(closure.status).toBe('completed_with_retained_evidence');
		const retained = await db.all<{
			target_kind: string;
			target_id: string;
			private_r2_key: string | null;
			purge_status: string;
		}>({
			sql: `SELECT archive.target_kind, archive.target_id, archive.private_r2_key,
				control.purge_status
			FROM legal_archive_records AS archive
			JOIN retention_controls AS control ON control.id = archive.retention_control_id
			WHERE archive.privacy_request_id = ?
			ORDER BY archive.target_kind, archive.target_id`,
			params: [privacyRequestId],
		});
		expect(retained.results).toEqual([
			{
				target_kind: 'authorization_document',
				target_id: item.documentId,
				private_r2_key: approved!.archive_r2_key,
				purge_status: 'disabled_by_policy',
			},
			{
				target_kind: 'funding_authorization',
				target_id: item.authorizationId,
				private_r2_key: null,
				purge_status: 'disabled_by_policy',
			},
		]);
		expect(await db.first<{ retained_record_count: number; actual_count: number }>({
			sql: `SELECT result.retained_record_count,
				(SELECT COUNT(*) FROM legal_archive_records AS archive
					WHERE archive.privacy_request_id = result.privacy_request_id) AS actual_count
			FROM privacy_closure_results AS result WHERE result.privacy_request_id = ?`,
			params: [privacyRequestId],
		})).toEqual({ retained_record_count: 2, actual_count: 2 });
		expect(store.values.has(approved!.archive_r2_key)).toBe(true);
	});

	it('lets closure win during R2 review and rejects all late funding review evidence', async () => {
		const clean = await prepareDownloadedDocument('closure-before-review');
		await attestClean(clean, 'closure-before-review');
		const quarantined = await prepareDownloadedDocument('closure-before-attestation');
		const requested = await privacyService.requestDeletion({
			actor: parent,
			idempotencyKey: 'delete-before-review',
			requestId: 'delete-before-review',
		});
		let closureStatus = '';
		store.beforeGet = async (key) => {
			if (key !== clean.quarantineKey) return;
			store.beforeGet = undefined;
			const closure = await privacyService.processDeletion({
				admin,
				privacyRequestId: requested.requestId,
				reason: 'Verified deletion request before pending admin review.',
				idempotencyKey: 'close-before-review',
				requestId: 'close-before-review',
			});
			closureStatus = closure.status;
		};

		await expect(adminService.reviewDocument({
			actor: admin,
			payload: {
				documentId: clean.documentId,
				decision: 'approve',
				reason: 'Late approval must lose to closure',
				confirmation: 'confirmed',
				idempotencyKey: 'late-document-review',
			},
			requestId: 'late-document-review',
		})).rejects.toBeDefined();
		expect(closureStatus).toBe('completed_with_retained_evidence');
		await expect(adminService.attestDocument({
			actor: admin,
			payload: {
				documentId: quarantined.documentId,
				documentSha256: quarantined.sha256,
				outcome: 'clean',
				scannerLabel: 'Test AV',
				scannerVersion: '1',
				attestationTextVersion: 'manual-local-av-v1',
				confirmation: 'confirmed',
				idempotencyKey: 'late-document-attestation',
			},
			requestId: 'late-document-attestation',
		})).rejects.toBeDefined();
		await expect(adminService.reviewAuthorization({
			actor: admin,
			payload: {
				authorizationId: clean.authorizationId,
				action: 'approve',
				kind: 'jobcenter',
				validFrom: '2026-08-01',
				validUntil: '2026-08-31',
				reason: 'Late authorization review must lose to closure',
				confirmation: 'confirmed',
				idempotencyKey: 'late-authorization-review',
			},
			requestId: 'late-authorization-review',
		})).rejects.toMatchObject({ code: 'AUTHORIZATION_TRANSITION_REJECTED' });

		expect(await db.first<{ archive_r2_key: string | null; review_status: string }>({
			sql: `SELECT archive_r2_key, review_status
				FROM authorization_documents WHERE id = ?`,
			params: [clean.documentId],
		})).toEqual({ archive_r2_key: null, review_status: 'clean' });
		expect([...store.values.keys()].filter((key) => key.startsWith('archive/funding/')))
			.toEqual([]);
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM document_scan_attestations
				WHERE document_id = ?`,
			params: [quarantined.documentId],
		})).toEqual({ count: 0 });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM audit_events
				WHERE request_id IN ('late-document-review', 'late-document-attestation',
					'late-authorization-review')`,
		})).toEqual({ count: 0 });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM legal_archive_records
				WHERE target_id IN (?, ?, ?, ?)`,
			params: [clean.documentId, clean.authorizationId,
				quarantined.documentId, quarantined.authorizationId],
		})).toEqual({ count: 0 });
		expect(await db.first<{ retained_record_count: number }>({
			sql: `SELECT retained_record_count FROM privacy_closure_results
				WHERE privacy_request_id = ?`,
			params: [requested.requestId],
		})).toEqual({ retained_record_count: 0 });
	});

	it('does not purge before exactly 14 days and retries cleanup idempotently', async () => {
		const request = await createNachhilfe('cleanup'); const authorizationId = request.authorizations[0].id;
		const uploaded = await documents.upload({ actor: parent, payload: { requestId: request.id, authorizationId, idempotencyKey: 'upload-cleanup' }, file: pdfFile('cleanup'), requestSubject: 'cleanup-subject', requestId: 'upload-cleanup' });
		const key = (await db.first<{ quarantine_r2_key: string }>({ sql: `SELECT quarantine_r2_key FROM authorization_documents WHERE id = ?`, params: [uploaded.documentId] }))!.quarantine_r2_key;
		await contractGuardedDocuments().deleteByParent({ actor: parent, payload: { requestId: request.id, documentId: uploaded.documentId, idempotencyKey: 'parent-delete-cleanup' }, requestId: 'parent-delete' });
		expect(store.values.has(key)).toBe(true);
		expect((await documents.cleanupExpired('2026-07-31T09:59:59.999Z')).deleted).toBe(0);
		expect(store.values.has(key)).toBe(true);
		expect((await documents.cleanupExpired('2026-07-31T10:00:00.000Z')).deleted).toBe(1);
		expect(store.values.has(key)).toBe(false);
		expect((await documents.cleanupExpired('2026-08-01T10:00:00.000Z')).deleted).toBe(0);
	});

	it('rejects stale parent request and document access after role promotion', async () => {
		const request = await createNachhilfe('stale-parent-role');
		const uploaded = await documents.upload({
			actor: parent,
			payload: {
				requestId: request.id,
				authorizationId: request.authorizations[0].id,
				idempotencyKey: 'stale-parent-role-upload',
			},
			file: pdfFile('stale-parent-role'),
			requestSubject: 'stale-parent-role',
			requestId: 'stale-parent-role-upload',
		});
		await db.run({
			sql: `UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?`,
			params: [clock, parent.id],
		});

		await expect(requests.loadOwnerRequest(parent, request.id))
			.rejects.toMatchObject({ code: 'REQUEST_NOT_FOUND' });
		await expect(documents.deleteByParent({
			actor: parent,
			payload: {
				requestId: request.id,
				documentId: uploaded.documentId,
				idempotencyKey: 'stale-parent-role-delete',
			},
			requestId: 'stale-parent-role-delete',
		})).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
		expect(await db.first<{ review_status: string }>({
			sql: `SELECT review_status FROM authorization_documents WHERE id = ?`,
			params: [uploaded.documentId],
		})).toEqual({ review_status: 'quarantined' });
	});

	it('atomically enforces a configured one-file limit across concurrent uploads', async () => {
		const request = await createNachhilfe('concurrent-count-limit');
		const authorizationId = request.authorizations[0].id;
		const storageIntents = new StorageIntentRepository(db);
		const concurrentStore = new MemoryStore();
		concurrentStore.beforePut = createBarrier(2);
		const limited = new AuthorizationDocumentService(
			documentRepository,
			concurrentStore,
			{ ...documentConfig, maxFilesPerAuthorization: 1 },
			{ consume: async () => undefined },
			() => clock,
			storageIntents
		);

		const results = await Promise.allSettled([
			limited.upload({
				actor: parent,
				payload: {
					requestId: request.id,
					authorizationId,
					idempotencyKey: 'concurrent-count-one',
				},
				file: pdfFile('concurrent-count-one'),
				requestSubject: 'concurrent-count',
				requestId: 'concurrent-count-one',
			}),
			limited.upload({
				actor: parent,
				payload: {
					requestId: request.id,
					authorizationId,
					idempotencyKey: 'concurrent-count-two',
				},
				file: pdfFile('concurrent-count-two'),
				requestSubject: 'concurrent-count',
				requestId: 'concurrent-count-two',
			}),
		]);

		const fulfilled = results.filter((result) => result.status === 'fulfilled');
		const rejected = results.filter((result) => result.status === 'rejected');
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0]).toMatchObject({
			status: 'rejected',
			reason: { code: 'DOCUMENT_AUTHORIZATION_LIMIT_REJECTED' },
		});
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM authorization_documents
				WHERE authorization_id = ? AND deleted_at IS NULL
					AND replaced_by_document_id IS NULL`,
			params: [authorizationId],
		})).toEqual({ count: 1 });
		expect((await db.all<{ status: string; count: number }>({
			sql: `SELECT status, COUNT(*) AS count FROM storage_object_intents
				WHERE object_kind = 'authorization_document_upload'
				GROUP BY status ORDER BY status`,
		})).results).toEqual([
			{ status: 'linked', count: 1 },
			{ status: 'staged', count: 1 },
		]);
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM storage_intent_link_assertions
				WHERE target_kind = 'authorization_document'`,
		})).toEqual({ count: 1 });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM audit_events
				WHERE action = 'authorization_document.uploaded'
					AND request_id IN ('concurrent-count-one', 'concurrent-count-two')`,
		})).toEqual({ count: 1 });
		expect(concurrentStore.values.size).toBe(2);
		expect(concurrentStore.deletes).toEqual([]);
		expect(await storageIntents.claimCleanup({
			now: '2026-07-17T10:14:59.999Z',
			stagedBefore: '2026-07-17T09:59:59.999Z',
			leaseOwner: 'concurrent-count-too-early',
			leaseUntil: '2026-07-17T10:19:59.999Z',
			limit: 10,
		})).toEqual([]);
		const countCleanupNow = '2026-07-17T10:15:00.000Z';
		expect(await storageIntents.reconcileLinked(countCleanupNow, 10)).toBe(0);
		const countClaimed = await storageIntents.claimCleanup({
			now: countCleanupNow,
			stagedBefore: clock,
			leaseOwner: 'concurrent-count-cleanup',
			leaseUntil: '2026-07-17T10:20:00.000Z',
			limit: 10,
		});
		expect(countClaimed).toHaveLength(1);
		await concurrentStore.delete(countClaimed[0].object_key);
		expect(await storageIntents.completeDelete(
			countClaimed[0].id,
			countClaimed[0].generation,
			'concurrent-count-cleanup',
			countCleanupNow
		)).toBe(true);
		expect(concurrentStore.values.size).toBe(1);
		expect((await db.all<{ status: string; count: number }>({
			sql: `SELECT status, COUNT(*) AS count FROM storage_object_intents
				WHERE object_kind = 'authorization_document_upload'
				GROUP BY status ORDER BY status`,
		})).results).toEqual([
			{ status: 'deleted', count: 1 },
			{ status: 'linked', count: 1 },
		]);
	});

	it('atomically enforces the exact configured aggregate-byte boundary', async () => {
		const request = await createNachhilfe('concurrent-byte-limit');
		const authorizationId = request.authorizations[0].id;
		const exactLimitBytes = 64;
		const storageIntents = new StorageIntentRepository(db);
		const concurrentStore = new MemoryStore();
		concurrentStore.beforePut = createBarrier(2);
		const limited = new AuthorizationDocumentService(
			documentRepository,
			concurrentStore,
			{ ...documentConfig, maxAuthorizationBytes: exactLimitBytes },
			{ consume: async () => undefined },
			() => clock,
			storageIntents
		);

		const results = await Promise.allSettled([
			limited.upload({
				actor: parent,
				payload: {
					requestId: request.id,
					authorizationId,
					idempotencyKey: 'concurrent-bytes-one',
				},
				file: exactSizePdfFile(exactLimitBytes, 'one'),
				requestSubject: 'concurrent-bytes',
				requestId: 'concurrent-bytes-one',
			}),
			limited.upload({
				actor: parent,
				payload: {
					requestId: request.id,
					authorizationId,
					idempotencyKey: 'concurrent-bytes-two',
				},
				file: exactSizePdfFile(exactLimitBytes, 'two'),
				requestSubject: 'concurrent-bytes',
				requestId: 'concurrent-bytes-two',
			}),
		]);

		const fulfilled = results.filter((result) => result.status === 'fulfilled');
		const rejected = results.filter((result) => result.status === 'rejected');
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0]).toMatchObject({
			status: 'rejected',
			reason: { code: 'DOCUMENT_AUTHORIZATION_LIMIT_REJECTED' },
		});
		expect(await db.first<{ count: number; bytes: number }>({
			sql: `SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
				FROM authorization_documents WHERE authorization_id = ?
					AND deleted_at IS NULL AND replaced_by_document_id IS NULL`,
			params: [authorizationId],
		})).toEqual({ count: 1, bytes: exactLimitBytes });
		expect((await db.all<{ status: string; count: number }>({
			sql: `SELECT status, COUNT(*) AS count FROM storage_object_intents
				WHERE object_kind = 'authorization_document_upload'
				GROUP BY status ORDER BY status`,
		})).results).toEqual([
			{ status: 'linked', count: 1 },
			{ status: 'staged', count: 1 },
		]);
		expect(concurrentStore.values.size).toBe(2);
		expect(concurrentStore.deletes).toEqual([]);
		const byteCleanupNow = '2026-07-17T10:15:00.000Z';
		expect(await storageIntents.reconcileLinked(byteCleanupNow, 10)).toBe(0);
		const byteClaimed = await storageIntents.claimCleanup({
			now: byteCleanupNow,
			stagedBefore: clock,
			leaseOwner: 'concurrent-bytes-cleanup',
			leaseUntil: '2026-07-17T10:20:00.000Z',
			limit: 10,
		});
		expect(byteClaimed).toHaveLength(1);
		await concurrentStore.delete(byteClaimed[0].object_key);
		expect(await storageIntents.completeDelete(
			byteClaimed[0].id,
			byteClaimed[0].generation,
			'concurrent-bytes-cleanup',
			byteCleanupNow
		)).toBe(true);
		expect(concurrentStore.values.size).toBe(1);
	});

	it('returns an exact committed replay even when the configured count limit is exhausted', async () => {
		const request = await createNachhilfe('limit-exhausted-replay');
		const authorizationId = request.authorizations[0].id;
		const replayStore = new MemoryStore();
		const storageIntents = new StorageIntentRepository(db);
		const limited = new AuthorizationDocumentService(
			documentRepository,
			replayStore,
			{ ...documentConfig, maxFilesPerAuthorization: 1 },
			{ consume: async () => undefined },
			() => clock,
			storageIntents
		);
		const payload = {
			requestId: request.id,
			authorizationId,
			idempotencyKey: 'limit-exhausted-replay',
		};
		const uploadFile = pdfFile('limit-exhausted-replay');

		const first = await limited.upload({
			actor: parent,
			payload,
			file: uploadFile,
			requestSubject: 'limit-exhausted-replay',
			requestId: 'limit-exhausted-replay-first',
		});
		expect(await documentRepository.loadUploadTarget({
			userId: parent.id,
			requestId: request.id,
			authorizationId,
		})).toMatchObject({ currentCount: 1 });

		await expect(limited.upload({
			actor: parent,
			payload,
			file: uploadFile,
			requestSubject: 'limit-exhausted-replay',
			requestId: 'limit-exhausted-replay-second',
		})).resolves.toEqual({ documentId: first.documentId, replayed: true });
		expect(replayStore.values.size).toBe(1);
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM authorization_documents
				WHERE authorization_id = ?`,
			params: [authorizationId],
		})).toEqual({ count: 1 });
	});

	it('keeps the committed object and linked intent after an ambiguous D1 response', async () => {
		const request = await createNachhilfe('ambiguous-upload-commit');
		const authorizationId = request.authorizations[0].id;
		const storageIntents = new StorageIntentRepository(db);
		class AmbiguousCommitRepository extends AuthorizationDocumentRepository {
			override async persistUpload(
				input: Parameters<AuthorizationDocumentRepository['persistUpload']>[0]
			) {
				await super.persistUpload(input);
				throw new Error('synthetic ambiguous D1 response after commit');
			}
		}
		const ambiguousRepository = new AmbiguousCommitRepository(db);
		const ambiguousStore = new MemoryStore();
		const ambiguousDocuments = new AuthorizationDocumentService(
			ambiguousRepository,
			ambiguousStore,
			documentConfig,
			{ consume: async () => undefined },
			() => clock,
			storageIntents
		);

		const result = await ambiguousDocuments.upload({
			actor: parent,
			payload: {
				requestId: request.id,
				authorizationId,
				idempotencyKey: 'ambiguous-upload-commit',
			},
			file: pdfFile('ambiguous-upload-commit'),
			requestSubject: 'ambiguous-upload-commit',
			requestId: 'ambiguous-upload-commit',
		});

		expect(result).toMatchObject({ replayed: true });
		expect(await db.first<{ status: string; object_key: string }>({
			sql: `SELECT intent.status, intent.object_key FROM storage_object_intents intent
				JOIN authorization_documents document
					ON document.quarantine_r2_key = intent.object_key
				WHERE document.id = ?`,
			params: [result.documentId],
		})).toMatchObject({ status: 'linked' });
		expect(ambiguousStore.values.size).toBe(1);
		expect(ambiguousStore.deletes).toEqual([]);
	});

	it('preserves a committed object and linked intent when the replay verification read fails', async () => {
		const request = await createNachhilfe('ambiguous-upload-replay-read');
		const authorizationId = request.authorizations[0].id;
		const storageIntents = new StorageIntentRepository(db);
		class AmbiguousCommitAndReplayRepository extends AuthorizationDocumentRepository {
			private replayReads = 0;

			override async findUploadReplay(userId: string, idempotencyKey: string) {
				this.replayReads += 1;
				if (this.replayReads === 2) {
					throw new Error('synthetic transient replay verification failure');
				}
				return super.findUploadReplay(userId, idempotencyKey);
			}

			override async persistUpload(
				input: Parameters<AuthorizationDocumentRepository['persistUpload']>[0]
			) {
				await super.persistUpload(input);
				throw new Error('synthetic ambiguous D1 response after commit');
			}
		}
		const repository = new AmbiguousCommitAndReplayRepository(db);
		const committedStore = new MemoryStore();
		const service = new AuthorizationDocumentService(
			repository,
			committedStore,
			{ ...documentConfig, maxFilesPerAuthorization: 1 },
			{ consume: async () => undefined },
			() => clock,
			storageIntents
		);
		const payload = {
			requestId: request.id,
			authorizationId,
			idempotencyKey: 'ambiguous-upload-replay-read',
		};
		const uploadFile = pdfFile('ambiguous-upload-replay-read');

		await expect(service.upload({
			actor: parent,
			payload,
			file: uploadFile,
			requestSubject: 'ambiguous-upload-replay-read',
			requestId: 'ambiguous-upload-replay-read',
		})).rejects.toThrow('synthetic ambiguous D1 response after commit');
		const committed = await db.first<{ id: string; quarantine_r2_key: string }>( {
			sql: `SELECT id, quarantine_r2_key FROM authorization_documents
				WHERE authorization_id = ?`,
			params: [authorizationId],
		});
		expect(committed).not.toBeNull();
		expect(await db.first<{ status: string }>({
			sql: `SELECT status FROM storage_object_intents WHERE object_key = ?`,
			params: [committed!.quarantine_r2_key],
		})).toEqual({ status: 'linked' });
		expect(committedStore.values.has(committed!.quarantine_r2_key)).toBe(true);
		expect(committedStore.deletes).toEqual([]);

		await expect(service.upload({
			actor: parent,
			payload,
			file: uploadFile,
			requestSubject: 'ambiguous-upload-replay-read',
			requestId: 'ambiguous-upload-replay-retry',
		})).resolves.toEqual({ documentId: committed!.id, replayed: true });
		expect(committedStore.values.size).toBe(1);
	});

	it('cleans a confirmed uncommitted upload only through the staged-intent grace and lease', async () => {
		const request = await createNachhilfe('confirmed-upload-absence');
		const authorizationId = request.authorizations[0].id;
		const storageIntents = new StorageIntentRepository(db);
		class ConfirmedFailureRepository extends AuthorizationDocumentRepository {
			override async persistUpload(
				_input: Parameters<AuthorizationDocumentRepository['persistUpload']>[0]
			) {
				throw new Error('synthetic confirmed uncommitted upload');
			}
		}
		const orphanStore = new MemoryStore();
		const service = new AuthorizationDocumentService(
			new ConfirmedFailureRepository(db),
			orphanStore,
			documentConfig,
			{ consume: async () => undefined },
			() => clock,
			storageIntents
		);

		await expect(service.upload({
			actor: parent,
			payload: {
				requestId: request.id,
				authorizationId,
				idempotencyKey: 'confirmed-upload-absence',
			},
			file: pdfFile('confirmed-upload-absence'),
			requestSubject: 'confirmed-upload-absence',
			requestId: 'confirmed-upload-absence',
		})).rejects.toThrow('synthetic confirmed uncommitted upload');
		const intent = await db.first<{ id: string; object_key: string; status: string }>({
			sql: `SELECT id, object_key, status FROM storage_object_intents
				WHERE object_kind = 'authorization_document_upload'`,
		});
		expect(intent).toMatchObject({ status: 'staged' });
		expect(orphanStore.values.has(intent!.object_key)).toBe(true);
		expect(orphanStore.deletes).toEqual([]);
		expect(await storageIntents.claimCleanup({
			now: '2026-07-17T10:14:59.999Z',
			stagedBefore: '2026-07-17T09:59:59.999Z',
			leaseOwner: 'upload-cleanup-too-early',
			leaseUntil: '2026-07-17T10:19:59.999Z',
			limit: 10,
		})).toEqual([]);

		const cleanupNow = '2026-07-17T10:15:00.000Z';
		expect(await storageIntents.reconcileLinked(cleanupNow, 10)).toBe(0);
		const claimed = await storageIntents.claimCleanup({
			now: cleanupNow,
			stagedBefore: clock,
			leaseOwner: 'upload-cleanup-owner',
			leaseUntil: '2026-07-17T10:20:00.000Z',
			limit: 10,
		});
			expect(claimed).toEqual([{
			id: intent!.id,
			storage_class: 'quarantine',
			object_key: intent!.object_key,
			generation: 1,
		}]);
		await orphanStore.delete(intent!.object_key);
		expect(await storageIntents.completeDelete(
			intent!.id,
			claimed[0].generation,
			'upload-cleanup-owner',
			cleanupNow
		)).toBe(true);
		expect(orphanStore.values.has(intent!.object_key)).toBe(false);
		expect(await db.first<{ status: string }>({
			sql: `SELECT status FROM storage_object_intents WHERE id = ?`,
			params: [intent!.id],
		})).toEqual({ status: 'deleted' });
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

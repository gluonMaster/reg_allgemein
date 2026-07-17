import type { AdminActor } from '$lib/server/security/authorization';
import { berlinCalendarDate } from '$lib/server/time/berlin';
import type { AuthorizationDocumentRepository } from '$lib/server/documents/document-repository';
import type { PrivateDocumentStore } from '$lib/server/documents/storage';
import {
	adminAuthorizationReviewSchema,
	adminDocumentAttestationSchema,
	adminDocumentReviewSchema,
	adminRequestTransitionSchema,
} from './contracts';
import { RequestAdminError, RequestAdminRepository } from './admin-repository';
import { sha256Bytes } from '$lib/server/security/digest';

export class RequestAdminService {
	constructor(
		private readonly repository: RequestAdminRepository,
		private readonly documentRepository: AuthorizationDocumentRepository,
		private readonly store: PrivateDocumentStore,
		private readonly now: () => string = () => new Date().toISOString()
	) {}

	async list(input: { q: string; status: string; kind: string; documentStatus: string }) {
		const [requests, documents] = await Promise.all([
			this.repository.listAdminRequests(input),
			this.documentRepository.listAdminDocuments({
				q: input.q,
				status: input.documentStatus,
			}),
		]);
		return { requests, documents };
	}

	async transitionRequest(input: {
		actor: AdminActor;
		payload: unknown;
		requestId: string;
	}) {
		const parsed = adminRequestTransitionSchema.safeParse(input.payload);
		if (!parsed.success) throw new RequestAdminError('INVALID_REQUEST_TRANSITION');
		return this.repository.transitionRequest({
			actor: input.actor,
			...parsed.data,
			requestIdHeader: input.requestId,
			now: this.now(),
		});
	}

	async attestDocument(input: {
		actor: AdminActor;
		payload: unknown;
		requestId: string;
	}) {
		const parsed = adminDocumentAttestationSchema.safeParse(input.payload);
		if (!parsed.success) throw new RequestAdminError('INVALID_DOCUMENT_ATTESTATION');
		return this.repository.attestDocument({
			actor: input.actor,
			...parsed.data,
			requestId: input.requestId,
			now: this.now(),
		});
	}

	async reviewDocument(input: {
		actor: AdminActor;
		payload: unknown;
		requestId: string;
	}) {
		const parsed = adminDocumentReviewSchema.safeParse(input.payload);
		if (!parsed.success) throw new RequestAdminError('INVALID_DOCUMENT_REVIEW');
		const now = this.now();
		if (parsed.data.decision === 'reject') {
			return this.repository.reviewDocument({
				actor: input.actor,
				...parsed.data,
				requestId: input.requestId,
				now,
			});
		}

		const document = await this.repository.loadCleanDocumentForArchive(parsed.data.documentId);
		if (document.review_status === 'approved' && document.archive_r2_key) {
			return this.repository.reviewDocument({
				actor: input.actor,
				...parsed.data,
				archiveKey: document.archive_r2_key,
				requestId: input.requestId,
				now,
			});
		}
		const object = await this.store.get(document.quarantine_r2_key);
		if (!object || object.size !== document.size_bytes) {
			throw new RequestAdminError('DOCUMENT_BODY_UNAVAILABLE');
		}
		if ((await sha256Bytes(new Uint8Array(object.body))) !== document.sha256) {
			throw new RequestAdminError('DOCUMENT_CHECKSUM_MISMATCH');
		}
		const archiveKey = `archive/funding/${crypto.randomUUID()}`;
		await this.store.put(archiveKey, new Uint8Array(object.body), document.sha256);
		let result: Awaited<ReturnType<RequestAdminRepository['reviewDocument']>>;
		try {
			result = await this.repository.reviewDocument({
				actor: input.actor,
				...parsed.data,
				archiveKey,
				requestId: input.requestId,
				now,
			});
		} catch (error) {
			await this.store.delete(archiveKey).catch(() => undefined);
			throw error;
		}
		if (result.replayed) await this.store.delete(archiveKey).catch(() => undefined);
		try {
			await this.store.delete(document.quarantine_r2_key);
			await this.documentRepository.completeQuarantineDelete(document.id, now);
		} catch {
			// Approved archive remains authoritative; cleanup retries the unreachable copy.
		}
		return result;
	}

	async reviewAuthorization(input: {
		actor: AdminActor;
		payload: unknown;
		requestId: string;
	}) {
		const parsed = adminAuthorizationReviewSchema.safeParse(input.payload);
		if (!parsed.success) throw new RequestAdminError('INVALID_AUTHORIZATION_REVIEW');
		const now = this.now();
		return this.repository.reviewAuthorization({
			actor: input.actor,
			...parsed.data,
			requestIdHeader: input.requestId,
			now,
			currentDate: berlinCalendarDate(now),
		});
	}

	processExpiredAuthorizations(now = this.now()) {
		return this.repository.processExpiredAuthorizations({
			currentDate: berlinCalendarDate(now),
			now,
		});
	}
}

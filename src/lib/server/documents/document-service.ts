import type { AuthenticatedUser } from '$lib/server/auth/session';
import type { AdminActor } from '$lib/server/security/authorization';
import type { DocumentRuntimeConfig } from '$lib/server/config/runtime';
import { hashCanonical } from '$lib/server/import/canonical';
import {
	documentDeleteCommandSchema,
	documentUploadCommandSchema,
} from '$lib/server/requests/contracts';
import { AuthorizationDocumentRepository, DocumentRepositoryError } from './document-repository';
import type { PrivateDocumentStore } from './storage';
import { validateUpload, type UploadFileLike } from './validation';
import { sha256Bytes } from '$lib/server/security/digest';

export interface DocumentUploadRateLimiter {
	consume(scope: string, rawSubject: string, now: string): Promise<void>;
}

export class DocumentServiceError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'DocumentServiceError';
	}
}

function isUploadFile(value: unknown): value is UploadFileLike {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof Reflect.get(value, 'name') === 'string' &&
		typeof Reflect.get(value, 'type') === 'string' &&
		typeof Reflect.get(value, 'size') === 'number' &&
		typeof Reflect.get(value, 'arrayBuffer') === 'function'
	);
}

export class AuthorizationDocumentService {
	constructor(
		private readonly repository: AuthorizationDocumentRepository,
		private readonly store: PrivateDocumentStore,
		private readonly config: DocumentRuntimeConfig,
		private readonly rateLimiter: DocumentUploadRateLimiter,
		private readonly now: () => string = () => new Date().toISOString()
	) {}

	private requireParent(actor: AuthenticatedUser) {
		if (actor.role !== 'parent' || !actor.emailVerified) {
			throw new DocumentServiceError('PARENT_REQUIRED');
		}
	}

	async upload(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		file: unknown;
		requestSubject: string;
		requestId: string;
	}) {
		this.requireParent(input.actor);
		if (!this.config.uploadEnabled) throw new DocumentServiceError('DOCUMENT_UPLOAD_DISABLED');
		const parsed = documentUploadCommandSchema.safeParse(input.payload);
		if (!parsed.success || !isUploadFile(input.file)) {
			throw new DocumentServiceError('INVALID_DOCUMENT_UPLOAD');
		}
		const now = this.now();
		await this.rateLimiter.consume(
			'document-upload',
			`${input.actor.id}|${input.requestSubject}`,
			now
		);
		const target = await this.repository.loadUploadTarget({
			userId: input.actor.id,
			requestId: parsed.data.requestId,
			authorizationId: parsed.data.authorizationId,
			replaceDocumentId: parsed.data.replaceDocumentId,
		});
		const validated = await validateUpload(input.file, this.config);
		const replacesInSameAuthorization =
			target.replaceDocument &&
			target.targetAuthorizationId === target.replaceDocument.authorizationId;
		const effectiveCount = target.currentCount - (replacesInSameAuthorization ? 1 : 0);
		const effectiveBytes =
			target.currentBytes -
			(replacesInSameAuthorization ? target.replaceDocument?.sizeBytes ?? 0 : 0);
		if (
			effectiveCount + 1 > this.config.maxFilesPerAuthorization ||
			effectiveBytes + validated.sizeBytes > this.config.maxAuthorizationBytes
		) {
			throw new DocumentServiceError('DOCUMENT_AUTHORIZATION_LIMIT_REJECTED');
		}

		const requestHash = await hashCanonical({
			requestId: parsed.data.requestId,
			authorizationId: parsed.data.authorizationId,
			replaceDocumentId: parsed.data.replaceDocumentId ?? null,
			sha256: validated.sha256,
			sizeBytes: validated.sizeBytes,
			detectedType: validated.detectedType,
		});
		const prior = await this.repository.findUploadReplay(
			input.actor.id,
			parsed.data.idempotencyKey
		);
		if (prior) {
			if (prior.upload_request_hash_sha256 !== requestHash) {
				throw new DocumentServiceError('IDEMPOTENCY_KEY_REUSED');
			}
			return { documentId: prior.id, replayed: true };
		}

		const documentId = crypto.randomUUID();
		const quarantineKey = `quarantine/${crypto.randomUUID()}`;
		const quarantineExpiresAt = new Date(
			Date.parse(now) + 14 * 24 * 60 * 60 * 1000
		).toISOString();
		await this.store.put(quarantineKey, validated.body, validated.sha256);
		try {
			await this.repository.persistUpload({
				target,
				documentId,
				quarantineKey,
				validated,
				idempotencyKey: parsed.data.idempotencyKey,
				requestHash,
				requestIdHeader: input.requestId,
				now,
				quarantineExpiresAt,
			});
		} catch (error) {
			await this.store.delete(quarantineKey).catch(() => undefined);
			const replay = await this.repository.findUploadReplay(
				input.actor.id,
				parsed.data.idempotencyKey
			);
			if (replay?.upload_request_hash_sha256 === requestHash) {
				return { documentId: replay.id, replayed: true };
			}
			throw error;
		}

		return { documentId, replayed: false };
	}

	async deleteByParent(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		requestId: string;
	}) {
		this.requireParent(input.actor);
		const parsed = documentDeleteCommandSchema.safeParse(input.payload);
		if (!parsed.success) throw new DocumentServiceError('INVALID_DOCUMENT_DELETE');
		const now = this.now();
		const result = await this.repository.deleteByParent({
			documentId: parsed.data.documentId,
			userId: input.actor.id,
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			now,
		});
		// Parent deletion removes access immediately; physical quarantine cleanup still
		// waits for the immutable upload TTL and is never accelerated by this action.
		return result;
	}

	async adminQuarantineDownload(input: {
		actor: AdminActor;
		documentId: string;
		requestId: string;
	}) {
		const document = await this.repository.loadAdminQuarantineDownload(input.documentId);
		const object = await this.store.get(document.quarantine_r2_key);
		if (!object || object.size !== document.size_bytes) {
			throw new DocumentServiceError('DOCUMENT_BODY_UNAVAILABLE');
		}
		if ((await sha256Bytes(new Uint8Array(object.body))) !== document.sha256) {
			throw new DocumentServiceError('DOCUMENT_CHECKSUM_MISMATCH');
		}
		await this.repository.auditAdminQuarantineDownload({
			documentId: input.documentId,
			adminUserId: input.actor.id,
			requestId: input.requestId,
			now: this.now(),
		});
		return {
			body: object.body,
			filename: `quarantine-${document.sha256.slice(0, 12)}.bin`,
		};
	}

	async parentApprovedDownload(input: {
		actor: AuthenticatedUser;
		documentId: string;
		requestId: string;
	}) {
		this.requireParent(input.actor);
		const document = await this.repository.loadParentApprovedDownload(
			input.actor.id,
			input.documentId
		);
		if (!document.archive_r2_key) throw new DocumentServiceError('DOCUMENT_BODY_UNAVAILABLE');
		const object = await this.store.get(document.archive_r2_key);
		if (!object || object.size !== document.size_bytes) {
			throw new DocumentServiceError('DOCUMENT_BODY_UNAVAILABLE');
		}
		if ((await sha256Bytes(new Uint8Array(object.body))) !== document.sha256) {
			throw new DocumentServiceError('DOCUMENT_CHECKSUM_MISMATCH');
		}
		await this.repository.auditParentApprovedDownload({
			documentId: input.documentId,
			userId: input.actor.id,
			requestId: input.requestId,
			now: this.now(),
		});
		return {
			body: object.body,
			filename: `document-${document.sha256.slice(0, 12)}.bin`,
		};
	}

	async cleanupExpired(now = this.now(), limit = 100) {
		const claimed = await this.repository.claimCleanup(now, limit);
		let deleted = 0;
		for (const document of claimed) {
			try {
				await this.store.delete(document.quarantineKey);
				await this.repository.completeQuarantineDelete(document.id, now);
				deleted += 1;
			} catch {
				// delete_pending is intentionally retried by the next cleanup delivery.
			}
		}
		return { claimed: claimed.length, deleted };
	}
}

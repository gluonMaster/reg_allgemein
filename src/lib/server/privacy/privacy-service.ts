import type { AuthenticatedUser } from '$lib/server/auth/session';
import type { PrivacyRuntimeConfig } from '$lib/server/config/runtime';
import { canonicalJson } from '$lib/server/import/canonical';
import type { AdminActor } from '$lib/server/security/authorization';
import { sha256Bytes } from '$lib/server/security/digest';
import { PrivacyRepository, PrivacyRepositoryError } from './privacy-repository';
import type { PrivacyArtifactStore } from './storage';
import type { StorageIntentRepository } from '$lib/server/operations/storage-intents';

export class PrivacyServiceError extends Error {
	constructor(readonly code: string, options?: { cause?: unknown }) {
		super(code, options);
		this.name = 'PrivacyServiceError';
	}
}

export class PrivacyService {
	constructor(
		private readonly repository: PrivacyRepository,
		private readonly store: PrivacyArtifactStore,
		private readonly config: PrivacyRuntimeConfig,
		private readonly now: () => string = () => new Date().toISOString(),
		private readonly quarantineStore: PrivacyArtifactStore = store,
		private readonly storageIntents?: StorageIntentRepository
	) {}

	async dryRunDeletion(actor: AuthenticatedUser) {
		if (actor.role !== 'parent') throw new PrivacyServiceError('PRIVACY_PARENT_REQUIRED');
		await this.repository.assertSubjectAccess(actor, actor.id);
		return this.repository.deletionInventory(actor.id);
	}

	async requestDeletion(input: {
		actor: AuthenticatedUser;
		idempotencyKey: string;
		requestId: string;
	}) {
		const inventory = await this.dryRunDeletion(input.actor);
		return this.repository.createDeleteRequest({ ...input, inventory, now: this.now() });
	}

	async generateExport(input: {
		actor: AuthenticatedUser;
		subjectUserId?: string;
		idempotencyKey: string;
		requestId: string;
	}) {
		const subjectUserId = input.subjectUserId ?? input.actor.id;
		await this.repository.assertSubjectAccess(input.actor, subjectUserId);
		const now = this.now();
		const request = await this.repository.createExportRequest({
			actor: input.actor,
			subjectUserId,
			idempotencyKey: input.idempotencyKey,
			requestId: input.requestId,
			now,
		});
		if (request.ready && request.artifactId) return request;

		const data = await this.repository.exportData(subjectUserId, now);
		const bytes = new TextEncoder().encode(canonicalJson(data));
		const sha256 = await sha256Bytes(bytes);
		const privateR2Key = `privacy-exports/${crypto.randomUUID()}.json`;
		const expiresAt = new Date(
			Date.parse(now) + this.config.exportTtlSeconds * 1000
		).toISOString();
		const storageIntentId = await this.storageIntents?.stage({
			storageClass: 'archive', objectKey: privateR2Key,
			objectKind: 'privacy_export', sourceRef: request.requestId,
			sha256, sizeBytes: bytes.byteLength, now,
		});
		try {
			await this.store.put(privateR2Key, bytes, sha256);
			const completed = await this.repository.completeExport({
				privacyRequestId: request.requestId,
				subjectUserId,
				privateR2Key,
				sha256,
				sizeBytes: bytes.byteLength,
				expiresAt,
				now,
				storageIntentId,
			});
			if (completed.storedR2Key !== privateR2Key) {
				await this.store.delete(privateR2Key).catch(() => undefined);
				if (storageIntentId) {
					await this.storageIntents?.markDeletePending(storageIntentId, this.now()).catch(() => undefined);
				}
			} else if (storageIntentId) {
				await this.storageIntents?.markLinked(storageIntentId, this.now()).catch(() => undefined);
			}
			return {
				requestId: request.requestId,
				artifactId: completed.artifactId,
				replayed: request.replayed || completed.replayed,
				ready: true,
			};
		} catch (error) {
			// A failed D1 response is ambiguous: the atomic completion batch may
			// already have linked this key. A staged intent is reconciled before
			// orphan cleanup and is therefore safer than eager deletion here.
			if (!storageIntentId) await this.store.delete(privateR2Key).catch(() => undefined);
			await this.repository.markExportFailed(request.requestId, now).catch(() => undefined);
			throw new PrivacyServiceError('PRIVACY_EXPORT_FAILED', { cause: error });
		}
	}

	async downloadExport(input: {
		actor: AuthenticatedUser;
		artifactId: string;
		requestId: string;
	}) {
		const now = this.now();
		const artifact = await this.repository.loadExportArtifact({
			actor: input.actor,
			artifactId: input.artifactId,
			now,
		});
		if (!artifact) throw new PrivacyServiceError('PRIVACY_EXPORT_NOT_FOUND');
		const object = await this.store.get(artifact.private_r2_key);
		if (!object || object.size !== artifact.size_bytes) {
			throw new PrivacyServiceError('PRIVACY_EXPORT_BODY_UNAVAILABLE');
		}
		const actualHash = await sha256Bytes(new Uint8Array(object.body));
		if (actualHash !== artifact.sha256) {
			throw new PrivacyServiceError('PRIVACY_EXPORT_INTEGRITY_FAILED');
		}
		await this.repository.auditExportDownload({ ...input, now });
		return {
			body: object.body,
			contentType: 'application/json; charset=utf-8',
			filename: `kolibri-datenauskunft-${artifact.id}.json`,
		};
	}

	async processDeletion(input: {
		admin: AdminActor;
		privacyRequestId: string;
		reason: string;
		idempotencyKey: string;
		requestId: string;
	}) {
		const result = await this.repository.processDelete({ ...input, now: this.now() });
		if (result.status === 'completed_with_retained_evidence') {
			await this.runCleanup({ privacyRequestId: input.privacyRequestId, limit: 100 });
		}
		return {
			...result,
			cleanup: await this.repository.cleanupState(input.privacyRequestId),
		};
	}

	async cleanupExpiredExports(limit = 50) {
		const now = this.now();
		await this.repository.queueExpiredExports(now, limit);
		return this.runCleanup({ privacyRequestId: null, limit });
	}

	async runCleanup(input: { privacyRequestId: string | null; limit: number }) {
		const now = this.now();
		const leaseOwner = crypto.randomUUID();
		const jobs = await this.repository.claimCleanupJobs(
			input.privacyRequestId,
			now,
			input.limit,
			leaseOwner,
			300
		);
		let completed = 0;
		let failed = 0;
		for (const job of jobs) {
			try {
				const selectedStore = job.object_kind === 'document_quarantine'
					? this.quarantineStore
					: this.store;
				await selectedStore.delete(job.private_r2_key);
				const completedByThisLease = await this.repository.completeCleanupJob({
					jobId: job.id,
					leaseOwner,
					objectKind: job.object_kind,
					sourceRecordId: job.source_record_id,
					now: this.now(),
				});
				if (!completedByThisLease) {
					throw new PrivacyServiceError('PRIVACY_CLEANUP_LEASE_LOST');
				}
				completed += 1;
			} catch (error) {
				const errorCode = error instanceof PrivacyServiceError
					&& error.code === 'PRIVACY_CLEANUP_LEASE_LOST'
					? 'D1_FINALIZE_FAILED'
					: 'R2_DELETE_FAILED';
				await this.repository.failCleanupJob(job.id, leaseOwner, this.now(), errorCode)
					.catch(() => undefined);
				failed += 1;
			}
		}
		return { claimed: jobs.length, completed, failed };
	}
}

export function privacyErrorCode(error: unknown): string {
	if (error instanceof PrivacyServiceError || error instanceof PrivacyRepositoryError) {
		return error.code;
	}
	return 'PRIVACY_OPERATION_FAILED';
}

import { DatabaseBoundary } from '$lib/server/db/database';

export type StorageClass = 'archive' | 'quarantine';

export interface StorageIntent {
	id: string;
	storage_class: StorageClass;
	object_key: string;
	generation: number;
}

function assertLimit(limit: number): void {
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
		throw new TypeError('Storage cleanup limit must be between 1 and 100.');
	}
}

export class StorageIntentRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async stage(input: {
		storageClass: StorageClass;
		objectKey: string;
		objectKind: string;
		sourceRef?: string;
		sha256: string;
		sizeBytes: number;
		now: string;
	}): Promise<string> {
		const id = crypto.randomUUID();
		const result = await this.db.run({
				sql: `INSERT INTO storage_object_intents
				(id, storage_class, object_key, object_kind, source_ref, sha256, size_bytes,
				 status, attempts, lease_owner, lease_until, last_error_code, linked_at,
				 deleted_at, created_at, updated_at, intent_family_id, generation,
				 installer_owner, installer_lease_until)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'staged', 0, NULL, NULL, NULL, NULL, NULL, ?, ?,
				?, 1, NULL, NULL)`,
			params: [id, input.storageClass, input.objectKey, input.objectKind,
				input.sourceRef ?? null, input.sha256, input.sizeBytes, input.now, input.now, id],
		});
		if ((result.meta.changes ?? 0) < 1) throw new Error('STORAGE_INTENT_STAGE_FAILED');
		return id;
	}

	async markLinked(id: string, now: string): Promise<boolean> {
		const result = await this.db.run({
			sql: `UPDATE storage_object_intents SET status = 'linked', linked_at = ?,
				updated_at = ?, lease_owner = NULL, lease_until = NULL,
				installer_owner = NULL, installer_lease_until = NULL, last_error_code = NULL
			WHERE id = ? AND status = 'staged'`,
			params: [now, now, id],
		});
		return (result.meta.changes ?? 0) === 1;
	}

	async markDeletePending(id: string, now: string): Promise<void> {
		await this.db.run({
			sql: `UPDATE storage_object_intents SET status = 'delete_pending', updated_at = ?,
				lease_owner = NULL, lease_until = NULL,
				installer_owner = NULL, installer_lease_until = NULL
			WHERE id = ? AND status IN ('staged','processing')`,
			params: [now, id],
		});
	}

	private referencedObjectSql(alias: string): string {
		return `EXISTS (SELECT 1 FROM authorization_documents document
				WHERE document.quarantine_r2_key = ${alias}.object_key
					OR document.archive_r2_key = ${alias}.object_key)
			OR EXISTS (SELECT 1 FROM contract_template_versions template
				WHERE template.template_bundle_r2_key = ${alias}.object_key)
			OR EXISTS (SELECT 1 FROM contract_offers offer
				WHERE offer.contract_html_r2_key = ${alias}.object_key
					OR offer.contract_pdf_r2_key = ${alias}.object_key)
			OR EXISTS (SELECT 1 FROM contract_artifacts artifact
				WHERE artifact.private_r2_key = ${alias}.object_key)
			OR EXISTS (SELECT 1 FROM contract_formation_certificates certificate
				WHERE certificate.certificate_pdf_r2_key = ${alias}.object_key)
			OR EXISTS (SELECT 1 FROM privacy_export_artifacts privacy_export
				WHERE privacy_export.private_r2_key = ${alias}.object_key)
			OR EXISTS (SELECT 1 FROM privacy_requests privacy_request
				WHERE privacy_request.artifact_r2_key = ${alias}.object_key)
			OR EXISTS (SELECT 1 FROM legal_archive_records archive
				WHERE archive.private_r2_key = ${alias}.object_key)`;
	}

	async reconcileLinked(now: string, limit: number): Promise<number> {
		assertLimit(limit);
		const result = await this.db.run({
			sql: `UPDATE storage_object_intents SET status = 'linked', linked_at = ?,
				updated_at = ?, lease_owner = NULL, lease_until = NULL,
				installer_owner = NULL, installer_lease_until = NULL, last_error_code = NULL
			WHERE id IN (SELECT intent.id FROM storage_object_intents intent
				WHERE intent.status IN ('staged','delete_pending')
					AND (${this.referencedObjectSql('intent')})
				ORDER BY intent.created_at, intent.id LIMIT ?)`,
			params: [now, now, limit],
		});
		return result.meta.changes ?? 0;
	}

	async claimCleanup(input: {
		now: string;
		stagedBefore: string;
		leaseOwner: string;
		leaseUntil: string;
		limit: number;
	}): Promise<StorageIntent[]> {
		assertLimit(input.limit);
		const candidates = await this.db.all<StorageIntent>({
			sql: `SELECT intent.id, intent.storage_class, intent.object_key, intent.generation
			FROM storage_object_intents intent
			WHERE ((intent.status = 'delete_pending')
				OR (intent.status = 'staged' AND intent.created_at <= ?
					AND (intent.installer_lease_until IS NULL OR intent.installer_lease_until <= ?))
				OR (intent.status = 'processing' AND intent.lease_until <= ?))
				AND NOT (${this.referencedObjectSql('intent')})
			ORDER BY intent.created_at, intent.id LIMIT ?`,
			params: [input.stagedBefore, input.now, input.now, input.limit],
		});
		const claimed: StorageIntent[] = [];
		for (const candidate of candidates.results) {
			const result = await this.db.run({
				sql: `UPDATE storage_object_intents AS intent
					SET status = 'processing', attempts = attempts + 1,
					lease_owner = ?, lease_until = ?, last_error_code = NULL, updated_at = ?
				WHERE intent.id = ? AND intent.generation = ?
					AND ((intent.status = 'delete_pending')
					OR (intent.status = 'staged'
						AND (intent.installer_lease_until IS NULL OR intent.installer_lease_until <= ?))
					OR (intent.status = 'processing' AND intent.lease_until <= ?))
					AND NOT (${this.referencedObjectSql('intent')})`,
				params: [input.leaseOwner, input.leaseUntil, input.now, candidate.id,
					candidate.generation, input.now, input.now],
			});
			if ((result.meta.changes ?? 0) === 1) claimed.push(candidate);
		}
		return claimed;
	}

	async completeDelete(
		id: string,
		generation: number,
		leaseOwner: string,
		now: string
	): Promise<boolean> {
		const result = await this.db.run({
			sql: `UPDATE storage_object_intents SET status = 'deleted', deleted_at = ?,
				updated_at = ?, lease_owner = NULL, lease_until = NULL, last_error_code = NULL
			WHERE id = ? AND generation = ? AND status = 'processing' AND lease_owner = ?`,
			params: [now, now, id, generation, leaseOwner],
		});
		return (result.meta.changes ?? 0) === 1;
	}

	async failDelete(id: string, generation: number, leaseOwner: string, now: string): Promise<void> {
		await this.db.run({
			sql: `UPDATE storage_object_intents SET status = 'delete_pending',
				last_error_code = 'R2_DELETE_FAILED', updated_at = ?,
				lease_owner = NULL, lease_until = NULL
			WHERE id = ? AND generation = ? AND status = 'processing' AND lease_owner = ?`,
			params: [now, id, generation, leaseOwner],
		});
	}
}

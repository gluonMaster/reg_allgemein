import { UnavailableDocumentStore, type PrivateDocumentStore } from '$lib/server/documents/storage';

export interface ContractArtifactStore extends PrivateDocumentStore {
	/** Atomic create-if-absent. `false` means the existing object won. */
	putIfAbsent?(key: string, body: Uint8Array, sha256: string): Promise<boolean>;
}

class CloudflareContractArtifactStore implements ContractArtifactStore {
	constructor(private readonly bucket: R2Bucket) {}

	async put(key: string, body: Uint8Array, sha256: string): Promise<void> {
		await this.bucket.put(key, body, {
			customMetadata: { sha256, artifactKind: 'contract' },
		});
	}

	async putIfAbsent(key: string, body: Uint8Array, sha256: string): Promise<boolean> {
		const created = await this.bucket.put(key, body, {
			onlyIf: { etagDoesNotMatch: '*' },
			customMetadata: { sha256, artifactKind: 'contract' },
		});
		return created !== null;
	}

	async get(key: string) {
		const object = await this.bucket.get(key);
		if (!object) return null;
		return { body: await object.arrayBuffer(), size: object.size };
	}

	async delete(key: string): Promise<void> {
		await this.bucket.delete(key);
	}
}

class UnavailableContractArtifactStore
	extends UnavailableDocumentStore
	implements ContractArtifactStore
{
	putIfAbsent(): Promise<boolean> {
		return this.put().then(() => false);
	}
}

export function contractArtifactStore(bucket?: R2Bucket): ContractArtifactStore {
	return bucket
		? new CloudflareContractArtifactStore(bucket)
		: new UnavailableContractArtifactStore();
}

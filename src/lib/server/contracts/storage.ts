import {
	UnavailableDocumentStore,
	type PrivateDocumentStore,
} from '$lib/server/documents/storage';

export type ContractArtifactStore = PrivateDocumentStore;

class CloudflareContractArtifactStore implements ContractArtifactStore {
	constructor(private readonly bucket: R2Bucket) {}

	async put(key: string, body: Uint8Array, sha256: string): Promise<void> {
		await this.bucket.put(key, body, {
			customMetadata: { sha256, artifactKind: 'contract' },
		});
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

export function contractArtifactStore(bucket?: R2Bucket): ContractArtifactStore {
	return bucket ? new CloudflareContractArtifactStore(bucket) : new UnavailableDocumentStore();
}

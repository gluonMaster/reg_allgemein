import {
	CloudflareR2DocumentStore,
	UnavailableDocumentStore,
	type PrivateDocumentStore,
} from '$lib/server/documents/storage';

export type ContractArtifactStore = PrivateDocumentStore;

export function contractArtifactStore(bucket?: R2Bucket): ContractArtifactStore {
	return bucket ? new CloudflareR2DocumentStore(bucket) : new UnavailableDocumentStore();
}

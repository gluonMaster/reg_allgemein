export interface PrivateDocumentObject {
	body: ArrayBuffer;
	size: number;
}

export interface PrivateDocumentStore {
	put(key: string, body: Uint8Array, sha256: string): Promise<void>;
	get(key: string): Promise<PrivateDocumentObject | null>;
	delete(key: string): Promise<void>;
}

export class DocumentStorageUnavailableError extends Error {
	readonly code = 'DOCUMENT_STORAGE_UNAVAILABLE';

	constructor() {
		super('Private document storage is unavailable.');
		this.name = 'DocumentStorageUnavailableError';
	}
}

export class UnavailableDocumentStore implements PrivateDocumentStore {
	put(): Promise<void> {
		throw new DocumentStorageUnavailableError();
	}
	get(): Promise<null> {
		throw new DocumentStorageUnavailableError();
	}
	delete(): Promise<void> {
		throw new DocumentStorageUnavailableError();
	}
}

export class CloudflareR2DocumentStore implements PrivateDocumentStore {
	constructor(
		private readonly quarantineBucket: R2Bucket,
		private readonly archiveBucket: R2Bucket
	) {}

	private bucketFor(key: string): R2Bucket {
		if (key.startsWith('quarantine/')) return this.quarantineBucket;
		if (key.startsWith('archive/')) return this.archiveBucket;
		throw new DocumentStorageUnavailableError();
	}

	async put(key: string, body: Uint8Array, sha256: string): Promise<void> {
		await this.bucketFor(key).put(key, body, { customMetadata: { sha256 } });
	}

	async get(key: string): Promise<PrivateDocumentObject | null> {
		const object = await this.bucketFor(key).get(key);
		if (!object) return null;
		return { body: await object.arrayBuffer(), size: object.size };
	}

	async delete(key: string): Promise<void> {
		await this.bucketFor(key).delete(key);
	}
}

export function documentStore(
	quarantineBucket?: R2Bucket,
	archiveBucket?: R2Bucket
): PrivateDocumentStore {
	return quarantineBucket && archiveBucket
		? new CloudflareR2DocumentStore(quarantineBucket, archiveBucket)
		: new UnavailableDocumentStore();
}

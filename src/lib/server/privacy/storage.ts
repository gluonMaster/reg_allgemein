export interface PrivatePrivacyObject {
	body: ArrayBuffer;
	size: number;
}

export interface PrivacyArtifactStore {
	put(key: string, body: Uint8Array, sha256: string): Promise<void>;
	get(key: string): Promise<PrivatePrivacyObject | null>;
	delete(key: string): Promise<void>;
}

export class PrivacyStorageUnavailableError extends Error {
	readonly code = 'PRIVACY_STORAGE_UNAVAILABLE';

	constructor() {
		super('Private privacy artifact storage is unavailable.');
		this.name = 'PrivacyStorageUnavailableError';
	}
}

class UnavailablePrivacyArtifactStore implements PrivacyArtifactStore {
	put(): Promise<void> {
		throw new PrivacyStorageUnavailableError();
	}
	get(): Promise<null> {
		throw new PrivacyStorageUnavailableError();
	}
	delete(): Promise<void> {
		throw new PrivacyStorageUnavailableError();
	}
}

class CloudflarePrivacyArtifactStore implements PrivacyArtifactStore {
	constructor(private readonly bucket: R2Bucket) {}

	async put(key: string, body: Uint8Array, sha256: string): Promise<void> {
		await this.bucket.put(key, body, {
			customMetadata: { sha256, artifactKind: 'privacy-export' },
		});
	}

	async get(key: string): Promise<PrivatePrivacyObject | null> {
		const object = await this.bucket.get(key);
		if (!object) return null;
		return { body: await object.arrayBuffer(), size: object.size };
	}

	async delete(key: string): Promise<void> {
		await this.bucket.delete(key);
	}
}

export function privacyArtifactStore(bucket?: R2Bucket): PrivacyArtifactStore {
	return bucket
		? new CloudflarePrivacyArtifactStore(bucket)
		: new UnavailablePrivacyArtifactStore();
}

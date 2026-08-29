import {
	DocumentStorageUnavailableError,
	type PrivateDocumentObject,
} from '$lib/server/documents/storage';

export interface ContractObjectReadLimits {
	maximumSizeBytes: number;
	expectedSizeBytes?: number;
}

export class ContractObjectReadError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'ContractObjectReadError';
	}
}

export interface ContractArtifactStore {
	put(key: string, body: Uint8Array, sha256: string): Promise<void>;
	get(key: string, limits: ContractObjectReadLimits): Promise<PrivateDocumentObject | null>;
	delete(key: string): Promise<void>;
	/** Atomic create-if-absent. `false` means the existing object won. */
	putIfAbsent?(key: string, body: Uint8Array, sha256: string): Promise<boolean>;
}

function assertReadLimits(limits: ContractObjectReadLimits): void {
	if (!Number.isSafeInteger(limits.maximumSizeBytes) || limits.maximumSizeBytes < 0) {
		throw new TypeError('Contract object maximum size must be a non-negative safe integer.');
	}
	if (
		limits.expectedSizeBytes !== undefined &&
		(!Number.isSafeInteger(limits.expectedSizeBytes) || limits.expectedSizeBytes < 0)
	) {
		throw new TypeError('Contract object expected size must be a non-negative safe integer.');
	}
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

	async get(key: string, limits: ContractObjectReadLimits) {
		assertReadLimits(limits);
		const metadata = await this.bucket.head(key);
		if (!metadata) return null;
		if (metadata.size > limits.maximumSizeBytes) {
			throw new ContractObjectReadError('CONTRACT_OBJECT_TOO_LARGE');
		}
		if (
			limits.expectedSizeBytes !== undefined &&
			metadata.size !== limits.expectedSizeBytes
		) {
			throw new ContractObjectReadError('CONTRACT_OBJECT_SIZE_MISMATCH');
		}

		const object = await this.bucket.get(key, {
			onlyIf: { etagMatches: metadata.etag },
			range: { offset: 0, length: limits.maximumSizeBytes + 1 },
		});
		if (!object) return null;
		if (!('body' in object) || typeof object.arrayBuffer !== 'function') {
			throw new ContractObjectReadError('CONTRACT_OBJECT_CHANGED');
		}
		if (object.etag !== metadata.etag || object.size !== metadata.size) {
			throw new ContractObjectReadError('CONTRACT_OBJECT_CHANGED');
		}
		const body = await object.arrayBuffer();
		if (body.byteLength > limits.maximumSizeBytes) {
			throw new ContractObjectReadError('CONTRACT_OBJECT_TOO_LARGE');
		}
		if (body.byteLength !== metadata.size) {
			throw new ContractObjectReadError('CONTRACT_OBJECT_TRUNCATED');
		}
		return { body, size: metadata.size };
	}

	async delete(key: string): Promise<void> {
		await this.bucket.delete(key);
	}
}

class UnavailableContractArtifactStore implements ContractArtifactStore {
	put(): Promise<void> {
		throw new DocumentStorageUnavailableError();
	}

	get(): Promise<null> {
		throw new DocumentStorageUnavailableError();
	}

	delete(): Promise<void> {
		throw new DocumentStorageUnavailableError();
	}

	putIfAbsent(): Promise<boolean> {
		return this.put().then(() => false);
	}
}

export function contractArtifactStore(bucket?: R2Bucket): ContractArtifactStore {
	return bucket
		? new CloudflareContractArtifactStore(bucket)
		: new UnavailableContractArtifactStore();
}

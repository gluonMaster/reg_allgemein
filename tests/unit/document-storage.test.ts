import { describe, expect, it, vi } from 'vitest';
import {
	CloudflareR2DocumentStore,
	DocumentStorageUnavailableError,
} from '$lib/server/documents/storage';

function fakeBucket() {
	return {
		put: vi.fn().mockResolvedValue(null),
		get: vi.fn().mockResolvedValue(null),
		delete: vi.fn().mockResolvedValue(undefined),
	};
}

describe('private archive/quarantine R2 routing', () => {
	it('routes each allowed key namespace to only its dedicated bucket', async () => {
		const quarantine = fakeBucket();
		const archive = fakeBucket();
		const store = new CloudflareR2DocumentStore(
			quarantine as unknown as R2Bucket,
			archive as unknown as R2Bucket
		);
		const body = new Uint8Array([1, 2, 3]);

		await store.put('quarantine/synthetic', body, 'a'.repeat(64));
		await store.delete('quarantine/synthetic');
		expect(quarantine.put).toHaveBeenCalledOnce();
		expect(quarantine.delete).toHaveBeenCalledOnce();
		expect(archive.put).not.toHaveBeenCalled();
		expect(archive.delete).not.toHaveBeenCalled();

		await store.put('archive/synthetic', body, 'b'.repeat(64));
		await store.delete('archive/synthetic');
		expect(archive.put).toHaveBeenCalledOnce();
		expect(archive.delete).toHaveBeenCalledOnce();
		expect(quarantine.put).toHaveBeenCalledOnce();
	});

	it('fails closed for an object key outside both private namespaces', async () => {
		const store = new CloudflareR2DocumentStore(
			fakeBucket() as unknown as R2Bucket,
			fakeBucket() as unknown as R2Bucket
		);
		await expect(store.delete('documents/synthetic')).rejects.toBeInstanceOf(
			DocumentStorageUnavailableError
		);
	});
});

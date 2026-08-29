import { describe, expect, it, vi } from 'vitest';
import {
	ContractObjectReadError,
	contractArtifactStore,
} from '$lib/server/contracts/storage';

function r2Metadata(size: number, etag = 'etag-v1'): R2Object {
	return { size, etag, version: `version-${etag}` } as R2Object;
}

function r2Body(bytes: Uint8Array, etag = 'etag-v1', size = bytes.byteLength) {
	return {
		...r2Metadata(size, etag),
		body: new ReadableStream(),
		arrayBuffer: vi.fn(async () => Uint8Array.from(bytes).buffer),
	} as unknown as R2ObjectBody;
}

describe('contract template conditional R2 storage', () => {
	it('uses create-if-absent and never overwrites the winning bytes', async () => {
		const values = new Map<string, Uint8Array>();
		const options: R2PutOptions[] = [];
		const bucket = {
			async put(key: string, body: Uint8Array, putOptions: R2PutOptions) {
				options.push(putOptions);
				if (putOptions.onlyIf && values.has(key)) return null;
				values.set(key, Uint8Array.from(body));
				return {} as R2Object;
			},
		} as unknown as R2Bucket;
		const store = contractArtifactStore(bucket);
		const firstBody = new TextEncoder().encode('first immutable bundle');
		const secondBody = new TextEncoder().encode('conflicting immutable bundle');

		const results = await Promise.all([
			store.putIfAbsent!('contract-templates/exact.json', firstBody, 'a'.repeat(64)),
			store.putIfAbsent!('contract-templates/exact.json', secondBody, 'b'.repeat(64)),
		]);

		expect(results).toEqual([true, false]);
		expect(values.get('contract-templates/exact.json')).toEqual(firstBody);
		expect(options).toHaveLength(2);
		for (const option of options) {
			expect(option.onlyIf).toEqual({ etagDoesNotMatch: '*' });
		}
	});

	it('rejects max+1 from HEAD without a GET or any full-body read', async () => {
		const unboundedArrayBuffer = vi.fn();
		const get = vi.fn();
		const bucket = {
			head: vi.fn(async () => ({ ...r2Metadata(2_097_153), arrayBuffer: unboundedArrayBuffer })),
			get,
		} as unknown as R2Bucket;

		await expect(
			contractArtifactStore(bucket).get('contract-templates/oversized.json', {
				maximumSizeBytes: 2_097_152,
			})
		).rejects.toEqual(
			expect.objectContaining<Partial<ContractObjectReadError>>({
				code: 'CONTRACT_OBJECT_TOO_LARGE',
			})
		);
		expect(get).not.toHaveBeenCalled();
		expect(unboundedArrayBuffer).not.toHaveBeenCalled();
	});

	it('accepts the exact max boundary through an ETag-bound max+1 range read', async () => {
		const bytes = new Uint8Array(32);
		const body = r2Body(bytes);
		const get = vi.fn(async () => body);
		const bucket = {
			head: vi.fn(async () => r2Metadata(bytes.byteLength)),
			get,
		} as unknown as R2Bucket;

		const object = await contractArtifactStore(bucket).get('contract-templates/max.json', {
			maximumSizeBytes: bytes.byteLength,
			expectedSizeBytes: bytes.byteLength,
		});

		expect(new Uint8Array(object!.body)).toEqual(bytes);
		expect(get).toHaveBeenCalledWith('contract-templates/max.json', {
			onlyIf: { etagMatches: 'etag-v1' },
			range: { offset: 0, length: bytes.byteLength + 1 },
		});
		expect(body.arrayBuffer).toHaveBeenCalledOnce();
	});

	it('fails closed when the object changes between HEAD and the conditional range GET', async () => {
		const arrayBuffer = vi.fn();
		const get = vi.fn(
			async () => ({ ...r2Metadata(8, 'etag-v2'), arrayBuffer }) as unknown as R2Object
		);
		const bucket = {
			head: vi.fn(async () => r2Metadata(8, 'etag-v1')),
			get,
		} as unknown as R2Bucket;

		await expect(
			contractArtifactStore(bucket).get('contract-templates/changed.json', {
				maximumSizeBytes: 16,
				expectedSizeBytes: 8,
			})
		).rejects.toMatchObject({ code: 'CONTRACT_OBJECT_CHANGED' });
		expect(get).toHaveBeenCalledWith('contract-templates/changed.json', {
			onlyIf: { etagMatches: 'etag-v1' },
			range: { offset: 0, length: 17 },
		});
		expect(arrayBuffer).not.toHaveBeenCalled();
	});

	it('fails closed for a truncated bounded response', async () => {
		const body = r2Body(new Uint8Array(7), 'etag-v1', 8);
		const bucket = {
			head: vi.fn(async () => r2Metadata(8)),
			get: vi.fn(async () => body),
		} as unknown as R2Bucket;

		await expect(
			contractArtifactStore(bucket).get('contract-templates/truncated.json', {
				maximumSizeBytes: 8,
				expectedSizeBytes: 8,
			})
		).rejects.toMatchObject({ code: 'CONTRACT_OBJECT_TRUNCATED' });
		expect(body.arrayBuffer).toHaveBeenCalledOnce();
	});
});

import { describe, expect, it } from 'vitest';
import { contractArtifactStore } from '$lib/server/contracts/storage';

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
});

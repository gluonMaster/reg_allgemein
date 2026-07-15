import { hashIdempotencyKey, hashRequestFingerprint } from '$lib/server/db/foundation-repository';

describe('idempotency hashes', () => {
	it('are deterministic, scoped and never equal to the raw key', async () => {
		const first = await hashIdempotencyKey('registration', 'raw-client-key');
		const second = await hashIdempotencyKey('registration', 'raw-client-key');
		const otherScope = await hashIdempotencyKey('contract', 'raw-client-key');
		const request = await hashRequestFingerprint('registration', '{"field":"value"}');

		expect(first).toMatch(/^[a-f0-9]{64}$/);
		expect(first).toBe(second);
		expect(first).not.toBe(otherScope);
		expect(first).not.toBe(request);
		expect(first).not.toContain('raw-client-key');
	});
});

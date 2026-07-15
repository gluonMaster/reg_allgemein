import { FoundationRepository } from '$lib/server/db/foundation-repository';

describe('guard storage failures', () => {
	it('fails closed when the rate-limit store is unavailable', async () => {
		const unavailableDatabase = {
			first: vi.fn().mockRejectedValue(new Error('storage unavailable')),
		};
		const repository = new FoundationRepository(unavailableDatabase as never);

		await expect(
			repository.consumeRateLimit({
				scope: 'registration',
				subjectHash: 'a'.repeat(64),
				windowStart: '2026-07-15T10:00:00.000Z',
				expiresAt: '2026-07-15T10:01:00.000Z',
				now: '2026-07-15T10:00:01.000Z',
				limit: 3,
			})
		).rejects.toMatchObject({
			name: 'FoundationStorageError',
			code: 'RATE_LIMIT_STORAGE_UNAVAILABLE',
		});
	});
});

import type { AuthenticatedUser } from '$lib/server/auth/session';

const mocks = vi.hoisted(() => ({
	resolve: vi.fn(),
}));

vi.mock('$lib/server/security/csrf', () => ({
	requireCsrf: vi.fn(async (input: { submittedToken?: string; user?: AuthenticatedUser }) => {
		if (!input.user || input.submittedToken !== 'valid-csrf') throw new Error('CSRF_INVALID');
	}),
}));

vi.mock('$lib/server/outbox/runtime', () => ({
	requestOutboxRuntime: () => ({
		repository: { resolveTelegramUnknown: mocks.resolve, listAdmin: vi.fn(async () => []) },
	}),
}));

vi.mock('$lib/server/config/runtime', () => ({
	loadRuntimeConfig: () => ({ messaging: { telegramMaxAttempts: 5 } }),
}));

import * as route from '../../src/routes/admin/outbox/+page.server';

const admin: AuthenticatedUser = {
	id: 'outbox-route-admin', role: 'admin', emailVerified: true,
	sessionId: 'outbox-route-admin-session', sessionVersion: 1, csrfHash: 'a'.repeat(64),
};
const parent: AuthenticatedUser = { ...admin, id: 'outbox-route-parent', role: 'parent' };

function event(input: {
	user?: AuthenticatedUser;
	fields?: Record<string, string>;
}) {
	const body = new URLSearchParams(input.fields ?? {});
	return {
		request: new Request('https://portal.example.test/admin/outbox?/resolveTelegram', {
			method: 'POST', body,
		}),
		cookies: { get: vi.fn(() => 'valid-csrf') },
		locals: { user: input.user, requestId: 'outbox-route-request' },
		platform: { env: {} },
	};
}

const valid = {
	_csrf: 'valid-csrf',
	outboxId: 'telegram-outbox-1',
	attemptId: 'telegram-attempt-2',
	outboxAction: 'retry_after_review',
	idempotencyKey: 'telegram-route-resolution-1',
	confirmation: 'confirmed',
};

describe('/admin/outbox unknown-delivery resolution boundary', () => {
	beforeEach(() => mocks.resolve.mockReset().mockResolvedValue({ replayed: false }));

	it('rejects unauthenticated, parent, missing CSRF and missing confirmation before mutation', async () => {
		for (const candidate of [
			event({ fields: valid }),
			event({ user: parent, fields: valid }),
			event({ user: admin, fields: { ...valid, _csrf: 'wrong' } }),
			event({ user: admin, fields: { ...valid, confirmation: 'not-confirmed' } }),
		]) {
			expect(await route.actions.resolveTelegram(candidate as never)).toMatchObject({
				status: 409, data: { success: false },
			});
		}
		expect(mocks.resolve).not.toHaveBeenCalled();
	});

	it('binds the exact attempt and server-owned safe reason to the audited command', async () => {
		const result = await route.actions.resolveTelegram(event({ user: admin, fields: valid }) as never);
		expect(result).toMatchObject({ success: true });
		expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({
			outboxId: 'telegram-outbox-1', attemptId: 'telegram-attempt-2',
			action: 'retry_after_review', reasonCode: 'message_absence_verified',
			idempotencyKey: 'telegram-route-resolution-1', additionalAttempts: 5,
		}));
	});

	it('fails closed when the exact attempt is stale and does not expose repository diagnostics', async () => {
		mocks.resolve.mockRejectedValueOnce(new Error('PII client@example.test stale attempt'));
		const result = await route.actions.resolveTelegram(event({ user: admin, fields: valid }) as never);
		expect(result).toMatchObject({ status: 409, data: { success: false } });
		expect(JSON.stringify(result)).not.toContain('client@example.test');
	});
});

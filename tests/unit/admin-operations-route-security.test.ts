import { describe, expect, it } from 'vitest';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { hashCsrfToken } from '$lib/server/auth/tokens';
import * as operationsRoute from '../../src/routes/admin/operations/+page.server';

type TestRole = 'admin' | 'parent';

async function sessionUser(role: TestRole, csrfToken: string) {
	return {
		id: `${role}-operations-route-test`,
		role,
		emailVerified: true,
		sessionId: `${role}-operations-route-session`,
		sessionVersion: 1,
		csrfHash: await hashCsrfToken(csrfToken),
	};
}

function syntheticEvent(input: {
	user?: Awaited<ReturnType<typeof sessionUser>>;
	csrfCookie?: string;
	form?: Record<string, string>;
}) {
	let platformAccessed = false;
	const platform = Object.defineProperty({}, 'env', {
		get() {
			platformAccessed = true;
			throw new Error('PLATFORM_MUST_NOT_BE_ACCESSED');
		},
	});
	return {
		event: {
			request: new Request('https://portal.example.test/admin/operations?/run', {
				method: 'POST',
				body: new URLSearchParams(input.form ?? {}),
			}),
			cookies: {
				get: (name: string) =>
					name === CSRF_COOKIE_NAME ? input.csrfCookie : undefined,
			},
			locals: {
				user: input.user,
				requestId: 'operations-route-security-test',
			},
			platform,
		},
		platformWasAccessed: () => platformAccessed,
	};
}

function expectActionRejected(result: unknown) {
	expect(result).toMatchObject({
		status: 409,
		data: { success: false },
	});
}

describe('/admin/operations route security', () => {
	it('exports only an admin-protected load and one named server action', () => {
		expect(typeof operationsRoute.load).toBe('function');
		expect(Object.keys(operationsRoute.actions)).toEqual(['run']);
		expect('GET' in operationsRoute).toBe(false);
		expect('POST' in operationsRoute).toBe(false);
		expect('run' in operationsRoute).toBe(false);
	});

	it('rejects unauthenticated and parent load before touching runtime state', async () => {
		const unauthenticated = syntheticEvent({});
		await expect(operationsRoute.load(unauthenticated.event as never)).rejects.toMatchObject({
			code: 'AUTHENTICATION_REQUIRED',
		});
		expect(unauthenticated.platformWasAccessed()).toBe(false);

		const token = 'parent-operations-load-csrf-token';
		const parent = syntheticEvent({ user: await sessionUser('parent', token) });
		await expect(operationsRoute.load(parent.event as never)).rejects.toMatchObject({
			code: 'FORBIDDEN',
		});
		expect(parent.platformWasAccessed()).toBe(false);
	});

	it('rejects a missing CSRF token and a parent action before scheduler access', async () => {
		const adminToken = 'admin-operations-action-csrf-token';
		const admin = await sessionUser('admin', adminToken);
		const missingCsrf = syntheticEvent({
			user: admin,
			form: {
				jobName: 'document_quarantine',
				confirmation: 'confirmed',
				idempotencyKey: 'operations-route-command',
			},
		});
		expectActionRejected(await operationsRoute.actions.run(missingCsrf.event as never));
		expect(missingCsrf.platformWasAccessed()).toBe(false);

		const parentToken = 'parent-operations-action-csrf-token';
		const parent = await sessionUser('parent', parentToken);
		const parentAction = syntheticEvent({
			user: parent,
			csrfCookie: parentToken,
			form: {
				_csrf: parentToken,
				jobName: 'document_quarantine',
				confirmation: 'confirmed',
				idempotencyKey: 'operations-route-parent-command',
			},
		});
		expectActionRejected(await operationsRoute.actions.run(parentAction.event as never));
		expect(parentAction.platformWasAccessed()).toBe(false);
	});

	it.each([
		{
			name: 'unknown job',
			form: {
				jobName: 'unknown_manual_job',
				confirmation: 'confirmed',
				idempotencyKey: 'operations-route-unknown-job',
			},
		},
		{
			name: 'missing confirmation',
			form: {
				jobName: 'document_quarantine',
				confirmation: 'not-confirmed',
				idempotencyKey: 'operations-route-no-confirmation',
			},
		},
		{
			name: 'empty idempotency key',
			form: {
				jobName: 'document_quarantine',
				confirmation: 'confirmed',
				idempotencyKey: '   ',
			},
		},
		{
			name: 'oversized idempotency key',
			form: {
				jobName: 'document_quarantine',
				confirmation: 'confirmed',
				idempotencyKey: 'x'.repeat(201),
			},
		},
	])('fails closed for $name before scheduler access', async ({ form }) => {
		const token = 'admin-operations-invalid-form-csrf-token';
		const probe = syntheticEvent({
			user: await sessionUser('admin', token),
			csrfCookie: token,
			form: { _csrf: token, ...form },
		});
		expectActionRejected(await operationsRoute.actions.run(probe.event as never));
		expect(probe.platformWasAccessed()).toBe(false);
	});
});

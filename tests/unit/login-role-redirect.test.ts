const authMocks = vi.hoisted(() => ({
	login: vi.fn(),
	setSessionCookies: vi.fn(),
	translatedPublicAuthError: vi.fn(),
}));

vi.mock('$lib/server/auth/http', () => ({
	requestAuthRuntime: () => ({
		config: { appEnvironment: 'preview' },
		service: { login: authMocks.login },
	}),
	requestSubject: () => 'synthetic-login-subject',
	translatedPublicAuthError: authMocks.translatedPublicAuthError,
}));

vi.mock('$lib/server/auth/session', () => ({
	setSessionCookies: authMocks.setSessionCookies,
}));

import { actions } from '../../src/routes/auth/login/+page.server';

function eventWithClientRole(role: 'parent' | 'admin') {
	const form = new FormData();
	form.set('email', 'server-known-role@example.test');
	form.set('password', 'synthetic-password-123');
	form.set('role', role);
	return {
		locals: { locale: 'de' },
		cookies: {},
		request: new Request('https://portal.example.test/auth/login', {
			method: 'POST',
			body: form,
		}),
	};
}

function session(role: 'parent' | 'admin') {
	return {
		role,
		sessionId: `${role}-session`,
		sessionToken: `${role}-session-token`,
		csrfToken: `${role}-csrf-token`,
		expiresAt: '2026-08-12T15:00:00.000Z',
	};
}

describe('successful login role redirect', () => {
	beforeEach(() => {
		authMocks.login.mockReset();
		authMocks.setSessionCookies.mockReset();
		authMocks.translatedPublicAuthError.mockReset();
		authMocks.translatedPublicAuthError.mockReturnValue({
			status: 400,
			message: 'rejected',
			messageKey: 'auth.invalidCredentials',
		});
	});

	it.each([
		['admin', '/admin'],
		['parent', '/cabinet'],
	] as const)('uses the server-known %s role for the redirect', async (serverRole, location) => {
		const result = session(serverRole);
		authMocks.login.mockResolvedValue(result);

		await expect(
			actions.default(
				eventWithClientRole(serverRole === 'admin' ? 'parent' : 'admin') as never
			)
		).rejects.toMatchObject({ status: 303, location });

		expect(authMocks.login).toHaveBeenCalledWith({
			data: {
				email: 'server-known-role@example.test',
				password: 'synthetic-password-123',
			},
			requestSubject: 'synthetic-login-subject',
		});
		expect(authMocks.setSessionCookies).toHaveBeenCalledWith({
			cookies: expect.any(Object),
			session: result,
			environment: 'preview',
		});
	});

	it.each([
		['auth.invalidCredentials', ['email', 'password']],
		['auth.rateLimited', undefined],
		['auth.serviceUnavailable', undefined],
	] as const)(
		'associates only credential failures with the fields: %s',
		async (messageKey, invalidFields) => {
			authMocks.login.mockRejectedValue(new Error('synthetic auth failure'));
			authMocks.translatedPublicAuthError.mockReturnValue({
				status:
					messageKey === 'auth.rateLimited'
						? 429
						: messageKey === 'auth.serviceUnavailable'
							? 503
							: 400,
				message: 'neutral failure',
				messageKey,
			});

			const response = await actions.default(eventWithClientRole('parent') as never);

			expect(response).toMatchObject({
				status: expect.any(Number),
				data: { message: 'neutral failure', invalidFields },
			});
		}
	);
});

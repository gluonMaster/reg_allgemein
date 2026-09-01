const registrationMocks = vi.hoisted(() => ({
	register: vi.fn(),
	translatedPublicAuthError: vi.fn(),
}));

vi.mock('$lib/server/config/runtime', () => ({
	loadRuntimeConfig: () => ({
		auth: {
			privacyNoticeVersion: 'synthetic-current-notice-v2',
			publicEnabled: true,
		},
		turnstileSiteKey: 'synthetic-site-key',
	}),
}));

vi.mock('$lib/server/auth/http', () => ({
	requestAuthRuntime: () => ({ service: { register: registrationMocks.register } }),
	requestSubject: () => 'synthetic-registration-subject',
	translatedPublicAuthError: registrationMocks.translatedPublicAuthError,
}));

import { AuthFlowError } from '$lib/server/auth/auth-service';
import { germanCatalog } from '$lib/i18n';
import { actions } from '../../src/routes/auth/register/+page.server';

function registrationEvent(overrides: Record<string, string> = {}) {
	const form = new FormData();
	for (const [name, value] of Object.entries({
		firstName: 'Synthetic',
		lastName: 'Parent',
		email: 'synthetic-parent@example.test',
		password: 'synthetic-password-123',
		privacyAccepted: 'on',
		privacyNoticeVersion: 'synthetic-current-notice-v2',
		'cf-turnstile-response': 'synthetic-turnstile-pass',
		...overrides,
	})) {
		if (value !== '') form.set(name, value);
	}
	return {
		platform: { env: {} },
		locals: { requestId: 'synthetic-registration-request' },
		request: new Request('https://portal.example.test/auth/register', {
			method: 'POST',
			body: form,
		}),
	};
}

describe('registration route feedback', () => {
	beforeEach(() => {
		registrationMocks.register.mockReset();
		registrationMocks.translatedPublicAuthError.mockReset();
		registrationMocks.translatedPublicAuthError.mockReturnValue({
			status: 400,
			message: germanCatalog['auth.invalidInput'],
			messageKey: 'auth.invalidInput',
		});
	});

	it('rejects a missing Turnstile token without clearing safe fields or the notice version', async () => {
		const response = await actions.default(
			registrationEvent({ 'cf-turnstile-response': '' }) as never
		);

		expect(response).toMatchObject({
			status: 400,
			data: {
				success: false,
				message: germanCatalog['auth.turnstileRequired'],
				invalidFields: ['turnstileToken'],
				values: {
					firstName: 'Synthetic',
					lastName: 'Parent',
					email: 'synthetic-parent@example.test',
					privacyAccepted: true,
				},
				privacyNoticeVersion: 'synthetic-current-notice-v2',
			},
		});
		expect((response as { data: Record<string, unknown> }).data).not.toHaveProperty('password');
		expect(registrationMocks.register).not.toHaveBeenCalled();
	});

	it('forces renewed privacy acceptance when the rendered notice version is stale', async () => {
		registrationMocks.register.mockRejectedValue(new AuthFlowError('PRIVACY_VERSION_MISMATCH'));

		const response = await actions.default(
			registrationEvent({ privacyNoticeVersion: 'synthetic-stale-notice-v1' }) as never
		);

		expect(response).toMatchObject({
			status: 400,
			data: {
				message: germanCatalog['auth.privacyNoticeChanged'],
				invalidFields: ['privacyNoticeVersion'],
				values: { privacyAccepted: false },
				privacyNoticeVersion: 'synthetic-current-notice-v2',
			},
		});
	});

	it('passes a complete registration to the service', async () => {
		registrationMocks.register.mockResolvedValue({ accepted: true, created: true });

		const response = await actions.default(registrationEvent() as never);

		expect(response).toEqual({
			success: true,
			message: germanCatalog['auth.registrationAccepted'],
		});
		expect(registrationMocks.register).toHaveBeenCalledWith({
			data: {
				firstName: 'Synthetic',
				lastName: 'Parent',
				email: 'synthetic-parent@example.test',
				password: 'synthetic-password-123',
				privacyAccepted: true,
				privacyNoticeVersion: 'synthetic-current-notice-v2',
				turnstileToken: 'synthetic-turnstile-pass',
			},
			requestSubject: 'synthetic-registration-subject',
			remoteIp: 'synthetic-registration-subject',
			requestId: 'synthetic-registration-request',
		});
	});
});

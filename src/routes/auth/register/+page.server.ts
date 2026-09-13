import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { registerInputSchema } from '$lib/server/auth/contracts';
import {
	requestAuthRuntime,
	requestSubject,
	translatedPublicAuthError,
} from '$lib/server/auth/http';
import { AuthFlowError } from '$lib/server/auth/auth-service';

const registrationFields = [
	'email',
	'password',
	'firstName',
	'lastName',
	'privacyAccepted',
	'privacyNoticeVersion',
	'turnstileToken',
] as const;

function retainedText(value: FormDataEntryValue | null, maximumLength: number): string {
	return typeof value === 'string' ? value.slice(0, maximumLength) : '';
}

export const load: PageServerLoad = ({ platform }) => {
	const config = loadRuntimeConfig(platform?.env);
	return {
		privacyNoticeVersion: config.auth.privacyNoticeVersion ?? '',
		turnstileSiteKey: config.turnstileSiteKey ?? '',
		authEnabled: config.auth.publicEnabled,
	};
};

export const actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const config = loadRuntimeConfig(event.platform?.env);
		const input = {
			email: form.get('email'),
			password: form.get('password'),
			firstName: form.get('firstName'),
			lastName: form.get('lastName'),
			privacyAccepted: form.get('privacyAccepted') === 'on',
			privacyNoticeVersion: form.get('privacyNoticeVersion'),
			turnstileToken: form.get('cf-turnstile-response'),
		};
		const values = {
			email: retainedText(form.get('email'), 254),
			firstName: retainedText(form.get('firstName'), 100),
			lastName: retainedText(form.get('lastName'), 100),
			privacyAccepted: form.get('privacyAccepted') === 'on',
		};
		const privacyNoticeVersion = config.auth.privacyNoticeVersion ?? '';
		const parsed = registerInputSchema.safeParse(input);
		if (!parsed.success) {
			const invalidFields = registrationFields.filter((field) =>
				parsed.error.issues.some((issue) => issue.path[0] === field)
			);
			const privacyVersionInvalid = invalidFields.includes('privacyNoticeVersion');
			return fail(400, {
				success: false,
				message: translate(event.locals.locale,
					invalidFields.includes('turnstileToken')
						? 'auth.turnstileRequired'
						: privacyVersionInvalid
							? 'auth.privacyNoticeChanged'
							: 'auth.invalidInput'
				),
				invalidFields,
				values: privacyVersionInvalid ? { ...values, privacyAccepted: false } : values,
				privacyNoticeVersion,
			});
		}

		try {
			const { service } = requestAuthRuntime(event);
			await service.register({
				data: parsed.data,
				requestSubject: requestSubject(event),
				remoteIp: requestSubject(event),
				requestId: event.locals.requestId,
			});
			return { success: true, message: translate(event.locals.locale, 'auth.registrationAccepted') };
		} catch (error) {
			const result = translatedPublicAuthError(error, event.locals.locale);
			const turnstileRejected =
				error instanceof AuthFlowError && error.code === 'TURNSTILE_REJECTED';
			const privacyVersionMismatch =
				error instanceof AuthFlowError && error.code === 'PRIVACY_VERSION_MISMATCH';
			return fail(result.status, {
				success: false,
				message: translate(event.locals.locale,
					turnstileRejected
						? 'auth.turnstileRequired'
						: privacyVersionMismatch
							? 'auth.privacyNoticeChanged'
							: result.messageKey
				),
				invalidFields: turnstileRejected
					? (['turnstileToken'] as const)
					: privacyVersionMismatch
						? (['privacyNoticeVersion'] as const)
						: undefined,
				values: privacyVersionMismatch ? { ...values, privacyAccepted: false } : values,
				privacyNoticeVersion,
			});
		}
	},
} satisfies Actions;

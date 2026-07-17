import type { Cookies } from '@sveltejs/kit';
import { CSRF_COOKIE_NAME } from '$lib/server/auth/session';
import { constantTimeEqual, hashCsrfToken } from '$lib/server/auth/tokens';
import { AuthorizationError, requireAuthenticated } from './authorization';

export async function requireCsrf(input: {
	cookies: Cookies;
	user: App.Locals['user'] | undefined;
	submittedToken: string | null | undefined;
}): Promise<void> {
	const user = requireAuthenticated(input.user);
	const cookieToken = input.cookies.get(CSRF_COOKIE_NAME);
	if (
		!cookieToken ||
		!input.submittedToken ||
		!constantTimeEqual(cookieToken, input.submittedToken)
	) {
		throw new AuthorizationError('CSRF_REJECTED');
	}
	const submittedHash = await hashCsrfToken(input.submittedToken);
	if (!constantTimeEqual(submittedHash, user.csrfHash)) {
		throw new AuthorizationError('CSRF_REJECTED');
	}
}

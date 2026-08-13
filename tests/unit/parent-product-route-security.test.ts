import type { AuthenticatedUser } from '$lib/server/auth/session';
import * as privacyRoute from '../../src/routes/account/privacy/+page.server';
import * as securityRoute from '../../src/routes/account/security/+page.server';
import * as cabinetRoute from '../../src/routes/cabinet/+page.server';
import * as legacyClaimRoute from '../../src/routes/cabinet/legacy-claim/+page.server';
import * as trialRoute from '../../src/routes/catalog/[courseId]/trial/+page.server';
import * as messagesRoute from '../../src/routes/messages/+page.server';
import * as messageRoute from '../../src/routes/messages/[publicReference]/+page.server';
import * as requestRoute from '../../src/routes/requests/[requestId]/+page.server';
import * as documentDownloadRoute from '../../src/routes/requests/documents/[documentId]/download/+server';
import * as newRequestRoute from '../../src/routes/requests/new/+page.server';

const parent: AuthenticatedUser = {
	id: 'route-parent',
	role: 'parent',
	emailVerified: true,
	sessionId: 'route-parent-session',
	sessionVersion: 1,
	csrfHash: 'a'.repeat(64),
};

const admin: AuthenticatedUser = {
	...parent,
	id: 'route-admin',
	role: 'admin',
	sessionId: 'route-admin-session',
};

function eventFor(user: AuthenticatedUser, path: string) {
	return {
		cookies: { get: vi.fn(() => 'csrf-token') },
		locals: { user, requestId: 'route-security-test' },
		params: {
			artifactId: 'artifact-1',
			courseId: 'course-1',
			documentId: 'document-1',
			publicReference: 'thread-1',
			requestId: 'request-1',
		},
		request: new Request(`https://portal.example.test${path}`),
		route: { id: path },
		url: new URL(`https://portal.example.test${path}`),
	};
}

describe('parent product route boundaries', () => {
	it.each([
		['cabinet', cabinetRoute.load, '/cabinet'],
		['legacy claim', legacyClaimRoute.load, '/cabinet/legacy-claim'],
		['messages', messagesRoute.load, '/messages'],
		['message detail', messageRoute.load, '/messages/thread-1'],
		['new request', newRequestRoute.load, '/requests/new'],
		['request detail', requestRoute.load, '/requests/request-1'],
		['trial submission', trialRoute.load, '/catalog/course-1/trial'],
		['privacy self-service', privacyRoute.load, '/account/privacy'],
	])('rejects a current admin before loading the %s product route', async (_name, load, path) => {
		await expect(Promise.resolve().then(() => load(eventFor(admin, path) as never)))
			.rejects.toMatchObject({ code: 'FORBIDDEN' });
	});

	it('rejects a current admin before a parent document body is read', async () => {
		await expect(documentDownloadRoute.GET(
			eventFor(admin, '/requests/documents/document-1/download') as never
		)).rejects.toMatchObject({ code: 'FORBIDDEN' });
	});

	it('allows a parent through a parent route and keeps account security shared', async () => {
		expect(await legacyClaimRoute.load(
			eventFor(parent, '/cabinet/legacy-claim?token=synthetic') as never
		)).toMatchObject({ token: 'synthetic', csrfToken: 'csrf-token' });
		expect(await securityRoute.load(
			eventFor(admin, '/account/security') as never
		)).toEqual({ csrfToken: 'csrf-token', homeHref: '/admin', role: 'admin' });
		expect(await securityRoute.load(
			eventFor(parent, '/account/security') as never
		)).toEqual({ csrfToken: 'csrf-token', homeHref: '/cabinet', role: 'parent' });
	});
});

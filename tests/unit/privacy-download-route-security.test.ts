import type { AuthenticatedUser } from '$lib/server/auth/session';
import { PrivacyServiceError } from '$lib/server/privacy/privacy-service';

const runtimeMocks = vi.hoisted(() => ({
	downloadExport: vi.fn(async () => ({
		body: new TextEncoder().encode('{"synthetic":true}').buffer,
		contentType: 'application/json; charset=utf-8',
		filename: 'synthetic-export.json',
	})),
}));

vi.mock('$lib/server/privacy/runtime', () => ({
	requestPrivacyRuntime: () => ({ service: { downloadExport: runtimeMocks.downloadExport } }),
}));

import * as parentDownloadRoute from '../../src/routes/account/privacy/exports/[artifactId]/download/+server';
import * as adminDownloadRoute from '../../src/routes/admin/privacy/exports/[artifactId]/download/+server';

const parent: AuthenticatedUser = {
	id: 'privacy-route-parent',
	role: 'parent',
	emailVerified: true,
	sessionId: 'privacy-parent-session',
	sessionVersion: 1,
	csrfHash: 'a'.repeat(64),
};

const admin: AuthenticatedUser = {
	...parent,
	id: 'privacy-route-admin',
	role: 'admin',
	sessionId: 'privacy-admin-session',
};

function eventFor(user: AuthenticatedUser, adminRoute: boolean) {
	const prefix = adminRoute ? '/admin/privacy' : '/account/privacy';
	return {
		locals: { user, requestId: 'privacy-download-route-test' },
		params: { artifactId: 'artifact-1' },
		request: new Request(
			`https://portal.example.test${prefix}/exports/artifact-1/download`
		),
	};
}

describe('privacy export download route roles', () => {
	beforeEach(() => runtimeMocks.downloadExport.mockClear());

	it('allows only a parent on the self-service endpoint', async () => {
		await expect(parentDownloadRoute.GET(eventFor(admin, false) as never))
			.rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(runtimeMocks.downloadExport).not.toHaveBeenCalled();

		const response = await parentDownloadRoute.GET(eventFor(parent, false) as never);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('content-disposition'))
			.toBe('attachment; filename="synthetic-export.json"');
		expect(runtimeMocks.downloadExport).toHaveBeenCalledWith({
			actor: parent,
			artifactId: 'artifact-1',
			requestId: 'privacy-download-route-test',
		});
	});

	it('keeps the administrative endpoint admin-only', async () => {
		await expect(adminDownloadRoute.GET(eventFor(parent, true) as never))
			.rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect(runtimeMocks.downloadExport).not.toHaveBeenCalled();

		const response = await adminDownloadRoute.GET(eventFor(admin, true) as never);
		expect(response.status).toBe(200);
		expect(runtimeMocks.downloadExport).toHaveBeenCalledWith({
			actor: expect.objectContaining({ id: admin.id, role: 'admin' }),
			artifactId: 'artifact-1',
			requestId: 'privacy-download-route-test',
		});
	});

	it.each([
		['parent', parentDownloadRoute.GET, parent, false],
		['admin', adminDownloadRoute.GET, admin, true],
	] as const)('maps an inaccessible %s artifact to a safe 404', async (
		_role,
		handler,
		actor,
		adminRoute
	) => {
		runtimeMocks.downloadExport.mockRejectedValueOnce(
			new PrivacyServiceError('PRIVACY_EXPORT_NOT_FOUND')
		);
		await expect(handler(eventFor(actor, adminRoute) as never)).rejects.toMatchObject({
			status: 404,
			body: {
				code: 'PRIVACY_EXPORT_NOT_FOUND',
				requestId: 'privacy-download-route-test',
			},
		});
	});
});

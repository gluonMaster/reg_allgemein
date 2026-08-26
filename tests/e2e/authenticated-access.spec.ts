import { expect, test, type APIResponse, type BrowserContext, type Page } from '@playwright/test';
import { germanCatalog } from '../../src/lib/i18n';
import { SESSION_COOKIE_NAME } from '../../src/lib/server/auth/session';
import {
	e2eOrigin,
	login,
	newE2eContext,
	syntheticIdentities,
	syntheticPassword,
} from './support/authenticated';

async function closeContexts(contexts: readonly BrowserContext[]): Promise<void> {
	await Promise.all(contexts.map((context) => context.close()));
}

async function expectRouteStatus(page: Page, route: string, status: number): Promise<void> {
	const response = await page.goto(route);
	expect(response?.status(), route).toBe(status);
}

async function csrfToken(context: BrowserContext): Promise<string> {
	const cookie = (await context.cookies()).find((candidate) => candidate.name === 'kolibri_csrf');
	expect(cookie).toBeDefined();
	return cookie!.value;
}

async function expectDeniedResponse(
	response: APIResponse,
	status: number,
	forbiddenText: string
): Promise<string> {
	expect(response.status()).toBe(status);
	const body = await response.text();
	expect(body).not.toContain(forbiddenText);
	return body;
}

async function expectActionDenied(response: APIResponse, message: string): Promise<void> {
	expect(response.status()).toBeLessThan(500);
	expect(await response.text()).toContain(message);
}

async function expectNotFoundAction(response: APIResponse, message: string): Promise<void> {
	// A SvelteKit ActionFailure keeps status 404 in the direct route contract, while a
	// normal browser form POST can serialize it into a rendered 2xx response.
	expect(response.status()).toBeLessThan(500);
	expect(await response.text()).toContain(message);
}

test.describe.serial('authenticated role, ownership and session boundaries', () => {
	test('redirects both roles, isolates owned rows and enforces the route matrix', async ({
		browser,
	}, testInfo) => {
		const parentAContext = await newE2eContext(browser, testInfo);
		const parentBContext = await newE2eContext(browser, testInfo);
		const adminContext = await newE2eContext(browser, testInfo);
		try {
			const parentA = await parentAContext.newPage();
			const parentB = await parentBContext.newPage();
			const admin = await adminContext.newPage();
			await login(parentA, syntheticIdentities.parentA);
			await login(parentB, syntheticIdentities.parentB);
			await login(admin, syntheticIdentities.admin);

			await expect(
				parentA
					.getByRole('textbox', { name: germanCatalog['cabinet.child.fullName'] })
					.first()
			).toHaveValue('Synthetic Child A');
			expect(
				await parentA
					.locator('input')
					.evaluateAll((inputs) =>
						inputs.map((input) => (input as HTMLInputElement).value)
					)
			).not.toContain('Synthetic Child B');
			await expect(parentA.locator('a[href="/requests/e2e-request-a"]')).toBeVisible();
			await expect(parentA.locator('a[href="/requests/e2e-request-b"]')).toHaveCount(0);

			await expect(
				parentB
					.getByRole('textbox', { name: germanCatalog['cabinet.child.fullName'] })
					.first()
			).toHaveValue('Synthetic Child B');
			expect(
				await parentB
					.locator('input')
					.evaluateAll((inputs) =>
						inputs.map((input) => (input as HTMLInputElement).value)
					)
			).not.toContain('Synthetic Child A');
			await expect(parentB.locator('a[href="/requests/e2e-request-b"]')).toBeVisible();
			await expect(parentB.locator('a[href="/requests/e2e-request-a"]')).toHaveCount(0);
			await expectRouteStatus(parentA, '/requests/e2e-request-b', 404);

			const csrfCookie = (await parentAContext.cookies()).find(
				(cookie) => cookie.name === 'kolibri_csrf'
			);
			expect(csrfCookie).toBeDefined();
			const foreignMutation = await parentAContext.request.post(
				'/requests/e2e-request-b?/submit',
				{
					form: {
						_csrf: csrfCookie!.value,
						expectedVersion: '1',
						idempotencyKey: 'e2e-foreign-request-submit',
					},
				}
			);
			await expectNotFoundAction(foreignMutation, germanCatalog['request.error.submit']);
			const foreignRequestAfterMutation =
				await parentBContext.request.get('/requests/e2e-request-b');
			expect(foreignRequestAfterMutation.status()).toBe(200);
			expect(await foreignRequestAfterMutation.text()).toContain(
				germanCatalog['request.status.draft']
			);

			for (const route of ['/admin', '/admin/users', '/admin/requests', '/admin/privacy']) {
				await expectRouteStatus(parentA, route, 403);
			}
			await expectRouteStatus(parentA, '/account/security', 200);

			for (const route of [
				'/cabinet',
				'/account/privacy',
				'/messages',
				'/requests/new?kind=individual',
				'/contracts/00000000-0000-4000-8000-000000000001',
				'/catalog/e2e-course/trial',
			]) {
				await expectRouteStatus(admin, route, 403);
			}
			await expectRouteStatus(admin, '/account/security', 200);
		} finally {
			await closeContexts([parentAContext, parentBContext, adminContext]);
		}
	});

	test('supports keyboard login without horizontal overflow on an authenticated mobile view', async ({
		browser,
	}, testInfo) => {
		const context = await browser.newContext({
			baseURL: e2eOrigin(testInfo),
			viewport: { width: 390, height: 844 },
		});
		try {
			const page = await context.newPage();
			await page.goto('/auth/login');
			const email = page.getByLabel(germanCatalog['auth.emailLabel']);
			const password = page.getByLabel(germanCatalog['auth.passwordLabel']);
			await email.focus();
			await page.keyboard.type(syntheticIdentities.parentA.email);
			await page.keyboard.press('Tab');
			await expect(password).toBeFocused();
			await page.keyboard.type(syntheticPassword);
			await Promise.all([
				page.waitForURL((url) => url.pathname === syntheticIdentities.parentA.destination),
				page.keyboard.press('Enter'),
			]);
			await expect(page.locator('html')).toHaveAttribute('lang', 'de');
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			await expect(
				page.getByRole('link', { name: germanCatalog['cabinet.link.security'] })
			).toBeVisible();
			const hasHorizontalOverflow = await page.evaluate(
				() => document.documentElement.scrollWidth > window.innerWidth
			);
			expect(hasHorizontalOverflow).toBe(false);
		} finally {
			await context.close();
		}
	});

	test('denies the complete parent A to parent B IDOR and CSRF matrix without owner-visible changes', async ({
		browser,
	}, testInfo) => {
		test.setTimeout(60_000);
		const parentAContext = await newE2eContext(browser, testInfo);
		const parentBContext = await newE2eContext(browser, testInfo);
		try {
			const parentA = await parentAContext.newPage();
			const parentB = await parentBContext.newPage();
			await login(parentA, syntheticIdentities.parentA);
			await login(parentB, syntheticIdentities.parentB);
			const validCsrf = await csrfToken(parentAContext);
			const parentBCsrf = await csrfToken(parentBContext);

			for (const [caseName, rejectedCsrf] of [
				['missing', undefined],
				['wrong', 'wrong-e2e-csrf-token'],
			] as const) {
				const form: Record<string, string> = {
					childId: 'e2e-child-a',
					fullName: `Synthetic CSRF mutation ${caseName}`,
					birthDate: '2015-01-10',
					confirmDuplicate: 'false',
				};
				if (rejectedCsrf) form._csrf = rejectedCsrf;
				const response = await parentAContext.request.post('/cabinet?/updateChild', {
					form,
				});
				await expectActionDenied(response, germanCatalog['auth.csrfRejected']);
			}
			await parentA.goto('/cabinet');
			await expect(parentA.locator('#name-e2e-child-a')).toHaveValue('Synthetic Child A');

			const childMutation = await parentAContext.request.post('/cabinet?/updateChild', {
				form: {
					_csrf: validCsrf,
					childId: 'e2e-child-b',
					fullName: 'Synthetic foreign child mutation',
					birthDate: '2016-02-20',
					confirmDuplicate: 'false',
				},
			});
			await expectNotFoundAction(childMutation, germanCatalog['cabinet.child.rejected']);
			await parentB.goto('/cabinet');
			await expect(parentB.locator('#name-e2e-child-b')).toHaveValue('Synthetic Child B');

			const foreignRequestSave = await parentAContext.request.post(
				'/requests/e2e-request-b?/save',
				{
					form: {
						_csrf: validCsrf,
						childId: 'e2e-child-a',
						expectedVersion: '1',
						fundingKind: 'self_pay',
						idempotencyKey: 'e2e-foreign-request-save',
						preferredFormat: 'onsite',
						requestKind: 'individual',
						subjects: 'Synthetic rejected request mutation',
					},
				}
			);
			await expectNotFoundAction(foreignRequestSave, germanCatalog['request.error.change']);
			const foreignRequestCancel = await parentAContext.request.post(
				'/requests/e2e-request-b?/cancel',
				{
					form: {
						_csrf: validCsrf,
						expectedVersion: '1',
						idempotencyKey: 'e2e-foreign-request-cancel',
					},
				}
			);
			await expectNotFoundAction(foreignRequestCancel, germanCatalog['request.error.cancel']);
			await parentB.goto('/requests/e2e-request-b');
			await expect(
				parentB.getByText(germanCatalog['request.status.draft'], { exact: true })
			).toBeVisible();

			const foreignDocument = await parentAContext.request.get(
				'/requests/documents/e2e-document-b/download'
			);
			await expectDeniedResponse(foreignDocument, 404, 'archive/e2e-document-b');
			await parentB.goto('/requests/e2e-request-document-b');
			await expect(
				parentB.locator('a[href="/requests/documents/e2e-document-b/download"]')
			).toBeVisible();
			const foreignDocumentDelete = await parentAContext.request.post(
				'/requests/e2e-request-document-b?/deleteDocument',
				{
					form: {
						_csrf: validCsrf,
						documentId: 'e2e-document-delete-b',
						idempotencyKey: 'e2e-foreign-document-delete',
					},
				}
			);
			await expectNotFoundAction(
				foreignDocumentDelete,
				germanCatalog['request.error.documentDelete']
			);
			const mismatchedDocumentCarrier = await parentBContext.request.post(
				'/requests/e2e-request-a?/deleteDocument',
				{
					form: {
						_csrf: parentBCsrf,
						documentId: 'e2e-document-delete-b',
						idempotencyKey: 'e2e-mismatched-document-carrier',
					},
				}
			);
			await expectNotFoundAction(
				mismatchedDocumentCarrier,
				germanCatalog['request.error.documentDelete']
			);
			await parentB.goto('/requests/e2e-request-document-b');
			await expect(parentB.locator('input[value="e2e-document-delete-b"]')).toBeAttached();

			await expectRouteStatus(parentA, '/contracts/e2e-contract-offer-b', 404);
			const foreignContractArtifact = await parentAContext.request.get(
				'/contracts/artifacts/e2e-contract-artifact-b/download'
			);
			await expectDeniedResponse(
				foreignContractArtifact,
				404,
				'archive/e2e-contract-artifact-b.pdf'
			);
			await parentB.goto('/contracts/e2e-contract-offer-b');
			await expect(
				parentB.getByText(germanCatalog['contract.status.sent'], { exact: true })
			).toBeVisible();
			await expect(
				parentB.locator('a[href="/contracts/artifacts/e2e-contract-artifact-b/download"]')
			).toBeVisible();
			await expect(
				parentB.getByRole('button', { name: germanCatalog['contract.accept.payable'] })
			).toBeVisible();

			const activeOfferRoute = '/contracts/00000000-0000-4000-8000-0000000000b1';
			const activeContractId = '00000000-0000-4000-8000-0000000000b2';
			await expectRouteStatus(parentA, activeOfferRoute, 404);
			await parentB.goto(activeOfferRoute);
			await expect(
				parentB.getByText(germanCatalog['contract.status.approved_by_admin'], {
					exact: true,
				})
			).toBeVisible();
			await expect(
				parentB.getByRole('button', { name: germanCatalog['contract.end.submit'] })
			).toBeVisible();
			await expect(
				parentB.getByRole('button', { name: germanCatalog['contract.attendance.submit'] })
			).toBeVisible();
			await expect(
				parentB.getByRole('button', { name: germanCatalog['contract.media.decline'] })
			).toBeVisible();

			for (const [action, form, message] of [
				[
					'end',
					{
						contractId: activeContractId,
						kind: 'ordinary_termination',
						idempotencyKey: 'e2e-mismatched-contract-end-carrier',
					},
					germanCatalog['contract.end.failed'],
				],
				[
					'attendance',
					{
						contractId: activeContractId,
						idempotencyKey: 'e2e-mismatched-contract-attendance-carrier',
					},
					germanCatalog['contract.attendance.failed'],
				],
			] as const) {
				const response = await parentBContext.request.post(
					`/contracts/e2e-contract-offer-b?/${action}`,
					{ form: { _csrf: parentBCsrf, ...form } }
				);
				await expectNotFoundAction(response, message);
			}

			const foreignContractEnd = await parentAContext.request.post(
				`${activeOfferRoute}?/end`,
				{
					form: {
						_csrf: validCsrf,
						contractId: activeContractId,
						kind: 'ordinary_termination',
						idempotencyKey: 'e2e-foreign-contract-end',
					},
				}
			);
			await expectNotFoundAction(foreignContractEnd, germanCatalog['contract.end.failed']);

			const foreignAttendance = await parentAContext.request.post(
				`${activeOfferRoute}?/attendance`,
				{
					form: {
						_csrf: validCsrf,
						contractId: activeContractId,
						idempotencyKey: 'e2e-foreign-contract-attendance',
					},
				}
			);
			await expectNotFoundAction(
				foreignAttendance,
				germanCatalog['contract.attendance.failed']
			);

			const mismatchedMediaCarrier = await parentAContext.request.post(
				`${activeOfferRoute}?/mediaDecline`,
				{
					form: {
						_csrf: validCsrf,
						childId: 'e2e-child-a',
						captureScopes: 'photo',
						publicationChannels: 'website',
						withdrawalContactVersionId: 'e2e-media-contact',
						idempotencyKey: 'e2e-mismatched-contract-media-carrier',
					},
				}
			);
			await expectNotFoundAction(
				mismatchedMediaCarrier,
				germanCatalog['contract.media.failed']
			);

			const foreignMediaDecision = await parentAContext.request.post(
				`${activeOfferRoute}?/mediaDecline`,
				{
					form: {
						_csrf: validCsrf,
						childId: 'e2e-child-b',
						captureScopes: 'photo',
						publicationChannels: 'website',
						withdrawalContactVersionId: 'e2e-media-contact',
						idempotencyKey: 'e2e-foreign-contract-media',
					},
				}
			);
			await expectNotFoundAction(
				foreignMediaDecision,
				germanCatalog['contract.media.failed']
			);

			await parentB.goto(activeOfferRoute);
			await expect(
				parentB.getByText(germanCatalog['contract.status.approved_by_admin'], {
					exact: true,
				})
			).toBeVisible();
			await expect(
				parentB.getByRole('button', { name: germanCatalog['contract.end.submit'] })
			).toBeVisible();
			await expect(
				parentB.getByRole('button', { name: germanCatalog['contract.attendance.submit'] })
			).toBeVisible();
			await expect(
				parentB.getByRole('button', { name: germanCatalog['contract.media.decline'] })
			).toBeVisible();

			await expectRouteStatus(parentA, '/price-reviews/e2e-price-review-b', 404);
			const foreignPriceResponse = await parentAContext.request.post(
				'/price-reviews/e2e-price-review-b?/respond',
				{
					form: {
						_csrf: validCsrf,
						itemHash:
							'9999999999999999999999999999999999999999999999999999999999999999',
						decision: 'accept',
						idempotencyKey: 'e2e-foreign-price-accept',
					},
				}
			);
			await expectNotFoundAction(
				foreignPriceResponse,
				germanCatalog['priceReviews.detail.rejected']
			);
			await parentB.goto('/price-reviews/e2e-price-review-b');
			await expect(
				parentB.getByRole('button', { name: germanCatalog['priceReviews.detail.accept'] })
			).toBeVisible();

			await expectRouteStatus(parentA, '/messages/e2e-message-b', 404);
			const foreignMessageAppend = await parentAContext.request.post(
				'/messages/e2e-message-b?/append',
				{
					form: {
						_csrf: validCsrf,
						message: 'Synthetic foreign message injection',
						idempotencyKey: 'e2e-foreign-message-append',
					},
				}
			);
			await expectNotFoundAction(foreignMessageAppend, germanCatalog['messages.failed']);
			const foreignMessageClose = await parentAContext.request.post(
				'/messages/e2e-message-b?/close',
				{
					form: {
						_csrf: validCsrf,
						idempotencyKey: 'e2e-foreign-message-close',
					},
				}
			);
			await expectNotFoundAction(foreignMessageClose, germanCatalog['messages.failed']);
			await parentB.goto('/messages/e2e-message-b');
			await expect(
				parentB.getByText(germanCatalog['messages.status.waiting_for_parent'], {
					exact: false,
				})
			).toBeVisible();
			await expect(parentB.getByText('Synthetic owner-visible message B')).toBeVisible();
			await expect(parentB.getByText('Synthetic foreign message injection')).toHaveCount(0);
			await expect(
				parentB.getByRole('button', { name: germanCatalog['messages.close'] })
			).toBeVisible();

			const foreignPrivacyExport = await parentAContext.request.get(
				'/account/privacy/exports/e2e-privacy-artifact-b/download'
			);
			await expectDeniedResponse(
				foreignPrivacyExport,
				404,
				'archive/e2e-privacy-export-b.json'
			);
			await parentB.goto('/account/privacy');
			await expect(
				parentB.locator(
					'a[href="/account/privacy/exports/e2e-privacy-artifact-b/download"]'
				)
			).toBeVisible();

			const parentBPrivacyHistory = parentB
				.getByRole('heading', { name: germanCatalog['privacy.history.title'] })
				.locator('..');
			await expect(parentBPrivacyHistory.locator('li')).toHaveCount(1);
			const tamperedExport = await parentAContext.request.post(
				'/account/privacy?/exportData',
				{
					form: {
						_csrf: validCsrf,
						subjectUserId: 'e2e-parent-b',
						idempotencyKey: 'e2e-tampered-privacy-export',
					},
				}
			);
			expect(tamperedExport.status()).toBeLessThan(500);
			expect(await tamperedExport.text()).toContain(germanCatalog['privacy.export.ready']);

			await parentA.goto('/account/privacy');
			const parentAPrivacyHistory = parentA
				.getByRole('heading', { name: germanCatalog['privacy.history.title'] })
				.locator('..');
			await expect(parentAPrivacyHistory.locator('li')).toHaveCount(1);
			await expect(
				parentAPrivacyHistory.locator('a[href^="/account/privacy/exports/"]')
			).toHaveCount(1);
			await parentB.goto('/account/privacy');
			await expect(parentBPrivacyHistory.locator('li')).toHaveCount(1);
			await expect(parentBPrivacyHistory.getByText('e2e-privacy-export-b')).toBeVisible();

			const tamperedDeletion = await parentAContext.request.post(
				'/account/privacy?/requestDeletion',
				{
					form: {
						_csrf: validCsrf,
						subjectUserId: 'e2e-parent-b',
						idempotencyKey: 'e2e-tampered-privacy-delete',
					},
				}
			);
			expect(tamperedDeletion.status()).toBeLessThan(500);
			expect(await tamperedDeletion.text()).toContain(
				germanCatalog['privacy.delete.requested']
			);
			await parentA.goto('/account/privacy');
			await expect(parentAPrivacyHistory.locator('li')).toHaveCount(2);
			await parentB.goto('/account/privacy');
			await expect(parentBPrivacyHistory.locator('li')).toHaveCount(1);
			await expect(parentBPrivacyHistory.getByText('e2e-privacy-export-b')).toBeVisible();
		} finally {
			await closeContexts([parentAContext, parentBContext]);
		}
	});

	test('rejects a tampered authenticated cookie with 401', async ({ browser }, testInfo) => {
		const authenticatedContext = await newE2eContext(browser, testInfo);
		const tamperedContext = await newE2eContext(browser, testInfo);
		try {
			const authenticatedPage = await authenticatedContext.newPage();
			await login(authenticatedPage, syntheticIdentities.parentA);
			const sessionCookie = (await authenticatedContext.cookies()).find(
				(cookie) => cookie.name === SESSION_COOKIE_NAME
			);
			expect(sessionCookie).toBeDefined();
			await tamperedContext.addCookies([
				{ ...sessionCookie!, value: `${sessionCookie!.value}tampered` },
			]);
			await expectRouteStatus(await tamperedContext.newPage(), '/account/security', 401);
		} finally {
			await closeContexts([authenticatedContext, tamperedContext]);
		}
	});

	test('rejects a previously valid cookie after the user revokes all sessions', async ({
		browser,
	}, testInfo) => {
		const authenticatedContext = await newE2eContext(browser, testInfo);
		const staleCookieContext = await newE2eContext(browser, testInfo);
		try {
			const page = await authenticatedContext.newPage();
			await login(page, syntheticIdentities.parentA);
			const sessionCookie = (await authenticatedContext.cookies()).find(
				(cookie) => cookie.name === SESSION_COOKIE_NAME
			);
			expect(sessionCookie).toBeDefined();
			await expectRouteStatus(page, '/account/security', 200);
			await Promise.all([
				page.waitForURL((url) => url.pathname === '/auth/login'),
				page
					.getByRole('button', {
						name: germanCatalog['auth.security.revokeSessionsSubmit'],
					})
					.click(),
			]);

			await staleCookieContext.addCookies([sessionCookie!]);
			await expectRouteStatus(await staleCookieContext.newPage(), '/account/security', 401);
		} finally {
			await closeContexts([authenticatedContext, staleCookieContext]);
		}
	});

	test('revokes the target session when an admin blocks a parent', async ({
		browser,
	}, testInfo) => {
		const parentContext = await newE2eContext(browser, testInfo);
		const adminContext = await newE2eContext(browser, testInfo);
		const blockedLoginContext = await newE2eContext(browser, testInfo);
		try {
			const parent = await parentContext.newPage();
			const admin = await adminContext.newPage();
			await login(parent, syntheticIdentities.parentB);
			await login(admin, syntheticIdentities.admin);
			await expectRouteStatus(admin, '/admin/users/e2e-parent-b', 200);
			await admin
				.getByLabel(germanCatalog['admin.reason'])
				.fill('Synthetic E2E access check');
			await admin.getByLabel(germanCatalog['admin.confirmAction']).check();
			await admin.getByRole('button', { name: germanCatalog['admin.users.block'] }).click();
			await expect(admin.getByText(germanCatalog['admin.action.completed'])).toBeVisible();

			await expectRouteStatus(parent, '/account/security', 401);

			const blockedLogin = await blockedLoginContext.newPage();
			await blockedLogin.goto('/auth/login');
			await blockedLogin
				.getByLabel(germanCatalog['auth.emailLabel'])
				.fill(syntheticIdentities.parentB.email);
			await blockedLogin
				.getByLabel(germanCatalog['auth.passwordLabel'])
				.fill(syntheticPassword);
			await blockedLogin
				.getByRole('button', { name: germanCatalog['auth.login.submit'] })
				.click();
			await expect(blockedLogin).toHaveURL(`${e2eOrigin(testInfo)}/auth/login`);
			await expect(
				blockedLogin.getByText(germanCatalog['auth.invalidCredentials'])
			).toBeVisible();
		} finally {
			await closeContexts([parentContext, adminContext, blockedLoginContext]);
		}
	});
});

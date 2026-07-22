import { DatabaseBoundary } from '$lib/server/db/database';
import { FoundationRepository } from '$lib/server/db/foundation-repository';
import { AuthRepository } from '$lib/server/auth/auth-repository';
import { AuthService, type AuthClock } from '$lib/server/auth/auth-service';
import { BcryptPasswordHasher } from '$lib/server/auth/password';
import { SessionService, type AuthenticatedUser } from '$lib/server/auth/session';
import { AuthRateLimiter } from '$lib/server/security/rate-limit';
import { FakeTurnstileVerifier } from '$lib/server/security/turnstile';
import { AuthEmailDispatcher, FakeEmailProvider } from '$lib/server/email/auth-email';
import type { AuthRuntimeConfig, PricingRuntimeConfig } from '$lib/server/config/runtime';
import {
	LegacyFamilyVerificationExtension,
	type LegacySnapshotUnavailableError,
} from '$lib/server/family/verification-extension';
import { FamilyRepository } from '$lib/server/family/family-repository';
import { FamilyService } from '$lib/server/family/family-service';
import { CabinetRepository } from '$lib/server/cabinet/cabinet-repository';
import { CabinetService } from '$lib/server/cabinet/cabinet-service';
import { CabinetPricingService } from '$lib/server/pricing/cabinet-pricing';
import { ChildCorrectionAdminRepository } from '$lib/server/cabinet/child-correction-admin-repository';
import { requireAdmin } from '$lib/server/security/authorization';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';
import { seedCurrentLegacySnapshot } from '../helpers/legacy-claim-fixtures';

const SECRET = 'synthetic-family-secret-for-tests-only-'.repeat(2);
const PASSWORD = 'synthetic-password-123';
const authConfig: AuthRuntimeConfig = {
	publicEnabled: true,
	emailProvider: 'fake',
	privacyNoticeVersion: 'synthetic-notice-v1',
	verificationTtlSeconds: 86_400,
	resetTtlSeconds: 3_600,
	emailChangeTtlSeconds: 86_400,
	sessionTtlSeconds: 604_800,
	resendCooldownSeconds: 60,
	rateLimitWindowSeconds: 60,
	rateLimitMaxAttempts: 100,
	passwordMinLength: 12,
	passwordMaxLength: 128,
	emailMaxAttempts: 3,
};
const pricingConfig: PricingRuntimeConfig = {
	individualPriceCentsPer45Min: 3000,
	groupDurationFallbackMinutes: 90,
	missingDurationYearlyCentsPer45Min: 2300,
	missingDurationMonthlyCentsPer45Min: 3000,
	quoteTtlSeconds: 86_400,
};

describe('stage 06 atomic family claim and parent cabinet', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;
	let authRepository: AuthRepository;
	let authService: AuthService;
	let sessions: SessionService;
	let limiter: AuthRateLimiter;
	let provider: FakeEmailProvider;
	let dispatcher: AuthEmailDispatcher;
	let familyService: FamilyService;
	let cabinetRepository: CabinetRepository;
	let cabinetService: CabinetService;
	let currentTime: string;

	const clock: AuthClock = { now: () => currentTime };

	beforeEach(async () => {
		currentTime = '2026-07-17T10:00:00.000Z';
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		authRepository = new AuthRepository(db);
		limiter = new AuthRateLimiter(
			new FoundationRepository(db),
			SECRET,
			authConfig.rateLimitWindowSeconds,
			authConfig.rateLimitMaxAttempts
		);
		sessions = new SessionService(authRepository, SECRET, authConfig.sessionTtlSeconds);
		authService = new AuthService(
			authRepository,
			new BcryptPasswordHasher(12, 128, 4),
			new FakeTurnstileVerifier(),
			limiter,
			sessions,
			SECRET,
			authConfig,
			clock,
			new LegacyFamilyVerificationExtension(db)
		);
		provider = new FakeEmailProvider();
		dispatcher = new AuthEmailDispatcher(
			authRepository,
			provider,
			SECRET,
			{ portalPublicOrigin: 'https://portal.example.test' },
			() => currentTime
		);
		familyService = new FamilyService(
			new FamilyRepository(db),
			limiter,
			SECRET,
			authConfig,
			clock
		);
		cabinetRepository = new CabinetRepository(db);
		cabinetService = new CabinetService(
			cabinetRepository,
			new CabinetPricingService(pricingConfig),
			[],
			() => currentTime
		);
	});

	afterEach(async () => {
		if (context) await context.dispose();
	});

	async function register(input: {
		email: string;
		firstName?: string;
		lastName?: string;
		requestId: string;
	}) {
		return authService.register({
			data: {
				email: input.email,
				password: PASSWORD,
				firstName: input.firstName ?? 'Maria',
				lastName: input.lastName ?? 'Parent',
				privacyAccepted: true,
				privacyNoticeVersion: 'synthetic-notice-v1',
				turnstileToken: 'synthetic-turnstile-pass',
			},
			requestSubject: `subject:${input.requestId}`,
			requestId: input.requestId,
		});
	}

	async function nextToken(path: '/auth/verify' | '/cabinet/legacy-claim', recipient: string) {
		const start = provider.messages.length;
		for (let attempt = 0; attempt < 12; attempt += 1) {
			await dispatcher.dispatchNext();
			const message = provider.messages
				.slice(start)
				.findLast(
					(candidate) =>
						candidate.to.toLocaleLowerCase('de-DE') ===
							recipient.toLocaleLowerCase('de-DE') && candidate.text.includes(path)
				);
			if (message) {
				const link = message.text.match(/https:\/\/portal\.example\.test\/[^\s]+/)?.[0];
				if (!link) throw new Error('Synthetic email link missing.');
				return new URL(link).searchParams.get('token') ?? '';
			}
		}
		throw new Error(`No ${path} message found.`);
	}

	async function verifyAndLogin(
		email: string,
		requestPrefix: string
	): Promise<AuthenticatedUser> {
		const token = await nextToken('/auth/verify', email);
		expect(
			await authService.verifyEmail({
				token,
				requestId: `${requestPrefix}-verify`,
				requestSubject: `${requestPrefix}-verify-subject`,
			})
		).toBe(true);
		const session = await authService.login({
			data: { email, password: PASSWORD },
			requestSubject: `${requestPrefix}-login`,
		});
		return (await sessions.authenticate(session.sessionToken, currentTime))!;
	}

	it('assigns one exact-email legacy family in the verification batch and composes a safe cabinet', async () => {
		await seedCurrentLegacySnapshot({
			db: context.db,
			families: [
				{
					sequence: 4101,
					emails: ['exact.parent@example.test'],
					childName: 'Legacy Child',
					groupName: 'Legacy Music',
					plannedPriceCents: 4600,
					paymentArrangement: 'manual_payment',
				},
			],
		});
		const candidateResponse = await register({
			email: 'EXACT.PARENT@example.test',
			requestId: 'exact-register',
		});
		const noCandidateResponse = await register({
			email: 'no.candidate@example.test',
			firstName: 'No',
			lastName: 'Candidate',
			requestId: 'no-candidate-register',
		});
		expect(candidateResponse).toEqual(noCandidateResponse);
		const before = await context.db
			.prepare(
				`SELECT email_verified_at, family_number_id, family_assignment_status
				FROM users WHERE email_normalized = 'exact.parent@example.test'`
			)
			.first<Record<string, unknown>>();
		expect(before).toEqual({
			email_verified_at: null,
			family_number_id: null,
			family_assignment_status: 'pending_verification',
		});
		expect(await cabinetRepository.loadClaimOffer('missing')).toBeNull();

		const verificationToken = await nextToken('/auth/verify', 'exact.parent@example.test');
		expect(
			await authService.verifyEmail({
				token: verificationToken,
				requestId: 'exact-verify',
				requestSubject: 'exact-verify-subject',
			})
		).toBe(true);
		expect(
			await authService.verifyEmail({
				token: verificationToken,
				requestId: 'exact-verify-replay',
				requestSubject: 'exact-verify-replay-subject',
			})
		).toBe(false);
		const exactSession = await authService.login({
			data: { email: 'exact.parent@example.test', password: PASSWORD },
			requestSubject: 'exact-login',
		});
		const actor = (await sessions.authenticate(exactSession.sessionToken, currentTime))!;
		const assigned = await context.db
			.prepare(
				`SELECT allocation.namespace, allocation.display_family_id,
				allocation.owner_user_id, family.claimed_by_user_id,
				user.family_version, user.family_assignment_import_run_id,
				(SELECT COUNT(*) FROM family_finalization_commits
					WHERE user_id = user.id) AS commits,
				(SELECT COUNT(*) FROM children WHERE owner_user_id = user.id) AS owned_children
				FROM users AS user
				JOIN family_number_allocations AS allocation ON allocation.id = user.family_number_id
				JOIN legacy_families AS family ON family.family_number_id = allocation.id
				WHERE user.id = ?`
			)
			.bind(actor.id)
			.first<Record<string, unknown>>();
		expect(assigned).toMatchObject({
			namespace: 'legacy_1',
			display_family_id: '1. 4101',
			owner_user_id: actor.id,
			claimed_by_user_id: actor.id,
			family_version: 1,
			commits: 1,
			owned_children: 1,
		});

		const cabinet = await cabinetService.load(actor);
		expect(cabinet.profile.familyDisplayId).toBe('1. 4101');
		expect(cabinet.children).toEqual([
			expect.objectContaining({ fullName: 'Legacy Child', origin: 'legacy' }),
		]);
		expect(cabinet.activities).toEqual([
			expect.objectContaining({
				groupName: 'Legacy Music',
				origin: 'legacy',
				contractAvailable: false,
				basePriceCents: 4600,
			}),
		]);
		expect(cabinet.pricing).toMatchObject({
			knownMonthlyBaseTotalCents: 4600,
			unknownMonthlyBasePriceCount: 0,
			paymentNotices: ['manual_payment'],
		});
		expect(JSON.stringify(cabinet)).not.toContain('internal synthetic note');
		expect(JSON.stringify(cabinet)).not.toContain('access-run-');
	});

	it('offers one masked alternate email and atomically switches the account and every child', async () => {
		await seedCurrentLegacySnapshot({
			db: context.db,
			families: [
				{
					sequence: 4201,
					emails: ['legacy.owner@example.test'],
					childName: 'Imported Child',
					plannedPriceCents: 5200,
				},
			],
		});
		await register({ email: 'modern.owner@example.test', requestId: 'alternate-register' });
		const actor = await verifyAndLogin('modern.owner@example.test', 'alternate');
		const initial = await cabinetService.load(actor);
		expect(initial.profile.familyDisplayId).toMatch(/^2\. \d{4}$/);
		expect(initial.claimOffer).toEqual({
			maskedEmail: 'le*****r@example.test',
			proofSent: false,
		});
		expect(JSON.stringify(initial)).not.toContain('legacy.owner@example.test');

		expect(
			await cabinetService.createChild({
				actor,
				payload: {
					fullName: 'Portal Child',
					birthDate: '2018-05-06',
					confirmDuplicate: false,
				},
				requestId: 'portal-child-create',
			})
		).toBe('created');
		const strictlyLimitedFamilyService = new FamilyService(
			new FamilyRepository(db),
			new AuthRateLimiter(
				new FoundationRepository(db),
				SECRET,
				authConfig.rateLimitWindowSeconds,
				1
			),
			SECRET,
			authConfig,
			clock
		);
		expect(
			await strictlyLimitedFamilyService.requestLegacyClaimProof({
				actor,
				requestSubject: 'alternate-claim-request',
			})
		).toBe(true);
		await expect(
			strictlyLimitedFamilyService.requestLegacyClaimProof({
				actor,
				requestSubject: 'alternate-claim-request-repeated',
			})
		).rejects.toMatchObject({ code: 'RATE_LIMITED' });
		const claimToken = await nextToken('/cabinet/legacy-claim', 'legacy.owner@example.test');
		expect(claimToken.length).toBeGreaterThan(32);
		const persisted = await context.db
			.prepare(
				`SELECT group_concat(token_hash || payload_json, '|') AS value
				FROM auth_tokens LEFT JOIN email_outbox ON email_outbox.source_id = auth_tokens.id`
			)
			.first<{ value: string }>();
		expect(persisted?.value).not.toContain(claimToken);
		const safeEvidence = await context.db
			.prepare(
				`SELECT group_concat(safe_diff_json || payload_json, '|') AS value
				FROM audit_events LEFT JOIN email_outbox ON 1 = 1`
			)
			.first<{ value: string }>();
		expect(safeEvidence?.value).not.toContain('legacy.owner@example.test');

		const foreignActor = { ...actor, id: crypto.randomUUID() };
		expect(
			await familyService.confirmLegacyClaim({
				actor: foreignActor,
				token: claimToken,
				requestId: 'foreign-confirm',
				requestSubject: 'foreign-confirm',
			})
		).toBe(false);
		const concurrentConfirmations = await Promise.all([
			familyService.confirmLegacyClaim({
				actor,
				token: claimToken,
				requestId: 'owner-confirm-a',
				requestSubject: 'owner-confirm-a',
			}),
			familyService.confirmLegacyClaim({
				actor,
				token: claimToken,
				requestId: 'owner-confirm-b',
				requestSubject: 'owner-confirm-b',
			}),
		]);
		expect(concurrentConfirmations).toEqual([true, true]);
		expect(
			await familyService.confirmLegacyClaim({
				actor,
				token: claimToken,
				requestId: 'owner-confirm-replay',
				requestSubject: 'owner-confirm-replay',
			})
		).toBe(true);

		const switched = await context.db
			.prepare(
				`SELECT allocation.namespace, allocation.display_family_id,
				user.family_version,
				(SELECT COUNT(*) FROM children WHERE owner_user_id = user.id
					AND family_number_id = user.family_number_id) AS matching_children,
				(SELECT COUNT(*) FROM children WHERE owner_user_id = user.id) AS all_children,
				(SELECT COUNT(*) FROM family_reassignments WHERE user_id = user.id
					AND status = 'applied') AS reassignments
				FROM users AS user JOIN family_number_allocations AS allocation
					ON allocation.id = user.family_number_id WHERE user.id = ?`
			)
			.bind(actor.id)
			.first<Record<string, unknown>>();
		expect(switched).toMatchObject({
			namespace: 'legacy_1',
			display_family_id: '1. 4201',
			family_version: 2,
			matching_children: 2,
			all_children: 2,
			reassignments: 1,
		});
		expect(await context.db.prepare(
			`SELECT COUNT(*) AS count FROM email_outbox
			WHERE recipient_user_id = ? AND template_or_category = 'claim.result'`
		).bind(actor.id).first<{ count: number }>()).toEqual({ count: 1 });
	});

	it('allocates namespace 2 plus typed reviews for ambiguous and already-owned exact matches', async () => {
		await seedCurrentLegacySnapshot({
			db: context.db,
			families: [
				{ sequence: 4301, emails: ['ambiguous@example.test'] },
				{ sequence: 4302, emails: ['ambiguous@example.test'], ownedBy: 'other-owner' },
				{ sequence: 4303, emails: ['owned@example.test'], ownedBy: 'existing-owner' },
			],
		});
		await register({ email: 'ambiguous@example.test', requestId: 'ambiguous-register' });
		const actor = await verifyAndLogin('ambiguous@example.test', 'ambiguous');
		const state = await context.db
			.prepare(
				`SELECT allocation.namespace, user.family_assignment_status,
				(SELECT COUNT(*) FROM admin_review_tasks
					WHERE kind = 'family_claim_conflict') AS conflict_reviews,
				(SELECT COUNT(*) FROM family_claims WHERE user_id = user.id
					AND status = 'claimed') AS claims,
				(SELECT COUNT(*) FROM family_link_attempts WHERE user_id = user.id) AS attempts
				FROM users AS user JOIN family_number_allocations AS allocation
					ON allocation.id = user.family_number_id WHERE user.id = ?`
			)
			.bind(actor.id)
			.first<Record<string, unknown>>();
		expect(state).toMatchObject({
			namespace: 'portal_2',
			family_assignment_status: 'review_required',
			conflict_reviews: 2,
			claims: 0,
			attempts: 0,
		});

		await register({ email: 'owned@example.test', requestId: 'owned-register' });
		const ownedActor = await verifyAndLogin('owned@example.test', 'owned');
		const ownedState = await context.db
			.prepare(
				`SELECT allocation.namespace, user.family_assignment_status,
				(SELECT COUNT(*) FROM admin_review_tasks
					WHERE kind = 'family_claim_conflict'
						AND reason_code = 'exact_email_already_owned'
						AND source_id = (SELECT legacy_family_id FROM family_number_allocations
							WHERE display_family_id = '1. 4303')) AS owned_reviews
				FROM users AS user JOIN family_number_allocations AS allocation
					ON allocation.id = user.family_number_id WHERE user.id = ?`
			)
			.bind(ownedActor.id)
			.first<Record<string, unknown>>();
		expect(ownedState).toMatchObject({
			namespace: 'portal_2',
			family_assignment_status: 'review_required',
			owned_reviews: 1,
		});
	});

	it('handles zero, one, multiple, multi-email and ambiguous parent-name candidates safely', async () => {
		await seedCurrentLegacySnapshot({
			db: context.db,
			families: [
				{
					sequence: 4351,
					emails: ['a@short.example'],
					parentFirstName: 'Short',
					parentLastName: 'Mask',
				},
				{
					sequence: 4352,
					emails: ['first@double.example', 'second@double.example'],
					parentFirstName: 'Double',
					parentLastName: 'Mail',
				},
				{
					sequence: 4353,
					emails: ['one@multi.example'],
					parentFirstName: 'Multi',
					parentLastName: 'Match',
				},
				{
					sequence: 4354,
					emails: ['two@multi.example'],
					parentFirstName: 'Multi',
					parentLastName: 'Match',
				},
				{
					sequence: 4355,
					emails: ['ambiguous@parser.example'],
					parentFirstName: 'Ambiguous',
					parentLastName: 'Parser',
					parentNameMatchStatus: 'ambiguous',
				},
			],
		});

		async function registerAndVerify(input: {
			email: string;
			firstName: string;
			lastName: string;
			prefix: string;
		}) {
			await register({ ...input, requestId: `${input.prefix}-register` });
			const token = await nextToken('/auth/verify', input.email);
			expect(
				await authService.verifyEmail({
					token,
					requestId: `${input.prefix}-verify`,
					requestSubject: `${input.prefix}-verify`,
				})
			).toBe(true);
			return (await context.db
				.prepare(`SELECT id FROM users WHERE email_normalized = ?`)
				.bind(input.email)
				.first<{ id: string }>())!.id;
		}

		const shortUserId = await registerAndVerify({
			email: 'current-short@example.test',
			firstName: 'Short',
			lastName: 'Mask',
			prefix: 'short-name',
		});
		const shortOffer = await cabinetRepository.loadClaimOffer(shortUserId);
		expect(shortOffer).toEqual({
			masked_email_snapshot: '*****@short.example',
			status: 'candidate',
		});
		expect(JSON.stringify(shortOffer)).not.toContain('a@short.example');
		const shortSession = await authService.login({
			data: { email: 'current-short@example.test', password: PASSWORD },
			requestSubject: 'short-name-login',
		});
		const shortActor = (await sessions.authenticate(shortSession.sessionToken, currentTime))!;
		expect(
			await familyService.requestLegacyClaimProof({
				actor: shortActor,
				requestSubject: 'short-name-proof',
			})
		).toBe(true);
		const shortToken = await nextToken('/cabinet/legacy-claim', 'a@short.example');
		currentTime = '2026-07-18T10:00:01.000Z';
		expect(
			await familyService.confirmLegacyClaim({
				actor: shortActor,
				token: shortToken,
				requestId: 'short-name-expired-confirm',
				requestSubject: 'short-name-expired-confirm',
			})
		).toBe(false);
		const expiredState = await context.db
			.prepare(
				`SELECT token.used_at, allocation.namespace
				FROM auth_tokens AS token
				JOIN users AS user ON user.id = token.user_id
				JOIN family_number_allocations AS allocation ON allocation.id = user.family_number_id
				WHERE token.kind = 'legacy_email_claim' AND token.user_id = ?`
			)
			.bind(shortUserId)
			.first<Record<string, unknown>>();
		expect(expiredState).toEqual({ used_at: null, namespace: 'portal_2' });

		const doubleEmailUserId = await registerAndVerify({
			email: 'current-double@example.test',
			firstName: 'Double',
			lastName: 'Mail',
			prefix: 'double-email',
		});
		expect(await cabinetRepository.loadClaimOffer(doubleEmailUserId)).toBeNull();

		const multiNameUserId = await registerAndVerify({
			email: 'current-multi@example.test',
			firstName: 'Multi',
			lastName: 'Match',
			prefix: 'multi-name',
		});
		expect(await cabinetRepository.loadClaimOffer(multiNameUserId)).toBeNull();
		const multiReviews = await context.db
			.prepare(
				`SELECT COUNT(*) AS count FROM admin_review_tasks
				WHERE kind = 'family_name_match' AND source_id IN (
					SELECT legacy_family_id FROM family_number_allocations
					WHERE display_family_id IN ('1. 4353', '1. 4354'))`
			)
			.first<{ count: number }>();
		expect(multiReviews?.count).toBe(2);

		const ambiguousUserId = await registerAndVerify({
			email: 'current-ambiguous@example.test',
			firstName: 'Ambiguous',
			lastName: 'Parser',
			prefix: 'ambiguous-parser',
		});
		expect(await cabinetRepository.loadClaimOffer(ambiguousUserId)).toBeNull();

		const noMatchUserId = await registerAndVerify({
			email: 'current-none@example.test',
			firstName: 'No',
			lastName: 'Match',
			prefix: 'no-name',
		});
		const noMatch = await context.db
			.prepare(
				`SELECT family_assignment_status,
				(SELECT COUNT(*) FROM family_link_attempts WHERE user_id = users.id) AS attempts
				FROM users WHERE id = ?`
			)
			.bind(noMatchUserId)
			.first<Record<string, unknown>>();
		expect(noMatch).toEqual({ family_assignment_status: 'assigned', attempts: 0 });
	});

	it('rolls verification back for a missing or concurrently retired promoted snapshot', async () => {
		await register({ email: 'missing.snapshot@example.test', requestId: 'missing-register' });
		const token = await nextToken('/auth/verify', 'missing.snapshot@example.test');
		await expect(
			authService.verifyEmail({
				token,
				requestId: 'missing-verify',
				requestSubject: 'missing-verify',
			})
		).rejects.toMatchObject({
			name: 'LegacySnapshotUnavailableError',
		} satisfies Partial<LegacySnapshotUnavailableError>);
		let user = await context.db
			.prepare(
				`SELECT email_verified_at, family_number_id FROM users
				WHERE email_normalized = 'missing.snapshot@example.test'`
			)
			.first<Record<string, unknown>>();
		expect(user).toEqual({ email_verified_at: null, family_number_id: null });
		const tokenState = await context.db
			.prepare(
				`SELECT used_at FROM auth_tokens WHERE token_hash IS NOT NULL
				AND user_id = (SELECT id FROM users WHERE email_normalized = 'missing.snapshot@example.test')`
			)
			.first<{ used_at: string | null }>();
		expect(tokenState?.used_at).toBeNull();

		const snapshot = await seedCurrentLegacySnapshot({ db: context.db, families: [] });
		expect(
			await authService.verifyEmail({
				token,
				requestId: 'missing-retry',
				requestSubject: 'missing-retry',
			})
		).toBe(true);
		user = await context.db
			.prepare(
				`SELECT email_verified_at, family_number_id FROM users
				WHERE email_normalized = 'missing.snapshot@example.test'`
			)
			.first<Record<string, unknown>>();
		expect(user?.email_verified_at).toBe(currentTime);
		expect(user?.family_number_id).toEqual(expect.any(String));

		await register({ email: 'promotion.race@example.test', requestId: 'race-register' });
		const raceToken = await nextToken('/auth/verify', 'promotion.race@example.test');
		const realExtension = new LegacyFamilyVerificationExtension(db);
		const racingService = new AuthService(
			authRepository,
			new BcryptPasswordHasher(12, 128, 4),
			new FakeTurnstileVerifier(),
			limiter,
			sessions,
			SECRET,
			authConfig,
			clock,
			{
				async prepare(extensionContext) {
					const statements = await realExtension.prepare(extensionContext);
					await db.run({
						sql: `UPDATE legacy_versions SET is_published = 0, retired_at = ? WHERE id = ?`,
						params: [currentTime, snapshot.legacyVersionId],
					});
					return statements;
				},
			}
		);
		await expect(
			racingService.verifyEmail({
				token: raceToken,
				requestId: 'promotion-race-verify',
				requestSubject: 'promotion-race-verify',
			})
		).rejects.toThrow();
		const raceState = await context.db
			.prepare(
				`SELECT user.email_verified_at, user.family_number_id, token.used_at
				FROM users AS user JOIN auth_tokens AS token ON token.user_id = user.id
				WHERE user.email_normalized = 'promotion.race@example.test'
				ORDER BY token.created_at DESC LIMIT 1`
			)
			.first<Record<string, unknown>>();
		expect(raceState).toEqual({
			email_verified_at: null,
			family_number_id: null,
			used_at: null,
		});
	});

	it('enforces owner-scoped child writes, duplicate confirmation, correction overrides, and payment summaries', async () => {
		const seeded = await seedCurrentLegacySnapshot({
			db: context.db,
			families: [
				{
					sequence: 4401,
					emails: ['cabinet.owner@example.test'],
					childName: 'Cabinet Child',
					plannedPriceCents: 4800,
					paymentArrangement: 'existing_external_sepa',
				},
				{
					sequence: 4402,
					emails: ['foreign.family@example.test'],
					childName: 'Foreign Child',
					groupName: 'Foreign Service',
					plannedPriceCents: null,
				},
			],
		});
		await register({ email: 'cabinet.owner@example.test', requestId: 'cabinet-register' });
		const actor = await verifyAndLogin('cabinet.owner@example.test', 'cabinet');
		const createPayload = {
			fullName: 'Portal Duplicate',
			birthDate: '2019-01-02',
			confirmDuplicate: false,
		};
		expect(
			await cabinetService.createChild({
				actor,
				payload: createPayload,
				requestId: 'create-first',
			})
		).toBe('created');
		expect(
			await cabinetService.createChild({
				actor,
				payload: createPayload,
				requestId: 'create-duplicate',
			})
		).toBe('duplicate');
		expect(
			await cabinetService.createChild({
				actor,
				payload: { ...createPayload, confirmDuplicate: true },
				requestId: 'create-confirmed-duplicate',
			})
		).toBe('created');

		const legacyChild = (await cabinetService.load(actor)).children.find(
			(child) => child.origin === 'legacy'
		)!;
		expect(
			await cabinetService.updateChild({
				actor,
				payload: {
					childId: legacyChild.id,
					fullName: 'Silent Legacy Edit',
					birthDate: legacyChild.birthDate,
					confirmDuplicate: false,
				},
				requestId: 'legacy-direct-edit',
			})
		).toBe('rejected');
		expect(
			await cabinetService.requestCorrection({
				actor,
				payload: {
					childId: legacyChild.id,
					fullName: 'Approved Override',
					birthDate: '2016-05-04',
				},
				requestId: 'correction-request',
			})
		).toBe(true);
		const correction = await context.db
			.prepare(
				`SELECT id FROM child_correction_requests WHERE child_id = ? AND status = 'pending'`
			)
			.bind(legacyChild.id)
			.first<{ id: string }>();
		await context.db
			.prepare(
				`INSERT INTO users
				(id, email, email_normalized, password_hash, role, email_verified_at,
				 first_name, last_name, first_name_normalized, last_name_normalized,
				 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
			 VALUES ('synthetic-admin', 'admin@example.test', 'admin@example.test',
				 'not-used', 'admin', ?, 'Admin', 'User', 'admin', 'user',
				 'synthetic-notice-v1', ?, ?, ?)`
			)
			.bind(currentTime, currentTime, currentTime, currentTime)
			.run();
		const admin = requireAdmin({
			id: 'synthetic-admin',
			role: 'admin',
			emailVerified: true,
			sessionId: 'admin-session',
			sessionVersion: 1,
			csrfHash: 'admin-csrf',
		});
		expect(
			await new ChildCorrectionAdminRepository(db).approve({
				actor: admin,
				correctionId: correction!.id,
				reason: 'Synthetic approved correction',
				requestId: 'correction-approve',
				now: currentTime,
			})
		).toBe(true);
		await context.db
			.prepare(
				`UPDATE children SET source_full_name = 'Reimport Source',
				source_full_name_normalized = 'reimport source', source_birth_date = '2014-01-01',
				full_name = CASE WHEN full_name_override IS NOT NULL THEN full_name_override ELSE 'Reimport Source' END,
				birth_date = CASE WHEN birth_date_override IS NOT NULL THEN birth_date_override ELSE '2014-01-01' END
				WHERE id = ?`
			)
			.bind(legacyChild.id)
			.run();
		const preserved = await context.db
			.prepare(
				`SELECT source_full_name, full_name_override, full_name,
				source_birth_date, birth_date_override, birth_date FROM children WHERE id = ?`
			)
			.bind(legacyChild.id)
			.first<Record<string, unknown>>();
		expect(preserved).toEqual({
			source_full_name: 'Reimport Source',
			full_name_override: 'Approved Override',
			full_name: 'Approved Override',
			source_birth_date: '2014-01-01',
			birth_date_override: '2016-05-04',
			birth_date: '2016-05-04',
		});

		const legacyEnrollment = await context.db
			.prepare(`SELECT id FROM legacy_enrollments WHERE child_id = ?`)
			.bind(legacyChild.id)
			.first<{ id: string }>();
		await context.db.batch([
			context.db
				.prepare(
					`INSERT INTO course_groups
					(id, academic_period_id, source_offering_key, display_name,
					 normalized_price_key, lesson_kind, subject, capacity_default,
					 capacity_override, requires_admin_approval, catalog_status,
					 last_seen_schedule_version_id, retired_at, created_at, updated_at)
				 VALUES ('represented-course', ?, 'represented-course', 'Represented Service',
					 'represented service', 'group', 'music', 10, NULL, 0, 'published',
					 NULL, NULL, ?, ?)`
				)
				.bind(seeded.periodId, currentTime, currentTime),
			context.db
				.prepare(
					`INSERT INTO enrollments
					(id, user_id, child_id, course_group_id, legacy_enrollment_id,
					 lesson_kind, status, contract_kind, active_from, active_until,
					 current_price_cents, price_source, price_mode, price_effective_from,
					 source, created_at, updated_at, payment_arrangement)
				 VALUES ('represented-enrollment', ?, ?, 'represented-course', ?,
					 'group', 'active', 'group_yearly', '2026-01-01', NULL,
					 4800, 'excel_yearly', 'rule_derived', '2026-01-01',
					 'legacy', ?, ?, 'existing_external_sepa')`
				)
				.bind(actor.id, legacyChild.id, legacyEnrollment!.id, currentTime, currentTime),
			context.db
				.prepare(
					`UPDATE legacy_enrollments SET represented_by_enrollment_id = ? WHERE id = ?`
				)
				.bind('represented-enrollment', legacyEnrollment!.id),
		]);

		const cabinet = await cabinetService.load(actor);
		expect(cabinet.pricing.knownMonthlyBaseTotalCents).toBe(4800);
		expect(cabinet.pricing.paymentNotices).toContain('existing_external_sepa');
		expect(cabinet.activities.every((activity) => activity.contractAvailable === false)).toBe(
			true
		);
		expect(cabinet.activities).toEqual([
			expect.objectContaining({ groupName: 'Represented Service', origin: 'portal' }),
		]);
		expect(JSON.stringify(cabinet)).not.toContain('Foreign Service');

		const foreignActor = { ...actor, id: crypto.randomUUID() };
		const portalChild = cabinet.children.find((child) => child.origin === 'portal')!;
		expect(
			await cabinetService.updateChild({
				actor: foreignActor,
				payload: {
					childId: portalChild.id,
					fullName: 'Cross Account Attempt',
					birthDate: portalChild.birthDate,
					confirmDuplicate: true,
				},
				requestId: 'cross-account-child',
			})
		).toBe('rejected');
	});
});

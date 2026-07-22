import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import { AuthRepository } from '$lib/server/auth/auth-repository';
import { AuthService, type AuthClock } from '$lib/server/auth/auth-service';
import { BcryptPasswordHasher } from '$lib/server/auth/password';
import { SessionService } from '$lib/server/auth/session';
import { AuthEmailDispatcher, FakeEmailProvider } from '$lib/server/email/auth-email';
import { LegacyFamilyVerificationExtension } from '$lib/server/family/verification-extension';
import { FoundationRepository } from '$lib/server/db/foundation-repository';
import { DatabaseBoundary } from '$lib/server/db/database';
import { AuthRateLimiter } from '$lib/server/security/rate-limit';
import { FakeTurnstileVerifier } from '$lib/server/security/turnstile';
import { requireAdmin } from '$lib/server/security/authorization';
import {
	loadRuntimeConfig,
	type AuthRuntimeConfig,
	type PricingRuntimeConfig,
} from '$lib/server/config/runtime';
import { CabinetRepository } from '$lib/server/cabinet/cabinet-repository';
import { CabinetService } from '$lib/server/cabinet/cabinet-service';
import { CabinetPricingService } from '$lib/server/pricing/cabinet-pricing';
import { CatalogRepository } from '$lib/server/catalog/catalog-repository';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import { PricingRepository } from '$lib/server/pricing/pricing-repository';
import { PricingService } from '$lib/server/pricing/pricing-service';
import { TrialRepository } from '$lib/server/trials/trial-repository';
import { TrialService } from '$lib/server/trials/trial-service';
import { AdminMutationRepository } from '$lib/server/admin/mutation-repository';
import { IndividualRequestRepository } from '$lib/server/requests/request-repository';
import { IndividualRequestService } from '$lib/server/requests/request-service';
import { ContractRepository } from '$lib/server/contracts/contract-repository';
import { ContractService } from '$lib/server/contracts/contract-service';
import type { ContractArtifactStore } from '$lib/server/contracts/storage';
import { buildDependencySet, buildRunFingerprint } from '$lib/server/import/canonical';
import { ImportRepository } from '$lib/server/import/import-repository';
import { parsePriceWorkbook } from '$lib/server/import/local/price-workbook';
import type { AcademicPeriodRow } from '$lib/server/import/types';
import { PriceReviewRepository } from '$lib/server/price-reviews/price-review-repository';
import { PriceReviewService } from '$lib/server/price-reviews/price-review-service';
import { MessageRepository } from '$lib/server/messages/message-repository';
import { MessageService } from '$lib/server/messages/message-service';
import { parseBusinessHours } from '$lib/server/outbox/business-hours';
import { PrivacyRepository } from '$lib/server/privacy/privacy-repository';
import { PrivacyService } from '$lib/server/privacy/privacy-service';
import type { PrivacyArtifactStore } from '$lib/server/privacy/storage';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';
import { createSyntheticPriceWorkbook } from '../helpers/import-fixtures';
import { seedCurrentLegacySnapshot } from '../helpers/legacy-claim-fixtures';

const AUTH_SECRET = 'synthetic-production-readiness-secret-'.repeat(2);
const PASSWORD = 'synthetic-password-123';
const PARENT_EMAIL = 'production.flow.parent@example.test';
const ADMIN_ID = 'production-readiness-admin';
const COURSE_ID = 'production-readiness-course';
const SESSION_ID = 'production-readiness-session';
const SCHEDULE_VERSION_ID = 'production-readiness-schedule';
const SYNTHETIC_WITHDRAWAL_TEMPLATE_ID = 'contract-template:synthetic:group_yearly:withdrawal-v1';

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

const admin = requireAdmin({
	id: ADMIN_ID,
	role: 'admin',
	emailVerified: true,
	sessionId: 'production-readiness-admin-session',
	sessionVersion: 1,
	csrfHash: 'production-readiness-admin-csrf',
});

const sha256 = (value: Uint8Array | string): string =>
	createHash('sha256').update(value).digest('hex');

class MemoryPrivateStore implements ContractArtifactStore, PrivacyArtifactStore {
	readonly values = new Map<string, Uint8Array>();

	async put(key: string, body: Uint8Array, _sha256: string): Promise<void> {
		this.values.set(key, Uint8Array.from(body));
	}

	async get(key: string): Promise<{ body: ArrayBuffer; size: number } | null> {
		const value = this.values.get(key);
		if (!value) return null;
		const copy = Uint8Array.from(value);
		return { body: copy.buffer as ArrayBuffer, size: copy.byteLength };
	}

	async delete(key: string): Promise<void> {
		this.values.delete(key);
	}
}

async function seedAdminAndCatalog(
	db: DatabaseBoundary,
	periodId: string,
	now: string
): Promise<void> {
	const scheduleRunId = 'production-readiness-schedule-run';
	const lockOwner = 'production-readiness-schedule-owner';
	await db.batch([
		{
			sql: `INSERT INTO users
				(id, email, email_normalized, password_hash, email_verified_at, role,
				 first_name, last_name, first_name_normalized, last_name_normalized,
				 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
			VALUES (?, 'production.flow.admin@example.test',
				'production.flow.admin@example.test', 'synthetic-admin-password-hash', ?,
				'admin', 'Synthetic', 'Operator', 'synthetic', 'operator',
				'synthetic-notice-v1', ?, ?, ?)`,
			params: [ADMIN_ID, now, now, now, now],
		},
		{
			sql: `INSERT INTO import_runs
				(id, source_kind, academic_period_id, source_label, source_hash_sha256,
				 source_contract_id, source_contract_version, structural_fingerprint_sha256,
				 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
				 attempt_no, retry_of_run_id, status, started_at, validated_at,
				 promoted_at, finished_at, rows_total, rows_staged, rows_promoted,
				 rows_skipped, safe_summary_json, error_code, created_at, updated_at)
			VALUES (?, 'schedule', ?, 'synthetic-production-readiness', ?,
				'schedule-json', 1, ?, '{}', ?, ?, 1, NULL, 'validated', ?, ?, NULL,
				NULL, 1, 1, 0, 0, '{}', NULL, ?, ?)`,
			params: [
				scheduleRunId,
				periodId,
				sha256('schedule-source'),
				sha256('schedule-structure'),
				sha256('schedule-dependencies'),
				sha256('schedule-run'),
				now,
				now,
				now,
				now,
			],
		},
		{
			sql: `INSERT INTO operation_locks
				(id, scope, resource_key, lease_owner, lease_until, fencing_token,
				 created_at, updated_at)
			VALUES ('production-readiness-schedule-lock', 'import-promotion', ?, ?,
				'2027-01-01T00:00:00.000Z', 1, ?, ?)`,
			params: [`schedule:${periodId}`, lockOwner, now, now],
		},
		{
			sql: `INSERT INTO schedule_versions
				(id, academic_period_id, import_run_id, schema_version, generation_id,
				 generated_at, version_hash_sha256, is_published, published_at, retired_at,
				 promotion_owner, promotion_fencing_token, created_at)
			VALUES (?, ?, ?, 1, 'production-readiness-generation', ?, ?, 0,
				NULL, NULL, NULL, NULL, ?)`,
			params: [
				SCHEDULE_VERSION_ID,
				periodId,
				scheduleRunId,
				now,
				sha256('schedule-version'),
				now,
			],
		},
		{
			sql: `UPDATE schedule_versions SET is_published = 1, published_at = ?,
				promotion_owner = ?, promotion_fencing_token = 1 WHERE id = ?`,
			params: [now, lockOwner, SCHEDULE_VERSION_ID],
		},
		{
			sql: `INSERT INTO course_groups
				(id, academic_period_id, source_offering_key, display_name,
				 normalized_price_key, lesson_kind, subject, capacity_default,
				 capacity_override, requires_admin_approval, catalog_status,
				 last_seen_schedule_version_id, retired_at, created_at, updated_at)
			VALUES (?, ?, 'production-readiness-offering', 'Synthetic Kunstgruppe',
				'kunst', 'group', 'Kunst', 12, NULL, 0, 'published', ?, NULL, ?, ?)`,
			params: [COURSE_ID, periodId, SCHEDULE_VERSION_ID, now, now],
		},
		{
			sql: `INSERT INTO course_sessions
				(id, course_group_id, schedule_version_id, source_namespace,
				 source_block_id, source_block_hash_sha256, display_name_snapshot,
				 lesson_kind_snapshot, subject_snapshot, day_code, start_time, end_time,
				 duration_minutes, timezone, teacher_name, building, room,
				 location_display, is_current, retired_at, created_at)
			VALUES (?, ?, ?, 'synthetic', 'production-readiness-block', ?,
				'Synthetic Kunstgruppe', 'group', 'Kunst', 'MO', '15:00', '16:30',
				90, 'Europe/Berlin', 'Synthetic Teacher', 'A', '1',
				'Gebäude A, Raum 1', 1, NULL, ?)`,
			params: [SESSION_ID, COURSE_ID, SCHEDULE_VERSION_ID, sha256('schedule-block'), now],
		},
		{
			sql: `INSERT INTO course_pricing_profiles
				(id, course_group_id, contract_kind, price_key, normalized_price_key,
				 subjects_json, duration_source, admin_duration_minutes, status, version,
				 reason, confirmed_by, created_at, updated_at)
			VALUES ('production-readiness-pricing-profile', ?, 'group_yearly',
				'Kunst', 'kunst', '[]', 'admin_confirmed', 90, 'confirmed', 1,
				'Synthetic integration fixture', ?, ?, ?)`,
			params: [COURSE_ID, ADMIN_ID, now, now],
		},
	]);
}

async function importSyntheticPrice(
	db: DatabaseBoundary,
	periodId: string,
	now: string,
	priceEuros: string,
	expectedPriceCents: number,
	sourceLabel: string
): Promise<{ versionId: string; ruleId: string }> {
	const period = await db.first<AcademicPeriodRow>({
		sql: `SELECT id, code, display_name, starts_on, ends_on, is_current
			FROM academic_periods WHERE id = ?`,
		params: [periodId],
	});
	if (!period) throw new Error('Synthetic academic period is missing.');

	const workbook = createSyntheticPriceWorkbook({
		macroEnabled: false,
		rows: [
			{
				key: 'Kunst',
				preis: priceEuros,
				dauer: '90',
				faecher: null,
				sonderpreis: '60',
				kinder: '1',
			},
		],
	});
	const snapshot = await parsePriceWorkbook(workbook);
	const dependencies = await buildDependencySet({ source_contract: 'price-workbook:1' });
	const runFingerprint = await buildRunFingerprint({
		sourceKind: 'price',
		academicPeriodId: period.id,
		sourceHashSha256: sha256(workbook),
		dependencySetHashSha256: dependencies.hashSha256,
	});
	const imports = new ImportRepository(db);
	const run = await imports.createRun({
		sourceKind: 'price',
		academicPeriodId: period.id,
		sourceLabel,
		sourceHashSha256: sha256(workbook),
		sourceContractId: snapshot.sourceContractId,
		sourceContractVersion: snapshot.sourceContractVersion,
		structuralFingerprintSha256: snapshot.structuralFingerprintSha256,
		dependencyHashes: dependencies.canonical,
		dependencySetHashSha256: dependencies.hashSha256,
		runFingerprint,
		now,
	});
	await imports.stagePrice({ runId: run.runId, period, snapshot, now });
	await imports.promote(run.runId, now);

	const rule = await db.first<{
		version_id: string;
		rule_id: string;
		yearly_price_cents: number;
	}>({
		sql: `SELECT version.id AS version_id, rule.id AS rule_id,
			rule.yearly_price_cents
		FROM price_versions version
		JOIN price_rules rule ON rule.price_version_id = version.id
		WHERE version.academic_period_id = ? AND version.is_active = 1
			AND rule.normalized_key = 'kunst' AND rule.children_count = 1`,
		params: [periodId],
	});
	if (!rule || rule.yearly_price_cents !== expectedPriceCents) {
		throw new Error('Synthetic price was not promoted.');
	}
	return { versionId: rule.version_id, ruleId: rule.rule_id };
}

async function installSyntheticWithdrawalTemplate(
	db: DatabaseBoundary,
	store: MemoryPrivateStore,
	now: string
): Promise<string> {
	const basisHash = sha256('synthetic-widerruf-applicable-basis-v1');
	const bundleKey = 'contract-templates/synthetic/group_yearly/withdrawal-v1.json';
	const bundle = new TextEncoder().encode('synthetic withdrawal template bundle');
	const bundleHash = sha256(bundle);
	await store.put(bundleKey, bundle, bundleHash);
	await db.run({
		sql: `INSERT INTO contract_template_versions
			(id, template_id, template_version, render_schema_version,
			 clause_set_version, provider_version_id, media_contact_version_id,
			 template_bundle_r2_key, bundle_hash, html_source_hash, css_source_hash,
			 asset_manifest_json, font_manifest_json, required_fields_json,
			 renderer_id, renderer_contract_version, worker_compatibility_date,
			 usage_scope, approval_status, approval_basis, distance_legal_profile,
			 distance_legal_basis_version, distance_legal_basis_hash,
			 kuendigung_function_required, early_performance_supported,
			 approved_by, approved_at, valid_from, valid_to, created_at)
		SELECT ?, template_id, 'synthetic-withdrawal-v1', render_schema_version,
			clause_set_version, provider_version_id, media_contact_version_id,
			?, ?, html_source_hash, css_source_hash, asset_manifest_json,
			font_manifest_json, required_fields_json, renderer_id,
			renderer_contract_version, worker_compatibility_date, 'synthetic_test',
			'approved', 'synthetic_fixture', 'widerruf_applicable',
			'synthetic-widerruf-basis-v1', ?, 0, 1, ?, ?, NULL, NULL, ?
		FROM contract_template_versions
		WHERE id = 'contract-template:synthetic:group_yearly:v1'`,
		params: [
			SYNTHETIC_WITHDRAWAL_TEMPLATE_ID,
			bundleKey,
			bundleHash,
			basisHash,
			ADMIN_ID,
			now,
			now,
		],
	});
	return basisHash;
}

function groupRenderInput(input: {
	childName: string;
	parentName: string;
	distanceLegalBasisHash: string;
}) {
	return {
		schemaVersion: 'contract-render-v1' as const,
		templateId: 'group_yearly' as const,
		provider: {
			fullName: 'Kolibri Testverein',
			addressLines: ['Teststraße 1'],
			role: 'provider' as const,
			payerRole: false,
			paymentTermsVersion: 'synthetic-payment-v1',
		},
		parent: {
			fullName: input.parentName,
			addressLines: ['Synthetic address'],
			role: 'contracting_parent' as const,
			payerRole: true,
		},
		child: {
			fullName: input.childName,
			addressLines: ['Synthetic address'],
			role: 'child' as const,
			payerRole: false as const,
			birthDate: '2017-03-04',
		},
		service: {
			relation: 'course' as const,
			courseGroupId: COURSE_ID,
			requestId: null,
			requestKind: null,
			fundingAuthorizationId: null,
			subject: 'Kunst',
			scheduleLines: ['Montag 15:00–16:30'],
			effectiveFrom: '2026-08-01',
			effectiveTo: null,
		},
		billing: {
			model: 'monthly_group_fee' as const,
			currency: 'EUR' as const,
			unitMinutes: null,
			priceSource: 'excel_yearly' as const,
			priceMode: 'rule_derived' as const,
			basePriceCents: 4600,
			finalPriceCents: 4600,
			amountSemantics: 'base_price' as const,
			paymentArrangement: 'manual_payment' as const,
			paymentDueDay: 7,
			billingPeriodCode: 'calendar_month' as const,
			lineItems: [
				{
					code: 'monthly-base',
					description: 'Monatlicher Grundpreis',
					amountCents: 4600,
					semantics: 'base_price' as const,
					basis: 'synthetic initial price',
				},
			],
			basePriceDisclaimer: true,
		},
		term: {
			initialTermText: 'Synthetische Testlaufzeit.',
			renewalText: 'Keine feste Testverlängerung.',
			ordinaryTerminationText: 'Ordentliche Beendigung nach Vertragsprofil.',
			extraordinaryTerminationText: 'Außerordentliche Beendigung bleibt möglich.',
		},
		legal: {
			clauseSetVersion: 'synthetic-clause-v1',
			attachments: ['Datenschutzhinweis'],
			privacyNoticeVersion: 'synthetic-notice-v1',
			distanceLegalProfile: 'widerruf_applicable' as const,
			distanceLegalBasisHash: input.distanceLegalBasisHash,
			withdrawalTextVersion: 'synthetic-withdrawal-v1',
			earlyPerformanceRequestVersion: 'synthetic-early-performance-v1',
			wertersatzNoticeVersion: 'synthetic-wertersatz-v1',
			mediaClauseVersion: 'synthetic-media-v1',
		},
	};
}

describe('stage 13 synthetic production-readiness lifecycle in one migrated D1', () => {
	let context: TestD1Context;

	afterEach(async () => {
		if (context) await context.dispose();
	});

	it('connects registration through terminal contract state to successful privacy closure', async () => {
		context = await createMigratedTestD1();
		const db = new DatabaseBoundary(context.db);
		let currentTime = '2026-07-22T10:00:00.000Z';
		const clock: AuthClock = { now: () => currentTime };
		const legacy = await seedCurrentLegacySnapshot({ db: context.db, families: [] });
		await seedAdminAndCatalog(db, legacy.periodId, currentTime);

		const authRepository = new AuthRepository(db);
		const limiter = new AuthRateLimiter(
			new FoundationRepository(db),
			AUTH_SECRET,
			authConfig.rateLimitWindowSeconds,
			authConfig.rateLimitMaxAttempts
		);
		const sessions = new SessionService(
			authRepository,
			AUTH_SECRET,
			authConfig.sessionTtlSeconds
		);
		const auth = new AuthService(
			authRepository,
			new BcryptPasswordHasher(12, 128, 4),
			new FakeTurnstileVerifier(),
			limiter,
			sessions,
			AUTH_SECRET,
			authConfig,
			clock,
			new LegacyFamilyVerificationExtension(db)
		);
		const emailProvider = new FakeEmailProvider();
		const authDispatcher = new AuthEmailDispatcher(
			authRepository,
			emailProvider,
			AUTH_SECRET,
			{ portalPublicOrigin: 'https://portal.example.test' },
			() => currentTime
		);

		expect(
			await auth.register({
				data: {
					email: PARENT_EMAIL,
					password: PASSWORD,
					firstName: 'Synthetic',
					lastName: 'Parent',
					privacyAccepted: true,
					privacyNoticeVersion: 'synthetic-notice-v1',
					turnstileToken: 'synthetic-turnstile-pass',
				},
				requestSubject: 'production-readiness-registration-subject',
				requestId: 'production-readiness-registration',
			})
		).toMatchObject({ accepted: true, created: true });

		let verificationToken = '';
		for (let attempt = 0; attempt < 12 && !verificationToken; attempt += 1) {
			await authDispatcher.dispatchNext();
			const message = emailProvider.messages.find(
				(candidate) =>
					candidate.to === PARENT_EMAIL && candidate.text.includes('/auth/verify')
			);
			const link = message?.text.match(/https:\/\/portal\.example\.test\/[^\s]+/u)?.[0];
			verificationToken = link ? (new URL(link).searchParams.get('token') ?? '') : '';
		}
		expect(verificationToken.length).toBeGreaterThan(32);
		expect(
			await auth.verifyEmail({
				token: verificationToken,
				requestId: 'production-readiness-verification',
				requestSubject: 'production-readiness-verification-subject',
			})
		).toBe(true);

		const loginParent = async (requestSubject: string): Promise<AuthenticatedUser> => {
			const login = await auth.login({
				data: { email: PARENT_EMAIL, password: PASSWORD },
				requestSubject,
			});
			const actor = await sessions.authenticate(login.sessionToken, currentTime);
			if (!actor) throw new Error('Synthetic parent session was not created.');
			return actor;
		};
		let parent = await loginParent('production-readiness-login-initial');
		expect(parent).toMatchObject({ role: 'parent', emailVerified: true });

		const cabinet = new CabinetService(
			new CabinetRepository(db),
			new CabinetPricingService(pricingConfig),
			[],
			() => currentTime
		);
		expect(
			await cabinet.createChild({
				actor: parent,
				payload: {
					fullName: 'Synthetic Lifecycle Child',
					birthDate: '2017-03-04',
					confirmDuplicate: false,
				},
				requestId: 'production-readiness-child-create',
			})
		).toBe('created');
		const cabinetState = await cabinet.load(parent);
		expect(cabinetState.profile.familyDisplayId).toMatch(/^2\. \d{4,}$/u);
		expect(cabinetState.children).toEqual([
			expect.objectContaining({
				fullName: 'Synthetic Lifecycle Child',
				birthDate: '2017-03-04',
				origin: 'portal',
			}),
		]);
		const childId = cabinetState.children[0].id;

		const requests = new IndividualRequestService(
			new IndividualRequestRepository(db),
			pricingConfig,
			() => currentTime
		);
		const requestDraft = await requests.createDraft({
			actor: parent,
			requestId: 'production-readiness-request-create',
			payload: {
				childId,
				requestKind: 'individual',
				fundingKind: 'self_pay',
				subjects: 'Zeichnen',
				description: 'Synthetic connected lifecycle request',
				preferredDays: ['MO'],
				preferredTimeWindows: [{ dayCode: 'MO', startTime: '15:00', endTime: '17:00' }],
				preferredFormat: 'onsite',
				preferredLocations: ['Synthetic location'],
				idempotencyKey: 'production-readiness-request-create-key',
			},
		});
		const ownerRequest = await requests.loadOwnerRequest(parent, requestDraft.requestId);
		expect(
			await requests.submit({
				actor: parent,
				payload: {
					requestId: ownerRequest.id,
					expectedVersion: ownerRequest.version,
					idempotencyKey: 'production-readiness-request-submit-key',
				},
				requestId: 'production-readiness-request-submit',
			})
		).toMatchObject({ status: 'pending_admin_review', replayed: false });

		const occupancy = new OccupancyRepository(db);
		const trialsRepository = new TrialRepository(db);
		const trials = new TrialService(
			trialsRepository,
			new CatalogRepository(db),
			occupancy,
			() => currentTime
		);
		const trial = await trials.submit({
			actor: parent,
			payload: {
				courseGroupId: COURSE_ID,
				childId,
				sessionId: SESSION_ID,
				requestedDate: '2026-07-27',
				idempotencyKey: 'production-readiness-trial-submit-key',
			},
			requestId: 'production-readiness-trial-submit',
		});
		const adminMutations = new AdminMutationRepository(db);
		await adminMutations.transitionTrial({
			actor: admin,
			trialId: trial.id,
			action: 'confirm',
			sessionId: SESSION_ID,
			confirmedDate: '2026-07-27',
			reason: 'Synthetic date and capacity verified.',
			idempotencyKey: 'production-readiness-trial-confirm-key',
			requestId: 'production-readiness-trial-confirm',
			currentDate: '2026-07-22',
			now: currentTime,
		});
		currentTime = '2026-07-28T10:00:00.000Z';
		await adminMutations.transitionTrial({
			actor: admin,
			trialId: trial.id,
			action: 'attended',
			reason: 'Synthetic attendance recorded.',
			idempotencyKey: 'production-readiness-trial-attended-key',
			requestId: 'production-readiness-trial-attended',
			currentDate: '2026-07-28',
			now: currentTime,
		});
		await adminMutations.transitionTrial({
			actor: admin,
			trialId: trial.id,
			action: 'convert',
			reason: 'Synthetic trial proceeds to the contract workflow.',
			idempotencyKey: 'production-readiness-trial-convert-key',
			requestId: 'production-readiness-trial-convert',
			currentDate: '2026-07-28',
			now: currentTime,
		});
		expect(
			await db.first<{ status: string }>({
				sql: 'SELECT status FROM trial_bookings WHERE id = ?',
				params: [trial.id],
			})
		).toEqual({ status: 'converted' });
		const initialPrice = await importSyntheticPrice(
			db,
			legacy.periodId,
			currentTime,
			'46',
			4600,
			'synthetic-production-readiness-initial-price'
		);

		const store = new MemoryPrivateStore();
		const runtimeConfig = loadRuntimeConfig({
			APP_ENV: 'test',
			PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
			DB: context.db,
			R2_ARCHIVE: { get() {}, put() {}, delete() {} } as unknown as R2Bucket,
			R2_QUARANTINE: { get() {}, put() {}, delete() {} } as unknown as R2Bucket,
			CONTRACT_SEND_ENABLED: 'true',
			CONTRACT_RENDERER: 'synthetic_test',
		});
		const contractRepository = new ContractRepository(db);
		const contracts = new ContractService(
			contractRepository,
			store,
			runtimeConfig,
			undefined,
			() => currentTime
		);
		await contracts.installSyntheticTestFixtures(admin);
		const distanceLegalBasisHash = await installSyntheticWithdrawalTemplate(
			db,
			store,
			currentTime
		);
		const offer = await contracts.createDraft({
			admin,
			requestId: 'production-readiness-contract-create',
			payload: {
				userId: parent.id,
				childId,
				academicPeriodId: legacy.periodId,
				templateVersionId: SYNTHETIC_WITHDRAWAL_TEMPLATE_ID,
				priceVersionId: initialPrice.versionId,
				priceRuleId: initialPrice.ruleId,
				renderInput: groupRenderInput({
					childName: 'Synthetic Lifecycle Child',
					parentName: 'Synthetic Parent',
					distanceLegalBasisHash,
				}),
				expiresAt: '2026-08-15T10:00:00.000Z',
				idempotencyKey: 'production-readiness-contract-create-key',
			},
		});
		const rendered = await contracts.renderAndSend({
			admin,
			offerId: offer.offerId,
			idempotencyKey: 'production-readiness-contract-render-key',
			requestId: 'production-readiness-contract-render',
		});
		expect(rendered.contractHash).toMatch(/^[0-9a-f]{64}$/u);
		await contracts.parentDecision({
			actor: parent,
			payload: {
				offerId: offer.offerId,
				expectedContractHash: rendered.contractHash,
				decision: 'accept',
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText:
					'Ich nehme genau dieses unveränderte synthetische Vertragsangebot verbindlich an.',
				idempotencyKey: 'production-readiness-contract-accept-key',
			},
			userAgent: 'vitest-stage-13',
			requestSubject: '192.0.2.13',
			requestId: 'production-readiness-contract-accept',
		});
		expect(
			await db.first<{ count: number }>({
				sql: 'SELECT COUNT(*) AS count FROM contracts WHERE contract_offer_id = ?',
				params: [offer.offerId],
			})
		).toEqual({ count: 0 });
		const formation = await contracts.formAndActivate({
			admin,
			requestId: 'production-readiness-contract-form',
			payload: {
				offerId: offer.offerId,
				reason: 'Synthetic price, capacity and immutable acceptance revalidated.',
				confirmation: 'confirmed',
				idempotencyKey: 'production-readiness-contract-form-key',
			},
		});
		expect(formation).toMatchObject({ certificateReady: true, replayed: false });
		const activeContract = await db.first<{
			enrollment_id: string;
			operational_status: string;
		}>({
			sql: `SELECT enrollment_id, operational_status FROM contracts WHERE id = ?`,
			params: [formation.contractId],
		});
		expect(activeContract?.operational_status).toBe('active');
		expect(
			await db.first<{ status: string; current_price_cents: number }>({
				sql: 'SELECT status, current_price_cents FROM enrollments WHERE id = ?',
				params: [activeContract!.enrollment_id],
			})
		).toEqual({ status: 'active', current_price_cents: 4600 });

		const priceReviewRepository = new PriceReviewRepository(db);
		const priceReviews = new PriceReviewService(
			priceReviewRepository,
			new PricingService(new PricingRepository(db), occupancy, pricingConfig),
			occupancy,
			{ portalPublicOrigin: 'https://portal.example.test' }
		);
		expect(await priceReviews.runScheduledMaintenance(currentTime)).toMatchObject({
			processedTriggers: 1,
			applied: 0,
			superseded: 0,
		});
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM price_review_triggers WHERE status = 'pending'`,
			})
		).toEqual({ count: 0 });

		currentTime = '2026-08-02T10:00:00.000Z';
		const promotedPrice = await importSyntheticPrice(
			db,
			legacy.periodId,
			currentTime,
			'49',
			4900,
			'synthetic-production-readiness-replacement-price'
		);
		const comparison = await priceReviews.createAdminComparison({
			admin,
			payload: {
				courseGroupId: COURSE_ID,
				effectiveOn: '2026-08-02',
				reason: 'Synthetic promoted-price comparison.',
				confirmation: 'confirmed',
				idempotencyKey: 'production-readiness-price-compare-key',
			},
			requestId: 'production-readiness-price-compare',
			now: currentTime,
		});
		const reviewItems = await priceReviewRepository.listBatchItems(comparison.batchId);
		expect(reviewItems).toEqual([
			expect.objectContaining({
				userId: parent.id,
				targetId: activeContract!.enrollment_id,
				oldPriceCents: 4600,
				newFinalPriceCents: 4900,
				status: 'draft',
			}),
		]);
		await priceReviews.approveBatch({
			admin,
			payload: {
				batchId: comparison.batchId,
				reason: 'Synthetic review item checked.',
				confirmation: 'confirmed',
				idempotencyKey: 'production-readiness-price-approve-key',
			},
			requestId: 'production-readiness-price-approve',
			now: currentTime,
		});
		expect(
			await priceReviews.dispatchBatch({
				admin,
				payload: {
					batchId: comparison.batchId,
					confirmation: 'confirmed',
					idempotencyKey: 'production-readiness-price-dispatch-key',
				},
				requestId: 'production-readiness-price-dispatch',
				now: currentTime,
			})
		).toEqual({ replayed: false, sent: 1 });

		currentTime = '2026-08-03T10:00:00.000Z';
		parent = await loginParent('production-readiness-login-price-response');
		const parentReview = (await priceReviewRepository.listParentItems(parent.id))[0];
		expect(
			await priceReviews.respond({
				actor: parent,
				payload: {
					publicReference: parentReview.publicReference,
					itemHash: parentReview.itemHash,
					decision: 'accept',
					idempotencyKey: 'production-readiness-price-parent-accept-key',
				},
				requestId: 'production-readiness-price-parent-accept',
				requestSubject: '192.0.2.14',
				userAgent: 'vitest-stage-13',
				now: currentTime,
			})
		).toEqual({ status: 'accepted_by_parent', replayed: false });
		await priceReviews.finalConfirm({
			admin,
			payload: {
				itemId: parentReview.id,
				reason: 'Synthetic parent acceptance revalidated.',
				confirmation: 'confirmed',
				idempotencyKey: 'production-readiness-price-final-key',
			},
			requestId: 'production-readiness-price-final',
			now: '2026-08-04T10:00:00.000Z',
		});
		expect((await priceReviewRepository.getItemById(parentReview.id))?.scheduledFor).toBe(
			'2026-09-01'
		);
		expect(
			await priceReviews.runScheduledMaintenance('2026-09-01T00:30:00.000Z')
		).toMatchObject({ applied: 1 });
		expect(
			await db.first<{
				current_price_cents: number;
				current_price_version_id: string;
				current_price_rule_id: string;
			}>({
				sql: `SELECT current_price_cents, current_price_version_id,
					current_price_rule_id FROM enrollments WHERE id = ?`,
				params: [activeContract!.enrollment_id],
			})
		).toEqual({
			current_price_cents: 4900,
			current_price_version_id: promotedPrice.versionId,
			current_price_rule_id: promotedPrice.ruleId,
		});

		currentTime = '2026-09-01T09:00:00.000Z';
		parent = await loginParent('production-readiness-login-privacy');
		expect(
			(await contractRepository.listAdminOffers()).some((item) => item.id === offer.offerId)
		).toBe(true);
		expect(
			(await trialsRepository.listAdminTrials({ q: '', status: '' })).some(
				(item) => item.id === trial.id
			)
		).toBe(true);
		expect(
			(await priceReviewRepository.listAdminBatches()).find(
				(batch) => batch.id === comparison.batchId
			)
		).toMatchObject({ itemCount: 1 });
		await db.run({
			sql: `UPDATE users SET account_status = 'deletion_requested', updated_at = ?
				WHERE id = ?`,
			params: [currentTime, parent.id],
		});
		expect(
			(await contractRepository.listAdminOffers()).some((item) => item.id === offer.offerId)
		).toBe(true);
		expect(
			(await trialsRepository.listAdminTrials({ q: '', status: '' })).some(
				(item) => item.id === trial.id
			)
		).toBe(true);
		expect(await priceReviewRepository.listBatchItems(comparison.batchId)).toHaveLength(1);
		await db.run({
			sql: `UPDATE users SET account_status = 'active', updated_at = ? WHERE id = ?`,
			params: [currentTime, parent.id],
		});
		const messagesRepository = new MessageRepository(db);
		const messages = new MessageService(
			messagesRepository,
			{
				emailMaxAttempts: 3,
				telegramMaxAttempts: 3,
				telegramSchedule: parseBusinessHours('Europe/Berlin', 'Mo-Fr 09:00-17:00'),
			},
			() => currentTime
		);
		const support = await messages.createThread({
			actor: parent,
			payload: {
				category: 'contract',
				subject: 'Synthetic lifecycle question',
				message: 'Please keep this synthetic message inside the connected D1 flow.',
				idempotencyKey: 'production-readiness-support-create-key',
			},
			requestId: 'production-readiness-support-create',
			now: currentTime,
		});
		expect(
			await messagesRepository.getOwnerThread(support.publicReference, parent.id)
		).toMatchObject({ status: 'waiting_for_admin', messageCount: 1 });

		const privacy = new PrivacyService(
			new PrivacyRepository(db),
			store,
			{ exportTtlSeconds: 3600 },
			() => currentTime,
			store
		);
		expect((await privacy.dryRunDeletion(parent)).activeContracts).toContainEqual({
			category: 'digital_contract',
			count: 1,
		});
		const blockedClosure = await privacy.requestDeletion({
			actor: parent,
			idempotencyKey: 'production-readiness-privacy-blocked-key',
			requestId: 'production-readiness-privacy-blocked',
		});
		expect(blockedClosure.status).toBe('blocked_by_active_contract');
		expect(
			await db.first<{ account_status: string; owner_user_id: string | null }>({
				sql: `SELECT user.account_status, child.owner_user_id
					FROM users user JOIN children child ON child.id = ? WHERE user.id = ?`,
				params: [childId, parent.id],
			})
		).toEqual({ account_status: 'active', owner_user_id: parent.id });

		expect(
			await contracts.submitEndRequest({
				actor: parent,
				payload: {
					contractId: formation.contractId,
					kind: 'withdrawal',
					requestedEffectiveOn: null,
					requestTextVersion: 'synthetic-withdrawal-request-v1',
					idempotencyKey: 'production-readiness-contract-withdrawal-key',
				},
				requestId: 'production-readiness-contract-withdrawal',
			})
		).toMatchObject({ status: 'completed', replayed: false });
		expect(
			await db.first<{ contract_status: string; enrollment_status: string }>({
				sql: `SELECT contract.operational_status AS contract_status,
					enrollment.status AS enrollment_status
				FROM contracts contract JOIN enrollments enrollment
					ON enrollment.id = contract.enrollment_id WHERE contract.id = ?`,
				params: [formation.contractId],
			})
		).toEqual({ contract_status: 'terminated', enrollment_status: 'ended' });
		expect((await privacy.dryRunDeletion(parent)).activeContracts).toEqual([]);

		const closureRequest = await privacy.requestDeletion({
			actor: parent,
			idempotencyKey: 'production-readiness-privacy-success-key',
			requestId: 'production-readiness-privacy-success',
		});
		expect(closureRequest.status).toBe('requested');
		const closure = await privacy.processDeletion({
			admin,
			privacyRequestId: closureRequest.requestId,
			reason: 'Synthetic identity, terminal services and retained evidence verified.',
			idempotencyKey: 'production-readiness-privacy-process-key',
			requestId: 'production-readiness-privacy-process',
		});
		expect(closure.status).toBe('completed_with_retained_evidence');

		const closed = await db.first<{
			account_status: string;
			email: string;
			family_number_id: string | null;
			owner_user_id: string | null;
			full_name: string;
		}>({
			sql: `SELECT user.account_status, user.email, user.family_number_id,
				child.owner_user_id, child.full_name
			FROM users user JOIN children child ON child.id = ? WHERE user.id = ?`,
			params: [childId, parent.id],
		});
		expect(closed).toMatchObject({
			account_status: 'closed',
			family_number_id: null,
			owner_user_id: null,
			full_name: 'Geschlossenes Profil',
		});
		expect(closed?.email).toMatch(/^closed-.+@tombstone\.invalid$/u);
		expect(
			await db.first<{
				active_sessions: number;
				retained_contracts: number;
				retained_offers: number;
			}>({
				sql: `SELECT
					(SELECT COUNT(*) FROM auth_sessions
					 WHERE user_id = ? AND revoked_at IS NULL) AS active_sessions,
					(SELECT COUNT(*) FROM legal_archive_records
					 WHERE owner_tombstone_user_id = ? AND target_kind = 'contract')
					 AS retained_contracts,
					(SELECT COUNT(*) FROM legal_archive_records
					 WHERE owner_tombstone_user_id = ? AND target_kind = 'contract_offer')
					 AS retained_offers`,
				params: [parent.id, parent.id, parent.id],
			})
		).toEqual({ active_sessions: 0, retained_contracts: 1, retained_offers: 1 });
		expect(
			(await contractRepository.listAdminOffers()).some((item) => item.id === offer.offerId)
		).toBe(false);
		expect(
			(await trialsRepository.listAdminTrials({ q: '', status: '' })).some(
				(item) => item.id === trial.id
			)
		).toBe(false);
		expect(await priceReviewRepository.listBatchItems(comparison.batchId)).toEqual([]);
		expect(
			(await priceReviewRepository.listAdminBatches()).some(
				(batch) => batch.id === comparison.batchId
			)
		).toBe(false);
		expect(
			await db.first<{ status: string; subject: string; body: string }>({
				sql: `SELECT thread.status, thread.subject, message.body
				FROM support_threads thread JOIN support_messages message
					ON message.thread_id = thread.id WHERE thread.public_reference = ?`,
				params: [support.publicReference],
			})
		).toEqual({ status: 'closed', subject: '[account-closed]', body: '[account-closed]' });
		expect(
			await db.first<{ request_status: string; review_status: string; price_cents: number }>({
				sql: `SELECT request.status AS request_status,
					item.status AS review_status, enrollment.current_price_cents AS price_cents
				FROM individual_requests request
				JOIN price_review_items item ON item.id = ?
				JOIN enrollments enrollment ON enrollment.id = ?
				WHERE request.id = ?`,
				params: [parentReview.id, activeContract!.enrollment_id, ownerRequest.id],
			})
		).toEqual({ request_status: 'cancelled', review_status: 'applied', price_cents: 4900 });
	}, 60_000);
});

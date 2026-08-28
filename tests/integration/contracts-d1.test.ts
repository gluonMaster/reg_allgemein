import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import { loadRuntimeConfig, type RuntimeConfig } from '$lib/server/config/runtime';
import { canonicalJson, hashCanonical } from '$lib/server/import/canonical';
import { ContractRepository } from '$lib/server/contracts/contract-repository';
import { ContractService } from '$lib/server/contracts/contract-service';
import { ContractFamilyCorrectionContributor } from '$lib/server/contracts/boundaries';
import type { ContractArtifactStore } from '$lib/server/contracts/storage';
import {
	buildContractTemplateBundle,
	contractTemplateBundleHashes,
	contractTemplateResourceManifest,
	serializeContractTemplateBundle,
} from '$lib/server/contracts/templates';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import { PrivacyRepository } from '$lib/server/privacy/privacy-repository';
import { PrivacyService } from '$lib/server/privacy/privacy-service';
import { OperationsRepository } from '$lib/server/operations/operations-repository';
import { requireAdmin } from '$lib/server/security/authorization';
import { sha256Bytes } from '$lib/server/security/digest';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const now = '2026-07-22T10:00:00.000Z';
const hash = (character: string) => character.repeat(64);
const parent: AuthenticatedUser = {
	id: 'parent-contract',
	role: 'parent',
	emailVerified: true,
	sessionId: 'parent-session',
	sessionVersion: 1,
	csrfHash: 'parent-csrf',
};
const foreignParent: AuthenticatedUser = {
	id: 'foreign-contract',
	role: 'parent',
	emailVerified: true,
	sessionId: 'foreign-session',
	sessionVersion: 1,
	csrfHash: 'foreign-csrf',
};
const admin = requireAdmin({
	id: 'admin-contract',
	role: 'admin',
	emailVerified: true,
	sessionId: 'admin-session',
	sessionVersion: 1,
	csrfHash: 'admin-csrf',
});

class MemoryStore implements ContractArtifactStore {
	readonly values = new Map<string, Uint8Array>();
	beforeGet?: (key: string) => Promise<void>;
	async put(key: string, body: Uint8Array) {
		this.values.set(key, Uint8Array.from(body));
	}
	async putIfAbsent(key: string, body: Uint8Array) {
		if (this.values.has(key)) return false;
		this.values.set(key, Uint8Array.from(body));
		return true;
	}
	async get(key: string) {
		const value = this.values.get(key);
		if (!value) return null;
		const copy = Uint8Array.from(value);
		await this.beforeGet?.(key);
		return { body: copy.buffer, size: copy.byteLength };
	}
	async delete(key: string) {
		this.values.delete(key);
	}
}

class BeforeBatchDatabaseBoundary extends DatabaseBoundary {
	private beforeBatch: (() => Promise<void>) | null;

	constructor(database: D1Database, beforeBatch: () => Promise<void>) {
		super(database);
		this.beforeBatch = beforeBatch;
	}

	override async batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]> {
		const beforeBatch = this.beforeBatch;
		this.beforeBatch = null;
		await beforeBatch?.();
		return super.batch<T>(statements);
	}
}

class TwoCallBatchBarrierBoundary extends DatabaseBoundary {
	private arrivals = 0;
	private readonly released: Promise<void>;
	private release!: () => void;

	constructor(database: D1Database) {
		super(database);
		this.released = new Promise<void>((resolve) => {
			this.release = resolve;
		});
	}

	override async batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]> {
		this.arrivals += 1;
		if (this.arrivals === 2) this.release();
		await this.released;
		return super.batch<T>(statements);
	}
}

async function seed(db: DatabaseBoundary) {
	await db.batch([
		{
			sql: `INSERT INTO academic_periods
			(id, code, display_name, starts_on, ends_on, is_current, created_at)
			VALUES ('period-contract', '2026-2027', '2026/2027', '2026-01-01',
				'2027-12-31', 1, ?)`,
			params: [now],
		},
		{
			sql: `INSERT INTO import_runs
			(id, source_kind, academic_period_id, source_label, source_hash_sha256,
			 source_contract_id, source_contract_version, structural_fingerprint_sha256,
			 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
			 attempt_no, retry_of_run_id, status, started_at, validated_at, promoted_at,
			 finished_at, rows_total, rows_staged, rows_promoted, rows_skipped,
			 safe_summary_json, error_code, created_at, updated_at)
			VALUES ('run-contract', 'schedule', 'period-contract', 'synthetic', ?,
				'schedule-json', 1, ?, '{}', ?, ?, 1, NULL, 'validated', ?, ?, NULL,
				NULL, 0, 0, 0, 0, '{}', NULL, ?, ?)`,
			params: [hash('1'), hash('2'), hash('3'), hash('4'), now, now, now, now],
		},
		{
			sql: `INSERT INTO family_number_allocations
			(id, namespace, sequence_number, display_family_id, legacy_family_id,
			 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
			 created_at, updated_at)
			VALUES ('family-contract', 'portal_2', 9101, '2. 9101', NULL,
				'parent-contract', 'portal', 'assigned', ?, NULL, ?, ?)`,
			params: [now, now, now],
		},
		{
			sql: `INSERT INTO family_number_allocations
			(id, namespace, sequence_number, display_family_id, legacy_family_id,
			 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
			 created_at, updated_at)
			VALUES ('family-foreign-contract', 'portal_2', 9102, '2. 9102', NULL,
				'foreign-contract', 'portal', 'assigned', ?, NULL, ?, ?)`,
			params: [now, now, now],
		},
	]);
	for (const user of [
		[
			'parent-contract',
			'parent-contract@example.test',
			'parent',
			'family-contract',
			'assigned',
			1,
		],
		[
			'foreign-contract',
			'foreign-contract@example.test',
			'parent',
			'family-foreign-contract',
			'assigned',
			1,
		],
		['admin-contract', 'admin-contract@example.test', 'admin', null, 'pending_verification', 0],
	] as const) {
		await db.run({
			sql: `INSERT INTO users
			(id, email, email_normalized, password_hash, email_verified_at, role,
			 first_name, last_name, first_name_normalized, last_name_normalized,
			 family_number_id, family_assignment_status, family_version,
			 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
			VALUES (?, ?, ?, 'not-used', ?, ?, 'Test', 'Person', 'test', 'person',
				?, ?, ?, 'privacy-v1', ?, ?, ?)`,
			params: [
				user[0],
				user[1],
				user[1],
				now,
				user[2],
				user[3],
				user[4],
				user[5],
				now,
				now,
				now,
			],
		});
	}
	for (const child of [
		['child-contract', 'parent-contract', 'family-contract', 'Mária Beispiel'],
		['child-foreign-contract', 'foreign-contract', 'family-foreign-contract', 'Fremdes Kind'],
	] as const) {
		await db.run({
			sql: `INSERT INTO children
			(id, owner_user_id, legacy_family_id, family_number_id, origin,
			 source_child_key, source_full_name, source_full_name_normalized,
			 source_birth_date, full_name_override, birth_date_override, full_name,
			 full_name_normalized, birth_date, last_seen_run_id, is_current,
			 created_at, updated_at)
			VALUES (?, ?, NULL, ?, 'portal', ?, ?, lower(?), '2017-03-04', NULL,
				NULL, ?, lower(?), '2017-03-04', 'run-contract', 1, ?, ?)`,
			params: [
				child[0],
				child[1],
				child[2],
				`source-${child[0]}`,
				child[3],
				child[3],
				child[3],
				child[3],
				now,
				now,
			],
		});
	}
	await db.run({
		sql: `INSERT INTO course_groups
		(id, academic_period_id, source_offering_key, display_name, normalized_price_key,
		 lesson_kind, subject, capacity_default, capacity_override,
		 requires_admin_approval, catalog_status, last_seen_schedule_version_id,
		 retired_at, created_at, updated_at)
		VALUES ('course-contract', 'period-contract', 'course-contract', 'Mathematik A',
			'mathematik', 'group', 'Mathematik', 6, NULL, 0, 'published', NULL, NULL, ?, ?)`,
		params: [now, now],
	});
	await db.run({
		sql: `INSERT INTO individual_requests
		(id, user_id, child_id, request_kind, funding_kind, subjects_raw, description,
		 preferred_days_json, preferred_time_windows_json, preferred_format,
		 preferred_locations_json, unit_rate_cents, parent_payable, status, version,
		 create_idempotency_key, create_request_hash_sha256, admin_decision,
		 admin_notes, reviewed_by, reviewed_at, created_at, updated_at)
		VALUES ('individual-contract-request', 'parent-contract', 'child-contract',
			'individual', 'self_pay', 'Klavier', '', '[]', '[]', 'onsite', '[]',
			3000, 1, 'approved', 1, 'individual-contract-fixture', ?, 'approved',
			NULL, 'admin-contract', ?, ?, ?)`,
		params: [hash('8'), now, now, now],
	});
	await db.run({
		sql: `INSERT INTO price_quotes
		(id, user_id, child_id, course_group_id, planned_start_on, lesson_kind,
		 active_children_count_as_of, lookup_children_count, price_version_id, price_rule_id,
		 schedule_version_id, plusbtext_version_id, pricing_profile_version, price_source,
		 price_mode, contract_kind, duration_source, duration_status, duration_minutes_used,
		 billing_period_code, estimated_missing_duration, requires_admin_confirmation,
		 parent_payable, base_price_cents, manual_override_cents, manual_override_reason,
		 final_price_cents, decision_code, decision_json, confirmed_duration_minutes,
		 confirmed_price_cents, confirmed_by_admin_user_id, confirmed_at,
		 confirmation_reason, confirmation_json, confirmation_idempotency_key,
		 status, created_at, expires_at)
		VALUES ('group-contract-quote', 'parent-contract', 'child-contract', 'course-contract',
			'2026-08-01', 'group', 0, NULL, NULL, NULL, NULL, NULL, NULL, 'excel_yearly',
			'rule_derived', 'group_yearly', 'price_rule', 'verified', 90, 'calendar_month',
			0, 0, 1, 4600, NULL, NULL, 4600, 'RULE_MATCH', '{}', NULL, NULL, NULL,
			NULL, NULL, NULL, NULL, 'quoted', ?, '2026-08-06T10:00:00.000Z')`,
		params: [now],
	});
}

function groupRenderInput() {
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
			fullName: 'Test Elternteil',
			addressLines: ['Elternweg 2'],
			role: 'contracting_parent' as const,
			payerRole: true,
		},
		child: {
			fullName: 'Mária Beispiel',
			addressLines: ['Elternweg 2'],
			role: 'child' as const,
			payerRole: false as const,
			birthDate: '2017-03-04',
		},
		service: {
			relation: 'course' as const,
			courseGroupId: 'course-contract',
			requestId: null,
			requestKind: null,
			fundingAuthorizationId: null,
			subject: 'Mathematik',
			scheduleLines: ['Montag 16:00–17:30'],
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
					basis: 'synthetic price rule',
				},
			],
			basePriceDisclaimer: true,
		},
		term: {
			initialTermText: 'Testlaufzeit bis Periodenende.',
			renewalText: 'Keine feste Testverlängerung.',
			ordinaryTerminationText: 'Ordentliche Beendigung nach Vertragsprofil.',
			extraordinaryTerminationText: 'Außerordentliche Beendigung bleibt möglich.',
		},
		legal: {
			clauseSetVersion: 'synthetic-clause-v1',
			attachments: ['Datenschutzhinweis'],
			privacyNoticeVersion: 'privacy-v1',
			distanceLegalProfile: 'offline_only' as const,
			distanceLegalBasisHash: null,
			withdrawalTextVersion: 'synthetic-withdrawal-v1',
			earlyPerformanceRequestVersion: null,
			wertersatzNoticeVersion: null,
			mediaClauseVersion: 'synthetic-media-v1',
		},
	};
}

function individualRenderInput() {
	return {
		schemaVersion: 'contract-render-v1' as const,
		templateId: 'individual_hourly' as const,
		provider: {
			fullName: 'Kolibri Testverein',
			addressLines: ['Teststraße 1'],
			role: 'provider' as const,
			payerRole: false,
			paymentTermsVersion: 'synthetic-payment-v1',
		},
		parent: {
			fullName: 'Test Elternteil',
			addressLines: ['Elternweg 2'],
			role: 'contracting_parent' as const,
			payerRole: true,
		},
		child: {
			fullName: 'Mária Beispiel',
			addressLines: ['Elternweg 2'],
			role: 'child' as const,
			payerRole: false as const,
			birthDate: '2017-03-04',
		},
		service: {
			relation: 'request' as const,
			courseGroupId: null,
			requestId: 'individual-contract-request',
			requestKind: 'individual' as const,
			fundingAuthorizationId: null,
			subject: 'Klavier',
			scheduleLines: [],
			effectiveFrom: '2026-08-01',
			effectiveTo: null,
		},
		billing: {
			model: 'delivered_units' as const,
			currency: 'EUR' as const,
			unitMinutes: 45,
			priceSource: 'configured_individual_hourly' as const,
			priceMode: 'rule_derived' as const,
			basePriceCents: 3000,
			finalPriceCents: 3000,
			amountSemantics: 'unit_rate' as const,
			paymentArrangement: 'manual_payment' as const,
			paymentDueDay: 7,
			billingPeriodCode: 'per_45_minutes' as const,
			lineItems: [
				{
					code: 'unit',
					description: '45 Minuten',
					amountCents: 3000,
					semantics: 'unit_rate' as const,
					basis: 'configured tariff',
				},
			],
			basePriceDisclaimer: false,
		},
		term: {
			initialTermText: 'Ab Leistungsbeginn.',
			renewalText: 'Keine automatische Verlängerung.',
			ordinaryTerminationText: 'Ordentliche Beendigung gemäß Vertragsprofil.',
			extraordinaryTerminationText: 'Außerordentliche Beendigung bleibt möglich.',
		},
		legal: {
			clauseSetVersion: 'synthetic-clause-v1',
			attachments: ['Datenschutzhinweis'],
			privacyNoticeVersion: 'privacy-v1',
			distanceLegalProfile: 'offline_only' as const,
			distanceLegalBasisHash: null,
			withdrawalTextVersion: 'synthetic-withdrawal-v1',
			earlyPerformanceRequestVersion: null,
			wertersatzNoticeVersion: null,
			mediaClauseVersion: 'synthetic-media-v1',
		},
	};
}

describe('stage 09 immutable contract workflow in D1', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;
	let store: MemoryStore;
	let service: ContractService;
	let repository: ContractRepository;
	let config: RuntimeConfig;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		await seed(db);
		store = new MemoryStore();
		config = loadRuntimeConfig({
			APP_ENV: 'test',
			PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
			DB: context.db,
			R2_ARCHIVE: { get() {}, put() {}, delete() {} } as unknown as R2Bucket,
			R2_QUARANTINE: { get() {}, put() {}, delete() {} } as unknown as R2Bucket,
			CONTRACT_SEND_ENABLED: 'true',
			CONTRACT_RENDERER: 'synthetic_test',
		});
		repository = new ContractRepository(db);
		service = new ContractService(repository, store, config, undefined, () => now);
		await service.installSyntheticTestFixtures(admin);
	});

	afterEach(async () => context.dispose());

	it('installs and renders only marked Browser-backed preview-review templates in preview', async () => {
		const browser = {
			quickAction: async () =>
				new Response('%PDF-1.7\npreview\n%%EOF\n', {
					headers: { 'X-Browser-Ms-Used': '25' },
				}),
		} as unknown as BrowserRun;
		const previewConfig = loadRuntimeConfig({
			APP_ENV: 'preview',
			PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.org',
			DB: context.db,
			R2_ARCHIVE: { get() {}, put() {}, delete() {} } as unknown as R2Bucket,
			R2_QUARANTINE: { get() {}, put() {}, delete() {} } as unknown as R2Bucket,
			ASSETS: { fetch() {} } as unknown as Fetcher,
			BROWSER: browser,
			JWT_SECRET: 'x'.repeat(32),
			TURNSTILE_SITE_KEY: 'preview-site-key',
			TURNSTILE_SECRET_KEY: 'preview-secret-key',
			TURNSTILE_HOSTNAMES: 'portal-preview.example.org',
			OFFICIAL_PRIVACY_URL: 'https://kolibri-dresden.de/datenschutz/',
			OFFICIAL_IMPRINT_URL: 'https://kolibri-dresden.de/impressum/',
			OFFICIAL_CONTACT_URL: 'https://kolibri-dresden.de/kontakt/',
			OFFICIAL_LINKS_VERSION: 'preview-review-links-v1',
			SCHEDULED_JOBS_ENABLED: 'true',
			EMAIL_PROVIDER: 'resend',
			EMAIL_FROM: 'Kinder- und Elternzentrum Kolibri e.V. <registration@kolibri-dresden.de>',
			EMAIL_REPLY_TO: 'registration@kolibri-dresden.de',
			RESEND_API_KEY: 're_' + 'x'.repeat(32),
			PREVIEW_EMAIL_RECIPIENT_HASHES: 'a'.repeat(64),
			CONTRACT_SEND_ENABLED: 'true',
			CONTRACT_PREVIEW_REVIEW_ENABLED: 'true',
			CONTRACT_RENDERER: 'browser_run',
		});
		const previewService = new ContractService(
			repository,
			store,
			previewConfig,
			undefined,
			() => now
		);
		const concurrentInstall = await Promise.all([
			previewService.installPreviewReviewTemplates(admin),
			previewService.installPreviewReviewTemplates(admin),
		]);
		expect(concurrentInstall[0]).toEqual(concurrentInstall[1]);
		await expect(previewService.installPreviewReviewTemplates(admin)).resolves.toHaveLength(4);
		const template = await db.first<{ distance_legal_basis_hash: string }>({
			sql: `SELECT distance_legal_basis_hash FROM contract_template_versions
				WHERE id = 'contract-template:preview-review:group_yearly:v1'`,
		});
		expect(template?.distance_legal_basis_hash).toMatch(/^[a-f0-9]{64}$/u);
		const previewInput = groupRenderInput();
		const previewRenderInput = {
			...previewInput,
			previewReviewMarker: 'synthetic-no-pii' as const,
			legal: {
				...previewInput.legal,
				clauseSetVersion: 'preview-review-clauses-v1',
				distanceLegalProfile: 'widerruf_applicable' as const,
				distanceLegalBasisHash: template!.distance_legal_basis_hash,
			},
		};
		const previewDraftPayload = {
			userId: parent.id,
			childId: 'child-contract',
			academicPeriodId: 'period-contract',
			templateVersionId: 'contract-template:preview-review:group_yearly:v1',
			renderInput: previewRenderInput,
			expiresAt: '2026-08-05T10:00:00.000Z',
			idempotencyKey: 'create-preview-review-contract',
		};
		const cloneTemplate = async (overrides: Record<string, unknown>) => {
			const columns = (
				await db.all<{ name: string }>({
					sql: 'PRAGMA table_info(contract_template_versions)',
				})
			).results.map((column) => column.name);
			const params: unknown[] = [];
			const selections = columns.map((column) => {
				if (!Object.hasOwn(overrides, column)) return `"${column}"`;
				params.push(overrides[column]);
				return '?';
			});
			params.push('contract-template:preview-review:group_yearly:v1');
			await db.run({
				sql: `INSERT INTO contract_template_versions (${columns.map((column) => `"${column}"`).join(', ')})
					SELECT ${selections.join(', ')} FROM contract_template_versions WHERE id = ?`,
				params,
			});
		};
		const installedBundleKey =
			'contract-templates/preview-review/group_yearly/preview-review-v1.json';
		const unknownBundleKey =
			'contract-templates/preview-review/group_yearly/preview-review-v99.json';
		store.values.set(unknownBundleKey, Uint8Array.from(store.values.get(installedBundleKey)!));
		await cloneTemplate({
			id: 'contract-template:preview-review:group_yearly:unknown',
			template_version: 'preview-review-v99',
			template_bundle_r2_key: unknownBundleKey,
		});
		await cloneTemplate({
			id: 'contract-template:preview-review:group_yearly:missing',
			template_version: 'preview-review-missing-v1',
			template_bundle_r2_key:
				'contract-templates/preview-review/group_yearly/preview-review-missing-v1.json',
		});
		await cloneTemplate({
			id: 'contract-template:preview-review:group_yearly:retired',
			template_version: 'preview-review-retired-v1',
			template_bundle_r2_key:
				'contract-templates/preview-review/group_yearly/preview-review-retired-v1.json',
			approval_status: 'retired',
		});
		const mutableState = async () =>
			db.first<{
				sequences: number;
				offers: number;
				enrollments: number;
				engagements: number;
				actions: number;
				audits: number;
				idempotency: number;
				artifacts: number;
				deliveries: number;
				storageIntents: number;
				storageAssertions: number;
			}>({
				sql: `SELECT
					(SELECT COUNT(*) FROM contract_number_sequences) AS sequences,
					(SELECT COUNT(*) FROM contract_offers) AS offers,
					(SELECT COUNT(*) FROM enrollments) AS enrollments,
					(SELECT COUNT(*) FROM service_engagements) AS engagements,
					(SELECT COUNT(*) FROM contract_admin_actions) AS actions,
					(SELECT COUNT(*) FROM audit_events) AS audits,
					(SELECT COUNT(*) FROM idempotency_records) AS idempotency,
					(SELECT COUNT(*) FROM contract_artifacts) AS artifacts,
					(SELECT COUNT(*) FROM contract_deliveries) AS deliveries,
					(SELECT COUNT(*) FROM storage_object_intents) AS storageIntents,
					(SELECT COUNT(*) FROM storage_intent_link_assertions) AS storageAssertions`,
			});
		const stateBeforeDeniedDrafts = await mutableState();
		const objectsBeforeDeniedDrafts = Array.from(store.values, ([key, value]) => [
			key,
			Array.from(value),
		]);
		const disabledPreviewService = new ContractService(
			repository,
			store,
			{
				...previewConfig,
				contracts: { ...previewConfig.contracts, previewReviewEnabled: false },
			},
			undefined,
			() => now
		);
		const productionService = new ContractService(
			repository,
			store,
			{
				...previewConfig,
				appEnvironment: 'production',
				contracts: { ...previewConfig.contracts, previewReviewEnabled: false },
			},
			undefined,
			() => now
		);
		for (const [label, deniedService] of [
			['test', service],
			['disabled-preview', disabledPreviewService],
			['production', productionService],
		] as const) {
			await expect(
				deniedService.createDraft({
					admin,
					requestId: `denied-preview-draft-${label}`,
					payload: {
						...previewDraftPayload,
						idempotencyKey: `denied-preview-draft-${label}`,
					},
				})
			).rejects.toMatchObject({ code: 'PREVIEW_REVIEW_TEMPLATE_FORBIDDEN' });
		}
		await expect(
			previewService.createDraft({
				admin,
				requestId: 'denied-preview-draft-missing-marker',
				payload: {
					...previewDraftPayload,
					renderInput: previewInput,
					idempotencyKey: 'denied-preview-draft-missing-marker',
				},
			})
		).rejects.toMatchObject({ code: 'CONTRACT_PREVIEW_REVIEW_MARKER_REQUIRED' });
		for (const [templateVersionId, code] of [
			[
				'contract-template:preview-review:group_yearly:unknown',
				'CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED',
			],
			[
				'contract-template:preview-review:group_yearly:missing',
				'CONTRACT_TEMPLATE_SOURCE_MISSING',
			],
			[
				'contract-template:preview-review:group_yearly:retired',
				'CONTRACT_TEMPLATE_NOT_APPROVED',
			],
		] as const) {
			await expect(
				previewService.createDraft({
					admin,
					requestId: `denied-${templateVersionId}`,
					payload: {
						...previewDraftPayload,
						templateVersionId,
						idempotencyKey: `denied-${templateVersionId}`,
					},
				})
			).rejects.toMatchObject({ code });
		}
		expect(await mutableState()).toEqual(stateBeforeDeniedDrafts);
		expect(Array.from(store.values, ([key, value]) => [key, Array.from(value)])).toEqual(
			objectsBeforeDeniedDrafts
		);
		const created = await previewService.createDraft({
			admin,
			requestId: 'create-preview-review-contract',
			payload: previewDraftPayload,
		});
		const rendered = await previewService.renderAndSend({
			admin,
			offerId: created.offerId,
			idempotencyKey: 'render-preview-review-contract',
			requestId: 'render-preview-review-contract',
		});
		expect(rendered).toMatchObject({ offerId: created.offerId, replayed: false });
		const offer = await db.first<{
			contract_html_r2_key: string;
			source_manifest_json: string;
			source_manifest_hash: string;
			render_input_hash: string;
			template_version_id: string;
		}>({
			sql: `SELECT contract_html_r2_key, source_manifest_json, source_manifest_hash,
				render_input_hash, template_version_id FROM contract_offers WHERE id = ?`,
			params: [created.offerId],
		});
		const htmlBytes = store.values.get(offer!.contract_html_r2_key)!;
		const html = new TextDecoder().decode(htmlBytes);
		expect(html).toContain('TEST/ENTWURF');
		expect(html).toContain('nicht für reale Vertragsbeziehungen');
		const sourceManifest = JSON.parse(offer!.source_manifest_json) as {
			templateVersion: string;
			bundleHash: string;
			renderedHtmlHash: string;
			inputHash: string;
		};
		const exactTemplate = await db.first<{ bundle_hash: string }>({
			sql: 'SELECT bundle_hash FROM contract_template_versions WHERE id = ?',
			params: [offer!.template_version_id],
		});
		const htmlArtifact = await db.first<{ sha256: string }>({
			sql: `SELECT sha256 FROM contract_artifacts
					WHERE contract_offer_id = ? AND artifact_kind = 'offer_html'`,
			params: [created.offerId],
		});
		expect(sourceManifest).toMatchObject({
			templateVersion: 'preview-review-v1',
			bundleHash: exactTemplate!.bundle_hash,
			inputHash: offer!.render_input_hash,
			renderedHtmlHash: htmlArtifact!.sha256,
		});
		expect(sourceManifest.renderedHtmlHash).toBe(
			await sha256Bytes(new TextEncoder().encode(html))
		);
		expect(offer!.source_manifest_hash).toMatch(/^[a-f0-9]{64}$/u);

		await previewService.parentDecision({
			actor: parent,
			payload: {
				offerId: created.offerId,
				expectedContractHash: rendered.contractHash,
				decision: 'accept',
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText: 'Ich nehme das unveränderte synthetische Preview-Angebot an.',
				idempotencyKey: 'accept-preview-review-contract',
			},
			userAgent: 'vitest',
			requestSubject: 'preview-review-subject',
			requestId: 'accept-preview-review-contract',
		});
		await expect(
			previewService.formAndActivate({
				admin,
				requestId: 'form-preview-review-contract',
				payload: {
					offerId: created.offerId,
					reason: 'Exact immutable preview bundle revalidated.',
					confirmation: 'confirmed',
					idempotencyKey: 'form-preview-review-contract',
				},
			})
		).resolves.toMatchObject({ replayed: false });

		const bundleKey = 'contract-templates/preview-review/group_yearly/preview-review-v1.json';
		const conflictingBundle = new TextEncoder().encode('conflicting-template-bundle');
		store.values.set(bundleKey, conflictingBundle);
		await expect(previewService.installPreviewReviewTemplates(admin)).rejects.toMatchObject({
			code: 'CONTRACT_TEMPLATE_BUNDLE_CONFLICT',
		});
		expect(store.values.get(bundleKey)).toEqual(conflictingBundle);
	});

	async function draft(key: string) {
		return service.createDraft({
			admin,
			requestId: `create-${key}`,
			payload: {
				userId: parent.id,
				childId: 'child-contract',
				academicPeriodId: 'period-contract',
				templateVersionId: 'contract-template:synthetic:group_yearly:v1',
				renderInput: groupRenderInput(),
				expiresAt: '2026-08-05T10:00:00.000Z',
				idempotencyKey: `create-contract-${key}`,
			},
		});
	}

	async function withdrawalDraft(key: string) {
		const templateVersionId = 'contract-template:synthetic:group_yearly:withdrawal-v1';
		const legalBasisHash = hash('a');
		const baseTemplate = await repository.loadTemplate(
			'contract-template:synthetic:group_yearly:v1'
		);
		if (!baseTemplate) throw new Error('Synthetic base template fixture is missing.');
		const bundle = buildContractTemplateBundle({
			templateId: 'group_yearly',
			templateVersion: 'synthetic-withdrawal-v1',
			usageScope: 'synthetic_test',
			snapshotHashes: {
				providerSnapshotHash: await hashCanonical(
					JSON.parse(baseTemplate.provider_snapshot_json)
				),
				paymentTermsHash: baseTemplate.provider_payment_terms_hash,
				legalSnapshotHash: await hashCanonical({
					clauseSetVersion: baseTemplate.clause_set_version,
					distanceLegalProfile: 'widerruf_applicable',
					distanceLegalBasisHash: legalBasisHash,
				}),
				mediaSnapshotHash: baseTemplate.media_contact_snapshot_hash!,
			},
		});
		const bundleBytes = serializeContractTemplateBundle(bundle);
		const bundleHashes = await contractTemplateBundleHashes(bundle);
		const bundleKey = 'contract-templates/synthetic/group_yearly/synthetic-withdrawal-v1.json';
		await store.putIfAbsent!(bundleKey, bundleBytes);
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
				?, ?, ?, ?, ?, ?, ?, renderer_id,
				renderer_contract_version, worker_compatibility_date, usage_scope,
				approval_status, approval_basis, 'widerruf_applicable',
				'synthetic-withdrawal-basis-v1', ?, 0, 1, approved_by, approved_at,
				valid_from, valid_to, created_at
			FROM contract_template_versions WHERE id = ?`,
			params: [
				templateVersionId,
				bundleKey,
				bundleHashes.bundleHash,
				bundleHashes.htmlSourceHash,
				bundleHashes.cssSourceHash,
				contractTemplateResourceManifest(bundle.assets),
				contractTemplateResourceManifest(bundle.fonts),
				canonicalJson(bundle.requiredFields),
				legalBasisHash,
				'contract-template:synthetic:group_yearly:v1',
			],
		});
		const renderInput = groupRenderInput();
		return service.createDraft({
			admin,
			requestId: `create-${key}`,
			payload: {
				userId: parent.id,
				childId: 'child-contract',
				academicPeriodId: 'period-contract',
				templateVersionId,
				renderInput: {
					...renderInput,
					legal: {
						...renderInput.legal,
						distanceLegalProfile: 'widerruf_applicable' as const,
						distanceLegalBasisHash: legalBasisHash,
						earlyPerformanceRequestVersion: 'synthetic-early-performance-v1',
						wertersatzNoticeVersion: 'synthetic-wertersatz-v1',
					},
				},
				expiresAt: '2026-08-05T10:00:00.000Z',
				idempotencyKey: `create-contract-${key}`,
			},
		});
	}

	async function formIndividualContract(key: string) {
		const created = await service.createDraft({
			admin,
			requestId: `create-${key}`,
			payload: {
				userId: parent.id,
				childId: 'child-contract',
				academicPeriodId: 'period-contract',
				templateVersionId: 'contract-template:synthetic:individual_hourly:v1',
				renderInput: individualRenderInput(),
				expiresAt: '2026-08-05T10:00:00.000Z',
				idempotencyKey: `create-${key}`,
			},
		});
		const rendered = await service.renderAndSend({
			admin,
			offerId: created.offerId,
			idempotencyKey: `render-${key}`,
			requestId: `render-${key}`,
		});
		await service.parentDecision({
			actor: parent,
			payload: {
				offerId: created.offerId,
				expectedContractHash: rendered.contractHash,
				decision: 'accept',
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText: `Ich nehme das unveraenderte individuelle Testangebot ${key} an.`,
				idempotencyKey: `accept-${key}`,
			},
			userAgent: 'vitest',
			requestSubject: '127.0.0.20',
			requestId: `accept-${key}`,
		});
		const formed = await service.formAndActivate({
			admin,
			requestId: `form-${key}`,
			payload: {
				offerId: created.offerId,
				reason: 'Synthetic atomicity test revalidated.',
				confirmation: 'confirmed',
				idempotencyKey: `form-${key}`,
			},
		});
		return { offerId: created.offerId, contractId: formed.contractId };
	}

	it('expires pseudonymous acceptance IP metadata after the temporary 30-day bound', async () => {
		const acceptanceNow = '2026-05-01T10:00:00.000Z';
		service = new ContractService(repository, store, config, undefined, () => acceptanceNow);
		const created = await draft('ip-retention');
		const rendered = await service.renderAndSend({
			admin,
			offerId: created.offerId,
			idempotencyKey: 'render-contract-ip-retention',
			requestId: 'render-ip-retention',
		});
		await service.parentDecision({
			actor: parent,
			payload: {
				offerId: created.offerId,
				expectedContractHash: rendered.contractHash,
				decision: 'accept',
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText: 'Synthetische Annahme für den Metadaten-Löschtest.',
				idempotencyKey: 'accept-contract-ip-retention',
			},
			userAgent: 'stage-13-retention-test',
			requestSubject: '192.0.2.44',
			requestId: 'accept-ip-retention',
		});

		const retainedMetadata = await db.first<{
			action_ip: string | null;
			acceptance_ip: string | null;
			ip_expires_at: string;
		}>({
			sql: `SELECT action.ip_retention_value AS action_ip,
					acceptance.ip_retention_value AS acceptance_ip, action.ip_expires_at
				FROM contract_parent_actions action
				JOIN contract_acceptances acceptance ON acceptance.parent_action_id = action.id
				WHERE action.contract_offer_id = ?`,
			params: [created.offerId],
		});
		expect(retainedMetadata).toMatchObject({ ip_expires_at: '2026-05-31T10:00:00.000Z' });
		expect(retainedMetadata?.action_ip).toMatch(/^[a-f0-9]{64}$/u);
		expect(retainedMetadata?.acceptance_ip).toMatch(/^[a-f0-9]{64}$/u);
		const cleaned = await new OperationsRepository(db).cleanupSecurityMetadata(now, 10);
		expect(cleaned).toMatchObject({ contractActions: 1, contractAcceptances: 1 });
		expect(
			await db.first<{ action_ip: string | null; acceptance_ip: string | null }>({
				sql: `SELECT action.ip_retention_value AS action_ip,
					acceptance.ip_retention_value AS acceptance_ip
				FROM contract_parent_actions action
				JOIN contract_acceptances acceptance ON acceptance.parent_action_id = action.id
				WHERE action.contract_offer_id = ?`,
				params: [created.offerId],
			})
		).toEqual({ action_ip: null, acceptance_ip: null });
	}, 45_000);

	it('reserves permanent family numbers, renders immutable artifacts, accepts, and forms once', async () => {
		const created = await draft('full-flow');
		const mismatchedEndCarrier = await draft('mismatched-end-carrier');
		const draftOffer = await repository.loadOffer(created.offerId);
		expect(draftOffer).toMatchObject({ contract_number: '2. 9101-1', status: 'draft' });

		const rendered = await service.renderAndSend({
			admin,
			offerId: created.offerId,
			idempotencyKey: 'render-contract-full-flow',
			requestId: 'render-full-flow',
		});
		expect(rendered.contractHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(store.values.size).toBe(6); // four retained template bundles + HTML + offer PDF

		await expect(service.loadOwnerOffer(foreignParent, created.offerId)).rejects.toMatchObject({
			code: 'CONTRACT_NOT_FOUND',
		});
		const decisionPayload = {
			offerId: created.offerId,
			expectedContractHash: rendered.contractHash,
			decision: 'accept',
			acceptanceTextVersion: 'contract-acceptance-de-v1',
			acceptanceText:
				'Ich nehme genau dieses unveränderte synthetische Vertragsangebot verbindlich an.',
			idempotencyKey: 'accept-contract-full-flow',
		};
		const accepted = await service.parentDecision({
			actor: parent,
			payload: decisionPayload,
			userAgent: 'vitest',
			requestSubject: '127.0.0.1',
			requestId: 'accept-full-flow',
		});
		expect(accepted).toMatchObject({ status: 'accepted_by_parent', replayed: false });
		expect(
			await service.parentDecision({
				actor: parent,
				payload: decisionPayload,
				userAgent: 'vitest',
				requestSubject: '127.0.0.1',
				requestId: 'accept-replay',
			})
		).toMatchObject({ replayed: true });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM email_outbox
			WHERE source_id = ? AND template_or_category = 'contract.accepted'`,
				params: [created.offerId],
			})
		).toEqual({ count: 1 });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM telegram_outbox
			WHERE source_id = ? AND template_or_category = 'bureau.contract_signal'`,
				params: [created.offerId],
			})
		).toEqual({ count: 1 });
		const formed = await service.formAndActivate({
			admin,
			requestId: 'formation-full-flow',
			payload: {
				offerId: created.offerId,
				reason: 'Preis, Kapazität und Vertragsstand erneut geprüft',
				confirmation: 'confirmed',
				idempotencyKey: 'form-contract-full-flow',
			},
		});
		expect(formed).toMatchObject({ certificateReady: true, replayed: false });
		expect(
			await service.formAndActivate({
				admin,
				requestId: 'formation-replay',
				payload: {
					offerId: created.offerId,
					reason: 'Preis, Kapazität und Vertragsstand erneut geprüft',
					confirmation: 'confirmed',
					idempotencyKey: 'form-contract-full-flow',
				},
			})
		).toMatchObject({ contractId: formed.contractId, replayed: true, certificateReady: true });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM email_outbox
			WHERE source_id = ? AND template_or_category = 'contract.formed'`,
				params: [formed.contractId],
			})
		).toEqual({ count: 1 });

		const enrollment = await db.first<{ status: string; active_from: string }>({
			sql: `SELECT status, active_from FROM enrollments WHERE id = ?`,
			params: [draftOffer!.enrollment_id],
		});
		expect(enrollment).toEqual({ status: 'active', active_from: '2026-08-01' });
		const artifacts = await db.all<{ artifact_kind: string }>({
			sql: `SELECT artifact_kind FROM contract_artifacts ORDER BY artifact_kind`,
		});
		expect(artifacts.results.map((row) => row.artifact_kind)).toEqual([
			'formation_certificate_pdf',
			'offer_html',
			'offer_pdf',
		]);
		const detail = await service.loadOwnerOffer(parent, created.offerId);
		const pdf = detail.artifacts.find((artifact) => artifact.kind === 'offer_pdf')!;
		await expect(
			service.downloadArtifact({
				actor: foreignParent,
				artifactId: pdf.id,
				requestId: 'foreign-download',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_ARTIFACT_NOT_FOUND' });
		await expect(
			service.downloadArtifact({
				actor: parent,
				artifactId: pdf.id,
				requestId: 'owner-download',
			})
		).resolves.toMatchObject({ contentType: 'application/pdf' });
		await expect(
			service.downloadAdminArtifact({
				admin,
				artifactId: pdf.id,
				purpose: 'free-text-purpose',
				requestId: 'admin-download-invalid-purpose',
			})
		).rejects.toMatchObject({ code: 'INVALID_DOWNLOAD_PURPOSE' });
		await expect(
			service.downloadAdminArtifact({
				admin,
				artifactId: pdf.id,
				purpose: 'contract_administration',
				requestId: 'admin-download',
			})
		).resolves.toMatchObject({ contentType: 'application/pdf' });
		const adminReadAudit = await db.first<{ safe_diff_json: string }>({
			sql: `SELECT safe_diff_json FROM audit_events WHERE request_id = 'admin-download'`,
		});
		expect(JSON.parse(adminReadAudit!.safe_diff_json)).toMatchObject({
			forcedAttachment: true,
			purposeCode: 'contract_administration',
		});

		store.beforeGet = async () => {
			store.beforeGet = undefined;
			await db.run({
				sql: `UPDATE users SET is_blocked = 1 WHERE id = ?`,
				params: [parent.id],
			});
		};
		await expect(
			service.downloadAdminArtifact({
				admin,
				artifactId: pdf.id,
				purpose: 'legal_evidence_review',
				requestId: 'admin-download-owner-race',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_ARTIFACT_NOT_FOUND' });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM audit_events
			WHERE request_id = 'admin-download-owner-race'`,
			})
		).toEqual({ count: 0 });
		await db.run({ sql: `UPDATE users SET is_blocked = 0 WHERE id = ?`, params: [parent.id] });

		store.beforeGet = async () => {
			store.beforeGet = undefined;
			await db.run({
				sql: `UPDATE users SET is_blocked = 1 WHERE id = ?`,
				params: [parent.id],
			});
		};
		await expect(
			service.downloadArtifact({
				actor: parent,
				artifactId: pdf.id,
				requestId: 'owner-download-race',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_ARTIFACT_NOT_FOUND' });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM audit_events
			WHERE request_id = 'owner-download-race'`,
			})
		).toEqual({ count: 0 });
		await db.run({ sql: `UPDATE users SET is_blocked = 0 WHERE id = ?`, params: [parent.id] });
		await expect(
			db.run({
				sql: `UPDATE contract_artifacts SET sha256 = ? WHERE id = ?`,
				params: [hash('f'), pdf.id],
			})
		).rejects.toThrow();

		const endPayload = {
			offerId: created.offerId,
			contractId: formed.contractId,
			kind: 'ordinary_termination' as const,
			requestedEffectiveOn: null,
			requestTextVersion: 'termination-de-v1',
			idempotencyKey: 'end-contract-full-flow',
		};
		await expect(
			service.submitEndRequest({
				actor: parent,
				payload: {
					...endPayload,
					offerId: mismatchedEndCarrier.offerId,
					idempotencyKey: 'mismatched-end-carrier-key',
				},
				requestId: 'mismatched-end-carrier',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM contract_end_requests`,
			})
		).toEqual({ count: 0 });
		const endRequest = await service.submitEndRequest({
			actor: parent,
			payload: endPayload,
			requestId: 'end-full-flow',
		});
		expect(endRequest).toMatchObject({ status: 'received', replayed: false });
		expect(
			await service.submitEndRequest({
				actor: parent,
				payload: endPayload,
				requestId: 'end-full-flow-replay',
			})
		).toMatchObject({ requestId: endRequest.requestId, replayed: true });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM email_outbox
			WHERE source_id = ? AND template_or_category = 'contract.termination.received'`,
				params: [endRequest.requestId],
			})
		).toEqual({ count: 1 });
		await expect(
			service.submitEndRequest({
				actor: foreignParent,
				payload: endPayload,
				requestId: 'end-cross-owner',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
		expect(
			await db.first<{ auto_renewal_blocked_at: string | null }>({
				sql: `SELECT auto_renewal_blocked_at FROM contracts WHERE id = ?`,
				params: [formed.contractId],
			})
		).toEqual({ auto_renewal_blocked_at: now });
		const reviewPayload = {
			endRequestId: endRequest.requestId,
			decision: 'effective_date_confirmed' as const,
			effectiveOn: '2027-07-31',
			reason: 'Contractual end date verified.',
			externalDebtCheckResult: 'not_checked' as const,
			idempotencyKey: 'review-end-contract-full-flow',
		};
		const reviewed = await service.reviewEndRequest({
			admin,
			payload: reviewPayload,
			requestId: 'review-end-full-flow',
		});
		expect(reviewed).toMatchObject({ status: 'effective_date_confirmed', replayed: false });
		expect(
			await service.reviewEndRequest({
				admin,
				payload: reviewPayload,
				requestId: 'review-end-replay',
			})
		).toMatchObject({ endRequestId: endRequest.requestId, replayed: true });
		await expect(
			service.reviewEndRequest({
				admin,
				payload: {
					...reviewPayload,
					decision: 'approved',
					idempotencyKey: 'invalid-review-end-contract',
				},
				requestId: 'invalid-review-end',
			})
		).rejects.toMatchObject({
			code: 'TERMINATION_REVIEW_STATE_REJECTED',
		});
	});

	it('replays the exact statutory withdrawal after it has terminated the contract', async () => {
		const created = await withdrawalDraft('withdrawal-replay');
		const mismatchedCarrier = await draft('withdrawal-replay-carrier');
		const rendered = await service.renderAndSend({
			admin,
			offerId: created.offerId,
			idempotencyKey: 'render-withdrawal-replay',
			requestId: 'render-withdrawal-replay',
		});
		await service.parentDecision({
			actor: parent,
			payload: {
				offerId: created.offerId,
				expectedContractHash: rendered.contractHash,
				decision: 'accept',
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText:
					'Ich nehme dieses unveränderte Widerruf-Testangebot verbindlich an.',
				idempotencyKey: 'accept-withdrawal-replay',
			},
			userAgent: 'vitest',
			requestSubject: '127.0.0.11',
			requestId: 'accept-withdrawal-replay',
		});
		const formed = await service.formAndActivate({
			admin,
			requestId: 'form-withdrawal-replay',
			payload: {
				offerId: created.offerId,
				reason: 'Synthetic withdrawal replay contract revalidated.',
				confirmation: 'confirmed',
				idempotencyKey: 'form-withdrawal-replay',
			},
		});
		const payload = {
			offerId: created.offerId,
			contractId: formed.contractId,
			kind: 'withdrawal' as const,
			requestedEffectiveOn: null,
			requestTextVersion: 'withdrawal-de-v1',
			idempotencyKey: 'withdrawal-after-termination-replay',
		};
		const withdrawn = await service.submitEndRequest({
			actor: parent,
			payload,
			requestId: 'withdrawal-first',
		});
		expect(withdrawn).toMatchObject({ status: 'completed', replayed: false });
		expect(
			await db.first<{ operational_status: string }>({
				sql: `SELECT operational_status FROM contracts WHERE id = ?`,
				params: [formed.contractId],
			})
		).toEqual({ operational_status: 'terminated' });

		await expect(
			service.submitEndRequest({
				actor: foreignParent,
				payload,
				requestId: 'withdrawal-replay-foreign-owner',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
		await expect(
			service.submitEndRequest({
				actor: parent,
				payload: { ...payload, offerId: mismatchedCarrier.offerId },
				requestId: 'withdrawal-replay-mismatched-carrier',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
		expect(
			await service.submitEndRequest({
				actor: parent,
				payload,
				requestId: 'withdrawal-exact-replay',
			})
		).toEqual({ ...withdrawn, replayed: true });
		await db.run({
			sql: `UPDATE users SET is_blocked = 1, updated_at = ? WHERE id = ?`,
			params: [now, parent.id],
		});
		await expect(
			service.submitEndRequest({
				actor: parent,
				payload,
				requestId: 'withdrawal-replay-blocked-owner',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
		await db.run({
			sql: `UPDATE users SET is_blocked = 0, updated_at = ? WHERE id = ?`,
			params: [now, parent.id],
		});
		expect(
			await db.first<Record<string, number>>({
				sql: `SELECT
				(SELECT COUNT(*) FROM contract_end_requests WHERE contract_id = ?) AS requests,
				(SELECT COUNT(*) FROM contract_events WHERE contract_id = ?
					AND event_type IN ('withdrawal_received', 'withdrawn')) AS withdrawal_events,
				(SELECT COUNT(*) FROM contract_outbox_events WHERE source_id = ?) AS outbox_events,
				(SELECT COUNT(*) FROM audit_events WHERE target_kind = 'contract_end_request'
					AND target_id = ?) AS audits,
				(SELECT COUNT(*) FROM contract_action_assertions
					WHERE scope = 'end_request' AND target_id = ? AND action_id = ?
						AND actor_user_id = ? AND assertion_passed = 1) AS assertions`,
				params: [
					formed.contractId,
					formed.contractId,
					withdrawn.requestId,
					withdrawn.requestId,
					formed.contractId,
					withdrawn.requestId,
					parent.id,
				],
			})
		).toEqual({
			requests: 1,
			withdrawal_events: 2,
			outbox_events: 1,
			audits: 1,
			assertions: 1,
		});
	});

	it('requires a current parent role and keeps parent acceptance distinct from Verein formation', async () => {
		const roleGuarded = await draft('parent-role-guard');
		const roleGuardedRender = await service.renderAndSend({
			admin,
			offerId: roleGuarded.offerId,
			idempotencyKey: 'render-parent-role-guard',
			requestId: 'render-parent-role-guard',
		});
		await db.run({
			sql: `UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?`,
			params: [now, parent.id],
		});
		const promotedParent = requireAdmin({ ...parent, role: 'admin' });
		const roleGuardedPayload = {
			offerId: roleGuarded.offerId,
			expectedContractHash: roleGuardedRender.contractHash,
			decision: 'accept' as const,
			acceptanceTextVersion: 'contract-acceptance-de-v1' as const,
			acceptanceText: 'Ich nehme dieses Angebot nach einer unzulaessigen Rollenaenderung an.',
			idempotencyKey: 'accept-parent-role-guard',
		};
		await expect(
			service.parentDecision({
				actor: promotedParent,
				payload: roleGuardedPayload,
				userAgent: 'vitest',
				requestSubject: '127.0.0.10',
				requestId: 'accept-parent-role-guard-current-admin',
			})
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		await expect(
			service.parentDecision({
				actor: parent,
				payload: {
					...roleGuardedPayload,
					idempotencyKey: 'accept-parent-role-guard-stale-session',
				},
				userAgent: 'vitest',
				requestSubject: '127.0.0.11',
				requestId: 'accept-parent-role-guard-stale-session',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_PARENT_DECISION_REJECTED' });
		expect(await repository.loadOffer(roleGuarded.offerId)).toMatchObject({ status: 'sent' });

		await db.run({
			sql: `UPDATE users SET role = 'parent', email_verified_at = NULL, updated_at = ?
			WHERE id = ?`,
			params: [now, parent.id],
		});
		expect(await repository.loadOwnerOfferDetail(parent.id, roleGuarded.offerId)).toBeNull();
		await expect(
			service.parentDecision({
				actor: parent,
				payload: {
					...roleGuardedPayload,
					idempotencyKey: 'accept-parent-role-guard-unverified',
				},
				userAgent: 'vitest',
				requestSubject: '127.0.0.13',
				requestId: 'accept-parent-role-guard-unverified',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_PARENT_DECISION_REJECTED' });
		await db.run({
			sql: `UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?`,
			params: [now, now, parent.id],
		});
		const dualControl = await draft('dual-control-identity');
		const dualControlRender = await service.renderAndSend({
			admin,
			offerId: dualControl.offerId,
			idempotencyKey: 'render-dual-control-identity',
			requestId: 'render-dual-control-identity',
		});
		await service.parentDecision({
			actor: parent,
			payload: {
				offerId: dualControl.offerId,
				expectedContractHash: dualControlRender.contractHash,
				decision: 'accept',
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText:
					'Ich nehme dieses unveraenderte Angebot als Elternpartei verbindlich an.',
				idempotencyKey: 'accept-dual-control-identity',
			},
			userAgent: 'vitest',
			requestSubject: '127.0.0.12',
			requestId: 'accept-dual-control-identity',
		});
		await db.run({
			sql: `UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?`,
			params: [now, parent.id],
		});
		await expect(
			service.formAndActivate({
				admin,
				requestId: 'form-dual-control-owner-no-longer-parent',
				payload: {
					offerId: dualControl.offerId,
					reason: 'Owner role changed before formation.',
					confirmation: 'confirmed',
					idempotencyKey: 'form-dual-control-owner-no-longer-parent',
				},
			})
		).rejects.toMatchObject({ code: 'CONTRACT_FORMATION_REJECTED' });
		await expect(
			service.formAndActivate({
				admin: promotedParent,
				requestId: 'form-dual-control-same-identity',
				payload: {
					offerId: dualControl.offerId,
					reason: 'Attempted formation after role promotion.',
					confirmation: 'confirmed',
					idempotencyKey: 'form-dual-control-same-identity',
				},
			})
		).rejects.toMatchObject({ code: 'CONTRACT_FORMATION_REJECTED' });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM contracts WHERE contract_offer_id = ?`,
				params: [dualControl.offerId],
			})
		).toEqual({ count: 0 });
		expect(await repository.loadOffer(dualControl.offerId)).toMatchObject({
			status: 'accepted_by_parent',
		});
	}, 45_000);

	it('does not reuse numbers and rejects a queued parent action after account closure starts', async () => {
		const first = await draft('number-one');
		const second = await draft('number-two');
		expect((await repository.loadOffer(first.offerId))?.contract_number).toBe('2. 9101-1');
		expect((await repository.loadOffer(second.offerId))?.contract_number).toBe('2. 9101-2');
		expect(await draft('number-two')).toEqual({ offerId: second.offerId, replayed: true });
		const sent = await service.renderAndSend({
			admin,
			offerId: second.offerId,
			idempotencyKey: 'render-number-two',
			requestId: 'render-number-two',
		});
		const priceRace = await service.createDraft({
			admin,
			requestId: 'create-price-race',
			payload: {
				userId: parent.id,
				childId: 'child-contract',
				academicPeriodId: 'period-contract',
				templateVersionId: 'contract-template:synthetic:group_yearly:v1',
				renderInput: groupRenderInput(),
				priceQuoteId: 'group-contract-quote',
				expiresAt: '2026-08-05T10:00:00.000Z',
				idempotencyKey: 'create-price-race',
			},
		});
		const priceRaceRendered = await service.renderAndSend({
			admin,
			offerId: priceRace.offerId,
			idempotencyKey: 'render-price-race',
			requestId: 'render-price-race',
		});
		await service.parentDecision({
			actor: parent,
			payload: {
				offerId: priceRace.offerId,
				expectedContractHash: priceRaceRendered.contractHash,
				decision: 'accept',
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText:
					'Ich nehme dieses unveränderte Angebot für den Preis-Race-Test verbindlich an.',
				idempotencyKey: 'accept-price-race',
			},
			userAgent: 'vitest',
			requestSubject: '127.0.0.4',
			requestId: 'accept-price-race',
		});
		await db.run({
			sql: `UPDATE price_quotes SET status = 'stale' WHERE id = 'group-contract-quote'`,
		});
		await expect(
			service.formAndActivate({
				admin,
				requestId: 'form-price-race',
				payload: {
					offerId: priceRace.offerId,
					reason: 'Attempt after quote changed.',
					confirmation: 'confirmed',
					idempotencyKey: 'form-price-race',
				},
			})
		).rejects.toMatchObject({
			code: 'GROUP_PRICE_REVALIDATION_FAILED',
		});
		await db.run({
			sql: `UPDATE users SET account_status = 'deletion_requested', updated_at = ?
			WHERE id = ?`,
			params: [now, parent.id],
		});
		await expect(
			service.parentDecision({
				actor: parent,
				payload: {
					offerId: second.offerId,
					expectedContractHash: sent.contractHash,
					decision: 'accept',
					acceptanceTextVersion: 'contract-acceptance-de-v1',
					acceptanceText: 'Ich nehme dieses unveränderte Vertragsangebot verbindlich an.',
					idempotencyKey: 'closed-account-accept',
				},
				userAgent: 'vitest',
				requestSubject: '127.0.0.2',
				requestId: 'closed-account',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_PARENT_DECISION_REJECTED' });
	});

	it('serializes account closure against parent acceptance and preserves any winning evidence', async () => {
		const created = await draft('privacy-parent-race');
		const rendered = await service.renderAndSend({
			admin,
			offerId: created.offerId,
			idempotencyKey: 'render-privacy-parent-race',
			requestId: 'render-privacy-parent-race',
		});
		const privacy = new PrivacyService(
			new PrivacyRepository(db),
			store,
			{ exportTtlSeconds: 3600 },
			() => now
		);
		const deletion = await privacy.requestDeletion({
			actor: parent,
			idempotencyKey: 'request-privacy-parent-race',
			requestId: 'request-privacy-parent-race',
		});
		const [acceptance, closure] = await Promise.allSettled([
			service.parentDecision({
				actor: parent,
				payload: {
					offerId: created.offerId,
					expectedContractHash: rendered.contractHash,
					decision: 'accept',
					acceptanceTextVersion: 'contract-acceptance-de-v1',
					acceptanceText:
						'Ich nehme dieses unveränderte Angebot im Closure-Race verbindlich an.',
					idempotencyKey: 'accept-privacy-parent-race',
				},
				userAgent: 'vitest',
				requestSubject: '127.0.0.8',
				requestId: 'accept-privacy-parent-race',
			}),
			privacy.processDeletion({
				admin,
				privacyRequestId: deletion.requestId,
				reason: 'Verified closure race against parent acceptance and retained evidence.',
				idempotencyKey: 'close-privacy-parent-race',
				requestId: 'close-privacy-parent-race',
			}),
		]);
		expect(closure).toMatchObject({
			status: 'fulfilled',
			value: {
				status: 'completed_with_retained_evidence',
			},
		});
		expect(
			await db.first<{ account_status: string }>({
				sql: `SELECT account_status FROM users WHERE id = ?`,
				params: [parent.id],
			})
		).toEqual({ account_status: 'closed' });
		expect(await repository.loadOffer(created.offerId)).toMatchObject({ status: 'cancelled' });
		const acceptanceCount = await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM contract_acceptances WHERE contract_offer_id = ?`,
			params: [created.offerId],
		});
		expect(acceptanceCount!.count).toBe(acceptance.status === 'fulfilled' ? 1 : 0);
		if (acceptance.status === 'fulfilled') {
			expect(
				await db.first<{ count: number }>({
					sql: `SELECT COUNT(*) AS count FROM legal_archive_records
				WHERE target_kind = 'contract_acceptance'`,
				})
			).toEqual({ count: 1 });
		}
	});

	it('allows exactly one final state in account-closure versus admin-formation race', async () => {
		const created = await draft('privacy-formation-race');
		const rendered = await service.renderAndSend({
			admin,
			offerId: created.offerId,
			idempotencyKey: 'render-privacy-formation-race',
			requestId: 'render-privacy-formation-race',
		});
		await service.parentDecision({
			actor: parent,
			payload: {
				offerId: created.offerId,
				expectedContractHash: rendered.contractHash,
				decision: 'accept',
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText:
					'Ich nehme dieses unveränderte Angebot im Formation-Race verbindlich an.',
				idempotencyKey: 'accept-privacy-formation-race',
			},
			userAgent: 'vitest',
			requestSubject: '127.0.0.9',
			requestId: 'accept-privacy-formation-race',
		});
		const privacy = new PrivacyService(
			new PrivacyRepository(db),
			store,
			{ exportTtlSeconds: 3600 },
			() => now
		);
		const deletion = await privacy.requestDeletion({
			actor: parent,
			idempotencyKey: 'request-privacy-formation-race',
			requestId: 'request-privacy-formation-race',
		});
		const [formation, closure] = await Promise.allSettled([
			service.formAndActivate({
				admin,
				requestId: 'form-privacy-race',
				payload: {
					offerId: created.offerId,
					reason: 'Formation revalidated during closure race.',
					confirmation: 'confirmed',
					idempotencyKey: 'form-privacy-race',
				},
			}),
			privacy.processDeletion({
				admin,
				privacyRequestId: deletion.requestId,
				reason: 'Verified closure race against administrative contract formation.',
				idempotencyKey: 'close-privacy-formation-race',
				requestId: 'close-privacy-formation-race',
			}),
		]);
		const account = await db.first<{ account_status: string }>({
			sql: `SELECT account_status FROM users WHERE id = ?`,
			params: [parent.id],
		});
		const activeContracts = await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM contracts WHERE user_id = ?
				AND operational_status = 'active'`,
			params: [parent.id],
		});
		expect((account!.account_status === 'closed' ? 1 : 0) + activeContracts!.count).toBe(1);
		if (account!.account_status === 'closed') {
			expect(formation.status).toBe('rejected');
			expect(closure).toMatchObject({
				status: 'fulfilled',
				value: {
					status: 'completed_with_retained_evidence',
				},
			});
		} else {
			expect(formation.status).toBe('fulfilled');
			expect(closure).toMatchObject({
				status: 'fulfilled',
				value: {
					status: 'blocked_by_active_contract',
				},
			});
			expect(
				await db.first<{ count: number }>({
					sql: `SELECT COUNT(*) AS count FROM media_consents
				WHERE source_privacy_request_id = ?`,
					params: [deletion.requestId],
				})
			).toEqual({ count: 0 });
		}
	});

	it('keeps media choice separate, permits decline, and fails closed for online grant/public functions', async () => {
		const mediaOffer = await draft('media-decision');
		const base = {
			offerId: mediaOffer.offerId,
			childId: 'child-contract',
			captureScopes: ['photo'] as const,
			publicationChannels: ['website'] as const,
			textVersion: 'synthetic-media-text-v1',
			withdrawalContactVersionId: 'media-contact:synthetic-v1',
		};
		await expect(
			service.recordMediaDecision({
				actor: parent,
				requestId: 'media-foreign-offer',
				payload: {
					...base,
					offerId: crypto.randomUUID(),
					decision: 'declined',
					idempotencyKey: 'media-foreign-offer-contract',
				},
			})
		).rejects.toMatchObject({ code: 'MEDIA_DECISION_NOT_FOUND' });
		await expect(
			service.recordMediaDecision({
				actor: parent,
				requestId: 'media-foreign-child',
				payload: {
					...base,
					childId: 'child-foreign-contract',
					decision: 'declined',
					idempotencyKey: 'media-foreign-child-contract',
				},
			})
		).rejects.toMatchObject({ code: 'MEDIA_DECISION_NOT_FOUND' });
		await expect(
			service.recordMediaDecision({
				actor: parent,
				requestId: 'media-missing-contact',
				payload: {
					...base,
					withdrawalContactVersionId: 'media-contact:missing',
					decision: 'declined',
					idempotencyKey: 'media-missing-contact-contract',
				},
			})
		).rejects.toMatchObject({ code: 'MEDIA_DECISION_CONTEXT_REJECTED' });
		await db.run({
			sql: `INSERT INTO media_withdrawal_contact_versions
				(id, version, contact_snapshot_json, snapshot_hash, german_text_version,
				 approval_status, compliance_assessment_status, approved_by, approved_at, created_at)
			VALUES ('media-contact:alternate-approved-v1', 'alternate-approved-v1',
				'{"synthetic":"alternate-approved-contact"}', ?, 'alternate-media-text-v1',
				'approved', 'not_assessed', ?, ?, ?)`,
			params: [hash('b'), admin.id, now, now],
		});
		await expect(
			service.recordMediaDecision({
				actor: parent,
				requestId: 'media-approved-contact-mismatch',
				payload: {
					...base,
					withdrawalContactVersionId: 'media-contact:alternate-approved-v1',
					decision: 'declined',
					idempotencyKey: 'media-approved-contact-mismatch',
				},
			})
		).rejects.toMatchObject({ code: 'MEDIA_DECISION_CONTEXT_REJECTED' });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM media_consents`,
			})
		).toEqual({ count: 0 });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM audit_events
			WHERE request_id = 'media-approved-contact-mismatch'`,
			})
		).toEqual({ count: 0 });
		const boundContact = await db.first<{ id: string; snapshot_hash: string }>({
			sql: `SELECT contact.id, contact.snapshot_hash FROM contract_offers offer
			JOIN contract_template_versions template ON template.id = offer.template_version_id
			JOIN media_withdrawal_contact_versions contact
				ON contact.id = template.media_contact_version_id
			WHERE offer.id = ?`,
			params: [mediaOffer.offerId],
		});
		const declined = await service.recordMediaDecision({
			actor: parent,
			requestId: 'media-decline',
			payload: { ...base, decision: 'declined', idempotencyKey: 'media-decline-contract' },
		});
		expect(declined.replayed).toBe(false);
		expect(
			await db.first<{
				source_contract_offer_id: string;
				withdrawal_contact_version_id: string;
				withdrawal_contact_snapshot_hash: string;
			}>({
				sql: `SELECT source_contract_offer_id, withdrawal_contact_version_id,
				withdrawal_contact_snapshot_hash FROM media_consents WHERE id = ?`,
				params: [declined.consentId],
			})
		).toEqual({
			source_contract_offer_id: mediaOffer.offerId,
			withdrawal_contact_version_id: boundContact!.id,
			withdrawal_contact_snapshot_hash: boundContact!.snapshot_hash,
		});
		expect(
			await service.recordMediaDecision({
				actor: parent,
				requestId: 'media-decline-replay',
				payload: {
					...base,
					decision: 'declined',
					idempotencyKey: 'media-decline-contract',
				},
			})
		).toEqual({ consentId: declined.consentId, replayed: true });
		await db.run({
			sql: `UPDATE users SET is_blocked = 1, updated_at = ? WHERE id = ?`,
			params: [now, parent.id],
		});
		await expect(
			service.recordMediaDecision({
				actor: parent,
				requestId: 'media-decline-blocked-replay',
				payload: {
					...base,
					decision: 'declined',
					idempotencyKey: 'media-decline-contract',
				},
			})
		).rejects.toMatchObject({ code: 'MEDIA_DECISION_NOT_FOUND' });
		await db.run({
			sql: `UPDATE users SET is_blocked = 0, updated_at = ? WHERE id = ?`,
			params: [now, parent.id],
		});
		await expect(
			service.recordMediaDecision({
				actor: parent,
				requestId: 'media-grant',
				payload: { ...base, decision: 'granted', idempotencyKey: 'media-grant-contract' },
			})
		).rejects.toMatchObject({ code: 'MEDIA_ONLINE_GRANT_DISABLED' });
		await db.run({
			sql: `INSERT INTO media_consents
				(id, user_id, child_id, capture_scopes_json, publication_channels_json,
				 text_version, withdrawal_contact_version_id, withdrawal_contact_snapshot_hash,
				 decision, decision_source, decided_at, received_at, effective_from,
				 recorded_by_user_id, recorded_at, evidence_hash, request_dedupe_key,
				 source_contract_offer_id, source_privacy_request_id, supersedes_consent_id, created_at)
			SELECT 'media-grant-fixture', ?, ?, '["photo"]', '["website"]',
				'synthetic-media-text-v1', contact.id, contact.snapshot_hash, 'granted', 'portal',
				?, ?, ?, ?, ?, ?, 'media-grant-fixture-key', NULL, NULL, NULL, ?
			FROM media_withdrawal_contact_versions contact WHERE contact.id = ?`,
			params: [
				parent.id,
				'child-contract',
				now,
				now,
				now,
				parent.id,
				now,
				hash('9'),
				now,
				'media-contact:synthetic-v1',
			],
		});
		const withdrawalPayload = {
			ownerUserId: parent.id,
			childId: 'child-contract',
			captureScopes: ['photo'],
			publicationChannels: ['website'],
			channel: 'email',
			receivedAt: '2026-07-21T08:00:00.000Z',
			evidenceSummary: 'Verified sender and scope.',
			idempotencyKey: 'media-withdrawal-contract',
		};
		const withdrawal = await service.recordMediaWithdrawal({
			admin,
			payload: withdrawalPayload,
			requestId: 'media-withdrawal',
		});
		expect(withdrawal.replayed).toBe(false);
		expect(
			await service.recordMediaWithdrawal({
				admin,
				payload: withdrawalPayload,
				requestId: 'media-withdrawal-replay',
			})
		).toEqual({ consentId: withdrawal.consentId, replayed: true });
		expect(
			await db.first<{ effective_from: string; decision: string }>({
				sql: `SELECT effective_from, decision FROM media_consents WHERE id = ?`,
				params: [withdrawal.consentId],
			})
		).toEqual({ effective_from: withdrawalPayload.receivedAt, decision: 'revoked' });
		expect(() => service.submitPublicEndRequest({})).toThrowError(
			'PUBLIC_CONTRACT_FUNCTION_DISABLED'
		);
	});

	it('ends future individual attendance separately and creates the teacher task', async () => {
		const created = await service.createDraft({
			admin,
			requestId: 'create-individual-contract',
			payload: {
				userId: parent.id,
				childId: 'child-contract',
				academicPeriodId: 'period-contract',
				templateVersionId: 'contract-template:synthetic:individual_hourly:v1',
				renderInput: individualRenderInput(),
				expiresAt: '2026-08-05T10:00:00.000Z',
				idempotencyKey: 'create-individual-contract',
			},
		});
		const mismatchedAttendanceCarrier = await draft('mismatched-attendance-carrier');
		const rendered = await service.renderAndSend({
			admin,
			offerId: created.offerId,
			idempotencyKey: 'render-individual-contract',
			requestId: 'render-individual-contract',
		});
		await service.parentDecision({
			actor: parent,
			payload: {
				offerId: created.offerId,
				expectedContractHash: rendered.contractHash,
				decision: 'accept',
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText:
					'Ich nehme dieses unveränderte individuelle Vertragsangebot verbindlich an.',
				idempotencyKey: 'accept-individual-contract',
			},
			userAgent: 'vitest',
			requestSubject: '127.0.0.3',
			requestId: 'accept-individual-contract',
		});
		const formed = await service.formAndActivate({
			admin,
			requestId: 'form-individual-contract',
			payload: {
				offerId: created.offerId,
				reason: 'Tariff and service revalidated.',
				confirmation: 'confirmed',
				idempotencyKey: 'form-individual-contract',
			},
		});
		await expect(
			service.submitAttendanceNotice({
				actor: parent,
				payload: {
					offerId: mismatchedAttendanceCarrier.offerId,
					contractId: formed.contractId,
					noticeTextVersion: 'attendance-ceased-de-v1',
					idempotencyKey: 'attendance-mismatched-carrier',
				},
				requestId: 'attendance-mismatched-carrier',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
		await expect(
			service.submitAttendanceNotice({
				actor: foreignParent,
				payload: {
					offerId: created.offerId,
					contractId: formed.contractId,
					noticeTextVersion: 'attendance-ceased-de-v1',
					idempotencyKey: 'attendance-foreign-contract',
				},
				requestId: 'attendance-foreign',
			})
		).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM service_attendance_notices`,
			})
		).toEqual({ count: 0 });
		expect(
			await db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM admin_review_tasks
				WHERE kind = 'contract_attendance'`,
			})
		).toEqual({ count: 0 });
		const notice = await service.submitAttendanceNotice({
			actor: parent,
			payload: {
				offerId: created.offerId,
				contractId: formed.contractId,
				noticeTextVersion: 'attendance-ceased-de-v1',
				idempotencyKey: 'attendance-individual-contract',
			},
			requestId: 'attendance-individual',
		});
		expect(notice.replayed).toBe(false);
		expect(
			await db.first<Record<string, number>>({
				sql: `SELECT
				(SELECT COUNT(*) FROM service_attendance_notices notice
					JOIN contracts contract ON contract.id = notice.contract_id
					JOIN contract_offers offer ON offer.id = contract.contract_offer_id
					JOIN users owner ON owner.id = contract.user_id
					JOIN service_engagements engagement ON engagement.id = notice.service_engagement_id
					WHERE notice.id = ? AND notice.contract_id = ?
						AND notice.requested_by_user_id = ?
						AND notice.submission_channel = 'authenticated_portal'
						AND notice.notice_text_version = 'attendance-ceased-de-v1'
						AND notice.idempotency_key = 'attendance-individual-contract'
						AND contract.contract_offer_id = ? AND contract.user_id = ?
						AND contract.operational_status = 'active'
						AND offer.user_id = contract.user_id AND offer.child_id = contract.child_id
						AND owner.role = 'parent' AND owner.account_status = 'active'
						AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL
						AND engagement.id = contract.service_engagement_id
						AND engagement.contract_id = contract.id
						AND engagement.user_id = contract.user_id
						AND engagement.child_id = contract.child_id
						AND engagement.status = 'ended'
						AND engagement.attendance_notice_id = notice.id
						AND engagement.attendance_ceased_at = ?) AS notice_chain,
				(SELECT COUNT(*) FROM admin_review_tasks task
					JOIN service_attendance_notices notice
						ON notice.teacher_notification_task_id = task.id
					WHERE notice.id = ? AND task.kind = 'contract_attendance'
						AND task.source_kind = 'service_attendance_notice'
						AND task.source_id = notice.id AND task.reason_code = 'attendance_ceased'
						AND task.status = 'open') AS tasks,
				(SELECT COUNT(*) FROM contract_events WHERE contract_id = ?
					AND event_type = 'attendance_ceased' AND source_offer_id = ?
					AND actor_user_id = ? AND dedupe_key = ?) AS events,
				(SELECT COUNT(*) FROM contract_outbox_events WHERE source_id = ?
					AND source_kind = 'service_attendance_notice'
					AND event_type = 'attendance_ceased'
					AND status IN ('pending', 'consumed')) AS outbox,
				(SELECT COUNT(*) FROM audit_events WHERE actor_user_id = ?
					AND action = 'contract.attendance_ceased' AND target_kind = 'contract'
					AND target_id = ? AND request_id = 'attendance-individual') AS audits`,
				params: [
					notice.noticeId,
					formed.contractId,
					parent.id,
					created.offerId,
					parent.id,
					now,
					notice.noticeId,
					formed.contractId,
					created.offerId,
					parent.id,
					`attendance-ceased:${notice.noticeId}`,
					notice.noticeId,
					parent.id,
					formed.contractId,
				],
			})
		).toEqual({ notice_chain: 1, tasks: 1, events: 1, outbox: 1, audits: 1 });
		expect(
			await db.first<{ status: string; attendance_ceased_at: string }>({
				sql: `SELECT status, attendance_ceased_at FROM service_engagements WHERE contract_id = ?`,
				params: [formed.contractId],
			})
		).toEqual({ status: 'ended', attendance_ceased_at: now });
		expect(
			await db.first<{ kind: string; status: string }>({
				sql: `SELECT task.kind, task.status FROM admin_review_tasks task
			JOIN service_attendance_notices notice ON notice.teacher_notification_task_id = task.id
			WHERE notice.id = ?`,
				params: [notice.noticeId],
			})
		).toEqual({ kind: 'contract_attendance', status: 'open' });
		expect(
			await service.submitAttendanceNotice({
				actor: parent,
				payload: {
					offerId: created.offerId,
					contractId: formed.contractId,
					noticeTextVersion: 'attendance-ceased-de-v1',
					idempotencyKey: 'attendance-individual-contract',
				},
				requestId: 'attendance-replay',
			})
		).toEqual({ noticeId: notice.noticeId, replayed: true });
		await expect(
			service.submitAttendanceNotice({
				actor: parent,
				payload: {
					offerId: created.offerId,
					contractId: formed.contractId,
					noticeTextVersion: 'attendance-ceased-de-v1',
					idempotencyKey: 'attendance-distinct-key-after-ended',
				},
				requestId: 'attendance-distinct-key-after-ended',
			})
		).rejects.toMatchObject({ code: 'ATTENDANCE_NOTICE_REJECTED' });
		expect(
			await db.first<Record<string, number>>({
				sql: `SELECT
				(SELECT COUNT(*) FROM service_attendance_notices
					WHERE contract_id = ?) AS notices,
				(SELECT COUNT(*) FROM admin_review_tasks
					WHERE kind = 'contract_attendance') AS tasks,
				(SELECT COUNT(*) FROM contract_events
					WHERE contract_id = ? AND event_type = 'attendance_ceased') AS events,
				(SELECT COUNT(*) FROM contract_outbox_events
					WHERE source_kind = 'service_attendance_notice') AS outbox,
				(SELECT COUNT(*) FROM audit_events
					WHERE action = 'contract.attendance_ceased' AND target_id = ?) AS audits,
				(SELECT COUNT(*) FROM contract_action_assertions
					WHERE scope = 'attendance_notice' AND target_id = ?
						AND assertion_passed = 1) AS assertions`,
				params: [
					formed.contractId,
					formed.contractId,
					formed.contractId,
					formed.contractId,
				],
			})
		).toEqual({ notices: 1, tasks: 1, events: 1, outbox: 1, audits: 1, assertions: 1 });
	});

	it('rolls back the full attendance chain when owner eligibility changes before batch', async () => {
		const formed = await formIndividualContract('attendance-owner-race');
		const raceDb = new BeforeBatchDatabaseBoundary(context.db, async () => {
			await db.run({
				sql: `UPDATE users SET is_blocked = 1, updated_at = ? WHERE id = ?`,
				params: [now, parent.id],
			});
		});
		const raceService = new ContractService(
			new ContractRepository(raceDb),
			store,
			config,
			undefined,
			() => now
		);
		await expect(
			raceService.submitAttendanceNotice({
				actor: parent,
				payload: {
					offerId: formed.offerId,
					contractId: formed.contractId,
					noticeTextVersion: 'attendance-ceased-de-v1',
					idempotencyKey: 'attendance-owner-race',
				},
				requestId: 'attendance-owner-race',
			})
		).rejects.toMatchObject({ code: 'ATTENDANCE_NOTICE_REJECTED' });
		await db.run({
			sql: `UPDATE users SET is_blocked = 0, updated_at = ? WHERE id = ?`,
			params: [now, parent.id],
		});
		expect(
			await db.first<Record<string, number | string | null>>({
				sql: `SELECT
				(SELECT COUNT(*) FROM service_attendance_notices
					WHERE contract_id = ?) AS notices,
				(SELECT COUNT(*) FROM admin_review_tasks
					WHERE kind = 'contract_attendance') AS tasks,
				(SELECT COUNT(*) FROM contract_events
					WHERE contract_id = ? AND event_type = 'attendance_ceased') AS events,
				(SELECT COUNT(*) FROM contract_outbox_events
					WHERE source_kind = 'service_attendance_notice') AS outbox,
				(SELECT COUNT(*) FROM audit_events
					WHERE request_id = 'attendance-owner-race') AS audits,
				(SELECT COUNT(*) FROM contract_action_assertions
					WHERE scope = 'attendance_notice' AND target_id = ?) AS assertions,
				engagement.status, engagement.attendance_notice_id
			FROM service_engagements engagement WHERE engagement.contract_id = ?`,
				params: [
					formed.contractId,
					formed.contractId,
					formed.contractId,
					formed.contractId,
				],
			})
		).toEqual({
			notices: 0,
			tasks: 0,
			events: 0,
			outbox: 0,
			audits: 0,
			assertions: 0,
			status: 'active',
			attendance_notice_id: null,
		});
	});

	it('rolls back media consent and audit when owner eligibility changes before batch', async () => {
		const mediaOffer = await draft('media-owner-race');
		const raceDb = new BeforeBatchDatabaseBoundary(context.db, async () => {
			await db.run({
				sql: `UPDATE users SET is_blocked = 1, updated_at = ? WHERE id = ?`,
				params: [now, parent.id],
			});
		});
		const raceService = new ContractService(
			new ContractRepository(raceDb),
			store,
			config,
			undefined,
			() => now
		);
		await expect(
			raceService.recordMediaDecision({
				actor: parent,
				requestId: 'media-owner-race',
				payload: {
					offerId: mediaOffer.offerId,
					childId: 'child-contract',
					captureScopes: ['photo'],
					publicationChannels: ['website'],
					textVersion: 'synthetic-media-text-v1',
					withdrawalContactVersionId: 'media-contact:synthetic-v1',
					decision: 'declined',
					idempotencyKey: 'media-owner-race',
				},
			})
		).rejects.toMatchObject({ code: 'MEDIA_DECISION_REJECTED' });
		await db.run({
			sql: `UPDATE users SET is_blocked = 0, updated_at = ? WHERE id = ?`,
			params: [now, parent.id],
		});
		expect(
			await db.first<Record<string, number>>({
				sql: `SELECT
				(SELECT COUNT(*) FROM media_consents
					WHERE source_contract_offer_id = ?) AS consents,
				(SELECT COUNT(*) FROM audit_events
					WHERE request_id = 'media-owner-race') AS audits,
				(SELECT COUNT(*) FROM contract_action_assertions
					WHERE scope = 'media_decision' AND target_id = ?) AS assertions`,
				params: [mediaOffer.offerId, mediaOffer.offerId],
			})
		).toEqual({ consents: 0, audits: 0, assertions: 0 });
	});

	it('replays concurrent identical attendance, media, and end actions with one evidence chain', async () => {
		const formedIndividual = await formIndividualContract('concurrent-attendance');
		const attendanceRaceDb = new TwoCallBatchBarrierBoundary(context.db);
		const attendanceRaceService = new ContractService(
			new ContractRepository(attendanceRaceDb),
			store,
			config,
			undefined,
			() => now
		);
		const attendanceInput = {
			actor: parent,
			payload: {
				offerId: formedIndividual.offerId,
				contractId: formedIndividual.contractId,
				noticeTextVersion: 'attendance-ceased-de-v1',
				idempotencyKey: 'attendance-concurrent-identical',
			},
		};
		const [attendanceA, attendanceB] = await Promise.all([
			attendanceRaceService.submitAttendanceNotice({
				...attendanceInput,
				requestId: 'attendance-concurrent-a',
			}),
			attendanceRaceService.submitAttendanceNotice({
				...attendanceInput,
				requestId: 'attendance-concurrent-b',
			}),
		]);
		expect(new Set([attendanceA.noticeId, attendanceB.noticeId]).size).toBe(1);
		expect([attendanceA.replayed, attendanceB.replayed].sort()).toEqual([false, true]);
		expect(
			await db.first<Record<string, number>>({
				sql: `SELECT
				(SELECT COUNT(*) FROM service_attendance_notices
					WHERE contract_id = ?) AS notices,
				(SELECT COUNT(*) FROM admin_review_tasks
					WHERE kind = 'contract_attendance') AS tasks,
				(SELECT COUNT(*) FROM contract_events
					WHERE contract_id = ? AND event_type = 'attendance_ceased') AS events,
				(SELECT COUNT(*) FROM contract_outbox_events
					WHERE source_kind = 'service_attendance_notice') AS outbox,
				(SELECT COUNT(*) FROM audit_events
					WHERE action = 'contract.attendance_ceased' AND target_id = ?) AS audits,
				(SELECT COUNT(*) FROM contract_action_assertions
					WHERE scope = 'attendance_notice' AND target_id = ?
						AND assertion_passed = 1) AS assertions`,
				params: [
					formedIndividual.contractId,
					formedIndividual.contractId,
					formedIndividual.contractId,
					formedIndividual.contractId,
				],
			})
		).toEqual({ notices: 1, tasks: 1, events: 1, outbox: 1, audits: 1, assertions: 1 });

		const groupOffer = await draft('concurrent-media-end');
		const mediaRaceDb = new TwoCallBatchBarrierBoundary(context.db);
		const mediaRaceService = new ContractService(
			new ContractRepository(mediaRaceDb),
			store,
			config,
			undefined,
			() => now
		);
		const mediaInput = {
			actor: parent,
			payload: {
				offerId: groupOffer.offerId,
				childId: 'child-contract',
				captureScopes: ['photo'],
				publicationChannels: ['website'],
				textVersion: 'synthetic-media-text-v1',
				withdrawalContactVersionId: 'media-contact:synthetic-v1',
				decision: 'declined' as const,
				idempotencyKey: 'media-concurrent-identical',
			},
		};
		const [mediaA, mediaB] = await Promise.all([
			mediaRaceService.recordMediaDecision({
				...mediaInput,
				requestId: 'media-concurrent-a',
			}),
			mediaRaceService.recordMediaDecision({
				...mediaInput,
				requestId: 'media-concurrent-b',
			}),
		]);
		expect(new Set([mediaA.consentId, mediaB.consentId]).size).toBe(1);
		expect([mediaA.replayed, mediaB.replayed].sort()).toEqual([false, true]);
		expect(
			await db.first<Record<string, number>>({
				sql: `SELECT
				(SELECT COUNT(*) FROM media_consents
					WHERE source_contract_offer_id = ?) AS consents,
				(SELECT COUNT(*) FROM audit_events
					WHERE action = 'media.decision' AND target_id = ?) AS audits,
				(SELECT COUNT(*) FROM contract_action_assertions
					WHERE scope = 'media_decision' AND target_id = ?
						AND assertion_passed = 1) AS assertions`,
				params: [groupOffer.offerId, mediaA.consentId, groupOffer.offerId],
			})
		).toEqual({ consents: 1, audits: 1, assertions: 1 });

		const rendered = await service.renderAndSend({
			admin,
			offerId: groupOffer.offerId,
			idempotencyKey: 'render-concurrent-end',
			requestId: 'render-concurrent-end',
		});
		await service.parentDecision({
			actor: parent,
			payload: {
				offerId: groupOffer.offerId,
				expectedContractHash: rendered.contractHash,
				decision: 'accept',
				acceptanceTextVersion: 'contract-acceptance-de-v1',
				acceptanceText: 'Ich nehme das unveraenderte Concurrent-Testangebot an.',
				idempotencyKey: 'accept-concurrent-end',
			},
			userAgent: 'vitest',
			requestSubject: '127.0.0.21',
			requestId: 'accept-concurrent-end',
		});
		const formedGroup = await service.formAndActivate({
			admin,
			requestId: 'form-concurrent-end',
			payload: {
				offerId: groupOffer.offerId,
				reason: 'Synthetic concurrent end test revalidated.',
				confirmation: 'confirmed',
				idempotencyKey: 'form-concurrent-end',
			},
		});
		const endRaceDb = new TwoCallBatchBarrierBoundary(context.db);
		const endRaceService = new ContractService(
			new ContractRepository(endRaceDb),
			store,
			config,
			undefined,
			() => now
		);
		const endInput = {
			actor: parent,
			payload: {
				offerId: groupOffer.offerId,
				contractId: formedGroup.contractId,
				kind: 'ordinary_termination' as const,
				requestedEffectiveOn: null,
				requestTextVersion: 'termination-de-v1',
				idempotencyKey: 'end-concurrent-identical',
			},
		};
		const [endA, endB] = await Promise.all([
			endRaceService.submitEndRequest({ ...endInput, requestId: 'end-concurrent-a' }),
			endRaceService.submitEndRequest({ ...endInput, requestId: 'end-concurrent-b' }),
		]);
		expect(new Set([endA.requestId, endB.requestId]).size).toBe(1);
		expect([endA.replayed, endB.replayed].sort()).toEqual([false, true]);
		expect(
			await db.first<Record<string, number>>({
				sql: `SELECT
				(SELECT COUNT(*) FROM contract_end_requests
					WHERE contract_id = ?) AS requests,
				(SELECT COUNT(*) FROM contract_outbox_events
					WHERE source_kind = 'contract_end_request' AND source_id = ?) AS outbox,
				(SELECT COUNT(*) FROM audit_events
					WHERE action = 'contract.end_request.received' AND target_id = ?) AS audits,
				(SELECT COUNT(*) FROM contract_action_assertions
					WHERE scope = 'end_request' AND target_id = ?
						AND assertion_passed = 1) AS assertions`,
				params: [
					formedGroup.contractId,
					endA.requestId,
					endA.requestId,
					formedGroup.contractId,
				],
			})
		).toEqual({ requests: 1, outbox: 1, audits: 1, assertions: 1 });
	}, 60_000);

	it('supersedes old-family offers while preserving numbers and moving only future reservations', async () => {
		const oldOffer = await draft('family-before-correction');
		const oldNumber = (await repository.loadOffer(oldOffer.offerId))!.contract_number;
		await db.batch([
			{
				sql: `INSERT INTO family_number_allocations
				(id, namespace, sequence_number, display_family_id, legacy_family_id,
				 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
				 created_at, updated_at)
				VALUES ('family-contract-destination', 'portal_2', 9201, '2. 9201', NULL,
					NULL, 'portal', 'pending', NULL, NULL, ?, ?)`,
				params: [now, now],
			},
			{
				sql: `INSERT INTO family_reassignments
				(id, user_id, from_family_number_id, to_family_number_id, source,
				 reason_code, reason_note, requested_by, confirmed_by, idempotency_key,
				 family_version_before, status, safe_effects_json, created_at, applied_at, updated_at)
				VALUES ('contract-family-reassignment', ?, 'family-contract',
					'family-contract-destination', 'admin_correction', 'verified_correction',
					'Verified destination and family evidence.', ?, ?, 'contract-family-reassignment',
					1, 'applied', '{}', ?, ?, ?)`,
				params: [parent.id, admin.id, admin.id, now, now, now],
			},
		]);
		const contributor = new ContractFamilyCorrectionContributor(db);
		const preview = await contributor.preview({
			userId: parent.id,
			fromFamilyNumberId: 'family-contract',
			toFamilyNumberId: 'family-contract-destination',
		});
		expect(preview).toMatchObject({ nonterminalOfferCount: 1, immutableContractCount: 0 });
		await db.batch(
			await contributor.applyStatements({
				previewId: 'synthetic-preview',
				reassignmentId: 'contract-family-reassignment',
				userId: parent.id,
				fromFamilyNumberId: 'family-contract',
				toFamilyNumberId: 'family-contract-destination',
				now,
			})
		);
		expect(await repository.loadOffer(oldOffer.offerId)).toMatchObject({
			status: 'superseded',
			contract_number: oldNumber,
		});
		await db.batch([
			{
				sql: `UPDATE family_number_allocations SET status = 'retired', owner_user_id = NULL,
				updated_at = ? WHERE id = 'family-contract'`,
				params: [now],
			},
			{
				sql: `UPDATE family_number_allocations SET status = 'assigned', owner_user_id = ?,
				assigned_at = ?, updated_at = ? WHERE id = 'family-contract-destination'`,
				params: [parent.id, now, now],
			},
			{
				sql: `UPDATE users SET family_number_id = 'family-contract-destination',
				family_version = 2, updated_at = ? WHERE id = ?`,
				params: [now, parent.id],
			},
			{
				sql: `UPDATE children SET family_number_id = 'family-contract-destination',
				updated_at = ? WHERE owner_user_id = ?`,
				params: [now, parent.id],
			},
		]);
		const future = await draft('family-after-correction');
		expect((await repository.loadOffer(future.offerId))!.contract_number).toBe('2. 9201-1');
		expect((await repository.loadOffer(oldOffer.offerId))!.contract_number).toBe(oldNumber);
	});
});

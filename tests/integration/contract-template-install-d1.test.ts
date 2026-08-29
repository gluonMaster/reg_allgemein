import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { ContractRepository } from '$lib/server/contracts/contract-repository';
import { ContractService } from '$lib/server/contracts/contract-service';
import {
	ContractObjectReadError,
	type ContractArtifactStore,
	type ContractObjectReadLimits,
} from '$lib/server/contracts/storage';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import { StorageIntentRepository } from '$lib/server/operations/storage-intents';
import { requireAdmin } from '$lib/server/security/authorization';
import { createMigratedTestD1 } from '../helpers/d1';

const now = '2026-08-27T10:00:00.000Z';
const admin = requireAdmin({
	id: 'admin-template-install',
	role: 'admin',
	emailVerified: true,
	sessionId: 'admin-template-install-session',
	sessionVersion: 1,
	csrfHash: 'admin-template-install-csrf',
});

class AtomicMemoryStore implements ContractArtifactStore {
	readonly values = new Map<string, Uint8Array>();
	readonly reads: Array<{ key: string; limits: ContractObjectReadLimits }> = [];
	failCreates = false;
	throwAfterCreate = false;

	async put(key: string, body: Uint8Array) {
		this.values.set(key, Uint8Array.from(body));
	}

	async putIfAbsent(key: string, body: Uint8Array) {
		if (this.failCreates) throw new Error('injected create failure');
		if (this.values.has(key)) return false;
		this.values.set(key, Uint8Array.from(body));
		if (this.throwAfterCreate) throw new Error('injected ambiguous create result');
		return true;
	}

	async get(key: string, limits: ContractObjectReadLimits) {
		this.reads.push({ key, limits: { ...limits } });
		const value = this.values.get(key);
		if (!value) return null;
		if (value.byteLength > limits.maximumSizeBytes) {
			throw new ContractObjectReadError('CONTRACT_OBJECT_TOO_LARGE');
		}
		if (
			limits.expectedSizeBytes !== undefined &&
			value.byteLength !== limits.expectedSizeBytes
		) {
			throw new ContractObjectReadError('CONTRACT_OBJECT_SIZE_MISMATCH');
		}
		const copy = Uint8Array.from(value);
		return { body: copy.buffer, size: copy.byteLength };
	}

	async delete(key: string) {
		this.values.delete(key);
	}
}

class ThrowBeforeBatchOnceBoundary extends DatabaseBoundary {
	private pending = true;

	override async batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]> {
		if (this.pending) {
			this.pending = false;
			throw new Error('injected pre-batch failure');
		}
		return super.batch<T>(statements);
	}
}

class FailInsideBatchOnceBoundary extends DatabaseBoundary {
	private pending = true;

	override async batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]> {
		if (!this.pending) return super.batch<T>(statements);
		this.pending = false;
		return super.batch<T>([
			...statements,
			{
				sql: `INSERT INTO storage_intent_link_assertions
					(id, intent_id, target_kind, target_id, assertion_passed, created_at)
				SELECT 'injected-failing-assertion', id, 'injected_failure',
					'injected_failure', 0, ?
				FROM storage_object_intents
				WHERE object_kind = 'contract_template_bundle'
				LIMIT 1`,
				params: [now],
			},
		]);
	}
}

class ThrowAfterBatchOnceBoundary extends DatabaseBoundary {
	private pending = true;

	override async batch<T = Record<string, unknown>>(
		statements: readonly StatementSpec[]
	): Promise<D1Result<T>[]> {
		const result = await super.batch<T>(statements);
		if (this.pending) {
			this.pending = false;
			throw new Error('injected ambiguous applied batch result');
		}
		return result;
	}
}

function previewConfig(db: D1Database) {
	return loadRuntimeConfig({
		APP_ENV: 'preview',
		PORTAL_PUBLIC_ORIGIN: 'https://portal-preview.example.test',
		DB: db,
		R2_ARCHIVE: { get() {}, put() {}, delete() {} } as unknown as R2Bucket,
		R2_QUARANTINE: { get() {}, put() {}, delete() {} } as unknown as R2Bucket,
		ASSETS: { fetch() {} } as unknown as Fetcher,
		BROWSER: { quickAction() {} } as unknown as BrowserRun,
		JWT_SECRET: 'x'.repeat(32),
		TURNSTILE_SITE_KEY: 'preview-site-key',
		TURNSTILE_SECRET_KEY: 'preview-secret-key',
		TURNSTILE_HOSTNAMES: 'portal-preview.example.test',
		OFFICIAL_PRIVACY_URL: 'https://kolibri-dresden.de/datenschutz/',
		OFFICIAL_IMPRINT_URL: 'https://kolibri-dresden.de/impressum/',
		OFFICIAL_CONTACT_URL: 'https://kolibri-dresden.de/kontakt/',
		OFFICIAL_LINKS_VERSION: 'preview-review-links-v1',
		SCHEDULED_JOBS_ENABLED: 'true',
		EMAIL_PROVIDER: 'resend',
		EMAIL_FROM: 'Kinder- und Elternzentrum Kolibri e.V. <registration@kolibri-dresden.de>',
		EMAIL_REPLY_TO: 'registration@kolibri-dresden.de',
		RESEND_API_KEY: `re_${'x'.repeat(32)}`,
		PREVIEW_EMAIL_RECIPIENT_HASHES: 'a'.repeat(64),
		CONTRACT_SEND_ENABLED: 'true',
		CONTRACT_PREVIEW_REVIEW_ENABLED: 'true',
		CONTRACT_RENDERER: 'browser_run',
	});
}

async function seedAdmin(db: DatabaseBoundary) {
	await db.run({
		sql: `INSERT INTO users
			(id, email, email_normalized, password_hash, email_verified_at, role,
			 first_name, last_name, first_name_normalized, last_name_normalized,
			 family_number_id, family_assignment_status, family_version,
			 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
		VALUES (?, 'admin-template-install@example.test', 'admin-template-install@example.test',
			'not-used', ?, 'admin', 'Template', 'Admin', 'template', 'admin', NULL,
			'pending_verification', 0, 'privacy-v1', ?, ?, ?)`,
		params: [admin.id, now, now, now, now],
	});
}

async function count(db: DatabaseBoundary, table: string, where = '1 = 1') {
	const row = await db.first<{ count: number }>({
		sql: `SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`,
	});
	return row?.count ?? 0;
}

describe('contract template installation recovery in D1', () => {
	it('keeps conditional objects write-once and reconciles races, crashes, conflicts, and ambiguous results', async () => {
		const sameContext = await createMigratedTestD1();
		try {
			const db = new DatabaseBoundary(sameContext.db);
			await seedAdmin(db);
			const store = new AtomicMemoryStore();
			const service = new ContractService(
				new ContractRepository(db),
				store,
				previewConfig(sameContext.db),
				undefined,
				() => now
			);

			const [first, concurrent] = await Promise.all([
				service.installPreviewReviewTemplates(admin),
				service.installPreviewReviewTemplates(admin),
			]);
			expect(first).toEqual(concurrent);
			expect(store.values.size).toBe(4);
			expect(store.reads.length).toBeGreaterThanOrEqual(8);
			expect(
				store.reads.every(
					(read) =>
						read.limits.maximumSizeBytes === 2 * 1024 * 1024 &&
						read.limits.expectedSizeBytes !== undefined
				)
			).toBe(true);
			expect(
				await count(db, 'contract_template_versions', "usage_scope = 'preview_review'")
			).toBe(4);
			expect(
				await count(
					db,
					'storage_object_intents',
					"object_kind = 'contract_template_bundle' AND status = 'linked'"
				)
			).toBe(4);
			expect(
				await count(
					db,
					'storage_intent_link_assertions',
					"target_kind = 'contract_template_version'"
				)
			).toBe(4);
			expect(
				await count(
					db,
					'audit_events',
					"action = 'contract.preview_review_templates_installed'"
				)
			).toBe(1);
			await expect(service.installPreviewReviewTemplates(admin)).resolves.toEqual(first);

			const winnerKey =
				'contract-templates/preview-review/group_yearly/preview-review-v1.json';
			const originalWinner = Uint8Array.from(store.values.get(winnerKey)!);
			store.values.set(winnerKey, new TextEncoder().encode('different-racing-winner'));
			await expect(service.installPreviewReviewTemplates(admin)).rejects.toMatchObject({
				code: 'CONTRACT_TEMPLATE_BUNDLE_CONFLICT',
			});
			expect(store.values.get(winnerKey)).toEqual(
				new TextEncoder().encode('different-racing-winner')
			);
			expect(
				await count(db, 'contract_template_versions', "usage_scope = 'preview_review'")
			).toBe(4);
			expect(
				await count(
					db,
					'audit_events',
					"action = 'contract.preview_review_templates_installed'"
				)
			).toBe(1);
			store.values.set(winnerKey, originalWinner);
		} finally {
			await sameContext.dispose();
		}

		const crashContext = await createMigratedTestD1();
		try {
			const db = new DatabaseBoundary(crashContext.db);
			await seedAdmin(db);
			const store = new AtomicMemoryStore();
			store.failCreates = true;
			const initialService = new ContractService(
				new ContractRepository(db),
				store,
				previewConfig(crashContext.db),
				undefined,
				() => now
			);
			await expect(initialService.installPreviewReviewTemplates(admin)).rejects.toMatchObject(
				{
					code: 'CONTRACT_TEMPLATE_BUNDLE_WRITE_UNRESOLVED',
				}
			);
			expect(
				await count(
					db,
					'storage_object_intents',
					"object_kind = 'contract_template_bundle' AND status = 'staged'"
				)
			).toBeGreaterThan(0);
			expect(
				await count(db, 'contract_template_versions', "usage_scope = 'preview_review'")
			).toBe(0);
			expect(
				await count(
					db,
					'audit_events',
					"action = 'contract.preview_review_templates_installed'"
				)
			).toBe(0);

			store.failCreates = false;
			const beforeBatchService = new ContractService(
				new ContractRepository(new ThrowBeforeBatchOnceBoundary(crashContext.db)),
				store,
				previewConfig(crashContext.db),
				undefined,
				() => now
			);
			await expect(
				beforeBatchService.installPreviewReviewTemplates(admin)
			).rejects.toMatchObject({
				code: 'CONTRACT_TEMPLATE_INSTALL_REJECTED',
			});
			expect(store.values.size).toBe(4);
			expect(
				await count(db, 'contract_template_versions', "usage_scope = 'preview_review'")
			).toBe(0);
			expect(
				await count(
					db,
					'storage_object_intents',
					"object_kind = 'contract_template_bundle' AND status = 'staged'"
				)
			).toBe(4);
			expect(
				await count(
					db,
					'storage_intent_link_assertions',
					"target_kind = 'contract_template_version'"
				)
			).toBe(0);

			const insideBatchService = new ContractService(
				new ContractRepository(new FailInsideBatchOnceBoundary(crashContext.db)),
				store,
				previewConfig(crashContext.db),
				undefined,
				() => now
			);
			await expect(
				insideBatchService.installPreviewReviewTemplates(admin)
			).rejects.toMatchObject({
				code: 'CONTRACT_TEMPLATE_INSTALL_REJECTED',
			});
			expect(
				await count(
					db,
					'contract_provider_versions',
					"id = 'contract-provider:preview-review-v1'"
				)
			).toBe(0);
			expect(
				await count(
					db,
					'media_withdrawal_contact_versions',
					"id = 'media-contact:preview-review-v1'"
				)
			).toBe(0);
			expect(
				await count(db, 'contract_template_versions', "usage_scope = 'preview_review'")
			).toBe(0);
			expect(
				await count(
					db,
					'storage_object_intents',
					"object_kind = 'contract_template_bundle' AND status = 'staged'"
				)
			).toBe(4);
			expect(
				await count(
					db,
					'storage_intent_link_assertions',
					"target_kind = 'contract_template_version'"
				)
			).toBe(0);
			expect(
				await count(
					db,
					'audit_events',
					"action = 'contract.preview_review_templates_installed'"
				)
			).toBe(0);

			const retryService = new ContractService(
				new ContractRepository(db),
				store,
				previewConfig(crashContext.db),
				undefined,
				() => now
			);
			await expect(retryService.installPreviewReviewTemplates(admin)).resolves.toHaveLength(
				4
			);
			expect(
				await count(
					db,
					'storage_object_intents',
					"object_kind = 'contract_template_bundle' AND status = 'linked'"
				)
			).toBe(4);
		} finally {
			await crashContext.dispose();
		}

		const ambiguousContext = await createMigratedTestD1();
		try {
			const normalDb = new DatabaseBoundary(ambiguousContext.db);
			await seedAdmin(normalDb);
			const store = new AtomicMemoryStore();
			store.throwAfterCreate = true;
			const service = new ContractService(
				new ContractRepository(new ThrowAfterBatchOnceBoundary(ambiguousContext.db)),
				store,
				previewConfig(ambiguousContext.db),
				undefined,
				() => now
			);
			await expect(service.installPreviewReviewTemplates(admin)).resolves.toHaveLength(4);
			expect(store.values.size).toBe(4);
			expect(
				await count(
					normalDb,
					'contract_template_versions',
					"usage_scope = 'preview_review'"
				)
			).toBe(4);
			expect(
				await count(
					normalDb,
					'audit_events',
					"action = 'contract.preview_review_templates_installed'"
				)
			).toBe(1);
		} finally {
			await ambiguousContext.dispose();
		}

		const objectConflictContext = await createMigratedTestD1();
		try {
			const db = new DatabaseBoundary(objectConflictContext.db);
			await seedAdmin(db);
			const store = new AtomicMemoryStore();
			const winnerKey =
				'contract-templates/preview-review/group_yearly/preview-review-v1.json';
			const racingWinner = new TextEncoder().encode('different-racing-winner');
			store.values.set(winnerKey, racingWinner);
			const service = new ContractService(
				new ContractRepository(db),
				store,
				previewConfig(objectConflictContext.db),
				undefined,
				() => now
			);
			await expect(service.installPreviewReviewTemplates(admin)).rejects.toMatchObject({
				code: 'CONTRACT_TEMPLATE_BUNDLE_CONFLICT',
			});
			expect(store.values.get(winnerKey)).toEqual(racingWinner);
			expect(
				await count(
					db,
					'contract_provider_versions',
					"id = 'contract-provider:preview-review-v1'"
				)
			).toBe(0);
			expect(
				await count(
					db,
					'media_withdrawal_contact_versions',
					"id = 'media-contact:preview-review-v1'"
				)
			).toBe(0);
			expect(
				await count(db, 'contract_template_versions', "usage_scope = 'preview_review'")
			).toBe(0);
			expect(
				await count(
					db,
					'storage_intent_link_assertions',
					"target_kind = 'contract_template_version'"
				)
			).toBe(0);
			expect(
				await count(
					db,
					'audit_events',
					"action = 'contract.preview_review_templates_installed'"
				)
			).toBe(0);
		} finally {
			await objectConflictContext.dispose();
		}

		const conflictContext = await createMigratedTestD1();
		try {
			const db = new DatabaseBoundary(conflictContext.db);
			await seedAdmin(db);
			await db.run({
				sql: `INSERT INTO contract_provider_versions
						(id, version, provider_snapshot_json, payment_terms_version,
						 payment_terms_hash, approval_status, approved_by, approved_at, created_at)
					VALUES ('contract-provider:preview-review-v1', 'conflicting-version', '{}',
						'conflicting-payment', ?, 'approved', ?, ?, ?)`,
				params: ['f'.repeat(64), admin.id, now, now],
			});
			const store = new AtomicMemoryStore();
			const service = new ContractService(
				new ContractRepository(db),
				store,
				previewConfig(conflictContext.db),
				undefined,
				() => now
			);
			await expect(service.installPreviewReviewTemplates(admin)).rejects.toMatchObject({
				code: 'CONTRACT_TEMPLATE_INSTALL_REJECTED',
			});
			expect(
				await count(
					db,
					'media_withdrawal_contact_versions',
					"id = 'media-contact:preview-review-v1'"
				)
			).toBe(0);
			expect(
				await count(db, 'contract_template_versions', "usage_scope = 'preview_review'")
			).toBe(0);
			expect(
				await count(
					db,
					'storage_intent_link_assertions',
					"target_kind = 'contract_template_version'"
				)
			).toBe(0);
			expect(
				await count(
					db,
					'audit_events',
					"action = 'contract.preview_review_templates_installed'"
				)
			).toBe(0);
		} finally {
			await conflictContext.dispose();
		}

		const mediaConflictContext = await createMigratedTestD1();
		try {
			const db = new DatabaseBoundary(mediaConflictContext.db);
			await seedAdmin(db);
			await db.run({
				sql: `INSERT INTO media_withdrawal_contact_versions
						(id, version, contact_snapshot_json, snapshot_hash, german_text_version,
						 approval_status, compliance_assessment_status, approved_by, approved_at,
						 created_at)
					VALUES ('media-contact:preview-review-v1', 'conflicting-media-version',
						'{}', ?, 'conflicting-media-text', 'approved', 'not_assessed', ?, ?, ?)`,
				params: ['e'.repeat(64), admin.id, now, now],
			});
			const store = new AtomicMemoryStore();
			const service = new ContractService(
				new ContractRepository(db),
				store,
				previewConfig(mediaConflictContext.db),
				undefined,
				() => now
			);
			await expect(service.installPreviewReviewTemplates(admin)).rejects.toMatchObject({
				code: 'CONTRACT_TEMPLATE_INSTALL_REJECTED',
			});
			expect(
				await count(
					db,
					'contract_provider_versions',
					"id = 'contract-provider:preview-review-v1'"
				)
			).toBe(0);
			expect(
				await count(
					db,
					'media_withdrawal_contact_versions',
					"id = 'media-contact:preview-review-v1'"
				)
			).toBe(1);
			expect(
				await count(db, 'contract_template_versions', "usage_scope = 'preview_review'")
			).toBe(0);
			expect(
				await count(
					db,
					'storage_intent_link_assertions',
					"target_kind = 'contract_template_version'"
				)
			).toBe(0);
			expect(
				await count(
					db,
					'audit_events',
					"action = 'contract.preview_review_templates_installed'"
				)
			).toBe(0);
		} finally {
			await mediaConflictContext.dispose();
		}

		const templateConflictContext = await createMigratedTestD1();
		try {
			const db = new DatabaseBoundary(templateConflictContext.db);
			await seedAdmin(db);
			await db.run({
				sql: `INSERT INTO contract_provider_versions
						(id, version, provider_snapshot_json, payment_terms_version,
						 payment_terms_hash, approval_status, approved_by, approved_at, created_at)
					VALUES ('contract-provider:template-conflict-seed',
						'template-conflict-provider-v1', '{}', 'template-conflict-payment-v1',
						?, 'approved', ?, ?, ?)`,
				params: ['b'.repeat(64), admin.id, now, now],
			});
			await db.run({
				sql: `INSERT INTO media_withdrawal_contact_versions
						(id, version, contact_snapshot_json, snapshot_hash, german_text_version,
						 approval_status, compliance_assessment_status, approved_by, approved_at,
						 created_at)
					VALUES ('media-contact:template-conflict-seed',
						'template-conflict-media-v1', '{}', ?, 'template-conflict-text-v1',
						'approved', 'not_assessed', ?, ?, ?)`,
				params: ['a'.repeat(64), admin.id, now, now],
			});
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
					VALUES ('contract-template:preview-review:group_yearly:v1', 'group_yearly',
						'template-conflict-v1', 'contract-render-source-bundle-v1',
						'template-conflict-clauses-v1',
						'contract-provider:template-conflict-seed',
						'media-contact:template-conflict-seed',
						'contract-templates/conflict/group_yearly-v1.json', ?, ?, ?, '{}', '{}',
						'[]', 'synthetic-test-pdf-v1', 'contract-renderer-adapter-v1',
						'2026-08-15', 'synthetic_test', 'approved', 'synthetic_fixture',
						'offline_only', NULL, NULL, 0, 0, ?, ?, NULL, NULL, ?)`,
				params: ['c'.repeat(64), 'd'.repeat(64), 'e'.repeat(64), admin.id, now, now],
			});
			const store = new AtomicMemoryStore();
			const service = new ContractService(
				new ContractRepository(db),
				store,
				previewConfig(templateConflictContext.db),
				undefined,
				() => now
			);
			await expect(service.installPreviewReviewTemplates(admin)).rejects.toMatchObject({
				code: 'CONTRACT_TEMPLATE_INSTALL_REJECTED',
			});
			expect(
				await count(
					db,
					'contract_provider_versions',
					"id = 'contract-provider:preview-review-v1'"
				)
			).toBe(0);
			expect(
				await count(
					db,
					'media_withdrawal_contact_versions',
					"id = 'media-contact:preview-review-v1'"
				)
			).toBe(0);
			expect(
				await count(
					db,
					'contract_template_versions',
					"id = 'contract-template:preview-review:group_yearly:v1' AND usage_scope = 'synthetic_test'"
				)
			).toBe(1);
			expect(
				await count(db, 'contract_template_versions', "usage_scope = 'preview_review'")
			).toBe(0);
			expect(
				await count(
					db,
					'storage_intent_link_assertions',
					"target_kind = 'contract_template_version'"
				)
			).toBe(0);
			expect(
				await count(
					db,
					'audit_events',
					"action = 'contract.preview_review_templates_installed'"
				)
			).toBe(0);
		} finally {
			await templateConflictContext.dispose();
		}
	}, 240_000);

	it('restages fenced generations after processing or deleted cleanup without stale deletion', async () => {
		const firstNow = '2026-08-27T10:00:00.000Z';
		const cleanupNow = '2026-08-27T10:20:00.000Z';
		const cleanupLeaseUntil = '2026-08-27T10:25:00.000Z';

		const processingContext = await createMigratedTestD1();
		try {
			const db = new DatabaseBoundary(processingContext.db);
			await seedAdmin(db);
			const store = new AtomicMemoryStore();
			const crashing = new ContractService(
				new ContractRepository(new ThrowBeforeBatchOnceBoundary(processingContext.db)),
				store,
				previewConfig(processingContext.db),
				undefined,
				() => firstNow
			);
			await expect(crashing.installPreviewReviewTemplates(admin)).rejects.toMatchObject({
				code: 'CONTRACT_TEMPLATE_INSTALL_REJECTED',
			});
			expect(store.values.size).toBe(4);

			const cleanup = new StorageIntentRepository(db);
			const claimed = await cleanup.claimCleanup({
				now: cleanupNow,
				stagedBefore: firstNow,
				leaseOwner: 'stale-template-cleaner',
				leaseUntil: cleanupLeaseUntil,
				limit: 10,
			});
			expect(claimed).toHaveLength(4);
			expect(claimed.every((intent) => intent.generation === 1)).toBe(true);

			const retry = () =>
				new ContractService(
					new ContractRepository(db),
					store,
					previewConfig(processingContext.db),
					undefined,
					() => cleanupNow
				).installPreviewReviewTemplates(admin);
			const [retryA, retryB] = await Promise.all([retry(), retry()]);
			expect(retryA).toEqual(retryB);
			expect(store.values.size).toBe(8);

			for (const stale of claimed) {
				await store.delete(stale.object_key);
				expect(
					await cleanup.completeDelete(
						stale.id,
						stale.generation,
						'stale-template-cleaner',
						cleanupNow
					)
				).toBe(true);
			}

			const intents = (
				await db.all<{
					id: string;
					object_key: string;
					generation: number;
					status: string;
				}>({
					sql: `SELECT id, object_key, generation, status
						FROM storage_object_intents
						WHERE object_kind = 'contract_template_bundle'
						ORDER BY intent_family_id, generation`,
				})
			).results;
			expect(intents.filter((intent) => intent.status === 'deleted')).toHaveLength(4);
			expect(intents.filter((intent) => intent.status === 'linked')).toHaveLength(4);
			expect(intents.filter((intent) => intent.generation === 2)).toHaveLength(4);
			expect(store.values.size).toBe(4);
			for (const linked of intents.filter((intent) => intent.status === 'linked')) {
				expect(store.values.has(linked.object_key)).toBe(true);
			}
			expect(await count(db, 'storage_intent_generations')).toBe(8);
			await expect(retry()).resolves.toEqual(retryA);
			expect(await count(db, 'storage_object_intents')).toBe(8);
			expect(store.values.size).toBe(4);
		} finally {
			await processingContext.dispose();
		}

		const deletedContext = await createMigratedTestD1();
		try {
			const db = new DatabaseBoundary(deletedContext.db);
			await seedAdmin(db);
			const store = new AtomicMemoryStore();
			store.failCreates = true;
			const failed = new ContractService(
				new ContractRepository(db),
				store,
				previewConfig(deletedContext.db),
				undefined,
				() => firstNow
			);
			await expect(failed.installPreviewReviewTemplates(admin)).rejects.toMatchObject({
				code: 'CONTRACT_TEMPLATE_BUNDLE_WRITE_UNRESOLVED',
			});

			const cleanup = new StorageIntentRepository(db);
			const claimed = await cleanup.claimCleanup({
				now: cleanupNow,
				stagedBefore: firstNow,
				leaseOwner: 'completed-template-cleaner',
				leaseUntil: cleanupLeaseUntil,
				limit: 10,
			});
			for (const intent of claimed) {
				expect(
					await cleanup.completeDelete(
						intent.id,
						intent.generation,
						'completed-template-cleaner',
						cleanupNow
					)
				).toBe(true);
			}

			store.failCreates = false;
			const retry = new ContractService(
				new ContractRepository(db),
				store,
				previewConfig(deletedContext.db),
				undefined,
				() => cleanupNow
			);
			await expect(retry.installPreviewReviewTemplates(admin)).resolves.toHaveLength(4);
			expect(
				await count(
					db,
					'storage_object_intents',
					"object_kind = 'contract_template_bundle' AND status = 'deleted' AND generation = 1"
				)
			).toBe(4);
			expect(
				await count(
					db,
					'storage_object_intents',
					"object_kind = 'contract_template_bundle' AND status = 'linked' AND generation = 2"
				)
			).toBe(4);
			expect(store.values.size).toBe(4);
			await expect(retry.installPreviewReviewTemplates(admin)).resolves.toHaveLength(4);
			expect(await count(db, 'storage_object_intents')).toBe(8);
		} finally {
			await deletedContext.dispose();
		}
	}, 240_000);
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { ContractRepository } from '$lib/server/contracts/contract-repository';
import { ContractService } from '$lib/server/contracts/contract-service';
import { ContractFamilyCorrectionContributor } from '$lib/server/contracts/boundaries';
import type { ContractArtifactStore } from '$lib/server/contracts/storage';
import { DatabaseBoundary } from '$lib/server/db/database';
import { requireAdmin } from '$lib/server/security/authorization';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const now = '2026-07-22T10:00:00.000Z';
const hash = (character: string) => character.repeat(64);
const parent: AuthenticatedUser = { id: 'parent-contract', role: 'parent', emailVerified: true,
	sessionId: 'parent-session', sessionVersion: 1, csrfHash: 'parent-csrf' };
const foreignParent: AuthenticatedUser = { id: 'foreign-contract', role: 'parent', emailVerified: true,
	sessionId: 'foreign-session', sessionVersion: 1, csrfHash: 'foreign-csrf' };
const admin = requireAdmin({ id: 'admin-contract', role: 'admin', emailVerified: true,
	sessionId: 'admin-session', sessionVersion: 1, csrfHash: 'admin-csrf' });

class MemoryStore implements ContractArtifactStore {
	readonly values = new Map<string, Uint8Array>();
	async put(key: string, body: Uint8Array) { this.values.set(key, Uint8Array.from(body)); }
	async get(key: string) {
		const value = this.values.get(key);
		return value ? { body: Uint8Array.from(value).buffer, size: value.byteLength } : null;
	}
	async delete(key: string) { this.values.delete(key); }
}

async function seed(db: DatabaseBoundary) {
	await db.batch([
		{ sql: `INSERT INTO academic_periods
			(id, code, display_name, starts_on, ends_on, is_current, created_at)
			VALUES ('period-contract', '2026-2027', '2026/2027', '2026-01-01',
				'2027-12-31', 1, ?)`, params: [now] },
		{ sql: `INSERT INTO import_runs
			(id, source_kind, academic_period_id, source_label, source_hash_sha256,
			 source_contract_id, source_contract_version, structural_fingerprint_sha256,
			 dependency_hashes_json, dependency_set_hash_sha256, run_fingerprint,
			 attempt_no, retry_of_run_id, status, started_at, validated_at, promoted_at,
			 finished_at, rows_total, rows_staged, rows_promoted, rows_skipped,
			 safe_summary_json, error_code, created_at, updated_at)
			VALUES ('run-contract', 'schedule', 'period-contract', 'synthetic', ?,
				'schedule-json', 1, ?, '{}', ?, ?, 1, NULL, 'validated', ?, ?, NULL,
				NULL, 0, 0, 0, 0, '{}', NULL, ?, ?)`,
			params: [hash('1'), hash('2'), hash('3'), hash('4'), now, now, now, now] },
		{ sql: `INSERT INTO family_number_allocations
			(id, namespace, sequence_number, display_family_id, legacy_family_id,
			 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
			 created_at, updated_at)
			VALUES ('family-contract', 'portal_2', 9101, '2. 9101', NULL,
				'parent-contract', 'portal', 'assigned', ?, NULL, ?, ?)`, params: [now, now, now] },
		{ sql: `INSERT INTO family_number_allocations
			(id, namespace, sequence_number, display_family_id, legacy_family_id,
			 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
			 created_at, updated_at)
			VALUES ('family-foreign-contract', 'portal_2', 9102, '2. 9102', NULL,
				'foreign-contract', 'portal', 'assigned', ?, NULL, ?, ?)`, params: [now, now, now] },
	]);
	for (const user of [
		['parent-contract', 'parent-contract@example.test', 'parent', 'family-contract', 'assigned', 1],
		['foreign-contract', 'foreign-contract@example.test', 'parent', 'family-foreign-contract', 'assigned', 1],
		['admin-contract', 'admin-contract@example.test', 'admin', null, 'pending_verification', 0],
	] as const) {
		await db.run({ sql: `INSERT INTO users
			(id, email, email_normalized, password_hash, email_verified_at, role,
			 first_name, last_name, first_name_normalized, last_name_normalized,
			 family_number_id, family_assignment_status, family_version,
			 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
			VALUES (?, ?, ?, 'not-used', ?, ?, 'Test', 'Person', 'test', 'person',
				?, ?, ?, 'privacy-v1', ?, ?, ?)`,
			params: [user[0], user[1], user[1], now, user[2], user[3], user[4], user[5], now, now, now] });
	}
	for (const child of [
		['child-contract', 'parent-contract', 'family-contract', 'Mária Beispiel'],
		['child-foreign-contract', 'foreign-contract', 'family-foreign-contract', 'Fremdes Kind'],
	] as const) {
		await db.run({ sql: `INSERT INTO children
			(id, owner_user_id, legacy_family_id, family_number_id, origin,
			 source_child_key, source_full_name, source_full_name_normalized,
			 source_birth_date, full_name_override, birth_date_override, full_name,
			 full_name_normalized, birth_date, last_seen_run_id, is_current,
			 created_at, updated_at)
			VALUES (?, ?, NULL, ?, 'portal', ?, ?, lower(?), '2017-03-04', NULL,
				NULL, ?, lower(?), '2017-03-04', 'run-contract', 1, ?, ?)`,
			params: [child[0], child[1], child[2], `source-${child[0]}`, child[3], child[3],
				child[3], child[3], now, now] });
	}
	await db.run({ sql: `INSERT INTO course_groups
		(id, academic_period_id, source_offering_key, display_name, normalized_price_key,
		 lesson_kind, subject, capacity_default, capacity_override,
		 requires_admin_approval, catalog_status, last_seen_schedule_version_id,
		 retired_at, created_at, updated_at)
		VALUES ('course-contract', 'period-contract', 'course-contract', 'Mathematik A',
			'mathematik', 'group', 'Mathematik', 6, NULL, 0, 'published', NULL, NULL, ?, ?)`,
		params: [now, now] });
	await db.run({ sql: `INSERT INTO individual_requests
		(id, user_id, child_id, request_kind, funding_kind, subjects_raw, description,
		 preferred_days_json, preferred_time_windows_json, preferred_format,
		 preferred_locations_json, unit_rate_cents, parent_payable, status, version,
		 create_idempotency_key, create_request_hash_sha256, admin_decision,
		 admin_notes, reviewed_by, reviewed_at, created_at, updated_at)
		VALUES ('individual-contract-request', 'parent-contract', 'child-contract',
			'individual', 'self_pay', 'Klavier', '', '[]', '[]', 'onsite', '[]',
			3000, 1, 'approved', 1, 'individual-contract-fixture', ?, 'approved',
			NULL, 'admin-contract', ?, ?, ?)`, params: [hash('8'), now, now, now] });
	await db.run({ sql: `INSERT INTO price_quotes
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
			NULL, NULL, NULL, NULL, 'quoted', ?, '2026-08-06T10:00:00.000Z')`, params: [now] });
}

function groupRenderInput() {
	return {
		schemaVersion: 'contract-render-v1' as const,
		templateId: 'group_yearly' as const,
		provider: { fullName: 'Kolibri Testverein', addressLines: ['Teststraße 1'],
			role: 'provider' as const, payerRole: false, paymentTermsVersion: 'synthetic-payment-v1' },
		parent: { fullName: 'Test Elternteil', addressLines: ['Elternweg 2'],
			role: 'contracting_parent' as const, payerRole: true },
		child: { fullName: 'Mária Beispiel', addressLines: ['Elternweg 2'],
			role: 'child' as const, payerRole: false as const, birthDate: '2017-03-04' },
		service: { relation: 'course' as const, courseGroupId: 'course-contract', requestId: null,
			requestKind: null, fundingAuthorizationId: null, subject: 'Mathematik',
			scheduleLines: ['Montag 16:00–17:30'], effectiveFrom: '2026-08-01', effectiveTo: null },
		billing: { model: 'monthly_group_fee' as const, currency: 'EUR' as const,
			unitMinutes: null, priceSource: 'excel_yearly' as const, priceMode: 'rule_derived' as const,
			basePriceCents: 4600, finalPriceCents: 4600, amountSemantics: 'base_price' as const,
			paymentArrangement: 'manual_payment' as const, paymentDueDay: 7,
			billingPeriodCode: 'calendar_month' as const,
			lineItems: [{ code: 'monthly-base', description: 'Monatlicher Grundpreis',
				amountCents: 4600, semantics: 'base_price' as const, basis: 'synthetic price rule' }],
			basePriceDisclaimer: true },
		term: { initialTermText: 'Testlaufzeit bis Periodenende.', renewalText: 'Keine feste Testverlängerung.',
			ordinaryTerminationText: 'Ordentliche Beendigung nach Vertragsprofil.',
			extraordinaryTerminationText: 'Außerordentliche Beendigung bleibt möglich.' },
		legal: { clauseSetVersion: 'synthetic-clause-v1', attachments: ['Datenschutzhinweis'],
			privacyNoticeVersion: 'privacy-v1', distanceLegalProfile: 'offline_only' as const,
			distanceLegalBasisHash: null, withdrawalTextVersion: 'synthetic-withdrawal-v1',
			earlyPerformanceRequestVersion: null, wertersatzNoticeVersion: null,
			mediaClauseVersion: 'synthetic-media-v1' },
	};
}

function individualRenderInput() {
	return {
		schemaVersion: 'contract-render-v1' as const,
		templateId: 'individual_hourly' as const,
		provider: { fullName: 'Kolibri Testverein', addressLines: ['Teststraße 1'],
			role: 'provider' as const, payerRole: false, paymentTermsVersion: 'synthetic-payment-v1' },
		parent: { fullName: 'Test Elternteil', addressLines: ['Elternweg 2'],
			role: 'contracting_parent' as const, payerRole: true },
		child: { fullName: 'Mária Beispiel', addressLines: ['Elternweg 2'],
			role: 'child' as const, payerRole: false as const, birthDate: '2017-03-04' },
		service: { relation: 'request' as const, courseGroupId: null,
			requestId: 'individual-contract-request', requestKind: 'individual' as const,
			fundingAuthorizationId: null, subject: 'Klavier', scheduleLines: [],
			effectiveFrom: '2026-08-01', effectiveTo: null },
		billing: { model: 'delivered_units' as const, currency: 'EUR' as const,
			unitMinutes: 45, priceSource: 'configured_individual_hourly' as const,
			priceMode: 'rule_derived' as const, basePriceCents: 3000, finalPriceCents: 3000,
			amountSemantics: 'unit_rate' as const, paymentArrangement: 'manual_payment' as const,
			paymentDueDay: 7, billingPeriodCode: 'per_45_minutes' as const,
			lineItems: [{ code: 'unit', description: '45 Minuten', amountCents: 3000,
				semantics: 'unit_rate' as const, basis: 'configured tariff' }], basePriceDisclaimer: false },
		term: { initialTermText: 'Ab Leistungsbeginn.', renewalText: 'Keine automatische Verlängerung.',
			ordinaryTerminationText: 'Ordentliche Beendigung gemäß Vertragsprofil.',
			extraordinaryTerminationText: 'Außerordentliche Beendigung bleibt möglich.' },
		legal: { clauseSetVersion: 'synthetic-clause-v1', attachments: ['Datenschutzhinweis'],
			privacyNoticeVersion: 'privacy-v1', distanceLegalProfile: 'offline_only' as const,
			distanceLegalBasisHash: null, withdrawalTextVersion: 'synthetic-withdrawal-v1',
			earlyPerformanceRequestVersion: null, wertersatzNoticeVersion: null,
			mediaClauseVersion: 'synthetic-media-v1' },
	};
}

describe('stage 09 immutable contract workflow in D1', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;
	let store: MemoryStore;
	let service: ContractService;
	let repository: ContractRepository;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
		await seed(db);
		store = new MemoryStore();
		const config = loadRuntimeConfig({
			APP_ENV: 'test', PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test', DB: context.db,
			R2_BUCKET: { get() {}, put() {}, delete() {} } as unknown as R2Bucket,
			CONTRACT_SEND_ENABLED: 'true', CONTRACT_RENDERER: 'synthetic_test',
		});
		repository = new ContractRepository(db);
		service = new ContractService(repository, store, config, undefined, () => now);
		await service.installSyntheticTestFixtures(admin);
	});

	afterEach(async () => context.dispose());

	async function draft(key: string) {
		return service.createDraft({ admin, requestId: `create-${key}`, payload: {
			userId: parent.id, childId: 'child-contract', academicPeriodId: 'period-contract',
			templateVersionId: 'contract-template:synthetic:group_yearly:v1',
			renderInput: groupRenderInput(), expiresAt: '2026-08-05T10:00:00.000Z',
			idempotencyKey: `create-contract-${key}`,
		} });
	}

	it('reserves permanent family numbers, renders immutable artifacts, accepts, and forms once', async () => {
		const created = await draft('full-flow');
		const draftOffer = await repository.loadOffer(created.offerId);
		expect(draftOffer).toMatchObject({ contract_number: '2. 9101-1', status: 'draft' });

		const rendered = await service.renderAndSend({ admin, offerId: created.offerId,
			idempotencyKey: 'render-contract-full-flow', requestId: 'render-full-flow' });
		expect(rendered.contractHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(store.values.size).toBe(6); // four retained template bundles + HTML + offer PDF

		await expect(service.loadOwnerOffer(foreignParent, created.offerId))
			.rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
		const decisionPayload = { offerId: created.offerId, expectedContractHash: rendered.contractHash,
			decision: 'accept', acceptanceTextVersion: 'contract-acceptance-de-v1',
			acceptanceText: 'Ich nehme genau dieses unveränderte synthetische Vertragsangebot verbindlich an.',
			idempotencyKey: 'accept-contract-full-flow' };
		const accepted = await service.parentDecision({ actor: parent, payload: decisionPayload,
			userAgent: 'vitest', requestSubject: '127.0.0.1', requestId: 'accept-full-flow' });
		expect(accepted).toMatchObject({ status: 'accepted_by_parent', replayed: false });
		expect(await service.parentDecision({ actor: parent, payload: decisionPayload,
			userAgent: 'vitest', requestSubject: '127.0.0.1', requestId: 'accept-replay' }))
			.toMatchObject({ replayed: true });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM email_outbox
			WHERE source_id = ? AND template_or_category = 'contract.accepted'`,
			params: [created.offerId],
		})).toEqual({ count: 1 });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM telegram_outbox
			WHERE source_id = ? AND template_or_category = 'bureau.contract_signal'`,
			params: [created.offerId],
		})).toEqual({ count: 1 });
		const formed = await service.formAndActivate({ admin, requestId: 'formation-full-flow', payload: {
			offerId: created.offerId, reason: 'Preis, Kapazität und Vertragsstand erneut geprüft',
			confirmation: 'confirmed', idempotencyKey: 'form-contract-full-flow',
		} });
		expect(formed).toMatchObject({ certificateReady: true, replayed: false });
		expect(await service.formAndActivate({ admin, requestId: 'formation-replay', payload: {
			offerId: created.offerId, reason: 'Preis, Kapazität und Vertragsstand erneut geprüft',
			confirmation: 'confirmed', idempotencyKey: 'form-contract-full-flow',
		} })).toMatchObject({ contractId: formed.contractId, replayed: true, certificateReady: true });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM email_outbox
			WHERE source_id = ? AND template_or_category = 'contract.formed'`,
			params: [formed.contractId],
		})).toEqual({ count: 1 });

		const enrollment = await db.first<{ status: string; active_from: string }>({
			sql: `SELECT status, active_from FROM enrollments WHERE id = ?`,
			params: [draftOffer!.enrollment_id],
		});
		expect(enrollment).toEqual({ status: 'active', active_from: '2026-08-01' });
		const artifacts = await db.all<{ artifact_kind: string }>({
			sql: `SELECT artifact_kind FROM contract_artifacts ORDER BY artifact_kind`,
		});
		expect(artifacts.results.map((row) => row.artifact_kind)).toEqual([
			'formation_certificate_pdf', 'offer_html', 'offer_pdf',
		]);
		const detail = await service.loadOwnerOffer(parent, created.offerId);
		const pdf = detail.artifacts.find((artifact) => artifact.kind === 'offer_pdf')!;
		await expect(service.downloadArtifact({ actor: foreignParent, artifactId: pdf.id,
			requestId: 'foreign-download' })).rejects.toMatchObject({ code: 'CONTRACT_ARTIFACT_NOT_FOUND' });
		await expect(service.downloadArtifact({ actor: parent, artifactId: pdf.id,
			requestId: 'owner-download' })).resolves.toMatchObject({ contentType: 'application/pdf' });
		await expect(db.run({ sql: `UPDATE contract_artifacts SET sha256 = ? WHERE id = ?`,
			params: [hash('f'), pdf.id] })).rejects.toThrow();

		const endPayload = { contractId: formed.contractId, kind: 'ordinary_termination' as const,
			requestedEffectiveOn: null, requestTextVersion: 'termination-de-v1',
			idempotencyKey: 'end-contract-full-flow' };
		const endRequest = await service.submitEndRequest({ actor: parent, payload: endPayload,
			requestId: 'end-full-flow' });
		expect(endRequest).toMatchObject({ status: 'received', replayed: false });
		expect(await service.submitEndRequest({ actor: parent, payload: endPayload,
			requestId: 'end-full-flow-replay' })).toMatchObject({ requestId: endRequest.requestId,
			replayed: true });
		expect(await db.first<{ count: number }>({
			sql: `SELECT COUNT(*) AS count FROM email_outbox
			WHERE source_id = ? AND template_or_category = 'contract.termination.received'`,
			params: [endRequest.requestId],
		})).toEqual({ count: 1 });
		await expect(service.submitEndRequest({ actor: foreignParent, payload: endPayload,
			requestId: 'end-cross-owner' })).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
		expect(await db.first<{ auto_renewal_blocked_at: string | null }>({
			sql: `SELECT auto_renewal_blocked_at FROM contracts WHERE id = ?`,
			params: [formed.contractId],
		})).toEqual({ auto_renewal_blocked_at: now });
		const reviewPayload = { endRequestId: endRequest.requestId,
			decision: 'effective_date_confirmed' as const, effectiveOn: '2027-07-31',
			reason: 'Contractual end date verified.', externalDebtCheckResult: 'not_checked' as const,
			idempotencyKey: 'review-end-contract-full-flow' };
		const reviewed = await service.reviewEndRequest({ admin, payload: reviewPayload,
			requestId: 'review-end-full-flow' });
		expect(reviewed).toMatchObject({ status: 'effective_date_confirmed', replayed: false });
		expect(await service.reviewEndRequest({ admin, payload: reviewPayload,
			requestId: 'review-end-replay' })).toMatchObject({ endRequestId: endRequest.requestId,
			replayed: true });
		await expect(service.reviewEndRequest({ admin, payload: { ...reviewPayload,
			decision: 'approved', idempotencyKey: 'invalid-review-end-contract' },
			requestId: 'invalid-review-end' })).rejects.toMatchObject({
			code: 'TERMINATION_REVIEW_STATE_REJECTED',
		});
	});

	it('does not reuse numbers and rejects a queued parent action after account closure starts', async () => {
		const first = await draft('number-one');
		const second = await draft('number-two');
		expect((await repository.loadOffer(first.offerId))?.contract_number).toBe('2. 9101-1');
		expect((await repository.loadOffer(second.offerId))?.contract_number).toBe('2. 9101-2');
		expect(await draft('number-two')).toEqual({ offerId: second.offerId, replayed: true });
		const sent = await service.renderAndSend({ admin, offerId: second.offerId,
			idempotencyKey: 'render-number-two', requestId: 'render-number-two' });
		const priceRace = await service.createDraft({ admin, requestId: 'create-price-race',
			payload: { userId: parent.id, childId: 'child-contract', academicPeriodId: 'period-contract',
				templateVersionId: 'contract-template:synthetic:group_yearly:v1',
				renderInput: groupRenderInput(), priceQuoteId: 'group-contract-quote',
				expiresAt: '2026-08-05T10:00:00.000Z', idempotencyKey: 'create-price-race' } });
		const priceRaceRendered = await service.renderAndSend({ admin, offerId: priceRace.offerId,
			idempotencyKey: 'render-price-race', requestId: 'render-price-race' });
		await service.parentDecision({ actor: parent, payload: { offerId: priceRace.offerId,
			expectedContractHash: priceRaceRendered.contractHash, decision: 'accept',
			acceptanceTextVersion: 'contract-acceptance-de-v1',
			acceptanceText: 'Ich nehme dieses unveränderte Angebot für den Preis-Race-Test verbindlich an.',
			idempotencyKey: 'accept-price-race' }, userAgent: 'vitest',
			requestSubject: '127.0.0.4', requestId: 'accept-price-race' });
		await db.run({ sql: `UPDATE price_quotes SET status = 'stale' WHERE id = 'group-contract-quote'` });
		await expect(service.formAndActivate({ admin, requestId: 'form-price-race', payload: {
			offerId: priceRace.offerId, reason: 'Attempt after quote changed.', confirmation: 'confirmed',
			idempotencyKey: 'form-price-race' } })).rejects.toMatchObject({
			code: 'GROUP_PRICE_REVALIDATION_FAILED',
		});
		await db.run({ sql: `UPDATE users SET account_status = 'deletion_requested', updated_at = ?
			WHERE id = ?`, params: [now, parent.id] });
		await expect(service.parentDecision({ actor: parent, payload: {
			offerId: second.offerId, expectedContractHash: sent.contractHash, decision: 'accept',
			acceptanceTextVersion: 'contract-acceptance-de-v1',
			acceptanceText: 'Ich nehme dieses unveränderte Vertragsangebot verbindlich an.',
			idempotencyKey: 'closed-account-accept' }, userAgent: 'vitest',
			requestSubject: '127.0.0.2', requestId: 'closed-account' }))
			.rejects.toMatchObject({ code: 'CONTRACT_PARENT_DECISION_REJECTED' });
	});

	it('keeps media choice separate, permits decline, and fails closed for online grant/public functions', async () => {
		const base = {
			childId: 'child-contract', captureScopes: ['photo'] as const,
			publicationChannels: ['website'] as const, textVersion: 'synthetic-media-text-v1',
			withdrawalContactVersionId: 'media-contact:synthetic-v1',
		};
		const declined = await service.recordMediaDecision({ actor: parent, requestId: 'media-decline',
			payload: { ...base, decision: 'declined', idempotencyKey: 'media-decline-contract' } });
		expect(declined.replayed).toBe(false);
		expect(await service.recordMediaDecision({ actor: parent, requestId: 'media-decline-replay',
			payload: { ...base, decision: 'declined', idempotencyKey: 'media-decline-contract' } }))
			.toEqual({ consentId: declined.consentId, replayed: true });
		await expect(service.recordMediaDecision({ actor: parent, requestId: 'media-grant',
			payload: { ...base, decision: 'granted', idempotencyKey: 'media-grant-contract' } }))
			.rejects.toMatchObject({ code: 'MEDIA_ONLINE_GRANT_DISABLED' });
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
			params: [parent.id, 'child-contract', now, now, now, parent.id, now, hash('9'), now,
				'media-contact:synthetic-v1'],
		});
		const withdrawalPayload = { ownerUserId: parent.id, childId: 'child-contract',
			captureScopes: ['photo'], publicationChannels: ['website'], channel: 'email',
			receivedAt: '2026-07-21T08:00:00.000Z', evidenceSummary: 'Verified sender and scope.',
			idempotencyKey: 'media-withdrawal-contract' };
		const withdrawal = await service.recordMediaWithdrawal({ admin,
			payload: withdrawalPayload, requestId: 'media-withdrawal' });
		expect(withdrawal.replayed).toBe(false);
		expect(await service.recordMediaWithdrawal({ admin, payload: withdrawalPayload,
			requestId: 'media-withdrawal-replay' })).toEqual({ consentId: withdrawal.consentId,
			replayed: true });
		expect(await db.first<{ effective_from: string; decision: string }>({
			sql: `SELECT effective_from, decision FROM media_consents WHERE id = ?`,
			params: [withdrawal.consentId],
		})).toEqual({ effective_from: withdrawalPayload.receivedAt, decision: 'revoked' });
		expect(() => service.submitPublicEndRequest({})).toThrowError('PUBLIC_CONTRACT_FUNCTION_DISABLED');
	});

	it('ends future individual attendance separately and creates the teacher task', async () => {
		const created = await service.createDraft({ admin, requestId: 'create-individual-contract',
			payload: { userId: parent.id, childId: 'child-contract', academicPeriodId: 'period-contract',
				templateVersionId: 'contract-template:synthetic:individual_hourly:v1',
				renderInput: individualRenderInput(), expiresAt: '2026-08-05T10:00:00.000Z',
				idempotencyKey: 'create-individual-contract' } });
		const rendered = await service.renderAndSend({ admin, offerId: created.offerId,
			idempotencyKey: 'render-individual-contract', requestId: 'render-individual-contract' });
		await service.parentDecision({ actor: parent, payload: { offerId: created.offerId,
			expectedContractHash: rendered.contractHash, decision: 'accept',
			acceptanceTextVersion: 'contract-acceptance-de-v1',
			acceptanceText: 'Ich nehme dieses unveränderte individuelle Vertragsangebot verbindlich an.',
			idempotencyKey: 'accept-individual-contract' }, userAgent: 'vitest',
			requestSubject: '127.0.0.3', requestId: 'accept-individual-contract' });
		const formed = await service.formAndActivate({ admin, requestId: 'form-individual-contract',
			payload: { offerId: created.offerId, reason: 'Tariff and service revalidated.',
				confirmation: 'confirmed', idempotencyKey: 'form-individual-contract' } });
		const notice = await service.submitAttendanceNotice({ actor: parent,
			payload: { contractId: formed.contractId, noticeTextVersion: 'attendance-ceased-de-v1',
				idempotencyKey: 'attendance-individual-contract' }, requestId: 'attendance-individual' });
		expect(notice.replayed).toBe(false);
		expect(await db.first<{ status: string; attendance_ceased_at: string }>({
			sql: `SELECT status, attendance_ceased_at FROM service_engagements WHERE contract_id = ?`,
			params: [formed.contractId],
		})).toEqual({ status: 'ended', attendance_ceased_at: now });
		expect(await db.first<{ kind: string; status: string }>({
			sql: `SELECT task.kind, task.status FROM admin_review_tasks task
			JOIN service_attendance_notices notice ON notice.teacher_notification_task_id = task.id
			WHERE notice.id = ?`, params: [notice.noticeId],
		})).toEqual({ kind: 'contract_attendance', status: 'open' });
		expect(await service.submitAttendanceNotice({ actor: parent,
			payload: { contractId: formed.contractId, noticeTextVersion: 'attendance-ceased-de-v1',
				idempotencyKey: 'attendance-individual-contract' }, requestId: 'attendance-replay' }))
			.toEqual({ noticeId: notice.noticeId, replayed: true });
	});

	it('supersedes old-family offers while preserving numbers and moving only future reservations', async () => {
		const oldOffer = await draft('family-before-correction');
		const oldNumber = (await repository.loadOffer(oldOffer.offerId))!.contract_number;
		await db.batch([
			{ sql: `INSERT INTO family_number_allocations
				(id, namespace, sequence_number, display_family_id, legacy_family_id,
				 owner_user_id, origin, status, assigned_at, merged_into_family_number_id,
				 created_at, updated_at)
				VALUES ('family-contract-destination', 'portal_2', 9201, '2. 9201', NULL,
					NULL, 'portal', 'pending', NULL, NULL, ?, ?)`, params: [now, now] },
			{ sql: `INSERT INTO family_reassignments
				(id, user_id, from_family_number_id, to_family_number_id, source,
				 reason_code, reason_note, requested_by, confirmed_by, idempotency_key,
				 family_version_before, status, safe_effects_json, created_at, applied_at, updated_at)
				VALUES ('contract-family-reassignment', ?, 'family-contract',
					'family-contract-destination', 'admin_correction', 'verified_correction',
					'Verified destination and family evidence.', ?, ?, 'contract-family-reassignment',
					1, 'applied', '{}', ?, ?, ?)`,
				params: [parent.id, admin.id, admin.id, now, now, now] },
		]);
		const contributor = new ContractFamilyCorrectionContributor(db);
		const preview = await contributor.preview({ userId: parent.id,
			fromFamilyNumberId: 'family-contract', toFamilyNumberId: 'family-contract-destination' });
		expect(preview).toMatchObject({ nonterminalOfferCount: 1, immutableContractCount: 0 });
		await db.batch(await contributor.applyStatements({ previewId: 'synthetic-preview',
			reassignmentId: 'contract-family-reassignment', userId: parent.id,
			fromFamilyNumberId: 'family-contract', toFamilyNumberId: 'family-contract-destination', now }));
		expect(await repository.loadOffer(oldOffer.offerId)).toMatchObject({
			status: 'superseded', contract_number: oldNumber,
		});
		await db.batch([
			{ sql: `UPDATE family_number_allocations SET status = 'retired', owner_user_id = NULL,
				updated_at = ? WHERE id = 'family-contract'`, params: [now] },
			{ sql: `UPDATE family_number_allocations SET status = 'assigned', owner_user_id = ?,
				assigned_at = ?, updated_at = ? WHERE id = 'family-contract-destination'`,
				params: [parent.id, now, now] },
			{ sql: `UPDATE users SET family_number_id = 'family-contract-destination',
				family_version = 2, updated_at = ? WHERE id = ?`, params: [now, parent.id] },
			{ sql: `UPDATE children SET family_number_id = 'family-contract-destination',
				updated_at = ? WHERE owner_user_id = ?`, params: [now, parent.id] },
		]);
		const future = await draft('family-after-correction');
		expect((await repository.loadOffer(future.offerId))!.contract_number).toBe('2. 9201-1');
		expect((await repository.loadOffer(oldOffer.offerId))!.contract_number).toBe(oldNumber);
	});
});

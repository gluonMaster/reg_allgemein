import type { AuthenticatedUser } from '$lib/server/auth/session';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import { hashCanonical } from '$lib/server/import/canonical';
import { repricingLookupChildrenCount } from '$lib/server/pricing/decisions';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import type { AdminActor } from '$lib/server/security/authorization';
import { calendarDayAfter } from '$lib/server/time/berlin';
import type { ContractRenderInput, ContractTemplateId } from './contracts';
import type { ContractArtifactDownloadPurpose } from '$lib/server/security/download-purpose';

export class ContractRepositoryError extends Error {
	constructor(
		readonly code: string,
		options?: { cause?: unknown }
	) {
		super(code, options);
		this.name = 'ContractRepositoryError';
	}
}

export interface StoredContractOffer {
	id: string;
	series_id: string;
	version: number;
	offer_number: string;
	contract_number: string;
	user_id: string;
	child_id: string;
	family_number_id_at_issue: string;
	family_display_id_at_issue: string;
	family_version_at_issue: number;
	academic_period_id: string;
	course_group_id: string | null;
	individual_request_id: string | null;
	funding_authorization_id: string | null;
	enrollment_id: string | null;
	service_engagement_id: string | null;
	price_quote_id: string | null;
	price_version_id: string | null;
	price_rule_id: string | null;
	contract_kind: ContractTemplateId;
	template_version_id: string;
	render_schema_version: string;
	effective_from: string;
	effective_to: string | null;
	price_cents: number;
	base_price_cents: number;
	price_source: string;
	price_mode: string;
	payment_arrangement: 'existing_external_sepa' | 'manual_payment' | 'not_applicable';
	render_input_json: string;
	render_input_hash: string;
	source_manifest_json: string;
	source_manifest_hash: string;
	render_status: 'not_started' | 'rendering' | 'ready' | 'failed';
	status:
		| 'draft'
		| 'sent'
		| 'accepted_by_parent'
		| 'declined_by_parent'
		| 'approved_by_admin'
		| 'cancelled'
		| 'expired'
		| 'superseded';
	contract_html_r2_key: string | null;
	contract_pdf_r2_key: string | null;
	contract_hash: string | null;
	expires_at: string;
	sent_at: string | null;
	accepted_at: string | null;
	admin_approved_at: string | null;
	created_at: string;
}

export interface StoredTemplateVersion {
	id: string;
	template_id: ContractTemplateId;
	template_version: string;
	render_schema_version: string;
	clause_set_version: string;
	template_bundle_r2_key: string;
	bundle_hash: string;
	html_source_hash: string;
	css_source_hash: string;
	renderer_id: 'synthetic-test-pdf-v1' | 'cloudflare-browser-run-pdf-v1';
	renderer_contract_version: string;
	worker_compatibility_date: string;
	usage_scope: 'synthetic_test' | 'preview_review' | 'production';
	approval_status: 'draft' | 'approved' | 'retired';
	approval_basis:
		| 'synthetic_fixture'
		| 'internal_preview_review'
		| 'authorized_verein_approval'
		| 'legal_review';
	distance_legal_profile:
		'offline_only' | 'widerruf_applicable' | 'widerruf_not_applicable_312g_2_9';
	distance_legal_basis_hash: string | null;
	kuendigung_function_required: 0 | 1;
	early_performance_supported: 0 | 1;
	media_contact_version_id: string | null;
	provider_version_id: string;
	provider_snapshot_json: string;
	provider_payment_terms_hash: string;
	media_contact_snapshot_hash: string | null;
	asset_manifest_json: string;
	font_manifest_json: string;
	required_fields_json: string;
	provider_approval_status: string;
	media_contact_approval_status: string | null;
}

export interface ContractTemplateInstallRecord {
	id: string;
	templateId: ContractTemplateId;
	templateVersion: string;
	renderSchemaVersion: string;
	clauseSetVersion: string;
	bundleKey: string;
	bundleHash: string;
	bundleSizeBytes: number;
	htmlSourceHash: string;
	cssSourceHash: string;
	assetManifestJson: string;
	fontManifestJson: string;
	requiredFieldsJson: string;
	rendererId: 'synthetic-test-pdf-v1' | 'cloudflare-browser-run-pdf-v1';
	rendererContractVersion: string;
	workerCompatibilityDate: string;
	usageScope: 'synthetic_test' | 'preview_review';
	approvalBasis: 'synthetic_fixture' | 'internal_preview_review';
	distanceLegalProfile: 'offline_only' | 'widerruf_applicable';
	distanceLegalBasisVersion: string | null;
	distanceLegalBasisHash: string | null;
	kuendigungFunctionRequired: 0 | 1;
	earlyPerformanceSupported: 0 | 1;
	storageIntentId: string;
	storageIntentGeneration: number;
	storageIntentSourceRef: string;
}

export interface StagedTemplateBundleIntent {
	id: string;
	objectKey: string;
	generation: number;
}

function templateBundleGenerationKey(baseKey: string, generation: number): string {
	if (generation === 1) return baseKey;
	const extensionIndex = baseKey.lastIndexOf('.');
	if (extensionIndex <= baseKey.lastIndexOf('/')) {
		return `${baseKey}.generation-${generation}`;
	}
	return `${baseKey.slice(0, extensionIndex)}.generation-${generation}${baseKey.slice(extensionIndex)}`;
}

function templateBundleGenerationId(familyId: string, generation: number): string {
	return generation === 1 ? familyId : `${familyId}:generation:${generation}`;
}

interface ContractTemplateSetInstall {
	admin: AdminActor;
	provider: {
		id: string;
		version: string;
		snapshotJson: string;
		paymentTermsVersion: string;
		paymentTermsHash: string;
	};
	mediaContact: {
		id: string;
		version: string;
		snapshotJson: string;
		snapshotHash: string;
		germanTextVersion: string;
		complianceStatus: 'not_assessed';
	};
	templates: readonly ContractTemplateInstallRecord[];
	audit: {
		id: string;
		action: string;
		targetId: string;
		requestId: string;
		safeDiffJson: string;
	};
	now: string;
}

interface NumberContext {
	user_id: string;
	child_id: string;
	family_number_id: string;
	family_display_id: string;
	family_version: number;
	next_contract_sequence: number;
	sequence_exists: number;
}

export interface DraftOfferPersistence {
	id: string;
	seriesId: string;
	offerNumber: string;
	contractNumber: string;
	userId: string;
	childId: string;
	academicPeriodId: string;
	template: StoredTemplateVersion;
	renderInput: ContractRenderInput;
	renderInputHash: string;
	sourceManifestJson: string;
	sourceManifestHash: string;
	expiresAt: string;
	requestId: string;
	admin: AdminActor;
	idempotencyKey: string;
	requestHash: string;
	service: {
		courseGroupId: string | null;
		individualRequestId: string | null;
		fundingAuthorizationId: string | null;
		enrollmentId: string | null;
		serviceEngagementId: string | null;
		lessonKind: 'group' | 'dance_group' | null;
	};
	pricing: {
		priceQuoteId: string | null;
		priceVersionId: string | null;
		priceRuleId: string | null;
	};
	manualOverride: {
		reason: string;
		responsibilityConfirmed: true;
	} | null;
	now: string;
}

const ACTIVE_ADMIN = `EXISTS (SELECT 1 FROM users admin WHERE admin.id = ?
	AND admin.role = 'admin' AND admin.account_status = 'active' AND admin.is_blocked = 0)`;

export class ContractRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async stageTemplateBundleIntent(input: {
		id: string;
		objectKey: string;
		sourceRef: string;
		sha256: string;
		sizeBytes: number;
		now: string;
		installerOwner: string;
		installerLeaseUntil: string;
	}): Promise<StagedTemplateBundleIntent> {
		try {
			await this.db.run({
				sql: `INSERT OR IGNORE INTO storage_object_intents
					(id, storage_class, object_key, object_kind, source_ref, sha256,
					 size_bytes, status, attempts, created_at, updated_at,
					 intent_family_id, generation, installer_owner, installer_lease_until)
				VALUES (?, 'archive', ?, 'contract_template_bundle', ?, ?, ?,
					'staged', 0, ?, ?, ?, 1, ?, ?)`,
				params: [
					input.id,
					input.objectKey,
					input.sourceRef,
					input.sha256,
					input.sizeBytes,
					input.now,
					input.now,
					input.id,
					input.installerOwner,
					input.installerLeaseUntil,
				],
			});
		} catch (cause) {
			throw new ContractRepositoryError('CONTRACT_TEMPLATE_INTENT_STAGE_REJECTED', { cause });
		}
		const family = await this.db.all<{
			id: string;
			storage_class: string;
			object_key: string;
			object_kind: string;
			source_ref: string | null;
			sha256: string;
			size_bytes: number;
			status: string;
			intent_family_id: string | null;
			generation: number;
			installer_lease_until: string | null;
		}>({
			sql: `SELECT id, storage_class, object_key, object_kind, source_ref,
				sha256, size_bytes, status, intent_family_id, generation,
				installer_lease_until
			FROM storage_object_intents
			WHERE intent_family_id = ? OR id = ?
			ORDER BY generation DESC, id DESC`,
			params: [input.id, input.id],
		});
		if (family.results.length === 0) {
			throw new ContractRepositoryError('CONTRACT_TEMPLATE_INTENT_CONFLICT');
		}
		for (const generation of family.results) {
			if (
				generation.intent_family_id !== input.id ||
				generation.storage_class !== 'archive' ||
				generation.object_key !==
					templateBundleGenerationKey(input.objectKey, generation.generation) ||
				generation.object_kind !== 'contract_template_bundle' ||
				generation.source_ref !== input.sourceRef ||
				generation.sha256 !== input.sha256 ||
				generation.size_bytes !== input.sizeBytes
			) {
				throw new ContractRepositoryError('CONTRACT_TEMPLATE_INTENT_CONFLICT');
			}
		}
		const linked = family.results.find((generation) => generation.status === 'linked');
		if (linked) {
			return { id: linked.id, objectKey: linked.object_key, generation: linked.generation };
		}
		const latest = family.results[0];
		if (
			latest.status === 'staged' &&
			latest.installer_lease_until !== null &&
			latest.installer_lease_until > input.now
		) {
			return { id: latest.id, objectKey: latest.object_key, generation: latest.generation };
		}

		const nextGeneration = latest.generation + 1;
		const next = {
			id: templateBundleGenerationId(input.id, nextGeneration),
			objectKey: templateBundleGenerationKey(input.objectKey, nextGeneration),
			generation: nextGeneration,
		};
		try {
			await this.db.run({
				sql: `INSERT OR IGNORE INTO storage_object_intents
					(id, storage_class, object_key, object_kind, source_ref, sha256,
					 size_bytes, status, attempts, created_at, updated_at,
					 intent_family_id, generation, installer_owner, installer_lease_until)
				VALUES (?, 'archive', ?, 'contract_template_bundle', ?, ?, ?,
					'staged', 0, ?, ?, ?, ?, ?, ?)`,
				params: [
					next.id,
					next.objectKey,
					input.sourceRef,
					input.sha256,
					input.sizeBytes,
					input.now,
					input.now,
					input.id,
					next.generation,
					input.installerOwner,
					input.installerLeaseUntil,
				],
			});
		} catch (cause) {
			throw new ContractRepositoryError('CONTRACT_TEMPLATE_INTENT_STAGE_REJECTED', { cause });
		}
		const authoritative = await this.db.first<{
			id: string;
			object_key: string;
			generation: number;
			status: string;
			source_ref: string | null;
			sha256: string;
			size_bytes: number;
		}>({
			sql: `SELECT id, object_key, generation, status, source_ref, sha256, size_bytes
			FROM storage_object_intents
			WHERE intent_family_id = ? AND generation = ?`,
			params: [input.id, nextGeneration],
		});
		if (
			!authoritative ||
			authoritative.id !== next.id ||
			authoritative.object_key !== next.objectKey ||
			authoritative.status !== 'staged' ||
			authoritative.source_ref !== input.sourceRef ||
			authoritative.sha256 !== input.sha256 ||
			authoritative.size_bytes !== input.sizeBytes
		) {
			throw new ContractRepositoryError('CONTRACT_TEMPLATE_INTENT_CONFLICT');
		}
		return next;
	}

	private templateSetExactCondition(
		input: ContractTemplateSetInstall,
		includeFinalAssertion: boolean
	): { sql: string; params: unknown[] } {
		const conditions: string[] = [];
		const params: unknown[] = [];
		const expected = (value: Record<string, unknown>) => {
			params.push(JSON.stringify(value));
			return `CROSS JOIN (SELECT ? AS value) expected`;
		};
		conditions.push(`EXISTS (SELECT 1 FROM contract_provider_versions provider
			${expected({
				id: input.provider.id,
				version: input.provider.version,
				snapshot: input.provider.snapshotJson,
				paymentVersion: input.provider.paymentTermsVersion,
				paymentHash: input.provider.paymentTermsHash,
			})}
			WHERE provider.id = json_extract(expected.value, '$.id')
				AND provider.version = json_extract(expected.value, '$.version')
				AND provider.provider_snapshot_json = json_extract(expected.value, '$.snapshot')
				AND provider.payment_terms_version = json_extract(expected.value, '$.paymentVersion')
				AND provider.payment_terms_hash = json_extract(expected.value, '$.paymentHash')
				AND provider.approval_status = 'approved'
				AND provider.approved_by IS NOT NULL AND provider.approved_at IS NOT NULL)`);
		conditions.push(`EXISTS (SELECT 1 FROM media_withdrawal_contact_versions contact
			${expected({
				id: input.mediaContact.id,
				version: input.mediaContact.version,
				snapshot: input.mediaContact.snapshotJson,
				snapshotHash: input.mediaContact.snapshotHash,
				textVersion: input.mediaContact.germanTextVersion,
				complianceStatus: input.mediaContact.complianceStatus,
			})}
			WHERE contact.id = json_extract(expected.value, '$.id')
				AND contact.version = json_extract(expected.value, '$.version')
				AND contact.contact_snapshot_json = json_extract(expected.value, '$.snapshot')
				AND contact.snapshot_hash = json_extract(expected.value, '$.snapshotHash')
				AND contact.german_text_version = json_extract(expected.value, '$.textVersion')
				AND contact.compliance_assessment_status = json_extract(expected.value, '$.complianceStatus')
				AND contact.approval_status = 'approved'
				AND contact.approved_by IS NOT NULL AND contact.approved_at IS NOT NULL)`);
		for (const template of input.templates) {
			conditions.push(`EXISTS (SELECT 1 FROM contract_template_versions template
				${expected({
					id: template.id,
					templateId: template.templateId,
					templateVersion: template.templateVersion,
					renderSchemaVersion: template.renderSchemaVersion,
					clauseSetVersion: template.clauseSetVersion,
					providerId: input.provider.id,
					mediaId: input.mediaContact.id,
					bundleKey: template.bundleKey,
					bundleHash: template.bundleHash,
					htmlSourceHash: template.htmlSourceHash,
					cssSourceHash: template.cssSourceHash,
					assetManifest: template.assetManifestJson,
					fontManifest: template.fontManifestJson,
					requiredFields: template.requiredFieldsJson,
					rendererId: template.rendererId,
					rendererContractVersion: template.rendererContractVersion,
					workerCompatibilityDate: template.workerCompatibilityDate,
					usageScope: template.usageScope,
					approvalBasis: template.approvalBasis,
					distanceLegalProfile: template.distanceLegalProfile,
					distanceLegalBasisVersion: template.distanceLegalBasisVersion,
					distanceLegalBasisHash: template.distanceLegalBasisHash,
					kuendigungRequired: template.kuendigungFunctionRequired,
					earlyPerformance: template.earlyPerformanceSupported,
				})}
				WHERE template.id = json_extract(expected.value, '$.id')
					AND template.template_id = json_extract(expected.value, '$.templateId')
					AND template.template_version = json_extract(expected.value, '$.templateVersion')
					AND template.render_schema_version = json_extract(expected.value, '$.renderSchemaVersion')
					AND template.clause_set_version = json_extract(expected.value, '$.clauseSetVersion')
					AND template.provider_version_id = json_extract(expected.value, '$.providerId')
					AND template.media_contact_version_id = json_extract(expected.value, '$.mediaId')
					AND template.template_bundle_r2_key = json_extract(expected.value, '$.bundleKey')
					AND template.bundle_hash = json_extract(expected.value, '$.bundleHash')
					AND template.html_source_hash = json_extract(expected.value, '$.htmlSourceHash')
					AND template.css_source_hash = json_extract(expected.value, '$.cssSourceHash')
					AND template.asset_manifest_json = json_extract(expected.value, '$.assetManifest')
					AND template.font_manifest_json = json_extract(expected.value, '$.fontManifest')
					AND template.required_fields_json = json_extract(expected.value, '$.requiredFields')
					AND template.renderer_id = json_extract(expected.value, '$.rendererId')
					AND template.renderer_contract_version = json_extract(expected.value, '$.rendererContractVersion')
					AND template.worker_compatibility_date = json_extract(expected.value, '$.workerCompatibilityDate')
					AND template.usage_scope = json_extract(expected.value, '$.usageScope')
					AND template.approval_status = 'approved'
					AND template.approval_basis = json_extract(expected.value, '$.approvalBasis')
					AND template.distance_legal_profile = json_extract(expected.value, '$.distanceLegalProfile')
					AND template.distance_legal_basis_version IS json_extract(expected.value, '$.distanceLegalBasisVersion')
					AND template.distance_legal_basis_hash IS json_extract(expected.value, '$.distanceLegalBasisHash')
					AND template.kuendigung_function_required = json_extract(expected.value, '$.kuendigungRequired')
					AND template.early_performance_supported = json_extract(expected.value, '$.earlyPerformance')
					AND template.approved_by IS NOT NULL AND template.approved_at IS NOT NULL)`);
			conditions.push(`EXISTS (SELECT 1 FROM storage_object_intents intent
				${expected({
					id: template.storageIntentId,
					key: template.bundleKey,
					sourceRef: template.storageIntentSourceRef,
					sha256: template.bundleHash,
					size: template.bundleSizeBytes,
					generation: template.storageIntentGeneration,
				})}
				WHERE intent.id = json_extract(expected.value, '$.id')
					AND intent.storage_class = 'archive'
					AND intent.object_key = json_extract(expected.value, '$.key')
					AND intent.object_kind = 'contract_template_bundle'
					AND intent.source_ref = json_extract(expected.value, '$.sourceRef')
					AND intent.sha256 = json_extract(expected.value, '$.sha256')
					AND intent.size_bytes = json_extract(expected.value, '$.size')
					AND intent.generation = json_extract(expected.value, '$.generation')
					AND intent.status = 'linked')`);
		}
		conditions.push(`EXISTS (SELECT 1 FROM audit_events audit
			JOIN users audit_admin ON audit_admin.id = audit.actor_user_id
			${expected({
				id: input.audit.id,
				action: input.audit.action,
				targetId: input.audit.targetId,
				requestId: input.audit.requestId,
				safeDiff: input.audit.safeDiffJson,
			})}
			WHERE audit.id = json_extract(expected.value, '$.id')
				AND audit.actor_kind = 'user'
				AND audit.action = json_extract(expected.value, '$.action')
				AND audit.target_kind = 'contract_template_set'
				AND audit.target_id = json_extract(expected.value, '$.targetId')
				AND audit.request_id = json_extract(expected.value, '$.requestId')
				AND audit.safe_diff_json = json_extract(expected.value, '$.safeDiff')
				AND audit_admin.role = 'admin')`);
		const assertedTemplates = includeFinalAssertion
			? input.templates
			: input.templates.slice(0, -1);
		for (const template of assertedTemplates) {
			conditions.push(`EXISTS (SELECT 1 FROM storage_intent_link_assertions assertion
				${expected({
					id: `storage-link:${template.storageIntentId}`,
					intentId: template.storageIntentId,
					targetId: template.id,
				})}
				WHERE assertion.id = json_extract(expected.value, '$.id')
					AND assertion.intent_id = json_extract(expected.value, '$.intentId')
					AND assertion.target_kind = 'contract_template_version'
					AND assertion.target_id = json_extract(expected.value, '$.targetId')
					AND assertion.assertion_passed = 1)`);
		}
		return { sql: conditions.map((condition) => `(${condition})`).join(' AND '), params };
	}

	private async templateSetInstalledExactly(input: ContractTemplateSetInstall): Promise<boolean> {
		const exact = this.templateSetExactCondition(input, true);
		const row = await this.db.first<{ exact: number }>({
			sql: `SELECT CASE WHEN ${exact.sql} THEN 1 ELSE 0 END AS exact`,
			params: exact.params,
		});
		return row?.exact === 1;
	}

	async installTemplateSetAtomic(input: ContractTemplateSetInstall): Promise<string[]> {
		if (
			input.templates.length !== 4 ||
			new Set(input.templates.map((item) => item.id)).size !== 4
		) {
			throw new ContractRepositoryError('CONTRACT_TEMPLATE_INSTALL_SET_INVALID');
		}
		if (await this.templateSetInstalledExactly(input)) {
			return input.templates.map((template) => template.id);
		}
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO contract_provider_versions
					(id, version, provider_snapshot_json, payment_terms_version,
					 payment_terms_hash, approval_status, approved_by, approved_at, created_at)
				SELECT ?, ?, ?, ?, ?, 'approved', ?, ?, ? WHERE ${ACTIVE_ADMIN}`,
				params: [
					input.provider.id,
					input.provider.version,
					input.provider.snapshotJson,
					input.provider.paymentTermsVersion,
					input.provider.paymentTermsHash,
					input.admin.id,
					input.now,
					input.now,
					input.admin.id,
				],
			},
			{
				sql: `INSERT INTO media_withdrawal_contact_versions
					(id, version, contact_snapshot_json, snapshot_hash, german_text_version,
					 approval_status, compliance_assessment_status, approved_by, approved_at, created_at)
				SELECT ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ? WHERE ${ACTIVE_ADMIN}`,
				params: [
					input.mediaContact.id,
					input.mediaContact.version,
					input.mediaContact.snapshotJson,
					input.mediaContact.snapshotHash,
					input.mediaContact.germanTextVersion,
					input.mediaContact.complianceStatus,
					input.admin.id,
					input.now,
					input.now,
					input.admin.id,
				],
			},
			...input.templates.map<StatementSpec>((template) => ({
				sql: `INSERT INTO contract_template_versions
					(id, template_id, template_version, render_schema_version, clause_set_version,
					 provider_version_id, media_contact_version_id, template_bundle_r2_key,
					 bundle_hash, html_source_hash, css_source_hash, asset_manifest_json,
					 font_manifest_json, required_fields_json, renderer_id,
					 renderer_contract_version, worker_compatibility_date, usage_scope,
					 approval_status, approval_basis, distance_legal_profile,
					 distance_legal_basis_version, distance_legal_basis_hash,
					 kuendigung_function_required, early_performance_supported,
					 approved_by, approved_at, valid_from, valid_to, created_at)
				SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?,
					?, ?, ?, ?, ?, ?, NULL, NULL, ? WHERE ${ACTIVE_ADMIN}
					AND EXISTS (SELECT 1 FROM contract_provider_versions WHERE id = ?)
					AND EXISTS (SELECT 1 FROM media_withdrawal_contact_versions WHERE id = ?)`,
				params: [
					template.id,
					template.templateId,
					template.templateVersion,
					template.renderSchemaVersion,
					template.clauseSetVersion,
					input.provider.id,
					input.mediaContact.id,
					template.bundleKey,
					template.bundleHash,
					template.htmlSourceHash,
					template.cssSourceHash,
					template.assetManifestJson,
					template.fontManifestJson,
					template.requiredFieldsJson,
					template.rendererId,
					template.rendererContractVersion,
					template.workerCompatibilityDate,
					template.usageScope,
					template.approvalBasis,
					template.distanceLegalProfile,
					template.distanceLegalBasisVersion,
					template.distanceLegalBasisHash,
					template.kuendigungFunctionRequired,
					template.earlyPerformanceSupported,
					input.admin.id,
					input.now,
					input.now,
					input.admin.id,
					input.provider.id,
					input.mediaContact.id,
				],
			})),
			...input.templates.map<StatementSpec>((template) => ({
				sql: `UPDATE storage_object_intents SET status = 'linked', linked_at = ?,
					updated_at = ?, lease_owner = NULL, lease_until = NULL,
					installer_owner = NULL, installer_lease_until = NULL, last_error_code = NULL
				WHERE id = ? AND status IN ('staged','delete_pending')
					AND storage_class = 'archive' AND object_key = ?
					AND object_kind = 'contract_template_bundle' AND source_ref = ?
					AND sha256 = ? AND size_bytes = ? AND generation = ?
					AND EXISTS (SELECT 1 FROM contract_template_versions installed
						WHERE installed.id = ? AND installed.template_bundle_r2_key = ?
							AND installed.bundle_hash = ?)`,
				params: [
					input.now,
					input.now,
					template.storageIntentId,
					template.bundleKey,
					template.storageIntentSourceRef,
					template.bundleHash,
					template.bundleSizeBytes,
					template.storageIntentGeneration,
					template.id,
					template.bundleKey,
					template.bundleHash,
				],
			})),
			...input.templates.slice(0, -1).map<StatementSpec>((template) => ({
				sql: `INSERT INTO storage_intent_link_assertions
					(id, intent_id, target_kind, target_id, assertion_passed, created_at)
				VALUES (?, ?, 'contract_template_version', ?, CASE WHEN
					EXISTS (SELECT 1 FROM storage_object_intents WHERE id = ?
						AND status = 'linked' AND object_key = ? AND sha256 = ?
						AND generation = ?)
					AND EXISTS (SELECT 1 FROM contract_template_versions WHERE id = ?
						AND template_bundle_r2_key = ? AND bundle_hash = ?)
				THEN 1 ELSE 0 END, ?)`,
				params: [
					`storage-link:${template.storageIntentId}`,
					template.storageIntentId,
					template.id,
					template.storageIntentId,
					template.bundleKey,
					template.bundleHash,
					template.storageIntentGeneration,
					template.id,
					template.bundleKey,
					template.bundleHash,
					input.now,
				],
			})),
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
				SELECT ?, ?, 'user', ?, 'contract_template_set', ?, ?, ?, ?
				WHERE ${ACTIVE_ADMIN}`,
				params: [
					input.audit.id,
					input.admin.id,
					input.audit.action,
					input.audit.targetId,
					input.audit.requestId,
					input.audit.safeDiffJson,
					input.now,
					input.admin.id,
				],
			},
		];
		const finalTemplate = input.templates.at(-1)!;
		const terminal = this.templateSetExactCondition(input, false);
		statements.push({
			sql: `INSERT INTO storage_intent_link_assertions
				(id, intent_id, target_kind, target_id, assertion_passed, created_at)
			VALUES (?, ?, 'contract_template_version', ?,
				CASE WHEN ${terminal.sql} THEN 1 ELSE 0 END, ?)`,
			params: [
				`storage-link:${finalTemplate.storageIntentId}`,
				finalTemplate.storageIntentId,
				finalTemplate.id,
				...terminal.params,
				input.now,
			],
		});

		try {
			await this.db.batch(statements);
			return input.templates.map((template) => template.id);
		} catch (error) {
			// D1 may have committed despite an ambiguous response; never compensate blindly.
			if (await this.templateSetInstalledExactly(input)) {
				return input.templates.map((template) => template.id);
			}
			throw new ContractRepositoryError('CONTRACT_TEMPLATE_INSTALL_REJECTED', {
				cause: error,
			});
		}
	}

	loadTemplate(templateVersionId: string): Promise<StoredTemplateVersion | null> {
		return this.db.first<StoredTemplateVersion>({
			sql: `SELECT template.id, template.template_id, template.template_version,
				template.render_schema_version, template.clause_set_version,
				template.provider_version_id, provider.provider_snapshot_json,
				provider.payment_terms_hash AS provider_payment_terms_hash,
				template.template_bundle_r2_key, template.bundle_hash,
				template.html_source_hash, template.css_source_hash, template.renderer_id,
				template.asset_manifest_json, template.font_manifest_json,
				template.required_fields_json,
				template.renderer_contract_version, template.worker_compatibility_date,
				template.usage_scope, template.approval_status, template.approval_basis,
				template.distance_legal_profile, template.distance_legal_basis_hash,
				template.kuendigung_function_required, template.early_performance_supported,
				template.media_contact_version_id,
				provider.approval_status AS provider_approval_status,
				contact.approval_status AS media_contact_approval_status,
				contact.snapshot_hash AS media_contact_snapshot_hash
			FROM contract_template_versions template
			JOIN contract_provider_versions provider ON provider.id = template.provider_version_id
			LEFT JOIN media_withdrawal_contact_versions contact
				ON contact.id = template.media_contact_version_id
			WHERE template.id = ?`,
			params: [templateVersionId],
		});
	}

	loadAdminAction(actorUserId: string, idempotencyKey: string) {
		return this.db.first<{
			action: string;
			request_hash_sha256: string;
			result_ref: string;
		}>({
			sql: `SELECT action, request_hash_sha256, result_ref FROM contract_admin_actions
			WHERE actor_user_id = ? AND idempotency_key = ?`,
			params: [actorUserId, idempotencyKey],
		});
	}

	loadOffer(offerId: string): Promise<StoredContractOffer | null> {
		return this.db.first<StoredContractOffer>({
			sql: `SELECT * FROM contract_offers WHERE id = ?`,
			params: [offerId],
		});
	}

	async loadOfferPdfHash(offerId: string): Promise<string | null> {
		const row = await this.db.first<{ sha256: string }>({
			sql: `SELECT sha256 FROM contract_artifacts
			WHERE contract_offer_id = ? AND artifact_kind = 'offer_pdf'`,
			params: [offerId],
		});
		return row?.sha256 ?? null;
	}

	loadCourseService(input: { courseGroupId: string; academicPeriodId: string }) {
		return this.db.first<{ id: string; lesson_kind: 'group' | 'dance_group' }>({
			sql: `SELECT id, lesson_kind FROM course_groups WHERE id = ?
				AND academic_period_id = ? AND lesson_kind IN ('group', 'dance_group')
				AND catalog_status IN ('published', 'draft')`,
			params: [input.courseGroupId, input.academicPeriodId],
		});
	}

	loadGroupPriceQuote(input: {
		quoteId: string;
		userId: string;
		childId: string;
		courseGroupId: string;
	}) {
		return this.db.first<{
			id: string;
			contract_kind: 'group_yearly' | 'group_monthly';
			price_version_id: string | null;
			price_rule_id: string | null;
			price_source: string;
			price_mode: string;
			base_price_cents: number;
			final_price_cents: number;
			status: string;
			expires_at: string;
			price_version_current: number;
		}>({
			sql: `SELECT quote.id, quote.contract_kind, quote.price_version_id,
				quote.price_rule_id, quote.price_source, quote.price_mode,
				quote.base_price_cents,
				COALESCE(quote.confirmed_price_cents, quote.final_price_cents) AS final_price_cents,
				quote.status, quote.expires_at,
				CASE WHEN quote.price_version_id IS NULL OR EXISTS (SELECT 1 FROM price_versions version
					WHERE version.id = quote.price_version_id AND version.is_active = 1)
				THEN 1 ELSE 0 END AS price_version_current
			FROM price_quotes quote WHERE quote.id = ? AND quote.user_id = ? AND quote.child_id = ?
				AND quote.course_group_id = ?`,
			params: [input.quoteId, input.userId, input.childId, input.courseGroupId],
		});
	}

	loadRequestService(input: { requestId: string; userId: string; childId: string }) {
		return this.db.first<{
			id: string;
			request_kind: 'individual' | 'nachhilfe';
			funding_kind: 'self_pay' | 'jobcenter' | 'socialamt';
			unit_rate_cents: number;
			status: string;
		}>({
			sql: `SELECT id, request_kind, funding_kind, unit_rate_cents, status
			FROM individual_requests WHERE id = ? AND user_id = ? AND child_id = ?
				AND status = 'approved'`,
			params: [input.requestId, input.userId, input.childId],
		});
	}

	async assertFundingEligible(input: {
		requestId: string;
		authorizationId: string;
		plannedFrom: string;
		plannedUntilInclusive: string;
	}) {
		const row = await this.db.first<{ eligible: number }>({
			sql: `SELECT EXISTS (
				SELECT 1 FROM individual_requests request
				JOIN users owner ON owner.id = request.user_id
				JOIN funding_authorizations authorization
					ON authorization.request_id = request.id
				WHERE request.id = ? AND authorization.id = ?
					AND request.request_kind = 'nachhilfe' AND request.status = 'approved'
					AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
					AND owner.account_status = 'active' AND owner.is_blocked = 0
					AND authorization.status = 'approved'
					AND authorization.kind = request.funding_kind
					AND authorization.valid_from <= ? AND authorization.valid_until >= ?
					AND EXISTS (SELECT 1 FROM authorization_documents document
						WHERE document.authorization_id = authorization.id
							AND document.review_status = 'approved'
							AND document.archive_r2_key IS NOT NULL
							AND document.deleted_at IS NULL
							AND document.replaced_by_document_id IS NULL)
					AND NOT EXISTS (SELECT 1 FROM authorization_documents document
						WHERE document.authorization_id = authorization.id
							AND document.deleted_at IS NULL
							AND document.replaced_by_document_id IS NULL
							AND (document.review_status <> 'approved'
								OR document.archive_r2_key IS NULL))
			) AS eligible`,
			params: [
				input.requestId,
				input.authorizationId,
				input.plannedFrom,
				input.plannedUntilInclusive,
			],
		});
		if (row?.eligible !== 1) throw new ContractRepositoryError('FUNDING_NOT_ELIGIBLE');
	}

	async prepareNumber(userId: string, childId: string): Promise<NumberContext> {
		const context = await this.db.first<NumberContext>({
			sql: `SELECT owner.id AS user_id, child.id AS child_id,
				family.id AS family_number_id, family.display_family_id AS family_display_id,
				owner.family_version,
				COALESCE(sequence.next_contract_sequence, 1) AS next_contract_sequence,
				CASE WHEN sequence.id IS NULL THEN 0 ELSE 1 END AS sequence_exists
			FROM users owner
			JOIN children child ON child.owner_user_id = owner.id
				AND child.family_number_id = owner.family_number_id AND child.is_current = 1
			JOIN family_number_allocations family ON family.id = owner.family_number_id
				AND family.owner_user_id = owner.id AND family.status = 'assigned'
			LEFT JOIN contract_number_sequences sequence ON sequence.family_number_id = family.id
			WHERE owner.id = ? AND child.id = ? AND owner.role = 'parent'
				AND owner.email_verified_at IS NOT NULL AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND owner.family_version > 0
				AND (sequence.id IS NULL OR sequence.status = 'active')`,
			params: [userId, childId],
		});
		if (!context) throw new ContractRepositoryError('CONTRACT_NUMBER_CONTEXT_REJECTED');
		return context;
	}

	async createDraft(input: DraftOfferPersistence, number: NumberContext) {
		const prior = await this.db.first<{ request_hash_sha256: string; result_ref: string }>({
			sql: `SELECT request_hash_sha256, result_ref FROM contract_admin_actions
			WHERE actor_user_id = ? AND idempotency_key = ?`,
			params: [input.admin.id, input.idempotencyKey],
		});
		if (prior) {
			if (prior.request_hash_sha256 !== input.requestHash) {
				throw new ContractRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			return { offerId: prior.result_ref, replayed: true };
		}

		const render = input.renderInput;
		const auditId = crypto.randomUUID();
		const actionId = crypto.randomUUID();
		const assertionId = crypto.randomUUID();
		const sequenceId = `contract-sequence:${number.family_number_id}`;
		const operationalStatements: StatementSpec[] = input.service.enrollmentId
			? [
					{
						sql: `INSERT INTO enrollments
							(id, user_id, child_id, course_group_id, legacy_enrollment_id,
							 lesson_kind, status, contract_kind, active_from, active_until,
							 current_price_cents, price_source, price_mode, price_effective_from,
							 current_base_price_cents, current_price_version_id,
							 current_price_rule_id, price_assignment_version,
							 manual_override_reason, manual_override_by, manual_override_at,
							 source, created_at, updated_at)
						SELECT ?, ?, ?, ?, NULL, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?,
							'admin', ?, ? WHERE ${ACTIVE_ADMIN}
							AND EXISTS (SELECT 1 FROM course_groups WHERE id = ?
								AND academic_period_id = ? AND lesson_kind IN ('group', 'dance_group'))`,
						params: [
							input.service.enrollmentId,
							input.userId,
							input.childId,
							input.service.courseGroupId,
							input.service.lessonKind,
							render.templateId,
							render.service.effectiveFrom,
							render.service.effectiveTo
								? calendarDayAfter(render.service.effectiveTo)
								: null,
							render.billing.finalPriceCents,
							render.billing.priceSource,
							render.billing.priceMode,
							render.service.effectiveFrom,
							render.billing.basePriceCents,
							input.pricing.priceVersionId,
							input.pricing.priceRuleId,
							input.manualOverride?.reason ?? null,
							input.manualOverride ? input.admin.id : null,
							input.manualOverride ? input.now : null,
							input.now,
							input.now,
							input.admin.id,
							input.service.courseGroupId,
							input.academicPeriodId,
						],
					},
				]
			: [
					{
						sql: `INSERT INTO service_engagements
							(id, user_id, child_id, individual_request_id, request_kind,
							 initial_funding_authorization_id, current_funding_authorization_id,
							 status, active_from, active_until, attendance_ceased_at,
							 attendance_notice_id, contract_id, created_at, updated_at)
						SELECT ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL, NULL, NULL, ?, ?
						WHERE ${ACTIVE_ADMIN} AND EXISTS (
							SELECT 1 FROM individual_requests request
							WHERE request.id = ? AND request.user_id = ? AND request.child_id = ?
								AND request.request_kind = ? AND request.status = 'approved')`,
						params: [
							input.service.serviceEngagementId,
							input.userId,
							input.childId,
							input.service.individualRequestId,
							render.service.requestKind,
							input.service.fundingAuthorizationId,
							input.service.fundingAuthorizationId,
							render.service.effectiveFrom,
							render.service.effectiveTo
								? calendarDayAfter(render.service.effectiveTo)
								: null,
							input.now,
							input.now,
							input.admin.id,
							input.service.individualRequestId,
							input.userId,
							input.childId,
							render.service.requestKind,
						],
					},
				];
		const offerRecord: Record<string, unknown> = {
			id: input.id,
			series_id: input.seriesId,
			version: 1,
			offer_number: input.offerNumber,
			contract_number: input.contractNumber,
			user_id: input.userId,
			child_id: input.childId,
			family_number_id_at_issue: number.family_number_id,
			family_display_id_at_issue: number.family_display_id,
			family_version_at_issue: number.family_version,
			academic_period_id: input.academicPeriodId,
			course_group_id: input.service.courseGroupId,
			individual_request_id: input.service.individualRequestId,
			funding_authorization_id: input.service.fundingAuthorizationId,
			enrollment_id: input.service.enrollmentId,
			service_engagement_id: input.service.serviceEngagementId,
			price_quote_id: input.pricing.priceQuoteId,
			contract_kind: render.templateId,
			template_version_id: input.template.id,
			render_schema_version: render.schemaVersion,
			effective_from: render.service.effectiveFrom,
			effective_to: render.service.effectiveTo,
			billing_model: render.billing.model,
			currency: 'EUR',
			unit_minutes: render.billing.unitMinutes,
			price_version_id: input.pricing.priceVersionId,
			price_rule_id: input.pricing.priceRuleId,
			price_source: render.billing.priceSource,
			price_mode: render.billing.priceMode,
			base_price_cents: render.billing.basePriceCents,
			price_cents: render.billing.finalPriceCents,
			amount_semantics: render.billing.amountSemantics,
			payment_arrangement: render.billing.paymentArrangement,
			payment_due_day: render.billing.paymentDueDay,
			billing_period_code: render.billing.billingPeriodCode,
			provider_snapshot_json: JSON.stringify(render.provider),
			party_snapshot_json: JSON.stringify({ parent: render.parent, child: render.child }),
			service_snapshot_json: JSON.stringify(render.service),
			schedule_snapshot_json: JSON.stringify(render.service.scheduleLines),
			billing_snapshot_json: JSON.stringify(render.billing),
			line_items_json: JSON.stringify(render.billing.lineItems),
			term_snapshot_json: JSON.stringify(render.term),
			termination_snapshot_json: JSON.stringify({
				ordinary: render.term.ordinaryTerminationText,
				extraordinary: render.term.extraordinaryTerminationText,
			}),
			withdrawal_snapshot_json: JSON.stringify({
				version: render.legal.withdrawalTextVersion,
			}),
			distance_legal_profile_snapshot_json: JSON.stringify({
				profile: render.legal.distanceLegalProfile,
			}),
			distance_legal_basis_hash: render.legal.distanceLegalBasisHash,
			early_performance_request_version: render.legal.earlyPerformanceRequestVersion,
			early_performance_requested_at: null,
			wertersatz_notice_version: render.legal.wertersatzNoticeVersion,
			clauses_manifest_json: JSON.stringify({
				clauseSetVersion: render.legal.clauseSetVersion,
			}),
			attachments_manifest_json: JSON.stringify(render.legal.attachments),
			privacy_notice_version: render.legal.privacyNoticeVersion,
			media_clause_version: render.legal.mediaClauseVersion,
			media_decision_snapshot_json: null,
			render_input_json: JSON.stringify(render),
			render_input_hash: input.renderInputHash,
			source_manifest_json: input.sourceManifestJson,
			source_manifest_hash: input.sourceManifestHash,
			contract_html_r2_key: null,
			contract_pdf_r2_key: null,
			contract_hash: null,
			render_status: 'not_started',
			status: 'draft',
			sent_at: null,
			expires_at: input.expiresAt,
			accepted_at: null,
			declined_at: null,
			admin_approved_at: null,
			cancelled_at: null,
			status_reason: null,
			created_by_admin_user_id: input.admin.id,
			created_at: input.now,
			updated_at: input.now,
		};
		const offerColumns = Object.keys(offerRecord);

		const statements: StatementSpec[] = [
			{
				sql: `INSERT OR IGNORE INTO contract_number_sequences
					(id, family_number_id, format_version, next_contract_sequence,
					 status, created_at, updated_at)
				VALUES (?, ?, 'family-contract-v1', 1, 'active', ?, ?)`,
				params: [sequenceId, number.family_number_id, input.now, input.now],
			},
			{
				sql: `UPDATE contract_number_sequences
				SET next_contract_sequence = next_contract_sequence + 1, updated_at = ?
				WHERE family_number_id = ? AND status = 'active'
					AND next_contract_sequence = ? AND ${ACTIVE_ADMIN}
					AND EXISTS (SELECT 1 FROM users owner JOIN children child
						ON child.owner_user_id = owner.id AND child.family_number_id = owner.family_number_id
						WHERE owner.id = ? AND child.id = ? AND owner.family_number_id = ?
							AND owner.family_version = ? AND owner.role = 'parent'
							AND owner.email_verified_at IS NOT NULL AND owner.account_status = 'active'
							AND owner.is_blocked = 0)`,
				params: [
					input.now,
					number.family_number_id,
					number.next_contract_sequence,
					input.admin.id,
					input.userId,
					input.childId,
					number.family_number_id,
					number.family_version,
				],
			},
			...operationalStatements,
			{
				sql: `INSERT INTO contract_offers (${offerColumns.join(', ')})
				SELECT ${offerColumns.map(() => '?').join(', ')}
				WHERE EXISTS (SELECT 1 FROM contract_number_sequences
					WHERE family_number_id = ? AND next_contract_sequence = ?)
					AND EXISTS (SELECT 1 FROM ${input.service.enrollmentId ? 'enrollments' : 'service_engagements'}
						WHERE id = ?)`,
				params: [
					...Object.values(offerRecord),
					number.family_number_id,
					number.next_contract_sequence + 1,
					input.service.enrollmentId ?? input.service.serviceEngagementId,
				],
			},
			...(input.manualOverride
				? [
						{
							sql: `INSERT INTO offer_manual_price_overrides
								(id, contract_offer_id, base_price_cents, override_price_cents,
								 delta_cents, price_version_id, price_rule_id, reason,
								 actor_user_id, responsibility_confirmed, request_hash_sha256, created_at)
							SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
							WHERE EXISTS (SELECT 1 FROM contract_offers WHERE id = ?)`,
							params: [
								crypto.randomUUID(),
								input.id,
								render.billing.basePriceCents,
								render.billing.finalPriceCents,
								render.billing.finalPriceCents - render.billing.basePriceCents,
								input.pricing.priceVersionId,
								input.pricing.priceRuleId,
								input.manualOverride.reason,
								input.admin.id,
								input.requestHash,
								input.now,
								input.id,
							],
						},
					]
				: []),
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
				SELECT ?, ?, 'user', 'contract_offer.created', 'contract_offer', ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM contract_offers WHERE id = ?)`,
				params: [
					auditId,
					input.admin.id,
					input.id,
					input.requestId,
					JSON.stringify({
						contractKind: render.templateId,
						status: 'draft',
						priceMode: render.billing.priceMode,
					}),
					input.now,
					input.id,
				],
			},
			{
				sql: `INSERT INTO contract_admin_actions
					(id, contract_offer_id, action, actor_user_id, idempotency_key,
					 request_hash_sha256, result_ref, audit_event_id, created_at)
				SELECT ?, ?, 'create', ?, ?, ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
				params: [
					actionId,
					input.id,
					input.admin.id,
					input.idempotencyKey,
					input.requestHash,
					input.id,
					auditId,
					input.now,
					auditId,
				],
			},
			{
				sql: `INSERT INTO contract_action_assertions
					(id, scope, target_id, action_id, actor_user_id, audit_event_id,
					 assertion_passed, created_at)
				VALUES (?, 'offer_create', ?, ?, ?, ?, CASE WHEN
					EXISTS (SELECT 1 FROM contract_offers WHERE id = ? AND status = 'draft')
					AND EXISTS (SELECT 1 FROM contract_admin_actions WHERE id = ?)
					AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
				THEN 1 ELSE 0 END, ?)`,
				params: [
					assertionId,
					input.id,
					actionId,
					input.admin.id,
					auditId,
					input.id,
					actionId,
					auditId,
					input.now,
				],
			},
		];

		try {
			await this.db.batch(statements);
			return { offerId: input.id, replayed: false };
		} catch (error) {
			const replay = await this.db.first<{ request_hash_sha256: string; result_ref: string }>(
				{
					sql: `SELECT request_hash_sha256, result_ref FROM contract_admin_actions
				WHERE actor_user_id = ? AND idempotency_key = ?`,
					params: [input.admin.id, input.idempotencyKey],
				}
			);
			if (replay?.request_hash_sha256 === input.requestHash) {
				return { offerId: replay.result_ref, replayed: true };
			}
			throw new ContractRepositoryError('CONTRACT_DRAFT_CREATE_REJECTED', { cause: error });
		}
	}

	markRendering(offerId: string, adminId: string, now: string) {
		return this.db.run({
			sql: `UPDATE contract_offers SET render_status = 'rendering', updated_at = ?
			WHERE id = ? AND status = 'draft' AND render_status IN ('not_started', 'failed')
				AND ${ACTIVE_ADMIN}`,
			params: [now, offerId, adminId],
		});
	}

	async browserBudgetUsed(dayPrefix: string): Promise<number> {
		const row = await this.db.first<{ used: number }>({
			sql: `SELECT COALESCE(SUM(browser_ms_used), 0) AS used
			FROM contract_render_attempts WHERE started_at >= ? AND started_at < ?`,
			params: [`${dayPrefix}T00:00:00.000Z`, `${calendarDayAfter(dayPrefix)}T00:00:00.000Z`],
		});
		return row?.used ?? 0;
	}

	async nextAttemptNumber(offerId: string): Promise<number> {
		const row = await this.db.first<{ next_attempt: number }>({
			sql: `SELECT COALESCE(MAX(attempt_no), 0) + 1 AS next_attempt
			FROM contract_render_attempts WHERE contract_offer_id = ?`,
			params: [offerId],
		});
		return row?.next_attempt ?? 1;
	}

	async recordRenderFailure(input: {
		offerId: string;
		attemptNo: number;
		template: StoredTemplateVersion;
		sourceManifestHash: string;
		startedAt: string;
		finishedAt: string;
		status: 'retryable_failed' | 'failed';
		errorCode: string;
		retryAfterSeconds: number | null;
	}) {
		await this.db.batch([
			{
				sql: `INSERT INTO contract_render_attempts
					(id, contract_offer_id, attempt_no, renderer_id,
					 worker_compatibility_date, source_manifest_hash, started_at, finished_at,
					 status, error_code, browser_ms_used, pdf_size_bytes, pdf_sha256,
					 retry_after_seconds, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
				params: [
					crypto.randomUUID(),
					input.offerId,
					input.attemptNo,
					input.template.renderer_id,
					input.template.worker_compatibility_date,
					input.sourceManifestHash,
					input.startedAt,
					input.finishedAt,
					input.status,
					input.errorCode,
					input.retryAfterSeconds,
					input.finishedAt,
				],
			},
			{
				sql: `UPDATE contract_offers SET render_status = 'failed',
					status_reason = ?, updated_at = ?
				WHERE id = ? AND status = 'draft' AND render_status = 'rendering'`,
				params: [input.errorCode, input.finishedAt, input.offerId],
			},
		]);
	}

	async completeRenderAndSend(input: {
		offer: StoredContractOffer;
		template: StoredTemplateVersion;
		admin: AdminActor;
		attemptNo: number;
		startedAt: string;
		now: string;
		htmlKey: string;
		pdfKey: string;
		htmlSize: number;
		htmlSha256: string;
		pdfSize: number;
		pdfSha256: string;
		contractHash: string;
		browserMsUsed: number | null;
		idempotencyKey: string;
		requestHash: string;
		requestId: string;
		htmlStorageIntentId?: string;
		pdfStorageIntentId?: string;
	}) {
		const auditId = crypto.randomUUID();
		const actionId = crypto.randomUUID();
		const deliveryId = crypto.randomUUID();
		await this.db.batch([
			{
				sql: `UPDATE contract_offers SET contract_html_r2_key = ?,
					contract_pdf_r2_key = ?, contract_hash = ?, render_status = 'ready',
					status_reason = NULL, updated_at = ?
				WHERE id = ? AND status = 'draft' AND render_status = 'rendering'
					AND render_input_hash = ? AND source_manifest_hash = ?
					AND (? IS NULL OR EXISTS (SELECT 1 FROM storage_object_intents
						WHERE id = ? AND status = 'staged' AND storage_class = 'archive'
							AND object_key = ?))
					AND (? IS NULL OR EXISTS (SELECT 1 FROM storage_object_intents
						WHERE id = ? AND status = 'staged' AND storage_class = 'archive'
							AND object_key = ?))`,
				params: [
					input.htmlKey,
					input.pdfKey,
					input.contractHash,
					input.now,
					input.offer.id,
					input.offer.render_input_hash,
					input.offer.source_manifest_hash,
					input.htmlStorageIntentId ?? null,
					input.htmlStorageIntentId ?? null,
					input.htmlKey,
					input.pdfStorageIntentId ?? null,
					input.pdfStorageIntentId ?? null,
					input.pdfKey,
				],
			},
			...[
				[
					'offer_html',
					input.htmlKey,
					'text/html; charset=utf-8',
					input.htmlSize,
					input.htmlSha256,
				] as const,
				[
					'offer_pdf',
					input.pdfKey,
					'application/pdf',
					input.pdfSize,
					input.pdfSha256,
				] as const,
			].map<StatementSpec>((artifact) => ({
				sql: `INSERT INTO contract_artifacts
					(id, contract_offer_id, formation_certificate_id, artifact_kind,
					 private_r2_key, content_type, size_bytes, sha256, source_hash,
					 template_version_id, renderer_id, renderer_contract_version,
					 worker_compatibility_date, created_at)
				SELECT ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM contract_offers WHERE id = ?
					AND render_status = 'ready' AND status = 'draft')`,
				params: [
					crypto.randomUUID(),
					input.offer.id,
					artifact[0],
					artifact[1],
					artifact[2],
					artifact[3],
					artifact[4],
					input.offer.source_manifest_hash,
					input.template.id,
					input.template.renderer_id,
					input.template.renderer_contract_version,
					input.template.worker_compatibility_date,
					input.now,
					input.offer.id,
				],
			})),
			...(
				[
					[input.htmlStorageIntentId, input.htmlKey, 'contract_offer_html'],
					[input.pdfStorageIntentId, input.pdfKey, 'contract_offer_pdf'],
				] as const
			).flatMap<StatementSpec>(([intentId, key, targetKind]) =>
				intentId
					? [
							{
								sql: `UPDATE storage_object_intents SET status = 'linked', linked_at = ?,
						updated_at = ?, lease_owner = NULL, lease_until = NULL, last_error_code = NULL
					WHERE id = ? AND status = 'staged' AND object_key = ?
						AND EXISTS (SELECT 1 FROM contract_artifacts
							WHERE contract_offer_id = ? AND private_r2_key = ?)`,
								params: [input.now, input.now, intentId, key, input.offer.id, key],
							},
							{
								sql: `INSERT INTO storage_intent_link_assertions
						(id, intent_id, target_kind, target_id, assertion_passed, created_at)
					VALUES (?, ?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM storage_object_intents
							WHERE id = ? AND status = 'linked' AND object_key = ?)
						AND EXISTS (SELECT 1 FROM contract_artifacts
							WHERE contract_offer_id = ? AND private_r2_key = ?)
					THEN 1 ELSE 0 END, ?)`,
								params: [
									crypto.randomUUID(),
									intentId,
									targetKind,
									input.offer.id,
									intentId,
									key,
									input.offer.id,
									key,
									input.now,
								],
							},
						]
					: []
			),
			{
				sql: `INSERT INTO contract_render_attempts
					(id, contract_offer_id, attempt_no, renderer_id,
					 worker_compatibility_date, source_manifest_hash, started_at, finished_at,
					 status, error_code, browser_ms_used, pdf_size_bytes, pdf_sha256,
					 retry_after_seconds, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'succeeded', NULL, ?, ?, ?, NULL, ?)`,
				params: [
					crypto.randomUUID(),
					input.offer.id,
					input.attemptNo,
					input.template.renderer_id,
					input.template.worker_compatibility_date,
					input.offer.source_manifest_hash,
					input.startedAt,
					input.now,
					input.browserMsUsed,
					input.pdfSize,
					input.pdfSha256,
					input.now,
				],
			},
			{
				sql: `UPDATE contract_offers SET status = 'sent', sent_at = ?, updated_at = ?
				WHERE id = ? AND status = 'draft' AND render_status = 'ready'
					AND contract_hash = ? AND expires_at > ?
					AND ${ACTIVE_ADMIN}
					AND EXISTS (SELECT 1 FROM contract_template_versions template
						WHERE template.id = template_version_id AND template.approval_status = 'approved')`,
				params: [
					input.now,
					input.now,
					input.offer.id,
					input.contractHash,
					input.now,
					input.admin.id,
				],
			},
			{
				sql: `UPDATE ${input.offer.enrollment_id ? 'enrollments' : 'service_engagements'}
				SET status = 'contract_offered', updated_at = ? WHERE id = ? AND status = 'draft'
					AND EXISTS (SELECT 1 FROM contract_offers WHERE id = ? AND status = 'sent')`,
				params: [
					input.now,
					input.offer.enrollment_id ?? input.offer.service_engagement_id,
					input.offer.id,
				],
			},
			{
				sql: `INSERT INTO contract_deliveries
					(id, contract_offer_id, contract_id, artifact_kind, artifact_hash,
					 channel, recipient_role, recipient_user_id, delivery_status,
					 dedupe_key, delivered_at, access_expires_at, created_at)
				SELECT ?, ?, NULL, 'offer_pdf', ?, 'portal', 'parent', ?, 'available',
					?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM contract_offers
						WHERE id = ? AND status = 'sent')`,
				params: [
					deliveryId,
					input.offer.id,
					input.pdfSha256,
					input.offer.user_id,
					`offer-pdf:portal:${input.offer.id}`,
					input.now,
					input.offer.expires_at,
					input.now,
					input.offer.id,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
				SELECT ?, ?, 'user', 'contract_offer.rendered_and_sent',
					'contract_offer', ?, ?, ?, ? WHERE EXISTS (
						SELECT 1 FROM contract_offers WHERE id = ? AND status = 'sent')`,
				params: [
					auditId,
					input.admin.id,
					input.offer.id,
					input.requestId,
					JSON.stringify({
						status: 'sent',
						renderer: input.template.renderer_id,
						attempt: input.attemptNo,
					}),
					input.now,
					input.offer.id,
				],
			},
			{
				sql: `INSERT INTO contract_admin_actions
					(id, contract_offer_id, action, actor_user_id, idempotency_key,
					 request_hash_sha256, result_ref, audit_event_id, created_at)
				SELECT ?, ?, 'render_send', ?, ?, ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
				params: [
					actionId,
					input.offer.id,
					input.admin.id,
					input.idempotencyKey,
					input.requestHash,
					input.offer.id,
					auditId,
					input.now,
					auditId,
				],
			},
			{
				sql: `INSERT INTO contract_outbox_events
					(id, event_type, source_kind, source_id, payload_json, dedupe_key,
					 status, created_at)
				SELECT ?, 'offer_available', 'contract_offer', ?, ?, ?, 'pending', ?
				WHERE EXISTS (SELECT 1 FROM contract_offers WHERE id = ? AND status = 'sent')`,
				params: [
					crypto.randomUUID(),
					input.offer.id,
					JSON.stringify({ offerId: input.offer.id, deliveryId }),
					`offer-available:${input.offer.id}`,
					input.now,
					input.offer.id,
				],
			},
			{
				sql: `INSERT INTO contract_action_assertions
					(id, scope, target_id, action_id, actor_user_id, audit_event_id,
					 assertion_passed, created_at)
				VALUES (?, 'render_send', ?, ?, ?, ?, CASE WHEN
					EXISTS (SELECT 1 FROM contract_offers WHERE id = ? AND status = 'sent'
						AND render_status = 'ready' AND contract_hash = ?)
					AND EXISTS (SELECT 1 FROM contract_artifacts WHERE contract_offer_id = ?
						GROUP BY contract_offer_id HAVING COUNT(*) = 2)
					AND EXISTS (SELECT 1 FROM contract_deliveries WHERE id = ?)
					AND EXISTS (SELECT 1 FROM contract_admin_actions WHERE id = ?)
					AND (? IS NULL OR EXISTS (SELECT 1 FROM storage_object_intents
						WHERE id = ? AND status = 'linked' AND object_key = ?))
					AND (? IS NULL OR EXISTS (SELECT 1 FROM storage_object_intents
						WHERE id = ? AND status = 'linked' AND object_key = ?))
				THEN 1 ELSE 0 END, ?)`,
				params: [
					crypto.randomUUID(),
					input.offer.id,
					actionId,
					input.admin.id,
					auditId,
					input.offer.id,
					input.contractHash,
					input.offer.id,
					deliveryId,
					actionId,
					input.htmlStorageIntentId ?? null,
					input.htmlStorageIntentId ?? null,
					input.htmlKey,
					input.pdfStorageIntentId ?? null,
					input.pdfStorageIntentId ?? null,
					input.pdfKey,
					input.now,
				],
			},
		]);
	}

	async parentDecision(input: {
		actor: AuthenticatedUser;
		offerId: string;
		expectedContractHash: string;
		decision: 'accept' | 'decline';
		textVersion: string;
		text: string;
		idempotencyKey: string;
		userAgent: string;
		ipRetentionValue: string | null;
		ipExpiresAt: string | null;
		requestId: string;
		now: string;
	}) {
		const requestHash = await hashCanonical({
			offerId: input.offerId,
			expectedContractHash: input.expectedContractHash,
			decision: input.decision,
			textVersion: input.textVersion,
			text: input.text,
		});
		const prior = await this.db.first<{ request_hash_sha256: string; to_status: string }>({
			sql: `SELECT action.request_hash_sha256, action.to_status
			FROM contract_parent_actions action
			JOIN users owner ON owner.id = action.user_id
			WHERE action.user_id = ? AND action.idempotency_key = ?
				AND owner.role = 'parent' AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL`,
			params: [input.actor.id, input.idempotencyKey],
		});
		if (prior) {
			if (prior.request_hash_sha256 !== requestHash) {
				throw new ContractRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			return { status: prior.to_status, replayed: true };
		}
		const toStatus = input.decision === 'accept' ? 'accepted_by_parent' : 'declined_by_parent';
		const actionId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const acceptanceId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `UPDATE contract_offers SET status = ?,
						accepted_at = CASE WHEN ? = 'accept' THEN ? ELSE accepted_at END,
						declined_at = CASE WHEN ? = 'decline' THEN ? ELSE declined_at END,
						updated_at = ?
					WHERE id = ? AND user_id = ? AND status = 'sent' AND expires_at > ?
						AND contract_hash = ? AND render_status = 'ready'
						AND EXISTS (SELECT 1 FROM users owner JOIN children child
							ON child.owner_user_id = owner.id
							WHERE owner.id = ? AND child.id = contract_offers.child_id
								AND owner.role = 'parent'
								AND owner.email_verified_at IS NOT NULL
								AND owner.account_status = 'active' AND owner.is_blocked = 0
								AND child.family_number_id = owner.family_number_id
								AND owner.family_number_id = contract_offers.family_number_id_at_issue
								AND owner.family_version = contract_offers.family_version_at_issue)`,
					params: [
						toStatus,
						input.decision,
						input.now,
						input.decision,
						input.now,
						input.now,
						input.offerId,
						input.actor.id,
						input.now,
						input.expectedContractHash,
						input.actor.id,
					],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', ?, 'contract_offer', id, ?, ?, ?
					FROM contract_offers WHERE id = ? AND user_id = ? AND status = ?`,
					params: [
						auditId,
						input.actor.id,
						`contract_offer.${input.decision}`,
						input.requestId,
						JSON.stringify({ status: toStatus }),
						input.now,
						input.offerId,
						input.actor.id,
						toStatus,
					],
				},
				{
					sql: `INSERT INTO contract_parent_actions
						(id, contract_offer_id, user_id, action, from_status, to_status,
						 offer_hash, text_version, user_agent, ip_retention_value, ip_expires_at,
						 idempotency_key, request_hash_sha256, audit_event_id, created_at)
					SELECT ?, ?, ?, ?, 'sent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
					params: [
						actionId,
						input.offerId,
						input.actor.id,
						input.decision,
						toStatus,
						input.expectedContractHash,
						input.textVersion,
						input.userAgent,
						input.ipRetentionValue,
						input.ipExpiresAt,
						input.idempotencyKey,
						requestHash,
						auditId,
						input.now,
						auditId,
					],
				},
				...(input.decision === 'accept'
					? [
							{
								sql: `INSERT INTO contract_acceptances
								(id, contract_offer_id, parent_action_id, user_id, accepted_at,
								 ip_retention_value, ip_expires_at, user_agent,
								 acceptance_text_version, acceptance_text, contract_hash,
								 idempotency_key, created_at)
							SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
							WHERE EXISTS (SELECT 1 FROM contract_parent_actions WHERE id = ?)`,
								params: [
									acceptanceId,
									input.offerId,
									actionId,
									input.actor.id,
									input.now,
									input.ipRetentionValue,
									input.ipExpiresAt,
									input.userAgent,
									input.textVersion,
									input.text,
									input.expectedContractHash,
									input.idempotencyKey,
									input.now,
									actionId,
								],
							},
						]
					: []),
				{
					sql: `INSERT INTO contract_action_assertions
						(id, scope, target_id, action_id, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, 'parent_decision', ?, ?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM contract_parent_actions WHERE id = ?)
						AND EXISTS (SELECT 1 FROM contract_offers WHERE id = ? AND status = ?)
						AND (? = 'decline' OR EXISTS (SELECT 1 FROM contract_acceptances
							WHERE id = ? AND contract_hash = ?))
					THEN 1 ELSE 0 END, ?)`,
					params: [
						crypto.randomUUID(),
						input.offerId,
						actionId,
						input.actor.id,
						auditId,
						actionId,
						input.offerId,
						toStatus,
						input.decision,
						acceptanceId,
						input.expectedContractHash,
						input.now,
					],
				},
				{
					sql: `INSERT INTO contract_outbox_events
						(id, event_type, source_kind, source_id, payload_json, dedupe_key,
						 status, created_at)
					SELECT ?, ?, 'contract_offer', ?, ?, ?, 'pending', ?
					WHERE EXISTS (SELECT 1 FROM contract_parent_actions WHERE id = ?)`,
					params: [
						crypto.randomUUID(),
						input.decision === 'decline' ? 'offer_declined' : 'offer_available',
						input.offerId,
						JSON.stringify({ offerId: input.offerId, action: input.decision }),
						`parent-${input.decision}:${input.offerId}`,
						input.now,
						actionId,
					],
				},
			]);
			return { status: toStatus, replayed: false };
		} catch (error) {
			const replay = await this.db.first<{ request_hash_sha256: string; to_status: string }>({
				sql: `SELECT action.request_hash_sha256, action.to_status
				FROM contract_parent_actions action
				JOIN users owner ON owner.id = action.user_id
				WHERE action.user_id = ? AND action.idempotency_key = ?
					AND owner.role = 'parent' AND owner.account_status = 'active'
					AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL`,
				params: [input.actor.id, input.idempotencyKey],
			});
			if (replay?.request_hash_sha256 === requestHash) {
				return { status: replay.to_status, replayed: true };
			}
			throw new ContractRepositoryError('CONTRACT_PARENT_DECISION_REJECTED');
		}
	}

	async formContract(input: {
		offer: StoredContractOffer;
		admin: AdminActor;
		idempotencyKey: string;
		reason: string;
		requestId: string;
		now: string;
		certificateId: string;
		certificateSourceJson: string;
		certificateSourceHash: string;
	}) {
		const requestHash = await hashCanonical({ offerId: input.offer.id, reason: input.reason });
		const prior = await this.db.first<{ request_hash_sha256: string; result_ref: string }>({
			sql: `SELECT request_hash_sha256, result_ref FROM contract_admin_actions
			WHERE actor_user_id = ? AND idempotency_key = ?`,
			params: [input.admin.id, input.idempotencyKey],
		});
		if (prior) {
			if (prior.request_hash_sha256 !== requestHash) {
				throw new ContractRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			return { contractId: prior.result_ref, replayed: true };
		}
		const acceptance = await this.db.first<{
			id: string;
			accepted_at: string;
			contract_hash: string;
		}>({
			sql: `SELECT id, accepted_at, contract_hash FROM contract_acceptances
			WHERE contract_offer_id = ? AND user_id = ?`,
			params: [input.offer.id, input.offer.user_id],
		});
		if (!acceptance || acceptance.contract_hash !== input.offer.contract_hash) {
			throw new ContractRepositoryError('PARENT_ACCEPTANCE_REQUIRED');
		}

		const contractId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const actionId = crypto.randomUUID();
		const activeUntil = input.offer.effective_to
			? calendarDayAfter(input.offer.effective_to)
			: null;
		const occupancy = input.offer.enrollment_id ? new OccupancyRepository(this.db) : null;
		const activationOldCount = occupancy
			? await occupancy.activeChildrenCount(
					input.offer.course_group_id!,
					input.offer.effective_from
				)
			: 0;
		const expiryNewCount =
			occupancy && activeUntil
				? await occupancy.activeChildrenCount(input.offer.course_group_id!, activeUntil)
				: null;
		const activationTriggerId = crypto.randomUUID();
		const expiryTriggerId = activeUntil ? crypto.randomUUID() : null;
		const operationalTable = input.offer.enrollment_id ? 'enrollments' : 'service_engagements';
		const operationalId = input.offer.enrollment_id ?? input.offer.service_engagement_id;
		const groupGuard = input.offer.enrollment_id
			? `AND EXISTS (SELECT 1 FROM course_groups course WHERE course.id = contract_offers.course_group_id
				AND COALESCE(course.capacity_override, course.capacity_default) IS NOT NULL
				AND (SELECT COUNT(DISTINCT enrollment.child_id) FROM enrollments enrollment
					WHERE enrollment.course_group_id = course.id AND enrollment.status = 'active'
						AND enrollment.active_from <= contract_offers.effective_from
						AND (enrollment.active_until IS NULL OR contract_offers.effective_from < enrollment.active_until))
					< COALESCE(course.capacity_override, course.capacity_default))`
			: '';
		const fundingGuard = input.offer.funding_authorization_id
			? `AND EXISTS (SELECT 1 FROM funding_authorizations authorization
				WHERE authorization.id = contract_offers.funding_authorization_id
					AND authorization.request_id = contract_offers.individual_request_id
					AND authorization.status = 'approved'
					AND authorization.valid_from <= contract_offers.effective_from
					AND authorization.valid_until >= contract_offers.effective_to
					AND EXISTS (SELECT 1 FROM authorization_documents document
						WHERE document.authorization_id = authorization.id
							AND document.review_status = 'approved'
							AND document.archive_r2_key IS NOT NULL
							AND document.deleted_at IS NULL
							AND document.replaced_by_document_id IS NULL)
					AND NOT EXISTS (SELECT 1 FROM authorization_documents document
						WHERE document.authorization_id = authorization.id
							AND document.deleted_at IS NULL
							AND document.replaced_by_document_id IS NULL
							AND (document.review_status <> 'approved' OR document.archive_r2_key IS NULL)))`
			: '';
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO contracts
						(id, contract_offer_id, contract_number, user_id, child_id,
						 course_group_id, individual_request_id, funding_authorization_id,
						 enrollment_id, service_engagement_id, operational_status,
						 parent_acceptance_id, formed_at, formed_by_admin_user_id,
						 activated_at, effective_from, effective_to,
						 auto_renewal_blocked_at, created_at)
					SELECT ?, id, contract_number, user_id, child_id, course_group_id,
						individual_request_id, funding_authorization_id, enrollment_id,
						service_engagement_id, 'active', ?, ?, ?, ?, effective_from,
						effective_to, NULL, ? FROM contract_offers
					WHERE id = ? AND status = 'accepted_by_parent' AND contract_hash = ?
						AND expires_at > ? AND ${ACTIVE_ADMIN}
						AND EXISTS (SELECT 1 FROM contract_acceptances acceptance
							WHERE acceptance.id = ?
								AND acceptance.contract_offer_id = contract_offers.id
								AND acceptance.user_id = contract_offers.user_id
								AND acceptance.contract_hash = contract_offers.contract_hash
								AND acceptance.user_id <> ?)
						AND EXISTS (SELECT 1 FROM users owner WHERE owner.id = user_id
							AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
							AND owner.account_status = 'active' AND owner.is_blocked = 0)
						AND EXISTS (SELECT 1 FROM ${operationalTable} operation
							WHERE operation.id = ? AND operation.status = 'contract_offered')
						${groupGuard} ${fundingGuard}`,
					params: [
						contractId,
						acceptance.id,
						input.now,
						input.admin.id,
						input.now,
						input.now,
						input.offer.id,
						input.offer.contract_hash,
						input.now,
						input.admin.id,
						acceptance.id,
						input.admin.id,
						operationalId,
					],
				},
				{
					sql: `UPDATE ${operationalTable} SET status = 'active',
						active_from = ?, active_until = ?, ${input.offer.service_engagement_id ? 'contract_id = ?,' : ''}
						updated_at = ?
					WHERE id = ? AND status = 'contract_offered'
						AND EXISTS (SELECT 1 FROM contracts WHERE id = ?)`,
					params: input.offer.service_engagement_id
						? [
								input.offer.effective_from,
								activeUntil,
								contractId,
								input.now,
								operationalId,
								contractId,
							]
						: [
								input.offer.effective_from,
								activeUntil,
								input.now,
								operationalId,
								contractId,
							],
				},
				...(input.offer.enrollment_id
					? [
							{
								sql: `INSERT OR IGNORE INTO price_review_triggers
									(id, course_group_id, source_kind, source_ref, reason_code,
									 effective_on, old_active_count, new_active_count,
									 old_lookup_children_count, new_lookup_children_count,
									 requested_price_version_id, dedupe_key, status, error_code,
									 created_by_user_id, created_at, processed_at, updated_at)
								SELECT ?, course_group_id, 'contract_activation', ?, 'activation',
									effective_from, ?, ?, ?, ?, price_version_id, ?, 'pending', NULL,
									?, ?, NULL, ? FROM contract_offers
								WHERE id = ? AND status = 'accepted_by_parent'
									AND EXISTS (SELECT 1 FROM contracts WHERE id = ?)
									AND EXISTS (SELECT 1 FROM enrollments WHERE id = ? AND status = 'active')`,
								params: [
									activationTriggerId,
									contractId,
									activationOldCount,
									activationOldCount + 1,
									repricingLookupChildrenCount(activationOldCount),
									repricingLookupChildrenCount(activationOldCount + 1),
									`enrollment:${input.offer.enrollment_id}:active_from:${input.offer.effective_from}:v1`,
									input.admin.id,
									input.now,
									input.now,
									input.offer.id,
									contractId,
									input.offer.enrollment_id,
								],
							},
							...(activeUntil && expiryTriggerId && expiryNewCount !== null
								? [
										{
											sql: `INSERT OR IGNORE INTO price_review_triggers
												(id, course_group_id, source_kind, source_ref, reason_code,
												 effective_on, old_active_count, new_active_count,
												 old_lookup_children_count, new_lookup_children_count,
												 requested_price_version_id, dedupe_key, status, error_code,
												 created_by_user_id, created_at, processed_at, updated_at)
											SELECT ?, course_group_id, 'enrollment_boundary', ?, 'expiry',
												?, ?, ?, ?, ?, price_version_id, ?, 'pending', NULL,
												?, ?, NULL, ? FROM contract_offers
											WHERE id = ? AND status = 'accepted_by_parent'
												AND EXISTS (SELECT 1 FROM contracts WHERE id = ?)
												AND EXISTS (SELECT 1 FROM enrollments WHERE id = ? AND status = 'active')`,
											params: [
												expiryTriggerId,
												input.offer.enrollment_id,
												activeUntil,
												expiryNewCount + 1,
												expiryNewCount,
												repricingLookupChildrenCount(expiryNewCount + 1),
												repricingLookupChildrenCount(expiryNewCount),
												`enrollment:${input.offer.enrollment_id}:active_until:${activeUntil}:v1`,
												input.admin.id,
												input.now,
												input.now,
												input.offer.id,
												contractId,
												input.offer.enrollment_id,
											],
										},
									]
								: []),
						]
					: []),
				{
					sql: `UPDATE contract_offers SET status = 'approved_by_admin',
						admin_approved_at = ?, updated_at = ?
					WHERE id = ? AND status = 'accepted_by_parent'
						AND EXISTS (SELECT 1 FROM contracts WHERE id = ?)`,
					params: [input.now, input.now, input.offer.id, contractId],
				},
				{
					sql: `INSERT INTO contract_formation_certificates
						(id, contract_id, contract_offer_id, contract_number,
						 source_snapshot_json, source_hash, schema_version, template_version,
						 parent_acceptance_id, parent_accepted_at, formed_by_admin_user_id,
						 formed_at, offer_pdf_hash, render_status, attempts, error_code,
						 certificate_pdf_r2_key, certificate_pdf_hash, generated_at,
						 created_at, updated_at)
					SELECT ?, ?, ?, ?, ?, ?, 'contract-formation-v1', template.template_version,
						?, ?, ?, ?, artifact.sha256, 'pending', 0, NULL, NULL, NULL, NULL, ?, ?
					FROM contract_offers offer
					JOIN contract_template_versions template ON template.id = offer.template_version_id
					JOIN contract_artifacts artifact ON artifact.contract_offer_id = offer.id
						AND artifact.artifact_kind = 'offer_pdf'
					WHERE offer.id = ? AND offer.status = 'approved_by_admin'
						AND EXISTS (SELECT 1 FROM contracts WHERE id = ?)`,
					params: [
						input.certificateId,
						contractId,
						input.offer.id,
						input.offer.contract_number,
						input.certificateSourceJson,
						input.certificateSourceHash,
						acceptance.id,
						acceptance.accepted_at,
						input.admin.id,
						input.now,
						input.now,
						input.now,
						input.offer.id,
						contractId,
					],
				},
				...(['formed', 'activated'] as const).map<StatementSpec>((eventType) => ({
					sql: `INSERT INTO contract_events
						(id, contract_id, event_type, effective_at, reason_code,
						 source_offer_id, actor_user_id, metadata_json, dedupe_key, created_at)
					SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM contracts WHERE id = ?)`,
					params: [
						crypto.randomUUID(),
						contractId,
						eventType,
						eventType === 'formed'
							? input.now
							: `${input.offer.effective_from}T00:00:00.000Z`,
						input.reason,
						input.offer.id,
						input.admin.id,
						JSON.stringify({
							effectiveFrom: input.offer.effective_from,
							effectiveTo: input.offer.effective_to,
						}),
						`${eventType}:${contractId}`,
						input.now,
						contractId,
					],
				})),
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'contract.formed_and_activated', 'contract',
						?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM contracts WHERE id = ?)`,
					params: [
						auditId,
						input.admin.id,
						contractId,
						input.requestId,
						JSON.stringify({
							offerId: input.offer.id,
							effectiveFrom: input.offer.effective_from,
						}),
						input.now,
						contractId,
					],
				},
				{
					sql: `INSERT INTO contract_admin_actions
						(id, contract_offer_id, action, actor_user_id, idempotency_key,
						 request_hash_sha256, result_ref, audit_event_id, created_at)
					SELECT ?, ?, 'form_activate', ?, ?, ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
					params: [
						actionId,
						input.offer.id,
						input.admin.id,
						input.idempotencyKey,
						requestHash,
						contractId,
						auditId,
						input.now,
						auditId,
					],
				},
				{
					sql: `INSERT INTO contract_outbox_events
						(id, event_type, source_kind, source_id, payload_json, dedupe_key,
						 status, created_at)
					SELECT ?, 'contract_formed', 'contract', ?, ?, ?, 'pending', ?
					WHERE EXISTS (SELECT 1 FROM contracts WHERE id = ?)`,
					params: [
						crypto.randomUUID(),
						contractId,
						JSON.stringify({ contractId, certificateId: input.certificateId }),
						`contract-formed:${contractId}`,
						input.now,
						contractId,
					],
				},
				{
					sql: `INSERT INTO contract_action_assertions
						(id, scope, target_id, action_id, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, 'form_activate', ?, ?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM contracts WHERE id = ?)
						AND EXISTS (SELECT 1 FROM contract_formation_certificates
							WHERE id = ? AND source_hash = ?)
						AND EXISTS (SELECT 1 FROM ${operationalTable} WHERE id = ? AND status = 'active')
						AND EXISTS (SELECT 1 FROM contracts contract
							JOIN contract_acceptances acceptance
								ON acceptance.id = contract.parent_acceptance_id
							JOIN users owner ON owner.id = contract.user_id
							WHERE contract.id = ?
								AND acceptance.user_id = owner.id
								AND acceptance.user_id <> contract.formed_by_admin_user_id
								AND owner.role = 'parent' AND owner.email_verified_at IS NOT NULL
								AND owner.account_status = 'active' AND owner.is_blocked = 0)
						AND EXISTS (SELECT 1 FROM contract_admin_actions WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						crypto.randomUUID(),
						contractId,
						actionId,
						input.admin.id,
						auditId,
						contractId,
						input.certificateId,
						input.certificateSourceHash,
						operationalId,
						contractId,
						actionId,
						input.now,
					],
				},
			]);
			return { contractId, replayed: false };
		} catch (error) {
			const replay = await this.db.first<{ request_hash_sha256: string; result_ref: string }>(
				{
					sql: `SELECT request_hash_sha256, result_ref FROM contract_admin_actions
				WHERE actor_user_id = ? AND idempotency_key = ?`,
					params: [input.admin.id, input.idempotencyKey],
				}
			);
			if (replay?.request_hash_sha256 === requestHash) {
				return { contractId: replay.result_ref, replayed: true };
			}
			throw new ContractRepositoryError('CONTRACT_FORMATION_REJECTED', { cause: error });
		}
	}

	loadCertificateByContract(contractId: string) {
		return this.db.first<{
			id: string;
			contract_id: string;
			contract_offer_id: string;
			contract_number: string;
			source_snapshot_json: string;
			source_hash: string;
			template_version: string;
			parent_accepted_at: string;
			formed_at: string;
			offer_pdf_hash: string;
			render_status: 'pending' | 'rendering' | 'ready' | 'failed';
			attempts: number;
			certificate_pdf_r2_key: string | null;
		}>({
			sql: `SELECT id, contract_id, contract_offer_id, contract_number,
				source_snapshot_json, source_hash, template_version, parent_accepted_at,
				formed_at, offer_pdf_hash, render_status, attempts, certificate_pdf_r2_key
			FROM contract_formation_certificates WHERE contract_id = ?`,
			params: [contractId],
		});
	}

	async completeCertificate(input: {
		certificateId: string;
		contractId: string;
		offerId: string;
		template: StoredTemplateVersion;
		key: string;
		size: number;
		sha256: string;
		sourceHash: string;
		now: string;
		storageIntentId?: string;
	}) {
		await this.db.batch([
			{
				sql: `UPDATE contract_formation_certificates SET render_status = 'ready',
					attempts = attempts + 1, error_code = NULL, certificate_pdf_r2_key = ?,
					certificate_pdf_hash = ?, generated_at = ?, updated_at = ?
				WHERE id = ? AND contract_id = ? AND source_hash = ?
					AND render_status IN ('pending', 'failed') AND attempts < 3
					AND (? IS NULL OR EXISTS (SELECT 1 FROM storage_object_intents
						WHERE id = ? AND status = 'staged' AND storage_class = 'archive'
							AND object_key = ?))`,
				params: [
					input.key,
					input.sha256,
					input.now,
					input.now,
					input.certificateId,
					input.contractId,
					input.sourceHash,
					input.storageIntentId ?? null,
					input.storageIntentId ?? null,
					input.key,
				],
			},
			{
				sql: `INSERT INTO contract_artifacts
					(id, contract_offer_id, formation_certificate_id, artifact_kind,
					 private_r2_key, content_type, size_bytes, sha256, source_hash,
					 template_version_id, renderer_id, renderer_contract_version,
					 worker_compatibility_date, created_at)
				SELECT ?, NULL, ?, 'formation_certificate_pdf', ?, 'application/pdf',
					?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
					SELECT 1 FROM contract_formation_certificates WHERE id = ?
						AND render_status = 'ready' AND certificate_pdf_hash = ?)`,
				params: [
					crypto.randomUUID(),
					input.certificateId,
					input.key,
					input.size,
					input.sha256,
					input.sourceHash,
					input.template.id,
					input.template.renderer_id,
					input.template.renderer_contract_version,
					input.template.worker_compatibility_date,
					input.now,
					input.certificateId,
					input.sha256,
				],
			},
			...(input.storageIntentId
				? [
						{
							sql: `UPDATE storage_object_intents SET status = 'linked', linked_at = ?,
						updated_at = ?, lease_owner = NULL, lease_until = NULL, last_error_code = NULL
					WHERE id = ? AND status = 'staged' AND object_key = ?
						AND EXISTS (SELECT 1 FROM contract_artifacts
							WHERE formation_certificate_id = ? AND private_r2_key = ?)`,
							params: [
								input.now,
								input.now,
								input.storageIntentId,
								input.key,
								input.certificateId,
								input.key,
							],
						},
						{
							sql: `INSERT INTO storage_intent_link_assertions
						(id, intent_id, target_kind, target_id, assertion_passed, created_at)
					VALUES (?, ?, 'formation_certificate_pdf', ?, CASE WHEN
						EXISTS (SELECT 1 FROM storage_object_intents
							WHERE id = ? AND status = 'linked' AND object_key = ?)
						AND EXISTS (SELECT 1 FROM contract_artifacts
							WHERE formation_certificate_id = ? AND private_r2_key = ?)
					THEN 1 ELSE 0 END, ?)`,
							params: [
								crypto.randomUUID(),
								input.storageIntentId,
								input.certificateId,
								input.storageIntentId,
								input.key,
								input.certificateId,
								input.key,
								input.now,
							],
						},
					]
				: []),
			...(['parent', 'verein'] as const).map<StatementSpec>((role) => ({
				sql: `INSERT INTO contract_deliveries
					(id, contract_offer_id, contract_id, artifact_kind, artifact_hash,
					 channel, recipient_role, recipient_user_id, delivery_status,
					 dedupe_key, delivered_at, access_expires_at, created_at)
				SELECT ?, ?, ?, 'formation_certificate_pdf', ?, 'portal', ?,
					CASE WHEN ? = 'parent' THEN contract.user_id ELSE NULL END,
					'available', ?, ?, NULL, ? FROM contracts contract
				WHERE contract.id = ? AND EXISTS (SELECT 1 FROM contract_formation_certificates
					WHERE id = ? AND render_status = 'ready')`,
				params: [
					crypto.randomUUID(),
					input.offerId,
					input.contractId,
					input.sha256,
					role,
					role,
					`formation-certificate:${role}:${input.contractId}`,
					input.now,
					input.now,
					input.contractId,
					input.certificateId,
				],
			})),
		]);
	}

	markCertificateFailed(certificateId: string, errorCode: string, now: string) {
		return this.db.run({
			sql: `UPDATE contract_formation_certificates SET render_status = 'failed',
				attempts = attempts + 1, error_code = ?, updated_at = ?
			WHERE id = ? AND render_status IN ('pending', 'failed') AND attempts < 3`,
			params: [errorCode, now, certificateId],
		});
	}

	loadOwnedContract(userId: string, contractId: string, offerId: string) {
		return this.db.first<{
			id: string;
			contract_offer_id: string;
			contract_kind: ContractTemplateId;
			effective_to: string | null;
			enrollment_id: string | null;
			service_engagement_id: string | null;
			distance_legal_profile:
				'offline_only' | 'widerruf_applicable' | 'widerruf_not_applicable_312g_2_9';
			kuendigung_function_required: number;
		}>({
			sql: `SELECT contract.id, contract.contract_offer_id, offer.contract_kind,
				contract.effective_to, contract.enrollment_id, contract.service_engagement_id,
				template.distance_legal_profile, template.kuendigung_function_required
			FROM contracts contract
			JOIN contract_offers offer ON offer.id = contract.contract_offer_id
			JOIN contract_template_versions template ON template.id = offer.template_version_id
			JOIN users owner ON owner.id = contract.user_id
			WHERE contract.id = ? AND contract.user_id = ? AND contract.contract_offer_id = ?
				AND contract.operational_status = 'active'
				AND owner.role = 'parent' AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL`,
			params: [contractId, userId, offerId],
		});
	}

	loadOwnedEndRequestReplay(input: {
		userId: string;
		contractId: string;
		offerId: string;
		idempotencyKey: string;
	}) {
		return this.db.first<{
			id: string;
			request_hash: string;
			status: string;
			calculated_effective_on: string | null;
		}>({
			sql: `SELECT request.id, request.request_hash, request.status,
				request.calculated_effective_on
			FROM contract_end_requests request
			JOIN contracts contract ON contract.id = request.contract_id
			JOIN contract_offers offer ON offer.id = contract.contract_offer_id
			JOIN users owner ON owner.id = contract.user_id
			WHERE request.idempotency_key = ? AND request.contract_id = ?
				AND request.requested_by_user_id = ?
				AND request.submission_channel = 'authenticated_portal'
				AND contract.user_id = ? AND contract.contract_offer_id = ?
				AND offer.user_id = contract.user_id
				AND owner.role = 'parent' AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL
				AND EXISTS (SELECT 1 FROM contract_action_assertions assertion
					WHERE assertion.scope = 'end_request'
						AND assertion.target_id = contract.id
						AND assertion.action_id = request.id
						AND assertion.actor_user_id = ?
						AND assertion.assertion_passed = 1)`,
			params: [
				input.idempotencyKey,
				input.contractId,
				input.userId,
				input.userId,
				input.offerId,
				input.userId,
			],
		});
	}

	async recordEndRequest(input: {
		actor: AuthenticatedUser;
		contract: Awaited<ReturnType<ContractRepository['loadOwnedContract']>> & {};
		kind:
			| 'withdrawal'
			| 'ordinary_termination'
			| 'extraordinary_termination'
			| 'mutual_termination_request';
		requestedEffectiveOn: string | null;
		calculatedEffectiveOn: string | null;
		requestTextVersion: string;
		idempotencyKey: string;
		requestHash: string;
		requestId: string;
		now: string;
	}) {
		const prior = await this.loadOwnedEndRequestReplay({
			userId: input.actor.id,
			contractId: input.contract.id,
			offerId: input.contract.contract_offer_id,
			idempotencyKey: input.idempotencyKey,
		});
		if (prior) {
			if (prior.request_hash !== input.requestHash) {
				throw new ContractRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			return {
				requestId: prior.id,
				status: prior.status,
				calculatedEffectiveOn: prior.calculated_effective_on,
				replayed: true,
			};
		}
		const endRequestId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		const initialStatus = input.kind === 'withdrawal' ? 'completed' : 'received';
		const firstEvent =
			input.kind === 'withdrawal' ? 'withdrawal_received' : 'termination_received';
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO contract_end_requests
					(id, contract_id, requested_by_user_id, submission_channel,
					 requester_identity_evidence_json, kind, requested_effective_on,
					 received_at, recorded_at, server_ingested_at, request_text_version,
					 request_hash, idempotency_key, status, calculated_effective_on,
					 admin_reason, reviewed_by, reviewed_at, external_debt_check_result,
					 confirmation_delivery_id, created_at, updated_at)
				SELECT ?, contract.id, ?, 'authenticated_portal', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
					NULL, NULL, NULL, NULL, NULL, ?, ? FROM contracts contract
				JOIN users owner ON owner.id = contract.user_id
				WHERE contract.id = ? AND contract.user_id = ? AND contract.operational_status = 'active'
					AND owner.role = 'parent' AND owner.account_status = 'active'
					AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL`,
				params: [
					endRequestId,
					input.actor.id,
					input.kind,
					input.requestedEffectiveOn,
					input.now,
					input.now,
					input.now,
					input.requestTextVersion,
					input.requestHash,
					input.idempotencyKey,
					initialStatus,
					input.calculatedEffectiveOn,
					input.now,
					input.now,
					input.contract.id,
					input.actor.id,
				],
			},
			{
				sql: `INSERT INTO contract_events
					(id, contract_id, event_type, effective_at, reason_code, source_offer_id,
					 actor_user_id, metadata_json, dedupe_key, created_at)
				SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM contract_end_requests WHERE id = ?)`,
				params: [
					crypto.randomUUID(),
					input.contract.id,
					firstEvent,
					input.now,
					input.kind,
					input.contract.contract_offer_id,
					input.actor.id,
					JSON.stringify({
						requestId: endRequestId,
						requestedEffectiveOn: input.requestedEffectiveOn,
						calculatedEffectiveOn: input.calculatedEffectiveOn,
					}),
					`end-received:${endRequestId}`,
					input.now,
					endRequestId,
				],
			},
			...(input.kind === 'ordinary_termination' &&
			input.contract.contract_kind === 'group_yearly'
				? ([
						{
							sql: `UPDATE contracts SET auto_renewal_blocked_at = ? WHERE id = ?
						AND EXISTS (SELECT 1 FROM contract_end_requests WHERE id = ?)`,
							params: [input.now, input.contract.id, endRequestId],
						},
						{
							sql: `INSERT INTO contract_events
						(id, contract_id, event_type, effective_at, reason_code, source_offer_id,
						 actor_user_id, metadata_json, dedupe_key, created_at)
					SELECT ?, ?, 'renewal_blocked', ?, 'ordinary_termination', ?, ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM contract_end_requests WHERE id = ?)`,
							params: [
								crypto.randomUUID(),
								input.contract.id,
								input.now,
								input.contract.contract_offer_id,
								input.actor.id,
								JSON.stringify({
									requestId: endRequestId,
									contractualEnd: input.contract.effective_to,
								}),
								`renewal-blocked:${endRequestId}`,
								input.now,
								endRequestId,
							],
						},
					] satisfies StatementSpec[])
				: []),
			...(input.kind === 'withdrawal'
				? ([
						{
							sql: `UPDATE contracts SET operational_status = 'terminated'
						WHERE id = ? AND EXISTS (SELECT 1 FROM contract_end_requests WHERE id = ?)`,
							params: [input.contract.id, endRequestId],
						},
						{
							sql: `UPDATE ${input.contract.enrollment_id ? 'enrollments' : 'service_engagements'}
						SET status = 'ended', updated_at = ? WHERE id = ? AND status = 'active'`,
							params: [
								input.now,
								input.contract.enrollment_id ??
									input.contract.service_engagement_id,
							],
						},
						{
							sql: `INSERT INTO contract_events
						(id, contract_id, event_type, effective_at, reason_code, source_offer_id,
						 actor_user_id, metadata_json, dedupe_key, created_at)
					SELECT ?, ?, 'withdrawn', ?, 'statutory_withdrawal', ?, ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM contract_end_requests WHERE id = ?)`,
							params: [
								crypto.randomUUID(),
								input.contract.id,
								input.now,
								input.contract.contract_offer_id,
								input.actor.id,
								JSON.stringify({ requestId: endRequestId }),
								`withdrawn:${endRequestId}`,
								input.now,
								endRequestId,
							],
						},
					] satisfies StatementSpec[])
				: []),
			{
				sql: `INSERT INTO contract_outbox_events
					(id, event_type, source_kind, source_id, payload_json, dedupe_key, status, created_at)
				SELECT ?, 'termination_received', 'contract_end_request', ?, ?, ?, 'pending', ?
				WHERE EXISTS (SELECT 1 FROM contract_end_requests WHERE id = ?)`,
				params: [
					crypto.randomUUID(),
					endRequestId,
					JSON.stringify({
						requestId: endRequestId,
						confirmation: 'durable_medium_required',
					}),
					`termination-confirmation:${endRequestId}`,
					input.now,
					endRequestId,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
				SELECT ?, ?, 'user', 'contract.end_request.received', 'contract_end_request',
					?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM contract_end_requests WHERE id = ?)`,
				params: [
					auditId,
					input.actor.id,
					endRequestId,
					input.requestId,
					JSON.stringify({
						kind: input.kind,
						calculatedEffectiveOn: input.calculatedEffectiveOn,
					}),
					input.now,
					endRequestId,
				],
			},
			{
				sql: `INSERT INTO contract_action_assertions
					(id, scope, target_id, action_id, actor_user_id, audit_event_id,
					 assertion_passed, created_at)
				VALUES (?, 'end_request', ?, ?, ?, ?, CASE WHEN
					EXISTS (SELECT 1 FROM contract_end_requests WHERE id = ?)
					AND EXISTS (SELECT 1 FROM contract_outbox_events WHERE source_id = ?)
					AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
				THEN 1 ELSE 0 END, ?)`,
				params: [
					crypto.randomUUID(),
					input.contract.id,
					endRequestId,
					input.actor.id,
					auditId,
					endRequestId,
					endRequestId,
					auditId,
					input.now,
				],
			},
		];
		try {
			await this.db.batch(statements);
			return {
				requestId: endRequestId,
				status: initialStatus,
				calculatedEffectiveOn: input.calculatedEffectiveOn,
				replayed: false,
			};
		} catch (error) {
			const replay = await this.loadOwnedEndRequestReplay({
				userId: input.actor.id,
				contractId: input.contract.id,
				offerId: input.contract.contract_offer_id,
				idempotencyKey: input.idempotencyKey,
			});
			if (replay) {
				if (replay.request_hash !== input.requestHash) {
					throw new ContractRepositoryError('IDEMPOTENCY_KEY_REUSED');
				}
				return {
					requestId: replay.id,
					status: replay.status,
					calculatedEffectiveOn: replay.calculated_effective_on,
					replayed: true,
				};
			}
			throw new ContractRepositoryError('CONTRACT_END_REQUEST_REJECTED', { cause: error });
		}
	}

	loadEndRequestForAdmin(endRequestId: string) {
		return this.db.first<{
			id: string;
			contract_id: string;
			contract_offer_id: string;
			kind:
				| 'withdrawal'
				| 'ordinary_termination'
				| 'extraordinary_termination'
				| 'mutual_termination_request';
			status: string;
			calculated_effective_on: string | null;
		}>({
			sql: `SELECT request.id, request.contract_id, contract.contract_offer_id,
				request.kind, request.status, request.calculated_effective_on
			FROM contract_end_requests request
			JOIN contracts contract ON contract.id = request.contract_id
			JOIN users owner ON owner.id = contract.user_id
			WHERE request.id = ? AND owner.account_status = 'active'
				AND NOT EXISTS (SELECT 1 FROM legal_archive_records archive
					WHERE archive.target_kind = 'contract_end_request'
						AND archive.target_id = request.id)`,
			params: [endRequestId],
		});
	}

	async reviewEndRequest(input: {
		admin: AdminActor;
		request: Awaited<ReturnType<ContractRepository['loadEndRequestForAdmin']>> & {};
		decision: 'effective_date_confirmed' | 'disputed' | 'approved' | 'declined';
		effectiveOn: string | null;
		reason: string;
		externalDebtCheckResult: 'not_checked' | 'no_debt_reported' | 'debt_reported' | 'unknown';
		idempotencyKey: string;
		requestHash: string;
		requestId: string;
		now: string;
	}) {
		const prior = await this.loadAdminAction(input.admin.id, input.idempotencyKey);
		if (prior) {
			if (
				prior.action !== 'termination_review' ||
				prior.request_hash_sha256 !== input.requestHash
			) {
				throw new ContractRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			return { endRequestId: prior.result_ref, status: input.decision, replayed: true };
		}
		const auditId = crypto.randomUUID();
		const actionId = crypto.randomUUID();
		const eventType =
			input.decision === 'effective_date_confirmed'
				? 'termination_effective_date_confirmed'
				: input.decision === 'disputed'
					? 'termination_disputed'
					: input.decision === 'approved'
						? 'mutual_termination_approved'
						: 'mutual_termination_declined';
		try {
			await this.db.batch([
				{
					sql: `UPDATE contract_end_requests SET status = ?,
						calculated_effective_on = CASE WHEN ? = 'effective_date_confirmed'
							THEN COALESCE(?, calculated_effective_on) ELSE calculated_effective_on END,
						admin_reason = ?, reviewed_by = ?, reviewed_at = ?,
						external_debt_check_result = ?, updated_at = ?
					WHERE id = ? AND status = 'received' AND ${ACTIVE_ADMIN}
						AND EXISTS (SELECT 1 FROM contracts contract JOIN users owner
							ON owner.id = contract.user_id
							WHERE contract.id = contract_end_requests.contract_id
								AND owner.account_status = 'active')
						AND NOT EXISTS (SELECT 1 FROM legal_archive_records archive
							WHERE archive.target_kind = 'contract_end_request'
								AND archive.target_id = contract_end_requests.id)
						AND ((kind = 'mutual_termination_request' AND ? IN ('approved', 'declined'))
							OR (kind <> 'mutual_termination_request'
								AND ? IN ('effective_date_confirmed', 'disputed')))`,
					params: [
						input.decision,
						input.decision,
						input.effectiveOn,
						input.reason,
						input.admin.id,
						input.now,
						input.externalDebtCheckResult,
						input.now,
						input.request.id,
						input.admin.id,
						input.decision,
						input.decision,
					],
				},
				{
					sql: `INSERT INTO contract_events
						(id, contract_id, event_type, effective_at, reason_code, source_offer_id,
						 actor_user_id, metadata_json, dedupe_key, created_at)
					SELECT ?, request.contract_id, ?, ?, ?, contract.contract_offer_id, ?, ?, ?, ?
					FROM contract_end_requests request JOIN contracts contract ON contract.id = request.contract_id
					WHERE request.id = ? AND request.status = ? AND request.reviewed_by = ?`,
					params: [
						crypto.randomUUID(),
						eventType,
						input.now,
						input.reason,
						input.admin.id,
						JSON.stringify({
							endRequestId: input.request.id,
							effectiveOn: input.effectiveOn,
						}),
						`termination-review:${input.request.id}`,
						input.now,
						input.request.id,
						input.decision,
						input.admin.id,
					],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'contract.termination_reviewed', 'contract_end_request',
						?, ?, ?, ? FROM contract_end_requests request
					WHERE request.id = ? AND request.status = ? AND request.reviewed_by = ?`,
					params: [
						auditId,
						input.admin.id,
						input.request.id,
						input.requestId,
						JSON.stringify({
							decision: input.decision,
							effectiveOn: input.effectiveOn,
						}),
						input.now,
						input.request.id,
						input.decision,
						input.admin.id,
					],
				},
				{
					sql: `INSERT INTO contract_admin_actions
						(id, contract_offer_id, action, actor_user_id, idempotency_key,
						 request_hash_sha256, result_ref, audit_event_id, created_at)
					SELECT ?, ?, 'termination_review', ?, ?, ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
					params: [
						actionId,
						input.request.contract_offer_id,
						input.admin.id,
						input.idempotencyKey,
						input.requestHash,
						input.request.id,
						auditId,
						input.now,
						auditId,
					],
				},
				{
					sql: `INSERT INTO contract_action_assertions
						(id, scope, target_id, action_id, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, 'termination_review', ?, ?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM contract_end_requests WHERE id = ? AND status = ?)
						AND EXISTS (SELECT 1 FROM contract_admin_actions WHERE id = ?)
						AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						crypto.randomUUID(),
						input.request.id,
						actionId,
						input.admin.id,
						auditId,
						input.request.id,
						input.decision,
						actionId,
						auditId,
						input.now,
					],
				},
			]);
			return { endRequestId: input.request.id, status: input.decision, replayed: false };
		} catch (error) {
			throw new ContractRepositoryError('TERMINATION_REVIEW_REJECTED', { cause: error });
		}
	}

	async listAdminEndRequests() {
		const rows = await this.db.all<{
			id: string;
			contract_number: string;
			kind: string;
			status: string;
			received_at: string;
			requested_effective_on: string | null;
			calculated_effective_on: string | null;
		}>({
			sql: `SELECT request.id, contract.contract_number, request.kind, request.status,
				request.received_at, request.requested_effective_on, request.calculated_effective_on
			FROM contract_end_requests request
			JOIN contracts contract ON contract.id = request.contract_id
			JOIN users owner ON owner.id = contract.user_id
			WHERE owner.account_status = 'active'
				AND NOT EXISTS (SELECT 1 FROM legal_archive_records archive
					WHERE archive.target_kind = 'contract_end_request'
						AND archive.target_id = request.id)
			ORDER BY request.received_at DESC, request.id DESC LIMIT 100`,
		});
		return rows.results;
	}

	loadOwnedAttendanceNoticeReplay(input: {
		userId: string;
		contractId: string;
		offerId: string;
		idempotencyKey: string;
	}) {
		return this.db.first<{ id: string; notice_hash: string }>({
			sql: `SELECT notice.id, notice.notice_hash
			FROM service_attendance_notices notice
			JOIN contracts contract ON contract.id = notice.contract_id
			JOIN contract_offers offer ON offer.id = contract.contract_offer_id
			JOIN users owner ON owner.id = contract.user_id
			WHERE notice.idempotency_key = ? AND notice.contract_id = ?
				AND notice.requested_by_user_id = ?
				AND notice.submission_channel = 'authenticated_portal'
				AND notice.service_engagement_id = contract.service_engagement_id
				AND contract.user_id = ? AND contract.contract_offer_id = ?
				AND offer.user_id = contract.user_id AND offer.child_id = contract.child_id
				AND owner.role = 'parent' AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL
				AND EXISTS (SELECT 1 FROM contract_action_assertions assertion
					WHERE assertion.scope = 'attendance_notice'
						AND assertion.target_id = contract.id
						AND assertion.action_id = notice.id
						AND assertion.actor_user_id = ?
						AND assertion.assertion_passed = 1)`,
			params: [
				input.idempotencyKey,
				input.contractId,
				input.userId,
				input.userId,
				input.offerId,
				input.userId,
			],
		});
	}

	async recordAttendanceNotice(input: {
		actor: AuthenticatedUser;
		contractId: string;
		offerId: string;
		noticeTextVersion: string;
		idempotencyKey: string;
		noticeHash: string;
		requestId: string;
		now: string;
	}) {
		const prior = await this.loadOwnedAttendanceNoticeReplay({
			userId: input.actor.id,
			contractId: input.contractId,
			offerId: input.offerId,
			idempotencyKey: input.idempotencyKey,
		});
		if (prior) {
			if (prior.notice_hash !== input.noticeHash) {
				throw new ContractRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			return { noticeId: prior.id, replayed: true };
		}
		const noticeId = crypto.randomUUID();
		const taskId = crypto.randomUUID();
		const eventId = crypto.randomUUID();
		const outboxId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO admin_review_tasks
						(id, kind, source_kind, source_id, reason_code, safe_summary,
						 status, assigned_to, resolution, created_at, updated_at, resolved_at)
					SELECT ?, 'contract_attendance', 'service_attendance_notice', ?,
						'attendance_ceased', 'Attendance notice requires teacher notification',
						'open', NULL, NULL, ?, ?, NULL
					FROM contracts contract
					JOIN contract_offers offer ON offer.id = contract.contract_offer_id
					JOIN users owner ON owner.id = contract.user_id
					JOIN service_engagements engagement
						ON engagement.id = contract.service_engagement_id
						AND engagement.contract_id = contract.id
						AND engagement.user_id = contract.user_id
						AND engagement.child_id = contract.child_id
					WHERE contract.id = ? AND contract.user_id = ?
						AND contract.contract_offer_id = ?
						AND contract.operational_status = 'active'
						AND offer.user_id = contract.user_id AND offer.child_id = contract.child_id
						AND engagement.status IN ('active', 'funding_review')
						AND owner.role = 'parent' AND owner.account_status = 'active'
						AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL`,
					params: [
						taskId,
						noticeId,
						input.now,
						input.now,
						input.contractId,
						input.actor.id,
						input.offerId,
					],
				},
				{
					sql: `INSERT INTO service_attendance_notices
						(id, contract_id, service_engagement_id, requested_by_user_id,
						 submission_channel, received_at, recorded_at, server_ingested_at,
						 notice_text_version, notice_hash, idempotency_key,
						 teacher_notification_task_id, confirmation_delivery_id,
						 scheduled_lesson_ref, agreed_start_at, agreed_place_ref,
						 teacher_arrived_at, teacher_waited_until, teacher_attested_by,
						 teacher_attested_at, created_at)
					SELECT ?, contract.id, contract.service_engagement_id, ?, 'authenticated_portal',
						?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?
					FROM contracts contract
					JOIN contract_offers offer ON offer.id = contract.contract_offer_id
					JOIN users owner ON owner.id = contract.user_id
					JOIN service_engagements engagement
						ON engagement.id = contract.service_engagement_id
						AND engagement.contract_id = contract.id
						AND engagement.user_id = contract.user_id
						AND engagement.child_id = contract.child_id
					WHERE contract.id = ? AND contract.user_id = ?
						AND contract.contract_offer_id = ?
						AND contract.operational_status = 'active'
						AND offer.user_id = contract.user_id AND offer.child_id = contract.child_id
						AND owner.role = 'parent' AND owner.account_status = 'active'
						AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL
						AND engagement.status IN ('active', 'funding_review')
						AND EXISTS (SELECT 1 FROM admin_review_tasks task
							WHERE task.id = ? AND task.kind = 'contract_attendance'
								AND task.source_kind = 'service_attendance_notice'
								AND task.source_id = ? AND task.status = 'open')`,
					params: [
						noticeId,
						input.actor.id,
						input.now,
						input.now,
						input.now,
						input.noticeTextVersion,
						input.noticeHash,
						input.idempotencyKey,
						taskId,
						input.now,
						input.contractId,
						input.actor.id,
						input.offerId,
						taskId,
						noticeId,
					],
				},
				{
					sql: `UPDATE service_engagements SET status = 'ended', attendance_ceased_at = ?,
						attendance_notice_id = ?, updated_at = ?
						WHERE id = (SELECT contract.service_engagement_id FROM contracts contract
							WHERE contract.id = ? AND contract.user_id = ?
								AND contract.contract_offer_id = ?)
						AND contract_id = ? AND user_id = ?
						AND status IN ('active', 'funding_review')
						AND EXISTS (SELECT 1 FROM service_attendance_notices notice
							WHERE notice.id = ? AND notice.contract_id = ?
								AND notice.service_engagement_id = service_engagements.id)`,
					params: [
						input.now,
						noticeId,
						input.now,
						input.contractId,
						input.actor.id,
						input.offerId,
						input.contractId,
						input.actor.id,
						noticeId,
						input.contractId,
					],
				},
				{
					sql: `INSERT INTO contract_events
						(id, contract_id, event_type, effective_at, reason_code, source_offer_id,
						 actor_user_id, metadata_json, dedupe_key, created_at)
					SELECT ?, contract.id, 'attendance_ceased', ?, 'parent_notice',
						contract.contract_offer_id, ?, ?, ?, ? FROM contracts contract
					WHERE contract.id = ? AND EXISTS (SELECT 1 FROM service_attendance_notices WHERE id = ?)`,
					params: [
						eventId,
						input.now,
						input.actor.id,
						JSON.stringify({ noticeId }),
						`attendance-ceased:${noticeId}`,
						input.now,
						input.contractId,
						noticeId,
					],
				},
				{
					sql: `INSERT INTO contract_outbox_events
						(id, event_type, source_kind, source_id, payload_json, dedupe_key, status, created_at)
					SELECT ?, 'attendance_ceased', 'service_attendance_notice', ?, ?, ?, 'pending', ?
					WHERE EXISTS (SELECT 1 FROM service_attendance_notices WHERE id = ?)`,
					params: [
						outboxId,
						noticeId,
						JSON.stringify({ noticeId, confirmation: 'durable_medium_required' }),
						`attendance-confirmation:${noticeId}`,
						input.now,
						noticeId,
					],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'contract.attendance_ceased', 'contract', ?, ?,
						'{"futureUnits":"ceased"}', ?
					WHERE EXISTS (SELECT 1 FROM service_attendance_notices WHERE id = ?)`,
					params: [
						auditId,
						input.actor.id,
						input.contractId,
						input.requestId,
						input.now,
						noticeId,
					],
				},
				{
					sql: `INSERT INTO contract_action_assertions
						(id, scope, target_id, action_id, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, 'attendance_notice', ?, ?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM service_attendance_notices notice
							JOIN contracts contract ON contract.id = notice.contract_id
							JOIN contract_offers offer ON offer.id = contract.contract_offer_id
							JOIN users owner ON owner.id = contract.user_id
							JOIN service_engagements engagement
								ON engagement.id = notice.service_engagement_id
							WHERE notice.id = ? AND notice.contract_id = ?
								AND notice.requested_by_user_id = ?
								AND notice.submission_channel = 'authenticated_portal'
								AND notice.notice_text_version = ? AND notice.notice_hash = ?
								AND notice.idempotency_key = ?
								AND notice.teacher_notification_task_id = ?
								AND contract.contract_offer_id = ?
								AND contract.user_id = ? AND contract.operational_status = 'active'
								AND offer.user_id = contract.user_id
								AND offer.child_id = contract.child_id
								AND owner.role = 'parent' AND owner.account_status = 'active'
								AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL
								AND engagement.id = contract.service_engagement_id
								AND engagement.contract_id = contract.id
								AND engagement.user_id = contract.user_id
								AND engagement.child_id = contract.child_id
								AND engagement.status = 'ended'
								AND engagement.attendance_notice_id = notice.id
								AND engagement.attendance_ceased_at = ?)
						AND EXISTS (SELECT 1 FROM admin_review_tasks task
							WHERE task.id = ? AND task.kind = 'contract_attendance'
								AND task.source_kind = 'service_attendance_notice'
								AND task.source_id = ? AND task.reason_code = 'attendance_ceased'
								AND task.status = 'open')
						AND EXISTS (SELECT 1 FROM contract_events event
							WHERE event.id = ? AND event.contract_id = ?
								AND event.event_type = 'attendance_ceased'
								AND event.source_offer_id = ? AND event.actor_user_id = ?
								AND event.dedupe_key = ?)
						AND EXISTS (SELECT 1 FROM contract_outbox_events outbox
							WHERE outbox.id = ? AND outbox.event_type = 'attendance_ceased'
								AND outbox.source_kind = 'service_attendance_notice'
								AND outbox.source_id = ? AND outbox.dedupe_key = ?
								AND outbox.status IN ('pending', 'consumed'))
						AND EXISTS (SELECT 1 FROM audit_events audit
							WHERE audit.id = ? AND audit.actor_user_id = ?
								AND audit.actor_kind = 'user'
								AND audit.action = 'contract.attendance_ceased'
								AND audit.target_kind = 'contract' AND audit.target_id = ?
								AND audit.request_id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						crypto.randomUUID(),
						input.contractId,
						noticeId,
						input.actor.id,
						auditId,
						noticeId,
						input.contractId,
						input.actor.id,
						input.noticeTextVersion,
						input.noticeHash,
						input.idempotencyKey,
						taskId,
						input.offerId,
						input.actor.id,
						input.now,
						taskId,
						noticeId,
						eventId,
						input.contractId,
						input.offerId,
						input.actor.id,
						`attendance-ceased:${noticeId}`,
						outboxId,
						noticeId,
						`attendance-confirmation:${noticeId}`,
						auditId,
						input.actor.id,
						input.contractId,
						input.requestId,
						input.now,
					],
				},
			]);
			return { noticeId, replayed: false };
		} catch (error) {
			const replay = await this.loadOwnedAttendanceNoticeReplay({
				userId: input.actor.id,
				contractId: input.contractId,
				offerId: input.offerId,
				idempotencyKey: input.idempotencyKey,
			});
			if (replay) {
				if (replay.notice_hash !== input.noticeHash) {
					throw new ContractRepositoryError('IDEMPOTENCY_KEY_REUSED');
				}
				return { noticeId: replay.id, replayed: true };
			}
			throw new ContractRepositoryError('ATTENDANCE_NOTICE_REJECTED', { cause: error });
		}
	}

	loadMediaDecisionContext(
		userId: string,
		childId: string,
		contactVersionId: string,
		offerId: string
	) {
		return this.db.first<{
			contact_id: string | null;
			snapshot_hash: string | null;
			approval_status: string | null;
			compliance_assessment_status: string | null;
		}>({
			sql: `SELECT contact.id AS contact_id, contact.snapshot_hash,
				contact.approval_status, contact.compliance_assessment_status
			FROM contract_offers offer
			JOIN contract_template_versions template ON template.id = offer.template_version_id
			JOIN children child ON child.id = offer.child_id
				AND child.owner_user_id = offer.user_id
			JOIN users owner ON owner.id = child.owner_user_id
			LEFT JOIN media_withdrawal_contact_versions contact
				ON contact.id = template.media_contact_version_id AND contact.id = ?
			WHERE offer.id = ? AND offer.user_id = ? AND child.id = ?
				AND child.family_number_id = owner.family_number_id
				AND owner.role = 'parent' AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL`,
			params: [contactVersionId, offerId, userId, childId],
		});
	}

	loadOwnedMediaDecisionReplay(input: {
		userId: string;
		offerId: string;
		childId: string;
		contactVersionId: string;
		contactSnapshotHash: string;
		idempotencyKey: string;
	}) {
		return this.db.first<{ id: string; evidence_hash: string; decision: string }>({
			sql: `SELECT consent.id, consent.evidence_hash, consent.decision
			FROM media_consents consent
			JOIN contract_offers offer ON offer.id = consent.source_contract_offer_id
			JOIN contract_template_versions template ON template.id = offer.template_version_id
			JOIN children child ON child.id = consent.child_id AND child.id = offer.child_id
			JOIN users owner ON owner.id = child.owner_user_id
			JOIN media_withdrawal_contact_versions contact
				ON contact.id = template.media_contact_version_id
			WHERE consent.request_dedupe_key = ? AND consent.user_id = ?
				AND consent.recorded_by_user_id = ? AND consent.decision_source = 'portal'
				AND consent.source_contract_offer_id = ? AND offer.user_id = ?
				AND consent.child_id = ? AND child.owner_user_id = offer.user_id
				AND child.family_number_id = owner.family_number_id
				AND consent.withdrawal_contact_version_id = ?
				AND consent.withdrawal_contact_version_id = template.media_contact_version_id
				AND consent.withdrawal_contact_snapshot_hash = ?
				AND contact.snapshot_hash = ? AND contact.approval_status = 'approved'
				AND (consent.decision <> 'granted'
					OR contact.compliance_assessment_status = 'passed')
				AND owner.role = 'parent' AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL
				AND EXISTS (SELECT 1 FROM contract_action_assertions assertion
					WHERE assertion.scope = 'media_decision'
						AND assertion.target_id = offer.id
						AND assertion.action_id = consent.id
						AND assertion.actor_user_id = ?
						AND assertion.assertion_passed = 1)`,
			params: [
				input.idempotencyKey,
				input.userId,
				input.userId,
				input.offerId,
				input.userId,
				input.childId,
				input.contactVersionId,
				input.contactSnapshotHash,
				input.contactSnapshotHash,
				input.userId,
			],
		});
	}

	async recordMediaDecision(input: {
		actor: AuthenticatedUser;
		offerId: string;
		childId: string;
		captureScopesJson: string;
		publicationChannelsJson: string;
		textVersion: string;
		contactVersionId: string;
		contactSnapshotHash: string;
		decision: 'granted' | 'declined';
		idempotencyKey: string;
		evidenceHash: string;
		requestId: string;
		now: string;
	}) {
		const prior = await this.loadOwnedMediaDecisionReplay({
			userId: input.actor.id,
			offerId: input.offerId,
			childId: input.childId,
			contactVersionId: input.contactVersionId,
			contactSnapshotHash: input.contactSnapshotHash,
			idempotencyKey: input.idempotencyKey,
		});
		if (prior) {
			if (prior.evidence_hash !== input.evidenceHash || prior.decision !== input.decision) {
				throw new ContractRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			return { consentId: prior.id, replayed: true };
		}
		const consentId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO media_consents
						(id, user_id, child_id, capture_scopes_json, publication_channels_json,
						 text_version, withdrawal_contact_version_id, withdrawal_contact_snapshot_hash,
						 decision, decision_source, decided_at, received_at, effective_from,
						 recorded_by_user_id, recorded_at, evidence_hash, request_dedupe_key,
						 source_contract_offer_id, source_privacy_request_id, supersedes_consent_id, created_at)
				SELECT ?, ?, child.id, ?, ?, ?, ?, ?, ?, 'portal', ?, ?, ?, ?, ?, ?, ?,
					offer.id, NULL, NULL, ? FROM contract_offers offer
				JOIN contract_template_versions template ON template.id = offer.template_version_id
					AND template.media_contact_version_id = ?
				JOIN children child ON child.id = offer.child_id
					AND child.owner_user_id = offer.user_id
				JOIN users owner ON owner.id = child.owner_user_id
				JOIN media_withdrawal_contact_versions contact
					ON contact.id = template.media_contact_version_id
					WHERE offer.id = ? AND offer.user_id = ? AND child.id = ?
						AND child.family_number_id = owner.family_number_id
						AND owner.role = 'parent' AND owner.account_status = 'active'
						AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL
						AND contact.approval_status = 'approved' AND contact.snapshot_hash = ?
						AND (? <> 'granted' OR contact.compliance_assessment_status = 'passed')`,
					params: [
						consentId,
						input.actor.id,
						input.captureScopesJson,
						input.publicationChannelsJson,
						input.textVersion,
						input.contactVersionId,
						input.contactSnapshotHash,
						input.decision,
						input.now,
						input.now,
						input.now,
						input.actor.id,
						input.now,
						input.evidenceHash,
						input.idempotencyKey,
						input.now,
						input.contactVersionId,
						input.offerId,
						input.actor.id,
						input.childId,
						input.contactSnapshotHash,
						input.decision,
					],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'media.decision', 'media_consent', ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM media_consents WHERE id = ?)`,
					params: [
						auditId,
						input.actor.id,
						consentId,
						input.requestId,
						JSON.stringify({ decision: input.decision }),
						input.now,
						consentId,
					],
				},
				{
					sql: `INSERT INTO contract_action_assertions
						(id, scope, target_id, action_id, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, 'media_decision', ?, ?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM media_consents consent
							JOIN contract_offers offer ON offer.id = consent.source_contract_offer_id
							JOIN contract_template_versions template
								ON template.id = offer.template_version_id
							JOIN children child ON child.id = consent.child_id
								AND child.id = offer.child_id
							JOIN users owner ON owner.id = child.owner_user_id
							JOIN media_withdrawal_contact_versions contact
								ON contact.id = template.media_contact_version_id
							WHERE consent.id = ? AND consent.user_id = ?
								AND consent.child_id = ?
								AND consent.capture_scopes_json = ?
								AND consent.publication_channels_json = ?
								AND consent.text_version = ?
								AND consent.withdrawal_contact_version_id = ?
								AND consent.withdrawal_contact_snapshot_hash = ?
								AND consent.decision = ? AND consent.decision_source = 'portal'
								AND consent.recorded_by_user_id = ?
								AND consent.evidence_hash = ? AND consent.request_dedupe_key = ?
								AND consent.source_contract_offer_id = ?
								AND offer.id = ? AND offer.user_id = ? AND offer.child_id = ?
								AND child.owner_user_id = offer.user_id
								AND child.family_number_id = owner.family_number_id
								AND template.media_contact_version_id = ?
								AND contact.approval_status = 'approved'
								AND contact.snapshot_hash = ?
								AND (? <> 'granted'
									OR contact.compliance_assessment_status = 'passed')
								AND owner.role = 'parent' AND owner.account_status = 'active'
								AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL)
						AND EXISTS (SELECT 1 FROM audit_events audit
							WHERE audit.id = ? AND audit.actor_user_id = ?
								AND audit.actor_kind = 'user' AND audit.action = 'media.decision'
								AND audit.target_kind = 'media_consent' AND audit.target_id = ?
								AND audit.request_id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						crypto.randomUUID(),
						input.offerId,
						consentId,
						input.actor.id,
						auditId,
						consentId,
						input.actor.id,
						input.childId,
						input.captureScopesJson,
						input.publicationChannelsJson,
						input.textVersion,
						input.contactVersionId,
						input.contactSnapshotHash,
						input.decision,
						input.actor.id,
						input.evidenceHash,
						input.idempotencyKey,
						input.offerId,
						input.offerId,
						input.actor.id,
						input.childId,
						input.contactVersionId,
						input.contactSnapshotHash,
						input.decision,
						auditId,
						input.actor.id,
						consentId,
						input.requestId,
						input.now,
					],
				},
			]);
			return { consentId, replayed: false };
		} catch (error) {
			const replay = await this.loadOwnedMediaDecisionReplay({
				userId: input.actor.id,
				offerId: input.offerId,
				childId: input.childId,
				contactVersionId: input.contactVersionId,
				contactSnapshotHash: input.contactSnapshotHash,
				idempotencyKey: input.idempotencyKey,
			});
			if (replay) {
				if (
					replay.evidence_hash !== input.evidenceHash ||
					replay.decision !== input.decision
				) {
					throw new ContractRepositoryError('IDEMPOTENCY_KEY_REUSED');
				}
				return { consentId: replay.id, replayed: true };
			}
			throw new ContractRepositoryError('MEDIA_DECISION_REJECTED', { cause: error });
		}
	}

	async recordMediaWithdrawal(input: {
		admin: AdminActor;
		ownerUserId: string;
		childId: string;
		captureScopesJson: string;
		publicationChannelsJson: string;
		channel: 'office' | 'email' | 'phone';
		receivedAt: string;
		evidenceHash: string;
		idempotencyKey: string;
		requestId: string;
		now: string;
	}) {
		const prior = await this.db.first<{
			id: string;
			evidence_hash: string;
			recorded_by_user_id: string | null;
		}>({
			sql: `SELECT id, evidence_hash, recorded_by_user_id FROM media_consents
			WHERE request_dedupe_key = ?`,
			params: [input.idempotencyKey],
		});
		if (prior) {
			if (
				prior.recorded_by_user_id !== input.admin.id ||
				prior.evidence_hash !== input.evidenceHash
			) {
				throw new ContractRepositoryError('IDEMPOTENCY_KEY_REUSED');
			}
			return { consentId: prior.id, replayed: true };
		}
		const revokedId = crypto.randomUUID();
		const auditId = crypto.randomUUID();
		try {
			await this.db.batch([
				{
					sql: `INSERT INTO media_consents
						(id, user_id, child_id, capture_scopes_json, publication_channels_json,
						 text_version, withdrawal_contact_version_id, withdrawal_contact_snapshot_hash,
						 decision, decision_source, decided_at, received_at, effective_from,
						 recorded_by_user_id, recorded_at, evidence_hash, request_dedupe_key,
						 source_contract_offer_id, source_privacy_request_id, supersedes_consent_id, created_at)
					SELECT ?, grant.user_id, grant.child_id, ?, ?, grant.text_version,
						grant.withdrawal_contact_version_id, grant.withdrawal_contact_snapshot_hash,
						'revoked', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, grant.id, ?
					FROM media_consents grant JOIN children child ON child.id = grant.child_id
					JOIN users owner ON owner.id = child.owner_user_id
					WHERE grant.id = (SELECT candidate.id FROM media_consents candidate
						WHERE candidate.child_id = ? AND candidate.user_id = ? AND candidate.decision = 'granted'
							AND candidate.capture_scopes_json = ? AND candidate.publication_channels_json = ?
							AND NOT EXISTS (SELECT 1 FROM media_consents revoke
								WHERE revoke.supersedes_consent_id = candidate.id AND revoke.decision = 'revoked')
						ORDER BY candidate.effective_from DESC, candidate.created_at DESC LIMIT 1)
						AND child.owner_user_id = ? AND owner.account_status = 'active'
						AND owner.is_blocked = 0 AND ${ACTIVE_ADMIN}`,
					params: [
						revokedId,
						input.captureScopesJson,
						input.publicationChannelsJson,
						input.channel,
						input.receivedAt,
						input.receivedAt,
						input.receivedAt,
						input.admin.id,
						input.now,
						input.evidenceHash,
						input.idempotencyKey,
						input.now,
						input.childId,
						input.ownerUserId,
						input.captureScopesJson,
						input.publicationChannelsJson,
						input.ownerUserId,
						input.admin.id,
					],
				},
				{
					sql: `INSERT INTO contract_outbox_events
						(id, event_type, source_kind, source_id, payload_json, dedupe_key, status, created_at)
					SELECT ?, 'media_withdrawn', 'media_consent', ?, ?, ?, 'pending', ?
					WHERE EXISTS (SELECT 1 FROM media_consents WHERE id = ?)`,
					params: [
						crypto.randomUUID(),
						revokedId,
						JSON.stringify({ consentId: revokedId, effectiveFrom: input.receivedAt }),
						`media-withdrawn:${revokedId}`,
						input.now,
						revokedId,
					],
				},
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'media.withdrawal_recorded', 'media_consent', ?, ?, ?, ?
					WHERE EXISTS (SELECT 1 FROM media_consents WHERE id = ?)`,
					params: [
						auditId,
						input.admin.id,
						revokedId,
						input.requestId,
						JSON.stringify({ channel: input.channel, receivedAt: input.receivedAt }),
						input.now,
						revokedId,
					],
				},
			]);
			return { consentId: revokedId, replayed: false };
		} catch (error) {
			throw new ContractRepositoryError('MEDIA_WITHDRAWAL_REJECTED', { cause: error });
		}
	}

	async listOwnerHistory(userId: string) {
		const rows = await this.db.all<{
			id: string;
			contract_id: string | null;
			contract_number: string;
			contract_kind: string;
			status: string;
			child_name: string;
			effective_from: string;
			effective_to: string | null;
			contract_hash: string | null;
			created_at: string;
		}>({
			sql: `SELECT offer.id, contract.id AS contract_id, offer.contract_number,
				offer.contract_kind, offer.status, child.full_name AS child_name,
				offer.effective_from, offer.effective_to, offer.contract_hash, offer.created_at
			FROM contract_offers offer
			JOIN users owner ON owner.id = offer.user_id
			JOIN children child ON child.id = offer.child_id AND child.owner_user_id = owner.id
			LEFT JOIN contracts contract ON contract.contract_offer_id = offer.id
			WHERE offer.user_id = ? AND owner.role = 'parent'
				AND owner.email_verified_at IS NOT NULL
				AND owner.account_status = 'active' AND owner.is_blocked = 0
			ORDER BY offer.created_at DESC, offer.id DESC LIMIT 100`,
			params: [userId],
		});
		return rows.results;
	}

	async loadOwnerOfferDetail(userId: string, offerId: string) {
		const offer = await this.db.first<
			StoredContractOffer & {
				child_name: string;
				contract_id: string | null;
				operational_status: string | null;
				media_contact_version_id: string | null;
				distance_legal_profile: string;
			}
		>({
			sql: `SELECT offer.*, child.full_name AS child_name, contract.id AS contract_id,
				contract.operational_status, template.media_contact_version_id,
				template.distance_legal_profile
			FROM contract_offers offer
			JOIN users owner ON owner.id = offer.user_id
			JOIN children child ON child.id = offer.child_id AND child.owner_user_id = owner.id
			JOIN contract_template_versions template ON template.id = offer.template_version_id
			LEFT JOIN contracts contract ON contract.contract_offer_id = offer.id
			WHERE offer.id = ? AND offer.user_id = ? AND owner.account_status = 'active'
				AND owner.role = 'parent' AND owner.is_blocked = 0
				AND owner.email_verified_at IS NOT NULL`,
			params: [offerId, userId],
		});
		if (!offer) return null;
		const artifacts = await this.db.all<{
			id: string;
			artifact_kind: string;
			sha256: string;
			created_at: string;
		}>({
			sql: `SELECT artifact.id, artifact.artifact_kind, artifact.sha256, artifact.created_at
			FROM contract_artifacts artifact
			WHERE artifact.contract_offer_id = ? OR artifact.formation_certificate_id IN (
				SELECT id FROM contract_formation_certificates WHERE contract_offer_id = ?)
			ORDER BY artifact.created_at, artifact.id`,
			params: [offerId, offerId],
		});
		return { ...offer, artifacts: artifacts.results };
	}

	async loadArtifactForOwner(userId: string, artifactId: string) {
		return this.db.first<{
			id: string;
			private_r2_key: string;
			content_type: string;
			sha256: string;
			size_bytes: number;
		}>({
			sql: `SELECT artifact.id, artifact.private_r2_key, artifact.content_type,
				artifact.sha256, artifact.size_bytes
			FROM contract_artifacts artifact
			JOIN contract_offers offer ON offer.id = artifact.contract_offer_id
				OR offer.id = (SELECT certificate.contract_offer_id
					FROM contract_formation_certificates certificate
					WHERE certificate.id = artifact.formation_certificate_id)
			JOIN users owner ON owner.id = offer.user_id
			JOIN children child ON child.id = offer.child_id AND child.owner_user_id = owner.id
			WHERE artifact.id = ? AND offer.user_id = ?
				AND owner.role = 'parent' AND owner.account_status = 'active'
				AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL
				AND NOT EXISTS (SELECT 1 FROM legal_archive_records archive
					WHERE archive.target_kind = 'contract_artifact'
						AND archive.target_id = artifact.id)`,
			params: [artifactId, userId],
		});
	}

	loadArtifactForAdmin(adminUserId: string, artifactId: string) {
		return this.db.first<{
			id: string;
			private_r2_key: string;
			content_type: string;
			sha256: string;
			size_bytes: number;
		}>({
			sql: `SELECT artifact.id, artifact.private_r2_key, artifact.content_type,
				artifact.sha256, artifact.size_bytes
			FROM contract_artifacts artifact
			JOIN contract_offers offer ON offer.id = artifact.contract_offer_id
				OR offer.id = (SELECT certificate.contract_offer_id
					FROM contract_formation_certificates certificate
					WHERE certificate.id = artifact.formation_certificate_id)
			JOIN users owner ON owner.id = offer.user_id
			JOIN children child ON child.id = offer.child_id AND child.owner_user_id = owner.id
			JOIN users admin ON admin.id = ?
			WHERE artifact.id = ? AND admin.role = 'admin' AND admin.account_status = 'active'
				AND admin.is_blocked = 0 AND owner.account_status = 'active'
				AND owner.is_blocked = 0
				AND NOT EXISTS (SELECT 1 FROM legal_archive_records archive
					WHERE archive.target_kind = 'contract_artifact'
						AND archive.target_id = artifact.id)`,
			params: [adminUserId, artifactId],
		});
	}

	async authorizeAndAuditOwnerArtifactRead(input: {
		artifactId: string;
		ownerUserId: string;
		expectedStorageKey: string;
		expectedSha256: string;
		expectedSizeBytes: number;
		requestId: string;
		now: string;
	}) {
		const auditId = crypto.randomUUID();
		try {
			const results = await this.db.batch([
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'contract_artifact.read', 'contract_artifact', artifact.id,
						?, '{"forcedAttachment":true}', ?
					FROM contract_artifacts artifact
					JOIN contract_offers offer ON offer.id = artifact.contract_offer_id
						OR offer.id = (SELECT certificate.contract_offer_id
							FROM contract_formation_certificates certificate
							WHERE certificate.id = artifact.formation_certificate_id)
					JOIN users owner ON owner.id = offer.user_id
					JOIN children child ON child.id = offer.child_id
						AND child.owner_user_id = owner.id
					WHERE artifact.id = ? AND offer.user_id = ?
						AND artifact.private_r2_key = ? AND artifact.sha256 = ?
						AND artifact.size_bytes = ? AND owner.role = 'parent'
						AND owner.account_status = 'active'
						AND owner.is_blocked = 0 AND owner.email_verified_at IS NOT NULL
						AND NOT EXISTS (SELECT 1 FROM legal_archive_records archive
							WHERE archive.target_kind = 'contract_artifact'
								AND archive.target_id = artifact.id)`,
					params: [
						auditId,
						input.ownerUserId,
						input.requestId,
						input.now,
						input.artifactId,
						input.ownerUserId,
						input.expectedStorageKey,
						input.expectedSha256,
						input.expectedSizeBytes,
					],
				},
				{
					sql: `INSERT INTO contract_action_assertions
						(id, scope, target_id, action_id, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, 'artifact_owner_read', ?, ?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						crypto.randomUUID(),
						input.artifactId,
						auditId,
						input.ownerUserId,
						auditId,
						auditId,
						input.now,
					],
				},
			]);
			if ((results[0]?.meta.changes ?? 0) !== 1) {
				throw new ContractRepositoryError('CONTRACT_ARTIFACT_NOT_FOUND');
			}
		} catch (error) {
			if (error instanceof ContractRepositoryError) throw error;
			throw new ContractRepositoryError('CONTRACT_ARTIFACT_NOT_FOUND');
		}
	}

	async authorizeAndAuditAdminArtifactRead(input: {
		artifactId: string;
		adminUserId: string;
		purposeCode: ContractArtifactDownloadPurpose;
		expectedStorageKey: string;
		expectedSha256: string;
		expectedSizeBytes: number;
		requestId: string;
		now: string;
	}) {
		const auditId = crypto.randomUUID();
		try {
			const results = await this.db.batch([
				{
					sql: `INSERT INTO audit_events
						(id, actor_user_id, actor_kind, action, target_kind, target_id,
						 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'contract_artifact.read', 'contract_artifact', artifact.id,
						?, ?, ?
					FROM contract_artifacts artifact
					JOIN contract_offers offer ON offer.id = artifact.contract_offer_id
						OR offer.id = (SELECT certificate.contract_offer_id
							FROM contract_formation_certificates certificate
							WHERE certificate.id = artifact.formation_certificate_id)
					JOIN users owner ON owner.id = offer.user_id
					JOIN children child ON child.id = offer.child_id
						AND child.owner_user_id = owner.id
					JOIN users admin ON admin.id = ?
					WHERE artifact.id = ? AND artifact.private_r2_key = ?
						AND artifact.sha256 = ? AND artifact.size_bytes = ?
						AND admin.role = 'admin' AND admin.account_status = 'active'
						AND admin.is_blocked = 0 AND owner.account_status = 'active'
						AND owner.is_blocked = 0
						AND NOT EXISTS (SELECT 1 FROM legal_archive_records archive
							WHERE archive.target_kind = 'contract_artifact'
								AND archive.target_id = artifact.id)`,
					params: [
						auditId,
						input.adminUserId,
						input.requestId,
						JSON.stringify({ forcedAttachment: true, purposeCode: input.purposeCode }),
						input.now,
						input.adminUserId,
						input.artifactId,
						input.expectedStorageKey,
						input.expectedSha256,
						input.expectedSizeBytes,
					],
				},
				{
					sql: `INSERT INTO contract_action_assertions
						(id, scope, target_id, action_id, actor_user_id, audit_event_id,
						 assertion_passed, created_at)
					VALUES (?, 'artifact_admin_read', ?, ?, ?, ?, CASE WHEN
						EXISTS (SELECT 1 FROM audit_events WHERE id = ?)
					THEN 1 ELSE 0 END, ?)`,
					params: [
						crypto.randomUUID(),
						input.artifactId,
						auditId,
						input.adminUserId,
						auditId,
						auditId,
						input.now,
					],
				},
			]);
			if ((results[0]?.meta.changes ?? 0) !== 1) {
				throw new ContractRepositoryError('CONTRACT_ARTIFACT_NOT_FOUND');
			}
		} catch (error) {
			if (error instanceof ContractRepositoryError) throw error;
			throw new ContractRepositoryError('CONTRACT_ARTIFACT_NOT_FOUND');
		}
	}

	async listAdminOffers(query = '') {
		const q = query.toLocaleLowerCase('de-DE');
		const rows = await this.db.all<{
			id: string;
			contract_number: string;
			contract_kind: string;
			status: string;
			render_status: string;
			child_name: string;
			expires_at: string;
			contract_id: string | null;
			certificate_status: string | null;
			contract_status: string | null;
			artifacts_json: string;
		}>({
			sql: `SELECT offer.id, offer.contract_number, offer.contract_kind,
				offer.status, offer.render_status, child.full_name AS child_name,
				offer.expires_at, contract.id AS contract_id,
				certificate.render_status AS certificate_status, contract.operational_status AS contract_status,
				COALESCE((SELECT json_group_array(json_object('id', artifact.id,
					'kind', artifact.artifact_kind)) FROM contract_artifacts artifact
					WHERE artifact.contract_offer_id = offer.id
						OR artifact.formation_certificate_id = certificate.id), '[]') AS artifacts_json
			FROM contract_offers offer
			JOIN users owner ON owner.id = offer.user_id AND owner.account_status <> 'closed'
			JOIN children child ON child.id = offer.child_id
			LEFT JOIN contracts contract ON contract.contract_offer_id = offer.id
			LEFT JOIN contract_formation_certificates certificate
				ON certificate.contract_id = contract.id
			WHERE NOT EXISTS (SELECT 1 FROM legal_archive_records archive
					WHERE archive.target_kind = 'contract_offer' AND archive.target_id = offer.id)
				AND (? = '' OR lower(child.full_name) LIKE ? OR offer.contract_number = ?
				OR offer.id = ?) ORDER BY offer.created_at DESC, offer.id DESC LIMIT 100`,
			params: [q, `%${q}%`, query, query],
		});
		return rows.results.map((row) => ({
			...row,
			artifacts: JSON.parse(row.artifacts_json) as Array<{ id: string; kind: string }>,
		}));
	}
}

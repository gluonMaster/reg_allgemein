import type { AuthenticatedUser } from '$lib/server/auth/session';
import type { RuntimeConfig } from '$lib/server/config/runtime';
import { canonicalJson, hashCanonical } from '$lib/server/import/canonical';
import type { AdminActor } from '$lib/server/security/authorization';
import { sha256Bytes, scopedHash } from '$lib/server/security/digest';
import { berlinCalendarDate, calendarMonthEnd } from '$lib/server/time/berlin';
import {
	CONTRACT_FORMATION_SCHEMA_VERSION,
	attendanceNoticeSchema,
	contractEndRequestSchema,
	contractFormationSchema,
	contractParentDecisionSchema,
	contractRenderInputSchema,
	mediaDecisionSchema,
	mediaWithdrawalSchema,
	terminationReviewSchema,
	type ContractRenderInput,
	type ContractTemplateId,
} from './contracts';
import {
	ContractRepository,
	ContractRepositoryError,
	type StoredContractOffer,
} from './contract-repository';
import {
	BrowserRunContractPdfAdapter,
	ContractPdfError,
	SyntheticContractPdfAdapter,
	type ContractPdfAdapter,
} from './pdf';
import type { ContractArtifactStore } from './storage';
import { contractTemplateRegistry, renderContractSource } from './templates';
import type { StorageIntentRepository } from '$lib/server/operations/storage-intents';
import { contractArtifactDownloadPurposeSchema } from '$lib/server/security/download-purpose';

type DraftRenderInput = Omit<ContractRenderInput, 'offerNumber' | 'contractNumber'>;

export interface CreateContractDraftCommand {
	userId: string;
	childId: string;
	academicPeriodId: string;
	templateVersionId: string;
	renderInput: DraftRenderInput;
	priceQuoteId?: string;
	priceVersionId?: string;
	priceRuleId?: string;
	manualOverride?: { reason: string; responsibilityConfirmed: true };
	expiresAt: string;
	idempotencyKey: string;
}

export class ContractServiceError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'ContractServiceError';
	}
}

function ensureTimestamp(value: string, code: string): void {
	if (Number.isNaN(Date.parse(value))) throw new ContractServiceError(code);
}

function certificateHtml(source: Record<string, unknown>): string {
	const escape = (value: unknown) =>
		String(value)
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
	@page{size:A4;margin:20mm}body{font:11pt/1.5 Arial,sans-serif;color:#172033}
	h1{font-size:20pt}.box{border:1px solid #8993a8;padding:12px;margin:12px 0}
	</style></head><body><h1>Nachweis der Vertragsbildung</h1>
	<p>Dieses Dokument ist ein separater, unveränderlicher Nachweis. Es enthält keine Unterschriftsbilder und verändert das ursprüngliche Vertragsangebot nicht.</p>
	<div class="box"><strong>Vertragsnummer:</strong> ${escape(source.contractNumber)}<br>
	<strong>Angebotsnummer:</strong> ${escape(source.offerNumber)}<br>
	<strong>Elternhandlung:</strong> ${escape(source.parentAcceptedAt)}<br>
	<strong>Bestätigung des Vereins:</strong> ${escape(source.formedAt)}</div>
	<p><strong>Elternteil:</strong> ${escape(source.parentName)} – annehmende Vertragspartei</p>
	<p><strong>Verein:</strong> ${escape(source.providerName)} – bestätigende Vertragspartei</p>
	<p><strong>SHA-256 des Angebots-PDF:</strong><br>${escape(source.offerPdfHash)}</p>
	<p><strong>SHA-256 des Bildungsnachweises:</strong><br>${escape(source.formationEvidenceHash)}</p>
	</body></html>`;
}

export class ContractService {
	private readonly adapter: ContractPdfAdapter | null;

	constructor(
		private readonly repository: ContractRepository,
		private readonly store: ContractArtifactStore,
		private readonly config: RuntimeConfig,
		adapter?: ContractPdfAdapter,
		private readonly now: () => string = () => new Date().toISOString(),
		private readonly storageIntents?: StorageIntentRepository
	) {
		this.adapter = adapter ?? this.buildAdapter();
	}

	private buildAdapter(): ContractPdfAdapter | null {
		if (this.config.contracts.renderer === 'synthetic_test') {
			if (this.config.appEnvironment !== 'test') return null;
			return new SyntheticContractPdfAdapter(this.config.contracts, 'test');
		}
		if (this.config.contracts.renderer === 'browser_run' && this.config.browser) {
			return new BrowserRunContractPdfAdapter(this.config.browser, this.config.contracts);
		}
		return null;
	}

	async installSyntheticTestFixtures(admin: AdminActor) {
		if (
			this.config.appEnvironment !== 'test' ||
			this.config.contracts.renderer !== 'synthetic_test'
		) {
			throw new ContractServiceError('SYNTHETIC_FIXTURES_TEST_ONLY');
		}
		const provider = {
			fullName: 'Kolibri Testverein',
			addressLines: ['Teststraße 1', '01067 Dresden'],
			role: 'provider',
			payerRole: false,
			paymentTermsVersion: 'synthetic-payment-v1',
		};
		const mediaContact = {
			address: 'Teststraße 1, 01067 Dresden',
			email: 'media@example.test',
			phone: '+49 000 000000',
			impressumUrl: 'https://example.test/impressum',
			kontaktUrl: 'https://example.test/kontakt',
		};
		const templates = await Promise.all(
			(Object.keys(contractTemplateRegistry) as ContractTemplateId[]).map(
				async (templateId) => {
					const definition = contractTemplateRegistry[templateId];
					const bundle = new TextEncoder().encode(
						canonicalJson({
							templateId,
							version: definition.templateVersion,
							css: definition.css,
							renderer: 'synthetic-test-pdf-v1',
						})
					);
					const bundleHash = await sha256Bytes(bundle);
					const key = `contract-templates/synthetic/${templateId}/synthetic-core-v1.json`;
					await this.store.put(key, bundle, bundleHash);
					return {
						id: `contract-template:synthetic:${templateId}:v1`,
						templateId,
						bundleKey: key,
						bundleHash,
						htmlSourceHash: await hashCanonical({
							templateId,
							renderer: definition.render.toString(),
						}),
						cssSourceHash: await hashCanonical({ css: definition.css }),
					};
				}
			)
		);
		return this.repository.installSyntheticTemplateFixtures({
			admin,
			providerSnapshotJson: JSON.stringify(provider),
			providerPaymentTermsHash: await hashCanonical({
				version: provider.paymentTermsVersion,
			}),
			mediaContactSnapshotJson: canonicalJson(mediaContact),
			mediaContactSnapshotHash: await hashCanonical(mediaContact),
			templates,
			now: this.now(),
		});
	}

	private async serviceContext(input: {
		userId: string;
		childId: string;
		academicPeriodId: string;
		render: ContractRenderInput;
	}) {
		if (input.render.service.relation === 'course') {
			const course = await this.repository.loadCourseService({
				courseGroupId: input.render.service.courseGroupId!,
				academicPeriodId: input.academicPeriodId,
			});
			if (!course) throw new ContractServiceError('CONTRACT_COURSE_REJECTED');
			return {
				courseGroupId: course.id,
				individualRequestId: null,
				fundingAuthorizationId: null,
				enrollmentId: crypto.randomUUID(),
				serviceEngagementId: null,
				lessonKind: course.lesson_kind,
			};
		}
		const request = await this.repository.loadRequestService({
			requestId: input.render.service.requestId!,
			userId: input.userId,
			childId: input.childId,
		});
		if (!request || request.request_kind !== input.render.service.requestKind) {
			throw new ContractServiceError('CONTRACT_REQUEST_REJECTED');
		}
		if (
			request.request_kind === 'individual' &&
			(request.funding_kind !== 'self_pay' ||
				request.unit_rate_cents !== input.render.billing.finalPriceCents)
		)
			throw new ContractServiceError('INDIVIDUAL_TARIFF_CHANGED');
		if (request.request_kind === 'nachhilfe') {
			await this.repository.assertFundingEligible({
				requestId: request.id,
				authorizationId: input.render.service.fundingAuthorizationId!,
				plannedFrom: input.render.service.effectiveFrom,
				plannedUntilInclusive: input.render.service.effectiveTo!,
			});
		}
		return {
			courseGroupId: null,
			individualRequestId: request.id,
			fundingAuthorizationId: input.render.service.fundingAuthorizationId,
			enrollmentId: null,
			serviceEngagementId: crypto.randomUUID(),
			lessonKind: null,
		};
	}

	private async assertGroupPricing(input: {
		userId: string;
		childId: string;
		render: ContractRenderInput;
		priceQuoteId: string | null;
		priceVersionId: string | null;
		priceRuleId: string | null;
		now: string;
		requireQuote: boolean;
	}) {
		if (input.render.service.relation !== 'course') return;
		if (!input.priceQuoteId) {
			if (input.requireQuote) throw new ContractServiceError('GROUP_PRICE_QUOTE_REQUIRED');
			return;
		}
		const quote = await this.repository.loadGroupPriceQuote({
			quoteId: input.priceQuoteId,
			userId: input.userId,
			childId: input.childId,
			courseGroupId: input.render.service.courseGroupId!,
		});
		if (
			!quote ||
			!['quoted', 'confirmed'].includes(quote.status) ||
			quote.expires_at <= input.now ||
			quote.price_version_current !== 1 ||
			quote.contract_kind !== input.render.templateId ||
			quote.price_source !== input.render.billing.priceSource ||
			quote.price_mode !== input.render.billing.priceMode ||
			quote.base_price_cents !== input.render.billing.basePriceCents ||
			quote.final_price_cents !== input.render.billing.finalPriceCents ||
			quote.price_version_id !== input.priceVersionId ||
			quote.price_rule_id !== input.priceRuleId
		) {
			throw new ContractServiceError('GROUP_PRICE_REVALIDATION_FAILED');
		}
	}

	async createDraft(input: {
		admin: AdminActor;
		payload: CreateContractDraftCommand;
		requestId: string;
	}) {
		ensureTimestamp(input.payload.expiresAt, 'CONTRACT_EXPIRY_INVALID');
		const now = this.now();
		if (input.payload.expiresAt <= now)
			throw new ContractServiceError('CONTRACT_EXPIRY_INVALID');
		const template = await this.repository.loadTemplate(input.payload.templateVersionId);
		if (!template || template.approval_status !== 'approved') {
			throw new ContractServiceError('CONTRACT_TEMPLATE_NOT_APPROVED');
		}
		const number = await this.repository.prepareNumber(
			input.payload.userId,
			input.payload.childId
		);
		const id = crypto.randomUUID();
		const offerNumber = `OFFER-${id}`;
		const contractNumber = `${number.family_display_id}-${number.next_contract_sequence}`;
		const parsed = contractRenderInputSchema.safeParse({
			...input.payload.renderInput,
			offerNumber,
			contractNumber,
		});
		if (!parsed.success) throw new ContractServiceError('CONTRACT_RENDER_INPUT_REJECTED');
		const render = parsed.data;
		if (
			render.templateId !== template.template_id ||
			render.schemaVersion !== template.render_schema_version ||
			render.legal.clauseSetVersion !== template.clause_set_version ||
			render.legal.distanceLegalProfile !== template.distance_legal_profile ||
			render.legal.distanceLegalBasisHash !== template.distance_legal_basis_hash
		)
			throw new ContractServiceError('CONTRACT_TEMPLATE_SNAPSHOT_MISMATCH');
		if (
			(render.billing.priceMode === 'manual_override') !==
			Boolean(input.payload.manualOverride)
		)
			throw new ContractServiceError('MANUAL_OVERRIDE_EVIDENCE_REQUIRED');
		if (
			input.payload.manualOverride &&
			input.payload.manualOverride.reason.trim().length < 10
		) {
			throw new ContractServiceError('MANUAL_OVERRIDE_REASON_REQUIRED');
		}
		const service = await this.serviceContext({
			userId: input.payload.userId,
			childId: input.payload.childId,
			academicPeriodId: input.payload.academicPeriodId,
			render,
		});
		await this.assertGroupPricing({
			userId: input.payload.userId,
			childId: input.payload.childId,
			render,
			priceQuoteId: input.payload.priceQuoteId ?? null,
			priceVersionId: input.payload.priceVersionId ?? null,
			priceRuleId: input.payload.priceRuleId ?? null,
			now,
			requireQuote: template.usage_scope === 'production',
		});
		const source = await renderContractSource(render);
		const requestHash = await hashCanonical({
			userId: input.payload.userId,
			childId: input.payload.childId,
			templateVersionId: input.payload.templateVersionId,
			renderInput: input.payload.renderInput,
			expiresAt: input.payload.expiresAt,
			manualOverride: input.payload.manualOverride ?? null,
		});
		return this.repository.createDraft(
			{
				id,
				seriesId: crypto.randomUUID(),
				offerNumber,
				contractNumber,
				userId: input.payload.userId,
				childId: input.payload.childId,
				academicPeriodId: input.payload.academicPeriodId,
				template,
				renderInput: render,
				renderInputHash: source.renderInputHash,
				sourceManifestJson: canonicalJson(source.sourceManifest),
				sourceManifestHash: source.sourceManifestHash,
				expiresAt: input.payload.expiresAt,
				requestId: input.requestId,
				admin: input.admin,
				idempotencyKey: input.payload.idempotencyKey,
				requestHash,
				service,
				pricing: {
					priceQuoteId: input.payload.priceQuoteId ?? null,
					priceVersionId: input.payload.priceVersionId ?? null,
					priceRuleId: input.payload.priceRuleId ?? null,
				},
				manualOverride: input.payload.manualOverride ?? null,
				now,
			},
			number
		);
	}

	private assertSendGate(template: Awaited<ReturnType<ContractRepository['loadTemplate']>>) {
		if (!this.config.contracts.sendEnabled || !this.adapter) {
			throw new ContractServiceError('CONTRACT_SEND_DISABLED');
		}
		if (!template || template.approval_status !== 'approved') {
			throw new ContractServiceError('CONTRACT_TEMPLATE_NOT_APPROVED');
		}
		if (template.renderer_id !== this.adapter.rendererId) {
			throw new ContractServiceError('CONTRACT_RENDERER_MISMATCH');
		}
		if (template.usage_scope === 'synthetic_test') {
			if (this.config.appEnvironment !== 'test') {
				throw new ContractServiceError('SYNTHETIC_ADAPTER_FORBIDDEN');
			}
			return;
		}
		if (
			template.approval_basis !== 'authorized_verein_approval' &&
			template.approval_basis !== 'legal_review'
		)
			throw new ContractServiceError('PRODUCTION_TEMPLATE_APPROVAL_REQUIRED');
		if (template.provider_approval_status !== 'approved') {
			throw new ContractServiceError('PRODUCTION_PROVIDER_SNAPSHOT_NOT_APPROVED');
		}
		if (
			!template.media_contact_version_id ||
			template.media_contact_approval_status !== 'approved'
		) {
			throw new ContractServiceError('PRODUCTION_MEDIA_CONTACT_NOT_APPROVED');
		}
		if (
			template.distance_legal_profile === 'offline_only' ||
			!template.distance_legal_basis_hash
		) {
			throw new ContractServiceError('ONLINE_LEGAL_PROFILE_REQUIRED');
		}
		if (
			template.distance_legal_profile === 'widerruf_applicable' ||
			template.kuendigung_function_required === 1
		) {
			throw new ContractServiceError('PUBLIC_CONTRACT_FUNCTION_REQUIRED');
		}
	}

	async renderAndSend(input: {
		admin: AdminActor;
		offerId: string;
		idempotencyKey: string;
		requestId: string;
	}) {
		const requestHash = await hashCanonical({ offerId: input.offerId, action: 'render_send' });
		const prior = await this.repository.loadAdminAction(input.admin.id, input.idempotencyKey);
		if (prior) {
			if (prior.action !== 'render_send' || prior.request_hash_sha256 !== requestHash) {
				throw new ContractServiceError('IDEMPOTENCY_KEY_REUSED');
			}
			return { offerId: prior.result_ref, replayed: true };
		}
		const offer = await this.repository.loadOffer(input.offerId);
		if (
			!offer ||
			offer.status !== 'draft' ||
			!['not_started', 'failed'].includes(offer.render_status)
		) {
			throw new ContractServiceError('CONTRACT_RENDER_STATE_REJECTED');
		}
		const template = await this.repository.loadTemplate(offer.template_version_id);
		this.assertSendGate(template);
		const source = await renderContractSource(JSON.parse(offer.render_input_json));
		if (
			source.renderInputHash !== offer.render_input_hash ||
			source.sourceManifestHash !== offer.source_manifest_hash
		)
			throw new ContractServiceError('CONTRACT_SOURCE_HASH_MISMATCH');
		const attemptNo = await this.repository.nextAttemptNumber(offer.id);
		if (attemptNo > this.config.contracts.maxRenderAttempts) {
			throw new ContractServiceError('CONTRACT_RENDER_ATTEMPTS_EXHAUSTED');
		}
		const startedAt = this.now();
		const marked = await this.repository.markRendering(offer.id, input.admin.id, startedAt);
		if ((marked.meta.changes ?? 0) !== 1)
			throw new ContractServiceError('CONTRACT_RENDER_RACE');
		try {
			const browserBudgetUsedMs = await this.repository.browserBudgetUsed(
				berlinCalendarDate(startedAt)
			);
			const result = await this.adapter!.render({
				html: source.html,
				sourceManifestHash: source.sourceManifestHash,
				browserBudgetUsedMs,
			});
			const htmlBytes = new TextEncoder().encode(source.html);
			const htmlSha256 = await sha256Bytes(htmlBytes);
			const contractHash = await hashCanonical({
				renderInputHash: source.renderInputHash,
				sourceManifestHash: source.sourceManifestHash,
				htmlSha256,
				pdfSha256: result.sha256,
			});
			const htmlKey = `contract-artifacts/offers/${crypto.randomUUID()}.html`;
			const pdfKey = `contract-artifacts/offers/${crypto.randomUUID()}.pdf`;
			const htmlIntentId = await this.storageIntents?.stage({
				storageClass: 'archive',
				objectKey: htmlKey,
				objectKind: 'contract_offer_html',
				sourceRef: offer.id,
				sha256: htmlSha256,
				sizeBytes: htmlBytes.byteLength,
				now: startedAt,
			});
			const pdfIntentId = await this.storageIntents?.stage({
				storageClass: 'archive',
				objectKey: pdfKey,
				objectKind: 'contract_offer_pdf',
				sourceRef: offer.id,
				sha256: result.sha256,
				sizeBytes: result.bytes.byteLength,
				now: startedAt,
			});
			await this.store.put(htmlKey, htmlBytes, htmlSha256);
			try {
				await this.store.put(pdfKey, result.bytes, result.sha256);
			} catch (error) {
				await this.store.delete(htmlKey).catch(() => undefined);
				for (const intentId of [htmlIntentId, pdfIntentId]) {
					if (intentId)
						await this.storageIntents
							?.markDeletePending(intentId, this.now())
							.catch(() => undefined);
				}
				throw error;
			}
			try {
				await this.repository.completeRenderAndSend({
					offer,
					template: template!,
					admin: input.admin,
					attemptNo,
					startedAt,
					now: this.now(),
					htmlKey,
					pdfKey,
					htmlSize: htmlBytes.byteLength,
					htmlSha256,
					pdfSize: result.bytes.byteLength,
					pdfSha256: result.sha256,
					contractHash,
					browserMsUsed: result.browserMsUsed,
					idempotencyKey: input.idempotencyKey,
					requestHash,
					requestId: input.requestId,
					htmlStorageIntentId: htmlIntentId,
					pdfStorageIntentId: pdfIntentId,
				});
			} catch (error) {
				let replay: Awaited<ReturnType<typeof this.repository.loadAdminAction>> = null;
				let authoritativeReadSucceeded = false;
				try {
					replay = await this.repository.loadAdminAction(input.admin.id, input.idempotencyKey);
					authoritativeReadSucceeded = true;
				} catch {
					// Keep staged objects until reconciliation can prove they are unreferenced.
				}
				if (
					replay?.action === 'render_send' &&
					replay.request_hash_sha256 === requestHash &&
					replay.result_ref === offer.id
				) {
					return { offerId: offer.id, contractHash, replayed: true };
				}
				if (authoritativeReadSucceeded) {
					if (!htmlIntentId && !pdfIntentId) {
						await Promise.allSettled([this.store.delete(htmlKey), this.store.delete(pdfKey)]);
					}
					for (const intentId of [htmlIntentId, pdfIntentId]) {
						if (intentId)
							await this.storageIntents
								?.markDeletePending(intentId, this.now())
								.catch(() => undefined);
					}
				}
				throw error;
			}
			for (const intentId of [htmlIntentId, pdfIntentId]) {
				if (intentId)
					await this.storageIntents
						?.markLinked(intentId, this.now())
						.catch(() => undefined);
			}
			return { offerId: offer.id, contractHash, replayed: false };
		} catch (error) {
			const pdfError = error instanceof ContractPdfError ? error : null;
			await this.repository
				.recordRenderFailure({
					offerId: offer.id,
					attemptNo,
					template: template!,
					sourceManifestHash: source.sourceManifestHash,
					startedAt,
					finishedAt: this.now(),
					status: pdfError?.retryable ? 'retryable_failed' : 'failed',
					errorCode: pdfError?.code ?? 'ARTIFACT_PERSISTENCE_FAILED',
					retryAfterSeconds: pdfError?.retryAfterSeconds ?? null,
				})
				.catch(() => undefined);
			throw new ContractServiceError(pdfError?.code ?? 'CONTRACT_RENDER_FAILED');
		}
	}

	async parentDecision(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		userAgent: string;
		requestSubject: string;
		requestId: string;
	}) {
		const parsed = contractParentDecisionSchema.safeParse(input.payload);
		if (!parsed.success) throw new ContractServiceError('CONTRACT_DECISION_INVALID');
		if (!this.config.contracts.sendEnabled)
			throw new ContractServiceError('CONTRACT_SEND_DISABLED');
		const now = this.now();
		return this.repository.parentDecision({
			actor: input.actor,
			offerId: parsed.data.offerId,
			expectedContractHash: parsed.data.expectedContractHash,
			decision: parsed.data.decision,
			textVersion: parsed.data.acceptanceTextVersion,
			text: parsed.data.acceptanceText,
			idempotencyKey: parsed.data.idempotencyKey,
			userAgent: input.userAgent.slice(0, 500),
			ipRetentionValue: await scopedHash('contract-parent-action-ip', input.requestSubject),
			ipExpiresAt: new Date(Date.parse(now) + 30 * 24 * 60 * 60 * 1000).toISOString(),
			requestId: input.requestId,
			now,
		});
	}

	private async revalidateOffer(offer: StoredContractOffer) {
		const render = contractRenderInputSchema.parse(JSON.parse(offer.render_input_json));
		const source = await renderContractSource(render);
		if (
			source.renderInputHash !== offer.render_input_hash ||
			source.sourceManifestHash !== offer.source_manifest_hash
		) {
			throw new ContractServiceError('CONTRACT_SOURCE_HASH_MISMATCH');
		}
		await this.serviceContext({
			userId: offer.user_id,
			childId: offer.child_id,
			academicPeriodId: offer.academic_period_id,
			render,
		});
		const template = await this.repository.loadTemplate(offer.template_version_id);
		await this.assertGroupPricing({
			userId: offer.user_id,
			childId: offer.child_id,
			render,
			priceQuoteId: offer.price_quote_id,
			priceVersionId: offer.price_version_id,
			priceRuleId: offer.price_rule_id,
			now: this.now(),
			requireQuote: template?.usage_scope === 'production',
		});
		return render;
	}

	async formAndActivate(input: { admin: AdminActor; payload: unknown; requestId: string }) {
		const parsed = contractFormationSchema.safeParse(input.payload);
		if (!parsed.success) throw new ContractServiceError('CONTRACT_FORMATION_INVALID');
		if (!this.config.contracts.sendEnabled || !this.adapter) {
			throw new ContractServiceError('CONTRACT_SEND_DISABLED');
		}
		const requestHash = await hashCanonical({
			offerId: parsed.data.offerId,
			reason: parsed.data.reason,
		});
		const prior = await this.repository.loadAdminAction(
			input.admin.id,
			parsed.data.idempotencyKey
		);
		if (
			prior &&
			(prior.action !== 'form_activate' || prior.request_hash_sha256 !== requestHash)
		) {
			throw new ContractServiceError('IDEMPOTENCY_KEY_REUSED');
		}
		const offer = await this.repository.loadOffer(parsed.data.offerId);
		if (!offer || (!prior && offer.status !== 'accepted_by_parent') || !offer.contract_hash) {
			throw new ContractServiceError('CONTRACT_FORMATION_STATE_REJECTED');
		}
		const template = await this.repository.loadTemplate(offer.template_version_id);
		this.assertSendGate(template);
		let formation: { contractId: string; replayed: boolean };
		if (prior) {
			formation = { contractId: prior.result_ref, replayed: true };
		} else {
			const render = await this.revalidateOffer(offer);
			const now = this.now();
			const offerPdfHash = await this.repository.loadOfferPdfHash(offer.id);
			if (!offerPdfHash) throw new ContractServiceError('OFFER_PDF_MISSING');
			const formationEvidence = {
				schemaVersion: CONTRACT_FORMATION_SCHEMA_VERSION,
				contractNumber: offer.contract_number,
				offerNumber: offer.offer_number,
				parentName: render.parent.fullName,
				providerName: render.provider.fullName,
				parentAcceptedAt: offer.accepted_at ?? '',
				formedAt: now,
				offerPdfHash,
			};
			const formationEvidenceHash = await hashCanonical(formationEvidence);
			const certificateSource = { ...formationEvidence, formationEvidenceHash };
			formation = await this.repository.formContract({
				offer,
				admin: input.admin,
				idempotencyKey: parsed.data.idempotencyKey,
				reason: parsed.data.reason,
				requestId: input.requestId,
				now,
				certificateId: crypto.randomUUID(),
				certificateSourceJson: canonicalJson(certificateSource),
				certificateSourceHash: await hashCanonical(certificateSource),
			});
		}
		const certificate = await this.repository.loadCertificateByContract(formation.contractId);
		if (!certificate) throw new ContractServiceError('FORMATION_CERTIFICATE_MISSING');
		if (certificate.render_status === 'ready') {
			return { ...formation, certificateReady: true };
		}
		try {
			const html = certificateHtml(JSON.parse(certificate.source_snapshot_json));
			const result = await this.adapter.render({
				html,
				sourceManifestHash: certificate.source_hash,
				browserBudgetUsedMs: await this.repository.browserBudgetUsed(
					berlinCalendarDate(this.now())
				),
			});
			const key = `contract-artifacts/certificates/${crypto.randomUUID()}.pdf`;
			const storageIntentId = await this.storageIntents?.stage({
				storageClass: 'archive',
				objectKey: key,
				objectKind: 'formation_certificate_pdf',
				sourceRef: certificate.id,
				sha256: result.sha256,
				sizeBytes: result.bytes.byteLength,
				now: this.now(),
			});
			await this.store.put(key, result.bytes, result.sha256);
			try {
				await this.repository.completeCertificate({
					certificateId: certificate.id,
					contractId: formation.contractId,
					offerId: offer.id,
					template: template!,
					key,
					size: result.bytes.byteLength,
					sha256: result.sha256,
					sourceHash: certificate.source_hash,
					now: this.now(),
					storageIntentId,
				});
			} catch (error) {
				let replay: Awaited<ReturnType<
					typeof this.repository.loadCertificateByContract
				>> = null;
				let authoritativeReadSucceeded = false;
				try {
					replay = await this.repository.loadCertificateByContract(formation.contractId);
					authoritativeReadSucceeded = true;
				} catch {
					// Keep the staged certificate until intent reconciliation.
				}
				if (replay?.render_status === 'ready' && replay.certificate_pdf_r2_key === key) {
					return { ...formation, certificateReady: true };
				}
				if (authoritativeReadSucceeded && !storageIntentId) {
					await this.store.delete(key).catch(() => undefined);
				}
				if (authoritativeReadSucceeded && storageIntentId) {
					await this.storageIntents
						?.markDeletePending(storageIntentId, this.now())
						.catch(() => undefined);
				}
				throw error;
			}
			if (storageIntentId) {
				await this.storageIntents
					?.markLinked(storageIntentId, this.now())
					.catch(() => undefined);
			}
			return { ...formation, certificateReady: true };
		} catch (error) {
			await this.repository
				.markCertificateFailed(
					certificate.id,
					error instanceof ContractPdfError ? error.code : 'CERTIFICATE_RENDER_FAILED',
					this.now()
				)
				.catch(() => undefined);
			throw new ContractServiceError('FORMATION_CERTIFICATE_RENDER_FAILED');
		}
	}

	async submitEndRequest(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		requestId: string;
	}) {
		const parsed = contractEndRequestSchema.safeParse(input.payload);
		if (!parsed.success) throw new ContractServiceError('CONTRACT_END_REQUEST_INVALID');
		const contract = await this.repository.loadOwnedContract(
			input.actor.id,
			parsed.data.contractId
		);
		if (!contract) throw new ContractServiceError('CONTRACT_NOT_FOUND');
		if (
			parsed.data.kind === 'withdrawal' &&
			contract.distance_legal_profile !== 'widerruf_applicable'
		) {
			throw new ContractServiceError('CONTRACT_WITHDRAWAL_NOT_APPLICABLE');
		}
		const now = this.now();
		const receivedOn = berlinCalendarDate(now);
		const calculatedEffectiveOn =
			parsed.data.kind === 'ordinary_termination'
				? contract.contract_kind === 'group_monthly'
					? calendarMonthEnd(receivedOn)
					: contract.contract_kind === 'group_yearly'
						? contract.effective_to
						: parsed.data.requestedEffectiveOn
				: parsed.data.kind === 'withdrawal'
					? receivedOn
					: parsed.data.requestedEffectiveOn;
		const requestHash = await hashCanonical({
			contractId: parsed.data.contractId,
			kind: parsed.data.kind,
			requestedEffectiveOn: parsed.data.requestedEffectiveOn,
			requestTextVersion: parsed.data.requestTextVersion,
		});
		return this.repository.recordEndRequest({
			actor: input.actor,
			contract,
			kind: parsed.data.kind,
			requestedEffectiveOn: parsed.data.requestedEffectiveOn,
			calculatedEffectiveOn,
			requestTextVersion: parsed.data.requestTextVersion,
			idempotencyKey: parsed.data.idempotencyKey,
			requestHash,
			requestId: input.requestId,
			now,
		});
	}

	submitPublicEndRequest(_payload: unknown): never {
		if (!this.config.contracts.publicFunctionsEnabled) {
			throw new ContractServiceError('PUBLIC_CONTRACT_FUNCTION_DISABLED');
		}
		throw new ContractServiceError('PUBLIC_CONTRACT_PROFILE_NOT_IMPLEMENTED');
	}

	async submitAttendanceNotice(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		requestId: string;
	}) {
		const parsed = attendanceNoticeSchema.safeParse(input.payload);
		if (!parsed.success) throw new ContractServiceError('ATTENDANCE_NOTICE_INVALID');
		const contract = await this.repository.loadOwnedContract(
			input.actor.id,
			parsed.data.contractId
		);
		if (
			!contract ||
			!contract.service_engagement_id ||
			!['individual_hourly', 'nachhilfe_hourly'].includes(contract.contract_kind)
		) {
			throw new ContractServiceError('ATTENDANCE_NOTICE_NOT_APPLICABLE');
		}
		const noticeHash = await hashCanonical({
			contractId: parsed.data.contractId,
			noticeTextVersion: parsed.data.noticeTextVersion,
		});
		return this.repository.recordAttendanceNotice({
			actor: input.actor,
			contractId: parsed.data.contractId,
			noticeTextVersion: parsed.data.noticeTextVersion,
			idempotencyKey: parsed.data.idempotencyKey,
			noticeHash,
			requestId: input.requestId,
			now: this.now(),
		});
	}

	async reviewEndRequest(input: { admin: AdminActor; payload: unknown; requestId: string }) {
		const parsed = terminationReviewSchema.safeParse(input.payload);
		if (!parsed.success) throw new ContractServiceError('TERMINATION_REVIEW_INVALID');
		const requestHash = await hashCanonical({
			endRequestId: parsed.data.endRequestId,
			decision: parsed.data.decision,
			effectiveOn: parsed.data.effectiveOn,
			reason: parsed.data.reason,
			externalDebtCheckResult: parsed.data.externalDebtCheckResult,
		});
		const prior = await this.repository.loadAdminAction(
			input.admin.id,
			parsed.data.idempotencyKey
		);
		if (
			prior &&
			(prior.action !== 'termination_review' || prior.request_hash_sha256 !== requestHash)
		) {
			throw new ContractServiceError('IDEMPOTENCY_KEY_REUSED');
		}
		const request = await this.repository.loadEndRequestForAdmin(parsed.data.endRequestId);
		if (!request || (!prior && request.status !== 'received')) {
			throw new ContractServiceError('TERMINATION_REVIEW_STATE_REJECTED');
		}
		const mutual = request.kind === 'mutual_termination_request';
		if (
			(mutual && !['approved', 'declined'].includes(parsed.data.decision)) ||
			(!mutual && !['effective_date_confirmed', 'disputed'].includes(parsed.data.decision)) ||
			(!mutual && parsed.data.externalDebtCheckResult !== 'not_checked') ||
			(parsed.data.decision === 'effective_date_confirmed' &&
				!parsed.data.effectiveOn &&
				!request.calculated_effective_on)
		) {
			throw new ContractServiceError('TERMINATION_REVIEW_DECISION_REJECTED');
		}
		return this.repository.reviewEndRequest({
			admin: input.admin,
			request,
			decision: parsed.data.decision,
			effectiveOn: parsed.data.effectiveOn,
			reason: parsed.data.reason,
			externalDebtCheckResult: parsed.data.externalDebtCheckResult,
			idempotencyKey: parsed.data.idempotencyKey,
			requestHash,
			requestId: input.requestId,
			now: this.now(),
		});
	}

	async recordMediaDecision(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		requestId: string;
	}) {
		const parsed = mediaDecisionSchema.safeParse(input.payload);
		if (!parsed.success) throw new ContractServiceError('MEDIA_DECISION_INVALID');
		const captureScopes = [...new Set(parsed.data.captureScopes)].sort();
		const publicationChannels = [...new Set(parsed.data.publicationChannels)].sort();
		if (
			captureScopes.length !== parsed.data.captureScopes.length ||
			publicationChannels.length !== parsed.data.publicationChannels.length
		) {
			throw new ContractServiceError('MEDIA_DECISION_INVALID');
		}
		const context = await this.repository.loadMediaDecisionContext(
			input.actor.id,
			parsed.data.childId,
			parsed.data.withdrawalContactVersionId
		);
		if (!context || context.approval_status !== 'approved') {
			throw new ContractServiceError('MEDIA_DECISION_CONTEXT_REJECTED');
		}
		if (
			parsed.data.decision === 'granted' &&
			(!this.config.contracts.mediaOnlineGrantEnabled ||
				context.compliance_assessment_status !== 'passed')
		) {
			throw new ContractServiceError('MEDIA_ONLINE_GRANT_DISABLED');
		}
		const now = this.now();
		const evidence = {
			userId: input.actor.id,
			childId: parsed.data.childId,
			captureScopes,
			publicationChannels,
			decision: parsed.data.decision,
			textVersion: parsed.data.textVersion,
			withdrawalContactVersionId: context.contact_id,
			withdrawalContactSnapshotHash: context.snapshot_hash,
		};
		return this.repository.recordMediaDecision({
			actor: input.actor,
			childId: parsed.data.childId,
			captureScopesJson: canonicalJson(captureScopes),
			publicationChannelsJson: canonicalJson(publicationChannels),
			textVersion: parsed.data.textVersion,
			contactVersionId: context.contact_id,
			contactSnapshotHash: context.snapshot_hash,
			decision: parsed.data.decision,
			idempotencyKey: parsed.data.idempotencyKey,
			evidenceHash: await hashCanonical(evidence),
			requestId: input.requestId,
			now,
		});
	}

	async recordMediaWithdrawal(input: { admin: AdminActor; payload: unknown; requestId: string }) {
		const parsed = mediaWithdrawalSchema.safeParse(input.payload);
		if (!parsed.success) throw new ContractServiceError('MEDIA_WITHDRAWAL_INVALID');
		const captureScopes = [...new Set(parsed.data.captureScopes)].sort();
		const publicationChannels = [...new Set(parsed.data.publicationChannels)].sort();
		if (
			captureScopes.length !== parsed.data.captureScopes.length ||
			publicationChannels.length !== parsed.data.publicationChannels.length
		) {
			throw new ContractServiceError('MEDIA_WITHDRAWAL_INVALID');
		}
		const evidenceHash = await hashCanonical({
			ownerUserId: parsed.data.ownerUserId,
			childId: parsed.data.childId,
			captureScopes,
			publicationChannels,
			channel: parsed.data.channel,
			receivedAt: parsed.data.receivedAt,
			evidenceSummary: parsed.data.evidenceSummary,
		});
		return this.repository.recordMediaWithdrawal({
			admin: input.admin,
			ownerUserId: parsed.data.ownerUserId,
			childId: parsed.data.childId,
			captureScopesJson: canonicalJson(captureScopes),
			publicationChannelsJson: canonicalJson(publicationChannels),
			channel: parsed.data.channel,
			receivedAt: parsed.data.receivedAt,
			evidenceHash,
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			now: this.now(),
		});
	}

	async loadOwnerOffer(actor: AuthenticatedUser, offerId: string) {
		const offer = await this.repository.loadOwnerOfferDetail(actor.id, offerId);
		if (!offer) throw new ContractServiceError('CONTRACT_NOT_FOUND');
		return {
			id: offer.id,
			contractId: offer.contract_id,
			operationalStatus: offer.operational_status,
			contractNumber: offer.contract_number,
			contractKind: offer.contract_kind,
			status: offer.status,
			childName: offer.child_name,
			effectiveFrom: offer.effective_from,
			effectiveTo: offer.effective_to,
			contractHash: offer.contract_hash,
			expiresAt: offer.expires_at,
			childId: offer.child_id,
			mediaContactVersionId: offer.media_contact_version_id,
			distanceLegalProfile: offer.distance_legal_profile,
			artifacts: offer.artifacts.map((artifact) => ({
				id: artifact.id,
				kind: artifact.artifact_kind,
				shortHash: artifact.sha256.slice(0, 12),
				createdAt: artifact.created_at,
			})),
		};
	}

	async downloadArtifact(input: {
		actor: AuthenticatedUser;
		artifactId: string;
		requestId: string;
	}) {
		const artifact = await this.repository.loadArtifactForOwner(
			input.actor.id,
			input.artifactId
		);
		if (!artifact) throw new ContractServiceError('CONTRACT_ARTIFACT_NOT_FOUND');
		const object = await this.store.get(artifact.private_r2_key);
		if (
			!object ||
			object.size !== artifact.size_bytes ||
			(await sha256Bytes(object.body)) !== artifact.sha256
		) {
			throw new ContractServiceError('CONTRACT_ARTIFACT_INTEGRITY_FAILED');
		}
		await this.repository.authorizeAndAuditOwnerArtifactRead({
			artifactId: artifact.id,
			ownerUserId: input.actor.id,
			expectedStorageKey: artifact.private_r2_key,
			expectedSha256: artifact.sha256,
			expectedSizeBytes: artifact.size_bytes,
			requestId: input.requestId,
			now: this.now(),
		});
		return {
			body: object.body,
			contentType: artifact.content_type,
			filename:
				artifact.content_type === 'application/pdf'
					? `vertrag-${artifact.id.slice(0, 8)}.pdf`
					: `vertrag-${artifact.id.slice(0, 8)}.html`,
		};
	}

	async downloadAdminArtifact(input: {
		admin: AdminActor;
		artifactId: string;
		purpose: unknown;
		requestId: string;
	}) {
		const purpose = contractArtifactDownloadPurposeSchema.safeParse(input.purpose);
		if (!purpose.success) throw new ContractServiceError('INVALID_DOWNLOAD_PURPOSE');
		const artifact = await this.repository.loadArtifactForAdmin(
			input.admin.id,
			input.artifactId
		);
		if (!artifact) throw new ContractServiceError('CONTRACT_ARTIFACT_NOT_FOUND');
		const object = await this.store.get(artifact.private_r2_key);
		if (
			!object ||
			object.size !== artifact.size_bytes ||
			(await sha256Bytes(object.body)) !== artifact.sha256
		) {
			throw new ContractServiceError('CONTRACT_ARTIFACT_INTEGRITY_FAILED');
		}
		await this.repository.authorizeAndAuditAdminArtifactRead({
			artifactId: artifact.id,
			adminUserId: input.admin.id,
			purposeCode: purpose.data,
			expectedStorageKey: artifact.private_r2_key,
			expectedSha256: artifact.sha256,
			expectedSizeBytes: artifact.size_bytes,
			requestId: input.requestId,
			now: this.now(),
		});
		return {
			body: object.body,
			contentType: artifact.content_type,
			filename:
				artifact.content_type === 'application/pdf'
					? `vertrag-admin-${artifact.id.slice(0, 8)}.pdf`
					: `vertrag-admin-${artifact.id.slice(0, 8)}.html`,
		};
	}
}

export function contractErrorCode(error: unknown): string {
	if (error instanceof ContractServiceError || error instanceof ContractRepositoryError) {
		return error.code;
	}
	return 'CONTRACT_OPERATION_FAILED';
}

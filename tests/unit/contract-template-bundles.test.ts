import { describe, expect, it } from 'vitest';
import type { ContractTemplateId } from '$lib/server/contracts/contracts';
import {
	PREVIEW_REVIEW_TEMPLATE_VERSION,
	buildContractTemplateBundle,
	contractTemplateBundleHashes,
	renderContractSource,
	serializeContractTemplateBundle,
	type ContractTemplateBundle,
} from '$lib/server/contracts/templates';

const hash = (character: string) => character.repeat(64);

function renderInput(templateId: ContractTemplateId = 'group_yearly') {
	return {
		schemaVersion: 'contract-render-v1' as const,
		previewReviewMarker: 'synthetic-no-pii' as const,
		templateId,
		offerNumber: 'OFFER-BUNDLE-1',
		contractNumber: '2. 0001-1',
		provider: {
			fullName: 'Kolibri Testverein',
			addressLines: ['Teststraße 1'],
			role: 'provider' as const,
			payerRole: false,
			paymentTermsVersion: 'preview-review-payment-v1',
		},
		parent: {
			fullName: 'Test Elternteil',
			addressLines: ['Elternweg 2'],
			role: 'contracting_parent' as const,
			payerRole: true,
		},
		child: {
			fullName: 'Test Kind',
			addressLines: ['Elternweg 2'],
			role: 'child' as const,
			payerRole: false as const,
			birthDate: '2017-03-04',
		},
		service: {
			relation: 'course' as const,
			courseGroupId: 'course-1',
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
					code: 'base',
					description: 'Grundtarif',
					amountCents: 4600,
					semantics: 'base_price' as const,
					basis: 'synthetic',
				},
			],
			basePriceDisclaimer: true,
		},
		term: {
			initialTermText: 'Testlaufzeit.',
			renewalText: 'Keine Testverlängerung.',
			ordinaryTerminationText: 'Ordentliche Beendigung gemäß Testprofil.',
			extraordinaryTerminationText: 'Außerordentliche Beendigung bleibt möglich.',
		},
		legal: {
			clauseSetVersion: 'preview-review-clauses-v1',
			attachments: ['Datenschutzhinweis'],
			privacyNoticeVersion: 'privacy-v1',
			distanceLegalProfile: 'widerruf_applicable' as const,
			distanceLegalBasisHash: hash('d'),
			withdrawalTextVersion: 'withdrawal-v1',
			earlyPerformanceRequestVersion: 'early-v1',
			wertersatzNoticeVersion: 'wertersatz-v1',
			mediaClauseVersion: 'media-v1',
		},
	};
}

const snapshotHashes = {
	providerSnapshotHash: hash('a'),
	paymentTermsHash: hash('b'),
	legalSnapshotHash: hash('c'),
	mediaSnapshotHash: hash('d'),
};

function clone(bundle: ContractTemplateBundle): ContractTemplateBundle {
	return structuredClone(bundle);
}

describe('contract render-source bundles', () => {
	it('hashes every render source component and keeps rendered HTML evidence separate', async () => {
		const bundle = buildContractTemplateBundle({
			templateId: 'group_yearly',
			templateVersion: PREVIEW_REVIEW_TEMPLATE_VERSION,
			usageScope: 'preview_review',
			snapshotHashes,
		});
		const baseline = await contractTemplateBundleHashes(bundle);
		const mutations: Array<(value: ContractTemplateBundle) => void> = [
			(value) => (value.source.baseBody = `${value.source.baseBody}\n<!-- changed -->`),
			(value) => (value.source.kindClause = `${value.source.kindClause}\n<p>changed</p>`),
			(value) => (value.source.previewAppendix += '\n<p>changed</p>'),
			(value) => (value.source.fixedCopy.scheduleFallback += ' changed'),
			(value) => (value.source.kindCopy.title += ' changed'),
			(value) => (value.source.previewOverrides!.term.initialTermText += ' changed'),
			(value) =>
				(value.source.previewOverrides!.legal = {
					...value.source.previewOverrides!.legal,
					privacyNoticeVersion: `${value.source.previewOverrides!.legal.privacyNoticeVersion}-changed`,
				}),
			(value) => (value.source.css += '\nbody { letter-spacing: .01em; }'),
			(value) => (value.fonts[0].id = 'font-v2'),
			(value) =>
				value.assets.push({
					id: 'asset-v2',
					mediaType: 'application/octet-stream',
					sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
					dataBase64: 'YQ==',
				}),
			(value) => (value.helpers.htmlEscapeVersion = 'escape-html-v2'),
			(value) => (value.helpers.embeddedResourceVersion = 'embedded-data-resource-v2'),
			(value) => (value.renderer.adapterContractVersion = 'pdf-adapter-v2'),
			(value) => (value.renderer.workerCompatibilityDate = '2026-03-25'),
			(value) => (value.clauseSetVersion += '-changed'),
			(value) => value.requiredFields.push('changedField'),
			(value) => (value.snapshots.providerSnapshotHash = hash('0')),
			(value) => (value.snapshots.paymentTermsHash = hash('1')),
			(value) => (value.snapshots.legalSnapshotHash = hash('2')),
			(value) => (value.snapshots.mediaSnapshotHash = hash('3')),
		];
		for (const mutate of mutations) {
			const changed = clone(bundle);
			mutate(changed);
			expect((await contractTemplateBundleHashes(changed)).bundleHash).not.toBe(
				baseline.bundleHash
			);
		}
		const tamperedFont = clone(bundle);
		tamperedFont.fonts[0].dataBase64 = `${tamperedFont.fonts[0].dataBase64.slice(0, -4)}YQ==`;
		await expect(contractTemplateBundleHashes(tamperedFont)).rejects.toMatchObject({
			code: 'CONTRACT_TEMPLATE_SOURCE_MISMATCH',
		});

		const rendered = await renderContractSource(renderInput(), bundle);
		expect(rendered.sourceManifest.bundleHash).toBe(baseline.bundleHash);
		expect(rendered.sourceManifest.renderedHtmlHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(rendered.sourceManifest.renderedHtmlHash).not.toBe(baseline.bundleHash);
		expect(new TextDecoder().decode(serializeContractTemplateBundle(bundle))).toContain(
			'preview-review-v1'
		);
		expect(rendered.html).toContain('data:font/woff;base64,d09GRgAB');
		expect(rendered.html).not.toContain('__KOLIBRI_CONTRACT_FONT_');
	});

	it('binds every contract-kind clause to its own source bundle', async () => {
		const templateIds: ContractTemplateId[] = [
			'group_yearly',
			'group_monthly',
			'individual_hourly',
			'nachhilfe_hourly',
		];
		const hashes = await Promise.all(
			templateIds.map(async (templateId) => {
				const bundle = buildContractTemplateBundle({
					templateId,
					templateVersion: PREVIEW_REVIEW_TEMPLATE_VERSION,
					usageScope: 'preview_review',
					snapshotHashes,
				});
				const before = await contractTemplateBundleHashes(bundle);
				const changed = clone(bundle);
				changed.source.kindClause += '<p>changed</p>';
				expect((await contractTemplateBundleHashes(changed)).bundleHash).not.toBe(
					before.bundleHash
				);
				return before.bundleHash;
			})
		);
		expect(new Set(hashes)).toHaveLength(templateIds.length);
	});

	it('keeps v1 stable when v2 is added and rejects unknown, missing, or mismatched source', async () => {
		const v1 = buildContractTemplateBundle({
			templateId: 'group_yearly',
			templateVersion: PREVIEW_REVIEW_TEMPLATE_VERSION,
			usageScope: 'preview_review',
			snapshotHashes,
		});
		const v1BytesBefore = serializeContractTemplateBundle(v1);
		const v1HashesBefore = await contractTemplateBundleHashes(v1);
		const v1HashBefore = v1HashesBefore.bundleHash;
		const v1RenderBefore = await renderContractSource(renderInput(), v1);
		expect(v1BytesBefore.byteLength).toBe(125256);
		expect(v1HashesBefore).toEqual({
			bundleHash: 'ac9ccae8a9d74b342e390bf9da6e94257fa19eb7326a8f71cb43007925778549',
			htmlSourceHash: 'f04824122195fd7ff0119ad71e52cdc38f38dffb544cdc6d49336c2177fc19f0',
			cssSourceHash: 'b4665a710c0958971a992f5166eadb2162fd3d5f1abd5d151486897f2c16370e',
		});
		const v2 = clone(v1);
		v2.templateVersion = 'preview-review-v2';
		v2.source.fixedCopy.scheduleFallback += ' v2';
		expect((await contractTemplateBundleHashes(v2)).bundleHash).not.toBe(v1HashBefore);
		expect(serializeContractTemplateBundle(v1)).toEqual(v1BytesBefore);
		expect((await contractTemplateBundleHashes(v1)).bundleHash).toBe(v1HashBefore);
		expect(await renderContractSource(renderInput(), v1)).toEqual(v1RenderBefore);

		const unknown = clone(v1);
		unknown.templateVersion = 'unknown-template-v99';
		await expect(renderContractSource(renderInput(), unknown)).rejects.toMatchObject({
			code: 'CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED',
		});
		const mismatch = clone(v1);
		mismatch.renderSchemaVersion = 'contract-render-v99';
		await expect(renderContractSource(renderInput(), mismatch)).rejects.toMatchObject({
			code: 'CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED',
		});
		await expect(renderContractSource(renderInput(), null)).rejects.toMatchObject({
			code: 'CONTRACT_TEMPLATE_SOURCE_MISSING',
		});
	});
});

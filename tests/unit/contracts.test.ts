import { describe, expect, it } from 'vitest';
import {
	contractRenderInputSchema,
	type ContractTemplateId,
} from '$lib/server/contracts/contracts';
import {
	BrowserRunContractPdfAdapter,
	SyntheticContractPdfAdapter,
} from '$lib/server/contracts/pdf';
import {
	CONTRACT_TEMPLATE_IDS,
	PREVIEW_REVIEW_TEMPLATE_VERSION,
	buildContractTemplateBundle,
	renderContractSource,
} from '$lib/server/contracts/templates';
import { calendarDayAfter, calendarMonthEnd } from '$lib/server/time/berlin';

const hash = (character: string) => character.repeat(64);
const snapshotHashes = {
	providerSnapshotHash: hash('1'),
	paymentTermsHash: hash('2'),
	legalSnapshotHash: hash('3'),
	mediaSnapshotHash: hash('4'),
};

function input(templateId: ContractTemplateId) {
	const group = templateId.startsWith('group_');
	const individual = templateId === 'individual_hourly';
	const funded = templateId === 'nachhilfe_hourly';
	return {
		schemaVersion: 'contract-render-v1' as const,
		templateId,
		offerNumber: 'OFFER-TEST-1',
		contractNumber: '2. 0001-1',
		provider: {
			fullName: 'Kolibri Testverein',
			addressLines: ['Teststraße 1'],
			role: 'provider' as const,
			payerRole: false,
			paymentTermsVersion: 'pay-v1',
		},
		parent: {
			fullName: 'Mária <Eltern>',
			addressLines: ['Elternweg 2'],
			role: 'contracting_parent' as const,
			payerRole: !funded,
		},
		child: {
			fullName: 'Kind & Beispiel',
			addressLines: ['Elternweg 2'],
			role: 'child' as const,
			payerRole: false as const,
			birthDate: '2017-03-04',
		},
		service: {
			relation: group ? ('course' as const) : ('request' as const),
			courseGroupId: group ? 'course-1' : null,
			requestId: group ? null : 'request-1',
			requestKind: group
				? null
				: individual
					? ('individual' as const)
					: ('nachhilfe' as const),
			fundingAuthorizationId: funded ? 'authorization-1' : null,
			subject: 'Mathematik – lange Unicode-Bezeichnung',
			scheduleLines: ['Montag 16:00–17:30'],
			effectiveFrom: '2026-08-01',
			effectiveTo: funded ? '2026-08-31' : null,
		},
		billing: {
			model: group
				? ('monthly_group_fee' as const)
				: individual
					? ('delivered_units' as const)
					: ('third_party_funded' as const),
			currency: 'EUR' as const,
			unitMinutes: group ? null : 45,
			priceSource: group
				? templateId === 'group_yearly'
					? ('excel_yearly' as const)
					: ('excel_monthly' as const)
				: individual
					? ('configured_individual_hourly' as const)
					: ('fixed_nachhilfe_hourly' as const),
			priceMode: 'rule_derived' as const,
			basePriceCents: 3000,
			finalPriceCents: 3000,
			amountSemantics: group
				? ('base_price' as const)
				: individual
					? ('unit_rate' as const)
					: ('third_party_rate' as const),
			paymentArrangement: funded ? ('not_applicable' as const) : ('manual_payment' as const),
			paymentDueDay: funded ? null : 7,
			billingPeriodCode: group ? ('calendar_month' as const) : ('per_45_minutes' as const),
			lineItems: [
				{
					code: 'base',
					description: 'Grundtarif',
					amountCents: 3000,
					semantics: group
						? ('base_price' as const)
						: individual
							? ('unit_rate' as const)
							: ('third_party_rate' as const),
					basis: 'synthetic',
				},
			],
			basePriceDisclaimer: group,
		},
		term: {
			initialTermText: 'Testlaufzeit.',
			renewalText: 'Keine Testverlängerung.',
			ordinaryTerminationText: 'Ordentliche Beendigung gemäß Testprofil.',
			extraordinaryTerminationText: 'Außerordentliche Beendigung bleibt möglich.',
		},
		legal: {
			clauseSetVersion: 'synthetic-clause-v1',
			attachments: ['Datenschutzhinweis'],
			privacyNoticeVersion: 'privacy-v1',
			distanceLegalProfile: 'offline_only' as const,
			distanceLegalBasisHash: null,
			withdrawalTextVersion: 'withdrawal-v1',
			earlyPerformanceRequestVersion: null,
			wertersatzNoticeVersion: null,
			mediaClauseVersion: 'media-v1',
		},
	};
}

describe('stage 09 contract render contract', () => {
	it.each(CONTRACT_TEMPLATE_IDS)(
		'validates and renders escaped, input-dependent HTML for %s',
		async (templateId) => {
			const value = input(templateId);
			expect(contractRenderInputSchema.parse(value).templateId).toBe(templateId);
			const rendered = await renderContractSource(
				value,
				buildContractTemplateBundle({
					templateId,
					templateVersion: 'synthetic-core-v1',
					usageScope: 'synthetic_test',
					snapshotHashes,
				})
			);
			expect(rendered.html).toContain('&lt;Eltern&gt;');
			expect(rendered.html).not.toContain('<script');
			expect(rendered.sourceManifest.templateId).toBe(templateId);
			expect(rendered.renderInputHash).toMatch(/^[0-9a-f]{64}$/u);
		}
	);

	it.each(CONTRACT_TEMPLATE_IDS)(
		'renders a visibly marked, kind-specific real-preview source for %s',
		async (templateId) => {
			const value = {
				...input(templateId),
				previewReviewMarker: 'synthetic-no-pii' as const,
				legal: {
					...input(templateId).legal,
					clauseSetVersion: 'preview-review-clauses-v1',
					distanceLegalProfile: 'widerruf_applicable' as const,
					distanceLegalBasisHash: hash('a'),
				},
			};
			const rendered = await renderContractSource(
				value,
				buildContractTemplateBundle({
					templateId,
					templateVersion: PREVIEW_REVIEW_TEMPLATE_VERSION,
					usageScope: 'preview_review',
					snapshotHashes,
				})
			);
			expect(rendered.html).toContain('TEST/ENTWURF');
			expect(rendered.html).toContain('nicht für reale Vertragsbeziehungen');
			expect(rendered.html).toContain('Allgemeine Vertragsbedingungen');
			expect(rendered.html).toContain('Besondere Bedingungen');
			expect(rendered.sourceManifest.templateVersion).toBe(PREVIEW_REVIEW_TEMPLATE_VERSION);
		}
	);

	it('rejects every cross-kind billing/service permutation before render', () => {
		const groupAsFunded = input('group_yearly');
		groupAsFunded.billing.model = 'third_party_funded';
		expect(contractRenderInputSchema.safeParse(groupAsFunded).success).toBe(false);

		const individualWithFunding = input('individual_hourly');
		individualWithFunding.service.fundingAuthorizationId = 'authorization-1';
		expect(contractRenderInputSchema.safeParse(individualWithFunding).success).toBe(false);

		const nachhilfeWithoutEnd = input('nachhilfe_hourly');
		nachhilfeWithoutEnd.service.effectiveTo = null;
		expect(contractRenderInputSchema.safeParse(nachhilfeWithoutEnd).success).toBe(false);
	});

	it('creates a valid input-dependent synthetic PDF only in tests and enforces limits', async () => {
		const adapter = new SyntheticContractPdfAdapter(
			{ maxHtmlBytes: 2048, maxPdfBytes: 4096 },
			'test'
		);
		const first = await adapter.render({
			html: '<p>eins</p>',
			sourceManifestHash: hash('a'),
			browserBudgetUsedMs: 0,
		});
		const second = await adapter.render({
			html: '<p>zwei</p>',
			sourceManifestHash: hash('b'),
			browserBudgetUsedMs: 0,
		});
		expect(new TextDecoder().decode(first.bytes.slice(0, 8))).toBe('%PDF-1.7');
		expect(first.sha256).not.toBe(second.sha256);
		await expect(
			adapter.render({
				html: 'x'.repeat(2049),
				sourceManifestHash: hash('c'),
				browserBudgetUsedMs: 0,
			})
		).rejects.toMatchObject({ code: 'HTML_SIZE_LIMIT' });
	});

	it('projects inclusive contract ends to exclusive calendar boundaries', () => {
		expect(calendarDayAfter('2024-02-29')).toBe('2024-03-01');
		expect(calendarDayAfter('2026-03-29')).toBe('2026-03-30');
		expect(calendarDayAfter('2026-10-25')).toBe('2026-10-26');
		expect(calendarMonthEnd('2024-02-05')).toBe('2024-02-29');
	});

	it('keeps the Browser Run boundary inline, budgeted, and explicitly retryable', async () => {
		const browser = {
			quickAction: async () =>
				new Response('temporarily unavailable', {
					status: 503,
					headers: { 'Retry-After': '7' },
				}),
		} as unknown as BrowserRun;
		const adapter = new BrowserRunContractPdfAdapter(browser, {
			maxHtmlBytes: 2048,
			maxPdfBytes: 4096,
			browserDailyBudgetMs: 1000,
		});
		await expect(
			adapter.render({
				html: '<script>bad()</script>',
				sourceManifestHash: hash('a'),
				browserBudgetUsedMs: 0,
			})
		).rejects.toMatchObject({
			code: 'EXTERNAL_RESOURCE_OR_SCRIPT_FORBIDDEN',
			retryable: false,
		});
		await expect(
			adapter.render({
				html: '<p>safe</p>',
				sourceManifestHash: hash('a'),
				browserBudgetUsedMs: 1000,
			})
		).rejects.toMatchObject({ code: 'BROWSER_DAILY_BUDGET_EXCEEDED' });
		await expect(
			adapter.render({
				html: '<p>safe</p>',
				sourceManifestHash: hash('a'),
				browserBudgetUsedMs: 0,
			})
		).rejects.toMatchObject({ code: 'BROWSER_RUN_503', retryable: true, retryAfterSeconds: 7 });
	});
});

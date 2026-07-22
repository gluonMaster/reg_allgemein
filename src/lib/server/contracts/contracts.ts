import { z } from 'zod';

export const CONTRACT_RENDER_SCHEMA_VERSION = 'contract-render-v1' as const;
export const CONTRACT_ACCEPTANCE_TEXT_VERSION = 'contract-acceptance-de-v1' as const;
export const CONTRACT_FORMATION_SCHEMA_VERSION = 'contract-formation-v1' as const;

export const contractTemplateIdSchema = z.enum([
	'group_yearly',
	'group_monthly',
	'individual_hourly',
	'nachhilfe_hourly',
]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/u);
const nonEmpty = z.string().trim().min(1).max(500);

const partySchema = z
	.object({
		fullName: z.string().trim().min(1).max(200),
		addressLines: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
		role: z.enum(['provider', 'contracting_parent', 'child']),
		payerRole: z.boolean(),
	})
	.strict();

const lineItemSchema = z
	.object({
		code: z.string().trim().min(1).max(80),
		description: z.string().trim().min(1).max(500),
		amountCents: z.number().int().nonnegative(),
		semantics: z.enum(['base_price', 'unit_rate', 'third_party_rate', 'fee']),
		basis: z.string().trim().min(1).max(500),
	})
	.strict();

export const contractRenderInputSchema = z
	.object({
		schemaVersion: z.literal(CONTRACT_RENDER_SCHEMA_VERSION),
		templateId: contractTemplateIdSchema,
		offerNumber: z.string().trim().min(1).max(100),
		contractNumber: z.string().trim().min(1).max(100),
		provider: partySchema.extend({
			role: z.literal('provider'),
			paymentTermsVersion: nonEmpty,
		}),
		parent: partySchema.extend({
			role: z.literal('contracting_parent'),
		}),
		child: partySchema.extend({
			role: z.literal('child'),
			payerRole: z.literal(false),
			birthDate: isoDate,
		}),
		service: z
			.object({
				relation: z.enum(['course', 'request']),
				courseGroupId: z.string().min(1).nullable(),
				requestId: z.string().min(1).nullable(),
				requestKind: z.enum(['individual', 'nachhilfe']).nullable(),
				fundingAuthorizationId: z.string().min(1).nullable(),
				subject: nonEmpty,
				scheduleLines: z.array(z.string().trim().min(1).max(300)).max(30),
				effectiveFrom: isoDate,
				effectiveTo: isoDate.nullable(),
			})
			.strict(),
		billing: z
			.object({
				model: z.enum(['monthly_group_fee', 'delivered_units', 'third_party_funded']),
				currency: z.literal('EUR'),
				unitMinutes: z.number().int().positive().nullable(),
				priceSource: z.enum([
					'excel_yearly',
					'excel_monthly',
					'fallback_90',
					'configured_individual_hourly',
					'fixed_nachhilfe_hourly',
				]),
				priceMode: z.enum(['rule_derived', 'manual_override']),
				basePriceCents: z.number().int().nonnegative(),
				finalPriceCents: z.number().int().nonnegative(),
				amountSemantics: z.enum(['base_price', 'unit_rate', 'third_party_rate']),
				paymentArrangement: z.enum([
					'existing_external_sepa',
					'manual_payment',
					'not_applicable',
				]),
				paymentDueDay: z.number().int().min(1).max(28).nullable(),
				billingPeriodCode: z.enum(['calendar_month', 'per_45_minutes']),
				lineItems: z.array(lineItemSchema).min(1).max(50),
				basePriceDisclaimer: z.boolean(),
			})
			.strict(),
		term: z
			.object({
				initialTermText: nonEmpty,
				renewalText: nonEmpty,
				ordinaryTerminationText: nonEmpty,
				extraordinaryTerminationText: nonEmpty,
			})
			.strict(),
		legal: z
			.object({
				clauseSetVersion: nonEmpty,
				attachments: z.array(z.string().trim().min(1).max(200)).max(30),
				privacyNoticeVersion: nonEmpty,
				distanceLegalProfile: z.enum([
					'offline_only',
					'widerruf_applicable',
					'widerruf_not_applicable_312g_2_9',
				]),
				distanceLegalBasisHash: sha256.nullable(),
				withdrawalTextVersion: nonEmpty,
				earlyPerformanceRequestVersion: z.string().trim().min(1).max(200).nullable(),
				wertersatzNoticeVersion: z.string().trim().min(1).max(200).nullable(),
				mediaClauseVersion: z.string().trim().min(1).max(200).nullable(),
			})
			.strict(),
	})
	.strict()
	.superRefine((input, context) => {
		const group = input.templateId === 'group_yearly' || input.templateId === 'group_monthly';
		const individual = input.templateId === 'individual_hourly';
		const nachhilfe = input.templateId === 'nachhilfe_hourly';
		const invalid = (message: string) =>
			context.addIssue({ code: 'custom', message, path: ['templateId'] });

		if (input.service.effectiveTo && input.service.effectiveFrom > input.service.effectiveTo) {
			invalid('effective date range is invalid');
		}
		if (group) {
			if (
				input.service.relation !== 'course' ||
				!input.service.courseGroupId ||
				input.service.requestId ||
				input.service.requestKind ||
				input.service.fundingAuthorizationId ||
				input.billing.model !== 'monthly_group_fee' ||
				input.billing.amountSemantics !== 'base_price' ||
				input.billing.billingPeriodCode !== 'calendar_month' ||
				input.billing.unitMinutes !== null ||
				input.billing.paymentArrangement === 'not_applicable' ||
				!input.billing.basePriceDisclaimer
			) invalid('group service/template/billing permutation is forbidden');
		}
		if (individual) {
			if (
				input.service.relation !== 'request' ||
				!input.service.requestId ||
				input.service.requestKind !== 'individual' ||
				input.service.courseGroupId ||
				input.service.fundingAuthorizationId ||
				input.billing.model !== 'delivered_units' ||
				input.billing.priceSource !== 'configured_individual_hourly' ||
				input.billing.amountSemantics !== 'unit_rate' ||
				input.billing.unitMinutes !== 45 ||
				input.billing.billingPeriodCode !== 'per_45_minutes' ||
				input.billing.paymentArrangement === 'not_applicable'
			) invalid('individual service/template/billing permutation is forbidden');
		}
		if (nachhilfe) {
			if (
				input.service.relation !== 'request' ||
				!input.service.requestId ||
				input.service.requestKind !== 'nachhilfe' ||
				input.service.courseGroupId ||
				!input.service.fundingAuthorizationId ||
				!input.service.effectiveTo ||
				input.billing.model !== 'third_party_funded' ||
				input.billing.priceSource !== 'fixed_nachhilfe_hourly' ||
				input.billing.amountSemantics !== 'third_party_rate' ||
				input.billing.unitMinutes !== 45 ||
				input.billing.finalPriceCents !== 3000 ||
				input.billing.billingPeriodCode !== 'per_45_minutes' ||
				input.billing.paymentArrangement !== 'not_applicable' ||
				input.billing.paymentDueDay !== null ||
				input.parent.payerRole
			) invalid('Nachhilfe service/template/billing permutation is forbidden');
		}
		if (input.billing.paymentArrangement === 'manual_payment' && input.billing.paymentDueDay !== 7) {
			invalid('manual payment requires due day 7');
		}
		if (
			input.billing.paymentArrangement === 'existing_external_sepa' &&
			input.billing.paymentDueDay !== null
		) invalid('external SEPA must not contain a portal due day');
	});

export const contractParentDecisionSchema = z
	.object({
		offerId: z.string().uuid(),
		expectedContractHash: sha256,
		decision: z.enum(['accept', 'decline']),
		acceptanceTextVersion: z.literal(CONTRACT_ACCEPTANCE_TEXT_VERSION),
		acceptanceText: z.string().trim().min(20).max(2000),
		idempotencyKey: z.string().trim().min(8).max(200),
	})
	.strict();

export const contractFormationSchema = z
	.object({
		offerId: z.string().uuid(),
		reason: z.string().trim().min(5).max(1000),
		confirmation: z.literal('confirmed'),
		idempotencyKey: z.string().trim().min(8).max(200),
	})
	.strict();

export const contractEndRequestSchema = z
	.object({
		contractId: z.string().uuid(),
		kind: z.enum([
			'withdrawal',
			'ordinary_termination',
			'extraordinary_termination',
			'mutual_termination_request',
		]),
		requestedEffectiveOn: isoDate.nullable(),
		requestTextVersion: z.string().trim().min(1).max(200),
		idempotencyKey: z.string().trim().min(8).max(200),
	})
	.strict();

export const mediaDecisionSchema = z
	.object({
		childId: z.string().min(1),
		captureScopes: z.array(z.enum(['photo', 'video'])).min(1).max(2),
		publicationChannels: z
			.array(z.enum(['website', 'social_media', 'print']))
			.min(1)
			.max(3),
		decision: z.enum(['granted', 'declined']),
		textVersion: z.string().trim().min(1).max(200),
		withdrawalContactVersionId: z.string().min(1),
		idempotencyKey: z.string().trim().min(8).max(200),
	})
	.strict();

export const attendanceNoticeSchema = z
	.object({
		contractId: z.string().uuid(),
		noticeTextVersion: z.string().trim().min(1).max(200),
		idempotencyKey: z.string().trim().min(8).max(200),
	})
	.strict();

export const mediaWithdrawalSchema = z
	.object({
		ownerUserId: z.string().min(1),
		childId: z.string().min(1),
		captureScopes: z.array(z.enum(['photo', 'video'])).min(1).max(2),
		publicationChannels: z.array(z.enum(['website', 'social_media', 'print'])).min(1).max(3),
		channel: z.enum(['office', 'email', 'phone']),
		receivedAt: z.string().datetime({ offset: true }),
		evidenceSummary: z.string().trim().min(5).max(500),
		idempotencyKey: z.string().trim().min(8).max(200),
	})
	.strict();

export const terminationReviewSchema = z
	.object({
		endRequestId: z.string().uuid(),
		decision: z.enum(['effective_date_confirmed', 'disputed', 'approved', 'declined']),
		effectiveOn: isoDate.nullable(),
		reason: z.string().trim().min(5).max(1000),
		externalDebtCheckResult: z.enum(['not_checked', 'no_debt_reported', 'debt_reported', 'unknown']),
		idempotencyKey: z.string().trim().min(8).max(200),
	})
	.strict();

export type ContractTemplateId = z.infer<typeof contractTemplateIdSchema>;
export type ContractRenderInput = z.infer<typeof contractRenderInputSchema>;
export type ContractParentDecision = z.infer<typeof contractParentDecisionSchema>;

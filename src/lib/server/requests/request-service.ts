import type { AuthenticatedUser } from '$lib/server/auth/session';
import type { CabinetReadModelContributor } from '$lib/server/cabinet/cabinet-service';
import type { PricingRuntimeConfig } from '$lib/server/config/runtime';
import {
	requestCreateSchema,
	requestSaveSchema,
	requestStateActionSchema,
} from './contracts';
import { IndividualRequestError, IndividualRequestRepository } from './request-repository';
import { formatMessage, translate } from '$lib/i18n';
import { formatEuro, formatCalendarDate } from '$lib/i18n/locale';
import { requireParent } from '$lib/server/security/authorization';

export const FUNDED_NACHHILFE_RATE_CENTS_PER_45_MIN = 3000;

export class IndividualRequestService implements CabinetReadModelContributor {
	constructor(
		private readonly repository: IndividualRequestRepository,
		private readonly pricing: PricingRuntimeConfig,
		private readonly now: () => string = () => new Date().toISOString()
	) {}

	private requireParent(actor: AuthenticatedUser) {
		try {
			requireParent(actor);
		} catch {
			throw new IndividualRequestError('PARENT_REQUIRED');
		}
		if (!actor.emailVerified) {
			throw new IndividualRequestError('PARENT_REQUIRED');
		}
	}

	async loadNewPage(actor: AuthenticatedUser) {
		this.requireParent(actor);
		return {
			children: (await this.repository.listOwnedChildren(actor.id)).map((child) => ({
				id: child.id,
				fullName: child.full_name,
				birthDate: child.birth_date,
			})),
			individualRateCents: this.pricing.individualPriceCentsPer45Min,
			fundedNachhilfeRateCents: FUNDED_NACHHILFE_RATE_CENTS_PER_45_MIN,
		};
	}

	async createDraft(input: { actor: AuthenticatedUser; payload: unknown; requestId: string }) {
		this.requireParent(input.actor);
		const parsed = requestCreateSchema.safeParse(input.payload);
		if (!parsed.success) throw new IndividualRequestError('INVALID_REQUEST');
		return this.repository.createDraft({
			userId: input.actor.id,
			payload: parsed.data,
			unitRateCents:
				parsed.data.requestKind === 'individual'
					? this.pricing.individualPriceCentsPer45Min
					: FUNDED_NACHHILFE_RATE_CENTS_PER_45_MIN,
			requestId: input.requestId,
			now: this.now(),
		});
	}

	async loadOwnerRequest(actor: AuthenticatedUser, requestId: string) {
		this.requireParent(actor);
		const request = await this.repository.loadOwnerRequest(actor.id, requestId);
		if (!request) throw new IndividualRequestError('REQUEST_NOT_FOUND');
		return request;
	}

	async save(input: { actor: AuthenticatedUser; payload: unknown; requestId: string }) {
		this.requireParent(input.actor);
		const parsed = requestSaveSchema.safeParse(input.payload);
		if (!parsed.success) throw new IndividualRequestError('INVALID_REQUEST');
		if (
			(parsed.data.requestKind === 'individual' && parsed.data.fundingKind !== 'self_pay') ||
			(parsed.data.requestKind === 'nachhilfe' &&
				!['jobcenter', 'socialamt'].includes(parsed.data.fundingKind))
		) {
			throw new IndividualRequestError('INVALID_FUNDING_KIND');
		}
		return this.repository.save({
			userId: input.actor.id,
			payload: parsed.data,
			requestId: input.requestId,
			now: this.now(),
		});
	}

	async submit(input: { actor: AuthenticatedUser; payload: unknown; requestId: string }) {
		this.requireParent(input.actor);
		const parsed = requestStateActionSchema.safeParse(input.payload);
		if (!parsed.success) throw new IndividualRequestError('INVALID_REQUEST_ACTION');
		return this.repository.submit({
			userId: input.actor.id,
			requestId: parsed.data.requestId,
			expectedVersion: parsed.data.expectedVersion,
			idempotencyKey: parsed.data.idempotencyKey,
			requestIdHeader: input.requestId,
			now: this.now(),
		});
	}

	async cancel(input: { actor: AuthenticatedUser; payload: unknown; requestId: string }) {
		this.requireParent(input.actor);
		const parsed = requestStateActionSchema.safeParse(input.payload);
		if (!parsed.success) throw new IndividualRequestError('INVALID_REQUEST_ACTION');
		return this.repository.cancel({
			userId: input.actor.id,
			requestId: parsed.data.requestId,
			expectedVersion: parsed.data.expectedVersion,
			idempotencyKey: parsed.data.idempotencyKey,
			requestIdHeader: input.requestId,
			now: this.now(),
		});
	}

	async contribute(userId: string, locale?: string) {
		const requests = await this.repository.listOwnerRequests(userId);
		return {
			requests: requests.map((request) => ({
				id: request.id,
				label: formatMessage(locale, 'cabinet.requests.label', {
					child: request.child_name,
					kind: translate(locale, request.request_kind === 'nachhilfe'
						? 'request.kind.nachhilfe' : 'request.kind.individual'),
				}),
				status: request.status,
				detail:
					request.request_kind === 'nachhilfe'
						? formatMessage(locale, request.valid_from && request.valid_until
							? 'cabinet.requests.fundingDetail' : 'cabinet.requests.fundingDetailUndated', {
							funding: request.funding_kind,
							from: request.valid_from ? formatCalendarDate(locale, request.valid_from) : '',
							until: request.valid_until ? formatCalendarDate(locale, request.valid_until) : '',
						})
						: formatMessage(locale, 'cabinet.requests.individualDetail', {
							amount: formatEuro(locale, request.unit_rate_cents),
						}),
				href: `/requests/${encodeURIComponent(request.id)}`,
				cancellable: !['cancelled', 'rejected'].includes(request.status),
			})),
		};
	}
}

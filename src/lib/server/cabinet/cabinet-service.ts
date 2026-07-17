import type { AuthenticatedUser } from '$lib/server/auth/session';
import { cleanDisplayText, normalizePersonName } from '$lib/server/auth/normalization';
import { CabinetPricingService } from '$lib/server/pricing/cabinet-pricing';
import { CabinetRepository } from './cabinet-repository';
import { childCorrectionSchema, childMutationSchema } from './contracts';

export interface CabinetExtensionItem {
	id: string;
	label: string;
	status: string;
	detail?: string;
	cancellable?: boolean;
}

export interface CabinetExtensionSlots {
	trials: CabinetExtensionItem[];
	requests: CabinetExtensionItem[];
	serviceEngagements: CabinetExtensionItem[];
	contractOffers: CabinetExtensionItem[];
	contractHistory: CabinetExtensionItem[];
	threads: CabinetExtensionItem[];
}

export interface CabinetReadModelContributor {
	contribute(userId: string): Promise<Partial<CabinetExtensionSlots>>;
}

export interface CabinetReadModel {
	profile: {
		email: string;
		firstName: string;
		lastName: string;
		familyDisplayId: string;
		familyAssignmentStatus: 'assigned' | 'review_required';
	};
	claimOffer: { maskedEmail: string; proofSent: boolean } | null;
	children: Array<{
		id: string;
		fullName: string;
		birthDate: string;
		origin: 'portal' | 'legacy';
		pendingCorrection: boolean;
	}>;
	activities: Array<{
		childName: string;
		groupName: string;
		teacherName: string | null;
		dayDisplay: string | null;
		durationMinutes: number | null;
		lessonKind: 'group' | 'dance_group' | 'nachhilfe' | 'individual' | 'needs_review';
		active: boolean;
		basePriceCents: number | null;
		priceConfirmed: boolean;
		paymentArrangement: 'existing_external_sepa' | 'manual_payment' | 'not_applicable';
		origin: 'legacy' | 'portal';
		contractAvailable: false;
	}>;
	pricing: ReturnType<CabinetPricingService['summarize']>;
	extensions: CabinetExtensionSlots;
}

export class CabinetAccessError extends Error {
	constructor() {
		super('Cabinet access denied.');
		this.name = 'CabinetAccessError';
	}
}

export class CabinetService {
	constructor(
		private readonly repository: CabinetRepository,
		private readonly pricing: CabinetPricingService,
		private readonly contributors: readonly CabinetReadModelContributor[] = [],
		private readonly now: () => string = () => new Date().toISOString()
	) {}

	async load(
		actor: AuthenticatedUser | NonNullable<App.Locals['user']>
	): Promise<CabinetReadModel> {
		const profile = await this.repository.loadProfile(actor.id);
		if (!profile) throw new CabinetAccessError();
		const asOf = this.now().slice(0, 10);
		const [children, activities, claimOffer, contributions] = await Promise.all([
			this.repository.listChildren(actor.id),
			this.repository.listActivities(actor.id, asOf),
			this.repository.loadClaimOffer(actor.id),
			Promise.all(this.contributors.map((contributor) => contributor.contribute(actor.id))),
		]);
		const extensions: CabinetExtensionSlots = {
			trials: [],
			requests: [],
			serviceEngagements: [],
			contractOffers: [],
			contractHistory: [],
			threads: [],
		};
		for (const contribution of contributions) {
			for (const key of Object.keys(extensions) as Array<keyof CabinetExtensionSlots>) {
				if (contribution[key]) extensions[key].push(...contribution[key]);
			}
		}

		return {
			profile: {
				email: profile.email,
				firstName: profile.first_name,
				lastName: profile.last_name,
				familyDisplayId: profile.family_display_id,
				familyAssignmentStatus: profile.family_assignment_status,
			},
			claimOffer: claimOffer
				? {
						maskedEmail: claimOffer.masked_email_snapshot,
						proofSent: claimOffer.status === 'proof_sent',
					}
				: null,
			children: children.map((child) => ({
				id: child.id,
				fullName: child.full_name,
				birthDate: child.birth_date,
				origin: child.origin,
				pendingCorrection: child.pending_correction === 1,
			})),
			activities: activities.map((activity) => ({
				childName: activity.child_name,
				groupName: activity.group_name,
				teacherName: activity.teacher_name,
				dayDisplay: activity.day_display,
				durationMinutes: activity.duration_minutes,
				lessonKind: activity.lesson_kind,
				active: activity.is_active === 1,
				basePriceCents: activity.base_price_cents,
				priceConfirmed: activity.price_confirmed === 1,
				paymentArrangement: activity.payment_arrangement,
				origin: activity.origin,
				contractAvailable: false,
			})),
			pricing: this.pricing.summarize(
				activities.map((activity) => ({
					lessonKind: activity.lesson_kind,
					isActive: activity.is_active === 1,
					basePriceCents: activity.base_price_cents,
					priceConfirmed: activity.price_confirmed === 1,
					paymentArrangement: activity.payment_arrangement,
				}))
			),
			extensions,
		};
	}

	async createChild(input: {
		actor: AuthenticatedUser | NonNullable<App.Locals['user']>;
		payload: unknown;
		requestId: string;
	}): Promise<'created' | 'duplicate' | 'rejected'> {
		const parsed = childMutationSchema.safeParse(input.payload);
		if (!parsed.success || parsed.data.childId) return 'rejected';
		const fullName = cleanDisplayText(parsed.data.fullName);
		const duplicate = await this.repository.hasOwnedDuplicate({
			userId: input.actor.id,
			fullNameNormalized: normalizePersonName(fullName),
			birthDate: parsed.data.birthDate,
		});
		if (duplicate && !parsed.data.confirmDuplicate) return 'duplicate';
		const id = crypto.randomUUID();
		return (await this.repository.createPortalChild({
			id,
			userId: input.actor.id,
			fullName,
			birthDate: parsed.data.birthDate,
			requestId: input.requestId,
			auditId: crypto.randomUUID(),
			now: this.now(),
		}))
			? 'created'
			: 'rejected';
	}

	async updateChild(input: {
		actor: AuthenticatedUser | NonNullable<App.Locals['user']>;
		payload: unknown;
		requestId: string;
	}): Promise<'updated' | 'duplicate' | 'rejected'> {
		const parsed = childMutationSchema.safeParse(input.payload);
		if (!parsed.success || !parsed.data.childId) return 'rejected';
		const fullName = cleanDisplayText(parsed.data.fullName);
		const duplicate = await this.repository.hasOwnedDuplicate({
			userId: input.actor.id,
			fullNameNormalized: normalizePersonName(fullName),
			birthDate: parsed.data.birthDate,
			excludeChildId: parsed.data.childId,
		});
		if (duplicate && !parsed.data.confirmDuplicate) return 'duplicate';
		return (await this.repository.updatePortalChild({
			childId: parsed.data.childId,
			userId: input.actor.id,
			fullName,
			birthDate: parsed.data.birthDate,
			requestId: input.requestId,
			auditId: crypto.randomUUID(),
			now: this.now(),
		}))
			? 'updated'
			: 'rejected';
	}

	async requestCorrection(input: {
		actor: AuthenticatedUser | NonNullable<App.Locals['user']>;
		payload: unknown;
		requestId: string;
	}): Promise<boolean> {
		const parsed = childCorrectionSchema.safeParse(input.payload);
		if (!parsed.success) return false;
		return this.repository.requestLegacyChildCorrection({
			id: crypto.randomUUID(),
			childId: parsed.data.childId,
			userId: input.actor.id,
			fullName: cleanDisplayText(parsed.data.fullName),
			birthDate: parsed.data.birthDate,
			requestId: input.requestId,
			auditId: crypto.randomUUID(),
			reviewId: crypto.randomUUID(),
			now: this.now(),
		});
	}
}

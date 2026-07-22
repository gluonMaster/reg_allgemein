import type { AuthenticatedUser } from '$lib/server/auth/session';
import { buildPortalUrl, type RuntimeConfig } from '$lib/server/config/runtime';
import { canonicalJson, hashCanonical } from '$lib/server/import/canonical';
import {
	repricingLookupChildrenCount,
	type RepricingProposal,
} from '$lib/server/pricing/decisions';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import { PricingService } from '$lib/server/pricing/pricing-service';
import type { AdminActor } from '$lib/server/security/authorization';
import { scopedHash } from '$lib/server/security/digest';
import {
	berlinCalendarDate,
	calendarDaysAfter,
	firstDayOfNextCalendarMonth,
	isCalendarDate,
} from '$lib/server/time/berlin';
import {
	PRICE_REVIEW_ACCEPTANCE_TEXT,
	PRICE_REVIEW_ACCEPTANCE_TEXT_VERSION,
	adminComparisonSchema,
	batchApprovalSchema,
	batchDispatchSchema,
	finalConfirmationSchema,
	manualMaintenanceSchema,
	parentPriceResponseSchema,
	type CalculatedPriceReviewItem,
	type StoredPriceReviewItem,
	type StoredPriceReviewTrigger,
} from './contracts';
import { PriceReviewRepository } from './price-review-repository';

export class PriceReviewServiceError extends Error {
	constructor(readonly code: string, options?: { cause?: unknown }) {
		super(code, options);
		this.name = 'PriceReviewServiceError';
	}
}

function assertInstant(value: string): void {
	if (Number.isNaN(Date.parse(value)) || !value.endsWith('Z')) {
		throw new PriceReviewServiceError('INVALID_UTC_INSTANT');
	}
}

function isoAfterDays(value: string, days: number): string {
	return new Date(Date.parse(value) + days * 86_400_000).toISOString();
}

function proposalDirection(proposal: RepricingProposal): 'increase' | 'decrease' | 'unchanged' {
	if (proposal.oldFinalPriceCents === null || proposal.newFinalPriceCents === null) {
		return 'unchanged';
	}
	if (proposal.newFinalPriceCents > proposal.oldFinalPriceCents) return 'increase';
	if (proposal.newFinalPriceCents < proposal.oldFinalPriceCents) return 'decrease';
	return 'unchanged';
}

function sameNullable(left: unknown, right: unknown): boolean {
	return left === right;
}

export class PriceReviewService {
	constructor(
		private readonly repository: PriceReviewRepository,
		private readonly pricing: PricingService,
		private readonly occupancy: OccupancyRepository,
		private readonly config: Pick<RuntimeConfig, 'portalPublicOrigin'>
	) {}

	async createAdminComparison(input: {
		admin: AdminActor;
		payload: unknown;
		requestId: string;
		now?: string;
	}): Promise<{ triggerId: string; batchId: string }> {
		const now = input.now ?? new Date().toISOString();
		assertInstant(now);
		const parsed = adminComparisonSchema.safeParse(input.payload);
		if (!parsed.success) throw new PriceReviewServiceError('INVALID_ADMIN_COMPARISON');
		const priceVersionId = await this.repository.activePriceVersionForCourse(
			parsed.data.courseGroupId,
			parsed.data.effectiveOn
		);
		if (!priceVersionId) throw new PriceReviewServiceError('ACTIVE_PRICE_VERSION_REQUIRED');
		const activeCount = await this.occupancy.activeChildrenCount(
			parsed.data.courseGroupId,
			parsed.data.effectiveOn
		);
		const lookup = repricingLookupChildrenCount(activeCount);
		const trigger = await this.repository.createTrigger({
			courseGroupId: parsed.data.courseGroupId,
			sourceKind: 'admin_price_comparison',
			sourceRef: priceVersionId,
			reasonCode: 'admin_price_comparison',
			effectiveOn: parsed.data.effectiveOn,
			oldActiveCount: activeCount,
			newActiveCount: activeCount,
			oldLookupChildrenCount: lookup,
			newLookupChildrenCount: lookup,
			requestedPriceVersionId: priceVersionId,
			dedupeKey: `admin-price-comparison:${parsed.data.courseGroupId}:${priceVersionId}:${parsed.data.effectiveOn}:v1`,
			createdByUserId: input.admin.id,
			now,
		});
		await this.repository.recordAdminComparison({
			admin: input.admin,
			triggerId: trigger.id,
			reason: parsed.data.reason,
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			now,
		});
		return { triggerId: trigger.id, batchId: await this.processTrigger(trigger.id, now) };
	}

	async processTrigger(triggerId: string, now = new Date().toISOString()): Promise<string> {
		assertInstant(now);
		const existing = await this.repository.batchIdForTrigger(triggerId);
		if (existing) return existing;
		const trigger = await this.repository.getTrigger(triggerId);
		if (!trigger) throw new PriceReviewServiceError('PRICE_REVIEW_TRIGGER_NOT_FOUND');
		if (trigger.status !== 'pending' && trigger.status !== 'processing') {
			const replay = await this.repository.batchIdForTrigger(trigger.id);
			if (replay) return replay;
			throw new PriceReviewServiceError('PRICE_REVIEW_TRIGGER_NOT_PROCESSABLE');
		}
		const calculation = await this.pricing.calculateRepricing({
			courseGroupId: trigger.courseGroupId,
			effectiveOn: trigger.effectiveOn,
			oldActiveChildrenCount: trigger.oldActiveCount,
			reason:
				trigger.reasonCode === 'admin_price_comparison'
					? 'admin_price_comparison'
					: 'occupancy_changed',
		});
		const relevant = calculation.proposals.filter(
			(proposal) => proposal.itemRequired || proposal.manualContactRequired
		);
		const priceVersionId =
			relevant.find((proposal) => proposal.newPriceVersionId)?.newPriceVersionId ??
			trigger.requestedPriceVersionId;
		const calculationSnapshot = {
			schemaVersion: 1,
			triggerDedupeKey: trigger.dedupeKey,
			courseGroupId: trigger.courseGroupId,
			reasonCode: trigger.reasonCode,
			effectiveOn: trigger.effectiveOn,
			oldActiveCount: trigger.oldActiveCount,
			activeCount: calculation.activeChildrenCount,
			lookupChildrenCount: calculation.lookupChildrenCount,
			priceVersionId,
			decisionCode: calculation.decisionCode,
			targets: relevant.map((proposal) => ({
				targetKind: proposal.targetKind,
				targetId: proposal.targetId,
				decisionCode: proposal.decisionCode,
				oldFinalPriceCents: proposal.oldFinalPriceCents,
				newFinalPriceCents: proposal.newFinalPriceCents,
				newPriceMode: proposal.newPriceMode,
			})),
		};
		const calculationSnapshotJson = canonicalJson(calculationSnapshot);
		const calculationSnapshotHash = await hashCanonical(calculationSnapshot);
		const batchDedupeKey = await hashCanonical({
			schemaVersion: 1,
			courseGroupId: trigger.courseGroupId,
			reasonCode: trigger.reasonCode,
			effectiveOn: trigger.effectiveOn,
			activeCount: calculation.activeChildrenCount,
			lookupChildrenCount: calculation.lookupChildrenCount,
			priceVersionId,
			calculationSnapshotHash,
		});
		const batchId = `price-batch:${batchDedupeKey.slice(0, 32)}`;
		const items: CalculatedPriceReviewItem[] = [];
		for (const proposal of relevant) {
			const targetState = {
				targetKind: proposal.targetKind,
				targetId: proposal.targetId,
				userId: proposal.userId,
				oldBasePriceCents: proposal.oldBasePriceCents,
				oldFinalPriceCents: proposal.oldFinalPriceCents,
				oldPriceSource: proposal.oldPriceSource,
				oldPriceMode: proposal.oldPriceMode,
				oldPriceVersionId: proposal.oldPriceVersionId,
				oldPriceRuleId: proposal.oldPriceRuleId,
			};
			const targetStateHash = await hashCanonical(targetState);
			const terms = {
				schemaVersion: 1,
				currency: 'EUR',
				amountSemantics: 'monthly_base_price',
				targetKind: proposal.targetKind,
				direction: proposalDirection(proposal),
				oldBasePriceCents: proposal.oldBasePriceCents,
				oldFinalPriceCents: proposal.oldFinalPriceCents,
				newBasePriceCents: proposal.newBasePriceCents,
				newFinalPriceCents: proposal.newFinalPriceCents,
				oldPriceMode: proposal.oldPriceMode,
				newPriceMode: proposal.newPriceMode,
				priceVersionId: proposal.newPriceVersionId,
				priceRuleId: proposal.newPriceRuleId,
				reviewEffectiveOn: trigger.effectiveOn,
				responseCalendarDays: 14,
				effectiveDateRule: 'first_day_next_calendar_month_after_admin_confirmation',
				acceptanceTextVersion: PRICE_REVIEW_ACCEPTANCE_TEXT_VERSION,
				basePriceNotInvoice: true,
			};
			const termsSnapshotJson = canonicalJson(terms);
			const itemHash = await hashCanonical({ targetStateHash, terms });
			const itemDedupeKey = await hashCanonical({
				batchDedupeKey,
				targetKind: proposal.targetKind,
				targetId: proposal.targetId,
				itemHash,
			});
			items.push({
				id: `price-item:${itemDedupeKey.slice(0, 32)}`,
				publicReference: crypto.randomUUID(),
				targetKind: proposal.targetKind,
				targetId: proposal.targetId,
				userId: proposal.userId,
				oldBasePriceCents: proposal.oldBasePriceCents,
				oldPriceCents: proposal.oldFinalPriceCents,
				newBasePriceCents: proposal.newBasePriceCents,
				newFinalPriceCents: proposal.newFinalPriceCents,
				oldPriceSource: proposal.oldPriceSource,
				newPriceSource: proposal.newPriceSource,
				oldPriceMode: proposal.oldPriceMode,
				newPriceMode: proposal.newPriceMode,
				oldPriceVersionId: proposal.oldPriceVersionId,
				newPriceVersionId: proposal.newPriceVersionId,
				oldPriceRuleId: proposal.oldPriceRuleId,
				newPriceRuleId: proposal.newPriceRuleId,
				targetStateHash,
				expectedActiveCount: calculation.activeChildrenCount,
				expectedLookupChildrenCount: calculation.lookupChildrenCount,
				effectiveOn: trigger.effectiveOn,
				decisionCode: proposal.decisionCode,
				decisionJson: canonicalJson({ schemaVersion: 1,
					decisionCode: proposal.decisionCode,
					manualContactRequired: proposal.manualContactRequired }),
				termsSnapshotJson,
				itemHash,
				dedupeKey: itemDedupeKey,
				manualContactRequired: proposal.manualContactRequired,
			});
		}
		return this.repository.persistCalculation({
			trigger,
			batchId,
			batchDedupeKey,
			priceVersionId,
			activeCount: calculation.activeChildrenCount,
			lookupChildrenCount: calculation.lookupChildrenCount,
			calculationSnapshotJson,
			calculationSnapshotHash,
			supersedeOpenItems: calculation.decisionCode !== 'LOOKUP_COUNT_UNCHANGED',
			items,
			now,
		});
	}

	async approveBatch(input: {
		admin: AdminActor;
		payload: unknown;
		requestId: string;
		now?: string;
	}) {
		const now = input.now ?? new Date().toISOString();
		assertInstant(now);
		const parsed = batchApprovalSchema.safeParse(input.payload);
		if (!parsed.success) throw new PriceReviewServiceError('INVALID_BATCH_APPROVAL');
		return this.repository.approveBatch({ admin: input.admin, batchId: parsed.data.batchId,
			reason: parsed.data.reason, idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId, now });
	}

	async dispatchBatch(input: {
		admin: AdminActor;
		payload: unknown;
		requestId: string;
		now?: string;
	}) {
		const now = input.now ?? new Date().toISOString();
		assertInstant(now);
		const parsed = batchDispatchSchema.safeParse(input.payload);
		if (!parsed.success) throw new PriceReviewServiceError('INVALID_BATCH_DISPATCH');
		const candidates = (await this.repository.listBatchItems(parsed.data.batchId)).filter(
			(item) => item.status === 'notification_approved'
		);
		const valid: Array<{ item: StoredPriceReviewItem; cabinetUrl: string; responseDeadline: string }> = [];
		for (const item of candidates) {
			const state = await this.revalidateItem(item, item.effectiveOn);
			if (!state.current) {
				await this.repository.supersedeItem(item, state.reason, now);
				continue;
			}
			if (!item.userId) {
				await this.repository.supersedeItem(item, 'OWNER_REQUIRED_FOR_DELIVERY', now);
				continue;
			}
			valid.push({
				item,
				cabinetUrl: buildPortalUrl(this.config, `/price-reviews/${item.publicReference}`).href,
				responseDeadline: calendarDaysAfter(berlinCalendarDate(now), 14),
			});
		}
		return this.repository.dispatchBatch({ admin: input.admin, batchId: parsed.data.batchId,
			items: valid, idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId, now });
	}

	async respond(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		requestId: string;
		requestSubject: string;
		userAgent: string;
		now?: string;
	}) {
		const now = input.now ?? new Date().toISOString();
		assertInstant(now);
		const parsed = parentPriceResponseSchema.safeParse(input.payload);
		if (!parsed.success) throw new PriceReviewServiceError('INVALID_PARENT_RESPONSE');
		const requestHash = await hashCanonical(parsed.data);
		const replay = await this.repository.parentResponseReplay(
			input.actor.id,
			parsed.data.idempotencyKey,
			requestHash
		);
		if (replay) return replay;
		let item = await this.repository.getParentItem(parsed.data.publicReference, input.actor.id);
		if (!item) throw new PriceReviewServiceError('PRICE_REVIEW_ITEM_NOT_FOUND');
		const today = berlinCalendarDate(now);
		let evidenceStatus: 'applied' | 'stale' | 'late' = 'applied';
		if (item.status === 'response_overdue' ||
			(item.responseDeadline !== null && item.responseDeadline < today)) {
			evidenceStatus = 'late';
		} else if (item.status === 'superseded' || parsed.data.itemHash !== item.itemHash) {
			evidenceStatus = 'stale';
		} else if (item.status !== 'sent') {
			throw new PriceReviewServiceError('PRICE_REVIEW_RESPONSE_NOT_ALLOWED');
		} else {
			const current = await this.revalidateItem(item, item.effectiveOn);
			if (!current.current) {
				await this.repository.supersedeItem(item, current.reason, now);
				item = (await this.repository.getItemById(item.id)) ?? item;
				evidenceStatus = 'stale';
			}
		}
		return this.repository.recordParentResponse({
			actor: input.actor,
			item,
			decision: parsed.data.decision,
			providedItemHash: parsed.data.itemHash,
			acceptanceText: PRICE_REVIEW_ACCEPTANCE_TEXT,
			idempotencyKey: parsed.data.idempotencyKey,
			requestHash,
			evidenceStatus,
			userAgent: input.userAgent.slice(0, 500),
			ipRetentionValue: await scopedHash('price-review-response-ip', input.requestSubject),
			ipExpiresAt: isoAfterDays(now, 30),
			requestId: input.requestId,
			now,
		});
	}

	async finalConfirm(input: {
		admin: AdminActor;
		payload: unknown;
		requestId: string;
		now?: string;
	}) {
		const now = input.now ?? new Date().toISOString();
		assertInstant(now);
		const parsed = finalConfirmationSchema.safeParse(input.payload);
		if (!parsed.success) throw new PriceReviewServiceError('INVALID_FINAL_CONFIRMATION');
		const requestHash = await hashCanonical({
			itemId: parsed.data.itemId,
			reason: parsed.data.reason,
		});
		if (await this.repository.adminActionReplay(
			input.admin.id,
			parsed.data.idempotencyKey,
			requestHash
		)) return { replayed: true };
		const item = await this.repository.getItemById(parsed.data.itemId);
		if (!item || item.status !== 'accepted_by_parent') {
			throw new PriceReviewServiceError('PRICE_REVIEW_ITEM_NOT_ACCEPTED');
		}
		const scheduledFor = firstDayOfNextCalendarMonth(berlinCalendarDate(now));
		const current = await this.revalidateItem(item, scheduledFor);
		if (!current.current) {
			await this.repository.supersedeItem(item, current.reason, now);
			throw new PriceReviewServiceError('PRICE_REVIEW_ITEM_STALE');
		}
		return this.repository.scheduleAcceptedItem({ admin: input.admin, item, scheduledFor,
			reason: parsed.data.reason, idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId, now });
	}

	async revalidateItem(item: StoredPriceReviewItem, asOf: string) {
		if (!isCalendarDate(asOf)) throw new PriceReviewServiceError('INVALID_EFFECTIVE_DATE');
		const current = await this.pricing.calculateRepricing({
			courseGroupId: item.batchCourseGroupId,
			effectiveOn: asOf,
			oldActiveChildrenCount: item.expectedActiveCount,
			reason: 'admin_price_comparison',
		});
		const proposal = current.proposals.find(
			(candidate) => candidate.targetKind === item.targetKind && candidate.targetId === item.targetId
		);
		if (!proposal) return { current: false, reason: 'TARGET_NO_LONGER_QUALIFIES' };
		if (current.activeChildrenCount !== item.expectedActiveCount ||
			current.lookupChildrenCount !== item.expectedLookupChildrenCount) {
			return { current: false, reason: 'OCCUPANCY_CHANGED' };
		}
		const matches =
			sameNullable(proposal.userId, item.userId) &&
			sameNullable(proposal.oldBasePriceCents, item.oldBasePriceCents) &&
			sameNullable(proposal.oldFinalPriceCents, item.oldPriceCents) &&
			sameNullable(proposal.oldPriceSource, item.oldPriceSource) &&
			sameNullable(proposal.oldPriceMode, item.oldPriceMode) &&
			sameNullable(proposal.oldPriceVersionId, item.oldPriceVersionId) &&
			sameNullable(proposal.oldPriceRuleId, item.oldPriceRuleId) &&
			sameNullable(proposal.newBasePriceCents, item.newBasePriceCents) &&
			sameNullable(proposal.newFinalPriceCents, item.newFinalPriceCents) &&
			sameNullable(proposal.newPriceSource, item.newPriceSource) &&
			sameNullable(proposal.newPriceMode, item.newPriceMode) &&
			sameNullable(proposal.newPriceVersionId, item.newPriceVersionId) &&
			sameNullable(proposal.newPriceRuleId, item.newPriceRuleId) &&
			proposal.decisionCode === item.decisionCode &&
			proposal.itemRequired;
		return matches
			? { current: true, reason: 'CURRENT' }
			: { current: false, reason: 'PRICE_STATE_CHANGED' };
	}

	async reconcileMissedTriggers(now = new Date().toISOString(), limit = 100): Promise<number> {
		assertInstant(now);
		const today = berlinCalendarDate(now);
		const lastScannedAt = await this.repository.reconcilerLastScannedAt();
		// The migration watermark avoids replaying all historical activations on
		// first deployment; future boundaries are always eligible for repair.
		const boundaries = await this.repository.listUnreconciledBoundaries(
			lastScannedAt,
			today,
			limit
		);
		let created = 0;
		for (const boundary of boundaries) {
			const currentCount = await this.occupancy.activeChildrenCount(
				boundary.courseGroupId,
				boundary.effectiveOn
			);
			const oldCount = boundary.boundaryKind === 'activation'
				? Math.max(0, currentCount - 1)
				: currentCount + 1;
			const newCount = boundary.boundaryKind === 'activation' ? currentCount : currentCount;
			const priceVersionId = await this.repository.activePriceVersionForCourse(
				boundary.courseGroupId,
				boundary.effectiveOn
			);
			await this.repository.createTrigger({
				courseGroupId: boundary.courseGroupId,
				sourceKind: 'reconciler',
				sourceRef: boundary.enrollmentId,
				reasonCode: boundary.boundaryKind,
				effectiveOn: boundary.effectiveOn,
				oldActiveCount: oldCount,
				newActiveCount: newCount,
				oldLookupChildrenCount: repricingLookupChildrenCount(oldCount),
				newLookupChildrenCount: repricingLookupChildrenCount(newCount),
				requestedPriceVersionId: priceVersionId,
				dedupeKey: `enrollment:${boundary.enrollmentId}:${boundary.boundaryKind === 'activation'
					? 'active_from' : 'active_until'}:${boundary.effectiveOn}:v1`,
				now,
			});
			created += 1;
		}
		if (boundaries.length < limit) await this.repository.advanceReconcilerWatermark(now);
		return created;
	}

	async runScheduledMaintenance(now = new Date().toISOString(), limit = 100): Promise<{
		reconciled: number;
		processedTriggers: number;
		overdue: number;
		applied: number;
		superseded: number;
	}> {
		assertInstant(now);
		if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
			throw new PriceReviewServiceError('PRICE_REVIEW_BATCH_LIMIT_INVALID');
		}
		const reconciled = await this.reconcileMissedTriggers(now, limit);
		let processedTriggers = 0;
		for (const trigger of await this.repository.listPendingTriggers(limit)) {
			await this.processTrigger(trigger.id, now);
			processedTriggers += 1;
		}
		const today = berlinCalendarDate(now);
		let overdue = 0;
		for (const item of await this.repository.listDueResponses(today, limit)) {
			if (await this.repository.markResponseOverdue(item, today, now)) overdue += 1;
		}
		let applied = 0;
		let superseded = 0;
		for (const item of await this.repository.listDueScheduled(today, limit)) {
			const current = await this.revalidateItem(item, item.scheduledFor!);
			if (!current.current) {
				if (await this.repository.supersedeItem(item, current.reason, now)) superseded += 1;
				continue;
			}
			const evidenceHash = await hashCanonical({
				schemaVersion: 1,
				itemId: item.id,
				itemHash: item.itemHash,
				scheduledFor: item.scheduledFor,
				acceptanceTextVersion: item.acceptanceTextVersion,
			});
			const result = await this.repository.applyScheduledItem({ item, evidenceHash, now });
			if (result.applied && !result.replayed) applied += 1;
		}
		return { reconciled, processedTriggers, overdue, applied, superseded };
	}

	async runManualMaintenance(input: {
		admin: AdminActor;
		payload: unknown;
		requestId: string;
		now?: string;
	}) {
		const now = input.now ?? new Date().toISOString();
		assertInstant(now);
		const parsed = manualMaintenanceSchema.safeParse(input.payload);
		if (!parsed.success) throw new PriceReviewServiceError('INVALID_MANUAL_MAINTENANCE');
		const recorded = await this.repository.recordManualSchedulerRun({
			admin: input.admin,
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			now,
		});
		if (recorded.replayed) return { replayed: true };
		return { replayed: false, result: await this.runScheduledMaintenance(now) };
	}

	async processAllPending(now = new Date().toISOString()): Promise<number> {
		let processed = 0;
		for (const trigger of await this.repository.listPendingTriggers()) {
			await this.processTrigger(trigger.id, now);
			processed += 1;
		}
		return processed;
	}

	async createOccupancyTrigger(input: {
		courseGroupId: string;
		sourceKind: StoredPriceReviewTrigger['sourceKind'];
		sourceRef: string;
		reasonCode: string;
		effectiveOn: string;
		oldActiveCount: number;
		newActiveCount: number;
		dedupeKey: string;
		now: string;
	}) {
		return this.repository.createTrigger({
			...input,
			oldLookupChildrenCount: repricingLookupChildrenCount(input.oldActiveCount),
			newLookupChildrenCount: repricingLookupChildrenCount(input.newActiveCount),
			requestedPriceVersionId: await this.repository.activePriceVersionForCourse(
				input.courseGroupId,
				input.effectiveOn
			),
		});
	}
}

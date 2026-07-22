import { DatabaseBoundary } from '$lib/server/db/database';
import type { PricingDecision, PriceRuleCandidate, RepricingTarget } from './decisions';
import {
	MISSING_PRICE_KEY,
	buildScalarSubjectDurationVector,
	type SubjectDurationComponent,
} from './normalization';

export interface CoursePricingContextSnapshot {
	courseGroupId: string;
	academicPeriodId: string;
	lessonKind: 'group' | 'dance_group' | 'nachhilfe' | 'individual' | 'needs_review';
	catalogStatus: string;
	mappingStatus: 'confirmed' | 'unknown' | 'ambiguous';
	contractKind: 'group_yearly' | 'group_monthly' | null;
	priceVersionId: string | null;
	scheduleVersionId: string | null;
	plusBTextVersionId: string | null;
	pricingProfileVersion: number | null;
	normalizedPriceKey: string | null;
	durationSource: 'plusbtext' | 'schedule' | 'admin_confirmed';
	durationStatus: 'verified' | 'missing' | 'invalid' | 'ambiguous' | 'unresolved';
	durationMinutes: number | null;
	subjectDurationVector: SubjectDurationComponent[] | null;
	rules: PriceRuleCandidate[];
}

export interface StoredPriceQuote {
	id: string;
	courseGroupId: string;
	plannedStartOn: string;
	activeChildrenCountAsOf: number;
	lookupChildrenCount: number;
	decision: PricingDecision;
	status:
		| 'quoted'
		| 'needs_admin_review'
		| 'needs_admin_confirmation'
		| 'confirmed'
		| 'stale'
		| 'superseded';
	createdAt: string;
	expiresAt: string;
}

interface ContextRow {
	id: string;
	academic_period_id: string;
	lesson_kind: CoursePricingContextSnapshot['lessonKind'];
	catalog_status: string;
	contract_kind: 'group_yearly' | 'group_monthly' | null;
	normalized_price_key: string | null;
	subjects_json: string | null;
	duration_source: CoursePricingContextSnapshot['durationSource'] | null;
	admin_duration_minutes: number | null;
	profile_status: 'confirmed' | 'needs_review' | null;
	profile_version: number | null;
	price_version_id: string | null;
	schedule_version_id: string | null;
	plusbtext_version_id: string | null;
}

function parseSubjects(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
			? parsed
			: [];
	} catch {
		return [];
	}
}

function parseVector(value: string): SubjectDurationComponent[] | null {
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!Array.isArray(parsed)) return null;
		const vector = parsed.map((component) => {
			if (!component || typeof component !== 'object') return null;
			const subject = Reflect.get(component, 'subject');
			const durationMinutes = Reflect.get(component, 'durationMinutes');
			if (
				(subject !== null && typeof subject !== 'string') ||
				!Number.isSafeInteger(durationMinutes) ||
				(durationMinutes as number) <= 0
			) {
				return null;
			}
			return {
				subject: subject as string | null,
				durationMinutes: durationMinutes as number,
			};
		});
		return vector.every((component) => component !== null)
			? (vector as SubjectDurationComponent[])
			: null;
	} catch {
		return null;
	}
}

export class PricingRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async loadCourseContext(input: {
		courseGroupId: string;
		asOf: string;
		lookupChildrenCount: number;
	}): Promise<CoursePricingContextSnapshot | null> {
		const row = await this.db.first<ContextRow>({
			sql: `SELECT course.id, course.academic_period_id, course.lesson_kind,
				course.catalog_status, profile.contract_kind, profile.normalized_price_key,
				profile.subjects_json, profile.duration_source,
				profile.admin_duration_minutes, profile.status AS profile_status,
				profile.version AS profile_version,
				price.id AS price_version_id, schedule.id AS schedule_version_id,
				plusb.id AS plusbtext_version_id
				FROM course_groups AS course
				LEFT JOIN course_pricing_profiles AS profile ON profile.course_group_id = course.id
				LEFT JOIN price_versions AS price
					ON price.academic_period_id = course.academic_period_id
					AND price.is_active = 1 AND price.valid_from <= ?
				LEFT JOIN schedule_versions AS schedule
					ON schedule.academic_period_id = course.academic_period_id
					AND schedule.is_published = 1
				LEFT JOIN plusbtext_versions AS plusb
					ON plusb.academic_period_id = course.academic_period_id
					AND plusb.is_published = 1
				WHERE course.id = ?`,
			params: [input.asOf, input.courseGroupId],
		});
		if (!row) return null;

		let mappingStatus: CoursePricingContextSnapshot['mappingStatus'] =
			row.profile_status === 'confirmed' ? 'confirmed' : 'unknown';
		let durationStatus: CoursePricingContextSnapshot['durationStatus'] = 'unresolved';
		let durationMinutes: number | null = null;
		const durationSource = row.duration_source ?? 'schedule';
		if (row.profile_status === 'confirmed' && row.duration_source === 'admin_confirmed') {
			durationStatus = row.admin_duration_minutes ? 'verified' : 'unresolved';
			durationMinutes = row.admin_duration_minutes;
		} else if (row.profile_status === 'confirmed' && row.duration_source === 'schedule') {
			const durations = await this.db.all<{ duration_minutes: number }>({
				sql: `SELECT DISTINCT session.duration_minutes
					FROM course_sessions AS session
					WHERE session.course_group_id = ? AND session.schedule_version_id = ?
						AND session.is_current = 1`,
				params: [input.courseGroupId, row.schedule_version_id],
			});
			if (durations.results.length === 1) {
				durationStatus = 'verified';
				durationMinutes = durations.results[0].duration_minutes;
			} else if (durations.results.length > 1) {
				durationStatus = 'ambiguous';
			} else {
				durationStatus = 'unresolved';
			}
		} else if (row.profile_status === 'confirmed' && row.duration_source === 'plusbtext') {
			const mappings = await this.db.all<{ source_value_normalized: string }>({
				sql: `SELECT source_value_normalized FROM course_source_mappings
					WHERE course_group_id = ? AND source_kind = 'plusbtext' AND status = 'confirmed'`,
				params: [input.courseGroupId],
			});
			if (mappings.results.length !== 1) {
				mappingStatus = mappings.results.length > 1 ? 'ambiguous' : 'unknown';
				durationStatus = mappings.results.length > 1 ? 'ambiguous' : 'unresolved';
			} else if (!row.plusbtext_version_id) {
				mappingStatus = 'unknown';
				durationStatus = 'unresolved';
			} else {
				const targets = await this.db.all<{
					duration_minutes: number | null;
					duration_status: 'verified' | 'missing' | 'invalid';
				}>({
					sql: `SELECT duration_minutes, duration_status FROM plusbtext_targets
						WHERE plusbtext_version_id = ? AND group_name_normalized = ? AND is_valid = 1`,
					params: [row.plusbtext_version_id, mappings.results[0].source_value_normalized],
				});
				if (targets.results.length === 1) {
					durationStatus = targets.results[0].duration_status;
					durationMinutes = targets.results[0].duration_minutes;
				} else if (targets.results.length > 1) {
					mappingStatus = 'ambiguous';
					durationStatus = 'ambiguous';
				} else {
					mappingStatus = 'unknown';
					durationStatus = 'unresolved';
				}
			}
		}

		const subjects = parseSubjects(row.subjects_json);
		const vector =
			durationStatus === 'verified' && durationMinutes
				? buildScalarSubjectDurationVector(subjects, durationMinutes)
				: null;
		const normalizedPriceKey =
			row.normalized_price_key && row.normalized_price_key !== MISSING_PRICE_KEY
				? row.normalized_price_key
				: null;
		const rules =
			row.price_version_id && normalizedPriceKey
				? await this.loadRuleCandidates({
						priceVersionId: row.price_version_id,
						normalizedPriceKey,
						lookupChildrenCount: input.lookupChildrenCount,
					})
				: [];
		return {
			courseGroupId: row.id,
			academicPeriodId: row.academic_period_id,
			lessonKind: row.lesson_kind,
			catalogStatus: row.catalog_status,
			mappingStatus,
			contractKind: row.contract_kind,
			priceVersionId: row.price_version_id,
			scheduleVersionId: row.schedule_version_id,
			plusBTextVersionId: row.plusbtext_version_id,
			pricingProfileVersion: row.profile_version,
			normalizedPriceKey,
			durationSource,
			durationStatus,
			durationMinutes,
			subjectDurationVector: vector,
			rules,
		};
	}

	private async loadRuleCandidates(input: {
		priceVersionId: string;
		normalizedPriceKey: string;
		lookupChildrenCount: number;
	}): Promise<PriceRuleCandidate[]> {
		const rows = await this.db.all<{
			id: string;
			price_version_id: string;
			normalized_key: string;
			subject_duration_vector_json: string;
			children_count: number;
			yearly_price_cents: number;
			monthly_price_cents: number;
		}>({
			sql: `SELECT id, price_version_id, normalized_key, subject_duration_vector_json,
				children_count, yearly_price_cents, monthly_price_cents
				FROM price_rules
				WHERE price_version_id = ? AND normalized_key = ? AND children_count = ?
					AND is_valid = 1`,
			params: [input.priceVersionId, input.normalizedPriceKey, input.lookupChildrenCount],
		});
		return rows.results.flatMap((row) => {
			const vector = parseVector(row.subject_duration_vector_json);
			return vector
				? [
						{
							id: row.id,
							priceVersionId: row.price_version_id,
							normalizedKey: row.normalized_key,
							subjectDurationVector: vector,
							childrenCount: row.children_count,
							yearlyPriceCents: row.yearly_price_cents,
							monthlyPriceCents: row.monthly_price_cents,
						},
					]
				: [];
		});
	}

	async insertQuote(input: {
		id: string;
		context: CoursePricingContextSnapshot;
		plannedStartOn: string;
		activeChildrenCount: number;
		lookupChildrenCount: number;
		decision: PricingDecision;
		createdAt: string;
		expiresAt: string;
	}): Promise<void> {
		await this.db.run({
			sql: `INSERT INTO price_quotes
				(id, user_id, child_id, course_group_id, planned_start_on, lesson_kind,
				 active_children_count_as_of, lookup_children_count, price_version_id,
				 price_rule_id, schedule_version_id, plusbtext_version_id,
				 pricing_profile_version, price_source, price_mode, contract_kind,
				 duration_source, duration_status, duration_minutes_used,
				 billing_period_code, estimated_missing_duration,
				 requires_admin_confirmation, parent_payable, base_price_cents,
				 manual_override_cents, manual_override_reason, final_price_cents,
				 decision_code, decision_json, status, created_at, expires_at)
				VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			params: [
				input.id,
				input.context.courseGroupId,
				input.plannedStartOn,
				input.context.lessonKind,
				input.activeChildrenCount,
				input.lookupChildrenCount,
				input.decision.priceVersionId,
				input.decision.priceRuleId,
				input.context.scheduleVersionId,
				input.context.plusBTextVersionId,
				input.context.pricingProfileVersion,
				input.decision.priceSource,
				input.decision.priceMode,
				input.decision.contractKind,
				input.decision.durationSource,
				input.decision.durationStatus,
				input.decision.durationMinutesUsed,
				input.decision.billingPeriodCode,
				Number(input.decision.estimatedMissingDuration),
				Number(input.decision.requiresAdminConfirmation),
				Number(input.decision.parentPayable),
				input.decision.basePriceCents,
				input.decision.manualOverrideCents,
				input.decision.manualOverrideReason,
				input.decision.finalPriceCents,
				input.decision.decisionCode,
				JSON.stringify({
					schemaVersion: 1,
					decisionCode: input.decision.decisionCode,
					messageKey: input.decision.messageKey,
					priceVersionId: input.decision.priceVersionId,
					priceRuleId: input.decision.priceRuleId,
					scheduleVersionId: input.context.scheduleVersionId,
					plusBTextVersionId: input.context.plusBTextVersionId,
					pricingProfileVersion: input.context.pricingProfileVersion,
				}),
				input.decision.status,
				input.createdAt,
				input.expiresAt,
			],
		});
	}

	async getQuoteDependencies(quoteId: string): Promise<{
		courseGroupId: string;
		plannedStartOn: string;
		activeChildrenCount: number;
		priceVersionId: string | null;
		scheduleVersionId: string | null;
		plusBTextVersionId: string | null;
		pricingProfileVersion: number | null;
		status: string;
		expiresAt: string;
	} | null> {
		const row = await this.db.first<{
			course_group_id: string;
			planned_start_on: string;
			active_children_count_as_of: number;
			price_version_id: string | null;
			schedule_version_id: string | null;
			plusbtext_version_id: string | null;
			pricing_profile_version: number | null;
			status: string;
			expires_at: string;
		}>({
			sql: `SELECT course_group_id, planned_start_on, active_children_count_as_of,
				price_version_id, schedule_version_id, plusbtext_version_id,
				pricing_profile_version, status, expires_at
				FROM price_quotes WHERE id = ?`,
			params: [quoteId],
		});
		return row
			? {
					courseGroupId: row.course_group_id,
					plannedStartOn: row.planned_start_on,
					activeChildrenCount: row.active_children_count_as_of,
					priceVersionId: row.price_version_id,
					scheduleVersionId: row.schedule_version_id,
					plusBTextVersionId: row.plusbtext_version_id,
					pricingProfileVersion: row.pricing_profile_version,
					status: row.status,
					expiresAt: row.expires_at,
				}
			: null;
	}

	async markQuoteStale(quoteId: string): Promise<void> {
		await this.db.run({
			sql: `UPDATE price_quotes SET status = 'stale'
				WHERE id = ? AND status IN ('quoted', 'needs_admin_review', 'needs_admin_confirmation', 'confirmed')`,
			params: [quoteId],
		});
	}

	async listRepricingTargets(
		courseGroupId: string,
		effectiveOn: string
	): Promise<RepricingTarget[]> {
		const portalRows = await this.db.all<{
			id: string;
			user_id: string;
			contract_kind: 'group_yearly' | 'group_monthly';
			current_base_price_cents: number | null;
			current_price_cents: number | null;
			price_source: 'excel_yearly' | 'excel_monthly' | 'fallback_90' | null;
			price_mode: 'rule_derived' | 'manual_override' | null;
			current_price_version_id: string | null;
			current_price_rule_id: string | null;
			account_status: string | null;
			is_blocked: number | null;
			override_price_cents: number | null;
			reason: string | null;
			actor_user_id: string | null;
		}>({
			sql: `SELECT enrollment.id, enrollment.user_id, enrollment.contract_kind,
				enrollment.current_base_price_cents, enrollment.current_price_cents,
				enrollment.price_source, enrollment.price_mode,
				enrollment.current_price_version_id, enrollment.current_price_rule_id,
				owner.account_status, owner.is_blocked,
				manual.override_price_cents, manual.reason, manual.actor_user_id
				FROM enrollments AS enrollment
				LEFT JOIN users AS owner ON owner.id = enrollment.user_id
				LEFT JOIN price_manual_overrides AS manual ON manual.id = (
					SELECT candidate.id FROM price_manual_overrides AS candidate
					WHERE candidate.enrollment_id = enrollment.id
					ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
				)
				WHERE enrollment.course_group_id = ? AND enrollment.status = 'active'
					AND enrollment.active_from <= ?
					AND (enrollment.active_until IS NULL OR ? < enrollment.active_until)`,
			params: [courseGroupId, effectiveOn, effectiveOn],
		});
		const portalTargets: RepricingTarget[] = portalRows.results.map((row) => ({
			id: row.id,
			targetKind: 'enrollment',
			userId: row.user_id,
			contractKind: row.contract_kind,
			currentBasePriceCents: row.current_base_price_cents,
			currentPriceCents: row.current_price_cents,
			currentPriceSource: row.price_source,
			currentPriceMode: row.price_mode,
			currentPriceVersionId: row.current_price_version_id,
			currentPriceRuleId: row.current_price_rule_id,
			sendEligibilityCode:
				row.account_status !== 'active' || row.is_blocked !== 0
					? 'INACTIVE_PRICE_OWNER'
					: row.current_base_price_cents === null ||
						row.current_price_cents === null ||
						row.price_source === null ||
						row.price_mode === null ||
						row.current_price_version_id === null ||
						row.current_price_rule_id === null
						? 'UNKNOWN_CURRENT_PRICE'
						: 'ELIGIBLE',
			manualOverride:
				row.price_mode === 'manual_override' &&
				row.override_price_cents !== null &&
				row.reason &&
				row.actor_user_id
					? {
							amountCents: row.override_price_cents,
							reason: row.reason,
							actorUserId: row.actor_user_id,
							responsibilityConfirmed: true,
						}
					: undefined,
		}));

		const legacyRows = await this.db.all<{
			id: string;
			user_id: string | null;
			contract_kind: string | null;
			needs_admin_review: number;
			current_base_price_cents: number | null;
			current_price_cents: number | null;
			price_source: string | null;
			price_mode: 'rule_derived' | 'manual_override' | null;
			price_version_id: string | null;
			price_rule_id: string | null;
			account_status: string | null;
			is_blocked: number | null;
			child_owner_user_id: string | null;
		}>({
			sql: `SELECT legacy.id, owner.id AS user_id, legacy.contract_kind,
				legacy.needs_admin_review,
				COALESCE(assignment.base_price_cents, legacy.planned_price_cents)
					AS current_base_price_cents,
				COALESCE(assignment.final_price_cents, legacy.planned_price_cents)
					AS current_price_cents,
				COALESCE(assignment.price_source,
					CASE legacy.price_source WHEN 'yearly' THEN 'excel_yearly'
						WHEN 'monthly' THEN 'excel_monthly' END) AS price_source,
				COALESCE(assignment.price_mode, legacy.price_mode) AS price_mode,
				assignment.price_version_id, assignment.price_rule_id,
				owner.account_status, owner.is_blocked,
				child.owner_user_id AS child_owner_user_id
			FROM legacy_enrollments AS legacy
			JOIN children AS child ON child.id = legacy.child_id
			LEFT JOIN users AS owner ON owner.id = child.owner_user_id
			LEFT JOIN legacy_service_price_assignments AS assignment ON assignment.id = (
				SELECT candidate.id FROM legacy_service_price_assignments AS candidate
				WHERE candidate.legacy_enrollment_id = legacy.id
					AND candidate.status = 'active'
					AND candidate.effective_from <= ?
					AND (candidate.effective_until IS NULL OR ? < candidate.effective_until)
				ORDER BY candidate.effective_from DESC, candidate.created_at DESC LIMIT 1
			)
			WHERE legacy.course_group_id = ? AND legacy.is_current = 1
				AND legacy.is_active_for_occupancy = 1
				AND legacy.lesson_kind IN ('group', 'dance_group')
				AND legacy.represented_by_enrollment_id IS NULL`,
			params: [effectiveOn, effectiveOn, courseGroupId],
		});
		const legacyTargets: RepricingTarget[] = legacyRows.results.map((row) => {
			const contractKind =
				row.contract_kind === 'yearly'
					? 'group_yearly'
					: row.contract_kind === 'monthly'
						? 'group_monthly'
						: null;
			const source =
				row.price_source === 'excel_yearly' || row.price_source === 'excel_monthly'
					? row.price_source
					: null;
			const eligibility: NonNullable<RepricingTarget['sendEligibilityCode']> =
				row.needs_admin_review === 1 ||
				row.child_owner_user_id !== row.user_id ||
				(row.price_mode === 'manual_override' && row.price_version_id === null)
					? 'LEGACY_SERVICE_CONFLICT'
					: !row.user_id
						? 'UNCLAIMED_LEGACY_SERVICE'
						: row.account_status !== 'active' || row.is_blocked !== 0
							? 'INACTIVE_PRICE_OWNER'
							: row.current_base_price_cents === null ||
								row.current_price_cents === null ||
								!source ||
								!row.price_mode ||
								!contractKind
									? 'UNKNOWN_CURRENT_PRICE'
									: 'ELIGIBLE';
			return {
				id: row.id,
				targetKind: 'legacy_enrollment',
				userId: row.user_id,
				contractKind,
				currentBasePriceCents: row.current_base_price_cents,
				currentPriceCents: row.current_price_cents,
				currentPriceSource: source,
				currentPriceMode: row.price_mode,
				currentPriceVersionId: row.price_version_id,
				currentPriceRuleId: row.price_rule_id,
				sendEligibilityCode: eligibility,
			};
		});
		return [...portalTargets, ...legacyTargets];
	}
}
